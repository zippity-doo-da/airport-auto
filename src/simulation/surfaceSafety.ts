import type { AirportConfig } from "./airportConfig";
import { runwayEndPoint, runwayTravelDirection } from "./runwayGeometry";
import type {
  AirportState,
  ConflictPrediction,
  Flight,
  ServiceVehicleState,
  ShiftMetrics,
} from "./types";

/**
 * A read-only, versioned projection of the simulation's movement-area state.
 *
 * This deliberately contains no renderer data and does not make safety
 * decisions. It gives radar, UI, replay, and a future external API one compact
 * view of the same flight poses, route state, holds, and predictions that the
 * simulation already owns.
 */
export interface SurfaceTrack {
  schemaVersion: 1;
  id: number;
  callsign: string;
  aircraft: string;
  x: number;
  y: number;
  headingDegrees: number;
  groundspeedKts: number;
  location: string;
  state:
    | "parked"
    | "taxiing"
    | "hold-short"
    | "controller-hold"
    | "safety-hold"
    | "protected-runway";
  protectedRunway: boolean;
  runwayId?: number;
  surfaceEdgeId?: string;
  surfaceNodeId?: string;
  /** Controller-visible assigned surface intent, never a renderer path. */
  routeIntent: string;
  /** Current clearance state derived from authoritative clearances and holds. */
  clearanceSummary: string;
  /** Fixed-step projection age; zero means this snapshot is current. */
  surveillanceAgeSeconds: number;
}

export interface SurfaceSafetyAdvisory {
  schemaVersion: 1;
  id: string;
  severity: "advisory" | "warning" | "critical";
  kind:
    | "runway-occupancy"
    | "runway-crossing"
    | "runway-incursion"
    | "wrong-surface"
    | "system";
  status: "active" | "resolved";
  flightIds: number[];
  causalTrackIds: string[];
  runwayId?: number;
  etaSeconds: number;
  firstSeenAtSeconds: number;
  lastSeenAtSeconds: number;
  predictedAtSeconds: number;
  /** Presentation-only acknowledgement; never changes protection or movement. */
  acknowledgedAtSeconds?: number;
  resolvedAtSeconds?: number;
  detail: string;
  geometry: SurfaceSafetyGeometry;
}

export interface SurfaceSafetyGeometry {
  kind: "corridor" | "runway" | "system";
  points: Array<[number, number]>;
  width?: number;
}

export interface SurfaceVehicleTrack {
  id: string;
  callsign: string;
  label: string;
  type: ServiceVehicleState["type"];
  x: number;
  y: number;
  headingDegrees: number;
  groundspeedKts: number;
  location: string;
  state: ServiceVehicleState["status"] | "held";
  held: boolean;
  protectedMovementArea: boolean;
  protectedMovementAuthorized: boolean;
  surfaceEdgeId?: string;
  surfaceNodeId?: string;
}

export interface SurfaceSafetySnapshot {
  schemaVersion: 2;
  generatedAtSeconds: number;
  tracks: SurfaceTrack[];
  vehicles: SurfaceVehicleTrack[];
  advisories: SurfaceSafetyAdvisory[];
  protectedRunwayOccupancy: number;
  heldTracks: number;
}

export function surfaceSafetySnapshot(
  config: AirportConfig,
  state: AirportState,
  predictions: ConflictPrediction[],
  metrics: Pick<ShiftMetrics, "collisionAlerts" | "runwayIncursions">,
): SurfaceSafetySnapshot {
  const tracks = state.flights
    .filter(isSurfaceFlight)
    .map((flight) => surfaceTrack(config, flight, state.elapsed))
    .sort((first, second) => {
      const firstPriority = trackPriority(first);
      const secondPriority = trackPriority(second);
      return (
        secondPriority - firstPriority ||
        first.callsign.localeCompare(second.callsign)
      );
    });
  const advisories = [
    ...predictions
      .filter((prediction) => prediction.type !== "separation")
      .map((prediction) =>
        predictionToAdvisory(config, prediction, state.elapsed),
      ),
    ...wrongSurfaceApproachAdvisories(config, state),
  ];
  const vehicles = state.serviceVehicles
    .filter(
      (vehicle) =>
        vehicle.status !== "scheduled" && vehicle.status !== "complete",
    )
    .map((vehicle) => surfaceVehicleTrack(config, vehicle))
    .sort(
      (first, second) =>
        Number(second.held) - Number(first.held) ||
        first.callsign.localeCompare(second.callsign),
    );

  if (metrics.runwayIncursions > 0) {
    advisories.unshift({
      schemaVersion: 1,
      id: `runway-incursion:${metrics.runwayIncursions}`,
      severity: "critical",
      kind: "runway-incursion",
      status: "active",
      flightIds: [],
      causalTrackIds: [],
      etaSeconds: 0,
      firstSeenAtSeconds: state.elapsed,
      lastSeenAtSeconds: state.elapsed,
      predictedAtSeconds: state.elapsed,
      detail: `${metrics.runwayIncursions} recorded runway-incursion ${metrics.runwayIncursions === 1 ? "event" : "events"} in this shift`,
      geometry: { kind: "system", points: [] },
    });
  }
  if (metrics.collisionAlerts > 0) {
    advisories.unshift({
      schemaVersion: 1,
      id: `collision-alert:${metrics.collisionAlerts}`,
      severity: "critical",
      kind: "system",
      status: "active",
      flightIds: [],
      causalTrackIds: [],
      etaSeconds: 0,
      firstSeenAtSeconds: state.elapsed,
      lastSeenAtSeconds: state.elapsed,
      predictedAtSeconds: state.elapsed,
      detail: `${metrics.collisionAlerts} physical-overlap safety ${metrics.collisionAlerts === 1 ? "alert" : "alerts"} recorded in this shift`,
      geometry: { kind: "system", points: [] },
    });
  }

  return {
    schemaVersion: 2,
    generatedAtSeconds: state.elapsed,
    tracks,
    vehicles,
    advisories: advisories.slice(0, 8),
    protectedRunwayOccupancy: tracks.filter((track) => track.protectedRunway)
      .length,
    heldTracks: tracks.filter(
      (track) =>
        track.state === "hold-short" ||
        track.state === "controller-hold" ||
        track.state === "safety-hold",
    ).length,
  };
}

/**
 * Detects short-final geometry that has converged on a different runway or a
 * taxiway centerline. This is advisory-only: it makes the deviation explicit
 * to the controller without changing aircraft movement or inventing a path.
 */
export function wrongSurfaceApproachAdvisories(
  config: AirportConfig,
  state: AirportState,
): SurfaceSafetyAdvisory[] {
  return state.flights.flatMap((flight) => {
    if (flight.phase !== "approach" || flight.motion.onGround) return [];
    const expected = runwayAlignment(
      flight,
      config.runways[flight.runway],
      flight.operatingEnd,
    );
    if (!expected || isExpectedApproachAlignment(expected)) return [];
    const alternative = config.runways
      .flatMap((runway) =>
        ([-1, 1] as const).map((end) => ({
          runway,
          end,
          alignment: runwayAlignment(flight, runway, end),
        })),
      )
      .filter(
        (candidate) =>
          candidate.alignment &&
          (candidate.runway.id !== flight.runway ||
            candidate.end !== flight.operatingEnd) &&
          isCandidateApproachAlignment(candidate.alignment),
      )
      .sort(
        (first, second) =>
          alignmentScore(first.alignment!) - alignmentScore(second.alignment!),
      )[0];
    const taxiway = alternative
      ? undefined
      : alignedTaxiway(config, flight, expected.distanceToThreshold);
    if (!alternative && !taxiway) return [];
    const target = alternative
      ? `RWY ${runwayDesignation(config, alternative.runway.id, alternative.end)}`
      : `taxiway ${taxiway!.name}`;
    const targetGeometry = alternative ? alternative.alignment! : taxiway!;
    return [
      {
        schemaVersion: 1,
        id: `wrong-surface:${flight.id}:${alternative ? `runway-${alternative.runway.id}-${alternative.end}` : `taxiway-${taxiway!.id}`}`,
        severity: "warning",
        kind: "wrong-surface",
        status: "active",
        flightIds: [flight.id],
        causalTrackIds: [`aircraft:${flight.id}`],
        runwayId: alternative?.runway.id,
        etaSeconds: Math.max(
          1,
          Math.round(targetGeometry.distanceToThreshold / 4.5),
        ),
        firstSeenAtSeconds: state.elapsed,
        lastSeenAtSeconds: state.elapsed,
        predictedAtSeconds: state.elapsed,
        geometry: {
          kind: "corridor",
          points: [
            [flight.motion.x, flight.motion.y],
            alternative
              ? [
                  runwayEndPoint(alternative.runway, alternative.end).x,
                  runwayEndPoint(alternative.runway, alternative.end).y,
                ]
              : [flight.motion.x, flight.motion.y],
          ],
          width: Math.max(1, Math.abs(expected.lateralOffset)),
        },
        detail: `${flight.callsign} short final is ${Math.round(expected.headingErrorDegrees)}° / ${expected.lateralOffset.toFixed(1)}u off assigned RWY ${runwayDesignation(config, flight.runway, flight.operatingEnd)} centerline; aligned with ${target}.`,
      },
    ];
  });
}

type ApproachAlignment = {
  distanceToThreshold: number;
  lateralOffset: number;
  headingErrorDegrees: number;
};

function runwayAlignment(
  flight: Flight,
  runway: AirportConfig["runways"][number] | undefined,
  end: -1 | 1,
): ApproachAlignment | undefined {
  if (!runway) return undefined;
  const threshold = runwayEndPoint(runway, end);
  const direction = runwayTravelDirection(runway, end);
  const toThresholdX = threshold.x - flight.motion.x;
  const toThresholdY = threshold.y - flight.motion.y;
  const distanceToThreshold =
    toThresholdX * direction.x + toThresholdY * direction.y;
  const lateralOffset = Math.abs(
    toThresholdX * -direction.y + toThresholdY * direction.x,
  );
  return {
    distanceToThreshold,
    lateralOffset,
    headingErrorDegrees: headingDifferenceDegrees(
      flight.motion.heading,
      Math.atan2(direction.y, direction.x),
    ),
  };
}

function isExpectedApproachAlignment(alignment: ApproachAlignment): boolean {
  return (
    alignment.distanceToThreshold >= 0 &&
    alignment.distanceToThreshold <= 58 &&
    alignment.lateralOffset <= 4.5 &&
    alignment.headingErrorDegrees <= 22
  );
}

function isCandidateApproachAlignment(alignment: ApproachAlignment): boolean {
  return (
    alignment.distanceToThreshold >= 0 &&
    alignment.distanceToThreshold <= 58 &&
    alignment.lateralOffset <= 2.6 &&
    alignment.headingErrorDegrees <= 15
  );
}

function alignedTaxiway(
  config: AirportConfig,
  flight: Flight,
  assignedDistance: number,
): (ApproachAlignment & { id: string; name: string }) | undefined {
  if (assignedDistance < 0 || assignedDistance > 58) return undefined;
  const nodes = new Map(
    config.surfaceGraph.nodes.map((node) => [node.id, node]),
  );
  return config.surfaceGraph.edges
    .filter((edge) => edge.kind === "taxiway" || edge.kind === "apron")
    .flatMap((edge) => {
      const from = nodes.get(edge.from);
      const to = nodes.get(edge.to);
      if (!from || !to) return [];
      const x = to.position[0] - from.position[0];
      const y = to.position[1] - from.position[1];
      const length = Math.hypot(x, y);
      if (length <= 0.01) return [];
      const direction = { x: x / length, y: y / length };
      const relativeX = flight.motion.x - from.position[0];
      const relativeY = flight.motion.y - from.position[1];
      const along = relativeX * direction.x + relativeY * direction.y;
      if (along < 0 || along > length) return [];
      const lateralOffset = Math.abs(
        relativeX * -direction.y + relativeY * direction.x,
      );
      const headingErrorDegrees = Math.min(
        headingDifferenceDegrees(
          flight.motion.heading,
          Math.atan2(direction.y, direction.x),
        ),
        headingDifferenceDegrees(
          flight.motion.heading,
          Math.atan2(-direction.y, -direction.x),
        ),
      );
      if (
        lateralOffset > Math.max(1.8, edge.width * 0.9) ||
        headingErrorDegrees > 14
      )
        return [];
      return [
        {
          id: edge.id,
          name: edge.name || edge.taxiwayId || edge.id,
          distanceToThreshold: assignedDistance,
          lateralOffset,
          headingErrorDegrees,
        },
      ];
    })
    .sort((first, second) => alignmentScore(first) - alignmentScore(second))[0];
}

function alignmentScore(alignment: ApproachAlignment): number {
  return alignment.lateralOffset + alignment.headingErrorDegrees * 0.15;
}

function headingDifferenceDegrees(first: number, second: number): number {
  const difference = Math.abs((((first - second) * 180) / Math.PI) % 360);
  return difference > 180 ? 360 - difference : difference;
}

function runwayDesignation(
  config: AirportConfig,
  runwayId: number,
  end: -1 | 1,
): string {
  return (
    config.runways[runwayId]?.designation?.[end === 1 ? 1 : 0] ??
    String(runwayId + 1)
  );
}

function isSurfaceFlight(flight: Flight): boolean {
  return (
    flight.motion.onGround ||
    flight.phase === "taxi-in" ||
    flight.phase === "taxi-out" ||
    flight.phase === "resting"
  );
}

function surfaceTrack(
  config: AirportConfig,
  flight: Flight,
  generatedAtSeconds: number,
): SurfaceTrack {
  const runway = config.runways[flight.runway];
  const protectedRunway = flight.motion.protectedRunway;
  const location = protectedRunway
    ? `RWY ${runway?.designation?.[flight.operatingEnd === 1 ? 1 : 0] ?? flight.runway + 1}`
    : surfaceLocation(flight);
  const state =
    flight.phase === "resting"
      ? "parked"
      : flight.safetyHold
        ? "safety-hold"
        : flight.crossingHoldRunway !== undefined
          ? "hold-short"
          : flight.controlHold
            ? "controller-hold"
            : protectedRunway
              ? "protected-runway"
              : "taxiing";
  return {
    schemaVersion: 1,
    id: flight.id,
    callsign: flight.callsign,
    aircraft: flight.aircraft,
    x: flight.motion.x,
    y: flight.motion.y,
    headingDegrees: normalizeDegrees(flight.motion.heading),
    groundspeedKts: Math.max(0, Math.round(flight.kinematics.groundSpeedKts)),
    location,
    state,
    protectedRunway,
    runwayId: protectedRunway ? flight.runway : undefined,
    surfaceEdgeId: flight.surfaceEdge,
    surfaceNodeId: flight.surfaceNode,
    routeIntent: surfaceRouteIntent(config, flight),
    clearanceSummary: surfaceClearanceSummary(config, flight),
    surveillanceAgeSeconds: Math.max(
      0,
      generatedAtSeconds - generatedAtSeconds,
    ),
  };
}

function surfaceRouteIntent(config: AirportConfig, flight: Flight): string {
  if (flight.phase === "resting")
    return flight.gateAssignment?.gateRef
      ? `Stand ${flight.gateAssignment.gateRef}`
      : "Stand plan";
  const edgesById = new Map(
    config.surfaceGraph.edges.map((edge) => [edge.id, edge]),
  );
  const edgeNames = (flight.surfaceRouteEdges ?? [])
    .map((edgeId) => edgesById.get(edgeId))
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge))
    .map((edge) => edge.name || edge.taxiwayId || edge.id)
    .filter((name, index, names) => names.indexOf(name) === index)
    .slice(0, 3);
  if (edgeNames.length) return edgeNames.join(" / ");
  return flight.phase === "taxi-in" ? "Gate routing" : "Runway routing";
}

function surfaceClearanceSummary(
  config: AirportConfig,
  flight: Flight,
): string {
  if (flight.safetyHold) return "Safety hold";
  if (flight.controlHold) return "Controller hold";
  if (flight.crossingHoldRunway !== undefined)
    return `Hold short RWY ${runwayLabel(config, flight.crossingHoldRunway)}`;
  if (flight.takeoffCleared)
    return `Takeoff RWY ${runwayLabel(config, flight.runway)}`;
  if (flight.runwayEntryCleared)
    return `Enter RWY ${runwayLabel(config, flight.runway)}`;
  if (flight.pushbackCleared) return "Pushback cleared";
  return "Taxi clearance pending";
}

function runwayLabel(config: AirportConfig, runwayId: number): string {
  const runway = config.runways[runwayId];
  return (
    runway?.designation?.[runway.landingEnd === 1 ? 1 : 0] ??
    String(runwayId + 1)
  );
}

function predictionToAdvisory(
  config: AirportConfig,
  prediction: ConflictPrediction,
  elapsedSeconds: number,
): SurfaceSafetyAdvisory {
  const runway =
    prediction.runway === undefined ? undefined : config.runways[prediction.runway];
  const runwayPoints = runway
    ? ([-1, 1] as const).map((end) => {
        const point = runwayEndPoint(runway, end);
        return [point.x, point.y] as [number, number];
      })
    : [];
  return {
    schemaVersion: 1,
    id: `${prediction.type}:${[...prediction.flights].sort((first, second) => first - second).join("-")}:${prediction.runway ?? "none"}`,
    severity: prediction.severity === "warning" ? "warning" : "advisory",
    kind:
      prediction.type === "crossing" ? "runway-crossing" : "runway-occupancy",
    flightIds: [...prediction.flights],
    causalTrackIds: prediction.flights.map(
      (flightId) => `aircraft:${flightId}`,
    ),
    runwayId: prediction.runway,
    etaSeconds: prediction.etaSeconds,
    status: "active",
    firstSeenAtSeconds: elapsedSeconds,
    lastSeenAtSeconds: elapsedSeconds,
    predictedAtSeconds: elapsedSeconds + prediction.etaSeconds,
    detail: prediction.detail,
    geometry: {
      kind: runway ? "runway" : "system",
      points: runwayPoints,
      width: runway ? Math.max(1, runway.width) : undefined,
    },
  };
}

/** Keeps a bounded, replay-friendly advisory history without changing safety rules. */
export class SurfaceSafetyAdvisoryTracker {
  private readonly advisories = new Map<string, SurfaceSafetyAdvisory>();

  constructor(private readonly resolvedRetentionSeconds = 14) {}

  reset(): void {
    this.advisories.clear();
  }

  update(snapshot: SurfaceSafetySnapshot): SurfaceSafetySnapshot {
    const activeIds = new Set(
      snapshot.advisories.map((advisory) => advisory.id),
    );
    for (const advisory of snapshot.advisories) {
      const previous = this.advisories.get(advisory.id);
      this.advisories.set(
        advisory.id,
        previous
          ? {
              ...advisory,
              status: "active",
              firstSeenAtSeconds: previous.firstSeenAtSeconds,
              lastSeenAtSeconds: snapshot.generatedAtSeconds,
              predictedAtSeconds:
                snapshot.generatedAtSeconds + advisory.etaSeconds,
            }
          : advisory,
      );
    }
    for (const [id, advisory] of this.advisories) {
      if (activeIds.has(id) || advisory.status === "resolved") continue;
      this.advisories.set(id, {
        ...advisory,
        status: "resolved",
        resolvedAtSeconds: snapshot.generatedAtSeconds,
      });
    }
    const advisoryHistory = [...this.advisories.values()]
      .filter(
        (advisory) =>
          advisory.status === "active" ||
          snapshot.generatedAtSeconds -
            (advisory.resolvedAtSeconds ?? snapshot.generatedAtSeconds) <=
            this.resolvedRetentionSeconds,
      )
      .sort((first, second) => {
        const severity = { critical: 3, warning: 2, advisory: 1 } as const;
        return (
          severity[second.severity] - severity[first.severity] ||
          Number(first.status === "resolved") -
            Number(second.status === "resolved") ||
          first.firstSeenAtSeconds - second.firstSeenAtSeconds
        );
      })
      .slice(0, 8);
    for (const [id, advisory] of this.advisories) {
      if (
        advisory.status === "resolved" &&
        snapshot.generatedAtSeconds -
          (advisory.resolvedAtSeconds ?? snapshot.generatedAtSeconds) >
          this.resolvedRetentionSeconds
      )
        this.advisories.delete(id);
    }
    return { ...snapshot, advisories: advisoryHistory };
  }
}

function surfaceVehicleTrack(
  config: AirportConfig,
  vehicle: ServiceVehicleState,
): SurfaceVehicleTrack {
  const edge = vehicle.currentEdge
    ? config.surfaceGraph.edges.find(
        (candidate) => candidate.id === vehicle.currentEdge,
      )
    : undefined;
  const location = vehicle.protectedMovementArea
    ? edge?.runwayId === undefined
      ? "Protected crossing"
      : `RWY ${config.runways[edge.runwayId]?.designation?.[0] ?? edge.runwayId + 1}`
    : (edge?.name ?? edge?.taxiwayId ?? vehicle.zoneId);
  return {
    id: vehicle.id,
    callsign: vehicle.callsign,
    label: vehicle.label,
    type: vehicle.type,
    x: vehicle.x,
    y: vehicle.y,
    headingDegrees: normalizeDegrees(vehicle.heading),
    groundspeedKts: Math.max(0, Math.round(vehicle.groundSpeedMps * 1.94384)),
    location,
    state: vehicle.held ? "held" : vehicle.status,
    held: vehicle.held,
    protectedMovementArea: vehicle.protectedMovementArea,
    protectedMovementAuthorized: vehicle.protectedMovementAuthorized,
    surfaceEdgeId: vehicle.currentEdge,
    surfaceNodeId: vehicle.currentNode,
  };
}

function trackPriority(track: SurfaceTrack): number {
  if (track.state === "safety-hold") return 6;
  if (track.state === "hold-short") return 5;
  if (track.protectedRunway) return 4;
  if (track.state === "controller-hold") return 3;
  if (track.state === "taxiing") return 2;
  return 1;
}

function normalizeDegrees(radians: number): number {
  return Math.round(((((radians * 180) / Math.PI) % 360) + 360) % 360);
}

function surfaceLocation(flight: Flight): string {
  if (flight.taxiway) {
    return /^(?:TWY|Taxiway|Ramp|Apron)\b/i.test(flight.taxiway)
      ? flight.taxiway
      : `TWY ${flight.taxiway}`;
  }
  return (
    flight.gateAssignment?.gateRef ??
    (flight.phase === "resting" ? "Stand" : "Surface route")
  );
}

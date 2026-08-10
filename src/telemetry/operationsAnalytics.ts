import type { OperationQueueSnapshot } from "../simulation/operationQueues";
import {
  digitalClearanceSnapshot,
  type DigitalClearanceMessage,
  type DigitalClearanceStatus,
} from "../simulation/digitalClearances";
import type {
  SurfaceSafetyAdvisory,
  SurfaceSafetySnapshot,
} from "../simulation/surfaceSafety";
import type {
  AirportState,
  ConflictPrediction,
  Flight,
  FlightPhase,
  ShiftMetrics,
  TrafficFlowConstraintCategory,
  TrafficFlowEntry,
  TrafficFlowRevisionAttribution,
  TrafficFlowRevisionCauseCode,
} from "../simulation/types";
import { trafficFlowRevisionAttribution } from "../simulation/trafficFlowManagement";

export const OPERATIONS_ANALYTICS_SCHEMA_VERSION = 6 as const;
export const OPERATIONS_EXPORT_SCHEMA_VERSION = 6 as const;

export const OPERATIONS_EXPORT_DATASETS = [
  "flights",
  "commands",
  "events",
  "queues",
  "delays",
  "runways",
  "taxiways",
  "shift-metrics",
  "flight-recorder",
  "conflicts",
  "surface-advisories",
  "flow-revisions",
  "digital-clearances",
] as const;

export type OperationsExportDataset =
  (typeof OPERATIONS_EXPORT_DATASETS)[number];

export interface OperationsAirportDescriptor {
  code: string;
  name: string;
  scope: string;
  runways: Array<{
    id: number;
    label: string;
    center: [number, number];
    headingRadians: number;
    length: number;
  }>;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface FlightDataSample {
  elapsedSeconds: number;
  flightId: number;
  callsign: string;
  phase: FlightPhase;
  runwayId: number;
  taxiway: string | null;
  x: number;
  y: number;
  z: number;
  headingDegrees: number;
  pitchDegrees: number;
  onGround: boolean;
  altitudeFt: number;
  airspeedKts: number;
  groundSpeedKts: number;
  verticalSpeedFpm: number;
  accelerationMps2: number;
  fuelPercent: number;
  held: boolean;
  holdReason: string | null;
}

export interface FlightAnalyticsRecord {
  flightId: number;
  callsign: string;
  registration: string;
  aircraft: string;
  airline: string;
  service: string;
  category: string;
  wakeClass: string;
  origin: string;
  destination: string;
  routes: string[];
  firstSeenSeconds: number;
  lastSeenSeconds: number;
  sampleCount: number;
  delaySeconds: number;
  airborneSeconds: number;
  surfaceSeconds: number;
  observedArrivalOperation: boolean;
  observedDepartureOperation: boolean;
  latestPhase: FlightPhase;
}

export interface SurfaceUtilizationRecord {
  id: string;
  label: string;
  occupiedSeconds: number;
  movements: number;
  visits: number;
  sharePercent: number;
  lastUsedSeconds: number | null;
}

export interface ConflictHeatCell {
  id: string;
  x: number;
  z: number;
  count: number;
  warningCount: number;
  cautionCount: number;
  runwayCount: number;
  crossingCount: number;
  separationCount: number;
  lastSeenSeconds: number;
}

export interface QueueAnalyticsRecord {
  category: string;
  sampledSeconds: number;
  entrySeconds: number;
  maximumEntries: number;
  maximumWaitSeconds: number;
  averageEntries: number;
  averageWaitSeconds: number;
}

export interface SurfaceSafetyAnalyticsRecord {
  id: string;
  kind: SurfaceSafetyAdvisory["kind"];
  highestSeverity: SurfaceSafetyAdvisory["severity"];
  runwayId: number | null;
  flightIds: number[];
  firstSeenSeconds: number;
  lastSeenSeconds: number;
  resolvedAtSeconds: number | null;
  active: boolean;
  activations: number;
  activeSeconds: number;
  acknowledged: boolean;
  latestDetail: string;
}

export interface TrafficFlowRevisionAnalyticsRecord {
  schemaVersion: 2;
  id: string;
  entryId: string;
  kind: "initial" | "revision";
  direction: TrafficFlowEntry["direction"];
  status: TrafficFlowEntry["status"];
  atSeconds: number;
  previousReleaseSlotSeconds: number;
  releaseSlotSeconds: number;
  shiftSeconds: number;
  category: TrafficFlowConstraintCategory;
  causeCode: TrafficFlowRevisionCauseCode;
  source: TrafficFlowRevisionAttribution["source"];
  relatedFlightId: number | null;
  relatedRunwayId: number | null;
  reason: string;
  flightId: number | null;
  callsign: string | null;
  runwayId: number | null;
}

export interface TrafficFlowCauseAnalyticsRecord {
  category: TrafficFlowConstraintCategory;
  initialAssignments: number;
  revisions: number;
  totalShiftSeconds: number;
  delayAddedSeconds: number;
  delayRecoveredSeconds: number;
  largestAbsoluteShiftSeconds: number;
  latestAtSeconds: number;
  latestReason: string;
}

export interface DigitalClearanceAnalyticsRecord {
  schemaVersion: 4;
  id: string;
  commandId: string;
  responseCommandId: string | null;
  flightId: number;
  callsign: string;
  kind: DigitalClearanceMessage["kind"];
  status: DigitalClearanceStatus;
  authority: string;
  channel: DigitalClearanceMessage["capability"]["channel"];
  deskAccess: DigitalClearanceMessage["capability"]["deskAccess"];
  responseMode: DigitalClearanceMessage["capability"]["responseMode"];
  aircraftSupport: DigitalClearanceMessage["capability"]["aircraftSupport"];
  revision: number;
  createdAtSeconds: number;
  issuedAtSeconds: number | null;
  deliveredAtSeconds: number | null;
  responseDueSeconds: number | null;
  respondedAtSeconds: number | null;
  expiresAtSeconds: number | null;
  responseSeconds: number | null;
  warningCount: number;
  route: string[];
  parameters: Record<string, string | number>;
  causalEventIds: string[];
}

export interface DigitalClearanceAnalyticsSummary {
  total: number;
  active: number;
  delivered: number;
  responded: number;
  unable: number;
  timedOut: number;
  cancelled: number;
  averageResponseSeconds: number | null;
  byStatus: Record<DigitalClearanceStatus, number>;
  byKind: Partial<Record<DigitalClearanceMessage["kind"], number>>;
}

export interface OperationsAnalyticsSnapshot {
  schemaVersion: typeof OPERATIONS_ANALYTICS_SCHEMA_VERSION;
  sessionId: string;
  generatedAtSeconds: number;
  airport: OperationsAirportDescriptor;
  window: {
    startedAtSeconds: number;
    durationSeconds: number;
    sampleIntervalSeconds: number;
    retainedSamples: number;
    maximumSamplesPerFlight: number;
  };
  summary: {
    activeFlights: number;
    observedFlights: number;
    arrivals: number;
    departures: number;
    movementsPerHour: number;
    longestQueueSeconds: number;
    activeConflicts: number;
    activeSurfaceAdvisories: number;
    surfaceAdvisoryEpisodes: number;
    safetyEvents: number;
    fuelBurnKg: number;
    holdingFuelBurnKg: number;
    flowEntriesObserved: number;
    flowSlotRevisions: number;
    largestFlowSlotShiftSeconds: number;
    digitalClearancesObserved: number;
    digitalClearanceTimeouts: number;
  };
  flights: FlightAnalyticsRecord[];
  selectedFlightId: number | null;
  selectedFlightSamples: FlightDataSample[];
  runwayUtilization: SurfaceUtilizationRecord[];
  taxiwayUtilization: SurfaceUtilizationRecord[];
  queueUtilization: QueueAnalyticsRecord[];
  conflictHeatmap: ConflictHeatCell[];
  surfaceSafetyAdvisories: SurfaceSafetyAnalyticsRecord[];
  trafficFlowRevisions: TrafficFlowRevisionAnalyticsRecord[];
  trafficFlowCauses: TrafficFlowCauseAnalyticsRecord[];
  digitalClearances: DigitalClearanceAnalyticsRecord[];
  digitalClearanceSummary: DigitalClearanceAnalyticsSummary;
  metrics: ShiftMetrics;
  disclosure: {
    navigationUse: false;
    localOnly: true;
    cloudUpload: false;
    shareableByDefault: false;
    retention: string;
    privacy: string;
  };
}

export interface OperationsExportBundle {
  schemaVersion: typeof OPERATIONS_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  analytics: OperationsAnalyticsSnapshot;
  flightRecorder: FlightDataSample[];
  commands: unknown[];
  events: unknown[];
  queues: OperationQueueSnapshot;
  disclosure: OperationsAnalyticsSnapshot["disclosure"];
}

interface MutableFlightRecord extends Omit<FlightAnalyticsRecord, "routes"> {
  routes: Set<string>;
}

interface MutableSurfaceRecord {
  id: string;
  label: string;
  occupiedSeconds: number;
  movements: number;
  visits: number;
  lastUsedSeconds: number | null;
}

interface MutableQueueRecord {
  category: string;
  sampledSeconds: number;
  entrySeconds: number;
  maximumEntries: number;
  totalWaitSeconds: number;
  maximumWaitSeconds: number;
}

type MutableSurfaceSafetyRecord = SurfaceSafetyAnalyticsRecord;

interface RecordInputs {
  state: AirportState;
  predictions: readonly ConflictPrediction[];
  queues: OperationQueueSnapshot;
  metrics: ShiftMetrics;
  surfaceSafety: SurfaceSafetySnapshot;
}

const SAMPLE_INTERVAL_SECONDS = 1;
const MAXIMUM_SAMPLES_PER_FLIGHT = 7_200;
const MAXIMUM_RETAINED_FLIGHTS = 512;
const MAXIMUM_CONFLICT_CELLS = 256;
const MAXIMUM_SURFACE_SAFETY_RECORDS = 512;
const MAXIMUM_DIGITAL_CLEARANCE_RECORDS = 2_048;
const MAXIMUM_TRAFFIC_FLOW_REVISIONS = 2_048;
const CONFLICT_CELL_SIZE = 12;

const GROUND_PHASES = new Set<FlightPhase>([
  "taxi-in",
  "resting",
  "taxi-out",
  "takeoff",
]);

function rounded(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function degrees(radians: number): number {
  return ((radians * 180) / Math.PI + 360) % 360;
}

function routeLabel(flight: Flight): string {
  return `${flight.origin} → ${flight.destination}`;
}

function holdReason(flight: Flight): string | null {
  if (flight.safetyHold) return flight.safetyHoldReason ?? "Safety hold";
  if (flight.crossingHoldRunway !== undefined)
    return `Hold short runway ${flight.crossingHoldRunway}`;
  if (flight.controlHold) return "Controller hold";
  if (flight.automaticHold)
    return flight.automaticHoldReason ?? "Automatic hold";
  return null;
}

function flightSample(
  flight: Flight,
  elapsedSeconds: number,
): FlightDataSample {
  const reason = holdReason(flight);
  return {
    elapsedSeconds,
    flightId: flight.id,
    callsign: flight.callsign,
    phase: flight.phase,
    runwayId: flight.runway,
    taxiway: flight.taxiway ?? null,
    x: rounded(flight.motion.x, 3),
    y: rounded(flight.motion.y, 3),
    z: rounded(flight.motion.z, 3),
    headingDegrees: rounded(degrees(flight.motion.heading), 1),
    pitchDegrees: rounded((flight.motion.pitch * 180) / Math.PI, 1),
    onGround: flight.motion.onGround,
    altitudeFt: rounded(flight.kinematics.altitudeFt, 0),
    airspeedKts: rounded(flight.kinematics.airspeedKts, 1),
    groundSpeedKts: rounded(flight.kinematics.groundSpeedKts, 1),
    verticalSpeedFpm: rounded(flight.kinematics.verticalSpeedFpm, 0),
    accelerationMps2: rounded(flight.kinematics.accelerationMps2, 2),
    fuelPercent: rounded(flight.kinematics.fuelPercent, 2),
    held: reason !== null,
    holdReason: reason,
  };
}

function cloneMetrics(metrics: ShiftMetrics): ShiftMetrics {
  return { ...metrics };
}

export function isOperationsExportDataset(
  value: unknown,
): value is OperationsExportDataset {
  return (
    typeof value === "string" &&
    (OPERATIONS_EXPORT_DATASETS as readonly string[]).includes(value)
  );
}

export class OperationsAnalyticsRecorder {
  private sessionId: string;
  private airport: OperationsAirportDescriptor;
  private startedAtSeconds = 0;
  private lastSampleSecond = -Infinity;
  private retainedSamples = 0;
  private flights = new Map<number, MutableFlightRecord>();
  private flightSamples = new Map<number, FlightDataSample[]>();
  private runwayUtilization = new Map<number, MutableSurfaceRecord>();
  private taxiwayUtilization = new Map<string, MutableSurfaceRecord>();
  private queueUtilization = new Map<string, MutableQueueRecord>();
  private conflictCells = new Map<string, ConflictHeatCell>();
  private surfaceSafetyRecords = new Map<string, MutableSurfaceSafetyRecord>();
  private trafficFlowRevisionRecords = new Map<
    string,
    TrafficFlowRevisionAnalyticsRecord
  >();
  private digitalClearanceRecords = new Map<
    string,
    DigitalClearanceAnalyticsRecord
  >();
  private lastFlowReleaseSlotByEntry = new Map<string, number>();
  private previousPhase = new Map<number, FlightPhase>();
  private previousTaxiway = new Map<number, string | null>();
  private latestMetrics: ShiftMetrics;

  constructor(
    sessionId: string,
    airport: OperationsAirportDescriptor,
    initialMetrics: ShiftMetrics,
  ) {
    this.sessionId = sessionId;
    this.airport = structuredClone(airport);
    this.latestMetrics = cloneMetrics(initialMetrics);
    this.initializeRunways();
  }

  reset(
    sessionId: string,
    airport: OperationsAirportDescriptor,
    initialMetrics: ShiftMetrics,
    startedAtSeconds = 0,
  ): void {
    this.sessionId = sessionId;
    this.airport = structuredClone(airport);
    this.startedAtSeconds = startedAtSeconds;
    this.lastSampleSecond = -Infinity;
    this.retainedSamples = 0;
    this.flights.clear();
    this.flightSamples.clear();
    this.runwayUtilization.clear();
    this.taxiwayUtilization.clear();
    this.queueUtilization.clear();
    this.conflictCells.clear();
    this.surfaceSafetyRecords.clear();
    this.trafficFlowRevisionRecords.clear();
    this.digitalClearanceRecords.clear();
    this.lastFlowReleaseSlotByEntry.clear();
    this.previousPhase.clear();
    this.previousTaxiway.clear();
    this.latestMetrics = cloneMetrics(initialMetrics);
    this.initializeRunways();
  }

  record(inputs: RecordInputs): boolean {
    const elapsedSeconds = Math.floor(inputs.state.elapsed);
    if (elapsedSeconds < this.lastSampleSecond + SAMPLE_INTERVAL_SECONDS)
      return false;
    const sampleDelta = Number.isFinite(this.lastSampleSecond)
      ? Math.max(
          SAMPLE_INTERVAL_SECONDS,
          Math.min(5, elapsedSeconds - this.lastSampleSecond),
        )
      : SAMPLE_INTERVAL_SECONDS;
    this.lastSampleSecond = elapsedSeconds;
    this.retainedSamples += 1;
    this.latestMetrics = cloneMetrics(inputs.metrics);

    const flightById = new Map(
      inputs.state.flights.map((flight) => [flight.id, flight]),
    );
    for (const flight of inputs.state.flights)
      this.recordFlight(flight, elapsedSeconds, sampleDelta);
    this.recordQueues(inputs.queues, sampleDelta);
    this.recordConflicts(inputs.predictions, flightById, elapsedSeconds);
    this.recordSurfaceSafety(inputs.surfaceSafety, sampleDelta);
    this.recordTrafficFlow(inputs.state);
    this.recordDigitalClearances(inputs.state);
    this.pruneCompletedFlights(inputs.state.flights);
    return true;
  }

  snapshot(
    state: AirportState,
    queues: OperationQueueSnapshot,
    selectedFlightId: number | null = null,
  ): OperationsAnalyticsSnapshot {
    const durationSeconds = Math.max(0, state.elapsed - this.startedAtSeconds);
    const totalMovements = state.arrivals + state.departures;
    const flights = [...this.flights.values()]
      .map((entry) => ({ ...entry, routes: [...entry.routes] }))
      .sort(
        (first, second) =>
          second.lastSeenSeconds - first.lastSeenSeconds ||
          first.callsign.localeCompare(second.callsign),
      );
    const resolvedFlightId =
      selectedFlightId !== null && this.flightSamples.has(selectedFlightId)
        ? selectedFlightId
        : (state.flights[0]?.id ?? flights[0]?.flightId ?? null);
    const trafficFlowRevisions = [...this.trafficFlowRevisionRecords.values()]
      .map((entry) => ({ ...entry }))
      .sort(
        (first, second) =>
          second.atSeconds - first.atSeconds ||
          first.id.localeCompare(second.id),
      );
    const trafficFlowCauses = trafficFlowCauseRows(trafficFlowRevisions);
    const changedFlowSlots = trafficFlowRevisions.filter(
      (entry) => entry.kind === "revision",
    );
    const digitalClearances = [...this.digitalClearanceRecords.values()]
      .map((entry) => ({
        ...entry,
        route: [...entry.route],
        parameters: { ...entry.parameters },
        causalEventIds: [...entry.causalEventIds],
      }))
      .sort(
        (first, second) =>
          second.createdAtSeconds - first.createdAtSeconds ||
          first.id.localeCompare(second.id),
      );
    const digitalSummary = digitalClearanceAnalyticsSummary(digitalClearances);
    return {
      schemaVersion: OPERATIONS_ANALYTICS_SCHEMA_VERSION,
      sessionId: this.sessionId,
      generatedAtSeconds: rounded(state.elapsed),
      airport: structuredClone(this.airport),
      window: {
        startedAtSeconds: this.startedAtSeconds,
        durationSeconds: rounded(durationSeconds),
        sampleIntervalSeconds: SAMPLE_INTERVAL_SECONDS,
        retainedSamples: this.retainedSamples,
        maximumSamplesPerFlight: MAXIMUM_SAMPLES_PER_FLIGHT,
      },
      summary: {
        activeFlights: state.flights.length,
        observedFlights: flights.length,
        arrivals: state.arrivals,
        departures: state.departures,
        movementsPerHour: rounded(
          totalMovements / Math.max(1 / 60, durationSeconds / 3_600),
          1,
        ),
        longestQueueSeconds: rounded(queues.longestWaitSeconds, 1),
        activeConflicts: [...this.conflictCells.values()].filter(
          (cell) => state.elapsed - cell.lastSeenSeconds <= 2,
        ).length,
        activeSurfaceAdvisories: [...this.surfaceSafetyRecords.values()].filter(
          (entry) => entry.active,
        ).length,
        surfaceAdvisoryEpisodes: [...this.surfaceSafetyRecords.values()].reduce(
          (sum, entry) => sum + entry.activations,
          0,
        ),
        safetyEvents:
          this.latestMetrics.collisionAlerts +
          this.latestMetrics.runwayIncursions +
          this.latestMetrics.unexplainedPauses,
        fuelBurnKg: rounded(this.latestMetrics.fuelBurnKg, 1),
        holdingFuelBurnKg: rounded(this.latestMetrics.holdingFuelBurnKg, 1),
        flowEntriesObserved: new Set(
          trafficFlowRevisions.map((entry) => entry.entryId),
        ).size,
        flowSlotRevisions: changedFlowSlots.length,
        largestFlowSlotShiftSeconds: rounded(
          Math.max(
            0,
            ...changedFlowSlots.map((entry) => Math.abs(entry.shiftSeconds)),
          ),
          1,
        ),
        digitalClearancesObserved: digitalSummary.total,
        digitalClearanceTimeouts: digitalSummary.timedOut,
      },
      flights,
      selectedFlightId: resolvedFlightId,
      selectedFlightSamples:
        resolvedFlightId === null
          ? []
          : (this.flightSamples.get(resolvedFlightId) ?? []).map((sample) => ({
              ...sample,
            })),
      runwayUtilization: this.surfaceRows(this.runwayUtilization),
      taxiwayUtilization: this.surfaceRows(this.taxiwayUtilization),
      queueUtilization: [...this.queueUtilization.values()]
        .map((entry) => ({
          category: entry.category,
          sampledSeconds: entry.sampledSeconds,
          entrySeconds: entry.entrySeconds,
          maximumEntries: entry.maximumEntries,
          maximumWaitSeconds: rounded(entry.maximumWaitSeconds, 1),
          averageEntries: rounded(
            entry.entrySeconds / Math.max(1, entry.sampledSeconds),
            2,
          ),
          averageWaitSeconds: rounded(
            entry.totalWaitSeconds / Math.max(1, entry.entrySeconds),
            1,
          ),
        }))
        .sort(
          (first, second) =>
            second.entrySeconds - first.entrySeconds ||
            first.category.localeCompare(second.category),
        ),
      conflictHeatmap: [...this.conflictCells.values()]
        .map((cell) => ({ ...cell }))
        .sort(
          (first, second) =>
            second.count - first.count ||
            second.lastSeenSeconds - first.lastSeenSeconds,
        ),
      surfaceSafetyAdvisories: [...this.surfaceSafetyRecords.values()]
        .map((entry) => ({
          ...entry,
          flightIds: [...entry.flightIds],
          activeSeconds: rounded(entry.activeSeconds, 1),
        }))
        .sort(
          (first, second) =>
            Number(second.active) - Number(first.active) ||
            second.lastSeenSeconds - first.lastSeenSeconds ||
            first.id.localeCompare(second.id),
        ),
      trafficFlowRevisions,
      trafficFlowCauses,
      digitalClearances,
      digitalClearanceSummary: digitalSummary,
      metrics: cloneMetrics(this.latestMetrics),
      disclosure: {
        navigationUse: false,
        localOnly: true,
        cloudUpload: false,
        shareableByDefault: false,
        retention: `Compact one-second samples; at most ${MAXIMUM_SAMPLES_PER_FLIGHT.toLocaleString()} samples per aircraft and ${MAXIMUM_RETAINED_FLIGHTS} observed aircraft per local session.`,
        privacy:
          "Exports remain in this browser unless the player explicitly downloads and shares them. Fictional callsigns and registrations are included; controller/client/actor identifiers may appear in command and event exports. Credentials, gateway tokens, and microphone data are never collected.",
      },
    };
  }

  allFlightSamples(): FlightDataSample[] {
    return [...this.flightSamples.values()].flatMap((samples) =>
      samples.map((sample) => ({ ...sample })),
    );
  }

  private initializeRunways(): void {
    for (const runway of this.airport.runways) {
      this.runwayUtilization.set(runway.id, {
        id: String(runway.id),
        label: runway.label,
        occupiedSeconds: 0,
        movements: 0,
        visits: 0,
        lastUsedSeconds: null,
      });
    }
  }

  private recordFlight(
    flight: Flight,
    elapsedSeconds: number,
    sampleDelta: number,
  ): void {
    const existing = this.flights.get(flight.id);
    const record: MutableFlightRecord = existing ?? {
      flightId: flight.id,
      callsign: flight.callsign,
      registration: flight.registration,
      aircraft: flight.aircraft,
      airline: flight.airline,
      service: flight.service,
      category: flight.category,
      wakeClass: flight.wakeClass,
      origin: flight.origin,
      destination: flight.destination,
      routes: new Set<string>(),
      firstSeenSeconds: elapsedSeconds,
      lastSeenSeconds: elapsedSeconds,
      sampleCount: 0,
      delaySeconds: 0,
      airborneSeconds: 0,
      surfaceSeconds: 0,
      observedArrivalOperation: false,
      observedDepartureOperation: false,
      latestPhase: flight.phase,
    };
    record.callsign = flight.callsign;
    record.registration = flight.registration;
    record.aircraft = flight.aircraft;
    record.airline = flight.airline;
    record.service = flight.service;
    record.category = flight.category;
    record.wakeClass = flight.wakeClass;
    record.origin = flight.origin;
    record.destination = flight.destination;
    record.routes.add(routeLabel(flight));
    record.lastSeenSeconds = elapsedSeconds;
    record.sampleCount += 1;
    record.latestPhase = flight.phase;
    record.observedArrivalOperation ||=
      flight.phase === "approach" ||
      flight.phase === "landing" ||
      flight.phase === "taxi-in";
    record.observedDepartureOperation ||=
      flight.phase === "taxi-out" || flight.phase === "takeoff";
    if (holdReason(flight)) record.delaySeconds += sampleDelta;
    if (flight.motion.onGround || GROUND_PHASES.has(flight.phase))
      record.surfaceSeconds += sampleDelta;
    else record.airborneSeconds += sampleDelta;
    this.flights.set(flight.id, record);

    const samples = this.flightSamples.get(flight.id) ?? [];
    samples.push(flightSample(flight, elapsedSeconds));
    if (samples.length > MAXIMUM_SAMPLES_PER_FLIGHT)
      samples.splice(0, samples.length - MAXIMUM_SAMPLES_PER_FLIGHT);
    this.flightSamples.set(flight.id, samples);

    const previousPhase = this.previousPhase.get(flight.id);
    const runway = this.runwayUtilization.get(flight.runway);
    const runwayOccupied =
      flight.motion.protectedRunway ||
      flight.phase === "landing" ||
      flight.phase === "takeoff";
    if (runway && runwayOccupied) {
      runway.occupiedSeconds += sampleDelta;
      runway.lastUsedSeconds = elapsedSeconds;
      if (
        previousPhase !== flight.phase &&
        (flight.phase === "landing" || flight.phase === "takeoff")
      ) {
        runway.movements += 1;
        runway.visits += 1;
      }
    }
    this.previousPhase.set(flight.id, flight.phase);

    const taxiway = flight.taxiway?.trim() || null;
    if (
      taxiway &&
      flight.motion.onGround &&
      (flight.phase === "taxi-in" || flight.phase === "taxi-out")
    ) {
      const entry = this.taxiwayUtilization.get(taxiway) ?? {
        id: taxiway,
        label: taxiway,
        occupiedSeconds: 0,
        movements: 0,
        visits: 0,
        lastUsedSeconds: null,
      };
      entry.occupiedSeconds += sampleDelta;
      entry.lastUsedSeconds = elapsedSeconds;
      if (this.previousTaxiway.get(flight.id) !== taxiway) entry.visits += 1;
      this.taxiwayUtilization.set(taxiway, entry);
    }
    this.previousTaxiway.set(flight.id, taxiway);
  }

  private recordQueues(
    queues: OperationQueueSnapshot,
    sampleDelta: number,
  ): void {
    const byCategory = new Map<string, typeof queues.entries>();
    for (const entry of queues.entries) {
      const entries = byCategory.get(entry.category) ?? [];
      entries.push(entry);
      byCategory.set(entry.category, entries);
    }
    const categories = new Set([
      ...this.queueUtilization.keys(),
      ...Object.keys(queues.counts),
    ]);
    for (const category of categories) {
      const entries = byCategory.get(category) ?? [];
      const record = this.queueUtilization.get(category) ?? {
        category,
        sampledSeconds: 0,
        entrySeconds: 0,
        maximumEntries: 0,
        totalWaitSeconds: 0,
        maximumWaitSeconds: 0,
      };
      record.sampledSeconds += sampleDelta;
      record.entrySeconds += entries.length * sampleDelta;
      record.maximumEntries = Math.max(record.maximumEntries, entries.length);
      record.totalWaitSeconds += entries.reduce(
        (sum, entry) => sum + entry.waitSeconds * sampleDelta,
        0,
      );
      record.maximumWaitSeconds = Math.max(
        record.maximumWaitSeconds,
        ...entries.map((entry) => entry.waitSeconds),
        0,
      );
      this.queueUtilization.set(category, record);
    }
  }

  private recordConflicts(
    predictions: readonly ConflictPrediction[],
    flights: ReadonlyMap<number, Flight>,
    elapsedSeconds: number,
  ): void {
    for (const prediction of predictions) {
      const involved = prediction.flights.flatMap(
        (flightId) => flights.get(flightId) ?? [],
      );
      if (involved.length === 0) continue;
      const x =
        involved.reduce((sum, flight) => sum + flight.motion.x, 0) /
        involved.length;
      const z =
        involved.reduce((sum, flight) => sum + flight.motion.z, 0) /
        involved.length;
      const cellX = Math.round(x / CONFLICT_CELL_SIZE);
      const cellZ = Math.round(z / CONFLICT_CELL_SIZE);
      const id = `${cellX}:${cellZ}`;
      const cell = this.conflictCells.get(id) ?? {
        id,
        x: cellX * CONFLICT_CELL_SIZE,
        z: cellZ * CONFLICT_CELL_SIZE,
        count: 0,
        warningCount: 0,
        cautionCount: 0,
        runwayCount: 0,
        crossingCount: 0,
        separationCount: 0,
        lastSeenSeconds: elapsedSeconds,
      };
      cell.count += 1;
      cell.warningCount += prediction.severity === "warning" ? 1 : 0;
      cell.cautionCount += prediction.severity === "caution" ? 1 : 0;
      cell.runwayCount += prediction.type === "runway" ? 1 : 0;
      cell.crossingCount += prediction.type === "crossing" ? 1 : 0;
      cell.separationCount += prediction.type === "separation" ? 1 : 0;
      cell.lastSeenSeconds = elapsedSeconds;
      this.conflictCells.set(id, cell);
    }
    if (this.conflictCells.size > MAXIMUM_CONFLICT_CELLS) {
      const retained = [...this.conflictCells.values()]
        .sort(
          (first, second) =>
            second.count - first.count ||
            second.lastSeenSeconds - first.lastSeenSeconds,
        )
        .slice(0, MAXIMUM_CONFLICT_CELLS);
      this.conflictCells = new Map(retained.map((cell) => [cell.id, cell]));
    }
  }

  private recordSurfaceSafety(
    snapshot: SurfaceSafetySnapshot,
    sampleDelta: number,
  ): void {
    const observedIds = new Set<string>();
    for (const advisory of snapshot.advisories) {
      observedIds.add(advisory.id);
      const previous = this.surfaceSafetyRecords.get(advisory.id);
      const active = advisory.status === "active";
      const next: MutableSurfaceSafetyRecord = previous ?? {
        id: advisory.id,
        kind: advisory.kind,
        highestSeverity: advisory.severity,
        runwayId: advisory.runwayId ?? null,
        flightIds: [...advisory.flightIds],
        firstSeenSeconds: advisory.firstSeenAtSeconds,
        lastSeenSeconds: advisory.lastSeenAtSeconds,
        resolvedAtSeconds: advisory.resolvedAtSeconds ?? null,
        active,
        activations: active ? 1 : 0,
        activeSeconds: 0,
        acknowledged: advisory.acknowledgedAtSeconds !== undefined,
        latestDetail: advisory.detail,
      };
      if (previous && active && !previous.active) next.activations += 1;
      next.kind = advisory.kind;
      next.highestSeverity = higherSurfaceSeverity(
        next.highestSeverity,
        advisory.severity,
      );
      next.runwayId = advisory.runwayId ?? next.runwayId;
      next.flightIds = [
        ...new Set([...next.flightIds, ...advisory.flightIds]),
      ].sort((first, second) => first - second);
      next.firstSeenSeconds = Math.min(
        next.firstSeenSeconds,
        advisory.firstSeenAtSeconds,
      );
      next.lastSeenSeconds = Math.max(
        next.lastSeenSeconds,
        advisory.lastSeenAtSeconds,
      );
      next.resolvedAtSeconds =
        advisory.resolvedAtSeconds ?? (active ? null : next.resolvedAtSeconds);
      next.active = active;
      next.activeSeconds += active ? sampleDelta : 0;
      next.acknowledged ||= advisory.acknowledgedAtSeconds !== undefined;
      next.latestDetail = advisory.detail;
      this.surfaceSafetyRecords.set(advisory.id, next);
    }
    for (const [id, record] of this.surfaceSafetyRecords) {
      if (!observedIds.has(id) && record.active) {
        record.active = false;
        record.resolvedAtSeconds = snapshot.generatedAtSeconds;
      }
    }
    if (this.surfaceSafetyRecords.size > MAXIMUM_SURFACE_SAFETY_RECORDS) {
      const retained = [...this.surfaceSafetyRecords.values()]
        .sort(
          (first, second) =>
            Number(second.active) - Number(first.active) ||
            second.lastSeenSeconds - first.lastSeenSeconds,
        )
        .slice(0, MAXIMUM_SURFACE_SAFETY_RECORDS);
      this.surfaceSafetyRecords = new Map(
        retained.map((entry) => [entry.id, entry]),
      );
    }
  }

  private recordTrafficFlow(state: AirportState): void {
    const entries = [
      ...state.trafficFlow.arrivalQueue,
      ...state.trafficFlow.departureQueue,
      ...state.trafficFlow.history,
    ];
    for (const entry of entries) {
      let previousReleaseSlotSeconds = this.lastFlowReleaseSlotByEntry.get(
        entry.id,
      );
      for (const revision of entry.slotRevisions) {
        const id = flowRevisionId(entry, revision);
        const initial =
          revision.atSeconds === entry.createdAtSeconds &&
          previousReleaseSlotSeconds === undefined;
        const previous =
          previousReleaseSlotSeconds ?? revision.releaseSlotSeconds;
        const existing = this.trafficFlowRevisionRecords.get(id);
        if (existing) {
          existing.status = entry.status;
          existing.flightId = entry.flightId ?? existing.flightId;
          existing.callsign = entry.callsign ?? existing.callsign;
          existing.runwayId = entry.runwayId ?? existing.runwayId;
        } else {
          const attribution =
            revision.attribution ??
            trafficFlowRevisionAttribution(revision.reason, {
              category: revision.category ?? entry.constraintCategory,
            });
          this.trafficFlowRevisionRecords.set(id, {
            schemaVersion: 2,
            id,
            entryId: entry.id,
            kind: initial ? "initial" : "revision",
            direction: entry.direction,
            status: entry.status,
            atSeconds: rounded(revision.atSeconds, 3),
            previousReleaseSlotSeconds: rounded(previous, 3),
            releaseSlotSeconds: rounded(revision.releaseSlotSeconds, 3),
            shiftSeconds: rounded(revision.releaseSlotSeconds - previous, 3),
            category: attribution.category,
            causeCode: attribution.causeCode,
            source: attribution.source,
            relatedFlightId: attribution.relatedFlightId ?? null,
            relatedRunwayId: attribution.relatedRunwayId ?? null,
            reason: revision.reason,
            flightId: entry.flightId ?? null,
            callsign: entry.callsign ?? null,
            runwayId: entry.runwayId ?? null,
          });
        }
        previousReleaseSlotSeconds = revision.releaseSlotSeconds;
      }
      if (previousReleaseSlotSeconds !== undefined)
        this.lastFlowReleaseSlotByEntry.set(
          entry.id,
          previousReleaseSlotSeconds,
        );
    }
    if (this.trafficFlowRevisionRecords.size > MAXIMUM_TRAFFIC_FLOW_REVISIONS) {
      const retained = [...this.trafficFlowRevisionRecords.values()]
        .sort(
          (first, second) =>
            second.atSeconds - first.atSeconds ||
            first.id.localeCompare(second.id),
        )
        .slice(0, MAXIMUM_TRAFFIC_FLOW_REVISIONS);
      this.trafficFlowRevisionRecords = new Map(
        retained.map((entry) => [entry.id, entry]),
      );
      const retainedEntryIds = new Set(retained.map((entry) => entry.entryId));
      for (const entryId of this.lastFlowReleaseSlotByEntry.keys())
        if (!retainedEntryIds.has(entryId))
          this.lastFlowReleaseSlotByEntry.delete(entryId);
    }
  }

  /**
   * Retain the typed Data Comm lifecycle without copying presentation detail or
   * free-form controller text into a shareable analytics export.
   */
  private recordDigitalClearances(state: AirportState): void {
    const snapshot = digitalClearanceSnapshot(state);
    for (const message of snapshot.messages) {
      const deliveredAtSeconds =
        message.deliveredAtSeconds ?? message.response.deliveredAtSeconds;
      const respondedAtSeconds =
        message.respondedAtSeconds ?? message.response.respondedAtSeconds;
      const responseOrigin = deliveredAtSeconds ?? message.issuedAtSeconds;
      const record: DigitalClearanceAnalyticsRecord = {
        schemaVersion: 4,
        id: message.id,
        commandId: message.commandId,
        responseCommandId: message.response.commandId ?? null,
        flightId: message.flightId,
        callsign: message.callsign,
        kind: message.kind,
        status: message.status,
        authority: message.authority,
        channel: message.capability.channel,
        deskAccess: message.capability.deskAccess,
        responseMode: message.capability.responseMode,
        aircraftSupport: message.capability.aircraftSupport,
        revision: message.revision,
        createdAtSeconds: rounded(message.createdAtSeconds, 3),
        issuedAtSeconds:
          message.issuedAtSeconds === undefined
            ? null
            : rounded(message.issuedAtSeconds, 3),
        deliveredAtSeconds:
          deliveredAtSeconds === undefined
            ? null
            : rounded(deliveredAtSeconds, 3),
        responseDueSeconds:
          message.responseDueSeconds === undefined
            ? null
            : rounded(message.responseDueSeconds, 3),
        respondedAtSeconds:
          respondedAtSeconds === undefined
            ? null
            : rounded(respondedAtSeconds, 3),
        expiresAtSeconds:
          message.expiresAtSeconds === null
            ? null
            : rounded(message.expiresAtSeconds, 3),
        responseSeconds:
          respondedAtSeconds === undefined || responseOrigin === undefined
            ? null
            : rounded(Math.max(0, respondedAtSeconds - responseOrigin), 3),
        warningCount: message.warningCount,
        route: [...message.route],
        parameters: { ...message.parameters },
        causalEventIds: [...message.causalEventIds],
      };
      this.digitalClearanceRecords.set(message.id, record);
    }
    if (this.digitalClearanceRecords.size <= MAXIMUM_DIGITAL_CLEARANCE_RECORDS)
      return;
    const retained = [...this.digitalClearanceRecords.values()]
      .sort(
        (first, second) =>
          Number(digitalClearanceStatusIsActive(second.status)) -
            Number(digitalClearanceStatusIsActive(first.status)) ||
          second.createdAtSeconds - first.createdAtSeconds ||
          first.id.localeCompare(second.id),
      )
      .slice(0, MAXIMUM_DIGITAL_CLEARANCE_RECORDS);
    this.digitalClearanceRecords = new Map(
      retained.map((entry) => [entry.id, entry]),
    );
  }

  private pruneCompletedFlights(activeFlights: readonly Flight[]): void {
    if (this.flights.size <= MAXIMUM_RETAINED_FLIGHTS) return;
    const activeIds = new Set(activeFlights.map((flight) => flight.id));
    const removable = [...this.flights.values()]
      .filter((flight) => !activeIds.has(flight.flightId))
      .sort((first, second) => first.lastSeenSeconds - second.lastSeenSeconds);
    while (this.flights.size > MAXIMUM_RETAINED_FLIGHTS && removable.length) {
      const flight = removable.shift();
      if (!flight) break;
      this.flights.delete(flight.flightId);
      this.flightSamples.delete(flight.flightId);
      this.previousPhase.delete(flight.flightId);
      this.previousTaxiway.delete(flight.flightId);
    }
  }

  private surfaceRows<Key>(
    source: ReadonlyMap<Key, MutableSurfaceRecord>,
  ): SurfaceUtilizationRecord[] {
    const totalSeconds = [...source.values()].reduce(
      (sum, entry) => sum + entry.occupiedSeconds,
      0,
    );
    return [...source.values()]
      .map((entry) => ({
        ...entry,
        occupiedSeconds: rounded(entry.occupiedSeconds, 1),
        sharePercent: rounded(
          (entry.occupiedSeconds / Math.max(1, totalSeconds)) * 100,
          1,
        ),
      }))
      .sort(
        (first, second) =>
          second.occupiedSeconds - first.occupiedSeconds ||
          first.label.localeCompare(second.label),
      );
  }
}

export function buildOperationsExportBundle(
  analytics: OperationsAnalyticsSnapshot,
  flightRecorder: readonly FlightDataSample[],
  commands: readonly unknown[],
  events: readonly unknown[],
  queues: OperationQueueSnapshot,
): OperationsExportBundle {
  return {
    schemaVersion: OPERATIONS_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    analytics: structuredClone(analytics),
    flightRecorder: structuredClone([...flightRecorder]),
    commands: structuredClone([...commands]),
    events: structuredClone([...events]),
    queues: structuredClone(queues),
    disclosure: { ...analytics.disclosure },
  };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function recordsFromUnknown(
  values: readonly unknown[],
): Array<Record<string, unknown>> {
  return values.map((value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value },
  );
}

function flattenRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      value !== null && typeof value === "object"
        ? JSON.stringify(value)
        : value,
    ]),
  );
}

function csvRows(
  bundle: OperationsExportBundle,
  dataset: OperationsExportDataset,
  flightId?: number,
): Array<Record<string, unknown>> {
  switch (dataset) {
    case "flights":
      return bundle.analytics.flights.map((flight) =>
        flattenRecord(flight as unknown as Record<string, unknown>),
      );
    case "commands":
      return recordsFromUnknown(bundle.commands).map(flattenRecord);
    case "events":
      return recordsFromUnknown(bundle.events).map(flattenRecord);
    case "queues":
      return bundle.queues.entries.map((entry) =>
        flattenRecord(entry as unknown as Record<string, unknown>),
      );
    case "delays":
      return bundle.analytics.flights.map((flight) => ({
        flightId: flight.flightId,
        callsign: flight.callsign,
        routes: flight.routes.join(" | "),
        delaySeconds: flight.delaySeconds,
        surfaceSeconds: flight.surfaceSeconds,
        airborneSeconds: flight.airborneSeconds,
        latestPhase: flight.latestPhase,
      }));
    case "runways":
      return bundle.analytics.runwayUtilization.map((entry) => ({ ...entry }));
    case "taxiways":
      return bundle.analytics.taxiwayUtilization.map((entry) => ({ ...entry }));
    case "shift-metrics":
      return [
        {
          airport: bundle.analytics.airport.code,
          sessionId: bundle.analytics.sessionId,
          durationSeconds: bundle.analytics.window.durationSeconds,
          ...bundle.analytics.summary,
          ...bundle.analytics.metrics,
        },
      ];
    case "flight-recorder": {
      const samples = bundle.flightRecorder;
      return samples
        .filter(
          (sample) => flightId === undefined || sample.flightId === flightId,
        )
        .map((sample) => ({ ...sample }));
    }
    case "conflicts":
      return bundle.analytics.conflictHeatmap.map((entry) => ({ ...entry }));
    case "surface-advisories":
      return bundle.analytics.surfaceSafetyAdvisories.map((entry) =>
        flattenRecord(entry as unknown as Record<string, unknown>),
      );
    case "flow-revisions":
      return bundle.analytics.trafficFlowRevisions.map((entry) => ({
        ...entry,
      }));
    case "digital-clearances":
      return bundle.analytics.digitalClearances.map((entry) =>
        flattenRecord(entry as unknown as Record<string, unknown>),
      );
  }
}

const DIGITAL_CLEARANCE_STATUSES: readonly DigitalClearanceStatus[] = [
  "draft",
  "sent",
  "delivered",
  "wilco",
  "unable",
  "standby",
  "superseded",
  "timed-out",
  "cancelled",
];

function digitalClearanceStatusIsActive(
  status: DigitalClearanceStatus,
): boolean {
  return (
    status === "draft" ||
    status === "sent" ||
    status === "delivered" ||
    status === "standby"
  );
}

function digitalClearanceAnalyticsSummary(
  records: readonly DigitalClearanceAnalyticsRecord[],
): DigitalClearanceAnalyticsSummary {
  const byStatus = Object.fromEntries(
    DIGITAL_CLEARANCE_STATUSES.map((status) => [status, 0]),
  ) as Record<DigitalClearanceStatus, number>;
  const byKind: DigitalClearanceAnalyticsSummary["byKind"] = {};
  const responseSeconds: number[] = [];
  for (const record of records) {
    byStatus[record.status] += 1;
    byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
    if (record.responseSeconds !== null)
      responseSeconds.push(record.responseSeconds);
  }
  return {
    total: records.length,
    active: records.filter((record) =>
      digitalClearanceStatusIsActive(record.status),
    ).length,
    delivered: records.filter((record) => record.deliveredAtSeconds !== null)
      .length,
    responded: records.filter((record) => record.respondedAtSeconds !== null)
      .length,
    unable: byStatus.unable,
    timedOut: byStatus["timed-out"],
    cancelled: byStatus.cancelled,
    averageResponseSeconds: responseSeconds.length
      ? rounded(
          responseSeconds.reduce((sum, value) => sum + value, 0) /
            responseSeconds.length,
          2,
        )
      : null,
    byStatus,
    byKind,
  };
}

function flowRevisionId(
  entry: TrafficFlowEntry,
  revision: TrafficFlowEntry["slotRevisions"][number],
): string {
  return `${entry.id}:${revision.atSeconds}:${revision.releaseSlotSeconds}:${revision.attribution?.causeCode ?? revision.category ?? "schedule"}:${revision.reason}`;
}

function trafficFlowCauseRows(
  revisions: readonly TrafficFlowRevisionAnalyticsRecord[],
): TrafficFlowCauseAnalyticsRecord[] {
  const rows = new Map<
    TrafficFlowConstraintCategory,
    TrafficFlowCauseAnalyticsRecord
  >();
  for (const revision of revisions) {
    const row = rows.get(revision.category) ?? {
      category: revision.category,
      initialAssignments: 0,
      revisions: 0,
      totalShiftSeconds: 0,
      delayAddedSeconds: 0,
      delayRecoveredSeconds: 0,
      largestAbsoluteShiftSeconds: 0,
      latestAtSeconds: revision.atSeconds,
      latestReason: revision.reason,
    };
    row.initialAssignments += revision.kind === "initial" ? 1 : 0;
    row.revisions += revision.kind === "revision" ? 1 : 0;
    row.totalShiftSeconds += revision.shiftSeconds;
    row.delayAddedSeconds += Math.max(0, revision.shiftSeconds);
    row.delayRecoveredSeconds += Math.max(0, -revision.shiftSeconds);
    row.largestAbsoluteShiftSeconds = Math.max(
      row.largestAbsoluteShiftSeconds,
      Math.abs(revision.shiftSeconds),
    );
    if (revision.atSeconds >= row.latestAtSeconds) {
      row.latestAtSeconds = revision.atSeconds;
      row.latestReason = revision.reason;
    }
    rows.set(revision.category, row);
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      totalShiftSeconds: rounded(row.totalShiftSeconds, 1),
      delayAddedSeconds: rounded(row.delayAddedSeconds, 1),
      delayRecoveredSeconds: rounded(row.delayRecoveredSeconds, 1),
      largestAbsoluteShiftSeconds: rounded(row.largestAbsoluteShiftSeconds, 1),
    }))
    .sort(
      (first, second) =>
        second.revisions - first.revisions ||
        second.initialAssignments - first.initialAssignments ||
        first.category.localeCompare(second.category),
    );
}

function higherSurfaceSeverity(
  first: SurfaceSafetyAdvisory["severity"],
  second: SurfaceSafetyAdvisory["severity"],
): SurfaceSafetyAdvisory["severity"] {
  const rank = { advisory: 1, warning: 2, critical: 3 } as const;
  return rank[second] > rank[first] ? second : first;
}

export function serializeOperationsCsv(
  bundle: OperationsExportBundle,
  dataset: OperationsExportDataset,
  flightId?: number,
): string {
  const rows = csvRows(bundle, dataset, flightId);
  if (rows.length === 0) return "no_data\r\n";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) =>
      headers.map((header) => csvEscape(row[header])).join(","),
    ),
  ].join("\r\n");
}

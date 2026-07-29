import {
  AIRPORT_CONTROL_COMMAND_DEFINITIONS,
  type AirportControlCommand,
  type ControlCommandSource,
} from "../control/controlCommandCatalog";
import {
  CONTROLLER_STATIONS,
  requiredControllerStation,
} from "../simulation/controllerOperations";
import type { OperationQueueSnapshot } from "../simulation/operationQueues";
import { digitalClearanceSnapshot } from "../simulation/digitalClearances";
import type {
  AirportState,
  ConflictPrediction,
  ControllerStation,
  ControllerWorkloadSnapshot,
  Flight,
  OperationalControllerStation,
  ShiftMetrics,
} from "../simulation/types";

export const CONTROLLER_EVALUATION_SCHEMA_VERSION = 1 as const;
export const CONTROLLER_EVALUATION_METHOD_VERSION = "1.0.0" as const;

export type ControllerEvaluationRating =
  "excellent" | "strong" | "review" | "critical" | "not-rated";

export interface ControllerEvaluationCommandAttempt {
  id: string;
  elapsedSeconds: number;
  station: ControllerStation;
  source: ControlCommandSource;
  actorId: string | null;
  clientId: string | null;
  command: AirportControlCommand;
  accepted: boolean;
  reason: string;
}

export interface ControllerEvaluationActorSnapshot {
  actorId: string;
  source: ControlCommandSource | "scripted";
  station: ControllerStation;
  attempts: number;
  accepted: number;
  rejected: number;
  deferred: number;
  acceptancePercent: number | null;
}

export interface UnnecessaryHoldSnapshot {
  flightId: number;
  callsign: string;
  station: ControllerStation;
  kind: "surface" | "airborne";
  heldSeconds: number;
  avoidableSeconds: number;
  reason: string;
}

export interface ControllerEvaluationStationSnapshot {
  station: ControllerStation;
  attempts: number;
  accepted: number;
  rejected: number;
  deferred: number;
  acceptancePercent: number | null;
  activeConflictForecasts: number;
  activeConflictWarnings: number;
  runwayIncursions: number;
  overdueHandoffs: number;
  unnecessaryHolds: number;
  unnecessaryHoldSeconds: number;
  commandQualityScore: number | null;
  commandQualityRating: ControllerEvaluationRating;
  summary: string;
}

export interface ControllerEvaluationSnapshot {
  schemaVersion: typeof CONTROLLER_EVALUATION_SCHEMA_VERSION;
  methodVersion: typeof CONTROLLER_EVALUATION_METHOD_VERSION;
  generatedAtSeconds: number;
  window: "current-session";
  safetyBoundary: "read-only";
  operations: {
    completed: number;
    arrivals: number;
    departures: number;
    throughputPerHour: number;
    totalDelaySeconds: number;
    delayPerOperationSeconds: number;
  };
  safety: {
    activeConflictForecasts: number;
    activeConflictWarnings: number;
    preventedConflicts: number;
    collisionAlerts: number;
    runwayIncursions: number;
    unexplainedPauses: number;
  };
  fuel: {
    totalBurnKg: number;
    holdingBurnKg: number;
    holdingBurnPercent: number;
    interpretation: string;
  };
  holds: {
    unnecessary: number;
    unnecessarySeconds: number;
    candidates: UnnecessaryHoldSnapshot[];
    interpretation: string;
  };
  commands: {
    attempts: number;
    accepted: number;
    rejected: number;
    deferred: number;
    acceptancePercent: number | null;
    commandQualityScore: number | null;
    commandQualityRating: ControllerEvaluationRating;
  };
  digitalClearances: {
    total: number;
    active: number;
    delivered: number;
    standby: number;
    unable: number;
    byKind: Record<string, number>;
  };
  stations: ControllerEvaluationStationSnapshot[];
  actors: ControllerEvaluationActorSnapshot[];
  methodology: {
    commandScope: string;
    commandQuality: string;
    unnecessaryHold: string;
    safetyPriority: string;
    attributionLimit: string;
  };
}

export interface ControllerEvaluationInputs {
  state: AirportState;
  metrics: ShiftMetrics;
  queues: OperationQueueSnapshot;
  predictions: readonly ConflictPrediction[];
  workloads: readonly ControllerWorkloadSnapshot[];
  commands: readonly ControllerEvaluationCommandAttempt[];
}

interface DecisionCounts {
  attempts: number;
  accepted: number;
  rejected: number;
  deferred: number;
}

const SURFACE_HOLD_REVIEW_SECONDS = 45;
const AIRBORNE_HOLD_EFC_GRACE_SECONDS = 15;
const ACTOR_LIMIT = 48;

const EVALUATED_OPERATION_CATEGORIES = new Set([
  "approach",
  "tower",
  "surface",
  "coordination",
]);

const EVALUATED_OPERATION_ACTIONS = new Set<AirportControlCommand["action"]>([
  "triggerEmergency",
  "recoverDisabledAircraft",
]);

/**
 * Builds a read-only, explainable evaluation picture for human and scripted
 * controllers. It never grants authority, changes a clearance, or feeds a
 * score back into the safety arbiter.
 */
export function controllerEvaluationSnapshot(
  inputs: ControllerEvaluationInputs,
): ControllerEvaluationSnapshot {
  const evaluatedCommands = inputs.commands.filter((attempt) =>
    isEvaluatedControllerCommand(attempt.command),
  );
  const unnecessaryHolds = findUnnecessaryHolds(inputs, evaluatedCommands);
  const workloadByStation = new Map(
    inputs.workloads.map((workload) => [workload.station, workload]),
  );
  const stationSnapshots = CONTROLLER_STATIONS.map((station) => {
    const external = commandCounts(
      evaluatedCommands.filter((attempt) => attempt.station === station),
    );
    const scripted = inputs.state.scriptedControllers.stations[station];
    const decisions: DecisionCounts = {
      attempts: external.attempts + scripted.planned,
      accepted: external.accepted + scripted.accepted,
      rejected: external.rejected + scripted.rejected,
      deferred: scripted.deferred,
    };
    const predictions = predictionsForStation(station, inputs.predictions);
    const stationHolds = unnecessaryHolds.filter(
      (candidate) => candidate.station === station,
    );
    const overdueHandoffs =
      station === "supervisor"
        ? inputs.workloads.reduce(
            (sum, workload) => sum + workload.overdueFlights,
            0,
          )
        : (workloadByStation.get(station as OperationalControllerStation)
            ?.overdueFlights ?? 0);
    const incursions =
      station === "supervisor" || station === "tower" || station === "ground"
        ? inputs.metrics.runwayIncursions
        : 0;
    const score = qualityScore({
      ...decisions,
      conflicts: predictions.length,
      warnings: predictions.filter(
        (prediction) => prediction.severity === "warning",
      ).length,
      incursions,
      collisionAlerts:
        station === "supervisor" ? inputs.metrics.collisionAlerts : 0,
      overdueHandoffs,
      unnecessaryHolds: stationHolds.length,
      unnecessaryHoldSeconds: sum(
        stationHolds.map((candidate) => candidate.avoidableSeconds),
      ),
    });
    return stationSnapshot(
      station,
      decisions,
      predictions,
      incursions,
      overdueHandoffs,
      stationHolds,
      score,
    );
  });

  const completed = inputs.metrics.safeArrivals + inputs.metrics.safeDepartures;
  const elapsedHours = inputs.state.elapsed / 3_600;
  const throughputPerHour = elapsedHours > 0 ? completed / elapsedHours : 0;
  const delayPerOperationSeconds =
    completed > 0 ? inputs.metrics.estimatedDelaySeconds / completed : 0;
  const holdingBurnPercent =
    inputs.metrics.fuelBurnKg > 0
      ? (inputs.metrics.holdingFuelBurnKg / inputs.metrics.fuelBurnKg) * 100
      : 0;
  const decisions = sumDecisionCounts(
    stationSnapshots.map((station) => ({
      attempts: station.attempts,
      accepted: station.accepted,
      rejected: station.rejected,
      deferred: station.deferred,
    })),
  );
  const overallScore = qualityScore({
    ...decisions,
    conflicts: inputs.predictions.length,
    warnings: inputs.predictions.filter(
      (prediction) => prediction.severity === "warning",
    ).length,
    incursions: inputs.metrics.runwayIncursions,
    collisionAlerts: inputs.metrics.collisionAlerts,
    overdueHandoffs: inputs.metrics.missedHandoffs,
    unnecessaryHolds: unnecessaryHolds.length,
    unnecessaryHoldSeconds: sum(
      unnecessaryHolds.map((candidate) => candidate.avoidableSeconds),
    ),
  });
  const digital = digitalClearanceSnapshot(inputs.state);
  const digitalActive = digital.messages.filter(
    (message) =>
      message.status === "draft" ||
      message.status === "sent" ||
      message.status === "delivered" ||
      message.status === "standby",
  ).length;
  const digitalByKind: Record<string, number> = {};
  for (const message of digital.messages)
    digitalByKind[message.kind] = (digitalByKind[message.kind] ?? 0) + 1;

  return {
    schemaVersion: CONTROLLER_EVALUATION_SCHEMA_VERSION,
    methodVersion: CONTROLLER_EVALUATION_METHOD_VERSION,
    generatedAtSeconds: round(inputs.state.elapsed, 3),
    window: "current-session",
    safetyBoundary: "read-only",
    operations: {
      completed,
      arrivals: inputs.metrics.safeArrivals,
      departures: inputs.metrics.safeDepartures,
      throughputPerHour: round(throughputPerHour, 1),
      totalDelaySeconds: round(inputs.metrics.estimatedDelaySeconds, 1),
      delayPerOperationSeconds: round(delayPerOperationSeconds, 1),
    },
    safety: {
      activeConflictForecasts: inputs.predictions.length,
      activeConflictWarnings: inputs.predictions.filter(
        (prediction) => prediction.severity === "warning",
      ).length,
      preventedConflicts: inputs.metrics.preventedConflicts,
      collisionAlerts: inputs.metrics.collisionAlerts,
      runwayIncursions: inputs.metrics.runwayIncursions,
      unexplainedPauses: inputs.metrics.unexplainedPauses,
    },
    fuel: {
      totalBurnKg: round(inputs.metrics.fuelBurnKg, 1),
      holdingBurnKg: round(inputs.metrics.holdingFuelBurnKg, 1),
      holdingBurnPercent: round(holdingBurnPercent, 1),
      interpretation:
        "Holding burn is modeled fuel consumed while any controller, sequencing, or safety hold was active; it is reported separately from avoidable-hold candidates.",
    },
    holds: {
      unnecessary: unnecessaryHolds.length,
      unnecessarySeconds: round(
        sum(unnecessaryHolds.map((candidate) => candidate.avoidableSeconds)),
        1,
      ),
      candidates: unnecessaryHolds.slice(0, 16),
      interpretation:
        "A candidate is a controller hold left beyond its review threshold after every visible safety, conflict, crossing, emergency, disruption, deicing, and blocking-aircraft reason has cleared.",
    },
    commands: {
      ...decisions,
      acceptancePercent: acceptancePercent(decisions),
      commandQualityScore: overallScore,
      commandQualityRating: qualityRating(overallScore),
    },
    digitalClearances: {
      total: digital.messages.length,
      active: digitalActive,
      delivered: digital.counts.delivered,
      standby: digital.counts.standby,
      unable: digital.counts.unable,
      byKind: digitalByKind,
    },
    stations: stationSnapshots,
    actors: actorSnapshots(inputs, evaluatedCommands),
    methodology: {
      commandScope:
        "Only mutating Approach, Tower, Surface, Coordination, emergency, and recovery instructions are evaluated. Camera, sound, setup, training, challenge, and sandbox controls are excluded.",
      commandQuality:
        "Quality starts at 100 and applies only penalties for rejected instructions, active warnings, safety events, overdue handoffs, and avoidable holds. A desk with no attempts is explicitly not rated.",
      unnecessaryHold: `Surface holds receive a ${SURFACE_HOLD_REVIEW_SECONDS}-second review window. Airborne holds are reviewed after EFC plus ${AIRBORNE_HOLD_EFC_GRACE_SECONDS} seconds. Listed candidates are explainable review prompts, not automatic violations.`,
      safetyPriority:
        "Throughput, delay, and fuel are reported as outcomes and never add points or offset a safety or rejected-command penalty.",
      attributionLimit:
        "Physical collision alerts are airport-wide. Runway incursions are shared Tower/Ground context; the evaluator does not invent individual blame without a causal event.",
    },
  };
}

export function isEvaluatedControllerCommand(
  command: AirportControlCommand,
): boolean {
  const definition = AIRPORT_CONTROL_COMMAND_DEFINITIONS[command.action];
  return (
    definition.mutates &&
    (EVALUATED_OPERATION_CATEGORIES.has(definition.category) ||
      EVALUATED_OPERATION_ACTIONS.has(command.action))
  );
}

function stationSnapshot(
  station: ControllerStation,
  decisions: DecisionCounts,
  predictions: readonly ConflictPrediction[],
  runwayIncursions: number,
  overdueHandoffs: number,
  holds: readonly UnnecessaryHoldSnapshot[],
  score: number | null,
): ControllerEvaluationStationSnapshot {
  const rejectedText = decisions.rejected
    ? `${decisions.rejected} rejected`
    : "no rejected instructions";
  const holdText = holds.length
    ? `${holds.length} hold review${holds.length === 1 ? "" : "s"}`
    : "no stale controller holds";
  return {
    station,
    ...decisions,
    acceptancePercent: acceptancePercent(decisions),
    activeConflictForecasts: predictions.length,
    activeConflictWarnings: predictions.filter(
      (prediction) => prediction.severity === "warning",
    ).length,
    runwayIncursions,
    overdueHandoffs,
    unnecessaryHolds: holds.length,
    unnecessaryHoldSeconds: round(
      sum(holds.map((candidate) => candidate.avoidableSeconds)),
      1,
    ),
    commandQualityScore: score,
    commandQualityRating: qualityRating(score),
    summary:
      score === null
        ? `Not rated · ${holdText}`
        : `${score}/100 · ${rejectedText} · ${holdText}`,
  };
}

function actorSnapshots(
  inputs: ControllerEvaluationInputs,
  evaluatedCommands: readonly ControllerEvaluationCommandAttempt[],
): ControllerEvaluationActorSnapshot[] {
  const grouped = new Map<string, ControllerEvaluationActorSnapshot>();
  for (const attempt of evaluatedCommands) {
    const actorId =
      attempt.actorId ??
      attempt.clientId ??
      `${attempt.source}:${attempt.station}`;
    const key = `${attempt.source}|${attempt.station}|${actorId}`;
    const current = grouped.get(key) ?? {
      actorId,
      source: attempt.source,
      station: attempt.station,
      attempts: 0,
      accepted: 0,
      rejected: 0,
      deferred: 0,
      acceptancePercent: null,
    };
    current.attempts += 1;
    current.accepted += attempt.accepted ? 1 : 0;
    current.rejected += attempt.accepted ? 0 : 1;
    grouped.set(key, current);
  }
  for (const station of CONTROLLER_STATIONS) {
    const runtime = inputs.state.scriptedControllers.stations[station];
    if (!runtime.planned) continue;
    grouped.set(`scripted|${station}`, {
      actorId: `scripted:${station}`,
      source: "scripted",
      station,
      attempts: runtime.planned,
      accepted: runtime.accepted,
      rejected: runtime.rejected,
      deferred: runtime.deferred,
      acceptancePercent: acceptancePercent(runtime),
    });
  }
  return [...grouped.values()]
    .map((actor) => ({
      ...actor,
      acceptancePercent: acceptancePercent(actor),
    }))
    .sort(
      (first, second) =>
        second.attempts - first.attempts ||
        first.station.localeCompare(second.station) ||
        first.actorId.localeCompare(second.actorId),
    )
    .slice(0, ACTOR_LIMIT);
}

function findUnnecessaryHolds(
  inputs: ControllerEvaluationInputs,
  commands: readonly ControllerEvaluationCommandAttempt[],
): UnnecessaryHoldSnapshot[] {
  const holds: UnnecessaryHoldSnapshot[] = [];
  for (const flight of inputs.state.flights) {
    if (!flight.controlHold && !flight.navigation.hold) continue;
    const holdAttempt = latestAcceptedHoldAttempt(commands, flight.id);
    const station =
      holdAttempt?.station ??
      (flight.navigation.hold
        ? flight.navigation.frequencyOwner
        : requiredControllerStation(flight));
    if (hasVisibleHoldBlocker(inputs, flight)) continue;
    if (flight.navigation.hold) {
      const reviewAt =
        flight.navigation.hold.expectFurtherClearanceAtSeconds +
        AIRBORNE_HOLD_EFC_GRACE_SECONDS;
      if (inputs.state.elapsed <= reviewAt) continue;
      holds.push({
        flightId: flight.id,
        callsign: flight.callsign,
        station,
        kind: "airborne",
        heldSeconds: round(
          inputs.state.elapsed - flight.navigation.hold.issuedAtSeconds,
          1,
        ),
        avoidableSeconds: round(inputs.state.elapsed - reviewAt, 1),
        reason:
          "EFC and review grace elapsed with no visible operational blocker.",
      });
      continue;
    }
    if (!holdAttempt) continue;
    const heldSeconds = inputs.state.elapsed - holdAttempt.elapsedSeconds;
    if (heldSeconds <= SURFACE_HOLD_REVIEW_SECONDS) continue;
    holds.push({
      flightId: flight.id,
      callsign: flight.callsign,
      station,
      kind: "surface",
      heldSeconds: round(heldSeconds, 1),
      avoidableSeconds: round(heldSeconds - SURFACE_HOLD_REVIEW_SECONDS, 1),
      reason:
        "Controller surface hold exceeded its review window after visible blockers cleared.",
    });
  }
  return holds.sort(
    (first, second) =>
      second.avoidableSeconds - first.avoidableSeconds ||
      first.flightId - second.flightId,
  );
}

function hasVisibleHoldBlocker(
  inputs: ControllerEvaluationInputs,
  flight: Flight,
): boolean {
  if (
    flight.safetyHold ||
    flight.automaticHold ||
    flight.crossingHoldRunway !== undefined ||
    flight.emergency !== undefined ||
    flight.surfaceReroute?.status === "holding" ||
    ["queued", "positioning", "treating", "expired", "unavailable"].includes(
      flight.deicing.status,
    )
  ) {
    return true;
  }
  if (
    flight.navigation.handoff?.status === "overdue" ||
    inputs.predictions.some((prediction) =>
      prediction.flights.includes(flight.id),
    )
  ) {
    return true;
  }
  return inputs.queues.entries.some(
    (entry) =>
      entry.flightId === flight.id && entry.blockerFlightIds.length > 0,
  );
}

function latestAcceptedHoldAttempt(
  commands: readonly ControllerEvaluationCommandAttempt[],
  flightId: number,
): ControllerEvaluationCommandAttempt | undefined {
  return [...commands]
    .reverse()
    .find(
      (attempt) =>
        attempt.accepted &&
        commandHoldFlightIds(attempt.command).includes(flightId),
    );
}

function commandHoldFlightIds(command: AirportControlCommand): number[] {
  if (command.action === "holdPosition" || command.action === "holdFlight") {
    return [command.flightId];
  }
  if (
    (command.action === "controlFlights" ||
      command.action === "issueGroupInstruction") &&
    command.instruction === "hold"
  ) {
    return [...command.flightIds];
  }
  return [];
}

function predictionsForStation(
  station: ControllerStation,
  predictions: readonly ConflictPrediction[],
): ConflictPrediction[] {
  if (station === "supervisor") return [...predictions];
  if (station === "approach") {
    return predictions.filter((prediction) => prediction.type === "separation");
  }
  if (station === "tower") {
    return predictions.filter(
      (prediction) =>
        prediction.type === "runway" || prediction.type === "crossing",
    );
  }
  if (station === "ground") {
    return predictions.filter((prediction) => prediction.type === "crossing");
  }
  return [];
}

function commandCounts(
  commands: readonly ControllerEvaluationCommandAttempt[],
): DecisionCounts {
  return {
    attempts: commands.length,
    accepted: commands.filter((command) => command.accepted).length,
    rejected: commands.filter((command) => !command.accepted).length,
    deferred: 0,
  };
}

function sumDecisionCounts(counts: readonly DecisionCounts[]): DecisionCounts {
  return counts.reduce(
    (total, item) => ({
      attempts: total.attempts + item.attempts,
      accepted: total.accepted + item.accepted,
      rejected: total.rejected + item.rejected,
      deferred: total.deferred + item.deferred,
    }),
    { attempts: 0, accepted: 0, rejected: 0, deferred: 0 },
  );
}

function acceptancePercent(counts: {
  accepted: number;
  rejected: number;
}): number | null {
  const resolved = counts.accepted + counts.rejected;
  return resolved ? round((counts.accepted / resolved) * 100, 1) : null;
}

function qualityScore(
  inputs: DecisionCounts & {
    conflicts: number;
    warnings: number;
    incursions: number;
    collisionAlerts: number;
    overdueHandoffs: number;
    unnecessaryHolds: number;
    unnecessaryHoldSeconds: number;
  },
): number | null {
  if (!inputs.attempts) return null;
  const resolved = Math.max(1, inputs.accepted + inputs.rejected);
  const rejectionPenalty = Math.min(35, (inputs.rejected / resolved) * 35);
  const conflictPenalty = Math.min(
    25,
    inputs.warnings * 10 + Math.max(0, inputs.conflicts - inputs.warnings) * 4,
  );
  const safetyPenalty = Math.min(
    100,
    inputs.collisionAlerts * 60 + inputs.incursions * 50,
  );
  const coordinationPenalty = Math.min(15, inputs.overdueHandoffs * 5);
  const holdPenalty = Math.min(
    20,
    inputs.unnecessaryHolds * 8 + inputs.unnecessaryHoldSeconds / 30,
  );
  return Math.max(
    0,
    Math.round(
      100 -
        rejectionPenalty -
        conflictPenalty -
        safetyPenalty -
        coordinationPenalty -
        holdPenalty,
    ),
  );
}

function qualityRating(score: number | null): ControllerEvaluationRating {
  if (score === null) return "not-rated";
  if (score >= 95) return "excellent";
  if (score >= 85) return "strong";
  if (score >= 70) return "review";
  return "critical";
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

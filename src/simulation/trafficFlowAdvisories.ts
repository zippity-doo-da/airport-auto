import type {
  AirportState,
  ClearanceProposalFlowContext,
  Flight,
  TrafficFlowEntry,
} from "./types";

/**
 * Produces timing context only. It never changes navigation, slots, clearances,
 * or aircraft motion; proposal approval still uses the normal command arbiter.
 */
export function trafficFlowGuidanceForFlight(
  state: AirportState,
  flight: Flight,
): ClearanceProposalFlowContext | null {
  const direction =
    flight.phase === "approach" || flight.phase === "landing"
      ? "arrival"
      : flight.phase === "taxi-out" || flight.phase === "takeoff"
        ? "departure"
        : null;
  if (!direction) return null;
  const entry = flowEntryForFlight(state, flight.id, direction);
  if (!entry) return null;
  const target = targetForFlight(entry, direction);
  if (!target) return null;
  const estimatedSeconds = estimateTargetSeconds(state, flight);
  const slotErrorSeconds = estimatedSeconds - target.targetSeconds;
  const status =
    slotErrorSeconds < -target.toleranceBeforeSeconds
      ? "early"
      : slotErrorSeconds > target.toleranceAfterSeconds
        ? "late"
        : "on-time";
  return {
    schemaVersion: 1,
    entryId: entry.id,
    recommendationId: `${direction}:${entry.id}:review`,
    targetId: target.id,
    targetKind: target.kind,
    targetSeconds: round(target.targetSeconds),
    estimatedSeconds: round(estimatedSeconds),
    slotErrorSeconds: round(slotErrorSeconds),
    toleranceBeforeSeconds: target.toleranceBeforeSeconds,
    toleranceAfterSeconds: target.toleranceAfterSeconds,
    status,
    commandArbiterRequired: true,
  };
}

export function flowTimingReason(
  context: ClearanceProposalFlowContext | null,
): string {
  if (!context) return "No active strategic meter target.";
  const magnitude = Math.abs(Math.round(context.slotErrorSeconds));
  return context.status === "on-time"
    ? `Meter target is within its ${context.toleranceBeforeSeconds}s early / ${context.toleranceAfterSeconds}s late tolerance.`
    : `Projected ${magnitude}s ${context.status} at ${targetLabel(context.targetKind)}.`;
}

function flowEntryForFlight(
  state: AirportState,
  flightId: number,
  direction: "arrival" | "departure",
): TrafficFlowEntry | undefined {
  return [
    ...state.trafficFlow.arrivalQueue,
    ...state.trafficFlow.departureQueue,
    ...state.trafficFlow.history,
  ]
    .reverse()
    .find(
      (entry) => entry.direction === direction && entry.flightId === flightId,
    );
}

function targetForFlight(
  entry: TrafficFlowEntry,
  direction: "arrival" | "departure",
) {
  const preferredKind =
    direction === "arrival" ? "runway-threshold" : "departure-release";
  return (
    [...entry.meterTargets]
      .reverse()
      .find((target) => target.kind === preferredKind) ??
    entry.meterTargets.at(-1)
  );
}

function estimateTargetSeconds(state: AirportState, flight: Flight): number {
  if (flight.phase === "takeoff" || flight.phase === "landing")
    return state.elapsed;
  return state.elapsed + Math.max(0, flight.duration - flight.phaseElapsed);
}

function targetLabel(kind: ClearanceProposalFlowContext["targetKind"]): string {
  if (kind === "runway-threshold") return "the runway threshold";
  if (kind === "arrival-meter-fix") return "the arrival meter fix";
  if (kind === "runway-crossing") return "the runway crossing";
  return "the departure release point";
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

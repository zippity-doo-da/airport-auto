import type {
  Flight,
  TrafficFlowConstraintCategory,
  TrafficFlowAdvisoryResponse,
  TrafficFlowEntry,
  TrafficFlowForecastHorizonSeconds,
  TrafficFlowMeterTarget,
  TrafficFlowObjective,
  TrafficFlowState,
} from "./types";
import { trafficDensityProfile, type TrafficDensity } from "./trafficDensity";

const MAX_TRAFFIC_HISTORY = 256;
const MAX_SLOT_REVISIONS = 12;

export const TRAFFIC_FLOW_OBJECTIVES: readonly TrafficFlowObjective[] = [
  "balanced",
  "minimum-holding",
  "minimum-taxi-delay",
  "weather-recovery",
  "watch-calm",
];

export const TRAFFIC_FLOW_FORECAST_HORIZONS: readonly TrafficFlowForecastHorizonSeconds[] =
  [300, 600, 900];

export function isTrafficFlowForecastHorizon(
  value: number,
): value is TrafficFlowForecastHorizonSeconds {
  return TRAFFIC_FLOW_FORECAST_HORIZONS.includes(
    value as TrafficFlowForecastHorizonSeconds,
  );
}

export interface TrafficFlowObjectiveProfile {
  id: TrafficFlowObjective;
  label: string;
  description: string;
  arrivalDemandIntervalMultiplier: number;
  arrivalSpacingMultiplier: number;
  departureSpacingMultiplier: number;
}

const TRAFFIC_FLOW_OBJECTIVE_PROFILES: Record<
  TrafficFlowObjective,
  TrafficFlowObjectiveProfile
> = {
  balanced: {
    id: "balanced",
    label: "Balanced",
    description:
      "Normal hub cadence with balanced arrival and departure pressure.",
    arrivalDemandIntervalMultiplier: 1,
    arrivalSpacingMultiplier: 1,
    departureSpacingMultiplier: 1,
  },
  "minimum-holding": {
    id: "minimum-holding",
    label: "Minimum Holding",
    description: "Meter arrivals earlier to keep airborne holding bounded.",
    arrivalDemandIntervalMultiplier: 1.18,
    arrivalSpacingMultiplier: 0.95,
    departureSpacingMultiplier: 1,
  },
  "minimum-taxi-delay": {
    id: "minimum-taxi-delay",
    label: "Minimum Taxi Delay",
    description: "Meter runway demand before surface queues form.",
    arrivalDemandIntervalMultiplier: 1.08,
    arrivalSpacingMultiplier: 1.06,
    departureSpacingMultiplier: 0.92,
  },
  "weather-recovery": {
    id: "weather-recovery",
    label: "Weather Recovery",
    description:
      "Build predictable recovery buffers around reduced-rate weather operations.",
    arrivalDemandIntervalMultiplier: 1.25,
    arrivalSpacingMultiplier: 1.24,
    departureSpacingMultiplier: 1.18,
  },
  "watch-calm": {
    id: "watch-calm",
    label: "Watch / Calm",
    description: "Favor low workload and spacious, unhurried movement.",
    arrivalDemandIntervalMultiplier: 1.55,
    arrivalSpacingMultiplier: 1.3,
    departureSpacingMultiplier: 1.28,
  },
};

export interface TrafficFlowExpiry {
  diverted: TrafficFlowEntry[];
  cancelled: TrafficFlowEntry[];
}

export interface TrafficFlowConstraint {
  category: TrafficFlowConstraintCategory;
  label: string;
}

/**
 * Converts existing deterministic slot reasons into a compact, stable UI
 * category. It never replaces the exact reason or affects scheduling.
 */
export function trafficFlowConstraint(reason: string): TrafficFlowConstraint {
  const copy = reason.toLowerCase();
  if (/weather|wind|storm|visibility|deicing|rwycc|runway condition/.test(copy))
    return { category: "weather", label: "Weather" };
  if (/wake|separation/.test(copy)) return { category: "wake", label: "Wake" };
  if (/gate|stand|terminal/.test(copy))
    return { category: "gate", label: "Gate" };
  if (/performance|compatible|safe exit|takeoff shortfall/.test(copy))
    return { category: "performance", label: "Performance" };
  if (/taxi|surface|route|crossing|pushback/.test(copy))
    return { category: "taxi", label: "Taxi" };
  if (/runway|approach|landing|departure envelope|protected/.test(copy))
    return { category: "runway", label: "Runway" };
  if (/capacity|budget|holding/.test(copy))
    return { category: "demand", label: "Demand" };
  return { category: "schedule", label: "Schedule" };
}

export interface TrafficFlowSnapshot {
  schemaVersion: 7;
  density: ReturnType<typeof trafficDensityProfile>;
  objective: TrafficFlowObjectiveProfile;
  nextArrivalDemandInSeconds: number;
  nextArrivalReleaseInSeconds: number;
  nextDepartureReleaseInSeconds: number;
  arrivalQueue: TrafficFlowEntry[];
  departureQueue: TrafficFlowEntry[];
  history: TrafficFlowEntry[];
  totals: TrafficFlowState["totals"];
  backPressure: {
    arrivalsHolding: number;
    departuresWaiting: number;
    oldestArrivalDelaySeconds: number;
    oldestDepartureDelaySeconds: number;
    holdingCapacity: number;
  };
  /**
   * A controller-facing, bounded look-ahead of scheduled demand and release
   * capacity.  This is derived from the authoritative meter slots; it is not
   * a second scheduler and never moves an aircraft.
   */
  capacityWindows: TrafficFlowCapacityWindow[];
  /**
   * Read-only planning guidance. Recommendations never mutate a flight or
   * release a slot; an accepted action must still pass the normal command and
   * safety arbiters.
   */
  recommendations: TrafficFlowRecommendation[];
  advisoryResponses: TrafficFlowAdvisoryResponseSnapshot[];
  forecastHorizonSeconds: TrafficFlowForecastHorizonSeconds;
}

export interface TrafficFlowAdvisoryResponseSnapshot extends TrafficFlowAdvisoryResponse {
  elapsedSeconds: number;
  additionalDelaySeconds: number;
  holdingFuelBurnDeltaKg: number;
  queueDelta: number;
  consequence: string;
}

export interface TrafficFlowRecommendation {
  id: string;
  entryId: string;
  direction: "arrival" | "departure";
  action:
    | "review-arrival-release"
    | "review-departure-release"
    | "resequence-earlier";
  priority: "routine" | "attention" | "urgent";
  flightId?: number;
  callsign?: string;
  targetSlotSeconds: number;
  rationale: string;
  authority: "approach" | "tower";
  advisoryOnly: true;
  requiresCommandArbiter: true;
  move?: TrafficFlowResequenceMove;
  displacedEntryId?: string;
  estimatedBenefitSeconds?: number;
  objective?: TrafficFlowObjective;
}

/** Pure planning inputs projected from authoritative flight state. */
export interface TrafficFlowSequenceCandidate {
  entryId: string;
  projectedTargetSeconds: number;
  readiness: number;
  urgency: number;
  blocker?: string;
}

export interface TrafficFlowCapacityWindow {
  direction: "arrival" | "departure";
  horizonSeconds: number;
  demandCount: number;
  /** Demand already represented by queued meter entries in the horizon. */
  predictedDemandCount: number;
  plannedReleaseCount: number;
  /** Release capacity projected after the currently known slots. */
  predictedCapacityCount: number;
  delayedCount: number;
  revisedCount: number;
  utilization: number;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
  attribution: TrafficFlowCapacityAttribution;
  uncertainty: {
    weather: number;
    wind: number;
    runwayCondition: number;
    pilotResponse: number;
    procedure: number;
    taxiCongestion: number;
    gateReadiness: number;
    downstreamSaturation: number;
  };
}

export interface TrafficFlowCapacityConstraintAttribution {
  category: TrafficFlowConstraintCategory;
  label: string;
  count: number;
  oldestWaitSeconds: number;
}

export interface TrafficFlowCapacityAttribution {
  schemaVersion: 1;
  configurationId: string;
  configurationName: string;
  runways: Array<{
    id: number;
    designation: string;
    role: "arrival" | "departure" | "mixed";
    closed: boolean;
  }>;
  usableRunwayCount: number;
  nominalSpacingSeconds: number;
  approachCapacity: number;
  constraints: TrafficFlowCapacityConstraintAttribution[];
}

export type TrafficFlowUncertainty = TrafficFlowCapacityWindow["uncertainty"];

export interface TrafficFlowForecastInput {
  arrivalDemandIntervalSeconds?: number;
  arrivalSpacingSeconds?: number;
  departureSpacingSeconds?: number;
  holdingFuelBurnKg?: number;
  uncertainty?: Partial<TrafficFlowUncertainty>;
  arrivalUncertainty?: Partial<TrafficFlowUncertainty>;
  departureUncertainty?: Partial<TrafficFlowUncertainty>;
  arrivalAttribution?: Partial<TrafficFlowCapacityAttribution>;
  departureAttribution?: Partial<TrafficFlowCapacityAttribution>;
  sequenceCandidates?: TrafficFlowSequenceCandidate[];
}

export function createTrafficFlowState(
  density: TrafficDensity = "realistic",
  nowSeconds = 0,
  firstArrivalDemandInSeconds = 2,
): TrafficFlowState {
  return {
    schemaVersion: 3,
    density,
    objective: "balanced",
    forecastHorizonSeconds: 300,
    nextDemandId: 1,
    nextArrivalDemandSeconds:
      nowSeconds + Math.max(0, firstArrivalDemandInSeconds),
    nextArrivalReleaseSeconds: nowSeconds,
    nextDepartureReleaseSeconds: nowSeconds,
    arrivalQueue: [],
    departureQueue: [],
    history: [],
    advisoryResponses: [],
    observedHoldingFuelBurnKg: 0,
    totals: {
      arrivalDemands: 0,
      departureDemands: 0,
      arrivalReleases: 0,
      departureReleases: 0,
      diversions: 0,
      cancellations: 0,
      gateSwaps: 0,
      runwayChanges: 0,
      routeAmendments: 0,
    },
  };
}

export function setTrafficFlowDensity(
  state: TrafficFlowState,
  density: TrafficDensity,
  nowSeconds: number,
): void {
  state.density = density;
  state.nextArrivalDemandSeconds = Math.max(
    nowSeconds,
    state.nextArrivalDemandSeconds,
  );
  refreshTrafficFlow(state, nowSeconds);
}

export function scheduleNextArrivalDemand(
  state: TrafficFlowState,
  nowSeconds: number,
  intervalSeconds: number,
): void {
  state.nextArrivalDemandSeconds = nowSeconds + Math.max(0.2, intervalSeconds);
}

export function enqueueArrivalDemand(
  state: TrafficFlowState,
  nowSeconds: number,
  reason: string,
): TrafficFlowEntry {
  const density = trafficDensityProfile(state.density);
  const entry = createEntry(
    state,
    "arrival",
    nowSeconds,
    Math.max(nowSeconds, state.nextArrivalReleaseSeconds),
    reason,
  );
  state.totals.arrivalDemands += 1;
  if (state.arrivalQueue.length >= density.holdingCapacity) {
    entry.status = "diverted";
    entry.reason = `${density.label} holding capacity ${density.holdingCapacity} reached; demand diverted before map entry`;
    entry.updatedAtSeconds = nowSeconds;
    state.totals.diversions += 1;
    archive(state, entry);
    return entry;
  }
  entry.status = state.arrivalQueue.length ? "holding" : "metered";
  state.arrivalQueue.push(entry);
  refreshTrafficFlow(state, nowSeconds);
  return entry;
}

export function registerDepartureDemand(
  state: TrafficFlowState,
  flight: Flight,
  nowSeconds: number,
  earliestReleaseSeconds: number,
  slotSpacingSeconds: number,
): TrafficFlowEntry {
  const existing = state.departureQueue.find(
    (entry) => entry.flightId === flight.id,
  );
  if (existing) {
    existing.callsign = flight.callsign;
    existing.runwayId = flight.departureRunway;
    reviseSlot(
      existing,
      nowSeconds,
      Math.max(existing.releaseSlotSeconds, earliestReleaseSeconds),
      "departure readiness revised",
    );
    refreshTrafficFlow(state, nowSeconds);
    return existing;
  }
  const precedingSlot =
    state.departureQueue.at(-1)?.releaseSlotSeconds ??
    state.nextDepartureReleaseSeconds;
  const releaseSlot = Math.max(
    nowSeconds,
    earliestReleaseSeconds,
    precedingSlot + (state.departureQueue.length ? slotSpacingSeconds : 0),
  );
  const entry = createEntry(
    state,
    "departure",
    nowSeconds,
    releaseSlot,
    "awaiting departure release slot",
  );
  entry.flightId = flight.id;
  entry.callsign = flight.callsign;
  entry.runwayId = flight.departureRunway;
  entry.status = releaseSlot <= nowSeconds + 1e-6 ? "metered" : "scheduled";
  state.departureQueue.push(entry);
  state.totals.departureDemands += 1;
  refreshTrafficFlow(state, nowSeconds);
  return entry;
}

/**
 * Replaces the derived meter sequence on an existing authoritative slot.
 * Callers provide route-aware targets; this function supplies stable cloning
 * and ordering without releasing or moving the aircraft.
 */
export function setTrafficFlowMeterTargets(
  entry: TrafficFlowEntry,
  targets: readonly TrafficFlowMeterTarget[],
): void {
  entry.meterTargets = [...targets]
    .sort((first, second) =>
      first.targetSeconds === second.targetSeconds
        ? first.id.localeCompare(second.id)
        : first.targetSeconds - second.targetSeconds,
    )
    .map((target) => ({ ...target }));
}

export function markArrivalHolding(
  state: TrafficFlowState,
  entry: TrafficFlowEntry,
  nowSeconds: number,
  reason: string,
  retryAfterSeconds = 0,
): void {
  entry.status = "holding";
  entry.reason = reason;
  entry.constraintCategory = trafficFlowConstraint(reason).category;
  entry.updatedAtSeconds = nowSeconds;
  entry.attempts += 1;
  reviseSlot(
    entry,
    nowSeconds,
    Math.max(
      entry.releaseSlotSeconds,
      nowSeconds + Math.max(0, retryAfterSeconds),
    ),
    reason,
  );
  refreshTrafficFlow(state, nowSeconds);
}

export function isTrafficFlowObjective(
  value: string,
): value is TrafficFlowObjective {
  return TRAFFIC_FLOW_OBJECTIVES.includes(value as TrafficFlowObjective);
}

export function trafficFlowObjectiveProfile(
  objective: TrafficFlowObjective,
): TrafficFlowObjectiveProfile {
  return TRAFFIC_FLOW_OBJECTIVE_PROFILES[objective];
}

export function setTrafficFlowObjective(
  state: TrafficFlowState,
  objective: TrafficFlowObjective,
  nowSeconds: number,
): void {
  state.objective = objective;
  refreshTrafficFlow(state, nowSeconds);
}

export function setTrafficFlowForecastHorizon(
  state: TrafficFlowState,
  seconds: TrafficFlowForecastHorizonSeconds,
): void {
  state.forecastHorizonSeconds = seconds;
}

export type TrafficFlowResequenceMove = "earlier" | "later";

export interface TrafficFlowResequenceResult {
  accepted: boolean;
  reason: string;
  movedEntryId?: string;
  displacedEntryId?: string;
}

/**
 * Exchanges one entry with its immediate neighbor and transfers the complete
 * slot envelope through the normal revision path. This changes schedule order
 * only: it grants no clearance, reserves no resource, and moves no aircraft.
 */
export function resequenceTrafficFlowEntry(
  state: TrafficFlowState,
  direction: TrafficFlowEntry["direction"],
  entryId: string,
  move: TrafficFlowResequenceMove,
  nowSeconds: number,
  freezeSeconds = 10,
  expectedAdjacentEntryId?: string,
): TrafficFlowResequenceResult {
  const queue =
    direction === "arrival" ? state.arrivalQueue : state.departureQueue;
  const index = queue.findIndex((entry) => entry.id === entryId);
  if (index < 0)
    return {
      accepted: false,
      reason: `${direction} meter entry is no longer active`,
    };
  const targetIndex = index + (move === "earlier" ? -1 : 1);
  if (targetIndex < 0 || targetIndex >= queue.length)
    return {
      accepted: false,
      reason: `${entryLabel(queue[index])} is already ${move === "earlier" ? "first" : "last"} in the ${direction} sequence`,
    };
  const entry = queue[index];
  const neighbor = queue[targetIndex];
  if (expectedAdjacentEntryId && neighbor.id !== expectedAdjacentEntryId)
    return {
      accepted: false,
      reason: `${entryLabel(entry)} sequence changed before approval; expected ${expectedAdjacentEntryId} adjacent but found ${neighbor.id}`,
    };
  const frozen = [entry, neighbor].find(
    (candidate) => candidate.releaseSlotSeconds <= nowSeconds + freezeSeconds,
  );
  if (frozen)
    return {
      accepted: false,
      reason: `${entryLabel(frozen)} is inside the ${freezeSeconds}-second release freeze; use tactical clearances or wait for release`,
    };

  const entrySlot = entry.releaseSlotSeconds;
  const neighborSlot = neighbor.releaseSlotSeconds;
  queue[index] = neighbor;
  queue[targetIndex] = entry;
  const movedReason = `${direction} sequence revised: ${entryLabel(entry)} moved ${move} ${entryLabel(neighbor)}`;
  const displacedReason = `${direction} sequence revised: ${entryLabel(neighbor)} moved ${move === "earlier" ? "later behind" : "earlier ahead of"} ${entryLabel(entry)}`;
  entry.reason = movedReason;
  entry.updatedAtSeconds = nowSeconds;
  neighbor.reason = displacedReason;
  neighbor.updatedAtSeconds = nowSeconds;
  reviseSlot(entry, nowSeconds, neighborSlot, movedReason, true);
  reviseSlot(neighbor, nowSeconds, entrySlot, displacedReason, true);
  refreshTrafficFlow(state, nowSeconds);
  return {
    accepted: true,
    reason: `${entryLabel(entry)} moved ${move}; ${entryLabel(neighbor)} now follows in the ${direction} sequence`,
    movedEntryId: entry.id,
    displacedEntryId: neighbor.id,
  };
}

export function releaseArrivalDemand(
  state: TrafficFlowState,
  entry: TrafficFlowEntry,
  nowSeconds: number,
  flight: Flight,
  nextSlotSpacingSeconds: number,
): void {
  removeEntry(state.arrivalQueue, entry);
  entry.status = "released";
  entry.updatedAtSeconds = nowSeconds;
  entry.delaySeconds = Math.max(0, nowSeconds - entry.scheduledAtSeconds);
  entry.reason = `${flight.callsign} released to runway ${flight.runway + 1}`;
  entry.constraintCategory = "runway";
  entry.flightId = flight.id;
  entry.callsign = flight.callsign;
  entry.runwayId = flight.runway;
  setTrafficFlowMeterTargets(entry, [
    {
      schemaVersion: 1,
      id: `${entry.id}:arrival-meter-fix`,
      kind: "arrival-meter-fix",
      label:
        flight.flightPlan.procedureProfile.transitionName ||
        flight.flightPlan.route[0] ||
        "Arrival meter fix",
      targetSeconds: entry.releaseSlotSeconds,
      toleranceBeforeSeconds: 5,
      toleranceAfterSeconds: 8,
    },
    {
      schemaVersion: 1,
      id: `${entry.id}:runway-threshold:${flight.runway}`,
      kind: "runway-threshold",
      label: `Runway ${flight.flightPlan.runwayIntent.designation} threshold`,
      targetSeconds: nowSeconds + Math.max(0, flight.duration),
      toleranceBeforeSeconds: 3,
      toleranceAfterSeconds: 6,
      runwayId: flight.runway,
    },
  ]);
  state.nextArrivalReleaseSeconds =
    nowSeconds + Math.max(0.2, nextSlotSpacingSeconds);
  state.totals.arrivalReleases += 1;
  archive(state, entry);
  refreshTrafficFlow(state, nowSeconds);
}

export function releaseDepartureDemand(
  state: TrafficFlowState,
  entry: TrafficFlowEntry,
  nowSeconds: number,
  nextSlotSpacingSeconds: number,
): void {
  removeEntry(state.departureQueue, entry);
  entry.status = "released";
  entry.updatedAtSeconds = nowSeconds;
  entry.delaySeconds = Math.max(0, nowSeconds - entry.scheduledAtSeconds);
  entry.reason = `${entry.callsign ?? "departure"} released from the gate bank`;
  entry.constraintCategory = "schedule";
  state.nextDepartureReleaseSeconds =
    nowSeconds + Math.max(0.2, nextSlotSpacingSeconds);
  state.totals.departureReleases += 1;
  archive(state, entry);
  refreshTrafficFlow(state, nowSeconds);
}

export function expireTrafficFlow(
  state: TrafficFlowState,
  nowSeconds: number,
): TrafficFlowExpiry {
  const density = trafficDensityProfile(state.density);
  const diverted: TrafficFlowEntry[] = [];
  const cancelled: TrafficFlowEntry[] = [];
  for (const entry of [...state.arrivalQueue]) {
    if (
      nowSeconds - entry.scheduledAtSeconds <
      density.maximumArrivalDelaySeconds
    )
      continue;
    removeEntry(state.arrivalQueue, entry);
    entry.status = "diverted";
    entry.updatedAtSeconds = nowSeconds;
    entry.delaySeconds = nowSeconds - entry.scheduledAtSeconds;
    entry.reason = `arrival metering exceeded ${density.maximumArrivalDelaySeconds}s; diverted before map entry`;
    entry.constraintCategory = "demand";
    state.totals.diversions += 1;
    archive(state, entry);
    diverted.push(entry);
  }
  for (const entry of [...state.departureQueue]) {
    if (
      nowSeconds - entry.scheduledAtSeconds <
      density.maximumDepartureDelaySeconds
    )
      continue;
    removeEntry(state.departureQueue, entry);
    entry.status = "cancelled";
    entry.updatedAtSeconds = nowSeconds;
    entry.delaySeconds = nowSeconds - entry.scheduledAtSeconds;
    entry.reason = `departure release exceeded ${density.maximumDepartureDelaySeconds}s; slot cancelled and replanning required`;
    entry.constraintCategory = "schedule";
    state.totals.cancellations += 1;
    archive(state, entry);
    cancelled.push(entry);
  }
  refreshTrafficFlow(state, nowSeconds);
  return { diverted, cancelled };
}

export function removeDepartureDemand(
  state: TrafficFlowState,
  flightId: number,
): void {
  const entry = state.departureQueue.find(
    (candidate) => candidate.flightId === flightId,
  );
  if (entry) removeEntry(state.departureQueue, entry);
}

export function refreshTrafficFlow(
  state: TrafficFlowState,
  nowSeconds: number,
): void {
  for (const [index, entry] of state.arrivalQueue.entries()) {
    entry.delaySeconds = Math.max(0, nowSeconds - entry.scheduledAtSeconds);
    entry.updatedAtSeconds = nowSeconds;
    if (entry.status !== "holding")
      entry.status =
        index === 0 && entry.releaseSlotSeconds <= nowSeconds
          ? "metered"
          : "scheduled";
  }
  for (const entry of state.departureQueue) {
    entry.delaySeconds = Math.max(0, nowSeconds - entry.scheduledAtSeconds);
    entry.updatedAtSeconds = nowSeconds;
    entry.status =
      entry.releaseSlotSeconds <= nowSeconds ? "metered" : "scheduled";
  }
}

export function trafficFlowSnapshot(
  state: TrafficFlowState,
  nowSeconds: number,
  forecast: TrafficFlowForecastInput = {},
): TrafficFlowSnapshot {
  refreshTrafficFlow(state, nowSeconds);
  const density = trafficDensityProfile(state.density);
  const forecastHorizonSeconds = isTrafficFlowForecastHorizon(
    state.forecastHorizonSeconds,
  )
    ? state.forecastHorizonSeconds
    : 300;
  const capacityWindows = [
    capacityWindow(
      "arrival",
      state.arrivalQueue,
      nowSeconds,
      forecast.arrivalDemandIntervalSeconds,
      forecast.arrivalSpacingSeconds,
      mergeUncertainty(forecast.uncertainty, forecast.arrivalUncertainty),
      forecastHorizonSeconds,
      forecast.arrivalAttribution,
    ),
    capacityWindow(
      "departure",
      state.departureQueue,
      nowSeconds,
      forecast.departureSpacingSeconds,
      forecast.departureSpacingSeconds,
      mergeUncertainty(forecast.uncertainty, forecast.departureUncertainty),
      forecastHorizonSeconds,
      forecast.departureAttribution,
    ),
  ];
  const recommendations = flowRecommendations(
    state,
    nowSeconds,
    false,
    forecast.sequenceCandidates,
  );
  const advisoryResponses = (state.advisoryResponses ?? [])
    .slice(-12)
    .map((response) =>
      advisoryResponseSnapshot(
        response,
        state,
        nowSeconds,
        forecast.holdingFuelBurnKg ??
          state.observedHoldingFuelBurnKg ??
          response.baselineHoldingFuelBurnKg,
      ),
    );
  return {
    schemaVersion: 7,
    density: { ...density, assumptions: [...density.assumptions] },
    objective: { ...trafficFlowObjectiveProfile(state.objective) },
    nextArrivalDemandInSeconds: round(
      Math.max(0, state.nextArrivalDemandSeconds - nowSeconds),
    ),
    nextArrivalReleaseInSeconds: round(
      Math.max(0, state.nextArrivalReleaseSeconds - nowSeconds),
    ),
    nextDepartureReleaseInSeconds: round(
      Math.max(0, state.nextDepartureReleaseSeconds - nowSeconds),
    ),
    arrivalQueue: state.arrivalQueue.map(cloneEntry),
    departureQueue: state.departureQueue.map(cloneEntry),
    history: state.history.map(cloneEntry),
    totals: { ...state.totals },
    backPressure: {
      arrivalsHolding: state.arrivalQueue.length,
      departuresWaiting: state.departureQueue.length,
      oldestArrivalDelaySeconds: round(
        Math.max(0, ...state.arrivalQueue.map((entry) => entry.delaySeconds)),
      ),
      oldestDepartureDelaySeconds: round(
        Math.max(0, ...state.departureQueue.map((entry) => entry.delaySeconds)),
      ),
      holdingCapacity: density.holdingCapacity,
    },
    capacityWindows,
    recommendations,
    advisoryResponses,
    forecastHorizonSeconds,
  };
}

export interface TrafficFlowAdvisoryResponseResult {
  accepted: boolean;
  reason: string;
  response?: TrafficFlowAdvisoryResponse;
}

export function ignoreTrafficFlowRecommendation(
  state: TrafficFlowState,
  recommendationId: string,
  nowSeconds: number,
  holdingFuelBurnKg: number,
): TrafficFlowAdvisoryResponseResult {
  const existing = (state.advisoryResponses ?? []).find(
    (response) => response.recommendationId === recommendationId,
  );
  if (existing)
    return {
      accepted: false,
      reason:
        existing.status === "ignored"
          ? "flow advisory is already ignored"
          : "flow advisory was already recovered",
      response: existing,
    };
  const recommendation = flowRecommendations(state, nowSeconds, true).find(
    (candidate) => candidate.id === recommendationId,
  );
  if (!recommendation)
    return { accepted: false, reason: "flow advisory is no longer active" };
  const entries =
    recommendation.direction === "arrival"
      ? state.arrivalQueue
      : state.departureQueue;
  const advisedEntry = entries.find(
    (entry) => entry.id === recommendation.entryId,
  );
  const response: TrafficFlowAdvisoryResponse = {
    schemaVersion: 1,
    recommendationId,
    entryId: recommendation.entryId,
    direction: recommendation.direction,
    authority: recommendation.authority,
    status: "ignored",
    ignoredAtSeconds: nowSeconds,
    objectiveBefore: state.objective,
    baselineDelaySeconds: advisedEntry?.delaySeconds ?? 0,
    baselineHoldingFuelBurnKg: Math.max(0, holdingFuelBurnKg),
    baselineQueueLength: entries.length,
    ...(recommendation.flightId === undefined
      ? {}
      : { flightId: recommendation.flightId }),
    ...(recommendation.callsign ? { callsign: recommendation.callsign } : {}),
  };
  state.advisoryResponses ??= [];
  state.advisoryResponses.push(response);
  if (state.advisoryResponses.length > 32)
    state.advisoryResponses.splice(0, state.advisoryResponses.length - 32);
  return {
    accepted: true,
    reason: `${recommendation.direction} flow advisory ignored; operational delay and fuel consequences remain live`,
    response,
  };
}

export function recoverTrafficFlowRecommendation(
  state: TrafficFlowState,
  recommendationId: string,
  nowSeconds: number,
  recoveryObjective: TrafficFlowObjective,
): TrafficFlowAdvisoryResponseResult {
  const response = (state.advisoryResponses ?? []).find(
    (candidate) => candidate.recommendationId === recommendationId,
  );
  if (!response)
    return {
      accepted: false,
      reason: "ignore the flow advisory before recovering it",
    };
  if (response.status !== "ignored")
    return {
      accepted: false,
      reason: "flow advisory recovery was already recorded",
      response,
    };
  response.status = "recovered";
  response.recoveredAtSeconds = nowSeconds;
  response.recoveryObjective = recoveryObjective;
  return {
    accepted: true,
    reason: `${trafficFlowObjectiveProfile(recoveryObjective).label} recovery selected; aircraft remain subject to normal clearances and safety arbitration`,
    response,
  };
}

function flowRecommendations(
  state: TrafficFlowState,
  nowSeconds: number,
  includeResponded = false,
  sequenceCandidates: TrafficFlowSequenceCandidate[] = [],
): TrafficFlowRecommendation[] {
  const recommendations: TrafficFlowRecommendation[] = [];
  const arrival = state.arrivalQueue[0];
  if (arrival) {
    const wait = Math.max(0, arrival.releaseSlotSeconds - nowSeconds);
    recommendations.push({
      id: `arrival:${arrival.id}:review`,
      entryId: arrival.id,
      direction: "arrival",
      action: "review-arrival-release",
      priority:
        arrival.status === "holding" || arrival.delaySeconds > 30
          ? "attention"
          : "routine",
      flightId: arrival.flightId,
      callsign: arrival.callsign,
      targetSlotSeconds: Math.max(nowSeconds, arrival.releaseSlotSeconds),
      rationale: arrival.reason,
      authority: "approach",
      advisoryOnly: true,
      requiresCommandArbiter: true,
    });
    // Do not expose a second lower-priority arrival recommendation while the
    // first meter point is unresolved.
    if (wait > 0 && state.arrivalQueue.length > 1) {
      const next = state.arrivalQueue[1];
      recommendations.push({
        id: `arrival:${next.id}:review`,
        entryId: next.id,
        direction: "arrival",
        action: "review-arrival-release",
        priority: "routine",
        flightId: next.flightId,
        callsign: next.callsign,
        targetSlotSeconds: Math.max(nowSeconds, next.releaseSlotSeconds),
        rationale: `Queued behind ${arrival.callsign ?? "the leading arrival"}; preserve the existing meter order.`,
        authority: "approach",
        advisoryOnly: true,
        requiresCommandArbiter: true,
      });
    }
  }
  const departure = state.departureQueue[0];
  if (departure) {
    recommendations.push({
      id: `departure:${departure.id}:review`,
      entryId: departure.id,
      direction: "departure",
      action: "review-departure-release",
      priority: departure.delaySeconds > 45 ? "attention" : "routine",
      flightId: departure.flightId,
      callsign: departure.callsign,
      targetSlotSeconds: Math.max(nowSeconds, departure.releaseSlotSeconds),
      rationale: departure.reason,
      authority: "tower",
      advisoryOnly: true,
      requiresCommandArbiter: true,
    });
  }
  for (const direction of ["arrival", "departure"] as const) {
    const sequence = sequenceChangeRecommendation(
      state,
      direction,
      nowSeconds,
      sequenceCandidates,
    );
    if (sequence) recommendations.push(sequence);
  }
  if (includeResponded) return recommendations;
  const responded = new Set(
    (state.advisoryResponses ?? []).map(
      (response) => response.recommendationId,
    ),
  );
  return recommendations.filter(
    (recommendation) => !responded.has(recommendation.id),
  );
}

function sequenceChangeRecommendation(
  state: TrafficFlowState,
  direction: TrafficFlowEntry["direction"],
  nowSeconds: number,
  candidates: TrafficFlowSequenceCandidate[],
): TrafficFlowRecommendation | null {
  const queue =
    direction === "arrival" ? state.arrivalQueue : state.departureQueue;
  if (queue.length < 2 || candidates.length < 2) return null;
  const candidateByEntry = new Map(
    candidates.map((candidate) => [candidate.entryId, candidate]),
  );
  const objectiveProfile = trafficFlowObjectiveProfile(state.objective);
  const directionalWeight =
    state.objective === "minimum-holding"
      ? direction === "arrival"
        ? 1.35
        : 0.75
      : state.objective === "minimum-taxi-delay"
        ? direction === "departure"
          ? 1.35
          : 0.75
        : state.objective === "weather-recovery"
          ? 1.15
          : state.objective === "watch-calm"
            ? 0.75
            : 1;
  const threshold = state.objective === "watch-calm" ? 40 : 20;
  let best:
    | {
        entry: TrafficFlowEntry;
        leader: TrafficFlowEntry;
        benefit: number;
        rationale: string;
      }
    | undefined;

  for (let index = 1; index < Math.min(queue.length, 6); index += 1) {
    const leader = queue[index - 1];
    const entry = queue[index];
    if (
      leader.releaseSlotSeconds <= nowSeconds + 10 ||
      entry.releaseSlotSeconds <= nowSeconds + 10
    )
      continue;
    const leaderCandidate = candidateByEntry.get(leader.id);
    const entryCandidate = candidateByEntry.get(entry.id);
    if (!leaderCandidate || !entryCandidate || entryCandidate.readiness < 0.35)
      continue;

    const currentTimingCost =
      Math.abs(
        leaderCandidate.projectedTargetSeconds - leader.releaseSlotSeconds,
      ) +
      Math.abs(
        entryCandidate.projectedTargetSeconds - entry.releaseSlotSeconds,
      );
    const swappedTimingCost =
      Math.abs(
        leaderCandidate.projectedTargetSeconds - entry.releaseSlotSeconds,
      ) +
      Math.abs(
        entryCandidate.projectedTargetSeconds - leader.releaseSlotSeconds,
      );
    const timingBenefit = Math.max(0, currentTimingCost - swappedTimingCost);
    const readinessBenefit = Math.max(
      0,
      (entryCandidate.readiness - leaderCandidate.readiness) * 60,
    );
    const urgencyBenefit = Math.max(
      0,
      (entryCandidate.urgency - leaderCandidate.urgency) * 45,
    );
    const blockedLeaderBenefit =
      leaderCandidate.blocker && !entryCandidate.blocker ? 25 : 0;
    const benefit =
      (timingBenefit +
        readinessBenefit +
        urgencyBenefit +
        blockedLeaderBenefit) *
      directionalWeight;
    if (benefit < threshold || (best && benefit <= best.benefit)) continue;

    const reasons = [
      `${entryLabel(entry)} is operationally ready ahead of ${entryLabel(leader)}`,
      timingBenefit >= 1
        ? `the adjacent swap reduces projected meter error by about ${Math.round(timingBenefit)} seconds`
        : "the adjacent swap releases the more ready operation first",
      leaderCandidate.blocker
        ? `${entryLabel(leader)} remains constrained by ${leaderCandidate.blocker}`
        : null,
    ].filter((reason): reason is string => Boolean(reason));
    best = {
      entry,
      leader,
      benefit,
      rationale: `${objectiveProfile.label}: ${reasons.join("; ")}. Approval rechecks the expected neighbor, release freeze, and station authority; any later movement still passes the clearance, reservation, wake, and runway-safety arbiters.`,
    };
  }

  if (!best) return null;
  return {
    id: `sequence:${direction}:${best.entry.id}:${best.leader.id}`,
    entryId: best.entry.id,
    direction,
    action: "resequence-earlier",
    priority: best.benefit >= 70 ? "attention" : "routine",
    ...(best.entry.flightId === undefined
      ? {}
      : { flightId: best.entry.flightId }),
    ...(best.entry.callsign ? { callsign: best.entry.callsign } : {}),
    targetSlotSeconds: best.leader.releaseSlotSeconds,
    rationale: best.rationale,
    authority: direction === "arrival" ? "approach" : "tower",
    advisoryOnly: true,
    requiresCommandArbiter: true,
    move: "earlier",
    displacedEntryId: best.leader.id,
    estimatedBenefitSeconds: round(best.benefit),
    objective: state.objective,
  };
}

function advisoryResponseSnapshot(
  response: TrafficFlowAdvisoryResponse,
  state: TrafficFlowState,
  nowSeconds: number,
  holdingFuelBurnKg: number,
): TrafficFlowAdvisoryResponseSnapshot {
  const entries =
    response.direction === "arrival"
      ? state.arrivalQueue
      : state.departureQueue;
  const advisedEntry = [...entries, ...state.history].find(
    (entry) => entry.id === response.entryId,
  );
  const elapsedSeconds = Math.max(
    0,
    (response.recoveredAtSeconds ?? nowSeconds) - response.ignoredAtSeconds,
  );
  const additionalDelaySeconds = Math.max(
    0,
    (advisedEntry?.delaySeconds ?? response.baselineDelaySeconds) -
      response.baselineDelaySeconds,
  );
  const holdingFuelBurnDeltaKg = Math.max(
    0,
    holdingFuelBurnKg - response.baselineHoldingFuelBurnKg,
  );
  const queueDelta = entries.length - response.baselineQueueLength;
  const recovery = response.recoveryObjective
    ? ` · ${trafficFlowObjectiveProfile(response.recoveryObjective).label} recovery active`
    : "";
  return {
    ...response,
    elapsedSeconds: round(elapsedSeconds),
    additionalDelaySeconds: round(additionalDelaySeconds),
    holdingFuelBurnDeltaKg: round(holdingFuelBurnDeltaKg),
    queueDelta,
    consequence: `${response.status === "ignored" ? "Ignored" : "Recovered"} ${Math.round(elapsedSeconds)}s · +${Math.round(additionalDelaySeconds)}s queue delay · +${holdingFuelBurnDeltaKg.toFixed(1)} kg holding fuel · queue ${queueDelta >= 0 ? "+" : ""}${queueDelta}${recovery}`,
  };
}

function capacityWindow(
  direction: TrafficFlowCapacityWindow["direction"],
  entries: TrafficFlowEntry[],
  nowSeconds: number,
  demandIntervalSeconds = 60,
  releaseSpacingSeconds = 60,
  uncertaintyInput: Partial<TrafficFlowCapacityWindow["uncertainty"]> = {},
  horizonSeconds: TrafficFlowForecastHorizonSeconds = 300,
  attributionInput: Partial<TrafficFlowCapacityAttribution> = {},
): TrafficFlowCapacityWindow {
  const horizon = nowSeconds + horizonSeconds;
  const inWindow = entries.filter(
    (entry) => entry.scheduledAtSeconds <= horizon,
  );
  const plannedReleaseCount = inWindow.filter(
    (entry) => entry.releaseSlotSeconds <= horizon,
  ).length;
  const delayedCount = inWindow.filter(
    (entry) => entry.delaySeconds > 0.5,
  ).length;
  const revisedCount = inWindow.filter(
    (entry) => entry.slotRevisions.length > 1,
  ).length;
  const demandCount = inWindow.length;
  const latestDemandAt = inWindow.reduce(
    (latest, entry) => Math.max(latest, entry.scheduledAtSeconds),
    nowSeconds,
  );
  const latestReleaseAt = inWindow.reduce(
    (latest, entry) => Math.max(latest, entry.releaseSlotSeconds),
    nowSeconds,
  );
  const forecastDemandCount =
    demandCount +
    Math.max(
      0,
      Math.ceil(
        Math.max(0, horizon - latestDemandAt) /
          Math.max(1, demandIntervalSeconds),
      ),
    );
  const forecastCapacityCount =
    plannedReleaseCount +
    Math.max(
      0,
      Math.floor(
        Math.max(0, horizon - latestReleaseAt) /
          Math.max(1, releaseSpacingSeconds),
      ),
    );
  const uncertainty = {
    weather: clamp01(uncertaintyInput.weather ?? 0),
    wind: clamp01(uncertaintyInput.wind ?? 0),
    runwayCondition: clamp01(uncertaintyInput.runwayCondition ?? 0),
    pilotResponse: clamp01(uncertaintyInput.pilotResponse ?? 0),
    procedure: clamp01(uncertaintyInput.procedure ?? 0),
    taxiCongestion: clamp01(uncertaintyInput.taxiCongestion ?? 0),
    gateReadiness: clamp01(uncertaintyInput.gateReadiness ?? 0),
    downstreamSaturation: clamp01(uncertaintyInput.downstreamSaturation ?? 0),
  };
  const environmentalUncertainty =
    (uncertainty.weather +
      uncertainty.wind +
      uncertainty.runwayCondition +
      uncertainty.pilotResponse) /
    4;
  const operationalUncertainty =
    (uncertainty.taxiCongestion +
      uncertainty.gateReadiness +
      uncertainty.downstreamSaturation) /
    3;
  const uncertaintyScore = Math.max(
    environmentalUncertainty,
    uncertainty.procedure,
    operationalUncertainty,
  );
  const utilization = forecastDemandCount
    ? Number(
        Math.min(
          1,
          forecastDemandCount /
            Math.max(1, forecastCapacityCount * (1 - uncertaintyScore * 0.35)),
        ).toFixed(3),
      )
    : 0;
  const confidence =
    delayedCount >= 3 || revisedCount >= 3 || uncertaintyScore >= 0.45
      ? "low"
      : delayedCount > 0 || revisedCount > 0 || uncertaintyScore >= 0.18
        ? "medium"
        : "high";
  const uncertaintyLabels = Object.entries(uncertainty)
    .filter(([, value]) => value >= 0.1)
    .map(
      ([key, value]) =>
        `${UNCERTAINTY_LABELS[key as keyof TrafficFlowUncertainty]} ${(value * 100).toFixed(0)}%`,
    );
  const confidenceReason =
    confidence === "low"
      ? `Several slots are delayed/revised or uncertain${uncertaintyLabels.length ? ` (${uncertaintyLabels.join(", ")})` : ""}.`
      : confidence === "medium"
        ? `Some slots moved from their initial plan${uncertaintyLabels.length ? `; uncertainty ${uncertaintyLabels.join(", ")}` : ""}.`
        : "No delayed, revised, or materially uncertain slots in the look-ahead.";
  const attribution = normalizeCapacityAttribution(
    direction,
    releaseSpacingSeconds,
    attributionInput,
  );
  return {
    direction,
    horizonSeconds,
    demandCount,
    predictedDemandCount: forecastDemandCount,
    plannedReleaseCount,
    predictedCapacityCount: forecastCapacityCount,
    delayedCount,
    revisedCount,
    utilization,
    confidence,
    confidenceReason,
    attribution,
    uncertainty,
  };
}

const UNCERTAINTY_LABELS: Record<keyof TrafficFlowUncertainty, string> = {
  weather: "weather",
  wind: "wind",
  runwayCondition: "runway condition",
  pilotResponse: "pilot response",
  procedure: "procedure",
  taxiCongestion: "taxi congestion",
  gateReadiness: "gate readiness",
  downstreamSaturation: "downstream saturation",
};

function normalizeCapacityAttribution(
  direction: TrafficFlowCapacityWindow["direction"],
  nominalSpacingSeconds: number,
  input: Partial<TrafficFlowCapacityAttribution>,
): TrafficFlowCapacityAttribution {
  const runways = (input.runways ?? []).map((runway) => ({ ...runway }));
  return {
    schemaVersion: 1,
    configurationId: input.configurationId ?? "unknown",
    configurationName: input.configurationName ?? "Unspecified runway plan",
    runways,
    usableRunwayCount:
      input.usableRunwayCount ??
      runways.filter((runway) => !runway.closed).length,
    nominalSpacingSeconds: round(
      input.nominalSpacingSeconds ?? nominalSpacingSeconds,
    ),
    approachCapacity:
      direction === "arrival" ? Math.max(1, input.approachCapacity ?? 1) : 0,
    constraints: (input.constraints ?? []).map((constraint) => ({
      ...constraint,
    })),
  };
}

function mergeUncertainty(
  baseline: Partial<TrafficFlowUncertainty> | undefined,
  directional: Partial<TrafficFlowUncertainty> | undefined,
): Partial<TrafficFlowUncertainty> {
  return { ...baseline, ...directional };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function cloneTrafficFlowState(
  state: TrafficFlowState,
): TrafficFlowState {
  return {
    ...state,
    schemaVersion: 3,
    forecastHorizonSeconds: isTrafficFlowForecastHorizon(
      state.forecastHorizonSeconds,
    )
      ? state.forecastHorizonSeconds
      : 300,
    arrivalQueue: state.arrivalQueue.map(cloneEntry),
    departureQueue: state.departureQueue.map(cloneEntry),
    history: state.history.map(cloneEntry),
    advisoryResponses: (state.advisoryResponses ?? []).map((response) => ({
      ...response,
    })),
    observedHoldingFuelBurnKg: state.observedHoldingFuelBurnKg ?? 0,
    totals: { ...state.totals },
  };
}

function createEntry(
  state: TrafficFlowState,
  direction: TrafficFlowEntry["direction"],
  nowSeconds: number,
  releaseSlotSeconds: number,
  reason: string,
): TrafficFlowEntry {
  const id = `${direction === "arrival" ? "ARR" : "DEP"}-${state.nextDemandId++}`;
  const constraintCategory = trafficFlowConstraint(reason).category;
  return {
    id,
    direction,
    status: "scheduled",
    createdAtSeconds: nowSeconds,
    scheduledAtSeconds: nowSeconds,
    releaseSlotSeconds,
    updatedAtSeconds: nowSeconds,
    delaySeconds: 0,
    attempts: 0,
    reason,
    constraintCategory,
    slotRevisions: [
      {
        atSeconds: nowSeconds,
        releaseSlotSeconds,
        reason,
        category: constraintCategory,
      },
    ],
    meterTargets: [
      {
        schemaVersion: 1,
        id: `${id}:${direction === "arrival" ? "arrival-meter-fix" : "departure-release"}`,
        kind:
          direction === "arrival" ? "arrival-meter-fix" : "departure-release",
        label:
          direction === "arrival" ? "Arrival meter fix" : "Departure release",
        targetSeconds: releaseSlotSeconds,
        toleranceBeforeSeconds: direction === "arrival" ? 5 : 0,
        toleranceAfterSeconds: direction === "arrival" ? 8 : 5,
      },
    ],
  };
}

function archive(state: TrafficFlowState, entry: TrafficFlowEntry): void {
  state.history.push(cloneEntry(entry));
  if (state.history.length > MAX_TRAFFIC_HISTORY)
    state.history.splice(0, state.history.length - MAX_TRAFFIC_HISTORY);
}

function removeEntry(
  entries: TrafficFlowEntry[],
  entry: TrafficFlowEntry,
): void {
  const index = entries.indexOf(entry);
  if (index >= 0) entries.splice(index, 1);
}

function cloneEntry(entry: TrafficFlowEntry): TrafficFlowEntry {
  return {
    ...entry,
    slotRevisions: (
      entry.slotRevisions ?? [
        {
          atSeconds: entry.updatedAtSeconds,
          releaseSlotSeconds: entry.releaseSlotSeconds,
          reason: entry.reason,
          category:
            entry.constraintCategory ??
            trafficFlowConstraint(entry.reason).category,
        },
      ]
    ).map((revision) => ({ ...revision })),
    meterTargets: (
      entry.meterTargets ?? [
        {
          schemaVersion: 1,
          id: `${entry.id}:${entry.direction === "arrival" ? "arrival-meter-fix" : "departure-release"}`,
          kind:
            entry.direction === "arrival"
              ? "arrival-meter-fix"
              : "departure-release",
          label:
            entry.direction === "arrival"
              ? "Arrival meter fix"
              : "Departure release",
          targetSeconds: entry.releaseSlotSeconds,
          toleranceBeforeSeconds: entry.direction === "arrival" ? 5 : 0,
          toleranceAfterSeconds: entry.direction === "arrival" ? 8 : 5,
        } satisfies TrafficFlowMeterTarget,
      ]
    ).map((target) => ({ ...target })),
  };
}

function reviseSlot(
  entry: TrafficFlowEntry,
  nowSeconds: number,
  releaseSlotSeconds: number,
  reason: string,
  forceRevision = false,
): void {
  if (
    !forceRevision &&
    Math.abs(entry.releaseSlotSeconds - releaseSlotSeconds) < 1e-6
  )
    return;
  const shiftSeconds = releaseSlotSeconds - entry.releaseSlotSeconds;
  entry.releaseSlotSeconds = releaseSlotSeconds;
  for (const target of entry.meterTargets ?? [])
    target.targetSeconds += shiftSeconds;
  const category = trafficFlowConstraint(reason).category;
  entry.constraintCategory = category;
  entry.slotRevisions.push({
    atSeconds: nowSeconds,
    releaseSlotSeconds,
    reason,
    category,
  });
  if (entry.slotRevisions.length > MAX_SLOT_REVISIONS) {
    entry.slotRevisions.splice(
      0,
      entry.slotRevisions.length - MAX_SLOT_REVISIONS,
    );
  }
}

function entryLabel(entry: TrafficFlowEntry): string {
  return entry.callsign ?? entry.id;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

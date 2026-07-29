import type {
  Flight,
  TrafficFlowConstraintCategory,
  TrafficFlowEntry,
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
export function trafficFlowConstraint(
  reason: string,
): TrafficFlowConstraint {
  const copy = reason.toLowerCase();
  if (/weather|wind|storm|visibility|deicing|rwycc|runway condition/.test(copy))
    return { category: "weather", label: "Weather" };
  if (/wake|separation/.test(copy)) return { category: "wake", label: "Wake" };
  if (/gate|stand|terminal/.test(copy)) return { category: "gate", label: "Gate" };
  if (/performance|compatible|safe exit|takeoff shortfall/.test(copy))
    return { category: "performance", label: "Performance" };
  if (/taxi|surface|route|crossing|pushback/.test(copy))
    return { category: "taxi", label: "Taxi" };
  if (/runway|approach|landing|departure envelope|protected/.test(copy))
    return { category: "runway", label: "Runway" };
  if (/capacity|budget|holding/.test(copy)) return { category: "demand", label: "Demand" };
  return { category: "schedule", label: "Schedule" };
}

export interface TrafficFlowSnapshot {
  schemaVersion: 2;
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
}

export interface TrafficFlowRecommendation {
  id: string;
  direction: "arrival" | "departure";
  action: "review-arrival-release" | "review-departure-release";
  priority: "routine" | "attention" | "urgent";
  flightId?: number;
  callsign?: string;
  targetSlotSeconds: number;
  rationale: string;
  authority: "approach" | "tower";
  advisoryOnly: true;
  requiresCommandArbiter: true;
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
  uncertainty: {
    weather: number;
    wind: number;
    runwayCondition: number;
    pilotResponse: number;
  };
}

export interface TrafficFlowForecastInput {
  arrivalDemandIntervalSeconds?: number;
  departureSpacingSeconds?: number;
  uncertainty?: Partial<TrafficFlowCapacityWindow["uncertainty"]>;
}

export function createTrafficFlowState(
  density: TrafficDensity = "realistic",
  nowSeconds = 0,
  firstArrivalDemandInSeconds = 2,
): TrafficFlowState {
  return {
    schemaVersion: 1,
    density,
    objective: "balanced",
    nextDemandId: 1,
    nextArrivalDemandSeconds:
      nowSeconds + Math.max(0, firstArrivalDemandInSeconds),
    nextArrivalReleaseSeconds: nowSeconds,
    nextDepartureReleaseSeconds: nowSeconds,
    arrivalQueue: [],
    departureQueue: [],
    history: [],
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
  const capacityWindows = [
    capacityWindow(
      "arrival",
      state.arrivalQueue,
      nowSeconds,
      forecast.arrivalDemandIntervalSeconds,
      forecast.arrivalDemandIntervalSeconds,
      forecast.uncertainty,
    ),
    capacityWindow(
      "departure",
      state.departureQueue,
      nowSeconds,
      forecast.departureSpacingSeconds,
      forecast.departureSpacingSeconds,
      forecast.uncertainty,
    ),
  ];
  const recommendations = flowRecommendations(state, nowSeconds);
  return {
    schemaVersion: 2,
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
  };
}

function flowRecommendations(
  state: TrafficFlowState,
  nowSeconds: number,
): TrafficFlowRecommendation[] {
  const recommendations: TrafficFlowRecommendation[] = [];
  const arrival = state.arrivalQueue[0];
  if (arrival) {
    const wait = Math.max(0, arrival.releaseSlotSeconds - nowSeconds);
    recommendations.push({
      id: `arrival:${arrival.id}:review`,
      direction: "arrival",
      action: "review-arrival-release",
      priority: arrival.status === "holding" || arrival.delaySeconds > 30 ? "attention" : "routine",
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
  return recommendations;
}

const FLOW_LOOKAHEAD_SECONDS = 300;

function capacityWindow(
  direction: TrafficFlowCapacityWindow["direction"],
  entries: TrafficFlowEntry[],
  nowSeconds: number,
  demandIntervalSeconds = 60,
  releaseSpacingSeconds = 60,
  uncertaintyInput: Partial<TrafficFlowCapacityWindow["uncertainty"]> = {},
): TrafficFlowCapacityWindow {
  const horizon = nowSeconds + FLOW_LOOKAHEAD_SECONDS;
  const inWindow = entries.filter(
    (entry) => entry.scheduledAtSeconds <= horizon,
  );
  const plannedReleaseCount = inWindow.filter(
    (entry) => entry.releaseSlotSeconds <= horizon,
  ).length;
  const delayedCount = inWindow.filter((entry) => entry.delaySeconds > 0.5).length;
  const revisedCount = inWindow.filter((entry) => entry.slotRevisions.length > 1).length;
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
  };
  const uncertaintyScore =
    (uncertainty.weather +
      uncertainty.wind +
      uncertainty.runwayCondition +
      uncertainty.pilotResponse) /
    4;
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
    .map(([key, value]) => `${key} ${(value * 100).toFixed(0)}%`);
  const confidenceReason =
    confidence === "low"
      ? `Several slots are delayed/revised or uncertain${uncertaintyLabels.length ? ` (${uncertaintyLabels.join(", ")})` : ""}.`
      : confidence === "medium"
        ? `Some slots moved from their initial plan${uncertaintyLabels.length ? `; uncertainty ${uncertaintyLabels.join(", ")}` : ""}.`
        : "No delayed, revised, or materially uncertain slots in the look-ahead.";
  return {
    direction,
    horizonSeconds: FLOW_LOOKAHEAD_SECONDS,
    demandCount,
    predictedDemandCount: forecastDemandCount,
    plannedReleaseCount,
    predictedCapacityCount: forecastCapacityCount,
    delayedCount,
    revisedCount,
    utilization,
    confidence,
    confidenceReason,
    uncertainty,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function cloneTrafficFlowState(
  state: TrafficFlowState,
): TrafficFlowState {
  return {
    ...state,
    arrivalQueue: state.arrivalQueue.map(cloneEntry),
    departureQueue: state.departureQueue.map(cloneEntry),
    history: state.history.map(cloneEntry),
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
      { atSeconds: nowSeconds, releaseSlotSeconds, reason, category: constraintCategory },
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
          category: entry.constraintCategory ?? trafficFlowConstraint(entry.reason).category,
        },
      ]
    ).map((revision) => ({ ...revision })),
  };
}

function reviseSlot(
  entry: TrafficFlowEntry,
  nowSeconds: number,
  releaseSlotSeconds: number,
  reason: string,
): void {
  if (Math.abs(entry.releaseSlotSeconds - releaseSlotSeconds) < 1e-6) return;
  entry.releaseSlotSeconds = releaseSlotSeconds;
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

function round(value: number): number {
  return Number(value.toFixed(3));
}

import type { Flight, TrafficFlowEntry, TrafficFlowState } from './types';
import { trafficDensityProfile, type TrafficDensity } from './trafficDensity';

const MAX_TRAFFIC_HISTORY = 256;

export interface TrafficFlowExpiry {
  diverted: TrafficFlowEntry[];
  cancelled: TrafficFlowEntry[];
}

export interface TrafficFlowSnapshot {
  schemaVersion: 1;
  density: ReturnType<typeof trafficDensityProfile>;
  nextArrivalDemandInSeconds: number;
  nextArrivalReleaseInSeconds: number;
  nextDepartureReleaseInSeconds: number;
  arrivalQueue: TrafficFlowEntry[];
  departureQueue: TrafficFlowEntry[];
  history: TrafficFlowEntry[];
  totals: TrafficFlowState['totals'];
  backPressure: {
    arrivalsHolding: number;
    departuresWaiting: number;
    oldestArrivalDelaySeconds: number;
    oldestDepartureDelaySeconds: number;
    holdingCapacity: number;
  };
}

export function createTrafficFlowState(
  density: TrafficDensity = 'realistic',
  nowSeconds = 0,
  firstArrivalDemandInSeconds = 2,
): TrafficFlowState {
  return {
    schemaVersion: 1,
    density,
    nextDemandId: 1,
    nextArrivalDemandSeconds: nowSeconds + Math.max(0, firstArrivalDemandInSeconds),
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
  state.nextArrivalDemandSeconds = Math.max(nowSeconds, state.nextArrivalDemandSeconds);
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
  const entry = createEntry(state, 'arrival', nowSeconds, Math.max(nowSeconds, state.nextArrivalReleaseSeconds), reason);
  state.totals.arrivalDemands += 1;
  if (state.arrivalQueue.length >= density.holdingCapacity) {
    entry.status = 'diverted';
    entry.reason = `${density.label} holding capacity ${density.holdingCapacity} reached; demand diverted before map entry`;
    entry.updatedAtSeconds = nowSeconds;
    state.totals.diversions += 1;
    archive(state, entry);
    return entry;
  }
  entry.status = state.arrivalQueue.length ? 'holding' : 'metered';
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
  const existing = state.departureQueue.find((entry) => entry.flightId === flight.id);
  if (existing) {
    existing.callsign = flight.callsign;
    existing.runwayId = flight.departureRunway;
    existing.releaseSlotSeconds = Math.max(existing.releaseSlotSeconds, earliestReleaseSeconds);
    refreshTrafficFlow(state, nowSeconds);
    return existing;
  }
  const precedingSlot = state.departureQueue.at(-1)?.releaseSlotSeconds ?? state.nextDepartureReleaseSeconds;
  const releaseSlot = Math.max(nowSeconds, earliestReleaseSeconds, precedingSlot + (state.departureQueue.length ? slotSpacingSeconds : 0));
  const entry = createEntry(state, 'departure', nowSeconds, releaseSlot, 'awaiting departure release slot');
  entry.flightId = flight.id;
  entry.callsign = flight.callsign;
  entry.runwayId = flight.departureRunway;
  entry.status = releaseSlot <= nowSeconds + 1e-6 ? 'metered' : 'scheduled';
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
): void {
  entry.status = 'holding';
  entry.reason = reason;
  entry.updatedAtSeconds = nowSeconds;
  entry.attempts += 1;
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
  entry.status = 'released';
  entry.updatedAtSeconds = nowSeconds;
  entry.delaySeconds = Math.max(0, nowSeconds - entry.scheduledAtSeconds);
  entry.reason = `${flight.callsign} released to runway ${flight.runway + 1}`;
  entry.flightId = flight.id;
  entry.callsign = flight.callsign;
  entry.runwayId = flight.runway;
  state.nextArrivalReleaseSeconds = nowSeconds + Math.max(0.2, nextSlotSpacingSeconds);
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
  entry.status = 'released';
  entry.updatedAtSeconds = nowSeconds;
  entry.delaySeconds = Math.max(0, nowSeconds - entry.scheduledAtSeconds);
  entry.reason = `${entry.callsign ?? 'departure'} released from the gate bank`;
  state.nextDepartureReleaseSeconds = nowSeconds + Math.max(0.2, nextSlotSpacingSeconds);
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
    if (nowSeconds - entry.scheduledAtSeconds < density.maximumArrivalDelaySeconds) continue;
    removeEntry(state.arrivalQueue, entry);
    entry.status = 'diverted';
    entry.updatedAtSeconds = nowSeconds;
    entry.delaySeconds = nowSeconds - entry.scheduledAtSeconds;
    entry.reason = `arrival metering exceeded ${density.maximumArrivalDelaySeconds}s; diverted before map entry`;
    state.totals.diversions += 1;
    archive(state, entry);
    diverted.push(entry);
  }
  for (const entry of [...state.departureQueue]) {
    if (nowSeconds - entry.scheduledAtSeconds < density.maximumDepartureDelaySeconds) continue;
    removeEntry(state.departureQueue, entry);
    entry.status = 'cancelled';
    entry.updatedAtSeconds = nowSeconds;
    entry.delaySeconds = nowSeconds - entry.scheduledAtSeconds;
    entry.reason = `departure release exceeded ${density.maximumDepartureDelaySeconds}s; slot cancelled and replanning required`;
    state.totals.cancellations += 1;
    archive(state, entry);
    cancelled.push(entry);
  }
  refreshTrafficFlow(state, nowSeconds);
  return { diverted, cancelled };
}

export function removeDepartureDemand(state: TrafficFlowState, flightId: number): void {
  const entry = state.departureQueue.find((candidate) => candidate.flightId === flightId);
  if (entry) removeEntry(state.departureQueue, entry);
}

export function refreshTrafficFlow(state: TrafficFlowState, nowSeconds: number): void {
  for (const [index, entry] of state.arrivalQueue.entries()) {
    entry.delaySeconds = Math.max(0, nowSeconds - entry.scheduledAtSeconds);
    entry.updatedAtSeconds = nowSeconds;
    if (entry.status !== 'holding') entry.status = index === 0 && entry.releaseSlotSeconds <= nowSeconds ? 'metered' : 'scheduled';
  }
  for (const entry of state.departureQueue) {
    entry.delaySeconds = Math.max(0, nowSeconds - entry.scheduledAtSeconds);
    entry.updatedAtSeconds = nowSeconds;
    entry.status = entry.releaseSlotSeconds <= nowSeconds ? 'metered' : 'scheduled';
  }
}

export function trafficFlowSnapshot(state: TrafficFlowState, nowSeconds: number): TrafficFlowSnapshot {
  refreshTrafficFlow(state, nowSeconds);
  const density = trafficDensityProfile(state.density);
  return {
    schemaVersion: 1,
    density: { ...density, assumptions: [...density.assumptions] },
    nextArrivalDemandInSeconds: round(Math.max(0, state.nextArrivalDemandSeconds - nowSeconds)),
    nextArrivalReleaseInSeconds: round(Math.max(0, state.nextArrivalReleaseSeconds - nowSeconds)),
    nextDepartureReleaseInSeconds: round(Math.max(0, state.nextDepartureReleaseSeconds - nowSeconds)),
    arrivalQueue: state.arrivalQueue.map(cloneEntry),
    departureQueue: state.departureQueue.map(cloneEntry),
    history: state.history.map(cloneEntry),
    totals: { ...state.totals },
    backPressure: {
      arrivalsHolding: state.arrivalQueue.length,
      departuresWaiting: state.departureQueue.length,
      oldestArrivalDelaySeconds: round(Math.max(0, ...state.arrivalQueue.map((entry) => entry.delaySeconds))),
      oldestDepartureDelaySeconds: round(Math.max(0, ...state.departureQueue.map((entry) => entry.delaySeconds))),
      holdingCapacity: density.holdingCapacity,
    },
  };
}

export function cloneTrafficFlowState(state: TrafficFlowState): TrafficFlowState {
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
  direction: TrafficFlowEntry['direction'],
  nowSeconds: number,
  releaseSlotSeconds: number,
  reason: string,
): TrafficFlowEntry {
  const id = `${direction === 'arrival' ? 'ARR' : 'DEP'}-${state.nextDemandId++}`;
  return {
    id,
    direction,
    status: 'scheduled',
    createdAtSeconds: nowSeconds,
    scheduledAtSeconds: nowSeconds,
    releaseSlotSeconds,
    updatedAtSeconds: nowSeconds,
    delaySeconds: 0,
    attempts: 0,
    reason,
  };
}

function archive(state: TrafficFlowState, entry: TrafficFlowEntry): void {
  state.history.push(cloneEntry(entry));
  if (state.history.length > MAX_TRAFFIC_HISTORY) state.history.splice(0, state.history.length - MAX_TRAFFIC_HISTORY);
}

function removeEntry(entries: TrafficFlowEntry[], entry: TrafficFlowEntry): void {
  const index = entries.indexOf(entry);
  if (index >= 0) entries.splice(index, 1);
}

function cloneEntry(entry: TrafficFlowEntry): TrafficFlowEntry {
  return { ...entry };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

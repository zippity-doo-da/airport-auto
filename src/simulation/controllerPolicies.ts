import type {
  AirportState,
  ControllerPolicyPreset,
  ControllerPolicyPresetId,
  ControllerStation,
  ControllerStationPolicy,
  ScriptedControllerRuntime,
  ScriptedControllerWorkload,
} from './types';

const POLICY_STATIONS: ControllerStation[] = ['supervisor', 'approach', 'tower', 'ground', 'ramp'];

type StationCapacities = Record<ControllerStation, number>;
type PolicyTiming = Omit<ControllerStationPolicy, 'station' | 'trackLimit'>;

function stationPolicies(
  capacities: StationCapacities,
  timing: PolicyTiming,
): Record<ControllerStation, ControllerStationPolicy> {
  return Object.fromEntries(POLICY_STATIONS.map((station) => [
    station,
    { station, trackLimit: capacities[station], ...timing },
  ])) as Record<ControllerStation, ControllerStationPolicy>;
}

const PRESETS: Record<ControllerPolicyPresetId, ControllerPolicyPreset> = {
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    summary: 'Steady coordination with useful headroom at every desk.',
    intent: 'Default airport-wide flow with measured handoffs and two routine decisions per evaluation.',
    stations: stationPolicies(
      { supervisor: 32, approach: 10, tower: 8, ground: 12, ramp: 10 },
      {
        maxActionsPerEvaluation: 2,
        minimumDecisionIntervalSeconds: 0.15,
        handoffAcceptSeconds: 0.75,
        handoffContactSeconds: 0.65,
        handoffUrgencySeconds: 2,
        takeoverGraceSeconds: 0.5,
        deferralReviewSeconds: 2.5,
      },
    ),
  },
  conservative: {
    id: 'conservative',
    label: 'Conservative',
    summary: 'Lower desk capacity and deliberately measured routine releases.',
    intent: 'Protects extra coordination margin while urgent and safety actions always bypass pacing.',
    stations: stationPolicies(
      { supervisor: 28, approach: 8, tower: 6, ground: 10, ramp: 8 },
      {
        maxActionsPerEvaluation: 1,
        minimumDecisionIntervalSeconds: 0.45,
        handoffAcceptSeconds: 0.9,
        handoffContactSeconds: 0.8,
        handoffUrgencySeconds: 3,
        takeoverGraceSeconds: 0.75,
        deferralReviewSeconds: 3,
      },
    ),
  },
  efficient: {
    id: 'efficient',
    label: 'Efficient',
    summary: 'Higher track limits and faster coordination for dense hub traffic.',
    intent: 'Uses available capacity aggressively without bypassing the shared clearance and safety arbiter.',
    stations: stationPolicies(
      { supervisor: 48, approach: 14, tower: 12, ground: 18, ramp: 14 },
      {
        maxActionsPerEvaluation: 3,
        minimumDecisionIntervalSeconds: 0,
        handoffAcceptSeconds: 0.35,
        handoffContactSeconds: 0.3,
        handoffUrgencySeconds: 1.25,
        takeoverGraceSeconds: 0.2,
        deferralReviewSeconds: 1.25,
      },
    ),
  },
  calm: {
    id: 'calm',
    label: 'Calm',
    summary: 'A quieter ASMR cadence with fewer simultaneous routine decisions.',
    intent: 'Keeps traffic moving at an intentionally unhurried tempo while preserving immediate safety intervention.',
    stations: stationPolicies(
      { supervisor: 26, approach: 8, tower: 6, ground: 10, ramp: 8 },
      {
        maxActionsPerEvaluation: 1,
        minimumDecisionIntervalSeconds: 0.9,
        handoffAcceptSeconds: 1.2,
        handoffContactSeconds: 1,
        handoffUrgencySeconds: 3.5,
        takeoverGraceSeconds: 1.2,
        deferralReviewSeconds: 4,
      },
    ),
  },
  teaching: {
    id: 'teaching',
    label: 'Teaching',
    summary: 'Readable one-at-a-time decisions with longer observation windows.',
    intent: 'Makes each coordination step easier to follow and leaves the safety arbiter fully authoritative.',
    stations: stationPolicies(
      { supervisor: 20, approach: 6, tower: 5, ground: 8, ramp: 6 },
      {
        maxActionsPerEvaluation: 1,
        minimumDecisionIntervalSeconds: 1.25,
        handoffAcceptSeconds: 1.5,
        handoffContactSeconds: 1.2,
        handoffUrgencySeconds: 4,
        takeoverGraceSeconds: 2,
        deferralReviewSeconds: 5,
      },
    ),
  },
  realistic: {
    id: 'realistic',
    label: 'Realistic tempo',
    summary: 'FAA-inspired workload pacing for the game-scale terminal model.',
    intent: 'Approximates controller tempo and track pressure; it is not a regulatory staffing or separation model.',
    stations: stationPolicies(
      { supervisor: 36, approach: 12, tower: 8, ground: 14, ramp: 10 },
      {
        maxActionsPerEvaluation: 2,
        minimumDecisionIntervalSeconds: 0.35,
        handoffAcceptSeconds: 1,
        handoffContactSeconds: 0.8,
        handoffUrgencySeconds: 2.5,
        takeoverGraceSeconds: 0.75,
        deferralReviewSeconds: 3,
      },
    ),
  },
};

function cloneStationPolicy(policy: ControllerStationPolicy): ControllerStationPolicy {
  return { ...policy };
}

function clonePreset(preset: ControllerPolicyPreset): ControllerPolicyPreset {
  return {
    ...preset,
    stations: Object.fromEntries(POLICY_STATIONS.map((station) => [
      station,
      cloneStationPolicy(preset.stations[station]),
    ])) as Record<ControllerStation, ControllerStationPolicy>,
  };
}

export function isControllerPolicyPresetId(value: string): value is ControllerPolicyPresetId {
  return Object.prototype.hasOwnProperty.call(PRESETS, value);
}

export function controllerPolicyPreset(id: ControllerPolicyPresetId): ControllerPolicyPreset {
  return clonePreset(PRESETS[id]);
}

export function controllerPolicyPresetCatalog(): ControllerPolicyPreset[] {
  return (Object.keys(PRESETS) as ControllerPolicyPresetId[]).map((id) => controllerPolicyPreset(id));
}

export function controllerPolicyForStation(
  presetId: ControllerPolicyPresetId,
  station: ControllerStation,
): ControllerStationPolicy {
  return cloneStationPolicy(PRESETS[presetId].stations[station]);
}

export function createControllerWorkload(
  state: AirportState,
  station: ControllerStation,
  policy: ControllerStationPolicy,
  queuedActions = 0,
): ScriptedControllerWorkload {
  const ownedFlightIds = station === 'supervisor'
    ? state.flights.map((flight) => flight.id)
    : state.flights.filter((flight) => flight.navigation.frequencyOwner === station).map((flight) => flight.id);
  const incomingFlightIds = station === 'supervisor'
    ? []
    : state.flights
      .filter((flight) => {
        const handoff = flight.navigation.handoff;
        return handoff?.to === station && ['offered', 'accepted', 'overdue'].includes(handoff.status);
      })
      .map((flight) => flight.id);
  const outgoingHandoffs = station === 'supervisor'
    ? 0
    : state.flights.filter((flight) => {
      const handoff = flight.navigation.handoff;
      return handoff?.from === station && ['offered', 'accepted', 'overdue'].includes(handoff.status);
    }).length;
  const activeFlightIds = new Set([...ownedFlightIds, ...incomingFlightIds]);
  const activeTracks = activeFlightIds.size;
  const utilization = activeTracks / Math.max(1, policy.trackLimit);
  return {
    ownedTracks: ownedFlightIds.length,
    incomingHandoffs: incomingFlightIds.length,
    outgoingHandoffs,
    activeTracks,
    trackLimit: policy.trackLimit,
    utilization: Number(utilization.toFixed(3)),
    atCapacity: activeTracks >= policy.trackLimit,
    overloaded: activeTracks > policy.trackLimit,
    queuedActions,
  };
}

export function applyControllerPolicyPreset(
  runtime: ScriptedControllerRuntime,
  presetId: ControllerPolicyPresetId,
  elapsed: number,
): void {
  runtime.presetId = presetId;
  for (const station of POLICY_STATIONS) {
    const stationRuntime = runtime.stations[station];
    stationRuntime.policy = controllerPolicyForStation(presetId, station);
    stationRuntime.workload.trackLimit = stationRuntime.policy.trackLimit;
    stationRuntime.workload.utilization = Number(
      (stationRuntime.workload.activeTracks / Math.max(1, stationRuntime.policy.trackLimit)).toFixed(3),
    );
    stationRuntime.workload.atCapacity = stationRuntime.workload.activeTracks >= stationRuntime.policy.trackLimit;
    stationRuntime.workload.overloaded = stationRuntime.workload.activeTracks > stationRuntime.policy.trackLimit;
    stationRuntime.nextRoutineDecisionAtSeconds = Math.max(
      elapsed,
      Math.min(stationRuntime.nextRoutineDecisionAtSeconds, elapsed + stationRuntime.policy.minimumDecisionIntervalSeconds),
    );
  }
}

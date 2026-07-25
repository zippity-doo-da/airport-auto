import type {
  ControllerStation,
  ControllerWorkloadSnapshot,
  Flight,
  OperationalControllerStation,
  StationAutomationState,
} from './types';

export const OPERATIONAL_CONTROLLER_STATIONS: OperationalControllerStation[] = ['approach', 'tower', 'ground', 'ramp'];
export const CONTROLLER_STATIONS: ControllerStation[] = ['supervisor', ...OPERATIONAL_CONTROLLER_STATIONS];

export interface ControllerStationDefinition {
  label: string;
  trafficScope: string;
  authoritySummary: string;
  responsibilities: string[];
  successMeasures: string[];
}

export const CONTROLLER_STATION_DEFINITIONS: Record<ControllerStation, ControllerStationDefinition> = {
  supervisor: {
    label: 'Supervisor',
    trafficScope: 'Every active aircraft, desk, runway plan, disruption, queue, and safety invariant.',
    authoritySummary: 'Airport-wide override, runway configuration, surface availability, recovery, and automation.',
    responsibilities: ['airport-wide safety picture', 'runway configuration', 'surface availability and recovery', 'desk staffing and automation', 'cross-position coordination'],
    successMeasures: ['safety integrity', 'airport throughput', 'delay per completed operation', 'desk pressure'],
  },
  approach: {
    label: 'Approach',
    trafficScope: 'Arrivals from the terminal boundary through final, plus airborne departures after Tower handoff.',
    authoritySummary: 'Vectors, altitude, speed, terminal routes, holds, approach clearance, diversion, and airborne handoff.',
    responsibilities: ['terminal arrivals', 'vectors and sequencing', 'altitude and speed', 'approach clearance', 'departures after handoff'],
    successMeasures: ['airborne separation', 'arrival fuel reserve', 'on-time handoffs', 'arrival queue delay'],
  },
  tower: {
    label: 'Tower',
    trafficScope: 'Final approaches, occupied runways, runway-entry queues, landing rollout, and initial departure roll.',
    authoritySummary: 'Landing, go-around, line-up, runway entry, takeoff, and protected-runway occupancy.',
    responsibilities: ['landing clearance', 'runway occupancy', 'line up and wait', 'takeoff clearance', 'go-around authority'],
    successMeasures: ['runway conflict prevention', 'zero incursions', 'runway queue delay', 'completed runway movements'],
  },
  ground: {
    label: 'Ground',
    trafficScope: 'Aircraft on movement-area taxiways between runway boundaries and ramp-control boundaries.',
    authoritySummary: 'Taxi routes, hold/resume, runway crossings, movement-area reroutes, and disabled-aircraft recovery.',
    responsibilities: ['movement-area taxi', 'hold position', 'runway crossings', 'surface reroutes', 'disabled-aircraft recovery'],
    successMeasures: ['surface flow', 'crossing delay', 'zero incursions', 'moving taxi traffic'],
  },
  ramp: {
    label: 'Ramp',
    trafficScope: 'Stands, pushback, service activity, apron lanes, ramp alleys, and movement-area handoff points.',
    authoritySummary: 'Stand flow, pushback direction, turnaround release, ramp alleys, and Ramp/Ground coordination.',
    responsibilities: ['gate and stand flow', 'turnaround readiness', 'pushback clearance', 'ramp alleys', 'handoff at the movement-area boundary'],
    successMeasures: ['push-ready flow', 'service blockers', 'turnaround variance', 'active gate turns'],
  },
};

export function createStationAutomation(enabled = false): StationAutomationState {
  return { approach: enabled, tower: enabled, ground: enabled, ramp: enabled };
}

export function isControllerStation(value: string): value is ControllerStation {
  return CONTROLLER_STATIONS.includes(value as ControllerStation);
}

export function isOperationalControllerStation(value: ControllerStation): value is OperationalControllerStation {
  return value !== 'supervisor';
}

export function controllerStationLabel(station: ControllerStation): string {
  return station === 'supervisor' ? 'Supervisor' : CONTROLLER_STATION_DEFINITIONS[station].label;
}

/**
 * The station that should own the aircraft at its current physical phase. This
 * is independent from the selected UI station. It feeds workload, handoff
 * prompts, and opt-in automation without silently changing authority.
 */
export function requiredControllerStation(flight: Flight): OperationalControllerStation {
  if (flight.diversion) return 'approach';
  if (flight.phase === 'approach') return flight.progress >= 0.68 ? 'tower' : 'approach';
  if (flight.phase === 'landing') return 'tower';
  if (flight.phase === 'resting') return 'ramp';
  if (flight.phase === 'taxi-in') {
    if (flight.progress >= 0.82 || Boolean(flight.rampControlZoneId)) return 'ramp';
    return 'ground';
  }
  if (flight.phase === 'taxi-out') {
    const rampBoundary = Math.max(0.035, flight.pushbackReleaseProgress + 0.01);
    if (flight.tugAttached || flight.progress < rampBoundary) return 'ramp';
    return flight.progress >= 0.985 ? 'tower' : 'ground';
  }
  return flight.motion.onGround ? 'tower' : 'approach';
}

export function stationCanIssue(
  selected: ControllerStation,
  authority: OperationalControllerStation,
): boolean {
  return selected === 'supervisor' || selected === authority;
}

/**
 * Preserve an accepted early handoff to the next controller. Automation may
 * advance a lagging owner, but an unstaffed upstream desk must never pull an
 * aircraft back from the human position that already accepted it.
 */
export function controllerStationIsAhead(
  flight: Flight,
  current: ControllerStation,
  required: OperationalControllerStation,
): boolean {
  if (current === 'supervisor') return false;
  const sequence = controllerFlowSequence(flight);
  return sequence.indexOf(current) === sequence.indexOf(required) + 1;
}

export function controllerFlowSequence(flight: Flight): OperationalControllerStation[] {
  return flight.flightPlan.direction === 'departure'
    ? ['ramp', 'ground', 'tower', 'approach']
    : ['approach', 'tower', 'ground', 'ramp'];
}

export function nextControllerStation(
  flight: Flight,
  current: ControllerStation = flight.navigation.frequencyOwner,
): OperationalControllerStation | null {
  if (!isOperationalControllerStation(current)) return null;
  const sequence = controllerFlowSequence(flight);
  const index = sequence.indexOf(current);
  return index >= 0 && index < sequence.length - 1 ? sequence[index + 1] : null;
}

/**
 * The next controller that should be coordinated now. The readiness window
 * opens before the physical boundary so a human position has time to respond.
 */
export function suggestedHandoffStation(flight: Flight): OperationalControllerStation | null {
  const owner = flight.navigation.frequencyOwner;
  if (!isOperationalControllerStation(owner)) return null;
  const required = requiredControllerStation(flight);
  if (required !== owner) {
    return controllerStationIsAhead(flight, owner, required) ? null : required;
  }
  const next = nextControllerStation(flight, owner);
  if (!next) return null;
  if (owner === 'approach') return flight.phase === 'approach' && flight.progress >= 0.56 ? 'tower' : null;
  if (owner === 'tower' && flight.flightPlan.direction === 'arrival') {
    return flight.phase === 'landing' || (flight.phase === 'taxi-in' && flight.progress >= 0.08) ? 'ground' : null;
  }
  if (owner === 'ground' && flight.flightPlan.direction === 'arrival') {
    return flight.phase === 'taxi-in' && (flight.progress >= 0.72 || Boolean(flight.rampControlZoneId)) ? 'ramp' : null;
  }
  if (owner === 'ramp') {
    return flight.phase === 'taxi-out'
      && !flight.tugAttached
      && flight.progress >= Math.max(0.025, flight.pushbackReleaseProgress)
      ? 'ground'
      : null;
  }
  if (owner === 'ground') return flight.phase === 'taxi-out' && flight.progress >= 0.94 ? 'tower' : null;
  if (owner === 'tower') return flight.phase === 'takeoff' && !flight.motion.onGround ? 'approach' : null;
  return null;
}

export function controllerWorkloadSnapshots(
  flights: readonly Flight[],
  automation: StationAutomationState,
): ControllerWorkloadSnapshot[] {
  return OPERATIONAL_CONTROLLER_STATIONS.map((station) => {
    const relevant = flights.filter((flight) => requiredControllerStation(flight) === station);
    const owned = flights.filter((flight) => flight.navigation.frequencyOwner === station);
    const pendingHandoffs = flights.filter((flight) => {
      const handoff = flight.navigation.handoff;
      if (handoff && handoff.to === station && (handoff.status === 'offered' || handoff.status === 'accepted' || handoff.status === 'overdue')) return true;
      return requiredControllerStation(flight) === station
        && flight.navigation.frequencyOwner !== station
        && !controllerStationIsAhead(flight, flight.navigation.frequencyOwner, station);
    }).length;
    const overdueFlights = relevant.filter((flight) => {
      if (flight.navigation.handoff?.to === station && flight.navigation.handoff.status === 'overdue') return true;
      if (flight.navigation.frequencyOwner === station) return false;
      if (station === 'tower') return flight.phase === 'landing' || (flight.phase === 'taxi-out' && flight.progress >= 0.99);
      if (station === 'ground') return flight.phase === 'taxi-in' && flight.progress >= 0.08;
      if (station === 'ramp') return flight.phase === 'taxi-in' && flight.progress >= 0.94;
      return flight.phase === 'takeoff' && !flight.motion.onGround && flight.progress >= 0.72;
    }).length;
    const pressure = relevant.length + pendingHandoffs * 1.5 + overdueFlights * 2;
    const workload = pressure <= 0
      ? 'idle'
      : pressure < 3
        ? 'light'
        : pressure < 6
          ? 'moderate'
          : pressure < 10
            ? 'heavy'
            : 'overload';
    return {
      station,
      label: CONTROLLER_STATION_DEFINITIONS[station].label,
      automated: automation[station],
      ownedFlights: owned.length,
      phaseRelevantFlights: relevant.length,
      pendingHandoffs,
      overdueFlights,
      workload,
      responsibilities: [...CONTROLLER_STATION_DEFINITIONS[station].responsibilities],
    };
  });
}

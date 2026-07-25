import type {
  ControllerStation,
  ControllerWorkloadSnapshot,
  Flight,
  OperationalControllerStation,
  StationAutomationState,
} from './types';

export const OPERATIONAL_CONTROLLER_STATIONS: OperationalControllerStation[] = ['approach', 'tower', 'ground', 'ramp'];
export const CONTROLLER_STATIONS: ControllerStation[] = ['supervisor', ...OPERATIONAL_CONTROLLER_STATIONS];

export const CONTROLLER_STATION_DEFINITIONS: Record<OperationalControllerStation, {
  label: string;
  responsibilities: string[];
}> = {
  approach: {
    label: 'Approach',
    responsibilities: ['terminal arrivals', 'vectors and sequencing', 'altitude and speed', 'approach clearance', 'departures after handoff'],
  },
  tower: {
    label: 'Tower',
    responsibilities: ['landing clearance', 'runway occupancy', 'line up and wait', 'takeoff clearance', 'go-around authority'],
  },
  ground: {
    label: 'Ground',
    responsibilities: ['movement-area taxi', 'hold position', 'runway crossings', 'surface reroutes', 'disabled-aircraft recovery'],
  },
  ramp: {
    label: 'Ramp',
    responsibilities: ['gate and stand flow', 'turnaround readiness', 'pushback clearance', 'ramp alleys', 'handoff at the movement-area boundary'],
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
  const sequence: OperationalControllerStation[] = flight.phase === 'taxi-out' || flight.phase === 'takeoff'
    ? ['ramp', 'ground', 'tower', 'approach']
    : ['approach', 'tower', 'ground', 'ramp'];
  return sequence.indexOf(current) === sequence.indexOf(required) + 1;
}

export function controllerWorkloadSnapshots(
  flights: readonly Flight[],
  automation: StationAutomationState,
): ControllerWorkloadSnapshot[] {
  return OPERATIONAL_CONTROLLER_STATIONS.map((station) => {
    const relevant = flights.filter((flight) => requiredControllerStation(flight) === station);
    const owned = flights.filter((flight) => flight.navigation.frequencyOwner === station);
    const pendingHandoffs = relevant.filter((flight) => (
      flight.navigation.frequencyOwner !== station
      && !controllerStationIsAhead(flight, flight.navigation.frequencyOwner, station)
    )).length;
    const overdueFlights = relevant.filter((flight) => {
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

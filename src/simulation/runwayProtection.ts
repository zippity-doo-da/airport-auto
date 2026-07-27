import type { Flight, FlightPhase } from './types';

export type AirborneTrajectoryPhase = 'approach' | 'landing' | 'takeoff';

export function phaseUsesAirborneTrajectory(
  phase: FlightPhase,
): phase is AirborneTrajectoryPhase {
  return phase === 'approach' || phase === 'landing' || phase === 'takeoff';
}

/** A landing/departure path that surface traffic must treat as committed. */
export function flightHasCommittedRunwayTrajectory(flight: Flight): boolean {
  return (flight.phase === 'approach' && flight.cleared)
    || flight.phase === 'landing'
    || flight.phase === 'takeoff';
}

/** Phases that protect the assigned runway regardless of sampled ground pose. */
export function phaseProtectsAssignedRunway(phase: FlightPhase): boolean {
  return phase === 'landing' || phase === 'takeoff';
}

/** An aircraft whose runway entry or arrival/departure path is committed. */
export function flightHasRunwayCommitment(flight: Flight): boolean {
  return flightHasCommittedRunwayTrajectory(flight)
    || (flight.phase === 'taxi-out' && Boolean(flight.runwayEntryCleared));
}

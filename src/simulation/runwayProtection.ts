import type { AirportState, Flight, FlightPhase } from "./types";

export type AirborneTrajectoryPhase = "approach" | "landing" | "takeoff";

export function phaseUsesAirborneTrajectory(
  phase: FlightPhase,
): phase is AirborneTrajectoryPhase {
  return phase === "approach" || phase === "landing" || phase === "takeoff";
}

/** A landing/departure path that surface traffic must treat as committed. */
export function flightHasCommittedRunwayTrajectory(flight: Flight): boolean {
  return (
    (flight.phase === "approach" && flight.cleared) ||
    flight.phase === "landing" ||
    flight.phase === "takeoff"
  );
}

/** Phases that protect the assigned runway regardless of sampled ground pose. */
export function phaseProtectsAssignedRunway(phase: FlightPhase): boolean {
  return phase === "landing" || phase === "takeoff";
}

/** An aircraft whose runway entry or arrival/departure path is committed. */
export function flightHasRunwayCommitment(flight: Flight): boolean {
  return (
    flightHasCommittedRunwayTrajectory(flight) ||
    (flight.phase === "taxi-out" && Boolean(flight.runwayEntryCleared))
  );
}

export interface RunwayProtectionStatus {
  runwayId: number;
  occupiedFlightIds: number[];
  entranceHoldFlightIds: number[];
  takeoffHoldFlightIds: number[];
  entranceProtected: boolean;
  takeoffProtected: boolean;
}

/**
 * The renderer-independent source for runway entrance and takeoff-hold
 * indications. Visuals only reflect these authoritative protection decisions.
 */
export function runwayProtectionStatuses(
  state: AirportState,
  runwayCount: number,
): RunwayProtectionStatus[] {
  return Array.from({ length: runwayCount }, (_, runwayId) => {
    const occupiedFlightIds = state.flights
      .filter((flight) => flight.motion.protectedRunwayIds.includes(runwayId))
      .map((flight) => flight.id);
    const entranceHoldFlightIds = state.flights
      .filter((flight) => holdsAtRunwayEntrance(flight, runwayId))
      .map((flight) => flight.id);
    const takeoffHoldFlightIds = state.flights
      .filter((flight) => holdsBeforeTakeoff(flight, runwayId))
      .map((flight) => flight.id);
    return {
      runwayId,
      occupiedFlightIds,
      entranceHoldFlightIds,
      takeoffHoldFlightIds,
      entranceProtected: occupiedFlightIds.length > 0,
      takeoffProtected:
        occupiedFlightIds.length > 0 || takeoffHoldFlightIds.length > 0,
    };
  });
}

function holdsAtRunwayEntrance(flight: Flight, runwayId: number): boolean {
  if (!flight.motion.onGround || flight.motion.protectedRunway) return false;
  return (
    flight.holdShortRunway === runwayId ||
    flight.crossingHoldRunway === runwayId ||
    (flight.runway === runwayId &&
      flight.phase === "taxi-out" &&
      !flight.runwayEntryCleared)
  );
}

function holdsBeforeTakeoff(flight: Flight, runwayId: number): boolean {
  return (
    flight.motion.onGround &&
    !flight.motion.protectedRunway &&
    flight.runway === runwayId &&
    flight.phase === "taxi-out" &&
    (!flight.runwayEntryCleared || !flight.takeoffCleared)
  );
}

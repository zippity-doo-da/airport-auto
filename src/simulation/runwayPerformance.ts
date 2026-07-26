import type { RunwayConfig } from "./airportConfig";
import { aircraftProfile, type AircraftModel } from "./aircraftProfiles";

export type RunwayOperation = "landing" | "takeoff";

export const WORLD_METERS_PER_UNIT = 38;

/**
 * Conservative planning lengths from the audited aircraft catalog. Physical
 * roll remains separate so animation distance is not mistaken for the full
 * runway requirement.
 */
export function requiredRunwayLengthM(
  aircraft: AircraftModel,
  operation: RunwayOperation,
): number {
  const profile = aircraftProfile(aircraft);
  return operation === "takeoff"
    ? profile.takeoffRunwayRequiredM
    : profile.landingRunwayRequiredM;
}

export function runwayLengthM(runway: RunwayConfig): number {
  return runway.length * WORLD_METERS_PER_UNIT;
}

export function runwaySupportsAircraft(
  runway: RunwayConfig,
  aircraft: AircraftModel,
  operation: RunwayOperation,
): boolean {
  // Operational availability belongs to the active runway configuration.
  // This helper answers only the physical performance question so a runway
  // that is normally inactive can become usable in a contingency plan.
  return runwayLengthM(runway) >= requiredRunwayLengthM(aircraft, operation);
}

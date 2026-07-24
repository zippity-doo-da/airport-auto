import type { RunwayConfig } from './airportConfig';
import { aircraftProfile, type AircraftModel } from './aircraftProfiles';

export type RunwayOperation = 'landing' | 'takeoff';

export const WORLD_METERS_PER_UNIT = 38;

/**
 * Conservative dispatch lengths for the simplified aircraft model. The
 * profile values describe the nominal ground roll; the extra margin accounts
 * for lineup, rotation, touchdown dispersion, braking variability, and runway
 * remaining at the end of the maneuver.
 */
export function requiredRunwayLengthM(aircraft: AircraftModel, operation: RunwayOperation): number {
  const profile = aircraftProfile(aircraft);
  return operation === 'takeoff'
    ? profile.takeoffRollM * 1.08 + 100
    : profile.landingRollM * 1.12 + 180;
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

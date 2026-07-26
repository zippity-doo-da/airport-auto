import type { RunwayConfig } from "./airportConfig";
import { aircraftProfile, type AircraftModel } from "./aircraftProfiles";
import type {
  RunwayConditionReport,
  RunwayPerformanceAssessment,
} from "./types";
import { runwayPerformanceMultiplier } from "./weatherOperations";

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
  condition?: Pick<RunwayConditionReport, "worstCode">,
): number {
  const profile = aircraftProfile(aircraft);
  const dryRequirement = operation === "takeoff"
    ? profile.takeoffRunwayRequiredM
    : profile.landingRunwayRequiredM;
  return dryRequirement * runwayPerformanceMultiplier(
    condition?.worstCode ?? 6,
    operation,
  );
}

export function runwayLengthM(runway: RunwayConfig): number {
  return runway.length * WORLD_METERS_PER_UNIT;
}

export function runwaySupportsAircraft(
  runway: RunwayConfig,
  aircraft: AircraftModel,
  operation: RunwayOperation,
  condition?: Pick<RunwayConditionReport, "worstCode">,
): boolean {
  // Operational availability belongs to the active runway configuration.
  // This helper answers only the physical performance question so a runway
  // that is normally inactive can become usable in a contingency plan.
  return runwayLengthM(runway) >= requiredRunwayLengthM(
    aircraft,
    operation,
    condition,
  );
}

export function assessRunwayPerformance(
  runway: RunwayConfig,
  aircraft: AircraftModel,
  operation: RunwayOperation,
  condition: RunwayConditionReport,
  assessedAtSeconds: number,
): RunwayPerformanceAssessment {
  const profile = aircraftProfile(aircraft);
  const performanceMultiplier = runwayPerformanceMultiplier(
    condition.worstCode,
    operation,
  );
  const requiredRunwayM = requiredRunwayLengthM(
    aircraft,
    operation,
    condition,
  );
  const availableRunwayM = runwayLengthM(runway);
  const dryRollDistanceM = operation === "takeoff"
    ? profile.takeoffRollM
    : profile.landingRollM;
  const rollDistanceM = dryRollDistanceM * performanceMultiplier;
  return {
    schemaVersion: 1,
    operation,
    runwayId: runway.id,
    aircraft,
    runwayConditionCode: condition.worstCode,
    brakingAction: condition.brakingAction,
    performanceMultiplier,
    requiredRunwayM,
    availableRunwayM,
    marginM: availableRunwayM - requiredRunwayM,
    rollDistanceM,
    safe: Number.isFinite(requiredRunwayM) && availableRunwayM >= requiredRunwayM,
    assessedAtSeconds,
    source: "schematic-aircraft-and-rcam-model",
    notForNavigation: true,
  };
}

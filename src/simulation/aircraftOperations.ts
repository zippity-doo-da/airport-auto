import { aircraftProfile, type AircraftModel } from "./aircraftProfiles";
import type { FlightOperationalDetail, FlightService } from "./types";
import type { OperationTrafficClass } from "./airportOperationProfiles";

export interface AircraftOperationalDetailRequest {
  flightId: number;
  airportSeed: number;
  aircraft: AircraftModel;
  service: FlightService;
  trafficClass: OperationTrafficClass;
  origin: string;
  destination: string;
}

export function createAircraftOperationalDetail(
  request: AircraftOperationalDetailRequest,
): FlightOperationalDetail {
  const profile = aircraftProfile(request.aircraft);
  const variant = stableVariant(
    request.flightId,
    request.airportSeed,
    request.aircraft,
  );
  const maintenanceClass: FlightOperationalDetail["maintenanceClass"] =
    variant % 47 === 0
      ? "out-of-service-repair"
      : variant % 9 === 0
        ? "transit-inspection"
        : "none";
  const base: Pick<
    FlightOperationalDetail,
    | "schemaVersion"
    | "maintenanceClass"
    | "airworthinessStatus"
    | "maintenanceReason"
  > = {
    schemaVersion: 1 as const,
    maintenanceClass,
    airworthinessStatus:
      maintenanceClass === "none"
        ? ("serviceable" as const)
        : ("maintenance-due" as const),
    maintenanceReason:
      maintenanceClass === "out-of-service-repair"
        ? [
            "brake temperature inspection",
            "dispatch discrepancy repair",
            "avionics cooling inspection",
          ][variant % 3]
        : maintenanceClass === "transit-inspection"
          ? "scheduled transit inspection"
          : undefined,
  };

  if (variant % 59 === 0) {
    const specialOperation = (
      [
        "air-ambulance",
        "flight-check",
        "humanitarian",
        "government-charter",
      ] as const
    )[variant % 4];
    return {
      ...base,
      kind: "special-operation",
      label: specialOperation.replaceAll("-", " "),
      reason: `${specialOperation.replaceAll("-", " ")} movement between ${request.origin} and ${request.destination}`,
      specialOperation,
    };
  }
  if (variant % 43 === 0) {
    return {
      ...base,
      kind: "ferry",
      label: "positioning ferry",
      reason: `${profile.name} positioning without a normal revenue load`,
    };
  }
  if (request.service === "cargo" || profile.fleetRole === "cargo") {
    const cargoLoadType = (
      ["express", "general-freight", "perishable", "priority-parts"] as const
    )[variant % 4];
    return {
      ...base,
      kind: "scheduled-cargo",
      label: `${cargoLoadType.replaceAll("-", " ")} cargo`,
      reason: `${cargoLoadType.replaceAll("-", " ")} load planned for ${request.destination}`,
      cargoLoadType,
    };
  }
  if (
    request.trafficClass === "general-aviation" ||
    profile.fleetRole === "business" ||
    profile.fleetRole === "utility" ||
    profile.fleetRole === "general-aviation"
  ) {
    return {
      ...base,
      kind: "charter",
      label:
        profile.fleetRole === "general-aviation"
          ? "general aviation"
          : "private charter",
      reason: `${profile.name} non-scheduled movement`,
    };
  }
  return {
    ...base,
    kind: "scheduled-passenger",
    label: "scheduled passenger",
    reason: `${request.trafficClass} passenger service`,
  };
}

function stableVariant(
  flightId: number,
  airportSeed: number,
  aircraft: AircraftModel,
): number {
  let value =
    (Math.imul(flightId + aircraft.length * 17, 0x9e3779b1) ^ airportSeed) >>>
    0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}

import { aircraftProfile, type AircraftModel } from "./aircraftProfiles";
import { estimateRouteDistanceNm } from "./routeDistances";
import type { FlightFuelLegPlan, FlightFuelPlan, FlightPhase } from "./types";
import type { OperationTrafficClass } from "./airportOperationProfiles";

export interface FlightFuelPlanRequest {
  aircraft: AircraftModel;
  arrivalOrigin: string;
  airportCode: string;
  departureDestination: string;
  trafficClass: OperationTrafficClass;
  flightId: number;
  airportSeed: number;
}

export interface FlightFuelLegRequest {
  aircraft: AircraftModel;
  origin: string;
  destination: string;
  trafficClass: OperationTrafficClass;
  flightId: number;
  airportSeed: number;
}

export function createFlightFuelPlan(
  request: FlightFuelPlanRequest,
): FlightFuelPlan {
  const profile = aircraftProfile(request.aircraft);
  const arrival = planFlightFuelLeg({
    aircraft: request.aircraft,
    origin: request.arrivalOrigin,
    destination: request.airportCode,
    trafficClass: request.trafficClass,
    flightId: request.flightId,
    airportSeed: request.airportSeed,
  });
  const departure = planFlightFuelLeg({
    aircraft: request.aircraft,
    origin: request.airportCode,
    destination: request.departureDestination,
    trafficClass: request.trafficClass,
    flightId: request.flightId + 10_000,
    airportSeed: request.airportSeed,
  });
  const reserveVariation =
    -1.5 +
    deterministicUnit(request.flightId, request.airportSeed, 0xf0e1) * 4.5;
  const modeledArrivalFuelPercent = round2(
    clamp(
      arrival.plannedLandingFuelPercent + reserveVariation,
      Math.max(7, arrival.plannedLandingFuelPercent * 0.82),
      Math.min(32, arrival.plannedLandingFuelPercent + 5),
    ),
  );
  const assumptions = [
    "Modeled planning values only; not an operational dispatch release.",
    "Trip fuel uses representative cruise flow plus climb and approach allowance.",
    "Reserve includes five-percent contingency, an alternate segment, and a thirty-minute final reserve.",
  ];
  if (
    arrival.distanceSource === "traffic-class-estimate" ||
    departure.distanceSource === "traffic-class-estimate"
  ) {
    assumptions.push(
      "At least one route uses a deterministic traffic-class distance estimate.",
    );
  }
  if (arrival.capacityLimited || departure.capacityLimited) {
    assumptions.push(
      "At least one leg reaches the modeled ninety-six-percent usable-fuel planning limit.",
    );
  }
  return {
    schemaVersion: 1,
    aircraft: request.aircraft,
    usableFuelKg: profile.usableFuelKg,
    nominalCruiseFuelBurnKgPerHour: profile.nominalCruiseFuelBurnKgPerHour,
    arrival,
    departure,
    modeledArrivalFuelKg: round1(
      (profile.usableFuelKg * modeledArrivalFuelPercent) / 100,
    ),
    modeledArrivalFuelPercent,
    assumptions,
  };
}

export function planFlightFuelLeg(
  request: FlightFuelLegRequest,
): FlightFuelLegPlan {
  const profile = aircraftProfile(request.aircraft);
  const route = estimateRouteDistanceNm(
    request.origin,
    request.destination,
    request.trafficClass,
    request.flightId,
    request.airportSeed,
  );
  const terminalAllowanceHours =
    request.trafficClass === "general-aviation"
      ? 0.18
      : request.trafficClass === "regional"
        ? 0.22
        : route.distanceNm >= 3_000
          ? 0.35
          : 0.28;
  const estimatedBlockHours = Math.max(
    0.35,
    route.distanceNm / profile.cruiseKts + terminalAllowanceHours,
  );
  const tripFuelKg =
    profile.nominalCruiseFuelBurnKgPerHour * estimatedBlockHours;
  const taxiFuelKg =
    profile.nominalCruiseFuelBurnKgPerHour *
    (profile.category === "widebody" || profile.category === "cargo"
      ? 0.09
      : 0.08);
  const contingencyFuelKg = Math.max(
    tripFuelKg * 0.05,
    profile.nominalCruiseFuelBurnKgPerHour * 0.1,
  );
  const alternateFuelKg =
    profile.nominalCruiseFuelBurnKgPerHour *
    (route.distanceNm >= 3_000 ? 0.55 : 0.4);
  const finalReserveFuelKg = profile.nominalCruiseFuelBurnKgPerHour * 0.5;
  const plannedLandingFuelKg =
    contingencyFuelKg + alternateFuelKg + finalReserveFuelKg;
  const uncappedDispatchFuelKg = tripFuelKg + taxiFuelKg + plannedLandingFuelKg;
  const dispatchFuelKg = Math.min(
    profile.usableFuelKg * 0.96,
    uncappedDispatchFuelKg,
  );
  return {
    origin: request.origin,
    destination: request.destination,
    estimatedDistanceNm: route.distanceNm,
    distanceSource: route.source,
    estimatedBlockHours: round2(estimatedBlockHours),
    tripFuelKg: round1(tripFuelKg),
    taxiFuelKg: round1(taxiFuelKg),
    contingencyFuelKg: round1(contingencyFuelKg),
    alternateFuelKg: round1(alternateFuelKg),
    finalReserveFuelKg: round1(finalReserveFuelKg),
    dispatchFuelKg: round1(dispatchFuelKg),
    dispatchFuelPercent: round2((dispatchFuelKg / profile.usableFuelKg) * 100),
    plannedLandingFuelKg: round1(plannedLandingFuelKg),
    plannedLandingFuelPercent: round2(
      (plannedLandingFuelKg / profile.usableFuelKg) * 100,
    ),
    capacityLimited: uncappedDispatchFuelKg > profile.usableFuelKg * 0.96,
  };
}

export function replaceDepartureFuelPlan(
  current: FlightFuelPlan,
  request: Omit<FlightFuelLegRequest, "aircraft">,
): FlightFuelPlan {
  const departure = planFlightFuelLeg({
    ...request,
    aircraft: current.aircraft,
  });
  return {
    ...current,
    departure,
    assumptions: current.assumptions
      .filter((assumption) => !assumption.startsWith("Departure replanned"))
      .concat(
        `Departure replanned for ${departure.origin}–${departure.destination}.`,
      ),
  };
}

/** Percentage of modeled usable fuel burned per fixed simulation second. */
export function fuelBurnPercentPerSecond(
  aircraft: AircraftModel,
  phase: FlightPhase,
  moving = true,
): number {
  if (phase === "resting") return 0;
  const profile = aircraftProfile(aircraft);
  const cruisePercentPerHour =
    (profile.nominalCruiseFuelBurnKgPerHour / profile.usableFuelKg) * 100;
  const phaseMultiplier: Record<Exclude<FlightPhase, "resting">, number> = {
    approach: 0.68,
    landing: 0.48,
    // A metered stop is modeled as a reduced-engine/APU ground-hold state,
    // rather than charging the aircraft nearly the same flow as active taxi.
    // This keeps strategic delay at the gate/meter materially cheaper than
    // stop-start movement without making a held aircraft fuel-free.
    "taxi-in": moving ? 0.22 : 0.05,
    "taxi-out": moving ? 0.24 : 0.055,
    takeoff: 1.65,
  };
  return (cruisePercentPerHour * phaseMultiplier[phase]) / 3_600;
}

function deterministicUnit(
  flightId: number,
  airportSeed: number,
  salt: number,
): number {
  let value = (Math.imul(flightId ^ salt, 0x9e3779b1) ^ airportSeed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

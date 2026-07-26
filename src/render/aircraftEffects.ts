import { aircraftProfile } from "../simulation/aircraftProfiles";
import type { Flight, WeatherState } from "../simulation/types";

export interface ContrailPresentation {
  visible: boolean;
  opacity: number;
  lengthScale: number;
}

const HIDDEN_CONTRAIL: ContrailPresentation = {
  visible: false,
  opacity: 0,
  lengthScale: 1,
};

// The simulation models terminal airspace rather than cruise flight. Keep the
// cosmetic trail at the very top of that scope so it never reads as exhaust on
// final, initial climb, taxi, or the runway surface.
export const MIN_CONTRAIL_ALTITUDE_FT = 3_500;
const FULL_CONTRAIL_ALTITUDE_FT = 5_000;

/**
 * Cosmetic, terminal-scale atmospheric presentation only. This adapter reads
 * authoritative flight/weather state and never feeds a result back into the
 * simulation or its safety model.
 */
export function contrailPresentation(
  flight: Flight,
  weather: WeatherState,
  enabled: boolean,
): ContrailPresentation {
  const profile = aircraftProfile(flight.aircraft);
  if (!enabled || profile.engineType !== "turbofan" || flight.motion.onGround)
    return HIDDEN_CONTRAIL;

  const altitude = flight.kinematics.altitudeFt;
  const upperArrival =
    flight.phase === "approach" &&
    flight.progress < 0.42 &&
    altitude >= MIN_CONTRAIL_ALTITUDE_FT;
  const upperDeparture =
    flight.phase === "takeoff" &&
    flight.motion.stage === "climbout" &&
    flight.motion.stageProgress > 0.56 &&
    altitude >= MIN_CONTRAIL_ALTITUDE_FT;
  const missedApproach =
    Boolean(flight.goAround) && altitude >= MIN_CONTRAIL_ALTITUDE_FT;
  const scopeExit =
    Boolean(flight.diversion) && altitude >= MIN_CONTRAIL_ALTITUDE_FT;
  if (!upperArrival && !upperDeparture && !missedApproach && !scopeExit)
    return HIDDEN_CONTRAIL;

  const moistWeather =
    weather.weatherEnabled &&
    (weather.condition === "rain" ||
      weather.condition === "fog" ||
      weather.condition === "snow" ||
      weather.condition === "thunderstorm");
  const coldLayer = weather.weatherEnabled && weather.temperatureC <= 10;
  // Humidity is not yet authoritative simulation state. A stable per-flight
  // moisture band gives occasional clear-weather trails without flicker.
  const moistureBand = deterministicMoisture(flight.id) < 0.42;
  if (!moistWeather && !coldLayer && !moistureBand) return HIDDEN_CONTRAIL;

  const altitudeMix = clamp(
    (altitude - MIN_CONTRAIL_ALTITUDE_FT) /
      (FULL_CONTRAIL_ALTITUDE_FT - MIN_CONTRAIL_ALTITUDE_FT),
    0,
    1,
  );
  const moistureMix = moistWeather ? 1 : coldLayer ? 0.72 : 0.46;
  return {
    visible: true,
    opacity: 0.055 + altitudeMix * 0.08 + moistureMix * 0.035,
    lengthScale: 0.78 + altitudeMix * 0.52,
  };
}

function deterministicMoisture(flightId: number): number {
  let value = Math.imul(flightId ^ 0xa71ce, 0x9e3779b1) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

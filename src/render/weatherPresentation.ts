import type { WeatherCondition, WeatherState } from "../simulation/types";

export interface WeatherPresentation {
  fogDensity: number;
  daySky: number;
  nightSky: number;
  solarAttenuation: number;
  precipitation: "none" | "rain" | "snow";
  particleColor: number;
  particleSize: number;
  particleOpacity: number;
  fallSpeed: number;
  windDrift: number;
}

const PRESENTATION: Record<WeatherCondition, WeatherPresentation> = {
  clear: {
    fogDensity: 0.0032,
    daySky: 0x789190,
    nightSky: 0x091b29,
    solarAttenuation: 1,
    precipitation: "none",
    particleColor: 0xc9e1e4,
    particleSize: 0.75,
    particleOpacity: 0,
    fallSpeed: 34,
    windDrift: 0.16,
  },
  haze: {
    fogDensity: 0.0046,
    daySky: 0x87918a,
    nightSky: 0x17242b,
    solarAttenuation: 0.8,
    precipitation: "none",
    particleColor: 0xc9e1e4,
    particleSize: 0.75,
    particleOpacity: 0,
    fallSpeed: 34,
    windDrift: 0.16,
  },
  rain: {
    fogDensity: 0.0052,
    daySky: 0x627675,
    nightSky: 0x10222a,
    solarAttenuation: 0.68,
    precipitation: "rain",
    particleColor: 0xc9e1e4,
    particleSize: 0.75,
    particleOpacity: 0.5,
    fallSpeed: 34,
    windDrift: 0.16,
  },
  fog: {
    fogDensity: 0.0074,
    daySky: 0x89938c,
    nightSky: 0x28343b,
    solarAttenuation: 0.52,
    precipitation: "none",
    particleColor: 0xc9e1e4,
    particleSize: 0.75,
    particleOpacity: 0,
    fallSpeed: 34,
    windDrift: 0.16,
  },
  snow: {
    fogDensity: 0.0064,
    daySky: 0x96a4a1,
    nightSky: 0x28343b,
    solarAttenuation: 0.58,
    precipitation: "snow",
    particleColor: 0xf1f3ed,
    particleSize: 1.15,
    particleOpacity: 0.72,
    fallSpeed: 8,
    windDrift: 0.25,
  },
  thunderstorm: {
    fogDensity: 0.007,
    daySky: 0x3f5458,
    nightSky: 0x0b1821,
    solarAttenuation: 0.38,
    precipitation: "rain",
    particleColor: 0xb8d7df,
    particleSize: 0.88,
    particleOpacity: 0.74,
    fallSpeed: 46,
    windDrift: 0.22,
  },
};

export function weatherPresentation(
  weather: Pick<WeatherState, "weatherEnabled" | "condition">,
): WeatherPresentation {
  return PRESENTATION[weather.weatherEnabled ? weather.condition : "clear"];
}


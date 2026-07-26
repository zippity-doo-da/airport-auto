import type { EnvironmentState, WeatherState } from "../simulation/types";
import { weatherPresentation } from "./weatherPresentation";

export type EnvironmentSurfaceKind = "terrain" | "district" | "pavement";

export interface EnvironmentPresentation {
  sky: number;
  fog: number;
  sun: number;
  sunIntensity: number;
  hemisphereIntensity: number;
  exposure: number;
  terrainTint: number;
  snowTint: number;
  daylight: number;
  cloudOpacity: number;
  wetPavement: number;
  snowCover: number;
  runwayLightIntensity: number;
}

export function environmentPresentation(
  environment: EnvironmentState,
  weather: WeatherState,
): EnvironmentPresentation {
  const weatherView = weatherPresentation(weather);
  const daylight = clamp01(environment.daylight);
  const nightMix = 1 - daylight;
  let sky = mixHex(weatherView.daySky, weatherView.nightSky, nightMix);
  if (environment.phase === "dawn") {
    sky = mixHex(sky, 0xb88772, (1 - Math.abs(daylight - 0.5) * 2) * 0.38);
  } else if (environment.phase === "dusk") {
    sky = mixHex(sky, 0x9d6f73, (1 - Math.abs(daylight - 0.5) * 2) * 0.44);
  }
  const seasonalTint: Record<EnvironmentState["season"], number> = {
    spring: 0x79916b,
    summer: 0x667f5f,
    autumn: 0x927b58,
    winter: 0x718078,
  };
  const twilight = environment.phase === "dawn" || environment.phase === "dusk"
    ? 1 - Math.abs(daylight - 0.5) * 2
    : 0;
  return {
    sky,
    fog: sky,
    sun: mixHex(0xa8c6df, 0xffd6a3, daylight * (1 - twilight * 0.28)),
    sunIntensity: 0.42 + daylight * 1.83 * weatherView.solarAttenuation,
    hemisphereIntensity: 0.58 + daylight * 0.87,
    exposure: 0.84 + daylight * 0.1,
    terrainTint: seasonalTint[environment.season],
    snowTint: 0xc8d3cb,
    daylight,
    cloudOpacity: clamp01(0.035 + environment.cloudCover * 0.26),
    wetPavement: clamp01(environment.wetPavement),
    snowCover: clamp01(environment.snowCover),
    runwayLightIntensity: clamp01(environment.runwayLightIntensity),
  };
}

export function mixHex(first: number, second: number, amount: number): number {
  const t = clamp01(amount);
  const firstR = (first >> 16) & 0xff;
  const firstG = (first >> 8) & 0xff;
  const firstB = first & 0xff;
  const secondR = (second >> 16) & 0xff;
  const secondG = (second >> 8) & 0xff;
  const secondB = second & 0xff;
  const channel = (start: number, end: number) => Math.round(start + (end - start) * t);
  return (channel(firstR, secondR) << 16)
    | (channel(firstG, secondG) << 8)
    | channel(firstB, secondB);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

import type {
  EnvironmentDayPhase,
  EnvironmentLightingMode,
  EnvironmentSeason,
  EnvironmentSeasonMode,
  EnvironmentState,
  WeatherState,
} from "./types";

export const ENVIRONMENT_LIGHTING_MODES = [
  "automatic",
  "day",
  "night",
] as const satisfies readonly EnvironmentLightingMode[];

export const ENVIRONMENT_SEASON_MODES = [
  "automatic",
  "spring",
  "summer",
  "autumn",
  "winter",
] as const satisfies readonly EnvironmentSeasonMode[];

export function isEnvironmentLightingMode(
  value: unknown,
): value is EnvironmentLightingMode {
  return typeof value === "string"
    && (ENVIRONMENT_LIGHTING_MODES as readonly string[]).includes(value);
}

export function isEnvironmentSeasonMode(
  value: unknown,
): value is EnvironmentSeasonMode {
  return typeof value === "string"
    && (ENVIRONMENT_SEASON_MODES as readonly string[]).includes(value);
}

export function createEnvironmentState(seed = 0): EnvironmentState {
  const dayOfYear = 1 + Math.floor(hash01(seed, 73) * 365);
  const season = seasonAtDay(dayOfYear);
  return {
    schemaVersion: 1,
    lightingMode: "automatic",
    seasonMode: "automatic",
    season,
    dayOfYear,
    localMinute: 0,
    localTime: "00:00",
    phase: "night",
    daylight: 0,
    sunAzimuthRadians: -Math.PI / 2,
    sunElevationRadians: -Math.PI / 8,
    cloudCover: 0.16,
    snowCover: 0,
    wetPavement: 0,
    runwayLightIntensity: 1,
    transitionModel: "fixed-step-continuous",
  };
}

export function updateEnvironmentState(
  environment: EnvironmentState,
  weather: WeatherState,
  localMinute: number,
  localTime: string,
  deltaSeconds: number,
): void {
  const season = environment.seasonMode === "automatic"
    ? seasonAtDay(environment.dayOfYear)
    : environment.seasonMode;
  const solar = solarState(
    normalizeMinute(localMinute),
    season,
    environment.lightingMode,
  );
  const weatherOn = weather.weatherEnabled;
  const cloudTarget = weatherOn ? weather.cloudCover : 0.16;
  const wetTarget = !weatherOn
    ? 0
    : weather.condition === "thunderstorm"
      ? 1
      : weather.condition === "rain"
        ? 0.84
        : weather.condition === "fog"
          ? 0.42
          : weather.condition === "snow"
            ? 0.34
            : 0;
  const snowTarget = weatherOn && weather.condition === "snow"
    ? Math.min(1, 0.58 + weather.intensity * 0.42)
    : 0;
  const step = Math.max(0, Math.min(1, deltaSeconds));
  const snowFallRate = 1 - Math.exp(-step * 0.055);
  const snowMeltRate = 1 - Math.exp(-step * (season === "winter" ? 0.0025 : 0.009));
  environment.season = season;
  environment.localMinute = Number(normalizeMinute(localMinute).toFixed(3));
  environment.localTime = localTime;
  environment.phase = solar.phase;
  environment.daylight = solar.daylight;
  environment.sunAzimuthRadians = solar.azimuth;
  environment.sunElevationRadians = solar.elevation;
  environment.cloudCover = approach(environment.cloudCover, cloudTarget, 1 - Math.exp(-step * 0.04));
  environment.wetPavement = approach(
    environment.wetPavement,
    wetTarget,
    1 - Math.exp(-step * (wetTarget > environment.wetPavement ? 0.075 : 0.018)),
  );
  environment.snowCover = approach(
    environment.snowCover,
    snowTarget,
    snowTarget > environment.snowCover ? snowFallRate : snowMeltRate,
  );
  const lowVisibility = weatherOn
    ? Math.max(0, Math.min(1, (5 - weather.visibility) / 4.5))
    : 0;
  environment.runwayLightIntensity = Number(Math.max(
    0.08,
    Math.min(
      1,
      (1 - environment.daylight) * 0.92
        + environment.cloudCover * 0.22
        + lowVisibility * 0.58,
    ),
  ).toFixed(4));
}

export function cloneEnvironmentState(
  environment: EnvironmentState,
): EnvironmentState {
  return { ...environment };
}

export function seasonAtDay(dayOfYear: number): EnvironmentSeason {
  const day = ((Math.floor(dayOfYear) - 1) % 365 + 365) % 365 + 1;
  if (day >= 80 && day < 172) return "spring";
  if (day >= 172 && day < 266) return "summer";
  if (day >= 266 && day < 355) return "autumn";
  return "winter";
}

function solarState(
  minute: number,
  season: EnvironmentSeason,
  mode: EnvironmentLightingMode,
): {
  phase: EnvironmentDayPhase;
  daylight: number;
  azimuth: number;
  elevation: number;
} {
  if (mode === "day") {
    return {
      phase: "day",
      daylight: 1,
      azimuth: Math.PI * 0.75,
      elevation: Math.PI * 0.34,
    };
  }
  if (mode === "night") {
    return {
      phase: "night",
      daylight: 0,
      azimuth: -Math.PI * 0.25,
      elevation: -Math.PI * 0.12,
    };
  }
  const daylightWindow: Record<EnvironmentSeason, [number, number]> = {
    spring: [355, 1_115],
    summer: [285, 1_260],
    autumn: [380, 1_075],
    winter: [450, 990],
  };
  const [sunrise, sunset] = daylightWindow[season];
  const twilight = 60;
  let phase: EnvironmentDayPhase = "night";
  let daylight = 0;
  if (minute >= sunrise - twilight && minute < sunrise + twilight) {
    phase = "dawn";
    daylight = smoothstep(sunrise - twilight, sunrise + twilight, minute);
  } else if (minute >= sunrise + twilight && minute < sunset - twilight) {
    phase = "day";
    daylight = 1;
  } else if (minute >= sunset - twilight && minute < sunset + twilight) {
    phase = "dusk";
    daylight = 1 - smoothstep(sunset - twilight, sunset + twilight, minute);
  }
  const solarProgress = Math.max(0, Math.min(1, (minute - sunrise) / Math.max(1, sunset - sunrise)));
  const elevation = Math.sin(solarProgress * Math.PI) * Math.PI * 0.34 * daylight
    - (1 - daylight) * Math.PI * 0.1;
  return {
    phase,
    daylight: Number(daylight.toFixed(5)),
    azimuth: -Math.PI * 0.35 + solarProgress * Math.PI * 1.7,
    elevation,
  };
}

function approach(current: number, target: number, amount: number): number {
  return Number((current + (target - current) * Math.max(0, Math.min(1, amount))).toFixed(6));
}

function normalizeMinute(value: number): number {
  return ((value % 1_440) + 1_440) % 1_440;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash01(seed: number, value: number): number {
  let hash = (seed ^ Math.imul(value + 1, 0x45d9f3b)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

import type { RunwayConfig } from "./airportConfig";
import type {
  RunwayBrakingAction,
  RunwayConditionCode,
  RunwayConditionReport,
  RunwayContaminant,
  TerminalWeatherHazard,
  WeatherCondition,
  WeatherState,
} from "./types";

export const WEATHER_CONDITIONS = [
  "clear",
  "haze",
  "rain",
  "fog",
  "snow",
  "thunderstorm",
] as const satisfies readonly WeatherCondition[];

export function isWeatherCondition(value: unknown): value is WeatherCondition {
  return typeof value === "string"
    && (WEATHER_CONDITIONS as readonly string[]).includes(value);
}

export interface WeatherConditionProfile {
  label: string;
  visibilityMiles: number;
  ceilingFt: number;
  temperatureC: number;
  surfaceCondition: WeatherState["surfaceCondition"];
  precipitation: WeatherState["precipitation"];
  intensity: number;
  cloudCover: number;
  gustDeltaKts: number;
  runwayCode: RunwayConditionCode;
  contaminant: RunwayContaminant;
  depthMm: number;
  coveragePercent: number;
}

const CONDITION_PROFILES: Record<WeatherCondition, WeatherConditionProfile> = {
  clear: {
    label: "Clear",
    visibilityMiles: 10,
    ceilingFt: 12_000,
    temperatureC: 18,
    surfaceCondition: "dry",
    precipitation: "none",
    intensity: 0,
    cloudCover: 0.16,
    gustDeltaKts: 3,
    runwayCode: 6,
    contaminant: "none",
    depthMm: 0,
    coveragePercent: 0,
  },
  haze: {
    label: "Haze",
    visibilityMiles: 4.5,
    ceilingFt: 7_000,
    temperatureC: 22,
    surfaceCondition: "dry",
    precipitation: "none",
    intensity: 0.22,
    cloudCover: 0.42,
    gustDeltaKts: 3,
    runwayCode: 6,
    contaminant: "none",
    depthMm: 0,
    coveragePercent: 0,
  },
  rain: {
    label: "Rain",
    visibilityMiles: 4.5,
    ceilingFt: 2_500,
    temperatureC: 9,
    surfaceCondition: "wet",
    precipitation: "rain",
    intensity: 0.52,
    cloudCover: 0.78,
    gustDeltaKts: 7,
    runwayCode: 5,
    contaminant: "water",
    depthMm: 1,
    coveragePercent: 100,
  },
  fog: {
    label: "Fog",
    visibilityMiles: 1.5,
    ceilingFt: 500,
    temperatureC: 7,
    surfaceCondition: "wet",
    precipitation: "none",
    intensity: 0.72,
    cloudCover: 1,
    gustDeltaKts: 3,
    runwayCode: 5,
    contaminant: "damp",
    depthMm: 0.5,
    coveragePercent: 100,
  },
  snow: {
    label: "Snow",
    visibilityMiles: 2.5,
    ceilingFt: 900,
    temperatureC: -4,
    surfaceCondition: "contaminated",
    precipitation: "snow",
    intensity: 0.68,
    cloudCover: 0.94,
    gustDeltaKts: 8,
    runwayCode: 3,
    contaminant: "wet-snow",
    depthMm: 5,
    coveragePercent: 100,
  },
  thunderstorm: {
    label: "Thunderstorm",
    visibilityMiles: 2,
    ceilingFt: 800,
    temperatureC: 19,
    surfaceCondition: "contaminated",
    precipitation: "rain",
    intensity: 1,
    cloudCover: 1,
    gustDeltaKts: 14,
    runwayCode: 2,
    contaminant: "standing-water",
    depthMm: 7,
    coveragePercent: 100,
  },
};

const RUNWAY_PERFORMANCE_MULTIPLIER: Record<
  RunwayConditionCode,
  { landing: number; takeoff: number; taxiBraking: number }
> = {
  6: { landing: 1, takeoff: 1, taxiBraking: 1 },
  5: { landing: 1.17, takeoff: 1.06, taxiBraking: 0.84 },
  4: { landing: 1.27, takeoff: 1.12, taxiBraking: 0.74 },
  3: { landing: 1.42, takeoff: 1.22, taxiBraking: 0.62 },
  2: { landing: 1.68, takeoff: 1.38, taxiBraking: 0.5 },
  1: { landing: 2.08, takeoff: 1.68, taxiBraking: 0.38 },
  0: { landing: Number.POSITIVE_INFINITY, takeoff: Number.POSITIVE_INFINITY, taxiBraking: 0.2 },
};

export function createWeatherState(seed = 0): WeatherState {
  return {
    weatherEnabled: false,
    windEnabled: false,
    condition: "clear",
    precipitation: "none",
    intensity: 0,
    cloudCover: CONDITION_PROFILES.clear.cloudCover,
    windDirection: Math.PI,
    windSpeed: 0,
    gustSpeed: 0,
    visibility: CONDITION_PROFILES.clear.visibilityMiles,
    ceilingFt: CONDITION_PROFILES.clear.ceilingFt,
    temperatureC: CONDITION_PROFILES.clear.temperatureC,
    surfaceCondition: "dry",
    runwayConditionReports: [],
    reportsUpdatedAtSeconds: -Infinity,
    hazardsEnabled: false,
    hazardSequence: 0,
    nextHazardAtSeconds: 90 + hash01(seed, 1) * 90,
    activeHazard: null,
    hazardHistory: [],
  };
}

export function weatherConditionProfile(
  condition: WeatherCondition,
): WeatherConditionProfile {
  return CONDITION_PROFILES[condition];
}

export function applyWeatherCondition(
  weather: WeatherState,
  condition: WeatherCondition,
  elapsedSeconds: number,
  seed: number,
): void {
  const profile = weatherConditionProfile(condition);
  weather.condition = condition;
  weather.precipitation = profile.precipitation;
  weather.intensity = profile.intensity;
  weather.cloudCover = profile.cloudCover;
  weather.visibility = profile.visibilityMiles;
  weather.ceilingFt = profile.ceilingFt;
  weather.temperatureC = profile.temperatureC + Math.sin(elapsedSeconds * 0.015 + seed) * (condition === "snow" ? 1.5 : 0.6);
  weather.surfaceCondition = profile.surfaceCondition;
}

export function brakingActionForCode(
  code: RunwayConditionCode,
): RunwayBrakingAction {
  if (code >= 5) return "good";
  if (code === 4) return "good-to-medium";
  if (code === 3) return "medium";
  if (code === 2) return "medium-to-poor";
  if (code === 1) return "poor";
  return "nil";
}

export function buildRunwayConditionReports(
  runways: readonly RunwayConfig[],
  weather: Pick<WeatherState, "condition" | "temperatureC">,
  elapsedSeconds: number,
  seed: number,
): RunwayConditionReport[] {
  const profile = weatherConditionProfile(weather.condition);
  const baseCode: RunwayConditionCode = weather.condition === "snow" && weather.temperatureC <= -15
    ? 4
    : profile.runwayCode;
  return runways.map((runway) => {
    const sequence = weather.condition === "snow"
      ? ([baseCode, Math.max(0, baseCode - 1), Math.max(0, baseCode - 1)] as number[])
      : weather.condition === "thunderstorm"
        ? [Math.min(3, baseCode + 1), baseCode, baseCode]
        : [baseCode, baseCode, baseCode];
    const rotation = Math.floor(hash01(seed + runway.id * 101, Math.floor(elapsedSeconds / 30)) * 3);
    const codes = [
      sequence[rotation % 3],
      sequence[(rotation + 1) % 3],
      sequence[(rotation + 2) % 3],
    ] as [RunwayConditionCode, RunwayConditionCode, RunwayConditionCode];
    const worstCode = Math.min(...codes) as RunwayConditionCode;
    return {
      schemaVersion: 1,
      runwayId: runway.id,
      codes,
      worstCode,
      brakingAction: brakingActionForCode(worstCode),
      contaminant: profile.contaminant,
      depthMm: profile.depthMm,
      coveragePercent: profile.coveragePercent,
      reportedAtSeconds: elapsedSeconds,
      source: "modeled-rcam-schematic",
      notForNavigation: true,
    };
  });
}

export function runwayConditionReport(
  weather: Pick<WeatherState, "surfaceCondition"> & {
    runwayConditionReports?: WeatherState["runwayConditionReports"];
  },
  runwayId: number,
): RunwayConditionReport {
  const report = weather.runwayConditionReports?.find(
    (candidate) => candidate.runwayId === runwayId,
  );
  if (report) return report;
  const code: RunwayConditionCode = weather.surfaceCondition === "dry"
    ? 6
    : weather.surfaceCondition === "wet"
      ? 5
      : 3;
  return {
    schemaVersion: 1,
    runwayId,
    codes: [code, code, code],
    worstCode: code,
    brakingAction: brakingActionForCode(code),
    contaminant: weather.surfaceCondition === "dry" ? "none" : weather.surfaceCondition === "wet" ? "water" : "wet-snow",
    depthMm: weather.surfaceCondition === "dry" ? 0 : weather.surfaceCondition === "wet" ? 1 : 5,
    coveragePercent: weather.surfaceCondition === "dry" ? 0 : 100,
    reportedAtSeconds: 0,
    source: "modeled-rcam-schematic",
    notForNavigation: true,
  };
}

export function runwayPerformanceMultiplier(
  code: RunwayConditionCode,
  operation: "landing" | "takeoff",
): number {
  return RUNWAY_PERFORMANCE_MULTIPLIER[code][operation];
}

export function taxiBrakingFactor(
  weather: Pick<WeatherState, "surfaceCondition"> & {
    runwayConditionReports?: WeatherState["runwayConditionReports"];
  },
): number {
  const reports = weather.runwayConditionReports ?? [];
  const worstCode = reports.length
    ? Math.min(...reports.map((report) => report.worstCode)) as RunwayConditionCode
    : weather.surfaceCondition === "dry"
      ? 6
      : weather.surfaceCondition === "wet"
        ? 5
        : 3;
  return RUNWAY_PERFORMANCE_MULTIPLIER[worstCode].taxiBraking;
}

export function taxiSpeedFactor(
  weather: Pick<WeatherState, "surfaceCondition"> & {
    runwayConditionReports?: WeatherState["runwayConditionReports"];
  },
): number {
  const braking = taxiBrakingFactor(weather);
  // Crews slow before turns and protected points as braking degrades. Keep the
  // factor bounded so an unavailable runway never makes a taxiing aircraft
  // freeze in open pavement; the safety layer still owns every full stop.
  return Math.max(0.48, Math.min(1, 0.3 + braking * 0.7));
}

export function weatherDurationMultiplier(
  condition: WeatherCondition,
  phase: "approach" | "landing" | "taxi-in" | "resting" | "taxi-out" | "takeoff",
): number {
  if (condition === "clear" || phase === "resting") return 1;
  if (condition === "haze") return phase === "approach" ? 1.06 : 1.02;
  if (condition === "rain") return phase === "taxi-in" || phase === "taxi-out" ? 1.2 : phase === "landing" || phase === "takeoff" ? 1.12 : 1.08;
  if (condition === "snow") return phase === "taxi-in" || phase === "taxi-out" ? 1.5 : phase === "landing" || phase === "takeoff" ? 1.35 : 1.22;
  if (condition === "thunderstorm") return phase === "taxi-in" || phase === "taxi-out" ? 1.42 : phase === "landing" || phase === "takeoff" ? 1.48 : 1.3;
  return phase === "taxi-in" || phase === "taxi-out" ? 1.35 : phase === "landing" || phase === "approach" ? 1.25 : 1.12;
}

export function nextWeatherHazardDelaySeconds(
  seed: number,
  sequence: number,
): number {
  return 70 + hash01(seed, sequence * 17 + 5) * 80;
}

export function createTerminalWeatherHazard(
  seed: number,
  sequence: number,
  elapsedSeconds: number,
  runwayIds: readonly number[],
): TerminalWeatherHazard | null {
  if (!runwayIds.length) return null;
  const kind = hash01(seed, sequence * 29 + 7) > 0.58
    ? "microburst"
    : "wind-shear";
  const operation = hash01(seed, sequence * 31 + 11) > 0.68
    ? "departure"
    : "arrival";
  const runwayId = runwayIds[Math.floor(hash01(seed, sequence * 37 + 13) * runwayIds.length) % runwayIds.length];
  const windChangeKts = Math.round(15 + hash01(seed, sequence * 41 + 17) * (kind === "microburst" ? 25 : 16));
  const locationNm = Math.round((0.8 + hash01(seed, sequence * 43 + 19) * (operation === "arrival" ? 2.2 : 1.2)) * 10) / 10;
  const activeSeconds = 10 + hash01(seed, sequence * 47 + 23) * 8;
  return {
    schemaVersion: 1,
    id: `WXH-${sequence}-${runwayId}`,
    kind,
    operation,
    runwayId,
    windChangeKts,
    locationNm,
    startedAtSeconds: elapsedSeconds,
    activeUntilSeconds: elapsedSeconds + activeSeconds,
    advisoryUntilSeconds: elapsedSeconds + 20,
    status: "active",
    affectedFlightIds: [],
    source: "deterministic-terminal-weather",
    notForNavigation: true,
  };
}

export function cloneWeatherState(weather: WeatherState): WeatherState {
  return {
    ...weather,
    runwayConditionReports: weather.runwayConditionReports.map((report) => ({
      ...report,
      codes: [...report.codes] as RunwayConditionReport["codes"],
    })),
    activeHazard: weather.activeHazard
      ? { ...weather.activeHazard, affectedFlightIds: [...weather.activeHazard.affectedFlightIds] }
      : null,
    hazardHistory: weather.hazardHistory.map((hazard) => ({
      ...hazard,
      affectedFlightIds: [...hazard.affectedFlightIds],
    })),
  };
}

function hash01(seed: number, value: number): number {
  let hash = (seed ^ Math.imul(value + 1, 0x45d9f3b)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

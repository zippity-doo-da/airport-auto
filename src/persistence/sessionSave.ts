import type {
  ControlMode,
  ControllerStation,
  TrafficScenario,
  WeatherCondition,
} from "../simulation/types";
import type { TrafficDensity } from "../simulation/trafficDensity";
import type { SeparationRulesetId } from "../simulation/separationRules";
import {
  migrateVersionedRecord,
  type SchemaMigrationResult,
} from "./schemaMigrations";

export const SESSION_SAVE_SCHEMA_VERSION = 1 as const;

const CONTROL_MODES: readonly ControlMode[] = [
  "auto",
  "assisted",
  "manual",
  "watch",
];
const TRAFFIC_SCENARIOS: readonly TrafficScenario[] = [
  "normal",
  "rush",
  "storm",
  "closure",
  "training",
  "emergency",
];
const TRAFFIC_DENSITIES: readonly TrafficDensity[] = [
  "quiet",
  "realistic",
  "busy",
  "rush",
  "extreme",
];
const CONTROLLER_STATIONS: readonly ControllerStation[] = [
  "approach",
  "tower",
  "ground",
  "ramp",
  "supervisor",
];
const WEATHER_CONDITIONS: readonly WeatherCondition[] = [
  "clear",
  "haze",
  "rain",
  "fog",
  "snow",
  "thunderstorm",
];
const SEPARATION_RULESETS: readonly SeparationRulesetId[] = [
  "forgiving",
  "realistic",
];

export interface AirportSessionSave extends Record<string, unknown> {
  schemaVersion: typeof SESSION_SAVE_SCHEMA_VERSION;
  kind: "airport-auto-session-launch";
  savedAt: string;
  airport: {
    code: string;
    seed: number;
  };
  operation: {
    mode: ControlMode;
    speed: number;
    scenario: TrafficScenario;
    density: TrafficDensity;
    station: ControllerStation;
    separationRuleset: SeparationRulesetId;
  };
  weather: {
    enabled: boolean;
    windEnabled: boolean;
    condition: WeatherCondition;
    directionDegrees: number;
    windSpeedKts: number;
    hazardsEnabled: boolean;
  };
}

export type AirportSessionSaveDraft = Omit<
  AirportSessionSave,
  "schemaVersion" | "kind" | "savedAt"
> & { savedAt?: string };

function oneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}

function finiteInRange(value: unknown, minimum: number, maximum: number): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function validateSessionSave(value: Record<string, unknown>): string | null {
  if (
    value.schemaVersion !== SESSION_SAVE_SCHEMA_VERSION ||
    value.kind !== "airport-auto-session-launch"
  )
    return "identity or schema marker is invalid";
  if (typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt)))
    return "savedAt must be an ISO-compatible timestamp";
  const airport = value.airport;
  const operation = value.operation;
  const weather = value.weather;
  if (!airport || typeof airport !== "object" || Array.isArray(airport))
    return "airport must be an object";
  if (!operation || typeof operation !== "object" || Array.isArray(operation))
    return "operation must be an object";
  if (!weather || typeof weather !== "object" || Array.isArray(weather))
    return "weather must be an object";
  const airportRecord = airport as Record<string, unknown>;
  const operationRecord = operation as Record<string, unknown>;
  const weatherRecord = weather as Record<string, unknown>;
  if (
    typeof airportRecord.code !== "string" ||
    !/^[A-Z0-9]{3,5}$/.test(airportRecord.code)
  )
    return "airport.code must be a 3–5 character airport identifier";
  if (
    !Number.isSafeInteger(airportRecord.seed) ||
    (airportRecord.seed as number) < 0
  )
    return "airport.seed must be a non-negative safe integer";
  if (!oneOf(operationRecord.mode, CONTROL_MODES))
    return "operation.mode is unsupported";
  if (!finiteInRange(operationRecord.speed, 0.25, 3))
    return "operation.speed must be between 0.25 and 3";
  if (!oneOf(operationRecord.scenario, TRAFFIC_SCENARIOS))
    return "operation.scenario is unsupported";
  if (!oneOf(operationRecord.density, TRAFFIC_DENSITIES))
    return "operation.density is unsupported";
  if (!oneOf(operationRecord.station, CONTROLLER_STATIONS))
    return "operation.station is unsupported";
  if (!oneOf(operationRecord.separationRuleset, SEPARATION_RULESETS))
    return "operation.separationRuleset is unsupported";
  if (
    typeof weatherRecord.enabled !== "boolean" ||
    typeof weatherRecord.windEnabled !== "boolean" ||
    typeof weatherRecord.hazardsEnabled !== "boolean"
  )
    return "weather switches must be boolean";
  if (!oneOf(weatherRecord.condition, WEATHER_CONDITIONS))
    return "weather.condition is unsupported";
  if (!finiteInRange(weatherRecord.directionDegrees, 0, 359.999))
    return "weather.directionDegrees must be in [0, 360)";
  if (!finiteInRange(weatherRecord.windSpeedKts, 0, 200))
    return "weather.windSpeedKts must be between 0 and 200";
  return null;
}

function legacySessionSave(value: Record<string, unknown>): Record<string, unknown> {
  const legacyWeather =
    value.weather && typeof value.weather === "object" && !Array.isArray(value.weather)
      ? (value.weather as Record<string, unknown>)
      : {};
  return {
    schemaVersion: SESSION_SAVE_SCHEMA_VERSION,
    kind: "airport-auto-session-launch",
    savedAt:
      typeof value.savedAt === "string"
        ? value.savedAt
        : new Date(0).toISOString(),
    airport: {
      code:
        typeof value.airportCode === "string"
          ? value.airportCode.toUpperCase()
          : "LOCAL",
      seed: Number.isSafeInteger(value.seed) ? value.seed : 0,
    },
    operation: {
      mode: value.mode ?? "auto",
      speed: value.speed ?? 1,
      scenario: value.scenario ?? "normal",
      density: value.density ?? "realistic",
      station: value.station ?? "supervisor",
      separationRuleset: value.separationRuleset ?? "forgiving",
    },
    weather: {
      enabled: legacyWeather.enabled ?? true,
      windEnabled: legacyWeather.windEnabled ?? true,
      condition: legacyWeather.condition ?? "clear",
      directionDegrees: legacyWeather.directionDegrees ?? 270,
      windSpeedKts: legacyWeather.windSpeedKts ?? 12,
      hazardsEnabled: legacyWeather.hazardsEnabled ?? false,
    },
  };
}

export function migrateAirportSessionSave(
  input: unknown,
): SchemaMigrationResult<AirportSessionSave> {
  return migrateVersionedRecord(input, {
    documentName: "Airport session launch save",
    currentVersion: SESSION_SAVE_SCHEMA_VERSION,
    unversionedVersion: 0,
    steps: [
      {
        fromVersion: 0,
        toVersion: 1,
        migrate: legacySessionSave,
      },
    ],
    validate: validateSessionSave,
    finalize: (value) => structuredClone(value) as AirportSessionSave,
  });
}

export function createAirportSessionSave(
  draft: AirportSessionSaveDraft,
): AirportSessionSave {
  const migration = migrateAirportSessionSave({
    ...draft,
    schemaVersion: SESSION_SAVE_SCHEMA_VERSION,
    kind: "airport-auto-session-launch",
    savedAt: draft.savedAt ?? new Date().toISOString(),
  });
  if (!migration.accepted || !migration.value)
    throw new Error(migration.reason);
  return migration.value;
}

export function buildSessionSaveLaunchUrl(
  baseUrl: string,
  save: AirportSessionSave,
): string {
  const migration = migrateAirportSessionSave(save);
  if (!migration.accepted || !migration.value)
    throw new Error(migration.reason);
  const current = migration.value;
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("airport", current.airport.code);
  url.searchParams.set("seed", String(current.airport.seed));
  url.searchParams.set("mode", current.operation.mode);
  url.searchParams.set("speed", String(current.operation.speed));
  url.searchParams.set("scenario", current.operation.scenario);
  url.searchParams.set("density", current.operation.density);
  url.searchParams.set("station", current.operation.station);
  url.searchParams.set("rules", current.operation.separationRuleset);
  url.searchParams.set(
    "weather",
    current.weather.enabled ? current.weather.condition : "off",
  );
  url.searchParams.set("wind", current.weather.windEnabled ? String(current.weather.windSpeedKts) : "off");
  url.searchParams.set("windDir", String(current.weather.directionDegrees));
  if (current.weather.hazardsEnabled) url.searchParams.set("hazards", "1");
  return url.toString();
}

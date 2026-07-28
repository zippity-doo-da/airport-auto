import type { EnvironmentLightingMode, EnvironmentSeasonMode, TrafficFlowObjective, WeatherCondition } from "./types";
import type { TrafficDensity } from "./trafficDensity";

export const AMBIENT_PROGRAM_IDS = [
  "dawn-bank",
  "midday-flow",
  "summer-storm",
  "snow-recovery",
  "quiet-overnight",
  "cargo-push",
  "international-evening",
] as const;

export type AmbientProgramId = (typeof AMBIENT_PROGRAM_IDS)[number];

export interface AmbientProgram {
  id: AmbientProgramId;
  label: string;
  description: string;
  localMinute: number;
  density: TrafficDensity;
  flowObjective: TrafficFlowObjective;
  weather: WeatherCondition;
  windDirectionDegrees: number;
  windSpeedKts: number;
  lightingMode: EnvironmentLightingMode;
  seasonMode: EnvironmentSeasonMode;
}

export const AMBIENT_PROGRAMS: Record<AmbientProgramId, AmbientProgram> = {
  "dawn-bank": { id: "dawn-bank", label: "Dawn Bank", description: "Early departures in a calm, brightening field.", localMinute: 345, density: "busy", flowObjective: "balanced", weather: "clear", windDirectionDegrees: 40, windSpeedKts: 7, lightingMode: "automatic", seasonMode: "automatic" },
  "midday-flow": { id: "midday-flow", label: "Midday Flow", description: "A clear, realistic daytime hub cadence.", localMinute: 720, density: "realistic", flowObjective: "balanced", weather: "clear", windDirectionDegrees: 210, windSpeedKts: 10, lightingMode: "automatic", seasonMode: "summer" },
  "summer-storm": { id: "summer-storm", label: "Summer Storm", description: "Weather recovery with severe hazards deliberately left off.", localMinute: 960, density: "realistic", flowObjective: "weather-recovery", weather: "thunderstorm", windDirectionDegrees: 250, windSpeedKts: 22, lightingMode: "automatic", seasonMode: "summer" },
  "snow-recovery": { id: "snow-recovery", label: "Snow Recovery", description: "Winter operations with spacing and recovery buffers.", localMinute: 510, density: "quiet", flowObjective: "weather-recovery", weather: "snow", windDirectionDegrees: 330, windSpeedKts: 14, lightingMode: "automatic", seasonMode: "winter" },
  "quiet-overnight": { id: "quiet-overnight", label: "Quiet Overnight", description: "Low-demand night operations with spacious flow.", localMinute: 90, density: "quiet", flowObjective: "watch-calm", weather: "clear", windDirectionDegrees: 20, windSpeedKts: 4, lightingMode: "automatic", seasonMode: "automatic" },
  "cargo-push": { id: "cargo-push", label: "Cargo Push", description: "A denser overnight freight-oriented bank.", localMinute: 135, density: "busy", flowObjective: "minimum-taxi-delay", weather: "clear", windDirectionDegrees: 15, windSpeedKts: 6, lightingMode: "automatic", seasonMode: "autumn" },
  "international-evening": { id: "international-evening", label: "International Evening", description: "An evening arrival bank with orderly metering.", localMinute: 1110, density: "busy", flowObjective: "minimum-holding", weather: "haze", windDirectionDegrees: 190, windSpeedKts: 9, lightingMode: "automatic", seasonMode: "automatic" },
};

export function ambientProgram(value: string): AmbientProgram | null {
  return AMBIENT_PROGRAMS[value as AmbientProgramId] ?? null;
}

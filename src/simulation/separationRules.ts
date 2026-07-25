import type { AirportConfig } from './airportConfig';
import type { AirportState, Flight, WakeClass, WeatherState } from './types';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';
import { runwaysConflict } from './runwayConflict';

export type SeparationRulesetId = 'forgiving' | 'realistic';
export type RunwayRelationship = 'same' | 'intersecting' | 'converging' | 'closely-spaced-parallel' | 'independent-parallel' | 'independent';
export type RunwayOperationKind = 'arrival' | 'departure' | 'intersection-departure' | 'opposite-direction';

export interface SeparationRuleset {
  schemaVersion: 1;
  id: SeparationRulesetId;
  label: string;
  description: string;
  physicalUnits: true;
  radarHorizontalNm: number;
  degradedRadarHorizontalNm: number;
  verticalFt: number;
  closelySpacedParallelThresholdFt: number;
  runwayBaseSeconds: Record<RunwayOperationKind, number>;
  wakeSeconds: Record<WakeClass, number>;
  wakeModel: {
    id: 'airport-auto-simplified-lmh';
    label: string;
    disclaimer: string;
  };
  sources: Array<{ title: string; url: string; use: string }>;
}

export interface RunwayOperationRecord {
  flightId: number;
  callsign: string;
  runwayId: number;
  operatingEnd: -1 | 1;
  kind: 'arrival' | 'departure';
  wakeClass: WakeClass;
  atSeconds: number;
}

export interface AirborneSeparationAssessment {
  compliant: boolean;
  horizontalNm: number;
  verticalFt: number;
  requiredHorizontalNm: number;
  requiredVerticalFt: number;
  reason: string;
}

const SOURCES = [
  {
    title: 'FAA Order JO 7110.65, 5-5-4 — Radar separation minima',
    url: 'https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_5.html',
    use: '3 NM terminal fusion separation and 5 NM degraded/multi-sensor fallback.',
  },
  {
    title: 'FAA Order JO 7110.65, Chapter 3 — Airport Traffic Control',
    url: 'https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap_3.html',
    use: 'Same-runway, intersection, converging, opposite-direction, and wake-turbulence rule families.',
  },
  {
    title: 'FAA Order JO 7110.65, 3-8 — Simultaneous runway operations',
    url: 'https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap3_section_8.html',
    use: 'Parallel-runway relationship thresholds and day/night opposite-direction framing.',
  },
];

export const SEPARATION_RULESETS: Record<SeparationRulesetId, SeparationRuleset> = {
  forgiving: {
    schemaVersion: 1,
    id: 'forgiving',
    label: 'Forgiving ATC',
    description: 'Physical units with intentionally compressed minima for a busy, recoverable game.',
    physicalUnits: true,
    radarHorizontalNm: 0.75,
    degradedRadarHorizontalNm: 1.25,
    verticalFt: 400,
    closelySpacedParallelThresholdFt: 1_000,
    runwayBaseSeconds: { arrival: 18, departure: 12, 'intersection-departure': 20, 'opposite-direction': 30 },
    wakeSeconds: { light: 0, medium: 5, heavy: 10 },
    wakeModel: {
      id: 'airport-auto-simplified-lmh',
      label: 'Simplified Light / Medium / Heavy',
      disclaimer: 'Game grouping derived from stored aircraft mass; it is not FAA CWT, RECAT, or an operational wake classification.',
    },
    sources: SOURCES,
  },
  realistic: {
    schemaVersion: 1,
    id: 'realistic',
    label: 'FAA-inspired terminal',
    description: 'Conservative physical terminal minima inspired by current FAA rule families; still a non-operational simulation.',
    physicalUnits: true,
    radarHorizontalNm: 3,
    degradedRadarHorizontalNm: 5,
    verticalFt: 1_000,
    closelySpacedParallelThresholdFt: 2_500,
    runwayBaseSeconds: { arrival: 60, departure: 60, 'intersection-departure': 120, 'opposite-direction': 180 },
    wakeSeconds: { light: 0, medium: 60, heavy: 120 },
    wakeModel: {
      id: 'airport-auto-simplified-lmh',
      label: 'Simplified Light / Medium / Heavy',
      disclaimer: 'This release does not claim CWT/RECAT fidelity. Wake groups remain explicitly simplified and are never presented as regulatory categories.',
    },
    sources: SOURCES,
  },
};

export function separationRuleset(id: SeparationRulesetId): SeparationRuleset {
  return SEPARATION_RULESETS[id];
}

export function requiredRadarSeparationNm(rules: SeparationRuleset, weather: WeatherState): number {
  const degraded = weather.visibility < 3 || weather.ceilingFt < 2_000 || weather.condition === 'fog' || weather.condition === 'snow';
  return degraded ? rules.degradedRadarHorizontalNm : rules.radarHorizontalNm;
}

export function assessAirborneSeparation(
  rules: SeparationRuleset,
  weather: WeatherState,
  first: Flight,
  second: Flight,
): AirborneSeparationAssessment {
  const horizontalNm = Math.hypot(first.motion.x - second.motion.x, first.motion.y - second.motion.y)
    * WORLD_METERS_PER_UNIT / 1_852;
  const verticalFt = Math.abs(first.kinematics.altitudeFt - second.kinematics.altitudeFt);
  const requiredHorizontalNm = requiredRadarSeparationNm(rules, weather);
  const requiredVerticalFt = rules.verticalFt;
  const compliant = horizontalNm >= requiredHorizontalNm || verticalFt >= requiredVerticalFt;
  return {
    compliant,
    horizontalNm,
    verticalFt,
    requiredHorizontalNm,
    requiredVerticalFt,
    reason: compliant
      ? `${horizontalNm.toFixed(2)} NM / ${Math.round(verticalFt)} ft — separated`
      : `${horizontalNm.toFixed(2)} NM and ${Math.round(verticalFt)} ft; requires ${requiredHorizontalNm} NM or ${requiredVerticalFt} ft`,
  };
}

export function runwayRelationship(
  config: AirportConfig,
  firstId: number,
  secondId: number,
  closelySpacedParallelThresholdFt = 2_500,
): RunwayRelationship {
  if (firstId === secondId) return 'same';
  const first = config.runways[firstId];
  const second = config.runways[secondId];
  if (!first || !second) return 'independent';
  if (runwaysConflict(config, firstId, secondId)) return 'intersecting';
  const headingDifference = Math.abs(Math.atan2(Math.sin(first.heading - second.heading), Math.cos(first.heading - second.heading)));
  const parallelDifference = Math.min(headingDifference, Math.abs(Math.PI - headingDifference));
  if (parallelDifference < 10 * Math.PI / 180) {
    const direction = { x: Math.cos(first.heading), y: Math.sin(first.heading) };
    const delta = { x: second.center[0] - first.center[0], y: second.center[1] - first.center[1] };
    const lateralFt = Math.abs(delta.x * -direction.y + delta.y * direction.x) * WORLD_METERS_PER_UNIT * 3.28084;
    return lateralFt < closelySpacedParallelThresholdFt ? 'closely-spaced-parallel' : 'independent-parallel';
  }
  return 'converging';
}

export function runwayPairIndependent(
  config: AirportConfig,
  state: AirportState,
  rules: SeparationRuleset,
  firstId: number,
  secondId: number,
): boolean {
  const relationship = runwayRelationship(config, firstId, secondId, rules.closelySpacedParallelThresholdFt);
  if (relationship === 'same' || relationship === 'intersecting' || relationship === 'converging') return false;
  if (relationship !== 'closely-spaced-parallel') return true;
  if (rules.id === 'forgiving') return true;
  const active = config.runwayConfigurations.find((configuration) => configuration.id === state.runwayConfigurationId);
  return Boolean(
    active?.procedure === 'instrument-parallel'
    && state.weather.visibility >= Math.max(3, active.restrictions.minimumVisibilityMiles ?? 0)
    && state.weather.ceilingFt >= 2_500
    && state.weather.windSpeed <= 25,
  );
}

export function runwayOperationSpacingSeconds(
  rules: SeparationRuleset,
  config: AirportConfig,
  leader: RunwayOperationRecord,
  follower: Pick<RunwayOperationRecord, 'runwayId' | 'operatingEnd' | 'kind' | 'wakeClass'>,
): { seconds: number; relationship: RunwayRelationship; operation: RunwayOperationKind; reason: string } {
  const relationship = runwayRelationship(config, leader.runwayId, follower.runwayId, rules.closelySpacedParallelThresholdFt);
  const opposite = leader.runwayId === follower.runwayId && leader.operatingEnd !== follower.operatingEnd;
  const operation: RunwayOperationKind = opposite
    ? 'opposite-direction'
    : follower.kind === 'departure' && relationship === 'intersecting'
      ? 'intersection-departure'
      : follower.kind;
  const wake = Math.max(rules.wakeSeconds[leader.wakeClass], rules.wakeSeconds[follower.wakeClass] * 0.5);
  const relationshipMultiplier = relationship === 'same'
    ? 1
    : relationship === 'intersecting' || relationship === 'converging'
      ? 1.15
      : relationship === 'closely-spaced-parallel'
        ? 0.85
        : 0;
  const seconds = relationshipMultiplier === 0 ? 0 : Math.ceil(Math.max(rules.runwayBaseSeconds[operation], wake) * relationshipMultiplier);
  return {
    seconds,
    relationship,
    operation,
    reason: seconds === 0
      ? `${relationship} runways do not share a modeled release interval`
      : `${seconds}s ${operation} interval · ${relationship} · ${rules.wakeModel.label}`,
  };
}

export function runwayReleaseReason(
  rules: SeparationRuleset,
  config: AirportConfig,
  history: RunwayOperationRecord[],
  now: number,
  follower: Pick<RunwayOperationRecord, 'runwayId' | 'operatingEnd' | 'kind' | 'wakeClass'>,
): string | null {
  let longest: { remaining: number; reason: string; callsign: string } | null = null;
  for (const leader of history) {
    const spacing = runwayOperationSpacingSeconds(rules, config, leader, follower);
    const remaining = spacing.seconds - (now - leader.atSeconds);
    if (remaining <= 0) continue;
    if (!longest || remaining > longest.remaining) longest = { remaining, reason: spacing.reason, callsign: leader.callsign };
  }
  return longest ? `${Math.ceil(longest.remaining)}s behind ${longest.callsign} · ${longest.reason}` : null;
}

export function weatherCapacityMultiplier(rules: SeparationRuleset, weather: WeatherState): number {
  if (rules.id === 'forgiving') {
    if (weather.condition === 'fog' || weather.condition === 'snow') return 0.72;
    if (weather.condition === 'rain') return 0.88;
    return 1;
  }
  if (weather.visibility < 3 || weather.ceilingFt < 800 || weather.condition === 'fog') return 0.42;
  if (weather.ceilingFt < 2_000) return 0.48;
  if (weather.condition === 'snow' || weather.surfaceCondition === 'contaminated') return 0.5;
  if (weather.condition === 'rain' || weather.surfaceCondition === 'wet') return 0.72;
  if (weather.windSpeed >= 25) return 0.66;
  return 1;
}

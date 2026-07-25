import type {
  ChallengeGrade,
  ChallengeId,
  ChallengeObjectiveSnapshot,
  ChallengeOperationalSummary,
  ChallengeState,
  ChallengeStatus,
  ShiftMetrics,
  TrafficScenario,
  WeatherCondition,
} from './types';
import type { TrafficDensity } from './trafficDensity';
import type { SeparationRulesetId } from './separationRules';

type ChallengeMetric = 'operations' | 'arrivals' | 'departures' | 'safety' | 'delay' | 'holding-fuel' | 'emergency-resolutions';
type ChallengeDirection = 'minimum' | 'maximum';

export interface ChallengeObjectiveDefinition {
  id: string;
  label: string;
  detail: string;
  metric: ChallengeMetric;
  direction: ChallengeDirection;
  centerTarget: number;
  airfieldTarget: number;
  weight: number;
}

export interface ChallengeDefinition {
  id: ChallengeId;
  title: string;
  shortTitle: string;
  summary: string;
  briefing: string;
  scenario: Exclude<TrafficScenario, 'normal' | 'training'>;
  density: TrafficDensity;
  separationRuleset: SeparationRulesetId;
  durationSeconds: number;
  weather: {
    condition: WeatherCondition;
    windSpeedKts: number;
  };
  objectives: readonly ChallengeObjectiveDefinition[];
}

const SAFETY_OBJECTIVE: ChallengeObjectiveDefinition = {
  id: 'safety',
  label: 'Protect every movement',
  detail: 'Finish with zero physical conflicts, runway incursions, or unexplained motion pauses.',
  metric: 'safety',
  direction: 'maximum',
  centerTarget: 0,
  airfieldTarget: 0,
  weight: 0.34,
};

const CHALLENGES: readonly ChallengeDefinition[] = [
  {
    id: 'rush-hour',
    title: 'Rush-hour bank',
    shortTitle: 'Rush hour',
    summary: 'Move a compressed hub bank without sacrificing spacing or burning fuel in avoidable holds.',
    briefing: 'Rush demand and a full departure bank are locked for six simulated minutes. Work any staffed desk; unstaffed positions remain automated.',
    scenario: 'rush',
    density: 'rush',
    separationRuleset: 'forgiving',
    durationSeconds: 360,
    weather: { condition: 'clear', windSpeedKts: 12 },
    objectives: [
      SAFETY_OBJECTIVE,
      { id: 'throughput', label: 'Move the bank', detail: 'Complete safe arrivals and departures before the shift clock expires.', metric: 'operations', direction: 'minimum', centerTarget: 8, airfieldTarget: 4, weight: 0.3 },
      { id: 'delay', label: 'Contain delay', detail: 'Keep accumulated protected-hold delay efficient for each completed movement.', metric: 'delay', direction: 'maximum', centerTarget: 90, airfieldTarget: 75, weight: 0.2 },
      { id: 'fuel', label: 'Limit holding fuel', detail: 'Keep fuel burned while held below the target share of all modeled burn.', metric: 'holding-fuel', direction: 'maximum', centerTarget: 24, airfieldTarget: 22, weight: 0.16 },
    ],
  },
  {
    id: 'storm-operations',
    title: 'Storm operations',
    shortTitle: 'Storm',
    summary: 'Recover a rain-reduced arrival stream while wet-runway performance and gusts reduce capacity.',
    briefing: 'Rain, a 24-knot wind, wet pavement, and reduced instrument capacity stay active for seven simulated minutes.',
    scenario: 'storm',
    density: 'busy',
    separationRuleset: 'forgiving',
    durationSeconds: 420,
    weather: { condition: 'rain', windSpeedKts: 24 },
    objectives: [
      SAFETY_OBJECTIVE,
      { id: 'arrivals', label: 'Recover arrivals', detail: 'Land the required number of aircraft using stable approaches and safe go-arounds.', metric: 'arrivals', direction: 'minimum', centerTarget: 3, airfieldTarget: 1, weight: 0.28 },
      { id: 'delay', label: 'Meter the storm', detail: 'Keep delay per completed movement below the degraded-weather target.', metric: 'delay', direction: 'maximum', centerTarget: 115, airfieldTarget: 95, weight: 0.2 },
      { id: 'fuel', label: 'Protect reserves', detail: 'Avoid turning weather spacing into prolonged fuel-burning holds.', metric: 'holding-fuel', direction: 'maximum', centerTarget: 30, airfieldTarget: 27, weight: 0.18 },
    ],
  },
  {
    id: 'runway-closure',
    title: 'Runway-closure recovery',
    shortTitle: 'Closure',
    summary: 'Keep the airport moving after an arrival or mixed-use runway closes and traffic rebalances.',
    briefing: 'One capacity-bearing runway remains protected and unavailable for seven simulated minutes. Its scenario restriction cannot be cleared during the challenge.',
    scenario: 'closure',
    density: 'busy',
    separationRuleset: 'forgiving',
    durationSeconds: 420,
    weather: { condition: 'clear', windSpeedKts: 14 },
    objectives: [
      SAFETY_OBJECTIVE,
      { id: 'throughput', label: 'Use remaining capacity', detail: 'Complete movements on the available runway system.', metric: 'operations', direction: 'minimum', centerTarget: 7, airfieldTarget: 3, weight: 0.25 },
      { id: 'departures', label: 'Release departures', detail: 'Prevent the closure response from becoming an arrival-only operation.', metric: 'departures', direction: 'minimum', centerTarget: 2, airfieldTarget: 1, weight: 0.16 },
      { id: 'delay', label: 'Control the queue', detail: 'Keep delay per completed movement below the closure target.', metric: 'delay', direction: 'maximum', centerTarget: 105, airfieldTarget: 90, weight: 0.15 },
      { id: 'fuel', label: 'Limit holding fuel', detail: 'Meter demand before airborne and surface queues waste fuel.', metric: 'holding-fuel', direction: 'maximum', centerTarget: 28, airfieldTarget: 25, weight: 0.1 },
    ],
  },
  {
    id: 'emergency-priority',
    title: 'Emergency priority',
    shortTitle: 'Emergency',
    summary: 'Recover a priority aircraft while protecting the rest of the airport from secondary disruption.',
    briefing: 'A medical-priority arrival enters with the opening traffic picture. Resolve it and restore useful flow within five simulated minutes.',
    scenario: 'emergency',
    density: 'realistic',
    separationRuleset: 'forgiving',
    durationSeconds: 300,
    weather: { condition: 'clear', windSpeedKts: 10 },
    objectives: [
      SAFETY_OBJECTIVE,
      { id: 'emergency', label: 'Resolve the priority', detail: 'Land at least one emergency aircraft safely.', metric: 'emergency-resolutions', direction: 'minimum', centerTarget: 1, airfieldTarget: 1, weight: 0.3 },
      { id: 'throughput', label: 'Restore normal flow', detail: 'Complete additional safe movements around the priority operation.', metric: 'operations', direction: 'minimum', centerTarget: 4, airfieldTarget: 2, weight: 0.16 },
      { id: 'delay', label: 'Limit disruption', detail: 'Keep average protected-hold delay under the emergency target.', metric: 'delay', direction: 'maximum', centerTarget: 85, airfieldTarget: 75, weight: 0.12 },
      { id: 'fuel', label: 'Protect reserves', detail: 'Keep holding fuel below the target share while priority traffic is sequenced.', metric: 'holding-fuel', direction: 'maximum', centerTarget: 25, airfieldTarget: 22, weight: 0.08 },
    ],
  },
] as const;

function emptySummary(): ChallengeOperationalSummary {
  return {
    elapsedSeconds: 0,
    remainingSeconds: 0,
    operations: 0,
    arrivals: 0,
    departures: 0,
    throughputPerHour: 0,
    totalDelaySeconds: 0,
    delayPerOperationSeconds: 0,
    fuelBurnKg: 0,
    holdingFuelBurnKg: 0,
    holdingFuelPercent: 0,
    emergencyResolutions: 0,
    goArounds: 0,
    safety: {
      score: 100,
      collisionAlerts: 0,
      runwayIncursions: 0,
      unexplainedPauses: 0,
      missedHandoffs: 0,
      preventedConflicts: 0,
    },
  };
}

export function createInactiveChallengeState(): ChallengeState {
  return {
    status: 'inactive',
    challengeId: null,
    startedAtSeconds: 0,
    durationSeconds: 0,
    endedAtSeconds: null,
    completionReason: null,
    score: 0,
    grade: 'F',
    objectives: [],
    summary: emptySummary(),
  };
}

export function challengeDefinitions(): readonly ChallengeDefinition[] {
  return CHALLENGES;
}

export function challengeDefinition(id: ChallengeId | null): ChallengeDefinition | null {
  return CHALLENGES.find((challenge) => challenge.id === id) ?? null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function gradeForScore(score: number): ChallengeGrade {
  if (score >= 97) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function metricValue(metric: ChallengeMetric, summary: ChallengeOperationalSummary): number {
  if (metric === 'operations') return summary.operations;
  if (metric === 'arrivals') return summary.arrivals;
  if (metric === 'departures') return summary.departures;
  if (metric === 'safety') return summary.safety.collisionAlerts + summary.safety.runwayIncursions + summary.safety.unexplainedPauses;
  if (metric === 'delay') return summary.delayPerOperationSeconds;
  if (metric === 'holding-fuel') return summary.holdingFuelPercent;
  return summary.emergencyResolutions;
}

function displayMetric(metric: ChallengeMetric, value: number): string {
  if (metric === 'delay') return `${Math.round(value)} sec/op`;
  if (metric === 'holding-fuel') return `${value.toFixed(1)}%`;
  if (metric === 'safety') return value === 0 ? 'Clear' : `${Math.round(value)} breach${value === 1 ? '' : 'es'}`;
  return String(Math.round(value));
}

function displayTarget(metric: ChallengeMetric, direction: ChallengeDirection, target: number): string {
  const operator = direction === 'minimum' ? '≥' : '≤';
  if (metric === 'delay') return `${operator} ${Math.round(target)} sec/op`;
  if (metric === 'holding-fuel') return `${operator} ${target.toFixed(0)}%`;
  if (metric === 'safety') return '0 breaches';
  return `${operator} ${Math.round(target)}`;
}

function objectiveScore(direction: ChallengeDirection, value: number, target: number): number {
  if (direction === 'minimum') return target <= 0 ? 100 : clamp(value / target, 0, 1) * 100;
  if (target === 0) return value === 0 ? 100 : 0;
  if (value <= target) return 100;
  return clamp(1 - (value - target) / Math.max(1, target * 1.5), 0, 1) * 100;
}

function objectiveStatus(
  definition: ChallengeObjectiveDefinition,
  value: number,
  target: number,
  elapsedRatio: number,
  status: ChallengeStatus,
): ChallengeObjectiveSnapshot['status'] {
  const terminal = status === 'complete' || status === 'failed' || status === 'abandoned';
  const satisfied = definition.direction === 'minimum' ? value >= target : value <= target;
  if (terminal) return satisfied ? 'met' : 'failed';
  if (definition.direction === 'minimum') {
    if (satisfied) return 'met';
    if (elapsedRatio < 0.15) return 'pending';
    return value + 1e-6 >= target * elapsedRatio * 0.72 ? 'on-track' : 'attention';
  }
  if (!satisfied) return definition.metric === 'safety' ? 'failed' : 'attention';
  return 'on-track';
}

export function evaluateChallenge(
  state: ChallengeState,
  metrics: ShiftMetrics,
  airportScope: 'airfield' | 'center',
  nowSeconds: number,
): Pick<ChallengeState, 'score' | 'grade' | 'objectives' | 'summary'> {
  const definition = challengeDefinition(state.challengeId);
  if (!definition) return { score: 0, grade: 'F', objectives: [], summary: emptySummary() };
  const ending = state.endedAtSeconds ?? nowSeconds;
  const elapsedSeconds = state.status === 'briefing' ? 0 : clamp(ending - state.startedAtSeconds, 0, state.durationSeconds);
  const operations = metrics.safeArrivals + metrics.safeDepartures;
  const fuelBurnKg = Math.max(0, metrics.fuelBurnKg);
  const holdingFuelBurnKg = Math.max(0, metrics.holdingFuelBurnKg);
  const safetyScore = clamp(
    100
      - metrics.collisionAlerts * 50
      - metrics.runwayIncursions * 50
      - metrics.unexplainedPauses * 10
      - metrics.missedHandoffs * 4,
    0,
    100,
  );
  const summary: ChallengeOperationalSummary = {
    elapsedSeconds: round(elapsedSeconds),
    remainingSeconds: round(Math.max(0, state.durationSeconds - elapsedSeconds)),
    operations,
    arrivals: metrics.safeArrivals,
    departures: metrics.safeDepartures,
    throughputPerHour: elapsedSeconds < 1 ? 0 : round(operations / elapsedSeconds * 3_600, 1),
    totalDelaySeconds: round(metrics.estimatedDelaySeconds),
    delayPerOperationSeconds: round(metrics.estimatedDelaySeconds / Math.max(1, operations), 1),
    fuelBurnKg: round(fuelBurnKg, 1),
    holdingFuelBurnKg: round(holdingFuelBurnKg, 1),
    holdingFuelPercent: fuelBurnKg <= 1e-6 ? 0 : round(holdingFuelBurnKg / fuelBurnKg * 100, 1),
    emergencyResolutions: metrics.emergencyResolutions,
    goArounds: metrics.goArounds,
    safety: {
      score: Math.round(safetyScore),
      collisionAlerts: metrics.collisionAlerts,
      runwayIncursions: metrics.runwayIncursions,
      unexplainedPauses: metrics.unexplainedPauses,
      missedHandoffs: metrics.missedHandoffs,
      preventedConflicts: metrics.preventedConflicts,
    },
  };
  const elapsedRatio = state.durationSeconds <= 0 ? 0 : elapsedSeconds / state.durationSeconds;
  const objectives = definition.objectives.map((objective): ChallengeObjectiveSnapshot => {
    const targetValue = airportScope === 'center' ? objective.centerTarget : objective.airfieldTarget;
    const value = metricValue(objective.metric, summary);
    const progress = objective.direction === 'minimum'
      ? targetValue <= 0 ? 1 : clamp(value / targetValue, 0, 1)
      : targetValue === 0 ? (value === 0 ? 1 : 0) : clamp(1 - Math.max(0, value - targetValue) / Math.max(1, targetValue * 1.5), 0, 1);
    return {
      id: objective.id,
      label: objective.label,
      detail: objective.detail,
      displayValue: displayMetric(objective.metric, value),
      target: displayTarget(objective.metric, objective.direction, targetValue),
      value: round(value),
      targetValue,
      progress: round(progress, 3),
      weight: objective.weight,
      status: objectiveStatus(objective, value, targetValue, elapsedRatio, state.status),
    };
  });
  const totalWeight = definition.objectives.reduce((sum, objective) => sum + objective.weight, 0);
  let score = Math.round(definition.objectives.reduce((sum, objective) => {
    const target = airportScope === 'center' ? objective.centerTarget : objective.airfieldTarget;
    return sum + objectiveScore(objective.direction, metricValue(objective.metric, summary), target) * objective.weight;
  }, 0) / Math.max(0.001, totalWeight));
  if (summary.safety.collisionAlerts || summary.safety.runwayIncursions || summary.safety.unexplainedPauses) score = Math.min(score, 59);
  if (state.status === 'abandoned') score = Math.min(score, 59);
  return { score, grade: gradeForScore(score), objectives, summary };
}

export function cloneChallengeState(challenge: ChallengeState): ChallengeState {
  return {
    ...challenge,
    objectives: challenge.objectives.map((objective) => ({ ...objective })),
    summary: {
      ...challenge.summary,
      safety: { ...challenge.summary.safety },
    },
  };
}

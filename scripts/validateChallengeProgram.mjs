import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { challengeDefinitions, cloneChallengeState, createInactiveChallengeState, evaluateChallenge } from './src/simulation/challengeProgram.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function metrics(overrides = {}) {
  return {
    safeArrivals: 0,
    safeDepartures: 0,
    preventedConflicts: 0,
    holdsIssued: 0,
    manualCommands: 0,
    maxConcurrent: 0,
    airborneSeconds: 0,
    taxiSeconds: 0,
    estimatedDelaySeconds: 0,
    diversions: 0,
    cancellations: 0,
    emergencyResponses: 0,
    safetyHolds: 0,
    collisionAlerts: 0,
    runwayIncursions: 0,
    unexplainedPauses: 0,
    longestHoldSeconds: 0,
    handoffOffers: 0,
    handoffAcceptances: 0,
    handoffRejections: 0,
    missedHandoffs: 0,
    fuelBurnKg: 0,
    holdingFuelBurnKg: 0,
    goArounds: 0,
    emergencyResolutions: 0,
    ...overrides,
  };
}

const definitions = challengeDefinitions();
assert(definitions.length === 4, 'challenge program must ship four complete shifts');
assert(new Set(definitions.map((definition) => definition.id)).size === definitions.length, 'challenge IDs are not unique');
assert(new Set(definitions.map((definition) => definition.scenario)).size === 4, 'challenge scenarios must cover rush, storm, closure, and emergency');
for (const definition of definitions) {
  assert(definition.durationSeconds >= 300 && definition.durationSeconds <= 420, definition.id + ' duration is outside the intended five-to-seven-minute range');
  assert(definition.objectives.length >= 4, definition.id + ' lacks a complete scorecard');
  assert(definition.objectives.some((objective) => objective.id === 'safety'), definition.id + ' lacks a safety objective');
  const totalWeight = definition.objectives.reduce((sum, objective) => sum + objective.weight, 0);
  assert(Math.abs(totalWeight - 1) < 0.001, definition.id + ' objective weights do not total 100%');
}

const scoringState = {
  ...createInactiveChallengeState(),
  status: 'complete',
  challengeId: 'rush-hour',
  durationSeconds: 360,
  startedAtSeconds: 0,
  endedAtSeconds: 360,
};
const excellent = evaluateChallenge(scoringState, metrics({
  safeArrivals: 5,
  safeDepartures: 5,
  estimatedDelaySeconds: 300,
  fuelBurnKg: 10_000,
  holdingFuelBurnKg: 1_000,
}), 'center', 360);
assert(excellent.grade === 'A+' && excellent.score === 100, 'excellent challenge metrics did not earn an A+');
assert(excellent.summary.operations === 10 && excellent.summary.throughputPerHour === 100, 'throughput summary is incorrect');
assert(excellent.summary.delayPerOperationSeconds === 30 && excellent.summary.holdingFuelPercent === 10, 'delay or fuel summary is incorrect');

const unsafe = evaluateChallenge(scoringState, metrics({
  safeArrivals: 5,
  safeDepartures: 5,
  collisionAlerts: 1,
  fuelBurnKg: 1_000,
}), 'center', 360);
assert(unsafe.grade === 'F' && unsafe.score <= 59, 'a physical safety breach did not cap the grade at F');

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD');
const simulation = new AirportSimulation(generateHubConfig(ordIndex), 'realistic');
simulation.setMode('auto');
assert(simulation.startChallenge('rush-hour'), 'rush-hour briefing did not open');
assert(simulation.state.challenge.status === 'briefing' && simulation.state.paused, 'challenge did not open at a deliberate briefing pause');
assert(simulation.state.mode === 'assisted', 'automatic control was not converted to assisted control');
assert(simulation.state.scenario === 'rush' && simulation.state.trafficFlow.density === 'rush', 'challenge traffic conditions were not applied');
assert(simulation.state.separationRuleset === 'forgiving', 'challenge separation rules were not applied');
assert(Object.values(simulation.state.stationAutomation).every(Boolean), 'unstaffed challenge desks did not remain automated');
assert(!simulation.setPaused(false), 'generic resume bypassed the challenge briefing');
assert(!simulation.setScenario('normal'), 'scenario changed during a locked challenge');
assert(!simulation.setTrafficDensity('quiet'), 'traffic density changed during a locked challenge');
assert(!simulation.setSeparationRuleset('realistic'), 'separation rules changed during a locked challenge');
assert(!simulation.setWeatherEnabled(false) && !simulation.setWindEnabled(false), 'weather switches changed during a locked challenge');
assert(!simulation.setRunwayConfiguration(null), 'runway configuration changed during a locked challenge');
assert(!simulation.setMode('auto') && simulation.setMode('manual'), 'challenge mode lock did not allow only hands-on modes');
assert(simulation.beginChallenge(), 'challenge clock did not start');
for (let tick = 0; tick < 20; tick += 1) simulation.update(0.05);
assert(simulation.shiftMetrics().fuelBurnKg > 0, 'authoritative aircraft burn did not feed the challenge fuel summary');

assert(simulation.endChallenge(), 'active challenge could not be ended early');
assert(simulation.state.challenge.status === 'abandoned' && simulation.state.challenge.grade === 'F', 'early ending did not produce a terminal F debrief');
const cloned = cloneChallengeState(simulation.state.challenge);
cloned.summary.safety.score = 0;
assert(simulation.state.challenge.summary.safety.score !== 0, 'challenge clone shares nested safety state');
assert(simulation.continueAfterChallenge(), 'challenge debrief could not continue into free play');
assert(simulation.state.challenge.status === 'inactive' && !simulation.state.gameOver && !simulation.state.paused, 'free play did not resume cleanly');
assert(simulation.setScenario('normal'), 'challenge conditions remained locked after the debrief');

assert(simulation.startChallenge('runway-closure'), 'closure challenge did not start');
const scenarioClosure = simulation.state.surfaceDisruptions.find((disruption) => disruption.source === 'scenario');
assert(scenarioClosure, 'closure challenge has no protected runway restriction');
assert(!simulation.clearSurfaceDisruption(scenarioClosure.id), 'scenario runway restriction was cleared during the challenge');
simulation.state.challenge.durationSeconds = 0.15;
assert(simulation.beginChallenge(), 'closure challenge clock did not start');
for (let tick = 0; tick < 6 && simulation.state.challenge.status === 'active'; tick += 1) simulation.update(0.05);
assert(simulation.state.challenge.status === 'complete', 'challenge did not close exactly at its authoritative clock');
assert(simulation.state.gameOver && simulation.state.paused && simulation.state.challenge.endedAtSeconds !== null, 'completed challenge did not freeze a debrief state');

assert(simulation.continueAfterChallenge(), 'completed closure challenge could not continue');
assert(simulation.startChallenge('emergency-priority'), 'emergency challenge did not start');
assert(simulation.state.flights.some((flight) => flight.emergency === 'medical'), 'emergency challenge did not seed its priority aircraft');

assert(simulation.startTrainingLesson('arrival-basics'), 'training could not supersede a challenge');
assert(simulation.state.challenge.status === 'inactive' && simulation.state.training.status === 'coach-paused', 'training and challenge states remained active together');

console.log(JSON.stringify({
  challenges: definitions.length,
  scenarios: definitions.map((definition) => definition.scenario),
  deterministicScoring: true,
  lockedConditions: true,
  clockCompletion: true,
  operationalSummary: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "challenge-program-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Challenge-program validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

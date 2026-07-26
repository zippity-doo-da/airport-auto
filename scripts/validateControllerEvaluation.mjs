import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { controllerEvaluationSnapshot, isEvaluatedControllerCommand } from './src/telemetry/controllerEvaluation.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD');
const simulation = new AirportSimulation(generateHubConfig(ordIndex), 'quiet');
simulation.setMode('manual');
simulation.setStation('ground');
const taxi = simulation.state.flights.find((flight) => flight.phase === 'taxi-in' || flight.phase === 'taxi-out');
assert(taxi, 'controller evaluation fixture requires a surface aircraft');
taxi.navigation.frequencyOwner = 'ground';
taxi.controlHold = true;
taxi.automaticHold = false;
taxi.safetyHold = false;
taxi.crossingHoldRunway = undefined;
taxi.emergency = undefined;
taxi.surfaceReroute = undefined;
taxi.deicing.required = false;
taxi.deicing.status = 'not-required';
simulation.state.elapsed = 60;

const commands = [
  {
    id: 'command-hold',
    elapsedSeconds: 0,
    station: 'ground',
    source: 'agent',
    actorId: 'ground-agent',
    clientId: 'evaluation-test',
    command: { action: 'holdPosition', flightId: taxi.id },
    accepted: true,
    reason: 'accepted',
  },
  {
    id: 'command-cross',
    elapsedSeconds: 1,
    station: 'ground',
    source: 'agent',
    actorId: 'ground-agent',
    clientId: 'evaluation-test',
    command: { action: 'clearRunwayCrossing', flightId: taxi.id, runway: taxi.runway },
    accepted: false,
    reason: 'runway remains protected',
  },
  {
    id: 'command-camera',
    elapsedSeconds: 2,
    station: 'ground',
    source: 'page',
    actorId: null,
    clientId: null,
    command: { action: 'zoomIn' },
    accepted: true,
    reason: 'accepted',
  },
];
assert(isEvaluatedControllerCommand(commands[0].command), 'surface hold is not in the evaluation command scope');
assert(!isEvaluatedControllerCommand(commands[2].command), 'camera command entered controller quality scoring');

const runtime = simulation.state.scriptedControllers.stations.ground;
runtime.planned = 3;
runtime.accepted = 1;
runtime.rejected = 1;
runtime.deferred = 1;

const metrics = {
  ...simulation.shiftMetrics(),
  safeArrivals: 2,
  safeDepartures: 1,
  preventedConflicts: 3,
  estimatedDelaySeconds: 90,
  fuelBurnKg: 1_000,
  holdingFuelBurnKg: 100,
};

function evaluate(overrides = {}) {
  return controllerEvaluationSnapshot({
    state: simulation.state,
    metrics: overrides.metrics ?? metrics,
    queues: simulation.queueSnapshot(),
    predictions: overrides.predictions ?? [],
    workloads: simulation.controllerWorkloads(),
    commands,
  });
}

const evaluation = evaluate();
assert(evaluation.schemaVersion === 1 && evaluation.methodVersion === '1.0.0', 'evaluation schema identity is incorrect');
assert(evaluation.safetyBoundary === 'read-only', 'evaluation does not declare its read-only safety boundary');
assert(evaluation.operations.completed === 3 && evaluation.operations.throughputPerHour === 180, 'throughput calculation is incorrect');
assert(evaluation.operations.delayPerOperationSeconds === 30, 'delay per operation is incorrect');
assert(evaluation.fuel.holdingBurnPercent === 10, 'holding fuel impact is incorrect');
assert(evaluation.safety.preventedConflicts === 3, 'prevented conflict metric is missing');
assert(evaluation.holds.unnecessary === 1 && evaluation.holds.unnecessarySeconds === 15, 'stale surface hold was not detected after its review window');
assert(evaluation.holds.candidates[0].flightId === taxi.id && evaluation.holds.candidates[0].station === 'ground', 'stale hold attribution is incorrect');

const ground = evaluation.stations.find((station) => station.station === 'ground');
assert(ground, 'Ground evaluation is missing');
assert(ground.attempts === 5 && ground.accepted === 2 && ground.rejected === 2 && ground.deferred === 1, 'human and scripted decisions were not combined correctly');
assert(ground.acceptancePercent === 50, 'deferrals incorrectly changed the accepted/rejected denominator');
assert(ground.commandQualityScore < 100 && ground.commandQualityRating !== 'not-rated', 'command quality ignored rejected commands or stale holds');
const agent = evaluation.actors.find((actor) => actor.actorId === 'ground-agent');
assert(agent?.attempts === 2 && agent.accepted === 1 && agent.rejected === 1, 'actor-specific command outcomes are incorrect');
const scripted = evaluation.actors.find((actor) => actor.actorId === 'scripted:ground');
assert(scripted?.attempts === 3 && scripted.deferred === 1 && scripted.rejected === 1, 'scripted deferral was counted as a rejection');

taxi.safetyHold = true;
const protectedEvaluation = evaluate();
assert(protectedEvaluation.holds.unnecessary === 0, 'safety-protected hold was mislabeled unnecessary');
taxi.safetyHold = false;

const safetyMetrics = {
  ...metrics,
  safeArrivals: 100,
  safeDepartures: 100,
  collisionAlerts: 1,
  runwayIncursions: 1,
};
const unsafe = evaluate({
  metrics: safetyMetrics,
  predictions: [{ severity: 'warning', type: 'crossing', flights: [taxi.id], runway: taxi.runway, etaSeconds: 2, detail: 'test warning' }],
});
assert(unsafe.commands.commandQualityScore === 0, 'high throughput offset a physical safety penalty');
assert(unsafe.safety.activeConflictWarnings === 1 && unsafe.safety.runwayIncursions === 1, 'safety outcome metrics are incomplete');

const unratedSimulation = new AirportSimulation(generateHubConfig(ordIndex), 'quiet');
const unrated = controllerEvaluationSnapshot({
  state: unratedSimulation.state,
  metrics: unratedSimulation.shiftMetrics(),
  queues: unratedSimulation.queueSnapshot(),
  predictions: [],
  workloads: unratedSimulation.controllerWorkloads(),
  commands: [],
});
assert(unrated.commands.commandQualityScore === null && unrated.commands.commandQualityRating === 'not-rated', 'no-command session received a fabricated quality score');
assert(JSON.stringify(evaluate()) === JSON.stringify(evaluate()), 'controller evaluation is not deterministic');
assert(evaluation.methodology.safetyPriority.includes('never'), 'evaluation does not explain its non-compensatory safety rule');

console.log(JSON.stringify({
  schema: evaluation.schemaVersion,
  completed: evaluation.operations.completed,
  throughputPerHour: evaluation.operations.throughputPerHour,
  groundScore: ground.commandQualityScore,
  staleHoldSeconds: evaluation.holds.unnecessarySeconds,
  actors: evaluation.actors.length,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "controller-evaluation-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled)
  throw new Error("Controller-evaluation validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

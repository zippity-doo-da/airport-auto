import { build } from "esbuild";

const validationSource = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { currentTrainingStep, trainingCandidate, trainingLessons } from './src/simulation/trainingProgram.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const lessons = trainingLessons();
assert(lessons.length === 4, 'training school must ship four complete lessons');
assert(new Set(lessons.map((lesson) => lesson.id)).size === lessons.length, 'lesson IDs are not unique');
for (const lesson of lessons) {
  assert(lesson.steps.length >= 4, lesson.id + ' is not a complete multi-step lesson');
  assert(new Set(lesson.steps.map((step) => step.id)).size === lesson.steps.length, lesson.id + ' has duplicate step IDs');
  for (const step of lesson.steps) {
    assert(step.objective && step.why && step.hint && step.actions.length, lesson.id + '/' + step.id + ' lacks contextual coaching');
  }
}

const simulation = new AirportSimulation(generateHubConfig(0), 'quiet');
assert(simulation.startTrainingLesson('arrival-basics'), 'arrival lesson did not start');
assert(simulation.state.mode === 'manual', 'training did not enter manual control');
assert(simulation.state.scenario === 'training', 'training traffic pattern was not selected');
assert(simulation.state.trafficFlow.density === 'quiet', 'training did not select quiet demand');
assert(simulation.state.paused && simulation.state.training.status === 'coach-paused', 'lesson did not open at a deliberate pause');
assert(simulation.trainingSnapshot().step?.id === 'arrival-focus', 'wrong first training step');

const arrival = trainingCandidate(simulation.state, 'arrival');
assert(arrival, 'arrival lesson has no eligible arrival: ' + JSON.stringify(simulation.state.flights.map((flight) => ({ direction: flight.flightPlan.direction, phase: flight.phase }))));
simulation.observeTrainingCommand({ action: 'focusFlight', accepted: true, reason: 'accepted', flightId: arrival.id });
assert(simulation.state.training.targetFlightId === arrival.id, 'lesson did not lock its selected target');
assert(currentTrainingStep(simulation.state.training)?.id === 'arrival-station', 'focus did not advance the lesson');

simulation.setStation('approach');
simulation.observeTrainingCommand({ action: 'setStation', accepted: true, reason: 'accepted', station: 'approach' });
assert(currentTrainingStep(simulation.state.training)?.id === 'arrival-speed', 'station selection did not advance the lesson');
const checkpointElapsed = simulation.state.elapsed;
const checkpointProgress = simulation.state.flights.find((flight) => flight.id === arrival.id).progress;
assert(simulation.continueTraining(), 'lesson did not resume');
simulation.update(0.05);
simulation.observeTrainingCommand({ action: 'assignAirspeed', accepted: false, reason: 'frequency owner mismatch', flightId: arrival.id });
assert(simulation.state.training.status === 'coach-paused' && simulation.state.paused, 'rejected training command did not pause for coaching');
assert(simulation.state.training.mistakeCount === 1 && simulation.state.gameOver === false, 'no-fail rejection changed failure state');
assert(/frequency owner mismatch/.test(simulation.state.training.feedback ?? ''), 'rejection reason was not explained');

simulation.state.elapsed += 20;
simulation.state.flights.find((flight) => flight.id === arrival.id).progress = 0.99;
assert(simulation.retryTrainingStep(), 'training checkpoint could not be restored');
assert(simulation.state.elapsed === checkpointElapsed, 'retry did not restore authoritative simulation time');
assert(simulation.state.flights.find((flight) => flight.id === arrival.id).progress === checkpointProgress, 'retry did not restore authoritative aircraft position');
assert(simulation.state.training.recoveryCount === 1 && simulation.state.training.mistakeCount === 1, 'retry lost the learning audit counters');

assert(simulation.continueTraining(), 'restored lesson did not resume');
simulation.observeTrainingCommand({ action: 'assignAirspeed', accepted: true, reason: 'accepted', flightId: arrival.id });
assert(currentTrainingStep(simulation.state.training)?.id === 'arrival-approach', 'accepted target command did not advance after recovery');
assert(simulation.requestTrainingHint() && simulation.state.training.hintCount === 1, 'hint was not recorded');
simulation.observeTrainingCommand({ action: 'clearApproach', accepted: true, reason: 'accepted', flightId: arrival.id });
assert(simulation.state.training.status === 'complete' && simulation.state.paused, 'lesson completion was not explicit and paused');
assert(simulation.state.training.completedStepIds.length === 4, 'lesson did not record completed steps');
assert(simulation.continueTraining() && simulation.state.training.status === 'inactive' && !simulation.state.paused, 'complete lesson could not continue into the shift');

for (const lesson of lessons) {
  const fixture = new AirportSimulation(generateHubConfig(0), 'quiet');
  assert(fixture.startTrainingLesson(lesson.id), lesson.id + ' could not start');
  const snapshot = fixture.trainingSnapshot();
  assert(snapshot.lesson?.id === lesson.id && snapshot.step?.number === 1, lesson.id + ' snapshot is incomplete');
  assert(snapshot.availableLessons.length === lessons.length, lesson.id + ' snapshot omitted the lesson catalog');
  assert(fixture.skipTrainingStep(), lesson.id + ' first step could not be skipped');
  assert(fixture.state.training.skippedStepIds.length === 1 && fixture.state.gameOver === false, lesson.id + ' skip was not no-fail');
  assert(fixture.stopTrainingLesson(), lesson.id + ' could not be ended');
}

const surface = new AirportSimulation(generateHubConfig(0), 'quiet');
surface.startTrainingLesson('surface-flow');
assert(trainingCandidate(surface.state, 'departure-at-gate'), 'surface lesson has no push-ready departure fixture');

const tower = new AirportSimulation(generateHubConfig(0), 'quiet');
assert(tower.startTrainingLesson('tower-landing'), 'tower lesson did not start');
const towerArrival = trainingCandidate(tower.state, 'arrival');
assert(towerArrival, 'tower lesson has no arrival');
tower.observeTrainingCommand({ action: 'focusFlight', accepted: true, reason: 'accepted', flightId: towerArrival.id });
tower.setStation('supervisor');
tower.observeTrainingCommand({ action: 'setStation', accepted: true, reason: 'accepted', station: 'supervisor' });
assert(tower.continueTraining(), 'tower lesson did not resume');
assert(tower.offerHandoff(towerArrival.id, 'tower'), 'tower lesson handoff offer failed: ' + tower.lastCommandReason());
tower.observeTrainingCommand({ action: 'offerHandoff', accepted: true, reason: tower.lastCommandReason(), flightId: towerArrival.id, targetStation: 'tower' });
assert(tower.acceptHandoff(towerArrival.id), 'tower lesson handoff acceptance failed: ' + tower.lastCommandReason());
tower.observeTrainingCommand({ action: 'acceptHandoff', accepted: true, reason: tower.lastCommandReason(), flightId: towerArrival.id });
assert(tower.contactFlight(towerArrival.id, 'tower'), 'tower lesson contact failed: ' + tower.lastCommandReason());
tower.observeTrainingCommand({ action: 'contactStation', accepted: true, reason: tower.lastCommandReason(), flightId: towerArrival.id, targetStation: 'tower' });
tower.setStation('tower');
tower.observeTrainingCommand({ action: 'setStation', accepted: true, reason: 'accepted', station: 'tower' });
assert(tower.clearFlight(towerArrival.id, towerArrival.runway), 'tower lesson landing clearance failed: ' + tower.lastCommandReason());
tower.observeTrainingCommand({ action: 'clearFlight', accepted: true, reason: tower.lastCommandReason(), flightId: towerArrival.id });
assert(tower.state.training.status === 'complete', 'tower lesson did not complete its real command flow');

const handoff = new AirportSimulation(generateHubConfig(0), 'quiet');
assert(handoff.startTrainingLesson('handoff-workflow'), 'handoff lesson did not start');
const handoffArrival = trainingCandidate(handoff.state, 'arrival');
assert(handoffArrival, 'handoff lesson has no arrival');
handoff.observeTrainingCommand({ action: 'focusFlight', accepted: true, reason: 'accepted', flightId: handoffArrival.id });
handoff.setStation('supervisor');
handoff.observeTrainingCommand({ action: 'setStation', accepted: true, reason: 'accepted', station: 'supervisor' });
assert(handoff.continueTraining(), 'handoff lesson did not resume');
assert(handoff.offerHandoff(handoffArrival.id, 'tower'), 'handoff lesson offer failed: ' + handoff.lastCommandReason());
handoff.observeTrainingCommand({ action: 'offerHandoff', accepted: true, reason: handoff.lastCommandReason(), flightId: handoffArrival.id, targetStation: 'tower' });
assert(handoff.acceptHandoff(handoffArrival.id), 'handoff lesson acceptance failed: ' + handoff.lastCommandReason());
handoff.observeTrainingCommand({ action: 'acceptHandoff', accepted: true, reason: handoff.lastCommandReason(), flightId: handoffArrival.id });
assert(handoff.contactFlight(handoffArrival.id, 'tower'), 'handoff lesson contact failed: ' + handoff.lastCommandReason());
handoff.observeTrainingCommand({ action: 'contactStation', accepted: true, reason: handoff.lastCommandReason(), flightId: handoffArrival.id, targetStation: 'tower' });
assert(handoff.state.training.status === 'complete', 'handoff lesson did not complete its real command flow');

const surfaceFlow = new AirportSimulation(generateHubConfig(0), 'quiet');
assert(surfaceFlow.startTrainingLesson('surface-flow'), 'surface-flow lesson did not start');
const departure = trainingCandidate(surfaceFlow.state, 'departure-at-gate');
assert(departure, 'surface-flow lesson has no ready departure');
surfaceFlow.observeTrainingCommand({ action: 'focusFlight', accepted: true, reason: 'accepted', flightId: departure.id });
surfaceFlow.setStation('supervisor');
surfaceFlow.observeTrainingCommand({ action: 'setStation', accepted: true, reason: 'accepted', station: 'supervisor' });
assert(surfaceFlow.continueTraining(), 'surface-flow lesson did not resume');
assert(surfaceFlow.clearPushback(departure.id), 'surface-flow pushback failed: ' + surfaceFlow.lastCommandReason());
surfaceFlow.observeTrainingCommand({ action: 'clearPushback', accepted: true, reason: surfaceFlow.lastCommandReason(), flightId: departure.id });
for (let tick = 0; tick < 2_400 && departure.phase !== 'taxi-out'; tick += 1) surfaceFlow.update(0.05);
assert(departure.phase === 'taxi-out', 'surface-flow departure never entered taxi-out');
assert(surfaceFlow.assignTaxiRoute(departure.id), 'surface-flow taxi route failed: ' + surfaceFlow.lastCommandReason());
surfaceFlow.observeTrainingCommand({ action: 'assignTaxiRoute', accepted: true, reason: surfaceFlow.lastCommandReason(), flightId: departure.id });
assert(surfaceFlow.holdPosition(departure.id), 'surface-flow hold failed: ' + surfaceFlow.lastCommandReason());
surfaceFlow.observeTrainingCommand({ action: 'holdPosition', accepted: true, reason: surfaceFlow.lastCommandReason(), flightId: departure.id });
assert(surfaceFlow.resumeTaxi(departure.id), 'surface-flow resume failed: ' + surfaceFlow.lastCommandReason());
surfaceFlow.observeTrainingCommand({ action: 'resumeTaxi', accepted: true, reason: surfaceFlow.lastCommandReason(), flightId: departure.id });
assert(surfaceFlow.state.training.status === 'complete', 'surface-flow lesson did not complete its real command flow');

console.log(JSON.stringify({
  lessons: lessons.length,
  steps: lessons.reduce((sum, lesson) => sum + lesson.steps.length, 0),
  checkpointRecovery: true,
  noFail: true,
  contextualCoaching: true,
  realCommandFlows: 4,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "training-program-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Training-program validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

import { build } from 'esbuild';

const validationSource = `
import { createHubSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import { buildOperationQueueSnapshot, OPERATION_QUEUE_CATEGORIES } from './src/simulation/operationQueues.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cloneState(state) {
  return structuredClone(state);
}

function singleFlightState(base, mutate) {
  const state = cloneState(base);
  const flight = state.flights[0];
  state.flights = [flight];
  state.serviceVehicles = [];
  state.surfaceDisruptions = [];
  state.runwayConfigurationTransition = null;
  flight.controlHold = false;
  flight.automaticHold = false;
  flight.automaticHoldReason = undefined;
  flight.safetyHold = false;
  flight.safetyHoldReason = undefined;
  flight.crossingHoldRunway = undefined;
  flight.runwayEntryCleared = false;
  flight.takeoffCleared = false;
  flight.surfaceReroute = undefined;
  flight.emergency = undefined;
  flight.cleared = true;
  flight.goAround = undefined;
  flight.deicing.required = false;
  flight.deicing.status = 'not-required';
  flight.turnaround.status = 'released';
  mutate(flight, state);
  return { state, flight };
}

function onlyCategory(config, base, expected, mutate, inputs = {}) {
  const { state, flight } = singleFlightState(base, mutate);
  const snapshot = buildOperationQueueSnapshot(config, state, inputs);
  assert(snapshot.entries.length === 1, expected + ': expected one queue entry, got ' + snapshot.entries.length);
  assert(snapshot.entries[0].category === expected, expected + ': classified as ' + snapshot.entries[0].category);
  assert(snapshot.entries[0].flightId === flight.id, expected + ': queue entry lost flight identity');
  assert(snapshot.entries[0].detail.length > 8, expected + ': queue explanation is empty');
  return snapshot.entries[0];
}

const harness = createHubSimulationHarness('ORD', { stepSeconds: 0.1, mode: 'manual' });
const simulation = harness.simulation;
const config = harness.config;
const base = simulation.state;
const totals = { categories: 0, identityChecks: 0, orderingChecks: 0, systemChecks: 0, apiChecks: 0 };

for (const category of OPERATION_QUEUE_CATEGORIES) {
  assert(simulation.queueSnapshot().counts[category] >= 0, 'queue snapshot omitted ' + category + ' count');
  totals.categories += 1;
}

onlyCategory(config, base, 'gate', (flight) => {
  flight.phase = 'taxi-in';
  flight.automaticHold = true;
  flight.automaticHoldReason = 'Gate C18 still occupied by inbound traffic';
});
onlyCategory(config, base, 'ramp', (flight) => {
  flight.phase = 'taxi-out';
  flight.automaticHold = true;
  flight.automaticHoldReason = 'North Ramp ramp-control zone is at capacity';
});
onlyCategory(config, base, 'taxi', (flight) => {
  flight.phase = 'taxi-in';
  flight.surfaceReroute = { revision: 2, status: 'holding', selectedAtSeconds: 10, disruptionIds: ['SD-2'], previousEdgeIds: [], routeEdgeIds: [], addedDistanceM: 0, reason: 'Taxiway Alpha closure blocks every compatible pavement route' };
});
onlyCategory(config, base, 'crossing', (flight) => {
  flight.phase = 'taxi-out';
  flight.crossingHoldRunway = flight.runway;
});
onlyCategory(config, base, 'runway', (flight) => {
  flight.phase = 'takeoff';
  flight.runwayEntryCleared = true;
  flight.takeoffCleared = false;
});
onlyCategory(config, base, 'weather', (flight, state) => {
  flight.phase = 'taxi-out';
  flight.deicing.required = true;
  flight.deicing.status = 'queued';
  flight.deicing.queuePosition = 1;
  flight.deicing.queueEnteredSeconds = state.elapsed - 12;
  flight.deicing.reason = 'Waiting for winter treatment lane';
});
const turnaroundEntry = onlyCategory(config, base, 'downstream', (flight, state) => {
  flight.phase = 'resting';
  flight.turnaround.status = 'servicing';
  flight.turnaround.actualStartSeconds = state.elapsed - 9;
  flight.turnaround.tasks[0].required = true;
  flight.turnaround.tasks[0].status = 'active';
});
assert(turnaroundEntry.recovery?.includes('in progress'), 'turnaround queue has no actionable active-service recovery: ' + JSON.stringify(turnaroundEntry));
totals.identityChecks += 7;

{
  const { state, flight } = singleFlightState(base, (item) => {
    item.phase = 'approach';
    item.cleared = true;
  });
  const snapshot = buildOperationQueueSnapshot(config, state, { approachCapacity: 1, nextArrivalIn: 8 });
  const wake = snapshot.entries.find((entry) => entry.category === 'wake');
  assert(wake?.entity === 'system' && wake.blockerFlightIds.includes(flight.id), 'wake arrival meter lacks causal flights');
  totals.systemChecks += 1;
}

{
  const { state } = singleFlightState(base, (flight) => {
    flight.phase = 'approach';
    flight.cleared = true;
  });
  state.weather.weatherEnabled = true;
  state.weather.condition = 'rain';
  const snapshot = buildOperationQueueSnapshot(config, state, { approachCapacity: 1, nextArrivalIn: 8 });
  assert(snapshot.entries.some((entry) => entry.category === 'weather' && entry.entity === 'system'), 'weather meter did not explain reduced arrival capacity');
  totals.systemChecks += 1;
}

{
  const state = cloneState(base);
  state.serviceVehicles = [];
  state.surfaceDisruptions = [];
  state.runwayConfigurationTransition = null;
  const first = state.flights[0];
  const second = structuredClone(first);
  first.id = 801;
  first.callsign = 'QUEUE 801';
  second.id = 802;
  second.callsign = 'QUEUE 802';
  for (const flight of [first, second]) {
    flight.phase = 'takeoff';
    flight.runwayEntryCleared = true;
    flight.takeoffCleared = false;
    flight.controlHold = false;
    flight.automaticHold = false;
    flight.safetyHold = false;
    flight.emergency = undefined;
  }
  state.flights = [first, second];
  const snapshot = buildOperationQueueSnapshot(config, state, {
    stationarySeconds: new Map([[801, 21], [802, 7]]),
  });
  const runwayQueue = snapshot.entries.filter((entry) => entry.category === 'runway');
  assert(runwayQueue.length === 2, 'shared runway queue did not retain both aircraft');
  assert(runwayQueue[0].position === 1 && runwayQueue[0].queueLength === 2, 'longest waiting runway aircraft is not first');
  assert(runwayQueue[1].position === 2 && runwayQueue[1].queueLength === 2, 'second runway aircraft has incorrect queue position');
  assert(snapshot.longestWaitSeconds === 21, 'longest queue wait is incorrect');
  totals.orderingChecks += 4;
}

{
  const diagnostics = simulation.diagnostics();
  const direct = simulation.queueSnapshot();
  assert(JSON.stringify(diagnostics.queues) === JSON.stringify(direct), 'diagnostics and public queue snapshot diverged');
  assert(direct.generatedAtSeconds === Number(simulation.state.elapsed.toFixed(3)), 'queue snapshot clock is not authoritative');
  totals.apiChecks += 2;
}

console.log(JSON.stringify(totals));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'operation-queues-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Operation queue validation bundle was empty.');
try {
  await import('data:text/javascript;base64,' + Buffer.from(bundled).toString('base64'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

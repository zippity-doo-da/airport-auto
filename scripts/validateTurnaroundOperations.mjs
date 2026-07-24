import { build } from 'esbuild';

const validationSource = `
import { createHubSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import {
  advanceTurnaround,
  createTurnaroundPlan,
  startTurnaround,
  turnaroundBlockingServices,
  turnaroundFuelPercent,
} from './src/simulation/turnaroundOperations.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const allServices = ['fueling', 'baggage', 'cargo', 'catering', 'cleaning', 'boarding', 'maintenance'];
const passengerPlans = Array.from({ length: 24 }, (_, index) => createTurnaroundPlan({
  flightId: index + 1,
  airportSeed: 417,
  aircraft: index % 2 ? 'A320' : 'B789',
  service: 'passenger',
  fuelPercent: 42,
  scope: 'center',
  scheduledGateInSeconds: 100,
}));
const passenger = passengerPlans.find((plan) => plan.tasks.find((task) => task.type === 'catering')?.required);
assert(passenger, 'passenger plan sample never scheduled catering');
assert(passenger.tasks.map((task) => task.type).join(',') === allServices.join(','), 'turnaround plan does not expose all service states');
for (const required of ['fueling', 'baggage', 'catering', 'cleaning', 'boarding']) {
  assert(passenger.tasks.find((task) => task.type === required)?.required, 'passenger turn omitted required ' + required);
}
assert(!passenger.tasks.find((task) => task.type === 'cargo')?.required, 'passenger turn scheduled main-deck cargo handling');
const boarding = passenger.tasks.find((task) => task.type === 'boarding');
assert(boarding.dependencies.includes('cleaning') && boarding.dependencies.includes('catering'), 'boarding lacks cabin-service dependencies');
const cabinReadyOffset = Math.max(...boarding.dependencies.map((dependency) => {
  const task = passenger.tasks.find((candidate) => candidate.type === dependency);
  return task.scheduledStartOffsetSeconds + task.durationSeconds;
}));
assert(boarding.scheduledStartOffsetSeconds === cabinReadyOffset, 'boarding begins before cleaning/catering completes');

const startTransitions = startTurnaround(passenger, 200, 39);
assert(passenger.status === 'servicing', 'turnaround did not enter servicing state');
assert(startTransitions.some((transition) => transition.type === 'service-start' && transition.service === 'fueling'), 'fueling did not start at gate-in');
assert(boarding.status === 'waiting', 'boarding started before dependencies');
advanceTurnaround(passenger, 200 + boarding.scheduledStartOffsetSeconds - 0.1);
assert(boarding.status === 'waiting', 'boarding started early');
const boardingTransitions = advanceTurnaround(passenger, 200 + boarding.scheduledStartOffsetSeconds);
assert(boarding.status === 'active', 'boarding did not start when dependencies completed');
assert(boardingTransitions.some((transition) => transition.type === 'service-start' && transition.service === 'boarding'), 'boarding start transition missing');
const readyTransitions = advanceTurnaround(passenger, 200 + passenger.plannedDurationSeconds);
assert(passenger.status === 'ready' && turnaroundBlockingServices(passenger).length === 0, 'required tasks did not produce departure readiness');
assert(readyTransitions.some((transition) => transition.type === 'turnaround-ready'), 'turnaround-ready transition missing');
assert(Math.abs(turnaroundFuelPercent(passenger) - passenger.targetFuelPercent) < 0.001, 'fueling did not reach dispatch target');

const cargo = createTurnaroundPlan({
  flightId: 41,
  airportSeed: 417,
  aircraft: 'B77F',
  service: 'cargo',
  fuelPercent: 48,
  scope: 'center',
  scheduledGateInSeconds: 300,
});
assert(cargo.tasks.find((task) => task.type === 'cargo')?.required, 'freighter omitted cargo handling');
for (const excluded of ['baggage', 'catering', 'cleaning', 'boarding']) {
  assert(!cargo.tasks.find((task) => task.type === excluded)?.required, 'freighter scheduled passenger service ' + excluded);
}
const maintenancePlans = Array.from({ length: 30 }, (_, index) => createTurnaroundPlan({
  flightId: index + 1,
  airportSeed: 801,
  aircraft: 'B738',
  service: 'passenger',
  fuelPercent: 55,
  scope: 'center',
  scheduledGateInSeconds: 0,
}));
const maintenanceCount = maintenancePlans.filter((plan) => plan.tasks.find((task) => task.type === 'maintenance')?.required).length;
assert(maintenanceCount > 0 && maintenanceCount < maintenancePlans.length, 'maintenance is not an optional deterministic service');

const direct = createTurnaroundPlan({ flightId: 77, airportSeed: 912, aircraft: 'A359', service: 'passenger', fuelPercent: 45, scope: 'center', scheduledGateInSeconds: 0 });
const stepped = structuredClone(direct);
startTurnaround(direct, 500, 43);
startTurnaround(stepped, 500, 43);
advanceTurnaround(direct, 500 + direct.plannedDurationSeconds);
for (let elapsed = 0; elapsed <= stepped.plannedDurationSeconds + 0.05; elapsed += 0.05) advanceTurnaround(stepped, 500 + elapsed);
assert(JSON.stringify(direct) === JSON.stringify(stepped), 'turnaround state depends on update partitioning');

const harness = createHubSimulationHarness('ORD', { stepSeconds: 0.05, pace: 3 });
const arrival = harness.simulation.state.flights
  .filter((flight) => flight.phase === 'approach')
  .sort((first, second) => (first.gateAssignment?.scheduledGateInSeconds ?? Infinity) - (second.gateAssignment?.scheduledGateInSeconds ?? Infinity))[0];
assert(arrival, 'ORD startup has no arrival for turnaround integration');
assert(harness.runUntil((snapshot) => snapshot.flights.some((flight) => flight.id === arrival.id && flight.phase === 'resting'), 420), 'arrival never reached its stand');
harness.simulation.setMode('manual');
harness.simulation.setStation('ground');
let live = harness.simulation.state.flights.find((flight) => flight.id === arrival.id);
assert(live?.turnaround.status === 'servicing', 'gate arrival did not start service state machine');
assert(harness.simulation.state.serviceVehicles.some((vehicle) => vehicle.flightId === arrival.id), 'gate arrival did not dispatch service vehicles');
assert(!harness.simulation.clearPushback(arrival.id), 'manual pushback bypassed incomplete services');
assert(harness.simulation.lastCommandReason().includes('incomplete'), 'rejected pushback did not name blocking service state');
assert(harness.runUntil((snapshot) => snapshot.flights.some((flight) => flight.id === arrival.id && flight.turnaround.tasks.some((task) => task.status === 'active')), 180), 'vehicle-gated turnaround never started active service');
assert(harness.runUntil((snapshot) => snapshot.flights.some((flight) => flight.id === arrival.id && flight.turnaround.status === 'ready'), 360), 'turnaround never reached ready state');
live = harness.simulation.state.flights.find((flight) => flight.id === arrival.id);
assert(live && live.turnaround.tasks.every((task) => !task.required || task.status === 'complete'), 'ready aircraft retains incomplete required service');
assert(Math.abs(live.kinematics.fuelPercent - live.turnaround.targetFuelPercent) < 0.01, 'integrated aircraft fuel differs from completed fueling state');
assert(harness.runUntil(() => !harness.simulation.state.serviceVehicles.some((vehicle) => vehicle.flightId === arrival.id && ['approaching', 'servicing', 'clearing'].includes(vehicle.status)), 180), 'stand equipment did not clear for pushback');
assert(harness.simulation.clearPushback(arrival.id), 'ground could not clear pushback after all services completed');
harness.advanceTicks(1);
live = harness.simulation.state.flights.find((flight) => flight.id === arrival.id);
assert(live?.phase === 'taxi-out' && live.turnaround.status === 'released', 'pushback did not release completed turnaround state');
const snapshot = harness.snapshot();
const serviceStarts = snapshot.events.filter((event) => event.type === 'service-start' && event.flightId === arrival.id);
const serviceCompletions = snapshot.events.filter((event) => event.type === 'service-complete' && event.flightId === arrival.id);
assert(snapshot.events.some((event) => event.type === 'turnaround-start' && event.flightId === arrival.id), 'turnaround-start event missing');
assert(snapshot.events.some((event) => event.type === 'turnaround-ready' && event.flightId === arrival.id), 'turnaround-ready event missing');
assert(serviceStarts.length === serviceCompletions.length && serviceStarts.length > 0, 'service lifecycle events are incomplete');
assert(snapshot.diagnostics.collisionPairs.length === 0 && snapshot.diagnostics.obstacleCollisions.length === 0, 'turnaround integration breached protected envelopes');

console.log(JSON.stringify({
  services: allServices.length,
  passengerRequired: passenger.tasks.filter((task) => task.required).map((task) => task.type),
  cargoRequired: cargo.tasks.filter((task) => task.required).map((task) => task.type),
  maintenancePlans: maintenanceCount,
  passengerDurationSeconds: passenger.plannedDurationSeconds,
  cargoDurationSeconds: cargo.plannedDurationSeconds,
  serviceStarts: serviceStarts.length,
  serviceCompletions: serviceCompletions.length,
  fuelTargetPercent: live.turnaround.targetFuelPercent,
  partitionInvariant: true,
  pushbackGated: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'turnaround-operations-validation.ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});

const source = Buffer.from(result.outputFiles[0].contents).toString('base64');
try {
  await import('data:text/javascript;base64,' + source);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

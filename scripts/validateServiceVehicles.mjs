import { build } from 'esbuild';

const validationSource = `
import { createHubSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import { createServiceVehiclePlans, serviceVehicleOwnerId, serviceVehicleReservationClaims, serviceVehicleRouteViolations } from './src/simulation/serviceVehicleOperations.ts';
import { SurfaceReservationLedger, surfaceRouteReservationClaims } from './src/simulation/surfaceOperations.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const harness = createHubSimulationHarness('ORD', { stepSeconds: 0.05, pace: 3 });
const arrival = harness.simulation.state.flights
  .filter((flight) => flight.phase === 'approach')
  .sort((first, second) => (first.gateAssignment?.scheduledGateInSeconds ?? Infinity) - (second.gateAssignment?.scheduledGateInSeconds ?? Infinity))[0];
assert(arrival, 'ORD startup has no planned arrival');
const plans = createServiceVehiclePlans(harness.config, arrival, 100);
assert(plans.length >= 3, 'passenger turn did not plan a useful service fleet');
assert(new Set(plans.map((vehicle) => vehicle.service)).size === plans.length, 'service fleet contains duplicate task vehicles');
assert(new Set(plans.map((vehicle) => vehicle.depotNodeId)).size === plans.length, 'service fleet reused a live depot position');
assert(serviceVehicleRouteViolations(harness.config.surfaceGraph, plans).length === 0, 'planned service route enters a protected movement area');
assert(plans.every((vehicle) => !vehicle.protectedMovementAuthorized), 'service vehicle received implicit protected-area authority');
assert(plans.every((vehicle) => vehicle.outboundRoute.length && vehicle.returnRoute.length && vehicle.standPath.length >= 2), 'service vehicle is missing a complete route');

const routed = plans.find((vehicle) => vehicle.outboundRouteEdges.length);
assert(routed, 'service fleet did not receive a graph route');
routed.status = 'dispatching';
const vehicleClaims = serviceVehicleReservationClaims(harness.config.surfaceGraph, routed, 1);
assert(vehicleClaims.some((claim) => claim.kind === 'edge'), 'moving vehicle did not reserve its graph edge');
const ledger = new SurfaceReservationLedger();
ledger.reserve(serviceVehicleOwnerId(routed), vehicleClaims);
const aircraftClaims = surfaceRouteReservationClaims(
  harness.config.surfaceGraph,
  routed.outboundRoute,
  routed.outboundRouteEdges,
  routed.progress,
  'taxi-in',
  1,
);
assert(ledger.firstConflict(aircraftClaims, 999), 'aircraft was allowed to enter a service vehicle edge');

assert(harness.runUntil((snapshot) => snapshot.flights.some((flight) => flight.id === arrival.id && flight.phase === 'resting'), 420), 'arrival never reached its assigned stand: ' + JSON.stringify({
  arrival: harness.simulation.state.flights.find((flight) => flight.id === arrival.id),
  vehicles: harness.simulation.state.serviceVehicles.filter((vehicle) => vehicle.flightId === arrival.id),
}));
harness.simulation.setMode('manual');
harness.simulation.setStation('ramp');
let live = harness.simulation.state.flights.find((flight) => flight.id === arrival.id);
assert(live?.turnaround.status === 'servicing', 'gate-in did not start the vehicle-gated turnaround');
assert(harness.simulation.state.serviceVehicles.some((vehicle) => vehicle.flightId === arrival.id), 'gate-in did not dispatch service equipment');
assert(!harness.simulation.clearPushback(arrival.id), 'pushback bypassed service tasks and ramp equipment');

let maximumMoving = 0;
let maximumServicing = 0;
let observedVehicleGatedTask = false;
let conflicts = 0;
const conflictSamples = [];
let violations = 0;
const reachedReady = harness.runUntil(() => {
  const flight = harness.simulation.state.flights.find((candidate) => candidate.id === arrival.id);
  const vehicles = harness.simulation.state.serviceVehicles.filter((vehicle) => vehicle.flightId === arrival.id);
  maximumMoving = Math.max(maximumMoving, vehicles.filter((vehicle) => ['dispatching', 'approaching', 'clearing', 'returning'].includes(vehicle.status)).length);
  maximumServicing = Math.max(maximumServicing, vehicles.filter((vehicle) => vehicle.status === 'servicing').length);
  for (const task of flight?.turnaround.tasks ?? []) {
    const vehicle = vehicles.find((candidate) => candidate.service === task.type);
    if (!vehicle || task.status !== 'active') continue;
    observedVehicleGatedTask = true;
    assert(['servicing', 'clearing', 'returning', 'complete'].includes(vehicle.status), task.type + ' started before its vehicle arrived');
  }
  const diagnostics = harness.simulation.diagnostics();
  conflicts += diagnostics.serviceVehicleConflicts.length;
  if (diagnostics.serviceVehicleConflicts.length && conflictSamples.length < 8) {
    const conflict = diagnostics.serviceVehicleConflicts[0];
    const conflictIds = new Set([conflict.vehicle, conflict.otherVehicle].filter(Boolean));
    conflictSamples.push({
      conflict,
      vehicles: harness.simulation.state.serviceVehicles.filter((vehicle) => conflictIds.has(vehicle.id)).map((vehicle) => ({
        id: vehicle.id,
        service: vehicle.service,
        standSide: vehicle.standSide,
        status: vehicle.status,
        progress: vehicle.progress,
        edge: vehicle.currentEdge,
        node: vehicle.currentNode,
        held: vehicle.held,
        x: vehicle.x,
        y: vehicle.y,
        standPath: vehicle.standPath,
      })),
    });
  }
  violations += diagnostics.serviceVehicleRouteViolations.length;
  assert(vehicles.every((vehicle) => !vehicle.protectedMovementArea), 'live service vehicle entered a protected movement area');
  return flight?.turnaround.status === 'ready';
}, 360);
assert(reachedReady, 'vehicle-gated turnaround never became ready');
assert(observedVehicleGatedTask, 'no task was observed waiting for and using its vehicle');
assert(maximumMoving >= 2, 'service fleet never moved concurrently');
assert(maximumServicing >= 2, 'independent services never operated concurrently: ' + JSON.stringify({
  maximumMoving,
  maximumServicing,
  elapsed: harness.simulation.state.elapsed,
  tasks: harness.simulation.state.flights.find((flight) => flight.id === arrival.id)?.turnaround.tasks,
  vehicles: harness.simulation.state.serviceVehicles.filter((vehicle) => vehicle.flightId === arrival.id).map((vehicle) => ({
    id: vehicle.id,
    service: vehicle.service,
    status: vehicle.status,
    progress: vehicle.progress,
    held: vehicle.held,
    holdReason: vehicle.holdReason,
  })),
}));
assert(conflicts === 0, 'service vehicle separation diagnostics reported ' + conflicts + ' conflicts: ' + JSON.stringify(conflictSamples));
assert(violations === 0, 'service vehicle route diagnostics reported ' + violations + ' protected-area entries');
const readyVehicles = harness.simulation.state.serviceVehicles.filter((vehicle) => vehicle.flightId === arrival.id);
const liveBlocker = readyVehicles.find((vehicle) => ['approaching', 'servicing', 'clearing'].includes(vehicle.status));
if (liveBlocker) {
  assert(!harness.simulation.clearPushback(arrival.id), 'pushback was accepted before stand equipment cleared');
} else {
  const probe = readyVehicles[0];
  assert(probe, 'ready turnaround lost its service fleet');
  const priorStatus = probe.status;
  probe.status = 'clearing';
  assert(!harness.simulation.clearPushback(arrival.id), 'pushback gate ignored a vehicle in the stand lane');
  probe.status = priorStatus;
}
assert(harness.runUntil(() => {
  const blockers = harness.simulation.state.serviceVehicles.filter((vehicle) => vehicle.flightId === arrival.id && ['approaching', 'servicing', 'clearing'].includes(vehicle.status));
  return blockers.length === 0;
}, 180), 'service vehicles never cleared the stand lane');
assert(harness.simulation.clearPushback(arrival.id), 'Ramp could not clear pushback after the stand was physically clear');

const snapshot = harness.snapshot();
const vehicleEvents = snapshot.events.filter((event) => event.serviceVehicleId);
const lifecycleEventCounts = Object.fromEntries([...new Set(vehicleEvents.map((event) => event.type))].sort().map((type) => [type, vehicleEvents.filter((event) => event.type === type).length]));
for (const type of ['service-vehicle-dispatch', 'service-vehicle-arrive', 'service-vehicle-return', 'service-vehicle-clear']) {
  assert(vehicleEvents.some((event) => event.type === type && event.flightId === arrival.id), 'missing ' + type + ' lifecycle event');
}

console.log(JSON.stringify({
  plannedVehicles: plans.length,
  vehicleTypes: [...new Set(plans.map((vehicle) => vehicle.type))],
  maximumMoving,
  maximumServicing,
  protectedRouteViolations: violations,
  separationConflicts: conflicts,
  lifecycleEvents: vehicleEvents.length,
  lifecycleEventCounts,
  sharedLedgerConflict: true,
  pushbackStandClearance: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'service-vehicle-validation.ts',
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

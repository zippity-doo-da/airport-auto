import { build } from "esbuild";

const validationSource = `
import { createHubSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import { deicingFacilities, winterDeicingRequired } from './src/simulation/deicingOperations.ts';
import { syncFlightMotion } from './src/simulation/flightMotion.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function advanceUntil(predicate, timeoutWallSeconds, sample) {
  const maximumTicks = Math.ceil(timeoutWallSeconds / harness.stepSeconds);
  for (let index = 0; index < maximumTicks; index += 1) {
    harness.advanceTicks(1);
    if (index % 20 === 0) sample?.();
    if (predicate()) return true;
  }
  return false;
}

const harness = createHubSimulationHarness('ORD', { stepSeconds: 0.1, pace: 3, mode: 'auto' });
const simulation = harness.simulation;
const facilities = deicingFacilities(harness.config.surfaceGraph);
assert(facilities.length >= 1, 'ORD has no routable deicing facility');
assert(facilities.some((facility) => facility.classification === 'published'), 'ORD deicing facility lost its published source classification');
assert(facilities.every((facility) => facility.capacity >= 1 && facility.lanes.length === facility.capacity), 'deicing facility has invalid lane capacity');

simulation.setWeather('snow', Math.PI, 12);
assert(winterDeicingRequired(simulation.state.weather), 'snow did not activate the deicing requirement');
assert(simulation.state.weather.surfaceCondition === 'contaminated', 'snow did not contaminate the movement surface');
assert(simulation.state.weather.temperatureC < 0, 'snow did not produce winter temperature');

const departure = simulation.state.flights.find((flight) => flight.phase === 'resting');
assert(departure, 'ORD startup has no stand departure for deicing validation');
assert(departure.deicing.required && departure.deicing.status === 'planned', 'resting departure did not receive a deicing plan');
assert(departure.deicing.facilityId && departure.deicing.laneId, 'deicing plan is missing a facility or lane');

let observedQueue = false;
let maximumQueuePosition = 0;
let collisionSamples = 0;
const reachedTreatment = advanceUntil(() => {
  const flight = simulation.state.flights.find((candidate) => candidate.id === departure.id);
  if (flight) maximumQueuePosition = Math.max(maximumQueuePosition, flight.deicing.queuePosition);
  return flight?.deicing.status === 'treating';
}, 600, () => {
  const flight = simulation.state.flights.find((candidate) => candidate.id === departure.id);
  if (flight) maximumQueuePosition = Math.max(maximumQueuePosition, flight.deicing.queuePosition);
  const diagnostics = simulation.diagnostics();
  collisionSamples += diagnostics.collisions.length + diagnostics.obstacleCollisions.length;
});
observedQueue = harness.snapshot().events.some((event) => event.flightId === departure.id && event.type === 'deicing-queue');
const treatmentFailure = simulation.state.flights.find((candidate) => candidate.id === departure.id);
assert(reachedTreatment, 'departure never reached deicing treatment: ' + JSON.stringify(treatmentFailure ? {
  phase: treatmentFailure.phase,
  progress: treatmentFailure.progress,
  deicing: treatmentFailure.deicing,
  turnaround: treatmentFailure.turnaround,
  gateAssignment: treatmentFailure.gateAssignment,
  automaticHold: treatmentFailure.automaticHold,
  automaticHoldReason: treatmentFailure.automaticHoldReason,
  safetyHold: treatmentFailure.safetyHold,
  safetyHoldReason: treatmentFailure.safetyHoldReason,
  crossingHoldRunway: treatmentFailure.crossingHoldRunway,
  surfaceNode: treatmentFailure.surfaceNode,
  surfaceEdge: treatmentFailure.surfaceEdge,
  routeNodes: treatmentFailure.surfaceRoute?.length,
  standVehicles: simulation.state.serviceVehicles
    .filter((vehicle) => vehicle.standId === treatmentFailure.standId)
    .map((vehicle) => ({
      id: vehicle.id,
      status: vehicle.status,
      progress: vehicle.progress,
      held: vehicle.held,
      holdReason: vehicle.holdReason,
      currentNode: vehicle.currentNode,
      currentEdge: vehicle.currentEdge,
      x: vehicle.x,
      y: vehicle.y,
    })),
  nearbyTraffic: simulation.state.flights.map((flight) => ({
    id: flight.id,
    phase: flight.phase,
    progress: flight.progress,
    motion: flight.motion,
    automaticHold: flight.automaticHoldReason,
    safetyHold: flight.safetyHoldReason,
    surfaceNode: flight.surfaceNode,
    surfaceEdge: flight.surfaceEdge,
    rampControlZoneId: flight.rampControlZoneId,
    surfaceAlleyId: flight.surfaceAlleyId,
    standId: flight.standId,
    gateZoneId: flight.gateAssignment?.zoneId,
    routeWindow: (() => {
      const edgeIndex = flight.surfaceRouteEdges?.indexOf(flight.surfaceEdge);
      return edgeIndex === undefined || edgeIndex < 0 ? undefined : {
        edgeIndex,
        edges: flight.surfaceRouteEdges?.slice(Math.max(0, edgeIndex - 2), edgeIndex + 4),
        nodes: flight.surfaceRoute?.slice(Math.max(0, edgeIndex - 2), edgeIndex + 5),
      };
    })(),
    deicing: flight.deicing.status,
  })),
  elapsed: simulation.state.elapsed,
} : { missing: true, elapsed: simulation.state.elapsed }));
let live = simulation.state.flights.find((flight) => flight.id === departure.id);
assert(live, 'departure disappeared before deicing treatment');
assert(observedQueue, 'departure entered treatment without the explicit queue lifecycle');
assert(maximumQueuePosition >= 1, 'departure queue position was never observable in authoritative state');
assert(live.phase === 'taxi-out', 'deicing did not remain an authoritative taxi-out substate');
assert(Math.abs(live.progress - live.deicing.treatmentProgress) < 0.001, 'aircraft did not stop at its authoritative treatment position');
assert(live.kinematics.groundSpeedKts === 0, 'aircraft moved while treatment was active');
assert(live.surfaceRoute?.includes(facilities.flatMap((facility) => facility.lanes).find((lane) => lane.id === live.deicing.laneId)?.nodeId ?? ''), 'winter route does not pass through the assigned treatment lane');

const firstCycle = live.deicing.cycle;
const reachedProtection = advanceUntil(() => {
  const flight = simulation.state.flights.find((candidate) => candidate.id === departure.id);
  return flight?.deicing.status === 'protected';
}, 120);
assert(reachedProtection, 'deicing treatment never completed');
live = simulation.state.flights.find((flight) => flight.id === departure.id);
assert(live?.deicing.holdoverExpiresSeconds > simulation.state.elapsed, 'completed treatment has no future holdover expiry');
assert(live?.deicing.holdoverRemainingSeconds > 0, 'completed treatment has no holdover clock');

const originalHoldShortNode = live?.surfaceRoute?.at(-1);
assert(live && originalHoldShortNode, 'treated departure lost its runway hold-short route');
live.progress = 1;
live.phaseElapsed = live.duration;
live.kinematics.groundSpeedKts = 0;
live.deicing.status = 'expired';
live.deicing.holdoverRemainingSeconds = 0;
live.deicing.holdoverExpiresSeconds = simulation.state.elapsed - 1;
syncFlightMotion(harness.config, live);
assert(!simulation.clearRunwayEntry(live.id), 'tower accepted runway entry after holdover expiry');
assert(simulation.lastCommandReason().includes('expired'), 'expired holdover rejection was not explainable');
harness.advanceTicks(1);
live = simulation.state.flights.find((flight) => flight.id === departure.id);
assert(live?.deicing.cycle === firstCycle + 1, 'expired holdover did not create a second treatment cycle');
assert(live?.deicing.status === 'enroute', 'expired departure did not enter the return-to-pad route');
assert(live?.progress === 0, 'return-to-pad route did not restart at the current hold-short node');
assert(live?.surfaceRoute?.[0] === originalHoldShortNode, 'return route teleported away from the runway hold-short node');
assert(live?.surfaceRoute?.at(-1) === originalHoldShortNode, 'return route does not lead back to the original runway hold-short point');
assert(harness.snapshot().events.some((event) => event.flightId === departure.id && event.type === 'deicing-return'), 'return-to-pad event is missing');

assert(collisionSamples === 0, 'winter taxi/deicing lifecycle produced a collision or obstacle overlap');
const finalDiagnostics = simulation.diagnostics();
assert(finalDiagnostics.collisions.length === 0, 'aircraft collision present after deicing return route');
assert(finalDiagnostics.obstacleCollisions.length === 0, 'obstacle collision present after deicing return route');
assert(finalDiagnostics.deicing.facilities.length === facilities.length, 'diagnostics lost deicing facility metadata');

console.log(JSON.stringify({
  facilities: facilities.map((facility) => ({ id: facility.id, capacity: facility.capacity, lanes: facility.lanes.length })),
  flightId: departure.id,
  firstCycle,
  returnCycle: live.deicing.cycle,
  observedQueue,
  maximumQueuePosition,
  treatmentSeconds: live.deicing.treatmentDurationSeconds,
  holdoverSeconds: live.deicing.holdoverSeconds,
  runwayEntryBlockedAfterExpiry: true,
  returnRouteNodes: live.surfaceRoute.length,
  collisionSamples,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "deicing-validation.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});

const source = Buffer.from(result.outputFiles[0].contents).toString("base64");
try {
  await import("data:text/javascript;base64," + source);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

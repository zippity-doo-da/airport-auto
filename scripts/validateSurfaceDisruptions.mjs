import { build } from 'esbuild';

const validationSource = `
import { aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import { createHubSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import { findSurfaceRoute, sampleSurfaceRouteWithEdges } from './src/simulation/surfaceGraph.ts';
import {
  resolveSurfaceDisruptionTarget,
  runwayClosedByDisruption,
  surfaceDisruptionBlockedEdgeIds,
  surfaceDisruptionPosition,
} from './src/simulation/surfaceDisruptions.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function advanceUntil(harness, predicate, timeoutSeconds) {
  const ticks = Math.ceil(timeoutSeconds / harness.stepSeconds);
  for (let index = 0; index < ticks; index += 1) {
    harness.advanceTicks(1);
    if (predicate()) return true;
  }
  return false;
}

function activeTaxiFlight(simulation) {
  return simulation.state.flights.find((flight) => (
    (flight.phase === 'taxi-in' || flight.phase === 'taxi-out')
    && flight.surfaceRouteEdges.length >= 5
    && flight.progress > 0.01
    && flight.progress < 0.82
  ));
}

function vehicleRouteEdges(simulation) {
  return new Set(simulation.state.serviceVehicles.flatMap((vehicle) => [
    ...vehicle.outboundRouteEdges,
    ...vehicle.returnRouteEdges,
  ]));
}

function alternateConstructionEdge(config, simulation, flight, expectAlternate) {
  const sample = sampleSurfaceRouteWithEdges(config.surfaceGraph, flight.surfaceRoute, flight.surfaceRouteEdges, flight.progress);
  if (!sample) return null;
  const profile = aircraftProfile(flight.aircraft);
  const vehicleEdges = vehicleRouteEdges(simulation);
  const destination = flight.surfaceRoute.at(-1);
  const currentEdge = flight.surfaceRouteEdges[sample.edgeIndex];
  for (const edgeId of flight.surfaceRouteEdges.slice(sample.edgeIndex + 2)) {
    const edge = config.surfaceGraph.edges.find((candidate) => candidate.id === edgeId);
    if (!edge || !['taxiway', 'apron', 'stand-lead-in'].includes(edge.kind) || vehicleEdges.has(edge.id)) continue;
    const alternate = findSurfaceRoute(
      config.surfaceGraph,
      sample.toNodeId,
      destination,
      { wingspanM: profile.wingspanM, minimumWingtipClearanceM: profile.minimumWingtipClearanceM },
      { blockedEdgeIds: new Set([currentEdge, edge.id]) },
    );
    if (Boolean(alternate) === expectAlternate && (!alternate || !alternate.edgeIds.includes(edge.id))) return edge;
  }
  return null;
}

const totals = {
  targetChecks: 0,
  authorityChecks: 0,
  reroutes: 0,
  continuityChecks: 0,
  timedReopenings: 0,
  runwayClosures: 0,
  recoveries: 0,
  collisionSamples: 0,
};

const harness = createHubSimulationHarness('ORD', { stepSeconds: 0.1, pace: 2, mode: 'auto' });
const simulation = harness.simulation;
const config = harness.config;

const taxiway = config.surfaceGraph.taxiways.find((candidate) => candidate.edgeIds.length >= 2);
assert(taxiway, 'ORD has no named taxiway suitable for closure resolution');
const taxiTarget = resolveSurfaceDisruptionTarget(config, 'taxiway-closure', taxiway.id);
assert(taxiTarget && taxiTarget.edgeIds.length === taxiway.edgeIds.length, 'taxiway closure did not resolve to its graph edges');
const constructionTarget = resolveSurfaceDisruptionTarget(config, 'construction', taxiway.edgeIds[0]);
assert(constructionTarget?.edgeIds[0] === taxiway.edgeIds[0], 'construction zone did not resolve to a graph edge');
const synthetic = [{
  id: 'test', kind: 'construction', status: 'active', source: 'controller', targetId: constructionTarget.targetId,
  label: constructionTarget.label, edgeIds: [...constructionTarget.edgeIds], createdAtSeconds: 0,
  activatedAtSeconds: 0, recoveryProgress: 0, reroutedFlightIds: [], reason: 'test',
}];
assert(surfaceDisruptionBlockedEdgeIds(synthetic).has(taxiway.edgeIds[0]), 'active construction was not a routing exclusion');
assert(surfaceDisruptionPosition(config.surfaceGraph, synthetic[0]), 'surface disruption has no map position');
totals.targetChecks += 4;

simulation.setStation('ground');
assert(!simulation.setSurfaceDisruption('construction', taxiway.edgeIds[0], true, 60), 'Ground station changed airport surface availability');
assert(simulation.lastCommandReason().includes('cannot change'), 'authority rejection was not explainable');
simulation.setStation('supervisor');
totals.authorityChecks += 2;

assert(advanceUntil(harness, () => Boolean(activeTaxiFlight(simulation)), 480), 'ORD produced no routable surface flight');
let flight = activeTaxiFlight(simulation);
assert(flight, 'surface flight disappeared before reroute test');
const alternateEdge = alternateConstructionEdge(config, simulation, flight, true);
assert(alternateEdge, 'ORD surface route had no deterministic alternate edge for construction validation');
const before = { x: flight.motion.x, y: flight.motion.y, edge: flight.surfaceEdge };
assert(simulation.setSurfaceDisruption('construction', alternateEdge.id, true, 20), 'construction restriction was rejected: ' + simulation.lastCommandReason());
flight = simulation.state.flights.find((candidate) => candidate.id === flight.id);
assert(flight?.surfaceReroute?.status === 'rerouted', 'affected aircraft did not receive an amended route');
assert(!flight.surfaceRouteEdges.includes(alternateEdge.id), 'amended route still uses the closed edge');
assert(Math.hypot(flight.motion.x - before.x, flight.motion.y - before.y) < 0.001, 'reroute teleported the aircraft');
assert(flight.surfaceEdge === before.edge, 'reroute abandoned the currently occupied edge');
const disruption = simulation.state.surfaceDisruptions.find((candidate) => candidate.targetId === alternateEdge.id);
assert(disruption?.reroutedFlightIds.includes(flight.id), 'restriction did not record its affected flight');
totals.reroutes += 1;
totals.continuityChecks += 2;

for (let index = 0; index < 230; index += 1) {
  harness.advanceTicks(1);
  const diagnostics = simulation.diagnostics();
  totals.collisionSamples += 1;
  assert(diagnostics.collisions.length === 0, 'construction reroute produced an aircraft collision');
  assert(diagnostics.obstacleCollisions.length === 0, 'construction reroute produced an obstacle overlap');
}
assert(!simulation.state.surfaceDisruptions.some((candidate) => candidate.id === disruption.id), 'timed construction did not reopen after inspection');
totals.timedReopenings += 1;

const runwayHarness = createHubSimulationHarness('ORD', { stepSeconds: 0.1, mode: 'auto' });
const runwaySimulation = runwayHarness.simulation;
runwaySimulation.setStation('supervisor');
const arrivalRunways = runwayHarness.config.runways.filter((runway) => runway.role === 'arrival' || runway.role === 'mixed');
let closedRunway = null;
for (const runway of arrivalRunways) {
  if (runwaySimulation.setSurfaceDisruption('runway-closure', String(runway.id), true, 60)) {
    closedRunway = runway;
    break;
  }
}
assert(closedRunway, 'ORD could not retain capacity while closing one arrival runway');
assert(runwayClosedByDisruption(runwaySimulation.state.surfaceDisruptions, closedRunway.id), 'runway closure did not enter authoritative state');
assert(runwaySimulation.state.flights.every((candidate) => candidate.phase !== 'approach' || candidate.runway !== closedRunway.id), 'arrival remained assigned to a closed runway');
const runwayRestriction = runwaySimulation.state.surfaceDisruptions.find((candidate) => candidate.runwayId === closedRunway.id);
assert(runwayRestriction?.edgeIds.every((edgeId) => surfaceDisruptionBlockedEdgeIds(runwaySimulation.state.surfaceDisruptions).has(edgeId)), 'closed runway pavement remained routable');
totals.runwayClosures += 1;

const recoveryHarness = createHubSimulationHarness('ORD', { stepSeconds: 0.1, pace: 2, mode: 'auto' });
const recoverySimulation = recoveryHarness.simulation;
assert(advanceUntil(recoveryHarness, () => Boolean(activeTaxiFlight(recoverySimulation)), 480), 'ORD produced no taxi flight for recovery validation');
const disabled = activeTaxiFlight(recoverySimulation);
assert(disabled, 'taxi flight disappeared before disabled-aircraft test');
recoverySimulation.setMode('manual');
recoverySimulation.setStation('ground');
assert(recoverySimulation.triggerEmergency(disabled.id, 'disabled'), 'surface disable command was rejected: ' + recoverySimulation.lastCommandReason());
const disabledRestriction = recoverySimulation.state.surfaceDisruptions.find((candidate) => candidate.flightId === disabled.id);
assert(disabledRestriction?.status === 'active', 'disabled aircraft did not protect its occupied pavement');
assert(recoverySimulation.recoverDisabledAircraft(disabled.id), 'Ground could not dispatch disabled-aircraft recovery');
assert(disabledRestriction.status === 'recovering', 'recovery dispatch did not enter recovering state');
recoverySimulation.setMode('auto');
assert(advanceUntil(recoveryHarness, () => !recoverySimulation.state.flights.some((candidate) => candidate.id === disabled.id), 150), 'disabled aircraft was not towed clear');
assert(!recoverySimulation.state.surfaceDisruptions.some((candidate) => candidate.flightId === disabled.id), 'recovered aircraft left pavement closed');
assert(recoveryHarness.snapshot().events.some((event) => event.type === 'recovery-start' && event.flightId === disabled.id), 'recovery-start event is missing');
assert(recoveryHarness.snapshot().events.some((event) => event.type === 'recovery-complete' && event.flightId === disabled.id), 'recovery-complete event is missing');
assert(recoverySimulation.diagnostics().collisions.length === 0, 'disabled-aircraft recovery produced a collision');
totals.recoveries += 1;

console.log(JSON.stringify(totals));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'surface-disruptions-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Surface disruption validation bundle was empty.');
try {
  await import('data:text/javascript;base64,' + Buffer.from(bundled).toString('base64'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

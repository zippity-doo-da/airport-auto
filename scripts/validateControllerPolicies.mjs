import { build } from 'esbuild';

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { controllerPolicyPresetCatalog } from './src/simulation/controllerPolicies.ts';
import { CONTROLLER_STATIONS } from './src/simulation/controllerOperations.ts';
import { planScriptedControllerActions, refreshScriptedControllerModes } from './src/simulation/scriptedControllers.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD');
const config = generateHubConfig(ordIndex);
const catalog = controllerPolicyPresetCatalog();
const expectedIds = ['balanced', 'conservative', 'efficient', 'calm', 'teaching', 'realistic'];
assert(catalog.length === expectedIds.length, 'controller policy catalog does not contain six presets');
assert(new Set(catalog.map((preset) => preset.id)).size === catalog.length, 'controller policy IDs are not unique');
assert(expectedIds.every((id) => catalog.some((preset) => preset.id === id)), 'controller policy catalog is incomplete');
for (const preset of catalog) {
  assert(CONTROLLER_STATIONS.every((station) => preset.stations[station]), preset.id + ' omits a controller station');
  for (const station of CONTROLLER_STATIONS) {
    const policy = preset.stations[station];
    assert(policy.trackLimit > 0 && policy.maxActionsPerEvaluation > 0, preset.id + ' has an invalid workload limit');
    assert(policy.handoffAcceptSeconds >= 0 && policy.handoffContactSeconds >= 0, preset.id + ' has invalid handoff timing');
  }
}

const authority = new AirportSimulation(config, 'quiet');
authority.setStation('tower');
assert(!authority.setControllerPolicyPreset('calm'), 'Tower changed an airport-wide controller policy');
authority.setStation('supervisor');
assert(!authority.setControllerPolicyPreset('unknown'), 'invalid controller policy was accepted');
assert(authority.setControllerPolicyPreset('calm'), 'Supervisor could not select Calm policy');
assert(authority.state.scriptedControllers.presetId === 'calm', 'selected controller policy was not stored');
authority.reset();
assert(authority.state.scriptedControllers.presetId === 'calm', 'session reset did not preserve controller policy');

function routineFixture(presetId) {
  const simulation = new AirportSimulation(config, 'quiet');
  assert(simulation.setControllerPolicyPreset(presetId), 'could not select ' + presetId);
  simulation.setMode('auto');
  const seed = simulation.state.flights.find((flight) => flight.phase === 'approach');
  assert(seed, 'policy validation requires an arrival seed');
  simulation.state.flights = Array.from({ length: 5 }, (_, index) => {
    const flight = structuredClone(seed);
    flight.id = 50_000 + index;
    flight.callsign = 'POLICY ' + (index + 1);
    flight.phase = 'approach';
    flight.progress = 0.2;
    flight.duration = 1_000_000;
    flight.phaseElapsed = 0;
    flight.clearanceLeft = 1_000_000;
    flight.cleared = false;
    flight.navigation.frequencyOwner = 'approach';
    flight.navigation.approachCleared = false;
    flight.navigation.handoff = undefined;
    flight.navigation.handoffStatus = 'owned';
    flight.navigation.hold = undefined;
    flight.goAround = undefined;
    flight.diversion = undefined;
    flight.safetyHold = false;
    return flight;
  });
  refreshScriptedControllerModes(simulation.state, simulation.state.scriptedControllers, 'policy test fixture');
  return simulation;
}

const teachingRoutine = routineFixture('teaching');
const teachingActions = planScriptedControllerActions(config, teachingRoutine.state, 'approach', teachingRoutine.state.scriptedControllers);
assert(teachingActions.filter((action) => action.priority === 'routine' || action.priority === 'sequence').length === 1, 'Teaching exceeded its one-action routine budget');
assert(teachingRoutine.state.scriptedControllers.stations.approach.workload.queuedActions === 4, 'Teaching did not expose queued routine work');

const efficientRoutine = routineFixture('efficient');
const efficientActions = planScriptedControllerActions(config, efficientRoutine.state, 'approach', efficientRoutine.state.scriptedControllers);
assert(efficientActions.filter((action) => action.priority === 'routine' || action.priority === 'sequence').length === 3, 'Efficient did not apply its three-action routine budget');

const safetyBypass = routineFixture('teaching');
for (const flight of safetyBypass.state.flights.slice(0, 3)) {
  flight.progress = 0.82;
  flight.safetyHold = true;
  flight.safetyHoldReason = 'policy validation conflict';
}
const safetyActions = planScriptedControllerActions(config, safetyBypass.state, 'supervisor', safetyBypass.state.scriptedControllers);
assert(safetyActions.filter((action) => action.priority === 'safety').length === 3, 'safety work was limited by routine controller pacing');

const capacity = routineFixture('teaching');
const approachLimit = capacity.state.scriptedControllers.stations.approach.policy.trackLimit;
const seed = capacity.state.flights[0];
capacity.state.flights = Array.from({ length: approachLimit }, (_, index) => {
  const flight = structuredClone(seed);
  flight.id = 60_000 + index;
  flight.callsign = 'OWNED ' + (index + 1);
  return flight;
});
const offered = structuredClone(seed);
offered.id = 61_000;
offered.callsign = 'OFFERED 1';
offered.navigation.frequencyOwner = 'tower';
offered.navigation.handoffStatus = 'offered';
offered.navigation.handoff = {
  schemaVersion: 1,
  revision: 1,
  from: 'tower',
  to: 'approach',
  status: 'offered',
  offeredAtSeconds: 0,
  responseDueSeconds: 12,
  offeredBy: 'tower',
  reason: 'policy validation capacity offer',
};
capacity.state.flights.push(offered);
capacity.state.elapsed = 2;
capacity.state.scriptedControllers.nextEvaluationAtSeconds = 2;
refreshScriptedControllerModes(capacity.state, capacity.state.scriptedControllers, 'capacity fixture');
let capacityActions = planScriptedControllerActions(config, capacity.state, 'approach', capacity.state.scriptedControllers);
assert(capacityActions.some((action) => action.action === 'defer-handoff'), 'at-capacity receiving desk did not defer a non-urgent handoff');
capacity.update(0.05);
const deferral = capacity.state.scriptedControllers.decisions.find((decision) => decision.action === 'defer-handoff' && decision.flightId === offered.id);
assert(deferral?.disposition === 'deferred' && !deferral.accepted, 'capacity deferral was not recorded as a distinct non-rejection outcome');
assert(deferral.producedEventTypes.length === 0 && offered.navigation.handoff?.status === 'offered', 'capacity deferral mutated the coordinated flight or fabricated an operational event');
assert(capacity.state.scriptedControllers.stations.approach.deferred > 0, 'receiving desk did not count deferred work');
offered.navigation.handoff.status = 'overdue';
refreshScriptedControllerModes(capacity.state, capacity.state.scriptedControllers, 'overdue fixture');
capacityActions = planScriptedControllerActions(config, capacity.state, 'approach', capacity.state.scriptedControllers);
assert(capacityActions.some((action) => action.action === 'accept-handoff' && action.priority === 'urgent'), 'overdue handoff did not bypass capacity deferral');

const takeover = new AirportSimulation(config, 'quiet');
assert(takeover.setControllerPolicyPreset('teaching'), 'takeover fixture could not select Teaching');
takeover.setMode('manual');
takeover.setStation('tower');
const continuityFlight = takeover.state.flights.find((flight) => flight.phase === 'approach');
assert(continuityFlight, 'takeover fixture requires an arrival');
continuityFlight.navigation.frequencyOwner = 'approach';
continuityFlight.navigation.handoffStatus = 'offered';
continuityFlight.navigation.handoff = {
  schemaVersion: 1,
  revision: 1,
  from: 'approach',
  to: 'tower',
  status: 'offered',
  offeredAtSeconds: takeover.state.elapsed,
  responseDueSeconds: takeover.state.elapsed + 12,
  offeredBy: 'approach',
  reason: 'takeover continuity fixture',
};
takeover.setStation('supervisor');
assert(takeover.setStationAutomation('tower', true), 'Supervisor could not return Tower to automation');
assert(continuityFlight.navigation.handoff?.status === 'offered', 'human takeover destroyed an active handoff');
const towerTransition = [...takeover.state.scriptedControllers.transitions].reverse().find((transition) => transition.station === 'tower' && transition.from === 'human' && transition.to === 'scripted');
assert(towerTransition?.continuityFlightIds.includes(continuityFlight.id), 'takeover transition omitted the coordinated flight');
assert(takeover.state.scriptedControllers.stations.tower.resumeGraceUntilSeconds > takeover.state.elapsed, 'automation resumed without the selected takeover grace');

function deterministicSignature() {
  const simulation = new AirportSimulation(config, 'quiet');
  simulation.setControllerPolicyPreset('calm');
  simulation.setMode('auto');
  simulation.drainEvents();
  for (let tick = 0; tick < 120; tick += 1) {
    simulation.update(0.05);
    simulation.drainEvents();
  }
  return JSON.stringify({ runtime: simulation.state.scriptedControllers, flights: simulation.state.flights });
}
assert(deterministicSignature() === deterministicSignature(), 'controller policy behavior is not deterministic');

const sustained = [];
for (const presetId of expectedIds) {
  const simulation = new AirportSimulation(config, 'busy');
  assert(simulation.setControllerPolicyPreset(presetId), 'could not configure sustained ' + presetId + ' run');
  simulation.setMode('auto');
  simulation.setPace(3);
  simulation.drainEvents();
  for (let tick = 0; tick < 400; tick += 1) {
    simulation.update(0.1);
    simulation.drainEvents();
  }
  const diagnostics = simulation.diagnostics();
  const runtime = simulation.state.scriptedControllers;
  assert(runtime.decisions.length <= 64 && runtime.transitions.length <= 32, presetId + ' histories are not bounded');
  assert(runtime.decisions.length > 0, presetId + ' produced no controller decisions');
  assert(diagnostics.collisions.length === 0 && diagnostics.obstacleCollisions.length === 0, presetId + ' created a collision');
  assert(diagnostics.metrics.collisionAlerts === 0 && diagnostics.metrics.runwayIncursions === 0, presetId + ' breached a safety invariant');
  assert(CONTROLLER_STATIONS.every((station) => runtime.stations[station].workload.trackLimit === runtime.stations[station].policy.trackLimit), presetId + ' workload and policy limits diverged');
  sustained.push({ presetId, arrivals: simulation.state.arrivals, departures: simulation.state.departures, decisions: runtime.decisions.length });
}

console.log(JSON.stringify({ presets: expectedIds.length, teachingQueued: teachingRoutine.state.scriptedControllers.stations.approach.workload.queuedActions, transition: towerTransition.id, sustained }));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'controller-policy-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Controller-policy validation bundle was empty.');
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

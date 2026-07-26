import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { CONTROLLER_STATIONS, OPERATIONAL_CONTROLLER_STATIONS } from './src/simulation/controllerOperations.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD');
const config = generateHubConfig(ordIndex);

function arrivalFixture(simulation) {
  const flight = simulation.state.flights.find((candidate) => candidate.phase === 'approach');
  assert(flight, 'scripted-controller validation requires an initial arrival');
  simulation.state.flights = [flight];
  flight.phase = 'approach';
  flight.flightPlan.direction = 'arrival';
  flight.operationPlan.direction = 'arrival';
  flight.progress = 0.58;
  flight.phaseElapsed = 0;
  flight.duration = 1_000_000;
  flight.clearanceLeft = 1_000_000;
  flight.cleared = false;
  flight.goAround = undefined;
  flight.diversion = undefined;
  flight.navigation.hold = undefined;
  flight.navigation.frequencyOwner = 'approach';
  flight.navigation.handoff = undefined;
  flight.navigation.handoffStatus = 'owned';
  flight.navigation.approachCleared = false;
  flight.safetyHold = false;
  flight.safetyHoldReason = undefined;
  simulation.drainEvents();
  return flight;
}

const automatic = new AirportSimulation(config, 'quiet');
automatic.setMode('auto');
automatic.drainEvents();
automatic.update(0.05);
const automaticRuntime = automatic.state.scriptedControllers;
assert(automaticRuntime.schemaVersion === 1 && automaticRuntime.programVersion === '1.0.0', 'scripted-controller runtime is not versioned');
assert(CONTROLLER_STATIONS.every((station) => automaticRuntime.stations[station].mode === 'scripted'), 'Auto did not activate all five scripted positions');
assert(CONTROLLER_STATIONS.every((station) => automaticRuntime.stations[station].evaluations > 0), 'a scripted station did not evaluate its queue');
assert(automaticRuntime.decisions.length > 0, 'Auto produced no deterministic station decisions');
assert(automatic.shiftMetrics().manualCommands === 0, 'scripted actions were counted as human commands');
const automaticEvents = automatic.drainEvents();
const automaticDecisionIds = new Set(automaticRuntime.decisions.map((decision) => decision.id));
assert(automaticEvents.some((event) => event.type === 'controller-decision'), 'scripted decisions emitted no typed audit event');
assert(automaticEvents.filter((event) => event.type === 'controller-decision').every((event) => automaticDecisionIds.has(event.causedByControllerDecisionId)), 'controller-decision event lost its decision causality');

const takeover = new AirportSimulation(config, 'quiet');
takeover.setMode('manual');
takeover.setStation('tower');
const takeoverArrival = arrivalFixture(takeover);
takeoverArrival.progress = 0.76;
takeoverArrival.navigation.frequencyOwner = 'tower';
takeoverArrival.navigation.approachCleared = true;
takeover.update(0.05);
assert(takeover.state.scriptedControllers.stations.tower.mode === 'human', 'selected Tower position was not transferred to the human');
assert(takeover.state.scriptedControllers.stations.supervisor.mode === 'scripted', 'unstaffed Supervisor protection did not remain active');
assert(!takeoverArrival.cleared, 'scripted Tower issued a landing clearance after human takeover');
assert(!takeover.state.scriptedControllers.decisions.some((decision) => decision.station === 'tower'), 'human Tower still generated scripted decisions');

takeover.setStation('supervisor');
for (const station of OPERATIONAL_CONTROLLER_STATIONS) takeover.setStationAutomation(station, false);
assert(takeover.setStationAutomation('tower', true), 'Supervisor could not return Tower to scripted control');
for (let tick = 0; tick < 2; tick += 1) takeover.update(0.1);
assert(takeoverArrival.cleared, 'scripted Tower did not clear an eligible coordinated arrival through the arbiter');
const towerClearance = takeover.state.scriptedControllers.decisions.find((decision) => decision.station === 'tower' && decision.action === 'clear-landing');
assert(towerClearance?.accepted && towerClearance.producedEventTypes.includes('clear'), 'Tower decision lacks an accepted landing-clearance result');

const holding = new AirportSimulation(config, 'quiet');
holding.setMode('manual');
holding.setStation('supervisor');
const heldArrival = arrivalFixture(holding);
heldArrival.progress = 0.2;
assert(holding.holdFlight(heldArrival.id, undefined, 1), 'manual holding fixture could not enter a terminal hold');
heldArrival.navigation.hold.expectFurtherClearanceAtSeconds = holding.state.elapsed;
heldArrival.progress = 1;
const manualCommandCount = holding.shiftMetrics().manualCommands;
holding.update(0.05);
assert(heldArrival.navigation.hold, 'manual hold released itself at EFC without an Approach instruction');
assert(holding.setStationAutomation('approach', true), 'Supervisor could not automate Approach');
for (let tick = 0; tick < 2; tick += 1) holding.update(0.1);
assert(!heldArrival.navigation.hold, 'scripted Approach did not release a hold after EFC');
assert(holding.shiftMetrics().manualCommands === manualCommandCount, 'scripted hold release changed the human-command metric');
assert(holding.state.scriptedControllers.decisions.some((decision) => decision.action === 'release-hold' && decision.accepted), 'hold release has no accepted scripted decision record');

const supervision = new AirportSimulation(config, 'quiet');
supervision.setMode('manual');
supervision.setStation('tower');
const protectedArrival = arrivalFixture(supervision);
protectedArrival.progress = 0.82;
protectedArrival.navigation.frequencyOwner = 'tower';
protectedArrival.navigation.approachCleared = true;
protectedArrival.safetyHold = true;
protectedArrival.safetyHoldReason = 'validation conflict inside final';
supervision.update(0.05);
const supervisorIntervention = supervision.state.scriptedControllers.decisions.find((decision) => decision.station === 'supervisor' && decision.action === 'go-around');
assert(supervisorIntervention?.accepted && protectedArrival.goAround, 'scripted Supervisor did not execute a safety go-around through the arbiter');

const rejection = new AirportSimulation(config, 'quiet');
rejection.setMode('manual');
rejection.setStation('supervisor');
for (const station of OPERATIONAL_CONTROLLER_STATIONS) rejection.setStationAutomation(station, false);
assert(rejection.setStationAutomation('tower', true), 'rejection fixture could not automate Tower');
const arrival = arrivalFixture(rejection);
const blocker = structuredClone(arrival);
blocker.id = arrival.id + 10_000;
blocker.callsign = 'BLOCKER 1';
blocker.phase = 'landing';
blocker.progress = 0.45;
blocker.navigation.frequencyOwner = 'tower';
arrival.progress = 0.84;
arrival.navigation.frequencyOwner = 'tower';
arrival.navigation.approachCleared = true;
rejection.state.flights = [arrival, blocker];
rejection.update(0.05);
const rejectedClearance = rejection.state.scriptedControllers.decisions.find((decision) => decision.flightId === arrival.id && decision.action === 'clear-landing');
assert(rejectedClearance && !rejectedClearance.accepted && /protected/.test(rejectedClearance.result), 'unsafe scripted landing was not rejected by the shared arbiter');
const rejectionEvents = rejection.drainEvents().filter((event) => event.causedByControllerDecisionId === rejectedClearance.id);
assert(rejectionEvents.some((event) => event.type === 'reject') && rejectionEvents.some((event) => event.type === 'controller-decision'), 'rejected decision lost causal domain events');

function deterministicSignature() {
  const simulation = new AirportSimulation(config, 'quiet');
  simulation.setMode('auto');
  simulation.drainEvents();
  for (let tick = 0; tick < 80; tick += 1) {
    simulation.update(0.05);
    simulation.drainEvents();
  }
  return JSON.stringify({
    runtime: simulation.state.scriptedControllers,
    flights: simulation.state.flights.map((flight) => ({
      id: flight.id,
      phase: flight.phase,
      progress: flight.progress,
      owner: flight.navigation.frequencyOwner,
      cleared: flight.cleared,
      pushback: flight.pushbackCleared,
    })),
  });
}
assert(deterministicSignature() === deterministicSignature(), 'scripted controller decisions are not deterministic');

const flow = new AirportSimulation(config, 'busy');
flow.setMode('auto');
flow.setPace(3);
flow.drainEvents();
for (let tick = 0; tick < 3_200 && (flow.state.arrivals < 1 || flow.state.departures < 1); tick += 1) {
  flow.update(0.05);
  flow.drainEvents();
}
const flowRuntime = flow.state.scriptedControllers;
const flowDiagnostics = flow.diagnostics();
assert(flow.state.arrivals > 0 && flow.state.departures > 0, 'scripted ORD flow did not complete both an arrival and departure');
assert(OPERATIONAL_CONTROLLER_STATIONS.every((station) => flowRuntime.stations[station].accepted > 0), 'an operational scripted position completed no accepted work: ' + JSON.stringify(flowRuntime.stations));
assert(flowRuntime.stations.supervisor.evaluations > 0, 'Supervisor did not continuously evaluate the airport safety picture');
assert(flowDiagnostics.collisions.length === 0 && flowDiagnostics.obstacleCollisions.length === 0, 'scripted ORD flow created a collision');
assert(flowDiagnostics.metrics.collisionAlerts === 0 && flowDiagnostics.metrics.runwayIncursions === 0, 'scripted ORD flow breached a safety invariant');
assert(flowDiagnostics.metrics.manualCommands === 0, 'long-running scripted flow inflated human-command metrics');
assert(flowRuntime.decisions.length <= 64, 'scripted decision history is not bounded');
assert(JSON.stringify(JSON.parse(JSON.stringify(flowRuntime))) === JSON.stringify(flowRuntime), 'scripted runtime is not JSON stable');

console.log(JSON.stringify({
  stations: CONTROLLER_STATIONS.length,
  initialDecisions: automaticRuntime.decisions.length,
  takeoverModes: Object.fromEntries(CONTROLLER_STATIONS.map((station) => [station, takeover.state.scriptedControllers.stations[station].mode])),
  causalRejectionEvents: rejectionEvents.length,
  supervisorIntervention: supervisorIntervention.id,
  ord: {
    elapsedSeconds: Number(flow.state.elapsed.toFixed(1)),
    arrivals: flow.state.arrivals,
    departures: flow.state.departures,
    acceptedByStation: Object.fromEntries(CONTROLLER_STATIONS.map((station) => [station, flowRuntime.stations[station].accepted])),
    retainedDecisions: flowRuntime.decisions.length,
  },
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "scripted-controllers-validation.ts",
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
  throw new Error("Scripted-controller validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

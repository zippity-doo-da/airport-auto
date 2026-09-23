import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function advanceUntil(simulation, predicate, description, seconds = 90) {
  for (let tick = 0; tick < Math.ceil(seconds / 0.05) && !predicate(); tick += 1) {
    simulation.update(0.05);
  }
  assert(predicate(), description);
}

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD');
assert(ordIndex >= 0, 'ORD fixture is missing');
const simulation = new AirportSimulation(generateHubConfig(ordIndex), 'quiet');
assert(simulation.startSandbox(false), 'clean sandbox could not start');
simulation.setMode('manual');
simulation.setStation('supervisor');
simulation.setPaused(false);
const runway = simulation.sandboxSnapshot().runwayOptions.find((candidate) =>
  !candidate.closed && (candidate.role === 'departure' || candidate.role === 'mixed'),
);
assert(runway, 'ORD has no departure runway for cancellation fixture');
assert(simulation.queueSandboxTraffic('departure', 'regional', runway.id, 1), 'fixture departure could not be queued');
advanceUntil(simulation, () => simulation.state.flights.length === 1, 'fixture departure was not released');
const flight = simulation.state.flights[0];
assert(flight.phase === 'resting' && flight.turnaround.status === 'ready', 'fixture departure was not ready at its stand');
const standId = flight.standId;
simulation.setStation('ramp');
assert(!simulation.cancelGateDeparture(flight.id), 'Ramp was allowed to cancel a departure');
assert(simulation.lastCommandReason().includes('no gate-cancellation authority'), 'authority rejection was not explained');
simulation.setStation('supervisor');
assert(simulation.cancelGateDeparture(flight.id), 'Supervisor gate cancellation was rejected: ' + simulation.lastCommandReason());
assert(!simulation.state.flights.some((candidate) => candidate.id === flight.id), 'cancelled aircraft remained active');
assert(flight.flightPlan.status === 'cancelled', 'cancelled flight plan retained an active status');
assert(flight.flightPlan.amendments.some((amendment) => amendment.kind === 'cancellation'), 'flight plan omitted cancellation amendment');
assert(flight.flightPlanHistory.some((plan) => plan.status === 'cancelled'), 'cancelled plan was not archived for replay/debrief');
assert(flight.gateAssignment?.actualGateOutSeconds !== undefined, 'cancelled gate was not released');
assert(!simulation.state.serviceVehicles.some((vehicle) => vehicle.flightId === flight.id), 'cancelled gate retained service equipment');
assert(simulation.events.some((event) => event.type === 'flight-cancelled' && event.flight.id === flight.id), 'flight-cancelled event missing');
assert(simulation.events.some((event) => event.type === 'gate-release' && event.flight.id === flight.id), 'gate-release event missing for cancellation');
assert(simulation.metrics.cancellations === 1, 'cancellation metric did not increment');
assert(simulation.diagnostics().collisions.length === 0, 'gate cancellation introduced a collision diagnostic');

console.log(JSON.stringify({
  airport: 'ORD',
  flight: flight.callsign,
  standId,
  cancellation: true,
  flightPlanAmendments: flight.flightPlan.amendments.length,
  gateReleased: true,
  collisionPairs: simulation.diagnostics().collisions.length,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "gate-cancellation-validation.ts",
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

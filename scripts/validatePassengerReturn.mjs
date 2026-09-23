import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function advanceUntil(simulation, predicate, description, seconds = 180) {
  for (let tick = 0; tick < Math.ceil(seconds / 0.05) && !predicate(); tick += 1) simulation.update(0.05);
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
assert(runway, 'ORD has no departure runway');
assert(simulation.queueSandboxTraffic('departure', 'regional', runway.id, 1), 'fixture departure could not be queued');
advanceUntil(simulation, () => simulation.state.flights.length === 1, 'fixture departure was not released');
const flight = simulation.state.flights[0];
assert(flight.service === 'passenger', 'fixture must be a passenger departure');
assert(flight.phase === 'resting' && flight.turnaround.status === 'ready', 'fixture departure was not ready at stand');
const boarding = flight.turnaround.tasks.find((task) => task.type === 'boarding');
assert(boarding?.status === 'complete', 'fixture passenger boarding was not complete');
assert(simulation.requestPassengerReturn(flight.id), 'Supervisor passenger return was rejected: ' + simulation.lastCommandReason());
assert(flight.turnaround.status === 'servicing' && boarding.status === 'waiting', 'passenger return did not re-open boarding');
assert(!simulation.clearPushback(flight.id), 'pushback bypassed the reopened boarding task');
advanceUntil(simulation, () => flight.turnaround.status === 'ready', 'passenger return did not complete');
assert(boarding.status === 'complete', 'reopened boarding task did not complete');
advanceUntil(simulation, () => !simulation.state.serviceVehicles.some((vehicle) => vehicle.flightId === flight.id && ['approaching', 'servicing', 'clearing'].includes(vehicle.status)), 'passenger service vehicle did not clear');
assert(simulation.clearPushback(flight.id), 'pushback remained blocked after reboarding: ' + simulation.lastCommandReason());
assert(simulation.events.some((event) => event.type === 'passenger-return' && event.flight.id === flight.id), 'passenger-return event missing');
assert(simulation.diagnostics().collisions.length === 0 && simulation.diagnostics().serviceVehicleConflicts.length === 0, 'passenger return breached a protected envelope');
// Return to the same session's ordinary controller; reboarding must lead back
// into a real departure, not merely re-enable a button at the gate.
simulation.setMode('auto');
const departuresBeforeRecovery = simulation.state.departures;
advanceUntil(
  simulation,
  () => simulation.state.departures > departuresBeforeRecovery,
  'passenger-return flight did not complete a normal departure after recovery',
  900,
);
assert(simulation.diagnostics().collisions.length === 0 && simulation.diagnostics().serviceVehicleConflicts.length === 0, 'post-passenger-return departure breached surface safety');

console.log(JSON.stringify({ airport: 'ORD', flight: flight.callsign, passengerReturn: true, pushbackGated: true, postRecoveryDeparture: true }));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: { contents: validationSource, loader: "ts", resolveDir: process.cwd(), sourcefile: "passenger-return-validation.ts" },
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

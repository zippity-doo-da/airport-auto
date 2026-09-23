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
const initialFuel = flight.kinematics.fuelPercent;
assert(flight.phase === 'resting' && flight.turnaround.status === 'ready', 'fixture departure was not ready at stand');
assert(simulation.requestFuelReturn(flight.id), 'Supervisor fuel return was rejected: ' + simulation.lastCommandReason());
const fuelTask = flight.turnaround.tasks.find((task) => task.type === 'fueling');
assert(flight.turnaround.status === 'servicing' && fuelTask?.status === 'waiting', 'fuel return did not re-open the fueling task');
assert(fuelTask.required && fuelTask.durationSeconds >= 8, 'fuel return did not create a real fuel service duration');
assert(simulation.state.serviceVehicles.some((vehicle) => vehicle.flightId === flight.id && vehicle.service === 'fueling' && vehicle.type === 'fuel-truck'), 'fuel return did not dispatch a fuel truck');
assert(!simulation.clearPushback(flight.id), 'pushback bypassed the reopened fuel task');
advanceUntil(simulation, () => flight.turnaround.status === 'ready', 'fuel return did not complete');
assert(fuelTask.status === 'complete', 'fuel task did not complete');
assert(flight.kinematics.fuelPercent > initialFuel + 5.5, 'fuel return did not increase usable fuel');
assert(Math.abs(flight.kinematics.fuelPercent - flight.turnaround.targetFuelPercent) < 0.01, 'fuel return did not reach its new dispatch target');
advanceUntil(simulation, () => !simulation.state.serviceVehicles.some((vehicle) => vehicle.flightId === flight.id && ['approaching', 'servicing', 'clearing'].includes(vehicle.status)), 'fuel truck did not clear the stand lane');
assert(simulation.clearPushback(flight.id), 'pushback remained blocked after fuel truck cleared: ' + simulation.lastCommandReason());
assert(simulation.events.some((event) => event.type === 'fuel-return' && event.flight.id === flight.id), 'fuel-return event missing');
assert(simulation.diagnostics().collisions.length === 0 && simulation.diagnostics().serviceVehicleConflicts.length === 0, 'fuel return breached a protected envelope');
// Resume the same live session under the normal controller. A recovery is not
// complete merely because its service task ended: the aircraft must traverse
// the regular pushback/taxi/runway lifecycle without a reset or special exit.
simulation.setMode('auto');
const departuresBeforeRecovery = simulation.state.departures;
advanceUntil(
  simulation,
  () => simulation.state.departures > departuresBeforeRecovery,
  'fuel-return flight did not complete a normal departure after recovery',
  900,
);
assert(simulation.diagnostics().collisions.length === 0 && simulation.diagnostics().serviceVehicleConflicts.length === 0, 'post-fuel-return departure breached surface safety');

console.log(JSON.stringify({
  airport: 'ORD',
  flight: flight.callsign,
  initialFuel: Number(initialFuel.toFixed(2)),
  targetFuel: Number(flight.turnaround.targetFuelPercent.toFixed(2)),
  fuelReturn: true,
  pushbackGated: true,
  postRecoveryDeparture: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: { contents: validationSource, loader: "ts", resolveDir: process.cwd(), sourcefile: "fuel-return-validation.ts" },
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

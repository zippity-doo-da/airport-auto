import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function advanceUntil(simulation, predicate, description, seconds = 300) {
  const ticks = Math.ceil(seconds / 0.05);
  for (let tick = 0; tick < ticks && !predicate(); tick += 1) simulation.update(0.05);
  assert(predicate(), description + ': ' + simulation.state.flights.map((flight) =>
    flight.callsign + ':' + flight.phase + ':' + flight.progress.toFixed(3) + ':' +
    flight.navigation.frequencyOwner + ':' +
    (flight.navigation.handoff?.status ?? 'no-handoff')
  ).join(','));
}

function completePendingHandoff(simulation, flight) {
  const handoff = flight.navigation.handoff;
  if (!handoff) return false;
  if (handoff.status === 'offered' || handoff.status === 'overdue') {
    assert(simulation.acceptHandoff(flight.id), 'Manual UI equivalent handoff acceptance was rejected: ' + simulation.lastCommandReason());
    return true;
  }
  if (handoff.status === 'accepted') {
    assert(simulation.contactFlight(flight.id, handoff.to), 'Manual UI equivalent contact instruction was rejected: ' + simulation.lastCommandReason());
    return true;
  }
  return false;
}

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD');
assert(ordIndex >= 0, 'ORD is required for manual arrival validation');
const simulation = new AirportSimulation(generateHubConfig(ordIndex), 'quiet');
assert(simulation.startSandbox(false), 'clean sandbox could not start');
simulation.setMode('manual');
simulation.setStation('supervisor');
simulation.setPaused(false);

const arrivalRunway = simulation.sandboxSnapshot().runwayOptions.find((runway) =>
  !runway.closed && (runway.role === 'arrival' || runway.role === 'mixed')
);
assert(arrivalRunway, 'ORD has no usable arrival runway');
assert(simulation.queueSandboxTraffic('arrival', 'regional', arrivalRunway.id, 1), 'manual arrival fixture could not be queued');
advanceUntil(simulation, () => simulation.state.flights.length === 1, 'arrival was not released');

const flight = simulation.state.flights[0];
assert(flight.phase === 'approach', 'sandbox arrival did not enter the approach phase');
assert(flight.navigation.frequencyOwner === 'approach', 'arrival was not initially owned by Approach');

assert(simulation.clearApproach(flight.id), 'Manual UI equivalent approach clearance was rejected: ' + simulation.lastCommandReason());
assert(flight.navigation.approachCleared, 'approach clearance was not stored on the flight');

let landingCleared = false;
for (let tick = 0; tick < 12_000 && !flight.motion.onGround; tick += 1) {
  completePendingHandoff(simulation, flight);
  if (
    flight.phase === 'approach' &&
    flight.navigation.frequencyOwner === 'tower' &&
    !flight.cleared &&
    !flight.goAround &&
    !flight.diversion
  ) {
    assert(simulation.clearFlight(flight.id, flight.runway),
      'Manual UI equivalent landing clearance was rejected: ' + simulation.lastCommandReason());
    landingCleared = true;
  }
  simulation.update(0.05);
  completePendingHandoff(simulation, flight);
}

assert(landingCleared, 'arrival never received a landing clearance after Tower contact');
assert(flight.motion.onGround, 'landing clearance did not produce a real touchdown');
assert(flight.phase === 'landing' || flight.phase === 'taxi-in', 'arrival did not enter landing rollout or taxi-in: ' + flight.phase);
assert(flight.navigation.frequencyOwner === 'tower' || flight.navigation.frequencyOwner === 'ground', 'arrival ownership did not progress beyond Approach');

console.log(JSON.stringify({
  airport: 'ORD',
  mode: simulation.state.mode,
  approach: flight.navigation.approachCleared,
  landing: landingCleared,
  touchdown: flight.motion.onGround,
  phase: flight.phase,
  owner: flight.navigation.frequencyOwner,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "manual-arrival-lifecycle-validation.ts",
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
  throw new Error("Manual arrival lifecycle validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

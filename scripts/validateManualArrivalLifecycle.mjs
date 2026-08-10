import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { digitalClearanceSnapshot } from './src/simulation/digitalClearances.ts';

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
const config = generateHubConfig(ordIndex);
const simulation = new AirportSimulation(config, 'quiet');
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

const procedure = config.airspaceProgram.procedures.find((candidate) => candidate.id === flight.navigation.procedureId);
assert(procedure?.kind === 'STAR', 'manual arrival lost its published STAR');
const amendedFixIds = Array.from({ length: Math.max(1, procedure.commonFixIds.length - 2) }, (_, index) => procedure.commonFixIds.slice(index))
  .filter((fixIds) => fixIds.length >= 3)
  .sort((first, second) => {
    const turn = (fixIds) => {
      const fix = config.airspaceProgram.fixes.find((candidate) => candidate.id === fixIds[0]);
      const heading = Math.atan2(fix.position[1] - flight.motion.y, fix.position[0] - flight.motion.x);
      return Math.abs(Math.atan2(Math.sin(heading - flight.motion.heading), Math.cos(heading - flight.motion.heading)));
    };
    return turn(first) - turn(second);
  })[0];
assert(amendedFixIds, 'manual arrival has no safe published route amendment');
assert(simulation.previewFlightRoute(flight.id, amendedFixIds), 'Data Comm route preview was rejected: ' + simulation.lastCommandReason());
assert(simulation.issueFlightRoute(flight.id), 'Data Comm route issue was rejected: ' + simulation.lastCommandReason());
assert(flight.navigation.routeClearance?.status === 'sent', 'mixed arrival skipped the Data Comm Sent state');
advanceUntil(simulation, () => flight.navigation.routeClearance?.status === 'pending-readback', 'Data Comm route was not delivered', 10);
assert(digitalClearanceSnapshot(simulation.state).messages.some((message) => message.flightId === flight.id && message.kind === 'route-amendment' && message.status === 'delivered'), 'delivered route was absent from the Data Comm projection');
simulation.setStation('approach');
assert(simulation.acceptRouteReadback(flight.id), 'Data Comm route readback was rejected: ' + simulation.lastCommandReason());
assert(flight.navigation.routeClearance?.status === 'accepted' && flight.navigation.routeFixIds.join('>') === amendedFixIds.join('>'), 'accepted Data Comm route did not become authoritative');
simulation.setStation('supervisor');

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
  dataCommRoute: flight.navigation.routeClearance?.status,
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

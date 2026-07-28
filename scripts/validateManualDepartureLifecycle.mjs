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
    (flight.crossingHoldRunway ?? 'no-crossing') + ':' +
    (flight.navigation.frequencyOwner ?? 'no-owner')
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
assert(ordIndex >= 0, 'ORD is required for manual departure validation');
const simulation = new AirportSimulation(generateHubConfig(ordIndex), 'quiet');
assert(simulation.startSandbox(false), 'clean sandbox could not start');
simulation.setMode('manual');
simulation.setStation('supervisor');
simulation.setPaused(false);

const departureRunway = simulation.sandboxSnapshot().runwayOptions.find((runway) =>
  !runway.closed && (runway.role === 'departure' || runway.role === 'mixed')
);
assert(departureRunway, 'ORD has no usable departure runway');
assert(simulation.queueSandboxTraffic('departure', 'regional', departureRunway.id, 1), 'manual departure fixture could not be queued');
advanceUntil(simulation, () => simulation.state.flights.length === 1, 'departure was not released');

const flight = simulation.state.flights[0];
assert(flight.phase === 'resting' && flight.turnaround.status === 'ready', 'sandbox departure was not ready at a stand');
assert(simulation.clearPushback(flight.id), 'Manual UI equivalent pushback was rejected: ' + simulation.lastCommandReason());
assert(flight.pushbackCleared, 'pushback clearance was not stored on the flight');
advanceUntil(simulation, () => flight.phase === 'taxi-out', 'pushback did not begin taxi-out', 5);

let crossingsCleared = 0;
for (let tick = 0; tick < 12_000 && flight.phase === 'taxi-out'; tick += 1) {
  completePendingHandoff(simulation, flight);
  if (flight.crossingHoldRunway !== undefined) {
    assert(simulation.clearRunwayCrossing(flight.id, flight.crossingHoldRunway),
      'Manual UI equivalent runway crossing was rejected: ' + simulation.lastCommandReason());
    crossingsCleared += 1;
  }
  if (flight.progress >= 0.985 && !flight.runwayEntryCleared) {
    assert(simulation.clearRunwayEntry(flight.id),
      'Manual UI equivalent line-up was rejected: ' + simulation.lastCommandReason());
  }
  simulation.update(0.05);
  completePendingHandoff(simulation, flight);
}
assert(flight.phase === 'takeoff', 'taxi-out did not reach the takeoff phase: ' + JSON.stringify({
  phase: flight.phase,
  progress: flight.progress,
  hold: flight.crossingHoldRunway,
  entry: flight.runwayEntryCleared,
  reason: simulation.lastCommandReason(),
  safetyHold: flight.safetyHoldReason,
  automaticHold: flight.automaticHoldReason,
  route: flight.surfaceRouteEdges,
}));
assert(flight.runwayEntryCleared, 'departure entered takeoff without runway-entry clearance');
assert(!flight.takeoffCleared, 'departure self-cleared for takeoff in Manual mode');
assert(simulation.clearTakeoff(flight.id), 'Manual UI equivalent takeoff clearance was rejected: ' + simulation.lastCommandReason());
assert(flight.takeoffCleared, 'takeoff clearance was not stored on the flight');
advanceUntil(simulation, () => !flight.motion.onGround, 'takeoff clearance did not produce a real airborne departure', 180);

console.log(JSON.stringify({
  airport: 'ORD',
  mode: simulation.state.mode,
  station: simulation.state.station,
  pushback: true,
  crossingsCleared,
  runwayEntry: flight.runwayEntryCleared,
  takeoff: flight.takeoffCleared,
  airborne: !flight.motion.onGround,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "manual-departure-lifecycle-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Manual departure lifecycle validation bundle was empty.");
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

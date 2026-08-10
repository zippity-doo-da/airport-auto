import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { syncFlightMotion } from './src/simulation/flightMotion.ts';
import { aircraftCollisionEnvelope } from './src/simulation/collisionDetection.ts';
import { surfaceSafetySnapshot } from './src/simulation/surfaceSafety.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function advanceUntil(simulation, predicate, description, seconds = 300, afterTick) {
  const ticks = Math.ceil(seconds / 0.05);
  for (let tick = 0; tick < ticks && !predicate(); tick += 1) {
    simulation.update(0.05);
    afterTick?.();
  }
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

function assertSurfacePoseAlignment(config, simulation) {
  const snapshot = surfaceSafetySnapshot(config, simulation.state, [], {
    collisionAlerts: simulation.metrics.collisionAlerts,
    runwayIncursions: simulation.metrics.runwayIncursions,
  });
  for (const track of snapshot.tracks) {
    const trackedFlight = simulation.state.flights.find((candidate) => candidate.id === track.id);
    assert(trackedFlight, 'surface projection included an unknown flight');
    const envelope = aircraftCollisionEnvelope(config, trackedFlight, trackedFlight.progress);
    const headingDegrees = Math.round(((((trackedFlight.motion.heading * 180) / Math.PI) % 360) + 360) % 360);
    assert(
      track.x === trackedFlight.motion.x &&
        track.y === trackedFlight.motion.y &&
        track.headingDegrees === headingDegrees &&
        envelope.x === track.x &&
        envelope.y === track.y,
      'surface pose diverged during ' + trackedFlight.phase + ' for ' + trackedFlight.callsign,
    );
  }
}

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD');
assert(ordIndex >= 0, 'ORD is required for manual departure validation');
const config = generateHubConfig(ordIndex);
const simulation = new AirportSimulation(config, 'quiet');
const assertCurrentSurfacePose = () => assertSurfacePoseAlignment(config, simulation);
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
const pushbackInstruction = flight.surfaceInstructions?.find((instruction) => instruction.kind === 'pushback');
assert(pushbackInstruction?.id === 'pushback:' + flight.id + ':1' && pushbackInstruction.evidence.causalEventIds.length === 1, 'pushback instruction lacks stable issue/event evidence');
advanceUntil(simulation, () => flight.phase === 'taxi-out', 'pushback did not begin taxi-out', 5, assertCurrentSurfacePose);

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
  assertCurrentSurfacePose();
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
const firstTakeoffInstruction = flight.surfaceInstructions?.find((instruction) => instruction.kind === 'takeoff');
assert(firstTakeoffInstruction?.id === 'takeoff:' + flight.id + ':1' && firstTakeoffInstruction.evidence.causalEventIds.length === 1, 'takeoff instruction lacks stable issue/event evidence');
assert(simulation.cancelTakeoffClearance(flight.id), 'Manual UI equivalent takeoff-cancellation was rejected: ' + simulation.lastCommandReason());
assert(!flight.takeoffCleared, 'cancelled takeoff clearance remained active');
assert(firstTakeoffInstruction.status === 'cancelled' && firstTakeoffInstruction.evidence.causalEventIds.length === 2, 'takeoff cancellation was not appended to the original instruction lifecycle');
assert(simulation.clearTakeoff(flight.id), 'Manual UI equivalent re-clearance was rejected: ' + simulation.lastCommandReason());
const secondTakeoffInstruction = flight.surfaceInstructions?.find((instruction) => instruction.id === 'takeoff:' + flight.id + ':2');
assert(secondTakeoffInstruction?.status === 'active' && secondTakeoffInstruction.evidence.causalEventIds.length === 1, 'takeoff re-clearance did not create a distinct stable instruction');
flight.progress = 0.2;
syncFlightMotion(config, flight);
assert(flight.motion.stage === 'takeoff-roll', 'late cancellation fixture did not reach its takeoff roll');
assert(!simulation.cancelTakeoffClearance(flight.id), 'takeoff cancellation was accepted after the roll began');
assert(simulation.lastCommandReason().includes('no longer safe'), 'late takeoff-cancellation rejection did not explain the safety boundary');
advanceUntil(simulation, () => !flight.motion.onGround, 'takeoff clearance did not produce a real airborne departure', 180, assertCurrentSurfacePose);

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
if (!bundled)
  throw new Error("Manual departure lifecycle validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

import { build } from "esbuild";

const source = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { digitalClearanceSnapshot } from './src/simulation/digitalClearances.ts';

function assert(condition, message) { if (!condition) throw new Error(message); }

const simulation = new AirportSimulation(generateHubConfig(HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD')));
const flight = simulation.state.flights[0];
assert(flight, 'ORD needs an initial flight for digital-clearance validation');
let snapshot;
flight.motion.onGround = false;
flight.navigation.assignedSpeedKts = 180;
flight.navigation.assignedAltitudeFt = 5000;
snapshot = digitalClearanceSnapshot(simulation.state);
assert(snapshot.messages.some((item) => item.kind === 'speed' && item.parameters.speedKts === 180), 'assigned speed did not project as a structured digital message');
assert(snapshot.messages.some((item) => item.kind === 'altitude' && item.parameters.altitudeFt === 5000), 'assigned altitude did not project as a structured digital message');
flight.navigation.vector = {
  issuedAtSeconds: 9, startProgress: 0.1, endProgress: 0.5, headingDegrees: 120,
  rejoinFixId: 'LAKE', start: { x: flight.motion.x, y: flight.motion.y, z: flight.motion.z, heading: flight.motion.heading, pitch: flight.motion.pitch, bank: flight.motion.bank, onGround: false, groundBlend: 0, protectedRunway: false },
};
flight.progress = 0.2;
flight.flightPlan.amendments.push({ revision: 1, kind: 'route-change', atSeconds: 9, detail: 'direct LAKE' });
flight.navigation.handoff = { schemaVersion: 1, revision: 1, from: 'approach', to: 'tower', status: 'offered', offeredAtSeconds: 10, responseDueSeconds: 20, offeredBy: 'approach', reason: 'final handoff' };
snapshot = digitalClearanceSnapshot(simulation.state);
assert(snapshot.messages.some((item) => item.kind === 'direct-to'), 'direct-to vector did not project as a structured message');
assert(snapshot.messages.some((item) => item.kind === 'frequency' && item.status === 'delivered'), 'controller handoff did not project as a frequency message');
flight.navigation.vector = undefined;
flight.navigation.handoff = undefined;
flight.phase = 'taxi-out';
flight.motion.onGround = true;
flight.flightPlan.direction = 'departure';
flight.surfaceRoute = ['RAMP-A', 'TAXI-B', 'HOLD-C'];
flight.requiredCrossings = [1, 2];
flight.crossingClearances = [1];
snapshot = digitalClearanceSnapshot(simulation.state);
assert(snapshot.messages.some((item) => item.kind === 'departure'), 'departure state did not project as a structured digital message');
assert(snapshot.messages.some((item) => item.kind === 'taxi' && item.parameters.routeNodes === 3), 'taxi route did not project as a structured digital message');
assert(snapshot.messages.some((item) => item.kind === 'crossing' && item.status === 'standby' && item.parameters.remaining === 1), 'pending runway crossing did not project as standby');
flight.phase = 'approach';
flight.motion.onGround = false;
flight.flightPlan.direction = 'arrival';
flight.surfaceRoute = undefined;
flight.requiredCrossings = [];
flight.crossingClearances = [];
flight.navigation.routeClearance = {
  schemaVersion: 1, revision: 4, status: 'pending-readback', routeFixIds: ['FIX-A', 'FIX-B'], routeFixNames: ['NORTH', 'LAKE'], previousRouteFixIds: ['OLD'],
  previewedAtSeconds: 3, issuedAtSeconds: 4, readbackDueSeconds: 6, issuedBy: 'approach', distanceNm: 18, estimatedSeconds: 440, initialTurnDegrees: 14, safeToIssue: true, warnings: [], reason: 'awaiting pilot readback',
};
snapshot = digitalClearanceSnapshot(simulation.state);
const message = snapshot.messages[0];
assert(snapshot.schemaVersion === 1 && message?.status === 'delivered' && message.route.join('>') === 'NORTH>LAKE', 'pending readback did not project as a delivered route message');
message.route[0] = 'MUTATED';
assert(flight.navigation.routeClearance.routeFixNames[0] === 'NORTH', 'digital-clearance snapshot shared route references with state');
flight.navigation.frequencyOwner = 'tower';
simulation.update(0.1);
assert(flight.navigation.routeClearance.status === 'cancelled', 'pending route readback survived an authority transfer');
assert(flight.navigation.routeClearance.reason.includes('control transferred to tower'), 'authority-transfer cancellation was not explained');
snapshot = digitalClearanceSnapshot(simulation.state);
assert(snapshot.messages[0]?.status === 'cancelled', 'authority-transferred route readback did not project as cancelled');
flight.navigation.frequencyOwner = 'approach';
flight.navigation.routeClearance = {
  ...flight.navigation.routeClearance,
  status: 'pending-readback',
  issuedBy: 'approach',
  readbackDueSeconds: simulation.state.elapsed + 30,
  reason: 'awaiting pilot readback',
};
simulation.setStation('supervisor');
assert(!simulation.acceptRouteReadback(flight.id), 'a receiving controller accepted a route issued by another desk');
assert(simulation.lastCommandReason().includes('belongs to approach'), 'receiving-controller route rejection was not explained');
flight.navigation.routeClearance = { ...flight.navigation.routeClearance, status: 'cancelled', respondedAtSeconds: 7, reason: 'superseded by go-around clearance' };
snapshot = digitalClearanceSnapshot(simulation.state);
assert(snapshot.messages[0]?.status === 'superseded', 'superseded route clearance did not keep its explicit status');
flight.navigation.routeClearance = { ...flight.navigation.routeClearance, status: 'rejected', reason: 'predicted loss of separation' };
snapshot = digitalClearanceSnapshot(simulation.state);
assert(snapshot.messages[0]?.status === 'unable' && snapshot.counts.unable === 1, 'rejected route clearance did not project as unable');
console.log(JSON.stringify({ messages: snapshot.messages.length, status: snapshot.messages[0]?.status }));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: source,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "digital-clearances-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});
const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Digital-clearance validation bundle was empty.");
try {
  await import(
    "data:text/javascript;base64," + Buffer.from(bundled).toString("base64")
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

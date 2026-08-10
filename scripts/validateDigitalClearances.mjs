import { build } from "esbuild";

const source = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { digitalClearanceSnapshot } from './src/simulation/digitalClearances.ts';
import { messagesForView } from './src/ui/digitalClearancePanel.ts';

function assert(condition, message) { if (!condition) throw new Error(message); }

const simulation = new AirportSimulation(generateHubConfig(HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD')));
simulation.setMode('manual');
simulation.setStation('approach');
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
flight.navigation.handoff = { schemaVersion: 1, revision: 1, from: 'approach', to: 'tower', status: 'offered', offeredAtSeconds: 10, responseDueSeconds: 20, offeredBy: 'approach', reason: 'final handoff', causalEventIds: [] };
snapshot = digitalClearanceSnapshot(simulation.state);
assert(snapshot.messages.some((item) => item.kind === 'direct-to'), 'direct-to vector did not project as a structured message');
assert(snapshot.messages.some((item) => item.kind === 'frequency' && item.status === 'standby'), 'controller handoff did not project as an actionable frequency message');
assert(snapshot.messages.some((item) => item.kind === 'revision' && item.parameters.amendmentRevision === 1), 'flight-plan amendment did not project as a revision message');
flight.flightPlan.amendments.push({ revision: 2, kind: 'gate-swap', atSeconds: 11, detail: 'gate reassigned to C18' });
snapshot = digitalClearanceSnapshot(simulation.state);
const revisionHistory = snapshot.messages.filter((item) => item.kind === 'revision' && item.flightId === flight.id);
assert(revisionHistory.length === 2, 'digital projection omitted the complete active-flight amendment history');
assert(revisionHistory.map((item) => item.parameters.amendmentRevision).join(',') === '2,1', 'revision history did not preserve deterministic newest-first ordering');
assert(new Set(revisionHistory.map((item) => item.commandId)).size === 2, 'revision history reused a command identity');
flight.navigation.vector = undefined;
flight.navigation.handoff = undefined;
flight.phase = 'taxi-out';
flight.motion.onGround = true;
flight.flightPlan.direction = 'departure';
flight.surfaceRoute = ['RAMP-A', 'TAXI-B', 'HOLD-C'];
flight.requiredCrossings = [1, 2];
flight.crossingClearances = [1];
snapshot = digitalClearanceSnapshot(simulation.state);
assert(snapshot.messages.some((item) => item.kind === 'departure' && item.capability.channel === 'voice' && item.capability.responseMode === 'voice-action'), 'departure state did not project as an explicit voice/action message');
assert(snapshot.messages.some((item) => item.kind === 'taxi' && item.parameters.routeNodes === 3), 'taxi route did not project as a structured digital message');
assert(snapshot.messages.some((item) => item.kind === 'crossing' && item.status === 'standby' && item.parameters.remaining === 1), 'pending runway crossing did not project as standby');
flight.phase = 'approach';
flight.motion.onGround = false;
flight.flightPlan.direction = 'arrival';
flight.surfaceRoute = undefined;
flight.requiredCrossings = [];
flight.crossingClearances = [];
flight.navigation.routeClearance = {
  schemaVersion: 2, revision: 4, status: 'sent', routeFixIds: ['FIX-A', 'FIX-B'], routeFixNames: ['NORTH', 'LAKE'], previousRouteFixIds: ['OLD'], supplements: [], safeguards: [],
  previewedAtSeconds: 3, issuedAtSeconds: 4, deliveryDueSeconds: 5, readbackDueSeconds: 6, readbackExpiresSeconds: 12, issuedBy: 'approach', distanceNm: 18, estimatedSeconds: 440, initialTurnDegrees: 14, safeToIssue: true, warnings: [], reason: 'delivery pending',
};
snapshot = digitalClearanceSnapshot(simulation.state);
let message = snapshot.messages[0];
assert(message?.status === 'sent' && message.expiresAtSeconds === 12, 'route transmission did not project as Sent');
flight.navigation.routeClearance = { ...flight.navigation.routeClearance, status: 'pending-readback', deliveredAtSeconds: 5, reason: 'awaiting pilot readback' };
snapshot = digitalClearanceSnapshot(simulation.state);
message = snapshot.messages[0];
assert(snapshot.schemaVersion === 5 && message?.status === 'delivered' && message.route.join('>') === 'NORTH>LAKE', 'pending readback did not project as a delivered route message');
assert(message.capability.channel === 'data' && message.capability.deskAccess === 'authorized' && message.capability.responseMode === 'panel' && message.capability.aircraftSupport === 'data-comm-supported', 'active Data Comm capability or authority was not explicit');
simulation.setStation('tower');
snapshot = digitalClearanceSnapshot(simulation.state);
message = snapshot.messages[0];
assert(message.capability.deskAccess === 'handoff-required' && message.capability.responseMode === 'none' && message.capability.limitations.some((item) => item.includes('APPROACH authority required')), 'wrong-desk limitation was not explicit');
simulation.setStation('approach');
assert(message.commandId === 'cmd:route:' + flight.id + ':4' && message.causalEventIds.length === 2, 'clearance envelope identity or causality is not deterministic');
assert(message.expiresAtSeconds === 12 && message.deliveredAtSeconds === 5 && message.response.status === 'delivered' && message.response.deliveredAtSeconds === 5 && message.response.dueSeconds === 6, 'pending readback envelope timing or response is incomplete');
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
const actionMessages = messagesForView(snapshot, 'action');
const historyMessages = messagesForView(snapshot, 'history');
assert(actionMessages.some((item) => item.status === 'unable') && actionMessages.every((item) => item.kind !== 'revision'), 'Action view did not isolate controller attention messages');
assert(historyMessages.filter((item) => item.kind === 'revision' && item.flightId === flight.id).length === 2 && historyMessages.some((item) => item.status === 'unable'), 'History view omitted recorded revisions or terminal responses');
assert(messagesForView(snapshot, 'all').length === snapshot.messages.length, 'All view did not preserve the complete projection');
flight.navigation.routeClearance = undefined;
flight.aircraft = 'C172';
simulation.setStation('approach');
assert(!simulation.previewFlightRoute(flight.id, ['FIX-A']), 'voice-only aircraft accepted a Data Comm route preview');
assert(simulation.lastCommandReason().includes('modeled voice-only') && simulation.lastCommandReason().includes('direct-to or vector'), 'voice-only route rejection did not explain the valid alternative');
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

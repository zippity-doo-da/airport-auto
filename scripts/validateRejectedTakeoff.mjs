import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { digitalClearanceSnapshot } from './src/simulation/digitalClearances.ts';
import { syncFlightMotion } from './src/simulation/flightMotion.ts';
import { modeledTakeoffDecisionSpeedKts } from './src/simulation/runwayPerformance.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD');
assert(ordIndex >= 0, 'ORD is required for rejected-takeoff validation');
const config = generateHubConfig(ordIndex);
const simulation = new AirportSimulation(config, 'quiet');
simulation.setMode('manual');
simulation.setStation('supervisor');
simulation.setPaused(false);

const flight = simulation.state.flights.find((candidate) => candidate.flightPlan.direction === 'departure') ?? simulation.state.flights[0];
assert(flight, 'rejected-takeoff validation needs an aircraft');
simulation.state.flights = [flight];
flight.phase = 'takeoff';
flight.runwayEntryCleared = true;
flight.takeoffCleared = false;
flight.rejectedTakeoff = undefined;
flight.navigation.frequencyOwner = 'tower';
for (let progress = 0.08; progress <= 0.45; progress += 0.01) {
  flight.progress = progress;
  syncFlightMotion(config, flight);
  if (flight.motion.stage === 'takeoff-roll') break;
}
assert(flight.motion.stage === 'takeoff-roll' && flight.motion.onGround, 'fixture did not reach the takeoff roll');
assert(simulation.clearTakeoff(flight.id), 'takeoff clearance was rejected: ' + simulation.lastCommandReason());
const decisionSpeedKts = modeledTakeoffDecisionSpeedKts(flight.aircraft);

flight.kinematics.groundSpeedKts = decisionSpeedKts;
flight.kinematics.airspeedKts = decisionSpeedKts;
assert(!simulation.rejectTakeoff(flight.id, 'traffic'), 'rejected takeoff was accepted at modeled V1');
assert(simulation.lastCommandReason().includes('continue takeoff'), 'V1 rejection did not explain the continue decision');

flight.kinematics.groundSpeedKts = Math.max(35, decisionSpeedKts * 0.5);
flight.kinematics.airspeedKts = flight.kinematics.groundSpeedKts;
const startProgress = flight.progress;
const startSpeed = flight.kinematics.groundSpeedKts;
simulation.drainEvents();
const rejectEventCursor = simulation.eventCursor();
assert(simulation.rejectTakeoff(flight.id, 'traffic'), 'below-V1 rejected takeoff failed: ' + simulation.lastCommandReason());
simulation.tagEventsSince(rejectEventCursor, 'cmd-validator-reject-takeoff');
assert(!flight.takeoffCleared && flight.rejectedTakeoff?.reason === 'traffic', 'RTO did not replace the takeoff clearance with explicit state');
assert(flight.rejectedTakeoff.projectedStopProgress > startProgress, 'RTO omitted its forward braking distance');
assert(flight.rejectedTakeoff.projectedStopProgress < 1, 'RTO projected a stop beyond the departure path');

let previousSpeed = startSpeed;
let brakingTicks = 0;
for (; brakingTicks < 2_000 && flight.rejectedTakeoff?.stoppedAtSeconds === undefined; brakingTicks += 1) {
  simulation.update(0.05);
  assert(flight.kinematics.groundSpeedKts <= previousSpeed + 0.05, 'RTO accelerated while maximum safe braking was active');
  assert(flight.motion.onGround && flight.motion.stage === 'takeoff-roll', 'RTO rotated or became airborne');
  previousSpeed = flight.kinematics.groundSpeedKts;
}
assert(flight.rejectedTakeoff?.stoppedAtSeconds !== undefined, 'RTO did not reach a stopped state');
assert(flight.kinematics.groundSpeedKts <= 0.05, 'RTO stopped event fired while the aircraft was still moving');
assert(flight.progress > startProgress, 'RTO stopped instantaneously instead of consuming runway');
assert(flight.progress <= flight.rejectedTakeoff.projectedStopProgress + 0.001, 'RTO exceeded its projected stopping point');
assert(flight.automaticHoldReason?.includes('runway recovery required'), 'stopped RTO omitted its runway-blocking state');
assert(!simulation.clearTakeoff(flight.id), 'stopped RTO was re-cleared from the middle of the runway');
const queueRecord = simulation.queueSnapshot().entries.find((record) => record.flightId === flight.id);
assert(queueRecord?.priority === 'blocked' && queueRecord.label.includes('rejected takeoff'), 'RTO was misreported as an ordinary departure queue entry');

simulation.setMode('auto');
for (let tick = 0; tick < 100; tick += 1) simulation.update(0.05);
assert(!flight.takeoffCleared && flight.rejectedTakeoff?.stoppedAtSeconds !== undefined, 'automatic Tower re-cleared a stopped rejected takeoff');

const events = simulation.drainEvents();
assert(events.some((event) => event.type === 'rejected-takeoff'), 'RTO command event was not emitted');
assert(events.some((event) => event.type === 'rejected-takeoff-stopped'), 'RTO stop event was not emitted');
const departureMessage = digitalClearanceSnapshot(simulation.state).messages.find((message) => message.flightId === flight.id && message.kind === 'departure' && message.status === 'unable');
assert(departureMessage?.status === 'unable' && departureMessage.parameters.rejectedTakeoff === 'yes', 'RTO outcome was not projected without becoming a queued instruction');
assert(departureMessage.commandId === 'cmd-validator-reject-takeoff' && departureMessage.causalEventIds.length === 2 && departureMessage.causalEventIds.every((id) => id.includes(':instruction:')), 'RTO outcome omitted its issue/stop command and event evidence');

console.log(JSON.stringify({
  airport: 'ORD',
  decisionSpeedKts,
  startSpeedKts: Number(startSpeed.toFixed(1)),
  brakingSeconds: Number((brakingTicks * 0.05).toFixed(2)),
  progressConsumed: Number((flight.progress - startProgress).toFixed(4)),
  events: events.filter((event) => event.type.startsWith('rejected-takeoff')).map((event) => event.type),
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "rejected-takeoff-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Rejected-takeoff validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

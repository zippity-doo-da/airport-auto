import { build } from "esbuild";

const validationSource = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import {
  CONTROLLER_STATIONS,
  OPERATIONAL_CONTROLLER_STATIONS,
  controllerStationIsAhead,
  controllerWorkloadSnapshots,
  createStationAutomation,
  requiredControllerStation,
  stationCanIssue,
} from './src/simulation/controllerOperations.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = generateHubConfig(0);
const simulation = new AirportSimulation(config, 'quiet');
simulation.setMode('manual');
simulation.setPaused(false);

assert(CONTROLLER_STATIONS.join(',') === 'supervisor,approach,tower,ground,ramp', 'controller station roster is incomplete');
assert(OPERATIONAL_CONTROLLER_STATIONS.length === 4, 'operational station roster is incomplete');
assert(stationCanIssue('supervisor', 'ramp') && stationCanIssue('tower', 'tower') && !stationCanIssue('ground', 'tower'), 'station authority matrix is incorrect');

const sample = structuredClone(simulation.state.flights[0]);
sample.phase = 'approach';
sample.flightPlan.direction = 'arrival';
sample.navigation.frequencyOwner = 'tower';
assert(controllerStationIsAhead(sample, 'tower', 'approach'), 'accepted early arrival handoff was not recognized as downstream');
sample.phase = 'taxi-out';
sample.flightPlan.direction = 'departure';
assert(!controllerStationIsAhead(sample, 'tower', 'approach'), 'departure sequence treated Tower as downstream of Approach');
sample.phase = 'approach';
sample.flightPlan.direction = 'arrival';
sample.navigation.frequencyOwner = 'approach';
sample.progress = 0.25;
assert(requiredControllerStation(sample) === 'approach', 'arrival outside final was not assigned to Approach');
sample.progress = 0.74;
assert(requiredControllerStation(sample) === 'tower', 'arrival on final was not assigned to Tower');
sample.phase = 'landing';
assert(requiredControllerStation(sample) === 'tower', 'landing aircraft was not assigned to Tower');
sample.phase = 'taxi-in';
sample.progress = 0.4;
sample.rampControlZoneId = undefined;
sample.pendingCrossingCount = 0;
assert(requiredControllerStation(sample) === 'ground', 'movement-area arrival was not assigned to Ground');
sample.progress = 0.9;
sample.pendingCrossingCount = 1;
assert(requiredControllerStation(sample) === 'ground', 'arrival with a remaining runway crossing was handed to Ramp');
assert(!controllerStationIsAhead(sample, 'ramp', 'ground'), 'Ramp retained an amended arrival that still needed Ground crossing authority');
sample.pendingCrossingCount = 0;
assert(requiredControllerStation(sample) === 'ramp', 'ramp-bound arrival was not assigned to Ramp');
sample.phase = 'resting';
assert(requiredControllerStation(sample) === 'ramp', 'aircraft at a stand was not assigned to Ramp');
sample.phase = 'taxi-out';
sample.progress = 0.01;
sample.tugAttached = true;
assert(requiredControllerStation(sample) === 'ramp', 'pushback aircraft was not assigned to Ramp');
sample.tugAttached = false;
sample.progress = 0.5;
assert(requiredControllerStation(sample) === 'ground', 'outbound movement-area aircraft was not assigned to Ground');
sample.progress = 0.99;
assert(requiredControllerStation(sample) === 'tower', 'hold-short departure was not assigned to Tower');
sample.phase = 'takeoff';
sample.motion.onGround = false;
assert(requiredControllerStation(sample) === 'approach', 'airborne departure was not assigned to Approach');

simulation.setStation('ground');
assert(simulation.state.station === 'ground', 'Ground station selection failed');
for (const station of OPERATIONAL_CONTROLLER_STATIONS) {
  assert(simulation.state.stationAutomation[station] === (station !== 'ground'), 'single-position automation did not staff every unselected desk');
}
assert(simulation.canIssue('ground') && !simulation.canIssue('ramp'), 'selected Ground desk did not retain exclusive human authority');
assert(!simulation.setStationAutomation('tower', false), 'non-supervisor changed station automation');

const arrival = simulation.state.flights[0];
assert(arrival, 'controller validation requires an initial flight');
arrival.phase = 'approach';
arrival.phaseElapsed = 20;
arrival.duration = 100;
arrival.motion.onGround = false;
arrival.goAround = undefined;
arrival.navigation.hold = undefined;
arrival.flightPlan.direction = 'arrival';
arrival.operationPlan.direction = 'arrival';
arrival.progress = 0.58;
arrival.navigation.frequencyOwner = 'approach';
arrival.navigation.handoff = undefined;
arrival.navigation.handoffStatus = 'owned';
arrival.navigation.approachCleared = false;
simulation.update(1 / 30);
assert(arrival.navigation.handoff === undefined, 'newly automated Approach ignored takeover grace');
for (let tick = 0; tick < 20 && !arrival.navigation.handoff; tick += 1) simulation.update(0.05);
assert(arrival.navigation.frequencyOwner === 'approach' && arrival.navigation.handoff?.status === 'offered' && arrival.navigation.approachCleared, 'automated Approach did not offer the final handoff while retaining ownership');
for (let tick = 0; tick < 80 && arrival.navigation.frequencyOwner !== 'tower'; tick += 1) simulation.update(0.05);
assert(arrival.navigation.frequencyOwner === 'tower' && arrival.navigation.handoff?.status === 'completed', 'automated positions did not stage acceptance and contact');
arrival.progress = 0.74;
arrival.cleared = false;
arrival.navigation.frequencyOwner = 'approach';
arrival.navigation.handoff = undefined;
arrival.navigation.handoffStatus = 'owned';
for (let tick = 0; tick < 80 && arrival.navigation.frequencyOwner !== 'tower'; tick += 1) simulation.update(0.05);
assert(arrival.navigation.frequencyOwner === 'tower' && arrival.cleared, 'automated Tower did not stage the final handoff and clear the arrival');
simulation.setStation('tower');
arrival.progress = 0.2;
arrival.navigation.frequencyOwner = 'tower';
arrival.navigation.handoff = undefined;
arrival.navigation.handoffStatus = 'owned';
simulation.update(1 / 30);
assert(arrival.navigation.frequencyOwner === 'tower', 'automated upstream desk reclaimed a human-accepted early handoff');

simulation.setStation('supervisor');
assert(simulation.setStationAutomation('tower', false), 'Supervisor could not disable Tower automation');
assert(!simulation.state.stationAutomation.tower, 'Tower automation state was not persisted');
const workloads = simulation.controllerWorkloads();
assert(workloads.length === 4 && workloads.every((workload) => workload.responsibilities.length >= 4), 'station workload snapshots are incomplete');
assert(workloads.find((workload) => workload.station === 'tower')?.automated === false, 'workload snapshot lost automation state');

simulation.setMode('assisted');
arrival.phase = 'approach';
arrival.progress = 0.76;
arrival.cleared = false;
arrival.goAround = undefined;
arrival.navigation.hold = undefined;
const landingProposal = simulation.clearanceProposals().find((proposal) => proposal.flightId === arrival.id && proposal.action === 'land');
assert(landingProposal?.station === 'tower', 'landing proposal was not routed to Tower');

const trailing = simulation.state.flights.find((flight) => flight.id !== arrival.id);
assert(trailing, 'ORD needs a second arrival for sequencing advice');
arrival.progress = 0.48;
arrival.runway = trailing.runway;
arrival.navigation.frequencyOwner = 'approach';
trailing.phase = 'approach';
trailing.progress = 0.39;
trailing.goAround = undefined;
trailing.diversion = undefined;
trailing.navigation.hold = undefined;
trailing.navigation.frequencyOwner = 'approach';
trailing.kinematics.airspeedKts = 180;
trailing.navigation.assignedSpeedKts = undefined;
simulation.setStation('approach');
const speedProposal = simulation.clearanceProposals().find((proposal) => proposal.flightId === trailing.id && proposal.action === 'slow');
assert(speedProposal?.station === 'approach' && speedProposal.speedKts && speedProposal.speedKts < trailing.kinematics.airspeedKts, 'Assisted mode did not produce a legal arrival-spacing speed proposal');
assert(simulation.assignAirspeed(trailing.id, speedProposal.speedKts), 'Approach could not apply the proposed legal speed');

// When the sequence is too compressed for speed control alone, Assisted must
// offer a published terminal hold to the trailing arrival.
trailing.progress = 0.44;
arrival.progress = 0.52;
trailing.navigation.hold = undefined;
arrival.navigation.hold = undefined;
trailing.navigation.frequencyOwner = 'approach';
arrival.navigation.frequencyOwner = 'approach';
const holdProposal = simulation.clearanceProposals().find((proposal) => proposal.flightId === trailing.id && proposal.action === 'hold');
assert(holdProposal?.station === 'approach' && holdProposal.patternId && holdProposal.efcMinutes === 3, 'Assisted mode did not produce a timed published hold proposal');
assert(simulation.holdFlight(trailing.id, holdProposal.patternId, holdProposal.efcMinutes), 'Approach could not apply the proposed hold');

// With no sequence leader, an early arrival may be offered a conservative
// direct-to the next published route fix.
const directFlight = simulation.state.flights.find((flight) => flight.id !== trailing.id && flight.id !== arrival.id);
if (directFlight) {
  const publishedFixes = simulation.config.airspaceProgram.fixes.slice(0, 4);
  assert(publishedFixes.length >= 4, 'ORD needs four published fixes for direct-to advice');
  directFlight.navigation.routeFixIds = publishedFixes.map((fix) => fix.id);
  directFlight.navigation.activeFixIndex = 0;
  const directTarget = publishedFixes[2];
  directFlight.phase = 'approach';
  directFlight.progress = 0.28;
  directFlight.navigation.hold = undefined;
  directFlight.navigation.vector = undefined;
  directFlight.navigation.frequencyOwner = 'approach';
  directFlight.motion.heading = Math.atan2(directTarget.position[1] - directFlight.motion.y, directTarget.position[0] - directFlight.motion.x);
  const directProposal = simulation.clearanceProposals().find((proposal) => proposal.flightId === directFlight.id && proposal.action === 'direct-to');
  assert(directProposal?.station === 'approach' && directProposal.fixId === directTarget.id, 'Direct-to proposal was missing its published fix');
  assert(simulation.directFlightTo(directFlight.id, directProposal.fixId), 'Approach could not apply the proposed direct-to');
}

// A published-route vector remains available for an early arrival whose next
// fix needs a modest heading correction.
const vectorFlight = simulation.state.flights.find((flight) => flight.id !== trailing.id && flight.id !== arrival.id && flight.id !== directFlight?.id);
if (vectorFlight) {
  const vectorFixes = simulation.config.airspaceProgram.fixes.slice(0, 2);
  assert(vectorFixes.length >= 2, 'ORD needs two published fixes for vector advice');
  vectorFlight.navigation.routeFixIds = vectorFixes.map((fix) => fix.id);
  vectorFlight.navigation.activeFixIndex = 0;
  vectorFlight.phase = 'approach';
  vectorFlight.progress = 0.28;
  vectorFlight.navigation.hold = undefined;
  vectorFlight.navigation.vector = undefined;
  vectorFlight.navigation.frequencyOwner = 'approach';
  const vectorTarget = vectorFixes[1];
  const targetHeading = Math.atan2(vectorTarget.position[1] - vectorFlight.motion.y, vectorTarget.position[0] - vectorFlight.motion.x);
  vectorFlight.motion.heading = targetHeading - (18 * Math.PI / 180);
  const vectorProposal = simulation.clearanceProposals().find((proposal) => proposal.flightId === vectorFlight.id && proposal.action === 'vector');
  assert(vectorProposal?.station === 'approach' && vectorProposal.headingDegrees !== undefined, 'Assisted mode did not produce a published-route vector proposal');
  assert(simulation.assignHeading(vectorFlight.id, vectorProposal.headingDegrees), 'Approach could not apply the proposed vector');
}

// Strategic meter targets may explain and prioritize a legal tactical action,
// but reading proposals must not mutate the flight, slot, or navigation state.
const flowFlights = simulation.state.flights;
const flowState = simulation.state.trafficFlow;
simulation.state.flights = [trailing];
trailing.phase = 'approach';
trailing.progress = 0.35;
trailing.phaseElapsed = trailing.duration * trailing.progress;
trailing.goAround = undefined;
trailing.diversion = undefined;
trailing.navigation.hold = undefined;
trailing.navigation.vector = undefined;
trailing.navigation.frequencyOwner = 'approach';
trailing.navigation.assignedSpeedKts = undefined;
trailing.kinematics.airspeedKts = 180;
const estimatedThresholdSeconds = simulation.state.elapsed + trailing.duration - trailing.phaseElapsed;
const flowEntry = {
  id: 'arrival-flow-advisory-test', direction: 'arrival', status: 'released',
  createdAtSeconds: simulation.state.elapsed, scheduledAtSeconds: simulation.state.elapsed,
  releaseSlotSeconds: simulation.state.elapsed, updatedAtSeconds: simulation.state.elapsed,
  delaySeconds: 0, attempts: 1, reason: 'controller advisory validation',
  constraintCategory: 'schedule', slotRevisions: [], flightId: trailing.id,
  callsign: trailing.callsign, runwayId: trailing.runway,
  meterTargets: [{
    schemaVersion: 1, id: 'arrival-flow-threshold-test', kind: 'runway-threshold',
    label: 'Runway threshold', targetSeconds: estimatedThresholdSeconds + 90,
    toleranceBeforeSeconds: 8, toleranceAfterSeconds: 15, runwayId: trailing.runway,
  }],
};
simulation.state.trafficFlow = { ...flowState, arrivalQueue: [], departureQueue: [], history: [flowEntry] };
const stateBeforeFlowAdvice = JSON.stringify(simulation.state);
const earlyFlowProposals = simulation.clearanceProposals();
assert(JSON.stringify(simulation.state) === stateBeforeFlowAdvice, 'reading flow-linked proposals directly mutated authoritative simulation state');
const earlyFlowProposal = earlyFlowProposals.find((proposal) => proposal.flightId === trailing.id && proposal.action === 'slow');
assert(earlyFlowProposal?.flow?.status === 'early' && earlyFlowProposal.flow.commandArbiterRequired && earlyFlowProposal.flow.targetId === 'arrival-flow-threshold-test', 'early arrival target did not produce an explicit legal speed-reduction proposal: ' + JSON.stringify(earlyFlowProposals));
assert(simulation.assignAirspeed(trailing.id, earlyFlowProposal.speedKts), 'Approach command arbiter rejected the proposed early-slot speed reduction: ' + simulation.lastCommandReason());

trailing.navigation.assignedSpeedKts = undefined;
trailing.kinematics.airspeedKts = 180;
flowEntry.meterTargets[0].targetSeconds = estimatedThresholdSeconds - 40;
const stateBeforeLateAdvice = JSON.stringify(simulation.state);
const lateFlowProposals = simulation.clearanceProposals();
assert(JSON.stringify(simulation.state) === stateBeforeLateAdvice, 'reading late-slot proposals directly mutated authoritative simulation state');
const lateFlowProposal = lateFlowProposals.find((proposal) => proposal.flightId === trailing.id && proposal.action === 'speed');
assert(lateFlowProposal?.flow?.status === 'late' && lateFlowProposal.speedKts > trailing.kinematics.airspeedKts, 'late arrival target did not produce a bounded speed-recovery proposal: ' + JSON.stringify(lateFlowProposals));
assert(simulation.assignAirspeed(trailing.id, lateFlowProposal.speedKts), 'Approach command arbiter rejected the proposed late-slot speed increase: ' + simulation.lastCommandReason());
simulation.state.flights = flowFlights;
simulation.state.trafficFlow = flowState;

// Tower's assisted card must not offer multiple mutually conflicting runway
// movements. A lined-up departure wins over a second aircraft still waiting
// at the same runway's hold-short point.
for (const flight of simulation.state.flights) {
  flight.phase = 'resting';
  flight.motion.onGround = true;
  flight.motion.protectedRunway = false;
  flight.motion.protectedRunwayIds = [];
  flight.motion.x = 500 + flight.id * 10;
  flight.motion.y = 500 + flight.id * 10;
  flight.motion.z = 0;
  flight.surfaceRoute = undefined;
  flight.surfaceRouteEdges = undefined;
  flight.runwayEntryCleared = false;
  flight.takeoffCleared = false;
  flight.cleared = false;
  flight.navigation.frequencyOwner = 'tower';
  flight.navigation.handoff = undefined;
  flight.navigation.handoffStatus = 'owned';
}
const towerLead = simulation.state.flights[0];
const towerFollower = simulation.state.flights[1];
assert(towerLead && towerFollower, 'Tower sequence validation needs two departures');
towerLead.phase = 'takeoff';
towerLead.runwayEntryCleared = true;
towerLead.takeoffCleared = false;
towerLead.progress = 0;
towerLead.motion.x = -120;
towerLead.motion.y = -120;
towerLead.motion.z = 0;
towerFollower.phase = 'taxi-out';
towerFollower.runway = towerLead.runway;
towerFollower.progress = 0.99;
towerFollower.motion.x = 120;
towerFollower.motion.y = 120;
towerFollower.motion.z = 0;
// Keep this synthetic queue follower at its stand; the test is about Tower's
// ordering policy, not the imported ORD geometry that would otherwise place
// its old route across the lead's departure envelope.
towerFollower.surfaceRoute = undefined;
towerFollower.surfaceRouteEdges = undefined;
simulation.state.trafficFlow.history.push({
  id: 'departure-flow-advisory-test', direction: 'departure', status: 'released',
  createdAtSeconds: simulation.state.elapsed, scheduledAtSeconds: simulation.state.elapsed,
  releaseSlotSeconds: simulation.state.elapsed, updatedAtSeconds: simulation.state.elapsed,
  delaySeconds: 0, attempts: 1, reason: 'controller advisory validation',
  constraintCategory: 'schedule', slotRevisions: [], flightId: towerLead.id,
  callsign: towerLead.callsign, runwayId: towerLead.runway,
  meterTargets: [{
    schemaVersion: 1, id: 'departure-release-advisory-test', kind: 'departure-release',
    label: 'Departure release', targetSeconds: simulation.state.elapsed,
    toleranceBeforeSeconds: 5, toleranceAfterSeconds: 10, runwayId: towerLead.runway,
  }],
});
simulation.setStation('tower');
const towerProposals = simulation.clearanceProposals();
if (!towerProposals.some((proposal) => proposal.flightId === towerLead.id && proposal.action === 'takeoff')) {
  simulation.clearTakeoff(towerLead.id);
  throw new Error('Tower advisor omitted the releasable lined-up departure: ' + simulation.lastCommandReason());
}
const towerTakeoffProposal = towerProposals.find((proposal) => proposal.flightId === towerLead.id && proposal.action === 'takeoff');
assert(/departure release|release window|queue position/i.test(towerTakeoffProposal?.reason ?? ''), 'Tower departure proposal omitted its release-window explanation: ' + JSON.stringify(towerTakeoffProposal));
assert(towerTakeoffProposal?.flow?.targetId === 'departure-release-advisory-test' && towerTakeoffProposal.flow.commandArbiterRequired, 'Tower departure proposal omitted its authoritative release target: ' + JSON.stringify(towerTakeoffProposal));
assert(!towerProposals.some((proposal) => proposal.flightId === towerFollower.id && proposal.action === 'line-up'), 'Tower advisor offered a conflicting second runway movement');

const syntheticWorkloads = controllerWorkloadSnapshots([sample], createStationAutomation(true));
assert(syntheticWorkloads.reduce((sum, workload) => sum + workload.phaseRelevantFlights, 0) === 1, 'one aircraft appeared in multiple station workload queues');

console.log(JSON.stringify({
  stations: CONTROLLER_STATIONS.length,
  operationalStations: OPERATIONAL_CONTROLLER_STATIONS.length,
  authorityChecks: 6,
  phaseOwnershipChecks: 10,
  automationChecks: 10,
  workloadChecks: workloads.length,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "controller-operations-validation.ts",
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
  throw new Error("Controller operations validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

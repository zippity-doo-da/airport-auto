import { build } from "esbuild";

const validationSource = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import { digitalClearanceSnapshot } from './src/simulation/digitalClearances.ts';
import { sampleFlightTrajectory } from './src/simulation/flightTrajectory.ts';
import { syncFlightMotion } from './src/simulation/flightMotion.ts';
import { surfaceRouteForFlight } from './src/simulation/surfaceGraph.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isolatedSimulation() {
  const config = generateHubConfig(0);
  const simulation = new AirportSimulation(config, 'busy');
  simulation.setMode('auto');
  const initialFlights = simulation.state.flights.map((candidate) => ({
    id: candidate.id,
    phase: candidate.phase,
    standId: candidate.standId,
    aircraft: candidate.aircraft,
  }));
  for (let tick = 0; tick < 3_000 && !simulation.state.flights.some((candidate) => candidate.phase === 'approach'); tick += 1) simulation.update(0.1);
  const flight = simulation.state.flights.find((candidate) => candidate.phase === 'approach');
  assert(flight, 'ATC command validation requires an initial arrival: ' + JSON.stringify({
    code: config.code,
    scope: config.scope,
    trafficCap: config.trafficCap,
    initialFlights,
    elapsed: simulation.state.elapsed,
    flights: simulation.state.flights.map((candidate) => ({
      id: candidate.id,
      phase: candidate.phase,
      progress: candidate.progress,
      automaticHoldReason: candidate.automaticHoldReason,
      safetyHoldReason: candidate.safetyHoldReason,
    })),
    flow: simulation.state.trafficFlow,
  }));
  simulation.state.flights = [flight];
  simulation.setMode('manual');
  simulation.setStation('supervisor');
  simulation.drainEvents();
  return { config, simulation, flight };
}

const routeFixture = isolatedSimulation();
const routeFlight = routeFixture.flight;
routeFlight.progress = 0.18;
routeFlight.phaseElapsed = routeFlight.duration * routeFlight.progress;
routeFlight.goAround = undefined;
routeFlight.diversion = undefined;
routeFlight.navigation.hold = undefined;
routeFlight.navigation.frequencyOwner = 'approach';
syncFlightMotion(routeFixture.config, routeFlight);
const procedure = routeFixture.config.airspaceProgram.procedures.find((candidate) => candidate.id === routeFlight.navigation.procedureId);
assert(procedure?.kind === 'STAR', 'arrival lost its assigned STAR');
const amendedFixIds = Array.from({ length: Math.max(1, procedure.commonFixIds.length - 2) }, (_, index) => procedure.commonFixIds.slice(index))
  .filter((fixIds) => fixIds.length >= 3)
  .sort((first, second) => {
    const turn = (fixIds) => {
      const fix = routeFixture.config.airspaceProgram.fixes.find((candidate) => candidate.id === fixIds[0]);
      const heading = Math.atan2(fix.position[1] - routeFlight.motion.y, fix.position[0] - routeFlight.motion.x);
      return Math.abs(Math.atan2(Math.sin(heading - routeFlight.motion.heading), Math.cos(heading - routeFlight.motion.heading)));
    };
    return turn(first) - turn(second);
  })[0];
const originalRevision = routeFlight.flightPlan.revision;
const originalRoute = routeFlight.navigation.routeFixIds.join(',');
assert(routeFixture.simulation.previewFlightRoute(routeFlight.id, amendedFixIds), 'valid terminal route preview was rejected: ' + routeFixture.simulation.lastCommandReason());
assert(routeFlight.navigation.routeClearance?.status === 'preview', 'route preview did not create explicit preview state');
assert(routeFlight.navigation.routeClearance.safeToIssue && routeFlight.navigation.routeClearance.warnings.length === 0, 'isolated route preview unexpectedly reported a conflict: ' + JSON.stringify(routeFlight.navigation.routeClearance.warnings));
assert(routeFlight.navigation.routeFixIds.join(',') === originalRoute, 'route preview mutated the authoritative route');
assert(routeFixture.simulation.issueFlightRoute(routeFlight.id), 'safe route preview could not be issued: ' + routeFixture.simulation.lastCommandReason());
assert(routeFlight.navigation.routeClearance?.status === 'sent' && routeFlight.navigation.readbackStatus === 'sent', 'issued route skipped the Sent transport state');
assert(routeFlight.navigation.routeClearance.deliveryDueSeconds > routeFlight.navigation.routeClearance.issuedAtSeconds, 'sent route omitted its delivery target');
assert(routeFlight.navigation.routeFixIds.join(',') === originalRoute, 'sent route mutated the authoritative route');
assert(!routeFixture.simulation.acceptRouteReadback(routeFlight.id), 'a route readback was accepted before delivery');
assert(routeFixture.simulation.lastCommandReason().includes('not been delivered'), 'pre-delivery readback rejection was not explicit');
for (let tick = 0; tick < 10 && routeFlight.navigation.routeClearance?.status === 'sent'; tick += 1) routeFixture.simulation.update(0.1);
assert(routeFlight.navigation.routeClearance?.status === 'pending-readback' && routeFlight.navigation.readbackStatus === 'pending', 'sent route did not enter Delivered/pending-readback state');
assert(routeFlight.navigation.routeClearance.deliveredAtSeconds >= routeFlight.navigation.routeClearance.deliveryDueSeconds, 'delivery transition omitted its authoritative time');
assert(routeFixture.simulation.drainEvents().some((event) => event.type === 'route-clearance-delivered'), 'delivery transition omitted its typed lifecycle event');
assert(routeFlight.navigation.routeFixIds.join(',') === originalRoute, 'delivered pending readback mutated the authoritative route');
const routeDeliveryPose = { ...routeFlight.motion };
assert(!routeFixture.simulation.acceptRouteReadback(routeFlight.id), 'Supervisor consumed a pilot readback owned by Approach');
routeFixture.simulation.setStation('approach');
assert(routeFixture.simulation.acceptRouteReadback(routeFlight.id), 'valid route readback was rejected: ' + routeFixture.simulation.lastCommandReason());
assert(routeFlight.navigation.routeFixIds.join(',') === amendedFixIds.join(','), 'accepted route amendment did not become authoritative navigation state');
assert(routeFlight.navigation.routeClearance?.status === 'accepted' && routeFlight.navigation.readbackStatus === 'accepted', 'accepted route did not preserve explicit readback state');
assert(routeFlight.flightPlan.revision === originalRevision + 1 && routeFlight.flightPlan.amendments.at(-1)?.kind === 'route-change', 'route amendment was not recorded in the flight plan');
const routeStartSample = sampleFlightTrajectory(routeFixture.config, routeFlight, routeFlight.progress);
assert(routeStartSample && Math.hypot(routeStartSample.x - routeDeliveryPose.x, routeStartSample.y - routeDeliveryPose.y) < 0.01, 'route amendment teleported the aircraft instead of bridging from its current pose');
assert(!routeFixture.simulation.amendFlightRoute(routeFlight.id, [...amendedFixIds.slice(0, -1), routeFixture.config.airspaceProgram.fixes.find((fix) => fix.kind === 'entry').id]), 'arrival route without the assigned final fix was accepted');
const automaticRevision = routeFlight.flightPlan.revision;
assert(routeFixture.simulation.previewFlightRoute(routeFlight.id, amendedFixIds), 'automatic readback fixture could not preview its route');
assert(routeFixture.simulation.issueFlightRoute(routeFlight.id), 'automatic readback fixture could not issue its route');
for (let tick = 0; tick < 40 && ['sent', 'pending-readback'].includes(routeFlight.navigation.routeClearance?.status); tick += 1) routeFixture.simulation.update(0.1);
assert(routeFlight.navigation.routeClearance?.status === 'accepted' && routeFlight.flightPlan.revision >= automaticRevision, 'deterministic pilot readback did not automatically accept the safe route');
assert(routeFixture.simulation.previewFlightRoute(routeFlight.id, routeFlight.navigation.routeFixIds), 'superseded-readback fixture could not preview its current route');
assert(routeFixture.simulation.issueFlightRoute(routeFlight.id), 'superseded-readback fixture could not issue its route');
const directFixId = routeFlight.navigation.routeFixIds[0];
const directEventCursor = routeFixture.simulation.eventCursor();
assert(routeFixture.simulation.directFlightTo(routeFlight.id, directFixId), 'direct-to command could not supersede a pending readback');
routeFixture.simulation.tagEventsSince(directEventCursor, 'cmd-validator-direct');
assert(routeFlight.navigation.routeClearance?.status === 'cancelled', 'direct-to did not cancel the superseded route readback');
const directMessage = digitalClearanceSnapshot(routeFixture.simulation.state).messages.find((message) => message.kind === 'direct-to');
assert(directMessage?.commandId === 'cmd-validator-direct' && directMessage.causalEventIds.length === 1 && directMessage.capability.channel === 'voice', 'direct-to instruction omitted its voice/action command and event evidence');
for (let tick = 0; tick < 40; tick += 1) routeFixture.simulation.update(0.1);
assert(routeFlight.navigation.routeClearance?.status === 'cancelled', 'cancelled route readback was later auto-accepted');
const supersededReadback = routeFlight.navigation.routeClearance.status;
const timeoutRevision = routeFlight.flightPlan.revision;
const timeoutRoute = routeFlight.navigation.routeFixIds.join(',');
assert(routeFixture.simulation.previewFlightRoute(routeFlight.id, routeFlight.navigation.routeFixIds), 'timeout fixture could not preview its current route');
assert(routeFixture.simulation.issueFlightRoute(routeFlight.id), 'timeout fixture could not issue its route');
routeFlight.navigation.routeClearance.readbackDueSeconds = routeFlight.navigation.routeClearance.readbackExpiresSeconds + 1;
routeFlight.navigation.routeClearance.deliveryDueSeconds = routeFlight.navigation.routeClearance.readbackExpiresSeconds + 1;
for (let tick = 0; tick < 100 && ['sent', 'pending-readback'].includes(routeFlight.navigation.routeClearance?.status); tick += 1) routeFixture.simulation.update(0.1);
assert(routeFlight.navigation.routeClearance?.status === 'timed-out' && routeFlight.navigation.readbackStatus === 'timed-out', 'route-only readback did not time out at its hard deadline');
assert(routeFlight.flightPlan.revision === timeoutRevision && routeFlight.navigation.routeFixIds.join(',') === timeoutRoute, 'timed-out route-only instruction changed authoritative navigation');

const immediateFixture = isolatedSimulation();
const immediateFlight = immediateFixture.flight;
immediateFlight.progress = 0.2;
immediateFlight.phaseElapsed = immediateFlight.duration * immediateFlight.progress;
immediateFlight.navigation.frequencyOwner = 'approach';
syncFlightMotion(immediateFixture.config, immediateFlight);
let immediateCursor = immediateFixture.simulation.eventCursor();
assert(immediateFixture.simulation.assignHeading(immediateFlight.id, 180), 'immediate heading instruction was rejected: ' + immediateFixture.simulation.lastCommandReason());
immediateFixture.simulation.tagEventsSince(immediateCursor, 'cmd-validator-heading');
immediateCursor = immediateFixture.simulation.eventCursor();
assert(immediateFixture.simulation.assignAltitude(immediateFlight.id, 1500), 'immediate altitude instruction was rejected: ' + immediateFixture.simulation.lastCommandReason());
immediateFixture.simulation.tagEventsSince(immediateCursor, 'cmd-validator-altitude');
immediateCursor = immediateFixture.simulation.eventCursor();
const immediateSpeed = Math.max(aircraftProfile(immediateFlight.aircraft).approachKts, 145);
assert(immediateFixture.simulation.assignAirspeed(immediateFlight.id, immediateSpeed), 'immediate speed instruction was rejected: ' + immediateFixture.simulation.lastCommandReason());
immediateFixture.simulation.tagEventsSince(immediateCursor, 'cmd-validator-speed');
let immediateMessages = digitalClearanceSnapshot(immediateFixture.simulation.state).messages;
for (const [kind, commandId] of [['vector', 'cmd-validator-heading'], ['altitude', 'cmd-validator-altitude'], ['speed', 'cmd-validator-speed']]) {
  const message = immediateMessages.find((candidate) => candidate.kind === kind);
  assert(message?.commandId === commandId && message.causalEventIds.length === 1 && message.causalEventIds[0].includes(':instruction:'), kind + ' instruction omitted deterministic voice/action causality');
}
immediateCursor = immediateFixture.simulation.eventCursor();
assert(immediateFixture.simulation.holdFlight(immediateFlight.id), 'immediate hold instruction was rejected: ' + immediateFixture.simulation.lastCommandReason());
immediateFixture.simulation.tagEventsSince(immediateCursor, 'cmd-validator-hold');
immediateMessages = digitalClearanceSnapshot(immediateFixture.simulation.state).messages;
const holdMessage = immediateMessages.find((message) => message.kind === 'hold');
assert(holdMessage?.commandId === 'cmd-validator-hold' && holdMessage.causalEventIds.length === 1 && holdMessage.detail.includes(immediateFlight.callsign), 'hold instruction omitted command evidence or explicit phraseology');

const urgentFixture = isolatedSimulation();
const urgentFlight = urgentFixture.flight;
urgentFlight.progress = 0.22;
urgentFlight.phaseElapsed = urgentFlight.duration * urgentFlight.progress;
urgentFlight.goAround = undefined;
urgentFlight.diversion = undefined;
urgentFlight.navigation.hold = undefined;
urgentFlight.navigation.frequencyOwner = 'approach';
syncFlightMotion(urgentFixture.config, urgentFlight);
const urgentRoute = urgentFlight.navigation.routeFixIds.join(',');
let urgentRevision = urgentFlight.flightPlan.revision;
assert(urgentFixture.simulation.previewFlightRoute(urgentFlight.id, amendedFixIds), 'urgent-action fixture could not preview its route');
assert(urgentFixture.simulation.issueFlightRoute(urgentFlight.id), 'urgent-action fixture could not transmit its route: ' + urgentFixture.simulation.lastCommandReason());
assert(urgentFlight.navigation.routeClearance?.status === 'sent', 'urgent-action fixture skipped the Sent state');
assert(urgentFixture.simulation.assignAltitude(urgentFlight.id, 1800), 'go-around fixture altitude instruction was rejected');
assert(urgentFixture.simulation.assignAirspeed(urgentFlight.id, Math.max(aircraftProfile(urgentFlight.aircraft).approachKts, 145)), 'go-around fixture speed instruction was rejected');
urgentRevision = urgentFlight.flightPlan.revision;
const goAroundEventCursor = urgentFixture.simulation.eventCursor();
assert(urgentFixture.simulation.triggerEmergency(urgentFlight.id, 'go-around'), 'go-around did not bypass the pending Data Comm transmission: ' + urgentFixture.simulation.lastCommandReason());
urgentFixture.simulation.tagEventsSince(goAroundEventCursor, 'cmd-validator-go-around');
assert(urgentFlight.goAround && urgentFlight.navigation.routeClearance?.status === 'cancelled' && urgentFlight.navigation.readbackStatus === 'not-required', 'go-around did not synchronously supersede the pending Data Comm route');
assert(urgentFlight.navigation.assignedAltitudeFt === undefined && urgentFlight.navigation.assignedSpeedKts === undefined, 'go-around retained stale speed or altitude restrictions over the missed-approach profile');
assert(urgentFlight.navigation.routeFixIds.join(',') === urgentRoute && urgentFlight.flightPlan.revision === urgentRevision, 'urgent go-around partially applied the superseded route');
const urgentEvents = urgentFixture.simulation.drainEvents();
const cancelledIndex = urgentEvents.findIndex((event) => event.type === 'route-clearance-cancelled');
const goAroundIndex = urgentEvents.findIndex((event) => event.type === 'go-around');
const emergencyIndex = urgentEvents.findIndex((event) => event.type === 'emergency');
assert(cancelledIndex >= 0 && goAroundIndex > cancelledIndex && emergencyIndex > goAroundIndex, 'urgent action did not emit an ordered cancellation, go-around, and emergency event chain');
const goAroundMessage = digitalClearanceSnapshot(urgentFixture.simulation.state).messages.find((message) => message.kind === 'go-around');
assert(goAroundMessage?.commandId === 'cmd-validator-go-around' && goAroundMessage.causalEventIds.length === 2 && goAroundMessage.warningCount === 1, 'go-around omitted its urgent voice/action command and event chain');
for (let tick = 0; tick < 40; tick += 1) urgentFixture.simulation.update(0.1);
assert(urgentFlight.navigation.routeClearance?.status === 'cancelled' && urgentFlight.flightPlan.revision === urgentRevision, 'superseded Data Comm route applied after the immediate go-around');

const conflictFixture = isolatedSimulation();
const conflictFlight = conflictFixture.flight;
conflictFlight.progress = 0.18;
conflictFlight.phaseElapsed = conflictFlight.duration * conflictFlight.progress;
conflictFlight.navigation.frequencyOwner = 'approach';
syncFlightMotion(conflictFixture.config, conflictFlight);
const conflictProcedure = conflictFixture.config.airspaceProgram.procedures.find((candidate) => candidate.id === conflictFlight.navigation.procedureId);
const conflictTransition = conflictProcedure.transitions.find((transition) => !transition.fixIds.every((fixId, index) => conflictFlight.navigation.routeFixIds[index] === fixId)) ?? conflictProcedure.transitions[0];
const conflictFixIds = [...conflictTransition.fixIds, ...conflictProcedure.commonFixIds];
const conflictingTraffic = structuredClone(conflictFlight);
conflictingTraffic.id += 10_000;
conflictingTraffic.callsign = 'CONFLICT 1';
conflictFixture.simulation.state.flights.push(conflictingTraffic);
assert(conflictFixture.simulation.previewFlightRoute(conflictFlight.id, conflictFixIds), 'conflicted route could not be previewed');
assert(!conflictFlight.navigation.routeClearance?.safeToIssue, 'immediate predicted loss of separation was not marked blocking');
assert(conflictFlight.navigation.routeClearance.warnings.some((warning) => warning.code === 'predicted-loss-of-separation' && warning.severity === 'blocking'), 'route preview omitted the conflicting aircraft warning');
assert(!conflictFixture.simulation.issueFlightRoute(conflictFlight.id), 'blocking route preview was issued');

const surfaceFixture = isolatedSimulation();
const surfaceFlight = surfaceFixture.flight;
const profile = aircraftProfile(surfaceFlight.aircraft);
const surfaceRoute = surfaceRouteForFlight(
  surfaceFixture.config.surfaceGraph,
  surfaceFlight.runway,
  surfaceFlight.operatingEnd,
  'taxi-in',
  surfaceFlight.gateSlot,
  { wingspanM: profile.wingspanM, minimumWingtipClearanceM: profile.minimumWingtipClearanceM },
  undefined,
  surfaceFlight.runwayExit?.nodeId,
);
assert(surfaceRoute && surfaceRoute.edgeIds.length >= 2, 'could not construct the taxi command fixture');
surfaceFlight.phase = 'taxi-in';
surfaceFlight.progress = 0.2;
surfaceFlight.phaseElapsed = 0;
surfaceFlight.duration = 120;
surfaceFlight.surfaceRoute = [...surfaceRoute.nodeIds];
surfaceFlight.surfaceRouteEdges = [...surfaceRoute.edgeIds];
surfaceFlight.navigation.frequencyOwner = 'ground';
surfaceFlight.kinematics.groundSpeedKts = 12;
surfaceFlight.kinematics.airspeedKts = 12;
syncFlightMotion(surfaceFixture.config, surfaceFlight);
const preAmendPosition = { x: surfaceFlight.motion.x, y: surfaceFlight.motion.y };
const taxiEventCursor = surfaceFixture.simulation.eventCursor();
assert(surfaceFixture.simulation.assignTaxiRoute(surfaceFlight.id, []), 'safe taxi route refresh was rejected: ' + surfaceFixture.simulation.lastCommandReason());
surfaceFixture.simulation.tagEventsSince(taxiEventCursor, 'cmd-validator-taxi');
const taxiInstruction = surfaceFlight.surfaceInstructions?.find((instruction) => instruction.kind === 'taxi');
assert(taxiInstruction?.commandId === undefined, 'surface instruction leaked evidence fields onto its outer record');
assert(taxiInstruction?.evidence.commandId === 'cmd-validator-taxi' && taxiInstruction.evidence.causalEventIds.length === 1, 'taxi instruction omitted command/event causality');
assert(surfaceFlight.surfaceRouteEdges.length > 0 && surfaceFlight.requiredCrossings, 'taxi route amendment lost route or crossing authority state');
assert(Math.hypot(surfaceFlight.motion.x - preAmendPosition.x, surfaceFlight.motion.y - preAmendPosition.y) < 0.02, 'taxi route amendment teleported the aircraft');
assert(!surfaceFixture.simulation.assignTaxiRoute(surfaceFlight.id, ['NOT-A-SURFACE-NODE']), 'unknown surface via node was accepted');
assert(surfaceFixture.simulation.holdPosition(surfaceFlight.id), 'explicit hold-position command was rejected');
const speedBeforeBrake = surfaceFlight.kinematics.groundSpeedKts;
surfaceFixture.simulation.update(0.1);
assert(surfaceFlight.controlHold && surfaceFlight.kinematics.groundSpeedKts < speedBeforeBrake && surfaceFlight.kinematics.groundSpeedKts > 0, 'hold position did not use continuous normal braking');
assert(surfaceFixture.simulation.resumeTaxi(surfaceFlight.id), 'explicit resume-taxi command was rejected');
assert(!surfaceFlight.controlHold, 'resume taxi did not release the controller hold');

surfaceFlight.kinematics.groundSpeedKts = 12;
surfaceFlight.kinematics.airspeedKts = 12;
const urgentStopStartProgress = surfaceFlight.progress;
let eventCursor = surfaceFixture.simulation.eventCursor();
assert(surfaceFixture.simulation.stopTaxi(surfaceFlight.id, 'crossing traffic'), 'urgent ground-stop command was rejected: ' + surfaceFixture.simulation.lastCommandReason());
surfaceFixture.simulation.tagEventsSince(eventCursor, 'cmd-validator-ground-stop');
assert(surfaceFlight.controlHold && surfaceFlight.groundStop?.phraseology.startsWith('STOP IMMEDIATELY'), 'urgent stop did not create explicit voice phraseology');
assert(surfaceFlight.groundStop.targetDecelerationMps2 > profile.taxiBrakingMps2, 'urgent stop did not request stronger-than-normal taxi braking');
assert(surfaceFlight.groundStop.commandId === 'cmd-validator-ground-stop' && surfaceFlight.groundStop.causalEventIds.length === 1, 'urgent stop omitted command/event causality');
surfaceFixture.simulation.update(0.1);
assert(surfaceFlight.kinematics.groundSpeedKts < 12 && surfaceFlight.kinematics.groundSpeedKts > 0, 'urgent ground stop was not continuous physical braking');
for (let tick = 0; tick < 500 && surfaceFlight.groundStop?.stoppedAtSeconds === undefined; tick += 1) surfaceFixture.simulation.update(0.1);
assert(surfaceFlight.groundStop?.stoppedAtSeconds !== undefined && surfaceFlight.kinematics.groundSpeedKts <= 0.05, 'urgent ground stop did not reach a stopped state');
assert(surfaceFlight.progress > urgentStopStartProgress, 'urgent ground stop stopped instantaneously without forward braking distance');
let stopMessage = digitalClearanceSnapshot(surfaceFixture.simulation.state).messages.find((message) => message.kind === 'ground-stop');
assert(stopMessage?.status === 'standby' && stopMessage.capability.channel === 'voice' && stopMessage.capability.responseMode === 'voice-action', 'urgent stop was not projected as an active voice/action record');
assert(stopMessage.commandId === 'cmd-validator-ground-stop' && stopMessage.causalEventIds.length >= 2 && stopMessage.parameters.stopped === 'yes', 'urgent stop projection omitted its lifecycle evidence');
eventCursor = surfaceFixture.simulation.eventCursor();
assert(surfaceFixture.simulation.resumeTaxi(surfaceFlight.id), 'urgent ground stop could not be released');
surfaceFixture.simulation.tagEventsSince(eventCursor, 'cmd-validator-ground-resume');
stopMessage = digitalClearanceSnapshot(surfaceFixture.simulation.state).messages.find((message) => message.kind === 'ground-stop');
assert(stopMessage?.status === 'wilco' && stopMessage.response.commandId === 'cmd-validator-ground-resume', 'ground-stop release omitted its command response');
assert(stopMessage.causalEventIds.length >= 3 && surfaceFlight.groundStop?.releasedAtSeconds !== undefined, 'ground-stop release omitted its causal event');
const groundStopEvents = surfaceFixture.simulation.drainEvents().filter((event) => event.type.startsWith('ground-stop'));
assert(groundStopEvents.map((event) => event.type).join(',') === 'ground-stop,ground-stop-complete,ground-stop-released', 'ground-stop lifecycle events were not ordered');

const contactFixture = isolatedSimulation();
contactFixture.flight.navigation.frequencyOwner = 'approach';
assert(!contactFixture.simulation.contactFlight(contactFixture.flight.id, 'tower'), 'contact-station bypassed controller coordination');
assert(contactFixture.simulation.offerHandoff(contactFixture.flight.id, 'tower'), 'handoff offer was rejected');
assert(contactFixture.flight.navigation.frequencyOwner === 'approach' && contactFixture.flight.navigation.handoff?.status === 'offered', 'handoff offer transferred ownership before acceptance');
assert(contactFixture.simulation.acceptHandoff(contactFixture.flight.id), 'handoff acceptance was rejected');
assert(contactFixture.flight.navigation.frequencyOwner === 'approach' && contactFixture.flight.navigation.handoff?.status === 'accepted', 'handoff acceptance transferred ownership before contact');
assert(contactFixture.simulation.contactFlight(contactFixture.flight.id, 'tower'), 'accepted contact-station command was rejected');
assert(contactFixture.flight.navigation.frequencyOwner === 'tower', 'contact-station command did not transfer frequency ownership');
assert(contactFixture.simulation.drainEvents().some((event) => event.type === 'contact'), 'contact-station command emitted no typed event');

const departureFixture = isolatedSimulation();
const departureFlight = departureFixture.flight;
departureFlight.phase = 'takeoff';
departureFlight.progress = 0.76;
departureFlight.phaseElapsed = departureFlight.duration * departureFlight.progress;
departureFlight.takeoffCleared = true;
departureFlight.runwayEntryCleared = true;
departureFlight.navigation.frequencyOwner = 'approach';
syncFlightMotion(departureFixture.config, departureFlight);
const departureStart = { ...departureFlight.motion };
const amendedHeading = ((90 - departureStart.heading * 180 / Math.PI) + 25 + 360) % 360;
assert(departureFixture.simulation.assignHeading(departureFlight.id, amendedHeading), 'airborne departure heading was rejected: ' + departureFixture.simulation.lastCommandReason());
assert(Math.abs(departureFlight.navigation.departureHeadingDegrees - amendedHeading) < 0.01, 'departure heading did not reach the authoritative climb path');
const departureVectorStart = sampleFlightTrajectory(departureFixture.config, departureFlight, departureFlight.progress);
assert(departureVectorStart && Math.hypot(departureVectorStart.x - departureStart.x, departureVectorStart.y - departureStart.y) < 0.02, 'departure vector teleported at command acceptance');

const diversionFixture = isolatedSimulation();
const diversionFlight = diversionFixture.flight;
diversionFlight.progress = 0.34;
diversionFlight.phaseElapsed = diversionFlight.duration * diversionFlight.progress;
diversionFlight.navigation.frequencyOwner = 'approach';
syncFlightMotion(diversionFixture.config, diversionFlight);
const diversionStart = { ...diversionFlight.motion };
assert(diversionFixture.simulation.divertFlight(diversionFlight.id, diversionFlight.origin, undefined, 'validation alternate'), 'valid diversion was rejected: ' + diversionFixture.simulation.lastCommandReason());
assert(diversionFlight.flightPlan.status === 'diverted' && diversionFlight.destination === diversionFlight.origin, 'diversion did not amend destination and plan status');
const diversionStartSample = sampleFlightTrajectory(diversionFixture.config, diversionFlight, 0);
assert(diversionStartSample && Math.hypot(diversionStartSample.x - diversionStart.x, diversionStartSample.y - diversionStart.y) < 0.01, 'diversion teleported at command acceptance');
diversionFixture.simulation.setPace(3);
for (let tick = 0; tick < 12_000 && diversionFixture.simulation.state.flights.includes(diversionFlight); tick += 1) diversionFixture.simulation.update(0.1);
assert(!diversionFixture.simulation.state.flights.includes(diversionFlight), 'diverted aircraft did not fly continuously out of terminal scope');
const diversionEvents = diversionFixture.simulation.drainEvents();
assert(diversionEvents.some((event) => event.type === 'diversion') && diversionEvents.some((event) => event.type === 'divert'), 'diversion did not emit acceptance and scope-exit events');

console.log(JSON.stringify({
  routeFixes: amendedFixIds.length,
  routeReadback: 'accepted',
  deliveryState: 'delivered',
  supersededReadback,
  timedOutReadback: routeFlight.navigation.routeClearance.status,
  urgentGoAround: urgentFlight.navigation.routeClearance.status,
  immediateInstructionKinds: ['vector', 'altitude', 'speed', 'hold', 'direct-to', 'go-around'],
  blockingPreview: conflictFlight.navigation.routeClearance.warnings[0].conflictingCallsign,
  taxiSegments: surfaceFlight.surfaceRouteEdges.length,
  holdUsesContinuousBraking: true,
  urgentGroundStopEvents: groundStopEvents.length,
  contactTransfer: contactFixture.flight.navigation.frequencyOwner,
  departureVector: Math.round(amendedHeading),
  diversionComplete: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "atc-command-vocabulary-validation.ts",
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
  throw new Error("ATC command vocabulary validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

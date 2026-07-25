import { build } from 'esbuild';

const validationSource = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import { sampleFlightTrajectory } from './src/simulation/flightTrajectory.ts';
import { syncFlightMotion } from './src/simulation/flightMotion.ts';
import { surfaceRouteForFlight } from './src/simulation/surfaceGraph.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isolatedSimulation() {
  const config = generateHubConfig(0);
  const simulation = new AirportSimulation(config, 'busy');
  simulation.setMode('manual');
  simulation.setStation('supervisor');
  for (let tick = 0; tick < 3_000 && !simulation.state.flights.some((candidate) => candidate.phase === 'approach'); tick += 1) simulation.update(0.1);
  const flight = simulation.state.flights.find((candidate) => candidate.phase === 'approach');
  assert(flight, 'ATC command validation requires an initial arrival');
  simulation.state.flights = [flight];
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
const routeStart = { ...routeFlight.motion };
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
assert(routeFlight.navigation.routeClearance?.status === 'pending-readback' && routeFlight.navigation.readbackStatus === 'pending', 'issued route did not enter pending-readback state');
assert(routeFlight.navigation.routeFixIds.join(',') === originalRoute, 'pending readback mutated the authoritative route');
assert(routeFixture.simulation.acceptRouteReadback(routeFlight.id), 'valid route readback was rejected: ' + routeFixture.simulation.lastCommandReason());
assert(routeFlight.navigation.routeFixIds.join(',') === amendedFixIds.join(','), 'accepted route amendment did not become authoritative navigation state');
assert(routeFlight.navigation.routeClearance?.status === 'accepted' && routeFlight.navigation.readbackStatus === 'accepted', 'accepted route did not preserve explicit readback state');
assert(routeFlight.flightPlan.revision === originalRevision + 1 && routeFlight.flightPlan.amendments.at(-1)?.kind === 'route-change', 'route amendment was not recorded in the flight plan');
const routeStartSample = sampleFlightTrajectory(routeFixture.config, routeFlight, routeFlight.progress);
assert(routeStartSample && Math.hypot(routeStartSample.x - routeStart.x, routeStartSample.y - routeStart.y) < 0.01, 'route amendment teleported the aircraft instead of bridging from its current pose');
assert(!routeFixture.simulation.amendFlightRoute(routeFlight.id, [...amendedFixIds.slice(0, -1), routeFixture.config.airspaceProgram.fixes.find((fix) => fix.kind === 'entry').id]), 'arrival route without the assigned final fix was accepted');
const automaticRevision = routeFlight.flightPlan.revision;
assert(routeFixture.simulation.previewFlightRoute(routeFlight.id, amendedFixIds), 'automatic readback fixture could not preview its route');
assert(routeFixture.simulation.issueFlightRoute(routeFlight.id), 'automatic readback fixture could not issue its route');
for (let tick = 0; tick < 40 && routeFlight.navigation.routeClearance?.status === 'pending-readback'; tick += 1) routeFixture.simulation.update(0.1);
assert(routeFlight.navigation.routeClearance?.status === 'accepted' && routeFlight.flightPlan.revision === automaticRevision + 1, 'deterministic pilot readback did not automatically accept the safe route');
assert(routeFixture.simulation.previewFlightRoute(routeFlight.id, routeFlight.navigation.routeFixIds), 'superseded-readback fixture could not preview its current route');
assert(routeFixture.simulation.issueFlightRoute(routeFlight.id), 'superseded-readback fixture could not issue its route');
const directFixId = routeFlight.navigation.routeFixIds[0];
assert(routeFixture.simulation.directFlightTo(routeFlight.id, directFixId), 'direct-to command could not supersede a pending readback');
assert(routeFlight.navigation.routeClearance?.status === 'cancelled', 'direct-to did not cancel the superseded route readback');
for (let tick = 0; tick < 40; tick += 1) routeFixture.simulation.update(0.1);
assert(routeFlight.navigation.routeClearance?.status === 'cancelled', 'cancelled route readback was later auto-accepted');

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
assert(surfaceFixture.simulation.assignTaxiRoute(surfaceFlight.id, []), 'safe taxi route refresh was rejected: ' + surfaceFixture.simulation.lastCommandReason());
assert(surfaceFlight.surfaceRouteEdges.length > 0 && surfaceFlight.requiredCrossings, 'taxi route amendment lost route or crossing authority state');
assert(Math.hypot(surfaceFlight.motion.x - preAmendPosition.x, surfaceFlight.motion.y - preAmendPosition.y) < 0.02, 'taxi route amendment teleported the aircraft');
assert(!surfaceFixture.simulation.assignTaxiRoute(surfaceFlight.id, ['NOT-A-SURFACE-NODE']), 'unknown surface via node was accepted');
assert(surfaceFixture.simulation.holdPosition(surfaceFlight.id), 'explicit hold-position command was rejected');
const speedBeforeBrake = surfaceFlight.kinematics.groundSpeedKts;
surfaceFixture.simulation.update(0.1);
assert(surfaceFlight.controlHold && surfaceFlight.kinematics.groundSpeedKts < speedBeforeBrake && surfaceFlight.kinematics.groundSpeedKts > 0, 'hold position did not use continuous normal braking');
assert(surfaceFixture.simulation.resumeTaxi(surfaceFlight.id), 'explicit resume-taxi command was rejected');
assert(!surfaceFlight.controlHold, 'resume taxi did not release the controller hold');

const contactFixture = isolatedSimulation();
contactFixture.flight.navigation.frequencyOwner = 'approach';
assert(contactFixture.simulation.contactFlight(contactFixture.flight.id, 'tower'), 'contact-station command was rejected');
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
  supersededReadback: routeFlight.navigation.routeClearance.status,
  blockingPreview: conflictFlight.navigation.routeClearance.warnings[0].conflictingCallsign,
  taxiSegments: surfaceFlight.surfaceRouteEdges.length,
  holdUsesContinuousBraking: true,
  contactTransfer: contactFixture.flight.navigation.frequencyOwner,
  departureVector: Math.round(amendedHeading),
  diversionComplete: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'atc-command-vocabulary-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('ATC command vocabulary validation bundle was empty.');
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

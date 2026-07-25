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
const alternateTransition = procedure.transitions.find((transition) => !transition.fixIds.every((fixId, index) => routeFlight.navigation.routeFixIds[index] === fixId)) ?? procedure.transitions[0];
const amendedFixIds = [...alternateTransition.fixIds, ...procedure.commonFixIds];
const originalRevision = routeFlight.flightPlan.revision;
assert(routeFixture.simulation.amendFlightRoute(routeFlight.id, amendedFixIds), 'valid terminal route amendment was rejected: ' + routeFixture.simulation.lastCommandReason());
assert(routeFlight.navigation.routeFixIds.join(',') === amendedFixIds.join(','), 'accepted route amendment did not become authoritative navigation state');
assert(routeFlight.flightPlan.revision === originalRevision + 1 && routeFlight.flightPlan.amendments.at(-1)?.kind === 'route-change', 'route amendment was not recorded in the flight plan');
const routeStartSample = sampleFlightTrajectory(routeFixture.config, routeFlight, routeFlight.progress);
assert(routeStartSample && Math.hypot(routeStartSample.x - routeStart.x, routeStartSample.y - routeStart.y) < 0.01, 'route amendment teleported the aircraft instead of bridging from its current pose');
assert(!routeFixture.simulation.amendFlightRoute(routeFlight.id, [...amendedFixIds.slice(0, -1), routeFixture.config.airspaceProgram.fixes.find((fix) => fix.kind === 'entry').id]), 'arrival route without the assigned final fix was accepted');

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

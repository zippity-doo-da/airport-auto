import { build } from "esbuild";

const source = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import { digitalClearanceSnapshot } from './src/simulation/digitalClearances.ts';
import { syncFlightMotion } from './src/simulation/flightMotion.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = generateHubConfig(0, 44_001);
const simulation = new AirportSimulation(config, 'busy');
simulation.setMode('auto');
for (let tick = 0; tick < 3_000 && !simulation.state.flights.some((candidate) => candidate.phase === 'approach'); tick += 1) simulation.update(0.1);
const flight = simulation.state.flights.find((candidate) => candidate.phase === 'approach');
assert(flight, 'compound-clearance validation requires an arrival');
simulation.state.flights = [flight];
simulation.setMode('manual');
simulation.setStation('supervisor');
simulation.drainEvents();
flight.progress = 0.18;
flight.phaseElapsed = flight.duration * flight.progress;
flight.goAround = undefined;
flight.diversion = undefined;
flight.navigation.hold = undefined;
flight.navigation.frequencyOwner = 'approach';
syncFlightMotion(config, flight);

const procedure = config.airspaceProgram.procedures.find((candidate) => candidate.id === flight.navigation.procedureId);
assert(procedure?.kind === 'STAR', 'compound fixture lost its STAR');
const routes = Array.from({ length: Math.max(1, procedure.commonFixIds.length - 2) }, (_, index) => procedure.commonFixIds.slice(index))
  .filter((fixIds) => fixIds.length >= 3)
  .sort((first, second) => {
    const turn = (fixIds) => {
      const fix = config.airspaceProgram.fixes.find((candidate) => candidate.id === fixIds[0]);
      const heading = Math.atan2(fix.position[1] - flight.motion.y, fix.position[0] - flight.motion.x);
      return Math.abs(Math.atan2(Math.sin(heading - flight.motion.heading), Math.cos(heading - flight.motion.heading)));
    };
    return turn(first) - turn(second);
  });
const fixIds = routes[0];
assert(fixIds, 'compound fixture has no compatible amended route');
const targetAltitudeFt = 3_000;
const targetSpeedKts = Math.min(210, Math.max(aircraftProfile(flight.aircraft).approachKts, 180));
const originalRoute = flight.navigation.routeFixIds.join('>');
const originalAltitude = flight.navigation.assignedAltitudeFt;
const originalSpeed = flight.navigation.assignedSpeedKts;

const preview = simulation.previewCompoundFlightRoute(flight.id, fixIds, targetAltitudeFt, targetSpeedKts);
assert(preview?.safeToIssue, 'safe compound preview was rejected: ' + simulation.lastCommandReason());
assert(preview.schemaVersion === 2 && preview.supplements.length === 2 && preview.safeguards.length >= 5, 'compound preview omitted its versioned components or safeguards');
assert(flight.navigation.routeFixIds.join('>') === originalRoute && flight.navigation.assignedAltitudeFt === originalAltitude && flight.navigation.assignedSpeedKts === originalSpeed, 'compound preview mutated an authoritative instruction');
preview.supplements[0] = { kind: 'speed', speedKts: 999 };
assert(flight.navigation.routeClearance.supplements.every((item) => item.kind !== 'speed' || item.speedKts !== 999), 'compound preview result shared mutable state references');
assert(simulation.issueFlightRoute(flight.id), 'normal Issue package action did not reuse the staged compound preview: ' + simulation.lastCommandReason());
assert(flight.navigation.routeClearance?.status === 'pending-readback' && flight.navigation.routeClearance.supplements.length === 2, 'compound package did not enter the existing staged readback');
assert(flight.navigation.routeFixIds.join('>') === originalRoute && flight.navigation.assignedAltitudeFt === originalAltitude && flight.navigation.assignedSpeedKts === originalSpeed, 'pending compound readback partially applied');
let snapshot = digitalClearanceSnapshot(simulation.state);
const delivered = snapshot.messages.find((message) => message.kind === 'compound-clearance');
assert(delivered?.status === 'delivered' && delivered.parameters.altitudeFt === targetAltitudeFt && delivered.parameters.speedKts === targetSpeedKts, 'compound package did not project as one delivered digital message');

simulation.setStation('approach');
assert(simulation.acceptRouteReadback(flight.id), 'safe compound readback was rejected: ' + simulation.lastCommandReason());
assert(flight.navigation.routeFixIds.join('>') === fixIds.join('>') && flight.navigation.assignedAltitudeFt === targetAltitudeFt && flight.navigation.assignedSpeedKts === targetSpeedKts, 'accepted compound package did not apply every component');
assert(flight.navigation.routeClearance?.status === 'accepted', 'compound package did not retain accepted readback state');
snapshot = digitalClearanceSnapshot(simulation.state);
assert(snapshot.messages.filter((message) => message.kind === 'compound-clearance').length === 1, 'accepted package fragmented into duplicate route envelopes');
assert(!snapshot.messages.some((message) => message.kind === 'altitude' || message.kind === 'speed'), 'accepted package duplicated its supplemental instructions');

const acceptedRoute = flight.navigation.routeFixIds.join('>');
const acceptedAltitude = flight.navigation.assignedAltitudeFt;
const acceptedSpeed = flight.navigation.assignedSpeedKts;
assert(simulation.previewCompoundFlightRoute(flight.id, fixIds, 3_500, 190), 'authority-transfer package could not be previewed');
assert(simulation.issueFlightRoute(flight.id), 'authority-transfer package could not be issued');
flight.navigation.frequencyOwner = 'tower';
simulation.update(0.1);
assert(flight.navigation.routeClearance?.status === 'cancelled', 'authority transfer did not cancel the complete pending package');
assert(flight.navigation.routeFixIds.join('>') === acceptedRoute && flight.navigation.assignedAltitudeFt === acceptedAltitude && flight.navigation.assignedSpeedKts === acceptedSpeed, 'cancelled package partially changed an instruction');

flight.navigation.frequencyOwner = 'approach';
simulation.setStation('approach');
assert(simulation.previewCompoundFlightRoute(flight.id, fixIds, 4_000, 195), 'revalidation package could not be previewed');
assert(simulation.issueFlightRoute(flight.id), 'revalidation package could not be issued');
const conflict = structuredClone(flight);
conflict.id += 99_000;
conflict.callsign = 'CONFLICT 99';
conflict.navigation.routeClearance = undefined;
simulation.state.flights.push(conflict);
assert(!simulation.acceptRouteReadback(flight.id), 'package with a new blocking conflict was accepted');
assert(flight.navigation.routeClearance?.status === 'rejected', 'failed final package check did not retain Unable state');
assert(flight.navigation.routeFixIds.join('>') === acceptedRoute && flight.navigation.assignedAltitudeFt === acceptedAltitude && flight.navigation.assignedSpeedKts === acceptedSpeed, 'failed final check partially applied the compound package');

assert(!simulation.previewCompoundFlightRoute(flight.id, fixIds), 'route-only request was accepted by the compound endpoint');
assert(simulation.lastCommandReason().includes('requires altitude or speed'), 'route-only package rejection was not explainable');

console.log(JSON.stringify({
  airport: config.code,
  components: 3,
  accepted: 1,
  cancelled: 1,
  rejectedAtReadback: 1,
  messages: snapshot.messages.length,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: source,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "compound-clearance-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Compound-clearance validation bundle was empty.");
try {
  await import("data:text/javascript;base64," + Buffer.from(bundled).toString("base64"));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

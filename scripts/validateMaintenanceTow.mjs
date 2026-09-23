import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import { sampleAircraftSurfaceMotion } from './src/simulation/surfaceMotion.ts';

function assert(condition, message) { if (!condition) throw new Error(message); }
function advanceUntil(simulation, predicate, description, seconds = 1200) {
  for (let tick = 0; tick < Math.ceil(seconds / 0.05) && !predicate(); tick += 1) {
    simulation.update(0.05);
    const diagnostics = simulation.diagnostics();
    assert(diagnostics.collisions.length === 0, 'maintenance tow produced aircraft collision');
    assert(diagnostics.obstacleCollisions.length === 0, 'maintenance tow left pavement/overlapped scenery');
  }
  const flight = simulation.state.flights[0]; const surface = flight ? sampleAircraftSurfaceMotion(simulation.config.surfaceGraph, flight.surfaceRoute, flight.surfaceRouteEdges, flight.progress, aircraftProfile(flight.aircraft)) : null;
  assert(predicate(), description + ': ' + JSON.stringify({ phase: flight?.phase, progress: flight?.progress, speed: flight?.kinematics.groundSpeedKts, stage: flight?.motion.stage, routeClearanceOk: surface?.routeClearanceOk, speedLimit: surface?.speedLimitKts, automaticHold: flight?.automaticHold, hold: flight?.automaticHoldReason, controlHold: flight?.controlHold, safetyHold: flight?.safetyHold, crossing: flight?.crossingHoldRunway, tow: flight?.maintenanceTow }));
}

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD');
assert(ordIndex >= 0, 'ORD fixture missing');
const simulation = new AirportSimulation(generateHubConfig(ordIndex), 'quiet');
assert(simulation.startSandbox(false), 'sandbox did not start');
simulation.setMode('manual');
simulation.setStation('supervisor');
simulation.setPaused(false);
const runway = simulation.sandboxSnapshot().runwayOptions.find((candidate) => !candidate.closed && (candidate.role === 'departure' || candidate.role === 'mixed'));
assert(runway, 'no departure runway');
assert(simulation.queueSandboxTraffic('departure', 'regional', runway.id, 1), 'departure fixture was rejected');
advanceUntil(simulation, () => simulation.state.flights.length === 1, 'departure did not release');
const flight = simulation.state.flights[0];
const sourceStandId = flight.gateAssignment?.standId;
assert(sourceStandId && flight.phase === 'resting' && flight.turnaround.status === 'ready', 'fixture not ready at stand');
assert(simulation.requestMaintenanceTow(flight.id), 'maintenance tow rejected: ' + simulation.lastCommandReason());
assert(flight.maintenanceTow && flight.phase === 'taxi-out' && flight.tugAttached, 'tow did not establish tugged surface motion');
assert(flight.maintenanceTow.sourceStandId === sourceStandId, 'tow lost source stand identity');
const destinationStandId = flight.maintenanceTow.destinationStandId;
assert(destinationStandId !== sourceStandId, 'tow selected source stand as destination');
advanceUntil(simulation, () => !flight.maintenanceTow, 'maintenance tow did not complete');
assert(flight.phase === 'resting' && flight.gateAssignment?.standId === destinationStandId, 'tow did not arrive at its assigned maintenance stand');
assert(!flight.tugAttached && !flight.pushbackCleared, 'tow did not release tug state at arrival');
assert(simulation.events.some((event) => event.type === 'maintenance-tow' && event.flight.id === flight.id), 'tow dispatch event missing');
assert(simulation.events.some((event) => event.type === 'maintenance-tow-complete' && event.flight.id === flight.id), 'tow completion event missing');

// Auto/Watch must use the same Supervisor-owned command path before an
// out-of-service aircraft can enter its normal departure cycle.
const automatic = new AirportSimulation(generateHubConfig(ordIndex), 'quiet');
assert(automatic.startSandbox(false), 'automatic sandbox did not start');
// Stage at a stand without the auto controller releasing the normal departure
// first, then switch to Auto for the decision under test.
automatic.setMode('manual');
automatic.setStation('supervisor');
automatic.setPaused(false);
assert(automatic.queueSandboxTraffic('departure', 'regional', runway.id, 1), 'automatic departure fixture was rejected');
advanceUntil(automatic, () => automatic.state.flights.length === 1, 'automatic departure did not release');
const automaticFlight = automatic.state.flights[0];
assert(automaticFlight.phase === 'resting' && automaticFlight.turnaround.status === 'ready', 'automatic fixture not ready at stand');
automaticFlight.operationalDetail.maintenanceClass = 'out-of-service-repair';
automaticFlight.operationalDetail.airworthinessStatus = 'maintenance-due';
automatic.setMode('auto');
automatic.update(0.05);
assert(automaticFlight.maintenanceTow && automaticFlight.phase === 'taxi-out' && automaticFlight.tugAttached, 'automatic out-of-service aircraft was not towed before departure: ' + automatic.lastCommandReason());

console.log(JSON.stringify({ airport: 'ORD', flight: flight.callsign, sourceStandId, destinationStandId, maintenanceTow: true }));
`;

const result = await build({ absWorkingDir: process.cwd(), stdin: { contents: validationSource, loader: 'ts', resolveDir: process.cwd(), sourcefile: 'maintenance-tow-validation.ts' }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const source = Buffer.from(result.outputFiles[0].contents).toString('base64');
try { await import('data:text/javascript;base64,' + source); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }

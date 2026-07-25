import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { cloneSandboxState } from './src/simulation/sandboxProgram.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function updateUntil(simulation, predicate, maximumSeconds = 240) {
  const maximumTicks = Math.ceil(maximumSeconds / 0.05);
  for (let tick = 0; tick < maximumTicks && !predicate(); tick += 1) simulation.update(0.05);
  assert(predicate(), 'timed out waiting for sandbox release: ' + simulation.sandboxSnapshot().lastMessage
    + ' | flights=' + simulation.state.flights.map((flight) => flight.callsign + ':' + flight.phase + ':' + flight.progress.toFixed(2) + ':' + flight.runway + ':' + (flight.automaticHoldReason ?? flight.safetyHoldReason ?? 'moving')).join(','));
}

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD');
assert(ordIndex >= 0, 'ORD is not available');
const simulation = new AirportSimulation(generateHubConfig(ordIndex), 'busy');
simulation.setMode('auto');
simulation.setStation('ground');
const pausedBeforeEntry = simulation.state.paused;
const automationBeforeEntry = { ...simulation.state.stationAutomation };
assert(simulation.startSandbox(false), 'clean sandbox did not start');
let snapshot = simulation.sandboxSnapshot();
assert(snapshot.active && snapshot.noScore && !snapshot.backgroundTraffic, 'sandbox mode flags are incorrect');
assert(snapshot.activeAircraftCount === 0 && simulation.state.flights.length === 0, 'clean sandbox did not clear seeded traffic');
assert(simulation.state.paused === pausedBeforeEntry, 'sandbox entry changed pause state');
assert(simulation.state.station === 'ground', 'sandbox entry changed the staffed controller position');
assert(JSON.stringify(simulation.state.stationAutomation) === JSON.stringify(automationBeforeEntry), 'sandbox entry changed unstaffed-desk automation');
assert(snapshot.trafficClasses.length === 5, 'sandbox traffic-class catalog is incomplete');
assert(snapshot.runwayOptions.some((runway) => runway.role === 'arrival' || runway.role === 'mixed'), 'sandbox has no arrival runway choices');
assert(snapshot.runwayOptions.some((runway) => runway.role === 'departure' || runway.role === 'mixed'), 'sandbox has no departure runway choices');

assert(!simulation.queueSandboxTraffic('arrival', 'passenger', null, 0), 'zero-aircraft injection was accepted');
assert(!simulation.queueSandboxTraffic('arrival', 'passenger', null, 9), 'oversized injection was accepted');
const arrivalRunway = snapshot.runwayOptions.find((runway) => !runway.closed && (runway.role === 'arrival' || runway.role === 'mixed'));
assert(arrivalRunway, 'no open arrival runway exists');
assert(simulation.queueSandboxTraffic('arrival', 'passenger', arrivalRunway.id, 1), 'arrival injection was rejected');
updateUntil(simulation, () => simulation.state.sandbox.totals.releasedArrivals === 1);
snapshot = simulation.sandboxSnapshot();
const arrivalIds = snapshot.injections[0].releasedFlightIds;
const injectedArrivals = simulation.state.flights.filter((flight) => arrivalIds.includes(flight.id));
assert(injectedArrivals.length === 1, 'released arrival ID does not identify a live aircraft');
assert(injectedArrivals.every((flight) => flight.runway === arrivalRunway.id), 'requested arrival runway was not respected');
assert(injectedArrivals.every((flight) => flight.operationPlan.trafficClass === 'passenger'), 'requested arrival class was not respected');
assert(snapshot.pendingCount === 0 && snapshot.injections[0].status === 'complete', 'arrival injection did not complete');
assert(simulation.queueSandboxTraffic('arrival', 'passenger', null, 2), 'multi-aircraft arrival injection was rejected');
updateUntil(simulation, () => simulation.state.sandbox.totals.releasedArrivals === 3);
assert(simulation.sandboxSnapshot().injections.some((request) => request.requestedCount === 2 && request.status === 'complete'), 'multi-aircraft arrival injection did not complete');

assert(simulation.clearSandboxTraffic(), 'sandbox board could not be cleared');
assert(simulation.state.flights.length === 0 && simulation.sandboxSnapshot().activeAircraftCount === 0, 'board clear left aircraft behind');
const departureRunway = simulation.sandboxSnapshot().runwayOptions.find((runway) => !runway.closed && (runway.role === 'departure' || runway.role === 'mixed'));
assert(departureRunway, 'no open departure runway exists');
assert(simulation.queueSandboxTraffic('departure', 'regional', departureRunway.id, 2), 'departure injection was rejected');
updateUntil(simulation, () => simulation.state.sandbox.totals.releasedDepartures === 2);
snapshot = simulation.sandboxSnapshot();
const departureRequest = snapshot.injections.find((request) => request.direction === 'departure' && request.status === 'complete');
assert(departureRequest, 'departure injection did not complete');
const injectedDepartures = simulation.state.flights.filter((flight) => departureRequest.releasedFlightIds.includes(flight.id));
assert(injectedDepartures.length === 2, 'released departure IDs do not identify live aircraft');
assert(injectedDepartures.every((flight) => flight.flightPlan.direction === 'departure'), 'injected departure retained an arrival flight plan');
assert(injectedDepartures.every((flight) => flight.departureRunway === departureRunway.id), 'requested departure runway was not respected: expected '
  + departureRunway.id + ', got ' + injectedDepartures.map((flight) => flight.callsign + ':' + flight.departureRunway + ':' + flight.phase).join(','));
assert(injectedDepartures.every((flight) => flight.operationPlan.trafficClass === 'regional'), 'requested departure class was not respected');
assert(injectedDepartures.every((flight) => flight.motion.onGround && flight.kinematics.altitudeFt === 0), 'injected departure was not staged on the ground');

assert(simulation.clearSandboxTraffic(), 'second board clear failed');
const elapsedWithoutDemand = simulation.state.elapsed;
for (let tick = 0; tick < 1_200; tick += 1) simulation.update(0.05);
assert(simulation.state.flights.length === 0, 'background-off sandbox admitted unrequested traffic');
assert(simulation.state.elapsed > elapsedWithoutDemand + 59, 'sandbox authority clock did not advance');
assert(!simulation.state.gameOver, 'no-fail sandbox closed itself');
assert(simulation.setSandboxBackgroundTraffic(true), 'background traffic could not be enabled');
updateUntil(simulation, () => simulation.state.flights.length > 0, 90);
assert(simulation.state.flights.length > 0, 'background demand did not resume');
assert(simulation.setSandboxBackgroundTraffic(false), 'background traffic could not be disabled');

assert(simulation.clearSandboxTraffic(), 'weather-preservation setup could not clear traffic');
simulation.setWeather('rain', Math.PI, 18);
const configurationId = simulation.state.runwayConfigurationId;
assert(simulation.queueSandboxTraffic('arrival', 'auto', null, 4), 'cancellable injection was rejected');
assert(simulation.cancelSandboxInjections(), 'pending injection could not be cancelled');
snapshot = simulation.sandboxSnapshot();
assert(snapshot.pendingCount === 0 && snapshot.totals.cancelled >= 4, 'cancel did not account for all pending aircraft');
assert(simulation.clearSandboxTraffic(), 'final board clear failed');
assert(simulation.state.weather.condition === 'rain' && simulation.state.weather.windSpeed === 18, 'board clear changed weather');
assert(simulation.state.runwayConfigurationId === configurationId, 'board clear changed runway configuration');
assert(!simulation.state.gameOver && simulation.state.sandbox.active, 'sandbox no-fail state did not survive clearing');

const cloned = cloneSandboxState(simulation.state.sandbox);
cloned.totals.requested = 999;
cloned.injections[0].releasedFlightIds.push(999);
assert(simulation.state.sandbox.totals.requested !== 999, 'sandbox clone shares totals');
assert(!simulation.state.sandbox.injections[0].releasedFlightIds.includes(999), 'sandbox clone shares released-flight IDs');

const trainingSimulation = new AirportSimulation(generateHubConfig(ordIndex), 'quiet');
assert(trainingSimulation.startTrainingLesson('arrival-basics'), 'training setup failed');
assert(!trainingSimulation.startSandbox(false), 'sandbox superseded an active training lesson');
const challengeSimulation = new AirportSimulation(generateHubConfig(ordIndex), 'busy');
assert(challengeSimulation.startChallenge('rush-hour'), 'challenge setup failed');
assert(!challengeSimulation.startSandbox(false), 'sandbox superseded an active challenge');

assert(simulation.stopSandbox(), 'sandbox did not stop');
assert(!simulation.state.sandbox.active && !simulation.state.gameOver, 'sandbox exit left a terminal state');
updateUntil(simulation, () => simulation.state.flights.length > 0, 90);

console.log(JSON.stringify({
  airport: 'ORD',
  cleanBoard: true,
  safeArrivalInjection: true,
  groundedDepartureInjection: true,
  backgroundTrafficToggle: true,
  weatherAndConfigurationPreserved: true,
  noScoreNoFail: true,
  lifecycleInterlocks: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "sandbox-program-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Sandbox-program validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

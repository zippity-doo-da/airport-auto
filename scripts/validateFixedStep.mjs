import { build } from 'esbuild';

const validationSource = `
import {
  FixedStepSimulationHarness,
  createHubSimulationHarness,
  createSeededSimulationHarness,
} from './src/simulation/fixedStepHarness.ts';
import { generateAirportConfig } from './src/simulation/airportConfig.ts';
import { surfaceRouteCrossingWindows, surfaceRouteForFlight, surfaceRouteRunwayCrossings } from './src/simulation/surfaceGraph.ts';
import { syncFlightMotion } from './src/simulation/flightMotion.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(operation, message) {
  let threw = false;
  try {
    operation();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(message);
}

function advanceInPattern(harness, totalSeconds, pattern) {
  let advanced = 0;
  let index = 0;
  while (totalSeconds - advanced > 1e-10) {
    const chunk = Math.min(pattern[index % pattern.length], totalSeconds - advanced);
    harness.advanceBy(chunk);
    advanced += chunk;
    index += 1;
  }
}

function canonicalSnapshot(harness) {
  return JSON.stringify(harness.snapshot());
}

const totals = {
  seeds: 0,
  partitionComparisons: 0,
  ticks: 0,
  simulatedMinutes: 0,
  events: 0,
  hubArrivals: 0,
  hubDepartures: 0,
  concurrentSurfaceMovers: 0,
  manualDepartureCleared: false,
  repeatedCrossingClearances: false,
  runwayConfigurationsVerified: false,
  runwayTransitionQueueVerified: false,
  runwayConfigurationSoaks: 0,
  pushbackLifecycleVerified: false,
  assistedPushbackProposalVerified: false,
};

const seeds = [1, 17, 991, 42_424];
const partitionPattern = [1 / 60, 0.031, 0.007, 0.043, 0.0125, 0.025];
for (const seed of seeds) {
  const whole = createSeededSimulationHarness(seed, { stepSeconds: 0.05 });
  const partitioned = createSeededSimulationHarness(seed, { stepSeconds: 0.05 });
  whole.advanceBy(240);
  advanceInPattern(partitioned, 240, partitionPattern);
  assert(canonicalSnapshot(whole) === canonicalSnapshot(partitioned), 'seed ' + seed + ': frame partition changed the fixed-step result');
  const snapshot = whole.snapshot();
  assert(snapshot.tick === 4_800, 'seed ' + seed + ': unexpected tick count');
  assert(snapshot.simulationTimeSeconds === 240, 'seed ' + seed + ': unexpected simulation time');
  assert(snapshot.diagnostics.collisionPairs.length === 0, 'seed ' + seed + ': collision in deterministic run');
  assert(snapshot.diagnostics.obstacleCollisions.length === 0, 'seed ' + seed + ': aircraft-building collision in deterministic run');
  assert(snapshot.diagnostics.metrics.collisionAlerts === 0, 'seed ' + seed + ': collision alert in deterministic run');
  assert(JSON.stringify(JSON.parse(JSON.stringify(snapshot))) === JSON.stringify(snapshot), 'seed ' + seed + ': snapshot is not JSON stable');
  totals.seeds += 1;
  totals.partitionComparisons += 1;
  totals.ticks += whole.tickCount + partitioned.tickCount;
  totals.simulatedMinutes += snapshot.simulationTimeSeconds / 60 * 2;
  totals.events += snapshot.events.length * 2;
}

const timing = createSeededSimulationHarness(7, { stepSeconds: 0.05 });
assert(timing.advanceBy(0.02) === 0, 'partial time advanced a tick too early');
assert(timing.remainderSeconds > 0, 'partial time did not remain in the accumulator');
assert(timing.advanceBy(0.03) === 1, 'accumulated time did not advance exactly one tick');
assert(timing.tickCount === 1 && timing.remainderSeconds === 0, 'fixed-step accumulator did not settle at the boundary');
timing.simulation.setPaused(true);
const pausedAt = timing.simulation.state.elapsed;
timing.advanceTicks(10);
assert(timing.simulation.state.elapsed === pausedAt, 'paused simulation advanced');
timing.simulation.setPaused(false);
timing.advanceTicks(10);
assert(Math.abs(timing.simulation.state.elapsed - pausedAt - 0.5) < 1e-9, 'resumed simulation did not advance by fixed ticks');
const nextWallTime = timing.wallTimeSeconds + 1;
assert(timing.advanceTo(nextWallTime) === 20, 'absolute time advancement produced the wrong tick count');
assert(timing.runUntil((snapshot) => snapshot.diagnostics.activeFlights > 0, 10), 'runUntil did not reach the first spawned flight');
totals.ticks += timing.tickCount;
totals.simulatedMinutes += timing.simulation.state.elapsed / 60;
totals.events += timing.snapshot().events.length;

const ord = createHubSimulationHarness('ORD', { stepSeconds: 0.05, pace: 3, scenario: 'rush', density: 'rush' });
const ordTwin = createHubSimulationHarness('ORD', { stepSeconds: 0.05, pace: 3, scenario: 'rush', density: 'rush' });
ord.advanceBy(300);
advanceInPattern(ordTwin, 300, partitionPattern);
assert(canonicalSnapshot(ord) === canonicalSnapshot(ordTwin), 'ORD: seeded hub run was not deterministic');
const ordSnapshot = ord.snapshot();
assert(ordSnapshot.state.arrivals > 0, 'ORD: fixed-step run produced no arrivals');
assert(ordSnapshot.state.departures > 0, 'ORD: fixed-step run produced no departures ' + JSON.stringify(ordSnapshot.flights.map((flight) => ({ id: flight.id, phase: flight.phase, progress: flight.progress, duration: flight.duration, elapsed: flight.phaseElapsed, runway: flight.runway, automaticHold: flight.automaticHold, hold: flight.safetyHoldReason, routeNode: flight.surfaceNode, routeEdge: flight.surfaceEdge }))));
assert(ordSnapshot.diagnostics.collisionPairs.length === 0, 'ORD: collision in fixed-step run');
assert(ordSnapshot.diagnostics.obstacleCollisions.length === 0, 'ORD: aircraft-building collision in fixed-step run');
assert(ordSnapshot.diagnostics.metrics.collisionAlerts === 0, 'ORD: collision alert in fixed-step run');
totals.partitionComparisons += 1;
totals.ticks += ord.tickCount + ordTwin.tickCount;
totals.simulatedMinutes += ordSnapshot.simulationTimeSeconds / 60 * 2;
totals.events += ordSnapshot.events.length * 2;
totals.hubArrivals = ordSnapshot.state.arrivals;
totals.hubDepartures = ordSnapshot.state.departures;

const westFlow = createHubSimulationHarness('ORD', { stepSeconds: 0.05 });
westFlow.simulation.state.flights = [];
westFlow.simulation.setWeather('clear', Math.PI, 14);
westFlow.advanceTicks(1);
assert(westFlow.simulation.state.runwayConfigurationId === 'ORD-WEST-FLOW', 'ORD: west wind did not select west flow');
assert(Object.values(westFlow.simulation.state.activeRunwayEnds).every((end) => end === 1), 'ORD: west flow changed runway ends incoherently');

const eastFlow = createHubSimulationHarness('ORD', { stepSeconds: 0.05 });
eastFlow.simulation.state.flights = [];
eastFlow.simulation.setWeather('clear', 0, 14);
eastFlow.advanceTicks(1);
assert(eastFlow.simulation.state.runwayConfigurationId === 'ORD-EAST-FLOW', 'ORD: east wind did not select east flow');
assert(Object.values(eastFlow.simulation.state.activeRunwayEnds).every((end) => end === -1), 'ORD: east flow changed runway ends incoherently');

const eastIfr = createHubSimulationHarness('ORD', { stepSeconds: 0.05 });
eastIfr.simulation.state.flights = [];
eastIfr.simulation.setWeather('fog', 0, 14);
eastIfr.advanceTicks(1);
assert(eastIfr.simulation.state.runwayConfigurationId === 'ORD-EAST-IFR', 'ORD: east IFR weather did not select the instrument plan');
assert(eastIfr.simulation.state.activeRunwayRoles[4] === 'inactive', 'ORD: east IFR incorrectly kept 10C active');
assert(eastIfr.simulation.state.activeRunwayRoles[5] === 'arrival', 'ORD: east IFR did not activate 10R arrivals');

const highArrival = createHubSimulationHarness('ORD', { stepSeconds: 0.05 });
highArrival.simulation.state.flights = [];
highArrival.simulation.setScenario('rush');
highArrival.simulation.setTrafficDensity('rush');
highArrival.simulation.setWeather('clear', Math.PI, 14);
highArrival.advanceTicks(1);
assert(highArrival.simulation.state.runwayConfigurationId === 'ORD-WEST-HIGH-ARRIVAL', 'ORD: west rush did not select the high-arrival plan');
assert(highArrival.simulation.state.activeRunwayRoles[5] === 'arrival', 'ORD: west high-arrival plan did not activate 28L');
assert(highArrival.simulation.state.activeRunwayRoles[7] === 'inactive', 'ORD: west high-arrival plan did not protect 22L');

const crosswind = createHubSimulationHarness('ORD', { stepSeconds: 0.05 });
crosswind.simulation.state.flights = [];
crosswind.simulation.setWeather('clear', (90 - 220) * Math.PI / 180, 24);
crosswind.advanceTicks(1);
assert(crosswind.simulation.state.runwayConfigurationId === 'ORD-CROSSWIND-22', 'ORD: strong southerly wind did not select the 22 contingency');
assert(crosswind.simulation.state.activeRunwayRoles[6] === 'arrival', 'ORD: 22R was not activated for arrivals');
assert(crosswind.simulation.state.activeRunwayRoles[7] === 'departure', 'ORD: 22L was not activated for departures');

const transition = createHubSimulationHarness('ORD', { stepSeconds: 0.05 });
const endsBeforeTransition = JSON.stringify(transition.simulation.state.activeRunwayEnds);
transition.simulation.setWeather('clear', 0, 14);
transition.advanceTicks(1);
assert(transition.simulation.state.runwayConfigurationId === 'ORD-WEST-FLOW', 'ORD: runway plan changed before protected traffic drained');
assert(transition.simulation.state.runwayConfigurationTransition?.targetId === 'ORD-EAST-FLOW', 'ORD: east-flow transition was not queued');
assert(transition.simulation.state.runwayConfigurationTransition.blockingFlightIds.length > 0, 'ORD: transition did not identify blocking flights');
assert(JSON.stringify(transition.simulation.state.activeRunwayEnds) === endsBeforeTransition, 'ORD: runway ends changed partially during transition');
transition.simulation.state.flights = [];
transition.advanceTicks(1);
assert(transition.simulation.state.runwayConfigurationId === 'ORD-EAST-FLOW', 'ORD: queued transition did not activate after traffic drained');
assert(transition.simulation.state.runwayConfigurationTransition === null, 'ORD: completed transition remained queued');
assert(Object.values(transition.simulation.state.activeRunwayEnds).every((end) => end === -1), 'ORD: queued transition did not apply atomically');

const manualConfiguration = createHubSimulationHarness('ORD', { stepSeconds: 0.05 });
manualConfiguration.simulation.state.flights = [];
manualConfiguration.simulation.setStation('ground');
assert(!manualConfiguration.simulation.setRunwayConfiguration('ORD-EAST-FLOW'), 'ORD: ground station changed the airport runway plan');
manualConfiguration.simulation.setStation('supervisor');
assert(manualConfiguration.simulation.setRunwayConfiguration('ORD-EAST-FLOW'), 'ORD: supervisor could not select an eligible runway plan');
assert(manualConfiguration.simulation.state.runwayConfigurationMode === 'manual', 'ORD: supervisor selection did not enter manual runway-plan mode');
manualConfiguration.simulation.setWeather('rain', 0, 14);
manualConfiguration.advanceTicks(1);
assert(manualConfiguration.simulation.state.runwayConfigurationMode === 'automatic', 'ORD: unsafe manual plan did not release to automatic selection');
assert(!manualConfiguration.simulation.setRunwayConfiguration('ORD-EAST-FLOW'), 'ORD: visual east plan was accepted in rain');
for (const [name, harness] of [
  ['east IFR', eastIfr],
  ['west high-arrival', highArrival],
  ['22 crosswind', crosswind],
]) {
  harness.advanceBy(120);
  const snapshot = harness.snapshot();
  assert(snapshot.diagnostics.collisionPairs.length === 0, 'ORD ' + name + ': collision in configuration soak');
  assert(snapshot.diagnostics.obstacleCollisions.length === 0, 'ORD ' + name + ': obstacle collision in configuration soak');
  assert(snapshot.diagnostics.metrics.collisionAlerts === 0, 'ORD ' + name + ': collision alert in configuration soak');
  assert(snapshot.diagnostics.activeFlights > 0, 'ORD ' + name + ': configuration did not sustain traffic ' + JSON.stringify({ state: snapshot.state, diagnostics: snapshot.diagnostics, options: harness.simulation.runwayConfigurationOptions() }));
  totals.runwayConfigurationSoaks += 1;
  totals.ticks += harness.tickCount;
  totals.simulatedMinutes += snapshot.simulationTimeSeconds / 60;
}
totals.runwayConfigurationsVerified = true;
totals.runwayTransitionQueueVerified = true;

const concurrent = createHubSimulationHarness('ORD', { stepSeconds: 0.05 });
const occupiedStartupFlights = concurrent.simulation.state.flights.filter((flight) => (
  flight.phase === 'resting'
  || flight.phase === 'taxi-in'
  || (flight.phase === 'taxi-out' && (flight.tugAttached || flight.pushbackProgress < 1))
));
const initialGates = occupiedStartupFlights.map((flight) => flight.gateSlot);
assert(new Set(initialGates).size === initialGates.length, 'ORD: startup reused a physically occupied gate ' + JSON.stringify(occupiedStartupFlights.map((flight) => ({ id: flight.id, phase: flight.phase, gateSlot: flight.gateSlot, standId: flight.standId }))));
let concurrentMovers = 0;
for (let tick = 0; tick < 40; tick += 1) {
  const before = new Map(concurrent.simulation.state.flights.map((flight) => [flight.id, flight.progress]));
  concurrent.advanceTicks(1);
  const moved = concurrent.simulation.state.flights.filter((flight) => (
    (flight.phase === 'taxi-in' || flight.phase === 'taxi-out')
    && flight.progress > (before.get(flight.id) ?? flight.progress)
  )).length;
  concurrentMovers = Math.max(concurrentMovers, moved);
}
assert(concurrentMovers >= 2, 'ORD: independent surface routes did not move concurrently');
totals.concurrentSurfaceMovers = concurrentMovers;

const pushback = createHubSimulationHarness('ORD', { stepSeconds: 0.05 });
pushback.simulation.setMode('manual');
const pushReady = pushback.simulation.state.flights.find((flight) => flight.phase === 'resting' && flight.progress >= 0.999);
assert(pushReady, 'ORD pushback: startup has no push-ready departure');
assert(pushReady.engineState === 'off' && !pushReady.tugAttached && !pushReady.pushbackCleared, 'ORD pushback: gate state was not cold and uncleared');
assert(['left', 'right', 'straight'].includes(pushReady.pushbackDirection), 'ORD pushback: route has no declared push direction');
pushback.simulation.setStation('tower');
assert(!pushback.simulation.clearPushback(pushReady.id), 'ORD pushback: tower issued a ground pushback clearance');
assert(pushback.simulation.lastCommandReason().includes('no pushback authority'), 'ORD pushback: rejected authority had no structured reason');
pushback.simulation.setStation('ground');
assert(pushback.simulation.clearPushback(pushReady.id), 'ORD pushback: ground clearance was rejected');
pushback.advanceTicks(1);
let pushing = pushback.simulation.state.flights.find((flight) => flight.id === pushReady.id);
assert(pushing?.phase === 'taxi-out', 'ORD pushback: cleared departure did not leave the stand lifecycle');
assert(pushing.tugAttached && pushing.engineState === 'starting', 'ORD pushback: tug or engine-start state was missing at movement start');
const stand = pushback.config.surfaceGraph.stands.find((candidate) => candidate.slot === pushing.gateSlot);
assert(stand, 'ORD pushback: departure stand disappeared');
assert(pushback.runUntil((snapshot) => snapshot.flights.some((flight) => flight.id === pushReady.id && flight.pushbackProgress >= 0.12), 90), 'ORD pushback: tug never moved the aircraft');
pushing = pushback.simulation.state.flights.find((flight) => flight.id === pushReady.id);
assert(pushing?.motion.stage === 'pushback' && pushing.motion.onGround, 'ORD pushback: authoritative motion did not identify an on-ground push');
const travelHeading = Math.atan2(pushing.motion.y - stand.position[1], pushing.motion.x - stand.position[0]);
assert(Math.cos(pushing.motion.heading - travelHeading) < 0.25, 'ORD pushback: aircraft moved forward out of a nose-in stand');
assert(pushback.runUntil((snapshot) => snapshot.flights.some((flight) => flight.id === pushReady.id && flight.pushbackProgress === 1 && !flight.tugAttached), 300), 'ORD pushback: tug never released at the ramp node');
pushing = pushback.simulation.state.flights.find((flight) => flight.id === pushReady.id);
assert(pushing?.engineState === 'running' && pushing.motion.stage === 'taxi-out', 'ORD pushback: taxi power did not replace tug movement smoothly');
const pushbackSnapshot = pushback.snapshot();
assert(pushbackSnapshot.events.some((event) => event.type === 'pushback-clearance' && event.flightId === pushReady.id), 'ORD pushback: clearance event missing');
assert(pushbackSnapshot.events.some((event) => event.type === 'pushback-start' && event.flightId === pushReady.id), 'ORD pushback: tug-attachment event missing');
assert(pushbackSnapshot.events.some((event) => event.type === 'engine-start' && event.flightId === pushReady.id), 'ORD pushback: engine-start event missing');
assert(pushbackSnapshot.events.some((event) => event.type === 'tug-release' && event.flightId === pushReady.id), 'ORD pushback: tug-release event missing');
assert(pushbackSnapshot.diagnostics.collisionPairs.length === 0 && pushbackSnapshot.diagnostics.obstacleCollisions.length === 0, 'ORD pushback: lifecycle breached a protected envelope');
totals.pushbackLifecycleVerified = true;

const assistedPushback = createHubSimulationHarness('ORD', { stepSeconds: 0.05, mode: 'assisted' });
assistedPushback.simulation.setStation('ground');
assert(assistedPushback.simulation.clearanceProposals().some((proposal) => proposal.action === 'pushback'), 'ORD pushback: Assisted mode did not propose the ready push');
totals.assistedPushbackProposalVerified = true;

const manual = createHubSimulationHarness('ORD', { stepSeconds: 0.05 });
manual.simulation.setMode('manual');
manual.simulation.setStation('supervisor');
let manualDepartureReady = false;
for (let tick = 0; tick < 3_000 && !manualDepartureReady; tick += 1) {
  for (const flight of manual.simulation.state.flights) {
    if (flight.crossingHoldRunway !== undefined) {
      assert(
        manual.simulation.clearRunwayCrossing(flight.id, flight.crossingHoldRunway),
        'ORD manual: crossing clearance was rejected for runway ' + flight.crossingHoldRunway,
      );
    }
  }
  manualDepartureReady = manual.simulation.state.flights.some((flight) => flight.phase === 'taxi-out' && flight.progress >= 0.985);
  if (!manualDepartureReady) manual.advanceTicks(1);
}
assert(manualDepartureReady, 'ORD manual: no departure reached hold short after explicit runway-crossing clearances');
const manualFlight = manual.simulation.state.flights.find((flight) => flight.phase === 'taxi-out' && flight.progress >= 0.985);
const runwayEntryAccepted = manualFlight && manual.simulation.clearRunwayEntry(manualFlight.id);
const manualCrossingWindows = manualFlight
  ? surfaceRouteCrossingWindows(manual.config.surfaceGraph, manualFlight.surfaceRoute, manualFlight.progress, manualFlight.runway, manualFlight.surfaceRouteEdges)
  : [];
assert(
  runwayEntryAccepted,
  'ORD manual: line-up clearance was rejected: ' + manual.simulation.lastCommandReason()
    + ' required=' + JSON.stringify(manualFlight?.requiredCrossings)
    + ' cleared=' + JSON.stringify(manualFlight?.crossingClearances)
    + ' windows=' + JSON.stringify(manualCrossingWindows),
);
assert(manual.runUntil(() => manual.simulation.state.flights.some((flight) => flight.id === manualFlight.id && flight.phase === 'takeoff'), 500), 'ORD manual: cleared aircraft never lined up');
assert(manual.simulation.clearTakeoff(manualFlight.id), 'ORD manual: takeoff clearance was rejected: ' + manual.simulation.lastCommandReason());
assert(manual.runUntil(() => manual.simulation.state.departures > 0, 300), 'ORD manual: cleared aircraft never departed');
totals.manualDepartureCleared = true;

const repeatedCrossingHarness = createHubSimulationHarness('ORD', { stepSeconds: 0.05 });
repeatedCrossingHarness.simulation.setMode('manual');
repeatedCrossingHarness.simulation.setStation('supervisor');
let repeatedFixture = null;
findRepeatedCrossing:
for (const runway of repeatedCrossingHarness.config.runways.filter((item) => item.role !== 'inactive')) {
  for (const operatingEnd of [-1, 1]) {
    for (const stand of repeatedCrossingHarness.config.surfaceGraph.stands) {
      for (const phase of ['taxi-in', 'taxi-out']) {
        const route = surfaceRouteForFlight(repeatedCrossingHarness.config.surfaceGraph, runway.id, operatingEnd, phase, stand.slot);
        if (!route) continue;
        const windows = surfaceRouteCrossingWindows(repeatedCrossingHarness.config.surfaceGraph, route.nodeIds, 0, runway.id, route.edgeIds);
        const repeatedRunway = windows.find((crossing, index) => windows.some((other, otherIndex) => otherIndex > index && other.runwayId === crossing.runwayId))?.runwayId;
        const sameRunwayWindows = windows.filter((crossing) => crossing.runwayId === repeatedRunway);
        if (repeatedRunway === undefined || sameRunwayWindows.length < 2) continue;
        repeatedFixture = { runway, operatingEnd, stand, phase, route, repeatedRunway, sameRunwayWindows };
        break findRepeatedCrossing;
      }
    }
  }
}
assert(repeatedFixture, 'ORD manual: imported graph has no repeated-runway fixture for occurrence clearance testing');
const repeatedFlight = repeatedCrossingHarness.simulation.state.flights[0];
Object.assign(repeatedFlight, {
  runway: repeatedFixture.runway.id,
  departureRunway: repeatedFixture.runway.id,
  operatingEnd: repeatedFixture.operatingEnd,
  phase: repeatedFixture.phase,
  progress: repeatedFixture.sameRunwayWindows[0].holdProgress,
  phaseElapsed: 0,
  duration: 120,
  gateSlot: repeatedFixture.stand.slot,
  surfaceRoute: [...repeatedFixture.route.nodeIds],
  surfaceRouteEdges: [...repeatedFixture.route.edgeIds],
  requiredCrossings: surfaceRouteRunwayCrossings(repeatedCrossingHarness.config.surfaceGraph, repeatedFixture.route.edgeIds, repeatedFixture.runway.id),
  crossingClearances: [],
  crossingClearanceIds: [],
  controlHold: false,
  automaticHold: false,
  safetyHold: false,
});
repeatedCrossingHarness.simulation.state.flights = [repeatedFlight];
syncFlightMotion(repeatedCrossingHarness.config, repeatedFlight);
assert(repeatedCrossingHarness.simulation.clearRunwayCrossing(repeatedFlight.id, repeatedFixture.repeatedRunway), 'ORD manual: first repeated crossing clearance was rejected');
assert(repeatedFlight.crossingClearanceIds?.length === 1, 'ORD manual: first repeated crossing was not recorded by occurrence');
repeatedFlight.progress = repeatedFixture.sameRunwayWindows[1].holdProgress;
syncFlightMotion(repeatedCrossingHarness.config, repeatedFlight);
assert(repeatedCrossingHarness.simulation.clearRunwayCrossing(repeatedFlight.id, repeatedFixture.repeatedRunway), 'ORD manual: second repeated crossing clearance was rejected');
assert(repeatedFlight.crossingClearanceIds?.length === 2, 'ORD manual: second crossing of the same runway reused the first clearance');
totals.repeatedCrossingClearances = true;

const firstSeedGraph = JSON.stringify(generateAirportConfig(101).surfaceGraph);
const secondSeedGraph = JSON.stringify(generateAirportConfig(102).surfaceGraph);
assert(firstSeedGraph !== secondSeedGraph, 'different local seeds produced the same surface graph');

assertThrows(
  () => new FixedStepSimulationHarness(generateAirportConfig(1), { stepSeconds: 0.2 }),
  'invalid fixed step was accepted',
);
assertThrows(() => timing.advanceBy(-1), 'negative duration was accepted');
assertThrows(() => timing.advanceTo(timing.wallTimeSeconds - 1), 'backwards absolute time was accepted');
assertThrows(() => createHubSimulationHarness('NOPE'), 'unknown hub code was accepted');

console.log(JSON.stringify(totals));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'fixed-step-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Fixed-step validation bundle was empty.');
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

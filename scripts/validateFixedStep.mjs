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

const ord = createHubSimulationHarness('ORD', { stepSeconds: 0.05, pace: 3, scenario: 'rush' });
const ordTwin = createHubSimulationHarness('ORD', { stepSeconds: 0.05, pace: 3, scenario: 'rush' });
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

const concurrent = createHubSimulationHarness('ORD', { stepSeconds: 0.05 });
const initialGates = concurrent.simulation.state.flights.map((flight) => flight.gateSlot);
assert(new Set(initialGates).size === initialGates.length, 'ORD: startup reused an occupied gate');
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
assert(manual.simulation.clearTakeoff(manualFlight.id), 'ORD manual: takeoff clearance was rejected');
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

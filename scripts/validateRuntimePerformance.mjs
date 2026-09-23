import { build } from "esbuild";

const source = `
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { RuntimePerformanceMonitor } from './src/telemetry/runtimePerformance.ts';
import { AdaptiveQualityGovernor } from './src/render/adaptiveQualityGovernor.ts';
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';

const MiB = 1_048_576;
const cleanupSimulation = new AirportSimulation(generateHubConfig(4), 'quiet');
const cleanupFlight = cleanupSimulation.state.flights.find((flight) => flight.phase === 'taxi-out');
assert(cleanupFlight, 'ORD cleanup fixture needs an initial taxi-out departure');
cleanupFlight.phase = 'takeoff';
cleanupSimulation['stationarySeconds'].set(cleanupFlight.id, 12);
cleanupSimulation['surfaceYieldCooldownUntil'].set(cleanupFlight.id, 20);
cleanupSimulation['phaseTransitionRetryAt'].set(cleanupFlight.id, 30);
cleanupSimulation['parkedBlockerRecovery'].set(cleanupFlight.id, {
  blockerId: cleanupFlight.id,
  attempts: 1,
  retryAtSeconds: 40,
});
cleanupSimulation['runwayReservations'].set(cleanupFlight.runway, cleanupFlight.id);
cleanupSimulation['advance'](cleanupFlight);
assert(!cleanupSimulation.state.flights.some((flight) => flight.id === cleanupFlight.id), 'departed flight remained in the live state');
assert(
  !cleanupSimulation['stationarySeconds'].has(cleanupFlight.id)
    && !cleanupSimulation['surfaceYieldCooldownUntil'].has(cleanupFlight.id)
    && !cleanupSimulation['phaseTransitionRetryAt'].has(cleanupFlight.id)
    && !cleanupSimulation['parkedBlockerRecovery'].has(cleanupFlight.id)
    && ![...cleanupSimulation['runwayReservations'].values()].includes(cleanupFlight.id),
  'departed flight retained ID-keyed runtime state',
);
const monitor = new RuntimePerformanceMonitor();
for (let index = 0; index < 180; index += 1) {
  monitor.recordFrame(6 + index % 3, 16 + index % 4, index % 3);
  monitor.recordSimulationTick(3 + index % 4);
}
for (let second = 0; second <= 600; second += 1) {
  monitor.sample({
    elapsedSeconds: second,
    heapBytes: (120 + second / 1_200) * MiB,
    aircraft: 42,
    serviceVehicles: 24,
    audioVoices: 10,
    queues: 12,
    drawCalls: 248,
    geometries: 216,
    textures: 18,
    detail: 'low',
  });
}
const nominal = monitor.snapshot();
assert.equal(nominal.status, 'nominal');
assert.equal(nominal.retention.frameSamples, 180);
assert.equal(nominal.growth.sampleCount, 601);
assert(nominal.frameWorkMs.p95 <= 8);
assert(nominal.simulationTickMs.p95 <= 6);
assert(nominal.checks.every((check) => !['attention', 'exceeded'].includes(check.status)));

const governor = new AdaptiveQualityGovernor();
const overloadSnapshot = {
  ...nominal,
  frameWorkMs: { ...nominal.frameWorkMs, samples: 60, p95: 17 },
  frameGapMs: { ...nominal.frameGapMs, p95: 25 },
};
assert.equal(governor.observe(overloadSnapshot), null, 'quality governor reacted to one transient sample');
assert.equal(governor.observe(overloadSnapshot), true, 'quality governor did not reduce after sustained overload');
assert.equal(governor.isDegraded(), true);
const recoveredSnapshot = {
  ...nominal,
  frameWorkMs: { ...nominal.frameWorkMs, samples: 180, p95: 10 },
  frameGapMs: { ...nominal.frameGapMs, p95: 19 },
};
for (let index = 0; index < 11; index += 1)
  assert.equal(governor.observe(recoveredSnapshot), null, 'quality governor restored too early');
assert.equal(governor.observe(recoveredSnapshot), false, 'quality governor did not restore after sustained recovery');
assert.equal(governor.isDegraded(), false);

const gcSawtooth = new RuntimePerformanceMonitor();
const retainedLeak = new RuntimePerformanceMonitor();
for (let second = 0; second <= 3_590; second += 10) {
  const transientMiB = (second % 240) / 4;
  const counters = {
    elapsedSeconds: second,
    aircraft: 40,
    serviceVehicles: 20,
    audioVoices: 8,
    queues: 10,
    drawCalls: 240,
    geometries: 200,
    textures: 18,
    detail: 'low',
  };
  gcSawtooth.sample({ ...counters, heapBytes: (100 + transientMiB) * MiB });
  retainedLeak.sample({ ...counters, heapBytes: (100 + second / 60 + transientMiB) * MiB });
}
assert(Math.abs(gcSawtooth.snapshot().growth.heapMiBPerHour ?? Infinity) < 1, 'GC sawtooth produced false retained growth');
assert((retainedLeak.snapshot().growth.heapMiBPerHour ?? 0) > 55, 'retained heap leak was hidden by low-water sampling');

monitor.sample({
  elapsedSeconds: 601,
  heapBytes: 620 * MiB,
  aircraft: 180,
  serviceVehicles: 120,
  audioVoices: 18,
  queues: 80,
  drawCalls: 400,
  geometries: 340,
  textures: 22,
  detail: 'low',
});
const exceeded = monitor.snapshot();
assert.equal(exceeded.status, 'exceeded');
for (const id of ['heap', 'aircraft', 'service-vehicles', 'audio-voices', 'queues', 'draw-calls', 'geometries']) {
  assert.equal(exceeded.checks.find((check) => check.id === id)?.status, 'exceeded', id + ' budget was not enforced');
}

for (let index = 0; index < 1_300; index += 1) monitor.recordFrame(4, 16, 1);
assert.equal(monitor.snapshot().retention.frameSamples, 1_200);
monitor.reset();
assert.equal(monitor.snapshot().retention.counterSamples, 0);
assert.equal(monitor.snapshot().droppedSimulationSeconds, 0);

const configuration = generateHubConfig(4);
const simulation = new AirportSimulation(configuration, 'extreme');
simulation.setMode('auto');
simulation.setPace(3);
simulation.setPaused(false);
for (let tick = 0; tick < 100; tick += 1) simulation.update(0.05);
const stressMonitor = new RuntimePerformanceMonitor();
let maximumAircraft = 0;
let maximumVehicles = 0;
let maximumQueue = 0;
const pauseDiagnostics = [];
for (let tick = 0; tick < 900; tick += 1) {
  const pauseCountBefore = simulation.diagnostics().metrics.unexplainedPauses;
  const stationaryBefore = new Map(simulation['stationarySeconds']);
  const flightStateBefore = new Map(simulation.state.flights.map((flight) => [flight.id, {
    id: flight.id,
    callsign: flight.callsign,
    phase: flight.phase,
    progress: flight.progress,
    phaseElapsed: flight.phaseElapsed,
    groundSpeedKts: flight.kinematics.groundSpeedKts,
    motionStage: flight.motion.stage,
    onGround: flight.motion.onGround,
    engineState: flight.engineState,
    controlHold: flight.controlHold,
    automaticHold: flight.automaticHold,
    crossingHoldRunway: flight.crossingHoldRunway ?? null,
    safetyHold: flight.safetyHold,
    navigationHold: flight.navigation.hold?.fixId ?? null,
    takeoffCleared: flight.takeoffCleared,
    surfaceRoute: flight.surfaceRoute?.length ?? 0,
    surfaceRouteEdges: flight.surfaceRouteEdges?.length ?? 0,
    deicingStatus: flight.deicing.status,
    pushbackCleared: flight.pushbackCleared,
    pushbackProgress: flight.pushbackProgress,
  }]));
  const started = performance.now();
  simulation.update(0.05);
  stressMonitor.recordSimulationTick(performance.now() - started);
  stressMonitor.recordFrame(8, 16.67, 1);
  const pauseCountAfter = simulation.diagnostics().metrics.unexplainedPauses;
  if (pauseCountAfter > pauseCountBefore) {
    const stationaryAfter = new Map(simulation['stationarySeconds']);
    const thresholdFlights = [...stationaryAfter.entries()]
      .filter(([id, seconds]) => (stationaryBefore.get(id) ?? 0) < 0.75 && seconds >= 0.75)
      .map(([id, seconds]) => ({ id, seconds }));
    for (const [id, seconds] of stationaryBefore) {
      if (seconds < 0.5 || thresholdFlights.some((entry) => entry.id === id)) continue;
      const afterSeconds = stationaryAfter.get(id);
      if (afterSeconds !== undefined && afterSeconds >= seconds) continue;
      thresholdFlights.push({ id, seconds: afterSeconds ?? seconds + 0.15 });
    }
    pauseDiagnostics.push(...thresholdFlights.map(({ id, seconds }) => {
      const flight = simulation.state.flights.find((candidate) => candidate.id === id);
      const previous = flightStateBefore.get(id);
      return {
        tick,
        elapsedSeconds: Number(simulation.state.elapsed.toFixed(3)),
        stationarySeconds: Number(seconds.toFixed(3)),
        before: previous ? {
          ...previous,
          progress: Number(previous.progress.toFixed(6)),
          phaseElapsed: Number(previous.phaseElapsed.toFixed(3)),
          groundSpeedKts: Number(previous.groundSpeedKts.toFixed(3)),
          pushbackProgress: Number(previous.pushbackProgress.toFixed(3)),
        } : null,
        after: flight ? {
          phase: flight.phase,
          progress: Number(flight.progress.toFixed(6)),
          phaseElapsed: Number(flight.phaseElapsed.toFixed(3)),
          groundSpeedKts: Number(flight.kinematics.groundSpeedKts.toFixed(3)),
          motionStage: flight.motion.stage,
          onGround: flight.motion.onGround,
          engineState: flight.engineState,
          controlHold: flight.controlHold,
          automaticHold: flight.automaticHold,
          crossingHoldRunway: flight.crossingHoldRunway ?? null,
          safetyHold: flight.safetyHold,
          navigationHold: flight.navigation.hold?.fixId ?? null,
          takeoffCleared: flight.takeoffCleared,
          surfaceRoute: flight.surfaceRoute?.length ?? 0,
          surfaceRouteEdges: flight.surfaceRouteEdges?.length ?? 0,
          deicingStatus: flight.deicing.status,
          pushbackCleared: flight.pushbackCleared,
          pushbackProgress: Number(flight.pushbackProgress.toFixed(3)),
        } : null,
      };
    }));
  }
  if (tick % 20 === 0) {
    const queues = simulation.queueSnapshot();
    maximumAircraft = Math.max(maximumAircraft, simulation.state.flights.length);
    maximumVehicles = Math.max(maximumVehicles, simulation.state.serviceVehicles.length);
    maximumQueue = Math.max(maximumQueue, queues.total);
    stressMonitor.sample({
      elapsedSeconds: simulation.state.elapsed,
      heapBytes: process.memoryUsage().heapUsed,
      aircraft: simulation.state.flights.length,
      serviceVehicles: simulation.state.serviceVehicles.length,
      audioVoices: 0,
      queues: queues.total,
      drawCalls: 252,
      geometries: 220,
      textures: 18,
      detail: 'low',
    });
  }
}
const diagnostics = simulation.diagnostics();
assert.equal(diagnostics.metrics.collisionAlerts, 0, 'stress profile weakened collision protection');
assert.equal(diagnostics.metrics.runwayIncursions, 0, 'stress profile produced a runway incursion');
assert.equal(
  diagnostics.metrics.unexplainedPauses,
  0,
  'stress profile produced an unexplained aircraft pause: ' + JSON.stringify(pauseDiagnostics),
);
assert.equal(stressMonitor.snapshot().maximumTicksPerFrame, 1);

console.log(JSON.stringify({
  schemaVersion: stressMonitor.snapshot().schemaVersion,
  airport: configuration.code,
  density: 'extreme',
  modeledMinutes: Number((simulation.state.elapsed / 60).toFixed(2)),
  simulationTickMs: stressMonitor.snapshot().simulationTickMs,
  maximumAircraft,
  maximumVehicles,
  maximumQueue,
  safety: {
    collisions: diagnostics.metrics.collisionAlerts,
    incursions: diagnostics.metrics.runwayIncursions,
    unexplainedPauses: diagnostics.metrics.unexplainedPauses,
    pauseDiagnostics,
  },
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: source,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "runtime-performance-validation.ts",
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
  throw new Error("Runtime performance validation bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

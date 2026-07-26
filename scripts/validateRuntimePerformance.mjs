import { build } from "esbuild";

const source = `
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { RuntimePerformanceMonitor } from './src/telemetry/runtimePerformance.ts';
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';

const MiB = 1_048_576;
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
for (let tick = 0; tick < 900; tick += 1) {
  const started = performance.now();
  simulation.update(0.05);
  stressMonitor.recordSimulationTick(performance.now() - started);
  stressMonitor.recordFrame(8, 16.67, 1);
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

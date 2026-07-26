import { build } from "esbuild";

const requestedHours = Number(
  process.argv
    .find((argument) => argument.startsWith("--hours="))
    ?.split("=")[1] ?? 4,
);
const hours = Number.isFinite(requestedHours)
  ? Math.min(12, Math.max(0.05, requestedHours))
  : 4;

const source = `
import { performance } from 'node:perf_hooks';
import { RuntimePerformanceMonitor } from './src/telemetry/runtimePerformance.ts';
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';

const requestedHours = ${JSON.stringify(hours)};
const stepSeconds = 0.1;
const pace = 3;
const targetModeledSeconds = requestedHours * 3_600;
const configuration = generateHubConfig(4);
const simulation = new AirportSimulation(configuration, 'extreme');
simulation.setMode('auto');
simulation.setPace(pace);
simulation.setPaused(false);
const monitor = new RuntimePerformanceMonitor();
let maximumAircraft = 0;
let maximumVehicles = 0;
let maximumQueues = 0;
let createdFlights = new Set(simulation.state.flights.map((flight) => flight.id));
let nextSample = 0;
let nextCheckpoint = 1_800;
const wallStarted = performance.now();

while (simulation.state.elapsed < targetModeledSeconds) {
  const started = performance.now();
  simulation.update(stepSeconds);
  monitor.recordSimulationTick(performance.now() - started);
  for (const flight of simulation.state.flights) createdFlights.add(flight.id);
  if (simulation.state.elapsed >= nextSample) {
    const queues = simulation.queueSnapshot();
    maximumAircraft = Math.max(maximumAircraft, simulation.state.flights.length);
    maximumVehicles = Math.max(maximumVehicles, simulation.state.serviceVehicles.length);
    maximumQueues = Math.max(maximumQueues, queues.total);
    monitor.sample({
      elapsedSeconds: simulation.state.elapsed,
      heapBytes: process.memoryUsage().heapUsed,
      aircraft: simulation.state.flights.length,
      serviceVehicles: simulation.state.serviceVehicles.length,
      audioVoices: 0,
      queues: queues.total,
      drawCalls: 0,
      geometries: 0,
      textures: 0,
      detail: 'low',
    });
    nextSample += 10;
  }
  if (simulation.state.elapsed >= nextCheckpoint) {
    const diagnostics = simulation.diagnostics();
    console.log(JSON.stringify({
      checkpointModeledHours: Number((simulation.state.elapsed / 3_600).toFixed(2)),
      wallMinutes: Number(((performance.now() - wallStarted) / 60_000).toFixed(2)),
      aircraft: simulation.state.flights.length,
      createdFlights: createdFlights.size,
      queues: simulation.queueSnapshot().total,
      simP95Ms: monitor.snapshot().simulationTickMs.p95,
      heapMiBPerHour: monitor.snapshot().growth.heapMiBPerHour,
      collisions: diagnostics.metrics.collisionAlerts,
      incursions: diagnostics.metrics.runwayIncursions,
      unexplainedPauses: diagnostics.metrics.unexplainedPauses,
    }));
    nextCheckpoint += 1_800;
  }
}

const diagnostics = simulation.diagnostics();
const snapshot = monitor.snapshot();
const failures = [];
if (diagnostics.metrics.collisionAlerts !== 0) failures.push('collision alerts');
if (diagnostics.metrics.runwayIncursions !== 0) failures.push('runway incursions');
if (diagnostics.metrics.unexplainedPauses !== 0) failures.push('unexplained pauses');
if (snapshot.simulationTickMs.p95 > snapshot.budgets.simulationTickP95Ms) failures.push('simulation p95 budget');
if (snapshot.growth.heapMiBPerHour !== null && snapshot.growth.heapMiBPerHour > snapshot.budgets.heapGrowthMiBPerHour) failures.push('heap growth budget');
if (maximumAircraft > snapshot.budgets.aircraft) failures.push('aircraft entity budget');
if (maximumVehicles > snapshot.budgets.serviceVehicles) failures.push('service-vehicle entity budget');
if (maximumQueues > snapshot.budgets.queues) failures.push('queue budget');

const report = {
  accepted: failures.length === 0,
  failures,
  airport: configuration.code,
  density: 'extreme',
  requestedHours,
  modeledHours: Number((simulation.state.elapsed / 3_600).toFixed(3)),
  wallMinutes: Number(((performance.now() - wallStarted) / 60_000).toFixed(3)),
  createdFlights: createdFlights.size,
  maximumAircraft,
  maximumVehicles,
  maximumQueues,
  arrivals: simulation.state.arrivals,
  departures: simulation.state.departures,
  performance: snapshot,
  safety: {
    collisions: diagnostics.metrics.collisionAlerts,
    incursions: diagnostics.metrics.runwayIncursions,
    unexplainedPauses: diagnostics.metrics.unexplainedPauses,
  },
};
console.log(JSON.stringify(report));
if (failures.length) process.exitCode = 1;
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: source,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "runtime-soak.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Runtime soak bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

import { build } from 'esbuild';

const detailed = process.argv.includes('--details');
const warmupArgument = process.argv.find((argument) => argument.startsWith('--warmup-minutes='));
const requestedWarmupMinutes = Number(warmupArgument?.split('=')[1] ?? 0.25);
const warmupMinutes = Number.isFinite(requestedWarmupMinutes) ? Math.max(0, requestedWarmupMinutes) : 0.25;
const sampleArgument = process.argv.find((argument) => argument.startsWith('--samples='));
const requestedSamples = Number(sampleArgument?.split('=')[1] ?? 600);
const sampleCount = Number.isFinite(requestedSamples) ? Math.max(100, Math.floor(requestedSamples)) : 600;
const airportArgument = process.argv.find((argument) => argument.startsWith('--airport='));
const requestedAirport = (airportArgument?.split('=')[1] ?? 'ORD').trim().toUpperCase();
const profileSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { beginCollisionPerformanceTrace, endCollisionPerformanceTrace } from './src/simulation/collisionDetection.ts';

const detailed = ${detailed};
const methodTimings = new Map();
const airportCode = ${JSON.stringify(requestedAirport)};
const hubIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === airportCode);
if (hubIndex < 0) throw new Error('Unknown hub ' + airportCode);
const configuration = generateHubConfig(hubIndex);
const simulation = new AirportSimulation(configuration, 'extreme');
simulation.setMode('auto');
simulation.setPace(3);
simulation.setPaused(false);

const warmupTicks = Math.ceil(${warmupMinutes} * 60 / (0.05 * 3));
for (let index = 0; index < warmupTicks; index += 1) simulation.update(0.05);

if (detailed) {
  for (const name of Object.getOwnPropertyNames(AirportSimulation.prototype)) {
    if (name === 'constructor' || name === 'update') continue;
    const original = AirportSimulation.prototype[name];
    if (typeof original !== 'function') continue;
    AirportSimulation.prototype[name] = function (...args) {
      const started = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        const timing = methodTimings.get(name) ?? { calls: 0, totalMs: 0, maxMs: 0 };
        const durationMs = performance.now() - started;
        timing.calls += 1;
        timing.totalMs += durationMs;
        timing.maxMs = Math.max(timing.maxMs, durationMs);
        methodTimings.set(name, timing);
      }
    };
  }
}

const samples = [];
if (detailed) beginCollisionPerformanceTrace();
for (let index = 0; index < ${sampleCount}; index += 1) {
  const started = performance.now();
  simulation.update(0.05);
  samples.push(performance.now() - started);
}
samples.sort((first, second) => first - second);
const collisionTrace = detailed ? endCollisionPerformanceTrace() : undefined;
const percentile = (fraction) => samples[Math.min(samples.length - 1, Math.floor(samples.length * fraction))];
console.log(JSON.stringify({
  airport: configuration.code,
  density: 'extreme',
  playbackSpeed: 3,
  fixedStepHz: 20,
  warmupModeledMinutes: ${warmupMinutes},
  samples: samples.length,
  aircraft: simulation.state.flights.length,
  serviceVehicles: simulation.state.serviceVehicles.length,
  meanMs: Number((samples.reduce((sum, sample) => sum + sample, 0) / samples.length).toFixed(3)),
  p50Ms: Number(percentile(0.5).toFixed(3)),
  p95Ms: Number(percentile(0.95).toFixed(3)),
  p99Ms: Number(percentile(0.99).toFixed(3)),
  maxMs: Number(samples.at(-1).toFixed(3)),
  collisionTrace,
  hotMethods: detailed ? [...methodTimings.entries()]
    .map(([name, timing]) => ({
      name,
      calls: timing.calls,
      totalMs: Number(timing.totalMs.toFixed(3)),
      averageUs: Number((timing.totalMs / timing.calls * 1_000).toFixed(2)),
      maxMs: Number(timing.maxMs.toFixed(3)),
    }))
    .sort((first, second) => second.totalMs - first.totalMs)
    .slice(0, 24) : undefined,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: profileSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'runtime-profile.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Runtime profile bundle was empty.');
await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);

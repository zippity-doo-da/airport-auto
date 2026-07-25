import { build } from 'esbuild';

const profileSource = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';

const configuration = generateHubConfig(4); // deterministic ORD fixture
const simulation = new AirportSimulation(configuration, 'extreme');
simulation.setMode('auto');
simulation.setPace(3);
simulation.setPaused(false);

for (let index = 0; index < 100; index += 1) simulation.update(0.05);

const samples = [];
for (let index = 0; index < 600; index += 1) {
  const started = performance.now();
  simulation.update(0.05);
  samples.push(performance.now() - started);
}
samples.sort((first, second) => first - second);
const percentile = (fraction) => samples[Math.min(samples.length - 1, Math.floor(samples.length * fraction))];
console.log(JSON.stringify({
  airport: configuration.code,
  density: 'extreme',
  playbackSpeed: 3,
  fixedStepHz: 20,
  samples: samples.length,
  aircraft: simulation.state.flights.length,
  serviceVehicles: simulation.state.serviceVehicles.length,
  meanMs: Number((samples.reduce((sum, sample) => sum + sample, 0) / samples.length).toFixed(3)),
  p50Ms: Number(percentile(0.5).toFixed(3)),
  p95Ms: Number(percentile(0.95).toFixed(3)),
  p99Ms: Number(percentile(0.99).toFixed(3)),
  maxMs: Number(samples.at(-1).toFixed(3)),
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

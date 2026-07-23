import { build } from 'esbuild';

const validationSource = `
import { generateAirportConfig, generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { FixedStepSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import { sampleSurfaceRoute, surfaceRouteForFlight, validateAirportSurfaceGraph } from './src/simulation/surfaceGraph.ts';

const configs = [
  ...Array.from({ length: 64 }, (_, index) => generateAirportConfig(10_000 + index * 97)),
  ...HUB_AIRPORTS.map((_, index) => generateHubConfig(index)),
];

const totals = { airports: configs.length, nodes: 0, edges: 0, taxiways: 0, stands: 0, routes: 0, trafficRuns: 0, simulatedMinutes: 0 };
for (const config of configs) {
  const validation = validateAirportSurfaceGraph(config);
  if (!validation.valid) throw new Error(config.code + ': ' + validation.errors.join('; '));
  totals.nodes += validation.counts.nodes;
  totals.edges += validation.counts.edges;
  totals.taxiways += validation.counts.taxiways;
  totals.stands += validation.counts.stands;
  if (validation.counts.intersections < 1) throw new Error(config.code + ': graph has no intersections');
  if (validation.counts.holdShorts !== config.runways.length * 2) throw new Error(config.code + ': hold-short count does not cover every runway end');

  for (const runway of config.runways.filter((item) => item.role !== 'inactive')) {
    for (const end of [-1, 1]) {
      for (const stand of config.surfaceGraph.stands) {
        for (const phase of ['taxi-in', 'taxi-out']) {
          const route = surfaceRouteForFlight(config.surfaceGraph, runway.id, end, phase, stand.slot);
          if (!route || route.nodeIds.length < 2 || route.edgeIds.length !== route.nodeIds.length - 1) {
            throw new Error(config.code + ': missing ' + phase + ' route for runway ' + runway.id + ', end ' + end + ', stand ' + stand.id);
          }
          for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
            const sample = sampleSurfaceRoute(config.surfaceGraph, route.nodeIds, progress);
            if (!sample || !Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
              throw new Error(config.code + ': invalid route sample for ' + phase + ' at ' + progress);
            }
          }
          totals.routes += 1;
        }
      }
    }
  }
}

for (const seed of [1, 17, 991, 42_424]) {
  const first = JSON.stringify(generateAirportConfig(seed).surfaceGraph);
  const second = JSON.stringify(generateAirportConfig(seed).surfaceGraph);
  if (first !== second) throw new Error('seed ' + seed + ': surface graph is not deterministic');
}

const trafficConfigs = [
  ...HUB_AIRPORTS.map((_, index) => generateHubConfig(index)),
  ...Array.from({ length: 8 }, (_, index) => generateAirportConfig(50_000 + index * 313)),
];
for (const config of trafficConfigs) {
  const harness = new FixedStepSimulationHarness(config, { stepSeconds: 0.1 });
  const ticks = 6_000;
  harness.advanceTicks(ticks);
  const simulation = harness.simulation;
  const diagnostics = simulation.diagnostics();
  if (diagnostics.collisions.length || diagnostics.metrics.collisionAlerts) {
    throw new Error(config.code + ': collision detected during surface graph traffic run');
  }
  for (const flight of simulation.state.flights.filter((item) => item.phase === 'taxi-in' || item.phase === 'taxi-out' || item.phase === 'resting')) {
    if (!flight.surfaceRoute?.length || !flight.surfaceNode) throw new Error(config.code + ': surface flight ' + flight.id + ' has no graph route');
  }
  totals.trafficRuns += 1;
  totals.simulatedMinutes += ticks * 0.1 / 60;
}

console.log(JSON.stringify(totals));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'surface-graph-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Surface graph validation bundle was empty.');
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

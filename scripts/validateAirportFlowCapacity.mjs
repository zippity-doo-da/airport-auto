import { build } from "esbuild";

const validationSource = `
import { generateAirportConfig, generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { activeConfigurationConcurrency, buildAirportFlowCapacityProfile } from './src/simulation/airportFlowCapacity.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const configs = [
  ...HUB_AIRPORTS.map((_, index) => generateHubConfig(index, 20_000 + index)),
  ...Array.from({ length: 12 }, (_, index) => generateAirportConfig(30_000 + index * 97)),
];
const totals = { airports: configs.length, configurations: 0, constraints: 0, sourced: 0, schematic: 0 };

for (const config of configs) {
  const first = buildAirportFlowCapacityProfile(config);
  const second = buildAirportFlowCapacityProfile(config);
  assert(JSON.stringify(first) === JSON.stringify(second), config.code + ': capacity profile is not deterministic');
  assert(first.schemaVersion === 1 && first.nonNavigational, config.code + ': profile contract is invalid');
  assert(first.id === config.code.toLowerCase() + '-flow-capacity-v1', config.code + ': profile ID is unstable');
  assert(first.dataVersion.includes('flow-1'), config.code + ': data version is missing');
  assert(first.sources.length > 0 && first.disclosure.includes('not an FAA rate'), config.code + ': provenance/disclosure is missing');
  assert(first.structural.runwayCount === config.runways.length, config.code + ': runway count mismatch');
  assert(first.structural.standCount === config.surfaceGraph.stands.length, config.code + ': stand count mismatch');
  assert(first.structural.surfaceEdgeCount === config.surfaceGraph.edges.length, config.code + ': surface edge count mismatch');
  assert(first.modeledLimits.surfaceArrivalPositions >= 6 && first.modeledLimits.surfaceArrivalPositions <= 18, config.code + ': arrival surface buffer is outside its contract');
  assert(first.modeledLimits.standPositions === config.surfaceGraph.stands.length, config.code + ': stand capacity mismatch');
  assert(first.modeledLimits.maximumIndependentArrivalRunways >= 1 && first.modeledLimits.maximumIndependentArrivalRunways <= config.runways.length, config.code + ': arrival runway concurrency is invalid');
  assert(first.modeledLimits.maximumIndependentDepartureRunways >= 1 && first.modeledLimits.maximumIndependentDepartureRunways <= config.runways.length, config.code + ': departure runway concurrency is invalid');
  assert(first.constraints.every((constraint) => constraint.modeledCapacity >= 0 && constraint.rationale.length > 20), config.code + ': modeled constraint is incomplete');
  assert(first.fidelity === (config.surfaceGraph.source?.kind === 'imported' ? 'sourced-surface-hybrid' : 'schematic'), config.code + ': fidelity does not match the surface source');
  totals[first.fidelity === 'schematic' ? 'schematic' : 'sourced'] += 1;
  totals.constraints += first.constraints.length;

  for (const configuration of config.runwayConfigurations) {
    for (const direction of ['arrival', 'departure']) {
      const active = activeConfigurationConcurrency(config, configuration, direction);
      const allEligible = new Set(config.runways.filter((runway) => {
        const role = configuration.runwayRoles[runway.id] ?? runway.role;
        return role === direction || role === 'mixed';
      }).map((runway) => runway.id));
      const closed = activeConfigurationConcurrency(config, configuration, direction, allEligible);
      assert(active >= 0 && active <= allEligible.size, config.code + '/' + configuration.id + ': active concurrency is invalid');
      assert(closed === 0, config.code + '/' + configuration.id + ': runway closures did not reduce capacity to zero');
      totals.configurations += 1;
    }
  }
}

const ord = buildAirportFlowCapacityProfile(generateHubConfig(HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD')));
const local = buildAirportFlowCapacityProfile(generateAirportConfig(42));
assert(ord.structural.runwayCount > local.structural.runwayCount, 'ORD capacity structure is not distinct from a local airport');
assert(ord.modeledLimits.surfaceArrivalPositions >= local.modeledLimits.surfaceArrivalPositions, 'ORD surface model is smaller than a local airport');

console.log(JSON.stringify(totals));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "airport-flow-capacity-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Airport flow capacity validation bundle was empty.");
try {
  await import("data:text/javascript;base64," + Buffer.from(bundled).toString("base64"));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

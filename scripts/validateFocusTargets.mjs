import { build } from 'esbuild';

const validationSource = `
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { generateAirportConfig, generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { OPERATION_QUEUE_CATEGORIES } from './src/simulation/operationQueues.ts';
import { createFocusTargetRegistry, FOCUS_TARGET_KINDS, focusTargetKey } from './src/presentation/focusTargets.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function emptyQueue(state, entries = []) {
  return {
    generatedAtSeconds: state.elapsed,
    total: entries.length,
    longestWaitSeconds: Math.max(0, ...entries.map((entry) => entry.waitSeconds)),
    counts: Object.fromEntries(OPERATION_QUEUE_CATEGORIES.map((category) => [category, entries.filter((entry) => entry.category === category).length])),
    entries,
  };
}

function queueEntry(overrides) {
  return {
    id: 'queue-test',
    category: 'taxi',
    priority: 'attention',
    entity: 'system',
    label: 'Test queue',
    detail: 'A deterministic focus-target validation dependency.',
    waitSeconds: 12,
    position: 1,
    queueLength: 1,
    blockerFlightIds: [],
    ...overrides,
  };
}

const totals = { airports: 0, staticTargets: 0, dynamicTargets: 0, queueResolvers: 0, conflictResolvers: 0 };
const configs = [generateAirportConfig(7291), ...HUB_AIRPORTS.map((_, index) => generateHubConfig(index))];
for (const config of configs) {
  const simulation = new AirportSimulation(config);
  const catalog = createFocusTargetRegistry(config).build(simulation.state, simulation.queueSnapshot(), simulation.conflictPredictions());
  assert(catalog.schemaVersion === 1, config.code + ': focus catalog schema changed unexpectedly');
  assert(catalog.categories.map((category) => category.kind).join(',') === FOCUS_TARGET_KINDS.join(','), config.code + ': focus category order is unstable');
  assert(catalog.targets.filter((target) => target.kind === 'runway').length === config.runways.length, config.code + ': runway target count disagrees with config');
  assert(catalog.targets.some((target) => target.kind === 'taxiway'), config.code + ': no named taxiway focus targets');
  assert(catalog.targets.filter((target) => target.kind === 'gate').length === config.surfaceGraph.stands.length, config.code + ': gate target count disagrees with surface graph');
  assert(new Set(catalog.targets.map((target) => target.key)).size === catalog.targets.length, config.code + ': focus target keys must be unique');
  for (const target of catalog.targets) {
    assert(target.key === focusTargetKey(target), config.code + ': target key cannot be reconstructed from its reference');
    assert(target.position.every(Number.isFinite), config.code + ': target position must be finite');
    assert(Number.isFinite(target.radius) && target.radius >= 4, config.code + ': target radius is invalid');
    assert(target.suggestedZoom >= 0.08 && target.suggestedZoom <= 1.7, config.code + ': suggested zoom is outside camera limits');
  }
  totals.airports += 1;
  totals.staticTargets += catalog.targets.filter((target) => ['runway', 'taxiway', 'gate'].includes(target.kind)).length;
  totals.dynamicTargets += catalog.targets.filter((target) => target.kind === 'flight').length;
}

const ord = generateHubConfig(HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD'));
const ordSimulation = new AirportSimulation(ord);
const ordState = ordSimulation.state;
const registry = createFocusTargetRegistry(ord);
const baseCatalog = registry.build(ordState, emptyQueue(ordState), []);
assert(baseCatalog.targets.filter((target) => target.kind === 'runway').length === 8, 'ORD must expose all eight runways');
assert(baseCatalog.targets.filter((target) => target.kind === 'taxiway').length >= 100, 'ORD must expose its dense named taxiway network');
assert(baseCatalog.targets.filter((target) => target.kind === 'gate').length === 40, 'ORD must expose all forty modeled stands');

const flights = ordState.flights.slice(0, 2);
assert(flights.length === 2, 'ORD focus validation needs the initial departure bank');
const flightQueue = queueEntry({ id: 'flight-queue', entity: 'aircraft', flightId: flights[0].id });
const blockerQueue = queueEntry({ id: 'blocker-queue', blockerFlightIds: flights.map((flight) => flight.id) });
const runwayQueue = queueEntry({ id: 'runway-queue', category: 'runway', resourceId: 'runway:0' });
const gateId = ord.surfaceGraph.stands[0].id;
const gateQueue = queueEntry({ id: 'gate-queue', category: 'gate', resourceId: gateId });
const queueCatalog = registry.build(ordState, emptyQueue(ordState, [flightQueue, blockerQueue, runwayQueue, gateQueue]), []);
const queueTargets = new Map(queueCatalog.targets.filter((target) => target.kind === 'queue').map((target) => [target.id, target]));
assert(queueTargets.get('flight-queue')?.follow === 'flight' && queueTargets.get('flight-queue')?.selectableFlightId === flights[0].id, 'flight queue did not resolve to its live aircraft');
assert(queueTargets.get('blocker-queue')?.follow === 'group' && queueTargets.get('blocker-queue')?.flightIds.length === 2, 'system queue did not resolve to its blocker group');
assert(queueTargets.get('runway-queue')?.follow === 'static' && queueTargets.get('runway-queue')?.position.join(',') === ord.runways[0].center.join(','), 'runway queue did not resolve to protected pavement');
assert(queueTargets.get('gate-queue')?.follow === 'static' && queueTargets.get('gate-queue')?.position.join(',') === ord.surfaceGraph.stands[0].position.join(','), 'gate queue did not resolve to its stand');
totals.queueResolvers = queueTargets.size;

const conflict = {
  severity: 'warning',
  type: 'separation',
  flights: flights.map((flight) => flight.id),
  etaSeconds: 9,
  detail: 'Synthetic converging tracks',
};
const firstConflict = registry.build(ordState, emptyQueue(ordState), [conflict]).targets.find((target) => target.kind === 'conflict');
const reversedConflict = registry.build(ordState, emptyQueue(ordState), [{ ...conflict, flights: [...conflict.flights].reverse() }]).targets.find((target) => target.kind === 'conflict');
assert(firstConflict?.id === reversedConflict?.id, 'conflict identity must not depend on flight ordering');
assert(firstConflict?.follow === 'group' && firstConflict.flightIds.length === 2, 'conflict focus must follow every involved aircraft');
assert(firstConflict?.tone === 'rose', 'warning conflicts must use the urgent focus tone');
totals.conflictResolvers = 1;

console.log(JSON.stringify(totals));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'focus-target-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Focus-target validation bundle was empty.');
await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);

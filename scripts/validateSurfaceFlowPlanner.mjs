import { build } from 'esbuild';

const source = `
import { SurfaceFlowPlanner } from './src/simulation/surfaceFlowPlanner.ts';
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { surfaceRouteReservationClaims, surfaceTaxiwayFlowSectionEdgeIds } from './src/simulation/surfaceOperations.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const planner = new SurfaceFlowPlanner();
const north = { id: 'TWY-H', label: 'Taxiway H', direction: 'north', active: false, count: 3 };
const south = { id: 'TWY-H', label: 'Taxiway H', direction: 'south', active: false, count: 2 };
let decision = planner.plan(0, [north, south])[0];
assert(decision.direction === 'north', 'planner did not choose the strongest initial demand');
assert(decision.releaseAtSeconds === 60, 'planner did not create a minimum direction window');
decision = planner.plan(20, [{ ...north, count: 1 }, { ...south, count: 9 }])[0];
assert(decision.direction === 'north', 'planner reversed before its minimum window elapsed');
decision = planner.plan(70, [{ ...north, count: 1 }, { ...south, count: 9 }])[0];
assert(decision.direction === 'south', 'planner did not release a clear section to opposing queued traffic');
decision = planner.plan(200, [{ ...north, count: 9 }, { ...south, active: true, count: 1 }])[0];
assert(decision.direction === 'south', 'planner reversed a physically occupied taxiway section');
const restored = new SurfaceFlowPlanner();
restored.restore(planner.snapshot());
const originalNext = planner.plan(280, [{ ...north, count: 9 }, { ...south, count: 0 }])[0];
const restoredNext = restored.plan(280, [{ ...north, count: 9 }, { ...south, count: 0 }])[0];
assert(JSON.stringify(originalNext) === JSON.stringify(restoredNext), 'planner checkpoint restore changed its deterministic decision');
const claims = SurfaceFlowPlanner.claims([restoredNext]);
assert(claims.length === 1 && claims[0].kind === 'taxiway-flow' && claims[0].direction === restoredNext.direction, 'planner did not project its decision into a reservation claim');
const admissionPlanner = new SurfaceFlowPlanner();
admissionPlanner.plan(0, [north, south]);
assert(admissionPlanner.admissionReason([{ kind: 'taxiway-flow', id: 'TWY-H', label: 'Taxiway H', direction: 'south', capacity: Infinity }], 10)?.includes('Taxiway H north flow window'), 'planner did not explain an opposite-direction pushback admission hold');
assert(admissionPlanner.admissionReason([{ kind: 'taxiway-flow', id: 'TWY-H', label: 'Taxiway H', direction: 'north', capacity: Infinity }], 10) === null, 'planner blocked compatible pushback admission');
const ord = generateHubConfig(HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD'));
const ordSimulation = new AirportSimulation(ord);
const flowFlight = ordSimulation.state.flights.find((flight) => flight.phase === 'taxi-out');
assert(flowFlight, 'ORD opening bank contains no taxi-out aircraft for flow-section validation');
const flowClaim = surfaceRouteReservationClaims(ord.surfaceGraph, flowFlight.surfaceRoute, flowFlight.surfaceRouteEdges, flowFlight.progress, flowFlight.phase, 12)
  .find((claim) => claim.kind === 'taxiway-flow');
assert(flowClaim, 'ORD opening taxi route has no taxiway-flow section');
const governedEdges = surfaceTaxiwayFlowSectionEdgeIds(ord.surfaceGraph, flowClaim.id);
assert(governedEdges.length > 0, 'flow-section lookup returned no sourced graph edges');
assert(governedEdges.some((edgeId) => flowFlight.surfaceRouteEdges?.includes(edgeId)), 'flow-section lookup did not contain the claimed route edge');
console.log('surface flow planner validation passed');
`;

await build({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: 'surface-flow-planner-validation.ts', loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: '.surface-flow-planner-validation.mjs',
  logLevel: 'silent',
});

try {
  await import(`file://${process.cwd().replace(/\\/g, '/')}/.surface-flow-planner-validation.mjs?${Date.now()}`);
} finally {
  const { unlink } = await import('node:fs/promises');
  await unlink('.surface-flow-planner-validation.mjs').catch(() => {});
}

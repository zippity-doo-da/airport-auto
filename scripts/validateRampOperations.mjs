import { build } from "esbuild";

const validationSource = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { FixedStepSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import { findSurfaceRoute, surfaceRouteForFlight } from './src/simulation/surfaceGraph.ts';
import {
  SurfaceReservationLedger,
  surfaceCongestionPlanning,
  surfaceRampControlZones,
  surfaceRouteOperationalState,
  surfaceRouteReservationClaims,
  surfaceStandFlow,
} from './src/simulation/surfaceOperations.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const synthetic = {
  schemaVersion: 3,
  airportCode: 'RAMP',
  seed: 1,
  nodes: [
    { id: 'S', kind: 'stand', position: [0, 0], taxiwayIds: ['RAMP-ALPHA'], standId: 'S1' },
    { id: 'R', kind: 'apron-entry', position: [1, 0], taxiwayIds: ['RAMP-ALPHA'] },
    { id: 'A', kind: 'intersection', position: [2, 0], taxiwayIds: ['RAMP-ALPHA', 'NORTH', 'SOUTH'] },
    { id: 'B', kind: 'taxiway', position: [3, 1], taxiwayIds: ['NORTH'] },
    { id: 'C', kind: 'taxiway', position: [3, -1], taxiwayIds: ['SOUTH'] },
    { id: 'D', kind: 'taxiway', position: [4, 0], taxiwayIds: ['NORTH', 'SOUTH'] },
    { id: 'X', kind: 'taxiway', position: [2.49, 0.49], taxiwayIds: ['CROSS'] },
    { id: 'Y', kind: 'taxiway', position: [2.51, 0.51], taxiwayIds: ['CROSS'] },
  ],
  edges: [
    { id: 'SR', from: 'R', to: 'S', kind: 'stand-lead-in', name: 'Stand S1 lead-in', direction: 'both', width: 0.7, taxiwayId: 'RAMP-ALPHA' },
    { id: 'RA', from: 'R', to: 'A', kind: 'apron', name: 'Alpha alley', direction: 'both', width: 2.4, taxiwayId: 'RAMP-ALPHA' },
    { id: 'AB', from: 'A', to: 'B', kind: 'taxiway', name: 'North one-way', direction: 'forward', width: 2.4, taxiwayId: 'NORTH' },
    { id: 'BD', from: 'B', to: 'D', kind: 'taxiway', name: 'North exit', direction: 'both', width: 2.4, taxiwayId: 'NORTH' },
    { id: 'AC', from: 'A', to: 'C', kind: 'taxiway', name: 'South entry', direction: 'both', width: 2.4, taxiwayId: 'SOUTH' },
    { id: 'CD', from: 'C', to: 'D', kind: 'taxiway', name: 'South exit', direction: 'both', width: 2.4, taxiwayId: 'SOUTH' },
    { id: 'XY', from: 'X', to: 'Y', kind: 'taxiway', name: 'Disconnected crossing', direction: 'both', width: 2.4, taxiwayId: 'CROSS' },
  ],
  taxiways: [
    { id: 'RAMP-ALPHA', name: 'Alpha alley', edgeIds: ['SR', 'RA'], sourceKind: 'taxilane' },
    { id: 'NORTH', name: 'North route', edgeIds: ['AB', 'BD'], sourceKind: 'taxiway' },
    { id: 'SOUTH', name: 'South route', edgeIds: ['AC', 'CD'], sourceKind: 'taxiway' },
    { id: 'CROSS', name: 'Disconnected crossing', edgeIds: ['XY'], sourceKind: 'taxiway' },
  ],
  stands: [{
    id: 'S1', slot: 0, nodeId: 'S', apronTaxiwayId: 'RAMP-ALPHA', terminal: 'Test', position: [0, 0], heading: 0,
    zoneId: 'ZONE-APRON', maximumWingspanM: 72, supportedCategories: ['regional', 'narrowbody', 'widebody', 'cargo'],
    pushbackDirection: 'straight', pushbackHeading: 0, rampNodeId: 'R',
  }],
  passengerFacilities: [],
  runwayAccess: [],
  controlPoints: [],
  zones: [{
    id: 'ZONE-APRON', name: 'Test terminal apron', kind: 'terminal-apron', sourceFeatureIds: [], rings: [],
    edgeIds: ['SR', 'RA'], standIds: ['S1'], classification: 'derived',
  }],
  hotspots: [],
};

const standFlow = surfaceStandFlow(synthetic, 'S1');
assert(standFlow?.leadIn.nodeIds.join(',') === 'R,S', 'stand lead-in path is not ramp-to-stand');
assert(standFlow?.leadOut.nodeIds.join(',') === 'S,R', 'stand lead-out path is not stand-to-ramp');
const rampZones = surfaceRampControlZones(synthetic);
assert(rampZones.length === 1 && rampZones[0].capacity === 2, 'terminal ramp-control capacity is wrong');
const outsideRamp = surfaceRouteOperationalState(synthetic, ['A', 'B'], ['AB'], 0.1, 'taxi-in', 'S1');
const insideRamp = surfaceRouteOperationalState(synthetic, ['A', 'R', 'S'], ['RA', 'SR'], 0.1, 'taxi-in', 'S1');
assert(outsideRamp.rampControlZoneId === null, 'an assigned stand claimed ramp control while the aircraft was still on a movement-area taxiway');
assert(insideRamp.rampControlZoneId === 'RAMP-ZONE-APRON', 'ramp-control entry was not detected from the aircraft current edge');

const outboundClaims = surfaceRouteReservationClaims(synthetic, ['S', 'R', 'A'], ['SR', 'RA'], 0.1, 'taxi-out', 2);
const inboundClaims = surfaceRouteReservationClaims(synthetic, ['A', 'R', 'S'], ['RA', 'SR'], 0.1, 'taxi-in', 2);
assert(outboundClaims.some((claim) => claim.kind === 'stand' && claim.id === 'S1'), 'lead-out has no exclusive stand claim');
assert(outboundClaims.some((claim) => claim.kind === 'ramp-zone' && claim.id === 'RAMP-ZONE-APRON'), 'lead-out has no ramp-control claim');
assert(outboundClaims.some((claim) => claim.kind === 'alley' && claim.direction === 'outbound'), 'lead-out has no outbound alley claim');
assert(inboundClaims.some((claim) => claim.kind === 'alley' && claim.direction === 'inbound'), 'lead-in has no inbound alley claim');
const alleyLedger = new SurfaceReservationLedger();
const outboundAlley = outboundClaims.filter((claim) => claim.kind === 'alley');
const inboundAlley = inboundClaims.filter((claim) => claim.kind === 'alley');
alleyLedger.reserve(1, outboundAlley);
assert(!alleyLedger.firstConflict(outboundAlley), 'same-direction alley flow was blocked');
assert(alleyLedger.firstConflict(inboundAlley)?.kind === 'alley', 'opposing alley flow was not blocked');
const directionalBranchGraph = {
  ...synthetic,
  nodes: [
    ...synthetic.nodes,
    { id: 'W', kind: 'taxiway', position: [-1, 1], taxiwayIds: ['RAMP-B-C-W'] },
    { id: 'C2', kind: 'taxiway', position: [-1, -1], taxiwayIds: ['RAMP-B-C-C'] },
  ],
  edges: [
    ...synthetic.edges,
    { id: 'WA', from: 'W', to: 'A', kind: 'taxiway', name: 'Ramp B/C west branch', direction: 'both', width: 1.8, taxiwayId: 'RAMP-B-C-W' },
    { id: 'C2A', from: 'C2', to: 'A', kind: 'taxiway', name: 'Ramp B/C center branch', direction: 'both', width: 1.8, taxiwayId: 'RAMP-B-C-C' },
  ],
};
const westBranchClaims = surfaceRouteReservationClaims(directionalBranchGraph, ['W', 'A'], ['WA'], 0.1, 'taxi-in', 0);
const centerBranchClaims = surfaceRouteReservationClaims(directionalBranchGraph, ['C2', 'A'], ['C2A'], 0.1, 'taxi-out', 0);
const westBranchAlley = westBranchClaims.find((claim) => claim.kind === 'alley');
const centerBranchAlley = centerBranchClaims.find((claim) => claim.kind === 'alley');
assert(westBranchAlley?.id === 'RAMP-B-C' && centerBranchAlley?.id === 'RAMP-B-C', 'directional ramp branches did not share one physical alley');
const directionalAlleyLedger = new SurfaceReservationLedger();
directionalAlleyLedger.reserve(1, westBranchClaims.filter((claim) => claim.kind === 'alley'));
assert(directionalAlleyLedger.firstConflict(centerBranchClaims.filter((claim) => claim.kind === 'alley'), 2)?.kind === 'alley', 'opposing directional ramp branches were admitted into one terminal alley');
const southboundClaims = surfaceRouteReservationClaims(synthetic, ['A', 'C', 'D'], ['AC', 'CD'], 0.1, 'taxi-out', 2);
const northboundClaims = surfaceRouteReservationClaims(synthetic, ['D', 'C', 'A'], ['CD', 'AC'], 0.1, 'taxi-in', 2);
const southboundFlow = southboundClaims.filter((claim) => claim.kind === 'taxiway-flow');
const northboundFlow = northboundClaims.filter((claim) => claim.kind === 'taxiway-flow');
assert(southboundFlow.length === 1 && northboundFlow.length === 1, 'named taxiway did not produce one directional flow claim');
const taxiwayFlowLedger = new SurfaceReservationLedger();
taxiwayFlowLedger.reserve(1, southboundFlow);
assert(!taxiwayFlowLedger.firstConflict(southboundFlow, 2), 'same-direction named taxiway flow was blocked');
assert(taxiwayFlowLedger.firstConflict(northboundFlow, 2)?.kind === 'taxiway-flow', 'opposing named taxiway flow was not blocked');
const crossingClaims = surfaceRouteReservationClaims(synthetic, ['X', 'Y'], ['XY'], 0.1, 'taxi-in', 0);
const disconnectedClaims = surfaceRouteReservationClaims(synthetic, ['A', 'B'], ['AB'], 0.1, 'taxi-out', 0);
const geometricClaims = disconnectedClaims.filter((claim) => claim.kind === 'node' && claim.id.startsWith('geometric:'));
const crossingGeometricClaims = crossingClaims.filter((claim) => claim.kind === 'node' && claim.id.startsWith('geometric:'));
assert(geometricClaims.length > 0 && crossingGeometricClaims.length > 0, 'disconnected geometric junction produced no reservation claim');
const geometricLedger = new SurfaceReservationLedger();
geometricLedger.reserve(1, geometricClaims);
assert(geometricLedger.firstConflict(crossingGeometricClaims, 2)?.kind === 'node', 'disconnected geometric junction admitted conflicting traffic');
const zoneClaim = outboundClaims.find((claim) => claim.kind === 'ramp-zone');
assert(zoneClaim, 'synthetic route has no zone claim');
const zoneLedger = new SurfaceReservationLedger();
zoneLedger.reserve(1, [zoneClaim]);
zoneLedger.reserve(2, [zoneClaim]);
assert(zoneLedger.firstConflict([zoneClaim])?.kind === 'ramp-zone', 'ramp-control capacity was not enforced');
assert(!zoneLedger.firstConflict([zoneClaim], 1), 'an incumbent was prevented from clearing a full ramp-control zone');
assert(zoneLedger.firstConflict([zoneClaim], 3)?.kind === 'ramp-zone', 'a new entrant was admitted into a full ramp-control zone');
const standClaim = outboundClaims.find((claim) => claim.kind === 'stand');
assert(standClaim, 'synthetic route has no stand claim');
const standLedger = new SurfaceReservationLedger();
standLedger.reserve(1, [standClaim]);
assert(standLedger.firstConflict([standClaim])?.kind === 'stand', 'stand path was not exclusive');

const baseline = findSurfaceRoute(synthetic, 'A', 'D');
assert(baseline && baseline.edgeIds.length === 2, 'baseline router did not find a two-edge path');
const planning = surfaceCongestionPlanning(synthetic, [{
  flightId: 7,
  phase: 'taxi-out',
  nodeIds: baseline.nodeIds,
  edgeIds: baseline.edgeIds,
  progress: 0,
}]);
const diverted = findSurfaceRoute(synthetic, 'A', 'D', undefined, planning);
assert(diverted && diverted.edgeIds.join(',') !== baseline.edgeIds.join(','), 'congestion-aware router did not choose the free route');
assert(diverted.congestionPenalty === 0, 'selected free route reports a congestion penalty');
const reverse = findSurfaceRoute(synthetic, 'B', 'A');
assert(reverse && !reverse.edgeIds.includes('AB'), 'router violated a one-way edge in reverse');

const ord = generateHubConfig(4);
const ordRampZones = surfaceRampControlZones(ord.surfaceGraph);
assert(ordRampZones.length >= 15, 'ORD has too few active ramp-control zones');
let standRoutes = 0;
for (const stand of ord.surfaceGraph.stands) {
  const flow = surfaceStandFlow(ord.surfaceGraph, stand.id);
  assert(flow, 'ORD stand has no explicit flow path: ' + stand.id);
  const runway = ord.runways.find((candidate) => candidate.role !== 'inactive');
  const inbound = surfaceRouteForFlight(ord.surfaceGraph, runway.id, runway.landingEnd, 'taxi-in', stand.slot);
  const outbound = surfaceRouteForFlight(ord.surfaceGraph, runway.id, runway.landingEnd, 'taxi-out', stand.slot);
  assert(inbound?.edgeIds.at(-1) === flow.leadIn.edgeIds[0], 'ORD arrival does not end on declared lead-in: ' + stand.id);
  assert(outbound?.edgeIds[0] === flow.leadOut.edgeIds[0], 'ORD departure does not start on declared lead-out: ' + stand.id);
  standRoutes += 2;
}

const harness = new FixedStepSimulationHarness(ord, { stepSeconds: 0.1 });
const simulation = harness.simulation;
simulation.setScenario('rush');
simulation.setTrafficDensity('rush');
let maximumSurfaceMovers = 0;
let operationalFlights = 0;
let congestionPlannedFlights = 0;
let liveCongestionPlanningSamples = 0;
let maximumOccupiedEdgesConsidered = 0;
let alleyHoldSamples = 0;
let rampCapacityHoldSamples = 0;
let standHoldSamples = 0;
for (let tick = 0; tick < 6_000; tick += 1) {
  harness.advanceTicks(1);
  const surfaceFlights = simulation.state.flights.filter((flight) => flight.phase === 'taxi-in' || flight.phase === 'taxi-out');
  maximumSurfaceMovers = Math.max(maximumSurfaceMovers, surfaceFlights.filter((flight) => !flight.automaticHold && flight.kinematics.groundSpeedKts > 0.5).length);
  operationalFlights += surfaceFlights.filter((flight) => flight.surfaceFlowDirection && flight.rampControlZoneId).length;
  congestionPlannedFlights += surfaceFlights.filter((flight) => (flight.surfaceCongestedEdgeIds?.length ?? 0) > 0).length;
  const livePlanning = surfaceCongestionPlanning(ord.surfaceGraph, surfaceFlights
    .filter((flight) => flight.surfaceRoute?.length && flight.surfaceRouteEdges?.length)
    .map((flight) => ({
      flightId: flight.id,
      phase: flight.phase,
      nodeIds: flight.surfaceRoute,
      edgeIds: flight.surfaceRouteEdges,
      progress: flight.progress,
    })));
  if (livePlanning.occupiedEdgeIds.length > 0) liveCongestionPlanningSamples += 1;
  maximumOccupiedEdgesConsidered = Math.max(maximumOccupiedEdgesConsidered, livePlanning.occupiedEdgeIds.length);
  alleyHoldSamples += surfaceFlights.filter((flight) => flight.automaticHoldReason?.includes('one-way control')).length;
  rampCapacityHoldSamples += surfaceFlights.filter((flight) => flight.automaticHoldReason?.includes('ramp-control zone')).length;
  standHoldSamples += surfaceFlights.filter((flight) => flight.automaticHoldReason?.includes('stand path')).length;
  const diagnostics = simulation.diagnostics();
  assert(diagnostics.collisions.length === 0, 'ORD ramp soak produced an aircraft collision');
  assert(diagnostics.obstacleCollisions.length === 0, 'ORD ramp soak produced an obstacle collision');
}
assert(maximumSurfaceMovers >= 2, 'ramp coordinator regressed to a single global mover');
assert(operationalFlights > 0, 'ORD flights never reported ramp-control state');
assert(
  liveCongestionPlanningSamples > 0 && maximumOccupiedEdgesConsidered > 0,
  'ORD routes never considered live congestion: ' + JSON.stringify({
    maximumSurfaceMovers,
    operationalFlights,
    congestionPlannedFlights,
    liveCongestionPlanningSamples,
    maximumOccupiedEdgesConsidered,
    alleyHoldSamples,
    rampCapacityHoldSamples,
    standHoldSamples,
  }),
);

console.log(JSON.stringify({
  syntheticClaims: outboundClaims.length + inboundClaims.length,
  rampZones: ordRampZones.length,
  standRoutes,
  maximumSurfaceMovers,
  operationalFlightSamples: operationalFlights,
  selectedCongestedRouteSamples: congestionPlannedFlights,
  liveCongestionPlanningSamples,
  maximumOccupiedEdgesConsidered,
  alleyHoldSamples,
  rampCapacityHoldSamples,
  standHoldSamples,
  simulatedMinutes: 10,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "ramp-operations-validation.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});

const source = Buffer.from(result.outputFiles[0].contents).toString("base64");
await import("data:text/javascript;base64," + source);

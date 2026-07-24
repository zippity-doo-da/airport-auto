import { build } from 'esbuild';

const validationSource = `
import { AIRCRAFT_ROSTER, aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { runwaySupportsAircraft } from './src/simulation/runwayPerformance.ts';
import {
  findSurfaceRoute,
  surfaceRouteForFlight,
  surfaceStandSupportsAircraft,
} from './src/simulation/surfaceGraph.ts';
import {
  sampleAircraftSurfaceMotion,
  surfaceStoppingDistanceM,
} from './src/simulation/surfaceMotion.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function angleDifference(first, second) {
  return Math.abs(Math.atan2(Math.sin(second - first), Math.cos(second - first)));
}

const synthetic = {
  schemaVersion: 3,
  airportCode: 'TEST',
  seed: 1,
  nodes: [
    { id: 'A', kind: 'taxiway', position: [0, 0], taxiwayIds: ['WIDE', 'NARROW'] },
    { id: 'B', kind: 'intersection', position: [3, 0], taxiwayIds: ['WIDE'] },
    { id: 'C', kind: 'taxiway', position: [3, 3], taxiwayIds: ['WIDE', 'NARROW'] },
    { id: 'D', kind: 'intersection', position: [1.5, 1.5], taxiwayIds: ['NARROW'] },
  ],
  edges: [
    { id: 'AB', from: 'A', to: 'B', kind: 'taxiway', name: 'Wide taxiway', direction: 'both', width: 2.4, taxiwayId: 'WIDE' },
    { id: 'BC', from: 'B', to: 'C', kind: 'taxiway', name: 'Wide taxiway', direction: 'both', width: 2.4, taxiwayId: 'WIDE' },
    { id: 'AD', from: 'A', to: 'D', kind: 'taxiway', name: 'Narrow shortcut', direction: 'both', width: 0.8, taxiwayId: 'NARROW' },
    { id: 'DC', from: 'D', to: 'C', kind: 'taxiway', name: 'Narrow shortcut', direction: 'both', width: 0.8, taxiwayId: 'NARROW' },
  ],
  taxiways: [
    { id: 'WIDE', name: 'Wide taxiway', edgeIds: ['AB', 'BC'] },
    { id: 'NARROW', name: 'Narrow shortcut', edgeIds: ['AD', 'DC'] },
  ],
  stands: [],
  passengerFacilities: [],
  runwayAccess: [],
  controlPoints: [],
  zones: [],
  hotspots: [],
};

const a320 = aircraftProfile('A320');
const unrestricted = findSurfaceRoute(synthetic, 'A', 'C');
assert(unrestricted?.edgeIds.includes('AD'), 'unrestricted router did not choose the shorter narrow path');
const route = findSurfaceRoute(synthetic, 'A', 'C', {
  wingspanM: a320.wingspanM,
  minimumWingtipClearanceM: a320.minimumWingtipClearanceM,
});
assert(route?.edgeIds.join(',') === 'AB,BC', 'wingtip-aware router did not avoid the narrow path');

let previous = sampleAircraftSurfaceMotion(synthetic, route.nodeIds, route.edgeIds, 0, a320);
assert(previous, 'missing initial surface-motion sample');
let maximumStep = 0;
let maximumHeadingStep = 0;
let turnSamples = 0;
let advanceBrakingSamples = 0;
let minimumTurnRadius = Infinity;
for (let index = 1; index <= 2_000; index += 1) {
  const sample = sampleAircraftSurfaceMotion(synthetic, route.nodeIds, route.edgeIds, index / 2_000, a320);
  assert(sample && Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.heading), 'surface-motion sample is not finite');
  assert(sample.distanceAlong + 1e-9 >= previous.distanceAlong, 'surface-motion distance moved backwards');
  maximumStep = Math.max(maximumStep, Math.hypot(sample.x - previous.x, sample.y - previous.y));
  maximumHeadingStep = Math.max(maximumHeadingStep, angleDifference(previous.heading, sample.heading));
  if (sample.turnRadiusM !== undefined) {
    turnSamples += 1;
    minimumTurnRadius = Math.min(minimumTurnRadius, sample.turnRadiusM);
    assert(sample.speedLimitKts <= a320.taxiTurnKts + 1e-6, 'turn speed exceeds aircraft limit');
  } else if (sample.speedLimitKts < a320.taxiKts - 0.05) {
    advanceBrakingSamples += 1;
  }
  assert(sample.routeClearanceOk, 'wide synthetic route failed its clearance envelope');
  assert(sample.minimumRouteWingtipClearanceM >= a320.minimumWingtipClearanceM, 'reported route clearance is below the requirement');
  previous = sample;
}
assert(turnSamples > 50, 'right-angle path did not produce a sustained circular turn');
assert(advanceBrakingSamples > 20, 'aircraft did not brake in advance of the turn');
assert(Math.abs(minimumTurnRadius - a320.taxiTurnRadiusM) < 0.05, 'turn did not use the A320 design radius');
assert(maximumStep < 0.01, 'surface position is discontinuous at a turn: ' + maximumStep);
assert(maximumHeadingStep < 0.01, 'surface heading snaps at a turn: ' + maximumHeadingStep);
assert(previous.totalDistance < route.distance && previous.totalDistance > route.distance * 0.9, 'fillet path length is implausible');

const a320Stop = surfaceStoppingDistanceM(a320, a320.taxiKts);
assert(a320Stop > 55 && a320Stop < 80, 'A320 taxi stopping distance is implausible: ' + a320Stop);
assert(surfaceStoppingDistanceM(aircraftProfile('Q400'), aircraftProfile('Q400').taxiKts) < a320Stop, 'Q400 and A320 stopping behavior is not aircraft-specific');

const ord = generateHubConfig(4);
let ordRoutes = 0;
let ordTurnSamples = 0;
let minimumOrdClearance = Infinity;
for (const model of AIRCRAFT_ROSTER) {
  const profile = aircraftProfile(model);
  let fixture = null;
  for (const runway of ord.runways.filter((candidate) => candidate.role !== 'inactive' && runwaySupportsAircraft(candidate, model, 'landing'))) {
    for (const stand of ord.surfaceGraph.stands.filter((candidate) => surfaceStandSupportsAircraft(candidate, profile.category, profile.wingspanM))) {
      const candidate = surfaceRouteForFlight(
        ord.surfaceGraph,
        runway.id,
        runway.landingEnd,
        'taxi-in',
        stand.slot,
        { wingspanM: profile.wingspanM, minimumWingtipClearanceM: profile.minimumWingtipClearanceM },
      );
      if (candidate) {
        fixture = candidate;
        break;
      }
    }
    if (fixture) break;
  }
  assert(fixture, 'ORD has no clearance-compatible taxi route for ' + model);
  let modelTurns = 0;
  let prior = sampleAircraftSurfaceMotion(ord.surfaceGraph, fixture.nodeIds, fixture.edgeIds, 0, profile);
  assert(prior, 'ORD route has no initial motion sample for ' + model);
  for (let index = 1; index <= 1_000; index += 1) {
    const sample = sampleAircraftSurfaceMotion(ord.surfaceGraph, fixture.nodeIds, fixture.edgeIds, index / 1_000, profile);
    assert(sample && sample.routeClearanceOk, 'ORD route violates wingtip clearance for ' + model);
    assert(sample.distanceAlong + 1e-8 >= prior.distanceAlong, 'ORD motion distance moved backwards for ' + model);
    if (sample.turnRadiusM !== undefined) modelTurns += 1;
    minimumOrdClearance = Math.min(minimumOrdClearance, sample.minimumRouteWingtipClearanceM);
    prior = sample;
  }
  assert(modelTurns > 0, 'ORD route contains no smoothed turn for ' + model);
  ordTurnSamples += modelTurns;
  ordRoutes += 1;
}

console.log(JSON.stringify({
  profiles: AIRCRAFT_ROSTER.length,
  syntheticSamples: 2_001,
  syntheticTurnSamples: turnSamples,
  advanceBrakingSamples,
  maximumStep,
  maximumHeadingStep,
  a320StoppingDistanceM: Number(a320Stop.toFixed(1)),
  ordRoutes,
  ordTurnSamples,
  minimumOrdClearanceM: Number(minimumOrdClearance.toFixed(1)),
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'surface-motion-validation.ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});

const source = Buffer.from(result.outputFiles[0].contents).toString('base64');
await import('data:text/javascript;base64,' + source);

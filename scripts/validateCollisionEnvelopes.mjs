import { build } from 'esbuild';

const validationSource = `
import { AIRCRAFT_ROSTER, aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import { generateAirportConfig, generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import {
  detectAircraftObstacleConflict,
  detectFlightConflict,
} from './src/simulation/collisionDetection.ts';
import { validateAirportObstacleEnvelopes } from './src/simulation/airportObstacles.ts';
import { FixedStepSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import { standReservationsConflict } from './src/simulation/gateAssignment.ts';
import { runwaySupportsAircraft } from './src/simulation/runwayPerformance.ts';
import { sceneryClearanceEnvelopes } from './src/render/sceneryPlacement.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const configs = [
  ...Array.from({ length: 64 }, (_, index) => generateAirportConfig(90_000 + index * 131)),
  ...HUB_AIRPORTS.map((_, index) => generateHubConfig(index)),
];
const visualBodyRadius = (scope, model) => {
  const visual = aircraftProfile(model).visual;
  const scale = scope === 'center' ? 0.17 : 0.92;
  return Math.max(visual.bodyRadius * scale, (visual.bodyLength + visual.bodyRadius * 2) / 2 * scale, visual.wingSpan / 2 * scale);
};
const largestVisualAircraft = (scope) => AIRCRAFT_ROSTER.reduce((largest, model) => (
  visualBodyRadius(scope, model) > visualBodyRadius(scope, largest) ? model : largest
));

function pointToSegmentDistance(point, start, end) {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const amount = lengthSquared <= 0
    ? 0
    : Math.max(0, Math.min(1, ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaY) / lengthSquared));
  return Math.hypot(point[0] - start[0] - amount * deltaX, point[1] - start[1] - amount * deltaY);
}

const totals = {
  airports: configs.length,
  obstacleEnvelopes: 0,
  pavementSamples: 0,
  sceneryEnvelopeChecks: 0,
  standPairs: 0,
  mutuallyExclusiveStandPairs: 0,
  trafficRuns: 0,
  ticks: 0,
  aircraftEnvelopeTicks: 0,
  runwayAssignmentTicks: 0,
  ordB77fAssignmentTicks: 0,
  spawnedFlights: 0,
  simulatedHours: 0,
};

for (const config of configs) {
  const largestAircraft = largestVisualAircraft(config.scope);
  const maximumBodyRadius = visualBodyRadius(config.scope, largestAircraft);
  const validation = validateAirportObstacleEnvelopes(config);
  assert(validation.valid, config.code + ' seed ' + config.seed + ': ' + validation.errors.join('; '));
  assert(validation.counts.terminals === 1, config.code + ': expected one terminal envelope');
  assert(validation.counts.towers === 1, config.code + ': expected one tower envelope');
  totals.obstacleEnvelopes += validation.counts.obstacles;

  const nodes = new Map(config.surfaceGraph.nodes.map((node) => [node.id, node]));
  if (config.code === 'ORD') {
    const detailTreeCounts = [config.treeCount, Math.max(8, Math.floor(config.treeCount * 0.45))];
    for (const treeCount of detailTreeCounts) {
      for (const scenery of sceneryClearanceEnvelopes(config, treeCount)) {
        for (const edge of config.surfaceGraph.edges) {
          const from = nodes.get(edge.from);
          const to = nodes.get(edge.to);
          assert(from && to, config.code + ': scenery clearance edge ' + edge.id + ' has a missing node');
          const distance = pointToSegmentDistance(scenery.position, from.position, to.position);
          const requiredClearance = edge.width / 2 + scenery.radius + maximumBodyRadius;
          assert(distance >= requiredClearance, config.code + ': ' + scenery.id + ' intrudes into aircraft clearance on ' + edge.id + ' (' + distance.toFixed(2) + ' < ' + requiredClearance.toFixed(2) + ')');
          totals.sceneryEnvelopeChecks += 1;
        }
      }
    }
  }
  for (const edge of config.surfaceGraph.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    assert(from && to, config.code + ': edge ' + edge.id + ' has a missing node');
    const length = Math.hypot(to.position[0] - from.position[0], to.position[1] - from.position[1]);
    const samples = Math.max(1, Math.ceil(length / 2));
    for (let index = 0; index <= samples; index += 1) {
      const amount = index / samples;
      const aircraft = {
        kind: 'aircraft', id: -1,
        x: from.position[0] + (to.position[0] - from.position[0]) * amount,
        y: from.position[1] + (to.position[1] - from.position[1]) * amount,
        altitude: 2.1, heading: 0,
        halfLength: maximumBodyRadius, halfWidth: maximumBodyRadius, bodyRadius: maximumBodyRadius,
        minimumAltitude: 0.7, maximumAltitude: 4.1,
        airborne: false, surface: true,
        protectedSurface: edge.kind === 'runway' || edge.kind === 'runway-access',
        runway: edge.runwayId ?? -1,
        taxiway: edge.taxiwayId,
        surfaceEdge: edge.id,
      };
      for (const obstacle of config.obstacles) {
        const conflict = detectAircraftObstacleConflict(aircraft, obstacle);
        assert(!conflict, config.code + ': largest aircraft envelope intersects ' + obstacle.id + ' on edge ' + edge.id + ' ' + JSON.stringify({
          edge: { kind: edge.kind, name: edge.name, from: from.position, to: to.position },
          sample: [aircraft.x, aircraft.y],
          obstacle,
          conflict,
        }));
      }
      totals.pavementSamples += 1;
    }
  }

  for (let first = 0; first < config.surfaceGraph.stands.length; first += 1) {
    for (let second = first + 1; second < config.surfaceGraph.stands.length; second += 1) {
      const firstStand = config.surfaceGraph.stands[first];
      const secondStand = config.surfaceGraph.stands[second];
      const separation = Math.hypot(firstStand.position[0] - secondStand.position[0], firstStand.position[1] - secondStand.position[1]);
      if (separation < maximumBodyRadius * 2 + 0.35) {
        assert(
          standReservationsConflict(config, firstStand.id, largestAircraft, secondStand.id, largestAircraft),
          config.code + ': close stands ' + firstStand.id + ' and ' + secondStand.id + ' lack a mutual-exclusion reservation rule',
        );
        totals.mutuallyExclusiveStandPairs += 1;
      }
      totals.standPairs += 1;
    }
  }
}

const baseEnvelope = {
  kind: 'aircraft', altitude: 12, heading: 0,
  halfLength: 4, halfWidth: 4, bodyRadius: 4,
  minimumAltitude: 10, maximumAltitude: 14,
  airborne: true, surface: false, protectedSurface: false,
  runway: 0,
};
const physicalOverlap = detectFlightConflict(
  { ...baseEnvelope, id: 1, x: 0, y: 0 },
  { ...baseEnvelope, id: 2, x: 7, y: 0, taxiway: 'OTHER' },
  'medium', 'medium', false,
);
assert(physicalOverlap?.detail === 'physical aircraft envelopes overlap', 'physical aircraft overlap was not detected across unrelated routes');
const verticalSeparation = detectFlightConflict(
  { ...baseEnvelope, id: 1, x: 0, y: 0 },
  { ...baseEnvelope, id: 2, x: 0, y: 0, altitude: 30, minimumAltitude: 28, maximumAltitude: 32 },
  'medium', 'medium', false,
);
assert(!verticalSeparation, 'vertically separated aircraft were reported as overlapping');
const operationalSurfaceSpacing = detectFlightConflict(
  { ...baseEnvelope, id: 1, x: 0, y: 0, altitude: 2, minimumAltitude: 1, maximumAltitude: 3, airborne: false, surface: true, taxiway: 'TWY-A' },
  { ...baseEnvelope, id: 2, x: 9, y: 0, altitude: 2, minimumAltitude: 1, maximumAltitude: 3, airborne: false, surface: true, taxiway: 'TWY-A' },
  'medium', 'medium', false,
);
const physicalSurfaceCollision = detectFlightConflict(
  { ...baseEnvelope, id: 1, x: 0, y: 0, altitude: 2, minimumAltitude: 1, maximumAltitude: 3, airborne: false, surface: true, taxiway: 'TWY-A' },
  { ...baseEnvelope, id: 2, x: 9, y: 0, altitude: 2, minimumAltitude: 1, maximumAltitude: 3, airborne: false, surface: true, taxiway: 'TWY-A' },
  'medium', 'medium', false, false,
);
assert(operationalSurfaceSpacing?.type === 'surface', 'prospective taxi separation buffer was not detected');
assert(!physicalSurfaceCollision, 'a clear, safely diverging taxi pair was reported as a physical collision');

for (const config of configs) {
  const harness = new FixedStepSimulationHarness(config, { stepSeconds: 0.1, pace: 3, scenario: 'rush', density: 'rush' });
  const ticks = 3_000;
  for (let tick = 0; tick < ticks; tick += 1) {
    harness.advanceTicks(1);
    totals.aircraftEnvelopeTicks += harness.simulation.state.flights.length;
    for (const flight of harness.simulation.state.flights) {
      const operation = flight.phase === 'taxi-out' || flight.phase === 'takeoff' ? 'takeoff' : 'landing';
      assert(runwaySupportsAircraft(config.runways[flight.runway], flight.aircraft, operation), config.code + ' seed ' + config.seed + ' tick ' + tick + ': ' + flight.aircraft + ' assigned to undersized runway ' + flight.runway + ' for ' + operation);
      totals.runwayAssignmentTicks += 1;
      if (config.code === 'ORD' && flight.aircraft === 'B77F') totals.ordB77fAssignmentTicks += 1;
    }
    const liveDiagnostics = harness.simulation.diagnostics();
    assert(liveDiagnostics.collisions.length === 0 && liveDiagnostics.obstacleCollisions.length === 0, config.code + ' seed ' + config.seed + ' tick ' + tick + ': transient collision ' + JSON.stringify({
      collisions: liveDiagnostics.collisions,
      obstacleCollisions: liveDiagnostics.obstacleCollisions,
      flights: harness.simulation.state.flights.map((flight) => ({
        id: flight.id,
        phase: flight.phase,
        progress: flight.progress,
        safetyHold: flight.safetyHold,
        reason: flight.safetyHoldReason,
        route: flight.surfaceRoute,
      })),
      recentEvents: harness.snapshot().events
        .filter((event) => liveDiagnostics.collisions.some((collision) => collision.first === event.flightId || collision.second === event.flightId))
        .slice(-24),
      envelopes: liveDiagnostics.collisionEnvelopes.aircraft,
    }));
  }
  const snapshot = harness.snapshot();
  assert(snapshot.diagnostics.collisionPairs.length === 0, config.code + ': active aircraft overlap after rush run');
  assert(snapshot.diagnostics.obstacleCollisions.length === 0, config.code + ': active aircraft-building overlap after rush run');
  assert(snapshot.diagnostics.metrics.collisionAlerts === 0, config.code + ' seed ' + config.seed + ': transient collision envelope breach during rush run ' + JSON.stringify({
    collisionPairs: snapshot.diagnostics.collisionPairs,
    obstacleCollisions: snapshot.diagnostics.obstacleCollisions,
    metrics: snapshot.diagnostics.metrics,
    flights: snapshot.flights.map((flight) => ({ id: flight.id, phase: flight.phase, progress: flight.progress, trajectory: flight.trajectory })),
  }));
  totals.spawnedFlights += snapshot.events.filter((event) => event.type === 'spawn').length;
  totals.trafficRuns += 1;
  totals.ticks += ticks;
  totals.simulatedHours += snapshot.simulationTimeSeconds / 3_600;
}

const watchConfig = generateHubConfig(HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD'));
const watchHarness = new FixedStepSimulationHarness(watchConfig, { stepSeconds: 0.1, pace: 3, scenario: 'rush', density: 'rush' });
watchHarness.simulation.setMode('watch');
for (let tick = 0; tick < 3_000; tick += 1) {
  watchHarness.advanceTicks(1);
  const diagnostics = watchHarness.simulation.diagnostics();
  assert(
    diagnostics.collisions.length === 0 && diagnostics.obstacleCollisions.length === 0,
    'ORD Watch tick ' + tick + ': collision during Rush soak',
  );
  totals.aircraftEnvelopeTicks += watchHarness.simulation.state.flights.length;
}
const watchSnapshot = watchHarness.snapshot();
assert(watchSnapshot.diagnostics.metrics.collisionAlerts === 0, 'ORD Watch: transient collision during Rush soak');
assert(watchSnapshot.state.arrivals > 0 && watchSnapshot.state.departures > 0, 'ORD Watch: Rush soak did not sustain both arrivals and departures');
totals.spawnedFlights += watchSnapshot.events.filter((event) => event.type === 'spawn').length;
totals.trafficRuns += 1;
totals.ticks += 3_000;
totals.simulatedHours += watchSnapshot.simulationTimeSeconds / 3_600;

assert(totals.aircraftEnvelopeTicks >= 10_000, 'fewer than 10,000 active aircraft envelope ticks were checked');
assert(totals.ordB77fAssignmentTicks > 0, 'O’Hare traffic never exercised a B77F runway assignment');
console.log(JSON.stringify(totals));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'collision-envelope-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Collision envelope validation bundle was empty.');
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

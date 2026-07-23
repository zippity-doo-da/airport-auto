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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const configs = [
  ...Array.from({ length: 64 }, (_, index) => generateAirportConfig(90_000 + index * 131)),
  ...HUB_AIRPORTS.map((_, index) => generateHubConfig(index)),
];
const maximumBodyRadius = Math.max(...AIRCRAFT_ROSTER.map((model) => {
  const visual = aircraftProfile(model).visual;
  return Math.max(2.2, (visual.bodyLength + visual.bodyRadius * 2) / 2, visual.wingSpan / 2);
}));

const totals = {
  airports: configs.length,
  obstacleEnvelopes: 0,
  pavementSamples: 0,
  standPairs: 0,
  trafficRuns: 0,
  ticks: 0,
  aircraftEnvelopeTicks: 0,
  spawnedFlights: 0,
  simulatedHours: 0,
};

for (const config of configs) {
  const validation = validateAirportObstacleEnvelopes(config);
  assert(validation.valid, config.code + ' seed ' + config.seed + ': ' + validation.errors.join('; '));
  assert(validation.counts.terminals === 1, config.code + ': expected one terminal envelope');
  assert(validation.counts.towers === 1, config.code + ': expected one tower envelope');
  totals.obstacleEnvelopes += validation.counts.obstacles;

  const nodes = new Map(config.surfaceGraph.nodes.map((node) => [node.id, node]));
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
      assert(separation >= maximumBodyRadius * 2 + 0.35, config.code + ': stands ' + firstStand.id + ' and ' + secondStand.id + ' overlap for the largest aircraft');
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

for (const config of configs) {
  const harness = new FixedStepSimulationHarness(config, { stepSeconds: 0.1, pace: 3, scenario: 'rush' });
  const ticks = 3_000;
  for (let tick = 0; tick < ticks; tick += 1) {
    harness.advanceTicks(1);
    totals.aircraftEnvelopeTicks += harness.simulation.state.flights.length;
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

assert(totals.aircraftEnvelopeTicks >= 10_000, 'fewer than 10,000 active aircraft envelope ticks were checked');
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

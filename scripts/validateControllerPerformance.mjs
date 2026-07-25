import { build } from 'esbuild';

const validationSource = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { CONTROLLER_STATIONS, CONTROLLER_STATION_DEFINITIONS } from './src/simulation/controllerOperations.ts';
import { controllerPerformanceSnapshots } from './src/simulation/controllerPerformance.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const simulation = new AirportSimulation(generateHubConfig(4), 'busy');
simulation.setMode('manual');
const baseline = simulation.controllerPerformance();
assert(baseline.map((snapshot) => snapshot.station).join(',') === CONTROLLER_STATIONS.join(','), 'performance snapshot station order is unstable');
assert(baseline.every((snapshot) => snapshot.objectives.length === 4), 'a controller desk lacks four distinct objectives');
assert(baseline.every((snapshot) => snapshot.responsibilities.length >= 5), 'a controller desk lacks a complete authority description');
assert(baseline.every((snapshot) => snapshot.successMeasures.length === 4), 'a controller desk lacks explicit success measures');
assert(new Set(baseline.map((snapshot) => snapshot.trafficScope)).size === 5, 'controller traffic scopes are not distinct');
assert(new Set(baseline.map((snapshot) => snapshot.authoritySummary)).size === 5, 'controller authority summaries are not distinct');
for (const station of CONTROLLER_STATIONS) {
  const definition = CONTROLLER_STATION_DEFINITIONS[station];
  assert(definition.label && definition.trafficScope && definition.authoritySummary, station + ' role definition is incomplete');
}

const template = structuredClone(simulation.state.flights[0]);
assert(template, 'controller performance validation needs one aircraft template');
const state = structuredClone(simulation.state);
state.elapsed = 600;
state.flights = [
  Object.assign(structuredClone(template), {
    id: 101,
    callsign: 'Approach 101',
    phase: 'approach',
    progress: 0.35,
    controlHold: false,
    automaticHold: false,
    safetyHold: false,
    rampControlZoneId: undefined,
    kinematics: { ...template.kinematics, fuelPercent: 4.5, groundSpeedKts: 0 },
    motion: { ...template.motion, onGround: false },
    navigation: { ...template.navigation, frequencyOwner: 'approach', handoff: undefined },
    flightPlan: { ...template.flightPlan, direction: 'arrival' },
  }),
  Object.assign(structuredClone(template), {
    id: 102,
    callsign: 'Tower 102',
    phase: 'landing',
    progress: 0.25,
    rampControlZoneId: undefined,
    motion: { ...template.motion, onGround: false },
    navigation: { ...template.navigation, frequencyOwner: 'tower', handoff: undefined },
    flightPlan: { ...template.flightPlan, direction: 'arrival' },
  }),
  Object.assign(structuredClone(template), {
    id: 103,
    callsign: 'Ground 103',
    phase: 'taxi-in',
    progress: 0.4,
    controlHold: true,
    automaticHold: false,
    safetyHold: false,
    crossingHoldRunway: 1,
    rampControlZoneId: undefined,
    kinematics: { ...template.kinematics, groundSpeedKts: 0 },
    motion: { ...template.motion, onGround: true },
    navigation: { ...template.navigation, frequencyOwner: 'ground', handoff: undefined },
    flightPlan: { ...template.flightPlan, direction: 'arrival' },
  }),
  Object.assign(structuredClone(template), {
    id: 104,
    callsign: 'Ramp 104',
    phase: 'resting',
    progress: 0,
    pushbackCleared: false,
    rampControlZoneId: 'RAMP-TEST',
    motion: { ...template.motion, onGround: true },
    navigation: { ...template.navigation, frequencyOwner: 'ramp', handoff: undefined },
    flightPlan: { ...template.flightPlan, direction: 'departure' },
    turnaround: { ...template.turnaround, status: 'ready', actualReadySeconds: 480 },
  }),
];

const workloads = ['approach', 'tower', 'ground', 'ramp'].map((station, index) => ({
  station,
  label: CONTROLLER_STATION_DEFINITIONS[station].label,
  automated: false,
  ownedFlights: 1,
  phaseRelevantFlights: 1,
  pendingHandoffs: index === 0 ? 1 : 0,
  overdueFlights: index === 0 ? 1 : 0,
  workload: index === 0 ? 'moderate' : 'light',
  responsibilities: [...CONTROLLER_STATION_DEFINITIONS[station].responsibilities],
}));

function queueEntry(id, category, flightId, waitSeconds, priority = 'attention') {
  return {
    id,
    category,
    priority,
    entity: 'aircraft',
    label: id,
    detail: 'synthetic role-specific queue',
    waitSeconds,
    position: 1,
    queueLength: 1,
    flightId,
    resourceId: id,
    blockerFlightIds: [],
  };
}

const queues = {
  generatedAtSeconds: state.elapsed,
  total: 4,
  longestWaitSeconds: 120,
  counts: { gate: 0, ramp: 1, taxi: 0, crossing: 1, runway: 1, wake: 0, weather: 1, downstream: 0 },
  entries: [
    queueEntry('approach-weather', 'weather', 101, 75),
    queueEntry('tower-runway', 'runway', 102, 70),
    queueEntry('ground-crossing', 'crossing', 103, 95, 'blocked'),
    queueEntry('ramp-service', 'ramp', 104, 80),
  ],
};
const predictions = [
  { severity: 'warning', type: 'separation', flights: [101, 102], etaSeconds: 12, detail: 'airborne separation test' },
  { severity: 'caution', type: 'runway', flights: [102], runway: 1, etaSeconds: 8, detail: 'runway occupancy test' },
];
const metrics = {
  ...simulation.shiftMetrics(),
  safeArrivals: 5,
  safeDepartures: 4,
  estimatedDelaySeconds: 900,
  runwayIncursions: 1,
};
const before = JSON.stringify({ state, metrics, workloads, queues, predictions });
const stressed = controllerPerformanceSnapshots({ state, metrics, workloads, queues, predictions });
const repeated = controllerPerformanceSnapshots({ state, metrics, workloads, queues, predictions });
assert(JSON.stringify(stressed) === JSON.stringify(repeated), 'controller performance snapshots are not deterministic');
assert(JSON.stringify({ state, metrics, workloads, queues, predictions }) === before, 'controller performance derivation mutated authoritative inputs');

const byStation = new Map(stressed.map((snapshot) => [snapshot.station, snapshot]));
assert(byStation.get('approach').alerts.some((item) => item.id.includes('fuel:101')), 'Approach did not receive the low-fuel alert');
assert(byStation.get('approach').alerts.some((item) => item.id.includes('prediction')), 'Approach did not receive the separation alert');
assert(byStation.get('tower').alerts.some((item) => item.id.includes('prediction')), 'Tower did not receive the runway forecast');
assert(byStation.get('tower').objectives.find((item) => item.id === 'incursions').status === 'critical', 'Tower incursion objective did not become critical');
assert(byStation.get('ground').alerts.some((item) => item.id.includes('hold:103')), 'Ground did not receive the long surface-hold alert');
assert(byStation.get('ground').objectives.find((item) => item.id === 'crossing-delay').status === 'critical', 'Ground crossing-delay objective did not become critical');
assert(byStation.get('ramp').alerts.some((item) => item.id.includes('push:104')), 'Ramp did not receive the delayed push-ready alert');
assert(byStation.get('ramp').alerts.some((item) => item.id.includes('queue:ramp-service')), 'Ramp did not receive the service-blocker alert');
assert(byStation.get('supervisor').alerts.some((item) => item.severity === 'urgent'), 'Supervisor did not receive the airport-wide urgent picture');
assert(new Set(stressed.flatMap((snapshot) => snapshot.objectives.map((objective) => snapshot.station + ':' + objective.id))).size === 20, 'controller objective identities are not station-specific');

console.log(JSON.stringify({
  stations: stressed.length,
  objectives: stressed.reduce((sum, snapshot) => sum + snapshot.objectives.length, 0),
  alerts: Object.fromEntries(stressed.map((snapshot) => [snapshot.station, snapshot.alerts.length])),
  scores: Object.fromEntries(stressed.map((snapshot) => [snapshot.station, snapshot.score])),
  deterministic: true,
  authoritativeInputsUnchanged: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'controller-performance-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Controller performance validation bundle was empty.');
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

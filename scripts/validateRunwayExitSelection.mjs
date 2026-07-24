import { build } from 'esbuild';

const validationSource = `
import { generateAirportConfig, generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import { sampleFlightTrajectory } from './src/simulation/flightTrajectory.ts';
import { runwayExitCandidateNodeIds, selectRunwayExit } from './src/simulation/runwayExitSelection.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function select(config, runway, aircraft, stand, surfaceCondition = 'dry', extras = {}) {
  return selectRunwayExit({
    config,
    runwayId: runway.id,
    operatingEnd: 1,
    aircraft,
    gateSlot: stand.slot,
    weather: { surfaceCondition },
    selectedAtSeconds: 120,
    flightId: 900,
    ...extras,
  });
}

function makeLandingFlight(config, runway, aircraft, stand, runwayExit) {
  const profile = aircraftProfile(aircraft);
  return {
    id: 900,
    runway: runway.id,
    departureRunway: runway.id,
    operatingEnd: 1,
    phase: 'landing',
    progress: 0,
    phaseElapsed: 0,
    duration: 1,
    gateSlot: stand.slot,
    aircraft,
    runwayExit,
    kinematics: {
      airspeedKts: profile.approachKts,
      groundSpeedKts: profile.approachKts,
      altitudeFt: 50,
      verticalSpeedFpm: -profile.descentFpm,
      accelerationMps2: 0,
      fuelPercent: 55,
    },
  };
}

const ord = generateHubConfig(HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD'));
const procedural = generateAirportConfig(781_223);
const totals = { candidateChecks: 0, performanceChecks: 0, weatherChecks: 0, routeChecks: 0, trafficChecks: 0, continuityChecks: 0 };

for (const config of [ord, procedural]) {
  const runway = [...config.runways].filter((item) => item.role !== 'inactive').sort((a, b) => b.length - a.length)[0];
  const candidates = runwayExitCandidateNodeIds(config.surfaceGraph, runway, 1);
  assert(candidates.length >= 2, config.code + ': runway exit selector has fewer than two reachable geometric candidates');
  assert(new Set(candidates).size === candidates.length, config.code + ': runway exit candidates are duplicated');
  totals.candidateChecks += 2;

  const stand = config.surfaceGraph.stands[Math.floor(config.surfaceGraph.stands.length / 2)];
  const first = select(config, runway, 'A320', stand);
  const second = select(config, runway, 'A320', stand);
  assert(first && second, config.code + ': no A320 runway exit plan');
  assert(JSON.stringify(first) === JSON.stringify(second), config.code + ': runway exit choice is not deterministic');
  assert(first.state.candidateCount >= 2, config.code + ': reachable candidate count was not preserved');
  assert(first.state.safe, config.code + ': selected A320 exit is not stopping-safe');
  assert(first.route.nodeIds[0] === first.state.nodeId, config.code + ': taxi-in does not start at selected exit');
  for (const edgeId of first.route.edgeIds) {
    const edge = config.surfaceGraph.edges.find((item) => item.id === edgeId);
    assert(edge, config.code + ': selected route references a missing edge');
    const recrossesLandingRunway = (edge.runwayId === runway.id || edge.crossedRunwayIds?.includes(runway.id))
      && (edge.kind === 'runway' || edge.kind === 'runway-access');
    assert(!recrossesLandingRunway, config.code + ': taxi-in immediately re-crosses its landing runway on ' + edgeId);
  }
  totals.routeChecks += first.route.edgeIds.length + 5;

  const landing = makeLandingFlight(config, runway, 'A320', stand, first.state);
  const landingEnd = sampleFlightTrajectory(config, landing, 1);
  const exitNode = config.surfaceGraph.nodes.find((node) => node.id === first.state.nodeId);
  assert(landingEnd && exitNode, config.code + ': missing selected landing endpoint');
  assert(Math.hypot(landingEnd.x - exitNode.position[0], landingEnd.y - exitNode.position[1]) < 0.001, config.code + ': landing trajectory does not end at selected graph exit');
  assert(Math.hypot(landingEnd.x - exitNode.position[0], landingEnd.y - exitNode.position[1]) < 0.001, config.code + ': landing/taxi-in boundary jumps');
  totals.continuityChecks += 2;
}

const runway = [...ord.runways].filter((item) => item.role !== 'inactive').sort((a, b) => b.length - a.length)[0];
const stand = ord.surfaceGraph.stands.find((item) => item.maximumWingspanM >= aircraftProfile('B77F').wingspanM) ?? ord.surfaceGraph.stands[0];
const regional = select(ord, runway, 'Q400', stand);
const heavy = select(ord, runway, 'B77F', stand);
assert(regional && heavy, 'ORD: missing performance comparison plans');
assert(heavy.state.requiredRolloutM > regional.state.requiredRolloutM + 500, 'ORD: heavy aircraft did not require a materially longer rollout');
assert(heavy.state.distanceFromThresholdM >= regional.state.distanceFromThresholdM, 'ORD: heavy aircraft selected an earlier exit than the Q400');
totals.performanceChecks += 2;

const dry = select(ord, runway, 'A320', stand, 'dry');
const wet = select(ord, runway, 'A320', stand, 'wet');
const contaminated = select(ord, runway, 'A320', stand, 'contaminated');
assert(dry && wet && contaminated, 'ORD: missing weather comparison plans');
assert(wet.state.requiredRolloutM > dry.state.requiredRolloutM, 'ORD: wet pavement did not lengthen predicted rollout');
assert(contaminated.state.requiredRolloutM > wet.state.requiredRolloutM, 'ORD: contaminated pavement did not lengthen predicted rollout');
assert(wet.state.distanceFromThresholdM >= dry.state.distanceFromThresholdM, 'ORD: wet pavement selected an earlier exit');
assert(contaminated.state.distanceFromThresholdM >= dry.state.distanceFromThresholdM, 'ORD: contaminated pavement selected an earlier exit');
totals.weatherChecks += 4;

const competingPlans = Array.from({ length: 7 }, (_, index) => ({
  flightId: 1_000 + index,
  runwayId: dry.state.runwayId,
  operatingEnd: dry.state.operatingEnd,
  nodeId: dry.state.nodeId,
  distanceFromThresholdM: dry.state.distanceFromThresholdM,
  taxiRouteEdgeIds: [...dry.state.taxiRouteEdgeIds],
}));
const diverted = select(ord, runway, 'A320', stand, 'dry', { competingPlans });
assert(diverted, 'ORD: traffic-aware selector returned no plan');
assert(diverted.state.nodeId !== dry.state.nodeId, 'ORD: saturated exit did not disfavor the original choice');
assert(diverted.state.trafficPenaltyM < 700 * competingPlans.length, 'ORD: selector ignored lower-conflict alternatives');
totals.trafficChecks += 2;

const distantStand = [...ord.surfaceGraph.stands]
  .filter((item) => item.maximumWingspanM >= aircraftProfile('A320').wingspanM)
  .sort((first, second) => Math.hypot(second.position[0] - stand.position[0], second.position[1] - stand.position[1]) - Math.hypot(first.position[0] - stand.position[0], first.position[1] - stand.position[1]))[0];
const distantPlan = select(ord, runway, 'A320', distantStand, 'dry');
assert(distantPlan, 'ORD: destination-stand comparison returned no plan');
assert(distantPlan.state.routeDistanceM !== dry.state.routeDistanceM || distantPlan.state.nodeId !== dry.state.nodeId, 'ORD: destination stand did not affect route scoring');
totals.routeChecks += 1;

console.log(JSON.stringify(totals));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'runway-exit-selection-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Runway exit selection validation bundle was empty.');
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

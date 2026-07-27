import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const validationSource = `
import { generateAirportConfig, generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import {
  activeRunwayDesignation,
  runwayDirection,
  runwayEndPoint,
  runwayEndPoint3,
  runwayEndTuple,
  runwayTravelDirection,
} from './src/simulation/runwayGeometry.ts';
import { runwaysConflict } from './src/simulation/runwayConflict.ts';
import {
  runwayOperationSpacingSeconds,
  runwayRelationship,
  separationRuleset,
} from './src/simulation/separationRules.ts';
import {
  surfaceRouteCrossingWindows,
  surfaceRouteForFlight,
  surfaceRouteRunwayCrossings,
  validateAirportSurfaceGraph,
} from './src/simulation/surfaceGraph.ts';
import {
  AIRPORT_CONTROL_COMMAND_DEFINITIONS,
  validateAirportControlCommand,
} from './src/control/controlProtocol.ts';
import {
  OPERATIONAL_CONTROLLER_STATIONS,
  stationCanIssue,
} from './src/simulation/controllerOperations.ts';
import { createSeededSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import { stableReplayFingerprint } from './src/replay/replayFingerprint.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import {
  applyRunwayConfiguration,
  changedRunwayConfigurationIds,
  runwayConfigurationRestrictionReason,
  selectAutomaticRunwayConfiguration,
} from './src/simulation/runwayConfigurationOperations.ts';
import {
  flightHasCommittedRunwayTrajectory,
  flightHasRunwayCommitment,
  phaseProtectsAssignedRunway,
  phaseUsesAirborneTrajectory,
} from './src/simulation/runwayProtection.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nearlyEqual(first, second, tolerance = 1e-9) {
  return Math.abs(first - second) <= tolerance;
}

function sorted(values) {
  return [...values].sort((first, second) => String(first).localeCompare(String(second)));
}

for (const phase of ['approach', 'landing', 'taxi-in', 'resting', 'taxi-out', 'takeoff']) {
  assert(
    phaseUsesAirborneTrajectory(phase) === ['approach', 'landing', 'takeoff'].includes(phase),
    phase + ': airborne trajectory phase drifted',
  );
  assert(
    phaseProtectsAssignedRunway(phase) === ['landing', 'takeoff'].includes(phase),
    phase + ': assigned-runway phase protection drifted',
  );
}
for (const candidate of [
  { phase: 'approach', cleared: false, runwayEntryCleared: false, committed: false, runwayCommitment: false },
  { phase: 'approach', cleared: true, runwayEntryCleared: false, committed: true, runwayCommitment: true },
  { phase: 'landing', cleared: false, runwayEntryCleared: false, committed: true, runwayCommitment: true },
  { phase: 'takeoff', cleared: false, runwayEntryCleared: false, committed: true, runwayCommitment: true },
  { phase: 'taxi-out', cleared: false, runwayEntryCleared: true, committed: false, runwayCommitment: true },
]) {
  assert(flightHasCommittedRunwayTrajectory(candidate) === candidate.committed, candidate.phase + ': committed runway predicate drifted');
  assert(flightHasRunwayCommitment(candidate) === candidate.runwayCommitment, candidate.phase + ': runway commitment predicate drifted');
}

const configs = [
  ...HUB_AIRPORTS.map((_, index) => generateHubConfig(index)),
  ...Array.from({ length: 24 }, (_, index) => generateAirportConfig(91_001 + index * 7_919)),
];

let runwayPairs = 0;
let routeCases = 0;
let crossingCases = 0;
let configurationCases = 0;
for (const config of configs) {
  const graphValidation = validateAirportSurfaceGraph(config);
  assert(graphValidation.valid, config.code + ': generated graph failed validation: ' + graphValidation.errors.join('; '));

  for (const runway of config.runways) {
    const negative = runwayEndPoint(runway, -1);
    const positive = runwayEndPoint(runway, 1);
    const tuple = runwayEndTuple(runway, -1);
    const point3 = runwayEndPoint3(runway, 1, 3, 7);
    const direction = runwayDirection(runway);
    const travel = runwayTravelDirection(runway, runway.landingEnd);
    assert(nearlyEqual(Math.hypot(positive.x - negative.x, positive.y - negative.y), runway.length), config.code + ': runway endpoint distance drifted');
    assert(nearlyEqual((positive.x + negative.x) / 2, runway.center[0]) && nearlyEqual((positive.y + negative.y) / 2, runway.center[1]), config.code + ': runway midpoint drifted');
    assert(nearlyEqual(tuple[0], negative.x) && nearlyEqual(tuple[1], negative.y), config.code + ': tuple adapter drifted from canonical endpoint');
    assert(point3.z === 7 && nearlyEqual(Math.hypot(point3.x - positive.x, point3.y - positive.y), 3), config.code + ': 3D endpoint adapter drifted');
    assert(nearlyEqual(Math.hypot(direction.x, direction.y), 1), config.code + ': runway direction is not normalized');
    assert(nearlyEqual(travel.x, -runway.landingEnd * direction.x) && nearlyEqual(travel.y, -runway.landingEnd * direction.y), config.code + ': runway travel direction drifted');
    if (runway.designation) {
      assert(activeRunwayDesignation(config, { [runway.id]: -1 }, runway.id) === runway.designation[0], config.code + ': negative runway designation drifted');
      assert(activeRunwayDesignation(config, { [runway.id]: 1 }, runway.id) === runway.designation[1], config.code + ': positive runway designation drifted');
    }
  }

  for (const first of config.runways) {
    assert(runwaysConflict(config, first.id, first.id), config.code + ': runway conflict is not reflexive');
    for (const second of config.runways) {
      const forward = runwaysConflict(config, first.id, second.id);
      const reverse = runwaysConflict(config, second.id, first.id);
      assert(forward === reverse, config.code + ': runway conflict is not symmetric for ' + first.id + '/' + second.id);
      assert(runwayRelationship(config, first.id, second.id) === runwayRelationship(config, second.id, first.id), config.code + ': runway relationship is not symmetric');
      runwayPairs += 1;
    }
  }

  const activeRunways = config.runways.filter((runway) => runway.role !== 'inactive');
  const sampledStands = config.surfaceGraph.stands.filter((_, index) => index % Math.max(1, Math.ceil(config.surfaceGraph.stands.length / 8)) === 0).slice(0, 8);
  for (const runway of activeRunways) {
    for (const operatingEnd of [-1, 1]) {
      for (const stand of sampledStands) {
        for (const phase of ['taxi-in', 'taxi-out']) {
          const route = surfaceRouteForFlight(config.surfaceGraph, runway.id, operatingEnd, phase, stand.slot);
          assert(route, config.code + ': route property could not produce ' + phase + ' route');
          const crossings = surfaceRouteRunwayCrossings(config.surfaceGraph, route.edgeIds, runway.id);
          const windows = surfaceRouteCrossingWindows(config.surfaceGraph, route.nodeIds, 0, runway.id, route.edgeIds);
          assert(JSON.stringify(sorted(new Set(windows.map((window) => window.runwayId)))) === JSON.stringify(sorted(crossings)), config.code + ': route crossing windows disagree with route runway crossings');
          assert(new Set(windows.map((window) => window.id)).size === windows.length, config.code + ': route crossing occurrence IDs are not unique');
          for (let index = 0; index < windows.length; index += 1) {
            const window = windows[index];
            assert(window.holdProgress < window.entryProgress && window.entryProgress < window.exitProgress, config.code + ': crossing window ordering is invalid');
            if (index > 0) assert(windows[index - 1].holdProgress <= window.holdProgress, config.code + ': crossing windows are not route ordered');
            crossingCases += 1;
          }
          routeCases += 1;
        }
      }
    }
  }
}

for (const config of configs.slice(0, HUB_AIRPORTS.length)) {
  const simulation = new AirportSimulation(config);
  const selected = selectAutomaticRunwayConfiguration(config, simulation.state);
  assert(config.runwayConfigurations.includes(selected), config.code + ': automatic selector returned a foreign configuration');
  assert(selectAutomaticRunwayConfiguration(config, simulation.state).id === selected.id, config.code + ': automatic runway selection is not deterministic');
  if (selected.restrictions.autoSelectable) {
    assert(runwayConfigurationRestrictionReason(simulation.state, selected) === null, config.code + ': automatic selector returned a restricted configuration');
  }
  const state = structuredClone(simulation.state);
  applyRunwayConfiguration(config, state, selected);
  assert(state.runwayConfigurationId === selected.id, config.code + ': selected configuration was not applied');
  assert(changedRunwayConfigurationIds(config, state, selected).length === 0, config.code + ': applied configuration still reports changed runway IDs');
  assert(config.runways.every((runway) => state.activeRunwayEnds[runway.id] === (selected.operatingEnds[runway.id] ?? runway.landingEnd)), config.code + ': applied operating ends drifted');
  assert(config.runways.every((runway) => state.activeRunwayRoles[runway.id] === (selected.runwayRoles[runway.id] ?? runway.role)), config.code + ': applied runway roles drifted');
  configurationCases += config.runwayConfigurations.length;
}

for (const rulesetId of ['forgiving', 'realistic']) {
  const rules = separationRuleset(rulesetId);
  assert(rules.wakeSeconds.light <= rules.wakeSeconds.medium && rules.wakeSeconds.medium <= rules.wakeSeconds.heavy, rulesetId + ': wake spacing is not monotonic');
  for (const config of configs.slice(0, HUB_AIRPORTS.length)) {
    const runway = config.runways.find((candidate) => candidate.role !== 'inactive');
    assert(runway, config.code + ': no active runway for wake property');
    const leader = { flightId: 1, callsign: 'LEAD1', runwayId: runway.id, operatingEnd: -1, kind: 'arrival', wakeClass: 'light', atSeconds: 0 };
    const light = runwayOperationSpacingSeconds(rules, config, leader, { runwayId: runway.id, operatingEnd: -1, kind: 'arrival', wakeClass: 'light' });
    const heavyLeader = runwayOperationSpacingSeconds(rules, config, { ...leader, wakeClass: 'heavy' }, { runwayId: runway.id, operatingEnd: -1, kind: 'arrival', wakeClass: 'light' });
    assert(heavyLeader.seconds >= light.seconds, config.code + ': heavy leader reduced same-runway spacing');
  }
}

const definitions = Object.values(AIRPORT_CONTROL_COMMAND_DEFINITIONS);
for (const definition of definitions) {
  assert(validateAirportControlCommand(definition.example).valid, definition.action + ': generated catalog example is invalid');
  const authority = definition.authority;
  assert(new Set(authority.stations).size === authority.stations.length, definition.action + ': authority stations are duplicated');
  assert(authority.stations.every((station) => station === 'supervisor' || OPERATIONAL_CONTROLLER_STATIONS.includes(station)), definition.action + ': authority contains an unknown station');
  if (authority.rule === 'public') {
    assert(authority.stations.length === 0 && !authority.flightOwnership && !authority.safetyArbiter, definition.action + ': public command unexpectedly claims operational authority');
  } else {
    assert(authority.stations.length > 0, definition.action + ': protected command has no authorized station');
  }
  if (authority.flightOwnership) assert(
    authority.rule.includes('owner')
      || authority.rule === 'handoff-sender'
      || authority.rule === 'dynamic-emergency',
    definition.action + ': ownership flag is inconsistent with authority rule',
  );
  for (const station of OPERATIONAL_CONTROLLER_STATIONS) {
    assert(stationCanIssue('supervisor', station), 'supervisor lost ' + station + ' authority');
    for (const selected of OPERATIONAL_CONTROLLER_STATIONS) {
      assert(stationCanIssue(selected, station) === (selected === station), selected + ': station authority leaked into ' + station);
    }
  }
}

let replayPartitions = 0;
for (let index = 0; index < 12; index += 1) {
  const seed = 7_003 + index * 9_973;
  const whole = createSeededSimulationHarness(seed, { stepSeconds: 0.05 });
  const partitioned = createSeededSimulationHarness(seed, { stepSeconds: 0.05 });
  whole.advanceBy(30);
  const partitions = [0.05 * (index + 1), 3.75, 7.2, 0.55];
  partitions.push(30 - partitions.reduce((total, value) => total + value, 0));
  for (const seconds of partitions) partitioned.advanceBy(seconds);
  assert(stableReplayFingerprint(whole.snapshot()) === stableReplayFingerprint(partitioned.snapshot()), 'seed ' + seed + ': exact replay receipt changed across wall-frame partitions');
  const mutated = structuredClone(partitioned.snapshot());
  mutated.state.elapsed += 0.05;
  assert(stableReplayFingerprint(mutated) !== stableReplayFingerprint(partitioned.snapshot()), 'seed ' + seed + ': replay fingerprint ignored authoritative mutation');
  replayPartitions += partitions.length;
}

console.log(JSON.stringify({
  generatedAirports: configs.length,
  runwayPairs,
  routeCases,
  crossingCases,
  configurationCases,
  commands: definitions.length,
  replaySeeds: 12,
  replayPartitions,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'rule-properties-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Rule-property validation bundle was empty.');
await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);

const runwayRuleOwners = [
  'src/render/createWorld.ts',
  'src/simulation/collisionDetection.ts',
  'src/simulation/flightTrajectory.ts',
  'src/simulation/surfaceGraph.ts',
  'src/simulation/airportSimulation.ts',
  'src/main.ts',
];
for (const filename of runwayRuleOwners) {
  const source = await readFile(filename, 'utf8');
  if (/function\s+runwayEnd(?:Point|Tuple)?\s*\(/.test(source)) {
    throw new Error(`${filename}: defines runway-end geometry outside runwayGeometry.ts`);
  }
  if (/designation\?\.\[\s*[^\]]+===\s*1\s*\?\s*1\s*:\s*0\s*\]/.test(source)) {
    throw new Error(`${filename}: defines runway designation selection outside runwayGeometry.ts`);
  }
}

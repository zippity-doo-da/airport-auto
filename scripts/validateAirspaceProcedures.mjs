import { build } from 'esbuild';

const validationSource = `
import { generateAirportConfig, generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import { selectTerminalProcedure } from './src/simulation/airspaceProcedures.ts';
import { createHubSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import {
  SEPARATION_RULESETS,
  assessAirborneSeparation,
  requiredRadarSeparationNm,
  runwayOperationSpacingSeconds,
  runwayPairIndependent,
  runwayRelationship,
  runwayReleaseReason,
  weatherCapacityMultiplier,
} from './src/simulation/separationRules.ts';
import { WORLD_METERS_PER_UNIT } from './src/simulation/runwayPerformance.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function distance(first, second) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function runwayThreshold(runway, end) {
  return [
    runway.center[0] + Math.cos(runway.heading) * runway.length * end / 2,
    runway.center[1] + Math.sin(runway.heading) * runway.length * end / 2,
  ];
}

function motionDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

const configs = [
  ...Array.from({ length: 64 }, (_, index) => generateAirportConfig(230_000 + index * 191)),
  ...HUB_AIRPORTS.map((_, index) => generateHubConfig(index)),
];
const totals = {
  airports: 0,
  fixes: 0,
  procedures: 0,
  configurationSelections: 0,
  routeReferences: 0,
  constraints: 0,
  holds: 0,
  missedApproaches: 0,
  commandChecks: 0,
  separationChecks: 0,
};

for (const config of configs) {
  const program = config.airspaceProgram;
  assert(program.schemaVersion === 1 && program.nonNavigational === true, config.code + ': airspace program is not explicitly non-navigational');
  assert(program.airportCode === config.code && program.dataVersion.includes(config.code.toLowerCase()), config.code + ': airspace program has no airport/version identity');
  assert(/never for navigation/i.test(program.disclaimer), config.code + ': airspace disclaimer is ambiguous');
  assert(program.sources.length >= 2 && program.sources.every((source) => source.url.startsWith('https://www.faa.gov/')), config.code + ': conceptual procedure sources are not official FAA pages');
  const fixIds = new Set(program.fixes.map((fix) => fix.id));
  const procedureIds = new Set(program.procedures.map((procedure) => procedure.id));
  assert(fixIds.size === program.fixes.length && procedureIds.size === program.procedures.length, config.code + ': duplicate airspace IDs');
  assert(program.sectors.length === 4 && program.sectors.every((sector) => sector.polygon.length >= 6 && sector.floorFt < sector.ceilingFt), config.code + ': incomplete terminal sectors');
  assert(program.procedures.length === config.runways.length * 4, config.code + ': every runway end does not have both a SID and STAR');

  for (const runway of config.runways) {
    for (const operatingEnd of [-1, 1]) {
      const pair = program.procedures.filter((procedure) => procedure.runwayId === runway.id && procedure.operatingEnd === operatingEnd);
      assert(pair.some((procedure) => procedure.kind === 'SID') && pair.some((procedure) => procedure.kind === 'STAR'), config.code + ' runway ' + runway.id + '/' + operatingEnd + ': missing SID or STAR');
    }
  }

  for (const procedure of program.procedures) {
    assert(procedure.revision >= 1 && procedure.transitions.length >= 2, config.code + ': incomplete procedure ' + procedure.id);
    assert(procedure.commonFixIds.length >= 2 && procedure.commonFixIds.every((id) => fixIds.has(id)), config.code + ': broken common route in ' + procedure.id);
    assert(procedure.transitions.every((transition) => transition.fixIds.length && transition.fixIds.every((id) => fixIds.has(id))), config.code + ': broken transition in ' + procedure.id);
    assert(procedure.constraints.every((constraint) => fixIds.has(constraint.fixId) && (constraint.atOrAboveFt !== undefined || constraint.atOrBelowFt !== undefined || constraint.maximumSpeedKts !== undefined)), config.code + ': invalid physical constraint in ' + procedure.id);
    if (procedure.kind === 'STAR') {
      assert(procedure.missedApproachId && program.missedApproaches.some((missed) => missed.id === procedure.missedApproachId), config.code + ': STAR has no valid missed approach');
      const runway = config.runways[procedure.runwayId];
      const threshold = runwayThreshold(runway, procedure.operatingEnd);
      const commonDistances = procedure.commonFixIds.map((id) => distance(program.fixes.find((fix) => fix.id === id).position, threshold));
      assert(commonDistances.every((value, index) => index === 0 || value < commonDistances[index - 1]), config.code + ': STAR does not sequence continuously toward its threshold');
      for (const transition of procedure.transitions) {
        const gateway = program.fixes.find((fix) => fix.id === transition.fixIds[0]);
        assert(gateway.kind === 'transition' && distance(gateway.position, threshold) >= (config.scope === 'center' ? 280 : 180), config.code + ': STAR does not enter at the terminal map edge');
      }
    } else {
      assert(Number.isFinite(procedure.initialHeadingDegrees) && procedure.initialClimbAltitudeFt > 0 && fixIds.has(procedure.handoffFixId), config.code + ': SID has no heading, initial climb, or handoff');
    }
    totals.routeReferences += procedure.commonFixIds.length + procedure.transitions.reduce((sum, transition) => sum + transition.fixIds.length, 0);
    totals.constraints += procedure.constraints.length;
  }

  for (const hold of program.holds) {
    assert(fixIds.has(hold.fixId) && hold.legSeconds >= 45 && hold.defaultEfcMinutes > 0 && hold.minimumAltitudeFt < hold.maximumAltitudeFt, config.code + ': invalid holding pattern ' + hold.id);
  }
  for (const missed of program.missedApproaches) {
    assert(missed.fixIds.every((id) => fixIds.has(id)) && program.holds.some((hold) => hold.id === missed.holdId) && missed.climbToFt > 0, config.code + ': invalid missed approach ' + missed.id);
  }

  for (const configuration of config.runwayConfigurations) {
    for (const [kind, runwayIds] of [['STAR', configuration.arrivalRunwayIds], ['SID', configuration.departureRunwayIds]]) {
      for (const runwayId of runwayIds) {
        const runway = config.runways[runwayId];
        const operatingEnd = configuration.operatingEnds[runwayId] ?? runway.landingEnd;
        for (const condition of configuration.restrictions.conditions) {
          const selected = selectTerminalProcedure(program, { kind, runwayId, operatingEnd, configurationId: configuration.id, condition, flightId: runwayId + condition.length });
          assert(selected.procedure.kind === kind && selected.procedure.runwayId === runwayId && selected.procedure.operatingEnd === operatingEnd, config.code + ': procedure selection changed runway/end');
          assert(selected.procedure.configurationIds.includes(configuration.id) && selected.procedure.conditions.includes(condition), config.code + ': procedure ignored configuration/weather compatibility');
          assert(selected.routeFixIds.every((id) => fixIds.has(id)), config.code + ': selected route contains an unknown fix');
          if (kind === 'STAR') assert(selected.routeFixIds[0] === selected.transition.fixIds[0], config.code + ': STAR transition is not first');
          else assert(selected.routeFixIds.at(-1) === selected.transition.fixIds.at(-1), config.code + ': SID transition is not last');
          totals.configurationSelections += 1;
        }
      }
    }
  }
  totals.airports += 1;
  totals.fixes += program.fixes.length;
  totals.procedures += program.procedures.length;
  totals.holds += program.holds.length;
  totals.missedApproaches += program.missedApproaches.length;
}

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD');
const ordConfig = generateHubConfig(ordIndex);
const harness = createHubSimulationHarness('ORD', { stepSeconds: 0.05, mode: 'manual' });
const simulation = harness.simulation;
simulation.setStation('approach');
const arrival = simulation.state.flights.find((flight) => flight.phase === 'approach' && flight.progress < 0.5);
assert(arrival, 'ORD command validation has no vectorable arrival');
const initialMotion = { ...arrival.motion };
const initialRevision = arrival.flightPlan.revision;
const presentHeading = ((90 - arrival.motion.heading * 180 / Math.PI) % 360 + 360) % 360;
assert(simulation.assignHeading(arrival.id, presentHeading + 15), 'approach rejected a safe intermediate heading');
assert(motionDistance(initialMotion, arrival.motion) < 1e-9 && arrival.navigation.vector, 'heading command teleported the aircraft or failed to create a vector');
assert(simulation.assignAltitude(arrival.id, 3_000) && arrival.navigation.assignedAltitudeFt === 3_000, 'approach rejected a valid terminal altitude');
const commandSpeed = Math.ceil((aircraftProfile(arrival.aircraft).approachKts + 5) / 5) * 5;
assert(simulation.assignAirspeed(arrival.id, commandSpeed) && arrival.navigation.assignedSpeedKts === commandSpeed, 'approach rejected a valid airspeed');
const directFix = arrival.navigation.routeFixIds[Math.min(arrival.navigation.routeFixIds.length - 1, arrival.navigation.activeFixIndex + 1)];
assert(simulation.directFlightTo(arrival.id, directFix), 'approach rejected direct-to a remaining procedure fix');
assert(arrival.flightPlan.route.includes(directFix) && arrival.flightPlan.amendments.at(-1)?.kind === 'route-change', 'direct-to did not amend the flight plan');
assert(simulation.clearApproach(arrival.id) && arrival.navigation.approachCleared, 'approach clearance did not update navigation state');
const beforeHold = { ...arrival.motion };
assert(simulation.holdFlight(arrival.id, undefined, 2), 'approach rejected an available terminal hold');
assert(arrival.navigation.hold && Math.abs(arrival.navigation.hold.expectFurtherClearanceAtSeconds - simulation.state.elapsed - 120) < 1e-6, 'holding clearance lost its EFC');
assert(motionDistance(beforeHold, arrival.motion) < 1e-6 && arrival.motion.stage === 'hold-entry', 'hold entry teleported the aircraft');
const beforeRelease = { ...arrival.motion };
assert(simulation.releaseAirborneHold(arrival.id), 'approach rejected a hold release');
assert(!arrival.navigation.hold && arrival.navigation.vector && motionDistance(beforeRelease, arrival.motion) < 1e-6, 'hold release did not continuously rejoin the arrival');
assert(simulation.handoffFlight(arrival.id, 'tower') && arrival.navigation.frequencyOwner === 'approach' && arrival.navigation.handoff?.status === 'offered', 'approach-to-tower offer changed ownership or failed');
simulation.setStation('tower');
assert(simulation.acceptHandoff(arrival.id) && arrival.navigation.frequencyOwner === 'approach' && arrival.navigation.handoff?.status === 'accepted', 'Tower could not accept the handoff without prematurely taking ownership');
simulation.setStation('approach');
assert(simulation.contactFlight(arrival.id, 'tower') && arrival.navigation.frequencyOwner === 'tower' && arrival.navigation.handoff?.status === 'completed', 'accepted handoff did not complete on contact');
assert(arrival.flightPlan.revision >= initialRevision + 7 && arrival.flightPlan.amendments.some((amendment) => amendment.detail.includes('contact tower')), 'ATC commands were not recorded in the flight plan');
assert(!simulation.assignHeading(arrival.id, presentHeading), 'tower improperly issued an approach vector');
assert(/does not own|handoff required/.test(simulation.lastCommandReason()), 'station-ownership rejection was not explainable');
totals.commandChecks += 18;

const forgiving = SEPARATION_RULESETS.forgiving;
const realistic = SEPARATION_RULESETS.realistic;
assert(forgiving.physicalUnits && realistic.physicalUnits && realistic.radarHorizontalNm === 3 && realistic.degradedRadarHorizontalNm === 5 && realistic.verticalFt === 1_000, 'physical separation ruleset values are incomplete');
assert(/not FAA CWT|does not claim CWT/.test(realistic.wakeModel.disclaimer) && /not FAA CWT/.test(forgiving.wakeModel.disclaimer), 'simplified wake categories are presented as regulatory');
assert(requiredRadarSeparationNm(realistic, simulation.state.weather) === 3, 'clear-weather radar minimum is not 3 NM');
const fog = { ...simulation.state.weather, condition: 'fog', visibility: 2, ceilingFt: 600 };
assert(requiredRadarSeparationNm(realistic, fog) === 5, 'degraded radar minimum is not 5 NM');
const first = arrival;
const sameAltitude = { ...arrival, id: arrival.id + 10_000, motion: { ...arrival.motion }, kinematics: { ...arrival.kinematics } };
sameAltitude.motion.x += 2.9 * 1_852 / WORLD_METERS_PER_UNIT;
assert(!assessAirborneSeparation(realistic, simulation.state.weather, first, sameAltitude).compliant, 'sub-3-NM same-altitude pair was called compliant');
sameAltitude.motion.x = first.motion.x + 3.1 * 1_852 / WORLD_METERS_PER_UNIT;
assert(assessAirborneSeparation(realistic, simulation.state.weather, first, sameAltitude).compliant, 'greater-than-3-NM pair was called noncompliant');
sameAltitude.motion.x = first.motion.x;
sameAltitude.kinematics.altitudeFt = first.kinematics.altitudeFt + 1_000;
assert(assessAirborneSeparation(realistic, simulation.state.weather, first, sameAltitude).compliant, '1,000-foot vertical pair was called noncompliant');
assert(runwayRelationship(ordConfig, 1, 2, forgiving.closelySpacedParallelThresholdFt) === 'independent-parallel', 'forgiving parallel threshold was ignored');
assert(runwayRelationship(ordConfig, 1, 2, realistic.closelySpacedParallelThresholdFt) === 'closely-spaced-parallel', 'realistic parallel threshold was ignored');
simulation.state.runwayConfigurationId = 'ORD-WEST-FLOW';
simulation.state.weather = { ...simulation.state.weather, condition: 'clear', visibility: 10, ceilingFt: 12_000, windSpeed: 10 };
assert(runwayPairIndependent(ordConfig, simulation.state, forgiving, 1, 2), 'forgiving rules did not permit independent schematic parallel flow');
assert(!runwayPairIndependent(ordConfig, simulation.state, realistic, 1, 2), 'realistic rules permitted close visual parallels as independent');
const leader = { flightId: 1, callsign: 'LEAD 1', runwayId: 1, operatingEnd: -1, kind: 'arrival', wakeClass: 'heavy', atSeconds: 10 };
const follower = { runwayId: 1, operatingEnd: -1, kind: 'departure', wakeClass: 'light' };
const spacing = runwayOperationSpacingSeconds(realistic, ordConfig, leader, follower);
assert(spacing.seconds >= 120 && spacing.relationship === 'same', 'same-runway heavy wake interval is not time-based');
assert(runwayReleaseReason(realistic, ordConfig, [leader], 20, follower)?.includes('LEAD 1'), 'runway release blocker lost its leader/reason');
const independentSpacing = runwayOperationSpacingSeconds(realistic, ordConfig, leader, { ...follower, runwayId: 5 });
assert(independentSpacing.seconds === 0 && independentSpacing.relationship === 'independent-parallel', 'independent parallel runway inherited a shared release interval');
assert(weatherCapacityMultiplier(realistic, fog) < weatherCapacityMultiplier(realistic, simulation.state.weather), 'degraded weather did not reduce modeled capacity');
simulation.setSeparationRuleset('realistic');
assert(simulation.state.separationRuleset === 'realistic' && simulation.diagnostics().separation.coordinateBasis.includes('metres'), 'runtime ruleset/physical coordinate diagnostics were not exposed');
totals.separationChecks += 18;

console.log(JSON.stringify(totals));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'airspace-procedure-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Airspace procedure validation bundle was empty.');
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

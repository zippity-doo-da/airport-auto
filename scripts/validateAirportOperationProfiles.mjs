import { build } from "esbuild";

const validationSource = `
import { HUB_AIRPORTS, generateAirportConfig } from './src/simulation/airportConfig.ts';
import { AIRCRAFT_PROFILES } from './src/simulation/aircraftProfiles.ts';
import {
  airportOperationStateAt,
  buildAirportOperationProfile,
  selectOperationTrafficClass,
} from './src/simulation/airportOperationProfiles.ts';
import { createHubSimulationHarness } from './src/simulation/fixedStepHarness.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function near(first, second, tolerance = 0.001) {
  return Math.abs(first - second) <= tolerance;
}

const totals = {
  airports: 0,
  periods: 0,
  mixChecks: 0,
  classSamples: 0,
  boundaryChecks: 0,
  integrationChecks: 0,
};

const airportInputs = [
  ...HUB_AIRPORTS.map((airport) => ({ code: airport.code, operations: airport.operations })),
  { code: 'LOCAL', operations: null },
];

for (const [airportIndex, input] of airportInputs.entries()) {
  const profile = buildAirportOperationProfile(input.code, input.operations);
  assert(profile.airportCode === input.code, input.code + ': profile code mismatch');
  assert(profile.schemaVersion === 1, input.code + ': profile schema mismatch');
  assert(profile.periods[0].startLocalMinute === 0, input.code + ': traffic day does not begin at midnight');
  assert(profile.periods.at(-1).endLocalMinute === 1440, input.code + ': traffic day does not end at midnight');
  assert(profile.localMinutesPerSimulationSecond > 0, input.code + ': compressed clock is invalid');
  if (input.operations !== null) {
    assert(profile.nominalAnnualOperations === input.operations, input.code + ': annual volume mismatch');
    assert(profile.nominalDailyOperations === Math.round(input.operations / 365), input.code + ': daily volume mismatch');
  }

  for (const [periodIndex, period] of profile.periods.entries()) {
    const previous = profile.periods[periodIndex - 1];
    if (previous) assert(previous.endLocalMinute === period.startLocalMinute, input.code + ': gap or overlap before ' + period.id);
    assert(period.endLocalMinute > period.startLocalMinute, input.code + ': empty traffic period ' + period.id);
    assert(period.demandMultiplier > 0, input.code + ': non-positive demand in ' + period.id);
    assert(near(period.mix.arrivalShare + period.mix.departureShare, 1), input.code + ': arrival/departure mix does not sum to one');
    assert(near(period.mix.passengerShare + period.mix.cargoShare + period.mix.regionalShare + period.mix.generalAviationShare, 1), input.code + ': traffic-class mix does not sum to one');
    assert(Object.values(period.mix).every((value) => value >= 0 && value <= 1), input.code + ': invalid traffic share in ' + period.id);
    totals.periods += 1;
    totals.mixChecks += 2;
  }

  const start = airportOperationStateAt(profile, 0);
  const wrapped = airportOperationStateAt(profile, 1440 / profile.localMinutesPerSimulationSecond);
  assert(start.localTime === wrapped.localTime, input.code + ': local operation clock did not wrap deterministically');
  assert(start.periodId === wrapped.periodId, input.code + ': wrapped period mismatch');

  for (const period of profile.periods.slice(0, -1)) {
    const boundarySeconds = (period.endLocalMinute - profile.sessionStartLocalMinute + 1440) % 1440 / profile.localMinutesPerSimulationSecond;
    const before = airportOperationStateAt(profile, Math.max(0, boundarySeconds - 0.01));
    const after = airportOperationStateAt(profile, boundarySeconds + 0.01);
    assert(Math.abs(before.demandMultiplier - after.demandMultiplier) < 0.03, input.code + ': demand jumps at ' + period.id + ' boundary');
    totals.boundaryChecks += 1;
  }

  const classes = new Set();
  for (let id = 1; id <= 12_000; id += 1) {
    const trafficClass = selectOperationTrafficClass(start, id, airportIndex + 10_000);
    assert(trafficClass === selectOperationTrafficClass(start, id, airportIndex + 10_000), input.code + ': traffic class selection is not deterministic');
    classes.add(trafficClass);
    totals.classSamples += 1;
  }
  for (const trafficClass of ['passenger', 'cargo', 'regional', 'general-aviation']) {
    assert(classes.has(trafficClass), input.code + ': ' + trafficClass + ' stream never appears');
  }
  totals.airports += 1;
}

const ord = createHubSimulationHarness('ORD', { stepSeconds: 0.1, mode: 'auto' });
const initialOperations = ord.simulation.operationProfileSnapshot();
assert(initialOperations.profile.airportCode === 'ORD', 'simulation exposes the wrong operation profile');
assert(initialOperations.current.periodId === 'morning-departure', 'ORD does not begin in its morning departure bank');
assert(ord.simulation.state.flights.some((flight) => flight.operationPlan.direction === 'departure'), 'initial hub traffic has no departure stream');
assert(ord.simulation.state.flights.some((flight) => flight.operationPlan.direction === 'arrival'), 'initial hub traffic has no arrival stream');
assert(ord.simulation.state.flights.every((flight) => flight.operationPlan.periodId === initialOperations.current.periodId), 'initial traffic lost its source period');
ord.advanceBy(180);
const laterOperations = ord.simulation.operationProfileSnapshot();
assert(laterOperations.current.localMinute > initialOperations.current.localMinute, 'operation clock did not advance with fixed-step time');
assert(laterOperations.current.periodId !== initialOperations.current.periodId, 'operation period did not change across the compressed day');
assert(ord.snapshot().diagnostics.collisionPairs.length === 0, 'profiled traffic introduced an aircraft collision');
assert(ord.snapshot().diagnostics.obstacleCollisions.length === 0, 'profiled traffic introduced an obstacle collision');
totals.integrationChecks += 8;

const pc12 = AIRCRAFT_PROFILES.PC12;
assert(pc12.engines === 1 && pc12.engineType === 'turboprop', 'PC-12 powerplant model is invalid');
assert(pc12.maxTakeoffWeightT === 4.74 && pc12.takeoffRollM === 758 && pc12.landingRollM === 661, 'PC-12 published performance reference changed');
assert(pc12.wakeClass === 'light', 'PC-12 must remain in the light wake class');
const local = generateAirportConfig(17);
assert(local.operationProfile.archetype === 'local-mixed', 'procedural airfield did not receive the local mixed profile');
totals.integrationChecks += 4;

console.log(JSON.stringify(totals));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "airport-operation-profile-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled)
  throw new Error("Airport operation profile validation bundle was empty.");
try {
  await import(
    "data:text/javascript;base64," + Buffer.from(bundled).toString("base64")
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

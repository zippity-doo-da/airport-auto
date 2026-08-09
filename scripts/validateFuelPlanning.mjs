import { build } from "esbuild";

const validationSource = `
import { AIRCRAFT_ROSTER, aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import { airportTrafficProgram, selectTrafficProgram } from './src/simulation/airportTrafficPrograms.ts';
import { createFlightFuelPlan, fuelBurnPercentPerSecond, planFlightFuelLeg } from './src/simulation/flightFuelPlanning.ts';
import { estimateRouteDistanceNm } from './src/simulation/routeDistances.ts';
import { createHubSimulationHarness } from './src/simulation/fixedStepHarness.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const model of AIRCRAFT_ROSTER) {
  const profile = aircraftProfile(model);
  assert(profile.usableFuelKg > 0, model + ': missing modeled usable fuel');
  assert(profile.nominalCruiseFuelBurnKgPerHour > 0, model + ': missing representative cruise fuel flow');
  assert(profile.maximumRangeNm > 0, model + ': missing maximum range');
  for (const phase of ['approach', 'landing', 'taxi-in', 'taxi-out', 'takeoff']) {
    assert(fuelBurnPercentPerSecond(model, phase, true) > 0, model + ': non-positive fuel burn in ' + phase);
  }
  assert(fuelBurnPercentPerSecond(model, 'taxi-in', false) < fuelBurnPercentPerSecond(model, 'taxi-in', true) * 0.3, model + ': stopped taxi-in does not model reduced-engine ground holding');
  assert(fuelBurnPercentPerSecond(model, 'taxi-out', false) < fuelBurnPercentPerSecond(model, 'taxi-out', true) * 0.3, model + ': stopped taxi-out does not model reduced-engine ground holding');
  assert(fuelBurnPercentPerSecond(model, 'taxi-out', false) > 0, model + ': stopped ground holding incorrectly burns no fuel');
}

const ordFrankfurt = estimateRouteDistanceNm('ORD', 'FRA', 'passenger', 1, 417);
const ordVienna = estimateRouteDistanceNm('ORD', 'VIE', 'passenger', 1, 417);
const ordHaneda = estimateRouteDistanceNm('ORD', 'HND', 'passenger', 1, 417);
assert(ordFrankfurt.source === 'great-circle' && ordFrankfurt.distanceNm > 3_500 && ordFrankfurt.distanceNm < 4_100, 'ORD-FRA distance is implausible');
assert(ordVienna.distanceNm > 3_800 && ordVienna.distanceNm < 4_400, 'ORD-VIE distance is implausible');
assert(ordHaneda.distanceNm > 5_200 && ordHaneda.distanceNm < 5_900, 'ORD-HND distance is implausible');

const shortLeg = planFlightFuelLeg({ aircraft: 'B789', origin: 'ORD', destination: 'YYZ', trafficClass: 'passenger', flightId: 4, airportSeed: 417 });
const longLeg = planFlightFuelLeg({ aircraft: 'B789', origin: 'ORD', destination: 'HND', trafficClass: 'passenger', flightId: 4, airportSeed: 417 });
assert(longLeg.dispatchFuelPercent > shortLeg.dispatchFuelPercent + 30, 'route length does not materially change dispatch fuel');
assert(longLeg.dispatchFuelPercent < 96 && !longLeg.capacityLimited, 'capable long-haul fuel plan incorrectly reaches capacity limit');
assert(shortLeg.plannedLandingFuelPercent < shortLeg.dispatchFuelPercent, 'short route has no trip-fuel difference');

const planRequest = {
  aircraft: 'B789', arrivalOrigin: 'HND', airportCode: 'ORD', departureDestination: 'FRA',
  trafficClass: 'passenger', flightId: 83, airportSeed: 417,
};
const firstPlan = createFlightFuelPlan(planRequest);
const secondPlan = createFlightFuelPlan(planRequest);
assert(JSON.stringify(firstPlan) === JSON.stringify(secondPlan), 'flight fuel plan is not deterministic');
assert(firstPlan.modeledArrivalFuelPercent >= 7 && firstPlan.modeledArrivalFuelPercent <= 32, 'arrival fuel is outside the modeled reserve envelope');
assert(firstPlan.modeledArrivalFuelPercent !== 88, 'arrival retained the old generic 88-percent behavior');
assert(firstPlan.departure.dispatchFuelPercent > firstPlan.modeledArrivalFuelPercent, 'long-haul turn does not require a plausible uplift');
assert(firstPlan.assumptions.some((assumption) => /not an operational dispatch/i.test(assumption)), 'planning limitation is not explicit');

const ordProgram = airportTrafficProgram('ORD');
assert(ordProgram.schemaVersion === 2, 'ORD traffic program did not migrate to carrier-market schema 2');
for (const code of ['LH', 'OS', 'JL', 'NH', 'BA', 'KL', 'AF', 'QR', 'AC', 'EI', 'IB', 'LO', 'KE', 'LX', 'EK', 'TK']) {
  assert(ordProgram.airlines.some((airline) => airline.airline === code), 'ORD carrier program omits ' + code);
}
assert(!ordProgram.airlines.some((airline) => airline.airline === 'LY'), 'ORD program invented current EL AL service');
assert(ordProgram.airlines.find((airline) => airline.airline === 'LH')?.markets?.passenger.join(',') === 'FRA,MUC', 'Lufthansa markets are not carrier-specific');
assert(ordProgram.airlines.find((airline) => airline.airline === 'OS')?.markets?.passenger.join(',') === 'VIE', 'Austrian market is not carrier-specific');
assert(ordProgram.airlines.find((airline) => airline.airline === 'JL')?.markets?.passenger.every((market) => market === 'HND' || market === 'NRT'), 'JAL markets are not Tokyo-specific');
assert(ordProgram.sources.some((source) => source.url?.includes('INTLnonstops.pdf')), 'ORD carrier program lacks the current CDA nonstop source');

let rangeChecked = 0;
for (let flightId = 1; flightId <= 2_000; flightId += 1) {
  const selection = selectTrafficProgram(ordProgram, {
    trafficClass: 'passenger', direction: flightId % 2 ? 'arrival' : 'departure', periodId: 'late-international',
    flightId, airportSeed: 417,
  });
  const profile = aircraftProfile(selection.aircraft);
  assert(profile.maximumRangeNm + 1e-6 >= selection.estimatedDistanceNm * 1.08 + 180, selection.airline + ' ' + selection.aircraft + ' cannot cover ORD-' + selection.market);
  rangeChecked += 1;
}

const harness = createHubSimulationHarness('ORD', { stepSeconds: 0.05, pace: 1, mode: 'auto', density: 'busy' });
const arrivals = harness.simulation.state.flights.filter((flight) => flight.phase === 'approach');
assert(arrivals.length > 0, 'ORD startup has no arrivals for fuel integration');
assert(arrivals.every((flight) => flight.kinematics.fuelPercent >= 7 && flight.kinematics.fuelPercent <= 32), 'integrated arrival spawned with dispatch-level fuel');
assert(harness.simulation.state.flights.every((flight) => flight.turnaround.targetFuelPercent === Math.max(flight.turnaround.initialFuelPercent, Math.min(96, flight.fuelPlan.departure.dispatchFuelPercent))), 'turnaround target differs from route fuel plan');
const tracked = arrivals[0];
const beforeFuel = tracked.kinematics.fuelPercent;
harness.advanceTicks(40);
const after = harness.simulation.state.flights.find((flight) => flight.id === tracked.id);
assert(after && after.kinematics.fuelPercent < beforeFuel, 'moving aircraft did not consume fuel');
assert(after && beforeFuel - after.kinematics.fuelPercent < 1, 'terminal flight burned an implausible percentage in two seconds');
const twin = createHubSimulationHarness('ORD', { stepSeconds: 0.05, pace: 1, mode: 'auto', density: 'busy' });
twin.advanceTicks(40);
assert(JSON.stringify(harness.snapshot().flights.map((flight) => flight.fuelPlan)) === JSON.stringify(twin.snapshot().flights.map((flight) => flight.fuelPlan)), 'integrated fuel plans are not deterministic');

console.log(JSON.stringify({
  aircraftProfiles: AIRCRAFT_ROSTER.length,
  ordCarriers: ordProgram.airlines.length,
  rangeChecked,
  ordFrankfurtNm: ordFrankfurt.distanceNm,
  ordViennaNm: ordVienna.distanceNm,
  ordHanedaNm: ordHaneda.distanceNm,
  shortDispatchPercent: shortLeg.dispatchFuelPercent,
  longDispatchPercent: longLeg.dispatchFuelPercent,
  arrivalFuelPercent: firstPlan.modeledArrivalFuelPercent,
  deterministic: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "fuel-planning-validation.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});

const code = result.outputFiles[0].text;
await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);

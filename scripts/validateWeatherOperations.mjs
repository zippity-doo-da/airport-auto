import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { assessRunwayPerformance } from './src/simulation/runwayPerformance.ts';
import { syncFlightMotion } from './src/simulation/flightMotion.ts';
import { sampleFlightTrajectory } from './src/simulation/flightTrajectory.ts';
import { weatherPresentation } from './src/render/weatherPresentation.ts';
import {
  WEATHER_CONDITIONS,
  applyWeatherCondition,
  buildRunwayConditionReports,
  cloneWeatherState,
  createTerminalWeatherHazard,
  createWeatherState,
  isWeatherCondition,
  runwayPerformanceMultiplier,
  taxiBrakingFactor,
  taxiSpeedFactor,
  weatherConditionProfile,
} from './src/simulation/weatherOperations.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ord = generateHubConfig(HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD'));
const longestRunway = [...ord.runways].sort((first, second) => second.length - first.length)[0];
assert(WEATHER_CONDITIONS.join(',') === 'clear,haze,rain,fog,snow,thunderstorm', 'weather catalog drifted');
assert(WEATHER_CONDITIONS.every(isWeatherCondition) && !isWeatherCondition('hail'), 'weather condition guard is invalid');

const expected = {
  clear: { precipitation: 'none', surface: 'dry', code: 6 },
  haze: { precipitation: 'none', surface: 'dry', code: 6 },
  rain: { precipitation: 'rain', surface: 'wet', code: 5 },
  fog: { precipitation: 'none', surface: 'wet', code: 5 },
  snow: { precipitation: 'snow', surface: 'contaminated', code: 3 },
  thunderstorm: { precipitation: 'rain', surface: 'contaminated', code: 2 },
};
const profiles = {};
for (const condition of WEATHER_CONDITIONS) {
  const state = createWeatherState(ord.seed);
  state.weatherEnabled = true;
  applyWeatherCondition(state, condition, 120, ord.seed);
  const reports = buildRunwayConditionReports(ord.runways, state, 120, ord.seed);
  assert(state.condition === condition, condition + ': condition was not applied');
  assert(state.precipitation === expected[condition].precipitation, condition + ': precipitation mismatch');
  assert(state.surfaceCondition === expected[condition].surface, condition + ': surface mismatch');
  assert(reports.length === ord.runways.length, condition + ': runway report count mismatch');
  assert(reports.every((report) => report.codes.length === 3 && report.notForNavigation), condition + ': invalid runway report');
  assert(reports.every((report) => report.worstCode <= expected[condition].code), condition + ': runway code did not degrade as expected');
  profiles[condition] = {
    visibility: state.visibility,
    ceiling: state.ceilingFt,
    worstCode: Math.min(...reports.map((report) => report.worstCode)),
  };
}
assert(profiles.haze.visibility < profiles.clear.visibility, 'haze did not reduce visibility');
assert(profiles.fog.ceiling < profiles.rain.ceiling, 'fog did not create a lower ceiling than rain');
assert(profiles.thunderstorm.worstCode < profiles.rain.worstCode, 'thunderstorm did not degrade runway condition');

const clearState = createWeatherState(ord.seed);
applyWeatherCondition(clearState, 'clear', 0, ord.seed);
clearState.runwayConditionReports = buildRunwayConditionReports(ord.runways, clearState, 0, ord.seed);
const rainState = createWeatherState(ord.seed);
applyWeatherCondition(rainState, 'rain', 0, ord.seed);
rainState.runwayConditionReports = buildRunwayConditionReports(ord.runways, rainState, 0, ord.seed);
const snowState = createWeatherState(ord.seed);
applyWeatherCondition(snowState, 'snow', 0, ord.seed);
snowState.runwayConditionReports = buildRunwayConditionReports(ord.runways, snowState, 0, ord.seed);
const dryPerformance = assessRunwayPerformance(longestRunway, 'A320', 'landing', clearState.runwayConditionReports[longestRunway.id], 0);
const wetPerformance = assessRunwayPerformance(longestRunway, 'A320', 'landing', rainState.runwayConditionReports[longestRunway.id], 0);
const snowPerformance = assessRunwayPerformance(longestRunway, 'A320', 'landing', snowState.runwayConditionReports[longestRunway.id], 0);
assert(dryPerformance.requiredRunwayM < wetPerformance.requiredRunwayM, 'wet runway did not increase landing requirement');
assert(wetPerformance.requiredRunwayM < snowPerformance.requiredRunwayM, 'snow did not further increase landing requirement');
assert(runwayPerformanceMultiplier(0, 'takeoff') === Infinity, 'RwyCC 0 remained available for takeoff');
assert(taxiBrakingFactor(clearState) > taxiBrakingFactor(snowState), 'contamination did not reduce taxi braking');
assert(taxiSpeedFactor(clearState) > taxiSpeedFactor(snowState), 'contamination did not reduce taxi target speed');

const cloned = cloneWeatherState(snowState);
cloned.runwayConditionReports[0].codes[0] = 0;
cloned.hazardHistory.push({
  schemaVersion: 1,
  id: 'clone-check',
  kind: 'wind-shear',
  operation: 'arrival',
  runwayId: 0,
  windChangeKts: 20,
  locationNm: 1.5,
  startedAtSeconds: 0,
  activeUntilSeconds: 10,
  advisoryUntilSeconds: 20,
  status: 'expired',
  affectedFlightIds: [1],
  source: 'deterministic-terminal-weather',
  notForNavigation: true,
});
assert(snowState.runwayConditionReports[0].codes[0] !== 0 && snowState.hazardHistory.length === 0, 'weather clone shared nested state');

const clearVisual = weatherPresentation({ weatherEnabled: true, condition: 'clear' });
const stormVisual = weatherPresentation({ weatherEnabled: true, condition: 'thunderstorm' });
const disabledVisual = weatherPresentation({ weatherEnabled: false, condition: 'thunderstorm' });
assert(stormVisual.fogDensity > clearVisual.fogDensity && stormVisual.precipitation === 'rain', 'thunderstorm presentation looks clear');
assert(JSON.stringify(disabledVisual) === JSON.stringify(clearVisual), 'weather-off presentation retained storm effects');

function hazardFor(operation, runwayId) {
  for (let sequence = 1; sequence < 200; sequence += 1) {
    const hazard = createTerminalWeatherHazard(ord.seed, sequence, 20, [runwayId]);
    if (hazard?.operation === operation) return hazard;
  }
  throw new Error('no deterministic ' + operation + ' hazard fixture');
}

const calmSimulation = new AirportSimulation(ord);
calmSimulation.setWeather('thunderstorm', 0, 24);
for (let tick = 0; tick < 2_000; tick += 1) calmSimulation.update(0.05);
assert(!calmSimulation.state.weather.activeHazard && calmSimulation.state.weather.hazardHistory.length === 0, 'opt-out generated a severe-weather hazard');

const arrivalSimulation = new AirportSimulation(ord);
arrivalSimulation.setWeatherHazardsEnabled(true);
arrivalSimulation.setWeather('thunderstorm', 0, 24);
const arrival = arrivalSimulation.state.flights.find((flight) => flight.phase === 'approach');
assert(arrival, 'arrival hazard fixture has no arrival');
arrival.progress = 0.62;
arrival.phaseElapsed = arrival.duration * arrival.progress;
arrival.kinematics.altitudeFt = 900;
arrival.cleared = true;
syncFlightMotion(ord, arrival);
arrivalSimulation.state.weather.activeHazard = hazardFor('arrival', arrival.runway);
arrivalSimulation.update(0.05);
assert(arrival.goAround?.weatherEscape, 'arrival wind-shear event did not command an escape go-around');
assert(arrivalSimulation.drainEvents().some((event) => event.type === 'go-around' && event.flight.id === arrival.id), 'arrival escape emitted no go-around event');
arrival.progress = 0.12;
const earlyEscape = sampleFlightTrajectory(ord, arrival);
arrival.progress = 0.24;
const laterEscape = sampleFlightTrajectory(ord, arrival);
assert(earlyEscape?.stage === 'go-around-climb' && laterEscape?.stage === 'go-around-climb', 'arrival escape turned before straight-ahead segment completed');
assert(Math.abs(earlyEscape.bank) < 0.02 && Math.abs(laterEscape.bank) < 0.02, 'arrival escape banked during straight-ahead climb');
assert(earlyEscape.pitch > 0.17 && laterEscape.pitch > 0.17, 'arrival escape did not use a positive climb attitude');

const departureSimulation = new AirportSimulation(ord);
departureSimulation.setWeatherHazardsEnabled(true);
departureSimulation.setWeather('thunderstorm', 0, 24);
departureSimulation.setStation('supervisor');
const departure = departureSimulation.state.flights[0];
departure.phase = 'takeoff';
departure.progress = 0.82;
departure.phaseElapsed = departure.duration * departure.progress;
departure.takeoffCleared = true;
departure.navigation.vector = {
  issuedAtSeconds: 0,
  startProgress: 0.8,
  endProgress: 0.95,
  headingDegrees: 45,
  start: { x: departure.motion.x, y: departure.motion.y, z: departure.motion.z, heading: departure.motion.heading },
};
syncFlightMotion(ord, departure);
assert(!departure.motion.onGround, 'departure hazard fixture is not airborne');
departureSimulation.state.weather.activeHazard = hazardFor('departure', departure.runway);
departureSimulation.update(0.05);
assert(departure.weatherEscape?.status === 'active', 'departure wind-shear event did not start an escape');
assert(departure.navigation.vector === undefined, 'departure escape retained a conflicting vector');
assert(!departureSimulation.assignHeading(departure.id, 90) && departureSimulation.lastCommandReason().includes('wind-shear escape'), 'controller could turn an active departure escape');
const departureEscape = sampleFlightTrajectory(ord, departure, Math.min(departure.weatherEscape.clearProgress - 0.01, departure.progress + 0.04));
assert(departureEscape?.stage === 'weather-escape' && Math.abs(departureEscape.bank) < 0.02, 'departure escape did not remain straight ahead');
assert(departureEscape.pitch > 0.2, 'departure escape did not hold a nose-up climb');
assert(departureSimulation.setWeatherHazardsEnabled(false) && !departureSimulation.state.weather.activeHazard, 'hazard opt-out did not immediately clear the advisory');

console.log(JSON.stringify({
  conditions: WEATHER_CONDITIONS.length,
  runwayReports: clearState.runwayConditionReports.length,
  landingMultipliers: {
    dry: dryPerformance.performanceMultiplier,
    wet: wetPerformance.performanceMultiplier,
    snow: snowPerformance.performanceMultiplier,
  },
  hazardsDefaultOff: true,
  arrivalEscape: arrival.goAround.weatherEscape.kind,
  departureEscape: departure.weatherEscape.kind,
  notForNavigation: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "weather-operations-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Weather operations validation bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import {
  ENVIRONMENT_LIGHTING_MODES,
  ENVIRONMENT_SEASON_MODES,
  cloneEnvironmentState,
  createEnvironmentState,
  isEnvironmentLightingMode,
  isEnvironmentSeasonMode,
  seasonAtDay,
  updateEnvironmentState,
} from './src/simulation/environmentOperations.ts';
import { applyWeatherCondition, createWeatherState } from './src/simulation/weatherOperations.ts';
import { environmentPresentation } from './src/render/environmentPresentation.ts';
import {
  ACCESSIBILITY_PALETTES,
  accessibilityPaletteCatalog,
  accessibilityPaletteDefinition,
  isAccessibilityPalette,
} from './src/presentation/accessibilityPalette.ts';
import { CameraDirector } from './src/presentation/cameraDirector.ts';
import { AMBIENT_PROGRAM_IDS, AMBIENT_PROGRAMS } from './src/simulation/ambientPrograms.ts';
import { FixedStepSimulationHarness } from './src/simulation/fixedStepHarness.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(ENVIRONMENT_LIGHTING_MODES.join(',') === 'automatic,day,night', 'lighting catalog drifted');
assert(ENVIRONMENT_SEASON_MODES.join(',') === 'automatic,spring,summer,autumn,winter', 'season catalog drifted');
assert(ENVIRONMENT_LIGHTING_MODES.every(isEnvironmentLightingMode) && !isEnvironmentLightingMode('twilight'), 'lighting guard is invalid');
assert(ENVIRONMENT_SEASON_MODES.every(isEnvironmentSeasonMode) && !isEnvironmentSeasonMode('monsoon'), 'season guard is invalid');
assert(seasonAtDay(1) === 'winter' && seasonAtDay(100) === 'spring' && seasonAtDay(200) === 'summer' && seasonAtDay(300) === 'autumn', 'calendar seasons are invalid');

const first = createEnvironmentState(1492);
const second = createEnvironmentState(1492);
assert(JSON.stringify(first) === JSON.stringify(second), 'environment seed is not deterministic');
const weather = createWeatherState(1492);
weather.weatherEnabled = true;
applyWeatherCondition(weather, 'clear', 0, 1492);
first.seasonMode = 'spring';
updateEnvironmentState(first, weather, 300, '05:00', 1);
assert(first.phase === 'night' || first.phase === 'dawn', 'pre-sunrise phase is invalid');
updateEnvironmentState(first, weather, 720, '12:00', 1);
assert(first.phase === 'day' && first.daylight > 0.99 && first.sunElevationRadians > 0, 'midday did not produce daylight');
updateEnvironmentState(first, weather, 1_120, '18:40', 1);
assert(first.phase === 'dusk' || first.phase === 'night', 'sunset did not produce dusk/night');
first.lightingMode = 'night';
updateEnvironmentState(first, weather, 720, '12:00', 1);
assert(first.phase === 'night' && first.daylight === 0, 'forced night did not override noon');
first.lightingMode = 'day';
updateEnvironmentState(first, weather, 60, '01:00', 1);
assert(first.phase === 'day' && first.daylight === 1, 'forced day did not override night');

first.lightingMode = 'automatic';
first.seasonMode = 'winter';
applyWeatherCondition(weather, 'snow', 100, 1492);
for (let secondIndex = 0; secondIndex < 180; secondIndex += 1) updateEnvironmentState(first, weather, 720, '12:00', 1);
assert(first.snowCover > 0.8, 'snow cover did not accumulate continuously');
assert(first.wetPavement > 0.25 && first.cloudCover > 0.6, 'winter surface/cloud transitions did not respond');
const snowView = environmentPresentation(first, weather);
assert(snowView.snowCover > 0.8 && snowView.cloudOpacity > 0.15, 'snow presentation omitted environment state');
first.seasonMode = 'summer';
applyWeatherCondition(weather, 'clear', 400, 1492);
for (let secondIndex = 0; secondIndex < 1_200; secondIndex += 1) updateEnvironmentState(first, weather, 720, '12:00', 1);
assert(first.snowCover < 0.01 && first.wetPavement < 0.01, 'summer clearing did not melt and dry the surface');
const clone = cloneEnvironmentState(first);
clone.daylight = 0.25;
assert(first.daylight !== clone.daylight, 'environment clone shares mutable state');

const paletteCatalog = accessibilityPaletteCatalog();
assert(ACCESSIBILITY_PALETTES.length === 4 && paletteCatalog.length === 4, 'palette catalog count changed');
assert(ACCESSIBILITY_PALETTES.every(isAccessibilityPalette) && !isAccessibilityPalette('red-green'), 'palette guard is invalid');
assert(new Set(paletteCatalog.map((entry) => entry.id)).size === paletteCatalog.length, 'palette IDs are not unique');
assert(accessibilityPaletteDefinition('high-contrast').semantic.info !== accessibilityPaletteDefinition('high-contrast').semantic.caution, 'high-contrast semantics collapsed');
assert(accessibilityPaletteDefinition('cvd-safe').description.includes('avoids red-versus-green'), 'CVD-safe palette lost its semantic intent');

const ord = generateHubConfig(HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD'));
const simulation = new AirportSimulation(ord);
simulation.setPaused(false);
const initialOperation = simulation.operationProfileSnapshot().current;
assert(simulation.setOperationTimeOffsetMinutes(360), 'operation clock offset was rejected');
const shiftedOperation = simulation.operationProfileSnapshot().current;
assert(shiftedOperation.localMinute === (initialOperation.localMinute + 360) % 1440, 'operation clock offset did not shift the serializable operation state');
assert(simulation.state.environment.localMinute === shiftedOperation.localMinute, 'environment clock did not follow the operation clock offset');
for (const flight of simulation.state.flights.slice(3)) flight.phase = 'resting';
const flights = simulation.state.flights.slice(0, 3);
assert(flights.length === 3, 'camera director fixture needs three aircraft');
flights[0].phase = 'landing';
flights[0].progress = 0.82;
flights[0].goAround = undefined;
flights[1].phase = 'takeoff';
flights[1].progress = 0.7;
flights[2].phase = 'approach';
flights[2].progress = 0.6;
// Keep the camera timing fixture within its 90-second no-repeat window.
flights[0].id = 100;
flights[1].id = 101;
flights[2].id = 102;
const director = new CameraDirector();
assert(director.setEnabled(true, 0), 'camera director did not enable');
const firstDecision = director.update(simulation.state, 0);
assert(firstDecision?.flightId === flights[0].id, 'director did not prefer the live landing operation');
assert(firstDecision?.shotFamily === 'runway-close' && firstDecision.focusScale < 1, 'landing director decision did not request a close runway composition');
const heldDecision = director.update(simulation.state, firstDecision.dwellSeconds - 1);
assert(heldDecision === null, 'director cut before its dwell completed');
const secondDecision = director.update(simulation.state, firstDecision.dwellSeconds + 1);
assert(secondDecision && secondDecision.flightId !== firstDecision.flightId, 'director repeated a target despite alternatives');
assert(secondDecision?.shotFamily === 'departure-track' && secondDecision.focusScale < 1, 'takeoff director decision did not request a departure composition');
const thirdDecision = director.update(simulation.state, firstDecision.dwellSeconds + secondDecision.dwellSeconds + 2);
assert(thirdDecision && thirdDecision.flightId !== firstDecision.flightId && thirdDecision.flightId !== secondDecision.flightId, 'director did not use the remaining fresh subject');
const repeatedTooSoon = director.update(simulation.state, firstDecision.dwellSeconds + secondDecision.dwellSeconds + thirdDecision.dwellSeconds + 3);
assert(repeatedTooSoon === null, 'director repeated a camera subject inside its no-repeat window');
assert(director.snapshot(80).noRepeatWindowSeconds >= 90, 'director no-repeat window is not exposed');
assert(director.yieldToManualInput('test pointer gesture', 40), 'director did not yield to manual input');
assert(director.update(simulation.state, 100) === null, 'yielded director kept selecting aircraft');
const yielded = director.snapshot(100);
assert(!yielded.enabled && yielded.status === 'yielded' && yielded.reason === 'test pointer gesture', 'director did not report manual yield');

assert(AMBIENT_PROGRAM_IDS.length === 7, 'ambient program catalog count changed unexpectedly');
assert(new Set(AMBIENT_PROGRAM_IDS).size === AMBIENT_PROGRAM_IDS.length, 'ambient program IDs are not unique');
assert(simulation.applyAmbientProgram('quiet-overnight'), 'quiet overnight ambient program was rejected');
const quietOvernight = AMBIENT_PROGRAMS['quiet-overnight'];
const quietOperation = simulation.operationProfileSnapshot().current;
assert(quietOperation.localMinute === quietOvernight.localMinute, 'ambient program did not set the serialized operation clock');
assert(simulation.state.trafficFlow.density === quietOvernight.density, 'ambient program did not set traffic density');
assert(simulation.state.trafficFlow.objective === quietOvernight.flowObjective, 'ambient program did not set flow objective');
assert(simulation.state.environment.lightingMode === quietOvernight.lightingMode && simulation.state.environment.seasonMode === quietOvernight.seasonMode, 'ambient program did not set environment presentation');
assert(simulation.state.weather.condition === quietOvernight.weather && simulation.state.weather.hazardsEnabled === false, 'ambient program did not set safe weather posture');
const ambientWindDegrees = (90 - simulation.state.weather.windDirection * 180 / Math.PI + 360) % 360;
assert(Math.abs(ambientWindDegrees - quietOvernight.windDirectionDegrees) < 1e-6, 'ambient program treated aviation wind degrees as a mathematical angle');
const fixedStepHarness = new FixedStepSimulationHarness(ord, { stepSeconds: 0.1 });
assert(fixedStepHarness.simulation.setOperationTimeOffsetMinutes(180), 'fixed-step operation offset was rejected');
const fixedStepSnapshot = fixedStepHarness.snapshot();
assert(fixedStepSnapshot.schemaVersion === 15 && fixedStepSnapshot.state.operationTimeOffsetMinutes === 180, 'fixed-step snapshot omitted the operation clock offset');

console.log(JSON.stringify({
  lightingModes: ENVIRONMENT_LIGHTING_MODES.length,
  seasonModes: ENVIRONMENT_SEASON_MODES.length,
  palettes: ACCESSIBILITY_PALETTES.length,
  deterministicDay: second.dayOfYear,
  snowAccumulated: snowView.snowCover,
  directorSelections: 3,
  operationTimeOffsetMinutes: simulation.state.operationTimeOffsetMinutes,
  ambientProgram: quietOvernight.id,
  fixedStepSnapshotSchema: fixedStepSnapshot.schemaVersion,
  manualYield: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "environment-operations-validation.ts",
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
  throw new Error("Environment operations validation bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

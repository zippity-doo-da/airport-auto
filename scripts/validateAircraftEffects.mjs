import { build } from "esbuild";

const validationSource = `
import { contrailPresentation } from './src/render/aircraftEffects.ts';
import { aircraftSystemsState } from './src/simulation/aircraftSystems.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const weather = {
  weatherEnabled: true, windEnabled: true, condition: 'rain', windDirection: 0,
  windSpeed: 8, gustSpeed: 12, visibility: 5, ceilingFt: 2400, temperatureC: 9, surfaceCondition: 'wet',
};
const flight = {
  id: 7, aircraft: 'B789', phase: 'approach', progress: 0.18,
  kinematics: { altitudeFt: 3_800 }, motion: { onGround: false },
};
const before = JSON.stringify({ flight, weather });
const visible = contrailPresentation(flight, weather, true);
assert(visible.visible && visible.opacity > 0 && visible.lengthScale > 0.75, 'eligible upper-scope turbofan has no contrail presentation');
assert(JSON.stringify({ flight, weather }) === before, 'renderer effect mutated authoritative input state');
assert(!contrailPresentation(flight, weather, false).visible, 'master toggle did not suppress contrails');
assert(!contrailPresentation({ ...flight, aircraft: 'Q400' }, weather, true).visible, 'turboprop received a contrail');
assert(!contrailPresentation({ ...flight, kinematics: { altitudeFt: 1_500 } }, weather, true).visible, 'low-altitude arrival received a contrail');
assert(!contrailPresentation({ ...flight, motion: { onGround: true } }, weather, true).visible, 'ground aircraft received a contrail');
const clearWeather = { ...weather, condition: 'clear', temperatureC: 24, surfaceCondition: 'dry' };
const first = contrailPresentation(flight, clearWeather, true);
const second = contrailPresentation(flight, clearWeather, true);
assert(JSON.stringify(first) === JSON.stringify(second), 'clear-weather moisture band flickers between calls');

const systemsFlight = {
  id: 17,
  aircraft: 'A320',
  phase: 'approach',
  progress: 0.72,
  engineState: 'running',
  tugAttached: false,
  kinematics: {
    airspeedKts: 142,
    groundSpeedKts: 142,
    altitudeFt: 1_400,
    verticalSpeedFpm: -700,
    accelerationMps2: 0,
    fuelPercent: 18,
  },
  motion: {
    x: 0, y: 0, z: 8, heading: 0, pitch: 0.08, bank: 0.18,
    onGround: false, groundBlend: 0, protectedRunway: true,
    distanceAlongM: 0, totalDistanceM: 2_000, stage: 'final', stageProgress: 0.72,
  },
};
const systemsBefore = JSON.stringify({ systemsFlight, weather });
const approachSystems = aircraftSystemsState(systemsFlight, weather, 12.25);
assert(approachSystems.gearExtension > 0.9, 'approach gear did not extend progressively');
assert(approachSystems.flapExtension > 0.65 && approachSystems.slatExtension > 0.65, 'approach high-lift system did not deploy');
assert(approachSystems.lights.landing && approachSystems.lights.strobe && approachSystems.lights.navigation, 'approach lighting state is incomplete');
assert(approachSystems.effects.condensation > 0, 'humid high-lift approach has no condensation');
assert(JSON.stringify({ systemsFlight, weather }) === systemsBefore, 'aircraft systems mutated authoritative input');
assert(JSON.stringify(approachSystems) === JSON.stringify(aircraftSystemsState(systemsFlight, weather, 12.25)), 'aircraft systems are not deterministic');

const takeoffSystems = aircraftSystemsState({
  ...systemsFlight,
  phase: 'takeoff',
  progress: 0.62,
  kinematics: { ...systemsFlight.kinematics, airspeedKts: 174, groundSpeedKts: 174, verticalSpeedFpm: 1_800 },
  motion: { ...systemsFlight.motion, onGround: false, stage: 'climb', stageProgress: 0.58, pitch: 0.16 },
}, clearWeather, 14.2);
assert(takeoffSystems.gearExtension < 0.25, 'takeoff gear did not retract after positive climb');
assert(takeoffSystems.flapExtension < 0.2, 'takeoff flaps did not begin schedule retraction');
assert(takeoffSystems.lights.landing && takeoffSystems.lights.strobe, 'takeoff lighting state is incomplete');

const touchdownFlight = {
  ...systemsFlight,
  phase: 'landing',
  progress: 0.56,
  kinematics: { ...systemsFlight.kinematics, airspeedKts: 112, groundSpeedKts: 112, altitudeFt: 0, verticalSpeedFpm: 0 },
  motion: { ...systemsFlight.motion, onGround: true, stage: 'rollout', stageProgress: 0.09, pitch: 0.04 },
};
const touchdownSystems = aircraftSystemsState(touchdownFlight, clearWeather, 16.1);
assert(touchdownSystems.gearExtension === 1 && touchdownSystems.spoilerExtension > 0, 'touchdown did not deploy gear and ground spoilers');
assert(touchdownSystems.reverserExtension > 0, 'jet rollout did not deploy thrust reversers');
assert(touchdownSystems.effects.tireSmoke > 0 && touchdownSystems.effects.surfaceSpray === 0, 'dry touchdown effects are implausible');
const wetTouchdownSystems = aircraftSystemsState(touchdownFlight, weather, 16.1);
assert(wetTouchdownSystems.effects.tireSmoke === 0 && wetTouchdownSystems.effects.surfaceSpray > 0, 'wet touchdown did not replace tire smoke with spray');

const taxiSystems = aircraftSystemsState({
  ...systemsFlight,
  phase: 'taxi-in',
  progress: 0.4,
  kinematics: { ...systemsFlight.kinematics, airspeedKts: 0, groundSpeedKts: 19, altitudeFt: 0 },
  motion: { ...systemsFlight.motion, onGround: true, stage: 'taxi', stageProgress: 0.4, bank: 0 },
}, weather, 18);
assert(taxiSystems.lights.taxi && !taxiSystems.lights.landing && taxiSystems.effects.surfaceSpray > 0, 'surface light/effect state is not phase-aware');
const shutdownSystems = aircraftSystemsState({
  ...systemsFlight,
  phase: 'resting',
  progress: 0,
  engineState: 'off',
  kinematics: { ...systemsFlight.kinematics, airspeedKts: 0, groundSpeedKts: 0, altitudeFt: 0 },
  motion: { ...systemsFlight.motion, onGround: true, stage: 'stand', stageProgress: 0, bank: 0 },
}, clearWeather, 20);
assert(!shutdownSystems.lights.navigation && !shutdownSystems.lights.beacon && shutdownSystems.effects.exhaust === 0, 'shutdown aircraft retains live lights/effects');
const pistonSystems = aircraftSystemsState({ ...systemsFlight, aircraft: 'C172' }, weather, 12.25);
assert(pistonSystems.slatExtension === 0, 'piston GA aircraft received transport-category slats');

const strobeSamples = Array.from({ length: 80 }, (_, index) => aircraftSystemsState(systemsFlight, weather, index / 20).lights.strobePulse);
assert(strobeSamples.some((value) => value === 1) && strobeSamples.some((value) => value === 0), 'strobe pulse is not a deterministic flashing cycle');

console.log(JSON.stringify({
  upperScopeVisible: visible.visible,
  opacity: visible.opacity,
  lengthScale: visible.lengthScale,
  clearWeatherStable: true,
  authoritativeStateUnchanged: true,
  systemsSchema: approachSystems.schemaVersion,
  approachGear: approachSystems.gearExtension,
  takeoffGear: takeoffSystems.gearExtension,
  touchdownReverser: touchdownSystems.reverserExtension,
  wetSurfaceSpray: wetTouchdownSystems.effects.surfaceSpray,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "aircraft-effects-validation.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});

const code = result.outputFiles[0].text;
try {
  await import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64")
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

import { build } from "esbuild";

const validationSource = `
import { contrailPresentation } from './src/render/aircraftEffects.ts';

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

console.log(JSON.stringify({
  upperScopeVisible: visible.visible,
  opacity: visible.opacity,
  lengthScale: visible.lengthScale,
  clearWeatherStable: true,
  authoritativeStateUnchanged: true,
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
await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);

import { build } from "esbuild";

const validationSource = `
import {
  AIRCRAFT_ASSET_BUDGETS,
  applyAircraftVisualSystems,
  createAircraftVisual,
} from './src/render/aircraftVisualFactory.ts';
import { AIRCRAFT_PROFILES, AIRCRAFT_ROSTER } from './src/simulation/aircraftProfiles.ts';
import {
  AIRLINE_PROFILES,
  AIRPORT_AIRLINES,
  airlineLiveryPresentation,
  airlineLiveryStyle,
} from './src/simulation/airlineProfiles.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const airlines = Object.keys(AIRLINE_PROFILES);
const families = new Set();
const maxima = {
  high: { meshes: 0, materials: 0, textures: 0, triangles: 0, geometryBytes: 0 },
  low: { meshes: 0, materials: 0, textures: 0, triangles: 0, geometryBytes: 0 },
};

function validateBudget(model, detail, counts) {
  const budget = AIRCRAFT_ASSET_BUDGETS[detail];
  assert(counts.meshes <= budget.meshNodes, model + ' ' + detail + ' mesh-node budget exceeded');
  assert(counts.materials <= budget.materials, model + ' ' + detail + ' material budget exceeded');
  assert(counts.textures <= budget.textures, model + ' ' + detail + ' texture budget exceeded');
  assert(counts.triangles <= budget.triangles, model + ' ' + detail + ' triangle budget exceeded');
  assert(counts.geometryBytes <= budget.geometryBytes, model + ' ' + detail + ' geometry-memory budget exceeded');
  for (const key of Object.keys(maxima[detail])) maxima[detail][key] = Math.max(maxima[detail][key], counts[key]);
}

for (let index = 0; index < AIRCRAFT_ROSTER.length; index += 1) {
  const aircraft = AIRCRAFT_ROSTER[index];
  const airline = airlines[index % airlines.length];
  const profile = AIRCRAFT_PROFILES[aircraft];
  const high = createAircraftVisual({ aircraft, airline, palette: index % 3 }, 0xffc875, false);
  const low = createAircraftVisual({ aircraft, airline, palette: index % 3 }, 0xffc875, true);
  families.add(high.family);
  assert(high.family === profile.visual.family && low.family === profile.visual.family, aircraft + ' visual family drifted from catalog');
  assert(high.root.name.includes(aircraft) && high.root.name.includes(high.family), aircraft + ' root lacks readable family identity');
  assert(high.root.getObjectByName('original-livery-' + airlineLiveryStyle(airline)), aircraft + ' lacks its original livery grammar');
  assert(high.gear.children.length === 2 && low.gear.children.length === 2, aircraft + ' gear was not instanced into bounded draw calls');
  assert(high.flaps.length === 2 && high.slats.length === 2 && high.spoilers.length === 2, aircraft + ' high-detail control surfaces are incomplete');
  assert(low.flaps.length === 2 && low.slats.length === 2 && low.spoilers.length === 0, aircraft + ' low-detail control-surface LOD is inconsistent');
  assert(high.navLights.length === 3 && high.strobeLights.length === 1 && high.recognitionLights.length === 1, aircraft + ' light suite is incomplete');
  if (profile.visual.cargoDoor) assert(high.root.getObjectByName('main-deck-cargo-door'), aircraft + ' cargo door is missing');
  if (profile.visual.passengerWindows) assert(high.root.getObjectByName('passenger-window-row'), aircraft + ' passenger windows are missing');
  if (profile.visual.propeller) {
    assert(high.propellers.length === profile.engines, aircraft + ' propeller count differs from engine count');
    assert(low.root.getObjectByName('propeller-disc-array'), aircraft + ' low-detail propellers were not instanced');
  } else {
    assert(high.reversers.length === profile.engines && low.reversers.length === 1, aircraft + ' thrust-reverser presentation is incomplete');
  }
  if (aircraft === 'B748') assert(high.root.getObjectByName('747-upper-deck'), 'jumbo family lacks upper-deck identity');
  validateBudget(aircraft, 'high', high.assetCounts);
  validateBudget(aircraft, 'low', low.assetCounts);
  assert(low.assetCounts.meshes <= high.assetCounts.meshes, aircraft + ' low LOD adds mesh nodes');
  assert(low.assetCounts.triangles < high.assetCounts.triangles, aircraft + ' low LOD does not reduce triangles');
  assert(low.assetCounts.geometryBytes < high.assetCounts.geometryBytes, aircraft + ' low LOD does not reduce geometry memory');
}
assert(families.size >= 10, 'visual factory did not preserve distinct catalog families');

const austrianLivery = airlineLiveryPresentation('OS');
assert(AIRPORT_AIRLINES.ORD.includes('OS'), 'ORD carrier pool is missing Austrian Airlines');
assert(austrianLivery.fuselageColor === 0xeee9e1, 'Austrian fuselage paint drifted');
assert(austrianLivery.tailColor === 0xc64b45, 'Austrian tail paint drifted');
const austrianVisual = createAircraftVisual({ aircraft: 'B789', airline: 'OS', palette: 0 }, 0xffc875, false);
const austrianFin = austrianVisual.root.getObjectByName('vertical-stabilizer');
assert(austrianFin?.material?.color?.getHex?.() === austrianLivery.tailColor, 'Austrian tail is not rendered in its livery color');
for (const airline of airlines) {
  const presentation = airlineLiveryPresentation(airline);
  assert(presentation.fuselageColor !== presentation.tailColor, airline + ' livery does not distinguish the tail from the fuselage');
  const rendered = createAircraftVisual({ aircraft: 'A320', airline, palette: 0 }, 0xffc875, true);
  const fin = rendered.root.getObjectByName('vertical-stabilizer');
  assert(fin?.material?.color?.getHex?.() === presentation.tailColor, airline + ' tail color did not reach the aircraft visual');
}

const animated = createAircraftVisual({ aircraft: 'A320', airline: 'UA', palette: 0 }, 0xffc875, false);
const systemState = {
  schemaVersion: 1,
  gearExtension: 0.62,
  flapExtension: 0.8,
  slatExtension: 0.76,
  spoilerExtension: 0.7,
  reverserExtension: 0.66,
  lights: {
    navigation: true, beacon: true, strobe: true, strobePulse: 1,
    landing: true, taxi: false, recognition: true, beaconPulse: 0.8,
  },
  effects: { exhaust: 0.7, condensation: 0.6, tireSmoke: 0.8, surfaceSpray: 0 },
};
applyAircraftVisualSystems(animated, systemState, { id: 7, phase: 'landing', engineState: 'running' }, 12, 0.05, 1);
assert(animated.gear.visible && animated.gear.scale.z > 0.5, 'gear state did not reach visual adapter');
assert(animated.flaps.every((part) => Math.abs(part.rotation.y) > 0.2), 'flap state did not animate');
assert(animated.slats.every((part) => part.position.x > Number(part.userData.baseX)), 'slat state did not animate');
assert(animated.spoilers.every((part) => Math.abs(part.rotation.y) > 0.2), 'spoiler state did not animate');
assert(animated.reversers.every((part) => part.position.x < Number(part.userData.baseX)), 'reverser state did not animate');
assert(animated.navLights.every((light) => light.visible) && animated.strobeLights.every((light) => light.visible), 'light state did not reach visual adapter');
assert(animated.tireSmoke.visible && !animated.surfaceSpray.visible, 'momentary contact effects did not reach visual adapter');

console.log(JSON.stringify({
  models: AIRCRAFT_ROSTER.length,
  families: families.size,
  budgets: AIRCRAFT_ASSET_BUDGETS,
  observedMaxima: maxima,
  animatedSystems: true,
  instancedGear: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "aircraft-visual-validation.ts",
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

import { build } from "esbuild";

const validationSource = `
import * as THREE from 'three';
import { BoundedObjectPool } from './src/render/boundedObjectPool.ts';
import { buildLandscape, landscapeDimensions } from './src/render/landscapeScene.ts';
import {
  surfaceDisruptionPoolSize,
  updateSurfaceDisruptionVisuals,
} from './src/render/surfaceDisruptionVisuals.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let nextObject = 0;
const disposed = [];
const reset = [];
const pool = new BoundedObjectPool({
  capacity: 2,
  create: () => ({ id: ++nextObject }),
  reset: (value) => reset.push(value.id),
  dispose: (value) => disposed.push(value.id),
});
const first = pool.acquire();
const second = pool.acquire();
const third = pool.acquire();
pool.release(first);
pool.release(second);
assert(!pool.release(third), 'bounded pool retained an object over capacity');
const reused = pool.acquire();
assert(reused === second, 'bounded pool did not reuse resources deterministically in LIFO order');
pool.release(reused);
const poolSnapshot = pool.snapshot();
assert(poolSnapshot.available === 2 && poolSnapshot.reused === 1, 'bounded pool diagnostics are wrong');
assert(reset.length === 4 && disposed.length === 1, 'bounded pool did not reset or dispose releases correctly');
pool.dispose();
assert(pool.snapshot().available === 0 && disposed.length === 3, 'bounded pool did not dispose retained resources');

const landscapeRoot = new THREE.Group();
const landscapeConfig = { scope: 'center', terrain: 'woodland', contextData: undefined };
const dimensions = landscapeDimensions(landscapeConfig);
const landscape = buildLandscape(landscapeRoot, landscapeConfig, dimensions);
const landscapeMeshes = [];
landscapeRoot.traverse((object) => {
  if (object instanceof THREE.InstancedMesh) landscapeMeshes.push(object);
});
assert(landscape.instancedDrawGroups === 3, 'center landscape did not collapse repetitions into three draw groups');
assert(landscape.districtInstances === 54, 'procedural district instance count drifted');
assert(landscape.highwayInstances === 9, 'highway pavement/marking instance count drifted');
assert(landscape.instances === 63, 'landscape instance total drifted');
assert(landscapeMeshes.length === 3 && landscapeMeshes.reduce((sum, mesh) => sum + mesh.count, 0) === 63, 'landscape diagnostics disagree with scene objects');

const disruptionLayer = new THREE.Group();
const disruptionVisuals = new Map();
const disruptionPools = new Map();
let disruptionDisposals = 0;
const graph = {
  nodes: [
    { id: 'A', position: [0, 0] },
    { id: 'B', position: [10, 0] },
  ],
  edges: [{ id: 'E', from: 'A', to: 'B' }],
};
const disruption = {
  id: 'SD-1', kind: 'construction', status: 'active', edgeIds: ['E'],
};
const updateDisruptions = (surfaceDisruptions) => updateSurfaceDisruptionVisuals({
  state: { elapsed: 1, surfaceDisruptions, flights: [] },
  graph,
  scope: 'center',
  layer: disruptionLayer,
  visuals: disruptionVisuals,
  pools: disruptionPools,
  poolBudget: 3,
  dispose: () => { disruptionDisposals += 1; },
});
updateDisruptions([disruption]);
const firstMarker = disruptionVisuals.get('SD-1');
assert(firstMarker, 'surface disruption marker was not created');
let markerInstanceGroups = 0;
firstMarker.traverse((object) => {
  if (object instanceof THREE.InstancedMesh) markerInstanceGroups += 1;
});
assert(markerInstanceGroups === 2, 'construction cones were not split into instanced color groups');
updateDisruptions([]);
assert(disruptionVisuals.size === 0 && surfaceDisruptionPoolSize(disruptionPools) === 1, 'transient marker was not pooled');
updateDisruptions([{ ...disruption, id: 'SD-2' }]);
assert(disruptionVisuals.get('SD-2') === firstMarker, 'transient marker pool did not reuse the released group');
assert(disruptionDisposals === 0, 'pooled transient marker was disposed during reuse');

console.log(JSON.stringify({
  landscapeDrawGroups: landscape.instancedDrawGroups,
  landscapeInstances: landscape.instances,
  markerInstanceGroups,
  genericPoolCreated: poolSnapshot.created,
  genericPoolReused: poolSnapshot.reused,
  transientMarkersReused: 1,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "renderer-resource-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Renderer resource validation bundle was empty.");
await import(`data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`);

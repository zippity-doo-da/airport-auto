import * as THREE from "three";
import {
  COMBAT_ALTITUDES,
  COMBAT_THEATERS,
  COMBAT_WEATHER,
  createDefaultDogfightScenario,
  normalizeDogfightScenario,
  scenarioWindVector,
  terrainSurfaceAt,
  type DogfightScenarioSettings,
} from "../dogfight/combatScenarios";
import type { Vec3 } from "./flightPlaygroundSimulation";

export interface FlightEnvironment {
  setSettings: (settings: DogfightScenarioSettings) => void;
  update: (elapsedSeconds: number, focus: Vec3) => void;
  dispose: () => void;
}

interface CloudLayerView {
  mesh: THREE.InstancedMesh;
  material: THREE.MeshLambertMaterial;
  baseAltitudeM: number;
  baseOpacity: number;
  driftScale: number;
}

interface EnvironmentView {
  sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  sun: THREE.Group;
  cloudLayers: CloudLayerView[];
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
// Keep the procedural ground safely beyond the farthest combat position and
// visibility setting so the camera can never expose a hard terrain edge.
const TERRAIN_SPAN_M = 260_000;

export function createFlightEnvironment(scene: THREE.Scene): FlightEnvironment {
  const root = new THREE.Group();
  root.name = "flight-environment";
  scene.add(root);
  let settings: DogfightScenarioSettings = {
    ...createDefaultDogfightScenario(),
    theaterId: "training",
    altitudeId: "medium",
    weatherId: "clear",
    visibilityKm: COMBAT_WEATHER.clear.defaultVisibilityKm,
    windSpeedKnots: 0,
  };
  let view = createEnvironmentView(scene, root, settings);

  const setSettings = (nextSettings: DogfightScenarioSettings): void => {
    const normalized = normalizeDogfightScenario(nextSettings);
    const requiresRebuild =
      environmentStructureSignature(normalized) !==
      environmentStructureSignature(settings);
    settings = normalized;
    applyAtmosphere(scene, settings);
    if (!requiresRebuild) {
      return;
    }
    disposeObject(root);
    root.clear();
    view = createEnvironmentView(scene, root, settings);
  };

  const update = (elapsedSeconds: number, focus: Vec3): void => {
    const focusVector = new THREE.Vector3(focus.x, focus.y, focus.z);
    view.sky.position.copy(focusVector);
    view.sky.material.uniforms.altitudeFactor.value = THREE.MathUtils.clamp(
      focus.y / 13_000,
      0,
      1,
    );
    view.sun.position
      .copy(focusVector)
      .add(new THREE.Vector3(-52_000, 38_000, -46_000));
    view.sun.lookAt(focusVector);

    const wind = scenarioWindVector(settings);
    for (const layer of view.cloudLayers) {
      layer.mesh.position.x = wind.x * elapsedSeconds * layer.driftScale;
      layer.mesh.position.z = wind.z * elapsedSeconds * layer.driftScale;
      const verticalDistance = Math.abs(focus.y - layer.baseAltitudeM);
      const readability = THREE.MathUtils.smoothstep(
        verticalDistance,
        350,
        1_350,
      );
      layer.material.opacity =
        layer.baseOpacity * THREE.MathUtils.lerp(0.28, 1, readability);
    }
  };

  const dispose = (): void => {
    disposeObject(root);
    root.removeFromParent();
  };

  return { setSettings, update, dispose };
}

function createEnvironmentView(
  scene: THREE.Scene,
  root: THREE.Group,
  settings: DogfightScenarioSettings,
): EnvironmentView {
  const theater = COMBAT_THEATERS[settings.theaterId];
  const weather = COMBAT_WEATHER[settings.weatherId];
  applyAtmosphere(scene, settings);

  const hemisphere = new THREE.HemisphereLight(
    settings.altitudeId === "high" ? 0xd8e7ed : 0xdde6dd,
    theater.palette.low,
    2.35,
  );
  root.add(hemisphere);

  const sunlight = new THREE.DirectionalLight(
    settings.theaterId === "desert" ? 0xffddb1 : 0xffe3b8,
    4.25 * weather.sunlight,
  );
  sunlight.position.set(-34_000, 52_000, 18_000);
  root.add(sunlight);

  const rim = new THREE.DirectionalLight(0x9dcbd5, 1.35);
  rim.position.set(26_000, 18_000, -38_000);
  root.add(rim);

  const sky = createSkyDome(settings);
  root.add(sky);

  const terrain = createTerrain(settings);
  root.add(terrain);
  root.add(createGroundReferenceLines(settings));
  for (const detail of createGroundDetails(settings)) root.add(detail);

  const cloudLayers = createCloudLayers(settings);
  for (const layer of cloudLayers) root.add(layer.mesh);

  const sun = createSunGlare(weather.sunlight);
  root.add(sun);

  return { sky, sun, cloudLayers };
}

function applyAtmosphere(
  scene: THREE.Scene,
  settings: DogfightScenarioSettings,
): void {
  const weather = COMBAT_WEATHER[settings.weatherId];
  const hazeColor = new THREE.Color(
    settings.theaterId === "desert" ? 0xb89b76 : 0x78938e,
  );
  hazeColor.lerp(new THREE.Color(0xb8c0b0), weather.hazeStrength * 0.48);
  scene.background = hazeColor;
  const visibilityM = settings.visibilityKm * 1_000;
  scene.fog = new THREE.Fog(
    hazeColor,
    Math.max(3_500, visibilityM * 0.17),
    visibilityM,
  );
}

function createSkyDome(
  settings: DogfightScenarioSettings,
): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const desert = settings.theaterId === "desert";
  const weather = COMBAT_WEATHER[settings.weatherId];
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(desert ? 0x214d68 : 0x123a58) },
      highZenith: { value: new THREE.Color(0x071c38) },
      upper: { value: new THREE.Color(desert ? 0x65859a : 0x4f777b) },
      horizon: {
        value: new THREE.Color(desert ? 0xd0b28b : 0xa5b7aa).lerp(
          new THREE.Color(0xc2c5b5),
          weather.hazeStrength * 0.6,
        ),
      },
      lower: { value: new THREE.Color(desert ? 0x8f7456 : 0x607d6d) },
      altitudeFactor: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 zenith;
      uniform vec3 highZenith;
      uniform vec3 upper;
      uniform vec3 horizon;
      uniform vec3 lower;
      uniform float altitudeFactor;
      varying vec3 vDirection;
      void main() {
        float h = clamp(vDirection.y, -0.15, 1.0);
        vec3 lowMix = mix(lower, horizon, smoothstep(-0.12, 0.08, h));
        vec3 highColor = mix(zenith, highZenith, altitudeFactor);
        vec3 highMix = mix(upper, highColor, smoothstep(0.18, 0.92, h));
        vec3 color = mix(lowMix, highMix, smoothstep(0.04, 0.52, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(135_000, 32, 16),
    material,
  );
  sky.name = "combat-sky-dome";
  sky.frustumCulled = false;
  return sky;
}

function createTerrain(settings: DogfightScenarioSettings): THREE.Mesh {
  const theater = COMBAT_THEATERS[settings.theaterId];
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SPAN_M,
    TERRAIN_SPAN_M,
    132,
    132,
  );
  const position = geometry.getAttribute("position");
  const colors: number[] = [];
  const low = new THREE.Color(theater.palette.low);
  const middle = new THREE.Color(theater.palette.middle);
  const high = new THREE.Color(theater.palette.high);
  const water = new THREE.Color(theater.palette.water);
  const heightScale =
    settings.theaterId === "mountains"
      ? 2_650
      : settings.theaterId === "desert"
        ? 760
        : settings.theaterId === "coast"
          ? 520
          : settings.theaterId === "training"
            ? 430
            : 190;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const worldZ = -position.getY(index);
    const surface = terrainSurfaceAt(settings.theaterId, x, worldZ);
    position.setZ(index, surface.heightM);
    let color: THREE.Color;
    if (surface.water) {
      color = water.clone();
      color.offsetHSL(
        Math.sin(x * 0.00011 + worldZ * 0.00014) * 0.012,
        0,
        Math.sin((x - worldZ) * 0.00022) * 0.028,
      );
    } else {
      const normalizedHeight = THREE.MathUtils.clamp(
        surface.heightM / heightScale,
        0,
        1,
      );
      color =
        normalizedHeight < 0.58
          ? low.clone().lerp(middle, normalizedHeight / 0.58)
          : middle.clone().lerp(high, (normalizedHeight - 0.58) / 0.42);
      color.offsetHSL(0, 0, Math.sin(x * 0.00082 + worldZ * 0.00067) * 0.045);
    }
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: settings.theaterId === "coast" ? 0.82 : 0.98,
      metalness: 0.01,
      flatShading: true,
    }),
  );
  terrain.name = `${settings.theaterId}-combat-terrain`;
  terrain.rotation.x = -Math.PI / 2;
  return terrain;
}

function createGroundReferenceLines(
  settings: DogfightScenarioSettings,
): THREE.LineSegments {
  const theater = COMBAT_THEATERS[settings.theaterId];
  const positions: number[] = [];
  const random = seededRandom(theater.id.length * 0x51f15e);
  const roadCount = settings.theaterId === "mountains" ? 7 : 12;
  const samples = 46;

  for (let roadIndex = 0; roadIndex < roadCount; roadIndex += 1) {
    const horizontal = roadIndex % 2 === 0;
    const offset = (random() - 0.5) * 76_000;
    const bend = (random() - 0.5) * 7_000;
    let previous: THREE.Vector3 | null = null;
    for (let sample = 0; sample < samples; sample += 1) {
      const progress = sample / (samples - 1);
      const main = THREE.MathUtils.lerp(-72_000, 72_000, progress);
      const cross = offset + Math.sin(progress * Math.PI * 2.2) * bend;
      const x = horizontal ? main : cross;
      const z = horizontal ? cross : main;
      const surface = terrainSurfaceAt(settings.theaterId, x, z);
      const point = new THREE.Vector3(x, surface.heightM + 7, z);
      if (previous && !surface.water) {
        positions.push(
          previous.x,
          previous.y,
          previous.z,
          point.x,
          point.y,
          point.z,
        );
      }
      previous = surface.water ? null : point;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const roads = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: theater.palette.road,
      transparent: true,
      opacity: settings.theaterId === "desert" ? 0.38 : 0.3,
      depthWrite: false,
    }),
  );
  roads.name = "ground-reference-network";
  return roads;
}

function createGroundDetails(
  settings: DogfightScenarioSettings,
): THREE.Object3D[] {
  const style = COMBAT_THEATERS[settings.theaterId].detailStyle;
  if (style === "farms") return [createFarmPatches(settings)];
  if (style === "coastal") {
    return [createCoastalSettlement(settings), createLandmarks(settings, 180)];
  }
  if (style === "desert") return [createDesertMesas(settings)];
  if (style === "alpine") {
    return [createTreeInstances(settings, 720), createLandmarks(settings, 230)];
  }
  return [createTreeInstances(settings, 1_050)];
}

function createTreeInstances(
  settings: DogfightScenarioSettings,
  count: number,
): THREE.InstancedMesh {
  const geometry = new THREE.ConeGeometry(7, 34, 5, 1);
  geometry.translate(0, 17, 0);
  const material = new THREE.MeshStandardMaterial({
    color: COMBAT_THEATERS[settings.theaterId].palette.accent,
    roughness: 1,
    flatShading: true,
  });
  const trees = new THREE.InstancedMesh(geometry, material, count);
  const random = seededRandom(0x4a3230 + settings.theaterId.length * 97);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  for (let index = 0; index < count; index += 1) {
    const x = (random() - 0.5) * 112_000;
    const z = (random() - 0.5) * 112_000;
    const surface = terrainSurfaceAt(settings.theaterId, x, z);
    const size = 0.75 + random() * 2.4;
    position.set(x, surface.heightM, z);
    scale.set(size, size, size);
    quaternion.setFromAxisAngle(WORLD_UP, random() * Math.PI * 2);
    matrix.compose(position, quaternion, scale);
    trees.setMatrixAt(index, matrix);
  }
  trees.instanceMatrix.needsUpdate = true;
  trees.name = "instanced-ground-forest";
  return trees;
}

function createFarmPatches(
  settings: DogfightScenarioSettings,
): THREE.InstancedMesh {
  const count = 420;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
  });
  const fields = new THREE.InstancedMesh(geometry, material, count);
  const random = seededRandom(0x71a1c5);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const palette = [0x69764b, 0x8c8450, 0x9a7950, 0x536746];
  for (let index = 0; index < count; index += 1) {
    const x = (random() - 0.5) * 120_000;
    const z = (random() - 0.5) * 120_000;
    const surface = terrainSurfaceAt(settings.theaterId, x, z);
    const sx = 260 + random() * 760;
    const sz = 220 + random() * 680;
    matrix.compose(
      new THREE.Vector3(x, surface.heightM + 2.5, z),
      new THREE.Quaternion().setFromAxisAngle(WORLD_UP, random() * 0.24),
      new THREE.Vector3(sx, 5, sz),
    );
    fields.setMatrixAt(index, matrix);
    fields.setColorAt(index, color.setHex(palette[index % palette.length]));
  }
  fields.instanceMatrix.needsUpdate = true;
  if (fields.instanceColor) fields.instanceColor.needsUpdate = true;
  fields.name = "instanced-farm-patches";
  return fields;
}

function createCoastalSettlement(
  settings: DogfightScenarioSettings,
): THREE.InstancedMesh {
  const count = 360;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0xb8ac91,
    roughness: 0.94,
  });
  const buildings = new THREE.InstancedMesh(geometry, material, count);
  const random = seededRandom(0xc0457a1);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < count; index += 1) {
    let x = -2_000 + random() * 28_000;
    const z = (random() - 0.5) * 70_000;
    let surface = terrainSurfaceAt(settings.theaterId, x, z);
    if (surface.water) {
      x += 9_000;
      surface = terrainSurfaceAt(settings.theaterId, x, z);
    }
    const height = 12 + random() * 44;
    matrix.compose(
      new THREE.Vector3(x, surface.heightM + height * 0.5, z),
      new THREE.Quaternion().setFromAxisAngle(WORLD_UP, random() * Math.PI),
      new THREE.Vector3(16 + random() * 45, height, 16 + random() * 52),
    );
    buildings.setMatrixAt(index, matrix);
  }
  buildings.instanceMatrix.needsUpdate = true;
  buildings.name = "instanced-coastal-settlement";
  return buildings;
}

function createDesertMesas(
  settings: DogfightScenarioSettings,
): THREE.InstancedMesh {
  const count = 280;
  const geometry = new THREE.CylinderGeometry(0.72, 1, 1, 7, 1);
  const material = new THREE.MeshStandardMaterial({
    color: COMBAT_THEATERS.desert.palette.accent,
    roughness: 1,
    flatShading: true,
  });
  const mesas = new THREE.InstancedMesh(geometry, material, count);
  const random = seededRandom(0xde5e47);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < count; index += 1) {
    const x = (random() - 0.5) * 120_000;
    const z = (random() - 0.5) * 120_000;
    const surface = terrainSurfaceAt(settings.theaterId, x, z);
    const radius = 45 + random() * 180;
    const height = 35 + random() * 190;
    matrix.compose(
      new THREE.Vector3(x, surface.heightM + height * 0.5, z),
      new THREE.Quaternion().setFromAxisAngle(WORLD_UP, random() * Math.PI),
      new THREE.Vector3(radius, height, radius * (0.65 + random() * 0.5)),
    );
    mesas.setMatrixAt(index, matrix);
  }
  mesas.instanceMatrix.needsUpdate = true;
  mesas.name = "instanced-desert-mesas";
  return mesas;
}

function createLandmarks(
  settings: DogfightScenarioSettings,
  count: number,
): THREE.InstancedMesh {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({
    color: COMBAT_THEATERS[settings.theaterId].palette.accent,
    roughness: 1,
    flatShading: true,
  });
  const landmarks = new THREE.InstancedMesh(geometry, material, count);
  const random = seededRandom(0x1a4d6a + count);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < count; index += 1) {
    const x = (random() - 0.5) * 118_000;
    const z = (random() - 0.5) * 118_000;
    const surface = terrainSurfaceAt(settings.theaterId, x, z);
    const size = 18 + random() * 74;
    matrix.compose(
      new THREE.Vector3(x, surface.heightM + size * 0.35, z),
      new THREE.Quaternion().setFromAxisAngle(WORLD_UP, random() * Math.PI),
      new THREE.Vector3(size, size * 0.7, size * 1.25),
    );
    landmarks.setMatrixAt(index, matrix);
  }
  landmarks.instanceMatrix.needsUpdate = true;
  landmarks.name = "instanced-ground-landmarks";
  return landmarks;
}

function createCloudLayers(
  settings: DogfightScenarioSettings,
): CloudLayerView[] {
  const weather = COMBAT_WEATHER[settings.weatherId];
  const altitude = COMBAT_ALTITUDES[settings.altitudeId];
  const layers: CloudLayerView[] = [];
  if (weather.cloudCoverage > 0.02) {
    layers.push(
      createCloudLayer(
        settings,
        3_700 + weather.cloudCoverage * 1_250,
        weather.cloudCoverage,
        0.42 + weather.cloudCoverage * 0.24,
        0.52,
        0xeff0df,
        0x93a39d,
      ),
    );
  }
  if (weather.cirrusCoverage > 0.02) {
    layers.push(
      createCloudLayer(
        settings,
        Math.min(12_400, Math.max(8_700, altitude.baseAltitudeM + 1_850)),
        weather.cirrusCoverage,
        0.2,
        0.86,
        0xe9eef0,
        0xb5c0c0,
      ),
    );
  }
  return layers;
}

function createCloudLayer(
  settings: DogfightScenarioSettings,
  baseAltitudeM: number,
  coverage: number,
  opacity: number,
  driftScale: number,
  lightColor: number,
  darkColor: number,
): CloudLayerView {
  const count = Math.max(8, Math.round(18 + coverage * 105));
  const geometry = new THREE.SphereGeometry(1, 7, 4);
  const material = new THREE.MeshLambertMaterial({
    color: lightColor,
    emissive: new THREE.Color(darkColor).multiplyScalar(0.16),
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const clouds = new THREE.InstancedMesh(geometry, material, count);
  const random = seededRandom(
    0xc10d5 + settings.weatherId.length * 211 + Math.round(baseAltitudeM),
  );
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < count; index += 1) {
    const width = 480 + random() * (coverage > 0.7 ? 2_700 : 1_850);
    const depth = width * (0.7 + random() * 1.15);
    const thickness = 45 + random() * (coverage > 0.7 ? 150 : 92);
    matrix.compose(
      new THREE.Vector3(
        (random() - 0.5) * 108_000,
        baseAltitudeM + (random() - 0.5) * 520,
        (random() - 0.5) * 108_000,
      ),
      new THREE.Quaternion().setFromAxisAngle(WORLD_UP, random() * Math.PI),
      new THREE.Vector3(width, thickness, depth),
    );
    clouds.setMatrixAt(index, matrix);
  }
  clouds.instanceMatrix.needsUpdate = true;
  clouds.name = `instanced-cloud-layer-${Math.round(baseAltitudeM)}`;
  clouds.renderOrder = -1;
  return {
    mesh: clouds,
    material,
    baseAltitudeM,
    baseOpacity: opacity,
    driftScale,
  };
}

function createSunGlare(sunlight: number): THREE.Group {
  const sun = new THREE.Group();
  sun.name = "combat-sun-glare";
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(2_300, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 0.12 * sunlight,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.position.z = -12;
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(620, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffdfac,
      transparent: true,
      opacity: 0.92 * sunlight,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  sun.add(halo, core);
  return sun;
}

function environmentStructureSignature(
  settings: DogfightScenarioSettings,
): string {
  return [settings.theaterId, settings.altitudeId, settings.weatherId].join(
    "|",
  );
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function disposeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.LineSegments
    ) {
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      objectMaterials.forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

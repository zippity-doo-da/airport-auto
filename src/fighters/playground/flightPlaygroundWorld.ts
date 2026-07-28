import * as THREE from "three";
import { fighterById } from "../fighterCatalog";
import {
  createFighterVisual,
  updateFighterVisual,
  type FighterVisual,
} from "../fighterVisualFactory";
import type { DogfightScenarioSettings } from "../dogfight/combatScenarios";
import { createFlightEnvironment } from "./flightEnvironment";
import type {
  AircraftFlightState,
  PlaygroundFlightFrame,
  Vec3,
} from "./flightPlaygroundSimulation";

export type FlightCameraMode =
  "director" | "formation" | "combat" | "f-35" | "j-20" | "wide" | "free";

export interface FlightWorldEffects {
  missiles: readonly {
    id: number;
    team: "f-35" | "j-20";
    position: Vec3;
    forward: Vec3;
  }[];
  tracers: readonly {
    id: number;
    team: "f-35" | "j-20";
    start: Vec3;
    end: Vec3;
    life01: number;
  }[];
  flares: readonly {
    id: number;
    team: "f-35" | "j-20";
    position: Vec3;
    life01: number;
  }[];
  explosions: readonly {
    id: number;
    team: "f-35" | "j-20";
    position: Vec3;
    radius: number;
    life01: number;
  }[];
}

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

export interface FlightWorldDiagnostics {
  cameraShot: string;
  drawCalls: number;
  triangles: number;
  geometries: number;
}

export interface FlightPlaygroundWorld {
  update: (
    frame: PlaygroundFlightFrame,
    elapsedSeconds: number,
    deltaSeconds: number,
    cameraMode: FlightCameraMode,
    effects?: FlightWorldEffects,
  ) => FlightWorldDiagnostics;
  resize: () => void;
  orbitBy: (deltaX: number, deltaY: number) => void;
  zoomBy: (multiplier: number) => void;
  resetFreeCamera: () => void;
  setEnvironment: (settings: DogfightScenarioSettings) => void;
  projectAircraft: (
    frame: PlaygroundFlightFrame,
  ) => readonly [ScreenPoint, ScreenPoint];
  dispose: () => void;
}

interface AircraftView {
  id: "f-35" | "j-20";
  modelId: string;
  visual: FighterVisual;
  centerOffsetY: number;
}

interface CombatEffectView {
  root: THREE.Group;
  update: (effects?: FlightWorldEffects) => void;
  dispose: () => void;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export function createFlightPlaygroundWorld(
  canvas: HTMLCanvasElement,
): FlightPlaygroundWorld {
  const scene = new THREE.Scene();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = false;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 190_000);
  const environment = createFlightEnvironment(scene);

  const f35 = createAircraftView("f-35", "f-35");
  const j20 = createAircraftView("j-20", "j-20");
  const aircraftViews: readonly [AircraftView, AircraftView] = [f35, j20];
  scene.add(f35.visual.root, j20.visual.root);
  const combatEffects = createCombatEffectView();
  scene.add(combatEffects.root);

  const cameraPosition = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const previousFormationCenter = new THREE.Vector3();
  let cameraInitialized = false;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let freeYaw = THREE.MathUtils.degToRad(218);
  let freePitch = THREE.MathUtils.degToRad(20);
  let freeDistance = 230;

  const update = (
    frame: PlaygroundFlightFrame,
    elapsedSeconds: number,
    deltaSeconds: number,
    cameraMode: FlightCameraMode,
    effects?: FlightWorldEffects,
  ): FlightWorldDiagnostics => {
    for (let index = 0; index < aircraftViews.length; index += 1) {
      const view = aircraftViews[index];
      const flight = frame.aircraft[index];
      ensureAircraftModel(view, flight.modelId ?? flight.id);
      updateAircraftTransform(view, flight);
      updateFighterVisual(view.visual, elapsedSeconds, deltaSeconds);
    }
    combatEffects.update(effects);
    environment.update(elapsedSeconds, frame.center);

    const shot = desiredCameraShot(frame, cameraMode, {
      yaw: freeYaw,
      pitch: freePitch,
      distance: freeDistance,
      narrowViewport: camera.aspect < 0.78,
    });
    const currentFormationCenter = toThree(frame.center);
    if (!cameraInitialized) {
      cameraPosition.copy(shot.position);
      cameraTarget.copy(shot.target);
      previousFormationCenter.copy(currentFormationCenter);
      cameraInitialized = true;
    } else {
      const centerTranslation = currentFormationCenter
        .clone()
        .sub(previousFormationCenter);
      cameraPosition.add(centerTranslation);
      cameraTarget.add(centerTranslation);
      previousFormationCenter.copy(currentFormationCenter);
      const positionAlpha = 1 - Math.exp(-deltaSeconds * 2.7);
      const targetAlpha = 1 - Math.exp(-deltaSeconds * 3.8);
      cameraPosition.lerp(shot.position, positionAlpha);
      cameraTarget.lerp(shot.target, targetAlpha);
    }
    camera.position.copy(cameraPosition);
    camera.lookAt(cameraTarget);

    renderer.render(scene, camera);
    return {
      cameraShot: shot.label,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
    };
  };

  const resize = (): void => {
    viewportWidth = Math.max(1, window.innerWidth);
    viewportHeight = Math.max(1, window.innerHeight);
    const maximumPixelRatio = viewportWidth < 780 ? 1.3 : 1.65;
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, maximumPixelRatio),
    );
    renderer.setSize(viewportWidth, viewportHeight, false);
    camera.aspect = viewportWidth / viewportHeight;
    camera.updateProjectionMatrix();
  };

  const orbitBy = (deltaX: number, deltaY: number): void => {
    freeYaw -= deltaX * 0.0065;
    freePitch = THREE.MathUtils.clamp(
      freePitch + deltaY * 0.0045,
      THREE.MathUtils.degToRad(-8),
      THREE.MathUtils.degToRad(68),
    );
  };

  const zoomBy = (multiplier: number): void => {
    freeDistance = THREE.MathUtils.clamp(freeDistance * multiplier, 65, 780);
  };

  const resetFreeCamera = (): void => {
    freeYaw = THREE.MathUtils.degToRad(218);
    freePitch = THREE.MathUtils.degToRad(20);
    freeDistance = 230;
  };

  const projectAircraft = (
    frame: PlaygroundFlightFrame,
  ): readonly [ScreenPoint, ScreenPoint] => {
    camera.updateMatrixWorld();
    return [
      projectPoint(
        frame.aircraft[0].position,
        camera,
        viewportWidth,
        viewportHeight,
      ),
      projectPoint(
        frame.aircraft[1].position,
        camera,
        viewportWidth,
        viewportHeight,
      ),
    ];
  };

  const dispose = (): void => {
    for (const view of aircraftViews) view.visual.dispose();
    combatEffects.dispose();
    environment.dispose();
    renderer.dispose();
  };

  resize();
  return {
    update,
    resize,
    orbitBy,
    zoomBy,
    resetFreeCamera,
    setEnvironment: environment.setSettings,
    projectAircraft,
    dispose,
  };
}

function createAircraftView(
  id: "f-35" | "j-20",
  modelId: string,
): AircraftView {
  const visual = createAirborneVisual(modelId);
  return {
    id,
    modelId,
    visual,
    centerOffsetY: visibleCenterOffsetY(visual.root),
  };
}

function createAirborneVisual(modelId: string): FighterVisual {
  const fighter = fighterById(modelId);
  if (!fighter) throw new Error(`Missing fighter profile: ${modelId}`);
  const visual = createFighterVisual(fighter, false);
  visual.root.name = `${visual.root.name}-airborne`;
  visual.root.traverse((object) => {
    if (/gear|wheel/i.test(object.name)) object.visible = false;
    if (object instanceof THREE.Mesh) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
  return visual;
}

function ensureAircraftModel(view: AircraftView, modelId: string): void {
  if (view.modelId === modelId) return;
  const parent = view.visual.root.parent;
  if (!parent) throw new Error(`Detached aircraft view: ${view.id}`);
  const previousVisual = view.visual;
  parent.remove(previousVisual.root);
  const nextVisual = createAirborneVisual(modelId);
  parent.add(nextVisual.root);
  view.modelId = modelId;
  view.visual = nextVisual;
  view.centerOffsetY = visibleCenterOffsetY(nextVisual.root);
  previousVisual.dispose();
}

function visibleCenterOffsetY(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    if (!object.geometry.boundingBox) return;
    meshBounds
      .copy(object.geometry.boundingBox)
      .applyMatrix4(object.matrixWorld);
    bounds.union(meshBounds);
  });
  return bounds.isEmpty() ? 1.4 : (bounds.min.y + bounds.max.y) * 0.5;
}

function updateAircraftTransform(
  view: AircraftView,
  flight: AircraftFlightState,
): void {
  const forward = toThree(flight.forward).normalize();
  const right = new THREE.Vector3().crossVectors(WORLD_UP, forward);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  const levelUp = new THREE.Vector3().crossVectors(forward, right).normalize();
  const cosine = Math.cos(flight.bankRad);
  const sine = Math.sin(flight.bankRad);
  const bankedRight = right
    .clone()
    .multiplyScalar(cosine)
    .addScaledVector(levelUp, sine);
  const bankedUp = levelUp
    .clone()
    .multiplyScalar(cosine)
    .addScaledVector(right, -sine);
  const rotationMatrix = new THREE.Matrix4().makeBasis(
    bankedRight,
    bankedUp,
    forward,
  );
  view.visual.root.quaternion.setFromRotationMatrix(rotationMatrix);
  view.visual.root.position.set(
    flight.position.x,
    flight.position.y - view.centerOffsetY,
    flight.position.z,
  );
}

function desiredCameraShot(
  frame: PlaygroundFlightFrame,
  requestedMode: FlightCameraMode,
  free: {
    yaw: number;
    pitch: number;
    distance: number;
    narrowViewport: boolean;
  },
): { position: THREE.Vector3; target: THREE.Vector3; label: string } {
  let mode = requestedMode;
  const firstAircraftPosition = toThree(frame.aircraft[0].position);
  const secondAircraftPosition = toThree(frame.aircraft[1].position);
  const aircraftSeparation = firstAircraftPosition.distanceTo(
    secondAircraftPosition,
  );
  if (mode === "director") {
    const phase = ((frame.timeSeconds % 42) + 42) % 42;
    if (frame.pattern === "dogfight") {
      const firstToSecond = secondAircraftPosition
        .clone()
        .sub(firstAircraftPosition)
        .normalize();
      const firstTracking = toThree(frame.aircraft[0].forward)
        .normalize()
        .dot(firstToSecond);
      const secondTracking = toThree(frame.aircraft[1].forward)
        .normalize()
        .dot(firstToSecond.clone().multiplyScalar(-1));
      const trackingMode = firstTracking >= secondTracking ? "f-35" : "j-20";
      const chaseHasAction =
        aircraftSeparation < 1450 &&
        Math.max(firstTracking, secondTracking) > 0.58;
      mode =
        phase < 15
          ? "combat"
          : phase < 23
            ? chaseHasAction
              ? trackingMode
              : "combat"
            : phase < 31
              ? "combat"
              : phase < 38
                ? chaseHasAction
                  ? trackingMode
                  : "combat"
                : "wide";
    } else {
      mode =
        phase < 12
          ? "formation"
          : phase < 21
            ? "f-35"
            : phase < 30
              ? "j-20"
              : "wide";
    }
  }

  const center = toThree(frame.center);
  const formationForward = toThree(frame.forward).normalize();
  const formationRight = new THREE.Vector3()
    .crossVectors(WORLD_UP, formationForward)
    .normalize();
  const chaseScale = free.narrowViewport ? 1.65 : 1;

  if (mode === "f-35" || mode === "j-20") {
    const index = mode === "f-35" ? 0 : 1;
    const aircraft = frame.aircraft[index];
    const position = toThree(aircraft.position);
    const forward = toThree(aircraft.forward).normalize();
    const right = new THREE.Vector3()
      .crossVectors(WORLD_UP, forward)
      .normalize();
    const side = mode === "f-35" ? -1 : 1;
    return {
      position: position
        .clone()
        .addScaledVector(forward, -68 * chaseScale)
        .addScaledVector(right, side * 24 * chaseScale)
        .addScaledVector(WORLD_UP, 18 * chaseScale),
      target: position
        .clone()
        .addScaledVector(forward, 30)
        .addScaledVector(WORLD_UP, 3),
      label: `${aircraft.modelName ?? (mode === "f-35" ? "F-35A" : "J-20")} chase`,
    };
  }

  if (mode === "wide") {
    const combatSpread =
      frame.pattern === "dogfight"
        ? THREE.MathUtils.clamp(aircraftSeparation * 0.58, 520, 1850)
        : 410;
    const wideScale = free.narrowViewport ? 1.65 : 1;
    return {
      position: center
        .clone()
        .addScaledVector(formationForward, -combatSpread * wideScale)
        .addScaledVector(formationRight, combatSpread * 0.72 * wideScale)
        .addScaledVector(WORLD_UP, combatSpread * 0.58 * wideScale),
      target: center
        .clone()
        .addScaledVector(formationForward, 70)
        .addScaledVector(WORLD_UP, 5),
      label: "Wide aerial",
    };
  }

  if (mode === "free") {
    const distance = free.distance * (free.narrowViewport ? 1.85 : 1);
    const horizontalDistance = Math.cos(free.pitch) * distance;
    return {
      position: center
        .clone()
        .add(
          new THREE.Vector3(
            Math.sin(free.yaw) * horizontalDistance,
            Math.sin(free.pitch) * distance,
            Math.cos(free.yaw) * horizontalDistance,
          ),
        ),
      target: center.clone().addScaledVector(WORLD_UP, 4),
      label: "Free orbit",
    };
  }

  if (mode === "combat") {
    const combatDistance = THREE.MathUtils.clamp(
      aircraftSeparation * 1.45,
      280,
      3900,
    );
    const engagementAxis = toThree(frame.aircraft[1].position)
      .sub(toThree(frame.aircraft[0].position))
      .setY(0);
    if (engagementAxis.lengthSq() < 0.1) engagementAxis.set(1, 0, 0);
    engagementAxis.normalize();
    const viewingNormal = new THREE.Vector3()
      .crossVectors(WORLD_UP, engagementAxis)
      .normalize();
    const narrowScale = free.narrowViewport ? 1.8 : 1;
    return {
      position: center
        .clone()
        .addScaledVector(viewingNormal, combatDistance * narrowScale)
        .addScaledVector(WORLD_UP, combatDistance * 0.38 * narrowScale),
      target: center.clone().addScaledVector(WORLD_UP, 5),
      label: "Tactical overview",
    };
  }

  const spreadScale = THREE.MathUtils.clamp(aircraftSeparation / 52, 1, 5.4);
  const formationScale = (free.narrowViewport ? 2.5 : 1) * spreadScale;
  return {
    position: center
      .clone()
      .addScaledVector(formationForward, -74 * formationScale)
      .addScaledVector(formationRight, 42 * formationScale)
      .addScaledVector(WORLD_UP, 24 * formationScale),
    target: center
      .clone()
      .addScaledVector(formationForward, 36)
      .addScaledVector(WORLD_UP, 4),
    label: "Formation camera",
  };
}

function createCombatEffectView(): CombatEffectView {
  const root = new THREE.Group();
  root.name = "pooled-combat-effects";
  const missileCapacity = 18;
  const flareCapacityPerTeam = 48;
  const explosionCapacity = 14;
  const lineCapacity = 96;
  const teamColors = {
    "f-35": new THREE.Color(0x8bd9f2),
    "j-20": new THREE.Color(0xff8b72),
  } as const;

  const missileGeometry = new THREE.ConeGeometry(0.55, 5.8, 8, 1);
  missileGeometry.rotateX(Math.PI / 2);
  const missileViews = {
    "f-35": new THREE.InstancedMesh(
      missileGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xc6edf7,
        emissive: 0x3da7d0,
        emissiveIntensity: 2.6,
        roughness: 0.28,
        metalness: 0.58,
      }),
      missileCapacity,
    ),
    "j-20": new THREE.InstancedMesh(
      missileGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xffc7b8,
        emissive: 0xcf4936,
        emissiveIntensity: 2.6,
        roughness: 0.28,
        metalness: 0.58,
      }),
      missileCapacity,
    ),
  } as const;
  for (const mesh of Object.values(missileViews)) {
    mesh.name = "pooled-guided-missiles";
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    root.add(mesh);
  }

  const flareGeometry = new THREE.IcosahedronGeometry(1, 1);
  const flareViews = {
    "f-35": new THREE.InstancedMesh(
      flareGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xb8efff,
        transparent: true,
        opacity: 0.94,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      flareCapacityPerTeam,
    ),
    "j-20": new THREE.InstancedMesh(
      flareGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffb38a,
        transparent: true,
        opacity: 0.94,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      flareCapacityPerTeam,
    ),
  } as const;
  for (const mesh of Object.values(flareViews)) {
    mesh.name = "pooled-countermeasure-flares";
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    root.add(mesh);
  }

  const explosionGeometry = new THREE.IcosahedronGeometry(1, 2);
  const explosionView = new THREE.InstancedMesh(
    explosionGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xffa95c,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      wireframe: true,
    }),
    explosionCapacity,
  );
  explosionView.name = "pooled-impact-shells";
  explosionView.count = 0;
  explosionView.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  explosionView.frustumCulled = false;
  root.add(explosionView);
  const explosionCoreView = new THREE.InstancedMesh(
    explosionGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xffefaa,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
    explosionCapacity,
  );
  explosionCoreView.name = "pooled-impact-cores";
  explosionCoreView.count = 0;
  explosionCoreView.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  explosionCoreView.frustumCulled = false;
  root.add(explosionCoreView);

  const linePositions = new Float32Array(lineCapacity * 2 * 3);
  const lineColors = new Float32Array(lineCapacity * 2 * 3);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(linePositions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  lineGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage),
  );
  lineGeometry.setDrawRange(0, 0);
  const lineView = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  lineView.name = "pooled-tracers-and-missile-exhaust";
  lineView.frustumCulled = false;
  root.add(lineView);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scaleVector = new THREE.Vector3(1, 1, 1);
  const modelForward = new THREE.Vector3(0, 0, 1);

  const update = (effects?: FlightWorldEffects): void => {
    const missileCounts: Record<"f-35" | "j-20", number> = {
      "f-35": 0,
      "j-20": 0,
    };
    const flareCounts: Record<"f-35" | "j-20", number> = {
      "f-35": 0,
      "j-20": 0,
    };
    let explosionCount = 0;
    let lineCount = 0;

    for (const missile of effects?.missiles ?? []) {
      const index = missileCounts[missile.team];
      if (index >= missileCapacity) continue;
      position.set(missile.position.x, missile.position.y, missile.position.z);
      const forward = toThree(missile.forward).normalize();
      quaternion.setFromUnitVectors(modelForward, forward);
      scaleVector.setScalar(1);
      matrix.compose(position, quaternion, scaleVector);
      missileViews[missile.team].setMatrixAt(index, matrix);
      missileCounts[missile.team] += 1;

      if (lineCount < lineCapacity) {
        const exhaustStart = position.clone().addScaledVector(forward, -18);
        const exhaustEnd = position.clone().addScaledVector(forward, -3.2);
        writeLine(
          linePositions,
          lineColors,
          lineCount,
          exhaustStart,
          exhaustEnd,
          teamColors[missile.team],
          0.78,
        );
        lineCount += 1;
      }
    }

    for (const team of ["f-35", "j-20"] as const) {
      const mesh = missileViews[team];
      mesh.count = missileCounts[team];
      if (mesh.count > 0) mesh.instanceMatrix.needsUpdate = true;
    }

    for (const flare of effects?.flares ?? []) {
      const index = flareCounts[flare.team];
      if (index >= flareCapacityPerTeam) continue;
      position.set(flare.position.x, flare.position.y, flare.position.z);
      quaternion.identity();
      const flareScale = 0.75 + flare.life01 * 2.35;
      scaleVector.setScalar(flareScale);
      matrix.compose(position, quaternion, scaleVector);
      flareViews[flare.team].setMatrixAt(index, matrix);
      flareCounts[flare.team] += 1;
    }
    for (const team of ["f-35", "j-20"] as const) {
      const mesh = flareViews[team];
      mesh.count = flareCounts[team];
      if (mesh.count > 0) mesh.instanceMatrix.needsUpdate = true;
    }

    for (const explosion of effects?.explosions ?? []) {
      if (explosionCount >= explosionCapacity) break;
      position.set(
        explosion.position.x,
        explosion.position.y,
        explosion.position.z,
      );
      quaternion.identity();
      const pulse = Math.sin((1 - explosion.life01) * Math.PI);
      const shellScale = Math.max(0.1, explosion.radius * (0.25 + pulse * 0.9));
      scaleVector.setScalar(shellScale);
      matrix.compose(position, quaternion, scaleVector);
      explosionView.setMatrixAt(explosionCount, matrix);
      const coreScale = Math.max(0.1, explosion.radius * (0.1 + pulse * 0.34));
      scaleVector.setScalar(coreScale);
      matrix.compose(position, quaternion, scaleVector);
      explosionCoreView.setMatrixAt(explosionCount, matrix);
      explosionCount += 1;
    }
    explosionView.count = explosionCount;
    explosionCoreView.count = explosionCount;
    if (explosionCount > 0) {
      explosionView.instanceMatrix.needsUpdate = true;
      explosionCoreView.instanceMatrix.needsUpdate = true;
    }

    for (const tracer of effects?.tracers ?? []) {
      if (lineCount >= lineCapacity) break;
      writeLine(
        linePositions,
        lineColors,
        lineCount,
        toThree(tracer.start),
        toThree(tracer.end),
        teamColors[tracer.team],
        0.38 + tracer.life01 * 0.62,
      );
      lineCount += 1;
    }
    lineGeometry.setDrawRange(0, lineCount * 2);
    const positionAttribute = lineGeometry.getAttribute("position");
    const colorAttribute = lineGeometry.getAttribute("color");
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
  };

  const dispose = (): void => {
    missileGeometry.dispose();
    flareGeometry.dispose();
    explosionGeometry.dispose();
    lineGeometry.dispose();
    for (const mesh of [
      ...Object.values(missileViews),
      ...Object.values(flareViews),
      explosionView,
      explosionCoreView,
    ]) {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      materials.forEach((material) => material.dispose());
    }
    lineView.material.dispose();
    root.clear();
  };

  return { root, update, dispose };
}

function writeLine(
  positions: Float32Array,
  colors: Float32Array,
  lineIndex: number,
  start: THREE.Vector3,
  end: THREE.Vector3,
  color: THREE.Color,
  intensity: number,
): void {
  const offset = lineIndex * 6;
  positions[offset] = start.x;
  positions[offset + 1] = start.y;
  positions[offset + 2] = start.z;
  positions[offset + 3] = end.x;
  positions[offset + 4] = end.y;
  positions[offset + 5] = end.z;
  colors[offset] = color.r * intensity;
  colors[offset + 1] = color.g * intensity;
  colors[offset + 2] = color.b * intensity;
  colors[offset + 3] = color.r * intensity;
  colors[offset + 4] = color.g * intensity;
  colors[offset + 5] = color.b * intensity;
}

function projectPoint(
  point: Vec3,
  camera: THREE.Camera,
  width: number,
  height: number,
): ScreenPoint {
  const projected = toThree(point).addScaledVector(WORLD_UP, 8).project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * width,
    y: (-projected.y * 0.5 + 0.5) * height,
    visible:
      projected.z > -1 &&
      projected.z < 1 &&
      projected.x > -1.18 &&
      projected.x < 1.18 &&
      projected.y > -1.18 &&
      projected.y < 1.18,
  };
}

function toThree(vector: Vec3): THREE.Vector3 {
  return new THREE.Vector3(vector.x, vector.y, vector.z);
}

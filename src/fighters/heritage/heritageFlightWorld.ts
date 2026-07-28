import * as THREE from "three";
import { fighterById } from "../fighterCatalog";
import {
  createFighterVisual,
  updateFighterVisual,
  type FighterVisual,
} from "../fighterVisualFactory";
import {
  createDefaultDogfightScenario,
  type DogfightScenarioSettings,
} from "../dogfight/combatScenarios";
import { createFlightEnvironment } from "../playground/flightEnvironment";
import type { Vec3 } from "../playground/flightPlaygroundSimulation";
import type {
  HeritageAircraftFlightState,
  HeritageAircraftId,
  HeritageFlightFrame,
} from "./heritageFlightSimulation";

export type HeritageCameraMode =
  "director" | "formation" | HeritageAircraftId | "wide" | "free";

export interface HeritageScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

export interface HeritageWorldDiagnostics {
  cameraShot: string;
  drawCalls: number;
  triangles: number;
  geometries: number;
}

export interface HeritageFlightWorld {
  update: (
    frame: HeritageFlightFrame,
    elapsedSeconds: number,
    deltaSeconds: number,
    cameraMode: HeritageCameraMode,
  ) => HeritageWorldDiagnostics;
  resize: () => void;
  orbitBy: (deltaX: number, deltaY: number) => void;
  zoomBy: (multiplier: number) => void;
  resetFreeCamera: () => void;
  projectAircraft: (
    frame: HeritageFlightFrame,
  ) => Record<HeritageAircraftId, HeritageScreenPoint>;
  dispose: () => void;
}

interface HeritageAircraftView {
  id: HeritageAircraftId;
  visual: FighterVisual;
  centerOffsetY: number;
}

interface CameraShot {
  position: THREE.Vector3;
  target: THREE.Vector3;
  label: string;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const HERITAGE_ENVIRONMENT: DogfightScenarioSettings = {
  ...createDefaultDogfightScenario(),
  theaterId: "training",
  altitudeId: "low",
  weatherId: "clear",
  visibilityKm: 68,
  windSpeedKnots: 6,
  windDirectionDeg: 240,
};

export function createHeritageFlightWorld(
  canvas: HTMLCanvasElement,
): HeritageFlightWorld {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = false;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.4, 190_000);
  const environment = createFlightEnvironment(scene);
  environment.setSettings(HERITAGE_ENVIRONMENT);

  const aircraftViews = new Map<HeritageAircraftId, HeritageAircraftView>();
  for (const id of ["f-35", "f4u", "p-51", "f-86"] as const) {
    const visual = createAirborneVisual(id);
    const view: HeritageAircraftView = {
      id,
      visual,
      centerOffsetY: visibleCenterOffsetY(visual.root),
    };
    aircraftViews.set(id, view);
    scene.add(visual.root);
  }

  const cameraPosition = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const previousCenter = new THREE.Vector3();
  let cameraInitialized = false;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let freeYaw = THREE.MathUtils.degToRad(218);
  let freePitch = THREE.MathUtils.degToRad(18);
  let freeDistance = 230;

  const update = (
    frame: HeritageFlightFrame,
    elapsedSeconds: number,
    deltaSeconds: number,
    cameraMode: HeritageCameraMode,
  ): HeritageWorldDiagnostics => {
    for (const flight of frame.aircraft) {
      const view = aircraftViews.get(flight.id);
      if (!view) continue;
      updateAircraftTransform(view, flight);
      updateFighterVisual(view.visual, elapsedSeconds, deltaSeconds);
      if (flight.id === "f4u" || flight.id === "p-51") {
        for (const propeller of view.visual.propellers) {
          propeller.rotation.z += deltaSeconds * 42;
        }
      }
    }
    environment.update(elapsedSeconds, frame.center);

    const shot = desiredCameraShot(frame, cameraMode, {
      yaw: freeYaw,
      pitch: freePitch,
      distance: freeDistance,
      narrowViewport: camera.aspect < 0.78,
    });
    const currentCenter = toThree(frame.center);
    if (!cameraInitialized) {
      cameraPosition.copy(shot.position);
      cameraTarget.copy(shot.target);
      previousCenter.copy(currentCenter);
      cameraInitialized = true;
    } else {
      const translation = currentCenter.clone().sub(previousCenter);
      cameraPosition.add(translation);
      cameraTarget.add(translation);
      previousCenter.copy(currentCenter);
      const positionAlpha = 1 - Math.exp(-deltaSeconds * 2.25);
      const targetAlpha = 1 - Math.exp(-deltaSeconds * 3.25);
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
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, viewportWidth < 780 ? 1.3 : 1.65),
    );
    renderer.setSize(viewportWidth, viewportHeight, false);
    camera.aspect = viewportWidth / viewportHeight;
    camera.updateProjectionMatrix();
  };

  const orbitBy = (deltaX: number, deltaY: number): void => {
    freeYaw -= deltaX * 0.0065;
    freePitch = THREE.MathUtils.clamp(
      freePitch + deltaY * 0.0045,
      THREE.MathUtils.degToRad(-6),
      THREE.MathUtils.degToRad(64),
    );
  };

  const zoomBy = (multiplier: number): void => {
    freeDistance = THREE.MathUtils.clamp(freeDistance * multiplier, 72, 760);
  };

  const resetFreeCamera = (): void => {
    freeYaw = THREE.MathUtils.degToRad(218);
    freePitch = THREE.MathUtils.degToRad(18);
    freeDistance = 230;
  };

  const projectAircraft = (
    frame: HeritageFlightFrame,
  ): Record<HeritageAircraftId, HeritageScreenPoint> => {
    camera.updateMatrixWorld();
    return Object.fromEntries(
      frame.aircraft.map((aircraft) => [
        aircraft.id,
        projectPoint(aircraft.position, camera, viewportWidth, viewportHeight),
      ]),
    ) as Record<HeritageAircraftId, HeritageScreenPoint>;
  };

  const dispose = (): void => {
    for (const view of aircraftViews.values()) view.visual.dispose();
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
    projectAircraft,
    dispose,
  };
}

function createAirborneVisual(modelId: string): FighterVisual {
  const profile = fighterById(modelId);
  if (!profile) throw new Error(`Missing heritage fighter profile: ${modelId}`);
  const visual = createFighterVisual(profile, false);
  visual.root.name = `${visual.root.name}-heritage-airborne`;
  visual.root.traverse((object) => {
    if (/gear|wheel/i.test(object.name)) object.visible = false;
    if (object instanceof THREE.Mesh) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
  return visual;
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
  return bounds.isEmpty() ? 1.3 : (bounds.min.y + bounds.max.y) * 0.5;
}

function updateAircraftTransform(
  view: HeritageAircraftView,
  flight: HeritageAircraftFlightState,
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
  const rotation = new THREE.Matrix4().makeBasis(
    bankedRight,
    bankedUp,
    forward,
  );
  view.visual.root.quaternion.setFromRotationMatrix(rotation);
  view.visual.root.position.set(
    flight.position.x,
    flight.position.y - view.centerOffsetY,
    flight.position.z,
  );
}

function desiredCameraShot(
  frame: HeritageFlightFrame,
  requestedMode: HeritageCameraMode,
  free: {
    yaw: number;
    pitch: number;
    distance: number;
    narrowViewport: boolean;
  },
): CameraShot {
  const center = toThree(frame.center);
  const forward = toThree(frame.forward).normalize();
  const right = new THREE.Vector3().crossVectors(WORLD_UP, forward).normalize();
  let mode = requestedMode;
  if (mode === "director") {
    if (
      frame.pattern === "heritage-break" &&
      frame.phaseLabel !== "Four-ship formation"
    ) {
      mode = "wide";
    } else {
      const directorModes: readonly HeritageCameraMode[] = [
        "formation",
        "f4u",
        "p-51",
        "f-86",
        "wide",
      ];
      mode =
        directorModes[
          Math.floor(frame.timeSeconds / 11) % directorModes.length
        ];
    }
  }

  if (mode === "free") {
    const horizontal = Math.cos(free.pitch) * free.distance;
    return {
      position: center
        .clone()
        .add(
          new THREE.Vector3(
            Math.sin(free.yaw) * horizontal,
            Math.sin(free.pitch) * free.distance,
            Math.cos(free.yaw) * horizontal,
          ),
        ),
      target: center.clone(),
      label: "Free orbit",
    };
  }

  if (mode === "wide") {
    const distanceScale = free.narrowViewport ? 1.25 : 1;
    return {
      position: center
        .clone()
        .addScaledVector(forward, -265 * distanceScale)
        .addScaledVector(right, 170 * distanceScale)
        .addScaledVector(WORLD_UP, 115 * distanceScale),
      target: center.clone().addScaledVector(forward, 34),
      label: "Wide heritage pass",
    };
  }

  if (mode !== "formation") {
    const aircraft = frame.aircraft.find((entry) => entry.id === mode);
    if (aircraft) {
      const aircraftPosition = toThree(aircraft.position);
      const aircraftForward = toThree(aircraft.forward).normalize();
      const aircraftRight = new THREE.Vector3()
        .crossVectors(WORLD_UP, aircraftForward)
        .normalize();
      const viewSide = mode === "f4u" || mode === "f-86" ? -1 : 1;
      return {
        position: aircraftPosition
          .clone()
          .addScaledVector(aircraftForward, -31)
          .addScaledVector(aircraftRight, viewSide * 25)
          .addScaledVector(WORLD_UP, 11),
        target: aircraftPosition.clone().addScaledVector(aircraftForward, 10),
        label: `${aircraft.name} close-up`,
      };
    }
  }

  if (free.narrowViewport) {
    return {
      position: center
        .clone()
        .addScaledVector(forward, -225)
        .addScaledVector(right, 10)
        .addScaledVector(WORLD_UP, 55),
      target: center.clone().addScaledVector(forward, 17),
      label: "Formation camera",
    };
  }

  return {
    position: center
      .clone()
      .addScaledVector(forward, -108)
      .addScaledVector(right, 52)
      .addScaledVector(WORLD_UP, 35),
    target: center.clone().addScaledVector(forward, 20),
    label: "Formation camera",
  };
}

function projectPoint(
  point: Vec3,
  camera: THREE.Camera,
  width: number,
  height: number,
): HeritageScreenPoint {
  const projected = toThree(point).project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * width,
    y: (-projected.y * 0.5 + 0.5) * height,
    visible:
      projected.z > -1 &&
      projected.z < 1 &&
      projected.x > -1.12 &&
      projected.x < 1.12 &&
      projected.y > -1.12 &&
      projected.y < 1.12,
  };
}

function toThree(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

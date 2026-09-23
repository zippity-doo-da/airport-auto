import * as THREE from "three";
import type {
  AirportConfig,
  FlightColor,
  RunwayConfig,
  RunwayOperationalRole,
} from "../simulation/airportConfig";
import { runwayEndPoint3 } from "../simulation/runwayGeometry";
import { runwayProtectionStatuses } from "../simulation/runwayProtection";
import { aircraftProfile } from "../simulation/aircraftProfiles";
import { aircraftSystemsState } from "../simulation/aircraftSystems";
import type {
  AirportState,
  Flight,
  FlightMotionState,
  ServiceVehicleType,
  SurfaceDisruptionKind,
} from "../simulation/types";
import { applyAircraftOrientation } from "./aircraftOrientation";
import { weatherPresentation } from "./weatherPresentation";
import {
  environmentPresentation,
  type EnvironmentPresentation,
  type EnvironmentSurfaceKind,
} from "./environmentPresentation";
import {
  aircraftPoolKey,
  applyAircraftVisualSystems,
  createAircraftVisual,
  type AircraftVisual as FlightVisual,
} from "./aircraftVisualFactory";
import {
  createAirportContext,
  type AirportContextDiagnostics,
} from "./airportContext";
import { buildLandscape, landscapeDimensions } from "./landscapeScene";
import { treePlacement } from "./sceneryPlacement";
import {
  surfaceDisruptionPoolSize,
  updateSurfaceDisruptionVisuals,
} from "./surfaceDisruptionVisuals";
import {
  createAirspaceOverlay,
  type AirspaceLayer,
  type AirspaceOverlayDiagnostics,
} from "./airspaceOverlay";
import type {
  FocusTargetKind,
  FocusTargetTone,
} from "../presentation/focusTargets";
import {
  accessibilityPaletteDefinition,
  type AccessibilityPalette,
} from "../presentation/accessibilityPalette";
import {
  createGateActivityLights,
  updateGateActivityLights,
  type GateActivityLights,
} from "./gateActivityLights";
import { createTerminalAccessScene } from "./terminalAccessScene";
import { createTerminalGateScene } from "./terminalGateScene";
import { matchPassengerFacilityFootprints } from "./passengerFacilityFootprints";
import {
  createSurfaceProjectionOverlay,
  createSurfaceProtectionOverlay,
  updateSurfaceProjectionOverlay,
  updateSurfaceProtectionOverlay,
  type SurfaceProjectionOverlay,
  type SurfaceProtectionOverlay,
} from "./surfaceSafetyOverlays";
export type { AirspaceLayer } from "./airspaceOverlay";

const APPROACH_PRESENTATION_PITCH = THREE.MathUtils.degToRad(6);
const TOUCHDOWN_PRESENTATION_PITCH = THREE.MathUtils.degToRad(10);

type RunwayLight = {
  mesh: THREE.InstancedMesh;
  dayOpacity: number;
  nightOpacity: number;
  phase: number;
  runwayId: number;
  activeEnd?: -1 | 1;
  roles?: RunwayOperationalRole[];
};

type RunwayProtectionLight = {
  mesh: THREE.InstancedMesh;
  runwayId: number;
  kind: "entrance" | "takeoff-hold";
  dayOpacity: number;
  nightOpacity: number;
};

type ServiceVehicleVisual = {
  poolKey: ServiceVehicleType;
  root: THREE.Group;
  beacon: THREE.Mesh;
  wheels: THREE.Mesh[];
  workRig: THREE.Group;
  active: boolean;
};

type RunwayVisual = {
  marker: THREE.Group;
  arrivalMarker: THREE.Group;
  departureMarker: THREE.Group;
  closure: THREE.Group;
  labels: THREE.Sprite[];
};

type AirportBuild = {
  runwayLights: RunwayLight[];
  runwayProtectionLights: RunwayProtectionLight[];
  runwayVisuals: RunwayVisual[];
  passengerFacilityLabels: THREE.Group | null;
  gateLights: GateActivityLights | null;
  surfaceProtection: SurfaceProtectionOverlay;
  surfaceProjections: SurfaceProjectionOverlay;
  surfaceLayers: Record<SurfaceLayer, THREE.Group>;
};

export type SurfaceLayer =
  | "taxiway-labels"
  | "operational-zones"
  | "hotspots"
  | "airport-boundary"
  | "protection-zones"
  | "movement-projections";

export type WorldDiagnostics = {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  detail: "low" | "high";
  adaptivePerformanceMode: "standard" | "reduced";
  pooledAircraft: number;
  activeServiceVehicles: number;
  heldServiceVehicles: number;
  pooledServiceVehicles: number;
  serviceVehiclesVisible: boolean;
  /** User preference; may be temporarily simplified by adaptive rendering. */
  airportLifeVisible: boolean;
  airportLifePresentationVisible: boolean;
  contrailsVisible: boolean;
  accessibilityPalette: AccessibilityPalette;
  activeContrails: number;
  attachedTugs: number;
  startingEngines: number;
  aircraftAssets: {
    active: number;
    families: Record<string, number>;
    totalMeshes: number;
    maximumMeshesPerAircraft: number;
    maximumMaterialsPerAircraft: number;
    maximumTexturesPerAircraft: number;
    maximumTrianglesPerAircraft: number;
    totalGeometryBytes: number;
    maximumGeometryBytesPerAircraft: number;
    poolBudget: number;
  };
  instancing: {
    drawGroups: number;
    instances: number;
    landscapeDrawGroups: number;
    landscapeInstances: number;
    districtInstances: number;
    highwayInstances: number;
  };
  pooling: {
    trails: { active: number; available: number; capacity: number };
    labels: { active: number; available: number; capacity: number };
    weatherEffects: { persistentBuffers: number; particleCapacity: number };
    routeLines: AirspaceOverlayDiagnostics;
    transientEvents: { available: number; capacity: number };
  };
  passengerFacilities: number;
  terminalGateActivity: {
    bridges: number;
    docked: number;
    openDoors: number;
    drawGroups: number;
  };
  surfaceDisruptions: {
    total: number;
    pending: number;
    active: number;
    recovering: number;
    pooledMarkers: number;
    poolBudget: number;
  };
  camera: {
    focusX: number;
    focusY: number;
    focusZ: number;
    zoom: number;
    orbitDegrees: number;
    panningEnabled: true;
    groundWidth: number;
    groundHeight: number;
    detailedWidth: number;
    detailedHeight: number;
    panLimitX: number;
    panLimitY: number;
    groundFillsViewport: boolean;
    minimumGroundMargin: number;
    target: {
      key: string;
      kind: FocusTargetKind;
      tracking: boolean;
      resolvedX: number;
      resolvedY: number;
      resolvedZ: number;
      viewportX: number;
      viewportY: number;
      withinViewport: boolean;
      subjectVisible: boolean;
    } | null;
  };
  surfaceLayers: Record<SurfaceLayer, boolean>;
  airspaceLayers: Record<AirspaceLayer, boolean>;
  runways: Array<{
    id: number;
    activeEnd: -1 | 1;
    markerVisible: boolean;
    arrivalMarkerVisible: boolean;
    departureMarkerVisible: boolean;
  }>;
  context: AirportContextDiagnostics | { status: "procedural" };
  environment: {
    phase: AirportState["environment"]["phase"];
    season: AirportState["environment"]["season"];
    daylight: number;
    cloudCover: number;
    snowCover: number;
    wetPavement: number;
    runwayLightIntensity: number;
    trackedSurfaceMaterials: number;
  };
};

export interface WorldFlightRenderPose {
  position: { x: number; y: number; z: number };
  sourceMotion: {
    x: number;
    y: number;
    z: number;
    heading: number;
    onGround: boolean;
    stage: string;
  };
  horizontalSourceError: number;
  visible: boolean;
}

export interface WorldFocusTarget {
  key: string;
  kind: FocusTargetKind;
  position: [number, number];
  radius: number;
  suggestedZoom: number;
  flightIds: number[];
  serviceVehicleId?: string;
  tone: FocusTargetTone;
}

export interface AirportWorld {
  update(state: AirportState, delta: number): void;
  snapToAuthoritativeState(): void;
  nextView(): void;
  pickFlight(clientX: number, clientY: number): number | null;
  pickRunway(clientX: number, clientY: number): number | null;
  selectFlight(id: number | null): void;
  focusTarget(target: WorldFocusTarget | null): void;
  flightScreenPosition(id: number): { x: number; y: number } | null;
  flightAttitude(
    id: number,
  ): { headingDegrees: number; noseUpDegrees: number } | null;
  flightRenderPose(id: number): WorldFlightRenderPose | null;
  mapMetrics(): {
    northDegrees: number;
    scaleMeters: number;
    scalePixels: number;
  };
  zoomIn(): void;
  zoomOut(): void;
  panByScreen(horizontal: number, vertical: number): void;
  rotateBy(direction: -1 | 1): void;
  applyCameraInput(
    panX: number,
    panY: number,
    rotate: number,
    zoom: number,
    deltaSeconds: number,
  ): void;
  panBetweenScreenPoints(
    previous: { x: number; y: number },
    current: { x: number; y: number },
  ): void;
  pinchBetweenScreenPoints(
    previous: readonly [{ x: number; y: number }, { x: number; y: number }],
    current: readonly [{ x: number; y: number }, { x: number; y: number }],
  ): void;
  zoomAtScreenPoint(clientX: number, clientY: number, factor: number): void;
  resetCamera(): void;
  setRunwayLabelsVisible(visible: boolean): void;
  setServiceVehiclesVisible(visible: boolean): void;
  setAirportLifeVisible(visible: boolean): void;
  setAccessibilityPalette(palette: AccessibilityPalette): void;
  setPerformanceDegraded(degraded: boolean): void;
  setSurfaceLayerVisible(layer: SurfaceLayer, visible: boolean): void;
  setAirspaceLayerVisible(layer: AirspaceLayer, visible: boolean): void;
  diagnostics(): WorldDiagnostics;
  resize(): void;
  dispose(): void;
}

const COLORS = {
  sky: 0x718d89,
  haze: 0x9ba89b,
  water: 0x39717a,
  deepWater: 0x24505a,
  grass: 0x60785c,
  lightGrass: 0x829267,
  runway: 0x3d4d4c,
  runwayLine: 0xe8e8dc,
  terminal: 0xdacfb9,
  roof: 0x765b52,
  window: 0x5f8385,
  ink: 0x334b4c,
  rose: 0xc9857f,
  sage: 0x7e9b78,
  mist: 0x809aa5,
};

const PALETTE_COLOR: Record<FlightColor, number> = {
  mist: COLORS.mist,
  rose: COLORS.rose,
  sage: COLORS.sage,
};

export function createWorld(
  canvas: HTMLCanvasElement,
  config: AirportConfig,
): AirportWorld {
  const requestedDetail = new URLSearchParams(window.location.search).get(
    "detail",
  );
  const deviceMemory =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const lowDetail =
    requestedDetail === "low" ||
    (requestedDetail !== "high" &&
      (config.scope === "center" ||
        window.innerWidth < 900 ||
        window.innerHeight < 760 ||
        deviceMemory <= 4));
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  // A 1.5× backing store looks excellent on a light scene, but it turns into
  // more than twice the fragment work of a 1× canvas once a busy hub adds
  // terminal glass, runway lighting, weather, and aircraft shadows.  1.25×
  // keeps the miniature look crisp on ordinary laptop displays while giving
  // the adaptive fallback enough headroom to preserve smooth motion.
  const standardPixelRatio = Math.min(devicePixelRatio, lowDetail ? 1 : 1.25);
  let performanceDegraded = false;
  renderer.setPixelRatio(standardPixelRatio);
  renderer.shadowMap.enabled = !lowDetail;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  const fog = new THREE.FogExp2(COLORS.haze, 0.0032);
  scene.fog = fog;

  const camera = new THREE.OrthographicCamera(-80, 80, 45, -45, 0.1, 2500);
  camera.up.set(0, 0, 1);
  camera.position.set(112, -128, 108);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const world = new THREE.Group();
  scene.add(world);

  const hemisphere = new THREE.HemisphereLight(0xf6eee2, 0x4c6962, 1.45);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xffd6a3, 2.25);
  sun.position.set(-72, -96, 130);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -120;
  sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120;
  sun.shadow.camera.bottom = -120;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  const landscape = landscapeDimensions(config);
  const landscapeBuild = buildLandscape(world, config, landscape);
  const contextRuntime = config.contextData
    ? createAirportContext(
        world,
        config.contextData,
        config.vectorData?.runtimeReference.worldMetersPerUnit ?? 38,
      )
    : null;
  const airportBuild = buildAirport(world, config, lowDetail);
  const terminalAccess = createTerminalAccessScene(world, config, lowDetail);
  const terminalGates = createTerminalGateScene(world, config, lowDetail);
  const airspaceOverlay = createAirspaceOverlay(config);
  world.add(airspaceOverlay.root);
  if (contextRuntime) {
    world.remove(airportBuild.surfaceLayers["airport-boundary"]);
    airportBuild.surfaceLayers["airport-boundary"] =
      contextRuntime.boundaryLayer;
  }
  const runwayLights = airportBuild.runwayLights;
  const runwayProtectionLights = airportBuild.runwayProtectionLights;
  const disruptionLayer = new THREE.Group();
  disruptionLayer.name = "surface-disruptions";
  world.add(disruptionLayer);
  const disruptionVisuals = new Map<string, THREE.Group>();
  const disruptionPools = new Map<SurfaceDisruptionKind, THREE.Group[]>();
  const disruptionPoolBudget = lowDetail ? 10 : 18;
  const swayingObjects = buildDetails(world, config, lowDetail);
  const clouds = buildClouds(scene, lowDetail);
  const rain = buildRain(scene, config.seed, lowDetail);
  const ripples = buildRipples(world, config);
  const environmentMaterials = collectEnvironmentMaterials(world);
  const semanticMaterials = collectSemanticMaterials(world);

  const flightVisuals = new Map<number, FlightVisual>();
  const flightPool = new Map<string, FlightVisual[]>();
  const aircraftPoolBudget = lowDetail ? 24 : 36;
  const serviceVehicleVisuals = new Map<string, ServiceVehicleVisual>();
  const serviceVehiclePool = new Map<
    ServiceVehicleType,
    ServiceVehicleVisual[]
  >();
  const focusedFlightIds = new Set<number>();
  let worldFocusTarget: WorldFocusTarget | null = null;
  let viewIndex = 0;
  let cameraTime = 0;
  const views = [
    { radius: 190, height: 122, phase: 0, zoom: 1 },
    { radius: 118, height: 72, phase: 1.75, zoom: 0.7 },
    { radius: 255, height: 158, phase: 3.4, zoom: 1.35 },
    { radius: 1, height: 250, phase: 0, zoom: 1.42 },
  ];
  let viewportWidth = canvas.clientWidth;
  let viewportHeight = canvas.clientHeight;
  let manualZoom = 1;
  let manualOrbitOffset = 0;
  const cameraFocus = new THREE.Vector2();
  const resolvedFocus = new THREE.Vector2();
  let cameraFocusHeight = 0;
  let resolvedFocusHeight = 0;
  const focusMarker = createFocusMarker();
  world.add(focusMarker);
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.3);
  const zoomRaycaster = new THREE.Raycaster();
  const zoomNdc = new THREE.Vector2();
  const zoomGroundPoint = new THREE.Vector3();
  let nightMix = 0;
  let lastGateLightState = "";
  let lastEnvironmentMaterialKey = "";
  let gateActivityUpdateIn = 0;
  let disruptionUpdateIn = 0;
  let currentState: AirportState | null = null;
  const currentFlightById = new Map<number, Flight>();
  let runwayLabelsVisible = false;
  let serviceVehiclesVisible = true;
  let airportLifeVisible = false;
  terminalAccess.setVisible(airportLifeVisible);
  terminalGates.setVisible(airportLifeVisible);
  let accessibilityPalette: AccessibilityPalette = "standard";
  applySemanticPalette(semanticMaterials, accessibilityPalette);
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const attitudeNose = new THREE.Vector3();
  let manualCameraActive = false;
  let focusZoomGoal: number | null = null;

  function updateProjection(): void {
    const aspect = viewportWidth / Math.max(1, viewportHeight);
    const baseSize =
      config.scope === "center"
        ? viewportWidth < 720
          ? 116
          : 104
        : viewportWidth < 720
          ? 61
          : 54;
    const size = baseSize * views[viewIndex].zoom * manualZoom;
    camera.left = -size * aspect;
    camera.right = size * aspect;
    camera.top = size;
    camera.bottom = -size;
    camera.updateProjectionMatrix();
  }

  function update(state: AirportState, delta: number): void {
    currentState = state;
    currentFlightById.clear();
    for (const flight of state.flights)
      currentFlightById.set(flight.id, flight);
    cameraTime += delta;
    terminalAccess.update(cameraTime);
    const weatherEnvironment = weatherPresentation(state.weather);
    const environment = environmentPresentation(
      state.environment,
      state.weather,
    );
    const weatherFog =
      weatherEnvironment.fogDensity / Math.sqrt(Math.max(1, manualZoom));
    fog.density = THREE.MathUtils.lerp(
      fog.density,
      weatherFog,
      Math.min(1, delta * 0.9),
    );
    nightMix = THREE.MathUtils.lerp(
      nightMix,
      1 - environment.daylight,
      Math.min(1, delta * 2.2),
    );
    terminalGates.update(state, delta, nightMix);
    environmentColorScratch.setHex(environment.sky);
    (scene.background as THREE.Color).lerp(
      environmentColorScratch,
      Math.min(1, delta * 0.6),
    );
    fog.color.lerp(environmentColorScratch, Math.min(1, delta * 0.6));
    sun.intensity = environment.sunIntensity;
    sun.color.setHex(environment.sun);
    const sunRadius = 170;
    sun.position.set(
      Math.cos(state.environment.sunAzimuthRadians) * sunRadius,
      Math.sin(state.environment.sunAzimuthRadians) * sunRadius,
      Math.max(28, Math.sin(state.environment.sunElevationRadians) * sunRadius),
    );
    hemisphere.intensity = environment.hemisphereIntensity;
    renderer.toneMappingExposure = environment.exposure;
    const environmentMaterialKey = [
      environment.terrainTint,
      environment.snowTint,
      environment.wetPavement.toFixed(3),
      environment.snowCover.toFixed(3),
    ].join(":");
    if (environmentMaterialKey !== lastEnvironmentMaterialKey) {
      updateEnvironmentMaterials(environmentMaterials, environment);
      lastEnvironmentMaterialKey = environmentMaterialKey;
    }
    for (let index = 0; index < runwayLights.length; index += 1) {
      const light = runwayLights[index];
      const activeEnd =
        state.activeRunwayEnds[light.runwayId] ??
        config.runways[light.runwayId]?.landingEnd;
      const role =
        state.activeRunwayRoles[light.runwayId] ??
        config.runways[light.runwayId]?.role ??
        "inactive";
      light.mesh.visible =
        role !== "inactive" &&
        (light.activeEnd === undefined || light.activeEnd === activeEnd) &&
        (!light.roles || light.roles.includes(role));
      if (!light.mesh.visible) continue;
      const material = light.mesh.material as THREE.MeshBasicMaterial;
      const shimmer = Math.sin(state.elapsed * 2.4 + light.phase) * 0.035;
      material.opacity = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(
          light.dayOpacity,
          light.nightOpacity,
          environment.runwayLightIntensity,
        ) +
          shimmer * environment.runwayLightIntensity,
        0.08,
        1,
      );
    }
    const runwayProtection = runwayProtectionStatuses(
      state,
      config.runways.length,
    );
    for (const light of runwayProtectionLights) {
      const status = runwayProtection[light.runwayId];
      const visible =
        light.kind === "entrance"
          ? status?.entranceProtected
          : status?.takeoffProtected;
      light.mesh.visible = Boolean(visible);
      if (!light.mesh.visible) continue;
      const material = light.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(
          light.dayOpacity,
          light.nightOpacity,
          environment.runwayLightIntensity,
        ),
        0.22,
        1,
      );
    }
    for (let index = 0; index < airportBuild.runwayVisuals.length; index += 1) {
      const runway = config.runways[index];
      const visual = airportBuild.runwayVisuals[index];
      const activeEnd = state.activeRunwayEnds[index] ?? runway.landingEnd;
      const role = state.activeRunwayRoles[index] ?? runway.role;
      visual.marker.position.x = activeEnd * (runway.length / 2 - 3.1);
      visual.marker.scale.x = activeEnd;
      const closed = state.surfaceDisruptions.some(
        (disruption) =>
          disruption.kind === "runway-closure" && disruption.runwayId === index,
      );
      const unavailable = state.surfaceDisruptions.some(
        (disruption) =>
          disruption.runwayId === index &&
          (disruption.kind === "runway-closure" ||
            disruption.kind === "disabled-aircraft"),
      );
      visual.marker.visible = !unavailable && role !== "inactive";
      visual.arrivalMarker.visible = role === "arrival" || role === "mixed";
      visual.departureMarker.visible = role === "departure" || role === "mixed";
      visual.closure.visible = closed;
      for (const label of visual.labels) label.visible = runwayLabelsVisible;
    }
    if (airportBuild.surfaceProtection.group.visible)
      updateSurfaceProtectionOverlay(airportBuild.surfaceProtection, state);
    if (airportBuild.surfaceProjections.group.visible)
      updateSurfaceProjectionOverlay(
        airportBuild.surfaceProjections,
        state,
        config.vectorData?.runtimeReference.worldMetersPerUnit ?? 38,
        serviceVehiclesVisible,
      );
    gateActivityUpdateIn -= delta;
    if (airportBuild.gateLights && gateActivityUpdateIn <= 0) {
      lastGateLightState = updateGateActivityLights(
        airportBuild.gateLights,
        state,
        environment.runwayLightIntensity,
        lastGateLightState,
      );
      // Gate assignments and night lighting do not need per-display-frame
      // instance uploads. Five updates per second remains visibly immediate
      // while avoiding string/set work for every stand at render rate.
      gateActivityUpdateIn = 0.2;
    }
    disruptionUpdateIn -= delta;
    if (disruptionUpdateIn <= 0) {
      updateSurfaceDisruptionVisuals({
        state,
        graph: config.surfaceGraph,
        scope: config.scope,
        layer: disruptionLayer,
        visuals: disruptionVisuals,
        pools: disruptionPools,
        poolBudget: disruptionPoolBudget,
        dispose: disposeObject,
      });
      disruptionUpdateIn = 0.1;
    }
    airspaceOverlay.update(state, delta);
    updateRain(rain, state, delta);
    for (const visual of flightVisuals.values()) visual.active = false;

    for (const flight of state.flights) {
      let visual = flightVisuals.get(flight.id);
      if (!visual) {
        const poolKey = aircraftPoolKey(flight);
        visual =
          flightPool.get(poolKey)?.pop() ??
          createAircraftVisual(
            flight,
            PALETTE_COLOR[flight.palette],
            lowDetail,
          );
        visual.root.visible = true;
        visual.poseInitialized = false;
        if (config.scope === "center") {
          visual.baseScale = 0.17;
        } else {
          visual.baseScale = 0.92;
        }
        visual.root.scale.setScalar(visual.baseScale);
        flightVisuals.set(flight.id, visual);
        world.add(visual.root);
      }
      visual.active = true;
      positionFlight(visual, flight, config, state.elapsed, delta, nightMix);
      visual.root.visible =
        flight.phase !== "approach" || isNearViewportEdge(visual.root.position);
      visual.root.userData.engineState = flight.engineState;
      visual.tug.visible = flight.tugAttached;
      const tugPulse = 0.78 + Math.sin(state.elapsed * 8.2 + flight.id) * 0.22;
      visual.tugBeacon.scale.setScalar(0.82 + tugPulse * 0.5);
      (visual.tugBeacon.material as THREE.MeshBasicMaterial).opacity = tugPulse;
      const systems = aircraftSystemsState(
        flight,
        state.weather,
        state.elapsed,
      );
      applyAircraftVisualSystems(
        visual,
        systems,
        flight,
        state.elapsed,
        delta,
        nightMix,
      );
      visual.deicingSpray.visible = flight.deicing.status === "treating";
      if (visual.deicingSpray.visible) {
        const sprayPulse =
          0.86 + Math.sin(state.elapsed * 7.2 + flight.id) * 0.14;
        visual.deicingSpray.scale.set(1, sprayPulse, sprayPulse);
        visual.deicingSpray.rotation.x =
          Math.sin(state.elapsed * 2.4 + flight.id) * 0.08;
      }
      visual.halo.visible = focusedFlightIds.has(flight.id);
      visual.halo.scale.setScalar(1 + Math.sin(state.elapsed * 5) * 0.08);
    }

    for (const [id, visual] of flightVisuals) {
      if (!visual.active) {
        world.remove(visual.root);
        visual.root.visible = false;
        const pool = flightPool.get(visual.poolKey) ?? [];
        const pooledAircraftCount = [...flightPool.values()].reduce(
          (sum, entries) => sum + entries.length,
          0,
        );
        if (pool.length < 3 && pooledAircraftCount < aircraftPoolBudget) {
          pool.push(visual);
          flightPool.set(visual.poolKey, pool);
        } else disposeObject(visual.root);
        flightVisuals.delete(id);
      }
    }

    for (const visual of serviceVehicleVisuals.values()) visual.active = false;
    for (const vehicle of state.serviceVehicles) {
      if (vehicle.status === "scheduled" || vehicle.status === "complete")
        continue;
      let visual = serviceVehicleVisuals.get(vehicle.id);
      if (!visual) {
        visual =
          serviceVehiclePool.get(vehicle.type)?.pop() ??
          createServiceVehicle(vehicle.type);
        visual.root.visible = serviceVehiclesVisible;
        visual.root.scale.setScalar(config.scope === "center" ? 0.17 : 0.92);
        serviceVehicleVisuals.set(vehicle.id, visual);
        world.add(visual.root);
      }
      visual.active = true;
      visual.root.visible = serviceVehiclesVisible;
      visual.root.position.set(vehicle.x, vehicle.y, 1.64);
      visual.root.rotation.z = vehicle.heading;
      visual.root.userData.status = vehicle.status;
      visual.root.userData.held = vehicle.held;
      visual.root.userData.incidentResponse = Boolean(
        vehicle.incidentResponseId,
      );
      visual.root.userData.emergencyResponse =
        vehicle.emergencyResponseKind ?? null;
      const beaconPulse =
        0.45 + Math.sin(state.elapsed * 7.6 + vehicle.flightId) * 0.45;
      const incidentResponse = Boolean(vehicle.incidentResponseId);
      const medicalResponse = vehicle.emergencyResponseKind === "medical";
      visual.beacon.visible =
        incidentResponse || medicalResponse || vehicle.status !== "servicing";
      visual.workRig.visible = vehicle.status === "servicing";
      const beaconMaterial = visual.beacon.material as THREE.MeshBasicMaterial;
      beaconMaterial.color.setHex(
        medicalResponse
          ? Math.sin(state.elapsed * 10.5) >= 0
            ? 0xe04f48
            : 0x4f9ee8
          : incidentResponse
            ? 0xff4f3d
            : 0xffb23b,
      );
      beaconMaterial.opacity = vehicle.held
        ? 0.95
        : incidentResponse || medicalResponse
          ? 0.55 + beaconPulse * 0.45
          : 0.35 + beaconPulse * 0.55;
      visual.beacon.scale.setScalar(
        vehicle.held
          ? 1.45
          : incidentResponse || medicalResponse
            ? 1.1 + beaconPulse * 0.48
            : 0.9 + beaconPulse * 0.35,
      );
      for (const wheel of visual.wheels)
        wheel.rotation.y -= delta * vehicle.groundSpeedMps * 3.4;
    }
    for (const [id, visual] of serviceVehicleVisuals) {
      if (visual.active) continue;
      world.remove(visual.root);
      visual.root.visible = false;
      const pool = serviceVehiclePool.get(visual.poolKey) ?? [];
      if (pool.length < 10) {
        pool.push(visual);
        serviceVehiclePool.set(visual.poolKey, pool);
      } else disposeObject(visual.root);
      serviceVehicleVisuals.delete(id);
    }

    for (let index = 0; index < swayingObjects.length; index += 1) {
      const item = swayingObjects[index];
      item.rotation.x =
        Math.sin(state.elapsed * 0.45 + index * 0.71) *
        0.025 *
        (0.45 + state.breeze);
    }

    for (let index = 0; index < clouds.length; index += 1) {
      const cloud = clouds[index];
      cloud.visible = environment.cloudOpacity > 0.045;
      for (const child of cloud.children) {
        const material = (child as THREE.Mesh).material;
        if (material instanceof THREE.MeshBasicMaterial)
          material.opacity = environment.cloudOpacity;
      }
      const windTo = state.weather.windDirection + Math.PI;
      const cloudSpeed =
        delta * (0.35 + state.weather.windSpeed * 0.045 + index * 0.05);
      cloud.position.x += Math.cos(windTo) * cloudSpeed;
      cloud.position.y += Math.sin(windTo) * cloudSpeed;
      if (cloud.position.x > 190) cloud.position.x = -190;
      if (cloud.position.x < -190) cloud.position.x = 190;
      if (cloud.position.y > 145) cloud.position.y = -145;
      if (cloud.position.y < -145) cloud.position.y = 145;
    }

    for (let index = 0; index < ripples.length; index += 1) {
      const ripple = ripples[index];
      const cycle = (state.elapsed * 0.08 + index * 0.26) % 1;
      ripple.scale.setScalar(0.4 + cycle * 2.3);
      (ripple.material as THREE.MeshBasicMaterial).opacity = (1 - cycle) * 0.16;
    }

    const focus = resolveFocusTarget();
    if (focus && !manualCameraActive) {
      const follow = 1 - Math.exp(-delta * 2.8);
      cameraFocus.lerp(resolvedFocus.set(focus.x, focus.y), follow);
      resolvedFocusHeight = focus.z;
      cameraFocusHeight = THREE.MathUtils.lerp(
        cameraFocusHeight,
        resolvedFocusHeight,
        follow,
      );
      if (focusZoomGoal !== null) {
        const nextZoom = THREE.MathUtils.lerp(
          manualZoom,
          focusZoomGoal,
          1 - Math.exp(-delta * 3.2),
        );
        if (Math.abs(nextZoom - manualZoom) > 0.0001) {
          manualZoom = nextZoom;
          updateProjection();
        }
      }
    } else if (Math.abs(cameraFocusHeight) > 0.001) {
      cameraFocusHeight = THREE.MathUtils.lerp(
        cameraFocusHeight,
        0,
        1 - Math.exp(-delta * 4),
      );
    }
    updateFocusMarker(focus, state.elapsed);
    const drift = reducedMotion || manualCameraActive ? 0 : 1;
    applyCameraPose(drift);
    renderer.render(scene, camera);
  }

  function applyCameraPose(drift: number): void {
    const view = views[viewIndex];
    const overviewMix = THREE.MathUtils.smoothstep(manualZoom, 1.15, 2.6);
    const overviewRadius = Math.min(view.radius, camera.top * 0.12);
    const overviewHeight = Math.max(view.height, camera.top * 1.2 + 24);
    const cameraRadius = THREE.MathUtils.lerp(
      view.radius,
      overviewRadius,
      overviewMix,
    );
    const cameraHeight = THREE.MathUtils.lerp(
      view.height,
      overviewHeight,
      overviewMix,
    );
    const orbit =
      view.phase +
      manualOrbitOffset +
      Math.sin(cameraTime * 0.035) * 0.13 * drift;
    const targetX = cameraFocus.x + Math.sin(cameraTime * 0.021) * 5 * drift;
    const targetY = cameraFocus.y + Math.cos(cameraTime * 0.017) * 3 * drift;
    camera.position.set(
      cameraFocus.x + Math.cos(orbit) * cameraRadius,
      cameraFocus.y + Math.sin(orbit) * cameraRadius,
      cameraHeight + cameraFocusHeight,
    );
    camera.lookAt(targetX, targetY, cameraFocusHeight);
    camera.updateMatrixWorld();
  }

  function isNearViewportEdge(position: THREE.Vector3): boolean {
    const clip = position.clone().project(camera);
    return Math.abs(clip.x) <= 1.12 && Math.abs(clip.y) <= 1.12;
  }

  function nextView(): void {
    viewIndex = (viewIndex + 1) % views.length;
    manualOrbitOffset = 0;
    updateProjection();
  }

  function project(position: THREE.Vector3): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const point = position.clone().project(camera);
    return {
      x: rect.left + ((point.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - point.y) * rect.height) / 2,
    };
  }

  function flightScreenPosition(id: number): { x: number; y: number } | null {
    const visual = flightVisuals.get(id);
    return visual?.root.visible ? project(visual.root.position) : null;
  }

  function pickFlight(clientX: number, clientY: number): number | null {
    let best: { id: number; distance: number } | null = null;
    for (const [id, visual] of flightVisuals) {
      if (!visual.root.visible) continue;
      const point = project(visual.root.position);
      const distance = Math.hypot(point.x - clientX, point.y - clientY);
      const hitRadius = config.scope === "center" ? 30 : 44;
      if (distance < hitRadius && (!best || distance < best.distance))
        best = { id, distance };
    }
    return best?.id ?? null;
  }

  function pickRunway(clientX: number, clientY: number): number | null {
    const thresholds = config.runways.map((runway) => {
      const point = runwayEndPoint3(
        runway,
        currentState?.activeRunwayEnds[runway.id] ?? runway.landingEnd,
        0,
        2.2,
      );
      return new THREE.Vector3(point.x, point.y, point.z);
    });
    let best: { runway: number; distance: number } | null = null;
    for (let index = 0; index < thresholds.length; index += 1) {
      const threshold = thresholds[index];
      const point = project(threshold);
      const distance = Math.hypot(point.x - clientX, point.y - clientY);
      if (distance < 76 && (!best || distance < best.distance))
        best = { runway: index, distance };
    }
    return best?.runway ?? null;
  }

  function resize(): void {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    viewportWidth = width;
    viewportHeight = height;
    renderer.setSize(width, height, false);
    updateProjection();
  }

  function setPerformanceDegraded(degraded: boolean): void {
    if (performanceDegraded === degraded) return;
    performanceDegraded = degraded;
    // Keep the visual language intact on a struggling device, but trade the
    // least gameplay-relevant work first: shadow-map passes and supersampled
    // pixels. Simulation authority and aircraft detail are never reduced.
    const pixelRatio = degraded
      ? Math.min(1, standardPixelRatio)
      : standardPixelRatio;
    renderer.setPixelRatio(pixelRatio);
    renderer.shadowMap.enabled = !lowDetail && !degraded;
    sun.castShadow = !lowDetail && !degraded;
    // Terminal trains and bridge animation are optional atmosphere. When frame
    // pacing is under pressure, release that presentation work before touching
    // authoritative aircraft, vehicles, routes, or the user's visibility
    // preference. It is restored automatically with normal render headroom.
    terminalAccess.setVisible(airportLifeVisible && !degraded);
    terminalGates.setVisible(airportLifeVisible && !degraded);
    renderer.setSize(viewportWidth, viewportHeight, false);
  }

  function groundPointAt(
    clientX: number,
    clientY: number,
  ): THREE.Vector3 | null {
    const rect = canvas.getBoundingClientRect();
    zoomNdc.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      (-(clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    zoomRaycaster.setFromCamera(zoomNdc, camera);
    return (
      zoomRaycaster.ray.intersectPlane(groundPlane, zoomGroundPoint)?.clone() ??
      null
    );
  }

  function moveCameraFocus(deltaX: number, deltaY: number): void {
    const previousX = cameraFocus.x;
    const previousY = cameraFocus.y;
    cameraFocus.x = THREE.MathUtils.clamp(
      cameraFocus.x + deltaX,
      -landscape.panX,
      landscape.panX,
    );
    cameraFocus.y = THREE.MathUtils.clamp(
      cameraFocus.y + deltaY,
      -landscape.panY,
      landscape.panY,
    );
    camera.position.x += cameraFocus.x - previousX;
    camera.position.y += cameraFocus.y - previousY;
    camera.updateMatrixWorld();
  }

  function beginManualCamera(): void {
    manualCameraActive = true;
    worldFocusTarget = null;
    focusZoomGoal = null;
    cameraFocusHeight = 0;
    resolvedFocusHeight = 0;
    focusedFlightIds.clear();
    focusMarker.visible = false;
    applyCameraPose(0);
  }

  function setWorldFocusTarget(target: WorldFocusTarget | null): void {
    worldFocusTarget = target
      ? {
          ...target,
          position: [...target.position],
          flightIds: [...target.flightIds],
        }
      : null;
    focusedFlightIds.clear();
    for (const flightId of target?.flightIds ?? [])
      focusedFlightIds.add(flightId);
    focusZoomGoal = target
      ? THREE.MathUtils.clamp(
          target.suggestedZoom,
          config.scope === "center" ? 0.08 : 0.12,
          3,
        )
      : null;
    manualCameraActive = false;
    if (target) resolvedFocus.set(target.position[0], target.position[1]);
    focusMarker.visible = target !== null && target.kind !== "flight";
  }

  function resolveFocusTarget(): {
    x: number;
    y: number;
    z: number;
    radius: number;
  } | null {
    if (!worldFocusTarget) return null;
    const points: Array<{ x: number; y: number; z: number }> = [];
    for (const flightId of worldFocusTarget.flightIds) {
      const visual = flightVisuals.get(flightId);
      if (visual)
        points.push({
          x: visual.root.position.x,
          y: visual.root.position.y,
          z: visual.root.position.z,
        });
    }
    if (worldFocusTarget.serviceVehicleId) {
      const visual = serviceVehicleVisuals.get(
        worldFocusTarget.serviceVehicleId,
      );
      if (visual)
        points.push({
          x: visual.root.position.x,
          y: visual.root.position.y,
          z: visual.root.position.z,
        });
    }
    if (!points.length) {
      return {
        x: worldFocusTarget.position[0],
        y: worldFocusTarget.position[1],
        z: 0,
        radius: worldFocusTarget.radius,
      };
    }
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const z = points.reduce((sum, point) => sum + point.z, 0) / points.length;
    const radius = Math.max(
      worldFocusTarget.radius,
      ...points.map(
        (point) => Math.hypot(point.x - x, point.y - y, point.z - z) + 4,
      ),
    );
    return { x, y, z, radius };
  }

  function updateFocusMarker(
    focus: { x: number; y: number; z: number; radius: number } | null,
    elapsed: number,
  ): void {
    const target = worldFocusTarget;
    focusMarker.visible = Boolean(focus && target && target.kind !== "flight");
    if (!focus || !target || target.kind === "flight") return;
    focusMarker.position.set(focus.x, focus.y, Math.max(2.25, focus.z));
    const pulse = reducedMotion ? 1 : 1 + Math.sin(elapsed * 2.6) * 0.035;
    focusMarker.scale.setScalar(Math.max(5, focus.radius) * pulse);
    const semantic =
      accessibilityPaletteDefinition(accessibilityPalette).semantic;
    const color =
      target.tone === "rose"
        ? semantic.critical
        : target.tone === "amber"
          ? semantic.caution
          : semantic.info;
    for (const child of focusMarker.children) {
      const material = (child as THREE.Mesh | THREE.LineSegments).material;
      if (material instanceof THREE.Material && "color" in material) {
        (material as THREE.MeshBasicMaterial).color.setHex(color);
      }
    }
  }

  function panCameraByScreen(horizontal: number, vertical: number): void {
    if (!horizontal && !vertical) return;
    beginManualCamera();
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.min(
      110,
      Math.max(54, Math.min(rect.width, rect.height) * 0.11),
    );
    const center = groundPointAt(centerX, centerY);
    const destination = groundPointAt(
      centerX + horizontal * distance,
      centerY + vertical * distance,
    );
    if (center && destination)
      moveCameraFocus(destination.x - center.x, destination.y - center.y);
  }

  function rotateCamera(direction: -1 | 1): void {
    beginManualCamera();
    manualOrbitOffset = THREE.MathUtils.euclideanModulo(
      manualOrbitOffset + (direction * Math.PI) / 12,
      Math.PI * 2,
    );
    applyCameraPose(0);
  }

  function zoomAtScreenPoint(
    clientX: number,
    clientY: number,
    factor: number,
  ): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    beginManualCamera();
    const before = groundPointAt(clientX, clientY);
    const minimumZoom = config.scope === "center" ? 0.08 : 0.12;
    manualZoom = THREE.MathUtils.clamp(manualZoom * factor, minimumZoom, 3);
    updateProjection();
    applyCameraPose(0);
    const after = groundPointAt(clientX, clientY);
    if (before && after)
      moveCameraFocus(before.x - after.x, before.y - after.y);
  }

  function panBetweenScreenPoints(
    previous: { x: number; y: number },
    current: { x: number; y: number },
  ): void {
    beginManualCamera();
    const before = groundPointAt(previous.x, previous.y);
    const after = groundPointAt(current.x, current.y);
    if (before && after)
      moveCameraFocus(before.x - after.x, before.y - after.y);
  }

  function pinchBetweenScreenPoints(
    previous: readonly [{ x: number; y: number }, { x: number; y: number }],
    current: readonly [{ x: number; y: number }, { x: number; y: number }],
  ): void {
    beginManualCamera();
    const previousMidpoint = {
      x: (previous[0].x + previous[1].x) / 2,
      y: (previous[0].y + previous[1].y) / 2,
    };
    const currentMidpoint = {
      x: (current[0].x + current[1].x) / 2,
      y: (current[0].y + current[1].y) / 2,
    };
    const before = groundPointAt(previousMidpoint.x, previousMidpoint.y);
    const previousDistance = Math.max(
      1,
      Math.hypot(previous[0].x - previous[1].x, previous[0].y - previous[1].y),
    );
    const currentDistance = Math.max(
      1,
      Math.hypot(current[0].x - current[1].x, current[0].y - current[1].y),
    );
    const minimumZoom = config.scope === "center" ? 0.08 : 0.12;
    manualZoom = THREE.MathUtils.clamp(
      (manualZoom * previousDistance) / currentDistance,
      minimumZoom,
      3,
    );
    updateProjection();
    applyCameraPose(0);
    const after = groundPointAt(currentMidpoint.x, currentMidpoint.y);
    if (before && after)
      moveCameraFocus(before.x - after.x, before.y - after.y);
  }

  function applyCameraInput(
    panX: number,
    panY: number,
    rotate: number,
    zoom: number,
    deltaSeconds: number,
  ): void {
    if (
      ![panX, panY, rotate, zoom, deltaSeconds].every(Number.isFinite) ||
      deltaSeconds <= 0
    )
      return;
    if (
      Math.max(
        Math.abs(panX),
        Math.abs(panY),
        Math.abs(rotate),
        Math.abs(zoom),
      ) <= 0.001
    )
      return;
    beginManualCamera();
    if (Math.abs(rotate) > 0.001) {
      manualOrbitOffset = THREE.MathUtils.euclideanModulo(
        manualOrbitOffset +
          rotate * THREE.MathUtils.degToRad(75) * deltaSeconds,
        Math.PI * 2,
      );
    }
    if (Math.abs(zoom) > 0.001) {
      const minimumZoom = config.scope === "center" ? 0.08 : 0.12;
      manualZoom = THREE.MathUtils.clamp(
        manualZoom * Math.exp(-zoom * 1.25 * deltaSeconds),
        minimumZoom,
        3,
      );
      updateProjection();
    }
    applyCameraPose(0);
    if (Math.abs(panX) > 0.001 || Math.abs(panY) > 0.001) {
      const rect = canvas.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      const speed = Math.min(
        560,
        Math.max(360, Math.min(rect.width, rect.height) * 0.82),
      );
      const current = {
        x: center.x + panX * speed * deltaSeconds,
        y: center.y + panY * speed * deltaSeconds,
      };
      const before = groundPointAt(center.x, center.y);
      const after = groundPointAt(current.x, current.y);
      if (before && after)
        moveCameraFocus(after.x - before.x, after.y - before.y);
    }
  }

  function changeZoom(factor: number): void {
    beginManualCamera();
    const minimumZoom = config.scope === "center" ? 0.08 : 0.12;
    manualZoom = THREE.MathUtils.clamp(manualZoom * factor, minimumZoom, 3);
    updateProjection();
    applyCameraPose(0);
  }

  function resetCamera(): void {
    manualZoom = 1;
    manualOrbitOffset = 0;
    cameraFocus.set(0, 0);
    cameraFocusHeight = 0;
    resolvedFocusHeight = 0;
    worldFocusTarget = null;
    focusZoomGoal = null;
    focusedFlightIds.clear();
    focusMarker.visible = false;
    manualCameraActive = false;
    updateProjection();
  }

  function flightAttitude(
    id: number,
  ): { headingDegrees: number; noseUpDegrees: number } | null {
    const visual = flightVisuals.get(id);
    if (!visual) return null;
    const nose = attitudeNose
      .set(1, 0, 0)
      .applyQuaternion(visual.root.quaternion);
    return {
      headingDegrees:
        (THREE.MathUtils.radToDeg(Math.atan2(nose.y, nose.x)) + 360) % 360,
      noseUpDegrees: THREE.MathUtils.radToDeg(
        Math.atan2(nose.z, Math.hypot(nose.x, nose.y)),
      ),
    };
  }

  function flightRenderPose(id: number): WorldFlightRenderPose | null {
    const visual = flightVisuals.get(id);
    const flight = currentFlightById.get(id);
    if (!visual || !flight) return null;
    const position = {
      x: visual.root.position.x,
      y: visual.root.position.y,
      z: visual.root.position.z,
    };
    const sourceMotion = {
      x: flight.motion.x,
      y: flight.motion.y,
      z: flight.motion.z,
      heading: flight.motion.heading,
      onGround: flight.motion.onGround,
      stage: flight.motion.stage ?? flight.phase,
    };
    return {
      position,
      sourceMotion,
      horizontalSourceError: Math.hypot(
        position.x - sourceMotion.x,
        position.y - sourceMotion.y,
      ),
      visible: visual.root.visible,
    };
  }

  function mapMetrics(): {
    northDegrees: number;
    scaleMeters: number;
    scalePixels: number;
  } {
    const origin = project(new THREE.Vector3(0, 0, 1.5));
    const north = project(new THREE.Vector3(0, 10, 1.5));
    const northDegrees = THREE.MathUtils.radToDeg(
      Math.atan2(north.x - origin.x, -(north.y - origin.y)),
    );
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const first = groundPointAt(centerX - 50, centerY);
    const second = groundPointAt(centerX + 50, centerY);
    const metersPerPixel =
      first && second
        ? (first.distanceTo(second) *
            (config.vectorData?.runtimeReference.worldMetersPerUnit ?? 38)) /
          100
        : 10;
    const targetMeters = metersPerPixel * 96;
    const scales = [100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000];
    const scaleMeters = scales.reduce((best, candidate) =>
      Math.abs(Math.log(candidate / targetMeters)) <
      Math.abs(Math.log(best / targetMeters))
        ? candidate
        : best,
    );
    return {
      northDegrees,
      scaleMeters,
      scalePixels: THREE.MathUtils.clamp(
        scaleMeters / Math.max(0.001, metersPerPixel),
        42,
        180,
      ),
    };
  }

  function viewportGroundCoverage(): {
    fillsViewport: boolean;
    minimumMargin: number;
  } {
    const rect = canvas.getBoundingClientRect();
    const corners = [
      groundPointAt(rect.left, rect.top),
      groundPointAt(rect.right, rect.top),
      groundPointAt(rect.right, rect.bottom),
      groundPointAt(rect.left, rect.bottom),
    ];
    if (corners.some((point) => point === null))
      return { fillsViewport: false, minimumMargin: 0 };
    const minimumMargin = Math.min(
      ...corners.flatMap((point) => [
        landscape.width / 2 - Math.abs(point!.x),
        landscape.height / 2 - Math.abs(point!.y),
      ]),
    );
    return {
      fillsViewport: minimumMargin >= 0,
      minimumMargin: Math.max(0, Number(minimumMargin.toFixed(3))),
    };
  }

  const onContextLost = (event: Event): void => {
    event.preventDefault();
    canvas.dataset.rendererState = "lost";
  };
  const onContextRestored = (): void => {
    canvas.dataset.rendererState = "ready";
  };

  resize();
  window.addEventListener("resize", resize);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  return {
    update,
    snapToAuthoritativeState() {
      for (const visual of flightVisuals.values())
        visual.poseInitialized = false;
    },
    nextView,
    pickFlight,
    pickRunway,
    selectFlight(id) {
      if (id === null) {
        setWorldFocusTarget(null);
        return;
      }
      const visual = flightVisuals.get(id);
      setWorldFocusTarget({
        key: `flight:${id}`,
        kind: "flight",
        position: visual
          ? [visual.root.position.x, visual.root.position.y]
          : [0, 0],
        radius: 8,
        suggestedZoom: config.scope === "center" ? 0.18 : 0.34,
        flightIds: [id],
        tone: "blue",
      });
    },
    focusTarget: setWorldFocusTarget,
    flightScreenPosition,
    flightAttitude,
    flightRenderPose,
    mapMetrics,
    zoomIn() {
      changeZoom(0.78);
    },
    zoomOut() {
      changeZoom(1.28);
    },
    panByScreen(horizontal, vertical) {
      panCameraByScreen(horizontal, vertical);
    },
    rotateBy(direction) {
      rotateCamera(direction);
    },
    applyCameraInput,
    panBetweenScreenPoints,
    pinchBetweenScreenPoints,
    zoomAtScreenPoint,
    resetCamera,
    setRunwayLabelsVisible(visible) {
      runwayLabelsVisible = visible;
      for (const runway of airportBuild.runwayVisuals)
        for (const label of runway.labels) label.visible = visible;
      if (airportBuild.passengerFacilityLabels)
        airportBuild.passengerFacilityLabels.visible = visible;
    },
    setServiceVehiclesVisible(visible) {
      serviceVehiclesVisible = visible;
      for (const visual of serviceVehicleVisuals.values())
        visual.root.visible = visible;
    },
    setAirportLifeVisible(visible) {
      airportLifeVisible = visible;
      terminalAccess.setVisible(visible && !performanceDegraded);
      terminalGates.setVisible(visible && !performanceDegraded);
    },
    setAccessibilityPalette(palette) {
      accessibilityPalette = palette;
      applySemanticPalette(semanticMaterials, palette);
    },
    setPerformanceDegraded,
    setSurfaceLayerVisible(layer, visible) {
      airportBuild.surfaceLayers[layer].visible = visible;
    },
    setAirspaceLayerVisible(layer, visible) {
      airspaceOverlay.setVisible(layer, visible);
    },
    diagnostics() {
      const groundCoverage = viewportGroundCoverage();
      const resolvedTarget = resolveFocusTarget();
      const targetScreen = resolvedTarget
        ? project(
            new THREE.Vector3(
              resolvedTarget.x,
              resolvedTarget.y,
              resolvedTarget.z,
            ),
          )
        : null;
      const canvasBounds = canvas.getBoundingClientRect();
      const targetViewportX = targetScreen
        ? (targetScreen.x - canvasBounds.left) / Math.max(1, canvasBounds.width)
        : 0;
      const targetViewportY = targetScreen
        ? (targetScreen.y - canvasBounds.top) / Math.max(1, canvasBounds.height)
        : 0;
      const subjectVisible = worldFocusTarget
        ? worldFocusTarget.flightIds.every(
            (flightId) => flightVisuals.get(flightId)?.root.visible,
          ) &&
          (!worldFocusTarget.serviceVehicleId ||
            Boolean(
              serviceVehicleVisuals.get(worldFocusTarget.serviceVehicleId)?.root
                .visible,
            ))
        : false;
      const activeAircraft = [...flightVisuals.values()];
      const aircraftFamilies = activeAircraft.reduce<Record<string, number>>(
        (counts, visual) => {
          counts[visual.family] = (counts[visual.family] ?? 0) + 1;
          return counts;
        },
        {},
      );
      const pooledAircraft = [...flightPool.values()].reduce(
        (sum, pool) => sum + pool.length,
        0,
      );
      const airspaceDiagnostics = airspaceOverlay.diagnostics();
      let instancedDrawGroups = 0;
      let instances = 0;
      scene.traverse((object) => {
        if (!(object instanceof THREE.InstancedMesh)) return;
        instancedDrawGroups += 1;
        instances += object.count;
      });
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        detail: lowDetail ? "low" : "high",
        adaptivePerformanceMode: performanceDegraded ? "reduced" : "standard",
        pooledAircraft,
        activeServiceVehicles: serviceVehicleVisuals.size,
        heldServiceVehicles: [...serviceVehicleVisuals.values()].filter(
          (visual) => Boolean(visual.root.userData.held),
        ).length,
        pooledServiceVehicles: [...serviceVehiclePool.values()].reduce(
          (sum, pool) => sum + pool.length,
          0,
        ),
        serviceVehiclesVisible,
        airportLifeVisible,
        airportLifePresentationVisible:
          airportLifeVisible && !performanceDegraded,
        // API 2.x compatibility fields: the feature and render allocation are gone.
        contrailsVisible: false,
        accessibilityPalette,
        activeContrails: 0,
        attachedTugs: [...flightVisuals.values()].filter(
          (visual) => visual.tug.visible,
        ).length,
        startingEngines: [...flightVisuals.values()].filter(
          (visual) => visual.root.userData.engineState === "starting",
        ).length,
        aircraftAssets: {
          active: activeAircraft.length,
          families: aircraftFamilies,
          totalMeshes: activeAircraft.reduce(
            (sum, visual) => sum + visual.assetCounts.meshes,
            0,
          ),
          maximumMeshesPerAircraft: Math.max(
            0,
            ...activeAircraft.map((visual) => visual.assetCounts.meshes),
          ),
          maximumMaterialsPerAircraft: Math.max(
            0,
            ...activeAircraft.map((visual) => visual.assetCounts.materials),
          ),
          maximumTexturesPerAircraft: Math.max(
            0,
            ...activeAircraft.map((visual) => visual.assetCounts.textures),
          ),
          maximumTrianglesPerAircraft: Math.max(
            0,
            ...activeAircraft.map((visual) => visual.assetCounts.triangles),
          ),
          totalGeometryBytes: activeAircraft.reduce(
            (sum, visual) => sum + visual.assetCounts.geometryBytes,
            0,
          ),
          maximumGeometryBytesPerAircraft: Math.max(
            0,
            ...activeAircraft.map((visual) => visual.assetCounts.geometryBytes),
          ),
          poolBudget: aircraftPoolBudget,
        },
        instancing: {
          drawGroups: instancedDrawGroups,
          instances,
          landscapeDrawGroups: landscapeBuild.instancedDrawGroups,
          landscapeInstances: landscapeBuild.instances,
          districtInstances: landscapeBuild.districtInstances,
          highwayInstances: landscapeBuild.highwayInstances,
        },
        pooling: {
          trails: {
            active: 0,
            available: 0,
            capacity: 0,
          },
          labels: {
            active: activeAircraft.length,
            available: pooledAircraft,
            capacity: aircraftPoolBudget,
          },
          weatherEffects: {
            persistentBuffers: 1,
            particleCapacity:
              rain.geometry.getAttribute("position")?.count ?? 0,
          },
          routeLines: airspaceDiagnostics,
          transientEvents: {
            available: surfaceDisruptionPoolSize(disruptionPools),
            capacity: disruptionPoolBudget,
          },
        },
        passengerFacilities: config.surfaceGraph.passengerFacilities.length,
        terminalGateActivity: terminalGates.diagnostics(),
        surfaceDisruptions: {
          total: currentState?.surfaceDisruptions.length ?? 0,
          pending:
            currentState?.surfaceDisruptions.filter(
              (disruption) => disruption.status === "pending",
            ).length ?? 0,
          active:
            currentState?.surfaceDisruptions.filter(
              (disruption) => disruption.status === "active",
            ).length ?? 0,
          recovering:
            currentState?.surfaceDisruptions.filter(
              (disruption) => disruption.status === "recovering",
            ).length ?? 0,
          pooledMarkers: surfaceDisruptionPoolSize(disruptionPools),
          poolBudget: disruptionPoolBudget,
        },
        camera: {
          focusX: Number(cameraFocus.x.toFixed(3)),
          focusY: Number(cameraFocus.y.toFixed(3)),
          focusZ: Number(cameraFocusHeight.toFixed(3)),
          zoom: Number(manualZoom.toFixed(3)),
          orbitDegrees: Number(
            THREE.MathUtils.radToDeg(manualOrbitOffset).toFixed(2),
          ),
          panningEnabled: true,
          groundWidth: landscape.width,
          groundHeight: landscape.height,
          detailedWidth: landscape.detailedWidth,
          detailedHeight: landscape.detailedHeight,
          panLimitX: landscape.panX,
          panLimitY: landscape.panY,
          groundFillsViewport: groundCoverage.fillsViewport,
          minimumGroundMargin: groundCoverage.minimumMargin,
          target: worldFocusTarget
            ? {
                key: worldFocusTarget.key,
                kind: worldFocusTarget.kind,
                tracking: !manualCameraActive,
                resolvedX: Number(resolvedFocus.x.toFixed(3)),
                resolvedY: Number(resolvedFocus.y.toFixed(3)),
                resolvedZ: Number(resolvedFocusHeight.toFixed(3)),
                viewportX: Number(targetViewportX.toFixed(4)),
                viewportY: Number(targetViewportY.toFixed(4)),
                withinViewport:
                  targetViewportX >= 0 &&
                  targetViewportX <= 1 &&
                  targetViewportY >= 0 &&
                  targetViewportY <= 1,
                subjectVisible,
              }
            : null,
        },
        surfaceLayers: {
          "taxiway-labels":
            airportBuild.surfaceLayers["taxiway-labels"].visible,
          "operational-zones":
            airportBuild.surfaceLayers["operational-zones"].visible,
          hotspots: airportBuild.surfaceLayers.hotspots.visible,
          "airport-boundary":
            airportBuild.surfaceLayers["airport-boundary"].visible,
          "protection-zones":
            airportBuild.surfaceLayers["protection-zones"].visible,
          "movement-projections":
            airportBuild.surfaceLayers["movement-projections"].visible,
        },
        airspaceLayers: airspaceOverlay.visibility(),
        runways: airportBuild.runwayVisuals.map((visual, id) => ({
          id,
          activeEnd: visual.marker.scale.x < 0 ? -1 : 1,
          markerVisible: visual.marker.visible,
          arrivalMarkerVisible: visual.arrivalMarker.visible,
          departureMarkerVisible: visual.departureMarker.visible,
        })),
        context: contextRuntime?.diagnostics() ?? { status: "procedural" },
        environment: {
          phase: currentState?.environment.phase ?? "day",
          season: currentState?.environment.season ?? "summer",
          daylight: Number(
            (currentState?.environment.daylight ?? 1).toFixed(4),
          ),
          cloudCover: Number(
            (currentState?.environment.cloudCover ?? 0).toFixed(4),
          ),
          snowCover: Number(
            (currentState?.environment.snowCover ?? 0).toFixed(4),
          ),
          wetPavement: Number(
            (currentState?.environment.wetPavement ?? 0).toFixed(4),
          ),
          runwayLightIntensity: Number(
            (currentState?.environment.runwayLightIntensity ?? 0).toFixed(4),
          ),
          trackedSurfaceMaterials: environmentMaterials.length,
        },
      };
    },
    resize,
    dispose() {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      contextRuntime?.dispose();
      terminalAccess.dispose();
      terminalGates.dispose();
      world.remove(airspaceOverlay.root);
      airspaceOverlay.dispose();
      for (const pool of flightPool.values())
        for (const visual of pool) disposeObject(visual.root);
      flightPool.clear();
      for (const pool of serviceVehiclePool.values())
        for (const visual of pool) disposeObject(visual.root);
      serviceVehiclePool.clear();
      for (const pool of disruptionPools.values())
        for (const marker of pool) disposeObject(marker);
      disruptionPools.clear();
      disposeObject(scene);
      renderer.dispose();
    },
  };
}

type EnvironmentMaterialState = {
  material: THREE.MeshStandardMaterial;
  baseColor: THREE.Color;
  baseRoughness: number;
  kind: EnvironmentSurfaceKind;
};

type SemanticMaterialKind = "runwayLine" | "arrival" | "departure" | "critical";

type SemanticMaterialState = {
  material: THREE.MeshBasicMaterial;
  kind: SemanticMaterialKind;
};

const environmentColorScratch = new THREE.Color();

function collectEnvironmentMaterials(
  root: THREE.Object3D,
): EnvironmentMaterialState[] {
  const collected: EnvironmentMaterialState[] = [];
  const seen = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(
      object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh
    ))
      return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (
        !(material instanceof THREE.MeshStandardMaterial) ||
        seen.has(material)
      )
        continue;
      if (!material.name.startsWith("environment:")) continue;
      const kind = material.name.slice(
        "environment:".length,
      ) as EnvironmentSurfaceKind;
      if (kind !== "terrain" && kind !== "district" && kind !== "pavement")
        continue;
      seen.add(material);
      collected.push({
        material,
        baseColor: material.color.clone(),
        baseRoughness: material.roughness,
        kind,
      });
    }
  });
  return collected;
}

function updateEnvironmentMaterials(
  materials: readonly EnvironmentMaterialState[],
  environment: EnvironmentPresentation,
): void {
  for (const entry of materials) {
    entry.material.color.copy(entry.baseColor);
    if (entry.kind === "pavement") {
      entry.material.color.lerp(
        environmentColorScratch.setHex(0x263638),
        environment.wetPavement * 0.34,
      );
      entry.material.color.lerp(
        environmentColorScratch.setHex(environment.snowTint),
        environment.snowCover * 0.16,
      );
      entry.material.roughness = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(
          entry.baseRoughness,
          0.38,
          environment.wetPavement,
        ),
        0.78,
        environment.snowCover * 0.35,
      );
      continue;
    }
    entry.material.color.lerp(
      environmentColorScratch.setHex(environment.terrainTint),
      entry.kind === "terrain" ? 0.22 : 0.14,
    );
    entry.material.color.lerp(
      environmentColorScratch.setHex(environment.snowTint),
      environment.snowCover * (entry.kind === "terrain" ? 0.78 : 0.62),
    );
  }
}

function collectSemanticMaterials(
  root: THREE.Object3D,
): SemanticMaterialState[] {
  const collected: SemanticMaterialState[] = [];
  const seen = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(
      object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh
    ))
      return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshBasicMaterial) || seen.has(material))
        continue;
      if (!material.name.startsWith("semantic:")) continue;
      const kind = material.name.slice(
        "semantic:".length,
      ) as SemanticMaterialKind;
      if (
        kind !== "runwayLine" &&
        kind !== "arrival" &&
        kind !== "departure" &&
        kind !== "critical"
      )
        continue;
      seen.add(material);
      collected.push({ material, kind });
    }
  });
  return collected;
}

function applySemanticPalette(
  materials: readonly SemanticMaterialState[],
  palette: AccessibilityPalette,
): void {
  const semantic = accessibilityPaletteDefinition(palette).semantic;
  for (const entry of materials) {
    const color =
      entry.kind === "critical" ? semantic.critical : semantic[entry.kind];
    entry.material.color.setHex(color);
  }
}

type BoxInstanceTransform = {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotation?: number;
};

function createBoxInstances(
  geometry: THREE.BoxGeometry,
  material: THREE.Material,
  transforms: BoxInstanceTransform[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  const dummy = new THREE.Object3D();
  transforms.forEach((transform, index) => {
    dummy.position.set(transform.x, transform.y, transform.z);
    dummy.rotation.set(0, 0, transform.rotation ?? 0);
    dummy.scale.set(transform.width, transform.depth, transform.height);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.computeBoundingSphere();
  return mesh;
}

function buildAirport(
  root: THREE.Group,
  config: AirportConfig,
  lowDetail: boolean,
): AirportBuild {
  const asphalt = new THREE.MeshStandardMaterial({
    color: COLORS.runway,
    roughness: 0.88,
  });
  asphalt.name = "environment:pavement";
  const stripe = new THREE.MeshBasicMaterial({ color: COLORS.runwayLine });
  stripe.name = "semantic:runwayLine";
  const arrivalMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.runwayLine,
  });
  arrivalMaterial.name = "semantic:arrival";
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitLight = new THREE.SphereGeometry(
    1,
    lowDetail ? 6 : 8,
    lowDetail ? 4 : 6,
  );
  const runwayLights: RunwayLight[] = [];
  const runwayProtectionLights: RunwayProtectionLight[] = [];
  const runwayVisuals: RunwayVisual[] = [];
  config.runways.forEach((data, runwayIndex) => {
    const runway = new THREE.Group();
    runway.position.set(data.center[0], data.center[1], 1.7);
    runway.rotation.z = data.heading;
    const surface = new THREE.Mesh(
      new THREE.BoxGeometry(data.length, data.width, 0.35),
      asphalt,
    );
    surface.receiveShadow = true;
    runway.add(surface);
    const stripTransforms: BoxInstanceTransform[] = [];
    for (let index = -5; index <= 5; index += 1)
      stripTransforms.push({
        x: index * (data.length / 12),
        y: 0,
        z: 0.21,
        width: 4.6,
        depth: 0.24,
        height: 0.04,
      });
    for (const side of [-1, 1]) {
      stripTransforms.push({
        x: 0,
        y: side * Math.max(0.2, data.width / 2 - 0.18),
        z: 0.22,
        width: data.length - 4,
        depth: 0.15,
        height: 0.05,
      });
    }
    runway.add(createBoxInstances(unitBox, stripe, stripTransforms));
    const marker = new THREE.Group();
    marker.position.set(data.landingEnd * (data.length / 2 - 3.1), 0, 0.25);
    marker.scale.x = data.landingEnd;
    const arrivalMarker = new THREE.Group();
    const barCount = Math.max(2, Math.min(7, Math.floor(data.width / 0.42)));
    const arrivalTransforms: BoxInstanceTransform[] = [];
    for (let bar = 0; bar < barCount; bar += 1) {
      const across =
        barCount === 1
          ? 0
          : (bar / (barCount - 1) - 0.5) * Math.max(0.5, data.width - 0.5);
      arrivalTransforms.push({
        x: 0,
        y: across,
        z: 0,
        width: 0.55,
        depth: Math.min(0.36, data.width / (barCount * 1.35)),
        height: 0.06,
      });
    }
    arrivalMarker.add(
      createBoxInstances(unitBox, arrivalMaterial, arrivalTransforms),
    );
    arrivalMarker.visible = data.role === "arrival" || data.role === "mixed";
    marker.add(arrivalMarker);
    const departureMarker = new THREE.Group();
    const departureMaterial = new THREE.MeshBasicMaterial({ color: 0x79c8e8 });
    departureMaterial.name = "semantic:departure";
    departureMarker.add(
      createBoxInstances(
        unitBox,
        departureMaterial,
        [-1, 1].map((side) => ({
          x: -0.7,
          y: side * data.width * 0.23,
          z: 0.02,
          width: 3.7,
          depth: Math.min(0.38, data.width * 0.13),
          height: 0.07,
          rotation: side * 0.38,
        })),
      ),
    );
    departureMarker.visible =
      data.role === "departure" || data.role === "mixed";
    marker.add(departureMarker);
    runway.add(marker);
    const labels: THREE.Sprite[] = [];
    if (data.designation) {
      const negativeLabel = createRunwayLabel(data.designation[0]);
      negativeLabel.position.set(-data.length / 2 + 5.6, 0, 0.48);
      negativeLabel.visible = false;
      runway.add(negativeLabel);
      labels.push(negativeLabel);
      const positiveLabel = createRunwayLabel(data.designation[1]);
      positiveLabel.position.set(data.length / 2 - 5.6, 0, 0.48);
      positiveLabel.visible = false;
      runway.add(positiveLabel);
      labels.push(positiveLabel);
    }
    const closure = new THREE.Group();
    closure.position.z = 0.29;
    const closureMaterial = new THREE.MeshBasicMaterial({ color: 0xef6f62 });
    closureMaterial.name = "semantic:critical";
    closure.add(
      createBoxInstances(
        unitBox,
        closureMaterial,
        [-0.72, 0.72].map((rotation) => ({
          x: 0,
          y: 0,
          z: 0,
          width: Math.min(12, data.length * 0.3),
          depth: 0.65,
          height: 0.08,
          rotation,
        })),
      ),
    );
    closure.visible = false;
    runway.add(closure);
    const addLightBatch = (
      positions: Array<[number, number]>,
      color: number,
      dayOpacity: number,
      nightOpacity: number,
      radius = 0.27,
      activeEnd?: -1 | 1,
      roles?: RunwayOperationalRole[],
    ): void => {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: dayOpacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const lights = new THREE.InstancedMesh(
        unitLight,
        material,
        positions.length,
      );
      const dummy = new THREE.Object3D();
      positions.forEach(([x, y], index) => {
        dummy.position.set(x, y, 0.45);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(radius);
        dummy.updateMatrix();
        lights.setMatrixAt(index, dummy.matrix);
      });
      lights.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      lights.computeBoundingSphere();
      runway.add(lights);
      runwayLights.push({
        mesh: lights,
        dayOpacity,
        nightOpacity,
        phase: runwayIndex * 1.7 + runwayLights.length * 0.31,
        runwayId: runwayIndex,
        activeEnd,
        roles,
      });
    };
    const addProtectionLightBatch = (
      positions: Array<[number, number]>,
      color: number,
      kind: RunwayProtectionLight["kind"],
    ): void => {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const lights = new THREE.InstancedMesh(
        unitLight,
        material,
        positions.length,
      );
      const dummy = new THREE.Object3D();
      positions.forEach(([x, y], index) => {
        dummy.position.set(x, y, 0.49);
        dummy.scale.setScalar(0.31);
        dummy.updateMatrix();
        lights.setMatrixAt(index, dummy.matrix);
      });
      lights.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      lights.computeBoundingSphere();
      lights.visible = false;
      runway.add(lights);
      runwayProtectionLights.push({
        mesh: lights,
        runwayId: runwayIndex,
        kind,
        dayOpacity: 0.42,
        nightOpacity: 1,
      });
    };
    const thresholdColor = PALETTE_COLOR[data.color];
    for (const end of [-1, 1] as const) {
      addLightBatch(
        Array.from({ length: 6 }, (_, lightIndex) => [
          end * (data.length / 2 + (lightIndex + 1) * 3.1),
          0,
        ]),
        thresholdColor,
        0.36,
        1,
        0.38,
        end,
        ["arrival", "mixed"],
      );
    }
    const edgeLightCount = Math.max(8, Math.round(data.length / 6));
    const edgeLightPositions: Array<[number, number]> = [];
    for (let lightIndex = 0; lightIndex <= edgeLightCount; lightIndex += 1) {
      const x =
        -data.length / 2 +
        2 +
        ((data.length - 4) * lightIndex) / edgeLightCount;
      edgeLightPositions.push(
        [x, -Math.max(0.18, data.width / 2 - 0.18)],
        [x, Math.max(0.18, data.width / 2 - 0.18)],
      );
    }
    addLightBatch(edgeLightPositions, 0xb9ddff, 0.14, 0.92, 0.27, undefined, [
      "arrival",
      "departure",
      "mixed",
    ]);
    for (const operatingEnd of [-1, 1] as const) {
      addLightBatch(
        [-1, 1].map((side) => [
          -operatingEnd * (data.length / 2 - 0.8),
          side * Math.max(0.16, data.width / 2 - 0.3),
        ]),
        0xff6d61,
        0.18,
        1,
        0.24,
        operatingEnd,
        ["arrival", "departure", "mixed"],
      );
    }
    const entranceLightPositions = [-1, 1].flatMap((end) =>
      [-1, 1].map(
        (side) =>
          [end * (data.length / 2 - 2.2), side * (data.width / 2 + 0.45)] as [
            number,
            number,
          ],
      ),
    );
    addProtectionLightBatch(entranceLightPositions, 0xef6f62, "entrance");
    const takeoffHoldPositions = [-1, 1].flatMap((end) =>
      [-1, 0, 1].map(
        (offset) =>
          [
            end * (data.length / 2 - 5.1),
            offset * Math.max(0.22, data.width / 2 - 0.22),
          ] as [number, number],
      ),
    );
    addProtectionLightBatch(takeoffHoldPositions, 0xf2c84b, "takeoff-hold");
    runwayVisuals.push({
      marker,
      arrivalMarker,
      departureMarker,
      closure,
      labels,
    });
    root.add(runway);
  });

  if (config.vectorData)
    addImportedAprons(root, config.vectorData.runtimeReference.aprons);
  const taxiMaterial = new THREE.MeshStandardMaterial({
    color: 0x515b58,
    roughness: 0.96,
  });
  taxiMaterial.name = "environment:pavement";
  addTaxiNetwork(root, config.surfaceGraph, taxiMaterial);
  const baseSurfaceLayers = addSurfaceMapLayers(root, config);
  const surfaceProtection = createSurfaceProtectionOverlay(config);
  const surfaceProjections = createSurfaceProjectionOverlay();
  const surfaceLayers: Record<SurfaceLayer, THREE.Group> = {
    ...baseSurfaceLayers,
    "protection-zones": surfaceProtection.group,
    "movement-projections": surfaceProjections.group,
  };
  root.add(surfaceProtection.group, surfaceProjections.group);
  addHoldShortMarkings(root, config, unitBox);

  if (config.vectorData) {
    addImportedBuildings(
      root,
      config.obstacles,
      config.surfaceGraph.passengerFacilities,
    );
  } else {
    const terminalEnvelope = config.obstacles.find(
      (obstacle) => obstacle.kind === "terminal",
    );
    const terminalCenter = terminalEnvelope?.center ?? config.terminal;
    const terminal = new THREE.Group();
    terminal.position.set(terminalCenter[0], terminalCenter[1], 1.7);
    const terminalMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.terminal,
      roughness: 0.78,
    });
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(28, 9, 5.5),
      terminalMaterial,
    );
    building.position.z = 2.75;
    building.castShadow = true;
    terminal.add(building);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(29.5, 10.2, 0.55),
      new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.85 }),
    );
    roof.position.z = 5.8;
    roof.castShadow = true;
    terminal.add(roof);
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.window,
      emissive: 0x193536,
      emissiveIntensity: 0.3,
    });
    const windows = createBoxInstances(
      unitBox,
      windowMaterial,
      Array.from({ length: 11 }, (_, index) => ({
        x: (index - 5) * 2.25,
        y: -4.58,
        z: 3.1,
        width: 1.4,
        depth: 0.15,
        height: 1.25,
      })),
    );
    windows.name = "instanced-terminal-windows";
    terminal.add(windows);
    root.add(terminal);
  }
  const passengerFacilityLabels = addPassengerFacilityLabels(
    root,
    config.surfaceGraph.passengerFacilities,
  );
  const gateLights = createGateActivityLights(
    root,
    config,
    unitLight,
    lowDetail,
  );

  const towerEnvelope = config.obstacles.find(
    (obstacle) => obstacle.kind === "control-tower",
  );
  const towerCenter = towerEnvelope?.center ?? [
    config.terminal[0] - 17,
    config.terminal[1] + 6,
  ];
  const tower = new THREE.Group();
  tower.position.set(towerCenter[0], towerCenter[1], 1.8);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 3.2, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xd7cfbd }),
  );
  stem.rotation.x = Math.PI / 2;
  stem.position.z = 6;
  stem.castShadow = true;
  tower.add(stem);
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(4.5, 3.7, 3.1, 8),
    new THREE.MeshStandardMaterial({ color: COLORS.window, roughness: 0.25 }),
  );
  top.rotation.x = Math.PI / 2;
  top.position.z = 12.9;
  top.castShadow = true;
  tower.add(top);
  root.add(tower);
  return {
    runwayLights,
    runwayProtectionLights,
    runwayVisuals,
    passengerFacilityLabels,
    gateLights,
    surfaceProtection,
    surfaceProjections,
    surfaceLayers,
  };
}

function addImportedAprons(
  root: THREE.Group,
  aprons: NonNullable<
    AirportConfig["vectorData"]
  >["runtimeReference"]["aprons"],
): void {
  const material = new THREE.MeshStandardMaterial({
    color: 0x59635e,
    roughness: 0.98,
    side: THREE.DoubleSide,
  });
  material.name = "environment:pavement";
  for (const apron of aprons) {
    const shape = shapeFromRings(apron.rings);
    if (!shape) continue;
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.position.z = 1.56;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

function addImportedBuildings(
  root: THREE.Group,
  obstacles: AirportConfig["obstacles"],
  facilities: AirportConfig["surfaceGraph"]["passengerFacilities"],
): void {
  const facilityFootprints = matchPassengerFacilityFootprints(
    obstacles,
    facilities,
  );
  const terminalMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.terminal,
    roughness: 0.78,
  });
  const concourseMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9bfa8,
    roughness: 0.8,
  });
  const terminalRoofMaterial = new THREE.MeshStandardMaterial({
    color: 0xded5bf,
    roughness: 0.9,
  });
  const concourseRoofMaterial = new THREE.MeshStandardMaterial({
    color: 0xd2cab8,
    roughness: 0.92,
  });
  const buildingMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8ae98,
    roughness: 0.88,
  });
  for (const obstacle of obstacles) {
    if (obstacle.shape !== "polygon" || obstacle.kind === "control-tower")
      continue;
    const shape = shapeFromRings([obstacle.points]);
    if (!shape) continue;
    const facility = facilityFootprints.get(obstacle.id);
    const role =
      facility?.role ?? (obstacle.kind === "terminal" ? "terminal" : undefined);
    const height = role === "terminal" ? 4.6 : role === "concourse" ? 3.7 : 2.6;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      curveSegments: 1,
    });
    const material =
      role === "terminal"
        ? [terminalRoofMaterial, terminalMaterial]
        : role === "concourse"
          ? [concourseRoofMaterial, concourseMaterial]
          : buildingMaterial;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = facility
      ? `passenger-facility-footprint:${facility.facilityIds.join("+")}`
      : `airport-building:${obstacle.id}`;
    mesh.userData.obstacleId = obstacle.id;
    mesh.userData.passengerFacilityIds = facility?.facilityIds ?? [];
    mesh.userData.passengerFacilityRole = role ?? null;
    mesh.position.z = 1.64;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

function shapeFromRings(
  rings: Array<Array<[number, number]>>,
): THREE.Shape | null {
  const outer = rings[0];
  if (!outer || outer.length < 4) return null;
  const shape = new THREE.Shape();
  shape.moveTo(outer[0][0], outer[0][1]);
  for (let index = 1; index < outer.length; index += 1)
    shape.lineTo(outer[index][0], outer[index][1]);
  for (const ring of rings.slice(1)) {
    if (ring.length < 4) continue;
    const hole = new THREE.Path();
    hole.moveTo(ring[0][0], ring[0][1]);
    for (let index = 1; index < ring.length; index += 1)
      hole.lineTo(ring[index][0], ring[index][1]);
    shape.holes.push(hole);
  }
  return shape;
}

function createRunwayLabel(label: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(244, 244, 234, 0.94)";
    context.font = "800 34px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(label.length > 2 ? 5.4 : 4.6, 2.05, 1);
  sprite.renderOrder = 3;
  return sprite;
}

function buildDetails(
  root: THREE.Group,
  config: AirportConfig,
  lowDetail: boolean,
): THREE.Object3D[] {
  const sway: THREE.Object3D[] = [];
  const treeDark =
    config.terrain === "woodland"
      ? 0x3f604c
      : config.terrain === "highland"
        ? 0x666b55
        : 0x698169;
  const treeLight =
    config.terrain === "woodland"
      ? 0x5e7958
      : config.terrain === "highland"
        ? 0x85866a
        : 0x8fa079;
  const treeMaterial = new THREE.MeshStandardMaterial({
    color: treeDark,
    roughness: 1,
  });
  const treeLightMaterial = new THREE.MeshStandardMaterial({
    color: treeLight,
    roughness: 1,
  });
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d6351,
    roughness: 1,
  });
  const treeCount = lowDetail
    ? Math.max(8, Math.floor(config.treeCount * 0.45))
    : config.treeCount;
  const trunkInstances = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.34, 0.52, 3.5, 6),
    trunkMaterial,
    treeCount,
  );
  const darkCount = Math.floor((treeCount * 2) / 3);
  const lightCount = treeCount - darkCount;
  const crownGeometry = new THREE.IcosahedronGeometry(1, lowDetail ? 0 : 1);
  const darkCrowns = new THREE.InstancedMesh(
    crownGeometry,
    treeMaterial,
    darkCount,
  );
  const lightCrowns = new THREE.InstancedMesh(
    crownGeometry.clone(),
    treeLightMaterial,
    lightCount,
  );
  const dummy = new THREE.Object3D();
  let darkIndex = 0;
  let lightIndex = 0;

  for (let index = 0; index < treeCount; index += 1) {
    const placement = treePlacement(config, index, treeCount);
    const { x, y } = placement;
    dummy.position.set(x, y, 2.95);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trunkInstances.setMatrixAt(index, dummy.matrix);
    const crownScale = placement.crownScale;
    dummy.position.set(x, y, 5.6);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(crownScale, crownScale, crownScale * 1.22);
    dummy.updateMatrix();
    if (index % 3) darkCrowns.setMatrixAt(darkIndex++, dummy.matrix);
    else lightCrowns.setMatrixAt(lightIndex++, dummy.matrix);
  }
  darkCrowns.castShadow = !lowDetail;
  lightCrowns.castShadow = !lowDetail;
  root.add(trunkInstances, darkCrowns, lightCrowns);

  const reedCount = config.code === "ORD" ? 0 : lowDetail ? 18 : 70;
  const reedMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b916d,
    roughness: 1,
  });
  const reeds = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.04, 0.08, 1, 4),
    reedMaterial,
    reedCount,
  );
  for (let index = 0; index < reedCount; index += 1) {
    const angle = index * 2.399;
    const radius = 74 + (index % 10) * 1.5;
    const height = 1.8 + (index % 3) * 0.4;
    dummy.position.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius * 0.74,
      0.7 + height / 2,
    );
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.scale.set(1, height, 1);
    dummy.updateMatrix();
    reeds.setMatrixAt(index, dummy.matrix);
  }
  root.add(reeds);

  const windsock = new THREE.Group();
  windsock.position.set(45, 28, 2);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xc4bba8 }),
  );
  pole.rotation.x = Math.PI / 2;
  pole.position.z = 4;
  windsock.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 4.6, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xd98b78, side: THREE.DoubleSide }),
  );
  sock.rotation.z = -Math.PI / 2;
  sock.position.set(2.2, 0, 7.7);
  windsock.add(sock);
  root.add(windsock);
  sway.push(sock);

  return sway;
}

function buildClouds(scene: THREE.Scene, lowDetail: boolean): THREE.Group[] {
  const clouds: THREE.Group[] = [];
  for (let index = 0; index < (lowDetail ? 2 : 4); index += 1) {
    const cloud = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: 0xf4f0e8,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    for (let part = 0; part < 5; part += 1) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(6 + part * 0.8, 16, 10),
        material,
      );
      puff.position.set(
        part * 8 - 15,
        Math.sin(part) * 4,
        Math.cos(part * 1.8) * 2,
      );
      puff.scale.z = 0.42;
      cloud.add(puff);
    }
    cloud.position.set(
      -145 + index * 86,
      index % 2 ? 102 : -108,
      78 + index * 5,
    );
    scene.add(cloud);
    clouds.push(cloud);
  }
  return clouds;
}

function buildRain(
  scene: THREE.Scene,
  seed: number,
  lowDetail: boolean,
): THREE.Points {
  const count = lowDetail ? 180 : 420;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const first = Math.sin(seed * 0.17 + index * 12.9898) * 43758.5453;
    const second = Math.sin(seed * 0.31 + index * 78.233) * 15731.743;
    const third = Math.sin(seed * 0.47 + index * 39.425) * 29731.119;
    positions[index * 3] = (first - Math.floor(first) - 0.5) * 500;
    positions[index * 3 + 1] = (second - Math.floor(second) - 0.5) * 360;
    positions[index * 3 + 2] = 8 + (third - Math.floor(third)) * 92;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xc9e1e4,
      size: 0.75,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  rain.visible = false;
  scene.add(rain);
  return rain;
}

function updateRain(
  rain: THREE.Points,
  state: AirportState,
  delta: number,
): void {
  const presentation = weatherPresentation(state.weather);
  rain.visible = presentation.precipitation !== "none";
  if (!rain.visible) return;
  const material = rain.material as THREE.PointsMaterial;
  material.color.setHex(presentation.particleColor);
  material.size = presentation.particleSize;
  material.opacity = presentation.particleOpacity;
  const positions = rain.geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;
  const windTo = state.weather.windDirection + Math.PI;
  for (let index = 0; index < positions.count; index += 1) {
    let x =
      positions.getX(index) +
      Math.cos(windTo) *
        state.weather.windSpeed *
        delta *
        presentation.windDrift;
    let y =
      positions.getY(index) +
      Math.sin(windTo) *
        state.weather.windSpeed *
        delta *
        presentation.windDrift;
    let z = positions.getZ(index) - delta * presentation.fallSpeed;
    if (z < 0) z += 95;
    if (x > 250) x -= 500;
    if (x < -250) x += 500;
    if (y > 180) y -= 360;
    if (y < -180) y += 360;
    positions.setXYZ(index, x, y, z);
  }
  positions.needsUpdate = true;
}

function buildRipples(root: THREE.Group, config: AirportConfig): THREE.Mesh[] {
  void root;
  void config;
  return [];
}

function createFocusMarker(): THREE.Group {
  const group = new THREE.Group();
  group.name = "observer-focus-marker";
  group.visible = false;
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x89cee6,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 64),
    ringMaterial,
  );
  group.add(ring);
  const ticks = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.28, 0, 0),
      new THREE.Vector3(-0.82, 0, 0),
      new THREE.Vector3(0.82, 0, 0),
      new THREE.Vector3(1.28, 0, 0),
      new THREE.Vector3(0, -1.28, 0),
      new THREE.Vector3(0, -0.82, 0),
      new THREE.Vector3(0, 0.82, 0),
      new THREE.Vector3(0, 1.28, 0),
    ]),
    new THREE.LineBasicMaterial({
      color: 0x89cee6,
      transparent: true,
      opacity: 0.88,
    }),
  );
  group.add(ticks);
  return group;
}

function createServiceVehicle(type: ServiceVehicleType): ServiceVehicleVisual {
  const root = new THREE.Group();
  root.name = `service-vehicle-${type}`;
  const color = {
    "fuel-truck": 0xe7ded0,
    "water-truck": 0x71b7d2,
    "lavatory-truck": 0x8c9c7b,
    "baggage-cart": 0xd5a44e,
    "cargo-loader": 0xc7865c,
    "catering-truck": 0x8fafaa,
    "cleaning-van": 0x8ca6bd,
    "crew-van": 0x526b9e,
    "maintenance-van": 0xd7c46a,
    ambulance: 0xf2f0e8,
    "wildlife-response": 0x67884f,
    snowplow: 0xe6dfcf,
    "passenger-bus": 0xe0d4bd,
  }[type];
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.08,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x314443,
    roughness: 0.62,
    metalness: 0.12,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x668386,
    roughness: 0.34,
    metalness: 0.16,
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x202829,
    roughness: 0.94,
  });
  const longVehicle =
    type === "passenger-bus" ||
    type === "baggage-cart" || type === "snowplow";
  const length = longVehicle
    ? 2.35
    : type === "fuel-truck" ||
        type === "water-truck" ||
        type === "lavatory-truck" ||
        type === "catering-truck"
      ? 1.95
      : 1.65;
  const width = type === "passenger-bus" ? 0.78 : 0.72;
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(length, width, 0.22),
    dark,
  );
  chassis.position.z = 0.28;
  chassis.castShadow = true;
  root.add(chassis);
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(
      type === "passenger-bus" ? length * 0.9 : 0.62,
      width * 0.9,
      type === "passenger-bus" ? 0.72 : 0.58,
    ),
    bodyMaterial,
  );
  cab.position.set(
    type === "passenger-bus" ? 0 : length * 0.31,
    0,
    type === "passenger-bus" ? 0.68 : 0.59,
  );
  cab.castShadow = true;
  root.add(cab);
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, width * 0.7, 0.28),
    glass,
  );
  windshield.position.set(
    type === "passenger-bus" ? length * 0.46 : length * 0.31 + 0.32,
    0,
    type === "passenger-bus" ? 0.78 : 0.69,
  );
  root.add(windshield);

  if (
    type === "fuel-truck" ||
    type === "water-truck" ||
    type === "lavatory-truck"
  ) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 1.12, 14),
      bodyMaterial,
    );
    tank.rotation.z = Math.PI / 2;
    tank.position.set(-0.3, 0, 0.68);
    tank.castShadow = true;
    root.add(tank);
  } else if (type === "baggage-cart") {
    for (const x of [-0.2, -0.78]) {
      const cart = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, width * 0.84, 0.35),
        bodyMaterial,
      );
      cart.position.set(x, 0, 0.5);
      cart.castShadow = true;
      root.add(cart);
    }
  } else if (type === "cargo-loader") {
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, width * 1.05, 0.12),
      bodyMaterial,
    );
    platform.position.set(-0.22, 0, 0.82);
    root.add(platform);
    const lift = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.54), dark);
    lift.rotation.y = -0.5;
    lift.position.set(-0.18, 0, 0.56);
    root.add(lift);
  } else if (type === "catering-truck") {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, width * 0.94, 0.86),
      bodyMaterial,
    );
    box.position.set(-0.32, 0, 0.78);
    box.castShadow = true;
    root.add(box);
  } else if (
    type === "cleaning-van" ||
    type === "crew-van" ||
    type === "maintenance-van" ||
    type === "ambulance" ||
    type === "wildlife-response"
  ) {
    const van = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, width * 0.92, 0.64),
      bodyMaterial,
    );
    van.position.set(-0.28, 0, 0.64);
    van.castShadow = true;
    root.add(van);
  }

  addServiceVehicleIdentity(
    root,
    type,
    length,
    width,
    bodyMaterial,
    dark,
    glass,
  );

  const wheels: THREE.Mesh[] = [];
  for (const x of [-length * 0.32, length * 0.32]) {
    for (const y of [-width * 0.52, width * 0.52]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.13, 10),
        wheelMaterial,
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, y, 0.2);
      wheel.castShadow = true;
      root.add(wheel);
      wheels.push(wheel);
    }
  }
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshBasicMaterial({
      color: type === "ambulance" ? 0xe04f48 : 0xffb23b,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  beacon.position.set(length * 0.26, 0, type === "passenger-bus" ? 1.08 : 0.98);
  root.add(beacon);
  const workRig = createServiceVehicleWorkRig(type, bodyMaterial, dark);
  workRig.visible = false;
  root.add(workRig);
  return { poolKey: type, root, beacon, wheels, workRig, active: true };
}

/**
 * Compact, type-specific silhouettes for the ambient service fleet. The
 * operational route and stand-side position remain simulation-owned; these
 * meshes only make the already-authoritative service intent legible.
 */
function addServiceVehicleIdentity(
  root: THREE.Group,
  type: ServiceVehicleType,
  length: number,
  width: number,
  body: THREE.Material,
  dark: THREE.Material,
  glass: THREE.Material,
): void {
  if (type === "baggage-cart") {
    const drawbar = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.08, 0.08),
      dark,
    );
    drawbar.name = "baggage-tractor-drawbar";
    drawbar.position.set(length * 0.53, 0, 0.33);
    root.add(drawbar);
    for (const x of [-0.18, -0.78]) {
      const cover = new THREE.Mesh(
        new THREE.BoxGeometry(0.39, width * 0.72, 0.08),
        dark,
      );
      cover.name = "baggage-cart-lid";
      cover.position.set(x, 0, 0.72);
      root.add(cover);
    }
    return;
  }
  if (type === "fuel-truck") {
    const reel = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.045, 5, 10),
      dark,
    );
    reel.name = "fuel-hose-reel";
    reel.rotation.x = Math.PI / 2;
    reel.position.set(-0.78, -width * 0.46, 0.64);
    root.add(reel);
    return;
  }
  if (type === "water-truck") {
    const reel = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.035, 5, 10),
      dark,
    );
    reel.name = "potable-water-hose-reel";
    reel.rotation.x = Math.PI / 2;
    reel.position.set(-0.76, -width * 0.46, 0.64);
    root.add(reel);
    return;
  }
  if (type === "lavatory-truck") {
    const hose = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.045, 5, 10),
      dark,
    );
    hose.name = "lavatory-service-hose-reel";
    hose.rotation.x = Math.PI / 2;
    hose.position.set(-0.76, -width * 0.46, 0.62);
    root.add(hose);
    return;
  }
  if (type === "cargo-loader") {
    for (const y of [-width * 0.38, width * 0.38]) {
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.055, 0.06),
        dark,
      );
      brace.name = "cargo-loader-scissor-brace";
      brace.position.set(-0.22, y, 0.67);
      brace.rotation.y = y < 0 ? 0.62 : -0.62;
      root.add(brace);
    }
    return;
  }
  if (type === "catering-truck") {
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.035, 0.52),
      glass,
    );
    door.name = "catering-service-door";
    door.position.set(-0.82, -width * 0.49, 0.82);
    root.add(door);
    return;
  }
  if (type === "maintenance-van") {
    const rack = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, width * 0.72, 0.06),
      dark,
    );
    rack.name = "maintenance-roof-rack";
    rack.position.set(-0.25, 0, 1.0);
    root.add(rack);
    return;
  }
  if (type === "wildlife-response") {
    const cage = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, width * 0.72, 0.28),
      dark,
    );
    cage.name = "wildlife-response-equipment-cage";
    cage.position.set(-0.26, 0, 0.98);
    root.add(cage);
    const beacon = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.2, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xffc248, toneMapped: false }),
    );
    beacon.name = "wildlife-response-amber-beacon";
    beacon.position.set(-0.16, 0, 1.17);
    root.add(beacon);
    return;
  }
  if (type === "snowplow") {
    const plow = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, width * 1.62, 0.28),
      dark,
    );
    plow.name = "snowplow-blade";
    plow.position.set(length * 0.55, 0, 0.38);
    plow.rotation.z = 0.16;
    root.add(plow);
    const saltBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, width * 0.94, 0.34),
      body,
    );
    saltBox.name = "snowplow-spreader";
    saltBox.position.set(-0.42, 0, 0.78);
    root.add(saltBox);
    return;
  }
  if (type === "crew-van") {
    const placard = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, width * 1.01, 0.16),
      glass,
    );
    placard.name = "crew-van-dispatch-placard";
    placard.position.set(-0.34, 0, 0.84);
    root.add(placard);
    return;
  }
  if (type === "ambulance") {
    const emergencyRed = new THREE.MeshBasicMaterial({
      color: 0xe04f48,
      toneMapped: false,
    });
    const emergencyBlue = new THREE.MeshBasicMaterial({
      color: 0x4f9ee8,
      toneMapped: false,
    });
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.94, width * 1.01, 0.1),
      emergencyRed,
    );
    stripe.name = "ambulance-red-stripe";
    stripe.position.set(-0.28, 0, 0.7);
    root.add(stripe);
    for (const [y, material] of [
      [-0.18, emergencyRed],
      [0.18, emergencyBlue],
    ] as const) {
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.16, 0.09),
        material,
      );
      light.name = y < 0 ? "ambulance-red-beacon" : "ambulance-blue-beacon";
      light.position.set(-0.22, y, 1.03);
      root.add(light);
    }
    return;
  }
  if (type === "cleaning-van") {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.94, width * 1.01, 0.09),
      dark,
    );
    stripe.name = "cleaning-van-service-stripe";
    stripe.position.set(-0.28, 0, 0.72);
    root.add(stripe);
    return;
  }
  if (type === "passenger-bus") {
    const windows = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.24, 0.025, 0.25),
      glass,
      6,
    );
    windows.name = "passenger-bus-window-row";
    const dummy = new THREE.Object3D();
    for (let index = 0; index < 6; index += 1) {
      dummy.position.set(
        -length * 0.28 + index * (length * 0.112),
        -width * 0.47,
        0.8,
      );
      dummy.updateMatrix();
      windows.setMatrixAt(index, dummy.matrix);
    }
    windows.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    windows.computeBoundingSphere();
    root.add(windows);
  }
}

function createServiceVehicleWorkRig(
  type: ServiceVehicleType,
  body: THREE.Material,
  dark: THREE.Material,
): THREE.Group {
  const rig = new THREE.Group();
  rig.name = `${type}-service-rig`;
  const workLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd77c, toneMapped: false }),
  );
  workLight.name = "service-work-light";
  workLight.position.set(0.36, 0, 1.02);
  rig.add(workLight);
  if (type === "fuel-truck") {
    const hose = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.035, 5, 12, Math.PI),
      dark,
    );
    hose.name = "fueling-hose-connected";
    hose.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    hose.position.set(-0.76, 0.44, 0.62);
    rig.add(hose);
  } else if (type === "water-truck" || type === "lavatory-truck") {
    const hose = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.03, 5, 12, Math.PI),
      dark,
    );
    hose.name =
      type === "water-truck"
        ? "potable-water-hose-connected"
        : "lavatory-service-hose-connected";
    hose.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    hose.position.set(-0.74, 0.4, 0.62);
    rig.add(hose);
  } else if (type === "cargo-loader") {
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.72, 0.1),
      body,
    );
    platform.name = "cargo-loader-raised-platform";
    platform.position.set(-0.3, 0, 1.23);
    rig.add(platform);
  } else if (type === "catering-truck") {
    for (let step = 0; step < 3; step += 1) {
      const stair = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.52, 0.12),
        body,
      );
      stair.name = "catering-service-step";
      stair.position.set(-0.96 - step * 0.17, 0, 0.35 + step * 0.12);
      rig.add(stair);
    }
  } else if (type === "baggage-cart") {
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.52, 0.1), dark);
    belt.name = "baggage-cart-open-belt";
    belt.position.set(-0.48, 0, 0.76);
    rig.add(belt);
  } else if (type === "crew-van") {
    const dispatchCase = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.22, 0.18),
      body,
    );
    dispatchCase.name = "crew-van-dispatch-case";
    dispatchCase.position.set(-0.7, 0.34, 0.45);
    rig.add(dispatchCase);
  }
  return rig;
}

function positionFlight(
  visual: FlightVisual,
  flight: Flight,
  config: AirportConfig,
  elapsed: number,
  delta: number,
  nightMix: number,
): void {
  // The orthographic camera has no natural perspective scaling. Gently scale
  // aircraft down through final approach to preserve the visual cue of descent.
  const approachDescent =
    flight.phase === "approach" && !flight.diversion
      ? THREE.MathUtils.smoothstep(flight.progress, 0.06, 0.96)
      : 1;
  const takeoffClimb =
    flight.phase === "takeoff"
      ? THREE.MathUtils.smoothstep(flight.progress, 0.34, 0.92)
      : 0;
  const presentationScale =
    flight.phase === "approach" && !flight.diversion
      ? THREE.MathUtils.lerp(
          visual.baseScale * 1.3,
          visual.baseScale,
          approachDescent,
        )
      : flight.phase === "takeoff"
        ? THREE.MathUtils.lerp(
            visual.baseScale,
            visual.baseScale * 1.22,
            takeoffClimb,
          )
        : visual.baseScale;
  visual.root.scale.setScalar(presentationScale);
  const motion = flight.motion;
  const point = visual.routePoint;
  const tangent = visual.routeTangent;
  point.set(motion.x, motion.y, motion.z);
  tangent.set(Math.cos(motion.heading), Math.sin(motion.heading), 0);
  visual.root.position.copy(point);
  const modelScale = visual.root.scale.x;
  const wheelOnSurfaceLift = Math.max(0.3, 1.29 * modelScale - 0.32);
  const isTaxiing =
    flight.phase === "taxi-in" ||
    flight.phase === "resting" ||
    flight.phase === "taxi-out";
  const groundFactor = motion.groundBlend;
  const presentationPitch = flightPresentationPitch(flight, motion);
  if (isTaxiing) {
    // Taxi route points describe the pavement centerline, not aircraft altitude.
    // Clamp the lowest wheel to the taxi/apron surface so a taxiing plane can
    // never inherit an airborne height from its previous route.
    const taxiSurface = 1.64;
    const lowestWheelFromRoot = (1.08 + 0.24) * modelScale;
    visual.root.position.z = taxiSurface + lowestWheelFromRoot;
    tangent.z = 0;
    tangent.normalize();
  } else {
    // Motion altitude describes the track beneath the aircraft. Keep the
    // airframe's wheel-to-root offset present both in flight and on the ground
    // so the flare does not visually dive toward the runway as contact blends.
    visual.root.position.z += wheelOnSurfaceLift;
    // Pitch the airframe around the main gear instead of its center. Without
    // this contact correction, the main wheels sink into the runway during
    // flare and the aircraft can read as if it is rotating nose-down.
    visual.root.position.z +=
      mainGearContactLift(flight, presentationPitch, modelScale) * groundFactor;
  }
  const targetHeading = motion.heading;
  if (!visual.poseInitialized) {
    visual.renderedHeading = targetHeading;
    visual.poseInitialized = true;
  } else {
    visual.renderedHeading = dampAngle(
      visual.renderedHeading,
      targetHeading,
      motion.onGround ? 10 : 8,
      delta,
    );
  }
  const airborne = !motion.onGround;
  for (const caster of visual.shadowCasters) caster.castShadow = airborne;
  visual.gear.visible =
    (flight.phase === "approach" &&
      !flight.diversion &&
      flight.progress > 0.72) ||
    flight.phase === "landing" ||
    flight.phase === "taxi-in" ||
    flight.phase === "resting" ||
    flight.phase === "taxi-out" ||
    (flight.phase === "takeoff" &&
      (motion.stage === "lineup" ||
        motion.stage === "takeoff-roll" ||
        motion.stage === "rotation" ||
        (motion.stage === "climbout" && motion.stageProgress < 0.28)));
  const airMotion = airborne ? Math.sin(elapsed * 0.8 + flight.id) * 0.018 : 0;
  applyAircraftOrientation(
    visual.root,
    visual.renderedHeading,
    presentationPitch,
    motion.bank + airMotion,
  );
  const visualAltitude = visual.root.position.z;
  const shadowSurface = isTaxiing ? 1.64 : 1.82;
  const heightAboveSurface = Math.max(0, visualAltitude - shadowSurface);
  const shadowOpacity = isTaxiing
    ? THREE.MathUtils.lerp(0.2, 0.27, nightMix)
    : THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(0.16, 0.21, nightMix) - heightAboveSurface * 0.018,
        0,
        0.21,
      );
  const shadowScale = 0.72 + Math.max(0, 16 - visualAltitude) * 0.018;
  // The shadow is parented beneath a scaled aircraft. Convert the desired
  // world-space contact height back into local space so it stays on pavement.
  visual.shadow.position.z = (shadowSurface - visualAltitude) / modelScale;
  visual.shadow.scale.set(1.9 * shadowScale, 0.7 * shadowScale, 1);
  visual.shadow.visible = shadowOpacity > 0.002;
  (visual.shadow.material as THREE.MeshBasicMaterial).opacity = shadowOpacity;
}

function flightPresentationPitch(
  flight: Flight,
  motion: FlightMotionState,
): number {
  if (flight.phase === "approach") {
    // Preserve the six-degree final-approach attitude. The landing phase then
    // raises the nose smoothly to ten degrees at main-gear contact.
    return motion.pitch * (APPROACH_PRESENTATION_PITCH / 0.105);
  }
  if (flight.phase !== "landing") return motion.pitch;
  if (motion.stage === "flare") {
    return THREE.MathUtils.lerp(
      APPROACH_PRESENTATION_PITCH,
      TOUCHDOWN_PRESENTATION_PITCH,
      THREE.MathUtils.smootherstep(motion.stageProgress, 0, 1),
    );
  }
  if (motion.stage === "touchdown") return TOUCHDOWN_PRESENTATION_PITCH;
  if (motion.stage === "rollout") {
    // Hold the nose off for a beat after the mains touch, then lower the nose
    // wheel progressively as braking settles the aircraft onto the runway.
    const noseGearContact = THREE.MathUtils.smootherstep(
      motion.stageProgress,
      0.14,
      0.56,
    );
    return TOUCHDOWN_PRESENTATION_PITCH * (1 - noseGearContact);
  }
  return 0;
}

function mainGearContactLift(
  flight: Flight,
  pitch: number,
  modelScale: number,
): number {
  if (pitch <= 0) return 0;
  const bodyLength = aircraftProfile(flight.aircraft).visual.bodyLength;
  const mainGearX = -bodyLength * 0.18;
  const wheelCenterZ = -1.08;
  const wheelRadius = 0.24;
  const levelContactDepth = -wheelCenterZ + wheelRadius;
  const pitchedWheelBottom =
    Math.sin(pitch) * mainGearX + Math.cos(pitch) * wheelCenterZ - wheelRadius;
  return Math.max(0, (-pitchedWheelBottom - levelContactDepth) * modelScale);
}

function addHoldShortMarkings(
  root: THREE.Group,
  config: AirportConfig,
  unitBox: THREE.BoxGeometry,
): void {
  const transforms: BoxInstanceTransform[] = [];
  const addTransform = (
    runway: RunwayConfig,
    point: THREE.Vector3,
    x: number,
    y: number,
    width: number,
    depth: number,
  ): void => {
    const alongX = Math.cos(runway.heading);
    const alongY = Math.sin(runway.heading);
    const acrossX = -alongY;
    const acrossY = alongX;
    transforms.push({
      x: point.x + alongX * x + acrossX * y,
      y: point.y + alongY * x + acrossY * y,
      z: 2.18,
      width,
      depth,
      height: 0.045,
      rotation: runway.heading,
    });
  };
  for (const node of config.surfaceGraph.nodes.filter(
    (item) => item.kind === "hold-short",
  )) {
    const runway =
      node.runwayId === undefined ? undefined : config.runways[node.runwayId];
    if (!runway) continue;
    const point = new THREE.Vector3(node.position[0], node.position[1], 2.18);
    for (const x of [-1.05, -0.55])
      addTransform(runway, point, x, 0, 0.18, 8.4);
    for (const x of [0.55, 1.05]) {
      for (const y of [-3.2, -1.05, 1.05, 3.2])
        addTransform(runway, point, x, y, 0.18, 1.3);
    }
  }
  if (!transforms.length) return;
  const yellow = new THREE.MeshBasicMaterial({
    color: 0xf2c84b,
    depthWrite: false,
  });
  root.add(createBoxInstances(unitBox, yellow, transforms));
}

function dampAngle(
  current: number,
  target: number,
  smoothing: number,
  delta: number,
): number {
  const difference = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + difference * (1 - Math.exp(-smoothing * Math.max(0, delta)));
}

function addTaxiNetwork(
  root: THREE.Group,
  graph: AirportConfig["surfaceGraph"],
  material: THREE.Material,
): void {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const positions: number[] = [];
  const indices: number[] = [];
  const intersectionRadius = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.kind === "runway") continue;
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) continue;
    const x = to.position[0] - from.position[0];
    const y = to.position[1] - from.position[1];
    const length = Math.hypot(x, y);
    if (length <= 0.001) continue;
    const normalX = ((-y / length) * edge.width) / 2;
    const normalY = ((x / length) * edge.width) / 2;
    const base = positions.length / 3;
    positions.push(
      from.position[0] + normalX,
      from.position[1] + normalY,
      1.62,
      from.position[0] - normalX,
      from.position[1] - normalY,
      1.62,
      to.position[0] + normalX,
      to.position[1] + normalY,
      1.62,
      to.position[0] - normalX,
      to.position[1] - normalY,
      1.62,
    );
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    intersectionRadius.set(
      from.id,
      Math.max(intersectionRadius.get(from.id) ?? 0, edge.width / 2),
    );
    intersectionRadius.set(
      to.id,
      Math.max(intersectionRadius.get(to.id) ?? 0, edge.width / 2),
    );
  }
  for (const node of graph.nodes.filter(
    (item) => item.kind === "intersection",
  )) {
    const radius = intersectionRadius.get(node.id);
    if (!radius) continue;
    const base = positions.length / 3;
    positions.push(node.position[0], node.position[1], 1.621);
    const sides = 8;
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      positions.push(
        node.position[0] + Math.cos(angle) * radius,
        node.position[1] + Math.sin(angle) * radius,
        1.621,
      );
    }
    for (let side = 0; side < sides; side += 1)
      indices.push(base, base + 1 + side, base + 1 + ((side + 1) % sides));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const taxi = new THREE.Mesh(geometry, material);
  taxi.receiveShadow = true;
  root.add(taxi);
}

function createMapLabel(
  label: string,
  tone: "taxiway" | "zone" | "hotspot",
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  const colors =
    tone === "hotspot"
      ? {
          background: "rgba(70, 31, 31, 0.92)",
          border: "rgba(240, 150, 140, 0.92)",
          text: "#ffe5dc",
        }
      : tone === "zone"
        ? {
            background: "rgba(26, 57, 60, 0.84)",
            border: "rgba(141, 190, 177, 0.7)",
            text: "#e5f2e8",
          }
        : {
            background: "rgba(24, 49, 51, 0.92)",
            border: "rgba(238, 194, 103, 0.86)",
            text: "#fff0c6",
          };
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = colors.background;
    context.strokeStyle = colors.border;
    context.lineWidth = 4;
    context.beginPath();
    context.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 12);
    context.fill();
    context.stroke();
    context.fillStyle = colors.text;
    context.font =
      tone === "taxiway"
        ? "800 38px Arial, sans-serif"
        : "700 24px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const copy = label.length > 24 ? `${label.slice(0, 22)}…` : label;
    context.fillText(copy, canvas.width / 2, canvas.height / 2 + 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  const width =
    tone === "taxiway" ? 5.4 : Math.min(14, Math.max(7, label.length * 0.5));
  sprite.scale.set(width, tone === "taxiway" ? 1.55 : 2.15, 1);
  sprite.renderOrder = 9;
  return sprite;
}

function addPassengerFacilityLabels(
  root: THREE.Group,
  facilities: AirportConfig["surfaceGraph"]["passengerFacilities"],
): THREE.Group | null {
  if (!facilities.length) return null;
  const group = new THREE.Group();
  group.name = "passenger-facilities";
  group.visible = false;
  for (const facility of facilities) {
    const terminal = facility.kind === "terminal";
    const canvas = document.createElement("canvas");
    canvas.width = terminal ? 192 : 96;
    canvas.height = 72;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = terminal
        ? "rgba(19, 49, 51, 0.82)"
        : "rgba(237, 220, 184, 0.88)";
      context.strokeStyle = terminal
        ? "rgba(238, 194, 103, 0.82)"
        : "rgba(34, 68, 68, 0.72)";
      context.lineWidth = 3;
      context.beginPath();
      context.roundRect(
        3,
        3,
        canvas.width - 6,
        canvas.height - 6,
        terminal ? 14 : 24,
      );
      context.fill();
      context.stroke();
      context.fillStyle = terminal ? "#fff0c6" : "#173d3e";
      context.font = terminal
        ? "800 30px Arial, sans-serif"
        : "900 42px Arial, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(
        terminal ? facility.terminalId : (facility.concourse ?? facility.name),
        canvas.width / 2,
        canvas.height / 2 + 1,
      );
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      }),
    );
    sprite.position.set(
      facility.center[0],
      facility.center[1],
      terminal ? 8.7 : 7.8,
    );
    sprite.scale.set(terminal ? 5.2 : 2.6, terminal ? 1.95 : 1.95, 1);
    sprite.renderOrder = 8;
    sprite.userData.facilityId = facility.id;
    group.add(sprite);
  }
  root.add(group);
  return group;
}

function addSurfaceMapLayers(
  root: THREE.Group,
  config: AirportConfig,
): Omit<
  Record<SurfaceLayer, THREE.Group>,
  "protection-zones" | "movement-projections"
> {
  const graph = config.surfaceGraph;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const taxiwayLabels = new THREE.Group();
  taxiwayLabels.name = "surface-layer-taxiway-labels";
  const operationalZones = new THREE.Group();
  operationalZones.name = "surface-layer-operational-zones";
  const hotspots = new THREE.Group();
  hotspots.name = "surface-layer-hotspots";
  const airportBoundary = new THREE.Group();
  airportBoundary.name = "surface-layer-airport-boundary";

  const taxiwaysByReference = new Map<string, typeof graph.taxiways>();
  for (const taxiway of graph.taxiways) {
    const reference = taxiway.reference?.trim().toUpperCase();
    if (!reference || !/^[A-Z]$/.test(reference)) continue;
    const entries = taxiwaysByReference.get(reference) ?? [];
    entries.push(taxiway);
    taxiwaysByReference.set(reference, entries);
  }
  for (const [reference, taxiways] of taxiwaysByReference) {
    const edgeIds = new Set(taxiways.flatMap((taxiway) => taxiway.edgeIds));
    const midpoints = [...edgeIds].flatMap((edgeId) => {
      const edge = edgeById.get(edgeId);
      const from = edge ? nodeById.get(edge.from) : undefined;
      const to = edge ? nodeById.get(edge.to) : undefined;
      return from && to
        ? [
            [
              (from.position[0] + to.position[0]) / 2,
              (from.position[1] + to.position[1]) / 2,
            ] as [number, number],
          ]
        : [];
    });
    if (!midpoints.length) continue;
    const center: [number, number] = [
      midpoints.reduce((sum, point) => sum + point[0], 0) / midpoints.length,
      midpoints.reduce((sum, point) => sum + point[1], 0) / midpoints.length,
    ];
    const position = midpoints.reduce((nearest, point) =>
      distance2(point, center) < distance2(nearest, center) ? point : nearest,
    );
    const label = createMapLabel(reference, "taxiway");
    label.position.set(position[0], position[1], 3.2);
    taxiwayLabels.add(label);
  }

  const zonePalette: Record<string, number> = {
    "terminal-complex": 0x89b7b0,
    "terminal-apron": 0xa7c9bd,
    "cargo-ramp": 0xa590bc,
    "general-aviation": 0x80a7c5,
    "deicing-pad": 0x8cb8ca,
    "holding-pad": 0xc3a975,
    maintenance: 0xa8927b,
    "remote-ramp": 0x8aa18b,
    "perimeter-route": 0x718f91,
  };
  for (const zone of graph.zones) {
    const shape = shapeFromRings(zone.rings);
    if (!shape) continue;
    const color = zonePalette[zone.kind] ?? COLORS.sage;
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.19,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.z = 1.96;
    mesh.renderOrder = 5;
    operationalZones.add(mesh);
    const center = ringCenter(zone.rings[0]);
    const label = createMapLabel(zone.name, "zone");
    label.position.set(center[0], center[1], 3.5);
    operationalZones.add(label);
  }

  for (const hotspot of graph.hotspots) {
    const shape = shapeFromRings(hotspot.rings);
    if (!shape) continue;
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({
        color: COLORS.rose,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.z = 2.04;
    mesh.renderOrder = 7;
    hotspots.add(mesh);
    const center = ringCenter(hotspot.rings[0]);
    const label = createMapLabel(hotspot.label, "hotspot");
    label.position.set(center[0], center[1], 3.8);
    hotspots.add(label);
  }

  taxiwayLabels.visible = false;
  operationalZones.visible = false;
  hotspots.visible = false;
  airportBoundary.visible = false;
  root.add(operationalZones, hotspots, taxiwayLabels, airportBoundary);
  return {
    "taxiway-labels": taxiwayLabels,
    "operational-zones": operationalZones,
    hotspots,
    "airport-boundary": airportBoundary,
  };
}

function ringCenter(ring: Array<[number, number]>): [number, number] {
  if (!ring.length) return [0, 0];
  const unique =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  if (!unique.length) return [0, 0];
  return [
    unique.reduce((sum, point) => sum + point[0], 0) / unique.length,
    unique.reduce((sum, point) => sum + point[1], 0) / unique.length,
  ];
}

function distance2(first: [number, number], second: [number, number]): number {
  return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) => material.dispose());
    } else if (child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) => material.dispose());
    } else if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  });
}

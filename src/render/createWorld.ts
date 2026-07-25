import * as THREE from 'three';
import type { AirportConfig, FlightColor, RunwayConfig, RunwayOperationalRole } from '../simulation/airportConfig';
import { aircraftProfile } from '../simulation/aircraftProfiles';
import { airlineProfile } from '../simulation/airlineProfiles';
import type { AirportState, Flight, FlightMotionState, ServiceVehicleType } from '../simulation/types';
import { applyAircraftOrientation } from './aircraftOrientation';
import { createAirportContext, type AirportContextDiagnostics } from './airportContext';
import { treePlacement } from './sceneryPlacement';
import { updateSurfaceDisruptionVisuals } from './surfaceDisruptionVisuals';
import { createAirspaceOverlay, type AirspaceLayer } from './airspaceOverlay';
export type { AirspaceLayer } from './airspaceOverlay';

type FlightVisual = {
  poolKey: string;
  root: THREE.Group;
  baseScale: number;
  shadow: THREE.Mesh;
  gear: THREE.Group;
  tug: THREE.Group;
  tugBeacon: THREE.Mesh;
  propellers: THREE.Object3D[];
  engineIndicators: THREE.Mesh[];
  navLights: THREE.Mesh[];
  landingLamp: THREE.Mesh;
  landingLight: THREE.PointLight;
  shadowCasters: THREE.Mesh[];
  contrail: THREE.Line;
  deicingSpray: THREE.Group;
  beacon: THREE.PointLight;
  halo: THREE.Mesh;
  routePoint: THREE.Vector3;
  routeTangent: THREE.Vector3;
  renderedHeading: number;
  poseInitialized: boolean;
  active: boolean;
};

const APPROACH_PRESENTATION_PITCH = THREE.MathUtils.degToRad(6);
const TOUCHDOWN_PRESENTATION_PITCH = THREE.MathUtils.degToRad(10);

type RunwayLight = {
  mesh: THREE.Mesh;
  dayOpacity: number;
  nightOpacity: number;
  phase: number;
  runwayId: number;
  activeEnd?: -1 | 1;
  roles?: RunwayOperationalRole[];
};

type ServiceVehicleVisual = {
  poolKey: ServiceVehicleType;
  root: THREE.Group;
  beacon: THREE.Mesh;
  wheels: THREE.Mesh[];
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
  runwayVisuals: RunwayVisual[];
  surfaceLayers: Record<SurfaceLayer, THREE.Group>;
};

export type SurfaceLayer = 'taxiway-labels' | 'operational-zones' | 'hotspots' | 'airport-boundary';

export type WorldDiagnostics = {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  detail: 'low' | 'high';
  pooledAircraft: number;
  activeServiceVehicles: number;
  heldServiceVehicles: number;
  pooledServiceVehicles: number;
  serviceVehiclesVisible: boolean;
  attachedTugs: number;
  startingEngines: number;
  passengerFacilities: number;
  surfaceDisruptions: {
    total: number;
    pending: number;
    active: number;
    recovering: number;
  };
  camera: {
    focusX: number;
    focusY: number;
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
  context: AirportContextDiagnostics | { status: 'procedural' };
};

export interface AirportWorld {
  update(state: AirportState, delta: number): void;
  nextView(): void;
  pickFlight(clientX: number, clientY: number): number | null;
  pickRunway(clientX: number, clientY: number): number | null;
  selectFlight(id: number | null): void;
  flightScreenPosition(id: number): { x: number; y: number } | null;
  flightAttitude(id: number): { headingDegrees: number; noseUpDegrees: number } | null;
  mapMetrics(): { northDegrees: number; scaleMeters: number; scalePixels: number };
  zoomIn(): void;
  zoomOut(): void;
  panByScreen(horizontal: number, vertical: number): void;
  rotateBy(direction: -1 | 1): void;
  resetCamera(): void;
  setRunwayLabelsVisible(visible: boolean): void;
  setServiceVehiclesVisible(visible: boolean): void;
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

export function createWorld(canvas: HTMLCanvasElement, config: AirportConfig): AirportWorld {
  const requestedDetail = new URLSearchParams(window.location.search).get('detail');
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const lowDetail = requestedDetail === 'low' || (requestedDetail !== 'high' && (window.innerWidth < 720 || deviceMemory <= 4));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowDetail ? 1.2 : 1.75));
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
  buildLandscape(world, config, landscape);
  const contextRuntime = config.contextData
    ? createAirportContext(world, config.contextData, config.vectorData?.runtimeReference.worldMetersPerUnit ?? 38)
    : null;
  const airportBuild = buildAirport(world, config);
  const airspaceOverlay = createAirspaceOverlay(config);
  world.add(airspaceOverlay.root);
  if (contextRuntime) {
    world.remove(airportBuild.surfaceLayers['airport-boundary']);
    airportBuild.surfaceLayers['airport-boundary'] = contextRuntime.boundaryLayer;
  }
  const runwayLights = airportBuild.runwayLights;
  const disruptionLayer = new THREE.Group();
  disruptionLayer.name = 'surface-disruptions';
  world.add(disruptionLayer);
  const disruptionVisuals = new Map<string, THREE.Group>();
  const swayingObjects = buildDetails(world, config, lowDetail);
  const clouds = buildClouds(scene, lowDetail);
  const rain = buildRain(scene, config.seed, lowDetail);
  const ripples = buildRipples(world, config);

  const flightVisuals = new Map<number, FlightVisual>();
  const flightPool = new Map<string, FlightVisual[]>();
  const serviceVehicleVisuals = new Map<string, ServiceVehicleVisual>();
  const serviceVehiclePool = new Map<ServiceVehicleType, ServiceVehicleVisual[]>();
  let selectedFlightId: number | null = null;
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
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.3);
  const zoomRaycaster = new THREE.Raycaster();
  const zoomNdc = new THREE.Vector2();
  const zoomGroundPoint = new THREE.Vector3();
  let nightMix = 0;
  let currentState: AirportState | null = null;
  let runwayLabelsVisible = false;
  let serviceVehiclesVisible = true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touchPoints = new Map<number, { x: number; y: number }>();
  const attitudeNose = new THREE.Vector3();
  let previousPinchDistance = 0;
  let previousPinchGround: THREE.Vector3 | null = null;
  let dragPointerId: number | null = null;
  let previousDragPoint: { x: number; y: number } | null = null;
  let dragHasMoved = false;
  let manualCameraActive = false;

  function updateProjection(): void {
    const aspect = viewportWidth / Math.max(1, viewportHeight);
    const baseSize = config.scope === 'center' ? (viewportWidth < 720 ? 116 : 104) : (viewportWidth < 720 ? 61 : 54);
    const size = baseSize * views[viewIndex].zoom * manualZoom;
    camera.left = -size * aspect;
    camera.right = size * aspect;
    camera.top = size;
    camera.bottom = -size;
    camera.updateProjectionMatrix();
  }

  function update(state: AirportState, delta: number): void {
    currentState = state;
    cameraTime += delta;
    const baseWeatherFog = state.weather.condition === 'fog' ? 0.0074 : state.weather.condition === 'snow' ? 0.0064 : state.weather.condition === 'rain' ? 0.0052 : 0.0032;
    const weatherFog = baseWeatherFog / Math.sqrt(Math.max(1, manualZoom));
    fog.density = THREE.MathUtils.lerp(fog.density, weatherFog, Math.min(1, delta * 0.9));
    nightMix = THREE.MathUtils.lerp(nightMix, state.nightMode ? 1 : 0, Math.min(1, delta * 2.2));
    const skyTarget = new THREE.Color(state.weather.condition === 'snow' ? 0x96a4a1 : state.weather.condition === 'rain' ? 0x627675 : state.weather.condition === 'fog' ? 0x89938c : COLORS.sky);
    skyTarget.lerp(new THREE.Color(state.weather.condition === 'fog' || state.weather.condition === 'snow' ? 0x28343b : 0x091b29), nightMix);
    (scene.background as THREE.Color).lerp(skyTarget, Math.min(1, delta * 0.6));
    fog.color.lerp(skyTarget, Math.min(1, delta * 0.6));
    sun.intensity = THREE.MathUtils.lerp(2.25, 0.5, nightMix);
    sun.color.setHex(state.nightMode ? 0xa8c6df : 0xffd6a3);
    hemisphere.intensity = THREE.MathUtils.lerp(1.45, 0.62, nightMix);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(0.94, 0.86, nightMix);
    for (let index = 0; index < runwayLights.length; index += 1) {
      const light = runwayLights[index];
      const activeEnd = state.activeRunwayEnds[light.runwayId] ?? config.runways[light.runwayId]?.landingEnd;
      const role = state.activeRunwayRoles[light.runwayId] ?? config.runways[light.runwayId]?.role ?? 'inactive';
      light.mesh.visible = role !== 'inactive'
        && (light.activeEnd === undefined || light.activeEnd === activeEnd)
        && (!light.roles || light.roles.includes(role));
      if (!light.mesh.visible) continue;
      const material = light.mesh.material as THREE.MeshBasicMaterial;
      const shimmer = Math.sin(state.elapsed * 2.4 + light.phase) * 0.035;
      material.opacity = THREE.MathUtils.clamp(THREE.MathUtils.lerp(light.dayOpacity, light.nightOpacity, nightMix) + shimmer * nightMix, 0.08, 1);
      light.mesh.scale.setScalar(THREE.MathUtils.lerp(0.82, 1.18, nightMix));
    }
    for (let index = 0; index < airportBuild.runwayVisuals.length; index += 1) {
      const runway = config.runways[index];
      const visual = airportBuild.runwayVisuals[index];
      const activeEnd = state.activeRunwayEnds[index] ?? runway.landingEnd;
      const role = state.activeRunwayRoles[index] ?? runway.role;
      visual.marker.position.x = activeEnd * (runway.length / 2 - 3.1);
      visual.marker.scale.x = activeEnd;
      const closed = state.surfaceDisruptions.some((disruption) => disruption.kind === 'runway-closure' && disruption.runwayId === index);
      const unavailable = state.surfaceDisruptions.some((disruption) => (
        disruption.runwayId === index && (disruption.kind === 'runway-closure' || disruption.kind === 'disabled-aircraft')
      ));
      visual.marker.visible = !unavailable && role !== 'inactive';
      visual.arrivalMarker.visible = role === 'arrival' || role === 'mixed';
      visual.departureMarker.visible = role === 'departure' || role === 'mixed';
      visual.closure.visible = closed;
      for (const label of visual.labels) label.visible = runwayLabelsVisible;
    }
    updateSurfaceDisruptionVisuals({
      state,
      graph: config.surfaceGraph,
      scope: config.scope,
      layer: disruptionLayer,
      visuals: disruptionVisuals,
      dispose: disposeObject,
    });
    airspaceOverlay.update(state, delta);
    updateRain(rain, state, delta);
    for (const visual of flightVisuals.values()) visual.active = false;

    for (const flight of state.flights) {
      let visual = flightVisuals.get(flight.id);
      if (!visual) {
        const poolKey = planePoolKey(flight);
        visual = flightPool.get(poolKey)?.pop() ?? createPlane(flight);
        visual.root.visible = true;
        visual.poseInitialized = false;
        if (config.scope === 'center') {
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
      visual.root.visible = flight.phase !== 'approach' || isNearViewportEdge(visual.root.position);
      visual.root.userData.engineState = flight.engineState;
      visual.tug.visible = flight.tugAttached;
      const tugPulse = 0.78 + Math.sin(state.elapsed * 8.2 + flight.id) * 0.22;
      visual.tugBeacon.scale.setScalar(0.82 + tugPulse * 0.5);
      (visual.tugBeacon.material as THREE.MeshBasicMaterial).opacity = tugPulse;
      const operationalSpool = flight.phase === 'takeoff' ? 28 : flight.phase === 'approach' || flight.phase === 'landing' ? 16 : 8;
      const spool = flight.engineState === 'off'
        ? 0
        : flight.engineState === 'starting'
          ? 3 + (0.5 + Math.sin(state.elapsed * 3.2 + flight.id) * 0.5) * 6
          : operationalSpool;
      for (const propeller of visual.propellers) propeller.rotation.z += delta * spool;
      const enginePulse = 0.5 + Math.sin(state.elapsed * 4.6 + flight.id * 0.8) * 0.5;
      for (const indicator of visual.engineIndicators) {
        const material = indicator.material as THREE.MeshBasicMaterial;
        indicator.visible = flight.engineState !== 'off';
        material.color.setHex(flight.engineState === 'starting' ? 0xffb45f : 0x789c9a);
        material.opacity = flight.engineState === 'starting' ? 0.2 + enginePulse * 0.48 : 0.22;
        indicator.scale.setScalar(flight.engineState === 'starting' ? 0.88 + enginePulse * 0.18 : 1);
      }
      const strobe = flight.engineState !== 'off' && Math.sin(state.elapsed * 5.4 + flight.id * 0.7) > 0.72;
      for (const light of visual.navLights) {
        light.visible = nightMix > 0.02 || strobe;
        (light.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp(strobe ? 0.72 : 0.32, strobe ? 1 : 0.86, nightMix);
        light.scale.setScalar(strobe ? 1.55 : 1);
      }
      const aircraftBeacon = visual.navLights[visual.navLights.length - 1];
      aircraftBeacon.visible = flight.engineState !== 'off';
      (aircraftBeacon.material as THREE.MeshBasicMaterial).opacity = flight.engineState === 'starting' ? 0.45 + enginePulse * 0.55 : strobe ? 1 : 0.42;
      const landingLightsOn = flight.phase === 'approach'
        || flight.phase === 'landing'
        || (flight.phase === 'taxi-out' && flight.engineState === 'running' && !flight.tugAttached)
        || flight.phase === 'takeoff';
      visual.landingLamp.visible = landingLightsOn && nightMix > 0.02;
      visual.landingLight.intensity = landingLightsOn ? 3.8 * nightMix : 0;
      visual.beacon.intensity = flight.engineState === 'off'
        ? 0
        : (strobe ? 3.4 : flight.engineState === 'starting' ? 0.55 + enginePulse * 0.85 : 0.12) * THREE.MathUtils.lerp(0.45, 1.35, nightMix);
      updateContrail(visual, flight, state.elapsed);
      visual.deicingSpray.visible = flight.deicing.status === 'treating';
      if (visual.deicingSpray.visible) {
        const sprayPulse = 0.86 + Math.sin(state.elapsed * 7.2 + flight.id) * 0.14;
        visual.deicingSpray.scale.set(1, sprayPulse, sprayPulse);
        visual.deicingSpray.rotation.x = Math.sin(state.elapsed * 2.4 + flight.id) * 0.08;
      }
      visual.halo.visible = selectedFlightId === flight.id;
      visual.halo.scale.setScalar(1 + Math.sin(state.elapsed * 5) * 0.08);
    }

    for (const [id, visual] of flightVisuals) {
      if (!visual.active) {
        world.remove(visual.root);
        visual.root.visible = false;
        const pool = flightPool.get(visual.poolKey) ?? [];
        if (pool.length < 3) {
          pool.push(visual);
          flightPool.set(visual.poolKey, pool);
        } else disposeObject(visual.root);
        flightVisuals.delete(id);
      }
    }

    for (const visual of serviceVehicleVisuals.values()) visual.active = false;
    for (const vehicle of state.serviceVehicles) {
      if (vehicle.status === 'scheduled' || vehicle.status === 'complete') continue;
      let visual = serviceVehicleVisuals.get(vehicle.id);
      if (!visual) {
        visual = serviceVehiclePool.get(vehicle.type)?.pop() ?? createServiceVehicle(vehicle.type);
        visual.root.visible = serviceVehiclesVisible;
        visual.root.scale.setScalar(config.scope === 'center' ? 0.17 : 0.92);
        serviceVehicleVisuals.set(vehicle.id, visual);
        world.add(visual.root);
      }
      visual.active = true;
      visual.root.visible = serviceVehiclesVisible;
      visual.root.position.set(vehicle.x, vehicle.y, 1.64);
      visual.root.rotation.z = vehicle.heading;
      visual.root.userData.status = vehicle.status;
      visual.root.userData.held = vehicle.held;
      const beaconPulse = 0.45 + Math.sin(state.elapsed * 7.6 + vehicle.flightId) * 0.45;
      visual.beacon.visible = vehicle.status !== 'servicing';
      (visual.beacon.material as THREE.MeshBasicMaterial).opacity = vehicle.held ? 0.95 : 0.35 + beaconPulse * 0.55;
      visual.beacon.scale.setScalar(vehicle.held ? 1.45 : 0.9 + beaconPulse * 0.35);
      for (const wheel of visual.wheels) wheel.rotation.y -= delta * vehicle.groundSpeedMps * 3.4;
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
      item.rotation.x = Math.sin(state.elapsed * 0.45 + index * 0.71) * 0.025 * (0.45 + state.breeze);
    }

    for (let index = 0; index < clouds.length; index += 1) {
      const cloud = clouds[index];
      const windTo = state.weather.windDirection + Math.PI;
      const cloudSpeed = delta * (0.35 + state.weather.windSpeed * 0.045 + index * 0.05);
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

    const selected = selectedFlightId === null ? null : flightVisuals.get(selectedFlightId);
    if (selected && !manualCameraActive) {
      const follow = 1 - Math.exp(-delta * 2.8);
      cameraFocus.lerp(new THREE.Vector2(selected.root.position.x, selected.root.position.y), follow);
    }
    const drift = reducedMotion || manualCameraActive ? 0 : 1;
    applyCameraPose(drift);
    renderer.render(scene, camera);
  }

  function applyCameraPose(drift: number): void {
    const view = views[viewIndex];
    const overviewMix = THREE.MathUtils.smoothstep(manualZoom, 1.15, 2.6);
    const overviewRadius = Math.min(view.radius, camera.top * 0.12);
    const overviewHeight = Math.max(view.height, camera.top * 1.2 + 24);
    const cameraRadius = THREE.MathUtils.lerp(view.radius, overviewRadius, overviewMix);
    const cameraHeight = THREE.MathUtils.lerp(view.height, overviewHeight, overviewMix);
    const orbit = view.phase + manualOrbitOffset + Math.sin(cameraTime * 0.035) * 0.13 * drift;
    const targetX = cameraFocus.x + Math.sin(cameraTime * 0.021) * 5 * drift;
    const targetY = cameraFocus.y + Math.cos(cameraTime * 0.017) * 3 * drift;
    camera.position.set(
      cameraFocus.x + Math.cos(orbit) * cameraRadius,
      cameraFocus.y + Math.sin(orbit) * cameraRadius,
      cameraHeight,
    );
    camera.lookAt(targetX, targetY, 0);
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
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
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
      const hitRadius = config.scope === 'center' ? 30 : 44;
      if (distance < hitRadius && (!best || distance < best.distance)) best = { id, distance };
    }
    return best?.id ?? null;
  }

  function pickRunway(clientX: number, clientY: number): number | null {
    const thresholds = config.runways.map((runway) => runwayEnd(runway, currentState?.activeRunwayEnds[runway.id] ?? runway.landingEnd, 0, 2.2));
    let best: { runway: number; distance: number } | null = null;
    for (let index = 0; index < thresholds.length; index += 1) {
      const threshold = thresholds[index];
      const point = project(threshold);
      const distance = Math.hypot(point.x - clientX, point.y - clientY);
      if (distance < 76 && (!best || distance < best.distance)) best = { runway: index, distance };
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

  function groundPointAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = canvas.getBoundingClientRect();
    zoomNdc.set(
      (clientX - rect.left) / Math.max(1, rect.width) * 2 - 1,
      -(clientY - rect.top) / Math.max(1, rect.height) * 2 + 1,
    );
    zoomRaycaster.setFromCamera(zoomNdc, camera);
    return zoomRaycaster.ray.intersectPlane(groundPlane, zoomGroundPoint)?.clone() ?? null;
  }

  function moveCameraFocus(deltaX: number, deltaY: number): void {
    const previousX = cameraFocus.x;
    const previousY = cameraFocus.y;
    cameraFocus.x = THREE.MathUtils.clamp(cameraFocus.x + deltaX, -landscape.panX, landscape.panX);
    cameraFocus.y = THREE.MathUtils.clamp(cameraFocus.y + deltaY, -landscape.panY, landscape.panY);
    camera.position.x += cameraFocus.x - previousX;
    camera.position.y += cameraFocus.y - previousY;
    camera.updateMatrixWorld();
  }

  function panCameraByScreen(horizontal: number, vertical: number): void {
    if (!horizontal && !vertical) return;
    manualCameraActive = true;
    selectedFlightId = null;
    applyCameraPose(0);
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.min(110, Math.max(54, Math.min(rect.width, rect.height) * 0.11));
    const center = groundPointAt(centerX, centerY);
    const destination = groundPointAt(centerX + horizontal * distance, centerY + vertical * distance);
    if (center && destination) moveCameraFocus(destination.x - center.x, destination.y - center.y);
  }

  function rotateCamera(direction: -1 | 1): void {
    manualCameraActive = true;
    selectedFlightId = null;
    manualOrbitOffset = THREE.MathUtils.euclideanModulo(manualOrbitOffset + direction * Math.PI / 12, Math.PI * 2);
    applyCameraPose(0);
  }

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    manualCameraActive = true;
    const before = groundPointAt(event.clientX, event.clientY);
    const minimumZoom = config.scope === 'center' ? 0.08 : 0.12;
    manualZoom = THREE.MathUtils.clamp(manualZoom * Math.exp(event.deltaY * 0.0014), minimumZoom, 3);
    updateProjection();
    applyCameraPose(0);
    const after = groundPointAt(event.clientX, event.clientY);
    if (before && after) moveCameraFocus(before.x - after.x, before.y - after.y);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    } else if (event.button !== 0 && event.button !== 1) return;
    if (touchPoints.size === 2) {
      const [first, second] = [...touchPoints.values()];
      previousPinchDistance = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y));
      previousPinchGround = groundPointAt((first.x + second.x) / 2, (first.y + second.y) / 2);
      dragPointerId = null;
      previousDragPoint = null;
      dragHasMoved = false;
      manualCameraActive = true;
      canvas.classList.add('scene--panning');
      return;
    }
    const forcePan = event.pointerType !== 'touch' && event.button === 1;
    const pickedFlightId = pickFlight(event.clientX, event.clientY);
    const pickedFlight = pickedFlightId === null ? null : currentState?.flights.find((flight) => flight.id === pickedFlightId);
    const beginsManualArrivalRoute = pickedFlight?.phase === 'approach' && !pickedFlight.cleared;
    if (!forcePan && beginsManualArrivalRoute) return;
    dragPointerId = event.pointerId;
    previousDragPoint = { x: event.clientX, y: event.clientY };
    dragHasMoved = false;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic browser tests do not create an OS pointer to capture.
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && touchPoints.has(event.pointerId)) {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPoints.size === 2) {
        event.preventDefault();
        const [first, second] = [...touchPoints.values()];
        const distance = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y));
        const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        const minimumZoom = config.scope === 'center' ? 0.08 : 0.12;
        manualZoom = THREE.MathUtils.clamp(manualZoom * previousPinchDistance / distance, minimumZoom, 3);
        updateProjection();
        applyCameraPose(0);
        const nextGround = groundPointAt(midpoint.x, midpoint.y);
        if (previousPinchGround && nextGround) moveCameraFocus(previousPinchGround.x - nextGround.x, previousPinchGround.y - nextGround.y);
        previousPinchDistance = distance;
        previousPinchGround = groundPointAt(midpoint.x, midpoint.y);
        return;
      }
    }
    if (dragPointerId !== event.pointerId || !previousDragPoint) return;
    if (!dragHasMoved) {
      if (Math.hypot(event.clientX - previousDragPoint.x, event.clientY - previousDragPoint.y) < 3) return;
      dragHasMoved = true;
      manualCameraActive = true;
      canvas.classList.add('scene--panning');
    }
    event.preventDefault();
    const before = groundPointAt(previousDragPoint.x, previousDragPoint.y);
    const after = groundPointAt(event.clientX, event.clientY);
    if (before && after) moveCameraFocus(before.x - after.x, before.y - after.y);
    previousDragPoint = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') touchPoints.delete(event.pointerId);
    if (dragPointerId === event.pointerId) {
      dragPointerId = null;
      previousDragPoint = null;
      dragHasMoved = false;
    }
    if (touchPoints.size < 2) {
      previousPinchDistance = 0;
      previousPinchGround = null;
    }
    if (dragPointerId === null && touchPoints.size < 2) canvas.classList.remove('scene--panning');
  };

  function changeZoom(factor: number): void {
    manualCameraActive = true;
    const minimumZoom = config.scope === 'center' ? 0.08 : 0.12;
    manualZoom = THREE.MathUtils.clamp(manualZoom * factor, minimumZoom, 3);
    updateProjection();
    applyCameraPose(0);
  }

  function resetCamera(): void {
    manualZoom = 1;
    manualOrbitOffset = 0;
    cameraFocus.set(0, 0);
    selectedFlightId = null;
    manualCameraActive = false;
    updateProjection();
  }

  function flightAttitude(id: number): { headingDegrees: number; noseUpDegrees: number } | null {
    const visual = flightVisuals.get(id);
    if (!visual) return null;
    const nose = attitudeNose.set(1, 0, 0).applyQuaternion(visual.root.quaternion);
    return {
      headingDegrees: (THREE.MathUtils.radToDeg(Math.atan2(nose.y, nose.x)) + 360) % 360,
      noseUpDegrees: THREE.MathUtils.radToDeg(Math.atan2(nose.z, Math.hypot(nose.x, nose.y))),
    };
  }

  function mapMetrics(): { northDegrees: number; scaleMeters: number; scalePixels: number } {
    const origin = project(new THREE.Vector3(0, 0, 1.5));
    const north = project(new THREE.Vector3(0, 10, 1.5));
    const northDegrees = THREE.MathUtils.radToDeg(Math.atan2(north.x - origin.x, -(north.y - origin.y)));
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const first = groundPointAt(centerX - 50, centerY);
    const second = groundPointAt(centerX + 50, centerY);
    const metersPerPixel = first && second
      ? first.distanceTo(second) * (config.vectorData?.runtimeReference.worldMetersPerUnit ?? 38) / 100
      : 10;
    const targetMeters = metersPerPixel * 96;
    const scales = [100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000];
    const scaleMeters = scales.reduce((best, candidate) => (
      Math.abs(Math.log(candidate / targetMeters)) < Math.abs(Math.log(best / targetMeters)) ? candidate : best
    ));
    return {
      northDegrees,
      scaleMeters,
      scalePixels: THREE.MathUtils.clamp(scaleMeters / Math.max(0.001, metersPerPixel), 42, 180),
    };
  }

  function viewportGroundCoverage(): { fillsViewport: boolean; minimumMargin: number } {
    const rect = canvas.getBoundingClientRect();
    const corners = [
      groundPointAt(rect.left, rect.top),
      groundPointAt(rect.right, rect.top),
      groundPointAt(rect.right, rect.bottom),
      groundPointAt(rect.left, rect.bottom),
    ];
    if (corners.some((point) => point === null)) return { fillsViewport: false, minimumMargin: 0 };
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
    canvas.dataset.rendererState = 'lost';
  };
  const onContextRestored = (): void => { canvas.dataset.rendererState = 'ready'; };

  resize();
  window.addEventListener('resize', resize);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  return {
    update,
    nextView,
    pickFlight,
    pickRunway,
    selectFlight(id) {
      selectedFlightId = id;
      if (id !== null) manualCameraActive = false;
    },
    flightScreenPosition,
    flightAttitude,
    mapMetrics,
    zoomIn() { changeZoom(0.78); },
    zoomOut() { changeZoom(1.28); },
    panByScreen(horizontal, vertical) { panCameraByScreen(horizontal, vertical); },
    rotateBy(direction) { rotateCamera(direction); },
    resetCamera,
    setRunwayLabelsVisible(visible) {
      runwayLabelsVisible = visible;
      for (const runway of airportBuild.runwayVisuals) for (const label of runway.labels) label.visible = visible;
    },
    setServiceVehiclesVisible(visible) {
      serviceVehiclesVisible = visible;
      for (const visual of serviceVehicleVisuals.values()) visual.root.visible = visible;
    },
    setSurfaceLayerVisible(layer, visible) {
      airportBuild.surfaceLayers[layer].visible = visible;
    },
    setAirspaceLayerVisible(layer, visible) {
      airspaceOverlay.setVisible(layer, visible);
    },
    diagnostics() {
      const groundCoverage = viewportGroundCoverage();
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        detail: lowDetail ? 'low' : 'high',
        pooledAircraft: [...flightPool.values()].reduce((sum, pool) => sum + pool.length, 0),
        activeServiceVehicles: serviceVehicleVisuals.size,
        heldServiceVehicles: [...serviceVehicleVisuals.values()].filter((visual) => Boolean(visual.root.userData.held)).length,
        pooledServiceVehicles: [...serviceVehiclePool.values()].reduce((sum, pool) => sum + pool.length, 0),
        serviceVehiclesVisible,
        attachedTugs: [...flightVisuals.values()].filter((visual) => visual.tug.visible).length,
        startingEngines: [...flightVisuals.values()].filter((visual) => visual.root.userData.engineState === 'starting').length,
        passengerFacilities: config.surfaceGraph.passengerFacilities.length,
        surfaceDisruptions: {
          total: currentState?.surfaceDisruptions.length ?? 0,
          pending: currentState?.surfaceDisruptions.filter((disruption) => disruption.status === 'pending').length ?? 0,
          active: currentState?.surfaceDisruptions.filter((disruption) => disruption.status === 'active').length ?? 0,
          recovering: currentState?.surfaceDisruptions.filter((disruption) => disruption.status === 'recovering').length ?? 0,
        },
        camera: {
          focusX: Number(cameraFocus.x.toFixed(3)),
          focusY: Number(cameraFocus.y.toFixed(3)),
          zoom: Number(manualZoom.toFixed(3)),
          orbitDegrees: Number(THREE.MathUtils.radToDeg(manualOrbitOffset).toFixed(2)),
          panningEnabled: true,
          groundWidth: landscape.width,
          groundHeight: landscape.height,
          detailedWidth: landscape.detailedWidth,
          detailedHeight: landscape.detailedHeight,
          panLimitX: landscape.panX,
          panLimitY: landscape.panY,
          groundFillsViewport: groundCoverage.fillsViewport,
          minimumGroundMargin: groundCoverage.minimumMargin,
        },
        surfaceLayers: {
          'taxiway-labels': airportBuild.surfaceLayers['taxiway-labels'].visible,
          'operational-zones': airportBuild.surfaceLayers['operational-zones'].visible,
          hotspots: airportBuild.surfaceLayers.hotspots.visible,
          'airport-boundary': airportBuild.surfaceLayers['airport-boundary'].visible,
        },
        airspaceLayers: airspaceOverlay.visibility(),
        runways: airportBuild.runwayVisuals.map((visual, id) => ({
          id,
          activeEnd: visual.marker.scale.x < 0 ? -1 : 1,
          markerVisible: visual.marker.visible,
          arrivalMarkerVisible: visual.arrivalMarker.visible,
          departureMarkerVisible: visual.departureMarker.visible,
        })),
        context: contextRuntime?.diagnostics() ?? { status: 'procedural' },
      };
    },
    resize,
    dispose() {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      contextRuntime?.dispose();
      world.remove(airspaceOverlay.root);
      airspaceOverlay.dispose();
      for (const pool of flightPool.values()) for (const visual of pool) disposeObject(visual.root);
      flightPool.clear();
      for (const pool of serviceVehiclePool.values()) for (const visual of pool) disposeObject(visual.root);
      serviceVehiclePool.clear();
      disposeObject(scene);
      renderer.dispose();
    },
  };
}

type LandscapeDimensions = {
  width: number;
  height: number;
  detailedWidth: number;
  detailedHeight: number;
  panX: number;
  panY: number;
};

function landscapeDimensions(config: Pick<AirportConfig, 'scope'>): LandscapeDimensions {
  return config.scope === 'center'
    ? { width: 16000, height: 12000, detailedWidth: 4000, detailedHeight: 3000, panX: 5200, panY: 3900 }
    : { width: 9600, height: 7200, detailedWidth: 2400, detailedHeight: 1800, panX: 3000, panY: 2200 };
}

function buildLandscape(root: THREE.Group, config: AirportConfig, dimensions: LandscapeDimensions): void {
  const terrainColors = {
    coast: { ground: 0x6f8068, district: 0x829071 },
    highland: { ground: 0x756f55, district: 0x918868 },
    woodland: { ground: 0x4f6852, district: 0x687a5c },
  }[config.terrain];
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(dimensions.width, dimensions.height),
    new THREE.MeshStandardMaterial({ color: terrainColors.ground, roughness: 1 }),
  );
  ground.position.z = 1.24;
  ground.receiveShadow = true;
  root.add(ground);

  if (config.contextData) return;

  const districtMaterial = new THREE.MeshStandardMaterial({ color: terrainColors.district, roughness: 1 });
  for (let row = -3; row <= 3; row += 1) {
    for (let column = -4; column <= 4; column += 1) {
      if (Math.abs(row) <= 1 && Math.abs(column) <= 1) continue;
      const district = new THREE.Mesh(new THREE.PlaneGeometry(48, 30), districtMaterial);
      district.position.set(column * 70, row * 58, 1.26);
      district.rotation.z = (row + column) * 0.035;
      root.add(district);
    }
  }

  if (config.scope === 'center') {
    addHighway(root, new THREE.Vector3(-700, -104, 1.42), new THREE.Vector3(700, -104, 1.42), 9);
    addHighway(root, new THREE.Vector3(-700, 112, 1.42), new THREE.Vector3(700, 112, 1.42), 7);
    addHighway(root, new THREE.Vector3(-142, -500, 1.43), new THREE.Vector3(-142, 500, 1.43), 8);
  }
}

function addHighway(root: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, width: number): void {
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const length = start.distanceTo(end);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(length, width, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x414a49, roughness: 0.92 }),
  );
  road.position.copy(midpoint);
  road.rotation.z = angle;
  road.receiveShadow = true;
  root.add(road);
  for (const offset of [-width * 0.23, width * 0.23]) {
    const lane = new THREE.Mesh(
      new THREE.BoxGeometry(length - 4, 0.16, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xd8d0ac }),
    );
    lane.position.copy(midpoint).add(new THREE.Vector3(-Math.sin(angle) * offset, Math.cos(angle) * offset, 0.16));
    lane.rotation.z = angle;
    root.add(lane);
  }
}

function buildAirport(root: THREE.Group, config: AirportConfig): AirportBuild {
  const asphalt = new THREE.MeshStandardMaterial({ color: COLORS.runway, roughness: 0.88 });
  const stripe = new THREE.MeshBasicMaterial({ color: COLORS.runwayLine });
  const runwayLights: RunwayLight[] = [];
  const runwayVisuals: RunwayVisual[] = [];
  config.runways.forEach((data, runwayIndex) => {
    const runway = new THREE.Group();
    runway.position.set(data.center[0], data.center[1], 1.7);
    runway.rotation.z = data.heading;
    const surface = new THREE.Mesh(new THREE.BoxGeometry(data.length, data.width, 0.35), asphalt);
    surface.receiveShadow = true;
    runway.add(surface);
    for (let index = -5; index <= 5; index += 1) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.24, 0.04), stripe);
      dash.position.set(index * (data.length / 12), 0, 0.21);
      runway.add(dash);
    }
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(data.length - 4, 0.15, 0.05), stripe);
      edge.position.set(0, side * Math.max(0.2, data.width / 2 - 0.18), 0.22);
      runway.add(edge);
    }
    const marker = new THREE.Group();
    marker.position.set(data.landingEnd * (data.length / 2 - 3.1), 0, 0.25);
    marker.scale.x = data.landingEnd;
    const arrivalMarker = new THREE.Group();
    const barCount = Math.max(2, Math.min(7, Math.floor(data.width / 0.42)));
    for (let bar = 0; bar < barCount; bar += 1) {
      const thresholdBar = new THREE.Mesh(new THREE.BoxGeometry(0.55, Math.min(0.36, data.width / (barCount * 1.35)), 0.06), stripe);
      const across = barCount === 1 ? 0 : (bar / (barCount - 1) - 0.5) * Math.max(0.5, data.width - 0.5);
      thresholdBar.position.set(0, across, 0);
      arrivalMarker.add(thresholdBar);
    }
    arrivalMarker.visible = data.role === 'arrival' || data.role === 'mixed';
    marker.add(arrivalMarker);
    const departureMarker = new THREE.Group();
    const departureMaterial = new THREE.MeshBasicMaterial({ color: 0x79c8e8 });
    for (const side of [-1, 1]) {
      const chevron = new THREE.Mesh(new THREE.BoxGeometry(3.7, Math.min(0.38, data.width * 0.13), 0.07), departureMaterial);
      chevron.position.set(-0.7, side * data.width * 0.23, 0.02);
      chevron.rotation.z = side * 0.38;
      departureMarker.add(chevron);
    }
    departureMarker.visible = data.role === 'departure' || data.role === 'mixed';
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
    for (const rotation of [-0.72, 0.72]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(Math.min(12, data.length * 0.3), 0.65, 0.08), closureMaterial);
      bar.rotation.z = rotation;
      closure.add(bar);
    }
    closure.visible = false;
    runway.add(closure);
    const addLight = (
      x: number,
      y: number,
      color: number,
      dayOpacity: number,
      nightOpacity: number,
      radius = 0.27,
      activeEnd?: -1 | 1,
      roles?: RunwayOperationalRole[],
    ): void => {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: dayOpacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const light = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 6), material);
      light.position.set(x, y, 0.45);
      runway.add(light);
      runwayLights.push({ mesh: light, dayOpacity, nightOpacity, phase: runwayIndex * 1.7 + runwayLights.length * 0.31, runwayId: runwayIndex, activeEnd, roles });
    };
    const thresholdColor = PALETTE_COLOR[data.color];
    for (const end of [-1, 1] as const) {
      for (let lightIndex = 1; lightIndex <= 6; lightIndex += 1) {
        addLight(end * (data.length / 2 + lightIndex * 3.1), 0, thresholdColor, 0.36, 1, 0.38, end, ['arrival', 'mixed']);
      }
    }
    const edgeLightCount = Math.max(8, Math.round(data.length / 6));
    for (let lightIndex = 0; lightIndex <= edgeLightCount; lightIndex += 1) {
      const x = -data.length / 2 + 2 + (data.length - 4) * lightIndex / edgeLightCount;
      addLight(x, -Math.max(0.18, data.width / 2 - 0.18), 0xb9ddff, 0.14, 0.92, 0.27, undefined, ['arrival', 'departure', 'mixed']);
      addLight(x, Math.max(0.18, data.width / 2 - 0.18), 0xb9ddff, 0.14, 0.92, 0.27, undefined, ['arrival', 'departure', 'mixed']);
    }
    for (const operatingEnd of [-1, 1] as const) {
      for (const side of [-1, 1]) {
        addLight(-operatingEnd * (data.length / 2 - 0.8), side * Math.max(0.16, data.width / 2 - 0.3), 0xff6d61, 0.18, 1, 0.24, operatingEnd, ['arrival', 'departure', 'mixed']);
      }
    }
    runwayVisuals.push({ marker, arrivalMarker, departureMarker, closure, labels });
    root.add(runway);
  });

  if (config.vectorData) addImportedAprons(root, config.vectorData.runtimeReference.aprons);
  const taxiMaterial = new THREE.MeshStandardMaterial({ color: 0x515b58, roughness: 0.96 });
  addTaxiNetwork(root, config.surfaceGraph, taxiMaterial);
  const surfaceLayers = addSurfaceMapLayers(root, config);
  for (const node of config.surfaceGraph.nodes.filter((item) => item.kind === 'hold-short')) {
    const runway = node.runwayId === undefined ? undefined : config.runways[node.runwayId];
    if (runway) addHoldShortMarking(root, runway, new THREE.Vector3(node.position[0], node.position[1], 2));
  }

  if (config.vectorData) {
    addImportedBuildings(root, config.obstacles);
  } else {
    const terminalEnvelope = config.obstacles.find((obstacle) => obstacle.kind === 'terminal');
    const terminalCenter = terminalEnvelope?.center ?? config.terminal;
    const terminal = new THREE.Group();
    terminal.position.set(terminalCenter[0], terminalCenter[1], 1.7);
    const terminalMaterial = new THREE.MeshStandardMaterial({ color: COLORS.terminal, roughness: 0.78 });
    const building = new THREE.Mesh(new THREE.BoxGeometry(28, 9, 5.5), terminalMaterial);
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
    for (let index = -5; index <= 5; index += 1) {
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.15, 1.25),
        new THREE.MeshStandardMaterial({ color: COLORS.window, emissive: 0x193536, emissiveIntensity: 0.3 }),
      );
      window.position.set(index * 2.25, -4.58, 3.1);
      terminal.add(window);
    }
    root.add(terminal);
  }
  addPassengerFacilityLabels(root, config.surfaceGraph.passengerFacilities);

  const towerEnvelope = config.obstacles.find((obstacle) => obstacle.kind === 'control-tower');
  const towerCenter = towerEnvelope?.center ?? [config.terminal[0] - 17, config.terminal[1] + 6];
  const tower = new THREE.Group();
  tower.position.set(towerCenter[0], towerCenter[1], 1.8);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 3.2, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd7cfbd }));
  stem.rotation.x = Math.PI / 2;
  stem.position.z = 6;
  stem.castShadow = true;
  tower.add(stem);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 3.7, 3.1, 8), new THREE.MeshStandardMaterial({ color: COLORS.window, roughness: 0.25 }));
  top.rotation.x = Math.PI / 2;
  top.position.z = 12.9;
  top.castShadow = true;
  tower.add(top);
  root.add(tower);
  return { runwayLights, runwayVisuals, surfaceLayers };
}

function addImportedAprons(root: THREE.Group, aprons: NonNullable<AirportConfig['vectorData']>['runtimeReference']['aprons']): void {
  const material = new THREE.MeshStandardMaterial({ color: 0x59635e, roughness: 0.98, side: THREE.DoubleSide });
  for (const apron of aprons) {
    const shape = shapeFromRings(apron.rings);
    if (!shape) continue;
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.position.z = 1.56;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

function addImportedBuildings(root: THREE.Group, obstacles: AirportConfig['obstacles']): void {
  const terminalMaterial = new THREE.MeshStandardMaterial({ color: COLORS.terminal, roughness: 0.78 });
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xb8ae98, roughness: 0.88 });
  for (const obstacle of obstacles) {
    if (obstacle.shape !== 'polygon' || obstacle.kind === 'control-tower') continue;
    const shape = shapeFromRings([obstacle.points]);
    if (!shape) continue;
    const height = obstacle.kind === 'terminal' ? 4.2 : 2.6;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
    const mesh = new THREE.Mesh(geometry, obstacle.kind === 'terminal' ? terminalMaterial : buildingMaterial);
    mesh.position.z = 1.64;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

function shapeFromRings(rings: Array<Array<[number, number]>>): THREE.Shape | null {
  const outer = rings[0];
  if (!outer || outer.length < 4) return null;
  const shape = new THREE.Shape();
  shape.moveTo(outer[0][0], outer[0][1]);
  for (let index = 1; index < outer.length; index += 1) shape.lineTo(outer[index][0], outer[index][1]);
  for (const ring of rings.slice(1)) {
    if (ring.length < 4) continue;
    const hole = new THREE.Path();
    hole.moveTo(ring[0][0], ring[0][1]);
    for (let index = 1; index < ring.length; index += 1) hole.lineTo(ring[index][0], ring[index][1]);
    shape.holes.push(hole);
  }
  return shape;
}

function createRunwayLabel(label: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(244, 244, 234, 0.94)';
    context.font = '800 34px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(label.length > 2 ? 5.4 : 4.6, 2.05, 1);
  sprite.renderOrder = 3;
  return sprite;
}

function buildDetails(root: THREE.Group, config: AirportConfig, lowDetail: boolean): THREE.Object3D[] {
  const sway: THREE.Object3D[] = [];
  const treeDark = config.terrain === 'woodland' ? 0x3f604c : config.terrain === 'highland' ? 0x666b55 : 0x698169;
  const treeLight = config.terrain === 'woodland' ? 0x5e7958 : config.terrain === 'highland' ? 0x85866a : 0x8fa079;
  const treeMaterial = new THREE.MeshStandardMaterial({ color: treeDark, roughness: 1 });
  const treeLightMaterial = new THREE.MeshStandardMaterial({ color: treeLight, roughness: 1 });
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x7d6351, roughness: 1 });
  const treeCount = lowDetail ? Math.max(8, Math.floor(config.treeCount * 0.45)) : config.treeCount;
  const trunkInstances = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.52, 3.5, 6), trunkMaterial, treeCount);
  const darkCount = Math.floor(treeCount * 2 / 3);
  const lightCount = treeCount - darkCount;
  const crownGeometry = new THREE.IcosahedronGeometry(1, lowDetail ? 0 : 1);
  const darkCrowns = new THREE.InstancedMesh(crownGeometry, treeMaterial, darkCount);
  const lightCrowns = new THREE.InstancedMesh(crownGeometry.clone(), treeLightMaterial, lightCount);
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

  const reedCount = config.code === 'ORD' ? 0 : lowDetail ? 18 : 70;
  const reedMaterial = new THREE.MeshStandardMaterial({ color: 0x8b916d, roughness: 1 });
  const reeds = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.08, 1, 4), reedMaterial, reedCount);
  for (let index = 0; index < reedCount; index += 1) {
    const angle = index * 2.399;
    const radius = 74 + (index % 10) * 1.5;
    const height = 1.8 + (index % 3) * 0.4;
    dummy.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.74, 0.7 + height / 2);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.scale.set(1, height, 1);
    dummy.updateMatrix();
    reeds.setMatrixAt(index, dummy.matrix);
  }
  root.add(reeds);

  const windsock = new THREE.Group();
  windsock.position.set(45, 28, 2);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 8, 8), new THREE.MeshStandardMaterial({ color: 0xc4bba8 }));
  pole.rotation.x = Math.PI / 2;
  pole.position.z = 4;
  windsock.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4.6, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xd98b78, side: THREE.DoubleSide }));
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
    const material = new THREE.MeshBasicMaterial({ color: 0xf4f0e8, transparent: true, opacity: 0.12, depthWrite: false });
    for (let part = 0; part < 5; part += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(6 + part * 0.8, 16, 10), material);
      puff.position.set(part * 8 - 15, Math.sin(part) * 4, Math.cos(part * 1.8) * 2);
      puff.scale.z = 0.42;
      cloud.add(puff);
    }
    cloud.position.set(-145 + index * 86, index % 2 ? 102 : -108, 78 + index * 5);
    scene.add(cloud);
    clouds.push(cloud);
  }
  return clouds;
}

function buildRain(scene: THREE.Scene, seed: number, lowDetail: boolean): THREE.Points {
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
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0xc9e1e4, size: 0.75, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  rain.visible = false;
  scene.add(rain);
  return rain;
}

function updateRain(rain: THREE.Points, state: AirportState, delta: number): void {
  const snow = state.weather.condition === 'snow';
  rain.visible = state.weather.condition === 'rain' || snow;
  if (!rain.visible) return;
  const material = rain.material as THREE.PointsMaterial;
  material.color.setHex(snow ? 0xf1f3ed : 0xc9e1e4);
  material.size = snow ? 1.15 : 0.75;
  material.opacity = snow ? 0.72 : 0.5;
  const positions = rain.geometry.getAttribute('position') as THREE.BufferAttribute;
  const windTo = state.weather.windDirection + Math.PI;
  for (let index = 0; index < positions.count; index += 1) {
    let x = positions.getX(index) + Math.cos(windTo) * state.weather.windSpeed * delta * (snow ? 0.25 : 0.16);
    let y = positions.getY(index) + Math.sin(windTo) * state.weather.windSpeed * delta * (snow ? 0.25 : 0.16);
    let z = positions.getZ(index) - delta * (snow ? 8 : 34);
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

function planePoolKey(flight: Flight): string {
  return `${flight.aircraft}:${flight.airline}:${flight.palette}`;
}

function createPlane(flight: Flight): FlightVisual {
  const profile = aircraftProfile(flight.aircraft);
  const airline = airlineProfile(flight.airline);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const color = PALETTE_COLOR[flight.palette];
  const paint = new THREE.MeshStandardMaterial({ color: airline.primaryColor, roughness: 0.46, metalness: 0.05 });
  const accent = new THREE.MeshStandardMaterial({ color: airline.accentColor, roughness: 0.4, metalness: 0.08 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf1eadc, roughness: 0.5, metalness: 0.04 });
  const dark = new THREE.MeshStandardMaterial({ color: COLORS.ink, roughness: 0.42 });

  const visual = profile.visual;
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(visual.bodyRadius, visual.bodyRadius * 1.03, visual.bodyLength, 14), paint);
  fuselage.rotation.z = -Math.PI / 2;
  fuselage.castShadow = true;
  body.add(fuselage);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(visual.bodyRadius * 1.01, 14, 8), paint);
  nose.scale.set(1.45, 0.96, 0.96);
  nose.position.x = visual.bodyLength / 2 + visual.bodyRadius * 0.55;
  nose.castShadow = true;
  body.add(nose);
  const tailCap = new THREE.Mesh(new THREE.SphereGeometry(visual.bodyRadius * 0.98, 14, 8), paint);
  tailCap.scale.set(0.8, 0.92, 0.92);
  tailCap.position.x = -visual.bodyLength / 2 - visual.bodyRadius * 0.2;
  body.add(tailCap);

  const wingShape = new THREE.Shape();
  const wingRoot = visual.bodyLength * 0.08;
  const wingTip = wingRoot - visual.wingSweep;
  const wingEnd = visual.wingSpan / 2;
  wingShape.moveTo(wingRoot + 1.1, 0);
  wingShape.lineTo(wingTip, wingEnd);
  wingShape.lineTo(wingTip - 0.72, wingEnd - 0.22);
  wingShape.lineTo(wingRoot - 0.55, 0);
  wingShape.lineTo(wingTip - 0.72, -wingEnd + 0.22);
  wingShape.lineTo(wingTip, -wingEnd);
  wingShape.closePath();
  const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape, { depth: 0.22, bevelEnabled: false }), cream);
  wing.position.z = -0.05;
  wing.castShadow = true;
  body.add(wing);

  const tailShape = new THREE.Shape();
  const tailRoot = -visual.bodyLength * 0.31;
  const tailTip = tailRoot - visual.wingSweep * 0.5;
  const tailSpan = visual.wingSpan * 0.22;
  tailShape.moveTo(tailRoot + 0.58, 0);
  tailShape.lineTo(tailTip, tailSpan);
  tailShape.lineTo(tailTip - 0.34, tailSpan - 0.12);
  tailShape.lineTo(tailRoot - 0.28, 0);
  tailShape.lineTo(tailTip - 0.34, -tailSpan + 0.12);
  tailShape.lineTo(tailTip, -tailSpan);
  tailShape.closePath();
  const tail = new THREE.Mesh(new THREE.ExtrudeGeometry(tailShape, { depth: 0.18, bevelEnabled: false }), cream);
  tail.position.z = 0.08;
  tail.castShadow = true;
  body.add(tail);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.18, visual.tailHeight), paint);
  fin.position.set(-visual.bodyLength * 0.37, 0, visual.tailHeight * 0.43);
  fin.rotation.y = -0.16;
  body.add(fin);
  const tailMark = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.2, visual.tailHeight * 0.52), accent);
  tailMark.position.set(-visual.bodyLength * 0.37, 0, visual.tailHeight * 0.43);
  tailMark.rotation.y = -0.16;
  body.add(tailMark);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(visual.bodyRadius * 0.82, 12, 8), dark);
  cockpit.scale.set(1.25, 0.78, 0.43);
  cockpit.position.set(visual.bodyLength * 0.33, 0, visual.bodyRadius * 0.92);
  body.add(cockpit);

  const navLights: THREE.Mesh[] = [];
  for (const [y, colorCode] of [[visual.wingSpan * 0.47, 0xe35f68], [-visual.wingSpan * 0.47, 0x72d59b]] as Array<[number, number]>) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 7), new THREE.MeshBasicMaterial({ color: colorCode, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    light.position.set(wingTip, y, 0.18);
    body.add(light);
    navLights.push(light);
  }
  const tailLight = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 7), new THREE.MeshBasicMaterial({ color: 0xf4eee0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  tailLight.position.set(-visual.bodyLength * 0.48, 0, visual.bodyRadius * 0.18);
  body.add(tailLight);
  navLights.push(tailLight);
  const beaconLamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 7),
    new THREE.MeshBasicMaterial({ color: 0xff6f61, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  beaconLamp.position.set(-visual.bodyLength * 0.08, 0, visual.tailHeight * 0.7);
  body.add(beaconLamp);
  navLights.push(beaconLamp);
  const landingLamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 10, 7),
    new THREE.MeshBasicMaterial({ color: 0xfff2c7, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  landingLamp.position.set(visual.bodyLength * 0.42, 0, -visual.bodyRadius * 0.22);
  landingLamp.visible = false;
  body.add(landingLamp);
  const landingLight = new THREE.PointLight(0xffe5b0, 0, 24, 2);
  landingLight.position.copy(landingLamp.position);
  body.add(landingLight);

  const strutMaterial = new THREE.MeshStandardMaterial({ color: 0x707978, roughness: 0.6, metalness: 0.25 });
  const engineMaterial = new THREE.MeshStandardMaterial({ color: 0x6d7774, roughness: 0.55, metalness: 0.22 });
  const engineOffsets = profile.engines === 1
    ? [0]
    : profile.engines === 4
    ? [-visual.engineOffset, -visual.engineOffset * 0.5, visual.engineOffset * 0.5, visual.engineOffset]
    : [-visual.engineOffset, visual.engineOffset];
  const noseEngine = visual.engineMount === 'nose';
  const engineX = noseEngine ? visual.bodyLength * 0.49 : visual.bodyLength * 0.04;
  const engineZ = noseEngine ? 0 : -visual.bodyRadius * 0.85;
  const propellers: THREE.Object3D[] = [];
  const engineIndicators: THREE.Mesh[] = [];
  for (const offset of engineOffsets) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(visual.engineRadius, visual.engineRadius * 1.04, visual.engineLength, 12), engineMaterial);
    engine.rotation.z = -Math.PI / 2;
    engine.position.set(engineX, offset, engineZ);
    engine.castShadow = true;
    body.add(engine);
    const engineIndicator = new THREE.Mesh(
      new THREE.CircleGeometry(visual.engineRadius * 0.72, 12),
      new THREE.MeshBasicMaterial({ color: 0xffc77c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    engineIndicator.rotation.y = Math.PI / 2;
    engineIndicator.position.set(engineX + visual.engineLength * 0.525, offset, engineZ);
    engineIndicator.visible = false;
    body.add(engineIndicator);
    engineIndicators.push(engineIndicator);
    if (!noseEngine) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.42), strutMaterial);
      pylon.position.set(engineX, offset, -visual.bodyRadius * 0.48);
      body.add(pylon);
    }
    if (visual.propeller) {
      const prop = new THREE.Mesh(new THREE.CircleGeometry(visual.engineRadius * 1.35, 16), new THREE.MeshBasicMaterial({ color: 0xddd6bd, transparent: true, opacity: 0.56, side: THREE.DoubleSide }));
      prop.rotation.y = Math.PI / 2;
      prop.position.set(engineX + visual.engineLength * 0.53, offset, engineZ);
      body.add(prop);
      propellers.push(prop);
    }
  }

  const tug = new THREE.Group();
  const tugScale = Math.max(0.72, visual.bodyRadius * 0.72);
  const tugBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.8 * tugScale, 1.05 * tugScale, 0.62 * tugScale),
    new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.72, metalness: 0.08 }),
  );
  tugBody.position.z = -0.84;
  tugBody.castShadow = true;
  tug.add(tugBody);
  const tugCab = new THREE.Mesh(
    new THREE.BoxGeometry(0.72 * tugScale, 0.92 * tugScale, 0.48 * tugScale),
    new THREE.MeshStandardMaterial({ color: 0x5d7776, roughness: 0.46, metalness: 0.12 }),
  );
  tugCab.position.set(-0.34 * tugScale, 0, -0.34);
  tug.add(tugCab);
  const tugWheelMaterial = new THREE.MeshStandardMaterial({ color: 0x202a2b, roughness: 0.92 });
  for (const [x, y] of [[-0.56, -0.54], [-0.56, 0.54], [0.56, -0.54], [0.56, 0.54]] as Array<[number, number]>) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * tugScale, 0.2 * tugScale, 0.16 * tugScale, 10), tugWheelMaterial);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x * tugScale, y * tugScale, -1.08);
    tug.add(wheel);
  }
  const tugX = visual.bodyLength * 0.52 + visual.bodyRadius * 1.25 + 1.1 * tugScale;
  const noseGearX = visual.bodyLength * 0.29;
  const towLength = Math.max(1, tugX - noseGearX);
  const towbar = new THREE.Mesh(
    new THREE.BoxGeometry(towLength, 0.13, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xe4dbc8, roughness: 0.65, metalness: 0.18 }),
  );
  towbar.position.set(-towLength / 2, 0, -1.02);
  tug.add(towbar);
  const tugBeacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.16 * tugScale, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffb22e, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
  );
  tugBeacon.position.set(-0.34 * tugScale, 0, 0.02);
  tug.add(tugBeacon);
  tug.position.x = tugX;
  tug.visible = false;
  root.add(tug);

  const gear = new THREE.Group();
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x202a2b, roughness: 0.9 });
  for (const [x, y] of [[visual.bodyLength * 0.29, 0], [-visual.bodyLength * 0.18, -visual.bodyRadius * 1.12], [-visual.bodyLength * 0.18, visual.bodyRadius * 1.12]] as Array<[number, number]>) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.72, 8), strutMaterial);
    strut.rotation.x = Math.PI / 2;
    strut.position.set(x, y, -0.66);
    gear.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 12), wheelMaterial);
    wheel.position.set(x, y, -1.08);
    wheel.castShadow = true;
    gear.add(wheel);
  }
  root.add(gear);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(2.3, visual.bodyLength * 0.38), 24),
    new THREE.MeshBasicMaterial({ color: 0x304847, transparent: true, opacity: 0.14, depthWrite: false }),
  );
  shadow.scale.set(1.9, 0.7, 1);
  shadow.position.z = -1;
  root.add(shadow);

  const beacon = new THREE.PointLight(0xffa08d, 0.8, 12, 2);
  beacon.position.set(-visual.bodyLength * 0.08, 0, visual.tailHeight * 0.7);
  body.add(beacon);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(4.4, 5.1, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  halo.visible = false;
  halo.position.z = -0.7;
  root.add(halo);
  const contrailGeometry = new THREE.BufferGeometry();
  contrailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -visual.bodyLength * 0.48, 0, visual.bodyRadius * 0.42,
    -visual.bodyLength * 0.48 - 3.2, 0, visual.bodyRadius * 0.42,
    -visual.bodyLength * 0.48 - 6.4, 0, visual.bodyRadius * 0.42,
  ], 3));
  const contrail = new THREE.Line(contrailGeometry, new THREE.LineBasicMaterial({ color: 0xeaf2ef, transparent: true, opacity: 0.16, depthWrite: false }));
  contrail.visible = false;
  root.add(contrail);
  const deicingSpray = new THREE.Group();
  const sprayMaterial = new THREE.MeshBasicMaterial({
    color: 0xc9edf2,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  for (const side of [-1, 1]) {
    const spray = new THREE.Mesh(new THREE.ConeGeometry(0.75, Math.max(3.6, visual.wingSpan * 0.26), 12, 1, true), sprayMaterial);
    spray.rotation.z = side * (Math.PI / 2 - 0.28);
    spray.position.set(-visual.bodyLength * 0.06, side * visual.wingSpan * 0.36, visual.bodyRadius * 0.72);
    deicingSpray.add(spray);
  }
  deicingSpray.visible = false;
  root.add(deicingSpray);
  const shadowCasters: THREE.Mesh[] = [];
  for (const part of [body, gear, tug]) {
    part.traverse((object) => {
      if (object instanceof THREE.Mesh && object.castShadow) shadowCasters.push(object);
    });
  }
  return {
    poolKey: planePoolKey(flight),
    root,
    baseScale: 1,
    shadow,
    gear,
    tug,
    tugBeacon,
    propellers,
    engineIndicators,
    navLights,
    landingLamp,
    landingLight,
    shadowCasters,
    contrail,
    deicingSpray,
    beacon,
    halo,
    routePoint: new THREE.Vector3(),
    routeTangent: new THREE.Vector3(),
    renderedHeading: 0,
    poseInitialized: false,
    active: true,
  };
}

function createServiceVehicle(type: ServiceVehicleType): ServiceVehicleVisual {
  const root = new THREE.Group();
  root.name = `service-vehicle-${type}`;
  const color = {
    'fuel-truck': 0xe7ded0,
    'baggage-cart': 0xd5a44e,
    'cargo-loader': 0xc7865c,
    'catering-truck': 0x8fafaa,
    'cleaning-van': 0x8ca6bd,
    'maintenance-van': 0xd7c46a,
    'passenger-bus': 0xe0d4bd,
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
  const longVehicle = type === 'passenger-bus' || type === 'baggage-cart';
  const length = longVehicle ? 2.35 : type === 'fuel-truck' || type === 'catering-truck' ? 1.95 : 1.65;
  const width = type === 'passenger-bus' ? 0.78 : 0.72;
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(length, width, 0.22), dark);
  chassis.position.z = 0.28;
  chassis.castShadow = true;
  root.add(chassis);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(type === 'passenger-bus' ? length * 0.9 : 0.62, width * 0.9, type === 'passenger-bus' ? 0.72 : 0.58), bodyMaterial);
  cab.position.set(type === 'passenger-bus' ? 0 : length * 0.31, 0, type === 'passenger-bus' ? 0.68 : 0.59);
  cab.castShadow = true;
  root.add(cab);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.04, width * 0.7, 0.28), glass);
  windshield.position.set(type === 'passenger-bus' ? length * 0.46 : length * 0.31 + 0.32, 0, type === 'passenger-bus' ? 0.78 : 0.69);
  root.add(windshield);

  if (type === 'fuel-truck') {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.12, 14), bodyMaterial);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(-0.3, 0, 0.68);
    tank.castShadow = true;
    root.add(tank);
  } else if (type === 'baggage-cart') {
    for (const x of [-0.2, -0.78]) {
      const cart = new THREE.Mesh(new THREE.BoxGeometry(0.46, width * 0.84, 0.35), bodyMaterial);
      cart.position.set(x, 0, 0.5);
      cart.castShadow = true;
      root.add(cart);
    }
  } else if (type === 'cargo-loader') {
    const platform = new THREE.Mesh(new THREE.BoxGeometry(0.92, width * 1.05, 0.12), bodyMaterial);
    platform.position.set(-0.22, 0, 0.82);
    root.add(platform);
    const lift = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.54), dark);
    lift.rotation.y = -0.5;
    lift.position.set(-0.18, 0, 0.56);
    root.add(lift);
  } else if (type === 'catering-truck') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.05, width * 0.94, 0.86), bodyMaterial);
    box.position.set(-0.32, 0, 0.78);
    box.castShadow = true;
    root.add(box);
  } else if (type === 'cleaning-van' || type === 'maintenance-van') {
    const van = new THREE.Mesh(new THREE.BoxGeometry(0.92, width * 0.92, 0.64), bodyMaterial);
    van.position.set(-0.28, 0, 0.64);
    van.castShadow = true;
    root.add(van);
  }

  const wheels: THREE.Mesh[] = [];
  for (const x of [-length * 0.32, length * 0.32]) {
    for (const y of [-width * 0.52, width * 0.52]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.13, 10), wheelMaterial);
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
      color: 0xffb23b,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  beacon.position.set(length * 0.26, 0, type === 'passenger-bus' ? 1.08 : 0.98);
  root.add(beacon);
  return { poolKey: type, root, beacon, wheels, active: true };
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
  const approachDescent = flight.phase === 'approach'
    ? THREE.MathUtils.smoothstep(flight.progress, 0.06, 0.96)
    : 1;
  const takeoffClimb = flight.phase === 'takeoff'
    ? THREE.MathUtils.smoothstep(flight.progress, 0.34, 0.92)
    : 0;
  const presentationScale = flight.phase === 'approach'
    ? THREE.MathUtils.lerp(visual.baseScale * 1.3, visual.baseScale, approachDescent)
    : flight.phase === 'takeoff'
      ? THREE.MathUtils.lerp(visual.baseScale, visual.baseScale * 1.22, takeoffClimb)
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
  const isTaxiing = flight.phase === 'taxi-in' || flight.phase === 'resting' || flight.phase === 'taxi-out';
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
    visual.root.position.z += mainGearContactLift(flight, presentationPitch, modelScale) * groundFactor;
  }
  const targetHeading = motion.heading;
  if (!visual.poseInitialized) {
    visual.renderedHeading = targetHeading;
    visual.poseInitialized = true;
  } else {
    visual.renderedHeading = dampAngle(visual.renderedHeading, targetHeading, motion.onGround ? 10 : 8, delta);
  }
  const airborne = !motion.onGround;
  for (const caster of visual.shadowCasters) caster.castShadow = airborne;
  visual.gear.visible = (flight.phase === 'approach' && flight.progress > 0.72)
    || flight.phase === 'landing'
    || flight.phase === 'taxi-in'
    || flight.phase === 'resting'
    || flight.phase === 'taxi-out'
    || (flight.phase === 'takeoff' && (
      motion.stage === 'lineup'
      || motion.stage === 'takeoff-roll'
      || motion.stage === 'rotation'
      || (motion.stage === 'climbout' && motion.stageProgress < 0.28)
    ));
  const airMotion = airborne ? Math.sin(elapsed * 0.8 + flight.id) * 0.018 : 0;
  applyAircraftOrientation(visual.root, visual.renderedHeading, presentationPitch, motion.bank + airMotion);
  const visualAltitude = visual.root.position.z;
  const shadowSurface = isTaxiing ? 1.64 : 1.82;
  const heightAboveSurface = Math.max(0, visualAltitude - shadowSurface);
  const shadowOpacity = isTaxiing ? THREE.MathUtils.lerp(0.2, 0.27, nightMix) : THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.16, 0.21, nightMix) - heightAboveSurface * 0.018, 0, 0.21);
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
  if (flight.phase === 'approach') {
    // Preserve the six-degree final-approach attitude. The landing phase then
    // raises the nose smoothly to ten degrees at main-gear contact.
    return motion.pitch * (APPROACH_PRESENTATION_PITCH / 0.105);
  }
  if (flight.phase !== 'landing') return motion.pitch;
  if (motion.stage === 'flare') {
    return THREE.MathUtils.lerp(
      APPROACH_PRESENTATION_PITCH,
      TOUCHDOWN_PRESENTATION_PITCH,
      THREE.MathUtils.smootherstep(motion.stageProgress, 0, 1),
    );
  }
  if (motion.stage === 'touchdown') return TOUCHDOWN_PRESENTATION_PITCH;
  if (motion.stage === 'rollout') {
    // Hold the nose off for a beat after the mains touch, then lower the nose
    // wheel progressively as braking settles the aircraft onto the runway.
    const noseGearContact = THREE.MathUtils.smootherstep(motion.stageProgress, 0.14, 0.56);
    return TOUCHDOWN_PRESENTATION_PITCH * (1 - noseGearContact);
  }
  return 0;
}

function mainGearContactLift(flight: Flight, pitch: number, modelScale: number): number {
  if (pitch <= 0) return 0;
  const bodyLength = aircraftProfile(flight.aircraft).visual.bodyLength;
  const mainGearX = -bodyLength * 0.18;
  const wheelCenterZ = -1.08;
  const wheelRadius = 0.24;
  const levelContactDepth = -wheelCenterZ + wheelRadius;
  const pitchedWheelBottom = Math.sin(pitch) * mainGearX + Math.cos(pitch) * wheelCenterZ - wheelRadius;
  return Math.max(0, (-pitchedWheelBottom - levelContactDepth) * modelScale);
}

function updateContrail(visual: FlightVisual, flight: Flight, elapsed: number): void {
  const airborne = !flight.motion.onGround;
  visual.contrail.visible = airborne && (
    flight.phase === 'approach'
    || (flight.phase === 'takeoff' && flight.motion.stage === 'climbout' && flight.motion.stageProgress > 0.62)
  );
  if (!visual.contrail.visible) return;
  const material = visual.contrail.material as THREE.LineBasicMaterial;
  material.opacity = 0.08 + Math.sin(elapsed * 0.8 + flight.id) * 0.025;
}

function addHoldShortMarking(root: THREE.Group, runway: RunwayConfig, point: THREE.Vector3): void {
  const marking = new THREE.Group();
  marking.position.copy(point);
  marking.position.z = 2.18;
  marking.rotation.z = runway.heading;
  const yellow = new THREE.MeshBasicMaterial({ color: 0xf2c84b, depthWrite: false });
  for (const x of [-1.05, -0.55]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 8.4, 0.045), yellow);
    bar.position.x = x;
    marking.add(bar);
  }
  for (const x of [0.55, 1.05]) {
    for (const y of [-3.2, -1.05, 1.05, 3.2]) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.3, 0.045), yellow);
      dash.position.set(x, y, 0);
      marking.add(dash);
    }
  }
  root.add(marking);
}

function runwayEnd(runway: RunwayConfig, sign: number, beyond = 0, z = 2): THREE.Vector3 {
  const distance = sign * (runway.length / 2 + beyond);
  return new THREE.Vector3(runway.center[0] + Math.cos(runway.heading) * distance, runway.center[1] + Math.sin(runway.heading) * distance, z);
}

function dampAngle(current: number, target: number, smoothing: number, delta: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-smoothing * Math.max(0, delta)));
}

function addTaxiNetwork(root: THREE.Group, graph: AirportConfig['surfaceGraph'], material: THREE.Material): void {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const positions: number[] = [];
  const indices: number[] = [];
  const intersectionRadius = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.kind === 'runway') continue;
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) continue;
    const x = to.position[0] - from.position[0];
    const y = to.position[1] - from.position[1];
    const length = Math.hypot(x, y);
    if (length <= 0.001) continue;
    const normalX = -y / length * edge.width / 2;
    const normalY = x / length * edge.width / 2;
    const base = positions.length / 3;
    positions.push(
      from.position[0] + normalX, from.position[1] + normalY, 1.62,
      from.position[0] - normalX, from.position[1] - normalY, 1.62,
      to.position[0] + normalX, to.position[1] + normalY, 1.62,
      to.position[0] - normalX, to.position[1] - normalY, 1.62,
    );
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    intersectionRadius.set(from.id, Math.max(intersectionRadius.get(from.id) ?? 0, edge.width / 2));
    intersectionRadius.set(to.id, Math.max(intersectionRadius.get(to.id) ?? 0, edge.width / 2));
  }
  for (const node of graph.nodes.filter((item) => item.kind === 'intersection')) {
    const radius = intersectionRadius.get(node.id);
    if (!radius) continue;
    const base = positions.length / 3;
    positions.push(node.position[0], node.position[1], 1.621);
    const sides = 8;
    for (let side = 0; side < sides; side += 1) {
      const angle = side / sides * Math.PI * 2;
      positions.push(node.position[0] + Math.cos(angle) * radius, node.position[1] + Math.sin(angle) * radius, 1.621);
    }
    for (let side = 0; side < sides; side += 1) indices.push(base, base + 1 + side, base + 1 + (side + 1) % sides);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const taxi = new THREE.Mesh(geometry, material);
  taxi.receiveShadow = true;
  root.add(taxi);
}

function createMapLabel(label: string, tone: 'taxiway' | 'zone' | 'hotspot'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  const colors = tone === 'hotspot'
    ? { background: 'rgba(70, 31, 31, 0.92)', border: 'rgba(240, 150, 140, 0.92)', text: '#ffe5dc' }
    : tone === 'zone'
      ? { background: 'rgba(26, 57, 60, 0.84)', border: 'rgba(141, 190, 177, 0.7)', text: '#e5f2e8' }
      : { background: 'rgba(24, 49, 51, 0.92)', border: 'rgba(238, 194, 103, 0.86)', text: '#fff0c6' };
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
    context.font = tone === 'taxiway' ? '800 38px Arial, sans-serif' : '700 24px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const copy = label.length > 24 ? `${label.slice(0, 22)}…` : label;
    context.fillText(copy, canvas.width / 2, canvas.height / 2 + 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  const width = tone === 'taxiway' ? 5.4 : Math.min(14, Math.max(7, label.length * 0.5));
  sprite.scale.set(width, tone === 'taxiway' ? 1.55 : 2.15, 1);
  sprite.renderOrder = 9;
  return sprite;
}

function addPassengerFacilityLabels(
  root: THREE.Group,
  facilities: AirportConfig['surfaceGraph']['passengerFacilities'],
): void {
  if (!facilities.length) return;
  const group = new THREE.Group();
  group.name = 'passenger-facilities';
  for (const facility of facilities) {
    const terminal = facility.kind === 'terminal';
    const canvas = document.createElement('canvas');
    canvas.width = terminal ? 192 : 96;
    canvas.height = 72;
    const context = canvas.getContext('2d');
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = terminal ? 'rgba(19, 49, 51, 0.82)' : 'rgba(237, 220, 184, 0.88)';
      context.strokeStyle = terminal ? 'rgba(238, 194, 103, 0.82)' : 'rgba(34, 68, 68, 0.72)';
      context.lineWidth = 3;
      context.beginPath();
      context.roundRect(3, 3, canvas.width - 6, canvas.height - 6, terminal ? 14 : 24);
      context.fill();
      context.stroke();
      context.fillStyle = terminal ? '#fff0c6' : '#173d3e';
      context.font = terminal ? '800 30px Arial, sans-serif' : '900 42px Arial, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(terminal ? facility.terminalId : facility.concourse ?? facility.name, canvas.width / 2, canvas.height / 2 + 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }));
    sprite.position.set(facility.center[0], facility.center[1], terminal ? 8.7 : 7.8);
    sprite.scale.set(terminal ? 5.2 : 2.6, terminal ? 1.95 : 1.95, 1);
    sprite.renderOrder = 8;
    sprite.userData.facilityId = facility.id;
    group.add(sprite);
  }
  root.add(group);
}

function addSurfaceMapLayers(root: THREE.Group, config: AirportConfig): Record<SurfaceLayer, THREE.Group> {
  const graph = config.surfaceGraph;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const taxiwayLabels = new THREE.Group();
  taxiwayLabels.name = 'surface-layer-taxiway-labels';
  const operationalZones = new THREE.Group();
  operationalZones.name = 'surface-layer-operational-zones';
  const hotspots = new THREE.Group();
  hotspots.name = 'surface-layer-hotspots';
  const airportBoundary = new THREE.Group();
  airportBoundary.name = 'surface-layer-airport-boundary';

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
      return from && to ? [[(from.position[0] + to.position[0]) / 2, (from.position[1] + to.position[1]) / 2] as [number, number]] : [];
    });
    if (!midpoints.length) continue;
    const center: [number, number] = [
      midpoints.reduce((sum, point) => sum + point[0], 0) / midpoints.length,
      midpoints.reduce((sum, point) => sum + point[1], 0) / midpoints.length,
    ];
    const position = midpoints.reduce((nearest, point) => distance2(point, center) < distance2(nearest, center) ? point : nearest);
    const label = createMapLabel(reference, 'taxiway');
    label.position.set(position[0], position[1], 3.2);
    taxiwayLabels.add(label);
  }

  const zonePalette: Record<string, number> = {
    'terminal-complex': 0x89b7b0,
    'terminal-apron': 0xa7c9bd,
    'cargo-ramp': 0xa590bc,
    'general-aviation': 0x80a7c5,
    'deicing-pad': 0x8cb8ca,
    'holding-pad': 0xc3a975,
    maintenance: 0xa8927b,
    'remote-ramp': 0x8aa18b,
    'perimeter-route': 0x718f91,
  };
  for (const zone of graph.zones) {
    const shape = shapeFromRings(zone.rings);
    if (!shape) continue;
    const color = zonePalette[zone.kind] ?? COLORS.sage;
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.19, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.position.z = 1.96;
    mesh.renderOrder = 5;
    operationalZones.add(mesh);
    const center = ringCenter(zone.rings[0]);
    const label = createMapLabel(zone.name, 'zone');
    label.position.set(center[0], center[1], 3.5);
    operationalZones.add(label);
  }

  for (const hotspot of graph.hotspots) {
    const shape = shapeFromRings(hotspot.rings);
    if (!shape) continue;
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: COLORS.rose, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.position.z = 2.04;
    mesh.renderOrder = 7;
    hotspots.add(mesh);
    const center = ringCenter(hotspot.rings[0]);
    const label = createMapLabel(hotspot.label, 'hotspot');
    label.position.set(center[0], center[1], 3.8);
    hotspots.add(label);
  }

  taxiwayLabels.visible = false;
  operationalZones.visible = false;
  hotspots.visible = false;
  airportBoundary.visible = false;
  root.add(operationalZones, hotspots, taxiwayLabels, airportBoundary);
  return { 'taxiway-labels': taxiwayLabels, 'operational-zones': operationalZones, hotspots, 'airport-boundary': airportBoundary };
}

function ringCenter(ring: Array<[number, number]>): [number, number] {
  if (!ring.length) return [0, 0];
  const unique = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
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
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    } else if (child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    } else if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  });
}

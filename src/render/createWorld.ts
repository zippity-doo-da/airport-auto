import * as THREE from 'three';
import type { AirportConfig, FlightColor, RunwayConfig } from '../simulation/airportConfig';
import { aircraftProfile } from '../simulation/aircraftProfiles';
import { airlineProfile } from '../simulation/airlineProfiles';
import type { AirportState, Flight, FlightMotionState } from '../simulation/types';

type FlightVisual = {
  poolKey: string;
  root: THREE.Group;
  baseScale: number;
  shadow: THREE.Mesh;
  gear: THREE.Group;
  propellers: THREE.Object3D[];
  navLights: THREE.Mesh[];
  landingLamp: THREE.Mesh;
  landingLight: THREE.PointLight;
  shadowCasters: THREE.Mesh[];
  contrail: THREE.Line;
  beacon: THREE.PointLight;
  halo: THREE.Mesh;
  routePoint: THREE.Vector3;
  routeTangent: THREE.Vector3;
  renderedHeading: number;
  poseInitialized: boolean;
  active: boolean;
};

const APPROACH_PRESENTATION_PITCH = THREE.MathUtils.degToRad(10);
const TOUCHDOWN_PRESENTATION_PITCH = THREE.MathUtils.degToRad(12);

type RunwayLight = {
  mesh: THREE.Mesh;
  dayOpacity: number;
  nightOpacity: number;
  phase: number;
  runwayId: number;
  end?: -1 | 1;
  activeOnly?: boolean;
};

type RunwayVisual = {
  marker: THREE.Group;
  closure: THREE.Group;
  labels: THREE.Sprite[];
};

type AirportBuild = {
  runwayLights: RunwayLight[];
  runwayVisuals: RunwayVisual[];
};

export interface AirportWorld {
  update(state: AirportState, delta: number): void;
  nextView(): void;
  pickFlight(clientX: number, clientY: number): number | null;
  pickRunway(clientX: number, clientY: number): number | null;
  selectFlight(id: number | null): void;
  flightScreenPosition(id: number): { x: number; y: number } | null;
  zoomIn(): void;
  zoomOut(): void;
  resetCamera(): void;
  setRunwayLabelsVisible(visible: boolean): void;
  diagnostics(): { drawCalls: number; triangles: number; geometries: number; textures: number; detail: 'low' | 'high'; pooledAircraft: number };
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

  const camera = new THREE.OrthographicCamera(-80, 80, 45, -45, 0.1, 500);
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

  buildLandscape(world, config);
  const airportBuild = buildAirport(world, config);
  const runwayLights = airportBuild.runwayLights;
  const swayingObjects = buildDetails(world, config, lowDetail);
  const clouds = buildClouds(scene, lowDetail);
  const rain = buildRain(scene, config.seed, lowDetail);
  const ripples = buildRipples(world, config);

  const flightVisuals = new Map<number, FlightVisual>();
  const flightPool = new Map<string, FlightVisual[]>();
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
  const cameraFocus = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.3);
  const zoomRaycaster = new THREE.Raycaster();
  const zoomNdc = new THREE.Vector2();
  const zoomGroundPoint = new THREE.Vector3();
  let nightMix = 0;
  let currentState: AirportState | null = null;
  let runwayLabelsVisible = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touchPoints = new Map<number, { x: number; y: number }>();
  let previousPinchDistance = 0;
  let previousPinchGround: THREE.Vector3 | null = null;

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
    const weatherFog = state.weather.condition === 'fog' ? 0.0074 : state.weather.condition === 'rain' ? 0.0052 : 0.0032;
    fog.density = THREE.MathUtils.lerp(fog.density, weatherFog, Math.min(1, delta * 0.9));
    nightMix = THREE.MathUtils.lerp(nightMix, state.nightMode ? 1 : 0, Math.min(1, delta * 2.2));
    const skyTarget = new THREE.Color(state.weather.condition === 'rain' ? 0x627675 : state.weather.condition === 'fog' ? 0x89938c : COLORS.sky);
    skyTarget.lerp(new THREE.Color(state.weather.condition === 'fog' ? 0x28343b : 0x091b29), nightMix);
    (scene.background as THREE.Color).lerp(skyTarget, Math.min(1, delta * 0.6));
    fog.color.lerp(skyTarget, Math.min(1, delta * 0.6));
    sun.intensity = THREE.MathUtils.lerp(2.25, 0.5, nightMix);
    sun.color.setHex(state.nightMode ? 0xa8c6df : 0xffd6a3);
    hemisphere.intensity = THREE.MathUtils.lerp(1.45, 0.62, nightMix);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(0.94, 0.86, nightMix);
    for (let index = 0; index < runwayLights.length; index += 1) {
      const light = runwayLights[index];
      const activeEnd = state.activeRunwayEnds[light.runwayId] ?? config.runways[light.runwayId]?.landingEnd;
      light.mesh.visible = !light.activeOnly || light.end === activeEnd;
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
      visual.marker.position.x = activeEnd * (runway.length / 2 - 3.1);
      visual.marker.scale.x = activeEnd;
      visual.marker.visible = state.closedRunway !== index && runway.role !== 'inactive';
      visual.closure.visible = state.closedRunway === index;
      for (const label of visual.labels) label.visible = runwayLabelsVisible;
    }
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
          visual.baseScale = 0.72;
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
      const spool = flight.phase === 'takeoff' ? 28 : flight.phase === 'approach' || flight.phase === 'landing' ? 16 : 8;
      for (const propeller of visual.propellers) propeller.rotation.z += delta * spool;
      const strobe = Math.sin(state.elapsed * 5.4 + flight.id * 0.7) > 0.72;
      for (const light of visual.navLights) {
        light.visible = nightMix > 0.02 || strobe;
        (light.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp(strobe ? 0.72 : 0.32, strobe ? 1 : 0.86, nightMix);
        light.scale.setScalar(strobe ? 1.55 : 1);
      }
      const landingLightsOn = flight.phase === 'approach' || flight.phase === 'landing' || flight.phase === 'taxi-out' || flight.phase === 'takeoff';
      visual.landingLamp.visible = landingLightsOn && nightMix > 0.02;
      visual.landingLight.intensity = landingLightsOn ? 3.8 * nightMix : 0;
      visual.beacon.intensity = (strobe ? 3.4 : 0.12) * THREE.MathUtils.lerp(0.45, 1.35, nightMix);
      updateContrail(visual, flight, state.elapsed);
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

    const view = views[viewIndex];
    const selected = selectedFlightId === null ? null : flightVisuals.get(selectedFlightId);
    if (selected) {
      const follow = 1 - Math.exp(-delta * 2.8);
      cameraFocus.lerp(new THREE.Vector2(selected.root.position.x, selected.root.position.y), follow);
    }
    const drift = reducedMotion ? 0 : 1;
    const orbit = view.phase + Math.sin(cameraTime * 0.035) * 0.13 * drift;
    const targetX = cameraFocus.x + Math.sin(cameraTime * 0.021) * 5 * drift;
    const targetY = cameraFocus.y + Math.cos(cameraTime * 0.017) * 3 * drift;
    camera.position.set(
      cameraFocus.x + Math.cos(orbit) * view.radius,
      cameraFocus.y + Math.sin(orbit) * view.radius,
      view.height,
    );
    camera.lookAt(targetX, targetY, 0);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
  }

  function isNearViewportEdge(position: THREE.Vector3): boolean {
    const clip = position.clone().project(camera);
    return Math.abs(clip.x) <= 1.12 && Math.abs(clip.y) <= 1.12;
  }

  function nextView(): void {
    viewIndex = (viewIndex + 1) % views.length;
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

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const before = groundPointAt(event.clientX, event.clientY);
    const minimumZoom = config.scope === 'center' ? 0.08 : 0.12;
    manualZoom = THREE.MathUtils.clamp(manualZoom * Math.exp(event.deltaY * 0.0014), minimumZoom, 3);
    updateProjection();
    const after = groundPointAt(event.clientX, event.clientY);
    if (before && after) {
      const focusLimit = config.scope === 'center' ? 170 : 110;
      cameraFocus.x = THREE.MathUtils.clamp(cameraFocus.x + before.x - after.x, -focusLimit, focusLimit);
      cameraFocus.y = THREE.MathUtils.clamp(cameraFocus.y + before.y - after.y, -focusLimit, focusLimit);
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.size === 2) {
      const [first, second] = [...touchPoints.values()];
      previousPinchDistance = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y));
      previousPinchGround = groundPointAt((first.x + second.x) / 2, (first.y + second.y) / 2);
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' || !touchPoints.has(event.pointerId)) return;
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.size !== 2) return;
    event.preventDefault();
    const [first, second] = [...touchPoints.values()];
    const distance = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y));
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const minimumZoom = config.scope === 'center' ? 0.08 : 0.12;
    manualZoom = THREE.MathUtils.clamp(manualZoom * previousPinchDistance / distance, minimumZoom, 3);
    updateProjection();
    const nextGround = groundPointAt(midpoint.x, midpoint.y);
    if (previousPinchGround && nextGround) {
      const focusLimit = config.scope === 'center' ? 170 : 110;
      cameraFocus.x = THREE.MathUtils.clamp(cameraFocus.x + previousPinchGround.x - nextGround.x, -focusLimit, focusLimit);
      cameraFocus.y = THREE.MathUtils.clamp(cameraFocus.y + previousPinchGround.y - nextGround.y, -focusLimit, focusLimit);
    }
    previousPinchDistance = distance;
    previousPinchGround = groundPointAt(midpoint.x, midpoint.y);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    touchPoints.delete(event.pointerId);
    if (touchPoints.size < 2) {
      previousPinchDistance = 0;
      previousPinchGround = null;
    }
  };

  function changeZoom(factor: number): void {
    const minimumZoom = config.scope === 'center' ? 0.08 : 0.12;
    manualZoom = THREE.MathUtils.clamp(manualZoom * factor, minimumZoom, 3);
    updateProjection();
  }

  function resetCamera(): void {
    manualZoom = 1;
    cameraFocus.set(0, 0);
    selectedFlightId = null;
    updateProjection();
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
    selectFlight(id) { selectedFlightId = id; },
    flightScreenPosition,
    zoomIn() { changeZoom(0.78); },
    zoomOut() { changeZoom(1.28); },
    resetCamera,
    setRunwayLabelsVisible(visible) {
      runwayLabelsVisible = visible;
      for (const runway of airportBuild.runwayVisuals) for (const label of runway.labels) label.visible = visible;
    },
    diagnostics() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        detail: lowDetail ? 'low' : 'high',
        pooledAircraft: [...flightPool.values()].reduce((sum, pool) => sum + pool.length, 0),
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
      for (const pool of flightPool.values()) for (const visual of pool) disposeObject(visual.root);
      flightPool.clear();
      disposeObject(scene);
      renderer.dispose();
    },
  };
}

function buildLandscape(root: THREE.Group, config: AirportConfig): void {
  const terrainColors = {
    coast: { ground: 0x6f8068, district: 0x829071 },
    highland: { ground: 0x756f55, district: 0x918868 },
    woodland: { ground: 0x4f6852, district: 0x687a5c },
  }[config.terrain];
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1000),
    new THREE.MeshStandardMaterial({ color: terrainColors.ground, roughness: 1 }),
  );
  ground.position.z = 1.24;
  ground.receiveShadow = true;
  root.add(ground);

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
      edge.position.set(0, side * (data.width / 2 - 0.7), 0.22);
      runway.add(edge);
    }
    const marker = new THREE.Group();
    marker.position.set(data.landingEnd * (data.length / 2 - 3.1), 0, 0.25);
    marker.scale.x = data.landingEnd;
    if (data.role === 'arrival' || data.role === 'mixed') {
      for (let bar = -3; bar <= 3; bar += 1) {
        const thresholdBar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.06), stripe);
        thresholdBar.position.set(0, bar * 0.92, 0);
        marker.add(thresholdBar);
      }
    }
    if (data.role === 'departure' || data.role === 'mixed') {
      const departureMaterial = new THREE.MeshBasicMaterial({ color: 0x79c8e8 });
      for (const side of [-1, 1]) {
        const chevron = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.38, 0.07), departureMaterial);
        chevron.position.set(-0.7, side * 1.5, 0.02);
        chevron.rotation.z = side * 0.38;
        marker.add(chevron);
      }
    }
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
    const addLight = (x: number, y: number, color: number, dayOpacity: number, nightOpacity: number, radius = 0.27, end?: -1 | 1, activeOnly = false): void => {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: dayOpacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const light = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 6), material);
      light.position.set(x, y, 0.45);
      runway.add(light);
      runwayLights.push({ mesh: light, dayOpacity, nightOpacity, phase: runwayIndex * 1.7 + runwayLights.length * 0.31, runwayId: runwayIndex, end, activeOnly });
    };
    const thresholdColor = PALETTE_COLOR[data.color];
    for (const end of [-1, 1] as const) {
      for (let lightIndex = 1; lightIndex <= 6; lightIndex += 1) {
        addLight(end * (data.length / 2 + lightIndex * 3.1), 0, thresholdColor, 0.36, 1, 0.38, end, true);
      }
    }
    const edgeLightCount = Math.max(8, Math.round(data.length / 6));
    for (let lightIndex = 0; lightIndex <= edgeLightCount; lightIndex += 1) {
      const x = -data.length / 2 + 2 + (data.length - 4) * lightIndex / edgeLightCount;
      addLight(x, -data.width / 2 + 0.38, 0xb9ddff, 0.14, 0.92);
      addLight(x, data.width / 2 - 0.38, 0xb9ddff, 0.14, 0.92);
    }
    for (const side of [-1, 1]) {
      addLight(-data.landingEnd * (data.length / 2 - 0.8), side * (data.width / 2 - 1.2), 0xff6d61, 0.18, 1, 0.32);
    }
    runwayVisuals.push({ marker, closure, labels });
    root.add(runway);
  });

  const taxiMaterial = new THREE.MeshStandardMaterial({ color: 0x515b58, roughness: 0.96 });
  const surfaceNodes = new Map(config.surfaceGraph.nodes.map((node) => [node.id, node]));
  for (const edge of config.surfaceGraph.edges) {
    if (edge.kind === 'runway') continue;
    const from = surfaceNodes.get(edge.from);
    const to = surfaceNodes.get(edge.to);
    if (!from || !to) continue;
    addTaxiPath(root, [
      new THREE.Vector3(from.position[0], from.position[1], 2),
      new THREE.Vector3(to.position[0], to.position[1], 2),
    ], taxiMaterial, edge.width);
  }
  for (const node of config.surfaceGraph.nodes.filter((item) => item.kind === 'hold-short')) {
    const runway = node.runwayId === undefined ? undefined : config.runways[node.runwayId];
    if (runway) addHoldShortMarking(root, runway, new THREE.Vector3(node.position[0], node.position[1], 2));
  }

  const terminalEnvelope = config.obstacles.find((obstacle) => obstacle.kind === 'terminal');
  const terminalCenter = terminalEnvelope?.center ?? config.terminal;
  const terminal = new THREE.Group();
  terminal.position.set(terminalCenter[0], terminalCenter[1], 1.7);
  const terminalMaterial = new THREE.MeshStandardMaterial({ color: COLORS.terminal, roughness: 0.78 });
  const buildingParts = config.code === 'ORD'
    ? [
      { size: [28, 3.2, 5.5] as const, position: [0, 0] as const },
      { size: [5.2, 9, 4.4] as const, position: [-9, 0] as const },
      { size: [5.2, 9, 4.4] as const, position: [0, 0] as const },
      { size: [5.2, 9, 4.4] as const, position: [9, 0] as const },
    ]
    : [{ size: [28, 9, 5.5] as const, position: [0, 0] as const }];
  for (const part of buildingParts) {
    const building = new THREE.Mesh(new THREE.BoxGeometry(...part.size), terminalMaterial);
    building.position.set(part.position[0], part.position[1], part.size[2] / 2);
    building.castShadow = true;
    terminal.add(building);
  }

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
  return { runwayLights, runwayVisuals };
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
    const angle = (index / treeCount) * Math.PI * 2 + Math.sin(index * 4.7 + config.seed) * 0.13;
    const radiusX = (config.code === 'ORD' ? 142 : 70) + (index % 5) * 3.5;
    const radiusY = (config.code === 'ORD' ? 112 : 50) + (index % 4) * 3.5;
    const x = Math.cos(angle) * radiusX;
    const y = Math.sin(angle) * radiusY;
    dummy.position.set(x, y, 2.95);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trunkInstances.setMatrixAt(index, dummy.matrix);
    const crownScale = 2.4 + (index % 3) * 0.35;
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
  rain.visible = state.weather.condition === 'rain';
  if (!rain.visible) return;
  const positions = rain.geometry.getAttribute('position') as THREE.BufferAttribute;
  const windTo = state.weather.windDirection + Math.PI;
  for (let index = 0; index < positions.count; index += 1) {
    let x = positions.getX(index) + Math.cos(windTo) * state.weather.windSpeed * delta * 0.16;
    let y = positions.getY(index) + Math.sin(windTo) * state.weather.windSpeed * delta * 0.16;
    let z = positions.getZ(index) - delta * 34;
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
  const engineOffsets = profile.engines === 4
    ? [-visual.engineOffset, -visual.engineOffset * 0.5, visual.engineOffset * 0.5, visual.engineOffset]
    : [-visual.engineOffset, visual.engineOffset];
  const propellers: THREE.Object3D[] = [];
  for (const offset of engineOffsets) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(visual.engineRadius, visual.engineRadius * 1.04, visual.engineLength, 12), engineMaterial);
    engine.rotation.z = -Math.PI / 2;
    engine.position.set(visual.bodyLength * 0.04, offset, -visual.bodyRadius * 0.85);
    engine.castShadow = true;
    body.add(engine);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.42), strutMaterial);
    pylon.position.set(visual.bodyLength * 0.04, offset, -visual.bodyRadius * 0.48);
    body.add(pylon);
    if (visual.propeller) {
      const prop = new THREE.Mesh(new THREE.CircleGeometry(visual.engineRadius * 1.35, 16), new THREE.MeshBasicMaterial({ color: 0xddd6bd, transparent: true, opacity: 0.56, side: THREE.DoubleSide }));
      prop.rotation.y = Math.PI / 2;
      prop.position.set(visual.bodyLength * 0.04 + visual.engineLength * 0.53, offset, -visual.bodyRadius * 0.85);
      body.add(prop);
      propellers.push(prop);
    }
  }

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
  const shadowCasters: THREE.Mesh[] = [];
  for (const part of [body, gear]) {
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
    propellers,
    navLights,
    landingLamp,
    landingLight,
    shadowCasters,
    contrail,
    beacon,
    halo,
    routePoint: new THREE.Vector3(),
    routeTangent: new THREE.Vector3(),
    renderedHeading: 0,
    poseInitialized: false,
    active: true,
  };
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
    visual.root.position.z += wheelOnSurfaceLift * groundFactor;
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
  visual.root.rotation.z = visual.renderedHeading;
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
  visual.root.rotation.x = motion.bank + airMotion;
  visual.root.rotation.y = -presentationPitch;
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
    // Preserve the simulated flare curve, but give its six-degree endpoint a
    // clearly readable ten-degree attitude in the distant ATC camera.
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

function addTaxiPath(root: THREE.Group, points: THREE.Vector3[], material: THREE.Material, width = 8): void {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const segments = 48;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const amount = index / segments;
    const point = curve.getPointAt(amount);
    const tangent = curve.getTangentAt(amount);
    const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize().multiplyScalar(width / 2);
    positions.push(point.x + normal.x, point.y + normal.y, 1.62);
    positions.push(point.x - normal.x, point.y - normal.y, 1.62);
    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const taxi = new THREE.Mesh(geometry, material);
  taxi.receiveShadow = true;
  root.add(taxi);

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

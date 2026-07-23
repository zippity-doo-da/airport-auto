import * as THREE from 'three';
import type { AirportConfig, FlightColor, RunwayConfig } from '../simulation/airportConfig';
import { aircraftProfile, type AircraftModel } from '../simulation/aircraftProfiles';
import { airlineProfile } from '../simulation/airlineProfiles';
import type { AirportState, Flight, FlightPhase } from '../simulation/types';

type FlightVisual = {
  root: THREE.Group;
  shadow: THREE.Mesh;
  gear: THREE.Group;
  propellers: THREE.Object3D[];
  beacon: THREE.PointLight;
  halo: THREE.Mesh;
  routePoint: THREE.Vector3;
  routeSample: THREE.Vector3;
  routeTangent: THREE.Vector3;
  routeSide: THREE.Vector3;
  routePhase: FlightPhase | null;
  route: THREE.CatmullRomCurve3 | null;
  active: boolean;
};

export interface AirportWorld {
  update(state: AirportState, delta: number): void;
  nextView(): void;
  pickFlight(clientX: number, clientY: number): number | null;
  pickRunway(clientX: number, clientY: number): number | null;
  selectFlight(id: number | null): void;
  flightScreenPosition(id: number): { x: number; y: number } | null;
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
  config = { ...config, terminal: findClearTerminalPosition(config) };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
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
  scene.add(sun);

  buildLandscape(world, config);
  buildAirport(world, config);
  const swayingObjects = buildDetails(world, config);
  const clouds = buildClouds(scene);
  const rain = buildRain(scene, config.seed);
  const ripples = buildRipples(world, config);

  const flightVisuals = new Map<number, FlightVisual>();
  const flightRoutes = new Map<string, THREE.CatmullRomCurve3>();
  let selectedFlightId: number | null = null;
  let viewIndex = 0;
  let cameraTime = 0;
  const views = [
    { radius: 190, height: 122, phase: 0, zoom: 1 },
    { radius: 174, height: 96, phase: 1.75, zoom: 0.92 },
    { radius: 210, height: 142, phase: 3.4, zoom: 1.18 },
    { radius: 242, height: 176, phase: 4.9, zoom: 1.55 },
  ];
  let viewportWidth = canvas.clientWidth;
  let viewportHeight = canvas.clientHeight;
  let manualZoom = 1;

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
    cameraTime += delta;
    const weatherFog = state.weather.condition === 'fog' ? 0.0074 : state.weather.condition === 'rain' ? 0.0052 : 0.0032;
    fog.density = THREE.MathUtils.lerp(fog.density, weatherFog, Math.min(1, delta * 0.9));
    const skyTarget = new THREE.Color(state.weather.condition === 'rain' ? 0x627675 : state.weather.condition === 'fog' ? 0x89938c : COLORS.sky);
    (scene.background as THREE.Color).lerp(skyTarget, Math.min(1, delta * 0.6));
    updateRain(rain, state, delta);
    for (const visual of flightVisuals.values()) visual.active = false;

    for (const flight of state.flights) {
      let visual = flightVisuals.get(flight.id);
      if (!visual) {
        visual = createPlane(flight);
        if (config.scope === 'center') {
          visual.root.scale.setScalar(0.72);
          visual.beacon.visible = false;
        } else {
          visual.root.scale.setScalar(0.92);
        }
        flightVisuals.set(flight.id, visual);
        world.add(visual.root);
      }
      visual.active = true;
      if (visual.routePhase !== flight.phase || !visual.route) {
        const gateSlot = config.scope === 'center' ? (flight.id - 1) % 16 : (flight.id - 1) % 8;
        const key = `${flight.runway}:${flight.operatingEnd}:${flight.phase}:${gateSlot}`;
        let route = flightRoutes.get(key);
        if (!route) {
          route = routeFor(config, flight.runway, flight.operatingEnd, flight.phase, flight.id, flight.aircraft);
          flightRoutes.set(key, route);
        }
        visual.route = route;
        visual.routePhase = flight.phase;
      }
      positionFlight(visual, flight, state.elapsed, visual.route);
      const spool = flight.phase === 'takeoff' ? 28 : flight.phase === 'approach' || flight.phase === 'landing' ? 16 : 8;
      for (const propeller of visual.propellers) propeller.rotation.z += delta * spool;
      visual.halo.visible = selectedFlightId === flight.id;
      visual.halo.scale.setScalar(1 + Math.sin(state.elapsed * 5) * 0.08);
    }

    for (const [id, visual] of flightVisuals) {
      if (!visual.active) {
        world.remove(visual.root);
        disposeObject(visual.root);
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
    const orbit = view.phase + Math.sin(cameraTime * 0.035) * 0.13;
    const targetX = Math.sin(cameraTime * 0.021) * 5;
    const targetY = Math.cos(cameraTime * 0.017) * 3;
    camera.position.set(Math.cos(orbit) * view.radius, Math.sin(orbit) * view.radius, view.height);
    camera.lookAt(targetX, targetY, 0);
    renderer.render(scene, camera);
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
    return visual ? project(visual.root.position) : null;
  }

  function pickFlight(clientX: number, clientY: number): number | null {
    let best: { id: number; distance: number } | null = null;
    for (const [id, visual] of flightVisuals) {
      const point = project(visual.root.position);
      const distance = Math.hypot(point.x - clientX, point.y - clientY);
      const hitRadius = config.scope === 'center' ? 30 : 44;
      if (distance < hitRadius && (!best || distance < best.distance)) best = { id, distance };
    }
    return best?.id ?? null;
  }

  function pickRunway(clientX: number, clientY: number): number | null {
    const thresholds = config.runways.map((runway) => runwayEnd(runway, runway.landingEnd, 0, 2.2));
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

  const onWheel = (event: WheelEvent): void => {
    if (config.scope !== 'center') return;
    event.preventDefault();
    manualZoom = THREE.MathUtils.clamp(manualZoom * Math.exp(event.deltaY * 0.001), 0.72, 1.9);
    updateProjection();
  };

  resize();
  window.addEventListener('resize', resize);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return {
    update,
    nextView,
    pickFlight,
    pickRunway,
    selectFlight(id) { selectedFlightId = id; },
    flightScreenPosition,
    resize,
    dispose() {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('wheel', onWheel);
      disposeObject(scene);
      renderer.dispose();
    },
  };
}

function buildLandscape(root: THREE.Group, config: AirportConfig): void {
  const terrainColors = {
    coast: { grass: COLORS.grass, meadow: COLORS.lightGrass, water: COLORS.water },
    highland: { grass: 0x756f55, meadow: 0x98906a, water: 0x456c71 },
    woodland: { grass: 0x4f6852, meadow: 0x70825d, water: 0x315f65 },
  }[config.terrain];
  if (config.code === 'ORD') {
    buildOhareGround(root);
    return;
  }
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(230, 96),
    new THREE.MeshStandardMaterial({ color: terrainColors.water, roughness: 0.36, metalness: 0.06 }),
  );
  water.position.z = -3.2;
  water.receiveShadow = true;
  root.add(water);

  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(94, 99, 5.5, 64),
    new THREE.MeshStandardMaterial({ color: terrainColors.grass, roughness: 0.92 }),
  );
  island.rotation.x = Math.PI / 2;
  island.scale.set(config.islandScale[0], config.islandScale[1], 1);
  island.position.z = -1.4;
  island.receiveShadow = true;
  island.castShadow = true;
  root.add(island);

  const meadow = new THREE.Mesh(
    new THREE.CircleGeometry(72, 64),
    new THREE.MeshStandardMaterial({ color: terrainColors.meadow, roughness: 1 }),
  );
  meadow.scale.y = 0.72;
  meadow.position.set(-9, 2, 1.38);
  meadow.receiveShadow = true;
  root.add(meadow);

  for (let index = 0; index < 9; index += 1) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.2 + (index % 3) * 0.45, 0),
      new THREE.MeshStandardMaterial({ color: index % 2 ? 0x8c9d8e : 0xb4b8a7, roughness: 1 }),
    );
    const angle = (index / 9) * Math.PI * 2 + 0.2;
    rock.position.set(Math.cos(angle) * 88, Math.sin(angle) * 66, 0.7);
    rock.scale.z = 0.65;
    rock.castShadow = true;
    root.add(rock);
  }
}

function buildOhareGround(root: THREE.Group): void {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 900),
    new THREE.MeshStandardMaterial({ color: 0x718064, roughness: 1 }),
  );
  ground.position.z = -1.35;
  ground.receiveShadow = true;
  root.add(ground);

  const districtMaterial = new THREE.MeshStandardMaterial({ color: 0x7f876f, roughness: 1 });
  for (let row = -2; row <= 2; row += 1) {
    for (let column = -3; column <= 3; column += 1) {
      if (Math.abs(row) <= 1 && Math.abs(column) <= 1) continue;
      const district = new THREE.Mesh(new THREE.PlaneGeometry(42, 26), districtMaterial);
      district.position.set(column * 66, row * 58, -1.18);
      district.rotation.z = (row + column) * 0.035;
      root.add(district);
    }
  }

  addHighway(root, new THREE.Vector3(-600, -92, -0.95), new THREE.Vector3(600, -92, -0.95), 10);
  addHighway(root, new THREE.Vector3(-600, 96, -0.95), new THREE.Vector3(600, 96, -0.95), 8);
  addHighway(root, new THREE.Vector3(-128, -450, -0.88), new THREE.Vector3(-128, 450, -0.88), 9);
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

function buildAirport(root: THREE.Group, config: AirportConfig): void {
  const asphalt = new THREE.MeshStandardMaterial({ color: COLORS.runway, roughness: 0.88 });
  const stripe = new THREE.MeshBasicMaterial({ color: COLORS.runwayLine });
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
    const landingX = data.landingEnd * (data.length / 2 - 3.1);
    for (let bar = -3; bar <= 3; bar += 1) {
      const thresholdBar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.06), stripe);
      thresholdBar.position.set(landingX, bar * 0.92, 0.25);
      runway.add(thresholdBar);
    }
    const takeoffX = -data.landingEnd * (data.length / 2 - 4.8);
    for (const side of [-1, 1]) {
      const chevron = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.42, 0.06), stripe);
      chevron.position.set(takeoffX, side * 1.45, 0.25);
      chevron.rotation.z = side * data.landingEnd * 0.38;
      runway.add(chevron);
    }
    const thresholdColor = PALETTE_COLOR[data.color];
    for (let lightIndex = 1; lightIndex <= 6; lightIndex += 1) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 6), new THREE.MeshBasicMaterial({ color: thresholdColor }));
      light.position.set(data.landingEnd * (data.length / 2 + lightIndex * 3.1), 0, 0.45);
      runway.add(light);
    }
    root.add(runway);
  });

  const taxiMaterial = new THREE.MeshStandardMaterial({ color: 0x515b58, roughness: 0.96 });
  const terminalCenter = new THREE.Vector3(config.terminal[0], config.terminal[1], 2);
  for (const apronSide of [-1, 1]) {
    addTaxiPath(root, [
      new THREE.Vector3(terminalCenter.x - 18, terminalCenter.y + apronSide * 7, 2),
      new THREE.Vector3(terminalCenter.x + 18, terminalCenter.y + apronSide * 7, 2),
    ], taxiMaterial);
  }
  config.runways.forEach((runway) => {
    const anchors: THREE.Vector3[] = [];
    if (runway.role === 'arrival' || runway.role === 'mixed') {
      anchors.push(runwayEnd(runway, -1, -5), runwayEnd(runway, 1, -5));
    }
    if (runway.role === 'departure' || runway.role === 'mixed') {
      for (const operatingEnd of [-1, 1] as const) {
        const holdShort = runwayEnd(runway, operatingEnd, 8);
        anchors.push(holdShort);
        addHoldShortMarking(root, runway, holdShort);
      }
    }
    for (const anchor of anchors) {
      for (const apronSide of [-1, 1]) {
        const apronGate = new THREE.Vector3(terminalCenter.x, terminalCenter.y + apronSide * 7, 2);
        addTaxiPath(root, taxiRoutePoints(config, runway, anchor, apronGate), taxiMaterial);
      }
    }
  });

  const terminal = new THREE.Group();
  terminal.position.set(config.terminal[0], config.terminal[1], 1.7);
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(28, 9, 5.5),
    new THREE.MeshStandardMaterial({ color: COLORS.terminal, roughness: 0.78 }),
  );
  building.position.z = 2.8;
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

  const tower = new THREE.Group();
  tower.position.set(config.terminal[0] - 17, config.terminal[1] + 6, 1.8);
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
}

function buildDetails(root: THREE.Group, config: AirportConfig): THREE.Object3D[] {
  const sway: THREE.Object3D[] = [];
  const treeDark = config.terrain === 'woodland' ? 0x3f604c : config.terrain === 'highland' ? 0x666b55 : 0x698169;
  const treeLight = config.terrain === 'woodland' ? 0x5e7958 : config.terrain === 'highland' ? 0x85866a : 0x8fa079;
  const treeMaterial = new THREE.MeshStandardMaterial({ color: treeDark, roughness: 1 });
  const treeLightMaterial = new THREE.MeshStandardMaterial({ color: treeLight, roughness: 1 });
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x7d6351, roughness: 1 });

  for (let index = 0; index < config.treeCount; index += 1) {
    const angle = (index / config.treeCount) * Math.PI * 2 + Math.sin(index * 4.7 + config.seed) * 0.13;
    const radiusX = (config.code === 'ORD' ? 142 : 70) + (index % 5) * 3.5;
    const radiusY = (config.code === 'ORD' ? 112 : 50) + (index % 4) * 3.5;
    const tree = new THREE.Group();
    tree.position.set(Math.cos(angle) * radiusX, Math.sin(angle) * radiusY, 1.2);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.52, 3.5, 6), trunkMaterial);
    trunk.rotation.x = Math.PI / 2;
    trunk.position.z = 1.75;
    tree.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 + (index % 3) * 0.35, 1), index % 3 ? treeMaterial : treeLightMaterial);
    crown.position.z = 4.4;
    crown.scale.set(1, 1, 1.22);
    crown.castShadow = true;
    tree.add(crown);
    root.add(tree);
    sway.push(crown);
  }

  const reedCount = config.code === 'ORD' ? 0 : 70;
  for (let index = 0; index < reedCount; index += 1) {
    const angle = index * 2.399;
    const radius = 74 + (index % 10) * 1.5;
    const reed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.08, 1.8 + (index % 3) * 0.4, 4),
      new THREE.MeshStandardMaterial({ color: index % 2 ? 0x7f916d : 0xb19d68, roughness: 1 }),
    );
    reed.rotation.x = Math.PI / 2;
    reed.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.74, 0.7);
    root.add(reed);
    sway.push(reed);
  }

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

function buildClouds(scene: THREE.Scene): THREE.Group[] {
  const clouds: THREE.Group[] = [];
  for (let index = 0; index < 4; index += 1) {
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

function buildRain(scene: THREE.Scene, seed: number): THREE.Points {
  const count = 420;
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
  if (config.code === 'ORD') return [];
  return Array.from({ length: 5 }, (_, index) => {
    const ripple = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 2.75, 36),
      new THREE.MeshBasicMaterial({ color: 0xe1efea, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    );
    ripple.position.set(-118 + index * 55, index % 2 ? 78 : -82, -2.9);
    root.add(ripple);
    return ripple;
  });
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
  for (const part of [body, gear]) {
    part.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = false;
    });
  }
  return {
    root,
    shadow,
    gear,
    propellers,
    beacon,
    halo,
    routePoint: new THREE.Vector3(),
    routeSample: new THREE.Vector3(),
    routeTangent: new THREE.Vector3(),
    routeSide: new THREE.Vector3(),
    routePhase: null,
    route: null,
    active: true,
  };
}

function positionFlight(visual: FlightVisual, flight: Flight, elapsed: number, curve: THREE.CatmullRomCurve3): void {
  // Preserve some forward velocity at brake release, then build speed through the ground roll.
  const routeProgress = flight.phase === 'takeoff'
    ? flight.progress * (0.55 + 0.45 * flight.progress)
    : flight.progress;
  const point = controlledRoutePoint(visual, flight, curve, routeProgress, visual.routePoint);
  const forwardSample = routeProgress < 0.998;
  const sampleProgress = forwardSample ? routeProgress + 0.002 : routeProgress - 0.002;
  const sample = controlledRoutePoint(visual, flight, curve, sampleProgress, visual.routeSample);
  const tangent = visual.routeTangent.copy(sample);
  if (forwardSample) {
    tangent.sub(point);
  } else {
    tangent.set(point.x - tangent.x, point.y - tangent.y, point.z - tangent.z);
  }
  tangent.normalize();
  visual.root.position.copy(point);
  const modelScale = visual.root.scale.x;
  const wheelOnSurfaceLift = Math.max(0.3, 1.29 * modelScale - 0.32);
  const isTaxiing = flight.phase === 'taxi-in' || flight.phase === 'resting' || flight.phase === 'taxi-out';
  const groundFactor = isTaxiing
    ? 1
    : flight.phase === 'landing'
      ? THREE.MathUtils.smoothstep(flight.progress, 0.15, 0.6)
      : flight.phase === 'takeoff'
        ? 1 - THREE.MathUtils.smoothstep(point.z, 2.15, 5.5)
      : 0;
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
  }
  visual.root.rotation.z = Math.atan2(tangent.y, tangent.x);
  const airborne = flight.phase === 'approach'
    || (flight.phase === 'landing' && groundFactor < 0.65)
    || (flight.phase === 'takeoff' && groundFactor < 0.55);
  visual.gear.visible = (flight.phase === 'approach' && flight.progress > 0.72)
    || flight.phase === 'landing'
    || flight.phase === 'taxi-in'
    || flight.phase === 'resting'
    || flight.phase === 'taxi-out'
    || (flight.phase === 'takeoff' && groundFactor > 0.12);
  visual.root.rotation.x = airborne ? Math.sin(elapsed * 0.8 + flight.id) * 0.035 : 0;
  visual.root.rotation.y = flight.phase === 'landing'
    ? -0.08 * (1 - flight.progress)
    : flight.phase === 'takeoff'
      ? Math.min(0.12, Math.max(0, point.z - 2.2) * 0.018)
      : 0;
  const visualAltitude = visual.root.position.z;
  const shadowSurface = isTaxiing ? 1.64 : 1.82;
  const heightAboveSurface = Math.max(0, visualAltitude - shadowSurface);
  const shadowOpacity = isTaxiing ? 0.2 : THREE.MathUtils.clamp(0.16 - heightAboveSurface * 0.018, 0, 0.16);
  const shadowScale = 0.72 + Math.max(0, 16 - visualAltitude) * 0.018;
  visual.shadow.position.z = shadowSurface - visualAltitude;
  visual.shadow.scale.set(1.9 * shadowScale, 0.7 * shadowScale, 1);
  visual.shadow.visible = shadowOpacity > 0.002;
  (visual.shadow.material as THREE.MeshBasicMaterial).opacity = shadowOpacity;
  visual.beacon.intensity = Math.sin(elapsed * 4.2 + flight.id) > 0.78 ? 2.6 : 0.15;
}

function controlledRoutePoint(
  visual: FlightVisual,
  flight: Flight,
  curve: THREE.CatmullRomCurve3,
  amount: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  curve.getPointAt(amount, target);
  if (flight.phase !== 'approach' || flight.controlPattern !== 'zigzag') return target;
  const start = THREE.MathUtils.clamp(flight.controlPatternStart ?? 0, 0, 0.94);
  const patternProgress = THREE.MathUtils.clamp((amount - start) / Math.max(0.06, 1 - start), 0, 1);
  const amplitude = visual.root.scale.x < 0.8 ? 18 : 10;
  const envelope = Math.sin(Math.PI * patternProgress);
  const offset = amplitude * envelope * envelope * Math.sin(patternProgress * Math.PI * 4);
  curve.getTangentAt(amount, visual.routeSide);
  const sideX = -visual.routeSide.y;
  const sideY = visual.routeSide.x;
  const sideLength = Math.hypot(sideX, sideY) || 1;
  target.x += offset * sideX / sideLength;
  target.y += offset * sideY / sideLength;
  return target;
}

function routeFor(config: AirportConfig, runwayId: number, operatingEnd: -1 | 1, phase: FlightPhase, flightId: number, aircraft: AircraftModel): THREE.CatmullRomCurve3 {
  const runway = config.runways[runwayId];
  const aircraftSpec = aircraftProfile(aircraft);
  const landingSign = operatingEnd;
  const takeoffSign = -landingSign as -1 | 1;
  const lateralSign = flightId % 2 ? 1 : -1;
  const terminal = new THREE.Vector3(config.terminal[0], config.terminal[1], 2);
  const gateColumns = config.scope === 'center' ? 8 : 4;
  const gateSlots = gateColumns * 2;
  const gateSlot = (flightId - 1) % gateSlots;
  terminal.x += (gateSlot % gateColumns - (gateColumns - 1) / 2) * (config.scope === 'center' ? 3.4 : 4.2);
  terminal.y += gateSlot < gateColumns ? -7 : 7;
  const landingThreshold = runwayEnd(runway, landingSign, -2, 4.2);
  const rolloutEnd = runwayEnd(runway, takeoffSign, -5, 2);
  const holdShort = runwayEnd(runway, landingSign, 8, 2);
  const takeoffStart = runwayEnd(runway, landingSign, -3, 2);
  const takeoffEnd = runwayEnd(runway, takeoffSign, -2, 2.2);
  const side = new THREE.Vector3(-Math.sin(runway.heading), Math.cos(runway.heading), 0);
  const routeByPhase: Record<FlightPhase, THREE.Vector3[]> = {
    approach: [
      runwayEnd(runway, landingSign, config.scope === 'center' ? 190 : 115, config.scope === 'center' ? 24 : 28).addScaledVector(side, config.scope === 'center' ? 0 : lateralSign * Math.min(42, aircraftSpec.turnRadiusM / 28)),
      runwayEnd(runway, landingSign, config.scope === 'center' ? 142 : 78, config.scope === 'center' ? 19 : 21).addScaledVector(side, config.scope === 'center' ? 0 : lateralSign * 25),
      runwayEnd(runway, landingSign, config.scope === 'center' ? 94 : 48, config.scope === 'center' ? 14 : 14).addScaledVector(side, config.scope === 'center' ? 0 : lateralSign * 8),
      ...(config.scope === 'center' ? [runwayEnd(runway, landingSign, 58, 10)] : []),
      runwayEnd(runway, landingSign, 25, 8),
      runwayEnd(runway, landingSign, 10, 5.5),
      landingThreshold,
    ],
    landing: [landingThreshold, runwayPoint(runway, landingSign * 0.72, 2.8), runwayPoint(runway, 0, 2.1), rolloutEnd],
    'taxi-in': taxiRoutePoints(config, runway, rolloutEnd, terminal),
    resting: [terminal, terminal.clone()],
    'taxi-out': taxiRoutePoints(config, runway, holdShort, terminal).reverse(),
    takeoff: [
      holdShort,
      takeoffStart,
      runwayPoint(runway, landingSign * 0.72, 2),
      runwayPoint(runway, landingSign * 0.22, 2),
      runwayPoint(runway, takeoffSign * 0.28, 2.02),
      runwayPoint(runway, takeoffSign * 0.68, 2.08),
      takeoffEnd,
      runwayEnd(runway, takeoffSign, 16, 5.5),
      runwayEnd(runway, takeoffSign, 48, 13),
      runwayEnd(runway, takeoffSign, 88, 25),
      runwayEnd(runway, takeoffSign, 128, 38),
    ],
  };
  const points = routeByPhase[phase];
  return new THREE.CatmullRomCurve3(points, false, 'centripetal');
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

function runwayPoint(runway: RunwayConfig, normalized: number, z = 2): THREE.Vector3 {
  const distance = normalized * runway.length / 2;
  return new THREE.Vector3(runway.center[0] + Math.cos(runway.heading) * distance, runway.center[1] + Math.sin(runway.heading) * distance, z);
}

function runwayEnd(runway: RunwayConfig, sign: number, beyond = 0, z = 2): THREE.Vector3 {
  const distance = sign * (runway.length / 2 + beyond);
  return new THREE.Vector3(runway.center[0] + Math.cos(runway.heading) * distance, runway.center[1] + Math.sin(runway.heading) * distance, z);
}

export function taxiRoutePoints(config: AirportConfig, runway: RunwayConfig, anchor: THREE.Vector3, gate: THREE.Vector3): THREE.Vector3[] {
  if (config.code === 'ORD') return oharePerimeterTaxiRoute(config, runway, anchor, gate);
  const center = new THREE.Vector3(config.terminal[0], config.terminal[1], 2);
  const runwaySide = new THREE.Vector3(-Math.sin(runway.heading), Math.cos(runway.heading), 0);
  if (center.clone().sub(anchor).dot(runwaySide) < 0) runwaySide.multiplyScalar(-1);
  const turnoff = anchor.clone().addScaledVector(runwaySide, 8);
  const detourSign = turnoff.x >= center.x ? 1 : -1;
  const perimeterX = center.x + detourSign * 18;
  return [
    anchor.clone(),
    turnoff,
    new THREE.Vector3(perimeterX, turnoff.y, 2),
    new THREE.Vector3(perimeterX, gate.y, 2),
    gate.clone(),
  ];
}

function oharePerimeterTaxiRoute(config: AirportConfig, runway: RunwayConfig, anchor: THREE.Vector3, gate: THREE.Vector3): THREE.Vector3[] {
  const padding = 14;
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  for (const item of config.runways) {
    const extentX = Math.abs(Math.cos(item.heading)) * item.length / 2 + item.width / 2;
    const extentY = Math.abs(Math.sin(item.heading)) * item.length / 2 + item.width / 2;
    left = Math.min(left, item.center[0] - extentX - padding);
    right = Math.max(right, item.center[0] + extentX + padding);
    bottom = Math.min(bottom, item.center[1] - extentY - padding);
    top = Math.max(top, item.center[1] + extentY + padding);
  }
  right = Math.max(right, config.terminal[0] + 28);

  const direction = new THREE.Vector3(Math.cos(runway.heading), Math.sin(runway.heading), 0);
  const sign = anchor.clone().sub(new THREE.Vector3(runway.center[0], runway.center[1], 2)).dot(direction) >= 0 ? 1 : -1;
  const exit = runwayEnd(runway, sign, 12, 2);
  const outward = direction.clone().multiplyScalar(sign);
  const points = [anchor.clone(), exit];

  if (Math.abs(outward.x) >= Math.abs(outward.y)) {
    if (outward.x > 0) {
      points.push(new THREE.Vector3(right, exit.y, 2), new THREE.Vector3(right, gate.y, 2));
    } else {
      const outerY = exit.y >= 0 ? top : bottom;
      points.push(
        new THREE.Vector3(left, exit.y, 2),
        new THREE.Vector3(left, outerY, 2),
        new THREE.Vector3(right, outerY, 2),
        new THREE.Vector3(right, gate.y, 2),
      );
    }
  } else {
    const outerY = outward.y > 0 ? top : bottom;
    points.push(
      new THREE.Vector3(exit.x, outerY, 2),
      new THREE.Vector3(right, outerY, 2),
      new THREE.Vector3(right, gate.y, 2),
    );
  }

  points.push(gate.clone());
  return points;
}

function addTaxiPath(root: THREE.Group, points: THREE.Vector3[], material: THREE.Material): void {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const segments = 48;
  const width = 8;
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

function findClearTerminalPosition(config: AirportConfig): [number, number] {
  const preferred = new THREE.Vector2(...config.terminal);
  const candidates = [
    preferred,
    ...[52, 62, 72].flatMap((radius) => [
      new THREE.Vector2(0, radius),
      new THREE.Vector2(radius, 0),
      new THREE.Vector2(0, -radius),
      new THREE.Vector2(-radius, 0),
      new THREE.Vector2(radius * 0.72, radius * 0.72),
      new THREE.Vector2(-radius * 0.72, radius * 0.72),
      new THREE.Vector2(radius * 0.72, -radius * 0.72),
      new THREE.Vector2(-radius * 0.72, -radius * 0.72),
    ]),
  ];

  const isClear = (terminal: THREE.Vector2): boolean => {
    const tower = terminal.clone().add(new THREE.Vector2(-17, 6));
    return config.runways.every((runway) => {
      const direction = new THREE.Vector2(Math.cos(runway.heading), Math.sin(runway.heading));
      const half = direction.clone().multiplyScalar(runway.length / 2);
      const start = new THREE.Vector2(...runway.center).sub(half);
      const end = new THREE.Vector2(...runway.center).add(half);
      const runwayMargin = runway.width / 2 + 3;
      return distanceToSegment(terminal, start, end) > 16 + runwayMargin
        && distanceToSegment(tower, start, end) > 5.5 + runwayMargin;
    });
  };

  return (candidates.find(isClear) ?? preferred).toArray() as [number, number];
}

function distanceToSegment(point: THREE.Vector2, start: THREE.Vector2, end: THREE.Vector2): number {
  const segment = end.clone().sub(start);
  const lengthSquared = segment.lengthSq();
  if (lengthSquared === 0) return point.distanceTo(start);
  const amount = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSquared, 0, 1);
  return point.distanceTo(start.clone().addScaledVector(segment, amount));
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    } else if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  });
}

import * as THREE from "three";
import {
  aircraftProfile,
  type AircraftVisualFamily,
  type AircraftVisualSpec,
} from "../simulation/aircraftProfiles";
import {
  airlineLiveryStyle,
  airlineProfile,
  type AirlineLiveryStyle,
} from "../simulation/airlineProfiles";
import type { AircraftSystemsState } from "../simulation/aircraftSystems";
import type { Flight } from "../simulation/types";

export const AIRCRAFT_ASSET_BUDGETS = {
  high: {
    meshNodes: 61,
    materials: 31,
    textures: 1,
    triangles: 5_200,
    geometryBytes: 128 * 1_024,
  },
  low: {
    meshNodes: 46,
    materials: 28,
    textures: 0,
    triangles: 2_100,
    geometryBytes: 56 * 1_024,
  },
} as const;

export interface AircraftVisual {
  poolKey: string;
  family: AircraftVisualFamily;
  root: THREE.Group;
  baseScale: number;
  shadow: THREE.Mesh;
  gear: THREE.Group;
  tug: THREE.Group;
  tugBeacon: THREE.Mesh;
  propellers: THREE.Object3D[];
  engineIndicators: THREE.Mesh[];
  flaps: THREE.Mesh[];
  slats: THREE.Mesh[];
  spoilers: THREE.Mesh[];
  reversers: THREE.Mesh[];
  navLights: THREE.Mesh[];
  strobeLights: THREE.Mesh[];
  recognitionLights: THREE.Mesh[];
  beaconLamp: THREE.Mesh;
  landingLamp: THREE.Mesh;
  taxiLamp: THREE.Mesh;
  landingLight: THREE.PointLight;
  shadowCasters: THREE.Mesh[];
  deicingSpray: THREE.Group;
  exhaust: THREE.Group;
  condensation: THREE.Group;
  tireSmoke: THREE.Group;
  surfaceSpray: THREE.Group;
  beacon: THREE.PointLight;
  halo: THREE.Mesh;
  routePoint: THREE.Vector3;
  routeTangent: THREE.Vector3;
  renderedHeading: number;
  poseInitialized: boolean;
  active: boolean;
  assetCounts: {
    meshes: number;
    materials: number;
    textures: number;
    triangles: number;
    geometryBytes: number;
  };
}

export function aircraftPoolKey(
  flight: Pick<Flight, "aircraft" | "airline" | "palette">,
): string {
  return `${flight.aircraft}:${flight.airline}:${flight.palette}`;
}

export function applyAircraftVisualSystems(
  visual: AircraftVisual,
  systems: AircraftSystemsState,
  flight: Pick<Flight, "id" | "phase" | "engineState">,
  elapsedSeconds: number,
  deltaSeconds: number,
  nightMix: number,
): void {
  const operationalSpool =
    flight.phase === "takeoff"
      ? 28
      : flight.phase === "approach" || flight.phase === "landing"
        ? 16
        : 8;
  const spool =
    flight.engineState === "off"
      ? 0
      : flight.engineState === "starting"
        ? 3 + (0.5 + Math.sin(elapsedSeconds * 3.2 + flight.id) * 0.5) * 6
        : operationalSpool;
  for (const propeller of visual.propellers)
    propeller.rotation.z += deltaSeconds * spool;
  const enginePulse =
    0.5 + Math.sin(elapsedSeconds * 4.6 + flight.id * 0.8) * 0.5;
  for (const indicator of visual.engineIndicators) {
    const material = indicator.material as THREE.MeshBasicMaterial;
    indicator.visible = flight.engineState !== "off";
    material.color.setHex(
      flight.engineState === "starting" ? 0xffb45f : 0x789c9a,
    );
    material.opacity =
      flight.engineState === "starting" ? 0.2 + enginePulse * 0.48 : 0.22;
  }

  visual.gear.visible = systems.gearExtension > 0.025;
  visual.gear.position.z = (1 - systems.gearExtension) * 0.72;
  visual.gear.scale.z = Math.max(0.08, systems.gearExtension);
  for (const flap of visual.flaps) {
    flap.rotation.y = systems.flapExtension * 0.42;
    flap.position.z =
      Number(flap.userData.baseZ ?? flap.position.z) -
      systems.flapExtension * 0.09;
  }
  for (const slat of visual.slats) {
    slat.position.x =
      Number(slat.userData.baseX ?? slat.position.x) +
      systems.slatExtension * 0.22;
  }
  for (const spoiler of visual.spoilers) {
    spoiler.rotation.y = -systems.spoilerExtension * 0.62;
    spoiler.position.z =
      Number(spoiler.userData.baseZ ?? spoiler.position.z) +
      systems.spoilerExtension * 0.08;
  }
  for (const reverser of visual.reversers) {
    reverser.position.x =
      Number(reverser.userData.baseX ?? reverser.position.x) -
      systems.reverserExtension * 0.24;
    if (!(reverser instanceof THREE.InstancedMesh)) {
      reverser.scale.set(1 + systems.reverserExtension * 0.1, 1.08, 1.08);
    }
  }

  for (const light of visual.navLights) {
    light.visible = systems.lights.navigation && nightMix > 0.015;
    setOpacity(light, THREE.MathUtils.lerp(0.42, 0.94, nightMix));
  }
  for (const light of visual.strobeLights) {
    light.visible = systems.lights.strobe && systems.lights.strobePulse > 0;
    if (!(light instanceof THREE.InstancedMesh)) {
      light.scale.setScalar(1 + systems.lights.strobePulse * 0.75);
    }
    setOpacity(light, systems.lights.strobePulse);
  }
  visual.beaconLamp.visible =
    systems.lights.beacon && systems.lights.beaconPulse > 0;
  visual.beaconLamp.scale.setScalar(0.85 + systems.lights.beaconPulse * 0.7);
  setOpacity(visual.beaconLamp, 0.28 + systems.lights.beaconPulse * 0.72);
  visual.landingLamp.visible = systems.lights.landing && nightMix > 0.015;
  visual.taxiLamp.visible = systems.lights.taxi && nightMix > 0.015;
  for (const light of visual.recognitionLights) {
    light.visible = systems.lights.recognition && nightMix > 0.08;
    setOpacity(light, 0.42 + nightMix * 0.46);
  }
  visual.landingLight.intensity = systems.lights.landing
    ? 3.8 * nightMix
    : systems.lights.taxi
      ? 1.5 * nightMix
      : 0;
  visual.beacon.intensity = systems.lights.beacon
    ? systems.lights.beaconPulse * THREE.MathUtils.lerp(1.8, 4.6, nightMix)
    : 0;

  updateEffect(
    visual.exhaust,
    systems.effects.exhaust,
    elapsedSeconds,
    flight.id,
    0.45,
    1.35,
  );
  updateEffect(
    visual.condensation,
    systems.effects.condensation,
    elapsedSeconds,
    flight.id,
    0.62,
    1.8,
  );
  updateEffect(
    visual.tireSmoke,
    systems.effects.tireSmoke,
    elapsedSeconds,
    flight.id,
    0.72,
    2.2,
  );
  updateEffect(
    visual.surfaceSpray,
    systems.effects.surfaceSpray,
    elapsedSeconds,
    flight.id,
    0.6,
    1.85,
  );
}

/** Build one original low-poly aircraft family without external model assets. */
export function createAircraftVisual(
  flight: Pick<Flight, "aircraft" | "airline" | "palette">,
  highlightColor: number,
  lowDetail: boolean,
): AircraftVisual {
  const profile = aircraftProfile(flight.aircraft);
  const airline = airlineProfile(flight.airline);
  const visual = profile.visual;
  const segments = lowDetail ? 8 : 14;
  const root = new THREE.Group();
  root.name = `aircraft-${profile.model}-${visual.family}`;
  const body = new THREE.Group();
  body.name = "airframe";
  root.add(body);

  const paint = standardMaterial(airline.primaryColor, 0.46, 0.05);
  const accent = standardMaterial(airline.accentColor, 0.4, 0.08);
  const wingPaint = standardMaterial(0xf1eadc, 0.5, 0.04);
  const dark = standardMaterial(0x293d40, 0.42, 0.1);
  const structure = standardMaterial(0x707978, 0.6, 0.25);
  const engineMaterial = standardMaterial(0x6d7774, 0.55, 0.22);
  const wheelMaterial = standardMaterial(0x202a2b, 0.9, 0.02);

  addFuselage(body, visual, paint, segments, flight.aircraft === "B748");
  addLivery(
    body,
    visual,
    accent,
    airlineLiveryStyle(flight.airline),
    lowDetail,
  );
  addCockpit(body, visual, dark, segments, visual.family);
  addWingFamily(body, visual, wingPaint, accent, lowDetail);
  addTailFamily(body, visual, wingPaint, paint, accent, lowDetail);
  addWindowsAndIdentification(
    body,
    visual,
    dark,
    accent,
    `${flight.airline} · ${flight.aircraft}`,
    lowDetail,
  );
  if (visual.cargoDoor) addCargoDoor(body, visual, accent, dark);

  const controlSurfaces = addControlSurfaces(
    body,
    visual,
    wingPaint,
    accent,
    lowDetail,
  );
  const engineBuild = addEngines(
    body,
    profile.engines,
    visual,
    engineMaterial,
    structure,
    lowDetail,
  );
  const lighting = addAircraftLights(body, visual, lowDetail);
  const tugBuild = addTug(root, visual, structure, wheelMaterial, lowDetail);
  const gear = addLandingGear(
    root,
    visual,
    structure,
    wheelMaterial,
    visual.family,
    lowDetail,
  );
  const effects = addAircraftEffects(
    root,
    visual,
    engineBuild.engineOffsets,
    lowDetail,
  );

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(
      Math.max(2.3, visual.bodyLength * 0.38),
      lowDetail ? 12 : 24,
    ),
    new THREE.MeshBasicMaterial({
      color: 0x304847,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );
  shadow.name = "aircraft-shadow";
  shadow.scale.set(1.9, 0.7, 1);
  shadow.position.z = -1;
  root.add(shadow);

  const beacon = new THREE.PointLight(0xff806f, 0, 12, 2);
  beacon.name = "anti-collision-beacon-light";
  beacon.position.copy(lighting.beaconLamp.position);
  if (!lowDetail) body.add(beacon);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(4.4, 5.1, lowDetail ? 20 : 40),
    new THREE.MeshBasicMaterial({
      color: highlightColor,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  halo.name = "selection-halo";
  halo.visible = false;
  halo.position.z = -0.7;
  root.add(halo);

  const shadowCasters: THREE.Mesh[] = [];
  for (const part of [body, gear, tugBuild.tug]) {
    part.traverse((object) => {
      if (object instanceof THREE.Mesh && object.castShadow)
        shadowCasters.push(object);
    });
  }
  const assetCounts = countAircraftAssets(root);

  return {
    poolKey: aircraftPoolKey(flight),
    family: visual.family,
    root,
    baseScale: 1,
    shadow,
    gear,
    tug: tugBuild.tug,
    tugBeacon: tugBuild.beacon,
    propellers: engineBuild.propellers,
    engineIndicators: engineBuild.indicators,
    flaps: controlSurfaces.flaps,
    slats: controlSurfaces.slats,
    spoilers: controlSurfaces.spoilers,
    reversers: engineBuild.reversers,
    navLights: lighting.navigation,
    strobeLights: lighting.strobes,
    recognitionLights: lighting.recognition,
    beaconLamp: lighting.beaconLamp,
    landingLamp: lighting.landingLamp,
    taxiLamp: lighting.taxiLamp,
    landingLight: lighting.landingLight,
    shadowCasters,
    deicingSpray: effects.deicingSpray,
    exhaust: effects.exhaust,
    condensation: effects.condensation,
    tireSmoke: effects.tireSmoke,
    surfaceSpray: effects.surfaceSpray,
    beacon,
    halo,
    routePoint: new THREE.Vector3(),
    routeTangent: new THREE.Vector3(),
    renderedHeading: 0,
    poseInitialized: false,
    active: true,
    assetCounts,
  };
}

function addFuselage(
  body: THREE.Group,
  visual: AircraftVisualSpec,
  paint: THREE.Material,
  segments: number,
  upperDeck: boolean,
): void {
  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(
      visual.bodyRadius,
      visual.bodyRadius * 1.03,
      visual.bodyLength,
      segments,
    ),
    paint,
  );
  fuselage.name = "fuselage";
  fuselage.rotation.z = -Math.PI / 2;
  fuselage.castShadow = true;
  body.add(fuselage);
  const noseLength =
    visual.family === "boeing-widebody" || visual.family === "freighter"
      ? 1.65
      : 1.42;
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(
      visual.bodyRadius * 1.01,
      segments,
      Math.max(5, segments / 2),
    ),
    paint,
  );
  nose.name = "nose";
  nose.scale.set(
    noseLength,
    0.96,
    visual.family === "ga-high-wing" ? 0.84 : 0.96,
  );
  nose.position.x = visual.bodyLength / 2 + visual.bodyRadius * 0.55;
  nose.castShadow = true;
  body.add(nose);
  const tailCap = new THREE.Mesh(
    new THREE.SphereGeometry(
      visual.bodyRadius * 0.98,
      segments,
      Math.max(5, segments / 2),
    ),
    paint,
  );
  tailCap.name = "tail-cone";
  tailCap.scale.set(visual.tailStyle === "t-tail" ? 1.16 : 0.8, 0.92, 0.92);
  tailCap.position.x = -visual.bodyLength / 2 - visual.bodyRadius * 0.2;
  body.add(tailCap);
  if (upperDeck) {
    const deck = new THREE.Mesh(
      new THREE.SphereGeometry(
        visual.bodyRadius * 0.92,
        segments,
        Math.max(5, segments / 2),
      ),
      paint,
    );
    deck.name = "747-upper-deck";
    deck.scale.set(2.45, 0.9, 0.58);
    deck.position.set(visual.bodyLength * 0.2, 0, visual.bodyRadius * 0.74);
    deck.castShadow = true;
    body.add(deck);
  }
}

function addLivery(
  body: THREE.Group,
  visual: AircraftVisualSpec,
  accent: THREE.Material,
  style: AirlineLiveryStyle,
  lowDetail: boolean,
): void {
  const stripeLength =
    visual.bodyLength *
    (style === "tail-band"
      ? 0.3
      : style === "minimal"
        ? 0.24
        : visual.cargoDoor
          ? 0.5
          : 0.72);
  const stripeX =
    style === "tail-band"
      ? -visual.bodyLength * 0.24
      : style === "minimal"
        ? visual.bodyLength * 0.24
        : visual.bodyLength * 0.02;
  const stripeZ =
    style === "belly-sweep"
      ? -visual.bodyRadius * 0.28
      : style === "tail-band"
        ? visual.bodyRadius * 0.24
        : visual.bodyRadius * 0.12;
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(
        stripeLength,
        0.035,
        Math.max(0.06, visual.bodyRadius * 0.12),
      ),
      accent,
    );
    stripe.name = `original-livery-${style}`;
    stripe.position.set(stripeX, side * visual.bodyRadius * 1.015, stripeZ);
    stripe.rotation.y =
      style === "tail-band" ? -0.34 : style === "belly-sweep" ? 0.16 : 0;
    body.add(stripe);
  }
  if (lowDetail || (style !== "belly-sweep" && style !== "ribbon")) return;
  const bellyMark = new THREE.Mesh(
    new THREE.BoxGeometry(
      visual.bodyLength * 0.28,
      visual.bodyRadius * 1.9,
      0.035,
    ),
    accent,
  );
  bellyMark.name = `original-livery-${style}-belly-mark`;
  bellyMark.position.set(
    -visual.bodyLength * 0.13,
    0,
    -visual.bodyRadius * 1.015,
  );
  body.add(bellyMark);
}

function addCockpit(
  body: THREE.Group,
  visual: AircraftVisualSpec,
  dark: THREE.Material,
  segments: number,
  family: AircraftVisualFamily,
): void {
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(
      visual.bodyRadius * 0.82,
      segments,
      Math.max(5, segments / 2),
    ),
    dark,
  );
  cockpit.name = "cockpit-glazing";
  cockpit.scale.set(
    family === "airbus-narrowbody" || family === "airbus-widebody" ? 1.08 : 1.3,
    0.78,
    0.43,
  );
  cockpit.position.set(visual.bodyLength * 0.33, 0, visual.bodyRadius * 0.92);
  body.add(cockpit);
}

function addWingFamily(
  body: THREE.Group,
  visual: AircraftVisualSpec,
  material: THREE.Material,
  accent: THREE.Material,
  lowDetail: boolean,
): void {
  const shape = new THREE.Shape();
  const rootX =
    visual.bodyLength * (visual.family === "ga-high-wing" ? 0.02 : 0.08);
  const tipX = rootX - visual.wingSweep;
  const halfSpan = visual.wingSpan / 2;
  const rootChord =
    visual.family === "airbus-widebody" ||
    visual.family === "boeing-widebody" ||
    visual.family === "jumbo" ||
    visual.family === "freighter"
      ? 1.55
      : 1.1;
  const tipChord =
    visual.family === "ga-high-wing" ||
    visual.family === "regional-high-wing-turboprop"
      ? 0.46
      : 0.72;
  shape.moveTo(rootX + rootChord, 0);
  shape.lineTo(tipX + tipChord * 0.28, halfSpan);
  shape.lineTo(tipX - tipChord, halfSpan - 0.18);
  shape.lineTo(rootX - rootChord * 0.58, 0);
  shape.lineTo(tipX - tipChord, -halfSpan + 0.18);
  shape.lineTo(tipX + tipChord * 0.28, -halfSpan);
  shape.closePath();
  const wing = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: lowDetail ? 0.16 : 0.22,
      bevelEnabled: false,
    }),
    material,
  );
  wing.name = `${visual.family}-wing`;
  wing.position.z =
    visual.wingMount === "high"
      ? visual.bodyRadius * 0.68
      : -visual.bodyRadius * 0.12;
  wing.castShadow = true;
  body.add(wing);

  if (visual.winglets && visual.winglets !== "none") {
    for (const side of [-1, 1]) {
      const raked = visual.winglets === "raked";
      const winglet = new THREE.Mesh(
        new THREE.BoxGeometry(
          raked ? 0.85 : 0.16,
          raked ? 0.58 : 0.22,
          raked ? 0.08 : 0.54,
        ),
        accent,
      );
      winglet.name = `${visual.winglets}-wingtip`;
      winglet.position.set(
        tipX - (raked ? 0.26 : 0),
        side * (halfSpan - 0.04),
        wing.position.z + (raked ? 0.1 : 0.25),
      );
      winglet.rotation.x = side * (raked ? 0.14 : 0.34);
      winglet.rotation.y = raked ? -0.28 : -0.1;
      body.add(winglet);
    }
  }
  if (
    !lowDetail &&
    (visual.family === "ga-high-wing" ||
      visual.family === "regional-high-wing-turboprop")
  ) {
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, halfSpan * 0.55, 0.12),
        material,
      );
      strut.name = "high-wing-brace";
      strut.position.set(
        rootX - 0.1,
        side * halfSpan * 0.28,
        visual.bodyRadius * 0.08,
      );
      strut.rotation.x = side * 0.36;
      body.add(strut);
    }
  }
}

function addTailFamily(
  body: THREE.Group,
  visual: AircraftVisualSpec,
  tailMaterial: THREE.Material,
  paint: THREE.Material,
  accent: THREE.Material,
  lowDetail: boolean,
): void {
  const tailRoot = -visual.bodyLength * 0.34;
  const tailSpan =
    visual.wingSpan * (visual.family === "business-jet" ? 0.27 : 0.22);
  const tailZ =
    visual.tailStyle === "t-tail"
      ? visual.tailHeight * 0.78
      : visual.bodyRadius * 0.12;
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(
      Math.max(0.72, visual.bodyLength * 0.14),
      tailSpan * 2,
      lowDetail ? 0.11 : 0.16,
    ),
    tailMaterial,
  );
  tail.name =
    visual.tailStyle === "t-tail"
      ? "t-tail-horizontal-stabilizer"
      : "horizontal-stabilizer";
  tail.position.set(tailRoot, 0, tailZ);
  tail.rotation.z = -visual.wingSweep * 0.04;
  tail.castShadow = true;
  body.add(tail);

  const finShape = new THREE.Shape();
  finShape.moveTo(-0.62, 0);
  finShape.lineTo(-0.24, visual.tailHeight);
  finShape.lineTo(0.2, visual.tailHeight * 0.84);
  finShape.lineTo(0.62, 0);
  finShape.closePath();
  const fin = new THREE.Mesh(
    new THREE.ExtrudeGeometry(finShape, {
      depth: lowDetail ? 0.12 : 0.18,
      bevelEnabled: false,
    }),
    paint,
  );
  fin.name = "vertical-stabilizer";
  fin.rotation.x = Math.PI / 2;
  fin.position.set(-visual.bodyLength * 0.39, 0.08, visual.bodyRadius * 0.1);
  fin.castShadow = true;
  body.add(fin);
  const tailMark = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.22, visual.tailHeight * 0.5),
    accent,
  );
  tailMark.name = "airline-tail-mark";
  tailMark.position.set(
    -visual.bodyLength * 0.4,
    0,
    visual.bodyRadius * 0.2 + visual.tailHeight * 0.45,
  );
  tailMark.rotation.y = -0.15;
  body.add(tailMark);
}

function addWindowsAndIdentification(
  body: THREE.Group,
  visual: AircraftVisualSpec,
  dark: THREE.Material,
  accent: THREE.Material,
  identifier: string,
  lowDetail: boolean,
): void {
  if (visual.passengerWindows) {
    const count = Math.max(
      3,
      Math.min(lowDetail ? 7 : 18, Math.round(visual.bodyLength * 1.7)),
    );
    const windowGeometry = new THREE.BoxGeometry(0.11, 0.035, 0.09);
    const windows = new THREE.InstancedMesh(windowGeometry, dark, count * 2);
    windows.name = "passenger-window-row";
    const matrix = new THREE.Matrix4();
    const start = -visual.bodyLength * 0.31;
    const span = visual.bodyLength * 0.56;
    for (let index = 0; index < count; index += 1) {
      const x = start + (index / Math.max(1, count - 1)) * span;
      for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
        const side = sideIndex === 0 ? -1 : 1;
        matrix.makeTranslation(
          x,
          side * visual.bodyRadius * 1.025,
          visual.bodyRadius * 0.34,
        );
        windows.setMatrixAt(index * 2 + sideIndex, matrix);
      }
    }
    windows.instanceMatrix.needsUpdate = true;
    body.add(windows);
  }
  if (lowDetail || typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 40;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f4eee0";
  context.font = "700 20px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(identifier, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
    }),
  );
  label.name = "aircraft-identification";
  label.position.set(
    -visual.bodyLength * 0.04,
    -visual.bodyRadius * 1.08,
    visual.bodyRadius * 0.08,
  );
  label.scale.set(Math.min(2.8, visual.bodyLength * 0.38), 0.58, 1);
  body.add(label);
  const noseMark = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.05, 0.24),
    accent,
  );
  noseMark.name = "fleet-mark";
  noseMark.position.set(
    visual.bodyLength * 0.28,
    visual.bodyRadius * 1.02,
    visual.bodyRadius * 0.12,
  );
  body.add(noseMark);
}

function addCargoDoor(
  body: THREE.Group,
  visual: AircraftVisualSpec,
  accent: THREE.Material,
  dark: THREE.Material,
): void {
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(
      Math.max(0.8, visual.bodyLength * 0.16),
      0.045,
      visual.bodyRadius * 1.05,
    ),
    accent,
  );
  door.name = "main-deck-cargo-door";
  door.position.set(
    visual.bodyLength * 0.19,
    -visual.bodyRadius * 1.03,
    visual.bodyRadius * 0.08,
  );
  body.add(door);
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(
      Math.max(0.65, visual.bodyLength * 0.13),
      0.055,
      0.08,
    ),
    dark,
  );
  sill.position.set(
    door.position.x,
    door.position.y - 0.01,
    -visual.bodyRadius * 0.42,
  );
  body.add(sill);
}

function addControlSurfaces(
  body: THREE.Group,
  visual: AircraftVisualSpec,
  wingMaterial: THREE.Material,
  accent: THREE.Material,
  lowDetail: boolean,
): { flaps: THREE.Mesh[]; slats: THREE.Mesh[]; spoilers: THREE.Mesh[] } {
  const flaps: THREE.Mesh[] = [];
  const slats: THREE.Mesh[] = [];
  const spoilers: THREE.Mesh[] = [];
  const wingZ =
    visual.wingMount === "high"
      ? visual.bodyRadius * 0.68
      : -visual.bodyRadius * 0.1;
  const span = visual.wingSpan * 0.24;
  for (const side of [-1, 1]) {
    const y = side * visual.wingSpan * 0.27;
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.42, span, 0.1), accent);
    flap.name = "trailing-edge-flap";
    flap.position.set(
      -visual.bodyLength * 0.08 - visual.wingSweep * 0.25,
      y,
      wingZ - 0.02,
    );
    flap.userData.baseZ = flap.position.z;
    body.add(flap);
    flaps.push(flap);
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, span * 0.9, 0.08),
      wingMaterial,
    );
    slat.name = "leading-edge-slat";
    slat.position.set(
      visual.bodyLength * 0.13 - visual.wingSweep * 0.18,
      y,
      wingZ + 0.04,
    );
    slat.userData.baseX = slat.position.x;
    body.add(slat);
    slats.push(slat);
    if (!lowDetail) {
      const spoiler = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, span * 0.58, 0.07),
        accent,
      );
      spoiler.name = "ground-spoiler";
      spoiler.position.set(-visual.bodyLength * 0.015, y * 0.94, wingZ + 0.13);
      spoiler.userData.baseZ = spoiler.position.z;
      body.add(spoiler);
      spoilers.push(spoiler);
    }
  }
  return { flaps, slats, spoilers };
}

function addEngines(
  body: THREE.Group,
  engineCount: number,
  visual: AircraftVisualSpec,
  material: THREE.Material,
  structure: THREE.Material,
  lowDetail: boolean,
): {
  engineOffsets: number[];
  propellers: THREE.Object3D[];
  indicators: THREE.Mesh[];
  reversers: THREE.Mesh[];
} {
  const engineOffsets =
    engineCount === 1
      ? [0]
      : engineCount === 4
        ? [
            -visual.engineOffset,
            -visual.engineOffset * 0.5,
            visual.engineOffset * 0.5,
            visual.engineOffset,
          ]
        : [-visual.engineOffset, visual.engineOffset];
  const noseEngine = visual.engineMount === "nose";
  const rearEngine = visual.engineMount === "rear";
  const engineX = noseEngine
    ? visual.bodyLength * 0.49
    : rearEngine
      ? -visual.bodyLength * 0.28
      : visual.bodyLength * 0.04;
  const wingZ =
    visual.wingMount === "high"
      ? visual.bodyRadius * 0.35
      : -visual.bodyRadius * 0.85;
  const engineZ = noseEngine
    ? 0
    : rearEngine
      ? visual.bodyRadius * 0.26
      : wingZ;
  const propellers: THREE.Object3D[] = [];
  const indicators: THREE.Mesh[] = [];
  const reversers: THREE.Mesh[] = [];
  if (lowDetail) {
    const transform = new THREE.Object3D();
    const nacelles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(
        visual.engineRadius,
        visual.engineRadius * 1.04,
        visual.engineLength,
        8,
      ),
      material,
      engineOffsets.length,
    );
    nacelles.name = "engine-nacelle-array";
    nacelles.castShadow = true;
    engineOffsets.forEach((offset, index) => {
      transform.position.set(engineX, offset, engineZ);
      transform.rotation.set(0, 0, -Math.PI / 2);
      transform.scale.set(
        1,
        1,
        visual.family === "boeing-narrowbody" ? 0.82 : 1,
      );
      transform.updateMatrix();
      nacelles.setMatrixAt(index, transform.matrix);
    });
    nacelles.instanceMatrix.needsUpdate = true;
    body.add(nacelles);

    const intakeIndicators = new THREE.InstancedMesh(
      new THREE.CircleGeometry(visual.engineRadius * 0.72, 8),
      basicGlow(0xffc77c, 0),
      engineOffsets.length,
    );
    intakeIndicators.name = "engine-intake-indicator-array";
    engineOffsets.forEach((offset, index) => {
      transform.position.set(
        engineX + visual.engineLength * 0.525,
        offset,
        engineZ,
      );
      transform.rotation.set(0, Math.PI / 2, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      intakeIndicators.setMatrixAt(index, transform.matrix);
    });
    intakeIndicators.instanceMatrix.needsUpdate = true;
    intakeIndicators.visible = false;
    body.add(intakeIndicators);
    indicators.push(intakeIndicators);

    if (!noseEngine) {
      const pylons = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.72, 0.18, 0.42),
        structure,
        engineOffsets.length,
      );
      pylons.name = rearEngine
        ? "rear-engine-mount-array"
        : "engine-pylon-array";
      engineOffsets.forEach((offset, index) => {
        transform.position.set(
          engineX,
          offset,
          rearEngine
            ? visual.bodyRadius * 0.12
            : engineZ + visual.bodyRadius * 0.38,
        );
        transform.rotation.set(0, 0, 0);
        transform.scale.set(1, 1, 1);
        transform.updateMatrix();
        pylons.setMatrixAt(index, transform.matrix);
      });
      pylons.instanceMatrix.needsUpdate = true;
      body.add(pylons);
    }

    if (visual.propeller) {
      const propellerDiscs = new THREE.InstancedMesh(
        new THREE.CircleGeometry(
          visual.engineRadius *
            (visual.family === "regional-high-wing-turboprop" ? 1.75 : 1.35),
          12,
        ),
        new THREE.MeshBasicMaterial({
          color: 0xddd6bd,
          transparent: true,
          opacity: 0.56,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
        engineOffsets.length,
      );
      propellerDiscs.name = "propeller-disc-array";
      engineOffsets.forEach((offset, index) => {
        transform.position.set(
          engineX + visual.engineLength * 0.53,
          offset,
          engineZ,
        );
        transform.rotation.set(0, Math.PI / 2, 0);
        transform.scale.set(1, 1, 1);
        transform.updateMatrix();
        propellerDiscs.setMatrixAt(index, transform.matrix);
      });
      propellerDiscs.instanceMatrix.needsUpdate = true;
      body.add(propellerDiscs);
    } else {
      const sleeves = new THREE.InstancedMesh(
        new THREE.TorusGeometry(
          visual.engineRadius * 0.92,
          Math.max(0.035, visual.engineRadius * 0.1),
          5,
          8,
        ),
        structure,
        engineOffsets.length,
      );
      sleeves.name = "thrust-reverser-sleeve-array";
      engineOffsets.forEach((offset, index) => {
        transform.position.set(
          engineX - visual.engineLength * 0.32,
          offset,
          engineZ,
        );
        transform.rotation.set(0, Math.PI / 2, 0);
        transform.scale.set(1, 1, 1);
        transform.updateMatrix();
        sleeves.setMatrixAt(index, transform.matrix);
      });
      sleeves.instanceMatrix.needsUpdate = true;
      sleeves.userData.baseX = 0;
      body.add(sleeves);
      reversers.push(sleeves);
    }
    return { engineOffsets, propellers, indicators, reversers };
  }
  for (const offset of engineOffsets) {
    const engine = new THREE.Mesh(
      new THREE.CylinderGeometry(
        visual.engineRadius,
        visual.engineRadius * 1.04,
        visual.engineLength,
        lowDetail ? 8 : 12,
      ),
      material,
    );
    engine.name = "engine-nacelle";
    engine.rotation.z = -Math.PI / 2;
    engine.position.set(engineX, offset, engineZ);
    if (visual.family === "boeing-narrowbody") engine.scale.z = 0.82;
    engine.castShadow = true;
    body.add(engine);
    const indicator = new THREE.Mesh(
      new THREE.CircleGeometry(visual.engineRadius * 0.72, lowDetail ? 8 : 12),
      basicGlow(0xffc77c, 0),
    );
    indicator.name = "engine-intake-indicator";
    indicator.rotation.y = Math.PI / 2;
    indicator.position.set(
      engineX + visual.engineLength * 0.525,
      offset,
      engineZ,
    );
    indicator.visible = false;
    body.add(indicator);
    indicators.push(indicator);
    if (!noseEngine) {
      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.18, 0.42),
        structure,
      );
      pylon.name = rearEngine ? "rear-engine-mount" : "engine-pylon";
      pylon.position.set(
        engineX,
        offset,
        rearEngine
          ? visual.bodyRadius * 0.12
          : engineZ + visual.bodyRadius * 0.38,
      );
      body.add(pylon);
    }
    if (visual.propeller) {
      const prop = new THREE.Mesh(
        new THREE.CircleGeometry(
          visual.engineRadius *
            (visual.family === "regional-high-wing-turboprop" ? 1.75 : 1.35),
          lowDetail ? 12 : 20,
        ),
        new THREE.MeshBasicMaterial({
          color: 0xddd6bd,
          transparent: true,
          opacity: 0.56,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      prop.name = "propeller-disc";
      prop.rotation.y = Math.PI / 2;
      prop.position.set(engineX + visual.engineLength * 0.53, offset, engineZ);
      body.add(prop);
      propellers.push(prop);
    } else {
      const reverser = new THREE.Mesh(
        new THREE.TorusGeometry(
          visual.engineRadius * 0.92,
          Math.max(0.035, visual.engineRadius * 0.1),
          lowDetail ? 5 : 7,
          lowDetail ? 8 : 12,
        ),
        structure,
      );
      reverser.name = "thrust-reverser-sleeve";
      reverser.rotation.y = Math.PI / 2;
      reverser.position.set(
        engineX - visual.engineLength * 0.32,
        offset,
        engineZ,
      );
      reverser.userData.baseX = reverser.position.x;
      body.add(reverser);
      reversers.push(reverser);
    }
  }
  return { engineOffsets, propellers, indicators, reversers };
}

function addAircraftLights(
  body: THREE.Group,
  visual: AircraftVisualSpec,
  lowDetail: boolean,
): {
  navigation: THREE.Mesh[];
  strobes: THREE.Mesh[];
  recognition: THREE.Mesh[];
  beaconLamp: THREE.Mesh;
  landingLamp: THREE.Mesh;
  taxiLamp: THREE.Mesh;
  landingLight: THREE.PointLight;
} {
  const navigation = [
    glowSphere(0xe35f68, visual.wingSpan * 0.48, 0.2, lowDetail),
    glowSphere(0x72d59b, -visual.wingSpan * 0.48, 0.2, lowDetail),
    glowSphere(0xf4eee0, 0, 0.19, lowDetail),
  ];
  navigation[0].position.x = -visual.wingSweep;
  navigation[1].position.x = -visual.wingSweep;
  navigation[2].position.set(
    -visual.bodyLength * 0.5,
    0,
    visual.bodyRadius * 0.18,
  );
  navigation.forEach((light) => {
    light.name = "navigation-light";
    body.add(light);
  });
  const strobes = [
    glowPair(
      0xffffff,
      visual.wingSpan * 0.49,
      -visual.wingSpan * 0.49,
      0.23,
      lowDetail,
    ),
  ];
  strobes.forEach((light) => {
    light.name = "strobe-light";
    light.position.x = -visual.wingSweep * 0.86;
    light.visible = false;
    body.add(light);
  });
  const beaconLamp = glowSphere(0xff6f61, 0, 0.22, lowDetail);
  beaconLamp.name = "anti-collision-beacon";
  beaconLamp.position.set(
    -visual.bodyLength * 0.08,
    0,
    visual.tailHeight * 0.7,
  );
  beaconLamp.visible = false;
  body.add(beaconLamp);
  const landingLamp = glowSphere(0xfff2c7, 0, 0.3, lowDetail);
  landingLamp.name = "landing-light";
  landingLamp.position.set(
    visual.bodyLength * 0.4,
    0,
    -visual.bodyRadius * 0.22,
  );
  landingLamp.visible = false;
  body.add(landingLamp);
  const taxiLamp = glowSphere(0xffe7b0, 0, 0.24, lowDetail);
  taxiLamp.name = "taxi-light";
  taxiLamp.position.set(visual.bodyLength * 0.34, 0, -visual.bodyRadius * 0.62);
  taxiLamp.visible = false;
  body.add(taxiLamp);
  const recognition = [
    glowPair(
      0xfff6d9,
      visual.wingSpan * 0.18,
      -visual.wingSpan * 0.18,
      0.18,
      lowDetail,
    ),
  ];
  recognition.forEach((light) => {
    light.name = "recognition-light";
    light.position.x = visual.bodyLength * 0.09;
    light.visible = false;
    body.add(light);
  });
  const landingLight = new THREE.PointLight(0xffe5b0, 0, 24, 2);
  landingLight.name = "landing-light-cast";
  landingLight.position.copy(landingLamp.position);
  if (!lowDetail) body.add(landingLight);
  return {
    navigation,
    strobes,
    recognition,
    beaconLamp,
    landingLamp,
    taxiLamp,
    landingLight,
  };
}

function addTug(
  root: THREE.Group,
  visual: AircraftVisualSpec,
  structure: THREE.Material,
  wheelMaterial: THREE.Material,
  lowDetail: boolean,
): { tug: THREE.Group; beacon: THREE.Mesh } {
  const tug = new THREE.Group();
  tug.name = "pushback-tug";
  const tugScale = Math.max(0.62, visual.bodyRadius * 0.72);
  const tugBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.8 * tugScale, 1.05 * tugScale, 0.62 * tugScale),
    standardMaterial(0xd9a441, 0.72, 0.08),
  );
  tugBody.position.z = -0.84;
  tugBody.castShadow = true;
  tug.add(tugBody);
  const tugCab = new THREE.Mesh(
    new THREE.BoxGeometry(0.72 * tugScale, 0.92 * tugScale, 0.48 * tugScale),
    standardMaterial(0x5d7776, 0.46, 0.12),
  );
  tugCab.position.set(-0.34 * tugScale, 0, -0.34);
  tug.add(tugCab);
  const wheelPositions = lowDetail
    ? [
        [-0.5, -0.5],
        [0.5, 0.5],
      ]
    : [
        [-0.56, -0.54],
        [-0.56, 0.54],
        [0.56, -0.54],
        [0.56, 0.54],
      ];
  const wheels = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(
      0.2 * tugScale,
      0.2 * tugScale,
      0.16 * tugScale,
      lowDetail ? 6 : 10,
    ),
    wheelMaterial,
    wheelPositions.length,
  );
  wheels.name = "tug-wheel-array";
  const wheelTransform = new THREE.Object3D();
  wheelPositions.forEach(([x, y], index) => {
    wheelTransform.position.set(x * tugScale, y * tugScale, -1.08);
    wheelTransform.rotation.set(Math.PI / 2, 0, 0);
    wheelTransform.updateMatrix();
    wheels.setMatrixAt(index, wheelTransform.matrix);
  });
  wheels.instanceMatrix.needsUpdate = true;
  tug.add(wheels);
  const tugX =
    visual.bodyLength * 0.52 + visual.bodyRadius * 1.25 + 1.1 * tugScale;
  const noseGearX = visual.bodyLength * 0.29;
  const towLength = Math.max(1, tugX - noseGearX);
  const towbar = new THREE.Mesh(
    new THREE.BoxGeometry(towLength, 0.13, 0.12),
    structure,
  );
  towbar.position.set(-towLength / 2, 0, -1.02);
  tug.add(towbar);
  const beacon = glowSphere(0xffb22e, 0, 0.16 * tugScale, lowDetail);
  beacon.name = "tug-beacon";
  beacon.position.set(-0.34 * tugScale, 0, 0.02);
  tug.add(beacon);
  tug.position.x = tugX;
  tug.visible = false;
  root.add(tug);
  return { tug, beacon };
}

function addLandingGear(
  root: THREE.Group,
  visual: AircraftVisualSpec,
  structure: THREE.Material,
  wheelMaterial: THREE.Material,
  family: AircraftVisualFamily,
  lowDetail: boolean,
): THREE.Group {
  const gear = new THREE.Group();
  gear.name = "landing-gear";
  const mainSpread =
    family === "ga-high-wing"
      ? visual.bodyRadius * 1.8
      : visual.bodyRadius * 1.12;
  const positions: Array<[number, number]> = [
    [visual.bodyLength * 0.29, 0],
    [-visual.bodyLength * 0.18, -mainSpread],
    [-visual.bodyLength * 0.18, mainSpread],
  ];
  if (
    !lowDetail &&
    (family === "jumbo" ||
      family === "boeing-widebody" ||
      family === "freighter")
  ) {
    positions.push(
      [-visual.bodyLength * 0.05, -mainSpread * 0.62],
      [-visual.bodyLength * 0.05, mainSpread * 0.62],
    );
  }
  const wheelRadius = Math.max(0.15, Math.min(0.29, visual.bodyRadius * 0.42));
  const struts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.06, 0.085, 0.72, lowDetail ? 6 : 8),
    structure,
    positions.length,
  );
  struts.name = "gear-strut-array";
  const wheels = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(
      wheelRadius,
      wheelRadius,
      0.18,
      lowDetail ? 8 : 12,
    ),
    wheelMaterial,
    positions.length,
  );
  wheels.name = "gear-wheel-array";
  wheels.castShadow = true;
  const transform = new THREE.Object3D();
  positions.forEach(([x, y], index) => {
    transform.position.set(x, y, -0.66);
    transform.rotation.set(Math.PI / 2, 0, 0);
    transform.updateMatrix();
    struts.setMatrixAt(index, transform.matrix);
    transform.position.set(x, y, -1.08);
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    wheels.setMatrixAt(index, transform.matrix);
  });
  struts.instanceMatrix.needsUpdate = true;
  wheels.instanceMatrix.needsUpdate = true;
  gear.add(struts, wheels);
  root.add(gear);
  return gear;
}

function addAircraftEffects(
  root: THREE.Group,
  visual: AircraftVisualSpec,
  engineOffsets: number[],
  lowDetail: boolean,
): {
  deicingSpray: THREE.Group;
  exhaust: THREE.Group;
  condensation: THREE.Group;
  tireSmoke: THREE.Group;
  surfaceSpray: THREE.Group;
} {
  const deicingSpray = new THREE.Group();
  deicingSpray.name = "deicing-spray";
  const deicingMaterial = additiveMaterial(0xc9edf2, 0.28);
  const spray = new THREE.InstancedMesh(
    new THREE.ConeGeometry(
      0.75,
      Math.max(3.6, visual.wingSpan * 0.26),
      lowDetail ? 7 : 12,
      1,
      true,
    ),
    deicingMaterial,
    2,
  );
  spray.name = "deicing-spray-array";
  const effectTransform = new THREE.Object3D();
  [-1, 1].forEach((side, index) => {
    effectTransform.position.set(
      -visual.bodyLength * 0.06,
      side * visual.wingSpan * 0.36,
      visual.bodyRadius * 0.72,
    );
    effectTransform.rotation.set(0, 0, side * (Math.PI / 2 - 0.28));
    effectTransform.updateMatrix();
    spray.setMatrixAt(index, effectTransform.matrix);
  });
  spray.instanceMatrix.needsUpdate = true;
  deicingSpray.add(spray);
  deicingSpray.visible = false;
  root.add(deicingSpray);

  const exhaust = new THREE.Group();
  exhaust.name = "engine-exhaust";
  const exhaustMaterial = additiveMaterial(0x8ba4a2, 0.16);
  const plume = new THREE.InstancedMesh(
    new THREE.ConeGeometry(
      Math.max(0.12, visual.engineRadius * 0.62),
      Math.max(1.6, visual.engineLength * 1.9),
      lowDetail ? 6 : 9,
      1,
      true,
    ),
    exhaustMaterial,
    engineOffsets.length,
  );
  plume.name = "engine-exhaust-array";
  engineOffsets.forEach((offset, index) => {
    effectTransform.position.set(
      -visual.bodyLength * 0.4 - visual.engineLength * 0.7,
      offset,
      -visual.bodyRadius * 0.18,
    );
    effectTransform.rotation.set(0, 0, -Math.PI / 2);
    effectTransform.updateMatrix();
    plume.setMatrixAt(index, effectTransform.matrix);
  });
  plume.instanceMatrix.needsUpdate = true;
  exhaust.add(plume);
  exhaust.visible = false;
  root.add(exhaust);

  const condensation = new THREE.Group();
  condensation.name = "wing-condensation";
  const condensationMaterial = additiveMaterial(0xf1f6f4, 0.2);
  const ribbon = new THREE.InstancedMesh(
    new THREE.ConeGeometry(
      0.08,
      Math.max(1.4, visual.wingSpan * 0.28),
      lowDetail ? 5 : 8,
      1,
      true,
    ),
    condensationMaterial,
    2,
  );
  ribbon.name = "wing-condensation-array";
  [-1, 1].forEach((side, index) => {
    effectTransform.position.set(
      -visual.wingSweep - visual.wingSpan * 0.13,
      side * visual.wingSpan * 0.46,
      0.04,
    );
    effectTransform.rotation.set(0, 0, Math.PI / 2);
    effectTransform.updateMatrix();
    ribbon.setMatrixAt(index, effectTransform.matrix);
  });
  ribbon.instanceMatrix.needsUpdate = true;
  condensation.add(ribbon);
  condensation.visible = false;
  root.add(condensation);

  const tireSmoke = puffGroup("touchdown-tire-smoke", 0xd8d2c4, lowDetail);
  tireSmoke.position.set(-visual.bodyLength * 0.2, 0, -0.9);
  root.add(tireSmoke);
  const surfaceSpray = puffGroup("surface-spray", 0xc8e0df, lowDetail);
  surfaceSpray.position.set(-visual.bodyLength * 0.3, 0, -0.92);
  root.add(surfaceSpray);
  return {
    deicingSpray,
    exhaust,
    condensation,
    tireSmoke,
    surfaceSpray,
  };
}

function puffGroup(
  name: string,
  color: number,
  lowDetail: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const material = additiveMaterial(color, 0.2);
  const count = lowDetail ? 2 : 4;
  const geometry = new THREE.SphereGeometry(
    0.42,
    lowDetail ? 5 : 8,
    lowDetail ? 4 : 6,
  );
  const puffs = new THREE.InstancedMesh(geometry, material, count);
  puffs.name = `${name}-array`;
  const transform = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    transform.position.set(
      -index * 0.46,
      (index % 2 ? -1 : 1) * (0.24 + index * 0.06),
      index * 0.06,
    );
    transform.scale.setScalar((0.34 + index * 0.08) / 0.42);
    transform.updateMatrix();
    puffs.setMatrixAt(index, transform.matrix);
  }
  puffs.instanceMatrix.needsUpdate = true;
  group.add(puffs);
  group.visible = false;
  return group;
}

function glowSphere(
  color: number,
  y: number,
  radius: number,
  lowDetail: boolean,
): THREE.Mesh {
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(radius, lowDetail ? 6 : 10, lowDetail ? 4 : 7),
    basicGlow(color, 0.88),
  );
  light.position.set(0, y, 0.18);
  return light;
}

function glowPair(
  color: number,
  firstY: number,
  secondY: number,
  radius: number,
  lowDetail: boolean,
): THREE.InstancedMesh {
  const lights = new THREE.InstancedMesh(
    new THREE.SphereGeometry(radius, lowDetail ? 6 : 10, lowDetail ? 4 : 7),
    basicGlow(color, 0.88),
    2,
  );
  const transform = new THREE.Object3D();
  [firstY, secondY].forEach((y, index) => {
    transform.position.set(0, y, 0.18);
    transform.updateMatrix();
    lights.setMatrixAt(index, transform.matrix);
  });
  lights.instanceMatrix.needsUpdate = true;
  return lights;
}

function standardMaterial(
  color: number,
  roughness: number,
  metalness: number,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function basicGlow(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

function additiveMaterial(
  color: number,
  opacity: number,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function countAircraftAssets(
  root: THREE.Object3D,
): AircraftVisual["assetCounts"] {
  let meshes = 0;
  let triangles = 0;
  let geometryBytes = 0;
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const geometries = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Sprite
    ) {
      meshes += 1;
      const candidates = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of candidates) {
        materials.add(material);
        const map = (material as THREE.MeshStandardMaterial).map;
        if (map) textures.add(map);
      }
      if (
        "geometry" in object &&
        object.geometry instanceof THREE.BufferGeometry
      ) {
        geometries.add(object.geometry);
        if (object instanceof THREE.Mesh) {
          const instances =
            object instanceof THREE.InstancedMesh ? object.count : 1;
          const primitiveCount =
            object.geometry.index?.count ??
            object.geometry.getAttribute("position")?.count ??
            0;
          triangles += Math.floor(primitiveCount / 3) * instances;
        }
      }
    }
  });
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes)) {
      geometryBytes += attribute.array.byteLength;
    }
    if (geometry.index) geometryBytes += geometry.index.array.byteLength;
  }
  return {
    meshes,
    materials: materials.size,
    textures: textures.size,
    triangles,
    geometryBytes,
  };
}

function updateEffect(
  group: THREE.Group,
  intensity: number,
  elapsedSeconds: number,
  flightId: number,
  baseOpacity: number,
  maximumScale: number,
): void {
  group.visible = intensity > 0.015;
  if (!group.visible) return;
  const pulse = 0.88 + Math.sin(elapsedSeconds * 5.1 + flightId * 0.73) * 0.12;
  const scale = 0.72 + intensity * (maximumScale - 0.72) * pulse;
  group.scale.set(scale, scale, scale);
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if ("opacity" in material)
        material.opacity = Math.min(0.9, baseOpacity * intensity * pulse);
    }
  });
}

function setOpacity(mesh: THREE.Mesh, opacity: number): void {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  for (const material of materials) {
    if ("opacity" in material) material.opacity = opacity;
  }
}

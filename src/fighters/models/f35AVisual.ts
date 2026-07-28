import * as THREE from "three";
import type { FighterProfile } from "../fighterCatalog";
import {
  collectRenderStats,
  cylinderAlongZ,
  cylinderBetween,
  disposeDetailedRoot,
  emissive,
  lineSegments,
  loftGeometry,
  mirrorPlanform,
  prismMesh,
  quadMesh,
  standard,
  verticalSurfaceMesh,
  type LoftSection,
} from "./detailedModelUtils";

export interface F35AVisual {
  root: THREE.Group;
  propellers: THREE.Group[];
  nozzles: THREE.Mesh[];
  dispose: () => void;
}

interface F35Materials {
  body: THREE.MeshStandardMaterial;
  bodyLight: THREE.MeshStandardMaterial;
  underside: THREE.MeshStandardMaterial;
  ram: THREE.MeshStandardMaterial;
  canopy: THREE.MeshPhysicalMaterial;
  canopyFrame: THREE.MeshStandardMaterial;
  intake: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  tire: THREE.MeshStandardMaterial;
  hub: THREE.MeshStandardMaterial;
  sensor: THREE.MeshPhysicalMaterial;
  navigationRed: THREE.MeshStandardMaterial;
  navigationGreen: THREE.MeshStandardMaterial;
  navigationWhite: THREE.MeshStandardMaterial;
  formation: THREE.MeshStandardMaterial;
  seam: THREE.LineBasicMaterial;
}

const F35A_LENGTH_M = 15.7;
const F35A_SPAN_M = 10.7;

/**
 * Aircraft-specific F-35A benchmark model.
 *
 * The archive's generic silhouettes intentionally remain low-cost. This model
 * demonstrates the upper practical limit for a texture-free procedural
 * aircraft: aircraft-specific loft stations and planforms, but still only one
 * resident model and no downloaded asset or texture memory.
 */
export function createF35AVisual(
  fighter: FighterProfile,
  lowDetail = false,
): F35AVisual {
  const materials = createMaterials();
  const root = new THREE.Group();
  root.name = "fighter-f-35a-detailed";
  root.userData.fighterId = fighter.id;
  root.userData.modelVariant = "F-35A CTOL";
  root.userData.referenceDimensions = {
    lengthM: F35A_LENGTH_M,
    wingspanM: F35A_SPAN_M,
    heightM: 4.38,
  };

  const nozzles: THREE.Mesh[] = [];
  addMainFuselage(root, materials);
  addWingAndShoulderBlend(root, materials, lowDetail);
  addEmpennage(root, materials, lowDetail);
  addCanopy(root, materials, lowDetail);
  addIntakesAndSensors(root, materials, lowDetail);
  addEngineNozzle(root, materials, lowDetail, nozzles);
  addLandingGear(root, materials, lowDetail);
  addNavigationAndFormationLights(root, materials, lowDetail);

  root.scale.set(
    fighter.wingspanM / F35A_SPAN_M,
    1,
    fighter.lengthM / F35A_LENGTH_M,
  );

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = !lowDetail;
      // Thin faceted panels self-shadow badly at this scale. The floor still
      // receives the complete aircraft shadow.
      object.receiveShadow = false;
    }
  });

  root.userData.renderStats = collectRenderStats(root);

  const dispose = (): void => disposeDetailedRoot(root);

  return { root, propellers: [], nozzles, dispose };
}

function createMaterials(): F35Materials {
  return {
    body: standard(0x586264, 0.76, 0.16, true),
    bodyLight: standard(0x687274, 0.74, 0.14, true),
    underside: standard(0x465154, 0.84, 0.12, true),
    ram: standard(0x30383a, 0.82, 0.2, true),
    canopy: new THREE.MeshPhysicalMaterial({
      color: 0x526968,
      roughness: 0.2,
      metalness: 0.3,
      transmission: 0.08,
      transparent: true,
      opacity: 0.88,
      clearcoat: 0.72,
      clearcoatRoughness: 0.18,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
    canopyFrame: standard(0x20292b, 0.67, 0.36, true),
    intake: standard(0x12191a, 0.96, 0.02, true),
    metal: standard(0x55595a, 0.45, 0.72, true),
    tire: standard(0x151919, 0.98, 0.01, false),
    hub: standard(0x8e9693, 0.42, 0.7, true),
    sensor: new THREE.MeshPhysicalMaterial({
      color: 0x3e585b,
      roughness: 0.12,
      metalness: 0.38,
      transmission: 0.12,
      transparent: true,
      opacity: 0.92,
      clearcoat: 0.85,
      flatShading: true,
    }),
    navigationRed: emissive(0xc5443c),
    navigationGreen: emissive(0x51b979),
    navigationWhite: emissive(0xe8e4cf),
    formation: emissive(0x9f9f63, 0.55),
    seam: new THREE.LineBasicMaterial({
      color: 0x222b2d,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
    }),
  };
}

function addMainFuselage(root: THREE.Group, materials: F35Materials): void {
  const sections: LoftSection[] = [
    { z: 7.85, halfWidth: 0.035, top: 1.46, shoulder: 1.43, bottom: 1.39 },
    { z: 7.25, halfWidth: 0.28, top: 1.7, shoulder: 1.52, bottom: 1.24 },
    { z: 6.35, halfWidth: 0.57, top: 2.02, shoulder: 1.62, bottom: 0.91 },
    { z: 5.25, halfWidth: 0.78, top: 2.3, shoulder: 1.68, bottom: 0.64 },
    { z: 3.85, halfWidth: 1.02, top: 2.53, shoulder: 1.62, bottom: 0.54 },
    { z: 2.25, halfWidth: 1.33, top: 2.58, shoulder: 1.55, bottom: 0.47 },
    { z: 0.2, halfWidth: 1.72, top: 2.48, shoulder: 1.48, bottom: 0.43 },
    { z: -2.2, halfWidth: 1.65, top: 2.38, shoulder: 1.46, bottom: 0.5 },
    { z: -4.25, halfWidth: 1.35, top: 2.18, shoulder: 1.42, bottom: 0.62 },
    { z: -5.8, halfWidth: 0.9, top: 1.92, shoulder: 1.35, bottom: 0.78 },
    { z: -6.78, halfWidth: 0.63, top: 1.7, shoulder: 1.29, bottom: 0.91 },
  ];
  const body = new THREE.Mesh(loftGeometry(sections), materials.body);
  body.name = "f35a-faceted-fuselage";
  root.add(body);

  const lowerCenter = prismMesh(
    [
      [0, 4.65],
      [0.72, 3.6],
      [1.38, 0.7],
      [1.27, -3.9],
      [0.55, -6.05],
      [-0.55, -6.05],
      [-1.27, -3.9],
      [-1.38, 0.7],
      [-0.72, 3.6],
    ],
    0.1,
    materials.underside,
  );
  lowerCenter.name = "f35a-lower-centerbody";
  lowerCenter.position.y = 0.49;
  root.add(lowerCenter);
}

function addWingAndShoulderBlend(
  root: THREE.Group,
  materials: F35Materials,
  lowDetail: boolean,
): void {
  const wing = prismMesh(
    [
      [0, 1.25],
      [1.55, 0.78],
      [5.35, -1.78],
      [5.2, -2.82],
      [1.55, -4.02],
      [0.62, -3.62],
      [-0.62, -3.62],
      [-1.55, -4.02],
      [-5.2, -2.82],
      [-5.35, -1.78],
      [-1.55, 0.78],
    ],
    0.13,
    materials.body,
  );
  wing.name = "f35a-main-wing";
  wing.position.y = 1.13;
  root.add(wing);

  const shoulder = prismMesh(
    [
      [0, 5.52],
      [0.77, 4.7],
      [1.17, 2.7],
      [1.78, 0.58],
      [2.0, -1.18],
      [1.42, -3.18],
      [0, -4.06],
      [-1.42, -3.18],
      [-2.0, -1.18],
      [-1.78, 0.58],
      [-1.17, 2.7],
      [-0.77, 4.7],
    ],
    0.12,
    materials.body,
  );
  shoulder.name = "f35a-wing-root-blend";
  shoulder.position.y = 1.52;
  root.add(shoulder);

  for (const side of [-1, 1]) {
    const trailingRam = prismMesh(
      mirrorPlanform(
        [
          [1.46, -3.35],
          [5.2, -2.66],
          [5.17, -2.89],
          [1.5, -3.93],
        ],
        side,
      ),
      0.025,
      materials.ram,
    );
    trailingRam.name = "f35a-flaperon-ram-edge";
    trailingRam.position.y = 1.21;
    root.add(trailingRam);

    const leadingRam = prismMesh(
      mirrorPlanform(
        [
          [1.56, 0.7],
          [5.35, -1.78],
          [5.28, -1.94],
          [1.64, 0.52],
        ],
        side,
      ),
      0.02,
      materials.ram,
    );
    leadingRam.name = "f35a-leading-edge-ram";
    leadingRam.position.y = 1.21;
    root.add(leadingRam);
  }

  if (!lowDetail) addUpperSurfaceSeams(root, materials);
}

function addEmpennage(
  root: THREE.Group,
  materials: F35Materials,
  lowDetail: boolean,
): void {
  const stabilators = prismMesh(
    [
      [0.72, -3.72],
      [1.47, -3.86],
      [3.43, -4.82],
      [3.28, -5.84],
      [1.04, -5.18],
      [0, -4.86],
      [-1.04, -5.18],
      [-3.28, -5.84],
      [-3.43, -4.82],
      [-1.47, -3.86],
      [-0.72, -3.72],
    ],
    0.11,
    materials.body,
  );
  stabilators.name = "f35a-stabilators";
  stabilators.position.y = 1.36;
  root.add(stabilators);

  for (const side of [-1, 1]) {
    const tail = verticalSurfaceMesh(
      [
        [0, 0],
        [2.5, 0],
        [2.08, 2.64],
        [0.94, 3.08],
      ],
      0.12,
      materials.body,
    );
    tail.name = "f35a-canted-vertical-tail";
    tail.position.set(side * 1.05, 1.49, -3.66);
    tail.rotation.z = -side * THREE.MathUtils.degToRad(24);
    root.add(tail);

    const tailCap = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.42, 0.08),
      materials.ram,
    );
    tailCap.name = "f35a-tail-receiver";
    tailCap.position.set(side * 2.08, 3.82, -5.36);
    tailCap.rotation.z = -side * THREE.MathUtils.degToRad(24);
    root.add(tailCap);
  }

  if (!lowDetail) {
    const tailSeams = lineSegments(
      [
        [-3.22, 1.43, -5.58],
        [-1.16, 1.43, -4.98],
        [3.22, 1.43, -5.58],
        [1.16, 1.43, -4.98],
      ],
      materials.seam,
    );
    tailSeams.name = "f35a-stabilator-seams";
    root.add(tailSeams);
  }
}

function addCanopy(
  root: THREE.Group,
  materials: F35Materials,
  lowDetail: boolean,
): void {
  const canopy = new THREE.Mesh(
    loftGeometry([
      { z: 5.25, halfWidth: 0.06, top: 1.97, shoulder: 1.92, bottom: 1.88 },
      { z: 4.73, halfWidth: 0.47, top: 2.53, shoulder: 2.24, bottom: 1.82 },
      { z: 3.78, halfWidth: 0.69, top: 2.84, shoulder: 2.45, bottom: 1.8 },
      { z: 2.72, halfWidth: 0.48, top: 2.57, shoulder: 2.24, bottom: 1.79 },
    ]),
    materials.canopy,
  );
  canopy.name = "f35a-one-piece-canopy";
  root.add(canopy);

  const canopySill = prismMesh(
    [
      [0, 5.28],
      [0.49, 4.74],
      [0.72, 3.72],
      [0.49, 2.64],
      [-0.49, 2.64],
      [-0.72, 3.72],
      [-0.49, 4.74],
    ],
    0.055,
    materials.canopyFrame,
  );
  canopySill.name = "f35a-canopy-sill";
  canopySill.position.y = 1.8;
  root.add(canopySill);

  if (!lowDetail) {
    const bow = new THREE.Mesh(
      new THREE.BoxGeometry(1.34, 0.055, 0.08),
      materials.canopyFrame,
    );
    bow.name = "f35a-canopy-aft-frame";
    bow.position.set(0, 2.34, 2.84);
    bow.rotation.x = THREE.MathUtils.degToRad(-16);
    root.add(bow);
  }
}

function addIntakesAndSensors(
  root: THREE.Group,
  materials: F35Materials,
  lowDetail: boolean,
): void {
  for (const side of [-1, 1]) {
    const opening = quadMesh(
      [
        [side * 1.13, 1.79, 2.75],
        [side * 1.52, 1.68, 2.1],
        [side * 1.55, 1.22, 0.82],
        [side * 1.08, 1.3, 1.3],
      ],
      materials.intake,
    );
    opening.name = "f35a-dsi-intake-opening";
    root.add(opening);

    const bump = new THREE.Mesh(
      new THREE.SphereGeometry(0.58, lowDetail ? 8 : 14, lowDetail ? 5 : 8),
      materials.bodyLight,
    );
    bump.name = "f35a-dsi-bump";
    bump.scale.set(0.62, 0.42, 1.58);
    bump.position.set(side * 1.04, 1.42, 1.95);
    root.add(bump);

    const noseSensor = quadMesh(
      [
        [side * 0.52, 1.69, 5.72],
        [side * 0.61, 1.57, 5.42],
        [side * 0.48, 1.43, 5.56],
        [side * 0.39, 1.53, 5.84],
      ],
      materials.sensor,
    );
    noseSensor.name = "f35a-das-window";
    root.add(noseSensor);
  }

  const eots = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.38, 0),
    materials.sensor,
  );
  eots.name = "f35a-eots-window";
  eots.scale.set(0.72, 0.52, 1.34);
  eots.position.set(0, 0.68, 4.63);
  eots.rotation.x = THREE.MathUtils.degToRad(12);
  root.add(eots);

  if (!lowDetail) {
    const gunBlister = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 10, 6),
      materials.ram,
    );
    gunBlister.name = "f35a-gun-blister";
    gunBlister.scale.set(0.54, 0.28, 1.7);
    gunBlister.position.set(-0.72, 2.28, 2.4);
    root.add(gunBlister);
  }
}

function addEngineNozzle(
  root: THREE.Group,
  materials: F35Materials,
  lowDetail: boolean,
  nozzles: THREE.Mesh[],
): void {
  const segments = lowDetail ? 12 : 20;
  const petals = cylinderAlongZ(
    0.72,
    0.59,
    0.72,
    segments,
    materials.metal,
    true,
  );
  petals.name = "f35a-nozzle-petals";
  petals.position.set(0, 1.3, -7.1);
  root.add(petals);

  const inner = cylinderAlongZ(
    0.54,
    0.52,
    0.56,
    segments,
    materials.intake,
    true,
  );
  inner.name = "f35a-nozzle-inner";
  inner.position.set(0, 1.3, -7.42);
  root.add(inner);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.055, 8, segments),
    materials.ram,
  );
  ring.name = "f35a-nozzle-ring";
  ring.position.set(0, 1.3, -7.5);
  root.add(ring);

  const glowMaterial = new THREE.MeshStandardMaterial({
    color: 0x101314,
    roughness: 0.75,
    metalness: 0.35,
    emissive: 0x3d2418,
    emissiveIntensity: 0.34,
    side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, segments),
    glowMaterial,
  );
  glow.name = "f35a-engine-glow";
  glow.position.set(0, 1.3, -7.82);
  glow.rotation.y = Math.PI;
  root.add(glow);
  nozzles.push(glow);
}

function addLandingGear(
  root: THREE.Group,
  materials: F35Materials,
  lowDetail: boolean,
): void {
  const segments = lowDetail ? 8 : 12;
  for (const side of [-1, 1]) {
    const attach = new THREE.Vector3(side * 1.22, 1.05, -0.9);
    const axle = new THREE.Vector3(side * 1.72, 0.39, -1.12);
    root.add(cylinderBetween(attach, axle, 0.055, segments, materials.hub));
    root.add(
      cylinderBetween(
        new THREE.Vector3(side * 1.12, 1.0, -0.75),
        new THREE.Vector3(side * 1.55, 0.49, -1.04),
        0.035,
        segments,
        materials.hub,
      ),
    );
    addWheel(root, axle, 0.29, 0.1, materials, segments);

    if (!lowDetail) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.63, 0.34),
        materials.underside,
      );
      door.name = "f35a-main-gear-door";
      door.position.set(side * 1.38, 0.72, -0.72);
      door.rotation.z = side * THREE.MathUtils.degToRad(12);
      root.add(door);
    }
  }

  const noseAttach = new THREE.Vector3(0, 1.08, 4.05);
  const noseAxle = new THREE.Vector3(0, 0.31, 4.47);
  root.add(
    cylinderBetween(noseAttach, noseAxle, 0.047, segments, materials.hub),
  );
  for (const x of [-0.13, 0.13]) {
    addWheel(
      root,
      new THREE.Vector3(x, 0.31, 4.47),
      0.23,
      0.075,
      materials,
      segments,
    );
  }

  if (!lowDetail) {
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.52, 0.23),
        materials.underside,
      );
      door.name = "f35a-nose-gear-door";
      door.position.set(side * 0.18, 0.67, 4.2);
      door.rotation.z = side * THREE.MathUtils.degToRad(8);
      root.add(door);
    }
  }
}

function addWheel(
  root: THREE.Group,
  center: THREE.Vector3,
  radius: number,
  tube: number,
  materials: F35Materials,
  segments: number,
): void {
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, Math.max(6, segments - 2), segments),
    materials.tire,
  );
  tire.name = "f35a-landing-gear-tire";
  tire.position.copy(center);
  tire.rotation.y = Math.PI / 2;
  root.add(tire);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius * 0.42,
      radius * 0.42,
      tube * 1.5,
      segments,
    ),
    materials.hub,
  );
  hub.name = "f35a-wheel-hub";
  hub.position.copy(center);
  hub.rotation.z = Math.PI / 2;
  root.add(hub);
}

function addNavigationAndFormationLights(
  root: THREE.Group,
  materials: F35Materials,
  lowDetail: boolean,
): void {
  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, lowDetail ? 6 : 10, lowDetail ? 4 : 6),
      side < 0 ? materials.navigationRed : materials.navigationGreen,
    );
    light.name = side < 0 ? "f35a-port-light" : "f35a-starboard-light";
    light.position.set(side * 5.29, 1.25, -2.1);
    root.add(light);

    if (!lowDetail) {
      const formation = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.025, 0.07),
        materials.formation,
      );
      formation.name = "f35a-formation-light";
      formation.position.set(side * 1.52, 1.83, -2.35);
      formation.rotation.y = side * THREE.MathUtils.degToRad(18);
      root.add(formation);
    }
  }

  const tailLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, lowDetail ? 6 : 10, lowDetail ? 4 : 6),
    materials.navigationWhite,
  );
  tailLight.name = "f35a-tail-light";
  tailLight.position.set(0, 1.55, -7.03);
  root.add(tailLight);
}

function addUpperSurfaceSeams(
  root: THREE.Group,
  materials: F35Materials,
): void {
  const segments: number[][] = [];
  for (const side of [-1, 1]) {
    segments.push(
      [side * 1.52, 1.225, -3.18],
      [side * 5.15, 1.225, -2.56],
      [side * 1.55, 1.226, 0.48],
      [side * 4.92, 1.226, -1.82],
      [side * 2.18, 1.227, -1.02],
      [side * 2.63, 1.227, -2.95],
    );
  }
  segments.push(
    [-0.72, 1.59, 0.25],
    [-0.72, 1.59, -2.64],
    [0.72, 1.59, 0.25],
    [0.72, 1.59, -2.64],
    [-0.47, 1.61, 4.85],
    [0.47, 1.61, 4.85],
  );
  const seams = lineSegments(segments, materials.seam);
  seams.name = "f35a-upper-surface-seams";
  root.add(seams);
}

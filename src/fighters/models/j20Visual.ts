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

export interface J20Visual {
  root: THREE.Group;
  propellers: THREE.Group[];
  nozzles: THREE.Mesh[];
  dispose: () => void;
}

interface J20Materials {
  body: THREE.MeshStandardMaterial;
  bodyLight: THREE.MeshStandardMaterial;
  underside: THREE.MeshStandardMaterial;
  ram: THREE.MeshStandardMaterial;
  canopy: THREE.MeshPhysicalMaterial;
  canopyFrame: THREE.MeshStandardMaterial;
  intake: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  nozzleDark: THREE.MeshStandardMaterial;
  tire: THREE.MeshStandardMaterial;
  hub: THREE.MeshStandardMaterial;
  sensor: THREE.MeshPhysicalMaterial;
  markingRed: THREE.MeshStandardMaterial;
  markingGold: THREE.MeshStandardMaterial;
  navigationRed: THREE.MeshStandardMaterial;
  navigationGreen: THREE.MeshStandardMaterial;
  navigationWhite: THREE.MeshStandardMaterial;
  formation: THREE.MeshStandardMaterial;
  seam: THREE.LineBasicMaterial;
}

const J20_LENGTH_M = 20.4;
const J20_SPAN_M = 13.5;

/**
 * Aircraft-specific, public-view J-20 model.
 *
 * It follows visible production-aircraft proportions and surface features. It
 * deliberately does not imply knowledge of classified internal geometry,
 * coatings, sensors, propulsion performance, or weapon-bay construction.
 */
export function createJ20Visual(
  fighter: FighterProfile,
  lowDetail = false,
): J20Visual {
  const materials = createMaterials();
  const root = new THREE.Group();
  root.name = "fighter-j-20-detailed";
  root.userData.fighterId = fighter.id;
  root.userData.modelVariant = "J-20 public-view production schematic";
  root.userData.referenceDimensions = {
    lengthM: J20_LENGTH_M,
    wingspanM: J20_SPAN_M,
    heightM: 4.45,
  };

  const nozzles: THREE.Mesh[] = [];
  addMainFuselage(root, materials);
  addTwinEngineShoulders(root, materials);
  addWingsAndCanards(root, materials, lowDetail);
  addEmpennage(root, materials, lowDetail);
  addCanopy(root, materials, lowDetail);
  addIntakesAndSensors(root, materials, lowDetail);
  addTwinNozzles(root, materials, lowDetail, nozzles);
  addLandingGear(root, materials, lowDetail);
  addMarkingsAndLights(root, materials, lowDetail);

  root.scale.set(
    fighter.wingspanM / J20_SPAN_M,
    1,
    fighter.lengthM / J20_LENGTH_M,
  );

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = !lowDetail;
      object.receiveShadow = false;
    }
  });

  root.userData.renderStats = collectRenderStats(root);
  const dispose = (): void => disposeDetailedRoot(root);
  return { root, propellers: [], nozzles, dispose };
}

function createMaterials(): J20Materials {
  return {
    body: standard(0x7f8b8d, 0.74, 0.17, true),
    bodyLight: standard(0x919b9b, 0.7, 0.14, true),
    underside: standard(0x697577, 0.82, 0.12, true),
    ram: standard(0x3f494b, 0.84, 0.22, true),
    canopy: new THREE.MeshPhysicalMaterial({
      color: 0x6c6a52,
      roughness: 0.18,
      metalness: 0.34,
      transmission: 0.06,
      transparent: true,
      opacity: 0.9,
      clearcoat: 0.76,
      clearcoatRoughness: 0.16,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
    canopyFrame: standard(0x293234, 0.7, 0.32, true),
    intake: standard(0x12191b, 0.97, 0.02, true),
    metal: standard(0x666c6d, 0.46, 0.72, true),
    nozzleDark: standard(0x262d2e, 0.62, 0.62, true),
    tire: standard(0x151919, 0.98, 0.01, false),
    hub: standard(0x9da6a2, 0.4, 0.7, true),
    sensor: new THREE.MeshPhysicalMaterial({
      color: 0x394e51,
      roughness: 0.13,
      metalness: 0.4,
      transmission: 0.1,
      transparent: true,
      opacity: 0.92,
      clearcoat: 0.84,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
    markingRed: standard(0xa73732, 0.62, 0.08, true),
    markingGold: standard(0xd6b34d, 0.58, 0.12, true),
    navigationRed: emissive(0xc7473f),
    navigationGreen: emissive(0x4fbd7a),
    navigationWhite: emissive(0xeee8d5),
    formation: emissive(0xaaa873, 0.5),
    seam: new THREE.LineBasicMaterial({
      color: 0x303a3c,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  };
}

function addMainFuselage(root: THREE.Group, materials: J20Materials): void {
  const sections: LoftSection[] = [
    { z: 10.2, halfWidth: 0.025, top: 1.5, shoulder: 1.48, bottom: 1.45 },
    { z: 9.55, halfWidth: 0.22, top: 1.7, shoulder: 1.57, bottom: 1.3 },
    { z: 8.6, halfWidth: 0.47, top: 1.94, shoulder: 1.68, bottom: 1.03 },
    { z: 7.45, halfWidth: 0.68, top: 2.16, shoulder: 1.72, bottom: 0.78 },
    { z: 6.1, halfWidth: 0.87, top: 2.39, shoulder: 1.73, bottom: 0.62 },
    { z: 4.75, halfWidth: 1.12, top: 2.48, shoulder: 1.7, bottom: 0.54 },
    { z: 3.15, halfWidth: 1.5, top: 2.49, shoulder: 1.64, bottom: 0.47 },
    { z: 1.15, halfWidth: 1.72, top: 2.4, shoulder: 1.58, bottom: 0.43 },
    { z: -1.2, halfWidth: 1.78, top: 2.34, shoulder: 1.55, bottom: 0.44 },
    { z: -3.55, halfWidth: 1.68, top: 2.28, shoulder: 1.53, bottom: 0.49 },
    { z: -5.65, halfWidth: 1.37, top: 2.12, shoulder: 1.48, bottom: 0.59 },
    { z: -6.5, halfWidth: 1.06, top: 1.96, shoulder: 1.44, bottom: 0.69 },
  ];
  const fuselage = new THREE.Mesh(loftGeometry(sections), materials.body);
  fuselage.name = "j20-long-chined-fuselage";
  root.add(fuselage);

  const dorsalBlend = prismMesh(
    [
      [0, 6.55],
      [0.75, 5.95],
      [1.16, 4.1],
      [1.74, 2.65],
      [2.12, -1.4],
      [1.68, -5.45],
      [0, -6.22],
      [-1.68, -5.45],
      [-2.12, -1.4],
      [-1.74, 2.65],
      [-1.16, 4.1],
      [-0.75, 5.95],
    ],
    0.12,
    materials.bodyLight,
  );
  dorsalBlend.name = "j20-dorsal-centerbody-blend";
  dorsalBlend.position.y = 1.57;
  root.add(dorsalBlend);

  const belly = prismMesh(
    [
      [0, 6.8],
      [0.72, 5.75],
      [1.45, 2.65],
      [1.55, -4.7],
      [0.95, -6.55],
      [-0.95, -6.55],
      [-1.55, -4.7],
      [-1.45, 2.65],
      [-0.72, 5.75],
    ],
    0.11,
    materials.underside,
  );
  belly.name = "j20-lower-centerbody";
  belly.position.y = 0.48;
  root.add(belly);
}

function addTwinEngineShoulders(
  root: THREE.Group,
  materials: J20Materials,
): void {
  for (const side of [-1, 1]) {
    const nacelle = new THREE.Mesh(
      loftGeometry([
        { z: -2.45, halfWidth: 0.7, top: 2.13, shoulder: 1.55, bottom: 0.62 },
        { z: -4.5, halfWidth: 0.83, top: 2.2, shoulder: 1.52, bottom: 0.58 },
        { z: -6.5, halfWidth: 0.78, top: 2.08, shoulder: 1.5, bottom: 0.68 },
        { z: -8.65, halfWidth: 0.7, top: 1.92, shoulder: 1.47, bottom: 0.82 },
        { z: -9.45, halfWidth: 0.62, top: 1.82, shoulder: 1.45, bottom: 0.93 },
      ]),
      materials.body,
    );
    nacelle.name = "j20-twin-engine-nacelle";
    nacelle.position.x = side * 0.92;
    root.add(nacelle);

    const spine = prismMesh(
      mirrorPlanform(
        [
          [0.45, -2.8],
          [1.56, -3.25],
          [1.58, -8.42],
          [0.7, -9.18],
        ],
        side,
      ),
      0.08,
      materials.bodyLight,
    );
    spine.name = "j20-engine-shoulder-panel";
    spine.position.y = 1.91;
    root.add(spine);
  }
}

function addWingsAndCanards(
  root: THREE.Group,
  materials: J20Materials,
  lowDetail: boolean,
): void {
  const wing = prismMesh(
    [
      [0, 3.05],
      [1.65, 2.5],
      [3.55, 1.1],
      [6.75, -2.72],
      [6.55, -3.98],
      [2.12, -4.88],
      [0.74, -4.34],
      [0, -4.02],
      [-0.74, -4.34],
      [-2.12, -4.88],
      [-6.55, -3.98],
      [-6.75, -2.72],
      [-3.55, 1.1],
      [-1.65, 2.5],
    ],
    0.14,
    materials.body,
  );
  wing.name = "j20-clipped-delta-wing";
  wing.position.y = 1.16;
  root.add(wing);

  for (const side of [-1, 1]) {
    const canard = prismMesh(
      mirrorPlanform(
        [
          [0.86, 5.0],
          [1.23, 4.8],
          [3.22, 3.22],
          [3.08, 2.55],
          [1.05, 3.35],
        ],
        side,
      ),
      0.11,
      materials.bodyLight,
    );
    canard.name = "j20-close-coupled-canard";
    canard.position.y = 1.5;
    canard.rotation.z = side * THREE.MathUtils.degToRad(-2.5);
    root.add(canard);

    const leadingRam = prismMesh(
      mirrorPlanform(
        [
          [1.67, 2.45],
          [6.75, -2.72],
          [6.69, -2.92],
          [1.75, 2.28],
        ],
        side,
      ),
      0.02,
      materials.ram,
    );
    leadingRam.name = "j20-wing-leading-ram-edge";
    leadingRam.position.y = 1.24;
    root.add(leadingRam);

    const trailingRam = prismMesh(
      mirrorPlanform(
        [
          [2.08, -4.68],
          [6.54, -3.8],
          [6.54, -4.02],
          [2.12, -4.91],
        ],
        side,
      ),
      0.02,
      materials.ram,
    );
    trailingRam.name = "j20-wing-trailing-ram-edge";
    trailingRam.position.y = 1.24;
    root.add(trailingRam);

    const canardRam = prismMesh(
      mirrorPlanform(
        [
          [1.18, 4.76],
          [3.22, 3.22],
          [3.17, 3.08],
          [1.21, 4.61],
        ],
        side,
      ),
      0.018,
      materials.ram,
    );
    canardRam.name = "j20-canard-leading-ram-edge";
    canardRam.position.y = 1.57;
    root.add(canardRam);
  }

  if (!lowDetail) addSurfaceSeams(root, materials);
}

function addEmpennage(
  root: THREE.Group,
  materials: J20Materials,
  lowDetail: boolean,
): void {
  for (const side of [-1, 1]) {
    const tail = verticalSurfaceMesh(
      [
        [0, 0],
        [3.15, 0],
        [2.55, 2.82],
        [1.0, 3.34],
      ],
      0.12,
      materials.body,
    );
    tail.name = "j20-outward-canted-tail";
    tail.position.set(side * 1.33, 1.52, -4.95);
    tail.rotation.z = -side * THREE.MathUtils.degToRad(22);
    root.add(tail);

    const rudderSeam = lineSegments(
      [
        [side * 2.36, 3.92, -6.15],
        [side * 2.74, 1.64, -7.68],
      ],
      materials.seam,
    );
    rudderSeam.name = "j20-rudder-seam";
    root.add(rudderSeam);

    const ventral = verticalSurfaceMesh(
      [
        [0, 0],
        [1.42, 0],
        [1.05, 0.7],
        [0.38, 0.82],
      ],
      0.07,
      materials.underside,
    );
    ventral.name = "j20-ventral-fin";
    ventral.position.set(side * 1.46, 0.72, -6.25);
    ventral.rotation.z = side * THREE.MathUtils.degToRad(158);
    root.add(ventral);

    if (!lowDetail) {
      const tailReceiver = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.5, 0.09),
        materials.ram,
      );
      tailReceiver.name = "j20-tail-receiver-panel";
      tailReceiver.position.set(side * 2.34, 3.86, -6.32);
      tailReceiver.rotation.z = -side * THREE.MathUtils.degToRad(22);
      root.add(tailReceiver);
    }
  }
}

function addCanopy(
  root: THREE.Group,
  materials: J20Materials,
  lowDetail: boolean,
): void {
  const canopy = new THREE.Mesh(
    loftGeometry([
      { z: 7.42, halfWidth: 0.05, top: 1.98, shoulder: 1.94, bottom: 1.9 },
      { z: 6.88, halfWidth: 0.39, top: 2.52, shoulder: 2.23, bottom: 1.85 },
      { z: 5.95, halfWidth: 0.59, top: 2.84, shoulder: 2.44, bottom: 1.83 },
      { z: 4.82, halfWidth: 0.52, top: 2.7, shoulder: 2.34, bottom: 1.82 },
      { z: 4.25, halfWidth: 0.3, top: 2.43, shoulder: 2.2, bottom: 1.82 },
    ]),
    materials.canopy,
  );
  canopy.name = "j20-single-seat-canopy";
  root.add(canopy);

  const sill = prismMesh(
    [
      [0, 7.46],
      [0.41, 6.9],
      [0.62, 5.9],
      [0.54, 4.78],
      [0.31, 4.18],
      [-0.31, 4.18],
      [-0.54, 4.78],
      [-0.62, 5.9],
      [-0.41, 6.9],
    ],
    0.055,
    materials.canopyFrame,
  );
  sill.name = "j20-canopy-sill";
  sill.position.y = 1.82;
  root.add(sill);

  if (!lowDetail) {
    const aftFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 0.055, 0.09),
      materials.canopyFrame,
    );
    aftFrame.name = "j20-canopy-aft-frame";
    aftFrame.position.set(0, 2.35, 4.35);
    aftFrame.rotation.x = THREE.MathUtils.degToRad(-18);
    root.add(aftFrame);
  }
}

function addIntakesAndSensors(
  root: THREE.Group,
  materials: J20Materials,
  lowDetail: boolean,
): void {
  for (const side of [-1, 1]) {
    const opening = quadMesh(
      [
        [side * 1.12, 1.86, 4.35],
        [side * 1.63, 1.72, 3.5],
        [side * 1.7, 1.08, 1.08],
        [side * 1.17, 1.18, 1.72],
      ],
      materials.intake,
    );
    opening.name = "j20-dsi-intake-opening";
    root.add(opening);

    const bump = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, lowDetail ? 8 : 14, lowDetail ? 5 : 8),
      materials.bodyLight,
    );
    bump.name = "j20-dsi-compression-bump";
    bump.scale.set(0.62, 0.38, 1.92);
    bump.position.set(side * 1.1, 1.52, 2.63);
    root.add(bump);

    const intakeLip = quadMesh(
      [
        [side * 1.13, 1.9, 4.42],
        [side * 1.67, 1.75, 3.55],
        [side * 1.63, 1.62, 3.42],
        [side * 1.11, 1.76, 4.27],
      ],
      materials.ram,
    );
    intakeLip.name = "j20-intake-ram-lip";
    root.add(intakeLip);

    const sideSensor = quadMesh(
      [
        [side * 0.52, 1.83, 7.44],
        [side * 0.64, 1.7, 7.1],
        [side * 0.5, 1.54, 7.24],
        [side * 0.4, 1.65, 7.55],
      ],
      materials.sensor,
    );
    sideSensor.name = "j20-forward-aperture";
    root.add(sideSensor);
  }

  const chinSensor = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.4, 0),
    materials.sensor,
  );
  chinSensor.name = "j20-chin-electro-optical-window";
  chinSensor.scale.set(0.72, 0.5, 1.4);
  chinSensor.position.set(0, 0.73, 6.73);
  chinSensor.rotation.x = THREE.MathUtils.degToRad(10);
  root.add(chinSensor);

  if (!lowDetail) {
    const noseRadarSeam = lineSegments(
      [
        [-0.55, 1.8, 8.43],
        [-0.7, 1.72, 7.58],
        [0.55, 1.8, 8.43],
        [0.7, 1.72, 7.58],
      ],
      materials.seam,
    );
    noseRadarSeam.name = "j20-radome-break-lines";
    root.add(noseRadarSeam);
  }
}

function addTwinNozzles(
  root: THREE.Group,
  materials: J20Materials,
  lowDetail: boolean,
  nozzles: THREE.Mesh[],
): void {
  const segments = lowDetail ? 12 : 20;
  for (const side of [-1, 1]) {
    const x = side * 0.96;
    const petals = cylinderAlongZ(
      0.68,
      0.59,
      0.76,
      segments,
      materials.metal,
      true,
    );
    petals.name = "j20-nozzle-petals";
    petals.position.set(x, 1.43, -9.68);
    root.add(petals);

    const petalCollar = cylinderAlongZ(
      0.74,
      0.68,
      0.34,
      segments,
      materials.nozzleDark,
      true,
    );
    petalCollar.name = "j20-nozzle-collar";
    petalCollar.position.set(x, 1.43, -9.28);
    root.add(petalCollar);

    const inner = cylinderAlongZ(
      0.53,
      0.51,
      0.53,
      segments,
      materials.intake,
      true,
    );
    inner.name = "j20-nozzle-inner";
    inner.position.set(x, 1.43, -10.0);
    root.add(inner);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.59, 0.052, 8, segments),
      materials.ram,
    );
    ring.name = "j20-nozzle-ring";
    ring.position.set(x, 1.43, -10.22);
    root.add(ring);

    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0x101314,
      roughness: 0.75,
      metalness: 0.35,
      emissive: 0x493023,
      emissiveIntensity: 0.3,
      side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, segments),
      glowMaterial,
    );
    glow.name = "j20-engine-glow";
    glow.position.set(x, 1.43, -10.27);
    glow.rotation.y = Math.PI;
    root.add(glow);
    nozzles.push(glow);
  }
}

function addLandingGear(
  root: THREE.Group,
  materials: J20Materials,
  lowDetail: boolean,
): void {
  const segments = lowDetail ? 8 : 12;
  for (const side of [-1, 1]) {
    const attach = new THREE.Vector3(side * 1.3, 1.04, -1.2);
    const axle = new THREE.Vector3(side * 2.02, 0.42, -1.54);
    root.add(
      cylinderBetween(
        attach,
        axle,
        0.06,
        segments,
        materials.hub,
        "j20-main-gear-strut",
      ),
    );
    root.add(
      cylinderBetween(
        new THREE.Vector3(side * 1.18, 0.98, -1.0),
        new THREE.Vector3(side * 1.82, 0.52, -1.45),
        0.035,
        segments,
        materials.hub,
        "j20-main-gear-drag-brace",
      ),
    );
    addWheel(root, axle, 0.33, 0.11, materials, segments, "main");

    if (!lowDetail) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.68, 0.42),
        materials.underside,
      );
      door.name = "j20-main-gear-door";
      door.position.set(side * 1.58, 0.72, -1.05);
      door.rotation.z = side * THREE.MathUtils.degToRad(14);
      root.add(door);
    }
  }

  const noseAttach = new THREE.Vector3(0, 1.04, 5.58);
  const noseAxle = new THREE.Vector3(0, 0.31, 6.0);
  root.add(
    cylinderBetween(
      noseAttach,
      noseAxle,
      0.05,
      segments,
      materials.hub,
      "j20-nose-gear-strut",
    ),
  );
  for (const x of [-0.14, 0.14]) {
    addWheel(
      root,
      new THREE.Vector3(x, 0.31, 6.0),
      0.24,
      0.075,
      materials,
      segments,
      "nose",
    );
  }

  if (!lowDetail) {
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.56, 0.25),
        materials.underside,
      );
      door.name = "j20-nose-gear-door";
      door.position.set(side * 0.2, 0.65, 5.68);
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
  materials: J20Materials,
  segments: number,
  gear: "main" | "nose",
): void {
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, Math.max(6, segments - 2), segments),
    materials.tire,
  );
  tire.name = `j20-${gear}-gear-tire`;
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
  hub.name = `j20-${gear}-wheel-hub`;
  hub.position.copy(center);
  hub.rotation.z = Math.PI / 2;
  root.add(hub);
}

function addMarkingsAndLights(
  root: THREE.Group,
  materials: J20Materials,
  lowDetail: boolean,
): void {
  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, lowDetail ? 6 : 10, lowDetail ? 4 : 6),
      side < 0 ? materials.navigationRed : materials.navigationGreen,
    );
    light.name = side < 0 ? "j20-port-light" : "j20-starboard-light";
    light.position.set(side * 6.67, 1.27, -3.02);
    root.add(light);

    if (!lowDetail) {
      const formation = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.025, 0.075),
        materials.formation,
      );
      formation.name = "j20-formation-light";
      formation.position.set(side * 1.62, 1.88, -3.2);
      formation.rotation.y = side * THREE.MathUtils.degToRad(14);
      root.add(formation);
    }
  }

  const tailLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, lowDetail ? 6 : 10, lowDetail ? 4 : 6),
    materials.navigationWhite,
  );
  tailLight.name = "j20-tail-light";
  tailLight.position.set(0, 1.7, -9.58);
  root.add(tailLight);

  if (!lowDetail) {
    const insignia = createStarInsignia(materials);
    insignia.name = "j20-low-visibility-plaaf-insignia";
    insignia.scale.setScalar(0.34);
    insignia.position.set(-3.75, 1.248, -2.17);
    insignia.rotation.x = -Math.PI / 2;
    insignia.rotation.z = THREE.MathUtils.degToRad(-26);
    root.add(insignia);
  }
}

function createStarInsignia(materials: J20Materials): THREE.Group {
  const group = new THREE.Group();
  const gold = new THREE.Mesh(starGeometry(1, 0.42), materials.markingGold);
  const red = new THREE.Mesh(starGeometry(0.82, 0.42), materials.markingRed);
  red.position.z = 0.012;
  group.add(gold, red);
  return group;
}

function starGeometry(outer: number, innerRatio: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? outer : outer * innerRatio;
    const angle = Math.PI / 2 + (point * Math.PI) / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 1);
}

function addSurfaceSeams(root: THREE.Group, materials: J20Materials): void {
  const points: number[][] = [];
  for (const side of [-1, 1]) {
    points.push(
      [side * 2.05, 1.244, -4.55],
      [side * 6.42, 1.244, -3.7],
      [side * 1.83, 1.245, 2.22],
      [side * 6.4, 1.245, -2.73],
      [side * 2.7, 1.246, -0.15],
      [side * 3.45, 1.246, -3.92],
      [side * 1.03, 1.578, 3.43],
      [side * 3.0, 1.578, 2.68],
    );
  }
  points.push(
    [-0.75, 1.65, 1.0],
    [-0.75, 1.65, -4.1],
    [0.75, 1.65, 1.0],
    [0.75, 1.65, -4.1],
    [-0.75, 1.65, 1.0],
    [0.75, 1.65, 1.0],
    [-0.75, 1.65, -4.1],
    [0.75, 1.65, -4.1],
  );
  const seams = lineSegments(points, materials.seam);
  seams.name = "j20-public-view-surface-seams";
  root.add(seams);

  const lowerBay = lineSegments(
    [
      [-0.62, 0.415, 2.0],
      [-0.62, 0.415, -3.45],
      [0.62, 0.415, 2.0],
      [0.62, 0.415, -3.45],
      [-0.62, 0.415, 2.0],
      [0.62, 0.415, 2.0],
      [-0.62, 0.415, -3.45],
      [0.62, 0.415, -3.45],
    ],
    materials.seam,
  );
  lowerBay.name = "j20-schematic-closed-center-bay-seam";
  root.add(lowerBay);
}

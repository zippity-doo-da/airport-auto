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

export interface Mig35Visual {
  root: THREE.Group;
  propellers: THREE.Group[];
  nozzles: THREE.Mesh[];
  dispose: () => void;
}

interface Mig35Materials {
  body: THREE.MeshStandardMaterial;
  bodyLight: THREE.MeshStandardMaterial;
  bodyDark: THREE.MeshStandardMaterial;
  underside: THREE.MeshStandardMaterial;
  radome: THREE.MeshStandardMaterial;
  canopy: THREE.MeshPhysicalMaterial;
  canopyFrame: THREE.MeshStandardMaterial;
  intake: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  nozzleInterior: THREE.MeshStandardMaterial;
  sensor: THREE.MeshPhysicalMaterial;
  tire: THREE.MeshStandardMaterial;
  hub: THREE.MeshStandardMaterial;
  markingRed: THREE.MeshStandardMaterial;
  markingWhite: THREE.MeshStandardMaterial;
  navigationRed: THREE.MeshStandardMaterial;
  navigationGreen: THREE.MeshStandardMaterial;
  navigationWhite: THREE.MeshStandardMaterial;
  seam: THREE.LineBasicMaterial;
}

const MIG35_LENGTH_M = 17.3;
const MIG35_SPAN_M = 12;

/**
 * Aircraft-specific MiG-35 display model using UAC's public dimensions and
 * visible external arrangement. The camouflage and markings are illustrative,
 * not a representation of a particular operational airframe.
 */
export function createMig35Visual(
  fighter: FighterProfile,
  lowDetail = false,
): Mig35Visual {
  const materials = createMaterials();
  const root = new THREE.Group();
  root.name = "fighter-mig-35-detailed";
  root.userData.fighterId = fighter.id;
  root.userData.modelVariant = "MiG-35 single-seat";
  root.userData.referenceDimensions = {
    lengthM: MIG35_LENGTH_M,
    wingspanM: MIG35_SPAN_M,
    heightM: 4.4,
  };

  const nozzles: THREE.Mesh[] = [];
  addFuselage(root, materials);
  addEngineNacelles(root, materials, lowDetail);
  addWingsAndLerx(root, materials, lowDetail);
  addEmpennage(root, materials, lowDetail);
  addCanopyAndSensors(root, materials, lowDetail);
  addIntakes(root, materials, lowDetail);
  addNozzles(root, materials, lowDetail, nozzles);
  addLandingGear(root, materials, lowDetail);
  addMarkingsAndLights(root, materials, lowDetail);

  root.scale.set(
    fighter.wingspanM / MIG35_SPAN_M,
    1,
    fighter.lengthM / MIG35_LENGTH_M,
  );
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = !lowDetail;
    object.receiveShadow = false;
  });
  root.userData.renderStats = collectRenderStats(root);

  return {
    root,
    propellers: [],
    nozzles,
    dispose: () => disposeDetailedRoot(root),
  };
}

function createMaterials(): Mig35Materials {
  return {
    body: standard(0x8da5ac, 0.71, 0.16, false),
    bodyLight: standard(0xaab9bc, 0.73, 0.13, false),
    bodyDark: standard(0x647f89, 0.75, 0.15, false),
    underside: standard(0x798f96, 0.82, 0.12, false),
    radome: standard(0x677375, 0.8, 0.18, false),
    canopy: new THREE.MeshPhysicalMaterial({
      color: 0x405f69,
      roughness: 0.13,
      metalness: 0.32,
      transmission: 0.13,
      transparent: true,
      opacity: 0.9,
      clearcoat: 0.88,
      clearcoatRoughness: 0.12,
      side: THREE.DoubleSide,
    }),
    canopyFrame: standard(0x283638, 0.65, 0.36, false),
    intake: standard(0x101719, 0.96, 0.03, true),
    metal: standard(0x625f59, 0.4, 0.76, true),
    nozzleInterior: new THREE.MeshStandardMaterial({
      color: 0x211e1a,
      emissive: 0xcc7138,
      emissiveIntensity: 0.56,
      roughness: 0.48,
      metalness: 0.72,
      side: THREE.DoubleSide,
    }),
    sensor: new THREE.MeshPhysicalMaterial({
      color: 0x293f46,
      roughness: 0.1,
      metalness: 0.28,
      transmission: 0.16,
      transparent: true,
      opacity: 0.92,
      clearcoat: 0.9,
    }),
    tire: standard(0x151818, 0.98, 0.01, false),
    hub: standard(0x969c98, 0.42, 0.68, true),
    markingRed: standard(0xc84b43, 0.76, 0.06, false),
    markingWhite: standard(0xe3e7df, 0.82, 0.04, false),
    navigationRed: emissive(0xd94d46),
    navigationGreen: emissive(0x4fc885),
    navigationWhite: emissive(0xeee7cb),
    seam: new THREE.LineBasicMaterial({
      color: 0x3c545b,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  };
}

function addFuselage(root: THREE.Group, materials: Mig35Materials): void {
  const sections: LoftSection[] = [
    { z: 8.65, halfWidth: 0.03, top: 1.48, shoulder: 1.45, bottom: 1.42 },
    { z: 8.05, halfWidth: 0.31, top: 1.7, shoulder: 1.52, bottom: 1.22 },
    { z: 7.05, halfWidth: 0.55, top: 1.95, shoulder: 1.6, bottom: 0.94 },
    { z: 5.7, halfWidth: 0.68, top: 2.17, shoulder: 1.63, bottom: 0.68 },
    { z: 4.0, halfWidth: 0.82, top: 2.48, shoulder: 1.61, bottom: 0.55 },
    { z: 2.1, halfWidth: 1.12, top: 2.53, shoulder: 1.55, bottom: 0.48 },
    { z: 0, halfWidth: 1.38, top: 2.43, shoulder: 1.48, bottom: 0.43 },
    { z: -2.1, halfWidth: 1.32, top: 2.32, shoulder: 1.45, bottom: 0.5 },
    { z: -4.25, halfWidth: 1.1, top: 2.16, shoulder: 1.42, bottom: 0.63 },
    { z: -6.15, halfWidth: 0.73, top: 1.94, shoulder: 1.36, bottom: 0.83 },
    { z: -7.45, halfWidth: 0.4, top: 1.66, shoulder: 1.31, bottom: 1.0 },
  ];
  const body = new THREE.Mesh(loftGeometry(sections), materials.body);
  body.name = "mig35-fuselage";
  root.add(body);

  const radome = new THREE.Mesh(
    loftGeometry([
      { z: 8.68, halfWidth: 0.02, top: 1.49, shoulder: 1.47, bottom: 1.44 },
      { z: 8.2, halfWidth: 0.27, top: 1.67, shoulder: 1.52, bottom: 1.27 },
      { z: 7.58, halfWidth: 0.46, top: 1.84, shoulder: 1.57, bottom: 1.04 },
    ]),
    materials.radome,
  );
  radome.name = "mig35-radome";
  root.add(radome);

  const dorsalSpine = new THREE.Mesh(
    loftGeometry([
      { z: 3.45, halfWidth: 0.28, top: 2.72, shoulder: 2.54, bottom: 2.29 },
      { z: 1.3, halfWidth: 0.48, top: 2.78, shoulder: 2.47, bottom: 2.16 },
      { z: -1.1, halfWidth: 0.53, top: 2.64, shoulder: 2.34, bottom: 2.04 },
      { z: -3.9, halfWidth: 0.34, top: 2.35, shoulder: 2.16, bottom: 1.98 },
      { z: -5.4, halfWidth: 0.08, top: 2.08, shoulder: 2.01, bottom: 1.95 },
    ]),
    materials.bodyLight,
  );
  dorsalSpine.name = "mig35-dorsal-spine";
  root.add(dorsalSpine);
}

function addEngineNacelles(
  root: THREE.Group,
  materials: Mig35Materials,
  lowDetail: boolean,
): void {
  const segments = lowDetail ? 10 : 16;
  for (const side of [-1, 1]) {
    const nacelle = cylinderAlongZ(
      0.74,
      0.66,
      7.25,
      segments,
      materials.underside,
    );
    nacelle.name = "mig35-engine-nacelle";
    nacelle.scale.y = 0.82;
    nacelle.position.set(side * 1.12, 1.15, -3.25);
    root.add(nacelle);

    const fairing = new THREE.Mesh(
      loftGeometry([
        { z: 1.2, halfWidth: 0.44, top: 2.03, shoulder: 1.7, bottom: 1.07 },
        { z: -1.3, halfWidth: 0.7, top: 2.19, shoulder: 1.62, bottom: 0.76 },
        { z: -4.3, halfWidth: 0.68, top: 2.04, shoulder: 1.53, bottom: 0.78 },
        { z: -6.8, halfWidth: 0.57, top: 1.75, shoulder: 1.4, bottom: 0.84 },
      ]),
      materials.body,
    );
    fairing.name = "mig35-upper-engine-fairing";
    fairing.position.x = side * 1.08;
    root.add(fairing);
  }
}

function addWingsAndLerx(
  root: THREE.Group,
  materials: Mig35Materials,
  lowDetail: boolean,
): void {
  const wing = prismMesh(
    [
      [0.85, 0.65],
      [2.04, 0.12],
      [6, -2.65],
      [5.82, -3.55],
      [2.1, -3.35],
      [0.78, -2.65],
      [-0.78, -2.65],
      [-2.1, -3.35],
      [-5.82, -3.55],
      [-6, -2.65],
      [-2.04, 0.12],
      [-0.85, 0.65],
    ],
    0.13,
    materials.body,
  );
  wing.name = "mig35-swept-main-wing";
  wing.position.y = 1.38;
  root.add(wing);

  const lerx = prismMesh(
    [
      [0, 4.45],
      [0.7, 4.12],
      [2.22, 0.35],
      [2.06, -1.55],
      [0.82, -2.1],
      [-0.82, -2.1],
      [-2.06, -1.55],
      [-2.22, 0.35],
      [-0.7, 4.12],
    ],
    0.14,
    materials.bodyLight,
  );
  lerx.name = "mig35-leading-edge-root-extension";
  lerx.position.y = 1.62;
  root.add(lerx);

  for (const side of [-1, 1]) {
    const camouflage = prismMesh(
      mirrorPlanform(
        [
          [1.7, -0.2],
          [5.58, -2.82],
          [4.25, -3.26],
          [1.78, -2.9],
        ],
        side,
      ),
      0.018,
      side < 0 ? materials.bodyDark : materials.bodyLight,
    );
    camouflage.name = "mig35-wing-camouflage-panel";
    camouflage.position.y = 1.46;
    root.add(camouflage);
  }

  if (!lowDetail) {
    const controlSeams = lineSegments(
      [
        [-2.12, 1.47, -3.12],
        [-5.65, 1.47, -3.38],
        [2.12, 1.47, -3.12],
        [5.65, 1.47, -3.38],
        [-1.92, 1.48, -1.55],
        [-5.18, 1.48, -2.9],
        [1.92, 1.48, -1.55],
        [5.18, 1.48, -2.9],
      ],
      materials.seam,
    );
    controlSeams.name = "mig35-wing-control-seams";
    root.add(controlSeams);

    for (const side of [-1, 1]) {
      for (const x of [3.05, 4.65]) {
        const pylon = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.27, 0.84),
          materials.underside,
        );
        pylon.name = "mig35-wing-pylon";
        pylon.position.set(side * x, 1.15, -2.66);
        pylon.rotation.z = side * THREE.MathUtils.degToRad(2);
        root.add(pylon);
      }
    }
  }
}

function addEmpennage(
  root: THREE.Group,
  materials: Mig35Materials,
  lowDetail: boolean,
): void {
  const stabilators = prismMesh(
    [
      [0.75, -4.35],
      [1.68, -4.46],
      [4.33, -5.68],
      [4.12, -6.83],
      [1.43, -6.18],
      [0, -5.75],
      [-1.43, -6.18],
      [-4.12, -6.83],
      [-4.33, -5.68],
      [-1.68, -4.46],
      [-0.75, -4.35],
    ],
    0.11,
    materials.body,
  );
  stabilators.name = "mig35-all-moving-stabilators";
  stabilators.position.y = 1.39;
  root.add(stabilators);

  for (const side of [-1, 1]) {
    const tail = verticalSurfaceMesh(
      [
        [0, 0],
        [2.68, 0],
        [2.28, 2.95],
        [0.92, 3.35],
      ],
      0.13,
      materials.body,
    );
    tail.name = "mig35-twin-vertical-tail";
    tail.position.set(side * 1.45, 1.52, -4.0);
    tail.rotation.z = -side * THREE.MathUtils.degToRad(17);
    root.add(tail);

    const rudderSeam = lineSegments(
      [
        [side * 2.35, 4.2, -5.08],
        [side * 2.55, 1.65, -6.42],
      ],
      materials.seam,
    );
    rudderSeam.name = "mig35-rudder-seam";
    root.add(rudderSeam);

    if (!lowDetail) {
      const antenna = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.37, 0.08),
        materials.bodyDark,
      );
      antenna.name = "mig35-tail-antenna";
      antenna.position.set(side * 2.3, 4.38, -5.16);
      antenna.rotation.z = -side * THREE.MathUtils.degToRad(17);
      root.add(antenna);
    }
  }
}

function addCanopyAndSensors(
  root: THREE.Group,
  materials: Mig35Materials,
  lowDetail: boolean,
): void {
  const canopy = new THREE.Mesh(
    loftGeometry([
      { z: 5.9, halfWidth: 0.05, top: 2.09, shoulder: 2.04, bottom: 1.98 },
      { z: 5.3, halfWidth: 0.36, top: 2.56, shoulder: 2.31, bottom: 1.9 },
      { z: 4.25, halfWidth: 0.53, top: 2.97, shoulder: 2.49, bottom: 1.88 },
      { z: 3.05, halfWidth: 0.5, top: 2.86, shoulder: 2.4, bottom: 1.87 },
      { z: 2.35, halfWidth: 0.27, top: 2.37, shoulder: 2.16, bottom: 1.88 },
    ]),
    materials.canopy,
  );
  canopy.name = "mig35-bubble-canopy";
  root.add(canopy);

  const sill = prismMesh(
    [
      [0, 6.02],
      [0.39, 5.52],
      [0.58, 4.15],
      [0.48, 2.55],
      [0.25, 2.18],
      [-0.25, 2.18],
      [-0.48, 2.55],
      [-0.58, 4.15],
      [-0.39, 5.52],
    ],
    0.055,
    materials.canopyFrame,
  );
  sill.name = "mig35-canopy-sill";
  sill.position.y = 1.89;
  root.add(sill);

  const irst = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, lowDetail ? 8 : 16, lowDetail ? 5 : 9),
    materials.sensor,
  );
  irst.name = "mig35-irst-turret";
  irst.scale.set(1, 0.78, 1.08);
  irst.position.set(0.47, 2.1, 5.62);
  root.add(irst);

  if (!lowDetail) {
    const canopyBow = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.055, 0.08),
      materials.canopyFrame,
    );
    canopyBow.name = "mig35-canopy-aft-frame";
    canopyBow.position.set(0, 2.53, 2.44);
    canopyBow.rotation.x = THREE.MathUtils.degToRad(-17);
    root.add(canopyBow);
  }
}

function addIntakes(
  root: THREE.Group,
  materials: Mig35Materials,
  lowDetail: boolean,
): void {
  for (const side of [-1, 1]) {
    const opening = quadMesh(
      [
        [side * 0.67, 1.72, 2.2],
        [side * 1.65, 1.65, 1.7],
        [side * 1.72, 0.66, 0.05],
        [side * 0.78, 0.73, 0.42],
      ],
      materials.intake,
    );
    opening.name = "mig35-rectangular-intake";
    root.add(opening);

    const lip = quadMesh(
      [
        [side * 0.65, 1.78, 2.28],
        [side * 1.7, 1.71, 1.74],
        [side * 1.64, 1.56, 1.6],
        [side * 0.68, 1.62, 2.12],
      ],
      materials.bodyDark,
    );
    lip.name = "mig35-intake-upper-lip";
    root.add(lip);

    if (!lowDetail) {
      const splitter = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.82, 1.62),
        materials.bodyDark,
      );
      splitter.name = "mig35-intake-splitter";
      splitter.position.set(side * 0.73, 1.15, 1.11);
      splitter.rotation.y = side * THREE.MathUtils.degToRad(8);
      root.add(splitter);
    }
  }
}

function addNozzles(
  root: THREE.Group,
  materials: Mig35Materials,
  lowDetail: boolean,
  nozzles: THREE.Mesh[],
): void {
  const segments = lowDetail ? 12 : 20;
  for (const side of [-1, 1]) {
    const x = side * 1.08;
    const petals = cylinderAlongZ(
      0.68,
      0.57,
      0.82,
      segments,
      materials.metal,
      true,
    );
    petals.name = "mig35-rd33mk-nozzle-petals";
    petals.position.set(x, 1.28, -7.63);
    root.add(petals);

    const interior = new THREE.Mesh(
      new THREE.CircleGeometry(0.56, segments),
      materials.nozzleInterior,
    );
    interior.name = "mig35-nozzle-interior";
    interior.position.set(x, 1.28, -8.05);
    interior.rotation.y = Math.PI;
    root.add(interior);
    nozzles.push(interior);

    if (!lowDetail) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.055, 6, segments),
        materials.metal,
      );
      ring.name = "mig35-nozzle-actuator-ring";
      ring.position.set(x, 1.28, -7.95);
      root.add(ring);
    }
  }
}

function addLandingGear(
  root: THREE.Group,
  materials: Mig35Materials,
  lowDetail: boolean,
): void {
  if (lowDetail) return;
  const gear = new THREE.Group();
  gear.name = "mig35-landing-gear";
  const segments = 10;

  for (const side of [-1, 1]) {
    const attach = new THREE.Vector3(side * 1.38, 0.62, -1.48);
    const axle = new THREE.Vector3(side * 2.02, 0.22, -1.65);
    gear.add(cylinderBetween(attach, axle, 0.06, segments, materials.hub));
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.23, 0.085, 7, 12),
      materials.tire,
    );
    wheel.name = "mig35-main-wheel";
    wheel.rotation.y = Math.PI / 2;
    wheel.position.copy(axle);
    gear.add(wheel);
  }

  const noseAttach = new THREE.Vector3(0, 0.69, 4.78);
  const noseAxle = new THREE.Vector3(0, 0.2, 4.97);
  gear.add(
    cylinderBetween(noseAttach, noseAxle, 0.05, segments, materials.hub),
  );
  const noseWheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.064, 7, 12),
    materials.tire,
  );
  noseWheel.name = "mig35-nose-wheel";
  noseWheel.rotation.y = Math.PI / 2;
  noseWheel.position.copy(noseAxle);
  gear.add(noseWheel);
  root.add(gear);
}

function addMarkingsAndLights(
  root: THREE.Group,
  materials: Mig35Materials,
  lowDetail: boolean,
): void {
  const radomeBreak = lineSegments(
    [
      [-0.45, 1.78, 7.58],
      [-0.58, 1.7, 7.05],
      [0.45, 1.78, 7.58],
      [0.58, 1.7, 7.05],
    ],
    materials.seam,
  );
  radomeBreak.name = "mig35-radome-break-lines";
  root.add(radomeBreak);

  for (const side of [-1, 1]) {
    const navigation = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 5),
      side < 0 ? materials.navigationRed : materials.navigationGreen,
    );
    navigation.name = "mig35-navigation-light";
    navigation.position.set(side * 5.88, 1.48, -3.23);
    root.add(navigation);

    if (!lowDetail) {
      const roundel = new THREE.Mesh(
        new THREE.CircleGeometry(0.34, 5),
        materials.markingRed,
      );
      roundel.name = "mig35-illustrative-red-star";
      roundel.scale.set(1, 0.72, 1);
      roundel.rotation.x = -Math.PI / 2;
      roundel.rotation.z = THREE.MathUtils.degToRad(18);
      roundel.position.set(side * 3.3, 1.465, -2.5);
      root.add(roundel);

      const numberPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.34, 0.76),
        materials.markingWhite,
      );
      numberPlate.name = "mig35-fuselage-marking";
      numberPlate.position.set(side * 0.83, 1.8, 3.45);
      root.add(numberPlate);
    }
  }

  const tailLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 5),
    materials.navigationWhite,
  );
  tailLight.name = "mig35-tail-light";
  tailLight.position.set(0, 1.57, -8.0);
  root.add(tailLight);
}

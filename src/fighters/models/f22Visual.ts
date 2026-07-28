import * as THREE from "three";
import type { FighterProfile } from "../fighterCatalog";
import {
  collectRenderStats,
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

export interface F22Visual {
  root: THREE.Group;
  propellers: THREE.Group[];
  nozzles: THREE.Mesh[];
  dispose: () => void;
}

interface F22Materials {
  body: THREE.MeshStandardMaterial;
  bodyLight: THREE.MeshStandardMaterial;
  underside: THREE.MeshStandardMaterial;
  ram: THREE.MeshStandardMaterial;
  canopy: THREE.MeshPhysicalMaterial;
  canopyFrame: THREE.MeshStandardMaterial;
  intake: THREE.MeshStandardMaterial;
  nozzle: THREE.MeshStandardMaterial;
  nozzleInterior: THREE.MeshStandardMaterial;
  tire: THREE.MeshStandardMaterial;
  hub: THREE.MeshStandardMaterial;
  navigationRed: THREE.MeshStandardMaterial;
  navigationGreen: THREE.MeshStandardMaterial;
  navigationWhite: THREE.MeshStandardMaterial;
  formation: THREE.MeshStandardMaterial;
  seam: THREE.LineBasicMaterial;
}

const F22_LENGTH_M = 18.9;
const F22_SPAN_M = 13.6;

/**
 * Texture-free F-22A display model based on public dimensions and visible
 * external geometry. It intentionally does not infer classified apertures,
 * coatings, internal bays, or signature details.
 */
export function createF22Visual(
  fighter: FighterProfile,
  lowDetail = false,
): F22Visual {
  const materials = createMaterials();
  const root = new THREE.Group();
  root.name = "fighter-f-22a-detailed";
  root.userData.fighterId = fighter.id;
  root.userData.modelVariant = "F-22A Raptor";
  root.userData.referenceDimensions = {
    lengthM: F22_LENGTH_M,
    wingspanM: F22_SPAN_M,
    heightM: 5.1,
  };

  const nozzles: THREE.Mesh[] = [];
  addFuselage(root, materials);
  addPlanform(root, materials, lowDetail);
  addEmpennage(root, materials, lowDetail);
  addCanopy(root, materials, lowDetail);
  addIntakes(root, materials, lowDetail);
  addVectoringNozzles(root, materials, lowDetail, nozzles);
  addLandingGear(root, materials, lowDetail);
  addExternalDetails(root, materials, lowDetail);

  root.scale.set(
    fighter.wingspanM / F22_SPAN_M,
    1,
    fighter.lengthM / F22_LENGTH_M,
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

function createMaterials(): F22Materials {
  return {
    body: standard(0x737a7a, 0.77, 0.18, true),
    bodyLight: standard(0x89908e, 0.75, 0.15, true),
    underside: standard(0x565f60, 0.85, 0.13, true),
    ram: standard(0x3d4546, 0.84, 0.18, true),
    canopy: new THREE.MeshPhysicalMaterial({
      color: 0xa87535,
      emissive: 0x2a1607,
      emissiveIntensity: 0.25,
      roughness: 0.16,
      metalness: 0.48,
      transmission: 0.05,
      transparent: true,
      opacity: 0.9,
      clearcoat: 0.82,
      clearcoatRoughness: 0.14,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
    canopyFrame: standard(0x252d2f, 0.69, 0.38, true),
    intake: standard(0x111719, 0.96, 0.04, true),
    nozzle: standard(0x5d5a54, 0.42, 0.76, true),
    nozzleInterior: new THREE.MeshStandardMaterial({
      color: 0x24211d,
      emissive: 0xc4652f,
      emissiveIntensity: 0.58,
      roughness: 0.5,
      metalness: 0.7,
      side: THREE.DoubleSide,
    }),
    tire: standard(0x151818, 0.98, 0.01, false),
    hub: standard(0x929995, 0.42, 0.68, true),
    navigationRed: emissive(0xd6534a),
    navigationGreen: emissive(0x55c986),
    navigationWhite: emissive(0xf1e8c9),
    formation: emissive(0xb8b77b, 0.54),
    seam: new THREE.LineBasicMaterial({
      color: 0x263033,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    }),
  };
}

function addFuselage(root: THREE.Group, materials: F22Materials): void {
  const sections: LoftSection[] = [
    { z: 9.45, halfWidth: 0.03, top: 1.47, shoulder: 1.44, bottom: 1.41 },
    { z: 8.75, halfWidth: 0.33, top: 1.75, shoulder: 1.56, bottom: 1.22 },
    { z: 7.55, halfWidth: 0.67, top: 2.06, shoulder: 1.67, bottom: 0.86 },
    { z: 6.15, halfWidth: 0.9, top: 2.37, shoulder: 1.72, bottom: 0.61 },
    { z: 4.45, halfWidth: 1.2, top: 2.64, shoulder: 1.68, bottom: 0.5 },
    { z: 2.3, halfWidth: 1.73, top: 2.68, shoulder: 1.58, bottom: 0.46 },
    { z: 0.0, halfWidth: 2.13, top: 2.56, shoulder: 1.5, bottom: 0.42 },
    { z: -2.5, halfWidth: 2.08, top: 2.43, shoulder: 1.46, bottom: 0.48 },
    { z: -4.8, halfWidth: 1.82, top: 2.25, shoulder: 1.43, bottom: 0.59 },
    { z: -6.75, halfWidth: 1.53, top: 2.06, shoulder: 1.39, bottom: 0.76 },
    { z: -8.45, halfWidth: 1.23, top: 1.79, shoulder: 1.34, bottom: 0.91 },
  ];
  const fuselage = new THREE.Mesh(loftGeometry(sections), materials.body);
  fuselage.name = "f22a-chined-fuselage";
  root.add(fuselage);

  const lowerCenter = prismMesh(
    [
      [0, 6.2],
      [0.7, 5.25],
      [1.58, 2.5],
      [1.85, -3.8],
      [1.27, -7.85],
      [-1.27, -7.85],
      [-1.85, -3.8],
      [-1.58, 2.5],
      [-0.7, 5.25],
    ],
    0.11,
    materials.underside,
  );
  lowerCenter.name = "f22a-lower-centerbody";
  lowerCenter.position.y = 0.47;
  root.add(lowerCenter);
}

function addPlanform(
  root: THREE.Group,
  materials: F22Materials,
  lowDetail: boolean,
): void {
  const wing = prismMesh(
    [
      [0, 2.05],
      [1.6, 1.35],
      [6.8, -2.25],
      [6.58, -3.58],
      [2.1, -5.25],
      [0.64, -4.52],
      [-0.64, -4.52],
      [-2.1, -5.25],
      [-6.58, -3.58],
      [-6.8, -2.25],
      [-1.6, 1.35],
    ],
    0.15,
    materials.body,
  );
  wing.name = "f22a-trapezoidal-main-wing";
  wing.position.y = 1.2;
  root.add(wing);

  const shoulder = prismMesh(
    [
      [0, 6.55],
      [0.76, 5.8],
      [1.2, 3.25],
      [2.12, 0.65],
      [2.45, -2.35],
      [1.95, -5.05],
      [0, -5.7],
      [-1.95, -5.05],
      [-2.45, -2.35],
      [-2.12, 0.65],
      [-1.2, 3.25],
      [-0.76, 5.8],
    ],
    0.14,
    materials.bodyLight,
  );
  shoulder.name = "f22a-blended-wing-shoulder";
  shoulder.position.y = 1.5;
  root.add(shoulder);

  for (const side of [-1, 1]) {
    const leadingEdge = prismMesh(
      mirrorPlanform(
        [
          [1.58, 1.4],
          [6.8, -2.25],
          [6.72, -2.43],
          [1.66, 1.18],
        ],
        side,
      ),
      0.024,
      materials.ram,
    );
    leadingEdge.name = "f22a-wing-leading-ram-edge";
    leadingEdge.position.y = 1.29;
    root.add(leadingEdge);

    const trailingEdge = prismMesh(
      mirrorPlanform(
        [
          [2.05, -4.98],
          [6.58, -3.42],
          [6.55, -3.65],
          [2.12, -5.3],
        ],
        side,
      ),
      0.024,
      materials.ram,
    );
    trailingEdge.name = "f22a-flaperon-ram-edge";
    trailingEdge.position.y = 1.28;
    root.add(trailingEdge);
  }

  if (!lowDetail) {
    const seams = lineSegments(
      [
        [-1.72, 1.34, -4.88],
        [-6.1, 1.34, -3.45],
        [1.72, 1.34, -4.88],
        [6.1, 1.34, -3.45],
        [-1.42, 1.72, 1.02],
        [-5.9, 1.34, -2.18],
        [1.42, 1.72, 1.02],
        [5.9, 1.34, -2.18],
      ],
      materials.seam,
    );
    seams.name = "f22a-wing-control-surface-seams";
    root.add(seams);
  }
}

function addEmpennage(
  root: THREE.Group,
  materials: F22Materials,
  lowDetail: boolean,
): void {
  const stabilators = prismMesh(
    [
      [0.86, -5.4],
      [2.0, -5.55],
      [4.64, -6.62],
      [4.42, -8.0],
      [1.62, -7.25],
      [0, -6.58],
      [-1.62, -7.25],
      [-4.42, -8],
      [-4.64, -6.62],
      [-2, -5.55],
      [-0.86, -5.4],
    ],
    0.12,
    materials.body,
  );
  stabilators.name = "f22a-all-moving-stabilators";
  stabilators.position.y = 1.37;
  root.add(stabilators);

  for (const side of [-1, 1]) {
    const tail = verticalSurfaceMesh(
      [
        [0, 0],
        [3.2, 0],
        [2.62, 3.24],
        [1.08, 3.68],
      ],
      0.14,
      materials.body,
    );
    tail.name = "f22a-canted-vertical-tail";
    tail.position.set(side * 1.38, 1.5, -5.45);
    tail.rotation.z = -side * THREE.MathUtils.degToRad(28);
    root.add(tail);

    const rudderSeam = lineSegments(
      [
        [side * 2.63, 4.18, -6.75],
        [side * 3.17, 1.61, -8.25],
      ],
      materials.seam,
    );
    rudderSeam.name = "f22a-rudder-seam";
    root.add(rudderSeam);

    if (!lowDetail) {
      const tailReceiver = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.52, 0.08),
        materials.ram,
      );
      tailReceiver.name = "f22a-tail-receiver-panel";
      tailReceiver.position.set(side * 2.58, 4.17, -6.77);
      tailReceiver.rotation.z = -side * THREE.MathUtils.degToRad(28);
      root.add(tailReceiver);
    }
  }
}

function addCanopy(
  root: THREE.Group,
  materials: F22Materials,
  lowDetail: boolean,
): void {
  const canopy = new THREE.Mesh(
    loftGeometry([
      { z: 6.35, halfWidth: 0.05, top: 2.15, shoulder: 2.1, bottom: 2.04 },
      { z: 5.65, halfWidth: 0.42, top: 2.72, shoulder: 2.42, bottom: 1.93 },
      { z: 4.45, halfWidth: 0.62, top: 3.12, shoulder: 2.64, bottom: 1.91 },
      { z: 3.15, halfWidth: 0.58, top: 3.01, shoulder: 2.5, bottom: 1.88 },
      { z: 2.45, halfWidth: 0.32, top: 2.42, shoulder: 2.18, bottom: 1.89 },
    ]),
    materials.canopy,
  );
  canopy.name = "f22a-gold-tinted-canopy";
  root.add(canopy);

  const sill = prismMesh(
    [
      [0, 6.48],
      [0.45, 5.9],
      [0.67, 4.38],
      [0.55, 2.65],
      [0.28, 2.25],
      [-0.28, 2.25],
      [-0.55, 2.65],
      [-0.67, 4.38],
      [-0.45, 5.9],
    ],
    0.06,
    materials.canopyFrame,
  );
  sill.name = "f22a-canopy-sill";
  sill.position.y = 1.91;
  root.add(sill);

  if (!lowDetail) {
    const aftFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.22, 0.065, 0.09),
      materials.canopyFrame,
    );
    aftFrame.name = "f22a-canopy-aft-frame";
    aftFrame.position.set(0, 2.67, 2.55);
    aftFrame.rotation.x = THREE.MathUtils.degToRad(-18);
    root.add(aftFrame);
  }
}

function addIntakes(
  root: THREE.Group,
  materials: F22Materials,
  lowDetail: boolean,
): void {
  for (const side of [-1, 1]) {
    const opening = quadMesh(
      [
        [side * 1.28, 1.85, 3.25],
        [side * 2.18, 1.7, 2.45],
        [side * 2.18, 0.84, -0.28],
        [side * 1.36, 0.98, 0.72],
      ],
      materials.intake,
    );
    opening.name = "f22a-trapezoidal-intake-opening";
    root.add(opening);

    const upperLip = quadMesh(
      [
        [side * 1.26, 1.9, 3.33],
        [side * 2.23, 1.74, 2.48],
        [side * 2.18, 1.62, 2.28],
        [side * 1.27, 1.78, 3.12],
      ],
      materials.ram,
    );
    upperLip.name = "f22a-intake-ram-lip";
    root.add(upperLip);

    if (!lowDetail) {
      const sidePanel = quadMesh(
        [
          [side * 0.48, 1.81, 7.0],
          [side * 0.66, 1.69, 6.56],
          [side * 0.5, 1.5, 6.7],
          [side * 0.37, 1.62, 7.12],
        ],
        materials.ram,
      );
      sidePanel.name = "f22a-forward-fuselage-panel";
      root.add(sidePanel);
    }
  }
}

function addVectoringNozzles(
  root: THREE.Group,
  materials: F22Materials,
  lowDetail: boolean,
  nozzles: THREE.Mesh[],
): void {
  for (const side of [-1, 1]) {
    const x = side * 1.02;
    const upper = quadMesh(
      [
        [x - 0.69, 1.9, -8.18],
        [x + 0.69, 1.9, -8.18],
        [x + 0.58, 1.73, -9.3],
        [x - 0.58, 1.73, -9.3],
      ],
      materials.nozzle,
    );
    upper.name = "f22a-vectoring-nozzle-upper-ramp";
    root.add(upper);

    const lower = quadMesh(
      [
        [x - 0.58, 0.91, -9.3],
        [x + 0.58, 0.91, -9.3],
        [x + 0.69, 0.7, -8.18],
        [x - 0.69, 0.7, -8.18],
      ],
      materials.nozzle,
    );
    lower.name = "f22a-vectoring-nozzle-lower-ramp";
    root.add(lower);

    const interior = new THREE.Mesh(
      new THREE.PlaneGeometry(1.13, 0.76),
      materials.nozzleInterior,
    );
    interior.name = "f22a-rectangular-nozzle-interior";
    interior.position.set(x, 1.31, -9.33);
    interior.rotation.y = Math.PI;
    root.add(interior);
    nozzles.push(interior);

    if (!lowDetail) {
      for (const offset of [-0.57, 0.57]) {
        const sideWall = quadMesh(
          [
            [x + offset, 0.91, -9.3],
            [x + offset, 1.73, -9.3],
            [x + offset * 1.18, 1.88, -8.18],
            [x + offset * 1.18, 0.73, -8.18],
          ],
          materials.nozzle,
        );
        sideWall.name = "f22a-vectoring-nozzle-sidewall";
        root.add(sideWall);
      }
    }
  }
}

function addLandingGear(
  root: THREE.Group,
  materials: F22Materials,
  lowDetail: boolean,
): void {
  if (lowDetail) return;
  const gear = new THREE.Group();
  gear.name = "f22a-landing-gear";
  const segments = 10;

  for (const side of [-1, 1]) {
    const attach = new THREE.Vector3(side * 1.62, 0.55, -1.55);
    const axle = new THREE.Vector3(side * 2.15, 0.23, -1.72);
    gear.add(cylinderBetween(attach, axle, 0.06, segments, materials.hub));
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.23, 0.085, 7, 12),
      materials.tire,
    );
    wheel.name = "f22a-main-wheel";
    wheel.rotation.y = Math.PI / 2;
    wheel.position.copy(axle);
    gear.add(wheel);
  }
  const noseAttach = new THREE.Vector3(0, 0.65, 4.8);
  const noseAxle = new THREE.Vector3(0, 0.2, 4.95);
  gear.add(
    cylinderBetween(noseAttach, noseAxle, 0.05, segments, materials.hub),
  );
  const noseWheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.065, 7, 12),
    materials.tire,
  );
  noseWheel.name = "f22a-nose-wheel";
  noseWheel.rotation.y = Math.PI / 2;
  noseWheel.position.copy(noseAxle);
  gear.add(noseWheel);
  root.add(gear);
}

function addExternalDetails(
  root: THREE.Group,
  materials: F22Materials,
  lowDetail: boolean,
): void {
  const noseBreak = lineSegments(
    [
      [-0.54, 1.79, 7.5],
      [-0.75, 1.66, 6.82],
      [0.54, 1.79, 7.5],
      [0.75, 1.66, 6.82],
    ],
    materials.seam,
  );
  noseBreak.name = "f22a-radome-break-lines";
  root.add(noseBreak);

  for (const side of [-1, 1]) {
    const navigation = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 5),
      side < 0 ? materials.navigationRed : materials.navigationGreen,
    );
    navigation.name = "f22a-navigation-light";
    navigation.position.set(side * 6.65, 1.31, -3.07);
    root.add(navigation);

    if (!lowDetail) {
      const formationStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 1.0),
        materials.formation,
      );
      formationStrip.name = "f22a-formation-light";
      formationStrip.position.set(side * 1.94, 1.66, -1.8);
      root.add(formationStrip);
    }
  }

  const tailLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 5),
    materials.navigationWhite,
  );
  tailLight.name = "f22a-tail-light";
  tailLight.position.set(0, 1.5, -9.2);
  root.add(tailLight);
}

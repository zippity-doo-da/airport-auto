import * as THREE from "three";
import type { FighterProfile } from "../fighterCatalog";
import {
  cylinderAlongZ,
  cylinderBetween,
  loftGeometry,
  prismMesh,
  standard,
  verticalSurfaceMesh,
  type LoftSection,
} from "./detailedModelUtils";
import {
  addFuselageStarMarking,
  addUsStarMarking,
  createFourBladePropeller,
  finishDetailedVisual,
  thickQuadMesh,
  type DetailedFighterVisual,
} from "./heritageModelUtils";

interface CorsairMaterials {
  seaBlue: THREE.MeshStandardMaterial;
  seaBlueLight: THREE.MeshStandardMaterial;
  underside: THREE.MeshStandardMaterial;
  canopy: THREE.MeshPhysicalMaterial;
  frame: THREE.MeshStandardMaterial;
  engine: THREE.MeshStandardMaterial;
  exhaust: THREE.MeshStandardMaterial;
  propeller: THREE.MeshStandardMaterial;
  propellerTip: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  insigniaBlue: THREE.MeshStandardMaterial;
  navigationRed: THREE.MeshStandardMaterial;
  navigationGreen: THREE.MeshStandardMaterial;
}

const F4U4_LENGTH_M = 10.26;
const F4U4_SPAN_M = 12.5;

/** Aircraft-specific airborne F4U-4 with its long cowl and inverted gull wing. */
export function createF4U4Visual(
  fighter: FighterProfile,
  lowDetail = false,
): DetailedFighterVisual {
  const materials = createMaterials();
  const root = new THREE.Group();
  root.name = "fighter-f4u-4-detailed";
  root.userData.fighterId = fighter.id;
  root.userData.modelVariant = "Vought F4U-4 Corsair";
  root.userData.referenceDimensions = {
    lengthM: F4U4_LENGTH_M,
    wingspanM: F4U4_SPAN_M,
    heightM: 4.5,
    propellerDiameterM: 4.04,
  };

  addFuselage(root, materials, lowDetail);
  addInvertedGullWing(root, materials, lowDetail);
  addEmpennage(root, materials);
  addCockpit(root, materials, lowDetail);
  addDetailsAndMarkings(root, materials, lowDetail);

  const propeller = createFourBladePropeller(
    1.94,
    materials.propeller,
    materials.propellerTip,
    materials.seaBlue,
    lowDetail,
  );
  propeller.position.set(0, 1.34, 4.95);
  root.add(propeller);

  root.scale.set(
    fighter.wingspanM / F4U4_SPAN_M,
    1,
    fighter.lengthM / F4U4_LENGTH_M,
  );
  return finishDetailedVisual(root, [propeller], [], lowDetail);
}

function createMaterials(): CorsairMaterials {
  return {
    seaBlue: standard(0x18364a, 0.53, 0.34, true),
    seaBlueLight: standard(0x274b5e, 0.57, 0.29, true),
    underside: standard(0x203e50, 0.62, 0.24, true),
    canopy: new THREE.MeshPhysicalMaterial({
      color: 0x5f838b,
      roughness: 0.13,
      metalness: 0.18,
      transmission: 0.12,
      transparent: true,
      opacity: 0.82,
      clearcoat: 0.72,
      side: THREE.DoubleSide,
    }),
    frame: standard(0x102631, 0.58, 0.34, true),
    engine: standard(0x111719, 0.96, 0.18, true),
    exhaust: standard(0x6d5a48, 0.58, 0.68, true),
    propeller: standard(0x22282a, 0.68, 0.32, true),
    propellerTip: standard(0xe0bd50, 0.66, 0.18, true),
    white: standard(0xe8e5d5, 0.72, 0.08, true),
    insigniaBlue: standard(0x173654, 0.7, 0.23, true),
    navigationRed: standard(0xb84f45, 0.38, 0.18, true),
    navigationGreen: standard(0x4d9c6a, 0.38, 0.18, true),
  };
}

function addFuselage(
  root: THREE.Group,
  materials: CorsairMaterials,
  lowDetail: boolean,
): void {
  const sections: LoftSection[] = [
    { z: 4.72, halfWidth: 0.82, top: 2.17, shoulder: 1.37, bottom: 0.48 },
    { z: 3.1, halfWidth: 0.9, top: 2.22, shoulder: 1.38, bottom: 0.42 },
    { z: 2.35, halfWidth: 0.73, top: 2.04, shoulder: 1.34, bottom: 0.48 },
    { z: 0.9, halfWidth: 0.62, top: 1.91, shoulder: 1.3, bottom: 0.53 },
    { z: -0.6, halfWidth: 0.66, top: 1.92, shoulder: 1.31, bottom: 0.56 },
    { z: -2.0, halfWidth: 0.59, top: 1.82, shoulder: 1.28, bottom: 0.6 },
    { z: -3.45, halfWidth: 0.43, top: 1.62, shoulder: 1.24, bottom: 0.72 },
    { z: -4.55, halfWidth: 0.2, top: 1.46, shoulder: 1.2, bottom: 0.96 },
    { z: -5.02, halfWidth: 0.06, top: 1.3, shoulder: 1.25, bottom: 1.18 },
  ];
  const body = new THREE.Mesh(loftGeometry(sections), materials.seaBlue);
  body.name = "f4u4-long-fuselage";
  root.add(body);

  const engineFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.73, lowDetail ? 14 : 28),
    materials.engine,
  );
  engineFace.name = "f4u4-radial-engine-face";
  engineFace.position.set(0, 1.34, 4.735);
  root.add(engineFace);

  const cowlLip = new THREE.Mesh(
    new THREE.TorusGeometry(
      0.79,
      0.105,
      lowDetail ? 5 : 8,
      lowDetail ? 16 : 30,
    ),
    materials.seaBlueLight,
  );
  cowlLip.name = "f4u4-cowling-lip";
  cowlLip.position.set(0, 1.34, 4.76);
  root.add(cowlLip);

  if (!lowDetail) {
    for (let index = 0; index < 9; index += 1) {
      const angle = (index / 9) * Math.PI * 2;
      const cylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.18, 6),
        materials.exhaust,
      );
      cylinder.name = "f4u4-engine-cylinder";
      cylinder.rotation.x = Math.PI / 2;
      cylinder.position.set(
        Math.cos(angle) * 0.5,
        1.34 + Math.sin(angle) * 0.5,
        4.76,
      );
      root.add(cylinder);
    }
  }
}

function addInvertedGullWing(
  root: THREE.Group,
  materials: CorsairMaterials,
  lowDetail: boolean,
): void {
  for (const side of [-1, 1] as const) {
    const inner = thickQuadMesh(
      [
        new THREE.Vector3(side * 0.58, 1.08, 1.18),
        new THREE.Vector3(side * 2.38, 0.24, 0.82),
        new THREE.Vector3(side * 2.38, 0.24, -0.92),
        new THREE.Vector3(side * 0.68, 1.08, -1.18),
      ],
      0.16,
      materials.seaBlue,
    );
    inner.name = "f4u4-inner-gull-wing";
    root.add(inner);

    const outer = thickQuadMesh(
      [
        new THREE.Vector3(side * 2.38, 0.24, 0.82),
        new THREE.Vector3(side * 6.25, 1.03, -0.02),
        new THREE.Vector3(side * 6.05, 1.03, -1.52),
        new THREE.Vector3(side * 2.38, 0.24, -0.92),
      ],
      0.13,
      materials.seaBlue,
    );
    outer.name = "f4u4-outer-gull-wing";
    root.add(outer);

    const flap = thickQuadMesh(
      [
        new THREE.Vector3(side * 2.48, 0.29, -0.94),
        new THREE.Vector3(side * 5.62, 0.95, -1.48),
        new THREE.Vector3(side * 5.45, 0.95, -1.77),
        new THREE.Vector3(side * 2.42, 0.29, -1.2),
      ],
      0.045,
      materials.seaBlueLight,
    );
    flap.name = "f4u4-flap-aileron";
    root.add(flap);

    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 8, 5),
      side < 0 ? materials.navigationRed : materials.navigationGreen,
    );
    light.name = side < 0 ? "f4u4-port-light" : "f4u4-starboard-light";
    light.position.set(side * 6.17, 1.05, -0.4);
    root.add(light);

    if (!lowDetail) {
      for (let gun = 0; gun < 3; gun += 1) {
        const x = side * (3.25 + gun * 0.43);
        const joint = (Math.abs(x) - 2.38) / (6.25 - 2.38);
        const y = THREE.MathUtils.lerp(0.34, 1.03, joint);
        const z = THREE.MathUtils.lerp(0.72, -0.02, joint);
        const port = cylinderAlongZ(0.045, 0.045, 0.2, 7, materials.engine);
        port.name = "f4u4-wing-gun-port";
        port.position.set(x, y, z + 0.04);
        root.add(port);
      }
    }
  }
}

function addEmpennage(root: THREE.Group, materials: CorsairMaterials): void {
  const stabilizer = prismMesh(
    [
      [0, -3.63],
      [2.18, -4.05],
      [2.02, -4.74],
      [0, -4.46],
      [-2.02, -4.74],
      [-2.18, -4.05],
    ],
    0.12,
    materials.seaBlue,
  );
  stabilizer.name = "f4u4-horizontal-tail";
  stabilizer.position.y = 1.28;
  root.add(stabilizer);

  const fin = verticalSurfaceMesh(
    [
      [0.28, 0],
      [-1.42, 0],
      [-1.03, 1.85],
      [-0.34, 2.18],
    ],
    0.12,
    materials.seaBlue,
  );
  fin.name = "f4u4-vertical-tail";
  fin.position.set(0, 1.25, -3.65);
  root.add(fin);
}

function addCockpit(
  root: THREE.Group,
  materials: CorsairMaterials,
  lowDetail: boolean,
): void {
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, lowDetail ? 10 : 18, lowDetail ? 6 : 10),
    materials.canopy,
  );
  canopy.name = "f4u4-raised-canopy";
  canopy.scale.set(0.59, 0.49, 1.05);
  canopy.position.set(0, 2.02, -0.92);
  root.add(canopy);

  const sill = prismMesh(
    [
      [-0.62, 0.04],
      [-0.48, -1.73],
      [0.48, -1.73],
      [0.62, 0.04],
    ],
    0.08,
    materials.frame,
  );
  sill.name = "f4u4-canopy-sill";
  sill.position.set(0, 1.79, -0.18);
  root.add(sill);

  const mast = cylinderBetween(
    new THREE.Vector3(0, 1.82, -1.98),
    new THREE.Vector3(0, 2.72, -2.12),
    0.035,
    6,
    materials.frame,
    "f4u4-antenna-mast",
  );
  root.add(mast);
}

function addDetailsAndMarkings(
  root: THREE.Group,
  materials: CorsairMaterials,
  lowDetail: boolean,
): void {
  addUsStarMarking(
    root,
    -4.25,
    1.02,
    -0.64,
    0.55,
    materials.insigniaBlue,
    materials.white,
  );

  for (const side of [-1, 1] as const) {
    addFuselageStarMarking(
      root,
      side,
      0.64,
      1.38,
      -2.35,
      0.42,
      materials.insigniaBlue,
      materials.white,
    );
  }

  const chinIntake = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.23, 0.48),
    materials.engine,
  );
  chinIntake.name = "f4u4-chin-intake";
  chinIntake.position.set(0, 0.43, 3.9);
  chinIntake.rotation.x = -0.08;
  root.add(chinIntake);

  if (!lowDetail) {
    for (const side of [-1, 1] as const) {
      for (let exhaustIndex = 0; exhaustIndex < 3; exhaustIndex += 1) {
        const start = new THREE.Vector3(
          side * 0.79,
          1.06 + exhaustIndex * 0.16,
          2.82 - exhaustIndex * 0.05,
        );
        const end = new THREE.Vector3(
          side * 0.96,
          start.y - 0.02,
          start.z - 0.2,
        );
        root.add(
          cylinderBetween(
            start,
            end,
            0.04,
            6,
            materials.exhaust,
            "f4u4-exhaust-stack",
          ),
        );
      }
    }
  }
}

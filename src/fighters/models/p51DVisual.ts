import * as THREE from "three";
import type { FighterProfile } from "../fighterCatalog";
import {
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
  type DetailedFighterVisual,
} from "./heritageModelUtils";

interface MustangMaterials {
  aluminum: THREE.MeshStandardMaterial;
  aluminumDark: THREE.MeshStandardMaterial;
  olive: THREE.MeshStandardMaterial;
  canopy: THREE.MeshPhysicalMaterial;
  frame: THREE.MeshStandardMaterial;
  intake: THREE.MeshStandardMaterial;
  exhaust: THREE.MeshStandardMaterial;
  propeller: THREE.MeshStandardMaterial;
  yellow: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  insigniaBlue: THREE.MeshStandardMaterial;
}

const P51D_LENGTH_M = 9.83;
const P51D_SPAN_M = 11.28;

/** Aircraft-specific P-51D with laminar wing, bubble canopy and belly scoop. */
export function createP51DVisual(
  fighter: FighterProfile,
  lowDetail = false,
): DetailedFighterVisual {
  const materials = createMaterials();
  const root = new THREE.Group();
  root.name = "fighter-p-51d-detailed";
  root.userData.fighterId = fighter.id;
  root.userData.modelVariant = "North American P-51D Mustang";
  root.userData.referenceDimensions = {
    lengthM: P51D_LENGTH_M,
    wingspanM: P51D_SPAN_M,
    heightM: 4.17,
    propellerDiameterM: 3.4,
  };

  addFuselage(root, materials);
  addWing(root, materials, lowDetail);
  addEmpennage(root, materials);
  addCockpitAndRadiator(root, materials, lowDetail);
  addDetailsAndMarkings(root, materials, lowDetail);

  const propeller = createFourBladePropeller(
    1.65,
    materials.propeller,
    materials.yellow,
    materials.red,
    lowDetail,
  );
  propeller.position.set(0, 1.25, 4.76);
  root.add(propeller);

  root.scale.set(
    fighter.wingspanM / P51D_SPAN_M,
    1,
    fighter.lengthM / P51D_LENGTH_M,
  );
  return finishDetailedVisual(root, [propeller], [], lowDetail);
}

function createMaterials(): MustangMaterials {
  return {
    aluminum: standard(0xb7b9b3, 0.34, 0.78, true),
    aluminumDark: standard(0x8d928f, 0.39, 0.74, true),
    olive: standard(0x4e553d, 0.74, 0.18, true),
    canopy: new THREE.MeshPhysicalMaterial({
      color: 0x58757d,
      roughness: 0.1,
      metalness: 0.16,
      transmission: 0.17,
      transparent: true,
      opacity: 0.79,
      clearcoat: 0.8,
      side: THREE.DoubleSide,
    }),
    frame: standard(0x343b38, 0.54, 0.52, true),
    intake: standard(0x181d1e, 0.94, 0.12, true),
    exhaust: standard(0x5f4c3e, 0.57, 0.7, true),
    propeller: standard(0x202527, 0.66, 0.34, true),
    yellow: standard(0xe1bd54, 0.68, 0.14, true),
    red: standard(0xa74339, 0.62, 0.26, true),
    white: standard(0xe9e5d5, 0.72, 0.08, true),
    insigniaBlue: standard(0x29476b, 0.7, 0.22, true),
  };
}

function addFuselage(root: THREE.Group, materials: MustangMaterials): void {
  const sections: LoftSection[] = [
    { z: 4.72, halfWidth: 0.14, top: 1.42, shoulder: 1.27, bottom: 1.04 },
    { z: 4.32, halfWidth: 0.48, top: 1.7, shoulder: 1.3, bottom: 0.75 },
    { z: 3.1, halfWidth: 0.56, top: 1.76, shoulder: 1.29, bottom: 0.67 },
    { z: 1.7, halfWidth: 0.61, top: 1.71, shoulder: 1.27, bottom: 0.62 },
    { z: 0.15, halfWidth: 0.66, top: 1.76, shoulder: 1.3, bottom: 0.59 },
    { z: -1.35, halfWidth: 0.58, top: 1.75, shoulder: 1.29, bottom: 0.6 },
    { z: -2.75, halfWidth: 0.45, top: 1.58, shoulder: 1.2, bottom: 0.69 },
    { z: -4.1, halfWidth: 0.24, top: 1.4, shoulder: 1.17, bottom: 0.93 },
    { z: -4.86, halfWidth: 0.06, top: 1.24, shoulder: 1.2, bottom: 1.15 },
  ];
  const body = new THREE.Mesh(loftGeometry(sections), materials.aluminum);
  body.name = "p51d-streamlined-fuselage";
  root.add(body);

  const antiGlare = prismMesh(
    [
      [-0.39, 4.18],
      [0.39, 4.18],
      [0.5, 0.62],
      [-0.5, 0.62],
    ],
    0.035,
    materials.olive,
  );
  antiGlare.name = "p51d-anti-glare-panel";
  antiGlare.position.y = 1.74;
  root.add(antiGlare);

  const spinner = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 0.73, 16),
    materials.red,
  );
  spinner.name = "p51d-spinner";
  spinner.rotation.x = Math.PI / 2;
  spinner.position.set(0, 1.25, 4.63);
  root.add(spinner);
}

function addWing(
  root: THREE.Group,
  materials: MustangMaterials,
  lowDetail: boolean,
): void {
  const wing = prismMesh(
    [
      [0, 1.48],
      [1.08, 1.25],
      [5.64, 0.28],
      [5.5, -0.91],
      [1.0, -1.35],
      [0, -1.2],
      [-1.0, -1.35],
      [-5.5, -0.91],
      [-5.64, 0.28],
      [-1.08, 1.25],
    ],
    0.14,
    materials.aluminum,
  );
  wing.name = "p51d-laminar-flow-wing";
  wing.position.y = 0.96;
  root.add(wing);

  const flap = prismMesh(
    [
      [0.72, -0.92],
      [4.45, -0.84],
      [4.34, -1.12],
      [0.74, -1.25],
      [-0.74, -1.25],
      [-4.34, -1.12],
      [-4.45, -0.84],
      [-0.72, -0.92],
    ],
    0.035,
    materials.aluminumDark,
  );
  flap.name = "p51d-flap-aileron-line";
  flap.position.y = 1.045;
  root.add(flap);

  if (!lowDetail) {
    for (const side of [-1, 1] as const) {
      for (let gun = 0; gun < 3; gun += 1) {
        const port = new THREE.Mesh(
          new THREE.CylinderGeometry(0.034, 0.034, 0.18, 7),
          materials.intake,
        );
        port.name = "p51d-wing-gun-port";
        port.rotation.x = Math.PI / 2;
        port.position.set(side * (2.65 + gun * 0.34), 1.0, 0.82 - gun * 0.07);
        root.add(port);
      }
    }
  }
}

function addEmpennage(root: THREE.Group, materials: MustangMaterials): void {
  const stabilizer = prismMesh(
    [
      [0, -3.62],
      [2.18, -4.03],
      [2.01, -4.65],
      [0, -4.39],
      [-2.01, -4.65],
      [-2.18, -4.03],
    ],
    0.1,
    materials.aluminum,
  );
  stabilizer.name = "p51d-horizontal-tail";
  stabilizer.position.y = 1.22;
  root.add(stabilizer);

  const fin = verticalSurfaceMesh(
    [
      [0.28, 0],
      [-1.42, 0],
      [-1.02, 1.77],
      [-0.18, 2.2],
    ],
    0.11,
    materials.red,
  );
  fin.name = "p51d-red-tail-fin";
  fin.position.set(0, 1.22, -3.42);
  root.add(fin);

  const finFillet = verticalSurfaceMesh(
    [
      [0, 0],
      [-1.18, 0],
      [-0.8, 0.54],
    ],
    0.085,
    materials.red,
  );
  finFillet.name = "p51d-dorsal-fin-fillet";
  finFillet.position.set(0, 1.38, -2.42);
  root.add(finFillet);
}

function addCockpitAndRadiator(
  root: THREE.Group,
  materials: MustangMaterials,
  lowDetail: boolean,
): void {
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, lowDetail ? 10 : 18, lowDetail ? 6 : 10),
    materials.canopy,
  );
  canopy.name = "p51d-bubble-canopy";
  canopy.scale.set(0.53, 0.48, 0.95);
  canopy.position.set(0, 2.02, -0.28);
  root.add(canopy);

  const canopyFrame = prismMesh(
    [
      [-0.52, 0.66],
      [0.52, 0.66],
      [0.46, -1.08],
      [-0.46, -1.08],
    ],
    0.055,
    materials.frame,
  );
  canopyFrame.name = "p51d-canopy-sill";
  canopyFrame.position.set(0, 1.75, 0.25);
  root.add(canopyFrame);

  const scoopBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.48, 1.72),
    materials.aluminumDark,
  );
  scoopBody.name = "p51d-ventral-radiator-scoop";
  scoopBody.position.set(0, 0.38, -1.4);
  scoopBody.rotation.x = -0.08;
  root.add(scoopBody);

  const scoopOpening = new THREE.Mesh(
    new THREE.BoxGeometry(0.57, 0.28, 0.04),
    materials.intake,
  );
  scoopOpening.name = "p51d-radiator-opening";
  scoopOpening.position.set(0, 0.42, -0.52);
  root.add(scoopOpening);
}

function addDetailsAndMarkings(
  root: THREE.Group,
  materials: MustangMaterials,
  lowDetail: boolean,
): void {
  addUsStarMarking(
    root,
    -3.72,
    1.05,
    -0.28,
    0.5,
    materials.insigniaBlue,
    materials.white,
  );
  for (const side of [-1, 1] as const) {
    addFuselageStarMarking(
      root,
      side,
      0.64,
      1.3,
      -2.25,
      0.4,
      materials.insigniaBlue,
      materials.white,
    );
    if (!lowDetail) {
      for (let exhaustIndex = 0; exhaustIndex < 6; exhaustIndex += 1) {
        const start = new THREE.Vector3(
          side * 0.52,
          1.43,
          3.55 - exhaustIndex * 0.25,
        );
        const end = new THREE.Vector3(side * 0.68, 1.41, start.z - 0.16);
        root.add(
          cylinderBetween(
            start,
            end,
            0.035,
            6,
            materials.exhaust,
            "p51d-merlin-exhaust-stack",
          ),
        );
      }
    }
  }
}

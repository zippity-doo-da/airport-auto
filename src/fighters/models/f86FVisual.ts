import * as THREE from "three";
import type { FighterProfile } from "../fighterCatalog";
import {
  cylinderAlongZ,
  loftGeometry,
  prismMesh,
  standard,
  verticalSurfaceMesh,
  type LoftSection,
} from "./detailedModelUtils";
import {
  addFuselageStarMarking,
  addUsStarMarking,
  finishDetailedVisual,
  type DetailedFighterVisual,
} from "./heritageModelUtils";

interface SabreMaterials {
  aluminum: THREE.MeshStandardMaterial;
  aluminumDark: THREE.MeshStandardMaterial;
  intake: THREE.MeshStandardMaterial;
  canopy: THREE.MeshPhysicalMaterial;
  frame: THREE.MeshStandardMaterial;
  exhaust: THREE.MeshStandardMaterial;
  exhaustGlow: THREE.MeshStandardMaterial;
  yellow: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  insigniaBlue: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
}

const F86F_LENGTH_M = 11.43;
const F86F_SPAN_M = 11.31;

/** Aircraft-specific day-fighter Sabre with a nose intake and 35° swept wing. */
export function createF86FVisual(
  fighter: FighterProfile,
  lowDetail = false,
): DetailedFighterVisual {
  const materials = createMaterials();
  const root = new THREE.Group();
  root.name = "fighter-f-86f-detailed";
  root.userData.fighterId = fighter.id;
  root.userData.modelVariant = "North American F-86F Sabre";
  root.userData.referenceDimensions = {
    lengthM: F86F_LENGTH_M,
    wingspanM: F86F_SPAN_M,
    heightM: 4.47,
    wingSweepDeg: 35,
  };

  addFuselage(root, materials, lowDetail);
  addSweptWing(root, materials, lowDetail);
  addEmpennage(root, materials);
  addCockpit(root, materials, lowDetail);
  addDetailsAndMarkings(root, materials, lowDetail);
  const nozzle = addJetExhaust(root, materials, lowDetail);

  root.scale.set(
    fighter.wingspanM / F86F_SPAN_M,
    1,
    fighter.lengthM / F86F_LENGTH_M,
  );
  return finishDetailedVisual(root, [], [nozzle], lowDetail);
}

function createMaterials(): SabreMaterials {
  return {
    aluminum: standard(0xb8bbb8, 0.3, 0.82, true),
    aluminumDark: standard(0x8e9493, 0.36, 0.76, true),
    intake: standard(0x151b1d, 0.94, 0.1, true),
    canopy: new THREE.MeshPhysicalMaterial({
      color: 0x58767d,
      roughness: 0.11,
      metalness: 0.17,
      transmission: 0.16,
      transparent: true,
      opacity: 0.8,
      clearcoat: 0.82,
      side: THREE.DoubleSide,
    }),
    frame: standard(0x2f3737, 0.52, 0.52, true),
    exhaust: standard(0x3e4646, 0.43, 0.8, true),
    exhaustGlow: new THREE.MeshStandardMaterial({
      color: 0x4a5960,
      emissive: 0x8b5e3d,
      emissiveIntensity: 0.38,
      roughness: 0.48,
      metalness: 0.56,
      side: THREE.DoubleSide,
    }),
    yellow: standard(0xe1b94e, 0.65, 0.17, true),
    black: standard(0x24292a, 0.72, 0.28, true),
    white: standard(0xe9e6d8, 0.72, 0.08, true),
    insigniaBlue: standard(0x29496d, 0.7, 0.22, true),
    red: standard(0xb5483f, 0.62, 0.24, true),
  };
}

function addFuselage(
  root: THREE.Group,
  materials: SabreMaterials,
  lowDetail: boolean,
): void {
  const sections: LoftSection[] = [
    { z: 5.62, halfWidth: 0.56, top: 1.75, shoulder: 1.26, bottom: 0.72 },
    { z: 5.08, halfWidth: 0.68, top: 1.92, shoulder: 1.28, bottom: 0.61 },
    { z: 3.8, halfWidth: 0.73, top: 2.0, shoulder: 1.3, bottom: 0.56 },
    { z: 2.2, halfWidth: 0.8, top: 2.08, shoulder: 1.32, bottom: 0.51 },
    { z: 0.2, halfWidth: 0.86, top: 2.08, shoulder: 1.32, bottom: 0.5 },
    { z: -1.9, halfWidth: 0.8, top: 1.96, shoulder: 1.29, bottom: 0.54 },
    { z: -3.65, halfWidth: 0.62, top: 1.75, shoulder: 1.21, bottom: 0.67 },
    { z: -5.05, halfWidth: 0.39, top: 1.49, shoulder: 1.14, bottom: 0.83 },
    { z: -5.63, halfWidth: 0.28, top: 1.33, shoulder: 1.13, bottom: 0.93 },
  ];
  const body = new THREE.Mesh(loftGeometry(sections), materials.aluminum);
  body.name = "f86f-round-fuselage";
  root.add(body);

  const intake = new THREE.Mesh(
    new THREE.CircleGeometry(0.52, lowDetail ? 16 : 28),
    materials.intake,
  );
  intake.name = "f86f-nose-intake";
  intake.position.set(0, 1.24, 5.635);
  root.add(intake);

  const intakeLip = new THREE.Mesh(
    new THREE.TorusGeometry(
      0.56,
      0.075,
      lowDetail ? 5 : 8,
      lowDetail ? 16 : 30,
    ),
    materials.aluminumDark,
  );
  intakeLip.name = "f86f-intake-lip";
  intakeLip.position.set(0, 1.24, 5.65);
  root.add(intakeLip);

  const noseBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.685, 0.105, 6, lowDetail ? 18 : 32),
    materials.yellow,
  );
  noseBand.name = "f86f-recognition-band";
  noseBand.position.set(0, 1.28, 4.96);
  root.add(noseBand);
}

function addSweptWing(
  root: THREE.Group,
  materials: SabreMaterials,
  lowDetail: boolean,
): void {
  const wing = prismMesh(
    [
      [0, 1.92],
      [1.02, 1.72],
      [5.655, -0.9],
      [5.43, -2.12],
      [1.0, -1.42],
      [0, -1.15],
      [-1.0, -1.42],
      [-5.43, -2.12],
      [-5.655, -0.9],
      [-1.02, 1.72],
    ],
    0.13,
    materials.aluminum,
  );
  wing.name = "f86f-35-degree-swept-wing";
  wing.position.y = 1.0;
  root.add(wing);

  const ailerons = prismMesh(
    [
      [2.55, -1.45],
      [5.26, -2.04],
      [5.12, -2.27],
      [2.48, -1.72],
      [-2.48, -1.72],
      [-5.12, -2.27],
      [-5.26, -2.04],
      [-2.55, -1.45],
    ],
    0.035,
    materials.aluminumDark,
  );
  ailerons.name = "f86f-aileron-panels";
  ailerons.position.y = 1.075;
  root.add(ailerons);

  if (!lowDetail) {
    for (const side of [-1, 1] as const) {
      const fence = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.25, 1.32),
        materials.aluminumDark,
      );
      fence.name = "f86f-wing-fence";
      fence.position.set(side * 3.45, 1.18, -0.72);
      fence.rotation.y = side * -0.1;
      root.add(fence);
    }
  }
}

function addEmpennage(root: THREE.Group, materials: SabreMaterials): void {
  const stabilizer = prismMesh(
    [
      [0, -3.5],
      [2.35, -4.55],
      [2.17, -5.15],
      [0, -4.41],
      [-2.17, -5.15],
      [-2.35, -4.55],
    ],
    0.09,
    materials.aluminum,
  );
  stabilizer.name = "f86f-swept-horizontal-tail";
  stabilizer.position.y = 1.52;
  root.add(stabilizer);

  const fin = verticalSurfaceMesh(
    [
      [0.12, 0],
      [-2.02, 0],
      [-1.22, 2.62],
      [-0.28, 2.86],
    ],
    0.11,
    materials.aluminum,
  );
  fin.name = "f86f-swept-vertical-tail";
  fin.position.set(0, 1.28, -3.32);
  root.add(fin);

  const rudderTip = verticalSurfaceMesh(
    [
      [-1.2, 1.82],
      [-1.85, 1.67],
      [-1.22, 2.55],
      [-0.55, 2.7],
    ],
    0.115,
    materials.yellow,
  );
  rudderTip.name = "f86f-yellow-tail-band";
  rudderTip.position.set(0, 1.31, -3.35);
  root.add(rudderTip);
}

function addCockpit(
  root: THREE.Group,
  materials: SabreMaterials,
  lowDetail: boolean,
): void {
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, lowDetail ? 10 : 18, lowDetail ? 6 : 10),
    materials.canopy,
  );
  canopy.name = "f86f-bubble-canopy";
  canopy.scale.set(0.58, 0.53, 1.35);
  canopy.position.set(0, 2.26, 1.12);
  root.add(canopy);

  const sill = prismMesh(
    [
      [-0.58, 1.58],
      [0.58, 1.58],
      [0.52, -1.04],
      [-0.52, -1.04],
    ],
    0.06,
    materials.frame,
  );
  sill.name = "f86f-canopy-frame";
  sill.position.set(0, 1.97, 0.5);
  root.add(sill);
}

function addJetExhaust(
  root: THREE.Group,
  materials: SabreMaterials,
  lowDetail: boolean,
): THREE.Mesh {
  const tailpipe = cylinderAlongZ(
    0.35,
    0.44,
    0.72,
    lowDetail ? 10 : 18,
    materials.exhaust,
    true,
  );
  tailpipe.name = "f86f-tailpipe";
  tailpipe.position.set(0, 1.14, -5.35);
  root.add(tailpipe);

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, lowDetail ? 12 : 22),
    materials.exhaustGlow,
  );
  glow.name = "f86f-engine-glow";
  glow.rotation.y = Math.PI;
  glow.position.set(0, 1.14, -5.72);
  root.add(glow);
  return glow;
}

function addDetailsAndMarkings(
  root: THREE.Group,
  materials: SabreMaterials,
  lowDetail: boolean,
): void {
  addUsStarMarking(
    root,
    -3.72,
    1.08,
    -1.22,
    0.48,
    materials.insigniaBlue,
    materials.white,
  );
  for (const side of [-1, 1] as const) {
    addFuselageStarMarking(
      root,
      side,
      0.78,
      1.35,
      -2.2,
      0.4,
      materials.insigniaBlue,
      materials.white,
    );
    if (!lowDetail) {
      for (let gun = 0; gun < 3; gun += 1) {
        const port = new THREE.Mesh(
          new THREE.CircleGeometry(0.045, 8),
          materials.black,
        );
        port.name = "f86f-fifty-cal-port";
        port.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        port.position.set(side * 0.685, 1.34 + gun * 0.14, 3.88 - gun * 0.18);
        root.add(port);
      }

      const speedBrake = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.65, 1.05),
        materials.aluminumDark,
      );
      speedBrake.name = "f86f-speed-brake-panel";
      speedBrake.position.set(side * 0.805, 1.22, -2.45);
      speedBrake.rotation.x = 0.13;
      root.add(speedBrake);
    }
  }

  const tailLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 5),
    materials.red,
  );
  tailLight.name = "f86f-tail-light";
  tailLight.position.set(0, 1.29, -5.63);
  root.add(tailLight);
}

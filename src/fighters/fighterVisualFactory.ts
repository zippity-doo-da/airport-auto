import * as THREE from "three";
import type { FighterProfile, WingPlanform } from "./fighterCatalog";
import { createF35AVisual } from "./models/f35AVisual";
import { createF22Visual } from "./models/f22Visual";
import { createF4U4Visual } from "./models/f4u4Visual";
import { createF86FVisual } from "./models/f86FVisual";
import { createJ20Visual } from "./models/j20Visual";
import { createMig35Visual } from "./models/mig35Visual";
import { createP51DVisual } from "./models/p51DVisual";
import { addGenericJetDetailKit } from "./models/genericJetDetailKit";
import { collectRenderStats } from "./models/detailedModelUtils";

export interface FighterVisual {
  root: THREE.Group;
  propellers: THREE.Group[];
  nozzles: THREE.Mesh[];
  dispose: () => void;
}

interface Palette {
  paint: number;
  underside: number;
  accent: number;
  marking: number;
  canopy: number;
}

interface Materials {
  paint: THREE.MeshStandardMaterial;
  underside: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  marking: THREE.MeshStandardMaterial;
  canopy: THREE.MeshPhysicalMaterial;
  dark: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  intake: THREE.MeshStandardMaterial;
}

const COUNTRY_PALETTES: Record<string, Palette> = {
  "United States": palette(0xaeb4aa, 0xc5c8be, 0xb84f45, 0x344e68),
  "United Kingdom": palette(0x6f7b62, 0xb6b39a, 0x9e4f42, 0x345f78),
  Germany: palette(0x778078, 0xaeb0a2, 0xc6ad67, 0x39434a),
  "Soviet Union": palette(0x8f9b94, 0xb8c0b8, 0xc34f43, 0xd3c276),
  Russia: palette(0x829aa3, 0xb3bdc1, 0x466a88, 0xc8d5d7),
  Japan: palette(0x9e9b7d, 0xbcb79e, 0xa94d47, 0xe3ddc5),
  Italy: palette(0x928b6f, 0xc1bca5, 0x5d7458, 0xb9874f),
  France: palette(0x7d8b91, 0xbcc2c0, 0x486b8b, 0xc7a35a),
  Sweden: palette(0x6e7867, 0x9fa897, 0x3f6f87, 0xc4ab59),
  China: palette(0x9ea99f, 0xc2c7c0, 0xbf4d43, 0xd2bd6b),
  India: palette(0x9b9f98, 0xc3c4bc, 0xd48b4c, 0x55775c),
  Israel: palette(0xb8aa8d, 0xd0cab9, 0x4d7690, 0xd7d0b7),
  Australia: palette(0x6f806e, 0xb5b69c, 0x4b6e8a, 0xc8b366),
  Canada: palette(0xa9ada8, 0xc9cac3, 0xba5148, 0xd8d1bd),
  Poland: palette(0x8b958d, 0xc3c4bb, 0xb7544e, 0xe2ded1),
  Romania: palette(0x7e876b, 0xb4b398, 0xc7ac52, 0x55768e),
  Finland: palette(0x78857a, 0xb9beb6, 0x4a6683, 0xd8d4c5),
  "South Korea": palette(0x9da8ad, 0xc4c9c9, 0x476c8b, 0xb94b49),
  Turkey: palette(0x8f9a96, 0xc2c6c1, 0xb95049, 0xe0d8c9),
  Iran: palette(0x8f947c, 0xb9b99f, 0x547459, 0xb85d4e),
};

const DEFAULT_PALETTE = palette(0x89938a, 0xb9bcb0, 0xb0734c, 0x4d6875);
const SPECIAL_PALETTES: Record<string, Palette> = {
  "f-117": palette(0x303637, 0x3d4545, 0x7f8985, 0x252b2d),
};

export function createFighterVisual(
  fighter: FighterProfile,
  lowDetail = false,
): FighterVisual {
  if (fighter.id === "f-35") {
    return createF35AVisual(fighter, lowDetail);
  }
  if (fighter.id === "j-20") {
    return createJ20Visual(fighter, lowDetail);
  }
  if (fighter.id === "f-22") {
    return createF22Visual(fighter, lowDetail);
  }
  if (fighter.id === "mig-35") {
    return createMig35Visual(fighter, lowDetail);
  }
  if (fighter.id === "f4u") {
    return createF4U4Visual(fighter, lowDetail);
  }
  if (fighter.id === "p-51") {
    return createP51DVisual(fighter, lowDetail);
  }
  if (fighter.id === "f-86") {
    return createF86FVisual(fighter, lowDetail);
  }

  const paletteForNation =
    SPECIAL_PALETTES[fighter.id] ??
    COUNTRY_PALETTES[fighter.designNation] ??
    DEFAULT_PALETTE;
  const materials = createMaterials(paletteForNation);
  const root = new THREE.Group();
  root.name = `fighter-${fighter.id}`;
  root.userData.fighterId = fighter.id;

  const length = fighter.lengthM;
  const bodyRadius = THREE.MathUtils.clamp(
    length * (fighter.crew > 1 ? 0.06 : 0.048),
    0.32,
    1.22,
  );
  const bodyY = bodyRadius * 1.55;
  const radialSegments = lowDetail ? 8 : 16;

  addFuselage(root, fighter, bodyRadius, bodyY, radialSegments, materials);
  addMainWings(root, fighter, bodyRadius, bodyY, materials);
  addTail(root, fighter, bodyRadius, bodyY, materials);
  addCanards(root, fighter, bodyRadius, bodyY, materials);
  addCockpit(root, fighter, bodyRadius, bodyY, radialSegments, materials);
  addIntakes(root, fighter, bodyRadius, bodyY, radialSegments, materials);

  const propellers: THREE.Group[] = [];
  const nozzles: THREE.Mesh[] = [];
  addPowerplant(
    root,
    fighter,
    bodyRadius,
    bodyY,
    radialSegments,
    materials,
    propellers,
    nozzles,
  );
  addLandingGearHint(root, fighter, bodyY, materials, lowDetail);
  addArchiveMarkings(root, fighter, bodyY, materials, lowDetail);
  addGenericJetDetailKit(
    root,
    fighter,
    materials,
    { bodyY, radius: bodyRadius },
    lowDetail,
  );

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = !lowDetail;
      object.receiveShadow = true;
    }
  });

  const dispose = (): void => {
    const geometries = new Set<THREE.BufferGeometry>();
    const usedMaterials = new Set<THREE.Material>();
    root.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.LineSegments
      ) {
        geometries.add(object.geometry);
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => usedMaterials.add(material));
        } else {
          usedMaterials.add(object.material);
        }
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    usedMaterials.forEach((material) => material.dispose());
    root.clear();
  };

  root.userData.renderStats = collectRenderStats(root);
  return { root, propellers, nozzles, dispose };
}

export function updateFighterVisual(
  visual: FighterVisual,
  elapsedSeconds: number,
  deltaSeconds: number,
): void {
  for (let index = 0; index < visual.propellers.length; index += 1) {
    const propeller = visual.propellers[index];
    propeller.rotation.z += deltaSeconds * (9 + index * 0.55);
  }
  const pulse = 0.55 + Math.sin(elapsedSeconds * 4.2) * 0.08;
  for (const nozzle of visual.nozzles) {
    const material = nozzle.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissiveIntensity = pulse;
    }
  }
}

function addFuselage(
  root: THREE.Group,
  fighter: FighterProfile,
  radius: number,
  bodyY: number,
  segments: number,
  materials: Materials,
): void {
  const design = fighter.visual;
  const length = fighter.lengthM;
  if (design.faceted) {
    const facetedBody = new THREE.Mesh(
      facetedFuselageGeometry(length, radius, bodyY),
      materials.paint,
    );
    facetedBody.name = "faceted-fuselage";
    root.add(facetedBody);
    return;
  }
  const centerLength = length * (design.intake === "nose" ? 0.64 : 0.58);
  const bluntPistonNose =
    design.family === "radial-prop" || design.family === "biplane";
  const center = cylinderAlongZ(
    radius * 0.72,
    radius,
    centerLength,
    segments,
    materials.paint,
  );
  center.name = "fuselage-center";
  center.position.set(0, bodyY, -length * 0.01);
  if (design.faceted) center.scale.y = 0.72;
  root.add(center);

  const noseLength = length * (design.intake === "nose" ? 0.18 : 0.3);
  if (bluntPistonNose) {
    const cowling = cylinderAlongZ(
      radius * 1.02,
      radius * 0.9,
      length * 0.21,
      segments,
      materials.metal,
    );
    cowling.name = "radial-engine-cowling";
    cowling.position.set(0, bodyY, length * 0.385);
    root.add(cowling);
  } else if (design.intake === "nose") {
    const noseBarrel = cylinderAlongZ(
      radius * 0.7,
      radius * 0.82,
      noseLength,
      segments,
      materials.paint,
    );
    noseBarrel.position.set(0, bodyY, length * 0.36);
    root.add(noseBarrel);
  } else {
    const nose = coneAlongZ(
      radius * (design.faceted ? 0.82 : 0.94),
      noseLength,
      design.faceted ? 5 : segments,
      materials.paint,
    );
    nose.name = "fuselage-nose";
    nose.position.set(0, bodyY, length * 0.43);
    if (design.faceted) nose.scale.y = 0.72;
    root.add(nose);
  }

  const tailLength = length * 0.24;
  const tail = cylinderAlongZ(
    radius * 0.32,
    radius * 0.74,
    tailLength,
    segments,
    materials.paint,
  );
  tail.name = "fuselage-tail";
  tail.position.set(0, bodyY, -length * 0.39);
  if (design.faceted) tail.scale.y = 0.72;
  root.add(tail);

  if (design.twinBoom) {
    const boomOffset = Math.min(fighter.wingspanM * 0.19, radius * 3.1);
    for (const side of [-1, 1]) {
      const boom = cylinderAlongZ(
        radius * 0.2,
        radius * 0.28,
        length * 0.58,
        Math.max(6, segments - 4),
        materials.paint,
      );
      boom.name = "tail-boom";
      boom.position.set(
        side * boomOffset,
        bodyY - radius * 0.05,
        -length * 0.17,
      );
      root.add(boom);
    }
  }
}

function addMainWings(
  root: THREE.Group,
  fighter: FighterProfile,
  radius: number,
  bodyY: number,
  materials: Materials,
): void {
  const wing = createWingMesh(
    fighter.visual.wing,
    fighter.wingspanM,
    fighter.lengthM,
    fighter.visual.sweepDeg,
    Math.max(0.055, radius * 0.12),
    materials.paint,
    materials.underside,
  );
  wing.name = "main-wing";
  wing.position.y = bodyY - radius * 0.12;
  root.add(wing);

  if (fighter.visual.biplane) {
    const upperWing = createWingMesh(
      fighter.visual.wing,
      fighter.wingspanM * 0.94,
      fighter.lengthM,
      fighter.visual.sweepDeg,
      Math.max(0.045, radius * 0.09),
      materials.paint,
      materials.underside,
    );
    upperWing.name = "upper-wing";
    upperWing.scale.z = 0.78;
    upperWing.position.y = bodyY + radius * 2.8;
    root.add(upperWing);
    const strutHeight = upperWing.position.y - wing.position.y;
    for (const side of [-1, 1]) {
      for (const scale of [0.28, 0.48]) {
        const strut = new THREE.Mesh(
          new THREE.BoxGeometry(radius * 0.08, strutHeight, radius * 0.08),
          materials.metal,
        );
        strut.name = "wing-strut";
        strut.position.set(
          side * fighter.wingspanM * scale,
          bodyY + radius,
          -fighter.lengthM * 0.01,
        );
        root.add(strut);
      }
    }
  }

  if (fighter.id === "f4u") {
    wing.rotation.z = THREE.MathUtils.degToRad(3);
  }
}

function addTail(
  root: THREE.Group,
  fighter: FighterProfile,
  radius: number,
  bodyY: number,
  materials: Materials,
): void {
  const design = fighter.visual;
  const length = fighter.lengthM;
  if (design.tail === "none") return;
  if (design.horizontalTail !== false) {
    const tailSpan = fighter.wingspanM * (design.twinBoom ? 0.33 : 0.31);
    const stabilizer = createWingMesh(
      "tapered",
      tailSpan,
      length * 0.48,
      Math.max(8, design.sweepDeg * 0.55),
      Math.max(0.04, radius * 0.09),
      materials.paint,
      materials.underside,
    );
    stabilizer.name = "horizontal-tail";
    stabilizer.scale.z = 0.64;
    stabilizer.position.set(0, bodyY + radius * 0.12, -length * 0.35);
    root.add(stabilizer);
  }

  const count = design.tail === "single" ? 1 : 2;
  const tailHeight = Math.max(radius * 2.5, length * 0.13);
  const tailChord = length * 0.17;
  const boomOffset = design.twinBoom
    ? Math.min(fighter.wingspanM * 0.19, radius * 3.1)
    : Math.max(radius * 1.45, fighter.wingspanM * 0.075);
  for (let index = 0; index < count; index += 1) {
    const side = count === 1 ? 0 : index === 0 ? -1 : 1;
    const vertical = createVerticalTail(
      tailChord,
      tailHeight,
      Math.max(0.055, radius * 0.1),
      materials.paint,
      design.faceted === true,
    );
    vertical.name = "vertical-tail";
    vertical.position.set(
      side * boomOffset,
      bodyY + radius * 0.1,
      -length * 0.36,
    );
    if (design.tail === "v-tail") {
      vertical.rotation.z = side * THREE.MathUtils.degToRad(28);
    }
    root.add(vertical);
  }
}

function addCanards(
  root: THREE.Group,
  fighter: FighterProfile,
  radius: number,
  bodyY: number,
  materials: Materials,
): void {
  if (!fighter.visual.canards) return;
  const canards = createWingMesh(
    "delta",
    fighter.wingspanM * 0.29,
    fighter.lengthM * 0.34,
    54,
    Math.max(0.035, radius * 0.07),
    materials.accent,
    materials.underside,
  );
  canards.name = "canards";
  canards.scale.z = 0.55;
  canards.position.set(0, bodyY + radius * 0.14, fighter.lengthM * 0.22);
  root.add(canards);
}

function addCockpit(
  root: THREE.Group,
  fighter: FighterProfile,
  radius: number,
  bodyY: number,
  segments: number,
  materials: Materials,
): void {
  const tandem = fighter.crew > 1;
  const canopySegments = fighter.visual.faceted ? 6 : segments;
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(
      radius * 0.78,
      canopySegments,
      Math.max(4, canopySegments / 2),
    ),
    materials.canopy,
  );
  canopy.name = "canopy";
  canopy.scale.set(
    tandem ? 0.72 : 0.78,
    fighter.visual.faceted ? 0.38 : 0.55,
    tandem ? 2.05 : 1.35,
  );
  canopy.position.set(
    fighter.visual.family === "twin-boom-jet" ? radius * 0.2 : 0,
    bodyY + radius * 0.72,
    fighter.lengthM * (tandem ? 0.13 : 0.16),
  );
  root.add(canopy);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 1.15, radius * 0.05, radius * 0.08),
    materials.dark,
  );
  frame.name = "canopy-frame";
  frame.position.copy(canopy.position);
  frame.position.y += radius * 0.28;
  root.add(frame);
}

function addIntakes(
  root: THREE.Group,
  fighter: FighterProfile,
  radius: number,
  bodyY: number,
  segments: number,
  materials: Materials,
): void {
  const design = fighter.visual;
  if (design.intake === "none" || design.wingPods) return;
  const z = fighter.lengthM * 0.28;
  if (design.intake === "nose") {
    const intake = new THREE.Mesh(
      new THREE.CylinderGeometry(
        radius * 0.56,
        radius * 0.56,
        radius * 0.12,
        segments,
      ),
      materials.intake,
    );
    intake.name = "nose-intake";
    intake.rotation.x = Math.PI / 2;
    intake.position.set(0, bodyY, fighter.lengthM * 0.465);
    root.add(intake);
    return;
  }

  if (design.dorsalIntake) {
    const dorsal = intakeBox(
      radius * 1.15,
      radius * 0.7,
      radius * 2.6,
      materials,
    );
    dorsal.name = "dorsal-intake";
    dorsal.position.set(0, bodyY + radius * 1.35, -fighter.lengthM * 0.02);
    root.add(dorsal);
    return;
  }

  if (design.intake === "chin" && fighter.propulsion === "piston") {
    const chin = intakeBox(
      radius * 0.72,
      radius * 0.46,
      radius * 1.2,
      materials,
    );
    chin.name = "chin-radiator";
    chin.position.set(0, bodyY - radius * 0.95, z * 0.35);
    root.add(chin);
    return;
  }

  const sideOffset =
    design.intake === "ventral"
      ? 0
      : radius * (design.intake === "wing-root" ? 1.45 : 1.1);
  const yOffset = design.intake === "ventral" ? -radius * 0.9 : -radius * 0.08;
  const count = design.intake === "ventral" ? 1 : 2;
  for (let index = 0; index < count; index += 1) {
    const side = count === 1 ? 0 : index === 0 ? -1 : 1;
    const intake = intakeBox(
      radius * 0.56,
      radius * 0.62,
      radius * 1.28,
      materials,
    );
    intake.name = "side-intake";
    intake.position.set(side * sideOffset, bodyY + yOffset, z);
    root.add(intake);
  }
}

function addPowerplant(
  root: THREE.Group,
  fighter: FighterProfile,
  radius: number,
  bodyY: number,
  segments: number,
  materials: Materials,
  propellers: THREE.Group[],
  nozzles: THREE.Mesh[],
): void {
  if (fighter.propulsion === "piston") {
    addPropulsionProps(
      root,
      fighter,
      radius,
      bodyY,
      segments,
      materials,
      propellers,
    );
    return;
  }

  const design = fighter.visual;
  if (design.wingPods) {
    const offset = fighter.wingspanM * 0.23;
    for (const side of [-1, 1]) {
      const nacelle = cylinderAlongZ(
        radius * 0.48,
        radius * 0.58,
        fighter.lengthM * 0.26,
        segments,
        materials.metal,
      );
      nacelle.name = "jet-nacelle";
      nacelle.position.set(
        side * offset,
        bodyY - radius * 0.45,
        -fighter.lengthM * 0.01,
      );
      root.add(nacelle);
      const inlet = new THREE.Mesh(
        new THREE.CylinderGeometry(
          radius * 0.4,
          radius * 0.4,
          radius * 0.1,
          segments,
        ),
        materials.intake,
      );
      inlet.name = "nacelle-intake";
      inlet.rotation.x = Math.PI / 2;
      inlet.position.set(
        side * offset,
        bodyY - radius * 0.45,
        fighter.lengthM * 0.122,
      );
      root.add(inlet);
      const nozzle = addNozzle(
        root,
        side * offset,
        bodyY - radius * 0.45,
        -fighter.lengthM * 0.15,
        radius * 0.43,
        segments,
      );
      nozzles.push(nozzle);
    }
    return;
  }

  const engineCount = Math.min(2, fighter.engines);
  const nozzleOffset = engineCount === 1 ? 0 : radius * 0.78;
  for (let index = 0; index < engineCount; index += 1) {
    const side = engineCount === 1 ? 0 : index === 0 ? -1 : 1;
    const nozzle = addNozzle(
      root,
      side * nozzleOffset,
      bodyY - radius * 0.03,
      -fighter.lengthM * 0.515,
      radius * (engineCount === 1 ? 0.62 : 0.48),
      segments,
    );
    nozzles.push(nozzle);
  }

  if (fighter.propulsion === "rocket") {
    nozzles.forEach((nozzle) => {
      const material = nozzle.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.setHex(0xe88b55);
      }
    });
  }
}

function addPropulsionProps(
  root: THREE.Group,
  fighter: FighterProfile,
  radius: number,
  bodyY: number,
  segments: number,
  materials: Materials,
  propellers: THREE.Group[],
): void {
  if (fighter.visual.pusher) {
    const rear = createPropeller(
      radius * 2.45,
      materials.dark,
      materials.accent,
    );
    rear.name = "pusher-propeller";
    rear.position.set(
      0,
      bodyY,
      -fighter.lengthM * (fighter.visual.twinBoom ? 0.16 : 0.52),
    );
    root.add(rear);
    propellers.push(rear);
    return;
  }
  const twin =
    fighter.engines > 1 && fighter.visual.family !== "push-pull-prop";
  const offsets = twin
    ? [-fighter.wingspanM * 0.22, fighter.wingspanM * 0.22]
    : [0];
  for (const offset of offsets) {
    const bluntPistonNose =
      fighter.visual.family === "radial-prop" ||
      fighter.visual.family === "biplane";
    const z = twin
      ? fighter.lengthM * 0.082
      : fighter.lengthM * (bluntPistonNose ? 0.505 : 0.605);
    if (twin) {
      const nacelle = cylinderAlongZ(
        radius * 0.42,
        radius * 0.5,
        fighter.lengthM * 0.24,
        segments,
        materials.metal,
      );
      nacelle.name = "engine-nacelle";
      nacelle.position.set(
        offset,
        bodyY - radius * 0.04,
        z - fighter.lengthM * 0.1,
      );
      root.add(nacelle);
    }
    const propeller = createPropeller(
      radius * (twin ? 2.35 : 2.7),
      materials.dark,
      materials.accent,
    );
    propeller.name = "propeller";
    propeller.position.set(offset, bodyY, z);
    root.add(propeller);
    propellers.push(propeller);
  }

  if (fighter.visual.family === "push-pull-prop") {
    const rear = createPropeller(
      radius * 2.35,
      materials.dark,
      materials.accent,
    );
    rear.name = "rear-propeller";
    rear.position.set(0, bodyY, -fighter.lengthM * 0.52);
    root.add(rear);
    propellers.push(rear);
  }
}

function addLandingGearHint(
  root: THREE.Group,
  fighter: FighterProfile,
  bodyY: number,
  materials: Materials,
  lowDetail: boolean,
): void {
  if (lowDetail) return;
  const gear = new THREE.Group();
  gear.name = "gear-hint";
  const wheelRadius = THREE.MathUtils.clamp(
    fighter.lengthM * 0.012,
    0.11,
    0.24,
  );
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(wheelRadius, wheelRadius * 0.36, 6, 10),
      materials.dark,
    );
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(
      side * fighter.wingspanM * 0.13,
      wheelRadius,
      -fighter.lengthM * 0.03,
    );
    gear.add(wheel);
  }
  const noseWheel = new THREE.Mesh(
    new THREE.TorusGeometry(wheelRadius * 0.72, wheelRadius * 0.3, 6, 10),
    materials.dark,
  );
  noseWheel.rotation.y = Math.PI / 2;
  noseWheel.position.set(0, wheelRadius * 0.8, fighter.lengthM * 0.28);
  gear.add(noseWheel);
  gear.visible = bodyY < 2.4;
  root.add(gear);
}

function addArchiveMarkings(
  root: THREE.Group,
  fighter: FighterProfile,
  bodyY: number,
  materials: Materials,
  lowDetail: boolean,
): void {
  if (lowDetail) return;
  const radius = THREE.MathUtils.clamp(fighter.wingspanM * 0.032, 0.16, 0.48);
  for (const side of [-1, 1]) {
    const outer = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 18),
      materials.marking,
    );
    outer.name = "archive-national-marker";
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(
      side * fighter.wingspanM * 0.29,
      bodyY + 0.075,
      -fighter.lengthM * 0.02,
    );
    root.add(outer);
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.48, 16),
      materials.accent,
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.copy(outer.position);
    inner.position.y += 0.006;
    root.add(inner);
  }
}

function createWingMesh(
  planform: WingPlanform,
  span: number,
  lengthReference: number,
  sweepDeg: number,
  thickness: number,
  topMaterial: THREE.Material,
  bottomMaterial: THREE.Material,
): THREE.Mesh {
  const points = wingPoints(planform, span, lengthReference, sweepDeg);
  const geometry = prismGeometry(points, thickness);
  const mesh = new THREE.Mesh(geometry, [topMaterial, bottomMaterial]);
  return mesh;
}

function wingPoints(
  planform: WingPlanform,
  span: number,
  lengthReference: number,
  sweepDeg: number,
): Array<[number, number]> {
  const half = span * 0.5;
  const rootLeading = lengthReference * 0.15;
  const rootTrailing = -lengthReference * 0.19;
  const direction = sweepDeg < 0 ? 1 : -1;
  const sweptBack =
    Math.tan(THREE.MathUtils.degToRad(Math.abs(sweepDeg))) *
    half *
    0.58 *
    direction;
  let tipLeading = rootLeading + sweptBack;
  let tipTrailing = rootTrailing + sweptBack * 0.72;

  if (planform === "straight") {
    tipLeading = rootLeading * 0.82;
    tipTrailing = rootTrailing * 0.72;
  } else if (planform === "tapered") {
    tipLeading = rootLeading - lengthReference * 0.035;
    tipTrailing = rootTrailing + lengthReference * 0.11;
  } else if (planform === "elliptical") {
    const quarter = half * 0.72;
    return [
      [0, rootLeading],
      [quarter, rootLeading * 0.82],
      [half, -lengthReference * 0.015],
      [quarter, rootTrailing * 0.84],
      [0, rootTrailing],
      [-quarter, rootTrailing * 0.84],
      [-half, -lengthReference * 0.015],
      [-quarter, rootLeading * 0.82],
    ];
  } else if (planform === "delta") {
    tipLeading = rootTrailing + lengthReference * 0.03;
    tipTrailing = rootTrailing - lengthReference * 0.015;
  } else if (planform === "cropped-delta") {
    tipLeading = rootLeading + sweptBack;
    tipTrailing = tipLeading - lengthReference * 0.11;
  } else if (planform === "variable") {
    tipLeading = rootLeading - lengthReference * 0.3;
    tipTrailing = tipLeading - lengthReference * 0.08;
  }

  return [
    [0, rootLeading],
    [half, tipLeading],
    [half, tipTrailing],
    [0, rootTrailing],
    [-half, tipTrailing],
    [-half, tipLeading],
  ];
}

function prismGeometry(
  points: Array<[number, number]>,
  thickness: number,
): THREE.BufferGeometry {
  const shapePoints = points.map(([x, z]) => new THREE.Vector2(x, z));
  const triangles = THREE.ShapeUtils.triangulateShape(shapePoints, []);
  const positions: number[] = [];
  const indices: number[] = [];
  const halfThickness = thickness * 0.5;

  for (const y of [halfThickness, -halfThickness]) {
    for (const [x, z] of points) positions.push(x, y, z);
  }
  const count = points.length;
  for (const triangle of triangles) {
    indices.push(triangle[0], triangle[1], triangle[2]);
    indices.push(count + triangle[2], count + triangle[1], count + triangle[0]);
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(index, next, count + next, index, count + next, count + index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  const faceIndexCount = triangles.length * 3;
  geometry.addGroup(0, faceIndexCount, 0);
  geometry.addGroup(faceIndexCount, faceIndexCount, 1);
  geometry.addGroup(faceIndexCount * 2, count * 6, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function facetedFuselageGeometry(
  length: number,
  radius: number,
  bodyY: number,
): THREE.BufferGeometry {
  const sections = [
    { z: length * 0.54, width: radius * 0.08, height: radius * 0.08 },
    { z: length * 0.27, width: radius * 0.95, height: radius * 0.48 },
    { z: length * 0.02, width: radius * 1.55, height: radius * 0.64 },
    { z: -length * 0.3, width: radius * 1.2, height: radius * 0.52 },
    { z: -length * 0.52, width: radius * 0.34, height: radius * 0.24 },
  ];
  const positions: number[] = [];
  for (const section of sections) {
    positions.push(
      -section.width,
      bodyY,
      section.z,
      0,
      bodyY + section.height,
      section.z,
      section.width,
      bodyY,
      section.z,
      0,
      bodyY - section.height * 0.7,
      section.z,
    );
  }
  const indices: number[] = [];
  for (let section = 0; section < sections.length - 1; section += 1) {
    const current = section * 4;
    const next = current + 4;
    for (let face = 0; face < 4; face += 1) {
      const faceNext = (face + 1) % 4;
      indices.push(
        current + face,
        next + face,
        next + faceNext,
        current + face,
        next + faceNext,
        current + faceNext,
      );
    }
  }
  indices.push(0, 3, 2, 0, 2, 1);
  const rear = (sections.length - 1) * 4;
  indices.push(rear, rear + 1, rear + 2, rear, rear + 2, rear + 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createVerticalTail(
  chord: number,
  height: number,
  thickness: number,
  material: THREE.Material,
  faceted: boolean,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-chord * 0.55, 0);
  shape.lineTo(chord * 0.55, 0);
  shape.lineTo(chord * (faceted ? 0.05 : -0.12), height);
  shape.lineTo(-chord * (faceted ? 0.42 : 0.34), height * 0.88);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -thickness * 0.5);
  geometry.rotateY(-Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}

function createPropeller(
  bladeRadius: number,
  bladeMaterial: THREE.Material,
  tipMaterial: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(
      bladeRadius * 2,
      bladeRadius * 0.09,
      bladeRadius * 0.035,
    ),
    bladeMaterial,
  );
  const bladeCross = blade.clone();
  bladeCross.rotation.z = Math.PI / 2;
  group.add(blade, bladeCross);
  for (let index = 0; index < 4; index += 1) {
    const angle = index * (Math.PI / 2);
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(
        bladeRadius * 0.22,
        bladeRadius * 0.12,
        bladeRadius * 0.045,
      ),
      tipMaterial,
    );
    tip.position.set(
      Math.cos(angle) * bladeRadius * 0.88,
      Math.sin(angle) * bladeRadius * 0.88,
      0,
    );
    tip.rotation.z = angle;
    group.add(tip);
  }
  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(bladeRadius * 0.13, 10, 6),
    tipMaterial,
  );
  hub.scale.z = 1.5;
  group.add(hub);
  return group;
}

function addNozzle(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  radius: number,
  segments: number,
): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    color: 0x31383a,
    roughness: 0.62,
    metalness: 0.68,
    emissive: 0x5f3f2d,
    emissiveIntensity: 0.55,
  });
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.8, radius, radius * 0.72, segments),
    material,
  );
  nozzle.name = "engine-nozzle";
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(x, y, z);
  root.add(nozzle);
  return nozzle;
}

function intakeBox(
  width: number,
  height: number,
  depth: number,
  materials: Materials,
): THREE.Group {
  const group = new THREE.Group();
  const surround = cylinderAlongZ(
    width * 0.45,
    width * 0.52,
    depth,
    10,
    materials.metal,
  );
  surround.scale.y = height / width;
  const opening = new THREE.Mesh(
    new THREE.CircleGeometry(width * 0.37, 12),
    materials.intake,
  );
  opening.scale.y = height / width;
  opening.position.z = depth * 0.505;
  group.add(surround, opening);
  return group;
}

function cylinderAlongZ(
  frontRadius: number,
  rearRadius: number,
  length: number,
  segments: number,
  material: THREE.Material,
): THREE.Mesh {
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(frontRadius, rearRadius, length, segments),
    material,
  );
  cylinder.rotation.x = Math.PI / 2;
  return cylinder;
}

function coneAlongZ(
  radius: number,
  length: number,
  segments: number,
  material: THREE.Material,
): THREE.Mesh {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(radius, length, segments),
    material,
  );
  cone.rotation.x = Math.PI / 2;
  return cone;
}

function createMaterials(colors: Palette): Materials {
  return {
    paint: new THREE.MeshStandardMaterial({
      color: colors.paint,
      roughness: 0.68,
      metalness: 0.18,
    }),
    underside: new THREE.MeshStandardMaterial({
      color: colors.underside,
      roughness: 0.72,
      metalness: 0.12,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: colors.accent,
      roughness: 0.64,
      metalness: 0.12,
    }),
    marking: new THREE.MeshStandardMaterial({
      color: colors.marking,
      roughness: 0.62,
      metalness: 0.08,
    }),
    canopy: new THREE.MeshPhysicalMaterial({
      color: colors.canopy,
      roughness: 0.16,
      metalness: 0.08,
      transparent: true,
      opacity: 0.78,
      clearcoat: 0.85,
      clearcoatRoughness: 0.2,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x20292d,
      roughness: 0.74,
      metalness: 0.35,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x6d7776,
      roughness: 0.48,
      metalness: 0.62,
    }),
    intake: new THREE.MeshStandardMaterial({
      color: 0x171d20,
      roughness: 0.92,
      metalness: 0.18,
    }),
  };
}

function palette(
  paint: number,
  underside: number,
  accent: number,
  marking: number,
): Palette {
  return {
    paint,
    underside,
    accent,
    marking,
    canopy: 0x4d6b74,
  };
}

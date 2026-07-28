import * as THREE from "three";
import type { FighterProfile } from "../fighterCatalog";
import { lineSegments } from "./detailedModelUtils";

export interface GenericJetDetailMaterials {
  dark: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  marking: THREE.MeshStandardMaterial;
  paint: THREE.MeshStandardMaterial;
}

export interface GenericJetDetailKitOptions {
  bodyY: number;
  radius: number;
}

/**
 * A compact high-LOD presentation pass for catalog aircraft without a bespoke
 * airframe model. It uses only public, generic exterior cues (cockpit, panel
 * lines, lights, pylons, and exhaust rings), so the visual stays useful across
 * eras without inventing aircraft-specific systems.
 */
export function addGenericJetDetailKit(
  root: THREE.Group,
  fighter: FighterProfile,
  materials: GenericJetDetailMaterials,
  options: GenericJetDetailKitOptions,
  lowDetail: boolean,
): void {
  if (
    lowDetail ||
    (fighter.propulsion !== "turbojet" && fighter.propulsion !== "turbofan")
  )
    return;

  const { bodyY, radius } = options;
  const length = fighter.lengthM;
  const span = fighter.wingspanM;
  const group = new THREE.Group();
  group.name = `${fighter.id}-jet-detail-kit`;

  addCockpitPresentation(group, fighter, materials, bodyY, radius);
  addCanopyRails(group, fighter, materials, bodyY, radius);
  addWingPylons(group, fighter, materials, bodyY, radius);
  addPylonHardware(group, fighter, materials, bodyY, radius);
  addAntennaBlades(group, fighter, materials, bodyY, radius);
  addGearDoorPresentation(group, fighter, materials, bodyY, radius);
  addLighting(group, fighter, materials, bodyY, radius);
  root.add(group);

  const engineCount = Math.min(2, fighter.engines);
  const wingPodOffset = span * 0.23;
  const rearOffset = engineCount === 1 ? 0 : radius * 0.78;
  const exhaustZ = fighter.visual.wingPods ? -length * 0.15 : -length * 0.515;
  const exhaustY = fighter.visual.wingPods
    ? bodyY - radius * 0.45
    : bodyY - radius * 0.03;
  const exhaustRadius = radius * (engineCount === 1 ? 0.62 : 0.48);
  for (let index = 0; index < engineCount; index += 1) {
    const side = engineCount === 1 ? 0 : index === 0 ? -1 : 1;
    const exhaust = new THREE.Mesh(
      new THREE.TorusGeometry(exhaustRadius * 0.9, exhaustRadius * 0.09, 5, 12),
      materials.metal,
    );
    exhaust.name = `${fighter.id}-exhaust-petal-band`;
    exhaust.position.set(
      fighter.visual.wingPods ? side * wingPodOffset : side * rearOffset,
      exhaustY,
      exhaustZ,
    );
    group.add(exhaust);
  }

  const seamMaterial = new THREE.LineBasicMaterial({
    color: 0x2a3437,
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
  });
  const halfSpan = span * 0.45;
  const wingY = bodyY - radius * 0.02;
  const seams = lineSegments(
    [
      [-halfSpan * 0.28, wingY, -length * 0.14],
      [-halfSpan, wingY, -length * 0.25],
      [halfSpan * 0.28, wingY, -length * 0.14],
      [halfSpan, wingY, -length * 0.25],
      [-halfSpan * 0.34, wingY + 0.01, -length * 0.23],
      [-halfSpan * 0.83, wingY + 0.01, -length * 0.31],
      [halfSpan * 0.34, wingY + 0.01, -length * 0.23],
      [halfSpan * 0.83, wingY + 0.01, -length * 0.31],
      [-radius * 0.7, bodyY + radius * 0.16, length * 0.19],
      [-radius * 0.86, bodyY + radius * 0.08, length * 0.05],
      [radius * 0.7, bodyY + radius * 0.16, length * 0.19],
      [radius * 0.86, bodyY + radius * 0.08, length * 0.05],
      [-halfSpan * 0.1, wingY + 0.014, length * 0.11],
      [-halfSpan * 0.64, wingY + 0.014, -length * 0.01],
      [halfSpan * 0.1, wingY + 0.014, length * 0.11],
      [halfSpan * 0.64, wingY + 0.014, -length * 0.01],
      [-radius * 0.64, bodyY + radius * 0.22, -length * 0.2],
      [-radius * 0.42, bodyY + radius * 0.17, -length * 0.39],
      [radius * 0.64, bodyY + radius * 0.22, -length * 0.2],
      [radius * 0.42, bodyY + radius * 0.17, -length * 0.39],
    ],
    seamMaterial,
  );
  seams.name = `${fighter.id}-airframe-panel-lines`;
  group.add(seams);
}

function addCockpitPresentation(
  group: THREE.Group,
  fighter: FighterProfile,
  materials: GenericJetDetailMaterials,
  bodyY: number,
  radius: number,
): void {
  const cockpitZ = fighter.lengthM * (fighter.crew > 1 ? 0.12 : 0.16);
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 0.66, radius * 0.56, radius * 0.72),
    materials.dark,
  );
  seat.name = `${fighter.id}-cockpit-seat`;
  seat.position.set(0, bodyY + radius * 0.68, cockpitZ - radius * 0.18);
  seat.rotation.x = THREE.MathUtils.degToRad(-13);
  group.add(seat);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.22, 10, 7),
    materials.dark,
  );
  helmet.name = `${fighter.id}-pilot-helmet-silhouette`;
  helmet.scale.set(0.9, 1, 1.08);
  helmet.position.set(0, bodyY + radius * 1.12, cockpitZ + radius * 0.04);
  group.add(helmet);

  const display = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 0.72, radius * 0.2, radius * 0.08),
    materials.marking,
  );
  display.name = `${fighter.id}-cockpit-display`;
  display.position.set(0, bodyY + radius * 0.92, cockpitZ + radius * 0.55);
  display.rotation.x = THREE.MathUtils.degToRad(48);
  group.add(display);
}

function addCanopyRails(
  group: THREE.Group,
  fighter: FighterProfile,
  materials: GenericJetDetailMaterials,
  bodyY: number,
  radius: number,
): void {
  const cockpitZ = fighter.lengthM * (fighter.crew > 1 ? 0.12 : 0.16);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.05, radius * 0.05, radius * 1.35),
      materials.dark,
    );
    rail.name = `${fighter.id}-canopy-rail`;
    rail.position.set(
      side * radius * 0.54,
      bodyY + radius * 1.16,
      cockpitZ,
    );
    rail.rotation.x = THREE.MathUtils.degToRad(side * 4);
    group.add(rail);
  }
}

function addWingPylons(
  group: THREE.Group,
  fighter: FighterProfile,
  materials: GenericJetDetailMaterials,
  bodyY: number,
  radius: number,
): void {
  if (fighter.wingspanM < 7) return;
  for (const side of [-1, 1]) {
    for (const fraction of [0.28, 0.43]) {
      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 0.16, radius * 0.42, radius * 0.92),
        materials.metal,
      );
      pylon.name = `${fighter.id}-wing-pylon`;
      pylon.position.set(
        side * fighter.wingspanM * fraction,
        bodyY - radius * 0.45,
        -fighter.lengthM * (fraction === 0.28 ? 0.03 : 0.1),
      );
      pylon.rotation.z = side * THREE.MathUtils.degToRad(4);
      group.add(pylon);
    }
  }
}

/**
 * Pylon braces are instanced: four pylons read as properly mounted hardware
 * at close range, but they remain a single draw call instead of eight tiny
 * meshes per aircraft.
 */
function addPylonHardware(
  group: THREE.Group,
  fighter: FighterProfile,
  materials: GenericJetDetailMaterials,
  bodyY: number,
  radius: number,
): void {
  if (fighter.wingspanM < 7) return;
  const braces = new THREE.InstancedMesh(
    new THREE.BoxGeometry(radius * 0.07, radius * 0.12, radius * 0.3),
    materials.dark,
    8,
  );
  braces.name = `${fighter.id}-pylon-sway-braces`;
  const transform = new THREE.Object3D();
  let instance = 0;
  for (const side of [-1, 1]) {
    for (const fraction of [0.28, 0.43]) {
      for (const foreAft of [-0.28, 0.28]) {
        transform.position.set(
          side * fighter.wingspanM * fraction,
          bodyY - radius * 0.67,
          -fighter.lengthM * (fraction === 0.28 ? 0.03 : 0.1) + foreAft * radius,
        );
        transform.rotation.set(0, 0, side * THREE.MathUtils.degToRad(4));
        transform.updateMatrix();
        braces.setMatrixAt(instance, transform.matrix);
        instance += 1;
      }
    }
  }
  braces.instanceMatrix.needsUpdate = true;
  group.add(braces);
}

function addAntennaBlades(
  group: THREE.Group,
  fighter: FighterProfile,
  materials: GenericJetDetailMaterials,
  bodyY: number,
  radius: number,
): void {
  const blades = new THREE.InstancedMesh(
    new THREE.BoxGeometry(radius * 0.07, radius * 0.32, radius * 0.24),
    materials.metal,
    2,
  );
  blades.name = `${fighter.id}-airframe-antenna-blades`;
  const transform = new THREE.Object3D();
  const positions: Array<readonly [number, number, number]> = [
    [0, bodyY + radius * 0.92, -fighter.lengthM * 0.18],
    [0, bodyY - radius * 0.72, fighter.lengthM * 0.02],
  ];
  positions.forEach(([x, y, z], index) => {
    transform.position.set(x, y, z);
    transform.rotation.set(index === 0 ? 0.12 : -0.12, 0, 0);
    transform.updateMatrix();
    blades.setMatrixAt(index, transform.matrix);
  });
  blades.instanceMatrix.needsUpdate = true;
  group.add(blades);
}

function addGearDoorPresentation(
  group: THREE.Group,
  fighter: FighterProfile,
  materials: GenericJetDetailMaterials,
  bodyY: number,
  radius: number,
): void {
  const doors = new THREE.InstancedMesh(
    new THREE.BoxGeometry(radius * 0.46, radius * 0.025, radius * 1.08),
    materials.paint,
    3,
  );
  doors.name = `${fighter.id}-landing-gear-door-outlines`;
  const transform = new THREE.Object3D();
  const positions: Array<readonly [number, number, number]> = [
    [-fighter.wingspanM * 0.13, bodyY - radius * 0.82, -fighter.lengthM * 0.03],
    [fighter.wingspanM * 0.13, bodyY - radius * 0.82, -fighter.lengthM * 0.03],
    [0, bodyY - radius * 0.76, fighter.lengthM * 0.28],
  ];
  positions.forEach(([x, y, z], index) => {
    transform.position.set(x, y, z);
    transform.rotation.set(0, index === 2 ? 0 : Math.PI / 2, 0);
    transform.updateMatrix();
    doors.setMatrixAt(index, transform.matrix);
  });
  doors.instanceMatrix.needsUpdate = true;
  group.add(doors);
}

function addLighting(
  group: THREE.Group,
  fighter: FighterProfile,
  materials: GenericJetDetailMaterials,
  bodyY: number,
  radius: number,
): void {
  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.09, 7, 5),
      side < 0 ? materials.marking : materials.paint,
    );
    light.name = `${fighter.id}-wingtip-navigation-light`;
    light.position.set(side * fighter.wingspanM * 0.49, bodyY, -fighter.lengthM * 0.18);
    group.add(light);
  }
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.075, 7, 5),
    materials.marking,
  );
  beacon.name = `${fighter.id}-upper-anti-collision-beacon`;
  beacon.position.set(0, bodyY + radius * 1.02, -fighter.lengthM * 0.1);
  group.add(beacon);
}

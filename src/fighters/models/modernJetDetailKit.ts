import * as THREE from "three";
import { lineSegments } from "./detailedModelUtils";

export interface ModernJetDetailKitOptions {
  id: string;
  cockpit: readonly [x: number, y: number, z: number];
  canopyWidth: number;
  fuselageLength: number;
  fuselageWidth: number;
}

/**
 * High-detail-only visual cues shared by the public-view modern-fighter
 * schematics. They are intentionally generic cockpit/panel presentation, not
 * a claim about any aircraft's restricted systems or internal arrangement.
 */
export function addModernJetDetailKit(
  root: THREE.Group,
  options: ModernJetDetailKitOptions,
  lowDetail: boolean,
): void {
  if (lowDetail) return;

  const [x, y, z] = options.cockpit;
  const group = new THREE.Group();
  group.name = `${options.id}-cockpit-interior`;
  group.position.set(x, y, z);

  const cockpitDark = new THREE.MeshStandardMaterial({
    color: 0x161b1d,
    roughness: 0.7,
    metalness: 0.32,
    flatShading: true,
  });
  const cushion = new THREE.MeshStandardMaterial({
    color: 0x343a38,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true,
  });
  const display = new THREE.MeshStandardMaterial({
    color: 0x1b4244,
    emissive: 0x0d7775,
    emissiveIntensity: 0.28,
    roughness: 0.26,
    metalness: 0.45,
  });

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(options.canopyWidth * 0.58, 0.42, 0.52),
    cockpitDark,
  );
  seat.name = `${options.id}-ejection-seat-shell`;
  seat.position.set(0, -0.19, -0.1);
  seat.rotation.x = THREE.MathUtils.degToRad(-12);
  group.add(seat);

  const cushionPad = new THREE.Mesh(
    new THREE.BoxGeometry(options.canopyWidth * 0.48, 0.12, 0.32),
    cushion,
  );
  cushionPad.name = `${options.id}-seat-cushion`;
  cushionPad.position.set(0, 0.02, -0.17);
  cushionPad.rotation.x = THREE.MathUtils.degToRad(-12);
  group.add(cushionPad);

  const headrest = new THREE.Mesh(
    new THREE.BoxGeometry(options.canopyWidth * 0.34, 0.28, 0.16),
    cushion,
  );
  headrest.name = `${options.id}-headrest`;
  headrest.position.set(0, 0.2, -0.37);
  group.add(headrest);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(options.canopyWidth * 0.16, 10, 7),
    cockpitDark,
  );
  helmet.name = `${options.id}-pilot-helmet-silhouette`;
  helmet.scale.set(0.88, 1, 1.04);
  helmet.position.set(0, 0.28, 0.03);
  group.add(helmet);

  const instrumentPanel = new THREE.Mesh(
    new THREE.BoxGeometry(options.canopyWidth * 0.67, 0.23, 0.08),
    display,
  );
  instrumentPanel.name = `${options.id}-instrument-display`;
  instrumentPanel.position.set(0, 0.13, options.canopyWidth * 0.78);
  instrumentPanel.rotation.x = THREE.MathUtils.degToRad(48);
  group.add(instrumentPanel);

  const controlStick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.042, 0.27, 6),
    cockpitDark,
  );
  controlStick.name = `${options.id}-control-stick`;
  controlStick.position.set(options.canopyWidth * 0.18, 0.06, 0.26);
  controlStick.rotation.x = THREE.MathUtils.degToRad(-20);
  group.add(controlStick);
  root.add(group);

  const seamMaterial = new THREE.LineBasicMaterial({
    color: 0x1e292b,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const half = options.fuselageWidth * 0.5;
  const fore = options.fuselageLength * 0.21;
  const aft = -options.fuselageLength * 0.31;
  const seams = lineSegments(
    [
      [-half, y - 0.24, fore],
      [-half * 1.14, y - 0.42, fore - options.fuselageLength * 0.12],
      [half, y - 0.24, fore],
      [half * 1.14, y - 0.42, fore - options.fuselageLength * 0.12],
      [-half * 1.05, y - 0.36, aft],
      [-half * 0.68, y - 0.22, aft - options.fuselageLength * 0.09],
      [half * 1.05, y - 0.36, aft],
      [half * 0.68, y - 0.22, aft - options.fuselageLength * 0.09],
    ],
    seamMaterial,
  );
  seams.name = `${options.id}-service-panel-seams`;
  root.add(seams);
}

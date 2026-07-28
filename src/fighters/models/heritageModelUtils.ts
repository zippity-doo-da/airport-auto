import * as THREE from "three";
import {
  collectRenderStats,
  disposeDetailedRoot,
  prismMesh,
} from "./detailedModelUtils";

export interface DetailedFighterVisual {
  root: THREE.Group;
  propellers: THREE.Group[];
  nozzles: THREE.Mesh[];
  dispose: () => void;
}

export function thickQuadMesh(
  corners: readonly [
    THREE.Vector3,
    THREE.Vector3,
    THREE.Vector3,
    THREE.Vector3,
  ],
  thickness: number,
  material: THREE.Material,
): THREE.Mesh {
  const half = thickness * 0.5;
  const positions: number[] = [];
  for (const offset of [half, -half]) {
    for (const corner of corners) {
      positions.push(corner.x, corner.y + offset, corner.z);
    }
  }
  const indices = [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2,
    6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return new THREE.Mesh(geometry, material);
}

export function createFourBladePropeller(
  radius: number,
  bladeMaterial: THREE.Material,
  tipMaterial: THREE.Material,
  hubMaterial: THREE.Material,
  lowDetail: boolean,
): THREE.Group {
  const propeller = new THREE.Group();
  propeller.name = "four-blade-propeller";
  const bladeDisc = new THREE.Group();
  bladeDisc.name = "propeller-blade-disc";
  // prismMesh lies in X/Z and is extruded along Y. Rotate that plane into
  // X/Y so the complete propeller spins around the aircraft's Z axis.
  bladeDisc.rotation.x = Math.PI / 2;
  propeller.add(bladeDisc);
  const bladeRoot = radius * 0.18;
  const bladeTip = radius * 0.94;
  const bladeWidth = radius * 0.13;
  for (let bladeIndex = 0; bladeIndex < 4; bladeIndex += 1) {
    const blade = prismMesh(
      [
        [-bladeWidth * 0.38, bladeRoot],
        [bladeWidth * 0.52, bladeRoot * 1.1],
        [bladeWidth * 0.36, bladeTip],
        [-bladeWidth * 0.2, bladeTip * 0.9],
      ],
      lowDetail ? 0.035 : 0.055,
      bladeMaterial,
    );
    blade.name = "propeller-blade";
    blade.rotation.y = bladeIndex * (Math.PI / 2) + 0.18;
    bladeDisc.add(blade);

    if (!lowDetail) {
      const tip = prismMesh(
        [
          [-bladeWidth * 0.22, bladeTip * 0.82],
          [bladeWidth * 0.35, bladeTip * 0.84],
          [bladeWidth * 0.36, bladeTip],
          [-bladeWidth * 0.2, bladeTip * 0.9],
        ],
        0.061,
        tipMaterial,
      );
      tip.name = "propeller-tip";
      tip.rotation.y = blade.rotation.y;
      bladeDisc.add(tip);
    }
  }
  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.17, lowDetail ? 8 : 14, 7),
    hubMaterial,
  );
  hub.name = "propeller-hub";
  hub.scale.z = 1.35;
  propeller.add(hub);
  return propeller;
}

export function addUsStarMarking(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  radius: number,
  blueMaterial: THREE.Material,
  whiteMaterial: THREE.Material,
  rotationY = 0,
): void {
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.018, 24),
    blueMaterial,
  );
  disc.name = "us-insignia-disc";
  disc.position.set(x, y, z);
  disc.rotation.y = rotationY;
  root.add(disc);

  const starPoints: [number, number][] = [];
  for (let point = 0; point < 10; point += 1) {
    const angle = Math.PI / 2 + (point * Math.PI) / 5;
    const pointRadius = point % 2 === 0 ? radius * 0.69 : radius * 0.29;
    starPoints.push([
      Math.cos(angle) * pointRadius,
      Math.sin(angle) * pointRadius,
    ]);
  }
  const star = prismMesh(starPoints, 0.022, whiteMaterial);
  star.name = "us-insignia-star";
  star.position.set(x, y + 0.021, z);
  star.rotation.y = rotationY;
  root.add(star);
}

export function addFuselageStarMarking(
  root: THREE.Group,
  side: -1 | 1,
  surfaceX: number,
  y: number,
  z: number,
  radius: number,
  blueMaterial: THREE.Material,
  whiteMaterial: THREE.Material,
): void {
  const group = new THREE.Group();
  group.name = "fuselage-us-insignia";
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.018, 24),
    blueMaterial,
  );
  disc.rotation.z = Math.PI / 2;
  group.add(disc);
  const starPoints: [number, number][] = [];
  for (let point = 0; point < 10; point += 1) {
    const angle = Math.PI / 2 + (point * Math.PI) / 5;
    const pointRadius = point % 2 === 0 ? radius * 0.69 : radius * 0.29;
    starPoints.push([
      Math.cos(angle) * pointRadius,
      Math.sin(angle) * pointRadius,
    ]);
  }
  const star = prismMesh(starPoints, 0.022, whiteMaterial);
  star.rotation.z = Math.PI / 2;
  star.position.x = side * 0.021;
  group.add(star);
  group.position.set(side * surfaceX, y, z);
  root.add(group);
}

export function finishDetailedVisual(
  root: THREE.Group,
  propellers: THREE.Group[],
  nozzles: THREE.Mesh[],
  lowDetail: boolean,
): DetailedFighterVisual {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = !lowDetail;
    object.receiveShadow = false;
  });
  root.userData.renderStats = collectRenderStats(root);
  return {
    root,
    propellers,
    nozzles,
    dispose: () => disposeDetailedRoot(root),
  };
}

import * as THREE from "three";
import type { AirportConfig } from "../simulation/airportConfig";

export interface TerminalAccessDiagnostics {
  terminals: number;
  parkingBays: number;
  curbsideShuttles: number;
  terminalTrains: number;
  drawGroups: number;
}

export interface TerminalAccessRuntime {
  update(elapsed: number): void;
  setVisible(visible: boolean): void;
  diagnostics(): TerminalAccessDiagnostics;
  dispose(): void;
}

type AccessTerminal = {
  center: [number, number];
  landside: THREE.Vector2;
  tangent: THREE.Vector2;
  width: number;
};

const TERMINAL_CENTER_EPSILON = 0.15;

/**
 * A deliberately quiet landside program.  It is separate from ramp service
 * vehicles: these are terminal-access features (curbside, parking and buses),
 * so they never borrow the aircraft surface graph or cross a runway.
 */
export function createTerminalAccessScene(
  root: THREE.Group,
  config: AirportConfig,
  lowDetail: boolean,
): TerminalAccessRuntime {
  const group = new THREE.Group();
  group.name = "terminal-access-program";
  root.add(group);

  const terminals = terminalAccessPoints(config);
  const parkingTransforms: THREE.Matrix4[] = [];
  const canopyTransforms: THREE.Matrix4[] = [];
  const shuttleAnchors: Array<{ terminal: AccessTerminal; phase: number }> = [];
  const trainAnchors: Array<{ terminal: AccessTerminal; phase: number }> = [];
  const dummy = new THREE.Object3D();

  const curbMaterial = new THREE.MeshStandardMaterial({
    color: 0x3f4947,
    roughness: 0.95,
  });
  curbMaterial.name = "environment:pavement";
  const parkingMaterial = new THREE.MeshStandardMaterial({
    color: 0x67736a,
    roughness: 0.9,
  });
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0xd5c9af,
    roughness: 0.82,
  });

  for (const terminal of terminals) {
    const center = new THREE.Vector3(terminal.center[0], terminal.center[1], 1.62);
    const curbCenter = center
      .clone()
      .add(new THREE.Vector3(terminal.landside.x * 6.5, terminal.landside.y * 6.5, 0));
    const parkingCenter = curbCenter
      .clone()
      .add(new THREE.Vector3(terminal.landside.x * 6.4, terminal.landside.y * 6.4, 0));
    const accessWidth = Math.max(12, terminal.width);

    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(accessWidth, 3.1, 0.18),
      curbMaterial,
    );
    curb.position.copy(curbCenter);
    curb.rotation.z = Math.atan2(terminal.tangent.y, terminal.tangent.x);
    curb.receiveShadow = true;
    curb.name = "terminal-curbside-loop";
    group.add(curb);

    const parking = new THREE.Mesh(
      new THREE.BoxGeometry(accessWidth + 4, 8.5, 0.12),
      parkingMaterial,
    );
    parking.position.copy(parkingCenter);
    parking.position.z = 1.58;
    parking.rotation.z = curb.rotation.z;
    parking.receiveShadow = true;
    parking.name = "terminal-parking-apron";
    group.add(parking);

    const vehicleLimit = lowDetail ? 8 : 16;
    for (let index = 0; index < vehicleLimit; index += 1) {
      const column = index % 8;
      const row = Math.floor(index / 8);
      const along = (column - 3.5) * Math.min(2.2, accessWidth / 8.8);
      const depth = row === 0 ? 1.7 : -1.6;
      const position = parkingCenter
        .clone()
        .addScaledVector(new THREE.Vector3(terminal.tangent.x, terminal.tangent.y, 0), along)
        .addScaledVector(new THREE.Vector3(terminal.landside.x, terminal.landside.y, 0), depth);
      dummy.position.copy(position);
      dummy.position.z = 1.8;
      dummy.rotation.set(0, 0, curb.rotation.z);
      dummy.scale.set(1.15, 0.54, 0.34);
      dummy.updateMatrix();
      parkingTransforms.push(dummy.matrix.clone());
    }

    for (const along of [-accessWidth * 0.28, accessWidth * 0.28]) {
      const position = curbCenter
        .clone()
        .addScaledVector(new THREE.Vector3(terminal.tangent.x, terminal.tangent.y, 0), along);
      dummy.position.copy(position);
      dummy.position.z = 2.2;
      dummy.rotation.set(0, 0, curb.rotation.z);
      dummy.scale.set(4.4, 1.2, 0.16);
      dummy.updateMatrix();
      canopyTransforms.push(dummy.matrix.clone());
    }
    shuttleAnchors.push({ terminal, phase: shuttleAnchors.length * 1.9 });
    trainAnchors.push({ terminal, phase: trainAnchors.length * 2.7 });

    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(accessWidth + 18, 0.38, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x4d5b59, roughness: 0.72 }),
    );
    rail.name = "terminal-train-guideway";
    rail.position.copy(parkingCenter).addScaledVector(
      new THREE.Vector3(terminal.landside.x, terminal.landside.y, 0),
      6.5,
    );
    rail.position.z = 1.72;
    rail.rotation.z = curb.rotation.z;
    group.add(rail);
  }

  const parkedCars = createInstanced(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x718891, roughness: 0.72 }),
    parkingTransforms,
    "instanced-terminal-parking-cars",
  );
  const canopies = createInstanced(
    new THREE.BoxGeometry(1, 1, 1),
    canopyMaterial,
    canopyTransforms,
    "instanced-terminal-curbside-canopies",
  );
  group.add(parkedCars, canopies);

  const shuttles = shuttleAnchors.map((anchor, index) => {
    const shuttle = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.82, 0.72),
      new THREE.MeshStandardMaterial({
        color: index % 2 ? 0xd6b158 : 0x8fb6be,
        roughness: 0.68,
      }),
    );
    shuttle.name = "terminal-curbside-shuttle";
    shuttle.castShadow = true;
    shuttle.position.z = 2.04;
    group.add(shuttle);
    return { shuttle, ...anchor };
  });
  const trains = trainAnchors.map((anchor, index) => {
    const train = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.72, 0.7),
      new THREE.MeshStandardMaterial({
        color: index % 2 ? 0x7898a4 : 0xc2a767,
        roughness: 0.52,
        metalness: 0.14,
      }),
    );
    train.name = "terminal-landside-train";
    train.castShadow = true;
    train.position.z = 2.08;
    group.add(train);
    return { train, ...anchor };
  });

  const diagnostics: TerminalAccessDiagnostics = {
    terminals: terminals.length,
    parkingBays: parkingTransforms.length,
    curbsideShuttles: shuttles.length,
    terminalTrains: trains.length,
    drawGroups: 2 + terminals.length * 3 + shuttles.length + trains.length,
  };

  return {
    update(elapsed) {
      if (!group.visible) return;
      for (const { shuttle, terminal, phase } of shuttles) {
        const progress = Math.sin(elapsed * 0.16 + phase);
        const along = progress * Math.max(3.5, terminal.width * 0.28);
        shuttle.position.set(
          terminal.center[0] + terminal.landside.x * 6.35 + terminal.tangent.x * along,
          terminal.center[1] + terminal.landside.y * 6.35 + terminal.tangent.y * along,
          2.04,
        );
        shuttle.rotation.z = Math.atan2(terminal.tangent.y, terminal.tangent.x) + (progress < 0 ? Math.PI : 0);
      }
      for (const { train, terminal, phase } of trains) {
        const progress = Math.sin(elapsed * 0.075 + phase);
        const along = progress * Math.max(8, terminal.width * 0.56);
        train.position.set(
          terminal.center[0] + terminal.landside.x * 19 + terminal.tangent.x * along,
          terminal.center[1] + terminal.landside.y * 19 + terminal.tangent.y * along,
          2.08,
        );
        train.rotation.z = Math.atan2(terminal.tangent.y, terminal.tangent.x) + (progress < 0 ? Math.PI : 0);
      }
    },
    setVisible(visible) {
      group.visible = visible;
    },
    diagnostics: () => diagnostics,
    dispose() {
      root.remove(group);
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
    },
  };
}

function terminalAccessPoints(config: AirportConfig): AccessTerminal[] {
  const facilities = config.surfaceGraph.passengerFacilities.filter(
    (facility) => facility.kind === "terminal",
  );
  const centers = facilities.length
    ? facilities.map((facility) => ({
        center: facility.center,
        width: Math.max(16, Math.min(38, 12 + facility.publishedGateCount * 0.38)),
      }))
    : [{ center: config.terminal, width: 24 }];
  const airportCenter = centers.reduce(
    (sum, terminal) => sum.add(new THREE.Vector2(...terminal.center)),
    new THREE.Vector2(),
  ).multiplyScalar(1 / centers.length);

  return centers.map(({ center, width }, index) => {
    const landside = new THREE.Vector2(center[0], center[1]).sub(airportCenter);
    if (landside.lengthSq() < TERMINAL_CENTER_EPSILON) {
      landside.set(index % 2 ? 1 : -1, index < 2 ? -1 : 1);
    }
    landside.normalize();
    return {
      center,
      landside,
      tangent: new THREE.Vector2(-landside.y, landside.x),
      width,
    };
  });
}

function createInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: THREE.Matrix4[],
  name: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  transforms.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.computeBoundingSphere();
  mesh.name = name;
  return mesh;
}

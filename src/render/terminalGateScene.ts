import * as THREE from "three";
import type { AirportConfig } from "../simulation/airportConfig";
import type { AirportState } from "../simulation/types";

export interface TerminalGateSceneDiagnostics {
  bridges: number;
  docked: number;
  openDoors: number;
  drawGroups: number;
}

export interface TerminalGateSceneRuntime {
  update(state: AirportState, deltaSeconds: number, nightMix: number): void;
  diagnostics(): TerminalGateSceneDiagnostics;
  dispose(): void;
}

type BridgeAnchor = {
  standId: string;
  x: number;
  y: number;
  heading: number;
  extension: number;
  docked: boolean;
  doorOpen: boolean;
};

/**
 * A presentation-only passenger-gate layer. It derives every anchor from a
 * published passenger-facility stand and reads only authoritative parked/
 * pushback state. It never participates in the surface graph or collision
 * system, so a visual bridge cannot create a taxi obstruction.
 */
export function createTerminalGateScene(
  root: THREE.Group,
  config: AirportConfig,
  lowDetail: boolean,
): TerminalGateSceneRuntime {
  const group = new THREE.Group();
  group.name = "terminal-gate-activity";
  root.add(group);
  const facilityCenters = new Map(
    config.surfaceGraph.passengerFacilities.flatMap((facility) =>
      facility.standIds.map((standId) => [standId, facility.center] as const),
    ),
  );
  const anchors: BridgeAnchor[] = config.surfaceGraph.stands.flatMap((stand) => {
    const facilityCenter = facilityCenters.get(stand.id);
    if (!facilityCenter) return [];
    const toTerminalX = facilityCenter[0] - stand.position[0];
    const toTerminalY = facilityCenter[1] - stand.position[1];
    const distance = Math.hypot(toTerminalX, toTerminalY);
    if (distance < 0.2) return [];
    return [{
      standId: stand.id,
      x: stand.position[0],
      y: stand.position[1],
      heading: Math.atan2(toTerminalY, toTerminalX),
      extension: 0.28,
      docked: false,
      doorOpen: false,
    }];
  });
  const dummy = new THREE.Object3D();
  const armMaterial = new THREE.MeshStandardMaterial({
    color: 0xb9b8ad,
    roughness: 0.78,
    metalness: 0.08,
    vertexColors: true,
  });
  const cabMaterial = new THREE.MeshStandardMaterial({
    color: 0x536e71,
    emissive: 0x1a3638,
    emissiveIntensity: 0.24,
    roughness: 0.48,
    metalness: 0.18,
    vertexColors: true,
  });
  const supportMaterial = new THREE.MeshStandardMaterial({
    color: 0x7e847f,
    roughness: 0.86,
    metalness: 0.06,
  });
  const arm = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    armMaterial,
    anchors.length,
  );
  arm.name = "instanced-terminal-jet-bridge-arms";
  const cab = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    cabMaterial,
    anchors.length,
  );
  cab.name = "instanced-terminal-jet-bridge-cabs";
  const support = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.15, 1, lowDetail ? 5 : 7),
    supportMaterial,
    anchors.length,
  );
  support.name = "instanced-terminal-jet-bridge-supports";
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0xe0d8bd,
    emissive: 0x66551d,
    emissiveIntensity: 0.14,
    roughness: 0.58,
    metalness: 0.12,
    vertexColors: true,
  });
  const door = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    doorMaterial,
    anchors.length,
  );
  door.name = "instanced-terminal-jet-bridge-doors";
  arm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cab.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  support.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  door.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(arm, cab, support, door);

  const colors = {
    idle: new THREE.Color(0x84928d),
    docked: new THREE.Color(0xd9c98d),
  };
  let dockedCount = 0;
  let openDoorCount = 0;

  const placeBridge = (anchor: BridgeAnchor, index: number): void => {
    const length = 1.4 + anchor.extension * 4.4;
    const directionX = Math.cos(anchor.heading);
    const directionY = Math.sin(anchor.heading);
    const centerX = anchor.x + directionX * (0.8 + length / 2);
    const centerY = anchor.y + directionY * (0.8 + length / 2);
    dummy.position.set(centerX, centerY, 3.35);
    dummy.rotation.set(0, 0, anchor.heading);
    dummy.scale.set(length, 0.68, 0.44);
    dummy.updateMatrix();
    arm.setMatrixAt(index, dummy.matrix);

    const cabDistance = 0.8 + length;
    dummy.position.set(
      anchor.x + directionX * cabDistance,
      anchor.y + directionY * cabDistance,
      3.35,
    );
    dummy.rotation.set(0, 0, anchor.heading);
    dummy.scale.set(0.72, 0.94, 0.66);
    dummy.updateMatrix();
    cab.setMatrixAt(index, dummy.matrix);

    dummy.position.set(centerX, centerY, 2.45);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1, 1.55);
    dummy.updateMatrix();
    support.setMatrixAt(index, dummy.matrix);
    dummy.position.set(
      anchor.x + directionX * (cabDistance + 0.34),
      anchor.y + directionY * (cabDistance + 0.34),
      3.36,
    );
    dummy.rotation.set(0, 0, anchor.heading);
    dummy.scale.set(anchor.doorOpen ? 0.16 : 0.03, anchor.doorOpen ? 0.76 : 0.08, anchor.doorOpen ? 0.98 : 0.08);
    dummy.updateMatrix();
    door.setMatrixAt(index, dummy.matrix);
    const color = anchor.docked ? colors.docked : colors.idle;
    arm.setColorAt(index, color);
    cab.setColorAt(index, color);
    door.setColorAt(index, anchor.doorOpen ? colors.docked : colors.idle);
  };

  anchors.forEach(placeBridge);
  arm.instanceMatrix.needsUpdate = true;
  cab.instanceMatrix.needsUpdate = true;
  support.instanceMatrix.needsUpdate = true;
  door.instanceMatrix.needsUpdate = true;
  if (arm.instanceColor) arm.instanceColor.needsUpdate = true;
  if (cab.instanceColor) cab.instanceColor.needsUpdate = true;
  if (door.instanceColor) door.instanceColor.needsUpdate = true;
  arm.computeBoundingSphere();
  cab.computeBoundingSphere();
  support.computeBoundingSphere();
  door.computeBoundingSphere();

  return {
    update(state, deltaSeconds, nightMix) {
      const occupiedFlightsByStand = new Map(
        state.flights
          .filter(
            (flight) =>
              flight.phase === "resting" &&
              !flight.tugAttached &&
              Boolean(flight.standId),
          )
          .map((flight) => [flight.standId!, flight] as const),
      );
      let changed = false;
      dockedCount = 0;
      openDoorCount = 0;
      for (let index = 0; index < anchors.length; index += 1) {
        const anchor = anchors[index];
        const parkedFlight = occupiedFlightsByStand.get(anchor.standId);
        const docked = Boolean(parkedFlight);
        const doorOpen = Boolean(
          parkedFlight &&
            parkedFlight.service === "passenger" &&
            parkedFlight.turnaround.status !== "released",
        );
        const targetExtension = docked ? 1 : 0.28;
        const nextExtension = THREE.MathUtils.damp(
          anchor.extension,
          targetExtension,
          2.8,
          Math.max(0, deltaSeconds),
        );
        if (
          Math.abs(nextExtension - anchor.extension) > 0.0005 ||
          docked !== anchor.docked ||
          doorOpen !== anchor.doorOpen
        ) {
          anchor.extension = nextExtension;
          anchor.docked = docked;
          anchor.doorOpen = doorOpen;
          placeBridge(anchor, index);
          changed = true;
        }
        if (docked) dockedCount += 1;
        if (doorOpen) openDoorCount += 1;
      }
      if (changed) {
        arm.instanceMatrix.needsUpdate = true;
        cab.instanceMatrix.needsUpdate = true;
        support.instanceMatrix.needsUpdate = true;
        door.instanceMatrix.needsUpdate = true;
        if (arm.instanceColor) arm.instanceColor.needsUpdate = true;
        if (cab.instanceColor) cab.instanceColor.needsUpdate = true;
        if (door.instanceColor) door.instanceColor.needsUpdate = true;
      }
      cabMaterial.emissiveIntensity = 0.12 + nightMix * 0.4;
      doorMaterial.emissiveIntensity = 0.08 + nightMix * 0.3;
    },
    diagnostics: () => ({
      bridges: anchors.length,
      docked: dockedCount,
      openDoors: openDoorCount,
      drawGroups: anchors.length ? 4 : 0,
    }),
    dispose() {
      root.remove(group);
      arm.geometry.dispose();
      cab.geometry.dispose();
      support.geometry.dispose();
      door.geometry.dispose();
      armMaterial.dispose();
      cabMaterial.dispose();
      supportMaterial.dispose();
      doorMaterial.dispose();
    },
  };
}

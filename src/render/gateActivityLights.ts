import * as THREE from "three";
import type { AirportConfig } from "../simulation/airportConfig";
import type { AirportState } from "../simulation/types";

export type GateActivityLights = {
  mesh: THREE.InstancedMesh;
  standIds: string[];
  dayOpacity: number;
  nightOpacity: number;
};

/**
 * A single instanced layer makes stand occupancy legible without creating new
 * scene entities or autonomous presentation-only vehicles.
 */
export function createGateActivityLights(
  root: THREE.Group,
  config: AirportConfig,
  unitLight: THREE.SphereGeometry,
  lowDetail: boolean,
): GateActivityLights | null {
  const stands = config.surfaceGraph.stands;
  if (!stands.length) return null;
  const mesh = new THREE.InstancedMesh(
    unitLight,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    stands.length,
  );
  mesh.name = "instanced-gate-activity-lights";
  const dummy = new THREE.Object3D();
  const color = new THREE.Color(0x6f91a1);
  stands.forEach((stand, index) => {
    dummy.position.set(stand.position[0], stand.position[1], 1.92);
    dummy.scale.setScalar(lowDetail ? 0.2 : 0.26);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, color);
  });
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  if (mesh.instanceColor) mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.computeBoundingSphere();
  root.add(mesh);
  return {
    mesh,
    standIds: stands.map((stand) => stand.id),
    dayOpacity: 0.12,
    nightOpacity: 0.96,
  };
}

/** Returns a small cache key so the caller only uploads changed instance colors. */
export function updateGateActivityLights(
  lights: GateActivityLights,
  state: AirportState,
  nightIntensity: number,
  previousState: string,
): string {
  const occupiedStands = new Set(
    state.flights
      .filter(
        (flight) =>
          flight.standId &&
          flight.phase !== "approach" &&
          flight.phase !== "landing" &&
          flight.phase !== "takeoff",
      )
      .map((flight) => flight.standId!),
  );
  const servicingStands = new Set(
    state.serviceVehicles
      .filter((vehicle) => vehicle.status === "servicing")
      .map((vehicle) => vehicle.standId),
  );
  const stateKey = lights.standIds
    .map((standId) =>
      servicingStands.has(standId)
        ? "service"
        : occupiedStands.has(standId)
          ? "occupied"
          : "available",
    )
    .join(",");
  if (stateKey !== previousState) {
    const color = new THREE.Color();
    lights.standIds.forEach((standId, index) => {
      color.setHex(
        servicingStands.has(standId)
          ? 0x8bd7d2
          : occupiedStands.has(standId)
            ? 0xffd38a
            : 0x6f91a1,
      );
      lights.mesh.setColorAt(index, color);
    });
    if (lights.mesh.instanceColor) lights.mesh.instanceColor.needsUpdate = true;
  }
  const material = lights.mesh.material as THREE.MeshBasicMaterial;
  material.opacity = THREE.MathUtils.lerp(
    lights.dayOpacity,
    lights.nightOpacity,
    nightIntensity,
  );
  return stateKey;
}

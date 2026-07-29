import * as THREE from "three";
import type { AirportConfig } from "../simulation/airportConfig";
import type { AirportState } from "../simulation/types";

export type SurfaceProtectionOverlay = {
  group: THREE.Group;
  runwayZones: Array<{ runwayId: number; material: THREE.MeshBasicMaterial }>;
  holdMarkers: Array<{ runwayId: number; material: THREE.MeshBasicMaterial }>;
};

/** Short authoritative movement vectors for the optional tower map. */
export type SurfaceProjectionOverlay = {
  group: THREE.Group;
  lines: Map<string, { line: THREE.Line; position: THREE.BufferAttribute }>;
};

/**
 * Optional tower-view overlay for the same protected runway and hold-short
 * state used for clearance and collision arbitration. It is view-only.
 */
export function createSurfaceProtectionOverlay(
  config: AirportConfig,
): SurfaceProtectionOverlay {
  const group = new THREE.Group();
  group.name = "surface-layer-protection-zones";
  const runwayZones: SurfaceProtectionOverlay["runwayZones"] = [];
  const holdMarkers: SurfaceProtectionOverlay["holdMarkers"] = [];
  for (const runway of config.runways) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xf2c84b,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const zone = new THREE.Mesh(
      new THREE.BoxGeometry(runway.length * 0.98, runway.width * 1.42, 0.03),
      material,
    );
    zone.name = `protected-runway-zone-${runway.id}`;
    zone.position.set(runway.center[0], runway.center[1], 2.13);
    zone.rotation.z = runway.heading;
    zone.renderOrder = 6;
    group.add(zone);
    runwayZones.push({ runwayId: runway.id, material });
  }
  for (const node of config.surfaceGraph.nodes) {
    if (node.kind !== "hold-short" || node.runwayId === undefined) continue;
    const material = new THREE.MeshBasicMaterial({
      color: 0xf2c84b,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.08, 16), material);
    marker.name = `hold-short-protection-${node.runwayId}`;
    marker.position.set(node.position[0], node.position[1], 2.2);
    marker.renderOrder = 7;
    group.add(marker);
    holdMarkers.push({ runwayId: node.runwayId, material });
  }
  group.visible = false;
  return { group, runwayZones, holdMarkers };
}

export function updateSurfaceProtectionOverlay(
  overlay: SurfaceProtectionOverlay,
  state: AirportState,
): void {
  for (const zone of overlay.runwayZones) {
    const occupied = state.flights.some(
      (flight) => flight.motion.protectedRunway && flight.runway === zone.runwayId,
    );
    const crossingAuthorized = state.flights.some((flight) =>
      flight.crossingClearances?.includes(zone.runwayId),
    );
    zone.material.color.setHex(
      occupied ? 0xef6f62 : crossingAuthorized ? 0x79c8e8 : 0xf2c84b,
    );
    zone.material.opacity = occupied ? 0.34 : crossingAuthorized ? 0.22 : 0.1;
  }
  for (const marker of overlay.holdMarkers) {
    const holding = state.flights.some(
      (flight) => flight.crossingHoldRunway === marker.runwayId,
    );
    const crossingAuthorized = state.flights.some((flight) =>
      flight.crossingClearances?.includes(marker.runwayId),
    );
    marker.material.color.setHex(
      holding ? 0xf2c84b : crossingAuthorized ? 0x79c8e8 : 0x8eb5ab,
    );
    marker.material.opacity = holding ? 0.9 : crossingAuthorized ? 0.72 : 0.32;
  }
}

export function createSurfaceProjectionOverlay(): SurfaceProjectionOverlay {
  const group = new THREE.Group();
  group.name = "surface-layer-movement-projections";
  group.visible = false;
  return { group, lines: new Map() };
}

export function updateSurfaceProjectionOverlay(
  overlay: SurfaceProjectionOverlay,
  state: AirportState,
  worldMetersPerUnit: number,
  includeVehicles: boolean,
): void {
  const active = new Set<string>();
  const draw = (
    key: string,
    x: number,
    y: number,
    heading: number,
    groundspeedMps: number,
    color: number,
  ): void => {
    active.add(key);
    const distance = THREE.MathUtils.clamp(
      (groundspeedMps * 15) / Math.max(1, worldMetersPerUnit),
      1.25,
      15,
    );
    let entry = overlay.lines.get(key);
    if (!entry) {
      const geometry = new THREE.BufferGeometry();
      const position = new THREE.BufferAttribute(new Float32Array(18), 3);
      geometry.setAttribute("position", position);
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      });
      const line = new THREE.Line(geometry, material);
      line.name = `surface-projection-${key}`;
      line.frustumCulled = false;
      line.renderOrder = 8;
      overlay.group.add(line);
      entry = { line, position };
      overlay.lines.set(key, entry);
    }
    const lateralX = -Math.sin(heading);
    const lateralY = Math.cos(heading);
    for (let index = 0; index < 6; index += 1) {
      const progress = index / 5;
      const bow = Math.sin(progress * Math.PI) * Math.min(0.45, distance * 0.05);
      entry.position.setXYZ(
        index,
        x + Math.cos(heading) * distance * progress + lateralX * bow,
        y + Math.sin(heading) * distance * progress + lateralY * bow,
        3.15,
      );
    }
    entry.position.needsUpdate = true;
    entry.line.visible = true;
    (entry.line.material as THREE.LineBasicMaterial).color.setHex(color);
  };

  for (const flight of state.flights) {
    if (!flight.motion.onGround) continue;
    const held = Boolean(flight.controlHold || flight.safetyHoldReason);
    draw(
      `aircraft-${flight.id}`,
      flight.motion.x,
      flight.motion.y,
      flight.motion.heading,
      flight.kinematics.groundSpeedKts * 0.514444,
      flight.motion.protectedRunway ? 0xef6f62 : held ? 0xf2c84b : 0x79c8e8,
    );
  }
  if (includeVehicles) {
    for (const vehicle of state.serviceVehicles) {
      draw(
        `vehicle-${vehicle.id}`,
        vehicle.x,
        vehicle.y,
        vehicle.heading,
        vehicle.groundSpeedMps,
        vehicle.protectedMovementArea
          ? 0xef6f62
          : vehicle.held
            ? 0xf2c84b
            : 0x8eb5ab,
      );
    }
  }
  for (const [key, entry] of overlay.lines) {
    if (!active.has(key)) entry.line.visible = false;
  }
}

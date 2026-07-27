import * as THREE from 'three';
import type { AirportSurfaceGraph } from '../simulation/surfaceGraph';
import type { AirportState, SurfaceDisruptionKind } from '../simulation/types';
import { surfaceDisruptionPosition } from '../simulation/surfaceDisruptions';

export interface SurfaceDisruptionVisualOptions {
  state: AirportState;
  graph: AirportSurfaceGraph;
  scope: 'airfield' | 'center';
  layer: THREE.Group;
  visuals: Map<string, THREE.Group>;
  pools: Map<SurfaceDisruptionKind, THREE.Group[]>;
  poolBudget: number;
  dispose: (object: THREE.Object3D) => void;
}

/** Keeps map cues synchronized with serializable disruption state. */
export function updateSurfaceDisruptionVisuals(options: SurfaceDisruptionVisualOptions): void {
  const { state, graph, scope, layer, visuals, pools, poolBudget, dispose } = options;
  const visible = state.surfaceDisruptions.filter((disruption) => disruption.kind !== 'runway-closure');
  const visibleIds = new Set(visible.map((disruption) => disruption.id));
  for (const [id, marker] of visuals) {
    if (visibleIds.has(id)) continue;
    layer.remove(marker);
    marker.visible = false;
    marker.position.set(0, 0, 0);
    marker.rotation.set(0, 0, 0);
    marker.scale.setScalar(1);
    const kind = marker.userData.kind as SurfaceDisruptionKind;
    const pool = pools.get(kind) ?? [];
    const pooledCount = [...pools.values()].reduce(
      (total, entries) => total + entries.length,
      0,
    );
    if (pool.length < 6 && pooledCount < poolBudget) {
      pool.push(marker);
      pools.set(kind, pool);
    } else {
      dispose(marker);
    }
    visuals.delete(id);
  }
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  for (const disruption of visible) {
    let marker = visuals.get(disruption.id);
    if (!marker) {
      marker =
        pools.get(disruption.kind)?.pop() ??
        createSurfaceDisruptionMarker(disruption.kind);
      marker.visible = true;
      visuals.set(disruption.id, marker);
      layer.add(marker);
    }
    const flight = disruption.flightId === undefined
      ? undefined
      : state.flights.find((candidate) => candidate.id === disruption.flightId);
    const position = flight
      ? [flight.motion.x, flight.motion.y] as [number, number]
      : surfaceDisruptionPosition(graph, disruption);
    marker.visible = Boolean(position);
    if (!position) continue;
    marker.position.set(position[0], position[1], 1.72);
    const edge = edgeById.get(disruption.edgeIds[0]);
    const from = edge ? nodeById.get(edge.from) : undefined;
    const to = edge ? nodeById.get(edge.to) : undefined;
    marker.rotation.z = from && to ? Math.atan2(to.position[1] - from.position[1], to.position[0] - from.position[0]) : 0;
    const baseScale = scope === 'center' ? 0.78 : 1;
    const recoveryPulse = disruption.status === 'recovering' ? 1 + Math.sin(state.elapsed * 4.5) * 0.08 : 1;
    marker.scale.setScalar(baseScale * recoveryPulse);
    marker.userData.status = disruption.status;
  }
}

function createSurfaceDisruptionMarker(kind: SurfaceDisruptionKind): THREE.Group {
  const group = new THREE.Group();
  group.name = `surface-disruption-${kind}`;
  group.userData.kind = kind;
  const orange = new THREE.MeshStandardMaterial({ color: 0xe48d42, roughness: 0.62, emissive: 0x54240d, emissiveIntensity: 0.22 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf1e5c8, roughness: 0.7 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc5554f, roughness: 0.58, emissive: 0x4b1010, emissiveIntensity: 0.25 });

  if (kind === 'construction') {
    group.add(
      createConeInstances(orange, [-2, 0, 2]),
      createConeInstances(ivory, [-1, 1]),
    );
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.28, 0.28), orange);
    barrier.position.z = 0.65;
    barrier.castShadow = true;
    group.add(barrier);
    return group;
  }

  if (kind === 'disabled-aircraft') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.22, 8, 32), orange);
    ring.position.z = -0.35;
    group.add(ring);
    const beacons = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.28, 0.38, 0.7, 8),
      red,
      2,
    );
    const dummy = new THREE.Object3D();
    [-1.4, 1.4].forEach((x, index) => {
      dummy.position.set(x, -1.6, 0.05);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      beacons.setMatrixAt(index, dummy.matrix);
    });
    beacons.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    beacons.computeBoundingSphere();
    group.add(beacons);
    return group;
  }

  for (const angle of [-0.55, 0.55]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.5, 0.42), angle < 0 ? red : ivory);
    bar.rotation.z = angle;
    bar.castShadow = true;
    group.add(bar);
  }
  return group;
}

function createConeInstances(
  material: THREE.Material,
  positions: number[],
): THREE.InstancedMesh {
  const cones = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.3, 0.9, 8),
    material,
    positions.length,
  );
  const dummy = new THREE.Object3D();
  positions.forEach((position, index) => {
    dummy.position.set(position * 0.9, 0, 0);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.updateMatrix();
    cones.setMatrixAt(index, dummy.matrix);
  });
  cones.castShadow = true;
  cones.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  cones.computeBoundingSphere();
  return cones;
}

export function surfaceDisruptionPoolSize(
  pools: ReadonlyMap<SurfaceDisruptionKind, readonly THREE.Group[]>,
): number {
  return [...pools.values()].reduce(
    (total, entries) => total + entries.length,
    0,
  );
}

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
  dispose: (object: THREE.Object3D) => void;
}

/** Keeps map cues synchronized with serializable disruption state. */
export function updateSurfaceDisruptionVisuals(options: SurfaceDisruptionVisualOptions): void {
  const { state, graph, scope, layer, visuals, dispose } = options;
  const visible = state.surfaceDisruptions.filter((disruption) => disruption.kind !== 'runway-closure');
  const visibleIds = new Set(visible.map((disruption) => disruption.id));
  for (const [id, marker] of visuals) {
    if (visibleIds.has(id)) continue;
    layer.remove(marker);
    dispose(marker);
    visuals.delete(id);
  }
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  for (const disruption of visible) {
    let marker = visuals.get(disruption.id);
    if (!marker) {
      marker = createSurfaceDisruptionMarker(disruption.kind);
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
  const orange = new THREE.MeshStandardMaterial({ color: 0xe48d42, roughness: 0.62, emissive: 0x54240d, emissiveIntensity: 0.22 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf1e5c8, roughness: 0.7 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc5554f, roughness: 0.58, emissive: 0x4b1010, emissiveIntensity: 0.25 });

  if (kind === 'construction') {
    for (let index = -2; index <= 2; index += 1) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 8), index % 2 ? ivory : orange);
      cone.rotation.x = Math.PI / 2;
      cone.position.set(index * 0.9, 0, 0);
      cone.castShadow = true;
      group.add(cone);
    }
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
    for (const x of [-1.4, 1.4]) {
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.7, 8), red);
      beacon.rotation.x = Math.PI / 2;
      beacon.position.set(x, -1.6, 0.05);
      group.add(beacon);
    }
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

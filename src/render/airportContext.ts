import * as THREE from 'three';
import type { AirportContextDataManifest } from '../simulation/airportContextData';

type Point = [number, number];
type LineFeature = { id: string; class: string; widthMeters?: number; bridge?: boolean; tunnel?: boolean; points: Point[] };
type AreaFeature = { id: string; class: string; rings: Point[][] };
type AirportContextAsset = {
  schemaVersion: 1;
  airport: { icaoId: string };
  airportBoundary: { sourceId: string; rings: Point[][] };
  roads: LineFeature[];
  rails: LineFeature[];
  waterways: LineFeature[];
  areas: AreaFeature[];
};

export type AirportContextDiagnostics = {
  status: 'loading' | 'loaded' | 'error';
  roads: number;
  rails: number;
  waterways: number;
  areas: number;
  boundaryRings: number;
  drawGroups: number;
  error?: string;
};

export interface AirportContextRuntime {
  boundaryLayer: THREE.Group;
  diagnostics(): AirportContextDiagnostics;
  dispose(): void;
}

const AREA_COLORS: Record<string, number> = {
  water: 0x3f6c70,
  park: 0x557259,
  golf_course: 0x718466,
  industrial: 0x676d62,
  commercial: 0x747064,
  retail: 0x7b7061,
  railway: 0x555e59,
  cemetery: 0x657363,
};

const ROAD_COLORS: Record<string, number> = {
  motorway: 0x3b4545,
  motorway_link: 0x414b4a,
  trunk: 0x414a48,
  trunk_link: 0x46504e,
  primary: 0x4a5350,
  primary_link: 0x505956,
  secondary: 0x555d59,
};

const ROAD_MIN_WIDTH: Record<string, number> = {
  motorway: 0.46,
  motorway_link: 0.34,
  trunk: 0.42,
  trunk_link: 0.32,
  primary: 0.31,
  primary_link: 0.26,
  secondary: 0.22,
};

export function createAirportContext(
  root: THREE.Group,
  manifest: AirportContextDataManifest,
  worldMetersPerUnit: number,
): AirportContextRuntime {
  const contextGroup = new THREE.Group();
  contextGroup.name = `airport-context-${manifest.airport.icaoId}`;
  const boundaryLayer = new THREE.Group();
  boundaryLayer.name = 'surface-layer-airport-boundary';
  boundaryLayer.visible = false;
  root.add(contextGroup, boundaryLayer);

  const abortController = new AbortController();
  let disposed = false;
  let status: AirportContextDiagnostics['status'] = 'loading';
  let error: string | undefined;
  let drawGroups = 0;

  void fetch(new URL(manifest.assetPath, document.baseURI), { signal: abortController.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<AirportContextAsset>;
    })
    .then((asset) => {
      if (disposed) return;
      if (asset.schemaVersion !== manifest.schemaVersion || asset.airport.icaoId !== manifest.airport.icaoId) {
        throw new Error('context asset identity does not match its manifest');
      }
      drawGroups = buildContextGeometry(contextGroup, boundaryLayer, asset, worldMetersPerUnit);
      status = 'loaded';
    })
    .catch((reason: unknown) => {
      if (disposed || (reason instanceof DOMException && reason.name === 'AbortError')) return;
      status = 'error';
      error = reason instanceof Error ? reason.message : String(reason);
      console.error(`Unable to load ${manifest.airport.icaoId} surroundings: ${error}`);
    });

  return {
    boundaryLayer,
    diagnostics() {
      return {
        status,
        roads: status === 'loaded' ? manifest.counts.roads : 0,
        rails: status === 'loaded' ? manifest.counts.rails : 0,
        waterways: status === 'loaded' ? manifest.counts.waterways : 0,
        areas: status === 'loaded' ? manifest.counts.areas : 0,
        boundaryRings: status === 'loaded' ? manifest.counts.boundaryRings : 0,
        drawGroups,
        ...(error ? { error } : {}),
      };
    },
    dispose() {
      disposed = true;
      abortController.abort();
      root.remove(contextGroup, boundaryLayer);
      disposeGroup(contextGroup);
      disposeGroup(boundaryLayer);
    },
  };
}

function buildContextGeometry(
  contextGroup: THREE.Group,
  boundaryLayer: THREE.Group,
  asset: AirportContextAsset,
  worldMetersPerUnit: number,
): number {
  const scale = 1 / worldMetersPerUnit;
  let drawGroups = 0;

  for (const [areaClass, color] of Object.entries(AREA_COLORS)) {
    const geometry = polygonBatchGeometry(asset.areas.filter((area) => area.class === areaClass), scale, 1.29);
    if (!geometry) continue;
    const material = new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `context-area-${areaClass}`;
    mesh.receiveShadow = true;
    contextGroup.add(mesh);
    drawGroups += 1;
  }

  const waterwayGeometry = lineBatchGeometry(asset.waterways, scale, 1.35, (feature) => (
    Math.max(0.24, Math.min(1.2, (feature.widthMeters ?? 14) * scale))
  ));
  if (waterwayGeometry) {
    contextGroup.add(new THREE.Mesh(
      waterwayGeometry,
      new THREE.MeshStandardMaterial({ color: 0x3d686d, roughness: 0.82 }),
    ));
    drawGroups += 1;
  }

  for (const railClass of ['rail', 'light_rail']) {
    const geometry = lineBatchGeometry(
      asset.rails.filter((rail) => rail.class === railClass),
      scale,
      1.37,
      () => railClass === 'light_rail' ? 0.16 : 0.13,
    );
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: railClass === 'light_rail' ? 0xb89a6e : 0x303b3a }));
    mesh.name = `context-rail-${railClass}`;
    contextGroup.add(mesh);
    drawGroups += 1;
  }

  for (const [roadClass, color] of Object.entries(ROAD_COLORS)) {
    const roads = asset.roads.filter((road) => road.class === roadClass && !road.tunnel);
    const geometry = lineBatchGeometry(roads, scale, 1.39, (feature) => (
      Math.max(ROAD_MIN_WIDTH[roadClass], Math.min(0.72, (feature.widthMeters ?? 8) * scale))
    ));
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.96 }));
    mesh.name = `context-road-${roadClass}`;
    mesh.receiveShadow = true;
    contextGroup.add(mesh);
    drawGroups += 1;
  }

  const boundaryCoverGeometry = polygonBatchGeometry(
    [{ id: asset.airportBoundary.sourceId, class: 'airport', rings: asset.airportBoundary.rings }],
    scale,
    1.49,
  );
  if (boundaryCoverGeometry) {
    const cover = new THREE.Mesh(
      boundaryCoverGeometry,
      new THREE.MeshStandardMaterial({ color: 0x526a55, roughness: 1, side: THREE.DoubleSide }),
    );
    cover.name = 'context-airport-cover';
    cover.receiveShadow = true;
    contextGroup.add(cover);
    drawGroups += 1;
  }

  for (const ring of asset.airportBoundary.rings) {
    const points = withoutClosingPoint(ring).map(([x, y]) => new THREE.Vector3(x * scale, y * scale, 1.515));
    if (points.length < 3) continue;
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0xd8c38e, transparent: true, opacity: 0.78 }),
    );
    outline.name = `airport-boundary-${asset.airportBoundary.sourceId}`;
    boundaryLayer.add(outline);
    drawGroups += 1;
  }

  return drawGroups;
}

function polygonBatchGeometry(features: AreaFeature[], scale: number, z: number): THREE.BufferGeometry | null {
  const positions: number[] = [];
  for (const feature of features) {
    if (!feature.rings.length) continue;
    const contour = vectorRing(feature.rings[0], scale);
    const holes = feature.rings.slice(1).map((ring) => vectorRing(ring, scale)).filter((ring) => ring.length >= 3);
    if (contour.length < 3) continue;
    const vertices = [...contour, ...holes.flat()];
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    for (const face of faces) {
      for (const index of face) {
        const point = vertices[index];
        positions.push(point.x, point.y, z);
      }
    }
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function lineBatchGeometry(
  features: LineFeature[],
  scale: number,
  z: number,
  width: (feature: LineFeature) => number,
): THREE.BufferGeometry | null {
  const positions: number[] = [];
  for (const feature of features) {
    const lineWidth = width(feature);
    for (let index = 1; index < feature.points.length; index += 1) {
      const first = feature.points[index - 1];
      const second = feature.points[index];
      const firstX = first[0] * scale;
      const firstY = first[1] * scale;
      const secondX = second[0] * scale;
      const secondY = second[1] * scale;
      const deltaX = secondX - firstX;
      const deltaY = secondY - firstY;
      const length = Math.hypot(deltaX, deltaY);
      if (length <= 0.0001) continue;
      const normalX = -deltaY / length * lineWidth / 2;
      const normalY = deltaX / length * lineWidth / 2;
      positions.push(
        firstX + normalX, firstY + normalY, z,
        secondX + normalX, secondY + normalY, z,
        firstX - normalX, firstY - normalY, z,
        firstX - normalX, firstY - normalY, z,
        secondX + normalX, secondY + normalY, z,
        secondX - normalX, secondY - normalY, z,
      );
    }
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function vectorRing(ring: Point[], scale: number): THREE.Vector2[] {
  return withoutClosingPoint(ring).map(([x, y]) => new THREE.Vector2(x * scale, y * scale));
}

function withoutClosingPoint(ring: Point[]): Point[] {
  if (ring.length > 1 && ring[0][0] === ring.at(-1)?.[0] && ring[0][1] === ring.at(-1)?.[1]) return ring.slice(0, -1);
  return ring;
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    }
  });
}

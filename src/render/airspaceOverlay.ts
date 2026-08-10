import * as THREE from 'three';
import type { AirportConfig } from '../simulation/airportConfig';
import type { AirportState, Flight } from '../simulation/types';
import { procedureFix } from '../simulation/airspaceProcedures';
import { WORLD_METERS_PER_UNIT } from '../simulation/runwayPerformance';
import { requiredRadarSeparationNm, separationRuleset } from '../simulation/separationRules';
import {
  BoundedObjectPool,
  type BoundedObjectPoolSnapshot,
} from './boundedObjectPool';

export type AirspaceLayer = 'airspace-sectors' | 'navigation-fixes' | 'procedures' | 'flight-routes' | 'separation';

export interface AirspaceOverlayDiagnostics {
  activeRoutes: number;
  activeRoutePreviews: number;
  activeSeparationRings: number;
  dashedPool: BoundedObjectPoolSnapshot;
  ringPool: BoundedObjectPoolSnapshot;
}

export interface AirspaceOverlayRuntime {
  root: THREE.Group;
  layers: Record<AirspaceLayer, THREE.Group>;
  update(state: AirportState, delta: number): void;
  setVisible(layer: AirspaceLayer, visible: boolean): void;
  visibility(): Record<AirspaceLayer, boolean>;
  diagnostics(): AirspaceOverlayDiagnostics;
  dispose(): void;
}

const LAYER_NAMES: AirspaceLayer[] = ['airspace-sectors', 'navigation-fixes', 'procedures', 'flight-routes', 'separation'];

export function createAirspaceOverlay(config: AirportConfig): AirspaceOverlayRuntime {
  const root = new THREE.Group();
  root.name = 'airspace-overlay';
  const layers = Object.fromEntries(LAYER_NAMES.map((name) => {
    const group = new THREE.Group();
    group.name = `airspace-layer-${name}`;
    group.visible = false;
    root.add(group);
    return [name, group];
  })) as Record<AirspaceLayer, THREE.Group>;

  buildSectorLayer(config, layers['airspace-sectors']);
  buildFixLayer(config, layers['navigation-fixes']);
  buildProcedureLayer(config, layers.procedures);

  const routePreviewLayer = new THREE.Group();
  routePreviewLayer.name = 'airspace-route-previews';
  root.add(routePreviewLayer);
  const routeVisuals = new Map<number, THREE.Line>();
  const routePreviewVisuals = new Map<number, THREE.Line>();
  const separationVisuals = new Map<number, THREE.Line>();
  const dashedLinePool = transientLinePool(true, 48);
  const separationRingPool = transientLinePool(false, 40);
  let updateIn = 0;
  let lastRouteKey = '';
  let lastPreviewKey = '';

  const update = (state: AirportState, delta: number): void => {
    const previewFlights = state.flights.filter(hasRoutePreview);
    if (!layers['flight-routes'].visible && !layers.separation.visible && !previewFlights.length && !routePreviewVisuals.size) return;
    updateIn -= delta;
    if (updateIn > 0) return;
    updateIn = 0.2;
    const previewKey = previewFlights
      .map((flight) => `${flight.id}:${flight.navigation.routeClearance?.revision}:${flight.navigation.routeClearance?.status}:${flight.navigation.routeClearance?.safeToIssue}:${flight.motion.x.toFixed(1)}:${flight.motion.y.toFixed(1)}`)
      .join('|');
    if (previewKey !== lastPreviewKey || (!previewFlights.length && routePreviewVisuals.size)) {
      updateRoutePreviews(
        config,
        previewFlights,
        routePreviewLayer,
        routePreviewVisuals,
        dashedLinePool,
      );
      lastPreviewKey = previewKey;
    }
    if (layers['flight-routes'].visible) {
      const key = state.flights
        .filter(isAirborne)
        .map((flight) => `${flight.id}:${flight.navigation.routeFixIds.join(',')}:${flight.navigation.activeFixIndex}:${flight.motion.x.toFixed(1)}:${flight.motion.y.toFixed(1)}`)
        .join('|');
      if (key !== lastRouteKey) {
        updateFlightRoutes(
          config,
          state.flights,
          layers['flight-routes'],
          routeVisuals,
          dashedLinePool,
        );
        lastRouteKey = key;
      }
    }
    if (layers.separation.visible)
      updateSeparation(
        state,
        layers.separation,
        separationVisuals,
        separationRingPool,
      );
  };

  return {
    root,
    layers,
    update,
    setVisible(layer, visible) {
      layers[layer].visible = visible;
      if (visible) updateIn = 0;
    },
    visibility: () => Object.fromEntries(LAYER_NAMES.map((layer) => [layer, layers[layer].visible])) as Record<AirspaceLayer, boolean>,
    diagnostics: () => ({
      activeRoutes: routeVisuals.size,
      activeRoutePreviews: routePreviewVisuals.size,
      activeSeparationRings: separationVisuals.size,
      dashedPool: dashedLinePool.snapshot(),
      ringPool: separationRingPool.snapshot(),
    }),
    dispose() {
      disposeObject(root);
      dashedLinePool.dispose();
      separationRingPool.dispose();
      routeVisuals.clear();
      routePreviewVisuals.clear();
      separationVisuals.clear();
    },
  };
}

function buildSectorLayer(config: AirportConfig, group: THREE.Group): void {
  for (const sector of config.airspaceProgram.sectors) {
    const points = [...sector.polygon, sector.polygon[0]].map(([x, y]) => new THREE.Vector3(x, y, 0.48));
    group.add(line(points, sector.role === 'arrival' ? 0x7fb5bd : 0xb8a77f, 0.26, true));
    const center = polygonCenter(sector.polygon);
    const label = textSprite(`${sector.name}  ${sector.floorFt / 100}-${sector.ceilingFt / 100}`, '#b7d3d5', 'rgba(25,48,50,.72)');
    label.position.set(center[0], center[1], 0.7);
    label.scale.set(22, 5.5, 1);
    group.add(label);
  }
}

function buildFixLayer(config: AirportConfig, group: THREE.Group): void {
  for (const fix of config.airspaceProgram.fixes) {
    const size = fix.kind === 'entry' || fix.kind === 'handoff' ? 2.4 : 1.5;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(fix.position[0], fix.position[1] + size, 0.62),
      new THREE.Vector3(fix.position[0] + size, fix.position[1], 0.62),
      new THREE.Vector3(fix.position[0], fix.position[1] - size, 0.62),
      new THREE.Vector3(fix.position[0] - size, fix.position[1], 0.62),
      new THREE.Vector3(fix.position[0], fix.position[1] + size, 0.62),
    ]);
    const marker = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: fix.kind === 'final' ? 0xd6a58c : 0x9bc1c5, transparent: true, opacity: 0.75, depthWrite: false }));
    marker.renderOrder = 5;
    group.add(marker);
    if (fix.kind === 'entry' || fix.kind === 'final' || fix.kind === 'handoff') {
      const label = textSprite(`${fix.name}  ${fix.altitudeFt.toLocaleString()}′`, '#d6e1d9', 'rgba(24,48,49,.78)');
      label.position.set(fix.position[0] + size + 6, fix.position[1] + size, 0.74);
      label.scale.set(24, 5.2, 1);
      group.add(label);
    }
  }
}

function buildProcedureLayer(config: AirportConfig, group: THREE.Group): void {
  for (const procedure of config.airspaceProgram.procedures) {
    const common = procedure.commonFixIds
      .map((id) => procedureFix(config.airspaceProgram, id))
      .filter((fix): fix is NonNullable<typeof fix> => Boolean(fix));
    for (const transition of procedure.transitions) {
      const fixes = [...transition.fixIds.map((id) => procedureFix(config.airspaceProgram, id)), ...common]
        .filter((fix): fix is NonNullable<typeof fix> => Boolean(fix));
      if (fixes.length < 2) continue;
      const points = fixes.map((fix) => new THREE.Vector3(fix.position[0], fix.position[1], 0.54));
      group.add(line(points, procedure.kind === 'STAR' ? 0xc98a82 : 0x82a9b4, 0.34, true));
    }
  }
}

function updateFlightRoutes(
  config: AirportConfig,
  flights: Flight[],
  group: THREE.Group,
  visuals: Map<number, THREE.Line>,
  pool: BoundedObjectPool<THREE.Line>,
): void {
  const active = new Set<number>();
  for (const flight of flights.filter(isAirborne)) {
    const fixes = flight.navigation.routeFixIds
      .slice(flight.navigation.activeFixIndex)
      .map((id) => procedureFix(config.airspaceProgram, id))
      .filter((fix): fix is NonNullable<typeof fix> => Boolean(fix));
    if (!fixes.length) continue;
    active.add(flight.id);
    const points = [
      new THREE.Vector3(flight.motion.x, flight.motion.y, 0.82),
      ...fixes.map((fix) => new THREE.Vector3(fix.position[0], fix.position[1], 0.82)),
    ];
    let visual = visuals.get(flight.id);
    if (!visual) {
      visual = acquireTransientLine(
        pool,
        points,
        flight.phase === 'approach' ? 0xe0a092 : 0x9fc8d1,
        0.72,
      );
      visual.name = `flight-route-${flight.id}`;
      visuals.set(flight.id, visual);
      group.add(visual);
    } else {
      updateLineGeometry(visual, points, true);
    }
  }
  for (const [id, visual] of visuals) {
    if (active.has(id)) continue;
    group.remove(visual);
    pool.release(visual);
    visuals.delete(id);
  }
}

function updateRoutePreviews(
  config: AirportConfig,
  flights: Flight[],
  group: THREE.Group,
  visuals: Map<number, THREE.Line>,
  pool: BoundedObjectPool<THREE.Line>,
): void {
  const active = new Set<number>();
  for (const flight of flights) {
    const clearance = flight.navigation.routeClearance!;
    const fixes = clearance.routeFixIds
      .map((id) => procedureFix(config.airspaceProgram, id))
      .filter((fix): fix is NonNullable<typeof fix> => Boolean(fix));
    if (!fixes.length) continue;
    active.add(flight.id);
    const points = [
      new THREE.Vector3(flight.motion.x, flight.motion.y, 0.96),
      ...fixes.map((fix) => new THREE.Vector3(fix.position[0], fix.position[1], 0.96)),
    ];
    const blocking = clearance.warnings.some((warning) => warning.severity === 'blocking');
    const style = blocking ? 'blocking' : clearance.status === 'sent' || clearance.status === 'pending-readback' ? 'pending' : clearance.warnings.length ? 'warning' : 'safe';
    const color = style === 'blocking' ? 0xef765f : style === 'safe' ? 0x8ed1dc : 0xefc775;
    let visual = visuals.get(flight.id);
    if (!visual || visual.userData.style !== style) {
      if (visual) {
        group.remove(visual);
        pool.release(visual);
      }
      visual = acquireTransientLine(pool, points, color, 0.92);
      visual.name = `route-preview-${flight.id}`;
      visual.userData.style = style;
      visuals.set(flight.id, visual);
      group.add(visual);
    } else {
      updateLineGeometry(visual, points, true);
    }
  }
  for (const [id, visual] of visuals) {
    if (active.has(id)) continue;
    group.remove(visual);
    pool.release(visual);
    visuals.delete(id);
  }
}

function updateSeparation(
  state: AirportState,
  group: THREE.Group,
  visuals: Map<number, THREE.Line>,
  pool: BoundedObjectPool<THREE.Line>,
): void {
  const active = new Set<number>();
  const radius = requiredRadarSeparationNm(separationRuleset(state.separationRuleset), state.weather) * 1_852 / WORLD_METERS_PER_UNIT;
  for (const flight of state.flights.filter(isAirborne)) {
    active.add(flight.id);
    let visual = visuals.get(flight.id);
    if (!visual) {
      const points = separationCircle(radius);
      visual = acquireTransientLine(
        pool,
        points,
        flight.wakeClass === 'heavy' ? 0xe1a083 : 0xc7bb86,
        0.18,
      );
      visual.name = `separation-ring-${flight.id}`;
      visuals.set(flight.id, visual);
      group.add(visual);
    } else if (Math.abs(Number(visual.userData.radius ?? 0) - radius) > 0.01) {
      updateLineGeometry(visual, separationCircle(radius), false);
    }
    visual.userData.radius = radius;
    visual.position.set(flight.motion.x, flight.motion.y, 0);
  }
  for (const [id, visual] of visuals) {
    if (active.has(id)) continue;
    group.remove(visual);
    pool.release(visual);
    visuals.delete(id);
  }
}

function separationCircle(radius: number): THREE.Vector3[] {
  return Array.from({ length: 65 }, (_, index) => {
    const angle = index / 64 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.86);
  });
}

function line(points: THREE.Vector3[], color: number, opacity: number, dashed: boolean): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 5, gapSize: 3, depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const visual = new THREE.Line(geometry, material);
  if (dashed) visual.computeLineDistances();
  visual.renderOrder = 4;
  return visual;
}

function transientLinePool(
  dashed: boolean,
  capacity: number,
): BoundedObjectPool<THREE.Line> {
  return new BoundedObjectPool<THREE.Line>({
    capacity,
    create: () => line([], 0xffffff, 1, dashed),
    reset(visual) {
      visual.visible = false;
      visual.name = '';
      visual.position.set(0, 0, 0);
      visual.rotation.set(0, 0, 0);
      visual.scale.setScalar(1);
      visual.userData = {};
      visual.geometry.setDrawRange(0, 0);
    },
    dispose: disposeObject,
  });
}

function acquireTransientLine(
  pool: BoundedObjectPool<THREE.Line>,
  points: THREE.Vector3[],
  color: number,
  opacity: number,
): THREE.Line {
  const visual = pool.acquire();
  visual.visible = true;
  const material = visual.material as THREE.LineBasicMaterial;
  material.color.setHex(color);
  material.opacity = opacity;
  updateLineGeometry(
    visual,
    points,
    material instanceof THREE.LineDashedMaterial,
  );
  return visual;
}

function nextBufferCapacity(required: number): number {
  let capacity = 2;
  while (capacity < required) capacity *= 2;
  return capacity;
}

function ensureFloatAttribute(
  geometry: THREE.BufferGeometry,
  name: string,
  required: number,
  itemSize: number,
): THREE.BufferAttribute {
  const existing = geometry.getAttribute(name);
  if (
    existing instanceof THREE.BufferAttribute &&
    existing.itemSize === itemSize &&
    existing.count >= required
  ) {
    return existing;
  }
  const attribute = new THREE.Float32BufferAttribute(
    nextBufferCapacity(required) * itemSize,
    itemSize,
  );
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(name, attribute);
  return attribute;
}

function updateLineGeometry(
  visual: THREE.Line,
  points: THREE.Vector3[],
  dashed: boolean,
): void {
  const geometry = visual.geometry;
  const position = ensureFloatAttribute(
    geometry,
    'position',
    Math.max(1, points.length),
    3,
  );
  let cumulativeDistance = 0;
  const lineDistance = dashed
    ? ensureFloatAttribute(
        geometry,
        'lineDistance',
        Math.max(1, points.length),
        1,
      )
    : null;
  points.forEach((point, index) => {
    position.setXYZ(index, point.x, point.y, point.z);
    if (index > 0) cumulativeDistance += point.distanceTo(points[index - 1]);
    lineDistance?.setX(index, cumulativeDistance);
  });
  position.needsUpdate = true;
  if (lineDistance) lineDistance.needsUpdate = true;
  geometry.setDrawRange(0, points.length);
  if (points.length > 0) geometry.computeBoundingSphere();
}

function textSprite(text: string, color: string, background: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext('2d')!;
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.font = '600 27px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 8;
  return sprite;
}

function polygonCenter(points: Array<[number, number]>): [number, number] {
  return [
    points.reduce((sum, point) => sum + point[0], 0) / Math.max(1, points.length),
    points.reduce((sum, point) => sum + point[1], 0) / Math.max(1, points.length),
  ];
}

function isAirborne(flight: Flight): boolean {
  return flight.phase === 'approach' || flight.phase === 'landing' || (flight.phase === 'takeoff' && !flight.motion.onGround);
}

function hasRoutePreview(flight: Flight): boolean {
  const status = flight.navigation.routeClearance?.status;
  return isAirborne(flight) && (status === 'preview' || status === 'sent' || status === 'pending-readback');
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      const mapped = material as THREE.Material & { map?: THREE.Texture };
      mapped.map?.dispose();
      material.dispose();
    }
  });
}

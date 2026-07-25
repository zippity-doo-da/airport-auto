import * as THREE from 'three';
import type { AirportConfig } from '../simulation/airportConfig';
import type { AirportState, Flight } from '../simulation/types';
import { procedureFix } from '../simulation/airspaceProcedures';
import { WORLD_METERS_PER_UNIT } from '../simulation/runwayPerformance';
import { requiredRadarSeparationNm, separationRuleset } from '../simulation/separationRules';

export type AirspaceLayer = 'airspace-sectors' | 'navigation-fixes' | 'procedures' | 'flight-routes' | 'separation';

export interface AirspaceOverlayRuntime {
  root: THREE.Group;
  layers: Record<AirspaceLayer, THREE.Group>;
  update(state: AirportState, delta: number): void;
  setVisible(layer: AirspaceLayer, visible: boolean): void;
  visibility(): Record<AirspaceLayer, boolean>;
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

  const routeVisuals = new Map<number, THREE.Line>();
  const separationVisuals = new Map<number, THREE.Line>();
  let updateIn = 0;
  let lastRouteKey = '';

  const update = (state: AirportState, delta: number): void => {
    if (!layers['flight-routes'].visible && !layers.separation.visible) return;
    updateIn -= delta;
    if (updateIn > 0) return;
    updateIn = 0.2;
    if (layers['flight-routes'].visible) {
      const key = state.flights
        .filter(isAirborne)
        .map((flight) => `${flight.id}:${flight.navigation.routeFixIds.join(',')}:${flight.navigation.activeFixIndex}:${flight.motion.x.toFixed(1)}:${flight.motion.y.toFixed(1)}`)
        .join('|');
      if (key !== lastRouteKey) {
        updateFlightRoutes(config, state.flights, layers['flight-routes'], routeVisuals);
        lastRouteKey = key;
      }
    }
    if (layers.separation.visible) updateSeparation(state, layers.separation, separationVisuals);
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
    dispose() {
      disposeObject(root);
      routeVisuals.clear();
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
      visual = line(points, flight.phase === 'approach' ? 0xe0a092 : 0x9fc8d1, 0.72, true);
      visual.name = `flight-route-${flight.id}`;
      visuals.set(flight.id, visual);
      group.add(visual);
    } else {
      visual.geometry.dispose();
      visual.geometry = new THREE.BufferGeometry().setFromPoints(points);
    }
  }
  for (const [id, visual] of visuals) {
    if (active.has(id)) continue;
    group.remove(visual);
    disposeObject(visual);
    visuals.delete(id);
  }
}

function updateSeparation(state: AirportState, group: THREE.Group, visuals: Map<number, THREE.Line>): void {
  const active = new Set<number>();
  const radius = requiredRadarSeparationNm(separationRuleset(state.separationRuleset), state.weather) * 1_852 / WORLD_METERS_PER_UNIT;
  for (const flight of state.flights.filter(isAirborne)) {
    active.add(flight.id);
    let visual = visuals.get(flight.id);
    if (!visual) {
      const points = separationCircle(radius);
      visual = line(points, flight.wakeClass === 'heavy' ? 0xe1a083 : 0xc7bb86, 0.18, false);
      visual.name = `separation-ring-${flight.id}`;
      visuals.set(flight.id, visual);
      group.add(visual);
    } else if (Math.abs(Number(visual.userData.radius ?? 0) - radius) > 0.01) {
      visual.geometry.dispose();
      visual.geometry = new THREE.BufferGeometry().setFromPoints(separationCircle(radius));
    }
    visual.userData.radius = radius;
    visual.position.set(flight.motion.x, flight.motion.y, 0);
  }
  for (const [id, visual] of visuals) {
    if (active.has(id)) continue;
    group.remove(visual);
    disposeObject(visual);
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

import type { AirportConfig, RunwayConfig } from './airportConfig';

export type AirportObstacleKind = 'terminal' | 'control-tower';

interface AirportObstacleBase {
  id: string;
  kind: AirportObstacleKind;
  label: string;
  center: [number, number];
  minimumAltitude: number;
  maximumAltitude: number;
  clearance: number;
}

export interface BoxAirportObstacleEnvelope extends AirportObstacleBase {
  shape: 'box';
  halfExtents: [number, number];
}

export interface CircleAirportObstacleEnvelope extends AirportObstacleBase {
  shape: 'circle';
  radius: number;
}

export type AirportObstacleEnvelope = BoxAirportObstacleEnvelope | CircleAirportObstacleEnvelope;

export interface AirportObstacleValidation {
  valid: boolean;
  errors: string[];
  counts: {
    obstacles: number;
    terminals: number;
    towers: number;
  };
}

type ObstacleConfig = Pick<AirportConfig, 'scope' | 'terminal' | 'runways'>;
type TerminalConfig = Pick<AirportConfig, 'scope' | 'terminal' | 'runways'>;
type Point = [number, number];

const TERMINAL_HALF_EXTENTS: Point = [14.75, 5.1];
const TOWER_RADIUS = 4.5;
// Largest shipped aircraft footprint plus a small structure buffer. Terminal
// placement must clear this full amount, not merely the pavement edge.
const INFRASTRUCTURE_RUNWAY_GAP = 6.25;

export function resolveAirportTerminal(config: TerminalConfig): Point {
  const preferred: Point = [...config.terminal];
  const centroid = runwayCentroid(config.runways);
  const preferredDirection = normalize(subtract(preferred, centroid), [1, 0]);
  if (infrastructureClearsRunways({ ...config, terminal: preferred })) return preferred;
  for (const offset of [2, 4, 6, 8, 12, 16, 24]) {
    const candidate = add(preferred, scale(preferredDirection, offset));
    if (infrastructureClearsRunways({ ...config, terminal: candidate })) return candidate;
  }

  const baseAngle = Math.atan2(preferredDirection[1], preferredDirection[0]);
  const airportRadius = config.runways.reduce((maximum, runway) => Math.max(
    maximum,
    distance(runway.center, centroid) + runway.length / 2 + runway.width / 2,
  ), 0);
  const candidates: Point[] = [];
  for (const extra of [28, 42, 58, 76]) {
    const radius = airportRadius + extra;
    for (let offset = 0; offset < 16; offset += 1) {
      const angle = baseAngle + offset * Math.PI / 8;
      candidates.push([
        centroid[0] + Math.cos(angle) * radius,
        centroid[1] + Math.sin(angle) * radius,
      ]);
    }
  }
  return candidates.find((terminal) => infrastructureClearsRunways({ ...config, terminal })) ?? preferred;
}

export function buildAirportObstacleEnvelopes(config: ObstacleConfig): AirportObstacleEnvelope[] {
  const centroid = runwayCentroid(config.runways);
  const outward = normalize(subtract(config.terminal, centroid), [1, 0]);
  const towerDistance = config.scope === 'center' ? 58 : 45;
  const towerCenter = add(config.terminal, scale(outward, towerDistance));
  return [
    {
      id: 'TERMINAL-MAIN',
      kind: 'terminal',
      label: 'Main terminal',
      shape: 'box',
      center: roundPoint(config.terminal),
      halfExtents: TERMINAL_HALF_EXTENTS,
      minimumAltitude: 1.7,
      maximumAltitude: 7.8,
      clearance: 0.75,
    },
    {
      id: 'TOWER-MAIN',
      kind: 'control-tower',
      label: 'Control tower',
      shape: 'circle',
      center: roundPoint(towerCenter),
      radius: TOWER_RADIUS,
      minimumAltitude: 1.7,
      maximumAltitude: 16.4,
      clearance: 0.75,
    },
  ];
}

export function validateAirportObstacleEnvelopes(config: AirportConfig): AirportObstacleValidation {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const obstacle of config.obstacles) {
    if (ids.has(obstacle.id)) errors.push(`duplicate obstacle id ${obstacle.id}`);
    ids.add(obstacle.id);
    if (!Number.isFinite(obstacle.center[0]) || !Number.isFinite(obstacle.center[1])) errors.push(`${obstacle.id} has an invalid center`);
    if (obstacle.minimumAltitude >= obstacle.maximumAltitude) errors.push(`${obstacle.id} has an invalid altitude interval`);
    if (obstacle.shape === 'box' && (obstacle.halfExtents[0] <= 0 || obstacle.halfExtents[1] <= 0)) errors.push(`${obstacle.id} has invalid box extents`);
    if (obstacle.shape === 'circle' && obstacle.radius <= 0) errors.push(`${obstacle.id} has an invalid radius`);
  }

  for (const runway of config.runways) {
    const [start, end] = runwaySegment(runway);
    for (const obstacle of config.obstacles) {
      const clearance = minimumSegmentObstacleDistance(start, end, obstacle);
      if (clearance < runway.width / 2 + INFRASTRUCTURE_RUNWAY_GAP) {
        errors.push(`${obstacle.id} intersects runway ${runway.id}'s protected envelope`);
      }
    }
  }

  const nodes = new Map(config.surfaceGraph.nodes.map((node) => [node.id, node]));
  for (const edge of config.surfaceGraph.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) continue;
    for (const obstacle of config.obstacles) {
      const clearance = minimumSegmentObstacleDistance(from.position, to.position, obstacle);
      if (clearance < edge.width / 2 + obstacle.clearance) {
        errors.push(`${obstacle.id} at ${obstacle.center.join(',')} intersects surface edge ${edge.id} (${edge.name}; ${from.position.join(',')} to ${to.position.join(',')}; clearance ${clearance.toFixed(2)})`);
      }
    }
  }

  try {
    const restored = JSON.parse(JSON.stringify(config.obstacles)) as AirportObstacleEnvelope[];
    if (restored.length !== config.obstacles.length) errors.push('obstacle JSON round trip changed the envelope count');
  } catch (error) {
    errors.push(`obstacle envelopes are not JSON serializable: ${String(error)}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    counts: {
      obstacles: config.obstacles.length,
      terminals: config.obstacles.filter((obstacle) => obstacle.kind === 'terminal').length,
      towers: config.obstacles.filter((obstacle) => obstacle.kind === 'control-tower').length,
    },
  };
}

export function distanceToObstacleBoundary(point: Point, obstacle: AirportObstacleEnvelope): number {
  if (obstacle.shape === 'circle') {
    return Math.max(0, distance(point, obstacle.center) - obstacle.radius);
  }
  const x = Math.max(0, Math.abs(point[0] - obstacle.center[0]) - obstacle.halfExtents[0]);
  const y = Math.max(0, Math.abs(point[1] - obstacle.center[1]) - obstacle.halfExtents[1]);
  return Math.hypot(x, y);
}

function infrastructureClearsRunways(config: ObstacleConfig): boolean {
  const obstacles = buildAirportObstacleEnvelopes(config);
  return config.runways.every((runway) => {
    const [start, end] = runwaySegment(runway);
    return obstacles.every((obstacle) => (
      minimumSegmentObstacleDistance(start, end, obstacle) >= runway.width / 2 + INFRASTRUCTURE_RUNWAY_GAP
    ));
  });
}

function minimumSegmentObstacleDistance(start: Point, end: Point, obstacle: AirportObstacleEnvelope): number {
  const length = distance(start, end);
  const samples = Math.max(1, Math.ceil(length));
  let minimum = Infinity;
  for (let index = 0; index <= samples; index += 1) {
    const amount = index / samples;
    minimum = Math.min(minimum, distanceToObstacleBoundary([
      start[0] + (end[0] - start[0]) * amount,
      start[1] + (end[1] - start[1]) * amount,
    ], obstacle));
  }
  return minimum;
}

function runwaySegment(runway: RunwayConfig): [Point, Point] {
  const direction: Point = [Math.cos(runway.heading), Math.sin(runway.heading)];
  // Include the modeled hold-short/access lead beyond each threshold.
  const half = scale(direction, runway.length / 2 + 8);
  return [subtract(runway.center, half), add(runway.center, half)];
}

function runwayCentroid(runways: RunwayConfig[]): Point {
  if (!runways.length) return [0, 0];
  const total = runways.reduce((sum, runway) => add(sum, runway.center), [0, 0] as Point);
  return scale(total, 1 / runways.length);
}

function normalize(point: Point, fallback: Point): Point {
  const length = Math.hypot(point[0], point[1]);
  return length > 1e-6 ? [point[0] / length, point[1] / length] : fallback;
}

function roundPoint(point: Point): Point {
  return [Number(point[0].toFixed(3)), Number(point[1].toFixed(3))];
}

function add(first: Point, second: Point): Point { return [first[0] + second[0], first[1] + second[1]]; }
function subtract(first: Point, second: Point): Point { return [first[0] - second[0], first[1] - second[1]]; }
function scale(point: Point, amount: number): Point { return [point[0] * amount, point[1] * amount]; }
function distance(first: Point, second: Point): number { return Math.hypot(first[0] - second[0], first[1] - second[1]); }

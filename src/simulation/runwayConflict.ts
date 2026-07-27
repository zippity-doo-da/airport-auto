import type { AirportConfig } from './airportConfig';

const runwayConflictCaches = new WeakMap<AirportConfig, boolean[][]>();

/** Shared runway-protection geometry for scheduling and collision safety. */
export function runwaysConflict(config: AirportConfig, firstId: number, secondId: number): boolean {
  if (firstId === secondId) return true;
  let cache = runwayConflictCaches.get(config);
  if (!cache) {
    cache = [];
    runwayConflictCaches.set(config, cache);
  }
  const cached = cache[firstId]?.[secondId];
  if (cached !== undefined) return cached;
  const first = config.runways[firstId];
  const second = config.runways[secondId];
  if (!first || !second || first.role === 'inactive' || second.role === 'inactive') {
    storeRunwayConflict(cache, firstId, secondId, false);
    return false;
  }
  const firstDirection = { x: Math.cos(first.heading), y: Math.sin(first.heading) };
  const secondDirection = { x: Math.cos(second.heading), y: Math.sin(second.heading) };
  const delta = { x: second.center[0] - first.center[0], y: second.center[1] - first.center[1] };
  const cross = firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x;
  const clearance = (first.width + second.width) / 2 + 2.5;

  if (Math.abs(cross) < 0.08) {
    const lateral = Math.abs(delta.x * -firstDirection.y + delta.y * firstDirection.x);
    const longitudinal = Math.abs(delta.x * firstDirection.x + delta.y * firstDirection.y);
    const conflict = lateral < clearance && longitudinal < (first.length + second.length) / 2;
    storeRunwayConflict(cache, firstId, secondId, conflict);
    return conflict;
  }

  const firstDistance = (delta.x * secondDirection.y - delta.y * secondDirection.x) / cross;
  const secondDistance = (delta.x * firstDirection.y - delta.y * firstDirection.x) / cross;
  const conflict = Math.abs(firstDistance) <= first.length / 2 + clearance
    && Math.abs(secondDistance) <= second.length / 2 + clearance;
  storeRunwayConflict(cache, firstId, secondId, conflict);
  return conflict;
}

function storeRunwayConflict(cache: boolean[][], firstId: number, secondId: number, conflict: boolean): void {
  (cache[firstId] ??= [])[secondId] = conflict;
  (cache[secondId] ??= [])[firstId] = conflict;
}

export function intersectingRunways(config: AirportConfig, runwayId: number): number[] {
  const runway = config.runways[runwayId];
  if (!runway) return [];
  return config.runways
    .filter((other) => other.id !== runwayId && other.role !== 'inactive' && runwaysConflict(config, runwayId, other.id))
    .map((other) => other.id);
}

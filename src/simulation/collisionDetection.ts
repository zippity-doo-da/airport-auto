import type { AirportConfig } from './airportConfig';
import { aircraftProfile } from './aircraftProfiles';
import type { Flight, FlightPhase, WakeClass } from './types';
import { sampleSurfaceRoute } from './surfaceGraph';

/**
 * The renderer has a richer spline for presentation. The simulation uses this
 * deliberately conservative proxy so safety never depends on Three.js state.
 * Distances are abstract airport-world units, not nautical miles.
 */
export interface FlightProxy {
  id: number;
  x: number;
  y: number;
  altitude: number;
  radius: number;
  airborne: boolean;
  surface: boolean;
  protectedSurface: boolean;
  runway: number;
  taxiway?: string;
  surfaceNode?: string;
  surfaceEdge?: string;
}

export interface FlightConflict {
  type: 'airborne' | 'surface' | 'runway-incursion';
  first: number;
  second: number;
  horizontalDistance: number;
  verticalDistance: number;
  requiredHorizontal: number;
  detail: string;
}

const AIRBORNE_HORIZONTAL: Record<WakeClass, number> = {
  // Normalized airport-world envelopes. The wake class scales the buffer,
  // while the aircraft radii below keep small models from overlapping.
  light: 10,
  medium: 11,
  heavy: 13,
};
const AIRBORNE_VERTICAL = 4.5;
const AIR_SURFACE_HORIZONTAL = 10;
const AIR_SURFACE_ALTITUDE = 8;
const SURFACE_GAP = 1.4;

export function flightProxy(config: AirportConfig, flight: Flight, progress = flight.progress): FlightProxy {
  const runway = config.runways[flight.runway] ?? config.runways[0];
  const aircraft = aircraftProfile(flight.aircraft);
  const p = clamp(progress, 0, 1);
  const direction = { x: Math.cos(runway.heading), y: Math.sin(runway.heading) };
  const side = { x: -direction.y, y: direction.x };
  const landingSign = flight.operatingEnd;
  const takeoffSign = -landingSign as -1 | 1;
  const radius = Math.max(1.8, aircraft.visual.bodyLength * 0.38);

  if (flight.phase === 'approach') {
    const approachDistance = config.scope === 'center' ? 265 : 175;
    const along = runway.length / 2 + approachDistance * (1 - p);
    const lateral = config.scope === 'center' ? 0 : (flight.id % 2 ? 5 : -5) * (1 - p);
    return {
      id: flight.id,
      x: runway.center[0] + direction.x * landingSign * along + side.x * lateral,
      y: runway.center[1] + direction.y * landingSign * along + side.y * lateral,
      altitude: 5 + (config.scope === 'center' ? 30 : 24) * (1 - p),
      radius,
      airborne: true,
      surface: false,
      protectedSurface: false,
      runway: flight.runway,
    };
  }

  if (flight.phase === 'landing') {
    const along = landingSign * (runway.length / 2 - p * runway.length);
    return {
      id: flight.id,
      x: runway.center[0] + direction.x * along,
      y: runway.center[1] + direction.y * along,
      altitude: 2.2 + (1 - p) * 5.2,
      radius,
      airborne: p < 0.65,
      surface: p >= 0.65,
      protectedSurface: p >= 0.65,
      runway: flight.runway,
    };
  }

  if (flight.phase === 'takeoff') {
    const routeProgress = p * (0.55 + 0.45 * p);
    const distance = runway.length / 2 * (-landingSign + 2 * landingSign * routeProgress);
    const altitude = 2.2 + Math.max(0, routeProgress - 0.42) * 56;
    return {
      id: flight.id,
      x: runway.center[0] + direction.x * distance,
      y: runway.center[1] + direction.y * distance,
      altitude,
      radius,
      airborne: altitude > 8,
      surface: altitude <= 8,
      protectedSurface: true,
      runway: flight.runway,
    };
  }

  const stand = config.surfaceGraph.stands.find((item) => item.slot === flight.gateSlot);
  const standNode = stand ? config.surfaceGraph.nodes.find((node) => node.id === stand.nodeId) : undefined;
  const gate = standNode ? { x: standNode.position[0], y: standNode.position[1] } : gatePoint(config, flight.gateSlot);
  if (flight.phase === 'resting') {
    return {
      id: flight.id,
      x: gate.x,
      y: gate.y,
      altitude: 2.1,
      radius,
      airborne: false,
      surface: true,
      protectedSurface: false,
      runway: flight.runway,
      taxiway: stand?.apronTaxiwayId ?? 'APRON',
      surfaceNode: standNode?.id,
    };
  }

  const routeSample = sampleSurfaceRoute(config.surfaceGraph, flight.surfaceRoute, p);
  if (routeSample) {
    const protectedSurface = routeSample.edge?.kind === 'runway' || routeSample.edge?.kind === 'runway-access';
    return {
      id: flight.id,
      x: routeSample.x,
      y: routeSample.y,
      altitude: 2.1,
      radius,
      airborne: false,
      surface: true,
      protectedSurface,
      runway: routeSample.edge?.runwayId ?? flight.runway,
      taxiway: routeSample.edge?.taxiwayId ?? flight.taxiway,
      surfaceNode: routeSample.nearestNodeId,
      surfaceEdge: routeSample.edge?.id,
    };
  }

  const runwayAnchor = flight.phase === 'taxi-in'
    ? runwayEnd(runway, takeoffSign, -5)
    : runwayEnd(runway, landingSign, 8);
  const from = flight.phase === 'taxi-in' ? runwayAnchor : gate;
  const to = flight.phase === 'taxi-in' ? gate : runwayAnchor;
  const taxiway = flight.taxiway === 'APRON'
    ? 'APRON'
    : `${flight.taxiway ?? `RUNWAY-${flight.runway}`}#${flight.runway}`;
  return {
    id: flight.id,
    x: lerp(from.x, to.x, p),
    y: lerp(from.y, to.y, p),
    altitude: 2.1,
    radius,
    airborne: false,
    surface: true,
    protectedSurface: flight.phase === 'taxi-in' ? p < 0.3 : p > 0.7,
    runway: flight.runway,
    taxiway,
  };
}

export function detectFlightConflict(first: FlightProxy, second: FlightProxy, firstWake: WakeClass, secondWake: WakeClass, runwayConflict = first.runway === second.runway): FlightConflict | null {
  const horizontalDistance = Math.hypot(first.x - second.x, first.y - second.y);
  const verticalDistance = Math.abs(first.altitude - second.altitude);

  if (first.airborne && second.airborne) {
    const requiredHorizontal = Math.max(
      AIRBORNE_HORIZONTAL[firstWake],
      AIRBORNE_HORIZONTAL[secondWake],
      first.radius + second.radius + 2,
    );
    if (horizontalDistance < requiredHorizontal && verticalDistance < AIRBORNE_VERTICAL) {
      return {
        type: 'airborne',
        first: first.id,
        second: second.id,
        horizontalDistance,
        verticalDistance,
        requiredHorizontal,
        detail: `airborne separation compressed below ${requiredHorizontal} world units`,
      };
    }
    return null;
  }

  if (first.airborne !== second.airborne) {
    // Only a surface aircraft can create a runway incursion. An aircraft on
    // final approach should not be blocked by a gate or an unrelated apron
    // stand that happens to sit near the runway centerline.
    const surface = first.airborne ? second : first;
    if (!runwayConflict || !surface.protectedSurface) return null;
    if (horizontalDistance < AIR_SURFACE_HORIZONTAL && Math.min(first.altitude, second.altitude) < AIR_SURFACE_ALTITUDE) {
      return {
        type: 'runway-incursion',
        first: first.id,
        second: second.id,
        horizontalDistance,
        verticalDistance,
        requiredHorizontal: AIR_SURFACE_HORIZONTAL,
        detail: 'aircraft entered the protected runway/surface envelope',
      };
    }
    return null;
  }

  // A flight's assigned runway is routing metadata even while it is parked at
  // a gate. Treat it as a shared runway only while both surface proxies are
  // actually inside the protected runway envelope.
  const sameRunway = first.runway === second.runway && first.protectedSurface && second.protectedSurface;
  const sameTaxiway = Boolean(first.taxiway && second.taxiway && first.taxiway === second.taxiway);
  const sharedApron = first.taxiway === 'APRON' && second.taxiway === 'APRON';
  const requiredHorizontal = Math.max(SURFACE_GAP, first.radius + second.radius + SURFACE_GAP);
  // Different taxiway routes can visually converge near a terminal without
  // being a collision. Only apply the aircraft envelope when the flights share
  // a runway, named taxiway, or apron stand area.
  if ((sameRunway || sameTaxiway || sharedApron) && horizontalDistance < requiredHorizontal) {
    return {
      type: sameRunway ? 'runway-incursion' : 'surface',
      first: first.id,
      second: second.id,
      horizontalDistance,
      verticalDistance,
      requiredHorizontal,
      detail: sameRunway
        ? 'surface aircraft entered the same protected runway envelope'
        : 'surface aircraft envelopes overlap',
    };
  }
  return null;
}

export function findFlightConflicts(config: AirportConfig, flights: Flight[]): FlightConflict[] {
  const proxies = flights.map((flight) => ({ flight, proxy: flightProxy(config, flight) }));
  const conflicts: FlightConflict[] = [];
  for (let firstIndex = 0; firstIndex < proxies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < proxies.length; secondIndex += 1) {
      const first = proxies[firstIndex];
      const second = proxies[secondIndex];
      const conflict = detectFlightConflict(first.proxy, second.proxy, first.flight.wakeClass, second.flight.wakeClass, runwaysConflict(config, first.proxy.runway, second.proxy.runway));
      if (conflict) conflicts.push(conflict);
    }
  }
  return conflicts;
}

export function findProposedConflict(
  config: AirportConfig,
  flight: Flight,
  proposedProgress: number,
  otherFlights: Flight[],
  proposedProgressById: Map<number, number>,
): FlightConflict | null {
  const proposed = flightProxy(config, flight, proposedProgress);
  for (const other of otherFlights) {
    const otherProgress = proposedProgressById.get(other.id) ?? other.progress;
    if (other.id === flight.id) continue;
    const conflict = detectFlightConflict(
      proposed,
      flightProxy(config, other, otherProgress),
      flight.wakeClass,
      other.wakeClass,
      runwaysConflict(config, flight.runway, other.runway),
    );
    if (!conflict) continue;

    if (conflict.type === 'airborne') {
      const flightPriority = airbornePriority(flight.phase);
      const otherPriority = airbornePriority(other.phase);
      if (flightPriority > otherPriority) return conflict;
      if (flightPriority < otherPriority) continue;
      if (other.id < flight.id) return conflict;
      continue;
    }

    const currentOther = flightProxy(config, other, other.progress);
    const current = flightProxy(config, flight, flight.progress);
    const existingConflict = detectFlightConflict(
      current,
      currentOther,
      flight.wakeClass,
      other.wakeClass,
      runwaysConflict(config, flight.runway, other.runway),
    );

    const otherIsMoving = Math.abs(otherProgress - other.progress) > 1e-6;
    const currentDistance = Math.hypot(current.x - currentOther.x, current.y - currentOther.y);
    const distanceToCurrentOther = Math.hypot(proposed.x - currentOther.x, proposed.y - currentOther.y);

    // A stopped aircraft may already be close to the mover. Let the mover
    // continue only when the next step increases the gap; otherwise it must
    // yield even if it has the lower ID.
    if (!otherIsMoving) {
      if (existingConflict && distanceToCurrentOther > currentDistance + 1e-6) continue;
      return conflict;
    }
    if (other.id < flight.id) return conflict;

    // When a lower-priority aircraft is already inside the envelope, let it
    // continue only if its next step increases separation. This breaks
    // deadlocks without allowing a flight to drive/fly deeper into a conflict.
    if (existingConflict && distanceToCurrentOther <= currentDistance + 1e-6) return conflict;
    if (!existingConflict && distanceToCurrentOther < currentDistance) return conflict;
  }
  return null;
}

function airbornePriority(phase: FlightPhase): number {
  // Arrivals get the right-of-way over departures when their protected air
  // volumes converge. This mirrors the game's ATC intent: stop a takeoff
  // roll rather than force an aircraft on final to make a sharp go-around.
  if (phase === 'approach' || phase === 'landing') return 0;
  if (phase === 'takeoff') return 1;
  return 2;
}

function gatePoint(config: AirportConfig, gateSlot: number): { x: number; y: number } {
  const columns = config.scope === 'center' ? 6 : 3;
  const spacing = config.scope === 'center' ? 8.5 : 10.5;
  const sideOffset = config.scope === 'center' ? 9 : 10;
  const column = gateSlot % columns;
  const side = gateSlot < columns ? -1 : 1;
  return {
    x: config.terminal[0] + (column - (columns - 1) / 2) * spacing,
    y: config.terminal[1] + side * sideOffset,
  };
}

function runwayEnd(runway: AirportConfig['runways'][number], sign: number, beyond: number): { x: number; y: number } {
  const distance = sign * (runway.length / 2 + beyond);
  return {
    x: runway.center[0] + Math.cos(runway.heading) * distance,
    y: runway.center[1] + Math.sin(runway.heading) * distance,
  };
}

function lerp(first: number, second: number, amount: number): number {
  return first + (second - first) * amount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function phaseIsMoving(phase: FlightPhase): boolean {
  return phase !== 'resting';
}

function runwaysConflict(config: AirportConfig, firstId: number, secondId: number): boolean {
  if (firstId === secondId) return true;
  const first = config.runways[firstId];
  const second = config.runways[secondId];
  if (!first || !second || first.role === 'inactive' || second.role === 'inactive') return false;
  const firstDirection = { x: Math.cos(first.heading), y: Math.sin(first.heading) };
  const secondDirection = { x: Math.cos(second.heading), y: Math.sin(second.heading) };
  const delta = { x: second.center[0] - first.center[0], y: second.center[1] - first.center[1] };
  const cross = firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x;
  const clearance = (first.width + second.width) / 2 + 2.5;
  if (Math.abs(cross) < 0.08) {
    const lateral = Math.abs(delta.x * -firstDirection.y + delta.y * firstDirection.x);
    const longitudinal = Math.abs(delta.x * firstDirection.x + delta.y * firstDirection.y);
    return lateral < clearance && longitudinal < (first.length + second.length) / 2;
  }
  const firstDistance = (delta.x * secondDirection.y - delta.y * secondDirection.x) / cross;
  const secondDistance = (delta.x * firstDirection.y - delta.y * firstDirection.x) / cross;
  return Math.abs(firstDistance) <= first.length / 2 + clearance && Math.abs(secondDistance) <= second.length / 2 + clearance;
}

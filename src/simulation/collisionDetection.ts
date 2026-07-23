import type { AirportConfig } from './airportConfig';
import { aircraftProfile } from './aircraftProfiles';
import type { Flight, FlightPhase, WakeClass } from './types';
import { sampleSurfaceRoute } from './surfaceGraph';
import { distanceToObstacleBoundary, type AirportObstacleEnvelope } from './airportObstacles';
import { sampleFlightTrajectory } from './flightTrajectory';

/**
 * Safety samples the same renderer-independent trajectory used by the view.
 * The envelope remains deliberately conservative and never depends on a
 * Three.js object. Distances are airport-world units, not nautical miles.
 */
export interface AircraftCollisionEnvelope {
  kind: 'aircraft';
  id: number;
  x: number;
  y: number;
  altitude: number;
  heading: number;
  halfLength: number;
  halfWidth: number;
  bodyRadius: number;
  minimumAltitude: number;
  maximumAltitude: number;
  airborne: boolean;
  surface: boolean;
  protectedSurface: boolean;
  runway: number;
  taxiway?: string;
  surfaceNode?: string;
  surfaceEdge?: string;
}

export type FlightProxy = AircraftCollisionEnvelope;

export interface FlightConflict {
  type: 'airborne' | 'surface' | 'runway-incursion';
  first: number;
  second: number;
  horizontalDistance: number;
  verticalDistance: number;
  requiredHorizontal: number;
  detail: string;
}

export interface AircraftObstacleConflict {
  type: 'obstacle';
  flight: number;
  obstacle: string;
  horizontalDistance: number;
  requiredHorizontal: number;
  detail: string;
}

export type CollisionConflict = FlightConflict | AircraftObstacleConflict;

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
const PHYSICAL_GAP = 0.35;

export function aircraftCollisionEnvelope(config: AirportConfig, flight: Flight, progress = flight.progress): AircraftCollisionEnvelope {
  const runway = config.runways[flight.runway] ?? config.runways[0];
  const aircraft = aircraftProfile(flight.aircraft);
  const p = clamp(progress, 0, 1);
  const landingSign = flight.operatingEnd;
  const takeoffSign = -landingSign as -1 | 1;
  const baseScale = config.scope === 'center' ? 0.72 : 0.92;
  const approachScale = flight.phase === 'approach'
    ? lerp(baseScale * 1.3, baseScale, smoothRange(p, 0.06, 0.96))
    : baseScale;
  const takeoffScale = flight.phase === 'takeoff'
    ? lerp(baseScale, baseScale * 1.22, smoothRange(p, 0.34, 0.92))
    : baseScale;
  const presentationScale = flight.phase === 'approach' ? approachScale : takeoffScale;
  const halfLength = (aircraft.visual.bodyLength + aircraft.visual.bodyRadius * 2) / 2 * presentationScale;
  const halfWidth = aircraft.visual.wingSpan / 2 * presentationScale;
  const bodyRadius = Math.max(2.2, halfLength, halfWidth);
  const envelope = (
    values: Omit<AircraftCollisionEnvelope, 'kind' | 'id' | 'halfLength' | 'halfWidth' | 'bodyRadius' | 'minimumAltitude' | 'maximumAltitude'>,
  ): AircraftCollisionEnvelope => ({
    kind: 'aircraft',
    id: flight.id,
    halfLength,
    halfWidth,
    bodyRadius,
    minimumAltitude: values.altitude - Math.max(1.4, aircraft.visual.bodyRadius * 1.8),
    maximumAltitude: values.altitude + Math.max(1.2, aircraft.visual.tailHeight),
    ...values,
  });

  const trajectory = sampleFlightTrajectory(config, flight, p);
  if (trajectory) {
    return envelope({
      x: trajectory.x,
      y: trajectory.y,
      altitude: trajectory.z,
      heading: trajectory.heading,
      airborne: !trajectory.onGround,
      surface: trajectory.onGround,
      protectedSurface: trajectory.protectedRunway,
      runway: flight.runway,
    });
  }

  const stand = config.surfaceGraph.stands.find((item) => item.slot === flight.gateSlot);
  const standNode = stand ? config.surfaceGraph.nodes.find((node) => node.id === stand.nodeId) : undefined;
  const gate = standNode ? { x: standNode.position[0], y: standNode.position[1] } : gatePoint(config, flight.gateSlot);
  if (flight.phase === 'resting') {
    return envelope({
      x: gate.x,
      y: gate.y,
      altitude: 2.1,
      heading: stand?.heading ?? 0,
      airborne: false,
      surface: true,
      protectedSurface: false,
      runway: flight.runway,
      taxiway: stand?.apronTaxiwayId ?? 'APRON',
      surfaceNode: standNode?.id,
    });
  }

  const routeSample = sampleSurfaceRoute(config.surfaceGraph, flight.surfaceRoute, p);
  if (routeSample) {
    const protectedSurface = routeSample.edge?.kind === 'runway' || routeSample.edge?.kind === 'runway-access';
    return envelope({
      x: routeSample.x,
      y: routeSample.y,
      altitude: 2.1,
      heading: surfaceRouteHeading(config, flight, p),
      airborne: false,
      surface: true,
      protectedSurface,
      runway: routeSample.edge?.runwayId ?? flight.runway,
      taxiway: routeSample.edge?.taxiwayId ?? flight.taxiway,
      surfaceNode: routeSample.nearestNodeId,
      surfaceEdge: routeSample.edge?.id,
    });
  }

  const runwayAnchor = flight.phase === 'taxi-in'
    ? runwayEnd(runway, takeoffSign, -5)
    : runwayEnd(runway, landingSign, 8);
  const from = flight.phase === 'taxi-in' ? runwayAnchor : gate;
  const to = flight.phase === 'taxi-in' ? gate : runwayAnchor;
  const taxiway = flight.taxiway === 'APRON'
    ? 'APRON'
    : `${flight.taxiway ?? `RUNWAY-${flight.runway}`}#${flight.runway}`;
  return envelope({
    x: lerp(from.x, to.x, p),
    y: lerp(from.y, to.y, p),
    altitude: 2.1,
    heading: Math.atan2(to.y - from.y, to.x - from.x),
    airborne: false,
    surface: true,
    protectedSurface: flight.phase === 'taxi-in' ? p < 0.3 : p > 0.7,
    runway: flight.runway,
    taxiway,
  });
}

export const flightProxy = aircraftCollisionEnvelope;

export function detectFlightConflict(first: FlightProxy, second: FlightProxy, firstWake: WakeClass, secondWake: WakeClass, runwayConflict = first.runway === second.runway): FlightConflict | null {
  const horizontalDistance = Math.hypot(first.x - second.x, first.y - second.y);
  const verticalDistance = Math.abs(first.altitude - second.altitude);
  const physicalRequired = first.bodyRadius + second.bodyRadius + PHYSICAL_GAP;
  const physicalVerticalOverlap = first.minimumAltitude < second.maximumAltitude
    && first.maximumAltitude > second.minimumAltitude;
  if (horizontalDistance < physicalRequired && physicalVerticalOverlap) {
    const sameProtectedRunway = first.runway === second.runway && first.protectedSurface && second.protectedSurface;
    const type = first.airborne && second.airborne
      ? 'airborne'
      : first.airborne !== second.airborne || sameProtectedRunway
        ? 'runway-incursion'
        : 'surface';
    return {
      type,
      first: first.id,
      second: second.id,
      horizontalDistance,
      verticalDistance,
      requiredHorizontal: physicalRequired,
      detail: 'physical aircraft envelopes overlap',
    };
  }

  if (first.airborne && second.airborne) {
    // Independent parallel runway streams may be closer laterally than an
    // in-trail wake interval while remaining physically separated. Wake and
    // compression spacing applies only to the same or intersecting runway
    // system; the physical envelope check above still applies globally.
    if (!runwayConflict) return null;
    const requiredHorizontal = Math.max(
      AIRBORNE_HORIZONTAL[firstWake],
      AIRBORNE_HORIZONTAL[secondWake],
      first.bodyRadius + second.bodyRadius + 2,
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
  const requiredHorizontal = Math.max(SURFACE_GAP, first.bodyRadius + second.bodyRadius + SURFACE_GAP);
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

export function detectAircraftObstacleConflict(
  aircraft: AircraftCollisionEnvelope,
  obstacle: AirportObstacleEnvelope,
): AircraftObstacleConflict | null {
  const verticalOverlap = aircraft.minimumAltitude < obstacle.maximumAltitude
    && aircraft.maximumAltitude > obstacle.minimumAltitude;
  if (!verticalOverlap) return null;
  const horizontalDistance = distanceToObstacleBoundary([aircraft.x, aircraft.y], obstacle);
  const requiredHorizontal = aircraft.bodyRadius + obstacle.clearance;
  if (horizontalDistance >= requiredHorizontal) return null;
  return {
    type: 'obstacle',
    flight: aircraft.id,
    obstacle: obstacle.id,
    horizontalDistance,
    requiredHorizontal,
    detail: `aircraft envelope overlaps ${obstacle.label}`,
  };
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

export function findObstacleConflicts(config: AirportConfig, flights: Flight[]): AircraftObstacleConflict[] {
  const conflicts: AircraftObstacleConflict[] = [];
  for (const flight of flights) {
    const aircraft = aircraftCollisionEnvelope(config, flight);
    for (const obstacle of config.obstacles) {
      const conflict = detectAircraftObstacleConflict(aircraft, obstacle);
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
): CollisionConflict | null {
  const proposed = aircraftCollisionEnvelope(config, flight, proposedProgress);
  const current = aircraftCollisionEnvelope(config, flight, flight.progress);
  for (const obstacle of config.obstacles) {
    const conflict = detectAircraftObstacleConflict(proposed, obstacle);
    if (!conflict) continue;
    const existing = detectAircraftObstacleConflict(current, obstacle);
    if (existing && conflict.horizontalDistance > existing.horizontalDistance + 1e-6) continue;
    return conflict;
  }
  for (const other of otherFlights) {
    const otherProgress = proposedProgressById.get(other.id) ?? other.progress;
    if (other.id === flight.id) continue;
    const conflict = detectFlightConflict(
      proposed,
      aircraftCollisionEnvelope(config, other, otherProgress),
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

    const currentOther = aircraftCollisionEnvelope(config, other, other.progress);
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

function surfaceRouteHeading(config: AirportConfig, flight: Flight, progress: number): number {
  const before = sampleSurfaceRoute(config.surfaceGraph, flight.surfaceRoute, clamp(progress - 0.002, 0, 1));
  const after = sampleSurfaceRoute(config.surfaceGraph, flight.surfaceRoute, clamp(progress + 0.002, 0, 1));
  if (!before || !after) return 0;
  const x = after.x - before.x;
  const y = after.y - before.y;
  return Math.hypot(x, y) > 1e-6 ? Math.atan2(y, x) : 0;
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

function smoothRange(value: number, start: number, end: number): number {
  const amount = clamp((value - start) / Math.max(0.0001, end - start), 0, 1);
  return amount * amount * (3 - 2 * amount);
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

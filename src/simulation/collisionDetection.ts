import type { AirportConfig } from './airportConfig';
import { aircraftProfile, type AircraftModel } from './aircraftProfiles';
import type { Flight, FlightPhase, WakeClass } from './types';
import { sampleSurfaceRouteWithEdges } from './surfaceGraph';
import { distanceToObstacleBoundary, type AirportObstacleEnvelope } from './airportObstacles';
import { sampleFlightTrajectory } from './flightTrajectory';
import { runwaysConflict } from './runwayConflict';
import { sampleFlightMotion } from './flightMotion';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';

/**
 * Safety samples the same renderer-independent trajectory used by the view.
 * The envelope remains deliberately conservative and never depends on a
 * Three.js object. This module is the final physical-overlap/protected-zone
 * safety net; regulatory-style NM/ft separation is evaluated independently
 * by separationRules.ts. Internal coordinates convert through
 * WORLD_METERS_PER_UNIT whenever they are presented to a controller.
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
export const PHYSICAL_GAP = 0.35;
const COMMITTED_SWEEP_SEGMENTS = 96;

interface CommittedSweepCache {
  key: string;
  envelopes: AircraftCollisionEnvelope[];
}

const committedSweepCaches = new WeakMap<Flight, CommittedSweepCache>();

export function parkedAircraftBodyRadius(scope: AirportConfig['scope'], model: AircraftModel): number {
  const visual = aircraftProfile(model).visual;
  const scale = scope === 'center' ? 0.17 : 0.92;
  return Math.max(
    visual.bodyRadius * scale,
    (visual.bodyLength + visual.bodyRadius * 2) / 2 * scale,
    visual.wingSpan / 2 * scale,
  );
}

export function aircraftCollisionEnvelope(config: AirportConfig, flight: Flight, progress = flight.progress): AircraftCollisionEnvelope {
  const runway = config.runways[flight.runway] ?? config.runways[0];
  const aircraft = aircraftProfile(flight.aircraft);
  const p = clamp(progress, 0, 1);
  const landingSign = flight.operatingEnd;
  const takeoffSign = -landingSign as -1 | 1;
  const baseScale = config.scope === 'center' ? 0.17 : 0.92;
  const approachScale = flight.phase === 'approach'
    ? lerp(baseScale * 1.3, baseScale, smoothRange(p, 0.06, 0.96))
    : baseScale;
  const takeoffScale = flight.phase === 'takeoff'
    ? lerp(baseScale, baseScale * 1.22, smoothRange(p, 0.34, 0.92))
    : baseScale;
  const presentationScale = flight.phase === 'approach' ? approachScale : takeoffScale;
  const halfLength = (aircraft.visual.bodyLength + aircraft.visual.bodyRadius * 2) / 2 * presentationScale;
  const halfWidth = aircraft.visual.wingSpan / 2 * presentationScale;
  // Presentation aircraft are intentionally a little oversized at hub scale,
  // but the safety proxy must still follow the model itself rather than a
  // fixed airport-wide circle. The old 0.92-unit minimum made two regional
  // aircraft on separate O'Hare centerlines appear physically overlapped from
  // roughly 80 metres apart and could freeze otherwise valid parallel flows.
  const bodyRadius = Math.max(aircraft.visual.bodyRadius * presentationScale, halfLength, halfWidth);
  const envelope = (
    values: Omit<AircraftCollisionEnvelope, 'kind' | 'id' | 'halfLength' | 'halfWidth' | 'bodyRadius' | 'minimumAltitude' | 'maximumAltitude'>,
  ): AircraftCollisionEnvelope => ({
    kind: 'aircraft',
    id: flight.id,
    halfLength,
    halfWidth,
    bodyRadius,
    minimumAltitude: values.altitude - Math.max(config.scope === 'center' ? 0.35 : 1.4, aircraft.visual.bodyRadius * 1.8 * presentationScale),
    maximumAltitude: values.altitude + Math.max(config.scope === 'center' ? 0.32 : 1.2, aircraft.visual.tailHeight * presentationScale),
    ...values,
  });

  const trajectory = sampleFlightTrajectory(config, flight, p);
  if (trajectory) {
    // The orthographic renderer compresses altitude for readability. Expand
    // airborne Z for safety math so an aircraft hundreds of feet above an
    // apron is not treated as physically touching ground traffic below it.
    const motion = Math.abs(p - flight.progress) < 1e-9 && flight.motion
      ? flight.motion
      : sampleFlightMotion(config, flight, p);
    const safetyAltitude = motion.onGround ? motion.z : 2 + (motion.z - 2) * 3;
    return envelope({
      x: motion.x,
      y: motion.y,
      altitude: safetyAltitude,
      heading: motion.heading,
      airborne: !motion.onGround,
      surface: motion.onGround,
      protectedSurface: motion.protectedRunway,
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

  const routeSample = sampleSurfaceRouteWithEdges(config.surfaceGraph, flight.surfaceRoute, flight.surfaceRouteEdges, p);
  if (routeSample) {
    const motion = Math.abs(p - flight.progress) < 1e-9 && flight.motion
      ? flight.motion
      : sampleFlightMotion(config, flight, p);
    const protectedSurface = routeSample.edge?.kind === 'runway' || routeSample.edge?.kind === 'runway-access';
    return envelope({
      x: motion.x,
      y: motion.y,
      altitude: 2.1,
      heading: motion.heading,
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

export function detectFlightConflict(
  first: FlightProxy,
  second: FlightProxy,
  firstWake: WakeClass,
  secondWake: WakeClass,
  runwayConflict = first.runway === second.runway,
  includeOperationalSurfaceSeparation = true,
): FlightConflict | null {
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
        detail: `collision-avoidance envelope compressed below ${Math.round(requiredHorizontal * WORLD_METERS_PER_UNIT)} m`,
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
  if (includeOperationalSurfaceSeparation && (sameRunway || sameTaxiway || sharedApron) && horizontalDistance < requiredHorizontal) {
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

/**
 * Reserve the horizontal wing sweep of a committed runway operation for
 * surface traffic. This deliberately ignores momentary vertical-envelope
 * gaps during rotation/flare; a taxi hold must not flicker as the aircraft
 * transitions between on-ground and airborne trajectory stages.
 */
export function detectCommittedRunwaySweepConflict(
  surface: FlightProxy,
  trajectory: FlightProxy,
): FlightConflict | null {
  if (!surface.surface || !trajectory.protectedSurface) return null;
  const horizontalDistance = Math.hypot(surface.x - trajectory.x, surface.y - trajectory.y);
  const requiredHorizontal = surface.bodyRadius + trajectory.bodyRadius + PHYSICAL_GAP;
  if (horizontalDistance >= requiredHorizontal) return null;
  return {
    type: 'runway-incursion',
    first: surface.id,
    second: trajectory.id,
    horizontalDistance,
    verticalDistance: Math.abs(surface.altitude - trajectory.altitude),
    requiredHorizontal,
    detail: 'surface aircraft would enter the committed runway wing sweep',
  };
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
      // Diagnostics and collision alerts report actual envelope breaches,
      // runway incursions, and airborne separation loss. The wider taxi
      // sequencing buffer is enforced prospectively by findProposedConflict;
      // reporting a safely diverging merge as a collision would be misleading.
      const conflict = detectFlightConflict(
        first.proxy,
        second.proxy,
        first.flight.wakeClass,
        second.flight.wakeClass,
        runwaysConflict(config, first.proxy.runway, second.proxy.runway),
        false,
      );
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
  resolvedFlightIds?: ReadonlySet<number>,
  surfaceMergeYieldById?: Map<number, number>,
): CollisionConflict | null {
  const proposed = aircraftCollisionEnvelope(config, flight, proposedProgress);
  const current = aircraftCollisionEnvelope(config, flight, flight.progress);
  const mergeWinnerId = surfaceMergeYieldById?.get(flight.id);
  if (mergeWinnerId !== undefined) {
    const winner = otherFlights.find((other) => other.id === mergeWinnerId);
    if (winner) {
      const winnerProgress = proposedProgressById.get(winner.id) ?? winner.progress;
      const winnerEnvelope = aircraftCollisionEnvelope(config, winner, winnerProgress);
      return {
        type: 'surface',
        first: flight.id,
        second: winner.id,
        horizontalDistance: Math.hypot(proposed.x - winnerEnvelope.x, proposed.y - winnerEnvelope.y),
        verticalDistance: Math.abs(proposed.altitude - winnerEnvelope.altitude),
        requiredHorizontal: proposed.bodyRadius + winnerEnvelope.bodyRadius + SURFACE_GAP,
        detail: `yielding junction movement to flight ${winner.id}`,
      };
    }
  }
  for (const obstacle of config.obstacles) {
    const conflict = detectAircraftObstacleConflict(proposed, obstacle);
    if (!conflict) continue;
    const existing = detectAircraftObstacleConflict(current, obstacle);
    if (existing && conflict.horizontalDistance > existing.horizontalDistance + 1e-6) continue;
    return conflict;
  }

  // A taxiing aircraft must not enter any part of a runway trajectory that is
  // already committed. Looking only one simulation step ahead is too late for
  // a fast departure overtaking a slow aircraft on a closely spaced parallel
  // taxiway: the taxi aircraft can stop, but the takeoff roll cannot. Reserve
  // the remaining physical sweep here and let the surface mover wait outside
  // it until the landing or departure has passed.
  if (flight.phase === 'taxi-in' || flight.phase === 'taxi-out') {
    for (const other of otherFlights) {
      if (other.id === flight.id || (other.phase !== 'approach' && other.phase !== 'landing' && other.phase !== 'takeoff')) continue;
      for (const protectedFutureEnvelope of committedRunwaySweep(config, other)) {
        const conflict = detectFlightConflict(
          proposed,
          protectedFutureEnvelope,
          flight.wakeClass,
          other.wakeClass,
          runwaysConflict(config, flight.runway, other.runway),
          false,
        );
        if (conflict) return conflict;
        const sweepConflict = detectCommittedRunwaySweepConflict(proposed, protectedFutureEnvelope);
        if (sweepConflict) return sweepConflict;
      }
    }
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

    // Airborne operations, landing rollouts, and takeoff rolls are continuous
    // trajectories: freezing one in place is neither safe nor believable.
    // They are resolved before surface movers, which will see the committed
    // trajectory and yield on their own arbitration pass.
    const committedTrajectory = flight.phase === 'approach'
      || flight.phase === 'landing'
      || flight.phase === 'takeoff';
    const otherIsSurfaceMovement = other.phase === 'taxi-in' || other.phase === 'taxi-out';
    if (committedTrajectory && otherIsSurfaceMovement) continue;

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
    const physicallyClear = conflict.horizontalDistance
      >= proposed.bodyRadius + currentOther.bodyRadius + PHYSICAL_GAP;

    // A stopped aircraft may already be close to the mover. Let the mover
    // continue when the next step increases the gap and remains physically
    // clear. This also covers a merge where the sampled taxiway label changes
    // at the node: operational separation can appear on that exact tick even
    // though the aircraft is already travelling away from the stopped body.
    if (!otherIsMoving) {
      if (
        conflict.type === 'surface'
        && physicallyClear
        && distanceToCurrentOther > currentDistance + 1e-6
      ) continue;
      // Two routes can approach the same junction on a shared taxiway name,
      // then peel onto separate connector centerlines. A one-tick envelope
      // check can stop both aircraft just before that turn even though the
      // earlier-arbitrated movement has a physically clear path through the
      // merge. Let exactly one movement traverse that short
      // operational buffer when every sampled pose remains outside the hard
      // aircraft envelope and the route demonstrably leaves the shared
      // taxiway. Once it is accepted, the later candidate sees it moving and
      // stays stopped, so this cannot become a head-on pass or weaken runway
      // protection. If the first path is not physically clear, the later
      // candidate may still clear via its own connector.
      if (
        conflict.type === 'surface'
        && physicallyClear
        && surfaceMergeEscapeIsClear(config, flight, proposedProgress, current, currentOther, currentDistance)
      ) {
        surfaceMergeYieldById?.set(other.id, flight.id);
        continue;
      }
      if (existingConflict && distanceToCurrentOther > currentDistance + 1e-6) continue;
      return conflict;
    }
    if (resolvedFlightIds?.has(other.id)) {
      if (existingConflict && conflict.horizontalDistance > existingConflict.horizontalDistance + 1e-6) continue;
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

/**
 * Cache the high-resolution runway-trajectory sweep for all surface movers in
 * the same authority tick. Keeping the established 96-segment controller
 * buffer avoids over-inflating a parallel runway sweep, while sharing it
 * removes the former surface-mover × trajectory recomputation cost.
 */
function committedRunwaySweep(config: AirportConfig, flight: Flight): AircraftCollisionEnvelope[] {
  const key = [
    flight.phase,
    flight.progress,
    flight.runway,
    flight.operatingEnd,
    flight.goAround?.startedAt ?? '',
    flight.navigation.assignedHeadingDegrees ?? '',
    flight.navigation.routeFixIds.join(','),
  ].join(':');
  const cached = committedSweepCaches.get(flight);
  if (cached?.key === key) return cached.envelopes;
  const landingPreview: Flight | undefined = flight.phase === 'approach'
    ? {
        ...flight,
        phase: 'landing',
        progress: 0,
        phaseElapsed: 0,
        motion: { ...flight.motion },
        kinematics: { ...flight.kinematics },
      }
    : undefined;
  if (landingPreview) landingPreview.motion = sampleFlightMotion(config, landingPreview, 0);
  const controllerBuffer = config.scope === 'center' ? 0.35 : 1.2;
  const envelopes: AircraftCollisionEnvelope[] = [];
  for (const trajectory of landingPreview ? [flight, landingPreview] : [flight]) {
    const startProgress = trajectory === flight ? flight.progress : 0;
    for (let sampleIndex = 0; sampleIndex <= COMMITTED_SWEEP_SEGMENTS; sampleIndex += 1) {
      const futureProgress = startProgress + (1 - startProgress) * sampleIndex / COMMITTED_SWEEP_SEGMENTS;
      const envelope = aircraftCollisionEnvelope(config, trajectory, futureProgress);
      envelopes.push({ ...envelope, bodyRadius: envelope.bodyRadius + controllerBuffer });
    }
  }
  committedSweepCaches.set(flight, { key, envelopes });
  return envelopes;
}

function surfaceMergeEscapeIsClear(
  config: AirportConfig,
  flight: Flight,
  proposedProgress: number,
  current: AircraftCollisionEnvelope,
  stationary: AircraftCollisionEnvelope,
  currentDistance: number,
): boolean {
  if (
    current.protectedSurface
    || stationary.protectedSurface
    || !current.taxiway
    || current.taxiway !== stationary.taxiway
  ) return false;
  const routeDistanceM = flight.motion.totalDistanceM;
  if (!Number.isFinite(routeDistanceM) || routeDistanceM <= 0) return false;
  const endProgress = Math.min(1, Math.max(proposedProgress, flight.progress + 240 / routeDistanceM));
  if (endProgress <= proposedProgress + 1e-9) return false;

  let leftSharedTaxiway = false;
  let endDistance = currentDistance;
  const samples = 48;
  for (let index = 1; index <= samples; index += 1) {
    const progress = proposedProgress + (endProgress - proposedProgress) * index / samples;
    const candidate = aircraftCollisionEnvelope(config, flight, progress);
    if (candidate.protectedSurface) return false;
    if (candidate.taxiway && candidate.taxiway !== current.taxiway) leftSharedTaxiway = true;
    const distance = Math.hypot(candidate.x - stationary.x, candidate.y - stationary.y);
    const verticalOverlap = candidate.minimumAltitude < stationary.maximumAltitude
      && candidate.maximumAltitude > stationary.minimumAltitude;
    if (verticalOverlap && distance < candidate.bodyRadius + stationary.bodyRadius + PHYSICAL_GAP) return false;
    endDistance = distance;
  }
  return leftSharedTaxiway && endDistance > currentDistance + 0.2;
}

function airbornePriority(phase: FlightPhase): number {
  // Arrivals receive sequencing priority before a departure is committed.
  // Once either trajectory is active, upstream runway protection is expected
  // to keep the envelopes apart rather than pausing an aircraft in motion.
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

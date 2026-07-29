import type { AirportConfig } from './airportConfig';
import { aircraftProfile, type AircraftModel } from './aircraftProfiles';
import type { Flight, FlightPhase, WakeClass } from './types';
import { sampleSurfaceRouteWithEdges, surfaceNodeIndex, surfaceStandBySlot } from './surfaceGraph';
import { distanceToObstacleBoundary, type AirportObstacleEnvelope } from './airportObstacles';
import { phaseUsesFlightTrajectory } from './flightTrajectory';
import { runwaysConflict } from './runwayConflict';
import { sampleFlightMotion } from './flightMotion';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';
import { flightHasCommittedRunwayTrajectory } from './runwayProtection';

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
  /** Parked at a stand: protect the physical aircraft, not active-mover spacing. */
  parked: boolean;
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
// Reuse the earliest remaining committed trajectory inside a small monotonic
// progress bucket. A cached sweep can include pavement already vacated but can
// never omit future movement, so the lower rebuild rate is conservative.
const COMMITTED_SWEEP_PROGRESS_BUCKETS = 64;

interface CommittedSweepCache {
  key: string;
  sweep: CommittedRunwaySweep;
}

interface CommittedRunwaySweep {
  envelopes: AircraftCollisionEnvelope[];
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
  maximumBodyRadius: number;
}

const committedSweepCaches = new WeakMap<Flight, CommittedSweepCache>();

interface ObstacleConflictCache {
  config: AirportConfig;
  x: number;
  y: number;
  minimumAltitude: number;
  maximumAltitude: number;
  bodyRadius: number;
  conflicts: AircraftObstacleConflict[];
}

const obstacleConflictCaches = new WeakMap<Flight, ObstacleConflictCache>();
const obstacleBoundsCaches = new WeakMap<AirportObstacleEnvelope, {
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
}>();

interface CollisionEnvelopeSampleCache {
  epoch: number;
  samples: Map<number, AircraftCollisionEnvelope>;
}

const collisionEnvelopeSampleCaches = new WeakMap<Flight, CollisionEnvelopeSampleCache>();
let collisionSamplingEpoch = 0;
let collisionSamplingActive = false;

export interface CollisionPerformanceTrace {
  envelopeRequests: number;
  envelopeCacheHits: number;
  envelopeComputations: number;
  proposedCalls: number;
  obstacleCandidateChecks: number;
  committedSweepRequests: number;
  committedSweepCacheHits: number;
  committedSweepBuilds: number;
  committedSweepEnvelopeSamples: number;
  committedSweepEnvelopeChecks: number;
  flightPairChecks: number;
  mergeEscapeCalls: number;
  mergeEscapeEnvelopeSamples: number;
}

let collisionPerformanceTrace: CollisionPerformanceTrace | null = null;

export function beginCollisionPerformanceTrace(): void {
  collisionPerformanceTrace = {
    envelopeRequests: 0,
    envelopeCacheHits: 0,
    envelopeComputations: 0,
    proposedCalls: 0,
    obstacleCandidateChecks: 0,
    committedSweepRequests: 0,
    committedSweepCacheHits: 0,
    committedSweepBuilds: 0,
    committedSweepEnvelopeSamples: 0,
    committedSweepEnvelopeChecks: 0,
    flightPairChecks: 0,
    mergeEscapeCalls: 0,
    mergeEscapeEnvelopeSamples: 0,
  };
}

export function endCollisionPerformanceTrace(): CollisionPerformanceTrace | null {
  const trace = collisionPerformanceTrace;
  collisionPerformanceTrace = null;
  return trace ? { ...trace } : null;
}

/** Share immutable pose envelopes inside one collision-arbitration pass. */
export function beginAircraftCollisionSamplingFrame(): void {
  collisionSamplingEpoch += 1;
  collisionSamplingActive = true;
}

export function endAircraftCollisionSamplingFrame(): void {
  collisionSamplingActive = false;
}

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
  if (collisionPerformanceTrace) collisionPerformanceTrace.envelopeRequests += 1;
  const p = clamp(progress, 0, 1);
  if (collisionSamplingActive) {
    const cached = collisionEnvelopeSampleCaches.get(flight);
    const result = cached?.epoch === collisionSamplingEpoch
      ? cached.samples.get(p)
      : undefined;
    if (result) {
      if (collisionPerformanceTrace) collisionPerformanceTrace.envelopeCacheHits += 1;
      return result;
    }
  }
  if (collisionPerformanceTrace) collisionPerformanceTrace.envelopeComputations += 1;
  const aircraft = aircraftProfile(flight.aircraft);
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
  const sampled = (result: AircraftCollisionEnvelope): AircraftCollisionEnvelope => {
    if (!collisionSamplingActive) return result;
    const cached = collisionEnvelopeSampleCaches.get(flight);
    if (cached?.epoch === collisionSamplingEpoch) cached.samples.set(p, result);
    else collisionEnvelopeSampleCaches.set(flight, {
      epoch: collisionSamplingEpoch,
      samples: new Map([[p, result]]),
    });
    return result;
  };

  if (phaseUsesFlightTrajectory(flight.phase)) {
    // The orthographic renderer compresses altitude for readability. Expand
    // airborne Z for safety math so an aircraft hundreds of feet above an
    // apron is not treated as physically touching ground traffic below it.
    const motion = Math.abs(p - flight.progress) < 1e-9 && flight.motion
      ? flight.motion
      : sampleFlightMotion(config, flight, p);
    const safetyAltitude = motion.onGround ? motion.z : 2 + (motion.z - 2) * 3;
    return sampled(envelope({
      x: motion.x,
      y: motion.y,
      altitude: safetyAltitude,
      heading: motion.heading,
      airborne: !motion.onGround,
      surface: motion.onGround,
      parked: false,
      protectedSurface: motion.protectedRunway,
      runway: flight.runway,
    }));
  }

  const stand = surfaceStandBySlot(config.surfaceGraph, flight.gateSlot);
  const standNode = stand ? surfaceNodeIndex(config.surfaceGraph).get(stand.nodeId) : undefined;
  const gate = standNode ? { x: standNode.position[0], y: standNode.position[1] } : gatePoint(config, flight.gateSlot);
  if (flight.phase === 'resting') {
    return sampled(envelope({
      x: gate.x,
      y: gate.y,
      altitude: 2.1,
      heading: stand?.heading ?? 0,
      airborne: false,
      surface: true,
      parked: true,
      protectedSurface: false,
      runway: flight.runway,
      taxiway: stand?.apronTaxiwayId ?? 'APRON',
      surfaceNode: standNode?.id,
    }));
  }

  const routeSample = sampleSurfaceRouteWithEdges(config.surfaceGraph, flight.surfaceRoute, flight.surfaceRouteEdges, p);
  if (routeSample) {
    const motion = Math.abs(p - flight.progress) < 1e-9 && flight.motion
      ? flight.motion
      : sampleFlightMotion(config, flight, p);
    const protectedSurface = routeSample.edge?.kind === 'runway' || routeSample.edge?.kind === 'runway-access';
    return sampled(envelope({
      x: motion.x,
      y: motion.y,
      altitude: 2.1,
      heading: motion.heading,
      airborne: false,
      surface: true,
      parked: false,
      protectedSurface,
      runway: routeSample.edge?.runwayId ?? flight.runway,
      taxiway: routeSample.edge?.taxiwayId ?? flight.taxiway,
      surfaceNode: routeSample.nearestNodeId,
      surfaceEdge: routeSample.edge?.id,
    }));
  }

  // A missing surface route is a planning failure, not permission to invent a
  // straight gate-to-runway path. Hold the physical envelope at the last
  // authoritative pose until a graph route is assigned; this keeps collision
  // diagnostics aligned with the rendered/simulated aircraft and prevents
  // phantom grass or runway crossings.
  const motion = Math.abs(p - flight.progress) < 1e-9 && flight.motion
    ? flight.motion
    : sampleFlightMotion(config, flight, p);
  return sampled(envelope({
    x: motion.x,
    y: motion.y,
    altitude: 2.1,
    heading: motion.heading,
    airborne: false,
    surface: true,
    parked: false,
    protectedSurface: false,
    runway: flight.runway,
    taxiway: 'NO-ROUTE-HOLD',
    surfaceNode: standNode?.id,
  }));
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
  const bothActiveMovers = !first.parked && !second.parked;
  const sameTaxiway = bothActiveMovers
    && Boolean(first.taxiway && second.taxiway && first.taxiway === second.taxiway);
  const sharedApron = bothActiveMovers && first.taxiway === 'APRON' && second.taxiway === 'APRON';
  const requiredHorizontal = Math.max(SURFACE_GAP, first.bodyRadius + second.bodyRadius + SURFACE_GAP);
  // Different taxiway routes can visually converge near a terminal without
  // being a collision. Only apply active-mover spacing when the flights share
  // a runway, named taxiway, or apron movement area. A parked aircraft is a
  // static obstacle: the physical test above still protects its complete
  // presentation envelope, but it must not behave like a taxiing predecessor
  // and hold an adjacent ramp lane indefinitely.
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

/**
 * Close the space between sampled committed-trajectory envelopes. A fast
 * runway roll can travel farther than one presentation radius between sweep
 * samples; point-only tests can then stop a taxiing aircraft inside that
 * narrow gap even though the continuous centerline later passes through it.
 */
export function detectCommittedRunwaySweepSegmentConflict(
  surface: FlightProxy,
  from: FlightProxy,
  to: FlightProxy,
): FlightConflict | null {
  if (!surface.surface || (!from.protectedSurface && !to.protectedSurface)) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared <= 1e-12
    ? 0
    : clamp(((surface.x - from.x) * dx + (surface.y - from.y) * dy) / lengthSquared, 0, 1);
  const nearestX = from.x + dx * amount;
  const nearestY = from.y + dy * amount;
  const horizontalDistance = Math.hypot(surface.x - nearestX, surface.y - nearestY);
  // Using the larger endpoint is conservative through scale transitions and
  // keeps the swept tube continuous when an aircraft flares or rotates.
  const requiredHorizontal = surface.bodyRadius + Math.max(from.bodyRadius, to.bodyRadius) + PHYSICAL_GAP;
  if (horizontalDistance >= requiredHorizontal) return null;
  return {
    type: 'runway-incursion',
    first: surface.id,
    second: from.id,
    horizontalDistance,
    verticalDistance: Math.min(
      Math.abs(surface.altitude - from.altitude),
      Math.abs(surface.altitude - to.altitude),
    ),
    requiredHorizontal,
    detail: 'surface aircraft would enter the continuous committed runway wing sweep',
  };
}

export function detectAircraftObstacleConflict(
  aircraft: AircraftCollisionEnvelope,
  obstacle: AirportObstacleEnvelope,
): AircraftObstacleConflict | null {
  const verticalOverlap = aircraft.minimumAltitude < obstacle.maximumAltitude
    && aircraft.maximumAltitude > obstacle.minimumAltitude;
  if (!verticalOverlap) return null;
  const bounds = obstacleBounds(obstacle);
  const broadPhaseRadius = aircraft.bodyRadius + obstacle.clearance;
  if (
    aircraft.x < bounds.minimumX - broadPhaseRadius
    || aircraft.x > bounds.maximumX + broadPhaseRadius
    || aircraft.y < bounds.minimumY - broadPhaseRadius
    || aircraft.y > bounds.maximumY + broadPhaseRadius
  ) return null;
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
    const cached = obstacleConflictCaches.get(flight);
    if (
      cached?.config === config
      && cached.x === aircraft.x
      && cached.y === aircraft.y
      && cached.minimumAltitude === aircraft.minimumAltitude
      && cached.maximumAltitude === aircraft.maximumAltitude
      && cached.bodyRadius === aircraft.bodyRadius
    ) {
      conflicts.push(...cached.conflicts);
      continue;
    }
    const flightConflicts: AircraftObstacleConflict[] = [];
    for (const obstacle of config.obstacles) {
      const conflict = detectAircraftObstacleConflict(aircraft, obstacle);
      if (conflict) flightConflicts.push(conflict);
    }
    obstacleConflictCaches.set(flight, {
      config,
      x: aircraft.x,
      y: aircraft.y,
      minimumAltitude: aircraft.minimumAltitude,
      maximumAltitude: aircraft.maximumAltitude,
      bodyRadius: aircraft.bodyRadius,
      conflicts: flightConflicts,
    });
    conflicts.push(...flightConflicts);
  }
  return conflicts;
}

function obstacleBounds(obstacle: AirportObstacleEnvelope): {
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
} {
  const cached = obstacleBoundsCaches.get(obstacle);
  if (cached) return cached;
  let result: { minimumX: number; maximumX: number; minimumY: number; maximumY: number };
  if (obstacle.shape === 'circle') {
    result = {
      minimumX: obstacle.center[0] - obstacle.radius,
      maximumX: obstacle.center[0] + obstacle.radius,
      minimumY: obstacle.center[1] - obstacle.radius,
      maximumY: obstacle.center[1] + obstacle.radius,
    };
  } else if (obstacle.shape === 'box') {
    result = {
      minimumX: obstacle.center[0] - obstacle.halfExtents[0],
      maximumX: obstacle.center[0] + obstacle.halfExtents[0],
      minimumY: obstacle.center[1] - obstacle.halfExtents[1],
      maximumY: obstacle.center[1] + obstacle.halfExtents[1],
    };
  } else {
    result = {
      minimumX: Math.min(...obstacle.points.map((point) => point[0])),
      maximumX: Math.max(...obstacle.points.map((point) => point[0])),
      minimumY: Math.min(...obstacle.points.map((point) => point[1])),
      maximumY: Math.max(...obstacle.points.map((point) => point[1])),
    };
  }
  obstacleBoundsCaches.set(obstacle, result);
  return result;
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
  if (collisionPerformanceTrace) collisionPerformanceTrace.proposedCalls += 1;
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
    if (collisionPerformanceTrace) collisionPerformanceTrace.obstacleCandidateChecks += 1;
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
      if (other.id === flight.id || !flightHasCommittedRunwayTrajectory(other)) continue;
      const protectedSweep = committedRunwaySweep(config, other);
      const sweepRadius = Math.max(
        AIR_SURFACE_HORIZONTAL,
        proposed.bodyRadius + protectedSweep.maximumBodyRadius + PHYSICAL_GAP,
      );
      if (
        proposed.x < protectedSweep.minimumX - sweepRadius
        || proposed.x > protectedSweep.maximumX + sweepRadius
        || proposed.y < protectedSweep.minimumY - sweepRadius
        || proposed.y > protectedSweep.maximumY + sweepRadius
      ) continue;
      let previousProtectedEnvelope: AircraftCollisionEnvelope | undefined;
      for (const protectedFutureEnvelope of protectedSweep.envelopes) {
        if (collisionPerformanceTrace) collisionPerformanceTrace.committedSweepEnvelopeChecks += 1;
        const segmentConflict = previousProtectedEnvelope
          ? detectCommittedRunwaySweepSegmentConflict(
              proposed,
              previousProtectedEnvelope,
              protectedFutureEnvelope,
            )
          : null;
        previousProtectedEnvelope = protectedFutureEnvelope;
        if (segmentConflict) return segmentConflict;
        const pairRadius = Math.max(
          AIR_SURFACE_HORIZONTAL,
          proposed.bodyRadius + protectedFutureEnvelope.bodyRadius + PHYSICAL_GAP,
        );
        if (
          Math.abs(proposed.x - protectedFutureEnvelope.x) >= pairRadius
          || Math.abs(proposed.y - protectedFutureEnvelope.y) >= pairRadius
        ) continue;
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
    if (collisionPerformanceTrace) collisionPerformanceTrace.flightPairChecks += 1;
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
function committedRunwaySweep(config: AirportConfig, flight: Flight): CommittedRunwaySweep {
  if (collisionPerformanceTrace) collisionPerformanceTrace.committedSweepRequests += 1;
  // Reuse the first (and therefore longest) remaining trajectory seen inside
  // each progress bucket. Aircraft progress is monotonic within a phase, so a
  // cached sweep can retain a few already-travelled metres but can never omit
  // the current or future protected runway path. This removes hundreds of
  // identical high-resolution motion samples from adjacent fixed ticks without
  // narrowing the collision envelope.
  const progressBucket = Math.floor(clamp(flight.progress, 0, 1) * COMMITTED_SWEEP_PROGRESS_BUCKETS);
  const key = [
    flight.phase,
    progressBucket,
    flight.runway,
    flight.operatingEnd,
    flight.goAround?.startedAt ?? '',
    flight.navigation.assignedHeadingDegrees ?? '',
    flight.navigation.routeFixIds.join(','),
  ].join(':');
  const cached = committedSweepCaches.get(flight);
  if (cached?.key === key) {
    if (collisionPerformanceTrace) collisionPerformanceTrace.committedSweepCacheHits += 1;
    return cached.sweep;
  }
  if (collisionPerformanceTrace) collisionPerformanceTrace.committedSweepBuilds += 1;
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
  let minimumX = Infinity;
  let maximumX = -Infinity;
  let minimumY = Infinity;
  let maximumY = -Infinity;
  let maximumBodyRadius = 0;
  for (const trajectory of landingPreview ? [flight, landingPreview] : [flight]) {
    const startProgress = trajectory === flight ? flight.progress : 0;
    for (let sampleIndex = 0; sampleIndex <= COMMITTED_SWEEP_SEGMENTS; sampleIndex += 1) {
      if (collisionPerformanceTrace) collisionPerformanceTrace.committedSweepEnvelopeSamples += 1;
      const futureProgress = startProgress + (1 - startProgress) * sampleIndex / COMMITTED_SWEEP_SEGMENTS;
      const envelope = aircraftCollisionEnvelope(config, trajectory, futureProgress);
      const protectedEnvelope = { ...envelope, bodyRadius: envelope.bodyRadius + controllerBuffer };
      envelopes.push(protectedEnvelope);
      minimumX = Math.min(minimumX, protectedEnvelope.x);
      maximumX = Math.max(maximumX, protectedEnvelope.x);
      minimumY = Math.min(minimumY, protectedEnvelope.y);
      maximumY = Math.max(maximumY, protectedEnvelope.y);
      maximumBodyRadius = Math.max(maximumBodyRadius, protectedEnvelope.bodyRadius);
    }
  }
  const sweep = {
    envelopes,
    minimumX,
    maximumX,
    minimumY,
    maximumY,
    maximumBodyRadius,
  };
  committedSweepCaches.set(flight, { key, sweep });
  return sweep;
}

function surfaceMergeEscapeIsClear(
  config: AirportConfig,
  flight: Flight,
  proposedProgress: number,
  current: AircraftCollisionEnvelope,
  stationary: AircraftCollisionEnvelope,
  currentDistance: number,
): boolean {
  if (collisionPerformanceTrace) collisionPerformanceTrace.mergeEscapeCalls += 1;
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
    if (collisionPerformanceTrace) collisionPerformanceTrace.mergeEscapeEnvelopeSamples += 1;
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

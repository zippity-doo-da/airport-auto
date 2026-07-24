import type { AirportConfig } from './airportConfig';
import { aircraftProfile } from './aircraftProfiles';
import { sampleFlightTrajectory } from './flightTrajectory';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';
import { surfacePushbackPlan } from './surfaceGraph';
import { sampleAircraftSurfaceMotion } from './surfaceMotion';
import type { Flight, FlightMotionState } from './types';

/** Convert the shared path definition into the simulation-owned world pose. */
export function sampleFlightMotion(
  config: AirportConfig,
  flight: Flight,
  progress = flight.progress,
): FlightMotionState {
  const amount = clamp(progress, 0, 1);
  const trajectory = sampleFlightTrajectory(config, flight, amount);
  if (trajectory) {
    return {
      x: trajectory.x,
      y: trajectory.y,
      z: trajectory.z,
      heading: trajectory.heading,
      pitch: trajectory.pitch,
      bank: trajectory.bank,
      onGround: trajectory.onGround,
      groundBlend: trajectory.groundBlend,
      protectedRunway: trajectory.protectedRunway,
      distanceAlongM: trajectory.distanceAlong * WORLD_METERS_PER_UNIT,
      totalDistanceM: trajectory.totalDistance * WORLD_METERS_PER_UNIT,
      stage: trajectory.stage,
      stageProgress: trajectory.stageProgress,
    };
  }

  const stand = config.surfaceGraph.stands.find((item) => item.slot === flight.gateSlot);
  const surface = sampleAircraftSurfaceMotion(
    config.surfaceGraph,
    flight.surfaceRoute,
    flight.surfaceRouteEdges,
    amount,
    aircraftProfile(flight.aircraft),
  );
  if (surface) {
    let heading = flight.phase === 'resting' ? stand?.heading ?? surface.heading : surface.heading;
    let stage: string = flight.phase;
    let stageProgress = amount;
    if (flight.phase === 'taxi-out') {
      const pushback = surfacePushbackPlan(config.surfaceGraph, flight.surfaceRoute, flight.surfaceRouteEdges, stand);
      if (pushback && amount <= pushback.releaseProgress + 1e-8) {
        const pushed = clamp(amount / pushback.releaseProgress, 0, 1);
        heading = lerpAngle(pushback.parkedHeading, pushback.releaseHeading, smoothstep(pushed));
        stage = 'pushback';
        stageProgress = pushed;
      } else if (pushback) {
        stageProgress = clamp((amount - pushback.releaseProgress) / (1 - pushback.releaseProgress), 0, 1);
      }
    }
    return {
      x: surface.x,
      y: surface.y,
      z: 2,
      heading,
      pitch: 0,
      bank: 0,
      onGround: true,
      groundBlend: 1,
      protectedRunway: surface.edge?.kind === 'runway' || surface.edge?.kind === 'runway-access',
      distanceAlongM: surface.distanceAlong * WORLD_METERS_PER_UNIT,
      totalDistanceM: surface.totalDistance * WORLD_METERS_PER_UNIT,
      stage,
      stageProgress,
    };
  }

  const standNode = stand ? config.surfaceGraph.nodes.find((node) => node.id === stand.nodeId) : undefined;
  return {
    x: standNode?.position[0] ?? config.terminal[0],
    y: standNode?.position[1] ?? config.terminal[1],
    z: 2,
    heading: stand?.heading ?? 0,
    pitch: 0,
    bank: 0,
    onGround: true,
    groundBlend: 1,
    protectedRunway: false,
    distanceAlongM: 0,
    totalDistanceM: 0,
    stage: flight.phase,
    stageProgress: amount,
  };
}

export function syncFlightMotion(config: AirportConfig, flight: Flight): FlightMotionState {
  const motion = sampleFlightMotion(config, flight);
  flight.motion = motion;
  return motion;
}

/**
 * Advance a monotonic path by a physical distance. This is the bridge that
 * makes airspeed/taxi speed cause movement instead of merely describing it.
 */
export function progressAfterDistance(
  config: AirportConfig,
  flight: Flight,
  distanceMeters: number,
): number {
  if (distanceMeters <= 0 || flight.progress >= 1) return flight.progress;
  const current = sampleFlightMotion(config, flight, flight.progress);
  if (current.totalDistanceM <= 0) return flight.progress;
  const target = Math.min(current.totalDistanceM, current.distanceAlongM + distanceMeters);
  if (target >= current.totalDistanceM - 0.0001) return 1;
  let low = flight.progress;
  let high = 1;
  for (let iteration = 0; iteration < 22; iteration += 1) {
    const middle = (low + high) / 2;
    const sampled = sampleFlightMotion(config, flight, middle);
    if (sampled.distanceAlongM < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value: number): number {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function lerpAngle(first: number, second: number, amount: number): number {
  return first + Math.atan2(Math.sin(second - first), Math.cos(second - first)) * amount;
}

import type { AirportConfig, RunwayConfig } from './airportConfig';
import { aircraftProfile, type AircraftModel } from './aircraftProfiles';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';
import type { Flight, FlightGoAroundState, FlightPhase, FlightRunwayExitState } from './types';
import { procedureFix } from './airspaceProcedures';

export type FlightTrajectoryStage =
  | 'edge-entry'
  | 'arrival-turn'
  | 'final'
  | 'vector'
  | 'hold-entry'
  | 'hold-outbound'
  | 'hold-turn'
  | 'hold-inbound'
  | 'go-around-climb'
  | 'go-around-turn'
  | 'go-around-reentry'
  | 'flare'
  | 'touchdown'
  | 'rollout'
  | 'runway-exit'
  | 'lineup'
  | 'takeoff-roll'
  | 'rotation'
  | 'climbout';

export interface FlightTrajectorySample {
  x: number;
  y: number;
  /** Renderer track height. Ground contact is added from groundBlend by the view. */
  z: number;
  heading: number;
  /** Positive values mean nose-up. */
  pitch: number;
  /** Positive values bank toward the aircraft's right wing. */
  bank: number;
  onGround: boolean;
  groundBlend: number;
  protectedRunway: boolean;
  stage: FlightTrajectoryStage;
  stageProgress: number;
  distanceAlong: number;
  totalDistance: number;
}

export interface LandingTrajectoryTiming {
  flareSeconds: number;
  brakingSeconds: number;
  exitSeconds: number;
  totalSeconds: number;
}

export interface DepartureTrajectoryTiming {
  lineupSeconds: number;
  rollSeconds: number;
  rotationSeconds: number;
  climbSeconds: number;
  totalSeconds: number;
}

type Point3 = { x: number; y: number; z: number };
type PathSample = { point: Point3; tangent: Point3; distanceAlong: number; totalDistance: number };
type ArcLengthSample = { parameter: number; distance: number };
type PreparedSmoothPath = { points: Point3[]; samples: ArcLengthSample[]; totalDistance: number };

const KNOT_TO_MPS = 0.514444;
const DEGREES_TO_RADIANS = Math.PI / 180;
const RUNWAY_TRACK_ALTITUDE = 2;
const THRESHOLD_CROSSING_ALTITUDE = 2.3;
const FINAL_GLIDE_SLOPE = Math.tan(3 * DEGREES_TO_RADIANS);
const APPROACH_PITCH = 0.105;
const LANDING_FLARE_PITCH = 0.18;
const TAKEOFF_ROTATION_PITCH = 12 * DEGREES_TO_RADIANS;
const TAKEOFF_ANGLE_OF_ATTACK = 2.5 * DEGREES_TO_RADIANS;
const MINIMUM_CLIMB_PITCH = 10 * DEGREES_TO_RADIANS;
const MAXIMUM_CLIMB_PITCH = 13.5 * DEGREES_TO_RADIANS;
const ROTATION_LIFTOFF_HEIGHT = 0.12;
const APPROACH_PATH_CACHE = new WeakMap<AirportConfig, Map<string, PreparedSmoothPath>>();
const GO_AROUND_PATH_CACHE = new WeakMap<FlightGoAroundState, PreparedSmoothPath>();
const VECTOR_PATH_CACHE = new WeakMap<NonNullable<Flight['navigation']['vector']>, PreparedSmoothPath>();
const HOLD_PATH_CACHE = new WeakMap<NonNullable<Flight['navigation']['hold']>, PreparedSmoothPath>();

export function phaseUsesFlightTrajectory(phase: FlightPhase): phase is 'approach' | 'landing' | 'takeoff' {
  return phase === 'approach' || phase === 'landing' || phase === 'takeoff';
}

export function sampleFlightTrajectory(
  config: AirportConfig,
  flight: Flight,
  progress = flight.progress,
): FlightTrajectorySample | null {
  const amount = clamp(progress, 0, 1);
  if (flight.phase === 'approach' && flight.navigation?.hold) return sampleHoldingPattern(config, flight, amount);
  if (flight.phase === 'approach' && flight.goAround) return sampleGoAround(config, flight, amount);
  if (flight.phase === 'approach') return sampleApproach(config, flight, amount);
  if (flight.phase === 'landing') return sampleLanding(config, flight, amount);
  if (flight.phase === 'takeoff') return sampleDeparture(config, flight, amount);
  return null;
}

export function landingTrajectoryTiming(
  config: AirportConfig,
  runwayId: number,
  aircraft: AircraftModel,
  runwayExit?: FlightRunwayExitState,
): LandingTrajectoryTiming {
  const profile = aircraftProfile(aircraft);
  const touchdownMps = profile.approachKts * KNOT_TO_MPS;
  const exitSpeedKts = runwayExit?.targetExitSpeedKts ?? profile.taxiKts + 3;
  const taxiMps = exitSpeedKts * KNOT_TO_MPS;
  const runway = config.runways[runwayId] ?? config.runways[0];
  const exitDistance = runwayExit
    ? runwayExit.distanceFromThresholdM / WORLD_METERS_PER_UNIT
    : Math.max(1, runway.length - 5);
  const touchdownDistance = Math.min(4.5, runway.length * 0.075);
  // Preserve approach speed across the threshold while still touching down
  // near the runway end. A fixed flare duration made short touchdown targets
  // look like an abrupt midair slowdown.
  const flareSeconds = clamp(touchdownDistance * WORLD_METERS_PER_UNIT / touchdownMps, 2.2, 3.4);
  const rolloutMeters = runwayExit?.requiredRolloutM ?? profile.landingRollM;
  const runwayLimitedBraking = (touchdownMps * touchdownMps - taxiMps * taxiMps) / (2 * Math.max(1, rolloutMeters));
  const braking = Math.max(0.42, Math.min(profile.brakingMps2, runwayLimitedBraking));
  const brakingSeconds = Math.max(8, (touchdownMps - taxiMps) / braking);
  const rolloutEnd = Math.min(exitDistance - 2, touchdownDistance + landingRollDistance(runway, aircraft, runwayExit));
  const exitNode = runwayExit ? config.surfaceGraph.nodes.find((node) => node.id === runwayExit.nodeId) : undefined;
  const travel = runwayExit ? runwayTravelDirection(runway, runwayExit.operatingEnd) : { x: Math.cos(runway.heading), y: Math.sin(runway.heading) };
  const threshold = runwayExit ? runwayEnd(runway, runwayExit.operatingEnd, 0, RUNWAY_TRACK_ALTITUDE) : { x: runway.center[0], y: runway.center[1], z: RUNWAY_TRACK_ALTITUDE };
  const rolloutPoint = { x: threshold.x + travel.x * rolloutEnd, y: threshold.y + travel.y * rolloutEnd, z: RUNWAY_TRACK_ALTITUDE };
  const remainingMeters = exitNode
    ? Math.max(1, Math.hypot(exitNode.position[0] - rolloutPoint.x, exitNode.position[1] - rolloutPoint.y) * WORLD_METERS_PER_UNIT)
    : Math.max(1, exitDistance - rolloutEnd) * WORLD_METERS_PER_UNIT;
  const exitSeconds = Math.max(config.scope === 'center' ? 7 : 6, remainingMeters / Math.max(1, taxiMps));
  return {
    flareSeconds,
    brakingSeconds,
    exitSeconds,
    totalSeconds: flareSeconds + brakingSeconds + exitSeconds,
  };
}

export function departureTrajectoryTiming(
  config: AirportConfig,
  runwayId: number,
  aircraft: AircraftModel,
): DepartureTrajectoryTiming {
  const profile = aircraftProfile(aircraft);
  const rotationMps = profile.approachKts * 1.12 * KNOT_TO_MPS;
  const taxiMps = profile.taxiKts * KNOT_TO_MPS;
  const runwayLimitedAcceleration = rotationMps * rotationMps / (2 * profile.takeoffRollM);
  const acceleration = Math.max(0.75, Math.min(profile.accelerationMps2, runwayLimitedAcceleration));
  const rollSeconds = Math.max(12, (rotationMps - taxiMps) / acceleration);
  const lineupSeconds = 4.5;
  const rotationSeconds = 3.2;
  const climbSeconds = config.scope === 'center' ? 18 : 14;
  return {
    lineupSeconds,
    rollSeconds,
    rotationSeconds,
    climbSeconds,
    totalSeconds: lineupSeconds + rollSeconds + rotationSeconds + climbSeconds,
  };
}

function sampleApproach(config: AirportConfig, flight: Flight, progress: number): FlightTrajectorySample {
  const planned = sampleApproachPath(config, flight, progress);
  const base = sampleVector(config, flight, progress, planned);
  const patterned = applyControlPattern(config, flight, progress, base);
  const heading = Math.atan2(patterned.tangent.y, patterned.tangent.x);
  const before = sampleApproachPath(config, flight, clamp(progress - 0.006, 0, 1));
  const after = sampleApproachPath(config, flight, clamp(progress + 0.006, 0, 1));
  const turn = shortestAngle(
    Math.atan2(before.tangent.y, before.tangent.x),
    Math.atan2(after.tangent.y, after.tangent.x),
  );
  const flare = smoothRange(progress, 0.82, 1);
  const vector = flight.navigation?.vector;
  const vectorActive = Boolean(vector
    && progress >= vector.startProgress
    && progress < vector.endProgress);
  const stage = vectorActive ? 'vector' : progress < 0.3 ? 'edge-entry' : progress < 0.68 ? 'arrival-turn' : 'final';
  const stageProgress = stage === 'edge-entry'
    ? progress / 0.3
    : stage === 'arrival-turn'
      ? (progress - 0.3) / 0.38
      : stage === 'vector'
        ? (progress - vector!.startProgress) / Math.max(0.001, vector!.endProgress - vector!.startProgress)
      : (progress - 0.68) / 0.32;
  return {
    x: patterned.point.x,
    y: patterned.point.y,
    z: patterned.point.z,
    heading,
    pitch: APPROACH_PITCH * flare,
    bank: clamp(turn * 2.8, -0.14, 0.14),
    onGround: false,
    groundBlend: 0,
    protectedRunway: progress >= 0.78,
    stage,
    stageProgress: clamp(stageProgress, 0, 1),
    distanceAlong: patterned.distanceAlong,
    totalDistance: patterned.totalDistance,
  };
}

function sampleApproachPath(config: AirportConfig, flight: Flight, progress: number): PathSample {
  const runway = config.runways[flight.runway] ?? config.runways[0];
  const direction = runwayDirection(runway);
  const side = { x: -direction.y, y: direction.x };
  const landingSign = flight.operatingEnd;
  const lateralSign = flight.id % 2 ? 1 : -1;
  const altitudeLane = flight.id % 3 - 1;
  let airportPaths = APPROACH_PATH_CACHE.get(config);
  if (!airportPaths) {
    airportPaths = new Map();
    APPROACH_PATH_CACHE.set(config, airportPaths);
  }
  const navigation = flight.navigation;
  const cacheKey = `${navigation?.procedureId ?? 'legacy'}:${navigation?.transitionId ?? 'direct'}:${runway.id}:${landingSign}:${lateralSign}:${altitudeLane}`;
  let path = airportPaths.get(cacheKey);
  if (!path) {
    const startDistance = config.scope === 'center' ? 265 : 175;
    const lateral = config.scope === 'center' ? 12 : 38;
    const threshold = runwayEnd(runway, landingSign, 0, THRESHOLD_CROSSING_ALTITUDE);
    const procedurePoints = (navigation?.routeFixIds ?? [])
      .map((fixId) => procedureFix(config.airspaceProgram, fixId))
      .filter((fix): fix is NonNullable<typeof fix> => Boolean(fix))
      .map((fix) => ({
        x: fix.position[0],
        y: fix.position[1],
        // Procedure constraints remain in physical feet for the ATC model.
        // The miniature scene uses a deliberately compressed vertical scale,
        // so follow the continuous visual glide envelope here instead of
        // creating a steep last-second drop from a 500-foot constraint.
        z: approachAltitude(Math.hypot(fix.position[0] - threshold.x, fix.position[1] - threshold.y)),
      }));
    path = prepareSmoothPath(procedurePoints.length >= 3
      ? [...procedurePoints, runwayEnd(runway, landingSign, 21, approachAltitude(21)), runwayEnd(runway, landingSign, 8, approachAltitude(8)), threshold]
      : [
          offset(runwayEnd(runway, landingSign, startDistance, approachAltitude(startDistance, altitudeLane * 4)), side, lateralSign * lateral),
          offset(runwayEnd(runway, landingSign, startDistance * 0.82, approachAltitude(startDistance * 0.82, altitudeLane * 4)), side, lateralSign * lateral * 0.94),
          offset(runwayEnd(runway, landingSign, startDistance * 0.62, approachAltitude(startDistance * 0.62, altitudeLane * 3.2)), side, lateralSign * lateral * 0.68),
          offset(runwayEnd(runway, landingSign, startDistance * 0.43, approachAltitude(startDistance * 0.43, altitudeLane * 1.4)), side, lateralSign * lateral * 0.34),
          offset(runwayEnd(runway, landingSign, startDistance * 0.31, approachAltitude(startDistance * 0.31, altitudeLane * 0.25)), side, lateralSign * lateral * 0.06),
          runwayEnd(runway, landingSign, 44, approachAltitude(44)),
          runwayEnd(runway, landingSign, 21, approachAltitude(21)),
          runwayEnd(runway, landingSign, 8, approachAltitude(8)),
          threshold,
        ]);
    airportPaths.set(cacheKey, path);
  }
  return samplePreparedSmoothPath(path, progress);
}

function sampleVector(config: AirportConfig, flight: Flight, progress: number, planned: PathSample): PathSample {
  const vector = flight.navigation?.vector;
  if (!vector || progress < vector.startProgress || progress >= vector.endProgress) return planned;
  let path = VECTOR_PATH_CACHE.get(vector);
  if (!path) {
    const rejoin = sampleApproachPath(config, { ...flight, navigation: { ...flight.navigation, vector: undefined } }, vector.endProgress);
    const beforeRejoin = sampleApproachPath(config, { ...flight, navigation: { ...flight.navigation, vector: undefined } }, Math.max(vector.startProgress, vector.endProgress - 0.045));
    const heading = aviationDegreesToMathAngle(vector.headingDegrees);
    const length = config.scope === 'center' ? 58 : 36;
    const assignedAltitude = flight.navigation?.assignedAltitudeFt === undefined
      ? vector.start.z
      : altitudePresentation(flight.navigation.assignedAltitudeFt);
    path = prepareSmoothPath([
      { x: vector.start.x, y: vector.start.y, z: vector.start.z },
      { x: vector.start.x + Math.cos(heading) * length * 0.42, y: vector.start.y + Math.sin(heading) * length * 0.42, z: lerp(vector.start.z, assignedAltitude, 0.7) },
      { x: vector.start.x + Math.cos(heading) * length, y: vector.start.y + Math.sin(heading) * length, z: assignedAltitude },
      beforeRejoin.point,
      rejoin.point,
    ]);
    VECTOR_PATH_CACHE.set(vector, path);
  }
  const amount = clamp((progress - vector.startProgress) / Math.max(0.001, vector.endProgress - vector.startProgress), 0, 1);
  const sampled = samplePreparedSmoothPath(path, amount);
  const startDistance = sampleApproachPath(config, { ...flight, navigation: { ...flight.navigation, vector: undefined } }, vector.startProgress).distanceAlong;
  const endDistance = sampleApproachPath(config, { ...flight, navigation: { ...flight.navigation, vector: undefined } }, vector.endProgress).distanceAlong;
  return {
    ...sampled,
    distanceAlong: lerp(startDistance, endDistance, amount),
    totalDistance: planned.totalDistance,
  };
}

function sampleHoldingPattern(config: AirportConfig, flight: Flight, progress: number): FlightTrajectorySample {
  const hold = flight.navigation.hold!;
  let path = HOLD_PATH_CACHE.get(hold);
  if (!path) {
    const inbound = aviationDegreesToMathAngle(hold.inboundCourseDegrees);
    const direction = { x: Math.cos(inbound), y: Math.sin(inbound) };
    const sideSign = hold.turns === 'right' ? -1 : 1;
    const side = { x: -direction.y * sideSign, y: direction.x * sideSign };
    const legDistance = Math.max(config.scope === 'center' ? 34 : 24, aircraftProfile(flight.aircraft).approachKts * KNOT_TO_MPS * hold.legSeconds / WORLD_METERS_PER_UNIT);
    const width = config.scope === 'center' ? 18 : 13;
    const altitude = altitudePresentation(hold.altitudeFt);
    const start = { x: hold.start.x, y: hold.start.y, z: hold.start.z };
    path = prepareSmoothPath([
      start,
      { x: start.x + direction.x * legDistance * 0.45, y: start.y + direction.y * legDistance * 0.45, z: altitude },
      { x: start.x + direction.x * legDistance, y: start.y + direction.y * legDistance, z: altitude },
      { x: start.x + direction.x * legDistance + side.x * width, y: start.y + direction.y * legDistance + side.y * width, z: altitude },
      { x: start.x + side.x * width, y: start.y + side.y * width, z: altitude },
      start,
    ]);
    HOLD_PATH_CACHE.set(hold, path);
  }
  const sampled = samplePreparedSmoothPath(path, progress);
  const before = samplePreparedSmoothPath(path, clamp(progress - 0.004, 0, 1));
  const after = samplePreparedSmoothPath(path, clamp(progress + 0.004, 0, 1));
  const turn = shortestAngle(Math.atan2(before.tangent.y, before.tangent.x), Math.atan2(after.tangent.y, after.tangent.x));
  const stage: FlightTrajectoryStage = progress < 0.15
    ? 'hold-entry'
    : progress < 0.45
      ? 'hold-outbound'
      : progress < 0.72
        ? 'hold-turn'
        : 'hold-inbound';
  const stageStart = stage === 'hold-entry' ? 0 : stage === 'hold-outbound' ? 0.15 : stage === 'hold-turn' ? 0.45 : 0.72;
  const stageEnd = stage === 'hold-entry' ? 0.15 : stage === 'hold-outbound' ? 0.45 : stage === 'hold-turn' ? 0.72 : 1;
  return {
    x: sampled.point.x,
    y: sampled.point.y,
    z: sampled.point.z,
    heading: Math.atan2(sampled.tangent.y, sampled.tangent.x),
    pitch: 0,
    bank: clamp(turn * 2.5, -0.2, 0.2),
    onGround: false,
    groundBlend: 0,
    protectedRunway: false,
    stage,
    stageProgress: clamp((progress - stageStart) / (stageEnd - stageStart), 0, 1),
    distanceAlong: sampled.distanceAlong,
    totalDistance: sampled.totalDistance,
  };
}

function applyControlPattern(
  config: AirportConfig,
  flight: Flight,
  progress: number,
  base: PathSample,
): PathSample {
  if (flight.controlPattern !== 'zigzag') return base;
  const start = clamp(flight.controlPatternStart ?? 0, 0, 0.94);
  const patternProgress = clamp((progress - start) / Math.max(0.06, 1 - start), 0, 1);
  const envelope = Math.sin(Math.PI * patternProgress) ** 2;
  const amplitude = config.scope === 'center' ? 15 : 9;
  const wave = amplitude * envelope * Math.sin(patternProgress * Math.PI * 2);
  const tangentLength = Math.hypot(base.tangent.x, base.tangent.y) || 1;
  const sideX = -base.tangent.y / tangentLength;
  const sideY = base.tangent.x / tangentLength;
  const point = {
    x: base.point.x + sideX * wave,
    y: base.point.y + sideY * wave,
    z: base.point.z,
  };
  const epsilon = 0.001;
  const nextProgress = clamp(progress + epsilon, 0, 1);
  if (nextProgress === progress) return { ...base, point };
  const nextBase = sampleApproachPath(config, flight, nextProgress);
  const nextPatternProgress = clamp((nextProgress - start) / Math.max(0.06, 1 - start), 0, 1);
  const nextEnvelope = Math.sin(Math.PI * nextPatternProgress) ** 2;
  const nextWave = amplitude * nextEnvelope * Math.sin(nextPatternProgress * Math.PI * 2);
  const nextLength = Math.hypot(nextBase.tangent.x, nextBase.tangent.y) || 1;
  const nextPoint = {
    x: nextBase.point.x - nextBase.tangent.y / nextLength * nextWave,
    y: nextBase.point.y + nextBase.tangent.x / nextLength * nextWave,
    z: nextBase.point.z,
  };
  return {
    ...base,
    point,
    tangent: {
      x: nextPoint.x - point.x,
      y: nextPoint.y - point.y,
      z: nextPoint.z - point.z,
    },
  };
}

function sampleLanding(config: AirportConfig, flight: Flight, progress: number): FlightTrajectorySample {
  const runway = config.runways[flight.runway] ?? config.runways[0];
  const timing = landingTrajectoryTiming(config, flight.runway, flight.aircraft, flight.runwayExit);
  const elapsed = progress * timing.totalSeconds;
  const travel = runwayTravelDirection(runway, flight.operatingEnd);
  const threshold = runwayEnd(runway, flight.operatingEnd, 0, THRESHOLD_CROSSING_ALTITUDE);
  const fallbackExitDistance = Math.max(1, runway.length - 5);
  const plannedExitNode = flight.runwayExit
    ? config.surfaceGraph.nodes.find((node) => node.id === flight.runwayExit?.nodeId)
    : undefined;
  const exitPoint = plannedExitNode ? {
    x: plannedExitNode.position[0],
    y: plannedExitNode.position[1],
    z: 2,
  } : runwaySurfacePoint(config, flight.runway, -flight.operatingEnd as -1 | 1, 'exit') ?? {
    x: threshold.x + travel.x * fallbackExitDistance,
    y: threshold.y + travel.y * fallbackExitDistance,
    z: 2,
  };
  const projectedExitDistance = (exitPoint.x - threshold.x) * travel.x + (exitPoint.y - threshold.y) * travel.y;
  const centerlineExitDistance = clamp(
    flight.runwayExit ? flight.runwayExit.distanceFromThresholdM / WORLD_METERS_PER_UNIT : projectedExitDistance,
    runway.length * (flight.runwayExit ? 0.14 : 0.55),
    runway.length - 1,
  );
  // Put the mains down close to the threshold so the stopping calculation can
  // use nearly all of the available pavement, especially on shorter runways.
  const touchdownDistance = Math.min(4.5, runway.length * 0.075);
  const rolloutDistance = landingRollDistance(runway, flight.aircraft, flight.runwayExit);
  const rolloutEnd = Math.min(centerlineExitDistance - 2, touchdownDistance + rolloutDistance);
  const rolloutTravel = Math.max(1, rolloutEnd - touchdownDistance);
  const exitStart = {
    x: threshold.x + travel.x * rolloutEnd,
    y: threshold.y + travel.y * rolloutEnd,
    z: 2,
  };
  const exitControlDistance = lerp(rolloutEnd, centerlineExitDistance, 0.72);
  const exitControl = {
    x: threshold.x + travel.x * exitControlDistance,
    y: threshold.y + travel.y * exitControlDistance,
    z: 2,
  };
  const exitPathDistance = Math.max(1, distance(exitStart, exitControl) + distance(exitControl, exitPoint));
  let distanceAlong = 0;
  let z = THRESHOLD_CROSSING_ALTITUDE;
  let pitch = APPROACH_PITCH;
  let x = threshold.x;
  let y = threshold.y;
  let heading = Math.atan2(travel.y, travel.x);
  let stage: FlightTrajectoryStage = 'flare';
  let stageProgress = 0;
  let onGround = false;
  let groundBlend = 0;

  if (elapsed < timing.flareSeconds) {
    stageProgress = clamp(elapsed / timing.flareSeconds, 0, 1);
    distanceAlong = touchdownDistance * stageProgress;
    z = lerp(THRESHOLD_CROSSING_ALTITUDE, RUNWAY_TRACK_ALTITUDE, smooth01(stageProgress));
    pitch = lerp(APPROACH_PITCH, LANDING_FLARE_PITCH, smooth01(stageProgress));
    groundBlend = smoothRange(stageProgress, 0.48, 1);
    onGround = stageProgress >= 0.985;
  } else if (elapsed < timing.flareSeconds + timing.brakingSeconds) {
    stageProgress = clamp((elapsed - timing.flareSeconds) / timing.brakingSeconds, 0, 1);
    const profile = aircraftProfile(flight.aircraft);
    const initialSpeed = profile.approachKts;
    const finalSpeed = flight.runwayExit?.targetExitSpeedKts ?? profile.taxiKts + 3;
    const distanceProgress = (
      initialSpeed * stageProgress + 0.5 * (finalSpeed - initialSpeed) * stageProgress * stageProgress
    ) / Math.max(1, 0.5 * (initialSpeed + finalSpeed));
    distanceAlong = touchdownDistance + rolloutTravel * distanceProgress;
    z = RUNWAY_TRACK_ALTITUDE;
    pitch = LANDING_FLARE_PITCH * (1 - smoothRange(stageProgress, 0.06, 0.52));
    stage = stageProgress < 0.08 ? 'touchdown' : 'rollout';
    onGround = true;
    groundBlend = 1;
  } else {
    stageProgress = clamp((elapsed - timing.flareSeconds - timing.brakingSeconds) / timing.exitSeconds, 0, 1);
    const curveProgress = smooth01(stageProgress);
    const point = quadraticPoint(exitStart, exitControl, exitPoint, curveProgress);
    const tangent = quadraticTangent(exitStart, exitControl, exitPoint, curveProgress);
    x = point.x;
    y = point.y;
    heading = Math.atan2(tangent.y, tangent.x);
    distanceAlong = rolloutEnd + exitPathDistance * stageProgress;
    z = RUNWAY_TRACK_ALTITUDE;
    pitch = 0;
    stage = 'runway-exit';
    onGround = true;
    groundBlend = 1;
  }

  if (stage !== 'runway-exit') {
    distanceAlong = clamp(distanceAlong, 0, rolloutEnd);
    x = threshold.x + travel.x * distanceAlong;
    y = threshold.y + travel.y * distanceAlong;
  }
  return {
    x,
    y,
    z,
    heading,
    pitch,
    bank: 0,
    onGround,
    groundBlend,
    protectedRunway: true,
    stage,
    stageProgress,
    distanceAlong,
    totalDistance: rolloutEnd + exitPathDistance,
  };
}

function sampleGoAround(config: AirportConfig, flight: Flight, progress: number): FlightTrajectorySample {
  const state = flight.goAround!;
  let path = GO_AROUND_PATH_CACHE.get(state);
  if (!path) {
    const runway = config.runways[flight.runway] ?? config.runways[0];
    const travel = runwayTravelDirection(runway, flight.operatingEnd);
    const side = { x: -travel.y, y: travel.x };
    const circuitSide = flight.id % 2 ? 1 : -1;
    const threshold = runwayEnd(runway, flight.operatingEnd, 0, THRESHOLD_CROSSING_ALTITUDE);
    const entry = sampleApproachPath(config, flight, 0);
    const entryNext = sampleApproachPath(config, flight, 0.035);
    const entryLength = Math.hypot(entryNext.point.x - entry.point.x, entryNext.point.y - entry.point.y) || 1;
    const entryDirection = {
      x: (entryNext.point.x - entry.point.x) / entryLength,
      y: (entryNext.point.y - entry.point.y) / entryLength,
    };
    const startDistance = config.scope === 'center' ? 265 : 175;
    const circuitWidth = config.scope === 'center' ? 94 : 68;
    const start = { x: state.start.x, y: state.start.y, z: state.start.z };
    const initialHeading = { x: Math.cos(state.start.heading), y: Math.sin(state.start.heading) };
    const climbHeight = Math.max(22, entry.point.z + 5);
    const farEnd = {
      x: threshold.x + travel.x * (runway.length + (config.scope === 'center' ? 76 : 52)),
      y: threshold.y + travel.y * (runway.length + (config.scope === 'center' ? 76 : 52)),
      z: climbHeight,
    };
    const missedApproach = config.airspaceProgram.missedApproaches.find((candidate) => candidate.id === flight.navigation?.missedApproachId);
    const missedRoute = (missedApproach?.fixIds ?? [])
      .map((fixId) => procedureFix(config.airspaceProgram, fixId))
      .filter((fix): fix is NonNullable<typeof fix> => Boolean(fix))
      .map((fix) => {
        const distanceFromThreshold = Math.hypot(fix.position[0] - threshold.x, fix.position[1] - threshold.y);
        return {
          x: fix.position[0],
          y: fix.position[1],
          z: Math.max(climbHeight, approachAltitude(distanceFromThreshold) + 6),
        };
      });
    const downwind = {
      x: threshold.x - travel.x * startDistance * 0.34 + side.x * circuitSide * circuitWidth,
      y: threshold.y - travel.y * startDistance * 0.34 + side.y * circuitSide * circuitWidth,
      z: Math.max(climbHeight, entry.point.z + 8),
    };
    const beforeEntry = {
      x: entry.point.x - entryDirection.x * (config.scope === 'center' ? 42 : 28),
      y: entry.point.y - entryDirection.y * (config.scope === 'center' ? 42 : 28),
      z: entry.point.z + 3,
    };
    path = prepareSmoothPath([
      start,
      {
        x: start.x + initialHeading.x * (config.scope === 'center' ? 48 : 34),
        y: start.y + initialHeading.y * (config.scope === 'center' ? 48 : 34),
        z: Math.max(start.z + 8, 12),
      },
      ...(missedRoute.length >= 2
        ? missedRoute
        : [
            farEnd,
            {
              x: farEnd.x + travel.x * 34 + side.x * circuitSide * circuitWidth,
              y: farEnd.y + travel.y * 34 + side.y * circuitSide * circuitWidth,
              z: climbHeight + 5,
            },
          ]),
      downwind,
      beforeEntry,
      entry.point,
    ]);
    GO_AROUND_PATH_CACHE.set(state, path);
  }
  const base = samplePreparedSmoothPath(path, progress);
  const before = samplePreparedSmoothPath(path, clamp(progress - 0.004, 0, 1));
  const after = samplePreparedSmoothPath(path, clamp(progress + 0.004, 0, 1));
  const turn = shortestAngle(
    Math.atan2(before.tangent.y, before.tangent.x),
    Math.atan2(after.tangent.y, after.tangent.x),
  );
  const stage: FlightTrajectoryStage = progress < 0.24
    ? 'go-around-climb'
    : progress < 0.74
      ? 'go-around-turn'
      : 'go-around-reentry';
  const stageProgress = stage === 'go-around-climb'
    ? progress / 0.24
    : stage === 'go-around-turn'
      ? (progress - 0.24) / 0.5
      : (progress - 0.74) / 0.26;
  const climbPitch = 12 * DEGREES_TO_RADIANS;
  const initialPitch = lerp(state.start.pitch, climbPitch, smoothRange(progress, 0, 0.14));
  const pitch = stage === 'go-around-reentry'
    ? lerp(climbPitch, 0, smoothRange(progress, 0.74, 1))
    : initialPitch;
  const computedBank = clamp(turn * 2.7, -0.18, 0.18);
  return {
    x: base.point.x,
    y: base.point.y,
    z: progress <= 0 ? state.start.z : Math.max(2.05, base.point.z),
    heading: Math.atan2(base.tangent.y, base.tangent.x),
    pitch,
    bank: lerp(state.start.bank, computedBank, smoothRange(progress, 0, 0.08)),
    onGround: state.start.onGround && progress < 0.012,
    groundBlend: state.start.groundBlend * (1 - smoothRange(progress, 0, 0.06)),
    protectedRunway: state.start.protectedRunway && progress < 0.16,
    stage,
    stageProgress: clamp(stageProgress, 0, 1),
    distanceAlong: base.distanceAlong,
    totalDistance: base.totalDistance,
  };
}

function sampleDeparture(config: AirportConfig, flight: Flight, progress: number): FlightTrajectorySample {
  const runway = config.runways[flight.runway] ?? config.runways[0];
  const timing = departureTrajectoryTiming(config, flight.runway, flight.aircraft);
  const elapsed = progress * timing.totalSeconds;
  const travel = runwayTravelDirection(runway, flight.operatingEnd);
  const threshold = runwayEnd(runway, flight.operatingEnd, 0, RUNWAY_TRACK_ALTITUDE);
  const holdPoint = runwaySurfacePoint(config, flight.runway, flight.operatingEnd, 'hold') ?? {
    x: threshold.x - travel.x * 8,
    y: threshold.y - travel.y * 8,
    z: RUNWAY_TRACK_ALTITUDE,
  };
  const lineupControl = {
    x: threshold.x - travel.x * Math.min(5, Math.max(2, distance(holdPoint, threshold) * 0.35)),
    y: threshold.y - travel.y * Math.min(5, Math.max(2, distance(holdPoint, threshold) * 0.35)),
    z: RUNWAY_TRACK_ALTITUDE,
  };
  const lineupDistance = Math.max(1, distance(holdPoint, lineupControl) + distance(lineupControl, threshold));
  const rollDistance = takeoffRollDistance(runway, flight.aircraft);
  const rotationDistance = Math.min(runway.length * 0.08, 6.5);
  const liftoffDistance = Math.min(runway.length * 0.9, rollDistance + rotationDistance);
  const edgeBeyond = config.scope === 'center' ? 220 : 150;
  const endDistance = runway.length + edgeBeyond;
  let distanceAlong = -lineupDistance;
  let z = RUNWAY_TRACK_ALTITUDE;
  let pitch = 0;
  let x = holdPoint.x;
  let y = holdPoint.y;
  let heading = Math.atan2(lineupControl.y - holdPoint.y, lineupControl.x - holdPoint.x);
  let stage: FlightTrajectoryStage = 'lineup';
  let stageProgress = 0;
  let onGround = true;
  let groundBlend = 1;

  if (elapsed < timing.lineupSeconds) {
    stageProgress = clamp(elapsed / timing.lineupSeconds, 0, 1);
    const curveProgress = smooth01(stageProgress);
    const point = quadraticPoint(holdPoint, lineupControl, threshold, curveProgress);
    const tangent = quadraticTangent(holdPoint, lineupControl, threshold, curveProgress);
    x = point.x;
    y = point.y;
    heading = Math.atan2(tangent.y, tangent.x);
    distanceAlong = lerp(-lineupDistance, 0, stageProgress);
  } else if (elapsed < timing.lineupSeconds + timing.rollSeconds) {
    stageProgress = clamp((elapsed - timing.lineupSeconds) / timing.rollSeconds, 0, 1);
    distanceAlong = rollDistance * stageProgress * stageProgress;
    stage = 'takeoff-roll';
  } else if (elapsed < timing.lineupSeconds + timing.rollSeconds + timing.rotationSeconds) {
    stageProgress = clamp((elapsed - timing.lineupSeconds - timing.rollSeconds) / timing.rotationSeconds, 0, 1);
    distanceAlong = lerp(rollDistance, liftoffDistance, stageProgress);
    // Establish the visible 12° rotation before the wheels leave the runway,
    // then hold it through liftoff. Spreading the same curve over the entire
    // stage made most of the takeoff read as level or nose-down at game scale.
    pitch = TAKEOFF_ROTATION_PITCH * smoothRange(stageProgress, 0, 0.72);
    const liftoff = smoothRange(stageProgress, 0.78, 1);
    z = lerp(RUNWAY_TRACK_ALTITUDE, RUNWAY_TRACK_ALTITUDE + ROTATION_LIFTOFF_HEIGHT, liftoff);
    groundBlend = 1 - liftoff;
    onGround = stageProgress < 0.8;
    stage = 'rotation';
  } else {
    stageProgress = clamp((elapsed - timing.lineupSeconds - timing.rollSeconds - timing.rotationSeconds) / timing.climbSeconds, 0, 1);
    distanceAlong = lerp(liftoffDistance, endDistance, stageProgress);
    const climbHeight = config.scope === 'center' ? 39 : 31;
    const climb = stageProgress * (1.04 - 0.04 * stageProgress);
    const climbDerivative = 1.04 - 0.08 * stageProgress;
    const climbDistance = Math.max(1, endDistance - liftoffDistance);
    const flightPathAngle = Math.atan(climbHeight * climbDerivative / climbDistance);
    z = RUNWAY_TRACK_ALTITUDE + ROTATION_LIFTOFF_HEIGHT + climbHeight * climb;
    pitch = clamp(
      flightPathAngle + TAKEOFF_ANGLE_OF_ATTACK,
      MINIMUM_CLIMB_PITCH,
      MAXIMUM_CLIMB_PITCH,
    );
    groundBlend = 0;
    onGround = false;
    stage = 'climbout';
  }

  if (stage === 'climbout' && flight.navigation?.departureHeadingDegrees !== undefined) {
    const start = {
      x: threshold.x + travel.x * liftoffDistance,
      y: threshold.y + travel.y * liftoffDistance,
      z: RUNWAY_TRACK_ALTITUDE + ROTATION_LIFTOFF_HEIGHT,
    };
    const targetHeading = aviationDegreesToMathAngle(flight.navigation.departureHeadingDegrees);
    const target = {
      x: start.x + Math.cos(targetHeading) * (endDistance - liftoffDistance),
      y: start.y + Math.sin(targetHeading) * (endDistance - liftoffDistance),
      z,
    };
    const control = {
      x: start.x + travel.x * (endDistance - liftoffDistance) * 0.52,
      y: start.y + travel.y * (endDistance - liftoffDistance) * 0.52,
      z: lerp(start.z, z, 0.52),
    };
    const point = quadraticPoint(start, control, target, stageProgress);
    const tangent = quadraticTangent(start, control, target, stageProgress);
    x = point.x;
    y = point.y;
    heading = Math.atan2(tangent.y, tangent.x);
  } else if (stage !== 'lineup') {
    x = threshold.x + travel.x * distanceAlong;
    y = threshold.y + travel.y * distanceAlong;
    heading = Math.atan2(travel.y, travel.x);
  }
  return {
    x,
    y,
    z,
    heading,
    pitch,
    bank: 0,
    onGround,
    groundBlend,
    protectedRunway: stage !== 'climbout' || stageProgress < 0.08,
    stage,
    stageProgress,
    distanceAlong: distanceAlong + lineupDistance,
    totalDistance: endDistance + lineupDistance,
  };
}

function landingRollDistance(
  runway: RunwayConfig,
  aircraft: AircraftModel,
  runwayExit?: FlightRunwayExitState,
): number {
  if (runwayExit) return Math.max(1, runwayExit.requiredRolloutM / WORLD_METERS_PER_UNIT);
  const desired = aircraftProfile(aircraft).landingRollM / WORLD_METERS_PER_UNIT;
  return clamp(desired, runway.length * 0.34, runway.length * 0.66);
}

function takeoffRollDistance(runway: RunwayConfig, aircraft: AircraftModel): number {
  const desired = aircraftProfile(aircraft).takeoffRollM / WORLD_METERS_PER_UNIT;
  return clamp(desired, runway.length * 0.46, runway.length * 0.8);
}

function prepareSmoothPath(points: Point3[]): PreparedSmoothPath {
  if (points.length < 2) {
    return { points, samples: [{ parameter: 0, distance: 0 }], totalDistance: 0 };
  }
  const samples: ArcLengthSample[] = [{ parameter: 0, distance: 0 }];
  const subdivisions = 16;
  let previous = points[0];
  let totalDistance = 0;
  for (let segment = 0; segment < points.length - 1; segment += 1) {
    for (let step = 1; step <= subdivisions; step += 1) {
      const amount = step / subdivisions;
      const point = smoothPathPoint(points, segment, amount);
      totalDistance += distance(previous, point);
      samples.push({ parameter: segment + amount, distance: totalDistance });
      previous = point;
    }
  }
  return { points, samples, totalDistance };
}

function samplePreparedSmoothPath(path: PreparedSmoothPath, progress: number): PathSample {
  const { points, samples, totalDistance } = path;
  if (points.length < 2 || totalDistance <= 0) {
    return { point: points[0] ?? { x: 0, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, distanceAlong: 0, totalDistance: 0 };
  }
  const normalized = clamp(progress, 0, 1);
  const target = normalized * totalDistance;
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].distance < target) low = middle + 1;
    else high = middle;
  }
  const after = samples[low];
  const before = samples[Math.max(0, low - 1)];
  const span = Math.max(0.000001, after.distance - before.distance);
  const mix = clamp((target - before.distance) / span, 0, 1);
  const parameter = before.parameter + (after.parameter - before.parameter) * mix;
  const segment = Math.min(points.length - 2, Math.floor(parameter));
  const amount = segment === points.length - 2 && parameter >= points.length - 1 ? 1 : parameter - segment;
  const point = smoothPathPoint(points, segment, amount);
  const tangent = smoothPathTangent(points, segment, amount);
  if (normalized <= 0) Object.assign(point, points[0]);
  if (normalized >= 1) Object.assign(point, points[points.length - 1]);
  return { point, tangent, distanceAlong: target, totalDistance };
}

function smoothPathPoint(points: Point3[], segment: number, amount: number): Point3 {
  const p0 = segment > 0 ? points[segment - 1] : extrapolate(points[0], points[1]);
  const p1 = points[segment];
  const p2 = points[segment + 1];
  const p3 = segment + 2 < points.length
    ? points[segment + 2]
    : extrapolate(points[points.length - 1], points[points.length - 2]);
  return centripetalCatmullRom(p0, p1, p2, p3, amount);
}

function smoothPathTangent(points: Point3[], segment: number, amount: number): Point3 {
  const p0 = segment > 0 ? points[segment - 1] : extrapolate(points[0], points[1]);
  const p1 = points[segment];
  const p2 = points[segment + 1];
  const p3 = segment + 2 < points.length
    ? points[segment + 2]
    : extrapolate(points[points.length - 1], points[points.length - 2]);
  return centripetalCatmullRomTangent(p0, p1, p2, p3, amount);
}

function extrapolate(point: Point3, neighbor: Point3): Point3 {
  return {
    x: point.x * 2 - neighbor.x,
    y: point.y * 2 - neighbor.y,
    z: point.z * 2 - neighbor.z,
  };
}

function centripetalCatmullRom(p0: Point3, p1: Point3, p2: Point3, p3: Point3, amount: number): Point3 {
  const u = clamp(amount, 0, 1);
  const u2 = u * u;
  const u3 = u2 * u;
  const { first, second } = centripetalTangents(p0, p1, p2, p3);
  return combineHermite(
    p1,
    first,
    p2,
    second,
    2 * u3 - 3 * u2 + 1,
    u3 - 2 * u2 + u,
    -2 * u3 + 3 * u2,
    u3 - u2,
  );
}

function centripetalKnotDistance(first: Point3, second: Point3): number {
  return Math.max(0.0001, Math.sqrt(distance(first, second)));
}

function centripetalCatmullRomTangent(p0: Point3, p1: Point3, p2: Point3, p3: Point3, amount: number): Point3 {
  const u = clamp(amount, 0, 1);
  const u2 = u * u;
  const { first, second } = centripetalTangents(p0, p1, p2, p3);
  return combineHermite(
    p1,
    first,
    p2,
    second,
    6 * u2 - 6 * u,
    3 * u2 - 4 * u + 1,
    -6 * u2 + 6 * u,
    3 * u2 - 2 * u,
  );
}

function centripetalTangents(p0: Point3, p1: Point3, p2: Point3, p3: Point3): { first: Point3; second: Point3 } {
  const dt10 = centripetalKnotDistance(p0, p1);
  const dt21 = centripetalKnotDistance(p1, p2);
  const dt32 = centripetalKnotDistance(p2, p3);
  const dt20 = dt10 + dt21;
  const dt31 = dt21 + dt32;
  const component = (a0: number, a1: number, a2: number, a3: number): [number, number] => [
    dt21 * ((a1 - a0) / dt10 - (a2 - a0) / dt20 + (a2 - a1) / dt21),
    dt21 * ((a2 - a1) / dt21 - (a3 - a1) / dt31 + (a3 - a2) / dt32),
  ];
  const [firstX, secondX] = component(p0.x, p1.x, p2.x, p3.x);
  const [firstY, secondY] = component(p0.y, p1.y, p2.y, p3.y);
  const [firstZ, secondZ] = component(p0.z, p1.z, p2.z, p3.z);
  return {
    first: { x: firstX, y: firstY, z: firstZ },
    second: { x: secondX, y: secondY, z: secondZ },
  };
}

function combineHermite(
  p1: Point3,
  m1: Point3,
  p2: Point3,
  m2: Point3,
  p1Weight: number,
  m1Weight: number,
  p2Weight: number,
  m2Weight: number,
): Point3 {
  return {
    x: p1.x * p1Weight + m1.x * m1Weight + p2.x * p2Weight + m2.x * m2Weight,
    y: p1.y * p1Weight + m1.y * m1Weight + p2.y * p2Weight + m2.y * m2Weight,
    z: p1.z * p1Weight + m1.z * m1Weight + p2.z * p2Weight + m2.z * m2Weight,
  };
}

function runwayDirection(runway: RunwayConfig): { x: number; y: number } {
  return { x: Math.cos(runway.heading), y: Math.sin(runway.heading) };
}

function runwayTravelDirection(runway: RunwayConfig, landingEnd: -1 | 1): { x: number; y: number } {
  const direction = runwayDirection(runway);
  return { x: -landingEnd * direction.x, y: -landingEnd * direction.y };
}

function runwayEnd(runway: RunwayConfig, sign: number, beyond: number, z: number): Point3 {
  const amount = sign * (runway.length / 2 + beyond);
  return {
    x: runway.center[0] + Math.cos(runway.heading) * amount,
    y: runway.center[1] + Math.sin(runway.heading) * amount,
    z,
  };
}

function approachAltitude(distanceFromThreshold: number, laneOffset = 0): number {
  return THRESHOLD_CROSSING_ALTITUDE + Math.max(0, distanceFromThreshold) * FINAL_GLIDE_SLOPE + laneOffset;
}

function altitudePresentation(altitudeFt: number): number {
  return 4.2 + Math.max(0, altitudeFt - 50) / 100;
}

function aviationDegreesToMathAngle(degrees: number): number {
  return (90 - degrees) * DEGREES_TO_RADIANS;
}

function runwaySurfacePoint(
  config: AirportConfig,
  runwayId: number,
  end: -1 | 1,
  kind: 'exit' | 'hold',
): Point3 | null {
  const access = config.surfaceGraph.runwayAccess.find((item) => item.runwayId === runwayId && item.end === end);
  const nodeId = kind === 'exit' ? access?.exitNodeId : access?.holdShortNodeId;
  const node = nodeId ? config.surfaceGraph.nodes.find((item) => item.id === nodeId) : undefined;
  return node ? { x: node.position[0], y: node.position[1], z: 2 } : null;
}

function quadraticPoint(start: Point3, control: Point3, end: Point3, amount: number): Point3 {
  const inverse = 1 - amount;
  return {
    x: inverse * inverse * start.x + 2 * inverse * amount * control.x + amount * amount * end.x,
    y: inverse * inverse * start.y + 2 * inverse * amount * control.y + amount * amount * end.y,
    z: inverse * inverse * start.z + 2 * inverse * amount * control.z + amount * amount * end.z,
  };
}

function quadraticTangent(start: Point3, control: Point3, end: Point3, amount: number): Point3 {
  return {
    x: 2 * (1 - amount) * (control.x - start.x) + 2 * amount * (end.x - control.x),
    y: 2 * (1 - amount) * (control.y - start.y) + 2 * amount * (end.y - control.y),
    z: 2 * (1 - amount) * (control.z - start.z) + 2 * amount * (end.z - control.z),
  };
}

function offset(point: Point3, direction: { x: number; y: number }, amount: number): Point3 {
  return { x: point.x + direction.x * amount, y: point.y + direction.y * amount, z: point.z };
}

function distance(first: Point3, second: Point3): number {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function smoothRange(value: number, start: number, end: number): number {
  return smooth01((value - start) / Math.max(0.0001, end - start));
}

function smooth01(value: number): number {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

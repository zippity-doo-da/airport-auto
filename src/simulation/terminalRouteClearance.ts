import type { AirportConfig } from './airportConfig';
import type { AirspaceFix } from './airspaceProcedures';
import { validateTerminalRouteAmendment, type RouteCommandResult } from './atcRouteCommands';
import { requiredRadarSeparationNm, type SeparationRuleset } from './separationRules';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';
import type {
  ControllerStation,
  Flight,
  FlightRouteClearanceState,
  FlightRouteConflictWarning,
  WeatherState,
} from './types';

export interface TerminalRouteClearanceCandidate {
  fixes: AirspaceFix[];
  clearance: FlightRouteClearanceState;
}

type RoutePoint = { x: number; y: number; altitudeFt: number };
type RouteSample = RoutePoint & { complete: boolean };

const KNOT_TO_MPS = 0.514444;
const METERS_PER_NM = 1_852;
const FORECAST_SECONDS = 180;
const FORECAST_STEP_SECONDS = 5;

/**
 * Build a non-mutating, replayable preview of a terminal route amendment.
 * Procedure compatibility is validated first; then both the candidate and
 * every live airborne route are sampled on the same physical time axis.
 */
export function buildTerminalRouteClearancePreview(
  config: AirportConfig,
  flight: Flight,
  flights: readonly Flight[],
  fixIds: readonly string[],
  rules: SeparationRuleset,
  weather: WeatherState,
  atSeconds: number,
  revision: number,
  issuedBy: ControllerStation,
): RouteCommandResult<TerminalRouteClearanceCandidate> {
  if (flight.diversion) return { accepted: false, reason: 'flight is established on a diversion exit' };
  if (flight.goAround) return { accepted: false, reason: 'flight is flying the missed-approach procedure' };
  if (flight.navigation.hold) return { accepted: false, reason: 'release the aircraft from its hold before amending the route' };
  if (flight.phase === 'approach' && flight.progress >= 0.7) {
    return { accepted: false, reason: 'aircraft is established too close to final for a route amendment' };
  }
  const direction = flight.phase === 'approach'
    ? 'arrival'
    : flight.phase === 'takeoff' && !flight.motion.onGround
      ? 'departure'
      : null;
  if (!direction) return { accepted: false, reason: 'flight is not airborne and available for a route amendment' };

  const procedure = config.airspaceProgram.procedures.find((candidate) => candidate.id === flight.navigation.procedureId);
  if (!procedure) return { accepted: false, reason: `assigned procedure ${flight.navigation.procedureId} is unavailable` };
  const permittedFixIds = new Set([
    ...config.airspaceProgram.fixes.filter((fix) => fix.kind === 'entry').map((fix) => fix.id),
    ...procedure.commonFixIds,
    ...procedure.transitions.flatMap((transition) => transition.fixIds),
  ]);
  const requiredFinalFixId = direction === 'arrival'
    ? [...procedure.commonFixIds].reverse().find((fixId) => config.airspaceProgram.fixes.find((fix) => fix.id === fixId)?.kind === 'final')
    : undefined;
  const validation = validateTerminalRouteAmendment(
    config.airspaceProgram,
    direction,
    fixIds,
    permittedFixIds,
    requiredFinalFixId,
  );
  if (!validation.accepted) return validation;

  const points = routePoints(flight, validation.value);
  const distanceUnits = routeDistance(points);
  const speedUnitsPerSecond = flightSpeedUnitsPerSecond(flight);
  const first = validation.value[0];
  const targetHeading = Math.atan2(first.position[1] - flight.motion.y, first.position[0] - flight.motion.x);
  const initialTurnDegrees = radiansToDegrees(angularDifference(targetHeading, flight.motion.heading));
  const warnings: FlightRouteConflictWarning[] = [];
  if (initialTurnDegrees > 120) {
    warnings.push({
      code: 'excessive-initial-turn',
      severity: 'blocking',
      detail: `Initial intercept requires a ${Math.round(initialTurnDegrees)}° turn; issue an intermediate heading first.`,
    });
  }

  const requiredHorizontalNm = requiredRadarSeparationNm(rules, weather);
  for (const other of flights) {
    if (other.id === flight.id || !isAirborne(other)) continue;
    const warning = forecastRouteConflict(
      points,
      speedUnitsPerSecond,
      other,
      config,
      requiredHorizontalNm,
      rules.verticalFt,
    );
    if (warning) warnings.push(warning);
  }
  warnings.sort((firstWarning, secondWarning) => (
    warningPriority(firstWarning.severity) - warningPriority(secondWarning.severity)
    || (firstWarning.estimatedSeconds ?? Infinity) - (secondWarning.estimatedSeconds ?? Infinity)
    || (firstWarning.conflictingFlightId ?? 0) - (secondWarning.conflictingFlightId ?? 0)
  ));

  return {
    accepted: true,
    value: {
      fixes: validation.value,
      clearance: {
        schemaVersion: 2,
        revision,
        status: 'preview',
        routeFixIds: validation.value.map((fix) => fix.id),
        routeFixNames: validation.value.map((fix) => fix.name),
        previousRouteFixIds: [...flight.navigation.routeFixIds],
        previewedAtSeconds: atSeconds,
        issuedBy,
        distanceNm: round(distanceUnits * WORLD_METERS_PER_UNIT / METERS_PER_NM, 2),
        estimatedSeconds: Math.round(distanceUnits / Math.max(0.001, speedUnitsPerSecond)),
        initialTurnDegrees: round(initialTurnDegrees, 1),
        safeToIssue: !warnings.some((warning) => warning.severity === 'blocking'),
        warnings: warnings.slice(0, 6),
        supplements: [],
        safeguards: [
          'route and procedure compatibility checked',
          'initial turn checked',
          'terminal separation forecast checked',
        ],
      },
    },
  };
}

function forecastRouteConflict(
  candidatePoints: RoutePoint[],
  candidateSpeed: number,
  other: Flight,
  config: AirportConfig,
  requiredHorizontalNm: number,
  requiredVerticalFt: number,
): FlightRouteConflictWarning | null {
  const otherFixes = other.navigation.routeFixIds
    .slice(other.navigation.activeFixIndex)
    .map((fixId) => config.airspaceProgram.fixes.find((fix) => fix.id === fixId))
    .filter((fix): fix is AirspaceFix => Boolean(fix));
  const otherPoints = routePoints(other, otherFixes);
  if (otherPoints.length < 2) return null;
  const otherSpeed = flightSpeedUnitsPerSecond(other);
  const candidateDuration = routeDistance(candidatePoints) / Math.max(0.001, candidateSpeed);
  const otherDuration = routeDistance(otherPoints) / Math.max(0.001, otherSpeed);
  const horizon = Math.min(FORECAST_SECONDS, Math.max(FORECAST_STEP_SECONDS, candidateDuration, otherDuration));
  let earliest: { seconds: number; horizontalNm: number; verticalFt: number } | null = null;
  let closest = Infinity;

  for (let seconds = 0; seconds <= horizon + 1e-6; seconds += FORECAST_STEP_SECONDS) {
    const candidate = sampleRoute(candidatePoints, candidateSpeed * seconds);
    const comparison = sampleRoute(otherPoints, otherSpeed * seconds);
    const horizontalNm = Math.hypot(candidate.x - comparison.x, candidate.y - comparison.y)
      * WORLD_METERS_PER_UNIT / METERS_PER_NM;
    const verticalFt = Math.abs(candidate.altitudeFt - comparison.altitudeFt);
    const separated = horizontalNm >= requiredHorizontalNm || verticalFt >= requiredVerticalFt;
    if (!separated && (!earliest || seconds < earliest.seconds || horizontalNm < closest)) {
      earliest = { seconds, horizontalNm, verticalFt };
      closest = horizontalNm;
    }
    if (candidate.complete || comparison.complete) break;
  }
  if (!earliest) return null;
  const severity = earliest.seconds <= 35 ? 'blocking' : 'warning';
  return {
    code: 'predicted-loss-of-separation',
    severity,
    conflictingFlightId: other.id,
    conflictingCallsign: other.callsign,
    estimatedSeconds: Math.round(earliest.seconds),
    horizontalNm: round(earliest.horizontalNm, 2),
    verticalFt: Math.round(earliest.verticalFt),
    detail: `${other.callsign} forecast in ${Math.round(earliest.seconds)} sec at ${earliest.horizontalNm.toFixed(2)} NM / ${Math.round(earliest.verticalFt)} ft; requires ${requiredHorizontalNm} NM or ${requiredVerticalFt} ft.`,
  };
}

function routePoints(flight: Flight, fixes: readonly AirspaceFix[]): RoutePoint[] {
  const assignedAltitudeFt = flight.navigation.assignedAltitudeFt;
  return [
    { x: flight.motion.x, y: flight.motion.y, altitudeFt: flight.kinematics.altitudeFt },
    ...fixes.map((fix) => ({
      x: fix.position[0],
      y: fix.position[1],
      altitudeFt: assignedAltitudeFt ?? fix.altitudeFt,
    })),
  ];
}

function routeDistance(points: readonly RoutePoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}

function sampleRoute(points: readonly RoutePoint[], distance: number): RouteSample {
  let remaining = Math.max(0, distance);
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (remaining <= length || index === points.length - 1) {
      const amount = length <= 1e-6 ? 1 : Math.min(1, remaining / length);
      return {
        x: from.x + (to.x - from.x) * amount,
        y: from.y + (to.y - from.y) * amount,
        altitudeFt: from.altitudeFt + (to.altitudeFt - from.altitudeFt) * amount,
        complete: amount >= 1 && index === points.length - 1,
      };
    }
    remaining -= length;
  }
  const last = points.at(-1) ?? { x: 0, y: 0, altitudeFt: 0 };
  return { ...last, complete: true };
}

function flightSpeedUnitsPerSecond(flight: Flight): number {
  const speedKts = Math.max(90, flight.navigation.assignedSpeedKts ?? flight.kinematics.airspeedKts);
  return speedKts * KNOT_TO_MPS / WORLD_METERS_PER_UNIT;
}

function isAirborne(flight: Flight): boolean {
  return !flight.motion.onGround && (flight.phase === 'approach' || flight.phase === 'landing' || flight.phase === 'takeoff');
}

function angularDifference(first: number, second: number): number {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

function radiansToDegrees(value: number): number {
  return value * 180 / Math.PI;
}

function warningPriority(severity: FlightRouteConflictWarning['severity']): number {
  return severity === 'blocking' ? 0 : severity === 'warning' ? 1 : 2;
}

function round(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

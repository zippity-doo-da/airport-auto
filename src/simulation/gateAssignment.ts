import { aircraftProfile, type AircraftModel } from './aircraftProfiles';
import type { AirlineCode } from './airlineProfiles';
import type { OperationTrafficClass } from './airportOperationProfiles';
import { airlineGatePreference } from './airportTrafficPrograms';
import type { AirportConfig } from './airportConfig';
import {
  surfaceRouteForFlight,
  surfaceStandSupportsAircraft,
  type SurfaceOperationalZone,
  type SurfaceRoutePlanning,
  type SurfaceStand,
} from './surfaceGraph';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';
import { parkedAircraftBodyRadius, PHYSICAL_GAP } from './collisionDetection';
import type { FlightGateAssignment, FlightService, GateServiceArea } from './types';

const KNOT_TO_MPS = 0.514444;
export const GATE_TURN_BUFFER_SECONDS = 18;

/** A planned interval during which another active flight needs a stand. */
export interface GateReservation {
  flightId: number;
  standId: string;
  aircraft?: AircraftModel;
  terminalId?: string;
  startSeconds: number;
  endSeconds: number;
}

export interface GateAssignmentRequest {
  config: AirportConfig;
  flightId: number;
  aircraft: AircraftModel;
  airline: AirlineCode;
  service: FlightService;
  trafficClass: OperationTrafficClass;
  arrivalRunway: number;
  arrivalOperatingEnd: -1 | 1;
  departureRunway: number;
  departureOperatingEnd: -1 | 1;
  readyForTaxiAtSeconds: number;
  turnaroundSeconds: number;
  nextDestination: string;
  assignedAtSeconds: number;
  reservations: GateReservation[];
  revision?: number;
  previousStandId?: string;
  excludedStandIds?: ReadonlySet<string>;
  planning?: SurfaceRoutePlanning;
}

interface StaticGateCandidate {
  stand: SurfaceStand;
  zone: SurfaceOperationalZone | undefined;
  service: FitScore<FlightGateAssignment['serviceFit']>;
  airline: FitScore<FlightGateAssignment['airlineFit']>;
  staticScore: number;
}

interface FitScore<T extends string> {
  fit: T;
  penalty: number;
  reason: string;
}

/**
 * Select a physically valid, time-compatible stand. Lower score is better.
 * Route geometry contributes both the arrival taxi and the next departure,
 * while reservation windows allow safe future reuse without double occupancy.
 */
export function planGateAssignment(request: GateAssignmentRequest): FlightGateAssignment | null {
  const profile = aircraftProfile(request.aircraft);
  const zoneById = new Map(request.config.surfaceGraph.zones.map((zone) => [zone.id, zone]));
  const physical = request.config.surfaceGraph.stands
    .filter((stand) => !request.excludedStandIds?.has(stand.id))
    .filter((stand) => surfaceStandSupportsAircraft(stand, profile.category, profile.wingspanM))
    .map((stand): StaticGateCandidate => {
      const zone = zoneById.get(stand.zoneId);
      const service = serviceFit(request, stand, zone);
      const airline = airlineFit(request, stand, zone);
      const headroomPenalty = Math.max(0, stand.maximumWingspanM - profile.wingspanM) * 0.08;
      return {
        stand,
        zone,
        service,
        airline,
        staticScore: service.penalty + airline.penalty + headroomPenalty,
      };
    })
    .sort((first, second) => first.staticScore - second.staticScore || first.stand.slot - second.stand.slot);

  if (!physical.length) return null;
  let best: FlightGateAssignment | null = null;
  for (const candidate of physical) {
    // Static score is a lower bound because route, schedule, load, and tie
    // penalties are all non-negative. Once it exceeds the best complete score,
    // no later candidate can win and expensive graph searches can stop.
    if (best && candidate.staticScore > best.score) break;
    const decision = evaluateCandidates(request, [candidate])[0];
    if (decision && (!best || decision.score < best.score || (decision.score === best.score && decision.gateSlot < best.gateSlot))) {
      best = decision;
    }
  }
  return best;
}

export function gateReservationsOverlap(
  first: Pick<GateReservation, 'startSeconds' | 'endSeconds'>,
  second: Pick<GateReservation, 'startSeconds' | 'endSeconds'>,
  bufferSeconds = GATE_TURN_BUFFER_SECONDS,
): boolean {
  return first.startSeconds < second.endSeconds + bufferSeconds
    && first.endSeconds + bufferSeconds > second.startSeconds;
}

export function standReservationsConflict(
  config: AirportConfig,
  firstStandId: string,
  firstAircraft: AircraftModel,
  secondStandId: string,
  secondAircraft: AircraftModel,
): boolean {
  if (firstStandId === secondStandId) return true;
  const first = config.surfaceGraph.stands.find((stand) => stand.id === firstStandId);
  const second = config.surfaceGraph.stands.find((stand) => stand.id === secondStandId);
  if (!first || !second) return false;
  const distance = Math.hypot(first.position[0] - second.position[0], first.position[1] - second.position[1]);
  return distance + 1e-6 < parkedAircraftBodyRadius(config.scope, firstAircraft)
    + parkedAircraftBodyRadius(config.scope, secondAircraft)
    + PHYSICAL_GAP;
}

export function standServiceArea(
  stand: SurfaceStand,
  zone: SurfaceOperationalZone | undefined,
): GateServiceArea {
  if (stand.concourse || stand.terminalId || zone?.kind === 'terminal-apron') return 'passenger-terminal';
  if (zone?.kind === 'cargo-ramp') return 'cargo-ramp';
  if (zone?.kind === 'remote-ramp') return 'remote-ramp';
  if (zone?.kind === 'maintenance') return 'maintenance';
  if (zone?.kind === 'general-aviation') return 'general-aviation';
  return 'other';
}

function evaluateCandidates(
  request: GateAssignmentRequest,
  candidates: StaticGateCandidate[],
): FlightGateAssignment[] {
  const profile = aircraftProfile(request.aircraft);
  const routeRequirements = {
    wingspanM: profile.wingspanM,
    minimumWingtipClearanceM: profile.minimumWingtipClearanceM,
  };
  const taxiMps = Math.max(1, profile.taxiKts * KNOT_TO_MPS);
  const decisions: FlightGateAssignment[] = [];

  for (const candidate of candidates) {
    const arrivalRoute = surfaceRouteForFlight(
      request.config.surfaceGraph,
      request.arrivalRunway,
      request.arrivalOperatingEnd,
      'taxi-in',
      candidate.stand.slot,
      routeRequirements,
      request.planning,
    );
    const departureRoute = surfaceRouteForFlight(
      request.config.surfaceGraph,
      request.departureRunway,
      request.departureOperatingEnd,
      'taxi-out',
      candidate.stand.slot,
      routeRequirements,
      request.planning,
    );
    if (!arrivalRoute || !departureRoute) continue;

    const arrivalTaxiSeconds = arrivalRoute.distance * WORLD_METERS_PER_UNIT / taxiMps;
    const departureTaxiSeconds = departureRoute.distance * WORLD_METERS_PER_UNIT / taxiMps;
    const scheduledGateInSeconds = request.readyForTaxiAtSeconds + arrivalTaxiSeconds;
    const scheduledDepartureSeconds = scheduledGateInSeconds + request.turnaroundSeconds;
    const proposedWindow = {
      startSeconds: scheduledGateInSeconds,
      endSeconds: scheduledDepartureSeconds,
    };
    const overlappingReservations = request.reservations.filter((reservation) => gateReservationsOverlap(proposedWindow, reservation));
    if (overlappingReservations.some((reservation) => (
      reservation.standId === candidate.stand.id
      || (reservation.aircraft !== undefined && standReservationsConflict(
        request.config,
        candidate.stand.id,
        request.aircraft,
        reservation.standId,
        reservation.aircraft,
      ))
    ))) continue;
    const standReservations = request.reservations.filter((reservation) => reservation.standId === candidate.stand.id);

    const routePenalty = arrivalRoute.distance * 0.16 + departureRoute.distance * 0.24;
    const windowPenalty = standWindowPenalty(proposedWindow, standReservations);
    const terminalLoad = request.reservations.filter((reservation) => (
      candidate.stand.terminalId
      && reservation.terminalId === candidate.stand.terminalId
      && gateReservationsOverlap(proposedWindow, reservation, 0)
    )).length;
    const deterministicTieBreak = ((candidate.stand.slot * 37 + request.flightId * 13) % 29) / 100;
    const score = candidate.staticScore + routePenalty + windowPenalty + terminalLoad * 1.5 + deterministicTieBreak;
    const serviceArea = standServiceArea(candidate.stand, candidate.zone);
    decisions.push({
      standId: candidate.stand.id,
      gateSlot: candidate.stand.slot,
      terminal: candidate.stand.terminal,
      terminalId: candidate.stand.terminalId,
      concourse: candidate.stand.concourse,
      gateRef: candidate.stand.gateRef,
      zoneId: candidate.stand.zoneId,
      zoneName: candidate.zone?.name ?? candidate.stand.terminal,
      serviceArea,
      assignedAtSeconds: request.assignedAtSeconds,
      scheduledGateInSeconds,
      scheduledDepartureSeconds,
      nextDestination: request.nextDestination,
      departureRunway: request.departureRunway,
      airlineFit: candidate.airline.fit,
      serviceFit: candidate.service.fit,
      arrivalRouteDistance: round2(arrivalRoute.distance),
      departureRouteDistance: round2(departureRoute.distance),
      score: round2(score),
      rationale: [
        candidate.airline.reason,
        candidate.service.reason,
        `${request.aircraft} fits ${Math.round(candidate.stand.maximumWingspanM)} m stand limit`,
        `${Math.round(arrivalTaxiSeconds + departureTaxiSeconds)} s combined arrival/departure taxi`,
      ],
      revision: request.revision ?? 0,
      previousStandId: request.previousStandId,
    });
  }
  return decisions;
}

function serviceFit(
  request: Pick<GateAssignmentRequest, 'service' | 'airline' | 'aircraft'>,
  stand: SurfaceStand,
  zone: SurfaceOperationalZone | undefined,
): FitScore<FlightGateAssignment['serviceFit']> {
  const area = standServiceArea(stand, zone);
  if (request.airline === 'LOCAL' && request.aircraft === 'PC12') {
    if (area === 'general-aviation') return { fit: 'preferred', penalty: 0, reason: `${zone?.name ?? 'General aviation ramp'} utility-aircraft stand` };
    if (area === 'remote-ramp') return { fit: 'compatible', penalty: 55, reason: `${zone?.name ?? 'Remote ramp'} utility-aircraft fallback` };
    return { fit: 'fallback', penalty: area === 'passenger-terminal' ? 390 : 260, reason: `${area.replace('-', ' ')} utility-aircraft fallback` };
  }
  if (request.service === 'cargo') {
    if (area === 'cargo-ramp') return { fit: 'preferred', penalty: 0, reason: `${zone?.name ?? 'Cargo ramp'} freighter stand` };
    if (area === 'remote-ramp') return { fit: 'compatible', penalty: 90, reason: `${zone?.name ?? 'Remote ramp'} cargo fallback` };
    if (area === 'maintenance') return { fit: 'fallback', penalty: 150, reason: 'maintenance apron cargo fallback' };
    return { fit: 'fallback', penalty: area === 'passenger-terminal' ? 620 : 320, reason: `${area.replace('-', ' ')} service fallback` };
  }
  if (area === 'passenger-terminal') return { fit: 'preferred', penalty: 0, reason: `${stand.terminal}${stand.concourse ? ` Concourse ${stand.concourse}` : ''} passenger stand` };
  if (area === 'remote-ramp') return { fit: 'compatible', penalty: 135, reason: `${zone?.name ?? 'Remote ramp'} passenger fallback` };
  return { fit: 'fallback', penalty: area === 'cargo-ramp' ? 520 : 330, reason: `${area.replace('-', ' ')} passenger fallback` };
}

function airlineFit(
  request: GateAssignmentRequest,
  stand: SurfaceStand,
  zone: SurfaceOperationalZone | undefined,
): FitScore<FlightGateAssignment['airlineFit']> {
  if (request.airline === 'LOCAL' && request.aircraft === 'PC12') {
    const area = standServiceArea(stand, zone);
    if (area === 'general-aviation') return { fit: 'preferred', penalty: 0, reason: 'general aviation home ramp' };
    if (area === 'remote-ramp') return { fit: 'compatible', penalty: 24, reason: 'compatible utility-aircraft ramp' };
    return { fit: 'fallback', penalty: 180, reason: 'off-ramp utility-aircraft fallback' };
  }
  const preference = airlineGatePreference(request.config.code, request.airline, request.trafficClass);
  if (preference?.zoneNames?.includes(zone?.name ?? '')) {
    return { fit: 'preferred', penalty: preference.zoneNames.indexOf(zone?.name ?? '') * 10, reason: `${preference.label} home ramp` };
  }
  if (preference?.concourses?.includes(stand.concourse ?? '')) {
    return { fit: 'preferred', penalty: preference.concourses.indexOf(stand.concourse ?? '') * 2, reason: `${preference.label} · Concourse ${stand.concourse}` };
  }
  if (preference?.concourses && stand.concourse) {
    return { fit: 'fallback', penalty: 190, reason: `${stand.concourse} overflow outside ${preference.label}` };
  }
  if (preference?.zoneNames && request.service === 'cargo' && zone?.kind === 'cargo-ramp') {
    return { fit: 'compatible', penalty: 62, reason: `compatible cargo overflow outside ${preference.label}` };
  }
  if (preference?.standSector) {
    const stands = request.config.surfaceGraph.stands
      .filter((candidate) => candidate.terminal === stand.terminal)
      .sort((first, second) => first.slot - second.slot);
    const position = Math.max(0, stands.findIndex((candidate) => candidate.id === stand.id));
    const normalized = stands.length <= 1 ? 0.5 : position / (stands.length - 1);
    const [start, end] = preference.standSector;
    const distance = normalized < start ? start - normalized : normalized > end ? normalized - end : 0;
    if (distance <= 1e-6) return { fit: 'preferred', penalty: 0, reason: preference.label };
    return distance <= 0.22
      ? { fit: 'compatible', penalty: Math.round(distance * 180), reason: `adjacent overflow near ${preference.label}` }
      : { fit: 'fallback', penalty: Math.round(85 + distance * 210), reason: `remote overflow outside ${preference.label}` };
  }

  const passengerStands = request.config.surfaceGraph.stands.filter((candidate) => candidate.terminal === stand.terminal);
  const terminalSlots = passengerStands.map((candidate) => candidate.slot).sort((first, second) => first - second);
  const position = Math.max(0, terminalSlots.indexOf(stand.slot));
  const band = Math.min(3, Math.floor(position / Math.max(1, terminalSlots.length) * 4));
  const preferredBand = airlineHash(request.airline) % 4;
  const bandDistance = Math.abs(band - preferredBand);
  return bandDistance === 0
    ? { fit: 'preferred', penalty: 0, reason: `${request.airline} home terminal sector` }
    : { fit: 'compatible', penalty: bandDistance * 18, reason: `${request.airline} overflow terminal sector` };
}

function standWindowPenalty(
  proposed: Pick<GateReservation, 'startSeconds' | 'endSeconds'>,
  reservations: GateReservation[],
): number {
  if (!reservations.length) return 0;
  const nearestGap = Math.min(...reservations.map((reservation) => (
    proposed.startSeconds >= reservation.endSeconds
      ? proposed.startSeconds - reservation.endSeconds
      : reservation.startSeconds - proposed.endSeconds
  )));
  return Math.max(0, 75 - nearestGap) * 0.45;
}

function airlineHash(airline: AirlineCode): number {
  return [...airline].reduce((total, character) => total * 31 + character.charCodeAt(0), 7);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

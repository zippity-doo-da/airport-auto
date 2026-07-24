import { aircraftProfile, type AircraftModel } from './aircraftProfiles';
import type { AirlineCode } from './airlineProfiles';
import type { AirportConfig } from './airportConfig';
import {
  surfaceRouteForFlight,
  surfaceStandSupportsAircraft,
  type SurfaceOperationalZone,
  type SurfaceRoutePlanning,
  type SurfaceStand,
} from './surfaceGraph';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';
import type { FlightGateAssignment, FlightService, GateServiceArea } from './types';

const KNOT_TO_MPS = 0.514444;
export const GATE_TURN_BUFFER_SECONDS = 18;

/** A planned interval during which another active flight needs a stand. */
export interface GateReservation {
  flightId: number;
  standId: string;
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

// Schematic preferences follow the Chicago Department of Aviation's May 2026
// gate allocation: United across B/C/E/F/G, American across G/H/K/L, Delta at
// M, and common-use traffic primarily at M. They are operational affinities,
// not a claim that every sampled stand is preferentially leased.
const ORD_PASSENGER_CONCOURSES: Partial<Record<AirlineCode, readonly string[]>> = {
  UA: ['B', 'C', 'E', 'F', 'G'],
  AA: ['G', 'H', 'K', 'L'],
  DL: ['M'],
  WN: ['M'],
  B6: ['M'],
  F9: ['M'],
  EK: ['M'],
  NH: ['M'],
  BA: ['M'],
  TK: ['M'],
};

// CDA identifies the Southwest Cargo Ramp as FedEx-only and the Southeast
// Cargo Ramp as UPS/FedEx/multi-user. Other cargo stands remain valid fallbacks.
const ORD_CARGO_RAMP_PREFERENCES: Partial<Record<AirlineCode, readonly string[]>> = {
  '5X': ['Southeast Cargo Ramp'],
  FX: ['Southwest Cargo Ramp', 'Southeast Cargo Ramp'],
  FDX: ['Southwest Cargo Ramp', 'Southeast Cargo Ramp'],
};

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
      const service = serviceFit(request.service, stand, zone);
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
    const standReservations = request.reservations.filter((reservation) => reservation.standId === candidate.stand.id);
    if (standReservations.some((reservation) => gateReservationsOverlap(proposedWindow, reservation))) continue;

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
  service: FlightService,
  stand: SurfaceStand,
  zone: SurfaceOperationalZone | undefined,
): FitScore<FlightGateAssignment['serviceFit']> {
  const area = standServiceArea(stand, zone);
  if (service === 'cargo') {
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
  if (request.config.code === 'ORD' && request.service === 'cargo') {
    const preferredRamps = ORD_CARGO_RAMP_PREFERENCES[request.airline];
    if (preferredRamps?.includes(zone?.name ?? '')) {
      return { fit: 'preferred', penalty: preferredRamps.indexOf(zone?.name ?? '') * 12, reason: `${request.airline} home cargo ramp` };
    }
    if (zone?.kind === 'cargo-ramp') return { fit: 'compatible', penalty: preferredRamps ? 62 : 20, reason: 'compatible ORD cargo ramp' };
    return { fit: 'fallback', penalty: 170, reason: 'off-ramp airline fallback' };
  }

  if (request.config.code === 'ORD' && request.service === 'passenger') {
    const preferredConcourses = ORD_PASSENGER_CONCOURSES[request.airline];
    if (stand.concourse && preferredConcourses?.includes(stand.concourse)) {
      return { fit: 'preferred', penalty: preferredConcourses.indexOf(stand.concourse) * 2, reason: `${request.airline} home Concourse ${stand.concourse}` };
    }
    if (stand.concourse) return { fit: preferredConcourses ? 'fallback' : 'compatible', penalty: preferredConcourses ? 190 : 35, reason: `${stand.concourse} common/overflow gate` };
    return { fit: 'fallback', penalty: 290, reason: 'non-terminal airline fallback' };
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

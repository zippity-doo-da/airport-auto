import type { AircraftModel } from './aircraftProfiles';
import type { AirlineCode } from './airlineProfiles';
import type { OperationTrafficClass } from './airportOperationProfiles';
import type { FlightGateAssignment, FlightPlan, FlightPlanAmendmentKind } from './types';

export interface FlightPlanInput {
  flightId: number;
  legNumber: number;
  direction: FlightPlan['direction'];
  origin: string;
  destination: string;
  procedure: string;
  airline: AirlineCode;
  aircraft: AircraftModel;
  trafficClass: OperationTrafficClass;
  gateAssignment: FlightGateAssignment;
  runwayId: number;
  operatingEnd: -1 | 1;
  runwayDesignation: string;
  createdAtSeconds: number;
  scheduledReleaseSeconds: number;
  estimatedArrivalSeconds: number;
  airportSeed: number;
}

export function createFlightPlan(input: FlightPlanInput): FlightPlan {
  return {
    schemaVersion: 1,
    id: `FP-${input.flightId}-${input.legNumber}`,
    revision: 1,
    status: input.scheduledReleaseSeconds > input.createdAtSeconds ? 'scheduled' : 'active',
    direction: input.direction,
    origin: input.origin,
    destination: input.destination,
    route: schematicRoute(input.origin, input.destination, input.flightId + input.legNumber, input.airportSeed),
    routeKind: 'schematic-direct',
    procedure: input.procedure,
    airline: input.airline,
    aircraft: input.aircraft,
    trafficClass: input.trafficClass,
    gateIntent: gateIntent(input.gateAssignment),
    runwayIntent: {
      runwayId: input.runwayId,
      operatingEnd: input.operatingEnd,
      designation: input.runwayDesignation,
    },
    createdAtSeconds: input.createdAtSeconds,
    scheduledReleaseSeconds: input.scheduledReleaseSeconds,
    estimatedArrivalSeconds: input.estimatedArrivalSeconds,
    amendments: [],
  };
}

export function amendFlightPlan(
  plan: FlightPlan,
  kind: FlightPlanAmendmentKind,
  atSeconds: number,
  detail: string,
  changes: Partial<Pick<FlightPlan, 'origin' | 'destination' | 'route' | 'procedure' | 'scheduledReleaseSeconds' | 'estimatedArrivalSeconds'>> & {
    gateAssignment?: FlightGateAssignment;
    runwayIntent?: FlightPlan['runwayIntent'];
  } = {},
): void {
  plan.revision += 1;
  if (changes.origin !== undefined) plan.origin = changes.origin;
  if (changes.destination !== undefined) plan.destination = changes.destination;
  if (changes.route !== undefined) plan.route = [...changes.route];
  if (changes.procedure !== undefined) plan.procedure = changes.procedure;
  if (changes.scheduledReleaseSeconds !== undefined) plan.scheduledReleaseSeconds = changes.scheduledReleaseSeconds;
  if (changes.estimatedArrivalSeconds !== undefined) plan.estimatedArrivalSeconds = changes.estimatedArrivalSeconds;
  if (changes.gateAssignment) plan.gateIntent = gateIntent(changes.gateAssignment);
  if (changes.runwayIntent) plan.runwayIntent = { ...changes.runwayIntent };
  plan.amendments.push({ revision: plan.revision, kind, atSeconds, detail });
}

export function setFlightPlanStatus(
  plan: FlightPlan,
  status: FlightPlan['status'],
  atSeconds: number,
  detail?: string,
): void {
  plan.status = status;
  if (status === 'diverted' || status === 'cancelled') {
    amendFlightPlan(plan, status === 'diverted' ? 'diversion' : 'cancellation', atSeconds, detail ?? status);
  }
}

export function cloneFlightPlan(plan: FlightPlan): FlightPlan {
  return {
    ...plan,
    route: [...plan.route],
    gateIntent: { ...plan.gateIntent },
    runwayIntent: { ...plan.runwayIntent },
    amendments: plan.amendments.map((amendment) => ({ ...amendment })),
  };
}

function gateIntent(assignment: FlightGateAssignment): FlightPlan['gateIntent'] {
  return {
    standId: assignment.standId,
    gateRef: assignment.gateRef,
    terminalId: assignment.terminalId,
    concourse: assignment.concourse,
  };
}

function schematicRoute(origin: string, destination: string, id: number, seed: number): string[] {
  const corridors = ['NORTH', 'NORTHEAST', 'EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST', 'OCEANIC'];
  const value = deterministicUnit(id, seed);
  const corridor = corridors[Math.floor(value * corridors.length) % corridors.length];
  return [origin, `${corridor}-CORRIDOR`, destination];
}

function deterministicUnit(id: number, seed: number): number {
  let value = (Math.imul(id, 0x9e3779b1) ^ seed ^ 0x6d2b79f5) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1) >>> 0;
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
}

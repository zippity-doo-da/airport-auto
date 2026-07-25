import type { AircraftModel } from './aircraftProfiles';
import type { AirlineCode } from './airlineProfiles';
import type { OperationTrafficClass } from './airportOperationProfiles';
import type { FlightGateAssignment, FlightPlan, FlightPlanAmendmentKind } from './types';
import type { SelectedTerminalProcedure } from './airspaceProcedures';

export interface FlightPlanInput {
  flightId: number;
  legNumber: number;
  direction: FlightPlan['direction'];
  origin: string;
  destination: string;
  procedureSelection: SelectedTerminalProcedure;
  procedureDataVersion: string;
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
  const selected = input.procedureSelection;
  return {
    schemaVersion: 2,
    id: `FP-${input.flightId}-${input.legNumber}`,
    revision: 1,
    status: input.scheduledReleaseSeconds > input.createdAtSeconds ? 'scheduled' : 'active',
    direction: input.direction,
    origin: input.origin,
    destination: input.destination,
    route: [input.origin, ...selected.routeFixIds, input.destination],
    routeKind: 'schematic-procedure',
    procedure: selected.procedure.name,
    procedureProfile: {
      dataVersion: input.procedureDataVersion,
      id: selected.procedure.id,
      kind: selected.procedure.kind,
      revision: selected.procedure.revision,
      transitionId: selected.transition.id,
      transitionName: selected.transition.name,
      routeFixIds: [...selected.routeFixIds],
      constraints: selected.procedure.constraints.map((constraint) => ({ ...constraint })),
      nonNavigational: true,
    },
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
    procedureSelection?: SelectedTerminalProcedure;
    procedureDataVersion?: string;
  } = {},
): void {
  plan.revision += 1;
  if (changes.origin !== undefined) plan.origin = changes.origin;
  if (changes.destination !== undefined) plan.destination = changes.destination;
  if (changes.route !== undefined) plan.route = [...changes.route];
  if (changes.procedure !== undefined) plan.procedure = changes.procedure;
  if (changes.procedureSelection) {
    const selected = changes.procedureSelection;
    plan.procedure = selected.procedure.name;
    plan.procedureProfile = {
      dataVersion: changes.procedureDataVersion ?? plan.procedureProfile.dataVersion,
      id: selected.procedure.id,
      kind: selected.procedure.kind,
      revision: selected.procedure.revision,
      transitionId: selected.transition.id,
      transitionName: selected.transition.name,
      routeFixIds: [...selected.routeFixIds],
      constraints: selected.procedure.constraints.map((constraint) => ({ ...constraint })),
      nonNavigational: true,
    };
    plan.route = [plan.origin, ...selected.routeFixIds, plan.destination];
  }
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
    procedureProfile: {
      ...plan.procedureProfile,
      routeFixIds: [...plan.procedureProfile.routeFixIds],
      constraints: plan.procedureProfile.constraints.map((constraint) => ({ ...constraint })),
    },
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

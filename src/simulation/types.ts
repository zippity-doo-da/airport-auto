export type FlightPhase = 'approach' | 'landing' | 'taxi-in' | 'resting' | 'taxi-out' | 'takeoff';

import type { FlightColor, RunwayOperationalRole } from './airportConfig';
import type { AircraftModel } from './aircraftProfiles';
import type { AirlineCode } from './airlineProfiles';
import type { OperationTrafficClass } from './airportOperationProfiles';
import type { TrafficDensity } from './trafficDensity';
import type { ProcedureConstraint, TerminalProcedureKind } from './airspaceProcedures';
import type { SeparationRulesetId } from './separationRules';

export type ControlMode = 'auto' | 'assisted' | 'manual' | 'watch';
export type WeatherCondition = 'clear' | 'rain' | 'fog' | 'snow';
export type TrafficScenario = 'normal' | 'rush' | 'storm' | 'closure' | 'training' | 'emergency';
export type ControllerStation = 'tower' | 'ground' | 'approach' | 'supervisor';
export type FlightInstruction = 'slow' | 'normal' | 'expedite' | 'hold' | 'resume' | 'zigzag';
export type AircraftCategory = 'regional' | 'narrowbody' | 'widebody' | 'cargo';
export type WakeClass = 'light' | 'medium' | 'heavy';
export type EmergencyType = 'medical' | 'disabled' | 'birdstrike' | 'go-around';
export type EngineState = 'off' | 'starting' | 'running';
export type FlightService = 'passenger' | 'cargo';
export type TurnaroundServiceType = 'fueling' | 'baggage' | 'cargo' | 'catering' | 'cleaning' | 'boarding' | 'maintenance';
export type TurnaroundTaskStatus = 'not-required' | 'waiting' | 'active' | 'complete';
export type TurnaroundStatus = 'planned' | 'servicing' | 'ready' | 'released';
export type DeicingStatus = 'not-required' | 'planned' | 'enroute' | 'queued' | 'positioning' | 'treating' | 'protected' | 'expired' | 'unavailable';
export type DeicingFluid = 'Type I' | 'Type I + Type IV';
export type SurfaceDisruptionKind = 'runway-closure' | 'taxiway-closure' | 'construction' | 'disabled-aircraft';
export type SurfaceDisruptionStatus = 'pending' | 'active' | 'recovering';
export type SurfaceDisruptionSource = 'scenario' | 'controller' | 'incident';

/**
 * A topology-changing surface restriction. edgeIds are the authoritative
 * resources unavailable to routing and reservation code while active.
 */
export interface SurfaceDisruptionState {
  id: string;
  kind: SurfaceDisruptionKind;
  status: SurfaceDisruptionStatus;
  source: SurfaceDisruptionSource;
  targetId: string;
  label: string;
  edgeIds: string[];
  runwayId?: number;
  taxiwayId?: string;
  flightId?: number;
  createdAtSeconds: number;
  activatedAtSeconds?: number;
  expectedClearAtSeconds?: number;
  durationSeconds?: number;
  recoveryStartedAtSeconds?: number;
  recoveryDurationSeconds?: number;
  recoveryProgress: number;
  reroutedFlightIds: number[];
  reason: string;
}

export interface FlightSurfaceRerouteState {
  revision: number;
  status: 'rerouted' | 'holding';
  selectedAtSeconds: number;
  disruptionIds: string[];
  previousEdgeIds: string[];
  routeEdgeIds: string[];
  addedDistanceM: number;
  reason: string;
}

/**
 * Fixed-step winter ground-operation state. Route progress values refer to the
 * aircraft's authoritative taxi-out route, so queueing, treatment, rendering,
 * collision checks, replay, and the agent interface all observe one position.
 */
export interface FlightDeicingState {
  required: boolean;
  status: DeicingStatus;
  facilityId?: string;
  facilityName?: string;
  laneId?: string;
  laneNumber?: number;
  queuePosition: number;
  queueHoldProgress: number;
  treatmentProgress: number;
  padExitProgress: number;
  treatmentDurationSeconds: number;
  treatmentElapsedSeconds: number;
  holdoverSeconds: number;
  holdoverRemainingSeconds: number;
  fluid: DeicingFluid;
  cycle: number;
  reason: string;
  queueEnteredSeconds?: number;
  treatmentStartedSeconds?: number;
  treatmentCompletedSeconds?: number;
  holdoverExpiresSeconds?: number;
}

export type ServiceVehicleType = 'fuel-truck' | 'baggage-cart' | 'cargo-loader' | 'catering-truck' | 'cleaning-van' | 'maintenance-van' | 'passenger-bus';
export type ServiceVehicleStatus = 'scheduled' | 'dispatching' | 'staged' | 'approaching' | 'servicing' | 'clearing' | 'returning' | 'complete';

/**
 * Authoritative fixed-step state for one turnaround vehicle. Graph routes and
 * the stand-side path are part of replay state; the renderer only consumes the
 * resulting pose and never creates an independent animation path.
 */
export interface ServiceVehicleState {
  id: string;
  flightId: number;
  callsign: string;
  service: TurnaroundServiceType;
  type: ServiceVehicleType;
  label: string;
  status: ServiceVehicleStatus;
  standId: string;
  zoneId: string;
  bayId: string;
  standSide: 'left' | 'right';
  depotNodeId: string;
  outboundRoute: string[];
  outboundRouteEdges: string[];
  returnRoute: string[];
  returnRouteEdges: string[];
  /** Staging point, stand-side bend, and service bay in world coordinates. */
  standPath: Array<[number, number]>;
  dispatchAtSeconds: number;
  /** Keep the vehicle off-map until its stand staging point is physically free. */
  prepositionAtStand?: boolean;
  progress: number;
  x: number;
  y: number;
  heading: number;
  groundSpeedMps: number;
  maximumSpeedMps: number;
  currentNode?: string;
  currentEdge?: string;
  held: boolean;
  holdReason?: string;
  protectedMovementArea: boolean;
  protectedMovementAuthorized: boolean;
}

export interface TurnaroundTaskState {
  type: TurnaroundServiceType;
  label: string;
  required: boolean;
  status: TurnaroundTaskStatus;
  durationSeconds: number;
  scheduledStartOffsetSeconds: number;
  elapsedSeconds: number;
  dependencies: TurnaroundServiceType[];
  reason: string;
  actualStartSeconds?: number;
  actualCompleteSeconds?: number;
}

export interface FlightTurnaroundState {
  status: TurnaroundStatus;
  plannedDurationSeconds: number;
  elapsedSeconds: number;
  progress: number;
  scheduledStartSeconds: number;
  scheduledReadySeconds: number;
  actualStartSeconds?: number;
  actualReadySeconds?: number;
  releasedAtSeconds?: number;
  initialFuelPercent: number;
  targetFuelPercent: number;
  tasks: TurnaroundTaskState[];
}

export type GateServiceArea = 'passenger-terminal' | 'cargo-ramp' | 'remote-ramp' | 'maintenance' | 'general-aviation' | 'other';

export interface FlightGateAssignment {
  standId: string;
  gateSlot: number;
  terminal: string;
  terminalId?: string;
  concourse?: string;
  gateRef?: string;
  zoneId: string;
  zoneName: string;
  serviceArea: GateServiceArea;
  assignedAtSeconds: number;
  scheduledGateInSeconds: number;
  scheduledDepartureSeconds: number;
  actualGateInSeconds?: number;
  actualGateOutSeconds?: number;
  nextDestination: string;
  departureRunway: number;
  airlineFit: 'preferred' | 'compatible' | 'fallback';
  serviceFit: 'preferred' | 'compatible' | 'fallback';
  arrivalRouteDistance: number;
  departureRouteDistance: number;
  score: number;
  rationale: string[];
  revision: number;
  previousStandId?: string;
}

export type RunwayBrakingAction = 'good' | 'medium' | 'poor';

/**
 * Authoritative arrival-exit decision. The landing trajectory terminates at
 * nodeId and the taxi-in route begins at the same node, so the rendered turn
 * and the protected surface route cannot disagree.
 */
export interface FlightRunwayExitState {
  runwayId: number;
  operatingEnd: -1 | 1;
  nodeId: string;
  taxiwayId: string;
  taxiwayName: string;
  source: 'surface-graph' | 'runway-end';
  selectedAtSeconds: number;
  candidateCount: number;
  distanceFromThresholdM: number;
  touchdownDistanceM: number;
  requiredRolloutM: number;
  availableRolloutM: number;
  stoppingMarginM: number;
  brakingAction: RunwayBrakingAction;
  brakingMultiplier: number;
  targetExitSpeedKts: number;
  exitAngleDegrees: number;
  highSpeed: boolean;
  routeDistanceM: number;
  congestionPenaltyM: number;
  trafficPenaltyM: number;
  score: number;
  safe: boolean;
  taxiRouteEdgeIds: string[];
  rationale: string[];
}
export type PushbackDirection = 'left' | 'right' | 'straight';

export interface WeatherState {
  weatherEnabled: boolean;
  windEnabled: boolean;
  condition: WeatherCondition;
  windDirection: number;
  windSpeed: number;
  gustSpeed: number;
  visibility: number;
  /** Modeled cloud ceiling above ground level, in feet. */
  ceilingFt: number;
  temperatureC: number;
  surfaceCondition: 'dry' | 'wet' | 'contaminated';
}

export interface FlightKinematics {
  /** Indicated airspeed; ground movement uses groundSpeedKts in the HUD. */
  airspeedKts: number;
  groundSpeedKts: number;
  altitudeFt: number;
  verticalSpeedFpm: number;
  accelerationMps2: number;
  fuelPercent: number;
}

/**
 * Authoritative world pose owned by the fixed-step simulation. The renderer
 * may interpolate this state, but it must never invent a separate route.
 */
export interface FlightMotionState {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  bank: number;
  onGround: boolean;
  groundBlend: number;
  protectedRunway: boolean;
  distanceAlongM: number;
  totalDistanceM: number;
  stage?: string;
  stageProgress: number;
}

export interface FlightGoAroundState {
  startedAt: number;
  detail: string;
  cycle: number;
  start: {
    x: number;
    y: number;
    z: number;
    heading: number;
    pitch: number;
    bank: number;
    onGround: boolean;
    groundBlend: number;
    protectedRunway: boolean;
  };
}

/** The traffic stream and local operating period that generated this leg. */
export interface FlightOperationPlan {
  trafficClass: OperationTrafficClass;
  direction: 'arrival' | 'departure';
  periodId: string;
  periodLabel: string;
  scheduledLocalMinute: number;
  demandMultiplier: number;
}

export type FlightPlanStatus = 'scheduled' | 'active' | 'completed' | 'diverted' | 'cancelled';
export type FlightPlanAmendmentKind = 'gate-swap' | 'runway-change' | 'route-change' | 'slot-change' | 'clearance' | 'diversion' | 'cancellation';

export interface FlightPlanAmendment {
  revision: number;
  kind: FlightPlanAmendmentKind;
  atSeconds: number;
  detail: string;
}

/**
 * A complete, deterministic leg plan. Routes and procedures remain explicitly
 * schematic until the versioned SID/STAR milestone lands; every operational
 * intent needed by traffic management is nevertheless present and replayable.
 */
export interface FlightPlan {
  schemaVersion: 2;
  id: string;
  revision: number;
  status: FlightPlanStatus;
  direction: 'arrival' | 'departure';
  origin: string;
  destination: string;
  route: string[];
  routeKind: 'schematic-procedure';
  procedure: string;
  procedureProfile: {
    dataVersion: string;
    id: string;
    kind: TerminalProcedureKind;
    revision: number;
    transitionId: string;
    transitionName: string;
    routeFixIds: string[];
    constraints: ProcedureConstraint[];
    nonNavigational: true;
  };
  airline: AirlineCode;
  aircraft: AircraftModel;
  trafficClass: OperationTrafficClass;
  gateIntent: {
    standId: string;
    gateRef?: string;
    terminalId?: string;
    concourse?: string;
  };
  runwayIntent: {
    runwayId: number;
    operatingEnd: -1 | 1;
    designation: string;
  };
  createdAtSeconds: number;
  scheduledReleaseSeconds: number;
  estimatedArrivalSeconds: number;
  amendments: FlightPlanAmendment[];
}

export interface FlightVectorClearance {
  issuedAtSeconds: number;
  startProgress: number;
  endProgress: number;
  headingDegrees: number;
  rejoinFixId?: string;
  start: Pick<FlightMotionState, 'x' | 'y' | 'z' | 'heading' | 'pitch' | 'bank' | 'onGround' | 'groundBlend' | 'protectedRunway'>;
}

export interface FlightHoldingClearance {
  patternId: string;
  fixId: string;
  issuedAtSeconds: number;
  enteredAtSeconds: number;
  expectFurtherClearanceAtSeconds: number;
  cycle: number;
  inboundCourseDegrees: number;
  turns: 'left' | 'right';
  legSeconds: number;
  altitudeFt: number;
  start: Pick<FlightMotionState, 'x' | 'y' | 'z' | 'heading' | 'pitch' | 'bank' | 'onGround' | 'groundBlend' | 'protectedRunway'>;
}

export interface FlightNavigationState {
  schemaVersion: 1;
  procedureDataVersion: string;
  procedureId: string;
  transitionId: string;
  routeFixIds: string[];
  activeFixIndex: number;
  approachCleared: boolean;
  assignedHeadingDegrees?: number;
  assignedAltitudeFt?: number;
  assignedSpeedKts?: number;
  departureHeadingDegrees?: number;
  initialClimbAltitudeFt?: number;
  handoffFixId?: string;
  frequencyOwner: ControllerStation;
  handoffStatus: 'owned' | 'offered' | 'accepted';
  readbackStatus: 'not-required' | 'pending' | 'accepted';
  vector?: FlightVectorClearance;
  hold?: FlightHoldingClearance;
  missedApproachId?: string;
}

export type TrafficFlowStatus = 'scheduled' | 'metered' | 'holding' | 'released' | 'diverted' | 'cancelled';

export interface TrafficFlowEntry {
  id: string;
  direction: 'arrival' | 'departure';
  status: TrafficFlowStatus;
  createdAtSeconds: number;
  scheduledAtSeconds: number;
  releaseSlotSeconds: number;
  updatedAtSeconds: number;
  delaySeconds: number;
  attempts: number;
  reason: string;
  flightId?: number;
  callsign?: string;
  runwayId?: number;
}

export interface TrafficFlowState {
  schemaVersion: 1;
  density: TrafficDensity;
  nextDemandId: number;
  nextArrivalDemandSeconds: number;
  nextArrivalReleaseSeconds: number;
  nextDepartureReleaseSeconds: number;
  arrivalQueue: TrafficFlowEntry[];
  departureQueue: TrafficFlowEntry[];
  history: TrafficFlowEntry[];
  totals: {
    arrivalDemands: number;
    departureDemands: number;
    arrivalReleases: number;
    departureReleases: number;
    diversions: number;
    cancellations: number;
    gateSwaps: number;
    runwayChanges: number;
    routeAmendments: number;
  };
}

export type ClearanceProposalAction = 'land' | 'go-around' | 'pushback' | 'cross' | 'line-up' | 'takeoff' | 'resume';

export interface ClearanceProposal {
  id: string;
  flightId: number;
  action: ClearanceProposalAction;
  runway?: number;
  station: ControllerStation;
  label: string;
  reason: string;
  priority: 'routine' | 'attention' | 'urgent';
}

export interface Flight {
  id: number;
  callsign: string;
  palette: FlightColor;
  runway: number;
  departureRunway: number;
  operatingEnd: -1 | 1;
  phase: FlightPhase;
  progress: number;
  phaseElapsed: number;
  duration: number;
  cleared: boolean;
  clearanceLeft: number;
  taxiway?: string;
  standId?: string;
  pushbackCleared: boolean;
  pushbackDirection: PushbackDirection;
  pushbackProgress: number;
  pushbackReleaseProgress: number;
  tugAttached: boolean;
  engineState: EngineState;
  runwayExit?: FlightRunwayExitState;
  surfaceReroute?: FlightSurfaceRerouteState;
  surfaceRoute?: string[];
  surfaceRouteEdges?: string[];
  surfaceRoutingCost?: number;
  surfaceCongestionPenalty?: number;
  surfaceCongestedEdgeIds?: string[];
  surfaceNode?: string;
  surfaceEdge?: string;
  rampControlZoneId?: string;
  rampControlZoneName?: string;
  rampControlZoneCapacity?: number;
  surfaceAlleyId?: string;
  surfaceFlowDirection?: 'inbound' | 'outbound';
  standPath?: 'lead-in' | 'lead-out';
  holdShortRunway?: number;
  holdNotified?: boolean;
  runwayEntryCleared?: boolean;
  takeoffCleared?: boolean;
  requiredCrossings?: number[];
  crossingClearances?: number[];
  crossingClearanceIds?: string[];
  crossingHoldRunway?: number;
  crossingHoldPointId?: string;
  controlPace?: number;
  controlHold?: boolean;
  automaticHold?: boolean;
  automaticHoldReason?: string;
  safetyHold?: boolean;
  safetyHoldReason?: string;
  controlPattern?: 'zigzag';
  controlPatternStart?: number;
  gateSlot: number;
  gateAssignment?: FlightGateAssignment;
  aircraft: AircraftModel;
  airline: AirlineCode;
  flightNumber: number;
  registration: string;
  service: FlightService;
  operationPlan: FlightOperationPlan;
  flightPlan: FlightPlan;
  flightPlanHistory: FlightPlan[];
  navigation: FlightNavigationState;
  turnaround: FlightTurnaroundState;
  deicing: FlightDeicingState;
  category: AircraftCategory;
  wakeClass: WakeClass;
  procedure: string;
  origin: string;
  destination: string;
  squawk: string;
  emergency?: EmergencyType;
  goAround?: FlightGoAroundState;
  kinematics: FlightKinematics;
  motion: FlightMotionState;
}

export interface ConflictPrediction {
  severity: 'caution' | 'warning';
  type: 'runway' | 'crossing' | 'separation';
  flights: number[];
  runway?: number;
  etaSeconds: number;
  detail: string;
}

export interface ShiftMetrics {
  safeArrivals: number;
  safeDepartures: number;
  preventedConflicts: number;
  holdsIssued: number;
  manualCommands: number;
  maxConcurrent: number;
  airborneSeconds: number;
  taxiSeconds: number;
  estimatedDelaySeconds: number;
  emergencyResponses: number;
  safetyHolds: number;
  collisionAlerts: number;
  runwayIncursions: number;
  unexplainedPauses: number;
  longestHoldSeconds: number;
  diversions: number;
  cancellations: number;
}

export interface ReplayFrame {
  clock: number;
  score: { landed: number; departed: number };
  flights: Array<{ id: number; callsign: string; phase: FlightPhase; runway: number; progress: number }>;
  predictions: ConflictPrediction[];
  /** Complete immutable render state so the replay scrubber drives the world, not only the label. */
  state: AirportState;
}

export interface AirportEvent {
  type: 'spawn' | 'gate-assignment' | 'gate-reassignment' | 'gate-release' | 'runway-exit-plan' | 'surface-reroute' | 'recovery-start' | 'recovery-complete' | 'turnaround-start' | 'service-start' | 'service-complete' | 'turnaround-ready' | 'service-vehicle-dispatch' | 'service-vehicle-arrive' | 'service-vehicle-hold' | 'service-vehicle-release' | 'service-vehicle-return' | 'service-vehicle-clear' | 'deicing-planned' | 'deicing-queue' | 'deicing-pad-entry' | 'deicing-start' | 'deicing-complete' | 'deicing-expired' | 'deicing-return' | 'land' | 'chime' | 'depart' | 'clear' | 'auto-clear' | 'pushback-clearance' | 'pushback-start' | 'engine-start' | 'tug-release' | 'reject' | 'conflict' | 'safety-hold' | 'hold-short' | 'runway-entry' | 'runway-crossing' | 'takeoff-clearance' | 'vector' | 'airborne-hold' | 'hold-release' | 'approach-clearance' | 'handoff' | 'go-around' | 'emergency';
  flight: Flight;
  runway?: number;
  taxiway?: string;
  detail?: string;
  turnaroundService?: TurnaroundServiceType;
  serviceVehicleId?: string;
  serviceVehicleType?: ServiceVehicleType;
  serviceVehicleStatus?: ServiceVehicleStatus;
}

export interface RunwayConfigurationTransition {
  targetId: string;
  requestedAt: number;
  reason: string;
  changedRunwayIds: number[];
  blockingFlightIds: number[];
}

export interface AirportState {
  elapsed: number;
  flights: Flight[];
  serviceVehicles: ServiceVehicleState[];
  surfaceDisruptions: SurfaceDisruptionState[];
  arrivals: number;
  departures: number;
  breeze: number;
  gameOver: boolean;
  paused: boolean;
  mode: ControlMode;
  nightMode: boolean;
  station: ControllerStation;
  weather: WeatherState;
  scenario: TrafficScenario;
  trafficFlow: TrafficFlowState;
  separationRuleset: SeparationRulesetId;
  runwayConfigurationId: string;
  runwayConfigurationMode: 'automatic' | 'manual';
  runwayConfigurationTransition: RunwayConfigurationTransition | null;
  activeRunwayEnds: Record<number, -1 | 1>;
  activeRunwayRoles: Record<number, RunwayOperationalRole>;
  closedRunway: number | null;
}

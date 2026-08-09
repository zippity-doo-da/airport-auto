export type FlightPhase =
  "approach" | "landing" | "taxi-in" | "resting" | "taxi-out" | "takeoff";

import type { FlightColor, RunwayOperationalRole } from "./airportConfig";
import type { AircraftModel } from "./aircraftProfiles";
import type { AirlineCode } from "./airlineProfiles";
import type { OperationTrafficClass } from "./airportOperationProfiles";
import type { TrafficDensity } from "./trafficDensity";
import type {
  ProcedureConstraint,
  TerminalProcedureKind,
} from "./airspaceProcedures";
import type { AirportDomainEventType } from "../control/eventTypes";
import type { SeparationRulesetId } from "./separationRules";
import type { RouteDistanceSource } from "./routeDistances";
import type { SurfaceSafetySnapshot } from "./surfaceSafety";

export type ControlMode = "auto" | "assisted" | "manual" | "watch";
export type WeatherCondition =
  "clear" | "haze" | "rain" | "fog" | "snow" | "thunderstorm";
export type EnvironmentLightingMode = "automatic" | "day" | "night";
export type EnvironmentSeason = "spring" | "summer" | "autumn" | "winter";
export type EnvironmentSeasonMode = "automatic" | EnvironmentSeason;
export type EnvironmentDayPhase = "dawn" | "day" | "dusk" | "night";
export type TrafficScenario =
  "normal" | "rush" | "storm" | "closure" | "training" | "emergency";
export type OperationalControllerStation =
  "approach" | "tower" | "ground" | "ramp";
export type ControllerStation = OperationalControllerStation | "supervisor";
export type TrainingLessonId =
  "arrival-basics" | "tower-landing" | "surface-flow" | "handoff-workflow";
export type TrainingStatus =
  "inactive" | "active" | "coach-paused" | "complete";

export interface TrainingState {
  status: TrainingStatus;
  lessonId: TrainingLessonId | null;
  stepIndex: number;
  targetFlightId: number | null;
  completedStepIds: string[];
  skippedStepIds: string[];
  startedAtSeconds: number;
  stepStartedAtSeconds: number;
  mistakeCount: number;
  recoveryCount: number;
  hintCount: number;
  feedback: string | null;
  noFail: true;
}

export type ChallengeId =
  "rush-hour" | "storm-operations" | "runway-closure" | "emergency-priority";
export type ChallengeStatus =
  "inactive" | "briefing" | "active" | "complete" | "failed" | "abandoned";
export type ChallengeGrade = "A+" | "A" | "B" | "C" | "D" | "F";
export type ChallengeObjectiveStatus =
  "pending" | "on-track" | "met" | "attention" | "failed";

export interface ChallengeObjectiveSnapshot {
  id: string;
  label: string;
  detail: string;
  displayValue: string;
  target: string;
  value: number;
  targetValue: number;
  progress: number;
  weight: number;
  status: ChallengeObjectiveStatus;
}

export interface ChallengeOperationalSummary {
  elapsedSeconds: number;
  remainingSeconds: number;
  operations: number;
  arrivals: number;
  departures: number;
  throughputPerHour: number;
  totalDelaySeconds: number;
  delayPerOperationSeconds: number;
  fuelBurnKg: number;
  holdingFuelBurnKg: number;
  holdingFuelPercent: number;
  emergencyResolutions: number;
  goArounds: number;
  safety: {
    score: number;
    collisionAlerts: number;
    runwayIncursions: number;
    unexplainedPauses: number;
    missedHandoffs: number;
    preventedConflicts: number;
  };
}

export interface ChallengeState {
  status: ChallengeStatus;
  challengeId: ChallengeId | null;
  startedAtSeconds: number;
  durationSeconds: number;
  endedAtSeconds: number | null;
  completionReason: string | null;
  score: number;
  grade: ChallengeGrade;
  objectives: ChallengeObjectiveSnapshot[];
  summary: ChallengeOperationalSummary;
}

export type SandboxTrafficDirection = "arrival" | "departure";
export type SandboxTrafficClass = OperationTrafficClass | "auto";
export type SandboxInjectionStatus =
  "queued" | "releasing" | "complete" | "cancelled";

export interface SandboxInjectionRequest {
  id: number;
  direction: SandboxTrafficDirection;
  trafficClass: SandboxTrafficClass;
  runwayId: number | null;
  requestedCount: number;
  remainingCount: number;
  releasedFlightIds: number[];
  status: SandboxInjectionStatus;
  createdAtSeconds: number;
  updatedAtSeconds: number;
  nextAttemptSeconds: number;
  lastReason: string;
}

export interface SandboxState {
  active: boolean;
  backgroundTraffic: boolean;
  noScore: true;
  startedAtSeconds: number;
  nextInjectionId: number;
  injections: SandboxInjectionRequest[];
  totals: {
    requested: number;
    releasedArrivals: number;
    releasedDepartures: number;
    cancelled: number;
  };
  lastMessage: string;
}
export type StationAutomationState = Record<
  OperationalControllerStation,
  boolean
>;
export type ScriptedControllerMode = "scripted" | "human" | "inactive";
export type ScriptedControllerPriority =
  "safety" | "urgent" | "sequence" | "routine";
export type ControllerPolicyPresetId =
  "balanced" | "conservative" | "efficient" | "calm" | "teaching" | "realistic";
export type ScriptedControllerDecisionDisposition =
  "accepted" | "rejected" | "deferred";
export type ScriptedControllerAction =
  | "clear-approach"
  | "clear-landing"
  | "clear-pushback"
  | "clear-runway-crossing"
  | "clear-runway-entry"
  | "clear-takeoff"
  | "offer-handoff"
  | "accept-handoff"
  | "defer-handoff"
  | "contact-handoff"
  | "release-hold"
  | "recover-disabled"
  | "go-around";

export interface ControllerStationPolicy {
  station: ControllerStation;
  trackLimit: number;
  maxActionsPerEvaluation: number;
  minimumDecisionIntervalSeconds: number;
  handoffAcceptSeconds: number;
  handoffContactSeconds: number;
  handoffUrgencySeconds: number;
  takeoverGraceSeconds: number;
  deferralReviewSeconds: number;
}

export interface ControllerPolicyPreset {
  id: ControllerPolicyPresetId;
  label: string;
  summary: string;
  intent: string;
  stations: Record<ControllerStation, ControllerStationPolicy>;
}

export interface ScriptedControllerWorkload {
  ownedTracks: number;
  incomingHandoffs: number;
  outgoingHandoffs: number;
  activeTracks: number;
  trackLimit: number;
  utilization: number;
  atCapacity: boolean;
  overloaded: boolean;
  queuedActions: number;
}

export interface ScriptedControllerModeTransition {
  id: string;
  station: ControllerStation;
  from: ScriptedControllerMode;
  to: ScriptedControllerMode;
  atSeconds: number;
  reason: string;
  continuityFlightIds: number[];
}

export interface ScriptedControllerDecision {
  id: string;
  cycle: number;
  station: ControllerStation;
  action: ScriptedControllerAction;
  flightId: number;
  callsign: string;
  runway?: number;
  targetStation?: OperationalControllerStation;
  ruleId: string;
  priority: ScriptedControllerPriority;
  rationale: string;
  plannedAtSeconds: number;
  resolvedAtSeconds: number;
  accepted: boolean;
  disposition: ScriptedControllerDecisionDisposition;
  result: string;
  producedEventTypes: string[];
}

export interface ScriptedControllerStationRuntime {
  station: ControllerStation;
  mode: ScriptedControllerMode;
  evaluations: number;
  planned: number;
  accepted: number;
  rejected: number;
  deferred: number;
  lastEvaluatedAtSeconds: number | null;
  lastDecisionId: string | null;
  policy: ControllerStationPolicy;
  workload: ScriptedControllerWorkload;
  modeChangedAtSeconds: number;
  transitionCount: number;
  transitionReason: string;
  resumeGraceUntilSeconds: number;
  nextRoutineDecisionAtSeconds: number;
}

export interface ScriptedControllerRuntime {
  schemaVersion: 2;
  programVersion: "2.0.0";
  presetId: ControllerPolicyPresetId;
  cadenceSeconds: number;
  cycle: number;
  nextDecisionSequence: number;
  nextTransitionSequence: number;
  lastEvaluatedAtSeconds: number | null;
  nextEvaluationAtSeconds: number;
  stations: Record<ControllerStation, ScriptedControllerStationRuntime>;
  decisions: ScriptedControllerDecision[];
  transitions: ScriptedControllerModeTransition[];
}
export type FlightInstruction =
  "slow" | "normal" | "expedite" | "hold" | "resume" | "zigzag";
export type GroupFlightInstruction = Extract<
  FlightInstruction,
  "slow" | "normal" | "hold" | "resume"
>;
export type GroupInstructionDomain = "airborne" | "surface";

export interface GroupInstructionPreview {
  instruction: FlightInstruction;
  requestedFlightIds: number[];
  flightIds: number[];
  callsigns: string[];
  safeToIssue: boolean;
  reason: string;
  domain: GroupInstructionDomain | null;
  authority: OperationalControllerStation | null;
  safeguards: string[];
}

export interface GroupInstructionIssueResult extends GroupInstructionPreview {
  issued: boolean;
}
export type AircraftCategory = "regional" | "narrowbody" | "widebody" | "cargo";
export type WakeClass = "light" | "medium" | "heavy";
export type EmergencyType = "medical" | "disabled" | "birdstrike" | "go-around";
export type EngineState = "off" | "starting" | "running";
export type FlightService = "passenger" | "cargo";
export type AircraftOperationKind =
  | "scheduled-passenger"
  | "scheduled-cargo"
  | "charter"
  | "ferry"
  | "special-operation";
export type AircraftMaintenanceClass =
  "none" | "transit-inspection" | "out-of-service-repair";
export type AircraftAirworthinessStatus =
  "serviceable" | "maintenance-due" | "out-of-service";
export type TurnaroundServiceType =
  | "fueling"
  | "baggage"
  | "cargo"
  | "catering"
  | "cleaning"
  | "boarding"
  | "maintenance";
export type TurnaroundTaskStatus =
  "not-required" | "waiting" | "active" | "complete";
export type TurnaroundStatus = "planned" | "servicing" | "ready" | "released";
export type DeicingStatus =
  | "not-required"
  | "planned"
  | "enroute"
  | "queued"
  | "positioning"
  | "treating"
  | "protected"
  | "expired"
  | "unavailable";
export type DeicingFluid = "Type I" | "Type I + Type IV";
export type SurfaceDisruptionKind =
  "runway-closure" | "taxiway-closure" | "construction" | "disabled-aircraft";
export type SurfaceDisruptionStatus = "pending" | "active" | "recovering";
export type SurfaceDisruptionSource = "scenario" | "controller" | "incident";
export type SurfaceIncidentResponsePhase =
  "en-route" | "inspecting" | "ready-to-reopen";

/**
 * A topology-changing surface restriction. edgeIds are the authoritative
 * resources unavailable to routing and reservation code while active.
 */
export interface SurfaceDisruptionState {
  id: string;
  kind: SurfaceDisruptionKind;
  status: SurfaceDisruptionStatus;
  source: SurfaceDisruptionSource;
  /** Optional named incident layered on the common surface-restriction model. */
  incidentKind?:
    "runway-inspection" | "bird-activity" | "foreign-object-debris";
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
  /** Named-inspection lifecycle; absent for ordinary closures and towing. */
  responseVehicleLabel?: string;
  responsePhase?: SurfaceIncidentResponsePhase;
  responseStartedAtSeconds?: number;
  responseArrivalAtSeconds?: number;
  responseInspectionStartedAtSeconds?: number;
  responseInspectionDurationSeconds?: number;
  reroutedFlightIds: number[];
  reason: string;
}

export interface FlightSurfaceRerouteState {
  revision: number;
  status: "rerouted" | "holding";
  selectedAtSeconds: number;
  disruptionIds: string[];
  previousEdgeIds: string[];
  routeEdgeIds: string[];
  addedDistanceM: number;
  reason: string;
}

/**
 * Rare automatic surface-gridlock recovery. The aircraft remains on its
 * authoritative taxi route while it advances, or a tug moves it backward,
 * into verified-clear pavement and holds for the conflicting movement.
 */
export interface FlightSurfaceYieldState {
  status: "moving" | "holding";
  direction: "forward" | "reverse";
  targetProgress: number;
  startedAtSeconds: number;
  releaseAtSeconds?: number;
  reason: string;
  blockerFlightIds: number[];
  previousTugAttached: boolean;
  previousEngineState: EngineState;
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

export type ServiceVehicleType =
  | "fuel-truck"
  | "baggage-cart"
  | "cargo-loader"
  | "catering-truck"
  | "cleaning-van"
  | "maintenance-van"
  | "passenger-bus";
export type ServiceVehicleStatus =
  | "scheduled"
  | "dispatching"
  | "staged"
  | "approaching"
  | "servicing"
  | "clearing"
  | "returning"
  | "complete";

/**
 * Authoritative fixed-step state for one turnaround vehicle. Graph routes and
 * the stand-side path are part of replay state; the renderer only consumes the
 * resulting pose and never creates an independent animation path.
 */
export interface ServiceVehicleState {
  id: string;
  /** Named surface-incident response; absent for ordinary turnaround equipment. */
  incidentResponseId?: string;
  flightId: number;
  callsign: string;
  service: TurnaroundServiceType;
  type: ServiceVehicleType;
  label: string;
  status: ServiceVehicleStatus;
  standId: string;
  zoneId: string;
  bayId: string;
  standSide: "left" | "right";
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
  /** Deterministic retry window for a future turn waiting on stand access. */
  prepositionRetryAtSeconds?: number;
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

/** Optional airport-life detail that never bypasses movement or safety rules. */
export interface FlightOperationalDetail {
  schemaVersion: 1;
  kind: AircraftOperationKind;
  label: string;
  reason: string;
  cargoLoadType?:
    "express" | "general-freight" | "perishable" | "priority-parts";
  specialOperation?:
    "air-ambulance" | "flight-check" | "humanitarian" | "government-charter";
  maintenanceClass: AircraftMaintenanceClass;
  airworthinessStatus: AircraftAirworthinessStatus;
  maintenanceReason?: string;
  returnToServiceAtSeconds?: number;
}

export type GateServiceArea =
  | "passenger-terminal"
  | "cargo-ramp"
  | "remote-ramp"
  | "maintenance"
  | "general-aviation"
  | "other";

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
  airlineFit: "preferred" | "compatible" | "fallback";
  serviceFit: "preferred" | "compatible" | "fallback";
  arrivalRouteDistance: number;
  departureRouteDistance: number;
  score: number;
  rationale: string[];
  revision: number;
  previousStandId?: string;
}

export type RunwayBrakingAction =
  "good" | "good-to-medium" | "medium" | "medium-to-poor" | "poor" | "nil";

export type RunwayConditionCode = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type RunwayContaminant =
  | "none"
  | "damp"
  | "water"
  | "standing-water"
  | "dry-snow"
  | "wet-snow"
  | "compacted-snow"
  | "ice";

/**
 * Schematic FAA-RCAM-inspired field report. It is deterministic game state,
 * never current airport information or navigation data.
 */
export interface RunwayConditionReport {
  schemaVersion: 1;
  runwayId: number;
  codes: [RunwayConditionCode, RunwayConditionCode, RunwayConditionCode];
  worstCode: RunwayConditionCode;
  brakingAction: RunwayBrakingAction;
  contaminant: RunwayContaminant;
  depthMm: number;
  coveragePercent: number;
  reportedAtSeconds: number;
  source: "modeled-rcam-schematic";
  notForNavigation: true;
}

export interface RunwayPerformanceAssessment {
  schemaVersion: 1;
  operation: "landing" | "takeoff";
  runwayId: number;
  aircraft: string;
  runwayConditionCode: RunwayConditionCode;
  brakingAction: RunwayBrakingAction;
  performanceMultiplier: number;
  requiredRunwayM: number;
  availableRunwayM: number;
  marginM: number;
  rollDistanceM: number;
  safe: boolean;
  assessedAtSeconds: number;
  source: "schematic-aircraft-and-rcam-model";
  notForNavigation: true;
}

export type TerminalWeatherHazardKind = "wind-shear" | "microburst";
export type TerminalWeatherHazardOperation = "arrival" | "departure";

export interface TerminalWeatherHazard {
  schemaVersion: 1;
  id: string;
  kind: TerminalWeatherHazardKind;
  operation: TerminalWeatherHazardOperation;
  runwayId: number;
  windChangeKts: number;
  locationNm: number;
  startedAtSeconds: number;
  activeUntilSeconds: number;
  advisoryUntilSeconds: number;
  status: "active" | "advisory" | "expired";
  affectedFlightIds: number[];
  source: "deterministic-terminal-weather";
  notForNavigation: true;
}

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
  source: "surface-graph" | "runway-end";
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
export type PushbackDirection = "left" | "right" | "straight";

export interface WeatherState {
  weatherEnabled: boolean;
  windEnabled: boolean;
  condition: WeatherCondition;
  precipitation: "none" | "rain" | "snow";
  intensity: number;
  cloudCover: number;
  windDirection: number;
  windSpeed: number;
  gustSpeed: number;
  visibility: number;
  /** Modeled cloud ceiling above ground level, in feet. */
  ceilingFt: number;
  temperatureC: number;
  surfaceCondition: "dry" | "wet" | "contaminated";
  runwayConditionReports: RunwayConditionReport[];
  reportsUpdatedAtSeconds: number;
  hazardsEnabled: boolean;
  hazardSequence: number;
  nextHazardAtSeconds: number;
  activeHazard: TerminalWeatherHazard | null;
  hazardHistory: TerminalWeatherHazard[];
}

export interface EnvironmentState {
  schemaVersion: 1;
  lightingMode: EnvironmentLightingMode;
  seasonMode: EnvironmentSeasonMode;
  season: EnvironmentSeason;
  dayOfYear: number;
  localMinute: number;
  localTime: string;
  phase: EnvironmentDayPhase;
  daylight: number;
  sunAzimuthRadians: number;
  sunElevationRadians: number;
  cloudCover: number;
  snowCover: number;
  wetPavement: number;
  runwayLightIntensity: number;
  transitionModel: "fixed-step-continuous";
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

export interface FlightFuelLegPlan {
  origin: string;
  destination: string;
  estimatedDistanceNm: number;
  distanceSource: RouteDistanceSource;
  estimatedBlockHours: number;
  tripFuelKg: number;
  taxiFuelKg: number;
  contingencyFuelKg: number;
  alternateFuelKg: number;
  finalReserveFuelKg: number;
  dispatchFuelKg: number;
  dispatchFuelPercent: number;
  plannedLandingFuelKg: number;
  plannedLandingFuelPercent: number;
  capacityLimited: boolean;
}

/**
 * Deterministic planning approximation for believable game telemetry. It is
 * explicitly not an operational dispatch release or aircraft loading record.
 */
export interface FlightFuelPlan {
  schemaVersion: 1;
  aircraft: AircraftModel;
  usableFuelKg: number;
  nominalCruiseFuelBurnKgPerHour: number;
  arrival: FlightFuelLegPlan;
  departure: FlightFuelLegPlan;
  modeledArrivalFuelKg: number;
  modeledArrivalFuelPercent: number;
  assumptions: string[];
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
  /** Exact runway pavement occupied by this pose; empty off protected pavement. */
  protectedRunwayIds: number[];
  distanceAlongM: number;
  totalDistanceM: number;
  stage?: string;
  stageProgress: number;
}

export interface FlightGoAroundState {
  startedAt: number;
  detail: string;
  cycle: number;
  weatherEscape?: {
    hazardId: string;
    kind: TerminalWeatherHazardKind;
    windChangeKts: number;
    straightAheadProgress: number;
    completedAtSeconds?: number;
  };
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

export interface FlightWeatherEscapeState {
  hazardId: string;
  kind: TerminalWeatherHazardKind;
  operation: "departure";
  windChangeKts: number;
  startedAtSeconds: number;
  startProgress: number;
  clearProgress: number;
  status: "active" | "complete";
  completedAtSeconds?: number;
}

/** A controller-issued, continuous climb-and-exit path to an alternate airport. */
export interface FlightDiversionState {
  airportCode: string;
  exitFixId: string;
  issuedAtSeconds: number;
  reason: string;
  start: Pick<
    FlightMotionState,
    | "x"
    | "y"
    | "z"
    | "heading"
    | "pitch"
    | "bank"
    | "onGround"
    | "groundBlend"
    | "protectedRunway"
  >;
}

/** The traffic stream and local operating period that generated this leg. */
export interface FlightOperationPlan {
  trafficClass: OperationTrafficClass;
  direction: "arrival" | "departure";
  periodId: string;
  periodLabel: string;
  scheduledLocalMinute: number;
  demandMultiplier: number;
}

export type FlightPlanStatus =
  "scheduled" | "active" | "completed" | "diverted" | "cancelled";
export type FlightPlanAmendmentKind =
  | "gate-swap"
  | "runway-change"
  | "route-change"
  | "slot-change"
  | "clearance"
  | "diversion"
  | "cancellation";

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
  direction: "arrival" | "departure";
  origin: string;
  destination: string;
  route: string[];
  routeKind: "schematic-procedure";
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
  start: Pick<
    FlightMotionState,
    | "x"
    | "y"
    | "z"
    | "heading"
    | "pitch"
    | "bank"
    | "onGround"
    | "groundBlend"
    | "protectedRunway"
  >;
}

export interface FlightHoldingClearance {
  patternId: string;
  fixId: string;
  issuedAtSeconds: number;
  enteredAtSeconds: number;
  expectFurtherClearanceAtSeconds: number;
  cycle: number;
  inboundCourseDegrees: number;
  turns: "left" | "right";
  legSeconds: number;
  altitudeFt: number;
  start: Pick<
    FlightMotionState,
    | "x"
    | "y"
    | "z"
    | "heading"
    | "pitch"
    | "bank"
    | "onGround"
    | "groundBlend"
    | "protectedRunway"
  >;
}

export type FlightRouteClearanceStatus =
  "preview" | "pending-readback" | "accepted" | "rejected" | "cancelled";
export type FlightRouteWarningSeverity = "advisory" | "warning" | "blocking";

export interface FlightRouteConflictWarning {
  code: "excessive-initial-turn" | "predicted-loss-of-separation";
  severity: FlightRouteWarningSeverity;
  detail: string;
  conflictingFlightId?: number;
  conflictingCallsign?: string;
  estimatedSeconds?: number;
  horizontalNm?: number;
  verticalFt?: number;
}

/**
 * A non-authoritative route proposal until its simulated pilot readback is
 * accepted. The currently flown route remains unchanged during preview and
 * pending-readback states.
 */
export interface FlightRouteClearanceState {
  schemaVersion: 1;
  revision: number;
  status: FlightRouteClearanceStatus;
  routeFixIds: string[];
  routeFixNames: string[];
  previousRouteFixIds: string[];
  previewedAtSeconds: number;
  issuedAtSeconds?: number;
  readbackDueSeconds?: number;
  respondedAtSeconds?: number;
  issuedBy: ControllerStation;
  distanceNm: number;
  estimatedSeconds: number;
  initialTurnDegrees: number;
  safeToIssue: boolean;
  warnings: FlightRouteConflictWarning[];
  reason?: string;
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
  /** Compact compatibility state; `handoff` carries the complete coordination record. */
  handoffStatus: "owned" | "offered" | "accepted" | "rejected" | "overdue";
  handoff?: FlightHandoffState;
  readbackStatus: "not-required" | "pending" | "accepted" | "rejected";
  routeClearance?: FlightRouteClearanceState;
  vector?: FlightVectorClearance;
  hold?: FlightHoldingClearance;
  missedApproachId?: string;
}

export type FlightHandoffStatus =
  "offered" | "accepted" | "rejected" | "overdue" | "completed" | "cancelled";

/**
 * Versioned controller-to-controller coordination. Ownership remains with
 * `from` until that controller issues the final contact instruction.
 */
export interface FlightHandoffState {
  schemaVersion: 1;
  revision: number;
  from: OperationalControllerStation;
  to: OperationalControllerStation;
  status: FlightHandoffStatus;
  offeredAtSeconds: number;
  responseDueSeconds: number;
  respondedAtSeconds?: number;
  completedAtSeconds?: number;
  offeredBy: ControllerStation;
  responseBy?: ControllerStation;
  reason: string;
}

export interface ControllerWorkloadSnapshot {
  station: OperationalControllerStation;
  label: string;
  automated: boolean;
  ownedFlights: number;
  phaseRelevantFlights: number;
  pendingHandoffs: number;
  overdueFlights: number;
  activeTracks: number;
  trackLimit: number;
  utilization: number;
  atCapacity: boolean;
  overloaded: boolean;
  queuedActions: number;
  workload: "idle" | "light" | "moderate" | "heavy" | "overload";
  responsibilities: string[];
}

export type ControllerPerformanceStatus = "nominal" | "attention" | "critical";
export type ControllerObjectiveStatus =
  "met" | "attention" | "critical" | "informational";

export interface ControllerObjectiveSnapshot {
  id: string;
  label: string;
  value: number;
  displayValue: string;
  target: string;
  status: ControllerObjectiveStatus;
  detail: string;
}

export interface ControllerAlertSnapshot {
  id: string;
  station: ControllerStation;
  severity: "attention" | "urgent";
  label: string;
  detail: string;
  flightIds: number[];
}

export interface ControllerPerformanceSnapshot {
  station: ControllerStation;
  label: string;
  trafficScope: string;
  authoritySummary: string;
  responsibilities: string[];
  successMeasures: string[];
  workload: ControllerWorkloadSnapshot | null;
  score: number;
  status: ControllerPerformanceStatus;
  summary: string;
  objectives: ControllerObjectiveSnapshot[];
  alerts: ControllerAlertSnapshot[];
}

export type TrafficFlowStatus =
  "scheduled" | "metered" | "holding" | "released" | "diverted" | "cancelled";

/** Stable, controller-visible classification of a meter-slot constraint. */
export type TrafficFlowConstraintCategory =
  | "weather"
  | "runway"
  | "wake"
  | "gate"
  | "performance"
  | "taxi"
  | "demand"
  | "schedule";

/** A bounded, authoritative explanation for one metering-slot change. */
export interface TrafficFlowSlotRevision {
  atSeconds: number;
  releaseSlotSeconds: number;
  reason: string;
  category?: TrafficFlowConstraintCategory;
}

export type TrafficFlowMeterPointKind =
  | "arrival-meter-fix"
  | "runway-threshold"
  | "runway-crossing"
  | "departure-release";

/**
 * One authoritative, replay-safe target in a flight's meter sequence. Times
 * are simulation seconds; tolerances describe the controller's usable window
 * and never bypass the command or safety arbiters.
 */
export interface TrafficFlowMeterTarget {
  schemaVersion: 1;
  id: string;
  kind: TrafficFlowMeterPointKind;
  label: string;
  targetSeconds: number;
  toleranceBeforeSeconds: number;
  toleranceAfterSeconds: number;
  runwayId?: number;
  crossingId?: string;
}

export type TrafficFlowObjective =
  | "balanced"
  | "minimum-holding"
  | "minimum-taxi-delay"
  | "weather-recovery"
  | "watch-calm";

export interface TrafficFlowEntry {
  id: string;
  direction: "arrival" | "departure";
  status: TrafficFlowStatus;
  createdAtSeconds: number;
  scheduledAtSeconds: number;
  releaseSlotSeconds: number;
  updatedAtSeconds: number;
  delaySeconds: number;
  attempts: number;
  reason: string;
  /** Classification is advisory only; the detailed reason remains authoritative. */
  constraintCategory?: TrafficFlowConstraintCategory;
  slotRevisions: TrafficFlowSlotRevision[];
  meterTargets: TrafficFlowMeterTarget[];
  flightId?: number;
  callsign?: string;
  runwayId?: number;
}

export type TrafficFlowAdvisoryResponseStatus = "ignored" | "recovered";

/**
 * Replay-safe controller response to one strategic flow recommendation.
 * Responding never moves an aircraft or changes score; recovery may select a
 * scheduler objective through the ordinary Supervisor command boundary.
 */
export interface TrafficFlowAdvisoryResponse {
  schemaVersion: 1;
  recommendationId: string;
  entryId: string;
  direction: "arrival" | "departure";
  authority: "approach" | "tower";
  status: TrafficFlowAdvisoryResponseStatus;
  ignoredAtSeconds: number;
  recoveredAtSeconds?: number;
  objectiveBefore: TrafficFlowObjective;
  recoveryObjective?: TrafficFlowObjective;
  baselineDelaySeconds: number;
  baselineHoldingFuelBurnKg: number;
  baselineQueueLength: number;
  flightId?: number;
  callsign?: string;
}

export interface TrafficFlowState {
  schemaVersion: 2;
  density: TrafficDensity;
  objective: TrafficFlowObjective;
  nextDemandId: number;
  nextArrivalDemandSeconds: number;
  nextArrivalReleaseSeconds: number;
  nextDepartureReleaseSeconds: number;
  arrivalQueue: TrafficFlowEntry[];
  departureQueue: TrafficFlowEntry[];
  history: TrafficFlowEntry[];
  advisoryResponses: TrafficFlowAdvisoryResponse[];
  /** Mirrored into replay state so ignored-advisory fuel consequences scrub exactly. */
  observedHoldingFuelBurnKg: number;
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

export type ClearanceProposalAction =
  | "land"
  | "go-around"
  | "pushback"
  | "cross"
  | "line-up"
  | "takeoff"
  | "slow"
  | "hold"
  | "direct-to"
  | "vector"
  | "resume";

export interface ClearanceProposal {
  id: string;
  flightId: number;
  action: ClearanceProposalAction;
  runway?: number;
  /** Present only for a speed proposal; approval still calls assignAirspeed. */
  speedKts?: number;
  /** Present only for a holding proposal; approval calls holdFlight. */
  patternId?: string;
  efcMinutes?: number;
  /** Present only for a direct-to proposal; must be a published route fix. */
  fixId?: string;
  /** Present only for a vector proposal; aviation heading in degrees. */
  headingDegrees?: number;
  station: ControllerStation;
  label: string;
  reason: string;
  priority: "routine" | "attention" | "urgent";
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
  takeoffPerformance?: RunwayPerformanceAssessment;
  surfaceReroute?: FlightSurfaceRerouteState;
  surfaceYield?: FlightSurfaceYieldState;
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
  surfaceFlowDirection?: "inbound" | "outbound";
  standPath?: "lead-in" | "lead-out";
  holdShortRunway?: number;
  holdNotified?: boolean;
  runwayEntryCleared?: boolean;
  takeoffCleared?: boolean;
  requiredCrossings?: number[];
  crossingClearances?: number[];
  crossingClearanceIds?: string[];
  /** Individual route crossings still ahead and not yet cleared. */
  pendingCrossingCount?: number;
  crossingHoldRunway?: number;
  crossingHoldPointId?: string;
  controlPace?: number;
  controlHold?: boolean;
  automaticHold?: boolean;
  automaticHoldReason?: string;
  safetyHold?: boolean;
  safetyHoldReason?: string;
  controlPattern?: "zigzag";
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
  fuelPlan: FlightFuelPlan;
  turnaround: FlightTurnaroundState;
  operationalDetail: FlightOperationalDetail;
  deicing: FlightDeicingState;
  category: AircraftCategory;
  wakeClass: WakeClass;
  procedure: string;
  origin: string;
  destination: string;
  squawk: string;
  emergency?: EmergencyType;
  goAround?: FlightGoAroundState;
  weatherEscape?: FlightWeatherEscapeState;
  diversion?: FlightDiversionState;
  kinematics: FlightKinematics;
  motion: FlightMotionState;
}

export interface ConflictPrediction {
  severity: "caution" | "warning";
  type: "runway" | "crossing" | "separation";
  flights: number[];
  runway?: number;
  etaSeconds: number;
  detail: string;
  /** Optional authoritative geometry for safety display projections. */
  geometry?: {
    kind: "corridor" | "runway" | "system";
    points: Array<[number, number]>;
    width?: number;
  };
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
  handoffOffers: number;
  handoffAcceptances: number;
  handoffRejections: number;
  missedHandoffs: number;
  fuelBurnKg: number;
  holdingFuelBurnKg: number;
  goArounds: number;
  emergencyResolutions: number;
}

export interface ReplayFrame {
  clock: number;
  score: { landed: number; departed: number };
  flights: Array<{
    id: number;
    callsign: string;
    phase: FlightPhase;
    runway: number;
    progress: number;
  }>;
  predictions: ConflictPrediction[];
  /** Exact surface picture captured with this frame, including advisory lifecycle state. */
  surfaceSafety?: SurfaceSafetySnapshot;
  /** Complete immutable render state so the replay scrubber drives the world, not only the label. */
  state: AirportState;
}

export interface AirportEvent {
  type: AirportDomainEventType;
  flight: Flight;
  runway?: number;
  taxiway?: string;
  detail?: string;
  turnaroundService?: TurnaroundServiceType;
  serviceVehicleId?: string;
  serviceVehicleType?: ServiceVehicleType;
  serviceVehicleStatus?: ServiceVehicleStatus;
  /** Command that synchronously produced this domain event, when applicable. */
  causedByCommandId?: string;
  /** Deterministic station decision that synchronously produced this event. */
  causedByControllerDecisionId?: string;
  /** Reserved for explicit event-to-event causal chains in asynchronous workflows. */
  causedByEventId?: number;
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
  /** Serialized local-clock offset used by named ambient/Watch programs. */
  operationTimeOffsetMinutes: number;
  flights: Flight[];
  serviceVehicles: ServiceVehicleState[];
  surfaceDisruptions: SurfaceDisruptionState[];
  arrivals: number;
  departures: number;
  breeze: number;
  gameOver: boolean;
  paused: boolean;
  mode: ControlMode;
  environment: EnvironmentState;
  nightMode: boolean;
  station: ControllerStation;
  stationAutomation: StationAutomationState;
  scriptedControllers: ScriptedControllerRuntime;
  weather: WeatherState;
  scenario: TrafficScenario;
  trafficFlow: TrafficFlowState;
  separationRuleset: SeparationRulesetId;
  runwayConfigurationId: string;
  runwayConfigurationMode: "automatic" | "manual";
  runwayConfigurationTransition: RunwayConfigurationTransition | null;
  activeRunwayEnds: Record<number, -1 | 1>;
  activeRunwayRoles: Record<number, RunwayOperationalRole>;
  closedRunway: number | null;
  training: TrainingState;
  challenge: ChallengeState;
  sandbox: SandboxState;
}

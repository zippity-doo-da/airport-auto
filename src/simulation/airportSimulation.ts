import type {
  AirportConfig,
  AirportRunwayConfiguration,
  RunwayOperationalRole,
} from "./airportConfig";
import type {
  AirportEvent,
  AirportState,
  ChallengeId,
  ClearanceProposal,
  ConflictPrediction,
  ControlMode,
  ControllerPerformanceSnapshot,
  ControllerPolicyPreset,
  ControllerPolicyPresetId,
  ControllerStation,
  ControllerWorkloadSnapshot,
  EmergencyType,
  EnvironmentLightingMode,
  EnvironmentSeasonMode,
  Flight,
  FlightGateAssignment,
  FlightHandoffState,
  FlightInstruction,
  FlightNavigationState,
  FlightOperationPlan,
  FlightPhase,
  FlightRouteClearanceState,
  FlightRunwayExitState,
  GroupInstructionIssueResult,
  GroupInstructionPreview,
  OperationalControllerStation,
  ScriptedControllerDecision,
  SandboxTrafficClass,
  SandboxTrafficDirection,
  ServiceVehicleState,
  ShiftMetrics,
  SurfaceDisruptionKind,
  SurfaceDisruptionSource,
  SurfaceDisruptionState,
  TerminalWeatherHazard,
  TrafficFlowMeterTarget,
  TrafficFlowObjective,
  TrafficScenario,
  TrainingLessonId,
  WeatherCondition,
} from "./types";
import { aircraftProfile, type AircraftModel } from "./aircraftProfiles";
import { ambientProgram, type AmbientProgramId } from "./ambientPrograms";
import { createAircraftOperationalDetail } from "./aircraftOperations";
import { airlineProfile, type AirlineCode } from "./airlineProfiles";
import {
  aircraftCollisionEnvelope,
  beginAircraftCollisionSamplingFrame,
  detectCommittedRunwaySweepConflict,
  detectCommittedRunwaySweepSegmentConflict,
  detectFlightConflict,
  endAircraftCollisionSamplingFrame,
  findFlightConflicts,
  findObstacleConflicts,
  findProposedConflict,
  parkedAircraftBodyRadius,
  PHYSICAL_GAP,
} from "./collisionDetection";
import {
  findSurfaceRoute,
  sampleSurfaceRouteWithEdges,
  surfaceNodeIndex,
  surfacePushbackPlan,
  surfaceRouteCrossingGroups,
  surfaceRouteCrossingWindows,
  surfaceRouteForFlight,
  surfaceRouteRunwayCrossings,
  validateAirportSurfaceGraph,
  type SurfaceGraphValidation,
  type SurfaceRoute,
  type SurfaceRouteCrossingWindow,
  type SurfaceRoutePlanning,
} from "./surfaceGraph";
import {
  validateAirportObstacleEnvelopes,
  type AirportObstacleValidation,
} from "./airportObstacles";
import {
  departureTrajectoryTiming,
  landingTrajectoryTiming,
} from "./flightTrajectory";
import {
  assessRunwayPerformance,
  runwaySupportsAircraft,
  WORLD_METERS_PER_UNIT,
} from "./runwayPerformance";
import { sampleAircraftSurfaceMotion } from "./surfaceMotion";
import {
  beginFlightMotionSamplingFrame,
  endFlightMotionSamplingFrame,
  progressAfterDistance,
  progressBeforeDistance,
  sampleFlightMotion,
  syncFlightMotion,
} from "./flightMotion";
import { intersectingRunways, runwaysConflict } from "./runwayConflict";
import { activeRunwayDesignation } from "./runwayGeometry";
import {
  activeRunwayRole,
  applyRunwayConfiguration,
  changedRunwayConfigurationIds,
  preferredOperatingEnd,
  runwayConfigurationRestrictionReason,
  selectAutomaticRunwayConfiguration,
} from "./runwayConfigurationOperations";
import {
  flightHasCommittedRunwayTrajectory,
  flightHasRunwayCommitment,
} from "./runwayProtection";
import {
  SurfaceReservationLedger,
  surfaceCongestionPlanning,
  surfaceRouteOperationalState,
  surfaceRouteReservationClaims,
  surfaceTaxiwayFlowSectionEdgeIds,
  type SurfaceReservationClaim,
  type SurfaceTrafficMovement,
} from "./surfaceOperations";
import {
  SurfaceFlowPlanner,
  type SurfaceFlowDemand,
  type SurfaceFlowPlannerState,
} from "./surfaceFlowPlanner";
import {
  GATE_TURN_BUFFER_SECONDS,
  gateReservationsOverlap,
  planGateAssignment,
  standReservationsConflict,
  type GateReservation,
} from "./gateAssignment";
import {
  advanceTurnaround,
  completeTurnaround,
  createTurnaroundPlan,
  releaseTurnaround,
  scheduleTurnaround,
  startTurnaround,
  turnaroundBlockingServices,
  turnaroundFuelPercent,
  type TurnaroundTransition,
} from "./turnaroundOperations";
import {
  advanceServiceVehicleMotion,
  availableVehicleServices,
  createServiceVehiclePlans,
  findServiceVehicleConflicts,
  serviceVehicleOwnerId,
  serviceVehicleRadius,
  serviceVehicleReservationClaims,
  serviceVehicleRouteViolations,
  serviceVehiclesBlockingPushback,
  setServiceVehicleStatus,
  syncServiceVehiclePose,
} from "./serviceVehicleOperations";
import {
  applyDeicingRoutePlan,
  createDeicingState,
  deicingFacilities,
  deicingMovementLimit,
  deicingReleaseValid,
  markDeicingNotRequired,
  markStartupPretreated,
  planDeicingTaxiRoute,
  winterDeicingRequired,
} from "./deicingOperations";
import { selectRunwayExit } from "./runwayExitSelection";
import {
  resolveSurfaceDisruptionTarget,
  runwayClosedByDisruption,
  surfaceDisruptionBlockedEdgeIds,
  surfaceDisruptionsForRoute,
} from "./surfaceDisruptions";
import {
  surfaceIncidentDefinition,
  type SurfaceIncidentDefinition,
  type SurfaceIncidentKind,
} from "./surfaceIncidentProgram";
import {
  buildOperationQueueSnapshot,
  type OperationQueueSnapshot,
} from "./operationQueues";
import {
  airportOperationStateAt,
  selectOperationTrafficClass,
  type AirportOperationProfile,
  type AirportOperationState,
  type OperationTrafficClass,
} from "./airportOperationProfiles";
import { selectTrafficProgram } from "./airportTrafficPrograms";
import { trafficDensityProfile, type TrafficDensity } from "./trafficDensity";
import {
  createTrafficFlowState,
  enqueueArrivalDemand,
  expireTrafficFlow,
  isTrafficFlowObjective,
  markArrivalHolding,
  refreshTrafficFlow,
  registerDepartureDemand,
  releaseArrivalDemand,
  releaseDepartureDemand,
  removeDepartureDemand,
  scheduleNextArrivalDemand,
  setTrafficFlowDensity,
  setTrafficFlowMeterTargets,
  setTrafficFlowObjective,
  trafficFlowObjectiveProfile,
  trafficFlowSnapshot,
  type TrafficFlowSnapshot,
} from "./trafficFlowManagement";
import {
  amendFlightPlan,
  cloneFlightPlan,
  createFlightPlan,
  setFlightPlanStatus,
} from "./flightPlanning";
import {
  selectTerminalProcedure,
  type SelectedTerminalProcedure,
  type TerminalProcedureKind,
} from "./airspaceProcedures";
import {
  buildSurfaceRouteViaNodes,
  selectDiversionExitFix,
} from "./atcRouteCommands";
import {
  buildTerminalRouteClearancePreview,
  type TerminalRouteClearanceCandidate,
} from "./terminalRouteClearance";
import { buildGroupInstructionPreview } from "./groupedFlightInstructions";
import {
  createFlightFuelPlan,
  fuelBurnPercentPerSecond,
  replaceDepartureFuelPlan,
} from "./flightFuelPlanning";
import {
  controllerStationIsAhead,
  CONTROLLER_STATIONS,
  controllerWorkloadSnapshots,
  createStationAutomation,
  isOperationalControllerStation,
  nextControllerStation,
  OPERATIONAL_CONTROLLER_STATIONS,
  requiredControllerStation,
  stationCanIssue,
} from "./controllerOperations";
import {
  createScriptedControllerRuntime,
  planScriptedControllerActions,
  refreshScriptedControllerModes,
  SCRIPTED_CONTROLLER_HISTORY_LIMIT,
  type ScriptedControllerPlannedAction,
} from "./scriptedControllers";
import { controllerPerformanceSnapshots } from "./controllerPerformance";
import {
  applyControllerPolicyPreset,
  controllerPolicyPreset,
  controllerPolicyPresetCatalog,
  isControllerPolicyPresetId,
} from "./controllerPolicies";
import {
  cloneTrainingState,
  createInactiveTrainingState,
  currentTrainingStep,
  trainingContext,
  trainingLesson,
  trainingLessons,
  trainingObservationCompletesStep,
  type TrainingCommandObservation,
} from "./trainingProgram";
import {
  challengeDefinition,
  challengeDefinitions,
  cloneChallengeState,
  createInactiveChallengeState,
  evaluateChallenge,
} from "./challengeProgram";
import {
  cloneSandboxState,
  createInactiveSandboxState,
  SANDBOX_TRAFFIC_CLASSES,
} from "./sandboxProgram";
import {
  assessAirborneSeparation,
  requiredRadarSeparationNm,
  runwayPairIndependent,
  runwayReleaseReason,
  separationRuleset,
  weatherCapacityMultiplier,
  type RunwayOperationRecord,
  type SeparationRulesetId,
} from "./separationRules";
import {
  applyWeatherCondition,
  buildRunwayConditionReports,
  createTerminalWeatherHazard,
  createWeatherState,
  nextWeatherHazardDelaySeconds,
  runwayConditionReport,
  taxiBrakingFactor,
  taxiSpeedFactor,
  weatherConditionProfile,
  weatherDurationMultiplier as modeledWeatherDurationMultiplier,
} from "./weatherOperations";
import {
  createEnvironmentState,
  isEnvironmentLightingMode,
  isEnvironmentSeasonMode,
  updateEnvironmentState,
} from "./environmentOperations";

const PHASE_DURATION: Record<FlightPhase, number> = {
  approach: 38,
  landing: 34,
  "taxi-in": 18,
  resting: 10,
  "taxi-out": 20,
  takeoff: 48,
};

const HANDOFF_RESPONSE_SECONDS = 12;
const HANDOFF_RETRY_SECONDS = 4;

function incidentResponsePhaseLabel(
  phase: SurfaceDisruptionState["responsePhase"],
): string {
  if (phase === "en-route") return "the response unit is en route";
  if (phase === "inspecting") return "the inspection is in progress";
  return "the incident response";
}

const PHASE_TRANSITION_RETRY_SECONDS = 0.75;
const FAILED_SURFACE_YIELD_RETRY_SECONDS = 10;
const FAILED_GATE_REASSIGNMENT_RETRY_SECONDS = 10;
// Reserve enough pavement to yield before the next meaningful junction, but
// do not turn every short imported OSM fragment into a several-hundred-metre
// airport-wide queue. The collision arbiter remains the physical safety net;
// this shorter horizon is only the predictive traffic-planning claim.
const SURFACE_RESERVATION_LOOKAHEAD_M = 180;
// Establish geometric corridor ownership before transport aircraft reach a
// shared junction. This is conservative separation look-ahead, not a speed-up;
// the graph ledger above remains the shorter concurrency boundary.
const SURFACE_PHYSICAL_RESERVATION_LOOKAHEAD_M = 400;
const PUSHBACK_INBOUND_LOOKAHEAD_M = 300;
const PUSHBACK_INBOUND_CACHE_BUFFER_M = 120;

function createShiftMetrics(): ShiftMetrics {
  return {
    safeArrivals: 0,
    safeDepartures: 0,
    preventedConflicts: 0,
    holdsIssued: 0,
    manualCommands: 0,
    maxConcurrent: 0,
    airborneSeconds: 0,
    taxiSeconds: 0,
    estimatedDelaySeconds: 0,
    emergencyResponses: 0,
    safetyHolds: 0,
    collisionAlerts: 0,
    runwayIncursions: 0,
    unexplainedPauses: 0,
    longestHoldSeconds: 0,
    diversions: 0,
    cancellations: 0,
    handoffOffers: 0,
    handoffAcceptances: 0,
    handoffRejections: 0,
    missedHandoffs: 0,
    fuelBurnKg: 0,
    holdingFuelBurnKg: 0,
    goArounds: 0,
    emergencyResolutions: 0,
  };
}

const SERVICE_VEHICLE_SURFACE_PRIORITY: Record<
  ServiceVehicleState["status"],
  number
> = {
  clearing: 3,
  dispatching: 4,
  approaching: 5,
  returning: 6,
  servicing: 7,
  staged: 8,
  scheduled: 9,
  complete: 10,
};
const SERVICE_VEHICLE_PREPOSITION_RETRY_SECONDS = 1;

function serviceVehicleSurfacePriority(vehicle: ServiceVehicleState): number {
  // Traffic already ahead keeps moving: inbound equipment on the stand
  // connector clears toward staging, while outbound equipment already on the
  // graph clears away from it. A follower waits at the preceding resource.
  if (
    vehicle.status === "dispatching" &&
    vehicle.currentEdge === undefined &&
    vehicle.progress > 1e-6
  )
    return 0;
  // Once a returner leaves staging, retain ownership through the graph merge.
  // Sorting by raw progress here allowed a later inbound dispatcher to take
  // the connector on the next tick and stop both vehicles nose-to-nose.
  if (vehicle.status === "returning" && vehicle.progress > 1e-6) return 0;
  if (vehicle.currentEdge !== undefined) return 1;
  // A returner waiting exactly at staging gets the next release so following
  // equipment cannot clear through its parked position.
  if (vehicle.status === "returning" && vehicle.progress <= 1e-6) return 2;
  return SERVICE_VEHICLE_SURFACE_PRIORITY[vehicle.status];
}

function serviceVehicleStandLaneOrder(
  config: AirportConfig,
  first: ServiceVehicleState,
  second: ServiceVehicleState,
): number {
  if (
    first.standId !== second.standId ||
    first.standSide !== second.standSide ||
    first.status !== "approaching" ||
    second.status !== "approaching"
  )
    return 0;
  const stand = config.surfaceGraph.stands.find(
    (candidate) => candidate.id === first.standId,
  );
  if (!stand) return 0;
  const forwardX = Math.cos(stand.heading);
  const forwardY = Math.sin(stand.heading);
  const firstPosition = first.x * forwardX + first.y * forwardY;
  const secondPosition = second.x * forwardX + second.y * forwardY;
  // The vehicle staged furthest forward is already ahead in the lane and
  // moves first; a following vehicle cannot drive through its parked body.
  return secondPosition - firstPosition;
}

const KNOT_TO_MPS = 0.514444;
const CROSSING_CLEARANCE_RANGE_M = 60;
const RUNWAY_HOLD_SHORT_NOSE_BUFFER_M = 5;
const RUNWAY_CROSSING_TAIL_BUFFER_M = 5;
const RUNWAY_CROSSING_PRIORITY_WAIT_SECONDS = 20;
const RUNWAY_HOLD_POSITION_TOLERANCE_M = 1;
const RUNWAY_ENTRY_METER_DISTANCE_M = 90;
const RUNWAY_CROSSING_ADVISORY_LOOKAHEAD_M = 500;
const SURFACE_DEADLOCK_AVOIDANCE_M = 750;
const SERVICE_VEHICLE_AVOIDANCE_EDGES = 8;
const SURFACE_RESERVATION_RECOVERY_WAIT_SECONDS = 4;
const SURFACE_DEADLOCK_RETRY_SECONDS = 15;
const SURFACE_YIELD_REVERSE_DISTANCES_M = [
  750, 600, 450, 300, 200, 120, 90, 60, 40, 25,
] as const;
const SURFACE_YIELD_FORWARD_DISTANCES_M = [
  25, 40, 60, 90, 120, 200, 300, 450, 600, 750,
] as const;
const SURFACE_YIELD_MINIMUM_DISTANCE_M = 20;
const SURFACE_YIELD_SPEED_KTS = 4;
const SURFACE_YIELD_HOLD_SECONDS = 15;
const SURFACE_YIELD_BLOCKED_ABORT_SECONDS = 30;
const SURFACE_YIELD_RETRY_COOLDOWN_SECONDS = 60;
const SERVICE_VEHICLE_PREPOSITION_PROGRESS = 0.72;
const SERVICE_VEHICLE_PREPOSITION_LEAD_SECONDS = 90;
const ARRIVAL_ADMISSION_RETRY_SECONDS = 5;
const ACTIVE_GATE_RESERVATION_HORIZON_SECONDS = 24 * 60 * 60;

type AircraftCollisionSweep = {
  envelopes: Array<ReturnType<typeof aircraftCollisionEnvelope>>;
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
};

type AircraftCollisionSweepCache = {
  progressBucket: number;
  startProgress: number;
  endProgress: number;
  routeEdges: Flight["surfaceRouteEdges"];
  sweep: AircraftCollisionSweep;
};

type SurfaceCrossingPlanCache = {
  routeNodes: Flight["surfaceRoute"];
  routeEdges: Flight["surfaceRouteEdges"];
  runway: number;
  aircraft: AircraftModel;
  routeDistanceWorld: number;
  routeDistanceM: number;
  windows: SurfaceRouteCrossingWindow[];
  groups: SurfaceRouteCrossingWindow[][];
};

const PUSHBACK_SWEEP_PROGRESS_BUCKETS = 128;
const activePushbackDepartureSweepCache = new WeakMap<
  Flight,
  AircraftCollisionSweepCache
>();
const activePushbackInboundSweepCache = new WeakMap<
  Flight,
  AircraftCollisionSweepCache
>();

function buildAircraftCollisionSweep(
  envelopes: Array<ReturnType<typeof aircraftCollisionEnvelope>>,
): AircraftCollisionSweep {
  let minimumX = Infinity;
  let maximumX = -Infinity;
  let minimumY = Infinity;
  let maximumY = -Infinity;
  for (const envelope of envelopes) {
    // Splitting the physical gap across both bounds makes disjoint boxes a
    // mathematically safe rejection for the exact envelope test below.
    const radius = envelope.bodyRadius + PHYSICAL_GAP / 2;
    minimumX = Math.min(minimumX, envelope.x - radius);
    maximumX = Math.max(maximumX, envelope.x + radius);
    minimumY = Math.min(minimumY, envelope.y - radius);
    maximumY = Math.max(maximumY, envelope.y + radius);
  }
  return { envelopes, minimumX, maximumX, minimumY, maximumY };
}

function aircraftCollisionSweepsOverlap(
  first: AircraftCollisionSweep,
  second: AircraftCollisionSweep,
): boolean {
  return (
    first.minimumX <= second.maximumX &&
    first.maximumX >= second.minimumX &&
    first.minimumY <= second.maximumY &&
    first.maximumY >= second.minimumY
  );
}

function surfaceAircraftSweepsConflict(
  firstFlight: Flight,
  first: AircraftCollisionSweep,
  secondFlight: Flight,
  second: AircraftCollisionSweep,
): boolean {
  if (!aircraftCollisionSweepsOverlap(first, second)) return false;
  for (const firstEnvelope of first.envelopes) {
    for (const secondEnvelope of second.envelopes) {
      if (!aircraftEnvelopeBoxesOverlap(firstEnvelope, secondEnvelope))
        continue;
      if (
        detectFlightConflict(
          firstEnvelope,
          secondEnvelope,
          firstFlight.wakeClass,
          secondFlight.wakeClass,
          false,
          false,
        )
      )
        return true;
    }
  }
  return false;
}

function aircraftEnvelopeBoxesOverlap(
  first: ReturnType<typeof aircraftCollisionEnvelope>,
  second: ReturnType<typeof aircraftCollisionEnvelope>,
): boolean {
  const required = first.bodyRadius + second.bodyRadius + PHYSICAL_GAP;
  return (
    Math.abs(first.x - second.x) < required &&
    Math.abs(first.y - second.y) < required &&
    first.minimumAltitude < second.maximumAltitude &&
    first.maximumAltitude > second.minimumAltitude
  );
}

const surfaceNodePositionCaches = new WeakMap<
  AirportConfig["surfaceGraph"],
  Map<string, [number, number]>
>();
const surfaceRouteIdentityCache = new WeakMap<string[], number>();
let nextSurfaceRouteIdentity = 1;

function surfaceNodePositions(
  graph: AirportConfig["surfaceGraph"],
): Map<string, [number, number]> {
  const cached = surfaceNodePositionCaches.get(graph);
  if (cached) return cached;
  const positions = new Map(
    graph.nodes.map((node) => [node.id, node.position]),
  );
  surfaceNodePositionCaches.set(graph, positions);
  return positions;
}

function pointToSegmentDistance(
  point: [number, number],
  from: [number, number],
  to: [number, number],
): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const lengthSquared = dx * dx + dy * dy;
  const amount =
    lengthSquared <= 1e-12
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) /
              lengthSquared,
          ),
        );
  return Math.hypot(
    point[0] - (from[0] + dx * amount),
    point[1] - (from[1] + dy * amount),
  );
}

function surfaceRouteIdentity(edgeIds: string[] | undefined): number {
  if (!edgeIds) return 0;
  const cached = surfaceRouteIdentityCache.get(edgeIds);
  if (cached !== undefined) return cached;
  const identity = nextSurfaceRouteIdentity++;
  surfaceRouteIdentityCache.set(edgeIds, identity);
  return identity;
}

type TrainingCheckpoint = {
  state: AirportState;
  nextId: number;
  nextDisruptionId: number;
  lastSurfaceReplanSecond: number;
  spawnIn: number;
  speed: number;
  runwayReservations: Array<[number, number]>;
  runwayOperationHistory: RunwayOperationRecord[];
  taxiOutReleaseIn: number;
  baseWindDirection: number;
  baseWindSpeed: number;
  weatherOverrideUntil: number;
  closedRunway: number | null;
  runwayConfigurationOverrideId: string | null;
  metrics: ShiftMetrics;
  stationarySeconds: Array<[number, number]>;
  surfaceYieldCooldownUntil: Array<[number, number]>;
  surfaceFlowPlanner: SurfaceFlowPlannerState;
  decisionReason: string;
  lastArrivalAdmissionReason: string;
};

const NEXT_PHASE: Partial<Record<FlightPhase, FlightPhase>> = {
  approach: "landing",
  landing: "taxi-in",
  "taxi-in": "resting",
  resting: "taxi-out",
  "taxi-out": "takeoff",
};

export class AirportSimulation {
  readonly state: AirportState = {
    elapsed: 0,
    operationTimeOffsetMinutes: 0,
    flights: [],
    serviceVehicles: [],
    surfaceDisruptions: [],
    arrivals: 0,
    departures: 0,
    breeze: 0,
    gameOver: false,
    paused: false,
    mode: "auto",
    environment: createEnvironmentState(),
    nightMode: false,
    station: "supervisor",
    stationAutomation: createStationAutomation(),
    scriptedControllers: createScriptedControllerRuntime(),
    weather: createWeatherState(),
    scenario: "normal",
    trafficFlow: createTrafficFlowState(),
    separationRuleset: "forgiving",
    runwayConfigurationId: "",
    runwayConfigurationMode: "automatic",
    runwayConfigurationTransition: null,
    activeRunwayEnds: {},
    activeRunwayRoles: {},
    closedRunway: null,
    training: createInactiveTrainingState(),
    challenge: createInactiveChallengeState(),
    sandbox: createInactiveSandboxState(),
  };

  private nextId = 1;
  private nextDisruptionId = 1;
  private lastSurfaceReplanSecond = -1;
  private spawnIn: number;
  private events: AirportEvent[] = [];
  private speed = 1;
  private runwayReservations = new Map<number, number>();
  private runwayOperationHistory: RunwayOperationRecord[] = [];
  private taxiOutReleaseIn = 0;
  private baseWindDirection = Math.PI;
  private baseWindSpeed = 10;
  private weatherOverrideUntil = 0;
  private closedRunway: number | null = null;
  private runwayConfigurationOverrideId: string | null = null;
  private readonly surfaceGraphValidation: SurfaceGraphValidation;
  private readonly obstacleEnvelopeValidation: AirportObstacleValidation;
  private readonly metrics: ShiftMetrics = createShiftMetrics();
  private readonly surfaceFlowPlanner = new SurfaceFlowPlanner();

  private readonly stationarySeconds = new Map<number, number>();
  private readonly surfaceYieldCooldownUntil = new Map<number, number>();
  private readonly failedSurfaceYieldRetryAt = new Map<string, number>();
  private readonly phaseTransitionRetryAt = new Map<number, number>();
  private readonly parkedBlockerRecovery = new Map<
    number,
    { blockerId: number; attempts: number; retryAtSeconds: number }
  >();
  private readonly serviceVehicleBlockerRecovery = new WeakMap<
    Flight,
    { signature: string; retryAtSeconds: number }
  >();
  private readonly surfaceReservationBlockerRecovery = new WeakMap<
    Flight,
    {
      signature: string;
      attempts: number;
      retryAtSeconds: number;
      lastAttemptSeconds: number;
    }
  >();
  private readonly surfaceFlowBlockerRecovery = new WeakMap<
    Flight,
    { signature: string; retryAtSeconds: number }
  >();
  private readonly surfaceFlowHoldByFlight = new WeakMap<
    Flight,
    { id: string; label: string; direction: string }
  >();
  private readonly pushbackCorridorRecovery = new WeakMap<
    Flight,
    { signature: string; attempts: number; retryAtSeconds: number }
  >();
  private readonly reciprocalSurfaceRecovery = new WeakMap<
    Flight,
    { signature: string; retryAtSeconds: number }
  >();
  private readonly surfaceCycleRecovery = new WeakMap<
    Flight,
    { signature: string; retryAtSeconds: number }
  >();
  private readonly parkedAircraftEdgeMaskCache = new Map<string, Set<string>>();
  private readonly standCorridorConflictCache = new WeakMap<
    Flight,
    { signature: string; blockedStandIds: Set<string> }
  >();
  private readonly arrivalRouteParkedConflictCache = new WeakMap<
    Flight,
    Map<string, { signature: string; conflicts: boolean }>
  >();
  private readonly arrivalRouteSurfaceConflictCache = new WeakMap<
    Flight,
    Map<string, { signature: string; conflicts: boolean }>
  >();
  private readonly failedGateReassignmentRetry = new WeakMap<
    Flight,
    { signature: string; retryAtSeconds: number }
  >();
  private readonly restingTaxiOutRouteCache = new WeakMap<
    Flight,
    {
      signature: string;
      routeNodes: string[] | undefined;
      routeEdges: string[] | undefined;
    }
  >();
  private readonly pushbackPreviewCache = new WeakMap<
    Flight,
    {
      signature: string;
      preview: Flight;
      sweep?: ReturnType<typeof buildAircraftCollisionSweep>;
    }
  >();
  private readonly departureSweepCache = new WeakMap<
    Flight,
    {
      signature: string;
      sweep: AircraftCollisionSweep;
    }
  >();
  private readonly surfaceCrossingPlanCache = new WeakMap<
    Flight,
    SurfaceCrossingPlanCache
  >();
  private readonly phaseTransitionPreviewCache = new WeakMap<
    Flight,
    Map<FlightPhase, { signature: string; preview: Flight }>
  >();
  private decisionReason = "accepted";
  private lastArrivalAdmissionReason =
    "arrival meter awaiting a release opportunity";
  private trainingCheckpoint: TrainingCheckpoint | null = null;

  constructor(
    private readonly config: AirportConfig,
    density: TrafficDensity = "realistic",
  ) {
    this.state.weather = createWeatherState(config.seed);
    this.state.environment = createEnvironmentState(config.seed);
    this.state.trafficFlow = createTrafficFlowState(density);
    this.spawnIn = Math.min(3, this.arrivalSpacing() * 0.55);
    this.state.trafficFlow.nextArrivalDemandSeconds = this.spawnIn;
    const reference =
      config.runways.find((runway) => runway.role !== "inactive") ??
      config.runways[0];
    this.baseWindDirection = this.normalizeAngle(
      reference.heading +
        (reference.landingEnd === 1 ? Math.PI : 0) +
        Math.sin(config.seed) * 0.32,
    );
    this.baseWindSpeed = 8 + (config.seed % 7);
    this.surfaceGraphValidation = validateAirportSurfaceGraph(config);
    this.obstacleEnvelopeValidation = validateAirportObstacleEnvelopes(config);
    const initialConfiguration =
      config.runwayConfigurations.find(
        (configuration) =>
          configuration.id === config.defaultRunwayConfigurationId,
      ) ?? config.runwayConfigurations[0];
    applyRunwayConfiguration(this.config, this.state, initialConfiguration);
    this.updateWeather();
    this.updateEnvironment(0);
    this.seedInitialTraffic();
    refreshScriptedControllerModes(
      this.state,
      this.state.scriptedControllers,
      "initial controller staffing",
    );
  }

  setPace(speed: number): void {
    this.speed = speed;
  }

  setPaused(paused: boolean): boolean {
    if (!paused && this.state.challenge.status === "briefing") {
      this.state.paused = true;
      this.decisionReason =
        "begin the challenge from its briefing before resuming the clock";
      return false;
    }
    if (
      !paused &&
      (this.state.challenge.status === "complete" ||
        this.state.challenge.status === "failed" ||
        this.state.challenge.status === "abandoned")
    ) {
      this.state.paused = true;
      this.decisionReason = "continue or retry from the challenge debrief";
      return false;
    }
    this.state.paused = paused;
    if (!paused && this.state.training.status === "coach-paused") {
      this.state.training.status = "active";
      this.state.training.feedback =
        "Lesson resumed. The safety arbiter remains active.";
    } else if (paused && this.state.training.status === "active") {
      this.state.training.status = "coach-paused";
      this.state.training.feedback =
        "Lesson paused. Review the objective, request a hint, or retry the current checkpoint.";
    }
    this.decisionReason = paused ? "simulation paused" : "simulation resumed";
    return true;
  }

  trainingSnapshot() {
    const lesson = trainingLesson(this.state.training.lessonId);
    const step = currentTrainingStep(this.state.training);
    return {
      ...cloneTrainingState(this.state.training),
      lesson: lesson
        ? {
            id: lesson.id,
            title: lesson.title,
            summary: lesson.summary,
            estimatedMinutes: lesson.estimatedMinutes,
          }
        : null,
      step: step
        ? {
            id: step.id,
            number: this.state.training.stepIndex + 1,
            count: lesson?.steps.length ?? 0,
            objective: step.objective,
            why: step.why,
            hint: step.hint,
            expectedActions: [...step.actions],
            recommendedStation: step.station ?? null,
          }
        : null,
      context: trainingContext(this.state),
      availableLessons: trainingLessons().map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        summary: candidate.summary,
        estimatedMinutes: candidate.estimatedMinutes,
        steps: candidate.steps.length,
      })),
    };
  }

  startTrainingLesson(lessonId: TrainingLessonId): boolean {
    const lesson = trainingLesson(lessonId);
    if (!lesson)
      return this.rejectDecision(`unknown training lesson ${lessonId}`);
    this.state.challenge = createInactiveChallengeState();
    this.setMode("manual");
    this.setTrafficDensity("quiet");
    this.reset("training");
    if (!this.prepareTrainingTraffic(lessonId)) {
      return this.rejectDecision(
        `could not prepare an eligible aircraft for ${lesson.title}`,
      );
    }
    this.setStation(
      lessonId === "surface-flow"
        ? "ramp"
        : lessonId === "arrival-basics"
          ? "supervisor"
          : "approach",
    );
    this.state.training = {
      ...createInactiveTrainingState(),
      status: "coach-paused",
      lessonId,
      startedAtSeconds: this.state.elapsed,
      stepStartedAtSeconds: this.state.elapsed,
      feedback:
        "No-fail lesson ready. Read the first objective, then continue when you are comfortable.",
    };
    this.state.paused = true;
    this.trainingCheckpoint = this.captureTrainingCheckpoint();
    this.decisionReason = `${lesson.title} training started at a recoverable checkpoint`;
    return true;
  }

  private prepareTrainingTraffic(lessonId: TrainingLessonId): boolean {
    if (lessonId === "surface-flow") {
      const flight = this.state.flights.find(
        (candidate) => candidate.flightPlan.direction === "departure",
      );
      if (!flight) return false;
      flight.phase = "resting";
      flight.progress = 1;
      flight.phaseElapsed = flight.duration;
      flight.pushbackCleared = false;
      flight.pushbackProgress = 0;
      flight.tugAttached = false;
      flight.engineState = "off";
      flight.runwayEntryCleared = false;
      flight.takeoffCleared = false;
      flight.controlHold = false;
      flight.automaticHold = false;
      flight.automaticHoldReason = undefined;
      flight.safetyHold = false;
      flight.safetyHoldReason = undefined;
      flight.navigation.frequencyOwner = "ramp";
      flight.navigation.handoff = undefined;
      flight.navigation.handoffStatus = "owned";
      completeTurnaround(flight.turnaround, this.state.elapsed);
      if (flight.gateAssignment) {
        flight.gateAssignment.actualGateInSeconds ??=
          this.state.elapsed - flight.turnaround.plannedDurationSeconds;
        flight.gateAssignment.actualGateOutSeconds = undefined;
      }
      syncFlightMotion(this.config, flight);
      this.events = [];
      return true;
    }

    this.state.flights = [];
    this.state.serviceVehicles = [];
    this.state.trafficFlow = createTrafficFlowState("quiet");
    this.nextId = 1;
    this.events = [];
    this.runwayReservations.clear();
    this.parkedAircraftEdgeMaskCache.clear();
    this.runwayOperationHistory = [];
    this.stationarySeconds.clear();
    this.surfaceYieldCooldownUntil.clear();
    this.failedSurfaceYieldRetryAt.clear();
    this.phaseTransitionRetryAt.clear();
    this.parkedBlockerRecovery.clear();
    this.spawnIn = Math.min(3, this.arrivalSpacing() * 0.55);
    this.state.trafficFlow.nextArrivalDemandSeconds = this.spawnIn;
    return (
      this.spawnFlight() !== null &&
      this.state.flights.some(
        (flight) =>
          flight.flightPlan.direction === "arrival" &&
          flight.phase === "approach",
      )
    );
  }

  stopTrainingLesson(): boolean {
    if (this.state.training.status === "inactive")
      return this.rejectDecision("no training lesson is active");
    const title =
      trainingLesson(this.state.training.lessonId)?.title ?? "Training";
    this.state.training = createInactiveTrainingState();
    this.trainingCheckpoint = null;
    this.state.paused = false;
    this.decisionReason = `${title} ended; the current airport state remains available`;
    return true;
  }

  continueTraining(): boolean {
    if (this.state.training.status === "inactive")
      return this.rejectDecision("no training lesson is active");
    if (this.state.training.status === "complete") {
      const title =
        trainingLesson(this.state.training.lessonId)?.title ?? "Training";
      this.state.training = createInactiveTrainingState();
      this.trainingCheckpoint = null;
      this.state.paused = false;
      this.decisionReason = `${title} complete; continuing the shift`;
      return true;
    }
    this.state.training.status = "active";
    this.state.training.feedback =
      "Lesson running. Unsafe instructions will be rejected and paused for explanation.";
    this.state.paused = false;
    this.decisionReason = "training lesson resumed";
    return true;
  }

  requestTrainingHint(): boolean {
    const step = currentTrainingStep(this.state.training);
    if (!step) return this.rejectDecision("no active training step has a hint");
    this.state.training.hintCount += 1;
    this.state.training.feedback = step.hint;
    this.decisionReason = `training hint: ${step.hint}`;
    return true;
  }

  retryTrainingStep(): boolean {
    if (!this.trainingCheckpoint || !currentTrainingStep(this.state.training)) {
      return this.rejectDecision(
        "no recoverable training checkpoint is available",
      );
    }
    const counters = {
      mistakes: this.state.training.mistakeCount,
      recoveries: this.state.training.recoveryCount + 1,
      hints: this.state.training.hintCount,
    };
    const checkpoint = this.trainingCheckpoint;
    this.restoreTrainingCheckpoint(checkpoint);
    this.state.training.mistakeCount = counters.mistakes;
    this.state.training.recoveryCount = counters.recoveries;
    this.state.training.hintCount = counters.hints;
    this.state.training.status = "coach-paused";
    this.state.training.feedback =
      "Checkpoint restored exactly. Review the explanation, then continue and try the step again.";
    this.state.paused = true;
    this.decisionReason = "training checkpoint restored";
    return true;
  }

  skipTrainingStep(): boolean {
    const lesson = trainingLesson(this.state.training.lessonId);
    const step = currentTrainingStep(this.state.training);
    if (!lesson || !step)
      return this.rejectDecision("no active training step can be skipped");
    this.state.training.skippedStepIds.push(step.id);
    this.advanceTrainingStep(
      lesson.title,
      `${step.objective} skipped without penalty.`,
    );
    this.decisionReason = `${step.id} skipped in no-fail training`;
    return true;
  }

  observeTrainingCommand(observation: TrainingCommandObservation): void {
    if (
      this.state.training.status === "inactive" ||
      this.state.training.status === "complete"
    )
      return;
    const step = currentTrainingStep(this.state.training);
    const lesson = trainingLesson(this.state.training.lessonId);
    if (!step || !lesson) return;
    if (!observation.accepted) {
      this.state.training.mistakeCount += 1;
      this.state.training.status = "coach-paused";
      this.state.training.feedback = `Instruction not issued: ${observation.reason}. ${step.why}`;
      this.state.paused = true;
      this.decisionReason = this.state.training.feedback;
      return;
    }
    if (!trainingObservationCompletesStep(this.state, step, observation))
      return;
    if (step.candidate && observation.flightId !== undefined)
      this.state.training.targetFlightId = observation.flightId;
    this.state.training.completedStepIds.push(step.id);
    this.advanceTrainingStep(lesson.title, `Completed: ${step.objective}`);
  }

  private advanceTrainingStep(lessonTitle: string, feedback: string): void {
    const lesson = trainingLesson(this.state.training.lessonId);
    if (!lesson) return;
    this.state.training.stepIndex += 1;
    this.state.training.stepStartedAtSeconds = this.state.elapsed;
    this.state.training.feedback = feedback;
    if (this.state.training.stepIndex >= lesson.steps.length) {
      this.state.training.status = "complete";
      this.state.paused = true;
      this.trainingCheckpoint = null;
      this.state.training.feedback = `${lessonTitle} complete. No safety rules were bypassed; continue the shift or choose another lesson.`;
      return;
    }
    this.trainingCheckpoint = this.captureTrainingCheckpoint();
  }

  private captureTrainingCheckpoint(): TrainingCheckpoint {
    return {
      state: structuredClone(this.state),
      nextId: this.nextId,
      nextDisruptionId: this.nextDisruptionId,
      lastSurfaceReplanSecond: this.lastSurfaceReplanSecond,
      spawnIn: this.spawnIn,
      speed: this.speed,
      runwayReservations: [...this.runwayReservations.entries()],
      runwayOperationHistory: structuredClone(this.runwayOperationHistory),
      taxiOutReleaseIn: this.taxiOutReleaseIn,
      baseWindDirection: this.baseWindDirection,
      baseWindSpeed: this.baseWindSpeed,
      weatherOverrideUntil: this.weatherOverrideUntil,
      closedRunway: this.closedRunway,
      runwayConfigurationOverrideId: this.runwayConfigurationOverrideId,
      metrics: { ...this.metrics },
      stationarySeconds: [...this.stationarySeconds.entries()],
      surfaceYieldCooldownUntil: [...this.surfaceYieldCooldownUntil.entries()],
      surfaceFlowPlanner: this.surfaceFlowPlanner.snapshot(),
      decisionReason: this.decisionReason,
      lastArrivalAdmissionReason: this.lastArrivalAdmissionReason,
    };
  }

  private restoreTrainingCheckpoint(checkpoint: TrainingCheckpoint): void {
    Object.assign(this.state, structuredClone(checkpoint.state));
    this.nextId = checkpoint.nextId;
    this.nextDisruptionId = checkpoint.nextDisruptionId;
    this.lastSurfaceReplanSecond = checkpoint.lastSurfaceReplanSecond;
    this.spawnIn = checkpoint.spawnIn;
    this.speed = checkpoint.speed;
    this.events = [];
    this.runwayReservations = new Map(checkpoint.runwayReservations);
    this.runwayOperationHistory = structuredClone(
      checkpoint.runwayOperationHistory,
    );
    this.taxiOutReleaseIn = checkpoint.taxiOutReleaseIn;
    this.baseWindDirection = checkpoint.baseWindDirection;
    this.baseWindSpeed = checkpoint.baseWindSpeed;
    this.weatherOverrideUntil = checkpoint.weatherOverrideUntil;
    this.closedRunway = checkpoint.closedRunway;
    this.runwayConfigurationOverrideId =
      checkpoint.runwayConfigurationOverrideId;
    Object.assign(this.metrics, checkpoint.metrics);
    this.stationarySeconds.clear();
    this.surfaceYieldCooldownUntil.clear();
    this.failedSurfaceYieldRetryAt.clear();
    this.surfaceFlowPlanner.restore(checkpoint.surfaceFlowPlanner);
    this.phaseTransitionRetryAt.clear();
    this.parkedAircraftEdgeMaskCache.clear();
    this.parkedBlockerRecovery.clear();
    for (const [flightId, seconds] of checkpoint.stationarySeconds)
      this.stationarySeconds.set(flightId, seconds);
    for (const [flightId, seconds] of checkpoint.surfaceYieldCooldownUntil)
      this.surfaceYieldCooldownUntil.set(flightId, seconds);
    this.decisionReason = checkpoint.decisionReason;
    this.lastArrivalAdmissionReason = checkpoint.lastArrivalAdmissionReason;
  }

  challengeSnapshot() {
    const definition = challengeDefinition(this.state.challenge.challengeId);
    return {
      ...cloneChallengeState(this.state.challenge),
      definition: definition
        ? {
            id: definition.id,
            title: definition.title,
            shortTitle: definition.shortTitle,
            summary: definition.summary,
            briefing: definition.briefing,
            scenario: definition.scenario,
            density: definition.density,
            separationRuleset: definition.separationRuleset,
            durationSeconds: definition.durationSeconds,
            weather: { ...definition.weather },
          }
        : null,
      availableChallenges: challengeDefinitions().map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        shortTitle: candidate.shortTitle,
        summary: candidate.summary,
        briefing: candidate.briefing,
        scenario: candidate.scenario,
        density: candidate.density,
        separationRuleset: candidate.separationRuleset,
        durationSeconds: candidate.durationSeconds,
        weather: { ...candidate.weather },
        objectives: candidate.objectives.map((objective) => objective.label),
      })),
      conditionsLocked: this.challengeConditionsLocked(),
    };
  }

  startChallenge(challengeId: ChallengeId): boolean {
    const definition = challengeDefinition(challengeId);
    if (!definition)
      return this.rejectDecision(`unknown challenge ${challengeId}`);
    this.state.challenge = createInactiveChallengeState();
    if (this.state.mode === "auto" || this.state.mode === "watch")
      this.setMode("assisted");
    this.setTrafficDensity(definition.density);
    this.setSeparationRuleset(definition.separationRuleset);
    this.reset(definition.scenario);
    this.state.stationAutomation = createStationAutomation(true);
    refreshScriptedControllerModes(
      this.state,
      this.state.scriptedControllers,
      `${definition.shortTitle} challenge staffing`,
    );
    this.setScenario(definition.scenario);
    this.setWeather(
      definition.weather.condition,
      this.baseWindDirection,
      definition.weather.windSpeedKts,
    );
    this.weatherOverrideUntil = Number.MAX_SAFE_INTEGER;
    this.state.challenge = {
      ...createInactiveChallengeState(),
      status: "briefing",
      challengeId,
      startedAtSeconds: this.state.elapsed,
      durationSeconds: definition.durationSeconds,
    };
    this.state.paused = true;
    this.updateChallengeState();
    this.decisionReason = `${definition.title} briefing ready; scenario conditions are locked until the debrief`;
    return true;
  }

  beginChallenge(): boolean {
    const definition = challengeDefinition(this.state.challenge.challengeId);
    if (!definition || this.state.challenge.status !== "briefing")
      return this.rejectDecision("no challenge briefing is ready");
    this.state.challenge.status = "active";
    this.state.challenge.startedAtSeconds = this.state.elapsed;
    this.state.challenge.endedAtSeconds = null;
    this.state.challenge.completionReason = null;
    this.state.gameOver = false;
    this.state.paused = false;
    this.updateChallengeState();
    this.decisionReason = `${definition.title} challenge clock started`;
    return true;
  }

  endChallenge(): boolean {
    const definition = challengeDefinition(this.state.challenge.challengeId);
    if (
      !definition ||
      (this.state.challenge.status !== "briefing" &&
        this.state.challenge.status !== "active")
    ) {
      return this.rejectDecision("no challenge shift is running");
    }
    this.finishChallenge(
      "abandoned",
      `${definition.title} ended early by the controller`,
    );
    this.decisionReason =
      this.state.challenge.completionReason ?? "challenge ended";
    return true;
  }

  continueAfterChallenge(): boolean {
    if (
      this.state.challenge.status !== "complete" &&
      this.state.challenge.status !== "failed" &&
      this.state.challenge.status !== "abandoned"
    ) {
      return this.rejectDecision("no completed challenge debrief is available");
    }
    const title =
      challengeDefinition(this.state.challenge.challengeId)?.title ??
      "Challenge";
    this.state.challenge = createInactiveChallengeState();
    this.state.gameOver = false;
    this.state.paused = false;
    this.weatherOverrideUntil = 0;
    this.decisionReason = `${title} debrief closed; continuing the current airport as free play`;
    return true;
  }

  sandboxSnapshot() {
    const snapshot = cloneSandboxState(this.state.sandbox);
    const activeFlightIds = new Set(
      this.state.flights.map((flight) => flight.id),
    );
    return {
      ...snapshot,
      trafficClasses: SANDBOX_TRAFFIC_CLASSES.map((trafficClass) => ({
        ...trafficClass,
      })),
      runwayOptions: this.config.runways.map((runway) => {
        const role = this.runwayRole(runway.id);
        return {
          id: runway.id,
          designation: this.activeRunwayDesignation(runway.id),
          role,
          closed: runwayClosedByDisruption(
            this.state.surfaceDisruptions,
            runway.id,
          ),
        };
      }),
      activeInjectedFlightIds: snapshot.injections
        .flatMap((request) => request.releasedFlightIds)
        .filter((flightId) => activeFlightIds.has(flightId)),
      activeAircraftCount: this.state.flights.length,
      pendingCount: snapshot.injections.reduce(
        (total, request) => total + request.remainingCount,
        0,
      ),
    };
  }

  startSandbox(backgroundTraffic = false): boolean {
    if (this.challengeConditionsLocked())
      return this.rejectDecision(
        "end the active challenge before entering sandbox",
      );
    if (this.state.training.status !== "inactive")
      return this.rejectDecision(
        "end the active training lesson before entering sandbox",
      );
    const paused = this.state.paused;
    const station = this.state.station;
    const stationAutomation = { ...this.state.stationAutomation };
    this.reset("normal");
    this.state.paused = paused;
    this.state.station = station;
    this.state.stationAutomation = stationAutomation;
    this.state.sandbox = {
      ...createInactiveSandboxState(),
      active: true,
      backgroundTraffic,
      startedAtSeconds: this.state.elapsed,
      lastMessage: backgroundTraffic
        ? "Sandbox ready with continuous background demand."
        : "Sandbox ready with a clear board and background demand off.",
    };
    this.clearSandboxBoardState(true);
    this.decisionReason = this.state.sandbox.lastMessage;
    return true;
  }

  stopSandbox(): boolean {
    if (!this.state.sandbox.active)
      return this.rejectDecision("sandbox is not active");
    this.state.sandbox = createInactiveSandboxState();
    scheduleNextArrivalDemand(
      this.state.trafficFlow,
      this.state.elapsed,
      this.arrivalDemandInterval(),
    );
    this.spawnIn = Math.max(
      0,
      this.state.trafficFlow.nextArrivalDemandSeconds - this.state.elapsed,
    );
    this.decisionReason =
      "sandbox closed; the current airport continues as ordinary free play";
    return true;
  }

  setSandboxBackgroundTraffic(enabled: boolean): boolean {
    if (!this.state.sandbox.active)
      return this.rejectDecision(
        "enter sandbox before changing background traffic",
      );
    this.state.sandbox.backgroundTraffic = enabled;
    if (enabled) {
      scheduleNextArrivalDemand(
        this.state.trafficFlow,
        this.state.elapsed,
        this.arrivalDemandInterval(),
      );
    } else {
      this.state.trafficFlow.arrivalQueue = [];
      this.state.trafficFlow.nextArrivalDemandSeconds =
        this.state.elapsed + this.arrivalDemandInterval();
    }
    this.spawnIn = Math.max(
      0,
      this.state.trafficFlow.nextArrivalDemandSeconds - this.state.elapsed,
    );
    this.state.sandbox.lastMessage = enabled
      ? "Continuous background demand enabled."
      : "Background demand disabled; only queued injections will add aircraft.";
    this.decisionReason = this.state.sandbox.lastMessage;
    return true;
  }

  queueSandboxTraffic(
    direction: SandboxTrafficDirection,
    trafficClass: SandboxTrafficClass,
    runwayId: number | null,
    count: number,
  ): boolean {
    if (!this.state.sandbox.active)
      return this.rejectDecision("enter sandbox before injecting traffic");
    if (direction !== "arrival" && direction !== "departure")
      return this.rejectDecision(
        "sandbox direction must be arrival or departure",
      );
    if (
      !SANDBOX_TRAFFIC_CLASSES.some(
        (candidate) => candidate.id === trafficClass,
      )
    )
      return this.rejectDecision("unknown sandbox traffic class");
    if (!Number.isInteger(count) || count < 1 || count > 8)
      return this.rejectDecision(
        "sandbox injection count must be an integer from 1 to 8",
      );
    const liveRequests = this.state.sandbox.injections.filter(
      (request) =>
        request.status === "queued" || request.status === "releasing",
    );
    if (liveRequests.length >= 12)
      return this.rejectDecision(
        "sandbox injection queue is full; wait or cancel pending traffic",
      );
    if (runwayId !== null) {
      const runway = this.config.runways.find(
        (candidate) => candidate.id === runwayId,
      );
      if (!runway) return this.rejectDecision(`unknown runway ${runwayId}`);
      const role = this.runwayRole(runwayId);
      const compatibleRole =
        direction === "arrival"
          ? role === "arrival" || role === "mixed"
          : role === "departure" || role === "mixed";
      if (!compatibleRole)
        return this.rejectDecision(
          `${this.activeRunwayDesignation(runwayId)} is not active for ${direction}s`,
        );
      if (runwayClosedByDisruption(this.state.surfaceDisruptions, runwayId))
        return this.rejectDecision(
          `${this.activeRunwayDesignation(runwayId)} is closed`,
        );
    }
    const id = this.state.sandbox.nextInjectionId;
    this.state.sandbox.nextInjectionId += 1;
    this.state.sandbox.injections.push({
      id,
      direction,
      trafficClass,
      runwayId,
      requestedCount: count,
      remainingCount: count,
      releasedFlightIds: [],
      status: "queued",
      createdAtSeconds: this.state.elapsed,
      updatedAtSeconds: this.state.elapsed,
      nextAttemptSeconds: this.state.elapsed,
      lastReason: "awaiting a safe release opportunity",
    });
    this.state.sandbox.totals.requested += count;
    this.state.sandbox.lastMessage = `${count} ${trafficClass === "auto" ? "airport-mix" : trafficClass} ${direction}${count === 1 ? "" : "s"} queued safely.`;
    this.decisionReason = this.state.sandbox.lastMessage;
    return true;
  }

  cancelSandboxInjections(): boolean {
    if (!this.state.sandbox.active)
      return this.rejectDecision("sandbox is not active");
    let cancelled = 0;
    for (const request of this.state.sandbox.injections) {
      if (request.status !== "queued" && request.status !== "releasing")
        continue;
      cancelled += request.remainingCount;
      request.remainingCount = 0;
      request.status = "cancelled";
      request.updatedAtSeconds = this.state.elapsed;
      request.lastReason = "cancelled by sandbox controller";
    }
    if (!cancelled)
      return this.rejectDecision("no sandbox injections are pending");
    this.state.sandbox.totals.cancelled += cancelled;
    this.state.sandbox.lastMessage = `${cancelled} pending injection${cancelled === 1 ? "" : "s"} cancelled.`;
    this.decisionReason = this.state.sandbox.lastMessage;
    return true;
  }

  clearSandboxTraffic(): boolean {
    if (!this.state.sandbox.active)
      return this.rejectDecision("sandbox is not active");
    let cancelled = 0;
    for (const request of this.state.sandbox.injections) {
      if (request.status !== "queued" && request.status !== "releasing")
        continue;
      cancelled += request.remainingCount;
      request.remainingCount = 0;
      request.status = "cancelled";
      request.updatedAtSeconds = this.state.elapsed;
      request.lastReason = "cancelled when the sandbox board was cleared";
    }
    this.state.sandbox.totals.cancelled += cancelled;
    this.clearSandboxBoardState(true);
    this.state.sandbox.lastMessage =
      "Sandbox board cleared; weather and runway configuration were preserved.";
    this.decisionReason = this.state.sandbox.lastMessage;
    return true;
  }

  private clearSandboxBoardState(resetCounters: boolean): void {
    const density = this.state.trafficFlow.density;
    this.state.flights = [];
    this.state.serviceVehicles = [];
    this.state.trafficFlow = createTrafficFlowState(
      density,
      this.state.elapsed,
      this.arrivalDemandInterval(),
    );
    this.spawnIn = Math.max(
      0,
      this.state.trafficFlow.nextArrivalDemandSeconds - this.state.elapsed,
    );
    this.events = [];
    this.runwayReservations.clear();
    this.runwayOperationHistory = [];
    this.stationarySeconds.clear();
    this.surfaceYieldCooldownUntil.clear();
    this.failedSurfaceYieldRetryAt.clear();
    this.phaseTransitionRetryAt.clear();
    this.parkedAircraftEdgeMaskCache.clear();
    this.parkedBlockerRecovery.clear();
    this.taxiOutReleaseIn = 0;
    this.lastArrivalAdmissionReason = "sandbox injection queue is clear";
    if (resetCounters) {
      this.state.arrivals = 0;
      this.state.departures = 0;
      Object.assign(this.metrics, createShiftMetrics());
    }
  }

  private challengeConditionsLocked(): boolean {
    return (
      this.state.challenge.status === "briefing" ||
      this.state.challenge.status === "active"
    );
  }

  private updateChallengeState(): void {
    if (
      this.state.challenge.status !== "briefing" &&
      this.state.challenge.status !== "active"
    )
      return;
    Object.assign(
      this.state.challenge,
      evaluateChallenge(
        this.state.challenge,
        this.metrics,
        this.config.scope,
        this.state.elapsed,
      ),
    );
    if (this.state.challenge.status !== "active") return;
    const safety = this.state.challenge.summary.safety;
    if (
      safety.collisionAlerts ||
      safety.runwayIncursions ||
      safety.unexplainedPauses
    ) {
      this.finishChallenge(
        "failed",
        "Safety invariant breached; the shift closed for review",
      );
      return;
    }
    if (this.state.challenge.summary.remainingSeconds <= 1e-6) {
      this.finishChallenge("complete", "Challenge clock complete");
    }
  }

  private finishChallenge(
    status: "complete" | "failed" | "abandoned",
    reason: string,
  ): void {
    this.state.challenge.status = status;
    this.state.challenge.endedAtSeconds = this.state.elapsed;
    this.state.challenge.completionReason = reason;
    Object.assign(
      this.state.challenge,
      evaluateChallenge(
        this.state.challenge,
        this.metrics,
        this.config.scope,
        this.state.elapsed,
      ),
    );
    this.state.gameOver = true;
    this.state.paused = true;
  }

  setMode(mode: ControlMode): boolean {
    if (
      this.challengeConditionsLocked() &&
      (mode === "auto" || mode === "watch")
    ) {
      return this.rejectDecision(
        "challenge shifts require Assisted or Manual control",
      );
    }
    this.state.mode = mode;
    if (this.isAutomaticMode()) {
      for (const flight of this.state.flights) {
        if (flight.emergency !== "disabled") flight.controlHold = false;
        flight.controlPace = 1;
        flight.controlPattern = undefined;
        flight.controlPatternStart = undefined;
        if (
          flight.phase === "approach" &&
          !flight.cleared &&
          !flight.goAround &&
          !flight.diversion
        ) {
          flight.clearanceLeft = Math.max(
            flight.clearanceLeft,
            flight.duration * 0.96 - flight.phaseElapsed,
          );
        }
      }
    } else {
      for (const flight of this.state.flights) {
        flight.automaticHold = false;
        flight.automaticHoldReason = undefined;
        if (this.state.paused && flight.phase === "approach") {
          flight.cleared = false;
          flight.clearanceLeft = Math.max(
            2,
            flight.duration * 0.96 - flight.phaseElapsed,
          );
        }
      }
    }
    refreshScriptedControllerModes(
      this.state,
      this.state.scriptedControllers,
      `${mode} mode selected`,
    );
    this.decisionReason = `${mode} control active`;
    return true;
  }

  setTrafficDensity(density: TrafficDensity): boolean {
    const challenge = challengeDefinition(this.state.challenge.challengeId);
    if (this.challengeConditionsLocked() && challenge) {
      return this.rejectDecision(
        `${challenge.title} locks ${challenge.density} traffic until the debrief`,
      );
    }
    setTrafficFlowDensity(this.state.trafficFlow, density, this.state.elapsed);
    this.spawnIn = Math.max(
      0,
      this.state.trafficFlow.nextArrivalDemandSeconds - this.state.elapsed,
    );
    this.decisionReason = `${trafficDensityProfile(density).label} traffic density active`;
    return true;
  }

  setTrafficFlowObjective(objective: TrafficFlowObjective): boolean {
    if (this.state.station !== "supervisor") {
      return this.rejectDecision(
        `${this.state.station} station cannot change the airport flow objective`,
      );
    }
    if (!isTrafficFlowObjective(objective)) {
      return this.rejectDecision("unknown traffic-flow objective");
    }
    setTrafficFlowObjective(
      this.state.trafficFlow,
      objective,
      this.state.elapsed,
    );
    const profile = trafficFlowObjectiveProfile(objective);
    this.decisionReason = `${profile.label} flow objective active`;
    return true;
  }

  setSeparationRuleset(id: SeparationRulesetId): boolean {
    const challenge = challengeDefinition(this.state.challenge.challengeId);
    if (this.challengeConditionsLocked() && challenge) {
      return this.rejectDecision(
        `${challenge.title} locks ${challenge.separationRuleset} separation until the debrief`,
      );
    }
    this.state.separationRuleset = id;
    this.decisionReason = `${separationRuleset(id).label} separation active`;
    return true;
  }

  setNightMode(enabled: boolean): void {
    this.setEnvironmentLightingMode(enabled ? "night" : "day");
  }

  setEnvironmentLightingMode(mode: EnvironmentLightingMode): boolean {
    if (!isEnvironmentLightingMode(mode))
      return this.rejectDecision(
        "lighting mode must be automatic, day, or night",
      );
    this.state.environment.lightingMode = mode;
    this.updateEnvironment(0);
    this.decisionReason = `${mode} lighting active`;
    return true;
  }

  setEnvironmentSeasonMode(mode: EnvironmentSeasonMode): boolean {
    if (!isEnvironmentSeasonMode(mode))
      return this.rejectDecision(
        "season must be automatic, spring, summer, autumn, or winter",
      );
    this.state.environment.seasonMode = mode;
    this.updateEnvironment(0);
    this.decisionReason = `${mode} season presentation active`;
    return true;
  }

  setOperationTimeOffsetMinutes(offsetMinutes: number): boolean {
    if (!Number.isFinite(offsetMinutes))
      return this.rejectDecision("operation time offset must be finite");
    this.state.operationTimeOffsetMinutes = Math.round(offsetMinutes);
    this.updateEnvironment(0);
    const operation = this.operationStateAt();
    this.decisionReason = `operation clock set to ${operation.localTime} · ${operation.periodLabel}`;
    return true;
  }

  applyAmbientProgram(id: AmbientProgramId): boolean {
    if (this.challengeConditionsLocked())
      return this.rejectDecision(
        "end the active challenge before changing the ambient program",
      );
    const program = ambientProgram(id);
    if (!program) return this.rejectDecision("unknown ambient program");
    const offset =
      program.localMinute -
      this.config.operationProfile.sessionStartLocalMinute;
    this.setOperationTimeOffsetMinutes(offset);
    this.setTrafficDensity(program.density);
    setTrafficFlowObjective(
      this.state.trafficFlow,
      program.flowObjective,
      this.state.elapsed,
    );
    this.setEnvironmentLightingMode(program.lightingMode);
    this.setEnvironmentSeasonMode(program.seasonMode);
    this.setWeather(
      program.weather,
      (program.windDirectionDegrees * Math.PI) / 180,
      program.windSpeedKts,
    );
    this.setWeatherHazardsEnabled(false);
    this.decisionReason = `${program.label} ambient program active`;
    return true;
  }

  setStation(station: ControllerStation): void {
    this.state.station = station;
    if (isOperationalControllerStation(station)) {
      for (const candidate of OPERATIONAL_CONTROLLER_STATIONS) {
        this.state.stationAutomation[candidate] = candidate !== station;
      }
    } else if (this.state.training.status !== "inactive") {
      for (const candidate of OPERATIONAL_CONTROLLER_STATIONS)
        this.state.stationAutomation[candidate] = false;
    }
    refreshScriptedControllerModes(
      this.state,
      this.state.scriptedControllers,
      `${station} workstation selected`,
    );
  }

  setStationAutomation(
    station: OperationalControllerStation,
    enabled: boolean,
  ): boolean {
    if (this.state.station !== "supervisor") {
      return this.rejectDecision(
        `${this.state.station} station cannot configure unstaffed-position automation`,
      );
    }
    this.state.stationAutomation[station] = enabled;
    this.decisionReason = `${station} automation ${enabled ? "enabled" : "disabled"}`;
    refreshScriptedControllerModes(
      this.state,
      this.state.scriptedControllers,
      `${station} automation ${enabled ? "enabled" : "disabled"}`,
    );
    return true;
  }

  setControllerPolicyPreset(presetId: string): boolean {
    if (this.state.station !== "supervisor") {
      return this.rejectDecision(
        `${this.state.station} station cannot configure airport-wide controller policy`,
      );
    }
    if (!isControllerPolicyPresetId(presetId)) {
      return this.rejectDecision("unknown controller policy preset");
    }
    applyControllerPolicyPreset(
      this.state.scriptedControllers,
      presetId,
      this.state.elapsed,
    );
    refreshScriptedControllerModes(
      this.state,
      this.state.scriptedControllers,
      `${controllerPolicyPreset(presetId).label} controller policy selected`,
    );
    this.decisionReason = `${controllerPolicyPreset(presetId).label} controller policy active`;
    return true;
  }

  controllerPolicySnapshot(): {
    selected: ControllerPolicyPresetId;
    active: ControllerPolicyPreset;
    catalog: ControllerPolicyPreset[];
  } {
    const selected = this.state.scriptedControllers.presetId;
    return {
      selected,
      active: controllerPolicyPreset(selected),
      catalog: controllerPolicyPresetCatalog(),
    };
  }

  controllerWorkloads(): ControllerWorkloadSnapshot[] {
    return controllerWorkloadSnapshots(
      this.state.flights,
      this.isAutomaticMode()
        ? createStationAutomation(true)
        : this.state.stationAutomation,
      this.state.scriptedControllers,
    );
  }

  controllerPerformance(): ControllerPerformanceSnapshot[] {
    const workloads = this.controllerWorkloads();
    return controllerPerformanceSnapshots({
      state: this.state,
      metrics: this.shiftMetrics(),
      workloads,
      queues: this.queueSnapshot(),
      predictions: this.conflictPredictions(),
    });
  }

  lastCommandReason(): string {
    return this.decisionReason;
  }

  runwayConfigurationOptions(): Array<{
    id: string;
    eligible: boolean;
    reason: string;
  }> {
    return this.config.runwayConfigurations.map((configuration) => {
      const reason = this.configurationRestrictionReason(configuration);
      return {
        id: configuration.id,
        eligible: reason === null,
        reason: reason ?? "available",
      };
    });
  }

  setRunwayConfiguration(configurationId: string | null): boolean {
    if (this.challengeConditionsLocked()) {
      return this.rejectDecision(
        "the active challenge locks its runway configuration until the debrief",
      );
    }
    if (this.state.station !== "supervisor") {
      return this.rejectDecision(
        `${this.state.station} station cannot change the airport runway plan`,
      );
    }
    if (configurationId === null) {
      this.runwayConfigurationOverrideId = null;
      this.state.runwayConfigurationMode = "automatic";
      this.decisionReason = "automatic runway-plan selection restored";
      this.updateActiveRunwayConfiguration();
      return true;
    }
    const configuration = this.config.runwayConfigurations.find(
      (candidate) => candidate.id === configurationId,
    );
    if (!configuration)
      return this.rejectDecision(
        `unknown runway configuration ${configurationId}`,
      );
    const restriction = this.configurationRestrictionReason(configuration);
    if (restriction)
      return this.rejectDecision(
        `${configuration.name} unavailable: ${restriction}`,
      );
    this.runwayConfigurationOverrideId = configuration.id;
    this.state.runwayConfigurationMode = "manual";
    this.requestRunwayConfiguration(configuration, "supervisor selection");
    this.decisionReason = this.state.runwayConfigurationTransition
      ? `${configuration.name} queued until ${this.state.runwayConfigurationTransition.blockingFlightIds.length} protected flight${this.state.runwayConfigurationTransition.blockingFlightIds.length === 1 ? "" : "s"} clear`
      : `${configuration.name} active`;
    return true;
  }

  canIssue(kind: OperationalControllerStation): boolean {
    return stationCanIssue(this.state.station, kind);
  }

  private ownsFlight(flight: Flight): boolean {
    return (
      this.state.station === "supervisor" ||
      flight.navigation.frequencyOwner === this.state.station
    );
  }

  triggerEmergency(id: number, type: EmergencyType): boolean {
    const flight = this.state.flights.find(
      (item) => item.id === id && item.phase !== "resting",
    );
    if (!flight)
      return this.rejectDecision(
        "flight is not available for that instruction",
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (type === "go-around" && flight.diversion)
      return this.rejectDecision(
        `${flight.callsign} is already established on a diversion exit`,
        flight,
      );
    if (
      type === "go-around" &&
      flight.phase !== "approach" &&
      flight.phase !== "landing"
    ) {
      return this.rejectDecision(
        `${flight.callsign} is not on an approach where a go-around can be issued`,
        flight,
      );
    }
    if (type === "go-around" && flight.motion.onGround) {
      return this.rejectDecision(
        `${flight.callsign} has touched down; continue the landing rollout`,
        flight,
      );
    }
    if (
      type === "go-around" &&
      this.state.station !== "supervisor" &&
      this.state.station !== "approach" &&
      this.state.station !== "tower"
    ) {
      return this.rejectDecision(
        `${this.state.station} station has no go-around authority`,
        flight,
      );
    }
    if (type === "disabled" && !this.canIssue("ground"))
      return this.rejectDecision(
        `${this.state.station} station cannot dispatch surface recovery`,
        flight,
      );
    if (
      type === "disabled" &&
      flight.phase !== "taxi-in" &&
      flight.phase !== "taxi-out"
    ) {
      return this.rejectDecision(
        "disabled-aircraft recovery applies only to aircraft on the movement surface",
        flight,
      );
    }
    if (type === "disabled" && flight.emergency === "disabled") {
      return this.rejectDecision(
        `${flight.callsign} is already awaiting recovery`,
        flight,
      );
    }
    flight.emergency = type;
    this.metrics.emergencyResponses += 1;
    if (
      type === "go-around" &&
      (flight.phase === "approach" || flight.phase === "landing")
    ) {
      this.goAround(flight, "controller instruction");
    }
    if (type === "disabled") {
      flight.controlHold = true;
      this.createDisabledAircraftDisruption(flight);
    }
    this.events.push({ type: "emergency", flight });
    this.decisionReason = `${type} handling active for ${flight.callsign}`;
    return true;
  }

  setSurfaceDisruption(
    kind: Exclude<SurfaceDisruptionKind, "disabled-aircraft">,
    targetId: string,
    enabled: boolean,
    durationSeconds?: number,
  ): boolean {
    if (this.state.station !== "supervisor") {
      return this.rejectDecision(
        `${this.state.station} station cannot change airport surface availability`,
      );
    }
    if (!enabled) {
      const disruption = this.state.surfaceDisruptions.find(
        (candidate) =>
          candidate.kind === kind &&
          (candidate.id === targetId || candidate.targetId === targetId),
      );
      if (!disruption)
        return this.rejectDecision("no matching active surface restriction");
      if (
        this.challengeConditionsLocked() &&
        disruption.source === "scenario"
      ) {
        return this.rejectDecision(
          "the active challenge locks its scenario runway restriction",
        );
      }
      return this.clearSurfaceDisruption(disruption.id);
    }
    return this.createSurfaceDisruption(
      kind,
      targetId,
      "controller",
      durationSeconds,
    );
  }

  clearSurfaceDisruption(id: string): boolean {
    if (this.state.station !== "supervisor") {
      return this.rejectDecision(
        `${this.state.station} station cannot reopen airport pavement`,
      );
    }
    const disruption = this.state.surfaceDisruptions.find(
      (candidate) => candidate.id === id,
    );
    if (!disruption)
      return this.rejectDecision(`unknown surface restriction ${id}`);
    if (disruption.kind === "disabled-aircraft") {
      return this.rejectDecision(
        "dispatch recovery for a disabled aircraft before reopening its pavement",
      );
    }
    if (
      disruption.source === "incident" &&
      disruption.responsePhase !== "ready-to-reopen"
    ) {
      return this.rejectDecision(
        `${disruption.label} cannot reopen while ${incidentResponsePhaseLabel(disruption.responsePhase)} is active`,
      );
    }
    if (this.challengeConditionsLocked() && disruption.source === "scenario") {
      return this.rejectDecision(
        "the active challenge locks its scenario runway restriction",
      );
    }
    return this.removeSurfaceDisruption(
      id,
      "supervisor reopened the movement area",
    );
  }

  triggerSurfaceIncident(kind: SurfaceIncidentKind, targetId: string): boolean {
    if (this.state.station !== "supervisor") {
      return this.rejectDecision(
        `${this.state.station} station cannot declare a surface incident`,
      );
    }
    const incident = surfaceIncidentDefinition(kind);
    if (!incident)
      return this.rejectDecision(`unknown surface incident ${kind}`);
    return this.createSurfaceDisruption(
      incident.surfaceDisruptionKind,
      targetId,
      "incident",
      incident.durationSeconds,
      incident,
    );
  }

  recoverDisabledAircraft(flightId: number): boolean {
    if (!this.canIssue("ground"))
      return this.rejectDecision(
        `${this.state.station} station cannot dispatch surface recovery`,
      );
    const disruption = this.state.surfaceDisruptions.find(
      (candidate) =>
        candidate.kind === "disabled-aircraft" &&
        candidate.flightId === flightId,
    );
    const flight = this.state.flights.find(
      (candidate) => candidate.id === flightId,
    );
    if (!disruption || !flight)
      return this.rejectDecision("disabled aircraft is not awaiting recovery");
    if (disruption.status === "recovering")
      return this.rejectDecision(
        `${flight.callsign} recovery is already in progress`,
        flight,
      );
    this.startDisabledRecovery(disruption, flight, "ground recovery dispatch");
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} recovery dispatched`;
    return true;
  }

  setScenario(scenario: TrafficScenario): boolean {
    const challenge = challengeDefinition(this.state.challenge.challengeId);
    if (this.challengeConditionsLocked() && challenge) {
      return this.rejectDecision(
        `${challenge.title} locks the ${challenge.scenario} scenario until the debrief`,
      );
    }
    this.state.scenario = scenario;
    this.removeSurfaceDisruptionsBySource("scenario");
    if (scenario === "closure") {
      const runway = this.config.runways.find(
        (candidate) =>
          (this.runwayRole(candidate.id) === "arrival" ||
            this.runwayRole(candidate.id) === "mixed") &&
          this.runwayClosureLeavesCapacity(candidate.id),
      );
      if (runway)
        this.createSurfaceDisruption(
          "runway-closure",
          String(runway.id),
          "scenario",
        );
    }
    if (scenario === "storm")
      this.setWeather(
        "rain",
        this.state.weather.windDirection,
        Math.max(18, this.state.weather.windSpeed),
      );
    if (scenario === "normal" || scenario === "rush" || scenario === "closure")
      this.weatherOverrideUntil = 0;
    this.updateActiveRunwayConfiguration();
    this.decisionReason = `${scenario} scenario active`;
    return true;
  }

  shiftMetrics(): ShiftMetrics {
    return { ...this.metrics };
  }

  clearanceProposals(): ClearanceProposal[] {
    if (this.state.mode !== "assisted") return [];
    const proposals: ClearanceProposal[] = [];
    // Keep the assisted Tower card to one usable movement per conflicting
    // runway group. The command itself repeats every safety check on approval;
    // this only prevents a controller from being offered a knowingly blocked
    // line-up or takeoff beside the actual next release.
    const towerReadyDepartures = this.towerReadyDepartureIds();
    for (const flight of this.state.flights) {
      if (
        flight.phase === "approach" &&
        !flight.cleared &&
        !flight.goAround &&
        !flight.diversion &&
        !flight.navigation.hold
      ) {
        proposals.push({
          id: `${flight.id}:land:${flight.runway}`,
          flightId: flight.id,
          action: "land",
          runway: flight.runway,
          station: "tower",
          label: `Clear to land ${this.activeRunwayDesignation(flight.runway)}`,
          reason:
            flight.progress > 0.72
              ? "Established on final; landing clearance is becoming time-critical."
              : "Approach is stable and the assigned runway sequence is protected.",
          priority:
            flight.progress > 0.82
              ? "urgent"
              : flight.progress > 0.62
                ? "attention"
                : "routine",
        });
      }
      if (
        flight.phase === "approach" &&
        flight.progress < 0.68 &&
        !flight.goAround &&
        !flight.diversion &&
        !flight.navigation.hold
      ) {
        const leader = this.state.flights
          .filter(
            (candidate) =>
              candidate.id !== flight.id &&
              candidate.phase === "approach" &&
              candidate.runway === flight.runway &&
              candidate.progress > flight.progress &&
              !candidate.goAround &&
              !candidate.diversion,
          )
          .sort((first, second) => first.progress - second.progress)[0];
        const currentSpeed =
          flight.navigation.assignedSpeedKts ?? flight.kinematics.airspeedKts;
        const targetSpeed = Math.max(
          aircraftProfile(flight.aircraft).approachKts,
          Math.round((currentSpeed - 15) / 5) * 5,
        );
        const progressGap = leader ? leader.progress - flight.progress : 1;
        if (leader && progressGap < 0.16 && targetSpeed <= currentSpeed - 5) {
          proposals.push({
            id: `${flight.id}:slow:${targetSpeed}`,
            flightId: flight.id,
            action: "slow",
            speedKts: targetSpeed,
            station: "approach",
            label: `Reduce to ${targetSpeed} kt`,
            reason: `${leader.callsign} is ahead on the same runway sequence; a small speed reduction creates spacing before final without inserting a holding pattern.`,
            priority: progressGap < 0.08 ? "urgent" : "attention",
          });
        }

        // If speed control alone cannot create enough room, offer Approach a
        // published terminal hold. Only the trailing aircraft may receive it,
        // and only before the final segment where holdFlight() accepts it.
        const holdPressure = leader && progressGap < 0.1;
        if (holdPressure && progressGap < 0.1 && flight.progress >= 0.2) {
          const routeFixes = new Set(flight.navigation.routeFixIds);
          const pattern =
            this.config.airspaceProgram.holds.find((hold) =>
              routeFixes.has(hold.fixId),
            ) ??
            this.config.airspaceProgram.holds[
              flight.id % this.config.airspaceProgram.holds.length
            ];
          if (pattern) {
            proposals.push({
              id: `${flight.id}:hold:${pattern.id}`,
              flightId: flight.id,
              action: "hold",
              patternId: pattern.id,
              efcMinutes: 3,
              station: "approach",
              label: `Hold at ${pattern.name} · EFC 3 min`,
              reason: `${leader.callsign} is less than 0.10 sequence-progress ahead on the same runway; a published hold meters the arrival without forcing a sharp vector or a late go-around.`,
              priority: progressGap < 0.06 ? "urgent" : "attention",
            });
          }
        }

        // A published-route direct-to is useful early in the arrival when it
        // removes a redundant dog-leg. Keep it conservative: skip at most one
        // upcoming fix, stay well outside final, and let directFlightTo() run
        // the authoritative ownership/geometry checks on approval.
        const directIndex = flight.navigation.activeFixIndex + 2;
        const directFixId = flight.navigation.routeFixIds[directIndex];
        const directFix = directFixId
          ? this.config.airspaceProgram.fixes.find(
              (fix) => fix.id === directFixId,
            )
          : undefined;
        if (
          !leader &&
          !flight.navigation.vector &&
          flight.progress >= 0.2 &&
          flight.progress < 0.5 &&
          directFix
        ) {
          const heading = this.mathAngleToAviationDegrees(
            Math.atan2(
              directFix.position[1] - flight.motion.y,
              directFix.position[0] - flight.motion.x,
            ),
          );
          const presentHeading = this.mathAngleToAviationDegrees(
            flight.motion.heading,
          );
          const turn = Math.abs(
            Math.atan2(
              Math.sin(((heading - presentHeading) * Math.PI) / 180),
              Math.cos(((heading - presentHeading) * Math.PI) / 180),
            ) *
              (180 / Math.PI),
          );
          if (turn <= 90) {
            proposals.push({
              id: `${flight.id}:direct-to:${directFix.id}`,
              flightId: flight.id,
              action: "direct-to",
              fixId: directFix.id,
              station: "approach",
              label: `Direct ${directFix.name}`,
              reason: `Early in the published arrival, ${directFix.name} is the next safe route shortcut (${Math.round(turn)}° turn); no conflicting sequence leader is ahead.`,
              priority: "routine",
            });
          }
        }

        // When a shortcut is unavailable, give Approach a small, published-
        // route vector instead of forcing manual heading nudges. This is only
        // offered early enough to rejoin the next fix and within the same
        // 120-degree turn limit enforced by assignHeading().
        const vectorFixId =
          flight.navigation.routeFixIds[flight.navigation.activeFixIndex + 1];
        const vectorFix = vectorFixId
          ? this.config.airspaceProgram.fixes.find(
              (fix) => fix.id === vectorFixId,
            )
          : undefined;
        if (
          !leader &&
          !flight.navigation.vector &&
          !flight.navigation.hold &&
          flight.progress >= 0.2 &&
          flight.progress < 0.6 &&
          vectorFix
        ) {
          const heading = this.mathAngleToAviationDegrees(
            Math.atan2(
              vectorFix.position[1] - flight.motion.y,
              vectorFix.position[0] - flight.motion.x,
            ),
          );
          const presentHeading = this.mathAngleToAviationDegrees(
            flight.motion.heading,
          );
          const turn = Math.abs(
            Math.atan2(
              Math.sin(((heading - presentHeading) * Math.PI) / 180),
              Math.cos(((heading - presentHeading) * Math.PI) / 180),
            ) *
              (180 / Math.PI),
          );
          if (turn >= 18 && turn <= 90) {
            proposals.push({
              id: `${flight.id}:vector:${Math.round(heading)}`,
              flightId: flight.id,
              action: "vector",
              headingDegrees: Math.round(heading),
              station: "approach",
              label: `Fly heading ${String(Math.round(heading)).padStart(3, "0")}`,
              reason: `Rejoin ${vectorFix.name} with a ${Math.round(turn)}° correction; the vector stays outside final and returns the aircraft to its published arrival.`,
              priority: "routine",
            });
          }
        }
      }
      if (
        (flight.phase === "approach" || flight.phase === "landing") &&
        !flight.motion.onGround &&
        flight.safetyHold
      ) {
        proposals.push({
          id: `${flight.id}:go-around`,
          flightId: flight.id,
          action: "go-around",
          runway: flight.runway,
          station:
            requiredControllerStation(flight) === "tower"
              ? "tower"
              : "approach",
          label: "Issue go-around",
          reason:
            flight.safetyHoldReason ??
            "Protected approach spacing cannot be maintained.",
          priority: "urgent",
        });
      }
      if (
        flight.phase === "resting" &&
        flight.turnaround.status === "ready" &&
        !flight.pushbackCleared &&
        !serviceVehiclesBlockingPushback(this.state.serviceVehicles, flight.id)
          .length &&
        flight.deicing.status !== "unavailable" &&
        !this.state.runwayConfigurationTransition
      ) {
        proposals.push({
          id: `${flight.id}:pushback`,
          flightId: flight.id,
          action: "pushback",
          station: "ramp",
          label: `Push ${flight.pushbackDirection}`,
          reason: `Turnaround is complete; tug and engine-start sequence are ready for a ${flight.pushbackDirection} push to the ramp lane.`,
          priority: "attention",
        });
      }
      const nextCrossing = this.nextUnclearedCrossing(flight);
      for (const crossing of nextCrossing &&
      nextCrossing.distanceToHold * WORLD_METERS_PER_UNIT <=
        CROSSING_CLEARANCE_RANGE_M
        ? [nextCrossing]
        : []) {
        const runway = crossing.runwayId;
        proposals.push({
          id: `${flight.id}:cross:${runway}`,
          flightId: flight.id,
          action: "cross",
          runway,
          station: "ground",
          label: `Cross ${this.activeRunwayDesignation(runway)}`,
          reason: `Approaching the hold-short point for runway ${this.activeRunwayDesignation(runway)}; occupancy will be rechecked on approval.`,
          priority: crossing.distanceToHold <= 0.05 ? "urgent" : "attention",
        });
      }
      if (
        flight.phase === "taxi-out" &&
        flight.progress >= 0.985 &&
        !flight.runwayEntryCleared &&
        towerReadyDepartures.has(flight.id) &&
        deicingReleaseValid(flight, this.state.weather, this.state.elapsed)
      ) {
        proposals.push({
          id: `${flight.id}:line-up:${flight.runway}`,
          flightId: flight.id,
          action: "line-up",
          runway: flight.runway,
          station: "tower",
          label: `Line up ${this.activeRunwayDesignation(flight.runway)}`,
          reason: `Aircraft is stopped at the hold-short point and all required route crossings are clear. ${this.towerDepartureReleaseDetail(flight)}`,
          priority: "attention",
        });
      }
      if (
        flight.phase === "takeoff" &&
        !flight.takeoffCleared &&
        towerReadyDepartures.has(flight.id)
      ) {
        proposals.push({
          id: `${flight.id}:takeoff:${flight.runway}`,
          flightId: flight.id,
          action: "takeoff",
          runway: flight.runway,
          station: "tower",
          label: `Clear takeoff ${this.activeRunwayDesignation(flight.runway)}`,
          reason: `Aircraft is lined up; runway protection and arrival spacing will be validated on approval. ${this.towerDepartureReleaseDetail(flight)}`,
          priority: "attention",
        });
      }
      if (flight.controlHold && !flight.safetyHold) {
        proposals.push({
          id: `${flight.id}:resume`,
          flightId: flight.id,
          action: "resume",
          station: "ground",
          label: "Resume taxi",
          reason:
            "Controller hold remains active; release is available through the ground station.",
          priority: "routine",
        });
      }
    }
    const order = { urgent: 0, attention: 1, routine: 2 } as const;
    return proposals.sort(
      (first, second) =>
        order[first.priority] - order[second.priority] ||
        first.flightId - second.flightId,
    );
  }

  conflictPredictions(): ConflictPrediction[] {
    const predictions: ConflictPrediction[] = [];
    const active = this.state.flights.filter(
      (flight) => flight.phase !== "resting",
    );
    const rules = separationRuleset(this.state.separationRuleset);

    // Surface runway crossings have an explicit hold line and clearance
    // lifecycle, so expose a forecast before the aircraft reaches the line.
    // Inspect cleared crossings too: a seeded fault, stale clearance, or a
    // changed runway operation must remain visible even though the ordinary
    // command arbiter would have refused the conflicting clearance. The
    // movement arbiter remains authoritative; this is only the shared safety
    // picture used by the UI, telemetry, and agent-facing snapshots.
    for (const flight of active) {
      if (flight.phase !== "taxi-in" && flight.phase !== "taxi-out") continue;
      const plan = this.surfaceCrossingPlan(flight);
      const centerOffsetM =
        aircraftProfile(flight.aircraft).lengthM / 2 +
        RUNWAY_HOLD_SHORT_NOSE_BUFFER_M;
      const currentDistanceWorld = flight.progress * plan.routeDistanceWorld;
      const forecast = plan.windows
        .filter((candidate) => candidate.exitProgress + 1e-6 >= flight.progress)
        .map((crossing) => {
          const distanceM = Math.max(
            0,
            (crossing.holdProgress * plan.routeDistanceWorld -
              currentDistanceWorld) *
              WORLD_METERS_PER_UNIT -
              centerOffsetM,
          );
          return {
            crossing,
            distanceM,
            blocker: this.runwayBlocker(crossing.runwayId, flight.id),
          };
        })
        .find(
          (candidate) =>
            candidate.distanceM <= RUNWAY_CROSSING_ADVISORY_LOOKAHEAD_M &&
            candidate.blocker,
        );
      if (!forecast?.blocker) continue;
      const { crossing, distanceM, blocker } = forecast;
      const corridorPointId = crossing.holdPointId ?? crossing.crossingPointId;
      const corridorControlPoint = corridorPointId
        ? this.config.surfaceGraph.controlPoints.find(
            (controlPoint) => controlPoint.id === corridorPointId,
          )
        : undefined;
      const corridorNodeId = corridorControlPoint?.nodeId ?? corridorPointId;
      const holdPoint = corridorNodeId
        ? this.config.surfaceGraph.nodes.find(
            (node) => node.id === corridorNodeId,
          )
        : undefined;
      const holdPointPosition =
        corridorControlPoint?.position ?? holdPoint?.position;
      const speedMps = Math.max(
        3,
        flight.kinematics.groundSpeedKts * KNOT_TO_MPS,
      );
      predictions.push({
        severity: "warning",
        type: "crossing",
        flights: [flight.id, blocker.id],
        runway: crossing.runwayId,
        etaSeconds: Math.max(
          1,
          Math.min(120, Math.round(Math.max(0, distanceM) / speedMps)),
        ),
        detail: `${flight.callsign} ${this.crossingIsCleared(flight, crossing) ? "has a crossing clearance conflicting with" : "is approaching"} ${this.activeRunwayDesignation(crossing.runwayId)} crossing${corridorPointId ? ` ${corridorPointId}` : ""}; ${blocker.callsign} is protecting the runway`,
        geometry: holdPointPosition
          ? {
              kind: "corridor" as const,
              points: [
                [flight.motion.x, flight.motion.y] as [number, number],
                [holdPointPosition[0], holdPointPosition[1]] as [
                  number,
                  number,
                ],
              ],
              width: Math.max(1, aircraftProfile(flight.aircraft).wingspanM),
            }
          : undefined,
      });
    }
    for (let firstIndex = 0; firstIndex < active.length; firstIndex += 1) {
      const first = active[firstIndex];
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < active.length;
        secondIndex += 1
      ) {
        const second = active[secondIndex];
        const firstAirborne =
          first.phase === "approach" || first.phase === "landing";
        const secondAirborne =
          second.phase === "approach" || second.phase === "landing";
        if (firstAirborne && secondAirborne) {
          const assessment = assessAirborneSeparation(
            rules,
            this.state.weather,
            first,
            second,
          );
          if (!assessment.compliant) {
            predictions.push({
              severity: "warning",
              type: "separation",
              flights: [first.id, second.id],
              runway: first.runway,
              etaSeconds: 0,
              detail: `${rules.label}: ${assessment.reason}`,
            });
          }
        }
        if (!this.runwaysConflict(first.runway, second.runway)) continue;
        if (
          first.phase === "taxi-out" &&
          first.progress > 0.74 &&
          secondAirborne
        ) {
          predictions.push({
            severity: "caution",
            type: "runway",
            flights: [first.id, second.id],
            runway: first.runway,
            etaSeconds: Math.max(1, Math.round((1 - first.progress) * 20)),
            detail: `${first.callsign} is approaching the hold-short point while ${second.callsign} is active`,
          });
        }
      }
    }
    return predictions.slice(0, 8);
  }

  private airborneSeparationViolations(): Array<{
    flights: [number, number];
    assessment: ReturnType<typeof assessAirborneSeparation>;
  }> {
    const airborne = this.state.flights.filter(
      (flight) =>
        !flight.motion.onGround &&
        (flight.phase === "approach" ||
          flight.phase === "landing" ||
          flight.phase === "takeoff"),
    );
    const rules = separationRuleset(this.state.separationRuleset);
    const violations: Array<{
      flights: [number, number];
      assessment: ReturnType<typeof assessAirborneSeparation>;
    }> = [];
    for (let firstIndex = 0; firstIndex < airborne.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < airborne.length;
        secondIndex += 1
      ) {
        const assessment = assessAirborneSeparation(
          rules,
          this.state.weather,
          airborne[firstIndex],
          airborne[secondIndex],
        );
        if (!assessment.compliant)
          violations.push({
            flights: [airborne[firstIndex].id, airborne[secondIndex].id],
            assessment,
          });
      }
    }
    return violations;
  }

  setWeather(
    condition: WeatherCondition,
    windDirection: number,
    windSpeed: number,
  ): boolean {
    const challenge = challengeDefinition(this.state.challenge.challengeId);
    if (this.challengeConditionsLocked() && challenge) {
      return this.rejectDecision(
        `${challenge.title} locks weather until the debrief`,
      );
    }
    this.state.weather.weatherEnabled = true;
    this.state.weather.windEnabled = true;
    this.state.weather.windDirection = this.normalizeAngle(windDirection);
    this.state.weather.windSpeed = Math.max(0, Math.min(40, windSpeed));
    applyWeatherCondition(
      this.state.weather,
      condition,
      this.state.elapsed,
      this.config.seed,
    );
    this.state.weather.gustSpeed =
      this.state.weather.windSpeed +
      weatherConditionProfile(condition).gustDeltaKts;
    this.refreshRunwayConditionReports(true);
    this.baseWindDirection = this.state.weather.windDirection;
    this.baseWindSpeed = this.state.weather.windSpeed;
    // Keep an explicitly selected winter bank stable long enough for a busy
    // hub departure to push, queue, receive treatment, and use its holdover
    // window. Surface congestion can make that lifecycle substantially longer
    // than the nominal route duration.
    this.weatherOverrideUntil =
      this.state.elapsed +
      (condition === "snow" ? 2400 : condition === "thunderstorm" ? 240 : 180);
    if (condition === "thunderstorm" && this.state.weather.hazardsEnabled) {
      this.state.weather.nextHazardAtSeconds =
        this.state.elapsed + 10 + (this.config.seed % 11);
    }
    this.refreshDeicingPlansForWeather();
    this.updateEnvironment(0);
    this.updateActiveRunwayConfiguration();
    this.decisionReason = `${condition} weather active`;
    return true;
  }

  setWeatherEnabled(enabled: boolean): boolean {
    const challenge = challengeDefinition(this.state.challenge.challengeId);
    if (this.challengeConditionsLocked() && challenge) {
      return this.rejectDecision(
        `${challenge.title} locks weather until the debrief`,
      );
    }
    this.state.weather.weatherEnabled = enabled;
    if (!enabled) {
      applyWeatherCondition(
        this.state.weather,
        "clear",
        this.state.elapsed,
        this.config.seed,
      );
      this.expireActiveWeatherHazard("weather disabled");
      this.refreshRunwayConditionReports(true);
    } else {
      this.weatherOverrideUntil = 0;
    }
    this.updateWeather();
    this.updateEnvironment(0);
    this.refreshDeicingPlansForWeather();
    this.decisionReason = `weather ${enabled ? "enabled" : "disabled"}`;
    return true;
  }

  setWeatherHazardsEnabled(enabled: boolean): boolean {
    const challenge = challengeDefinition(this.state.challenge.challengeId);
    if (this.challengeConditionsLocked() && challenge) {
      return this.rejectDecision(
        `${challenge.title} locks high-stakes weather until the debrief`,
      );
    }
    this.state.weather.hazardsEnabled = enabled;
    if (!enabled)
      this.expireActiveWeatherHazard("high-stakes weather disabled");
    else if (this.state.weather.condition === "thunderstorm") {
      this.state.weather.nextHazardAtSeconds = Math.min(
        this.state.weather.nextHazardAtSeconds,
        this.state.elapsed + 10 + (this.config.seed % 11),
      );
    }
    this.decisionReason = `wind-shear and microburst events ${enabled ? "enabled" : "disabled"}`;
    return true;
  }

  setWindEnabled(enabled: boolean): boolean {
    const challenge = challengeDefinition(this.state.challenge.challengeId);
    if (this.challengeConditionsLocked() && challenge) {
      return this.rejectDecision(
        `${challenge.title} locks wind until the debrief`,
      );
    }
    this.state.weather.windEnabled = enabled;
    this.updateWeather();
    this.decisionReason = `wind ${enabled ? "enabled" : "disabled"}`;
    return true;
  }

  clearFlight(id: number, runway: number): boolean {
    if (this.state.gameOver) return this.rejectDecision("shift is closed");
    if (this.state.paused)
      return this.rejectDecision(
        "resume the simulation before issuing a clearance",
      );
    if (!this.canIssue("tower"))
      return this.rejectDecision(
        `${this.state.station} station has no landing-clearance authority`,
      );
    const flight = this.state.flights.find(
      (item) => item.id === id && item.phase === "approach",
    );
    if (!flight)
      return this.rejectDecision(
        "flight is not awaiting an approach clearance",
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (flight.diversion)
      return this.rejectDecision(
        "flight is established on a diversion exit and cannot be cleared to land",
        flight,
      );
    if (flight.goAround)
      return this.rejectDecision(
        "flight is flying the missed-approach circuit before re-entering the arrival sequence",
        flight,
      );
    if (flight.runway !== runway)
      return this.rejectDecision(
        `flight is assigned to runway ${this.activeRunwayDesignation(flight.runway)}`,
        flight,
      );
    if (runwayClosedByDisruption(this.state.surfaceDisruptions, runway))
      return this.rejectDecision(
        `runway ${this.activeRunwayDesignation(runway)} is closed`,
        flight,
      );
    const queuedCrossing = this.priorityRunwayCrossing(runway);
    if (queuedCrossing) {
      return this.rejectDecision(
        `landing clearance held: crossing slot reserved for ${queuedCrossing.callsign}`,
        flight,
      );
    }
    const blocker =
      flight.progress > 0.68 ? this.runwayBlocker(runway, flight.id) : null;
    if (blocker)
      return this.rejectDecision(
        `runway protected for ${blocker.callsign} ${blocker.phase}`,
        flight,
      );
    // Surface traffic can enter a close parallel connector after the arrival
    // was first admitted to the map but before Tower issues the landing
    // clearance. Revalidate the complete flare/rollout/exit sweep here; once
    // cleared, the committed-sweep arbiter keeps later taxi movement out.
    const pathBlocker = this.arrivalPathBlocker(flight);
    if (pathBlocker) {
      return this.rejectDecision(
        `landing sweep occupied by ${pathBlocker.callsign} ${pathBlocker.phase}`,
        flight,
      );
    }
    flight.cleared = true;
    flight.navigation.approachCleared = true;
    flight.navigation.readbackStatus = "accepted";
    flight.clearanceLeft = 99;
    this.decisionReason = `landing clearance accepted for runway ${this.activeRunwayDesignation(runway)}`;
    this.events.push({ type: "clear", flight });
    return true;
  }

  clearPushback(id: number): boolean {
    if (this.state.gameOver) return this.rejectDecision("shift is closed");
    if (this.state.paused)
      return this.rejectDecision(
        "resume the simulation before issuing a clearance",
      );
    if (!this.canIssue("ramp"))
      return this.rejectDecision(
        `${this.state.station} station has no ramp pushback authority`,
      );
    const flight = this.state.flights.find(
      (item) => item.id === id && item.phase === "resting",
    );
    if (!flight)
      return this.rejectDecision("flight is not at a stand awaiting pushback");
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (flight.turnaround.status !== "ready") {
      const blocking = turnaroundBlockingServices(flight.turnaround);
      return this.rejectDecision(
        `pushback held: ${blocking.length ? `${blocking.join(", ")} incomplete` : "turnaround is not ready"}`,
        flight,
      );
    }
    const rampBlockers = serviceVehiclesBlockingPushback(
      this.state.serviceVehicles,
      flight.id,
    );
    if (rampBlockers.length) {
      return this.rejectDecision(
        `pushback held: ${rampBlockers.map((vehicle) => vehicle.label.toLowerCase()).join(", ")} not clear of the stand`,
        flight,
      );
    }
    if (flight.pushbackCleared)
      return this.rejectDecision("pushback is already cleared", flight);
    if (this.state.runwayConfigurationTransition)
      return this.rejectDecision(
        "pushback held while the runway plan changes",
        flight,
      );
    if (this.selectDepartureRunway(flight) === null)
      return this.rejectDecision(
        "no compatible departure runway is available",
        flight,
      );
    const surfaceTraffic = this.pushbackSurfaceBlocker(flight);
    if (surfaceTraffic === "no-route") {
      return this.rejectDecision(
        "pushback held: no pavement route is clear of parked aircraft and active restrictions",
        flight,
      );
    }
    if (surfaceTraffic) {
      return this.rejectDecision(
        `pushback held: ${surfaceTraffic.callsign} occupies the protected pushback corridor`,
        flight,
      );
    }
    const flowAdmission = this.surfaceFlowPushbackAdmissionReason(flight);
    if (
      flowAdmission &&
      this.stationRunsAutomatically("ramp") &&
      !this.pushbackReleasesBlockedSurfaceFlight(flight)
    ) {
      return this.rejectDecision(`pushback held: ${flowAdmission}`, flight);
    }
    if (
      winterDeicingRequired(this.state.weather) &&
      flight.deicing.status === "unavailable"
    ) {
      return this.rejectDecision(
        "pushback held: no compatible winter route to a deicing pad",
        flight,
      );
    }
    this.grantPushbackClearance(flight, false);
    return true;
  }

  /**
   * A Supervisor may resolve an arrival-side gate conflict before the aircraft
   * enters its terminal taxi route. The same planner used by automatic recovery
   * makes the decision, so a manual reassignment cannot bypass stand, pavement,
   * or parked-aircraft checks.
   */
  requestArrivalGateReassignment(id: number): boolean {
    if (this.state.gameOver) return this.rejectDecision("shift is closed");
    if (this.state.station !== "supervisor")
      return this.rejectDecision(
        `${this.state.station} station has no gate reassignment authority`,
      );
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision("flight is not active");
    if (
      (flight.phase !== "approach" && flight.phase !== "landing") ||
      flight.progress >= 0.8
    )
      return this.rejectDecision(
        "gate reassignment is available only before terminal routing is committed",
        flight,
      );
    if (!flight.gateAssignment)
      return this.rejectDecision(
        "arrival has no gate assignment to revise",
        flight,
      );
    const previous = flight.gateAssignment;
    const reassigned = this.reassignArrivalGate(
      flight,
      "Supervisor requested a revised gate plan",
      new Set([previous.standId]),
    );
    if (!reassigned)
      return this.rejectDecision(
        "no compatible unoccupied gate has a clear pavement route",
        flight,
      );
    this.decisionReason = `${flight.callsign} reassigned from ${previous.gateRef ?? previous.zoneName ?? previous.standId} to ${flight.gateAssignment?.gateRef ?? flight.gateAssignment?.zoneName ?? flight.gateAssignment?.standId}`;
    return true;
  }

  clearRunwayEntry(id: number): boolean {
    if (!this.canIssue("tower"))
      return this.rejectDecision(
        `${this.state.station} station has no runway-entry authority`,
      );
    const flight = this.state.flights.find(
      (item) => item.id === id && item.phase === "taxi-out",
    );
    if (!flight)
      return this.rejectDecision("flight is not taxiing for departure");
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (flight.progress < 0.985)
      return this.rejectDecision(
        "flight has not reached the hold-short point",
        flight,
      );
    if (!deicingReleaseValid(flight, this.state.weather, this.state.elapsed)) {
      const detail =
        flight.deicing.status === "expired"
          ? "holdover protection expired; return to the deicing pad"
          : `winter departure requires completed deicing (${flight.deicing.status})`;
      return this.rejectDecision(detail, flight);
    }
    const missingCrossing = this.nextUnclearedCrossing(flight);
    if (missingCrossing)
      return this.rejectDecision(
        `crossing clearance for ${this.activeRunwayDesignation(missingCrossing.runwayId)} is still required`,
        flight,
      );
    const queuedCrossing = this.priorityRunwayCrossing(
      flight.runway,
      flight.id,
    );
    if (queuedCrossing)
      return this.rejectDecision(
        `runway entry held for ${queuedCrossing.callsign} crossing sequence`,
        flight,
      );
    const blocker = this.runwayBlocker(flight.runway, flight.id);
    if (blocker)
      return this.rejectDecision(
        `runway protected for ${blocker.callsign} ${blocker.phase}`,
        flight,
      );
    const pathBlocker = this.departurePathBlocker(flight);
    if (pathBlocker) {
      return this.rejectDecision(
        `runway entry held: ${pathBlocker.callsign} occupies the protected departure corridor`,
        flight,
      );
    }
    flight.runwayEntryCleared = true;
    this.decisionReason = `runway entry accepted for ${this.activeRunwayDesignation(flight.runway)}`;
    this.events.push({
      type: "runway-entry",
      flight,
      runway: flight.runway,
      taxiway: flight.taxiway,
    });
    return true;
  }

  clearRunwayCrossing(id: number, runway: number): boolean {
    if (!this.canIssue("ground"))
      return this.rejectDecision(
        `${this.state.station} station has no runway-crossing authority`,
      );
    const flight = this.state.flights.find(
      (item) =>
        item.id === id &&
        (item.phase === "taxi-in" || item.phase === "taxi-out"),
    );
    if (!flight)
      return this.rejectDecision("flight is not taxiing on the surface");
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (!flight.requiredCrossings?.includes(runway))
      return this.rejectDecision(
        `runway ${this.activeRunwayDesignation(runway)} is not on this taxi route`,
        flight,
      );
    const crossing = this.nextUnclearedCrossing(flight);
    if (!crossing || crossing.runwayId !== runway)
      return this.rejectDecision(
        `runway ${this.activeRunwayDesignation(runway)} is not the next crossing on this taxi route`,
        flight,
      );
    if (
      crossing.distanceToHold * WORLD_METERS_PER_UNIT >
      CROSSING_CLEARANCE_RANGE_M
    ) {
      return this.rejectDecision(
        `aircraft has not reached the ${this.activeRunwayDesignation(runway)} crossing hold-short area`,
        flight,
      );
    }
    const crossingGroup = this.crossingClearanceGroup(flight, crossing);
    for (const protectedCrossing of crossingGroup) {
      const priorityOwner = this.priorityRunwayCrossing(
        protectedCrossing.runwayId,
      );
      if (priorityOwner && priorityOwner.id !== flight.id) {
        return this.rejectDecision(
          `crossing sequence held behind ${priorityOwner.callsign}`,
          flight,
        );
      }
      const blocker = this.runwayBlocker(protectedCrossing.runwayId, flight.id);
      if (!blocker) continue;
      return this.rejectDecision(
        `crossing group held: ${blocker.callsign} is ${blocker.phase} on protected runway ${this.activeRunwayDesignation(protectedCrossing.runwayId)}`,
        flight,
      );
    }
    for (const protectedCrossing of crossingGroup)
      this.grantCrossingClearance(flight, protectedCrossing);
    const runwayDesignations = [
      ...new Set(
        crossingGroup.map((item) =>
          this.activeRunwayDesignation(item.runwayId),
        ),
      ),
    ];
    this.decisionReason = `crossing clearance accepted for ${runwayDesignations.join(" + ")}`;
    return true;
  }

  clearTakeoff(id: number): boolean {
    if (!this.canIssue("tower"))
      return this.rejectDecision(
        `${this.state.station} station has no takeoff authority`,
      );
    const flight = this.state.flights.find(
      (item) =>
        item.id === id && item.phase === "takeoff" && item.runwayEntryCleared,
    );
    if (!flight)
      return this.rejectDecision(
        "flight is not lined up with runway-entry clearance",
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (flight.takeoffCleared)
      return this.rejectDecision("takeoff is already cleared", flight);
    const hazard = this.state.weather.activeHazard;
    if (
      hazard?.status === "active" &&
      hazard.operation === "departure" &&
      hazard.runwayId === flight.runway
    ) {
      return this.rejectDecision(
        `${hazard.kind.replace("-", " ")} alert is active ${hazard.locationNm} NM from ${this.activeRunwayDesignation(flight.runway)} departure`,
        flight,
      );
    }
    const performance = this.assessTakeoffPerformance(flight);
    if (!performance.safe) {
      return this.rejectDecision(
        `${this.activeRunwayDesignation(flight.runway)} has ${Math.round(Math.abs(performance.marginM))} m less than the modeled ${flight.aircraft} takeoff requirement at RwyCC ${performance.runwayConditionCode}`,
        flight,
      );
    }
    flight.takeoffPerformance = performance;
    const queuedCrossing = this.priorityRunwayCrossing(
      flight.runway,
      flight.id,
    );
    if (queuedCrossing)
      return this.rejectDecision(
        `takeoff held for ${queuedCrossing.callsign} crossing sequence`,
        flight,
      );
    const release = this.runwayReleaseBlocker(flight, "departure");
    if (release) return this.rejectDecision(`takeoff held: ${release}`, flight);
    const blocker = this.runwayBlocker(flight.runway, flight.id);
    if (blocker)
      return this.rejectDecision(
        `takeoff held: ${blocker.callsign} is ${blocker.phase} in the protected zone`,
        flight,
      );
    // The departure sweep is a runway-entry protection check. Once Tower has
    // already issued runway-entry clearance, surface traffic is committed to
    // yield to the lined-up aircraft through the shared surface arbiter. Re-
    // applying the pre-entry sweep here can create a circular wait: the
    // taxiing aircraft holds for this departure while the departure waits for
    // that same taxiing aircraft to clear the sweep.
    if (!flight.runwayEntryCleared) {
      const pathBlocker = this.departurePathBlocker(flight);
      if (pathBlocker)
        return this.rejectDecision(
          `takeoff held: ${pathBlocker.callsign} has not cleared the departure envelope`,
          flight,
        );
    }
    flight.takeoffCleared = true;
    this.recordRunwayOperation(flight, "departure");
    this.decisionReason = `takeoff clearance accepted for ${this.activeRunwayDesignation(flight.runway)}`;
    this.events.push({
      type: "takeoff-clearance",
      flight,
      runway: flight.runway,
    });
    return true;
  }

  /** Cancel a takeoff clearance only while the aircraft remains lined up. */
  cancelTakeoffClearance(id: number): boolean {
    if (!this.canIssue("tower"))
      return this.rejectDecision(
        `${this.state.station} station has no takeoff authority`,
      );
    const flight = this.state.flights.find(
      (item) =>
        item.id === id && item.phase === "takeoff" && item.runwayEntryCleared,
    );
    if (!flight)
      return this.rejectDecision(
        "flight is not lined up with runway-entry clearance",
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (!flight.takeoffCleared)
      return this.rejectDecision("takeoff clearance is not active", flight);
    if (!flight.motion.onGround || flight.motion.stage !== "lineup")
      return this.rejectDecision(
        `${flight.callsign} has begun its takeoff roll; cancellation is no longer safe`,
        flight,
      );
    flight.takeoffCleared = false;
    this.runwayOperationHistory = this.runwayOperationHistory.filter(
      (operation) =>
        !(operation.flightId === flight.id && operation.kind === "departure"),
    );
    this.decisionReason = `takeoff clearance cancelled for ${flight.callsign} · hold position on ${this.activeRunwayDesignation(flight.runway)}`;
    this.events.push({
      type: "takeoff-clearance-cancelled",
      flight,
      runway: flight.runway,
      detail: this.decisionReason,
    });
    return true;
  }

  assignHeading(id: number, headingDegrees: number): boolean {
    if (!this.canIssue("approach"))
      return this.rejectDecision(
        `${this.state.station} station has no airborne-vector authority`,
      );
    const flight = this.state.flights.find(
      (item) =>
        item.id === id &&
        !item.diversion &&
        (item.phase === "approach" ||
          (item.phase === "takeoff" && !item.motion.onGround)),
    );
    if (!flight)
      return this.rejectDecision(
        "flight is not airborne and available for a heading assignment",
      );
    if (
      flight.weatherEscape?.status === "active" ||
      (flight.goAround?.weatherEscape &&
        flight.goAround.weatherEscape.completedAtSeconds === undefined)
    ) {
      return this.rejectDecision(
        `${flight.callsign} is flying a wind-shear escape; do not issue a contrary heading until the escape is complete`,
        flight,
      );
    }
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (
      flight.phase === "approach" &&
      (flight.progress >= 0.76 || flight.motion.stage === "final")
    ) {
      return this.rejectDecision(
        "aircraft is established too close to final; issue a go-around before a new vector",
        flight,
      );
    }
    const heading = ((headingDegrees % 360) + 360) % 360;
    const presentHeading = this.mathAngleToAviationDegrees(
      flight.motion.heading,
    );
    const turn = Math.abs(
      (Math.atan2(
        Math.sin(((heading - presentHeading) * Math.PI) / 180),
        Math.cos(((heading - presentHeading) * Math.PI) / 180),
      ) *
        180) /
        Math.PI,
    );
    if (turn > 120)
      return this.rejectDecision(
        `heading change is ${Math.round(turn)}°; use an intermediate vector`,
        flight,
      );
    const departure = flight.phase === "takeoff";
    const vectorEndProgress = departure
      ? Math.min(0.995, flight.progress + 0.2)
      : Math.min(
          0.8,
          flight.progress + (this.config.scope === "center" ? 0.3 : 0.24),
        );
    if (vectorEndProgress <= flight.progress + 0.01)
      return this.rejectDecision(
        "aircraft is leaving terminal scope; heading amendment is too late",
        flight,
      );
    flight.navigation.assignedHeadingDegrees = heading;
    if (departure) flight.navigation.departureHeadingDegrees = heading;
    flight.navigation.vector = {
      issuedAtSeconds: this.state.elapsed,
      startProgress: flight.progress,
      endProgress: vectorEndProgress,
      headingDegrees: heading,
      rejoinFixId:
        flight.navigation.routeFixIds[
          Math.min(
            flight.navigation.routeFixIds.length - 1,
            flight.navigation.activeFixIndex + 2,
          )
        ],
      start: this.motionStart(flight),
    };
    flight.navigation.readbackStatus = "accepted";
    amendFlightPlan(
      flight.flightPlan,
      "clearance",
      this.state.elapsed,
      `fly heading ${String(Math.round(heading)).padStart(3, "0")}`,
    );
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} heading ${String(Math.round(heading)).padStart(3, "0")} accepted`;
    this.events.push({ type: "vector", flight, detail: this.decisionReason });
    return true;
  }

  assignAltitude(id: number, altitudeFt: number): boolean {
    if (!this.canIssue("approach"))
      return this.rejectDecision(
        `${this.state.station} station has no altitude authority`,
      );
    const flight = this.state.flights.find(
      (item) =>
        item.id === id &&
        !item.diversion &&
        (item.phase === "approach" ||
          (item.phase === "takeoff" && !item.motion.onGround)),
    );
    if (!flight)
      return this.rejectDecision(
        "flight is not airborne and available for an altitude assignment",
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    const rounded = Math.round(altitudeFt / 100) * 100;
    const maximum = this.config.scope === "center" ? 10_000 : 5_000;
    if (rounded < 500 || rounded > maximum)
      return this.rejectDecision(
        `altitude must be between 500 and ${maximum.toLocaleString()} ft in this terminal scope`,
        flight,
      );
    if (
      flight.phase === "approach" &&
      flight.progress > 0.7 &&
      rounded > 2_000
    ) {
      return this.rejectDecision(
        "high altitude assignment would destabilize the established final approach",
        flight,
      );
    }
    flight.navigation.assignedAltitudeFt = rounded;
    if (flight.phase === "approach" && !flight.navigation.vector) {
      flight.navigation.vector = {
        issuedAtSeconds: this.state.elapsed,
        startProgress: flight.progress,
        endProgress: Math.min(0.8, flight.progress + 0.24),
        headingDegrees: this.mathAngleToAviationDegrees(flight.motion.heading),
        rejoinFixId:
          flight.navigation.routeFixIds[
            Math.min(
              flight.navigation.routeFixIds.length - 1,
              flight.navigation.activeFixIndex + 1,
            )
          ],
        start: this.motionStart(flight),
      };
    }
    flight.navigation.readbackStatus = "accepted";
    amendFlightPlan(
      flight.flightPlan,
      "clearance",
      this.state.elapsed,
      `maintain ${rounded.toLocaleString()} ft`,
    );
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} ${rounded.toLocaleString()} ft accepted`;
    this.events.push({ type: "vector", flight, detail: this.decisionReason });
    return true;
  }

  assignAirspeed(id: number, speedKts: number): boolean {
    if (!this.canIssue("approach"))
      return this.rejectDecision(
        `${this.state.station} station has no airborne-speed authority`,
      );
    const flight = this.state.flights.find(
      (item) =>
        item.id === id &&
        !item.diversion &&
        (item.phase === "approach" ||
          (item.phase === "takeoff" && !item.motion.onGround)),
    );
    if (!flight)
      return this.rejectDecision(
        "flight is not airborne and available for a speed assignment",
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    const profile = aircraftProfile(flight.aircraft);
    const minimum =
      flight.phase === "approach"
        ? Math.max(80, profile.approachKts - 10)
        : Math.round(profile.approachKts * 1.18);
    const maximum = 250;
    const rounded = Math.round(speedKts / 5) * 5;
    if (rounded < minimum || rounded > maximum)
      return this.rejectDecision(
        `speed must be ${minimum}–${maximum} kt for ${flight.aircraft} in this phase`,
        flight,
      );
    flight.navigation.assignedSpeedKts = rounded;
    flight.navigation.readbackStatus = "accepted";
    amendFlightPlan(
      flight.flightPlan,
      "clearance",
      this.state.elapsed,
      `maintain ${rounded} kt`,
    );
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} ${rounded} kt accepted`;
    this.events.push({ type: "vector", flight, detail: this.decisionReason });
    return true;
  }

  directFlightTo(id: number, fixId: string): boolean {
    if (!this.canIssue("approach"))
      return this.rejectDecision(
        `${this.state.station} station has no direct-to authority`,
      );
    const flight = this.state.flights.find(
      (item) =>
        item.id === id &&
        item.phase === "approach" &&
        !item.goAround &&
        !item.diversion &&
        !item.navigation.hold,
    );
    if (!flight)
      return this.rejectDecision(
        "flight is not available for a direct-to clearance",
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (flight.progress >= 0.72)
      return this.rejectDecision(
        "aircraft is too close to final for a route shortcut",
        flight,
      );
    const fix = this.config.airspaceProgram.fixes.find(
      (candidate) => candidate.id === fixId,
    );
    if (!fix)
      return this.rejectDecision(`unknown terminal fix ${fixId}`, flight);
    const plannedIndex = flight.navigation.routeFixIds.indexOf(fixId);
    const remaining =
      plannedIndex >= 0
        ? flight.navigation.routeFixIds.slice(plannedIndex)
        : [
            fixId,
            ...flight.navigation.routeFixIds.slice(
              Math.max(0, flight.navigation.activeFixIndex + 1),
            ),
          ];
    this.supersedeActiveRouteClearance(
      flight,
      `superseded by direct ${fix.name}`,
    );
    flight.navigation.routeFixIds = [...new Set(remaining)];
    flight.navigation.activeFixIndex = 0;
    flight.navigation.vector = {
      issuedAtSeconds: this.state.elapsed,
      startProgress: flight.progress,
      endProgress: Math.min(0.8, flight.progress + 0.28),
      headingDegrees: this.mathAngleToAviationDegrees(
        Math.atan2(
          fix.position[1] - flight.motion.y,
          fix.position[0] - flight.motion.x,
        ),
      ),
      rejoinFixId: fix.id,
      start: this.motionStart(flight),
    };
    flight.navigation.readbackStatus = "accepted";
    amendFlightPlan(
      flight.flightPlan,
      "route-change",
      this.state.elapsed,
      `direct ${fix.name}`,
      {
        route: [
          flight.flightPlan.origin,
          ...flight.navigation.routeFixIds,
          flight.flightPlan.destination,
        ],
      },
    );
    this.state.trafficFlow.totals.routeAmendments += 1;
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} direct ${fix.name} accepted`;
    this.events.push({ type: "vector", flight, detail: this.decisionReason });
    return true;
  }

  amendFlightRoute(id: number, fixIds: readonly string[]): boolean {
    const flight = this.routeAmendmentFlight(id);
    if (!flight) return false;
    const candidate = this.routeClearanceCandidate(flight, fixIds);
    if (!candidate) return false;
    if (!candidate.clearance.safeToIssue) {
      const reason =
        candidate.clearance.warnings.find(
          (warning) => warning.severity === "blocking",
        )?.detail ?? "route preview contains a blocking conflict";
      flight.navigation.routeClearance = {
        ...candidate.clearance,
        status: "rejected",
        respondedAtSeconds: this.state.elapsed,
        reason,
      };
      flight.navigation.readbackStatus = "rejected";
      return this.rejectDecision(reason, flight);
    }
    const clearance: FlightRouteClearanceState = {
      ...candidate.clearance,
      status: "accepted",
      issuedAtSeconds: this.state.elapsed,
      respondedAtSeconds: this.state.elapsed,
      reason:
        "atomic compatibility command accepted through the route safety preview",
    };
    return this.applyTerminalRouteAmendment(flight, candidate, clearance, true);
  }

  previewFlightRoute(id: number, fixIds: readonly string[]): boolean {
    const flight = this.routeAmendmentFlight(id);
    if (!flight) return false;
    const candidate = this.routeClearanceCandidate(flight, fixIds);
    if (!candidate) return false;
    flight.navigation.routeClearance = candidate.clearance;
    flight.navigation.readbackStatus = "not-required";
    const blocking = candidate.clearance.warnings.filter(
      (warning) => warning.severity === "blocking",
    ).length;
    const cautions = candidate.clearance.warnings.length - blocking;
    this.decisionReason = `${flight.callsign} route preview ready · ${blocking ? `${blocking} blocking` : "safe to issue"}${cautions ? ` · ${cautions} caution${cautions === 1 ? "" : "s"}` : ""}`;
    this.events.push({
      type: "route-preview",
      flight,
      detail: this.decisionReason,
    });
    return true;
  }

  issueFlightRoute(id: number, fixIds?: readonly string[]): boolean {
    const flight = this.routeAmendmentFlight(id);
    if (!flight) return false;
    const existing = flight.navigation.routeClearance;
    const requestedFixIds =
      fixIds ??
      (existing?.status === "preview" ? existing.routeFixIds : undefined);
    if (!requestedFixIds)
      return this.rejectDecision(
        "preview a route before issuing the amendment",
        flight,
      );
    const reusesPreview =
      existing?.status === "preview" &&
      existing.routeFixIds.join(">") === requestedFixIds.join(">");
    const candidate = this.routeClearanceCandidate(
      flight,
      requestedFixIds,
      reusesPreview ? existing.revision : undefined,
    );
    if (!candidate) return false;
    const blocking = candidate.clearance.warnings.find(
      (warning) => warning.severity === "blocking",
    );
    if (blocking) {
      flight.navigation.routeClearance = {
        ...candidate.clearance,
        status: "rejected",
        respondedAtSeconds: this.state.elapsed,
        reason: blocking.detail,
      };
      flight.navigation.readbackStatus = "rejected";
      this.decisionReason = `${flight.callsign} route not issued · ${blocking.detail}`;
      this.events.push({
        type: "route-readback-rejected",
        flight,
        detail: this.decisionReason,
      });
      return false;
    }
    // Supervisor may issue on behalf of the owning operational position. The
    // pilot's readback must still belong to that frequency owner; recording
    // "supervisor" here would immediately look like an authority transfer
    // and cancel an otherwise valid clearance.
    const issuingStation =
      this.state.station === "supervisor"
        ? flight.navigation.frequencyOwner
        : this.state.station;
    const readbackDelay = 0.9 + (flight.id % 5) * 0.18;
    flight.navigation.routeClearance = {
      ...candidate.clearance,
      status: "pending-readback",
      issuedAtSeconds: this.state.elapsed,
      readbackDueSeconds: this.state.elapsed + readbackDelay,
      issuedBy: issuingStation,
      reason: "awaiting pilot readback",
    };
    flight.navigation.readbackStatus = "pending";
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} route issued · readback pending`;
    this.events.push({
      type: "route-clearance-issued",
      flight,
      detail: this.decisionReason,
    });
    return true;
  }

  acceptRouteReadback(id: number): boolean {
    if (!this.canIssue("approach"))
      return this.rejectDecision(
        `${this.state.station} station has no route-readback authority`,
      );
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision("flight is not active");
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    const pending = flight.navigation.routeClearance;
    if (pending?.status !== "pending-readback") {
      return this.rejectDecision(
        `${flight.callsign} has no pending route readback`,
        flight,
      );
    }
    // A supervisor may issue a route on behalf of the current frequency, but
    // cannot consume its pilot readback. Keeping the acknowledgement with the
    // actual issuing desk prevents an accepted handoff from silently applying
    // a stale command after control has changed.
    if (pending.issuedBy !== this.state.station) {
      return this.rejectDecision(
        `${flight.callsign} route readback belongs to ${pending.issuedBy}; reissue after coordination`,
        flight,
      );
    }
    return this.resolveRouteReadback(flight);
  }

  cancelFlightRouteClearance(id: number): boolean {
    if (!this.canIssue("approach"))
      return this.rejectDecision(
        `${this.state.station} station has no route-amendment authority`,
      );
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision("flight is not active");
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    const clearance = flight.navigation.routeClearance;
    if (
      !clearance ||
      (clearance.status !== "preview" &&
        clearance.status !== "pending-readback")
    ) {
      return this.rejectDecision(
        `${flight.callsign} has no active route preview or readback`,
        flight,
      );
    }
    this.supersedeActiveRouteClearance(
      flight,
      "controller cancelled the proposed route",
    );
    this.decisionReason = `${flight.callsign} route proposal cancelled`;
    return true;
  }

  private supersedeActiveRouteClearance(
    flight: Flight,
    reason: string,
  ): boolean {
    const clearance = flight.navigation.routeClearance;
    if (
      !clearance ||
      (clearance.status !== "preview" &&
        clearance.status !== "pending-readback")
    )
      return false;
    flight.navigation.routeClearance = {
      ...clearance,
      status: "cancelled",
      respondedAtSeconds: this.state.elapsed,
      reason,
    };
    flight.navigation.readbackStatus = "not-required";
    this.events.push({
      type: "route-clearance-cancelled",
      flight,
      detail: `${flight.callsign} route proposal cancelled · ${reason}`,
    });
    return true;
  }

  private routeAmendmentFlight(id: number): Flight | null {
    if (!this.canIssue("approach")) {
      this.rejectDecision(
        `${this.state.station} station has no route-amendment authority`,
      );
      return null;
    }
    const flight = this.state.flights.find(
      (item) =>
        item.id === id &&
        !item.diversion &&
        !item.goAround &&
        (item.phase === "approach" ||
          (item.phase === "takeoff" && !item.motion.onGround)),
    );
    if (!flight) {
      this.rejectDecision(
        "flight is not airborne and available for a route amendment",
      );
      return null;
    }
    if (!this.ownsFlight(flight)) {
      this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
      return null;
    }
    if (flight.navigation.hold) {
      this.rejectDecision(
        "release the aircraft from its hold before amending the route",
        flight,
      );
      return null;
    }
    if (flight.navigation.routeClearance?.status === "pending-readback") {
      this.rejectDecision(
        "cancel or complete the pending route readback before issuing another amendment",
        flight,
      );
      return null;
    }
    if (flight.phase === "approach" && flight.progress >= 0.7) {
      this.rejectDecision(
        "aircraft is established too close to final for a route amendment",
        flight,
      );
      return null;
    }
    return flight;
  }

  private routeClearanceCandidate(
    flight: Flight,
    fixIds: readonly string[],
    revision = (flight.navigation.routeClearance?.revision ?? 0) + 1,
  ): TerminalRouteClearanceCandidate | null {
    const result = buildTerminalRouteClearancePreview(
      this.config,
      flight,
      this.state.flights,
      fixIds,
      separationRuleset(this.state.separationRuleset),
      this.state.weather,
      this.state.elapsed,
      revision,
      this.state.station,
    );
    if (result.accepted) return result.value;
    this.rejectDecision(result.reason, flight);
    return null;
  }

  private resolveRouteReadback(flight: Flight): boolean {
    const pending = flight.navigation.routeClearance;
    if (!pending || pending.status !== "pending-readback") return false;
    if (flight.navigation.frequencyOwner !== pending.issuedBy) {
      this.supersedeActiveRouteClearance(
        flight,
        `route readback cancelled: control transferred to ${flight.navigation.frequencyOwner}`,
      );
      this.decisionReason = `${flight.callsign} route readback cancelled after authority transfer`;
      return false;
    }
    const result = buildTerminalRouteClearancePreview(
      this.config,
      flight,
      this.state.flights,
      pending.routeFixIds,
      separationRuleset(this.state.separationRuleset),
      this.state.weather,
      this.state.elapsed,
      pending.revision,
      pending.issuedBy,
    );
    if (!result.accepted)
      return this.rejectRouteReadback(flight, pending, result.reason);
    const blocking = result.value.clearance.warnings.find(
      (warning) => warning.severity === "blocking",
    );
    if (blocking)
      return this.rejectRouteReadback(
        flight,
        pending,
        `readback withheld: ${blocking.detail}`,
      );
    const clearance: FlightRouteClearanceState = {
      ...result.value.clearance,
      status: "accepted",
      previousRouteFixIds: [...pending.previousRouteFixIds],
      previewedAtSeconds: pending.previewedAtSeconds,
      issuedAtSeconds: pending.issuedAtSeconds,
      readbackDueSeconds: pending.readbackDueSeconds,
      respondedAtSeconds: this.state.elapsed,
      issuedBy: pending.issuedBy,
      reason: "pilot readback accepted; amended route is authoritative",
    };
    flight.navigation.routeClearance = clearance;
    flight.navigation.readbackStatus = "accepted";
    this.decisionReason = `${flight.callsign} readback correct`;
    this.events.push({
      type: "route-readback-accepted",
      flight,
      detail: this.decisionReason,
    });
    return this.applyTerminalRouteAmendment(
      flight,
      result.value,
      clearance,
      false,
    );
  }

  private rejectRouteReadback(
    flight: Flight,
    pending: FlightRouteClearanceState,
    reason: string,
  ): false {
    flight.navigation.routeClearance = {
      ...pending,
      status: "rejected",
      respondedAtSeconds: this.state.elapsed,
      safeToIssue: false,
      reason,
    };
    flight.navigation.readbackStatus = "rejected";
    this.decisionReason = `${flight.callsign} route readback rejected · ${reason}`;
    this.events.push({
      type: "route-readback-rejected",
      flight,
      detail: this.decisionReason,
    });
    return false;
  }

  private applyTerminalRouteAmendment(
    flight: Flight,
    candidate: TerminalRouteClearanceCandidate,
    clearance: FlightRouteClearanceState,
    countManualCommand: boolean,
  ): true {
    const direction = flight.phase === "approach" ? "arrival" : "departure";
    const routeFixIds = candidate.fixes.map((fix) => fix.id);
    const firstFix = candidate.fixes[0];
    const heading = this.mathAngleToAviationDegrees(
      Math.atan2(
        firstFix.position[1] - flight.motion.y,
        firstFix.position[0] - flight.motion.x,
      ),
    );
    flight.navigation.routeFixIds = routeFixIds;
    flight.navigation.activeFixIndex = 0;
    flight.navigation.assignedHeadingDegrees = heading;
    flight.navigation.vector = {
      issuedAtSeconds: this.state.elapsed,
      startProgress: flight.progress,
      endProgress: Math.min(
        0.995,
        flight.progress + (direction === "arrival" ? 0.3 : 0.2),
      ),
      headingDegrees: heading,
      rejoinFixId: firstFix.id,
      start: this.motionStart(flight),
    };
    if (direction === "arrival") {
      flight.navigation.approachCleared = false;
      flight.cleared = false;
      flight.clearanceLeft = Math.max(
        flight.clearanceLeft,
        flight.duration * 0.34,
      );
    } else {
      flight.navigation.departureHeadingDegrees = heading;
    }
    flight.navigation.routeClearance = clearance;
    flight.navigation.readbackStatus = "accepted";
    amendFlightPlan(
      flight.flightPlan,
      "route-change",
      this.state.elapsed,
      `route amended via ${candidate.fixes.map((fix) => fix.name).join(", ")}`,
      {
        route: [
          flight.flightPlan.origin,
          ...routeFixIds,
          flight.flightPlan.destination,
        ],
      },
    );
    this.state.trafficFlow.totals.routeAmendments += 1;
    if (countManualCommand) this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} route amendment accepted · ${routeFixIds.length} fixes`;
    this.events.push({
      type: "route-amendment",
      flight,
      detail: this.decisionReason,
    });
    return true;
  }

  assignTaxiRoute(id: number, viaNodeIds: readonly string[] = []): boolean {
    const flight = this.state.flights.find(
      (item) =>
        item.id === id &&
        (item.phase === "taxi-in" || item.phase === "taxi-out"),
    );
    if (!flight)
      return this.rejectDecision("flight is not taxiing on the surface");
    const authority: OperationalControllerStation =
      requiredControllerStation(flight) === "ramp" ? "ramp" : "ground";
    if (!this.canIssue(authority))
      return this.rejectDecision(
        `${this.state.station} station has no ${authority} taxi-route authority`,
        flight,
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (flight.emergency === "disabled")
      return this.rejectDecision(
        "disabled aircraft cannot accept a taxi route",
        flight,
      );
    if (
      flight.phase === "taxi-out" &&
      flight.deicing.required &&
      ["enroute", "queued", "positioning", "treating", "expired"].includes(
        flight.deicing.status,
      )
    ) {
      return this.rejectDecision(
        "complete or replan the active deicing movement before issuing a taxi amendment",
        flight,
      );
    }
    const routeNodes = flight.surfaceRoute;
    const routeEdges = flight.surfaceRouteEdges;
    const sample = sampleSurfaceRouteWithEdges(
      this.config.surfaceGraph,
      routeNodes,
      routeEdges,
      flight.progress,
    );
    if (
      !sample ||
      !routeNodes?.length ||
      !routeEdges?.length ||
      sample.edgeIndex < 0
    )
      return this.rejectDecision(
        "flight has no amendable authoritative surface route",
        flight,
      );
    const destinationNodeId = routeNodes.at(-1);
    const routingStartNodeIndex = Math.min(
      routeNodes.length - 1,
      sample.edgeIndex + 1,
    );
    const routingStartNodeId = routeNodes[routingStartNodeIndex];
    if (
      !destinationNodeId ||
      !routingStartNodeId ||
      routingStartNodeId === destinationNodeId
    )
      return this.rejectDecision(
        "flight is already at the cleared taxi destination",
        flight,
      );
    const prefixNodes = routeNodes.slice(0, routingStartNodeIndex + 1);
    const prefixEdges = routeEdges.slice(0, routingStartNodeIndex);
    const profile = aircraftProfile(flight.aircraft);
    const planning = this.surfaceRoutePlanning(flight.id, new Set(prefixEdges));
    const result = buildSurfaceRouteViaNodes(
      this.config.surfaceGraph,
      routingStartNodeId,
      destinationNodeId,
      viaNodeIds,
      {
        wingspanM: profile.wingspanM,
        minimumWingtipClearanceM: profile.minimumWingtipClearanceM,
      },
      planning,
    );
    if (!result.accepted) return this.rejectDecision(result.reason, flight);

    const previousEdgeIds = [...routeEdges];
    const nodeIds = [...prefixNodes, ...result.value.nodeIds.slice(1)];
    const edgeIds = [...prefixEdges, ...result.value.edgeIds];
    const fullSample = sampleSurfaceRouteWithEdges(
      this.config.surfaceGraph,
      nodeIds,
      edgeIds,
      1,
    );
    if (!fullSample || fullSample.totalDistance <= 0)
      return this.rejectDecision(
        "amended taxi route has no usable pavement distance",
        flight,
      );
    const edgeById = new Map(
      this.config.surfaceGraph.edges.map((edge) => [edge.id, edge]),
    );
    const taxiwayIds = [
      ...new Set(
        edgeIds.flatMap((edgeId) => {
          const taxiwayId = edgeById.get(edgeId)?.taxiwayId;
          return taxiwayId ? [taxiwayId] : [];
        }),
      ),
    ];
    const route: SurfaceRoute = {
      nodeIds,
      edgeIds,
      distance: fullSample.totalDistance,
      taxiwayIds,
      routingCost: fullSample.totalDistance + result.value.congestionPenalty,
      congestionPenalty: result.value.congestionPenalty,
      congestedEdgeIds: [...result.value.congestedEdgeIds],
    };
    const oldTotal = sample.totalDistance;
    flight.surfaceRoute = nodeIds;
    flight.surfaceRouteEdges = edgeIds;
    flight.surfaceRoutingCost = route.routingCost;
    flight.surfaceCongestionPenalty = route.congestionPenalty;
    flight.surfaceCongestedEdgeIds = route.congestedEdgeIds;
    flight.progress = Math.max(
      0,
      Math.min(0.999999, sample.distanceAlong / route.distance),
    );
    flight.duration = this.surfaceRouteDuration(flight, route);
    flight.phaseElapsed = flight.duration * flight.progress;
    flight.requiredCrossings = surfaceRouteRunwayCrossings(
      this.config.surfaceGraph,
      edgeIds,
      flight.runway,
    );
    const crossingWindows = surfaceRouteCrossingWindows(
      this.config.surfaceGraph,
      nodeIds,
      flight.progress,
      flight.runway,
      edgeIds,
    );
    const completed = crossingWindows.filter(
      (crossing) => crossing.exitProgress < flight.progress - 1e-6,
    );
    flight.crossingClearanceIds = completed.map((crossing) => crossing.id);
    flight.crossingClearances = [
      ...new Set(completed.map((crossing) => crossing.runwayId)),
    ];
    flight.crossingHoldRunway = undefined;
    flight.crossingHoldPointId = undefined;
    flight.surfaceReroute = {
      revision: (flight.surfaceReroute?.revision ?? 0) + 1,
      status: "rerouted",
      selectedAtSeconds: this.state.elapsed,
      disruptionIds: [],
      previousEdgeIds,
      routeEdgeIds: [...edgeIds],
      addedDistanceM: (route.distance - oldTotal) * WORLD_METERS_PER_UNIT,
      reason: viaNodeIds.length
        ? `controller taxi clearance via ${viaNodeIds.join(", ")}`
        : "controller refreshed the safest available taxi route",
    };
    this.updateSurfaceRouteState(flight);
    syncFlightMotion(this.config, flight);
    amendFlightPlan(
      flight.flightPlan,
      "clearance",
      this.state.elapsed,
      `taxi via ${taxiwayIds.join(", ") || "assigned pavement route"}`,
    );
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} taxi route accepted · ${edgeIds.length} pavement segments`;
    this.events.push({
      type: "taxi-route-clearance",
      flight,
      taxiway: taxiwayIds.join(" / "),
      detail: this.decisionReason,
    });
    return true;
  }

  holdPosition(id: number): boolean {
    const flight = this.state.flights.find(
      (item) =>
        item.id === id &&
        (item.phase === "taxi-in" || item.phase === "taxi-out"),
    );
    if (!flight)
      return this.rejectDecision("flight is not taxiing on the surface");
    const authority: OperationalControllerStation =
      requiredControllerStation(flight) === "ramp" ? "ramp" : "ground";
    if (!this.canIssue(authority))
      return this.rejectDecision(
        `${this.state.station} station has no ${authority} hold-position authority`,
        flight,
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (flight.controlHold)
      return this.rejectDecision(
        `${flight.callsign} is already holding position`,
        flight,
      );
    flight.controlHold = true;
    this.metrics.holdsIssued += 1;
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} hold position accepted · normal braking applied`;
    this.events.push({
      type: "hold-position",
      flight,
      taxiway: flight.taxiway,
      detail: this.decisionReason,
    });
    return true;
  }

  resumeTaxi(id: number): boolean {
    const flight = this.state.flights.find(
      (item) =>
        item.id === id &&
        (item.phase === "taxi-in" || item.phase === "taxi-out"),
    );
    if (!flight)
      return this.rejectDecision("flight is not taxiing on the surface");
    const authority: OperationalControllerStation =
      requiredControllerStation(flight) === "ramp" ? "ramp" : "ground";
    if (!this.canIssue(authority))
      return this.rejectDecision(
        `${this.state.station} station has no ${authority} taxi authority`,
        flight,
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (!flight.controlHold)
      return this.rejectDecision(
        `${flight.callsign} has no controller hold to release`,
        flight,
      );
    flight.controlHold = false;
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} resume taxi accepted${flight.automaticHold || flight.safetyHold ? " · another safety hold remains active" : ""}`;
    this.events.push({
      type: "taxi-resume",
      flight,
      taxiway: flight.taxiway,
      detail: this.decisionReason,
    });
    return true;
  }

  divertFlight(
    id: number,
    airportCode: string,
    exitFixId?: string,
    reason = "controller diversion",
  ): boolean {
    if (!this.canIssue("approach"))
      return this.rejectDecision(
        `${this.state.station} station has no diversion authority`,
      );
    const flight = this.state.flights.find(
      (item) => item.id === id && item.phase === "approach" && !item.diversion,
    );
    if (!flight)
      return this.rejectDecision(
        "flight is not an inbound aircraft available for diversion",
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    const alternate = airportCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(alternate))
      return this.rejectDecision(
        "alternate airport must be a 3- or 4-character code",
        flight,
      );
    if (alternate === this.config.code || alternate === `K${this.config.code}`)
      return this.rejectDecision(
        "alternate airport must differ from the current airport",
        flight,
      );
    const exit = selectDiversionExitFix(
      this.config.airspaceProgram,
      [flight.motion.x, flight.motion.y],
      flight.motion.heading,
      exitFixId,
    );
    if (!exit.accepted) return this.rejectDecision(exit.reason, flight);
    const detail = reason.trim() || "controller diversion";
    this.supersedeActiveRouteClearance(
      flight,
      `superseded by diversion to ${alternate}`,
    );
    flight.diversion = {
      airportCode: alternate,
      exitFixId: exit.value.id,
      issuedAtSeconds: this.state.elapsed,
      reason: detail,
      start: this.motionStart(flight),
    };
    flight.goAround = undefined;
    flight.navigation.hold = undefined;
    flight.navigation.vector = undefined;
    flight.navigation.approachCleared = false;
    flight.navigation.routeFixIds = [exit.value.id];
    flight.navigation.activeFixIndex = 0;
    flight.cleared = false;
    flight.progress = 0;
    flight.phaseElapsed = 0;
    flight.duration =
      this.phaseDuration(flight.aircraft, "approach", flight.runway) * 1.35;
    flight.clearanceLeft = Number.POSITIVE_INFINITY;
    flight.destination = alternate;
    amendFlightPlan(
      flight.flightPlan,
      "diversion",
      this.state.elapsed,
      `${detail}; divert ${alternate} via ${exit.value.name}`,
      {
        destination: alternate,
        route: [flight.flightPlan.origin, exit.value.id, alternate],
        estimatedArrivalSeconds: this.state.elapsed + flight.duration,
      },
    );
    flight.flightPlan.status = "diverted";
    syncFlightMotion(this.config, flight);
    this.metrics.diversions += 1;
    this.metrics.manualCommands += 1;
    this.state.trafficFlow.totals.diversions += 1;
    this.decisionReason = `${flight.callsign} diverting to ${alternate} via ${exit.value.name}`;
    this.events.push({
      type: "diversion",
      flight,
      detail: `${this.decisionReason} · ${detail}`,
    });
    return true;
  }

  clearApproach(id: number): boolean {
    if (!this.canIssue("approach"))
      return this.rejectDecision(
        `${this.state.station} station has no approach-clearance authority`,
      );
    const flight = this.state.flights.find(
      (item) =>
        item.id === id &&
        item.phase === "approach" &&
        !item.goAround &&
        !item.diversion &&
        !item.navigation.hold,
    );
    if (!flight)
      return this.rejectDecision(
        "flight is not established for an approach clearance",
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    flight.navigation.approachCleared = true;
    flight.navigation.readbackStatus = "accepted";
    amendFlightPlan(
      flight.flightPlan,
      "clearance",
      this.state.elapsed,
      `cleared ${flight.procedure}`,
    );
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} cleared ${flight.procedure}`;
    this.events.push({
      type: "approach-clearance",
      flight,
      runway: flight.runway,
      detail: this.decisionReason,
    });
    return true;
  }

  holdFlight(id: number, patternId?: string, efcMinutes?: number): boolean {
    if (!this.canIssue("approach"))
      return this.rejectDecision(
        `${this.state.station} station has no holding authority`,
      );
    const flight = this.state.flights.find(
      (item) =>
        item.id === id &&
        item.phase === "approach" &&
        !item.goAround &&
        !item.diversion &&
        !item.navigation.hold,
    );
    if (!flight)
      return this.rejectDecision(
        "flight is not available for a holding clearance",
      );
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    if (flight.progress >= 0.68)
      return this.rejectDecision(
        "aircraft is inside the final segment; issue a go-around before holding",
        flight,
      );
    const routeFixes = new Set(flight.navigation.routeFixIds);
    const pattern =
      this.config.airspaceProgram.holds.find((hold) => hold.id === patternId) ??
      this.config.airspaceProgram.holds.find((hold) =>
        routeFixes.has(hold.fixId),
      ) ??
      this.config.airspaceProgram.holds[
        flight.id % this.config.airspaceProgram.holds.length
      ];
    if (!pattern)
      return this.rejectDecision(
        "no terminal holding pattern is available",
        flight,
      );
    const efc = Math.max(
      1,
      Math.min(30, efcMinutes ?? pattern.defaultEfcMinutes),
    );
    const altitude = Math.max(
      pattern.minimumAltitudeFt,
      Math.min(
        pattern.maximumAltitudeFt,
        flight.navigation.assignedAltitudeFt ??
          Math.round(flight.kinematics.altitudeFt / 500) * 500,
      ),
    );
    this.supersedeActiveRouteClearance(
      flight,
      `superseded by hold ${pattern.name}`,
    );
    flight.navigation.hold = {
      patternId: pattern.id,
      fixId: pattern.fixId,
      issuedAtSeconds: this.state.elapsed,
      enteredAtSeconds: this.state.elapsed,
      expectFurtherClearanceAtSeconds: this.state.elapsed + efc * 60,
      cycle: 1,
      inboundCourseDegrees: pattern.inboundCourseDegrees,
      turns: pattern.turns,
      legSeconds: pattern.legSeconds,
      altitudeFt: altitude,
      start: this.motionStart(flight),
    };
    flight.navigation.assignedAltitudeFt = altitude;
    flight.navigation.vector = undefined;
    flight.navigation.approachCleared = false;
    flight.cleared = false;
    flight.progress = 0;
    flight.phaseElapsed = 0;
    flight.duration = pattern.legSeconds * 2 + 48;
    flight.clearanceLeft = flight.duration * 20;
    syncFlightMotion(this.config, flight);
    amendFlightPlan(
      flight.flightPlan,
      "clearance",
      this.state.elapsed,
      `hold ${pattern.name}; EFC +${efc} min`,
    );
    this.metrics.holdsIssued += 1;
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} holding at ${pattern.name}; EFC in ${efc} min`;
    this.events.push({
      type: "airborne-hold",
      flight,
      detail: this.decisionReason,
    });
    return true;
  }

  releaseAirborneHold(id: number): boolean {
    if (!this.canIssue("approach"))
      return this.rejectDecision(
        `${this.state.station} station has no holding authority`,
      );
    const flight = this.state.flights.find(
      (item) =>
        item.id === id && item.phase === "approach" && item.navigation.hold,
    );
    if (!flight) return this.rejectDecision("flight is not in a terminal hold");
    if (!this.ownsFlight(flight))
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}; handoff required`,
        flight,
      );
    this.releaseHoldToArrival(flight, "controller released hold");
    this.metrics.manualCommands += 1;
    return true;
  }

  handoffFlight(id: number, station: ControllerStation): boolean {
    return this.offerHandoff(id, station);
  }

  offerHandoff(id: number, station: ControllerStation): boolean {
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision("flight is not active");
    const owner = flight.navigation.frequencyOwner;
    if (
      !isOperationalControllerStation(owner) ||
      !isOperationalControllerStation(station)
    ) {
      return this.rejectDecision(
        "handoffs require two operational controller positions",
        flight,
      );
    }
    if (this.state.station !== "supervisor" && this.state.station !== owner) {
      return this.rejectDecision(
        `${this.state.station} does not own ${flight.callsign}`,
        flight,
      );
    }
    if (station === owner)
      return this.rejectDecision(
        `${flight.callsign} is already on ${station}`,
        flight,
      );
    const expected = nextControllerStation(flight, owner);
    if (station !== expected) {
      return this.rejectDecision(
        `${flight.callsign} must coordinate with ${expected ?? "no further controller"} next`,
        flight,
      );
    }
    if (this.activeHandoff(flight))
      return this.rejectDecision(
        `${flight.callsign} already has active coordination`,
        flight,
      );
    this.beginHandoff(
      flight,
      station,
      this.state.station,
      `coordination requested by ${this.state.station}`,
    );
    this.metrics.manualCommands += 1;
    return true;
  }

  acceptHandoff(id: number): boolean {
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision("flight is not active");
    const handoff = flight.navigation.handoff;
    if (
      !handoff ||
      (handoff.status !== "offered" && handoff.status !== "overdue")
    ) {
      return this.rejectDecision(
        `${flight.callsign} has no incoming handoff to accept`,
        flight,
      );
    }
    if (
      this.state.station !== "supervisor" &&
      this.state.station !== handoff.to
    ) {
      return this.rejectDecision(
        `${this.state.station} cannot accept coordination addressed to ${handoff.to}`,
        flight,
      );
    }
    this.acceptHandoffInternal(
      flight,
      this.state.station,
      "controller accepted coordination",
    );
    this.metrics.manualCommands += 1;
    return true;
  }

  rejectHandoff(id: number): boolean {
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision("flight is not active");
    const handoff = flight.navigation.handoff;
    if (
      !handoff ||
      (handoff.status !== "offered" && handoff.status !== "overdue")
    ) {
      return this.rejectDecision(
        `${flight.callsign} has no incoming handoff to reject`,
        flight,
      );
    }
    if (
      this.state.station !== "supervisor" &&
      this.state.station !== handoff.to
    ) {
      return this.rejectDecision(
        `${this.state.station} cannot reject coordination addressed to ${handoff.to}`,
        flight,
      );
    }
    handoff.status = "rejected";
    handoff.respondedAtSeconds = this.state.elapsed;
    handoff.responseBy = this.state.station;
    handoff.reason = `coordination rejected by ${this.state.station}`;
    flight.navigation.handoffStatus = "rejected";
    this.metrics.handoffRejections += 1;
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} handoff to ${handoff.to} rejected`;
    this.events.push({
      type: "handoff-reject",
      flight,
      detail: this.decisionReason,
    });
    return true;
  }

  cancelHandoff(id: number): boolean {
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision("flight is not active");
    const handoff = this.activeHandoff(flight);
    if (!handoff)
      return this.rejectDecision(
        `${flight.callsign} has no active handoff to cancel`,
        flight,
      );
    if (
      this.state.station !== "supervisor" &&
      this.state.station !== handoff.from
    ) {
      return this.rejectDecision(
        `${this.state.station} cannot cancel ${handoff.from} coordination`,
        flight,
      );
    }
    handoff.status = "cancelled";
    handoff.respondedAtSeconds = this.state.elapsed;
    handoff.responseBy = this.state.station;
    handoff.reason = `coordination cancelled by ${this.state.station}`;
    flight.navigation.handoffStatus = "owned";
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} handoff to ${handoff.to} cancelled`;
    this.events.push({
      type: "handoff-cancel",
      flight,
      detail: this.decisionReason,
    });
    return true;
  }

  contactFlight(id: number, station: ControllerStation): boolean {
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision("flight is not active");
    const handoff = flight.navigation.handoff;
    if (!handoff || handoff.status !== "accepted") {
      return this.rejectDecision(
        `${flight.callsign} requires an accepted handoff before contact`,
        flight,
      );
    }
    if (!isOperationalControllerStation(station) || station !== handoff.to) {
      return this.rejectDecision(
        `${flight.callsign} is coordinated for ${handoff.to}, not ${station}`,
        flight,
      );
    }
    if (
      this.state.station !== "supervisor" &&
      this.state.station !== handoff.from
    ) {
      return this.rejectDecision(
        `${this.state.station} cannot issue contact for ${handoff.from}`,
        flight,
      );
    }
    this.completeHandoff(flight, "controller contact instruction");
    this.metrics.manualCommands += 1;
    return true;
  }

  private activeHandoff(flight: Flight): FlightHandoffState | undefined {
    const handoff = flight.navigation.handoff;
    return handoff &&
      (handoff.status === "offered" ||
        handoff.status === "accepted" ||
        handoff.status === "overdue")
      ? handoff
      : undefined;
  }

  private beginHandoff(
    flight: Flight,
    target: OperationalControllerStation,
    offeredBy: ControllerStation,
    reason: string,
    overdue = false,
  ): void {
    const owner = flight.navigation.frequencyOwner;
    if (!isOperationalControllerStation(owner)) return;
    const previousRevision = flight.navigation.handoff?.revision ?? 0;
    flight.navigation.handoff = {
      schemaVersion: 1,
      revision: previousRevision + 1,
      from: owner,
      to: target,
      status: overdue ? "overdue" : "offered",
      offeredAtSeconds: this.state.elapsed,
      responseDueSeconds: overdue
        ? this.state.elapsed
        : this.state.elapsed + HANDOFF_RESPONSE_SECONDS,
      offeredBy,
      reason,
    };
    flight.navigation.handoffStatus = overdue ? "overdue" : "offered";
    this.metrics.handoffOffers += 1;
    if (overdue) this.metrics.missedHandoffs += 1;
    this.decisionReason = overdue
      ? `${flight.callsign} missed ${owner} → ${target} handoff · coordination overdue`
      : `${flight.callsign} handoff offered ${owner} → ${target}`;
    this.events.push({
      type: overdue ? "handoff-overdue" : "handoff-offer",
      flight,
      runway: flight.runway,
      taxiway: flight.taxiway,
      detail: `${this.decisionReason} · ${reason}`,
    });
  }

  private markHandoffOverdue(flight: Flight, reason: string): void {
    const handoff = flight.navigation.handoff;
    if (!handoff || handoff.status !== "offered") return;
    handoff.status = "overdue";
    handoff.reason = reason;
    flight.navigation.handoffStatus = "overdue";
    this.metrics.missedHandoffs += 1;
    this.decisionReason = `${flight.callsign} ${handoff.from} → ${handoff.to} handoff overdue`;
    this.events.push({
      type: "handoff-overdue",
      flight,
      runway: flight.runway,
      taxiway: flight.taxiway,
      detail: `${this.decisionReason} · ${reason}`,
    });
  }

  private acceptHandoffInternal(
    flight: Flight,
    responseBy: ControllerStation,
    reason: string,
  ): void {
    const handoff = flight.navigation.handoff;
    if (
      !handoff ||
      (handoff.status !== "offered" && handoff.status !== "overdue")
    )
      return;
    handoff.status = "accepted";
    handoff.respondedAtSeconds = this.state.elapsed;
    handoff.responseBy = responseBy;
    handoff.reason = reason;
    flight.navigation.handoffStatus = "accepted";
    this.metrics.handoffAcceptances += 1;
    this.decisionReason = `${flight.callsign} handoff accepted by ${handoff.to} · contact pending`;
    this.events.push({
      type: "handoff-accept",
      flight,
      runway: flight.runway,
      taxiway: flight.taxiway,
      detail: `${this.decisionReason} · ${reason}`,
    });
  }

  private completeHandoff(flight: Flight, reason: string): void {
    const handoff = flight.navigation.handoff;
    if (!handoff || handoff.status !== "accepted") return;
    flight.navigation.frequencyOwner = handoff.to;
    flight.navigation.handoffStatus = "owned";
    handoff.status = "completed";
    handoff.completedAtSeconds = this.state.elapsed;
    handoff.reason = reason;
    amendFlightPlan(
      flight.flightPlan,
      "clearance",
      this.state.elapsed,
      `contact ${handoff.to}`,
    );
    this.decisionReason = `${flight.callsign} contact ${handoff.to} · frequency ownership transferred`;
    this.events.push({
      type: "handoff-complete",
      flight,
      runway: flight.runway,
      taxiway: flight.taxiway,
      detail: `${this.decisionReason} · ${reason}`,
    });
    this.events.push({
      type: "contact",
      flight,
      runway: flight.runway,
      taxiway: flight.taxiway,
      detail: this.decisionReason,
    });
  }

  private surfaceHandoffHoldReason(flight: Flight): string | null {
    if (flight.phase !== "taxi-in" && flight.phase !== "taxi-out") return null;
    const owner = flight.navigation.frequencyOwner;
    const required = requiredControllerStation(flight);
    if (controllerStationIsAhead(flight, owner, required)) return null;
    const rampGroundBoundary =
      (owner === "ramp" && required === "ground") ||
      (owner === "ground" && required === "ramp");
    if (!rampGroundBoundary) return null;
    const handoff = flight.navigation.handoff;
    if (handoff?.status === "accepted" && handoff.to === required) {
      return `${required} accepted ${flight.callsign}; ${owner} must issue contact`;
    }
    if (handoff?.to === required)
      return `${owner} → ${required} handoff ${handoff.status}`;
    return `${owner} must coordinate ${flight.callsign} with ${required}`;
  }

  previewGroupedInstruction(
    ids: readonly number[],
    instruction: FlightInstruction,
  ): GroupInstructionPreview {
    return buildGroupInstructionPreview(
      this.state.flights,
      ids,
      instruction,
      this.state.station,
    );
  }

  issueGroupedInstruction(
    ids: readonly number[],
    instruction: FlightInstruction,
  ): GroupInstructionIssueResult {
    const preview = this.previewGroupedInstruction(ids, instruction);
    if (!preview.safeToIssue) {
      this.decisionReason = preview.reason;
      return { ...preview, issued: false };
    }

    const selectedIds = new Set(preview.flightIds);
    const flights = this.state.flights.filter((flight) =>
      selectedIds.has(flight.id),
    );
    for (const flight of flights) {
      if (instruction === "hold") flight.controlHold = true;
      if (instruction === "resume") flight.controlHold = false;
      if (instruction === "slow") flight.controlPace = 0.55;
      if (instruction === "normal") flight.controlPace = 1;
    }
    if (instruction === "hold") this.metrics.holdsIssued += flights.length;
    this.metrics.manualCommands += flights.length;
    this.decisionReason = `${instruction} accepted atomically for ${flights.length} flight${flights.length === 1 ? "" : "s"} · ${preview.authority}`;
    for (const flight of flights) {
      this.events.push({
        type: "group-instruction",
        flight,
        taxiway: preview.domain === "surface" ? flight.taxiway : undefined,
        detail: `${this.decisionReason} · ${preview.callsigns.join(", ")}`,
      });
    }
    return { ...preview, issued: true, reason: this.decisionReason };
  }

  controlFlights(ids: number[], instruction: FlightInstruction): number[] {
    if (ids.length > 1) {
      const result = this.issueGroupedInstruction(ids, instruction);
      return result.issued ? result.flightIds : [];
    }
    this.decisionReason = "no requested flight accepted that instruction";
    const requested = new Set(
      ids.filter((id) => Number.isInteger(id) && id > 0),
    );
    const controlled: number[] = [];
    for (const flight of this.state.flights) {
      if (!requested.has(flight.id)) continue;
      if (!this.ownsFlight(flight)) continue;
      const surface =
        flight.phase === "taxi-in" ||
        flight.phase === "taxi-out" ||
        flight.phase === "resting";
      const surfaceStation: OperationalControllerStation =
        requiredControllerStation(flight) === "ramp" ? "ramp" : "ground";
      if (
        (instruction === "slow" ||
          instruction === "normal" ||
          instruction === "expedite") &&
        !(surface ? this.canIssue(surfaceStation) : this.canIssue("approach"))
      )
        continue;
      if (instruction === "hold") {
        if (flight.phase !== "taxi-in" && flight.phase !== "taxi-out") continue;
        if (!this.canIssue(surfaceStation)) continue;
        flight.controlHold = true;
        this.metrics.holdsIssued += 1;
      }
      if (instruction === "resume") {
        if (
          (flight.phase === "taxi-in" || flight.phase === "taxi-out") &&
          !this.canIssue(surfaceStation)
        )
          continue;
        flight.controlHold = false;
      }
      if (instruction === "slow") flight.controlPace = 0.55;
      if (instruction === "normal") flight.controlPace = 1;
      if (instruction === "expedite") flight.controlPace = 1.4;
      if (instruction === "zigzag") {
        if (flight.phase !== "approach" || flight.goAround || flight.diversion)
          continue;
        if (!this.canIssue("approach")) continue;
        flight.controlPattern = "zigzag";
        flight.controlPatternStart = flight.progress;
      }
      this.metrics.manualCommands += 1;
      controlled.push(flight.id);
    }
    if (controlled.length)
      this.decisionReason = `${instruction} accepted for ${controlled.length} flight${controlled.length === 1 ? "" : "s"}`;
    return controlled;
  }

  private goAround(
    flight: Flight,
    detail: string,
    weatherHazard?: TerminalWeatherHazard,
  ): void {
    if (flight.goAround || flight.diversion || flight.motion.onGround) return;
    this.metrics.goArounds += 1;
    this.supersedeActiveRouteClearance(
      flight,
      "superseded by go-around clearance",
    );
    const start = flight.motion;
    flight.goAround = {
      startedAt: this.state.elapsed,
      detail,
      cycle: 1,
      weatherEscape: weatherHazard
        ? {
            hazardId: weatherHazard.id,
            kind: weatherHazard.kind,
            windChangeKts: weatherHazard.windChangeKts,
            straightAheadProgress: 0.3,
          }
        : undefined,
      start: {
        x: start.x,
        y: start.y,
        z: start.z,
        heading: start.heading,
        pitch: start.pitch,
        bank: start.bank,
        onGround: start.onGround,
        groundBlend: start.groundBlend,
        protectedRunway: start.protectedRunway,
      },
    };
    flight.phase = "approach";
    flight.progress = 0;
    flight.phaseElapsed = 0;
    flight.duration =
      this.phaseDuration(flight.aircraft, "approach", flight.runway) * 2.4;
    flight.cleared = false;
    flight.navigation.approachCleared = false;
    flight.navigation.hold = undefined;
    flight.navigation.vector = undefined;
    flight.clearanceLeft = flight.duration;
    flight.controlPattern = undefined;
    flight.controlPatternStart = undefined;
    flight.safetyHold = false;
    flight.safetyHoldReason = undefined;
    syncFlightMotion(this.config, flight);
    flight.kinematics.altitudeFt = this.motionAltitudeFt(flight);
    this.metrics.estimatedDelaySeconds += 90;
    this.events.push({
      type: "go-around",
      flight,
      runway: flight.runway,
      detail,
    });
  }

  private releaseHoldToArrival(flight: Flight, detail: string): void {
    const hold = flight.navigation.hold;
    if (!hold) return;
    flight.navigation.hold = undefined;
    flight.navigation.assignedAltitudeFt = undefined;
    flight.navigation.vector = {
      issuedAtSeconds: this.state.elapsed,
      startProgress: 0,
      endProgress: 0.3,
      headingDegrees: this.mathAngleToAviationDegrees(flight.motion.heading),
      rejoinFixId:
        flight.navigation.routeFixIds[
          Math.min(2, flight.navigation.routeFixIds.length - 1)
        ],
      start: this.motionStart(flight),
    };
    flight.progress = 0;
    flight.phaseElapsed = 0;
    flight.duration = this.phaseDuration(
      flight.aircraft,
      "approach",
      flight.runway,
    );
    flight.clearanceLeft = flight.duration * 0.96;
    flight.cleared = false;
    flight.navigation.approachCleared = false;
    syncFlightMotion(this.config, flight);
    amendFlightPlan(flight.flightPlan, "clearance", this.state.elapsed, detail);
    this.decisionReason = `${flight.callsign} released from hold and rejoining the arrival`;
    this.events.push({
      type: "hold-release",
      flight,
      detail: this.decisionReason,
    });
  }

  reset(scenario: TrafficScenario = "normal"): void {
    const density = this.state.trafficFlow.density;
    const controllerPolicyPresetId = this.state.scriptedControllers.presetId;
    const lightingMode = this.state.environment.lightingMode;
    const seasonMode = this.state.environment.seasonMode;
    this.state.elapsed = 0;
    this.state.flights = [];
    this.state.serviceVehicles = [];
    this.state.surfaceDisruptions = [];
    this.state.arrivals = 0;
    this.state.departures = 0;
    this.state.gameOver = false;
    this.state.paused = false;
    this.state.training = createInactiveTrainingState();
    this.state.challenge = createInactiveChallengeState();
    this.state.sandbox = createInactiveSandboxState();
    this.trainingCheckpoint = null;
    this.nextId = 1;
    this.nextDisruptionId = 1;
    this.lastSurfaceReplanSecond = -1;
    this.spawnIn = Math.min(3, this.arrivalSpacing() * 0.55);
    this.state.trafficFlow = createTrafficFlowState(density, 0, this.spawnIn);
    this.events = [];
    this.runwayReservations.clear();
    this.runwayOperationHistory = [];
    this.taxiOutReleaseIn = 0;
    this.closedRunway = null;
    this.state.closedRunway = null;
    this.state.scenario = scenario;
    this.state.station = "supervisor";
    this.state.stationAutomation = createStationAutomation();
    this.state.scriptedControllers = createScriptedControllerRuntime(
      controllerPolicyPresetId,
    );
    this.state.environment = createEnvironmentState(this.config.seed);
    this.state.environment.lightingMode = lightingMode;
    this.state.environment.seasonMode = seasonMode;
    this.runwayConfigurationOverrideId = null;
    this.state.runwayConfigurationMode = "automatic";
    this.state.runwayConfigurationTransition = null;
    applyRunwayConfiguration(
      this.config,
      this.state,
      this.config.runwayConfigurations.find(
        (configuration) =>
          configuration.id === this.config.defaultRunwayConfigurationId,
      ) ?? this.config.runwayConfigurations[0],
    );
    this.stationarySeconds.clear();
    this.surfaceYieldCooldownUntil.clear();
    this.failedSurfaceYieldRetryAt.clear();
    this.phaseTransitionRetryAt.clear();
    this.parkedAircraftEdgeMaskCache.clear();
    this.parkedBlockerRecovery.clear();
    Object.assign(this.metrics, createShiftMetrics());
    this.updateWeather();
    this.updateEnvironment(0);
    this.seedInitialTraffic();
    refreshScriptedControllerModes(
      this.state,
      this.state.scriptedControllers,
      "session reset",
    );
  }

  private updateRouteReadbacks(): void {
    for (const flight of this.state.flights) {
      const clearance = flight.navigation.routeClearance;
      if (clearance?.status !== "pending-readback") continue;
      if (flight.navigation.frequencyOwner !== clearance.issuedBy) {
        this.supersedeActiveRouteClearance(
          flight,
          `route readback cancelled: control transferred to ${flight.navigation.frequencyOwner}`,
        );
        continue;
      }
      if (
        this.state.elapsed + 1e-6 >=
        (clearance.readbackDueSeconds ?? Infinity)
      )
        this.resolveRouteReadback(flight);
    }
  }

  update(realDelta: number): void {
    if (this.state.gameOver || this.state.paused) return;
    beginFlightMotionSamplingFrame();
    try {
      const realStep = Math.min(realDelta, 0.1);
      const delta = realStep * this.speed;
      this.state.elapsed += delta;
      this.runwayOperationHistory = this.runwayOperationHistory.filter(
        (operation) => this.state.elapsed - operation.atSeconds <= 300,
      );
      this.state.breeze = Math.sin(this.state.elapsed * 0.07) * 0.5 + 0.5;
      this.updateWeather();
      this.updateEnvironment(delta);
      this.updateSurfaceDisruptions(delta);
      this.taxiOutReleaseIn = Math.max(0, this.taxiOutReleaseIn - delta);
      this.updateSandboxInjections();
      this.updateTrafficFlow();
      this.updateControllerHandoffDeadlines();
      this.runScriptedControllers();
      this.updateRouteReadbacks();
      this.updateSurfaceYields();
      this.resolveTaxiwayFlowBlockers();
      this.resolveSurfaceReservationBlockers();
      this.resolvePushbackCorridorBlockers();
      this.resolveServiceVehicleSurfaceBlockers();
      this.resolveParkedAircraftSurfaceBlockers();
      this.resolveReciprocalSurfaceDeadlocks();
      this.resolvePhaseTransitionSurfaceBlockers();
      this.resolvePushbackTransitionBlockers();
      this.resolveSurfaceWaitCycles();
      this.metrics.maxConcurrent = Math.max(
        this.metrics.maxConcurrent,
        this.state.flights.length,
      );
      this.updateDeicingOperations(delta);
      // Surface coordination, service-equipment checks, and aircraft movement
      // arbitration all inspect the same pre-movement aircraft poses. Share one
      // envelope cache across that complete pass; final post-transition
      // diagnostics deliberately start a fresh epoch below.
      beginAircraftCollisionSamplingFrame();
      this.coordinateAutomaticSurfaceTraffic(delta);
      this.updateServiceVehicles(delta);

      for (const flight of this.state.flights) {
        if (flight.phase === "resting") this.updateTurnaround(flight);
      }

      const proposedProgressById = new Map<number, number>(
        this.state.flights.map((flight) => [flight.id, flight.progress]),
      );
      const requestedProgressById = new Map<number, number>();
      const requestedSpeedById = new Map<number, number>();
      const resolvedFlightIds = new Set<number>();
      const surfaceMergeYieldById = new Map<number, number>();
      const wasSafetyHeld = new Set(
        this.state.flights
          .filter((flight) => flight.safetyHold)
          .map((flight) => flight.id),
      );
      for (const flight of this.state.flights) {
        flight.safetyHold = false;
        flight.safetyHoldReason = undefined;
        const onSurface =
          flight.phase === "taxi-in" || flight.phase === "taxi-out";
        // A surface flight without a graph route must remain at its
        // authoritative pose. Make that safety state explicit so operators
        // can distinguish a deliberate hold from a stalled animation. The
        // reason is cleared automatically as soon as routing is restored.
        const routeMissing =
          onSurface &&
          (!flight.surfaceRoute?.length || !flight.surfaceRouteEdges?.length);
        if (routeMissing) {
          flight.automaticHold = true;
          flight.automaticHoldReason = "surface movement held: no graph route";
        } else if (
          flight.automaticHoldReason === "surface movement held: no graph route"
        ) {
          flight.automaticHold = false;
          flight.automaticHoldReason = undefined;
        }
        const movingSurfaceRecovery =
          onSurface && flight.surfaceYield?.status === "moving";
        const reversingSurfaceYield =
          movingSurfaceRecovery && flight.surfaceYield?.direction === "reverse";
        const forwardSurfaceRecovery =
          movingSurfaceRecovery && flight.surfaceYield?.direction === "forward";
        const holdingSurfaceYield =
          onSurface && flight.surfaceYield?.status === "holding";
        const motion = flight.motion;
        const crossing =
          onSurface && !reversingSurfaceYield
            ? this.nextUnclearedCrossing(flight)
            : null;
        const crossingDistanceM = Math.max(
          0,
          (crossing?.distanceToHold ?? Infinity) * WORLD_METERS_PER_UNIT,
        );
        const crossingHold = Boolean(
          crossing &&
          crossing.distanceToHold * WORLD_METERS_PER_UNIT <=
            RUNWAY_HOLD_POSITION_TOLERANCE_M,
        );
        const deicingLimit =
          onSurface && !reversingSurfaceYield
            ? deicingMovementLimit(flight)
            : null;
        const deicingDistanceM =
          deicingLimit === null
            ? Infinity
            : Math.max(0, deicingLimit - flight.progress) *
              Math.max(0, motion.totalDistanceM);
        const deicingHold =
          deicingLimit !== null && flight.progress >= deicingLimit - 0.0002;
        // Meter an uncleared departure before a shared runway-access choke
        // point while a sustained crossing sequence owns that runway. The
        // aircraft stays on its assigned taxi route; Tower still owns the
        // later runway-entry decision.
        const priorityCrossing =
          onSurface && flight.phase === "taxi-out" && !flight.runwayEntryCleared
            ? this.priorityRunwayCrossing(flight.runway, flight.id)
            : null;
        const candidateDepartureMeterLimit = priorityCrossing
          ? this.progressBeforeTravelDistance(
              flight,
              RUNWAY_ENTRY_METER_DISTANCE_M,
            )
          : null;
        // Do not turn a very short gate-to-runway route into a gate hold. A
        // meter point is useful only when it leaves real taxiway pavement
        // between the aircraft and the shared runway-access segment.
        const departureMeterLimit =
          candidateDepartureMeterLimit !== null &&
          candidateDepartureMeterLimit > 0.05
            ? candidateDepartureMeterLimit
            : null;
        const departureMeterDistanceM =
          departureMeterLimit === null
            ? Infinity
            : Math.max(0, departureMeterLimit - flight.progress) *
              Math.max(0, motion.totalDistanceM);
        const departureMeterHold =
          departureMeterLimit !== null &&
          flight.progress >= departureMeterLimit - 0.0002;
        if (departureMeterHold) {
          flight.automaticHold = true;
          flight.automaticHoldReason = `departure metering behind ${priorityCrossing?.callsign} runway-crossing sequence`;
        } else if (
          flight.automaticHoldReason?.startsWith("departure metering behind ")
        ) {
          flight.automaticHold = false;
          flight.automaticHoldReason = undefined;
        }
        flight.crossingHoldRunway = crossingHold
          ? crossing?.runwayId
          : undefined;
        flight.crossingHoldPointId = crossingHold
          ? crossing?.holdPointId
          : undefined;
        const awaitingTakeoffClearance =
          flight.phase === "takeoff" &&
          !flight.takeoffCleared &&
          motion.stage !== "lineup";
        const disabledOnSurface = onSurface && flight.emergency === "disabled";
        const disruptionHold =
          onSurface && flight.surfaceReroute?.status === "holding";
        const hardHold =
          routeMissing ||
          crossingHold ||
          deicingHold ||
          departureMeterHold ||
          awaitingTakeoffClearance ||
          disabledOnSurface ||
          disruptionHold ||
          holdingSurfaceYield;
        const commandedStop =
          onSurface && Boolean(flight.automaticHold || flight.controlHold);
        let targetSpeed =
          hardHold || commandedStop
            ? 0
            : reversingSurfaceYield
              ? SURFACE_YIELD_SPEED_KTS
              : forwardSurfaceRecovery
                ? Math.min(8, this.targetGroundSpeedKts(flight))
                : this.targetGroundSpeedKts(flight);
        const stopDistanceM = Math.min(
          crossingDistanceM,
          deicingDistanceM,
          departureMeterDistanceM,
        );
        if (Number.isFinite(stopDistanceM)) {
          const braking =
            aircraftProfile(flight.aircraft).taxiBrakingMps2 *
            taxiBrakingFactor(this.state.weather);
          const maximumStoppingSpeedKts =
            Math.sqrt(Math.max(0, 2 * braking * stopDistanceM)) / KNOT_TO_MPS;
          targetSpeed = Math.min(targetSpeed, maximumStoppingSpeedKts);
        }
        const nextSpeed = hardHold
          ? 0
          : this.acceleratedSpeedKts(flight, targetSpeed, delta);
        const travelMeters =
          (flight.kinematics.groundSpeedKts + nextSpeed) *
          0.5 *
          KNOT_TO_MPS *
          delta;
        const requestedProgress =
          flight.phase === "resting"
            ? flight.turnaround.progress
            : hardHold
              ? flight.progress
              : reversingSurfaceYield && flight.surfaceYield
                ? Math.max(
                    flight.surfaceYield.targetProgress,
                    this.progressBeforeTravelDistance(flight, travelMeters),
                  )
                : forwardSurfaceRecovery && flight.surfaceYield
                  ? Math.min(
                      flight.surfaceYield.targetProgress,
                      this.progressAfterTravelDistance(flight, travelMeters),
                    )
                  : this.progressAfterTravelDistance(flight, travelMeters);
        const clearanceLimitedProgress = reversingSurfaceYield
          ? requestedProgress
          : Math.min(
              crossing
                ? Math.min(requestedProgress, crossing.holdProgress)
                : requestedProgress,
              deicingLimit ?? Infinity,
              departureMeterLimit ?? Infinity,
            );
        const reachedStop =
          movingSurfaceRecovery && flight.surfaceYield
            ? flight.surfaceYield.direction === "reverse"
              ? clearanceLimitedProgress <=
                flight.surfaceYield.targetProgress + 1e-6
              : clearanceLimitedProgress >=
                flight.surfaceYield.targetProgress - 1e-6
            : clearanceLimitedProgress >=
              Math.min(
                crossing?.holdProgress ?? Infinity,
                deicingLimit ?? Infinity,
                departureMeterLimit ?? Infinity,
              ) -
                1e-6;
        requestedSpeedById.set(flight.id, reachedStop ? 0 : nextSpeed);
        requestedProgressById.set(flight.id, clearanceLimitedProgress);
      }

      // Resolve proposed movement in a deterministic order. The collision layer
      // applies arrival/departure priority and then a stable flight-ID tie break
      // before a proxy can enter the protected envelope. This is the simulation's
      // final safety net, independent of the renderer and control mode.
      const movementPriority = (flight: Flight): number => {
        if (flight.phase === "landing" || flight.phase === "approach") return 0;
        // Once a departure has entered its takeoff phase it cannot safely stop
        // on the roll. Surface traffic yields to the committed runway movement.
        if (flight.phase === "takeoff") return 1;
        if (flight.surfaceYield?.status === "moving") return 2;
        if (flight.phase === "taxi-in") return 3;
        if (flight.phase === "taxi-out") return 4;
        return 5;
      };
      for (const flight of [...this.state.flights].sort(
        (first, second) =>
          movementPriority(first) - movementPriority(second) ||
          first.id - second.id,
      )) {
        const proposedProgress =
          requestedProgressById.get(flight.id) ?? flight.progress;
        proposedProgressById.set(flight.id, proposedProgress);
        const conflict =
          Math.abs(proposedProgress - flight.progress) > 1e-9
            ? this.proposedMovementConflict(
                flight,
                proposedProgress,
                proposedProgressById,
                resolvedFlightIds,
                surfaceMergeYieldById,
              )
            : null;
        if (conflict) {
          flight.safetyHold = true;
          const counterpart =
            "first" in conflict
              ? conflict.first === flight.id
                ? conflict.second
                : conflict.first
              : undefined;
          flight.safetyHoldReason =
            counterpart === undefined
              ? `next movement blocked: ${conflict.detail}`
              : `projected path conflict with flight ${counterpart}`;
          proposedProgressById.set(flight.id, flight.progress);
          requestedSpeedById.set(flight.id, 0);
          this.metrics.preventedConflicts += 1;
          this.metrics.safetyHolds += 1;
          if (!wasSafetyHeld.has(flight.id))
            this.events.push({
              type: "safety-hold",
              flight,
              runway: flight.runway,
              taxiway: flight.taxiway,
              detail: flight.safetyHoldReason,
            });
        }
        resolvedFlightIds.add(flight.id);
      }
      endAircraftCollisionSamplingFrame();

      for (const flight of [...this.state.flights]) {
        const previousProgress = flight.progress;
        const previousMotion = { ...flight.motion };
        const onSurface =
          flight.phase === "taxi-in" || flight.phase === "taxi-out";
        const nextProgress =
          proposedProgressById.get(flight.id) ?? flight.progress;
        const moved = Math.abs(nextProgress - previousProgress) > 1e-9;
        const movedForward = nextProgress > previousProgress + 1e-9;
        if (
          flight.phase === "approach" ||
          flight.phase === "landing" ||
          flight.phase === "takeoff"
        )
          this.metrics.airborneSeconds += delta;
        if (onSurface) this.metrics.taxiSeconds += delta;
        if (
          flight.safetyHold ||
          flight.controlHold ||
          flight.automaticHold ||
          Boolean(flight.navigation.hold)
        ) {
          this.metrics.estimatedDelaySeconds += delta;
        }
        if (
          flight.phase === "approach" &&
          !flight.cleared &&
          !flight.goAround &&
          !flight.diversion &&
          !flight.navigation.hold
        ) {
          flight.clearanceLeft -= delta;
          flight.phaseElapsed += delta;
          if (
            flight.clearanceLeft <= 0 ||
            flight.phaseElapsed >= flight.duration * 0.96
          ) {
            this.goAround(flight, "landing clearance expired");
            continue;
          }
        } else {
          const waitingForTakeoff =
            flight.phase === "takeoff" &&
            !flight.takeoffCleared &&
            flight.motion.stage !== "lineup";
          if (!waitingForTakeoff && flight.phase !== "resting" && movedForward)
            flight.phaseElapsed += delta;
        }
        flight.progress = nextProgress;
        if (
          flight.surfaceYield?.status === "moving" &&
          (flight.surfaceYield.direction === "reverse"
            ? flight.progress <= flight.surfaceYield.targetProgress + 1e-6
            : flight.progress >= flight.surfaceYield.targetProgress - 1e-6)
        ) {
          flight.surfaceYield.status = "holding";
          flight.surfaceYield.releaseAtSeconds =
            this.state.elapsed + SURFACE_YIELD_HOLD_SECONDS;
          flight.automaticHold = true;
          flight.automaticHoldReason =
            "surface recovery position held for crossing traffic";
          flight.kinematics.groundSpeedKts = 0;
        }
        if (
          flight.goAround?.weatherEscape &&
          flight.goAround.weatherEscape.completedAtSeconds === undefined &&
          flight.progress >= flight.goAround.weatherEscape.straightAheadProgress
        ) {
          flight.goAround.weatherEscape.completedAtSeconds = this.state.elapsed;
        }
        if (
          flight.weatherEscape?.status === "active" &&
          flight.progress >= flight.weatherEscape.clearProgress
        ) {
          flight.weatherEscape.status = "complete";
          flight.weatherEscape.completedAtSeconds = this.state.elapsed;
        }
        this.updatePushbackState(flight);
        const surfaceClock =
          flight.phase === "taxi-in" || flight.phase === "taxi-out";
        if (surfaceClock) this.updateSurfaceRouteState(flight);
        if (moved && flight.phase !== "resting")
          this.synchronizeResolvedFlightMotion(flight);
        if (!flight.navigation.hold && flight.navigation.routeFixIds.length) {
          flight.navigation.activeFixIndex = Math.min(
            flight.navigation.routeFixIds.length - 1,
            Math.floor(flight.progress * flight.navigation.routeFixIds.length),
          );
        }
        this.updateFlightKinematics(
          flight,
          delta,
          moved,
          previousProgress,
          previousMotion,
          requestedSpeedById.get(flight.id) ?? 0,
        );
        this.updateMotionHealth(flight, delta, moved);

        if (flight.progress >= 1) {
          const awaitingPushback =
            flight.phase === "resting" && !flight.pushbackCleared;
          const retryAt =
            this.phaseTransitionRetryAt.get(flight.id) ?? -Infinity;
          if (!awaitingPushback && this.state.elapsed + 1e-6 >= retryAt) {
            const previousPhase = flight.phase;
            this.advance(flight);
            const remainsActive = this.state.flights.includes(flight);
            if (
              !remainsActive ||
              flight.phase !== previousPhase ||
              flight.progress < 1
            ) {
              this.phaseTransitionRetryAt.delete(flight.id);
            } else {
              this.phaseTransitionRetryAt.set(
                flight.id,
                this.state.elapsed + PHASE_TRANSITION_RETRY_SECONDS,
              );
            }
          }
        }
      }

      // The proposal map is intentionally a snapshot of the tick's opening
      // traffic. A blocker can complete its departure later in this same tick,
      // after another aircraft was assigned a projected-path hold against it.
      // Retire that now-impossible dependency before diagnostics and external
      // telemetry sample the resolved state.
      this.releaseStaleProjectedPathHolds();

      // Report any physical or protected-envelope overlap already present at the
      // end of a tick. Proposed movement should prevent these; diagnostics make
      // any invariant breach visible to tests, replays, and the agent interface.
      beginAircraftCollisionSamplingFrame();
      const activeConflicts = this.activeFlightConflicts();
      const activeObstacleConflicts = this.activeObstacleConflicts();
      endAircraftCollisionSamplingFrame();
      if (activeConflicts.length || activeObstacleConflicts.length) {
        this.metrics.collisionAlerts +=
          activeConflicts.length + activeObstacleConflicts.length;
        this.metrics.runwayIncursions += activeConflicts.filter(
          (conflict) => conflict.type === "runway-incursion",
        ).length;
        for (const conflict of activeConflicts) {
          const flight = this.state.flights.find(
            (item) => item.id === Math.max(conflict.first, conflict.second),
          );
          if (flight && !flight.safetyHold) {
            flight.safetyHold = true;
            flight.safetyHoldReason = conflict.detail;
            if (!wasSafetyHeld.has(flight.id))
              this.events.push({
                type: "safety-hold",
                flight,
                runway: flight.runway,
                taxiway: flight.taxiway,
                detail: flight.safetyHoldReason,
              });
          }
        }
        for (const conflict of activeObstacleConflicts) {
          const flight = this.state.flights.find(
            (item) => item.id === conflict.flight,
          );
          if (flight && !flight.safetyHold) {
            flight.safetyHold = true;
            flight.safetyHoldReason = conflict.detail;
            if (!wasSafetyHeld.has(flight.id))
              this.events.push({
                type: "safety-hold",
                flight,
                runway: flight.runway,
                taxiway: flight.taxiway,
                detail: flight.safetyHoldReason,
              });
          }
        }
      }
      this.updateChallengeState();
    } finally {
      endAircraftCollisionSamplingFrame();
      endFlightMotionSamplingFrame();
    }
  }

  private proposedMovementConflict(
    flight: Flight,
    proposedProgress: number,
    proposedProgressById: Map<number, number>,
    resolvedFlightIds: ReadonlySet<number>,
    surfaceMergeYieldById: Map<number, number>,
  ) {
    return findProposedConflict(
      this.config,
      flight,
      proposedProgress,
      this.state.flights,
      proposedProgressById,
      resolvedFlightIds,
      surfaceMergeYieldById,
    );
  }

  private activeFlightConflicts() {
    return findFlightConflicts(this.config, this.state.flights);
  }

  private activeObstacleConflicts() {
    return findObstacleConflicts(this.config, this.state.flights);
  }

  private progressAfterTravelDistance(
    flight: Flight,
    travelMeters: number,
  ): number {
    return progressAfterDistance(this.config, flight, travelMeters);
  }

  private progressBeforeTravelDistance(
    flight: Flight,
    travelMeters: number,
  ): number {
    return progressBeforeDistance(this.config, flight, travelMeters);
  }

  private synchronizeResolvedFlightMotion(flight: Flight): void {
    flight.motion = sampleFlightMotion(this.config, flight);
  }

  drainEvents(): AirportEvent[] {
    const result = this.events;
    this.events = [];
    return result;
  }

  eventCursor(): number {
    return this.events.length;
  }

  tagEventsSince(cursor: number, commandId: string): void {
    const start = Math.max(0, Math.min(this.events.length, Math.trunc(cursor)));
    for (let index = start; index < this.events.length; index += 1) {
      this.events[index].causedByCommandId ??= commandId;
    }
  }

  queueSnapshot(state: AirportState = this.state): OperationQueueSnapshot {
    return buildOperationQueueSnapshot(this.config, state, {
      stationarySeconds:
        state === this.state ? this.stationarySeconds : undefined,
      runwayReservations:
        state === this.state ? this.runwayReservations : undefined,
      nextArrivalIn:
        state === this.state ? Math.max(0, this.spawnIn) : undefined,
      approachCapacity: this.weatherApproachCapacity(),
    });
  }

  operationProfileSnapshot(state: AirportState = this.state): {
    profile: AirportOperationProfile;
    current: AirportOperationState;
    trafficProgram: AirportConfig["trafficProgram"];
    density: ReturnType<typeof trafficDensityProfile>;
    flow: TrafficFlowSnapshot;
  } {
    const profile = this.config.operationProfile;
    const current = this.operationStateAt(state);
    return {
      profile: {
        ...profile,
        periods: profile.periods.map((period) => ({
          ...period,
          mix: { ...period.mix },
        })),
        sources: profile.sources.map((source) => ({ ...source })),
      },
      current: { ...current, mix: { ...current.mix } },
      trafficProgram: {
        ...this.config.trafficProgram,
        airlines: this.config.trafficProgram.airlines.map((airline) => ({
          ...airline,
          classWeights: { ...airline.classWeights },
          fleets: Object.fromEntries(
            Object.entries(airline.fleets).map(([trafficClass, fleet]) => [
              trafficClass,
              fleet?.map((candidate) => ({ ...candidate })),
            ]),
          ),
          bankMultipliers: Object.fromEntries(
            Object.entries(airline.bankMultipliers).map(
              ([period, multipliers]) => [period, { ...multipliers }],
            ),
          ),
          gate: {
            ...airline.gate,
            concourses: airline.gate.concourses
              ? [...airline.gate.concourses]
              : undefined,
            zoneNames: airline.gate.zoneNames
              ? [...airline.gate.zoneNames]
              : undefined,
            standSector: airline.gate.standSector
              ? [...airline.gate.standSector]
              : undefined,
          },
        })),
        markets: Object.fromEntries(
          Object.entries(this.config.trafficProgram.markets).map(
            ([trafficClass, markets]) => [trafficClass, [...markets]],
          ),
        ) as AirportConfig["trafficProgram"]["markets"],
        recoveryPeriodIds: [...this.config.trafficProgram.recoveryPeriodIds],
        overnightCargoPeriodIds: [
          ...this.config.trafficProgram.overnightCargoPeriodIds,
        ],
        sources: this.config.trafficProgram.sources.map((source) => ({
          ...source,
        })),
      },
      density: {
        ...trafficDensityProfile(state.trafficFlow.density),
        assumptions: [
          ...trafficDensityProfile(state.trafficFlow.density).assumptions,
        ],
      },
      flow: this.trafficFlowSnapshot(state),
    };
  }

  /**
   * Read-only causal projection for surface stalls.  This deliberately uses
   * the same named reasons and runway blocker lookup as recovery, so telemetry
   * does not invent a second notion of who is holding whom.
   */
  surfaceWaitGraph(): {
    generatedAtSeconds: number;
    edges: Array<{
      flightId: number;
      blockerId: number;
      waitSeconds: number;
      reason: string;
    }>;
    terminals: Array<{
      flightId: number;
      blockerId: number;
      blockerPhase: FlightPhase;
      waitSeconds: number;
      reason: string;
    }>;
    cycles: number[][];
  } {
    const surfaceFlights = this.state.flights.filter(
      (flight) => flight.phase === "taxi-in" || flight.phase === "taxi-out",
    );
    const allFlights = new Map(
      this.state.flights.map((flight) => [flight.id, flight]),
    );
    const edges: Array<{
      flightId: number;
      blockerId: number;
      waitSeconds: number;
      reason: string;
    }> = [];
    const terminals: Array<{
      flightId: number;
      blockerId: number;
      blockerPhase: FlightPhase;
      waitSeconds: number;
      reason: string;
    }> = [];
    const waitFor = new Map<number, number>();
    for (const flight of surfaceFlights) {
      const waitSeconds = this.stationarySeconds.get(flight.id) ?? 0;
      if (waitSeconds < 1) continue;
      const reason =
        flight.safetyHoldReason ?? flight.automaticHoldReason ?? "";
      let blockerId = reason.match(/\bflight (\d+)\b/)?.[1]
        ? Number(reason.match(/\bflight (\d+)\b/)?.[1])
        : undefined;
      if (
        blockerId === undefined &&
        reason.startsWith("pushback corridor protected for ")
      ) {
        const callsign = reason.slice(
          "pushback corridor protected for ".length,
        );
        blockerId = surfaceFlights.find(
          (candidate) => candidate.callsign === callsign,
        )?.id;
      }
      if (
        blockerId === undefined &&
        (flight.crossingHoldRunway !== undefined ||
          (flight.pendingCrossingCount ?? 0) > 0)
      ) {
        const crossing = this.nextUnclearedCrossing(flight);
        const blocker = crossing
          ? this.runwayBlocker(crossing.runwayId, flight.id)
          : null;
        if (blocker) blockerId = blocker.id;
      }
      if (blockerId === undefined || blockerId === flight.id) continue;
      const blocker = allFlights.get(blockerId);
      if (!blocker) continue;
      const edge = { flightId: flight.id, blockerId, waitSeconds, reason };
      if (blocker.phase === "taxi-in" || blocker.phase === "taxi-out") {
        edges.push(edge);
        waitFor.set(flight.id, blockerId);
      } else {
        terminals.push({ ...edge, blockerPhase: blocker.phase });
      }
    }
    const completed = new Set<number>();
    const cycles: number[][] = [];
    for (const start of waitFor.keys()) {
      if (completed.has(start)) continue;
      const path: number[] = [];
      const pathIndex = new Map<number, number>();
      let cursor: number | undefined = start;
      while (
        cursor !== undefined &&
        waitFor.has(cursor) &&
        !completed.has(cursor)
      ) {
        const cycleStart = pathIndex.get(cursor);
        if (cycleStart !== undefined) {
          cycles.push(path.slice(cycleStart));
          break;
        }
        pathIndex.set(cursor, path.length);
        path.push(cursor);
        cursor = waitFor.get(cursor);
      }
      for (const id of path) completed.add(id);
    }
    return {
      generatedAtSeconds: Number(this.state.elapsed.toFixed(3)),
      edges: edges.sort(
        (first, second) =>
          second.waitSeconds - first.waitSeconds ||
          first.flightId - second.flightId,
      ),
      terminals: terminals.sort(
        (first, second) =>
          second.waitSeconds - first.waitSeconds ||
          first.flightId - second.flightId,
      ),
      cycles: cycles.map((cycle) =>
        [...cycle].sort((first, second) => first - second),
      ),
    };
  }

  diagnostics(): {
    flow: "continuous";
    approachCapacity: number;
    activeTrafficCap: number;
    nextArrivalIn: number;
    activeFlights: number;
    runwayReservations: Array<{ runway: number; flight: number }>;
    scenario: TrafficScenario;
    closedRunway: number | null;
    predictions: ConflictPrediction[];
    collisions: ReturnType<typeof findFlightConflicts>;
    obstacleCollisions: ReturnType<typeof findObstacleConflicts>;
    serviceVehicleConflicts: ReturnType<typeof findServiceVehicleConflicts>;
    serviceVehicleRouteViolations: ReturnType<
      typeof serviceVehicleRouteViolations
    >;
    surfaceDisruptions: SurfaceDisruptionState[];
    queues: OperationQueueSnapshot;
    surfaceWaitGraph: ReturnType<AirportSimulation["surfaceWaitGraph"]>;
    trafficManagement: TrafficFlowSnapshot;
    deicing: {
      facilities: ReturnType<typeof deicingFacilities>;
      required: number;
      queued: number;
      treating: number;
      protected: number;
      expired: number;
    };
    separation: {
      ruleset: ReturnType<typeof separationRuleset>;
      requiredRadarNm: number;
      coordinateBasis: string;
      runwayHistory: RunwayOperationRecord[];
      violations: ReturnType<AirportSimulation["airborneSeparationViolations"]>;
    };
    collisionEnvelopes: {
      aircraft: ReturnType<typeof aircraftCollisionEnvelope>[];
      obstacles: AirportConfig["obstacles"];
    };
    metrics: ShiftMetrics;
    surfaceGraph: SurfaceGraphValidation;
    obstacleEnvelopes: AirportObstacleValidation;
  } {
    return {
      flow: "continuous",
      approachCapacity: this.weatherApproachCapacity(),
      activeTrafficCap: this.effectiveTrafficCap(),
      nextArrivalIn: Number(Math.max(0, this.spawnIn).toFixed(2)),
      activeFlights: this.state.flights.length,
      runwayReservations: [...this.runwayReservations].map(
        ([runway, flight]) => ({ runway, flight }),
      ),
      scenario: this.state.scenario,
      closedRunway: this.closedRunway,
      predictions: this.conflictPredictions(),
      collisions: findFlightConflicts(this.config, this.state.flights),
      obstacleCollisions: findObstacleConflicts(
        this.config,
        this.state.flights,
      ),
      serviceVehicleConflicts: findServiceVehicleConflicts(
        this.config,
        this.state.serviceVehicles,
        this.state.flights,
      ),
      serviceVehicleRouteViolations: serviceVehicleRouteViolations(
        this.config.surfaceGraph,
        this.state.serviceVehicles,
      ),
      surfaceDisruptions: this.state.surfaceDisruptions.map((disruption) => ({
        ...disruption,
        edgeIds: [...disruption.edgeIds],
        reroutedFlightIds: [...disruption.reroutedFlightIds],
      })),
      queues: this.queueSnapshot(),
      surfaceWaitGraph: this.surfaceWaitGraph(),
      trafficManagement: this.trafficFlowSnapshot(),
      deicing: {
        facilities: deicingFacilities(this.config.surfaceGraph),
        required: this.state.flights.filter((flight) => flight.deicing.required)
          .length,
        queued: this.state.flights.filter(
          (flight) => flight.deicing.status === "queued",
        ).length,
        treating: this.state.flights.filter(
          (flight) => flight.deicing.status === "treating",
        ).length,
        protected: this.state.flights.filter(
          (flight) => flight.deicing.status === "protected",
        ).length,
        expired: this.state.flights.filter(
          (flight) => flight.deicing.status === "expired",
        ).length,
      },
      separation: {
        ruleset: separationRuleset(this.state.separationRuleset),
        requiredRadarNm: requiredRadarSeparationNm(
          separationRuleset(this.state.separationRuleset),
          this.state.weather,
        ),
        coordinateBasis: `${WORLD_METERS_PER_UNIT} horizontal metres per airport-world unit; vertical controller values in feet`,
        runwayHistory: this.runwayOperationHistory.map((operation) => ({
          ...operation,
        })),
        violations: this.airborneSeparationViolations(),
      },
      collisionEnvelopes: {
        aircraft: this.state.flights.map((flight) =>
          aircraftCollisionEnvelope(this.config, flight),
        ),
        obstacles: this.config.obstacles.map((obstacle) => ({ ...obstacle })),
      },
      metrics: this.shiftMetrics(),
      surfaceGraph: this.surfaceGraphValidation,
      obstacleEnvelopes: this.obstacleEnvelopeValidation,
    };
  }

  trafficFlowSnapshot(state: AirportState = this.state): TrafficFlowSnapshot {
    const weather = state.weather;
    const runwayCondition = Math.max(
      weather.surfaceCondition === "dry"
        ? 0
        : weather.surfaceCondition === "wet"
          ? 0.18
          : 0.42,
      ...weather.runwayConditionReports.map((report) =>
        report.worstCode >= 4 ? 0.5 : report.worstCode >= 3 ? 0.28 : 0,
      ),
    );
    const weatherFactor =
      !weather.weatherEnabled || weather.condition === "clear"
        ? 0
        : weather.condition === "thunderstorm"
          ? 0.6
          : weather.condition === "fog" || weather.condition === "snow"
            ? 0.42
            : weather.condition === "rain"
              ? 0.24
              : 0.12;
    const windFactor = !weather.windEnabled
      ? 0
      : Math.min(
          0.65,
          Math.max(0, (weather.windSpeed - 12) / 30) +
            Math.max(0, (weather.gustSpeed - weather.windSpeed) / 45),
        );
    const overdueHandoffs = state.flights.filter(
      (flight) => flight.navigation.handoff?.status === "overdue",
    ).length;
    const pilotResponse = Math.min(
      0.55,
      (state.trafficFlow.arrivalQueue.reduce(
        (sum, entry) => sum + entry.attempts,
        0,
      ) +
        state.trafficFlow.departureQueue.reduce(
          (sum, entry) => sum + entry.attempts,
          0,
        ) +
        overdueHandoffs) /
        Math.max(1, state.flights.length * 3),
    );
    return trafficFlowSnapshot(state.trafficFlow, state.elapsed, {
      arrivalDemandIntervalSeconds: this.arrivalDemandInterval(),
      departureSpacingSeconds: this.departureSlotSpacing(),
      uncertainty: {
        weather: weatherFactor,
        wind: windFactor,
        runwayCondition,
        pilotResponse,
      },
    });
  }

  private updateSandboxInjections(): void {
    const sandbox = this.state.sandbox;
    if (!sandbox.active) return;
    const request = sandbox.injections.find(
      (candidate) =>
        (candidate.status === "queued" || candidate.status === "releasing") &&
        candidate.remainingCount > 0,
    );
    if (!request || this.state.elapsed + 1e-6 < request.nextAttemptSeconds)
      return;
    request.status = "releasing";
    request.updatedAtSeconds = this.state.elapsed;
    if (this.state.flights.length >= this.effectiveTrafficCap()) {
      request.lastReason = `${this.state.flights.length}/${this.effectiveTrafficCap()} sandbox aircraft budget occupied`;
      request.nextAttemptSeconds = this.state.elapsed + 1;
      sandbox.lastMessage = request.lastReason;
      return;
    }

    const trafficClass =
      request.trafficClass === "auto" ? undefined : request.trafficClass;
    const aircraft = this.spawnFlight({
      trafficClass,
      requestedArrivalRunwayId:
        request.direction === "arrival"
          ? (request.runwayId ?? undefined)
          : undefined,
      stagingDeparture: request.direction === "departure",
    });
    const flight = aircraft
      ? this.state.flights.find((candidate) => candidate.id === this.nextId - 1)
      : undefined;
    if (!aircraft || !flight) {
      request.lastReason = this.lastArrivalAdmissionReason;
      request.nextAttemptSeconds = this.state.elapsed + 1;
      sandbox.lastMessage = `Injection waiting: ${request.lastReason}.`;
      return;
    }
    if (
      request.direction === "departure" &&
      !this.prepareSandboxDeparture(flight, request.runwayId)
    ) {
      this.discardSandboxStagingFlight(flight);
      request.lastReason = this.lastArrivalAdmissionReason;
      request.nextAttemptSeconds = this.state.elapsed + 1;
      sandbox.lastMessage = `Injection waiting: ${request.lastReason}.`;
      return;
    }

    request.remainingCount -= 1;
    request.releasedFlightIds.push(flight.id);
    request.updatedAtSeconds = this.state.elapsed;
    request.lastReason = `${flight.callsign} released as a sandbox ${request.direction}`;
    request.nextAttemptSeconds =
      this.state.elapsed +
      (request.direction === "arrival"
        ? Math.max(
            1,
            this.arrivalSpacing(aircraftProfile(flight.aircraft)) * 0.55,
          )
        : 0.75);
    if (request.direction === "arrival") sandbox.totals.releasedArrivals += 1;
    else sandbox.totals.releasedDepartures += 1;
    if (request.remainingCount === 0) request.status = "complete";
    sandbox.lastMessage = request.remainingCount
      ? `${flight.callsign} released; ${request.remainingCount} request${request.remainingCount === 1 ? "" : "s"} remain in this injection.`
      : `${flight.callsign} released; injection ${request.id} complete.`;
    this.events.push({
      type: "sandbox-injection",
      flight,
      runway: flight.runway,
      detail: `${request.direction} · ${request.trafficClass} · request ${request.id}`,
    });
    const activeFlightIds = new Set(
      this.state.flights.map((candidate) => candidate.id),
    );
    const terminalRequests = sandbox.injections.filter(
      (candidate) =>
        (candidate.status === "complete" || candidate.status === "cancelled") &&
        !candidate.releasedFlightIds.some((flightId) =>
          activeFlightIds.has(flightId),
        ),
    );
    if (terminalRequests.length > 40) {
      const removeIds = new Set(
        terminalRequests
          .slice(0, terminalRequests.length - 40)
          .map((candidate) => candidate.id),
      );
      sandbox.injections = sandbox.injections.filter(
        (candidate) => !removeIds.has(candidate.id),
      );
    }
  }

  private prepareSandboxDeparture(
    flight: Flight,
    requestedRunwayId: number | null,
  ): boolean {
    const compatible = this.config.runways
      .filter((runway) => {
        const role = this.runwayRole(runway.id);
        return (
          (role === "departure" || role === "mixed") &&
          !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id) &&
          this.runwaySupportsCurrentCondition(
            runway,
            flight.aircraft,
            "takeoff",
          )
        );
      })
      .sort(
        (first, second) =>
          this.headwindComponent(second.id) - this.headwindComponent(first.id),
      );
    const candidates =
      requestedRunwayId === null
        ? compatible
        : compatible.filter((runway) => runway.id === requestedRunwayId);
    if (!candidates.length) {
      this.lastArrivalAdmissionReason =
        requestedRunwayId === null
          ? `${flight.aircraft} has no active compatible departure runway`
          : `${this.activeRunwayDesignation(requestedRunwayId)} cannot launch ${flight.aircraft} under current configuration, weather, or runway performance`;
      return false;
    }
    if (!this.ensureArrivalGate(flight)) {
      this.lastArrivalAdmissionReason = `no immediately available compatible stand can stage ${flight.aircraft}`;
      return false;
    }
    const standAlreadyOccupied = this.state.flights.some(
      (candidate) =>
        candidate.id !== flight.id &&
        candidate.standId === flight.standId &&
        (candidate.phase === "taxi-in" ||
          candidate.phase === "resting" ||
          (candidate.phase === "taxi-out" &&
            (candidate.tugAttached || candidate.pushbackProgress < 1))),
    );
    if (standAlreadyOccupied) {
      this.lastArrivalAdmissionReason = `${flight.gateAssignment?.gateRef ?? flight.standId ?? "planned stand"} is physically occupied`;
      return false;
    }

    const runway = candidates[0];
    flight.runway = runway.id;
    flight.departureRunway = runway.id;
    flight.operatingEnd = this.preferredOperatingEnd(runway.id);
    flight.runwayExit = undefined;
    flight.palette = runway.color;
    if (flight.gateAssignment)
      flight.gateAssignment.scheduledDepartureSeconds = this.state.elapsed + 1;
    this.prepareDepartureFlightPlan(
      flight,
      this.state.elapsed + 1,
      true,
      runway.id,
    );
    flight.phase = "resting";
    flight.progress = 1;
    flight.phaseElapsed = flight.duration;
    flight.cleared = true;
    flight.clearanceLeft = 99;
    flight.kinematics.fuelPercent = flight.turnaround.targetFuelPercent;
    flight.kinematics.altitudeFt = 0;
    flight.kinematics.airspeedKts = 0;
    flight.kinematics.groundSpeedKts = 0;
    flight.runwayEntryCleared = false;
    flight.takeoffCleared = false;
    flight.pushbackCleared = false;
    flight.pushbackProgress = 0;
    flight.tugAttached = false;
    flight.engineState = "off";
    flight.holdShortRunway = undefined;
    completeTurnaround(flight.turnaround, this.state.elapsed);
    if (flight.gateAssignment) {
      flight.gateAssignment.actualGateInSeconds = this.state.elapsed;
      flight.gateAssignment.scheduledGateInSeconds = this.state.elapsed;
      flight.gateAssignment.actualGateOutSeconds = undefined;
      flight.gateAssignment.scheduledDepartureSeconds = this.state.elapsed + 1;
    }
    this.assignSurfaceRoute(flight, "resting");
    syncFlightMotion(this.config, flight);
    this.events = this.events.filter(
      (event) =>
        !(event.flight.id === flight.id && event.type === "runway-exit-plan"),
    );
    return true;
  }

  private discardSandboxStagingFlight(flight: Flight): void {
    this.state.flights = this.state.flights.filter(
      (candidate) => candidate.id !== flight.id,
    );
    this.state.serviceVehicles = this.state.serviceVehicles.filter(
      (vehicle) => vehicle.flightId !== flight.id,
    );
    this.events = this.events.filter((event) => event.flight.id !== flight.id);
    this.releaseFlightRuntimeState(flight);
    removeDepartureDemand(this.state.trafficFlow, flight.id);
  }

  /**
   * Release per-flight runtime bookkeeping when an aircraft leaves the live
   * simulation. IDs are monotonic, so retaining cooldown/retry entries after
   * departure cannot help a future aircraft; it only turns a long Watch
   * session into an avoidable retained-memory slope. WeakMap-backed route
   * caches intentionally need no explicit release.
   */
  private releaseFlightRuntimeState(flight: Flight): void {
    this.stationarySeconds.delete(flight.id);
    this.surfaceYieldCooldownUntil.delete(flight.id);
    this.phaseTransitionRetryAt.delete(flight.id);
    this.parkedBlockerRecovery.delete(flight.id);
    for (const [runway, owner] of this.runwayReservations) {
      if (owner === flight.id) this.runwayReservations.delete(runway);
    }
    for (const dependent of this.state.flights) {
      if (
        dependent.id === flight.id ||
        dependent.safetyHoldReason !==
          `projected path conflict with flight ${flight.id}`
      )
        continue;
      dependent.safetyHold = false;
      dependent.safetyHoldReason = undefined;
      this.stationarySeconds.set(dependent.id, 0);
      this.parkedBlockerRecovery.delete(dependent.id);
      this.events.push({
        type: "surface-reroute",
        flight: dependent,
        runway: dependent.runway,
        taxiway: dependent.taxiway,
        detail: `${flight.callsign} cleared the projected path · surface hold released`,
      });
    }
  }

  private releaseStaleProjectedPathHolds(): void {
    const activeIds = new Set(this.state.flights.map((flight) => flight.id));
    for (const flight of this.state.flights) {
      const blockerId = Number(
        flight.safetyHoldReason?.match(
          /^projected path conflict with flight (\d+)$/,
        )?.[1],
      );
      if (!Number.isInteger(blockerId) || activeIds.has(blockerId)) continue;
      flight.safetyHold = false;
      flight.safetyHoldReason = undefined;
      this.stationarySeconds.set(flight.id, 0);
      this.parkedBlockerRecovery.delete(flight.id);
    }
  }

  private updateTrafficFlow(): void {
    const flow = this.state.trafficFlow;
    const density = trafficDensityProfile(flow.density);
    const now = this.state.elapsed;

    if (
      (!this.state.sandbox.active || this.state.sandbox.backgroundTraffic) &&
      now + 1e-6 >= flow.nextArrivalDemandSeconds
    ) {
      const demand = enqueueArrivalDemand(
        flow,
        now,
        `${density.label} demand · ${this.operationStateAt(this.state, now).periodLabel}`,
      );
      if (demand.status === "diverted") this.metrics.diversions += 1;
      scheduleNextArrivalDemand(
        flow,
        now,
        this.arrivalDemandInterval() * this.arrivalPressureReliefFactor(),
      );
    }

    for (const flight of this.state.flights) {
      const departureCandidate =
        (flight.phase === "resting" && flight.turnaround.status === "ready") ||
        // The release meter owns a departure only until Tower has committed it
        // at the runway hold line. Re-registering a lined-up or rolling
        // aircraft on every fixed step creates a fresh gate-bank slot after it
        // has already been released, which can strand it at the threshold and
        // artificially serialize otherwise independent departures.
        (flight.phase === "taxi-out" && !flight.runwayEntryCleared);
      if (!departureCandidate) continue;
      if (
        flight.flightPlan.direction !== "departure" ||
        flight.flightPlan.status === "cancelled"
      ) {
        this.prepareDepartureFlightPlan(flight);
      }
      const entry = registerDepartureDemand(
        flow,
        flight,
        now,
        flight.flightPlan.scheduledReleaseSeconds,
        this.departureSlotSpacing(),
      );
      setTrafficFlowMeterTargets(
        entry,
        this.departureTrafficFlowTargets(
          flight,
          entry.id,
          entry.releaseSlotSeconds,
        ),
      );
    }

    const expired = expireTrafficFlow(flow, now);
    this.metrics.diversions += expired.diverted.length;
    this.metrics.cancellations += expired.cancelled.length;
    for (const entry of expired.cancelled) {
      const flight =
        entry.flightId === undefined
          ? undefined
          : this.state.flights.find(
              (candidate) => candidate.id === entry.flightId,
            );
      if (!flight) continue;
      setFlightPlanStatus(flight.flightPlan, "cancelled", now, entry.reason);
      this.archiveFlightPlan(flight);
      this.prepareDepartureFlightPlan(
        flight,
        now + density.recoveryDelaySeconds,
        true,
      );
      flight.pushbackCleared = false;
      flight.controlHold = false;
      flight.automaticHold = false;
    }

    const arrival = flow.arrivalQueue[0];
    if (
      arrival &&
      now + 1e-6 >=
        Math.max(arrival.releaseSlotSeconds, flow.nextArrivalReleaseSeconds)
    ) {
      const activeApproaches = this.state.flights.filter(
        (flight) => flight.phase === "approach" || flight.phase === "landing",
      ).length;
      if (activeApproaches >= this.weatherApproachCapacity()) {
        markArrivalHolding(
          flow,
          arrival,
          now,
          `${activeApproaches}/${this.weatherApproachCapacity()} approach positions occupied`,
          ARRIVAL_ADMISSION_RETRY_SECONDS,
        );
      } else if (
        this.state.flights.filter(
          (flight) => flight.phase === "taxi-in" || flight.phase === "taxi-out",
        ).length >= this.surfaceArrivalAdmissionCapacity()
      ) {
        markArrivalHolding(
          flow,
          arrival,
          now,
          `surface meter holding for ${this.surfaceArrivalAdmissionCapacity()} active taxi positions`,
          ARRIVAL_ADMISSION_RETRY_SECONDS,
        );
      } else if (this.state.flights.length >= this.effectiveTrafficCap()) {
        markArrivalHolding(
          flow,
          arrival,
          now,
          `${this.state.flights.length}/${this.effectiveTrafficCap()} active-aircraft budget occupied`,
          ARRIVAL_ADMISSION_RETRY_SECONDS,
        );
      } else {
        const spawnedAircraft = this.spawnFlight();
        const flight = spawnedAircraft
          ? this.state.flights.find(
              (candidate) => candidate.id === this.nextId - 1,
            )
          : undefined;
        if (flight && spawnedAircraft)
          releaseArrivalDemand(
            flow,
            arrival,
            now,
            flight,
            this.arrivalSpacing(aircraftProfile(spawnedAircraft)),
          );
        else
          markArrivalHolding(
            flow,
            arrival,
            now,
            this.lastArrivalAdmissionReason,
            ARRIVAL_ADMISSION_RETRY_SECONDS,
          );
      }
    }

    refreshTrafficFlow(flow, now);
    this.spawnIn = Math.max(0, flow.nextArrivalDemandSeconds - now);
    this.taxiOutReleaseIn = Math.max(0, flow.nextDepartureReleaseSeconds - now);
  }

  private departureTrafficFlowTargets(
    flight: Flight,
    entryId: string,
    releaseSlotSeconds: number,
  ): TrafficFlowMeterTarget[] {
    const targets: TrafficFlowMeterTarget[] = [
      {
        schemaVersion: 1,
        id: `${entryId}:departure-release`,
        kind: "departure-release",
        label: "Departure release",
        targetSeconds: releaseSlotSeconds,
        toleranceBeforeSeconds: 0,
        toleranceAfterSeconds: 5,
      },
    ];
    if (
      flight.phase !== "taxi-out" ||
      !flight.surfaceRoute?.length ||
      !flight.surfaceRouteEdges?.length
    )
      return targets;

    const plan = this.surfaceCrossingPlan(flight);
    const taxiMetersPerSecond = Math.max(
      1,
      aircraftProfile(flight.aircraft).taxiKts * KNOT_TO_MPS,
    );
    for (const crossing of plan.windows) {
      targets.push({
        schemaVersion: 1,
        id: `${entryId}:runway-crossing:${crossing.id}`,
        kind: "runway-crossing",
        label: `Cross runway ${this.activeRunwayDesignation(crossing.runwayId)}`,
        targetSeconds:
          releaseSlotSeconds +
          (crossing.entryProgress * plan.routeDistanceM) / taxiMetersPerSecond,
        toleranceBeforeSeconds: 5,
        toleranceAfterSeconds: 12,
        runwayId: crossing.runwayId,
        crossingId: crossing.id,
      });
    }
    targets.push({
      schemaVersion: 1,
      id: `${entryId}:runway-threshold:${flight.runway}`,
      kind: "runway-threshold",
      label: `Runway ${this.activeRunwayDesignation(flight.runway)} threshold`,
      targetSeconds:
        releaseSlotSeconds + plan.routeDistanceM / taxiMetersPerSecond,
      toleranceBeforeSeconds: 8,
      toleranceAfterSeconds: 15,
      runwayId: flight.runway,
    });
    return targets;
  }

  private arrivalDemandInterval(): number {
    const operation = this.operationStateAt();
    const density = trafficDensityProfile(this.state.trafficFlow.density);
    const base =
      this.config.scope === "center"
        ? Math.max(4.8, this.config.trafficInterval * 0.68)
        : Math.max(6.2, this.config.trafficInterval * 0.9);
    const scenarioMultiplier =
      this.state.scenario === "training"
        ? 2.4
        : this.state.scenario === "emergency"
          ? 1.45
          : this.state.scenario === "storm"
            ? 1.08
            : 1;
    const objective = trafficFlowObjectiveProfile(
      this.state.trafficFlow.objective,
    );
    return Math.max(
      0.8,
      (base *
        operation.arrivalIntervalMultiplier *
        scenarioMultiplier *
        objective.arrivalDemandIntervalMultiplier) /
        density.demandMultiplier,
    );
  }

  /**
   * Keep strategic delay in the arrival queue instead of admitting enough
   * aircraft to seal every ramp and connector. This is a hub-scaled movement
   * area capacity, not a replacement for graph reservations or ATC spacing.
   */
  private surfaceArrivalAdmissionCapacity(): number {
    const standCapacity = Math.floor(
      this.config.surfaceGraph.stands.length * 0.35,
    );
    const runwayCapacity =
      this.config.runways.filter(
        (runway) => this.runwayRole(runway.id) !== "inactive",
      ).length * 2;
    return Math.max(6, Math.min(18, Math.max(standCapacity, runwayCapacity)));
  }

  /**
   * Back-pressure the demand clock before the invisible holding buffer fills.
   * This is deliberately bounded and only changes when the next demand is
   * presented; it never changes runway separation, reservations, or an
   * aircraft already in the simulation.
   */
  private arrivalPressureReliefFactor(): number {
    const density = trafficDensityProfile(this.state.trafficFlow.density);
    const pressure =
      this.state.trafficFlow.arrivalQueue.length / density.holdingCapacity;
    if (pressure <= 0.5) return 1;
    return 1 + Math.min(0.75, (pressure - 0.5) * 1.5);
  }

  private departureSlotSpacing(): number {
    const density = trafficDensityProfile(this.state.trafficFlow.density);
    const operation = this.operationStateAt();
    const base = this.config.scope === "center" ? 6.2 : 9;
    const rules = separationRuleset(this.state.separationRuleset);
    const departureRunways = Math.max(
      1,
      this.config.runways.filter((runway) => {
        const role = this.runwayRole(runway.id);
        return role === "departure" || role === "mixed";
      }).length,
    );
    const physicalRelease =
      rules.runwayBaseSeconds.departure / departureRunways;
    const objective = trafficFlowObjectiveProfile(
      this.state.trafficFlow.objective,
    );
    return Math.max(
      2.8,
      physicalRelease,
      (base *
        Math.max(0.68, operation.departureReadinessMultiplier) *
        objective.departureSpacingMultiplier) /
        density.departureCapacityMultiplier,
    );
  }

  private effectiveTrafficCap(): number {
    const density = trafficDensityProfile(this.state.trafficFlow.density);
    const scaled = Math.max(
      3,
      Math.round(this.config.trafficCap * density.activeTrafficMultiplier),
    );
    if (this.state.sandbox.active) {
      return Math.max(
        scaled,
        Math.round(
          this.config.trafficCap *
            trafficDensityProfile("extreme").activeTrafficMultiplier,
        ),
      );
    }
    return this.state.scenario === "training" ? Math.min(4, scaled) : scaled;
  }

  private prepareDepartureFlightPlan(
    flight: Flight,
    notBeforeSeconds = this.state.elapsed,
    force = false,
    requestedRunway?: number,
  ): void {
    const assignment = flight.gateAssignment;
    if (!assignment) return;
    if (
      !force &&
      flight.flightPlan.direction === "departure" &&
      flight.flightPlan.status !== "cancelled"
    )
      return;
    if (
      !flight.flightPlanHistory.some((plan) => plan.id === flight.flightPlan.id)
    ) {
      if (flight.flightPlan.status !== "cancelled")
        flight.flightPlan.status = "completed";
      this.archiveFlightPlan(flight);
    }
    const state = this.operationStateAt();
    const selection = selectTrafficProgram(this.config.trafficProgram, {
      trafficClass: flight.operationPlan.trafficClass,
      direction: "departure",
      periodId: state.periodId,
      flightId: flight.id + flight.flightPlanHistory.length * 10_000,
      airportSeed: this.config.seed,
      supportsAircraft: (model) => this.hasUsableRunwayPair(model),
    });
    const runway =
      requestedRunway ??
      this.selectDepartureRunway(flight) ??
      flight.departureRunway;
    const selectedProcedure = this.terminalProcedure(
      "SID",
      runway,
      flight.id + flight.flightPlanHistory.length * 101,
    );
    const procedure = selectedProcedure.procedure.name;
    const origin = this.config.code === "LOCAL" ? "LOCAL" : this.config.code;
    const destination = assignment.nextDestination || selection.market;
    if (
      flight.fuelPlan.departure.origin !== origin ||
      flight.fuelPlan.departure.destination !== destination
    ) {
      flight.fuelPlan = replaceDepartureFuelPlan(flight.fuelPlan, {
        origin,
        destination,
        trafficClass: flight.operationPlan.trafficClass,
        flightId: flight.id + flight.flightPlanHistory.length * 10_000,
        airportSeed: this.config.seed,
      });
      if (flight.turnaround.status === "planned") {
        const scheduledGateInSeconds = flight.turnaround.scheduledStartSeconds;
        flight.turnaround = createTurnaroundPlan({
          flightId: flight.id,
          airportSeed: this.config.seed,
          aircraft: flight.aircraft,
          service: flight.service,
          fuelPercent: flight.turnaround.initialFuelPercent,
          targetFuelPercent: flight.fuelPlan.departure.dispatchFuelPercent,
          scope: this.config.scope,
          scheduledGateInSeconds,
          operationalDetail: flight.operationalDetail,
        });
        scheduleTurnaround(flight.turnaround, scheduledGateInSeconds);
      }
    }
    const release = Math.max(
      notBeforeSeconds,
      assignment.scheduledDepartureSeconds,
    );
    flight.flightPlan = createFlightPlan({
      flightId: flight.id,
      legNumber: this.nextFlightPlanLegNumber(flight),
      direction: "departure",
      origin,
      destination,
      procedureSelection: selectedProcedure,
      procedureDataVersion: this.config.airspaceProgram.dataVersion,
      airline: flight.airline,
      aircraft: flight.aircraft,
      trafficClass: flight.operationPlan.trafficClass,
      gateAssignment: assignment,
      runwayId: runway,
      operatingEnd: this.preferredOperatingEnd(runway),
      runwayDesignation: this.activeRunwayDesignation(runway),
      createdAtSeconds: this.state.elapsed,
      scheduledReleaseSeconds: release,
      estimatedArrivalSeconds:
        release + this.phaseDuration(flight.aircraft, "takeoff", runway) + 180,
      airportSeed: this.config.seed,
    });
    flight.origin = origin;
    flight.destination = destination;
    flight.procedure = procedure;
    flight.navigation = this.navigationFor(selectedProcedure, "departure");
    flight.departureRunway = runway;
    flight.operationPlan = this.createOperationPlan(
      "departure",
      flight.operationPlan.trafficClass,
      state,
    );
    flight.flightNumber =
      100 +
      ((flight.id * 37 +
        flight.flightPlanHistory.length * 101 +
        Math.abs(this.config.seed)) %
        890);
    flight.callsign = `${airlineProfile(flight.airline).callsign} ${flight.flightNumber}`;
    assignment.nextDestination = destination;
    assignment.departureRunway = runway;
  }

  private archiveFlightPlan(flight: Flight): void {
    if (
      !flight.flightPlanHistory.some((plan) => plan.id === flight.flightPlan.id)
    ) {
      flight.flightPlanHistory.push(cloneFlightPlan(flight.flightPlan));
    }
    if (flight.flightPlanHistory.length > 24) {
      flight.flightPlanHistory.splice(0, flight.flightPlanHistory.length - 24);
    }
  }

  private nextFlightPlanLegNumber(flight: Flight): number {
    const plans = [...flight.flightPlanHistory, flight.flightPlan];
    return (
      plans.reduce((highest, plan) => {
        const leg = Number(plan.id.match(/-(\d+)$/)?.[1]);
        return Number.isFinite(leg) ? Math.max(highest, leg) : highest;
      }, 0) + 1
    );
  }

  private departureReleaseReady(flight: Flight): boolean {
    const hazard = this.state.weather.activeHazard;
    if (
      hazard?.status === "active" &&
      hazard.operation === "departure" &&
      hazard.runwayId === flight.runway
    ) {
      flight.automaticHold = true;
      flight.automaticHoldReason = `${hazard.kind.replace("-", " ")} advisory protects ${this.activeRunwayDesignation(flight.runway)} departure`;
      return false;
    }
    const performance = this.assessTakeoffPerformance(flight);
    flight.takeoffPerformance = performance;
    if (!performance.safe) {
      flight.automaticHold = true;
      flight.automaticHoldReason = `RwyCC ${performance.runwayConditionCode} leaves ${Math.round(Math.abs(performance.marginM))} m takeoff shortfall on ${this.activeRunwayDesignation(flight.runway)}`;
      return false;
    }
    const flow = this.state.trafficFlow;
    const entry = registerDepartureDemand(
      flow,
      flight,
      this.state.elapsed,
      flight.flightPlan.scheduledReleaseSeconds,
      this.departureSlotSpacing(),
    );
    const first = flow.departureQueue[0];
    const entryIndex = flow.departureQueue.indexOf(entry);
    const runwayReadyPredecessor = flow.departureQueue
      .slice(0, Math.max(0, entryIndex))
      .map((candidate) =>
        candidate.flightId === undefined
          ? undefined
          : this.state.flights.find(
              (flightCandidate) => flightCandidate.id === candidate.flightId,
            ),
      )
      .find(
        (candidate) =>
          candidate?.phase === "taxi-out" && candidate.progress >= 0.9,
      );
    if (first !== entry && runwayReadyPredecessor) {
      flight.automaticHold = true;
      flight.automaticHoldReason = `departure release queue ${entryIndex + 1}/${flow.departureQueue.length} behind ${runwayReadyPredecessor.callsign}`;
      return false;
    }
    if (
      this.state.elapsed + 1e-6 < entry.releaseSlotSeconds ||
      this.state.elapsed + 1e-6 < flow.nextDepartureReleaseSeconds
    ) {
      flight.automaticHold = true;
      flight.automaticHoldReason = `departure slot in ${Math.ceil(Math.max(entry.releaseSlotSeconds, flow.nextDepartureReleaseSeconds) - this.state.elapsed)} seconds`;
      return false;
    }
    if (entryIndex > 0) {
      amendFlightPlan(
        flight.flightPlan,
        "slot-change",
        this.state.elapsed,
        `runway-ready departure advanced from release position ${entryIndex + 1} while earlier flights remained upstream`,
      );
    }
    releaseDepartureDemand(
      flow,
      entry,
      this.state.elapsed,
      this.departureSlotSpacing(),
    );
    flight.flightPlan.status = "active";
    flight.automaticHold = false;
    flight.automaticHoldReason = undefined;
    return true;
  }

  /**
   * Select the next line-up/takeoff that Tower can actually use without
   * contradicting runway protection, wake release, crossings, weather, or the
   * low-altitude departure envelope. This is intentionally side-effect free:
   * queue registration and runway reservation still occur only when an actual
   * command passes the shared arbiter.
   */
  private towerReadyDepartureIds(): Set<number> {
    const queuePosition = (flight: Flight): number => {
      const position = this.state.trafficFlow.departureQueue.findIndex(
        (entry) => entry.flightId === flight.id,
      );
      return position === -1 ? Number.MAX_SAFE_INTEGER : position;
    };
    const candidates = this.state.flights
      .filter(
        (flight) =>
          (flight.phase === "takeoff" && !flight.takeoffCleared) ||
          (flight.phase === "taxi-out" &&
            flight.progress >= 0.985 &&
            !flight.runwayEntryCleared),
      )
      .sort(
        (first, second) =>
          // A lined-up aircraft is the runway's next practical operation.
          (first.phase === "takeoff" ? 0 : 1) -
            (second.phase === "takeoff" ? 0 : 1) ||
          queuePosition(first) - queuePosition(second) ||
          first.id - second.id,
      );
    const selected: Flight[] = [];
    for (const candidate of candidates) {
      if (
        selected.some((owner) =>
          this.runwaysConflict(owner.runway, candidate.runway),
        )
      ) {
        continue;
      }
      if (!this.towerDepartureProposalReady(candidate)) continue;
      selected.push(candidate);
    }
    return new Set(selected.map((flight) => flight.id));
  }

  private towerDepartureProposalReady(flight: Flight): boolean {
    if (!deicingReleaseValid(flight, this.state.weather, this.state.elapsed))
      return false;
    if (this.priorityRunwayCrossing(flight.runway, flight.id)) return false;
    if (this.runwayBlocker(flight.runway, flight.id)) return false;
    // Runway-entry clearance commits the aircraft to the protected runway
    // corridor; do not reintroduce the pre-entry sweep as a second gate.
    if (!flight.runwayEntryCleared && this.departurePathBlocker(flight))
      return false;
    if (flight.phase === "taxi-out") {
      return !this.nextUnclearedCrossing(flight);
    }
    if (flight.phase !== "takeoff") return false;
    const hazard = this.state.weather.activeHazard;
    if (
      hazard?.status === "active" &&
      hazard.operation === "departure" &&
      hazard.runwayId === flight.runway
    ) {
      return false;
    }
    if (!this.assessTakeoffPerformance(flight).safe) return false;
    return this.runwayReleaseBlocker(flight, "departure") === null;
  }

  private towerDepartureReleaseDetail(flight: Flight): string {
    const entry = this.state.trafficFlow.departureQueue.find(
      (candidate) => candidate.flightId === flight.id,
    );
    const slot = Math.max(
      entry?.releaseSlotSeconds ?? flight.flightPlan.scheduledReleaseSeconds,
      this.state.trafficFlow.nextDepartureReleaseSeconds,
    );
    const releaseIn = Math.max(0, slot - this.state.elapsed);
    const queuePosition = entry
      ? this.state.trafficFlow.departureQueue.indexOf(entry) + 1
      : 0;
    if (releaseIn <= 0.5)
      return queuePosition > 1
        ? `Departure window open; queue position ${queuePosition}.`
        : "Departure release window open.";
    return `Planned departure release in ${Math.ceil(releaseIn)} seconds${queuePosition ? `; queue position ${queuePosition}` : ""}.`;
  }

  private seedInitialTraffic(): void {
    // ORD needs a visibly active opening bank. The imported field has enough
    // stands and independent taxi corridors to support a fuller initial
    // picture; subsequent demand is still admitted only through the same
    // flow meter, stand allocator, runway protection, and surface arbiter.
    const openingHubTarget = this.config.code === "ORD" ? 10 : 8;
    const baseTarget =
      this.config.scope === "center"
        ? Math.min(
            openingHubTarget,
            Math.max(5, Math.floor(this.config.surfaceGraph.stands.length / 2)),
          )
        : 1;
    const target = Math.min(
      this.effectiveTrafficCap(),
      Math.max(
        1,
        Math.round(
          baseTarget *
            Math.min(
              1.45,
              trafficDensityProfile(this.state.trafficFlow.density)
                .activeTrafficMultiplier,
            ),
        ),
      ),
    );
    const departureRunways = this.config.runways.filter((runway) => {
      const role = this.runwayRole(runway.id);
      return role === "departure" || role === "mixed";
    });
    if (!departureRunways.length) return;
    const operationState = this.operationStateAt();
    const requestedDepartures = Math.max(
      1,
      Math.round(target * operationState.mix.departureShare),
    );
    // A hub opens with both sides of the operation visible. Reserving one
    // initial entity slot for an approach also prevents a departure-only bank
    // from filling the active-traffic cap before the first arrival demand can
    // enter terminal airspace.
    const maximumOpeningDepartures = target >= 2 ? target - 1 : target;
    // Two moving departures establish simultaneous hub flow at every large
    // airport. ORD alone adds a bounded gate/ramp bank behind them, matching
    // its denser imported surface and stand graph without overfilling final.
    // ORD can open with a real gate/ramp bank while retaining only a small,
    // believable number of aircraft on final. These additional starters are
    // parked or taxiing departures, not extra arrivals injected into the
    // approach stack.
    const openingDepartureLimit =
      this.config.code === "ORD" && target >= 7 ? 7 : 2;
    const departureTarget = Math.min(
      maximumOpeningDepartures,
      openingDepartureLimit,
      requestedDepartures,
    );
    const liveTurnAtStartup =
      this.config.code === "ORD" && departureTarget >= 3;
    let seeded = 0;
    let attempts = 0;
    const maximumAttempts = target * 4;
    while (seeded < target && attempts < maximumAttempts) {
      const index = seeded;
      const candidateId = this.nextId;
      attempts += 1;
      // Departure starters must not consume an arrival approach position while
      // they are being prepared for their gate and taxi route. They still use
      // the normal aircraft, stand, runway-performance, and surface planning
      // admission path; staging only avoids treating a parked departure as a
      // temporary inbound aircraft during this one startup pass.
      const aircraft = this.spawnFlight({
        stagingDeparture: index < departureTarget,
      });
      if (!aircraft) {
        // Performance and stand planning can reject a particular deterministic
        // traffic-program candidate while advancing to the next one. Preserve
        // the initial bank in that case; stop only when retrying would repeat
        // the same admission decision against unchanged airport state.
        if (this.nextId === candidateId) break;
        continue;
      }
      const flight = this.state.flights[this.state.flights.length - 1];
      if (index >= departureTarget) {
        seeded += 1;
        syncFlightMotion(this.config, flight);
        continue;
      }
      const compatible = departureRunways.filter((runway) =>
        this.runwaySupportsCurrentCondition(runway, aircraft, "takeoff"),
      );
      if (!flight || !compatible.length) {
        seeded += 1;
        continue;
      }
      const runway = compatible[index % compatible.length];
      // A center-scale hub opens with two departures already moving on
      // independently reserved taxi routes. ORD also keeps a live turn plus
      // a bounded set of gate departures so the ramp remains active; smaller
      // schematics keep a single taxiing departure for their limited geometry.
      const taxiing =
        index <
        (this.config.scope === "center" ? Math.min(2, departureTarget) : 1);
      const servicing = liveTurnAtStartup && index === 2;
      flight.runway = runway.id;
      flight.departureRunway = runway.id;
      flight.operatingEnd = this.preferredOperatingEnd(runway.id);
      flight.runwayExit = undefined;
      flight.palette = runway.color;
      flight.phase = taxiing ? "taxi-out" : "resting";
      flight.progress = 0;
      flight.phaseElapsed = 0;
      flight.cleared = true;
      flight.clearanceLeft = 99;
      // The generated gate assignment may carry a later scheduled turn from
      // its former inbound leg. Establish the opening-bank release before
      // constructing its departure flight plan; otherwise a taxiing starter
      // reaches the hold line and waits for that stale, many-minute schedule.
      if (flight.gateAssignment)
        flight.gateAssignment.scheduledDepartureSeconds =
          this.state.elapsed + (taxiing ? 0 : 8);
      this.prepareDepartureFlightPlan(
        flight,
        taxiing ? this.state.elapsed : this.state.elapsed + 8,
        true,
        runway.id,
      );
      flight.kinematics.fuelPercent = flight.turnaround.targetFuelPercent;
      flight.kinematics.altitudeFt = 0;
      flight.kinematics.airspeedKts = 0;
      flight.kinematics.groundSpeedKts = 0;
      flight.runwayEntryCleared = false;
      flight.takeoffCleared = false;
      flight.pushbackCleared = taxiing;
      flight.pushbackProgress = taxiing ? 1 : 0;
      flight.tugAttached = false;
      flight.engineState = taxiing ? "running" : "off";
      flight.holdShortRunway = taxiing ? runway.id : undefined;
      if (!taxiing) {
        const gateReady = this.ensureArrivalGate(flight);
        const standAlreadyOccupied = this.state.flights.some(
          (candidate) =>
            candidate.id !== flight.id &&
            candidate.standId === flight.standId &&
            (candidate.phase === "taxi-in" ||
              candidate.phase === "resting" ||
              (candidate.phase === "taxi-out" &&
                (candidate.tugAttached || candidate.pushbackProgress < 1))),
        );
        if (!gateReady || standAlreadyOccupied) {
          this.state.flights = this.state.flights.filter(
            (candidate) => candidate.id !== flight.id,
          );
          this.events = this.events.filter(
            (event) => event.flight.id !== flight.id,
          );
          continue;
        }
      }
      this.assignSurfaceRoute(flight, flight.phase);
      if (!taxiing && flight.phase === "resting") {
        const routeConflictingStandIds =
          this.standsConflictingWithActiveSurfaceRoutes(flight);
        if (
          flight.standId &&
          routeConflictingStandIds.has(flight.standId) &&
          !this.reassignArrivalGate(
            flight,
            "opening-bank stand conflicts with an active taxi corridor",
            routeConflictingStandIds,
          )
        ) {
          this.state.flights = this.state.flights.filter(
            (candidate) => candidate !== flight,
          );
          this.events = this.events.filter(
            (event) => event.flight.id !== flight.id,
          );
          continue;
        }
        this.assignSurfaceRoute(flight, "resting");
      }
      if (taxiing) {
        completeTurnaround(flight.turnaround, this.state.elapsed);
        flight.requiredCrossings = surfaceRouteRunwayCrossings(
          this.config.surfaceGraph,
          flight.surfaceRouteEdges,
          flight.runway,
        );
        flight.crossingClearances = [];
        flight.crossingClearanceIds = [];
        const desired =
          this.config.scope === "center"
            ? 0.8 - index * 0.08
            : 0.62 - index * 0.08;
        const safeProgress =
          [desired, desired - 0.08, 0.64, 0.52, 0.4, 0.28, 0.16, 0.08, 0].find(
            (progress) => {
              flight.progress = progress;
              syncFlightMotion(this.config, flight);
              return (
                findObstacleConflicts(this.config, [flight]).length === 0 &&
                findFlightConflicts(this.config, this.state.flights).length ===
                  0
              );
            },
          ) ?? 0;
        // A zero-progress result means every representative in-motion pose was
        // unsafe against the rest of the opening bank. Do not label an
        // aircraft parked at its stand as an active taxi-out mover: it can
        // otherwise own one direction of a ramp lane while the aircraft that
        // must clear that lane is collision-held against its parked envelope.
        // Keep it gate-ready and let the normal route-aware pushback arbiter
        // release it once the opposing movement has passed.
        if (safeProgress <= 1e-6) {
          flight.phase = "resting";
          flight.progress = 1;
          flight.phaseElapsed = flight.turnaround.plannedDurationSeconds;
          flight.duration = flight.turnaround.plannedDurationSeconds;
          flight.pushbackCleared = false;
          flight.pushbackProgress = 0;
          flight.tugAttached = false;
          flight.engineState = "off";
          flight.requiredCrossings = [];
          flight.crossingClearances = [];
          flight.crossingClearanceIds = [];
          const routeConflictingStandIds =
            this.standsConflictingWithActiveSurfaceRoutes(flight);
          if (
            flight.standId &&
            routeConflictingStandIds.has(flight.standId) &&
            !this.reassignArrivalGate(
              flight,
              "opening-bank stand conflicts with an active taxi corridor",
              routeConflictingStandIds,
            )
          ) {
            this.state.flights = this.state.flights.filter(
              (candidate) => candidate !== flight,
            );
            this.events = this.events.filter(
              (event) => event.flight.id !== flight.id,
            );
            continue;
          }
          this.assignSurfaceRoute(flight, "resting");
          flight.navigation.frequencyOwner = "ramp";
          flight.navigation.handoff = undefined;
          flight.navigation.handoffStatus = "owned";
          if (flight.gateAssignment) {
            flight.gateAssignment.actualGateInSeconds ??=
              flight.turnaround.actualStartSeconds ?? 0;
            flight.gateAssignment.scheduledGateInSeconds =
              flight.gateAssignment.actualGateInSeconds;
            flight.gateAssignment.actualGateOutSeconds = undefined;
            flight.gateAssignment.scheduledDepartureSeconds =
              this.state.elapsed;
          }
          syncFlightMotion(this.config, flight);
          this.events.push({
            type: "surface-reroute",
            flight,
            taxiway: flight.taxiway,
            detail:
              "opening-bank taxi placement deferred at the stand until its ramp lane is clear",
          });
          seeded += 1;
          continue;
        }
        releaseTurnaround(flight.turnaround, this.state.elapsed);
        flight.progress = safeProgress;
        const completedCrossings = surfaceRouteCrossingWindows(
          this.config.surfaceGraph,
          flight.surfaceRoute,
          safeProgress,
          flight.runway,
          flight.surfaceRouteEdges,
        ).filter((crossing) => crossing.exitProgress < safeProgress);
        flight.crossingClearanceIds = completedCrossings.map(
          (crossing) => crossing.id,
        );
        flight.crossingClearances = [
          ...new Set(completedCrossings.map((crossing) => crossing.runwayId)),
        ];
        flight.phaseElapsed = flight.duration * flight.progress;
        flight.pushbackProgress = Math.max(
          0,
          Math.min(
            1,
            flight.progress / Math.max(0.001, flight.pushbackReleaseProgress),
          ),
        );
        flight.tugAttached = flight.pushbackProgress < 1;
        flight.engineState =
          flight.pushbackProgress < 0.62 ? "starting" : "running";
        if (flight.gateAssignment && flight.pushbackProgress >= 1) {
          flight.gateAssignment.actualGateInSeconds ??=
            flight.turnaround.actualStartSeconds ?? 0;
          flight.gateAssignment.scheduledGateInSeconds =
            flight.gateAssignment.actualGateInSeconds;
          flight.gateAssignment.actualGateOutSeconds = this.state.elapsed;
          flight.gateAssignment.scheduledDepartureSeconds = this.state.elapsed;
        }
        this.updateSurfaceRouteState(flight);
        // Startup traffic is already positioned partway through a real taxi
        // route, so its pre-simulation Ramp → Ground coordination has already
        // happened. Begin with the controller that owns its current surface
        // zone instead of recording a missed handoff on the first live tick.
        flight.navigation.frequencyOwner = requiredControllerStation(flight);
        flight.navigation.handoff = undefined;
        flight.navigation.handoffStatus = "owned";
      } else if (servicing) {
        this.confirmGateArrival(flight);
      } else {
        completeTurnaround(flight.turnaround, this.state.elapsed);
        flight.progress = 1;
        flight.phaseElapsed = flight.duration;
        if (flight.gateAssignment) {
          flight.gateAssignment.actualGateInSeconds =
            flight.turnaround.actualStartSeconds ??
            this.state.elapsed - flight.duration;
          flight.gateAssignment.scheduledGateInSeconds =
            flight.gateAssignment.actualGateInSeconds;
          flight.gateAssignment.scheduledDepartureSeconds =
            this.state.elapsed + 8;
        }
      }
      syncFlightMotion(this.config, flight);
      this.events = this.events.filter(
        (event) =>
          !(event.flight.id === flight.id && event.type === "auto-clear"),
      );
      seeded += 1;
    }
  }

  private spawnFlight(
    options: {
      trafficClass?: OperationTrafficClass;
      requestedArrivalRunwayId?: number;
      stagingDeparture?: boolean;
    } = {},
  ): AircraftModel | null {
    if (this.state.runwayConfigurationTransition) {
      this.lastArrivalAdmissionReason = `runway plan transition is draining ${this.state.runwayConfigurationTransition.blockingFlightIds.length} protected flight${this.state.runwayConfigurationTransition.blockingFlightIds.length === 1 ? "" : "s"}`;
      return null;
    }
    const approachLimit = this.weatherApproachCapacity();
    if (
      !options.stagingDeparture &&
      this.state.flights.filter(
        (flight) => flight.phase === "approach" || flight.phase === "landing",
      ).length >= approachLimit
    ) {
      this.lastArrivalAdmissionReason = `${approachLimit} approach position${approachLimit === 1 ? "" : "s"} occupied`;
      return null;
    }
    const id = this.nextId;
    const operationState = this.operationStateAt();
    const trafficClass =
      options.trafficClass ??
      selectOperationTrafficClass(operationState, id, this.config.seed);
    const trafficSelection = selectTrafficProgram(this.config.trafficProgram, {
      trafficClass,
      direction: "arrival",
      periodId: operationState.periodId,
      flightId: id,
      airportSeed: this.config.seed,
      supportsAircraft: (model) => this.hasUsableRunwayPair(model),
    });
    const airlineCode = trafficSelection.airline;
    const aircraft = trafficSelection.aircraft;
    const arrivalRunways = this.config.runways.filter(
      (runway) =>
        (this.runwayRole(runway.id) === "arrival" ||
          this.runwayRole(runway.id) === "mixed") &&
        !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id) &&
        this.runwaySupportsCurrentCondition(runway, aircraft, "landing"),
    );
    const unblocked = options.stagingDeparture
      ? arrivalRunways
      : arrivalRunways.filter((runway) => !this.arrivalBlocked(runway.id));
    const releaseReasons = new Map<number, string | null>(
      unblocked.map((runway) => [
        runway.id,
        runwayReleaseReason(
          separationRuleset(this.state.separationRuleset),
          this.config,
          this.runwayOperationHistory,
          this.state.elapsed,
          {
            runwayId: runway.id,
            operatingEnd: this.preferredOperatingEnd(runway.id),
            kind: "arrival",
            wakeClass: aircraftProfile(aircraft).wakeClass,
          },
        ),
      ]),
    );
    const released = options.stagingDeparture
      ? unblocked
      : unblocked.filter((runway) => !releaseReasons.get(runway.id));
    const usable = released.filter(
      (runway) => this.headwindComponent(runway.id) >= -5,
    );
    let candidates = (usable.length ? usable : released).sort(
      (first, second) =>
        this.headwindComponent(second.id) - this.headwindComponent(first.id) ||
        // Parallel runway ends commonly have the same wind component. Prefer
        // the longer pavement in that tie so heavy arrivals retain enough room
        // to reach a graph-connected, performance-safe exit.
        second.length - first.length ||
        first.id - second.id,
    );
    if (options.requestedArrivalRunwayId !== undefined) {
      candidates = candidates.filter(
        (runway) => runway.id === options.requestedArrivalRunwayId,
      );
      if (!candidates.length) {
        this.lastArrivalAdmissionReason = `${this.activeRunwayDesignation(options.requestedArrivalRunwayId)} cannot accept the requested arrival under current configuration, weather, separation, or aircraft performance`;
        return null;
      }
    }
    if (candidates.length === 0) {
      const spacing = [...releaseReasons.values()].find(
        (reason): reason is string => Boolean(reason),
      );
      this.lastArrivalAdmissionReason =
        spacing ?? "no wind-compatible arrival runway is available";
      return null;
    }

    const runway = candidates[0].id;
    const runwayConfig = this.config.runways[runway];
    const departureRunways = this.config.runways.filter(
      (item) =>
        (this.runwayRole(item.id) === "departure" ||
          this.runwayRole(item.id) === "mixed") &&
        !runwayClosedByDisruption(this.state.surfaceDisruptions, item.id) &&
        this.runwaySupportsCurrentCondition(item, aircraft, "takeoff"),
    );
    if (departureRunways.length === 0) {
      this.lastArrivalAdmissionReason = `${aircraft} has no compatible onward departure runway`;
      return null;
    }
    const departureRunway = [...departureRunways].sort(
      (first, second) =>
        this.headwindComponent(second.id) - this.headwindComponent(first.id),
    )[(id - 1) % departureRunways.length].id;
    const airline = airlineProfile(airlineCode);
    const profile = aircraftProfile(aircraft);
    const flightNumber = 100 + ((id * 37 + Math.abs(this.config.seed)) % 890);
    const registration = this.registrationFor(airlineCode, id);
    const service =
      airline.cargo || profile.category === "cargo" ? "cargo" : "passenger";
    const approachDuration = this.phaseDuration(aircraft, "approach", runway);
    const operatingEnd = this.preferredOperatingEnd(runway);
    const departureSelection = selectTrafficProgram(
      this.config.trafficProgram,
      {
        trafficClass,
        direction: "departure",
        periodId: operationState.periodId,
        flightId: id + 5_000,
        airportSeed: this.config.seed,
        supportsAircraft: (model) => this.hasUsableRunwayPair(model),
      },
    );
    const origin = trafficSelection.market;
    const nextDestination = departureSelection.market;
    const operationalDetail = createAircraftOperationalDetail({
      flightId: id,
      airportSeed: this.config.seed,
      aircraft,
      service,
      trafficClass,
      origin,
      destination: nextDestination,
    });
    const fuelPlan = createFlightFuelPlan({
      aircraft,
      arrivalOrigin: origin,
      airportCode: this.config.code === "LOCAL" ? "LOCAL" : this.config.code,
      departureDestination: nextDestination,
      trafficClass,
      flightId: id,
      airportSeed: this.config.seed,
    });
    const initialFuelPercent = fuelPlan.modeledArrivalFuelPercent;
    const turnaround = createTurnaroundPlan({
      flightId: id,
      airportSeed: this.config.seed,
      aircraft,
      service,
      fuelPercent: initialFuelPercent,
      targetFuelPercent: fuelPlan.departure.dispatchFuelPercent,
      scope: this.config.scope,
      scheduledGateInSeconds: 0,
      operationalDetail,
    });
    const gateAssignment = planGateAssignment({
      config: this.config,
      flightId: id,
      aircraft,
      airline: airlineCode,
      service,
      trafficClass,
      arrivalRunway: runway,
      arrivalOperatingEnd: operatingEnd,
      departureRunway,
      departureOperatingEnd: this.preferredOperatingEnd(departureRunway),
      readyForTaxiAtSeconds:
        this.state.elapsed +
        approachDuration +
        this.phaseDuration(aircraft, "landing", runway),
      turnaroundSeconds: turnaround.plannedDurationSeconds,
      nextDestination,
      assignedAtSeconds: this.state.elapsed,
      reservations: this.gateReservations(),
      planning: this.surfaceRoutePlanning(id),
    });
    if (!gateAssignment) {
      this.lastArrivalAdmissionReason = `no time-compatible ${service} stand is available for ${aircraft}`;
      return null;
    }
    scheduleTurnaround(turnaround, gateAssignment.scheduledGateInSeconds);
    const gateSlot = gateAssignment.gateSlot;
    const stand = this.config.surfaceGraph.stands.find(
      (candidate) => candidate.id === gateAssignment.standId,
    );
    const operationPlan = this.createOperationPlan(
      "arrival",
      trafficClass,
      operationState,
    );
    const selectedProcedure = this.terminalProcedure("STAR", runway, id);
    const procedure = selectedProcedure.procedure.name;
    const flightPlan = createFlightPlan({
      flightId: id,
      legNumber: 1,
      direction: "arrival",
      origin,
      destination: this.config.code === "LOCAL" ? "LOCAL" : this.config.code,
      procedureSelection: selectedProcedure,
      procedureDataVersion: this.config.airspaceProgram.dataVersion,
      airline: airlineCode,
      aircraft,
      trafficClass,
      gateAssignment,
      runwayId: runway,
      operatingEnd,
      runwayDesignation: this.activeRunwayDesignation(runway),
      createdAtSeconds: this.state.elapsed,
      scheduledReleaseSeconds: this.state.elapsed,
      estimatedArrivalSeconds:
        this.state.elapsed +
        approachDuration +
        this.phaseDuration(aircraft, "landing", runway),
      airportSeed: this.config.seed,
    });
    const flight: Flight = {
      id,
      callsign: `${airline.callsign} ${flightNumber}`,
      palette: runwayConfig.color,
      runway,
      departureRunway,
      operatingEnd,
      phase: "approach",
      progress: 0,
      phaseElapsed: 0,
      duration: approachDuration,
      cleared: false,
      clearanceLeft: approachDuration * 0.96,
      gateSlot,
      gateAssignment,
      pushbackCleared: false,
      pushbackDirection: stand?.pushbackDirection ?? "straight",
      pushbackProgress: 0,
      pushbackReleaseProgress: 0,
      tugAttached: false,
      engineState: "running",
      aircraft,
      airline: airlineCode,
      flightNumber,
      registration,
      service,
      operationPlan,
      flightPlan,
      flightPlanHistory: [],
      navigation: this.navigationFor(selectedProcedure, "arrival"),
      fuelPlan,
      turnaround,
      operationalDetail,
      deicing: createDeicingState(),
      category: profile.category,
      wakeClass: profile.wakeClass,
      procedure,
      origin,
      destination: this.config.code === "LOCAL" ? "LOCAL" : this.config.code,
      squawk: String(4300 + ((id * 37) % 700)).padStart(4, "0"),
      kinematics: {
        airspeedKts: profile.approachKts + 24,
        groundSpeedKts: profile.approachKts + 24,
        altitudeFt: this.approachStartAltitude(aircraft),
        verticalSpeedFpm: -profile.descentFpm,
        accelerationMps2: 0,
        fuelPercent: initialFuelPercent,
      },
      motion: {
        x: 0,
        y: 0,
        z: 2,
        heading: 0,
        pitch: 0,
        bank: 0,
        onGround: false,
        groundBlend: 0,
        protectedRunway: false,
        protectedRunwayIds: [],
        distanceAlongM: 0,
        totalDistanceM: 0,
        stageProgress: 0,
      },
    };
    flight.standId = gateAssignment.standId;
    if (!this.planRunwayExit(flight, "initial arrival plan", false)) {
      // Do not let one performance/weather mismatch become a permanent
      // head-of-line blocker for the continuous arrival stream.
      this.nextId += 1;
      this.lastArrivalAdmissionReason = `${aircraft} has no safe exit under the current runway condition`;
      return null;
    }
    syncFlightMotion(this.config, flight);
    flight.kinematics.altitudeFt = this.motionAltitudeFt(flight);

    // Do not inject a new arrival whose low-altitude/final rollout sweep is
    // already occupied by surface traffic. The stream will retry on the next
    // spawn interval after the protected corridor clears.
    const pathBlocker = options.stagingDeparture
      ? null
      : this.arrivalPathBlocker(flight);
    if (pathBlocker) {
      this.lastArrivalAdmissionReason = `protected arrival sweep occupied by ${pathBlocker.callsign}`;
      return null;
    }

    if (this.state.scenario === "emergency" && id === 1)
      flight.emergency = "medical";

    this.nextId += 1;
    this.lastArrivalAdmissionReason = `${flight.callsign} admitted to ${this.activeRunwayDesignation(runway)}`;
    this.state.flights.push(flight);
    this.events.push({ type: "spawn", flight });
    this.events.push({
      type: "gate-assignment",
      flight,
      detail: `${gateAssignment.gateRef ?? gateAssignment.zoneName ?? gateAssignment.standId} planned · ${gateAssignment.rationale.slice(0, 2).join(" · ")}`,
    });
    this.events.push({
      type: "runway-exit-plan",
      flight,
      runway: flight.runway,
      taxiway: flight.runwayExit?.taxiwayName,
      detail: this.runwayExitDetail(flight.runwayExit, "initial arrival plan"),
    });
    if (flight.emergency) this.events.push({ type: "emergency", flight });
    return aircraft;
  }

  private advance(flight: Flight): void {
    if (flight.phase === "approach" && flight.diversion) {
      this.archiveFlightPlan(flight);
      this.events.push({
        type: "divert",
        flight,
        detail: `${flight.callsign} left terminal scope for ${flight.diversion.airportCode}`,
      });
      this.state.flights = this.state.flights.filter((item) => item !== flight);
      this.state.serviceVehicles = this.state.serviceVehicles.filter(
        (vehicle) => vehicle.flightId !== flight.id,
      );
      this.releaseFlightRuntimeState(flight);
      return;
    }
    if (flight.phase === "approach" && flight.navigation.hold) {
      flight.navigation.hold.cycle += 1;
      flight.progress = 0;
      flight.phaseElapsed = 0;
      syncFlightMotion(this.config, flight);
      return;
    }
    if (flight.phase === "approach" && flight.goAround) {
      flight.goAround = undefined;
      flight.progress = 0;
      flight.phaseElapsed = 0;
      flight.duration = this.phaseDuration(
        flight.aircraft,
        "approach",
        flight.runway,
      );
      flight.cleared = false;
      flight.navigation.approachCleared = false;
      flight.clearanceLeft = flight.duration * 0.96;
      syncFlightMotion(this.config, flight);
      flight.kinematics.altitudeFt = this.motionAltitudeFt(flight);
      return;
    }
    if (flight.phase === "takeoff") {
      this.state.departures += 1;
      this.metrics.safeDepartures += 1;
      flight.flightPlan.status = "completed";
      this.archiveFlightPlan(flight);
      removeDepartureDemand(this.state.trafficFlow, flight.id);
      this.events.push({ type: "depart", flight });
      this.state.flights = this.state.flights.filter((item) => item !== flight);
      this.state.serviceVehicles = this.state.serviceVehicles.filter(
        (vehicle) => vehicle.flightId !== flight.id,
      );
      this.releaseFlightRuntimeState(flight);
      return;
    }

    if (flight.phase === "resting" && !flight.pushbackCleared) return;

    const next = NEXT_PHASE[flight.phase];
    if (!next) return;
    if (
      next === "landing" &&
      !this.planRunwayExit(flight, "final approach refresh")
    ) {
      this.goAround(
        flight,
        "no safe runway exit is available for the current braking action",
      );
      return;
    }
    if (next === "landing") {
      const pathBlocker = this.arrivalPathBlocker(flight);
      if (pathBlocker) {
        this.goAround(
          flight,
          `refreshed landing sweep is occupied by ${pathBlocker.callsign} ${pathBlocker.phase}`,
        );
        return;
      }
    }
    if (next === "taxi-out") {
      if (this.state.runwayConfigurationTransition) return;
      this.prepareDepartureFlightPlan(flight);
      const departureRunway = this.selectDepartureRunway(flight);
      if (departureRunway === null) return;
      const departureProcedure = this.terminalProcedure(
        "SID",
        departureRunway,
        flight.id + flight.flightPlanHistory.length * 101,
      );
      if (flight.flightPlan.runwayIntent.runwayId !== departureRunway) {
        const detail = `runway ${flight.flightPlan.runwayIntent.designation} → ${this.activeRunwayDesignation(departureRunway)} for current configuration and wind`;
        amendFlightPlan(
          flight.flightPlan,
          "runway-change",
          this.state.elapsed,
          detail,
          {
            procedureSelection: departureProcedure,
            procedureDataVersion: this.config.airspaceProgram.dataVersion,
            runwayIntent: {
              runwayId: departureRunway,
              operatingEnd: this.preferredOperatingEnd(departureRunway),
              designation: this.activeRunwayDesignation(departureRunway),
            },
          },
        );
        this.state.trafficFlow.totals.runwayChanges += 1;
      }
      flight.departureRunway = departureRunway;
      flight.runway = departureRunway;
      flight.operatingEnd = this.preferredOperatingEnd(flight.runway);
      flight.runwayExit = undefined;
      flight.palette = this.config.runways[flight.runway].color;
      flight.holdShortRunway = flight.runway;
      flight.holdNotified = false;
      flight.runwayEntryCleared = false;
      flight.takeoffCleared = false;
      flight.requiredCrossings = [];
      flight.crossingClearances = [];
      flight.crossingClearanceIds = [];
      flight.origin = this.config.code === "LOCAL" ? "LOCAL" : this.config.code;
      flight.destination = flight.flightPlan.destination;
      flight.procedure = departureProcedure.procedure.name;
      flight.navigation = this.navigationFor(departureProcedure, "departure");
      flight.operationPlan = this.createOperationPlan(
        "departure",
        flight.operationPlan.trafficClass,
      );
      if (flight.gateAssignment)
        flight.gateAssignment.departureRunway = departureRunway;
    }
    if (next === "takeoff") {
      // Holdover expiry is an aircraft state transition, not a runway-capacity
      // decision. Start the return-to-pad cycle immediately even when wake,
      // configuration, or runway-spacing rules are still withholding release;
      // otherwise an expired aircraft can remain parked at the hold-short line
      // forever behind an unrelated departure gate.
      if (
        !deicingReleaseValid(flight, this.state.weather, this.state.elapsed)
      ) {
        if (flight.deicing.status === "expired") this.returnForDeicing(flight);
        return;
      }
      if (!flight.holdNotified) {
        flight.holdNotified = true;
        this.events.push({
          type: "hold-short",
          flight,
          runway: flight.runway,
          taxiway: flight.taxiway,
        });
      }
      const crossingClear = !this.nextUnclearedCrossing(flight);
      if (!flight.runwayEntryCleared || !crossingClear) return;
      if (!this.departureReleaseReady(flight) || !this.reserveDeparture(flight))
        return;
    }
    if (next === "taxi-in" && !this.ensureArrivalGate(flight)) {
      flight.safetyHold = true;
      flight.safetyHoldReason =
        "no conflict-free stand is available for taxi-in";
      return;
    }
    const transitionConflict = this.transitionConflict(flight, next);
    if (transitionConflict) {
      flight.safetyHold = true;
      flight.safetyHoldReason = transitionConflict;
      return;
    }
    flight.phase = next;
    flight.progress = 0;
    flight.phaseElapsed = 0;
    flight.controlPace = 1;
    flight.controlHold = false;
    flight.automaticHold = false;
    flight.automaticHoldReason = undefined;
    flight.surfaceYield = undefined;
    flight.controlPattern = undefined;
    flight.controlPatternStart = undefined;
    flight.duration = this.phaseDuration(
      flight.aircraft,
      next,
      flight.runway,
      flight.runwayExit,
    );
    if (next === "taxi-in" || next === "resting" || next === "taxi-out") {
      const cached = this.phaseTransitionPreviewCache.get(flight)?.get(next);
      const signature = this.surfacePlanCacheSignature(flight, next);
      if (cached?.signature === signature)
        this.adoptSurfaceRoutePreview(flight, cached.preview);
      else this.assignSurfaceRoute(flight, next);
      if (next === "taxi-out")
        flight.requiredCrossings = surfaceRouteRunwayCrossings(
          this.config.surfaceGraph,
          flight.surfaceRouteEdges,
          flight.runway,
        );
    }
    this.phaseTransitionPreviewCache.delete(flight);

    if (next === "taxi-in") {
      flight.pushbackCleared = false;
      flight.pushbackProgress = 0;
      flight.tugAttached = false;
      flight.engineState = "running";
    }
    if (next === "resting") {
      flight.pushbackCleared = false;
      flight.pushbackProgress = 0;
      flight.tugAttached = false;
      flight.engineState = "off";
      this.confirmGateArrival(flight);
      this.prepareDepartureFlightPlan(
        flight,
        flight.gateAssignment?.scheduledDepartureSeconds ?? this.state.elapsed,
      );
    }
    if (next === "taxi-out") {
      releaseTurnaround(flight.turnaround, this.state.elapsed);
      flight.pushbackProgress = 0;
      flight.tugAttached = true;
      flight.engineState = "starting";
      this.events.push({
        type: "pushback-start",
        flight,
        taxiway: flight.taxiway,
        detail: `tug attached · push ${flight.pushbackDirection}`,
      });
      this.events.push({
        type: "engine-start",
        flight,
        taxiway: flight.taxiway,
        detail: "engine start during pushback",
      });
      if (flight.deicing.required) {
        this.events.push({
          type: "deicing-planned",
          flight,
          taxiway: flight.taxiway,
          detail:
            flight.deicing.status === "unavailable"
              ? flight.deicing.reason
              : `${flight.deicing.facilityName} lane ${flight.deicing.laneNumber} · ${flight.deicing.fluid}`,
        });
      }
    }

    if (next === "taxi-in") {
      this.recordRunwayOperation(flight, "arrival");
      this.state.arrivals += 1;
      this.metrics.safeArrivals += 1;
      if (flight.emergency === "medical" || flight.emergency === "birdstrike") {
        this.metrics.emergencyResolutions += 1;
      }
      this.events.push({ type: "land", flight });
      this.events.push({ type: "chime", flight });
    }
    if (next === "takeoff") {
      if (flight.takeoffCleared)
        this.recordRunwayOperation(flight, "departure");
      flight.taxiway = undefined;
      flight.surfaceRoute = undefined;
      flight.surfaceRouteEdges = undefined;
      flight.surfaceRoutingCost = undefined;
      flight.surfaceCongestionPenalty = undefined;
      flight.surfaceCongestedEdgeIds = undefined;
      flight.surfaceNode = undefined;
      flight.surfaceEdge = undefined;
      flight.rampControlZoneId = undefined;
      flight.rampControlZoneName = undefined;
      flight.rampControlZoneCapacity = undefined;
      flight.surfaceAlleyId = undefined;
      flight.surfaceFlowDirection = undefined;
      flight.standPath = undefined;
      flight.holdShortRunway = undefined;
    }
    syncFlightMotion(this.config, flight);
  }

  private arrivalBlocked(runway: number): boolean {
    if (this.priorityRunwayCrossing(runway)) return true;
    for (const reservedRunway of this.runwayReservations.keys()) {
      if (this.runwaysConflict(runway, reservedRunway)) return true;
    }
    for (const flight of this.state.flights) {
      // A gate-ready aircraft does not reserve miles of runway pavement. A
      // runway-ready taxi-out below still meters new arrivals long enough to
      // create a departure gap.
      if (
        flight.phase === "taxi-out" &&
        flight.progress > 0.9 &&
        this.runwaysConflict(runway, flight.runway)
      )
        return true;
      if (
        flight.phase === "landing" &&
        this.runwaysConflict(runway, flight.runway)
      )
        return true;
      if (
        flight.motion.protectedRunwayIds.some((occupiedRunway) =>
          this.runwaysConflict(runway, occupiedRunway),
        )
      )
        return true;
      if (
        flight.phase === "approach" &&
        this.runwaysConflict(runway, flight.runway)
      ) {
        return true;
      }
    }
    return false;
  }

  private updateControllerHandoffDeadlines(): void {
    for (const flight of this.state.flights) {
      const handoff = flight.navigation.handoff;
      if (
        handoff?.status === "offered" &&
        this.state.elapsed + 1e-6 >= handoff.responseDueSeconds
      ) {
        this.markHandoffOverdue(flight, "coordination response window expired");
      }

      const required = requiredControllerStation(flight);
      const owner = flight.navigation.frequencyOwner;
      const ownerAhead = controllerStationIsAhead(flight, owner, required);
      const active = this.activeHandoff(flight);
      const currentHandoff = flight.navigation.handoff;
      const terminalAt =
        currentHandoff?.completedAtSeconds ??
        currentHandoff?.respondedAtSeconds ??
        -Infinity;
      const retryReady =
        !currentHandoff ||
        this.state.elapsed - terminalAt >= HANDOFF_RETRY_SECONDS;
      if (
        !active &&
        owner !== required &&
        !ownerAhead &&
        isOperationalControllerStation(owner) &&
        retryReady
      ) {
        const target = nextControllerStation(flight, owner) ?? required;
        this.beginHandoff(
          flight,
          target,
          owner,
          `missed ${owner} → ${target} handoff at control boundary`,
          true,
        );
      }
    }
  }

  private runScriptedControllers(): void {
    const runtime = this.state.scriptedControllers;
    let evaluations = 0;
    while (
      this.state.elapsed + 1e-6 >= runtime.nextEvaluationAtSeconds &&
      evaluations < 8
    ) {
      runtime.cycle += 1;
      runtime.lastEvaluatedAtSeconds = this.state.elapsed;
      runtime.nextEvaluationAtSeconds += runtime.cadenceSeconds;
      refreshScriptedControllerModes(this.state, runtime);

      for (const station of CONTROLLER_STATIONS) {
        const stationRuntime = runtime.stations[station];
        if (stationRuntime.mode !== "scripted") continue;
        stationRuntime.evaluations += 1;
        stationRuntime.lastEvaluatedAtSeconds = this.state.elapsed;
        const actions = planScriptedControllerActions(
          this.config,
          this.state,
          station,
          runtime,
        );
        for (const action of actions)
          this.resolveScriptedControllerAction(action);
      }
      evaluations += 1;
    }
    if (
      evaluations === 8 &&
      runtime.nextEvaluationAtSeconds <= this.state.elapsed
    ) {
      runtime.nextEvaluationAtSeconds =
        this.state.elapsed + runtime.cadenceSeconds;
    }
  }

  private resolveScriptedControllerAction(
    action: ScriptedControllerPlannedAction,
  ): void {
    const runtime = this.state.scriptedControllers;
    const stationRuntime = runtime.stations[action.station];
    const flight = this.state.flights.find(
      (candidate) => candidate.id === action.flightId,
    );
    if (!flight) return;

    const decisionId = `controller-${runtime.nextDecisionSequence++}`;
    const selectedStation = this.state.station;
    const manualCommands = this.metrics.manualCommands;
    const previousReason = this.decisionReason;
    const eventCursor = this.events.length;
    let accepted = false;
    let deferred = false;

    this.state.station = action.station;
    try {
      if (action.action === "clear-approach")
        accepted = this.clearApproach(action.flightId);
      if (action.action === "clear-landing")
        accepted = this.clearFlight(
          action.flightId,
          action.runway ?? flight.runway,
        );
      if (action.action === "clear-pushback")
        accepted = this.clearPushback(action.flightId);
      if (action.action === "clear-runway-crossing") {
        accepted =
          action.runway !== undefined &&
          this.clearRunwayCrossing(action.flightId, action.runway);
      }
      if (action.action === "clear-runway-entry")
        accepted = this.clearRunwayEntry(action.flightId);
      if (action.action === "clear-takeoff")
        accepted = this.clearTakeoff(action.flightId);
      if (action.action === "offer-handoff") {
        accepted =
          action.targetStation !== undefined &&
          this.offerHandoff(action.flightId, action.targetStation);
      }
      if (action.action === "accept-handoff")
        accepted = this.acceptHandoff(action.flightId);
      if (action.action === "defer-handoff") {
        deferred = true;
        this.decisionReason = action.rationale;
      }
      if (action.action === "contact-handoff") {
        accepted =
          action.targetStation !== undefined &&
          this.contactFlight(action.flightId, action.targetStation);
      }
      if (action.action === "release-hold")
        accepted = this.releaseAirborneHold(action.flightId);
      if (action.action === "recover-disabled")
        accepted = this.recoverDisabledAircraft(action.flightId);
      if (action.action === "go-around")
        accepted = this.triggerEmergency(action.flightId, "go-around");
    } finally {
      this.state.station = selectedStation;
      this.metrics.manualCommands = manualCommands;
    }

    const result = this.decisionReason;
    const disposition = deferred
      ? "deferred"
      : accepted
        ? "accepted"
        : "rejected";
    const producedEventTypes = this.events
      .slice(eventCursor)
      .map((event) => event.type);
    this.tagControllerDecisionEventsSince(eventCursor, decisionId);
    const decision: ScriptedControllerDecision = {
      id: decisionId,
      cycle: runtime.cycle,
      station: action.station,
      action: action.action,
      flightId: flight.id,
      callsign: flight.callsign,
      runway: action.runway,
      targetStation: action.targetStation,
      ruleId: action.ruleId,
      priority: action.priority,
      rationale: action.rationale,
      plannedAtSeconds: this.state.elapsed,
      resolvedAtSeconds: this.state.elapsed,
      accepted,
      disposition,
      result,
      producedEventTypes,
    };
    runtime.decisions.push(decision);
    if (runtime.decisions.length > SCRIPTED_CONTROLLER_HISTORY_LIMIT) {
      runtime.decisions.splice(
        0,
        runtime.decisions.length - SCRIPTED_CONTROLLER_HISTORY_LIMIT,
      );
    }
    stationRuntime.planned += 1;
    stationRuntime.accepted += accepted ? 1 : 0;
    stationRuntime.rejected += disposition === "rejected" ? 1 : 0;
    stationRuntime.deferred += disposition === "deferred" ? 1 : 0;
    stationRuntime.lastDecisionId = decisionId;
    if (action.priority === "sequence" || action.priority === "routine") {
      stationRuntime.nextRoutineDecisionAtSeconds = Math.max(
        stationRuntime.nextRoutineDecisionAtSeconds,
        this.state.elapsed +
          stationRuntime.policy.minimumDecisionIntervalSeconds,
      );
    }
    this.events.push({
      type: "controller-decision",
      flight,
      runway: action.runway,
      taxiway: flight.taxiway,
      detail: `${action.station} ${action.action} ${disposition} · ${result}`,
      causedByControllerDecisionId: decisionId,
    });
    this.decisionReason = previousReason;
  }

  private tagControllerDecisionEventsSince(
    cursor: number,
    decisionId: string,
  ): void {
    const start = Math.max(0, Math.min(this.events.length, Math.trunc(cursor)));
    for (let index = start; index < this.events.length; index += 1) {
      this.events[index].causedByControllerDecisionId ??= decisionId;
    }
  }

  /**
   * Aircraft and service equipment share one ramp ledger. Auto/Watch also use
   * it for aircraft-to-aircraft sequencing; Manual retains controller traffic
   * authority while the safety layer still stops an aircraft from entering an
   * edge physically occupied by slower service equipment.
   */
  private coordinateAutomaticSurfaceTraffic(deltaSeconds: number): void {
    const surfaceFlights = this.state.flights.filter(
      (flight): flight is Flight & { phase: "taxi-in" | "taxi-out" } =>
        flight.phase === "taxi-in" || flight.phase === "taxi-out",
    );
    const committedRunwayCrossers = new Set(
      surfaceFlights
        .filter(
          (flight) => this.activeClearedCrossingRunways(flight).length > 0,
        )
        .map((flight) => flight.id),
    );
    const committedDepartures = this.state.flights.filter(
      (flight) =>
        flight.phase === "takeoff" ||
        (flight.phase === "taxi-out" &&
          flight.progress >= 0.985 &&
          flight.runwayEntryCleared),
    );
    const candidates = surfaceFlights
      .filter((flight) => flight.emergency !== "disabled")
      .filter((flight) => flight.surfaceReroute?.status !== "holding")
      .filter((flight) => flight.surfaceYield?.status !== "holding")
      .sort((first, second) => {
        if (Boolean(first.emergency) !== Boolean(second.emergency))
          return first.emergency ? -1 : 1;
        // A recovery is created only after its complete reverse sweep has
        // been sampled clear of aircraft, vehicles, obstacles, and runway
        // pavement. Let that tug movement reserve first so the forward mover
        // that caused the cycle cannot immediately reclaim the same corridor.
        if (Boolean(first.surfaceYield) !== Boolean(second.surfaceYield)) {
          return first.surfaceYield ? -1 : 1;
        }
        // Once a crossing clearance is issued, nothing beyond the runway may
        // take its downstream reservation away. Commitment begins at the hold
        // line—not after the nose enters protected pavement—so the aircraft
        // can cross continuously and vacate before ordinary sequencing resumes.
        if (
          committedRunwayCrossers.has(first.id) !==
          committedRunwayCrossers.has(second.id)
        ) {
          return committedRunwayCrossers.has(first.id) ? -1 : 1;
        }
        if (first.phase !== second.phase) {
          const firstWait = this.stationarySeconds.get(first.id) ?? 0;
          const secondWait = this.stationarySeconds.get(second.id) ?? 0;
          // Arrival flow is normally favored to clear runway exits. Once an
          // opposite-direction aircraft has waited long enough to represent a
          // real fairness failure, give it the next reservation opportunity.
          // This is deliberately bounded and still follows every physical,
          // runway, ramp, and collision constraint below.
          if (
            Math.max(firstWait, secondWait) >= 90 &&
            Math.abs(firstWait - secondWait) >= 30
          )
            return secondWait - firstWait;
          // Gate-bound traffic keeps priority until it is off the movement
          // area. In particular, a newly pushed outbound behind an inbound
          // must not reserve hundreds of metres through the inbound's exit.
          return first.phase === "taxi-in" ? -1 : 1;
        }
        if (Math.abs(first.progress - second.progress) > 1e-6) {
          // Within one traffic direction, clear the aircraft closest to its
          // destination first. A following mover then advances naturally as
          // each downstream corridor is released.
          return second.progress - first.progress;
        }
        // Preserve the winner of the previous collision-arbitration tick long
        // enough to clear a shared junction. Otherwise the graph ledger can
        // swap ownership back immediately and strand both aircraft nose to
        // nose at the merge.
        if (first.safetyHold !== second.safetyHold)
          return first.safetyHold ? 1 : -1;
        if (Math.abs(first.phaseElapsed - second.phaseElapsed) > 1e-6) {
          return second.phaseElapsed - first.phaseElapsed;
        }
        return first.id - second.id;
      });
    const reservations = new SurfaceReservationLedger();
    // Project current occupancy and near-term demand into the persistent
    // planner. It owns strategic section direction; the ledger below retains
    // physical edge/node/stand/runway conflict authority.
    const flowDemand = new Map<string, SurfaceFlowDemand>();
    for (const flight of surfaceFlights) {
      const occupiedClaims = surfaceRouteReservationClaims(
        this.config.surfaceGraph,
        flight.surfaceRoute,
        flight.surfaceRouteEdges,
        flight.progress,
        flight.phase,
        0,
        0,
      );
      const retainsDirectionalWindow =
        (this.stationarySeconds.get(flight.id) ?? 0) < 30 ||
        !(flight.automaticHold || flight.safetyHold || flight.controlHold);
      for (const claim of occupiedClaims) {
        if (claim.kind !== "taxiway-flow" || !claim.direction) continue;
        const key = `${claim.id}:${claim.direction}`;
        const current = flowDemand.get(key);
        flowDemand.set(key, {
          id: claim.id,
          label: claim.label,
          direction: claim.direction,
          active: retainsDirectionalWindow,
          count: (current?.count ?? 0) + 1,
        });
      }
      const demandClaims = surfaceRouteReservationClaims(
        this.config.surfaceGraph,
        flight.surfaceRoute,
        flight.surfaceRouteEdges,
        flight.progress,
        flight.phase,
        12,
        SURFACE_RESERVATION_LOOKAHEAD_M / WORLD_METERS_PER_UNIT,
      );
      for (const claim of demandClaims) {
        if (claim.kind !== "taxiway-flow" || !claim.direction) continue;
        const key = `${claim.id}:${claim.direction}`;
        const current = flowDemand.get(key);
        flowDemand.set(key, {
          id: claim.id,
          label: claim.label,
          direction: claim.direction,
          active: current?.active ?? false,
          count: (current?.count ?? 0) + 1,
        });
      }
    }
    const flowDecisions = this.surfaceFlowPlanner.plan(this.state.elapsed, [
      ...flowDemand.values(),
    ]);
    const flowDecisionById = new Map(
      flowDecisions.map((decision) => [decision.id, decision]),
    );
    for (const decision of flowDecisions) {
      reservations.reserve(
        `flow:${decision.id}`,
        SurfaceFlowPlanner.claims([decision]),
      );
    }
    const protectedTaxiCorridors: Array<{
      flight: Flight;
      sweep: AircraftCollisionSweep;
    }> = [];
    const orderedVehicles = [...this.state.serviceVehicles].sort(
      (first, second) =>
        serviceVehicleSurfacePriority(first) -
          serviceVehicleSurfacePriority(second) ||
        second.progress - first.progress ||
        serviceVehicleStandLaneOrder(this.config, first, second) ||
        first.id.localeCompare(second.id),
    );
    const surfaceAircraftEnvelopes = new Map(
      this.state.flights.flatMap((flight) => {
        const envelope = aircraftCollisionEnvelope(this.config, flight);
        return envelope.surface ? [[flight.id, envelope] as const] : [];
      }),
    );
    // Seed actual occupancy before evaluating lookahead. Owners can extend
    // their own claim, while nobody can plan through another current segment.
    // Use the same operational ordering as movement arbitration. Seeding in
    // raw entity-ID order let a later departure take a directional section
    // away from an inbound aircraft already clearing it, producing a stable
    // nose-to-nose wait at the next section boundary.
    const candidateRank = new Map(
      candidates.map((flight, index) => [flight.id, index]),
    );
    const orderedSurfaceOccupants = [...surfaceFlights].sort(
      (first, second) =>
        (candidateRank.get(first.id) ?? Number.MAX_SAFE_INTEGER) -
          (candidateRank.get(second.id) ?? Number.MAX_SAFE_INTEGER) ||
        first.id - second.id,
    );
    for (const flight of orderedSurfaceOccupants) {
      // A recovery aircraft is deliberately parked in a physically verified
      // pull-off position. Imported OSM graphs can represent hundreds of
      // metres with one node claim; retaining that coarse claim would keep
      // the runway-side follower stopped even though there is ample pavement
      // to approach under the collision arbiter. Its actual body envelope
      // remains authoritative and cannot be crossed.
      if (flight.surfaceYield?.status === "holding") continue;
      // Current pavement remains exclusive through edge/node/stand/ramp
      // claims. Directional section ownership is intentionally supplied by
      // the persistent planner, rather than by a stationary aircraft's one
      // edge claim. Otherwise a blocked lead could reserve an entire named
      // taxiway indefinitely and prevent a safe downstream drain.
      const occupancyClaims = surfaceRouteReservationClaims(
        this.config.surfaceGraph,
        flight.surfaceRoute,
        flight.surfaceRouteEdges,
        flight.progress,
        flight.phase,
        0,
      ).filter((claim) => claim.kind !== "taxiway-flow");
      reservations.reserve(flight.id, occupancyClaims);
    }
    for (const vehicle of orderedVehicles) {
      reservations.reserve(
        serviceVehicleOwnerId(vehicle),
        serviceVehicleReservationClaims(this.config.surfaceGraph, vehicle, 0),
      );
    }
    for (const flight of candidates) {
      this.surfaceFlowHoldByFlight.delete(flight);
      const coordinationHold = this.surfaceHandoffHoldReason(flight);
      const departureCorridorOwner = this.committedDepartureCorridorBlocker(
        flight,
        committedDepartures,
      );
      if (departureCorridorOwner) {
        flight.automaticHold = true;
        flight.automaticHoldReason = `protected departure corridor for ${departureCorridorOwner.callsign}`;
        continue;
      }
      if (flight.surfaceYield?.status === "moving") {
        const movementSweep = this.surfaceMovementReservationSweep(flight);
        const reservesFutureCorridor =
          this.sweepHasFutureMovement(movementSweep);
        const blocker = this.surfaceYieldCorridorBlocker(flight, movementSweep);
        const reservedCorridorOwner = protectedTaxiCorridors.find((candidate) =>
          surfaceAircraftSweepsConflict(
            flight,
            movementSweep,
            candidate.flight,
            candidate.sweep,
          ),
        )?.flight;
        flight.automaticHold = Boolean(blocker || reservedCorridorOwner);
        flight.automaticHoldReason =
          typeof blocker === "string"
            ? blocker
            : blocker
              ? `surface recovery corridor occupied by ${blocker.callsign} (flight ${blocker.id})`
              : reservedCorridorOwner
                ? `surface recovery corridor reserved for ${reservedCorridorOwner.callsign} (flight ${reservedCorridorOwner.id})`
                : undefined;
        if (!flight.automaticHold && reservesFutureCorridor)
          protectedTaxiCorridors.push({ flight, sweep: movementSweep });
        continue;
      }
      const pushbackBlocker = this.activePushbackCorridorBlocker(flight);
      if (pushbackBlocker) {
        flight.automaticHold = true;
        flight.automaticHoldReason = `pushback corridor protected for ${pushbackBlocker.callsign}`;
        continue;
      }
      // Collision arbitration runs after the reservation pass, so safetyHold
      // describes a mover that was unable to advance on the preceding fixed
      // tick. Its current edge/node occupancy was seeded above and remains
      // protected, but extending twelve edges of lookahead from a stationary
      // aircraft can starve the traffic that must clear its conflict. Rejoin
      // normal lookahead arbitration as soon as the safety hold releases.
      if (flight.safetyHold && !committedRunwayCrossers.has(flight.id)) {
        flight.automaticHold = Boolean(coordinationHold);
        flight.automaticHoldReason = coordinationHold ?? undefined;
        continue;
      }
      // A departure at its runway hold point has stopped by instruction. It
      // must retain its current edge/node reservation, but it cannot enter
      // the runway-access suffix until Tower grants runway-entry clearance.
      // Reserving the normal twelve-edge look-ahead here made an uncleared
      // aircraft block unrelated taxi traffic through the future corridor.
      const awaitingRunwayEntry =
        flight.phase === "taxi-out" &&
        flight.progress >= 0.985 &&
        !flight.runwayEntryCleared;
      const claims = surfaceRouteReservationClaims(
        this.config.surfaceGraph,
        flight.surfaceRoute,
        flight.surfaceRouteEdges,
        flight.progress,
        flight.phase,
        // Imported OSM centerlines can alternate between very short geometry
        // fragments and long taxiway sections. Twelve local edges gives a
        // transport-category aircraft enough pavement to decelerate before a
        // shared node, instead of discovering opposing flow only after both
        // noses are committed to the same junction.
        awaitingRunwayEntry ? 0 : 12,
        awaitingRunwayEntry
          ? 0
          : SURFACE_RESERVATION_LOOKAHEAD_M / WORLD_METERS_PER_UNIT,
      );
      const occupiedFlowClaims = surfaceRouteReservationClaims(
        this.config.surfaceGraph,
        flight.surfaceRoute,
        flight.surfaceRouteEdges,
        flight.progress,
        flight.phase,
        0,
        0,
      );
      const drainingFlowClaim = claims.find((claim) => {
        if (claim.kind !== "taxiway-flow" || !claim.direction) return false;
        const window = this.surfaceFlowPlanner.currentWindow(claim.id);
        if (
          !window ||
          window.direction !== claim.direction ||
          !window.pendingDirection ||
          this.state.elapsed < window.releaseAtSeconds
        )
          return false;
        return !occupiedFlowClaims.some(
          (occupied) =>
            occupied.kind === "taxiway-flow" && occupied.id === claim.id,
        );
      });
      const conflict = reservations.firstConflictDetail(claims, flight.id);
      const flowConflict =
        conflict &&
        typeof conflict.ownerId === "string" &&
        conflict.ownerId.startsWith("flow:") &&
        conflict.claim.kind === "taxiway-flow" &&
        flowDecisionById.get(conflict.claim.id);
      const movementSweep = this.surfaceMovementReservationSweep(flight);
      const reservesFutureCorridor = this.sweepHasFutureMovement(movementSweep);
      const reservedCorridorOwner = protectedTaxiCorridors.find((candidate) =>
        surfaceAircraftSweepsConflict(
          flight,
          movementSweep,
          candidate.flight,
          candidate.sweep,
        ),
      )?.flight;
      const corridorOwner = reservedCorridorOwner;
      const vehicleConflict =
        typeof conflict?.ownerId === "string" &&
        conflict.ownerId.startsWith("vehicle:");
      const reservationHold =
        vehicleConflict ||
        Boolean(corridorOwner) ||
        (this.stationRunsAutomatically("ground") &&
          (Boolean(conflict) || Boolean(drainingFlowClaim)));
      const shouldHold = Boolean(coordinationHold) || reservationHold;
      if (reservationHold && !flight.automaticHold)
        this.metrics.preventedConflicts += 1;
      flight.automaticHold = shouldHold;
      flight.automaticHoldReason =
        coordinationHold ??
        (corridorOwner
          ? `protected taxi corridor for ${corridorOwner.callsign} (flight ${corridorOwner.id})`
          : drainingFlowClaim
            ? (this.surfaceFlowPlanner.admissionReason(
                claims,
                this.state.elapsed,
                occupiedFlowClaims,
              ) ?? undefined)
            : flowConflict
              ? this.surfaceFlowPlanner.holdReason(
                  flowDecisionById.get(conflict.claim.id)!,
                  this.state.elapsed,
                )
              : conflict
                ? this.surfaceReservationConflictReason(
                    conflict.claim,
                    conflict.ownerId,
                  )
                : undefined);
      const heldFlowClaim =
        drainingFlowClaim ?? (flowConflict ? conflict.claim : undefined);
      if (heldFlowClaim)
        this.surfaceFlowHoldByFlight.set(flight, {
          id: heldFlowClaim.id,
          label: heldFlowClaim.label,
          direction: heldFlowClaim.direction ?? "",
        });
      if (shouldHold) continue;
      reservations.reserve(flight.id, claims);
      if (reservesFutureCorridor)
        protectedTaxiCorridors.push({ flight, sweep: movementSweep });
    }
    for (const flight of surfaceFlights.filter(
      (item) => item.emergency === "disabled",
    )) {
      flight.automaticHold = true;
      flight.automaticHoldReason = "disabled aircraft blocks surface movement";
    }
    for (const flight of surfaceFlights.filter(
      (item) =>
        item.surfaceReroute?.status === "holding" &&
        item.emergency !== "disabled",
    )) {
      flight.automaticHold = true;
      flight.automaticHoldReason =
        flight.surfaceReroute?.reason ?? "surface route is unavailable";
    }
    for (const flight of surfaceFlights.filter(
      (item) =>
        item.surfaceYield?.status === "holding" &&
        item.emergency !== "disabled",
    )) {
      flight.automaticHold = true;
      flight.automaticHoldReason =
        "surface recovery position held for crossing traffic";
    }
    for (const vehicle of orderedVehicles) {
      const wasHeld = vehicle.held;
      const claims = serviceVehicleReservationClaims(
        this.config.surfaceGraph,
        vehicle,
        1,
      );
      const conflict = reservations.firstConflictDetail(
        claims,
        serviceVehicleOwnerId(vehicle),
      );
      const physicalHoldReason = conflict
        ? undefined
        : this.serviceVehiclePhysicalHoldReason(
            vehicle,
            deltaSeconds,
            surfaceAircraftEnvelopes,
          );
      vehicle.held = Boolean(conflict || physicalHoldReason);
      vehicle.holdReason = conflict
        ? this.surfaceReservationConflictReason(
            conflict.claim,
            conflict.ownerId,
          )
        : physicalHoldReason;
      if (!vehicle.held)
        reservations.reserve(serviceVehicleOwnerId(vehicle), claims);
      const flight = this.state.flights.find(
        (candidate) => candidate.id === vehicle.flightId,
      );
      if (!flight || wasHeld === vehicle.held) continue;
      this.events.push({
        type: vehicle.held ? "service-vehicle-hold" : "service-vehicle-release",
        flight,
        taxiway: flight.taxiway,
        detail: vehicle.held
          ? `${vehicle.label} holding · ${vehicle.holdReason}`
          : `${vehicle.label} route released`,
        turnaroundService: vehicle.service,
        serviceVehicleId: vehicle.id,
        serviceVehicleType: vehicle.type,
        serviceVehicleStatus: vehicle.status,
      });
    }
  }

  /**
   * Resource claims protect graph segments and named stand lanes. A one-step
   * pose preview closes the remaining geometric gap where two differently
   * named stand-side paths can still pass through the same physical space.
   */
  private serviceVehiclePhysicalHoldReason(
    vehicle: ServiceVehicleState,
    deltaSeconds: number,
    surfaceAircraftEnvelopes: ReadonlyMap<
      number,
      ReturnType<typeof aircraftCollisionEnvelope>
    >,
  ): string | undefined {
    if (
      !["dispatching", "approaching", "clearing", "returning"].includes(
        vehicle.status,
      )
    )
      return undefined;
    const preview: ServiceVehicleState = {
      ...vehicle,
      outboundRoute: [...vehicle.outboundRoute],
      outboundRouteEdges: [...vehicle.outboundRouteEdges],
      returnRoute: [...vehicle.returnRoute],
      returnRouteEdges: [...vehicle.returnRouteEdges],
      standPath: vehicle.standPath.map((point) => [...point]),
      held: false,
      holdReason: undefined,
    };
    // Look far enough ahead to stop before the rendered envelopes touch even
    // when this vehicle is already at ramp speed. The authoritative vehicle
    // remains at its current pose until the corridor becomes clear.
    advanceServiceVehicleMotion(
      this.config.surfaceGraph,
      preview,
      Math.max(deltaSeconds, 0.45),
    );
    // The graph ledger already arbitrates vehicles travelling between stands,
    // including shared depot routes, taxiway fragments, and intersections.
    // Restrict this extra geometric preview to the stand whose independently
    // named left/right paths can overlap in world space. Applying it across
    // the whole airport makes two graph-protected vehicles yield to each
    // other's stationary pose and can deadlock otherwise valid service flow.
    const others = this.state.serviceVehicles.filter(
      (candidate) =>
        candidate.id !== vehicle.id &&
        candidate.standId === vehicle.standId &&
        // A vehicle already clearing the aircraft has right-of-way over idle
        // equipment staged on the opposite service side. Their fanned staging
        // envelopes can touch at center scale, but the graph junction and exact
        // route claims still sequence the actual merge. Holding the returner
        // here creates a cycle: the staged vehicle cannot approach until the
        // returner's same-side follower has vacated its lane.
        !(
          (vehicle.status === "clearing" || vehicle.status === "returning") &&
          candidate.status === "staged" &&
          candidate.standSide !== vehicle.standSide
        ),
    );
    const previewRadius = serviceVehicleRadius(this.config, preview);
    for (const other of others) {
      if (other.status === "scheduled" || other.status === "complete") continue;
      // The two stand-side paths fan into one staging connector. Once a
      // returner has entered that connector, let it clear ahead of equipment
      // that is still approaching staging on the opposite side. The lower
      // priority vehicle still previews against this returner's current pose
      // and remains stopped, so this breaks the symmetric wait without
      // weakening the presentation-envelope separation check.
      if (
        vehicle.standSide !== other.standSide &&
        vehicle.status === "returning" &&
        vehicle.progress > 1e-6 &&
        (other.status === "clearing" ||
          (other.status === "returning" &&
            (vehicle.progress > other.progress + 1e-6 ||
              (Math.abs(vehicle.progress - other.progress) <= 1e-6 &&
                vehicle.id.localeCompare(other.id) < 0))))
      )
        continue;
      const requiredDistance =
        previewRadius + serviceVehicleRadius(this.config, other);
      if (
        Math.hypot(preview.x - other.x, preview.y - other.y) + 1e-6 >=
        requiredDistance
      )
        continue;
      return `${other.label} (vehicle:${other.id}) occupies the service-vehicle safety envelope`;
    }
    for (const [flightId, aircraft] of surfaceAircraftEnvelopes) {
      if (flightId === preview.flightId) continue;
      const requiredDistance = previewRadius + aircraft.bodyRadius;
      if (
        Math.hypot(preview.x - aircraft.x, preview.y - aircraft.y) + 1e-6 >=
        requiredDistance
      )
        continue;
      const flight = this.state.flights.find(
        (candidate) => candidate.id === flightId,
      );
      return `${flight?.callsign ?? "aircraft"} (flight ${flightId}) occupies the service-vehicle safety envelope`;
    }
    return undefined;
  }

  private surfaceReservationConflictReason(
    claim: SurfaceReservationClaim,
    ownerId?: number | string,
  ): string {
    const owner =
      typeof ownerId === "number"
        ? ` (flight ${ownerId})`
        : typeof ownerId === "string"
          ? ` (${ownerId})`
          : "";
    if (claim.kind === "taxiway-flow")
      return `opposing traffic has one-way control of ${claim.label}${owner}`;
    if (claim.kind === "alley")
      return `opposing traffic has one-way control of ${claim.label}${owner}`;
    if (claim.kind === "ramp-zone")
      return `${claim.label} ramp-control zone is at capacity (${claim.capacity})`;
    if (claim.kind === "stand") return `${claim.label} is occupied`;
    if (claim.kind === "node") return `${claim.label} is reserved${owner}`;
    if (
      claim.kind === "service-lane" ||
      claim.kind === "service-bay" ||
      claim.kind === "service-staging"
    )
      return `${claim.label} is occupied`;
    return `opposing traffic occupies ${claim.label}${owner}`;
  }

  /** Densely sample the first metres, where a coarse long sweep can miss contact. */
  private surfaceYieldSampleProgresses(
    flight: Flight,
    targetProgress: number,
    direction: "forward" | "reverse",
  ): number[] {
    const progress = [0, 1, 2, 4, 8, 16]
      .map((distanceMeters) =>
        direction === "reverse"
          ? progressBeforeDistance(this.config, flight, distanceMeters)
          : progressAfterDistance(this.config, flight, distanceMeters),
      )
      .filter((candidate) =>
        direction === "reverse"
          ? candidate >= targetProgress - 1e-9
          : candidate <= targetProgress + 1e-9,
      );
    for (let sampleIndex = 0; sampleIndex <= 32; sampleIndex += 1) {
      progress.push(
        flight.progress +
          ((targetProgress - flight.progress) * sampleIndex) / 32,
      );
    }
    return [...new Set(progress)].sort((first, second) =>
      direction === "reverse" ? second - first : first - second,
    );
  }

  /** Verify that every sampled tug-recovery pose remains physically clear. */
  private surfaceYieldCorridorBlocker(
    flight: Flight,
    sweep: AircraftCollisionSweep,
  ): Flight | string | undefined {
    for (const other of this.state.flights) {
      if (other.id === flight.id) continue;
      const envelope = aircraftCollisionEnvelope(this.config, other);
      if (!envelope.surface) continue;
      const first = sweep.envelopes[0];
      const initiallyConflicting = Boolean(
        detectFlightConflict(
          first,
          envelope,
          flight.wakeClass,
          other.wakeClass,
          false,
          false,
        ),
      );
      let previousDistance = Math.hypot(
        first.x - envelope.x,
        first.y - envelope.y,
      );
      let escapedInitialConflict = !initiallyConflicting;
      for (const candidate of sweep.envelopes) {
        const distance = Math.hypot(
          candidate.x - envelope.x,
          candidate.y - envelope.y,
        );
        const physicalMinimum =
          candidate.bodyRadius + envelope.bodyRadius + PHYSICAL_GAP;
        if (distance + 1e-6 < physicalMinimum) return other;
        const conflict = detectFlightConflict(
          candidate,
          envelope,
          flight.wakeClass,
          other.wakeClass,
          false,
          false,
        );
        // A projected operational envelope can already be touching when the
        // deadlock is diagnosed. Permit only a strictly separating reverse
        // path in that case; the ordinary movement arbiter applies the same
        // rule one fixed step at a time. A newly encountered envelope remains
        // a hard blocker.
        if (escapedInitialConflict && conflict) return other;
        if (!escapedInitialConflict && distance + 1e-6 < previousDistance)
          return other;
        if (!conflict) escapedInitialConflict = true;
        previousDistance = distance;
      }
    }
    for (const vehicle of this.state.serviceVehicles) {
      if (vehicle.status === "scheduled" || vehicle.status === "complete")
        continue;
      const vehicleRadius = serviceVehicleRadius(this.config, vehicle);
      for (const envelope of sweep.envelopes) {
        const requiredDistance =
          envelope.bodyRadius + vehicleRadius + PHYSICAL_GAP;
        if (
          Math.hypot(envelope.x - vehicle.x, envelope.y - vehicle.y) + 1e-6 <
          requiredDistance
        ) {
          return `${vehicle.label} occupies the surface recovery corridor`;
        }
      }
    }
    return undefined;
  }

  private surfaceMovementReservationSweep(
    flight: Flight,
  ): AircraftCollisionSweep {
    let horizon =
      flight.surfaceYield?.status === "moving"
        ? flight.surfaceYield.targetProgress
        : this.progressAfterTravelDistance(
            flight,
            SURFACE_PHYSICAL_RESERVATION_LOOKAHEAD_M,
          );
    if (flight.surfaceYield?.status === "moving") {
      return buildAircraftCollisionSweep(
        this.surfaceYieldSampleProgresses(
          flight,
          horizon,
          flight.surfaceYield.direction,
        ).map((progress) =>
          aircraftCollisionEnvelope(this.config, flight, progress),
        ),
      );
    }
    const crossing = this.nextUnclearedCrossing(flight);
    if (crossing) horizon = Math.min(horizon, crossing.holdProgress);
    const deicingLimit = deicingMovementLimit(flight);
    if (deicingLimit !== null) horizon = Math.min(horizon, deicingLimit);
    return buildAircraftCollisionSweep(
      Array.from({ length: 25 }, (_, sampleIndex) =>
        aircraftCollisionEnvelope(
          this.config,
          flight,
          flight.progress + ((horizon - flight.progress) * sampleIndex) / 24,
        ),
      ),
    );
  }

  /**
   * A stopped aircraft at a route endpoint must retain its physical body,
   * graph occupancy, and runway protection, but it has no future taxi segment
   * to reserve. Keeping a degenerate 80 m look-ahead sweep there can freeze a
   * following aircraft far back while Tower waits to release the leader.
   */
  private sweepHasFutureMovement(sweep: AircraftCollisionSweep): boolean {
    const first = sweep.envelopes[0];
    const last = sweep.envelopes.at(-1);
    return Boolean(
      first && last && Math.hypot(last.x - first.x, last.y - first.y) > 0.01,
    );
  }

  private gateReservations(excludedFlightId?: number): GateReservation[] {
    const now = this.state.elapsed;
    return this.state.flights.flatMap((flight): GateReservation[] => {
      const assignment = flight.gateAssignment;
      if (
        !assignment ||
        flight.id === excludedFlightId ||
        flight.phase === "takeoff"
      )
        return [];
      let startSeconds = assignment.scheduledGateInSeconds;
      let endSeconds = assignment.scheduledDepartureSeconds;
      if (flight.phase === "approach" || flight.phase === "landing") {
        // Future reservation remains on its planned window.
      } else if (flight.phase === "taxi-in") {
        const remainingTaxi = Math.max(
          0,
          flight.duration * (1 - flight.progress),
        );
        startSeconds = Math.min(startSeconds, now + remainingTaxi);
        endSeconds = Math.max(
          endSeconds,
          now + remainingTaxi + flight.turnaround.plannedDurationSeconds,
        );
      } else if (flight.phase === "resting") {
        const remainingTurn = Math.max(
          0,
          flight.duration * (1 - flight.progress),
        );
        startSeconds = Math.min(
          startSeconds,
          assignment.actualGateInSeconds ?? now,
        );
        endSeconds = Math.max(
          endSeconds,
          now +
            remainingTurn +
            (this.stationRunsAutomatically("ramp") ? 24 : 180),
        );
      } else if (flight.phase === "taxi-out") {
        if (!flight.tugAttached && flight.pushbackProgress >= 1) return [];
        startSeconds = now - GATE_TURN_BUFFER_SECONDS;
        endSeconds =
          now +
          Math.max(
            8,
            flight.duration *
              Math.max(0, flight.pushbackReleaseProgress - flight.progress),
          );
      }
      if (
        flight.phase === "approach" ||
        flight.phase === "landing" ||
        flight.phase === "taxi-in" ||
        flight.phase === "resting"
      ) {
        // An active aircraft owns its stand until it physically releases the
        // gate during pushback. Optimistic schedule windows allowed several
        // active flights to reserve M1/C17/B9 simultaneously; one delayed turn
        // then produced an unsolvable queue at the lead-in. The long horizon is
        // intentionally bounded for arithmetic, but active state—not forecast
        // timing—is the actual release authority.
        startSeconds = Math.min(startSeconds, now);
        endSeconds = Math.max(
          endSeconds,
          now + ACTIVE_GATE_RESERVATION_HORIZON_SECONDS,
        );
      }
      return [
        {
          flightId: flight.id,
          standId: assignment.standId,
          aircraft: flight.aircraft,
          terminalId: assignment.terminalId,
          startSeconds,
          endSeconds,
        },
      ];
    });
  }

  private ensureArrivalGate(flight: Flight): boolean {
    const assignment = flight.gateAssignment;
    // Once rollout is complete, dynamic traffic farther along the assigned
    // taxi route must not leave the aircraft parked on an active runway. The
    // phase-transition sweep protects the runway exit and the per-tick surface
    // arbiters protect every subsequent movement. Occupied stands and parked
    // aircraft remain hard gate-assignment blockers.
    const mustVacateRunway =
      flight.phase === "landing" && flight.progress >= 1 - 1e-9;
    // A provisional approach assignment only needs a free compatible stand
    // and a conflict-free terminal route. The more expensive whole-stand
    // corridor screen runs immediately before surface entry (and for the
    // opening-bank aircraft that start on the ground), when it can act on the
    // current traffic picture instead of repeatedly screening future traffic.
    const screenActiveStandCorridors =
      (!mustVacateRunway && flight.phase === "landing") ||
      flight.phase === "taxi-in" ||
      flight.phase === "resting";
    const routeConflictingStandIds = screenActiveStandCorridors
      ? this.standsConflictingWithActiveSurfaceRoutes(flight)
      : new Set<string>();
    const routeConflictsWithParkedAircraft = assignment
      ? this.arrivalRouteConflictsWithParkedAircraft(flight, assignment)
      : false;
    const routeConflictsWithSurfaceTraffic =
      assignment && !mustVacateRunway
        ? this.arrivalRouteConflictsWithSurfaceTraffic(flight, assignment)
        : false;
    const blocker = assignment
      ? this.state.flights.find(
          (other) =>
            other.id !== flight.id &&
            other.gateAssignment &&
            standReservationsConflict(
              this.config,
              assignment.standId,
              flight.aircraft,
              other.gateAssignment.standId,
              other.aircraft,
            ) &&
            (other.phase === "taxi-in" ||
              other.phase === "resting" ||
              (other.phase === "taxi-out" &&
                (other.tugAttached || other.pushbackProgress < 1))),
        )
      : undefined;
    const corridorConflict = Boolean(
      assignment && routeConflictingStandIds.has(assignment.standId),
    );
    if (
      assignment &&
      !blocker &&
      !corridorConflict &&
      !routeConflictsWithParkedAircraft &&
      !routeConflictsWithSurfaceTraffic
    )
      return true;
    const reason = blocker
      ? `${assignment?.gateRef ?? assignment?.zoneName ?? assignment?.standId} still occupied by ${blocker.callsign}`
      : corridorConflict
        ? `${assignment?.gateRef ?? assignment?.zoneName ?? assignment?.standId} conflicts with an occupied stand's active movement corridor`
        : routeConflictsWithParkedAircraft
          ? `${assignment?.gateRef ?? assignment?.zoneName ?? assignment?.standId} arrival route is blocked by parked traffic`
          : routeConflictsWithSurfaceTraffic
            ? `${assignment?.gateRef ?? assignment?.zoneName ?? assignment?.standId} arrival route conflicts with active surface traffic`
            : "arrival had no usable stand plan";
    return this.reassignArrivalGate(flight, reason, routeConflictingStandIds);
  }

  private reassignArrivalGate(
    flight: Flight,
    reason: string,
    excludedStandIds: ReadonlySet<string> = new Set(),
  ): boolean {
    const previous = flight.gateAssignment;
    const retrySignature = [
      previous?.standId ?? "unassigned",
      previous?.revision ?? -1,
      reason,
      [...excludedStandIds].sort().join(","),
    ].join("|");
    const failedRetry = this.failedGateReassignmentRetry.get(flight);
    if (
      failedRetry?.signature === retrySignature &&
      this.state.elapsed + 1e-6 < failedRetry.retryAtSeconds
    )
      return false;
    const nextDestination =
      previous?.nextDestination ?? this.originFor(flight.id + 5);
    const rejectedStandIds = new Set(excludedStandIds);
    // Gate retries are a single ATC decision. Freeze their congestion and
    // blocked-edge view so every candidate is judged against the same surface
    // state and the route-tree cache can answer without rebuilding Dijkstra
    // trees for each rejected stand.
    const planning = this.surfaceRoutePlanning(flight.id);
    let decision: FlightGateAssignment | null = null;
    for (
      let attempt = 0;
      attempt < this.config.surfaceGraph.stands.length;
      attempt += 1
    ) {
      decision = planGateAssignment({
        config: this.config,
        flightId: flight.id,
        aircraft: flight.aircraft,
        airline: flight.airline,
        service: flight.service,
        trafficClass: flight.operationPlan.trafficClass,
        arrivalRunway: flight.runway,
        arrivalOperatingEnd: flight.operatingEnd,
        departureRunway: flight.departureRunway,
        departureOperatingEnd: this.preferredOperatingEnd(
          flight.departureRunway,
        ),
        readyForTaxiAtSeconds: this.gateReadyForTaxiAt(flight),
        turnaroundSeconds: flight.turnaround.plannedDurationSeconds,
        nextDestination,
        assignedAtSeconds: this.state.elapsed,
        reservations: this.gateReservations(flight.id),
        planning,
        revision: (previous?.revision ?? -1) + 1,
        previousStandId: previous?.standId,
        excludedStandIds: rejectedStandIds,
      });
      if (
        !decision ||
        (!this.arrivalRouteConflictsWithParkedAircraft(flight, decision) &&
          !this.arrivalRouteConflictsWithSurfaceTraffic(flight, decision))
      )
        break;
      rejectedStandIds.add(decision.standId);
      decision = null;
    }
    if (!decision) {
      this.failedGateReassignmentRetry.set(flight, {
        signature: retrySignature,
        retryAtSeconds:
          this.state.elapsed + FAILED_GATE_REASSIGNMENT_RETRY_SECONDS,
      });
      return false;
    }
    this.failedGateReassignmentRetry.delete(flight);
    const stand = this.config.surfaceGraph.stands.find(
      (candidate) => candidate.id === decision.standId,
    );
    flight.gateAssignment = decision;
    scheduleTurnaround(flight.turnaround, decision.scheduledGateInSeconds);
    flight.gateSlot = decision.gateSlot;
    flight.standId = decision.standId;
    flight.pushbackDirection = stand?.pushbackDirection ?? "straight";
    if (previous) {
      amendFlightPlan(
        flight.flightPlan,
        "gate-swap",
        this.state.elapsed,
        `${previous.gateRef ?? previous.zoneName ?? previous.standId} → ${decision.gateRef ?? decision.zoneName ?? decision.standId}`,
        { gateAssignment: decision },
      );
      this.state.trafficFlow.totals.gateSwaps += 1;
    }
    this.events.push({
      type: previous ? "gate-reassignment" : "gate-assignment",
      flight,
      detail: `${reason} · ${previous?.gateRef ?? previous?.zoneName ?? previous?.standId ?? "unassigned"} → ${decision.gateRef ?? decision.zoneName ?? decision.standId}`,
    });
    if (flight.phase === "approach" || flight.phase === "landing")
      this.planRunwayExit(flight, "destination stand changed");
    return true;
  }

  /** Reject a gate whose own taxi-in route would pass through parked aircraft. */
  private arrivalRouteConflictsWithParkedAircraft(
    flight: Flight,
    assignment: FlightGateAssignment,
  ): boolean {
    const parkedTraffic = this.state.flights.filter(
      (other) =>
        other.id !== flight.id &&
        (other.phase === "resting" ||
          (other.phase === "taxi-out" &&
            (other.tugAttached || other.pushbackProgress < 1))),
    );
    const signature = parkedTraffic
      .map((other) =>
        [
          other.id,
          other.phase,
          other.aircraft,
          other.gateSlot,
          other.standId ?? "",
          Math.round(other.progress * 1_000),
        ].join(":"),
      )
      .join("|");
    const cacheKey = [
      assignment.standId,
      assignment.revision,
      flight.runway,
      flight.operatingEnd,
    ].join(":");
    const cached = this.arrivalRouteParkedConflictCache
      .get(flight)
      ?.get(cacheKey);
    if (cached?.signature === signature) return cached.conflicts;
    const preview: Flight = {
      ...flight,
      phase: "taxi-in",
      gateAssignment: assignment,
      gateSlot: assignment.gateSlot,
      standId: assignment.standId,
      progress: 0,
      phaseElapsed: 0,
      surfaceRoute: undefined,
      surfaceRouteEdges: undefined,
      surfaceCongestedEdgeIds: undefined,
      requiredCrossings: [],
      crossingClearances: [],
      crossingClearanceIds: [],
      deicing: { ...flight.deicing },
      kinematics: { ...flight.kinematics },
      motion: { ...flight.motion },
    };
    this.assignSurfaceRoute(preview, "taxi-in");
    if (!preview.surfaceRouteEdges?.length) {
      const cache =
        this.arrivalRouteParkedConflictCache.get(flight) ?? new Map();
      cache.set(cacheKey, { signature, conflicts: true });
      this.arrivalRouteParkedConflictCache.set(flight, cache);
      return true;
    }
    syncFlightMotion(this.config, preview);
    const routeSweep = buildAircraftCollisionSweep(
      Array.from({ length: 129 }, (_, index) =>
        aircraftCollisionEnvelope(this.config, preview, index / 128),
      ),
    );
    const conflicts = parkedTraffic.some((other) => {
      const parked = aircraftCollisionEnvelope(this.config, other);
      return routeSweep.envelopes.some(
        (moving) =>
          aircraftEnvelopeBoxesOverlap(parked, moving) &&
          Boolean(
            detectFlightConflict(
              parked,
              moving,
              other.wakeClass,
              flight.wakeClass,
              this.runwaysConflict(other.runway, flight.runway),
              false,
            ),
          ),
      );
    });
    const cache = this.arrivalRouteParkedConflictCache.get(flight) ?? new Map();
    cache.set(cacheKey, { signature, conflicts });
    this.arrivalRouteParkedConflictCache.set(flight, cache);
    return conflicts;
  }

  /**
   * A gate can be physically clear yet reachable only through the active or
   * imminent departure route of another aircraft. Keep that conflict in the
   * arrival queue or select a different stand before taxi-in commits to the
   * terminal corridor; the per-tick arbiter then remains a last safety net.
   */
  private arrivalRouteConflictsWithSurfaceTraffic(
    flight: Flight,
    assignment: FlightGateAssignment,
  ): boolean {
    // This is called while the approach scheduler asks whether a stand remains
    // usable. Cache against a coarse surface-state signature: the expensive
    // sweep remains authoritative at each meaningful graph/phase change, but
    // does not become a per-render-frame O(flights * samples²) task.
    // Only routes that originate at a stand can occupy this terminal corridor.
    // Incoming aircraft use a different part of the graph and are covered by
    // the real-time reservation arbiter; including them here used to bust this
    // cache whenever any approach progressed.
    const terminalTraffic = this.state.flights.filter(
      (other) =>
        other.id !== flight.id &&
        (other.phase === "taxi-out" || other.phase === "resting"),
    );
    const trafficSignature = terminalTraffic
      .map((other) =>
        [
          other.id,
          other.phase,
          other.aircraft,
          other.runway,
          other.departureRunway,
          other.gateAssignment?.standId ?? "",
          other.gateAssignment?.revision ?? -1,
          surfaceRouteIdentity(other.surfaceRouteEdges),
        ].join(":"),
      )
      .join("|");
    const cacheKey = [
      assignment.standId,
      assignment.revision,
      flight.runway,
      flight.operatingEnd,
    ].join(":");
    const cached = this.arrivalRouteSurfaceConflictCache
      .get(flight)
      ?.get(cacheKey);
    if (cached?.signature === trafficSignature) return cached.conflicts;
    const incoming: Flight = {
      ...flight,
      phase: "taxi-in",
      gateAssignment: assignment,
      gateSlot: assignment.gateSlot,
      standId: assignment.standId,
      progress: 0,
      phaseElapsed: 0,
      surfaceRoute: undefined,
      surfaceRouteEdges: undefined,
      surfaceCongestedEdgeIds: undefined,
      requiredCrossings: [],
      crossingClearances: [],
      crossingClearanceIds: [],
      deicing: { ...flight.deicing },
      kinematics: { ...flight.kinematics },
      motion: { ...flight.motion },
    };
    this.assignSurfaceRoute(incoming, "taxi-in");
    const incomingEdges = incoming.surfaceRouteEdges;
    if (!incomingEdges?.length) {
      const cache =
        this.arrivalRouteSurfaceConflictCache.get(flight) ?? new Map();
      cache.set(cacheKey, { signature: trafficSignature, conflicts: true });
      this.arrivalRouteSurfaceConflictCache.set(flight, cache);
      return true;
    }
    // The final taxi-in segment and initial pushback/taxi-out segment are the
    // contested terminal alley. Comparing graph resources is intentional: the
    // exact collision solver is still used while moving, whereas this is a
    // lightweight advance-admission test that may run across many candidate
    // stands at a busy hub.
    const incomingTerminalEdges = new Set(
      incomingEdges.slice(Math.floor(incomingEdges.length * 0.58)),
    );
    let conflicts = false;
    for (const other of terminalTraffic) {
      let outgoingEdges = other.surfaceRouteEdges;
      if (
        !outgoingEdges?.length &&
        other.phase === "resting" &&
        other.gateAssignment
      ) {
        const signature = [
          other.gateAssignment.standId,
          other.gateAssignment.revision,
          other.departureRunway,
          this.preferredOperatingEnd(other.departureRunway),
          other.surfaceReroute?.revision ?? 0,
        ].join(":");
        const cachedRoute = this.restingTaxiOutRouteCache.get(other);
        if (cachedRoute?.signature === signature) {
          outgoingEdges = cachedRoute.routeEdges;
        } else {
          const preview: Flight = {
            ...other,
            phase: "taxi-out",
            progress: 0,
            phaseElapsed: 0,
            runway: other.departureRunway,
            operatingEnd: this.preferredOperatingEnd(other.departureRunway),
            deicing: { ...other.deicing },
            kinematics: { ...other.kinematics },
            motion: { ...other.motion },
            requiredCrossings: [],
            crossingClearances: [],
            crossingClearanceIds: [],
            surfaceRoute: undefined,
            surfaceRouteEdges: undefined,
            surfaceCongestedEdgeIds: undefined,
          };
          this.assignSurfaceRoute(preview, "taxi-out");
          outgoingEdges = preview.surfaceRouteEdges;
          this.restingTaxiOutRouteCache.set(other, {
            signature,
            routeNodes: preview.surfaceRoute,
            routeEdges: outgoingEdges,
          });
        }
      }
      if (!outgoingEdges?.length) continue;
      const exitEdgeCount = Math.max(1, Math.ceil(outgoingEdges.length * 0.42));
      if (
        outgoingEdges
          .slice(0, exitEdgeCount)
          .some((edge) => incomingTerminalEdges.has(edge))
      ) {
        conflicts = true;
        break;
      }
    }
    const cache =
      this.arrivalRouteSurfaceConflictCache.get(flight) ?? new Map();
    cache.set(cacheKey, { signature: trafficSignature, conflicts });
    this.arrivalRouteSurfaceConflictCache.set(flight, cache);
    return conflicts;
  }

  /**
   * Find stands whose parked aircraft envelope intersects an active taxi path
   * or the departure corridor of an occupied stand. The check runs at the
   * opening bank and again before an arrival commits to taxi-in, so a delayed
   * gate window cannot create a physical stand/alley deadlock that the earlier
   * schedule no longer predicts.
   */
  private standsConflictingWithActiveSurfaceRoutes(
    flight: Flight,
  ): Set<string> {
    const candidates = this.state.flights.filter(
      (candidate) => candidate.id !== flight.id,
    );
    const signature = [
      flight.aircraft,
      flight.runway,
      flight.departureRunway,
      flight.gateSlot,
      this.state.runwayConfigurationId,
      ...candidates.map((candidate) =>
        [
          candidate.id,
          candidate.phase,
          candidate.aircraft,
          candidate.gateSlot,
          candidate.departureRunway,
          surfaceRouteIdentity(candidate.surfaceRouteEdges),
          candidate.phase === "resting"
            ? 0
            : // Gate-route screening is an advance planner, not the movement
              // collision authority. Sixteen route buckets keep it responsive
              // in a busy bank; the fixed-step reservation/collision arbiter
              // continues to check every moving tick between buckets.
              Math.floor(Math.max(0, Math.min(1, candidate.progress)) * 16),
          candidate.surfaceReroute?.revision ?? 0,
        ].join(":"),
      ),
    ].join("|");
    const cached = this.standCorridorConflictCache.get(flight);
    if (cached?.signature === signature) return cached.blockedStandIds;

    const activeSweeps = candidates
      .flatMap((candidate): Flight[] => {
        if (
          (candidate.phase === "taxi-in" || candidate.phase === "taxi-out") &&
          candidate.surfaceRouteEdges?.length
        )
          return [candidate];
        if (candidate.phase !== "resting" || !candidate.gateAssignment)
          return [];
        const routeSignature = [
          candidate.gateAssignment.standId,
          candidate.gateAssignment.revision,
          candidate.departureRunway,
          this.preferredOperatingEnd(candidate.departureRunway),
          candidate.surfaceReroute?.revision ?? 0,
        ].join(":");
        const cachedRoute = this.restingTaxiOutRouteCache.get(candidate);
        const preview: Flight = {
          ...candidate,
          phase: "taxi-out",
          progress: 0,
          phaseElapsed: 0,
          runway: candidate.departureRunway,
          operatingEnd: this.preferredOperatingEnd(candidate.departureRunway),
          deicing: { ...candidate.deicing },
          kinematics: { ...candidate.kinematics },
          motion: { ...candidate.motion },
          requiredCrossings: [...(candidate.requiredCrossings ?? [])],
          crossingClearances: [...(candidate.crossingClearances ?? [])],
          crossingClearanceIds: [...(candidate.crossingClearanceIds ?? [])],
          surfaceRoute:
            cachedRoute?.signature === routeSignature
              ? cachedRoute.routeNodes
              : candidate.surfaceRoute
                ? [...candidate.surfaceRoute]
                : undefined,
          surfaceRouteEdges:
            cachedRoute?.signature === routeSignature
              ? cachedRoute.routeEdges
              : candidate.surfaceRouteEdges
                ? [...candidate.surfaceRouteEdges]
                : undefined,
          surfaceCongestedEdgeIds: candidate.surfaceCongestedEdgeIds
            ? [...candidate.surfaceCongestedEdgeIds]
            : undefined,
        };
        if (cachedRoute?.signature !== routeSignature) {
          this.assignSurfaceRoute(preview, "taxi-out");
          this.restingTaxiOutRouteCache.set(candidate, {
            signature: routeSignature,
            routeNodes: preview.surfaceRoute,
            routeEdges: preview.surfaceRouteEdges,
          });
        }
        if (!preview.surfaceRouteEdges?.length) return [];
        syncFlightMotion(this.config, preview);
        return [preview];
      })
      .map((candidate) => {
        const remainingEdges = Math.max(
          1,
          (candidate.surfaceRouteEdges?.length ?? 1) * (1 - candidate.progress),
        );
        const sampleCount = Math.max(
          32,
          Math.min(128, Math.ceil(remainingEdges * 2)),
        );
        return {
          flight: candidate,
          sweep: buildAircraftCollisionSweep(
            Array.from({ length: sampleCount + 1 }, (_, sampleIndex) =>
              aircraftCollisionEnvelope(
                this.config,
                candidate,
                candidate.progress +
                  ((1 - candidate.progress) * sampleIndex) / sampleCount,
              ),
            ),
          ),
        };
      });
    if (!activeSweeps.length) return new Set();

    const blocked = new Set<string>();
    for (const stand of this.config.surfaceGraph.stands) {
      const preview: Flight = {
        ...flight,
        phase: "resting",
        gateSlot: stand.slot,
        standId: stand.id,
        progress: 1,
        motion: { ...flight.motion },
        kinematics: { ...flight.kinematics },
      };
      const parked = aircraftCollisionEnvelope(this.config, preview);
      const parkedSweep = buildAircraftCollisionSweep([parked]);
      for (const active of activeSweeps) {
        if (!aircraftCollisionSweepsOverlap(parkedSweep, active.sweep))
          continue;
        const conflict = active.sweep.envelopes.some(
          (moving) =>
            aircraftEnvelopeBoxesOverlap(parked, moving) &&
            Boolean(
              detectFlightConflict(
                parked,
                moving,
                flight.wakeClass,
                active.flight.wakeClass,
                this.runwaysConflict(flight.runway, active.flight.runway),
                false,
              ),
            ),
        );
        if (!conflict) continue;
        blocked.add(stand.id);
        break;
      }
    }
    this.standCorridorConflictCache.set(flight, {
      signature,
      blockedStandIds: blocked,
    });
    return blocked;
  }

  private gateReadyForTaxiAt(flight: Flight): number {
    if (flight.phase === "approach") {
      return (
        this.state.elapsed +
        Math.max(0, flight.duration - flight.phaseElapsed) +
        this.phaseDuration(
          flight.aircraft,
          "landing",
          flight.runway,
          flight.runwayExit,
        )
      );
    }
    if (flight.phase === "landing")
      return (
        this.state.elapsed + Math.max(0, flight.duration - flight.phaseElapsed)
      );
    return this.state.elapsed;
  }

  private confirmGateArrival(flight: Flight): void {
    const assignment = flight.gateAssignment;
    if (!assignment) return;
    let vehicles = this.state.serviceVehicles.filter(
      (vehicle) =>
        vehicle.flightId === flight.id &&
        vehicle.standId === assignment.standId,
    );
    if (!vehicles.length)
      vehicles = this.prepareServiceVehicles(flight, this.state.elapsed);
    const transitions = startTurnaround(
      flight.turnaround,
      this.state.elapsed,
      flight.kinematics.fuelPercent,
      availableVehicleServices(flight, vehicles),
    );
    flight.duration = flight.turnaround.plannedDurationSeconds;
    flight.phaseElapsed = 0;
    flight.progress = 0;
    assignment.actualGateInSeconds = this.state.elapsed;
    assignment.scheduledGateInSeconds = this.state.elapsed;
    assignment.scheduledDepartureSeconds =
      flight.turnaround.scheduledReadySeconds;
    this.events.push({
      type: "turnaround-start",
      flight,
      taxiway: flight.taxiway,
      detail: `${flight.service} turn started · ${flight.turnaround.tasks.filter((task) => task.required).length} required services`,
    });
    this.emitTurnaroundTransitions(flight, transitions);
    const occupiedWindow = {
      startSeconds: this.state.elapsed,
      endSeconds: assignment.scheduledDepartureSeconds,
    };
    const futureTraffic = this.state.flights
      .filter(
        (other) =>
          other.id !== flight.id &&
          (other.phase === "approach" || other.phase === "landing"),
      )
      .filter((other) => other.gateAssignment?.standId === assignment.standId)
      .sort(
        (first, second) =>
          (first.gateAssignment?.scheduledGateInSeconds ?? Infinity) -
          (second.gateAssignment?.scheduledGateInSeconds ?? Infinity),
      );
    for (const future of futureTraffic) {
      const futureAssignment = future.gateAssignment;
      if (
        !futureAssignment ||
        !gateReservationsOverlap(occupiedWindow, {
          startSeconds: futureAssignment.scheduledGateInSeconds,
          endSeconds: futureAssignment.scheduledDepartureSeconds,
        })
      )
        continue;
      this.reassignArrivalGate(
        future,
        `${assignment.gateRef ?? assignment.zoneName ?? assignment.standId} occupancy window changed`,
      );
    }
  }

  /** Plan and release gate equipment early enough to be staged before gate-in. */
  private prepareServiceVehicles(
    flight: Flight,
    scheduledGateInSeconds: number,
    prepositioned = false,
  ): ServiceVehicleState[] {
    const reservedDepots = new Set(
      this.state.serviceVehicles
        .filter(
          (vehicle) =>
            vehicle.flightId !== flight.id && vehicle.status !== "complete",
        )
        .map((vehicle) => vehicle.depotNodeId),
    );
    const vehicles = createServiceVehiclePlans(
      this.config,
      flight,
      scheduledGateInSeconds,
      reservedDepots,
      this.surfaceRoutePlanning(flight.id),
    );
    this.state.serviceVehicles = this.state.serviceVehicles.filter(
      (vehicle) => vehicle.flightId !== flight.id,
    );
    this.state.serviceVehicles.push(...vehicles);
    if (prepositioned) {
      for (const vehicle of vehicles) {
        vehicle.prepositionAtStand = true;
        this.tryPrepositionServiceVehicle(flight, vehicle);
      }
    }
    return vehicles;
  }

  private releaseGate(flight: Flight): void {
    const assignment = flight.gateAssignment;
    if (!assignment || assignment.actualGateOutSeconds !== undefined) return;
    assignment.actualGateOutSeconds = this.state.elapsed;
    assignment.scheduledDepartureSeconds = this.state.elapsed;
    this.events.push({
      type: "gate-release",
      flight,
      detail: `${assignment.gateRef ?? assignment.zoneName ?? assignment.standId} released for the next arrival`,
    });
  }

  /** Prevent a phase handoff from introducing an envelope the prior phase did not carry. */
  private transitionConflict(
    flight: Flight,
    next: FlightPhase,
    surfaceProgressOverrides: ReadonlyMap<number, number> = new Map(),
  ): string | null {
    const surfacePhase =
      next === "taxi-in" || next === "resting" || next === "taxi-out"
        ? next
        : undefined;
    const signature = surfacePhase
      ? this.surfacePlanCacheSignature(flight, surfacePhase)
      : [
          next,
          flight.runway,
          flight.operatingEnd,
          flight.aircraft,
          flight.runwayExit?.nodeId ?? "",
          this.state.runwayConfigurationId,
          this.state.weather.condition,
          this.state.weather.surfaceCondition,
        ].join("|");
    let phaseCache = this.phaseTransitionPreviewCache.get(flight);
    const cached = phaseCache?.get(next);
    let preview = cached?.signature === signature ? cached.preview : undefined;
    if (!preview && surfacePhase === "taxi-out") {
      const pushbackPreview = this.pushbackPreviewCache.get(flight);
      if (pushbackPreview?.signature === signature)
        preview = pushbackPreview.preview;
    }
    if (!preview) {
      preview = {
        ...flight,
        phase: next,
        progress: 0,
        phaseElapsed: 0,
        duration: this.phaseDuration(
          flight.aircraft,
          next,
          flight.runway,
          flight.runwayExit,
        ),
        surfaceRoute: flight.surfaceRoute
          ? [...flight.surfaceRoute]
          : undefined,
        surfaceRouteEdges: flight.surfaceRouteEdges
          ? [...flight.surfaceRouteEdges]
          : undefined,
        surfaceCongestedEdgeIds: flight.surfaceCongestedEdgeIds
          ? [...flight.surfaceCongestedEdgeIds]
          : undefined,
        requiredCrossings: flight.requiredCrossings
          ? [...flight.requiredCrossings]
          : undefined,
        crossingClearances: flight.crossingClearances
          ? [...flight.crossingClearances]
          : undefined,
        crossingClearanceIds: flight.crossingClearanceIds
          ? [...flight.crossingClearanceIds]
          : undefined,
        deicing: { ...flight.deicing },
        kinematics: { ...flight.kinematics },
      };
      if (surfacePhase) this.assignSurfaceRoute(preview, surfacePhase);
      if (next === "takeoff") {
        preview.taxiway = undefined;
        preview.surfaceRoute = undefined;
        preview.surfaceRouteEdges = undefined;
        preview.surfaceRoutingCost = undefined;
        preview.surfaceCongestionPenalty = undefined;
        preview.surfaceCongestedEdgeIds = undefined;
        preview.surfaceNode = undefined;
        preview.surfaceEdge = undefined;
        preview.rampControlZoneId = undefined;
        preview.rampControlZoneName = undefined;
        preview.rampControlZoneCapacity = undefined;
        preview.surfaceAlleyId = undefined;
        preview.surfaceFlowDirection = undefined;
        preview.standPath = undefined;
      }
      syncFlightMotion(this.config, preview);
      phaseCache ??= new Map();
      phaseCache.set(next, { signature, preview });
      this.phaseTransitionPreviewCache.set(flight, phaseCache);
    } else if (cached?.signature !== signature) {
      phaseCache ??= new Map();
      phaseCache.set(next, { signature, preview });
      this.phaseTransitionPreviewCache.set(flight, phaseCache);
    }
    if (
      surfacePhase &&
      surfacePhase !== "resting" &&
      (!preview.surfaceRoute?.length || !preview.surfaceRouteEdges?.length)
    ) {
      return "no compatible pavement route is available around the active surface restrictions";
    }
    const otherFlights = this.state.flights
      .filter((item) => item.id !== flight.id)
      .map((item) => {
        const progress = surfaceProgressOverrides.get(item.id);
        if (progress === undefined || Math.abs(progress - item.progress) < 1e-9)
          return item;
        const projected = { ...item, progress };
        syncFlightMotion(this.config, projected);
        return projected;
      });
    if (next === "taxi-in" || next === "taxi-out") {
      const transitionProgress = Math.min(
        0.025,
        Math.max(0.001, 1 - preview.progress),
      );
      const projectedConflict = findProposedConflict(
        this.config,
        preview,
        transitionProgress,
        otherFlights,
        new Map(otherFlights.map((item) => [item.id, item.progress])),
      );
      if (projectedConflict) {
        if (
          "first" in projectedConflict &&
          !/flight \d+/.test(projectedConflict.detail)
        ) {
          const counterpart =
            projectedConflict.first === preview.id
              ? projectedConflict.second
              : projectedConflict.first;
          return `${projectedConflict.detail} with flight ${counterpart}`;
        }
        return projectedConflict.detail;
      }
    }
    const traffic = [preview, ...otherFlights];
    const aircraftConflict = findFlightConflicts(this.config, traffic).find(
      (conflict) =>
        conflict.first === preview.id || conflict.second === preview.id,
    );
    if (aircraftConflict) {
      const counterpart =
        aircraftConflict.first === preview.id
          ? aircraftConflict.second
          : aircraftConflict.first;
      return /flight \d+/.test(aircraftConflict.detail)
        ? aircraftConflict.detail
        : `${aircraftConflict.detail} with flight ${counterpart}`;
    }
    return findObstacleConflicts(this.config, [preview])[0]?.detail ?? null;
  }

  private reserveDeparture(flight: Flight): boolean {
    const runway = flight.runway;
    if (this.runwayReleaseBlocker(flight, "departure")) return false;
    if (this.priorityRunwayCrossing(runway, flight.id)) return false;
    for (const [reservedRunway, owner] of this.runwayReservations) {
      if (owner !== flight.id && this.runwaysConflict(runway, reservedRunway))
        return false;
    }
    for (const other of this.state.flights) {
      if (other === flight) continue;
      // A departure must fit ahead of the complete arrival sequence. Waiting
      // until an aircraft is on short final can commit a long takeoff roll
      // that is still active when that arrival lands and exits beside it.
      if (
        other.motion.protectedRunwayIds.some((occupiedRunway) =>
          this.runwaysConflict(runway, occupiedRunway),
        )
      )
        return false;
      // Airborne and committed operations protect their assigned runway.
      // Surface traffic protects the explicit pavement IDs above; otherwise a
      // taxiway crossing is easily confused with that aircraft's destination
      // runway on the opposite side of the airport.
      const protectsAssignedRunway =
        other.phase === "approach" ||
        other.phase === "landing" ||
        (other.phase === "taxi-out" && Boolean(other.runwayEntryCleared)) ||
        other.phase === "takeoff";
      if (protectsAssignedRunway && this.runwaysConflict(runway, other.runway))
        return false;
    }
    // This method is reached after runway-entry clearance in the normal
    // lifecycle. Keep the sweep guard for defensive callers that have not
    // committed the aircraft yet, but do not make a lined-up departure wait
    // on surface traffic that is already required to yield to it.
    if (!flight.runwayEntryCleared && this.departurePathBlocker(flight))
      return false;
    this.runwayReservations.set(runway, flight.id);
    for (const crossing of this.intersectingRunways(runway))
      this.runwayReservations.set(crossing, flight.id);
    return true;
  }

  private runwayReleaseBlocker(
    flight: Flight,
    kind: "arrival" | "departure",
  ): string | null {
    const physicalRelease = runwayReleaseReason(
      separationRuleset(this.state.separationRuleset),
      this.config,
      this.runwayOperationHistory,
      this.state.elapsed,
      {
        runwayId: flight.runway,
        operatingEnd: flight.operatingEnd,
        kind,
        wakeClass: flight.wakeClass,
      },
    );
    if (physicalRelease) return physicalRelease;
    if (kind !== "departure" || !this.isAutomaticMode()) return null;

    // A continuous departure stream can otherwise consume every converging
    // runway-release interval just before the invisible arrival meter becomes
    // eligible. Once the head arrival has waited through a normal sequencing
    // window, reserve one short airport-wide arrival opening. Existing
    // arrivals still keep their ordinary runway priority and capacity limits;
    // physical separation remains authoritative. This only prevents Auto/
    // Watch from starving one traffic direction with a succession of
    // individually legal clearances.
    const headArrival = this.state.trafficFlow.arrivalQueue[0];
    const arrivalWindowDue =
      headArrival &&
      this.state.elapsed - headArrival.createdAtSeconds >= 45 &&
      headArrival.releaseSlotSeconds <= this.state.elapsed + 30;
    const runwaySpacingIsCurrentConstraint =
      /^\d+s behind .+ · \d+s .+ interval ·/.test(
        this.lastArrivalAdmissionReason,
      );
    return arrivalWindowDue && runwaySpacingIsCurrentConstraint
      ? `arrival meter protects ${headArrival.id} release window`
      : null;
  }

  private recordRunwayOperation(
    flight: Flight,
    kind: "arrival" | "departure",
  ): void {
    this.runwayOperationHistory.push({
      flightId: flight.id,
      callsign: flight.callsign,
      runwayId: flight.runway,
      operatingEnd: flight.operatingEnd,
      kind,
      wakeClass: flight.wakeClass,
      atSeconds: this.state.elapsed,
    });
    if (this.runwayOperationHistory.length > 100)
      this.runwayOperationHistory.splice(
        0,
        this.runwayOperationHistory.length - 100,
      );
  }

  /**
   * Protect the complete low-altitude departure path before committing an
   * aircraft to the roll. Generated and imported layouts can contain a
   * parallel taxi segment close enough that two rendered wings would overlap
   * even though the taxi aircraft is no longer inside a runway crossing.
   */
  private departurePathBlocker(flight: Flight): Flight | undefined {
    const departureSweep = this.departureCollisionSweep(flight);
    const previewWake = flight.wakeClass;
    const preview: Flight = {
      ...flight,
      phase: "takeoff",
      progress: 0,
      phaseElapsed: 0,
      duration: this.phaseDuration(flight.aircraft, "takeoff", flight.runway),
      motion: { ...flight.motion },
      kinematics: { ...flight.kinematics },
    };
    const surfaceTraffic = this.state.flights.filter(
      (other) =>
        other.id !== flight.id &&
        (other.phase === "taxi-in" ||
          other.phase === "resting" ||
          other.phase === "taxi-out"),
    );
    for (const other of surfaceTraffic) {
      // Include a short taxi look-ahead to cover the phase-transition tick,
      // but do not reserve against the aircraft's entire future route. The
      // shared surface arbiter will hold that aircraft if it later approaches
      // a committed runway sweep.
      const lookAhead = Math.min(0.025, 1 - other.progress);
      for (let surfaceIndex = 0; surfaceIndex <= 4; surfaceIndex += 1) {
        const surfaceProgress = other.progress + (lookAhead * surfaceIndex) / 4;
        const otherEnvelope = aircraftCollisionEnvelope(
          this.config,
          other,
          surfaceProgress,
        );
        if (
          this.surfaceEnvelopeConflictsDepartureSweep(
            otherEnvelope,
            other,
            previewWake,
            preview.runway,
            departureSweep,
          )
        )
          return other;
      }
    }
    return undefined;
  }

  private departureCollisionSweep(flight: Flight): AircraftCollisionSweep {
    const signature = [
      flight.aircraft,
      flight.runway,
      flight.operatingEnd,
      this.state.runwayConfigurationId,
    ].join(":");
    const cached = this.departureSweepCache.get(flight);
    if (cached?.signature === signature) return cached.sweep;
    const preview: Flight = {
      ...flight,
      phase: "takeoff",
      progress: 0,
      phaseElapsed: 0,
      duration: this.phaseDuration(flight.aircraft, "takeoff", flight.runway),
      motion: { ...flight.motion },
      kinematics: { ...flight.kinematics },
    };
    syncFlightMotion(this.config, preview);
    const margin = this.config.scope === "center" ? 0.35 : 1.2;
    const sweep = buildAircraftCollisionSweep(
      Array.from({ length: 193 }, (_, sampleIndex) => {
        const envelope = aircraftCollisionEnvelope(
          this.config,
          preview,
          sampleIndex / 192,
        );
        return { ...envelope, bodyRadius: envelope.bodyRadius + margin };
      }),
    );
    this.departureSweepCache.set(flight, { signature, sweep });
    return sweep;
  }

  private surfaceEnvelopeConflictsDepartureSweep(
    surfaceEnvelope: ReturnType<typeof aircraftCollisionEnvelope>,
    surfaceFlight: Flight,
    departureWake: Flight["wakeClass"],
    departureRunway: number,
    departureSweep: AircraftCollisionSweep,
  ): boolean {
    const radius = surfaceEnvelope.bodyRadius + PHYSICAL_GAP / 2;
    if (
      surfaceEnvelope.x + radius < departureSweep.minimumX ||
      surfaceEnvelope.x - radius > departureSweep.maximumX ||
      surfaceEnvelope.y + radius < departureSweep.minimumY ||
      surfaceEnvelope.y - radius > departureSweep.maximumY
    )
      return false;
    let previousDepartureEnvelope:
      (typeof departureSweep.envelopes)[number] | undefined;
    for (const protectedDepartureEnvelope of departureSweep.envelopes) {
      const conflict = detectFlightConflict(
        protectedDepartureEnvelope,
        surfaceEnvelope,
        departureWake,
        surfaceFlight.wakeClass,
        this.runwaysConflict(departureRunway, surfaceFlight.runway),
        false,
      );
      if (
        conflict ||
        detectCommittedRunwaySweepConflict(
          surfaceEnvelope,
          protectedDepartureEnvelope,
        )
      )
        return true;
      if (
        previousDepartureEnvelope &&
        detectCommittedRunwaySweepSegmentConflict(
          surfaceEnvelope,
          previousDepartureEnvelope,
          protectedDepartureEnvelope,
        )
      )
        return true;
      previousDepartureEnvelope = protectedDepartureEnvelope;
    }
    return false;
  }

  private committedDepartureCorridorBlocker(
    flight: Flight,
    departures: readonly Flight[],
  ): Flight | undefined {
    if (flight.phase !== "taxi-in" && flight.phase !== "taxi-out")
      return undefined;
    for (const departure of departures) {
      if (departure.id === flight.id) continue;
      const sweep = this.departureCollisionSweep(departure);
      const currentEnvelope = aircraftCollisionEnvelope(this.config, flight);
      // A flight already inside the corridor must be allowed to vacate. The
      // runway-entry clearance gate prevents this initial condition, while
      // this lookahead prevents a clear aircraft from entering afterward.
      if (
        this.surfaceEnvelopeConflictsDepartureSweep(
          currentEnvelope,
          flight,
          departure.wakeClass,
          departure.runway,
          sweep,
        )
      )
        continue;
      const horizon = this.progressAfterTravelDistance(
        flight,
        SURFACE_RESERVATION_LOOKAHEAD_M,
      );
      for (let sampleIndex = 1; sampleIndex <= 8; sampleIndex += 1) {
        const progress =
          flight.progress + ((horizon - flight.progress) * sampleIndex) / 8;
        const envelope = aircraftCollisionEnvelope(
          this.config,
          flight,
          progress,
        );
        if (
          this.surfaceEnvelopeConflictsDepartureSweep(
            envelope,
            flight,
            departure.wakeClass,
            departure.runway,
            sweep,
          )
        )
          return departure;
      }
    }
    return undefined;
  }

  /** Protect final approach, flare, rollout, and runway exit before spawning. */
  private arrivalPathBlocker(flight: Flight): Flight | undefined {
    const landingPreview: Flight = {
      ...flight,
      phase: "landing",
      progress: 0,
      phaseElapsed: 0,
      duration: this.phaseDuration(
        flight.aircraft,
        "landing",
        flight.runway,
        flight.runwayExit,
      ),
      motion: { ...flight.motion },
      kinematics: { ...flight.kinematics },
    };
    syncFlightMotion(this.config, landingPreview);
    const margin = this.config.scope === "center" ? 0.35 : 1.2;
    const arrivalSweep = [flight, landingPreview].flatMap((preview) =>
      Array.from({ length: 65 }, (_, sampleIndex) => {
        const envelope = aircraftCollisionEnvelope(
          this.config,
          preview,
          sampleIndex / 64,
        );
        return { ...envelope, bodyRadius: envelope.bodyRadius + margin };
      }),
    );
    for (const other of this.state.flights) {
      if (
        other.phase !== "taxi-in" &&
        other.phase !== "resting" &&
        other.phase !== "taxi-out"
      )
        continue;
      const surfaceEnvelope = aircraftCollisionEnvelope(this.config, other);
      let previousArrivalEnvelope: (typeof arrivalSweep)[number] | undefined;
      for (const protectedArrivalEnvelope of arrivalSweep) {
        const conflict = detectFlightConflict(
          protectedArrivalEnvelope,
          surfaceEnvelope,
          flight.wakeClass,
          other.wakeClass,
          this.runwaysConflict(flight.runway, other.runway),
          false,
        );
        if (
          conflict ||
          detectCommittedRunwaySweepConflict(
            surfaceEnvelope,
            protectedArrivalEnvelope,
          )
        )
          return other;
        if (
          previousArrivalEnvelope &&
          detectCommittedRunwaySweepSegmentConflict(
            surfaceEnvelope,
            previousArrivalEnvelope,
            protectedArrivalEnvelope,
          )
        )
          return other;
        previousArrivalEnvelope = protectedArrivalEnvelope;
      }
    }
    return undefined;
  }

  private canStartTaxiOut(flight: Flight, runway: number): boolean {
    void flight;
    return !runwayClosedByDisruption(this.state.surfaceDisruptions, runway);
  }

  private selectDepartureRunway(flight: Flight): number | null {
    const candidates = this.config.runways
      .filter(
        (runway) =>
          (this.runwayRole(runway.id) === "departure" ||
            this.runwayRole(runway.id) === "mixed") &&
          !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id) &&
          this.runwaySupportsCurrentCondition(
            runway,
            flight.aircraft,
            "takeoff",
          ),
      )
      .sort(
        (first, second) =>
          this.headwindComponent(second.id) - this.headwindComponent(first.id),
      );
    if (candidates.length === 0) return null;
    const requestedSandboxRunway = this.state.sandbox.active
      ? this.state.sandbox.injections.find(
          (request) =>
            request.direction === "departure" &&
            request.runwayId !== null &&
            request.releasedFlightIds.includes(flight.id),
        )?.runwayId
      : undefined;
    if (
      requestedSandboxRunway !== undefined &&
      requestedSandboxRunway !== null
    ) {
      const requested = candidates.find(
        (runway) => runway.id === requestedSandboxRunway,
      );
      if (requested && this.canStartTaxiOut(flight, requested.id))
        return requested.id;
    }
    const offset = flight.id % candidates.length;
    const rotated = [
      ...candidates.slice(offset),
      ...candidates.slice(0, offset),
    ];
    return (
      rotated.find((runway) => this.canStartTaxiOut(flight, runway.id))?.id ??
      null
    );
  }

  private calculateApproachCapacity(): number {
    const rules = separationRuleset(this.state.separationRuleset);
    const arrivals = this.config.runways.filter((runway) => {
      const role = this.runwayRole(runway.id);
      return role === "arrival" || role === "mixed";
    });
    const independentArrivals: number[] = [];
    for (const runway of arrivals) {
      if (
        independentArrivals.every((other) =>
          runwayPairIndependent(
            this.config,
            this.state,
            rules,
            runway.id,
            other,
          ),
        )
      )
        independentArrivals.push(runway.id);
    }
    const departures = this.config.runways.filter((runway) => {
      const role = this.runwayRole(runway.id);
      return role === "departure" || role === "mixed";
    }).length;
    const maximumCapacity = this.config.code === "ORD" ? 4 : 3;
    return Math.max(
      1,
      Math.min(
        maximumCapacity,
        independentArrivals.length,
        Math.max(1, departures + 1),
      ),
    );
  }

  private weatherApproachCapacity(): number {
    const density = trafficDensityProfile(this.state.trafficFlow.density);
    const physicalRunways = this.config.runways.filter((runway) => {
      const role = this.runwayRole(runway.id);
      return (
        (role === "arrival" || role === "mixed") &&
        !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id)
      );
    }).length;
    const rules = separationRuleset(this.state.separationRuleset);
    const environmentalCapacity = weatherCapacityMultiplier(
      rules,
      this.state.weather,
    );
    const approachCapacity = Math.max(
      1,
      Math.min(
        physicalRunways,
        Math.ceil(
          this.calculateApproachCapacity() *
            density.arrivalCapacityMultiplier *
            environmentalCapacity,
        ),
      ),
    );
    if (this.state.scenario === "emergency") return 1;
    if (this.state.scenario === "training") return 1;
    if (this.state.scenario === "storm") return Math.min(2, approachCapacity);
    if (this.state.weather.condition === "thunderstorm")
      return Math.min(1, approachCapacity);
    if (this.state.weather.condition === "snow")
      return Math.min(2, approachCapacity);
    if (this.state.weather.condition === "fog")
      return Math.min(2, approachCapacity);
    if (this.state.weather.condition === "rain")
      return Math.min(3, approachCapacity);
    if (this.state.weather.condition === "haze")
      return Math.min(3, approachCapacity);
    return approachCapacity;
  }

  private arrivalSpacing(profile?: ReturnType<typeof aircraftProfile>): number {
    const base =
      this.config.scope === "center"
        ? Math.max(6, this.config.trafficInterval * 0.76)
        : Math.max(6.5, this.config.trafficInterval * 0.95);
    const scenarioMultiplier =
      this.state.scenario === "storm"
        ? 1.55
        : this.state.scenario === "closure"
          ? 1.18
          : this.state.scenario === "training"
            ? 2.1
            : this.state.scenario === "emergency"
              ? 1.35
              : 1;
    const rules = separationRuleset(this.state.separationRuleset);
    const wakeMultiplier = profile
      ? Math.max(
          1,
          rules.wakeSeconds[profile.wakeClass] /
            Math.max(1, rules.runwayBaseSeconds.arrival),
        )
      : 1;
    const profileMultiplier = this.operationStateAt().arrivalIntervalMultiplier;
    const density = trafficDensityProfile(this.state.trafficFlow.density);
    const referenceSpeedKts = profile?.approachKts ?? 140;
    const physicalRadarSeconds =
      (requiredRadarSeparationNm(rules, this.state.weather) * 1_852) /
      Math.max(1, referenceSpeedKts * KNOT_TO_MPS) /
      Math.max(1, this.calculateApproachCapacity());
    const objective = trafficFlowObjectiveProfile(
      this.state.trafficFlow.objective,
    );
    const scenarioBase = Math.max(
      (base *
        scenarioMultiplier *
        wakeMultiplier *
        Math.max(0.58, Math.min(1.85, profileMultiplier)) *
        objective.arrivalSpacingMultiplier) /
        density.arrivalCapacityMultiplier,
      physicalRadarSeconds,
    );
    if (this.state.weather.condition === "thunderstorm")
      return scenarioBase * 1.8;
    if (this.state.weather.condition === "fog") return scenarioBase * 1.55;
    if (this.state.weather.condition === "snow") return scenarioBase * 1.42;
    if (this.state.weather.condition === "rain") return scenarioBase * 1.2;
    if (this.state.weather.condition === "haze") return scenarioBase * 1.1;
    return scenarioBase;
  }

  private createOperationPlan(
    direction: FlightOperationPlan["direction"],
    trafficClass: OperationTrafficClass,
    state = this.operationStateAt(),
  ): FlightOperationPlan {
    return {
      trafficClass,
      direction,
      periodId: state.periodId,
      periodLabel: state.periodLabel,
      scheduledLocalMinute: state.localMinute,
      demandMultiplier: state.demandMultiplier,
    };
  }

  private hasUsableRunwayPair(aircraft: AircraftModel): boolean {
    const hasArrival = this.config.runways.some(
      (runway) =>
        (this.runwayRole(runway.id) === "arrival" ||
          this.runwayRole(runway.id) === "mixed") &&
        !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id) &&
        this.runwaySupportsCurrentCondition(runway, aircraft, "landing"),
    );
    const hasDeparture = this.config.runways.some(
      (runway) =>
        (this.runwayRole(runway.id) === "departure" ||
          this.runwayRole(runway.id) === "mixed") &&
        !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id) &&
        this.runwaySupportsCurrentCondition(runway, aircraft, "takeoff"),
    );
    return hasArrival && hasDeparture;
  }

  private registrationFor(airlineCode: AirlineCode, id: number): string {
    const airline = airlineProfile(airlineCode);
    const suffix = String(
      100 + ((id * 73 + Math.abs(this.config.seed)) % 890),
    ).padStart(3, "0");
    return `${airline.registrationPrefix}${suffix}${airlineCode === "UA" ? "U" : airlineCode === "AA" ? "A" : ""}`;
  }

  private terminalProcedure(
    kind: TerminalProcedureKind,
    runway: number,
    flightId: number,
  ): SelectedTerminalProcedure {
    return selectTerminalProcedure(this.config.airspaceProgram, {
      kind,
      runwayId: runway,
      operatingEnd: this.preferredOperatingEnd(runway),
      configurationId: this.state.runwayConfigurationId,
      condition: this.state.weather.condition,
      flightId,
    });
  }

  private navigationFor(
    selected: SelectedTerminalProcedure,
    direction: "arrival" | "departure",
  ): FlightNavigationState {
    return {
      schemaVersion: 1,
      procedureDataVersion: this.config.airspaceProgram.dataVersion,
      procedureId: selected.procedure.id,
      transitionId: selected.transition.id,
      routeFixIds: [...selected.routeFixIds],
      activeFixIndex: 0,
      approachCleared: false,
      departureHeadingDegrees: selected.procedure.initialHeadingDegrees,
      initialClimbAltitudeFt: selected.procedure.initialClimbAltitudeFt,
      handoffFixId: selected.procedure.handoffFixId,
      frequencyOwner: direction === "arrival" ? "approach" : "ramp",
      handoffStatus: "owned",
      readbackStatus: "not-required",
      missedApproachId: selected.procedure.missedApproachId,
    };
  }

  private activeRunwayDesignation(runwayId: number): string {
    return activeRunwayDesignation(
      this.config,
      this.state.activeRunwayEnds,
      runwayId,
    );
  }

  private phaseDuration(
    aircraft: AircraftModel,
    phase: FlightPhase,
    runwayId = 0,
    runwayExit?: FlightRunwayExitState,
  ): number {
    const profile = aircraftProfile(aircraft);
    if (phase === "resting") return PHASE_DURATION.resting;
    if (phase === "approach") {
      const distanceMeters =
        (this.config.scope === "center" ? 272 : 182) * WORLD_METERS_PER_UNIT;
      const meanApproachMps = (profile.approachKts + 16) * KNOT_TO_MPS;
      const base = distanceMeters / meanApproachMps;
      const turnFactor = Math.pow(profile.turnRadiusM / 1_000, 0.08);
      return (
        base *
        turnFactor *
        (1_800 / profile.descentFpm) ** 0.08 *
        this.weatherDurationMultiplier(phase)
      );
    }
    if (phase === "landing") {
      return (
        landingTrajectoryTiming(this.config, runwayId, aircraft, runwayExit)
          .totalSeconds *
        (runwayExit ? 1 : this.weatherDurationMultiplier(phase))
      );
    }
    if (phase === "taxi-in" || phase === "taxi-out")
      return (
        60 * (18 / profile.taxiKts) * this.weatherDurationMultiplier(phase)
      );
    if (phase === "takeoff") {
      return (
        departureTrajectoryTiming(this.config, runwayId, aircraft)
          .totalSeconds * this.weatherDurationMultiplier(phase)
      );
    }
    return PHASE_DURATION[phase] * this.weatherDurationMultiplier(phase);
  }

  private updateFlightKinematics(
    flight: Flight,
    delta: number,
    moving: boolean,
    previousProgress: number,
    previousMotion: Flight["motion"],
    requestedSpeedKts: number,
  ): void {
    if (delta <= 0) return;
    const telemetry = flight.kinematics;
    const previousGroundSpeed = telemetry.groundSpeedKts;
    const previousAltitude = telemetry.altitudeFt;
    const currentAltitude = this.motionAltitudeFt(flight);
    const travelledMeters = moving
      ? Math.max(
          0,
          flight.motion.distanceAlongM - previousMotion.distanceAlongM,
        )
      : 0;
    const measuredSpeed =
      travelledMeters / Math.max(0.001, delta) / KNOT_TO_MPS;
    // The integrated speed is authoritative. A path may end partway through a
    // fixed tick; carrying the requested speed across the phase boundary
    // avoids an artificial touchdown/taxi handoff deceleration.
    const groundSpeed = moving ? requestedSpeedKts : 0;
    const airborne = !flight.motion.onGround;
    telemetry.groundSpeedKts = groundSpeed;
    telemetry.airspeedKts = Math.max(
      0,
      groundSpeed + (airborne ? this.headwindComponent(flight.runway) : 0),
    );
    telemetry.accelerationMps2 =
      ((groundSpeed - previousGroundSpeed) * KNOT_TO_MPS) / delta;
    telemetry.altitudeFt = currentAltitude;
    telemetry.verticalSpeedFpm =
      ((currentAltitude - previousAltitude) / delta) * 60;

    if (flight.phase !== "resting") {
      const burnPercent = Math.min(
        telemetry.fuelPercent,
        fuelBurnPercentPerSecond(flight.aircraft, flight.phase, moving) * delta,
      );
      telemetry.fuelPercent = Math.max(0, telemetry.fuelPercent - burnPercent);
      const burnKg =
        (burnPercent / 100) * aircraftProfile(flight.aircraft).usableFuelKg;
      this.metrics.fuelBurnKg += burnKg;
      if (
        flight.safetyHold ||
        flight.controlHold ||
        flight.automaticHold ||
        Boolean(flight.navigation.hold)
      ) {
        this.metrics.holdingFuelBurnKg += burnKg;
      }
    }
    void measuredSpeed;
    void previousProgress;
  }

  private motionAltitudeFt(flight: Flight): number {
    if (flight.phase === "approach")
      return Math.max(50, (flight.motion.z - 4.2) * 100 + 50);
    if (flight.phase === "landing")
      return flight.motion.stage === "flare"
        ? 50 * (1 - flight.motion.stageProgress)
        : 0;
    if (flight.phase === "takeoff")
      return Math.max(0, (flight.motion.z - 2) * 100);
    return 0;
  }

  private targetGroundSpeedKts(flight: Flight): number {
    if (flight.phase === "resting") return 0;
    const profile = aircraftProfile(flight.aircraft);
    const pace = Math.max(
      0.55,
      Math.min(
        flight.phase === "taxi-in" || flight.phase === "taxi-out" ? 1 : 1.28,
        flight.controlPace ?? 1,
      ),
    );
    const surfaceWeather = taxiSpeedFactor(this.state.weather);
    let target = profile.taxiKts;
    const surfaceMotion =
      flight.phase === "taxi-in" || flight.phase === "taxi-out"
        ? sampleAircraftSurfaceMotion(
            this.config.surfaceGraph,
            flight.surfaceRoute,
            flight.surfaceRouteEdges,
            flight.progress,
            profile,
          )
        : null;
    if (flight.phase === "taxi-out" && flight.motion.stage === "pushback") {
      target =
        (flight.wakeClass === "heavy"
          ? 2.6
          : flight.category === "regional"
            ? 3.6
            : 3.2) * surfaceWeather;
      return target * pace;
    }
    if (flight.phase === "approach")
      target = flight.diversion
        ? profile.approachKts + 34
        : flight.goAround
          ? profile.approachKts + 22
          : profile.approachKts + this.lerp(18, 2, flight.progress);
    if (
      (flight.phase === "approach" ||
        (flight.phase === "takeoff" && !flight.motion.onGround)) &&
      flight.navigation.assignedSpeedKts !== undefined
    ) {
      target = flight.navigation.assignedSpeedKts;
    }
    if (flight.phase === "landing") {
      if (flight.motion.stage === "flare") target = profile.approachKts;
      else if (
        flight.motion.stage === "touchdown" ||
        flight.motion.stage === "rollout"
      ) {
        target = this.lerp(
          profile.approachKts,
          flight.runwayExit?.targetExitSpeedKts ?? profile.taxiKts + 3,
          flight.motion.stageProgress,
        );
      } else
        target = flight.runwayExit?.targetExitSpeedKts ?? profile.taxiKts + 3;
    }
    if (flight.phase === "takeoff") {
      if (flight.motion.stage === "lineup") target = profile.taxiKts;
      else if (
        flight.motion.stage === "takeoff-roll" ||
        flight.motion.stage === "rotation"
      )
        target = profile.approachKts * 1.12;
      else target = profile.approachKts * 1.34;
    }
    if (flight.phase === "taxi-in" || flight.phase === "taxi-out") {
      target = Math.min(target, surfaceMotion?.speedLimitKts ?? target);
      if (surfaceMotion && !surfaceMotion.routeClearanceOk) target = 0;
      target *= surfaceWeather;
    }
    return target * pace;
  }

  private acceleratedSpeedKts(
    flight: Flight,
    targetSpeedKts: number,
    delta: number,
  ): number {
    const profile = aircraftProfile(flight.aircraft);
    const current = Math.max(0, flight.kinematics.groundSpeedKts);
    const onTaxiway = flight.phase === "taxi-in" || flight.phase === "taxi-out";
    const brakingWeather = onTaxiway
      ? taxiBrakingFactor(this.state.weather)
      : 1;
    const acceleration =
      targetSpeedKts >= current
        ? onTaxiway
          ? profile.taxiAccelerationMps2
          : profile.accelerationMps2
        : (onTaxiway ? profile.taxiBrakingMps2 : profile.brakingMps2) *
          brakingWeather;
    const changeKts = (acceleration * delta) / KNOT_TO_MPS;
    if (targetSpeedKts > current)
      return Math.min(targetSpeedKts, current + changeKts);
    return Math.max(targetSpeedKts, current - changeKts);
  }

  private updateMotionHealth(
    flight: Flight,
    delta: number,
    moved: boolean,
  ): void {
    if (flight.phase === "resting" || moved) {
      this.stationarySeconds.set(flight.id, 0);
      this.surfaceReservationBlockerRecovery.delete(flight);
      return;
    }
    const previous = this.stationarySeconds.get(flight.id) ?? 0;
    const current = previous + delta;
    this.stationarySeconds.set(flight.id, current);
    this.metrics.longestHoldSeconds = Math.max(
      this.metrics.longestHoldSeconds,
      current,
    );
    const expected = Boolean(
      flight.controlHold ||
      flight.automaticHold ||
      flight.crossingHoldRunway !== undefined ||
      deicingMovementLimit(flight) !== null ||
      flight.safetyHold ||
      // A completed trajectory can wait briefly for its collision-checked
      // phase transition. There is no remaining path distance to advance, so
      // treating that protected handoff as a motion discontinuity produces a
      // false pause alert even though the safety reason is explicit.
      flight.progress >= 1 - 1e-9 ||
      (flight.phase === "taxi-out" && flight.progress >= 0.985) ||
      (flight.phase === "takeoff" && !flight.takeoffCleared),
    );
    if (!expected && previous < 0.75 && current >= 0.75)
      this.metrics.unexplainedPauses += 1;
  }

  private approachStartAltitude(aircraft: AircraftModel): number {
    const profile = aircraftProfile(aircraft);
    const duration = this.phaseDuration(aircraft, "approach");
    return Math.round((50 + (profile.descentFpm * duration) / 60) / 50) * 50;
  }

  private lerp(start: number, end: number, amount: number): number {
    return start + (end - start) * amount;
  }

  private motionStart(
    flight: Flight,
  ): NonNullable<Flight["navigation"]["vector"]>["start"] {
    return {
      x: flight.motion.x,
      y: flight.motion.y,
      z: flight.motion.z,
      heading: flight.motion.heading,
      pitch: flight.motion.pitch,
      bank: flight.motion.bank,
      onGround: flight.motion.onGround,
      groundBlend: flight.motion.groundBlend,
      protectedRunway: flight.motion.protectedRunway,
    };
  }

  private mathAngleToAviationDegrees(angle: number): number {
    return (((90 - (angle * 180) / Math.PI) % 360) + 360) % 360;
  }

  private originFor(id: number): string {
    if (this.config.code === "LOCAL")
      return ["KSTL", "KMSP", "KIND", "KCMH"][id % 4];
    const origins: Record<string, string[]> = {
      ORD: ["KATL", "KDFW", "KLAX", "KJFK"],
      ATL: ["KORD", "KMIA", "KDFW", "KCLT"],
      DXB: ["EGLL", "WSSS", "VIDP", "LTFM"],
      HND: ["RJAA", "RJBB", "RKSI", "RCTP"],
      DFW: ["KDEN", "KPHX", "KORD", "KIAH"],
      LHR: ["KJFK", "LFPG", "EDDF", "OMDB"],
      IST: ["EGLL", "OMDB", "EDDF", "LIRF"],
      DEN: ["KORD", "KLAX", "KDFW", "KSEA"],
      LAX: ["KSEA", "KSFO", "KLAS", "KPHX"],
      JFK: ["KBOS", "KORD", "KMCO", "KATL"],
    };
    return origins[this.config.code]?.[id % 4] ?? "KXXX";
  }

  private taxiwayName(runway: number): string {
    if (this.config.code !== "ORD")
      return `TAXIWAY ${String.fromCharCode(65 + (runway % 20))}`;
    const centerY = this.config.runways[runway].center[1];
    return centerY >= 8
      ? "NORTH PERIMETER"
      : centerY <= -8
        ? "SOUTH PERIMETER"
        : "EAST PERIMETER";
  }

  private refreshDeicingPlansForWeather(): void {
    const winter = winterDeicingRequired(this.state.weather);
    for (const flight of this.state.flights) {
      if (!winter) {
        if (
          flight.phase === "resting" ||
          (flight.phase === "taxi-out" &&
            [
              "planned",
              "enroute",
              "queued",
              "positioning",
              "treating",
              "unavailable",
            ].includes(flight.deicing.status))
        )
          markDeicingNotRequired(
            flight,
            "Frozen precipitation ended; treatment is no longer required.",
          );
        continue;
      }
      if (flight.phase === "resting") {
        if (
          flight.deicing.status === "planned" ||
          flight.deicing.status === "unavailable"
        )
          continue;
        this.assignSurfaceRoute(flight, "resting");
        this.events.push({
          type: "deicing-planned",
          flight,
          taxiway: flight.taxiway,
          detail: flight.deicing.facilityName
            ? `${flight.deicing.facilityName} lane ${flight.deicing.laneNumber} reserved after pushback`
            : flight.deicing.reason,
        });
        continue;
      }
      if (
        flight.phase === "taxi-out" &&
        flight.deicing.status === "not-required"
      ) {
        // A weather override is applied after startup traffic is seeded. A
        // departure already well clear of its stand is recorded as pretreated
        // instead of being teleported onto a newly generated route.
        markStartupPretreated(flight, this.state.elapsed, this.config);
        this.events.push({
          type: "deicing-complete",
          flight,
          taxiway: flight.taxiway,
          detail: `pre-entry treatment recorded · ${Math.round(flight.deicing.holdoverSeconds)} s holdover`,
        });
      }
    }
  }

  private updateDeicingOperations(delta: number): void {
    if (!winterDeicingRequired(this.state.weather)) return;
    const taxiOut = this.state.flights
      .filter(
        (flight) => flight.phase === "taxi-out" && flight.deicing.required,
      )
      .sort((first, second) => first.id - second.id);

    for (const flight of taxiOut) {
      const deicing = flight.deicing;
      if (deicing.status === "protected") {
        deicing.holdoverRemainingSeconds = Math.max(
          0,
          (deicing.holdoverExpiresSeconds ?? this.state.elapsed) -
            this.state.elapsed,
        );
        if (deicing.holdoverRemainingSeconds <= 1e-6) {
          deicing.status = "expired";
          deicing.reason =
            "Holdover protection expired before runway entry; return treatment is required.";
          this.events.push({
            type: "deicing-expired",
            flight,
            taxiway: flight.taxiway,
            detail: deicing.reason,
          });
        }
      }
      if (
        deicing.status === "enroute" &&
        flight.progress >= deicing.queueHoldProgress - 0.0002
      ) {
        deicing.status = "queued";
        deicing.queueEnteredSeconds = this.state.elapsed;
        deicing.reason = `Waiting for ${deicing.facilityName} lane ${deicing.laneNumber}.`;
        this.events.push({
          type: "deicing-queue",
          flight,
          taxiway: flight.taxiway,
          detail: deicing.reason,
        });
      }
      if (
        deicing.status === "positioning" &&
        flight.progress >= deicing.treatmentProgress - 0.0002
      ) {
        deicing.status = "treating";
        deicing.treatmentStartedSeconds = this.state.elapsed;
        deicing.treatmentElapsedSeconds = 0;
        deicing.reason = `${deicing.fluid} treatment in progress.`;
        this.events.push({
          type: "deicing-start",
          flight,
          taxiway: flight.taxiway,
          detail: `${deicing.facilityName} lane ${deicing.laneNumber} · ${deicing.fluid}`,
        });
      }
      if (deicing.status === "treating") {
        deicing.treatmentElapsedSeconds = Math.min(
          deicing.treatmentDurationSeconds,
          deicing.treatmentElapsedSeconds + delta,
        );
        if (
          deicing.treatmentElapsedSeconds >=
          deicing.treatmentDurationSeconds - 1e-6
        ) {
          deicing.status = "protected";
          deicing.treatmentCompletedSeconds = this.state.elapsed;
          deicing.holdoverExpiresSeconds =
            this.state.elapsed + deicing.holdoverSeconds;
          deicing.holdoverRemainingSeconds = deicing.holdoverSeconds;
          deicing.queuePosition = 0;
          deicing.reason = `Treatment complete; ${Math.round(deicing.holdoverSeconds)} seconds of holdover protection.`;
          this.events.push({
            type: "deicing-complete",
            flight,
            taxiway: flight.taxiway,
            detail: `${deicing.fluid} complete · holdover expires ${Math.round(deicing.holdoverExpiresSeconds)} s`,
          });
        }
      }
    }

    const queues = new Map<string, Flight[]>();
    for (const flight of taxiOut.filter(
      (candidate) => candidate.deicing.status === "queued",
    )) {
      const laneId = flight.deicing.laneId;
      if (!laneId) continue;
      const queue = queues.get(laneId) ?? [];
      queue.push(flight);
      queues.set(laneId, queue);
    }
    for (const [laneId, queue] of queues) {
      queue.sort(
        (first, second) =>
          (first.deicing.queueEnteredSeconds ?? Infinity) -
            (second.deicing.queueEnteredSeconds ?? Infinity) ||
          first.id - second.id,
      );
      queue.forEach((flight, index) => {
        flight.deicing.queuePosition = index + 1;
      });
      const occupied = taxiOut.some(
        (flight) =>
          flight.deicing.laneId === laneId &&
          (flight.deicing.status === "positioning" ||
            flight.deicing.status === "treating" ||
            (flight.deicing.status === "protected" &&
              flight.progress < flight.deicing.padExitProgress - 0.0002)),
      );
      if (occupied || !queue.length) continue;
      const released = queue[0];
      // Preserve an observable queue state for at least one fixed step. This
      // also prevents a newly arrived aircraft from claiming a lane in the
      // same arbitration pass that detected the stop line.
      if (
        (released.deicing.queueEnteredSeconds ?? this.state.elapsed) >=
        this.state.elapsed - 1e-6
      )
        continue;
      released.deicing.status = "positioning";
      released.deicing.queuePosition = 0;
      released.deicing.reason = `Lane ${released.deicing.laneNumber} released; taxi into treatment position.`;
      this.events.push({
        type: "deicing-pad-entry",
        flight: released,
        taxiway: released.taxiway,
        detail: released.deicing.reason,
      });
    }
  }

  private returnForDeicing(flight: Flight): void {
    const holdShortNode = flight.surfaceRoute?.at(-1);
    flight.deicing.cycle = Math.max(1, flight.deicing.cycle) + 1;
    const congestionPlanning = this.surfaceRoutePlanning(
      flight.id,
      this.parkedAircraftBlockedEdgeIds(flight),
    );
    const plan = planDeicingTaxiRoute(
      this.config,
      flight,
      congestionPlanning,
      holdShortNode,
    );
    if (!plan) {
      flight.deicing.status = "unavailable";
      flight.deicing.reason =
        "Holdover expired and no compatible return route to a deicing pad is available.";
      return;
    }
    applyDeicingRoutePlan(flight, plan, "enroute");
    flight.surfaceRoute = plan.route.nodeIds;
    flight.surfaceRouteEdges = plan.route.edgeIds;
    flight.surfaceRoutingCost = plan.route.routingCost;
    flight.surfaceCongestionPenalty = plan.route.congestionPenalty;
    flight.surfaceCongestedEdgeIds = plan.route.congestedEdgeIds;
    flight.progress = 0;
    flight.phaseElapsed = 0;
    flight.duration = this.surfaceRouteDuration(flight, plan.route);
    flight.pushbackProgress = 1;
    flight.pushbackReleaseProgress = 0;
    flight.tugAttached = false;
    flight.engineState = "running";
    flight.holdNotified = false;
    flight.runwayEntryCleared = false;
    flight.takeoffCleared = false;
    flight.requiredCrossings = surfaceRouteRunwayCrossings(
      this.config.surfaceGraph,
      plan.route.edgeIds,
      flight.runway,
    );
    flight.crossingClearances = [];
    flight.crossingClearanceIds = [];
    flight.crossingHoldRunway = undefined;
    flight.crossingHoldPointId = undefined;
    flight.surfaceNode = plan.route.nodeIds[0];
    flight.surfaceEdge = plan.route.edgeIds[0];
    this.updateSurfaceRouteState(flight);
    syncFlightMotion(this.config, flight);
    this.events.push({
      type: "deicing-return",
      flight,
      taxiway: flight.taxiway,
      detail: `holdover expired · returning to ${plan.facility.name} lane ${plan.lane.number} for cycle ${flight.deicing.cycle}`,
    });
  }

  private createSurfaceDisruption(
    kind: Exclude<SurfaceDisruptionKind, "disabled-aircraft">,
    targetId: string,
    source: SurfaceDisruptionSource,
    durationSeconds?: number,
    incident?: SurfaceIncidentDefinition,
  ): boolean {
    const target = resolveSurfaceDisruptionTarget(this.config, kind, targetId);
    if (!target)
      return this.rejectDecision(
        `unknown ${kind.replace("-", " ")} target ${targetId}`,
      );
    if (
      this.state.surfaceDisruptions.some(
        (candidate) =>
          candidate.kind === kind && candidate.targetId === target.targetId,
      )
    ) {
      return this.rejectDecision(
        `${target.label} already has an active restriction`,
      );
    }
    const overlapping = this.state.surfaceDisruptions.find((candidate) =>
      candidate.edgeIds.some((edgeId) => target.edgeIds.includes(edgeId)),
    );
    if (overlapping)
      return this.rejectDecision(
        `${target.label} overlaps ${overlapping.label}, which is already restricted`,
      );
    if (
      target.runwayId !== undefined &&
      !this.runwayClosureLeavesCapacity(target.runwayId)
    ) {
      return this.rejectDecision(
        `${target.label} cannot close because it removes the last usable arrival or departure runway`,
      );
    }

    const occupiedByFlight = this.state.flights.find(
      (flight) =>
        (flight.phase === "taxi-in" || flight.phase === "taxi-out") &&
        Boolean(
          flight.surfaceEdge && target.edgeIds.includes(flight.surfaceEdge),
        ),
    );
    const occupiedByVehicle = this.state.serviceVehicles.find((vehicle) =>
      Boolean(
        vehicle.currentEdge && target.edgeIds.includes(vehicle.currentEdge),
      ),
    );
    const routedVehicle =
      kind === "runway-closure"
        ? undefined
        : this.state.serviceVehicles.find(
            (vehicle) =>
              vehicle.status !== "complete" &&
              [...vehicle.outboundRouteEdges, ...vehicle.returnRouteEdges].some(
                (edgeId) => target.edgeIds.includes(edgeId),
              ),
          );
    if (
      kind !== "runway-closure" &&
      (occupiedByFlight || occupiedByVehicle || routedVehicle)
    ) {
      const occupant =
        occupiedByFlight?.callsign ??
        occupiedByVehicle?.label ??
        routedVehicle?.label ??
        "surface traffic";
      return this.rejectDecision(
        `${target.label} cannot close while ${occupant} is using or reserved on the affected pavement`,
      );
    }

    const runwayBlockers =
      target.runwayId === undefined
        ? []
        : this.runwayClosureBlockingFlights(target.runwayId);
    const status: SurfaceDisruptionState["status"] = runwayBlockers.length
      ? "pending"
      : "active";
    const duration =
      kind === "construction"
        ? Math.max(20, Math.min(600, durationSeconds ?? 90))
        : durationSeconds && durationSeconds > 0
          ? Math.max(20, Math.min(1_800, durationSeconds))
          : undefined;
    const disruption: SurfaceDisruptionState = {
      id: `SD-${this.nextDisruptionId++}`,
      kind,
      status,
      source,
      incidentKind: incident?.kind,
      targetId: target.targetId,
      label: incident ? `${incident.label} · ${target.label}` : target.label,
      edgeIds: [...target.edgeIds],
      runwayId: target.runwayId,
      taxiwayId: target.taxiwayId,
      createdAtSeconds: this.state.elapsed,
      activatedAtSeconds: status === "active" ? this.state.elapsed : undefined,
      expectedClearAtSeconds:
        status === "active" && duration
          ? this.state.elapsed + duration
          : undefined,
      durationSeconds: duration,
      recoveryProgress: 0,
      reroutedFlightIds: [],
      reason:
        status === "pending"
          ? `${incident?.label ?? "Closure"} queued until ${runwayBlockers.map((flight) => flight.callsign).join(", ")} clear protected pavement`
          : (incident?.reason ?? `${kind.replace("-", " ")} active`),
    };
    this.state.surfaceDisruptions.push(disruption);
    this.syncClosedRunwayState();
    if (target.runwayId !== undefined)
      this.rerouteApproachesFromClosedRunway(target.runwayId, disruption);
    if (status === "active") {
      if (incident) this.beginIncidentResponse(disruption, incident);
      disruption.reroutedFlightIds = this.replanSurfaceTrafficAroundDisruptions(
        disruption.id,
      );
    }
    this.updateActiveRunwayConfiguration();
    this.decisionReason = disruption.reason;
    return true;
  }

  private createDisabledAircraftDisruption(flight: Flight): void {
    const edgeId =
      flight.surfaceEdge ??
      sampleSurfaceRouteWithEdges(
        this.config.surfaceGraph,
        flight.surfaceRoute,
        flight.surfaceRouteEdges,
        flight.progress,
      )?.edge?.id;
    const disruption: SurfaceDisruptionState = {
      id: `SD-${this.nextDisruptionId++}`,
      kind: "disabled-aircraft",
      status: "active",
      source: "incident",
      targetId: String(flight.id),
      label: `${flight.callsign} disabled on ${flight.taxiway ?? "movement surface"}`,
      edgeIds: edgeId ? [edgeId] : [],
      runwayId: flight.motion.protectedRunwayIds[0],
      taxiwayId: flight.taxiway,
      flightId: flight.id,
      createdAtSeconds: this.state.elapsed,
      activatedAtSeconds: this.state.elapsed,
      recoveryProgress: 0,
      reroutedFlightIds: [],
      reason:
        "disabled aircraft reserves its occupied pavement pending recovery",
    };
    this.state.surfaceDisruptions.push(disruption);
    disruption.reroutedFlightIds = this.replanSurfaceTrafficAroundDisruptions(
      disruption.id,
    );
    if (disruption.runwayId !== undefined) {
      this.rerouteApproachesFromClosedRunway(disruption.runwayId, disruption);
      this.updateActiveRunwayConfiguration();
    }
  }

  private startDisabledRecovery(
    disruption: SurfaceDisruptionState,
    flight: Flight,
    reason: string,
  ): void {
    const duration = 28 + aircraftProfile(flight.aircraft).lengthM * 0.72;
    disruption.status = "recovering";
    disruption.recoveryStartedAtSeconds = this.state.elapsed;
    disruption.recoveryDurationSeconds = duration;
    disruption.expectedClearAtSeconds = this.state.elapsed + duration;
    disruption.reason = `${reason} · tow and inspection in progress`;
    this.events.push({
      type: "recovery-start",
      flight,
      runway: disruption.runwayId,
      taxiway: flight.taxiway,
      detail: `${disruption.label} · ${Math.ceil(duration)} s estimated recovery`,
    });
  }

  private updateSurfaceDisruptions(_delta: number): void {
    for (const disruption of [...this.state.surfaceDisruptions]) {
      if (
        disruption.status === "pending" &&
        disruption.runwayId !== undefined
      ) {
        const blockers = this.runwayClosureBlockingFlights(disruption.runwayId);
        disruption.reason = blockers.length
          ? `closure queued until ${blockers.map((flight) => flight.callsign).join(", ")} clear protected pavement`
          : `${disruption.kind.replace("-", " ")} active`;
        if (!blockers.length) {
          disruption.status = "active";
          disruption.activatedAtSeconds = this.state.elapsed;
          disruption.expectedClearAtSeconds = disruption.durationSeconds
            ? this.state.elapsed + disruption.durationSeconds
            : undefined;
          disruption.reroutedFlightIds =
            this.replanSurfaceTrafficAroundDisruptions(disruption.id);
          if (disruption.incidentKind) {
            const incident = surfaceIncidentDefinition(disruption.incidentKind);
            if (incident) this.beginIncidentResponse(disruption, incident);
          }
        }
      }
      if (disruption.kind === "disabled-aircraft") {
        const flight = this.state.flights.find(
          (candidate) => candidate.id === disruption.flightId,
        );
        if (!flight) {
          this.state.surfaceDisruptions = this.state.surfaceDisruptions.filter(
            (candidate) => candidate.id !== disruption.id,
          );
          continue;
        }
        if (disruption.status === "recovering") {
          const elapsed =
            this.state.elapsed -
            (disruption.recoveryStartedAtSeconds ?? this.state.elapsed);
          disruption.recoveryProgress = Math.max(
            0,
            Math.min(
              1,
              elapsed / Math.max(1, disruption.recoveryDurationSeconds ?? 1),
            ),
          );
          if (disruption.recoveryProgress >= 1)
            this.completeDisabledRecovery(disruption, flight);
        }
        continue;
      }
      if (disruption.incidentKind) {
        this.updateIncidentResponse(disruption);
        continue;
      }
      if (
        disruption.status === "active" &&
        disruption.expectedClearAtSeconds !== undefined &&
        this.state.elapsed >= disruption.expectedClearAtSeconds
      ) {
        this.removeSurfaceDisruption(
          disruption.id,
          `${disruption.label} inspected and reopened`,
        );
      }
    }
    const replanSecond = Math.floor(this.state.elapsed);
    if (replanSecond !== this.lastSurfaceReplanSecond) {
      this.lastSurfaceReplanSecond = replanSecond;
      for (const flight of this.state.flights.filter(
        (candidate) => candidate.surfaceReroute?.status === "holding",
      )) {
        if (
          !["enroute", "queued", "positioning", "treating"].includes(
            flight.deicing.status,
          )
        ) {
          this.replanSurfaceFlight(
            flight,
            flight.surfaceReroute?.disruptionIds ?? [],
          );
        }
      }
    }
  }

  /**
   * Incident units are ordinary reserved surface movers, not an animation.
   * They are allowed to enter the already-closed movement area only because
   * the incident itself is the Supervisor-authorized protection boundary.
   */
  private createIncidentResponseVehicle(
    disruption: SurfaceDisruptionState,
    incident: SurfaceIncidentDefinition,
  ): ServiceVehicleState | undefined {
    const targetEdge = disruption.edgeIds
      .map((edgeId) =>
        this.config.surfaceGraph.edges.find((edge) => edge.id === edgeId),
      )
      .find((edge) => Boolean(edge));
    const destinationNodeId = targetEdge?.to ?? targetEdge?.from;
    if (!destinationNodeId) return undefined;
    const nodes = surfaceNodeIndex(this.config.surfaceGraph);
    const destination = nodes.get(destinationNodeId);
    if (!destination) return undefined;
    const candidates = this.config.surfaceGraph.nodes
      .filter(
        (node) =>
          node.id !== destinationNodeId &&
          node.kind !== "runway-threshold" &&
          node.kind !== "hold-short" &&
          node.kind !== "runway-exit",
      )
      .sort(
        (first, second) =>
          Math.hypot(
            first.position[0] - destination.position[0],
            first.position[1] - destination.position[1],
          ) -
            Math.hypot(
              second.position[0] - destination.position[0],
              second.position[1] - destination.position[1],
            ) || first.id.localeCompare(second.id),
      );
    const selected = candidates
      .map((candidate) => ({
        depot: candidate,
        route: findSurfaceRoute(
          this.config.surfaceGraph,
          candidate.id,
          destinationNodeId,
        ),
      }))
      .find((candidate) => candidate.route);
    if (!selected?.route) return undefined;
    const route = selected.route;
    return {
      id: `IRV-${disruption.id}`,
      incidentResponseId: disruption.id,
      // Response units have no aircraft owner. The sentinel is deliberately
      // ignored by turnaround logic while the shared reservation/collision
      // code still treats the unit as a normal moving vehicle.
      flightId: -1,
      callsign: `OPS-${disruption.id.replace("SD-", "")}`,
      service: "maintenance",
      type: "maintenance-van",
      label: incident.responseVehicleLabel,
      status: "scheduled",
      standId: `incident-${disruption.id}`,
      zoneId: "movement-area",
      bayId: `incident-${disruption.id}`,
      standSide: "left",
      depotNodeId: selected.depot.id,
      outboundRoute: [...route.nodeIds],
      outboundRouteEdges: [...route.edgeIds],
      returnRoute: [...route.nodeIds].reverse(),
      returnRouteEdges: [...route.edgeIds].reverse(),
      // The response vehicle stops at a graph node on the affected surface;
      // it never receives a freehand route across grass or a runway.
      standPath: [[...destination.position], [...destination.position]],
      dispatchAtSeconds: this.state.elapsed,
      progress: 0,
      x: selected.depot.position[0],
      y: selected.depot.position[1],
      heading: 0,
      groundSpeedMps: 0,
      maximumSpeedMps: 8.2,
      currentNode: selected.depot.id,
      held: false,
      protectedMovementArea: false,
      // This authority is explicit and limited to the active incident's
      // already-closed target route; it does not waive collision or graph
      // reservations.
      protectedMovementAuthorized: true,
    };
  }

  private updateIncidentResponseVehicle(
    vehicle: ServiceVehicleState,
    delta: number,
  ): void {
    if (vehicle.status === "scheduled") {
      setServiceVehicleStatus(this.config.surfaceGraph, vehicle, "dispatching");
      return;
    }
    if (
      vehicle.status === "dispatching" &&
      advanceServiceVehicleMotion(this.config.surfaceGraph, vehicle, delta)
    ) {
      setServiceVehicleStatus(this.config.surfaceGraph, vehicle, "servicing");
      return;
    }
    syncServiceVehiclePose(this.config.surfaceGraph, vehicle);
  }

  private beginIncidentResponse(
    disruption: SurfaceDisruptionState,
    incident: SurfaceIncidentDefinition,
  ): void {
    disruption.responseVehicleLabel = incident.responseVehicleLabel;
    disruption.responsePhase = "en-route";
    disruption.responseStartedAtSeconds = this.state.elapsed;
    disruption.responseArrivalAtSeconds =
      this.state.elapsed + incident.responseTravelSeconds;
    disruption.responseInspectionStartedAtSeconds = undefined;
    disruption.responseInspectionDurationSeconds = incident.durationSeconds;
    disruption.recoveryProgress = 0;
    const vehicle = this.createIncidentResponseVehicle(disruption, incident);
    if (vehicle) this.state.serviceVehicles.push(vehicle);
    disruption.expectedClearAtSeconds =
      this.state.elapsed +
      incident.responseTravelSeconds +
      incident.durationSeconds;
    disruption.reason = vehicle
      ? `${incident.responseVehicleLabel} dispatched to ${disruption.label}; protected pavement remains unavailable`
      : `${incident.responseVehicleLabel} dispatch route unavailable; protected pavement remains unavailable`;
  }

  private updateIncidentResponse(disruption: SurfaceDisruptionState): void {
    const phase = disruption.responsePhase;
    if (!phase || phase === "ready-to-reopen") return;
    const startedAt = disruption.responseStartedAtSeconds ?? this.state.elapsed;
    const arrivalAt = disruption.responseArrivalAtSeconds ?? startedAt;
    if (phase === "en-route") {
      const vehicle = this.state.serviceVehicles.find(
        (candidate) => candidate.incidentResponseId === disruption.id,
      );
      if (vehicle && vehicle.status !== "servicing") {
        disruption.recoveryProgress = Math.min(0.18, vehicle.progress * 0.18);
        disruption.reason = vehicle.held
          ? `${disruption.responseVehicleLabel ?? "Airfield operations unit"} holding · ${vehicle.holdReason ?? "surface route protected"}`
          : `${disruption.responseVehicleLabel ?? "Airfield operations unit"} en route on authorized surface route`;
        return;
      }
      const travel = Math.max(1, arrivalAt - startedAt);
      disruption.recoveryProgress = Math.min(
        0.18,
        ((this.state.elapsed - startedAt) / travel) * 0.18,
      );
      if (this.state.elapsed + 1e-6 < arrivalAt) return;
      disruption.responsePhase = "inspecting";
      disruption.responseInspectionStartedAtSeconds = this.state.elapsed;
      disruption.expectedClearAtSeconds =
        this.state.elapsed +
        Math.max(1, disruption.responseInspectionDurationSeconds ?? 1);
      disruption.reason = `${disruption.responseVehicleLabel ?? "Airfield operations unit"} on scene; inspection in progress`;
      return;
    }
    const inspectionStarted =
      disruption.responseInspectionStartedAtSeconds ?? this.state.elapsed;
    const inspectionDuration = Math.max(
      1,
      disruption.responseInspectionDurationSeconds ??
        disruption.durationSeconds ??
        1,
    );
    const inspectionProgress = Math.min(
      1,
      (this.state.elapsed - inspectionStarted) / inspectionDuration,
    );
    disruption.recoveryProgress = 0.18 + inspectionProgress * 0.82;
    if (inspectionProgress < 1) return;
    disruption.responsePhase = "ready-to-reopen";
    disruption.recoveryProgress = 1;
    disruption.expectedClearAtSeconds = undefined;
    disruption.reason = `${disruption.responseVehicleLabel ?? "Airfield operations unit"} reports inspection complete; Supervisor may reopen the movement area`;
  }

  private completeDisabledRecovery(
    disruption: SurfaceDisruptionState,
    flight: Flight,
  ): void {
    this.events.push({
      type: "recovery-complete",
      flight,
      runway: disruption.runwayId,
      taxiway: flight.taxiway,
      detail: `${flight.callsign} towed clear · pavement inspection complete`,
    });
    this.state.serviceVehicles = this.state.serviceVehicles.filter(
      (vehicle) => vehicle.flightId !== flight.id,
    );
    this.state.flights = this.state.flights.filter(
      (candidate) => candidate.id !== flight.id,
    );
    this.state.surfaceDisruptions = this.state.surfaceDisruptions.filter(
      (candidate) => candidate.id !== disruption.id,
    );
    this.releaseFlightRuntimeState(flight);
    this.syncClosedRunwayState();
    this.replanSurfaceTrafficAroundDisruptions(disruption.id, true);
    this.updateActiveRunwayConfiguration();
  }

  private removeSurfaceDisruption(id: string, reason: string): boolean {
    const disruption = this.state.surfaceDisruptions.find(
      (candidate) => candidate.id === id,
    );
    if (!disruption)
      return this.rejectDecision(`unknown surface restriction ${id}`);
    this.state.surfaceDisruptions = this.state.surfaceDisruptions.filter(
      (candidate) => candidate.id !== id,
    );
    this.state.serviceVehicles = this.state.serviceVehicles.filter(
      (vehicle) => vehicle.incidentResponseId !== id,
    );
    this.syncClosedRunwayState();
    this.replanSurfaceTrafficAroundDisruptions(id, true);
    this.updateActiveRunwayConfiguration();
    this.decisionReason = reason;
    return true;
  }

  private removeSurfaceDisruptionsBySource(
    source: SurfaceDisruptionSource,
  ): void {
    const removed = this.state.surfaceDisruptions
      .filter((disruption) => disruption.source === source)
      .map((disruption) => disruption.id);
    if (!removed.length) return;
    this.state.surfaceDisruptions = this.state.surfaceDisruptions.filter(
      (disruption) => disruption.source !== source,
    );
    this.state.serviceVehicles = this.state.serviceVehicles.filter(
      (vehicle) => !removed.includes(vehicle.incidentResponseId ?? ""),
    );
    this.syncClosedRunwayState();
    this.replanSurfaceTrafficAroundDisruptions(removed.join(","), true);
  }

  private syncClosedRunwayState(): void {
    this.closedRunway =
      this.state.surfaceDisruptions.find(
        (disruption) =>
          disruption.kind === "runway-closure" &&
          disruption.runwayId !== undefined,
      )?.runwayId ?? null;
    this.state.closedRunway = this.closedRunway;
  }

  private runwayClosureLeavesCapacity(runwayId: number): boolean {
    const remaining = this.config.runways.filter(
      (runway) =>
        runway.id !== runwayId &&
        !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id),
    );
    const hasArrival = remaining.some((runway) => {
      const role = this.runwayRole(runway.id);
      return role === "arrival" || role === "mixed";
    });
    const hasDeparture = remaining.some((runway) => {
      const role = this.runwayRole(runway.id);
      return role === "departure" || role === "mixed";
    });
    return hasArrival && hasDeparture;
  }

  private runwayClosureBlockingFlights(runwayId: number): Flight[] {
    return this.state.flights.filter(
      (flight) =>
        ((flight.phase === "landing" || flight.phase === "takeoff") &&
          flight.runway === runwayId) ||
        flight.motion.protectedRunwayIds.includes(runwayId),
    );
  }

  private rerouteApproachesFromClosedRunway(
    runwayId: number,
    disruption: SurfaceDisruptionState,
  ): void {
    const approaches = this.state.flights.filter(
      (flight) => flight.runway === runwayId && flight.phase === "approach",
    );
    for (const flight of approaches) {
      const alternatives = this.config.runways
        .filter((runway) => runway.id !== runwayId)
        .filter(
          (runway) =>
            !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id),
        )
        .filter((runway) => {
          const role = this.runwayRole(runway.id);
          return role === "arrival" || role === "mixed";
        })
        .filter((runway) =>
          this.runwaySupportsCurrentCondition(
            runway,
            flight.aircraft,
            "landing",
          ),
        )
        .sort(
          (first, second) =>
            this.headwindComponent(second.id) -
            this.headwindComponent(first.id),
        );
      const alternate =
        alternatives.find((runway) => !this.arrivalBlocked(runway.id)) ??
        alternatives[0];
      if (!alternate) {
        flight.cleared = false;
        flight.safetyHold = true;
        flight.safetyHoldReason = `${disruption.label} closed and no compatible arrival runway is available`;
        continue;
      }
      this.goAround(
        flight,
        `${disruption.label} closed · re-sequencing to ${this.activeRunwayDesignation(alternate.id)}`,
      );
      const alternateProcedure = this.terminalProcedure(
        "STAR",
        alternate.id,
        flight.id + flight.flightPlan.revision,
      );
      amendFlightPlan(
        flight.flightPlan,
        "runway-change",
        this.state.elapsed,
        `${disruption.label} · missed approach to ${this.activeRunwayDesignation(alternate.id)}`,
        {
          procedureSelection: alternateProcedure,
          procedureDataVersion: this.config.airspaceProgram.dataVersion,
          runwayIntent: {
            runwayId: alternate.id,
            operatingEnd: this.preferredOperatingEnd(alternate.id),
            designation: this.activeRunwayDesignation(alternate.id),
          },
        },
      );
      this.state.trafficFlow.totals.runwayChanges += 1;
      flight.runway = alternate.id;
      flight.operatingEnd = this.preferredOperatingEnd(alternate.id);
      flight.palette = alternate.color;
      flight.procedure = alternateProcedure.procedure.name;
      flight.navigation = this.navigationFor(alternateProcedure, "arrival");
      flight.duration =
        this.phaseDuration(flight.aircraft, "approach", alternate.id) * 2.4;
      this.planRunwayExit(flight, "runway closure reroute");
      this.events.push({
        type: "surface-reroute",
        flight,
        runway: alternate.id,
        detail: `${disruption.label} · missed approach and reassigned to ${this.activeRunwayDesignation(alternate.id)}`,
      });
      disruption.reroutedFlightIds.push(flight.id);
    }
  }

  private replanSurfaceTrafficAroundDisruptions(
    triggerId: string,
    force = false,
  ): number[] {
    const rerouted: number[] = [];
    const triggerIds = new Set(triggerId.split(","));
    for (const flight of this.state.flights.filter(
      (candidate) =>
        candidate.phase === "taxi-in" || candidate.phase === "taxi-out",
    )) {
      if (flight.emergency === "disabled") continue;
      if (
        force &&
        !flight.surfaceReroute?.disruptionIds.some((id) => triggerIds.has(id))
      )
        continue;
      const result = this.replanSurfaceFlight(flight, [triggerId], force);
      if (result) rerouted.push(flight.id);
    }
    return rerouted;
  }

  private replanSurfaceFlight(
    flight: Flight,
    triggerIds: string[],
    force = false,
    options: {
      additionallyBlockedEdgeIds?: ReadonlySet<string>;
      reason?: string;
      holdIfUnavailable?: boolean;
    } = {},
  ): boolean {
    // A fixed obstruction can otherwise cause the same automatic amendment to
    // be reconsidered every few simulation ticks. Let reservations and the
    // wait-cycle recovery arbitrate during that interval; repeatedly rewriting
    // an unchanged suffix neither clears pavement nor improves safety.
    const previousReroute = flight.surfaceReroute;
    if (
      options.reason &&
      previousReroute?.status === "rerouted" &&
      previousReroute.reason === options.reason &&
      this.state.elapsed - previousReroute.selectedAtSeconds < 30
    )
      return false;
    // A crossing clearance commits the aircraft to vacating the protected
    // runway on its present route. Route amendments resume after it is clear.
    if (this.occupiesClearedRunwayCrossing(flight)) return false;
    const routeNodes = flight.surfaceRoute;
    const routeEdges = flight.surfaceRouteEdges;
    const sample = sampleSurfaceRouteWithEdges(
      this.config.surfaceGraph,
      routeNodes,
      routeEdges,
      flight.progress,
    );
    if (
      !sample ||
      !routeNodes?.length ||
      !routeEdges?.length ||
      sample.edgeIndex < 0
    )
      return false;
    const impacts = surfaceDisruptionsForRoute(
      this.state.surfaceDisruptions,
      routeEdges,
      sample.edgeIndex,
    );
    if (
      !impacts.length &&
      !force &&
      flight.surfaceReroute?.status !== "holding"
    )
      return false;
    if (
      impacts.length &&
      ["enroute", "queued", "positioning", "treating"].includes(
        flight.deicing.status,
      )
    ) {
      return this.holdForUnavailableSurfaceRoute(
        flight,
        impacts.map((impact) => impact.id),
        "surface restriction affects the assigned deicing movement; holding for a revised release",
      );
    }

    const destinationNodeId = routeNodes.at(-1);
    if (!destinationNodeId) return false;
    const firstAffectedEdgeIndex = impacts
      .flatMap((impact) => impact.edgeIds)
      .map((edgeId) => routeEdges.indexOf(edgeId))
      .filter((edgeIndex) => edgeIndex >= sample.edgeIndex)
      .reduce((earliest, edgeIndex) => Math.min(earliest, edgeIndex), Infinity);
    // Keep every still-usable segment between the aircraft and the closure.
    // Starting a replacement route at the next node can change the outgoing
    // edge of the turn the aircraft is already flying, which moves the
    // authoritative curved pose immediately. Committing the safe prefix keeps
    // the current turn continuous and diverts at the last usable junction.
    const routingStartNodeIndex = Number.isFinite(firstAffectedEdgeIndex)
      ? Math.max(sample.edgeIndex + 1, firstAffectedEdgeIndex)
      : // Traffic amendments retain the outgoing edge as well as the occupied
        // one. Rounded-corner motion depends on that edge, so replacing it while
        // the aircraft is already in the turn would move the authoritative pose.
        Math.min(routeEdges.length, sample.edgeIndex + 2);
    const routingStartNodeId = routeNodes[routingStartNodeIndex];
    if (!routingStartNodeId) return false;
    const prefixNodes = routeNodes.slice(0, routingStartNodeIndex + 1);
    const prefixEdges = routeEdges.slice(0, routingStartNodeIndex);
    // Initial taxi routes exclude parked aircraft, but an amendment used to
    // rebuild only against dynamic disruptions and the caller's narrow
    // avoidance set. That allowed a detour to select a suffix through a gate
    // body that the original route would never have accepted. Preserve the
    // same physical pavement constraint for every route source.
    const parkedBlockedEdges = this.parkedAircraftBlockedEdgeIds(flight);
    const additionallyBlocked = new Set([
      ...prefixEdges,
      ...parkedBlockedEdges,
      ...(options.additionallyBlockedEdgeIds ?? []),
    ]);
    const planning = this.surfaceRoutePlanning(flight.id, additionallyBlocked);
    const profile = aircraftProfile(flight.aircraft);
    const suffix = findSurfaceRoute(
      this.config.surfaceGraph,
      routingStartNodeId,
      destinationNodeId,
      {
        wingspanM: profile.wingspanM,
        minimumWingtipClearanceM: profile.minimumWingtipClearanceM,
      },
      planning,
    );
    const disruptionIds = impacts.length
      ? impacts.map((impact) => impact.id)
      : triggerIds;
    if (!suffix) {
      if (options.holdIfUnavailable === false) return false;
      const labels =
        impacts.map((impact) => impact.label).join(", ") ||
        "surface restriction";
      return this.holdForUnavailableSurfaceRoute(
        flight,
        disruptionIds,
        `${labels} blocks every compatible pavement route`,
      );
    }

    const nodeIds = [...prefixNodes, ...suffix.nodeIds.slice(1)];
    const edgeIds = [...prefixEdges, ...suffix.edgeIds];
    if (
      edgeIds.length === routeEdges.length &&
      edgeIds.every((edgeId, index) => edgeId === routeEdges[index])
    )
      return false;
    const total =
      sampleSurfaceRouteWithEdges(this.config.surfaceGraph, nodeIds, edgeIds, 1)
        ?.totalDistance ?? 0;
    if (total <= 0)
      return this.holdForUnavailableSurfaceRoute(
        flight,
        disruptionIds,
        "revised pavement route has no usable distance",
      );
    const edgeById = new Map(
      this.config.surfaceGraph.edges.map((edge) => [edge.id, edge]),
    );
    const route: SurfaceRoute = {
      nodeIds,
      edgeIds,
      distance: total,
      taxiwayIds: [
        ...new Set(
          edgeIds.flatMap((edgeId) => {
            const taxiwayId = edgeById.get(edgeId)?.taxiwayId;
            return taxiwayId ? [taxiwayId] : [];
          }),
        ),
      ],
      routingCost: total + suffix.congestionPenalty,
      congestionPenalty: suffix.congestionPenalty,
      congestedEdgeIds: [...suffix.congestedEdgeIds],
    };
    const revisedProgress = Math.max(
      0,
      Math.min(0.999999, sample.distanceAlong / total),
    );
    const revisedDuration = this.surfaceRouteDuration(flight, route);
    const preview: Flight = {
      ...flight,
      surfaceRoute: nodeIds,
      surfaceRouteEdges: edgeIds,
      surfaceRoutingCost: route.routingCost,
      surfaceCongestionPenalty: route.congestionPenalty,
      surfaceCongestedEdgeIds: route.congestedEdgeIds,
      progress: revisedProgress,
      duration: revisedDuration,
      phaseElapsed: revisedDuration * revisedProgress,
    };
    syncFlightMotion(this.config, preview);
    const otherFlights = this.state.flights.filter(
      (other) => other.id !== flight.id,
    );
    const rerouteConflict = findFlightConflicts(this.config, [
      preview,
      ...otherFlights,
    ]).find(
      (conflict) =>
        conflict.first === flight.id || conflict.second === flight.id,
    );
    const committedTraffic = otherFlights.filter(
      flightHasCommittedRunwayTrajectory,
    );
    const committedSweepConflict = committedTraffic.length
      ? findProposedConflict(
          this.config,
          preview,
          revisedProgress,
          committedTraffic,
          new Map(committedTraffic.map((other) => [other.id, other.progress])),
        )
      : null;
    if (
      rerouteConflict ||
      committedSweepConflict ||
      findObstacleConflicts(this.config, [preview]).length
    )
      return false;
    const previousEdgeIds = [...routeEdges];
    const oldTotal = sample.totalDistance;
    flight.surfaceRoute = nodeIds;
    flight.surfaceRouteEdges = edgeIds;
    flight.surfaceRoutingCost = route.routingCost;
    flight.surfaceCongestionPenalty = route.congestionPenalty;
    flight.surfaceCongestedEdgeIds = route.congestedEdgeIds;
    flight.progress = revisedProgress;
    flight.duration = revisedDuration;
    flight.phaseElapsed = flight.duration * flight.progress;
    flight.requiredCrossings = surfaceRouteRunwayCrossings(
      this.config.surfaceGraph,
      edgeIds,
      flight.runway,
    );
    const crossingWindows = surfaceRouteCrossingWindows(
      this.config.surfaceGraph,
      nodeIds,
      flight.progress,
      flight.runway,
      edgeIds,
    );
    const completed = crossingWindows.filter(
      (crossing) => crossing.exitProgress < flight.progress - 1e-6,
    );
    flight.crossingClearanceIds = completed.map((crossing) => crossing.id);
    flight.crossingClearances = [
      ...new Set(completed.map((crossing) => crossing.runwayId)),
    ];
    const revision = (flight.surfaceReroute?.revision ?? 0) + 1;
    const addedDistanceM = (total - oldTotal) * WORLD_METERS_PER_UNIT;
    const rerouteSubject =
      options.reason ??
      (impacts.map((impact) => impact.label).join(", ") ||
        "cleared restriction");
    flight.surfaceReroute = {
      revision,
      status: "rerouted",
      selectedAtSeconds: this.state.elapsed,
      disruptionIds: [...new Set(disruptionIds)],
      previousEdgeIds,
      routeEdgeIds: [...edgeIds],
      addedDistanceM,
      reason: `pavement route amended around ${rerouteSubject}`,
    };
    amendFlightPlan(
      flight.flightPlan,
      "route-change",
      this.state.elapsed,
      `${flight.surfaceReroute.reason} · surface revision ${revision}`,
    );
    this.state.trafficFlow.totals.routeAmendments += 1;
    flight.automaticHold = false;
    flight.automaticHoldReason = undefined;
    this.updateSurfaceRouteState(flight);
    syncFlightMotion(this.config, flight);
    this.events.push({
      type: "surface-reroute",
      flight,
      runway: flight.runway,
      taxiway: flight.taxiway,
      detail: `${flight.surfaceReroute.reason} · ${addedDistanceM >= 0 ? "+" : ""}${Math.round(addedDistanceM)} m`,
    });
    for (const impact of impacts)
      if (!impact.reroutedFlightIds.includes(flight.id))
        impact.reroutedFlightIds.push(flight.id);
    return true;
  }

  /**
   * A stand can become occupied after a mover received its taxi route. If the
   * parked aircraft later blocks that route, amend the moving aircraft on the
   * graph instead of letting one immutable stand position freeze the ramp.
   */
  private resolveParkedAircraftSurfaceBlockers(): void {
    const flightById = new Map(
      this.state.flights.map((flight) => [flight.id, flight]),
    );
    for (const flight of this.state.flights) {
      if (flight.phase !== "taxi-in" && flight.phase !== "taxi-out") continue;
      const match = flight.safetyHoldReason?.match(
        /^projected path conflict with flight (\d+)$/,
      );
      if (!match || (this.stationarySeconds.get(flight.id) ?? 0) < 30) continue;
      const blocker = flightById.get(Number(match[1]));
      if (blocker?.phase !== "resting") continue;
      const previousRecovery = this.parkedBlockerRecovery.get(flight.id);
      const recovery =
        previousRecovery?.blockerId === blocker.id
          ? previousRecovery
          : {
              blockerId: blocker.id,
              attempts: 0,
              retryAtSeconds: this.state.elapsed,
            };
      if (this.state.elapsed + 1e-6 < recovery.retryAtSeconds) continue;
      if (recovery.attempts >= 3) continue;
      // Two graph detours are enough to establish that a stationary gate body
      // cannot be routed around from this point. Release the shared alley by
      // towing the mover back on its own already-authoritative pavement route;
      // if that is physically unavailable, retain an explicit hold instead of
      // allowing other generic recovery passes to replan it forever.
      if (recovery.attempts === 2) {
        recovery.attempts = 3;
        recovery.retryAtSeconds = this.state.elapsed + 90;
        this.parkedBlockerRecovery.set(flight.id, recovery);
        if (
          this.startSurfaceYieldRecovery(
            [flight as Flight & { phase: "taxi-in" | "taxi-out" }],
            `parked-blocker-${blocker.id}-${flight.id}`,
          )
        )
          continue;
        // Keep the current collision hold live rather than converting it into
        // a permanent route-unavailable state. The parked blocker may receive
        // pushback later; once its body clears, the unchanged authoritative
        // taxi route is valid again and the normal arbiter can release this
        // aircraft without a stale manual intervention.
        continue;
      }
      recovery.attempts += 1;
      recovery.retryAtSeconds = this.state.elapsed + 45;
      this.parkedBlockerRecovery.set(flight.id, recovery);
      const blockedEdges = this.parkedAircraftBlockedEdgeIds(
        flight,
        new Set([blocker.id]),
      );
      if (!blockedEdges.size) continue;
      const rerouted = this.replanSurfaceFlight(
        flight,
        [`parked:${blocker.id}`],
        true,
        {
          additionallyBlockedEdgeIds: blockedEdges,
          reason: `parked aircraft conflict with ${blocker.callsign}`,
          holdIfUnavailable: false,
        },
      );
      if (!rerouted) continue;
      flight.safetyHold = false;
      flight.safetyHoldReason = undefined;
      flight.automaticHold = false;
      flight.automaticHoldReason = undefined;
      this.stationarySeconds.set(flight.id, 0);
    }
  }

  /**
   * Service equipment normally receives brief priority while it clears a
   * shared ramp connector. If an aircraft and a returning vehicle acquire
   * opposite sides of the same narrow graph section, however, both can wait
   * forever: the aircraft protects the vehicle's next junction while the
   * vehicle protects the aircraft's next edge. After a genuine wait, retain
   * the aircraft's current paved segment and amend only its remaining suffix
   * around the vehicle's near-term route.
   */
  private resolveServiceVehicleSurfaceBlockers(): void {
    const vehicleById = new Map(
      this.state.serviceVehicles.map((vehicle) => [vehicle.id, vehicle]),
    );
    for (const flight of this.state.flights) {
      if (flight.phase !== "taxi-in" && flight.phase !== "taxi-out") continue;
      if ((this.stationarySeconds.get(flight.id) ?? 0) < 30) continue;
      const match = flight.automaticHoldReason?.match(/\(vehicle:([^)]+)\)$/);
      if (!match) continue;
      const vehicle = vehicleById.get(match[1]);
      if (
        !vehicle ||
        (vehicle.status !== "dispatching" && vehicle.status !== "returning")
      )
        continue;
      const routeEdges =
        vehicle.status === "dispatching"
          ? vehicle.outboundRouteEdges
          : vehicle.returnRouteEdges;
      const currentEdgeIndex = vehicle.currentEdge
        ? routeEdges.indexOf(vehicle.currentEdge)
        : -1;
      if (currentEdgeIndex < 0) continue;
      const blockedEdges = new Set(
        routeEdges.slice(
          currentEdgeIndex,
          Math.min(
            routeEdges.length,
            currentEdgeIndex + SERVICE_VEHICLE_AVOIDANCE_EDGES,
          ),
        ),
      );
      if (!blockedEdges.size) continue;
      const signature = `${vehicle.id}:${vehicle.status}:${vehicle.currentEdge}`;
      const scheduledRecovery = this.serviceVehicleBlockerRecovery.get(flight);
      if (
        scheduledRecovery?.signature === signature &&
        this.state.elapsed + 1e-6 < scheduledRecovery.retryAtSeconds
      )
        continue;
      this.serviceVehicleBlockerRecovery.set(flight, {
        signature,
        retryAtSeconds: this.state.elapsed + SURFACE_DEADLOCK_RETRY_SECONDS,
      });
      const rerouted = this.replanSurfaceFlight(
        flight,
        [`service-vehicle:${vehicle.id}`],
        true,
        {
          additionallyBlockedEdgeIds: blockedEdges,
          reason: `service-vehicle conflict with ${vehicle.label} ${vehicle.id}`,
          holdIfUnavailable: false,
        },
      );
      if (!rerouted) continue;
      flight.safetyHold = false;
      flight.safetyHoldReason = undefined;
      flight.automaticHold = false;
      flight.automaticHoldReason = undefined;
      this.stationarySeconds.set(flight.id, 0);
    }
  }

  /**
   * A taxi-in aircraft must not wait indefinitely for an outbound aircraft
   * that has entered a pushback corridor and then stopped behind downstream
   * traffic. The normal ledger correctly protects both bodies, but without a
   * bounded fairness action this can form a one-way queue that never drains.
   * Replan the uncommitted outbound aircraft around the inbound aircraft's
   * near-term graph edges. Runway-entry-cleared departures remain untouched;
   * their protected corridor has higher authority.
   */
  private resolvePushbackCorridorBlockers(): void {
    const surfaceFlights = this.state.flights.filter(
      (flight): flight is Flight & { phase: "taxi-in" | "taxi-out" } =>
        flight.phase === "taxi-in" || flight.phase === "taxi-out",
    );
    for (const inbound of surfaceFlights) {
      if (inbound.phase !== "taxi-in") continue;
      if ((this.stationarySeconds.get(inbound.id) ?? 0) < 90) continue;
      if (
        !inbound.automaticHoldReason?.startsWith(
          "pushback corridor protected for ",
        )
      )
        continue;
      const callsign = inbound.automaticHoldReason.slice(
        "pushback corridor protected for ".length,
      );
      const outbound = surfaceFlights.find(
        (flight) =>
          flight.phase === "taxi-out" &&
          flight.callsign === callsign &&
          !flight.runwayEntryCleared &&
          !flight.takeoffCleared,
      );
      if (!outbound) continue;
      const signature = `${outbound.id}:${inbound.id}:${outbound.surfaceRouteEdges?.join(",") ?? ""}`;
      const previous = this.pushbackCorridorRecovery.get(inbound);
      const recovery =
        previous?.signature === signature
          ? previous
          : { signature, attempts: 0, retryAtSeconds: this.state.elapsed };
      if (this.state.elapsed + 1e-6 < recovery.retryAtSeconds) continue;
      if (recovery.attempts >= 2) {
        if (
          this.startSurfaceYieldRecovery(
            [outbound, inbound],
            `pushback-corridor-${outbound.id}-${inbound.id}`,
          )
        ) {
          this.stationarySeconds.set(outbound.id, 0);
          this.stationarySeconds.set(inbound.id, 0);
          this.pushbackCorridorRecovery.delete(inbound);
        } else {
          recovery.retryAtSeconds = this.state.elapsed + 45;
          this.pushbackCorridorRecovery.set(inbound, recovery);
        }
        continue;
      }
      recovery.attempts += 1;
      recovery.retryAtSeconds = this.state.elapsed + 45;
      this.pushbackCorridorRecovery.set(inbound, recovery);

      const inboundBlockedEdges = this.surfaceDeadlockAvoidanceEdges(inbound);
      const outboundRerouted =
        inboundBlockedEdges.size > 0 &&
        this.replanSurfaceFlight(
          outbound,
          [`pushback-traffic:${inbound.id}`],
          true,
          {
            additionallyBlockedEdgeIds: inboundBlockedEdges,
            reason: `pushback corridor fairness for ${inbound.callsign}`,
            holdIfUnavailable: false,
          },
        );
      if (outboundRerouted) {
        outbound.safetyHold = false;
        outbound.safetyHoldReason = undefined;
        outbound.automaticHold = false;
        outbound.automaticHoldReason = undefined;
        inbound.safetyHold = false;
        inbound.safetyHoldReason = undefined;
        this.stationarySeconds.set(outbound.id, 0);
        this.stationarySeconds.set(inbound.id, 0);
        this.pushbackCorridorRecovery.delete(inbound);
      }
    }
  }

  /**
   * A strategic taxiway-flow window deliberately has no aircraft owner, so the
   * ordinary named-blocker and wait-cycle recoveries cannot amend an aircraft
   * that has waited behind it. After a sustained hold, try one graph-valid
   * suffix that avoids that exact sourced section. This never changes the
   * direction window or asks an aircraft to leave pavement; if no legal
   * bypass exists, the authoritative hold remains in place.
   */
  private resolveTaxiwayFlowBlockers(): void {
    const surfaceFlights = this.state.flights.filter(
      (flight): flight is Flight & { phase: "taxi-in" | "taxi-out" } =>
        flight.phase === "taxi-in" || flight.phase === "taxi-out",
    );
    for (const flight of surfaceFlights) {
      if ((this.stationarySeconds.get(flight.id) ?? 0) < 180) continue;
      const flowHold = this.surfaceFlowHoldByFlight.get(flight);
      if (!flowHold) continue;
      const signature = `${flowHold.id}:${flowHold.direction}:${flight.surfaceEdge ?? ""}`;
      const previous = this.surfaceFlowBlockerRecovery.get(flight);
      if (
        previous?.signature === signature &&
        this.state.elapsed + 1e-6 < previous.retryAtSeconds
      )
        continue;
      this.surfaceFlowBlockerRecovery.set(flight, {
        signature,
        retryAtSeconds: this.state.elapsed + 180,
      });
      const blockedEdges = new Set(
        surfaceTaxiwayFlowSectionEdgeIds(this.config.surfaceGraph, flowHold.id),
      );
      if (!blockedEdges.size) continue;
      const rerouted = this.replanSurfaceFlight(
        flight,
        [`taxiway-flow:${flowHold.id}`],
        true,
        {
          additionallyBlockedEdgeIds: blockedEdges,
          reason: `taxiway flow recovery on ${flowHold.label}`,
          holdIfUnavailable: false,
        },
      );
      if (!rerouted) {
        this.startSurfaceYieldRecovery(
          [flight],
          `taxiway-flow-${flowHold.id}-${flight.id}`,
        );
        continue;
      }
      flight.safetyHold = false;
      flight.safetyHoldReason = undefined;
      flight.automaticHold = false;
      flight.automaticHoldReason = undefined;
      this.surfaceFlowHoldByFlight.delete(flight);
      this.stationarySeconds.set(flight.id, 0);
    }
  }

  /**
   * Amend a route when the graph ledger first establishes a persistent
   * aircraft-to-aircraft wait. Waiting for the collision arbiter to report a
   * reciprocal stand-off leaves no room to turn at dense imported junctions;
   * the loser can still take another paved branch after a few seconds here.
   */
  private resolveSurfaceReservationBlockers(): void {
    const surfaceFlights = this.state.flights.filter(
      (flight): flight is Flight & { phase: "taxi-in" | "taxi-out" } =>
        flight.phase === "taxi-in" || flight.phase === "taxi-out",
    );
    const flightById = new Map(
      surfaceFlights.map((flight) => [flight.id, flight]),
    );
    for (const flight of surfaceFlights) {
      if (flight.surfaceReroute?.status === "holding") continue;
      if (
        (this.stationarySeconds.get(flight.id) ?? 0) <
        SURFACE_RESERVATION_RECOVERY_WAIT_SECONDS
      )
        continue;
      // A projected-path safety hold is also a named wait-for edge.  The
      // collision arbiter is authoritative for the current pose, but a
      // surface aircraft that has waited for several minutes should be given
      // the same bounded pavement-only detour opportunity as a reservation
      // hold.  Do not generalize this to physical-overlap or runway-protection
      // holds: those remain exactly where the safety layer placed them.
      const reason = flight.automaticHoldReason ?? flight.safetyHoldReason;
      // A short junction queue is normal, but a named graph resource that has
      // held an aircraft for the recovery threshold is a wait-for edge. Do not
      // let one-way sections and derived intersections form an unbounded
      // chain. Committed runway and ramp-capacity holds have separate
      // authorities and must remain untouched here.
      const projectedPathHold = Boolean(
        reason && /^projected path conflict with flight \d+$/.test(reason),
      );
      if (
        !reason ||
        (flight.safetyHold && !projectedPathHold) ||
        /protected (?:departure|taxi) corridor|ramp-control zone|departure slot/.test(
          reason,
        )
      )
        continue;
      const match = reason.match(
        projectedPathHold
          ? /^projected path conflict with flight (\d+)$/
          : /\(flight (\d+)\)$/,
      );
      if (!match) continue;
      const blocker = flightById.get(Number(match[1]));
      if (
        !blocker ||
        blocker.id === flight.id ||
        blocker.emergency === "disabled"
      )
        continue;
      const blockerSample = sampleSurfaceRouteWithEdges(
        this.config.surfaceGraph,
        blocker.surfaceRoute,
        blocker.surfaceRouteEdges,
        blocker.progress,
      );
      if (!blockerSample) continue;
      // Recovery attempts are scoped to the current blocker/route position.
      // A failed alternate path must not permanently blacklist an aircraft:
      // the blocker may later move, or a downstream reservation may change.
      // Retry a bounded pair of graph amendments every few minutes while the
      // same wait remains genuine; this preserves fairness without thrashing
      // the route planner every fixed step.
      // Route revision is deliberately not part of this key: each failed
      // amendment used to create a fresh recovery identity, resetting the
      // bounded-attempt guard and allowing thousands of identical retries.
      const signature = `${blocker.id}:${flight.surfaceEdge ?? ""}`;
      const previous = this.surfaceReservationBlockerRecovery.get(flight);
      const recovery =
        previous?.signature === signature
          ? previous
          : {
              signature,
              attempts: 0,
              retryAtSeconds: this.state.elapsed,
              lastAttemptSeconds: -Infinity,
            };
      if (this.state.elapsed + 1e-6 < recovery.retryAtSeconds) continue;
      if (
        recovery.attempts >= 2 &&
        this.state.elapsed - recovery.lastAttemptSeconds < 180
      )
        continue;
      recovery.attempts += 1;
      recovery.retryAtSeconds =
        this.state.elapsed + SURFACE_DEADLOCK_RETRY_SECONDS;
      recovery.lastAttemptSeconds = this.state.elapsed;
      if (recovery.attempts > 2) recovery.attempts = 1;
      this.surfaceReservationBlockerRecovery.set(flight, recovery);
      const waitSeconds = this.stationarySeconds.get(flight.id) ?? 0;
      // The first recovery keeps a generous protected corridor. If that
      // corridor has been occupied for several minutes, narrow only the
      // *planning* exclusion to the next physical envelope; collision and
      // reservation arbitration still validate every proposed pose. This
      // gives a long-waiting aircraft a chance to use a nearby parallel
      // taxiway instead of treating a whole 750 m neighborhood as closed.
      const avoidanceDistanceM =
        waitSeconds >= 180 ? 320 : SURFACE_DEADLOCK_AVOIDANCE_M;
      const blockedEdges = this.surfaceDeadlockAvoidanceEdges(
        blocker,
        avoidanceDistanceM,
      );
      if (!blockedEdges.size) continue;
      const rerouted = this.replanSurfaceFlight(
        flight,
        [`reservation-traffic:${blocker.id}`],
        true,
        {
          additionallyBlockedEdgeIds: blockedEdges,
          reason: `early surface conflict with ${blocker.callsign}`,
          holdIfUnavailable: false,
        },
      );
      if (!rerouted) {
        if (waitSeconds >= 180)
          this.startSurfaceYieldRecovery(
            [flight, blocker],
            `reservation-${flight.id}-${blocker.id}`,
          );
        continue;
      }
      flight.safetyHold = false;
      flight.safetyHoldReason = undefined;
      flight.automaticHold = false;
      flight.automaticHoldReason = undefined;
      this.stationarySeconds.set(flight.id, 0);
    }
  }

  /** Build a geometry-distance corridor instead of counting OSM fragments. */
  private surfaceDeadlockAvoidanceEdges(
    flight: Flight,
    maxDistanceM = SURFACE_DEADLOCK_AVOIDANCE_M,
  ): Set<string> {
    const sample = sampleSurfaceRouteWithEdges(
      this.config.surfaceGraph,
      flight.surfaceRoute,
      flight.surfaceRouteEdges,
      flight.progress,
    );
    if (
      !sample ||
      !flight.surfaceRouteEdges?.length ||
      !flight.surfaceRoute?.length
    )
      return new Set();
    const positions = surfaceNodePositions(this.config.surfaceGraph);
    const blocked = new Set<string>();
    let distanceM = 0;
    for (
      let edgeIndex = Math.max(0, sample.edgeIndex);
      edgeIndex < flight.surfaceRouteEdges.length;
      edgeIndex += 1
    ) {
      blocked.add(flight.surfaceRouteEdges[edgeIndex]);
      const from = positions.get(flight.surfaceRoute[edgeIndex]);
      const to = positions.get(flight.surfaceRoute[edgeIndex + 1]);
      if (from && to) {
        const edgeDistanceWorld = Math.hypot(to[0] - from[0], to[1] - from[1]);
        const remainingFactor =
          edgeIndex === sample.edgeIndex
            ? Math.max(0, 1 - sample.edgeProgress)
            : 1;
        distanceM +=
          edgeDistanceWorld * remainingFactor * WORLD_METERS_PER_UNIT;
      }
      if (distanceM >= maxDistanceM) break;
    }
    return blocked;
  }

  /**
   * Recover a true reciprocal surface stand-off without moving either aircraft
   * off pavement. The more-advanced (or gate-bound) movement keeps priority;
   * the other keeps its current segment and receives a graph-routed suffix
   * around the winner's near-term protected edges.
   */
  private resolveReciprocalSurfaceDeadlocks(): void {
    const surfaceFlights = this.state.flights.filter(
      (flight): flight is Flight & { phase: "taxi-in" | "taxi-out" } =>
        flight.phase === "taxi-in" || flight.phase === "taxi-out",
    );
    const flightById = new Map(
      surfaceFlights.map((flight) => [flight.id, flight]),
    );
    const processedPairs = new Set<string>();
    for (const flight of surfaceFlights) {
      const match = flight.safetyHoldReason?.match(
        /^projected path conflict with flight (\d+)$/,
      );
      if (!match) continue;
      const other = flightById.get(Number(match[1]));
      if (!other?.safetyHoldReason?.includes(`flight ${flight.id}`)) continue;
      if (
        Math.min(
          this.stationarySeconds.get(flight.id) ?? 0,
          this.stationarySeconds.get(other.id) ?? 0,
        ) < 30
      )
        continue;
      const pairKey = [flight.id, other.id]
        .sort((first, second) => first - second)
        .join(":");
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const priority = (candidate: Flight): [number, number, number] => [
        candidate.phase === "taxi-in" ? 0 : 1,
        -candidate.progress,
        candidate.id,
      ];
      const firstPriority = priority(flight);
      const secondPriority = priority(other);
      const flightWins =
        firstPriority[0] < secondPriority[0] ||
        (firstPriority[0] === secondPriority[0] &&
          firstPriority[1] < secondPriority[1]) ||
        (firstPriority[0] === secondPriority[0] &&
          firstPriority[1] === secondPriority[1] &&
          firstPriority[2] < secondPriority[2]);
      const winner = flightWins ? flight : other;
      const loser = flightWins ? other : flight;
      const reciprocalWaitSeconds = Math.min(
        this.stationarySeconds.get(flight.id) ?? 0,
        this.stationarySeconds.get(other.id) ?? 0,
      );
      // A repeated graph detour cannot solve a nose-to-nose stand-off inside a
      // single terminal lead-in: every legal suffix rejoins the same narrow
      // pavement. Once the reciprocal dependency has remained stable long
      // enough to rule out a transient merge, use the swept-envelope recovery
      // before another accepted-but-equivalent route amendment resets the
      // aircraft timers. No pose is accepted off pavement or through another
      // aircraft, stand, obstacle, or protected runway.
      if (
        reciprocalWaitSeconds >= 30 &&
        this.startSurfaceYieldRecovery([loser, winner], `reciprocal-${pairKey}`)
      )
        continue;
      const trafficRerouteAt = (candidate: Flight): number =>
        candidate.surfaceReroute?.reason.includes("reciprocal traffic conflict")
          ? candidate.surfaceReroute.selectedAtSeconds
          : -Infinity;
      const winnerRerouteAt = trafficRerouteAt(winner);
      const loserRerouteAt = trafficRerouteAt(loser);
      if (this.state.elapsed - Math.max(winnerRerouteAt, loserRerouteAt) < 45)
        continue;
      const recoveryAnchor = flight.id < other.id ? flight : other;
      const scheduledRecovery =
        this.reciprocalSurfaceRecovery.get(recoveryAnchor);
      if (
        scheduledRecovery?.signature === pairKey &&
        this.state.elapsed + 1e-6 < scheduledRecovery.retryAtSeconds
      )
        continue;
      // A graph can legitimately have no alternate suffix around the winner.
      // Remember that failed search briefly instead of repeating several
      // airport-wide route searches on every 50 ms simulation tick.
      this.reciprocalSurfaceRecovery.set(recoveryAnchor, {
        signature: pairKey,
        retryAtSeconds: this.state.elapsed + SURFACE_DEADLOCK_RETRY_SECONDS,
      });

      const avoidanceEdges = (candidate: Flight): Set<string> => {
        return this.surfaceDeadlockAvoidanceEdges(candidate);
      };
      const replan = (
        candidate: Flight,
        blocker: Flight,
        edges: ReadonlySet<string>,
      ) =>
        this.replanSurfaceFlight(candidate, [`traffic:${blocker.id}`], true, {
          additionallyBlockedEdgeIds: edges,
          reason: `reciprocal traffic conflict with ${blocker.callsign}`,
          holdIfUnavailable: false,
        });
      // If the same detour still meets the conflict, alternate which aircraft
      // receives the next amendment. Replanning only the nominal loser can
      // cycle through equivalent suffixes while the priority route never
      // changes.
      const primary = loserRerouteAt <= winnerRerouteAt ? loser : winner;
      const primaryBlocker = primary === loser ? winner : loser;
      const primaryBlockedEdges = avoidanceEdges(primaryBlocker);
      let rerouted =
        primaryBlockedEdges.size > 0 &&
        replan(primary, primaryBlocker, primaryBlockedEdges);
      let reroutedFlight = primary;
      if (!rerouted) {
        const secondary = primaryBlocker;
        const secondaryBlockedEdges = avoidanceEdges(primary);
        rerouted =
          secondaryBlockedEdges.size > 0 &&
          replan(secondary, primary, secondaryBlockedEdges);
        reroutedFlight = secondary;
      }
      if (!rerouted) continue;
      reroutedFlight.safetyHold = false;
      reroutedFlight.safetyHoldReason = undefined;
      reroutedFlight.automaticHold = false;
      reroutedFlight.automaticHoldReason = undefined;
      this.stationarySeconds.set(reroutedFlight.id, 0);
    }
  }

  /** Release a completed surface recovery after conflicting traffic clears. */
  private updateSurfaceYields(): void {
    for (const flight of this.state.flights) {
      const recovery = flight.surfaceYield;
      if (!recovery) continue;
      const onSurface =
        flight.phase === "taxi-in" || flight.phase === "taxi-out";
      if (!onSurface) {
        flight.tugAttached = recovery.previousTugAttached;
        flight.engineState = recovery.previousEngineState;
        flight.surfaceYield = undefined;
        this.surfaceYieldCooldownUntil.delete(flight.id);
        continue;
      }
      if (recovery.direction === "reverse") {
        flight.tugAttached = true;
        if (flight.engineState === "off") flight.engineState = "starting";
      }
      if (
        recovery.status === "moving" &&
        (this.stationarySeconds.get(flight.id) ?? 0) >=
          SURFACE_YIELD_BLOCKED_ABORT_SECONDS
      ) {
        flight.tugAttached = recovery.previousTugAttached;
        flight.engineState = recovery.previousEngineState;
        flight.surfaceYield = undefined;
        flight.automaticHold = false;
        flight.automaticHoldReason = undefined;
        flight.safetyHold = false;
        flight.safetyHoldReason = undefined;
        this.stationarySeconds.set(flight.id, 0);
        this.surfaceYieldCooldownUntil.set(
          flight.id,
          this.state.elapsed + SURFACE_YIELD_RETRY_COOLDOWN_SECONDS,
        );
        this.events.push({
          type: "surface-reroute",
          flight,
          runway: flight.runway,
          taxiway: flight.taxiway,
          detail: `${recovery.direction === "reverse" ? "tug yield" : "surface release"} aborted · corridor changed, alternate recovery requested`,
        });
        continue;
      }
      if (recovery.status !== "holding") continue;
      flight.kinematics.groundSpeedKts = 0;
      if (this.state.elapsed + 1e-6 < (recovery.releaseAtSeconds ?? Infinity))
        continue;
      flight.tugAttached = recovery.previousTugAttached;
      flight.engineState = recovery.previousEngineState;
      flight.surfaceYield = undefined;
      this.surfaceYieldCooldownUntil.delete(flight.id);
      flight.automaticHold = false;
      flight.automaticHoldReason = undefined;
      flight.safetyHold = false;
      flight.safetyHoldReason = undefined;
      this.stationarySeconds.set(flight.id, 0);
      this.events.push({
        type: "surface-reroute",
        flight,
        runway: flight.runway,
        taxiway: flight.taxiway,
        detail: `${recovery.direction === "reverse" ? "tug yield" : "surface release"} complete · normal taxi sequence resumed`,
      });
    }
  }

  /**
   * When no alternate graph suffix exists, first advance the lead aircraft
   * out of a shared resource; if that is impossible, tug another cycle member
   * backward. Both directions remain on the authoritative pavement route and
   * every pose is arbitrated by the normal collision layer.
   */
  private startSurfaceYieldRecovery(
    members: Array<Flight & { phase: "taxi-in" | "taxi-out" }>,
    signature: string,
    blockedTransition?: { flight: Flight; next: FlightPhase },
  ): boolean {
    const retryAt = this.failedSurfaceYieldRetryAt.get(signature) ?? -Infinity;
    if (this.state.elapsed + 1e-6 < retryAt) return false;
    const started = this.startSurfaceYieldRecoveryUncached(
      members,
      signature,
      blockedTransition,
    );
    if (started) this.failedSurfaceYieldRetryAt.delete(signature);
    else {
      this.failedSurfaceYieldRetryAt.set(
        signature,
        this.state.elapsed + FAILED_SURFACE_YIELD_RETRY_SECONDS,
      );
      if (this.failedSurfaceYieldRetryAt.size > 128) {
        for (const [key, expiresAt] of this.failedSurfaceYieldRetryAt) {
          if (expiresAt <= this.state.elapsed)
            this.failedSurfaceYieldRetryAt.delete(key);
          if (this.failedSurfaceYieldRetryAt.size <= 96) break;
        }
      }
    }
    return started;
  }

  private startSurfaceYieldRecoveryUncached(
    members: Array<Flight & { phase: "taxi-in" | "taxi-out" }>,
    signature: string,
    blockedTransition?: { flight: Flight; next: FlightPhase },
  ): boolean {
    // A multi-aircraft wait cycle is usually an opposing stand-off on a
    // shared taxiway. Trying to advance first can repeatedly request motion
    // into the aircraft already occupying that corridor, so give Ground a
    // verified tug-back opportunity before attempting a forward release.
    const directions =
      members.length > 1
        ? (["reverse", "forward"] as const)
        : (["forward", "reverse"] as const);
    for (const direction of directions) {
      const distances =
        direction === "forward"
          ? SURFACE_YIELD_FORWARD_DISTANCES_M
          : members.length === 1
            ? [...SURFACE_YIELD_REVERSE_DISTANCES_M].reverse()
            : SURFACE_YIELD_REVERSE_DISTANCES_M;
      for (const flight of members) {
        const retryAtSeconds =
          this.surfaceYieldCooldownUntil.get(flight.id) ?? -Infinity;
        if (
          flight.surfaceYield ||
          flight.emergency === "disabled" ||
          this.state.elapsed + 1e-6 < retryAtSeconds
        )
          continue;
        this.surfaceYieldCooldownUntil.delete(flight.id);
        for (const distanceMeters of distances) {
          let targetProgress =
            direction === "forward"
              ? progressAfterDistance(this.config, flight, distanceMeters)
              : progressBeforeDistance(this.config, flight, distanceMeters);
          if (direction === "forward") {
            const crossing = this.nextUnclearedCrossing(flight);
            if (crossing)
              targetProgress = Math.min(targetProgress, crossing.holdProgress);
            const deicingLimit = deicingMovementLimit(flight);
            if (deicingLimit !== null)
              targetProgress = Math.min(targetProgress, deicingLimit);
          }
          const progresses =
            direction === "forward"
              ? targetProgress > flight.progress + 1e-7
              : targetProgress < flight.progress - 1e-7;
          if (!progresses) continue;
          const currentMotion = sampleFlightMotion(
            this.config,
            flight,
            flight.progress,
          );
          const targetMotion = sampleFlightMotion(
            this.config,
            flight,
            targetProgress,
          );
          const movementDistanceM = Math.abs(
            targetMotion.distanceAlongM - currentMotion.distanceAlongM,
          );
          if (movementDistanceM + 1e-6 < SURFACE_YIELD_MINIMUM_DISTANCE_M)
            continue;
          const sampleProgresses = this.surfaceYieldSampleProgresses(
            flight,
            targetProgress,
            direction,
          );
          const authorizedRunwayIds = new Set<number>();
          if (direction === "forward") {
            for (const runwayId of flight.motion.protectedRunwayIds)
              authorizedRunwayIds.add(runwayId);
            for (const runwayId of this.activeClearedCrossingRunways(flight))
              authorizedRunwayIds.add(runwayId);
            if (flight.runwayEntryCleared)
              authorizedRunwayIds.add(flight.runway);
          }
          if (
            sampleProgresses.some((progress) =>
              sampleFlightMotion(
                this.config,
                flight,
                progress,
              ).protectedRunwayIds.some(
                (runwayId) => !authorizedRunwayIds.has(runwayId),
              ),
            )
          )
            continue;
          const sweep = buildAircraftCollisionSweep(
            sampleProgresses.map((progress) =>
              aircraftCollisionEnvelope(this.config, flight, progress),
            ),
          );
          if (this.surfaceYieldCorridorBlocker(flight, sweep)) continue;
          if (
            blockedTransition &&
            this.transitionConflict(
              blockedTransition.flight,
              blockedTransition.next,
              new Map([[flight.id, targetProgress]]),
            )
          )
            continue;
          // Do not reject an otherwise-clear recovery because both endpoints
          // retain the same coarse OSM edge/alley claim. Long imported edges
          // can contain hundreds of metres of pavement; the swept-envelope
          // check above proves actual separation along the complete move, and
          // the ordinary ledger/collision arbiters still authorize every fixed
          // step. Requiring the target to leave the coarse resource made safe
          // tug-backs impossible inside terminal lead-ins.

          if (direction === "reverse") {
            // A clearance not yet entered can be cancelled before a tug backs
            // away. Ground issues a fresh individual clearance afterward.
            const crossingPlan = this.surfaceCrossingPlan(flight);
            const futureClearanceIds = new Set(
              crossingPlan.windows
                .filter(
                  (crossing) =>
                    this.crossingIsCleared(flight, crossing) &&
                    flight.progress < crossing.entryProgress - 1e-6,
                )
                .map((crossing) => crossing.id),
            );
            if (futureClearanceIds.size) {
              flight.crossingClearanceIds = (
                flight.crossingClearanceIds ?? []
              ).filter((id) => !futureClearanceIds.has(id));
              flight.crossingClearances = [
                ...new Set(
                  crossingPlan.windows
                    .filter((crossing) =>
                      this.crossingIsCleared(flight, crossing),
                    )
                    .map((crossing) => crossing.runwayId),
                ),
              ];
              this.updateSurfaceRouteState(flight);
            }
          }
          const blockerFlightIds = members
            .filter((candidate) => candidate.id !== flight.id)
            .map((candidate) => candidate.id);
          flight.surfaceYield = {
            status: "moving",
            direction,
            targetProgress,
            startedAtSeconds: this.state.elapsed,
            reason: `surface wait cycle ${signature}`,
            blockerFlightIds,
            previousTugAttached: flight.tugAttached,
            previousEngineState: flight.engineState,
          };
          if (direction === "reverse") {
            flight.tugAttached = true;
            if (flight.engineState === "off") flight.engineState = "starting";
          }
          flight.safetyHold = false;
          flight.safetyHoldReason = undefined;
          flight.automaticHold = false;
          flight.automaticHoldReason = undefined;
          this.stationarySeconds.set(flight.id, 0);
          this.events.push({
            type: "surface-reroute",
            flight,
            runway: flight.runway,
            taxiway: flight.taxiway,
            detail:
              direction === "reverse"
                ? `tug yield started · backing ${Math.round(movementDistanceM)} m on assigned pavement`
                : `surface release started · advancing ${Math.round(movementDistanceM)} m to clear the shared resource`,
          });
          return true;
        }
      }
    }
    return false;
  }

  /**
   * A rollout can reach its final pose before its taxi-in route is safe to
   * instantiate. If a surface aircraft is the named blocker, move that
   * aircraft through the same verified recovery corridor instead of leaving
   * the arrival frozen at the phase boundary indefinitely.
   */
  private resolvePhaseTransitionSurfaceBlockers(): void {
    const completedRollouts = this.state.flights.filter(
      (flight) => flight.phase === "landing" && flight.progress >= 1 - 1e-9,
    );
    if (!completedRollouts.length) return;
    const surfaceFlights = this.state.flights.filter(
      (flight): flight is Flight & { phase: "taxi-in" | "taxi-out" } =>
        flight.phase === "taxi-in" || flight.phase === "taxi-out",
    );
    for (const rollout of completedRollouts) {
      const blocker = surfaceFlights.find((flight) => {
        if (
          flight.surfaceYield ||
          (this.stationarySeconds.get(flight.id) ?? 0) < 30
        )
          return false;
        const reason =
          flight.safetyHoldReason ?? flight.automaticHoldReason ?? "";
        if (new RegExp(`(?:flight |\\(flight )${rollout.id}\\)?$`).test(reason))
          return true;
        // A crossing hold names the protected runway, not the aircraft on it.
        // Expose that dependency when the runway occupant is a completed
        // rollout that also cannot create its taxi-in phase. The recovery below
        // still has to prove, on the sourced graph, that moving this aircraft
        // resolves the blocked transition.
        const crossing = this.nextUnclearedCrossing(flight);
        return Boolean(
          crossing &&
          this.runwayBlocker(crossing.runwayId, flight.id)?.id === rollout.id,
        );
      });
      if (!blocker) continue;
      if (
        this.startSurfaceYieldRecovery(
          [blocker],
          `phase-transition-${rollout.id}-${blocker.id}`,
          { flight: rollout, next: "taxi-in" },
        )
      )
        return;
    }
  }

  /**
   * A departure can be safely cleared to push and still fail the taxi-out
   * phase transition because an arrival is stopped beside its stand. Move the
   * arrival only along its authoritative taxi route until the complete
   * pushback transition sweep is clear. This is the ramp equivalent of a tug
   * reposition; the normal collision, vehicle, pavement, and runway checks
   * remain authoritative for every sampled pose.
   */
  private resolvePushbackTransitionBlockers(): void {
    const blockedArrivals = this.state.flights.filter(
      (flight): flight is Flight & { phase: "taxi-in" } =>
        flight.phase === "taxi-in" &&
        (this.stationarySeconds.get(flight.id) ?? 0) >= 90,
    );
    if (!blockedArrivals.length) return;
    for (const departure of this.state.flights) {
      if (
        departure.phase !== "resting" ||
        !departure.pushbackCleared ||
        !this.transitionConflict(departure, "taxi-out")
      )
        continue;
      const blocker = blockedArrivals.find(
        (arrival) =>
          arrival.safetyHoldReason ===
          `projected path conflict with flight ${departure.id}`,
      );
      if (!blocker) continue;
      if (
        this.startSurfaceYieldRecovery(
          [blocker],
          `pushback-transition-${departure.id}-${blocker.id}`,
          { flight: departure, next: "taxi-out" },
        )
      )
        return;
    }
  }

  /**
   * Resolve longer wait-for cycles that include graph reservations as well as
   * physical collision holds. A narrow apron can otherwise form A → B → C → A
   * even though no pair is a reciprocal head-on conflict. Recovery always
   * remains on the sourced graph: one low-priority member receives a suffix
   * route around its immediate blocker, and normal reservations arbitrate it
   * again on the next fixed tick.
   */
  private resolveSurfaceWaitCycles(): void {
    const surfaceFlights = this.state.flights.filter(
      (flight): flight is Flight & { phase: "taxi-in" | "taxi-out" } =>
        flight.phase === "taxi-in" || flight.phase === "taxi-out",
    );
    const flightById = new Map(
      surfaceFlights.map((flight) => [flight.id, flight]),
    );
    const waitFor = new Map<number, number>();
    for (const flight of surfaceFlights) {
      if ((this.stationarySeconds.get(flight.id) ?? 0) < 30) continue;
      const runwayEntryBlocker =
        flight.phase === "taxi-out" &&
        flight.progress >= 0.985 &&
        !flight.runwayEntryCleared
          ? this.departurePathBlocker(flight)
          : undefined;
      const numeric = (
        flight.safetyHoldReason ?? flight.automaticHoldReason
      )?.match(/(?:flight |\(flight )(\d+)\)?$/);
      // Tower can reject entry without setting a movement hold. When the
      // surface aircraft occupying the departure sweep is itself held by this
      // departure, this supplies the missing half of the wait cycle so normal
      // pavement-only reroute/tug recovery can resolve it.
      let blockerId =
        runwayEntryBlocker?.id ?? (numeric ? Number(numeric[1]) : undefined);
      if (
        blockerId === undefined &&
        flight.automaticHoldReason?.startsWith(
          "pushback corridor protected for ",
        )
      ) {
        const callsign = flight.automaticHoldReason.slice(
          "pushback corridor protected for ".length,
        );
        blockerId = surfaceFlights.find(
          (candidate) => candidate.callsign === callsign,
        )?.id;
      }
      // Crossing holds do not always include a flight id in their human
      // reason. Recover the real wait-for edge from the next authoritative
      // crossing and its protected-runway owner so a chain of taxi-in
      // aircraft cannot remain invisible to cycle recovery indefinitely.
      if (
        blockerId === undefined &&
        (flight.crossingHoldRunway !== undefined ||
          (flight.pendingCrossingCount ?? 0) > 0)
      ) {
        const crossing = this.nextUnclearedCrossing(flight);
        if (crossing) {
          const crossingBlocker = this.runwayBlocker(
            crossing.runwayId,
            flight.id,
          );
          if (
            crossingBlocker &&
            (crossingBlocker.phase === "taxi-in" ||
              crossingBlocker.phase === "taxi-out")
          )
            blockerId = crossingBlocker.id;
        }
      }
      // A directional taxiway-flow window is a strategic reservation, not an
      // aircraft, so it cannot be inserted directly into the wait graph. If
      // an aircraft is physically in that same section and is retaining the
      // window's direction, however, it is the real traffic dependency. This
      // makes a chain such as A -> flow window -> B -> A visible to the
      // existing cycle resolver without inventing an owner for an empty
      // taxiway or reversing an occupied section.
      if (blockerId === undefined) {
        const flowHold = this.surfaceFlowHoldByFlight.get(flight);
        const window = flowHold
          ? this.surfaceFlowPlanner.currentWindow(flowHold.id)
          : undefined;
        if (flowHold && window && window.direction !== flowHold.direction) {
          const retainer = surfaceFlights
            .filter((candidate) => {
              if (candidate.id === flight.id) return false;
              const retainsWindow =
                (this.stationarySeconds.get(candidate.id) ?? 0) < 30 ||
                !(
                  candidate.automaticHold ||
                  candidate.safetyHold ||
                  candidate.controlHold
                );
              if (!retainsWindow) return false;
              return surfaceRouteReservationClaims(
                this.config.surfaceGraph,
                candidate.surfaceRoute,
                candidate.surfaceRouteEdges,
                candidate.progress,
                candidate.phase,
                0,
                0,
              ).some(
                (claim) =>
                  claim.kind === "taxiway-flow" &&
                  claim.id === flowHold.id &&
                  claim.direction === window.direction,
              );
            })
            .sort(
              (first, second) =>
                (this.stationarySeconds.get(first.id) ?? 0) -
                  (this.stationarySeconds.get(second.id) ?? 0) ||
                second.progress - first.progress ||
                first.id - second.id,
            )[0];
          blockerId = retainer?.id;
        }
      }
      if (
        blockerId !== undefined &&
        blockerId !== flight.id &&
        flightById.has(blockerId)
      ) {
        waitFor.set(flight.id, blockerId);
      }
    }
    if (waitFor.size < 2) return;

    const completed = new Set<number>();
    const cycles: number[][] = [];
    for (const start of waitFor.keys()) {
      if (completed.has(start)) continue;
      const path: number[] = [];
      const pathIndex = new Map<number, number>();
      let cursor: number | undefined = start;
      while (
        cursor !== undefined &&
        waitFor.has(cursor) &&
        !completed.has(cursor)
      ) {
        const cycleStart = pathIndex.get(cursor);
        if (cycleStart !== undefined) {
          cycles.push(path.slice(cycleStart));
          break;
        }
        pathIndex.set(cursor, path.length);
        path.push(cursor);
        cursor = waitFor.get(cursor);
      }
      for (const id of path) completed.add(id);
    }

    const avoidanceEdges = (blocker: Flight): Set<string> => {
      return this.surfaceDeadlockAvoidanceEdges(blocker);
    };

    for (const cycle of cycles) {
      const members = cycle
        .map((id) => flightById.get(id))
        .filter(
          (flight): flight is Flight & { phase: "taxi-in" | "taxi-out" } =>
            Boolean(flight),
        )
        .sort(
          (first, second) =>
            (first.phase === "taxi-out" ? 0 : 1) -
              (second.phase === "taxi-out" ? 0 : 1) ||
            first.progress - second.progress ||
            first.id - second.id,
        );
      const recentlyAmended = members.some(
        (flight) =>
          Boolean(flight.surfaceYield) ||
          (flight.surfaceReroute?.reason.includes("surface wait cycle") &&
            this.state.elapsed - flight.surfaceReroute.selectedAtSeconds < 45),
      );
      if (recentlyAmended) continue;
      const signature = cycle
        .slice()
        .sort((first, second) => first - second)
        .join("-");
      const recoveryAnchor = members
        .slice()
        .sort((first, second) => first.id - second.id)[0];
      if (!recoveryAnchor) continue;
      const scheduledRecovery = this.surfaceCycleRecovery.get(recoveryAnchor);
      if (
        scheduledRecovery?.signature === signature &&
        this.state.elapsed + 1e-6 < scheduledRecovery.retryAtSeconds
      )
        continue;
      this.surfaceCycleRecovery.set(recoveryAnchor, {
        signature,
        retryAtSeconds: this.state.elapsed + SURFACE_DEADLOCK_RETRY_SECONDS,
      });
      let recovered = false;
      for (const candidate of members) {
        const blockerId = waitFor.get(candidate.id);
        const blocker =
          blockerId === undefined ? undefined : flightById.get(blockerId);
        if (!blocker) continue;
        const blockedEdges = avoidanceEdges(blocker);
        if (!blockedEdges.size) continue;
        const rerouted = this.replanSurfaceFlight(
          candidate,
          [`traffic-cycle:${signature}`],
          true,
          {
            additionallyBlockedEdgeIds: blockedEdges,
            reason: `surface wait cycle with ${blocker.callsign}`,
            holdIfUnavailable: false,
          },
        );
        if (!rerouted) continue;
        candidate.safetyHold = false;
        candidate.safetyHoldReason = undefined;
        candidate.automaticHold = false;
        candidate.automaticHoldReason = undefined;
        this.stationarySeconds.set(candidate.id, 0);
        recovered = true;
        break;
      }
      if (!recovered) this.startSurfaceYieldRecovery(members, signature);
    }
  }

  private holdForUnavailableSurfaceRoute(
    flight: Flight,
    disruptionIds: string[],
    reason: string,
  ): boolean {
    const changed =
      flight.surfaceReroute?.status !== "holding" ||
      flight.surfaceReroute.reason !== reason;
    const selectedAtSeconds = changed
      ? this.state.elapsed
      : (flight.surfaceReroute?.selectedAtSeconds ?? this.state.elapsed);
    flight.surfaceReroute = {
      revision: (flight.surfaceReroute?.revision ?? 0) + (changed ? 1 : 0),
      status: "holding",
      selectedAtSeconds,
      disruptionIds: [...new Set(disruptionIds)],
      previousEdgeIds: [...(flight.surfaceRouteEdges ?? [])],
      routeEdgeIds: [...(flight.surfaceRouteEdges ?? [])],
      addedDistanceM: 0,
      reason,
    };
    flight.automaticHold = true;
    flight.automaticHoldReason = reason;
    if (changed)
      this.events.push({
        type: "surface-reroute",
        flight,
        runway: flight.runway,
        taxiway: flight.taxiway,
        detail: `holding · ${reason}`,
      });
    return changed;
  }

  private planRunwayExit(flight: Flight, reason: string, emit = true): boolean {
    const congestionPlanning = this.surfaceRoutePlanning(
      flight.id,
      this.parkedAircraftBlockedEdgeIds(flight),
    );
    const selection = selectRunwayExit({
      config: this.config,
      runwayId: flight.runway,
      operatingEnd: flight.operatingEnd,
      aircraft: flight.aircraft,
      gateSlot: flight.gateSlot,
      weather: this.state.weather,
      selectedAtSeconds: this.state.elapsed,
      planning: congestionPlanning,
      flightId: flight.id,
      competingPlans: this.state.flights.flatMap((other) =>
        other.id === flight.id || !other.runwayExit
          ? []
          : [
              {
                flightId: other.id,
                runwayId: other.runwayExit.runwayId,
                operatingEnd: other.runwayExit.operatingEnd,
                nodeId: other.runwayExit.nodeId,
                distanceFromThresholdM: other.runwayExit.distanceFromThresholdM,
                taxiRouteEdgeIds: other.runwayExit.taxiRouteEdgeIds,
              },
            ],
      ),
    });
    const previous = flight.runwayExit;
    flight.runwayExit = selection?.state;
    const changed = Boolean(
      selection &&
      (previous?.nodeId !== selection.state.nodeId ||
        previous.brakingAction !== selection.state.brakingAction ||
        previous.routeDistanceM !== selection.state.routeDistanceM ||
        previous.safe !== selection.state.safe),
    );
    if (emit && changed) {
      this.events.push({
        type: "runway-exit-plan",
        flight,
        runway: flight.runway,
        taxiway: selection?.state.taxiwayName,
        detail: this.runwayExitDetail(selection?.state, reason),
      });
    }
    return Boolean(selection?.state.safe);
  }

  private runwayExitDetail(
    exit: FlightRunwayExitState | undefined,
    reason: string,
  ): string {
    if (!exit) return `${reason} · no pavement-connected exit route available`;
    const margin =
      exit.stoppingMarginM >= 0
        ? `${Math.round(exit.stoppingMarginM)} m margin`
        : `${Math.round(Math.abs(exit.stoppingMarginM))} m shortfall`;
    return `${reason} · ${exit.taxiwayName} · ${exit.brakingAction} braking · ${Math.round(exit.targetExitSpeedKts)} kt · ${margin}`;
  }

  private surfacePlanCacheSignature(
    flight: Flight,
    phase: "taxi-in" | "resting" | "taxi-out",
    runway = flight.runway,
    operatingEnd = flight.operatingEnd,
  ): string {
    const parked = this.state.flights
      .filter(
        (candidate) =>
          candidate.id !== flight.id && candidate.phase === "resting",
      )
      .map(
        (candidate) =>
          `${candidate.id}:${candidate.aircraft}:${candidate.gateSlot}:${candidate.standId ?? ""}`,
      )
      .join(",");
    const disruptions = this.state.surfaceDisruptions
      .map(
        (disruption) =>
          `${disruption.id}:${disruption.status}:${Math.floor(disruption.recoveryProgress * 20)}`,
      )
      .join(",");
    return [
      phase,
      runway,
      operatingEnd,
      flight.aircraft,
      flight.gateSlot,
      flight.standId ?? "",
      flight.runwayExit?.nodeId ?? "",
      this.state.runwayConfigurationId,
      this.state.weather.condition,
      this.state.weather.surfaceCondition,
      Math.round(this.state.weather.temperatureC),
      flight.deicing.cycle,
      disruptions,
      parked,
    ].join("|");
  }

  private adoptSurfaceRoutePreview(flight: Flight, preview: Flight): void {
    flight.surfaceRoute = preview.surfaceRoute
      ? [...preview.surfaceRoute]
      : undefined;
    flight.surfaceRouteEdges = preview.surfaceRouteEdges
      ? [...preview.surfaceRouteEdges]
      : undefined;
    flight.surfaceRoutingCost = preview.surfaceRoutingCost;
    flight.surfaceCongestionPenalty = preview.surfaceCongestionPenalty;
    flight.surfaceCongestedEdgeIds = preview.surfaceCongestedEdgeIds
      ? [...preview.surfaceCongestedEdgeIds]
      : undefined;
    flight.surfaceNode = preview.surfaceNode;
    flight.surfaceEdge = preview.surfaceEdge;
    flight.rampControlZoneId = preview.rampControlZoneId;
    flight.rampControlZoneName = preview.rampControlZoneName;
    flight.rampControlZoneCapacity = preview.rampControlZoneCapacity;
    flight.surfaceAlleyId = preview.surfaceAlleyId;
    flight.surfaceFlowDirection = preview.surfaceFlowDirection;
    flight.standPath = preview.standPath;
    flight.taxiway = preview.taxiway;
    flight.standId = preview.standId;
    flight.pushbackDirection = preview.pushbackDirection;
    flight.pushbackReleaseProgress = preview.pushbackReleaseProgress;
    flight.duration = preview.duration;
    flight.requiredCrossings = [...(preview.requiredCrossings ?? [])];
    flight.crossingClearances = [...(preview.crossingClearances ?? [])];
    flight.crossingClearanceIds = [...(preview.crossingClearanceIds ?? [])];
    flight.pendingCrossingCount = preview.pendingCrossingCount;
    flight.deicing = { ...preview.deicing };
    const pushbackPreview = this.pushbackPreviewCache.get(preview);
    if (pushbackPreview) this.pushbackPreviewCache.set(flight, pushbackPreview);
  }

  private assignSurfaceRoute(
    flight: Flight,
    phase: "taxi-in" | "resting" | "taxi-out",
  ): void {
    const stand = this.config.surfaceGraph.stands.find(
      (item) => item.slot === flight.gateSlot,
    );
    const profile = aircraftProfile(flight.aircraft);
    const routeRequirements = {
      wingspanM: profile.wingspanM,
      minimumWingtipClearanceM: profile.minimumWingtipClearanceM,
    };
    const parkedAircraftBlockedEdges =
      phase === "resting"
        ? new Set<string>()
        : this.parkedAircraftBlockedEdgeIds(flight);
    const congestionPlanning = this.surfaceRoutePlanning(
      flight.id,
      parkedAircraftBlockedEdges,
    );
    let route = surfaceRouteForFlight(
      this.config.surfaceGraph,
      flight.runway,
      flight.operatingEnd,
      phase,
      flight.gateSlot,
      routeRequirements,
      congestionPlanning,
      phase === "taxi-in" ? flight.runwayExit?.nodeId : undefined,
    );
    if (phase === "taxi-out" && winterDeicingRequired(this.state.weather)) {
      const deicingPlan = planDeicingTaxiRoute(
        this.config,
        flight,
        congestionPlanning,
      );
      if (deicingPlan) {
        route = deicingPlan.route;
        applyDeicingRoutePlan(flight, deicingPlan, "enroute");
      } else {
        flight.deicing = {
          ...createDeicingState(
            "No compatible route to an available deicing facility.",
          ),
          required: true,
          status: "unavailable",
          cycle: Math.max(1, flight.deicing.cycle),
        };
      }
    } else if (
      phase === "taxi-out" &&
      !winterDeicingRequired(this.state.weather)
    ) {
      markDeicingNotRequired(flight);
    }
    flight.surfaceRoute = route?.nodeIds;
    flight.surfaceRouteEdges = route?.edgeIds;
    flight.surfaceRoutingCost = route?.routingCost;
    flight.surfaceCongestionPenalty = route?.congestionPenalty;
    flight.surfaceCongestedEdgeIds = route?.congestedEdgeIds;
    flight.standId = stand?.id;
    flight.surfaceNode = route?.nodeIds[0];
    flight.surfaceEdge = route?.edgeIds[0];
    const prospectiveDeicingFlight =
      phase === "resting"
        ? {
            ...flight,
            runway: flight.departureRunway,
            operatingEnd: this.preferredOperatingEnd(flight.departureRunway),
            deicing: { ...flight.deicing },
          }
        : flight;
    const prospectiveDeicingPlan =
      phase === "resting" && winterDeicingRequired(this.state.weather)
        ? planDeicingTaxiRoute(
            this.config,
            prospectiveDeicingFlight,
            congestionPlanning,
          )
        : null;
    if (phase === "resting" && winterDeicingRequired(this.state.weather)) {
      if (prospectiveDeicingPlan)
        applyDeicingRoutePlan(flight, prospectiveDeicingPlan, "planned");
      else {
        flight.deicing = {
          ...createDeicingState(
            "No compatible route to an available deicing facility.",
          ),
          required: true,
          status: "unavailable",
          cycle: Math.max(1, flight.deicing.cycle),
        };
      }
    } else if (
      phase === "resting" &&
      !winterDeicingRequired(this.state.weather)
    ) {
      markDeicingNotRequired(flight);
    }
    const prospectiveRoute =
      phase === "resting"
        ? (prospectiveDeicingPlan?.route ??
          surfaceRouteForFlight(
            this.config.surfaceGraph,
            flight.departureRunway,
            this.preferredOperatingEnd(flight.departureRunway),
            "taxi-out",
            flight.gateSlot,
            routeRequirements,
            congestionPlanning,
          ))
        : phase === "taxi-out"
          ? route
          : null;
    const pushback = surfacePushbackPlan(
      this.config.surfaceGraph,
      prospectiveRoute?.nodeIds,
      prospectiveRoute?.edgeIds,
      stand,
    );
    if (pushback) {
      flight.pushbackDirection = pushback.direction;
      flight.pushbackReleaseProgress = pushback.releaseProgress;
    } else if (stand) {
      flight.pushbackDirection = stand.pushbackDirection;
      flight.pushbackReleaseProgress = 0;
    }
    if (phase === "resting" && prospectiveRoute) {
      const runway = flight.departureRunway;
      const operatingEnd = this.preferredOperatingEnd(runway);
      const preview: Flight = {
        ...flight,
        phase: "taxi-out",
        progress: 0,
        phaseElapsed: 0,
        runway,
        departureRunway: runway,
        operatingEnd,
        duration: this.surfaceRouteDuration(
          { ...flight, phase: "taxi-out" },
          prospectiveRoute,
        ),
        deicing: { ...flight.deicing },
        kinematics: { ...flight.kinematics },
        motion: { ...flight.motion },
        surfaceRoute: prospectiveRoute.nodeIds,
        surfaceRouteEdges: prospectiveRoute.edgeIds,
        surfaceRoutingCost: prospectiveRoute.routingCost,
        surfaceCongestionPenalty: prospectiveRoute.congestionPenalty,
        surfaceCongestedEdgeIds: prospectiveRoute.congestedEdgeIds,
        surfaceNode: prospectiveRoute.nodeIds[0],
        surfaceEdge: prospectiveRoute.edgeIds[0],
        requiredCrossings: surfaceRouteRunwayCrossings(
          this.config.surfaceGraph,
          prospectiveRoute.edgeIds,
          runway,
        ),
        crossingClearances: [],
        crossingClearanceIds: [],
      };
      this.updateSurfaceRouteState(preview);
      syncFlightMotion(this.config, preview);
      const corridorEnd = Math.min(
        0.12,
        Math.max(0.055, preview.pushbackReleaseProgress + 0.035),
      );
      const sweep = buildAircraftCollisionSweep(
        Array.from({ length: 21 }, (_, sampleIndex) =>
          aircraftCollisionEnvelope(
            this.config,
            preview,
            (corridorEnd * sampleIndex) / 20,
          ),
        ),
      );
      const signature = this.surfacePlanCacheSignature(
        flight,
        "taxi-out",
        runway,
        operatingEnd,
      );
      this.pushbackPreviewCache.set(flight, { signature, preview, sweep });
    }
    if (phase === "resting")
      flight.duration = flight.turnaround.plannedDurationSeconds;
    else if (route) {
      flight.duration = this.surfaceRouteDuration(flight, route);
      flight.requiredCrossings = surfaceRouteRunwayCrossings(
        this.config.surfaceGraph,
        route.edgeIds,
        flight.runway,
      );
      const crossingWindows = surfaceRouteCrossingWindows(
        this.config.surfaceGraph,
        route.nodeIds,
        flight.progress,
        flight.runway,
        route.edgeIds,
      );
      const validCrossingIds = new Set(
        crossingWindows.map((crossing) => crossing.id),
      );
      flight.crossingClearanceIds = (flight.crossingClearanceIds ?? []).filter(
        (id) => validCrossingIds.has(id),
      );
      flight.crossingClearances = [
        ...new Set(
          crossingWindows
            .filter((crossing) =>
              flight.crossingClearanceIds?.includes(crossing.id),
            )
            .map((crossing) => crossing.runwayId),
        ),
      ];
    }
    if (phase === "resting") {
      const apron = this.config.surfaceGraph.taxiways.find(
        (taxiway) => taxiway.id === stand?.apronTaxiwayId,
      );
      flight.taxiway = apron?.name ?? "Terminal Apron";
      this.updateSurfaceRouteState(flight);
      return;
    }
    const firstTaxiwayId = route?.taxiwayIds[0];
    flight.taxiway =
      this.config.surfaceGraph.taxiways.find(
        (taxiway) => taxiway.id === firstTaxiwayId,
      )?.name ?? this.taxiwayName(flight.runway);
    this.updateSurfaceRouteState(flight);
  }

  private surfaceRouteDuration(flight: Flight, route: SurfaceRoute): number {
    const profile = aircraftProfile(flight.aircraft);
    const taxiMps = profile.taxiKts * KNOT_TO_MPS;
    const motion = sampleAircraftSurfaceMotion(
      this.config.surfaceGraph,
      route.nodeIds,
      route.edgeIds,
      1,
      profile,
    );
    const distance = motion?.totalDistance ?? route.distance;
    const weatherFactor = this.weatherDurationMultiplier(flight.phase);
    return Math.max(
      18,
      ((distance * WORLD_METERS_PER_UNIT) / Math.max(1, taxiMps)) *
        weatherFactor,
    );
  }

  private updateServiceVehicles(delta: number): void {
    // Do not materialize a complete service fleet when an arrival first exits
    // the runway. In a congested hub that can leave dozens of hidden vehicles
    // staged for aircraft still many minutes from their stands. Create the
    // equipment only inside the final taxi-in window; gate-in retains a
    // fallback below if an unusually short route reaches the stand first.
    for (const flight of this.state.flights) {
      if (flight.phase !== "taxi-in") continue;
      if (
        this.state.serviceVehicles.some(
          (vehicle) => vehicle.flightId === flight.id,
        )
      )
        continue;
      const remainingTaxiSeconds = Math.max(
        0,
        flight.duration * (1 - flight.progress),
      );
      if (
        flight.progress + 1e-6 < SERVICE_VEHICLE_PREPOSITION_PROGRESS &&
        remainingTaxiSeconds > SERVICE_VEHICLE_PREPOSITION_LEAD_SECONDS
      )
        continue;
      this.prepareServiceVehicles(
        flight,
        flight.gateAssignment?.scheduledGateInSeconds ??
          this.state.elapsed + remainingTaxiSeconds,
        true,
      );
    }
    const flightById = new Map(
      this.state.flights.map((flight) => [flight.id, flight]),
    );
    for (const vehicle of this.state.serviceVehicles) {
      if (vehicle.incidentResponseId) {
        this.updateIncidentResponseVehicle(vehicle, delta);
        continue;
      }
      const flight = flightById.get(vehicle.flightId);
      if (!flight) continue;
      const task = flight.turnaround.tasks.find(
        (candidate) => candidate.type === vehicle.service,
      );
      if (!task?.required) continue;
      if (
        vehicle.status === "scheduled" &&
        this.state.elapsed + 1e-6 >= vehicle.dispatchAtSeconds
      ) {
        if (vehicle.prepositionAtStand) {
          if (
            this.state.elapsed + 1e-6 <
            (vehicle.prepositionRetryAtSeconds ?? -Infinity)
          )
            continue;
          this.tryPrepositionServiceVehicle(flight, vehicle);
          continue;
        }
        setServiceVehicleStatus(
          this.config.surfaceGraph,
          vehicle,
          "dispatching",
        );
        this.emitServiceVehicleEvent(
          "service-vehicle-dispatch",
          flight,
          vehicle,
          `${vehicle.label} dispatched from ramp staging`,
        );
        continue;
      }
      if (
        vehicle.status === "dispatching" &&
        advanceServiceVehicleMotion(this.config.surfaceGraph, vehicle, delta)
      ) {
        setServiceVehicleStatus(this.config.surfaceGraph, vehicle, "staged");
        continue;
      }
      if (vehicle.status === "staged") {
        const dependenciesComplete = task.dependencies.every((dependency) => {
          const prerequisite = flight.turnaround.tasks.find(
            (candidate) => candidate.type === dependency,
          );
          return !prerequisite?.required || prerequisite.status === "complete";
        });
        const earliest =
          (flight.turnaround.actualStartSeconds ?? this.state.elapsed) +
          task.scheduledStartOffsetSeconds;
        if (
          flight.phase === "resting" &&
          dependenciesComplete &&
          this.state.elapsed + 1e-6 >= earliest &&
          this.serviceStandLaneAvailable(vehicle)
        ) {
          setServiceVehicleStatus(
            this.config.surfaceGraph,
            vehicle,
            "approaching",
          );
        }
        continue;
      }
      if (
        vehicle.status === "approaching" &&
        advanceServiceVehicleMotion(this.config.surfaceGraph, vehicle, delta)
      ) {
        setServiceVehicleStatus(this.config.surfaceGraph, vehicle, "servicing");
        this.emitServiceVehicleEvent(
          "service-vehicle-arrive",
          flight,
          vehicle,
          `${vehicle.label} in position at ${vehicle.standId}`,
        );
        continue;
      }
      if (
        vehicle.status === "servicing" &&
        task.status === "complete" &&
        this.serviceStandLaneAvailable(vehicle)
      ) {
        setServiceVehicleStatus(this.config.surfaceGraph, vehicle, "clearing");
        this.emitServiceVehicleEvent(
          "service-vehicle-return",
          flight,
          vehicle,
          `${vehicle.label} service complete · clearing the stand`,
        );
        continue;
      }
      if (
        vehicle.status === "clearing" &&
        advanceServiceVehicleMotion(this.config.surfaceGraph, vehicle, delta)
      ) {
        // The sourced surface graph represents aircraft movement pavement,
        // not the dense terminal-side service-road network. Hand equipment
        // off at its off-stand staging point instead of sending it back along
        // taxi connectors where it can meet an airliner nose-to-nose.
        setServiceVehicleStatus(this.config.surfaceGraph, vehicle, "complete");
        this.emitServiceVehicleEvent(
          "service-vehicle-clear",
          flight,
          vehicle,
          `${vehicle.label} clear of the stand lane · entered the terminal service road`,
        );
        continue;
      }
      if (
        vehicle.status === "returning" &&
        advanceServiceVehicleMotion(this.config.surfaceGraph, vehicle, delta)
      ) {
        setServiceVehicleStatus(this.config.surfaceGraph, vehicle, "complete");
        continue;
      }
      syncServiceVehiclePose(this.config.surfaceGraph, vehicle);
    }
    const liveFlightIds = new Set(flightById.keys());
    // A completed vehicle has already emitted its durable lifecycle event and
    // entered the unmodeled terminal service-road network. Keeping its hidden
    // entity until the aircraft eventually departs only grows long-soak state
    // without preserving any operational information; turnaround task state
    // remains the authoritative completion record.
    this.state.serviceVehicles = this.state.serviceVehicles.filter(
      (vehicle) =>
        (vehicle.incidentResponseId
          ? this.state.surfaceDisruptions.some(
              (disruption) => disruption.id === vehicle.incidentResponseId,
            )
          : liveFlightIds.has(vehicle.flightId)) &&
        vehicle.status !== "complete",
    );
  }

  /** Only one vehicle may enter a stand-side connector at a time. */
  private serviceStandLaneAvailable(vehicle: ServiceVehicleState): boolean {
    return !this.state.serviceVehicles.some(
      (other) =>
        other.id !== vehicle.id &&
        other.standId === vehicle.standId &&
        other.standSide === vehicle.standSide &&
        (other.status === "approaching" ||
          other.status === "clearing" ||
          (other.status === "dispatching" && other.currentEdge === undefined) ||
          (other.status === "returning" && other.currentEdge === undefined)),
    );
  }

  private tryPrepositionServiceVehicle(
    flight: Flight,
    vehicle: ServiceVehicleState,
  ): boolean {
    const standInUseByAnotherFlight = this.state.flights.some(
      (candidate) =>
        candidate.id !== flight.id &&
        candidate.standId === vehicle.standId &&
        (candidate.phase === "taxi-in" || candidate.phase === "resting"),
    );
    const incumbentEquipmentStillActive = this.state.serviceVehicles.some(
      (candidate) =>
        candidate.id !== vehicle.id &&
        candidate.flightId !== flight.id &&
        candidate.standId === vehicle.standId &&
        candidate.status !== "scheduled" &&
        candidate.status !== "complete",
    );
    // A future gate reservation does not authorize early equipment access.
    // Keep the next turn at ramp staging until the incumbent aircraft and its
    // service convoy have both released the physical stand envelope.
    if (standInUseByAnotherFlight || incumbentEquipmentStillActive) {
      vehicle.prepositionRetryAtSeconds =
        this.state.elapsed + SERVICE_VEHICLE_PREPOSITION_RETRY_SECONDS;
      return false;
    }
    const preview: ServiceVehicleState = {
      ...vehicle,
      outboundRoute: [...vehicle.outboundRoute],
      outboundRouteEdges: [...vehicle.outboundRouteEdges],
      returnRoute: [...vehicle.returnRoute],
      returnRouteEdges: [...vehicle.returnRouteEdges],
      standPath: vehicle.standPath.map((point) => [...point]),
    };
    setServiceVehicleStatus(this.config.surfaceGraph, preview, "staged");
    const others = this.state.serviceVehicles.filter(
      (candidate) => candidate.id !== vehicle.id,
    );
    const blocked = findServiceVehicleConflicts(
      this.config,
      [preview, ...others],
      this.state.flights,
    ).some(
      (conflict) =>
        conflict.vehicle === preview.id || conflict.otherVehicle === preview.id,
    );
    if (blocked) {
      vehicle.prepositionRetryAtSeconds =
        this.state.elapsed + SERVICE_VEHICLE_PREPOSITION_RETRY_SECONDS;
      return false;
    }
    vehicle.prepositionRetryAtSeconds = undefined;
    setServiceVehicleStatus(this.config.surfaceGraph, vehicle, "staged");
    this.emitServiceVehicleEvent(
      "service-vehicle-dispatch",
      flight,
      vehicle,
      `${vehicle.label} pre-positioned at ${vehicle.standId} before gate-in`,
    );
    return true;
  }

  private emitServiceVehicleEvent(
    type: AirportEvent["type"],
    flight: Flight,
    vehicle: ServiceVehicleState,
    detail: string,
  ): void {
    this.events.push({
      type,
      flight,
      taxiway: flight.taxiway,
      detail,
      turnaroundService: vehicle.service,
      serviceVehicleId: vehicle.id,
      serviceVehicleType: vehicle.type,
      serviceVehicleStatus: vehicle.status,
    });
  }

  private updateTurnaround(flight: Flight): void {
    const vehicles = this.state.serviceVehicles.filter(
      (vehicle) => vehicle.flightId === flight.id,
    );
    const transitions = advanceTurnaround(
      flight.turnaround,
      this.state.elapsed,
      availableVehicleServices(flight, vehicles),
    );
    flight.phaseElapsed = flight.turnaround.elapsedSeconds;
    flight.progress = flight.turnaround.progress;
    flight.kinematics.fuelPercent = turnaroundFuelPercent(flight.turnaround);
    this.emitTurnaroundTransitions(flight, transitions);
  }

  private emitTurnaroundTransitions(
    flight: Flight,
    transitions: TurnaroundTransition[],
  ): void {
    for (const transition of transitions) {
      const task = transition.service
        ? flight.turnaround.tasks.find(
            (candidate) => candidate.type === transition.service,
          )
        : undefined;
      const detail =
        transition.type === "turnaround-ready"
          ? "all required services complete · pushback eligible"
          : `${task?.label ?? transition.service} ${transition.type === "service-start" ? "started" : "complete"}`;
      if (
        transition.service === "maintenance" &&
        transition.type === "service-start"
      ) {
        flight.operationalDetail.airworthinessStatus = "out-of-service";
      } else if (
        transition.service === "maintenance" &&
        transition.type === "service-complete"
      ) {
        flight.operationalDetail.airworthinessStatus = "serviceable";
        flight.operationalDetail.returnToServiceAtSeconds = this.state.elapsed;
      }
      this.events.push({
        type: transition.type,
        flight,
        taxiway: flight.taxiway,
        detail,
        turnaroundService: transition.service,
      });
    }
  }

  private updateSurfaceRouteState(flight: Flight): void {
    const sample = sampleSurfaceRouteWithEdges(
      this.config.surfaceGraph,
      flight.surfaceRoute,
      flight.surfaceRouteEdges,
      flight.progress,
    );
    if (sample) {
      flight.surfaceNode = sample.nearestNodeId;
      flight.surfaceEdge = sample.edge?.id;
      if (sample.edge?.taxiwayId) flight.taxiway = sample.edge.name;
    }
    if (
      flight.phase !== "taxi-in" &&
      flight.phase !== "resting" &&
      flight.phase !== "taxi-out"
    ) {
      flight.pendingCrossingCount = undefined;
      return;
    }
    if (flight.phase === "taxi-in" || flight.phase === "taxi-out") {
      const clearanceIds = new Set(flight.crossingClearanceIds ?? []);
      const legacyClearances =
        flight.crossingClearanceIds === undefined
          ? new Set(flight.crossingClearances ?? [])
          : null;
      flight.pendingCrossingCount = surfaceRouteCrossingWindows(
        this.config.surfaceGraph,
        flight.surfaceRoute,
        flight.progress,
        flight.runway,
        flight.surfaceRouteEdges,
      ).filter(
        (crossing) =>
          !clearanceIds.has(crossing.id) &&
          !legacyClearances?.has(crossing.runwayId) &&
          crossing.exitProgress + 1e-6 >= flight.progress,
      ).length;
    } else {
      flight.pendingCrossingCount = 0;
    }
    const operation = surfaceRouteOperationalState(
      this.config.surfaceGraph,
      flight.surfaceRoute,
      flight.surfaceRouteEdges,
      flight.progress,
      flight.phase,
      flight.standId,
    );
    flight.rampControlZoneId = operation.rampControlZoneId ?? undefined;
    flight.rampControlZoneName = operation.rampControlZoneName ?? undefined;
    flight.rampControlZoneCapacity =
      operation.rampControlZoneCapacity ?? undefined;
    flight.surfaceAlleyId = operation.alleyId ?? undefined;
    flight.surfaceFlowDirection = operation.flowDirection;
    flight.standPath = operation.standPath ?? undefined;
  }

  private surfaceTrafficMovements(): SurfaceTrafficMovement[] {
    return this.state.flights
      .filter(
        (flight): flight is Flight & { phase: "taxi-in" | "taxi-out" } =>
          flight.phase === "taxi-in" || flight.phase === "taxi-out",
      )
      .map((flight) => ({
        flightId: flight.id,
        phase: flight.phase,
        nodeIds: flight.surfaceRoute,
        edgeIds: flight.surfaceRouteEdges,
        progress: flight.progress,
      }));
  }

  /**
   * Treat aircraft parked at stands as physical routing obstacles. The graph
   * planner can then select another pavement path before pushback/taxi-in,
   * instead of allowing collision arbitration to discover an impassable stand
   * corridor only after the aircraft has entered it.
   */
  private parkedAircraftBlockedEdgeIds(
    movingFlight: Flight,
    includedFlightIds?: ReadonlySet<number>,
  ): Set<string> {
    const parkedFlights = this.state.flights.filter(
      (candidate) =>
        candidate.id !== movingFlight.id &&
        candidate.phase === "resting" &&
        candidate.gateAssignment &&
        (!includedFlightIds || includedFlightIds.has(candidate.id)),
    );
    if (!parkedFlights.length) return new Set();
    const cacheKey = [
      movingFlight.id,
      movingFlight.aircraft,
      ...parkedFlights.map((parkedFlight) =>
        [
          parkedFlight.id,
          parkedFlight.aircraft,
          parkedFlight.gateSlot,
          parkedFlight.gateAssignment?.standId ?? parkedFlight.standId ?? "",
        ].join(":"),
      ),
    ].join("|");
    const cached = this.parkedAircraftEdgeMaskCache.get(cacheKey);
    if (cached) return cached;
    const nodePositions = surfaceNodePositions(this.config.surfaceGraph);
    const movingRadius = parkedAircraftBodyRadius(
      this.config.scope,
      movingFlight.aircraft,
    );
    const blockers = parkedFlights.map((parkedFlight) => {
      const envelope = aircraftCollisionEnvelope(this.config, parkedFlight);
      return {
        center: [envelope.x, envelope.y] as [number, number],
        requiredDistance: movingRadius + envelope.bodyRadius + PHYSICAL_GAP,
      };
    });
    const blocked = new Set<string>();
    for (const edge of this.config.surfaceGraph.edges) {
      const from = nodePositions.get(edge.from);
      const to = nodePositions.get(edge.to);
      if (!from || !to) continue;
      const minimumX = Math.min(from[0], to[0]);
      const maximumX = Math.max(from[0], to[0]);
      const minimumY = Math.min(from[1], to[1]);
      const maximumY = Math.max(from[1], to[1]);
      if (
        blockers.some(
          (blocker) =>
            blocker.center[0] >= minimumX - blocker.requiredDistance &&
            blocker.center[0] <= maximumX + blocker.requiredDistance &&
            blocker.center[1] >= minimumY - blocker.requiredDistance &&
            blocker.center[1] <= maximumY + blocker.requiredDistance &&
            pointToSegmentDistance(blocker.center, from, to) <
              blocker.requiredDistance,
        )
      )
        blocked.add(edge.id);
    }
    if (this.parkedAircraftEdgeMaskCache.size >= 64)
      this.parkedAircraftEdgeMaskCache.clear();
    this.parkedAircraftEdgeMaskCache.set(cacheKey, blocked);
    return blocked;
  }

  private surfaceRoutePlanning(
    excludedFlightId?: number,
    additionallyBlocked: ReadonlySet<string> = new Set(),
  ): SurfaceRoutePlanning {
    const congestion = surfaceCongestionPlanning(
      this.config.surfaceGraph,
      this.surfaceTrafficMovements(),
      excludedFlightId,
    );
    return {
      edgePenaltyById: congestion.edgePenaltyById,
      blockedEdgeIds: new Set([
        ...surfaceDisruptionBlockedEdgeIds(this.state.surfaceDisruptions),
        ...additionallyBlocked,
      ]),
    };
  }

  private nextUnclearedCrossing(
    flight: Flight,
  ): SurfaceRouteCrossingWindow | null {
    const plan = this.surfaceCrossingPlan(flight);
    const crossing = plan.windows.find(
      (candidate) =>
        !this.crossingIsCleared(flight, candidate) &&
        candidate.exitProgress + 1e-6 >= flight.progress,
    );
    if (!crossing) return null;
    // Imported hold-short control points mark the pavement line. Flight pose
    // is measured at the aircraft center, so stopping that center on the line
    // lets the nose of a long transport project into the protected crossing.
    // Move only the stop target—not the crossing window—back by the modeled
    // half-length plus a modest nose buffer.
    const routeDistanceM = plan.routeDistanceM;
    const centerOffsetM =
      aircraftProfile(flight.aircraft).lengthM / 2 +
      RUNWAY_HOLD_SHORT_NOSE_BUFFER_M;
    const progressOffset = centerOffsetM / routeDistanceM;
    const currentDistanceWorld = flight.progress * plan.routeDistanceWorld;
    return {
      ...crossing,
      holdProgress: Math.max(0, crossing.holdProgress - progressOffset),
      distanceToHold:
        crossing.holdProgress * plan.routeDistanceWorld -
        currentDistanceWorld -
        centerOffsetM / WORLD_METERS_PER_UNIT,
    };
  }

  private crossingGroups(flight: Flight): SurfaceRouteCrossingWindow[][] {
    return this.surfaceCrossingPlan(flight).groups;
  }

  private crossingClearanceGroup(
    flight: Flight,
    crossing: SurfaceRouteCrossingWindow,
  ): SurfaceRouteCrossingWindow[] {
    return (
      this.crossingGroups(flight).find((group) =>
        group.some((candidate) => candidate.id === crossing.id),
      ) ?? [crossing]
    );
  }

  private surfaceCrossingPlan(flight: Flight): SurfaceCrossingPlanCache {
    const cached = this.surfaceCrossingPlanCache.get(flight);
    if (
      cached &&
      cached.routeNodes === flight.surfaceRoute &&
      cached.routeEdges === flight.surfaceRouteEdges &&
      cached.runway === flight.runway &&
      cached.aircraft === flight.aircraft
    )
      return cached;
    const sample = sampleSurfaceRouteWithEdges(
      this.config.surfaceGraph,
      flight.surfaceRoute,
      flight.surfaceRouteEdges,
      0,
    );
    const routeDistanceWorld = Math.max(
      1 / WORLD_METERS_PER_UNIT,
      sample?.totalDistance ??
        flight.motion.totalDistanceM / WORLD_METERS_PER_UNIT,
    );
    const routeDistanceM = routeDistanceWorld * WORLD_METERS_PER_UNIT;
    const windows = surfaceRouteCrossingWindows(
      this.config.surfaceGraph,
      flight.surfaceRoute,
      0,
      flight.runway,
      flight.surfaceRouteEdges,
    );
    const profile = aircraftProfile(flight.aircraft);
    const plan = {
      routeNodes: flight.surfaceRoute,
      routeEdges: flight.surfaceRouteEdges,
      runway: flight.runway,
      aircraft: flight.aircraft,
      routeDistanceWorld,
      routeDistanceM,
      windows,
      groups: surfaceRouteCrossingGroups(
        windows,
        routeDistanceM,
        profile.lengthM +
          RUNWAY_HOLD_SHORT_NOSE_BUFFER_M +
          RUNWAY_CROSSING_TAIL_BUFFER_M,
      ),
    };
    this.surfaceCrossingPlanCache.set(flight, plan);
    return plan;
  }

  private crossingIsCleared(
    flight: Flight,
    crossing: SurfaceRouteCrossingWindow,
  ): boolean {
    return flight.crossingClearanceIds !== undefined
      ? flight.crossingClearanceIds.includes(crossing.id)
      : Boolean(flight.crossingClearances?.includes(crossing.runwayId));
  }

  private occupiesClearedRunwayCrossing(flight: Flight): boolean {
    if (!(
      flight.crossingClearanceIds?.length || flight.crossingClearances?.length
    ))
      return false;
    return this.crossingGroups(flight).some((group) => {
      const first = group[0];
      const last = group.at(-1)!;
      return (
        group.some((crossing) => this.crossingIsCleared(flight, crossing)) &&
        flight.progress + 1e-6 >= first.entryProgress &&
        flight.progress <= last.exitProgress + 0.002
      );
    });
  }

  private activeClearedCrossingRunways(flight: Flight): number[] {
    return this.surfaceCrossingPlan(flight)
      .windows.filter(
        (crossing) =>
          this.crossingIsCleared(flight, crossing) &&
          flight.progress <= crossing.exitProgress + 0.002,
      )
      .map((crossing) => crossing.runwayId);
  }

  private grantPushbackClearance(flight: Flight, automatic: boolean): void {
    flight.pushbackCleared = true;
    this.decisionReason = `${automatic ? "automatic " : ""}${flight.pushbackDirection} pushback clearance accepted`;
    this.events.push({
      type: "pushback-clearance",
      flight,
      taxiway: flight.taxiway,
      detail: `${automatic ? "automatic" : "ground"} · push ${flight.pushbackDirection}`,
    });
  }

  /** Auto/Watch do not release an aircraft into the opposite live taxiway wave. */
  private surfaceFlowPushbackAdmissionReason(flight: Flight): string | null {
    const preview = this.pushbackPreviewCache.get(flight)?.preview;
    if (!preview) return null;
    const claims = surfaceRouteReservationClaims(
      this.config.surfaceGraph,
      preview.surfaceRoute,
      preview.surfaceRouteEdges,
      preview.progress,
      "taxi-out",
      12,
      SURFACE_RESERVATION_LOOKAHEAD_M / WORLD_METERS_PER_UNIT,
    );
    return this.surfaceFlowPlanner.admissionReason(claims, this.state.elapsed);
  }

  /**
   * A strategic one-way window must not keep a parked aircraft at its stand
   * when that same body physically blocks an inbound or outbound surface
   * movement. The pushback preview and swept-envelope test have already proved
   * the immediate movement clear; admitting the departure lets the ordinary
   * surface arbiter expose and resolve any downstream dependency.
   */
  private pushbackReleasesBlockedSurfaceFlight(flight: Flight): boolean {
    return this.state.flights.some(
      (candidate) =>
        (candidate.phase === "taxi-in" || candidate.phase === "taxi-out") &&
        (this.stationarySeconds.get(candidate.id) ?? 0) >= 90 &&
        candidate.safetyHoldReason ===
          `projected path conflict with flight ${flight.id}`,
    );
  }

  /** Protect the complete tug-release corridor before the aircraft moves. */
  private pushbackSurfaceBlocker(
    flight: Flight,
  ): Flight | "no-route" | undefined {
    const runway = this.selectDepartureRunway(flight);
    if (runway === null) return undefined;
    const operatingEnd = this.preferredOperatingEnd(runway);
    const signature = this.surfacePlanCacheSignature(
      flight,
      "taxi-out",
      runway,
      operatingEnd,
    );
    const cached = this.pushbackPreviewCache.get(flight);
    let preview = cached?.signature === signature ? cached.preview : undefined;
    let previewSweep =
      cached?.signature === signature ? cached.sweep : undefined;
    if (!preview) {
      preview = {
        ...flight,
        phase: "taxi-out",
        progress: 0,
        phaseElapsed: 0,
        runway,
        departureRunway: runway,
        operatingEnd,
        deicing: { ...flight.deicing },
        kinematics: { ...flight.kinematics },
        motion: { ...flight.motion },
        requiredCrossings: [...(flight.requiredCrossings ?? [])],
        crossingClearances: [...(flight.crossingClearances ?? [])],
        crossingClearanceIds: [...(flight.crossingClearanceIds ?? [])],
        surfaceRoute: flight.surfaceRoute
          ? [...flight.surfaceRoute]
          : undefined,
        surfaceRouteEdges: flight.surfaceRouteEdges
          ? [...flight.surfaceRouteEdges]
          : undefined,
        surfaceCongestedEdgeIds: flight.surfaceCongestedEdgeIds
          ? [...flight.surfaceCongestedEdgeIds]
          : undefined,
        surfaceReroute: flight.surfaceReroute
          ? {
              ...flight.surfaceReroute,
              disruptionIds: [...flight.surfaceReroute.disruptionIds],
              previousEdgeIds: [...flight.surfaceReroute.previousEdgeIds],
              routeEdgeIds: [...flight.surfaceReroute.routeEdgeIds],
            }
          : undefined,
      };
      this.assignSurfaceRoute(preview, "taxi-out");
      if (preview.surfaceRouteEdges?.length) {
        syncFlightMotion(this.config, preview);
        const corridorEnd = Math.min(
          0.12,
          Math.max(0.055, preview.pushbackReleaseProgress + 0.035),
        );
        previewSweep = buildAircraftCollisionSweep(
          Array.from({ length: 21 }, (_, sampleIndex) =>
            aircraftCollisionEnvelope(
              this.config,
              preview!,
              (corridorEnd * sampleIndex) / 20,
            ),
          ),
        );
      }
      this.pushbackPreviewCache.set(flight, {
        signature,
        preview,
        sweep: previewSweep,
      });
    }
    if (!preview.surfaceRouteEdges?.length) return "no-route";
    const opposingRouteBlocker = this.opposingPushbackRouteBlocker(preview);
    if (opposingRouteBlocker) return opposingRouteBlocker;
    const corridorEnd = Math.min(
      0.12,
      Math.max(0.055, preview.pushbackReleaseProgress + 0.035),
    );
    const previewWake = aircraftProfile(preview.aircraft).wakeClass;
    if (!previewSweep) return "no-route";
    const gateZoneId = flight.gateAssignment?.zoneId;
    const candidates = this.state.flights
      .filter(
        (candidate) =>
          candidate.id !== flight.id &&
          (candidate.phase === "taxi-in" || candidate.phase === "taxi-out") &&
          !(
            candidate.safetyHold &&
            candidate.safetyHoldReason?.includes(`flight ${flight.id}`)
          ),
      )
      .sort(
        (first, second) =>
          (first.phase === "taxi-in" ? 0 : 1) -
            (second.phase === "taxi-in" ? 0 : 1) ||
          second.progress - first.progress ||
          first.id - second.id,
      );
    for (const candidate of candidates) {
      const candidateWake = aircraftProfile(candidate.aircraft).wakeClass;
      const sameRampMovement =
        gateZoneId !== undefined &&
        candidate.gateAssignment?.zoneId === gateZoneId;
      const corridorSeconds = preview.duration * corridorEnd + 24;
      const candidateHorizon = Math.min(
        1,
        candidate.progress + corridorSeconds / Math.max(1, candidate.duration),
      );
      const candidateIsHeld =
        candidate.controlHold ||
        candidate.automaticHold ||
        candidate.safetyHold ||
        candidate.kinematics.groundSpeedKts < 0.5;
      const candidateSweep = buildAircraftCollisionSweep(
        sameRampMovement && !candidateIsHeld
          ? Array.from({ length: 41 }, (_, sampleIndex) =>
              aircraftCollisionEnvelope(
                this.config,
                candidate,
                candidate.progress +
                  ((candidateHorizon - candidate.progress) * sampleIndex) / 40,
              ),
            )
          : [aircraftCollisionEnvelope(this.config, candidate)],
      );
      if (!aircraftCollisionSweepsOverlap(previewSweep, candidateSweep))
        continue;
      const runwayConflict = this.runwaysConflict(
        preview.runway,
        candidate.runway,
      );
      for (const previewProxy of previewSweep.envelopes) {
        for (const candidateProxy of candidateSweep.envelopes) {
          if (!aircraftEnvelopeBoxesOverlap(previewProxy, candidateProxy))
            continue;
          const conflict = detectFlightConflict(
            previewProxy,
            candidateProxy,
            previewWake,
            candidateWake,
            runwayConflict,
            false,
          );
          if (conflict?.type === "surface") return candidate;
        }
      }
    }
    return undefined;
  }

  /**
   * Do not release a stand when the first part of its taxi route would meet an
   * active aircraft head-on. The per-tick ledger safely holds both movers once
   * they exist, but pushback is the last point where the unentered aircraft can
   * wait without occupying the shared lane. Matching the ledger's twelve-edge
   * horizon keeps this local to the ramp/nearby junction instead of reserving a
   * complete airport route.
   */
  private opposingPushbackRouteBlocker(
    preview: Flight,
    lookaheadEdges = 12,
  ): Flight | undefined {
    const previewNodes = preview.surfaceRoute;
    const previewEdges = preview.surfaceRouteEdges;
    if (!previewNodes?.length || !previewEdges?.length) return undefined;
    const previewDirections = new Map<string, Set<string>>();
    for (
      let edgeIndex = 0;
      edgeIndex < Math.min(previewEdges.length, lookaheadEdges);
      edgeIndex += 1
    ) {
      const edgeId = previewEdges[edgeIndex];
      const from = previewNodes[edgeIndex];
      const to = previewNodes[edgeIndex + 1];
      if (!edgeId || !from || !to) continue;
      const directions = previewDirections.get(edgeId) ?? new Set<string>();
      directions.add(`${from}>${to}`);
      previewDirections.set(edgeId, directions);
    }
    if (!previewDirections.size) return undefined;

    return this.state.flights
      .filter(
        (candidate) =>
          candidate.id !== preview.id &&
          (candidate.phase === "taxi-in" || candidate.phase === "taxi-out") &&
          candidate.emergency !== "disabled" &&
          !(
            candidate.safetyHold &&
            candidate.safetyHoldReason?.includes(`flight ${preview.id}`)
          ),
      )
      .sort(
        (first, second) =>
          (first.phase === "taxi-in" ? 0 : 1) -
            (second.phase === "taxi-in" ? 0 : 1) ||
          second.progress - first.progress ||
          first.id - second.id,
      )
      .find((candidate) => {
        const candidateNodes = candidate.surfaceRoute;
        const candidateEdges = candidate.surfaceRouteEdges;
        const sample = sampleSurfaceRouteWithEdges(
          this.config.surfaceGraph,
          candidateNodes,
          candidateEdges,
          candidate.progress,
        );
        if (
          !sample ||
          !candidateNodes?.length ||
          !candidateEdges?.length ||
          sample.edgeIndex < 0
        )
          return false;
        const lastEdgeIndex = Math.min(
          candidateEdges.length,
          sample.edgeIndex + lookaheadEdges,
        );
        for (
          let edgeIndex = sample.edgeIndex;
          edgeIndex < lastEdgeIndex;
          edgeIndex += 1
        ) {
          const edgeId = candidateEdges[edgeIndex];
          const from = candidateNodes[edgeIndex];
          const to = candidateNodes[edgeIndex + 1];
          if (!edgeId || !from || !to) continue;
          if (previewDirections.get(edgeId)?.has(`${to}>${from}`)) return true;
        }
        return false;
      });
  }

  /** A cleared push owns its geometric corridor even when OSM alleys differ. */
  private activePushbackCorridorBlocker(flight: Flight): Flight | undefined {
    if (flight.phase !== "taxi-in") return undefined;
    const flightWake = aircraftProfile(flight.aircraft).wakeClass;
    const inboundHorizon = this.progressAfterTravelDistance(
      flight,
      PUSHBACK_INBOUND_LOOKAHEAD_M,
    );
    const inboundProgressBucket = Math.floor(
      Math.max(0, Math.min(1, flight.progress)) *
        PUSHBACK_SWEEP_PROGRESS_BUCKETS,
    );
    const cachedInbound = activePushbackInboundSweepCache.get(flight);
    let inboundSweep =
      cachedInbound?.progressBucket === inboundProgressBucket &&
      cachedInbound.startProgress <= flight.progress + 1e-9 &&
      cachedInbound.endProgress + 1e-9 >= inboundHorizon &&
      cachedInbound.routeEdges === flight.surfaceRouteEdges
        ? cachedInbound.sweep
        : undefined;
    if (!inboundSweep) {
      const cachedHorizon = this.progressAfterTravelDistance(
        flight,
        PUSHBACK_INBOUND_LOOKAHEAD_M + PUSHBACK_INBOUND_CACHE_BUFFER_M,
      );
      inboundSweep = buildAircraftCollisionSweep(
        Array.from({ length: 41 }, (_, sampleIndex) =>
          aircraftCollisionEnvelope(
            this.config,
            flight,
            flight.progress +
              ((cachedHorizon - flight.progress) * sampleIndex) / 40,
          ),
        ),
      );
      activePushbackInboundSweepCache.set(flight, {
        progressBucket: inboundProgressBucket,
        startProgress: flight.progress,
        endProgress: cachedHorizon,
        routeEdges: flight.surfaceRouteEdges,
        sweep: inboundSweep,
      });
    }
    for (const departure of this.state.flights
      .filter(
        (candidate) =>
          candidate.id !== flight.id &&
          candidate.phase === "taxi-out" &&
          candidate.gateAssignment?.zoneId === flight.gateAssignment?.zoneId,
      )
      .sort((first, second) => first.id - second.id)) {
      const corridorEnd = Math.min(
        0.12,
        Math.max(0.055, departure.pushbackReleaseProgress + 0.035),
      );
      if (departure.progress >= corridorEnd - 1e-6) continue;
      // A departure stopped at its initial stand position has not entered the
      // pushback corridor. If the surface ledger is already holding it, making
      // every inbound reserve the departure's entire future sweep creates a
      // cycle: the departure waits for the inbound while the inbound waits for
      // the departure. Release only that unentered lookahead; actual stand
      // occupancy, graph claims, and proposed-motion collision arbitration
      // remain authoritative.
      if (
        departure.progress <= 1e-6 &&
        (departure.controlHold ||
          departure.automaticHold ||
          departure.safetyHold)
      )
        continue;
      const departureWake = aircraftProfile(departure.aircraft).wakeClass;
      const departureProgressBucket = Math.floor(
        Math.max(0, Math.min(1, departure.progress)) *
          PUSHBACK_SWEEP_PROGRESS_BUCKETS,
      );
      const cachedDeparture = activePushbackDepartureSweepCache.get(departure);
      let departureSweep =
        cachedDeparture?.progressBucket === departureProgressBucket &&
        cachedDeparture.startProgress <= departure.progress + 1e-9 &&
        cachedDeparture.endProgress === corridorEnd &&
        cachedDeparture.routeEdges === departure.surfaceRouteEdges
          ? cachedDeparture.sweep
          : undefined;
      if (!departureSweep) {
        departureSweep = buildAircraftCollisionSweep(
          Array.from({ length: 21 }, (_, sampleIndex) =>
            aircraftCollisionEnvelope(
              this.config,
              departure,
              departure.progress +
                ((corridorEnd - departure.progress) * sampleIndex) / 20,
            ),
          ),
        );
        activePushbackDepartureSweepCache.set(departure, {
          progressBucket: departureProgressBucket,
          startProgress: departure.progress,
          endProgress: corridorEnd,
          routeEdges: departure.surfaceRouteEdges,
          sweep: departureSweep,
        });
      }
      if (!aircraftCollisionSweepsOverlap(departureSweep, inboundSweep))
        continue;
      const runwayConflict = this.runwaysConflict(
        departure.runway,
        flight.runway,
      );
      for (const departureProxy of departureSweep.envelopes) {
        for (const inboundProxy of inboundSweep.envelopes) {
          if (!aircraftEnvelopeBoxesOverlap(departureProxy, inboundProxy))
            continue;
          const conflict = detectFlightConflict(
            departureProxy,
            inboundProxy,
            departureWake,
            flightWake,
            runwayConflict,
            false,
          );
          if (conflict?.type === "surface") return departure;
        }
      }
    }
    return undefined;
  }

  private updatePushbackState(flight: Flight): void {
    if (flight.phase !== "taxi-out") return;
    if (flight.surfaceYield?.direction === "reverse") {
      flight.tugAttached = true;
      if (flight.engineState === "off") flight.engineState = "starting";
      return;
    }
    if (flight.pushbackReleaseProgress <= 0) {
      flight.pushbackProgress = 1;
      flight.tugAttached = false;
      flight.engineState = "running";
      return;
    }
    const release = Math.max(0.001, flight.pushbackReleaseProgress);
    const pushbackProgress = Math.max(
      0,
      Math.min(1, flight.progress / release),
    );
    flight.pushbackProgress = pushbackProgress;
    if (pushbackProgress < 1) {
      flight.tugAttached = true;
      if (flight.engineState === "off") flight.engineState = "starting";
      if (pushbackProgress >= 0.62) flight.engineState = "running";
      return;
    }
    if (flight.tugAttached) {
      flight.tugAttached = false;
      this.events.push({
        type: "tug-release",
        flight,
        taxiway: flight.taxiway,
        detail: "tug clear · taxi power available",
      });
    }
    this.releaseGate(flight);
    flight.engineState = "running";
  }

  private grantCrossingClearance(
    flight: Flight,
    crossing: SurfaceRouteCrossingWindow,
  ): void {
    const runway = crossing.runwayId;
    flight.crossingClearanceIds ??= [];
    flight.crossingClearances ??= [];
    if (flight.crossingClearanceIds.includes(crossing.id)) return;
    flight.crossingClearanceIds.push(crossing.id);
    if (!flight.crossingClearances.includes(runway))
      flight.crossingClearances.push(runway);
    flight.crossingHoldRunway = undefined;
    flight.crossingHoldPointId = undefined;
    this.events.push({
      type: "runway-crossing",
      flight,
      runway,
      taxiway: flight.taxiway,
    });
  }

  private intersectingRunways(runwayId: number): number[] {
    return intersectingRunways(this.config, runwayId);
  }

  private runwaysConflict(firstId: number, secondId: number): boolean {
    return runwaysConflict(this.config, firstId, secondId);
  }

  private currentRunwayCondition(runwayId: number) {
    return runwayConditionReport(this.state.weather, runwayId);
  }

  private runwaySupportsCurrentCondition(
    runway: AirportConfig["runways"][number],
    aircraft: AircraftModel,
    operation: "landing" | "takeoff",
  ): boolean {
    return runwaySupportsAircraft(
      runway,
      aircraft,
      operation,
      this.currentRunwayCondition(runway.id),
    );
  }

  private assessTakeoffPerformance(flight: Flight) {
    const runway = this.config.runways[flight.runway] ?? this.config.runways[0];
    return assessRunwayPerformance(
      runway,
      flight.aircraft,
      "takeoff",
      this.currentRunwayCondition(runway.id),
      this.state.elapsed,
    );
  }

  private refreshRunwayConditionReports(force = false): void {
    if (
      !force &&
      this.state.elapsed - this.state.weather.reportsUpdatedAtSeconds < 30
    )
      return;
    this.state.weather.runwayConditionReports = buildRunwayConditionReports(
      this.config.runways,
      this.state.weather,
      this.state.elapsed,
      this.config.seed,
    );
    this.state.weather.reportsUpdatedAtSeconds = this.state.elapsed;
  }

  private operationStateAt(
    state: Pick<AirportState, "elapsed" | "operationTimeOffsetMinutes"> = this
      .state,
    elapsedSeconds = state.elapsed,
  ) {
    const profile = this.config.operationProfile;
    return airportOperationStateAt(
      profile,
      elapsedSeconds +
        state.operationTimeOffsetMinutes /
          Math.max(0.001, profile.localMinutesPerSimulationSecond),
    );
  }

  private updateEnvironment(deltaSeconds: number): void {
    const operation = this.operationStateAt();
    updateEnvironmentState(
      this.state.environment,
      this.state.weather,
      operation.localMinute,
      operation.localTime,
      deltaSeconds,
    );
    this.state.nightMode = this.state.environment.daylight < 0.42;
  }

  private updateWeather(): void {
    const previousCondition = this.state.weather.condition;
    const previousSurfaceCondition = this.state.weather.surfaceCondition;
    const previousRunwayCodes = this.state.weather.runwayConditionReports
      .map((report) => `${report.runwayId}:${report.codes.join("/")}`)
      .join("|");
    const overridden = this.state.elapsed < this.weatherOverrideUntil;
    if (!this.state.weather.weatherEnabled) {
      this.state.weather.condition = "clear";
    } else if (!overridden) {
      const pattern: WeatherCondition[] = deicingFacilities(
        this.config.surfaceGraph,
      ).length
        ? // A winter bank must last long enough for an ORD departure to reach
          // the remote pad, queue, receive treatment, and use its holdover time.
          [
            "clear",
            "haze",
            "rain",
            "clear",
            "fog",
            "clear",
            "thunderstorm",
            "clear",
            "snow",
            "snow",
            "snow",
            "snow",
            "snow",
            "snow",
          ]
        : [
            "clear",
            "haze",
            "rain",
            "clear",
            "fog",
            "clear",
            "thunderstorm",
            "clear",
            "rain",
          ];
      this.state.weather.condition =
        pattern[
          Math.floor((this.state.elapsed + (this.config.seed % 60)) / 60) %
            pattern.length
        ];
    }
    applyWeatherCondition(
      this.state.weather,
      this.state.weather.condition,
      this.state.elapsed,
      this.config.seed,
    );
    if (!this.state.weather.windEnabled) {
      this.state.weather.windSpeed = 0;
      this.state.weather.gustSpeed = 0;
    } else {
      if (!overridden) {
        this.state.weather.windDirection = this.normalizeAngle(
          this.baseWindDirection + Math.sin(this.state.elapsed * 0.006) * 0.48,
        );
        this.state.weather.windSpeed = Math.max(
          2,
          this.baseWindSpeed +
            Math.sin(this.state.elapsed * 0.035 + this.config.seed) * 2.8,
        );
      }
      const profile = weatherConditionProfile(this.state.weather.condition);
      this.state.weather.gustSpeed =
        this.state.weather.windSpeed +
        profile.gustDeltaKts +
        Math.sin(this.state.elapsed * 0.11) *
          Math.min(2.5, profile.gustDeltaKts * 0.24);
    }
    this.refreshRunwayConditionReports(
      this.state.weather.condition !== previousCondition,
    );
    const runwayCodes = this.state.weather.runwayConditionReports
      .map((report) => `${report.runwayId}:${report.codes.join("/")}`)
      .join("|");
    if (this.state.weather.condition !== previousCondition)
      this.refreshDeicingPlansForWeather();
    if (
      this.state.weather.surfaceCondition !== previousSurfaceCondition ||
      runwayCodes !== previousRunwayCodes
    ) {
      for (const flight of this.state.flights) {
        if (
          flight.phase === "approach" &&
          !flight.goAround &&
          !flight.diversion
        )
          this.planRunwayExit(flight, "braking action changed");
      }
    }
    this.updateWeatherHazards();
    this.updateActiveRunwayConfiguration();
  }

  private updateWeatherHazards(): void {
    const weather = this.state.weather;
    if (weather.activeHazard) {
      weather.activeHazard.status =
        this.state.elapsed < weather.activeHazard.activeUntilSeconds
          ? "active"
          : this.state.elapsed < weather.activeHazard.advisoryUntilSeconds
            ? "advisory"
            : "expired";
      if (weather.activeHazard.status === "expired")
        this.expireActiveWeatherHazard("advisory window complete");
    }
    const eligible =
      weather.hazardsEnabled &&
      weather.weatherEnabled &&
      weather.windEnabled &&
      weather.condition === "thunderstorm";
    if (!eligible) {
      if (weather.activeHazard)
        this.expireActiveWeatherHazard("convective conditions cleared");
      return;
    }
    if (
      !weather.activeHazard &&
      this.state.elapsed + 1e-6 >= weather.nextHazardAtSeconds
    ) {
      weather.hazardSequence += 1;
      const activeRunways = this.config.runways
        .filter((runway) => this.runwayRole(runway.id) !== "inactive")
        .map((runway) => runway.id);
      weather.activeHazard = createTerminalWeatherHazard(
        this.config.seed,
        weather.hazardSequence,
        this.state.elapsed,
        activeRunways,
      );
      weather.nextHazardAtSeconds =
        this.state.elapsed +
        nextWeatherHazardDelaySeconds(this.config.seed, weather.hazardSequence);
    }
    const hazard = weather.activeHazard;
    if (!hazard || hazard.status !== "active") return;
    for (const flight of this.state.flights) {
      if (
        flight.runway !== hazard.runwayId ||
        hazard.affectedFlightIds.includes(flight.id)
      )
        continue;
      if (
        hazard.operation === "arrival" &&
        (flight.phase === "approach" || flight.phase === "landing") &&
        !flight.diversion &&
        !flight.goAround &&
        (flight.progress >= 0.55 || flight.kinematics.altitudeFt <= 1_200)
      ) {
        hazard.affectedFlightIds.push(flight.id);
        this.goAround(
          flight,
          `${hazard.kind.replace("-", " ")} escape · ${hazard.windChangeKts} kt loss at ${hazard.locationNm} NM`,
          hazard,
        );
      }
      if (
        hazard.operation === "departure" &&
        flight.phase === "takeoff" &&
        !flight.motion.onGround &&
        flight.progress < 0.96 &&
        !flight.weatherEscape
      ) {
        hazard.affectedFlightIds.push(flight.id);
        this.startDepartureWeatherEscape(flight, hazard);
      }
    }
  }

  private expireActiveWeatherHazard(_reason: string): void {
    const hazard = this.state.weather.activeHazard;
    if (!hazard) return;
    hazard.status = "expired";
    this.state.weather.hazardHistory.push({
      ...hazard,
      affectedFlightIds: [...hazard.affectedFlightIds],
    });
    if (this.state.weather.hazardHistory.length > 48) {
      this.state.weather.hazardHistory.splice(
        0,
        this.state.weather.hazardHistory.length - 48,
      );
    }
    this.state.weather.activeHazard = null;
    this.state.weather.nextHazardAtSeconds = Math.max(
      this.state.weather.nextHazardAtSeconds,
      this.state.elapsed +
        nextWeatherHazardDelaySeconds(
          this.config.seed,
          this.state.weather.hazardSequence + 1,
        ),
    );
  }

  private startDepartureWeatherEscape(
    flight: Flight,
    hazard: TerminalWeatherHazard,
  ): void {
    flight.navigation.vector = undefined;
    flight.weatherEscape = {
      hazardId: hazard.id,
      kind: hazard.kind,
      operation: "departure",
      windChangeKts: hazard.windChangeKts,
      startedAtSeconds: this.state.elapsed,
      startProgress: flight.progress,
      clearProgress: Math.min(0.96, Math.max(0.72, flight.progress + 0.18)),
      status: "active",
    };
    this.events.push({
      type: "weather-escape",
      flight,
      runway: flight.runway,
      detail: `${hazard.kind.replace("-", " ")} escape · full-power straight-ahead climb · ${hazard.windChangeKts} kt loss`,
    });
  }

  private headwindComponent(runwayId: number): number {
    if (!this.state.weather.windEnabled) return 0;
    const runway = this.config.runways[runwayId];
    const operatingHeading =
      runway.heading +
      (this.preferredOperatingEnd(runwayId) === 1 ? Math.PI : 0);
    return (
      this.state.weather.windSpeed *
      Math.cos(this.state.weather.windDirection - operatingHeading)
    );
  }

  private preferredOperatingEnd(runwayId: number): -1 | 1 {
    return preferredOperatingEnd(this.config, this.state, runwayId);
  }

  private runwayRole(runwayId: number): RunwayOperationalRole {
    return activeRunwayRole(this.config, this.state, runwayId);
  }

  private updateActiveRunwayConfiguration(): void {
    let target: AirportRunwayConfiguration | null = null;
    let reason = "automatic wind and procedure selection";
    if (this.runwayConfigurationOverrideId) {
      const override = this.config.runwayConfigurations.find(
        (configuration) =>
          configuration.id === this.runwayConfigurationOverrideId,
      );
      const restriction = override
        ? this.configurationRestrictionReason(override)
        : "configuration no longer exists";
      if (override && !restriction) {
        target = override;
        reason = "supervisor selection";
      } else {
        this.runwayConfigurationOverrideId = null;
        this.state.runwayConfigurationMode = "automatic";
      }
    }
    target ??= this.selectAutomaticRunwayConfiguration();
    this.requestRunwayConfiguration(target, reason);
  }

  private selectAutomaticRunwayConfiguration(): AirportRunwayConfiguration {
    return selectAutomaticRunwayConfiguration(this.config, this.state);
  }

  private configurationRestrictionReason(
    configuration: AirportRunwayConfiguration,
  ): string | null {
    return runwayConfigurationRestrictionReason(this.state, configuration);
  }

  private requestRunwayConfiguration(
    configuration: AirportRunwayConfiguration,
    reason: string,
  ): void {
    const changedRunwayIds = changedRunwayConfigurationIds(
      this.config,
      this.state,
      configuration,
    );
    if (
      configuration.id === this.state.runwayConfigurationId &&
      changedRunwayIds.length === 0
    ) {
      this.state.runwayConfigurationTransition = null;
      return;
    }
    const changed = new Set(changedRunwayIds);
    const blockingFlightIds = this.state.flights
      .filter(
        (flight) => flight.phase !== "resting" && changed.has(flight.runway),
      )
      .map((flight) => flight.id)
      .sort((first, second) => first - second);
    if (blockingFlightIds.length) {
      const previous = this.state.runwayConfigurationTransition;
      this.state.runwayConfigurationTransition = {
        targetId: configuration.id,
        requestedAt:
          previous?.targetId === configuration.id
            ? previous.requestedAt
            : this.state.elapsed,
        reason,
        changedRunwayIds,
        blockingFlightIds,
      };
      return;
    }
    applyRunwayConfiguration(this.config, this.state, configuration);
  }

  private weatherDurationMultiplier(phase: FlightPhase): number {
    return modeledWeatherDurationMultiplier(
      this.state.weather.condition,
      phase,
    );
  }

  private normalizeAngle(angle: number): number {
    return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }

  private runwayBlocker(
    runway: number,
    excludingFlightId: number,
  ): Flight | null {
    return (
      this.state.flights.find((flight) => {
        if (flight.id === excludingFlightId) return false;
        if (
          this.activeClearedCrossingRunways(flight).some((crossingRunway) =>
            this.runwaysConflict(runway, crossingRunway),
          )
        )
          return true;
        if (
          flight.motion.protectedRunwayIds.some((occupiedRunway) =>
            this.runwaysConflict(runway, occupiedRunway),
          )
        )
          return true;
        if (!this.runwaysConflict(runway, flight.runway)) return false;
        return (
          flightHasRunwayCommitment(flight) ||
          (flight.phase === "approach" && flight.progress > 0.68)
        );
      }) ?? null
    );
  }

  /**
   * Give a surface aircraft a bounded runway-crossing slot after it has waited
   * at the hold line. Already-cleared runway operations retain priority, but
   * new arrivals, line-ups, and takeoffs are metered until the oldest crossing
   * queue can be served. This prevents continuous hub traffic from starving a
   * taxi route indefinitely.
   */
  private priorityRunwayCrossing(
    runway: number,
    excludingFlightId?: number,
  ): Flight | null {
    return (
      this.state.flights
        .filter(
          (flight) =>
            flight.id !== excludingFlightId &&
            (flight.phase === "taxi-in" || flight.phase === "taxi-out") &&
            (this.stationarySeconds.get(flight.id) ?? 0) >=
              RUNWAY_CROSSING_PRIORITY_WAIT_SECONDS,
        )
        .map((flight) => ({
          flight,
          crossing: this.nextUnclearedCrossing(flight),
        }))
        .filter(
          (
            candidate,
          ): candidate is {
            flight: Flight;
            crossing: SurfaceRouteCrossingWindow;
          } =>
            candidate.crossing !== null &&
            candidate.crossing.distanceToHold * WORLD_METERS_PER_UNIT <=
              RUNWAY_HOLD_POSITION_TOLERANCE_M &&
            this.runwaysConflict(runway, candidate.crossing.runwayId),
        )
        .sort(
          (first, second) =>
            (this.stationarySeconds.get(second.flight.id) ?? 0) -
              (this.stationarySeconds.get(first.flight.id) ?? 0) ||
            first.flight.id - second.flight.id,
        )[0]?.flight ?? null
    );
  }

  private rejectDecision(reason: string, flight?: Flight): false {
    this.decisionReason = reason;
    if (flight)
      this.events.push({
        type: "reject",
        flight,
        runway: flight.runway,
        taxiway: flight.taxiway,
        detail: reason,
      });
    return false;
  }

  private stationRunsAutomatically(
    station: OperationalControllerStation,
  ): boolean {
    return this.isAutomaticMode() || this.state.stationAutomation[station];
  }

  private isAutomaticMode(): boolean {
    return this.state.mode === "auto" || this.state.mode === "watch";
  }
}

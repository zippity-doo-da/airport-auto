import type { AirportConfig, AirportRunwayConfiguration, RunwayOperationalRole } from './airportConfig';
import type { AirportEvent, AirportState, ClearanceProposal, ConflictPrediction, ControlMode, ControllerStation, ControllerWorkloadSnapshot, EmergencyType, Flight, FlightHandoffState, FlightInstruction, FlightNavigationState, FlightOperationPlan, FlightPhase, FlightRouteClearanceState, FlightRunwayExitState, GroupInstructionIssueResult, GroupInstructionPreview, OperationalControllerStation, ServiceVehicleState, ShiftMetrics, SurfaceDisruptionKind, SurfaceDisruptionSource, SurfaceDisruptionState, TrafficScenario, WeatherCondition } from './types';
import { aircraftProfile, type AircraftModel } from './aircraftProfiles';
import { airlineProfile, type AirlineCode } from './airlineProfiles';
import { aircraftCollisionEnvelope, detectCommittedRunwaySweepConflict, detectFlightConflict, findFlightConflicts, findObstacleConflicts, findProposedConflict } from './collisionDetection';
import { findSurfaceRoute, sampleSurfaceRouteWithEdges, surfacePushbackPlan, surfaceRouteCrossingWindows, surfaceRouteForFlight, surfaceRouteRunwayCrossings, validateAirportSurfaceGraph, type SurfaceGraphValidation, type SurfaceRoute, type SurfaceRouteCrossingWindow, type SurfaceRoutePlanning } from './surfaceGraph';
import { validateAirportObstacleEnvelopes, type AirportObstacleValidation } from './airportObstacles';
import { departureTrajectoryTiming, landingTrajectoryTiming } from './flightTrajectory';
import { runwaySupportsAircraft, WORLD_METERS_PER_UNIT } from './runwayPerformance';
import { sampleAircraftSurfaceMotion } from './surfaceMotion';
import { progressAfterDistance, syncFlightMotion } from './flightMotion';
import { intersectingRunways, runwaysConflict } from './runwayConflict';
import { SurfaceReservationLedger, surfaceCongestionPlanning, surfaceRouteOperationalState, surfaceRouteReservationClaims, type SurfaceReservationClaim, type SurfaceTrafficMovement } from './surfaceOperations';
import { GATE_TURN_BUFFER_SECONDS, gateReservationsOverlap, planGateAssignment, standReservationsConflict, type GateReservation } from './gateAssignment';
import { advanceTurnaround, completeTurnaround, createTurnaroundPlan, releaseTurnaround, scheduleTurnaround, startTurnaround, turnaroundBlockingServices, turnaroundFuelPercent, type TurnaroundTransition } from './turnaroundOperations';
import { advanceServiceVehicleMotion, availableVehicleServices, createServiceVehiclePlans, findServiceVehicleConflicts, serviceVehicleOwnerId, serviceVehicleReservationClaims, serviceVehicleRouteViolations, serviceVehiclesBlockingPushback, setServiceVehicleStatus, syncServiceVehiclePose } from './serviceVehicleOperations';
import { applyDeicingRoutePlan, createDeicingState, deicingFacilities, deicingMovementLimit, deicingReleaseValid, markDeicingNotRequired, markStartupPretreated, planDeicingTaxiRoute, winterDeicingRequired } from './deicingOperations';
import { selectRunwayExit } from './runwayExitSelection';
import { resolveSurfaceDisruptionTarget, runwayClosedByDisruption, surfaceDisruptionBlockedEdgeIds, surfaceDisruptionsForRoute } from './surfaceDisruptions';
import { buildOperationQueueSnapshot, type OperationQueueSnapshot } from './operationQueues';
import { airportOperationStateAt, selectOperationTrafficClass, type AirportOperationProfile, type AirportOperationState, type OperationTrafficClass } from './airportOperationProfiles';
import { selectTrafficProgram } from './airportTrafficPrograms';
import { trafficDensityProfile, type TrafficDensity } from './trafficDensity';
import { createTrafficFlowState, enqueueArrivalDemand, expireTrafficFlow, markArrivalHolding, refreshTrafficFlow, registerDepartureDemand, releaseArrivalDemand, releaseDepartureDemand, removeDepartureDemand, scheduleNextArrivalDemand, setTrafficFlowDensity, trafficFlowSnapshot, type TrafficFlowSnapshot } from './trafficFlowManagement';
import { amendFlightPlan, cloneFlightPlan, createFlightPlan, setFlightPlanStatus } from './flightPlanning';
import { selectTerminalProcedure, type SelectedTerminalProcedure, type TerminalProcedureKind } from './airspaceProcedures';
import { buildSurfaceRouteViaNodes, selectDiversionExitFix } from './atcRouteCommands';
import { buildTerminalRouteClearancePreview, type TerminalRouteClearanceCandidate } from './terminalRouteClearance';
import { buildGroupInstructionPreview } from './groupedFlightInstructions';
import { createFlightFuelPlan, fuelBurnPercentPerSecond, replaceDepartureFuelPlan } from './flightFuelPlanning';
import {
  controllerStationIsAhead,
  controllerWorkloadSnapshots,
  createStationAutomation,
  isOperationalControllerStation,
  nextControllerStation,
  OPERATIONAL_CONTROLLER_STATIONS,
  requiredControllerStation,
  stationCanIssue,
  suggestedHandoffStation,
} from './controllerOperations';
import {
  assessAirborneSeparation,
  requiredRadarSeparationNm,
  runwayPairIndependent,
  runwayReleaseReason,
  separationRuleset,
  weatherCapacityMultiplier,
  type RunwayOperationRecord,
  type SeparationRulesetId,
} from './separationRules';

const PHASE_DURATION: Record<FlightPhase, number> = {
  approach: 38,
  landing: 34,
  'taxi-in': 18,
  resting: 10,
  'taxi-out': 20,
  takeoff: 48,
};

const HANDOFF_RESPONSE_SECONDS = 12;
const AUTOMATIC_HANDOFF_ACCEPT_SECONDS = 0.75;
const AUTOMATIC_HANDOFF_CONTACT_SECONDS = 0.65;
const AUTOMATIC_HANDOFF_RETRY_SECONDS = 4;

const SERVICE_VEHICLE_SURFACE_PRIORITY: Record<ServiceVehicleState['status'], number> = {
  clearing: 3,
  dispatching: 4,
  approaching: 5,
  returning: 6,
  servicing: 7,
  staged: 8,
  scheduled: 9,
  complete: 10,
};

function serviceVehicleSurfacePriority(vehicle: ServiceVehicleState): number {
  // Traffic already ahead keeps moving: inbound equipment on the stand
  // connector clears toward staging, while outbound equipment already on the
  // graph clears away from it. A follower waits at the preceding resource.
  if (vehicle.status === 'dispatching' && vehicle.currentEdge === undefined && vehicle.progress > 1e-6) return 0;
  if (vehicle.status === 'returning' && vehicle.currentEdge !== undefined) return 0;
  if (vehicle.currentEdge !== undefined) return 1;
  if (vehicle.status === 'returning' && vehicle.progress > 1e-6) return 1;
  // A returner waiting exactly at staging gets the next release so following
  // equipment cannot clear through its parked position.
  if (vehicle.status === 'returning' && vehicle.progress <= 1e-6) return 2;
  return SERVICE_VEHICLE_SURFACE_PRIORITY[vehicle.status];
}

function serviceVehicleStandLaneOrder(
  config: AirportConfig,
  first: ServiceVehicleState,
  second: ServiceVehicleState,
): number {
  if (
    first.standId !== second.standId
    || first.standSide !== second.standSide
    || first.status !== 'approaching'
    || second.status !== 'approaching'
  ) return 0;
  const stand = config.surfaceGraph.stands.find((candidate) => candidate.id === first.standId);
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
const CROSSING_CLEARANCE_RANGE_M = 190;

const NEXT_PHASE: Partial<Record<FlightPhase, FlightPhase>> = {
  approach: 'landing',
  landing: 'taxi-in',
  'taxi-in': 'resting',
  resting: 'taxi-out',
  'taxi-out': 'takeoff',
};

export class AirportSimulation {
  readonly state: AirportState = {
    elapsed: 0,
    flights: [],
    serviceVehicles: [],
    surfaceDisruptions: [],
    arrivals: 0,
    departures: 0,
    breeze: 0,
    gameOver: false,
    paused: false,
    mode: 'auto',
    nightMode: false,
    station: 'supervisor',
    stationAutomation: createStationAutomation(),
    weather: { weatherEnabled: false, windEnabled: false, condition: 'clear', windDirection: Math.PI, windSpeed: 0, gustSpeed: 0, visibility: 10, ceilingFt: 12_000, temperatureC: 18, surfaceCondition: 'dry' },
    scenario: 'normal',
    trafficFlow: createTrafficFlowState(),
    separationRuleset: 'forgiving',
    runwayConfigurationId: '',
    runwayConfigurationMode: 'automatic',
    runwayConfigurationTransition: null,
    activeRunwayEnds: {},
    activeRunwayRoles: {},
    closedRunway: null,
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
  private readonly metrics: ShiftMetrics = {
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
  };

  private readonly stationarySeconds = new Map<number, number>();
  private decisionReason = 'accepted';
  private lastArrivalAdmissionReason = 'arrival meter awaiting a release opportunity';

  constructor(private readonly config: AirportConfig, density: TrafficDensity = 'realistic') {
    this.state.trafficFlow = createTrafficFlowState(density);
    this.spawnIn = Math.min(3, this.arrivalSpacing() * 0.55);
    this.state.trafficFlow.nextArrivalDemandSeconds = this.spawnIn;
    const reference = config.runways.find((runway) => runway.role !== 'inactive') ?? config.runways[0];
    this.baseWindDirection = this.normalizeAngle(reference.heading + (reference.landingEnd === 1 ? Math.PI : 0) + Math.sin(config.seed) * 0.32);
    this.baseWindSpeed = 8 + config.seed % 7;
    this.surfaceGraphValidation = validateAirportSurfaceGraph(config);
    this.obstacleEnvelopeValidation = validateAirportObstacleEnvelopes(config);
    const initialConfiguration = config.runwayConfigurations.find(
      (configuration) => configuration.id === config.defaultRunwayConfigurationId,
    ) ?? config.runwayConfigurations[0];
    this.applyRunwayConfiguration(initialConfiguration);
    this.updateWeather();
    this.seedInitialTraffic();
  }

  setPace(speed: number): void {
    this.speed = speed;
  }

  setPaused(paused: boolean): void {
    this.state.paused = paused;
  }

  setMode(mode: ControlMode): void {
    this.state.mode = mode;
    if (this.isAutomaticMode()) {
      for (const flight of this.state.flights) {
        if (flight.emergency !== 'disabled') flight.controlHold = false;
        flight.controlPace = 1;
        flight.controlPattern = undefined;
        flight.controlPatternStart = undefined;
        if (flight.phase === 'approach' && !flight.cleared && !flight.goAround && !flight.diversion) {
          flight.navigation.approachCleared = true;
          flight.clearanceLeft = Math.max(flight.clearanceLeft, flight.duration * 0.96 - flight.phaseElapsed);
        }
        if (flight.phase === 'takeoff' && !flight.takeoffCleared) {
          flight.takeoffCleared = true;
          this.recordRunwayOperation(flight, 'departure');
          this.events.push({ type: 'takeoff-clearance', flight, runway: flight.runway });
        }
      }
    } else {
      for (const flight of this.state.flights) {
        flight.automaticHold = false;
        flight.automaticHoldReason = undefined;
        if (this.state.paused && flight.phase === 'approach') {
          flight.cleared = false;
          flight.clearanceLeft = Math.max(2, flight.duration * 0.96 - flight.phaseElapsed);
        }
      }
    }
  }

  setTrafficDensity(density: TrafficDensity): void {
    setTrafficFlowDensity(this.state.trafficFlow, density, this.state.elapsed);
    this.spawnIn = Math.max(0, this.state.trafficFlow.nextArrivalDemandSeconds - this.state.elapsed);
    this.decisionReason = `${trafficDensityProfile(density).label} traffic density active`;
  }

  setSeparationRuleset(id: SeparationRulesetId): void {
    this.state.separationRuleset = id;
    this.decisionReason = `${separationRuleset(id).label} separation active`;
  }

  setNightMode(enabled: boolean): void {
    this.state.nightMode = enabled;
    this.updateActiveRunwayConfiguration();
  }

  setStation(station: ControllerStation): void {
    this.state.station = station;
    if (isOperationalControllerStation(station)) {
      for (const candidate of OPERATIONAL_CONTROLLER_STATIONS) {
        this.state.stationAutomation[candidate] = candidate !== station;
      }
      this.coordinateControllerStations();
    }
  }

  setStationAutomation(station: OperationalControllerStation, enabled: boolean): boolean {
    if (this.state.station !== 'supervisor') {
      return this.rejectDecision(`${this.state.station} station cannot configure unstaffed-position automation`);
    }
    this.state.stationAutomation[station] = enabled;
    this.decisionReason = `${station} automation ${enabled ? 'enabled' : 'disabled'}`;
    this.coordinateControllerStations();
    return true;
  }

  controllerWorkloads(): ControllerWorkloadSnapshot[] {
    return controllerWorkloadSnapshots(
      this.state.flights,
      this.isAutomaticMode() ? createStationAutomation(true) : this.state.stationAutomation,
    );
  }

  lastCommandReason(): string {
    return this.decisionReason;
  }

  runwayConfigurationOptions(): Array<{ id: string; eligible: boolean; reason: string }> {
    return this.config.runwayConfigurations.map((configuration) => {
      const reason = this.configurationRestrictionReason(configuration);
      return { id: configuration.id, eligible: reason === null, reason: reason ?? 'available' };
    });
  }

  setRunwayConfiguration(configurationId: string | null): boolean {
    if (this.state.station !== 'supervisor') {
      return this.rejectDecision(`${this.state.station} station cannot change the airport runway plan`);
    }
    if (configurationId === null) {
      this.runwayConfigurationOverrideId = null;
      this.state.runwayConfigurationMode = 'automatic';
      this.decisionReason = 'automatic runway-plan selection restored';
      this.updateActiveRunwayConfiguration();
      return true;
    }
    const configuration = this.config.runwayConfigurations.find((candidate) => candidate.id === configurationId);
    if (!configuration) return this.rejectDecision(`unknown runway configuration ${configurationId}`);
    const restriction = this.configurationRestrictionReason(configuration);
    if (restriction) return this.rejectDecision(`${configuration.name} unavailable: ${restriction}`);
    this.runwayConfigurationOverrideId = configuration.id;
    this.state.runwayConfigurationMode = 'manual';
    this.requestRunwayConfiguration(configuration, 'supervisor selection');
    this.decisionReason = this.state.runwayConfigurationTransition
      ? `${configuration.name} queued until ${this.state.runwayConfigurationTransition.blockingFlightIds.length} protected flight${this.state.runwayConfigurationTransition.blockingFlightIds.length === 1 ? '' : 's'} clear`
      : `${configuration.name} active`;
    return true;
  }

  canIssue(kind: OperationalControllerStation): boolean {
    return stationCanIssue(this.state.station, kind);
  }

  private ownsFlight(flight: Flight): boolean {
    return this.state.station === 'supervisor' || flight.navigation.frequencyOwner === this.state.station;
  }

  triggerEmergency(id: number, type: EmergencyType): boolean {
    const flight = this.state.flights.find((item) => item.id === id && item.phase !== 'resting');
    if (!flight) return this.rejectDecision('flight is not available for that instruction');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (type === 'go-around' && flight.diversion) return this.rejectDecision(`${flight.callsign} is already established on a diversion exit`, flight);
    if (type === 'go-around' && this.state.station !== 'supervisor' && this.state.station !== 'approach' && this.state.station !== 'tower') {
      return this.rejectDecision(`${this.state.station} station has no go-around authority`, flight);
    }
    if (type === 'disabled' && !this.canIssue('ground')) return this.rejectDecision(`${this.state.station} station cannot dispatch surface recovery`, flight);
    if (type === 'disabled' && flight.phase !== 'taxi-in' && flight.phase !== 'taxi-out') {
      return this.rejectDecision('disabled-aircraft recovery applies only to aircraft on the movement surface', flight);
    }
    if (type === 'disabled' && flight.emergency === 'disabled') {
      return this.rejectDecision(`${flight.callsign} is already awaiting recovery`, flight);
    }
    flight.emergency = type;
    this.metrics.emergencyResponses += 1;
    if (type === 'go-around' && (flight.phase === 'approach' || flight.phase === 'landing')) {
      this.goAround(flight, 'controller instruction');
    }
    if (type === 'disabled') {
      flight.controlHold = true;
      this.createDisabledAircraftDisruption(flight);
    }
    this.events.push({ type: 'emergency', flight });
    this.decisionReason = `${type} handling active for ${flight.callsign}`;
    return true;
  }

  setSurfaceDisruption(
    kind: Exclude<SurfaceDisruptionKind, 'disabled-aircraft'>,
    targetId: string,
    enabled: boolean,
    durationSeconds?: number,
  ): boolean {
    if (this.state.station !== 'supervisor') {
      return this.rejectDecision(`${this.state.station} station cannot change airport surface availability`);
    }
    if (!enabled) {
      const disruption = this.state.surfaceDisruptions.find((candidate) => (
        candidate.kind === kind && (candidate.id === targetId || candidate.targetId === targetId)
      ));
      if (!disruption) return this.rejectDecision('no matching active surface restriction');
      return this.removeSurfaceDisruption(disruption.id, 'supervisor reopened the movement area');
    }
    return this.createSurfaceDisruption(kind, targetId, 'controller', durationSeconds);
  }

  clearSurfaceDisruption(id: string): boolean {
    if (this.state.station !== 'supervisor') {
      return this.rejectDecision(`${this.state.station} station cannot reopen airport pavement`);
    }
    const disruption = this.state.surfaceDisruptions.find((candidate) => candidate.id === id);
    if (!disruption) return this.rejectDecision(`unknown surface restriction ${id}`);
    if (disruption.kind === 'disabled-aircraft') {
      return this.rejectDecision('dispatch recovery for a disabled aircraft before reopening its pavement');
    }
    return this.removeSurfaceDisruption(id, 'supervisor reopened the movement area');
  }

  recoverDisabledAircraft(flightId: number): boolean {
    if (!this.canIssue('ground')) return this.rejectDecision(`${this.state.station} station cannot dispatch surface recovery`);
    const disruption = this.state.surfaceDisruptions.find((candidate) => (
      candidate.kind === 'disabled-aircraft' && candidate.flightId === flightId
    ));
    const flight = this.state.flights.find((candidate) => candidate.id === flightId);
    if (!disruption || !flight) return this.rejectDecision('disabled aircraft is not awaiting recovery');
    if (disruption.status === 'recovering') return this.rejectDecision(`${flight.callsign} recovery is already in progress`, flight);
    this.startDisabledRecovery(disruption, flight, 'ground recovery dispatch');
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} recovery dispatched`;
    return true;
  }

  setScenario(scenario: TrafficScenario): void {
    this.state.scenario = scenario;
    this.removeSurfaceDisruptionsBySource('scenario');
    if (scenario === 'closure') {
      const runway = this.config.runways.find((candidate) => (
        (this.runwayRole(candidate.id) === 'arrival' || this.runwayRole(candidate.id) === 'mixed')
        && this.runwayClosureLeavesCapacity(candidate.id)
      ));
      if (runway) this.createSurfaceDisruption('runway-closure', String(runway.id), 'scenario');
    }
    if (scenario === 'storm') this.setWeather('rain', this.state.weather.windDirection, Math.max(18, this.state.weather.windSpeed));
    if (scenario === 'normal' || scenario === 'rush' || scenario === 'closure') this.weatherOverrideUntil = 0;
    this.updateActiveRunwayConfiguration();
  }

  shiftMetrics(): ShiftMetrics { return { ...this.metrics }; }

  clearanceProposals(): ClearanceProposal[] {
    if (this.state.mode !== 'assisted') return [];
    const proposals: ClearanceProposal[] = [];
    for (const flight of this.state.flights) {
      if (flight.phase === 'approach' && !flight.cleared && !flight.goAround && !flight.diversion && !flight.navigation.hold) {
        proposals.push({
          id: `${flight.id}:land:${flight.runway}`,
          flightId: flight.id,
          action: 'land',
          runway: flight.runway,
          station: 'tower',
          label: `Clear to land ${this.activeRunwayDesignation(flight.runway)}`,
          reason: flight.progress > 0.72
            ? 'Established on final; landing clearance is becoming time-critical.'
            : 'Approach is stable and the assigned runway sequence is protected.',
          priority: flight.progress > 0.82 ? 'urgent' : flight.progress > 0.62 ? 'attention' : 'routine',
        });
      }
      if ((flight.phase === 'approach' || flight.phase === 'landing') && flight.safetyHold) {
        proposals.push({
          id: `${flight.id}:go-around`, flightId: flight.id, action: 'go-around', runway: flight.runway, station: requiredControllerStation(flight) === 'tower' ? 'tower' : 'approach',
          label: 'Issue go-around', reason: flight.safetyHoldReason ?? 'Protected approach spacing cannot be maintained.', priority: 'urgent',
        });
      }
      if (flight.phase === 'resting' && flight.turnaround.status === 'ready' && !flight.pushbackCleared) {
        proposals.push({
          id: `${flight.id}:pushback`, flightId: flight.id, action: 'pushback', station: 'ramp',
          label: `Push ${flight.pushbackDirection}`,
          reason: `Turnaround is complete; tug and engine-start sequence are ready for a ${flight.pushbackDirection} push to the ramp lane.`,
          priority: 'attention',
        });
      }
      const nextCrossing = this.nextUnclearedCrossing(flight);
      for (const crossing of nextCrossing && nextCrossing.distanceToHold * WORLD_METERS_PER_UNIT <= CROSSING_CLEARANCE_RANGE_M
        ? [nextCrossing]
        : []) {
        const runway = crossing.runwayId;
        proposals.push({
          id: `${flight.id}:cross:${runway}`, flightId: flight.id, action: 'cross', runway, station: 'ground',
          label: `Cross ${this.activeRunwayDesignation(runway)}`,
          reason: `Approaching the hold-short point for runway ${this.activeRunwayDesignation(runway)}; occupancy will be rechecked on approval.`,
          priority: crossing.distanceToHold <= 0.05 ? 'urgent' : 'attention',
        });
      }
      if (flight.phase === 'taxi-out' && flight.progress >= 0.985 && !flight.runwayEntryCleared && deicingReleaseValid(flight, this.state.weather, this.state.elapsed)) {
        proposals.push({
          id: `${flight.id}:line-up:${flight.runway}`, flightId: flight.id, action: 'line-up', runway: flight.runway, station: 'tower',
          label: `Line up ${this.activeRunwayDesignation(flight.runway)}`,
          reason: 'Aircraft is stopped at the hold-short point and all required route crossings are clear.', priority: 'attention',
        });
      }
      if (flight.phase === 'takeoff' && !flight.takeoffCleared) {
        proposals.push({
          id: `${flight.id}:takeoff:${flight.runway}`, flightId: flight.id, action: 'takeoff', runway: flight.runway, station: 'tower',
          label: `Clear takeoff ${this.activeRunwayDesignation(flight.runway)}`,
          reason: 'Aircraft is lined up; runway protection and arrival spacing will be validated on approval.', priority: 'attention',
        });
      }
      if (flight.controlHold && !flight.safetyHold) {
        proposals.push({
          id: `${flight.id}:resume`, flightId: flight.id, action: 'resume', station: 'ground',
          label: 'Resume taxi', reason: 'Controller hold remains active; release is available through the ground station.', priority: 'routine',
        });
      }
    }
    const order = { urgent: 0, attention: 1, routine: 2 } as const;
    return proposals.sort((first, second) => order[first.priority] - order[second.priority] || first.flightId - second.flightId);
  }

  conflictPredictions(): ConflictPrediction[] {
    const predictions: ConflictPrediction[] = [];
    const active = this.state.flights.filter((flight) => flight.phase !== 'resting');
    const rules = separationRuleset(this.state.separationRuleset);
    for (let firstIndex = 0; firstIndex < active.length; firstIndex += 1) {
      const first = active[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < active.length; secondIndex += 1) {
        const second = active[secondIndex];
        const firstAirborne = first.phase === 'approach' || first.phase === 'landing';
        const secondAirborne = second.phase === 'approach' || second.phase === 'landing';
        if (firstAirborne && secondAirborne) {
          const assessment = assessAirborneSeparation(rules, this.state.weather, first, second);
          if (!assessment.compliant) {
            predictions.push({
              severity: 'warning',
              type: 'separation',
              flights: [first.id, second.id],
              runway: first.runway,
              etaSeconds: 0,
              detail: `${rules.label}: ${assessment.reason}`,
            });
          }
        }
        if (!this.runwaysConflict(first.runway, second.runway)) continue;
        if (first.phase === 'taxi-out' && first.progress > 0.74 && secondAirborne) {
          predictions.push({ severity: 'caution', type: 'runway', flights: [first.id, second.id], runway: first.runway, etaSeconds: Math.max(1, Math.round((1 - first.progress) * 20)), detail: `${first.callsign} is approaching the hold-short point while ${second.callsign} is active` });
        }
      }
    }
    return predictions.slice(0, 8);
  }

  private airborneSeparationViolations(): Array<{ flights: [number, number]; assessment: ReturnType<typeof assessAirborneSeparation> }> {
    const airborne = this.state.flights.filter((flight) => !flight.motion.onGround && (flight.phase === 'approach' || flight.phase === 'landing' || flight.phase === 'takeoff'));
    const rules = separationRuleset(this.state.separationRuleset);
    const violations: Array<{ flights: [number, number]; assessment: ReturnType<typeof assessAirborneSeparation> }> = [];
    for (let firstIndex = 0; firstIndex < airborne.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < airborne.length; secondIndex += 1) {
        const assessment = assessAirborneSeparation(rules, this.state.weather, airborne[firstIndex], airborne[secondIndex]);
        if (!assessment.compliant) violations.push({ flights: [airborne[firstIndex].id, airborne[secondIndex].id], assessment });
      }
    }
    return violations;
  }

  setWeather(condition: WeatherCondition, windDirection: number, windSpeed: number): void {
    this.state.weather.weatherEnabled = true;
    this.state.weather.windEnabled = true;
    this.state.weather.condition = condition;
    this.state.weather.windDirection = this.normalizeAngle(windDirection);
    this.state.weather.windSpeed = Math.max(0, Math.min(40, windSpeed));
    this.state.weather.gustSpeed = this.state.weather.windSpeed + (condition === 'clear' ? 3 : 7);
    this.state.weather.visibility = condition === 'fog' ? 2.5 : condition === 'snow' ? 3 : condition === 'rain' ? 5 : 10;
    this.state.weather.ceilingFt = condition === 'fog' ? 600 : condition === 'snow' ? 1_000 : condition === 'rain' ? 2_500 : 12_000;
    this.state.weather.temperatureC = condition === 'snow' ? -4 : condition === 'rain' ? 9 : condition === 'fog' ? 7 : 18;
    this.state.weather.surfaceCondition = condition === 'snow' ? 'contaminated' : condition === 'rain' || condition === 'fog' ? 'wet' : 'dry';
    this.baseWindDirection = this.state.weather.windDirection;
    this.baseWindSpeed = this.state.weather.windSpeed;
    // Keep an explicitly selected winter bank stable long enough for a busy
    // hub departure to push, queue, receive treatment, and use its holdover
    // window. Surface congestion can make that lifecycle substantially longer
    // than the nominal route duration.
    this.weatherOverrideUntil = this.state.elapsed + (condition === 'snow' ? 2400 : 180);
    this.refreshDeicingPlansForWeather();
    this.updateActiveRunwayConfiguration();
  }

  setWeatherEnabled(enabled: boolean): void {
    this.state.weather.weatherEnabled = enabled;
    if (!enabled) {
      this.state.weather.condition = 'clear';
      this.state.weather.visibility = 10;
      this.state.weather.ceilingFt = 12_000;
      this.state.weather.temperatureC = 18;
      this.state.weather.surfaceCondition = 'dry';
    } else {
      this.weatherOverrideUntil = 0;
    }
    this.updateWeather();
    this.refreshDeicingPlansForWeather();
  }

  setWindEnabled(enabled: boolean): void {
    this.state.weather.windEnabled = enabled;
    this.updateWeather();
  }

  clearFlight(id: number, runway: number): boolean {
    if (this.state.gameOver) return this.rejectDecision('shift is closed');
    if (this.state.paused) return this.rejectDecision('resume the simulation before issuing a clearance');
    if (!this.canIssue('tower')) return this.rejectDecision(`${this.state.station} station has no landing-clearance authority`);
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'approach');
    if (!flight) return this.rejectDecision('flight is not awaiting an approach clearance');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (flight.diversion) return this.rejectDecision('flight is established on a diversion exit and cannot be cleared to land', flight);
    if (flight.goAround) return this.rejectDecision('flight is flying the missed-approach circuit before re-entering the arrival sequence', flight);
    if (flight.runway !== runway) return this.rejectDecision(`flight is assigned to runway ${this.activeRunwayDesignation(flight.runway)}`, flight);
    if (runwayClosedByDisruption(this.state.surfaceDisruptions, runway)) return this.rejectDecision(`runway ${this.activeRunwayDesignation(runway)} is closed`, flight);
    const blocker = flight.progress > 0.68 ? this.runwayBlocker(runway, flight.id) : null;
    if (blocker) return this.rejectDecision(`runway protected for ${blocker.callsign} ${blocker.phase}`, flight);
    flight.cleared = true;
    flight.navigation.approachCleared = true;
    flight.navigation.readbackStatus = 'accepted';
    flight.clearanceLeft = 99;
    this.decisionReason = `landing clearance accepted for runway ${this.activeRunwayDesignation(runway)}`;
    this.events.push({ type: 'clear', flight });
    return true;
  }

  clearPushback(id: number): boolean {
    if (this.state.gameOver) return this.rejectDecision('shift is closed');
    if (this.state.paused) return this.rejectDecision('resume the simulation before issuing a clearance');
    if (!this.canIssue('ramp')) return this.rejectDecision(`${this.state.station} station has no ramp pushback authority`);
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'resting');
    if (!flight) return this.rejectDecision('flight is not at a stand awaiting pushback');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (flight.turnaround.status !== 'ready') {
      const blocking = turnaroundBlockingServices(flight.turnaround);
      return this.rejectDecision(`pushback held: ${blocking.length ? `${blocking.join(', ')} incomplete` : 'turnaround is not ready'}`, flight);
    }
    const rampBlockers = serviceVehiclesBlockingPushback(this.state.serviceVehicles, flight.id);
    if (rampBlockers.length) {
      return this.rejectDecision(`pushback held: ${rampBlockers.map((vehicle) => vehicle.label.toLowerCase()).join(', ')} not clear of the stand`, flight);
    }
    if (flight.pushbackCleared) return this.rejectDecision('pushback is already cleared', flight);
    if (this.state.runwayConfigurationTransition) return this.rejectDecision('pushback held while the runway plan changes', flight);
    if (this.selectDepartureRunway(flight) === null) return this.rejectDecision('no compatible departure runway is available', flight);
    if (winterDeicingRequired(this.state.weather) && flight.deicing.status === 'unavailable') {
      return this.rejectDecision('pushback held: no compatible winter route to a deicing pad', flight);
    }
    this.grantPushbackClearance(flight, false);
    return true;
  }

  clearRunwayEntry(id: number): boolean {
    if (!this.canIssue('tower')) return this.rejectDecision(`${this.state.station} station has no runway-entry authority`);
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'taxi-out');
    if (!flight) return this.rejectDecision('flight is not taxiing for departure');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (flight.progress < 0.985) return this.rejectDecision('flight has not reached the hold-short point', flight);
    if (!deicingReleaseValid(flight, this.state.weather, this.state.elapsed)) {
      const detail = flight.deicing.status === 'expired'
        ? 'holdover protection expired; return to the deicing pad'
        : `winter departure requires completed deicing (${flight.deicing.status})`;
      return this.rejectDecision(detail, flight);
    }
    const missingCrossing = this.nextUnclearedCrossing(flight);
    if (missingCrossing) return this.rejectDecision(`crossing clearance for ${this.activeRunwayDesignation(missingCrossing.runwayId)} is still required`, flight);
    const blocker = this.runwayBlocker(flight.runway, flight.id);
    if (blocker) return this.rejectDecision(`runway protected for ${blocker.callsign} ${blocker.phase}`, flight);
    flight.runwayEntryCleared = true;
    this.decisionReason = `runway entry accepted for ${this.activeRunwayDesignation(flight.runway)}`;
    this.events.push({ type: 'runway-entry', flight, runway: flight.runway, taxiway: flight.taxiway });
    return true;
  }

  clearRunwayCrossing(id: number, runway: number): boolean {
    if (!this.canIssue('ground')) return this.rejectDecision(`${this.state.station} station has no runway-crossing authority`);
    const flight = this.state.flights.find((item) => item.id === id && (item.phase === 'taxi-in' || item.phase === 'taxi-out'));
    if (!flight) return this.rejectDecision('flight is not taxiing on the surface');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (!flight.requiredCrossings?.includes(runway)) return this.rejectDecision(`runway ${this.activeRunwayDesignation(runway)} is not on this taxi route`, flight);
    const crossing = this.nextUnclearedCrossing(flight);
    if (!crossing || crossing.runwayId !== runway) return this.rejectDecision(`runway ${this.activeRunwayDesignation(runway)} is not the next crossing on this taxi route`, flight);
    if (crossing.distanceToHold * WORLD_METERS_PER_UNIT > CROSSING_CLEARANCE_RANGE_M) {
      return this.rejectDecision(`aircraft has not reached the ${this.activeRunwayDesignation(runway)} crossing hold-short area`, flight);
    }
    const blocker = this.runwayBlocker(runway, flight.id);
    if (blocker) return this.rejectDecision(`crossing held: ${blocker.callsign} is ${blocker.phase} on the protected runway`, flight);
    this.grantCrossingClearance(flight, crossing);
    this.decisionReason = `crossing clearance accepted for ${this.activeRunwayDesignation(runway)}`;
    return true;
  }

  clearTakeoff(id: number): boolean {
    if (!this.canIssue('tower')) return this.rejectDecision(`${this.state.station} station has no takeoff authority`);
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'takeoff' && item.runwayEntryCleared);
    if (!flight) return this.rejectDecision('flight is not lined up with runway-entry clearance');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (flight.takeoffCleared) return this.rejectDecision('takeoff is already cleared', flight);
    const release = this.runwayReleaseBlocker(flight, 'departure');
    if (release) return this.rejectDecision(`takeoff held: ${release}`, flight);
    const blocker = this.runwayBlocker(flight.runway, flight.id);
    if (blocker) return this.rejectDecision(`takeoff held: ${blocker.callsign} is ${blocker.phase} in the protected zone`, flight);
    const pathBlocker = this.departurePathBlocker(flight);
    if (pathBlocker) return this.rejectDecision(`takeoff held: ${pathBlocker.callsign} has not cleared the departure envelope`, flight);
    flight.takeoffCleared = true;
    this.recordRunwayOperation(flight, 'departure');
    this.decisionReason = `takeoff clearance accepted for ${this.activeRunwayDesignation(flight.runway)}`;
    this.events.push({ type: 'takeoff-clearance', flight, runway: flight.runway });
    return true;
  }

  assignHeading(id: number, headingDegrees: number): boolean {
    if (!this.canIssue('approach')) return this.rejectDecision(`${this.state.station} station has no airborne-vector authority`);
    const flight = this.state.flights.find((item) => item.id === id && !item.diversion && (item.phase === 'approach' || (item.phase === 'takeoff' && !item.motion.onGround)));
    if (!flight) return this.rejectDecision('flight is not airborne and available for a heading assignment');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (flight.phase === 'approach' && (flight.progress >= 0.76 || flight.motion.stage === 'final')) {
      return this.rejectDecision('aircraft is established too close to final; issue a go-around before a new vector', flight);
    }
    const heading = ((headingDegrees % 360) + 360) % 360;
    const presentHeading = this.mathAngleToAviationDegrees(flight.motion.heading);
    const turn = Math.abs(Math.atan2(
      Math.sin((heading - presentHeading) * Math.PI / 180),
      Math.cos((heading - presentHeading) * Math.PI / 180),
    ) * 180 / Math.PI);
    if (turn > 120) return this.rejectDecision(`heading change is ${Math.round(turn)}°; use an intermediate vector`, flight);
    const departure = flight.phase === 'takeoff';
    const vectorEndProgress = departure
      ? Math.min(0.995, flight.progress + 0.2)
      : Math.min(0.8, flight.progress + (this.config.scope === 'center' ? 0.3 : 0.24));
    if (vectorEndProgress <= flight.progress + 0.01) return this.rejectDecision('aircraft is leaving terminal scope; heading amendment is too late', flight);
    flight.navigation.assignedHeadingDegrees = heading;
    if (departure) flight.navigation.departureHeadingDegrees = heading;
    flight.navigation.vector = {
      issuedAtSeconds: this.state.elapsed,
      startProgress: flight.progress,
      endProgress: vectorEndProgress,
      headingDegrees: heading,
      rejoinFixId: flight.navigation.routeFixIds[Math.min(flight.navigation.routeFixIds.length - 1, flight.navigation.activeFixIndex + 2)],
      start: this.motionStart(flight),
    };
    flight.navigation.readbackStatus = 'accepted';
    amendFlightPlan(flight.flightPlan, 'clearance', this.state.elapsed, `fly heading ${String(Math.round(heading)).padStart(3, '0')}`);
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} heading ${String(Math.round(heading)).padStart(3, '0')} accepted`;
    this.events.push({ type: 'vector', flight, detail: this.decisionReason });
    return true;
  }

  assignAltitude(id: number, altitudeFt: number): boolean {
    if (!this.canIssue('approach')) return this.rejectDecision(`${this.state.station} station has no altitude authority`);
    const flight = this.state.flights.find((item) => item.id === id && !item.diversion && (item.phase === 'approach' || (item.phase === 'takeoff' && !item.motion.onGround)));
    if (!flight) return this.rejectDecision('flight is not airborne and available for an altitude assignment');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    const rounded = Math.round(altitudeFt / 100) * 100;
    const maximum = this.config.scope === 'center' ? 10_000 : 5_000;
    if (rounded < 500 || rounded > maximum) return this.rejectDecision(`altitude must be between 500 and ${maximum.toLocaleString()} ft in this terminal scope`, flight);
    if (flight.phase === 'approach' && flight.progress > 0.7 && rounded > 2_000) {
      return this.rejectDecision('high altitude assignment would destabilize the established final approach', flight);
    }
    flight.navigation.assignedAltitudeFt = rounded;
    if (flight.phase === 'approach' && !flight.navigation.vector) {
      flight.navigation.vector = {
        issuedAtSeconds: this.state.elapsed,
        startProgress: flight.progress,
        endProgress: Math.min(0.8, flight.progress + 0.24),
        headingDegrees: this.mathAngleToAviationDegrees(flight.motion.heading),
        rejoinFixId: flight.navigation.routeFixIds[Math.min(flight.navigation.routeFixIds.length - 1, flight.navigation.activeFixIndex + 1)],
        start: this.motionStart(flight),
      };
    }
    flight.navigation.readbackStatus = 'accepted';
    amendFlightPlan(flight.flightPlan, 'clearance', this.state.elapsed, `maintain ${rounded.toLocaleString()} ft`);
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} ${rounded.toLocaleString()} ft accepted`;
    this.events.push({ type: 'vector', flight, detail: this.decisionReason });
    return true;
  }

  assignAirspeed(id: number, speedKts: number): boolean {
    if (!this.canIssue('approach')) return this.rejectDecision(`${this.state.station} station has no airborne-speed authority`);
    const flight = this.state.flights.find((item) => item.id === id && !item.diversion && (item.phase === 'approach' || (item.phase === 'takeoff' && !item.motion.onGround)));
    if (!flight) return this.rejectDecision('flight is not airborne and available for a speed assignment');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    const profile = aircraftProfile(flight.aircraft);
    const minimum = flight.phase === 'approach' ? Math.max(80, profile.approachKts - 10) : Math.round(profile.approachKts * 1.18);
    const maximum = 250;
    const rounded = Math.round(speedKts / 5) * 5;
    if (rounded < minimum || rounded > maximum) return this.rejectDecision(`speed must be ${minimum}–${maximum} kt for ${flight.aircraft} in this phase`, flight);
    flight.navigation.assignedSpeedKts = rounded;
    flight.navigation.readbackStatus = 'accepted';
    amendFlightPlan(flight.flightPlan, 'clearance', this.state.elapsed, `maintain ${rounded} kt`);
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} ${rounded} kt accepted`;
    this.events.push({ type: 'vector', flight, detail: this.decisionReason });
    return true;
  }

  directFlightTo(id: number, fixId: string): boolean {
    if (!this.canIssue('approach')) return this.rejectDecision(`${this.state.station} station has no direct-to authority`);
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'approach' && !item.goAround && !item.diversion && !item.navigation.hold);
    if (!flight) return this.rejectDecision('flight is not available for a direct-to clearance');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (flight.progress >= 0.72) return this.rejectDecision('aircraft is too close to final for a route shortcut', flight);
    const fix = this.config.airspaceProgram.fixes.find((candidate) => candidate.id === fixId);
    if (!fix) return this.rejectDecision(`unknown terminal fix ${fixId}`, flight);
    const plannedIndex = flight.navigation.routeFixIds.indexOf(fixId);
    const remaining = plannedIndex >= 0
      ? flight.navigation.routeFixIds.slice(plannedIndex)
      : [fixId, ...flight.navigation.routeFixIds.slice(Math.max(0, flight.navigation.activeFixIndex + 1))];
    this.supersedeActiveRouteClearance(flight, `superseded by direct ${fix.name}`);
    flight.navigation.routeFixIds = [...new Set(remaining)];
    flight.navigation.activeFixIndex = 0;
    flight.navigation.vector = {
      issuedAtSeconds: this.state.elapsed,
      startProgress: flight.progress,
      endProgress: Math.min(0.8, flight.progress + 0.28),
      headingDegrees: this.mathAngleToAviationDegrees(Math.atan2(fix.position[1] - flight.motion.y, fix.position[0] - flight.motion.x)),
      rejoinFixId: fix.id,
      start: this.motionStart(flight),
    };
    flight.navigation.readbackStatus = 'accepted';
    amendFlightPlan(flight.flightPlan, 'route-change', this.state.elapsed, `direct ${fix.name}`, {
      route: [flight.flightPlan.origin, ...flight.navigation.routeFixIds, flight.flightPlan.destination],
    });
    this.state.trafficFlow.totals.routeAmendments += 1;
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} direct ${fix.name} accepted`;
    this.events.push({ type: 'vector', flight, detail: this.decisionReason });
    return true;
  }

  amendFlightRoute(id: number, fixIds: readonly string[]): boolean {
    const flight = this.routeAmendmentFlight(id);
    if (!flight) return false;
    const candidate = this.routeClearanceCandidate(flight, fixIds);
    if (!candidate) return false;
    if (!candidate.clearance.safeToIssue) {
      const reason = candidate.clearance.warnings.find((warning) => warning.severity === 'blocking')?.detail
        ?? 'route preview contains a blocking conflict';
      flight.navigation.routeClearance = {
        ...candidate.clearance,
        status: 'rejected',
        respondedAtSeconds: this.state.elapsed,
        reason,
      };
      flight.navigation.readbackStatus = 'rejected';
      return this.rejectDecision(reason, flight);
    }
    const clearance: FlightRouteClearanceState = {
      ...candidate.clearance,
      status: 'accepted',
      issuedAtSeconds: this.state.elapsed,
      respondedAtSeconds: this.state.elapsed,
      reason: 'atomic compatibility command accepted through the route safety preview',
    };
    return this.applyTerminalRouteAmendment(flight, candidate, clearance, true);
  }

  previewFlightRoute(id: number, fixIds: readonly string[]): boolean {
    const flight = this.routeAmendmentFlight(id);
    if (!flight) return false;
    const candidate = this.routeClearanceCandidate(flight, fixIds);
    if (!candidate) return false;
    flight.navigation.routeClearance = candidate.clearance;
    flight.navigation.readbackStatus = 'not-required';
    const blocking = candidate.clearance.warnings.filter((warning) => warning.severity === 'blocking').length;
    const cautions = candidate.clearance.warnings.length - blocking;
    this.decisionReason = `${flight.callsign} route preview ready · ${blocking ? `${blocking} blocking` : 'safe to issue'}${cautions ? ` · ${cautions} caution${cautions === 1 ? '' : 's'}` : ''}`;
    this.events.push({ type: 'route-preview', flight, detail: this.decisionReason });
    return true;
  }

  issueFlightRoute(id: number, fixIds?: readonly string[]): boolean {
    const flight = this.routeAmendmentFlight(id);
    if (!flight) return false;
    const existing = flight.navigation.routeClearance;
    const requestedFixIds = fixIds ?? (existing?.status === 'preview' ? existing.routeFixIds : undefined);
    if (!requestedFixIds) return this.rejectDecision('preview a route before issuing the amendment', flight);
    const reusesPreview = existing?.status === 'preview'
      && existing.routeFixIds.join('>') === requestedFixIds.join('>');
    const candidate = this.routeClearanceCandidate(flight, requestedFixIds, reusesPreview ? existing.revision : undefined);
    if (!candidate) return false;
    const blocking = candidate.clearance.warnings.find((warning) => warning.severity === 'blocking');
    if (blocking) {
      flight.navigation.routeClearance = {
        ...candidate.clearance,
        status: 'rejected',
        respondedAtSeconds: this.state.elapsed,
        reason: blocking.detail,
      };
      flight.navigation.readbackStatus = 'rejected';
      this.decisionReason = `${flight.callsign} route not issued · ${blocking.detail}`;
      this.events.push({ type: 'route-readback-rejected', flight, detail: this.decisionReason });
      return false;
    }
    const readbackDelay = 0.9 + flight.id % 5 * 0.18;
    flight.navigation.routeClearance = {
      ...candidate.clearance,
      status: 'pending-readback',
      issuedAtSeconds: this.state.elapsed,
      readbackDueSeconds: this.state.elapsed + readbackDelay,
      issuedBy: this.state.station,
      reason: 'awaiting pilot readback',
    };
    flight.navigation.readbackStatus = 'pending';
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} route issued · readback pending`;
    this.events.push({ type: 'route-clearance-issued', flight, detail: this.decisionReason });
    return true;
  }

  acceptRouteReadback(id: number): boolean {
    if (!this.canIssue('approach')) return this.rejectDecision(`${this.state.station} station has no route-readback authority`);
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision('flight is not active');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (flight.navigation.routeClearance?.status !== 'pending-readback') {
      return this.rejectDecision(`${flight.callsign} has no pending route readback`, flight);
    }
    return this.resolveRouteReadback(flight);
  }

  cancelFlightRouteClearance(id: number): boolean {
    if (!this.canIssue('approach')) return this.rejectDecision(`${this.state.station} station has no route-amendment authority`);
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision('flight is not active');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    const clearance = flight.navigation.routeClearance;
    if (!clearance || (clearance.status !== 'preview' && clearance.status !== 'pending-readback')) {
      return this.rejectDecision(`${flight.callsign} has no active route preview or readback`, flight);
    }
    this.supersedeActiveRouteClearance(flight, 'controller cancelled the proposed route');
    this.decisionReason = `${flight.callsign} route proposal cancelled`;
    return true;
  }

  private supersedeActiveRouteClearance(flight: Flight, reason: string): boolean {
    const clearance = flight.navigation.routeClearance;
    if (!clearance || (clearance.status !== 'preview' && clearance.status !== 'pending-readback')) return false;
    flight.navigation.routeClearance = {
      ...clearance,
      status: 'cancelled',
      respondedAtSeconds: this.state.elapsed,
      reason,
    };
    flight.navigation.readbackStatus = 'not-required';
    this.events.push({
      type: 'route-clearance-cancelled',
      flight,
      detail: `${flight.callsign} route proposal cancelled · ${reason}`,
    });
    return true;
  }

  private routeAmendmentFlight(id: number): Flight | null {
    if (!this.canIssue('approach')) {
      this.rejectDecision(`${this.state.station} station has no route-amendment authority`);
      return null;
    }
    const flight = this.state.flights.find((item) => (
      item.id === id
      && !item.diversion
      && !item.goAround
      && (item.phase === 'approach' || (item.phase === 'takeoff' && !item.motion.onGround))
    ));
    if (!flight) {
      this.rejectDecision('flight is not airborne and available for a route amendment');
      return null;
    }
    if (!this.ownsFlight(flight)) {
      this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
      return null;
    }
    if (flight.navigation.hold) {
      this.rejectDecision('release the aircraft from its hold before amending the route', flight);
      return null;
    }
    if (flight.navigation.routeClearance?.status === 'pending-readback') {
      this.rejectDecision('cancel or complete the pending route readback before issuing another amendment', flight);
      return null;
    }
    if (flight.phase === 'approach' && flight.progress >= 0.7) {
      this.rejectDecision('aircraft is established too close to final for a route amendment', flight);
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
    if (!pending || pending.status !== 'pending-readback') return false;
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
    if (!result.accepted) return this.rejectRouteReadback(flight, pending, result.reason);
    const blocking = result.value.clearance.warnings.find((warning) => warning.severity === 'blocking');
    if (blocking) return this.rejectRouteReadback(flight, pending, `readback withheld: ${blocking.detail}`);
    const clearance: FlightRouteClearanceState = {
      ...result.value.clearance,
      status: 'accepted',
      previousRouteFixIds: [...pending.previousRouteFixIds],
      previewedAtSeconds: pending.previewedAtSeconds,
      issuedAtSeconds: pending.issuedAtSeconds,
      readbackDueSeconds: pending.readbackDueSeconds,
      respondedAtSeconds: this.state.elapsed,
      issuedBy: pending.issuedBy,
      reason: 'pilot readback accepted; amended route is authoritative',
    };
    flight.navigation.routeClearance = clearance;
    flight.navigation.readbackStatus = 'accepted';
    this.decisionReason = `${flight.callsign} readback correct`;
    this.events.push({ type: 'route-readback-accepted', flight, detail: this.decisionReason });
    return this.applyTerminalRouteAmendment(flight, result.value, clearance, false);
  }

  private rejectRouteReadback(
    flight: Flight,
    pending: FlightRouteClearanceState,
    reason: string,
  ): false {
    flight.navigation.routeClearance = {
      ...pending,
      status: 'rejected',
      respondedAtSeconds: this.state.elapsed,
      safeToIssue: false,
      reason,
    };
    flight.navigation.readbackStatus = 'rejected';
    this.decisionReason = `${flight.callsign} route readback rejected · ${reason}`;
    this.events.push({ type: 'route-readback-rejected', flight, detail: this.decisionReason });
    return false;
  }

  private applyTerminalRouteAmendment(
    flight: Flight,
    candidate: TerminalRouteClearanceCandidate,
    clearance: FlightRouteClearanceState,
    countManualCommand: boolean,
  ): true {
    const direction = flight.phase === 'approach' ? 'arrival' : 'departure';
    const routeFixIds = candidate.fixes.map((fix) => fix.id);
    const firstFix = candidate.fixes[0];
    const heading = this.mathAngleToAviationDegrees(Math.atan2(firstFix.position[1] - flight.motion.y, firstFix.position[0] - flight.motion.x));
    flight.navigation.routeFixIds = routeFixIds;
    flight.navigation.activeFixIndex = 0;
    flight.navigation.assignedHeadingDegrees = heading;
    flight.navigation.vector = {
      issuedAtSeconds: this.state.elapsed,
      startProgress: flight.progress,
      endProgress: Math.min(0.995, flight.progress + (direction === 'arrival' ? 0.3 : 0.2)),
      headingDegrees: heading,
      rejoinFixId: firstFix.id,
      start: this.motionStart(flight),
    };
    if (direction === 'arrival') {
      flight.navigation.approachCleared = false;
      flight.cleared = false;
      flight.clearanceLeft = Math.max(flight.clearanceLeft, flight.duration * 0.34);
    } else {
      flight.navigation.departureHeadingDegrees = heading;
    }
    flight.navigation.routeClearance = clearance;
    flight.navigation.readbackStatus = 'accepted';
    amendFlightPlan(flight.flightPlan, 'route-change', this.state.elapsed, `route amended via ${candidate.fixes.map((fix) => fix.name).join(', ')}`, {
      route: [flight.flightPlan.origin, ...routeFixIds, flight.flightPlan.destination],
    });
    this.state.trafficFlow.totals.routeAmendments += 1;
    if (countManualCommand) this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} route amendment accepted · ${routeFixIds.length} fixes`;
    this.events.push({ type: 'route-amendment', flight, detail: this.decisionReason });
    return true;
  }

  assignTaxiRoute(id: number, viaNodeIds: readonly string[] = []): boolean {
    const flight = this.state.flights.find((item) => item.id === id && (item.phase === 'taxi-in' || item.phase === 'taxi-out'));
    if (!flight) return this.rejectDecision('flight is not taxiing on the surface');
    const authority: OperationalControllerStation = requiredControllerStation(flight) === 'ramp' ? 'ramp' : 'ground';
    if (!this.canIssue(authority)) return this.rejectDecision(`${this.state.station} station has no ${authority} taxi-route authority`, flight);
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (flight.emergency === 'disabled') return this.rejectDecision('disabled aircraft cannot accept a taxi route', flight);
    if (flight.phase === 'taxi-out' && flight.deicing.required && ['enroute', 'queued', 'positioning', 'treating', 'expired'].includes(flight.deicing.status)) {
      return this.rejectDecision('complete or replan the active deicing movement before issuing a taxi amendment', flight);
    }
    const routeNodes = flight.surfaceRoute;
    const routeEdges = flight.surfaceRouteEdges;
    const sample = sampleSurfaceRouteWithEdges(this.config.surfaceGraph, routeNodes, routeEdges, flight.progress);
    if (!sample || !routeNodes?.length || !routeEdges?.length || sample.edgeIndex < 0) return this.rejectDecision('flight has no amendable authoritative surface route', flight);
    const destinationNodeId = routeNodes.at(-1);
    const routingStartNodeIndex = Math.min(routeNodes.length - 1, sample.edgeIndex + 1);
    const routingStartNodeId = routeNodes[routingStartNodeIndex];
    if (!destinationNodeId || !routingStartNodeId || routingStartNodeId === destinationNodeId) return this.rejectDecision('flight is already at the cleared taxi destination', flight);
    const prefixNodes = routeNodes.slice(0, routingStartNodeIndex + 1);
    const prefixEdges = routeEdges.slice(0, routingStartNodeIndex);
    const profile = aircraftProfile(flight.aircraft);
    const planning = this.surfaceRoutePlanning(flight.id, new Set(prefixEdges));
    const result = buildSurfaceRouteViaNodes(
      this.config.surfaceGraph,
      routingStartNodeId,
      destinationNodeId,
      viaNodeIds,
      { wingspanM: profile.wingspanM, minimumWingtipClearanceM: profile.minimumWingtipClearanceM },
      planning,
    );
    if (!result.accepted) return this.rejectDecision(result.reason, flight);

    const previousEdgeIds = [...routeEdges];
    const nodeIds = [...prefixNodes, ...result.value.nodeIds.slice(1)];
    const edgeIds = [...prefixEdges, ...result.value.edgeIds];
    const fullSample = sampleSurfaceRouteWithEdges(this.config.surfaceGraph, nodeIds, edgeIds, 1);
    if (!fullSample || fullSample.totalDistance <= 0) return this.rejectDecision('amended taxi route has no usable pavement distance', flight);
    const edgeById = new Map(this.config.surfaceGraph.edges.map((edge) => [edge.id, edge]));
    const taxiwayIds = [...new Set(edgeIds.flatMap((edgeId) => {
      const taxiwayId = edgeById.get(edgeId)?.taxiwayId;
      return taxiwayId ? [taxiwayId] : [];
    }))];
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
    flight.progress = Math.max(0, Math.min(0.999999, sample.distanceAlong / route.distance));
    flight.duration = this.surfaceRouteDuration(flight, route);
    flight.phaseElapsed = flight.duration * flight.progress;
    flight.requiredCrossings = surfaceRouteRunwayCrossings(this.config.surfaceGraph, edgeIds, flight.runway);
    const crossingWindows = surfaceRouteCrossingWindows(this.config.surfaceGraph, nodeIds, flight.progress, flight.runway, edgeIds);
    const completed = crossingWindows.filter((crossing) => crossing.exitProgress < flight.progress - 1e-6);
    flight.crossingClearanceIds = completed.map((crossing) => crossing.id);
    flight.crossingClearances = [...new Set(completed.map((crossing) => crossing.runwayId))];
    flight.crossingHoldRunway = undefined;
    flight.crossingHoldPointId = undefined;
    flight.surfaceReroute = {
      revision: (flight.surfaceReroute?.revision ?? 0) + 1,
      status: 'rerouted',
      selectedAtSeconds: this.state.elapsed,
      disruptionIds: [],
      previousEdgeIds,
      routeEdgeIds: [...edgeIds],
      addedDistanceM: (route.distance - oldTotal) * WORLD_METERS_PER_UNIT,
      reason: viaNodeIds.length ? `controller taxi clearance via ${viaNodeIds.join(', ')}` : 'controller refreshed the safest available taxi route',
    };
    this.updateSurfaceRouteState(flight);
    syncFlightMotion(this.config, flight);
    amendFlightPlan(flight.flightPlan, 'clearance', this.state.elapsed, `taxi via ${taxiwayIds.join(', ') || 'assigned pavement route'}`);
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} taxi route accepted · ${edgeIds.length} pavement segments`;
    this.events.push({ type: 'taxi-route-clearance', flight, taxiway: taxiwayIds.join(' / '), detail: this.decisionReason });
    return true;
  }

  holdPosition(id: number): boolean {
    const flight = this.state.flights.find((item) => item.id === id && (item.phase === 'taxi-in' || item.phase === 'taxi-out'));
    if (!flight) return this.rejectDecision('flight is not taxiing on the surface');
    const authority: OperationalControllerStation = requiredControllerStation(flight) === 'ramp' ? 'ramp' : 'ground';
    if (!this.canIssue(authority)) return this.rejectDecision(`${this.state.station} station has no ${authority} hold-position authority`, flight);
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (flight.controlHold) return this.rejectDecision(`${flight.callsign} is already holding position`, flight);
    flight.controlHold = true;
    this.metrics.holdsIssued += 1;
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} hold position accepted · normal braking applied`;
    this.events.push({ type: 'hold-position', flight, taxiway: flight.taxiway, detail: this.decisionReason });
    return true;
  }

  resumeTaxi(id: number): boolean {
    const flight = this.state.flights.find((item) => item.id === id && (item.phase === 'taxi-in' || item.phase === 'taxi-out'));
    if (!flight) return this.rejectDecision('flight is not taxiing on the surface');
    const authority: OperationalControllerStation = requiredControllerStation(flight) === 'ramp' ? 'ramp' : 'ground';
    if (!this.canIssue(authority)) return this.rejectDecision(`${this.state.station} station has no ${authority} taxi authority`, flight);
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (!flight.controlHold) return this.rejectDecision(`${flight.callsign} has no controller hold to release`, flight);
    flight.controlHold = false;
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} resume taxi accepted${flight.automaticHold || flight.safetyHold ? ' · another safety hold remains active' : ''}`;
    this.events.push({ type: 'taxi-resume', flight, taxiway: flight.taxiway, detail: this.decisionReason });
    return true;
  }

  divertFlight(id: number, airportCode: string, exitFixId?: string, reason = 'controller diversion'): boolean {
    if (!this.canIssue('approach')) return this.rejectDecision(`${this.state.station} station has no diversion authority`);
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'approach' && !item.diversion);
    if (!flight) return this.rejectDecision('flight is not an inbound aircraft available for diversion');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    const alternate = airportCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(alternate)) return this.rejectDecision('alternate airport must be a 3- or 4-character code', flight);
    if (alternate === this.config.code || alternate === `K${this.config.code}`) return this.rejectDecision('alternate airport must differ from the current airport', flight);
    const exit = selectDiversionExitFix(
      this.config.airspaceProgram,
      [flight.motion.x, flight.motion.y],
      flight.motion.heading,
      exitFixId,
    );
    if (!exit.accepted) return this.rejectDecision(exit.reason, flight);
    const detail = reason.trim() || 'controller diversion';
    this.supersedeActiveRouteClearance(flight, `superseded by diversion to ${alternate}`);
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
    flight.duration = this.phaseDuration(flight.aircraft, 'approach', flight.runway) * 1.35;
    flight.clearanceLeft = Number.POSITIVE_INFINITY;
    flight.destination = alternate;
    amendFlightPlan(flight.flightPlan, 'diversion', this.state.elapsed, `${detail}; divert ${alternate} via ${exit.value.name}`, {
      destination: alternate,
      route: [flight.flightPlan.origin, exit.value.id, alternate],
      estimatedArrivalSeconds: this.state.elapsed + flight.duration,
    });
    flight.flightPlan.status = 'diverted';
    syncFlightMotion(this.config, flight);
    this.metrics.diversions += 1;
    this.metrics.manualCommands += 1;
    this.state.trafficFlow.totals.diversions += 1;
    this.decisionReason = `${flight.callsign} diverting to ${alternate} via ${exit.value.name}`;
    this.events.push({ type: 'diversion', flight, detail: `${this.decisionReason} · ${detail}` });
    return true;
  }

  clearApproach(id: number): boolean {
    if (!this.canIssue('approach')) return this.rejectDecision(`${this.state.station} station has no approach-clearance authority`);
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'approach' && !item.goAround && !item.diversion && !item.navigation.hold);
    if (!flight) return this.rejectDecision('flight is not established for an approach clearance');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    flight.navigation.approachCleared = true;
    flight.navigation.readbackStatus = 'accepted';
    amendFlightPlan(flight.flightPlan, 'clearance', this.state.elapsed, `cleared ${flight.procedure}`);
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} cleared ${flight.procedure}`;
    this.events.push({ type: 'approach-clearance', flight, runway: flight.runway, detail: this.decisionReason });
    return true;
  }

  holdFlight(id: number, patternId?: string, efcMinutes?: number): boolean {
    if (!this.canIssue('approach')) return this.rejectDecision(`${this.state.station} station has no holding authority`);
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'approach' && !item.goAround && !item.diversion && !item.navigation.hold);
    if (!flight) return this.rejectDecision('flight is not available for a holding clearance');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    if (flight.progress >= 0.68) return this.rejectDecision('aircraft is inside the final segment; issue a go-around before holding', flight);
    const routeFixes = new Set(flight.navigation.routeFixIds);
    const pattern = this.config.airspaceProgram.holds.find((hold) => hold.id === patternId)
      ?? this.config.airspaceProgram.holds.find((hold) => routeFixes.has(hold.fixId))
      ?? this.config.airspaceProgram.holds[flight.id % this.config.airspaceProgram.holds.length];
    if (!pattern) return this.rejectDecision('no terminal holding pattern is available', flight);
    const efc = Math.max(1, Math.min(30, efcMinutes ?? pattern.defaultEfcMinutes));
    const altitude = Math.max(pattern.minimumAltitudeFt, Math.min(pattern.maximumAltitudeFt, flight.navigation.assignedAltitudeFt ?? Math.round(flight.kinematics.altitudeFt / 500) * 500));
    this.supersedeActiveRouteClearance(flight, `superseded by hold ${pattern.name}`);
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
    amendFlightPlan(flight.flightPlan, 'clearance', this.state.elapsed, `hold ${pattern.name}; EFC +${efc} min`);
    this.metrics.holdsIssued += 1;
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} holding at ${pattern.name}; EFC in ${efc} min`;
    this.events.push({ type: 'airborne-hold', flight, detail: this.decisionReason });
    return true;
  }

  releaseAirborneHold(id: number): boolean {
    if (!this.canIssue('approach')) return this.rejectDecision(`${this.state.station} station has no holding authority`);
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'approach' && item.navigation.hold);
    if (!flight) return this.rejectDecision('flight is not in a terminal hold');
    if (!this.ownsFlight(flight)) return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}; handoff required`, flight);
    this.releaseHoldToArrival(flight, 'controller released hold');
    this.metrics.manualCommands += 1;
    return true;
  }

  handoffFlight(id: number, station: ControllerStation): boolean {
    return this.offerHandoff(id, station);
  }

  offerHandoff(id: number, station: ControllerStation): boolean {
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision('flight is not active');
    const owner = flight.navigation.frequencyOwner;
    if (!isOperationalControllerStation(owner) || !isOperationalControllerStation(station)) {
      return this.rejectDecision('handoffs require two operational controller positions', flight);
    }
    if (this.state.station !== 'supervisor' && this.state.station !== owner) {
      return this.rejectDecision(`${this.state.station} does not own ${flight.callsign}`, flight);
    }
    if (station === owner) return this.rejectDecision(`${flight.callsign} is already on ${station}`, flight);
    const expected = nextControllerStation(flight, owner);
    if (station !== expected) {
      return this.rejectDecision(`${flight.callsign} must coordinate with ${expected ?? 'no further controller'} next`, flight);
    }
    if (this.activeHandoff(flight)) return this.rejectDecision(`${flight.callsign} already has active coordination`, flight);
    this.beginHandoff(flight, station, this.state.station, `coordination requested by ${this.state.station}`);
    this.metrics.manualCommands += 1;
    return true;
  }

  acceptHandoff(id: number): boolean {
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision('flight is not active');
    const handoff = flight.navigation.handoff;
    if (!handoff || (handoff.status !== 'offered' && handoff.status !== 'overdue')) {
      return this.rejectDecision(`${flight.callsign} has no incoming handoff to accept`, flight);
    }
    if (this.state.station !== 'supervisor' && this.state.station !== handoff.to) {
      return this.rejectDecision(`${this.state.station} cannot accept coordination addressed to ${handoff.to}`, flight);
    }
    this.acceptHandoffInternal(flight, this.state.station, 'controller accepted coordination');
    this.metrics.manualCommands += 1;
    return true;
  }

  rejectHandoff(id: number): boolean {
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision('flight is not active');
    const handoff = flight.navigation.handoff;
    if (!handoff || (handoff.status !== 'offered' && handoff.status !== 'overdue')) {
      return this.rejectDecision(`${flight.callsign} has no incoming handoff to reject`, flight);
    }
    if (this.state.station !== 'supervisor' && this.state.station !== handoff.to) {
      return this.rejectDecision(`${this.state.station} cannot reject coordination addressed to ${handoff.to}`, flight);
    }
    handoff.status = 'rejected';
    handoff.respondedAtSeconds = this.state.elapsed;
    handoff.responseBy = this.state.station;
    handoff.reason = `coordination rejected by ${this.state.station}`;
    flight.navigation.handoffStatus = 'rejected';
    this.metrics.handoffRejections += 1;
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} handoff to ${handoff.to} rejected`;
    this.events.push({ type: 'handoff-reject', flight, detail: this.decisionReason });
    return true;
  }

  cancelHandoff(id: number): boolean {
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision('flight is not active');
    const handoff = this.activeHandoff(flight);
    if (!handoff) return this.rejectDecision(`${flight.callsign} has no active handoff to cancel`, flight);
    if (this.state.station !== 'supervisor' && this.state.station !== handoff.from) {
      return this.rejectDecision(`${this.state.station} cannot cancel ${handoff.from} coordination`, flight);
    }
    handoff.status = 'cancelled';
    handoff.respondedAtSeconds = this.state.elapsed;
    handoff.responseBy = this.state.station;
    handoff.reason = `coordination cancelled by ${this.state.station}`;
    flight.navigation.handoffStatus = 'owned';
    this.metrics.manualCommands += 1;
    this.decisionReason = `${flight.callsign} handoff to ${handoff.to} cancelled`;
    this.events.push({ type: 'handoff-cancel', flight, detail: this.decisionReason });
    return true;
  }

  contactFlight(id: number, station: ControllerStation): boolean {
    const flight = this.state.flights.find((item) => item.id === id);
    if (!flight) return this.rejectDecision('flight is not active');
    const handoff = flight.navigation.handoff;
    if (!handoff || handoff.status !== 'accepted') {
      return this.rejectDecision(`${flight.callsign} requires an accepted handoff before contact`, flight);
    }
    if (!isOperationalControllerStation(station) || station !== handoff.to) {
      return this.rejectDecision(`${flight.callsign} is coordinated for ${handoff.to}, not ${station}`, flight);
    }
    if (this.state.station !== 'supervisor' && this.state.station !== handoff.from) {
      return this.rejectDecision(`${this.state.station} cannot issue contact for ${handoff.from}`, flight);
    }
    this.completeHandoff(flight, 'controller contact instruction');
    this.metrics.manualCommands += 1;
    return true;
  }

  private activeHandoff(flight: Flight): FlightHandoffState | undefined {
    const handoff = flight.navigation.handoff;
    return handoff && (handoff.status === 'offered' || handoff.status === 'accepted' || handoff.status === 'overdue')
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
      status: overdue ? 'overdue' : 'offered',
      offeredAtSeconds: this.state.elapsed,
      responseDueSeconds: overdue ? this.state.elapsed : this.state.elapsed + HANDOFF_RESPONSE_SECONDS,
      offeredBy,
      reason,
    };
    flight.navigation.handoffStatus = overdue ? 'overdue' : 'offered';
    this.metrics.handoffOffers += 1;
    if (overdue) this.metrics.missedHandoffs += 1;
    this.decisionReason = overdue
      ? `${flight.callsign} missed ${owner} → ${target} handoff · coordination overdue`
      : `${flight.callsign} handoff offered ${owner} → ${target}`;
    this.events.push({
      type: overdue ? 'handoff-overdue' : 'handoff-offer',
      flight,
      runway: flight.runway,
      taxiway: flight.taxiway,
      detail: `${this.decisionReason} · ${reason}`,
    });
  }

  private markHandoffOverdue(flight: Flight, reason: string): void {
    const handoff = flight.navigation.handoff;
    if (!handoff || handoff.status !== 'offered') return;
    handoff.status = 'overdue';
    handoff.reason = reason;
    flight.navigation.handoffStatus = 'overdue';
    this.metrics.missedHandoffs += 1;
    this.decisionReason = `${flight.callsign} ${handoff.from} → ${handoff.to} handoff overdue`;
    this.events.push({ type: 'handoff-overdue', flight, runway: flight.runway, taxiway: flight.taxiway, detail: `${this.decisionReason} · ${reason}` });
  }

  private acceptHandoffInternal(flight: Flight, responseBy: ControllerStation, reason: string): void {
    const handoff = flight.navigation.handoff;
    if (!handoff || (handoff.status !== 'offered' && handoff.status !== 'overdue')) return;
    handoff.status = 'accepted';
    handoff.respondedAtSeconds = this.state.elapsed;
    handoff.responseBy = responseBy;
    handoff.reason = reason;
    flight.navigation.handoffStatus = 'accepted';
    this.metrics.handoffAcceptances += 1;
    this.decisionReason = `${flight.callsign} handoff accepted by ${handoff.to} · contact pending`;
    this.events.push({ type: 'handoff-accept', flight, runway: flight.runway, taxiway: flight.taxiway, detail: `${this.decisionReason} · ${reason}` });
  }

  private completeHandoff(flight: Flight, reason: string): void {
    const handoff = flight.navigation.handoff;
    if (!handoff || handoff.status !== 'accepted') return;
    flight.navigation.frequencyOwner = handoff.to;
    flight.navigation.handoffStatus = 'owned';
    handoff.status = 'completed';
    handoff.completedAtSeconds = this.state.elapsed;
    handoff.reason = reason;
    amendFlightPlan(flight.flightPlan, 'clearance', this.state.elapsed, `contact ${handoff.to}`);
    this.decisionReason = `${flight.callsign} contact ${handoff.to} · frequency ownership transferred`;
    this.events.push({ type: 'handoff-complete', flight, runway: flight.runway, taxiway: flight.taxiway, detail: `${this.decisionReason} · ${reason}` });
    this.events.push({ type: 'contact', flight, runway: flight.runway, taxiway: flight.taxiway, detail: this.decisionReason });
  }

  private surfaceHandoffHoldReason(flight: Flight): string | null {
    if (flight.phase !== 'taxi-in' && flight.phase !== 'taxi-out') return null;
    const owner = flight.navigation.frequencyOwner;
    const required = requiredControllerStation(flight);
    if (controllerStationIsAhead(flight, owner, required)) return null;
    const rampGroundBoundary = (owner === 'ramp' && required === 'ground') || (owner === 'ground' && required === 'ramp');
    if (!rampGroundBoundary) return null;
    const handoff = flight.navigation.handoff;
    if (handoff?.status === 'accepted' && handoff.to === required) {
      return `${required} accepted ${flight.callsign}; ${owner} must issue contact`;
    }
    if (handoff?.to === required) return `${owner} → ${required} handoff ${handoff.status}`;
    return `${owner} must coordinate ${flight.callsign} with ${required}`;
  }

  previewGroupedInstruction(ids: readonly number[], instruction: FlightInstruction): GroupInstructionPreview {
    return buildGroupInstructionPreview(this.state.flights, ids, instruction, this.state.station);
  }

  issueGroupedInstruction(ids: readonly number[], instruction: FlightInstruction): GroupInstructionIssueResult {
    const preview = this.previewGroupedInstruction(ids, instruction);
    if (!preview.safeToIssue) {
      this.decisionReason = preview.reason;
      return { ...preview, issued: false };
    }

    const selectedIds = new Set(preview.flightIds);
    const flights = this.state.flights.filter((flight) => selectedIds.has(flight.id));
    for (const flight of flights) {
      if (instruction === 'hold') flight.controlHold = true;
      if (instruction === 'resume') flight.controlHold = false;
      if (instruction === 'slow') flight.controlPace = 0.55;
      if (instruction === 'normal') flight.controlPace = 1;
    }
    if (instruction === 'hold') this.metrics.holdsIssued += flights.length;
    this.metrics.manualCommands += flights.length;
    this.decisionReason = `${instruction} accepted atomically for ${flights.length} flight${flights.length === 1 ? '' : 's'} · ${preview.authority}`;
    for (const flight of flights) {
      this.events.push({
        type: 'group-instruction',
        flight,
        taxiway: preview.domain === 'surface' ? flight.taxiway : undefined,
        detail: `${this.decisionReason} · ${preview.callsigns.join(', ')}`,
      });
    }
    return { ...preview, issued: true, reason: this.decisionReason };
  }

  controlFlights(ids: number[], instruction: FlightInstruction): number[] {
    if (ids.length > 1) {
      const result = this.issueGroupedInstruction(ids, instruction);
      return result.issued ? result.flightIds : [];
    }
    this.decisionReason = 'no requested flight accepted that instruction';
    const requested = new Set(ids.filter((id) => Number.isInteger(id) && id > 0));
    const controlled: number[] = [];
    for (const flight of this.state.flights) {
      if (!requested.has(flight.id)) continue;
      if (!this.ownsFlight(flight)) continue;
      const surface = flight.phase === 'taxi-in' || flight.phase === 'taxi-out' || flight.phase === 'resting';
      const surfaceStation: OperationalControllerStation = requiredControllerStation(flight) === 'ramp' ? 'ramp' : 'ground';
      if ((instruction === 'slow' || instruction === 'normal' || instruction === 'expedite')
        && !(surface ? this.canIssue(surfaceStation) : this.canIssue('approach'))) continue;
      if (instruction === 'hold') {
        if (flight.phase !== 'taxi-in' && flight.phase !== 'taxi-out') continue;
        if (!this.canIssue(surfaceStation)) continue;
        flight.controlHold = true;
        this.metrics.holdsIssued += 1;
      }
      if (instruction === 'resume') {
        if ((flight.phase === 'taxi-in' || flight.phase === 'taxi-out') && !this.canIssue(surfaceStation)) continue;
        flight.controlHold = false;
      }
      if (instruction === 'slow') flight.controlPace = 0.55;
      if (instruction === 'normal') flight.controlPace = 1;
      if (instruction === 'expedite') flight.controlPace = 1.4;
      if (instruction === 'zigzag') {
        if (flight.phase !== 'approach' || flight.goAround || flight.diversion) continue;
        if (!this.canIssue('approach')) continue;
        flight.controlPattern = 'zigzag';
        flight.controlPatternStart = flight.progress;
      }
      this.metrics.manualCommands += 1;
      controlled.push(flight.id);
    }
    if (controlled.length) this.decisionReason = `${instruction} accepted for ${controlled.length} flight${controlled.length === 1 ? '' : 's'}`;
    return controlled;
  }

  private goAround(flight: Flight, detail: string): void {
    if (flight.goAround || flight.diversion) return;
    this.supersedeActiveRouteClearance(flight, 'superseded by go-around clearance');
    const start = flight.motion;
    flight.goAround = {
      startedAt: this.state.elapsed,
      detail,
      cycle: 1,
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
    flight.phase = 'approach';
    flight.progress = 0;
    flight.phaseElapsed = 0;
    flight.duration = this.phaseDuration(flight.aircraft, 'approach', flight.runway) * 2.4;
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
    this.events.push({ type: 'go-around', flight, runway: flight.runway, detail });
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
      rejoinFixId: flight.navigation.routeFixIds[Math.min(2, flight.navigation.routeFixIds.length - 1)],
      start: this.motionStart(flight),
    };
    flight.progress = 0;
    flight.phaseElapsed = 0;
    flight.duration = this.phaseDuration(flight.aircraft, 'approach', flight.runway);
    flight.clearanceLeft = flight.duration * 0.96;
    flight.cleared = this.stationRunsAutomatically('tower');
    flight.navigation.approachCleared = flight.cleared;
    syncFlightMotion(this.config, flight);
    amendFlightPlan(flight.flightPlan, 'clearance', this.state.elapsed, detail);
    this.decisionReason = `${flight.callsign} released from hold and rejoining the arrival`;
    this.events.push({ type: 'hold-release', flight, detail: this.decisionReason });
  }

  reset(): void {
    const density = this.state.trafficFlow.density;
    this.state.elapsed = 0;
    this.state.flights = [];
    this.state.serviceVehicles = [];
    this.state.surfaceDisruptions = [];
    this.state.arrivals = 0;
    this.state.departures = 0;
    this.state.gameOver = false;
    this.state.paused = false;
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
    this.state.scenario = 'normal';
    this.state.station = 'supervisor';
    this.state.stationAutomation = createStationAutomation();
    this.runwayConfigurationOverrideId = null;
    this.state.runwayConfigurationMode = 'automatic';
    this.state.runwayConfigurationTransition = null;
    this.applyRunwayConfiguration(
      this.config.runwayConfigurations.find((configuration) => configuration.id === this.config.defaultRunwayConfigurationId)
        ?? this.config.runwayConfigurations[0],
    );
    this.stationarySeconds.clear();
    Object.assign(this.metrics, { safeArrivals: 0, safeDepartures: 0, preventedConflicts: 0, holdsIssued: 0, manualCommands: 0, maxConcurrent: 0, airborneSeconds: 0, taxiSeconds: 0, estimatedDelaySeconds: 0, emergencyResponses: 0, safetyHolds: 0, collisionAlerts: 0, runwayIncursions: 0, unexplainedPauses: 0, longestHoldSeconds: 0, diversions: 0, cancellations: 0, handoffOffers: 0, handoffAcceptances: 0, handoffRejections: 0, missedHandoffs: 0 });
    this.updateWeather();
    this.seedInitialTraffic();
  }

  private updateRouteReadbacks(): void {
    for (const flight of this.state.flights) {
      const clearance = flight.navigation.routeClearance;
      if (
        clearance?.status === 'pending-readback'
        && this.state.elapsed + 1e-6 >= (clearance.readbackDueSeconds ?? Infinity)
      ) {
        this.resolveRouteReadback(flight);
      }
    }
  }

  update(realDelta: number): void {
    if (this.state.gameOver || this.state.paused) return;
    const realStep = Math.min(realDelta, 0.1);
    const delta = realStep * this.speed;
    this.state.elapsed += delta;
    this.runwayOperationHistory = this.runwayOperationHistory.filter((operation) => this.state.elapsed - operation.atSeconds <= 300);
    this.state.breeze = Math.sin(this.state.elapsed * 0.07) * 0.5 + 0.5;
    this.updateWeather();
    this.updateSurfaceDisruptions(delta);
    this.taxiOutReleaseIn = Math.max(0, this.taxiOutReleaseIn - delta);
    this.updateTrafficFlow();
    this.coordinateControllerStations();
    this.updateRouteReadbacks();
    this.metrics.maxConcurrent = Math.max(this.metrics.maxConcurrent, this.state.flights.length);
    this.updateDeicingOperations(delta);
    this.coordinateAutomaticRunwayCrossings();
    this.coordinateAutomaticSurfaceTraffic();
    this.updateServiceVehicles(delta);

    for (const flight of this.state.flights) {
      if (flight.phase === 'resting') this.updateTurnaround(flight);
    }

    const proposedProgressById = new Map<number, number>(this.state.flights.map((flight) => [flight.id, flight.progress]));
    const requestedProgressById = new Map<number, number>();
    const requestedSpeedById = new Map<number, number>();
    const resolvedFlightIds = new Set<number>();
    const surfaceMergeYieldById = new Map<number, number>();
    const wasSafetyHeld = new Set(this.state.flights.filter((flight) => flight.safetyHold).map((flight) => flight.id));
    for (const flight of this.state.flights) {
      flight.safetyHold = false;
      flight.safetyHoldReason = undefined;
      const onSurface = flight.phase === 'taxi-in' || flight.phase === 'taxi-out';
      const motion = syncFlightMotion(this.config, flight);
      const crossing = onSurface ? this.nextUnclearedCrossing(flight) : null;
      const crossingDistanceM = Math.max(0, (crossing?.distanceToHold ?? Infinity) * WORLD_METERS_PER_UNIT);
      const crossingHold = Boolean(crossing && crossing.distanceToHold <= 0.002);
      const deicingLimit = onSurface ? deicingMovementLimit(flight) : null;
      const deicingDistanceM = deicingLimit === null
        ? Infinity
        : Math.max(0, deicingLimit - flight.progress) * Math.max(0, motion.totalDistanceM);
      const deicingHold = deicingLimit !== null && flight.progress >= deicingLimit - 0.0002;
      flight.crossingHoldRunway = crossingHold ? crossing?.runwayId : undefined;
      flight.crossingHoldPointId = crossingHold ? crossing?.holdPointId : undefined;
      const awaitingTakeoffClearance = flight.phase === 'takeoff'
        && !flight.takeoffCleared
        && motion.stage !== 'lineup';
      const disabledOnSurface = onSurface && flight.emergency === 'disabled';
      const disruptionHold = onSurface && flight.surfaceReroute?.status === 'holding';
      const hardHold = crossingHold || deicingHold || awaitingTakeoffClearance || disabledOnSurface || disruptionHold;
      const commandedStop = onSurface && Boolean(flight.automaticHold || flight.controlHold);
      let targetSpeed = hardHold || commandedStop ? 0 : this.targetGroundSpeedKts(flight);
      const stopDistanceM = Math.min(crossingDistanceM, deicingDistanceM);
      if (Number.isFinite(stopDistanceM)) {
        const braking = aircraftProfile(flight.aircraft).taxiBrakingMps2
          * (this.state.weather.condition === 'snow' ? 0.58 : this.state.weather.condition === 'rain' ? 0.76 : this.state.weather.condition === 'fog' ? 0.9 : 1);
        const maximumStoppingSpeedKts = Math.sqrt(Math.max(0, 2 * braking * stopDistanceM)) / KNOT_TO_MPS;
        targetSpeed = Math.min(targetSpeed, maximumStoppingSpeedKts);
      }
      const nextSpeed = hardHold ? 0 : this.acceleratedSpeedKts(flight, targetSpeed, delta);
      const travelMeters = (flight.kinematics.groundSpeedKts + nextSpeed) * 0.5 * KNOT_TO_MPS * delta;
      const requestedProgress = flight.phase === 'resting'
        ? flight.turnaround.progress
        : hardHold
          ? flight.progress
          : progressAfterDistance(this.config, flight, travelMeters);
      const clearanceLimitedProgress = Math.min(
        crossing ? Math.min(requestedProgress, crossing.holdProgress) : requestedProgress,
        deicingLimit ?? Infinity,
      );
      const reachedStop = clearanceLimitedProgress >= Math.min(crossing?.holdProgress ?? Infinity, deicingLimit ?? Infinity) - 1e-6;
      requestedSpeedById.set(flight.id, reachedStop ? 0 : nextSpeed);
      requestedProgressById.set(flight.id, clearanceLimitedProgress);
    }

    // Resolve proposed movement in a deterministic order. The collision layer
    // applies arrival/departure priority and then a stable flight-ID tie break
    // before a proxy can enter the protected envelope. This is the simulation's
    // final safety net, independent of the renderer and control mode.
    const movementPriority = (flight: Flight): number => {
      if (flight.phase === 'landing' || flight.phase === 'approach') return 0;
      // Once a departure has entered its takeoff phase it cannot safely stop
      // on the roll. Surface traffic yields to the committed runway movement.
      if (flight.phase === 'takeoff') return 1;
      if (flight.phase === 'taxi-in') return 2;
      if (flight.phase === 'taxi-out') return 3;
      return 4;
    };
    for (const flight of [...this.state.flights].sort((first, second) => movementPriority(first) - movementPriority(second) || first.id - second.id)) {
      const proposedProgress = requestedProgressById.get(flight.id) ?? flight.progress;
      proposedProgressById.set(flight.id, proposedProgress);
      const conflict = proposedProgress > flight.progress + 1e-9
        ? findProposedConflict(this.config, flight, proposedProgress, this.state.flights, proposedProgressById, resolvedFlightIds, surfaceMergeYieldById)
        : null;
      if (conflict) {
        flight.safetyHold = true;
        const counterpart = 'first' in conflict ? (conflict.first === flight.id ? conflict.second : conflict.first) : undefined;
        flight.safetyHoldReason = counterpart === undefined
          ? `next movement blocked: ${conflict.detail}`
          : `projected path conflict with flight ${counterpart}`;
        proposedProgressById.set(flight.id, flight.progress);
        requestedSpeedById.set(flight.id, 0);
        this.metrics.preventedConflicts += 1;
        this.metrics.safetyHolds += 1;
        if (!wasSafetyHeld.has(flight.id)) this.events.push({ type: 'safety-hold', flight, runway: flight.runway, taxiway: flight.taxiway, detail: flight.safetyHoldReason });
      }
      resolvedFlightIds.add(flight.id);
    }

    for (const flight of [...this.state.flights]) {
      const previousProgress = flight.progress;
      const previousMotion = { ...flight.motion };
      const onSurface = flight.phase === 'taxi-in' || flight.phase === 'taxi-out';
      const nextProgress = proposedProgressById.get(flight.id) ?? flight.progress;
      const moved = nextProgress > previousProgress + 1e-9;
      if (flight.phase === 'approach' || flight.phase === 'landing' || flight.phase === 'takeoff') this.metrics.airborneSeconds += delta;
      if (onSurface) this.metrics.taxiSeconds += delta;
      if (flight.safetyHold || (onSurface && (flight.controlHold || flight.automaticHold))) this.metrics.estimatedDelaySeconds += delta;
      if (flight.phase === 'approach' && !flight.cleared && !flight.goAround && !flight.diversion && !flight.navigation.hold) {
        flight.clearanceLeft -= delta;
        flight.phaseElapsed += delta;
        if (flight.clearanceLeft <= 0 || flight.phaseElapsed >= flight.duration * 0.96) {
          this.goAround(flight, 'landing clearance expired');
          continue;
        }
      } else {
        const waitingForTakeoff = flight.phase === 'takeoff' && !flight.takeoffCleared && flight.motion.stage !== 'lineup';
        if (!waitingForTakeoff && flight.phase !== 'resting' && moved) flight.phaseElapsed += delta;
      }
      flight.progress = nextProgress;
      this.updatePushbackState(flight);
      const surfaceClock = flight.phase === 'taxi-in' || flight.phase === 'resting' || flight.phase === 'taxi-out';
      if (surfaceClock) this.updateSurfaceRouteState(flight);
      syncFlightMotion(this.config, flight);
      if (!flight.navigation.hold && flight.navigation.routeFixIds.length) {
        flight.navigation.activeFixIndex = Math.min(
          flight.navigation.routeFixIds.length - 1,
          Math.floor(flight.progress * flight.navigation.routeFixIds.length),
        );
      }
      this.updateFlightKinematics(flight, delta, moved, previousProgress, previousMotion, requestedSpeedById.get(flight.id) ?? 0);
      this.updateMotionHealth(flight, delta, moved);

      if (flight.progress >= 1) this.advance(flight);
    }

    // Report any physical or protected-envelope overlap already present at the
    // end of a tick. Proposed movement should prevent these; diagnostics make
    // any invariant breach visible to tests, replays, and the agent interface.
    const activeConflicts = findFlightConflicts(this.config, this.state.flights);
    const activeObstacleConflicts = findObstacleConflicts(this.config, this.state.flights);
    if (activeConflicts.length || activeObstacleConflicts.length) {
      this.metrics.collisionAlerts += activeConflicts.length + activeObstacleConflicts.length;
      this.metrics.runwayIncursions += activeConflicts.filter((conflict) => conflict.type === 'runway-incursion').length;
      for (const conflict of activeConflicts) {
        const flight = this.state.flights.find((item) => item.id === Math.max(conflict.first, conflict.second));
        if (flight && !flight.safetyHold) {
          flight.safetyHold = true;
          flight.safetyHoldReason = conflict.detail;
          if (!wasSafetyHeld.has(flight.id)) this.events.push({ type: 'safety-hold', flight, runway: flight.runway, taxiway: flight.taxiway, detail: flight.safetyHoldReason });
        }
      }
      for (const conflict of activeObstacleConflicts) {
        const flight = this.state.flights.find((item) => item.id === conflict.flight);
        if (flight && !flight.safetyHold) {
          flight.safetyHold = true;
          flight.safetyHoldReason = conflict.detail;
          if (!wasSafetyHeld.has(flight.id)) this.events.push({ type: 'safety-hold', flight, runway: flight.runway, taxiway: flight.taxiway, detail: flight.safetyHoldReason });
        }
      }
    }
  }

  drainEvents(): AirportEvent[] {
    const result = this.events;
    this.events = [];
    return result;
  }

  queueSnapshot(state: AirportState = this.state): OperationQueueSnapshot {
    return buildOperationQueueSnapshot(this.config, state, {
      stationarySeconds: state === this.state ? this.stationarySeconds : undefined,
      runwayReservations: state === this.state ? this.runwayReservations : undefined,
      nextArrivalIn: state === this.state ? Math.max(0, this.spawnIn) : undefined,
      approachCapacity: this.weatherApproachCapacity(),
    });
  }

  operationProfileSnapshot(state: AirportState = this.state): {
    profile: AirportOperationProfile;
    current: AirportOperationState;
    trafficProgram: AirportConfig['trafficProgram'];
    density: ReturnType<typeof trafficDensityProfile>;
    flow: TrafficFlowSnapshot;
  } {
    const profile = this.config.operationProfile;
    const current = airportOperationStateAt(profile, state.elapsed);
    return {
      profile: {
        ...profile,
        periods: profile.periods.map((period) => ({ ...period, mix: { ...period.mix } })),
        sources: profile.sources.map((source) => ({ ...source })),
      },
      current: { ...current, mix: { ...current.mix } },
      trafficProgram: {
        ...this.config.trafficProgram,
        airlines: this.config.trafficProgram.airlines.map((airline) => ({
          ...airline,
          classWeights: { ...airline.classWeights },
          fleets: Object.fromEntries(Object.entries(airline.fleets).map(([trafficClass, fleet]) => [
            trafficClass,
            fleet?.map((candidate) => ({ ...candidate })),
          ])),
          bankMultipliers: Object.fromEntries(Object.entries(airline.bankMultipliers).map(([period, multipliers]) => [period, { ...multipliers }])),
          gate: {
            ...airline.gate,
            concourses: airline.gate.concourses ? [...airline.gate.concourses] : undefined,
            zoneNames: airline.gate.zoneNames ? [...airline.gate.zoneNames] : undefined,
            standSector: airline.gate.standSector ? [...airline.gate.standSector] : undefined,
          },
        })),
        markets: Object.fromEntries(Object.entries(this.config.trafficProgram.markets).map(([trafficClass, markets]) => [trafficClass, [...markets]])) as AirportConfig['trafficProgram']['markets'],
        recoveryPeriodIds: [...this.config.trafficProgram.recoveryPeriodIds],
        overnightCargoPeriodIds: [...this.config.trafficProgram.overnightCargoPeriodIds],
        sources: this.config.trafficProgram.sources.map((source) => ({ ...source })),
      },
      density: { ...trafficDensityProfile(state.trafficFlow.density), assumptions: [...trafficDensityProfile(state.trafficFlow.density).assumptions] },
      flow: trafficFlowSnapshot(state.trafficFlow, state.elapsed),
    };
  }

  diagnostics(): { flow: 'continuous'; approachCapacity: number; activeTrafficCap: number; nextArrivalIn: number; activeFlights: number; runwayReservations: Array<{ runway: number; flight: number }>; scenario: TrafficScenario; closedRunway: number | null; predictions: ConflictPrediction[]; collisions: ReturnType<typeof findFlightConflicts>; obstacleCollisions: ReturnType<typeof findObstacleConflicts>;
    serviceVehicleConflicts: ReturnType<typeof findServiceVehicleConflicts>;
    serviceVehicleRouteViolations: ReturnType<typeof serviceVehicleRouteViolations>;
    surfaceDisruptions: SurfaceDisruptionState[];
    queues: OperationQueueSnapshot;
    trafficManagement: TrafficFlowSnapshot;
    deicing: { facilities: ReturnType<typeof deicingFacilities>; required: number; queued: number; treating: number; protected: number; expired: number };
    separation: { ruleset: ReturnType<typeof separationRuleset>; requiredRadarNm: number; coordinateBasis: string; runwayHistory: RunwayOperationRecord[]; violations: ReturnType<AirportSimulation['airborneSeparationViolations']> };
    collisionEnvelopes: { aircraft: ReturnType<typeof aircraftCollisionEnvelope>[]; obstacles: AirportConfig['obstacles'] }; metrics: ShiftMetrics; surfaceGraph: SurfaceGraphValidation; obstacleEnvelopes: AirportObstacleValidation } {
    return {
      flow: 'continuous',
      approachCapacity: this.weatherApproachCapacity(),
      activeTrafficCap: this.effectiveTrafficCap(),
      nextArrivalIn: Number(Math.max(0, this.spawnIn).toFixed(2)),
      activeFlights: this.state.flights.length,
      runwayReservations: [...this.runwayReservations].map(([runway, flight]) => ({ runway, flight })),
      scenario: this.state.scenario,
      closedRunway: this.closedRunway,
      predictions: this.conflictPredictions(),
      collisions: findFlightConflicts(this.config, this.state.flights),
      obstacleCollisions: findObstacleConflicts(this.config, this.state.flights),
      serviceVehicleConflicts: findServiceVehicleConflicts(this.config, this.state.serviceVehicles, this.state.flights),
      serviceVehicleRouteViolations: serviceVehicleRouteViolations(this.config.surfaceGraph, this.state.serviceVehicles),
      surfaceDisruptions: this.state.surfaceDisruptions.map((disruption) => ({
        ...disruption,
        edgeIds: [...disruption.edgeIds],
        reroutedFlightIds: [...disruption.reroutedFlightIds],
      })),
      queues: this.queueSnapshot(),
      trafficManagement: this.trafficFlowSnapshot(),
      deicing: {
        facilities: deicingFacilities(this.config.surfaceGraph),
        required: this.state.flights.filter((flight) => flight.deicing.required).length,
        queued: this.state.flights.filter((flight) => flight.deicing.status === 'queued').length,
        treating: this.state.flights.filter((flight) => flight.deicing.status === 'treating').length,
        protected: this.state.flights.filter((flight) => flight.deicing.status === 'protected').length,
        expired: this.state.flights.filter((flight) => flight.deicing.status === 'expired').length,
      },
      separation: {
        ruleset: separationRuleset(this.state.separationRuleset),
        requiredRadarNm: requiredRadarSeparationNm(separationRuleset(this.state.separationRuleset), this.state.weather),
        coordinateBasis: `${WORLD_METERS_PER_UNIT} horizontal metres per airport-world unit; vertical controller values in feet`,
        runwayHistory: this.runwayOperationHistory.map((operation) => ({ ...operation })),
        violations: this.airborneSeparationViolations(),
      },
      collisionEnvelopes: {
        aircraft: this.state.flights.map((flight) => aircraftCollisionEnvelope(this.config, flight)),
        obstacles: this.config.obstacles.map((obstacle) => ({ ...obstacle })),
      },
      metrics: this.shiftMetrics(),
      surfaceGraph: this.surfaceGraphValidation,
      obstacleEnvelopes: this.obstacleEnvelopeValidation,
    };
  }

  trafficFlowSnapshot(state: AirportState = this.state): TrafficFlowSnapshot {
    return trafficFlowSnapshot(state.trafficFlow, state.elapsed);
  }

  private updateTrafficFlow(): void {
    const flow = this.state.trafficFlow;
    const density = trafficDensityProfile(flow.density);
    const now = this.state.elapsed;

    if (now + 1e-6 >= flow.nextArrivalDemandSeconds) {
      const demand = enqueueArrivalDemand(
        flow,
        now,
        `${density.label} demand · ${airportOperationStateAt(this.config.operationProfile, now).periodLabel}`,
      );
      if (demand.status === 'diverted') this.metrics.diversions += 1;
      scheduleNextArrivalDemand(flow, now, this.arrivalDemandInterval());
    }

    for (const flight of this.state.flights) {
      const departureCandidate = (
        (flight.phase === 'resting' && flight.turnaround.status === 'ready')
        || flight.phase === 'taxi-out'
        || flight.phase === 'takeoff'
      );
      if (!departureCandidate) continue;
      if (flight.flightPlan.direction !== 'departure' || flight.flightPlan.status === 'cancelled') {
        this.prepareDepartureFlightPlan(flight);
      }
      registerDepartureDemand(
        flow,
        flight,
        now,
        flight.flightPlan.scheduledReleaseSeconds,
        this.departureSlotSpacing(),
      );
    }

    const expired = expireTrafficFlow(flow, now);
    this.metrics.diversions += expired.diverted.length;
    this.metrics.cancellations += expired.cancelled.length;
    for (const entry of expired.cancelled) {
      const flight = entry.flightId === undefined ? undefined : this.state.flights.find((candidate) => candidate.id === entry.flightId);
      if (!flight) continue;
      setFlightPlanStatus(flight.flightPlan, 'cancelled', now, entry.reason);
      this.archiveFlightPlan(flight);
      this.prepareDepartureFlightPlan(flight, now + density.recoveryDelaySeconds, true);
      flight.pushbackCleared = false;
      flight.controlHold = false;
      flight.automaticHold = false;
    }

    const arrival = flow.arrivalQueue[0];
    if (arrival && now + 1e-6 >= Math.max(arrival.releaseSlotSeconds, flow.nextArrivalReleaseSeconds)) {
      const activeApproaches = this.state.flights.filter((flight) => flight.phase === 'approach' || flight.phase === 'landing').length;
      if (activeApproaches >= this.weatherApproachCapacity()) {
        markArrivalHolding(flow, arrival, now, `${activeApproaches}/${this.weatherApproachCapacity()} approach positions occupied`);
      } else if (this.state.flights.length >= this.effectiveTrafficCap()) {
        markArrivalHolding(flow, arrival, now, `${this.state.flights.length}/${this.effectiveTrafficCap()} active-aircraft budget occupied`);
      } else {
        const spawnedAircraft = this.spawnFlight();
        const flight = spawnedAircraft ? this.state.flights.find((candidate) => candidate.id === this.nextId - 1) : undefined;
        if (flight && spawnedAircraft) releaseArrivalDemand(flow, arrival, now, flight, this.arrivalSpacing(aircraftProfile(spawnedAircraft)));
        else markArrivalHolding(flow, arrival, now, this.lastArrivalAdmissionReason);
      }
    }

    refreshTrafficFlow(flow, now);
    this.spawnIn = Math.max(0, flow.nextArrivalDemandSeconds - now);
    this.taxiOutReleaseIn = Math.max(0, flow.nextDepartureReleaseSeconds - now);
  }

  private arrivalDemandInterval(): number {
    const operation = airportOperationStateAt(this.config.operationProfile, this.state.elapsed);
    const density = trafficDensityProfile(this.state.trafficFlow.density);
    const base = this.config.scope === 'center'
      ? Math.max(4.8, this.config.trafficInterval * 0.68)
      : Math.max(6.2, this.config.trafficInterval * 0.9);
    const scenarioMultiplier = this.state.scenario === 'training'
      ? 2.4
      : this.state.scenario === 'emergency'
        ? 1.45
        : this.state.scenario === 'storm'
          ? 1.08
          : 1;
    return Math.max(0.8, base * operation.arrivalIntervalMultiplier * scenarioMultiplier / density.demandMultiplier);
  }

  private departureSlotSpacing(): number {
    const density = trafficDensityProfile(this.state.trafficFlow.density);
    const operation = airportOperationStateAt(this.config.operationProfile, this.state.elapsed);
    const base = this.config.scope === 'center' ? 6.2 : 9;
    const rules = separationRuleset(this.state.separationRuleset);
    const departureRunways = Math.max(1, this.config.runways.filter((runway) => {
      const role = this.runwayRole(runway.id);
      return role === 'departure' || role === 'mixed';
    }).length);
    const physicalRelease = rules.runwayBaseSeconds.departure / departureRunways;
    return Math.max(2.8, physicalRelease, base * Math.max(0.68, operation.departureReadinessMultiplier) / density.departureCapacityMultiplier);
  }

  private effectiveTrafficCap(): number {
    const density = trafficDensityProfile(this.state.trafficFlow.density);
    const scaled = Math.max(3, Math.round(this.config.trafficCap * density.activeTrafficMultiplier));
    return this.state.scenario === 'training' ? Math.min(4, scaled) : scaled;
  }

  private prepareDepartureFlightPlan(
    flight: Flight,
    notBeforeSeconds = this.state.elapsed,
    force = false,
    requestedRunway?: number,
  ): void {
    const assignment = flight.gateAssignment;
    if (!assignment) return;
    if (!force && flight.flightPlan.direction === 'departure' && flight.flightPlan.status !== 'cancelled') return;
    if (!flight.flightPlanHistory.some((plan) => plan.id === flight.flightPlan.id)) {
      if (flight.flightPlan.status !== 'cancelled') flight.flightPlan.status = 'completed';
      this.archiveFlightPlan(flight);
    }
    const state = airportOperationStateAt(this.config.operationProfile, this.state.elapsed);
    const selection = selectTrafficProgram(this.config.trafficProgram, {
      trafficClass: flight.operationPlan.trafficClass,
      direction: 'departure',
      periodId: state.periodId,
      flightId: flight.id + flight.flightPlanHistory.length * 10_000,
      airportSeed: this.config.seed,
      supportsAircraft: (model) => this.hasUsableRunwayPair(model),
    });
    const runway = requestedRunway ?? this.selectDepartureRunway(flight) ?? flight.departureRunway;
    const selectedProcedure = this.terminalProcedure('SID', runway, flight.id + flight.flightPlanHistory.length * 101);
    const procedure = selectedProcedure.procedure.name;
    const origin = this.config.code === 'LOCAL' ? 'LOCAL' : this.config.code;
    const destination = assignment.nextDestination || selection.market;
    if (
      flight.fuelPlan.departure.origin !== origin
      || flight.fuelPlan.departure.destination !== destination
    ) {
      flight.fuelPlan = replaceDepartureFuelPlan(flight.fuelPlan, {
        origin,
        destination,
        trafficClass: flight.operationPlan.trafficClass,
        flightId: flight.id + flight.flightPlanHistory.length * 10_000,
        airportSeed: this.config.seed,
      });
      if (flight.turnaround.status === 'planned') {
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
        });
        scheduleTurnaround(flight.turnaround, scheduledGateInSeconds);
      }
    }
    const release = Math.max(notBeforeSeconds, assignment.scheduledDepartureSeconds);
    flight.flightPlan = createFlightPlan({
      flightId: flight.id,
      legNumber: this.nextFlightPlanLegNumber(flight),
      direction: 'departure',
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
      estimatedArrivalSeconds: release + this.phaseDuration(flight.aircraft, 'takeoff', runway) + 180,
      airportSeed: this.config.seed,
    });
    flight.origin = origin;
    flight.destination = destination;
    flight.procedure = procedure;
    flight.navigation = this.navigationFor(selectedProcedure, 'departure');
    flight.departureRunway = runway;
    flight.operationPlan = this.createOperationPlan('departure', flight.operationPlan.trafficClass, state);
    flight.flightNumber = 100 + ((flight.id * 37 + flight.flightPlanHistory.length * 101 + Math.abs(this.config.seed)) % 890);
    flight.callsign = `${airlineProfile(flight.airline).callsign} ${flight.flightNumber}`;
    assignment.nextDestination = destination;
    assignment.departureRunway = runway;
  }

  private archiveFlightPlan(flight: Flight): void {
    if (!flight.flightPlanHistory.some((plan) => plan.id === flight.flightPlan.id)) {
      flight.flightPlanHistory.push(cloneFlightPlan(flight.flightPlan));
    }
    if (flight.flightPlanHistory.length > 24) {
      flight.flightPlanHistory.splice(0, flight.flightPlanHistory.length - 24);
    }
  }

  private nextFlightPlanLegNumber(flight: Flight): number {
    const plans = [...flight.flightPlanHistory, flight.flightPlan];
    return plans.reduce((highest, plan) => {
      const leg = Number(plan.id.match(/-(\d+)$/)?.[1]);
      return Number.isFinite(leg) ? Math.max(highest, leg) : highest;
    }, 0) + 1;
  }

  private departureReleaseReady(flight: Flight): boolean {
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
      .map((candidate) => candidate.flightId === undefined
        ? undefined
        : this.state.flights.find((flightCandidate) => flightCandidate.id === candidate.flightId))
      .find((candidate) => candidate?.phase === 'taxi-out' && candidate.progress >= 0.9);
    if (first !== entry && runwayReadyPredecessor) {
      flight.automaticHold = true;
      flight.automaticHoldReason = `departure release queue ${entryIndex + 1}/${flow.departureQueue.length} behind ${runwayReadyPredecessor.callsign}`;
      return false;
    }
    if (this.state.elapsed + 1e-6 < entry.releaseSlotSeconds || this.state.elapsed + 1e-6 < flow.nextDepartureReleaseSeconds) {
      flight.automaticHold = true;
      flight.automaticHoldReason = `departure slot in ${Math.ceil(Math.max(entry.releaseSlotSeconds, flow.nextDepartureReleaseSeconds) - this.state.elapsed)} seconds`;
      return false;
    }
    if (entryIndex > 0) {
      amendFlightPlan(
        flight.flightPlan,
        'slot-change',
        this.state.elapsed,
        `runway-ready departure advanced from release position ${entryIndex + 1} while earlier flights remained upstream`,
      );
    }
    releaseDepartureDemand(flow, entry, this.state.elapsed, this.departureSlotSpacing());
    flight.flightPlan.status = 'active';
    flight.automaticHold = false;
    flight.automaticHoldReason = undefined;
    return true;
  }

  private seedInitialTraffic(): void {
    const baseTarget = this.config.scope === 'center'
      ? Math.min(8, Math.max(5, Math.floor(this.config.surfaceGraph.stands.length / 2)))
      : 1;
    const target = Math.min(
      this.effectiveTrafficCap(),
      Math.max(1, Math.round(baseTarget * Math.min(1.45, trafficDensityProfile(this.state.trafficFlow.density).activeTrafficMultiplier))),
    );
    const departureRunways = this.config.runways.filter((runway) => {
      const role = this.runwayRole(runway.id);
      return role === 'departure' || role === 'mixed';
    });
    if (!departureRunways.length) return;
    const operationState = airportOperationStateAt(this.config.operationProfile, this.state.elapsed);
    const requestedDepartures = Math.max(1, Math.round(target * operationState.mix.departureShare));
    const departureTarget = Math.min(target, departureRunways.length, requestedDepartures);
    const liveTurnAtStartup = this.config.code === 'ORD' && departureTarget >= 3;
    for (let index = 0; index < target; index += 1) {
      const aircraft = this.spawnFlight();
      if (!aircraft) break;
      const flight = this.state.flights[this.state.flights.length - 1];
      if (index >= departureTarget) {
        syncFlightMotion(this.config, flight);
        continue;
      }
      const compatible = departureRunways.filter((runway) => runwaySupportsAircraft(runway, aircraft, 'takeoff'));
      if (!flight || !compatible.length) continue;
      const runway = compatible[index % compatible.length];
      // Start one departure taxiing and one push-ready. ORD also receives one
      // live turn, preserving immediate ramp-service activity without making
      // smaller hub schematics reuse an occupied stand.
      const taxiing = index === 0;
      const servicing = liveTurnAtStartup && index === 2;
      flight.runway = runway.id;
      flight.departureRunway = runway.id;
      flight.operatingEnd = this.preferredOperatingEnd(runway.id);
      flight.runwayExit = undefined;
      flight.palette = runway.color;
      flight.phase = taxiing ? 'taxi-out' : 'resting';
      flight.progress = 0;
      flight.phaseElapsed = 0;
      flight.cleared = true;
      flight.clearanceLeft = 99;
      this.prepareDepartureFlightPlan(flight, taxiing ? this.state.elapsed : this.state.elapsed + 8, true, runway.id);
      flight.kinematics.fuelPercent = flight.turnaround.targetFuelPercent;
      flight.kinematics.altitudeFt = 0;
      flight.kinematics.airspeedKts = 0;
      flight.kinematics.groundSpeedKts = 0;
      flight.runwayEntryCleared = false;
      flight.takeoffCleared = false;
      flight.pushbackCleared = taxiing;
      flight.pushbackProgress = taxiing ? 1 : 0;
      flight.tugAttached = false;
      flight.engineState = taxiing ? 'running' : 'off';
      flight.holdShortRunway = taxiing ? runway.id : undefined;
      if (!taxiing) {
        const gateReady = this.ensureArrivalGate(flight);
        const standAlreadyOccupied = this.state.flights.some((candidate) => (
          candidate.id !== flight.id
          && candidate.standId === flight.standId
          && (candidate.phase === 'taxi-in' || candidate.phase === 'resting' || (candidate.phase === 'taxi-out' && (candidate.tugAttached || candidate.pushbackProgress < 1)))
        ));
        if (!gateReady || standAlreadyOccupied) {
          this.state.flights = this.state.flights.filter((candidate) => candidate.id !== flight.id);
          this.events = this.events.filter((event) => event.flight.id !== flight.id);
          continue;
        }
      }
      this.assignSurfaceRoute(flight, flight.phase);
      if (taxiing) {
        completeTurnaround(flight.turnaround, this.state.elapsed);
        releaseTurnaround(flight.turnaround, this.state.elapsed);
        flight.requiredCrossings = surfaceRouteRunwayCrossings(this.config.surfaceGraph, flight.surfaceRouteEdges, flight.runway);
        flight.crossingClearances = [];
        flight.crossingClearanceIds = [];
        const desired = this.config.scope === 'center' ? 0.8 - index * 0.08 : 0.62 - index * 0.08;
        const safeProgress = [desired, desired - 0.08, 0.64, 0.52, 0.4, 0.28, 0.16, 0.08, 0]
          .find((progress) => {
            flight.progress = progress;
            syncFlightMotion(this.config, flight);
            return findObstacleConflicts(this.config, [flight]).length === 0
              && findFlightConflicts(this.config, this.state.flights).length === 0;
          }) ?? 0;
        flight.progress = safeProgress;
        const completedCrossings = surfaceRouteCrossingWindows(
          this.config.surfaceGraph,
          flight.surfaceRoute,
          safeProgress,
          flight.runway,
          flight.surfaceRouteEdges,
        ).filter((crossing) => crossing.exitProgress < safeProgress);
        flight.crossingClearanceIds = completedCrossings.map((crossing) => crossing.id);
        flight.crossingClearances = [...new Set(completedCrossings.map((crossing) => crossing.runwayId))];
        flight.phaseElapsed = flight.duration * flight.progress;
        flight.pushbackProgress = Math.max(0, Math.min(1, flight.progress / Math.max(0.001, flight.pushbackReleaseProgress)));
        flight.tugAttached = flight.pushbackProgress < 1;
        flight.engineState = flight.pushbackProgress < 0.62 ? 'starting' : 'running';
        if (flight.gateAssignment && flight.pushbackProgress >= 1) {
          flight.gateAssignment.actualGateInSeconds ??= flight.turnaround.actualStartSeconds ?? 0;
          flight.gateAssignment.scheduledGateInSeconds = flight.gateAssignment.actualGateInSeconds;
          flight.gateAssignment.actualGateOutSeconds = this.state.elapsed;
          flight.gateAssignment.scheduledDepartureSeconds = this.state.elapsed;
        }
        this.updateSurfaceRouteState(flight);
      } else if (servicing) {
        this.confirmGateArrival(flight);
      } else {
        completeTurnaround(flight.turnaround, this.state.elapsed);
        flight.progress = 1;
        flight.phaseElapsed = flight.duration;
        if (flight.gateAssignment) {
          flight.gateAssignment.actualGateInSeconds = flight.turnaround.actualStartSeconds ?? this.state.elapsed - flight.duration;
          flight.gateAssignment.scheduledGateInSeconds = flight.gateAssignment.actualGateInSeconds;
          flight.gateAssignment.scheduledDepartureSeconds = this.state.elapsed + 8;
        }
      }
      syncFlightMotion(this.config, flight);
      this.events = this.events.filter((event) => !(event.flight.id === flight.id && event.type === 'auto-clear'));
    }
  }

  private spawnFlight(): AircraftModel | null {
    if (this.state.runwayConfigurationTransition) {
      this.lastArrivalAdmissionReason = `runway plan transition is draining ${this.state.runwayConfigurationTransition.blockingFlightIds.length} protected flight${this.state.runwayConfigurationTransition.blockingFlightIds.length === 1 ? '' : 's'}`;
      return null;
    }
    const approachLimit = this.weatherApproachCapacity();
    if (this.state.flights.filter((flight) => flight.phase === 'approach' || flight.phase === 'landing').length >= approachLimit) {
      this.lastArrivalAdmissionReason = `${approachLimit} approach position${approachLimit === 1 ? '' : 's'} occupied`;
      return null;
    }
    const id = this.nextId;
    const operationState = airportOperationStateAt(this.config.operationProfile, this.state.elapsed);
    const trafficClass = selectOperationTrafficClass(operationState, id, this.config.seed);
    const trafficSelection = selectTrafficProgram(this.config.trafficProgram, {
      trafficClass,
      direction: 'arrival',
      periodId: operationState.periodId,
      flightId: id,
      airportSeed: this.config.seed,
      supportsAircraft: (model) => this.hasUsableRunwayPair(model),
    });
    const airlineCode = trafficSelection.airline;
    const aircraft = trafficSelection.aircraft;
    const arrivalRunways = this.config.runways.filter((runway) => (
      (this.runwayRole(runway.id) === 'arrival' || this.runwayRole(runway.id) === 'mixed')
      && !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id)
      && runwaySupportsAircraft(runway, aircraft, 'landing')
    ));
    const unblocked = arrivalRunways.filter((runway) => !this.arrivalBlocked(runway.id));
    const releaseReasons = new Map<number, string | null>(unblocked.map((runway) => [
      runway.id,
      runwayReleaseReason(
        separationRuleset(this.state.separationRuleset),
        this.config,
        this.runwayOperationHistory,
        this.state.elapsed,
        { runwayId: runway.id, operatingEnd: this.preferredOperatingEnd(runway.id), kind: 'arrival', wakeClass: aircraftProfile(aircraft).wakeClass },
      ),
    ]));
    const released = unblocked.filter((runway) => !releaseReasons.get(runway.id));
    const usable = released.filter((runway) => this.headwindComponent(runway.id) >= -5);
    const candidates = (usable.length ? usable : released).sort((first, second) => this.headwindComponent(second.id) - this.headwindComponent(first.id));
    if (candidates.length === 0) {
      const spacing = [...releaseReasons.values()].find((reason): reason is string => Boolean(reason));
      this.lastArrivalAdmissionReason = spacing ?? 'no wind-compatible arrival runway is available';
      return null;
    }

    const runway = candidates[0].id;
    const runwayConfig = this.config.runways[runway];
    const departureRunways = this.config.runways.filter((item) => (
      (this.runwayRole(item.id) === 'departure' || this.runwayRole(item.id) === 'mixed')
      && !runwayClosedByDisruption(this.state.surfaceDisruptions, item.id)
      && runwaySupportsAircraft(item, aircraft, 'takeoff')
    ));
    if (departureRunways.length === 0) {
      this.lastArrivalAdmissionReason = `${aircraft} has no compatible onward departure runway`;
      return null;
    }
    const departureRunway = [...departureRunways].sort((first, second) => this.headwindComponent(second.id) - this.headwindComponent(first.id))[(id - 1) % departureRunways.length].id;
    const airline = airlineProfile(airlineCode);
    const profile = aircraftProfile(aircraft);
    const flightNumber = 100 + ((id * 37 + Math.abs(this.config.seed)) % 890);
    const registration = this.registrationFor(airlineCode, id);
    const service = airline.cargo || profile.category === 'cargo' ? 'cargo' : 'passenger';
    const approachDuration = this.phaseDuration(aircraft, 'approach', runway);
    const operatingEnd = this.preferredOperatingEnd(runway);
    const departureSelection = selectTrafficProgram(this.config.trafficProgram, {
      trafficClass,
      direction: 'departure',
      periodId: operationState.periodId,
      flightId: id + 5_000,
      airportSeed: this.config.seed,
      supportsAircraft: (model) => this.hasUsableRunwayPair(model),
    });
    const origin = trafficSelection.market;
    const nextDestination = departureSelection.market;
    const fuelPlan = createFlightFuelPlan({
      aircraft,
      arrivalOrigin: origin,
      airportCode: this.config.code === 'LOCAL' ? 'LOCAL' : this.config.code,
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
      readyForTaxiAtSeconds: this.state.elapsed + approachDuration + this.phaseDuration(aircraft, 'landing', runway),
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
    const stand = this.config.surfaceGraph.stands.find((candidate) => candidate.id === gateAssignment.standId);
    const operationPlan = this.createOperationPlan('arrival', trafficClass, operationState);
    const selectedProcedure = this.terminalProcedure('STAR', runway, id);
    const procedure = selectedProcedure.procedure.name;
    const flightPlan = createFlightPlan({
      flightId: id,
      legNumber: 1,
      direction: 'arrival',
      origin,
      destination: this.config.code === 'LOCAL' ? 'LOCAL' : this.config.code,
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
      estimatedArrivalSeconds: this.state.elapsed + approachDuration + this.phaseDuration(aircraft, 'landing', runway),
      airportSeed: this.config.seed,
    });
    const flight: Flight = {
      id,
      callsign: `${airline.callsign} ${flightNumber}`,
      palette: runwayConfig.color,
      runway,
      departureRunway,
      operatingEnd,
      phase: 'approach',
      progress: 0,
      phaseElapsed: 0,
      duration: approachDuration,
      cleared: false,
      clearanceLeft: approachDuration * 0.96,
      gateSlot,
      gateAssignment,
      pushbackCleared: false,
      pushbackDirection: stand?.pushbackDirection ?? 'straight',
      pushbackProgress: 0,
      pushbackReleaseProgress: 0,
      tugAttached: false,
      engineState: 'running',
      aircraft,
      airline: airlineCode,
      flightNumber,
      registration,
      service,
      operationPlan,
      flightPlan,
      flightPlanHistory: [],
      navigation: this.navigationFor(selectedProcedure, 'arrival'),
      fuelPlan,
      turnaround,
      deicing: createDeicingState(),
      category: profile.category,
      wakeClass: profile.wakeClass,
      procedure,
      origin,
      destination: this.config.code === 'LOCAL' ? 'LOCAL' : this.config.code,
      squawk: String(4300 + (id * 37) % 700).padStart(4, '0'),
      kinematics: {
        airspeedKts: profile.approachKts + 24,
        groundSpeedKts: profile.approachKts + 24,
        altitudeFt: this.approachStartAltitude(aircraft),
        verticalSpeedFpm: -profile.descentFpm,
        accelerationMps2: 0,
        fuelPercent: initialFuelPercent,
      },
      motion: {
        x: 0, y: 0, z: 2, heading: 0, pitch: 0, bank: 0,
        onGround: false, groundBlend: 0, protectedRunway: false,
        distanceAlongM: 0, totalDistanceM: 0, stageProgress: 0,
      },
    };
    flight.standId = gateAssignment.standId;
    if (!this.planRunwayExit(flight, 'initial arrival plan', false)) {
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
    const pathBlocker = this.arrivalPathBlocker(flight);
    if (pathBlocker) {
      this.lastArrivalAdmissionReason = `protected arrival sweep occupied by ${pathBlocker.callsign}`;
      return null;
    }

    if (this.state.scenario === 'emergency' && id === 1) flight.emergency = 'medical';

    this.nextId += 1;
    this.lastArrivalAdmissionReason = `${flight.callsign} admitted to ${this.activeRunwayDesignation(runway)}`;
    this.state.flights.push(flight);
    this.events.push({ type: 'spawn', flight });
    this.events.push({
      type: 'gate-assignment',
      flight,
      detail: `${gateAssignment.gateRef ?? gateAssignment.zoneName ?? gateAssignment.standId} planned · ${gateAssignment.rationale.slice(0, 2).join(' · ')}`,
    });
    this.events.push({
      type: 'runway-exit-plan',
      flight,
      runway: flight.runway,
      taxiway: flight.runwayExit?.taxiwayName,
      detail: this.runwayExitDetail(flight.runwayExit, 'initial arrival plan'),
    });
    if (flight.emergency) this.events.push({ type: 'emergency', flight });
    return aircraft;
  }

  private advance(flight: Flight): void {
    if (flight.phase === 'approach' && flight.diversion) {
      for (const [runway, owner] of this.runwayReservations) {
        if (owner === flight.id) this.runwayReservations.delete(runway);
      }
      this.archiveFlightPlan(flight);
      this.events.push({ type: 'divert', flight, detail: `${flight.callsign} left terminal scope for ${flight.diversion.airportCode}` });
      this.state.flights = this.state.flights.filter((item) => item !== flight);
      this.state.serviceVehicles = this.state.serviceVehicles.filter((vehicle) => vehicle.flightId !== flight.id);
      this.stationarySeconds.delete(flight.id);
      return;
    }
    if (flight.phase === 'approach' && flight.navigation.hold) {
      if (this.state.elapsed + 1e-6 < flight.navigation.hold.expectFurtherClearanceAtSeconds) {
        flight.navigation.hold.cycle += 1;
        flight.progress = 0;
        flight.phaseElapsed = 0;
        syncFlightMotion(this.config, flight);
      } else {
        this.releaseHoldToArrival(flight, 'expect-further-clearance time reached; rejoin arrival sequence');
      }
      return;
    }
    if (flight.phase === 'approach' && flight.goAround) {
      flight.goAround = undefined;
      flight.progress = 0;
      flight.phaseElapsed = 0;
      flight.duration = this.phaseDuration(flight.aircraft, 'approach', flight.runway);
      flight.cleared = false;
      flight.navigation.approachCleared = this.stationRunsAutomatically('approach');
      flight.clearanceLeft = flight.duration * 0.96;
      syncFlightMotion(this.config, flight);
      flight.kinematics.altitudeFt = this.motionAltitudeFt(flight);
      return;
    }
    if (flight.phase === 'takeoff') {
      for (const [runway, owner] of this.runwayReservations) {
        if (owner === flight.id) this.runwayReservations.delete(runway);
      }
      this.state.departures += 1;
      this.metrics.safeDepartures += 1;
      flight.flightPlan.status = 'completed';
      this.archiveFlightPlan(flight);
      removeDepartureDemand(this.state.trafficFlow, flight.id);
      this.events.push({ type: 'depart', flight });
      this.state.flights = this.state.flights.filter((item) => item !== flight);
      this.state.serviceVehicles = this.state.serviceVehicles.filter((vehicle) => vehicle.flightId !== flight.id);
      this.stationarySeconds.delete(flight.id);
      return;
    }

    if (flight.phase === 'resting' && !flight.pushbackCleared) {
      if (!this.stationRunsAutomatically('ramp')) return;
      if (serviceVehiclesBlockingPushback(this.state.serviceVehicles, flight.id).length) return;
      if (winterDeicingRequired(this.state.weather) && flight.deicing.status === 'unavailable') return;
      this.grantPushbackClearance(flight, true);
    }

    const next = NEXT_PHASE[flight.phase];
    if (!next) return;
    if (next === 'landing' && !this.planRunwayExit(flight, 'final approach refresh')) {
      this.goAround(flight, 'no safe runway exit is available for the current braking action');
      return;
    }
    if (next === 'taxi-out') {
      if (this.state.runwayConfigurationTransition) return;
      this.prepareDepartureFlightPlan(flight);
      const departureRunway = this.selectDepartureRunway(flight);
      if (departureRunway === null) return;
      const departureProcedure = this.terminalProcedure('SID', departureRunway, flight.id + flight.flightPlanHistory.length * 101);
      if (flight.flightPlan.runwayIntent.runwayId !== departureRunway) {
        const detail = `runway ${flight.flightPlan.runwayIntent.designation} → ${this.activeRunwayDesignation(departureRunway)} for current configuration and wind`;
        amendFlightPlan(flight.flightPlan, 'runway-change', this.state.elapsed, detail, {
          procedureSelection: departureProcedure,
          procedureDataVersion: this.config.airspaceProgram.dataVersion,
          runwayIntent: {
            runwayId: departureRunway,
            operatingEnd: this.preferredOperatingEnd(departureRunway),
            designation: this.activeRunwayDesignation(departureRunway),
          },
        });
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
      flight.origin = this.config.code === 'LOCAL' ? 'LOCAL' : this.config.code;
      flight.destination = flight.flightPlan.destination;
      flight.procedure = departureProcedure.procedure.name;
      flight.navigation = this.navigationFor(departureProcedure, 'departure');
      flight.operationPlan = this.createOperationPlan('departure', flight.operationPlan.trafficClass);
      if (flight.gateAssignment) flight.gateAssignment.departureRunway = departureRunway;
    }
    if (next === 'takeoff') {
      // Holdover expiry is an aircraft state transition, not a runway-capacity
      // decision. Start the return-to-pad cycle immediately even when wake,
      // configuration, or runway-spacing rules are still withholding release;
      // otherwise an expired aircraft can remain parked at the hold-short line
      // forever behind an unrelated departure gate.
      if (!deicingReleaseValid(flight, this.state.weather, this.state.elapsed)) {
        if (flight.deicing.status === 'expired') this.returnForDeicing(flight);
        return;
      }
      if (!this.departureReleaseReady(flight)) return;
      if (!flight.holdNotified) {
        flight.holdNotified = true;
        this.events.push({ type: 'hold-short', flight, runway: flight.runway, taxiway: flight.taxiway });
      }
      if (this.stationRunsAutomatically('tower')) {
        if (!flight.runwayEntryCleared) {
          flight.runwayEntryCleared = true;
          this.events.push({ type: 'runway-entry', flight, runway: flight.runway, taxiway: flight.taxiway });
        }
        if (!flight.takeoffCleared) {
          flight.takeoffCleared = true;
          this.events.push({ type: 'takeoff-clearance', flight, runway: flight.runway });
        }
      }
      const crossingClear = !this.nextUnclearedCrossing(flight);
      if (!flight.runwayEntryCleared || !crossingClear || !this.reserveDeparture(flight)) return;
    }
    if (next === 'taxi-in' && !this.ensureArrivalGate(flight)) {
      flight.safetyHold = true;
      flight.safetyHoldReason = 'no conflict-free stand is available for taxi-in';
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
    flight.controlPattern = undefined;
    flight.controlPatternStart = undefined;
    flight.duration = this.phaseDuration(flight.aircraft, next, flight.runway, flight.runwayExit);
    if (next === 'taxi-in' || next === 'resting' || next === 'taxi-out') {
      this.assignSurfaceRoute(flight, next);
      if (next === 'taxi-out') flight.requiredCrossings = surfaceRouteRunwayCrossings(this.config.surfaceGraph, flight.surfaceRouteEdges, flight.runway);
    }

    if (next === 'taxi-in') {
      this.prepareServiceVehicles(
        flight,
        flight.gateAssignment?.scheduledGateInSeconds ?? this.state.elapsed + flight.duration,
        true,
      );
      flight.pushbackCleared = false;
      flight.pushbackProgress = 0;
      flight.tugAttached = false;
      flight.engineState = 'running';
    }
    if (next === 'resting') {
      flight.pushbackCleared = false;
      flight.pushbackProgress = 0;
      flight.tugAttached = false;
      flight.engineState = 'off';
      this.confirmGateArrival(flight);
      this.prepareDepartureFlightPlan(flight, flight.gateAssignment?.scheduledDepartureSeconds ?? this.state.elapsed);
    }
    if (next === 'taxi-out') {
      releaseTurnaround(flight.turnaround, this.state.elapsed);
      flight.pushbackProgress = 0;
      flight.tugAttached = true;
      flight.engineState = 'starting';
      this.events.push({ type: 'pushback-start', flight, taxiway: flight.taxiway, detail: `tug attached · push ${flight.pushbackDirection}` });
      this.events.push({ type: 'engine-start', flight, taxiway: flight.taxiway, detail: 'engine start during pushback' });
      if (flight.deicing.required) {
        this.events.push({
          type: 'deicing-planned',
          flight,
          taxiway: flight.taxiway,
          detail: flight.deicing.status === 'unavailable'
            ? flight.deicing.reason
            : `${flight.deicing.facilityName} lane ${flight.deicing.laneNumber} · ${flight.deicing.fluid}`,
        });
      }
    }

    if (next === 'taxi-in') {
      this.recordRunwayOperation(flight, 'arrival');
      this.state.arrivals += 1;
      this.metrics.safeArrivals += 1;
      this.events.push({ type: 'land', flight });
      this.events.push({ type: 'chime', flight });
    }
    if (next === 'takeoff') {
      if (flight.takeoffCleared) this.recordRunwayOperation(flight, 'departure');
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
    for (const reservedRunway of this.runwayReservations.keys()) {
      if (this.runwaysConflict(runway, reservedRunway)) return true;
    }
    for (const flight of this.state.flights) {
      if (flight.phase === 'resting' && flight.progress >= 0.7 && this.runwaysConflict(runway, flight.departureRunway)) return true;
      if (flight.phase === 'taxi-out' && flight.progress > 0.9 && this.runwaysConflict(runway, flight.runway)) return true;
      if (flight.phase === 'landing' && this.runwaysConflict(runway, flight.runway)) return true;
      if (flight.phase === 'taxi-in' && flight.progress < 0.3 && this.runwaysConflict(runway, flight.runway)) return true;
      if (flight.phase === 'approach' && this.runwaysConflict(runway, flight.runway)) {
        return true;
      }
    }
    return false;
  }

  private coordinateAutomaticRunwayCrossings(): void {
    if (!this.stationRunsAutomatically('ground')) return;
    const candidates = this.state.flights
      .filter((flight) => flight.phase === 'taxi-in' || flight.phase === 'taxi-out')
      .map((flight) => ({ flight, crossing: this.nextUnclearedCrossing(flight) }))
      .filter((item): item is { flight: Flight; crossing: SurfaceRouteCrossingWindow } => Boolean(item.crossing))
      .filter((item) => item.crossing.distanceToHold * WORLD_METERS_PER_UNIT <= CROSSING_CLEARANCE_RANGE_M)
      .sort((first, second) => first.crossing.distanceToHold - second.crossing.distanceToHold || first.flight.id - second.flight.id);
    for (const { flight, crossing } of candidates) {
      if (!this.runwayBlocker(crossing.runwayId, flight.id)) this.grantCrossingClearance(flight, crossing);
    }
  }

  private coordinateControllerStations(): void {
    for (const flight of this.state.flights) {
      let handoff = flight.navigation.handoff;
      if (handoff?.status === 'offered' && this.state.elapsed + 1e-6 >= handoff.responseDueSeconds) {
        this.markHandoffOverdue(flight, 'coordination response window expired');
        handoff = flight.navigation.handoff;
      }
      if (
        handoff
        && (handoff.status === 'offered' || handoff.status === 'overdue')
        && this.stationRunsAutomatically(handoff.to)
        && this.state.elapsed - handoff.offeredAtSeconds >= AUTOMATIC_HANDOFF_ACCEPT_SECONDS
      ) {
        this.acceptHandoffInternal(flight, handoff.to, 'automated receiving position accepted coordination');
        handoff = flight.navigation.handoff;
      }
      if (
        handoff?.status === 'accepted'
        && this.stationRunsAutomatically(handoff.from)
        && this.state.elapsed - (handoff.respondedAtSeconds ?? handoff.offeredAtSeconds) >= AUTOMATIC_HANDOFF_CONTACT_SECONDS
      ) {
        this.completeHandoff(flight, 'automated contact instruction');
        handoff = flight.navigation.handoff;
      }

      const required = requiredControllerStation(flight);
      const owner = flight.navigation.frequencyOwner;
      const ownerAhead = controllerStationIsAhead(flight, owner, required);
      const active = this.activeHandoff(flight);
      const terminalAt = handoff?.completedAtSeconds ?? handoff?.respondedAtSeconds ?? -Infinity;
      const retryReady = !handoff || this.state.elapsed - terminalAt >= AUTOMATIC_HANDOFF_RETRY_SECONDS;
      const suggested = suggestedHandoffStation(flight);
      if (!active && suggested && isOperationalControllerStation(owner) && this.stationRunsAutomatically(owner) && retryReady) {
        this.beginHandoff(flight, suggested, owner, 'automated controller coordination');
      } else if (
        !active
        && owner !== required
        && !ownerAhead
        && isOperationalControllerStation(owner)
        && retryReady
      ) {
        const target = nextControllerStation(flight, owner) ?? required;
        this.beginHandoff(flight, target, owner, `missed ${owner} → ${target} handoff at control boundary`, true);
      }

      if (flight.navigation.frequencyOwner !== required) continue;
      if (required === 'approach' && flight.phase === 'approach' && !flight.diversion && !flight.navigation.approachCleared) {
        flight.navigation.approachCleared = true;
        amendFlightPlan(flight.flightPlan, 'clearance', this.state.elapsed, 'automated approach clearance');
      }
      if (
        required === 'tower'
        && flight.phase === 'approach'
        && flight.navigation.approachCleared
        && !flight.cleared
        && !flight.goAround
        && !flight.diversion
      ) {
        flight.cleared = true;
        flight.clearanceLeft = 99;
        this.events.push({ type: 'auto-clear', flight, runway: flight.runway, detail: 'automated tower landing clearance' });
      }
    }
  }

  /**
   * Aircraft and service equipment share one ramp ledger. Auto/Watch also use
   * it for aircraft-to-aircraft sequencing; Manual retains controller traffic
   * authority while the safety layer still stops an aircraft from entering an
   * edge physically occupied by slower service equipment.
   */
  private coordinateAutomaticSurfaceTraffic(): void {
    const surfaceFlights = this.state.flights.filter((flight): flight is Flight & { phase: 'taxi-in' | 'taxi-out' } => (
      flight.phase === 'taxi-in' || flight.phase === 'taxi-out'
    ));
    const candidates = surfaceFlights
      .filter((flight) => flight.emergency !== 'disabled')
      .filter((flight) => flight.surfaceReroute?.status !== 'holding')
      .sort((first, second) => {
        if (Boolean(first.emergency) !== Boolean(second.emergency)) return first.emergency ? -1 : 1;
        // Preserve the winner of the previous collision-arbitration tick long
        // enough to clear a shared junction. Otherwise the graph ledger can
        // swap ownership back immediately and strand both aircraft nose to
        // nose at the merge.
        if (first.safetyHold !== second.safetyHold) return first.safetyHold ? 1 : -1;
        if (first.phase !== second.phase) {
          // Gate-bound traffic keeps priority until it is off the movement
          // area. Besides matching normal surface sequencing, this prevents a
          // departure from claiming a downstream merge in front of an
          // arrival that is already committed to the converging connector.
          return first.phase === 'taxi-in' ? -1 : 1;
        }
        if (first.progress !== second.progress) return second.progress - first.progress;
        return first.id - second.id;
      });
    const reservations = new SurfaceReservationLedger();
    const orderedVehicles = [...this.state.serviceVehicles].sort((first, second) => (
      serviceVehicleSurfacePriority(first) - serviceVehicleSurfacePriority(second)
      || second.progress - first.progress
      || serviceVehicleStandLaneOrder(this.config, first, second)
      || first.id.localeCompare(second.id)
    ));
    // Seed actual occupancy before evaluating lookahead. Owners can extend
    // their own claim, while nobody can plan through another current segment.
    for (const flight of surfaceFlights) {
      reservations.reserve(flight.id, surfaceRouteReservationClaims(this.config.surfaceGraph, flight.surfaceRoute, flight.surfaceRouteEdges, flight.progress, flight.phase, 0));
    }
    for (const vehicle of orderedVehicles) {
      reservations.reserve(serviceVehicleOwnerId(vehicle), serviceVehicleReservationClaims(this.config.surfaceGraph, vehicle, 0));
    }
    for (const flight of candidates) {
      const claims = surfaceRouteReservationClaims(
        this.config.surfaceGraph,
        flight.surfaceRoute,
        flight.surfaceRouteEdges,
        flight.progress,
        flight.phase,
        // Imported OSM centerlines often split one physical junction into
        // several short edges. Six local edges is still a compact reservation
        // but reaches the shared node early enough to avoid nose-to-nose
        // gridlock before the collision envelope becomes the final stop.
        6,
      );
      const conflict = reservations.firstConflictDetail(claims, flight.id);
      const vehicleConflict = typeof conflict?.ownerId === 'string' && conflict.ownerId.startsWith('vehicle:');
      const coordinationHold = this.surfaceHandoffHoldReason(flight);
      const reservationHold = vehicleConflict || (this.stationRunsAutomatically('ground') && Boolean(conflict));
      const shouldHold = Boolean(coordinationHold) || reservationHold;
      if (reservationHold && !flight.automaticHold) this.metrics.preventedConflicts += 1;
      flight.automaticHold = shouldHold;
      flight.automaticHoldReason = coordinationHold ?? (conflict ? this.surfaceReservationConflictReason(conflict.claim) : undefined);
      if (shouldHold) continue;
      reservations.reserve(flight.id, claims);
    }
    for (const flight of surfaceFlights.filter((item) => item.emergency === 'disabled')) {
      flight.automaticHold = true;
      flight.automaticHoldReason = 'disabled aircraft blocks surface movement';
    }
    for (const flight of surfaceFlights.filter((item) => item.surfaceReroute?.status === 'holding' && item.emergency !== 'disabled')) {
      flight.automaticHold = true;
      flight.automaticHoldReason = flight.surfaceReroute?.reason ?? 'surface route is unavailable';
    }
    for (const vehicle of orderedVehicles) {
      const wasHeld = vehicle.held;
      const claims = serviceVehicleReservationClaims(this.config.surfaceGraph, vehicle, 1);
      const conflict = reservations.firstConflictDetail(claims, serviceVehicleOwnerId(vehicle));
      vehicle.held = Boolean(conflict);
      vehicle.holdReason = conflict ? this.surfaceReservationConflictReason(conflict.claim) : undefined;
      if (!conflict) reservations.reserve(serviceVehicleOwnerId(vehicle), claims);
      const flight = this.state.flights.find((candidate) => candidate.id === vehicle.flightId);
      if (!flight || wasHeld === vehicle.held) continue;
      this.events.push({
        type: vehicle.held ? 'service-vehicle-hold' : 'service-vehicle-release',
        flight,
        taxiway: flight.taxiway,
        detail: vehicle.held ? `${vehicle.label} holding · ${vehicle.holdReason}` : `${vehicle.label} route released`,
        turnaroundService: vehicle.service,
        serviceVehicleId: vehicle.id,
        serviceVehicleType: vehicle.type,
        serviceVehicleStatus: vehicle.status,
      });
    }
  }

  private surfaceReservationConflictReason(claim: SurfaceReservationClaim): string {
    if (claim.kind === 'taxiway-flow') return `opposing traffic has one-way control of ${claim.label}`;
    if (claim.kind === 'alley') return `opposing traffic has one-way control of ${claim.label}`;
    if (claim.kind === 'ramp-zone') return `${claim.label} ramp-control zone is at capacity (${claim.capacity})`;
    if (claim.kind === 'stand') return `${claim.label} is occupied`;
    if (claim.kind === 'node') return `${claim.label} is reserved`;
    if (claim.kind === 'service-lane' || claim.kind === 'service-bay' || claim.kind === 'service-staging') return `${claim.label} is occupied`;
    return `opposing traffic occupies ${claim.label}`;
  }

  private gateReservations(excludedFlightId?: number): GateReservation[] {
    const now = this.state.elapsed;
    return this.state.flights.flatMap((flight): GateReservation[] => {
      const assignment = flight.gateAssignment;
      if (!assignment || flight.id === excludedFlightId || flight.phase === 'takeoff') return [];
      let startSeconds = assignment.scheduledGateInSeconds;
      let endSeconds = assignment.scheduledDepartureSeconds;
      if (flight.phase === 'approach' || flight.phase === 'landing') {
        // Future reservation remains on its planned window.
      } else if (flight.phase === 'taxi-in') {
        const remainingTaxi = Math.max(0, flight.duration * (1 - flight.progress));
        startSeconds = Math.min(startSeconds, now + remainingTaxi);
        endSeconds = Math.max(endSeconds, now + remainingTaxi + flight.turnaround.plannedDurationSeconds);
      } else if (flight.phase === 'resting') {
        const remainingTurn = Math.max(0, flight.duration * (1 - flight.progress));
        startSeconds = Math.min(startSeconds, assignment.actualGateInSeconds ?? now);
        endSeconds = Math.max(endSeconds, now + remainingTurn + (this.stationRunsAutomatically('ramp') ? 24 : 180));
      } else if (flight.phase === 'taxi-out') {
        if (!flight.tugAttached && flight.pushbackProgress >= 1) return [];
        startSeconds = now - GATE_TURN_BUFFER_SECONDS;
        endSeconds = now + Math.max(8, flight.duration * Math.max(0, flight.pushbackReleaseProgress - flight.progress));
      }
      return [{
        flightId: flight.id,
        standId: assignment.standId,
        aircraft: flight.aircraft,
        terminalId: assignment.terminalId,
        startSeconds,
        endSeconds,
      }];
    });
  }

  private ensureArrivalGate(flight: Flight): boolean {
    const assignment = flight.gateAssignment;
    const blocker = assignment
      ? this.state.flights.find((other) => (
          other.id !== flight.id
          && other.gateAssignment
          && standReservationsConflict(
            this.config,
            assignment.standId,
            flight.aircraft,
            other.gateAssignment.standId,
            other.aircraft,
          )
          && (
            other.phase === 'taxi-in'
            || other.phase === 'resting'
            || (other.phase === 'taxi-out' && (other.tugAttached || other.pushbackProgress < 1))
          )
        ))
      : undefined;
    if (assignment && !blocker) return true;
    const reason = blocker ? `${assignment?.gateRef ?? assignment?.zoneName ?? assignment?.standId} still occupied by ${blocker.callsign}` : 'arrival had no usable stand plan';
    return this.reassignArrivalGate(flight, reason);
  }

  private reassignArrivalGate(flight: Flight, reason: string): boolean {
    const previous = flight.gateAssignment;
    const nextDestination = previous?.nextDestination ?? this.originFor(flight.id + 5);
    const decision = planGateAssignment({
      config: this.config,
      flightId: flight.id,
      aircraft: flight.aircraft,
      airline: flight.airline,
      service: flight.service,
      trafficClass: flight.operationPlan.trafficClass,
      arrivalRunway: flight.runway,
      arrivalOperatingEnd: flight.operatingEnd,
      departureRunway: flight.departureRunway,
      departureOperatingEnd: this.preferredOperatingEnd(flight.departureRunway),
      readyForTaxiAtSeconds: this.gateReadyForTaxiAt(flight),
      turnaroundSeconds: flight.turnaround.plannedDurationSeconds,
      nextDestination,
      assignedAtSeconds: this.state.elapsed,
      reservations: this.gateReservations(flight.id),
      planning: this.surfaceRoutePlanning(flight.id),
      revision: (previous?.revision ?? -1) + 1,
      previousStandId: previous?.standId,
    });
    if (!decision) return false;
    const stand = this.config.surfaceGraph.stands.find((candidate) => candidate.id === decision.standId);
    flight.gateAssignment = decision;
    scheduleTurnaround(flight.turnaround, decision.scheduledGateInSeconds);
    flight.gateSlot = decision.gateSlot;
    flight.standId = decision.standId;
    flight.pushbackDirection = stand?.pushbackDirection ?? 'straight';
    if (previous) {
      amendFlightPlan(
        flight.flightPlan,
        'gate-swap',
        this.state.elapsed,
        `${previous.gateRef ?? previous.zoneName ?? previous.standId} → ${decision.gateRef ?? decision.zoneName ?? decision.standId}`,
        { gateAssignment: decision },
      );
      this.state.trafficFlow.totals.gateSwaps += 1;
    }
    this.events.push({
      type: previous ? 'gate-reassignment' : 'gate-assignment',
      flight,
      detail: `${reason} · ${previous?.gateRef ?? previous?.zoneName ?? previous?.standId ?? 'unassigned'} → ${decision.gateRef ?? decision.zoneName ?? decision.standId}`,
    });
    if (flight.phase === 'approach') this.planRunwayExit(flight, 'destination stand changed');
    return true;
  }

  private gateReadyForTaxiAt(flight: Flight): number {
    if (flight.phase === 'approach') {
      return this.state.elapsed
        + Math.max(0, flight.duration - flight.phaseElapsed)
        + this.phaseDuration(flight.aircraft, 'landing', flight.runway, flight.runwayExit);
    }
    if (flight.phase === 'landing') return this.state.elapsed + Math.max(0, flight.duration - flight.phaseElapsed);
    return this.state.elapsed;
  }

  private confirmGateArrival(flight: Flight): void {
    const assignment = flight.gateAssignment;
    if (!assignment) return;
    let vehicles = this.state.serviceVehicles.filter((vehicle) => vehicle.flightId === flight.id && vehicle.standId === assignment.standId);
    if (!vehicles.length) vehicles = this.prepareServiceVehicles(flight, this.state.elapsed);
    const transitions = startTurnaround(flight.turnaround, this.state.elapsed, flight.kinematics.fuelPercent, availableVehicleServices(flight, vehicles));
    flight.duration = flight.turnaround.plannedDurationSeconds;
    flight.phaseElapsed = 0;
    flight.progress = 0;
    assignment.actualGateInSeconds = this.state.elapsed;
    assignment.scheduledGateInSeconds = this.state.elapsed;
    assignment.scheduledDepartureSeconds = flight.turnaround.scheduledReadySeconds;
    this.events.push({
      type: 'turnaround-start',
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
      .filter((other) => other.id !== flight.id && (other.phase === 'approach' || other.phase === 'landing'))
      .filter((other) => other.gateAssignment?.standId === assignment.standId)
      .sort((first, second) => (first.gateAssignment?.scheduledGateInSeconds ?? Infinity) - (second.gateAssignment?.scheduledGateInSeconds ?? Infinity));
    for (const future of futureTraffic) {
      const futureAssignment = future.gateAssignment;
      if (!futureAssignment || !gateReservationsOverlap(occupiedWindow, {
        startSeconds: futureAssignment.scheduledGateInSeconds,
        endSeconds: futureAssignment.scheduledDepartureSeconds,
      })) continue;
      this.reassignArrivalGate(future, `${assignment.gateRef ?? assignment.zoneName ?? assignment.standId} occupancy window changed`);
    }
  }

  /** Plan and release gate equipment early enough to be staged before gate-in. */
  private prepareServiceVehicles(
    flight: Flight,
    scheduledGateInSeconds: number,
    prepositioned = false,
  ): ServiceVehicleState[] {
    const reservedDepots = new Set(this.state.serviceVehicles
      .filter((vehicle) => vehicle.flightId !== flight.id && vehicle.status !== 'complete')
      .map((vehicle) => vehicle.depotNodeId));
    const vehicles = createServiceVehiclePlans(
      this.config,
      flight,
      scheduledGateInSeconds,
      reservedDepots,
      this.surfaceRoutePlanning(flight.id),
    );
    this.state.serviceVehicles = this.state.serviceVehicles.filter((vehicle) => vehicle.flightId !== flight.id);
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
      type: 'gate-release',
      flight,
      detail: `${assignment.gateRef ?? assignment.zoneName ?? assignment.standId} released for the next arrival`,
    });
  }

  /** Prevent a phase handoff from introducing an envelope the prior phase did not carry. */
  private transitionConflict(flight: Flight, next: FlightPhase): string | null {
    const preview: Flight = {
      ...flight,
      phase: next,
      progress: 0,
      phaseElapsed: 0,
      duration: this.phaseDuration(flight.aircraft, next, flight.runway, flight.runwayExit),
      surfaceRoute: flight.surfaceRoute ? [...flight.surfaceRoute] : undefined,
      surfaceRouteEdges: flight.surfaceRouteEdges ? [...flight.surfaceRouteEdges] : undefined,
      surfaceCongestedEdgeIds: flight.surfaceCongestedEdgeIds ? [...flight.surfaceCongestedEdgeIds] : undefined,
      requiredCrossings: flight.requiredCrossings ? [...flight.requiredCrossings] : undefined,
      crossingClearances: flight.crossingClearances ? [...flight.crossingClearances] : undefined,
      crossingClearanceIds: flight.crossingClearanceIds ? [...flight.crossingClearanceIds] : undefined,
      deicing: { ...flight.deicing },
      kinematics: { ...flight.kinematics },
    };
    if (next === 'taxi-in' || next === 'resting' || next === 'taxi-out') {
      this.assignSurfaceRoute(preview, next);
      if (next !== 'resting' && (!preview.surfaceRoute?.length || !preview.surfaceRouteEdges?.length)) {
        return 'no compatible pavement route is available around the active surface restrictions';
      }
    }
    if (next === 'takeoff') {
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
    if (next === 'taxi-in' || next === 'taxi-out') {
      const transitionProgress = Math.min(0.025, Math.max(0.001, 1 - preview.progress));
      const projectedConflict = findProposedConflict(
        this.config,
        preview,
        transitionProgress,
        this.state.flights.filter((item) => item.id !== flight.id),
        new Map(this.state.flights.map((item) => [item.id, item.progress])),
      );
      if (projectedConflict) return projectedConflict.detail;
    }
    const traffic = [preview, ...this.state.flights.filter((item) => item.id !== flight.id)];
    const aircraftConflict = findFlightConflicts(this.config, traffic)
      .find((conflict) => conflict.first === preview.id || conflict.second === preview.id);
    if (aircraftConflict) return aircraftConflict.detail;
    return findObstacleConflicts(this.config, [preview])[0]?.detail ?? null;
  }

  private reserveDeparture(flight: Flight): boolean {
    const runway = flight.runway;
    if (this.runwayReleaseBlocker(flight, 'departure')) return false;
    for (const [reservedRunway, owner] of this.runwayReservations) {
      if (owner !== flight.id && this.runwaysConflict(runway, reservedRunway)) return false;
    }
    for (const other of this.state.flights) {
      if (other === flight) continue;
      // A departure must fit ahead of the complete arrival sequence. Waiting
      // until an aircraft is on short final can commit a long takeoff roll
      // that is still active when that arrival lands and exits beside it.
      const protectsRunway = other.phase === 'approach'
        || other.phase === 'landing'
        || (other.phase === 'taxi-in' && other.progress < 0.3)
        || (other.phase === 'taxi-out' && other.progress > 0.96)
        || other.phase === 'takeoff';
      if (protectsRunway && this.runwaysConflict(runway, other.runway)) return false;
    }
    if (this.departurePathBlocker(flight)) return false;
    this.runwayReservations.set(runway, flight.id);
    for (const crossing of this.intersectingRunways(runway)) this.runwayReservations.set(crossing, flight.id);
    return true;
  }

  private runwayReleaseBlocker(flight: Flight, kind: 'arrival' | 'departure'): string | null {
    return runwayReleaseReason(
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
  }

  private recordRunwayOperation(flight: Flight, kind: 'arrival' | 'departure'): void {
    this.runwayOperationHistory.push({
      flightId: flight.id,
      callsign: flight.callsign,
      runwayId: flight.runway,
      operatingEnd: flight.operatingEnd,
      kind,
      wakeClass: flight.wakeClass,
      atSeconds: this.state.elapsed,
    });
    if (this.runwayOperationHistory.length > 100) this.runwayOperationHistory.splice(0, this.runwayOperationHistory.length - 100);
  }

  /**
   * Protect the complete low-altitude departure path before committing an
   * aircraft to the roll. Generated and imported layouts can contain a
   * parallel taxi segment close enough that two rendered wings would overlap
   * even though the taxi aircraft is no longer inside a runway crossing.
   */
  private departurePathBlocker(flight: Flight): Flight | undefined {
    const preview: Flight = {
      ...flight,
      phase: 'takeoff',
      progress: 0,
      phaseElapsed: 0,
      duration: this.phaseDuration(flight.aircraft, 'takeoff', flight.runway),
      motion: { ...flight.motion },
      kinematics: { ...flight.kinematics },
    };
    syncFlightMotion(this.config, preview);
    const departureSweep = Array.from({ length: 193 }, (_, sampleIndex) => {
      const envelope = aircraftCollisionEnvelope(this.config, preview, sampleIndex / 192);
      return {
        ...envelope,
        bodyRadius: envelope.bodyRadius + (this.config.scope === 'center' ? 0.35 : 1.2),
      };
    });
    const surfaceTraffic = this.state.flights.filter((other) => (
      other.id !== flight.id && (other.phase === 'taxi-in' || other.phase === 'resting' || other.phase === 'taxi-out')
    ));
    for (const other of surfaceTraffic) {
      // Include a short taxi look-ahead to cover the phase-transition tick,
      // but do not reserve against the aircraft's entire future route. The
      // shared surface arbiter will hold that aircraft if it later approaches
      // a committed runway sweep.
      const lookAhead = Math.min(0.025, 1 - other.progress);
      for (let surfaceIndex = 0; surfaceIndex <= 4; surfaceIndex += 1) {
        const surfaceProgress = other.progress + lookAhead * surfaceIndex / 4;
        const otherEnvelope = aircraftCollisionEnvelope(this.config, other, surfaceProgress);
        for (const protectedDepartureEnvelope of departureSweep) {
          const conflict = detectFlightConflict(
            protectedDepartureEnvelope,
            otherEnvelope,
            preview.wakeClass,
            other.wakeClass,
            this.runwaysConflict(preview.runway, other.runway),
            false,
          );
          if (conflict || detectCommittedRunwaySweepConflict(otherEnvelope, protectedDepartureEnvelope)) return other;
        }
      }
    }
    return undefined;
  }

  /** Protect final approach, flare, rollout, and runway exit before spawning. */
  private arrivalPathBlocker(flight: Flight): Flight | undefined {
    const landingPreview: Flight = {
      ...flight,
      phase: 'landing',
      progress: 0,
      phaseElapsed: 0,
      duration: this.phaseDuration(flight.aircraft, 'landing', flight.runway, flight.runwayExit),
      motion: { ...flight.motion },
      kinematics: { ...flight.kinematics },
    };
    syncFlightMotion(this.config, landingPreview);
    const margin = this.config.scope === 'center' ? 0.35 : 1.2;
    const arrivalSweep = [flight, landingPreview].flatMap((preview) => (
      Array.from({ length: 65 }, (_, sampleIndex) => {
        const envelope = aircraftCollisionEnvelope(this.config, preview, sampleIndex / 64);
        return { ...envelope, bodyRadius: envelope.bodyRadius + margin };
      })
    ));
    for (const other of this.state.flights) {
      if (other.phase !== 'taxi-in' && other.phase !== 'resting' && other.phase !== 'taxi-out') continue;
      const surfaceEnvelope = aircraftCollisionEnvelope(this.config, other);
      for (const protectedArrivalEnvelope of arrivalSweep) {
        const conflict = detectFlightConflict(
          protectedArrivalEnvelope,
          surfaceEnvelope,
          flight.wakeClass,
          other.wakeClass,
          this.runwaysConflict(flight.runway, other.runway),
          false,
        );
        if (conflict || detectCommittedRunwaySweepConflict(surfaceEnvelope, protectedArrivalEnvelope)) return other;
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
      .filter((runway) => (
        (this.runwayRole(runway.id) === 'departure' || this.runwayRole(runway.id) === 'mixed')
        && !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id)
        && runwaySupportsAircraft(runway, flight.aircraft, 'takeoff')
      ))
      .sort((first, second) => this.headwindComponent(second.id) - this.headwindComponent(first.id));
    if (candidates.length === 0) return null;
    const offset = flight.id % candidates.length;
    const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];
    return rotated.find((runway) => this.canStartTaxiOut(flight, runway.id))?.id ?? null;
  }

  private calculateApproachCapacity(): number {
    const rules = separationRuleset(this.state.separationRuleset);
    const arrivals = this.config.runways.filter((runway) => {
      const role = this.runwayRole(runway.id);
      return role === 'arrival' || role === 'mixed';
    });
    const independentArrivals: number[] = [];
    for (const runway of arrivals) {
      if (independentArrivals.every((other) => runwayPairIndependent(this.config, this.state, rules, runway.id, other))) independentArrivals.push(runway.id);
    }
    const departures = this.config.runways.filter((runway) => {
      const role = this.runwayRole(runway.id);
      return role === 'departure' || role === 'mixed';
    }).length;
    const maximumCapacity = this.config.code === 'ORD' ? 4 : 3;
    return Math.max(1, Math.min(maximumCapacity, independentArrivals.length, Math.max(1, departures + 1)));
  }

  private weatherApproachCapacity(): number {
    const density = trafficDensityProfile(this.state.trafficFlow.density);
    const physicalRunways = this.config.runways.filter((runway) => {
      const role = this.runwayRole(runway.id);
      return (role === 'arrival' || role === 'mixed') && !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id);
    }).length;
    const rules = separationRuleset(this.state.separationRuleset);
    const environmentalCapacity = weatherCapacityMultiplier(rules, this.state.weather);
    const approachCapacity = Math.max(1, Math.min(physicalRunways, Math.ceil(this.calculateApproachCapacity() * density.arrivalCapacityMultiplier * environmentalCapacity)));
    if (this.state.scenario === 'emergency') return 1;
    if (this.state.scenario === 'training') return 1;
    if (this.state.scenario === 'storm') return Math.min(2, approachCapacity);
    if (this.state.weather.condition === 'snow') return Math.min(2, approachCapacity);
    if (this.state.weather.condition === 'fog') return Math.min(2, approachCapacity);
    if (this.state.weather.condition === 'rain') return Math.min(3, approachCapacity);
    return approachCapacity;
  }

  private arrivalSpacing(profile?: ReturnType<typeof aircraftProfile>): number {
    const base = this.config.scope === 'center'
      ? Math.max(6, this.config.trafficInterval * 0.76)
      : Math.max(6.5, this.config.trafficInterval * 0.95);
    const scenarioMultiplier = this.state.scenario === 'storm' ? 1.55 : this.state.scenario === 'closure' ? 1.18 : this.state.scenario === 'training' ? 2.1 : this.state.scenario === 'emergency' ? 1.35 : 1;
    const rules = separationRuleset(this.state.separationRuleset);
    const wakeMultiplier = profile
      ? Math.max(1, rules.wakeSeconds[profile.wakeClass] / Math.max(1, rules.runwayBaseSeconds.arrival))
      : 1;
    const profileMultiplier = airportOperationStateAt(this.config.operationProfile, this.state.elapsed).arrivalIntervalMultiplier;
    const density = trafficDensityProfile(this.state.trafficFlow.density);
    const referenceSpeedKts = profile?.approachKts ?? 140;
    const physicalRadarSeconds = requiredRadarSeparationNm(rules, this.state.weather) * 1_852
      / Math.max(1, referenceSpeedKts * KNOT_TO_MPS)
      / Math.max(1, this.calculateApproachCapacity());
    const scenarioBase = Math.max(
      base * scenarioMultiplier * wakeMultiplier * Math.max(0.58, Math.min(1.85, profileMultiplier)) / density.arrivalCapacityMultiplier,
      physicalRadarSeconds,
    );
    if (this.state.weather.condition === 'fog') return scenarioBase * 1.55;
    if (this.state.weather.condition === 'snow') return scenarioBase * 1.42;
    if (this.state.weather.condition === 'rain') return scenarioBase * 1.2;
    return scenarioBase;
  }

  private createOperationPlan(
    direction: FlightOperationPlan['direction'],
    trafficClass: OperationTrafficClass,
    state = airportOperationStateAt(this.config.operationProfile, this.state.elapsed),
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
    const hasArrival = this.config.runways.some((runway) => (
      (this.runwayRole(runway.id) === 'arrival' || this.runwayRole(runway.id) === 'mixed')
      && !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id)
      && runwaySupportsAircraft(runway, aircraft, 'landing')
    ));
    const hasDeparture = this.config.runways.some((runway) => (
      (this.runwayRole(runway.id) === 'departure' || this.runwayRole(runway.id) === 'mixed')
      && !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id)
      && runwaySupportsAircraft(runway, aircraft, 'takeoff')
    ));
    return hasArrival && hasDeparture;
  }

  private registrationFor(airlineCode: AirlineCode, id: number): string {
    const airline = airlineProfile(airlineCode);
    const suffix = String(100 + ((id * 73 + Math.abs(this.config.seed)) % 890)).padStart(3, '0');
    return `${airline.registrationPrefix}${suffix}${airlineCode === 'UA' ? 'U' : airlineCode === 'AA' ? 'A' : ''}`;
  }

  private terminalProcedure(kind: TerminalProcedureKind, runway: number, flightId: number): SelectedTerminalProcedure {
    return selectTerminalProcedure(this.config.airspaceProgram, {
      kind,
      runwayId: runway,
      operatingEnd: this.preferredOperatingEnd(runway),
      configurationId: this.state.runwayConfigurationId,
      condition: this.state.weather.condition,
      flightId,
    });
  }

  private navigationFor(selected: SelectedTerminalProcedure, direction: 'arrival' | 'departure'): FlightNavigationState {
    return {
      schemaVersion: 1,
      procedureDataVersion: this.config.airspaceProgram.dataVersion,
      procedureId: selected.procedure.id,
      transitionId: selected.transition.id,
      routeFixIds: [...selected.routeFixIds],
      activeFixIndex: 0,
      approachCleared: direction === 'arrival' && this.stationRunsAutomatically('approach'),
      departureHeadingDegrees: selected.procedure.initialHeadingDegrees,
      initialClimbAltitudeFt: selected.procedure.initialClimbAltitudeFt,
      handoffFixId: selected.procedure.handoffFixId,
      frequencyOwner: direction === 'arrival' ? 'approach' : 'ramp',
      handoffStatus: 'owned',
      readbackStatus: 'not-required',
      missedApproachId: selected.procedure.missedApproachId,
    };
  }

  private activeRunwayDesignation(runwayId: number): string {
    const runway = this.config.runways[runwayId];
    const end = this.state.activeRunwayEnds[runwayId] ?? runway?.landingEnd ?? -1;
    return runway?.designation?.[end === 1 ? 1 : 0] ?? String(runwayId + 1);
  }

  private phaseDuration(
    aircraft: AircraftModel,
    phase: FlightPhase,
    runwayId = 0,
    runwayExit?: FlightRunwayExitState,
  ): number {
    const profile = aircraftProfile(aircraft);
    if (phase === 'resting') return PHASE_DURATION.resting;
    if (phase === 'approach') {
      const distanceMeters = (this.config.scope === 'center' ? 272 : 182) * WORLD_METERS_PER_UNIT;
      const meanApproachMps = (profile.approachKts + 16) * KNOT_TO_MPS;
      const base = distanceMeters / meanApproachMps;
      const turnFactor = Math.pow(profile.turnRadiusM / 1_000, 0.08);
      return base * turnFactor * (1_800 / profile.descentFpm) ** 0.08 * this.weatherDurationMultiplier(phase);
    }
    if (phase === 'landing') {
      return landingTrajectoryTiming(this.config, runwayId, aircraft, runwayExit).totalSeconds
        * (runwayExit ? 1 : this.weatherDurationMultiplier(phase));
    }
    if (phase === 'taxi-in' || phase === 'taxi-out') return 60 * (18 / profile.taxiKts) * this.weatherDurationMultiplier(phase);
    if (phase === 'takeoff') {
      return departureTrajectoryTiming(this.config, runwayId, aircraft).totalSeconds * this.weatherDurationMultiplier(phase);
    }
    return PHASE_DURATION[phase] * this.weatherDurationMultiplier(phase);
  }

  private updateFlightKinematics(
    flight: Flight,
    delta: number,
    moving: boolean,
    previousProgress: number,
    previousMotion: Flight['motion'],
    requestedSpeedKts: number,
  ): void {
    if (delta <= 0) return;
    const telemetry = flight.kinematics;
    const previousGroundSpeed = telemetry.groundSpeedKts;
    const previousAltitude = telemetry.altitudeFt;
    const currentAltitude = this.motionAltitudeFt(flight);
    const travelledMeters = moving
      ? Math.max(0, flight.motion.distanceAlongM - previousMotion.distanceAlongM)
      : 0;
    const measuredSpeed = travelledMeters / Math.max(0.001, delta) / KNOT_TO_MPS;
    // The integrated speed is authoritative. A path may end partway through a
    // fixed tick; carrying the requested speed across the phase boundary
    // avoids an artificial touchdown/taxi handoff deceleration.
    const groundSpeed = moving ? requestedSpeedKts : 0;
    const airborne = !flight.motion.onGround;
    telemetry.groundSpeedKts = groundSpeed;
    telemetry.airspeedKts = Math.max(0, groundSpeed + (airborne ? this.headwindComponent(flight.runway) : 0));
    telemetry.accelerationMps2 = (groundSpeed - previousGroundSpeed) * KNOT_TO_MPS / delta;
    telemetry.altitudeFt = currentAltitude;
    telemetry.verticalSpeedFpm = (currentAltitude - previousAltitude) / delta * 60;

    if (flight.phase !== 'resting') {
      telemetry.fuelPercent = Math.max(
        0,
        telemetry.fuelPercent - fuelBurnPercentPerSecond(flight.aircraft, flight.phase, moving) * delta,
      );
    }
    void measuredSpeed;
    void previousProgress;
  }

  private motionAltitudeFt(flight: Flight): number {
    if (flight.phase === 'approach') return Math.max(50, (flight.motion.z - 4.2) * 100 + 50);
    if (flight.phase === 'landing') return flight.motion.stage === 'flare' ? 50 * (1 - flight.motion.stageProgress) : 0;
    if (flight.phase === 'takeoff') return Math.max(0, (flight.motion.z - 2) * 100);
    return 0;
  }

  private targetGroundSpeedKts(flight: Flight): number {
    if (flight.phase === 'resting') return 0;
    const profile = aircraftProfile(flight.aircraft);
    const pace = Math.max(0.55, Math.min(flight.phase === 'taxi-in' || flight.phase === 'taxi-out' ? 1 : 1.28, flight.controlPace ?? 1));
    const surfaceWeather = this.state.weather.condition === 'snow' ? 0.68 : this.state.weather.condition === 'fog' ? 0.78 : this.state.weather.condition === 'rain' ? 0.88 : 1;
    let target = profile.taxiKts;
    const surfaceMotion = flight.phase === 'taxi-in' || flight.phase === 'taxi-out'
      ? sampleAircraftSurfaceMotion(
          this.config.surfaceGraph,
          flight.surfaceRoute,
          flight.surfaceRouteEdges,
          flight.progress,
          profile,
        )
      : null;
    if (flight.phase === 'taxi-out' && flight.motion.stage === 'pushback') {
      target = (flight.wakeClass === 'heavy' ? 2.6 : flight.category === 'regional' ? 3.6 : 3.2) * surfaceWeather;
      return target * pace;
    }
    if (flight.phase === 'approach') target = flight.diversion
      ? profile.approachKts + 34
      : flight.goAround
        ? profile.approachKts + 22
        : profile.approachKts + this.lerp(18, 2, flight.progress);
    if ((flight.phase === 'approach' || (flight.phase === 'takeoff' && !flight.motion.onGround)) && flight.navigation.assignedSpeedKts !== undefined) {
      target = flight.navigation.assignedSpeedKts;
    }
    if (flight.phase === 'landing') {
      if (flight.motion.stage === 'flare') target = profile.approachKts;
      else if (flight.motion.stage === 'touchdown' || flight.motion.stage === 'rollout') {
        target = this.lerp(profile.approachKts, flight.runwayExit?.targetExitSpeedKts ?? profile.taxiKts + 3, flight.motion.stageProgress);
      } else target = flight.runwayExit?.targetExitSpeedKts ?? profile.taxiKts + 3;
    }
    if (flight.phase === 'takeoff') {
      if (flight.motion.stage === 'lineup') target = profile.taxiKts;
      else if (flight.motion.stage === 'takeoff-roll' || flight.motion.stage === 'rotation') target = profile.approachKts * 1.12;
      else target = profile.approachKts * 1.34;
    }
    if (flight.phase === 'taxi-in' || flight.phase === 'taxi-out') {
      target = Math.min(target, surfaceMotion?.speedLimitKts ?? target);
      if (surfaceMotion && !surfaceMotion.routeClearanceOk) target = 0;
      target *= surfaceWeather;
    }
    return target * pace;
  }

  private acceleratedSpeedKts(flight: Flight, targetSpeedKts: number, delta: number): number {
    const profile = aircraftProfile(flight.aircraft);
    const current = Math.max(0, flight.kinematics.groundSpeedKts);
    const brakingWeather = this.state.weather.condition === 'snow' ? 0.58 : this.state.weather.condition === 'rain' ? 0.76 : this.state.weather.condition === 'fog' ? 0.9 : 1;
    const onTaxiway = flight.phase === 'taxi-in' || flight.phase === 'taxi-out';
    const acceleration = targetSpeedKts >= current
      ? onTaxiway ? profile.taxiAccelerationMps2 : profile.accelerationMps2
      : (onTaxiway ? profile.taxiBrakingMps2 : profile.brakingMps2) * brakingWeather;
    const changeKts = acceleration * delta / KNOT_TO_MPS;
    if (targetSpeedKts > current) return Math.min(targetSpeedKts, current + changeKts);
    return Math.max(targetSpeedKts, current - changeKts);
  }

  private updateMotionHealth(flight: Flight, delta: number, moved: boolean): void {
    if (flight.phase === 'resting' || moved) {
      this.stationarySeconds.set(flight.id, 0);
      return;
    }
    const previous = this.stationarySeconds.get(flight.id) ?? 0;
    const current = previous + delta;
    this.stationarySeconds.set(flight.id, current);
    this.metrics.longestHoldSeconds = Math.max(this.metrics.longestHoldSeconds, current);
    const expected = Boolean(
      flight.controlHold
      || flight.automaticHold
      || flight.crossingHoldRunway !== undefined
      || deicingMovementLimit(flight) !== null
      || flight.safetyHold
      || (flight.phase === 'takeoff' && !flight.takeoffCleared)
    );
    if (!expected && previous < 0.75 && current >= 0.75) this.metrics.unexplainedPauses += 1;
  }

  private approachStartAltitude(aircraft: AircraftModel): number {
    const profile = aircraftProfile(aircraft);
    const duration = this.phaseDuration(aircraft, 'approach');
    return Math.round((50 + profile.descentFpm * duration / 60) / 50) * 50;
  }

  private lerp(start: number, end: number, amount: number): number {
    return start + (end - start) * amount;
  }

  private motionStart(flight: Flight): NonNullable<Flight['navigation']['vector']>['start'] {
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
    return ((90 - angle * 180 / Math.PI) % 360 + 360) % 360;
  }

  private originFor(id: number): string {
    if (this.config.code === 'LOCAL') return ['KSTL', 'KMSP', 'KIND', 'KCMH'][id % 4];
    const origins: Record<string, string[]> = {
      ORD: ['KATL', 'KDFW', 'KLAX', 'KJFK'],
      ATL: ['KORD', 'KMIA', 'KDFW', 'KCLT'],
      DXB: ['EGLL', 'WSSS', 'VIDP', 'LTFM'],
      HND: ['RJAA', 'RJBB', 'RKSI', 'RCTP'],
      DFW: ['KDEN', 'KPHX', 'KORD', 'KIAH'],
      LHR: ['KJFK', 'LFPG', 'EDDF', 'OMDB'],
      IST: ['EGLL', 'OMDB', 'EDDF', 'LIRF'],
      DEN: ['KORD', 'KLAX', 'KDFW', 'KSEA'],
      LAX: ['KSEA', 'KSFO', 'KLAS', 'KPHX'],
      JFK: ['KBOS', 'KORD', 'KMCO', 'KATL'],
    };
    return origins[this.config.code]?.[id % 4] ?? 'KXXX';
  }

  private taxiwayName(runway: number): string {
    if (this.config.code !== 'ORD') return `TAXIWAY ${String.fromCharCode(65 + runway % 20)}`;
    const centerY = this.config.runways[runway].center[1];
    return centerY >= 8 ? 'NORTH PERIMETER' : centerY <= -8 ? 'SOUTH PERIMETER' : 'EAST PERIMETER';
  }

  private refreshDeicingPlansForWeather(): void {
    const winter = winterDeicingRequired(this.state.weather);
    for (const flight of this.state.flights) {
      if (!winter) {
        if (flight.phase === 'resting' || (
          flight.phase === 'taxi-out'
          && ['planned', 'enroute', 'queued', 'positioning', 'treating', 'unavailable'].includes(flight.deicing.status)
        )) markDeicingNotRequired(flight, 'Frozen precipitation ended; treatment is no longer required.');
        continue;
      }
      if (flight.phase === 'resting') {
        if (flight.deicing.status === 'planned' || flight.deicing.status === 'unavailable') continue;
        this.assignSurfaceRoute(flight, 'resting');
        this.events.push({
          type: 'deicing-planned',
          flight,
          taxiway: flight.taxiway,
          detail: flight.deicing.facilityName
            ? `${flight.deicing.facilityName} lane ${flight.deicing.laneNumber} reserved after pushback`
            : flight.deicing.reason,
        });
        continue;
      }
      if (flight.phase === 'taxi-out' && flight.deicing.status === 'not-required') {
        // A weather override is applied after startup traffic is seeded. A
        // departure already well clear of its stand is recorded as pretreated
        // instead of being teleported onto a newly generated route.
        markStartupPretreated(flight, this.state.elapsed, this.config);
        this.events.push({
          type: 'deicing-complete',
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
      .filter((flight) => flight.phase === 'taxi-out' && flight.deicing.required)
      .sort((first, second) => first.id - second.id);

    for (const flight of taxiOut) {
      const deicing = flight.deicing;
      if (deicing.status === 'protected') {
        deicing.holdoverRemainingSeconds = Math.max(0, (deicing.holdoverExpiresSeconds ?? this.state.elapsed) - this.state.elapsed);
        if (deicing.holdoverRemainingSeconds <= 1e-6) {
          deicing.status = 'expired';
          deicing.reason = 'Holdover protection expired before runway entry; return treatment is required.';
          this.events.push({ type: 'deicing-expired', flight, taxiway: flight.taxiway, detail: deicing.reason });
        }
      }
      if (deicing.status === 'enroute' && flight.progress >= deicing.queueHoldProgress - 0.0002) {
        deicing.status = 'queued';
        deicing.queueEnteredSeconds = this.state.elapsed;
        deicing.reason = `Waiting for ${deicing.facilityName} lane ${deicing.laneNumber}.`;
        this.events.push({ type: 'deicing-queue', flight, taxiway: flight.taxiway, detail: deicing.reason });
      }
      if (deicing.status === 'positioning' && flight.progress >= deicing.treatmentProgress - 0.0002) {
        deicing.status = 'treating';
        deicing.treatmentStartedSeconds = this.state.elapsed;
        deicing.treatmentElapsedSeconds = 0;
        deicing.reason = `${deicing.fluid} treatment in progress.`;
        this.events.push({
          type: 'deicing-start',
          flight,
          taxiway: flight.taxiway,
          detail: `${deicing.facilityName} lane ${deicing.laneNumber} · ${deicing.fluid}`,
        });
      }
      if (deicing.status === 'treating') {
        deicing.treatmentElapsedSeconds = Math.min(
          deicing.treatmentDurationSeconds,
          deicing.treatmentElapsedSeconds + delta,
        );
        if (deicing.treatmentElapsedSeconds >= deicing.treatmentDurationSeconds - 1e-6) {
          deicing.status = 'protected';
          deicing.treatmentCompletedSeconds = this.state.elapsed;
          deicing.holdoverExpiresSeconds = this.state.elapsed + deicing.holdoverSeconds;
          deicing.holdoverRemainingSeconds = deicing.holdoverSeconds;
          deicing.queuePosition = 0;
          deicing.reason = `Treatment complete; ${Math.round(deicing.holdoverSeconds)} seconds of holdover protection.`;
          this.events.push({
            type: 'deicing-complete',
            flight,
            taxiway: flight.taxiway,
            detail: `${deicing.fluid} complete · holdover expires ${Math.round(deicing.holdoverExpiresSeconds)} s`,
          });
        }
      }
    }

    const queues = new Map<string, Flight[]>();
    for (const flight of taxiOut.filter((candidate) => candidate.deicing.status === 'queued')) {
      const laneId = flight.deicing.laneId;
      if (!laneId) continue;
      const queue = queues.get(laneId) ?? [];
      queue.push(flight);
      queues.set(laneId, queue);
    }
    for (const [laneId, queue] of queues) {
      queue.sort((first, second) => (
        (first.deicing.queueEnteredSeconds ?? Infinity) - (second.deicing.queueEnteredSeconds ?? Infinity)
        || first.id - second.id
      ));
      queue.forEach((flight, index) => { flight.deicing.queuePosition = index + 1; });
      const occupied = taxiOut.some((flight) => (
        flight.deicing.laneId === laneId
        && (
          flight.deicing.status === 'positioning'
          || flight.deicing.status === 'treating'
          || (flight.deicing.status === 'protected' && flight.progress < flight.deicing.padExitProgress - 0.0002)
        )
      ));
      if (occupied || !queue.length) continue;
      const released = queue[0];
      // Preserve an observable queue state for at least one fixed step. This
      // also prevents a newly arrived aircraft from claiming a lane in the
      // same arbitration pass that detected the stop line.
      if ((released.deicing.queueEnteredSeconds ?? this.state.elapsed) >= this.state.elapsed - 1e-6) continue;
      released.deicing.status = 'positioning';
      released.deicing.queuePosition = 0;
      released.deicing.reason = `Lane ${released.deicing.laneNumber} released; taxi into treatment position.`;
      this.events.push({ type: 'deicing-pad-entry', flight: released, taxiway: released.taxiway, detail: released.deicing.reason });
    }
  }

  private returnForDeicing(flight: Flight): void {
    const holdShortNode = flight.surfaceRoute?.at(-1);
    flight.deicing.cycle = Math.max(1, flight.deicing.cycle) + 1;
    const congestionPlanning = this.surfaceRoutePlanning(flight.id);
    const plan = planDeicingTaxiRoute(this.config, flight, congestionPlanning, holdShortNode);
    if (!plan) {
      flight.deicing.status = 'unavailable';
      flight.deicing.reason = 'Holdover expired and no compatible return route to a deicing pad is available.';
      return;
    }
    applyDeicingRoutePlan(flight, plan, 'enroute');
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
    flight.engineState = 'running';
    flight.holdNotified = false;
    flight.runwayEntryCleared = false;
    flight.takeoffCleared = false;
    flight.requiredCrossings = surfaceRouteRunwayCrossings(this.config.surfaceGraph, plan.route.edgeIds, flight.runway);
    flight.crossingClearances = [];
    flight.crossingClearanceIds = [];
    flight.crossingHoldRunway = undefined;
    flight.crossingHoldPointId = undefined;
    flight.surfaceNode = plan.route.nodeIds[0];
    flight.surfaceEdge = plan.route.edgeIds[0];
    this.updateSurfaceRouteState(flight);
    syncFlightMotion(this.config, flight);
    this.events.push({
      type: 'deicing-return',
      flight,
      taxiway: flight.taxiway,
      detail: `holdover expired · returning to ${plan.facility.name} lane ${plan.lane.number} for cycle ${flight.deicing.cycle}`,
    });
  }

  private createSurfaceDisruption(
    kind: Exclude<SurfaceDisruptionKind, 'disabled-aircraft'>,
    targetId: string,
    source: SurfaceDisruptionSource,
    durationSeconds?: number,
  ): boolean {
    const target = resolveSurfaceDisruptionTarget(this.config, kind, targetId);
    if (!target) return this.rejectDecision(`unknown ${kind.replace('-', ' ')} target ${targetId}`);
    if (this.state.surfaceDisruptions.some((candidate) => candidate.kind === kind && candidate.targetId === target.targetId)) {
      return this.rejectDecision(`${target.label} already has an active restriction`);
    }
    const overlapping = this.state.surfaceDisruptions.find((candidate) => (
      candidate.edgeIds.some((edgeId) => target.edgeIds.includes(edgeId))
    ));
    if (overlapping) return this.rejectDecision(`${target.label} overlaps ${overlapping.label}, which is already restricted`);
    if (target.runwayId !== undefined && !this.runwayClosureLeavesCapacity(target.runwayId)) {
      return this.rejectDecision(`${target.label} cannot close because it removes the last usable arrival or departure runway`);
    }

    const occupiedByFlight = this.state.flights.find((flight) => (
      (flight.phase === 'taxi-in' || flight.phase === 'taxi-out')
      && Boolean(flight.surfaceEdge && target.edgeIds.includes(flight.surfaceEdge))
    ));
    const occupiedByVehicle = this.state.serviceVehicles.find((vehicle) => (
      Boolean(vehicle.currentEdge && target.edgeIds.includes(vehicle.currentEdge))
    ));
    const routedVehicle = kind === 'runway-closure' ? undefined : this.state.serviceVehicles.find((vehicle) => (
      vehicle.status !== 'complete'
      && [...vehicle.outboundRouteEdges, ...vehicle.returnRouteEdges].some((edgeId) => target.edgeIds.includes(edgeId))
    ));
    if (kind !== 'runway-closure' && (occupiedByFlight || occupiedByVehicle || routedVehicle)) {
      const occupant = occupiedByFlight?.callsign ?? occupiedByVehicle?.label ?? routedVehicle?.label ?? 'surface traffic';
      return this.rejectDecision(`${target.label} cannot close while ${occupant} is using or reserved on the affected pavement`);
    }

    const runwayBlockers = target.runwayId === undefined ? [] : this.runwayClosureBlockingFlights(target.runwayId);
    const status: SurfaceDisruptionState['status'] = runwayBlockers.length ? 'pending' : 'active';
    const duration = kind === 'construction'
      ? Math.max(20, Math.min(600, durationSeconds ?? 90))
      : durationSeconds && durationSeconds > 0
        ? Math.max(20, Math.min(1_800, durationSeconds))
        : undefined;
    const disruption: SurfaceDisruptionState = {
      id: `SD-${this.nextDisruptionId++}`,
      kind,
      status,
      source,
      targetId: target.targetId,
      label: target.label,
      edgeIds: [...target.edgeIds],
      runwayId: target.runwayId,
      taxiwayId: target.taxiwayId,
      createdAtSeconds: this.state.elapsed,
      activatedAtSeconds: status === 'active' ? this.state.elapsed : undefined,
      expectedClearAtSeconds: status === 'active' && duration ? this.state.elapsed + duration : undefined,
      durationSeconds: duration,
      recoveryProgress: 0,
      reroutedFlightIds: [],
      reason: status === 'pending'
        ? `closure queued until ${runwayBlockers.map((flight) => flight.callsign).join(', ')} clear protected pavement`
        : `${kind.replace('-', ' ')} active`,
    };
    this.state.surfaceDisruptions.push(disruption);
    this.syncClosedRunwayState();
    if (target.runwayId !== undefined) this.rerouteApproachesFromClosedRunway(target.runwayId, disruption);
    if (status === 'active') disruption.reroutedFlightIds = this.replanSurfaceTrafficAroundDisruptions(disruption.id);
    this.updateActiveRunwayConfiguration();
    this.decisionReason = disruption.reason;
    return true;
  }

  private createDisabledAircraftDisruption(flight: Flight): void {
    const edgeId = flight.surfaceEdge ?? sampleSurfaceRouteWithEdges(
      this.config.surfaceGraph,
      flight.surfaceRoute,
      flight.surfaceRouteEdges,
      flight.progress,
    )?.edge?.id;
    const disruption: SurfaceDisruptionState = {
      id: `SD-${this.nextDisruptionId++}`,
      kind: 'disabled-aircraft',
      status: 'active',
      source: 'incident',
      targetId: String(flight.id),
      label: `${flight.callsign} disabled on ${flight.taxiway ?? 'movement surface'}`,
      edgeIds: edgeId ? [edgeId] : [],
      runwayId: flight.motion.protectedRunway ? flight.runway : undefined,
      taxiwayId: flight.taxiway,
      flightId: flight.id,
      createdAtSeconds: this.state.elapsed,
      activatedAtSeconds: this.state.elapsed,
      recoveryProgress: 0,
      reroutedFlightIds: [],
      reason: 'disabled aircraft reserves its occupied pavement pending recovery',
    };
    this.state.surfaceDisruptions.push(disruption);
    disruption.reroutedFlightIds = this.replanSurfaceTrafficAroundDisruptions(disruption.id);
    if (disruption.runwayId !== undefined) {
      this.rerouteApproachesFromClosedRunway(disruption.runwayId, disruption);
      this.updateActiveRunwayConfiguration();
    }
    if (this.stationRunsAutomatically('ground')) this.startDisabledRecovery(disruption, flight, 'automatic airport recovery dispatch');
  }

  private startDisabledRecovery(disruption: SurfaceDisruptionState, flight: Flight, reason: string): void {
    const duration = 28 + aircraftProfile(flight.aircraft).lengthM * 0.72;
    disruption.status = 'recovering';
    disruption.recoveryStartedAtSeconds = this.state.elapsed;
    disruption.recoveryDurationSeconds = duration;
    disruption.expectedClearAtSeconds = this.state.elapsed + duration;
    disruption.reason = `${reason} · tow and inspection in progress`;
    this.events.push({
      type: 'recovery-start',
      flight,
      runway: disruption.runwayId,
      taxiway: flight.taxiway,
      detail: `${disruption.label} · ${Math.ceil(duration)} s estimated recovery`,
    });
  }

  private updateSurfaceDisruptions(_delta: number): void {
    for (const disruption of [...this.state.surfaceDisruptions]) {
      if (disruption.status === 'pending' && disruption.runwayId !== undefined) {
        const blockers = this.runwayClosureBlockingFlights(disruption.runwayId);
        disruption.reason = blockers.length
          ? `closure queued until ${blockers.map((flight) => flight.callsign).join(', ')} clear protected pavement`
          : `${disruption.kind.replace('-', ' ')} active`;
        if (!blockers.length) {
          disruption.status = 'active';
          disruption.activatedAtSeconds = this.state.elapsed;
          disruption.expectedClearAtSeconds = disruption.durationSeconds
            ? this.state.elapsed + disruption.durationSeconds
            : undefined;
          disruption.reroutedFlightIds = this.replanSurfaceTrafficAroundDisruptions(disruption.id);
        }
      }
      if (disruption.kind === 'disabled-aircraft') {
        const flight = this.state.flights.find((candidate) => candidate.id === disruption.flightId);
        if (!flight) {
          this.state.surfaceDisruptions = this.state.surfaceDisruptions.filter((candidate) => candidate.id !== disruption.id);
          continue;
        }
        if (disruption.status === 'active' && this.stationRunsAutomatically('ground')) {
          this.startDisabledRecovery(disruption, flight, 'automatic airport recovery dispatch');
        }
        if (disruption.status === 'recovering') {
          const elapsed = this.state.elapsed - (disruption.recoveryStartedAtSeconds ?? this.state.elapsed);
          disruption.recoveryProgress = Math.max(0, Math.min(1, elapsed / Math.max(1, disruption.recoveryDurationSeconds ?? 1)));
          if (disruption.recoveryProgress >= 1) this.completeDisabledRecovery(disruption, flight);
        }
        continue;
      }
      if (disruption.status === 'active'
        && disruption.expectedClearAtSeconds !== undefined
        && this.state.elapsed >= disruption.expectedClearAtSeconds) {
        this.removeSurfaceDisruption(disruption.id, `${disruption.label} inspected and reopened`);
      }
    }
    const replanSecond = Math.floor(this.state.elapsed);
    if (replanSecond !== this.lastSurfaceReplanSecond) {
      this.lastSurfaceReplanSecond = replanSecond;
      for (const flight of this.state.flights.filter((candidate) => candidate.surfaceReroute?.status === 'holding')) {
        if (!['enroute', 'queued', 'positioning', 'treating'].includes(flight.deicing.status)) {
          this.replanSurfaceFlight(flight, flight.surfaceReroute?.disruptionIds ?? []);
        }
      }
    }
  }

  private completeDisabledRecovery(disruption: SurfaceDisruptionState, flight: Flight): void {
    this.events.push({
      type: 'recovery-complete',
      flight,
      runway: disruption.runwayId,
      taxiway: flight.taxiway,
      detail: `${flight.callsign} towed clear · pavement inspection complete`,
    });
    this.state.serviceVehicles = this.state.serviceVehicles.filter((vehicle) => vehicle.flightId !== flight.id);
    this.state.flights = this.state.flights.filter((candidate) => candidate.id !== flight.id);
    this.state.surfaceDisruptions = this.state.surfaceDisruptions.filter((candidate) => candidate.id !== disruption.id);
    for (const [runway, owner] of this.runwayReservations) if (owner === flight.id) this.runwayReservations.delete(runway);
    this.stationarySeconds.delete(flight.id);
    this.syncClosedRunwayState();
    this.replanSurfaceTrafficAroundDisruptions(disruption.id, true);
    this.updateActiveRunwayConfiguration();
  }

  private removeSurfaceDisruption(id: string, reason: string): boolean {
    const disruption = this.state.surfaceDisruptions.find((candidate) => candidate.id === id);
    if (!disruption) return this.rejectDecision(`unknown surface restriction ${id}`);
    this.state.surfaceDisruptions = this.state.surfaceDisruptions.filter((candidate) => candidate.id !== id);
    this.syncClosedRunwayState();
    this.replanSurfaceTrafficAroundDisruptions(id, true);
    this.updateActiveRunwayConfiguration();
    this.decisionReason = reason;
    return true;
  }

  private removeSurfaceDisruptionsBySource(source: SurfaceDisruptionSource): void {
    const removed = this.state.surfaceDisruptions.filter((disruption) => disruption.source === source).map((disruption) => disruption.id);
    if (!removed.length) return;
    this.state.surfaceDisruptions = this.state.surfaceDisruptions.filter((disruption) => disruption.source !== source);
    this.syncClosedRunwayState();
    this.replanSurfaceTrafficAroundDisruptions(removed.join(','), true);
  }

  private syncClosedRunwayState(): void {
    this.closedRunway = this.state.surfaceDisruptions.find((disruption) => (
      disruption.kind === 'runway-closure' && disruption.runwayId !== undefined
    ))?.runwayId ?? null;
    this.state.closedRunway = this.closedRunway;
  }

  private runwayClosureLeavesCapacity(runwayId: number): boolean {
    const remaining = this.config.runways.filter((runway) => (
      runway.id !== runwayId
      && !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id)
    ));
    const hasArrival = remaining.some((runway) => {
      const role = this.runwayRole(runway.id);
      return role === 'arrival' || role === 'mixed';
    });
    const hasDeparture = remaining.some((runway) => {
      const role = this.runwayRole(runway.id);
      return role === 'departure' || role === 'mixed';
    });
    return hasArrival && hasDeparture;
  }

  private runwayClosureBlockingFlights(runwayId: number): Flight[] {
    return this.state.flights.filter((flight) => (
      flight.runway === runwayId
      && (
        flight.phase === 'landing'
        || flight.phase === 'takeoff'
        || ((flight.phase === 'taxi-in' || flight.phase === 'taxi-out') && flight.motion.protectedRunway)
      )
    ));
  }

  private rerouteApproachesFromClosedRunway(runwayId: number, disruption: SurfaceDisruptionState): void {
    const approaches = this.state.flights.filter((flight) => flight.runway === runwayId && flight.phase === 'approach');
    for (const flight of approaches) {
      const alternatives = this.config.runways
        .filter((runway) => runway.id !== runwayId)
        .filter((runway) => !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id))
        .filter((runway) => {
          const role = this.runwayRole(runway.id);
          return role === 'arrival' || role === 'mixed';
        })
        .filter((runway) => runwaySupportsAircraft(runway, flight.aircraft, 'landing'))
        .sort((first, second) => this.headwindComponent(second.id) - this.headwindComponent(first.id));
      const alternate = alternatives.find((runway) => !this.arrivalBlocked(runway.id)) ?? alternatives[0];
      if (!alternate) {
        flight.cleared = false;
        flight.safetyHold = true;
        flight.safetyHoldReason = `${disruption.label} closed and no compatible arrival runway is available`;
        continue;
      }
      this.goAround(flight, `${disruption.label} closed · re-sequencing to ${this.activeRunwayDesignation(alternate.id)}`);
      const alternateProcedure = this.terminalProcedure('STAR', alternate.id, flight.id + flight.flightPlan.revision);
      amendFlightPlan(flight.flightPlan, 'runway-change', this.state.elapsed, `${disruption.label} · missed approach to ${this.activeRunwayDesignation(alternate.id)}`, {
        procedureSelection: alternateProcedure,
        procedureDataVersion: this.config.airspaceProgram.dataVersion,
        runwayIntent: {
          runwayId: alternate.id,
          operatingEnd: this.preferredOperatingEnd(alternate.id),
          designation: this.activeRunwayDesignation(alternate.id),
        },
      });
      this.state.trafficFlow.totals.runwayChanges += 1;
      flight.runway = alternate.id;
      flight.operatingEnd = this.preferredOperatingEnd(alternate.id);
      flight.palette = alternate.color;
      flight.procedure = alternateProcedure.procedure.name;
      flight.navigation = this.navigationFor(alternateProcedure, 'arrival');
      flight.duration = this.phaseDuration(flight.aircraft, 'approach', alternate.id) * 2.4;
      this.planRunwayExit(flight, 'runway closure reroute');
      this.events.push({
        type: 'surface-reroute',
        flight,
        runway: alternate.id,
        detail: `${disruption.label} · missed approach and reassigned to ${this.activeRunwayDesignation(alternate.id)}`,
      });
      disruption.reroutedFlightIds.push(flight.id);
    }
  }

  private replanSurfaceTrafficAroundDisruptions(triggerId: string, force = false): number[] {
    const rerouted: number[] = [];
    const triggerIds = new Set(triggerId.split(','));
    for (const flight of this.state.flights.filter((candidate) => candidate.phase === 'taxi-in' || candidate.phase === 'taxi-out')) {
      if (flight.emergency === 'disabled') continue;
      if (force && !flight.surfaceReroute?.disruptionIds.some((id) => triggerIds.has(id))) continue;
      const result = this.replanSurfaceFlight(flight, [triggerId], force);
      if (result) rerouted.push(flight.id);
    }
    return rerouted;
  }

  private replanSurfaceFlight(flight: Flight, triggerIds: string[], force = false): boolean {
    const routeNodes = flight.surfaceRoute;
    const routeEdges = flight.surfaceRouteEdges;
    const sample = sampleSurfaceRouteWithEdges(this.config.surfaceGraph, routeNodes, routeEdges, flight.progress);
    if (!sample || !routeNodes?.length || !routeEdges?.length || sample.edgeIndex < 0) return false;
    const impacts = surfaceDisruptionsForRoute(this.state.surfaceDisruptions, routeEdges, sample.edgeIndex);
    if (!impacts.length && !force && flight.surfaceReroute?.status !== 'holding') return false;
    if (impacts.length && ['enroute', 'queued', 'positioning', 'treating'].includes(flight.deicing.status)) {
      return this.holdForUnavailableSurfaceRoute(flight, impacts.map((impact) => impact.id), 'surface restriction affects the assigned deicing movement; holding for a revised release');
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
      : sample.edgeIndex + 1;
    const routingStartNodeId = routeNodes[routingStartNodeIndex];
    if (!routingStartNodeId) return false;
    const prefixNodes = routeNodes.slice(0, routingStartNodeIndex + 1);
    const prefixEdges = routeEdges.slice(0, routingStartNodeIndex);
    const additionallyBlocked = new Set(prefixEdges);
    const planning = this.surfaceRoutePlanning(flight.id, additionallyBlocked);
    const profile = aircraftProfile(flight.aircraft);
    const suffix = findSurfaceRoute(
      this.config.surfaceGraph,
      routingStartNodeId,
      destinationNodeId,
      { wingspanM: profile.wingspanM, minimumWingtipClearanceM: profile.minimumWingtipClearanceM },
      planning,
    );
    const disruptionIds = impacts.length ? impacts.map((impact) => impact.id) : triggerIds;
    if (!suffix) {
      const labels = impacts.map((impact) => impact.label).join(', ') || 'surface restriction';
      return this.holdForUnavailableSurfaceRoute(flight, disruptionIds, `${labels} blocks every compatible pavement route`);
    }

    const nodeIds = [...prefixNodes, ...suffix.nodeIds.slice(1)];
    const edgeIds = [...prefixEdges, ...suffix.edgeIds];
    const total = sampleSurfaceRouteWithEdges(this.config.surfaceGraph, nodeIds, edgeIds, 1)?.totalDistance ?? 0;
    if (total <= 0) return this.holdForUnavailableSurfaceRoute(flight, disruptionIds, 'revised pavement route has no usable distance');
    const edgeById = new Map(this.config.surfaceGraph.edges.map((edge) => [edge.id, edge]));
    const route: SurfaceRoute = {
      nodeIds,
      edgeIds,
      distance: total,
      taxiwayIds: [...new Set(edgeIds.flatMap((edgeId) => {
        const taxiwayId = edgeById.get(edgeId)?.taxiwayId;
        return taxiwayId ? [taxiwayId] : [];
      }))],
      routingCost: total + suffix.congestionPenalty,
      congestionPenalty: suffix.congestionPenalty,
      congestedEdgeIds: [...suffix.congestedEdgeIds],
    };
    const previousEdgeIds = [...routeEdges];
    const oldTotal = sample.totalDistance;
    flight.surfaceRoute = nodeIds;
    flight.surfaceRouteEdges = edgeIds;
    flight.surfaceRoutingCost = route.routingCost;
    flight.surfaceCongestionPenalty = route.congestionPenalty;
    flight.surfaceCongestedEdgeIds = route.congestedEdgeIds;
    flight.progress = Math.max(0, Math.min(0.999999, sample.distanceAlong / total));
    flight.duration = this.surfaceRouteDuration(flight, route);
    flight.phaseElapsed = flight.duration * flight.progress;
    flight.requiredCrossings = surfaceRouteRunwayCrossings(this.config.surfaceGraph, edgeIds, flight.runway);
    const crossingWindows = surfaceRouteCrossingWindows(this.config.surfaceGraph, nodeIds, flight.progress, flight.runway, edgeIds);
    const completed = crossingWindows.filter((crossing) => crossing.exitProgress < flight.progress - 1e-6);
    flight.crossingClearanceIds = completed.map((crossing) => crossing.id);
    flight.crossingClearances = [...new Set(completed.map((crossing) => crossing.runwayId))];
    const revision = (flight.surfaceReroute?.revision ?? 0) + 1;
    const addedDistanceM = (total - oldTotal) * WORLD_METERS_PER_UNIT;
    flight.surfaceReroute = {
      revision,
      status: 'rerouted',
      selectedAtSeconds: this.state.elapsed,
      disruptionIds: [...new Set(disruptionIds)],
      previousEdgeIds,
      routeEdgeIds: [...edgeIds],
      addedDistanceM,
      reason: `pavement route amended around ${impacts.map((impact) => impact.label).join(', ') || 'cleared restriction'}`,
    };
    amendFlightPlan(flight.flightPlan, 'route-change', this.state.elapsed, `${flight.surfaceReroute.reason} · surface revision ${revision}`);
    this.state.trafficFlow.totals.routeAmendments += 1;
    flight.automaticHold = false;
    flight.automaticHoldReason = undefined;
    this.updateSurfaceRouteState(flight);
    syncFlightMotion(this.config, flight);
    this.events.push({
      type: 'surface-reroute',
      flight,
      runway: flight.runway,
      taxiway: flight.taxiway,
      detail: `${flight.surfaceReroute.reason} · ${addedDistanceM >= 0 ? '+' : ''}${Math.round(addedDistanceM)} m`,
    });
    for (const impact of impacts) if (!impact.reroutedFlightIds.includes(flight.id)) impact.reroutedFlightIds.push(flight.id);
    return true;
  }

  private holdForUnavailableSurfaceRoute(flight: Flight, disruptionIds: string[], reason: string): boolean {
    const changed = flight.surfaceReroute?.status !== 'holding' || flight.surfaceReroute.reason !== reason;
    const selectedAtSeconds = changed ? this.state.elapsed : flight.surfaceReroute?.selectedAtSeconds ?? this.state.elapsed;
    flight.surfaceReroute = {
      revision: (flight.surfaceReroute?.revision ?? 0) + (changed ? 1 : 0),
      status: 'holding',
      selectedAtSeconds,
      disruptionIds: [...new Set(disruptionIds)],
      previousEdgeIds: [...(flight.surfaceRouteEdges ?? [])],
      routeEdgeIds: [...(flight.surfaceRouteEdges ?? [])],
      addedDistanceM: 0,
      reason,
    };
    flight.automaticHold = true;
    flight.automaticHoldReason = reason;
    if (changed) this.events.push({ type: 'surface-reroute', flight, runway: flight.runway, taxiway: flight.taxiway, detail: `holding · ${reason}` });
    return changed;
  }

  private planRunwayExit(flight: Flight, reason: string, emit = true): boolean {
    const congestionPlanning = this.surfaceRoutePlanning(flight.id);
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
      competingPlans: this.state.flights.flatMap((other) => other.id === flight.id || !other.runwayExit ? [] : [{
        flightId: other.id,
        runwayId: other.runwayExit.runwayId,
        operatingEnd: other.runwayExit.operatingEnd,
        nodeId: other.runwayExit.nodeId,
        distanceFromThresholdM: other.runwayExit.distanceFromThresholdM,
        taxiRouteEdgeIds: other.runwayExit.taxiRouteEdgeIds,
      }]),
    });
    const previous = flight.runwayExit;
    flight.runwayExit = selection?.state;
    const changed = Boolean(selection && (
      previous?.nodeId !== selection.state.nodeId
      || previous.brakingAction !== selection.state.brakingAction
      || previous.routeDistanceM !== selection.state.routeDistanceM
      || previous.safe !== selection.state.safe
    ));
    if (emit && changed) {
      this.events.push({
        type: 'runway-exit-plan',
        flight,
        runway: flight.runway,
        taxiway: selection?.state.taxiwayName,
        detail: this.runwayExitDetail(selection?.state, reason),
      });
    }
    return Boolean(selection?.state.safe);
  }

  private runwayExitDetail(exit: FlightRunwayExitState | undefined, reason: string): string {
    if (!exit) return `${reason} · no pavement-connected exit route available`;
    const margin = exit.stoppingMarginM >= 0
      ? `${Math.round(exit.stoppingMarginM)} m margin`
      : `${Math.round(Math.abs(exit.stoppingMarginM))} m shortfall`;
    return `${reason} · ${exit.taxiwayName} · ${exit.brakingAction} braking · ${Math.round(exit.targetExitSpeedKts)} kt · ${margin}`;
  }

  private assignSurfaceRoute(flight: Flight, phase: 'taxi-in' | 'resting' | 'taxi-out'): void {
    const stand = this.config.surfaceGraph.stands.find((item) => item.slot === flight.gateSlot);
    const profile = aircraftProfile(flight.aircraft);
    const routeRequirements = {
      wingspanM: profile.wingspanM,
      minimumWingtipClearanceM: profile.minimumWingtipClearanceM,
    };
    const congestionPlanning = this.surfaceRoutePlanning(flight.id);
    let route = surfaceRouteForFlight(
      this.config.surfaceGraph,
      flight.runway,
      flight.operatingEnd,
      phase,
      flight.gateSlot,
      routeRequirements,
      congestionPlanning,
      phase === 'taxi-in' ? flight.runwayExit?.nodeId : undefined,
    );
    if (phase === 'taxi-out' && winterDeicingRequired(this.state.weather)) {
      const deicingPlan = planDeicingTaxiRoute(this.config, flight, congestionPlanning);
      if (deicingPlan) {
        route = deicingPlan.route;
        applyDeicingRoutePlan(flight, deicingPlan, 'enroute');
      } else {
        flight.deicing = {
          ...createDeicingState('No compatible route to an available deicing facility.'),
          required: true,
          status: 'unavailable',
          cycle: Math.max(1, flight.deicing.cycle),
        };
      }
    } else if (phase === 'taxi-out' && !winterDeicingRequired(this.state.weather)) {
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
    const prospectiveDeicingFlight = phase === 'resting'
      ? {
          ...flight,
          runway: flight.departureRunway,
          operatingEnd: this.preferredOperatingEnd(flight.departureRunway),
          deicing: { ...flight.deicing },
        }
      : flight;
    const prospectiveDeicingPlan = phase === 'resting' && winterDeicingRequired(this.state.weather)
      ? planDeicingTaxiRoute(this.config, prospectiveDeicingFlight, congestionPlanning)
      : null;
    if (phase === 'resting' && winterDeicingRequired(this.state.weather)) {
      if (prospectiveDeicingPlan) applyDeicingRoutePlan(flight, prospectiveDeicingPlan, 'planned');
      else {
        flight.deicing = {
          ...createDeicingState('No compatible route to an available deicing facility.'),
          required: true,
          status: 'unavailable',
          cycle: Math.max(1, flight.deicing.cycle),
        };
      }
    } else if (phase === 'resting' && !winterDeicingRequired(this.state.weather)) {
      markDeicingNotRequired(flight);
    }
    const prospectiveRoute = phase === 'resting'
      ? prospectiveDeicingPlan?.route ?? surfaceRouteForFlight(
          this.config.surfaceGraph,
          flight.departureRunway,
          this.preferredOperatingEnd(flight.departureRunway),
          'taxi-out',
          flight.gateSlot,
          routeRequirements,
          congestionPlanning,
        )
      : phase === 'taxi-out'
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
    if (phase === 'resting') flight.duration = flight.turnaround.plannedDurationSeconds;
    else if (route) {
      flight.duration = this.surfaceRouteDuration(flight, route);
      flight.requiredCrossings = surfaceRouteRunwayCrossings(this.config.surfaceGraph, route.edgeIds, flight.runway);
      const crossingWindows = surfaceRouteCrossingWindows(
        this.config.surfaceGraph,
        route.nodeIds,
        flight.progress,
        flight.runway,
        route.edgeIds,
      );
      const validCrossingIds = new Set(crossingWindows.map((crossing) => crossing.id));
      flight.crossingClearanceIds = (flight.crossingClearanceIds ?? []).filter((id) => validCrossingIds.has(id));
      flight.crossingClearances = [...new Set(crossingWindows
        .filter((crossing) => flight.crossingClearanceIds?.includes(crossing.id))
        .map((crossing) => crossing.runwayId))];
    }
    if (phase === 'resting') {
      const apron = this.config.surfaceGraph.taxiways.find((taxiway) => taxiway.id === stand?.apronTaxiwayId);
      flight.taxiway = apron?.name ?? 'Terminal Apron';
      this.updateSurfaceRouteState(flight);
      return;
    }
    const firstTaxiwayId = route?.taxiwayIds[0];
    flight.taxiway = this.config.surfaceGraph.taxiways.find((taxiway) => taxiway.id === firstTaxiwayId)?.name ?? this.taxiwayName(flight.runway);
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
    return Math.max(18, distance * WORLD_METERS_PER_UNIT / Math.max(1, taxiMps) * weatherFactor);
  }

  private updateServiceVehicles(delta: number): void {
    for (const vehicle of this.state.serviceVehicles) {
      const flight = this.state.flights.find((candidate) => candidate.id === vehicle.flightId);
      if (!flight) continue;
      const task = flight.turnaround.tasks.find((candidate) => candidate.type === vehicle.service);
      if (!task?.required) continue;
      if (vehicle.status === 'scheduled' && this.state.elapsed + 1e-6 >= vehicle.dispatchAtSeconds) {
        if (vehicle.prepositionAtStand) {
          this.tryPrepositionServiceVehicle(flight, vehicle);
          continue;
        }
        setServiceVehicleStatus(this.config.surfaceGraph, vehicle, 'dispatching');
        this.emitServiceVehicleEvent('service-vehicle-dispatch', flight, vehicle, `${vehicle.label} dispatched from ramp staging`);
        continue;
      }
      if (vehicle.status === 'dispatching' && advanceServiceVehicleMotion(this.config.surfaceGraph, vehicle, delta)) {
        setServiceVehicleStatus(this.config.surfaceGraph, vehicle, 'staged');
        continue;
      }
      if (vehicle.status === 'staged') {
        const dependenciesComplete = task.dependencies.every((dependency) => {
          const prerequisite = flight.turnaround.tasks.find((candidate) => candidate.type === dependency);
          return !prerequisite?.required || prerequisite.status === 'complete';
        });
        const earliest = (flight.turnaround.actualStartSeconds ?? this.state.elapsed) + task.scheduledStartOffsetSeconds;
        if (
          flight.phase === 'resting'
          && dependenciesComplete
          && this.state.elapsed + 1e-6 >= earliest
          && this.serviceStandLaneAvailable(vehicle)
        ) {
          setServiceVehicleStatus(this.config.surfaceGraph, vehicle, 'approaching');
        }
        continue;
      }
      if (vehicle.status === 'approaching' && advanceServiceVehicleMotion(this.config.surfaceGraph, vehicle, delta)) {
        setServiceVehicleStatus(this.config.surfaceGraph, vehicle, 'servicing');
        this.emitServiceVehicleEvent('service-vehicle-arrive', flight, vehicle, `${vehicle.label} in position at ${vehicle.standId}`);
        continue;
      }
      if (vehicle.status === 'servicing' && task.status === 'complete' && this.serviceStandLaneAvailable(vehicle)) {
        setServiceVehicleStatus(this.config.surfaceGraph, vehicle, 'clearing');
        this.emitServiceVehicleEvent('service-vehicle-return', flight, vehicle, `${vehicle.label} service complete · clearing the stand`);
        continue;
      }
      if (vehicle.status === 'clearing' && advanceServiceVehicleMotion(this.config.surfaceGraph, vehicle, delta)) {
        setServiceVehicleStatus(this.config.surfaceGraph, vehicle, 'returning');
        this.emitServiceVehicleEvent('service-vehicle-clear', flight, vehicle, `${vehicle.label} clear of the stand lane`);
        continue;
      }
      if (vehicle.status === 'returning' && advanceServiceVehicleMotion(this.config.surfaceGraph, vehicle, delta)) {
        setServiceVehicleStatus(this.config.surfaceGraph, vehicle, 'complete');
        continue;
      }
      syncServiceVehiclePose(this.config.surfaceGraph, vehicle);
    }
    const liveFlightIds = new Set(this.state.flights.map((flight) => flight.id));
    this.state.serviceVehicles = this.state.serviceVehicles.filter((vehicle) => liveFlightIds.has(vehicle.flightId));
  }

  /** Only one vehicle may enter a stand-side connector at a time. */
  private serviceStandLaneAvailable(vehicle: ServiceVehicleState): boolean {
    return !this.state.serviceVehicles.some((other) => (
      other.id !== vehicle.id
      && other.standId === vehicle.standId
      && other.standSide === vehicle.standSide
      && (
        other.status === 'approaching'
        || other.status === 'clearing'
        || (other.status === 'dispatching' && other.currentEdge === undefined)
        || (other.status === 'returning' && other.currentEdge === undefined)
      )
    ));
  }

  private tryPrepositionServiceVehicle(flight: Flight, vehicle: ServiceVehicleState): boolean {
    const preview: ServiceVehicleState = {
      ...vehicle,
      outboundRoute: [...vehicle.outboundRoute],
      outboundRouteEdges: [...vehicle.outboundRouteEdges],
      returnRoute: [...vehicle.returnRoute],
      returnRouteEdges: [...vehicle.returnRouteEdges],
      standPath: vehicle.standPath.map((point) => [...point]),
    };
    setServiceVehicleStatus(this.config.surfaceGraph, preview, 'staged');
    const others = this.state.serviceVehicles.filter((candidate) => candidate.id !== vehicle.id);
    const blocked = findServiceVehicleConflicts(
      this.config,
      [preview, ...others],
      this.state.flights,
    ).some((conflict) => conflict.vehicle === preview.id || conflict.otherVehicle === preview.id);
    if (blocked) return false;
    setServiceVehicleStatus(this.config.surfaceGraph, vehicle, 'staged');
    this.emitServiceVehicleEvent(
      'service-vehicle-dispatch',
      flight,
      vehicle,
      `${vehicle.label} pre-positioned at ${vehicle.standId} before gate-in`,
    );
    return true;
  }

  private emitServiceVehicleEvent(type: AirportEvent['type'], flight: Flight, vehicle: ServiceVehicleState, detail: string): void {
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
    const vehicles = this.state.serviceVehicles.filter((vehicle) => vehicle.flightId === flight.id);
    const transitions = advanceTurnaround(flight.turnaround, this.state.elapsed, availableVehicleServices(flight, vehicles));
    flight.phaseElapsed = flight.turnaround.elapsedSeconds;
    flight.progress = flight.turnaround.progress;
    flight.kinematics.fuelPercent = turnaroundFuelPercent(flight.turnaround);
    this.emitTurnaroundTransitions(flight, transitions);
  }

  private emitTurnaroundTransitions(flight: Flight, transitions: TurnaroundTransition[]): void {
    for (const transition of transitions) {
      const task = transition.service
        ? flight.turnaround.tasks.find((candidate) => candidate.type === transition.service)
        : undefined;
      const detail = transition.type === 'turnaround-ready'
        ? 'all required services complete · pushback eligible'
        : `${task?.label ?? transition.service} ${transition.type === 'service-start' ? 'started' : 'complete'}`;
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
    const sample = sampleSurfaceRouteWithEdges(this.config.surfaceGraph, flight.surfaceRoute, flight.surfaceRouteEdges, flight.progress);
    if (sample) {
      flight.surfaceNode = sample.nearestNodeId;
      flight.surfaceEdge = sample.edge?.id;
      if (sample.edge?.taxiwayId) flight.taxiway = sample.edge.name;
    }
    if (flight.phase !== 'taxi-in' && flight.phase !== 'resting' && flight.phase !== 'taxi-out') return;
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
    flight.rampControlZoneCapacity = operation.rampControlZoneCapacity ?? undefined;
    flight.surfaceAlleyId = operation.alleyId ?? undefined;
    flight.surfaceFlowDirection = operation.flowDirection;
    flight.standPath = operation.standPath ?? undefined;
  }

  private surfaceTrafficMovements(): SurfaceTrafficMovement[] {
    return this.state.flights
      .filter((flight): flight is Flight & { phase: 'taxi-in' | 'taxi-out' } => (
        flight.phase === 'taxi-in' || flight.phase === 'taxi-out'
      ))
      .map((flight) => ({
        flightId: flight.id,
        phase: flight.phase,
        nodeIds: flight.surfaceRoute,
        edgeIds: flight.surfaceRouteEdges,
        progress: flight.progress,
      }));
  }

  private surfaceRoutePlanning(excludedFlightId?: number, additionallyBlocked: ReadonlySet<string> = new Set()): SurfaceRoutePlanning {
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

  private nextUnclearedCrossing(flight: Flight): SurfaceRouteCrossingWindow | null {
    const clearanceIds = new Set(flight.crossingClearanceIds ?? []);
    const legacyClearances = flight.crossingClearanceIds === undefined ? new Set(flight.crossingClearances ?? []) : null;
    return surfaceRouteCrossingWindows(this.config.surfaceGraph, flight.surfaceRoute, flight.progress, flight.runway, flight.surfaceRouteEdges)
      .find((crossing) => (
        !clearanceIds.has(crossing.id)
        && !legacyClearances?.has(crossing.runwayId)
        && crossing.exitProgress + 1e-6 >= flight.progress
      )) ?? null;
  }

  private activeClearedCrossingRunways(flight: Flight): number[] {
    const clearanceIds = new Set(flight.crossingClearanceIds ?? []);
    const legacyClearances = flight.crossingClearanceIds === undefined ? new Set(flight.crossingClearances ?? []) : null;
    return surfaceRouteCrossingWindows(this.config.surfaceGraph, flight.surfaceRoute, flight.progress, flight.runway, flight.surfaceRouteEdges)
      .filter((crossing) => (
        (clearanceIds.has(crossing.id) || Boolean(legacyClearances?.has(crossing.runwayId)))
        && crossing.distanceToHold * WORLD_METERS_PER_UNIT <= CROSSING_CLEARANCE_RANGE_M
        && flight.progress <= crossing.exitProgress + 0.002
      ))
      .map((crossing) => crossing.runwayId);
  }

  private grantPushbackClearance(flight: Flight, automatic: boolean): void {
    flight.pushbackCleared = true;
    this.decisionReason = `${automatic ? 'automatic ' : ''}${flight.pushbackDirection} pushback clearance accepted`;
    this.events.push({
      type: 'pushback-clearance',
      flight,
      taxiway: flight.taxiway,
      detail: `${automatic ? 'automatic' : 'ground'} · push ${flight.pushbackDirection}`,
    });
  }

  private updatePushbackState(flight: Flight): void {
    if (flight.phase !== 'taxi-out') return;
    if (flight.pushbackReleaseProgress <= 0) {
      flight.pushbackProgress = 1;
      flight.tugAttached = false;
      flight.engineState = 'running';
      return;
    }
    const release = Math.max(0.001, flight.pushbackReleaseProgress);
    const pushbackProgress = Math.max(0, Math.min(1, flight.progress / release));
    flight.pushbackProgress = pushbackProgress;
    if (pushbackProgress < 1) {
      flight.tugAttached = true;
      if (flight.engineState === 'off') flight.engineState = 'starting';
      if (pushbackProgress >= 0.62) flight.engineState = 'running';
      return;
    }
    if (flight.tugAttached) {
      flight.tugAttached = false;
      this.events.push({ type: 'tug-release', flight, taxiway: flight.taxiway, detail: 'tug clear · taxi power available' });
    }
    this.releaseGate(flight);
    flight.engineState = 'running';
  }

  private grantCrossingClearance(flight: Flight, crossing: SurfaceRouteCrossingWindow): void {
    const runway = crossing.runwayId;
    flight.crossingClearanceIds ??= [];
    flight.crossingClearances ??= [];
    if (flight.crossingClearanceIds.includes(crossing.id)) return;
    flight.crossingClearanceIds.push(crossing.id);
    if (!flight.crossingClearances.includes(runway)) flight.crossingClearances.push(runway);
    flight.crossingHoldRunway = undefined;
    flight.crossingHoldPointId = undefined;
    this.events.push({ type: 'runway-crossing', flight, runway, taxiway: flight.taxiway });
  }

  private intersectingRunways(runwayId: number): number[] {
    return intersectingRunways(this.config, runwayId);
  }

  private runwaysConflict(firstId: number, secondId: number): boolean {
    return runwaysConflict(this.config, firstId, secondId);
  }

  private updateWeather(): void {
    const previousCondition = this.state.weather.condition;
    const previousSurfaceCondition = this.state.weather.surfaceCondition;
    const overridden = this.state.elapsed < this.weatherOverrideUntil;
    if (!this.state.weather.weatherEnabled) {
      this.state.weather.condition = 'clear';
    } else if (!overridden) {
      const pattern: WeatherCondition[] = deicingFacilities(this.config.surfaceGraph).length
        // A winter bank must last long enough for an ORD departure to reach
        // the remote pad, queue, receive treatment, and use its holdover time.
        ? ['clear', 'rain', 'clear', 'fog', 'clear', 'snow', 'snow', 'snow', 'snow', 'snow', 'snow']
        : ['clear', 'rain', 'clear', 'fog', 'clear', 'rain'];
      this.state.weather.condition = pattern[Math.floor((this.state.elapsed + this.config.seed % 60) / 60) % pattern.length];
    }
    if (!this.state.weather.windEnabled) {
      this.state.weather.windSpeed = 0;
      this.state.weather.gustSpeed = 0;
    } else {
      if (!overridden) {
        this.state.weather.windDirection = this.normalizeAngle(this.baseWindDirection + Math.sin(this.state.elapsed * 0.006) * 0.48);
        this.state.weather.windSpeed = Math.max(2, this.baseWindSpeed + Math.sin(this.state.elapsed * 0.035 + this.config.seed) * 2.8);
      }
      const condition = this.state.weather.condition;
      this.state.weather.gustSpeed = this.state.weather.windSpeed + (condition === 'clear' ? 3 : 6 + Math.sin(this.state.elapsed * 0.11) * 2);
    }
    const condition = this.state.weather.condition;
    this.state.weather.visibility = condition === 'fog' ? 2.5 : condition === 'snow' ? 3 : condition === 'rain' ? 4.5 : 10;
    this.state.weather.ceilingFt = condition === 'fog' ? 600 : condition === 'snow' ? 1_000 : condition === 'rain' ? 2_500 : 12_000;
    this.state.weather.temperatureC = condition === 'snow'
      ? -5 + Math.sin(this.state.elapsed * 0.015 + this.config.seed) * 1.5
      : condition === 'rain'
        ? 9
        : condition === 'fog'
          ? 7
          : 18;
    this.state.weather.surfaceCondition = condition === 'snow' ? 'contaminated' : condition === 'rain' || condition === 'fog' ? 'wet' : 'dry';
    if (condition !== previousCondition) this.refreshDeicingPlansForWeather();
    if (this.state.weather.surfaceCondition !== previousSurfaceCondition) {
      for (const flight of this.state.flights) {
        if (flight.phase === 'approach' && !flight.goAround && !flight.diversion) this.planRunwayExit(flight, 'braking action changed');
      }
    }
    this.updateActiveRunwayConfiguration();
  }

  private headwindComponent(runwayId: number): number {
    if (!this.state.weather.windEnabled) return 0;
    const runway = this.config.runways[runwayId];
    const operatingHeading = runway.heading + (this.preferredOperatingEnd(runwayId) === 1 ? Math.PI : 0);
    return this.state.weather.windSpeed * Math.cos(this.state.weather.windDirection - operatingHeading);
  }

  private preferredOperatingEnd(runwayId: number): -1 | 1 {
    return this.state.activeRunwayEnds[runwayId] ?? this.config.runways[runwayId].landingEnd;
  }

  private runwayRole(runwayId: number): RunwayOperationalRole {
    return this.state.activeRunwayRoles[runwayId] ?? this.config.runways[runwayId]?.role ?? 'inactive';
  }

  private updateActiveRunwayConfiguration(): void {
    let target: AirportRunwayConfiguration | null = null;
    let reason = 'automatic wind and procedure selection';
    if (this.runwayConfigurationOverrideId) {
      const override = this.config.runwayConfigurations.find(
        (configuration) => configuration.id === this.runwayConfigurationOverrideId,
      );
      const restriction = override ? this.configurationRestrictionReason(override) : 'configuration no longer exists';
      if (override && !restriction) {
        target = override;
        reason = 'supervisor selection';
      } else {
        this.runwayConfigurationOverrideId = null;
        this.state.runwayConfigurationMode = 'automatic';
      }
    }
    target ??= this.selectAutomaticRunwayConfiguration();
    this.requestRunwayConfiguration(target, reason);
  }

  private selectAutomaticRunwayConfiguration(): AirportRunwayConfiguration {
    const fallback = this.config.runwayConfigurations.find(
      (configuration) => configuration.id === this.config.defaultRunwayConfigurationId,
    ) ?? this.config.runwayConfigurations[0];
    const eligible = this.config.runwayConfigurations.filter((configuration) => (
      configuration.restrictions.autoSelectable
      && this.configurationRestrictionReason(configuration) === null
    ));
    if (!eligible.length) return fallback;
    if (!this.state.weather.windEnabled) {
      return eligible.find((configuration) => configuration.id === fallback.id) ?? eligible[0];
    }
    return [...eligible]
      .map((configuration) => ({
        configuration,
        score: this.runwayConfigurationHeadwindScore(configuration)
          + configuration.selectionPriority
          + (configuration.id === this.state.runwayConfigurationId ? 0.05 : 0),
      }))
      .sort((first, second) => second.score - first.score || first.configuration.id.localeCompare(second.configuration.id))[0]
      .configuration;
  }

  private configurationRestrictionReason(configuration: AirportRunwayConfiguration): string | null {
    const restrictions = configuration.restrictions;
    if (!restrictions.conditions.includes(this.state.weather.condition)) {
      return `${this.state.weather.condition} weather is outside this procedure`;
    }
    if (restrictions.minimumVisibilityMiles !== undefined
      && this.state.weather.visibility < restrictions.minimumVisibilityMiles) {
      return `visibility must be at least ${restrictions.minimumVisibilityMiles} mi`;
    }
    if (restrictions.scenarios && !restrictions.scenarios.includes(this.state.scenario)) {
      return `reserved for ${restrictions.scenarios.join('/')} traffic`;
    }
    if (restrictions.minimumWindSpeedKts !== undefined) {
      if (!this.state.weather.windEnabled) return 'wind must be enabled';
      if (this.state.weather.windSpeed < restrictions.minimumWindSpeedKts) {
        return `wind must be at least ${restrictions.minimumWindSpeedKts} kt`;
      }
    }
    if (restrictions.preferredWindDirectionDegrees !== undefined
      && restrictions.windDirectionToleranceDegrees !== undefined) {
      if (!this.state.weather.windEnabled) return 'wind must be enabled';
      const windDegrees = (90 - this.state.weather.windDirection * 180 / Math.PI + 360) % 360;
      const difference = Math.abs(((windDegrees - restrictions.preferredWindDirectionDegrees + 540) % 360) - 180);
      if (difference > restrictions.windDirectionToleranceDegrees) {
        return `wind must be within ${restrictions.windDirectionToleranceDegrees}° of ${restrictions.preferredWindDirectionDegrees}°`;
      }
    }
    const usableArrival = configuration.arrivalRunwayIds.some((runwayId) => !runwayClosedByDisruption(this.state.surfaceDisruptions, runwayId));
    const usableDeparture = configuration.departureRunwayIds.some((runwayId) => !runwayClosedByDisruption(this.state.surfaceDisruptions, runwayId));
    if (!usableArrival || !usableDeparture) return 'the active closure removes a required runway role';
    return null;
  }

  private requestRunwayConfiguration(configuration: AirportRunwayConfiguration, reason: string): void {
    const changedRunwayIds = this.config.runways
      .filter((runway) => (
        this.preferredOperatingEnd(runway.id) !== (configuration.operatingEnds[runway.id] ?? runway.landingEnd)
        || this.runwayRole(runway.id) !== (configuration.runwayRoles[runway.id] ?? runway.role)
      ))
      .map((runway) => runway.id);
    if (configuration.id === this.state.runwayConfigurationId && changedRunwayIds.length === 0) {
      this.state.runwayConfigurationTransition = null;
      return;
    }
    const changed = new Set(changedRunwayIds);
    const blockingFlightIds = this.state.flights
      .filter((flight) => flight.phase !== 'resting' && changed.has(flight.runway))
      .map((flight) => flight.id)
      .sort((first, second) => first - second);
    if (blockingFlightIds.length) {
      const previous = this.state.runwayConfigurationTransition;
      this.state.runwayConfigurationTransition = {
        targetId: configuration.id,
        requestedAt: previous?.targetId === configuration.id ? previous.requestedAt : this.state.elapsed,
        reason,
        changedRunwayIds,
        blockingFlightIds,
      };
      return;
    }
    this.applyRunwayConfiguration(configuration);
  }

  private applyRunwayConfiguration(configuration: AirportRunwayConfiguration): void {
    this.state.runwayConfigurationId = configuration.id;
    this.state.activeRunwayEnds = Object.fromEntries(this.config.runways.map((runway) => [
      runway.id,
      configuration.operatingEnds[runway.id] ?? runway.landingEnd,
    ])) as Record<number, -1 | 1>;
    this.state.activeRunwayRoles = Object.fromEntries(this.config.runways.map((runway) => [
      runway.id,
      configuration.runwayRoles[runway.id] ?? runway.role,
    ])) as Record<number, RunwayOperationalRole>;
    this.state.runwayConfigurationTransition = null;
  }

  private runwayConfigurationHeadwindScore(configuration: AirportRunwayConfiguration): number {
    const activeRunways = this.config.runways.filter((runway) => (
      (configuration.runwayRoles[runway.id] ?? runway.role) !== 'inactive'
    ));
    if (!activeRunways.length) return -Infinity;
    return activeRunways.reduce((score, runway) => {
      const end = configuration.operatingEnds[runway.id] ?? runway.landingEnd;
      const heading = runway.heading + (end === 1 ? Math.PI : 0);
      return score + Math.cos(this.state.weather.windDirection - heading);
    }, 0) / activeRunways.length;
  }

  private weatherDurationMultiplier(phase: FlightPhase): number {
    const condition = this.state.weather.condition;
    if (condition === 'clear' || phase === 'resting') return 1;
    if (condition === 'rain') return phase === 'taxi-in' || phase === 'taxi-out' ? 1.2 : phase === 'landing' || phase === 'takeoff' ? 1.12 : 1.08;
    if (condition === 'snow') return phase === 'taxi-in' || phase === 'taxi-out' ? 1.5 : phase === 'landing' || phase === 'takeoff' ? 1.35 : 1.22;
    return phase === 'taxi-in' || phase === 'taxi-out' ? 1.35 : phase === 'landing' || phase === 'approach' ? 1.25 : 1.12;
  }

  private normalizeAngle(angle: number): number {
    return (angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  }

  private runwayBlocker(runway: number, excludingFlightId: number): Flight | null {
    return this.state.flights.find((flight) => {
      if (flight.id === excludingFlightId) return false;
      if (this.activeClearedCrossingRunways(flight).some((crossingRunway) => this.runwaysConflict(runway, crossingRunway))) return true;
      if (!this.runwaysConflict(runway, flight.runway)) return false;
      return (flight.phase === 'approach' && flight.progress > 0.68)
        || flight.phase === 'landing'
        || flight.phase === 'takeoff'
        || (flight.phase === 'taxi-in' && flight.progress < 0.3)
        || (flight.phase === 'taxi-out' && flight.progress > 0.96);
    }) ?? null;
  }

  private rejectDecision(reason: string, flight?: Flight): false {
    this.decisionReason = reason;
    if (flight) this.events.push({ type: 'reject', flight, runway: flight.runway, taxiway: flight.taxiway, detail: reason });
    return false;
  }

  private stationRunsAutomatically(station: OperationalControllerStation): boolean {
    return this.isAutomaticMode() || this.state.stationAutomation[station];
  }

  private isAutomaticMode(): boolean {
    return this.state.mode === 'auto' || this.state.mode === 'watch';
  }
}

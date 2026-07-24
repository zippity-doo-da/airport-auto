import type { AirportConfig, AirportRunwayConfiguration, RunwayOperationalRole } from './airportConfig';
import type { AirportEvent, AirportState, ClearanceProposal, ConflictPrediction, ControlMode, ControllerStation, EmergencyType, Flight, FlightInstruction, FlightOperationPlan, FlightPhase, FlightRunwayExitState, ServiceVehicleState, ShiftMetrics, SurfaceDisruptionKind, SurfaceDisruptionSource, SurfaceDisruptionState, TrafficScenario, WeatherCondition } from './types';
import { AIRCRAFT_ROSTER, aircraftProfile, type AircraftModel } from './aircraftProfiles';
import { AIRPORT_AIRLINES, airlineProfile, type AirlineCode } from './airlineProfiles';
import { aircraftCollisionEnvelope, detectCommittedRunwaySweepConflict, detectFlightConflict, findFlightConflicts, findObstacleConflicts, findProposedConflict } from './collisionDetection';
import { findSurfaceRoute, sampleSurfaceRouteWithEdges, surfacePushbackPlan, surfaceRouteCrossingWindows, surfaceRouteForFlight, surfaceRouteRunwayCrossings, validateAirportSurfaceGraph, type SurfaceGraphValidation, type SurfaceRoute, type SurfaceRouteCrossingWindow, type SurfaceRoutePlanning } from './surfaceGraph';
import { validateAirportObstacleEnvelopes, type AirportObstacleValidation } from './airportObstacles';
import { departureTrajectoryTiming, landingTrajectoryTiming } from './flightTrajectory';
import { runwaySupportsAircraft, WORLD_METERS_PER_UNIT } from './runwayPerformance';
import { sampleAircraftSurfaceMotion } from './surfaceMotion';
import { progressAfterDistance, syncFlightMotion } from './flightMotion';
import { intersectingRunways, runwaysConflict } from './runwayConflict';
import { SurfaceReservationLedger, surfaceCongestionPlanning, surfaceRouteOperationalState, surfaceRouteReservationClaims, type SurfaceReservationClaim, type SurfaceTrafficMovement } from './surfaceOperations';
import { GATE_TURN_BUFFER_SECONDS, gateReservationsOverlap, planGateAssignment, type GateReservation } from './gateAssignment';
import { advanceTurnaround, completeTurnaround, createTurnaroundPlan, releaseTurnaround, scheduleTurnaround, startTurnaround, turnaroundBlockingServices, turnaroundFuelPercent, type TurnaroundTransition } from './turnaroundOperations';
import { advanceServiceVehicleMotion, availableVehicleServices, createServiceVehiclePlans, findServiceVehicleConflicts, serviceVehicleOwnerId, serviceVehicleReservationClaims, serviceVehicleRouteViolations, serviceVehiclesBlockingPushback, setServiceVehicleStatus, syncServiceVehiclePose } from './serviceVehicleOperations';
import { applyDeicingRoutePlan, createDeicingState, deicingFacilities, deicingMovementLimit, deicingReleaseValid, markDeicingNotRequired, markStartupPretreated, planDeicingTaxiRoute, winterDeicingRequired } from './deicingOperations';
import { selectRunwayExit } from './runwayExitSelection';
import { resolveSurfaceDisruptionTarget, runwayClosedByDisruption, surfaceDisruptionBlockedEdgeIds, surfaceDisruptionsForRoute } from './surfaceDisruptions';
import { buildOperationQueueSnapshot, type OperationQueueSnapshot } from './operationQueues';
import { airportOperationStateAt, selectOperationTrafficClass, type AirportOperationProfile, type AirportOperationState, type OperationTrafficClass } from './airportOperationProfiles';

const PHASE_DURATION: Record<FlightPhase, number> = {
  approach: 38,
  landing: 34,
  'taxi-in': 18,
  resting: 10,
  'taxi-out': 20,
  takeoff: 48,
};

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
    weather: { weatherEnabled: false, windEnabled: false, condition: 'clear', windDirection: Math.PI, windSpeed: 0, gustSpeed: 0, visibility: 10, temperatureC: 18, surfaceCondition: 'dry' },
    scenario: 'normal',
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
  };

  private readonly stationarySeconds = new Map<number, number>();
  private decisionReason = 'accepted';

  constructor(private readonly config: AirportConfig) {
    this.spawnIn = Math.min(3, this.arrivalSpacing() * 0.55);
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
        if (flight.phase === 'approach' && !flight.cleared && !flight.goAround) {
          flight.cleared = true;
          flight.clearanceLeft = 99;
          this.events.push({ type: 'auto-clear', flight });
        }
        if (flight.phase === 'takeoff' && !flight.takeoffCleared) {
          flight.takeoffCleared = true;
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

  setNightMode(enabled: boolean): void {
    this.state.nightMode = enabled;
    this.updateActiveRunwayConfiguration();
  }

  setStation(station: ControllerStation): void {
    this.state.station = station;
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

  canIssue(kind: 'approach' | 'tower' | 'ground'): boolean {
    const station = this.state.station;
    if (station === 'supervisor') return true;
    if (kind === 'approach') return station === 'approach' || station === 'tower';
    if (kind === 'tower') return station === 'tower';
    return station === 'ground';
  }

  triggerEmergency(id: number, type: EmergencyType): boolean {
    const flight = this.state.flights.find((item) => item.id === id && item.phase !== 'resting');
    if (!flight) return this.rejectDecision('flight is not available for that instruction');
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
      if (flight.phase === 'approach' && !flight.cleared && !flight.goAround) {
        proposals.push({
          id: `${flight.id}:land:${flight.runway}`,
          flightId: flight.id,
          action: 'land',
          runway: flight.runway,
          station: 'approach',
          label: `Clear to land ${this.activeRunwayDesignation(flight.runway)}`,
          reason: flight.progress > 0.72
            ? 'Established on final; landing clearance is becoming time-critical.'
            : 'Approach is stable and the assigned runway sequence is protected.',
          priority: flight.progress > 0.82 ? 'urgent' : flight.progress > 0.62 ? 'attention' : 'routine',
        });
      }
      if ((flight.phase === 'approach' || flight.phase === 'landing') && flight.safetyHold) {
        proposals.push({
          id: `${flight.id}:go-around`, flightId: flight.id, action: 'go-around', runway: flight.runway, station: 'approach',
          label: 'Issue go-around', reason: flight.safetyHoldReason ?? 'Protected approach spacing cannot be maintained.', priority: 'urgent',
        });
      }
      if (flight.phase === 'resting' && flight.turnaround.status === 'ready' && !flight.pushbackCleared) {
        proposals.push({
          id: `${flight.id}:pushback`, flightId: flight.id, action: 'pushback', station: 'ground',
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
    for (let firstIndex = 0; firstIndex < active.length; firstIndex += 1) {
      const first = active[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < active.length; secondIndex += 1) {
        const second = active[secondIndex];
        if (!this.runwaysConflict(first.runway, second.runway)) continue;
        const firstAirborne = first.phase === 'approach' || first.phase === 'landing';
        const secondAirborne = second.phase === 'approach' || second.phase === 'landing';
        if (firstAirborne && secondAirborne && Math.abs(first.progress - second.progress) < 0.24) {
          predictions.push({ severity: 'warning', type: 'separation', flights: [first.id, second.id], runway: first.runway, etaSeconds: Math.max(1, Math.round((1 - Math.max(first.progress, second.progress)) * 18)), detail: `${first.callsign} and ${second.callsign} are compressing on the same runway` });
        } else if (first.phase === 'taxi-out' && first.progress > 0.74 && secondAirborne) {
          predictions.push({ severity: 'caution', type: 'runway', flights: [first.id, second.id], runway: first.runway, etaSeconds: Math.max(1, Math.round((1 - first.progress) * 20)), detail: `${first.callsign} is approaching the hold-short point while ${second.callsign} is active` });
        }
      }
    }
    return predictions.slice(0, 8);
  }

  setWeather(condition: WeatherCondition, windDirection: number, windSpeed: number): void {
    this.state.weather.weatherEnabled = true;
    this.state.weather.windEnabled = true;
    this.state.weather.condition = condition;
    this.state.weather.windDirection = this.normalizeAngle(windDirection);
    this.state.weather.windSpeed = Math.max(0, Math.min(40, windSpeed));
    this.state.weather.gustSpeed = this.state.weather.windSpeed + (condition === 'clear' ? 3 : 7);
    this.state.weather.visibility = condition === 'fog' ? 2.5 : condition === 'snow' ? 3 : condition === 'rain' ? 5 : 10;
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
    if (!this.canIssue('approach')) return this.rejectDecision(`${this.state.station} station has no approach authority`);
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'approach');
    if (!flight) return this.rejectDecision('flight is not awaiting an approach clearance');
    if (flight.goAround) return this.rejectDecision('flight is flying the missed-approach circuit before re-entering the arrival sequence', flight);
    if (flight.runway !== runway) return this.rejectDecision(`flight is assigned to runway ${this.activeRunwayDesignation(flight.runway)}`, flight);
    if (runwayClosedByDisruption(this.state.surfaceDisruptions, runway)) return this.rejectDecision(`runway ${this.activeRunwayDesignation(runway)} is closed`, flight);
    const blocker = flight.progress > 0.68 ? this.runwayBlocker(runway, flight.id) : null;
    if (blocker) return this.rejectDecision(`runway protected for ${blocker.callsign} ${blocker.phase}`, flight);
    flight.cleared = true;
    flight.clearanceLeft = 99;
    this.decisionReason = `landing clearance accepted for runway ${this.activeRunwayDesignation(runway)}`;
    this.events.push({ type: 'clear', flight });
    return true;
  }

  clearPushback(id: number): boolean {
    if (this.state.gameOver) return this.rejectDecision('shift is closed');
    if (this.state.paused) return this.rejectDecision('resume the simulation before issuing a clearance');
    if (!this.canIssue('ground')) return this.rejectDecision(`${this.state.station} station has no pushback authority`);
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'resting');
    if (!flight) return this.rejectDecision('flight is not at a stand awaiting pushback');
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
    const blocker = this.runwayBlocker(flight.runway, flight.id);
    if (blocker) return this.rejectDecision(`takeoff held: ${blocker.callsign} is ${blocker.phase} in the protected zone`, flight);
    const pathBlocker = this.departurePathBlocker(flight);
    if (pathBlocker) return this.rejectDecision(`takeoff held: ${pathBlocker.callsign} has not cleared the departure envelope`, flight);
    flight.takeoffCleared = true;
    this.decisionReason = `takeoff clearance accepted for ${this.activeRunwayDesignation(flight.runway)}`;
    this.events.push({ type: 'takeoff-clearance', flight, runway: flight.runway });
    return true;
  }

  controlFlights(ids: number[], instruction: FlightInstruction): number[] {
    this.decisionReason = 'no requested flight accepted that instruction';
    const requested = new Set(ids.filter((id) => Number.isInteger(id) && id > 0));
    const controlled: number[] = [];
    for (const flight of this.state.flights) {
      if (!requested.has(flight.id)) continue;
      const surface = flight.phase === 'taxi-in' || flight.phase === 'taxi-out' || flight.phase === 'resting';
      if ((instruction === 'slow' || instruction === 'normal' || instruction === 'expedite')
        && !(surface ? this.canIssue('ground') : this.canIssue('approach'))) continue;
      if (instruction === 'hold') {
        if (flight.phase !== 'taxi-in' && flight.phase !== 'taxi-out') continue;
        if (!this.canIssue('ground')) continue;
        flight.controlHold = true;
        this.metrics.holdsIssued += 1;
      }
      if (instruction === 'resume') {
        if ((flight.phase === 'taxi-in' || flight.phase === 'taxi-out') && !this.canIssue('ground')) continue;
        flight.controlHold = false;
      }
      if (instruction === 'slow') flight.controlPace = 0.55;
      if (instruction === 'normal') flight.controlPace = 1;
      if (instruction === 'expedite') flight.controlPace = 1.4;
      if (instruction === 'zigzag') {
        if (flight.phase !== 'approach' || flight.goAround) continue;
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
    if (flight.goAround) return;
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

  reset(): void {
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
    this.events = [];
    this.runwayReservations.clear();
    this.taxiOutReleaseIn = 0;
    this.closedRunway = null;
    this.state.closedRunway = null;
    this.state.scenario = 'normal';
    this.state.station = 'supervisor';
    this.runwayConfigurationOverrideId = null;
    this.state.runwayConfigurationMode = 'automatic';
    this.state.runwayConfigurationTransition = null;
    this.applyRunwayConfiguration(
      this.config.runwayConfigurations.find((configuration) => configuration.id === this.config.defaultRunwayConfigurationId)
        ?? this.config.runwayConfigurations[0],
    );
    this.stationarySeconds.clear();
    Object.assign(this.metrics, { safeArrivals: 0, safeDepartures: 0, preventedConflicts: 0, holdsIssued: 0, manualCommands: 0, maxConcurrent: 0, airborneSeconds: 0, taxiSeconds: 0, estimatedDelaySeconds: 0, emergencyResponses: 0, safetyHolds: 0, collisionAlerts: 0, runwayIncursions: 0, unexplainedPauses: 0, longestHoldSeconds: 0 });
    this.updateWeather();
    this.seedInitialTraffic();
  }

  update(realDelta: number): void {
    if (this.state.gameOver || this.state.paused) return;
    const realStep = Math.min(realDelta, 0.1);
    const delta = realStep * this.speed;
    this.state.elapsed += delta;
    this.state.breeze = Math.sin(this.state.elapsed * 0.07) * 0.5 + 0.5;
    this.updateWeather();
    this.updateSurfaceDisruptions(delta);
    this.spawnIn -= delta;
    this.taxiOutReleaseIn = Math.max(0, this.taxiOutReleaseIn - delta);

    if (this.spawnIn <= 0) {
      const spawnedAircraft = this.state.flights.length < this.config.trafficCap ? this.spawnFlight() : null;
      this.spawnIn = spawnedAircraft ? this.arrivalSpacing(aircraftProfile(spawnedAircraft)) : 0.6;
    }
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
        ? findProposedConflict(this.config, flight, proposedProgress, this.state.flights, proposedProgressById, resolvedFlightIds)
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
      if (flight.phase === 'approach' && !flight.cleared && !flight.goAround) {
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

  operationProfileSnapshot(state: AirportState = this.state): { profile: AirportOperationProfile; current: AirportOperationState } {
    const profile = this.config.operationProfile;
    const current = airportOperationStateAt(profile, state.elapsed);
    return {
      profile: {
        ...profile,
        periods: profile.periods.map((period) => ({ ...period, mix: { ...period.mix } })),
        sources: profile.sources.map((source) => ({ ...source })),
      },
      current: { ...current, mix: { ...current.mix } },
    };
  }

  diagnostics(): { flow: 'continuous'; approachCapacity: number; nextArrivalIn: number; activeFlights: number; runwayReservations: Array<{ runway: number; flight: number }>; scenario: TrafficScenario; closedRunway: number | null; predictions: ConflictPrediction[]; collisions: ReturnType<typeof findFlightConflicts>; obstacleCollisions: ReturnType<typeof findObstacleConflicts>;
    serviceVehicleConflicts: ReturnType<typeof findServiceVehicleConflicts>;
    serviceVehicleRouteViolations: ReturnType<typeof serviceVehicleRouteViolations>;
    surfaceDisruptions: SurfaceDisruptionState[];
    queues: OperationQueueSnapshot;
    deicing: { facilities: ReturnType<typeof deicingFacilities>; required: number; queued: number; treating: number; protected: number; expired: number };
    collisionEnvelopes: { aircraft: ReturnType<typeof aircraftCollisionEnvelope>[]; obstacles: AirportConfig['obstacles'] }; metrics: ShiftMetrics; surfaceGraph: SurfaceGraphValidation; obstacleEnvelopes: AirportObstacleValidation } {
    return {
      flow: 'continuous',
      approachCapacity: this.weatherApproachCapacity(),
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
      deicing: {
        facilities: deicingFacilities(this.config.surfaceGraph),
        required: this.state.flights.filter((flight) => flight.deicing.required).length,
        queued: this.state.flights.filter((flight) => flight.deicing.status === 'queued').length,
        treating: this.state.flights.filter((flight) => flight.deicing.status === 'treating').length,
        protected: this.state.flights.filter((flight) => flight.deicing.status === 'protected').length,
        expired: this.state.flights.filter((flight) => flight.deicing.status === 'expired').length,
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

  private seedInitialTraffic(): void {
    const target = this.config.scope === 'center'
      ? Math.min(8, Math.max(5, Math.floor(this.config.surfaceGraph.stands.length / 2)))
      : 1;
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
      flight.origin = this.config.code === 'LOCAL' ? 'LOCAL' : this.config.code;
      flight.destination = this.originFor(flight.id + 5);
      flight.procedure = this.departureProcedure(runway.id);
      flight.operationPlan = this.createOperationPlan('departure', flight.operationPlan.trafficClass);
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
    if (this.state.runwayConfigurationTransition) return null;
    const approachLimit = this.weatherApproachCapacity();
    if (this.state.flights.filter((flight) => flight.phase === 'approach' || flight.phase === 'landing').length >= approachLimit) return null;
    const id = this.nextId;
    const operationState = airportOperationStateAt(this.config.operationProfile, this.state.elapsed);
    const trafficClass = selectOperationTrafficClass(operationState, id, this.config.seed);
    const airlineCode = this.airlineFor(id, trafficClass);
    const aircraft = this.aircraftFor(id, trafficClass);
    const arrivalRunways = this.config.runways.filter((runway) => (
      (this.runwayRole(runway.id) === 'arrival' || this.runwayRole(runway.id) === 'mixed')
      && !runwayClosedByDisruption(this.state.surfaceDisruptions, runway.id)
      && runwaySupportsAircraft(runway, aircraft, 'landing')
    ));
    const unblocked = arrivalRunways.filter((runway) => !this.arrivalBlocked(runway.id));
    const usable = unblocked.filter((runway) => this.headwindComponent(runway.id) >= -5);
    const candidates = (usable.length ? usable : unblocked).sort((first, second) => this.headwindComponent(second.id) - this.headwindComponent(first.id));
    if (candidates.length === 0) return null;

    const runway = candidates[0].id;
    const runwayConfig = this.config.runways[runway];
    const departureRunways = this.config.runways.filter((item) => (
      (this.runwayRole(item.id) === 'departure' || this.runwayRole(item.id) === 'mixed')
      && !runwayClosedByDisruption(this.state.surfaceDisruptions, item.id)
      && runwaySupportsAircraft(item, aircraft, 'takeoff')
    ));
    if (departureRunways.length === 0) return null;
    const departureRunway = [...departureRunways].sort((first, second) => this.headwindComponent(second.id) - this.headwindComponent(first.id))[(id - 1) % departureRunways.length].id;
    const automatic = this.isAutomaticMode();
    const airline = airlineProfile(airlineCode);
    const profile = aircraftProfile(aircraft);
    const flightNumber = 100 + ((id * 37 + Math.abs(this.config.seed)) % 890);
    const registration = this.registrationFor(airlineCode, id);
    const service = airline.cargo || profile.category === 'cargo' ? 'cargo' : 'passenger';
    const initialFuelPercent = 38 + ((id * 17 + Math.abs(this.config.seed)) % 34);
    const approachDuration = this.phaseDuration(aircraft, 'approach', runway);
    const operatingEnd = this.preferredOperatingEnd(runway);
    const nextDestination = this.originFor(id + 5);
    const turnaround = createTurnaroundPlan({
      flightId: id,
      airportSeed: this.config.seed,
      aircraft,
      service,
      fuelPercent: initialFuelPercent,
      scope: this.config.scope,
      scheduledGateInSeconds: 0,
    });
    const gateAssignment = planGateAssignment({
      config: this.config,
      flightId: id,
      aircraft,
      airline: airlineCode,
      service,
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
    if (!gateAssignment) return null;
    scheduleTurnaround(turnaround, gateAssignment.scheduledGateInSeconds);
    const gateSlot = gateAssignment.gateSlot;
    const stand = this.config.surfaceGraph.stands.find((candidate) => candidate.id === gateAssignment.standId);
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
      cleared: automatic,
      clearanceLeft: automatic ? 99 : approachDuration * 0.96,
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
      operationPlan: this.createOperationPlan('arrival', trafficClass, operationState),
      turnaround,
      deicing: createDeicingState(),
      category: profile.category,
      wakeClass: profile.wakeClass,
      procedure: this.arrivalProcedure(runway),
      origin: this.originFor(id),
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
      return null;
    }
    syncFlightMotion(this.config, flight);
    flight.kinematics.altitudeFt = this.motionAltitudeFt(flight);

    // Do not inject a new arrival whose low-altitude/final rollout sweep is
    // already occupied by surface traffic. The stream will retry on the next
    // spawn interval after the protected corridor clears.
    if (this.arrivalPathBlocker(flight)) return null;

    if (this.state.scenario === 'emergency' && id === 1) flight.emergency = 'medical';

    this.nextId += 1;
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
    if (automatic) this.events.push({ type: 'auto-clear', flight });
    if (flight.emergency) this.events.push({ type: 'emergency', flight });
    return aircraft;
  }

  private advance(flight: Flight): void {
    if (flight.phase === 'approach' && flight.goAround) {
      flight.goAround = undefined;
      flight.progress = 0;
      flight.phaseElapsed = 0;
      flight.duration = this.phaseDuration(flight.aircraft, 'approach', flight.runway);
      flight.cleared = this.isAutomaticMode();
      flight.clearanceLeft = flight.cleared ? 99 : flight.duration * 0.96;
      syncFlightMotion(this.config, flight);
      flight.kinematics.altitudeFt = this.motionAltitudeFt(flight);
      if (flight.cleared) this.events.push({ type: 'auto-clear', flight });
      return;
    }
    if (flight.phase === 'takeoff') {
      for (const [runway, owner] of this.runwayReservations) {
        if (owner === flight.id) this.runwayReservations.delete(runway);
      }
      this.state.departures += 1;
      this.metrics.safeDepartures += 1;
      this.events.push({ type: 'depart', flight });
      this.state.flights = this.state.flights.filter((item) => item !== flight);
      this.state.serviceVehicles = this.state.serviceVehicles.filter((vehicle) => vehicle.flightId !== flight.id);
      this.stationarySeconds.delete(flight.id);
      return;
    }

    if (flight.phase === 'resting' && !flight.pushbackCleared) {
      if (!this.isAutomaticMode()) return;
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
      if (this.taxiOutReleaseIn > 0) return;
      const departureRunway = this.selectDepartureRunway(flight);
      if (departureRunway === null) return;
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
      flight.destination = flight.gateAssignment?.nextDestination ?? this.originFor(flight.id + 5);
      flight.procedure = this.departureProcedure(flight.runway);
      flight.operationPlan = this.createOperationPlan('departure', flight.operationPlan.trafficClass);
      if (flight.gateAssignment) flight.gateAssignment.departureRunway = departureRunway;
      const departureFlow = airportOperationStateAt(this.config.operationProfile, this.state.elapsed).departureReadinessMultiplier;
      this.taxiOutReleaseIn = (this.config.scope === 'center' ? 12 : 16) * Math.max(0.7, Math.min(1.6, departureFlow));
    }
    if (next === 'takeoff') {
      if (!deicingReleaseValid(flight, this.state.weather, this.state.elapsed)) {
        if (flight.deicing.status === 'expired') this.returnForDeicing(flight);
        return;
      }
      if (!flight.holdNotified) {
        flight.holdNotified = true;
        this.events.push({ type: 'hold-short', flight, runway: flight.runway, taxiway: flight.taxiway });
      }
      if (this.isAutomaticMode()) {
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
      this.state.arrivals += 1;
      this.metrics.safeArrivals += 1;
      this.events.push({ type: 'land', flight });
      this.events.push({ type: 'chime', flight });
    }
    if (next === 'takeoff') {
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
    if (!this.isAutomaticMode()) return;
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
        if (first.phase !== second.phase) {
          if (first.phase === 'taxi-in' && first.progress < 0.28) return -1;
          if (second.phase === 'taxi-in' && second.progress < 0.28) return 1;
          return first.phase === 'taxi-out' ? -1 : 1;
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
        2,
      );
      const conflict = reservations.firstConflictDetail(claims, flight.id);
      const vehicleConflict = typeof conflict?.ownerId === 'string' && conflict.ownerId.startsWith('vehicle:');
      const shouldHold = vehicleConflict || (this.isAutomaticMode() && Boolean(conflict));
      if (shouldHold && !flight.automaticHold) this.metrics.preventedConflicts += 1;
      flight.automaticHold = shouldHold;
      flight.automaticHoldReason = conflict ? this.surfaceReservationConflictReason(conflict.claim) : undefined;
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
        endSeconds = Math.max(endSeconds, now + remainingTurn + (this.isAutomaticMode() ? 24 : 180));
      } else if (flight.phase === 'taxi-out') {
        if (!flight.tugAttached && flight.pushbackProgress >= 1) return [];
        startSeconds = now - GATE_TURN_BUFFER_SECONDS;
        endSeconds = now + Math.max(8, flight.duration * Math.max(0, flight.pushbackReleaseProgress - flight.progress));
      }
      return [{
        flightId: flight.id,
        standId: assignment.standId,
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
          && other.standId === assignment.standId
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
    const arrivals = this.config.runways.filter((runway) => {
      const role = this.runwayRole(runway.id);
      return role === 'arrival' || role === 'mixed';
    });
    const independentArrivals: number[] = [];
    for (const runway of arrivals) {
      if (independentArrivals.every((other) => !this.runwaysConflict(runway.id, other))) independentArrivals.push(runway.id);
    }
    const departures = this.config.runways.filter((runway) => {
      const role = this.runwayRole(runway.id);
      return role === 'departure' || role === 'mixed';
    }).length;
    const maximumCapacity = this.config.code === 'ORD' ? 4 : 3;
    return Math.max(1, Math.min(maximumCapacity, independentArrivals.length, Math.max(1, departures + 1)));
  }

  private weatherApproachCapacity(): number {
    const approachCapacity = this.calculateApproachCapacity();
    if (this.state.scenario === 'emergency') return 1;
    if (this.state.scenario === 'training') return 1;
    if (this.state.scenario === 'rush') return Math.min(approachCapacity + 1, this.state.weather.condition === 'clear' ? 5 : approachCapacity);
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
    const scenarioMultiplier = this.state.scenario === 'rush' ? 0.62 : this.state.scenario === 'storm' ? 1.55 : this.state.scenario === 'closure' ? 1.18 : this.state.scenario === 'training' ? 2.1 : this.state.scenario === 'emergency' ? 1.35 : 1;
    const wakeMultiplier = profile ? profile.wakeSeparationSeconds / 4.2 : 1;
    const profileMultiplier = airportOperationStateAt(this.config.operationProfile, this.state.elapsed).arrivalIntervalMultiplier;
    const scenarioBase = base * scenarioMultiplier * wakeMultiplier * Math.max(0.58, Math.min(1.85, profileMultiplier));
    if (this.state.weather.condition === 'fog') return scenarioBase * 1.55;
    if (this.state.weather.condition === 'snow') return scenarioBase * 1.42;
    if (this.state.weather.condition === 'rain') return scenarioBase * 1.2;
    return scenarioBase;
  }

  private airlineFor(id: number, trafficClass: OperationTrafficClass): AirlineCode {
    const roster = AIRPORT_AIRLINES[this.config.code] ?? AIRPORT_AIRLINES.LOCAL;
    if (trafficClass === 'general-aviation') return 'LOCAL';
    const candidates = trafficClass === 'cargo'
      ? roster.filter((code) => airlineProfile(code).cargo)
      : roster.filter((code) => !airlineProfile(code).cargo && (trafficClass === 'regional' || code !== 'LOCAL'));
    const fallback: AirlineCode[] = trafficClass === 'cargo' ? ['FX', '5X'] : ['LOCAL'];
    const available = candidates.length ? candidates : fallback;
    return available[(id - 1 + Math.abs(this.config.seed)) % available.length];
  }

  private aircraftFor(id: number, trafficClass: OperationTrafficClass): AircraftModel {
    const requestedRoster: AircraftModel[] = trafficClass === 'general-aviation'
      ? ['PC12']
      : trafficClass === 'cargo'
        ? ['B77F', 'B77F', 'B77F', 'B738']
        : trafficClass === 'regional'
          ? ['E175', 'Q400']
          : ['A320', 'B738', 'A359', 'B789'];
    const requested = requestedRoster[(id - 1 + Math.abs(this.config.seed)) % requestedRoster.length];
    if (this.hasUsableRunwayPair(requested)) return requested;

    // Keep the requested traffic mix when the airport can support it, but
    // substitute the largest compatible type instead of putting a heavy jet
    // onto a runway that is too short for either half of its visit.
    const alternatives = (trafficClass === 'general-aviation'
      ? (['PC12', 'Q400'] as AircraftModel[])
      : trafficClass === 'cargo'
        ? (['B77F', 'B738', 'E175', 'Q400'] as AircraftModel[])
        : trafficClass === 'regional'
          ? (['E175', 'Q400', 'PC12'] as AircraftModel[])
          : AIRCRAFT_ROSTER.filter((model) => model !== 'B77F' && model !== 'PC12'))
      .filter((model) => this.hasUsableRunwayPair(model))
      .sort((first, second) => aircraftProfile(second).maxTakeoffWeightT - aircraftProfile(first).maxTakeoffWeightT);
    if (alternatives.length) return alternatives[0];

    return 'Q400';
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

  private arrivalProcedure(runway: number): string {
    const designation = this.activeRunwayDesignation(runway);
    return `${this.config.code === 'LOCAL' ? 'LOCAL' : this.config.code} ARRIVAL ${designation}`;
  }

  private departureProcedure(runway: number): string {
    return `${this.config.code === 'LOCAL' ? 'LOCAL' : this.config.code} DEPARTURE ${this.activeRunwayDesignation(runway)}`;
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
      const burnPerMinute = flight.phase === 'takeoff' ? 2.4 : flight.phase === 'approach' ? 0.72 : flight.phase === 'landing' ? 0.55 : 0.2;
      telemetry.fuelPercent = Math.max(0, telemetry.fuelPercent - burnPerMinute / 60 * delta);
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
    if (flight.phase === 'approach') target = flight.goAround
      ? profile.approachKts + 22
      : profile.approachKts + this.lerp(18, 2, flight.progress);
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
    if (this.isAutomaticMode()) this.startDisabledRecovery(disruption, flight, 'automatic airport recovery dispatch');
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
        if (disruption.status === 'active' && this.isAutomaticMode()) {
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
      flight.runway = alternate.id;
      flight.operatingEnd = this.preferredOperatingEnd(alternate.id);
      flight.palette = alternate.color;
      flight.procedure = this.arrivalProcedure(alternate.id);
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
        if (flight.phase === 'approach' && !flight.goAround) this.planRunwayExit(flight, 'braking action changed');
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

  private isAutomaticMode(): boolean {
    return this.state.mode === 'auto' || this.state.mode === 'watch';
  }
}

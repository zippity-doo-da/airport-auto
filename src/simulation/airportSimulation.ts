import type { AirportConfig } from './airportConfig';
import type { AirportEvent, AirportState, ClearanceProposal, ConflictPrediction, ControlMode, ControllerStation, EmergencyType, Flight, FlightInstruction, FlightPhase, ShiftMetrics, TrafficScenario, WeatherCondition } from './types';
import { AIRCRAFT_ROSTER, aircraftProfile, type AircraftModel } from './aircraftProfiles';
import { AIRPORT_AIRLINES, airlineProfile, type AirlineCode } from './airlineProfiles';
import { aircraftCollisionEnvelope, findFlightConflicts, findObstacleConflicts, findProposedConflict } from './collisionDetection';
import { sampleSurfaceRouteWithEdges, surfaceRouteCrossingWindows, surfaceRouteForFlight, surfaceRouteReservationKeys, surfaceRouteRunwayCrossings, validateAirportSurfaceGraph, type SurfaceGraphValidation, type SurfaceRoute, type SurfaceRouteCrossingWindow } from './surfaceGraph';
import { validateAirportObstacleEnvelopes, type AirportObstacleValidation } from './airportObstacles';
import { departureTrajectoryTiming, landingTrajectoryTiming } from './flightTrajectory';
import { runwaySupportsAircraft, WORLD_METERS_PER_UNIT } from './runwayPerformance';
import { progressAfterDistance, syncFlightMotion } from './flightMotion';
import { intersectingRunways, runwaysConflict } from './runwayConflict';

const PHASE_DURATION: Record<FlightPhase, number> = {
  approach: 38,
  landing: 34,
  'taxi-in': 18,
  resting: 10,
  'taxi-out': 20,
  takeoff: 48,
};

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
    arrivals: 0,
    departures: 0,
    breeze: 0,
    gameOver: false,
    paused: false,
    mode: 'auto',
    nightMode: false,
    station: 'supervisor',
    weather: { weatherEnabled: false, windEnabled: false, condition: 'clear', windDirection: Math.PI, windSpeed: 0, gustSpeed: 0, visibility: 10 },
    scenario: 'normal',
    activeRunwayEnds: {},
    closedRunway: null,
  };

  private nextId = 1;
  private spawnIn: number;
  private events: AirportEvent[] = [];
  private speed = 1;
  private runwayReservations = new Map<number, number>();
  private readonly approachCapacity: number;
  private taxiOutReleaseIn = 0;
  private baseWindDirection = Math.PI;
  private baseWindSpeed = 10;
  private weatherOverrideUntil = 0;
  private closedRunway: number | null = null;
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
    this.approachCapacity = this.calculateApproachCapacity();
    const reference = config.runways.find((runway) => runway.role !== 'inactive') ?? config.runways[0];
    this.baseWindDirection = this.normalizeAngle(reference.heading + (reference.landingEnd === 1 ? Math.PI : 0) + Math.sin(config.seed) * 0.32);
    this.baseWindSpeed = 8 + config.seed % 7;
    this.surfaceGraphValidation = validateAirportSurfaceGraph(config);
    this.obstacleEnvelopeValidation = validateAirportObstacleEnvelopes(config);
    for (const runway of config.runways) this.state.activeRunwayEnds[runway.id] = runway.landingEnd;
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
        if (flight.phase === 'approach' && !flight.cleared) {
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
        if (this.state.paused && flight.phase === 'approach') {
          flight.cleared = false;
          flight.clearanceLeft = Math.max(2, flight.duration * 0.96 - flight.phaseElapsed);
        }
      }
    }
  }

  setNightMode(enabled: boolean): void {
    this.state.nightMode = enabled;
  }

  setStation(station: ControllerStation): void {
    this.state.station = station;
  }

  lastCommandReason(): string {
    return this.decisionReason;
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
    if (!flight) return false;
    flight.emergency = type;
    this.metrics.emergencyResponses += 1;
    if (type === 'go-around' && (flight.phase === 'approach' || flight.phase === 'landing')) {
      this.goAround(flight, 'controller instruction');
    }
    if (type === 'disabled') flight.controlHold = true;
    this.events.push({ type: 'emergency', flight });
    return true;
  }

  setScenario(scenario: TrafficScenario): void {
    this.state.scenario = scenario;
    this.closedRunway = scenario === 'closure'
      ? this.config.runways.find((runway) => runway.role === 'arrival' || runway.role === 'mixed')?.id ?? null
      : null;
    this.state.closedRunway = this.closedRunway;
    if (scenario === 'storm') this.setWeather('rain', this.state.weather.windDirection, Math.max(18, this.state.weather.windSpeed));
    if (scenario === 'normal' || scenario === 'rush' || scenario === 'closure') this.weatherOverrideUntil = 0;
  }

  shiftMetrics(): ShiftMetrics { return { ...this.metrics }; }

  clearanceProposals(): ClearanceProposal[] {
    if (this.state.mode !== 'assisted') return [];
    const proposals: ClearanceProposal[] = [];
    for (const flight of this.state.flights) {
      if (flight.phase === 'approach' && !flight.cleared) {
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
      if (flight.phase === 'taxi-out' && flight.progress >= 0.985 && !flight.runwayEntryCleared) {
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
    this.state.weather.visibility = condition === 'fog' ? 2.5 : condition === 'rain' ? 5 : 10;
    this.baseWindDirection = this.state.weather.windDirection;
    this.baseWindSpeed = this.state.weather.windSpeed;
    this.weatherOverrideUntil = this.state.elapsed + 180;
  }

  setWeatherEnabled(enabled: boolean): void {
    this.state.weather.weatherEnabled = enabled;
    if (!enabled) {
      this.state.weather.condition = 'clear';
      this.state.weather.visibility = 10;
    } else {
      this.weatherOverrideUntil = 0;
    }
    this.updateWeather();
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
    if (flight.runway !== runway) return this.rejectDecision(`flight is assigned to runway ${this.activeRunwayDesignation(flight.runway)}`, flight);
    if (runway === this.closedRunway) return this.rejectDecision(`runway ${this.activeRunwayDesignation(runway)} is closed`, flight);
    const blocker = flight.progress > 0.68 ? this.runwayBlocker(runway, flight.id) : null;
    if (blocker) return this.rejectDecision(`runway protected for ${blocker.callsign} ${blocker.phase}`, flight);
    flight.cleared = true;
    flight.clearanceLeft = 99;
    this.decisionReason = `landing clearance accepted for runway ${this.activeRunwayDesignation(runway)}`;
    this.events.push({ type: 'clear', flight });
    return true;
  }

  clearRunwayEntry(id: number): boolean {
    if (!this.canIssue('tower')) return this.rejectDecision(`${this.state.station} station has no runway-entry authority`);
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'taxi-out');
    if (!flight) return this.rejectDecision('flight is not taxiing for departure');
    if (flight.progress < 0.985) return this.rejectDecision('flight has not reached the hold-short point', flight);
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
        if (flight.phase !== 'approach') continue;
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
    flight.phase = 'approach';
    flight.progress = 0;
    flight.phaseElapsed = 0;
    flight.operatingEnd = this.preferredOperatingEnd(flight.runway);
    flight.duration = this.phaseDuration(flight.aircraft, 'approach', flight.runway);
    flight.cleared = this.isAutomaticMode();
    flight.clearanceLeft = flight.cleared ? 99 : flight.duration * 0.96;
    flight.controlPattern = undefined;
    flight.controlPatternStart = undefined;
    flight.safetyHold = false;
    flight.safetyHoldReason = undefined;
    syncFlightMotion(this.config, flight);
    flight.kinematics.altitudeFt = this.motionAltitudeFt(flight);
    this.metrics.estimatedDelaySeconds += 90;
    this.events.push({ type: 'go-around', flight, runway: flight.runway, detail });
    if (flight.cleared) this.events.push({ type: 'auto-clear', flight });
  }

  reset(): void {
    this.state.elapsed = 0;
    this.state.flights = [];
    this.state.arrivals = 0;
    this.state.departures = 0;
    this.state.gameOver = false;
    this.state.paused = false;
    this.nextId = 1;
    this.spawnIn = Math.min(3, this.arrivalSpacing() * 0.55);
    this.events = [];
    this.runwayReservations.clear();
    this.taxiOutReleaseIn = 0;
    this.closedRunway = null;
    this.state.closedRunway = null;
    this.state.scenario = 'normal';
    this.state.station = 'supervisor';
    this.stationarySeconds.clear();
    Object.assign(this.metrics, { safeArrivals: 0, safeDepartures: 0, preventedConflicts: 0, holdsIssued: 0, manualCommands: 0, maxConcurrent: 0, airborneSeconds: 0, taxiSeconds: 0, estimatedDelaySeconds: 0, emergencyResponses: 0, safetyHolds: 0, collisionAlerts: 0, runwayIncursions: 0, unexplainedPauses: 0, longestHoldSeconds: 0 });
    this.seedInitialTraffic();
  }

  update(realDelta: number): void {
    if (this.state.gameOver || this.state.paused) return;
    const realStep = Math.min(realDelta, 0.1);
    const delta = realStep * this.speed;
    this.state.elapsed += delta;
    this.state.breeze = Math.sin(this.state.elapsed * 0.07) * 0.5 + 0.5;
    this.updateWeather();
    this.spawnIn -= delta;
    this.taxiOutReleaseIn = Math.max(0, this.taxiOutReleaseIn - delta);

    if (this.spawnIn <= 0) {
      const spawnedAircraft = this.state.flights.length < this.config.trafficCap ? this.spawnFlight() : null;
      this.spawnIn = spawnedAircraft ? this.arrivalSpacing(aircraftProfile(spawnedAircraft)) : 0.6;
    }
    this.metrics.maxConcurrent = Math.max(this.metrics.maxConcurrent, this.state.flights.length);
    this.coordinateAutomaticRunwayCrossings();
    this.coordinateAutomaticSurfaceTraffic();

    const proposedProgressById = new Map<number, number>(this.state.flights.map((flight) => [flight.id, flight.progress]));
    const requestedProgressById = new Map<number, number>();
    const requestedSpeedById = new Map<number, number>();
    const wasSafetyHeld = new Set(this.state.flights.filter((flight) => flight.safetyHold).map((flight) => flight.id));
    for (const flight of this.state.flights) {
      flight.safetyHold = false;
      flight.safetyHoldReason = undefined;
      const onSurface = flight.phase === 'taxi-in' || flight.phase === 'taxi-out';
      const motion = syncFlightMotion(this.config, flight);
      const crossing = onSurface ? this.nextUnclearedCrossing(flight) : null;
      const crossingDistanceM = Math.max(0, (crossing?.distanceToHold ?? Infinity) * WORLD_METERS_PER_UNIT);
      const crossingHold = Boolean(crossing && crossing.distanceToHold <= 0.002);
      flight.crossingHoldRunway = crossingHold ? crossing?.runwayId : undefined;
      const awaitingTakeoffClearance = flight.phase === 'takeoff'
        && !flight.takeoffCleared
        && motion.stage !== 'lineup';
      const hardHold = (onSurface && flight.automaticHold) || crossingHold || awaitingTakeoffClearance;
      let targetSpeed = hardHold ? 0 : this.targetGroundSpeedKts(flight, Boolean(onSurface && flight.controlHold));
      if (crossing && Number.isFinite(crossingDistanceM)) {
        const braking = aircraftProfile(flight.aircraft).brakingMps2
          * (this.state.weather.condition === 'rain' ? 0.76 : this.state.weather.condition === 'fog' ? 0.9 : 1);
        const maximumStoppingSpeedKts = Math.sqrt(Math.max(0, 2 * braking * crossingDistanceM)) / KNOT_TO_MPS;
        targetSpeed = Math.min(targetSpeed, maximumStoppingSpeedKts);
      }
      const nextSpeed = hardHold ? 0 : this.acceleratedSpeedKts(flight, targetSpeed, delta);
      const travelMeters = (flight.kinematics.groundSpeedKts + nextSpeed) * 0.5 * KNOT_TO_MPS * delta;
      const requestedProgress = flight.phase === 'resting'
        ? Math.min(1, (flight.phaseElapsed + delta) / flight.duration)
        : hardHold
          ? flight.progress
          : progressAfterDistance(this.config, flight, travelMeters);
      const clearanceLimitedProgress = crossing ? Math.min(requestedProgress, crossing.holdProgress) : requestedProgress;
      requestedSpeedById.set(flight.id, clearanceLimitedProgress >= (crossing?.holdProgress ?? Infinity) - 1e-6 ? 0 : nextSpeed);
      requestedProgressById.set(flight.id, clearanceLimitedProgress);
    }

    // Resolve proposed movement in a deterministic order. The collision layer
    // applies arrival/departure priority and then a stable flight-ID tie break
    // before a proxy can enter the protected envelope. This is the simulation's
    // final safety net, independent of the renderer and control mode.
    const movementPriority = (flight: Flight): number => {
      if (flight.phase === 'landing' || flight.phase === 'approach') return 0;
      if (flight.phase === 'taxi-in' && flight.progress < 0.3) return 1;
      if (flight.phase === 'takeoff') return 2;
      if (flight.phase === 'taxi-in') return 3;
      if (flight.phase === 'taxi-out') return 4;
      return 5;
    };
    for (const flight of [...this.state.flights].sort((first, second) => movementPriority(first) - movementPriority(second) || first.id - second.id)) {
      const proposedProgress = requestedProgressById.get(flight.id) ?? flight.progress;
      proposedProgressById.set(flight.id, proposedProgress);
      const conflict = proposedProgress > flight.progress + 1e-9
        ? findProposedConflict(this.config, flight, proposedProgress, this.state.flights, proposedProgressById)
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
      if (flight.phase === 'approach' && !flight.cleared) {
        flight.clearanceLeft -= delta;
        flight.phaseElapsed += delta;
        if (flight.clearanceLeft <= 0 || flight.phaseElapsed >= flight.duration * 0.96) {
          this.goAround(flight, 'landing clearance expired');
          continue;
        }
      } else {
        const waitingForTakeoff = flight.phase === 'takeoff' && !flight.takeoffCleared && flight.motion.stage !== 'lineup';
        if (!waitingForTakeoff && flight.phase !== 'resting' && moved) flight.phaseElapsed += delta;
        if (flight.phase === 'resting') flight.phaseElapsed += delta;
      }
      flight.progress = nextProgress;
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

  diagnostics(): { flow: 'continuous'; approachCapacity: number; nextArrivalIn: number; activeFlights: number; runwayReservations: Array<{ runway: number; flight: number }>; scenario: TrafficScenario; closedRunway: number | null; predictions: ConflictPrediction[]; collisions: ReturnType<typeof findFlightConflicts>; obstacleCollisions: ReturnType<typeof findObstacleConflicts>; collisionEnvelopes: { aircraft: ReturnType<typeof aircraftCollisionEnvelope>[]; obstacles: AirportConfig['obstacles'] }; metrics: ShiftMetrics; surfaceGraph: SurfaceGraphValidation; obstacleEnvelopes: AirportObstacleValidation } {
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
    const departureRunways = this.config.runways.filter((runway) => runway.role === 'departure' || runway.role === 'mixed');
    if (!departureRunways.length) return;
    const departureTarget = this.config.scope === 'center' ? Math.min(4, departureRunways.length) : 1;
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
      const taxiing = index < Math.min(3, departureTarget);
      flight.runway = runway.id;
      flight.departureRunway = runway.id;
      flight.operatingEnd = this.preferredOperatingEnd(runway.id);
      flight.palette = runway.color;
      flight.phase = taxiing ? 'taxi-out' : 'resting';
      flight.progress = 0;
      flight.phaseElapsed = 0;
      flight.cleared = true;
      flight.clearanceLeft = 99;
      flight.origin = this.config.code === 'LOCAL' ? 'LOCAL' : this.config.code;
      flight.destination = this.originFor(flight.id + 5);
      flight.procedure = this.departureProcedure(runway.id);
      flight.kinematics.fuelPercent = 74 + flight.id % 17;
      flight.kinematics.altitudeFt = 0;
      flight.kinematics.airspeedKts = 0;
      flight.kinematics.groundSpeedKts = 0;
      flight.runwayEntryCleared = false;
      flight.takeoffCleared = false;
      flight.holdShortRunway = taxiing ? runway.id : undefined;
      this.assignSurfaceRoute(flight, flight.phase);
      if (taxiing) {
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
        this.updateSurfaceRouteState(flight);
      }
      syncFlightMotion(this.config, flight);
      this.events = this.events.filter((event) => !(event.flight.id === flight.id && event.type === 'auto-clear'));
    }
  }

  private spawnFlight(): AircraftModel | null {
    const approachLimit = this.weatherApproachCapacity();
    if (this.state.flights.filter((flight) => flight.phase === 'approach' || flight.phase === 'landing').length >= approachLimit) return null;
    const id = this.nextId;
    const airlineCode = this.airlineFor(id);
    const aircraft = this.aircraftFor(airlineCode, id);
    const arrivalRunways = this.config.runways.filter((runway) => (
      (runway.role === 'arrival' || runway.role === 'mixed')
      && runway.id !== this.closedRunway
      && runwaySupportsAircraft(runway, aircraft, 'landing')
    ));
    const unblocked = arrivalRunways.filter((runway) => !this.arrivalBlocked(runway.id));
    const usable = unblocked.filter((runway) => this.headwindComponent(runway.id) >= -5);
    const candidates = (usable.length ? usable : unblocked).sort((first, second) => this.headwindComponent(second.id) - this.headwindComponent(first.id));
    if (candidates.length === 0) return null;

    const runway = candidates[0].id;
    const runwayConfig = this.config.runways[runway];
    const departureRunways = this.config.runways.filter((item) => (
      (item.role === 'departure' || item.role === 'mixed')
      && item.id !== this.closedRunway
      && runwaySupportsAircraft(item, aircraft, 'takeoff')
    ));
    if (departureRunways.length === 0) return null;
    const gateSlot = this.availableGateSlot();
    if (gateSlot === null) return null;
    const departureRunway = [...departureRunways].sort((first, second) => this.headwindComponent(second.id) - this.headwindComponent(first.id))[(id - 1) % departureRunways.length].id;
    const automatic = this.isAutomaticMode();
    const airline = airlineProfile(airlineCode);
    const profile = aircraftProfile(aircraft);
    const flightNumber = 100 + ((id * 37 + Math.abs(this.config.seed)) % 890);
    const registration = this.registrationFor(airlineCode, id);
    const service = airline.cargo || profile.category === 'cargo' ? 'cargo' : 'passenger';
    const approachDuration = this.phaseDuration(aircraft, 'approach', runway);
    const flight: Flight = {
      id,
      callsign: `${airline.callsign} ${flightNumber}`,
      palette: runwayConfig.color,
      runway,
      departureRunway,
      operatingEnd: this.preferredOperatingEnd(runway),
      phase: 'approach',
      progress: 0,
      phaseElapsed: 0,
      duration: approachDuration,
      cleared: automatic,
      clearanceLeft: automatic ? 99 : approachDuration * 0.96,
      gateSlot,
      aircraft,
      airline: airlineCode,
      flightNumber,
      registration,
      service,
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
        fuelPercent: 38 + ((id * 17 + Math.abs(this.config.seed)) % 34),
      },
      motion: {
        x: 0, y: 0, z: 2, heading: 0, pitch: 0, bank: 0,
        onGround: false, groundBlend: 0, protectedRunway: false,
        distanceAlongM: 0, totalDistanceM: 0, stageProgress: 0,
      },
    };
    flight.standId = this.config.surfaceGraph.stands.find((stand) => stand.slot === flight.gateSlot)?.id;
    syncFlightMotion(this.config, flight);
    flight.kinematics.altitudeFt = this.motionAltitudeFt(flight);

    if (this.state.scenario === 'emergency' && id === 1) flight.emergency = 'medical';

    this.nextId += 1;
    this.state.flights.push(flight);
    this.events.push({ type: 'spawn', flight });
    if (automatic) this.events.push({ type: 'auto-clear', flight });
    if (flight.emergency) this.events.push({ type: 'emergency', flight });
    return aircraft;
  }

  private advance(flight: Flight): void {
    if (flight.phase === 'takeoff') {
      for (const [runway, owner] of this.runwayReservations) {
        if (owner === flight.id) this.runwayReservations.delete(runway);
      }
      this.state.departures += 1;
      this.metrics.safeDepartures += 1;
      this.events.push({ type: 'depart', flight });
      this.state.flights = this.state.flights.filter((item) => item !== flight);
      this.stationarySeconds.delete(flight.id);
      return;
    }

    const next = NEXT_PHASE[flight.phase];
    if (!next) return;
    if (next === 'taxi-out') {
      if (this.taxiOutReleaseIn > 0) return;
      const departureRunway = this.selectDepartureRunway(flight);
      if (departureRunway === null) return;
      flight.departureRunway = departureRunway;
      flight.runway = departureRunway;
      flight.operatingEnd = this.preferredOperatingEnd(flight.runway);
      flight.palette = this.config.runways[flight.runway].color;
      flight.holdShortRunway = flight.runway;
      flight.holdNotified = false;
      flight.runwayEntryCleared = false;
      flight.takeoffCleared = false;
      flight.requiredCrossings = [];
      flight.crossingClearances = [];
      flight.crossingClearanceIds = [];
      flight.origin = this.config.code === 'LOCAL' ? 'LOCAL' : this.config.code;
      flight.destination = this.originFor(flight.id + 5);
      flight.procedure = this.departureProcedure(flight.runway);
      this.taxiOutReleaseIn = this.config.scope === 'center' ? 12 : 16;
    }
    if (next === 'takeoff') {
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
    flight.controlPattern = undefined;
    flight.controlPatternStart = undefined;
    flight.duration = this.phaseDuration(flight.aircraft, next, flight.runway);
    if (next === 'taxi-in' || next === 'resting' || next === 'taxi-out') {
      this.assignSurfaceRoute(flight, next);
      if (next === 'taxi-out') flight.requiredCrossings = surfaceRouteRunwayCrossings(this.config.surfaceGraph, flight.surfaceRouteEdges, flight.runway);
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
      flight.surfaceNode = undefined;
      flight.surfaceEdge = undefined;
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

  /** Auto mode reserves only converging nodes and opposing taxiway segments. */
  private coordinateAutomaticSurfaceTraffic(): void {
    if (!this.isAutomaticMode()) {
      for (const flight of this.state.flights) flight.automaticHold = false;
      return;
    }
    const surfaceFlights = this.state.flights.filter((flight) => flight.phase === 'taxi-in' || flight.phase === 'taxi-out');
    const candidates = surfaceFlights
      .filter((flight) => flight.emergency !== 'disabled')
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
    const reservedNodes = new Map<string, number>();
    const reservedEdges = new Map<string, { direction: string; flight: number }>();
    for (const flight of candidates) {
      const keys = surfaceRouteReservationKeys(this.config.surfaceGraph, flight.surfaceRoute, flight.progress, 1, flight.surfaceRouteEdges);
      const conflict = keys.some((key) => {
        if (key.startsWith('node:')) return reservedNodes.has(key);
        const match = /^edge:([^:]+):(.+)$/.exec(key);
        if (!match) return false;
        const reservation = reservedEdges.get(match[1]);
        return Boolean(reservation && reservation.direction !== match[2]);
      });
      const shouldHold = conflict;
      if (shouldHold && !flight.automaticHold) this.metrics.preventedConflicts += 1;
      flight.automaticHold = shouldHold;
      if (shouldHold) continue;
      for (const key of keys) {
        if (key.startsWith('node:')) reservedNodes.set(key, flight.id);
        else {
          const match = /^edge:([^:]+):(.+)$/.exec(key);
          if (match && !reservedEdges.has(match[1])) reservedEdges.set(match[1], { direction: match[2], flight: flight.id });
        }
      }
    }
    for (const flight of surfaceFlights.filter((item) => item.emergency === 'disabled')) {
      flight.automaticHold = true;
    }
  }

  private availableGateSlot(): number | null {
    const gateCount = this.config.surfaceGraph.stands.length;
    const occupied = new Set(this.state.flights.map((flight) => flight.gateSlot));
    const columns = Math.ceil(gateCount / 2);
    for (let column = 0; column < columns; column += 1) {
      for (const slot of [column, column + columns]) {
        if (slot < gateCount && !occupied.has(slot)) return slot;
      }
    }
    return null;
  }

  /** Prevent a phase handoff from introducing an envelope the prior phase did not carry. */
  private transitionConflict(flight: Flight, next: FlightPhase): string | null {
    const preview: Flight = {
      ...flight,
      phase: next,
      progress: 0,
      phaseElapsed: 0,
      duration: this.phaseDuration(flight.aircraft, next, flight.runway),
      surfaceRoute: flight.surfaceRoute ? [...flight.surfaceRoute] : undefined,
      surfaceRouteEdges: flight.surfaceRouteEdges ? [...flight.surfaceRouteEdges] : undefined,
      requiredCrossings: flight.requiredCrossings ? [...flight.requiredCrossings] : undefined,
      crossingClearances: flight.crossingClearances ? [...flight.crossingClearances] : undefined,
      crossingClearanceIds: flight.crossingClearanceIds ? [...flight.crossingClearanceIds] : undefined,
      kinematics: { ...flight.kinematics },
    };
    if (next === 'taxi-in' || next === 'resting' || next === 'taxi-out') this.assignSurfaceRoute(preview, next);
    if (next === 'takeoff') {
      preview.taxiway = undefined;
      preview.surfaceRoute = undefined;
      preview.surfaceRouteEdges = undefined;
      preview.surfaceNode = undefined;
      preview.surfaceEdge = undefined;
    }
    syncFlightMotion(this.config, preview);
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
      const protectsRunway = (other.phase === 'approach' && other.progress > 0.76)
        || other.phase === 'landing'
        || (other.phase === 'taxi-in' && other.progress < 0.3)
        || (other.phase === 'taxi-out' && other.progress > 0.96)
        || other.phase === 'takeoff';
      if (protectsRunway && this.runwaysConflict(runway, other.runway)) return false;
    }
    this.runwayReservations.set(runway, flight.id);
    for (const crossing of this.intersectingRunways(runway)) this.runwayReservations.set(crossing, flight.id);
    return true;
  }

  private canStartTaxiOut(flight: Flight, runway: number): boolean {
    void flight;
    return runway !== this.closedRunway;
  }

  private selectDepartureRunway(flight: Flight): number | null {
    const candidates = this.config.runways
      .filter((runway) => (
        (runway.role === 'departure' || runway.role === 'mixed')
        && runway.id !== this.closedRunway
        && runwaySupportsAircraft(runway, flight.aircraft, 'takeoff')
      ))
      .sort((first, second) => this.headwindComponent(second.id) - this.headwindComponent(first.id));
    if (candidates.length === 0) return null;
    const offset = flight.id % candidates.length;
    const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];
    return rotated.find((runway) => this.canStartTaxiOut(flight, runway.id))?.id ?? null;
  }

  private calculateApproachCapacity(): number {
    const arrivals = this.config.runways.filter((runway) => runway.role === 'arrival' || runway.role === 'mixed');
    const independentArrivals: number[] = [];
    for (const runway of arrivals) {
      if (independentArrivals.every((other) => !this.runwaysConflict(runway.id, other))) independentArrivals.push(runway.id);
    }
    const departures = this.config.runways.filter((runway) => runway.role === 'departure' || runway.role === 'mixed').length;
    const maximumCapacity = this.config.code === 'ORD' ? 4 : 3;
    return Math.max(1, Math.min(maximumCapacity, independentArrivals.length, Math.max(1, departures + 1)));
  }

  private weatherApproachCapacity(): number {
    if (this.state.scenario === 'emergency') return 1;
    if (this.state.scenario === 'training') return 1;
    if (this.state.scenario === 'rush') return Math.min(this.approachCapacity + 1, this.state.weather.condition === 'clear' ? 5 : this.approachCapacity);
    if (this.state.scenario === 'storm') return Math.min(2, this.approachCapacity);
    if (this.state.weather.condition === 'fog') return Math.min(2, this.approachCapacity);
    if (this.state.weather.condition === 'rain') return Math.min(3, this.approachCapacity);
    return this.approachCapacity;
  }

  private arrivalSpacing(profile?: ReturnType<typeof aircraftProfile>): number {
    const base = this.config.scope === 'center'
      ? Math.max(6, this.config.trafficInterval * 0.76)
      : Math.max(6.5, this.config.trafficInterval * 0.95);
    const scenarioMultiplier = this.state.scenario === 'rush' ? 0.62 : this.state.scenario === 'storm' ? 1.55 : this.state.scenario === 'closure' ? 1.18 : this.state.scenario === 'training' ? 2.1 : this.state.scenario === 'emergency' ? 1.35 : 1;
    const wakeMultiplier = profile ? profile.wakeSeparationSeconds / 4.2 : 1;
    const scenarioBase = base * scenarioMultiplier * wakeMultiplier * this.trafficBankFactor();
    if (this.state.weather.condition === 'fog') return scenarioBase * 1.55;
    if (this.state.weather.condition === 'rain') return scenarioBase * 1.2;
    return scenarioBase;
  }

  /** A compressed deterministic hub day: arrival pushes alternate with recovery lulls. */
  private trafficBankFactor(): number {
    if (this.config.scope !== 'center') return 1;
    const bank = (this.state.elapsed + Math.abs(this.config.seed % 47)) % 300;
    const peak = Math.min(Math.abs(bank - 72), Math.abs(bank - 208));
    if (peak < 34) return 0.78;
    if (peak < 58) return 0.92;
    return 1.18;
  }

  private airlineFor(id: number): AirlineCode {
    const roster = AIRPORT_AIRLINES[this.config.code] ?? AIRPORT_AIRLINES.LOCAL;
    return roster[(id - 1 + Math.abs(this.config.seed)) % roster.length];
  }

  private aircraftFor(airlineCode: AirlineCode, id: number): AircraftModel {
    const airline = airlineProfile(airlineCode);
    const requested = airline.cargo
      ? ((id * 17 + Math.abs(this.config.seed)) % 5 === 1 ? 'B738' : 'B77F')
      : AIRCRAFT_ROSTER.filter((model) => model !== 'B77F')[(id - 1 + Math.abs(this.config.seed)) % (AIRCRAFT_ROSTER.length - 1)];
    if (this.hasUsableRunwayPair(requested)) return requested;

    // Keep the requested traffic mix when the airport can support it, but
    // substitute the largest compatible type instead of putting a heavy jet
    // onto a runway that is too short for either half of its visit.
    const alternatives = (airline.cargo
      ? (['B738', 'E175', 'Q400'] as AircraftModel[])
      : AIRCRAFT_ROSTER.filter((model) => model !== 'B77F'))
      .filter((model) => this.hasUsableRunwayPair(model))
      .sort((first, second) => aircraftProfile(second).maxTakeoffWeightT - aircraftProfile(first).maxTakeoffWeightT);
    if (alternatives.length) return alternatives[0];

    return 'Q400';
  }

  private hasUsableRunwayPair(aircraft: AircraftModel): boolean {
    const hasArrival = this.config.runways.some((runway) => (
      (runway.role === 'arrival' || runway.role === 'mixed')
      && runway.id !== this.closedRunway
      && runwaySupportsAircraft(runway, aircraft, 'landing')
    ));
    const hasDeparture = this.config.runways.some((runway) => (
      (runway.role === 'departure' || runway.role === 'mixed')
      && runway.id !== this.closedRunway
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

  private phaseDuration(aircraft: AircraftModel, phase: FlightPhase, runwayId = 0): number {
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
      return landingTrajectoryTiming(this.config, runwayId, aircraft).totalSeconds * this.weatherDurationMultiplier(phase);
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

    if (flight.phase === 'resting') {
      const dispatchFuel = 74 + ((flight.id * 11 + Math.abs(this.config.seed)) % 18);
      telemetry.fuelPercent = Math.min(dispatchFuel, telemetry.fuelPercent + delta * 0.45);
    } else {
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

  private targetGroundSpeedKts(flight: Flight, controllerHold: boolean): number {
    if (controllerHold || flight.phase === 'resting') return 0;
    const profile = aircraftProfile(flight.aircraft);
    const pace = Math.max(0.55, Math.min(flight.phase === 'taxi-in' || flight.phase === 'taxi-out' ? 1 : 1.28, flight.controlPace ?? 1));
    const surfaceWeather = this.state.weather.condition === 'fog' ? 0.78 : this.state.weather.condition === 'rain' ? 0.88 : 1;
    let target = profile.taxiKts;
    if (flight.phase === 'approach') target = profile.approachKts + this.lerp(18, 2, flight.progress);
    if (flight.phase === 'landing') {
      if (flight.motion.stage === 'flare') target = profile.approachKts;
      else if (flight.motion.stage === 'touchdown' || flight.motion.stage === 'rollout') {
        target = this.lerp(profile.approachKts, profile.taxiKts + 3, flight.motion.stageProgress);
      } else target = profile.taxiKts + 3;
    }
    if (flight.phase === 'takeoff') {
      if (flight.motion.stage === 'lineup') target = profile.taxiKts;
      else if (flight.motion.stage === 'takeoff-roll' || flight.motion.stage === 'rotation') target = profile.approachKts * 1.12;
      else target = profile.approachKts * 1.34;
    }
    if (flight.phase === 'taxi-in' || flight.phase === 'taxi-out') target *= surfaceWeather;
    return target * pace;
  }

  private acceleratedSpeedKts(flight: Flight, targetSpeedKts: number, delta: number): number {
    const profile = aircraftProfile(flight.aircraft);
    const current = Math.max(0, flight.kinematics.groundSpeedKts);
    const brakingWeather = this.state.weather.condition === 'rain' ? 0.76 : this.state.weather.condition === 'fog' ? 0.9 : 1;
    const acceleration = targetSpeedKts >= current ? profile.accelerationMps2 : profile.brakingMps2 * brakingWeather;
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

  private assignSurfaceRoute(flight: Flight, phase: 'taxi-in' | 'resting' | 'taxi-out'): void {
    const route = surfaceRouteForFlight(this.config.surfaceGraph, flight.runway, flight.operatingEnd, phase, flight.gateSlot);
    flight.surfaceRoute = route?.nodeIds;
    flight.surfaceRouteEdges = route?.edgeIds;
    flight.standId = this.config.surfaceGraph.stands.find((stand) => stand.slot === flight.gateSlot)?.id;
    flight.surfaceNode = route?.nodeIds[0];
    flight.surfaceEdge = route?.edgeIds[0];
    if (phase === 'resting') flight.duration = this.turnaroundDuration(flight);
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
      const stand = this.config.surfaceGraph.stands.find((item) => item.slot === flight.gateSlot);
      const apron = this.config.surfaceGraph.taxiways.find((taxiway) => taxiway.id === stand?.apronTaxiwayId);
      flight.taxiway = apron?.name ?? 'Terminal Apron';
      return;
    }
    const firstTaxiwayId = route?.taxiwayIds[0];
    flight.taxiway = this.config.surfaceGraph.taxiways.find((taxiway) => taxiway.id === firstTaxiwayId)?.name ?? this.taxiwayName(flight.runway);
    this.updateSurfaceRouteState(flight);
  }

  private surfaceRouteDuration(flight: Flight, route: SurfaceRoute): number {
    const taxiMps = aircraftProfile(flight.aircraft).taxiKts * KNOT_TO_MPS;
    const weatherFactor = this.weatherDurationMultiplier(flight.phase);
    return Math.max(18, route.distance * WORLD_METERS_PER_UNIT / Math.max(1, taxiMps) * weatherFactor);
  }

  private turnaroundDuration(flight: Flight): number {
    const base = this.config.scope === 'center' ? 55 : 36;
    return base + (flight.id % 5) * 7;
  }

  private updateSurfaceRouteState(flight: Flight): void {
    const sample = sampleSurfaceRouteWithEdges(this.config.surfaceGraph, flight.surfaceRoute, flight.surfaceRouteEdges, flight.progress);
    if (!sample) return;
    flight.surfaceNode = sample.nearestNodeId;
    flight.surfaceEdge = sample.edge?.id;
    if (sample.edge?.taxiwayId) flight.taxiway = sample.edge.name;
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

  private grantCrossingClearance(flight: Flight, crossing: SurfaceRouteCrossingWindow): void {
    const runway = crossing.runwayId;
    flight.crossingClearanceIds ??= [];
    flight.crossingClearances ??= [];
    if (flight.crossingClearanceIds.includes(crossing.id)) return;
    flight.crossingClearanceIds.push(crossing.id);
    if (!flight.crossingClearances.includes(runway)) flight.crossingClearances.push(runway);
    flight.crossingHoldRunway = undefined;
    this.events.push({ type: 'runway-crossing', flight, runway, taxiway: flight.taxiway });
  }

  private intersectingRunways(runwayId: number): number[] {
    return intersectingRunways(this.config, runwayId);
  }

  private runwaysConflict(firstId: number, secondId: number): boolean {
    return runwaysConflict(this.config, firstId, secondId);
  }

  private updateWeather(): void {
    const overridden = this.state.elapsed < this.weatherOverrideUntil;
    if (!this.state.weather.weatherEnabled) {
      this.state.weather.condition = 'clear';
    } else if (!overridden) {
      const pattern: WeatherCondition[] = ['clear', 'rain', 'clear', 'fog', 'clear', 'rain'];
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
    this.state.weather.visibility = condition === 'fog' ? 2.5 : condition === 'rain' ? 4.5 : 10;
    this.updateActiveRunwayConfiguration();
  }

  private headwindComponent(runwayId: number): number {
    if (!this.state.weather.windEnabled) return 0;
    const runway = this.config.runways[runwayId];
    const positiveEndHeading = runway.heading + Math.PI;
    const positiveEndComponent = this.state.weather.windSpeed * Math.cos(this.state.weather.windDirection - positiveEndHeading);
    const negativeEndComponent = this.state.weather.windSpeed * Math.cos(this.state.weather.windDirection - runway.heading);
    return Math.max(positiveEndComponent, negativeEndComponent);
  }

  private preferredOperatingEnd(runwayId: number): -1 | 1 {
    return this.state.activeRunwayEnds[runwayId] ?? this.config.runways[runwayId].landingEnd;
  }

  private desiredOperatingEnd(runwayId: number): -1 | 1 {
    const runway = this.config.runways[runwayId];
    if (!this.state.weather.windEnabled) return runway.landingEnd;
    const positiveEndComponent = Math.cos(this.state.weather.windDirection - (runway.heading + Math.PI));
    const negativeEndComponent = Math.cos(this.state.weather.windDirection - runway.heading);
    return positiveEndComponent >= negativeEndComponent ? 1 : -1;
  }

  private updateActiveRunwayConfiguration(): void {
    for (const runway of this.config.runways) {
      const desired = this.desiredOperatingEnd(runway.id);
      const protectedTraffic = this.state.flights.some((flight) => (
        flight.runway === runway.id
        && (flight.phase === 'approach' || flight.phase === 'landing' || flight.phase === 'takeoff'
          || (flight.phase === 'taxi-in' && flight.progress < 0.25)
          || (flight.phase === 'taxi-out' && flight.progress > 0.92))
      ));
      if (!protectedTraffic) this.state.activeRunwayEnds[runway.id] = desired;
    }
  }

  private weatherDurationMultiplier(phase: FlightPhase): number {
    const condition = this.state.weather.condition;
    if (condition === 'clear' || phase === 'resting') return 1;
    if (condition === 'rain') return phase === 'taxi-in' || phase === 'taxi-out' ? 1.2 : phase === 'landing' || phase === 'takeoff' ? 1.12 : 1.08;
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

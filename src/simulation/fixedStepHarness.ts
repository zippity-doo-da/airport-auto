import { generateAirportConfig, generateHubConfig, HUB_AIRPORTS, type AirportConfig } from './airportConfig';
import { AirportSimulation } from './airportSimulation';
import type {
  AirportEvent,
  ControlMode,
  Flight,
  FlightPhase,
  ShiftMetrics,
  TrafficScenario,
} from './types';
import { sampleFlightTrajectory, type FlightTrajectoryStage } from './flightTrajectory';

const DEFAULT_STEP_SECONDS = 0.05;
const MAX_STEP_SECONDS = 0.1;
const MAX_TICKS_PER_ADVANCE = 1_000_000;

export interface FixedStepHarnessOptions {
  stepSeconds?: number;
  pace?: number;
  mode?: ControlMode;
  scenario?: TrafficScenario;
}

export interface FixedStepHarnessEvent {
  tick: number;
  simulationTimeSeconds: number;
  type: AirportEvent['type'];
  flightId: number;
  callsign: string;
  phase: FlightPhase;
  progress: number;
  runway: number;
  taxiway?: string;
  detail?: string;
}

export interface FixedStepFlightSnapshot {
  id: number;
  callsign: string;
  runway: number;
  departureRunway: number;
  operatingEnd: -1 | 1;
  phase: FlightPhase;
  progress: number;
  phaseElapsed: number;
  duration: number;
  cleared: boolean;
  taxiway?: string;
  standId?: string;
  surfaceNode?: string;
  surfaceEdge?: string;
  surfaceRoute: string[];
  controlPace: number;
  held: boolean;
  automaticHold: boolean;
  crossingHoldRunway?: number;
  safetyHold: boolean;
  safetyHoldReason?: string;
  runwayEntryCleared: boolean;
  takeoffCleared: boolean;
  crossingClearances: number[];
  crossingClearanceIds: string[];
  airspeedKts: number;
  groundSpeedKts: number;
  altitudeFt: number;
  verticalSpeedFpm: number;
  fuelPercent: number;
  trajectory: {
    stage: FlightTrajectoryStage;
    stageProgress: number;
    x: number;
    y: number;
    z: number;
    heading: number;
    pitch: number;
    onGround: boolean;
    distanceAlong: number;
    totalDistance: number;
  } | null;
}

export interface FixedStepSimulationSnapshot {
  schemaVersion: 2;
  seed: number;
  airportCode: string;
  stepSeconds: number;
  tick: number;
  wallTimeSeconds: number;
  remainderSeconds: number;
  simulationTimeSeconds: number;
  state: {
    arrivals: number;
    departures: number;
    gameOver: boolean;
    paused: boolean;
    mode: ControlMode;
    scenario: TrafficScenario;
    runwayConfigurationId: string;
    activeRunwayEnds: Record<number, -1 | 1>;
    weather: {
      enabled: boolean;
      windEnabled: boolean;
      condition: string;
      windDirection: number;
      windSpeed: number;
      gustSpeed: number;
      visibility: number;
    };
  };
  flights: FixedStepFlightSnapshot[];
  diagnostics: {
    approachCapacity: number;
    nextArrivalIn: number;
    activeFlights: number;
    runwayReservations: Array<{ runway: number; flight: number }>;
    collisionPairs: Array<[number, number]>;
    obstacleCollisions: Array<[number, string]>;
    collisionEnvelopeCounts: { aircraft: number; obstacles: number };
    metrics: ShiftMetrics;
  };
  events: FixedStepHarnessEvent[];
}

/**
 * Renderer-independent deterministic clock for AirportSimulation.
 *
 * Tests may advance exact ticks or feed arbitrary wall-clock chunks. Arbitrary
 * chunks accumulate until a complete fixed step is available, so a simulation
 * produces the same result whether 30 seconds arrive as one chunk or hundreds
 * of browser-like frame deltas.
 */
export class FixedStepSimulationHarness {
  readonly simulation: AirportSimulation;
  readonly stepSeconds: number;

  private tick = 0;
  private wallTime = 0;
  private remainder = 0;
  private readonly eventLog: FixedStepHarnessEvent[] = [];

  constructor(readonly config: AirportConfig, options: FixedStepHarnessOptions = {}) {
    const stepSeconds = options.stepSeconds ?? DEFAULT_STEP_SECONDS;
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0 || stepSeconds > MAX_STEP_SECONDS) {
      throw new RangeError(`stepSeconds must be greater than 0 and no more than ${MAX_STEP_SECONDS}`);
    }
    if (options.pace !== undefined && (!Number.isFinite(options.pace) || options.pace <= 0)) {
      throw new RangeError('pace must be a positive finite number');
    }

    this.stepSeconds = stepSeconds;
    this.simulation = new AirportSimulation(config);
    if (options.pace !== undefined) this.simulation.setPace(options.pace);
    if (options.mode !== undefined) this.simulation.setMode(options.mode);
    if (options.scenario !== undefined) this.simulation.setScenario(options.scenario);
  }

  get tickCount(): number {
    return this.tick;
  }

  get wallTimeSeconds(): number {
    return this.wallTime;
  }

  get remainderSeconds(): number {
    return this.remainder;
  }

  advanceTicks(count: number): number {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError('tick count must be a non-negative safe integer');
    }
    if (count > MAX_TICKS_PER_ADVANCE) {
      throw new RangeError(`cannot advance more than ${MAX_TICKS_PER_ADVANCE} ticks at once`);
    }
    this.wallTime += count * this.stepSeconds;
    this.runTicks(count);
    return count;
  }

  advanceBy(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError('advance duration must be a non-negative finite number');
    }
    this.wallTime += seconds;
    this.remainder += seconds;
    const epsilon = this.stepSeconds * 1e-9;
    const ticks = Math.floor((this.remainder + epsilon) / this.stepSeconds);
    if (ticks > MAX_TICKS_PER_ADVANCE) {
      this.wallTime -= seconds;
      this.remainder -= seconds;
      throw new RangeError(`advance duration would exceed ${MAX_TICKS_PER_ADVANCE} ticks`);
    }
    this.remainder -= ticks * this.stepSeconds;
    if (Math.abs(this.remainder) < epsilon) this.remainder = 0;
    this.runTicks(ticks);
    return ticks;
  }

  advanceTo(wallTimeSeconds: number): number {
    if (!Number.isFinite(wallTimeSeconds) || wallTimeSeconds < this.wallTime) {
      throw new RangeError('target wall time must be finite and cannot move backwards');
    }
    return this.advanceBy(wallTimeSeconds - this.wallTime);
  }

  runUntil(predicate: (snapshot: FixedStepSimulationSnapshot) => boolean, timeoutSeconds: number): boolean {
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0) {
      throw new RangeError('timeout must be a non-negative finite number');
    }
    if (predicate(this.snapshot())) return true;
    const maximumTicks = Math.ceil(timeoutSeconds / this.stepSeconds);
    if (maximumTicks > MAX_TICKS_PER_ADVANCE) {
      throw new RangeError(`timeout would exceed ${MAX_TICKS_PER_ADVANCE} ticks`);
    }
    for (let index = 0; index < maximumTicks; index += 1) {
      this.advanceTicks(1);
      if (predicate(this.snapshot())) return true;
    }
    return false;
  }

  clearEventLog(): void {
    this.eventLog.length = 0;
  }

  snapshot(): FixedStepSimulationSnapshot {
    const diagnostics = this.simulation.diagnostics();
    return {
      schemaVersion: 2,
      seed: this.config.seed,
      airportCode: this.config.code,
      stepSeconds: round(this.stepSeconds),
      tick: this.tick,
      wallTimeSeconds: round(this.wallTime),
      remainderSeconds: round(this.remainder),
      simulationTimeSeconds: round(this.simulation.state.elapsed),
      state: {
        arrivals: this.simulation.state.arrivals,
        departures: this.simulation.state.departures,
        gameOver: this.simulation.state.gameOver,
        paused: this.simulation.state.paused,
        mode: this.simulation.state.mode,
        scenario: this.simulation.state.scenario,
        runwayConfigurationId: this.simulation.state.runwayConfigurationId,
        activeRunwayEnds: { ...this.simulation.state.activeRunwayEnds },
        weather: {
          enabled: this.simulation.state.weather.weatherEnabled,
          windEnabled: this.simulation.state.weather.windEnabled,
          condition: this.simulation.state.weather.condition,
          windDirection: round(this.simulation.state.weather.windDirection),
          windSpeed: round(this.simulation.state.weather.windSpeed),
          gustSpeed: round(this.simulation.state.weather.gustSpeed),
          visibility: round(this.simulation.state.weather.visibility),
        },
      },
      flights: [...this.simulation.state.flights]
        .sort((first, second) => first.id - second.id)
        .map((flight) => snapshotFlight(this.config, flight)),
      diagnostics: {
        approachCapacity: diagnostics.approachCapacity,
        nextArrivalIn: round(diagnostics.nextArrivalIn),
        activeFlights: diagnostics.activeFlights,
        runwayReservations: [...diagnostics.runwayReservations]
          .sort((first, second) => first.runway - second.runway || first.flight - second.flight),
        collisionPairs: diagnostics.collisions
          .map((collision) => [collision.first, collision.second] as [number, number])
          .sort((first, second) => first[0] - second[0] || first[1] - second[1]),
        obstacleCollisions: diagnostics.obstacleCollisions
          .map((collision) => [collision.flight, collision.obstacle] as [number, string])
          .sort((first, second) => first[0] - second[0] || first[1].localeCompare(second[1])),
        collisionEnvelopeCounts: {
          aircraft: diagnostics.collisionEnvelopes.aircraft.length,
          obstacles: diagnostics.collisionEnvelopes.obstacles.length,
        },
        metrics: snapshotMetrics(diagnostics.metrics),
      },
      events: this.eventLog.map((event) => ({ ...event })),
    };
  }

  private runTicks(count: number): void {
    for (let index = 0; index < count; index += 1) {
      this.simulation.update(this.stepSeconds);
      this.tick += 1;
      this.captureEvents(this.simulation.drainEvents());
    }
  }

  private captureEvents(events: AirportEvent[]): void {
    for (const event of events) {
      this.eventLog.push({
        tick: this.tick,
        simulationTimeSeconds: round(this.simulation.state.elapsed),
        type: event.type,
        flightId: event.flight.id,
        callsign: event.flight.callsign,
        phase: event.flight.phase,
        progress: round(event.flight.progress),
        runway: event.runway ?? event.flight.runway,
        taxiway: event.taxiway ?? event.flight.taxiway,
        detail: event.detail,
      });
    }
  }
}

export function createSeededSimulationHarness(seed: number, options: FixedStepHarnessOptions = {}): FixedStepSimulationHarness {
  if (!Number.isSafeInteger(seed)) throw new RangeError('seed must be a safe integer');
  return new FixedStepSimulationHarness(generateAirportConfig(seed), options);
}

export function createHubSimulationHarness(airport: number | string, options: FixedStepHarnessOptions = {}): FixedStepSimulationHarness {
  const index = typeof airport === 'number'
    ? airport
    : HUB_AIRPORTS.findIndex((profile) => profile.code === airport.toUpperCase());
  if (!Number.isSafeInteger(index) || index < 0 || index >= HUB_AIRPORTS.length) {
    throw new RangeError(`unknown hub airport: ${airport}`);
  }
  return new FixedStepSimulationHarness(generateHubConfig(index), options);
}

function snapshotFlight(config: AirportConfig, flight: Flight): FixedStepFlightSnapshot {
  const trajectory = sampleFlightTrajectory(config, flight);
  return {
    id: flight.id,
    callsign: flight.callsign,
    runway: flight.runway,
    departureRunway: flight.departureRunway,
    operatingEnd: flight.operatingEnd,
    phase: flight.phase,
    progress: round(flight.progress),
    phaseElapsed: round(flight.phaseElapsed),
    duration: round(flight.duration),
    cleared: flight.cleared,
    taxiway: flight.taxiway,
    standId: flight.standId,
    surfaceNode: flight.surfaceNode,
    surfaceEdge: flight.surfaceEdge,
    surfaceRoute: [...(flight.surfaceRoute ?? [])],
    controlPace: round(flight.controlPace ?? 1),
    held: Boolean(flight.controlHold),
    automaticHold: Boolean(flight.automaticHold),
    crossingHoldRunway: flight.crossingHoldRunway,
    safetyHold: Boolean(flight.safetyHold),
    safetyHoldReason: flight.safetyHoldReason,
    runwayEntryCleared: Boolean(flight.runwayEntryCleared),
    takeoffCleared: Boolean(flight.takeoffCleared),
    crossingClearances: [...(flight.crossingClearances ?? [])].sort((first, second) => first - second),
    crossingClearanceIds: [...(flight.crossingClearanceIds ?? [])].sort(),
    airspeedKts: round(flight.kinematics.airspeedKts),
    groundSpeedKts: round(flight.kinematics.groundSpeedKts),
    altitudeFt: round(flight.kinematics.altitudeFt),
    verticalSpeedFpm: round(flight.kinematics.verticalSpeedFpm),
    fuelPercent: round(flight.kinematics.fuelPercent),
    trajectory: trajectory ? {
      stage: trajectory.stage,
      stageProgress: round(trajectory.stageProgress),
      x: round(trajectory.x),
      y: round(trajectory.y),
      z: round(trajectory.z),
      heading: round(trajectory.heading),
      pitch: round(trajectory.pitch),
      onGround: trajectory.onGround,
      distanceAlong: round(trajectory.distanceAlong),
      totalDistance: round(trajectory.totalDistance),
    } : null,
  };
}

function snapshotMetrics(metrics: ShiftMetrics): ShiftMetrics {
  return {
    safeArrivals: metrics.safeArrivals,
    safeDepartures: metrics.safeDepartures,
    preventedConflicts: metrics.preventedConflicts,
    holdsIssued: metrics.holdsIssued,
    manualCommands: metrics.manualCommands,
    maxConcurrent: metrics.maxConcurrent,
    airborneSeconds: round(metrics.airborneSeconds),
    taxiSeconds: round(metrics.taxiSeconds),
    estimatedDelaySeconds: round(metrics.estimatedDelaySeconds),
    emergencyResponses: metrics.emergencyResponses,
    safetyHolds: metrics.safetyHolds,
    collisionAlerts: metrics.collisionAlerts,
    runwayIncursions: metrics.runwayIncursions,
    unexplainedPauses: metrics.unexplainedPauses,
    longestHoldSeconds: round(metrics.longestHoldSeconds),
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

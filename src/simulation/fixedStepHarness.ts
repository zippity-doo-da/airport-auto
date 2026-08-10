import {
  generateAirportConfig,
  generateHubConfig,
  HUB_AIRPORTS,
  type AirportConfig,
  type RunwayOperationalRole,
} from "./airportConfig";
import { AirportSimulation } from "./airportSimulation";
import type {
  AirportEvent,
  ControlMode,
  EnvironmentState,
  Flight,
  FlightPhase,
  RunwayConfigurationTransition,
  ScriptedControllerRuntime,
  ShiftMetrics,
  SurfaceDisruptionState,
  TrafficScenario,
  WeatherState,
} from "./types";
import {
  sampleFlightTrajectory,
  type FlightTrajectoryStage,
} from "./flightTrajectory";
import { cloneFlightPlan } from "./flightPlanning";
import type { TrafficDensity } from "./trafficDensity";
import type { TrafficFlowSnapshot } from "./trafficFlowManagement";

const DEFAULT_STEP_SECONDS = 0.05;
const MAX_STEP_SECONDS = 0.1;
const MAX_TICKS_PER_ADVANCE = 1_000_000;

export interface FixedStepHarnessOptions {
  stepSeconds?: number;
  pace?: number;
  mode?: ControlMode;
  scenario?: TrafficScenario;
  density?: TrafficDensity;
}

export interface FixedStepHarnessEvent {
  tick: number;
  simulationTimeSeconds: number;
  type: AirportEvent["type"];
  flightId: number;
  callsign: string;
  phase: FlightPhase;
  progress: number;
  runway: number;
  taxiway?: string;
  detail?: string;
  turnaroundService?: AirportEvent["turnaroundService"];
  serviceVehicleId?: AirportEvent["serviceVehicleId"];
  serviceVehicleType?: AirportEvent["serviceVehicleType"];
  serviceVehicleStatus?: AirportEvent["serviceVehicleStatus"];
  domainEventId?: string;
  causedByCommandId?: string;
  causedByControllerDecisionId?: string;
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
  gateSlot: number;
  operationPlan: Flight["operationPlan"];
  flightPlan: Flight["flightPlan"];
  flightPlanHistory: Flight["flightPlanHistory"];
  fuelPlan: Flight["fuelPlan"];
  gateAssignment?: {
    standId: string;
    gateRef?: string;
    zoneName: string;
    terminalId?: string;
    concourse?: string;
    scheduledGateInSeconds: number;
    scheduledDepartureSeconds: number;
    nextDestination: string;
    airlineFit: "preferred" | "compatible" | "fallback";
    serviceFit: "preferred" | "compatible" | "fallback";
    score: number;
    revision: number;
  };
  turnaround: {
    status: Flight["turnaround"]["status"];
    progress: number;
    elapsedSeconds: number;
    plannedDurationSeconds: number;
    scheduledStartSeconds: number;
    scheduledReadySeconds: number;
    actualStartSeconds?: number;
    actualReadySeconds?: number;
    releasedAtSeconds?: number;
    initialFuelPercent: number;
    targetFuelPercent: number;
    tasks: Array<{
      type: Flight["turnaround"]["tasks"][number]["type"];
      required: boolean;
      status: Flight["turnaround"]["tasks"][number]["status"];
      durationSeconds: number;
      scheduledStartOffsetSeconds: number;
      elapsedSeconds: number;
      dependencies: Flight["turnaround"]["tasks"][number]["dependencies"];
    }>;
  };
  deicing: Flight["deicing"];
  pushbackCleared: boolean;
  pushbackDirection: Flight["pushbackDirection"];
  pushbackProgress: number;
  pushbackReleaseProgress: number;
  tugAttached: boolean;
  engineState: Flight["engineState"];
  surfaceNode?: string;
  surfaceEdge?: string;
  surfaceRoute: string[];
  surfaceRouteEdges: string[];
  surfaceReroute?: Flight["surfaceReroute"];
  controlPace: number;
  held: boolean;
  automaticHold: boolean;
  crossingHoldRunway?: number;
  safetyHold: boolean;
  safetyHoldReason?: string;
  runwayEntryCleared: boolean;
  takeoffCleared: boolean;
  takeoffPerformance?: Flight["takeoffPerformance"];
  rejectedTakeoff?: Flight["rejectedTakeoff"];
  groundStop?: Flight["groundStop"];
  handoff?: Flight["navigation"]["handoff"];
  vectorEvidence?: NonNullable<Flight["navigation"]["vector"]>["evidence"];
  holdEvidence?: NonNullable<Flight["navigation"]["hold"]>["evidence"];
  altitudeClearance?: Flight["navigation"]["altitudeClearance"];
  speedClearance?: Flight["navigation"]["speedClearance"];
  goAroundEvidence?: NonNullable<Flight["goAround"]>["evidence"];
  weatherEscape?: Flight["weatherEscape"];
  goAroundWeatherEscape?: NonNullable<Flight["goAround"]>["weatherEscape"];
  crossingClearances: number[];
  crossingClearanceIds: string[];
  surfaceInstructions?: Flight["surfaceInstructions"];
  airspeedKts: number;
  groundSpeedKts: number;
  altitudeFt: number;
  verticalSpeedFpm: number;
  fuelPercent: number;
  motionStage?: string;
  motionStageProgress: number;
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
  schemaVersion: 18;
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
    operationTimeOffsetMinutes: number;
    trafficDensity: TrafficDensity;
    trafficFlow: TrafficFlowSnapshot;
    runwayConfigurationId: string;
    runwayConfigurationMode: "automatic" | "manual";
    runwayConfigurationTransition: RunwayConfigurationTransition | null;
    activeRunwayEnds: Record<number, -1 | 1>;
    activeRunwayRoles: Record<number, RunwayOperationalRole>;
    surfaceDisruptions: SurfaceDisruptionState[];
    scriptedControllers: ScriptedControllerRuntime;
    environment: EnvironmentState;
    weather: {
      enabled: boolean;
      windEnabled: boolean;
      condition: string;
      precipitation: WeatherState["precipitation"];
      intensity: number;
      cloudCover: number;
      windDirection: number;
      windSpeed: number;
      gustSpeed: number;
      visibility: number;
      ceilingFt: number;
      temperatureC: number;
      surfaceCondition: "dry" | "wet" | "contaminated";
      runwayConditionReports: WeatherState["runwayConditionReports"];
      hazardsEnabled: boolean;
      activeHazard: WeatherState["activeHazard"];
      hazardHistory: WeatherState["hazardHistory"];
    };
  };
  flights: FixedStepFlightSnapshot[];
  serviceVehicles: Array<{
    id: string;
    flightId: number;
    service: AirportEvent["turnaroundService"];
    type: AirportEvent["serviceVehicleType"];
    status: AirportEvent["serviceVehicleStatus"];
    standId: string;
    progress: number;
    x: number;
    y: number;
    heading: number;
    groundSpeedMps: number;
    held: boolean;
    holdReason?: string;
    protectedMovementArea: boolean;
    currentEdge?: string;
  }>;
  diagnostics: {
    approachCapacity: number;
    nextArrivalIn: number;
    activeFlights: number;
    runwayReservations: Array<{ runway: number; flight: number }>;
    collisionPairs: Array<[number, number]>;
    obstacleCollisions: Array<[number, string]>;
    collisionEnvelopeCounts: { aircraft: number; obstacles: number };
    metrics: ShiftMetrics;
    deicing: {
      facilities: number;
      required: number;
      queued: number;
      treating: number;
      protected: number;
      expired: number;
    };
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

  constructor(
    readonly config: AirportConfig,
    options: FixedStepHarnessOptions = {},
  ) {
    const stepSeconds = options.stepSeconds ?? DEFAULT_STEP_SECONDS;
    if (
      !Number.isFinite(stepSeconds) ||
      stepSeconds <= 0 ||
      stepSeconds > MAX_STEP_SECONDS
    ) {
      throw new RangeError(
        `stepSeconds must be greater than 0 and no more than ${MAX_STEP_SECONDS}`,
      );
    }
    if (
      options.pace !== undefined &&
      (!Number.isFinite(options.pace) || options.pace <= 0)
    ) {
      throw new RangeError("pace must be a positive finite number");
    }

    this.stepSeconds = stepSeconds;
    this.simulation = new AirportSimulation(config, options.density);
    if (options.pace !== undefined) this.simulation.setPace(options.pace);
    if (options.mode !== undefined) this.simulation.setMode(options.mode);
    if (options.scenario !== undefined)
      this.simulation.setScenario(options.scenario);
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
      throw new RangeError("tick count must be a non-negative safe integer");
    }
    if (count > MAX_TICKS_PER_ADVANCE) {
      throw new RangeError(
        `cannot advance more than ${MAX_TICKS_PER_ADVANCE} ticks at once`,
      );
    }
    this.wallTime += count * this.stepSeconds;
    this.runTicks(count);
    return count;
  }

  advanceBy(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError(
        "advance duration must be a non-negative finite number",
      );
    }
    this.wallTime += seconds;
    this.remainder += seconds;
    const epsilon = this.stepSeconds * 1e-9;
    const ticks = Math.floor((this.remainder + epsilon) / this.stepSeconds);
    if (ticks > MAX_TICKS_PER_ADVANCE) {
      this.wallTime -= seconds;
      this.remainder -= seconds;
      throw new RangeError(
        `advance duration would exceed ${MAX_TICKS_PER_ADVANCE} ticks`,
      );
    }
    this.remainder -= ticks * this.stepSeconds;
    if (Math.abs(this.remainder) < epsilon) this.remainder = 0;
    this.runTicks(ticks);
    return ticks;
  }

  advanceTo(wallTimeSeconds: number): number {
    if (!Number.isFinite(wallTimeSeconds) || wallTimeSeconds < this.wallTime) {
      throw new RangeError(
        "target wall time must be finite and cannot move backwards",
      );
    }
    return this.advanceBy(wallTimeSeconds - this.wallTime);
  }

  runUntil(
    predicate: (snapshot: FixedStepSimulationSnapshot) => boolean,
    timeoutSeconds: number,
  ): boolean {
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0) {
      throw new RangeError("timeout must be a non-negative finite number");
    }
    if (predicate(this.snapshot())) return true;
    const maximumTicks = Math.ceil(timeoutSeconds / this.stepSeconds);
    if (maximumTicks > MAX_TICKS_PER_ADVANCE) {
      throw new RangeError(
        `timeout would exceed ${MAX_TICKS_PER_ADVANCE} ticks`,
      );
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
      schemaVersion: 18,
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
        operationTimeOffsetMinutes:
          this.simulation.state.operationTimeOffsetMinutes,
        trafficDensity: this.simulation.state.trafficFlow.density,
        trafficFlow: this.simulation.trafficFlowSnapshot(),
        runwayConfigurationId: this.simulation.state.runwayConfigurationId,
        runwayConfigurationMode: this.simulation.state.runwayConfigurationMode,
        runwayConfigurationTransition: this.simulation.state
          .runwayConfigurationTransition
          ? {
              ...this.simulation.state.runwayConfigurationTransition,
              changedRunwayIds: [
                ...this.simulation.state.runwayConfigurationTransition
                  .changedRunwayIds,
              ],
              blockingFlightIds: [
                ...this.simulation.state.runwayConfigurationTransition
                  .blockingFlightIds,
              ],
            }
          : null,
        activeRunwayEnds: { ...this.simulation.state.activeRunwayEnds },
        activeRunwayRoles: { ...this.simulation.state.activeRunwayRoles },
        surfaceDisruptions: this.simulation.state.surfaceDisruptions.map(
          (disruption) => ({
            ...disruption,
            edgeIds: [...disruption.edgeIds],
            reroutedFlightIds: [...disruption.reroutedFlightIds],
          }),
        ),
        scriptedControllers: structuredClone(
          this.simulation.state.scriptedControllers,
        ),
        environment: { ...this.simulation.state.environment },
        weather: {
          enabled: this.simulation.state.weather.weatherEnabled,
          windEnabled: this.simulation.state.weather.windEnabled,
          condition: this.simulation.state.weather.condition,
          precipitation: this.simulation.state.weather.precipitation,
          intensity: round(this.simulation.state.weather.intensity),
          cloudCover: round(this.simulation.state.weather.cloudCover),
          windDirection: round(this.simulation.state.weather.windDirection),
          windSpeed: round(this.simulation.state.weather.windSpeed),
          gustSpeed: round(this.simulation.state.weather.gustSpeed),
          visibility: round(this.simulation.state.weather.visibility),
          ceilingFt: round(this.simulation.state.weather.ceilingFt),
          temperatureC: round(this.simulation.state.weather.temperatureC),
          surfaceCondition: this.simulation.state.weather.surfaceCondition,
          runwayConditionReports:
            this.simulation.state.weather.runwayConditionReports.map(
              (report) => ({
                ...report,
                codes: [...report.codes],
                reportedAtSeconds: round(report.reportedAtSeconds),
              }),
            ),
          hazardsEnabled: this.simulation.state.weather.hazardsEnabled,
          activeHazard: this.simulation.state.weather.activeHazard
            ? {
                ...this.simulation.state.weather.activeHazard,
                affectedFlightIds: [
                  ...this.simulation.state.weather.activeHazard
                    .affectedFlightIds,
                ],
              }
            : null,
          hazardHistory: this.simulation.state.weather.hazardHistory.map(
            (hazard) => ({
              ...hazard,
              affectedFlightIds: [...hazard.affectedFlightIds],
            }),
          ),
        },
      },
      flights: [...this.simulation.state.flights]
        .sort((first, second) => first.id - second.id)
        .map((flight) => snapshotFlight(this.config, flight)),
      serviceVehicles: [...this.simulation.state.serviceVehicles]
        .sort((first, second) => first.id.localeCompare(second.id))
        .map((vehicle) => ({
          id: vehicle.id,
          flightId: vehicle.flightId,
          service: vehicle.service,
          type: vehicle.type,
          status: vehicle.status,
          standId: vehicle.standId,
          progress: round(vehicle.progress),
          x: round(vehicle.x),
          y: round(vehicle.y),
          heading: round(vehicle.heading),
          groundSpeedMps: round(vehicle.groundSpeedMps),
          held: vehicle.held,
          holdReason: vehicle.holdReason,
          protectedMovementArea: vehicle.protectedMovementArea,
          currentEdge: vehicle.currentEdge,
        })),
      diagnostics: {
        approachCapacity: diagnostics.approachCapacity,
        nextArrivalIn: round(diagnostics.nextArrivalIn),
        activeFlights: diagnostics.activeFlights,
        runwayReservations: [...diagnostics.runwayReservations].sort(
          (first, second) =>
            first.runway - second.runway || first.flight - second.flight,
        ),
        collisionPairs: diagnostics.collisions
          .map(
            (collision) =>
              [collision.first, collision.second] as [number, number],
          )
          .sort(
            (first, second) => first[0] - second[0] || first[1] - second[1],
          ),
        obstacleCollisions: diagnostics.obstacleCollisions
          .map(
            (collision) =>
              [collision.flight, collision.obstacle] as [number, string],
          )
          .sort(
            (first, second) =>
              first[0] - second[0] || first[1].localeCompare(second[1]),
          ),
        collisionEnvelopeCounts: {
          aircraft: diagnostics.collisionEnvelopes.aircraft.length,
          obstacles: diagnostics.collisionEnvelopes.obstacles.length,
        },
        metrics: snapshotMetrics(diagnostics.metrics),
        deicing: {
          facilities: diagnostics.deicing.facilities.length,
          required: diagnostics.deicing.required,
          queued: diagnostics.deicing.queued,
          treating: diagnostics.deicing.treating,
          protected: diagnostics.deicing.protected,
          expired: diagnostics.deicing.expired,
        },
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
        turnaroundService: event.turnaroundService,
        serviceVehicleId: event.serviceVehicleId,
        serviceVehicleType: event.serviceVehicleType,
        serviceVehicleStatus: event.serviceVehicleStatus,
        domainEventId: event.domainEventId,
        causedByCommandId: event.causedByCommandId,
        causedByControllerDecisionId: event.causedByControllerDecisionId,
      });
    }
  }
}

export function createSeededSimulationHarness(
  seed: number,
  options: FixedStepHarnessOptions = {},
): FixedStepSimulationHarness {
  if (!Number.isSafeInteger(seed))
    throw new RangeError("seed must be a safe integer");
  return new FixedStepSimulationHarness(generateAirportConfig(seed), options);
}

export function createHubSimulationHarness(
  airport: number | string,
  options: FixedStepHarnessOptions = {},
): FixedStepSimulationHarness {
  const index =
    typeof airport === "number"
      ? airport
      : HUB_AIRPORTS.findIndex(
          (profile) => profile.code === airport.toUpperCase(),
        );
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= HUB_AIRPORTS.length
  ) {
    throw new RangeError(`unknown hub airport: ${airport}`);
  }
  return new FixedStepSimulationHarness(generateHubConfig(index), options);
}

function snapshotFlight(
  config: AirportConfig,
  flight: Flight,
): FixedStepFlightSnapshot {
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
    gateSlot: flight.gateSlot,
    operationPlan: { ...flight.operationPlan },
    flightPlan: cloneFlightPlan(flight.flightPlan),
    flightPlanHistory: flight.flightPlanHistory.map(cloneFlightPlan),
    fuelPlan: {
      ...flight.fuelPlan,
      arrival: { ...flight.fuelPlan.arrival },
      departure: { ...flight.fuelPlan.departure },
      assumptions: [...flight.fuelPlan.assumptions],
    },
    gateAssignment: flight.gateAssignment
      ? {
          standId: flight.gateAssignment.standId,
          gateRef: flight.gateAssignment.gateRef,
          zoneName: flight.gateAssignment.zoneName,
          terminalId: flight.gateAssignment.terminalId,
          concourse: flight.gateAssignment.concourse,
          scheduledGateInSeconds: round(
            flight.gateAssignment.scheduledGateInSeconds,
          ),
          scheduledDepartureSeconds: round(
            flight.gateAssignment.scheduledDepartureSeconds,
          ),
          nextDestination: flight.gateAssignment.nextDestination,
          airlineFit: flight.gateAssignment.airlineFit,
          serviceFit: flight.gateAssignment.serviceFit,
          score: round(flight.gateAssignment.score),
          revision: flight.gateAssignment.revision,
        }
      : undefined,
    turnaround: {
      status: flight.turnaround.status,
      progress: round(flight.turnaround.progress),
      elapsedSeconds: round(flight.turnaround.elapsedSeconds),
      plannedDurationSeconds: round(flight.turnaround.plannedDurationSeconds),
      scheduledStartSeconds: round(flight.turnaround.scheduledStartSeconds),
      scheduledReadySeconds: round(flight.turnaround.scheduledReadySeconds),
      actualStartSeconds:
        flight.turnaround.actualStartSeconds === undefined
          ? undefined
          : round(flight.turnaround.actualStartSeconds),
      actualReadySeconds:
        flight.turnaround.actualReadySeconds === undefined
          ? undefined
          : round(flight.turnaround.actualReadySeconds),
      releasedAtSeconds:
        flight.turnaround.releasedAtSeconds === undefined
          ? undefined
          : round(flight.turnaround.releasedAtSeconds),
      initialFuelPercent: round(flight.turnaround.initialFuelPercent),
      targetFuelPercent: round(flight.turnaround.targetFuelPercent),
      tasks: flight.turnaround.tasks.map((task) => ({
        type: task.type,
        required: task.required,
        status: task.status,
        durationSeconds: round(task.durationSeconds),
        scheduledStartOffsetSeconds: round(task.scheduledStartOffsetSeconds),
        elapsedSeconds: round(task.elapsedSeconds),
        dependencies: [...task.dependencies],
      })),
    },
    deicing: { ...flight.deicing },
    pushbackCleared: flight.pushbackCleared,
    pushbackDirection: flight.pushbackDirection,
    pushbackProgress: round(flight.pushbackProgress),
    pushbackReleaseProgress: round(flight.pushbackReleaseProgress),
    tugAttached: flight.tugAttached,
    engineState: flight.engineState,
    surfaceNode: flight.surfaceNode,
    surfaceEdge: flight.surfaceEdge,
    surfaceRoute: [...(flight.surfaceRoute ?? [])],
    surfaceRouteEdges: [...(flight.surfaceRouteEdges ?? [])],
    surfaceReroute: flight.surfaceReroute
      ? {
          ...flight.surfaceReroute,
          disruptionIds: [...flight.surfaceReroute.disruptionIds],
          previousEdgeIds: [...flight.surfaceReroute.previousEdgeIds],
          routeEdgeIds: [...flight.surfaceReroute.routeEdgeIds],
        }
      : undefined,
    controlPace: round(flight.controlPace ?? 1),
    held: Boolean(flight.controlHold),
    automaticHold: Boolean(flight.automaticHold),
    crossingHoldRunway: flight.crossingHoldRunway,
    safetyHold: Boolean(flight.safetyHold),
    safetyHoldReason: flight.safetyHoldReason,
    runwayEntryCleared: Boolean(flight.runwayEntryCleared),
    takeoffCleared: Boolean(flight.takeoffCleared),
    takeoffPerformance: flight.takeoffPerformance
      ? { ...flight.takeoffPerformance }
      : undefined,
    rejectedTakeoff: flight.rejectedTakeoff
      ? {
          ...flight.rejectedTakeoff,
          evidence: flight.rejectedTakeoff.evidence
            ? {
                ...flight.rejectedTakeoff.evidence,
                causalEventIds: [
                  ...flight.rejectedTakeoff.evidence.causalEventIds,
                ],
              }
            : undefined,
        }
      : undefined,
    groundStop: flight.groundStop
      ? {
          ...flight.groundStop,
          causalEventIds: [...flight.groundStop.causalEventIds],
        }
      : undefined,
    handoff: flight.navigation.handoff
      ? {
          ...flight.navigation.handoff,
          causalEventIds: [...(flight.navigation.handoff.causalEventIds ?? [])],
        }
      : undefined,
    vectorEvidence: flight.navigation.vector?.evidence
      ? {
          ...flight.navigation.vector.evidence,
          causalEventIds: [...flight.navigation.vector.evidence.causalEventIds],
        }
      : undefined,
    holdEvidence: flight.navigation.hold?.evidence
      ? {
          ...flight.navigation.hold.evidence,
          causalEventIds: [...flight.navigation.hold.evidence.causalEventIds],
        }
      : undefined,
    altitudeClearance: flight.navigation.altitudeClearance
      ? {
          ...flight.navigation.altitudeClearance,
          causalEventIds: [
            ...flight.navigation.altitudeClearance.causalEventIds,
          ],
        }
      : undefined,
    speedClearance: flight.navigation.speedClearance
      ? {
          ...flight.navigation.speedClearance,
          causalEventIds: [...flight.navigation.speedClearance.causalEventIds],
        }
      : undefined,
    goAroundEvidence: flight.goAround?.evidence
      ? {
          ...flight.goAround.evidence,
          causalEventIds: [...flight.goAround.evidence.causalEventIds],
        }
      : undefined,
    weatherEscape: flight.weatherEscape
      ? { ...flight.weatherEscape }
      : undefined,
    goAroundWeatherEscape: flight.goAround?.weatherEscape
      ? { ...flight.goAround.weatherEscape }
      : undefined,
    crossingClearances: [...(flight.crossingClearances ?? [])].sort(
      (first, second) => first - second,
    ),
    crossingClearanceIds: [...(flight.crossingClearanceIds ?? [])].sort(),
    surfaceInstructions: flight.surfaceInstructions?.map((instruction) => ({
      ...instruction,
      routeNodeIds: instruction.routeNodeIds
        ? [...instruction.routeNodeIds]
        : undefined,
      taxiwayIds: instruction.taxiwayIds
        ? [...instruction.taxiwayIds]
        : undefined,
      evidence: {
        ...instruction.evidence,
        causalEventIds: [...instruction.evidence.causalEventIds],
      },
    })),
    airspeedKts: round(flight.kinematics.airspeedKts),
    groundSpeedKts: round(flight.kinematics.groundSpeedKts),
    altitudeFt: round(flight.kinematics.altitudeFt),
    verticalSpeedFpm: round(flight.kinematics.verticalSpeedFpm),
    fuelPercent: round(flight.kinematics.fuelPercent),
    motionStage: flight.motion.stage,
    motionStageProgress: round(flight.motion.stageProgress),
    trajectory: trajectory
      ? {
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
        }
      : null,
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
    diversions: metrics.diversions,
    cancellations: metrics.cancellations,
    emergencyResponses: metrics.emergencyResponses,
    safetyHolds: metrics.safetyHolds,
    collisionAlerts: metrics.collisionAlerts,
    runwayIncursions: metrics.runwayIncursions,
    unexplainedPauses: metrics.unexplainedPauses,
    longestHoldSeconds: round(metrics.longestHoldSeconds),
    handoffOffers: metrics.handoffOffers,
    handoffAcceptances: metrics.handoffAcceptances,
    handoffRejections: metrics.handoffRejections,
    missedHandoffs: metrics.missedHandoffs,
    fuelBurnKg: round(metrics.fuelBurnKg),
    holdingFuelBurnKg: round(metrics.holdingFuelBurnKg),
    goArounds: metrics.goArounds,
    emergencyResolutions: metrics.emergencyResolutions,
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

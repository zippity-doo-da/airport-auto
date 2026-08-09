export const REMOTE_CONTROL_HOST_SCHEMA_VERSION = 1 as const;
export const REMOTE_GATEWAY_PROTOCOL_VERSION = "1.0.0" as const;

export type RemoteControlHostState = {
  schemaVersion: typeof REMOTE_CONTROL_HOST_SCHEMA_VERSION;
  configured: boolean;
  status:
    "disconnected" | "connecting" | "connected" | "reconnecting" | "error";
  connected: boolean;
  endpoint: string | null;
  sessionId: string | null;
  clientId: string;
  gatewayProtocolVersion: string | null;
  connectionId: string | null;
  connectedAt: string | null;
  lastStatePublishedAt: string | null;
  lastEventPublishedAt: string | null;
  reconnectAttempt: number;
  emergencyStop: {
    active: boolean;
    reason: string | null;
    byClientId: string | null;
    changedAt: string | null;
  };
  lastError: string | null;
};

export type RemoteControlHostConfiguration = {
  endpoint: string;
  sessionId: string;
  token: string;
  clientId?: string;
};

type JsonRecord = Record<string, unknown>;

type RemoteHostOptions = {
  snapshot: () => unknown;
  dispatch: (envelope: unknown) => unknown;
  onStateChange?: (state: RemoteControlHostState) => void;
  publishIntervalMs?: number;
  reconnectMaximumDelayMs?: number;
};

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maximum = 256): string | null {
  return typeof value === "string" && value.length
    ? value.slice(0, maximum)
    : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compactFlight(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  const airline = isRecord(value.airline) ? value.airline : {};
  const aircraft = isRecord(value.aircraft) ? value.aircraft : {};
  const kinematics = isRecord(value.kinematics) ? value.kinematics : {};
  const trajectory = isRecord(value.trajectory) ? value.trajectory : {};
  const position = isRecord(trajectory.position) ? trajectory.position : {};
  const navigation = isRecord(value.navigation) ? value.navigation : {};
  const handoff = isRecord(navigation.handoff) ? navigation.handoff : null;
  const gate = isRecord(value.gate) ? value.gate : null;
  return {
    id: value.id,
    callsign: value.callsign,
    phase: value.phase,
    runway: value.runway,
    departureRunway: value.departureRunway,
    operatingEnd: value.operatingEnd,
    progress: value.progress,
    origin: value.origin,
    destination: value.destination,
    squawk: value.squawk,
    service: value.service,
    emergency: value.emergency ?? null,
    procedure: value.procedure ?? null,
    airline: {
      code: airline.code ?? null,
      name: airline.name ?? null,
      primaryColor: airline.primaryColor ?? null,
    },
    aircraft: {
      model: aircraft.model ?? null,
      name: aircraft.name ?? null,
      category: aircraft.category ?? value.category ?? null,
      wakeClass: aircraft.wakeClass ?? value.wakeClass ?? null,
    },
    altitudeFt: number(kinematics.altitudeFt) ?? 0,
    airspeedKts: number(kinematics.airspeedKts) ?? 0,
    groundSpeedKts: number(kinematics.groundSpeedKts) ?? 0,
    verticalSpeedFpm: number(kinematics.verticalSpeedFpm) ?? 0,
    fuelPercent: number(kinematics.fuelPercent) ?? 0,
    headingDegrees:
      number(kinematics.headingDegrees) ??
      number(trajectory.headingDegrees) ??
      0,
    cardinalDirection: kinematics.cardinalDirection ?? null,
    position: {
      x: number(position.x) ?? 0,
      y: number(position.y) ?? 0,
      z: number(position.z) ?? 0,
    },
    onGround: trajectory.onGround === true,
    taxiway: value.taxiway ?? null,
    stand: value.stand ?? null,
    gate: gate
      ? {
          id: gate.id ?? null,
          ref: gate.ref ?? null,
          terminal: gate.terminal ?? null,
          concourse: gate.concourse ?? null,
        }
      : null,
    controller:
      navigation.controller ??
      navigation.station ??
      navigation.ownerStation ??
      null,
    handoff: handoff
      ? {
          from: handoff.from ?? null,
          to: handoff.to ?? null,
          status: handoff.status ?? null,
          deadline: handoff.deadline ?? null,
        }
      : null,
    clearances: {
      landing: value.cleared === true || value.landingCleared === true,
      pushback: value.pushbackCleared === true,
      runwayEntry: value.runwayEntryCleared === true,
      takeoff: value.takeoffCleared === true,
      holdingShortOf: value.holdShortRunway ?? null,
    },
  };
}

function compactQueue(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  return {
    id: value.id ?? null,
    kind: value.kind ?? value.type ?? null,
    label: value.label ?? value.name ?? null,
    count:
      value.count ??
      (Array.isArray(value.flightIds) ? value.flightIds.length : null),
    flightIds: Array.isArray(value.flightIds)
      ? value.flightIds.slice(0, 40)
      : [],
    longestWaitSeconds: value.longestWaitSeconds ?? value.waitSeconds ?? null,
    reason: value.reason ?? value.detail ?? null,
  };
}

function compactSurfaceTrack(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  const routeGeometry = isRecord(value.routeGeometry)
    ? value.routeGeometry
    : null;
  const routePoints =
    routeGeometry && Array.isArray(routeGeometry.points)
      ? routeGeometry.points
          .filter(
            (point): point is unknown[] =>
              Array.isArray(point) && point.length >= 2,
          )
          .slice(0, 30)
          .map((point) => [number(point[0]) ?? 0, number(point[1]) ?? 0])
      : [];
  const crossings =
    routeGeometry && Array.isArray(routeGeometry.crossings)
      ? routeGeometry.crossings
          .filter(isRecord)
          .slice(0, 8)
          .map((crossing) => ({
            id: text(crossing.id, 180),
            runwayId: crossing.runwayId ?? null,
            status: crossing.status ?? null,
            holdPoint:
              Array.isArray(crossing.holdPoint) &&
              crossing.holdPoint.length >= 2
                ? [
                    number(crossing.holdPoint[0]) ?? 0,
                    number(crossing.holdPoint[1]) ?? 0,
                  ]
                : null,
            crossingPoint:
              Array.isArray(crossing.crossingPoint) &&
              crossing.crossingPoint.length >= 2
                ? [
                    number(crossing.crossingPoint[0]) ?? 0,
                    number(crossing.crossingPoint[1]) ?? 0,
                  ]
                : null,
          }))
      : [];
  return {
    schemaVersion: value.schemaVersion ?? null,
    id: value.id ?? null,
    callsign: value.callsign ?? null,
    aircraft: value.aircraft ?? null,
    x: number(value.x) ?? 0,
    y: number(value.y) ?? 0,
    headingDegrees: number(value.headingDegrees) ?? 0,
    groundspeedKts: number(value.groundspeedKts) ?? 0,
    location: text(value.location, 120),
    state: value.state ?? null,
    protectedRunway: value.protectedRunway === true,
    runwayId: value.runwayId ?? null,
    surfaceEdgeId: text(value.surfaceEdgeId, 120),
    surfaceNodeId: text(value.surfaceNodeId, 120),
    routeIntent: text(value.routeIntent, 240),
    clearanceSummary: text(value.clearanceSummary, 160),
    surveillanceAgeSeconds: number(value.surveillanceAgeSeconds) ?? 0,
    routeGeometry: routeGeometry
      ? {
          schemaVersion: routeGeometry.schemaVersion ?? null,
          points: routePoints,
          crossings,
        }
      : null,
  };
}

function compactSurfaceVehicle(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  return {
    id: value.id ?? null,
    callsign: value.callsign ?? null,
    label: text(value.label, 120),
    type: value.type ?? null,
    x: number(value.x) ?? 0,
    y: number(value.y) ?? 0,
    headingDegrees: number(value.headingDegrees) ?? 0,
    groundspeedKts: number(value.groundspeedKts) ?? 0,
    location: text(value.location, 120),
    state: value.state ?? null,
    held: value.held === true,
    protectedMovementArea: value.protectedMovementArea === true,
    protectedMovementAuthorized: value.protectedMovementAuthorized === true,
    surfaceEdgeId: text(value.surfaceEdgeId, 120),
    surfaceNodeId: text(value.surfaceNodeId, 120),
  };
}

function compactSurfaceProtectionCorridor(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  const points = Array.isArray(value.points)
    ? value.points
        .filter(
          (point): point is unknown[] =>
            Array.isArray(point) && point.length >= 2,
        )
        .slice(0, 18)
        .map((point) => [number(point[0]) ?? 0, number(point[1]) ?? 0])
    : [];
  return {
    schemaVersion: value.schemaVersion ?? null,
    id: text(value.id, 180),
    operation: value.operation ?? null,
    flightId: value.flightId ?? null,
    callsign: value.callsign ?? null,
    runwayId: value.runwayId ?? null,
    state: value.state ?? null,
    points,
    width: number(value.width) ?? 0,
    altitudeFt: number(value.altitudeFt) ?? 0,
    etaSeconds: number(value.etaSeconds) ?? 0,
  };
}

function compactSurfaceAdvisory(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  const geometry = isRecord(value.geometry) ? value.geometry : {};
  const points = Array.isArray(geometry.points)
    ? geometry.points
        .filter(
          (point): point is unknown[] =>
            Array.isArray(point) && point.length >= 2,
        )
        .slice(0, 8)
        .map((point) => [number(point[0]) ?? 0, number(point[1]) ?? 0])
    : [];
  return {
    schemaVersion: value.schemaVersion ?? null,
    id: text(value.id, 180),
    severity: value.severity ?? null,
    kind: value.kind ?? null,
    status: value.status ?? null,
    flightIds: Array.isArray(value.flightIds)
      ? value.flightIds.slice(0, 12)
      : [],
    causalTrackIds: Array.isArray(value.causalTrackIds)
      ? value.causalTrackIds.slice(0, 12)
      : [],
    runwayId: value.runwayId ?? null,
    etaSeconds: number(value.etaSeconds) ?? 0,
    firstSeenAtSeconds: number(value.firstSeenAtSeconds) ?? 0,
    lastSeenAtSeconds: number(value.lastSeenAtSeconds) ?? 0,
    predictedAtSeconds: number(value.predictedAtSeconds) ?? 0,
    acknowledgedAtSeconds: value.acknowledgedAtSeconds ?? null,
    resolvedAtSeconds: value.resolvedAtSeconds ?? null,
    geometry: {
      kind: geometry.kind ?? "system",
      points,
      width: number(geometry.width),
    },
    detail: text(value.detail, 280),
  };
}

/**
 * Projects the page snapshot into a bounded operations view. The gateway never
 * receives the imported surface graph, rendering diagnostics, input state, or
 * replay buffers. This is both a bandwidth limit and an explicit disclosure
 * boundary for external observers.
 */
export function projectRemoteOperationsSnapshot(value: unknown): JsonRecord {
  if (!isRecord(value)) return { schemaVersion: 1, unavailable: true };
  const airport = isRecord(value.airport) ? value.airport : {};
  const weather = isRecord(value.weather) ? value.weather : {};
  const environment = isRecord(value.environment) ? value.environment : {};
  const presentation = isRecord(value.presentation) ? value.presentation : {};
  const analytics = isRecord(value.analytics) ? value.analytics : {};
  const controllers = isRecord(value.controllers) ? value.controllers : {};
  const digitalClearances = isRecord(value.digitalClearances)
    ? value.digitalClearances
    : {};
  const runwayConfiguration = isRecord(value.runwayConfiguration)
    ? value.runwayConfiguration
    : {};
  const surfaceSafety = isRecord(value.surfaceSafety)
    ? value.surfaceSafety
    : {};
  const surfaceSafetyDisplay = isRecord(surfaceSafety.display)
    ? surfaceSafety.display
    : {};
  const surfaceSafetyLayers = isRecord(surfaceSafetyDisplay.layers)
    ? surfaceSafetyDisplay.layers
    : {};
  const score = isRecord(value.score) ? value.score : {};
  const queues = Array.isArray(value.queues)
    ? value.queues
    : isRecord(value.traffic) && Array.isArray(value.traffic.queues)
      ? value.traffic.queues
      : [];
  return {
    schemaVersion: 1,
    sourceSnapshotSchemaVersion: value.schemaVersion ?? null,
    publishedAt: new Date().toISOString(),
    controlProtocol: isRecord(value.controlProtocol)
      ? {
          protocolVersion: value.controlProtocol.protocolVersion ?? null,
          apiVersion: value.controlProtocol.apiVersion ?? null,
          sessionId: value.controlProtocol.sessionId ?? null,
        }
      : null,
    airport: {
      code: airport.code ?? null,
      name: airport.name ?? null,
      scope: airport.scope ?? null,
      fidelity: airport.fidelity ?? null,
      navigationUse: false,
    },
    clock: value.clock ?? 0,
    paused: value.paused === true,
    gameOver: value.gameOver === true,
    mode: value.mode ?? null,
    station: value.station ?? null,
    scenario: value.scenario ?? null,
    trafficDensity: value.trafficDensity ?? null,
    speed: value.speed ?? 1,
    environment: {
      lightingMode: environment.lightingMode ?? null,
      seasonMode: environment.seasonMode ?? null,
      season: environment.season ?? null,
      localTime: environment.localTime ?? null,
      phase: environment.phase ?? null,
      daylight: environment.daylight ?? null,
      cloudCover: environment.cloudCover ?? null,
      wetPavement: environment.wetPavement ?? null,
      snowCover: environment.snowCover ?? null,
      runwayLightIntensity: environment.runwayLightIntensity ?? null,
    },
    presentation: {
      accessibilityPalette: presentation.accessibilityPalette ?? null,
      cameraDirector: isRecord(presentation.cameraDirector)
        ? {
            enabled: presentation.cameraDirector.enabled === true,
            status: presentation.cameraDirector.status ?? null,
            targetFlightId: presentation.cameraDirector.targetFlightId ?? null,
            reason: presentation.cameraDirector.reason ?? null,
          }
        : null,
    },
    weather: {
      enabled: weather.enabled ?? null,
      windEnabled: weather.windEnabled ?? null,
      condition: weather.condition ?? null,
      precipitation: weather.precipitation ?? null,
      intensity: weather.intensity ?? null,
      cloudCover: weather.cloudCover ?? null,
      windDirectionDegrees: weather.windDirectionDegrees ?? null,
      windSpeed: weather.windSpeed ?? null,
      gustSpeed: weather.gustSpeed ?? null,
      visibilityMiles: weather.visibilityMiles ?? null,
      ceilingFt: weather.ceilingFt ?? null,
      surfaceCondition: weather.surfaceCondition ?? null,
      runwayConditionReports: Array.isArray(weather.runwayConditionReports)
        ? weather.runwayConditionReports.slice(0, 12)
        : [],
      hazardsEnabled: weather.hazardsEnabled === true,
      activeHazard: isRecord(weather.activeHazard)
        ? weather.activeHazard
        : null,
    },
    score: {
      landed: score.landed ?? 0,
      departed: score.departed ?? 0,
    },
    analytics: {
      schemaVersion: analytics.schemaVersion ?? null,
      generatedAtSeconds: analytics.generatedAtSeconds ?? null,
      window: isRecord(analytics.window) ? analytics.window : null,
      summary: isRecord(analytics.summary) ? analytics.summary : null,
      observedFlights: analytics.observedFlights ?? null,
      disclosure: isRecord(analytics.disclosure) ? analytics.disclosure : null,
    },
    runwayConfiguration: {
      id: runwayConfiguration.id ?? null,
      name: runwayConfiguration.name ?? null,
      selectionMode: runwayConfiguration.selectionMode ?? null,
      arrivalRunwayIds: Array.isArray(runwayConfiguration.arrivalRunwayIds)
        ? runwayConfiguration.arrivalRunwayIds
        : [],
      departureRunwayIds: Array.isArray(runwayConfiguration.departureRunwayIds)
        ? runwayConfiguration.departureRunwayIds
        : [],
      transition: runwayConfiguration.transition ?? null,
    },
    runways: Array.isArray(value.runways)
      ? value.runways
          .map((runway) =>
            isRecord(runway)
              ? {
                  id: runway.id,
                  designation: runway.designation,
                  role: runway.role,
                  activeDesignation: runway.activeDesignation,
                  closed: runway.closed === true,
                  occupiedBy: Array.isArray(runway.occupiedBy)
                    ? runway.occupiedBy.slice(0, 12)
                    : [],
                }
              : null,
          )
          .filter(Boolean)
      : [],
    flights: Array.isArray(value.flights)
      ? value.flights.map(compactFlight).filter(Boolean)
      : [],
    queues: queues.map(compactQueue).filter(Boolean).slice(0, 80),
    surfaceDisruptions: Array.isArray(value.surfaceDisruptions)
      ? value.surfaceDisruptions.slice(0, 80)
      : [],
    coordination: Array.isArray(controllers.coordination)
      ? controllers.coordination.slice(0, 80)
      : [],
    controllerWorkloads: controllers.workloads ?? null,
    controllerEvaluation: controllers.evaluation ?? null,
    digitalClearances: {
      schemaVersion: digitalClearances.schemaVersion ?? null,
      generatedAtSeconds: digitalClearances.generatedAtSeconds ?? null,
      counts: isRecord(digitalClearances.counts)
        ? digitalClearances.counts
        : {},
      messages: Array.isArray(digitalClearances.messages)
        ? digitalClearances.messages
            .map(compactDigitalClearance)
            .filter(Boolean)
            .slice(0, 60)
        : [],
    },
    surfaceSafety: {
      schemaVersion: surfaceSafety.schemaVersion ?? null,
      visible: surfaceSafety.visible === true,
      filter: surfaceSafety.filter ?? null,
      display: {
        lookaheadSeconds: number(surfaceSafetyDisplay.lookaheadSeconds) ?? null,
        layers: {
          routes: surfaceSafetyLayers.routes !== false,
          corridors: surfaceSafetyLayers.corridors !== false,
          forecasts: surfaceSafetyLayers.forecasts !== false,
          vehicles: surfaceSafetyLayers.vehicles !== false,
        },
      },
      generatedAtSeconds: number(surfaceSafety.generatedAtSeconds) ?? null,
      protectedRunwayOccupancy: surfaceSafety.protectedRunwayOccupancy ?? 0,
      heldTracks: surfaceSafety.heldTracks ?? 0,
      tracks: Array.isArray(surfaceSafety.tracks)
        ? surfaceSafety.tracks
            .map(compactSurfaceTrack)
            .filter(Boolean)
            .slice(0, 80)
        : [],
      vehicles: Array.isArray(surfaceSafety.vehicles)
        ? surfaceSafety.vehicles
            .map(compactSurfaceVehicle)
            .filter(Boolean)
            .slice(0, 80)
        : [],
      protectionCorridors: Array.isArray(surfaceSafety.protectionCorridors)
        ? surfaceSafety.protectionCorridors
            .map(compactSurfaceProtectionCorridor)
            .filter(Boolean)
            .slice(0, 16)
        : [],
      advisories: Array.isArray(surfaceSafety.advisories)
        ? surfaceSafety.advisories
            .map(compactSurfaceAdvisory)
            .filter(Boolean)
            .slice(0, 30)
        : [],
    },
  };
}

function compactDigitalClearance(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  return {
    id: value.id ?? null,
    commandId: value.commandId ?? null,
    flightId: value.flightId ?? null,
    callsign: value.callsign ?? null,
    kind: value.kind ?? null,
    status: value.status ?? null,
    authority: value.authority ?? null,
    revision: value.revision ?? null,
    createdAtSeconds: value.createdAtSeconds ?? null,
    issuedAtSeconds: value.issuedAtSeconds ?? null,
    responseDueSeconds: value.responseDueSeconds ?? null,
    respondedAtSeconds: value.respondedAtSeconds ?? null,
    expiresAtSeconds: value.expiresAtSeconds ?? null,
    causalEventIds: Array.isArray(value.causalEventIds)
      ? value.causalEventIds.slice(0, 8)
      : [],
    route: Array.isArray(value.route) ? value.route.slice(0, 16) : [],
    parameters: isRecord(value.parameters) ? value.parameters : {},
    response: isRecord(value.response) ? value.response : null,
    warningCount: value.warningCount ?? 0,
  };
}

function safeEndpoint(raw: string): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(raw);
  } catch {
    throw new Error("Gateway endpoint must be a valid WebSocket URL.");
  }
  if (endpoint.protocol !== "ws:" && endpoint.protocol !== "wss:")
    throw new Error("Gateway endpoint must use ws:// or wss://.");
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error(
      "Do not place credentials or query data in the gateway URL.",
    );
  const localhost =
    endpoint.hostname === "localhost" ||
    endpoint.hostname === "127.0.0.1" ||
    endpoint.hostname === "[::1]" ||
    endpoint.hostname === "::1";
  if (endpoint.protocol === "ws:" && !localhost)
    throw new Error(
      "Remote gateways require encrypted wss://; ws:// is limited to localhost.",
    );
  return endpoint;
}

function initialClientId(): string {
  return `host-${
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  }`;
}

export class RemoteControlHost {
  readonly #snapshot: () => unknown;
  readonly #dispatch: (envelope: unknown) => unknown;
  readonly #onStateChange?: (state: RemoteControlHostState) => void;
  readonly #publishIntervalMs: number;
  readonly #reconnectMaximumDelayMs: number;
  #socket: WebSocket | null = null;
  #configuration: Omit<RemoteControlHostConfiguration, "token"> | null = null;
  #credential: string | null = null;
  #resumeToken: string | null = null;
  #stateTimer: number | null = null;
  #reconnectTimer: number | null = null;
  #generation = 0;
  #explicitDisconnect = true;
  #connectPromise: {
    resolve: (state: RemoteControlHostState) => void;
    reject: (error: Error) => void;
  } | null = null;
  #state: RemoteControlHostState = {
    schemaVersion: REMOTE_CONTROL_HOST_SCHEMA_VERSION,
    configured: false,
    status: "disconnected",
    connected: false,
    endpoint: null,
    sessionId: null,
    clientId: initialClientId(),
    gatewayProtocolVersion: null,
    connectionId: null,
    connectedAt: null,
    lastStatePublishedAt: null,
    lastEventPublishedAt: null,
    reconnectAttempt: 0,
    emergencyStop: {
      active: false,
      reason: null,
      byClientId: null,
      changedAt: null,
    },
    lastError: null,
  };

  constructor(options: RemoteHostOptions) {
    this.#snapshot = options.snapshot;
    this.#dispatch = options.dispatch;
    this.#onStateChange = options.onStateChange;
    this.#publishIntervalMs = Math.max(250, options.publishIntervalMs ?? 1_000);
    this.#reconnectMaximumDelayMs = Math.max(
      1_000,
      options.reconnectMaximumDelayMs ?? 10_000,
    );
  }

  state(): RemoteControlHostState {
    return structuredClone(this.#state);
  }

  async connect(
    configuration: RemoteControlHostConfiguration,
  ): Promise<RemoteControlHostState> {
    const endpoint = safeEndpoint(configuration.endpoint);
    const sessionId = configuration.sessionId.trim();
    const clientId = (configuration.clientId || this.#state.clientId).trim();
    if (!SESSION_ID_PATTERN.test(sessionId))
      throw new Error(
        "Session IDs use 1–64 letters, numbers, dots, underscores, or hyphens.",
      );
    if (!CLIENT_ID_PATTERN.test(clientId))
      throw new Error("Client ID contains unsupported characters.");
    if (
      typeof configuration.token !== "string" ||
      configuration.token.length < 24
    )
      throw new Error("A bearer token of at least 24 characters is required.");
    this.disconnect("superseded by a new connection");
    this.#configuration = { endpoint: endpoint.href, sessionId, clientId };
    this.#credential = configuration.token;
    this.#resumeToken = null;
    this.#explicitDisconnect = false;
    this.#generation += 1;
    this.#patchState({
      configured: true,
      status: "connecting",
      connected: false,
      endpoint: endpoint.href,
      sessionId,
      clientId,
      reconnectAttempt: 0,
      lastError: null,
    });
    return new Promise<RemoteControlHostState>((resolve, reject) => {
      this.#connectPromise = { resolve, reject };
      this.#openSocket(this.#generation, false);
    });
  }

  disconnect(reason = "operator disconnect"): RemoteControlHostState {
    this.#explicitDisconnect = true;
    this.#generation += 1;
    if (this.#reconnectTimer !== null)
      window.clearTimeout(this.#reconnectTimer);
    if (this.#stateTimer !== null) window.clearInterval(this.#stateTimer);
    this.#reconnectTimer = null;
    this.#stateTimer = null;
    const socket = this.#socket;
    this.#socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING)
      socket.close(1000, reason);
    this.#connectPromise?.reject(new Error(reason));
    this.#connectPromise = null;
    this.#credential = null;
    this.#resumeToken = null;
    this.#configuration = null;
    this.#patchState({
      configured: false,
      status: "disconnected",
      connected: false,
      endpoint: null,
      sessionId: null,
      gatewayProtocolVersion: null,
      connectionId: null,
      reconnectAttempt: 0,
      emergencyStop: {
        active: false,
        reason: null,
        byClientId: null,
        changedAt: null,
      },
      lastError: null,
    });
    return this.state();
  }

  publishSnapshot(): boolean {
    if (!this.#ready()) return false;
    return this.#send(
      {
        type: "state",
        snapshot: projectRemoteOperationsSnapshot(this.#snapshot()),
      },
      false,
      "state",
    );
  }

  publishEvent(event: unknown): boolean {
    if (!this.#ready() || !isRecord(event)) return false;
    const sent = this.#send({ type: "event", event }, false, "event");
    if (sent)
      this.#patchState({ lastEventPublishedAt: new Date().toISOString() });
    return sent;
  }

  dispose(): void {
    this.disconnect("host disposed");
  }

  #patchState(patch: Partial<RemoteControlHostState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#onStateChange?.(this.state());
  }

  #openSocket(generation: number, reconnecting: boolean): void {
    const configuration = this.#configuration;
    const credential = this.#credential;
    if (!configuration || !credential || generation !== this.#generation)
      return;
    this.#patchState({
      status: reconnecting ? "reconnecting" : "connecting",
      connected: false,
    });
    let socket: WebSocket;
    try {
      socket = new WebSocket(configuration.endpoint);
    } catch (error) {
      this.#handleConnectionFailure(
        error instanceof Error ? error.message : "Could not create WebSocket.",
        generation,
      );
      return;
    }
    this.#socket = socket;
    socket.addEventListener("open", () => {
      if (generation !== this.#generation || socket !== this.#socket) return;
      this.#send({
        type: "hello",
        protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
        sessionId: configuration.sessionId,
        clientId: configuration.clientId,
        role: "host",
        token: credential,
        ...(this.#resumeToken ? { resumeToken: this.#resumeToken } : {}),
      });
    });
    socket.addEventListener("message", (event) => {
      if (generation !== this.#generation || socket !== this.#socket) return;
      this.#handleMessage(event.data);
    });
    socket.addEventListener("close", (event) => {
      if (generation !== this.#generation || socket !== this.#socket) return;
      this.#socket = null;
      if (this.#stateTimer !== null) window.clearInterval(this.#stateTimer);
      this.#stateTimer = null;
      if (this.#explicitDisconnect) return;
      const reason = event.reason || `gateway closed with code ${event.code}`;
      if (!this.#state.connected && this.#connectPromise) {
        this.#connectPromise.reject(new Error(reason));
        this.#connectPromise = null;
      }
      this.#scheduleReconnect(reason, generation);
    });
    socket.addEventListener("error", () => {
      if (!this.#state.connected)
        this.#patchState({ lastError: "Gateway connection failed." });
    });
  }

  #handleMessage(raw: unknown): void {
    let message: JsonRecord;
    try {
      const parsed = JSON.parse(String(raw));
      if (!isRecord(parsed)) return;
      message = parsed;
    } catch {
      this.#patchState({ lastError: "Gateway returned malformed JSON." });
      return;
    }
    if (message.type === "welcome") {
      this.#resumeToken = text(message.resumeToken, 512);
      const session = isRecord(message.session) ? message.session : null;
      this.#patchState({
        status: "connected",
        connected: true,
        gatewayProtocolVersion: text(message.protocolVersion, 32),
        connectionId: text(message.connectionId, 128),
        connectedAt: new Date().toISOString(),
        reconnectAttempt: 0,
        emergencyStop: this.#emergencyStopFromSession(session),
        lastError: null,
      });
      this.#connectPromise?.resolve(this.state());
      this.#connectPromise = null;
      if (this.#stateTimer !== null) window.clearInterval(this.#stateTimer);
      this.#stateTimer = window.setInterval(
        () => this.publishSnapshot(),
        this.#publishIntervalMs,
      );
      this.publishSnapshot();
      return;
    }
    if (message.type === "session-state") {
      this.#patchState({
        emergencyStop: this.#emergencyStopFromSession(
          isRecord(message.session) ? message.session : null,
        ),
      });
      return;
    }
    if (message.type === "command") {
      const gatewayCommandId = text(message.gatewayCommandId, 128);
      if (!gatewayCommandId || !isRecord(message.envelope)) return;
      let result: unknown;
      try {
        result = this.#dispatch(message.envelope);
      } catch (error) {
        result = {
          accepted: false,
          reason:
            error instanceof Error
              ? error.message
              : "Host command dispatch failed.",
        };
      }
      this.#send({
        type: "command-result",
        gatewayCommandId,
        result: this.#compactCommandResult(result),
      });
      return;
    }
    if (message.type === "gateway-error") {
      const reason =
        text(message.reason, 512) ?? "Gateway rejected the host connection.";
      const code = text(message.code, 64);
      const fatal = new Set([
        "authentication-required",
        "authentication-timeout",
        "authentication-failed",
        "protocol-incompatible",
        "identity-invalid",
        "identity-conflict",
        "role-invalid",
        "host-conflict",
      ]).has(code ?? "");
      if (!fatal) {
        this.#patchState({ lastError: reason });
        return;
      }
      this.#explicitDisconnect = true;
      this.#credential = null;
      this.#resumeToken = null;
      this.#configuration = null;
      this.#patchState({
        configured: false,
        status: "error",
        connected: false,
        lastError: reason,
      });
      if (this.#connectPromise) {
        this.#connectPromise.reject(new Error(reason));
        this.#connectPromise = null;
      }
      if (this.#socket?.readyState === WebSocket.OPEN)
        this.#socket.close(1000, "fatal gateway rejection");
    }
  }

  #compactCommandResult(result: unknown): unknown {
    if (!isRecord(result))
      return { accepted: false, reason: "Host returned no result." };
    const compact = { ...result };
    if ("snapshot" in compact)
      compact.snapshot = projectRemoteOperationsSnapshot(compact.snapshot);
    if ("resultingState" in compact)
      compact.resultingState = projectRemoteOperationsSnapshot(
        compact.resultingState,
      );
    return compact;
  }

  #emergencyStopFromSession(
    session: JsonRecord | null,
  ): RemoteControlHostState["emergencyStop"] {
    const emergency =
      session && isRecord(session.emergencyStop) ? session.emergencyStop : {};
    return {
      active: emergency.active === true,
      reason: text(emergency.reason),
      byClientId: text(emergency.byClientId, 128),
      changedAt: text(emergency.changedAt, 64),
    };
  }

  #ready(): boolean {
    return this.#state.connected && this.#socket?.readyState === WebSocket.OPEN;
  }

  #send(
    message: unknown,
    important = true,
    publishedKind: "state" | "event" | null = null,
  ): boolean {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN)
      return false;
    if (!important && this.#socket.bufferedAmount > 1_000_000) return false;
    try {
      this.#socket.send(JSON.stringify(message));
      if (publishedKind === "state")
        this.#patchState({ lastStatePublishedAt: new Date().toISOString() });
      return true;
    } catch {
      return false;
    }
  }

  #handleConnectionFailure(reason: string, generation: number): void {
    if (this.#connectPromise) {
      this.#connectPromise.reject(new Error(reason));
      this.#connectPromise = null;
    }
    this.#scheduleReconnect(reason, generation);
  }

  #scheduleReconnect(reason: string, generation: number): void {
    if (this.#explicitDisconnect || generation !== this.#generation) return;
    const attempt = this.#state.reconnectAttempt + 1;
    const delay = Math.min(
      this.#reconnectMaximumDelayMs,
      500 * 2 ** Math.min(5, attempt - 1),
    );
    this.#patchState({
      status: "reconnecting",
      connected: false,
      connectionId: null,
      reconnectAttempt: attempt,
      lastError: reason,
    });
    this.#reconnectTimer = window.setTimeout(() => {
      this.#reconnectTimer = null;
      this.#openSocket(generation, true);
    }, delay);
  }
}

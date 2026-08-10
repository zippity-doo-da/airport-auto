import type { FocusTargetRef } from "../presentation/focusTargets";
import {
  SURFACE_SAFETY_DIAGRAM_LAYERS,
  SURFACE_SAFETY_LOOKAHEAD_OPTIONS,
  type SurfaceSafetyDiagramLayer,
  type SurfaceSafetyLookaheadSeconds,
} from "../presentation/surfaceSafetyDisplay";
import {
  ACCESSIBILITY_PALETTES,
  type AccessibilityPalette,
} from "../presentation/accessibilityPalette";
import type { AirspaceLayer } from "../render/airspaceOverlay";
import type { SurfaceLayer } from "../render/createWorld";
import type { SeparationRulesetId } from "../simulation/separationRules";
import type { TrafficDensity } from "../simulation/trafficDensity";
import type {
  TrafficFlowForecastHorizonSeconds,
  TrafficFlowObjective,
} from "../simulation/types";
import { TRAFFIC_FLOW_FORECAST_HORIZONS } from "../simulation/trafficFlowManagement";
import type {
  ChallengeId,
  ControlMode,
  ControllerPolicyPresetId,
  ControllerStation,
  EmergencyType,
  EnvironmentLightingMode,
  EnvironmentSeasonMode,
  FlightInstruction,
  GroupFlightInstruction,
  OperationalControllerStation,
  SandboxTrafficClass,
  SandboxTrafficDirection,
  SurfaceDisruptionKind,
  TrafficScenario,
  TrainingLessonId,
  WeatherCondition,
} from "../simulation/types";
import {
  AMBIENT_PROGRAM_IDS,
  type AmbientProgramId,
} from "../simulation/ambientPrograms";
import {
  ENVIRONMENT_LIGHTING_MODES,
  ENVIRONMENT_SEASON_MODES,
} from "../simulation/environmentOperations";
import { WEATHER_CONDITIONS } from "../simulation/weatherOperations";
export { AIRPORT_DOMAIN_EVENT_TYPES } from "./eventTypes";
export type { AirportDomainEventType } from "./eventTypes";

export const CONTROL_PROTOCOL_VERSION = "1.2.0" as const;
export const CONTROL_API_VERSION = "2.41.0" as const;
export const CONTROL_SNAPSHOT_SCHEMA_VERSION = 42 as const;
export const CONTROL_REPLAY_SCHEMA_VERSION = 4 as const;
export const CONTROL_BROADCAST_CHANNEL = "airport-auto" as const;

export interface AirportControlCommandParameters {
  pause: undefined;
  resume: undefined;
  nextView: undefined;
  zoomIn: undefined;
  zoomOut: undefined;
  rotateLeft: undefined;
  rotateRight: undefined;
  resetCamera: undefined;
  restart: undefined;
  setSpeed: { value: number };
  setMode: { value: ControlMode };
  setNightMode: { enabled: boolean };
  setEnvironmentLightingMode: { mode: EnvironmentLightingMode };
  setEnvironmentSeasonMode: { mode: EnvironmentSeasonMode };
  setOperationTimeOffset: { minutes: number };
  applyAmbientProgram: { id: AmbientProgramId };
  setAccessibilityPalette: { palette: AccessibilityPalette };
  setCameraDirectorEnabled: { enabled: boolean };
  setRadarVisible: { enabled: boolean };
  setQueueInspectorVisible: { enabled: boolean };
  setSurfaceSafetyVisible: { enabled: boolean };
  setSurfaceSafetyFilter: {
    filter: "all" | "tower" | "ground" | "ramp" | "supervisor" | "watch";
  };
  setSurfaceSafetyLookahead: { seconds: SurfaceSafetyLookaheadSeconds };
  setSurfaceSafetyDiagramLayer: {
    layer: SurfaceSafetyDiagramLayer;
    enabled: boolean;
  };
  acknowledgeSurfaceAdvisory: { advisoryId: string };
  setRunwayLabelsVisible: { enabled: boolean };
  setSurfaceLayerVisible: { layer: SurfaceLayer; enabled: boolean };
  setAirspaceLayerVisible: { layer: AirspaceLayer; enabled: boolean };
  setMapOrientationVisible: { enabled: boolean };
  setWindOverlayVisible: { enabled: boolean };
  setServiceVehiclesVisible: { enabled: boolean };
  setContrailsVisible: { enabled: boolean };
  setAirportLifeVisible: { enabled: boolean };
  setGamepadEnabled: { enabled: boolean };
  setGamepadSensitivity: { sensitivity: number };
  selectAirport: { code: string };
  clearFlight: { flightId: number; runway: number };
  reassignArrivalGate: { flightId: number };
  clearPushback: { flightId: number };
  clearRunwayEntry: { flightId: number };
  clearTakeoff: { flightId: number };
  cancelTakeoffClearance: { flightId: number };
  clearRunwayCrossing: { flightId: number; runway: number };
  controlFlights: { flightIds: number[]; instruction: FlightInstruction };
  previewGroupInstruction: {
    flightIds: number[];
    instruction: GroupFlightInstruction;
  };
  issueGroupInstruction: {
    flightIds: number[];
    instruction: GroupFlightInstruction;
  };
  assignHeading: { flightId: number; headingDegrees: number };
  assignAltitude: { flightId: number; altitudeFt: number };
  assignAirspeed: { flightId: number; speedKts: number };
  directTo: { flightId: number; fixId: string };
  amendRoute: { flightId: number; fixIds: string[] };
  previewRoute: { flightId: number; fixIds: string[] };
  issueRouteAmendment: { flightId: number; fixIds?: string[] };
  acceptRouteReadback: { flightId: number };
  cancelRouteAmendment: { flightId: number };
  clearApproach: { flightId: number };
  holdFlight: { flightId: number; patternId?: string; efcMinutes?: number };
  releaseHold: { flightId: number };
  handoffFlight: { flightId: number; station: ControllerStation };
  offerHandoff: { flightId: number; station: ControllerStation };
  acceptHandoff: { flightId: number };
  rejectHandoff: { flightId: number };
  cancelHandoff: { flightId: number };
  contactStation: { flightId: number; station: ControllerStation };
  assignTaxiRoute: { flightId: number; viaNodeIds?: string[] };
  holdPosition: { flightId: number };
  resumeTaxi: { flightId: number };
  divertFlight: {
    flightId: number;
    airportCode: string;
    exitFixId?: string;
    reason?: string;
  };
  focusFlight: { flightId: number | null };
  focusTarget: { target: FocusTargetRef | null };
  setScenario: { scenario: TrafficScenario };
  setTrafficDensity: { density: TrafficDensity };
  setTrafficFlowObjective: { objective: TrafficFlowObjective };
  setTrafficFlowForecastHorizon: {
    seconds: TrafficFlowForecastHorizonSeconds;
  };
  resequenceTrafficFlow: {
    direction: "arrival" | "departure";
    entryId: string;
    move: "earlier" | "later";
  };
  ignoreTrafficFlowAdvisory: { recommendationId: string };
  recoverTrafficFlowAdvisory: { recommendationId: string };
  setSeparationRuleset: { ruleset: SeparationRulesetId };
  setStation: { station: ControllerStation };
  setStationAutomation: {
    station: OperationalControllerStation;
    enabled: boolean;
  };
  setControllerPolicyPreset: { preset: ControllerPolicyPresetId };
  triggerEmergency: { flightId: number; type: EmergencyType };
  setWeather: {
    condition: WeatherCondition;
    directionDegrees: number;
    windSpeed: number;
  };
  setWeatherEnabled: { enabled: boolean };
  setWeatherHazardsEnabled: { enabled: boolean };
  setWindEnabled: { enabled: boolean };
  setRunwayConfiguration: { configurationId: string | null };
  setSurfaceDisruption: {
    kind: Exclude<SurfaceDisruptionKind, "disabled-aircraft">;
    targetId: string;
    enabled: boolean;
    durationSeconds?: number;
  };
  triggerSurfaceIncident: {
    kind: "runway-inspection" | "bird-activity" | "foreign-object-debris";
    targetId: string;
  };
  clearSurfaceDisruption: { disruptionId: string };
  recoverDisabledAircraft: { flightId: number };
  startTrainingLesson: { lessonId: TrainingLessonId };
  stopTrainingLesson: undefined;
  continueTraining: undefined;
  trainingHint: undefined;
  retryTrainingStep: undefined;
  skipTrainingStep: undefined;
  startChallenge: { challengeId: ChallengeId };
  beginChallenge: undefined;
  endChallenge: undefined;
  continueAfterChallenge: undefined;
  startSandbox: { backgroundTraffic?: boolean };
  stopSandbox: undefined;
  cancelSandboxInjections: undefined;
  clearSandboxTraffic: undefined;
  setSandboxBackgroundTraffic: { enabled: boolean };
  injectSandboxTraffic: {
    direction: SandboxTrafficDirection;
    trafficClass?: SandboxTrafficClass;
    runwayId?: number | null;
    count?: number;
  };
}

export type AirportControlAction = keyof AirportControlCommandParameters;

export type AirportControlCommand = {
  [
    Action in AirportControlAction
  ]: AirportControlCommandParameters[Action] extends undefined
    ? { action: Action }
    : { action: Action } & AirportControlCommandParameters[Action];
}[AirportControlAction];

export type AirportControlCommandFor<Action extends AirportControlAction> =
  Extract<AirportControlCommand, { action: Action }>;

export type ControlCommandSource =
  "page" | "broadcast" | "agent" | "replay" | "test";

export interface ControlProtocolExpectations {
  apiVersion?: string;
  snapshotSchemaVersion?: number;
}

export interface ControlAuthorityAssertion {
  station: ControllerStation;
  actorId?: string;
}

export interface AirportControlRequestEnvelope {
  protocolVersion: string;
  requestId: string;
  clientId?: string;
  source?: ControlCommandSource;
  authority?: ControlAuthorityAssertion;
  expects?: ControlProtocolExpectations;
  command: AirportControlCommand;
}

export type ProtocolJsonType =
  "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";

export interface ProtocolJsonSchema {
  $schema?: string;
  $id?: string;
  $ref?: string;
  title?: string;
  description?: string;
  type?: ProtocolJsonType | ProtocolJsonType[];
  const?: unknown;
  enum?: readonly unknown[];
  oneOf?: ProtocolJsonSchema[];
  anyOf?: ProtocolJsonSchema[];
  properties?: Record<string, ProtocolJsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: ProtocolJsonSchema;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  pattern?: string;
}

export type CommandCategory =
  | "session"
  | "presentation"
  | "approach"
  | "tower"
  | "surface"
  | "coordination"
  | "operations"
  | "training"
  | "challenge"
  | "sandbox";

export type CommandAuthorityRule =
  | "public"
  | "session"
  | "flight-owner"
  | "approach-flight-owner"
  | "tower-flight-owner"
  | "ground-flight-owner"
  | "ground-operation"
  | "ramp-flight-owner"
  | "surface-flight-owner"
  | "handoff-sender"
  | "handoff-receiver"
  | "supervisor"
  | "dynamic-emergency"
  | "training-state"
  | "challenge-state"
  | "sandbox-state";

export interface CommandAuthorityDefinition {
  rule: CommandAuthorityRule;
  stations: ControllerStation[];
  flightOwnership: boolean;
  safetyArbiter: boolean;
  description: string;
}

export interface CommandCompatibilityDefinition {
  formalizedInApi: typeof CONTROL_API_VERSION;
  protocolMajor: 1;
  modes: ControlMode[];
  transports: Array<"page" | "broadcast" | "websocket">;
  availability: string;
  legacyAliasFor?: AirportControlAction;
  deprecated?: boolean;
}

export interface CommandProtocolDefinition {
  action: AirportControlAction;
  category: CommandCategory;
  summary: string;
  mutates: boolean;
  authority: CommandAuthorityDefinition;
  compatibility: CommandCompatibilityDefinition;
  parameters: Record<string, ProtocolJsonSchema>;
  optionalParameters: string[];
  result: {
    schemaRef: string;
    stateEffect: "none" | "presentation" | "simulation";
    data: "none" | "group-instruction-preview" | "group-instruction-issue";
    commandEventType: string;
    rejectionContract: string;
  };
  schema: ProtocolJsonSchema;
  example: AirportControlCommand;
}

interface CommandSpecInput {
  category: CommandCategory;
  summary: string;
  mutates: boolean;
  authority: CommandAuthorityDefinition;
  parameters?: Record<string, ProtocolJsonSchema>;
  optionalParameters?: string[];
  example?: Record<string, unknown>;
  availability?: string;
  legacyAliasFor?: AirportControlAction;
  deprecated?: boolean;
  resultData?: Exclude<CommandProtocolDefinition["result"]["data"], "none">;
}

const ALL_MODES: ControlMode[] = ["auto", "assisted", "manual", "watch"];
const CONTROLLER_STATIONS: ControllerStation[] = [
  "approach",
  "tower",
  "ground",
  "ramp",
  "supervisor",
];
const OPERATIONAL_STATIONS: OperationalControllerStation[] = [
  "approach",
  "tower",
  "ground",
  "ramp",
];

const AUTHORITY = {
  public: {
    rule: "public",
    stations: [],
    flightOwnership: false,
    safetyArbiter: false,
    description: "Presentation-only command; no ATC authority is claimed.",
  },
  session: {
    rule: "session",
    stations: CONTROLLER_STATIONS,
    flightOwnership: false,
    safetyArbiter: true,
    description:
      "Available to the active local session, subject to challenge and scenario locks.",
  },
  owner: {
    rule: "flight-owner",
    stations: CONTROLLER_STATIONS,
    flightOwnership: true,
    safetyArbiter: true,
    description:
      "The selected station must own every affected flight; phase-specific safety checks still apply.",
  },
  approach: {
    rule: "approach-flight-owner",
    stations: ["approach", "supervisor"],
    flightOwnership: true,
    safetyArbiter: true,
    description:
      "Approach or Supervisor authority plus ownership of the airborne flight is required.",
  },
  tower: {
    rule: "tower-flight-owner",
    stations: ["tower", "supervisor"],
    flightOwnership: true,
    safetyArbiter: true,
    description:
      "Tower or Supervisor authority plus ownership of the flight is required.",
  },
  ground: {
    rule: "ground-flight-owner",
    stations: ["ground", "supervisor"],
    flightOwnership: true,
    safetyArbiter: true,
    description:
      "Ground or Supervisor authority plus ownership of the surface flight is required.",
  },
  groundOperation: {
    rule: "ground-operation",
    stations: ["ground", "supervisor"],
    flightOwnership: false,
    safetyArbiter: true,
    description:
      "Ground or Supervisor authority is required; the referenced surface operation must be active and recoverable.",
  },
  ramp: {
    rule: "ramp-flight-owner",
    stations: ["ramp", "supervisor"],
    flightOwnership: true,
    safetyArbiter: true,
    description:
      "Ramp or Supervisor authority plus ownership of the gate/ramp flight is required.",
  },
  surface: {
    rule: "surface-flight-owner",
    stations: ["ground", "ramp", "supervisor"],
    flightOwnership: true,
    safetyArbiter: true,
    description:
      "Ground, Ramp, or Supervisor authority is selected from the flight’s current surface segment; ownership is required.",
  },
  handoffSender: {
    rule: "handoff-sender",
    stations: CONTROLLER_STATIONS,
    flightOwnership: true,
    safetyArbiter: true,
    description:
      "The sending/owning station or Supervisor must issue the coordination command.",
  },
  handoffReceiver: {
    rule: "handoff-receiver",
    stations: CONTROLLER_STATIONS,
    flightOwnership: false,
    safetyArbiter: true,
    description:
      "The offered receiving station or Supervisor must answer the handoff.",
  },
  supervisor: {
    rule: "supervisor",
    stations: ["supervisor"],
    flightOwnership: false,
    safetyArbiter: true,
    description:
      "Supervisor authority is required; runway, traffic, and surface safety locks remain active.",
  },
  emergency: {
    rule: "dynamic-emergency",
    stations: CONTROLLER_STATIONS,
    flightOwnership: true,
    safetyArbiter: true,
    description:
      "Authority is resolved from emergency type and flight phase, then ownership and safety are enforced.",
  },
  training: {
    rule: "training-state",
    stations: CONTROLLER_STATIONS,
    flightOwnership: false,
    safetyArbiter: true,
    description:
      "The training state machine validates lesson, checkpoint, and recovery availability.",
  },
  challenge: {
    rule: "challenge-state",
    stations: CONTROLLER_STATIONS,
    flightOwnership: false,
    safetyArbiter: true,
    description:
      "The challenge lifecycle validates briefing, active-shift, debrief, and locked-condition transitions.",
  },
  sandbox: {
    rule: "sandbox-state",
    stations: CONTROLLER_STATIONS,
    flightOwnership: false,
    safetyArbiter: true,
    description:
      "The sandbox state machine and normal release scheduler validate each requested injection or transition.",
  },
} satisfies Record<string, CommandAuthorityDefinition>;

const booleanSchema = (description: string): ProtocolJsonSchema => ({
  type: "boolean",
  description,
});
const stringSchema = (
  description: string,
  values?: readonly string[],
): ProtocolJsonSchema => ({
  type: "string",
  description,
  ...(values ? { enum: [...values] } : { minLength: 1 }),
});
const numberSchema = (
  description: string,
  minimum?: number,
  maximum?: number,
): ProtocolJsonSchema => ({
  type: "number",
  description,
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum }),
});
const integerSchema = (
  description: string,
  minimum?: number,
  maximum?: number,
): ProtocolJsonSchema => ({
  type: "integer",
  description,
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum }),
});
const nullableIntegerSchema = (
  description: string,
  minimum = 0,
): ProtocolJsonSchema => ({
  oneOf: [{ type: "null" }, integerSchema(description, minimum)],
  description,
});
const nullableStringSchema = (description: string): ProtocolJsonSchema => ({
  oneOf: [{ type: "null" }, stringSchema(description)],
  description,
});
const stringArraySchema = (
  description: string,
  minItems = 0,
): ProtocolJsonSchema => ({
  type: "array",
  description,
  items: { type: "string", minLength: 1 },
  minItems,
  uniqueItems: true,
});
const flightIdSchema = integerSchema(
  "Active flight identifier from snapshot().flights.",
  1,
);
const flightIdsSchema: ProtocolJsonSchema = {
  type: "array",
  description: "Unique active flight identifiers from snapshot().flights.",
  items: flightIdSchema,
  minItems: 1,
  uniqueItems: true,
};
const runwaySchema = integerSchema(
  "Runway numeric ID from snapshot().runways.",
  0,
);
const controllerStationSchema = stringSchema(
  "Controller station.",
  CONTROLLER_STATIONS,
);
const operationalStationSchema = stringSchema(
  "Operational controller station.",
  OPERATIONAL_STATIONS,
);
const focusTargetSchema: ProtocolJsonSchema = {
  description: "A catalog target reference, or null to release observer focus.",
  oneOf: [
    { type: "null" },
    {
      type: "object",
      properties: {
        kind: stringSchema("Focus category.", [
          "flight",
          "runway",
          "taxiway",
          "gate",
          "queue",
          "conflict",
        ]),
        id: stringSchema(
          "Stable target ID from snapshot().focus.catalog.targets.",
        ),
      },
      required: ["kind", "id"],
      additionalProperties: false,
    },
  ],
};

const command = (
  category: CommandCategory,
  summary: string,
  authority: CommandAuthorityDefinition,
  parameters: Record<string, ProtocolJsonSchema> = {},
  example: Record<string, unknown> = {},
  options: Omit<
    CommandSpecInput,
    "category" | "summary" | "authority" | "parameters" | "example" | "mutates"
  > & { mutates?: boolean } = {},
): CommandSpecInput => ({
  category,
  summary,
  authority,
  parameters,
  example,
  mutates: options.mutates ?? true,
  optionalParameters: options.optionalParameters,
  availability: options.availability,
  legacyAliasFor: options.legacyAliasFor,
  deprecated: options.deprecated,
  resultData: options.resultData,
});

const visibility = (summary: string, parameter = "enabled"): CommandSpecInput =>
  command(
    "presentation",
    summary,
    AUTHORITY.public,
    {
      [parameter]: booleanSchema(
        "Whether the presentation feature is enabled.",
      ),
    },
    { [parameter]: true },
  );

const COMMAND_SPECS = {
  pause: command(
    "session",
    "Pause the authoritative simulation clock.",
    AUTHORITY.session,
  ),
  resume: command(
    "session",
    "Resume the authoritative simulation clock.",
    AUTHORITY.session,
  ),
  nextView: command(
    "presentation",
    "Cycle to the next camera preset and release focus.",
    AUTHORITY.public,
  ),
  zoomIn: command(
    "presentation",
    "Move the observer camera closer and release focus.",
    AUTHORITY.public,
  ),
  zoomOut: command(
    "presentation",
    "Move the observer camera farther away and release focus.",
    AUTHORITY.public,
  ),
  rotateLeft: command(
    "presentation",
    "Rotate the observer camera counter-clockwise and release focus.",
    AUTHORITY.public,
  ),
  rotateRight: command(
    "presentation",
    "Rotate the observer camera clockwise and release focus.",
    AUTHORITY.public,
  ),
  resetCamera: command(
    "presentation",
    "Restore the current camera preset and release focus.",
    AUTHORITY.public,
  ),
  restart: command(
    "session",
    "Start a new session at the current airport.",
    AUTHORITY.session,
  ),
  setSpeed: command(
    "session",
    "Set simulation pace; surface vehicles retain safety-limited physical speeds.",
    AUTHORITY.session,
    {
      value: numberSchema(
        "Requested simulation pace multiplier; normalized to the supported 0.5–3× range.",
      ),
    },
    { value: 1 },
  ),
  setMode: command(
    "session",
    "Select Auto, Assisted, Manual, or Watch mode.",
    AUTHORITY.session,
    {
      value: stringSchema("Control mode.", ALL_MODES),
    },
    { value: "assisted" },
  ),
  setNightMode: visibility("Enable or disable night presentation."),
  setEnvironmentLightingMode: command(
    "presentation",
    "Select automatic local-time lighting or force day/night presentation.",
    AUTHORITY.public,
    {
      mode: stringSchema(
        "Environment lighting mode.",
        ENVIRONMENT_LIGHTING_MODES,
      ),
    },
    { mode: "automatic" },
  ),
  setEnvironmentSeasonMode: command(
    "presentation",
    "Select deterministic automatic season or a forced seasonal presentation.",
    AUTHORITY.public,
    {
      mode: stringSchema("Environment season mode.", ENVIRONMENT_SEASON_MODES),
    },
    { mode: "winter" },
  ),
  setOperationTimeOffset: command(
    "presentation",
    "Set the serialized local operation clock offset used by Watch programs.",
    AUTHORITY.public,
    {
      minutes: numberSchema(
        "Offset from the airport profile start, in local minutes.",
      ),
    },
    { minutes: 360 },
  ),
  applyAmbientProgram: command(
    "presentation",
    "Apply a deterministic Watch/ambient program to the local clock, weather, and flow posture.",
    AUTHORITY.public,
    { id: stringSchema("Named ambient program.", AMBIENT_PROGRAM_IDS) },
    { id: "quiet-overnight" },
  ),
  setAccessibilityPalette: command(
    "presentation",
    "Select the UI and map semantic-color palette.",
    AUTHORITY.public,
    {
      palette: stringSchema("Accessibility palette.", ACCESSIBILITY_PALETTES),
    },
    { palette: "high-contrast" },
  ),
  setCameraDirectorEnabled: visibility(
    "Enable or disable the optional observer camera director.",
  ),
  setRadarVisible: visibility("Show or hide the inset radar."),
  setQueueInspectorVisible: visibility(
    "Show or hide the operations queue inspector.",
  ),
  setSurfaceSafetyVisible: visibility(
    "Show or hide the authoritative surface-safety picture.",
  ),
  setSurfaceSafetyFilter: command(
    "presentation",
    "Select the surface-safety station view.",
    AUTHORITY.public,
    {
      filter: stringSchema("Surface-safety station view.", [
        "all",
        "tower",
        "ground",
        "ramp",
        "supervisor",
        "watch",
      ]),
    },
    { filter: "tower" },
  ),
  setSurfaceSafetyLookahead: command(
    "presentation",
    "Set the predictive horizon shown by the surface-safety picture.",
    AUTHORITY.public,
    {
      seconds: {
        type: "integer",
        description: "Surface-safety look-ahead horizon in seconds.",
        enum: SURFACE_SAFETY_LOOKAHEAD_OPTIONS,
      },
    },
    { seconds: 30 },
  ),
  setSurfaceSafetyDiagramLayer: command(
    "presentation",
    "Show or hide one optional surface-safety diagram layer without changing safety state.",
    AUTHORITY.public,
    {
      layer: stringSchema(
        "Surface-safety diagram layer.",
        SURFACE_SAFETY_DIAGRAM_LAYERS,
      ),
      enabled: booleanSchema("Whether the diagram layer is shown."),
    },
    { layer: "corridors", enabled: true },
  ),
  acknowledgeSurfaceAdvisory: command(
    "presentation",
    "Record acknowledgement of a noncritical active surface advisory without changing protection.",
    AUTHORITY.public,
    {
      advisoryId: stringSchema("Active noncritical surface advisory ID."),
    },
    { advisoryId: "runway:1-2:0" },
  ),
  setRunwayLabelsVisible: visibility("Show or hide runway designations."),
  setSurfaceLayerVisible: command(
    "presentation",
    "Show or hide a surface-map overlay layer.",
    AUTHORITY.public,
    {
      layer: stringSchema("Surface layer.", [
        "taxiway-labels",
        "operational-zones",
        "hotspots",
        "airport-boundary",
        "protection-zones",
        "movement-projections",
      ]),
      enabled: booleanSchema("Whether the layer is visible."),
    },
    { layer: "taxiway-labels", enabled: true },
  ),
  setAirspaceLayerVisible: command(
    "presentation",
    "Show or hide an airspace overlay layer.",
    AUTHORITY.public,
    {
      layer: stringSchema("Airspace layer.", [
        "airspace-sectors",
        "navigation-fixes",
        "procedures",
        "flight-routes",
        "separation",
      ]),
      enabled: booleanSchema("Whether the layer is visible."),
    },
    { layer: "procedures", enabled: true },
  ),
  setMapOrientationVisible: visibility(
    "Show or hide compass orientation on the map.",
  ),
  setWindOverlayVisible: visibility(
    "Show or hide wind direction and speed on the map.",
  ),
  setServiceVehiclesVisible: visibility("Show or hide service vehicles."),
  setContrailsVisible: visibility(
    "Deprecated API 2.x compatibility command. Enabling removed contrails is rejected; disabling is an accepted no-op.",
  ),
  setAirportLifeVisible: visibility(
    "Show or hide optional airport-life details.",
  ),
  setGamepadEnabled: visibility("Enable or disable gamepad input."),
  setGamepadSensitivity: command(
    "presentation",
    "Set gamepad camera sensitivity.",
    AUTHORITY.public,
    {
      sensitivity: numberSchema(
        "Gamepad sensitivity multiplier; the input arbiter accepts 0.5–2.0.",
      ),
    },
    { sensitivity: 1.2 },
  ),
  selectAirport: command(
    "session",
    "Start a new session at a known hub or procedural local airport.",
    AUTHORITY.session,
    {
      code: {
        type: "string",
        minLength: 3,
        maxLength: 5,
        pattern: "^[A-Za-z0-9]+$",
        description: "Airport catalog code such as ORD, ATL, or LOCAL.",
      },
    },
    { code: "ORD" },
  ),
  clearFlight: command(
    "tower",
    "Clear an established arrival to land on its assigned runway.",
    AUTHORITY.tower,
    {
      flightId: flightIdSchema,
      runway: runwaySchema,
    },
    { flightId: 1, runway: 0 },
  ),
  reassignArrivalGate: command(
    "operations",
    "Reassign an arriving aircraft to another compatible, unoccupied gate before its terminal taxi route is committed.",
    AUTHORITY.supervisor,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  clearPushback: command(
    "surface",
    "Clear a ready departure to push from its stand.",
    AUTHORITY.ramp,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  clearRunwayEntry: command(
    "tower",
    "Clear a departure to enter and line up on its assigned runway.",
    AUTHORITY.tower,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  clearTakeoff: command(
    "tower",
    "Clear a lined-up departure for takeoff.",
    AUTHORITY.tower,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  cancelTakeoffClearance: command(
    "tower",
    "Cancel a takeoff clearance before the aircraft begins its takeoff roll.",
    AUTHORITY.tower,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  clearRunwayCrossing: command(
    "surface",
    "Issue one explicit runway-crossing clearance on the aircraft’s routed crossing.",
    AUTHORITY.ground,
    {
      flightId: flightIdSchema,
      runway: runwaySchema,
    },
    { flightId: 1, runway: 4 },
  ),
  controlFlights: command(
    "operations",
    "Issue the legacy flight pace/hold command; multiple flights are handled atomically.",
    AUTHORITY.owner,
    {
      flightIds: flightIdsSchema,
      instruction: stringSchema("Legacy control instruction.", [
        "slow",
        "normal",
        "expedite",
        "hold",
        "resume",
        "zigzag",
      ]),
    },
    { flightIds: [1], instruction: "slow" },
    {
      legacyAliasFor: "issueGroupInstruction",
      deprecated: true,
      availability:
        "Single-flight expedite and zigzag remain supported; multi-flight calls use the atomic group arbiter.",
    },
  ),
  previewGroupInstruction: command(
    "operations",
    "Evaluate an atomic group instruction without mutating flights.",
    AUTHORITY.owner,
    {
      flightIds: flightIdsSchema,
      instruction: stringSchema("Atomic group instruction.", [
        "slow",
        "normal",
        "hold",
        "resume",
      ]),
    },
    { flightIds: [1, 2], instruction: "slow" },
    { mutates: false, resultData: "group-instruction-preview" },
  ),
  issueGroupInstruction: command(
    "operations",
    "Issue an atomic group instruction: all flights accept or none change.",
    AUTHORITY.owner,
    {
      flightIds: flightIdsSchema,
      instruction: stringSchema("Atomic group instruction.", [
        "slow",
        "normal",
        "hold",
        "resume",
      ]),
    },
    { flightIds: [1, 2], instruction: "slow" },
    { resultData: "group-instruction-issue" },
  ),
  assignHeading: command(
    "approach",
    "Assign an aviation heading to an airborne flight.",
    AUTHORITY.approach,
    {
      flightId: flightIdSchema,
      headingDegrees: numberSchema(
        "Aviation heading in degrees; normalized to 000–359.",
      ),
    },
    { flightId: 1, headingDegrees: 270 },
  ),
  assignAltitude: command(
    "approach",
    "Assign a terminal altitude to an airborne flight.",
    AUTHORITY.approach,
    {
      flightId: flightIdSchema,
      altitudeFt: numberSchema(
        "Altitude in feet; operational limits depend on scope and phase.",
      ),
    },
    { flightId: 1, altitudeFt: 3000 },
  ),
  assignAirspeed: command(
    "approach",
    "Assign an indicated airspeed to an airborne flight.",
    AUTHORITY.approach,
    {
      flightId: flightIdSchema,
      speedKts: numberSchema(
        "Airspeed in knots; limits depend on aircraft and phase.",
      ),
    },
    { flightId: 1, speedKts: 170 },
  ),
  directTo: command(
    "approach",
    "Clear an arrival direct to a terminal fix.",
    AUTHORITY.approach,
    {
      flightId: flightIdSchema,
      fixId: stringSchema(
        "Fix ID from snapshot().airport.airspaceProgram.fixes.",
      ),
    },
    { flightId: 1, fixId: "ORD-W-ENTRY" },
  ),
  amendRoute: command(
    "approach",
    "Immediately amend an arrival route using terminal fix IDs.",
    AUTHORITY.approach,
    {
      flightId: flightIdSchema,
      fixIds: stringArraySchema("Ordered terminal fix IDs.", 1),
    },
    { flightId: 1, fixIds: ["ORD-W-ENTRY", "ORD-R0-A-FAF"] },
  ),
  previewRoute: command(
    "approach",
    "Stage and safety-check a route amendment for pilot readback.",
    AUTHORITY.approach,
    {
      flightId: flightIdSchema,
      fixIds: stringArraySchema("Ordered terminal fix IDs.", 1),
    },
    { flightId: 1, fixIds: ["ORD-W-ENTRY", "ORD-R0-A-FAF"] },
  ),
  issueRouteAmendment: command(
    "approach",
    "Issue a staged or inline route amendment for deterministic readback.",
    AUTHORITY.approach,
    {
      flightId: flightIdSchema,
      fixIds: stringArraySchema("Optional ordered terminal fix IDs.", 1),
    },
    { flightId: 1 },
    { optionalParameters: ["fixIds"] },
  ),
  acceptRouteReadback: command(
    "approach",
    "Accept the pending pilot route readback.",
    AUTHORITY.approach,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  cancelRouteAmendment: command(
    "approach",
    "Cancel the active staged route clearance.",
    AUTHORITY.approach,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  clearApproach: command(
    "approach",
    "Clear an established arrival for its assigned approach procedure.",
    AUTHORITY.approach,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  holdFlight: command(
    "approach",
    "Place an arrival in a published schematic hold.",
    AUTHORITY.approach,
    {
      flightId: flightIdSchema,
      patternId: stringSchema(
        "Optional hold ID from the airport airspace program.",
      ),
      efcMinutes: numberSchema(
        "Expect-further-clearance interval in minutes; normalized to 1–30.",
      ),
    },
    { flightId: 1, efcMinutes: 4 },
    { optionalParameters: ["patternId", "efcMinutes"] },
  ),
  releaseHold: command(
    "approach",
    "Release an arrival from its terminal hold.",
    AUTHORITY.approach,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  handoffFlight: command(
    "coordination",
    "Legacy alias that offers a flight handoff.",
    AUTHORITY.handoffSender,
    {
      flightId: flightIdSchema,
      station: controllerStationSchema,
    },
    { flightId: 1, station: "tower" },
    { legacyAliasFor: "offerHandoff", deprecated: true },
  ),
  offerHandoff: command(
    "coordination",
    "Offer a flight to another controller station.",
    AUTHORITY.handoffSender,
    {
      flightId: flightIdSchema,
      station: controllerStationSchema,
    },
    { flightId: 1, station: "tower" },
  ),
  acceptHandoff: command(
    "coordination",
    "Accept a handoff as the receiving station.",
    AUTHORITY.handoffReceiver,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  rejectHandoff: command(
    "coordination",
    "Reject a handoff as the receiving station.",
    AUTHORITY.handoffReceiver,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  cancelHandoff: command(
    "coordination",
    "Cancel a pending handoff as the sending station.",
    AUTHORITY.handoffSender,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  contactStation: command(
    "coordination",
    "Complete an accepted handoff by instructing the flight to contact the receiving station.",
    AUTHORITY.handoffSender,
    {
      flightId: flightIdSchema,
      station: controllerStationSchema,
    },
    { flightId: 1, station: "tower" },
  ),
  assignTaxiRoute: command(
    "surface",
    "Assign a pavement-only taxi route, optionally through named surface nodes.",
    AUTHORITY.surface,
    {
      flightId: flightIdSchema,
      viaNodeIds: stringArraySchema("Optional ordered surface-graph node IDs."),
    },
    { flightId: 1, viaNodeIds: [] },
    { optionalParameters: ["viaNodeIds"] },
  ),
  holdPosition: command(
    "surface",
    "Hold a surface aircraft at its authoritative pavement position.",
    AUTHORITY.surface,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  resumeTaxi: command(
    "surface",
    "Release a controller-issued surface hold when the route is safe.",
    AUTHORITY.surface,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  divertFlight: command(
    "approach",
    "Divert an arrival to an alternate through a safe terminal exit fix.",
    AUTHORITY.approach,
    {
      flightId: flightIdSchema,
      airportCode: stringSchema("Alternate airport code."),
      exitFixId: stringSchema("Optional terminal exit fix ID."),
      reason: stringSchema("Optional controller reason."),
    },
    { flightId: 1, airportCode: "KIND", reason: "weather alternate" },
    { optionalParameters: ["exitFixId", "reason"] },
  ),
  focusFlight: command(
    "presentation",
    "Follow one active flight, or release focus with null.",
    AUTHORITY.public,
    {
      flightId: nullableIntegerSchema(
        "Active flight identifier, or null to release focus.",
        1,
      ),
    },
    { flightId: 1 },
  ),
  focusTarget: command(
    "presentation",
    "Follow a flight, runway, taxiway, gate, queue, or conflict target.",
    AUTHORITY.public,
    {
      target: focusTargetSchema,
    },
    { target: { kind: "runway", id: "0" } },
  ),
  setScenario: command(
    "session",
    "Select a traffic/weather scenario.",
    AUTHORITY.session,
    {
      scenario: stringSchema("Traffic scenario.", [
        "normal",
        "rush",
        "storm",
        "closure",
        "training",
        "emergency",
      ]),
    },
    { scenario: "rush" },
  ),
  setTrafficDensity: command(
    "session",
    "Select the continuous traffic demand profile.",
    AUTHORITY.session,
    {
      density: stringSchema("Traffic density.", [
        "quiet",
        "realistic",
        "busy",
        "rush",
        "extreme",
      ]),
    },
    { density: "busy" },
  ),
  setTrafficFlowObjective: command(
    "operations",
    "Select the strategic airport-wide arrival and departure flow objective.",
    AUTHORITY.supervisor,
    {
      objective: stringSchema("Traffic-flow objective.", [
        "balanced",
        "minimum-holding",
        "minimum-taxi-delay",
        "weather-recovery",
        "watch-calm",
      ]),
    },
    { objective: "minimum-holding" },
  ),
  setTrafficFlowForecastHorizon: command(
    "operations",
    "Set the rolling strategic capacity horizon without changing any meter slot or aircraft movement.",
    AUTHORITY.supervisor,
    {
      seconds: {
        type: "integer",
        description: "Traffic-flow forecast horizon in seconds.",
        enum: TRAFFIC_FLOW_FORECAST_HORIZONS,
      },
    },
    { seconds: 600 },
  ),
  resequenceTrafficFlow: command(
    "operations",
    "Move one active arrival or departure meter entry by one adjacent position. The command revises schedule slots only and grants no movement clearance.",
    AUTHORITY.session,
    {
      direction: stringSchema("Traffic-flow direction.", [
        "arrival",
        "departure",
      ]),
      entryId: stringSchema("Active traffic-flow entry ID."),
      move: stringSchema("Adjacent sequence change.", ["earlier", "later"]),
    },
    { direction: "departure", entryId: "DEP-2", move: "earlier" },
  ),
  ignoreTrafficFlowAdvisory: command(
    "operations",
    "Explicitly ignore one active Manual flow advisory while retaining visible delay, fuel, and queue consequences.",
    AUTHORITY.session,
    {
      recommendationId: stringSchema("Active traffic-flow recommendation ID."),
    },
    { recommendationId: "arrival:ARR-1:review" },
  ),
  recoverTrafficFlowAdvisory: command(
    "operations",
    "Recover an ignored Manual flow advisory by selecting its bounded Supervisor flow objective; aircraft still require ordinary clearances.",
    AUTHORITY.supervisor,
    {
      recommendationId: stringSchema(
        "Previously ignored traffic-flow recommendation ID.",
      ),
    },
    { recommendationId: "arrival:ARR-1:review" },
  ),
  setSeparationRuleset: command(
    "session",
    "Select forgiving or realistic separation minima.",
    AUTHORITY.session,
    {
      ruleset: stringSchema("Separation ruleset.", ["forgiving", "realistic"]),
    },
    { ruleset: "realistic" },
  ),
  setStation: command(
    "session",
    "Select the local controller workstation.",
    AUTHORITY.session,
    {
      station: controllerStationSchema,
    },
    { station: "ground" },
  ),
  setStationAutomation: command(
    "operations",
    "Enable or disable one station’s deterministic automation.",
    AUTHORITY.supervisor,
    {
      station: operationalStationSchema,
      enabled: booleanSchema(
        "Whether deterministic automation owns the station.",
      ),
    },
    { station: "tower", enabled: true },
  ),
  setControllerPolicyPreset: command(
    "operations",
    "Select the airport-wide deterministic controller workload and pacing policy.",
    AUTHORITY.supervisor,
    {
      preset: stringSchema("Controller policy preset.", [
        "balanced",
        "conservative",
        "efficient",
        "calm",
        "teaching",
        "realistic",
      ]),
    },
    { preset: "calm" },
  ),
  triggerEmergency: command(
    "operations",
    "Trigger a supported emergency or operational go-around.",
    AUTHORITY.emergency,
    {
      flightId: flightIdSchema,
      type: stringSchema("Emergency action.", [
        "medical",
        "disabled",
        "birdstrike",
        "go-around",
      ]),
    },
    { flightId: 1, type: "go-around" },
  ),
  setWeather: command(
    "operations",
    "Set modeled weather and wind conditions.",
    AUTHORITY.session,
    {
      condition: stringSchema("Weather condition.", [...WEATHER_CONDITIONS]),
      directionDegrees: numberSchema(
        "Meteorological wind-from direction in degrees.",
      ),
      windSpeed: numberSchema(
        "Sustained wind in knots; simulation normalizes to 0–40 kt.",
      ),
    },
    { condition: "rain", directionDegrees: 270, windSpeed: 18 },
  ),
  setWeatherEnabled: command(
    "operations",
    "Enable or disable modeled weather effects.",
    AUTHORITY.session,
    {
      enabled: booleanSchema("Whether modeled weather is enabled."),
    },
    { enabled: false },
  ),
  setWeatherHazardsEnabled: command(
    "operations",
    "Enable or disable rare deterministic wind-shear and microburst events.",
    AUTHORITY.session,
    {
      enabled: booleanSchema(
        "Whether opt-in high-stakes terminal weather hazards are enabled.",
      ),
    },
    { enabled: false },
  ),
  setWindEnabled: command(
    "operations",
    "Enable or disable modeled wind effects.",
    AUTHORITY.session,
    {
      enabled: booleanSchema("Whether modeled wind is enabled."),
    },
    { enabled: false },
  ),
  setRunwayConfiguration: command(
    "operations",
    "Select a runway configuration, or null for automatic wind/weather selection.",
    AUTHORITY.supervisor,
    {
      configurationId: nullableStringSchema(
        "Runway configuration ID, or null for automatic selection.",
      ),
    },
    { configurationId: null },
  ),
  setSurfaceDisruption: command(
    "operations",
    "Create, update, disable, or schedule a surface restriction.",
    AUTHORITY.supervisor,
    {
      kind: stringSchema("Surface restriction kind.", [
        "runway-closure",
        "taxiway-closure",
        "construction",
      ]),
      targetId: stringSchema("Runway, taxiway, or surface-edge target ID."),
      enabled: booleanSchema("Whether the restriction is active."),
      durationSeconds: {
        type: "number",
        exclusiveMinimum: 0,
        description: "Optional positive automatic-clear duration.",
      },
    },
    {
      kind: "taxiway-closure",
      targetId: "A",
      enabled: true,
      durationSeconds: 180,
    },
    { optionalParameters: ["durationSeconds"] },
  ),
  triggerSurfaceIncident: command(
    "operations",
    "Start a named runway or taxiway inspection through the shared surface safety arbiter.",
    AUTHORITY.supervisor,
    {
      kind: stringSchema("Named airport incident.", [
        "runway-inspection",
        "bird-activity",
        "foreign-object-debris",
      ]),
      targetId: stringSchema("Runway or taxiway target for the inspection."),
    },
    { kind: "runway-inspection", targetId: "0" },
  ),
  clearSurfaceDisruption: command(
    "operations",
    "Clear a surface disruption by ID.",
    AUTHORITY.supervisor,
    {
      disruptionId: stringSchema(
        "Active disruption ID from snapshot().surfaceDisruptions.",
      ),
    },
    { disruptionId: "SD-1" },
  ),
  recoverDisabledAircraft: command(
    "surface",
    "Dispatch recovery for a disabled surface aircraft.",
    AUTHORITY.groundOperation,
    { flightId: flightIdSchema },
    { flightId: 1 },
  ),
  startTrainingLesson: command(
    "training",
    "Open a deterministic no-fail training lesson.",
    AUTHORITY.training,
    {
      lessonId: stringSchema("Training lesson.", [
        "arrival-basics",
        "tower-landing",
        "surface-flow",
        "handoff-workflow",
      ]),
    },
    { lessonId: "arrival-basics" },
  ),
  stopTrainingLesson: command(
    "training",
    "End the current training lesson.",
    AUTHORITY.training,
  ),
  continueTraining: command(
    "training",
    "Continue from the current training checkpoint.",
    AUTHORITY.training,
  ),
  trainingHint: command(
    "training",
    "Request the next contextual training hint.",
    AUTHORITY.training,
  ),
  retryTrainingStep: command(
    "training",
    "Restore the deterministic checkpoint for the current step.",
    AUTHORITY.training,
  ),
  skipTrainingStep: command(
    "training",
    "Advance past the current step without score or safety penalty.",
    AUTHORITY.training,
  ),
  startChallenge: command(
    "challenge",
    "Open a paused challenge briefing with locked conditions.",
    AUTHORITY.challenge,
    {
      challengeId: stringSchema("Controller challenge.", [
        "rush-hour",
        "storm-operations",
        "runway-closure",
        "emergency-priority",
      ]),
    },
    { challengeId: "rush-hour" },
  ),
  beginChallenge: command(
    "challenge",
    "Begin the challenge shift from its briefing.",
    AUTHORITY.challenge,
  ),
  endChallenge: command(
    "challenge",
    "End the active challenge and open its debrief.",
    AUTHORITY.challenge,
  ),
  continueAfterChallenge: command(
    "challenge",
    "Return to free play after a challenge debrief.",
    AUTHORITY.challenge,
  ),
  startSandbox: command(
    "sandbox",
    "Enter no-score sandbox mode with optional background demand.",
    AUTHORITY.sandbox,
    {
      backgroundTraffic: booleanSchema(
        "Whether continuous airport demand remains enabled.",
      ),
    },
    { backgroundTraffic: false },
    { optionalParameters: ["backgroundTraffic"] },
  ),
  stopSandbox: command(
    "sandbox",
    "Leave sandbox and continue ordinary free play.",
    AUTHORITY.sandbox,
  ),
  cancelSandboxInjections: command(
    "sandbox",
    "Cancel pending sandbox traffic injections.",
    AUTHORITY.sandbox,
  ),
  clearSandboxTraffic: command(
    "sandbox",
    "Remove sandbox traffic while preserving airport conditions.",
    AUTHORITY.sandbox,
  ),
  setSandboxBackgroundTraffic: command(
    "sandbox",
    "Enable or disable continuous background demand in sandbox.",
    AUTHORITY.sandbox,
    {
      enabled: booleanSchema("Whether background demand is active."),
    },
    { enabled: true },
  ),
  injectSandboxTraffic: command(
    "sandbox",
    "Queue safe arrival or departure releases through the normal scheduler.",
    AUTHORITY.sandbox,
    {
      direction: stringSchema("Traffic direction.", ["arrival", "departure"]),
      trafficClass: stringSchema("Aircraft traffic class.", [
        "auto",
        "passenger",
        "regional",
        "cargo",
        "general-aviation",
      ]),
      runwayId: nullableIntegerSchema(
        "Optional compatible runway ID, or null for scheduler choice.",
      ),
      count: integerSchema("Number of aircraft to queue.", 1, 8),
    },
    {
      direction: "arrival",
      trafficClass: "passenger",
      runwayId: null,
      count: 4,
    },
    { optionalParameters: ["trafficClass", "runwayId", "count"] },
  ),
} satisfies Record<AirportControlAction, CommandSpecInput>;

function buildCommandSchema(
  action: AirportControlAction,
  spec: CommandSpecInput,
): ProtocolJsonSchema {
  const optional = new Set(spec.optionalParameters ?? []);
  return {
    $id: `airport-auto://schema/command/${action}/${CONTROL_PROTOCOL_VERSION}`,
    title: `Airport Auto command: ${action}`,
    description: spec.summary,
    type: "object",
    properties: {
      action: { const: action, type: "string" },
      ...(spec.parameters ?? {}),
    },
    required: [
      "action",
      ...Object.keys(spec.parameters ?? {}).filter(
        (parameter) => !optional.has(parameter),
      ),
    ],
    additionalProperties: false,
  };
}

export const AIRPORT_CONTROL_COMMAND_DEFINITIONS = Object.fromEntries(
  (
    Object.entries(COMMAND_SPECS) as Array<
      [AirportControlAction, CommandSpecInput]
    >
  ).map(([action, spec]) => {
    const schema = buildCommandSchema(action, spec);
    const definition: CommandProtocolDefinition = {
      action,
      category: spec.category,
      summary: spec.summary,
      mutates: spec.mutates,
      authority: {
        ...spec.authority,
        stations: [...spec.authority.stations],
      },
      compatibility: {
        formalizedInApi: CONTROL_API_VERSION,
        protocolMajor: 1,
        modes: [...ALL_MODES],
        transports: ["page", "broadcast", "websocket"],
        availability:
          spec.availability ??
          "Runtime phase, ownership, safety, scenario, and lifecycle preconditions are returned as structured rejections.",
        ...(spec.legacyAliasFor ? { legacyAliasFor: spec.legacyAliasFor } : {}),
        ...(spec.deprecated ? { deprecated: true } : {}),
      },
      parameters: { ...(spec.parameters ?? {}) },
      optionalParameters: [...(spec.optionalParameters ?? [])],
      result: {
        schemaRef: `airport-auto://schema/result/${CONTROL_PROTOCOL_VERSION}`,
        stateEffect: spec.mutates
          ? spec.category === "presentation"
            ? "presentation"
            : "simulation"
          : "none",
        data: spec.resultData ?? "none",
        commandEventType: `command:${action}`,
        rejectionContract:
          "A rejected command returns accepted=false, a stable plain-language reason, unchanged authoritative state unless the safety arbiter itself records a protective hold, and causal audit metadata.",
      },
      schema,
      example: { action, ...(spec.example ?? {}) } as AirportControlCommand,
    };
    return [action, definition];
  }),
) as Record<AirportControlAction, CommandProtocolDefinition>;

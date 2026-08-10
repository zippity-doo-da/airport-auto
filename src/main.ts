import "./styles.css";
import { airportAutoAssetPath } from "./assets/assetManifest";
import { AirportSimulation } from "./simulation/airportSimulation";
import {
  generateAirportConfig,
  generateHubConfig,
  HUB_AIRPORTS,
  type AirportConfig,
} from "./simulation/airportConfig";
import { aircraftProfile } from "./simulation/aircraftProfiles";
import { aircraftSystemsState } from "./simulation/aircraftSystems";
import { aircraftCollisionEnvelope } from "./simulation/collisionDetection";
import { airlineProfile } from "./simulation/airlineProfiles";
import {
  sampleAircraftSurfaceMotion,
  surfaceStoppingDistanceM,
} from "./simulation/surfaceMotion";
import {
  surfaceRampControlZones,
  surfaceStandFlow,
} from "./simulation/surfaceOperations";
import { GATE_TURN_BUFFER_SECONDS } from "./simulation/gateAssignment";
import { cloneFlightPlan } from "./simulation/flightPlanning";
import {
  airportPlaceLabel,
  airportRouteLabel,
} from "./simulation/airportDirectory";
import {
  isTrafficDensity,
  trafficDensityProfile,
  type TrafficDensity,
} from "./simulation/trafficDensity";
import {
  cloneTrafficFlowState,
  isTrafficFlowForecastHorizon,
  isTrafficFlowObjective,
  trafficFlowObjectiveProfile,
} from "./simulation/trafficFlowManagement";
import {
  cloneWeatherState,
  isWeatherCondition,
  weatherConditionProfile,
} from "./simulation/weatherOperations";
import {
  cloneEnvironmentState,
  isEnvironmentLightingMode,
  isEnvironmentSeasonMode,
} from "./simulation/environmentOperations";
import {
  AMBIENT_PROGRAM_IDS,
  AMBIENT_PROGRAMS,
  type AmbientProgramId,
} from "./simulation/ambientPrograms";
import {
  separationRuleset,
  type SeparationRulesetId,
} from "./simulation/separationRules";
import {
  activeRunwayDesignation as resolveActiveRunwayDesignation,
  runwayDesignation as resolveRunwayDesignation,
} from "./simulation/runwayGeometry";
import {
  controllerStationLabel,
  isControllerStation,
  OPERATIONAL_CONTROLLER_STATIONS,
  requiredControllerStation,
  suggestedHandoffStation,
} from "./simulation/controllerOperations";
import type {
  ClearanceProposal,
  ChallengeId,
  ControlMode,
  ControllerPerformanceSnapshot,
  ControllerPolicyPresetId,
  ControllerStation,
  EnvironmentLightingMode,
  EnvironmentSeasonMode,
  ConflictPrediction,
  Flight,
  FlightPhase,
  FlightRouteClearanceState,
  GroupFlightInstruction,
  GroupInstructionIssueResult,
  GroupInstructionPreview,
  OperationalControllerStation,
  ReplayFrame,
  SandboxTrafficClass,
  SandboxTrafficDirection,
  SurfaceDisruptionKind,
  TrafficScenario,
  TrafficFlowObjective,
  TrafficFlowForecastHorizonSeconds,
  TrainingLessonId,
  TurnaroundServiceType,
  WeatherCondition,
} from "./simulation/types";
import { isTrainingOperationalAction } from "./simulation/trainingProgram";
import {
  AmbientAudio,
  type AudioChannel,
  type AudioPreset,
} from "./audio/ambientAudio";
import {
  SoundscapeEventScheduler,
  type SoundscapeEvent,
} from "./audio/soundscapeEvents";
import {
  createWorld,
  type AirspaceLayer,
  type SurfaceLayer,
} from "./render/createWorld";
import { drawRadarInset } from "./render/radarInset";
import {
  SurfaceSafetyAdvisoryTracker,
  surfaceSafetySnapshot,
  type SurfaceSafetySnapshot,
} from "./simulation/surfaceSafety";
import { SurfaceSafetyAcknowledgements } from "./simulation/surfaceSafetyAcknowledgements";
import { digitalClearanceSnapshot } from "./simulation/digitalClearances";
import {
  createFocusTargetRegistry,
  focusTargetKey,
  isFocusTargetKind,
  type FocusTargetCatalog,
  type FocusTargetDescriptor,
  type FocusTargetRef,
} from "./presentation/focusTargets";
import {
  StatusMessageCoordinator,
  type StatusMessagePolicy,
  type StatusMessagePriority,
  type StatusMessageView,
} from "./presentation/statusMessages";
import { RadioCaptionCoordinator } from "./presentation/radioCaptions";
import { createAtisBriefing } from "./presentation/atisBriefing";
import {
  loadWatchPreset,
  saveWatchPreset,
  type WatchPreset,
} from "./presentation/watchPreset";
import { SurfaceSafetyAnnouncementTracker } from "./presentation/surfaceSafetyAnnouncements";
import { CameraDirector } from "./presentation/cameraDirector";
import {
  accessibilityPaletteDefinition,
  isAccessibilityPalette,
  type AccessibilityPalette,
} from "./presentation/accessibilityPalette";
import { createFocusNavigator, type FocusNavigator } from "./ui/focusNavigator";
import {
  isOperationQueueFilter,
  operationQueueRenderKey,
  renderOperationQueueInspector,
  type OperationQueueFilter,
} from "./ui/queueInspector";
import {
  digitalClearancePanelKey,
  isDigitalClearancePanelView,
  renderDigitalClearancePanel,
  type DigitalClearancePanelView,
} from "./ui/digitalClearancePanel";
import {
  digitalClearanceComposerKey,
  readDigitalClearanceComposer,
  renderDigitalClearanceComposer,
  type DigitalClearanceComposerModel,
} from "./ui/digitalClearanceComposer";
import {
  renderSurfaceDisruptionPanel,
  surfaceDisruptionPanelKey,
  updateSurfaceDisruptionTargetOptions,
} from "./ui/surfaceDisruptionPanel";
import { surfaceIncidentDefinition } from "./simulation/surfaceIncidentProgram";
import {
  renderSurfaceSafetyPanel,
  SURFACE_SAFETY_PANEL_UPDATE_INTERVAL_MS,
  surfaceSafetyPanelKey,
  type SurfaceSafetyFilter,
} from "./ui/surfaceSafetyPanel";
import {
  DEFAULT_SURFACE_SAFETY_DIAGRAM_LAYERS,
  isSurfaceSafetyLookaheadSeconds,
  type SurfaceSafetyDiagramLayer,
  type SurfaceSafetyDiagramLayers,
  type SurfaceSafetyLookaheadSeconds,
} from "./presentation/surfaceSafetyDisplay";
import {
  coordinationInboxKey,
  renderCoordinationInbox,
} from "./ui/coordinationInbox";
import {
  createChallengePanel,
  type ChallengeSnapshot,
} from "./ui/challengePanel";
import {
  dailyChallengePlan,
  type DailyChallengePlan,
} from "./simulation/dailyChallenge";
import { createCommunityPanel, type CommunityPanel } from "./ui/communityPanel";
import { createSandboxPanel } from "./ui/sandboxPanel";
import {
  createInputSettingsPanel,
  type InputSettingsPanel,
} from "./ui/inputSettingsPanel";
import {
  createControllerEvaluationPanel,
  type ControllerEvaluationPanel,
} from "./ui/controllerEvaluationPanel";
import {
  createUnifiedInput,
  type CanvasPointerIntent,
  type ScreenPoint,
} from "./input/unifiedInput";
import type {
  InputActionContext,
  InputActionId,
  InputAxes,
} from "./input/actionMap";
import {
  controllerEvaluationSnapshot,
  type ControllerEvaluationSnapshot,
} from "./telemetry/controllerEvaluation";
import {
  OPERATIONS_EXPORT_DATASETS,
  OperationsAnalyticsRecorder,
  buildOperationsExportBundle,
  isOperationsExportDataset,
  serializeOperationsCsv,
  type OperationsAirportDescriptor,
  type OperationsAnalyticsSnapshot,
  type OperationsExportDataset,
} from "./telemetry/operationsAnalytics";
import {
  RuntimePerformanceMonitor,
  runtimeHeapBytes,
} from "./telemetry/runtimePerformance";
import { createOperationsLab, type OperationsLab } from "./ui/operationsLab";
import {
  buildReplaySeedLink,
  compareReplayStates,
  createShareableReplayRecording,
  createShareableReplayRecordingAsync,
  createReplayRecording,
  createReplayRecordingAsync,
  deriveReplayMarkers,
  replayFilename,
  verifyReplayRecording,
  verifyReplayRecordingAsync,
  type ReplayRecordedCommand,
  type ReplayRecording,
  type ReplayRecordingDraft,
  type ReplayStateComparison,
  type ReplayTelemetryEvent,
  type ReplayVerificationResult,
} from "./replay/replayRecording";
import {
  createReplayInspector,
  type ReplayInspector,
} from "./ui/replayInspector";
import { LiveDataCoordinator } from "./live/liveDataCoordinator";
import {
  type LiveMetarReport,
  type LiveNotamReport,
  type LiveSurfaceStatusItem,
  type LiveTrafficReport,
  type LiveTrafficSeedPlan,
} from "./live/liveDataTypes";
import { liveDataAge } from "./live/liveDataAdapters";
import { liveDataStationForAirport } from "./live/airportStations";
import { createLiveDataPanel, type LiveDataPanel } from "./ui/liveDataPanel";
import {
  LocalCapture,
  type LocalCaptureSnapshot,
} from "./presentation/localCapture";
import { createCapturePanel, type CapturePanel } from "./ui/capturePanel";
import {
  AIRPORT_CONTROL_COMMAND_DEFINITIONS,
  CONTROL_API_VERSION,
  CONTROL_BROADCAST_CHANNEL,
  CONTROL_PROTOCOL_VERSION,
  CONTROL_REPLAY_SCHEMA_VERSION,
  CONTROL_SNAPSHOT_SCHEMA_VERSION,
  assessProtocolCompatibility,
  getAirportControlProtocol,
  validateAirportControlCommand,
  validateAirportControlEnvelope,
  type AirportControlAction,
  type AirportControlCommand,
  type AirportControlRequestEnvelope,
  type CommandValidationResult,
  type ControlAuthorityAssertion,
  type ControlCommandSource,
  type ControlProtocolExpectations,
  type ProtocolCompatibilityAssessment,
  type ProtocolValidationIssue,
} from "./control/controlProtocol";
import { migrateBroadcastControlRequest } from "./control/controlMigrations";
import {
  schemaMigrationCatalog,
  schemaMigrationTools,
} from "./persistence/schemaMigrationCatalog";
import {
  buildSessionSaveLaunchUrl,
  createAirportSessionSave,
  migrateAirportSessionSave,
  type AirportSessionSave,
} from "./persistence/sessionSave";
import {
  RemoteControlHost,
  type RemoteControlHostConfiguration,
  type RemoteControlHostState,
} from "./control/remoteControlHost";

type AirportControlResult = {
  protocolVersion: typeof CONTROL_PROTOCOL_VERSION;
  apiVersion: typeof CONTROL_API_VERSION;
  sessionId: string;
  requestId: string;
  clientId: string | null;
  commandId: string;
  source: ControlCommandSource;
  action: AirportControlAction | null;
  accepted: boolean;
  reason: string;
  sequence: number;
  eventId: number;
  eventKey: string;
  authority: {
    rule: string;
    assertedStation: ControllerStation | null;
    effectiveStation: ControllerStation;
    resultingStation: ControllerStation;
    requiredStations: ControllerStation[];
    flightOwnership: boolean;
    safetyArbiter: boolean;
    enforced: true;
    actorId: string | null;
  };
  compatibility: ProtocolCompatibilityAssessment;
  validation: {
    valid: boolean;
    issues: ProtocolValidationIssue[];
  };
  snapshot: ReturnType<typeof airportSnapshot>;
  resultingState: ReturnType<typeof airportSnapshot>;
  data?:
    | GroupInstructionPreview
    | GroupInstructionIssueResult
    | FlightRouteClearanceState;
};

type RecordedCommand = ReplayRecordedCommand;
type TelemetryEvent = ReplayTelemetryEvent;

declare global {
  interface Window {
    airportControl: {
      version: string;
      protocolVersion: string;
      snapshot(): ReturnType<typeof airportSnapshot>;
      events(limit?: number): TelemetryEvent[];
      command(
        command: AirportControlCommand,
      ): ReturnType<typeof airportSnapshot>;
      request(command: AirportControlCommand): AirportControlResult;
      validate(command: unknown): CommandValidationResult;
      dispatch(envelope: AirportControlRequestEnvelope): AirportControlResult;
      protocol(): ReturnType<typeof getAirportControlProtocol>;
      remote: {
        state(): RemoteControlHostState;
        connect(
          configuration: RemoteControlHostConfiguration,
        ): Promise<RemoteControlHostState>;
        disconnect(reason?: string): RemoteControlHostState;
      };
      liveData: {
        snapshot(): ReturnType<LiveDataPanel["snapshot"]>;
        clearCache(): ReturnType<LiveDataPanel["snapshot"]>;
      };
      capture: {
        snapshot(): LocalCaptureSnapshot & { cleanView: boolean };
        screenshot(): Promise<LocalCaptureSnapshot>;
        startClip(durationSeconds?: number): LocalCaptureSnapshot;
        stopClip(): LocalCaptureSnapshot;
        setCleanView(enabled: boolean): boolean;
      };
      community: {
        snapshot(): ReturnType<CommunityPanel["snapshot"]>;
        loadDailyChallenge(): boolean;
        copyClassroomLink(): Promise<boolean>;
      };
      help(): Record<string, string>;
      replay(): ReplayFrame[];
      recording(): ReplayRecording;
      replayTools: {
        verify(recording?: unknown): ReplayVerificationResult;
        verifyAsync(recording?: unknown): Promise<ReplayVerificationResult>;
        load(recording: unknown): ReplayVerificationResult;
        shareable(recording?: ReplayRecording): ReplayRecording;
        shareableAsync(recording?: ReplayRecording): Promise<ReplayRecording>;
        compare(
          leftFrameIndex: number,
          rightFrameIndex: number,
        ): ReplayStateComparison | null;
        seedLink(): string;
      };
      analytics(flightId?: number): OperationsAnalyticsSnapshot;
      exportData(
        format: "json" | "csv",
        dataset?: OperationsExportDataset,
        flightId?: number,
      ): string;
      performance(): ReturnType<RuntimePerformanceMonitor["snapshot"]>;
      sessionTools: {
        create(): AirportSessionSave;
        migrate: typeof migrateAirportSessionSave;
        launchUrl(save?: AirportSessionSave): string;
      };
      migrations: typeof schemaMigrationTools & {
        catalog: typeof schemaMigrationCatalog;
      };
    };
  }
}

const FLIGHT_PHASE_ORDER: Record<FlightPhase, number> = {
  landing: 0,
  approach: 1,
  takeoff: 2,
  "taxi-in": 3,
  "taxi-out": 4,
  resting: 5,
};

const ACCESSIBILITY_PALETTE_STORAGE_KEY = "airport-auto:accessibility-palette";

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const controlSessionId =
  typeof crypto.randomUUID === "function"
    ? `session-${crypto.randomUUID()}`
    : `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
let controlRequestSequence = 0;
let controlCommandSequence = 0;
let activeControlCommandId: string | null = null;

function generatedControlId(kind: "request" | "command"): string {
  const sequence =
    kind === "request" ? ++controlRequestSequence : ++controlCommandSequence;
  return `${kind === "request" ? "req" : "cmd"}-${controlSessionId.slice(8)}-${sequence.toString(36)}`;
}

const canvas = $<HTMLCanvasElement>("#scene");
const menuButton = $<HTMLButtonElement>("#menu-toggle");
const controlPanel = $<HTMLElement>("#control-panel");
const audio = new AmbientAudio();
let config = generateAirportConfig();
const soundscape = new SoundscapeEventScheduler(config.seed);
let simulation = new AirportSimulation(config);
const operationsAnalytics = new OperationsAnalyticsRecorder(
  controlSessionId,
  operationsAirportDescriptor(config),
  simulation.shiftMetrics(),
);
const runtimePerformance = new RuntimePerformanceMonitor();
let world = createWorld(canvas, config);
let focusTargetRegistry = createFocusTargetRegistry(config);
let focusTargetCatalog = focusTargetRegistry.build(
  simulation.state,
  simulation.queueSnapshot(simulation.state),
  simulation.conflictPredictions(),
);
simulation.setPaused(true);

const intro = $<HTMLDivElement>("#intro");
const gameOver = $<HTMLDivElement>("#game-over");
const enterButton = $<HTMLButtonElement>("#enter");
const restartButton = $<HTMLButtonElement>("#restart");
const soundButton = $<HTMLButtonElement>("#sound-toggle");
const pauseButton = $<HTMLButtonElement>("#pause-toggle");
const pauseIcon = $<HTMLElement>("#pause-icon");
const pauseLabel = $<HTMLElement>("#pause-label");
const viewButton = $<HTMLButtonElement>("#view-toggle");
const fieldButton = $<HTMLButtonElement>("#field-toggle");
const fieldLabel = $<HTMLElement>("#field-label");
const modeButton = $<HTMLButtonElement>("#mode-toggle");
const modeIcon = $<HTMLElement>("#mode-icon");
const modeLabel = $<HTMLElement>("#mode-label");
const nightButton = $<HTMLButtonElement>("#night-toggle");
const nightIcon = $<HTMLElement>("#night-icon");
const nightLabel = $<HTMLElement>("#night-label");
const radarButton = $<HTMLButtonElement>("#radar-toggle");
const radarLabel = $<HTMLElement>("#radar-label");
const radarPanel = $<HTMLElement>("#radar-panel");
const radarScope = $<HTMLCanvasElement>("#radar-scope");
const radarAirport = $<HTMLElement>("#radar-airport");
const radarClose = $<HTMLButtonElement>("#radar-close");
const radarRange = $<HTMLElement>("#radar-range");
const surfaceSafetyButton = $<HTMLButtonElement>("#surface-safety-toggle");
const surfaceSafetyLabel = $<HTMLElement>("#surface-safety-label");
const surfaceSafetyPanel = $<HTMLElement>("#surface-safety-panel");
const surfaceSafetyClose = $<HTMLButtonElement>("#surface-safety-close");
const surfaceSafetyFilter = $<HTMLSelectElement>("#surface-safety-filter");
const surfaceSafetyLookahead = $<HTMLSelectElement>(
  "#surface-safety-lookahead",
);
const surfaceSafetyLayerInputs: Record<
  SurfaceSafetyDiagramLayer,
  HTMLInputElement
> = {
  routes: $<HTMLInputElement>("#surface-safety-layer-routes"),
  corridors: $<HTMLInputElement>("#surface-safety-layer-corridors"),
  forecasts: $<HTMLInputElement>("#surface-safety-layer-forecasts"),
  vehicles: $<HTMLInputElement>("#surface-safety-layer-vehicles"),
};
const surfaceSafetyDiagram = $<HTMLElement>("#surface-safety-diagram");
const surfaceSafetyTracks = $<HTMLElement>("#surface-safety-tracks");
const surfaceSafetyVehicles = $<HTMLElement>("#surface-safety-vehicles");
const surfaceSafetyAdvisories = $<HTMLElement>("#surface-safety-advisories");
const surfaceSafetyMovers = $<HTMLElement>("#surface-safety-movers");
const surfaceSafetyProtected = $<HTMLElement>("#surface-safety-protected");
const surfaceSafetyHolds = $<HTMLElement>("#surface-safety-holds");
const surfaceSafetyLiveSummary = $<HTMLElement>("#surface-safety-live-summary");
const queueButton = $<HTMLButtonElement>("#queue-toggle");
const queueLabel = $<HTMLElement>("#queue-label");
const queuePanel = $<HTMLElement>("#queue-panel");
const queueClose = $<HTMLButtonElement>("#queue-close");
const queueCount = $<HTMLElement>("#queue-count");
const queueFilter = $<HTMLSelectElement>("#queue-filter");
const queueFlowObjective = $<HTMLSelectElement>("#queue-flow-objective");
const queueFlowHorizon = $<HTMLSelectElement>("#queue-flow-horizon");
const queueCapacityHeading = $<HTMLElement>("#queue-capacity-heading");
const queueList = $<HTMLElement>("#queue-list");
const queueLongest = $<HTMLElement>("#queue-longest");
const queueMeter = $<HTMLElement>("#queue-meter");
const queueMeterSummary = $<HTMLElement>("#queue-meter-summary");
const queueCapacity = $<HTMLElement>("#queue-capacity");
const digitalClearanceButton = $<HTMLButtonElement>(
  "#digital-clearance-toggle",
);
const digitalClearanceLabel = $<HTMLElement>("#digital-clearance-label");
const digitalClearancePanel = $<HTMLElement>("#digital-clearance-panel");
const digitalClearanceClose = $<HTMLButtonElement>("#digital-clearance-close");
const digitalClearanceCount = $<HTMLElement>("#digital-clearance-count");
const digitalClearanceViews = $<HTMLElement>("#digital-clearance-views");
const digitalClearanceList = $<HTMLElement>("#digital-clearance-list");
const digitalClearanceComposer = $<HTMLFormElement>(
  "#digital-clearance-composer",
);
const digitalClearanceComposerState = $<HTMLElement>(
  "#digital-clearance-composer-state",
);
const digitalClearanceFlight = $<HTMLSelectElement>(
  "#digital-clearance-flight",
);
const digitalClearanceRoute = $<HTMLSelectElement>("#digital-clearance-route");
const digitalClearanceAltitude = $<HTMLInputElement>(
  "#digital-clearance-altitude",
);
const digitalClearanceSpeed = $<HTMLInputElement>("#digital-clearance-speed");
const digitalClearancePreview = $<HTMLButtonElement>(
  "#digital-clearance-preview",
);
const digitalClearanceIssue = $<HTMLButtonElement>("#digital-clearance-issue");
const digitalClearanceCancel = $<HTMLButtonElement>(
  "#digital-clearance-cancel",
);
const operationsLabButton = $<HTMLButtonElement>("#operations-lab-toggle");
const operationsLabPanel = $<HTMLElement>("#operations-lab");
const performanceButton = $<HTMLButtonElement>("#performance-toggle");
const performanceLabel = $<HTMLElement>("#performance-label");
const focusToggle = $<HTMLButtonElement>("#focus-toggle");
const focusPanel = $<HTMLElement>("#focus-panel");
const focusClose = $<HTMLButtonElement>("#focus-close");
const focusCount = $<HTMLElement>("#focus-count");
const focusKind = $<HTMLSelectElement>("#focus-kind");
const focusTargetSelect = $<HTMLSelectElement>("#focus-target");
const focusDetail = $<HTMLElement>("#focus-detail");
const focusPrevious = $<HTMLButtonElement>("#focus-previous");
const focusApply = $<HTMLButtonElement>("#focus-apply");
const focusNext = $<HTMLButtonElement>("#focus-next");
const focusRelease = $<HTMLButtonElement>("#focus-release");
const focusStatus = $<HTMLElement>("#focus-status");
const focusStatusLabel = $<HTMLElement>("#focus-status-label");
const focusStatusDetail = $<HTMLElement>("#focus-status-detail");
const focusStatusRelease = $<HTMLButtonElement>("#focus-status-release");
const scopeButton = $<HTMLButtonElement>("#scope-toggle");
const scopeLabel = $<HTMLElement>("#scope-label");
const brandMark = $<HTMLElement>("#brand-mark");
const airportName = $<HTMLElement>("#airport-name");
const airportMeta = $<HTMLElement>("#airport-meta");
const mapDataVersion = $<HTMLElement>("#map-data-version");
const mapDataAttribution = $<HTMLElement>("#map-data-attribution");
const mapDataSource = $<HTMLAnchorElement>("#map-data-source");
const mapSurfaceSource = $<HTMLAnchorElement>("#map-surface-source");
const mapFacilitySource = $<HTMLAnchorElement>("#map-facility-source");
const instructionCopy = $<HTMLElement>("#instruction-copy");
const airportSelect = $<HTMLSelectElement>("#airport-select");
const controlSelect = $<HTMLSelectElement>("#control-select");
const scenarioSelect = $<HTMLSelectElement>("#scenario-select");
const densitySelect = $<HTMLSelectElement>("#density-select");
const separationRulesSelect = $<HTMLSelectElement>("#separation-rules-select");
const stationSelect = $<HTMLSelectElement>("#station-select");
const controllerPolicySelect = $<HTMLSelectElement>(
  "#controller-policy-select",
);
const controllerPolicyDetail = $<HTMLElement>("#controller-policy-detail");
const stationAutomationControls = [
  ...document.querySelectorAll<HTMLInputElement>("[data-station-automation]"),
];
const stationWorkloadControls = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-station-workload]"),
];
const trainingLessonSelect = $<HTMLSelectElement>("#training-lesson-select");
const trainingStart = $<HTMLButtonElement>("#training-start");
const trainingCoach = $<HTMLElement>("#training-coach");
const trainingTitle = $<HTMLElement>("#training-title");
const trainingProgress = $<HTMLElement>("#training-progress");
const trainingObjective = $<HTMLElement>("#training-objective");
const trainingContextCopy = $<HTMLElement>("#training-context");
const trainingExplanation = $<HTMLDetailsElement>("#training-explanation");
const trainingWhy = $<HTMLElement>("#training-why");
const trainingFeedback = $<HTMLElement>("#training-feedback");
const trainingHint = $<HTMLButtonElement>("#training-hint");
const trainingContinue = $<HTMLButtonElement>("#training-continue");
const trainingRetry = $<HTMLButtonElement>("#training-retry");
const trainingSkip = $<HTMLButtonElement>("#training-skip");
const trainingEnd = $<HTMLButtonElement>("#training-end");
const challengeSetup = $<HTMLDetailsElement>("#challenge-setup");
const communityRoot = $<HTMLElement>("#community-panel");
const dailyChallengeLoad = $<HTMLButtonElement>("[data-daily-load]");
const challengeSelect = $<HTMLSelectElement>("#challenge-select");
const challengeSetupNote = $<HTMLElement>("#challenge-setup-note");
const challengeStart = $<HTMLButtonElement>("#challenge-start");
const challengeHud = $<HTMLElement>("#challenge-hud");
const challengeTitle = $<HTMLElement>("#challenge-title");
const challengeClock = $<HTMLElement>("#challenge-clock");
const challengeGrade = $<HTMLElement>("#challenge-grade");
const challengeStatus = $<HTMLElement>("#challenge-status");
const challengeConditions = $<HTMLElement>("#challenge-conditions");
const challengeObjectiveDetails = $<HTMLDetailsElement>(
  "#challenge-objective-details",
);
const challengeObjectives = $<HTMLElement>("#challenge-objectives");
const challengePrimary = $<HTMLButtonElement>("#challenge-primary");
const challengeEnd = $<HTMLButtonElement>("#challenge-end");
const challengeResults = $<HTMLElement>("#challenge-results");
const challengeResultEyebrow = $<HTMLElement>("#challenge-result-eyebrow");
const challengeResultTitle = $<HTMLElement>("#challenge-result-title");
const challengeResultGrade = $<HTMLElement>("#challenge-result-grade");
const challengeResultScore = $<HTMLElement>("#challenge-result-score");
const challengeResultReason = $<HTMLElement>("#challenge-result-reason");
const challengeResultThroughput = $<HTMLElement>(
  "#challenge-result-throughput",
);
const challengeResultDelay = $<HTMLElement>("#challenge-result-delay");
const challengeResultFuel = $<HTMLElement>("#challenge-result-fuel");
const challengeResultSafety = $<HTMLElement>("#challenge-result-safety");
const challengeResultOperations = $<HTMLElement>(
  "#challenge-result-operations",
);
const challengeResultEmergencies = $<HTMLElement>(
  "#challenge-result-emergencies",
);
const challengeResultObjectives = $<HTMLElement>(
  "#challenge-result-objectives",
);
const challengeRetry = $<HTMLButtonElement>("#challenge-retry");
const challengeContinue = $<HTMLButtonElement>("#challenge-continue");
const sandboxSetup = $<HTMLDetailsElement>("#sandbox-setup");
const sandboxToggle = $<HTMLButtonElement>("#sandbox-toggle");
const sandboxBackground = $<HTMLInputElement>("#sandbox-background");
const sandboxDirection = $<HTMLSelectElement>("#sandbox-direction");
const sandboxTrafficClass = $<HTMLSelectElement>("#sandbox-traffic-class");
const sandboxRunway = $<HTMLSelectElement>("#sandbox-runway");
const sandboxCount = $<HTMLSelectElement>("#sandbox-count");
const sandboxInject = $<HTMLButtonElement>("#sandbox-inject");
const sandboxStatus = $<HTMLElement>("#sandbox-status");
const sandboxDetail = $<HTMLElement>("#sandbox-detail");
const sandboxCancel = $<HTMLButtonElement>("#sandbox-cancel");
const sandboxClear = $<HTMLButtonElement>("#sandbox-clear");
const sandboxHud = $<HTMLElement>("#sandbox-hud");
const sandboxHudStatus = $<HTMLElement>("#sandbox-hud-status");
const introAirportSelect = $<HTMLSelectElement>("#intro-airport-select");
const introControlSelect = $<HTMLSelectElement>("#intro-control-select");
const introDensitySelect = $<HTMLSelectElement>("#intro-density-select");
const introSeparationRulesSelect = $<HTMLSelectElement>(
  "#intro-separation-rules-select",
);
const speedControl = $<HTMLInputElement>("#speed-control");
const speedOutput = $<HTMLOutputElement>("#speed-output");
const weatherCondition = $<HTMLElement>("#weather-condition");
const weatherWind = $<HTMLElement>("#weather-wind");
const weatherVisibility = $<HTMLElement>("#weather-visibility");
const weatherRunwayCondition = $<HTMLElement>("#weather-runway-condition");
const environmentReadout = $<HTMLElement>("#environment-readout");
const operationBank = $<HTMLElement>("#operation-bank");
const trafficFlowReadout = $<HTMLElement>("#traffic-flow");
const runwayConfiguration = $<HTMLElement>("#runway-configuration");
const runwayConfigurationSelect = $<HTMLSelectElement>(
  "#runway-configuration-select",
);
const ambientProgramSelect = $<HTMLSelectElement>("#ambient-program-select");
const watchPresetSave = $<HTMLButtonElement>("#watch-preset-save");
const watchPresetRestore = $<HTMLButtonElement>("#watch-preset-restore");
const weatherToggle = $<HTMLButtonElement>("#weather-toggle");
const windToggle = $<HTMLButtonElement>("#wind-toggle");
const atisButton = $<HTMLButtonElement>("#atis-button");
const weatherConditionSelect = $<HTMLSelectElement>(
  "#weather-condition-select",
);
const audioPreset = $<HTMLSelectElement>("#audio-preset");
const radioChatterEnabledControl = $<HTMLInputElement>(
  "#radio-chatter-enabled",
);
const radioCaptionsEnabledControl = $<HTMLInputElement>(
  "#radio-captions-enabled",
);
const highStakesWeatherControl = $<HTMLInputElement>(
  "#high-stakes-weather-enabled",
);
const lightingModeSelect = $<HTMLSelectElement>("#lighting-mode-select");
const seasonModeSelect = $<HTMLSelectElement>("#season-mode-select");
const accessibilityPaletteSelect = $<HTMLSelectElement>(
  "#accessibility-palette-select",
);
const statusMessagePolicySelect = $<HTMLSelectElement>(
  "#status-message-policy-select",
);
const cameraDirectorEnabledControl = $<HTMLInputElement>(
  "#camera-director-enabled",
);
const cameraDirectorStatus = $<HTMLElement>("#camera-director-status");
const gamepadEnabledControl = $<HTMLInputElement>("#gamepad-enabled");
const gamepadSensitivityControl = $<HTMLInputElement>("#gamepad-sensitivity");
const gamepadSensitivityOutput = $<HTMLOutputElement>(
  "#gamepad-sensitivity-output",
);
const inputDevice = $<HTMLElement>("#input-device");
const inputStatus = $<HTMLElement>("#input-status");
const inputBindings = $<HTMLElement>("#input-bindings");
const status = $<HTMLElement>(".status");
const statusLabel = $<HTMLElement>("#status-label");
const statusDetail = $<HTMLElement>("#status-detail");
let statusTransition: Animation | null = null;
const statusMessages = new StatusMessageCoordinator(presentStatusMessage);
const radioCaption = $<HTMLElement>("#radio-caption");
const radioCaptionStation = $<HTMLElement>("#radio-caption-station");
const radioCaptionCopy = $<HTMLElement>("#radio-caption-copy");
const radioCaptions = new RadioCaptionCoordinator((caption) => {
  radioCaption.hidden = caption === null;
  if (!caption) return;
  radioCaptionStation.textContent = caption.station;
  radioCaptionCopy.textContent = caption.copy;
  radioCaption.dataset.priority = caption.priority;
  radioCaption.dataset.captionId = caption.id;
});
const landedCount = $<HTMLElement>("#landed-count");
const departedCount = $<HTMLElement>("#departed-count");
const shiftTime = $<HTMLElement>("#shift-time");
const routePath = $<SVGPathElement>("#route-path");
const routeShadow = $<SVGPathElement>("#route-shadow");
const telemetryPanel = $<HTMLElement>("#telemetry-panel");
const telemetryControls = $<HTMLElement>("#telemetry-controls");
const telemetryOutput = $<HTMLElement>("#telemetry-output");
const replayToggle = $<HTMLButtonElement>("#replay-toggle");
const replaySlider = $<HTMLInputElement>("#replay-slider");
const replayTime = $<HTMLOutputElement>("#replay-time");
const replayExport = $<HTMLButtonElement>("#replay-export");
const replayInspectorRoot = $<HTMLElement>("#replay-inspector");
const remoteHostEndpoint = $<HTMLInputElement>("#remote-host-endpoint");
const remoteHostSession = $<HTMLInputElement>("#remote-host-session");
const remoteHostToken = $<HTMLInputElement>("#remote-host-token");
const remoteHostConnect = $<HTMLButtonElement>("#remote-host-connect");
const remoteHostDisconnect = $<HTMLButtonElement>("#remote-host-disconnect");
const remoteHostState = $<HTMLElement>("#remote-host-state");
const remoteHostDetail = $<HTMLElement>("#remote-host-detail");
const liveDataRoot = $<HTMLElement>("#live-data-panel");
const captureRoot = $<HTMLElement>("#capture-panel");
const safetyScore = $<HTMLElement>("#safety-score");
const flightStrip = $<HTMLElement>("#flight-strip");
const flightStripToggle = $<HTMLButtonElement>("#flight-strip-toggle");
const flightStripTitle = $<HTMLElement>("#flight-strip-title");
const flightStripCount = $<HTMLElement>("#flight-strip-count");
const stationBriefing = $<HTMLElement>("#station-briefing");
const flightChips = $<HTMLElement>("#flight-chips");
const groupSelectToggle = $<HTMLButtonElement>("#group-select-toggle");
const groupSelectCount = $<HTMLElement>("#group-select-count");
const groupActions = $<HTMLElement>("#group-actions");
const coordinationInbox = $<HTMLElement>("#coordination-inbox");
const flightActions = $<HTMLElement>("#flight-actions");
const clearanceAdvisor = $<HTMLElement>("#clearance-advisor");
const clearanceAdvisorHeader = document.createElement("header");
const clearanceAdvisorIdentity = document.createElement("div");
const clearanceAdvisorTitle = document.createElement("b");
const clearanceAdvisorStation = document.createElement("small");
const clearanceAdvisorButton = document.createElement("button");
const clearanceAdvisorReason = document.createElement("p");
const clearanceAdvisorFlow = document.createElement("small");
clearanceAdvisorFlow.className = "clearance-advisor__flow";
clearanceAdvisorButton.type = "button";
clearanceAdvisorIdentity.append(clearanceAdvisorTitle, clearanceAdvisorStation);
clearanceAdvisorHeader.append(clearanceAdvisorIdentity, clearanceAdvisorButton);
clearanceAdvisor.replaceChildren(
  clearanceAdvisorHeader,
  clearanceAdvisorReason,
  clearanceAdvisorFlow,
);
const zoomInButton = $<HTMLButtonElement>("#zoom-in");
const zoomOutButton = $<HTMLButtonElement>("#zoom-out");
const cameraResetButton = $<HTMLButtonElement>("#camera-reset");
const touchCameraButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-touch-camera]"),
];
const runwayLabelButton = $<HTMLButtonElement>("#runway-label-toggle");
const runwayLabelLabel = $<HTMLElement>("#runway-label-label");
const mapOrientationToggle = $<HTMLInputElement>("#map-orientation-toggle");
const mapOrientation = $<HTMLElement>("#map-orientation");
const mapNorthArrow = $<HTMLElement>("#map-north-arrow");
const mapScaleLabel = $<HTMLElement>("#map-scale-label");
const mapScaleBar = $<HTMLElement>("#map-scale-bar");
const windOverlayToggle = $<HTMLInputElement>("#wind-overlay-toggle");
const windOverlay = $<HTMLElement>("#wind-overlay");
const windOverlayArrow = $<HTMLElement>("#wind-overlay-arrow");
const windOverlayHeading = $<HTMLElement>("#wind-overlay-heading");
const windOverlaySpeed = $<HTMLElement>("#wind-overlay-speed");
const serviceVehiclesToggle = $<HTMLInputElement>("#service-vehicles-toggle");
const airportLifeToggle = $<HTMLInputElement>("#airport-life-toggle");
const surfaceDisruptionKind = $<HTMLSelectElement>("#surface-disruption-kind");
const surfaceDisruptionTarget = $<HTMLSelectElement>(
  "#surface-disruption-target",
);
const surfaceDisruptionDuration = $<HTMLSelectElement>(
  "#surface-disruption-duration",
);
const surfaceDisruptionApply = $<HTMLButtonElement>(
  "#surface-disruption-apply",
);
const surfaceDisruptionList = $<HTMLElement>("#surface-disruption-list");
const operationsHealth = $<HTMLElement>("#operations-health");
const healthState = $<HTMLElement>("#health-state");
const healthThroughput = $<HTMLElement>("#health-throughput");
const healthConflicts = $<HTMLElement>("#health-conflicts");
const healthIncursions = $<HTMLElement>("#health-incursions");
const healthPauses = $<HTMLElement>("#health-pauses");
const healthHold = $<HTMLElement>("#health-hold");
const healthDelay = $<HTMLElement>("#health-delay");
const healthFps = $<HTMLElement>("#health-fps");
const debugPanel = $<HTMLElement>("#debug-panel");
const audioLevelControls = [
  ...document.querySelectorAll<HTMLInputElement>("[data-audio-level]"),
];
const surfaceLayerControls = [
  ...document.querySelectorAll<HTMLInputElement>("[data-surface-layer]"),
];
const airspaceLayerControls = [
  ...document.querySelectorAll<HTMLInputElement>("[data-airspace-layer]"),
];
const challengePanel = createChallengePanel({
  setup: challengeSetup,
  select: challengeSelect,
  setupNote: challengeSetupNote,
  startButton: challengeStart,
  lockedControls: [
    airportSelect,
    scenarioSelect,
    densitySelect,
    separationRulesSelect,
    weatherToggle,
    windToggle,
    weatherConditionSelect,
    runwayConfigurationSelect,
    dailyChallengeLoad,
    fieldButton,
    scopeButton,
  ],
  hud: challengeHud,
  title: challengeTitle,
  clock: challengeClock,
  grade: challengeGrade,
  status: challengeStatus,
  conditions: challengeConditions,
  objectiveDetails: challengeObjectiveDetails,
  objectiveList: challengeObjectives,
  primaryButton: challengePrimary,
  endButton: challengeEnd,
  results: challengeResults,
  resultEyebrow: challengeResultEyebrow,
  resultTitle: challengeResultTitle,
  resultGrade: challengeResultGrade,
  resultScore: challengeResultScore,
  resultReason: challengeResultReason,
  resultThroughput: challengeResultThroughput,
  resultDelay: challengeResultDelay,
  resultFuel: challengeResultFuel,
  resultSafety: challengeResultSafety,
  resultOperations: challengeResultOperations,
  resultEmergencies: challengeResultEmergencies,
  resultObjectives: challengeResultObjectives,
});
const sandboxPanel = createSandboxPanel({
  setup: sandboxSetup,
  toggle: sandboxToggle,
  background: sandboxBackground,
  direction: sandboxDirection,
  trafficClass: sandboxTrafficClass,
  runway: sandboxRunway,
  count: sandboxCount,
  inject: sandboxInject,
  cancel: sandboxCancel,
  clear: sandboxClear,
  status: sandboxStatus,
  detail: sandboxDetail,
  hud: sandboxHud,
  hudStatus: sandboxHudStatus,
});

let lastTime = performance.now();
let simulationAccumulator = 0;
// The deterministic harness and production runtime share a 20 Hz authority
// clock. Rendering interpolates between states at the display refresh rate, so
// pavement safety stays fixed-step without making every visual frame pay for a
// 60 Hz surface-graph/reservation pass.
const SIMULATION_STEP = 0.05;
const MAX_SIMULATION_TICKS_PER_FRAME = 3;
let audioUpdateIn = 0;
let lastHudSecond = -1;
let trainingCoachRenderKey = "";
let lastChallengeStatus: ChallengeSnapshot["status"] = "inactive";
let lastSandboxActive = false;
let lastArrivals = -1;
let lastDepartures = -1;
let hubIndex = 0;
let activeFlightId: number | null = null;
let routePoints: Array<{ x: number; y: number }> = [];
let simulationSpeed = 1;
let radarVisible = false;
let surfaceSafetyVisible = false;
let surfaceSafetyReturnFocus: HTMLElement | null = null;
let surfaceSafetyUiKey = "";
let surfaceSafetyFilterValue: SurfaceSafetyFilter = "all";
let surfaceSafetyLookaheadSeconds: SurfaceSafetyLookaheadSeconds = 30;
const surfaceSafetyDiagramLayers: SurfaceSafetyDiagramLayers = {
  ...DEFAULT_SURFACE_SAFETY_DIAGRAM_LAYERS,
};
const surfaceSafetyAdvisoryTracker = new SurfaceSafetyAdvisoryTracker();
const surfaceSafetyAcknowledgements = new SurfaceSafetyAcknowledgements();
const surfaceSafetyAnnouncements = new SurfaceSafetyAnnouncementTracker();
let queueInspectorVisible = false;
const compactOverlayMedia = window.matchMedia(
  "(max-width: 760px), (max-height: 520px)",
);
let queueInspectorFilter: OperationQueueFilter = "all";
let queueInspectorUiKey = "";
let digitalClearanceVisible = false;
let digitalClearanceUiKey = "";
let digitalClearanceView: DigitalClearancePanelView = "action";
let digitalClearanceComposerUiKey = "";
let digitalClearanceComposerFlightId: number | null = null;
let digitalClearanceReturnFocus: HTMLElement | null = null;
let windOverlayVisible = false;
let serviceVehiclesVisible = true;
let airportLifeVisible = false;
let accessibilityPalette: AccessibilityPalette = loadAccessibilityPalette();
const cameraDirector = new CameraDirector();
let cameraDirectorApplying = false;
const reducedMotionMedia = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
);
let telemetrySequence = 0;
let lastWeatherCondition: WeatherCondition | null = null;
let weatherSelection: "auto" | WeatherCondition = "auto";
let selectedAmbientProgramId: AmbientProgramId | null = null;
let runwayConfigurationOptionsKey = "";
let surfaceDisruptionUiKey = "";
let lastPredictionKey = "";
let replayIndex = -1;
let replayMode = false;
let pausedBeforeReplay = false;
let lastReplaySoundIndex = -1;
let importedReplay: ReplayRecording | null = null;
let replayVerification: ReplayVerificationResult | null = null;
let replayVerificationStale = false;
let replayBaselineIndex: number | null = null;
let replayComparison: ReplayStateComparison | null = null;
let radioChatterEnabled = true;
let radioCaptionsEnabled = true;
let highStakesWeatherEnabled = false;
let focusedFlightId: number | null = null;
let activeFocusRef: FocusTargetRef | null = null;
let activeFocusTarget: FocusTargetDescriptor | null = null;
let focusNavigatorUiKey = "";
let flightActionsRenderKey = "";
let groupSelectActive = false;
let groupActionsRenderKey = "";
let coordinationInboxRenderKey = "";
let stationBriefingRenderKey = "";
let controllerPerformanceCacheKey = "";
let controllerPerformanceCache: ControllerPerformanceSnapshot[] = [];
let controllerEvaluationCacheKey = "";
let controllerEvaluationCache: ControllerEvaluationSnapshot | null = null;
let lastControllerAlertKey = "";
let stationBriefingNodes: {
  station: ControllerStation;
  status: HTMLElement;
  score: HTMLElement;
  scope: HTMLElement;
  trafficScope: HTMLElement;
  authority: HTMLElement;
  objectives: Map<
    string,
    {
      item: HTMLElement;
      label: HTMLElement;
      value: HTMLElement;
      target: HTMLElement;
    }
  >;
  evaluation: ControllerEvaluationPanel;
  alerts: HTMLElement;
} | null = null;
const groupedFlightIds = new Set<number>();
let runwayLabelsVisible = false;
const surfaceLayerVisibility: Record<SurfaceLayer, boolean> = {
  "taxiway-labels": false,
  "operational-zones": false,
  hotspots: false,
  "airport-boundary": false,
  "protection-zones": false,
  "movement-projections": false,
};
const airspaceLayerVisibility: Record<AirspaceLayer, boolean> = {
  "airspace-sectors": false,
  "navigation-fixes": false,
  procedures: false,
  "flight-routes": false,
  separation: false,
};
let mapOrientationVisible = false;
let lastOrientationUpdate = -Infinity;
let lastRadarUpdate = -Infinity;
let previousPresentation = capturePresentation(simulation.state);
// The render adapter interpolates fixed-step authority at display rate. Keep
// that presentation data in a stable buffer: allocating a complete wrapped
// airport/flight/motion tree every frame becomes visible as GC hitches at busy
// hubs even though the underlying simulation is deterministic and cheap.
let presentationStateCache: typeof simulation.state | null = null;
let presentationStateSource: typeof simulation.state | null = null;
const presentationFlightCache = new Map<number, Flight>();
const presentationServiceVehicleCache = new Map<
  string,
  (typeof simulation.state.serviceVehicles)[number]
>();
const activePresentationFlightIds = new Set<number>();
const activePresentationServiceVehicleIds = new Set<string>();
let lastFlightStripRender = -Infinity;
let lastSurfaceSafetyRender = -Infinity;
let renderedFrames = 0;
let frameWindowStarted = performance.now();
let measuredFps = 0;
let adaptiveRenderDegraded = false;
let adaptiveRenderOverBudgetSeconds = 0;
let adaptiveRenderRecoverySeconds = 0;
let modalReturnFocus: HTMLElement | null = null;
let lastDebugSecond = -1;
const replayFrames: ReplayFrame[] = [];
const soundscapeEvents: SoundscapeEvent[] = [];
const telemetryEvents: TelemetryEvent[] = [];
const commandHistory: RecordedCommand[] = [];
let initialReplayState = cloneAirportState(simulation.state);
const airportChannel =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel(CONTROL_BROADCAST_CHANNEL);
const remoteControlHost: RemoteControlHost = new RemoteControlHost({
  snapshot: (): unknown => airportSnapshot(),
  dispatch: (envelope) => dispatchAirportControl(envelope),
  onStateChange: (state: RemoteControlHostState) =>
    updateRemoteControlHostUi(state),
});
const launchOptions = new URLSearchParams(window.location.search);
const requestedDailyDate = launchOptions.get("daily");
let requestedDailyPlan: DailyChallengePlan | null = null;
if (requestedDailyDate) {
  try {
    requestedDailyPlan = dailyChallengePlan(requestedDailyDate);
  } catch {
    requestedDailyPlan = null;
  }
}
const telemetryEnabled = launchOptions.get("telemetry") === "1";
const debugEnabled = launchOptions.get("debug") === "1";
let performancePanelVisible = debugEnabled;
const soakEnabled = launchOptions.get("soak") === "1";
const requestedLightingMode = launchOptions.get("lighting");
const requestedSeasonMode = launchOptions.get("season");
const requestedAccessibilityPalette = launchOptions.get("palette");
if (isEnvironmentLightingMode(requestedLightingMode))
  simulation.setEnvironmentLightingMode(requestedLightingMode);
if (isEnvironmentSeasonMode(requestedSeasonMode))
  simulation.setEnvironmentSeasonMode(requestedSeasonMode);
if (isAccessibilityPalette(requestedAccessibilityPalette))
  accessibilityPalette = requestedAccessibilityPalette;
applyAccessibilityPalette(accessibilityPalette);
if (launchOptions.get("director") === "1" && !reducedMotionMedia.matches)
  cameraDirector.setEnabled(true, performance.now() / 1_000);
const requestedRenderFps = Number(launchOptions.get("renderFps") ?? 0);
const minimumRenderInterval =
  Number.isFinite(requestedRenderFps) &&
  requestedRenderFps >= 0.1 &&
  requestedRenderFps < 60
    ? 1_000 / requestedRenderFps
    : 0;
let inputSettingsPanel: InputSettingsPanel | null = null;
let refreshInputSettings = (): void => {};
const requestedGamepadEnabled = launchOptions.get("gamepad");
const requestedGamepadSensitivity = Number(
  launchOptions.get("gamepadSensitivity"),
);
const focusNavigator: FocusNavigator = createFocusNavigator(
  {
    panel: focusPanel,
    toggle: focusToggle,
    close: focusClose,
    count: focusCount,
    kind: focusKind,
    target: focusTargetSelect,
    detail: focusDetail,
    previous: focusPrevious,
    apply: focusApply,
    next: focusNext,
    release: focusRelease,
    status: focusStatus,
    statusLabel: focusStatusLabel,
    statusDetail: focusStatusDetail,
    statusRelease: focusStatusRelease,
  },
  {
    onVisibilityChange: (visible) => {
      if (!visible) {
        canvas.focus({ preventScroll: true });
        return;
      }
      if (operationsLab.visible()) operationsLab.setVisible(false, false);
      if (queueInspectorVisible) setQueuePanelVisible(false);
      if (compactOverlayMedia.matches && radarVisible)
        setRadarPanelVisible(false);
    },
    onFocus: (target) => {
      const result = executeAirportRequest({ action: "focusTarget", target });
      setStatus(
        result.accepted ? "Observer focus engaged" : "Focus unavailable",
        result.reason,
      );
    },
    onRelease: () =>
      clearFlightFocus("Camera released", "free map view restored"),
  },
);
const operationsLab: OperationsLab = createOperationsLab(
  operationsLabPanel,
  operationsLabButton,
  {
    onVisibilityChange: (visible) => {
      if (!visible) {
        canvas.focus({ preventScroll: true });
        return;
      }
      setControlPanelOpen(false);
      focusNavigator.setVisible(false);
      if (radarVisible) setRadarPanelVisible(false);
      if (queueInspectorVisible) setQueuePanelVisible(false);
      renderOperationsLabSnapshot();
    },
    onFlightChange: (flightId) => renderOperationsLabSnapshot(flightId),
    onFocusFlight: (flightId) => {
      const result = executeAirportRequest({ action: "focusFlight", flightId });
      setStatus(
        result.accepted
          ? "Following recorder aircraft"
          : "Flight focus unavailable",
        result.reason,
      );
    },
    onExport: exportOperationsData,
  },
);
const replayInspector: ReplayInspector = createReplayInspector(
  replayInspectorRoot,
  {
    importFile: importReplayFile,
    useLiveBuffer: useLiveReplayBuffer,
    copySeedLink: copyReplaySeedLink,
    verify: verifyActiveReplay,
    share: shareActiveReplay,
    seek: seekReplayFrame,
    setBaseline: setReplayBaseline,
    compare: compareReplayBaseline,
  },
);
const liveDataCoordinator = new LiveDataCoordinator({
  storage: (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })(),
});
const liveDataPanel: LiveDataPanel = createLiveDataPanel(liveDataRoot, {
  coordinator: liveDataCoordinator,
  airportCode: () => config.code,
  applyMetar: applyLiveMetar,
  applySurfaceStatus: applyLiveSurfaceStatus,
  applyTraffic: applyLiveTraffic,
  announce: (label, detail, critical = false) =>
    setStatus(label, detail, critical ? "warning" : undefined),
});
let capturePanel: CapturePanel | null = null;
const localCapture = new LocalCapture(canvas, {
  onStateChange: (snapshot) => capturePanel?.render(snapshot),
});
capturePanel = createCapturePanel(captureRoot, {
  capture: localCapture,
  filenameBase: captureFilenameBase,
  beforeCleanView: prepareCleanSpectatorView,
  announce: (label, detail, warning = false) =>
    setStatus(label, detail, warning ? "warning" : undefined),
});
const communityPanel: CommunityPanel = createCommunityPanel(communityRoot, {
  currentUrl: window.location.href,
  plan: requestedDailyPlan ?? undefined,
  loadDailyChallenge: loadDailyChallenge,
  announce: (label, detail, warning = false) =>
    setStatus(label, detail, warning ? "warning" : undefined),
});
const inputLayer = createUnifiedInput({
  canvas,
  getContext: inputContext,
  resolvePointerIntent,
  onAction: handleInputAction,
  onAxes: handleInputAxes,
  onTap: (point) => selectFlightFromMap(point.x, point.y),
  onRouteStart: beginRoute,
  onRouteMove: updateRoute,
  onRouteEnd: finishRoute,
  onRouteCancel: cancelRoute,
  onCameraGestureStart: () => {
    yieldCameraDirector("Manual camera gesture");
    if (activeFocusRef !== null) clearFlightFocus();
  },
  onPan: (previous, current) => world.panBetweenScreenPoints(previous, current),
  onPinch: (previous, current) =>
    world.pinchBetweenScreenPoints(previous, current),
  onWheel: (point, deltaY) =>
    world.zoomAtScreenPoint(point.x, point.y, Math.exp(deltaY * 0.0014)),
  onStateChange: () => refreshInputSettings(),
  initialGamepadEnabled:
    requestedGamepadEnabled === "0"
      ? false
      : requestedGamepadEnabled === "1"
        ? true
        : undefined,
  initialGamepadSensitivity:
    Number.isFinite(requestedGamepadSensitivity) &&
    launchOptions.has("gamepadSensitivity")
      ? requestedGamepadSensitivity
      : undefined,
});
inputSettingsPanel = createInputSettingsPanel(
  {
    enabled: gamepadEnabledControl,
    sensitivity: gamepadSensitivityControl,
    sensitivityOutput: gamepadSensitivityOutput,
    device: inputDevice,
    status: inputStatus,
    bindings: inputBindings,
  },
  {
    onEnabledChange: (enabled) => inputLayer.setGamepadEnabled(enabled),
    onSensitivityChange: (sensitivity) =>
      inputLayer.setGamepadSensitivity(sensitivity),
  },
);
refreshInputSettings = () => inputSettingsPanel?.render(inputLayer.snapshot());
refreshInputSettings();
let lastWorldRender = -Infinity;
let worldDeltaAccumulator = 0;
updatePerformancePanelControl();
renderAmbientProgramOptions();
updateAirportUi();
updateNightControl();
updateCameraDirectorUi();
updateRadarControl();
updateSurfaceSafetyPanelControl();
updateQueueInspectorControl();
renderFocusNavigator(true);
compactOverlayMedia.addEventListener("change", (event) => {
  if (event.matches && focusNavigator.visible()) {
    if (radarVisible) setRadarPanelVisible(false);
    if (surfaceSafetyVisible) setSurfaceSafetyPanelVisible(false);
    if (queueInspectorVisible) setQueuePanelVisible(false);
  } else if (event.matches && radarVisible && queueInspectorVisible)
    setRadarPanelVisible(false);
});
renderQueueInspector();
updateSurfaceDisruptionTargets();
renderSurfaceDisruptionControls();
renderFlightStrip();
renderTrainingCoach(true);
renderChallengeExperience(true);
renderSandboxExperience(true);
setExclusiveModal(intro);
requestAnimationFrame(() => enterButton.focus());

function startShift(): void {
  setExclusiveModal(null);
  setControlPanelOpen(false);
  intro.classList.add("modal--hidden");
  simulation.setPaused(false);
  if (
    config.scope === "center" &&
    (simulation.state.mode === "auto" || simulation.state.mode === "watch")
  )
    setFlightStripCollapsed(true);
  canvas.focus({ preventScroll: true });
  setStatus(
    `${config.code === "LOCAL" ? config.name : config.code} control is open`,
    "the tower will guide each arrival",
  );
}

enterButton.addEventListener("click", startShift);
flightStripToggle.addEventListener("click", () => {
  setFlightStripCollapsed(
    !flightStrip.classList.contains("flight-strip--collapsed"),
  );
});
groupSelectToggle.addEventListener("click", () => {
  setGroupSelectActive(!groupSelectActive);
});
flightChips.addEventListener("click", (event) => {
  const chip = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-flight-chip]",
  );
  if (!chip) return;
  const flightId = Number(chip.dataset.flightChip);
  const flight = displayState().flights.find((item) => item.id === flightId);
  if (!flight) return;
  if (groupSelectActive) {
    toggleGroupFlightSelection(flight);
    return;
  }
  if (focusedFlightId === flightId) {
    executeAirportRequest({ action: "focusFlight", flightId: null });
    setStatus("Camera released", "free map view restored");
    return;
  }
  const result = executeAirportRequest({ action: "focusFlight", flightId });
  if (result.accepted)
    setStatus(
      `${flight.callsign} tracked`,
      `${flight.aircraft} · ${formatPhase(flight.phase)} · runway ${runwayDesignation(flight.runway)}`,
    );
});
groupActions.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button",
  );
  if (!button) return;
  if (button.dataset.groupAction === "clear") {
    groupedFlightIds.clear();
    renderFlightStrip();
    setStatus(
      "Group selection cleared",
      "choose aircraft that share one controller and control domain",
    );
    return;
  }
  const instruction = button.dataset.groupInstruction as
    GroupFlightInstruction | undefined;
  if (!instruction || groupedFlightIds.size < 2) return;
  const result = executeAirportRequest({
    action: "issueGroupInstruction",
    flightIds: [...groupedFlightIds],
    instruction,
  });
  if (result.accepted) setGroupSelectActive(false, false);
  else renderGroupActions();
});
coordinationInbox.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-coordination-action]",
  );
  if (!button) return;
  const flightId = Number(button.dataset.flight);
  const station = button.dataset.station as ControllerStation;
  const action = button.dataset.coordinationAction;
  if (action === "focus") {
    executeAirportRequest({ action: "focusFlight", flightId });
    return;
  }
  const result =
    action === "accept"
      ? executeAirportRequest({ action: "acceptHandoff", flightId })
      : action === "reject"
        ? executeAirportRequest({ action: "rejectHandoff", flightId })
        : action === "cancel"
          ? executeAirportRequest({ action: "cancelHandoff", flightId })
          : executeAirportRequest({
              action: "contactStation",
              flightId,
              station,
            });
  setStatus(
    result.accepted ? "Coordination updated" : "Coordination rejected",
    result.reason,
  );
  coordinationInboxRenderKey = "";
  renderFlightStrip();
});
flightActions.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-flight-action]",
  );
  if (!button || focusedFlightId === null) return;
  handleFlightAction(
    focusedFlightId,
    button.dataset.flightAction ?? "",
    button.dataset.runway,
    button.dataset.routeFixes,
    button.dataset.altitudeFt,
    button.dataset.speedKts,
  );
});
clearanceAdvisor.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-proposal-id]",
  );
  if (!button) return;
  const proposal = simulation
    .clearanceProposals()
    .find((item) => item.id === button.dataset.proposalId);
  if (proposal) applyClearanceProposal(proposal);
});

zoomInButton.addEventListener("click", () => {
  clearFlightFocus();
  world.zoomIn();
});
zoomOutButton.addEventListener("click", () => {
  clearFlightFocus();
  world.zoomOut();
});
cameraResetButton.addEventListener("click", () => {
  clearFlightFocus();
  world.resetCamera();
});
const touchCameraAxes: InputAxes = {
  panX: 0,
  panY: 0,
  rotate: 0,
  zoom: 0,
};
const touchCameraAxisByControl: Record<string, keyof InputAxes> = {
  "pan-up": "panY",
  "pan-down": "panY",
  "pan-left": "panX",
  "pan-right": "panX",
  "rotate-left": "rotate",
  "rotate-right": "rotate",
};
const touchCameraValueByControl: Record<string, number> = {
  "pan-up": -1,
  "pan-down": 1,
  "pan-left": -1,
  "pan-right": 1,
  "rotate-left": -1,
  "rotate-right": 1,
};
for (const button of touchCameraButtons) {
  const control = button.dataset.touchCamera ?? "";
  const axis = touchCameraAxisByControl[control];
  const value = touchCameraValueByControl[control];
  if (!axis || value === undefined) continue;
  const release = () => {
    touchCameraAxes[axis] = 0;
    button.classList.remove("touch-camera-controls__held");
  };
  button.addEventListener("pointerdown", (event) => {
    if (inputContext() !== "gameplay") return;
    event.preventDefault();
    yieldCameraDirector("Touch camera control");
    if (activeFocusRef !== null) clearFlightFocus();
    touchCameraAxes[axis] = value;
    button.classList.add("touch-camera-controls__held");
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable for some synthetic touch events.
    }
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}
runwayLabelButton.addEventListener("click", () =>
  setRunwayLabelsVisible(!runwayLabelsVisible),
);
for (const control of surfaceLayerControls) {
  control.addEventListener("change", () => {
    setSurfaceLayerVisible(
      control.dataset.surfaceLayer as SurfaceLayer,
      control.checked,
    );
  });
}
for (const control of airspaceLayerControls) {
  control.addEventListener("change", () => {
    setAirspaceLayerVisible(
      control.dataset.airspaceLayer as AirspaceLayer,
      control.checked,
    );
  });
}
mapOrientationToggle.addEventListener("change", () =>
  setMapOrientationVisible(mapOrientationToggle.checked),
);
windOverlayToggle.addEventListener("change", () =>
  setWindOverlayVisible(windOverlayToggle.checked),
);
serviceVehiclesToggle.addEventListener("change", () =>
  setServiceVehiclesVisible(serviceVehiclesToggle.checked),
);
airportLifeToggle.addEventListener("change", () =>
  setAirportLifeVisible(airportLifeToggle.checked),
);
lightingModeSelect.addEventListener("change", () => {
  if (!isEnvironmentLightingMode(lightingModeSelect.value)) return;
  clearAmbientProgramSelection();
  simulation.setEnvironmentLightingMode(lightingModeSelect.value);
  updateNightControl();
  setStatus(
    "Scene lighting updated",
    environmentLightingDescription(simulation.state.environment.lightingMode),
  );
});
seasonModeSelect.addEventListener("change", () => {
  if (!isEnvironmentSeasonMode(seasonModeSelect.value)) return;
  clearAmbientProgramSelection();
  simulation.setEnvironmentSeasonMode(seasonModeSelect.value);
  updateNightControl();
  setStatus(
    "Scene season updated",
    environmentSeasonDescription(simulation.state.environment.seasonMode),
  );
});
accessibilityPaletteSelect.addEventListener("change", () => {
  if (!isAccessibilityPalette(accessibilityPaletteSelect.value)) return;
  applyAccessibilityPalette(accessibilityPaletteSelect.value);
  const definition = accessibilityPaletteDefinition(accessibilityPalette);
  setStatus(`${definition.label} palette active`, definition.description);
});
statusMessagePolicySelect.addEventListener("change", () => {
  const policy = statusMessagePolicySelect.value as StatusMessagePolicy;
  if (!["off", "advisory", "operational", "rare-high"].includes(policy)) return;
  setStatusMessagePolicy(policy);
  setStatus(
    "Alert policy updated",
    statusMessagePolicySelect.selectedOptions[0]?.textContent ?? policy,
  );
});
cameraDirectorEnabledControl.addEventListener("change", () => {
  const accepted = setCameraDirectorEnabled(
    cameraDirectorEnabledControl.checked,
  );
  setStatus(
    accepted
      ? cameraDirectorEnabledControl.checked
        ? "Camera director enabled"
        : "Camera director disabled"
      : "Camera director unavailable",
    accepted
      ? cameraDirector.snapshot(performance.now() / 1_000).reason
      : "Reduced-motion preference keeps automatic camera movement off",
  );
});
reducedMotionMedia.addEventListener("change", () => {
  if (reducedMotionMedia.matches)
    setCameraDirectorEnabled(false, "Reduced-motion preference");
  updateCameraDirectorUi();
});
menuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  setControlPanelOpen(!controlPanel.classList.contains("control-panel--open"));
});
document.addEventListener("pointerdown", (event) => {
  if (!controlPanel.classList.contains("control-panel--open")) return;
  const target = event.target;
  if (
    target instanceof Node &&
    !controlPanel.contains(target) &&
    !menuButton.contains(target)
  )
    setControlPanelOpen(false);
});
function modalOpen(element: HTMLElement): boolean {
  return !element.hidden && !element.classList.contains("modal--hidden");
}

function inputContext(): InputActionContext {
  if (modalOpen(intro) || modalOpen(gameOver) || modalOpen(challengeResults))
    return "modal";
  if (
    controlPanel.classList.contains("control-panel--open") ||
    focusNavigator.visible() ||
    operationsLab.visible()
  )
    return "ui";
  return "gameplay";
}

function handleInputAxes(axes: InputAxes, deltaSeconds: number): void {
  const movingCamera =
    Math.abs(axes.panX) +
      Math.abs(axes.panY) +
      Math.abs(axes.rotate) +
      Math.abs(axes.zoom) >
    0.001;
  if (movingCamera) {
    yieldCameraDirector("Manual camera input");
    if (activeFocusRef !== null) clearFlightFocus();
  }
  world.applyCameraInput(
    axes.panX,
    axes.panY,
    axes.rotate,
    axes.zoom,
    deltaSeconds,
  );
}

function focusAdjacentFlight(direction: -1 | 1): void {
  const flights = visibleFlightsForStation(displayState().flights).sort(
    (first, second) =>
      FLIGHT_PHASE_ORDER[first.phase] - FLIGHT_PHASE_ORDER[second.phase] ||
      first.id - second.id,
  );
  if (!flights.length) {
    clearFlightFocus(
      "No aircraft in scope",
      `${controllerStationLabel(simulation.state.station)} has no visible tracks`,
    );
    return;
  }
  const current = flights.findIndex((flight) => flight.id === focusedFlightId);
  const index =
    current < 0
      ? direction > 0
        ? 0
        : flights.length - 1
      : (current + direction + flights.length) % flights.length;
  const flight = flights[index];
  const result = executeAirportRequest({
    action: "focusFlight",
    flightId: flight.id,
  });
  if (result.accepted)
    setStatus(
      `${flight.callsign} tracked`,
      `${flight.aircraft} · ${formatPhase(flight.phase)} · ${index + 1} of ${flights.length}`,
    );
}

function handleInputAction(action: InputActionId): void {
  if (action === "ui.cancel") {
    if (operationsLab.visible()) {
      operationsLab.setVisible(false);
      return;
    }
    if (controlPanel.classList.contains("control-panel--open")) {
      setControlPanelOpen(false);
      canvas.focus({ preventScroll: true });
      return;
    }
    if (focusNavigator.visible()) {
      focusNavigator.setVisible(false);
      return;
    }
    if (queueInspectorVisible) {
      setQueuePanelVisible(false);
      return;
    }
    if (radarVisible) {
      setRadarPanelVisible(false);
      return;
    }
    if (groupSelectActive) {
      setGroupSelectActive(false);
      return;
    }
    if (activeFocusRef !== null)
      clearFlightFocus("Camera released", "free map view restored");
    return;
  }
  if (action === "ui.controls") {
    setControlPanelOpen(
      !controlPanel.classList.contains("control-panel--open"),
    );
    return;
  }
  if (action === "ui.pause") {
    pauseButton.click();
    return;
  }
  if (action === "ui.radar") {
    setRadarPanelVisible(!radarVisible);
    return;
  }
  if (action === "ui.queues") {
    setQueuePanelVisible(!queueInspectorVisible);
    return;
  }
  if (action === "ui.focus") {
    focusNavigator.setVisible(!focusNavigator.visible());
    return;
  }
  if (action === "camera.reset") {
    clearFlightFocus();
    world.resetCamera();
    return;
  }
  if (action === "camera.next-view") {
    clearFlightFocus();
    world.nextView();
    return;
  }
  if (action === "selection.previous" || action === "selection.next") {
    focusAdjacentFlight(action === "selection.previous" ? -1 : 1);
    return;
  }
  if (action === "selection.primary") {
    const primary = flightActions.querySelector<HTMLButtonElement>(
      ".flight-actions__buttons button:not(:disabled)",
    );
    if (primary) primary.click();
    else if (focusedFlightId === null) focusAdjacentFlight(1);
    return;
  }
  if (focusedFlightId === null) return;
  if (action === "flight.land") handleFlightAction(focusedFlightId, "clear");
  if (action === "flight.go-around")
    handleFlightAction(focusedFlightId, "go-around");
  if (action === "flight.hold")
    handleFlightAction(focusedFlightId, "hold-toggle");
  if (action === "flight.runway-entry")
    handleFlightAction(focusedFlightId, "entry");
  if (action === "flight.takeoff")
    handleFlightAction(focusedFlightId, "takeoff");
}

function resolvePointerIntent(
  point: ScreenPoint,
  _device: "mouse" | "touch",
  button: number,
): CanvasPointerIntent {
  if (
    button === 1 ||
    replayMode ||
    simulation.state.paused ||
    simulation.state.gameOver
  )
    return { kind: "camera" };
  const flightId = world.pickFlight(point.x, point.y);
  const flight = simulation.state.flights.find(
    (candidate) => candidate.id === flightId,
  );
  return flight?.phase === "approach" && !flight.cleared
    ? { kind: "route", flightId: flight.id }
    : { kind: "camera" };
}

airportSelect.addEventListener("change", () =>
  selectAirport(airportSelect.value, false),
);
introAirportSelect.addEventListener("change", () =>
  selectAirport(introAirportSelect.value, true),
);
controlSelect.addEventListener("change", () =>
  selectControl(controlSelect.value as ControlMode),
);
scenarioSelect.addEventListener("change", () =>
  setScenario(scenarioSelect.value as TrafficScenario),
);
densitySelect.addEventListener("change", () =>
  setTrafficDensity(densitySelect.value as TrafficDensity),
);
separationRulesSelect.addEventListener("change", () =>
  setSeparationRules(separationRulesSelect.value as SeparationRulesetId),
);
stationSelect.addEventListener("change", () =>
  executeAirportRequest({
    action: "setStation",
    station: stationSelect.value as ControllerStation,
  }),
);
controllerPolicySelect.addEventListener("change", () => {
  const result = executeAirportRequest({
    action: "setControllerPolicyPreset",
    preset: controllerPolicySelect.value as ControllerPolicyPresetId,
  });
  updateStationAutomationUi();
  setStatus(
    result.accepted
      ? "Controller policy updated"
      : "Controller policy unchanged",
    result.reason,
  );
});
trainingStart.addEventListener("click", () => {
  const result = executeAirportRequest({
    action: "startTrainingLesson",
    lessonId: trainingLessonSelect.value as TrainingLessonId,
  });
  setStatus(
    result.accepted ? "Training lesson ready" : "Training could not start",
    result.reason,
  );
});
trainingHint.addEventListener("click", () => {
  const result = executeAirportRequest({ action: "trainingHint" });
  if (result.accepted) trainingExplanation.open = true;
});
trainingContinue.addEventListener("click", () =>
  executeAirportRequest({
    action:
      simulation.state.training.status === "active"
        ? "pause"
        : "continueTraining",
  }),
);
trainingRetry.addEventListener("click", () =>
  executeAirportRequest({ action: "retryTrainingStep" }),
);
trainingSkip.addEventListener("click", () =>
  executeAirportRequest({ action: "skipTrainingStep" }),
);
trainingEnd.addEventListener("click", () =>
  executeAirportRequest({ action: "stopTrainingLesson" }),
);
challengeSelect.addEventListener("change", () =>
  renderChallengeExperience(true),
);
challengeStart.addEventListener("click", () => {
  const result = executeAirportRequest({
    action: "startChallenge",
    challengeId: challengeSelect.value as ChallengeId,
  });
  if (result.accepted) setControlPanelOpen(false);
  setStatus(
    result.accepted ? "Challenge briefing ready" : "Challenge could not start",
    result.reason,
  );
});
challengePrimary.addEventListener("click", () => {
  const result = executeAirportRequest({ action: "beginChallenge" });
  setStatus(
    result.accepted ? "Challenge clock started" : "Challenge remains paused",
    result.reason,
  );
});
challengeEnd.addEventListener("click", () =>
  executeAirportRequest({ action: "endChallenge" }),
);
challengeRetry.addEventListener("click", () => {
  const challengeId = simulation.state.challenge.challengeId;
  if (challengeId)
    executeAirportRequest({ action: "startChallenge", challengeId });
});
challengeContinue.addEventListener("click", () =>
  executeAirportRequest({ action: "continueAfterChallenge" }),
);
sandboxToggle.addEventListener("click", () => {
  const action: AirportControlCommand = simulation.state.sandbox.active
    ? { action: "stopSandbox" }
    : { action: "startSandbox", backgroundTraffic: sandboxBackground.checked };
  const result = executeAirportRequest(action);
  setStatus(
    result.accepted
      ? simulation.state.sandbox.active
        ? "Sandbox ready"
        : "Sandbox closed"
      : "Sandbox unchanged",
    result.reason,
  );
});
sandboxBackground.addEventListener("change", () => {
  const result = executeAirportRequest({
    action: "setSandboxBackgroundTraffic",
    enabled: sandboxBackground.checked,
  });
  setStatus(
    result.accepted ? "Sandbox demand updated" : "Sandbox demand unchanged",
    result.reason,
  );
});
sandboxInject.addEventListener("click", () => {
  const runwayId =
    sandboxRunway.value === "auto" ? null : Number(sandboxRunway.value);
  const result = executeAirportRequest({
    action: "injectSandboxTraffic",
    direction: sandboxDirection.value as SandboxTrafficDirection,
    trafficClass: sandboxTrafficClass.value as SandboxTrafficClass,
    runwayId,
    count: Number(sandboxCount.value),
  });
  setStatus(
    result.accepted ? "Sandbox traffic queued" : "Traffic request rejected",
    result.reason,
  );
});
sandboxCancel.addEventListener("click", () => {
  const result = executeAirportRequest({ action: "cancelSandboxInjections" });
  setStatus(
    result.accepted ? "Sandbox queue cancelled" : "Sandbox queue unchanged",
    result.reason,
  );
});
sandboxClear.addEventListener("click", () => {
  const result = executeAirportRequest({ action: "clearSandboxTraffic" });
  if (result.accepted) clearFlightFocus();
  setStatus(
    result.accepted ? "Sandbox board cleared" : "Sandbox board unchanged",
    result.reason,
  );
});
for (const control of stationAutomationControls) {
  control.addEventListener("change", () => {
    const station = control.dataset.stationAutomation;
    if (
      !station ||
      !OPERATIONAL_CONTROLLER_STATIONS.includes(
        station as OperationalControllerStation,
      )
    )
      return;
    const result = executeAirportRequest({
      action: "setStationAutomation",
      station: station as OperationalControllerStation,
      enabled: control.checked,
    });
    updateStationAutomationUi();
    setStatus(
      result.accepted
        ? `${controllerStationLabel(station as OperationalControllerStation)} automation updated`
        : "Automation unchanged",
      result.reason,
    );
  });
}
for (const control of stationWorkloadControls) {
  control.addEventListener("click", () => {
    const station = control.dataset.stationWorkload;
    if (
      !station ||
      !OPERATIONAL_CONTROLLER_STATIONS.includes(
        station as OperationalControllerStation,
      )
    )
      return;
    executeAirportRequest({
      action: "setStation",
      station: station as OperationalControllerStation,
    });
  });
}
introControlSelect.addEventListener("change", () =>
  selectControl(introControlSelect.value as ControlMode),
);
introDensitySelect.addEventListener("change", () => {
  const density = introDensitySelect.value as TrafficDensity;
  if (!setTrafficDensity(density)) return;
  newSession(true, config);
  setStatus(
    `${trafficDensityProfile(density).label} traffic selected`,
    "the opening bank has been rebuilt at this density",
  );
});
introSeparationRulesSelect.addEventListener("change", () =>
  setSeparationRules(introSeparationRulesSelect.value as SeparationRulesetId),
);
speedControl.addEventListener("input", () =>
  setSimulationSpeed(Number(speedControl.value)),
);
weatherToggle.addEventListener("click", () => {
  clearAmbientProgramSelection();
  const enabling = !simulation.state.weather.weatherEnabled;
  if (!enabling || weatherSelection === "auto")
    simulation.setWeatherEnabled(enabling);
  else {
    const preserveWindOff = !simulation.state.weather.windEnabled;
    simulation.setWeather(
      weatherSelection,
      simulation.state.weather.windDirection,
      Math.max(4, simulation.state.weather.windSpeed || 12),
    );
    if (preserveWindOff) simulation.setWindEnabled(false);
  }
  updateWeatherUi();
});
weatherConditionSelect.addEventListener("change", () => {
  clearAmbientProgramSelection();
  const selection = weatherConditionSelect.value as "auto" | WeatherCondition;
  weatherSelection = selection;
  if (selection === "auto") simulation.setWeatherEnabled(true);
  else {
    const preserveWindOff = !simulation.state.weather.windEnabled;
    simulation.setWeather(
      selection,
      simulation.state.weather.windDirection,
      Math.max(4, simulation.state.weather.windSpeed || 12),
    );
    if (preserveWindOff) simulation.setWindEnabled(false);
  }
  updateWeatherUi();
  renderFlightStrip();
});
windToggle.addEventListener("click", () => {
  clearAmbientProgramSelection();
  simulation.setWindEnabled(!simulation.state.weather.windEnabled);
  updateWeatherUi();
});
atisButton.addEventListener("click", () => {
  const briefing = createAtisBriefing(displayState(), config);
  if (radioCaptionsEnabled) {
    radioCaptions.enqueue({
      id: briefing.id,
      station: briefing.station,
      copy: briefing.copy,
      priority: "ambient",
      dwellMs: 12_000,
    });
  }
  audio.play({
    schemaVersion: 1,
    id: `${briefing.id}-cue`,
    sequence: 0,
    elapsed: displayState().elapsed,
    kind: "radio-clearance",
    channel: "radio",
    priority: "ambient",
    variant: 0,
    caption: briefing.copy,
    sourceEventType: "atis:modeled-briefing",
  });
  setStatus(
    radioCaptionsEnabled ? briefing.headline : "ATIS summary",
    radioCaptionsEnabled
      ? "modeled fictional briefing shown in captions"
      : briefing.summary,
  );
});
ambientProgramSelect.addEventListener("change", () => {
  const id = ambientProgramSelect.value;
  if (!id) {
    selectedAmbientProgramId = null;
    return;
  }
  if (!AMBIENT_PROGRAM_IDS.includes(id as AmbientProgramId)) return;
  const result = executeAirportRequest({
    action: "applyAmbientProgram",
    id: id as AmbientProgramId,
  });
  if (!result.accepted) {
    ambientProgramSelect.value = selectedAmbientProgramId ?? "";
    setStatus("Watch scene unchanged", result.reason);
    return;
  }
  selectedAmbientProgramId = id as AmbientProgramId;
  const program = AMBIENT_PROGRAMS[selectedAmbientProgramId];
  updateWeatherUi();
  setStatus(`${program.label} active`, program.description);
});
watchPresetSave.addEventListener("click", () => {
  const saved = saveWatchPreset(windowStorage(), currentWatchPreset());
  setStatus(
    saved ? "Watch preset saved" : "Watch preset unavailable",
    saved
      ? "saved locally: no traffic, flight identity, controller, or replay data"
      : "this browser does not permit local preference storage",
  );
});
watchPresetRestore.addEventListener("click", () => restoreWatchPreset());
runwayConfigurationSelect.addEventListener("change", () => {
  const requested =
    runwayConfigurationSelect.value === "auto"
      ? null
      : runwayConfigurationSelect.value;
  const accepted = simulation.setRunwayConfiguration(requested);
  const reason = simulation.lastCommandReason();
  updateWeatherUi();
  setStatus(accepted ? "Runway plan accepted" : "Runway plan rejected", reason);
});
audioPreset.addEventListener("change", () =>
  audio.setPreset(audioPreset.value as AudioPreset),
);
radioChatterEnabledControl.addEventListener("change", () => {
  radioChatterEnabled = radioChatterEnabledControl.checked;
  audio.setRadioEnabled(radioChatterEnabled);
});
radioCaptionsEnabledControl.addEventListener("change", () => {
  radioCaptionsEnabled = radioCaptionsEnabledControl.checked;
  audio.setCaptionsEnabled(radioCaptionsEnabled);
  if (!radioCaptionsEnabled) radioCaptions.reset();
});
highStakesWeatherControl.addEventListener("change", () => {
  const requested = highStakesWeatherControl.checked;
  const accepted = simulation.setWeatherHazardsEnabled(requested);
  highStakesWeatherEnabled = simulation.state.weather.hazardsEnabled;
  highStakesWeatherControl.checked = highStakesWeatherEnabled;
  soundscape.setHighStakesWeatherEnabled(highStakesWeatherEnabled);
  setStatus(
    accepted
      ? `Rare severe weather ${requested ? "enabled" : "disabled"}`
      : "Weather setting unchanged",
    simulation.lastCommandReason(),
  );
  updateWeatherUi();
});
for (const control of audioLevelControls) {
  control.addEventListener("input", () =>
    audio.setLevel(
      control.dataset.audioLevel as AudioChannel,
      Number(control.value),
    ),
  );
}

surfaceDisruptionKind.addEventListener("change", () => {
  updateSurfaceDisruptionTargets();
  renderSurfaceDisruptionControls();
});
surfaceDisruptionApply.addEventListener("click", () => {
  const selectedIncident = surfaceIncidentDefinition(
    surfaceDisruptionKind.value,
  );
  const result = executeAirportRequest({
    ...(selectedIncident
      ? {
          action: "triggerSurfaceIncident" as const,
          kind: surfaceDisruptionKind.value as
            "runway-inspection" | "bird-activity" | "foreign-object-debris",
          targetId: surfaceDisruptionTarget.value,
        }
      : {
          action: "setSurfaceDisruption" as const,
          kind: surfaceDisruptionKind.value as Exclude<
            SurfaceDisruptionKind,
            "disabled-aircraft"
          >,
          targetId: surfaceDisruptionTarget.value,
          enabled: true,
          durationSeconds: Number(surfaceDisruptionDuration.value) || undefined,
        }),
  });
  surfaceDisruptionUiKey = "";
  renderSurfaceDisruptionControls();
  setStatus(
    result.accepted
      ? selectedIncident
        ? "Incident response dispatched"
        : "Surface restriction active"
      : "Surface restriction rejected",
    result.reason,
  );
});
surfaceDisruptionList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button",
  );
  if (!button) return;
  const result = button.dataset.recoverFlight
    ? executeAirportRequest({
        action: "recoverDisabledAircraft",
        flightId: Number(button.dataset.recoverFlight),
      })
    : executeAirportRequest({
        action: "clearSurfaceDisruption",
        disruptionId: button.dataset.clearDisruption ?? "",
      });
  surfaceDisruptionUiKey = "";
  renderSurfaceDisruptionControls();
  setStatus(
    result.accepted
      ? "Surface operation accepted"
      : "Surface operation rejected",
    result.reason,
  );
});

replayToggle.addEventListener("click", () => {
  const frames = replayPlaybackFrames();
  replayMode = !replayMode;
  replayToggle.setAttribute("aria-pressed", String(replayMode));
  replayToggle.textContent = replayMode ? "Live" : "Replay";
  replaySlider.disabled = !replayMode || frames.length === 0;
  if (!replayMode) {
    replayIndex = -1;
    lastReplaySoundIndex = -1;
    radioCaptions.reset();
    simulation.setPaused(pausedBeforeReplay);
  } else {
    pausedBeforeReplay = simulation.state.paused;
    simulation.setPaused(true);
    replayIndex = Math.max(0, frames.length - 1);
    lastReplaySoundIndex = -1;
    playReplaySoundFrame();
  }
  updateReplayUi();
  renderFlightStrip();
  renderFlightActions();
});
replaySlider.addEventListener("input", () => {
  replayIndex = Number(replaySlider.value);
  playReplaySoundFrame();
  updateReplayUi();
  renderFlightStrip();
  renderFlightActions();
});
replayExport.addEventListener("click", () => {
  replayExport.disabled = true;
  setStatus(
    "Preparing replay",
    "fingerprinting frames without blocking simulation updates",
  );
  void activeReplayRecordingAsync()
    .then(downloadReplayRecording)
    .catch((error: unknown) =>
      setStatus(
        "Replay export failed",
        error instanceof Error ? error.message : "Unable to prepare replay.",
        "critical",
      ),
    )
    .finally(() => {
      replayExport.disabled = false;
    });
});

remoteHostConnect.addEventListener("click", () => {
  remoteHostConnect.disabled = true;
  void remoteControlHost
    .connect({
      endpoint: remoteHostEndpoint.value,
      sessionId: remoteHostSession.value,
      token: remoteHostToken.value,
    })
    .then((state) => {
      remoteHostToken.value = "";
      setStatus(
        "Remote host connected",
        `${state.sessionId} · external commands remain inside the shared safety arbiter`,
      );
    })
    .catch((error: unknown) => {
      const reason =
        error instanceof Error
          ? error.message
          : "The remote gateway connection failed.";
      setStatus("Remote host rejected", reason);
    });
});
remoteHostDisconnect.addEventListener("click", () => {
  remoteControlHost.disconnect();
  remoteHostToken.value = "";
  setStatus(
    "Remote host disconnected",
    "local and deterministic Auto control remain available",
  );
});

soundButton.addEventListener("click", async () => {
  const enabled = await audio.toggle();
  soundButton.setAttribute("aria-pressed", String(enabled));
  soundButton.classList.toggle("control--active", enabled);
});

pauseButton.addEventListener("click", () => {
  if (simulation.state.gameOver) return;
  const paused = !simulation.state.paused;
  executeAirportRequest({ action: paused ? "pause" : "resume" });
  updatePauseControl();
  setStatus(
    paused ? "Shift paused" : "Shift resumed",
    paused ? "the airspace is holding" : "traffic is moving again",
  );
});

viewButton.addEventListener("click", () => {
  clearFlightFocus();
  world.nextView();
});
fieldButton.addEventListener("click", () => {
  if (config.scope === "center") {
    hubIndex = (hubIndex + 1) % HUB_AIRPORTS.length;
    newSession(false, generateHubConfig(hubIndex));
  } else {
    newSession(false, generateAirportConfig());
  }
  setStatus(
    `${config.code === "LOCAL" ? config.name : config.code} is open`,
    trafficDescription(),
  );
});
scopeButton.addEventListener("click", () => {
  const enterCenter = config.scope === "airfield";
  newSession(
    false,
    enterCenter ? generateHubConfig(hubIndex) : generateAirportConfig(),
  );
  setStatus(
    enterCenter
      ? `${config.code} center scope`
      : `${config.name} airfield scope`,
    enterCenter ? trafficDescription() : "close view · local traffic",
  );
});
modeButton.addEventListener("click", () => {
  const modes: ControlMode[] = ["auto", "assisted", "manual", "watch"];
  const mode = modes[(modes.indexOf(simulation.state.mode) + 1) % modes.length];
  simulation.setMode(mode);
  updateModeControl();
  setStatus(modeName(mode), modeDescription(mode));
});
nightButton.addEventListener("click", () => {
  clearAmbientProgramSelection();
  const modes: EnvironmentLightingMode[] = ["automatic", "night", "day"];
  const current = simulation.state.environment.lightingMode;
  const mode = modes[(modes.indexOf(current) + 1) % modes.length];
  simulation.setEnvironmentLightingMode(mode);
  updateNightControl();
  setStatus(
    `${mode === "automatic" ? "Automatic" : mode === "night" ? "Night" : "Day"} lighting active`,
    environmentLightingDescription(mode),
  );
});
radarButton.addEventListener("click", () => {
  setRadarPanelVisible(!radarVisible);
  setStatus(
    radarVisible ? "Terminal radar open" : "Terminal radar closed",
    radarVisible
      ? "live aircraft and runway plot enabled"
      : "unobstructed map view restored",
  );
});

radarClose.addEventListener("click", () => {
  setRadarPanelVisible(false);
  setStatus("Terminal radar closed", "unobstructed map view restored");
});

surfaceSafetyButton.addEventListener("click", () => {
  setSurfaceSafetyPanelVisible(!surfaceSafetyVisible);
  setStatus(
    surfaceSafetyVisible ? "Surface safety open" : "Surface safety closed",
    surfaceSafetyVisible
      ? "authoritative movement-area tracks and forecasts enabled"
      : "unobstructed map view restored",
  );
});

surfaceSafetyClose.addEventListener("click", () => {
  setSurfaceSafetyPanelVisible(false);
  setStatus("Surface safety closed", "unobstructed map view restored");
});

surfaceSafetyFilter.addEventListener("change", () => {
  surfaceSafetyFilterValue = surfaceSafetyFilter.value as SurfaceSafetyFilter;
  surfaceSafetyUiKey = "";
  if (surfaceSafetyVisible) renderSurfaceSafety();
});

surfaceSafetyLookahead.addEventListener("change", () => {
  setSurfaceSafetyLookahead(Number(surfaceSafetyLookahead.value));
});

for (const [layer, input] of Object.entries(surfaceSafetyLayerInputs) as Array<
  [SurfaceSafetyDiagramLayer, HTMLInputElement]
>) {
  input.addEventListener("change", () => {
    setSurfaceSafetyDiagramLayer(layer, input.checked);
  });
}

surfaceSafetyTracks.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-flight-id]",
  );
  if (!button) return;
  const flightId = Number(button.dataset.flightId);
  if (!Number.isFinite(flightId)) return;
  const result = focusObserverTarget(
    { kind: "flight", id: String(flightId) },
    false,
  );
  if (result.accepted) setStatus("Surface track selected", result.reason);
});

surfaceSafetyAdvisories.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-advisory-id]",
  );
  if (!button) return;
  const result = executeAirportRequest({
    action: "acknowledgeSurfaceAdvisory",
    advisoryId: button.dataset.advisoryId ?? "",
  });
  setStatus(
    result.accepted
      ? "Surface advisory acknowledged"
      : "Acknowledgement refused",
    result.reason,
  );
});

queueButton.addEventListener("click", () => {
  setQueuePanelVisible(!queueInspectorVisible);
  setStatus(
    queueInspectorVisible ? "Operation queues open" : "Operation queues closed",
    queueInspectorVisible
      ? "live blockers and downstream dependencies explained"
      : "unobstructed map view restored",
  );
});

queueClose.addEventListener("click", () => {
  setQueuePanelVisible(false);
  setStatus("Operation queues closed", "unobstructed map view restored");
});

digitalClearanceButton.addEventListener("click", () => {
  if (!digitalClearanceVisible && document.activeElement instanceof HTMLElement)
    digitalClearanceReturnFocus = document.activeElement;
  setDigitalClearancePanelVisible(!digitalClearanceVisible);
});
digitalClearanceClose.addEventListener("click", () => {
  setDigitalClearancePanelVisible(false);
  digitalClearanceReturnFocus?.focus({ preventScroll: true });
  digitalClearanceReturnFocus = null;
});
digitalClearanceViews.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-digital-clearance-view]",
  );
  const view = button?.dataset.digitalClearanceView;
  if (!view || !isDigitalClearancePanelView(view)) return;
  digitalClearanceView = view;
  digitalClearanceUiKey = "";
  renderDigitalClearanceMessages();
});
digitalClearanceList.addEventListener("click", (event) => {
  const row = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-clearance-flight-id]",
  );
  if (!row) return;
  const flightId = Number(row.dataset.clearanceFlightId);
  if (!Number.isFinite(flightId)) return;
  const result = focusObserverTarget({ kind: "flight", id: String(flightId) });
  if (!result.accepted) {
    setStatus("Clearance message unavailable", result.reason, "warning");
    return;
  }
  digitalClearanceComposerFlightId = flightId;
  digitalClearanceComposerUiKey = "";
  renderDigitalClearanceMessages();
  setStatus("Clearance message selected", result.reason);
});
digitalClearanceFlight.addEventListener("change", () => {
  const flightId = Number(digitalClearanceFlight.value);
  digitalClearanceComposerFlightId = Number.isInteger(flightId)
    ? flightId
    : null;
  digitalClearanceAltitude.value = "";
  digitalClearanceSpeed.value = "";
  digitalClearanceComposerUiKey = "";
  renderDigitalClearanceMessages();
});
digitalClearanceComposer.addEventListener("submit", (event) => {
  event.preventDefault();
  const selection = readDigitalClearanceComposer(digitalClearanceElements());
  if (!selection) {
    setStatus(
      "Clearance preview unavailable",
      "select an eligible flight and published route",
      "warning",
    );
    return;
  }
  digitalClearanceComposerFlightId = selection.flightId;
  const compound =
    selection.altitudeFt !== undefined || selection.speedKts !== undefined;
  const result = executeAirportRequest(
    compound
      ? {
          action: "previewCompoundClearance",
          flightId: selection.flightId,
          fixIds: selection.fixIds,
          ...(selection.altitudeFt === undefined
            ? {}
            : { altitudeFt: selection.altitudeFt }),
          ...(selection.speedKts === undefined
            ? {}
            : { speedKts: selection.speedKts }),
        }
      : {
          action: "previewRoute",
          flightId: selection.flightId,
          fixIds: selection.fixIds,
        },
  );
  setStatus(
    result.accepted ? "Clearance preview ready" : "Clearance preview rejected",
    result.reason,
    result.accepted ? "operational" : "warning",
  );
  digitalClearanceComposerUiKey = "";
  digitalClearanceUiKey = "";
  renderDigitalClearanceMessages();
  renderFlightActions();
});
digitalClearanceIssue.addEventListener("click", () => {
  const flightId = Number(digitalClearanceFlight.value);
  if (!Number.isInteger(flightId)) return;
  const result = executeAirportRequest({
    action: "issueRouteAmendment",
    flightId,
  });
  setStatus(
    result.accepted ? "Digital clearance sent" : "Clearance send rejected",
    result.reason,
    result.accepted ? "operational" : "warning",
  );
  digitalClearanceComposerUiKey = "";
  digitalClearanceUiKey = "";
  renderDigitalClearanceMessages();
  renderFlightActions();
});
digitalClearanceCancel.addEventListener("click", () => {
  const flightId = Number(digitalClearanceFlight.value);
  if (!Number.isInteger(flightId)) return;
  const result = executeAirportRequest({
    action: "cancelRouteAmendment",
    flightId,
  });
  setStatus(
    result.accepted ? "Digital clearance cancelled" : "Cancellation rejected",
    result.reason,
    result.accepted ? "operational" : "warning",
  );
  digitalClearanceComposerUiKey = "";
  digitalClearanceUiKey = "";
  renderDigitalClearanceMessages();
  renderFlightActions();
});

performanceButton.addEventListener("click", () => {
  performancePanelVisible = !performancePanelVisible;
  lastDebugSecond = -1;
  updatePerformancePanelControl();
  setStatus(
    performancePanelVisible
      ? "Performance budgets visible"
      : "Performance budgets hidden",
    performancePanelVisible
      ? "local frame, simulation, memory, entity, audio, queue, and renderer measurements"
      : "the local monitor continues collecting bounded diagnostics",
  );
});

queueFilter.addEventListener("change", () => {
  if (!isOperationQueueFilter(queueFilter.value)) return;
  queueInspectorFilter = queueFilter.value;
  queueInspectorUiKey = "";
  renderQueueInspector();
});

queueFlowObjective.addEventListener("change", () => {
  if (!isTrafficFlowObjective(queueFlowObjective.value)) return;
  const result = executeAirportRequest({
    action: "setTrafficFlowObjective",
    objective: queueFlowObjective.value,
  });
  if (!result.accepted) {
    queueFlowObjective.value = simulation.state.trafficFlow.objective;
    setStatus("Flow objective unchanged", result.reason, "warning");
    return;
  }
  queueInspectorUiKey = "";
  renderQueueInspector();
});

queueFlowHorizon.addEventListener("change", () => {
  const seconds = Number(queueFlowHorizon.value);
  if (!isTrafficFlowForecastHorizon(seconds)) return;
  const result = executeAirportRequest({
    action: "setTrafficFlowForecastHorizon",
    seconds,
  });
  if (!result.accepted) {
    queueFlowHorizon.value = String(
      simulation.state.trafficFlow.forecastHorizonSeconds,
    );
    setStatus("Forecast window unchanged", result.reason, "warning");
    return;
  }
  queueInspectorUiKey = "";
  renderQueueInspector();
});

queueCapacity.addEventListener("click", (event) => {
  const resequenceButton = (
    event.target as HTMLElement
  ).closest<HTMLButtonElement>("button[data-flow-resequence]");
  if (resequenceButton) {
    handleTrafficFlowResequence(resequenceButton);
    return;
  }
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-flow-advisory-action]",
  );
  if (!button) return;
  const recommendationId = button.dataset.recommendationId ?? "";
  const action = button.dataset.flowAdvisoryAction;
  if (!recommendationId || (action !== "ignore" && action !== "recover"))
    return;
  const result = executeAirportRequest({
    action:
      action === "ignore"
        ? "ignoreTrafficFlowAdvisory"
        : "recoverTrafficFlowAdvisory",
    recommendationId,
  });
  setStatus(
    result.accepted
      ? action === "ignore"
        ? "Flow advisory ignored"
        : "Flow recovery selected"
      : "Flow response refused",
    result.reason,
    result.accepted ? "operational" : "warning",
  );
  queueInspectorUiKey = "";
  renderQueueInspector();
});

queueMeter.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-flow-resequence]",
  );
  if (!button) return;
  handleTrafficFlowResequence(button);
});

function handleTrafficFlowResequence(button: HTMLButtonElement): void {
  const direction = button.dataset.flowDirection;
  const move = button.dataset.flowResequence;
  const entryId = button.dataset.flowEntryId ?? "";
  const expectedAdjacentEntryId = button.dataset.flowExpectedAdjacent;
  if (
    (direction !== "arrival" && direction !== "departure") ||
    (move !== "earlier" && move !== "later") ||
    !entryId
  )
    return;
  const result = executeAirportRequest({
    action: "resequenceTrafficFlow",
    direction,
    entryId,
    move,
    ...(expectedAdjacentEntryId ? { expectedAdjacentEntryId } : {}),
  });
  setStatus(
    result.accepted ? "Flow sequence revised" : "Resequence refused",
    result.reason,
    result.accepted ? "operational" : "warning",
  );
  queueInspectorUiKey = "";
  renderQueueInspector();
}

queueList.addEventListener("click", (event) => {
  const row = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-queue-focus]",
  );
  if (!row) return;
  const queueId = row.dataset.queueFocus;
  if (!queueId) return;
  const result = executeAirportRequest({
    action: "focusTarget",
    target: { kind: "queue", id: queueId },
  });
  if (result.accepted) {
    queueInspectorUiKey = "";
    renderQueueInspector();
    const target = focusTargetCatalog.targets.find(
      (candidate) => candidate.kind === "queue" && candidate.id === queueId,
    );
    if (target) setStatus(`${target.label} selected from queue`, target.detail);
  }
});

restartButton.addEventListener("click", () => {
  setExclusiveModal(null);
  newSession(
    false,
    config.scope === "center"
      ? generateHubConfig(hubIndex)
      : generateAirportConfig(),
  );
  gameOver.classList.add("modal--hidden");
  gameOver.hidden = true;
  pauseButton.setAttribute("aria-pressed", "false");
  pauseButton.classList.remove("control--active");
  pauseIcon.textContent = "Ⅱ";
  pauseLabel.textContent = "Pause";
  setStatus(
    "A fresh airfield opens",
    `${config.runwayCount} directional runway${config.runwayCount === 1 ? "" : "s"} ready`,
  );
});

function beginRoute(flightId: number, point: ScreenPoint): void {
  const flight = simulation.state.flights.find((item) => item.id === flightId);
  if (!flight || flight.phase !== "approach" || flight.cleared) return;
  activeFlightId = flight.id;
  routePoints = [world.flightScreenPosition(flight.id) ?? point, point];
  executeAirportRequest({ action: "focusFlight", flightId: flight.id });
  routePath.style.setProperty(
    "--route-color",
    flight.palette === "rose" ? "#ef937f" : "#79c8e8",
  );
  routeShadow.style.setProperty(
    "--route-color",
    flight.palette === "rose" ? "#ef937f" : "#79c8e8",
  );
  routePath.classList.add("route--active");
  drawRoute();
  setStatus(
    `${flight.callsign} selected`,
    `guide it to runway ${flight.runway + 1}'s lit threshold`,
  );
}

function updateRoute(point: ScreenPoint): void {
  if (activeFlightId === null) return;
  const last = routePoints[routePoints.length - 1];
  if (Math.hypot(last.x - point.x, last.y - point.y) > 7)
    routePoints.push(point);
  else routePoints[routePoints.length - 1] = point;
  drawRoute();
}

function finishRoute(point: ScreenPoint): void {
  if (activeFlightId === null) return;
  const flight = simulation.state.flights.find(
    (item) => item.id === activeFlightId,
  );
  const runway = world.pickRunway(point.x, point.y);
  const accepted =
    runway !== null &&
    executeAirportRequest({
      action: "clearFlight",
      flightId: activeFlightId,
      runway,
    }).accepted;
  routePath.classList.toggle("route--accepted", accepted);
  routePath.classList.toggle("route--rejected", !accepted);
  if (!accepted && flight)
    setStatus(
      "Clearance not accepted",
      `finish on runway ${flight.runway + 1}'s approach lights`,
    );
  activeFlightId = null;
  clearFlightFocus();
  window.setTimeout(clearRoute, accepted ? 650 : 420);
}

function cancelRoute(): void {
  activeFlightId = null;
  clearRoute();
}

function drawRoute(): void {
  const d = routePoints
    .map(
      (point, index) =>
        `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");
  routePath.setAttribute("d", d);
  routeShadow.setAttribute("d", d);
}

function clearRoute(): void {
  routePoints = [];
  routePath.setAttribute("d", "");
  routeShadow.setAttribute("d", "");
  routePath.classList.remove(
    "route--active",
    "route--accepted",
    "route--rejected",
  );
}

function frame(now: number): void {
  const frameStarted = performance.now();
  const frameGapMs = Math.max(0, now - lastTime);
  const delta = Math.min(0.1, frameGapMs / 1000);
  runtimePerformance.recordDroppedSimulationTime(
    Math.max(0, frameGapMs / 1_000 - delta),
  );
  lastTime = now;
  const statusSnapshot = statusMessages.advance(now);
  status.dataset.queueDepth = String(statusSnapshot.queued.length);
  radioCaptions.advance(now);
  inputLayer.update(delta);
  if (
    inputContext() === "gameplay" &&
    (touchCameraAxes.panX !== 0 ||
      touchCameraAxes.panY !== 0 ||
      touchCameraAxes.rotate !== 0)
  )
    handleInputAxes(touchCameraAxes, delta);
  worldDeltaAccumulator = Math.min(0.25, worldDeltaAccumulator + delta);
  const renderWorld =
    minimumRenderInterval === 0 ||
    now - lastWorldRender >= minimumRenderInterval;
  if (!replayMode) updateCameraDirector(now / 1_000);
  if (renderWorld) {
    renderedFrames += 1;
    lastWorldRender = now;
  }
  if (now - frameWindowStarted >= 1_000) {
    measuredFps =
      (renderedFrames * 1_000) / Math.max(1, now - frameWindowStarted);
    renderedFrames = 0;
    frameWindowStarted = now;
  }
  let ticks = 0;
  if (!replayMode) {
    const nextAccumulator = simulationAccumulator + delta;
    const maximumAccumulator = SIMULATION_STEP * MAX_SIMULATION_TICKS_PER_FRAME;
    runtimePerformance.recordDroppedSimulationTime(
      Math.max(0, nextAccumulator - maximumAccumulator),
    );
    simulationAccumulator = Math.min(maximumAccumulator, nextAccumulator);
    while (
      simulationAccumulator >= SIMULATION_STEP &&
      ticks < MAX_SIMULATION_TICKS_PER_FRAME
    ) {
      previousPresentation = capturePresentation(simulation.state);
      const simulationStarted = performance.now();
      simulation.update(SIMULATION_STEP);
      runtimePerformance.recordSimulationTick(
        performance.now() - simulationStarted,
      );
      simulationAccumulator -= SIMULATION_STEP;
      ticks += 1;
    }
  }
  const displayedState = displayState();
  audioUpdateIn -= delta;
  if (audioUpdateIn <= 0) {
    if (!replayMode)
      handleSoundscapeEvents(
        soundscape.advance(simulation.state),
        simulation.state,
        true,
      );
    const camera = world.diagnostics().camera;
    audio.setEnvironment(displayedState, {
      x: camera.focusX,
      y: camera.focusY,
      orbitRadians: (camera.orbitDegrees * Math.PI) / 180,
      zoom: camera.zoom,
    });
    audioUpdateIn = 0.25;
  }
  if (now - lastFlightStripRender >= 400) {
    renderFlightStrip();
    renderTrainingCoach();
    renderChallengeExperience();
    renderSandboxExperience();
    lastFlightStripRender = now;
  }
  // The optional surface picture is deliberately bounded below the render
  // frame rate. Its projection is authoritative, but rebuilding its DOM is
  // neither necessary nor desirable at 60 Hz.
  if (
    surfaceSafetyVisible &&
    now - lastSurfaceSafetyRender >= SURFACE_SAFETY_PANEL_UPDATE_INTERVAL_MS
  ) {
    renderSurfaceSafety();
    lastSurfaceSafetyRender = now;
  }

  const hudSecond = Math.floor(displayedState.elapsed);
  if (hudSecond !== lastHudSecond) {
    shiftTime.textContent = formatTime(displayedState.elapsed);
    updateWeatherUi();
    lastHudSecond = hudSecond;
    const predictions = currentDisplayPredictions();
    const predictionKey = predictions
      .map((prediction) => `${prediction.type}:${prediction.flights.join("-")}`)
      .join("|");
    if (predictions.length && predictionKey !== lastPredictionKey)
      setStatus("Conflict forecast", predictions[0].detail);
    lastPredictionKey = predictionKey;
    const queues = simulation.queueSnapshot(displayedState);
    if (!replayMode) {
      const surfaceSafety = currentSurfaceSafetySnapshot();
      operationsAnalytics.record({
        state: simulation.state,
        predictions,
        queues,
        metrics: simulation.shiftMetrics(),
        surfaceSafety,
      });
      replayFrames.push({
        clock: Number(simulation.state.elapsed.toFixed(2)),
        score: {
          landed: simulation.state.arrivals,
          departed: simulation.state.departures,
        },
        flights: simulation.state.flights.map((flight) => ({
          id: flight.id,
          callsign: flight.callsign,
          phase: flight.phase,
          runway: flight.runway,
          progress: Number(flight.progress.toFixed(3)),
        })),
        predictions,
        surfaceSafety: structuredClone(surfaceSafety),
        state: cloneAirportState(simulation.state),
      });
      if (replayFrames.length > 900) replayFrames.shift();
      if (!importedReplay && replayVerification?.exact)
        replayVerificationStale = true;
    }
    updateSafetyUi(predictions);
    if (!replayMode) {
      const surfaceSafety =
        replayFrames[replayFrames.length - 1]?.surfaceSafety;
      for (const advisory of surfaceSafetyAnnouncements.select(
        surfaceSafety ?? currentSurfaceSafetySnapshot(),
      )) {
        setStatus(advisory.label, advisory.detail, advisory.priority);
      }
    }
    if (digitalClearanceVisible) renderDigitalClearanceMessages();
    refreshFocusTargets(displayedState, predictions);
    updateReplayUi();
    const renderer = world.diagnostics();
    const audioState = audio.snapshot();
    runtimePerformance.sample({
      elapsedSeconds: displayedState.elapsed,
      heapBytes: runtimeHeapBytes(),
      aircraft: displayedState.flights.length,
      serviceVehicles: displayedState.serviceVehicles.length,
      audioVoices: audioState.spatialAircraft.activeVoices,
      queues: queues.total,
      drawCalls: renderer.drawCalls,
      geometries: renderer.geometries,
      textures: renderer.textures,
      detail: renderer.detail,
    });
    updateAdaptiveRenderQuality();
    updateOperationsHealth();
    renderSurfaceDisruptionControls();
    if (queueInspectorVisible) renderQueueInspector();
    if (operationsLab.visible()) renderOperationsLabSnapshot();
  }
  if (simulation.state.arrivals !== lastArrivals) {
    landedCount.textContent = two(simulation.state.arrivals);
    lastArrivals = simulation.state.arrivals;
  }
  if (simulation.state.departures !== lastDepartures) {
    departedCount.textContent = two(simulation.state.departures);
    lastDepartures = simulation.state.departures;
  }

  for (const event of simulation.drainEvents()) {
    const gateEvent =
      event.type === "gate-assignment" ||
      event.type === "gate-reassignment" ||
      event.type === "gate-release";
    const turnaroundEvent =
      event.type === "turnaround-start" ||
      event.type === "service-start" ||
      event.type === "service-complete" ||
      event.type === "turnaround-ready";
    const serviceVehicleEvent = event.type.startsWith("service-vehicle-");
    const deicingEvent = event.type.startsWith("deicing-");
    const runwayExitEvent = event.type === "runway-exit-plan";
    const surfaceEvent =
      event.type === "surface-reroute" ||
      event.type === "taxi-route-clearance" ||
      event.type === "recovery-start" ||
      event.type === "recovery-complete";
    const routeClearanceEvent =
      event.type === "route-preview" ||
      event.type === "route-clearance-issued" ||
      event.type === "route-clearance-delivered" ||
      event.type === "route-readback-accepted" ||
      event.type === "route-readback-rejected" ||
      event.type === "route-readback-timed-out" ||
      event.type === "route-clearance-cancelled" ||
      event.type === "route-amendment";
    const controllerDecision =
      event.type === "controller-decision" && event.causedByControllerDecisionId
        ? simulation.state.scriptedControllers.decisions.find(
            (decision) => decision.id === event.causedByControllerDecisionId,
          )
        : undefined;
    recordTelemetry(event.type, event.flight, event.runway, event.taxiway, {
      detail:
        event.detail ??
        (event.type === "safety-hold"
          ? event.flight.safetyHoldReason
          : undefined),
      causedByCommandId: event.causedByCommandId,
      causedByControllerDecisionId: event.causedByControllerDecisionId,
      causedByEventId: event.causedByEventId,
      payload: controllerDecision
        ? structuredClone(controllerDecision)
        : routeClearanceEvent && event.flight.navigation.routeClearance
          ? cloneFlightRouteClearance(event.flight.navigation.routeClearance)
          : surfaceEvent
            ? {
                reroute: event.flight.surfaceReroute
                  ? {
                      ...event.flight.surfaceReroute,
                      disruptionIds: [
                        ...event.flight.surfaceReroute.disruptionIds,
                      ],
                      previousEdgeIds: [
                        ...event.flight.surfaceReroute.previousEdgeIds,
                      ],
                      routeEdgeIds: [
                        ...event.flight.surfaceReroute.routeEdgeIds,
                      ],
                    }
                  : null,
                disruption:
                  simulation.state.surfaceDisruptions.find(
                    (disruption) => disruption.flightId === event.flight.id,
                  ) ?? null,
              }
            : runwayExitEvent && event.flight.runwayExit
              ? {
                  ...event.flight.runwayExit,
                  taxiRouteEdgeIds: [
                    ...event.flight.runwayExit.taxiRouteEdgeIds,
                  ],
                  rationale: [...event.flight.runwayExit.rationale],
                }
              : gateEvent && event.flight.gateAssignment
                ? {
                    standId: event.flight.gateAssignment.standId,
                    gateRef: event.flight.gateAssignment.gateRef ?? null,
                    zoneName: event.flight.gateAssignment.zoneName,
                    terminalId: event.flight.gateAssignment.terminalId ?? null,
                    concourse: event.flight.gateAssignment.concourse ?? null,
                    scheduledGateInSeconds:
                      event.flight.gateAssignment.scheduledGateInSeconds,
                    scheduledDepartureSeconds:
                      event.flight.gateAssignment.scheduledDepartureSeconds,
                    nextDestination:
                      event.flight.gateAssignment.nextDestination,
                    revision: event.flight.gateAssignment.revision,
                  }
                : serviceVehicleEvent
                  ? {
                      id: event.serviceVehicleId ?? null,
                      type: event.serviceVehicleType ?? null,
                      status: event.serviceVehicleStatus ?? null,
                      service: event.turnaroundService ?? null,
                    }
                  : deicingEvent
                    ? {
                        ...event.flight.deicing,
                      }
                    : turnaroundEvent
                      ? {
                          service: event.turnaroundService ?? null,
                          status: event.flight.turnaround.status,
                          progress: Number(
                            event.flight.turnaround.progress.toFixed(3),
                          ),
                          scheduledReadySeconds:
                            event.flight.turnaround.scheduledReadySeconds,
                          actualReadySeconds:
                            event.flight.turnaround.actualReadySeconds ?? null,
                        }
                      : undefined,
    });
    handleSoundscapeEvents(
      soundscape.observe(event, simulation.state),
      simulation.state,
      true,
    );
    if (event.type === "chime") {
      audio.chime();
    }
    if (event.type === "spawn")
      setStatus(
        event.flight.phase === "approach"
          ? `${event.flight.callsign} entering the scope`
          : `${event.flight.callsign} ready at the terminal`,
        simulation.state.mode === "auto" || simulation.state.mode === "watch"
          ? "tower building the next safe movement"
          : simulation.state.mode === "assisted"
            ? "advisor preparing the next clearance"
            : "select the flight strip for clearances",
      );
    if (event.type === "gate-assignment")
      setStatus(
        `${event.flight.callsign} gate planned`,
        event.detail ?? "stand schedule confirmed",
      );
    if (event.type === "gate-reassignment")
      setStatus(
        `${event.flight.callsign} gate changed`,
        event.detail ?? "stand conflict resolved",
      );
    if (event.type === "gate-release")
      setStatus(
        `${event.flight.callsign} clear of stand`,
        event.detail ?? "gate available",
      );
    if (event.type === "turnaround-ready")
      setStatus(
        `${event.flight.callsign} ready for push`,
        event.detail ?? "all required services complete",
      );
    if (event.type === "clear") {
      setStatus(
        `${event.flight.callsign} cleared to land`,
        "route accepted · runway lights are yours",
      );
    }
    if (event.type === "auto-clear") {
      setStatus(
        `${event.flight.callsign} cleared by the tower`,
        "automatic approach is established",
      );
    }
    if (event.type === "pushback-clearance") {
      setStatus(
        `${event.flight.callsign} pushback approved`,
        event.detail ?? `push ${event.flight.pushbackDirection}`,
      );
    }
    if (event.type === "pushback-start")
      setStatus(
        `${event.flight.callsign} tug connected`,
        event.detail ?? "pushback beginning",
      );
    if (event.type === "engine-start")
      setStatus(
        `${event.flight.callsign} starting engines`,
        "tug remains attached through the ramp release",
      );
    if (event.type === "tug-release")
      setStatus(
        `${event.flight.callsign} tug released`,
        event.detail ?? "taxi power available",
      );
    if (event.type === "deicing-planned")
      setStatus(
        `${event.flight.callsign} winter route planned`,
        event.detail ?? "deicing pad assigned",
      );
    if (event.type === "deicing-queue")
      setStatus(
        `${event.flight.callsign} in deicing queue`,
        event.detail ?? "holding before the pad",
      );
    if (event.type === "deicing-pad-entry")
      setStatus(
        `${event.flight.callsign} entering deicing`,
        event.detail ?? "treatment lane released",
      );
    if (event.type === "deicing-start")
      setStatus(
        `${event.flight.callsign} treatment started`,
        event.detail ?? "deicing in progress",
      );
    if (event.type === "deicing-complete")
      setStatus(
        `${event.flight.callsign} deicing complete`,
        event.detail ?? "holdover protection active",
      );
    if (event.type === "deicing-expired")
      setStatus(
        `${event.flight.callsign} holdover expired`,
        event.detail ?? "return to deicing before runway entry",
      );
    if (event.type === "deicing-return")
      setStatus(
        `${event.flight.callsign} returning to deicing`,
        event.detail ?? "new treatment cycle required",
      );
    if (event.type === "land")
      setStatus(
        `${event.flight.callsign} touched down`,
        `${simulation.state.arrivals} safe arrival${simulation.state.arrivals === 1 ? "" : "s"}`,
      );
    if (event.type === "hold-short") {
      setStatus(
        `${event.flight.callsign} holding short`,
        `${event.taxiway} · runway ${runwayDesignation(event.runway ?? event.flight.runway)}`,
      );
    }
    if (event.type === "runway-entry")
      setStatus(
        `${event.flight.callsign} cleared onto runway`,
        `${event.taxiway} · runway ${runwayDesignation(event.runway ?? event.flight.runway)}`,
      );
    if (event.type === "takeoff-clearance")
      setStatus(
        `${event.flight.callsign} cleared for takeoff`,
        `runway ${runwayDesignation(event.runway ?? event.flight.runway)} · full roll authorized`,
      );
    if (event.type === "takeoff-clearance-cancelled")
      setStatus(
        `${event.flight.callsign} takeoff cancelled`,
        event.detail ?? "hold position on the runway",
        "warning",
      );
    if (event.type === "runway-crossing")
      setStatus(
        `${event.flight.callsign} crossing clearance`,
        `cross runway ${runwayDesignation(event.runway ?? event.flight.runway)}`,
      );
    if (event.type === "safety-hold")
      setStatus(
        `${event.flight.callsign} held for separation`,
        event.flight.safetyHoldReason ?? "protected traffic envelope occupied",
      );
    if (event.type === "depart")
      setStatus(
        `${event.flight.callsign} is away`,
        "departure corridor is clear",
      );
    if (event.type === "conflict") {
      if (simulation.state.sandbox.active)
        setStatus(
          `${event.flight.callsign} protected`,
          "sandbox safety arbiter retained control; the session remains open",
        );
      else showGameOver(event.flight.callsign);
    }
    if (event.type === "sandbox-injection")
      setStatus(
        `${event.flight.callsign} staged`,
        event.detail ?? "sandbox release accepted by the safety arbiter",
      );
    if (event.type === "emergency")
      setStatus(
        `${event.flight.callsign} emergency`,
        `${event.flight.emergency} · priority handling active`,
      );
    if (event.type === "go-around")
      setStatus(
        `${event.flight.callsign} going around`,
        `${event.detail ?? "spacing reset"} · re-entering the arrival sequence`,
      );
    if (event.type === "route-preview")
      setStatus(
        `${event.flight.callsign} route preview`,
        event.detail ?? "candidate route checked",
      );
    if (event.type === "route-clearance-issued")
      setStatus(
        `${event.flight.callsign} route sent`,
        event.detail ?? "delivery confirmation pending",
      );
    if (event.type === "route-clearance-delivered")
      setStatus(
        `${event.flight.callsign} route delivered`,
        event.detail ?? "pilot readback pending",
      );
    if (event.type === "route-readback-accepted")
      setStatus(
        `${event.flight.callsign} readback correct`,
        event.detail ?? "route accepted",
      );
    if (event.type === "route-readback-rejected")
      setStatus(
        `${event.flight.callsign} route withheld`,
        event.detail ?? "conflict changed before readback",
      );
    if (event.type === "route-readback-timed-out")
      setStatus(
        `${event.flight.callsign} readback timed out`,
        event.detail ?? "original route retained; issue a fresh revision",
        "warning",
      );
    if (event.type === "route-clearance-cancelled")
      setStatus(
        `${event.flight.callsign} route cancelled`,
        event.detail ?? "original route retained",
      );
    if (event.type === "route-amendment")
      setStatus(
        `${event.flight.callsign} route amended`,
        event.detail ?? "new terminal fixes accepted",
      );
    if (event.type === "taxi-route-clearance")
      setStatus(
        `${event.flight.callsign} taxi route assigned`,
        event.detail ?? "continuous pavement route accepted",
      );
    if (event.type === "hold-position")
      setStatus(
        `${event.flight.callsign} hold position`,
        event.detail ?? "decelerating normally",
      );
    if (event.type === "taxi-resume")
      setStatus(
        `${event.flight.callsign} resume taxi`,
        event.detail ?? "controller hold released",
      );
    if (event.type === "group-instruction")
      setStatus(
        "Group instruction accepted",
        event.detail ?? "shared command applied atomically",
      );
    if (event.type === "handoff-offer")
      setStatus(
        `${event.flight.callsign} coordination offered`,
        event.detail ?? "receiving controller response pending",
      );
    if (event.type === "handoff-accept")
      setStatus(
        `${event.flight.callsign} handoff accepted`,
        event.detail ?? "sending controller must issue contact",
      );
    if (event.type === "handoff-reject")
      setStatus(
        `${event.flight.callsign} handoff rejected`,
        event.detail ?? "retain frequency ownership and re-coordinate",
      );
    if (event.type === "handoff-overdue")
      setStatus(
        `${event.flight.callsign} handoff overdue`,
        event.detail ?? "control-boundary coordination missed",
      );
    if (event.type === "handoff-cancel")
      setStatus(
        `${event.flight.callsign} handoff cancelled`,
        event.detail ?? "frequency ownership retained",
      );
    if (event.type === "contact")
      setStatus(
        `${event.flight.callsign} frequency changed`,
        event.detail ?? "contact accepted",
      );
    if (event.type === "diversion")
      setStatus(
        `${event.flight.callsign} diverting`,
        event.detail ?? "climbing toward the edge of terminal scope",
      );
    if (event.type === "divert")
      setStatus(
        `${event.flight.callsign} left the scope`,
        event.detail ?? "diversion complete",
      );
    if (event.type === "surface-reroute")
      setStatus(
        `${event.flight.callsign} surface route amended`,
        event.detail ?? "remaining on available pavement",
      );
    if (event.type === "recovery-start")
      setStatus(
        `${event.flight.callsign} recovery dispatched`,
        event.detail ?? "tow and pavement inspection underway",
      );
    if (event.type === "recovery-complete")
      setStatus(
        `${event.flight.callsign} recovered`,
        event.detail ?? "movement area inspected and reopened",
      );
  }

  if (renderWorld) {
    world.update(
      replayMode ? displayedState : presentationState(),
      worldDeltaAccumulator,
    );
    worldDeltaAccumulator = 0;
  }
  if (radarVisible && now - lastRadarUpdate >= 80) {
    drawRadar(displayedState);
    lastRadarUpdate = now;
  }
  if (mapOrientationVisible && now - lastOrientationUpdate >= 100) {
    updateMapOrientation();
    lastOrientationUpdate = now;
  }
  if (!debugPanel.hidden && hudSecond !== lastDebugSecond) {
    renderDebugPanel();
    lastDebugSecond = hudSecond;
  }
  if (telemetryEnabled && hudSecond !== lastTelemetrySecond) {
    renderTelemetryControls();
    const playbackFrames = replayPlaybackFrames();
    telemetryOutput.textContent = JSON.stringify(
      replayMode && playbackFrames[replayIndex]
        ? { replay: playbackFrames[replayIndex], live: airportSnapshot() }
        : airportSnapshot(),
      null,
      2,
    );
    updateReplayUi();
    lastTelemetrySecond = hudSecond;
  }
  runtimePerformance.recordFrame(
    performance.now() - frameStarted,
    frameGapMs,
    ticks,
  );
  requestAnimationFrame(frame);
}

function displayState() {
  const frames = replayPlaybackFrames();
  return replayMode && frames[replayIndex]?.state
    ? frames[replayIndex].state
    : simulation.state;
}

function cloneSoundscapeEvent(event: SoundscapeEvent): SoundscapeEvent {
  return {
    ...event,
    position: event.position ? { ...event.position } : undefined,
  };
}

function handleSoundscapeEvents(
  events: SoundscapeEvent[],
  sourceState: typeof simulation.state,
  record: boolean,
): void {
  for (const event of events) {
    if (record) {
      soundscapeEvents.push(cloneSoundscapeEvent(event));
      if (soundscapeEvents.length > 5_000)
        soundscapeEvents.splice(0, soundscapeEvents.length - 5_000);
      const flight =
        event.flightId === undefined
          ? undefined
          : sourceState.flights.find(
              (candidate) => candidate.id === event.flightId,
            );
      recordTelemetry(
        `sound:${event.kind}`,
        flight,
        flight?.runway,
        flight?.taxiway,
        {
          detail: event.caption ?? event.sourceEventType ?? event.kind,
          payload: cloneSoundscapeEvent(event),
        },
      );
    }
    const delay = record
      ? Math.max(0, event.elapsed - sourceState.elapsed) /
        Math.max(0.25, simulationSpeed)
      : 0;
    audio.play(event, delay);
    if (event.caption && radioCaptionsEnabled) {
      radioCaptions.enqueue({
        id: event.id,
        station: `${event.station ?? "radio"} · fictional offline transmission`,
        copy: event.caption,
        priority: event.priority,
      });
    }
  }
}

function playReplaySoundFrame(): void {
  const frames = replayPlaybackFrames();
  if (
    !replayMode ||
    replayIndex < 0 ||
    replayIndex === lastReplaySoundIndex ||
    !frames[replayIndex]
  )
    return;
  lastReplaySoundIndex = replayIndex;
  radioCaptions.reset();
  const clock = frames[replayIndex].clock;
  const events = (importedReplay?.soundEvents ?? soundscapeEvents)
    .filter((event) => Math.abs(event.elapsed - clock) <= 0.55)
    .slice(-4);
  handleSoundscapeEvents(events, frames[replayIndex].state, false);
}

function capturePresentation(state: typeof simulation.state) {
  return {
    elapsed: state.elapsed,
    environment: cloneEnvironmentState(state.environment),
    flights: new Map(
      state.flights.map((flight) => [
        flight.id,
        {
          phase: flight.phase,
          progress: flight.progress,
          phaseElapsed: flight.phaseElapsed,
          kinematics: { ...flight.kinematics },
          motion: { ...flight.motion },
        },
      ]),
    ),
    serviceVehicles: new Map(
      state.serviceVehicles.map((vehicle) => [
        vehicle.id,
        {
          status: vehicle.status,
          progress: vehicle.progress,
          x: vehicle.x,
          y: vehicle.y,
          heading: vehicle.heading,
          groundSpeedMps: vehicle.groundSpeedMps,
        },
      ]),
    ),
  };
}

function presentationState(): typeof simulation.state {
  const current = simulation.state;
  const alpha = Math.max(
    0,
    Math.min(1, simulationAccumulator / SIMULATION_STEP),
  );
  const mix = (first: number, second: number) =>
    first + (second - first) * alpha;
  if (presentationStateSource !== current || !presentationStateCache) {
    presentationStateSource = current;
    presentationStateCache = {
      ...current,
      environment: { ...current.environment },
      flights: [],
      serviceVehicles: [],
    };
    presentationFlightCache.clear();
    presentationServiceVehicleCache.clear();
  }
  const presentation = presentationStateCache;
  presentation.elapsed = mix(previousPresentation.elapsed, current.elapsed);
  Object.assign(presentation.environment, current.environment);
  presentation.environment.localMinute = mix(
    previousPresentation.environment.localMinute,
    current.environment.localMinute,
  );
  presentation.environment.daylight = mix(
    previousPresentation.environment.daylight,
    current.environment.daylight,
  );
  presentation.environment.sunAzimuthRadians =
    previousPresentation.environment.sunAzimuthRadians +
    Math.atan2(
      Math.sin(
        current.environment.sunAzimuthRadians -
          previousPresentation.environment.sunAzimuthRadians,
      ),
      Math.cos(
        current.environment.sunAzimuthRadians -
          previousPresentation.environment.sunAzimuthRadians,
      ),
    ) *
      alpha;
  presentation.environment.sunElevationRadians = mix(
    previousPresentation.environment.sunElevationRadians,
    current.environment.sunElevationRadians,
  );
  presentation.environment.cloudCover = mix(
    previousPresentation.environment.cloudCover,
    current.environment.cloudCover,
  );
  presentation.environment.snowCover = mix(
    previousPresentation.environment.snowCover,
    current.environment.snowCover,
  );
  presentation.environment.wetPavement = mix(
    previousPresentation.environment.wetPavement,
    current.environment.wetPavement,
  );
  presentation.environment.runwayLightIntensity = mix(
    previousPresentation.environment.runwayLightIntensity,
    current.environment.runwayLightIntensity,
  );

  activePresentationServiceVehicleIds.clear();
  presentation.serviceVehicles.length = 0;
  for (const vehicle of current.serviceVehicles) {
    const previous = previousPresentation.serviceVehicles.get(vehicle.id);
    let rendered = presentationServiceVehicleCache.get(vehicle.id);
    if (!rendered || !previous || previous.status !== vehicle.status) {
      rendered = { ...vehicle };
      presentationServiceVehicleCache.set(vehicle.id, rendered);
    } else {
      Object.assign(rendered, vehicle);
      rendered.progress = mix(previous.progress, vehicle.progress);
      rendered.x = mix(previous.x, vehicle.x);
      rendered.y = mix(previous.y, vehicle.y);
      rendered.heading =
        previous.heading +
        Math.atan2(
          Math.sin(vehicle.heading - previous.heading),
          Math.cos(vehicle.heading - previous.heading),
        ) *
          alpha;
      rendered.groundSpeedMps = mix(
        previous.groundSpeedMps,
        vehicle.groundSpeedMps,
      );
    }
    activePresentationServiceVehicleIds.add(vehicle.id);
    presentation.serviceVehicles.push(rendered);
  }
  for (const id of presentationServiceVehicleCache.keys())
    if (!activePresentationServiceVehicleIds.has(id))
      presentationServiceVehicleCache.delete(id);

  activePresentationFlightIds.clear();
  presentation.flights.length = 0;
  for (const flight of current.flights) {
    const previous = previousPresentation.flights.get(flight.id);
    let rendered = presentationFlightCache.get(flight.id);
    if (!rendered || !previous || previous.phase !== flight.phase) {
      rendered = {
        ...flight,
        kinematics: { ...flight.kinematics },
        motion: { ...flight.motion },
      };
      presentationFlightCache.set(flight.id, rendered);
    } else {
      const renderedKinematics = rendered.kinematics;
      const renderedMotion = rendered.motion;
      Object.assign(rendered, flight);
      rendered.kinematics = renderedKinematics;
      rendered.motion = renderedMotion;
      rendered.progress = mix(previous.progress, flight.progress);
      rendered.phaseElapsed = mix(previous.phaseElapsed, flight.phaseElapsed);
      Object.assign(renderedKinematics, flight.kinematics);
      renderedKinematics.airspeedKts = mix(
        previous.kinematics.airspeedKts,
        flight.kinematics.airspeedKts,
      );
      renderedKinematics.groundSpeedKts = mix(
        previous.kinematics.groundSpeedKts,
        flight.kinematics.groundSpeedKts,
      );
      renderedKinematics.altitudeFt = mix(
        previous.kinematics.altitudeFt,
        flight.kinematics.altitudeFt,
      );
      renderedKinematics.verticalSpeedFpm = mix(
        previous.kinematics.verticalSpeedFpm,
        flight.kinematics.verticalSpeedFpm,
      );
      renderedKinematics.accelerationMps2 = mix(
        previous.kinematics.accelerationMps2,
        flight.kinematics.accelerationMps2,
      );
      renderedKinematics.fuelPercent = mix(
        previous.kinematics.fuelPercent,
        flight.kinematics.fuelPercent,
      );
      Object.assign(renderedMotion, flight.motion);
      renderedMotion.x = mix(previous.motion.x, flight.motion.x);
      renderedMotion.y = mix(previous.motion.y, flight.motion.y);
      renderedMotion.z = mix(previous.motion.z, flight.motion.z);
      renderedMotion.heading =
        previous.motion.heading +
        Math.atan2(
          Math.sin(flight.motion.heading - previous.motion.heading),
          Math.cos(flight.motion.heading - previous.motion.heading),
        ) *
          alpha;
      renderedMotion.pitch = mix(previous.motion.pitch, flight.motion.pitch);
      renderedMotion.bank = mix(previous.motion.bank, flight.motion.bank);
      renderedMotion.distanceAlongM = mix(
        previous.motion.distanceAlongM,
        flight.motion.distanceAlongM,
      );
      renderedMotion.totalDistanceM = mix(
        previous.motion.totalDistanceM,
        flight.motion.totalDistanceM,
      );
      renderedMotion.stageProgress = mix(
        previous.motion.stageProgress,
        flight.motion.stageProgress,
      );
    }
    activePresentationFlightIds.add(flight.id);
    presentation.flights.push(rendered);
  }
  for (const id of presentationFlightCache.keys())
    if (!activePresentationFlightIds.has(id))
      presentationFlightCache.delete(id);
  return presentation;
}

function cloneAirportState(
  state: typeof simulation.state,
): typeof simulation.state {
  return {
    ...state,
    stationAutomation: { ...state.stationAutomation },
    scriptedControllers: structuredClone(state.scriptedControllers),
    trafficFlow: cloneTrafficFlowState(state.trafficFlow),
    weather: cloneWeatherState(state.weather),
    environment: cloneEnvironmentState(state.environment),
    training: {
      ...state.training,
      completedStepIds: [...state.training.completedStepIds],
      skippedStepIds: [...state.training.skippedStepIds],
    },
    challenge: {
      ...state.challenge,
      objectives: state.challenge.objectives.map((objective) => ({
        ...objective,
      })),
      summary: {
        ...state.challenge.summary,
        safety: { ...state.challenge.summary.safety },
      },
    },
    sandbox: {
      ...state.sandbox,
      injections: state.sandbox.injections.map((request) => ({
        ...request,
        releasedFlightIds: [...request.releasedFlightIds],
      })),
      totals: { ...state.sandbox.totals },
    },
    activeRunwayEnds: { ...state.activeRunwayEnds },
    activeRunwayRoles: { ...state.activeRunwayRoles },
    runwayConfigurationTransition: state.runwayConfigurationTransition
      ? {
          ...state.runwayConfigurationTransition,
          changedRunwayIds: [
            ...state.runwayConfigurationTransition.changedRunwayIds,
          ],
          blockingFlightIds: [
            ...state.runwayConfigurationTransition.blockingFlightIds,
          ],
        }
      : null,
    surfaceDisruptions: state.surfaceDisruptions.map((disruption) => ({
      ...disruption,
      edgeIds: [...disruption.edgeIds],
      reroutedFlightIds: [...disruption.reroutedFlightIds],
    })),
    serviceVehicles: state.serviceVehicles.map((vehicle) => ({
      ...vehicle,
      outboundRoute: [...vehicle.outboundRoute],
      outboundRouteEdges: [...vehicle.outboundRouteEdges],
      returnRoute: [...vehicle.returnRoute],
      returnRouteEdges: [...vehicle.returnRouteEdges],
      standPath: vehicle.standPath.map((point) => [...point]),
    })),
    flights: state.flights.map((flight) => ({
      ...flight,
      surfaceRoute: flight.surfaceRoute ? [...flight.surfaceRoute] : undefined,
      surfaceRouteEdges: flight.surfaceRouteEdges
        ? [...flight.surfaceRouteEdges]
        : undefined,
      surfaceCongestedEdgeIds: flight.surfaceCongestedEdgeIds
        ? [...flight.surfaceCongestedEdgeIds]
        : undefined,
      runwayExit: flight.runwayExit
        ? {
            ...flight.runwayExit,
            taxiRouteEdgeIds: [...flight.runwayExit.taxiRouteEdgeIds],
            rationale: [...flight.runwayExit.rationale],
          }
        : undefined,
      surfaceReroute: flight.surfaceReroute
        ? {
            ...flight.surfaceReroute,
            disruptionIds: [...flight.surfaceReroute.disruptionIds],
            previousEdgeIds: [...flight.surfaceReroute.previousEdgeIds],
            routeEdgeIds: [...flight.surfaceReroute.routeEdgeIds],
          }
        : undefined,
      gateAssignment: flight.gateAssignment
        ? {
            ...flight.gateAssignment,
            rationale: [...flight.gateAssignment.rationale],
          }
        : undefined,
      flightPlan: cloneFlightPlan(flight.flightPlan),
      flightPlanHistory: flight.flightPlanHistory.map(cloneFlightPlan),
      navigation: {
        ...flight.navigation,
        routeFixIds: [...flight.navigation.routeFixIds],
        handoff: flight.navigation.handoff
          ? { ...flight.navigation.handoff }
          : undefined,
        routeClearance: flight.navigation.routeClearance
          ? cloneFlightRouteClearance(flight.navigation.routeClearance)
          : undefined,
        vector: flight.navigation.vector
          ? {
              ...flight.navigation.vector,
              start: { ...flight.navigation.vector.start },
            }
          : undefined,
        hold: flight.navigation.hold
          ? {
              ...flight.navigation.hold,
              start: { ...flight.navigation.hold.start },
            }
          : undefined,
      },
      fuelPlan: {
        ...flight.fuelPlan,
        arrival: { ...flight.fuelPlan.arrival },
        departure: { ...flight.fuelPlan.departure },
        assumptions: [...flight.fuelPlan.assumptions],
      },
      turnaround: {
        ...flight.turnaround,
        tasks: flight.turnaround.tasks.map((task) => ({
          ...task,
          dependencies: [...task.dependencies],
        })),
      },
      deicing: { ...flight.deicing },
      requiredCrossings: flight.requiredCrossings
        ? [...flight.requiredCrossings]
        : undefined,
      crossingClearances: flight.crossingClearances
        ? [...flight.crossingClearances]
        : undefined,
      crossingClearanceIds: flight.crossingClearanceIds
        ? [...flight.crossingClearanceIds]
        : undefined,
      goAround: flight.goAround
        ? {
            ...flight.goAround,
            weatherEscape: flight.goAround.weatherEscape
              ? { ...flight.goAround.weatherEscape }
              : undefined,
            start: { ...flight.goAround.start },
          }
        : undefined,
      weatherEscape: flight.weatherEscape
        ? { ...flight.weatherEscape }
        : undefined,
      takeoffPerformance: flight.takeoffPerformance
        ? { ...flight.takeoffPerformance }
        : undefined,
      diversion: flight.diversion
        ? { ...flight.diversion, start: { ...flight.diversion.start } }
        : undefined,
      kinematics: { ...flight.kinematics },
      motion: { ...flight.motion },
    })),
  };
}

function replayRecordingDraft(): ReplayRecordingDraft {
  return {
    protocolVersion: CONTROL_PROTOCOL_VERSION,
    snapshotSchemaVersion: CONTROL_SNAPSHOT_SCHEMA_VERSION,
    simulationVersion: window.airportControl?.version ?? CONTROL_API_VERSION,
    fixedStepSeconds: SIMULATION_STEP,
    sessionId: controlSessionId,
    recordedAt: new Date().toISOString(),
    seed: config.seed,
    airport: { code: config.code, name: config.name, scope: config.scope },
    sharing: {
      classification: "local-full",
      containsControllerIdentity: true,
      containsCorrelationIds: true,
      containsFreeText: true,
      automaticUpload: false,
      redactions: [],
    },
    initialState: cloneAirportState(initialReplayState),
    commands: structuredClone(commandHistory),
    weatherHistory: structuredClone(
      telemetryEvents.filter(
        (event) =>
          event.type.startsWith("weather") ||
          event.type.startsWith("command:setWeather"),
      ),
    ),
    soundEvents: soundscapeEvents.map(cloneSoundscapeEvent),
    events: structuredClone(telemetryEvents),
    frames: replayFrames.map((frame) => ({
      ...frame,
      surfaceSafety: frame.surfaceSafety
        ? structuredClone(frame.surfaceSafety)
        : undefined,
      state: cloneAirportState(frame.state),
    })),
  };
}

function replayRecording(): ReplayRecording {
  return createReplayRecording(replayRecordingDraft());
}

function activeReplayRecording(): ReplayRecording {
  return importedReplay ?? replayRecording();
}

async function activeReplayRecordingAsync(): Promise<ReplayRecording> {
  return importedReplay ?? createReplayRecordingAsync(replayRecordingDraft());
}

function replayPlaybackFrames(): ReplayFrame[] {
  return importedReplay?.frames ?? replayFrames;
}

function replayMarkers() {
  return (
    importedReplay?.markers ??
    deriveReplayMarkers(telemetryEvents, replayFrames)
  );
}

function resetReplayWorkspace(): void {
  importedReplay = null;
  replayVerification = null;
  replayVerificationStale = false;
  replayBaselineIndex = null;
  replayComparison = null;
}

function downloadReplayRecording(recording: ReplayRecording): void {
  const payload = JSON.stringify(recording, null, 2);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([payload], { type: "application/json" }),
  );
  link.download = replayFilename(recording);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
  setStatus(
    "Replay exported",
    recording.sharing.classification === "shareable-redacted"
      ? `${recording.frames.length.toLocaleString()} frames · identity and free text removed · no automatic upload`
      : `${recording.frames.length.toLocaleString()} frames · full local audit may contain controller identity · do not post raw`,
  );
}

function replaySeedLink(): string {
  return buildReplaySeedLink(window.location.href, {
    airport: config.code,
    seed: config.seed,
    mode: simulation.state.mode,
    scenario: simulation.state.scenario,
    density: simulation.state.trafficFlow.density,
    rules: simulation.state.separationRuleset,
    weather: simulation.state.weather.weatherEnabled
      ? simulation.state.weather.condition
      : "off",
    windDirectionDegrees: Math.round(
      mathAngleToAviationDegrees(simulation.state.weather.windDirection),
    ),
    windSpeed: simulation.state.weather.windEnabled
      ? Number(simulation.state.weather.windSpeed.toFixed(1))
      : "off",
    runwayConfiguration:
      simulation.state.runwayConfigurationMode === "manual"
        ? simulation.state.runwayConfigurationId
        : "auto",
    hazards: simulation.state.weather.hazardsEnabled,
    lighting: simulation.state.environment.lightingMode,
    season: simulation.state.environment.seasonMode,
    palette: accessibilityPalette,
  });
}

async function copyReplaySeedLink(): Promise<void> {
  const link = replaySeedLink();
  let copied = false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (!copied) {
    const input = document.createElement("textarea");
    input.value = link;
    input.className = "visually-hidden";
    document.body.append(input);
    input.select();
    copied = document.execCommand("copy");
    input.remove();
  }
  setStatus(
    copied ? "Seed link copied" : "Seed link ready",
    copied
      ? `${config.code} · seed ${config.seed} · no replay or controller identity embedded`
      : link,
    copied ? undefined : "warning",
  );
}

function matchingReplayConfig(
  recording: ReplayRecording,
): AirportConfig | null {
  if (recording.airport.code === "LOCAL")
    return generateAirportConfig(recording.seed);
  const index = HUB_AIRPORTS.findIndex(
    (airport) => airport.code === recording.airport.code,
  );
  return index < 0 ? null : generateHubConfig(index, recording.seed);
}

function loadReplayRecording(input: unknown): ReplayVerificationResult {
  return applyReplayVerification(verifyReplayRecording(input));
}

function applyReplayVerification(
  verification: ReplayVerificationResult,
): ReplayVerificationResult {
  if (!verification.exact || !verification.recording) {
    replayVerification = verification;
    replayVerificationStale = false;
    setStatus("Replay rejected", verification.reason, "critical");
    updateReplayUi();
    return verification;
  }
  const recording = verification.recording;
  if (!recording.frames.length) {
    const rejected: ReplayVerificationResult = {
      ...verification,
      accepted: false,
      exact: false,
      reason: "Replay has no recorded frames to play.",
      recording: null,
    };
    replayVerification = rejected;
    setStatus("Replay is empty", rejected.reason, "warning");
    updateReplayUi();
    return rejected;
  }
  const replayConfig = matchingReplayConfig(recording);
  if (!replayConfig) {
    const rejected = {
      ...verification,
      accepted: false,
      exact: false,
      reason: `Airport ${recording.airport.code} is not available in this build.`,
      recording: null,
    };
    replayVerification = rejected;
    setStatus("Replay airport unavailable", rejected.reason, "critical");
    updateReplayUi();
    return rejected;
  }
  if (config.code !== replayConfig.code || config.seed !== replayConfig.seed)
    newSession(true, replayConfig);
  importedReplay = recording;
  replayVerification = verification;
  replayVerificationStale = false;
  replayBaselineIndex = null;
  replayComparison = null;
  replayMode = true;
  pausedBeforeReplay = simulation.state.paused;
  simulation.setPaused(true);
  replayIndex = Math.max(0, recording.frames.length - 1);
  lastReplaySoundIndex = -1;
  replayToggle.setAttribute("aria-pressed", "true");
  replayToggle.textContent = "Live";
  playReplaySoundFrame();
  updateReplayUi();
  renderFlightStrip();
  renderFlightActions();
  setStatus(
    verification.legacyUnsealed
      ? "Legacy replay migrated"
      : "Replay verified and loaded",
    verification.reason,
    verification.legacyUnsealed ? "warning" : undefined,
  );
  return verification;
}

async function importReplayFile(file: File): Promise<void> {
  if (file.size > 250_000_000) {
    setStatus(
      "Replay rejected",
      "File exceeds the 250 MB local import limit.",
      "critical",
    );
    return;
  }
  try {
    const parsed = JSON.parse(await file.text()) as unknown;
    setStatus(
      "Checking replay",
      "validating schema, markers, and authoritative frame receipts",
    );
    applyReplayVerification(await verifyReplayRecordingAsync(parsed));
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "The file is not valid JSON.";
    setStatus("Replay import failed", reason, "critical");
  }
}

function useLiveReplayBuffer(): void {
  importedReplay = null;
  replayVerification = null;
  replayVerificationStale = false;
  replayBaselineIndex = null;
  replayComparison = null;
  const frames = replayPlaybackFrames();
  replayIndex = frames.length ? frames.length - 1 : -1;
  lastReplaySoundIndex = -1;
  updateReplayUi();
  setStatus(
    "Live replay buffer selected",
    frames.length
      ? `${frames.length} local frames available`
      : "the next simulation second will begin a new buffer",
  );
}

async function verifyActiveReplay(): Promise<void> {
  const sourceFrames = replayPlaybackFrames().length;
  const recording = await activeReplayRecordingAsync();
  const verification = await verifyReplayRecordingAsync(recording);
  replayVerification = verification;
  replayVerificationStale =
    !importedReplay && replayPlaybackFrames().length !== sourceFrames;
  updateReplayUi();
  setStatus(
    verification.exact ? "Replay verified" : "Replay mismatch",
    verification.reason,
    verification.exact ? undefined : "critical",
  );
}

async function shareActiveReplay(): Promise<void> {
  const sourceFrames = replayPlaybackFrames().length;
  const localRecording = await activeReplayRecordingAsync();
  const recording = await createShareableReplayRecordingAsync(localRecording);
  const verification = await verifyReplayRecordingAsync(recording);
  replayVerification = verification;
  replayVerificationStale =
    !importedReplay && replayPlaybackFrames().length !== sourceFrames;
  updateReplayUi();
  if (!verification.exact) {
    setStatus("Replay not shared", verification.reason, "critical");
    return;
  }
  const file = new File(
    [JSON.stringify(recording)],
    replayFilename(recording),
    { type: "application/json" },
  );
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: `${recording.airport.code} Airport Auto replay`,
        files: [file],
      });
      setStatus(
        "Replay shared",
        "portable verified file · identity and free text removed · no automatic cloud upload",
      );
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "AbortError") {
        setStatus(
          "Replay share unavailable",
          error instanceof Error
            ? error.message
            : "Use Export to save the verified file.",
          "warning",
        );
      }
    }
  } else downloadReplayRecording(recording);
}

function seekReplayFrame(frameIndex: number): void {
  const frames = replayPlaybackFrames();
  if (!frames.length) return;
  if (!replayMode) {
    pausedBeforeReplay = simulation.state.paused;
    simulation.setPaused(true);
    replayMode = true;
    replayToggle.setAttribute("aria-pressed", "true");
    replayToggle.textContent = "Live";
  }
  replayIndex = Math.max(0, Math.min(frames.length - 1, frameIndex));
  lastReplaySoundIndex = -1;
  playReplaySoundFrame();
  updateReplayUi();
  renderFlightStrip();
  renderFlightActions();
}

function setReplayBaseline(): void {
  replayBaselineIndex = replayMode && replayIndex >= 0 ? replayIndex : null;
  replayComparison = null;
  updateReplayUi();
}

function compareReplayFrames(
  leftFrameIndex: number,
  rightFrameIndex: number,
): ReplayStateComparison | null {
  const frames = replayPlaybackFrames();
  const left = frames[leftFrameIndex];
  const right = frames[rightFrameIndex];
  return left && right ? compareReplayStates(left.state, right.state) : null;
}

function compareReplayBaseline(): void {
  if (replayBaselineIndex === null || replayIndex < 0) return;
  replayComparison = compareReplayFrames(replayBaselineIndex, replayIndex);
  updateReplayUi();
}

function operationsAirportDescriptor(
  configuration: AirportConfig,
): OperationsAirportDescriptor {
  const points = configuration.surfaceGraph.nodes.map((node) => node.position);
  for (const runway of configuration.runways) {
    const halfX = Math.cos(runway.heading) * runway.length * 0.5;
    const halfZ = Math.sin(runway.heading) * runway.length * 0.5;
    points.push(
      [runway.center[0] - halfX, runway.center[1] - halfZ],
      [runway.center[0] + halfX, runway.center[1] + halfZ],
    );
  }
  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[1]);
  const margin = 12;
  return {
    code: configuration.code,
    name: configuration.name,
    scope: configuration.scope,
    runways: configuration.runways.map((runway) => ({
      id: runway.id,
      label: runway.designation?.join("/") ?? `Runway ${runway.id + 1}`,
      center: [...runway.center],
      headingRadians: runway.heading,
      length: runway.length,
    })),
    bounds: {
      minX: Math.min(...xs, -60) - margin,
      maxX: Math.max(...xs, 60) + margin,
      minZ: Math.min(...zs, -60) - margin,
      maxZ: Math.max(...zs, 60) + margin,
    },
  };
}

function operationsAnalyticsSnapshot(
  flightId: number | null = operationsLab.selectedFlightId(),
): OperationsAnalyticsSnapshot {
  return operationsAnalytics.snapshot(
    simulation.state,
    simulation.queueSnapshot(simulation.state),
    flightId,
  );
}

function operationsExportBundle(
  flightId: number | null = operationsLab.selectedFlightId(),
) {
  return buildOperationsExportBundle(
    operationsAnalyticsSnapshot(flightId),
    operationsAnalytics.allFlightSamples(),
    commandHistory,
    telemetryEvents,
    simulation.queueSnapshot(simulation.state),
  );
}

function renderOperationsLabSnapshot(
  flightId: number | null = operationsLab.selectedFlightId(),
): void {
  operationsLab.render(operationsAnalyticsSnapshot(flightId));
}

function serializeOperationsExport(
  format: "json" | "csv",
  dataset: OperationsExportDataset = "flights",
  flightId?: number,
): string {
  const resolvedDataset = isOperationsExportDataset(dataset)
    ? dataset
    : "flights";
  const bundle = operationsExportBundle(
    Number.isFinite(flightId)
      ? (flightId ?? null)
      : operationsLab.selectedFlightId(),
  );
  return format === "csv"
    ? serializeOperationsCsv(bundle, resolvedDataset, flightId)
    : JSON.stringify(bundle, null, 2);
}

function downloadText(
  filename: string,
  payload: string,
  mimeType: string,
): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([payload], { type: mimeType }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportOperationsData(
  format: "json" | "csv",
  dataset: OperationsExportDataset,
  flightId: number | null,
): void {
  const suffix = format === "json" ? "bundle" : dataset;
  const payload = serializeOperationsExport(
    format,
    dataset,
    flightId ?? undefined,
  );
  downloadText(
    `${config.code.toLowerCase()}-operations-${suffix}.${format}`,
    payload,
    format === "json" ? "application/json" : "text/csv;charset=utf-8",
  );
  setStatus(
    `${format.toUpperCase()} export ready`,
    format === "json"
      ? "local operations bundle downloaded; nothing was uploaded"
      : `${dataset.replaceAll("-", " ")} rows downloaded locally`,
  );
}

function resetOperationsAnalytics(): void {
  operationsAnalytics.reset(
    controlSessionId,
    operationsAirportDescriptor(config),
    simulation.shiftMetrics(),
    simulation.state.elapsed,
  );
  if (operationsLab.visible()) renderOperationsLabSnapshot(null);
}

function renderFlightStrip(): void {
  const allFlights = displayState().flights;
  renderStationBriefing();
  renderControllerCoordination(allFlights);
  const flights = visibleFlightsForStation(allFlights).sort(
    (first, second) =>
      FLIGHT_PHASE_ORDER[first.phase] - FLIGHT_PHASE_ORDER[second.phase] ||
      first.id - second.id,
  );
  const selectedWorkload =
    simulation.state.station === "supervisor"
      ? null
      : simulation
          .controllerWorkloads()
          .find((workload) => workload.station === simulation.state.station);
  flightStripTitle.textContent =
    simulation.state.station === "supervisor"
      ? "Live traffic"
      : `${controllerStationLabel(simulation.state.station)} bay`;
  if (
    focusedFlightId !== null &&
    !flights.some((flight) => flight.id === focusedFlightId)
  )
    focusedFlightId = null;
  const visibleIds = new Set(flights.map((flight) => flight.id));
  for (const flightId of groupedFlightIds) {
    if (!visibleIds.has(flightId)) groupedFlightIds.delete(flightId);
  }
  updateGroupSelectUi();
  flightStripCount.textContent = selectedWorkload
    ? `${flights.length} tracks · ${selectedWorkload.workload}`
    : `${flights.length} aircraft`;
  if (!flights.length) {
    flightChips.replaceChildren(
      Object.assign(document.createElement("p"), {
        className: "flight-chips__empty",
        textContent:
          simulation.state.station === "supervisor"
            ? "No active tracks · waiting at the edge of the scope"
            : `No ${simulation.state.station} traffic awaiting action`,
      }),
    );
    renderGroupActions();
    renderFlightActions();
    renderClearanceAdvisor();
    return;
  }
  const liveIds = new Set(flights.map((flight) => String(flight.id)));
  for (const child of [...flightChips.children]) {
    if (
      !(child instanceof HTMLElement) ||
      !child.dataset.flightItem ||
      !liveIds.has(child.dataset.flightItem)
    )
      child.remove();
  }
  for (const flight of flights) {
    let item = flightChips.querySelector<HTMLElement>(
      `[data-flight-item="${flight.id}"]`,
    );
    if (!item) {
      item = document.createElement("div");
      item.dataset.flightItem = String(flight.id);
      item.setAttribute("role", "listitem");
      item.innerHTML =
        '<button class="flight-chip" type="button"><span class="flight-chip__identity"><strong></strong><span></span></span><span class="flight-chip__route"></span><span class="flight-chip__metrics"><span class="flight-chip__metric"><small>Fuel</small><b></b></span><span class="flight-chip__metric"><small></small><b></b></span><span class="flight-chip__metric"><small>Altitude</small><b></b></span><span class="flight-chip__metric"><small>Heading</small><b></b></span></span><span class="flight-chip__detail"><span></span><span class="flight-chip__trend"></span></span><span class="flight-chip__fuel" aria-hidden="true"><i></i></span></button>';
    }
    updateFlightChip(item, flight);
    flightChips.append(item);
  }
  renderGroupActions();
  renderFlightActions();
  renderClearanceAdvisor();
}

function updatePauseControl(): void {
  const paused = simulation.state.paused;
  pauseButton.setAttribute("aria-pressed", String(paused));
  pauseButton.classList.toggle("control--active", paused);
  pauseIcon.textContent = paused ? "▶" : "Ⅱ";
  pauseLabel.textContent = paused ? "Resume" : "Pause";
}

function renderTrainingCoach(force = false): void {
  const training = simulation.trainingSnapshot();
  const active = training.status !== "inactive";
  document.body.classList.toggle("training-active", active);
  trainingCoach.hidden = !active;
  trainingStart.textContent = active
    ? "Restart selected lesson"
    : "Begin no-fail lesson";
  if (!active) {
    trainingCoachRenderKey = "";
    return;
  }
  const key = JSON.stringify({
    status: training.status,
    lesson: training.lessonId,
    step: training.stepIndex,
    target: training.targetFlightId,
    mistakes: training.mistakeCount,
    recoveries: training.recoveryCount,
    hints: training.hintCount,
    feedback: training.feedback,
    context: training.context,
    paused: simulation.state.paused,
  });
  if (!force && key === trainingCoachRenderKey) return;
  const previousMistakes = Number(trainingCoach.dataset.mistakes ?? "0");
  const previousStatus = trainingCoach.dataset.status;
  trainingCoachRenderKey = key;
  trainingCoach.dataset.status = training.status;
  trainingCoach.dataset.mistakes = String(training.mistakeCount);
  trainingTitle.textContent = training.lesson?.title ?? "Controller training";
  trainingProgress.textContent = training.step
    ? `${training.step.number} / ${training.step.count}`
    : "Complete";
  const objectiveCopy =
    training.status === "complete"
      ? "Lesson complete. Continue the shift or choose another lesson."
      : (training.step?.objective ?? "Follow the current coaching prompt.");
  if (trainingObjective.textContent !== objectiveCopy)
    trainingObjective.textContent = objectiveCopy;
  trainingContextCopy.textContent =
    training.status === "complete"
      ? `${training.completedStepIds.length} steps complete · ${training.mistakeCount} coached correction${training.mistakeCount === 1 ? "" : "s"} · ${training.recoveryCount} checkpoint recover${training.recoveryCount === 1 ? "y" : "ies"}`
      : training.context;
  trainingWhy.textContent =
    training.step?.why ?? training.lesson?.summary ?? "";
  const feedbackCopy = training.feedback ?? "";
  if (trainingFeedback.textContent !== feedbackCopy)
    trainingFeedback.textContent = feedbackCopy;
  trainingFeedback.hidden =
    !training.feedback || training.status === "complete";
  trainingContinue.textContent =
    training.status === "complete"
      ? "Continue shift"
      : training.status === "active"
        ? "Pause"
        : "Continue";
  trainingRetry.disabled = training.status === "complete";
  trainingSkip.disabled = training.status === "complete";
  trainingHint.disabled = training.status === "complete";
  if (training.mistakeCount > previousMistakes) trainingExplanation.open = true;
  if (training.status === "complete" && previousStatus !== "complete")
    trainingExplanation.open = false;
  updatePauseControl();
}

function closeChallengeResults(): void {
  if (challengeResults.hidden) return;
  challengeResults.classList.add("modal--hidden");
  challengeResults.hidden = true;
  setExclusiveModal(null);
}

function showChallengeResults(snapshot: ChallengeSnapshot): void {
  challengePanel.renderResults(snapshot);
  challengeResults.hidden = false;
  setExclusiveModal(challengeResults);
  requestAnimationFrame(() => {
    challengeResults.classList.remove("modal--hidden");
    challengeRetry.focus();
  });
  setStatus(
    snapshot.status === "complete"
      ? "Challenge complete"
      : "Challenge debrief ready",
    snapshot.completionReason ?? "review the operational summary",
  );
}

function renderChallengeExperience(force = false): void {
  const snapshot = simulation.challengeSnapshot();
  challengePanel.render(snapshot, force);
  const active = snapshot.status === "briefing" || snapshot.status === "active";
  const terminal =
    snapshot.status === "complete" ||
    snapshot.status === "failed" ||
    snapshot.status === "abandoned";
  document.body.classList.toggle("challenge-active", active);
  if (terminal && snapshot.status !== lastChallengeStatus) {
    recordTelemetry(
      `challenge:${snapshot.status}`,
      undefined,
      undefined,
      undefined,
      {
        detail: snapshot.completionReason ?? "challenge debrief ready",
        payload: snapshot,
      },
    );
    showChallengeResults(snapshot);
  } else if (!terminal && !challengeResults.hidden) {
    closeChallengeResults();
  }
  lastChallengeStatus = snapshot.status;
}

function renderSandboxExperience(force = false): void {
  const snapshot = simulation.sandboxSnapshot();
  sandboxPanel.render(snapshot, force);
  document.body.classList.toggle("sandbox-active", snapshot.active);
  if (snapshot.active !== lastSandboxActive) {
    stationBriefingRenderKey = "";
    renderStationBriefing();
  }
  lastSandboxActive = snapshot.active;
}

function openSandbox(backgroundTraffic = false): boolean {
  const accepted = simulation.startSandbox(backgroundTraffic);
  if (!accepted) return false;
  simulationAccumulator = 0;
  previousPresentation = capturePresentation(simulation.state);
  world.snapToAuthoritativeState();
  replayFrames.length = 0;
  resetReplayWorkspace();
  commandHistory.length = 0;
  initialReplayState = cloneAirportState(simulation.state);
  resetOperationsAnalytics();
  lastArrivals = -1;
  lastDepartures = -1;
  lastHudSecond = -1;
  scenarioSelect.value = simulation.state.scenario;
  densitySelect.value = simulation.state.trafficFlow.density;
  introDensitySelect.value = simulation.state.trafficFlow.density;
  stationSelect.value = simulation.state.station;
  clearFlightFocus();
  groupSelectActive = false;
  groupedFlightIds.clear();
  groupActionsRenderKey = "";
  flightActionsRenderKey = "";
  setFlightStripCollapsed(false);
  clearRoute();
  renderFlightStrip();
  renderFlightActions();
  renderTrainingCoach(true);
  renderChallengeExperience(true);
  renderSandboxExperience(true);
  updateModeControl();
  updateStationAutomationUi();
  updateWeatherUi();
  updateQueueInspectorControl();
  renderQueueInspector();
  updateSurfaceDisruptionTargets();
  surfaceDisruptionUiKey = "";
  renderSurfaceDisruptionControls();
  updatePauseControl();
  return true;
}

function beginTrainingLesson(lessonId: TrainingLessonId): boolean {
  simulation.setMode("manual");
  simulation.setTrafficDensity("quiet");
  controlSelect.value = "manual";
  introControlSelect.value = "manual";
  scenarioSelect.value = "training";
  densitySelect.value = "quiet";
  introDensitySelect.value = "quiet";
  stationSelect.value = "supervisor";
  newSession(false, config);
  const accepted = simulation.startTrainingLesson(lessonId);
  if (!accepted) return false;
  initialReplayState = cloneAirportState(simulation.state);
  resetOperationsAnalytics();
  stationSelect.value = simulation.state.station;
  updateModeControl();
  updateStationAutomationUi();
  updateWeatherUi();
  setFlightStripCollapsed(false);
  trainingExplanation.open = false;
  trainingCoachRenderKey = "";
  renderTrainingCoach(true);
  renderFlightStrip();
  renderFlightActions();
  return true;
}

function loadDailyChallenge(plan: DailyChallengePlan): boolean {
  selectAirport(plan.airportCode, true, plan.seed);
  if (!selectControl(plan.mode)) return false;
  setSeparationRules(plan.separationRuleset);
  setStation(plan.station);
  challengeSelect.value = plan.challengeId;
  const accepted = openChallengeBriefing(plan.challengeId);
  if (accepted) {
    challengeSetup.open = true;
    setControlPanelOpen(false);
  }
  return accepted;
}

function openChallengeBriefing(challengeId: ChallengeId): boolean {
  const accepted = simulation.startChallenge(challengeId);
  if (!accepted) return false;
  simulationAccumulator = 0;
  previousPresentation = capturePresentation(simulation.state);
  world.snapToAuthoritativeState();
  controlSelect.value = simulation.state.mode;
  introControlSelect.value = simulation.state.mode;
  scenarioSelect.value = simulation.state.scenario;
  densitySelect.value = simulation.state.trafficFlow.density;
  introDensitySelect.value = simulation.state.trafficFlow.density;
  separationRulesSelect.value = simulation.state.separationRuleset;
  introSeparationRulesSelect.value = simulation.state.separationRuleset;
  stationSelect.value = simulation.state.station;
  weatherSelection = simulation.state.weather.condition;
  replayFrames.length = 0;
  resetReplayWorkspace();
  commandHistory.length = 0;
  initialReplayState = cloneAirportState(simulation.state);
  resetOperationsAnalytics();
  lastArrivals = -1;
  lastDepartures = -1;
  lastHudSecond = -1;
  lastChallengeStatus = "inactive";
  setFlightStripCollapsed(false);
  updateModeControl();
  updateStationAutomationUi();
  updateWeatherUi();
  updatePauseControl();
  surfaceDisruptionUiKey = "";
  renderSurfaceDisruptionControls();
  renderFlightStrip();
  renderFlightActions();
  renderTrainingCoach(true);
  renderChallengeExperience(true);
  return true;
}

function currentControllerPerformance(): ControllerPerformanceSnapshot[] {
  const state = simulation.state;
  const key = `${config.seed}|${Math.floor(state.elapsed)}|${telemetrySequence}|${state.mode}|${state.station}|${state.arrivals}|${state.departures}|${state.flights.length}`;
  if (key !== controllerPerformanceCacheKey) {
    controllerPerformanceCacheKey = key;
    controllerPerformanceCache = simulation.controllerPerformance();
  }
  return controllerPerformanceCache;
}

function buildControllerEvaluation(
  diagnostics: ReturnType<
    AirportSimulation["diagnostics"]
  > = simulation.diagnostics(),
): ControllerEvaluationSnapshot {
  return controllerEvaluationSnapshot({
    state: simulation.state,
    metrics: diagnostics.metrics,
    queues: diagnostics.queues,
    predictions: diagnostics.predictions,
    workloads: simulation.controllerWorkloads(),
    commands: commandHistory.map((entry) => ({
      id: entry.commandId,
      elapsedSeconds: entry.elapsed,
      station: entry.station,
      source: entry.source,
      actorId: entry.actorId,
      clientId: entry.clientId,
      command: entry.command,
      accepted: entry.accepted,
      reason: entry.reason,
    })),
  });
}

function currentControllerEvaluation(): ControllerEvaluationSnapshot {
  const state = simulation.state;
  const runtime = state.scriptedControllers;
  const key = `${config.seed}|${Math.floor(state.elapsed)}|${telemetrySequence}|${commandHistory.length}|${runtime.nextDecisionSequence}|${state.flights.length}`;
  if (key !== controllerEvaluationCacheKey || !controllerEvaluationCache) {
    controllerEvaluationCacheKey = key;
    controllerEvaluationCache = buildControllerEvaluation();
  }
  return controllerEvaluationCache;
}

function renderStationBriefing(): void {
  const state = displayState();
  const enabled =
    !replayMode &&
    !state.sandbox.active &&
    (state.mode === "manual" || state.mode === "assisted");
  stationBriefing.hidden = !enabled;
  if (!enabled) {
    stationBriefingRenderKey = "";
    lastControllerAlertKey = "";
    return;
  }
  const performance = currentControllerPerformance().find(
    (snapshot) => snapshot.station === state.station,
  );
  if (!performance) return;
  const evaluation = currentControllerEvaluation();
  const stationEvaluation = evaluation.stations.find(
    (snapshot) => snapshot.station === state.station,
  );
  const visibleAlerts = performance.alerts.slice(0, 2);
  const key = JSON.stringify([
    performance.station,
    performance.score,
    performance.status,
    performance.summary,
    performance.objectives.map((objective) => [
      objective.id,
      objective.displayValue,
      objective.target,
      objective.status,
      objective.detail,
    ]),
    visibleAlerts.map((item) => [
      item.id,
      item.severity,
      item.label,
      item.detail,
    ]),
    stationEvaluation,
    evaluation.operations,
    evaluation.safety,
    evaluation.fuel,
  ]);
  if (key === stationBriefingRenderKey) return;
  stationBriefingRenderKey = key;
  const expectedObjectives = performance.objectives
    .map((objective) => objective.id)
    .join("|");
  const renderedObjectives = stationBriefingNodes
    ? [...stationBriefingNodes.objectives.keys()].join("|")
    : "";
  if (
    !stationBriefingNodes ||
    stationBriefingNodes.station !== performance.station ||
    renderedObjectives !== expectedObjectives
  ) {
    stationBriefingNodes = createStationBriefingNodes(performance);
  }
  const nodes = stationBriefingNodes;
  stationBriefing.dataset.status = performance.status;
  stationBriefing.setAttribute(
    "aria-label",
    `${performance.label} role briefing. ${performance.trafficScope} ${performance.authoritySummary}`,
  );
  nodes.status.textContent = performance.status;
  nodes.score.textContent = String(performance.score).padStart(3, "0");
  nodes.scope.textContent = performance.summary;
  nodes.trafficScope.textContent = performance.trafficScope;
  nodes.authority.textContent = `Authority: ${performance.authoritySummary}`;
  for (const objective of performance.objectives) {
    const objectiveNodes = nodes.objectives.get(objective.id);
    if (!objectiveNodes) continue;
    objectiveNodes.item.dataset.status = objective.status;
    objectiveNodes.item.title = `${objective.detail} Target: ${objective.target}.`;
    objectiveNodes.label.textContent = objective.label;
    objectiveNodes.value.textContent = objective.displayValue;
    objectiveNodes.target.textContent = objective.target;
  }
  nodes.evaluation.update(evaluation, performance.station);

  if (!visibleAlerts.length) {
    const nominal = document.createElement("small");
    nominal.textContent = "All desk targets nominal";
    nodes.alerts.replaceChildren(nominal);
  } else {
    nodes.alerts.replaceChildren(
      ...visibleAlerts.map((controllerAlert) => {
        const item = document.createElement("p");
        item.dataset.severity = controllerAlert.severity;
        item.title = controllerAlert.detail;
        const label = document.createElement("b");
        label.textContent = controllerAlert.label;
        const detail = document.createElement("span");
        detail.textContent = controllerAlert.detail;
        item.append(label, detail);
        return item;
      }),
    );
  }

  const urgent = performance.alerts.find((item) => item.severity === "urgent");
  const alertKey = urgent?.id ?? "";
  if (urgent && alertKey !== lastControllerAlertKey)
    setStatus(`${performance.label} alert`, urgent.detail);
  lastControllerAlertKey = alertKey;
}

function createStationBriefingNodes(
  performance: ControllerPerformanceSnapshot,
) {
  const header = document.createElement("header");
  const identity = document.createElement("div");
  const title = document.createElement("b");
  title.textContent = `${performance.label} objectives`;
  const status = document.createElement("small");
  identity.append(title, status);
  const score = document.createElement("strong");
  const scoreValue = document.createElement("span");
  const scoreUnit = document.createElement("small");
  scoreUnit.textContent = "/100";
  score.append(scoreValue, scoreUnit);
  header.append(identity, score);

  const scope = document.createElement("p");
  scope.className = "station-briefing__scope";

  const role = document.createElement("details");
  role.className = "station-briefing__role";
  const roleSummary = document.createElement("summary");
  roleSummary.textContent = "Scope & authority";
  const trafficScope = document.createElement("p");
  const authority = document.createElement("p");
  role.append(roleSummary, trafficScope, authority);

  const objectives = document.createElement("div");
  objectives.className = "station-briefing__objectives";
  const objectiveNodes = new Map<
    string,
    {
      item: HTMLElement;
      label: HTMLElement;
      value: HTMLElement;
      target: HTMLElement;
    }
  >();
  for (const objective of performance.objectives) {
    const item = document.createElement("span");
    const label = document.createElement("small");
    const value = document.createElement("b");
    const target = document.createElement("i");
    item.append(label, value, target);
    objectives.append(item);
    objectiveNodes.set(objective.id, { item, label, value, target });
  }

  const alertList = document.createElement("div");
  alertList.className = "station-briefing__alerts";
  const evaluation = createControllerEvaluationPanel();
  stationBriefing.replaceChildren(
    header,
    scope,
    role,
    objectives,
    evaluation.element,
    alertList,
  );
  return {
    station: performance.station,
    status,
    score: scoreValue,
    scope,
    trafficScope,
    authority,
    objectives: objectiveNodes,
    evaluation,
    alerts: alertList,
  };
}

function renderControllerCoordination(flights: readonly Flight[]): void {
  const state = displayState();
  const options = {
    flights,
    station: state.station,
    elapsedSeconds: state.elapsed,
    enabled: state.mode === "manual" || state.mode === "assisted",
    readOnly: replayMode,
  };
  const key = coordinationInboxKey(options);
  if (key === coordinationInboxRenderKey) return;
  coordinationInboxRenderKey = key;
  renderCoordinationInbox(coordinationInbox, options);
}

function visibleFlightsForStation(flights: Flight[]): Flight[] {
  if (
    simulation.state.mode === "auto" ||
    simulation.state.mode === "watch" ||
    simulation.state.station === "supervisor"
  )
    return [...flights];
  return flights.filter(
    (flight) =>
      flight.navigation.frequencyOwner === simulation.state.station ||
      requiredControllerStation(flight) === simulation.state.station ||
      flight.navigation.handoff?.from === simulation.state.station ||
      flight.navigation.handoff?.to === simulation.state.station,
  );
}

function updateFlightChip(item: HTMLElement, flight: Flight): void {
  const button = item.querySelector<HTMLButtonElement>("button")!;
  const kinematics = flight.kinematics;
  const surface =
    flight.phase === "taxi-in" ||
    flight.phase === "taxi-out" ||
    flight.phase === "resting";
  const held = Boolean(
    flight.controlHold ||
    flight.automaticHold ||
    flight.crossingHoldRunway !== undefined ||
    flight.safetyHold,
  );
  const speed = surface ? kinematics.groundSpeedKts : kinematics.airspeedKts;
  const speedLabel = surface ? "GS" : "IAS";
  const altitude = Math.max(0, Math.round(kinematics.altitudeFt / 10) * 10);
  const verticalSpeed = Math.round(kinematics.verticalSpeedFpm / 100) * 100;
  const verticalText =
    Math.abs(verticalSpeed) < 100
      ? "LEVEL"
      : `${verticalSpeed > 0 ? "↑" : "↓"} ${Math.abs(verticalSpeed).toLocaleString()} FPM`;
  const acceleration = kinematics.accelerationMps2;
  const motionText =
    acceleration > 0.06
      ? `ACC +${acceleration.toFixed(1)} M/S²`
      : acceleration < -0.06
        ? `BRAKE ${acceleration.toFixed(1)} M/S²`
        : "SPEED STABLE";
  const fuel = Math.max(0, Math.min(100, kinematics.fuelPercent));
  const heading =
    Math.round(mathAngleToAviationDegrees(flight.motion.heading)) % 360;
  const headingDisplay = heading === 0 ? 360 : heading;
  const headingCardinal = cardinalDirection(heading);
  const operation = flightOperationLabel(flight);
  const airportLife = airportLifeVisible ? flight.operationalDetail : null;
  const routeDisplay = `${flight.flightPlan.origin}→${flight.flightPlan.destination}`;
  const routePlaceDisplay = airportRouteLabel(
    flight.flightPlan.origin,
    flight.flightPlan.destination,
  );
  const phase = held ? "Hold" : operation;
  const assignment = flight.gateAssignment;
  const stand =
    config.surfaceGraph.stands.find(
      (candidate) => candidate.id === assignment?.standId,
    ) ??
    config.surfaceGraph.stands.find(
      (candidate) => candidate.slot === flight.gateSlot,
    );
  const gateLabel = assignment?.gateRef
    ? `Gate ${assignment.gateRef}`
    : assignment?.zoneName
      ? assignment.zoneName.replace(/ Ramp$/i, "")
      : stand?.id
        ? `Stand ${stand.id}`
        : null;
  const gateDisplay = gateLabel
    ? flight.phase === "approach" ||
      flight.phase === "landing" ||
      flight.phase === "taxi-in"
      ? `${gateLabel} planned`
      : flight.phase === "taxi-out" || flight.phase === "takeoff"
        ? `from ${gateLabel}`
        : gateLabel
    : null;
  const gateTime = assignment
    ? flight.phase === "resting"
      ? `out ${formatTime(assignment.scheduledDepartureSeconds)}`
      : flight.phase === "approach" ||
          flight.phase === "landing" ||
          flight.phase === "taxi-in"
        ? `ETA ${formatTime(assignment.scheduledGateInSeconds)}`
        : null
    : null;
  const runwayExitDisplay =
    flight.runwayExit &&
    (flight.phase === "approach" ||
      flight.phase === "landing" ||
      flight.phase === "taxi-in")
      ? `RWY ${runwayDesignation(flight.runway)} · EXIT ${flight.runwayExit.taxiwayName}`
      : null;
  button.dataset.flightChip = String(flight.id);
  const grouped = groupSelectActive && groupedFlightIds.has(flight.id);
  button.className = [
    "flight-chip",
    focusedFlightId === flight.id ? "flight-chip--selected" : "",
    grouped ? "flight-chip--group-selected" : "",
    held ? "flight-chip--hold" : "",
    flight.emergency ? "flight-chip--emergency" : "",
    fuel < 15 ? "flight-chip--low-fuel" : "",
  ]
    .filter(Boolean)
    .join(" ");
  button.style.setProperty(
    "--flight-accent",
    flight.palette === "rose"
      ? "var(--rose)"
      : flight.palette === "sage"
        ? "#9bc8a0"
        : "var(--blue)",
  );
  button.style.setProperty("--fuel", `${fuel.toFixed(1)}%`);
  const holdDetail = flight.automaticHoldReason ?? flight.safetyHoldReason;
  const trafficClass =
    flight.operationPlan.trafficClass === "general-aviation"
      ? "GA"
      : flight.operationPlan.trafficClass.charAt(0).toUpperCase() +
        flight.operationPlan.trafficClass.slice(1);
  button.setAttribute(
    "aria-label",
    `${flight.callsign}, ${flight.aircraft}, from ${airportPlaceLabel(flight.flightPlan.origin, false)} to ${airportPlaceLabel(flight.flightPlan.destination, false)}, ${trafficClass} traffic, ${phase}${holdDetail ? `, ${holdDetail}` : ""}${gateDisplay ? `, ${gateDisplay}` : ""}${gateTime ? `, ${gateTime}` : ""}, fuel ${fuel.toFixed(1)} percent, ${speedLabel} ${speed.toFixed(0)} knots, altitude ${altitude} feet, heading ${String(headingDisplay).padStart(3, "0")} degrees ${headingCardinal}`,
  );
  button.setAttribute(
    "aria-pressed",
    String(grouped || focusedFlightId === flight.id),
  );
  const fuelPlan =
    flight.phase === "approach" ||
    flight.phase === "landing" ||
    flight.phase === "taxi-in"
      ? `modeled arrival reserve ${flight.fuelPlan.modeledArrivalFuelPercent.toFixed(1)}% · ${flight.fuelPlan.arrival.estimatedDistanceNm.toLocaleString()} NM inbound`
      : `dispatch plan ${flight.fuelPlan.departure.dispatchFuelPercent.toFixed(1)}% · ${flight.fuelPlan.departure.estimatedDistanceNm.toLocaleString()} NM outbound`;
  button.title = [
    routePlaceDisplay,
    `${routeDisplay} · ${flight.flightPlan.route.join(" · ")} · ${flight.flightPlan.procedure}`,
    fuelPlan,
    airportLife?.reason,
    airportLife?.maintenanceReason,
    assignment?.rationale.join(" · "),
    flight.phase === "resting" ? turnaroundLongSummary(flight) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const identity = button.querySelector(".flight-chip__identity")!;
  identity.querySelector("strong")!.textContent = flight.callsign;
  identity.querySelector("span")!.textContent = phase;
  button.querySelector<HTMLElement>(".flight-chip__route")!.textContent =
    routePlaceDisplay;
  const metrics = button.querySelectorAll<HTMLElement>(".flight-chip__metric");
  metrics[0].querySelector("b")!.innerHTML =
    `${fuel.toFixed(fuel < 20 ? 1 : 0)}<em>%</em>`;
  metrics[1].querySelector("small")!.textContent = speedLabel;
  metrics[1].querySelector("b")!.innerHTML = `${Math.round(speed)}<em>KT</em>`;
  metrics[2].querySelector("b")!.innerHTML =
    `${altitude.toLocaleString()}<em>FT</em>`;
  metrics[3].querySelector("b")!.innerHTML =
    `${String(headingDisplay).padStart(3, "0")}<em>° ${headingCardinal}</em>`;
  const detail = button.querySelector(".flight-chip__detail")!;
  detail.children[0].textContent = `${routeDisplay} · ${flight.aircraft} · ${trafficClass}${airportLife ? ` · ${airportLife.label}` : ""} · ${operation} · ${runwayExitDisplay ?? gateDisplay ?? `RWY ${runwayDesignation(flight.runway)}`}${runwayExitDisplay && gateDisplay ? ` · ${gateDisplay}` : ""}${gateTime ? ` · ${gateTime}` : ""}`;
  detail.children[1].textContent =
    held && holdDetail
      ? `HOLD · ${holdDetail.toUpperCase()}`
      : (deicingChipSummary(flight) ??
        (flight.phase === "resting"
          ? turnaroundChipSummary(flight)
          : `${surface ? flight.engineState.toUpperCase() + " ENGINES · " : ""}${verticalText} · ${motionText}`));
}

function formatPhase(phase: FlightPhase): string {
  return phase.replace("-", " ");
}

function flightOperationLabel(flight: Flight): string {
  if (flight.emergency === "disabled") {
    const recovery = displayState().surfaceDisruptions.find(
      (disruption) => disruption.flightId === flight.id,
    );
    return recovery?.status === "recovering"
      ? `Recovery ${Math.round(recovery.recoveryProgress * 100)}%`
      : "Disabled · awaiting recovery";
  }
  if (flight.surfaceReroute?.status === "holding") return "Route unavailable";
  if (flight.diversion) return `Divert ${flight.diversion.airportCode}`;
  if (flight.goAround)
    return flight.motion.stage === "go-around-reentry"
      ? "Rejoining arrival"
      : "Go around";
  if (flight.phase === "resting") {
    if (flight.operationalDetail.airworthinessStatus === "out-of-service")
      return "Maintenance hold";
    if (flight.turnaround.status !== "ready")
      return `Turnaround ${Math.round(flight.turnaround.progress * 100)}%`;
    if (flight.deicing.status === "unavailable")
      return "Winter route unavailable";
    return flight.pushbackCleared
      ? "Push cleared"
      : flight.deicing.status === "planned"
        ? "Ready · deice planned"
        : "Ready push";
  }
  if (flight.phase === "taxi-out" && flight.tugAttached)
    return `Pushback ${flight.pushbackDirection}`;
  if (flight.phase === "taxi-out" && flight.deicing.required) {
    if (flight.deicing.status === "enroute") return "Taxi to deice";
    if (flight.deicing.status === "queued")
      return `Deice queue ${flight.deicing.queuePosition || ""}`.trim();
    if (flight.deicing.status === "positioning") return "Entering deice";
    if (flight.deicing.status === "treating")
      return `Deicing ${Math.round((flight.deicing.treatmentElapsedSeconds / Math.max(0.1, flight.deicing.treatmentDurationSeconds)) * 100)}%`;
    if (flight.deicing.status === "protected")
      return `Deiced · ${Math.ceil(flight.deicing.holdoverRemainingSeconds)}s`;
    if (flight.deicing.status === "expired") return "Deice expired";
    if (flight.deicing.status === "unavailable")
      return "Winter route unavailable";
  }
  return formatPhase(flight.phase);
}

function deicingChipSummary(flight: Flight): string | null {
  const deicing = flight.deicing;
  if (!deicing.required) return null;
  if (deicing.status === "planned")
    return `${deicing.facilityName} · LANE ${deicing.laneNumber} PLANNED`;
  if (deicing.status === "enroute")
    return `${deicing.facilityName} · TAXI TO LANE ${deicing.laneNumber}`;
  if (deicing.status === "queued")
    return `${deicing.facilityName} · QUEUE ${deicing.queuePosition}`;
  if (deicing.status === "positioning")
    return `${deicing.facilityName} · ENTERING LANE ${deicing.laneNumber}`;
  if (deicing.status === "treating")
    return `${deicing.fluid.toUpperCase()} · ${Math.round((deicing.treatmentElapsedSeconds / Math.max(0.1, deicing.treatmentDurationSeconds)) * 100)}%`;
  if (deicing.status === "protected")
    return `HOLDOVER ${Math.ceil(deicing.holdoverRemainingSeconds)} SEC · CYCLE ${deicing.cycle}`;
  if (deicing.status === "expired") return "HOLDOVER EXPIRED · RETURN TO PAD";
  return deicing.reason.toUpperCase();
}

const TURNAROUND_SHORT_LABEL: Record<TurnaroundServiceType, string> = {
  fueling: "fuel",
  baggage: "bags",
  cargo: "cargo",
  catering: "catering",
  cleaning: "cleaning",
  boarding: "boarding",
  maintenance: "maintenance",
};

function turnaroundChipSummary(flight: Flight): string {
  const turnaround = flight.turnaround;
  if (turnaround.status === "ready")
    return serviceVehiclesBlockingPush(flight.id).length
      ? "RAMP EQUIPMENT CLEARING"
      : "ALL SERVICES COMPLETE";
  if (turnaround.status === "released") return "TURNAROUND RELEASED";
  if (turnaround.status === "planned") return "SERVICES PLANNED";
  const active = turnaround.tasks.filter((task) => task.status === "active");
  const waiting = turnaround.tasks.filter((task) => task.status === "waiting");
  const labels = active
    .slice(0, 2)
    .map(
      (task) =>
        `${TURNAROUND_SHORT_LABEL[task.type]} ${Math.round((task.elapsedSeconds / Math.max(0.1, task.durationSeconds)) * 100)}%`,
    );
  if (active.length > 2) labels.push(`+${active.length - 2}`);
  if (!labels.length && waiting.length)
    labels.push(`${TURNAROUND_SHORT_LABEL[waiting[0].type]} waiting`);
  return labels.join(" · ").toUpperCase();
}

function serviceVehiclesForFlight(flightId: number) {
  return displayState().serviceVehicles.filter(
    (vehicle) => vehicle.flightId === flightId,
  );
}

function serviceVehiclesBlockingPush(flightId: number) {
  return serviceVehiclesForFlight(flightId).filter(
    (vehicle) =>
      vehicle.status === "approaching" ||
      vehicle.status === "servicing" ||
      vehicle.status === "clearing",
  );
}

function serviceVehicleStatusLabel(
  status: (typeof simulation.state.serviceVehicles)[number]["status"],
): string {
  if (status === "dispatching") return "en route";
  if (status === "approaching") return "parking";
  if (status === "servicing") return "working";
  if (status === "clearing") return "clearing";
  if (status === "returning") return "returning";
  return status;
}

function turnaroundLongSummary(flight: Flight): string {
  const required = flight.turnaround.tasks.filter((task) => task.required);
  return required.map((task) => `${task.label}: ${task.status}`).join(" · ");
}

function updateGroupSelectUi(): void {
  groupSelectToggle.setAttribute("aria-pressed", String(groupSelectActive));
  groupSelectToggle.textContent = groupSelectActive
    ? "Done selecting"
    : "Group select";
  groupSelectCount.textContent = groupSelectActive
    ? `${groupedFlightIds.size} selected`
    : "Choose 2–8";
}

function setGroupSelectActive(active: boolean, announce = true): void {
  groupSelectActive = active;
  groupedFlightIds.clear();
  groupActionsRenderKey = "";
  if (active) {
    clearFlightFocus();
  }
  updateGroupSelectUi();
  renderFlightStrip();
  renderFlightActions();
  if (!announce) return;
  setStatus(
    active ? "Group selection active" : "Group selection closed",
    active
      ? "choose 2–8 aircraft; only shared safe instructions will appear"
      : "individual aircraft controls restored",
  );
}

function toggleGroupFlightSelection(flight: Flight): void {
  if (groupedFlightIds.has(flight.id)) groupedFlightIds.delete(flight.id);
  else if (groupedFlightIds.size >= 8) {
    setStatus(
      "Group is full",
      "a grouped instruction can include at most eight aircraft",
    );
    return;
  } else groupedFlightIds.add(flight.id);
  groupActionsRenderKey = "";
  renderFlightStrip();
  setStatus(
    `${groupedFlightIds.size} flight${groupedFlightIds.size === 1 ? "" : "s"} selected`,
    groupedFlightIds.size < 2
      ? "choose at least one more aircraft"
      : "available shared instructions are rechecked live",
  );
}

function renderGroupActions(): void {
  if (!groupSelectActive) {
    groupActions.hidden = true;
    groupActionsRenderKey = "";
    return;
  }
  const selected = [...groupedFlightIds]
    .map((id) => displayState().flights.find((flight) => flight.id === id))
    .filter((flight): flight is Flight => flight !== undefined);
  const instructions: Array<{
    instruction: GroupFlightInstruction;
    label: string;
  }> = [
    { instruction: "hold", label: "Hold all" },
    { instruction: "resume", label: "Resume all" },
    { instruction: "slow", label: "Slow all" },
    { instruction: "normal", label: "Normal pace" },
  ];
  const previews =
    selected.length >= 2
      ? instructions.map((option) => ({
          ...option,
          preview: simulation.previewGroupedInstruction(
            selected.map((flight) => flight.id),
            option.instruction,
          ),
        }))
      : [];
  const renderKey = [
    simulation.state.station,
    replayMode,
    ...selected.map(
      (flight) =>
        `${flight.id}:${flight.phase}:${flight.navigation.frequencyOwner}:${flight.controlHold}:${flight.controlPace ?? 1}:${requiredControllerStation(flight)}`,
    ),
    ...previews.map(
      ({ instruction, preview }) =>
        `${instruction}:${preview.safeToIssue}:${preview.reason}`,
    ),
  ].join("|");
  if (groupActionsRenderKey === renderKey) {
    groupActions.hidden = false;
    return;
  }
  groupActionsRenderKey = renderKey;
  groupActions.replaceChildren();
  groupActions.hidden = false;

  const heading = document.createElement("header");
  const identity = document.createElement("div");
  const title = document.createElement("b");
  const detail = document.createElement("small");
  const clear = document.createElement("button");
  title.textContent = `${selected.length} selected`;
  detail.textContent = selected.length
    ? selected.map((flight) => flight.callsign).join(" · ")
    : "Choose aircraft from the strips or map";
  clear.type = "button";
  clear.dataset.groupAction = "clear";
  clear.textContent = "Clear";
  identity.append(title, detail);
  heading.append(identity, clear);
  groupActions.append(heading);

  if (selected.length < 2) {
    const prompt = document.createElement("p");
    prompt.textContent =
      "Select at least two aircraft. Runway clearances, vectors, route changes, and expedite remain individual-only.";
    groupActions.append(prompt);
    return;
  }

  const safePreviews = previews.filter(({ preview }) => preview.safeToIssue);
  if (safePreviews.length) {
    const controls = document.createElement("div");
    controls.className = "group-actions__buttons";
    for (const { instruction, label } of safePreviews) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.groupInstruction = instruction;
      button.textContent = label;
      button.disabled = replayMode;
      controls.append(button);
    }
    groupActions.append(controls);
    const note = document.createElement("p");
    const first = safePreviews[0].preview;
    note.textContent = `${first.domain} · ${first.authority} authority · ${first.safeguards[0]}`;
    groupActions.append(note);
  } else {
    const warning = document.createElement("p");
    warning.textContent =
      previews[0]?.preview.reason ??
      "No shared instruction is currently safe for this selection.";
    groupActions.append(warning);
  }
}

function currentDisplayPredictions(): ConflictPrediction[] {
  if (!replayMode) return simulation.conflictPredictions();
  return (
    replayPlaybackFrames()[replayIndex]?.predictions.map((prediction) => ({
      ...prediction,
      flights: [...prediction.flights],
    })) ?? []
  );
}

function refreshFocusTargets(
  state = displayState(),
  predictions = currentDisplayPredictions(),
): void {
  focusTargetCatalog = focusTargetRegistry.build(
    state,
    simulation.queueSnapshot(state),
    predictions,
  );
  if (activeFocusRef) {
    const activeKey = focusTargetKey(activeFocusRef);
    const next =
      focusTargetCatalog.targets.find((target) => target.key === activeKey) ??
      null;
    if (!next) {
      const previous = activeFocusTarget;
      activeFocusRef = null;
      activeFocusTarget = null;
      focusedFlightId = null;
      world.focusTarget(null);
      if (previous)
        setStatus(
          `${previous.label} left the board`,
          "observer camera returned to free map view",
        );
    } else {
      activeFocusTarget = next;
      focusedFlightId =
        next.selectableFlightId ??
        (next.kind === "flight" ? Number(next.id) : null);
      world.focusTarget(next);
    }
  }
  focusNavigatorUiKey = "";
  renderFocusNavigator();
}

function renderFocusNavigator(force = false): void {
  const key = `${focusTargetCatalog.generatedAtSeconds}|${activeFocusTarget?.key ?? "free"}|${focusTargetCatalog.total}`;
  if (!force && key === focusNavigatorUiKey) return;
  focusNavigatorUiKey = key;
  focusNavigator.render(focusTargetCatalog, activeFocusTarget);
}

function focusObserverTarget(
  ref: FocusTargetRef,
  follow = true,
  focusScale = 1,
): {
  accepted: boolean;
  reason: string;
} {
  if (follow && !cameraDirectorApplying)
    yieldCameraDirector("Manual observer selection");
  let target = focusTargetCatalog.targets.find(
    (candidate) => candidate.key === focusTargetKey(ref),
  );
  if (!target) {
    focusTargetCatalog = focusTargetRegistry.build(
      displayState(),
      simulation.queueSnapshot(displayState()),
      currentDisplayPredictions(),
    );
    target = focusTargetCatalog.targets.find(
      (candidate) => candidate.key === focusTargetKey(ref),
    );
  }
  if (!target)
    return {
      accepted: false,
      reason: `${ref.kind} target is not currently available`,
    };
  activeFocusRef = { kind: target.kind, id: target.id };
  activeFocusTarget = target;
  focusedFlightId =
    target.selectableFlightId ??
    (target.kind === "flight" ? Number(target.id) : null);
  if (follow)
    world.focusTarget({
      ...target,
      suggestedZoom: target.suggestedZoom * focusScale,
    });
  renderFlightStrip();
  renderFlightActions();
  queueInspectorUiKey = "";
  renderQueueInspector();
  renderFocusNavigator(true);
  return {
    accepted: true,
    reason: follow
      ? `following ${target.label} — ${target.detail}`
      : `selected ${target.label} — camera unchanged`,
  };
}

function clearFlightFocus(statusText?: string, detail?: string): void {
  if (!cameraDirectorApplying) yieldCameraDirector("Observer released camera");
  activeFocusRef = null;
  activeFocusTarget = null;
  focusedFlightId = null;
  world.focusTarget(null);
  renderFlightStrip();
  renderFlightActions();
  queueInspectorUiKey = "";
  renderQueueInspector();
  renderFocusNavigator(true);
  if (statusText && detail) setStatus(statusText, detail);
}

function selectFlightFromMap(clientX: number, clientY: number): void {
  const flightId = world.pickFlight(clientX, clientY);
  if (groupSelectActive) {
    if (flightId === null) return;
    const groupedFlight = displayState().flights.find(
      (item) => item.id === flightId,
    );
    if (groupedFlight) toggleGroupFlightSelection(groupedFlight);
    return;
  }
  if (flightId === null || focusedFlightId === flightId) {
    clearFlightFocus("Camera released", "free map view restored");
    return;
  }
  const flight = displayState().flights.find((item) => item.id === flightId);
  if (!flight) return;
  const result = executeAirportRequest({ action: "focusFlight", flightId });
  if (result.accepted)
    setStatus(
      `${flight.callsign} tracked`,
      `${flight.aircraft} · ${formatPhase(flight.phase)} · runway ${runwayDesignation(flight.runway)}`,
    );
}

function setFlightStripCollapsed(collapsed: boolean): void {
  flightStrip.classList.toggle("flight-strip--collapsed", collapsed);
  flightStripToggle.setAttribute("aria-expanded", String(!collapsed));
  flightStripToggle.querySelector("i")!.textContent = collapsed ? "+" : "−";
}

function setRunwayLabelsVisible(visible: boolean): void {
  runwayLabelsVisible = visible;
  runwayLabelButton.setAttribute("aria-pressed", String(visible));
  runwayLabelButton.classList.toggle("control--active", visible);
  runwayLabelLabel.textContent = visible ? "Labels on" : "Labels off";
  world.setRunwayLabelsVisible(visible);
}

function setSurfaceLayerVisible(layer: SurfaceLayer, visible: boolean): void {
  surfaceLayerVisibility[layer] = visible;
  const control = surfaceLayerControls.find(
    (item) => item.dataset.surfaceLayer === layer,
  );
  if (control) control.checked = visible;
  world.setSurfaceLayerVisible(layer, visible);
}

function setAirspaceLayerVisible(layer: AirspaceLayer, visible: boolean): void {
  airspaceLayerVisibility[layer] = visible;
  const control = airspaceLayerControls.find(
    (item) => item.dataset.airspaceLayer === layer,
  );
  if (control) control.checked = visible;
  world.setAirspaceLayerVisible(layer, visible);
}

function setMapOrientationVisible(visible: boolean): void {
  mapOrientationVisible = visible;
  mapOrientationToggle.checked = visible;
  mapOrientation.hidden = !visible;
  if (visible) updateMapOrientation();
}

function setWindOverlayVisible(visible: boolean): void {
  windOverlayVisible = visible;
  windOverlayToggle.checked = visible;
  windOverlay.hidden = !visible;
  if (visible) updateWeatherUi();
}

function setServiceVehiclesVisible(visible: boolean): void {
  serviceVehiclesVisible = visible;
  serviceVehiclesToggle.checked = visible;
  world.setServiceVehiclesVisible(visible);
  audio.setServiceVehicleAudioEnabled(visible);
}

function updateSurfaceDisruptionTargets(): void {
  const incident = surfaceIncidentDefinition(surfaceDisruptionKind.value);
  updateSurfaceDisruptionTargetOptions(
    config,
    incident?.surfaceDisruptionKind ??
      (surfaceDisruptionKind.value as Exclude<
        SurfaceDisruptionKind,
        "disabled-aircraft"
      >),
    surfaceDisruptionTarget,
  );
}

function renderSurfaceDisruptionControls(): void {
  const disruptions = displayState().surfaceDisruptions;
  const namedIncidentSelected = Boolean(
    surfaceIncidentDefinition(surfaceDisruptionKind.value),
  );
  const panelState = {
    airportCode: config.code,
    elapsed: displayState().elapsed,
    station: simulation.state.station,
    replayMode,
    disruptions,
    canRecover: simulation.canIssue("ground"),
    namedIncidentSelected,
  };
  const key = surfaceDisruptionPanelKey(
    panelState,
    surfaceDisruptionKind.value,
  );
  if (surfaceDisruptionUiKey === key) return;
  surfaceDisruptionUiKey = key;
  renderSurfaceDisruptionPanel(
    {
      kind: surfaceDisruptionKind,
      target: surfaceDisruptionTarget,
      duration: surfaceDisruptionDuration,
      apply: surfaceDisruptionApply,
      list: surfaceDisruptionList,
    },
    panelState,
  );
}

function updateMapOrientation(): void {
  const metrics = world.mapMetrics();
  mapNorthArrow.style.transform = `rotate(${metrics.northDegrees.toFixed(2)}deg)`;
  for (const point of mapOrientation.querySelectorAll<HTMLElement>(
    "[data-bearing]",
  )) {
    const angle =
      ((Number(point.dataset.bearing) + metrics.northDegrees - 90) * Math.PI) /
      180;
    point.style.left = `${29 + Math.cos(angle) * 22}px`;
    point.style.top = `${29 + Math.sin(angle) * 22}px`;
    point.style.right = "auto";
    point.style.bottom = "auto";
    point.style.transform = "translate(-50%, -50%)";
  }
  mapScaleBar.style.width = `${metrics.scalePixels.toFixed(1)}px`;
  mapScaleLabel.textContent =
    metrics.scaleMeters >= 1_000
      ? `${Number((metrics.scaleMeters / 1_000).toFixed(1))} km`
      : `${metrics.scaleMeters} m`;
}

function drawRadar(state: typeof simulation.state): void {
  drawRadarInset({
    canvas: radarScope,
    rangeLabel: radarRange,
    config,
    state,
    focusedFlightId,
  });
}

function renderFlightActions(): void {
  if (groupSelectActive) {
    flightActions.hidden = true;
    flightActionsRenderKey = "";
    return;
  }
  const flight =
    focusedFlightId === null
      ? null
      : displayState().flights.find((item) => item.id === focusedFlightId);
  const renderKey = flight
    ? [
        flight.id,
        flight.callsign,
        flight.origin,
        flight.destination,
        flight.phase,
        flight.cleared,
        flight.goAround ? flight.motion.stage : "normal-approach",
        flight.progress >= 0.999,
        flight.progress >= 0.985,
        flight.pushbackCleared,
        flight.pushbackDirection,
        flight.turnaround.status,
        Math.floor(flight.turnaround.progress * 20),
        flight.turnaround.tasks.map((task) => task.status).join(","),
        flight.deicing.status,
        Math.floor(flight.deicing.treatmentElapsedSeconds),
        Math.ceil(flight.deicing.holdoverRemainingSeconds),
        serviceVehiclesForFlight(flight.id)
          .map((vehicle) => `${vehicle.id}:${vehicle.status}:${vehicle.held}`)
          .join(","),
        flight.controlHold,
        flight.crossingHoldRunway ?? "none",
        flight.runwayEntryCleared,
        flight.takeoffCleared,
        flight.runwayExit?.nodeId ?? "no-exit",
        flight.runwayExit?.brakingAction ?? "no-braking-plan",
        flight.runwayExit?.stoppingMarginM ?? 0,
        flight.runwayExit?.routeDistanceM ?? 0,
        flight.surfaceReroute?.revision ?? 0,
        flight.surfaceReroute?.status ?? "no-reroute",
        flight.emergency ?? "no-emergency",
        flight.navigation.procedureId,
        flight.navigation.transitionId,
        flight.navigation.approachCleared,
        flight.navigation.assignedHeadingDegrees ?? "no-heading",
        flight.navigation.assignedAltitudeFt ?? "no-altitude",
        flight.navigation.assignedSpeedKts ?? "no-speed",
        flight.navigation.hold?.cycle ?? "no-hold",
        flight.navigation.frequencyOwner,
        flight.navigation.handoff?.revision ?? "no-handoff",
        flight.navigation.handoff?.status ?? "no-handoff-status",
        flight.navigation.handoff &&
        (flight.navigation.handoff.status === "offered" ||
          flight.navigation.handoff.status === "overdue")
          ? Math.floor(displayState().elapsed)
          : "no-handoff-clock",
        flight.navigation.readbackStatus,
        flight.navigation.routeClearance?.revision ?? "no-route-clearance",
        flight.navigation.routeClearance?.status ?? "no-route-status",
        flight.navigation.routeClearance?.warnings
          .map((warning) => `${warning.severity}:${warning.code}`)
          .join(",") ?? "no-route-warnings",
        flight.navigation.routeClearance?.supplements
          ?.map((supplement) =>
            supplement.kind === "altitude"
              ? `altitude:${supplement.altitudeFt}`
              : `speed:${supplement.speedKts}`,
          )
          .join(",") ?? "no-route-supplements",
        displayState().surfaceDisruptions.find(
          (disruption) => disruption.flightId === flight.id,
        )?.status ?? "no-recovery",
        Math.floor(
          (displayState().surfaceDisruptions.find(
            (disruption) => disruption.flightId === flight.id,
          )?.recoveryProgress ?? 0) * 20,
        ),
        simulation.state.station,
        replayMode,
      ].join("|")
    : `none|${simulation.state.station}|${replayMode}`;
  if (flightActionsRenderKey === renderKey) {
    flightActions.hidden = !flight;
    return;
  }
  flightActionsRenderKey = renderKey;
  flightActions.replaceChildren();
  flightActions.hidden = !flight;
  if (!flight) return;
  const heading = document.createElement("header");
  heading.innerHTML = "<div><b></b><small></small></div><span></span>";
  heading.querySelector("b")!.textContent = flight.callsign;
  const standLabel = flight.gateAssignment?.gateRef
    ? `Gate ${flight.gateAssignment.gateRef}`
    : flight.gateAssignment?.zoneName?.replace(/ Ramp$/i, "");
  heading.querySelector("small")!.textContent =
    `${flight.aircraft}${standLabel ? ` · ${standLabel}` : ""}`;
  heading.querySelector("span")!.textContent =
    simulation.state.station.toUpperCase();
  flightActions.append(heading);
  const route = document.createElement("p");
  route.className = "flight-actions__route";
  route.textContent = `From ${airportPlaceLabel(flight.origin)} · To ${airportPlaceLabel(flight.destination)}`;
  flightActions.append(route);
  const capability = document.createElement("p");
  capability.className = "flight-actions__capability";
  const aircraft = aircraftProfile(flight.aircraft);
  const authorityOwner = flight.navigation.frequencyOwner.toUpperCase();
  const deskCanIssue =
    simulation.state.station === "supervisor" ||
    simulation.canIssue(simulation.state.station);
  const ownsFrequency =
    simulation.state.station === "supervisor" ||
    flight.navigation.frequencyOwner === simulation.state.station;
  const deskAuthority = !deskCanIssue
    ? "desk is read-only"
    : !ownsFrequency
      ? "authority transfer required"
      : "desk authority available";
  capability.textContent = `${aircraft.name} · ${aircraft.wakeClass.toUpperCase()} wake · runway ${Math.round(aircraft.takeoffRunwayRequiredM)} m takeoff / ${Math.round(aircraft.landingRunwayRequiredM)} m landing · data ${authorityOwner} · ${deskAuthority}`;
  flightActions.append(capability);
  if (flight.phase !== "resting")
    flightActions.append(createNavigationPanel(flight));
  if (
    flight.runwayExit &&
    (flight.phase === "approach" ||
      flight.phase === "landing" ||
      flight.phase === "taxi-in")
  ) {
    flightActions.append(createRunwayExitPanel(flight));
  }
  if (flight.surfaceReroute || flight.emergency === "disabled")
    flightActions.append(createSurfaceReroutePanel(flight));
  if (flight.phase === "resting")
    flightActions.append(createTurnaroundPanel(flight));
  if (flight.deicing.required) flightActions.append(createDeicingPanel(flight));
  const controls = document.createElement("div");
  controls.className = "flight-actions__buttons";
  const add = (
    action: string,
    label: string,
    disabled = false,
    runway?: number,
  ): void => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.flightAction = action;
    if (runway !== undefined) button.dataset.runway = String(runway);
    button.textContent = label;
    button.disabled = disabled || replayMode;
    controls.append(button);
  };
  const ground = flight.phase === "taxi-in" || flight.phase === "taxi-out";
  const ownsFlight =
    simulation.state.station === "supervisor" ||
    flight.navigation.frequencyOwner === simulation.state.station;
  const recovery = displayState().surfaceDisruptions.find(
    (disruption) => disruption.flightId === flight.id,
  );
  const airborne =
    flight.phase === "approach" ||
    flight.phase === "landing" ||
    (flight.phase === "takeoff" && !flight.motion.onGround);
  if (airborne && !flight.diversion) {
    if (
      (flight.phase === "approach" || flight.phase === "landing") &&
      flight.progress < 0.8 &&
      flight.gateAssignment
    )
      add(
        "gate-reassign",
        "Reassign gate",
        simulation.state.station !== "supervisor",
      );
    if (
      flight.phase === "approach" &&
      !flight.navigation.approachCleared &&
      !flight.navigation.hold &&
      !flight.goAround
    )
      add(
        "approach-clear",
        "Clear approach",
        !simulation.canIssue("approach") || !ownsFlight,
      );
    if (flight.navigation.hold)
      add(
        "air-hold-release",
        "Release hold",
        !simulation.canIssue("approach") || !ownsFlight,
      );
    else if (
      flight.phase === "approach" &&
      !flight.goAround &&
      flight.progress < 0.68
    )
      add(
        "air-hold",
        "Enter hold",
        !simulation.canIssue("approach") || !ownsFlight,
      );
    const routeClearance = flight.navigation.routeClearance;
    const routeWorkflowActive =
      flight.phase === "approach" &&
      flight.progress < 0.62 &&
      (routeClearance?.status === "preview" ||
        routeClearance?.status === "sent" ||
        routeClearance?.status === "pending-readback");
    if (routeWorkflowActive && routeClearance?.status === "preview") {
      add(
        "route-issue",
        routeClearance.safeToIssue
          ? (routeClearance.supplements?.length ?? 0)
            ? "Issue package"
            : "Issue route"
          : "Route blocked",
        !routeClearance.safeToIssue ||
          !simulation.canIssue("approach") ||
          !ownsFlight,
      );
      add(
        "route-cancel",
        "Cancel preview",
        !simulation.canIssue("approach") || !ownsFlight,
      );
    } else if (
      routeWorkflowActive &&
      (routeClearance?.status === "sent" ||
        routeClearance?.status === "pending-readback")
    ) {
      add(
        "route-cancel",
        "Cancel route",
        !simulation.canIssue("approach") || !ownsFlight,
      );
    }
    if (!flight.navigation.hold && !flight.goAround) {
      add(
        "heading-left",
        "HDG −15°",
        !simulation.canIssue("approach") || !ownsFlight,
      );
      add(
        "heading-right",
        "HDG +15°",
        !simulation.canIssue("approach") || !ownsFlight,
      );
      add(
        "speed-down",
        "SPD −10",
        !simulation.canIssue("approach") || !ownsFlight,
      );
      add(
        "speed-up",
        "SPD +10",
        !simulation.canIssue("approach") || !ownsFlight,
      );
      add(
        "altitude-down",
        "ALT −500",
        !simulation.canIssue("approach") || !ownsFlight,
      );
      add(
        "altitude-up",
        "ALT +500",
        !simulation.canIssue("approach") || !ownsFlight,
      );
      const nextFix =
        flight.navigation.routeFixIds[
          Math.min(
            flight.navigation.activeFixIndex + 1,
            flight.navigation.routeFixIds.length - 1,
          )
        ];
      if (nextFix && flight.phase === "approach" && flight.progress < 0.72)
        add(
          "direct-next",
          `Direct ${nextFix.split("-").slice(-2).join(" ")}`,
          !simulation.canIssue("approach") || !ownsFlight,
        );
      if (
        flight.phase === "approach" &&
        flight.progress < 0.62 &&
        !routeWorkflowActive &&
        suggestedRouteAmendment(flight)
      ) {
        add(
          "route-preview",
          "Preview route",
          !simulation.canIssue("approach") || !ownsFlight,
        );
      }
    }
    if (flight.phase === "approach")
      add(
        "divert",
        `Divert ${flight.origin}`,
        !simulation.canIssue("approach") || !ownsFlight,
      );
  }
  const handoff = flight.navigation.handoff;
  const handoffActive =
    handoff &&
    (handoff.status === "offered" ||
      handoff.status === "accepted" ||
      handoff.status === "overdue")
      ? handoff
      : undefined;
  const supervisor = simulation.state.station === "supervisor";
  if (
    handoffActive &&
    (handoffActive.status === "offered" || handoffActive.status === "overdue")
  ) {
    if (supervisor || simulation.state.station === handoffActive.to) {
      add(
        "handoff-accept",
        `Accept ${controllerStationLabel(handoffActive.from)}`,
      );
      add("handoff-reject", "Reject handoff");
    }
    if (supervisor || simulation.state.station === handoffActive.from)
      add("handoff-cancel", "Cancel request");
  } else if (handoffActive?.status === "accepted") {
    if (supervisor || simulation.state.station === handoffActive.from) {
      add(
        "handoff-contact",
        `Contact ${controllerStationLabel(handoffActive.to)}`,
      );
      add("handoff-cancel", "Cancel handoff");
    }
  } else {
    const handoffTarget = suggestedHandoffStation(flight);
    if (handoffTarget && flight.phase !== "resting")
      add(
        "handoff-offer",
        `Request ${controllerStationLabel(handoffTarget)}`,
        !ownsFlight,
      );
  }
  if (
    flight.phase === "approach" &&
    !flight.cleared &&
    !flight.goAround &&
    !flight.diversion
  )
    add(
      "clear",
      `Land ${runwayDesignation(flight.runway)}`,
      !simulation.canIssue("tower") || !ownsFlight,
    );
  if (
    (flight.phase === "approach" || flight.phase === "landing") &&
    !flight.motion.onGround &&
    !flight.goAround &&
    !flight.diversion
  )
    add(
      "go-around",
      "Go around",
      (!simulation.canIssue("approach") && !simulation.canIssue("tower")) ||
        !ownsFlight,
    );
  if (
    flight.phase === "resting" &&
    flight.turnaround.status === "ready" &&
    !flight.pushbackCleared &&
    !serviceVehiclesBlockingPush(flight.id).length
  )
    add(
      "pushback",
      `Push ${flight.pushbackDirection}`,
      !simulation.canIssue("ramp") ||
        !ownsFlight ||
        flight.deicing.status === "unavailable",
    );
  if (flight.emergency === "disabled" && recovery?.status !== "recovering")
    add(
      "recover",
      "Dispatch recovery",
      !simulation.canIssue("ground") || !ownsFlight,
    );
  const surfaceAuthority =
    requiredControllerStation(flight) === "ramp" ? "ramp" : "ground";
  if (ground && flight.emergency !== "disabled") {
    add(
      "hold-toggle",
      flight.controlHold ? "Resume taxi" : "Hold position",
      !simulation.canIssue(surfaceAuthority) || !ownsFlight,
    );
    add(
      "taxi-route",
      "Refresh taxi route",
      !simulation.canIssue(surfaceAuthority) || !ownsFlight,
    );
  }
  for (const runway of flight.crossingHoldRunway === undefined
    ? []
    : [flight.crossingHoldRunway]) {
    add(
      "cross",
      `Cross ${runwayDesignation(runway)}`,
      !simulation.canIssue("ground") || !ownsFlight,
      runway,
    );
  }
  if (
    flight.phase === "taxi-out" &&
    flight.progress >= 0.985 &&
    !flight.runwayEntryCleared
  ) {
    const winterProtected =
      simulation.state.weather.condition !== "snow" ||
      (flight.deicing.status === "protected" &&
        flight.deicing.holdoverRemainingSeconds > 0);
    add(
      "entry",
      winterProtected
        ? `Line up ${runwayDesignation(flight.runway)}`
        : "Await deicing",
      !simulation.canIssue("tower") || !ownsFlight || !winterProtected,
    );
  }
  if (flight.phase === "takeoff" && !flight.takeoffCleared)
    add(
      "takeoff",
      `Take off ${runwayDesignation(flight.runway)}`,
      !simulation.canIssue("tower") || !ownsFlight,
    );
  if (
    flight.phase === "takeoff" &&
    flight.takeoffCleared &&
    flight.motion.onGround &&
    flight.motion.stage === "lineup"
  )
    add(
      "cancel-takeoff",
      "Cancel takeoff",
      !simulation.canIssue("tower") || !ownsFlight,
    );
  if (flight.phase !== "resting" && flight.emergency !== "disabled") {
    const paceAuthority = ground
      ? simulation.canIssue(surfaceAuthority)
      : simulation.canIssue("approach");
    add("slow", "Slow", !paceAuthority || !ownsFlight);
    add("normal", "Normal", !paceAuthority || !ownsFlight);
    if (!ground) add("expedite", "Expedite", !paceAuthority || !ownsFlight);
  }
  flightActions.append(controls);
  if (!controls.children.length) {
    const note = document.createElement("p");
    const blocking = flight.turnaround.tasks
      .filter((task) => task.required && task.status !== "complete")
      .map((task) => task.label.toLowerCase());
    const rampBlockers = serviceVehiclesBlockingPush(flight.id).map((vehicle) =>
      vehicle.label.toLowerCase(),
    );
    note.textContent = replayMode
      ? "Replay is read-only."
      : flight.phase === "resting" && blocking.length
        ? `Pushback waits for ${blocking.join(", ")}.`
        : flight.phase === "resting" && rampBlockers.length
          ? `Pushback waits for ${rampBlockers.join(", ")} to clear the stand.`
          : "No clearance required at this point.";
    flightActions.append(note);
  }
}

function createNavigationPanel(flight: Flight): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "navigation-panel";
  panel.setAttribute(
    "aria-label",
    `${flight.callsign} terminal procedure and controller assignments`,
  );
  const heading = document.createElement("div");
  heading.className = "navigation-panel__heading";
  const title = document.createElement("b");
  title.textContent =
    flight.flightPlan.procedureProfile.kind === "STAR"
      ? flight.flightPlan.procedureProfile.transitionName.replace(
          / TRANSITION$/,
          "",
        )
      : flight.procedure;
  const badge = document.createElement("span");
  badge.textContent = `${flight.navigation.frequencyOwner.toUpperCase()} · ${flight.navigation.handoffStatus.toUpperCase()}`;
  heading.append(title, badge);
  const assignments = [
    flight.navigation.assignedHeadingDegrees === undefined
      ? null
      : `HDG ${String(Math.round(flight.navigation.assignedHeadingDegrees)).padStart(3, "0")}`,
    flight.navigation.assignedAltitudeFt === undefined
      ? null
      : `${flight.navigation.assignedAltitudeFt.toLocaleString()} FT`,
    flight.navigation.assignedSpeedKts === undefined
      ? null
      : `${flight.navigation.assignedSpeedKts} KT`,
  ].filter(Boolean);
  const metrics = document.createElement("p");
  metrics.textContent = flight.navigation.hold
    ? `HOLD ${flight.navigation.hold.patternId} · EFC ${Math.max(0, Math.ceil(flight.navigation.hold.expectFurtherClearanceAtSeconds - displayState().elapsed))} SEC`
    : assignments.length
      ? assignments.join(" · ")
      : `${flight.flightPlan.procedureProfile.kind} · ${flight.flightPlan.procedureProfile.routeFixIds.length} FIXES · ${flight.navigation.approachCleared ? "APPROACH CLEARED" : "PROCEDURE ACTIVE"}`;
  const nextFixId =
    flight.navigation.routeFixIds[
      Math.min(
        flight.navigation.activeFixIndex,
        flight.navigation.routeFixIds.length - 1,
      )
    ];
  const nextFix = config.airspaceProgram.fixes.find(
    (fix) => fix.id === nextFixId,
  );
  const detail = document.createElement("small");
  detail.textContent = nextFix
    ? `Next ${nextFix.name} · ${nextFix.altitudeFt.toLocaleString()} ft · non-navigational schematic`
    : "Procedure complete · non-navigational schematic";
  panel.append(heading, metrics, detail);
  const handoff = flight.navigation.handoff;
  if (handoff) {
    const coordination = document.createElement("small");
    coordination.className = "navigation-panel__handoff";
    const timing =
      handoff.status === "offered"
        ? `reply in ${Math.max(0, Math.ceil(handoff.responseDueSeconds - displayState().elapsed))}s`
        : handoff.status === "overdue"
          ? `${Math.max(0, Math.ceil(displayState().elapsed - handoff.responseDueSeconds))}s late`
          : handoff.status === "accepted"
            ? "contact instruction pending"
            : handoff.status;
    coordination.textContent = `${controllerStationLabel(handoff.from)} → ${controllerStationLabel(handoff.to)} · ${timing}`;
    panel.append(coordination);
  }
  const clearance = flight.navigation.routeClearance;
  if (clearance) {
    const route = document.createElement("div");
    route.className = "route-clearance";
    route.dataset.status = clearance.status;
    const routeHeading = document.createElement("div");
    routeHeading.className = "route-clearance__heading";
    const routeTitle = document.createElement("b");
    routeTitle.textContent =
      clearance.status === "preview"
        ? "Route preview"
        : clearance.status === "sent"
          ? "Sent route"
          : clearance.status === "pending-readback"
            ? "Issued route"
            : "Route clearance";
    const routeStatus = document.createElement("span");
    const blocking = clearance.warnings.filter(
      (warning) => warning.severity === "blocking",
    ).length;
    routeStatus.textContent =
      clearance.status === "preview"
        ? blocking
          ? "BLOCKED"
          : clearance.warnings.length
            ? "CAUTION"
            : "SAFE"
        : clearance.status.replace("-", " ").toUpperCase();
    routeHeading.append(routeTitle, routeStatus);
    const routeMetrics = document.createElement("p");
    const responseWindowSeconds =
      (clearance.status === "sent" ||
        clearance.status === "pending-readback") &&
      clearance.issuedAtSeconds !== undefined &&
      clearance.readbackExpiresSeconds !== undefined
        ? Math.max(
            0,
            Math.round(
              clearance.readbackExpiresSeconds - clearance.issuedAtSeconds,
            ),
          )
        : null;
    routeMetrics.textContent = `${clearance.distanceNm.toFixed(1)} NM · ${Math.max(1, Math.ceil(clearance.estimatedSeconds / 60))} MIN · TURN ${Math.round(clearance.initialTurnDegrees)}°${responseWindowSeconds === null ? "" : ` · RESP ${responseWindowSeconds} SEC`}`;
    const routeFixes = document.createElement("small");
    routeFixes.textContent = clearance.routeFixNames.join(" › ");
    const routeSupplements = document.createElement("small");
    const supplements = clearance.supplements ?? [];
    routeSupplements.textContent = supplements.length
      ? `ATOMIC · ${supplements
          .map((supplement) =>
            supplement.kind === "altitude"
              ? `${supplement.altitudeFt.toLocaleString()} FT`
              : `${supplement.speedKts} KT`,
          )
          .join(" · ")}`
      : "ROUTE ONLY";
    const routeDetail = document.createElement("small");
    routeDetail.className = "route-clearance__detail";
    routeDetail.textContent =
      clearance.warnings[0]?.detail ??
      clearance.reason ??
      (clearance.status === "sent"
        ? "Transmission pending; the original route remains authoritative."
        : clearance.status === "pending-readback"
          ? "Pilot readback pending; the original route remains authoritative."
          : "No forecast conflict inside the terminal look-ahead.");
    route.append(
      routeHeading,
      routeMetrics,
      routeFixes,
      routeSupplements,
      routeDetail,
    );
    panel.append(route);
  }
  if (
    flight.phase === "approach" &&
    flight.progress < 0.62 &&
    !flight.navigation.hold &&
    !flight.goAround &&
    !flight.diversion &&
    clearance?.status !== "preview" &&
    clearance?.status !== "sent" &&
    clearance?.status !== "pending-readback"
  ) {
    panel.append(createRouteEditor(flight));
  }
  return panel;
}

function createRouteEditor(flight: Flight): HTMLElement {
  const editor = document.createElement("details");
  editor.className = "route-editor";
  const summary = document.createElement("summary");
  summary.textContent = "Choose route preview";
  const guidance = document.createElement("small");
  guidance.textContent =
    "Preview route only, or stage route + altitude + speed as one all-or-none readback.";
  const options = document.createElement("div");
  options.className = "route-editor__options";
  const ownsFlight =
    simulation.state.station === "supervisor" ||
    flight.navigation.frequencyOwner === simulation.state.station;
  for (const option of routeAmendmentOptions(flight).slice(0, 6)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.flightAction = "route-preview-selection";
    button.dataset.routeFixes = option.fixIds.join(">");
    button.textContent = option.label;
    button.title = `${option.fixIds.join(" › ")} · initial turn ${Math.round((option.turn * 180) / Math.PI)}°`;
    button.disabled =
      replayMode || !simulation.canIssue("approach") || !ownsFlight;
    options.append(button);
    const firstFix = config.airspaceProgram.fixes.find(
      (fix) => fix.id === option.fixIds[0],
    );
    const profile = aircraftProfile(flight.aircraft);
    const altitudeFt = Math.max(
      1_000,
      Math.min(
        config.scope === "center" ? 10_000 : 5_000,
        firstFix?.altitudeFt ?? 3_000,
      ),
    );
    const speedKts = Math.max(
      profile.approachKts,
      Math.min(
        210,
        Math.round(
          (flight.navigation.assignedSpeedKts ??
            flight.kinematics.airspeedKts) / 5,
        ) * 5,
      ),
    );
    const packageButton = document.createElement("button");
    packageButton.type = "button";
    packageButton.dataset.flightAction = "compound-preview-selection";
    packageButton.dataset.routeFixes = option.fixIds.join(">");
    packageButton.dataset.altitudeFt = String(altitudeFt);
    packageButton.dataset.speedKts = String(speedKts);
    packageButton.textContent = `${option.label} + ${altitudeFt.toLocaleString()} ft / ${speedKts} kt`;
    packageButton.title = `${option.fixIds.join(" › ")} · atomic route, altitude, and speed preview`;
    packageButton.disabled =
      replayMode || !simulation.canIssue("approach") || !ownsFlight;
    options.append(packageButton);
  }
  editor.append(summary, guidance, options);
  return editor;
}

function createRunwayExitPanel(flight: Flight): HTMLElement {
  const exit = flight.runwayExit!;
  const panel = document.createElement("section");
  panel.className = "runway-exit-panel";
  panel.setAttribute(
    "aria-label",
    `Runway ${runwayDesignation(flight.runway)} exit ${exit.taxiwayName}, ${Math.round(exit.stoppingMarginM)} meter stopping margin`,
  );
  const heading = document.createElement("div");
  heading.className = "runway-exit-panel__heading";
  const title = document.createElement("b");
  title.textContent = `RWY ${runwayDesignation(flight.runway)} → ${exit.taxiwayName}`;
  const badge = document.createElement("span");
  badge.textContent = `${exit.highSpeed ? "Rapid" : "Standard"} · ${exit.brakingAction}`;
  heading.append(title, badge);
  const metrics = document.createElement("p");
  metrics.textContent = `${Math.round(exit.targetExitSpeedKts)} KT EXIT · ${Math.round(exit.stoppingMarginM)} M MARGIN · ${(exit.routeDistanceM / 1_000).toFixed(1)} KM TO STAND`;
  const rationale = document.createElement("small");
  rationale.textContent =
    exit.rationale[0] ?? "Pavement-connected arrival route";
  panel.append(heading, metrics, rationale);
  return panel;
}

function createSurfaceReroutePanel(flight: Flight): HTMLElement {
  const disruption = displayState().surfaceDisruptions.find(
    (candidate) => candidate.flightId === flight.id,
  );
  const reroute = flight.surfaceReroute;
  const panel = document.createElement("section");
  panel.className = "runway-exit-panel surface-reroute-panel";
  const heading = document.createElement("div");
  heading.className = "runway-exit-panel__heading";
  const title = document.createElement("b");
  const badge = document.createElement("span");
  if (disruption?.kind === "disabled-aircraft") {
    title.textContent = "Disabled aircraft recovery";
    badge.textContent =
      disruption.status === "recovering"
        ? `${Math.round(disruption.recoveryProgress * 100)}%`
        : "Awaiting dispatch";
  } else {
    title.textContent =
      reroute?.status === "holding"
        ? "Pavement route unavailable"
        : `Surface route · revision ${reroute?.revision ?? 0}`;
    badge.textContent = reroute?.status ?? "planned";
  }
  heading.append(title, badge);
  const metrics = document.createElement("p");
  metrics.textContent =
    disruption?.kind === "disabled-aircraft"
      ? `${disruption.label.toUpperCase()} · ${Math.max(0, Math.ceil((disruption.expectedClearAtSeconds ?? displayState().elapsed) - displayState().elapsed))} SEC`
      : `${(reroute?.addedDistanceM ?? 0) >= 0 ? "+" : ""}${Math.round(reroute?.addedDistanceM ?? 0)} M · ${reroute?.routeEdgeIds.length ?? 0} SEGMENTS`;
  const reason = document.createElement("small");
  reason.textContent =
    disruption?.reason ?? reroute?.reason ?? "Pavement routing available";
  panel.append(heading, metrics, reason);
  return panel;
}

function createTurnaroundPanel(flight: Flight): HTMLElement {
  const turnaround = flight.turnaround;
  const panel = document.createElement("section");
  panel.className = "turnaround-panel";
  panel.setAttribute(
    "aria-label",
    `Turnaround ${Math.round(turnaround.progress * 100)} percent complete`,
  );
  const summary = document.createElement("div");
  summary.className = "turnaround-panel__summary";
  const title = document.createElement("b");
  title.textContent = `Turnaround ${Math.round(turnaround.progress * 100)}%`;
  const status = document.createElement("span");
  status.textContent =
    turnaround.status === "servicing"
      ? "IN SERVICE"
      : turnaround.status.toUpperCase();
  summary.append(title, status);
  const progress = document.createElement("i");
  progress.className = "turnaround-panel__progress";
  progress.setAttribute("aria-hidden", "true");
  const fill = document.createElement("i");
  fill.style.width = `${(turnaround.progress * 100).toFixed(1)}%`;
  progress.append(fill);
  const tasks = document.createElement("ul");
  tasks.className = "turnaround-panel__tasks";
  const vehicles = serviceVehiclesForFlight(flight.id);
  for (const task of turnaround.tasks.filter(
    (candidate) => candidate.required,
  )) {
    const item = document.createElement("li");
    item.dataset.status = task.status;
    const label = document.createElement("span");
    label.textContent = task.label;
    const taskStatus = document.createElement("em");
    const taskProgress =
      task.durationSeconds <= 0
        ? 1
        : task.elapsedSeconds / task.durationSeconds;
    const vehicle = vehicles.find(
      (candidate) => candidate.service === task.type,
    );
    taskStatus.textContent =
      task.status === "active"
        ? `${Math.round(taskProgress * 100)}%`
        : task.status === "waiting" && vehicle
          ? `${vehicle.held ? "hold" : serviceVehicleStatusLabel(vehicle.status)}`
          : task.status;
    item.title = vehicle
      ? `${vehicle.label} · ${serviceVehicleStatusLabel(vehicle.status)}${vehicle.holdReason ? ` · ${vehicle.holdReason}` : ""}`
      : task.reason;
    item.append(label, taskStatus);
    tasks.append(item);
  }
  panel.append(summary, progress, tasks);
  return panel;
}

function createDeicingPanel(flight: Flight): HTMLElement {
  const deicing = flight.deicing;
  const panel = document.createElement("section");
  panel.className = "turnaround-panel deicing-panel";
  panel.setAttribute("aria-label", `Deicing ${deicing.status}`);
  const summary = document.createElement("div");
  summary.className = "turnaround-panel__summary";
  const title = document.createElement("b");
  title.textContent = deicing.facilityName ?? "Winter treatment";
  const status = document.createElement("span");
  status.textContent = deicing.status.replace("-", " ").toUpperCase();
  summary.append(title, status);
  const progress = document.createElement("i");
  progress.className = "turnaround-panel__progress";
  progress.setAttribute("aria-hidden", "true");
  const fill = document.createElement("i");
  const amount =
    deicing.status === "protected"
      ? deicing.holdoverRemainingSeconds / Math.max(1, deicing.holdoverSeconds)
      : deicing.treatmentElapsedSeconds /
        Math.max(1, deicing.treatmentDurationSeconds);
  fill.style.width = `${Math.max(0, Math.min(100, amount * 100)).toFixed(1)}%`;
  progress.append(fill);
  const detail = document.createElement("p");
  detail.className = "deicing-panel__detail";
  const lane = deicing.laneNumber ? `Lane ${deicing.laneNumber}` : "No lane";
  const queue = deicing.queuePosition
    ? ` · queue ${deicing.queuePosition}`
    : "";
  const holdover =
    deicing.status === "protected"
      ? ` · ${Math.ceil(deicing.holdoverRemainingSeconds)} s holdover`
      : "";
  detail.textContent = `${lane}${queue} · ${deicing.fluid}${holdover} · cycle ${deicing.cycle || 1}`;
  detail.title = deicing.reason;
  panel.append(summary, progress, detail);
  return panel;
}

function renderClearanceAdvisor(): void {
  clearanceAdvisor.hidden = simulation.state.mode !== "assisted" || replayMode;
  if (clearanceAdvisor.hidden) return;
  const authority = (proposal: ClearanceProposal): boolean => {
    if (simulation.state.station === "supervisor") return true;
    return (
      proposal.station !== "supervisor" && simulation.canIssue(proposal.station)
    );
  };
  const available = simulation.clearanceProposals().filter((proposal) => {
    if (!authority(proposal)) return false;
    const flight = simulation.state.flights.find(
      (candidate) => candidate.id === proposal.flightId,
    );
    return (
      simulation.state.station === "supervisor" ||
      flight?.navigation.frequencyOwner === simulation.state.station
    );
  });
  const proposal =
    available.find((item) => item.flightId === focusedFlightId) ?? available[0];
  if (!proposal) {
    clearanceAdvisorHeader.hidden = true;
    delete clearanceAdvisorButton.dataset.proposalId;
    clearanceAdvisorReason.textContent =
      "Advisor monitoring · no clearance needs approval";
    clearanceAdvisorFlow.hidden = true;
    clearanceAdvisorReason.style.marginTop = "0";
    clearanceAdvisor.dataset.priority = "quiet";
    return;
  }
  const flight = simulation.state.flights.find(
    (item) => item.id === proposal.flightId,
  );
  clearanceAdvisorHeader.hidden = false;
  clearanceAdvisorTitle.textContent = `${proposal.priority === "urgent" ? "Priority · " : ""}${flight?.callsign ?? `Flight ${proposal.flightId}`}`;
  clearanceAdvisorStation.textContent = `${proposal.station.toUpperCase()} PROPOSAL`;
  clearanceAdvisorButton.dataset.proposalId = proposal.id;
  clearanceAdvisorButton.textContent = proposal.label;
  clearanceAdvisorReason.textContent = proposal.reason;
  if (proposal.flow) {
    const error = Math.abs(Math.round(proposal.flow.slotErrorSeconds));
    const target = proposal.flow.targetKind.replaceAll("-", " ");
    clearanceAdvisorFlow.textContent = `${target.toUpperCase()} · ${error}s ${proposal.flow.status} · window −${proposal.flow.toleranceBeforeSeconds}/+${proposal.flow.toleranceAfterSeconds}s`;
    clearanceAdvisorFlow.hidden = false;
  } else {
    clearanceAdvisorFlow.hidden = true;
  }
  clearanceAdvisorReason.style.removeProperty("margin-top");
  clearanceAdvisor.dataset.priority = proposal.priority;
}

function applyClearanceProposal(proposal: ClearanceProposal): void {
  focusObserverTarget({ kind: "flight", id: String(proposal.flightId) });
  let result: AirportControlResult;
  if (proposal.action === "land")
    result = executeAirportRequest({
      action: "clearFlight",
      flightId: proposal.flightId,
      runway: proposal.runway!,
    });
  else if (proposal.action === "go-around")
    result = executeAirportRequest({
      action: "triggerEmergency",
      flightId: proposal.flightId,
      type: "go-around",
    });
  else if (proposal.action === "pushback")
    result = executeAirportRequest({
      action: "clearPushback",
      flightId: proposal.flightId,
    });
  else if (proposal.action === "cross")
    result = executeAirportRequest({
      action: "clearRunwayCrossing",
      flightId: proposal.flightId,
      runway: proposal.runway!,
    });
  else if (proposal.action === "line-up")
    result = executeAirportRequest({
      action: "clearRunwayEntry",
      flightId: proposal.flightId,
    });
  else if (proposal.action === "takeoff")
    result = executeAirportRequest({
      action: "clearTakeoff",
      flightId: proposal.flightId,
    });
  else if (proposal.action === "slow" || proposal.action === "speed")
    result = executeAirportRequest({
      action: "assignAirspeed",
      flightId: proposal.flightId,
      speedKts: proposal.speedKts!,
    });
  else if (proposal.action === "hold")
    result = executeAirportRequest({
      action: "holdFlight",
      flightId: proposal.flightId,
      patternId: proposal.patternId,
      efcMinutes: proposal.efcMinutes,
    });
  else if (proposal.action === "direct-to")
    result = executeAirportRequest({
      action: "directTo",
      flightId: proposal.flightId,
      fixId: proposal.fixId!,
    });
  else if (proposal.action === "vector")
    result = executeAirportRequest({
      action: "assignHeading",
      flightId: proposal.flightId,
      headingDegrees: proposal.headingDegrees!,
    });
  else
    result = executeAirportRequest({
      action: "controlFlights",
      flightIds: [proposal.flightId],
      instruction: "resume",
    });
  setStatus(
    result.accepted ? `${proposal.label} approved` : "Proposal rejected",
    result.reason,
  );
  renderFlightStrip();
}

function suggestedRouteAmendment(flight: Flight): string[] | null {
  return routeAmendmentOptions(flight)[0]?.fixIds ?? null;
}

function routeAmendmentOptions(
  flight: Flight,
): Array<{ fixIds: string[]; label: string; turn: number }> {
  const procedure = config.airspaceProgram.procedures.find(
    (candidate) => candidate.id === flight.navigation.procedureId,
  );
  if (!procedure || procedure.kind !== "STAR") return [];
  const options = [
    ...procedure.transitions.map((transition) => [
      ...transition.fixIds,
      ...procedure.commonFixIds,
    ]),
    ...procedure.commonFixIds
      .map((_, index) => procedure.commonFixIds.slice(index))
      .filter((route) => route.length >= 3),
  ];
  const current = flight.navigation.routeFixIds.join(">");
  const unique = [
    ...new Map(options.map((route) => [route.join(">"), route])).values(),
  ].filter((route) => route.join(">") !== current);
  const turn = (route: string[]): number => {
    const fix = config.airspaceProgram.fixes.find(
      (candidate) => candidate.id === route[0],
    );
    if (!fix) return Infinity;
    const heading = Math.atan2(
      fix.position[1] - flight.motion.y,
      fix.position[0] - flight.motion.x,
    );
    return Math.abs(
      Math.atan2(
        Math.sin(heading - flight.motion.heading),
        Math.cos(heading - flight.motion.heading),
      ),
    );
  };
  return unique
    .map((fixIds) => {
      const first = config.airspaceProgram.fixes.find(
        (fix) => fix.id === fixIds[0],
      );
      return {
        fixIds,
        label: `${first?.name ?? fixIds[0]} · ${fixIds.length} fixes`,
        turn: turn(fixIds),
      };
    })
    .sort(
      (first, second) =>
        first.turn - second.turn ||
        first.fixIds.length - second.fixIds.length ||
        first.label.localeCompare(second.label),
    );
}

function handleFlightAction(
  flightId: number,
  action: string,
  runwayValue?: string,
  routeFixValue?: string,
  altitudeValue?: string,
  speedValue?: string,
): void {
  if (replayMode) {
    setStatus(
      "Replay is read-only",
      "return to Live before issuing a clearance",
    );
    return;
  }
  const flight = simulation.state.flights.find((item) => item.id === flightId);
  if (!flight) return;
  if (action === "clear")
    executeAirportRequest({
      action: "clearFlight",
      flightId,
      runway: flight.runway,
    });
  if (action === "gate-reassign")
    executeAirportRequest({ action: "reassignArrivalGate", flightId });
  if (action === "go-around")
    executeAirportRequest({
      action: "triggerEmergency",
      flightId,
      type: "go-around",
    });
  if (action === "pushback")
    executeAirportRequest({ action: "clearPushback", flightId });
  if (action === "entry")
    executeAirportRequest({ action: "clearRunwayEntry", flightId });
  if (action === "takeoff")
    executeAirportRequest({ action: "clearTakeoff", flightId });
  if (action === "cancel-takeoff")
    executeAirportRequest({ action: "cancelTakeoffClearance", flightId });
  if (action === "cross")
    executeAirportRequest({
      action: "clearRunwayCrossing",
      flightId,
      runway: Number(runwayValue),
    });
  if (action === "recover")
    executeAirportRequest({ action: "recoverDisabledAircraft", flightId });
  if (action === "hold-toggle")
    executeAirportRequest({
      action: flight.controlHold ? "resumeTaxi" : "holdPosition",
      flightId,
    });
  if (action === "taxi-route")
    executeAirportRequest({ action: "assignTaxiRoute", flightId });
  if (action === "approach-clear")
    executeAirportRequest({ action: "clearApproach", flightId });
  if (action === "air-hold")
    executeAirportRequest({ action: "holdFlight", flightId, efcMinutes: 4 });
  if (action === "air-hold-release")
    executeAirportRequest({ action: "releaseHold", flightId });
  if (action === "heading-left" || action === "heading-right") {
    const current = mathAngleToAviationDegrees(flight.motion.heading);
    executeAirportRequest({
      action: "assignHeading",
      flightId,
      headingDegrees: current + (action === "heading-left" ? -15 : 15),
    });
  }
  if (action === "speed-down" || action === "speed-up") {
    const current =
      flight.navigation.assignedSpeedKts ?? flight.kinematics.airspeedKts;
    executeAirportRequest({
      action: "assignAirspeed",
      flightId,
      speedKts: current + (action === "speed-down" ? -10 : 10),
    });
  }
  if (action === "altitude-down" || action === "altitude-up") {
    const current =
      flight.navigation.assignedAltitudeFt ?? flight.kinematics.altitudeFt;
    executeAirportRequest({
      action: "assignAltitude",
      flightId,
      altitudeFt: current + (action === "altitude-down" ? -500 : 500),
    });
  }
  if (action === "direct-next") {
    const fixId =
      flight.navigation.routeFixIds[
        Math.min(
          flight.navigation.activeFixIndex + 1,
          flight.navigation.routeFixIds.length - 1,
        )
      ];
    if (fixId) executeAirportRequest({ action: "directTo", flightId, fixId });
  }
  if (action === "route-preview") {
    const fixIds = suggestedRouteAmendment(flight);
    if (fixIds)
      executeAirportRequest({ action: "previewRoute", flightId, fixIds });
  }
  if (action === "route-preview-selection" && routeFixValue) {
    executeAirportRequest({
      action: "previewRoute",
      flightId,
      fixIds: routeFixValue.split(">").filter(Boolean),
    });
  }
  if (action === "compound-preview-selection" && routeFixValue) {
    const altitudeFt = Number(altitudeValue);
    const speedKts = Number(speedValue);
    executeAirportRequest({
      action: "previewCompoundClearance",
      flightId,
      fixIds: routeFixValue.split(">").filter(Boolean),
      altitudeFt,
      speedKts,
    });
  }
  if (action === "route-issue")
    executeAirportRequest({ action: "issueRouteAmendment", flightId });
  if (action === "route-cancel")
    executeAirportRequest({ action: "cancelRouteAmendment", flightId });
  if (action === "divert")
    executeAirportRequest({
      action: "divertFlight",
      flightId,
      airportCode: flight.origin,
      reason: "controller-selected alternate",
    });
  if (action === "handoff-offer") {
    const station = suggestedHandoffStation(flight);
    if (station)
      executeAirportRequest({ action: "offerHandoff", flightId, station });
  }
  if (action === "handoff-accept")
    executeAirportRequest({ action: "acceptHandoff", flightId });
  if (action === "handoff-reject")
    executeAirportRequest({ action: "rejectHandoff", flightId });
  if (action === "handoff-cancel")
    executeAirportRequest({ action: "cancelHandoff", flightId });
  if (action === "handoff-contact" && flight.navigation.handoff) {
    executeAirportRequest({
      action: "contactStation",
      flightId,
      station: flight.navigation.handoff.to,
    });
  }
  if (action === "slow" || action === "normal" || action === "expedite")
    executeAirportRequest({
      action: "controlFlights",
      flightIds: [flightId],
      instruction: action,
    });
  renderFlightStrip();
  renderFlightActions();
}

telemetryControls.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-action][data-flight]",
  );
  if (!button) return;
  const flightId = Number(button.dataset.flight);
  if (button.dataset.action === "pushback")
    executeAirportCommand({ action: "clearPushback", flightId });
  if (button.dataset.action === "entry")
    executeAirportCommand({ action: "clearRunwayEntry", flightId });
  if (button.dataset.action === "takeoff")
    executeAirportCommand({ action: "clearTakeoff", flightId });
  if (button.dataset.action === "cross")
    executeAirportCommand({
      action: "clearRunwayCrossing",
      flightId,
      runway: Number(button.dataset.runway),
    });
  if (button.dataset.action === "clear") {
    const flight = simulation.state.flights.find(
      (item) => item.id === flightId,
    );
    if (flight)
      executeAirportCommand({
        action: "clearFlight",
        flightId,
        runway: flight.runway,
      });
  }
  if (button.dataset.action === "focus")
    executeAirportCommand({ action: "focusFlight", flightId });
  if (button.dataset.action === "go-around")
    executeAirportCommand({
      action: "triggerEmergency",
      flightId,
      type: "go-around",
    });
  if (button.dataset.action === "emergency")
    executeAirportCommand({
      action: "triggerEmergency",
      flightId,
      type: "medical",
    });
  if (button.dataset.action === "medical")
    executeAirportCommand({
      action: "triggerEmergency",
      flightId,
      type: "disabled",
    });
  if (
    button.dataset.action === "slow" ||
    button.dataset.action === "normal" ||
    button.dataset.action === "expedite" ||
    button.dataset.action === "hold" ||
    button.dataset.action === "resume" ||
    button.dataset.action === "zigzag"
  ) {
    executeAirportCommand({
      action: "controlFlights",
      flightIds: [flightId],
      instruction: button.dataset.action,
    });
  }
  renderTelemetryControls();
  telemetryOutput.textContent = JSON.stringify(airportSnapshot(), null, 2);
});

function renderTelemetryControls(): void {
  telemetryControls.innerHTML = simulation.state.flights
    .map((flight) => {
      const surface = flight.phase === "taxi-in" || flight.phase === "taxi-out";
      const flightControls = [
        `<button data-action="focus" data-flight="${flight.id}">Track</button>`,
        `<button data-action="slow" data-flight="${flight.id}">Slow</button>`,
        `<button data-action="normal" data-flight="${flight.id}">Normal</button>`,
        ...(!surface
          ? [
              `<button data-action="expedite" data-flight="${flight.id}">Expedite</button>`,
            ]
          : []),
        ...(flight.phase === "approach" && flight.controlPattern !== "zigzag"
          ? [
              `<button data-action="zigzag" data-flight="${flight.id}">Zigzag</button>`,
            ]
          : []),
        ...(surface
          ? [
              `<button data-action="${flight.controlHold ? "resume" : "hold"}" data-flight="${flight.id}">${flight.controlHold ? "Release" : "Hold"}</button>`,
            ]
          : []),
        ...(flight.phase === "approach" && !flight.cleared
          ? [
              `<button data-action="clear" data-flight="${flight.id}">Clear ${runwayDesignation(flight.runway)}</button>`,
            ]
          : []),
        ...(flight.phase === "resting" &&
        flight.turnaround.status === "ready" &&
        !flight.pushbackCleared
          ? [
              `<button data-action="pushback" data-flight="${flight.id}">Push ${flight.pushbackDirection}</button>`,
            ]
          : []),
        ...((flight.phase === "approach" || flight.phase === "landing") &&
        !flight.motion.onGround
          ? [
              `<button data-action="go-around" data-flight="${flight.id}">Go around</button>`,
            ]
          : []),
        ...(flight.emergency
          ? [
              `<button data-action="medical" data-flight="${flight.id}">Medical</button>`,
            ]
          : [
              `<button data-action="emergency" data-flight="${flight.id}">Emergency</button>`,
            ]),
      ].join("");
      const crossings = (
        flight.crossingHoldRunway === undefined
          ? []
          : [flight.crossingHoldRunway]
      )
        .map(
          (runway) =>
            `<button data-action="cross" data-flight="${flight.id}" data-runway="${runway}">Clear cross ${runwayDesignation(runway)}</button>`,
        )
        .join("");
      const entry =
        flight.phase !== "taxi-out" ||
        flight.progress < 0.985 ||
        flight.runwayEntryCleared
          ? ""
          : `<button data-action="entry" data-flight="${flight.id}">Clear enter ${runwayDesignation(flight.runway)}</button>`;
      const takeoff =
        flight.phase === "takeoff" && !flight.takeoffCleared
          ? `<button data-action="takeoff" data-flight="${flight.id}">Clear takeoff ${runwayDesignation(flight.runway)}</button>`
          : "";
      const directive = flight.safetyHold
        ? " · SAFETY HOLD"
        : flight.crossingHoldRunway !== undefined
          ? ` · HOLD SHORT ${runwayDesignation(flight.crossingHoldRunway)}`
          : flight.controlHold
            ? " · HELD"
            : flight.controlPattern === "zigzag"
              ? " · ZIGZAG"
              : flight.controlPace && flight.controlPace !== 1
                ? ` · ${flight.controlPace < 1 ? "SLOW" : "EXPEDITE"}`
                : "";
      const profile = aircraftProfile(flight.aircraft);
      const airline = airlineProfile(flight.airline);
      const gate = flight.gateAssignment;
      const gateDetail = gate
        ? ` · ${gate.gateRef ?? gate.zoneName ?? gate.standId} · ${gate.airlineFit} airline fit · in ${formatTime(gate.scheduledGateInSeconds)} / out ${formatTime(gate.scheduledDepartureSeconds)}`
        : "";
      const turnaroundDetail =
        flight.phase === "resting"
          ? ` · turn ${Math.round(flight.turnaround.progress * 100)}% · ${
              flight.turnaround.tasks
                .filter((task) => task.status === "active")
                .map((task) => task.label)
                .join(" + ") || flight.turnaround.status
            }`
          : "";
      return `<div class="telemetry__flight"><strong>${flight.callsign} · ${flight.aircraft} · ${flightOperationLabel(flight).toUpperCase()}${flight.taxiway ? ` · ${flight.taxiway}` : ""}${directive}</strong><small>${airline.name} · ${flight.registration} · ${flight.service} · ${profile.name} · ${profile.wakeClass} wake · ${flight.engineState} engines${flight.tugAttached ? ` · tug attached · ${Math.round(flight.pushbackProgress * 100)}% push` : ""}${gateDetail}${turnaroundDetail}</small>${flightControls}${crossings}${entry}${takeoff}</div>`;
    })
    .join("");
}

function updateSafetyUi(predictions = simulation.conflictPredictions()): void {
  const metrics = simulation.shiftMetrics();
  const penalty = predictions.reduce(
    (sum, prediction) => sum + (prediction.severity === "warning" ? 22 : 7),
    0,
  );
  // A safety hold is the system doing its job, and ordinary queue delay is an
  // efficiency metric rather than a loss of separation. Keep this field true
  // to its label: only active forecasts or invariant breaches reduce Safety.
  const score = Math.max(
    0,
    Math.min(100, Math.round(100 - penalty - metrics.collisionAlerts * 40)),
  );
  safetyScore.textContent = String(score).padStart(3, "0");
  safetyScore.style.color =
    score > 84 ? "#d9f4f4" : score > 64 ? "#f2c84b" : "#ef937f";
}

function updateOperationsHealth(): void {
  const diagnostics = simulation.diagnostics();
  const metrics = diagnostics.metrics;
  const completed = simulation.state.arrivals + simulation.state.departures;
  const throughput =
    completed / Math.max(1 / 60, simulation.state.elapsed / 3_600);
  const invariantFailures =
    metrics.collisionAlerts +
    metrics.runwayIncursions +
    metrics.unexplainedPauses;
  healthThroughput.textContent = throughput.toFixed(1);
  healthConflicts.textContent = String(metrics.collisionAlerts);
  healthIncursions.textContent = String(metrics.runwayIncursions);
  healthPauses.textContent = String(metrics.unexplainedPauses);
  healthHold.textContent = `${Math.round(metrics.longestHoldSeconds)}s`;
  healthDelay.textContent = `${(metrics.estimatedDelaySeconds / 60).toFixed(1)}m`;
  healthFps.textContent = measuredFps ? String(Math.round(measuredFps)) : "—";
  const state =
    invariantFailures > 0
      ? "ATTENTION"
      : simulation.state.elapsed < 10
        ? "WARMING UP"
        : "NOMINAL";
  healthState.textContent = state;
  operationsHealth.dataset.state = state.toLowerCase();
}

function updateAdaptiveRenderQuality(): void {
  const runtime = runtimePerformance.snapshot();
  // A brief asset upload or a single browser pause is not a quality signal.
  // Require several consecutive one-second observations before changing the
  // render adapter, then require a longer calm period before restoring it.
  const overloaded =
    runtime.frameWorkMs.samples >= 60 &&
    (runtime.frameWorkMs.p95 > 16 || runtime.frameGapMs.p95 > 24);
  const recovered =
    runtime.frameWorkMs.samples >= 180 &&
    runtime.frameWorkMs.p95 < 11 &&
    runtime.frameGapMs.p95 < 20;
  adaptiveRenderOverBudgetSeconds = overloaded
    ? adaptiveRenderOverBudgetSeconds + 1
    : 0;
  adaptiveRenderRecoverySeconds = recovered
    ? adaptiveRenderRecoverySeconds + 1
    : 0;
  if (!adaptiveRenderDegraded && adaptiveRenderOverBudgetSeconds >= 2) {
    adaptiveRenderDegraded = true;
    adaptiveRenderRecoverySeconds = 0;
    world.setPerformanceDegraded(true);
    return;
  }
  if (adaptiveRenderDegraded && adaptiveRenderRecoverySeconds >= 12) {
    adaptiveRenderDegraded = false;
    adaptiveRenderOverBudgetSeconds = 0;
    world.setPerformanceDegraded(false);
  }
}

function updatePerformancePanelControl(): void {
  debugPanel.hidden = !performancePanelVisible;
  performanceButton.classList.toggle(
    "control--active",
    performancePanelVisible,
  );
  performanceButton.setAttribute(
    "aria-pressed",
    String(performancePanelVisible),
  );
  performanceButton.setAttribute(
    "aria-expanded",
    String(performancePanelVisible),
  );
  performanceLabel.textContent = performancePanelVisible
    ? "Performance on"
    : "Performance";
}

function renderDebugPanel(): void {
  const renderer = world.diagnostics();
  const diagnostics = simulation.diagnostics();
  const runtime = runtimePerformance.snapshot();
  const budgetIssues = runtime.checks
    .filter(
      (check) => check.status === "attention" || check.status === "exceeded",
    )
    .map((check) => check.label)
    .join(", ");
  debugPanel.textContent = [
    `${config.code} · ${simulation.state.mode.toUpperCase()} · ${simulation.state.station.toUpperCase()}`,
    `${runtime.status.toUpperCase()} · ${measuredFps.toFixed(1)} fps · ${runtime.frameGapMs.p95.toFixed(1)} ms gap p95 · ${runtime.frameWorkMs.p95.toFixed(1)} ms work p95`,
    `${runtime.simulationTickMs.p95.toFixed(2)} ms sim p95 · ${runtime.droppedSimulationSeconds.toFixed(2)} s dropped · ${runtime.maximumTicksPerFrame} max ticks/frame`,
    `${renderer.drawCalls} draws · ${renderer.geometries} geometries · ${renderer.triangles.toLocaleString()} tris · ${renderer.adaptivePerformanceMode} render`,
    `${simulation.state.flights.length} aircraft · ${diagnostics.runwayReservations.length} runway reservations`,
    `${renderer.airportLifeVisible ? "Airport life on" : "Airport life off"} · ${renderer.terminalGateActivity.docked}/${renderer.terminalGateActivity.bridges} bridges docked · ${renderer.terminalGateActivity.openDoors} doors open`,
    `${diagnostics.metrics.collisionAlerts} conflicts · ${diagnostics.metrics.runwayIncursions} incursions · ${diagnostics.metrics.unexplainedPauses} pauses`,
    budgetIssues
      ? `Budget watch: ${budgetIssues}`
      : "Budgets within measured limits",
  ].join("\n");
}

function updateReplayUi(): void {
  const frames = replayPlaybackFrames();
  replaySlider.max = String(Math.max(0, frames.length - 1));
  replaySlider.disabled = !replayMode || frames.length === 0;
  if (replayMode && frames.length) {
    replayIndex = Math.max(
      0,
      Math.min(
        frames.length - 1,
        replayIndex < 0 ? frames.length - 1 : replayIndex,
      ),
    );
    replaySlider.value = String(replayIndex);
    replayTime.value = formatTime(frames[replayIndex].clock);
    replayTime.textContent = formatTime(frames[replayIndex].clock);
  } else {
    replayTime.value = "LIVE";
    replayTime.textContent = "LIVE";
  }
  const durationSeconds = frames.length
    ? frames[frames.length - 1].clock - frames[0].clock
    : 0;
  replayInspector.render({
    source: importedReplay ? "imported" : "live",
    sourceLabel: importedReplay
      ? `${importedReplay.airport.code} imported replay`
      : "Live buffer",
    detail: `${frames.length.toLocaleString()} frames · ${formatTime(durationSeconds)} · schema ${importedReplay?.schemaVersion ?? CONTROL_REPLAY_SCHEMA_VERSION}`,
    schemaVersion:
      importedReplay?.schemaVersion ?? CONTROL_REPLAY_SCHEMA_VERSION,
    frames: frames.length,
    durationSeconds,
    currentFrame: replayMode && replayIndex >= 0 ? replayIndex : null,
    baselineFrame: replayBaselineIndex,
    markers: replayMarkers(),
    verification: replayVerification,
    verificationStale: replayVerificationStale,
    comparison: replayComparison,
    shareAvailable: true,
  });
}

function presentStatusMessage(message: StatusMessageView | null): void {
  if (!message) {
    status.hidden = true;
    statusTransition?.cancel();
    return;
  }
  status.hidden = false;
  statusTransition?.cancel();
  statusLabel.textContent = message.label;
  statusDetail.textContent = message.detail;
  status.dataset.priority = message.priority;
  status.dataset.messageId = String(message.id);
  status.dataset.shownAt = String(message.shownAtMs);
  status.dataset.minimumVisibleUntil = String(message.minimumVisibleUntilMs);
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    statusTransition = status.animate(
      [
        { transform: "translateY(-5px)", opacity: 0.35 },
        { transform: "translateY(0)", opacity: 1 },
      ],
      { duration: 420, easing: "ease-out" },
    );
  }
}

function setStatus(
  label: string,
  detail: string,
  priority?: StatusMessagePriority,
): void {
  const snapshot = statusMessages.enqueue({ label, detail, priority });
  status.dataset.queueDepth = String(snapshot.queued.length);
}

function setStatusMessagePolicy(policy: StatusMessagePolicy): void {
  const snapshot = statusMessages.setPolicy(policy);
  statusMessagePolicySelect.value = policy;
  status.dataset.queueDepth = String(snapshot.queued.length);
  status.dataset.policy = policy;
}

function setAirportLifeVisible(visible: boolean): void {
  airportLifeVisible = visible;
  airportLifeToggle.checked = visible;
  world.setAirportLifeVisible(visible);
  audio.setAirportLifeAudioEnabled(visible);
  lastFlightStripRender = -Infinity;
  renderFlightStrip();
}

function liveReportMatchesAirport(station: string): boolean {
  return liveDataStationForAirport(config.code) === station;
}

function applyLiveMetar(report: LiveMetarReport): {
  accepted: boolean;
  reason: string;
} {
  if (!liveReportMatchesAirport(report.station)) {
    return {
      accepted: false,
      reason: `${report.station} does not match the active ${config.code} airport.`,
    };
  }
  const age = liveDataAge(report);
  if (age.stale) {
    return {
      accepted: false,
      reason: `The report is ${age.label}; stale weather remains preview-only.`,
    };
  }
  const directionDegrees =
    report.weather.windDirectionDegrees ??
    mathAngleToAviationDegrees(simulation.state.weather.windDirection);
  const result = executeAirportRequest({
    action: "setWeather",
    condition: report.weather.condition,
    directionDegrees,
    windSpeed: Math.min(40, report.weather.windSpeedKts),
  });
  return {
    accepted: result.accepted,
    reason: result.accepted
      ? `${report.station} ${age.label} · ${report.provenance.provider} · modeled weather updated, not for navigation.`
      : result.reason,
  };
}

function normalizedSurfaceLabel(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function applyLiveSurfaceStatus(
  item: LiveSurfaceStatusItem,
  report: LiveNotamReport,
): { accepted: boolean; reason: string } {
  if (!liveReportMatchesAirport(report.station)) {
    return {
      accepted: false,
      reason: `${report.station} does not match the active ${config.code} airport.`,
    };
  }
  if (Date.now() > Date.parse(report.expiresAt)) {
    return {
      accepted: false,
      reason:
        "This surface-status report has expired; refresh it before review.",
    };
  }
  if (item.endsAt && Date.now() > Date.parse(item.endsAt)) {
    return {
      accepted: false,
      reason: `${item.id} has ended and cannot change the current topology.`,
    };
  }
  let kind: "runway-closure" | "taxiway-closure";
  let targetId: string | null = null;
  if (item.targetKind === "runway") {
    kind = "runway-closure";
    const requested = normalizedSurfaceLabel(item.target);
    const runway = config.runways.find((candidate) =>
      candidate.designation?.some(
        (designation) => normalizedSurfaceLabel(designation) === requested,
      ),
    );
    targetId = runway ? String(runway.id) : null;
  } else {
    kind = "taxiway-closure";
    const requested = normalizedSurfaceLabel(item.target);
    const taxiway = config.surfaceGraph.taxiways.find(
      (candidate) =>
        normalizedSurfaceLabel(candidate.id) === requested ||
        normalizedSurfaceLabel(candidate.name) === requested,
    );
    targetId = taxiway?.id ?? null;
  }
  if (!targetId) {
    return {
      accepted: false,
      reason: `${item.targetKind} ${item.target} is not present in the active sourced surface graph; no approximation was made.`,
    };
  }
  const result = executeAirportRequest({
    action: "setSurfaceDisruption",
    kind,
    targetId,
    enabled: item.status !== "open",
  });
  return {
    accepted: result.accepted,
    reason: result.accepted
      ? `${item.id} was reviewed and passed through supervisor authority and the surface safety arbiter.`
      : result.reason,
  };
}

function applyLiveTraffic(
  plan: LiveTrafficSeedPlan,
  report: LiveTrafficReport,
): { accepted: boolean; reason: string } {
  if (!liveReportMatchesAirport(report.station)) {
    return {
      accepted: false,
      reason: `${report.station} does not match the active ${config.code} airport.`,
    };
  }
  const age = liveDataAge(report);
  if (age.stale) {
    return {
      accepted: false,
      reason: `The aggregate demand report is ${age.label}; refresh before applying it.`,
    };
  }
  const result = executeAirportRequest({
    action: "setTrafficDensity",
    density: plan.density,
  });
  return {
    accepted: result.accepted,
    reason: result.accepted
      ? `${plan.operationsPerHour} aggregate ops/hr mapped to ${plan.density}; ${plan.aggregateFingerprint}. Only the deterministic density command enters replay.`
      : result.reason,
  };
}

function captureFilenameBase(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `airport-auto-${config.code.toLowerCase()}-${config.seed}-${stamp}`;
}

function prepareCleanSpectatorView(): void {
  setControlPanelOpen(false);
  if (operationsLab.visible()) operationsLab.setVisible(false, false);
  if (focusNavigator.visible()) focusNavigator.setVisible(false);
  if (radarVisible) setRadarPanelVisible(false);
  if (queueInspectorVisible) setQueuePanelVisible(false);
}

function updateRemoteControlHostUi(
  state: RemoteControlHostState = remoteControlHost.state(),
): void {
  if (state.connected) remoteHostToken.value = "";
  remoteHostState.dataset.state = state.status;
  remoteHostState.textContent =
    state.status === "connected"
      ? "Gateway connected"
      : state.status === "connecting"
        ? "Connecting…"
        : state.status === "reconnecting"
          ? `Reconnecting · attempt ${state.reconnectAttempt}`
          : state.status === "error"
            ? "Connection error"
            : "Disconnected";
  remoteHostDetail.textContent =
    state.status === "connected"
      ? `${state.sessionId} · state and events are publishing${state.emergencyStop.active ? " · remote routing stopped" : ""}`
      : state.lastError
        ? state.lastError
        : "Local page control only · no network connection is opened automatically.";
  remoteHostConnect.disabled =
    state.status === "connecting" ||
    state.status === "connected" ||
    state.status === "reconnecting";
  remoteHostDisconnect.disabled = !state.configured;
  remoteHostEndpoint.disabled = state.configured;
  remoteHostSession.disabled = state.configured;
  remoteHostToken.disabled = state.configured;
}

function showGameOver(callsign: string): void {
  clearRoute();
  clearFlightFocus();
  $<HTMLElement>("#final-time").textContent = formatTime(
    simulation.state.elapsed,
  );
  $<HTMLElement>("#final-airport").textContent = config.name;
  $<HTMLElement>("#final-landed").textContent = two(simulation.state.arrivals);
  $<HTMLElement>("#final-departed").textContent = two(
    simulation.state.departures,
  );
  gameOver.hidden = false;
  setExclusiveModal(gameOver);
  requestAnimationFrame(() => {
    gameOver.classList.remove("modal--hidden");
    restartButton.focus();
  });
  setStatus(`${callsign} lost separation`, "shift closed for safety review");
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${two(minutes)}:${two(Math.floor(seconds % 60))}`;
}

let lastTelemetrySecond = -1;

function updateModeControl(): void {
  const mode = simulation.state.mode;
  const automatic = mode === "auto" || mode === "watch";
  modeButton.setAttribute("aria-pressed", String(automatic));
  modeButton.classList.toggle("control--active", automatic);
  modeIcon.textContent =
    mode === "auto"
      ? "A"
      : mode === "assisted"
        ? "✓"
        : mode === "manual"
          ? "M"
          : "◌";
  modeLabel.textContent =
    mode === "auto"
      ? "Auto"
      : mode === "assisted"
        ? "Assist"
        : mode === "manual"
          ? "Manual"
          : "Watch";
  const zoomHint =
    " · drag or WASD to pan · Q/E to rotate · scroll or pinch to zoom · C for controls";
  instructionCopy.innerHTML =
    mode === "watch"
      ? `Watch mode · calm continuous traffic${zoomHint} · <b>select a flight to follow</b>`
      : mode === "assisted"
        ? `Assisted ATC${zoomHint} · <b>approve the advisor’s safe clearances</b>`
        : mode === "manual"
          ? `Full Manual ATC${zoomHint} · <b>select a flight for live clearances</b>`
          : `Continuous Auto tower${zoomHint} · <b>select a flight to follow</b>`;
  canvas.setAttribute(
    "aria-label",
    mode === "manual" || mode === "assisted"
      ? `${mode === "assisted" ? "Assisted" : "Manual"} air traffic control at ${config.name}. Drag or use WASD to pan, use Q and E to rotate, scroll or pinch to zoom, and select a flight card for clearances. Select it again or choose empty ground to release the camera. Optional standard gamepad controls are described in Controls.`
      : `${mode === "watch" ? "Watch-only" : "Automatic"} live traffic at ${config.name}. Drag or use WASD to pan, use Q and E to rotate, scroll or pinch to zoom, and select a flight card to follow it. Select it again or choose empty ground to release the camera. Optional standard gamepad controls are described in Controls.`,
  );
  controlSelect.value = mode;
  introControlSelect.value = mode;
  document.body.classList.toggle("watch-mode", mode === "watch");
}

function setControlPanelOpen(open: boolean): void {
  const wasOpen = controlPanel.classList.contains("control-panel--open");
  if (open && operationsLab.visible()) operationsLab.setVisible(false, false);
  menuButton.classList.toggle("menu-toggle--open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute(
    "aria-label",
    open ? "Close controls" : "Open controls",
  );
  controlPanel.classList.toggle("control-panel--open", open);
  controlPanel.setAttribute("aria-hidden", String(!open));
  controlPanel.toggleAttribute("inert", !open);
  if (open && !wasOpen) {
    controlPanel.scrollTop = 0;
    refreshInputSettings();
    airportSelect.focus({ preventScroll: true });
  } else if (
    !open &&
    wasOpen &&
    controlPanel.contains(document.activeElement)
  ) {
    menuButton.focus({ preventScroll: true });
  }
}

function updateNightControl(): void {
  const environment = simulation.state.environment;
  const night = environment.daylight < 0.42;
  const forced = environment.lightingMode !== "automatic";
  nightButton.setAttribute("aria-pressed", String(forced));
  nightButton.setAttribute(
    "aria-label",
    `Lighting ${environment.lightingMode}; ${environment.phase} at ${environment.localTime}. Activate to cycle mode.`,
  );
  nightButton.classList.toggle("control--active", forced);
  nightIcon.textContent =
    environment.phase === "night"
      ? "☾"
      : environment.phase === "day"
        ? "☀"
        : "◐";
  nightLabel.textContent =
    environment.lightingMode === "automatic"
      ? "Auto"
      : environment.lightingMode === "night"
        ? "Night"
        : "Day";
  lightingModeSelect.value = environment.lightingMode;
  seasonModeSelect.value = environment.seasonMode;
  ambientProgramSelect.value = selectedAmbientProgramId ?? "";
  environmentReadout.textContent = `${environment.localTime} · ${environment.lightingMode === "automatic" ? "auto" : "forced"} ${environment.phase} · ${environment.season} · ${Math.round(environment.daylight * 100)}% light`;
  document.body.classList.toggle("night-mode", night);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", night ? "#071827" : "#183638");
}

function renderAmbientProgramOptions(): void {
  const liveSettings = document.createElement("option");
  liveSettings.value = "";
  liveSettings.textContent = "Live settings";
  const options = AMBIENT_PROGRAM_IDS.map((id) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = AMBIENT_PROGRAMS[id].label;
    option.title = AMBIENT_PROGRAMS[id].description;
    return option;
  });
  ambientProgramSelect.replaceChildren(liveSettings, ...options);
}

function clearAmbientProgramSelection(): void {
  selectedAmbientProgramId = null;
  ambientProgramSelect.value = "";
}

function currentWatchPreset(): WatchPreset {
  return {
    schemaVersion: 1,
    ambientProgramId: selectedAmbientProgramId,
    audioPreset: audioPreset.value as AudioPreset,
    radioChatterEnabled,
    radioCaptionsEnabled,
    cameraDirectorEnabled: cameraDirector.snapshot(performance.now() / 1_000)
      .enabled,
    windOverlayVisible,
    serviceVehiclesVisible,
    airportLifeVisible,
    alertPolicy: statusMessages.getPolicy(),
  };
}

function restoreWatchPreset(): void {
  const preset = loadWatchPreset(windowStorage());
  if (!preset) {
    setStatus(
      "No Watch preset found",
      "save one locally to restore its calm presentation settings",
    );
    return;
  }
  if (simulation.state.challenge.status !== "inactive") {
    setStatus(
      "Watch preset unavailable",
      "end the active challenge before changing its protected conditions",
    );
    return;
  }
  if (preset.ambientProgramId) {
    const result = executeAirportRequest({
      action: "applyAmbientProgram",
      id: preset.ambientProgramId,
    });
    if (!result.accepted) {
      setStatus("Watch preset unchanged", result.reason);
      return;
    }
    selectedAmbientProgramId = preset.ambientProgramId;
  } else clearAmbientProgramSelection();
  selectControl("watch");
  audioPreset.value = preset.audioPreset;
  audio.setPreset(preset.audioPreset);
  radioChatterEnabled = preset.radioChatterEnabled;
  radioChatterEnabledControl.checked = radioChatterEnabled;
  audio.setRadioEnabled(radioChatterEnabled);
  radioCaptionsEnabled = preset.radioCaptionsEnabled;
  radioCaptionsEnabledControl.checked = radioCaptionsEnabled;
  audio.setCaptionsEnabled(radioCaptionsEnabled);
  if (!radioCaptionsEnabled) radioCaptions.reset();
  setCameraDirectorEnabled(preset.cameraDirectorEnabled);
  setWindOverlayVisible(preset.windOverlayVisible);
  setServiceVehiclesVisible(preset.serviceVehiclesVisible);
  setAirportLifeVisible(preset.airportLifeVisible);
  setStatusMessagePolicy(preset.alertPolicy);
  updateNightControl();
  updateWeatherUi();
  setStatus(
    "Watch preset restored",
    "local presentation preferences applied; live traffic was not stored",
  );
}

function windowStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function environmentLightingDescription(mode: EnvironmentLightingMode): string {
  return mode === "automatic"
    ? "sunlight, twilight, and runway lights follow the airport’s local operating clock"
    : mode === "night"
      ? "night presentation is held until automatic lighting is restored"
      : "day presentation is held until automatic lighting is restored";
}

function environmentSeasonDescription(mode: EnvironmentSeasonMode): string {
  return mode === "automatic"
    ? `deterministic calendar season restored · currently ${simulation.state.environment.season}`
    : `${mode} terrain, daylight window, and surface transitions selected`;
}

function loadAccessibilityPalette(): AccessibilityPalette {
  try {
    const stored = window.localStorage.getItem(
      ACCESSIBILITY_PALETTE_STORAGE_KEY,
    );
    return isAccessibilityPalette(stored) ? stored : "standard";
  } catch {
    return "standard";
  }
}

function applyAccessibilityPalette(palette: AccessibilityPalette): void {
  accessibilityPalette = palette;
  document.documentElement.dataset.accessibilityPalette = palette;
  accessibilityPaletteSelect.value = palette;
  world.setAccessibilityPalette(palette);
  try {
    window.localStorage.setItem(ACCESSIBILITY_PALETTE_STORAGE_KEY, palette);
  } catch {
    // Privacy modes may deny local storage; the selected palette still applies
    // for the current page session.
  }
}

function setCameraDirectorEnabled(
  enabled: boolean,
  yieldReason?: string,
): boolean {
  if (enabled && reducedMotionMedia.matches) {
    cameraDirectorEnabledControl.checked = false;
    updateCameraDirectorUi();
    return false;
  }
  const previous = cameraDirector.snapshot(performance.now() / 1_000);
  if (enabled) cameraDirector.setEnabled(true, performance.now() / 1_000);
  else if (yieldReason)
    cameraDirector.yieldToManualInput(yieldReason, performance.now() / 1_000);
  else cameraDirector.setEnabled(false, performance.now() / 1_000);
  if (
    !enabled &&
    previous.targetFlightId !== null &&
    activeFocusRef?.kind === "flight" &&
    activeFocusRef.id === String(previous.targetFlightId)
  ) {
    cameraDirectorApplying = true;
    clearFlightFocus();
    cameraDirectorApplying = false;
  }
  updateCameraDirectorUi();
  return true;
}

function yieldCameraDirector(reason: string): void {
  if (!cameraDirector.snapshot(performance.now() / 1_000).enabled) return;
  setCameraDirectorEnabled(false, reason);
}

function updateCameraDirector(nowSeconds: number): void {
  const decision = cameraDirector.update(simulation.state, nowSeconds);
  if (!decision) return;
  cameraDirectorApplying = true;
  const result = focusObserverTarget(
    decision.target,
    true,
    decision.focusScale,
  );
  cameraDirectorApplying = false;
  if (!result.accepted) cameraDirector.reset(nowSeconds + 1);
  updateCameraDirectorUi();
}

function updateCameraDirectorUi(): void {
  const snapshot = cameraDirector.snapshot(performance.now() / 1_000);
  cameraDirectorEnabledControl.disabled = reducedMotionMedia.matches;
  cameraDirectorEnabledControl.checked = snapshot.enabled;
  cameraDirectorStatus.textContent = reducedMotionMedia.matches
    ? "Director off · reduced motion"
    : snapshot.status === "following" && snapshot.targetCallsign
      ? `${snapshot.targetCallsign} · ${snapshot.reason}`
      : snapshot.reason;
}

function updateRadarControl(): void {
  radarButton.setAttribute("aria-pressed", String(radarVisible));
  radarButton.setAttribute(
    "aria-label",
    radarVisible ? "Hide radar inset" : "Show radar inset",
  );
  radarButton.classList.toggle("control--active", radarVisible);
  radarLabel.textContent = radarVisible ? "Radar on" : "Radar off";
  document.body.classList.toggle("radar-visible", radarVisible);
  radarPanel.hidden = !radarVisible;
  radarAirport.textContent = config.code;
  lastRadarUpdate = -Infinity;
}

function setRadarPanelVisible(visible: boolean): void {
  radarVisible = visible;
  if (visible && operationsLab.visible())
    operationsLab.setVisible(false, false);
  if (visible && focusNavigator.visible()) focusNavigator.setVisible(false);
  if (visible && compactOverlayMedia.matches && queueInspectorVisible) {
    queueInspectorVisible = false;
    updateQueueInspectorControl();
  }
  updateRadarControl();
}

function updateSurfaceSafetyPanelControl(): void {
  surfaceSafetyButton.setAttribute(
    "aria-pressed",
    String(surfaceSafetyVisible),
  );
  surfaceSafetyButton.setAttribute(
    "aria-expanded",
    String(surfaceSafetyVisible),
  );
  surfaceSafetyButton.setAttribute(
    "aria-label",
    surfaceSafetyVisible
      ? "Hide surface safety picture"
      : "Show surface safety picture",
  );
  surfaceSafetyButton.classList.toggle("control--active", surfaceSafetyVisible);
  surfaceSafetyLabel.textContent = surfaceSafetyVisible
    ? "Safety on"
    : "Safety";
  document.body.classList.toggle(
    "surface-safety-visible",
    surfaceSafetyVisible,
  );
  surfaceSafetyPanel.hidden = !surfaceSafetyVisible;
  surfaceSafetyUiKey = "";
}

function setSurfaceSafetyPanelVisible(visible: boolean): void {
  if (visible && !surfaceSafetyVisible)
    surfaceSafetyReturnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : surfaceSafetyButton;
  surfaceSafetyVisible = visible;
  if (
    visible &&
    compactOverlayMedia.matches &&
    controlPanel.classList.contains("control-panel--open")
  )
    setControlPanelOpen(false);
  if (visible && operationsLab.visible())
    operationsLab.setVisible(false, false);
  if (visible && focusNavigator.visible()) focusNavigator.setVisible(false);
  if (visible && compactOverlayMedia.matches && queueInspectorVisible) {
    queueInspectorVisible = false;
    updateQueueInspectorControl();
  }
  updateSurfaceSafetyPanelControl();
  if (visible) {
    renderSurfaceSafety();
    requestAnimationFrame(() =>
      surfaceSafetyFilter.focus({ preventScroll: true }),
    );
  } else if (surfaceSafetyReturnFocus) {
    const returnFocus = surfaceSafetyReturnFocus;
    surfaceSafetyReturnFocus = null;
    requestAnimationFrame(() => {
      if (document.contains(returnFocus))
        returnFocus.focus({ preventScroll: true });
    });
  }
}

function setSurfaceSafetyLookahead(seconds: number): boolean {
  if (!isSurfaceSafetyLookaheadSeconds(seconds)) return false;
  surfaceSafetyLookaheadSeconds = seconds;
  surfaceSafetyLookahead.value = String(seconds);
  surfaceSafetyUiKey = "";
  if (surfaceSafetyVisible) renderSurfaceSafety();
  return true;
}

function setSurfaceSafetyDiagramLayer(
  layer: SurfaceSafetyDiagramLayer,
  enabled: boolean,
): void {
  surfaceSafetyDiagramLayers[layer] = enabled;
  surfaceSafetyLayerInputs[layer].checked = enabled;
  surfaceSafetyUiKey = "";
  if (surfaceSafetyVisible) renderSurfaceSafety();
}

function renderSurfaceSafety(): void {
  const snapshot = currentSurfaceSafetySnapshot();
  const layerKey = Object.entries(surfaceSafetyDiagramLayers)
    .map(([layer, enabled]) => `${layer}:${Number(enabled)}`)
    .join(",");
  const key = `${surfaceSafetyPanelKey(snapshot)}|${surfaceSafetyFilterValue}|${surfaceSafetyLookaheadSeconds}|${layerKey}|${focusedFlightId ?? "none"}`;
  if (key === surfaceSafetyUiKey) return;
  surfaceSafetyUiKey = key;
  renderSurfaceSafetyPanel(
    {
      panel: surfaceSafetyPanel,
      diagram: surfaceSafetyDiagram,
      tracks: surfaceSafetyTracks,
      vehicles: surfaceSafetyVehicles,
      advisories: surfaceSafetyAdvisories,
      movers: surfaceSafetyMovers,
      protectedRunways: surfaceSafetyProtected,
      holds: surfaceSafetyHolds,
      liveSummary: surfaceSafetyLiveSummary,
    },
    config,
    snapshot,
    focusedFlightId,
    surfaceSafetyFilterValue,
    {
      lookaheadSeconds: surfaceSafetyLookaheadSeconds,
      layers: surfaceSafetyDiagramLayers,
    },
  );
}

function currentSurfaceSafetySnapshot(): SurfaceSafetySnapshot {
  const replaySnapshot = replayMode
    ? replayPlaybackFrames()[replayIndex]?.surfaceSafety
    : undefined;
  if (replaySnapshot) return structuredClone(replaySnapshot);
  const baseSnapshot = surfaceSafetySnapshot(
    config,
    displayState(),
    currentDisplayPredictions(),
    simulation.shiftMetrics(),
  );
  const snapshot = replayMode
    ? baseSnapshot
    : surfaceSafetyAdvisoryTracker.update(baseSnapshot);
  return surfaceSafetyAcknowledgements.apply(snapshot);
}

function updateQueueInspectorControl(): void {
  queueButton.setAttribute("aria-pressed", String(queueInspectorVisible));
  queueButton.setAttribute(
    "aria-label",
    queueInspectorVisible
      ? "Hide operation queue inspector"
      : "Show operation queue inspector",
  );
  queueButton.classList.toggle("control--active", queueInspectorVisible);
  queueLabel.textContent = queueInspectorVisible ? "Queues on" : "Queues off";
  document.body.classList.toggle("queue-visible", queueInspectorVisible);
  queuePanel.hidden = !queueInspectorVisible;
  queueInspectorUiKey = "";
}

function setQueuePanelVisible(visible: boolean): void {
  queueInspectorVisible = visible;
  if (visible && operationsLab.visible())
    operationsLab.setVisible(false, false);
  if (visible && focusNavigator.visible()) focusNavigator.setVisible(false);
  if (visible && compactOverlayMedia.matches && radarVisible) {
    radarVisible = false;
    updateRadarControl();
  }
  updateQueueInspectorControl();
  renderQueueInspector();
}

function setDigitalClearancePanelVisible(visible: boolean): void {
  digitalClearanceVisible = visible;
  if (visible && queueInspectorVisible) setQueuePanelVisible(false);
  if (visible && radarVisible) setRadarPanelVisible(false);
  if (visible && operationsLab.visible())
    operationsLab.setVisible(false, false);
  if (visible && focusNavigator.visible()) focusNavigator.setVisible(false);
  digitalClearanceButton.setAttribute("aria-pressed", String(visible));
  digitalClearanceButton.classList.toggle("control--active", visible);
  digitalClearanceLabel.textContent = visible ? "Data on" : "Data Comm";
  digitalClearancePanel.hidden = !visible;
  digitalClearanceUiKey = "";
  digitalClearanceComposerUiKey = "";
  if (visible) renderDigitalClearanceMessages();
}

function renderDigitalClearanceMessages(): void {
  const snapshot = digitalClearanceSnapshot(displayState());
  const key = digitalClearancePanelKey(snapshot, digitalClearanceView);
  if (key !== digitalClearanceUiKey) {
    digitalClearanceUiKey = key;
    renderDigitalClearancePanel(
      {
        count: digitalClearanceCount,
        list: digitalClearanceList,
        views: digitalClearanceViews,
      },
      snapshot,
      digitalClearanceView,
    );
  }
  const composerModel = createDigitalClearanceComposerModel();
  const composerKey = digitalClearanceComposerKey(composerModel);
  if (composerKey !== digitalClearanceComposerUiKey) {
    digitalClearanceComposerUiKey = composerKey;
    digitalClearanceComposerFlightId = renderDigitalClearanceComposer(
      digitalClearanceElements(),
      composerModel,
    );
  }
}

function digitalClearanceElements() {
  return {
    form: digitalClearanceComposer,
    state: digitalClearanceComposerState,
    flight: digitalClearanceFlight,
    route: digitalClearanceRoute,
    altitude: digitalClearanceAltitude,
    speed: digitalClearanceSpeed,
    preview: digitalClearancePreview,
    issue: digitalClearanceIssue,
    cancel: digitalClearanceCancel,
  };
}

function createDigitalClearanceComposerModel(): DigitalClearanceComposerModel {
  const state = displayState();
  const enabled = state.mode === "manual" || state.mode === "assisted";
  const flights = state.flights
    .filter((flight) => {
      const activeStatus = flight.navigation.routeClearance?.status;
      const active =
        activeStatus === "preview" ||
        activeStatus === "sent" ||
        activeStatus === "pending-readback";
      return (
        flight.flightPlan.direction === "arrival" &&
        flight.phase === "approach" &&
        flight.progress < 0.62 &&
        (active ||
          (!flight.navigation.hold && !flight.goAround && !flight.diversion))
      );
    })
    .map((flight) => {
      const ownsFlight =
        state.station === "supervisor" ||
        flight.navigation.frequencyOwner === state.station;
      const approachAuthority = simulation.canIssue("approach");
      const canIssue = ownsFlight && approachAuthority;
      return {
        id: flight.id,
        callsign: flight.callsign,
        owner: flight.navigation.frequencyOwner,
        canIssue,
        ...(canIssue
          ? {}
          : {
              unavailableReason: !ownsFlight
                ? `Owned by ${flight.navigation.frequencyOwner.toUpperCase()}`
                : "Approach authority required",
            }),
        clearanceStatus: flight.navigation.routeClearance?.status,
        clearanceSafeToIssue: flight.navigation.routeClearance?.safeToIssue,
        clearanceReason:
          flight.navigation.routeClearance?.warnings[0]?.detail ??
          flight.navigation.routeClearance?.reason,
        routes: routeAmendmentOptions(flight)
          .slice(0, 8)
          .map((option) => ({
            fixIds: option.fixIds,
            label: option.label,
            turnDegrees: Math.round((option.turn * 180) / Math.PI),
          })),
      };
    });
  const selectedFlightId = flights.some(
    (flight) => flight.id === digitalClearanceComposerFlightId,
  )
    ? digitalClearanceComposerFlightId
    : flights.some((flight) => flight.id === focusedFlightId)
      ? focusedFlightId
      : (flights[0]?.id ?? null);
  return {
    enabled,
    replayMode,
    station: state.station,
    selectedFlightId,
    flights,
  };
}

function renderQueueInspector(): void {
  const snapshot = simulation.queueSnapshot(displayState());
  const flow = simulation.trafficFlowSnapshot(displayState());
  updateQueueFlowObjectiveControl(flow.objective.id);
  updateQueueFlowHorizonControl(flow.forecastHorizonSeconds);
  const focusedQueueId =
    activeFocusTarget?.kind === "queue" ? activeFocusTarget.id : null;
  const key = operationQueueRenderKey(
    snapshot,
    queueInspectorFilter,
    focusedQueueId,
    flow,
    `${simulation.state.mode}:${simulation.state.station}`,
  );
  if (key === queueInspectorUiKey) return;
  queueInspectorUiKey = key;
  renderOperationQueueInspector(
    {
      count: queueCount,
      longest: queueLongest,
      list: queueList,
      meter: queueMeter,
      meterSummary: queueMeterSummary,
      capacity: queueCapacity,
    },
    snapshot,
    queueInspectorFilter,
    focusedQueueId,
    flow,
    {
      canIgnore: simulation.state.mode === "manual",
      canRecover:
        simulation.state.mode === "manual" &&
        simulation.state.station === "supervisor",
      canResequenceArrival:
        (simulation.state.mode === "manual" ||
          simulation.state.mode === "assisted") &&
        (simulation.state.station === "supervisor" ||
          simulation.state.station === "approach"),
      canResequenceDeparture:
        (simulation.state.mode === "manual" ||
          simulation.state.mode === "assisted") &&
        (simulation.state.station === "supervisor" ||
          simulation.state.station === "tower"),
    },
  );
}

function updateQueueFlowHorizonControl(
  seconds: TrafficFlowForecastHorizonSeconds,
): void {
  queueFlowHorizon.value = String(seconds);
  queueCapacityHeading.textContent = `${seconds / 60}-minute outlook`;
  const supervisor = simulation.state.station === "supervisor";
  queueFlowHorizon.disabled = !supervisor;
  queueFlowHorizon.title = supervisor
    ? "Choose how far the rolling demand/capacity forecast looks ahead."
    : "Select the Supervisor workstation to change the airport forecast window.";
}

function updateQueueFlowObjectiveControl(
  objective: TrafficFlowObjective,
): void {
  queueFlowObjective.value = objective;
  const supervisor = simulation.state.station === "supervisor";
  queueFlowObjective.disabled = !supervisor;
  queueFlowObjective.title = supervisor
    ? trafficFlowObjectiveProfile(objective).description
    : "Select the Supervisor workstation to change the airport flow objective.";
}

function newSession(
  paused: boolean,
  nextConfig = generateAirportConfig(),
): void {
  clearAmbientProgramSelection();
  const mode = simulation.state.mode;
  const lightingMode = simulation.state.environment.lightingMode;
  const seasonMode = simulation.state.environment.seasonMode;
  const density = simulation.state.trafficFlow.density;
  const ruleset = simulation.state.separationRuleset;
  const controllerPolicyPresetId =
    simulation.state.scriptedControllers.presetId;
  setControlPanelOpen(false);
  world.dispose();
  config = nextConfig;
  soundscape.reset(config.seed);
  soundscape.setHighStakesWeatherEnabled(highStakesWeatherEnabled);
  soundscapeEvents.length = 0;
  radioCaptions.reset();
  weatherSelection = "auto";
  simulation = new AirportSimulation(config, density);
  simulation.setWeatherHazardsEnabled(highStakesWeatherEnabled);
  focusTargetRegistry = createFocusTargetRegistry(config);
  focusTargetCatalog = focusTargetRegistry.build(
    simulation.state,
    simulation.queueSnapshot(simulation.state),
    simulation.conflictPredictions(),
  );
  simulation.setSeparationRuleset(ruleset);
  simulation.setControllerPolicyPreset(controllerPolicyPresetId);
  simulation.setMode(mode);
  simulation.setEnvironmentLightingMode(lightingMode);
  simulation.setEnvironmentSeasonMode(seasonMode);
  simulation.setScenario(scenarioSelect.value as TrafficScenario);
  simulation.setStation(stationSelect.value as ControllerStation);
  simulation.setPace(simulationSpeed);
  simulation.setPaused(paused);
  lastHudSecond = -1;
  lastArrivals = -1;
  lastDepartures = -1;
  lastPredictionKey = "";
  surfaceSafetyAdvisoryTracker.reset();
  surfaceSafetyAcknowledgements.reset();
  surfaceSafetyAnnouncements.reset();
  updateSafetyUi([]);
  world = createWorld(canvas, config);
  world.setPerformanceDegraded(adaptiveRenderDegraded);
  world.setRunwayLabelsVisible(runwayLabelsVisible);
  world.setServiceVehiclesVisible(serviceVehiclesVisible);
  world.setAirportLifeVisible(airportLifeVisible);
  world.setAccessibilityPalette(accessibilityPalette);
  for (const [layer, visible] of Object.entries(
    surfaceLayerVisibility,
  ) as Array<[SurfaceLayer, boolean]>) {
    world.setSurfaceLayerVisible(layer, visible);
  }
  for (const [layer, visible] of Object.entries(
    airspaceLayerVisibility,
  ) as Array<[AirspaceLayer, boolean]>) {
    world.setAirspaceLayerVisible(layer, visible);
  }
  lastOrientationUpdate = -Infinity;
  simulationAccumulator = 0;
  runtimePerformance.reset();
  adaptiveRenderDegraded = false;
  adaptiveRenderOverBudgetSeconds = 0;
  adaptiveRenderRecoverySeconds = 0;
  world.setPerformanceDegraded(false);
  previousPresentation = capturePresentation(simulation.state);
  updateAirportUi();
  clearRoute();
  replayFrames.length = 0;
  resetReplayWorkspace();
  commandHistory.length = 0;
  initialReplayState = cloneAirportState(simulation.state);
  resetOperationsAnalytics();
  activeFocusRef = null;
  activeFocusTarget = null;
  focusedFlightId = null;
  cameraDirector.reset(performance.now() / 1_000);
  focusNavigatorUiKey = "";
  focusNavigator.reset();
  groupSelectActive = false;
  groupedFlightIds.clear();
  groupActionsRenderKey = "";
  flightActionsRenderKey = "";
  renderFlightStrip();
  renderFlightActions();
  lastPredictionKey = "";
  replayMode = false;
  replayIndex = -1;
  lastReplaySoundIndex = -1;
  replayToggle.setAttribute("aria-pressed", "false");
  replayToggle.textContent = "Replay";
  updateReplayUi();
  updateModeControl();
  updateNightControl();
  updateCameraDirectorUi();
  updateRadarControl();
  updateSurfaceSafetyPanelControl();
  updateQueueInspectorControl();
  renderQueueInspector();
  renderFocusNavigator(true);
  updateSurfaceDisruptionTargets();
  surfaceDisruptionUiKey = "";
  renderSurfaceDisruptionControls();
  trainingCoachRenderKey = "";
  renderTrainingCoach(true);
  closeChallengeResults();
  challengePanel.reset();
  lastChallengeStatus = "inactive";
  renderChallengeExperience(true);
  sandboxPanel.reset();
  lastSandboxActive = false;
  renderSandboxExperience(true);
  updatePauseControl();
}

function setExclusiveModal(modal: HTMLElement | null): void {
  const app = $<HTMLElement>("#app");
  if (modal)
    modalReturnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  for (const child of [...app.children]) {
    if (!(child instanceof HTMLElement)) continue;
    child.toggleAttribute("inert", Boolean(modal && child !== modal));
  }
  if (!modal && !controlPanel.classList.contains("control-panel--open"))
    controlPanel.setAttribute("inert", "");
  if (!modal && modalReturnFocus && document.contains(modalReturnFocus))
    modalReturnFocus.focus({ preventScroll: true });
  if (!modal) modalReturnFocus = null;
}

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape" || !surfaceSafetyVisible) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setSurfaceSafetyPanelVisible(false);
  },
  { capture: true },
);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && digitalClearanceVisible) {
    event.preventDefault();
    setDigitalClearancePanelVisible(false);
    digitalClearanceReturnFocus?.focus({ preventScroll: true });
    digitalClearanceReturnFocus = null;
    return;
  }
  if (event.key !== "Tab") return;
  const modal = [intro, gameOver, challengeResults].find(
    (candidate) =>
      !candidate.hidden && !candidate.classList.contains("modal--hidden"),
  );
  if (!modal) return;
  const focusable = [
    ...modal.querySelectorAll<HTMLElement>(
      'button:not(:disabled), select:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

function updateAirportUi(): void {
  airportName.textContent = config.name;
  const center = config.scope === "center";
  brandMark.textContent = center ? config.code : config.name.charAt(0);
  airportMeta.textContent = center
    ? `${config.code} · ATC schematic · ${Math.round((config.annualOperations ?? 0) / 1000)}k ops/year`
    : "Local · airfield control";
  if (config.vectorData) {
    const effective = config.vectorData.effective
      ? `${config.vectorData.effective.from.replace(/^\d{4}Z\s+/, "")}–${config.vectorData.effective.to.replace(/^\d{4}Z\s+/, "")}`
      : "effective window unavailable";
    mapDataVersion.textContent = config.contextData
      ? `FAA geometry + OSM surface and surroundings · ${effective}`
      : config.surfaceData
        ? `FAA geometry + OSM surface graph · ${effective}`
        : `FAA vector foundation · ${effective}`;
    mapDataAttribution.textContent = config.contextData
      ? `${config.vectorData.attribution} Retrieved ${config.vectorData.retrievedOn}. ${config.contextData.attribution} Surface and surroundings retrieved through ${config.contextData.retrievedOn}.${config.surfaceData?.passengerFacilityReference ? ` ${config.surfaceData.passengerFacilityReference.provider} terminal inventory retrieved ${config.surfaceData.passengerFacilityReference.retrievedOn}.` : ""} · not for navigation.`
      : config.surfaceData
        ? `${config.vectorData.attribution} Retrieved ${config.vectorData.retrievedOn}. ${config.surfaceData.attribution} Retrieved ${config.surfaceData.retrievedOn}.${config.surfaceData.passengerFacilityReference ? ` ${config.surfaceData.passengerFacilityReference.provider} terminal inventory retrieved ${config.surfaceData.passengerFacilityReference.retrievedOn}.` : ""} · not for navigation.`
        : `${config.vectorData.attribution} Retrieved ${config.vectorData.retrievedOn} · imported geometry staged · not for navigation.`;
    mapDataSource.hidden = false;
    mapSurfaceSource.hidden = !config.surfaceData;
    mapFacilitySource.hidden = !config.surfaceData?.passengerFacilityReference;
    if (config.surfaceData?.passengerFacilityReference)
      mapFacilitySource.href =
        config.surfaceData.passengerFacilityReference.url;
  } else {
    mapDataVersion.textContent = center
      ? "Purpose-built ATC schematic"
      : "Procedural airfield";
    mapDataAttribution.textContent =
      "Original generated scenery · not for navigation";
    mapDataSource.hidden = true;
    mapSurfaceSource.hidden = true;
    mapFacilitySource.hidden = true;
  }
  document.title = `${config.code === "LOCAL" ? config.name : config.code} · Airport Auto`;
  liveDataPanel.setAirport(config.code);
  scopeButton.setAttribute("aria-pressed", String(center));
  scopeButton.classList.toggle("control--active", center);
  scopeLabel.textContent = center ? "Airfield" : "Center";
  fieldLabel.textContent = center ? "Next hub" : "New field";
  fieldButton.setAttribute(
    "aria-label",
    center ? "Load the next major airport" : "Generate a new airfield",
  );
  airportSelect.value = config.code;
  introAirportSelect.value = config.code;
  densitySelect.value = simulation.state.trafficFlow.density;
  introDensitySelect.value = simulation.state.trafficFlow.density;
  separationRulesSelect.value = simulation.state.separationRuleset;
  introSeparationRulesSelect.value = simulation.state.separationRuleset;
  document.body.classList.toggle("center-scope", center);
  mapOrientationToggle.checked = mapOrientationVisible;
  mapOrientation.hidden = !mapOrientationVisible;
  windOverlayToggle.checked = windOverlayVisible;
  windOverlay.hidden = !windOverlayVisible;
  serviceVehiclesToggle.checked = serviceVehiclesVisible;
  world.setServiceVehiclesVisible(serviceVehiclesVisible);
  airportLifeToggle.checked = airportLifeVisible;
  radarAirport.textContent = config.code;
  runwayConfigurationOptionsKey = "";
  updateRunwayConfigurationOptions();
  for (const control of surfaceLayerControls) {
    const layer = control.dataset.surfaceLayer as SurfaceLayer;
    const available =
      layer === "hotspots"
        ? config.surfaceGraph.hotspots.length > 0
        : layer === "operational-zones"
          ? config.surfaceGraph.zones.length > 0
          : layer === "airport-boundary"
            ? Boolean(config.contextData)
            : layer === "protection-zones"
              ? config.runways.length > 0
              : layer === "movement-projections"
                ? true
                : config.surfaceGraph.taxiways.some((taxiway) =>
                    Boolean(taxiway.reference),
                  );
    control.disabled = !available;
    control.checked = available && surfaceLayerVisibility[layer];
    world.setSurfaceLayerVisible(
      layer,
      available && surfaceLayerVisibility[layer],
    );
  }
  for (const control of airspaceLayerControls) {
    const layer = control.dataset.airspaceLayer as AirspaceLayer;
    control.disabled = false;
    control.checked = airspaceLayerVisibility[layer];
    world.setAirspaceLayerVisible(layer, airspaceLayerVisibility[layer]);
  }
}

function updateRunwayConfigurationOptions(): void {
  const eligibility = new Map(
    simulation
      .runwayConfigurationOptions()
      .map((option) => [option.id, option]),
  );
  const key = JSON.stringify({
    airport: config.code,
    station: simulation.state.station,
    options: config.runwayConfigurations.map((configuration) => ({
      id: configuration.id,
      eligible: eligibility.get(configuration.id)?.eligible,
      reason: eligibility.get(configuration.id)?.reason,
    })),
  });
  if (key !== runwayConfigurationOptionsKey) {
    const automatic = document.createElement("option");
    automatic.value = "auto";
    automatic.textContent = "Automatic";
    const options = config.runwayConfigurations.map((configuration) => {
      const option = document.createElement("option");
      const availability = eligibility.get(configuration.id);
      option.value = configuration.id;
      option.disabled = !availability?.eligible;
      option.textContent = availability?.eligible
        ? configuration.name
        : `${configuration.name} — unavailable`;
      option.title = availability?.reason ?? configuration.restrictions.note;
      return option;
    });
    runwayConfigurationSelect.replaceChildren(automatic, ...options);
    runwayConfigurationOptionsKey = key;
  }
  runwayConfigurationSelect.disabled =
    simulation.state.station !== "supervisor";
  runwayConfigurationSelect.title = runwayConfigurationSelect.disabled
    ? "Select the Supervisor station to change the runway plan."
    : "Automatic follows wind, weather, visibility, and demand restrictions.";
  runwayConfigurationSelect.value =
    simulation.state.runwayConfigurationMode === "manual"
      ? (simulation.state.runwayConfigurationTransition?.targetId ??
        simulation.state.runwayConfigurationId)
      : "auto";
}

function selectAirport(code: string, paused: boolean, seed?: number): void {
  if (code === "LOCAL") {
    newSession(paused, generateAirportConfig(seed));
  } else {
    const index = HUB_AIRPORTS.findIndex((airport) => airport.code === code);
    hubIndex = index < 0 ? 0 : index;
    newSession(paused, generateHubConfig(hubIndex, seed));
  }
  setStatus(
    `${config.code === "LOCAL" ? config.name : config.code} selected`,
    trafficDescription(),
  );
}

function selectControl(mode: ControlMode): boolean {
  const accepted = simulation.setMode(mode);
  if (!accepted) {
    controlSelect.value = simulation.state.mode;
    introControlSelect.value = simulation.state.mode;
    setStatus("Control mode unchanged", simulation.lastCommandReason());
    return false;
  }
  if (mode === "watch" && groupSelectActive) setGroupSelectActive(false, false);
  updateModeControl();
  if (mode === "manual" || mode === "assisted") setFlightStripCollapsed(false);
  if (mode === "watch") {
    setFlightStripCollapsed(true);
    audioPreset.value = "calm";
    audio.setPreset("calm");
    setStatusMessagePolicy("rare-high");
  }
  renderFlightStrip();
  setStatus(modeName(mode), modeDescription(mode));
  return true;
}

function setScenario(scenario: TrafficScenario): boolean {
  const accepted = simulation.setScenario(scenario);
  if (!accepted) {
    scenarioSelect.value = simulation.state.scenario;
    setStatus("Scenario unchanged", simulation.lastCommandReason());
    return false;
  }
  scenarioSelect.value = scenario;
  densitySelect.value = simulation.state.trafficFlow.density;
  introDensitySelect.value = simulation.state.trafficFlow.density;
  const labels: Record<TrafficScenario, string> = {
    normal: "Normal flow",
    rush: "Rush hour",
    storm: "Storm front",
    closure: "Runway closure",
    training: "Training pattern",
    emergency: "Emergency response",
  };
  setStatus(
    `${labels[scenario]} scenario`,
    scenario === "closure"
      ? "one runway closed · arrivals re-sequencing"
      : scenario === "storm"
        ? "reduced visibility · wider spacing"
        : scenario === "rush"
          ? "compressed arrival stream · watch separation"
          : scenario === "training"
            ? "up to four aircraft · one active approach · practice clearances"
            : scenario === "emergency"
              ? "medical priority · keep a protected runway"
              : "standard traffic picture",
  );
  surfaceDisruptionUiKey = "";
  renderSurfaceDisruptionControls();
  return true;
}

function setTrafficDensity(density: TrafficDensity): boolean {
  if (!isTrafficDensity(density)) return false;
  clearAmbientProgramSelection();
  const accepted = simulation.setTrafficDensity(density);
  if (!accepted) {
    densitySelect.value = simulation.state.trafficFlow.density;
    introDensitySelect.value = simulation.state.trafficFlow.density;
    setStatus("Traffic density unchanged", simulation.lastCommandReason());
    return false;
  }
  densitySelect.value = density;
  introDensitySelect.value = density;
  const profile = trafficDensityProfile(density);
  setStatus(
    `${profile.label} traffic`,
    `${profile.description} · holding capacity ${profile.holdingCapacity}`,
  );
  renderQueueInspector();
  updateWeatherUi();
  return true;
}

function setTrafficFlowObjective(objective: TrafficFlowObjective): boolean {
  if (!isTrafficFlowObjective(objective)) return false;
  clearAmbientProgramSelection();
  const accepted = simulation.setTrafficFlowObjective(objective);
  if (!accepted) return false;
  const profile = trafficFlowObjectiveProfile(objective);
  setStatus(profile.label, profile.description);
  queueInspectorUiKey = "";
  renderQueueInspector();
  updateWeatherUi();
  return true;
}

function setTrafficFlowForecastHorizon(
  seconds: TrafficFlowForecastHorizonSeconds,
): boolean {
  const accepted = simulation.setTrafficFlowForecastHorizon(seconds);
  if (!accepted) return false;
  setStatus(
    `${seconds / 60}-minute forecast`,
    "Rolling demand and capacity horizon updated; existing slots and movements are unchanged.",
  );
  queueInspectorUiKey = "";
  renderQueueInspector();
  return true;
}

function setSeparationRules(ruleset: SeparationRulesetId): boolean {
  const accepted = simulation.setSeparationRuleset(ruleset);
  if (!accepted) {
    separationRulesSelect.value = simulation.state.separationRuleset;
    introSeparationRulesSelect.value = simulation.state.separationRuleset;
    setStatus("Separation rules unchanged", simulation.lastCommandReason());
    return false;
  }
  separationRulesSelect.value = ruleset;
  introSeparationRulesSelect.value = ruleset;
  const profile = separationRuleset(ruleset);
  setStatus(
    `${profile.label} active`,
    `${profile.radarHorizontalNm} NM nominal radar minimum · ${profile.wakeModel.label}`,
  );
  renderFlightStrip();
  return true;
}

function setStation(station: ControllerStation): void {
  simulation.setStation(station);
  stationSelect.value = station;
  updateStationAutomationUi();
  updateWeatherUi();
  const label = controllerStationLabel(station);
  clearFlightFocus();
  groupSelectActive = false;
  groupedFlightIds.clear();
  groupActionsRenderKey = "";
  coordinationInboxRenderKey = "";
  renderFlightStrip();
  surfaceDisruptionUiKey = "";
  renderSurfaceDisruptionControls();
  setStatus(
    `${label} station`,
    station === "supervisor"
      ? "full picture · all clearances available"
      : `${label.toLowerCase()} frequency selected · other desks automated`,
  );
}

function updateStationAutomationUi(): void {
  const supervisor = simulation.state.station === "supervisor";
  const globallyAutomated =
    simulation.state.mode === "auto" || simulation.state.mode === "watch";
  const policy = simulation.controllerPolicySnapshot();
  controllerPolicySelect.value = policy.selected;
  controllerPolicySelect.disabled = !supervisor;
  controllerPolicyDetail.textContent = `${policy.active.summary} ${policy.active.intent}`;
  for (const control of stationAutomationControls) {
    const station = control.dataset
      .stationAutomation as OperationalControllerStation;
    const automated =
      globallyAutomated || simulation.state.stationAutomation[station];
    control.checked = automated;
    control.disabled = !supervisor || globallyAutomated;
    control
      .closest("label")
      ?.classList.toggle("station-automation__manual", !automated);
  }
  const workloads = new Map(
    simulation
      .controllerWorkloads()
      .map((workload) => [workload.station, workload]),
  );
  const performance = new Map(
    currentControllerPerformance().map((snapshot) => [
      snapshot.station,
      snapshot,
    ]),
  );
  for (const control of stationWorkloadControls) {
    const station = control.dataset
      .stationWorkload as OperationalControllerStation;
    const workload = workloads.get(station);
    if (!workload) continue;
    control.classList.toggle(
      "station-workloads__selected",
      simulation.state.station === station,
    );
    control.dataset.pressure = workload.workload;
    const scorecard = performance.get(station);
    control.dataset.performance = scorecard?.status ?? "nominal";
    control.title = scorecard
      ? `${scorecard.label}: ${scorecard.score}/100 · ${scorecard.summary}`
      : workload.label;
    control.setAttribute(
      "aria-pressed",
      String(simulation.state.station === station),
    );
    control.querySelector("span")!.textContent =
      `${workload.activeTracks}/${workload.trackLimit} tracks${workload.pendingHandoffs ? ` · ${workload.pendingHandoffs} inbound` : ""}`;
    control.querySelector("i")!.textContent =
      `${workload.automated ? "Auto" : "Manual"} · ${workload.workload}${workload.queuedActions ? ` · ${workload.queuedActions} queued` : scorecard ? ` · ${scorecard.score}` : ""}`;
  }
}

function modeName(mode: ControlMode): string {
  return mode === "auto"
    ? "Full auto"
    : mode === "assisted"
      ? "Assisted ATC"
      : mode === "manual"
        ? "Full manual"
        : "Watch / ASMR";
}

function modeDescription(mode: ControlMode): string {
  return mode === "auto"
    ? "the tower manages every phase continuously"
    : mode === "assisted"
      ? "the advisor explains and proposes each safe clearance for approval"
      : mode === "manual"
        ? "you own approach, runway, and ground clearances"
        : "hands-off flow · minimal chrome · calm alert policy";
}

function trafficDescription(): string {
  if (!config.annualOperations)
    return `${config.runwayCount} runway${config.runwayCount === 1 ? "" : "s"} · local traffic`;
  return `${config.runwayCount} runways · ${config.annualOperations.toLocaleString()} annual operations`;
}

function setSimulationSpeed(value: number): void {
  simulationSpeed = Math.min(3, Math.max(0.5, value));
  speedControl.value = String(simulationSpeed);
  simulation.setPace(simulationSpeed);
  speedOutput.value = `${simulationSpeed.toFixed(simulationSpeed % 1 ? 2 : 0).replace(/0$/, "")}×`;
}

function updateWeatherUi(): void {
  const weather = simulation.state.weather;
  const conditionProfile = weatherConditionProfile(weather.condition);
  const operation = simulation.operationProfileSnapshot(displayState()).current;
  const density = trafficDensityProfile(displayState().trafficFlow.density);
  const flow = simulation.trafficFlowSnapshot(displayState());
  const direction =
    (Math.round(mathAngleToAviationDegrees(weather.windDirection) / 10) * 10) %
    360;
  const speed = Math.round(weather.windSpeed);
  const gust = Math.round(weather.gustSpeed);
  weatherCondition.textContent = weather.weatherEnabled
    ? `${conditionProfile.label} · ${Math.round(weather.temperatureC)}°C`
    : "wx off";
  weatherWind.textContent = weather.windEnabled
    ? `${String(direction || 360).padStart(3, "0")}° ${speed}G${gust} kt`
    : "calm · wind off";
  windOverlayHeading.textContent = weather.windEnabled
    ? `WIND ${String(direction || 360).padStart(3, "0")}°`
    : "WIND OFF";
  windOverlaySpeed.textContent = weather.windEnabled
    ? `${speed}G${gust} kt`
    : "calm";
  windOverlayArrow.style.transform = `rotate(${direction + 90}deg)`;
  windOverlayArrow.style.opacity = weather.windEnabled ? "1" : "0.35";
  weatherVisibility.textContent = `${weather.visibility.toFixed(weather.visibility % 1 ? 1 : 0)} mi · ceiling ${weather.ceilingFt.toLocaleString()} ft · ${weather.surfaceCondition}`;
  const activeReports = weather.runwayConditionReports.filter(
    (report) =>
      (simulation.state.activeRunwayRoles[report.runwayId] ??
        config.runways[report.runwayId]?.role) !== "inactive",
  );
  const reportLines = activeReports.map(
    (report) =>
      `${activeRunwayDesignation(report.runwayId)} ${report.codes.join("/")} ${report.brakingAction.replaceAll("-", " ")}`,
  );
  const hazard = weather.activeHazard;
  weatherRunwayCondition.textContent = hazard
    ? `${hazard.kind.replace("-", " ")} · ${hazard.locationNm} NM RWY ${activeRunwayDesignation(hazard.runwayId)} · ${hazard.windChangeKts} kt`
    : reportLines.length
      ? `RwyCC ${reportLines.slice(0, 2).join(" · ")}${reportLines.length > 2 ? ` · +${reportLines.length - 2}` : ""}`
      : "Runway condition unavailable";
  weatherRunwayCondition.title = hazard
    ? `${hazard.operation} ${hazard.kind.replace("-", " ")} alert; deterministic simulation only, not for navigation`
    : `${reportLines.join(" · ")} · modeled RCAM-inspired simulation reports, not for navigation`;
  operationBank.textContent = `${operation.localTime} local · ${operation.periodLabel} · ${density.label} ${operation.demandMultiplier.toFixed(2)}× bank`;
  trafficFlowReadout.textContent =
    flow.backPressure.arrivalsHolding || flow.backPressure.departuresWaiting
      ? `${flow.objective.label} · ARR ${flow.backPressure.arrivalsHolding} metered · DEP ${flow.backPressure.departuresWaiting} queued`
      : `${flow.objective.label} · metering clear`;
  const activeConfiguration = config.runwayConfigurations.find(
    (configuration) =>
      configuration.id === simulation.state.runwayConfigurationId,
  );
  const transition = simulation.state.runwayConfigurationTransition;
  const targetConfiguration = transition
    ? config.runwayConfigurations.find(
        (configuration) => configuration.id === transition.targetId,
      )
    : null;
  runwayConfiguration.textContent = transition
    ? `${activeConfiguration?.name ?? "Current plan"} → ${targetConfiguration?.name ?? transition.targetId} · draining ${transition.blockingFlightIds.length} protected flight${transition.blockingFlightIds.length === 1 ? "" : "s"}`
    : activeConfiguration
      ? `${activeConfiguration.name} · ${activeConfiguration.description}`
      : "Runway plan unavailable";
  updateRunwayConfigurationOptions();
  weatherToggle.setAttribute("aria-pressed", String(weather.weatherEnabled));
  weatherToggle.textContent = weather.weatherEnabled ? "WX ON" : "WX OFF";
  windToggle.setAttribute("aria-pressed", String(weather.windEnabled));
  windToggle.textContent = weather.windEnabled ? "WIND ON" : "WIND OFF";
  highStakesWeatherControl.checked = weather.hazardsEnabled;
  highStakesWeatherControl.disabled =
    simulation.challengeSnapshot().conditionsLocked;
  weatherConditionSelect.value = weatherSelection;
  updateStationAutomationUi();
  if (
    lastWeatherCondition !== null &&
    weather.condition !== lastWeatherCondition
  ) {
    const detail: Record<WeatherCondition, string> = {
      clear: "normal spacing and dry-runway performance restored",
      haze: "reduced visibility and modest arrival metering are active",
      rain: "wet-runway spacing, braking, and exit planning are active",
      fog: "low-ceiling arrival metering and slower surface movement are active",
      snow: "deicing routes and contaminated-runway performance are active",
      thunderstorm: weather.hazardsEnabled
        ? "convective capacity limits and opt-in wind-shear protection are active"
        : "convective capacity limits are active · severe hazards remain off",
    };
    setStatus(
      weather.condition === "clear"
        ? "Weather improving"
        : `${conditionProfile.label} moving onto the field`,
      detail[weather.condition],
    );
  }
  lastWeatherCondition = weather.condition;
  updateNightControl();
  updateCameraDirectorUi();
}

function recordTelemetry(
  type: string,
  flight?: { id: number; callsign: string; runway: number; phase: string },
  runway?: number,
  taxiway?: string,
  details?: {
    accepted?: boolean;
    detail?: string;
    payload?: unknown;
    causedByCommandId?: string;
    causedByControllerDecisionId?: string;
    causedByEventId?: number;
  },
): TelemetryEvent {
  const sequence = ++telemetrySequence;
  const event: TelemetryEvent = {
    protocolVersion: CONTROL_PROTOCOL_VERSION,
    apiVersion: CONTROL_API_VERSION,
    sessionId: controlSessionId,
    eventId: sequence,
    eventKey: `${controlSessionId}:${sequence}`,
    sequence,
    airport: config.code,
    elapsed: Number(simulation.state.elapsed.toFixed(2)),
    type,
    flightId: flight?.id,
    callsign: flight?.callsign,
    runway: runway ?? flight?.runway,
    phase: flight?.phase,
    taxiway,
    ...details,
    causedByCommandId:
      details?.causedByCommandId ?? activeControlCommandId ?? undefined,
    causedByControllerDecisionId: details?.causedByControllerDecisionId,
    causedByEventId: details?.causedByEventId,
  };
  telemetryEvents.push(event);
  if (telemetryEvents.length > 500)
    telemetryEvents.splice(0, telemetryEvents.length - 500);
  window.dispatchEvent(
    new CustomEvent("airport-auto:event", { detail: event }),
  );
  airportChannel?.postMessage({ type: "event", event });
  remoteControlHost.publishEvent(event);
  return event;
}

function cloneRunwayConfiguration(
  configuration: (typeof config.runwayConfigurations)[number],
) {
  return {
    ...configuration,
    arrivalRunwayIds: [...configuration.arrivalRunwayIds],
    departureRunwayIds: [...configuration.departureRunwayIds],
    operatingEnds: { ...configuration.operatingEnds },
    runwayRoles: { ...configuration.runwayRoles },
    restrictions: {
      ...configuration.restrictions,
      conditions: [...configuration.restrictions.conditions],
      scenarios: configuration.restrictions.scenarios
        ? [...configuration.restrictions.scenarios]
        : undefined,
    },
    source: configuration.source ? { ...configuration.source } : undefined,
  };
}

function cloneFocusTargetDescriptor(
  target: FocusTargetDescriptor,
): FocusTargetDescriptor {
  return {
    ...target,
    position: [...target.position],
    flightIds: [...target.flightIds],
  };
}

function cloneFocusTargetCatalog(
  catalog: FocusTargetCatalog,
): FocusTargetCatalog {
  return {
    ...catalog,
    categories: catalog.categories.map((category) => ({ ...category })),
    targets: catalog.targets.map(cloneFocusTargetDescriptor),
  };
}

function flightPoseAlignment(flight: Flight) {
  const collision = aircraftCollisionEnvelope(config, flight, flight.progress);
  const rendered = world.flightRenderPose(flight.id);
  const collisionHorizontalError = Math.hypot(
    collision.x - flight.motion.x,
    collision.y - flight.motion.y,
  );
  const rendererAuthoritativeError = rendered
    ? Math.hypot(
        rendered.position.x - flight.motion.x,
        rendered.position.y - flight.motion.y,
      )
    : null;
  return {
    schemaVersion: 1,
    authoritative: {
      x: flight.motion.x,
      y: flight.motion.y,
      z: flight.motion.z,
      heading: flight.motion.heading,
      onGround: flight.motion.onGround,
      protectedRunwayIds: [...flight.motion.protectedRunwayIds],
    },
    collision: {
      x: collision.x,
      y: collision.y,
      altitude: collision.altitude,
      heading: collision.heading,
      surface: collision.surface,
      protectedSurface: collision.protectedSurface,
      runway: collision.runway,
      taxiway: collision.taxiway ?? null,
      surfaceNode: collision.surfaceNode ?? null,
      surfaceEdge: collision.surfaceEdge ?? null,
    },
    renderer: rendered,
    errors: {
      collisionHorizontalWorld: collisionHorizontalError,
      rendererSourceHorizontalWorld: rendered?.horizontalSourceError ?? null,
      rendererAuthoritativeHorizontalWorld: rendererAuthoritativeError,
    },
  };
}

function airportSnapshot() {
  const diagnostics = simulation.diagnostics();
  const renderer = world.diagnostics();
  const operations = simulation.operationProfileSnapshot();
  const controllerEvaluation = buildControllerEvaluation(diagnostics);
  const analytics = operationsAnalyticsSnapshot(focusedFlightId);
  const movingPhases = new Set([
    "approach",
    "landing",
    "taxi-in",
    "taxi-out",
    "takeoff",
  ]);
  return {
    schemaVersion: CONTROL_SNAPSHOT_SCHEMA_VERSION,
    controlProtocol: {
      protocolVersion: CONTROL_PROTOCOL_VERSION,
      apiVersion: CONTROL_API_VERSION,
      sessionId: controlSessionId,
      commandCount: Object.keys(AIRPORT_CONTROL_COMMAND_DEFINITIONS).length,
      channel: CONTROL_BROADCAST_CHANNEL,
      schemas: "airportControl.protocol().schemas",
    },
    remoteControl: remoteControlHost.state(),
    training: simulation.trainingSnapshot(),
    challenge: simulation.challengeSnapshot(),
    sandbox: simulation.sandboxSnapshot(),
    airport: {
      code: config.code,
      name: config.name,
      scope: config.scope,
      fidelity: config.code === "LOCAL" ? "procedural" : "schematic",
      navigationUse: false,
      operationsPerYear: config.annualOperations,
      vectorData: config.vectorData
        ? {
            schemaVersion: config.vectorData.schemaVersion,
            assetPath: config.vectorData.assetPath,
            assetSha256: config.vectorData.assetSha256,
            retrievedOn: config.vectorData.retrievedOn,
            effective: config.vectorData.effective,
            coordinateSystem: config.vectorData.coordinateSystem,
            boundsMeters: config.vectorData.boundsMeters,
            layerCounts: config.vectorData.layerCounts,
            attribution: config.vectorData.attribution,
            sources: config.vectorData.sources,
          }
        : null,
      surfaceData: config.surfaceData
        ? {
            schemaVersion: config.surfaceData.schemaVersion,
            assetPath: config.surfaceData.assetPath,
            graphSha256: config.surfaceData.graphSha256,
            retrievedOn: config.surfaceData.retrievedOn,
            coordinateSystem: {
              ...config.surfaceData.coordinateSystem,
              originWgs84: [...config.surfaceData.coordinateSystem.originWgs84],
              axes: { ...config.surfaceData.coordinateSystem.axes },
            },
            counts: { ...config.surfaceData.counts },
            passengerFacilityReference: {
              ...config.surfaceData.passengerFacilityReference,
            },
            validationRules: { ...config.surfaceData.validationRules },
            license: config.surfaceData.license,
            attribution: config.surfaceData.attribution,
            copyrightUrl: config.surfaceData.copyrightUrl,
          }
        : null,
      contextData: config.contextData
        ? {
            schemaVersion: config.contextData.schemaVersion,
            assetPath: config.contextData.assetPath,
            assetSha256: config.contextData.assetSha256,
            retrievedOn: config.contextData.retrievedOn,
            coordinateSystem: {
              ...config.contextData.coordinateSystem,
              originWgs84: [...config.contextData.coordinateSystem.originWgs84],
              axes: { ...config.contextData.coordinateSystem.axes },
            },
            boundsMeters: {
              min: [...config.contextData.boundsMeters.min],
              max: [...config.contextData.boundsMeters.max],
            },
            source: {
              provider: config.contextData.source.provider,
              endpoint: config.contextData.source.endpoint,
              osmBaseTimestamp: config.contextData.source.osmBaseTimestamp,
            },
            counts: { ...config.contextData.counts },
            license: config.contextData.license,
            attribution: config.contextData.attribution,
            copyrightUrl: config.contextData.copyrightUrl,
          }
        : null,
      airspaceProgram: {
        schemaVersion: config.airspaceProgram.schemaVersion,
        dataVersion: config.airspaceProgram.dataVersion,
        nonNavigational: true,
        disclaimer: config.airspaceProgram.disclaimer,
        counts: {
          fixes: config.airspaceProgram.fixes.length,
          airways: config.airspaceProgram.airways.length,
          sectors: config.airspaceProgram.sectors.length,
          procedures: config.airspaceProgram.procedures.length,
          holds: config.airspaceProgram.holds.length,
          missedApproaches: config.airspaceProgram.missedApproaches.length,
        },
        fixes: config.airspaceProgram.fixes.map((fix) => ({
          ...fix,
          position: [...fix.position],
        })),
        airways: config.airspaceProgram.airways.map((airway) => ({
          ...airway,
          fixIds: [...airway.fixIds],
        })),
        sectors: config.airspaceProgram.sectors.map((sector) => ({
          ...sector,
          polygon: sector.polygon.map((point) => [...point]),
        })),
        procedures: config.airspaceProgram.procedures.map((procedure) => ({
          ...procedure,
          configurationIds: [...procedure.configurationIds],
          conditions: [...procedure.conditions],
          transitions: procedure.transitions.map((transition) => ({
            ...transition,
            fixIds: [...transition.fixIds],
          })),
          commonFixIds: [...procedure.commonFixIds],
          constraints: procedure.constraints.map((constraint) => ({
            ...constraint,
          })),
        })),
        holds: config.airspaceProgram.holds.map((hold) => ({ ...hold })),
        missedApproaches: config.airspaceProgram.missedApproaches.map(
          (missed) => ({ ...missed, fixIds: [...missed.fixIds] }),
        ),
        sources: config.airspaceProgram.sources.map((source) => ({
          ...source,
        })),
      },
    },
    clock: Number(simulation.state.elapsed.toFixed(2)),
    paused: simulation.state.paused,
    gameOver: simulation.state.gameOver,
    mode: simulation.state.mode,
    nightMode: simulation.state.nightMode,
    environment: cloneEnvironmentState(simulation.state.environment),
    presentation: {
      accessibilityPalette,
      cameraDirector: cameraDirector.snapshot(performance.now() / 1_000),
      capture: {
        ...localCapture.snapshot(),
        cleanView: capturePanel?.cleanView() ?? false,
      },
      airportLife: {
        visible: renderer.airportLifeVisible,
        terminalGates: { ...renderer.terminalGateActivity },
      },
    },
    liveData: liveDataPanel.snapshot(),
    community: communityPanel.snapshot(),
    radarVisible,
    queueInspectorVisible,
    windOverlayVisible,
    serviceVehiclesVisible,
    airportLifeVisible,
    // Retained as an always-false compatibility field for API 2.x clients.
    contrailsVisible: false,
    station: simulation.state.station,
    selection: {
      focusedFlightId,
      focusedTarget: activeFocusRef ? { ...activeFocusRef } : null,
      groupMode: groupSelectActive,
      groupedFlightIds: [...groupedFlightIds],
    },
    focus: {
      schemaVersion: 1,
      current: activeFocusTarget
        ? cloneFocusTargetDescriptor(activeFocusTarget)
        : null,
      catalog: cloneFocusTargetCatalog(focusTargetCatalog),
    },
    input: inputLayer.snapshot(),
    controllers: {
      automation: { ...simulation.state.stationAutomation },
      policy: simulation.controllerPolicySnapshot(),
      scripted: structuredClone(simulation.state.scriptedControllers),
      workloads: simulation.controllerWorkloads(),
      performance: simulation.controllerPerformance(),
      evaluation: controllerEvaluation,
      coordination: simulation.state.flights.flatMap((flight) => {
        const handoff = flight.navigation.handoff;
        return handoff &&
          (handoff.status === "offered" ||
            handoff.status === "accepted" ||
            handoff.status === "overdue")
          ? [{ flightId: flight.id, callsign: flight.callsign, ...handoff }]
          : [];
      }),
    },
    scenario: simulation.state.scenario,
    trafficDensity: simulation.state.trafficFlow.density,
    separationRuleset: diagnostics.separation,
    speed: simulationSpeed,
    weather: {
      enabled: simulation.state.weather.weatherEnabled,
      windEnabled: simulation.state.weather.windEnabled,
      condition: simulation.state.weather.condition,
      precipitation: simulation.state.weather.precipitation,
      intensity: Number(simulation.state.weather.intensity.toFixed(3)),
      cloudCover: Number(simulation.state.weather.cloudCover.toFixed(3)),
      windDirectionDegrees: Math.round(
        mathAngleToAviationDegrees(simulation.state.weather.windDirection),
      ),
      windSpeed: Number(simulation.state.weather.windSpeed.toFixed(1)),
      gustSpeed: Number(simulation.state.weather.gustSpeed.toFixed(1)),
      visibilityMiles: simulation.state.weather.visibility,
      ceilingFt: simulation.state.weather.ceilingFt,
      temperatureC: Number(simulation.state.weather.temperatureC.toFixed(1)),
      surfaceCondition: simulation.state.weather.surfaceCondition,
      runwayConditionReports:
        simulation.state.weather.runwayConditionReports.map((report) => ({
          ...report,
          codes: [...report.codes],
          runwayDesignation: activeRunwayDesignation(report.runwayId),
        })),
      reportsUpdatedAtSeconds: Number.isFinite(
        simulation.state.weather.reportsUpdatedAtSeconds,
      )
        ? Number(simulation.state.weather.reportsUpdatedAtSeconds.toFixed(2))
        : null,
      hazardsEnabled: simulation.state.weather.hazardsEnabled,
      activeHazard: simulation.state.weather.activeHazard
        ? {
            ...simulation.state.weather.activeHazard,
            affectedFlightIds: [
              ...simulation.state.weather.activeHazard.affectedFlightIds,
            ],
          }
        : null,
      hazardHistory: simulation.state.weather.hazardHistory.map((hazard) => ({
        ...hazard,
        affectedFlightIds: [...hazard.affectedFlightIds],
      })),
    },
    audio: {
      ...audio.snapshot(),
      scheduler: soundscape.snapshot(),
      captions: radioCaptions.snapshot(),
      recordedEvents: soundscapeEvents.length,
      sourceManifest: airportAutoAssetPath("audio.soundscape-manifest"),
      fictionalOfflineRadio: true,
    },
    operations,
    runwayConfiguration: {
      ...cloneRunwayConfiguration(
        config.runwayConfigurations.find(
          (configuration) =>
            configuration.id === simulation.state.runwayConfigurationId,
        ) ?? config.runwayConfigurations[0],
      ),
      selectionMode: simulation.state.runwayConfigurationMode,
      transition: simulation.state.runwayConfigurationTransition
        ? {
            ...simulation.state.runwayConfigurationTransition,
            changedRunwayIds: [
              ...simulation.state.runwayConfigurationTransition
                .changedRunwayIds,
            ],
            blockingFlightIds: [
              ...simulation.state.runwayConfigurationTransition
                .blockingFlightIds,
            ],
          }
        : null,
    },
    runwayConfigurations: config.runwayConfigurations.map((configuration) => ({
      ...cloneRunwayConfiguration(configuration),
      eligibility: simulation
        .runwayConfigurationOptions()
        .find((option) => option.id === configuration.id),
    })),
    score: {
      landed: simulation.state.arrivals,
      departed: simulation.state.departures,
    },
    replay: {
      schemaVersion: CONTROL_REPLAY_SCHEMA_VERSION,
      source: importedReplay ? "imported" : "live",
      frames: replayPlaybackFrames().length,
      durationSeconds: replayPlaybackFrames().length
        ? replayPlaybackFrames()[replayPlaybackFrames().length - 1].clock -
          replayPlaybackFrames()[0].clock
        : 0,
      markers: replayMarkers().length,
      soundEvents: (importedReplay?.soundEvents ?? soundscapeEvents).length,
      sharing: importedReplay?.sharing ?? {
        classification: "local-full",
        containsControllerIdentity: true,
        containsCorrelationIds: true,
        containsFreeText: true,
        automaticUpload: false,
        redactions: [],
      },
      verification: replayVerification
        ? {
            exact: replayVerification.exact,
            migrated: replayVerification.migrated,
            legacyUnsealed: replayVerification.legacyUnsealed,
            checkedFrames: replayVerification.checkedFrames,
            manifestHash: replayVerification.manifestHash,
            reason: replayVerification.reason,
            stale: replayVerificationStale,
          }
        : null,
      baselineFrame: replayBaselineIndex,
      comparison: replayComparison
        ? {
            equal: replayComparison.equal,
            differenceCount: replayComparison.differenceCount,
            truncated: replayComparison.truncated,
            leftHash: replayComparison.leftHash,
            rightHash: replayComparison.rightHash,
          }
        : null,
    },
    analytics: {
      schemaVersion: analytics.schemaVersion,
      generatedAtSeconds: analytics.generatedAtSeconds,
      window: { ...analytics.window },
      summary: { ...analytics.summary },
      observedFlights: analytics.flights.length,
      selectedFlightId: analytics.selectedFlightId,
      exportDatasets: [...OPERATIONS_EXPORT_DATASETS],
      disclosure: { ...analytics.disclosure },
      fullSnapshot: "airportControl.analytics(flightId?)",
      exportData:
        "airportControl.exportData('json' | 'csv', dataset?, flightId?)",
    },
    performance: runtimePerformance.snapshot(),
    traffic: diagnostics,
    trafficManagement: diagnostics.trafficManagement,
    queues: diagnostics.queues,
    digitalClearances: digitalClearanceSnapshot(displayState()),
    surfaceSafety: {
      visible: surfaceSafetyVisible,
      filter: surfaceSafetyFilterValue,
      display: {
        lookaheadSeconds: surfaceSafetyLookaheadSeconds,
        layers: { ...surfaceSafetyDiagramLayers },
      },
      ...structuredClone(currentSurfaceSafetySnapshot()),
    },
    surfaceDisruptions: simulation.state.surfaceDisruptions.map(
      (disruption) => ({
        ...disruption,
        edgeIds: [...disruption.edgeIds],
        reroutedFlightIds: [...disruption.reroutedFlightIds],
      }),
    ),
    proposals: simulation.clearanceProposals(),
    renderer: world.diagnostics(),
    runways: config.runways.map((runway) => ({
      id: runway.id,
      designation: runway.designation?.join("/"),
      role: simulation.state.activeRunwayRoles[runway.id] ?? runway.role,
      publishedRole: runway.role,
      landingEnd: runway.landingEnd,
      activeEnd: simulation.state.activeRunwayEnds[runway.id],
      activeDesignation: resolveActiveRunwayDesignation(
        config,
        simulation.state.activeRunwayEnds,
        runway.id,
      ),
      closed: simulation.state.surfaceDisruptions.some(
        (disruption) =>
          disruption.runwayId === runway.id &&
          (disruption.kind === "runway-closure" ||
            disruption.kind === "disabled-aircraft"),
      ),
      occupiedBy: simulation.state.flights
        .filter(
          (flight) =>
            flight.runway === runway.id && movingPhases.has(flight.phase),
        )
        .map((flight) => ({
          id: flight.id,
          callsign: flight.callsign,
          phase: flight.phase,
          progress: Number(flight.progress.toFixed(3)),
        })),
    })),
    surfaceGraph: {
      schemaVersion: config.surfaceGraph.schemaVersion,
      airportCode: config.surfaceGraph.airportCode,
      seed: config.surfaceGraph.seed,
      source: config.surfaceGraph.source
        ? { ...config.surfaceGraph.source }
        : undefined,
      nodes: config.surfaceGraph.nodes.map((node) => ({
        ...node,
        position: [...node.position],
        taxiwayIds: [...node.taxiwayIds],
      })),
      edges: config.surfaceGraph.edges.map((edge) => ({
        ...edge,
        crossedRunwayIds: edge.crossedRunwayIds
          ? [...edge.crossedRunwayIds]
          : undefined,
        sourceWayIds: edge.sourceWayIds ? [...edge.sourceWayIds] : undefined,
        crossingIds: edge.crossingIds ? [...edge.crossingIds] : undefined,
      })),
      taxiways: config.surfaceGraph.taxiways.map((taxiway) => ({
        ...taxiway,
        edgeIds: [...taxiway.edgeIds],
      })),
      stands: config.surfaceGraph.stands.map((stand) => ({
        ...stand,
        position: [...stand.position],
        supportedCategories: [...stand.supportedCategories],
      })),
      rampControlZones: surfaceRampControlZones(config.surfaceGraph),
      standFlows: config.surfaceGraph.stands
        .map((stand) => surfaceStandFlow(config.surfaceGraph, stand.id))
        .filter((flow) => flow !== null),
      gatePlanning: {
        model: "scheduled-stand-reservations",
        policy:
          config.code === "ORD"
            ? "ORD 2026 schematic airline and cargo affinities"
            : "deterministic airline terminal sectors",
        turnBufferSeconds: GATE_TURN_BUFFER_SECONDS,
        factors: [
          "airline",
          "terminal",
          "aircraft-size",
          "service-type",
          "arrival-time",
          "next-departure-route",
        ],
      },
      serviceVehiclePolicy: {
        model: "shared-surface-reservations",
        protectedMovementAreas: "blocked unless explicitly authorized",
        routeResources: [
          "edge",
          "node",
          "ramp-zone",
          "staging-position",
          "stand-side-lane",
          "service-bay",
        ],
        pushbackRequiresStandClear: true,
      },
      deicingFacilities: diagnostics.deicing.facilities,
      deicingPolicy: {
        model: "fixed-step-pad-queue-and-holdover",
        requiredCondition: "snow",
        routing: "stand-to-pad-to-runway-hold-short",
        expiredHoldoverAction: "return-to-pad-before-runway-entry",
      },
      passengerFacilities: config.surfaceGraph.passengerFacilities.map(
        (facility) => ({
          ...facility,
          center: [...facility.center],
          concourses: facility.concourses
            ? [...facility.concourses]
            : undefined,
          sections: facility.sections ? [...facility.sections] : undefined,
          sourceElementIds: [...facility.sourceElementIds],
          standIds: [...facility.standIds],
        }),
      ),
      passengerFacilityReference: config.surfaceGraph.passengerFacilityReference
        ? {
            ...config.surfaceGraph.passengerFacilityReference,
            terminals:
              config.surfaceGraph.passengerFacilityReference.terminals.map(
                (terminal) => ({
                  ...terminal,
                  concourses: terminal.concourses.map((concourse) => ({
                    ...concourse,
                    sections: concourse.sections
                      ? [...concourse.sections]
                      : undefined,
                  })),
                }),
              ),
          }
        : undefined,
      runwayAccess: config.surfaceGraph.runwayAccess.map((access) => ({
        ...access,
      })),
      controlPoints: config.surfaceGraph.controlPoints.map((point) => ({
        ...point,
        position: [...point.position],
      })),
      zones: config.surfaceGraph.zones.map((zone) => ({
        ...zone,
        sourceFeatureIds: [...zone.sourceFeatureIds],
        rings: zone.rings.map((ring) => ring.map((point) => [...point])),
        edgeIds: [...zone.edgeIds],
        standIds: [...zone.standIds],
      })),
      hotspots: config.surfaceGraph.hotspots.map((hotspot) => ({
        ...hotspot,
        rings: hotspot.rings.map((ring) => ring.map((point) => [...point])),
        nodeIds: [...hotspot.nodeIds],
        edgeIds: [...hotspot.edgeIds],
      })),
    },
    surface: simulation.state.flights
      .filter(
        (flight) =>
          flight.phase === "taxi-in" ||
          flight.phase === "resting" ||
          flight.phase === "taxi-out",
      )
      .map((flight) => ({
        id: flight.id,
        callsign: flight.callsign,
        phase: flight.phase,
        taxiway: flight.taxiway,
        stand: flight.standId,
        route: flight.surfaceRoute ?? [],
        routeEdges: flight.surfaceRouteEdges ?? [],
        node: flight.surfaceNode,
        edge: flight.surfaceEdge,
        progress: Number(flight.progress.toFixed(3)),
        operation: flightOperationLabel(flight),
        routePlanning: {
          routingCost:
            flight.surfaceRoutingCost === undefined
              ? null
              : Number(flight.surfaceRoutingCost.toFixed(2)),
          congestionPenalty:
            flight.surfaceCongestionPenalty === undefined
              ? null
              : Number(flight.surfaceCongestionPenalty.toFixed(2)),
          congestedEdgeIds: flight.surfaceCongestedEdgeIds ?? [],
        },
        rampControl: {
          zoneId: flight.rampControlZoneId ?? null,
          zoneName: flight.rampControlZoneName ?? null,
          capacity: flight.rampControlZoneCapacity ?? null,
          alleyId: flight.surfaceAlleyId ?? null,
          flowDirection: flight.surfaceFlowDirection ?? null,
          standPath: flight.standPath ?? null,
          holdReason: flight.automaticHoldReason ?? null,
        },
        pushback: {
          cleared: flight.pushbackCleared,
          direction: flight.pushbackDirection,
          progress: Number(flight.pushbackProgress.toFixed(3)),
          releaseProgress: Number(flight.pushbackReleaseProgress.toFixed(3)),
          tugAttached: flight.tugAttached,
        },
        turnaround: {
          status: flight.turnaround.status,
          progress: Number(flight.turnaround.progress.toFixed(3)),
          blockingServices: flight.turnaround.tasks
            .filter((task) => task.required && task.status !== "complete")
            .map((task) => task.type),
        },
        deicing: { ...flight.deicing },
        engineState: flight.engineState,
        holdingShortOf: flight.holdShortRunway,
        runwayEntryCleared: flight.runwayEntryCleared,
        takeoffCleared: flight.takeoffCleared,
        requiredCrossings: flight.requiredCrossings ?? [],
        crossingClearances: flight.crossingClearances ?? [],
        crossingClearanceIds: flight.crossingClearanceIds ?? [],
        crossingHoldPointId: flight.crossingHoldPointId,
      })),
    serviceVehicles: simulation.state.serviceVehicles.map((vehicle) => ({
      id: vehicle.id,
      flightId: vehicle.flightId,
      callsign: vehicle.callsign,
      service: vehicle.service,
      type: vehicle.type,
      label: vehicle.label,
      status: vehicle.status,
      standId: vehicle.standId,
      zoneId: vehicle.zoneId,
      bayId: vehicle.bayId,
      standSide: vehicle.standSide,
      depotNodeId: vehicle.depotNodeId,
      dispatchAtSeconds: Number(vehicle.dispatchAtSeconds.toFixed(2)),
      progress: Number(vehicle.progress.toFixed(3)),
      position: {
        x: Number(vehicle.x.toFixed(3)),
        y: Number(vehicle.y.toFixed(3)),
      },
      headingDegrees: Number(((vehicle.heading * 180) / Math.PI).toFixed(2)),
      groundSpeedMps: Number(vehicle.groundSpeedMps.toFixed(2)),
      maximumSpeedMps: vehicle.maximumSpeedMps,
      currentNode: vehicle.currentNode ?? null,
      currentEdge: vehicle.currentEdge ?? null,
      held: vehicle.held,
      holdReason: vehicle.holdReason ?? null,
      protectedMovementArea: vehicle.protectedMovementArea,
      protectedMovementAuthorized: vehicle.protectedMovementAuthorized,
      outboundRoute: [...vehicle.outboundRoute],
      outboundRouteEdges: [...vehicle.outboundRouteEdges],
      returnRoute: [...vehicle.returnRoute],
      returnRouteEdges: [...vehicle.returnRouteEdges],
      standPath: vehicle.standPath.map((point) => [...point]),
    })),
    flights: simulation.state.flights.map((flight) => ({
      id: flight.id,
      callsign: flight.callsign,
      phase: flight.phase,
      runway: flight.runway,
      departureRunway: flight.departureRunway,
      airline: {
        code: flight.airline,
        name: airlineProfile(flight.airline).name,
        callsign: airlineProfile(flight.airline).callsign,
        primaryColor: `#${airlineProfile(flight.airline).primaryColor.toString(16).padStart(6, "0")}`,
        accentColor: `#${airlineProfile(flight.airline).accentColor.toString(16).padStart(6, "0")}`,
      },
      flightNumber: flight.flightNumber,
      registration: flight.registration,
      service: flight.service,
      operationalDetail: { ...flight.operationalDetail },
      operationPlan: { ...flight.operationPlan },
      flightPlan: cloneFlightPlan(flight.flightPlan),
      flightPlanHistory: flight.flightPlanHistory.map(cloneFlightPlan),
      navigation: {
        ...flight.navigation,
        routeFixIds: [...flight.navigation.routeFixIds],
        handoff: flight.navigation.handoff
          ? { ...flight.navigation.handoff }
          : null,
        routeClearance: flight.navigation.routeClearance
          ? cloneFlightRouteClearance(flight.navigation.routeClearance)
          : null,
        vector: flight.navigation.vector
          ? {
              ...flight.navigation.vector,
              start: { ...flight.navigation.vector.start },
            }
          : null,
        hold: flight.navigation.hold
          ? {
              ...flight.navigation.hold,
              start: { ...flight.navigation.hold.start },
            }
          : null,
      },
      aircraft: {
        model: flight.aircraft,
        name: aircraftProfile(flight.aircraft).name,
        manufacturer: aircraftProfile(flight.aircraft).manufacturer,
        category: flight.category,
        fleetRole: aircraftProfile(flight.aircraft).fleetRole,
        wakeClass: flight.wakeClass,
        lengthM: aircraftProfile(flight.aircraft).lengthM,
        wingspanM: aircraftProfile(flight.aircraft).wingspanM,
        heightM: aircraftProfile(flight.aircraft).heightM,
        operatingEmptyWeightT: aircraftProfile(flight.aircraft)
          .operatingEmptyWeightT,
        maxTakeoffWeightT: aircraftProfile(flight.aircraft).maxTakeoffWeightT,
        maxLandingWeightT: aircraftProfile(flight.aircraft).maxLandingWeightT,
        usableFuelKg: aircraftProfile(flight.aircraft).usableFuelKg,
        nominalCruiseFuelBurnKgPerHour: aircraftProfile(flight.aircraft)
          .nominalCruiseFuelBurnKgPerHour,
        maximumRangeNm: aircraftProfile(flight.aircraft).maximumRangeNm,
        cruiseKts: aircraftProfile(flight.aircraft).cruiseKts,
        approachKts: aircraftProfile(flight.aircraft).approachKts,
        rotationKts: aircraftProfile(flight.aircraft).rotationKts,
        taxiKts: aircraftProfile(flight.aircraft).taxiKts,
        taxiTurnKts: aircraftProfile(flight.aircraft).taxiTurnKts,
        taxiAccelerationMps2: aircraftProfile(flight.aircraft)
          .taxiAccelerationMps2,
        taxiBrakingMps2: aircraftProfile(flight.aircraft).taxiBrakingMps2,
        taxiTurnRadiusM: aircraftProfile(flight.aircraft).taxiTurnRadiusM,
        minimumWingtipClearanceM: aircraftProfile(flight.aircraft)
          .minimumWingtipClearanceM,
        takeoffRollM: aircraftProfile(flight.aircraft).takeoffRollM,
        landingRollM: aircraftProfile(flight.aircraft).landingRollM,
        takeoffRunwayRequiredM: aircraftProfile(flight.aircraft)
          .takeoffRunwayRequiredM,
        landingRunwayRequiredM: aircraftProfile(flight.aircraft)
          .landingRunwayRequiredM,
        climbFpm: aircraftProfile(flight.aircraft).climbFpm,
        descentFpm: aircraftProfile(flight.aircraft).descentFpm,
        accelerationMps2: aircraftProfile(flight.aircraft).accelerationMps2,
        brakingMps2: aircraftProfile(flight.aircraft).brakingMps2,
        turnRadiusM: aircraftProfile(flight.aircraft).turnRadiusM,
        wakeSeparationSeconds: aircraftProfile(flight.aircraft)
          .wakeSeparationSeconds,
        serviceMinutes: aircraftProfile(flight.aircraft).serviceMinutes,
        engines: aircraftProfile(flight.aircraft).engines,
        engineType: aircraftProfile(flight.aircraft).engineType,
        visualFamily: aircraftProfile(flight.aircraft).visual.family,
        dataReferenceIds: [
          ...aircraftProfile(flight.aircraft).dataReferenceIds,
        ],
        auditedOn: aircraftProfile(flight.aircraft).auditedOn,
      },
      category: flight.category,
      wakeClass: flight.wakeClass,
      procedure: flight.procedure,
      origin: flight.origin,
      destination: flight.destination,
      squawk: flight.squawk,
      emergency: flight.emergency ?? null,
      goAround: flight.goAround
        ? {
            startedAt: Number(flight.goAround.startedAt.toFixed(2)),
            detail: flight.goAround.detail,
            stage: flight.motion.stage,
            stageProgress: Number(flight.motion.stageProgress.toFixed(3)),
            start: {
              x: Number(flight.goAround.start.x.toFixed(3)),
              y: Number(flight.goAround.start.y.toFixed(3)),
              z: Number(flight.goAround.start.z.toFixed(3)),
              headingDegrees: Number(
                ((flight.goAround.start.heading * 180) / Math.PI).toFixed(2),
              ),
            },
            weatherEscape: flight.goAround.weatherEscape
              ? { ...flight.goAround.weatherEscape }
              : null,
          }
        : null,
      weatherEscape: flight.weatherEscape ? { ...flight.weatherEscape } : null,
      takeoffPerformance: flight.takeoffPerformance
        ? { ...flight.takeoffPerformance }
        : null,
      diversion: flight.diversion
        ? {
            airportCode: flight.diversion.airportCode,
            exitFixId: flight.diversion.exitFixId,
            issuedAtSeconds: Number(
              flight.diversion.issuedAtSeconds.toFixed(2),
            ),
            reason: flight.diversion.reason,
            stage: flight.motion.stage,
            stageProgress: Number(flight.motion.stageProgress.toFixed(3)),
            start: {
              x: Number(flight.diversion.start.x.toFixed(3)),
              y: Number(flight.diversion.start.y.toFixed(3)),
              z: Number(flight.diversion.start.z.toFixed(3)),
              headingDegrees: Number(
                ((flight.diversion.start.heading * 180) / Math.PI).toFixed(2),
              ),
            },
          }
        : null,
      runwayExit: flight.runwayExit
        ? {
            ...flight.runwayExit,
            taxiRouteEdgeIds: [...flight.runwayExit.taxiRouteEdgeIds],
            rationale: [...flight.runwayExit.rationale],
          }
        : null,
      surfaceReroute: flight.surfaceReroute
        ? {
            ...flight.surfaceReroute,
            disruptionIds: [...flight.surfaceReroute.disruptionIds],
            previousEdgeIds: [...flight.surfaceReroute.previousEdgeIds],
            routeEdgeIds: [...flight.surfaceReroute.routeEdgeIds],
          }
        : null,
      operatingEnd: flight.operatingEnd,
      activeRunwayEnd: resolveRunwayDesignation(
        config.runways[flight.runway],
        flight.operatingEnd,
        String(flight.runway + 1),
      ),
      progress: Number(flight.progress.toFixed(3)),
      fuelPlan: {
        ...flight.fuelPlan,
        arrival: { ...flight.fuelPlan.arrival },
        departure: { ...flight.fuelPlan.departure },
        assumptions: [...flight.fuelPlan.assumptions],
      },
      kinematics: {
        airspeedKts: Number(flight.kinematics.airspeedKts.toFixed(1)),
        groundSpeedKts: Number(flight.kinematics.groundSpeedKts.toFixed(1)),
        altitudeFt: Math.round(flight.kinematics.altitudeFt),
        verticalSpeedFpm: Math.round(flight.kinematics.verticalSpeedFpm),
        accelerationMps2: Number(flight.kinematics.accelerationMps2.toFixed(2)),
        fuelPercent: Number(flight.kinematics.fuelPercent.toFixed(2)),
        headingDegrees:
          Math.round(mathAngleToAviationDegrees(flight.motion.heading)) % 360 ||
          360,
        cardinalDirection: cardinalDirection(
          mathAngleToAviationDegrees(flight.motion.heading),
        ),
      },
      systems: aircraftSystemsState(
        flight,
        simulation.state.weather,
        simulation.state.elapsed,
      ),
      turnaround: {
        status: flight.turnaround.status,
        progress: Number(flight.turnaround.progress.toFixed(3)),
        elapsedSeconds: Number(flight.turnaround.elapsedSeconds.toFixed(2)),
        plannedDurationSeconds: flight.turnaround.plannedDurationSeconds,
        scheduledStartSeconds: Number(
          flight.turnaround.scheduledStartSeconds.toFixed(2),
        ),
        scheduledReadySeconds: Number(
          flight.turnaround.scheduledReadySeconds.toFixed(2),
        ),
        actualStartSeconds:
          flight.turnaround.actualStartSeconds === undefined
            ? null
            : Number(flight.turnaround.actualStartSeconds.toFixed(2)),
        actualReadySeconds:
          flight.turnaround.actualReadySeconds === undefined
            ? null
            : Number(flight.turnaround.actualReadySeconds.toFixed(2)),
        releasedAtSeconds:
          flight.turnaround.releasedAtSeconds === undefined
            ? null
            : Number(flight.turnaround.releasedAtSeconds.toFixed(2)),
        initialFuelPercent: Number(
          flight.turnaround.initialFuelPercent.toFixed(2),
        ),
        targetFuelPercent: Number(
          flight.turnaround.targetFuelPercent.toFixed(2),
        ),
        activeServices: flight.turnaround.tasks
          .filter((task) => task.status === "active")
          .map((task) => task.type),
        blockingServices: flight.turnaround.tasks
          .filter((task) => task.required && task.status !== "complete")
          .map((task) => task.type),
        tasks: flight.turnaround.tasks.map((task) => ({
          type: task.type,
          label: task.label,
          required: task.required,
          status: task.status,
          durationSeconds: task.durationSeconds,
          scheduledStartOffsetSeconds: task.scheduledStartOffsetSeconds,
          elapsedSeconds: Number(task.elapsedSeconds.toFixed(2)),
          dependencies: [...task.dependencies],
          reason: task.reason,
          actualStartSeconds:
            task.actualStartSeconds === undefined
              ? null
              : Number(task.actualStartSeconds.toFixed(2)),
          actualCompleteSeconds:
            task.actualCompleteSeconds === undefined
              ? null
              : Number(task.actualCompleteSeconds.toFixed(2)),
        })),
      },
      deicing: {
        ...flight.deicing,
        queueHoldProgress: Number(flight.deicing.queueHoldProgress.toFixed(3)),
        treatmentProgress: Number(flight.deicing.treatmentProgress.toFixed(3)),
        padExitProgress: Number(flight.deicing.padExitProgress.toFixed(3)),
        treatmentElapsedSeconds: Number(
          flight.deicing.treatmentElapsedSeconds.toFixed(2),
        ),
        holdoverRemainingSeconds: Number(
          flight.deicing.holdoverRemainingSeconds.toFixed(2),
        ),
      },
      motion: { ...flight.motion },
      poseAlignment: flightPoseAlignment(flight),
      renderedAttitude: world.flightAttitude(flight.id),
      trajectory: flightTrajectorySnapshot(flight),
      gateSlot: flight.gateSlot,
      stand: flight.standId,
      gate: (() => {
        const stand = config.surfaceGraph.stands.find(
          (candidate) => candidate.slot === flight.gateSlot,
        );
        return stand
          ? {
              id: stand.id,
              ref: stand.gateRef ?? null,
              terminalId: stand.terminalId ?? null,
              terminal: stand.terminal,
              concourse: stand.concourse ?? null,
              maximumWingspanM: stand.maximumWingspanM,
              assignment: flight.gateAssignment
                ? {
                    status:
                      flight.phase === "approach" || flight.phase === "landing"
                        ? "planned"
                        : flight.phase === "taxi-in"
                          ? "inbound"
                          : flight.phase === "resting"
                            ? "occupied"
                            : flight.phase === "taxi-out" &&
                                flight.gateAssignment.actualGateOutSeconds ===
                                  undefined
                              ? "releasing"
                              : "released",
                    assignedAtSeconds: Number(
                      flight.gateAssignment.assignedAtSeconds.toFixed(2),
                    ),
                    scheduledGateInSeconds: Number(
                      flight.gateAssignment.scheduledGateInSeconds.toFixed(2),
                    ),
                    scheduledDepartureSeconds: Number(
                      flight.gateAssignment.scheduledDepartureSeconds.toFixed(
                        2,
                      ),
                    ),
                    actualGateInSeconds:
                      flight.gateAssignment.actualGateInSeconds === undefined
                        ? null
                        : Number(
                            flight.gateAssignment.actualGateInSeconds.toFixed(
                              2,
                            ),
                          ),
                    actualGateOutSeconds:
                      flight.gateAssignment.actualGateOutSeconds === undefined
                        ? null
                        : Number(
                            flight.gateAssignment.actualGateOutSeconds.toFixed(
                              2,
                            ),
                          ),
                    nextDestination: flight.gateAssignment.nextDestination,
                    departureRunway: flight.gateAssignment.departureRunway,
                    airlineFit: flight.gateAssignment.airlineFit,
                    serviceFit: flight.gateAssignment.serviceFit,
                    serviceArea: flight.gateAssignment.serviceArea,
                    zoneName: flight.gateAssignment.zoneName,
                    arrivalRouteDistance:
                      flight.gateAssignment.arrivalRouteDistance,
                    departureRouteDistance:
                      flight.gateAssignment.departureRouteDistance,
                    score: flight.gateAssignment.score,
                    rationale: [...flight.gateAssignment.rationale],
                    revision: flight.gateAssignment.revision,
                    previousStandId:
                      flight.gateAssignment.previousStandId ?? null,
                  }
                : null,
            }
          : null;
      })(),
      cleared: flight.cleared,
      taxiway: flight.taxiway,
      groundOperation: {
        label: flightOperationLabel(flight),
        pushbackCleared: flight.pushbackCleared,
        pushbackDirection: flight.pushbackDirection,
        pushbackProgress: Number(flight.pushbackProgress.toFixed(3)),
        pushbackReleaseProgress: Number(
          flight.pushbackReleaseProgress.toFixed(3),
        ),
        tugAttached: flight.tugAttached,
        engineState: flight.engineState,
        rampControlZoneId: flight.rampControlZoneId ?? null,
        rampControlZoneName: flight.rampControlZoneName ?? null,
        rampControlZoneCapacity: flight.rampControlZoneCapacity ?? null,
        alleyId: flight.surfaceAlleyId ?? null,
        flowDirection: flight.surfaceFlowDirection ?? null,
        standPath: flight.standPath ?? null,
        automaticHoldReason: flight.automaticHoldReason ?? null,
      },
      surfaceRoutePlanning: {
        routingCost:
          flight.surfaceRoutingCost === undefined
            ? null
            : Number(flight.surfaceRoutingCost.toFixed(2)),
        congestionPenalty:
          flight.surfaceCongestionPenalty === undefined
            ? null
            : Number(flight.surfaceCongestionPenalty.toFixed(2)),
        congestedEdgeIds: flight.surfaceCongestedEdgeIds ?? [],
      },
      taxiPerformance: (() => {
        const profile = aircraftProfile(flight.aircraft);
        const surface = sampleAircraftSurfaceMotion(
          config.surfaceGraph,
          flight.surfaceRoute,
          flight.surfaceRouteEdges,
          flight.progress,
          profile,
        );
        const brakingMultiplier =
          simulation.state.weather.condition === "snow"
            ? 0.58
            : simulation.state.weather.condition === "rain"
              ? 0.76
              : simulation.state.weather.condition === "fog"
                ? 0.9
                : 1;
        const finite = (value: number | undefined): number | null =>
          value !== undefined && Number.isFinite(value)
            ? Number(value.toFixed(2))
            : null;
        return {
          targetTaxiKts: profile.taxiKts,
          turnLimitKts: profile.taxiTurnKts,
          speedLimitKts: finite(surface?.speedLimitKts),
          taxiAccelerationMps2: profile.taxiAccelerationMps2,
          taxiBrakingMps2: Number(
            (profile.taxiBrakingMps2 * brakingMultiplier).toFixed(2),
          ),
          stoppingDistanceM: Number(
            surfaceStoppingDistanceM(
              profile,
              flight.kinematics.groundSpeedKts,
              0,
              brakingMultiplier,
            ).toFixed(1),
          ),
          designTurnRadiusM: profile.taxiTurnRadiusM,
          currentTurnRadiusM: finite(surface?.turnRadiusM),
          turnConstrained: surface?.turnConstrained ?? false,
          nextTurnDistanceM: finite(surface?.nextTurnDistanceM),
          nextTurnSpeedKts: finite(surface?.nextTurnSpeedKts),
          wingtipClearanceM: finite(surface?.wingtipClearanceM),
          minimumRouteWingtipClearanceM: finite(
            surface?.minimumRouteWingtipClearanceM,
          ),
          requiredWingtipClearanceM: profile.minimumWingtipClearanceM,
          routeClearanceOk: surface?.routeClearanceOk ?? true,
          limitingEdgeId: surface?.limitingEdgeId ?? null,
        };
      })(),
      surfaceRoute: flight.surfaceRoute ?? [],
      surfaceRouteEdges: flight.surfaceRouteEdges ?? [],
      surfaceNode: flight.surfaceNode,
      surfaceEdge: flight.surfaceEdge,
      holdingShortOf: flight.holdShortRunway,
      runwayEntryCleared: flight.runwayEntryCleared,
      takeoffCleared: flight.takeoffCleared,
      requiredCrossings: flight.requiredCrossings ?? [],
      crossingClearances: flight.crossingClearances ?? [],
      crossingClearanceIds: flight.crossingClearanceIds ?? [],
      control: {
        pace: flight.controlPace ?? 1,
        held: flight.controlHold ?? false,
        automaticHold: flight.automaticHold ?? false,
        automaticHoldReason: flight.automaticHoldReason ?? null,
        safetyHold: flight.safetyHold ?? false,
        safetyHoldReason: flight.safetyHoldReason ?? null,
        pattern: flight.controlPattern ?? null,
      },
    })),
    recentEvents: telemetryEvents.slice(-20),
  };
}

function executeAirportCommand(
  command: AirportControlCommand,
): ReturnType<typeof airportSnapshot> {
  return executeAirportRequest(command).snapshot;
}

type AirportRequestContext = {
  requestId?: string;
  clientId?: string;
  source?: ControlCommandSource;
  protocolVersion?: string;
  expects?: ControlProtocolExpectations;
  authority?: ControlAuthorityAssertion;
  envelopeIssues?: ProtocolValidationIssue[];
  compatibility?: ProtocolCompatibilityAssessment;
};

type NormalizedAirportRequestContext = {
  requestId: string;
  clientId: string | null;
  commandId: string;
  source: ControlCommandSource;
  authority: ControlAuthorityAssertion | null;
  compatibility: ProtocolCompatibilityAssessment;
};

function normalizedAirportRequestContext(
  context: AirportRequestContext,
): NormalizedAirportRequestContext {
  const source = context.source ?? "page";
  return {
    requestId: context.requestId?.trim() || generatedControlId("request"),
    clientId: context.clientId?.trim() || null,
    commandId: generatedControlId("command"),
    source,
    authority: context.authority ?? null,
    compatibility:
      context.compatibility ??
      assessProtocolCompatibility(
        context.protocolVersion ?? CONTROL_PROTOCOL_VERSION,
        context.expects,
      ),
  };
}

function uniqueProtocolIssues(
  issues: readonly ProtocolValidationIssue[],
): ProtocolValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.path}|${issue.keyword}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function controlAuditValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : `[${String(value)}]`;
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "undefined") return "[undefined]";
  if (typeof value === "function")
    return `[function ${value.name || "anonymous"}]`;
  if (typeof value === "symbol") return `[${String(value)}]`;
  if (depth >= 8) return "[depth limit]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value))
    return value
      .slice(0, 100)
      .map((entry) => controlAuditValue(entry, depth + 1, seen));
  const entries = Object.entries(value as Record<string, unknown>).slice(
    0,
    100,
  );
  return Object.fromEntries(
    entries.map(([key, entry]) => [
      key,
      controlAuditValue(entry, depth + 1, seen),
    ]),
  );
}

function finalizeAirportRequest(
  candidate: unknown,
  command: AirportControlCommand | undefined,
  validation: { valid: boolean; issues: ProtocolValidationIssue[] },
  context: NormalizedAirportRequestContext,
  effectiveStation: ControllerStation,
  originatingSimulation: AirportSimulation,
  eventCursor: number,
  accepted: boolean,
  reason: string,
  data?:
    | GroupInstructionPreview
    | GroupInstructionIssueResult
    | FlightRouteClearanceState,
): AirportControlResult {
  if (simulation === originatingSimulation)
    simulation.tagEventsSince(eventCursor, context.commandId);
  else simulation.tagEventsSince(0, context.commandId);
  const candidateAction =
    typeof candidate === "object" &&
    candidate !== null &&
    !Array.isArray(candidate) &&
    typeof (candidate as { action?: unknown }).action === "string" &&
    (candidate as { action: string }).action in
      AIRPORT_CONTROL_COMMAND_DEFINITIONS
      ? (candidate as { action: AirportControlAction }).action
      : null;
  const action = command?.action ?? candidateAction;
  const definition = action
    ? AIRPORT_CONTROL_COMMAND_DEFINITIONS[action]
    : null;
  const auditCandidate = controlAuditValue(candidate);
  const commandEvent = recordTelemetry(
    `command:${action ?? "invalid"}`,
    undefined,
    undefined,
    undefined,
    {
      accepted,
      detail: reason,
      causedByCommandId: context.commandId,
      payload: {
        requestId: context.requestId,
        clientId: context.clientId,
        commandId: context.commandId,
        source: context.source,
        command: auditCandidate,
        validation,
      },
    },
  );
  if (command) {
    commandHistory.push({
      sequence: commandEvent.sequence,
      eventId: commandEvent.eventId,
      eventKey: commandEvent.eventKey,
      elapsed: Number(simulation.state.elapsed.toFixed(3)),
      requestId: context.requestId,
      commandId: context.commandId,
      clientId: context.clientId,
      source: context.source,
      station: effectiveStation,
      actorId: context.authority?.actorId ?? null,
      command: { ...command } as AirportControlCommand,
      accepted,
      reason,
    });
    if (commandHistory.length > 2_000)
      commandHistory.splice(0, commandHistory.length - 2_000);
  }
  const snapshot = airportSnapshot();
  const result: AirportControlResult = {
    protocolVersion: CONTROL_PROTOCOL_VERSION,
    apiVersion: CONTROL_API_VERSION,
    sessionId: controlSessionId,
    requestId: context.requestId,
    clientId: context.clientId,
    commandId: context.commandId,
    source: context.source,
    action,
    accepted,
    reason,
    sequence: commandEvent.sequence,
    eventId: commandEvent.eventId,
    eventKey: commandEvent.eventKey,
    authority: {
      rule: definition?.authority.rule ?? "public",
      assertedStation: context.authority?.station ?? null,
      effectiveStation,
      resultingStation: simulation.state.station,
      requiredStations: [...(definition?.authority.stations ?? [])],
      flightOwnership: definition?.authority.flightOwnership ?? false,
      safetyArbiter: definition?.authority.safetyArbiter ?? false,
      enforced: true,
      actorId: context.authority?.actorId ?? null,
    },
    compatibility: context.compatibility,
    validation,
    snapshot,
    resultingState: snapshot,
    ...(data ? { data } : {}),
  };
  airportChannel?.postMessage({
    type: "command-result",
    command: auditCandidate,
    result,
  });
  if (activeControlCommandId === context.commandId)
    activeControlCommandId = null;
  return result;
}

function executeAirportRequest(
  candidate: unknown,
  requestContext: AirportRequestContext = {},
): AirportControlResult {
  const context = normalizedAirportRequestContext(requestContext);
  const effectiveStation = simulation.state.station;
  const originatingSimulation = simulation;
  const eventCursor = originatingSimulation.eventCursor();
  const commandValidation = validateAirportControlCommand(candidate);
  const issues = uniqueProtocolIssues([
    ...(requestContext.envelopeIssues ?? []),
    ...commandValidation.issues,
  ]);
  const validation = {
    valid: commandValidation.valid && issues.length === 0,
    issues,
  };
  const command = commandValidation.command;
  if (!command || !validation.valid) {
    const reason = issues[0]?.message ?? "command failed protocol validation";
    return finalizeAirportRequest(
      candidate,
      command,
      validation,
      context,
      effectiveStation,
      originatingSimulation,
      eventCursor,
      false,
      reason,
    );
  }
  if (!context.compatibility.compatible) {
    return finalizeAirportRequest(
      candidate,
      command,
      validation,
      context,
      effectiveStation,
      originatingSimulation,
      eventCursor,
      false,
      context.compatibility.reason,
    );
  }
  if (
    [
      "setNightMode",
      "setEnvironmentLightingMode",
      "setEnvironmentSeasonMode",
      "setOperationTimeOffset",
      "setTrafficDensity",
      "setTrafficFlowObjective",
      "setWeather",
      "setWeatherEnabled",
      "setWindEnabled",
    ].includes(command.action)
  )
    clearAmbientProgramSelection();
  if (context.authority && context.authority.station !== effectiveStation) {
    const reason = `asserted ${context.authority.station} authority does not match selected ${effectiveStation} station`;
    return finalizeAirportRequest(
      candidate,
      command,
      validation,
      context,
      effectiveStation,
      originatingSimulation,
      eventCursor,
      false,
      reason,
    );
  }
  activeControlCommandId = context.commandId;
  let accepted = true;
  let reason = "accepted";
  let data:
    | GroupInstructionPreview
    | GroupInstructionIssueResult
    | FlightRouteClearanceState
    | undefined;
  if (command.action === "pause") {
    accepted = simulation.setPaused(true);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "resume") {
    accepted = simulation.setPaused(false);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "nextView") {
    clearFlightFocus();
    world.nextView();
  }
  if (command.action === "zoomIn") {
    clearFlightFocus();
    world.zoomIn();
  }
  if (command.action === "zoomOut") {
    clearFlightFocus();
    world.zoomOut();
  }
  if (command.action === "rotateLeft") {
    clearFlightFocus();
    world.rotateBy(-1);
  }
  if (command.action === "rotateRight") {
    clearFlightFocus();
    world.rotateBy(1);
  }
  if (command.action === "resetCamera") {
    clearFlightFocus();
    world.resetCamera();
  }
  if (command.action === "setSpeed") {
    accepted = Number.isFinite(command.value);
    if (accepted) setSimulationSpeed(command.value);
    else reason = "speed must be a finite number";
  }
  if (command.action === "setMode") {
    const valid = ["auto", "assisted", "manual", "watch"].includes(
      command.value,
    );
    accepted = valid && selectControl(command.value);
    reason = valid
      ? simulation.lastCommandReason()
      : "mode must be auto, assisted, manual, or watch";
  }
  if (command.action === "setNightMode") {
    simulation.setNightMode(command.enabled);
    updateNightControl();
  }
  if (command.action === "setEnvironmentLightingMode") {
    accepted =
      isEnvironmentLightingMode(command.mode) &&
      simulation.setEnvironmentLightingMode(command.mode);
    reason = accepted
      ? environmentLightingDescription(command.mode)
      : "lighting mode must be automatic, day, or night";
    updateNightControl();
  }
  if (command.action === "setEnvironmentSeasonMode") {
    accepted =
      isEnvironmentSeasonMode(command.mode) &&
      simulation.setEnvironmentSeasonMode(command.mode);
    reason = accepted
      ? environmentSeasonDescription(command.mode)
      : "season mode must be automatic, spring, summer, autumn, or winter";
    updateNightControl();
  }
  if (command.action === "setOperationTimeOffset") {
    accepted =
      Number.isFinite(command.minutes) &&
      simulation.setOperationTimeOffsetMinutes(command.minutes);
    reason = accepted
      ? simulation.lastCommandReason()
      : "operation time offset must be a finite number";
    updateNightControl();
  }
  if (command.action === "applyAmbientProgram") {
    accepted = simulation.applyAmbientProgram(command.id);
    reason = simulation.lastCommandReason();
    updateNightControl();
  }
  if (command.action === "setAccessibilityPalette") {
    accepted = isAccessibilityPalette(command.palette);
    if (accepted) {
      applyAccessibilityPalette(command.palette);
      reason = accessibilityPaletteDefinition(command.palette).description;
    } else
      reason =
        "palette must be standard, high-contrast, cvd-safe, or monochrome";
  }
  if (command.action === "setCameraDirectorEnabled") {
    accepted = setCameraDirectorEnabled(command.enabled);
    reason = accepted
      ? cameraDirector.snapshot(performance.now() / 1_000).reason
      : "reduced-motion preference prevents automatic camera movement";
  }
  if (command.action === "setRadarVisible") {
    setRadarPanelVisible(command.enabled);
  }
  if (command.action === "setQueueInspectorVisible") {
    setQueuePanelVisible(command.enabled);
  }
  if (command.action === "setSurfaceSafetyVisible") {
    setSurfaceSafetyPanelVisible(command.enabled);
  }
  if (command.action === "setSurfaceSafetyFilter") {
    surfaceSafetyFilterValue = command.filter;
    surfaceSafetyFilter.value = command.filter;
    surfaceSafetyUiKey = "";
    if (surfaceSafetyVisible) renderSurfaceSafety();
  }
  if (command.action === "setSurfaceSafetyLookahead") {
    accepted = setSurfaceSafetyLookahead(command.seconds);
    if (!accepted) reason = "look-ahead horizon must be 15, 30, or 60 seconds";
  }
  if (command.action === "setSurfaceSafetyDiagramLayer") {
    setSurfaceSafetyDiagramLayer(command.layer, command.enabled);
  }
  if (command.action === "acknowledgeSurfaceAdvisory") {
    const acknowledgement = surfaceSafetyAcknowledgements.acknowledge(
      currentSurfaceSafetySnapshot(),
      command.advisoryId,
      displayState().elapsed,
    );
    accepted = acknowledgement.accepted;
    reason = acknowledgement.reason;
    if (accepted) {
      surfaceSafetyUiKey = "";
    }
  }
  if (command.action === "setRunwayLabelsVisible")
    setRunwayLabelsVisible(command.enabled);
  if (command.action === "setSurfaceLayerVisible") {
    accepted = [
      "taxiway-labels",
      "operational-zones",
      "hotspots",
      "airport-boundary",
      "protection-zones",
      "movement-projections",
    ].includes(command.layer);
    if (accepted) setSurfaceLayerVisible(command.layer, command.enabled);
    else
      reason =
        "surface layer must be taxiway-labels, operational-zones, hotspots, airport-boundary, protection-zones, or movement-projections";
  }
  if (command.action === "setAirspaceLayerVisible") {
    accepted = [
      "airspace-sectors",
      "navigation-fixes",
      "procedures",
      "flight-routes",
      "separation",
    ].includes(command.layer);
    if (accepted) setAirspaceLayerVisible(command.layer, command.enabled);
    else
      reason =
        "airspace layer must be airspace-sectors, navigation-fixes, procedures, flight-routes, or separation";
  }
  if (command.action === "setMapOrientationVisible")
    setMapOrientationVisible(command.enabled);
  if (command.action === "setWindOverlayVisible")
    setWindOverlayVisible(command.enabled);
  if (command.action === "setServiceVehiclesVisible")
    setServiceVehiclesVisible(command.enabled);
  if (command.action === "setContrailsVisible") {
    accepted = !command.enabled;
    reason = command.enabled
      ? "contrails have been removed"
      : "contrails are permanently disabled";
  }
  if (command.action === "setAirportLifeVisible")
    setAirportLifeVisible(command.enabled);
  if (command.action === "setGamepadEnabled") {
    accepted = typeof command.enabled === "boolean";
    if (accepted) {
      inputLayer.setGamepadEnabled(command.enabled);
      refreshInputSettings();
      reason = command.enabled
        ? "gamepad input enabled"
        : "gamepad input disabled";
    } else reason = "gamepad enabled must be a boolean";
  }
  if (command.action === "setGamepadSensitivity") {
    accepted =
      Number.isFinite(command.sensitivity) &&
      command.sensitivity >= 0.5 &&
      command.sensitivity <= 2;
    if (accepted) {
      inputLayer.setGamepadSensitivity(command.sensitivity);
      refreshInputSettings();
      reason = `gamepad sensitivity set to ${command.sensitivity.toFixed(1)}x`;
    } else reason = "gamepad sensitivity must be a finite number from 0.5 to 2";
  }
  if (command.action === "selectAirport") {
    const code = command.code.toUpperCase();
    const known =
      code === "LOCAL" || HUB_AIRPORTS.some((airport) => airport.code === code);
    accepted = known && !simulation.challengeSnapshot().conditionsLocked;
    if (accepted) selectAirport(code, false);
    else
      reason = known
        ? "the active challenge locks its airport until the debrief"
        : `unknown airport ${code}`;
  }
  if (command.action === "clearFlight") {
    accepted = simulation.clearFlight(command.flightId, command.runway);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "reassignArrivalGate") {
    accepted = simulation.requestArrivalGateReassignment(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "clearPushback") {
    accepted = simulation.clearPushback(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "clearRunwayEntry") {
    accepted = simulation.clearRunwayEntry(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "clearTakeoff") {
    accepted = simulation.clearTakeoff(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "cancelTakeoffClearance") {
    accepted = simulation.cancelTakeoffClearance(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "clearRunwayCrossing") {
    accepted = simulation.clearRunwayCrossing(command.flightId, command.runway);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "controlFlights") {
    const groupResult =
      Array.isArray(command.flightIds) && command.flightIds.length > 1
        ? simulation.issueGroupedInstruction(
            command.flightIds,
            command.instruction,
          )
        : null;
    const controlled = groupResult
      ? groupResult.issued
        ? groupResult.flightIds
        : []
      : Array.isArray(command.flightIds)
        ? simulation.controlFlights(command.flightIds, command.instruction)
        : [];
    data = groupResult ?? undefined;
    accepted = controlled.length > 0;
    reason = Array.isArray(command.flightIds)
      ? simulation.lastCommandReason()
      : "flightIds must be an array";
    const callsigns = simulation.state.flights
      .filter((flight) => controlled.includes(flight.id))
      .map((flight) => flight.callsign);
    if (callsigns.length)
      setStatus(
        `${command.instruction.toUpperCase()} command`,
        callsigns.join(" · "),
      );
  }
  if (command.action === "previewGroupInstruction") {
    if (!Array.isArray(command.flightIds)) {
      accepted = false;
      reason = "flightIds must be an array";
    } else {
      data = simulation.previewGroupedInstruction(
        command.flightIds,
        command.instruction,
      );
      accepted = data.safeToIssue;
      reason = data.reason;
    }
  }
  if (command.action === "issueGroupInstruction") {
    if (!Array.isArray(command.flightIds)) {
      accepted = false;
      reason = "flightIds must be an array";
    } else {
      const groupResult = simulation.issueGroupedInstruction(
        command.flightIds,
        command.instruction,
      );
      data = groupResult;
      accepted = groupResult.issued;
      reason = groupResult.reason;
      if (groupResult.issued)
        setStatus(
          `${command.instruction.toUpperCase()} group command`,
          groupResult.callsigns.join(" · "),
        );
    }
  }
  if (command.action === "assignHeading") {
    accepted =
      Number.isFinite(command.headingDegrees) &&
      simulation.assignHeading(command.flightId, command.headingDegrees);
    reason = Number.isFinite(command.headingDegrees)
      ? simulation.lastCommandReason()
      : "heading must be a finite aviation heading in degrees";
  }
  if (command.action === "assignAltitude") {
    accepted =
      Number.isFinite(command.altitudeFt) &&
      simulation.assignAltitude(command.flightId, command.altitudeFt);
    reason = Number.isFinite(command.altitudeFt)
      ? simulation.lastCommandReason()
      : "altitude must be a finite number of feet";
  }
  if (command.action === "assignAirspeed") {
    accepted =
      Number.isFinite(command.speedKts) &&
      simulation.assignAirspeed(command.flightId, command.speedKts);
    reason = Number.isFinite(command.speedKts)
      ? simulation.lastCommandReason()
      : "airspeed must be a finite number of knots";
  }
  if (command.action === "directTo") {
    accepted =
      typeof command.fixId === "string" &&
      command.fixId.length > 0 &&
      simulation.directFlightTo(command.flightId, command.fixId);
    reason =
      typeof command.fixId === "string" && command.fixId.length > 0
        ? simulation.lastCommandReason()
        : "direct-to requires a fix ID";
  }
  if (command.action === "amendRoute") {
    accepted =
      Array.isArray(command.fixIds) &&
      command.fixIds.every((fixId) => typeof fixId === "string") &&
      simulation.amendFlightRoute(command.flightId, command.fixIds);
    reason =
      Array.isArray(command.fixIds) &&
      command.fixIds.every((fixId) => typeof fixId === "string")
        ? simulation.lastCommandReason()
        : "route amendment requires an array of fix IDs";
  }
  if (command.action === "previewRoute") {
    const valid =
      Array.isArray(command.fixIds) &&
      command.fixIds.every((fixId) => typeof fixId === "string");
    accepted =
      valid && simulation.previewFlightRoute(command.flightId, command.fixIds);
    reason = valid
      ? simulation.lastCommandReason()
      : "route preview requires an array of fix IDs";
  }
  if (command.action === "issueRouteAmendment") {
    const valid =
      command.fixIds === undefined ||
      (Array.isArray(command.fixIds) &&
        command.fixIds.every((fixId) => typeof fixId === "string"));
    accepted =
      valid && simulation.issueFlightRoute(command.flightId, command.fixIds);
    reason = valid
      ? simulation.lastCommandReason()
      : "route issue requires an optional array of fix IDs";
  }
  if (
    command.action === "previewCompoundClearance" ||
    command.action === "issueCompoundClearance"
  ) {
    const validRoute =
      Array.isArray(command.fixIds) &&
      command.fixIds.length > 0 &&
      command.fixIds.every((fixId) => typeof fixId === "string");
    const validAltitude =
      command.altitudeFt === undefined || Number.isFinite(command.altitudeFt);
    const validSpeed =
      command.speedKts === undefined || Number.isFinite(command.speedKts);
    const hasSupplement =
      command.altitudeFt !== undefined || command.speedKts !== undefined;
    if (!validRoute || !validAltitude || !validSpeed || !hasSupplement) {
      accepted = false;
      reason = !hasSupplement
        ? "compound clearance requires altitude or speed in addition to the route"
        : "compound clearance requires valid fix IDs and finite altitude/speed values";
    } else if (command.action === "previewCompoundClearance") {
      const preview = simulation.previewCompoundFlightRoute(
        command.flightId,
        command.fixIds,
        command.altitudeFt,
        command.speedKts,
      );
      data = preview ?? undefined;
      accepted = Boolean(preview?.safeToIssue);
      reason = simulation.lastCommandReason();
    } else {
      accepted = simulation.issueCompoundFlightRoute(
        command.flightId,
        command.fixIds,
        command.altitudeFt,
        command.speedKts,
      );
      reason = simulation.lastCommandReason();
    }
  }
  if (command.action === "acceptRouteReadback") {
    accepted = simulation.acceptRouteReadback(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "cancelRouteAmendment") {
    accepted = simulation.cancelFlightRouteClearance(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "clearApproach") {
    accepted = simulation.clearApproach(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "holdFlight") {
    const validEfc =
      command.efcMinutes === undefined || Number.isFinite(command.efcMinutes);
    accepted =
      validEfc &&
      simulation.holdFlight(
        command.flightId,
        command.patternId,
        command.efcMinutes,
      );
    reason = validEfc
      ? simulation.lastCommandReason()
      : "EFC must be a finite number of minutes";
  }
  if (command.action === "releaseHold") {
    accepted = simulation.releaseAirborneHold(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "handoffFlight") {
    accepted =
      isControllerStation(command.station) &&
      simulation.handoffFlight(command.flightId, command.station);
    reason = isControllerStation(command.station)
      ? simulation.lastCommandReason()
      : "unknown controller station";
  }
  if (command.action === "offerHandoff") {
    accepted =
      isControllerStation(command.station) &&
      simulation.offerHandoff(command.flightId, command.station);
    reason = isControllerStation(command.station)
      ? simulation.lastCommandReason()
      : "unknown controller station";
  }
  if (command.action === "acceptHandoff") {
    accepted = simulation.acceptHandoff(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "rejectHandoff") {
    accepted = simulation.rejectHandoff(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "cancelHandoff") {
    accepted = simulation.cancelHandoff(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "contactStation") {
    accepted =
      isControllerStation(command.station) &&
      simulation.contactFlight(command.flightId, command.station);
    reason = isControllerStation(command.station)
      ? simulation.lastCommandReason()
      : "unknown controller station";
  }
  if (command.action === "assignTaxiRoute") {
    const viaNodeIds = command.viaNodeIds ?? [];
    accepted =
      Array.isArray(viaNodeIds) &&
      viaNodeIds.every((nodeId) => typeof nodeId === "string") &&
      simulation.assignTaxiRoute(command.flightId, viaNodeIds);
    reason =
      Array.isArray(viaNodeIds) &&
      viaNodeIds.every((nodeId) => typeof nodeId === "string")
        ? simulation.lastCommandReason()
        : "taxi route requires an array of surface via-node IDs";
  }
  if (command.action === "holdPosition") {
    accepted = simulation.holdPosition(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "resumeTaxi") {
    accepted = simulation.resumeTaxi(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "divertFlight") {
    const valid =
      typeof command.airportCode === "string" &&
      (command.exitFixId === undefined ||
        typeof command.exitFixId === "string") &&
      (command.reason === undefined || typeof command.reason === "string");
    accepted =
      valid &&
      simulation.divertFlight(
        command.flightId,
        command.airportCode,
        command.exitFixId,
        command.reason,
      );
    reason = valid
      ? simulation.lastCommandReason()
      : "diversion requires an alternate airport code plus optional string exit-fix and reason values";
  }
  if (command.action === "focusFlight") {
    accepted =
      command.flightId === null ||
      simulation.state.flights.some((flight) => flight.id === command.flightId);
    if (!accepted) reason = "flight is not active";
    if (accepted) {
      if (command.flightId === null) {
        clearFlightFocus();
        reason = "observer camera released";
      } else {
        const result = focusObserverTarget({
          kind: "flight",
          id: String(command.flightId),
        });
        accepted = result.accepted;
        reason = result.reason;
      }
    }
  }
  if (command.action === "focusTarget") {
    const target = command.target;
    const valid =
      target === null ||
      (typeof target === "object" &&
        target !== null &&
        typeof target.kind === "string" &&
        isFocusTargetKind(target.kind) &&
        typeof target.id === "string" &&
        target.id.length > 0);
    if (!valid) {
      accepted = false;
      reason =
        "focus target requires { kind, id } using flight, runway, taxiway, gate, queue, or conflict";
    } else if (target === null) {
      clearFlightFocus();
      reason = "observer camera released";
    } else {
      const result = focusObserverTarget(target);
      accepted = result.accepted;
      reason = result.reason;
    }
  }
  if (command.action === "setScenario") {
    const valid = [
      "normal",
      "rush",
      "storm",
      "closure",
      "training",
      "emergency",
    ].includes(command.scenario);
    accepted = valid && setScenario(command.scenario);
    reason = valid ? simulation.lastCommandReason() : "unknown scenario";
  }
  if (command.action === "setTrafficDensity") {
    const valid = isTrafficDensity(command.density);
    accepted = valid && setTrafficDensity(command.density);
    reason = valid
      ? simulation.lastCommandReason()
      : "traffic density must be quiet, realistic, busy, rush, or extreme";
  }
  if (command.action === "setTrafficFlowObjective") {
    const valid = isTrafficFlowObjective(command.objective);
    accepted = valid && setTrafficFlowObjective(command.objective);
    reason = valid
      ? simulation.lastCommandReason()
      : "unknown traffic-flow objective";
  }
  if (command.action === "setTrafficFlowForecastHorizon") {
    const valid = isTrafficFlowForecastHorizon(command.seconds);
    accepted = valid && setTrafficFlowForecastHorizon(command.seconds);
    reason = valid
      ? simulation.lastCommandReason()
      : "traffic-flow forecast horizon must be 300, 600, or 900 seconds";
  }
  if (command.action === "resequenceTrafficFlow") {
    const validDirection =
      command.direction === "arrival" || command.direction === "departure";
    const validMove = command.move === "earlier" || command.move === "later";
    accepted =
      validDirection &&
      validMove &&
      simulation.resequenceTrafficFlow(
        command.direction,
        command.entryId,
        command.move,
        command.expectedAdjacentEntryId,
      );
    reason =
      validDirection && validMove
        ? simulation.lastCommandReason()
        : "traffic resequence requires arrival/departure and earlier/later";
  }
  if (command.action === "ignoreTrafficFlowAdvisory") {
    accepted = simulation.ignoreTrafficFlowAdvisory(command.recommendationId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "recoverTrafficFlowAdvisory") {
    accepted = simulation.recoverTrafficFlowAdvisory(command.recommendationId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "setSeparationRuleset") {
    const valid =
      command.ruleset === "forgiving" || command.ruleset === "realistic";
    accepted = valid && setSeparationRules(command.ruleset);
    reason = valid
      ? simulation.lastCommandReason()
      : "separation ruleset must be forgiving or realistic";
  }
  if (command.action === "setStation") {
    accepted = isControllerStation(command.station);
    if (accepted) setStation(command.station);
    else reason = "unknown controller station";
  }
  if (command.action === "setStationAutomation") {
    accepted =
      OPERATIONAL_CONTROLLER_STATIONS.includes(command.station) &&
      simulation.setStationAutomation(command.station, command.enabled);
    reason = OPERATIONAL_CONTROLLER_STATIONS.includes(command.station)
      ? simulation.lastCommandReason()
      : "automation station must be approach, tower, ground, or ramp";
    updateStationAutomationUi();
  }
  if (command.action === "setControllerPolicyPreset") {
    accepted = simulation.setControllerPolicyPreset(command.preset);
    reason = simulation.lastCommandReason();
    updateStationAutomationUi();
  }
  if (command.action === "triggerEmergency") {
    accepted = simulation.triggerEmergency(command.flightId, command.type);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "setWeather") {
    const valid =
      isWeatherCondition(command.condition) &&
      Number.isFinite(command.directionDegrees) &&
      Number.isFinite(command.windSpeed);
    accepted =
      valid &&
      simulation.setWeather(
        command.condition,
        aviationDegreesToMathAngle(command.directionDegrees),
        command.windSpeed,
      );
    if (accepted) {
      weatherSelection = command.condition;
    }
    reason = valid
      ? simulation.lastCommandReason()
      : "weather requires a valid condition, direction, and wind speed";
    updateWeatherUi();
  }
  if (command.action === "setWeatherEnabled") {
    accepted = simulation.setWeatherEnabled(command.enabled);
    reason = simulation.lastCommandReason();
    updateWeatherUi();
  }
  if (command.action === "setWeatherHazardsEnabled") {
    accepted = simulation.setWeatherHazardsEnabled(command.enabled);
    highStakesWeatherEnabled = simulation.state.weather.hazardsEnabled;
    highStakesWeatherControl.checked = highStakesWeatherEnabled;
    soundscape.setHighStakesWeatherEnabled(highStakesWeatherEnabled);
    reason = simulation.lastCommandReason();
    updateWeatherUi();
  }
  if (command.action === "setWindEnabled") {
    accepted = simulation.setWindEnabled(command.enabled);
    reason = simulation.lastCommandReason();
    updateWeatherUi();
  }
  if (command.action === "setRunwayConfiguration") {
    accepted = simulation.setRunwayConfiguration(command.configurationId);
    reason = simulation.lastCommandReason();
    updateWeatherUi();
  }
  if (command.action === "setSurfaceDisruption") {
    const valid =
      ["runway-closure", "taxiway-closure", "construction"].includes(
        command.kind,
      ) &&
      typeof command.targetId === "string" &&
      command.targetId.length > 0 &&
      (command.durationSeconds === undefined ||
        (Number.isFinite(command.durationSeconds) &&
          command.durationSeconds > 0));
    accepted =
      valid &&
      simulation.setSurfaceDisruption(
        command.kind,
        command.targetId,
        command.enabled,
        command.durationSeconds,
      );
    reason = valid
      ? simulation.lastCommandReason()
      : "surface restriction requires a valid kind, target, and positive duration";
    surfaceDisruptionUiKey = "";
    renderSurfaceDisruptionControls();
  }
  if (command.action === "triggerSurfaceIncident") {
    const valid =
      Boolean(surfaceIncidentDefinition(command.kind)) &&
      typeof command.targetId === "string" &&
      command.targetId.length > 0;
    accepted =
      valid &&
      simulation.triggerSurfaceIncident(command.kind, command.targetId);
    reason = valid
      ? simulation.lastCommandReason()
      : "incident requires a valid kind and surface target";
    surfaceDisruptionUiKey = "";
    renderSurfaceDisruptionControls();
  }
  if (command.action === "clearSurfaceDisruption") {
    accepted = simulation.clearSurfaceDisruption(command.disruptionId);
    reason = simulation.lastCommandReason();
    surfaceDisruptionUiKey = "";
    renderSurfaceDisruptionControls();
  }
  if (command.action === "recoverDisabledAircraft") {
    accepted = simulation.recoverDisabledAircraft(command.flightId);
    reason = simulation.lastCommandReason();
    surfaceDisruptionUiKey = "";
    renderSurfaceDisruptionControls();
  }
  if (command.action === "startTrainingLesson") {
    const validLesson = [
      "arrival-basics",
      "tower-landing",
      "surface-flow",
      "handoff-workflow",
    ].includes(command.lessonId);
    accepted = validLesson && beginTrainingLesson(command.lessonId);
    reason = validLesson
      ? simulation.lastCommandReason()
      : "unknown training lesson";
  }
  if (command.action === "stopTrainingLesson") {
    accepted = simulation.stopTrainingLesson();
    reason = simulation.lastCommandReason();
  }
  if (command.action === "continueTraining") {
    accepted = simulation.continueTraining();
    reason = simulation.lastCommandReason();
  }
  if (command.action === "trainingHint") {
    accepted = simulation.requestTrainingHint();
    reason = simulation.lastCommandReason();
  }
  if (command.action === "retryTrainingStep") {
    accepted = simulation.retryTrainingStep();
    reason = simulation.lastCommandReason();
    if (accepted) {
      simulationAccumulator = 0;
      previousPresentation = capturePresentation(simulation.state);
      world.snapToAuthoritativeState();
      controlSelect.value = simulation.state.mode;
      introControlSelect.value = simulation.state.mode;
      scenarioSelect.value = simulation.state.scenario;
      densitySelect.value = simulation.state.trafficFlow.density;
      introDensitySelect.value = simulation.state.trafficFlow.density;
      stationSelect.value = simulation.state.station;
      updateModeControl();
      updateStationAutomationUi();
      updateWeatherUi();
      renderFlightStrip();
      renderFlightActions();
    }
  }
  if (command.action === "skipTrainingStep") {
    accepted = simulation.skipTrainingStep();
    reason = simulation.lastCommandReason();
  }
  if (command.action === "startChallenge") {
    const validChallenge = [
      "rush-hour",
      "storm-operations",
      "runway-closure",
      "emergency-priority",
    ].includes(command.challengeId);
    accepted = validChallenge && openChallengeBriefing(command.challengeId);
    reason = validChallenge
      ? simulation.lastCommandReason()
      : "unknown controller challenge";
  }
  if (command.action === "beginChallenge") {
    accepted = simulation.beginChallenge();
    reason = simulation.lastCommandReason();
  }
  if (command.action === "endChallenge") {
    accepted = simulation.endChallenge();
    reason = simulation.lastCommandReason();
  }
  if (command.action === "continueAfterChallenge") {
    accepted = simulation.continueAfterChallenge();
    reason = simulation.lastCommandReason();
  }
  if (command.action === "startSandbox") {
    accepted = openSandbox(command.backgroundTraffic ?? false);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "stopSandbox") {
    accepted = simulation.stopSandbox();
    reason = simulation.lastCommandReason();
  }
  if (command.action === "setSandboxBackgroundTraffic") {
    accepted = simulation.setSandboxBackgroundTraffic(command.enabled);
    reason = simulation.lastCommandReason();
  }
  if (command.action === "injectSandboxTraffic") {
    accepted = simulation.queueSandboxTraffic(
      command.direction,
      command.trafficClass ?? "auto",
      command.runwayId ?? null,
      command.count ?? 1,
    );
    reason = simulation.lastCommandReason();
  }
  if (command.action === "cancelSandboxInjections") {
    accepted = simulation.cancelSandboxInjections();
    reason = simulation.lastCommandReason();
  }
  if (command.action === "clearSandboxTraffic") {
    accepted = simulation.clearSandboxTraffic();
    reason = simulation.lastCommandReason();
    if (accepted) {
      simulationAccumulator = 0;
      previousPresentation = capturePresentation(simulation.state);
      world.snapToAuthoritativeState();
      clearFlightFocus();
    }
  }
  if (command.action === "restart") {
    if (simulation.challengeSnapshot().conditionsLocked) {
      accepted = false;
      reason = "end the active challenge before restarting the airport";
    } else {
      newSession(
        false,
        config.code === "LOCAL"
          ? generateAirportConfig()
          : generateHubConfig(hubIndex),
      );
    }
  }
  if (isTrainingOperationalAction(command.action)) {
    const commandWithFlight = "flightId" in command ? command : null;
    const commandWithStation = "station" in command ? command : null;
    simulation.observeTrainingCommand({
      action: command.action,
      accepted,
      reason,
      flightId:
        commandWithFlight && typeof commandWithFlight.flightId === "number"
          ? commandWithFlight.flightId
          : undefined,
      station: command.action === "setStation" ? command.station : undefined,
      targetStation:
        commandWithStation && typeof commandWithStation.station === "string"
          ? commandWithStation.station
          : undefined,
    });
  }
  renderTrainingCoach();
  renderChallengeExperience();
  renderSandboxExperience();
  updatePauseControl();
  return finalizeAirportRequest(
    candidate,
    command,
    validation,
    context,
    effectiveStation,
    originatingSimulation,
    eventCursor,
    accepted,
    reason,
    data,
  );
}

function dispatchAirportControl(envelope: unknown): AirportControlResult {
  const envelopeValidation = validateAirportControlEnvelope(envelope);
  const record =
    typeof envelope === "object" &&
    envelope !== null &&
    !Array.isArray(envelope)
      ? (envelope as Record<string, unknown>)
      : {};
  const validEnvelope = envelopeValidation.envelope;
  return executeAirportRequest(record.command, {
    requestId:
      validEnvelope?.requestId ??
      (typeof record.requestId === "string" ? record.requestId : undefined),
    clientId:
      validEnvelope?.clientId ??
      (typeof record.clientId === "string" ? record.clientId : undefined),
    source: validEnvelope?.source ?? "agent",
    protocolVersion:
      typeof record.protocolVersion === "string"
        ? record.protocolVersion
        : "0.0.0",
    expects: validEnvelope?.expects,
    authority: validEnvelope?.authority,
    envelopeIssues: envelopeValidation.issues,
    compatibility: envelopeValidation.compatibility,
  });
}

function currentSessionLaunchSave(): AirportSessionSave {
  const weather = simulation.state.weather;
  return createAirportSessionSave({
    airport: { code: config.code, seed: config.seed },
    operation: {
      mode: simulation.state.mode,
      speed: simulationSpeed,
      scenario: simulation.state.scenario,
      density: simulation.state.trafficFlow.density,
      station: simulation.state.station,
      separationRuleset: simulation.state.separationRuleset,
    },
    weather: {
      enabled: weather.weatherEnabled,
      windEnabled: weather.windEnabled,
      condition: weather.condition,
      directionDegrees: mathAngleToAviationDegrees(weather.windDirection),
      windSpeedKts: weather.windSpeed,
      hazardsEnabled: weather.hazardsEnabled,
    },
  });
}

window.airportControl = {
  version: CONTROL_API_VERSION,
  protocolVersion: CONTROL_PROTOCOL_VERSION,
  snapshot: airportSnapshot,
  events(limit = 100) {
    return telemetryEvents.slice(-Math.max(0, limit));
  },
  replay() {
    return replayPlaybackFrames().slice();
  },
  recording: replayRecording,
  replayTools: {
    verify(recording) {
      return verifyReplayRecording(recording ?? activeReplayRecording());
    },
    async verifyAsync(recording) {
      const source = recording ?? (await activeReplayRecordingAsync());
      return verifyReplayRecordingAsync(source);
    },
    load: loadReplayRecording,
    shareable(recording) {
      return createShareableReplayRecording(
        recording ?? activeReplayRecording(),
      );
    },
    async shareableAsync(recording) {
      const source = recording ?? (await activeReplayRecordingAsync());
      return createShareableReplayRecordingAsync(source);
    },
    compare: compareReplayFrames,
    seedLink: replaySeedLink,
  },
  analytics(flightId) {
    return operationsAnalyticsSnapshot(
      Number.isFinite(flightId) ? (flightId ?? null) : null,
    );
  },
  performance() {
    return runtimePerformance.snapshot();
  },
  sessionTools: {
    create: currentSessionLaunchSave,
    migrate: migrateAirportSessionSave,
    launchUrl(save = currentSessionLaunchSave()) {
      return buildSessionSaveLaunchUrl(window.location.href, save);
    },
  },
  migrations: {
    ...schemaMigrationTools,
    catalog: schemaMigrationCatalog,
  },
  exportData(format, dataset = "flights", flightId) {
    return serializeOperationsExport(
      format,
      isOperationsExportDataset(dataset) ? dataset : "flights",
      flightId,
    );
  },
  command: executeAirportCommand,
  request: executeAirportRequest,
  validate: validateAirportControlCommand,
  dispatch: dispatchAirportControl,
  protocol: getAirportControlProtocol,
  remote: {
    state: () => remoteControlHost.state(),
    connect: (configuration) => remoteControlHost.connect(configuration),
    disconnect: (reason) => remoteControlHost.disconnect(reason),
  },
  liveData: {
    snapshot: () => liveDataPanel.snapshot(),
    clearCache() {
      liveDataCoordinator.clearCache();
      liveDataPanel.setAirport(config.code);
      return liveDataPanel.snapshot();
    },
  },
  capture: {
    snapshot: () => ({
      ...localCapture.snapshot(),
      cleanView: capturePanel?.cleanView() ?? false,
    }),
    screenshot: () => localCapture.screenshot(captureFilenameBase()),
    startClip: (durationSeconds = 5) =>
      localCapture.startClip(durationSeconds, captureFilenameBase()),
    stopClip: () => localCapture.stopClip(),
    setCleanView: (enabled) => capturePanel?.setCleanView(enabled) ?? false,
  },
  community: {
    snapshot: () => communityPanel.snapshot(),
    loadDailyChallenge: () => communityPanel.loadDailyChallenge(),
    copyClassroomLink: () => communityPanel.copyClassroomLink(),
  },
  help() {
    return {
      snapshot: "airportControl.snapshot()",
      events: "airportControl.events(100)",
      protocol:
        "airportControl.protocol() // command/event JSON Schemas, authority, compatibility, examples",
      validate:
        "airportControl.validate({ action: 'pause' }) // structural validation without execution",
      formalDispatch:
        "airportControl.dispatch({ protocolVersion: '1.2.0', requestId: 'agent-1', source: 'agent', authority: { station: 'tower', actorId: 'tower-agent' }, expects: { apiVersion: '2.41.0', snapshotSchemaVersion: 44 }, command: { action: 'pause' } })",
      liveData:
        "airportControl.liveData.snapshot() // redacted opt-in/cache/review state; credentials and raw feeds are never exposed",
      capture:
        "airportControl.capture.setCleanView(true); airportControl.capture.screenshot(); airportControl.capture.startClip(5) // local-only canvas media",
      community:
        "airportControl.community.snapshot(); airportControl.community.loadDailyChallenge(); airportControl.community.copyClassroomLink() // deterministic daily/classroom board, no accounts or score upload",
      structuredCommand:
        "airportControl.request({ action: 'pause' }) // legacy-compatible bare command; result includes requestId, commandId, eventId, authority, and compatibility",
      pause: "airportControl.command({ action: 'pause' })",
      speed: "airportControl.command({ action: 'setSpeed', value: 2 })",
      airport:
        "airportControl.command({ action: 'selectAirport', code: 'ORD' })",
      mode: "airportControl.command({ action: 'setMode', value: 'auto' })",
      nightMode:
        "airportControl.command({ action: 'setNightMode', enabled: true })",
      environmentLighting:
        "airportControl.request({ action: 'setEnvironmentLightingMode', mode: 'automatic' }) // automatic | day | night",
      environmentSeason:
        "airportControl.request({ action: 'setEnvironmentSeasonMode', mode: 'winter' }) // automatic | spring | summer | autumn | winter",
      accessibilityPalette:
        "airportControl.request({ action: 'setAccessibilityPalette', palette: 'cvd-safe' })",
      cameraDirector:
        "airportControl.request({ action: 'setCameraDirectorEnabled', enabled: true }) // yields immediately to manual camera input",
      radar:
        "airportControl.command({ action: 'setRadarVisible', enabled: true })",
      queues:
        "airportControl.request({ action: 'setQueueInspectorVisible', enabled: true })",
      observerFocus:
        "airportControl.request({ action: 'focusTarget', target: { kind: 'taxiway', id: 'A' } }) // flight | runway | taxiway | gate | queue | conflict; null releases",
      focusCatalog: "airportControl.snapshot().focus.catalog.targets",
      rotate:
        "airportControl.command({ action: 'rotateLeft' }) // rotateRight reverses",
      mapLayer:
        "airportControl.command({ action: 'setSurfaceLayerVisible', layer: 'hotspots', enabled: true })",
      airspaceLayer:
        "airportControl.command({ action: 'setAirspaceLayerVisible', layer: 'procedures', enabled: true })",
      mapOrientation:
        "airportControl.command({ action: 'setMapOrientationVisible', enabled: true })",
      windOverlay:
        "airportControl.command({ action: 'setWindOverlayVisible', enabled: true })",
      serviceVehicles:
        "airportControl.command({ action: 'setServiceVehiclesVisible', enabled: false })",
      airportLife:
        "airportControl.command({ action: 'setAirportLifeVisible', enabled: true })",
      gamepad:
        "airportControl.request({ action: 'setGamepadEnabled', enabled: true })",
      gamepadSensitivity:
        "airportControl.request({ action: 'setGamepadSensitivity', sensitivity: 1.2 }) // 0.5–2.0",
      clearance:
        "airportControl.command({ action: 'clearFlight', flightId: 1, runway: 0 })",
      pushback:
        "airportControl.request({ action: 'clearPushback', flightId: 1 }) // Ramp or Supervisor",
      runwayEntry:
        "airportControl.command({ action: 'clearRunwayEntry', flightId: 1 })",
      takeoff:
        "airportControl.request({ action: 'clearTakeoff', flightId: 1 })",
      runwayCrossing:
        "airportControl.command({ action: 'clearRunwayCrossing', flightId: 1, runway: 4 })",
      controlOne:
        "airportControl.command({ action: 'controlFlights', flightIds: [1], instruction: 'slow' })",
      groupPreview:
        "airportControl.request({ action: 'previewGroupInstruction', flightIds: [1, 2], instruction: 'slow' }) // non-mutating compatibility check",
      groupIssue:
        "airportControl.request({ action: 'issueGroupInstruction', flightIds: [1, 2], instruction: 'slow' }) // atomic: all accepted or none",
      controlMany:
        "airportControl.request({ action: 'controlFlights', flightIds: [1, 2, 3], instruction: 'hold' }) // legacy atomic alias",
      heading:
        "airportControl.request({ action: 'assignHeading', flightId: 1, headingDegrees: 270 })",
      altitude:
        "airportControl.request({ action: 'assignAltitude', flightId: 1, altitudeFt: 3000 })",
      airspeed:
        "airportControl.request({ action: 'assignAirspeed', flightId: 1, speedKts: 170 })",
      directTo:
        "airportControl.request({ action: 'directTo', flightId: 1, fixId: 'ORD-W-ENTRY' })",
      routeAmendment:
        "airportControl.request({ action: 'amendRoute', flightId: 1, fixIds: ['ORD-R0-A-GW1', 'ORD-R0-A-DW', 'ORD-R0-A-BASE', 'ORD-R0-A-INT', 'ORD-R0-A-FAF'] }) // inspect snapshot().airport.airspaceProgram.fixes",
      routePreview:
        "airportControl.request({ action: 'previewRoute', flightId: 1, fixIds: ['ORD-R0-A-GW1', 'ORD-R0-A-DW', 'ORD-R0-A-BASE', 'ORD-R0-A-INT', 'ORD-R0-A-FAF'] })",
      routeIssue:
        "airportControl.request({ action: 'issueRouteAmendment', flightId: 1 }) // staged pilot readback",
      routeReadback:
        "airportControl.request({ action: 'acceptRouteReadback', flightId: 1 }) // optional; otherwise deterministic automatic readback",
      routeCancel:
        "airportControl.request({ action: 'cancelRouteAmendment', flightId: 1 })",
      approach:
        "airportControl.request({ action: 'clearApproach', flightId: 1 })",
      airborneHold:
        "airportControl.request({ action: 'holdFlight', flightId: 1, efcMinutes: 4 })",
      releaseHold:
        "airportControl.request({ action: 'releaseHold', flightId: 1 })",
      handoffOffer:
        "airportControl.request({ action: 'offerHandoff', flightId: 1, station: 'tower' }) // handoffFlight is a legacy offer alias",
      handoffAccept:
        "airportControl.request({ action: 'acceptHandoff', flightId: 1 }) // receiving station",
      handoffReject:
        "airportControl.request({ action: 'rejectHandoff', flightId: 1 }) // receiving station",
      handoffCancel:
        "airportControl.request({ action: 'cancelHandoff', flightId: 1 }) // sending station",
      contact:
        "airportControl.request({ action: 'contactStation', flightId: 1, station: 'tower' }) // sending station after acceptance",
      taxiRoute:
        "airportControl.request({ action: 'assignTaxiRoute', flightId: 3, viaNodeIds: ['OSM-N26630147'] }) // inspect snapshot().surfaceGraph.nodes",
      surfaceHold:
        "airportControl.request({ action: 'holdPosition', flightId: 3 })",
      resumeTaxi:
        "airportControl.request({ action: 'resumeTaxi', flightId: 3 })",
      divert:
        "airportControl.request({ action: 'divertFlight', flightId: 1, airportCode: 'KIND', reason: 'weather alternate' })",
      focus: "airportControl.command({ action: 'focusFlight', flightId: 1 })",
      scenario:
        "airportControl.command({ action: 'setScenario', scenario: 'rush' })",
      trafficDensity:
        "airportControl.command({ action: 'setTrafficDensity', density: 'busy' })",
      trafficResequence:
        "airportControl.request({ action: 'resequenceTrafficFlow', direction: 'departure', entryId: airportControl.snapshot().trafficManagement.departureQueue[1].id, move: 'earlier' }) // adjacent move; Approach owns arrivals, Tower owns departures, Supervisor owns both",
      separationRules:
        "airportControl.command({ action: 'setSeparationRuleset', ruleset: 'realistic' })",
      station:
        "airportControl.command({ action: 'setStation', station: 'ground' })",
      stationAutomation:
        "airportControl.request({ action: 'setStationAutomation', station: 'tower', enabled: true }) // Supervisor",
      controllerPolicy:
        "airportControl.request({ action: 'setControllerPolicyPreset', preset: 'calm' }) // Supervisor; balanced | conservative | efficient | calm | teaching | realistic",
      controllerEvaluation:
        "airportControl.snapshot().controllers.evaluation // read-only safety, flow, fuel, hold, command-quality, station, and actor metrics",
      trainingCatalog: "airportControl.snapshot().training.availableLessons",
      trainingStart:
        "airportControl.request({ action: 'startTrainingLesson', lessonId: 'arrival-basics' }) // opens an exact no-fail checkpoint",
      trainingHint: "airportControl.request({ action: 'trainingHint' })",
      trainingRetry:
        "airportControl.request({ action: 'retryTrainingStep' }) // restores simulation and render authority",
      trainingContinue:
        "airportControl.request({ action: 'continueTraining' })",
      trainingSkip:
        "airportControl.request({ action: 'skipTrainingStep' }) // no score or safety penalty",
      trainingEnd: "airportControl.request({ action: 'stopTrainingLesson' })",
      challengeCatalog:
        "airportControl.snapshot().challenge.availableChallenges",
      challengeStart:
        "airportControl.request({ action: 'startChallenge', challengeId: 'rush-hour' }) // opens a paused briefing with locked conditions",
      challengeBegin: "airportControl.request({ action: 'beginChallenge' })",
      challengeEnd:
        "airportControl.request({ action: 'endChallenge' }) // closes early and opens the debrief",
      challengeContinue:
        "airportControl.request({ action: 'continueAfterChallenge' })",
      sandboxStart:
        "airportControl.request({ action: 'startSandbox', backgroundTraffic: false }) // clear board, no score, no fail",
      sandboxInject:
        "airportControl.request({ action: 'injectSandboxTraffic', direction: 'arrival', trafficClass: 'passenger', runwayId: null, count: 4 })",
      sandboxBackground:
        "airportControl.request({ action: 'setSandboxBackgroundTraffic', enabled: true })",
      sandboxCancel:
        "airportControl.request({ action: 'cancelSandboxInjections' })",
      sandboxClear:
        "airportControl.request({ action: 'clearSandboxTraffic' }) // preserves weather and runway configuration",
      sandboxStop: "airportControl.request({ action: 'stopSandbox' })",
      emergency:
        "airportControl.command({ action: 'triggerEmergency', flightId: 1, type: 'medical' })",
      aircraft: "airportControl.snapshot().flights[0].aircraft",
      surfaceGraph: "airportControl.snapshot().surfaceGraph",
      replay: "airportControl.replay()",
      recording:
        "airportControl.recording() // replay schema 4 + exact state fingerprints + markers",
      replayVerify:
        "airportControl.replayTools.verify() // exact canonical frame/manifest receipt",
      replayVerifyAsync:
        "await airportControl.replayTools.verifyAsync() // cooperative long-recording verification",
      replayLoad:
        "airportControl.replayTools.load(recording) // read-only verified playback; schema 3 migrates in memory",
      replayCompare:
        "airportControl.replayTools.compare(10, 40) // bounded authoritative state diff",
      replaySeedLink:
        "airportControl.replayTools.seedLink() // safe deterministic launch URL; no identity or replay data",
      replayShareable:
        "await airportControl.replayTools.shareableAsync() // removes identity, correlations, payloads, and free text, then fingerprints again",
      analytics:
        "airportControl.analytics() // local flight recorder, utilization, queues, metrics, and conflict heatmap",
      performance:
        "airportControl.performance() // bounded frame, simulation, memory, entity, audio, queue, and renderer budgets",
      sessionSave:
        "airportControl.sessionTools.create() // portable versioned launch settings; no identity or live-feed data",
      sessionLaunch:
        "airportControl.sessionTools.launchUrl(save) // deterministic launch URL generated from a validated save",
      migrations:
        "airportControl.migrations.catalog() // current and accepted legacy schemas; future versions fail closed",
      analyticsFlight:
        "airportControl.analytics(1) // select one observed flight recorder trace",
      exportJson:
        "airportControl.exportData('json') // complete local operations bundle; no upload",
      exportCsv:
        "airportControl.exportData('csv', 'runways') // flights, commands, events, queues, delays, runways, taxiways, shift-metrics, flight-recorder, or conflicts",
      zigzag:
        "airportControl.command({ action: 'controlFlights', flightIds: [1], instruction: 'zigzag' })",
      weather:
        "airportControl.command({ action: 'setWeather', condition: 'rain', directionDegrees: 270, windSpeed: 18 })",
      weatherToggle:
        "airportControl.command({ action: 'setWeatherEnabled', enabled: false })",
      weatherHazards:
        "airportControl.command({ action: 'setWeatherHazardsEnabled', enabled: true }) // opt-in deterministic wind-shear/microburst events",
      windToggle:
        "airportControl.command({ action: 'setWindEnabled', enabled: false })",
      runwayConfiguration:
        "airportControl.request({ action: 'setRunwayConfiguration', configurationId: 'ORD-EAST-IFR' }) // supervisor only; null restores automatic",
      closeTaxiway:
        "airportControl.request({ action: 'setSurfaceDisruption', kind: 'taxiway-closure', targetId: 'A', enabled: true, durationSeconds: 180 }) // supervisor",
      construction:
        "airportControl.request({ action: 'setSurfaceDisruption', kind: 'construction', targetId: 'edge-id', enabled: true }) // supervisor",
      reopenSurface:
        "airportControl.request({ action: 'clearSurfaceDisruption', disruptionId: 'SD-1' }) // supervisor",
      recoverAircraft:
        "airportControl.request({ action: 'recoverDisabledAircraft', flightId: 3 }) // ground or supervisor",
      broadcast:
        "new BroadcastChannel('airport-auto') // send { type: 'request', envelope: { protocolVersion: '1.2.0', requestId, source: 'agent', command } }; legacy { type: 'command', requestId, command } remains supported",
      remoteState:
        "airportControl.remote.state() // disconnected by default; never contains a credential",
      remoteConnect:
        "await airportControl.remote.connect({ endpoint: 'wss://control.example/v1/ws', sessionId: 'airport-auto', token: '<operator-provided host token>' }) // explicit opt-in only",
      remoteDisconnect:
        "airportControl.remote.disconnect() // removes the in-memory credential and disables reconnect",
    };
  },
};

airportChannel?.addEventListener("message", (event: MessageEvent) => {
  const message = event.data as Record<string, unknown> | null;
  if (!message || (message.type !== "request" && message.type !== "command"))
    return;
  const fallbackRequestId =
    typeof message.requestId === "string"
      ? message.requestId
      : generatedControlId("request");
  const migration = migrateBroadcastControlRequest(message, fallbackRequestId);
  const fallbackEnvelope =
    message.type === "request"
      ? message.envelope
      : {
          protocolVersion: CONTROL_PROTOCOL_VERSION,
          requestId: fallbackRequestId,
          clientId:
            typeof message.clientId === "string" ? message.clientId : undefined,
          source: "broadcast",
          command: message.command,
        };
  const result = dispatchAirportControl(
    migration.request?.envelope ?? fallbackEnvelope,
  );
  airportChannel.postMessage({
    type: "response",
    requestId: result.requestId,
    result,
  });
});
const readySnapshot = airportSnapshot();
airportChannel?.postMessage({
  type: "ready",
  version: CONTROL_API_VERSION,
  protocolVersion: CONTROL_PROTOCOL_VERSION,
  apiVersion: CONTROL_API_VERSION,
  sessionId: controlSessionId,
  snapshot: readySnapshot,
});

function flightTrajectorySnapshot(flight: Flight) {
  const trajectory = flight.motion;
  return {
    stage: trajectory.stage ?? flight.phase,
    stageProgress: Number(trajectory.stageProgress.toFixed(3)),
    position: {
      x: Number(trajectory.x.toFixed(3)),
      y: Number(trajectory.y.toFixed(3)),
      z: Number(trajectory.z.toFixed(3)),
    },
    headingDegrees: Number(((trajectory.heading * 180) / Math.PI).toFixed(2)),
    pitchDegrees: Number(((trajectory.pitch * 180) / Math.PI).toFixed(2)),
    bankDegrees: Number(((trajectory.bank * 180) / Math.PI).toFixed(2)),
    onGround: trajectory.onGround,
    protectedRunway: trajectory.protectedRunway,
    protectedRunwayIds: [...trajectory.protectedRunwayIds],
    distanceAlongMeters: Number(trajectory.distanceAlongM.toFixed(2)),
    totalDistanceMeters: Number(trajectory.totalDistanceM.toFixed(2)),
  };
}

function cloneFlightRouteClearance(
  clearance: FlightRouteClearanceState,
): FlightRouteClearanceState {
  return {
    ...clearance,
    routeFixIds: [...clearance.routeFixIds],
    routeFixNames: [...clearance.routeFixNames],
    previousRouteFixIds: [...clearance.previousRouteFixIds],
    warnings: clearance.warnings.map((warning) => ({ ...warning })),
    supplements: clearance.supplements?.map((supplement) => ({
      ...supplement,
    })),
    safeguards: clearance.safeguards ? [...clearance.safeguards] : undefined,
  };
}

function runwayDesignation(runwayId: number): string {
  return (
    config.runways[runwayId]?.designation?.join("/") ?? String(runwayId + 1)
  );
}

function activeRunwayDesignation(runwayId: number): string {
  return resolveActiveRunwayDesignation(
    config,
    simulation.state.activeRunwayEnds,
    runwayId,
  );
}

function aviationDegreesToMathAngle(degrees: number): number {
  return ((90 - degrees) * Math.PI) / 180;
}

function mathAngleToAviationDegrees(angle: number): number {
  return (90 - (angle * 180) / Math.PI + 360) % 360;
}

function cardinalDirection(headingDegrees: number): string {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[
    Math.round((((headingDegrees % 360) + 360) % 360) / 45) % points.length
  ];
}

if (telemetryEnabled) telemetryPanel.hidden = false;
const launchAirport =
  requestedDailyPlan?.airportCode ??
  launchOptions.get("airport") ??
  (soakEnabled ? "ORD" : null);
const launchSeedValue = Number(launchOptions.get("seed"));
const launchSeed =
  requestedDailyPlan?.seed ??
  (launchOptions.has("seed") &&
  Number.isSafeInteger(launchSeedValue) &&
  launchSeedValue >= 0
    ? launchSeedValue
    : undefined);
if (launchAirport) selectAirport(launchAirport.toUpperCase(), true, launchSeed);
else if (launchSeed !== undefined) selectAirport("LOCAL", true, launchSeed);
const launchSpeed = Number(launchOptions.get("speed"));
if (Number.isFinite(launchSpeed) && launchOptions.has("speed"))
  setSimulationSpeed(launchSpeed);
else if (soakEnabled) setSimulationSpeed(3);
const launchMode = requestedDailyPlan?.mode ?? launchOptions.get("mode");
if (
  launchMode === "auto" ||
  launchMode === "assisted" ||
  launchMode === "manual" ||
  launchMode === "watch"
)
  selectControl(launchMode);
else if (soakEnabled) selectControl("auto");
if (launchOptions.get("night") === "1") {
  simulation.setNightMode(true);
  updateNightControl();
}
if (launchOptions.get("radar") === "1") {
  radarVisible = true;
  updateRadarControl();
}
if (launchOptions.get("surface-safety") === "1") {
  surfaceSafetyVisible = true;
  updateSurfaceSafetyPanelControl();
  renderSurfaceSafety();
}
if (launchOptions.get("queues") === "1") {
  queueInspectorVisible = true;
  updateQueueInspectorControl();
  renderQueueInspector();
}
if (launchOptions.get("airport-life") === "1") setAirportLifeVisible(true);
const launchScenario = (launchOptions.get("scenario") ??
  (soakEnabled ? "rush" : null)) as TrafficScenario | null;
if (
  launchScenario &&
  ["normal", "rush", "storm", "closure", "training", "emergency"].includes(
    launchScenario,
  )
)
  setScenario(launchScenario);
const launchDensity = launchOptions.get("density");
if (launchDensity && isTrafficDensity(launchDensity)) {
  simulation.setTrafficDensity(launchDensity);
  newSession(true, config);
}
const launchRuleset =
  requestedDailyPlan?.separationRuleset ?? launchOptions.get("rules");
if (launchRuleset === "forgiving" || launchRuleset === "realistic")
  setSeparationRules(launchRuleset);
if (launchOptions.get("sandbox") === "1") {
  openSandbox(launchOptions.get("background") === "1");
  sandboxSetup.open = true;
}
const launchStation = (requestedDailyPlan?.station ??
  launchOptions.get("station")) as ControllerStation | null;
if (launchStation && isControllerStation(launchStation))
  setStation(launchStation);
const launchWeatherValue = launchOptions.get("weather");
const launchWeather = launchWeatherValue as WeatherCondition | null;
const launchWindDirection = Number(launchOptions.get("windDir") ?? 270);
const launchWindValue = launchOptions.get("wind");
const launchWindSpeed = Number(launchWindValue ?? 12);
if (
  isWeatherCondition(launchWeather) &&
  Number.isFinite(launchWindDirection) &&
  Number.isFinite(launchWindSpeed)
) {
  weatherSelection = launchWeather;
  simulation.setWeather(
    launchWeather,
    aviationDegreesToMathAngle(launchWindDirection),
    launchWindSpeed,
  );
}
if (launchWeatherValue === "off") simulation.setWeatherEnabled(false);
if (launchWindValue === "off") simulation.setWindEnabled(false);
if (launchOptions.get("hazards") === "1") {
  highStakesWeatherEnabled = simulation.setWeatherHazardsEnabled(true);
  highStakesWeatherControl.checked = highStakesWeatherEnabled;
  soundscape.setHighStakesWeatherEnabled(highStakesWeatherEnabled);
}
const launchRunwayConfiguration = launchOptions.get("runwayConfig");
if (launchRunwayConfiguration) {
  simulation.setRunwayConfiguration(
    launchRunwayConfiguration === "auto" ? null : launchRunwayConfiguration,
  );
  updateWeatherUi();
}
const launchLesson = launchOptions.get("lesson") as TrainingLessonId | null;
if (
  launchLesson &&
  [
    "arrival-basics",
    "tower-landing",
    "surface-flow",
    "handoff-workflow",
  ].includes(launchLesson)
) {
  trainingLessonSelect.value = launchLesson;
  beginTrainingLesson(launchLesson);
}
const launchChallenge = (requestedDailyPlan?.challengeId ??
  launchOptions.get("challenge")) as ChallengeId | null;
if (
  launchChallenge &&
  [
    "rush-hour",
    "storm-operations",
    "runway-closure",
    "emergency-priority",
  ].includes(launchChallenge)
) {
  challengeSelect.value = launchChallenge;
  openChallengeBriefing(launchChallenge);
  if (requestedDailyPlan) challengeSetup.open = true;
}
if (launchOptions.get("autostart") === "1" || soakEnabled) {
  startShift();
  if (simulation.state.challenge.status === "briefing")
    executeAirportRequest({ action: "beginChallenge" });
}

requestAnimationFrame(frame);
window.addEventListener("beforeunload", () => {
  airportChannel?.close();
  remoteControlHost.dispose();
  inputLayer.dispose();
  liveDataPanel.dispose();
  capturePanel?.dispose();
  localCapture.dispose();
  communityPanel.dispose();
  world.dispose();
});

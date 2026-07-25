import './styles.css';
import { AirportSimulation } from './simulation/airportSimulation';
import { generateAirportConfig, generateHubConfig, HUB_AIRPORTS } from './simulation/airportConfig';
import { aircraftProfile } from './simulation/aircraftProfiles';
import { airlineProfile } from './simulation/airlineProfiles';
import { sampleAircraftSurfaceMotion, surfaceStoppingDistanceM } from './simulation/surfaceMotion';
import { surfaceRampControlZones, surfaceStandFlow } from './simulation/surfaceOperations';
import { GATE_TURN_BUFFER_SECONDS } from './simulation/gateAssignment';
import { cloneFlightPlan } from './simulation/flightPlanning';
import { isTrafficDensity, trafficDensityProfile, type TrafficDensity } from './simulation/trafficDensity';
import { cloneTrafficFlowState } from './simulation/trafficFlowManagement';
import { separationRuleset, type SeparationRulesetId } from './simulation/separationRules';
import {
  controllerStationLabel,
  isControllerStation,
  OPERATIONAL_CONTROLLER_STATIONS,
  requiredControllerStation,
} from './simulation/controllerOperations';
import type { ClearanceProposal, ControlMode, ControllerStation, EmergencyType, Flight, FlightInstruction, FlightPhase, OperationalControllerStation, ReplayFrame, SurfaceDisruptionKind, TrafficScenario, TurnaroundServiceType, WeatherCondition } from './simulation/types';
import { AmbientAudio, type AudioChannel, type AudioPreset } from './audio/ambientAudio';
import { createWorld, type AirspaceLayer, type SurfaceLayer } from './render/createWorld';
import { drawRadarInset } from './render/radarInset';
import {
  isOperationQueueFilter,
  operationQueueRenderKey,
  renderOperationQueueInspector,
  type OperationQueueFilter,
} from './ui/queueInspector';
import {
  renderSurfaceDisruptionPanel,
  surfaceDisruptionPanelKey,
  updateSurfaceDisruptionTargetOptions,
} from './ui/surfaceDisruptionPanel';

type AirportControlCommand =
  | { action: 'pause' | 'resume' | 'nextView' | 'zoomIn' | 'zoomOut' | 'rotateLeft' | 'rotateRight' | 'resetCamera' | 'restart' }
  | { action: 'setSpeed'; value: number }
  | { action: 'setMode'; value: ControlMode }
  | { action: 'setNightMode'; enabled: boolean }
  | { action: 'setRadarVisible'; enabled: boolean }
  | { action: 'setQueueInspectorVisible'; enabled: boolean }
  | { action: 'setRunwayLabelsVisible'; enabled: boolean }
  | { action: 'setSurfaceLayerVisible'; layer: SurfaceLayer; enabled: boolean }
  | { action: 'setAirspaceLayerVisible'; layer: AirspaceLayer; enabled: boolean }
  | { action: 'setMapOrientationVisible'; enabled: boolean }
  | { action: 'setWindOverlayVisible'; enabled: boolean }
  | { action: 'setServiceVehiclesVisible'; enabled: boolean }
  | { action: 'selectAirport'; code: string }
  | { action: 'clearFlight'; flightId: number; runway: number }
  | { action: 'clearPushback'; flightId: number }
  | { action: 'clearRunwayEntry'; flightId: number }
  | { action: 'clearTakeoff'; flightId: number }
  | { action: 'clearRunwayCrossing'; flightId: number; runway: number }
  | { action: 'controlFlights'; flightIds: number[]; instruction: FlightInstruction }
  | { action: 'assignHeading'; flightId: number; headingDegrees: number }
  | { action: 'assignAltitude'; flightId: number; altitudeFt: number }
  | { action: 'assignAirspeed'; flightId: number; speedKts: number }
  | { action: 'directTo'; flightId: number; fixId: string }
  | { action: 'clearApproach'; flightId: number }
  | { action: 'holdFlight'; flightId: number; patternId?: string; efcMinutes?: number }
  | { action: 'releaseHold'; flightId: number }
  | { action: 'handoffFlight'; flightId: number; station: ControllerStation }
  | { action: 'focusFlight'; flightId: number | null }
  | { action: 'setScenario'; scenario: TrafficScenario }
  | { action: 'setTrafficDensity'; density: TrafficDensity }
  | { action: 'setSeparationRuleset'; ruleset: SeparationRulesetId }
  | { action: 'setStation'; station: ControllerStation }
  | { action: 'setStationAutomation'; station: OperationalControllerStation; enabled: boolean }
  | { action: 'triggerEmergency'; flightId: number; type: EmergencyType }
  | { action: 'setWeather'; condition: WeatherCondition; directionDegrees: number; windSpeed: number }
  | { action: 'setWeatherEnabled'; enabled: boolean }
  | { action: 'setWindEnabled'; enabled: boolean }
  | { action: 'setRunwayConfiguration'; configurationId: string | null }
  | { action: 'setSurfaceDisruption'; kind: Exclude<SurfaceDisruptionKind, 'disabled-aircraft'>; targetId: string; enabled: boolean; durationSeconds?: number }
  | { action: 'clearSurfaceDisruption'; disruptionId: string }
  | { action: 'recoverDisabledAircraft'; flightId: number };

type AirportControlResult = {
  accepted: boolean;
  reason: string;
  sequence: number;
  eventId: number;
  snapshot: ReturnType<typeof airportSnapshot>;
  resultingState: ReturnType<typeof airportSnapshot>;
};

type RecordedCommand = { sequence: number; elapsed: number; command: AirportControlCommand; accepted: boolean; reason: string };
type ReplayRecording = {
  schemaVersion: 1;
  simulationVersion: string;
  recordedAt: string;
  seed: number;
  airport: { code: string; name: string; scope: string };
  initialState: ReturnType<typeof cloneAirportState>;
  commands: RecordedCommand[];
  weatherHistory: TelemetryEvent[];
  events: TelemetryEvent[];
  frames: ReplayFrame[];
};

declare global {
  interface Window {
    airportControl: {
      version: string;
      snapshot(): ReturnType<typeof airportSnapshot>;
      events(limit?: number): TelemetryEvent[];
      command(command: AirportControlCommand): ReturnType<typeof airportSnapshot>;
      request(command: AirportControlCommand): AirportControlResult;
      help(): Record<string, string>;
      replay(): ReplayFrame[];
      recording(): ReplayRecording;
    };
  }
}

type TelemetryEvent = {
  sequence: number;
  airport: string;
  elapsed: number;
  type: string;
  flightId?: number;
  callsign?: string;
  runway?: number;
  phase?: string;
  taxiway?: string;
  accepted?: boolean;
  detail?: string;
  payload?: unknown;
};

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const canvas = $<HTMLCanvasElement>('#scene');
const menuButton = $<HTMLButtonElement>('#menu-toggle');
const controlPanel = $<HTMLElement>('#control-panel');
const audio = new AmbientAudio();
let config = generateAirportConfig();
let simulation = new AirportSimulation(config);
let world = createWorld(canvas, config);
simulation.setPaused(true);

const intro = $<HTMLDivElement>('#intro');
const gameOver = $<HTMLDivElement>('#game-over');
const enterButton = $<HTMLButtonElement>('#enter');
const restartButton = $<HTMLButtonElement>('#restart');
const soundButton = $<HTMLButtonElement>('#sound-toggle');
const pauseButton = $<HTMLButtonElement>('#pause-toggle');
const pauseIcon = $<HTMLElement>('#pause-icon');
const pauseLabel = $<HTMLElement>('#pause-label');
const viewButton = $<HTMLButtonElement>('#view-toggle');
const fieldButton = $<HTMLButtonElement>('#field-toggle');
const fieldLabel = $<HTMLElement>('#field-label');
const modeButton = $<HTMLButtonElement>('#mode-toggle');
const modeIcon = $<HTMLElement>('#mode-icon');
const modeLabel = $<HTMLElement>('#mode-label');
const nightButton = $<HTMLButtonElement>('#night-toggle');
const nightIcon = $<HTMLElement>('#night-icon');
const nightLabel = $<HTMLElement>('#night-label');
const radarButton = $<HTMLButtonElement>('#radar-toggle');
const radarLabel = $<HTMLElement>('#radar-label');
const radarPanel = $<HTMLElement>('#radar-panel');
const radarScope = $<HTMLCanvasElement>('#radar-scope');
const radarAirport = $<HTMLElement>('#radar-airport');
const radarClose = $<HTMLButtonElement>('#radar-close');
const radarRange = $<HTMLElement>('#radar-range');
const queueButton = $<HTMLButtonElement>('#queue-toggle');
const queueLabel = $<HTMLElement>('#queue-label');
const queuePanel = $<HTMLElement>('#queue-panel');
const queueClose = $<HTMLButtonElement>('#queue-close');
const queueCount = $<HTMLElement>('#queue-count');
const queueFilter = $<HTMLSelectElement>('#queue-filter');
const queueList = $<HTMLElement>('#queue-list');
const queueLongest = $<HTMLElement>('#queue-longest');
const scopeButton = $<HTMLButtonElement>('#scope-toggle');
const scopeLabel = $<HTMLElement>('#scope-label');
const brandMark = $<HTMLElement>('#brand-mark');
const airportName = $<HTMLElement>('#airport-name');
const airportMeta = $<HTMLElement>('#airport-meta');
const mapDataVersion = $<HTMLElement>('#map-data-version');
const mapDataAttribution = $<HTMLElement>('#map-data-attribution');
const mapDataSource = $<HTMLAnchorElement>('#map-data-source');
const mapSurfaceSource = $<HTMLAnchorElement>('#map-surface-source');
const mapFacilitySource = $<HTMLAnchorElement>('#map-facility-source');
const instructionCopy = $<HTMLElement>('#instruction-copy');
const airportSelect = $<HTMLSelectElement>('#airport-select');
const controlSelect = $<HTMLSelectElement>('#control-select');
const scenarioSelect = $<HTMLSelectElement>('#scenario-select');
const densitySelect = $<HTMLSelectElement>('#density-select');
const separationRulesSelect = $<HTMLSelectElement>('#separation-rules-select');
const stationSelect = $<HTMLSelectElement>('#station-select');
const stationAutomationControls = [...document.querySelectorAll<HTMLInputElement>('[data-station-automation]')];
const stationWorkloadControls = [...document.querySelectorAll<HTMLButtonElement>('[data-station-workload]')];
const introAirportSelect = $<HTMLSelectElement>('#intro-airport-select');
const introControlSelect = $<HTMLSelectElement>('#intro-control-select');
const introDensitySelect = $<HTMLSelectElement>('#intro-density-select');
const introSeparationRulesSelect = $<HTMLSelectElement>('#intro-separation-rules-select');
const speedControl = $<HTMLInputElement>('#speed-control');
const speedOutput = $<HTMLOutputElement>('#speed-output');
const weatherCondition = $<HTMLElement>('#weather-condition');
const weatherWind = $<HTMLElement>('#weather-wind');
const weatherVisibility = $<HTMLElement>('#weather-visibility');
const operationBank = $<HTMLElement>('#operation-bank');
const trafficFlowReadout = $<HTMLElement>('#traffic-flow');
const runwayConfiguration = $<HTMLElement>('#runway-configuration');
const runwayConfigurationSelect = $<HTMLSelectElement>('#runway-configuration-select');
const weatherToggle = $<HTMLButtonElement>('#weather-toggle');
const windToggle = $<HTMLButtonElement>('#wind-toggle');
const weatherConditionSelect = $<HTMLSelectElement>('#weather-condition-select');
const audioPreset = $<HTMLSelectElement>('#audio-preset');
const status = $<HTMLElement>('.status');
const statusLabel = $<HTMLElement>('#status-label');
const statusDetail = $<HTMLElement>('#status-detail');
const landedCount = $<HTMLElement>('#landed-count');
const departedCount = $<HTMLElement>('#departed-count');
const shiftTime = $<HTMLElement>('#shift-time');
const routePath = $<SVGPathElement>('#route-path');
const routeShadow = $<SVGPathElement>('#route-shadow');
const telemetryPanel = $<HTMLElement>('#telemetry-panel');
const telemetryControls = $<HTMLElement>('#telemetry-controls');
const telemetryOutput = $<HTMLElement>('#telemetry-output');
const replayToggle = $<HTMLButtonElement>('#replay-toggle');
const replaySlider = $<HTMLInputElement>('#replay-slider');
const replayTime = $<HTMLOutputElement>('#replay-time');
const replayExport = $<HTMLButtonElement>('#replay-export');
const safetyScore = $<HTMLElement>('#safety-score');
const flightStrip = $<HTMLElement>('#flight-strip');
const flightStripToggle = $<HTMLButtonElement>('#flight-strip-toggle');
const flightStripTitle = $<HTMLElement>('#flight-strip-title');
const flightStripCount = $<HTMLElement>('#flight-strip-count');
const flightChips = $<HTMLElement>('#flight-chips');
const flightActions = $<HTMLElement>('#flight-actions');
const clearanceAdvisor = $<HTMLElement>('#clearance-advisor');
const clearanceAdvisorHeader = document.createElement('header');
const clearanceAdvisorIdentity = document.createElement('div');
const clearanceAdvisorTitle = document.createElement('b');
const clearanceAdvisorStation = document.createElement('small');
const clearanceAdvisorButton = document.createElement('button');
const clearanceAdvisorReason = document.createElement('p');
clearanceAdvisorButton.type = 'button';
clearanceAdvisorIdentity.append(clearanceAdvisorTitle, clearanceAdvisorStation);
clearanceAdvisorHeader.append(clearanceAdvisorIdentity, clearanceAdvisorButton);
clearanceAdvisor.replaceChildren(clearanceAdvisorHeader, clearanceAdvisorReason);
const zoomInButton = $<HTMLButtonElement>('#zoom-in');
const zoomOutButton = $<HTMLButtonElement>('#zoom-out');
const cameraResetButton = $<HTMLButtonElement>('#camera-reset');
const runwayLabelButton = $<HTMLButtonElement>('#runway-label-toggle');
const runwayLabelLabel = $<HTMLElement>('#runway-label-label');
const mapOrientationToggle = $<HTMLInputElement>('#map-orientation-toggle');
const mapOrientation = $<HTMLElement>('#map-orientation');
const mapNorthArrow = $<HTMLElement>('#map-north-arrow');
const mapScaleLabel = $<HTMLElement>('#map-scale-label');
const mapScaleBar = $<HTMLElement>('#map-scale-bar');
const windOverlayToggle = $<HTMLInputElement>('#wind-overlay-toggle');
const windOverlay = $<HTMLElement>('#wind-overlay');
const windOverlayArrow = $<HTMLElement>('#wind-overlay-arrow');
const windOverlayHeading = $<HTMLElement>('#wind-overlay-heading');
const windOverlaySpeed = $<HTMLElement>('#wind-overlay-speed');
const serviceVehiclesToggle = $<HTMLInputElement>('#service-vehicles-toggle');
const surfaceDisruptionKind = $<HTMLSelectElement>('#surface-disruption-kind');
const surfaceDisruptionTarget = $<HTMLSelectElement>('#surface-disruption-target');
const surfaceDisruptionDuration = $<HTMLSelectElement>('#surface-disruption-duration');
const surfaceDisruptionApply = $<HTMLButtonElement>('#surface-disruption-apply');
const surfaceDisruptionList = $<HTMLElement>('#surface-disruption-list');
const operationsHealth = $<HTMLElement>('#operations-health');
const healthState = $<HTMLElement>('#health-state');
const healthThroughput = $<HTMLElement>('#health-throughput');
const healthConflicts = $<HTMLElement>('#health-conflicts');
const healthIncursions = $<HTMLElement>('#health-incursions');
const healthPauses = $<HTMLElement>('#health-pauses');
const healthHold = $<HTMLElement>('#health-hold');
const healthDelay = $<HTMLElement>('#health-delay');
const healthFps = $<HTMLElement>('#health-fps');
const debugPanel = $<HTMLElement>('#debug-panel');
const audioLevelControls = [...document.querySelectorAll<HTMLInputElement>('[data-audio-level]')];
const surfaceLayerControls = [...document.querySelectorAll<HTMLInputElement>('[data-surface-layer]')];
const airspaceLayerControls = [...document.querySelectorAll<HTMLInputElement>('[data-airspace-layer]')];

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
let lastArrivals = -1;
let lastDepartures = -1;
let hubIndex = 0;
let activeFlightId: number | null = null;
let routePoints: Array<{ x: number; y: number }> = [];
let simulationSpeed = 1;
let radarVisible = false;
let queueInspectorVisible = false;
let queueInspectorFilter: OperationQueueFilter = 'all';
let queueInspectorUiKey = '';
let windOverlayVisible = false;
let serviceVehiclesVisible = true;
let telemetrySequence = 0;
let lastWeatherCondition: WeatherCondition | null = null;
let weatherSelection: 'auto' | WeatherCondition = 'auto';
let runwayConfigurationOptionsKey = '';
let surfaceDisruptionUiKey = '';
let lastPredictionKey = '';
let replayIndex = -1;
let replayMode = false;
let pausedBeforeReplay = false;
let focusedFlightId: number | null = null;
let flightActionsRenderKey = '';
let runwayLabelsVisible = false;
const surfaceLayerVisibility: Record<SurfaceLayer, boolean> = {
  'taxiway-labels': false,
  'operational-zones': false,
  hotspots: false,
  'airport-boundary': false,
};
const airspaceLayerVisibility: Record<AirspaceLayer, boolean> = {
  'airspace-sectors': false,
  'navigation-fixes': false,
  procedures: false,
  'flight-routes': false,
  separation: false,
};
let mapOrientationVisible = false;
let lastOrientationUpdate = -Infinity;
let lastRadarUpdate = -Infinity;
let canvasTap: { pointerId: number; x: number; y: number; moved: boolean } | null = null;
let previousPresentation = capturePresentation(simulation.state);
let lastFlightStripRender = -Infinity;
let renderedFrames = 0;
let frameWindowStarted = performance.now();
let measuredFps = 0;
let modalReturnFocus: HTMLElement | null = null;
let lastDebugSecond = -1;
const replayFrames: ReplayFrame[] = [];
const telemetryEvents: TelemetryEvent[] = [];
const commandHistory: RecordedCommand[] = [];
let initialReplayState = cloneAirportState(simulation.state);
const airportChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('airport-auto');
const launchOptions = new URLSearchParams(window.location.search);
const telemetryEnabled = launchOptions.get('telemetry') === '1';
const debugEnabled = launchOptions.get('debug') === '1';
const soakEnabled = launchOptions.get('soak') === '1';
const requestedRenderFps = Number(launchOptions.get('renderFps') ?? 0);
const minimumRenderInterval = Number.isFinite(requestedRenderFps) && requestedRenderFps >= 0.1 && requestedRenderFps < 60
  ? 1_000 / requestedRenderFps
  : 0;
let lastWorldRender = -Infinity;
let worldDeltaAccumulator = 0;
debugPanel.hidden = !debugEnabled;
updateAirportUi();
updateNightControl();
updateRadarControl();
updateQueueInspectorControl();
renderQueueInspector();
updateSurfaceDisruptionTargets();
renderSurfaceDisruptionControls();
renderFlightStrip();
setExclusiveModal(intro);
requestAnimationFrame(() => enterButton.focus());

function startShift(): void {
  setExclusiveModal(null);
  setControlPanelOpen(false);
  intro.classList.add('modal--hidden');
  simulation.setPaused(false);
  if (config.scope === 'center' && (simulation.state.mode === 'auto' || simulation.state.mode === 'watch')) setFlightStripCollapsed(true);
  canvas.focus({ preventScroll: true });
  setStatus(`${config.code === 'LOCAL' ? config.name : config.code} control is open`, 'the tower will guide each arrival');
}

enterButton.addEventListener('click', startShift);
flightStripToggle.addEventListener('click', () => {
  setFlightStripCollapsed(!flightStrip.classList.contains('flight-strip--collapsed'));
});
flightChips.addEventListener('click', (event) => {
  const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-flight-chip]');
  if (!chip) return;
  const flightId = Number(chip.dataset.flightChip);
  const flight = displayState().flights.find((item) => item.id === flightId);
  if (!flight) return;
  if (focusedFlightId === flightId) {
    clearFlightFocus('Camera released', 'free map view restored');
    return;
  }
  focusedFlightId = flightId;
  world.selectFlight(flightId);
  renderFlightStrip();
  renderFlightActions();
  setStatus(`${flight.callsign} tracked`, `${flight.aircraft} · ${formatPhase(flight.phase)} · runway ${runwayDesignation(flight.runway)}`);
});
flightActions.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-flight-action]');
  if (!button || focusedFlightId === null) return;
  handleFlightAction(focusedFlightId, button.dataset.flightAction ?? '', button.dataset.runway);
});
clearanceAdvisor.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-proposal-id]');
  if (!button) return;
  const proposal = simulation.clearanceProposals().find((item) => item.id === button.dataset.proposalId);
  if (proposal) applyClearanceProposal(proposal);
});

zoomInButton.addEventListener('click', () => world.zoomIn());
zoomOutButton.addEventListener('click', () => world.zoomOut());
cameraResetButton.addEventListener('click', () => {
  clearFlightFocus();
  world.resetCamera();
});
runwayLabelButton.addEventListener('click', () => setRunwayLabelsVisible(!runwayLabelsVisible));
for (const control of surfaceLayerControls) {
  control.addEventListener('change', () => {
    setSurfaceLayerVisible(control.dataset.surfaceLayer as SurfaceLayer, control.checked);
  });
}
for (const control of airspaceLayerControls) {
  control.addEventListener('change', () => {
    setAirspaceLayerVisible(control.dataset.airspaceLayer as AirspaceLayer, control.checked);
  });
}
mapOrientationToggle.addEventListener('change', () => setMapOrientationVisible(mapOrientationToggle.checked));
windOverlayToggle.addEventListener('change', () => setWindOverlayVisible(windOverlayToggle.checked));
serviceVehiclesToggle.addEventListener('change', () => setServiceVehiclesVisible(serviceVehiclesToggle.checked));
menuButton.addEventListener('click', (event) => {
  event.stopPropagation();
  setControlPanelOpen(!controlPanel.classList.contains('control-panel--open'));
});
document.addEventListener('pointerdown', (event) => {
  if (!controlPanel.classList.contains('control-panel--open')) return;
  const target = event.target;
  if (target instanceof Node && !controlPanel.contains(target) && !menuButton.contains(target)) setControlPanelOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setControlPanelOpen(false);
    if (focusedFlightId !== null) clearFlightFocus('Camera released', 'free map view restored');
    return;
  }
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
  const panDirection: Record<string, [number, number]> = {
    w: [0, -1], arrowup: [0, -1],
    a: [-1, 0], arrowleft: [-1, 0],
    s: [0, 1], arrowdown: [0, 1],
    d: [1, 0], arrowright: [1, 0],
  };
  const pan = panDirection[event.key.toLowerCase()];
  if (pan && intro.classList.contains('modal--hidden') && gameOver.hidden) {
    event.preventDefault();
    clearFlightFocus();
    world.panByScreen(pan[0], pan[1]);
    return;
  }
  const cameraKey = event.key.toLowerCase();
  if ((cameraKey === 'q' || cameraKey === 'e') && intro.classList.contains('modal--hidden') && gameOver.hidden) {
    event.preventDefault();
    clearFlightFocus();
    world.rotateBy(cameraKey === 'q' ? -1 : 1);
    return;
  }
  if (event.key === '+' || event.key === '=') world.zoomIn();
  if (event.key === '-') world.zoomOut();
  if (event.key === '0') world.resetCamera();
  if (event.key.toLowerCase() === 'v') world.nextView();
  if (event.key === ' ' && !intro.classList.contains('modal--hidden')) return;
  if (event.key === ' ') {
    event.preventDefault();
    pauseButton.click();
  }
  if (focusedFlightId === null) return;
  const key = event.key.toLowerCase();
  if (key === 'l') handleFlightAction(focusedFlightId, 'clear');
  if (key === 'g') handleFlightAction(focusedFlightId, 'go-around');
  if (key === 'h') handleFlightAction(focusedFlightId, 'hold-toggle');
  if (key === 'r') handleFlightAction(focusedFlightId, 'entry');
  if (key === 't') handleFlightAction(focusedFlightId, 'takeoff');
});

airportSelect.addEventListener('change', () => selectAirport(airportSelect.value, false));
introAirportSelect.addEventListener('change', () => selectAirport(introAirportSelect.value, true));
controlSelect.addEventListener('change', () => selectControl(controlSelect.value as ControlMode));
scenarioSelect.addEventListener('change', () => setScenario(scenarioSelect.value as TrafficScenario));
densitySelect.addEventListener('change', () => setTrafficDensity(densitySelect.value as TrafficDensity));
separationRulesSelect.addEventListener('change', () => setSeparationRules(separationRulesSelect.value as SeparationRulesetId));
stationSelect.addEventListener('change', () => setStation(stationSelect.value as ControllerStation));
for (const control of stationAutomationControls) {
  control.addEventListener('change', () => {
    const station = control.dataset.stationAutomation;
    if (!station || !OPERATIONAL_CONTROLLER_STATIONS.includes(station as OperationalControllerStation)) return;
    const result = executeAirportRequest({
      action: 'setStationAutomation',
      station: station as OperationalControllerStation,
      enabled: control.checked,
    });
    updateStationAutomationUi();
    setStatus(result.accepted ? `${controllerStationLabel(station as OperationalControllerStation)} automation updated` : 'Automation unchanged', result.reason);
  });
}
for (const control of stationWorkloadControls) {
  control.addEventListener('click', () => {
    const station = control.dataset.stationWorkload;
    if (!station || !OPERATIONAL_CONTROLLER_STATIONS.includes(station as OperationalControllerStation)) return;
    setStation(station as OperationalControllerStation);
  });
}
introControlSelect.addEventListener('change', () => selectControl(introControlSelect.value as ControlMode));
introDensitySelect.addEventListener('change', () => {
  const density = introDensitySelect.value as TrafficDensity;
  simulation.setTrafficDensity(density);
  newSession(true, config);
  setStatus(`${trafficDensityProfile(density).label} traffic selected`, 'the opening bank has been rebuilt at this density');
});
introSeparationRulesSelect.addEventListener('change', () => setSeparationRules(introSeparationRulesSelect.value as SeparationRulesetId));
speedControl.addEventListener('input', () => setSimulationSpeed(Number(speedControl.value)));
weatherToggle.addEventListener('click', () => {
  const enabling = !simulation.state.weather.weatherEnabled;
  if (!enabling || weatherSelection === 'auto') simulation.setWeatherEnabled(enabling);
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
weatherConditionSelect.addEventListener('change', () => {
  const selection = weatherConditionSelect.value as 'auto' | WeatherCondition;
  weatherSelection = selection;
  if (selection === 'auto') simulation.setWeatherEnabled(true);
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
windToggle.addEventListener('click', () => {
  simulation.setWindEnabled(!simulation.state.weather.windEnabled);
  updateWeatherUi();
});
runwayConfigurationSelect.addEventListener('change', () => {
  const requested = runwayConfigurationSelect.value === 'auto' ? null : runwayConfigurationSelect.value;
  const accepted = simulation.setRunwayConfiguration(requested);
  const reason = simulation.lastCommandReason();
  updateWeatherUi();
  setStatus(accepted ? 'Runway plan accepted' : 'Runway plan rejected', reason);
});
audioPreset.addEventListener('change', () => audio.setPreset(audioPreset.value as AudioPreset));
for (const control of audioLevelControls) {
  control.addEventListener('input', () => audio.setLevel(control.dataset.audioLevel as AudioChannel, Number(control.value)));
}

surfaceDisruptionKind.addEventListener('change', () => {
  updateSurfaceDisruptionTargets();
  renderSurfaceDisruptionControls();
});
surfaceDisruptionApply.addEventListener('click', () => {
  const result = executeAirportRequest({
    action: 'setSurfaceDisruption',
    kind: surfaceDisruptionKind.value as Exclude<SurfaceDisruptionKind, 'disabled-aircraft'>,
    targetId: surfaceDisruptionTarget.value,
    enabled: true,
    durationSeconds: Number(surfaceDisruptionDuration.value) || undefined,
  });
  surfaceDisruptionUiKey = '';
  renderSurfaceDisruptionControls();
  setStatus(result.accepted ? 'Surface restriction active' : 'Surface restriction rejected', result.reason);
});
surfaceDisruptionList.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button) return;
  const result = button.dataset.recoverFlight
    ? executeAirportRequest({ action: 'recoverDisabledAircraft', flightId: Number(button.dataset.recoverFlight) })
    : executeAirportRequest({ action: 'clearSurfaceDisruption', disruptionId: button.dataset.clearDisruption ?? '' });
  surfaceDisruptionUiKey = '';
  renderSurfaceDisruptionControls();
  setStatus(result.accepted ? 'Surface operation accepted' : 'Surface operation rejected', result.reason);
});

replayToggle.addEventListener('click', () => {
  replayMode = !replayMode;
  replayToggle.setAttribute('aria-pressed', String(replayMode));
  replayToggle.textContent = replayMode ? 'Live' : 'Replay';
  replaySlider.disabled = !replayMode || replayFrames.length === 0;
  if (!replayMode) {
    replayIndex = -1;
    simulation.setPaused(pausedBeforeReplay);
  } else {
    pausedBeforeReplay = simulation.state.paused;
    simulation.setPaused(true);
    replayIndex = Math.max(0, replayFrames.length - 1);
  }
  updateReplayUi();
  renderFlightStrip();
  renderFlightActions();
});
replaySlider.addEventListener('input', () => {
  replayIndex = Number(replaySlider.value);
  updateReplayUi();
  renderFlightStrip();
  renderFlightActions();
});
replayExport.addEventListener('click', () => {
  const payload = JSON.stringify(replayRecording(), null, 2);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  link.download = `${config.code.toLowerCase()}-replay.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus('Replay exported', `${replayFrames.length} frames · seed, weather, commands, and states included`);
});

soundButton.addEventListener('click', async () => {
  const enabled = await audio.toggle();
  soundButton.setAttribute('aria-pressed', String(enabled));
  soundButton.classList.toggle('control--active', enabled);
});

pauseButton.addEventListener('click', () => {
  if (simulation.state.gameOver) return;
  const paused = !simulation.state.paused;
  simulation.setPaused(paused);
  pauseButton.setAttribute('aria-pressed', String(paused));
  pauseButton.classList.toggle('control--active', paused);
  pauseIcon.textContent = paused ? '▶' : 'Ⅱ';
  pauseLabel.textContent = paused ? 'Resume' : 'Pause';
  setStatus(paused ? 'Shift paused' : 'Shift resumed', paused ? 'the airspace is holding' : 'traffic is moving again');
});

viewButton.addEventListener('click', () => world.nextView());
fieldButton.addEventListener('click', () => {
  if (config.scope === 'center') {
    hubIndex = (hubIndex + 1) % HUB_AIRPORTS.length;
    newSession(false, generateHubConfig(hubIndex));
  } else {
    newSession(false, generateAirportConfig());
  }
  setStatus(`${config.code === 'LOCAL' ? config.name : config.code} is open`, trafficDescription());
});
scopeButton.addEventListener('click', () => {
  const enterCenter = config.scope === 'airfield';
  newSession(false, enterCenter ? generateHubConfig(hubIndex) : generateAirportConfig());
  setStatus(enterCenter ? `${config.code} center scope` : `${config.name} airfield scope`, enterCenter ? trafficDescription() : 'close view · local traffic');
});
modeButton.addEventListener('click', () => {
  const modes: ControlMode[] = ['auto', 'assisted', 'manual', 'watch'];
  const mode = modes[(modes.indexOf(simulation.state.mode) + 1) % modes.length];
  simulation.setMode(mode);
  updateModeControl();
  setStatus(modeName(mode), modeDescription(mode));
});
nightButton.addEventListener('click', () => {
  simulation.setNightMode(!simulation.state.nightMode);
  updateNightControl();
  setStatus(simulation.state.nightMode ? 'Night lighting active' : 'Day lighting active', simulation.state.nightMode ? 'runway and aircraft lights are illuminated' : 'full daylight visibility restored');
});
radarButton.addEventListener('click', () => {
  radarVisible = !radarVisible;
  updateRadarControl();
  setStatus(radarVisible ? 'Terminal radar open' : 'Terminal radar closed', radarVisible ? 'live aircraft and runway plot enabled' : 'unobstructed map view restored');
});

radarClose.addEventListener('click', () => {
  radarVisible = false;
  updateRadarControl();
  setStatus('Terminal radar closed', 'unobstructed map view restored');
});

queueButton.addEventListener('click', () => {
  queueInspectorVisible = !queueInspectorVisible;
  updateQueueInspectorControl();
  renderQueueInspector();
  setStatus(queueInspectorVisible ? 'Operation queues open' : 'Operation queues closed', queueInspectorVisible ? 'live blockers and downstream dependencies explained' : 'unobstructed map view restored');
});

queueClose.addEventListener('click', () => {
  queueInspectorVisible = false;
  updateQueueInspectorControl();
  setStatus('Operation queues closed', 'unobstructed map view restored');
});

queueFilter.addEventListener('change', () => {
  if (!isOperationQueueFilter(queueFilter.value)) return;
  queueInspectorFilter = queueFilter.value;
  queueInspectorUiKey = '';
  renderQueueInspector();
});

queueList.addEventListener('click', (event) => {
  const row = (event.target as HTMLElement).closest<HTMLElement>('[data-queue-flight]');
  if (!row) return;
  const flightId = Number(row.dataset.queueFlight);
  const result = executeAirportRequest({ action: 'focusFlight', flightId });
  if (result.accepted) {
    queueInspectorUiKey = '';
    renderQueueInspector();
    const flight = displayState().flights.find((candidate) => candidate.id === flightId);
    if (flight) setStatus(`${flight.callsign} selected from queue`, flight.automaticHoldReason ?? flight.safetyHoldReason ?? 'operational dependency highlighted');
  }
});

restartButton.addEventListener('click', () => {
  setExclusiveModal(null);
  newSession(false, config.scope === 'center' ? generateHubConfig(hubIndex) : generateAirportConfig());
  gameOver.classList.add('modal--hidden');
  gameOver.hidden = true;
  pauseButton.setAttribute('aria-pressed', 'false');
  pauseButton.classList.remove('control--active');
  pauseIcon.textContent = 'Ⅱ';
  pauseLabel.textContent = 'Pause';
  setStatus('A fresh airfield opens', `${config.runwayCount} directional runway${config.runwayCount === 1 ? '' : 's'} ready`);
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'touch' && event.button !== 0) return;
  if (event.pointerType === 'touch' && !event.isPrimary) {
    canvasTap = null;
    activeFlightId = null;
    clearRoute();
    return;
  }
  canvasTap = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  if (simulation.state.paused || simulation.state.gameOver) return;
  const id = world.pickFlight(event.clientX, event.clientY);
  const flight = simulation.state.flights.find((item) => item.id === id);
  if (!flight || flight.phase !== 'approach' || flight.cleared) return;
  activeFlightId = flight.id;
  routePoints = [world.flightScreenPosition(flight.id) ?? { x: event.clientX, y: event.clientY }, { x: event.clientX, y: event.clientY }];
  canvas.setPointerCapture(event.pointerId);
  world.selectFlight(flight.id);
  focusedFlightId = flight.id;
  renderFlightStrip();
  routePath.style.setProperty('--route-color', flight.palette === 'rose' ? '#ef937f' : '#79c8e8');
  routeShadow.style.setProperty('--route-color', flight.palette === 'rose' ? '#ef937f' : '#79c8e8');
  routePath.classList.add('route--active');
  drawRoute();
  setStatus(`${flight.callsign} selected`, `guide it to runway ${flight.runway + 1}'s lit threshold`);
});

canvas.addEventListener('pointermove', (event) => {
  if (canvasTap?.pointerId === event.pointerId && Math.hypot(event.clientX - canvasTap.x, event.clientY - canvasTap.y) > 5) canvasTap.moved = true;
  if (activeFlightId === null) return;
  const last = routePoints[routePoints.length - 1];
  if (Math.hypot(last.x - event.clientX, last.y - event.clientY) > 7) routePoints.push({ x: event.clientX, y: event.clientY });
  else routePoints[routePoints.length - 1] = { x: event.clientX, y: event.clientY };
  drawRoute();
});

function finishRoute(event: PointerEvent): void {
  if (activeFlightId === null) return;
  const flight = simulation.state.flights.find((item) => item.id === activeFlightId);
  const runway = world.pickRunway(event.clientX, event.clientY);
  const accepted = runway !== null && simulation.clearFlight(activeFlightId, runway);
  routePath.classList.toggle('route--accepted', accepted);
  routePath.classList.toggle('route--rejected', !accepted);
  if (!accepted && flight) setStatus('Clearance not accepted', `finish on runway ${flight.runway + 1}'s approach lights`);
  activeFlightId = null;
  world.selectFlight(null);
  window.setTimeout(clearRoute, accepted ? 650 : 420);
}

canvas.addEventListener('pointerup', (event) => {
  const routed = activeFlightId !== null;
  finishRoute(event);
  if (canvasTap?.pointerId === event.pointerId && !canvasTap.moved && !routed) selectFlightFromMap(event.clientX, event.clientY);
  if (canvasTap?.pointerId === event.pointerId) canvasTap = null;
});
canvas.addEventListener('pointercancel', (event) => {
  finishRoute(event);
  if (canvasTap?.pointerId === event.pointerId) canvasTap = null;
});

function drawRoute(): void {
  const d = routePoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  routePath.setAttribute('d', d);
  routeShadow.setAttribute('d', d);
}

function clearRoute(): void {
  routePoints = [];
  routePath.setAttribute('d', '');
  routeShadow.setAttribute('d', '');
  routePath.classList.remove('route--active', 'route--accepted', 'route--rejected');
}

function frame(now: number): void {
  const delta = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  worldDeltaAccumulator = Math.min(0.25, worldDeltaAccumulator + delta);
  const renderWorld = minimumRenderInterval === 0 || now - lastWorldRender >= minimumRenderInterval;
  if (renderWorld) {
    renderedFrames += 1;
    lastWorldRender = now;
  }
  if (now - frameWindowStarted >= 1_000) {
    measuredFps = renderedFrames * 1_000 / Math.max(1, now - frameWindowStarted);
    renderedFrames = 0;
    frameWindowStarted = now;
  }
  if (!replayMode) {
    simulationAccumulator = Math.min(SIMULATION_STEP * MAX_SIMULATION_TICKS_PER_FRAME, simulationAccumulator + delta);
    let ticks = 0;
    while (simulationAccumulator >= SIMULATION_STEP && ticks < MAX_SIMULATION_TICKS_PER_FRAME) {
      previousPresentation = capturePresentation(simulation.state);
      simulation.update(SIMULATION_STEP);
      simulationAccumulator -= SIMULATION_STEP;
      ticks += 1;
    }
  }
  audioUpdateIn -= delta;
  if (audioUpdateIn <= 0) {
    audio.setEnvironment(simulation.state);
    audioUpdateIn = 0.25;
  }
  if (now - lastFlightStripRender >= 400) {
    renderFlightStrip();
    lastFlightStripRender = now;
  }

  const displayedState = displayState();
  const hudSecond = Math.floor(displayedState.elapsed);
  if (hudSecond !== lastHudSecond) {
    shiftTime.textContent = formatTime(displayedState.elapsed);
    updateWeatherUi();
    lastHudSecond = hudSecond;
    const predictions = simulation.conflictPredictions();
    const predictionKey = predictions.map((prediction) => `${prediction.type}:${prediction.flights.join('-')}`).join('|');
    if (predictions.length && predictionKey !== lastPredictionKey) setStatus('Conflict forecast', predictions[0].detail);
    lastPredictionKey = predictionKey;
    if (!replayMode) {
      replayFrames.push({
        clock: Number(simulation.state.elapsed.toFixed(2)),
        score: { landed: simulation.state.arrivals, departed: simulation.state.departures },
        flights: simulation.state.flights.map((flight) => ({ id: flight.id, callsign: flight.callsign, phase: flight.phase, runway: flight.runway, progress: Number(flight.progress.toFixed(3)) })),
        predictions,
        state: cloneAirportState(simulation.state),
      });
      if (replayFrames.length > 900) replayFrames.shift();
    }
    updateSafetyUi(predictions);
    updateReplayUi();
    updateOperationsHealth();
    renderSurfaceDisruptionControls();
    if (queueInspectorVisible) renderQueueInspector();
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
    const gateEvent = event.type === 'gate-assignment' || event.type === 'gate-reassignment' || event.type === 'gate-release';
    const turnaroundEvent = event.type === 'turnaround-start' || event.type === 'service-start' || event.type === 'service-complete' || event.type === 'turnaround-ready';
    const serviceVehicleEvent = event.type.startsWith('service-vehicle-');
    const deicingEvent = event.type.startsWith('deicing-');
    const runwayExitEvent = event.type === 'runway-exit-plan';
    const surfaceEvent = event.type === 'surface-reroute' || event.type === 'recovery-start' || event.type === 'recovery-complete';
    recordTelemetry(event.type, event.flight, event.runway, event.taxiway, {
      detail: event.detail ?? (event.type === 'safety-hold' ? event.flight.safetyHoldReason : undefined),
      payload: surfaceEvent ? {
        reroute: event.flight.surfaceReroute ? {
          ...event.flight.surfaceReroute,
          disruptionIds: [...event.flight.surfaceReroute.disruptionIds],
          previousEdgeIds: [...event.flight.surfaceReroute.previousEdgeIds],
          routeEdgeIds: [...event.flight.surfaceReroute.routeEdgeIds],
        } : null,
        disruption: simulation.state.surfaceDisruptions.find((disruption) => disruption.flightId === event.flight.id) ?? null,
      } : runwayExitEvent && event.flight.runwayExit ? {
        ...event.flight.runwayExit,
        taxiRouteEdgeIds: [...event.flight.runwayExit.taxiRouteEdgeIds],
        rationale: [...event.flight.runwayExit.rationale],
      } : gateEvent && event.flight.gateAssignment ? {
        standId: event.flight.gateAssignment.standId,
        gateRef: event.flight.gateAssignment.gateRef ?? null,
        zoneName: event.flight.gateAssignment.zoneName,
        terminalId: event.flight.gateAssignment.terminalId ?? null,
        concourse: event.flight.gateAssignment.concourse ?? null,
        scheduledGateInSeconds: event.flight.gateAssignment.scheduledGateInSeconds,
        scheduledDepartureSeconds: event.flight.gateAssignment.scheduledDepartureSeconds,
        nextDestination: event.flight.gateAssignment.nextDestination,
        revision: event.flight.gateAssignment.revision,
      } : serviceVehicleEvent ? {
        id: event.serviceVehicleId ?? null,
        type: event.serviceVehicleType ?? null,
        status: event.serviceVehicleStatus ?? null,
        service: event.turnaroundService ?? null,
      } : deicingEvent ? {
        ...event.flight.deicing,
      } : turnaroundEvent ? {
        service: event.turnaroundService ?? null,
        status: event.flight.turnaround.status,
        progress: Number(event.flight.turnaround.progress.toFixed(3)),
        scheduledReadySeconds: event.flight.turnaround.scheduledReadySeconds,
        actualReadySeconds: event.flight.turnaround.actualReadySeconds ?? null,
      } : undefined,
    });
    if (event.type === 'spawn') audio.traffic(event.flight.category, 'spawn');
    if (event.type === 'chime') {
      audio.chime();
      audio.traffic(event.flight.category, 'land');
    }
    if (event.type === 'depart') audio.traffic(event.flight.category, 'depart');
    if (event.type === 'spawn') setStatus(
      event.flight.phase === 'approach' ? `${event.flight.callsign} entering the scope` : `${event.flight.callsign} ready at the terminal`,
      simulation.state.mode === 'auto' || simulation.state.mode === 'watch' ? 'tower building the next safe movement' : simulation.state.mode === 'assisted' ? 'advisor preparing the next clearance' : 'select the flight strip for clearances',
    );
    if (event.type === 'gate-assignment') setStatus(`${event.flight.callsign} gate planned`, event.detail ?? 'stand schedule confirmed');
    if (event.type === 'gate-reassignment') setStatus(`${event.flight.callsign} gate changed`, event.detail ?? 'stand conflict resolved');
    if (event.type === 'gate-release') setStatus(`${event.flight.callsign} clear of stand`, event.detail ?? 'gate available');
    if (event.type === 'turnaround-ready') setStatus(`${event.flight.callsign} ready for push`, event.detail ?? 'all required services complete');
    if (event.type === 'clear') {
      audio.radio();
      setStatus(`${event.flight.callsign} cleared to land`, 'route accepted · runway lights are yours');
    }
    if (event.type === 'auto-clear') {
      audio.radio();
      setStatus(`${event.flight.callsign} cleared by the tower`, 'automatic approach is established');
    }
    if (event.type === 'pushback-clearance') {
      audio.radio();
      setStatus(`${event.flight.callsign} pushback approved`, event.detail ?? `push ${event.flight.pushbackDirection}`);
    }
    if (event.type === 'pushback-start') setStatus(`${event.flight.callsign} tug connected`, event.detail ?? 'pushback beginning');
    if (event.type === 'engine-start') setStatus(`${event.flight.callsign} starting engines`, 'tug remains attached through the ramp release');
    if (event.type === 'tug-release') setStatus(`${event.flight.callsign} tug released`, event.detail ?? 'taxi power available');
    if (event.type === 'deicing-planned') setStatus(`${event.flight.callsign} winter route planned`, event.detail ?? 'deicing pad assigned');
    if (event.type === 'deicing-queue') setStatus(`${event.flight.callsign} in deicing queue`, event.detail ?? 'holding before the pad');
    if (event.type === 'deicing-pad-entry') setStatus(`${event.flight.callsign} entering deicing`, event.detail ?? 'treatment lane released');
    if (event.type === 'deicing-start') setStatus(`${event.flight.callsign} treatment started`, event.detail ?? 'deicing in progress');
    if (event.type === 'deicing-complete') setStatus(`${event.flight.callsign} deicing complete`, event.detail ?? 'holdover protection active');
    if (event.type === 'deicing-expired') setStatus(`${event.flight.callsign} holdover expired`, event.detail ?? 'return to deicing before runway entry');
    if (event.type === 'deicing-return') setStatus(`${event.flight.callsign} returning to deicing`, event.detail ?? 'new treatment cycle required');
    if (event.type === 'land') setStatus(`${event.flight.callsign} touched down`, `${simulation.state.arrivals} safe arrival${simulation.state.arrivals === 1 ? '' : 's'}`);
    if (event.type === 'hold-short') {
      audio.radio();
      setStatus(`${event.flight.callsign} holding short`, `${event.taxiway} · runway ${runwayDesignation(event.runway ?? event.flight.runway)}`);
    }
    if (event.type === 'runway-entry') setStatus(`${event.flight.callsign} cleared onto runway`, `${event.taxiway} · runway ${runwayDesignation(event.runway ?? event.flight.runway)}`);
    if (event.type === 'takeoff-clearance') setStatus(`${event.flight.callsign} cleared for takeoff`, `runway ${runwayDesignation(event.runway ?? event.flight.runway)} · full roll authorized`);
    if (event.type === 'runway-crossing') setStatus(`${event.flight.callsign} crossing clearance`, `cross runway ${runwayDesignation(event.runway ?? event.flight.runway)}`);
    if (event.type === 'safety-hold') setStatus(`${event.flight.callsign} held for separation`, event.flight.safetyHoldReason ?? 'protected traffic envelope occupied');
    if (event.type === 'depart') setStatus(`${event.flight.callsign} is away`, 'departure corridor is clear');
    if (event.type === 'conflict') showGameOver(event.flight.callsign);
    if (event.type === 'emergency') setStatus(`${event.flight.callsign} emergency`, `${event.flight.emergency} · priority handling active`);
    if (event.type === 'go-around') setStatus(`${event.flight.callsign} going around`, `${event.detail ?? 'spacing reset'} · re-entering the arrival sequence`);
    if (event.type === 'surface-reroute') setStatus(`${event.flight.callsign} surface route amended`, event.detail ?? 'remaining on available pavement');
    if (event.type === 'recovery-start') setStatus(`${event.flight.callsign} recovery dispatched`, event.detail ?? 'tow and pavement inspection underway');
    if (event.type === 'recovery-complete') setStatus(`${event.flight.callsign} recovered`, event.detail ?? 'movement area inspected and reopened');
  }

  if (renderWorld) {
    world.update(replayMode ? displayedState : presentationState(), worldDeltaAccumulator);
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
    telemetryOutput.textContent = JSON.stringify(replayMode && replayFrames[replayIndex] ? { replay: replayFrames[replayIndex], live: airportSnapshot() } : airportSnapshot(), null, 2);
    updateReplayUi();
    lastTelemetrySecond = hudSecond;
  }
  requestAnimationFrame(frame);
}

function displayState() {
  return replayMode && replayFrames[replayIndex]?.state ? replayFrames[replayIndex].state : simulation.state;
}

function capturePresentation(state: typeof simulation.state) {
  return {
    elapsed: state.elapsed,
    flights: new Map(state.flights.map((flight) => [flight.id, {
      phase: flight.phase,
      progress: flight.progress,
      phaseElapsed: flight.phaseElapsed,
      kinematics: { ...flight.kinematics },
      motion: { ...flight.motion },
    }])),
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
  const alpha = Math.max(0, Math.min(1, simulationAccumulator / SIMULATION_STEP));
  return {
    ...current,
    elapsed: previousPresentation.elapsed + (current.elapsed - previousPresentation.elapsed) * alpha,
    serviceVehicles: current.serviceVehicles.map((vehicle) => {
      const previous = previousPresentation.serviceVehicles.get(vehicle.id);
      if (!previous || previous.status !== vehicle.status) return vehicle;
      const mix = (first: number, second: number) => first + (second - first) * alpha;
      return {
        ...vehicle,
        progress: mix(previous.progress, vehicle.progress),
        x: mix(previous.x, vehicle.x),
        y: mix(previous.y, vehicle.y),
        heading: previous.heading + Math.atan2(Math.sin(vehicle.heading - previous.heading), Math.cos(vehicle.heading - previous.heading)) * alpha,
        groundSpeedMps: mix(previous.groundSpeedMps, vehicle.groundSpeedMps),
      };
    }),
    flights: current.flights.map((flight) => {
      const previous = previousPresentation.flights.get(flight.id);
      if (!previous || previous.phase !== flight.phase) return flight;
      const mix = (first: number, second: number) => first + (second - first) * alpha;
      return {
        ...flight,
        progress: mix(previous.progress, flight.progress),
        phaseElapsed: mix(previous.phaseElapsed, flight.phaseElapsed),
        kinematics: {
          airspeedKts: mix(previous.kinematics.airspeedKts, flight.kinematics.airspeedKts),
          groundSpeedKts: mix(previous.kinematics.groundSpeedKts, flight.kinematics.groundSpeedKts),
          altitudeFt: mix(previous.kinematics.altitudeFt, flight.kinematics.altitudeFt),
          verticalSpeedFpm: mix(previous.kinematics.verticalSpeedFpm, flight.kinematics.verticalSpeedFpm),
          accelerationMps2: mix(previous.kinematics.accelerationMps2, flight.kinematics.accelerationMps2),
          fuelPercent: mix(previous.kinematics.fuelPercent, flight.kinematics.fuelPercent),
        },
        motion: {
          ...flight.motion,
          x: mix(previous.motion.x, flight.motion.x),
          y: mix(previous.motion.y, flight.motion.y),
          z: mix(previous.motion.z, flight.motion.z),
          heading: previous.motion.heading + Math.atan2(Math.sin(flight.motion.heading - previous.motion.heading), Math.cos(flight.motion.heading - previous.motion.heading)) * alpha,
          pitch: mix(previous.motion.pitch, flight.motion.pitch),
          bank: mix(previous.motion.bank, flight.motion.bank),
          distanceAlongM: mix(previous.motion.distanceAlongM, flight.motion.distanceAlongM),
          totalDistanceM: mix(previous.motion.totalDistanceM, flight.motion.totalDistanceM),
          stageProgress: mix(previous.motion.stageProgress, flight.motion.stageProgress),
        },
      };
    }),
  };
}

function cloneAirportState(state: typeof simulation.state): typeof simulation.state {
  return {
    ...state,
    stationAutomation: { ...state.stationAutomation },
    trafficFlow: cloneTrafficFlowState(state.trafficFlow),
    weather: { ...state.weather },
    activeRunwayEnds: { ...state.activeRunwayEnds },
    activeRunwayRoles: { ...state.activeRunwayRoles },
    runwayConfigurationTransition: state.runwayConfigurationTransition ? {
      ...state.runwayConfigurationTransition,
      changedRunwayIds: [...state.runwayConfigurationTransition.changedRunwayIds],
      blockingFlightIds: [...state.runwayConfigurationTransition.blockingFlightIds],
    } : null,
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
      surfaceRouteEdges: flight.surfaceRouteEdges ? [...flight.surfaceRouteEdges] : undefined,
      surfaceCongestedEdgeIds: flight.surfaceCongestedEdgeIds ? [...flight.surfaceCongestedEdgeIds] : undefined,
      runwayExit: flight.runwayExit ? {
        ...flight.runwayExit,
        taxiRouteEdgeIds: [...flight.runwayExit.taxiRouteEdgeIds],
        rationale: [...flight.runwayExit.rationale],
      } : undefined,
      surfaceReroute: flight.surfaceReroute ? {
        ...flight.surfaceReroute,
        disruptionIds: [...flight.surfaceReroute.disruptionIds],
        previousEdgeIds: [...flight.surfaceReroute.previousEdgeIds],
        routeEdgeIds: [...flight.surfaceReroute.routeEdgeIds],
      } : undefined,
      gateAssignment: flight.gateAssignment ? {
        ...flight.gateAssignment,
        rationale: [...flight.gateAssignment.rationale],
      } : undefined,
      flightPlan: cloneFlightPlan(flight.flightPlan),
      flightPlanHistory: flight.flightPlanHistory.map(cloneFlightPlan),
      navigation: {
        ...flight.navigation,
        routeFixIds: [...flight.navigation.routeFixIds],
        vector: flight.navigation.vector ? { ...flight.navigation.vector, start: { ...flight.navigation.vector.start } } : undefined,
        hold: flight.navigation.hold ? { ...flight.navigation.hold, start: { ...flight.navigation.hold.start } } : undefined,
      },
      turnaround: {
        ...flight.turnaround,
        tasks: flight.turnaround.tasks.map((task) => ({ ...task, dependencies: [...task.dependencies] })),
      },
      deicing: { ...flight.deicing },
      requiredCrossings: flight.requiredCrossings ? [...flight.requiredCrossings] : undefined,
      crossingClearances: flight.crossingClearances ? [...flight.crossingClearances] : undefined,
      crossingClearanceIds: flight.crossingClearanceIds ? [...flight.crossingClearanceIds] : undefined,
      goAround: flight.goAround ? { ...flight.goAround, start: { ...flight.goAround.start } } : undefined,
      kinematics: { ...flight.kinematics },
      motion: { ...flight.motion },
    })),
  };
}

function replayRecording(): ReplayRecording {
  return {
    schemaVersion: 1,
    simulationVersion: window.airportControl?.version ?? '2.16.0',
    recordedAt: new Date().toISOString(),
    seed: config.seed,
    airport: { code: config.code, name: config.name, scope: config.scope },
    initialState: cloneAirportState(initialReplayState),
    commands: commandHistory.map((entry) => ({ ...entry, command: { ...entry.command } as AirportControlCommand })),
    weatherHistory: telemetryEvents.filter((event) => event.type.startsWith('weather') || event.type.startsWith('command:setWeather')),
    events: telemetryEvents.map((event) => ({ ...event })),
    frames: replayFrames.map((frame) => ({ ...frame, state: cloneAirportState(frame.state) })),
  };
}

function renderFlightStrip(): void {
  const phaseOrder: Record<FlightPhase, number> = { landing: 0, approach: 1, takeoff: 2, 'taxi-in': 3, 'taxi-out': 4, resting: 5 };
  const allFlights = displayState().flights;
  const flights = visibleFlightsForStation(allFlights).sort((first, second) => phaseOrder[first.phase] - phaseOrder[second.phase] || first.id - second.id);
  const selectedWorkload = simulation.state.station === 'supervisor'
    ? null
    : simulation.controllerWorkloads().find((workload) => workload.station === simulation.state.station);
  flightStripTitle.textContent = simulation.state.station === 'supervisor'
    ? 'Live traffic'
    : `${controllerStationLabel(simulation.state.station)} bay`;
  if (focusedFlightId !== null && !flights.some((flight) => flight.id === focusedFlightId)) focusedFlightId = null;
  flightStripCount.textContent = selectedWorkload
    ? `${flights.length} tracks · ${selectedWorkload.workload}`
    : `${flights.length} aircraft`;
  if (!flights.length) {
    flightChips.replaceChildren(Object.assign(document.createElement('p'), { className: 'flight-chips__empty', textContent: simulation.state.station === 'supervisor' ? 'No active tracks · waiting at the edge of the scope' : `No ${simulation.state.station} traffic awaiting action` }));
    renderFlightActions();
    renderClearanceAdvisor();
    return;
  }
  const liveIds = new Set(flights.map((flight) => String(flight.id)));
  for (const child of [...flightChips.children]) {
    if (!(child instanceof HTMLElement) || !child.dataset.flightItem || !liveIds.has(child.dataset.flightItem)) child.remove();
  }
  for (const flight of flights) {
    let item = flightChips.querySelector<HTMLElement>(`[data-flight-item="${flight.id}"]`);
    if (!item) {
      item = document.createElement('div');
      item.dataset.flightItem = String(flight.id);
      item.setAttribute('role', 'listitem');
      item.innerHTML = '<button class="flight-chip" type="button"><span class="flight-chip__identity"><strong></strong><span></span></span><span class="flight-chip__metrics"><span class="flight-chip__metric"><small>Fuel</small><b></b></span><span class="flight-chip__metric"><small></small><b></b></span><span class="flight-chip__metric"><small>Altitude</small><b></b></span></span><span class="flight-chip__detail"><span></span><span class="flight-chip__trend"></span></span><span class="flight-chip__fuel" aria-hidden="true"><i></i></span></button>';
    }
    updateFlightChip(item, flight);
    flightChips.append(item);
  }
  renderFlightActions();
  renderClearanceAdvisor();
}

function visibleFlightsForStation(flights: Flight[]): Flight[] {
  if (simulation.state.mode === 'auto' || simulation.state.mode === 'watch' || simulation.state.station === 'supervisor') return [...flights];
  return flights.filter((flight) => (
    flight.navigation.frequencyOwner === simulation.state.station
    || requiredControllerStation(flight) === simulation.state.station
  ));
}

function updateFlightChip(item: HTMLElement, flight: Flight): void {
  const button = item.querySelector<HTMLButtonElement>('button')!;
  const kinematics = flight.kinematics;
  const surface = flight.phase === 'taxi-in' || flight.phase === 'taxi-out' || flight.phase === 'resting';
  const held = Boolean(flight.controlHold || flight.automaticHold || flight.crossingHoldRunway !== undefined || flight.safetyHold);
  const speed = surface ? kinematics.groundSpeedKts : kinematics.airspeedKts;
  const speedLabel = surface ? 'GS' : 'IAS';
  const altitude = Math.max(0, Math.round(kinematics.altitudeFt / 10) * 10);
  const verticalSpeed = Math.round(kinematics.verticalSpeedFpm / 100) * 100;
  const verticalText = Math.abs(verticalSpeed) < 100 ? 'LEVEL' : `${verticalSpeed > 0 ? '↑' : '↓'} ${Math.abs(verticalSpeed).toLocaleString()} FPM`;
  const acceleration = kinematics.accelerationMps2;
  const motionText = acceleration > 0.06 ? `ACC +${acceleration.toFixed(1)} M/S²` : acceleration < -0.06 ? `BRAKE ${acceleration.toFixed(1)} M/S²` : 'SPEED STABLE';
  const fuel = Math.max(0, Math.min(100, kinematics.fuelPercent));
  const operation = flightOperationLabel(flight);
  const routeDisplay = `${flight.flightPlan.origin}→${flight.flightPlan.destination}`;
  const phase = held ? 'Hold' : operation;
  const assignment = flight.gateAssignment;
  const stand = config.surfaceGraph.stands.find((candidate) => candidate.id === assignment?.standId)
    ?? config.surfaceGraph.stands.find((candidate) => candidate.slot === flight.gateSlot);
  const gateLabel = assignment?.gateRef
    ? `Gate ${assignment.gateRef}`
    : assignment?.zoneName
      ? assignment.zoneName.replace(/ Ramp$/i, '')
      : stand?.id
        ? `Stand ${stand.id}`
        : null;
  const gateDisplay = gateLabel
    ? flight.phase === 'approach' || flight.phase === 'landing' || flight.phase === 'taxi-in'
      ? `${gateLabel} planned`
      : flight.phase === 'taxi-out' || flight.phase === 'takeoff'
        ? `from ${gateLabel}`
        : gateLabel
    : null;
  const gateTime = assignment
    ? flight.phase === 'resting'
      ? `out ${formatTime(assignment.scheduledDepartureSeconds)}`
      : flight.phase === 'approach' || flight.phase === 'landing' || flight.phase === 'taxi-in'
        ? `ETA ${formatTime(assignment.scheduledGateInSeconds)}`
        : null
    : null;
  const runwayExitDisplay = flight.runwayExit && (flight.phase === 'approach' || flight.phase === 'landing' || flight.phase === 'taxi-in')
    ? `RWY ${runwayDesignation(flight.runway)} · EXIT ${flight.runwayExit.taxiwayName}`
    : null;
  button.dataset.flightChip = String(flight.id);
  button.className = ['flight-chip', focusedFlightId === flight.id ? 'flight-chip--selected' : '', held ? 'flight-chip--hold' : '', flight.emergency ? 'flight-chip--emergency' : '', fuel < 15 ? 'flight-chip--low-fuel' : ''].filter(Boolean).join(' ');
  button.style.setProperty('--flight-accent', flight.palette === 'rose' ? 'var(--rose)' : flight.palette === 'sage' ? '#9bc8a0' : 'var(--blue)');
  button.style.setProperty('--fuel', `${fuel.toFixed(1)}%`);
  const holdDetail = flight.automaticHoldReason ?? flight.safetyHoldReason;
  const trafficClass = flight.operationPlan.trafficClass === 'general-aviation'
    ? 'GA'
    : flight.operationPlan.trafficClass.charAt(0).toUpperCase() + flight.operationPlan.trafficClass.slice(1);
  button.setAttribute('aria-label', `${flight.callsign}, ${flight.aircraft}, ${trafficClass} traffic, ${phase}${holdDetail ? `, ${holdDetail}` : ''}${gateDisplay ? `, ${gateDisplay}` : ''}${gateTime ? `, ${gateTime}` : ''}, fuel ${fuel.toFixed(0)} percent, ${speedLabel} ${speed.toFixed(0)} knots, altitude ${altitude} feet`);
  button.title = [`${routeDisplay} · ${flight.flightPlan.route.join(' · ')} · ${flight.flightPlan.procedure}`, assignment?.rationale.join(' · '), flight.phase === 'resting' ? turnaroundLongSummary(flight) : ''].filter(Boolean).join(' · ');
  const identity = button.querySelector('.flight-chip__identity')!;
  identity.querySelector('strong')!.textContent = flight.callsign;
  identity.querySelector('span')!.textContent = phase;
  const metrics = button.querySelectorAll<HTMLElement>('.flight-chip__metric');
  metrics[0].querySelector('b')!.innerHTML = `${fuel.toFixed(0)}<em>%</em>`;
  metrics[1].querySelector('small')!.textContent = speedLabel;
  metrics[1].querySelector('b')!.innerHTML = `${Math.round(speed)}<em>KT</em>`;
  metrics[2].querySelector('b')!.innerHTML = `${altitude.toLocaleString()}<em>FT</em>`;
  const detail = button.querySelector('.flight-chip__detail')!;
  detail.children[0].textContent = `${routeDisplay} · ${flight.aircraft} · ${trafficClass} · ${operation} · ${runwayExitDisplay ?? gateDisplay ?? `RWY ${runwayDesignation(flight.runway)}`}${runwayExitDisplay && gateDisplay ? ` · ${gateDisplay}` : ''}${gateTime ? ` · ${gateTime}` : ''}`;
  detail.children[1].textContent = held && holdDetail
    ? `HOLD · ${holdDetail.toUpperCase()}`
    : deicingChipSummary(flight)
      ?? (flight.phase === 'resting'
        ? turnaroundChipSummary(flight)
        : `${surface ? flight.engineState.toUpperCase() + ' ENGINES · ' : ''}${verticalText} · ${motionText}`);
}

function formatPhase(phase: FlightPhase): string {
  return phase.replace('-', ' ');
}

function flightOperationLabel(flight: Flight): string {
  if (flight.emergency === 'disabled') {
    const recovery = displayState().surfaceDisruptions.find((disruption) => disruption.flightId === flight.id);
    return recovery?.status === 'recovering' ? `Recovery ${Math.round(recovery.recoveryProgress * 100)}%` : 'Disabled · awaiting recovery';
  }
  if (flight.surfaceReroute?.status === 'holding') return 'Route unavailable';
  if (flight.goAround) return flight.motion.stage === 'go-around-reentry' ? 'Rejoining arrival' : 'Go around';
  if (flight.phase === 'resting') {
    if (flight.turnaround.status !== 'ready') return `Turnaround ${Math.round(flight.turnaround.progress * 100)}%`;
    if (flight.deicing.status === 'unavailable') return 'Winter route unavailable';
    return flight.pushbackCleared ? 'Push cleared' : flight.deicing.status === 'planned' ? 'Ready · deice planned' : 'Ready push';
  }
  if (flight.phase === 'taxi-out' && flight.tugAttached) return `Pushback ${flight.pushbackDirection}`;
  if (flight.phase === 'taxi-out' && flight.deicing.required) {
    if (flight.deicing.status === 'enroute') return 'Taxi to deice';
    if (flight.deicing.status === 'queued') return `Deice queue ${flight.deicing.queuePosition || ''}`.trim();
    if (flight.deicing.status === 'positioning') return 'Entering deice';
    if (flight.deicing.status === 'treating') return `Deicing ${Math.round(flight.deicing.treatmentElapsedSeconds / Math.max(0.1, flight.deicing.treatmentDurationSeconds) * 100)}%`;
    if (flight.deicing.status === 'protected') return `Deiced · ${Math.ceil(flight.deicing.holdoverRemainingSeconds)}s`;
    if (flight.deicing.status === 'expired') return 'Deice expired';
    if (flight.deicing.status === 'unavailable') return 'Winter route unavailable';
  }
  return formatPhase(flight.phase);
}

function deicingChipSummary(flight: Flight): string | null {
  const deicing = flight.deicing;
  if (!deicing.required) return null;
  if (deicing.status === 'planned') return `${deicing.facilityName} · LANE ${deicing.laneNumber} PLANNED`;
  if (deicing.status === 'enroute') return `${deicing.facilityName} · TAXI TO LANE ${deicing.laneNumber}`;
  if (deicing.status === 'queued') return `${deicing.facilityName} · QUEUE ${deicing.queuePosition}`;
  if (deicing.status === 'positioning') return `${deicing.facilityName} · ENTERING LANE ${deicing.laneNumber}`;
  if (deicing.status === 'treating') return `${deicing.fluid.toUpperCase()} · ${Math.round(deicing.treatmentElapsedSeconds / Math.max(0.1, deicing.treatmentDurationSeconds) * 100)}%`;
  if (deicing.status === 'protected') return `HOLDOVER ${Math.ceil(deicing.holdoverRemainingSeconds)} SEC · CYCLE ${deicing.cycle}`;
  if (deicing.status === 'expired') return 'HOLDOVER EXPIRED · RETURN TO PAD';
  return deicing.reason.toUpperCase();
}

const TURNAROUND_SHORT_LABEL: Record<TurnaroundServiceType, string> = {
  fueling: 'fuel',
  baggage: 'bags',
  cargo: 'cargo',
  catering: 'catering',
  cleaning: 'cleaning',
  boarding: 'boarding',
  maintenance: 'maintenance',
};

function turnaroundChipSummary(flight: Flight): string {
  const turnaround = flight.turnaround;
  if (turnaround.status === 'ready') return serviceVehiclesBlockingPush(flight.id).length ? 'RAMP EQUIPMENT CLEARING' : 'ALL SERVICES COMPLETE';
  if (turnaround.status === 'released') return 'TURNAROUND RELEASED';
  if (turnaround.status === 'planned') return 'SERVICES PLANNED';
  const active = turnaround.tasks.filter((task) => task.status === 'active');
  const waiting = turnaround.tasks.filter((task) => task.status === 'waiting');
  const labels = active.slice(0, 2).map((task) => (
    `${TURNAROUND_SHORT_LABEL[task.type]} ${Math.round(task.elapsedSeconds / Math.max(0.1, task.durationSeconds) * 100)}%`
  ));
  if (active.length > 2) labels.push(`+${active.length - 2}`);
  if (!labels.length && waiting.length) labels.push(`${TURNAROUND_SHORT_LABEL[waiting[0].type]} waiting`);
  return labels.join(' · ').toUpperCase();
}

function serviceVehiclesForFlight(flightId: number) {
  return displayState().serviceVehicles.filter((vehicle) => vehicle.flightId === flightId);
}

function serviceVehiclesBlockingPush(flightId: number) {
  return serviceVehiclesForFlight(flightId).filter((vehicle) => vehicle.status === 'approaching' || vehicle.status === 'servicing' || vehicle.status === 'clearing');
}

function serviceVehicleStatusLabel(status: (typeof simulation.state.serviceVehicles)[number]['status']): string {
  if (status === 'dispatching') return 'en route';
  if (status === 'approaching') return 'parking';
  if (status === 'servicing') return 'working';
  if (status === 'clearing') return 'clearing';
  if (status === 'returning') return 'returning';
  return status;
}

function turnaroundLongSummary(flight: Flight): string {
  const required = flight.turnaround.tasks.filter((task) => task.required);
  return required.map((task) => `${task.label}: ${task.status}`).join(' · ');
}

function clearFlightFocus(statusText?: string, detail?: string): void {
  focusedFlightId = null;
  world.selectFlight(null);
  renderFlightStrip();
  renderFlightActions();
  if (statusText && detail) setStatus(statusText, detail);
}

function selectFlightFromMap(clientX: number, clientY: number): void {
  const flightId = world.pickFlight(clientX, clientY);
  if (flightId === null || focusedFlightId === flightId) {
    clearFlightFocus('Camera released', 'free map view restored');
    return;
  }
  const flight = displayState().flights.find((item) => item.id === flightId);
  if (!flight) return;
  focusedFlightId = flightId;
  world.selectFlight(flightId);
  renderFlightStrip();
  renderFlightActions();
  setStatus(`${flight.callsign} tracked`, `${flight.aircraft} · ${formatPhase(flight.phase)} · runway ${runwayDesignation(flight.runway)}`);
}

function setFlightStripCollapsed(collapsed: boolean): void {
  flightStrip.classList.toggle('flight-strip--collapsed', collapsed);
  flightStripToggle.setAttribute('aria-expanded', String(!collapsed));
  flightStripToggle.querySelector('i')!.textContent = collapsed ? '+' : '−';
}

function setRunwayLabelsVisible(visible: boolean): void {
  runwayLabelsVisible = visible;
  runwayLabelButton.setAttribute('aria-pressed', String(visible));
  runwayLabelButton.classList.toggle('control--active', visible);
  runwayLabelLabel.textContent = visible ? 'Labels on' : 'Labels off';
  world.setRunwayLabelsVisible(visible);
}

function setSurfaceLayerVisible(layer: SurfaceLayer, visible: boolean): void {
  surfaceLayerVisibility[layer] = visible;
  const control = surfaceLayerControls.find((item) => item.dataset.surfaceLayer === layer);
  if (control) control.checked = visible;
  world.setSurfaceLayerVisible(layer, visible);
}

function setAirspaceLayerVisible(layer: AirspaceLayer, visible: boolean): void {
  airspaceLayerVisibility[layer] = visible;
  const control = airspaceLayerControls.find((item) => item.dataset.airspaceLayer === layer);
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
}

function updateSurfaceDisruptionTargets(): void {
  updateSurfaceDisruptionTargetOptions(config, surfaceDisruptionKind, surfaceDisruptionTarget);
}

function renderSurfaceDisruptionControls(): void {
  const disruptions = displayState().surfaceDisruptions;
  const panelState = {
    airportCode: config.code,
    elapsed: displayState().elapsed,
    station: simulation.state.station,
    replayMode,
    disruptions,
    canRecover: simulation.canIssue('ground'),
  };
  const key = surfaceDisruptionPanelKey(panelState, surfaceDisruptionKind.value);
  if (surfaceDisruptionUiKey === key) return;
  surfaceDisruptionUiKey = key;
  renderSurfaceDisruptionPanel({
    kind: surfaceDisruptionKind,
    target: surfaceDisruptionTarget,
    duration: surfaceDisruptionDuration,
    apply: surfaceDisruptionApply,
    list: surfaceDisruptionList,
  }, panelState);
}

function updateMapOrientation(): void {
  const metrics = world.mapMetrics();
  mapNorthArrow.style.transform = `rotate(${metrics.northDegrees.toFixed(2)}deg)`;
  for (const point of mapOrientation.querySelectorAll<HTMLElement>('[data-bearing]')) {
    const angle = ((Number(point.dataset.bearing) + metrics.northDegrees - 90) * Math.PI) / 180;
    point.style.left = `${29 + Math.cos(angle) * 22}px`;
    point.style.top = `${29 + Math.sin(angle) * 22}px`;
    point.style.right = 'auto';
    point.style.bottom = 'auto';
    point.style.transform = 'translate(-50%, -50%)';
  }
  mapScaleBar.style.width = `${metrics.scalePixels.toFixed(1)}px`;
  mapScaleLabel.textContent = metrics.scaleMeters >= 1_000
    ? `${Number((metrics.scaleMeters / 1_000).toFixed(1))} km`
    : `${metrics.scaleMeters} m`;
}

function drawRadar(state: typeof simulation.state): void {
  drawRadarInset({ canvas: radarScope, rangeLabel: radarRange, config, state, focusedFlightId });
}

function renderFlightActions(): void {
  const flight = focusedFlightId === null ? null : displayState().flights.find((item) => item.id === focusedFlightId);
  const renderKey = flight
    ? [
        flight.id,
        flight.callsign,
        flight.phase,
        flight.cleared,
        flight.goAround ? flight.motion.stage : 'normal-approach',
        flight.progress >= 0.999,
        flight.progress >= 0.985,
        flight.pushbackCleared,
        flight.pushbackDirection,
        flight.turnaround.status,
        Math.floor(flight.turnaround.progress * 20),
        flight.turnaround.tasks.map((task) => task.status).join(','),
        flight.deicing.status,
        Math.floor(flight.deicing.treatmentElapsedSeconds),
        Math.ceil(flight.deicing.holdoverRemainingSeconds),
        serviceVehiclesForFlight(flight.id)
          .map((vehicle) => `${vehicle.id}:${vehicle.status}:${vehicle.held}`)
          .join(','),
        flight.controlHold,
        flight.crossingHoldRunway ?? 'none',
        flight.runwayEntryCleared,
        flight.takeoffCleared,
        flight.runwayExit?.nodeId ?? 'no-exit',
        flight.runwayExit?.brakingAction ?? 'no-braking-plan',
        flight.runwayExit?.stoppingMarginM ?? 0,
        flight.runwayExit?.routeDistanceM ?? 0,
        flight.surfaceReroute?.revision ?? 0,
        flight.surfaceReroute?.status ?? 'no-reroute',
        flight.emergency ?? 'no-emergency',
        flight.navigation.procedureId,
        flight.navigation.transitionId,
        flight.navigation.approachCleared,
        flight.navigation.assignedHeadingDegrees ?? 'no-heading',
        flight.navigation.assignedAltitudeFt ?? 'no-altitude',
        flight.navigation.assignedSpeedKts ?? 'no-speed',
        flight.navigation.hold?.cycle ?? 'no-hold',
        flight.navigation.frequencyOwner,
        displayState().surfaceDisruptions.find((disruption) => disruption.flightId === flight.id)?.status ?? 'no-recovery',
        Math.floor((displayState().surfaceDisruptions.find((disruption) => disruption.flightId === flight.id)?.recoveryProgress ?? 0) * 20),
        simulation.state.station,
        replayMode,
      ].join('|')
    : `none|${simulation.state.station}|${replayMode}`;
  if (flightActionsRenderKey === renderKey) {
    flightActions.hidden = !flight;
    return;
  }
  flightActionsRenderKey = renderKey;
  flightActions.replaceChildren();
  flightActions.hidden = !flight;
  if (!flight) return;
  const heading = document.createElement('header');
  heading.innerHTML = '<div><b></b><small></small></div><span></span>';
  heading.querySelector('b')!.textContent = flight.callsign;
  const standLabel = flight.gateAssignment?.gateRef
    ? `Gate ${flight.gateAssignment.gateRef}`
    : flight.gateAssignment?.zoneName?.replace(/ Ramp$/i, '');
  heading.querySelector('small')!.textContent = `${flight.aircraft} · ${flight.origin} → ${flight.destination}${standLabel ? ` · ${standLabel}` : ''}`;
  heading.querySelector('span')!.textContent = simulation.state.station.toUpperCase();
  flightActions.append(heading);
  if (flight.phase === 'approach' || flight.phase === 'landing' || flight.phase === 'takeoff') {
    flightActions.append(createNavigationPanel(flight));
  }
  if (flight.runwayExit && (flight.phase === 'approach' || flight.phase === 'landing' || flight.phase === 'taxi-in')) {
    flightActions.append(createRunwayExitPanel(flight));
  }
  if (flight.surfaceReroute || flight.emergency === 'disabled') flightActions.append(createSurfaceReroutePanel(flight));
  if (flight.phase === 'resting') flightActions.append(createTurnaroundPanel(flight));
  if (flight.deicing.required) flightActions.append(createDeicingPanel(flight));
  const controls = document.createElement('div');
  controls.className = 'flight-actions__buttons';
  const add = (action: string, label: string, disabled = false, runway?: number): void => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.flightAction = action;
    if (runway !== undefined) button.dataset.runway = String(runway);
    button.textContent = label;
    button.disabled = disabled || replayMode;
    controls.append(button);
  };
  const ground = flight.phase === 'taxi-in' || flight.phase === 'taxi-out';
  const ownsFlight = simulation.state.station === 'supervisor' || flight.navigation.frequencyOwner === simulation.state.station;
  const recovery = displayState().surfaceDisruptions.find((disruption) => disruption.flightId === flight.id);
  const airborne = flight.phase === 'approach' || (flight.phase === 'takeoff' && !flight.motion.onGround);
  if (airborne) {
    if (flight.phase === 'approach' && !flight.navigation.approachCleared && !flight.navigation.hold && !flight.goAround) add('approach-clear', 'Clear approach', !simulation.canIssue('approach') || !ownsFlight);
    if (flight.navigation.hold) add('air-hold-release', 'Release hold', !simulation.canIssue('approach') || !ownsFlight);
    else if (flight.phase === 'approach' && !flight.goAround && flight.progress < 0.68) add('air-hold', 'Enter hold', !simulation.canIssue('approach') || !ownsFlight);
    if (!flight.navigation.hold && !flight.goAround) {
      add('heading-left', 'HDG −15°', !simulation.canIssue('approach') || !ownsFlight);
      add('heading-right', 'HDG +15°', !simulation.canIssue('approach') || !ownsFlight);
      add('speed-down', 'SPD −10', !simulation.canIssue('approach') || !ownsFlight);
      add('speed-up', 'SPD +10', !simulation.canIssue('approach') || !ownsFlight);
      add('altitude-down', 'ALT −500', !simulation.canIssue('approach') || !ownsFlight);
      add('altitude-up', 'ALT +500', !simulation.canIssue('approach') || !ownsFlight);
      const nextFix = flight.navigation.routeFixIds[Math.min(flight.navigation.activeFixIndex + 1, flight.navigation.routeFixIds.length - 1)];
      if (nextFix && flight.phase === 'approach' && flight.progress < 0.72) add('direct-next', `Direct ${nextFix.split('-').slice(-2).join(' ')}`, !simulation.canIssue('approach') || !ownsFlight);
    }
  }
  const handoffTarget = suggestedHandoffStation(flight);
  if (handoffTarget && flight.phase !== 'resting') add('handoff', `Contact ${handoffTarget}`, !ownsFlight);
  if (flight.phase === 'approach' && !flight.cleared && !flight.goAround) add('clear', `Land ${runwayDesignation(flight.runway)}`, !simulation.canIssue('tower') || !ownsFlight);
  if ((flight.phase === 'approach' || flight.phase === 'landing') && !flight.goAround) add('go-around', 'Go around', (!simulation.canIssue('approach') && !simulation.canIssue('tower')) || !ownsFlight);
  if (flight.phase === 'resting' && flight.turnaround.status === 'ready' && !flight.pushbackCleared && !serviceVehiclesBlockingPush(flight.id).length) add('pushback', `Push ${flight.pushbackDirection}`, !simulation.canIssue('ramp') || !ownsFlight || flight.deicing.status === 'unavailable');
  if (flight.emergency === 'disabled' && recovery?.status !== 'recovering') add('recover', 'Dispatch recovery', !simulation.canIssue('ground') || !ownsFlight);
  const surfaceAuthority = requiredControllerStation(flight) === 'ramp' ? 'ramp' : 'ground';
  if (ground && flight.emergency !== 'disabled') add('hold-toggle', flight.controlHold ? 'Resume taxi' : 'Hold position', !simulation.canIssue(surfaceAuthority) || !ownsFlight);
  for (const runway of flight.crossingHoldRunway === undefined ? [] : [flight.crossingHoldRunway]) {
    add('cross', `Cross ${runwayDesignation(runway)}`, !simulation.canIssue('ground') || !ownsFlight, runway);
  }
  if (flight.phase === 'taxi-out' && flight.progress >= 0.985 && !flight.runwayEntryCleared) {
    const winterProtected = simulation.state.weather.condition !== 'snow'
      || (flight.deicing.status === 'protected' && flight.deicing.holdoverRemainingSeconds > 0);
    add('entry', winterProtected ? `Line up ${runwayDesignation(flight.runway)}` : 'Await deicing', !simulation.canIssue('tower') || !ownsFlight || !winterProtected);
  }
  if (flight.phase === 'takeoff' && !flight.takeoffCleared) add('takeoff', `Take off ${runwayDesignation(flight.runway)}`, !simulation.canIssue('tower') || !ownsFlight);
  if (flight.phase !== 'resting' && flight.emergency !== 'disabled') {
    const paceAuthority = ground ? simulation.canIssue(surfaceAuthority) : simulation.canIssue('approach');
    add('slow', 'Slow', !paceAuthority || !ownsFlight);
    add('normal', 'Normal', !paceAuthority || !ownsFlight);
    if (!ground) add('expedite', 'Expedite', !paceAuthority || !ownsFlight);
  }
  flightActions.append(controls);
  if (!controls.children.length) {
    const note = document.createElement('p');
    const blocking = flight.turnaround.tasks.filter((task) => task.required && task.status !== 'complete').map((task) => task.label.toLowerCase());
    const rampBlockers = serviceVehiclesBlockingPush(flight.id).map((vehicle) => vehicle.label.toLowerCase());
    note.textContent = replayMode
      ? 'Replay is read-only.'
      : flight.phase === 'resting' && blocking.length
        ? `Pushback waits for ${blocking.join(', ')}.`
        : flight.phase === 'resting' && rampBlockers.length ? `Pushback waits for ${rampBlockers.join(', ')} to clear the stand.` : 'No clearance required at this point.';
    flightActions.append(note);
  }
}

function createNavigationPanel(flight: Flight): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'navigation-panel';
  panel.setAttribute('aria-label', `${flight.callsign} terminal procedure and controller assignments`);
  const heading = document.createElement('div');
  heading.className = 'navigation-panel__heading';
  const title = document.createElement('b');
  title.textContent = flight.flightPlan.procedureProfile.kind === 'STAR'
    ? flight.flightPlan.procedureProfile.transitionName.replace(/ TRANSITION$/, '')
    : flight.procedure;
  const badge = document.createElement('span');
  badge.textContent = `${flight.navigation.frequencyOwner.toUpperCase()} · ${flight.navigation.handoffStatus.toUpperCase()}`;
  heading.append(title, badge);
  const assignments = [
    flight.navigation.assignedHeadingDegrees === undefined ? null : `HDG ${String(Math.round(flight.navigation.assignedHeadingDegrees)).padStart(3, '0')}`,
    flight.navigation.assignedAltitudeFt === undefined ? null : `${flight.navigation.assignedAltitudeFt.toLocaleString()} FT`,
    flight.navigation.assignedSpeedKts === undefined ? null : `${flight.navigation.assignedSpeedKts} KT`,
  ].filter(Boolean);
  const metrics = document.createElement('p');
  metrics.textContent = flight.navigation.hold
    ? `HOLD ${flight.navigation.hold.patternId} · EFC ${Math.max(0, Math.ceil(flight.navigation.hold.expectFurtherClearanceAtSeconds - displayState().elapsed))} SEC`
    : assignments.length
      ? assignments.join(' · ')
      : `${flight.flightPlan.procedureProfile.kind} · ${flight.flightPlan.procedureProfile.routeFixIds.length} FIXES · ${flight.navigation.approachCleared ? 'APPROACH CLEARED' : 'PROCEDURE ACTIVE'}`;
  const nextFixId = flight.navigation.routeFixIds[Math.min(flight.navigation.activeFixIndex, flight.navigation.routeFixIds.length - 1)];
  const nextFix = config.airspaceProgram.fixes.find((fix) => fix.id === nextFixId);
  const detail = document.createElement('small');
  detail.textContent = nextFix ? `Next ${nextFix.name} · ${nextFix.altitudeFt.toLocaleString()} ft · non-navigational schematic` : 'Procedure complete · non-navigational schematic';
  panel.append(heading, metrics, detail);
  return panel;
}

function createRunwayExitPanel(flight: Flight): HTMLElement {
  const exit = flight.runwayExit!;
  const panel = document.createElement('section');
  panel.className = 'runway-exit-panel';
  panel.setAttribute('aria-label', `Runway ${runwayDesignation(flight.runway)} exit ${exit.taxiwayName}, ${Math.round(exit.stoppingMarginM)} meter stopping margin`);
  const heading = document.createElement('div');
  heading.className = 'runway-exit-panel__heading';
  const title = document.createElement('b');
  title.textContent = `RWY ${runwayDesignation(flight.runway)} → ${exit.taxiwayName}`;
  const badge = document.createElement('span');
  badge.textContent = `${exit.highSpeed ? 'Rapid' : 'Standard'} · ${exit.brakingAction}`;
  heading.append(title, badge);
  const metrics = document.createElement('p');
  metrics.textContent = `${Math.round(exit.targetExitSpeedKts)} KT EXIT · ${Math.round(exit.stoppingMarginM)} M MARGIN · ${(exit.routeDistanceM / 1_000).toFixed(1)} KM TO STAND`;
  const rationale = document.createElement('small');
  rationale.textContent = exit.rationale[0] ?? 'Pavement-connected arrival route';
  panel.append(heading, metrics, rationale);
  return panel;
}

function createSurfaceReroutePanel(flight: Flight): HTMLElement {
  const disruption = displayState().surfaceDisruptions.find((candidate) => candidate.flightId === flight.id);
  const reroute = flight.surfaceReroute;
  const panel = document.createElement('section');
  panel.className = 'runway-exit-panel surface-reroute-panel';
  const heading = document.createElement('div');
  heading.className = 'runway-exit-panel__heading';
  const title = document.createElement('b');
  const badge = document.createElement('span');
  if (disruption?.kind === 'disabled-aircraft') {
    title.textContent = 'Disabled aircraft recovery';
    badge.textContent = disruption.status === 'recovering' ? `${Math.round(disruption.recoveryProgress * 100)}%` : 'Awaiting dispatch';
  } else {
    title.textContent = reroute?.status === 'holding' ? 'Pavement route unavailable' : `Surface route · revision ${reroute?.revision ?? 0}`;
    badge.textContent = reroute?.status ?? 'planned';
  }
  heading.append(title, badge);
  const metrics = document.createElement('p');
  metrics.textContent = disruption?.kind === 'disabled-aircraft'
    ? `${disruption.label.toUpperCase()} · ${Math.max(0, Math.ceil((disruption.expectedClearAtSeconds ?? displayState().elapsed) - displayState().elapsed))} SEC`
    : `${(reroute?.addedDistanceM ?? 0) >= 0 ? '+' : ''}${Math.round(reroute?.addedDistanceM ?? 0)} M · ${(reroute?.routeEdgeIds.length ?? 0)} SEGMENTS`;
  const reason = document.createElement('small');
  reason.textContent = disruption?.reason ?? reroute?.reason ?? 'Pavement routing available';
  panel.append(heading, metrics, reason);
  return panel;
}

function createTurnaroundPanel(flight: Flight): HTMLElement {
  const turnaround = flight.turnaround;
  const panel = document.createElement('section');
  panel.className = 'turnaround-panel';
  panel.setAttribute('aria-label', `Turnaround ${Math.round(turnaround.progress * 100)} percent complete`);
  const summary = document.createElement('div');
  summary.className = 'turnaround-panel__summary';
  const title = document.createElement('b');
  title.textContent = `Turnaround ${Math.round(turnaround.progress * 100)}%`;
  const status = document.createElement('span');
  status.textContent = turnaround.status === 'servicing' ? 'IN SERVICE' : turnaround.status.toUpperCase();
  summary.append(title, status);
  const progress = document.createElement('i');
  progress.className = 'turnaround-panel__progress';
  progress.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('i');
  fill.style.width = `${(turnaround.progress * 100).toFixed(1)}%`;
  progress.append(fill);
  const tasks = document.createElement('ul');
  tasks.className = 'turnaround-panel__tasks';
  const vehicles = serviceVehiclesForFlight(flight.id);
  for (const task of turnaround.tasks.filter((candidate) => candidate.required)) {
    const item = document.createElement('li');
    item.dataset.status = task.status;
    const label = document.createElement('span');
    label.textContent = task.label;
    const taskStatus = document.createElement('em');
    const taskProgress = task.durationSeconds <= 0 ? 1 : task.elapsedSeconds / task.durationSeconds;
    const vehicle = vehicles.find((candidate) => candidate.service === task.type);
    taskStatus.textContent = task.status === 'active' ? `${Math.round(taskProgress * 100)}%` : task.status === 'waiting' && vehicle ? `${vehicle.held ? 'hold' : serviceVehicleStatusLabel(vehicle.status)}` : task.status;
    item.title = vehicle ? `${vehicle.label} · ${serviceVehicleStatusLabel(vehicle.status)}${vehicle.holdReason ? ` · ${vehicle.holdReason}` : ''}` : task.reason;
    item.append(label, taskStatus);
    tasks.append(item);
  }
  panel.append(summary, progress, tasks);
  return panel;
}

function createDeicingPanel(flight: Flight): HTMLElement {
  const deicing = flight.deicing;
  const panel = document.createElement('section');
  panel.className = 'turnaround-panel deicing-panel';
  panel.setAttribute('aria-label', `Deicing ${deicing.status}`);
  const summary = document.createElement('div');
  summary.className = 'turnaround-panel__summary';
  const title = document.createElement('b');
  title.textContent = deicing.facilityName ?? 'Winter treatment';
  const status = document.createElement('span');
  status.textContent = deicing.status.replace('-', ' ').toUpperCase();
  summary.append(title, status);
  const progress = document.createElement('i');
  progress.className = 'turnaround-panel__progress';
  progress.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('i');
  const amount = deicing.status === 'protected'
    ? deicing.holdoverRemainingSeconds / Math.max(1, deicing.holdoverSeconds)
    : deicing.treatmentElapsedSeconds / Math.max(1, deicing.treatmentDurationSeconds);
  fill.style.width = `${Math.max(0, Math.min(100, amount * 100)).toFixed(1)}%`;
  progress.append(fill);
  const detail = document.createElement('p');
  detail.className = 'deicing-panel__detail';
  const lane = deicing.laneNumber ? `Lane ${deicing.laneNumber}` : 'No lane';
  const queue = deicing.queuePosition ? ` · queue ${deicing.queuePosition}` : '';
  const holdover = deicing.status === 'protected' ? ` · ${Math.ceil(deicing.holdoverRemainingSeconds)} s holdover` : '';
  detail.textContent = `${lane}${queue} · ${deicing.fluid}${holdover} · cycle ${deicing.cycle || 1}`;
  detail.title = deicing.reason;
  panel.append(summary, progress, detail);
  return panel;
}

function renderClearanceAdvisor(): void {
  clearanceAdvisor.hidden = simulation.state.mode !== 'assisted' || replayMode;
  if (clearanceAdvisor.hidden) return;
  const authority = (proposal: ClearanceProposal): boolean => {
    if (simulation.state.station === 'supervisor') return true;
    return proposal.station !== 'supervisor' && simulation.canIssue(proposal.station);
  };
  const available = simulation.clearanceProposals().filter((proposal) => {
    if (!authority(proposal)) return false;
    const flight = simulation.state.flights.find((candidate) => candidate.id === proposal.flightId);
    return simulation.state.station === 'supervisor' || flight?.navigation.frequencyOwner === simulation.state.station;
  });
  const proposal = available.find((item) => item.flightId === focusedFlightId) ?? available[0];
  if (!proposal) {
    clearanceAdvisorHeader.hidden = true;
    delete clearanceAdvisorButton.dataset.proposalId;
    clearanceAdvisorReason.textContent = 'Advisor monitoring · no clearance needs approval';
    clearanceAdvisorReason.style.marginTop = '0';
    clearanceAdvisor.dataset.priority = 'quiet';
    return;
  }
  const flight = simulation.state.flights.find((item) => item.id === proposal.flightId);
  clearanceAdvisorHeader.hidden = false;
  clearanceAdvisorTitle.textContent = `${proposal.priority === 'urgent' ? 'Priority · ' : ''}${flight?.callsign ?? `Flight ${proposal.flightId}`}`;
  clearanceAdvisorStation.textContent = `${proposal.station.toUpperCase()} PROPOSAL`;
  clearanceAdvisorButton.dataset.proposalId = proposal.id;
  clearanceAdvisorButton.textContent = proposal.label;
  clearanceAdvisorReason.textContent = proposal.reason;
  clearanceAdvisorReason.style.removeProperty('margin-top');
  clearanceAdvisor.dataset.priority = proposal.priority;
}

function applyClearanceProposal(proposal: ClearanceProposal): void {
  focusedFlightId = proposal.flightId;
  world.selectFlight(proposal.flightId);
  let result: AirportControlResult;
  if (proposal.action === 'land') result = executeAirportRequest({ action: 'clearFlight', flightId: proposal.flightId, runway: proposal.runway! });
  else if (proposal.action === 'go-around') result = executeAirportRequest({ action: 'triggerEmergency', flightId: proposal.flightId, type: 'go-around' });
  else if (proposal.action === 'pushback') result = executeAirportRequest({ action: 'clearPushback', flightId: proposal.flightId });
  else if (proposal.action === 'cross') result = executeAirportRequest({ action: 'clearRunwayCrossing', flightId: proposal.flightId, runway: proposal.runway! });
  else if (proposal.action === 'line-up') result = executeAirportRequest({ action: 'clearRunwayEntry', flightId: proposal.flightId });
  else if (proposal.action === 'takeoff') result = executeAirportRequest({ action: 'clearTakeoff', flightId: proposal.flightId });
  else result = executeAirportRequest({ action: 'controlFlights', flightIds: [proposal.flightId], instruction: 'resume' });
  setStatus(result.accepted ? `${proposal.label} approved` : 'Proposal rejected', result.reason);
  renderFlightStrip();
}

function suggestedHandoffStation(flight: Flight): ControllerStation | null {
  const owner = flight.navigation.frequencyOwner;
  if (owner === 'supervisor') return null;
  const required = requiredControllerStation(flight);
  if (required !== owner) return required;
  if (owner === 'approach' && flight.phase === 'approach' && flight.progress >= 0.56) return 'tower';
  if (owner === 'tower' && (flight.phase === 'landing' || (flight.phase === 'taxi-in' && flight.progress >= 0.08))) return 'ground';
  if (owner === 'ground' && flight.phase === 'taxi-in' && (flight.progress >= 0.72 || Boolean(flight.rampControlZoneId))) return 'ramp';
  if (owner === 'ramp' && flight.phase === 'taxi-out' && !flight.tugAttached && flight.progress >= Math.max(0.025, flight.pushbackReleaseProgress)) return 'ground';
  if (owner === 'ground' && flight.phase === 'taxi-out' && flight.progress >= 0.94) return 'tower';
  if (owner === 'tower' && flight.phase === 'takeoff' && !flight.motion.onGround) return 'approach';
  return null;
}

function handleFlightAction(flightId: number, action: string, runwayValue?: string): void {
  if (replayMode) {
    setStatus('Replay is read-only', 'return to Live before issuing a clearance');
    return;
  }
  const flight = simulation.state.flights.find((item) => item.id === flightId);
  if (!flight) return;
  if (action === 'clear') executeAirportRequest({ action: 'clearFlight', flightId, runway: flight.runway });
  if (action === 'go-around') executeAirportRequest({ action: 'triggerEmergency', flightId, type: 'go-around' });
  if (action === 'pushback') executeAirportRequest({ action: 'clearPushback', flightId });
  if (action === 'entry') executeAirportRequest({ action: 'clearRunwayEntry', flightId });
  if (action === 'takeoff') executeAirportRequest({ action: 'clearTakeoff', flightId });
  if (action === 'cross') executeAirportRequest({ action: 'clearRunwayCrossing', flightId, runway: Number(runwayValue) });
  if (action === 'recover') executeAirportRequest({ action: 'recoverDisabledAircraft', flightId });
  if (action === 'hold-toggle') executeAirportRequest({ action: 'controlFlights', flightIds: [flightId], instruction: flight.controlHold ? 'resume' : 'hold' });
  if (action === 'approach-clear') executeAirportRequest({ action: 'clearApproach', flightId });
  if (action === 'air-hold') executeAirportRequest({ action: 'holdFlight', flightId, efcMinutes: 4 });
  if (action === 'air-hold-release') executeAirportRequest({ action: 'releaseHold', flightId });
  if (action === 'heading-left' || action === 'heading-right') {
    const current = mathAngleToAviationDegrees(flight.motion.heading);
    executeAirportRequest({ action: 'assignHeading', flightId, headingDegrees: current + (action === 'heading-left' ? -15 : 15) });
  }
  if (action === 'speed-down' || action === 'speed-up') {
    const current = flight.navigation.assignedSpeedKts ?? flight.kinematics.airspeedKts;
    executeAirportRequest({ action: 'assignAirspeed', flightId, speedKts: current + (action === 'speed-down' ? -10 : 10) });
  }
  if (action === 'altitude-down' || action === 'altitude-up') {
    const current = flight.navigation.assignedAltitudeFt ?? flight.kinematics.altitudeFt;
    executeAirportRequest({ action: 'assignAltitude', flightId, altitudeFt: current + (action === 'altitude-down' ? -500 : 500) });
  }
  if (action === 'direct-next') {
    const fixId = flight.navigation.routeFixIds[Math.min(flight.navigation.activeFixIndex + 1, flight.navigation.routeFixIds.length - 1)];
    if (fixId) executeAirportRequest({ action: 'directTo', flightId, fixId });
  }
  if (action === 'handoff') {
    const station = suggestedHandoffStation(flight);
    if (station) executeAirportRequest({ action: 'handoffFlight', flightId, station });
  }
  if (action === 'slow' || action === 'normal' || action === 'expedite') executeAirportRequest({ action: 'controlFlights', flightIds: [flightId], instruction: action });
  renderFlightStrip();
  renderFlightActions();
}

telemetryControls.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action][data-flight]');
  if (!button) return;
  const flightId = Number(button.dataset.flight);
  if (button.dataset.action === 'pushback') executeAirportCommand({ action: 'clearPushback', flightId });
  if (button.dataset.action === 'entry') executeAirportCommand({ action: 'clearRunwayEntry', flightId });
  if (button.dataset.action === 'takeoff') executeAirportCommand({ action: 'clearTakeoff', flightId });
  if (button.dataset.action === 'cross') executeAirportCommand({ action: 'clearRunwayCrossing', flightId, runway: Number(button.dataset.runway) });
  if (button.dataset.action === 'clear') {
    const flight = simulation.state.flights.find((item) => item.id === flightId);
    if (flight) executeAirportCommand({ action: 'clearFlight', flightId, runway: flight.runway });
  }
  if (button.dataset.action === 'focus') executeAirportCommand({ action: 'focusFlight', flightId });
  if (button.dataset.action === 'go-around') executeAirportCommand({ action: 'triggerEmergency', flightId, type: 'go-around' });
  if (button.dataset.action === 'emergency') executeAirportCommand({ action: 'triggerEmergency', flightId, type: 'medical' });
  if (button.dataset.action === 'medical') executeAirportCommand({ action: 'triggerEmergency', flightId, type: 'disabled' });
  if (button.dataset.action === 'slow' || button.dataset.action === 'normal' || button.dataset.action === 'expedite' || button.dataset.action === 'hold' || button.dataset.action === 'resume' || button.dataset.action === 'zigzag') {
    executeAirportCommand({ action: 'controlFlights', flightIds: [flightId], instruction: button.dataset.action });
  }
  renderTelemetryControls();
  telemetryOutput.textContent = JSON.stringify(airportSnapshot(), null, 2);
});

function renderTelemetryControls(): void {
  telemetryControls.innerHTML = simulation.state.flights.map((flight) => {
    const surface = flight.phase === 'taxi-in' || flight.phase === 'taxi-out';
    const flightControls = [
      `<button data-action="focus" data-flight="${flight.id}">Track</button>`,
      `<button data-action="slow" data-flight="${flight.id}">Slow</button>`,
      `<button data-action="normal" data-flight="${flight.id}">Normal</button>`,
      ...(!surface ? [`<button data-action="expedite" data-flight="${flight.id}">Expedite</button>`] : []),
      ...(flight.phase === 'approach' && flight.controlPattern !== 'zigzag' ? [`<button data-action="zigzag" data-flight="${flight.id}">Zigzag</button>`] : []),
      ...(surface ? [`<button data-action="${flight.controlHold ? 'resume' : 'hold'}" data-flight="${flight.id}">${flight.controlHold ? 'Release' : 'Hold'}</button>`] : []),
      ...(flight.phase === 'approach' && !flight.cleared ? [`<button data-action="clear" data-flight="${flight.id}">Clear ${runwayDesignation(flight.runway)}</button>`] : []),
      ...(flight.phase === 'resting' && flight.turnaround.status === 'ready' && !flight.pushbackCleared ? [`<button data-action="pushback" data-flight="${flight.id}">Push ${flight.pushbackDirection}</button>`] : []),
      ...(flight.phase === 'approach' || flight.phase === 'landing' ? [`<button data-action="go-around" data-flight="${flight.id}">Go around</button>`] : []),
      ...(flight.emergency ? [`<button data-action="medical" data-flight="${flight.id}">Medical</button>`] : [`<button data-action="emergency" data-flight="${flight.id}">Emergency</button>`]),
    ].join('');
    const crossings = (flight.crossingHoldRunway === undefined ? [] : [flight.crossingHoldRunway])
      .map((runway) => `<button data-action="cross" data-flight="${flight.id}" data-runway="${runway}">Clear cross ${runwayDesignation(runway)}</button>`)
      .join('');
    const entry = flight.phase !== 'taxi-out' || flight.progress < 0.985 || flight.runwayEntryCleared
      ? ''
      : `<button data-action="entry" data-flight="${flight.id}">Clear enter ${runwayDesignation(flight.runway)}</button>`;
    const takeoff = flight.phase === 'takeoff' && !flight.takeoffCleared
      ? `<button data-action="takeoff" data-flight="${flight.id}">Clear takeoff ${runwayDesignation(flight.runway)}</button>`
      : '';
    const directive = flight.safetyHold
      ? ' · SAFETY HOLD'
      : flight.crossingHoldRunway !== undefined
        ? ` · HOLD SHORT ${runwayDesignation(flight.crossingHoldRunway)}`
        : flight.controlHold
          ? ' · HELD'
          : flight.controlPattern === 'zigzag'
            ? ' · ZIGZAG'
            : flight.controlPace && flight.controlPace !== 1
              ? ` · ${flight.controlPace < 1 ? 'SLOW' : 'EXPEDITE'}`
              : '';
    const profile = aircraftProfile(flight.aircraft);
    const airline = airlineProfile(flight.airline);
    const gate = flight.gateAssignment;
    const gateDetail = gate
      ? ` · ${gate.gateRef ?? gate.zoneName ?? gate.standId} · ${gate.airlineFit} airline fit · in ${formatTime(gate.scheduledGateInSeconds)} / out ${formatTime(gate.scheduledDepartureSeconds)}`
      : '';
    const turnaroundDetail = flight.phase === 'resting'
      ? ` · turn ${Math.round(flight.turnaround.progress * 100)}% · ${flight.turnaround.tasks.filter((task) => task.status === 'active').map((task) => task.label).join(' + ') || flight.turnaround.status}`
      : '';
    return `<div class="telemetry__flight"><strong>${flight.callsign} · ${flight.aircraft} · ${flightOperationLabel(flight).toUpperCase()}${flight.taxiway ? ` · ${flight.taxiway}` : ''}${directive}</strong><small>${airline.name} · ${flight.registration} · ${flight.service} · ${profile.name} · ${profile.wakeClass} wake · ${flight.engineState} engines${flight.tugAttached ? ` · tug attached · ${Math.round(flight.pushbackProgress * 100)}% push` : ''}${gateDetail}${turnaroundDetail}</small>${flightControls}${crossings}${entry}${takeoff}</div>`;
  }).join('');
}

function updateSafetyUi(predictions = simulation.conflictPredictions()): void {
  const metrics = simulation.shiftMetrics();
  const penalty = predictions.reduce((sum, prediction) => sum + (prediction.severity === 'warning' ? 22 : 7), 0);
  // A safety hold is the system doing its job, and ordinary queue delay is an
  // efficiency metric rather than a loss of separation. Keep this field true
  // to its label: only active forecasts or invariant breaches reduce Safety.
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty - metrics.collisionAlerts * 40)));
  safetyScore.textContent = String(score).padStart(3, '0');
  safetyScore.style.color = score > 84 ? '#d9f4f4' : score > 64 ? '#f2c84b' : '#ef937f';
}

function updateOperationsHealth(): void {
  const diagnostics = simulation.diagnostics();
  const metrics = diagnostics.metrics;
  const completed = simulation.state.arrivals + simulation.state.departures;
  const throughput = completed / Math.max(1 / 60, simulation.state.elapsed / 3_600);
  const invariantFailures = metrics.collisionAlerts + metrics.runwayIncursions + metrics.unexplainedPauses;
  healthThroughput.textContent = throughput.toFixed(1);
  healthConflicts.textContent = String(metrics.collisionAlerts);
  healthIncursions.textContent = String(metrics.runwayIncursions);
  healthPauses.textContent = String(metrics.unexplainedPauses);
  healthHold.textContent = `${Math.round(metrics.longestHoldSeconds)}s`;
  healthDelay.textContent = `${(metrics.estimatedDelaySeconds / 60).toFixed(1)}m`;
  healthFps.textContent = measuredFps ? String(Math.round(measuredFps)) : '—';
  const state = invariantFailures > 0 ? 'ATTENTION' : simulation.state.elapsed < 10 ? 'WARMING UP' : 'NOMINAL';
  healthState.textContent = state;
  operationsHealth.dataset.state = state.toLowerCase();
}

function renderDebugPanel(): void {
  const renderer = world.diagnostics();
  const diagnostics = simulation.diagnostics();
  debugPanel.textContent = [
    `${config.code} · ${simulation.state.mode.toUpperCase()} · ${simulation.state.station.toUpperCase()}`,
    `${measuredFps.toFixed(1)} fps · ${renderer.drawCalls} draws · ${renderer.triangles.toLocaleString()} tris`,
    `${simulation.state.flights.length} aircraft · ${diagnostics.runwayReservations.length} runway reservations`,
    `${diagnostics.metrics.collisionAlerts} conflicts · ${diagnostics.metrics.runwayIncursions} incursions · ${diagnostics.metrics.unexplainedPauses} pauses`,
  ].join('\n');
}

function updateReplayUi(): void {
  replaySlider.max = String(Math.max(0, replayFrames.length - 1));
  replaySlider.disabled = !replayMode || replayFrames.length === 0;
  if (replayMode && replayFrames.length) {
    replayIndex = Math.max(0, Math.min(replayFrames.length - 1, replayIndex < 0 ? replayFrames.length - 1 : replayIndex));
    replaySlider.value = String(replayIndex);
    replayTime.value = formatTime(replayFrames[replayIndex].clock);
    replayTime.textContent = formatTime(replayFrames[replayIndex].clock);
  } else {
    replayTime.value = 'LIVE';
    replayTime.textContent = 'LIVE';
  }
}

function setStatus(label: string, detail: string): void {
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    status.animate(
      [{ transform: 'translateY(-5px)', opacity: 0.35 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: 420, easing: 'ease-out' },
    );
  }
  statusLabel.textContent = label;
  statusDetail.textContent = detail;
}

function showGameOver(callsign: string): void {
  clearRoute();
  world.selectFlight(null);
  $<HTMLElement>('#final-time').textContent = formatTime(simulation.state.elapsed);
  $<HTMLElement>('#final-airport').textContent = config.name;
  $<HTMLElement>('#final-landed').textContent = two(simulation.state.arrivals);
  $<HTMLElement>('#final-departed').textContent = two(simulation.state.departures);
  gameOver.hidden = false;
  setExclusiveModal(gameOver);
  requestAnimationFrame(() => {
    gameOver.classList.remove('modal--hidden');
    restartButton.focus();
  });
  setStatus(`${callsign} lost separation`, 'shift closed for safety review');
}

function two(value: number): string { return String(value).padStart(2, '0'); }
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${two(minutes)}:${two(Math.floor(seconds % 60))}`;
}

let lastTelemetrySecond = -1;

function updateModeControl(): void {
  const mode = simulation.state.mode;
  const automatic = mode === 'auto' || mode === 'watch';
  modeButton.setAttribute('aria-pressed', String(automatic));
  modeButton.classList.toggle('control--active', automatic);
  modeIcon.textContent = mode === 'auto' ? 'A' : mode === 'assisted' ? '✓' : mode === 'manual' ? 'M' : '◌';
  modeLabel.textContent = mode === 'auto' ? 'Auto' : mode === 'assisted' ? 'Assist' : mode === 'manual' ? 'Manual' : 'Watch';
  const zoomHint = ' · drag or WASD to pan · Q/E to rotate · scroll or pinch to zoom';
  instructionCopy.innerHTML = mode === 'watch'
    ? `Watch mode · calm continuous traffic${zoomHint} · <b>select a flight to follow</b>`
    : mode === 'assisted'
      ? `Assisted ATC${zoomHint} · <b>approve the advisor’s safe clearances</b>`
      : mode === 'manual'
        ? `Full Manual ATC${zoomHint} · <b>select a flight for live clearances</b>`
        : `Continuous Auto tower${zoomHint} · <b>select a flight to follow</b>`;
  canvas.setAttribute('aria-label', mode === 'manual' || mode === 'assisted'
    ? `${mode === 'assisted' ? 'Assisted' : 'Manual'} air traffic control at ${config.name}. Drag or use WASD to pan, use Q and E to rotate, scroll or pinch to zoom, and select a flight card for clearances. Select it again or choose empty ground to release the camera.`
    : `${mode === 'watch' ? 'Watch-only' : 'Automatic'} live traffic at ${config.name}. Drag or use WASD to pan, use Q and E to rotate, scroll or pinch to zoom, and select a flight card to follow it. Select it again or choose empty ground to release the camera.`);
  controlSelect.value = mode;
  introControlSelect.value = mode;
  document.body.classList.toggle('watch-mode', mode === 'watch');
}

function setControlPanelOpen(open: boolean): void {
  menuButton.classList.toggle('menu-toggle--open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close controls' : 'Open controls');
  controlPanel.classList.toggle('control-panel--open', open);
  controlPanel.setAttribute('aria-hidden', String(!open));
  controlPanel.toggleAttribute('inert', !open);
}

function updateNightControl(): void {
  const night = simulation.state.nightMode;
  nightButton.setAttribute('aria-pressed', String(night));
  nightButton.classList.toggle('control--active', night);
  nightIcon.textContent = night ? '☾' : '☀';
  nightLabel.textContent = night ? 'Night' : 'Day';
  document.body.classList.toggle('night-mode', night);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', night ? '#071827' : '#183638');
}

function updateRadarControl(): void {
  radarButton.setAttribute('aria-pressed', String(radarVisible));
  radarButton.setAttribute('aria-label', radarVisible ? 'Hide radar inset' : 'Show radar inset');
  radarButton.classList.toggle('control--active', radarVisible);
  radarLabel.textContent = radarVisible ? 'Radar on' : 'Radar off';
  document.body.classList.toggle('radar-visible', radarVisible);
  radarPanel.hidden = !radarVisible;
  radarAirport.textContent = config.code;
  lastRadarUpdate = -Infinity;
}

function updateQueueInspectorControl(): void {
  queueButton.setAttribute('aria-pressed', String(queueInspectorVisible));
  queueButton.setAttribute('aria-label', queueInspectorVisible ? 'Hide operation queue inspector' : 'Show operation queue inspector');
  queueButton.classList.toggle('control--active', queueInspectorVisible);
  queueLabel.textContent = queueInspectorVisible ? 'Queues on' : 'Queues off';
  document.body.classList.toggle('queue-visible', queueInspectorVisible);
  queuePanel.hidden = !queueInspectorVisible;
  queueInspectorUiKey = '';
}

function renderQueueInspector(): void {
  const snapshot = simulation.queueSnapshot(displayState());
  const key = operationQueueRenderKey(snapshot, queueInspectorFilter, focusedFlightId);
  if (key === queueInspectorUiKey) return;
  queueInspectorUiKey = key;
  renderOperationQueueInspector(
    { count: queueCount, longest: queueLongest, list: queueList },
    snapshot,
    queueInspectorFilter,
    focusedFlightId,
  );
}

function newSession(paused: boolean, nextConfig = generateAirportConfig()): void {
  const mode = simulation.state.mode;
  const nightMode = simulation.state.nightMode;
  const density = simulation.state.trafficFlow.density;
  const ruleset = simulation.state.separationRuleset;
  setControlPanelOpen(false);
  world.dispose();
  config = nextConfig;
  weatherSelection = 'auto';
  simulation = new AirportSimulation(config, density);
  simulation.setSeparationRuleset(ruleset);
  simulation.setMode(mode);
  simulation.setNightMode(nightMode);
  simulation.setScenario(scenarioSelect.value as TrafficScenario);
  simulation.setStation(stationSelect.value as ControllerStation);
  simulation.setPace(simulationSpeed);
  simulation.setPaused(paused);
  world = createWorld(canvas, config);
  world.setRunwayLabelsVisible(runwayLabelsVisible);
  world.setServiceVehiclesVisible(serviceVehiclesVisible);
  for (const [layer, visible] of Object.entries(surfaceLayerVisibility) as Array<[SurfaceLayer, boolean]>) {
    world.setSurfaceLayerVisible(layer, visible);
  }
  for (const [layer, visible] of Object.entries(airspaceLayerVisibility) as Array<[AirspaceLayer, boolean]>) {
    world.setAirspaceLayerVisible(layer, visible);
  }
  lastOrientationUpdate = -Infinity;
  simulationAccumulator = 0;
  previousPresentation = capturePresentation(simulation.state);
  updateAirportUi();
  clearRoute();
  replayFrames.length = 0;
  commandHistory.length = 0;
  initialReplayState = cloneAirportState(simulation.state);
  focusedFlightId = null;
  flightActionsRenderKey = '';
  renderFlightStrip();
  renderFlightActions();
  lastPredictionKey = '';
  replayMode = false;
  replayIndex = -1;
  replayToggle.setAttribute('aria-pressed', 'false');
  replayToggle.textContent = 'Replay';
  updateReplayUi();
  updateModeControl();
  updateNightControl();
  updateRadarControl();
  updateQueueInspectorControl();
  renderQueueInspector();
  updateSurfaceDisruptionTargets();
  surfaceDisruptionUiKey = '';
  renderSurfaceDisruptionControls();
}

function setExclusiveModal(modal: HTMLElement | null): void {
  const app = $<HTMLElement>('#app');
  if (modal) modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  for (const child of [...app.children]) {
    if (!(child instanceof HTMLElement)) continue;
    child.toggleAttribute('inert', Boolean(modal && child !== modal));
  }
  if (!modal && !controlPanel.classList.contains('control-panel--open')) controlPanel.setAttribute('inert', '');
  if (!modal && modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus({ preventScroll: true });
  if (!modal) modalReturnFocus = null;
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const modal = [intro, gameOver].find((candidate) => !candidate.hidden && !candidate.classList.contains('modal--hidden'));
  if (!modal) return;
  const focusable = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
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
  const center = config.scope === 'center';
  brandMark.textContent = center ? config.code : config.name.charAt(0);
  airportMeta.textContent = center
    ? `${config.code} · ATC schematic · ${Math.round((config.annualOperations ?? 0) / 1000)}k ops/year`
    : 'Local · airfield control';
  if (config.vectorData) {
    const effective = config.vectorData.effective
      ? `${config.vectorData.effective.from.replace(/^\d{4}Z\s+/, '')}–${config.vectorData.effective.to.replace(/^\d{4}Z\s+/, '')}`
      : 'effective window unavailable';
    mapDataVersion.textContent = config.contextData
      ? `FAA geometry + OSM surface and surroundings · ${effective}`
      : config.surfaceData
        ? `FAA geometry + OSM surface graph · ${effective}`
        : `FAA vector foundation · ${effective}`;
    mapDataAttribution.textContent = config.contextData
      ? `${config.vectorData.attribution} Retrieved ${config.vectorData.retrievedOn}. ${config.contextData.attribution} Surface and surroundings retrieved through ${config.contextData.retrievedOn}.${config.surfaceData?.passengerFacilityReference ? ` ${config.surfaceData.passengerFacilityReference.provider} terminal inventory retrieved ${config.surfaceData.passengerFacilityReference.retrievedOn}.` : ''} · not for navigation.`
      : config.surfaceData
        ? `${config.vectorData.attribution} Retrieved ${config.vectorData.retrievedOn}. ${config.surfaceData.attribution} Retrieved ${config.surfaceData.retrievedOn}.${config.surfaceData.passengerFacilityReference ? ` ${config.surfaceData.passengerFacilityReference.provider} terminal inventory retrieved ${config.surfaceData.passengerFacilityReference.retrievedOn}.` : ''} · not for navigation.`
        : `${config.vectorData.attribution} Retrieved ${config.vectorData.retrievedOn} · imported geometry staged · not for navigation.`;
    mapDataSource.hidden = false;
    mapSurfaceSource.hidden = !config.surfaceData;
    mapFacilitySource.hidden = !config.surfaceData?.passengerFacilityReference;
    if (config.surfaceData?.passengerFacilityReference)
      mapFacilitySource.href = config.surfaceData.passengerFacilityReference.url;
  } else {
    mapDataVersion.textContent = center ? 'Purpose-built ATC schematic' : 'Procedural airfield';
    mapDataAttribution.textContent = 'Original generated scenery · not for navigation';
    mapDataSource.hidden = true;
    mapSurfaceSource.hidden = true;
    mapFacilitySource.hidden = true;
  }
  document.title = `${config.code === 'LOCAL' ? config.name : config.code} · Airport Auto`;
  scopeButton.setAttribute('aria-pressed', String(center));
  scopeButton.classList.toggle('control--active', center);
  scopeLabel.textContent = center ? 'Airfield' : 'Center';
  fieldLabel.textContent = center ? 'Next hub' : 'New field';
  fieldButton.setAttribute('aria-label', center ? 'Load the next major airport' : 'Generate a new airfield');
  airportSelect.value = config.code;
  introAirportSelect.value = config.code;
  densitySelect.value = simulation.state.trafficFlow.density;
  introDensitySelect.value = simulation.state.trafficFlow.density;
  separationRulesSelect.value = simulation.state.separationRuleset;
  introSeparationRulesSelect.value = simulation.state.separationRuleset;
  document.body.classList.toggle('center-scope', center);
  mapOrientationToggle.checked = mapOrientationVisible;
  mapOrientation.hidden = !mapOrientationVisible;
  windOverlayToggle.checked = windOverlayVisible;
  windOverlay.hidden = !windOverlayVisible;
  serviceVehiclesToggle.checked = serviceVehiclesVisible;
  world.setServiceVehiclesVisible(serviceVehiclesVisible);
  radarAirport.textContent = config.code;
  runwayConfigurationOptionsKey = '';
  updateRunwayConfigurationOptions();
  for (const control of surfaceLayerControls) {
    const layer = control.dataset.surfaceLayer as SurfaceLayer;
    const available = layer === 'hotspots'
      ? config.surfaceGraph.hotspots.length > 0
      : layer === 'operational-zones'
        ? config.surfaceGraph.zones.length > 0
        : layer === 'airport-boundary'
          ? Boolean(config.contextData)
          : config.surfaceGraph.taxiways.some((taxiway) => Boolean(taxiway.reference));
    control.disabled = !available;
    control.checked = available && surfaceLayerVisibility[layer];
    world.setSurfaceLayerVisible(layer, available && surfaceLayerVisibility[layer]);
  }
  for (const control of airspaceLayerControls) {
    const layer = control.dataset.airspaceLayer as AirspaceLayer;
    control.disabled = false;
    control.checked = airspaceLayerVisibility[layer];
    world.setAirspaceLayerVisible(layer, airspaceLayerVisibility[layer]);
  }
}

function updateRunwayConfigurationOptions(): void {
  const eligibility = new Map(simulation.runwayConfigurationOptions().map((option) => [option.id, option]));
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
    const automatic = document.createElement('option');
    automatic.value = 'auto';
    automatic.textContent = 'Automatic';
    const options = config.runwayConfigurations.map((configuration) => {
      const option = document.createElement('option');
      const availability = eligibility.get(configuration.id);
      option.value = configuration.id;
      option.disabled = !availability?.eligible;
      option.textContent = availability?.eligible ? configuration.name : `${configuration.name} — unavailable`;
      option.title = availability?.reason ?? configuration.restrictions.note;
      return option;
    });
    runwayConfigurationSelect.replaceChildren(automatic, ...options);
    runwayConfigurationOptionsKey = key;
  }
  runwayConfigurationSelect.disabled = simulation.state.station !== 'supervisor';
  runwayConfigurationSelect.title = runwayConfigurationSelect.disabled
    ? 'Select the Supervisor station to change the runway plan.'
    : 'Automatic follows wind, weather, visibility, and demand restrictions.';
  runwayConfigurationSelect.value = simulation.state.runwayConfigurationMode === 'manual'
    ? simulation.state.runwayConfigurationTransition?.targetId ?? simulation.state.runwayConfigurationId
    : 'auto';
}

function selectAirport(code: string, paused: boolean): void {
  if (code === 'LOCAL') {
    newSession(paused, generateAirportConfig());
  } else {
    const index = HUB_AIRPORTS.findIndex((airport) => airport.code === code);
    hubIndex = index < 0 ? 0 : index;
    newSession(paused, generateHubConfig(hubIndex));
  }
  setStatus(`${config.code === 'LOCAL' ? config.name : config.code} selected`, trafficDescription());
}

function selectControl(mode: ControlMode): void {
  simulation.setMode(mode);
  updateModeControl();
  if (mode === 'manual' || mode === 'assisted') setFlightStripCollapsed(false);
  if (mode === 'watch') {
    setFlightStripCollapsed(true);
    audioPreset.value = 'calm';
    audio.setPreset('calm');
  }
  renderFlightStrip();
  setStatus(modeName(mode), modeDescription(mode));
}

function setScenario(scenario: TrafficScenario): void {
  simulation.setScenario(scenario);
  scenarioSelect.value = scenario;
  densitySelect.value = simulation.state.trafficFlow.density;
  introDensitySelect.value = simulation.state.trafficFlow.density;
  const labels: Record<TrafficScenario, string> = { normal: 'Normal flow', rush: 'Rush hour', storm: 'Storm front', closure: 'Runway closure', training: 'Training pattern', emergency: 'Emergency response' };
  setStatus(`${labels[scenario]} scenario`, scenario === 'closure' ? 'one runway closed · arrivals re-sequencing' : scenario === 'storm' ? 'reduced visibility · wider spacing' : scenario === 'rush' ? 'compressed arrival stream · watch separation' : scenario === 'training' ? 'one aircraft at a time · practice clearances' : scenario === 'emergency' ? 'medical priority · keep a protected runway' : 'standard traffic picture');
  surfaceDisruptionUiKey = '';
  renderSurfaceDisruptionControls();
}

function setTrafficDensity(density: TrafficDensity): void {
  if (!isTrafficDensity(density)) return;
  simulation.setTrafficDensity(density);
  densitySelect.value = density;
  introDensitySelect.value = density;
  const profile = trafficDensityProfile(density);
  setStatus(`${profile.label} traffic`, `${profile.description} · holding capacity ${profile.holdingCapacity}`);
  renderQueueInspector();
  updateWeatherUi();
}

function setSeparationRules(ruleset: SeparationRulesetId): void {
  simulation.setSeparationRuleset(ruleset);
  separationRulesSelect.value = ruleset;
  introSeparationRulesSelect.value = ruleset;
  const profile = separationRuleset(ruleset);
  setStatus(`${profile.label} active`, `${profile.radarHorizontalNm} NM nominal radar minimum · ${profile.wakeModel.label}`);
  renderFlightStrip();
}

function setStation(station: ControllerStation): void {
  simulation.setStation(station);
  stationSelect.value = station;
  updateStationAutomationUi();
  updateWeatherUi();
  const label = controllerStationLabel(station);
  focusedFlightId = null;
  world.selectFlight(null);
  renderFlightStrip();
  surfaceDisruptionUiKey = '';
  renderSurfaceDisruptionControls();
  setStatus(`${label} station`, station === 'supervisor' ? 'full picture · all clearances available' : `${label.toLowerCase()} frequency selected · other desks automated`);
}

function updateStationAutomationUi(): void {
  const supervisor = simulation.state.station === 'supervisor';
  const globallyAutomated = simulation.state.mode === 'auto' || simulation.state.mode === 'watch';
  for (const control of stationAutomationControls) {
    const station = control.dataset.stationAutomation as OperationalControllerStation;
    const automated = globallyAutomated || simulation.state.stationAutomation[station];
    control.checked = automated;
    control.disabled = !supervisor || globallyAutomated;
    control.closest('label')?.classList.toggle('station-automation__manual', !automated);
  }
  const workloads = new Map(simulation.controllerWorkloads().map((workload) => [workload.station, workload]));
  for (const control of stationWorkloadControls) {
    const station = control.dataset.stationWorkload as OperationalControllerStation;
    const workload = workloads.get(station);
    if (!workload) continue;
    control.classList.toggle('station-workloads__selected', simulation.state.station === station);
    control.dataset.pressure = workload.workload;
    control.setAttribute('aria-pressed', String(simulation.state.station === station));
    control.querySelector('span')!.textContent = `${workload.phaseRelevantFlights} track${workload.phaseRelevantFlights === 1 ? '' : 's'}${workload.pendingHandoffs ? ` · ${workload.pendingHandoffs} inbound` : ''}`;
    control.querySelector('i')!.textContent = `${workload.automated ? 'Auto' : 'Manual'} · ${workload.workload}`;
  }
}

function modeName(mode: ControlMode): string {
  return mode === 'auto' ? 'Full auto' : mode === 'assisted' ? 'Assisted ATC' : mode === 'manual' ? 'Full manual' : 'Watch / ASMR';
}

function modeDescription(mode: ControlMode): string {
  return mode === 'auto'
    ? 'the tower manages every phase continuously'
    : mode === 'assisted'
      ? 'the advisor explains and proposes each safe clearance for approval'
      : mode === 'manual'
        ? 'you own approach, runway, and ground clearances'
        : 'hands-off flow · minimal chrome · calm alert policy';
}

function trafficDescription(): string {
  if (!config.annualOperations) return `${config.runwayCount} runway${config.runwayCount === 1 ? '' : 's'} · local traffic`;
  return `${config.runwayCount} runways · ${config.annualOperations.toLocaleString()} annual operations`;
}

function setSimulationSpeed(value: number): void {
  simulationSpeed = Math.min(3, Math.max(0.5, value));
  speedControl.value = String(simulationSpeed);
  simulation.setPace(simulationSpeed);
  speedOutput.value = `${simulationSpeed.toFixed(simulationSpeed % 1 ? 2 : 0).replace(/0$/, '')}×`;
}

function updateWeatherUi(): void {
  const weather = simulation.state.weather;
  const operation = simulation.operationProfileSnapshot(displayState()).current;
  const density = trafficDensityProfile(displayState().trafficFlow.density);
  const flow = simulation.trafficFlowSnapshot(displayState());
  const direction = Math.round(mathAngleToAviationDegrees(weather.windDirection) / 10) * 10 % 360;
  const speed = Math.round(weather.windSpeed);
  const gust = Math.round(weather.gustSpeed);
  weatherCondition.textContent = weather.weatherEnabled ? `${weather.condition} · ${Math.round(weather.temperatureC)}°C` : 'wx off';
  weatherWind.textContent = weather.windEnabled ? `${String(direction || 360).padStart(3, '0')}° ${speed}G${gust} kt` : 'calm · wind off';
  windOverlayHeading.textContent = weather.windEnabled ? `WIND ${String(direction || 360).padStart(3, '0')}°` : 'WIND OFF';
  windOverlaySpeed.textContent = weather.windEnabled ? `${speed}G${gust} kt` : 'calm';
  windOverlayArrow.style.transform = `rotate(${direction + 90}deg)`;
  windOverlayArrow.style.opacity = weather.windEnabled ? '1' : '0.35';
  weatherVisibility.textContent = `${weather.visibility.toFixed(weather.visibility % 1 ? 1 : 0)} mi · ceiling ${weather.ceilingFt.toLocaleString()} ft · ${weather.surfaceCondition}`;
  operationBank.textContent = `${operation.localTime} local · ${operation.periodLabel} · ${density.label} ${operation.demandMultiplier.toFixed(2)}× bank`;
  trafficFlowReadout.textContent = flow.backPressure.arrivalsHolding || flow.backPressure.departuresWaiting
    ? `${density.label} · ARR ${flow.backPressure.arrivalsHolding} metered · DEP ${flow.backPressure.departuresWaiting} queued`
    : `${density.label} · metering clear`;
  const activeConfiguration = config.runwayConfigurations.find(
    (configuration) => configuration.id === simulation.state.runwayConfigurationId,
  );
  const transition = simulation.state.runwayConfigurationTransition;
  const targetConfiguration = transition
    ? config.runwayConfigurations.find((configuration) => configuration.id === transition.targetId)
    : null;
  runwayConfiguration.textContent = transition
    ? `${activeConfiguration?.name ?? 'Current plan'} → ${targetConfiguration?.name ?? transition.targetId} · draining ${transition.blockingFlightIds.length} protected flight${transition.blockingFlightIds.length === 1 ? '' : 's'}`
    : activeConfiguration
      ? `${activeConfiguration.name} · ${activeConfiguration.description}`
      : 'Runway plan unavailable';
  updateRunwayConfigurationOptions();
  weatherToggle.setAttribute('aria-pressed', String(weather.weatherEnabled));
  weatherToggle.textContent = weather.weatherEnabled ? 'WX ON' : 'WX OFF';
  windToggle.setAttribute('aria-pressed', String(weather.windEnabled));
  windToggle.textContent = weather.windEnabled ? 'WIND ON' : 'WIND OFF';
  weatherConditionSelect.value = weatherSelection;
  updateStationAutomationUi();
  if (lastWeatherCondition !== null && weather.condition !== lastWeatherCondition) {
    setStatus(`${weather.condition === 'clear' ? 'Weather improving' : `${weather.condition} moving onto the field`}`, weather.condition === 'snow' ? 'deicing routes active · contaminated-surface performance' : weather.condition === 'fog' ? 'reduced arrival rate · slower taxi' : weather.condition === 'rain' ? 'wet runway spacing is active' : 'normal spacing restored');
  }
  lastWeatherCondition = weather.condition;
}

function recordTelemetry(
  type: string,
  flight?: { id: number; callsign: string; runway: number; phase: string },
  runway?: number,
  taxiway?: string,
  details?: { accepted?: boolean; detail?: string; payload?: unknown },
): void {
  const event: TelemetryEvent = {
    sequence: ++telemetrySequence,
    airport: config.code,
    elapsed: Number(simulation.state.elapsed.toFixed(2)),
    type,
    flightId: flight?.id,
    callsign: flight?.callsign,
    runway: runway ?? flight?.runway,
    phase: flight?.phase,
    taxiway,
    ...details,
  };
  telemetryEvents.push(event);
  if (telemetryEvents.length > 500) telemetryEvents.splice(0, telemetryEvents.length - 500);
  window.dispatchEvent(new CustomEvent('airport-auto:event', { detail: event }));
  airportChannel?.postMessage({ type: 'event', event });
}

function cloneRunwayConfiguration(configuration: (typeof config.runwayConfigurations)[number]) {
  return {
    ...configuration,
    arrivalRunwayIds: [...configuration.arrivalRunwayIds],
    departureRunwayIds: [...configuration.departureRunwayIds],
    operatingEnds: { ...configuration.operatingEnds },
    runwayRoles: { ...configuration.runwayRoles },
    restrictions: {
      ...configuration.restrictions,
      conditions: [...configuration.restrictions.conditions],
      scenarios: configuration.restrictions.scenarios ? [...configuration.restrictions.scenarios] : undefined,
    },
    source: configuration.source ? { ...configuration.source } : undefined,
  };
}

function airportSnapshot() {
  const diagnostics = simulation.diagnostics();
  const operations = simulation.operationProfileSnapshot();
  const movingPhases = new Set(['approach', 'landing', 'taxi-in', 'taxi-out', 'takeoff']);
  return {
    schemaVersion: 18,
    airport: {
      code: config.code,
      name: config.name,
      scope: config.scope,
      fidelity: config.code === 'LOCAL' ? 'procedural' : 'schematic',
      navigationUse: false,
      operationsPerYear: config.annualOperations,
      vectorData: config.vectorData ? {
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
      } : null,
      surfaceData: config.surfaceData ? {
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
        passengerFacilityReference: { ...config.surfaceData.passengerFacilityReference },
        validationRules: { ...config.surfaceData.validationRules },
        license: config.surfaceData.license,
        attribution: config.surfaceData.attribution,
        copyrightUrl: config.surfaceData.copyrightUrl,
      } : null,
      contextData: config.contextData ? {
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
      } : null,
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
        fixes: config.airspaceProgram.fixes.map((fix) => ({ ...fix, position: [...fix.position] })),
        airways: config.airspaceProgram.airways.map((airway) => ({ ...airway, fixIds: [...airway.fixIds] })),
        sectors: config.airspaceProgram.sectors.map((sector) => ({ ...sector, polygon: sector.polygon.map((point) => [...point]) })),
        procedures: config.airspaceProgram.procedures.map((procedure) => ({
          ...procedure,
          configurationIds: [...procedure.configurationIds],
          conditions: [...procedure.conditions],
          transitions: procedure.transitions.map((transition) => ({ ...transition, fixIds: [...transition.fixIds] })),
          commonFixIds: [...procedure.commonFixIds],
          constraints: procedure.constraints.map((constraint) => ({ ...constraint })),
        })),
        holds: config.airspaceProgram.holds.map((hold) => ({ ...hold })),
        missedApproaches: config.airspaceProgram.missedApproaches.map((missed) => ({ ...missed, fixIds: [...missed.fixIds] })),
        sources: config.airspaceProgram.sources.map((source) => ({ ...source })),
      },
    },
    clock: Number(simulation.state.elapsed.toFixed(2)),
    paused: simulation.state.paused,
    gameOver: simulation.state.gameOver,
    mode: simulation.state.mode,
    nightMode: simulation.state.nightMode,
    radarVisible,
    queueInspectorVisible,
    windOverlayVisible,
    serviceVehiclesVisible,
    station: simulation.state.station,
    controllers: {
      automation: { ...simulation.state.stationAutomation },
      workloads: simulation.controllerWorkloads(),
    },
    scenario: simulation.state.scenario,
    trafficDensity: simulation.state.trafficFlow.density,
    separationRuleset: diagnostics.separation,
    speed: simulationSpeed,
    weather: {
      enabled: simulation.state.weather.weatherEnabled,
      windEnabled: simulation.state.weather.windEnabled,
      condition: simulation.state.weather.condition,
      windDirectionDegrees: Math.round(mathAngleToAviationDegrees(simulation.state.weather.windDirection)),
      windSpeed: Number(simulation.state.weather.windSpeed.toFixed(1)),
      gustSpeed: Number(simulation.state.weather.gustSpeed.toFixed(1)),
      visibilityMiles: simulation.state.weather.visibility,
      ceilingFt: simulation.state.weather.ceilingFt,
      temperatureC: Number(simulation.state.weather.temperatureC.toFixed(1)),
      surfaceCondition: simulation.state.weather.surfaceCondition,
    },
    operations,
    runwayConfiguration: {
      ...cloneRunwayConfiguration(config.runwayConfigurations.find(
        (configuration) => configuration.id === simulation.state.runwayConfigurationId,
      ) ?? config.runwayConfigurations[0]),
      selectionMode: simulation.state.runwayConfigurationMode,
      transition: simulation.state.runwayConfigurationTransition ? {
        ...simulation.state.runwayConfigurationTransition,
        changedRunwayIds: [...simulation.state.runwayConfigurationTransition.changedRunwayIds],
        blockingFlightIds: [...simulation.state.runwayConfigurationTransition.blockingFlightIds],
      } : null,
    },
    runwayConfigurations: config.runwayConfigurations.map((configuration) => ({
      ...cloneRunwayConfiguration(configuration),
      eligibility: simulation.runwayConfigurationOptions().find((option) => option.id === configuration.id),
    })),
    score: { landed: simulation.state.arrivals, departed: simulation.state.departures },
    replay: {
      frames: replayFrames.length,
      durationSeconds: replayFrames.length ? replayFrames[replayFrames.length - 1].clock - replayFrames[0].clock : 0,
    },
    traffic: diagnostics,
    trafficManagement: diagnostics.trafficManagement,
    queues: diagnostics.queues,
    surfaceDisruptions: simulation.state.surfaceDisruptions.map((disruption) => ({
      ...disruption,
      edgeIds: [...disruption.edgeIds],
      reroutedFlightIds: [...disruption.reroutedFlightIds],
    })),
    proposals: simulation.clearanceProposals(),
    renderer: world.diagnostics(),
    runways: config.runways.map((runway) => ({
      id: runway.id,
      designation: runway.designation?.join('/'),
      role: simulation.state.activeRunwayRoles[runway.id] ?? runway.role,
      publishedRole: runway.role,
      landingEnd: runway.landingEnd,
      activeEnd: simulation.state.activeRunwayEnds[runway.id],
      activeDesignation: runway.designation?.[simulation.state.activeRunwayEnds[runway.id] === 1 ? 1 : 0],
      closed: simulation.state.surfaceDisruptions.some((disruption) => (
        disruption.runwayId === runway.id && (disruption.kind === 'runway-closure' || disruption.kind === 'disabled-aircraft')
      )),
      occupiedBy: simulation.state.flights
        .filter((flight) => flight.runway === runway.id && movingPhases.has(flight.phase))
        .map((flight) => ({ id: flight.id, callsign: flight.callsign, phase: flight.phase, progress: Number(flight.progress.toFixed(3)) })),
    })),
    surfaceGraph: {
      schemaVersion: config.surfaceGraph.schemaVersion,
      airportCode: config.surfaceGraph.airportCode,
      seed: config.surfaceGraph.seed,
      source: config.surfaceGraph.source ? { ...config.surfaceGraph.source } : undefined,
      nodes: config.surfaceGraph.nodes.map((node) => ({ ...node, position: [...node.position], taxiwayIds: [...node.taxiwayIds] })),
      edges: config.surfaceGraph.edges.map((edge) => ({
        ...edge,
        crossedRunwayIds: edge.crossedRunwayIds ? [...edge.crossedRunwayIds] : undefined,
        sourceWayIds: edge.sourceWayIds ? [...edge.sourceWayIds] : undefined,
        crossingIds: edge.crossingIds ? [...edge.crossingIds] : undefined,
      })),
      taxiways: config.surfaceGraph.taxiways.map((taxiway) => ({ ...taxiway, edgeIds: [...taxiway.edgeIds] })),
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
        model: 'scheduled-stand-reservations',
        policy: config.code === 'ORD' ? 'ORD 2026 schematic airline and cargo affinities' : 'deterministic airline terminal sectors',
        turnBufferSeconds: GATE_TURN_BUFFER_SECONDS,
        factors: ['airline', 'terminal', 'aircraft-size', 'service-type', 'arrival-time', 'next-departure-route'],
      },
      serviceVehiclePolicy: {
        model: 'shared-surface-reservations',
        protectedMovementAreas: 'blocked unless explicitly authorized',
        routeResources: ['edge', 'node', 'ramp-zone', 'staging-position', 'stand-side-lane', 'service-bay'],
        pushbackRequiresStandClear: true,
      },
      deicingFacilities: diagnostics.deicing.facilities,
      deicingPolicy: {
        model: 'fixed-step-pad-queue-and-holdover',
        requiredCondition: 'snow',
        routing: 'stand-to-pad-to-runway-hold-short',
        expiredHoldoverAction: 'return-to-pad-before-runway-entry',
      },
      passengerFacilities: config.surfaceGraph.passengerFacilities.map((facility) => ({
        ...facility,
        center: [...facility.center],
        concourses: facility.concourses ? [...facility.concourses] : undefined,
        sections: facility.sections ? [...facility.sections] : undefined,
        sourceElementIds: [...facility.sourceElementIds],
        standIds: [...facility.standIds],
      })),
      passengerFacilityReference: config.surfaceGraph.passengerFacilityReference
        ? {
            ...config.surfaceGraph.passengerFacilityReference,
            terminals: config.surfaceGraph.passengerFacilityReference.terminals.map((terminal) => ({
              ...terminal,
              concourses: terminal.concourses.map((concourse) => ({
                ...concourse,
                sections: concourse.sections ? [...concourse.sections] : undefined,
              })),
            })),
          }
        : undefined,
      runwayAccess: config.surfaceGraph.runwayAccess.map((access) => ({ ...access })),
      controlPoints: config.surfaceGraph.controlPoints.map((point) => ({ ...point, position: [...point.position] })),
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
      .filter((flight) => flight.phase === 'taxi-in' || flight.phase === 'resting' || flight.phase === 'taxi-out')
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
          routingCost: flight.surfaceRoutingCost === undefined ? null : Number(flight.surfaceRoutingCost.toFixed(2)),
          congestionPenalty: flight.surfaceCongestionPenalty === undefined ? null : Number(flight.surfaceCongestionPenalty.toFixed(2)),
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
          blockingServices: flight.turnaround.tasks.filter((task) => task.required && task.status !== 'complete').map((task) => task.type),
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
        primaryColor: `#${airlineProfile(flight.airline).primaryColor.toString(16).padStart(6, '0')}`,
        accentColor: `#${airlineProfile(flight.airline).accentColor.toString(16).padStart(6, '0')}`,
      },
      flightNumber: flight.flightNumber,
      registration: flight.registration,
      service: flight.service,
      operationPlan: { ...flight.operationPlan },
      flightPlan: cloneFlightPlan(flight.flightPlan),
      flightPlanHistory: flight.flightPlanHistory.map(cloneFlightPlan),
      navigation: {
        ...flight.navigation,
        routeFixIds: [...flight.navigation.routeFixIds],
        vector: flight.navigation.vector ? { ...flight.navigation.vector, start: { ...flight.navigation.vector.start } } : null,
        hold: flight.navigation.hold ? { ...flight.navigation.hold, start: { ...flight.navigation.hold.start } } : null,
      },
      aircraft: {
        model: flight.aircraft,
        name: aircraftProfile(flight.aircraft).name,
        manufacturer: aircraftProfile(flight.aircraft).manufacturer,
        category: flight.category,
        wakeClass: flight.wakeClass,
        lengthM: aircraftProfile(flight.aircraft).lengthM,
        wingspanM: aircraftProfile(flight.aircraft).wingspanM,
        maxTakeoffWeightT: aircraftProfile(flight.aircraft).maxTakeoffWeightT,
        cruiseKts: aircraftProfile(flight.aircraft).cruiseKts,
        approachKts: aircraftProfile(flight.aircraft).approachKts,
        taxiKts: aircraftProfile(flight.aircraft).taxiKts,
        taxiTurnKts: aircraftProfile(flight.aircraft).taxiTurnKts,
        taxiAccelerationMps2: aircraftProfile(flight.aircraft).taxiAccelerationMps2,
        taxiBrakingMps2: aircraftProfile(flight.aircraft).taxiBrakingMps2,
        taxiTurnRadiusM: aircraftProfile(flight.aircraft).taxiTurnRadiusM,
        minimumWingtipClearanceM: aircraftProfile(flight.aircraft).minimumWingtipClearanceM,
        takeoffRollM: aircraftProfile(flight.aircraft).takeoffRollM,
        landingRollM: aircraftProfile(flight.aircraft).landingRollM,
        climbFpm: aircraftProfile(flight.aircraft).climbFpm,
        descentFpm: aircraftProfile(flight.aircraft).descentFpm,
        accelerationMps2: aircraftProfile(flight.aircraft).accelerationMps2,
        brakingMps2: aircraftProfile(flight.aircraft).brakingMps2,
        turnRadiusM: aircraftProfile(flight.aircraft).turnRadiusM,
        wakeSeparationSeconds: aircraftProfile(flight.aircraft).wakeSeparationSeconds,
      },
      category: flight.category,
      wakeClass: flight.wakeClass,
      procedure: flight.procedure,
      origin: flight.origin,
      destination: flight.destination,
      squawk: flight.squawk,
      emergency: flight.emergency ?? null,
      goAround: flight.goAround ? {
        startedAt: Number(flight.goAround.startedAt.toFixed(2)),
        detail: flight.goAround.detail,
        stage: flight.motion.stage,
        stageProgress: Number(flight.motion.stageProgress.toFixed(3)),
        start: {
          x: Number(flight.goAround.start.x.toFixed(3)),
          y: Number(flight.goAround.start.y.toFixed(3)),
          z: Number(flight.goAround.start.z.toFixed(3)),
          headingDegrees: Number((flight.goAround.start.heading * 180 / Math.PI).toFixed(2)),
        },
      } : null,
      runwayExit: flight.runwayExit ? {
        ...flight.runwayExit,
        taxiRouteEdgeIds: [...flight.runwayExit.taxiRouteEdgeIds],
        rationale: [...flight.runwayExit.rationale],
      } : null,
      surfaceReroute: flight.surfaceReroute ? {
        ...flight.surfaceReroute,
        disruptionIds: [...flight.surfaceReroute.disruptionIds],
        previousEdgeIds: [...flight.surfaceReroute.previousEdgeIds],
        routeEdgeIds: [...flight.surfaceReroute.routeEdgeIds],
      } : null,
      operatingEnd: flight.operatingEnd,
      activeRunwayEnd: config.runways[flight.runway]?.designation?.[flight.operatingEnd === 1 ? 1 : 0],
      progress: Number(flight.progress.toFixed(3)),
      kinematics: {
        airspeedKts: Number(flight.kinematics.airspeedKts.toFixed(1)),
        groundSpeedKts: Number(flight.kinematics.groundSpeedKts.toFixed(1)),
        altitudeFt: Math.round(flight.kinematics.altitudeFt),
        verticalSpeedFpm: Math.round(flight.kinematics.verticalSpeedFpm),
        accelerationMps2: Number(flight.kinematics.accelerationMps2.toFixed(2)),
        fuelPercent: Number(flight.kinematics.fuelPercent.toFixed(2)),
      },
      turnaround: {
        status: flight.turnaround.status,
        progress: Number(flight.turnaround.progress.toFixed(3)),
        elapsedSeconds: Number(flight.turnaround.elapsedSeconds.toFixed(2)),
        plannedDurationSeconds: flight.turnaround.plannedDurationSeconds,
        scheduledStartSeconds: Number(flight.turnaround.scheduledStartSeconds.toFixed(2)),
        scheduledReadySeconds: Number(flight.turnaround.scheduledReadySeconds.toFixed(2)),
        actualStartSeconds: flight.turnaround.actualStartSeconds === undefined ? null : Number(flight.turnaround.actualStartSeconds.toFixed(2)),
        actualReadySeconds: flight.turnaround.actualReadySeconds === undefined ? null : Number(flight.turnaround.actualReadySeconds.toFixed(2)),
        releasedAtSeconds: flight.turnaround.releasedAtSeconds === undefined ? null : Number(flight.turnaround.releasedAtSeconds.toFixed(2)),
        initialFuelPercent: Number(flight.turnaround.initialFuelPercent.toFixed(2)),
        targetFuelPercent: Number(flight.turnaround.targetFuelPercent.toFixed(2)),
        activeServices: flight.turnaround.tasks.filter((task) => task.status === 'active').map((task) => task.type),
        blockingServices: flight.turnaround.tasks.filter((task) => task.required && task.status !== 'complete').map((task) => task.type),
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
          actualStartSeconds: task.actualStartSeconds === undefined ? null : Number(task.actualStartSeconds.toFixed(2)),
          actualCompleteSeconds: task.actualCompleteSeconds === undefined ? null : Number(task.actualCompleteSeconds.toFixed(2)),
        })),
      },
      deicing: {
        ...flight.deicing,
        queueHoldProgress: Number(flight.deicing.queueHoldProgress.toFixed(3)),
        treatmentProgress: Number(flight.deicing.treatmentProgress.toFixed(3)),
        padExitProgress: Number(flight.deicing.padExitProgress.toFixed(3)),
        treatmentElapsedSeconds: Number(flight.deicing.treatmentElapsedSeconds.toFixed(2)),
        holdoverRemainingSeconds: Number(flight.deicing.holdoverRemainingSeconds.toFixed(2)),
      },
      motion: { ...flight.motion },
      renderedAttitude: world.flightAttitude(flight.id),
      trajectory: flightTrajectorySnapshot(flight),
      gateSlot: flight.gateSlot,
      stand: flight.standId,
      gate: (() => {
        const stand = config.surfaceGraph.stands.find((candidate) => candidate.slot === flight.gateSlot);
        return stand ? {
          id: stand.id,
          ref: stand.gateRef ?? null,
          terminalId: stand.terminalId ?? null,
          terminal: stand.terminal,
          concourse: stand.concourse ?? null,
          maximumWingspanM: stand.maximumWingspanM,
          assignment: flight.gateAssignment ? {
            status: flight.phase === 'approach' || flight.phase === 'landing'
              ? 'planned'
              : flight.phase === 'taxi-in'
                ? 'inbound'
                : flight.phase === 'resting'
                  ? 'occupied'
                  : flight.phase === 'taxi-out' && flight.gateAssignment.actualGateOutSeconds === undefined
                    ? 'releasing'
                    : 'released',
            assignedAtSeconds: Number(flight.gateAssignment.assignedAtSeconds.toFixed(2)),
            scheduledGateInSeconds: Number(flight.gateAssignment.scheduledGateInSeconds.toFixed(2)),
            scheduledDepartureSeconds: Number(flight.gateAssignment.scheduledDepartureSeconds.toFixed(2)),
            actualGateInSeconds: flight.gateAssignment.actualGateInSeconds === undefined ? null : Number(flight.gateAssignment.actualGateInSeconds.toFixed(2)),
            actualGateOutSeconds: flight.gateAssignment.actualGateOutSeconds === undefined ? null : Number(flight.gateAssignment.actualGateOutSeconds.toFixed(2)),
            nextDestination: flight.gateAssignment.nextDestination,
            departureRunway: flight.gateAssignment.departureRunway,
            airlineFit: flight.gateAssignment.airlineFit,
            serviceFit: flight.gateAssignment.serviceFit,
            serviceArea: flight.gateAssignment.serviceArea,
            zoneName: flight.gateAssignment.zoneName,
            arrivalRouteDistance: flight.gateAssignment.arrivalRouteDistance,
            departureRouteDistance: flight.gateAssignment.departureRouteDistance,
            score: flight.gateAssignment.score,
            rationale: [...flight.gateAssignment.rationale],
            revision: flight.gateAssignment.revision,
            previousStandId: flight.gateAssignment.previousStandId ?? null,
          } : null,
        } : null;
      })(),
      cleared: flight.cleared,
      taxiway: flight.taxiway,
      groundOperation: {
        label: flightOperationLabel(flight),
        pushbackCleared: flight.pushbackCleared,
        pushbackDirection: flight.pushbackDirection,
        pushbackProgress: Number(flight.pushbackProgress.toFixed(3)),
        pushbackReleaseProgress: Number(flight.pushbackReleaseProgress.toFixed(3)),
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
        routingCost: flight.surfaceRoutingCost === undefined ? null : Number(flight.surfaceRoutingCost.toFixed(2)),
        congestionPenalty: flight.surfaceCongestionPenalty === undefined ? null : Number(flight.surfaceCongestionPenalty.toFixed(2)),
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
        const brakingMultiplier = simulation.state.weather.condition === 'snow'
          ? 0.58
          : simulation.state.weather.condition === 'rain'
            ? 0.76
            : simulation.state.weather.condition === 'fog'
              ? 0.9
              : 1;
        const finite = (value: number | undefined): number | null => (
          value !== undefined && Number.isFinite(value) ? Number(value.toFixed(2)) : null
        );
        return {
          targetTaxiKts: profile.taxiKts,
          turnLimitKts: profile.taxiTurnKts,
          speedLimitKts: finite(surface?.speedLimitKts),
          taxiAccelerationMps2: profile.taxiAccelerationMps2,
          taxiBrakingMps2: Number((profile.taxiBrakingMps2 * brakingMultiplier).toFixed(2)),
          stoppingDistanceM: Number(surfaceStoppingDistanceM(
            profile,
            flight.kinematics.groundSpeedKts,
            0,
            brakingMultiplier,
          ).toFixed(1)),
          designTurnRadiusM: profile.taxiTurnRadiusM,
          currentTurnRadiusM: finite(surface?.turnRadiusM),
          turnConstrained: surface?.turnConstrained ?? false,
          nextTurnDistanceM: finite(surface?.nextTurnDistanceM),
          nextTurnSpeedKts: finite(surface?.nextTurnSpeedKts),
          wingtipClearanceM: finite(surface?.wingtipClearanceM),
          minimumRouteWingtipClearanceM: finite(surface?.minimumRouteWingtipClearanceM),
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

function executeAirportCommand(command: AirportControlCommand): ReturnType<typeof airportSnapshot> {
  return executeAirportRequest(command).snapshot;
}

function executeAirportRequest(command: AirportControlCommand): AirportControlResult {
  let accepted = true;
  let reason = 'accepted';
  if (command.action === 'pause') simulation.setPaused(true);
  if (command.action === 'resume') simulation.setPaused(false);
  if (command.action === 'nextView') world.nextView();
  if (command.action === 'zoomIn') world.zoomIn();
  if (command.action === 'zoomOut') world.zoomOut();
  if (command.action === 'rotateLeft') world.rotateBy(-1);
  if (command.action === 'rotateRight') world.rotateBy(1);
  if (command.action === 'resetCamera') world.resetCamera();
  if (command.action === 'setSpeed') {
    accepted = Number.isFinite(command.value);
    if (accepted) setSimulationSpeed(command.value);
    else reason = 'speed must be a finite number';
  }
  if (command.action === 'setMode') {
    accepted = ['auto', 'assisted', 'manual', 'watch'].includes(command.value);
    if (accepted) selectControl(command.value);
    else reason = 'mode must be auto, assisted, manual, or watch';
  }
  if (command.action === 'setNightMode') {
    simulation.setNightMode(command.enabled);
    updateNightControl();
  }
  if (command.action === 'setRadarVisible') {
    radarVisible = command.enabled;
    updateRadarControl();
  }
  if (command.action === 'setQueueInspectorVisible') {
    queueInspectorVisible = command.enabled;
    updateQueueInspectorControl();
    renderQueueInspector();
  }
  if (command.action === 'setRunwayLabelsVisible') setRunwayLabelsVisible(command.enabled);
  if (command.action === 'setSurfaceLayerVisible') {
    accepted = ['taxiway-labels', 'operational-zones', 'hotspots', 'airport-boundary'].includes(command.layer);
    if (accepted) setSurfaceLayerVisible(command.layer, command.enabled);
    else reason = 'surface layer must be taxiway-labels, operational-zones, hotspots, or airport-boundary';
  }
  if (command.action === 'setAirspaceLayerVisible') {
    accepted = ['airspace-sectors', 'navigation-fixes', 'procedures', 'flight-routes', 'separation'].includes(command.layer);
    if (accepted) setAirspaceLayerVisible(command.layer, command.enabled);
    else reason = 'airspace layer must be airspace-sectors, navigation-fixes, procedures, flight-routes, or separation';
  }
  if (command.action === 'setMapOrientationVisible') setMapOrientationVisible(command.enabled);
  if (command.action === 'setWindOverlayVisible') setWindOverlayVisible(command.enabled);
  if (command.action === 'setServiceVehiclesVisible') setServiceVehiclesVisible(command.enabled);
  if (command.action === 'selectAirport') {
    const code = command.code.toUpperCase();
    accepted = code === 'LOCAL' || HUB_AIRPORTS.some((airport) => airport.code === code);
    if (accepted) selectAirport(code, false);
    else reason = `unknown airport ${code}`;
  }
  if (command.action === 'clearFlight') {
    accepted = simulation.clearFlight(command.flightId, command.runway);
    reason = simulation.lastCommandReason();
  }
  if (command.action === 'clearPushback') {
    accepted = simulation.clearPushback(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === 'clearRunwayEntry') {
    accepted = simulation.clearRunwayEntry(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === 'clearTakeoff') {
    accepted = simulation.clearTakeoff(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === 'clearRunwayCrossing') {
    accepted = simulation.clearRunwayCrossing(command.flightId, command.runway);
    reason = simulation.lastCommandReason();
  }
  if (command.action === 'controlFlights') {
    const controlled = simulation.controlFlights(command.flightIds, command.instruction);
    accepted = controlled.length > 0;
    reason = simulation.lastCommandReason();
    const callsigns = simulation.state.flights.filter((flight) => controlled.includes(flight.id)).map((flight) => flight.callsign);
    if (callsigns.length) setStatus(`${command.instruction.toUpperCase()} command`, callsigns.join(' · '));
  }
  if (command.action === 'assignHeading') {
    accepted = Number.isFinite(command.headingDegrees) && simulation.assignHeading(command.flightId, command.headingDegrees);
    reason = Number.isFinite(command.headingDegrees) ? simulation.lastCommandReason() : 'heading must be a finite aviation heading in degrees';
  }
  if (command.action === 'assignAltitude') {
    accepted = Number.isFinite(command.altitudeFt) && simulation.assignAltitude(command.flightId, command.altitudeFt);
    reason = Number.isFinite(command.altitudeFt) ? simulation.lastCommandReason() : 'altitude must be a finite number of feet';
  }
  if (command.action === 'assignAirspeed') {
    accepted = Number.isFinite(command.speedKts) && simulation.assignAirspeed(command.flightId, command.speedKts);
    reason = Number.isFinite(command.speedKts) ? simulation.lastCommandReason() : 'airspeed must be a finite number of knots';
  }
  if (command.action === 'directTo') {
    accepted = typeof command.fixId === 'string' && command.fixId.length > 0 && simulation.directFlightTo(command.flightId, command.fixId);
    reason = typeof command.fixId === 'string' && command.fixId.length > 0 ? simulation.lastCommandReason() : 'direct-to requires a fix ID';
  }
  if (command.action === 'clearApproach') {
    accepted = simulation.clearApproach(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === 'holdFlight') {
    const validEfc = command.efcMinutes === undefined || Number.isFinite(command.efcMinutes);
    accepted = validEfc && simulation.holdFlight(command.flightId, command.patternId, command.efcMinutes);
    reason = validEfc ? simulation.lastCommandReason() : 'EFC must be a finite number of minutes';
  }
  if (command.action === 'releaseHold') {
    accepted = simulation.releaseAirborneHold(command.flightId);
    reason = simulation.lastCommandReason();
  }
  if (command.action === 'handoffFlight') {
    accepted = isControllerStation(command.station)
      && simulation.handoffFlight(command.flightId, command.station);
    reason = isControllerStation(command.station)
      ? simulation.lastCommandReason()
      : 'unknown controller station';
  }
  if (command.action === 'focusFlight') {
    accepted = command.flightId === null || simulation.state.flights.some((flight) => flight.id === command.flightId);
    if (!accepted) reason = 'flight is not active';
    if (accepted) {
      focusedFlightId = command.flightId;
      world.selectFlight(command.flightId);
      renderFlightStrip();
      renderFlightActions();
    }
  }
  if (command.action === 'setScenario') {
    accepted = ['normal', 'rush', 'storm', 'closure', 'training', 'emergency'].includes(command.scenario);
    if (accepted) setScenario(command.scenario);
    else reason = 'unknown scenario';
  }
  if (command.action === 'setTrafficDensity') {
    accepted = isTrafficDensity(command.density);
    if (accepted) setTrafficDensity(command.density);
    else reason = 'traffic density must be quiet, realistic, busy, rush, or extreme';
  }
  if (command.action === 'setSeparationRuleset') {
    accepted = command.ruleset === 'forgiving' || command.ruleset === 'realistic';
    if (accepted) setSeparationRules(command.ruleset);
    else reason = 'separation ruleset must be forgiving or realistic';
  }
  if (command.action === 'setStation') {
    accepted = isControllerStation(command.station);
    if (accepted) setStation(command.station);
    else reason = 'unknown controller station';
  }
  if (command.action === 'setStationAutomation') {
    accepted = OPERATIONAL_CONTROLLER_STATIONS.includes(command.station)
      && simulation.setStationAutomation(command.station, command.enabled);
    reason = OPERATIONAL_CONTROLLER_STATIONS.includes(command.station)
      ? simulation.lastCommandReason()
      : 'automation station must be approach, tower, ground, or ramp';
    updateStationAutomationUi();
  }
  if (command.action === 'triggerEmergency') {
    accepted = simulation.triggerEmergency(command.flightId, command.type);
    reason = simulation.lastCommandReason();
  }
  if (command.action === 'setWeather') {
    accepted = ['clear', 'rain', 'fog', 'snow'].includes(command.condition) && Number.isFinite(command.directionDegrees) && Number.isFinite(command.windSpeed);
    if (accepted) {
      weatherSelection = command.condition;
      simulation.setWeather(command.condition, aviationDegreesToMathAngle(command.directionDegrees), command.windSpeed);
    }
    else reason = 'weather requires a valid condition, direction, and wind speed';
  }
  if (command.action === 'setWeatherEnabled') simulation.setWeatherEnabled(command.enabled);
  if (command.action === 'setWindEnabled') simulation.setWindEnabled(command.enabled);
  if (command.action === 'setRunwayConfiguration') {
    accepted = simulation.setRunwayConfiguration(command.configurationId);
    reason = simulation.lastCommandReason();
    updateWeatherUi();
  }
  if (command.action === 'setSurfaceDisruption') {
    const valid = ['runway-closure', 'taxiway-closure', 'construction'].includes(command.kind)
      && typeof command.targetId === 'string'
      && command.targetId.length > 0
      && (command.durationSeconds === undefined || (Number.isFinite(command.durationSeconds) && command.durationSeconds > 0));
    accepted = valid && simulation.setSurfaceDisruption(command.kind, command.targetId, command.enabled, command.durationSeconds);
    reason = valid ? simulation.lastCommandReason() : 'surface restriction requires a valid kind, target, and positive duration';
    surfaceDisruptionUiKey = '';
    renderSurfaceDisruptionControls();
  }
  if (command.action === 'clearSurfaceDisruption') {
    accepted = simulation.clearSurfaceDisruption(command.disruptionId);
    reason = simulation.lastCommandReason();
    surfaceDisruptionUiKey = '';
    renderSurfaceDisruptionControls();
  }
  if (command.action === 'recoverDisabledAircraft') {
    accepted = simulation.recoverDisabledAircraft(command.flightId);
    reason = simulation.lastCommandReason();
    surfaceDisruptionUiKey = '';
    renderSurfaceDisruptionControls();
  }
  if (command.action === 'restart') newSession(false, config.code === 'LOCAL' ? generateAirportConfig() : generateHubConfig(hubIndex));
  recordTelemetry(`command:${command.action}`, undefined, undefined, undefined, { accepted, detail: reason, payload: command });
  const snapshot = airportSnapshot();
  const result = { accepted, reason, sequence: telemetrySequence, eventId: telemetrySequence, snapshot, resultingState: snapshot };
  commandHistory.push({ sequence: telemetrySequence, elapsed: Number(simulation.state.elapsed.toFixed(3)), command: { ...command } as AirportControlCommand, accepted, reason });
  if (commandHistory.length > 2_000) commandHistory.splice(0, commandHistory.length - 2_000);
  airportChannel?.postMessage({ type: 'command-result', command, result });
  return result;
}

window.airportControl = {
  version: '2.16.0',
  snapshot: airportSnapshot,
  events(limit = 100) { return telemetryEvents.slice(-Math.max(0, limit)); },
  replay() { return replayFrames.slice(); },
  recording: replayRecording,
  command: executeAirportCommand,
  request: executeAirportRequest,
  help() {
    return {
      snapshot: 'airportControl.snapshot()',
      events: 'airportControl.events(100)',
      structuredCommand: "airportControl.request({ action: 'pause' }) // { accepted, reason, sequence, snapshot }",
      pause: "airportControl.command({ action: 'pause' })",
      speed: "airportControl.command({ action: 'setSpeed', value: 2 })",
      airport: "airportControl.command({ action: 'selectAirport', code: 'ORD' })",
      mode: "airportControl.command({ action: 'setMode', value: 'auto' })",
      nightMode: "airportControl.command({ action: 'setNightMode', enabled: true })",
      radar: "airportControl.command({ action: 'setRadarVisible', enabled: true })",
      queues: "airportControl.request({ action: 'setQueueInspectorVisible', enabled: true })",
      rotate: "airportControl.command({ action: 'rotateLeft' }) // rotateRight reverses",
      mapLayer: "airportControl.command({ action: 'setSurfaceLayerVisible', layer: 'hotspots', enabled: true })",
      airspaceLayer: "airportControl.command({ action: 'setAirspaceLayerVisible', layer: 'procedures', enabled: true })",
      mapOrientation: "airportControl.command({ action: 'setMapOrientationVisible', enabled: true })",
      windOverlay: "airportControl.command({ action: 'setWindOverlayVisible', enabled: true })",
      serviceVehicles: "airportControl.command({ action: 'setServiceVehiclesVisible', enabled: false })",
      clearance: "airportControl.command({ action: 'clearFlight', flightId: 1, runway: 0 })",
      pushback: "airportControl.request({ action: 'clearPushback', flightId: 1 }) // Ramp or Supervisor",
      runwayEntry: "airportControl.command({ action: 'clearRunwayEntry', flightId: 1 })",
      takeoff: "airportControl.request({ action: 'clearTakeoff', flightId: 1 })",
      runwayCrossing: "airportControl.command({ action: 'clearRunwayCrossing', flightId: 1, runway: 4 })",
      controlOne: "airportControl.command({ action: 'controlFlights', flightIds: [1], instruction: 'slow' })",
      controlMany: "airportControl.command({ action: 'controlFlights', flightIds: [1, 2, 3], instruction: 'expedite' })",
      heading: "airportControl.request({ action: 'assignHeading', flightId: 1, headingDegrees: 270 })",
      altitude: "airportControl.request({ action: 'assignAltitude', flightId: 1, altitudeFt: 3000 })",
      airspeed: "airportControl.request({ action: 'assignAirspeed', flightId: 1, speedKts: 170 })",
      directTo: "airportControl.request({ action: 'directTo', flightId: 1, fixId: 'ORD-W-ENTRY' })",
      approach: "airportControl.request({ action: 'clearApproach', flightId: 1 })",
      airborneHold: "airportControl.request({ action: 'holdFlight', flightId: 1, efcMinutes: 4 })",
      releaseHold: "airportControl.request({ action: 'releaseHold', flightId: 1 })",
      handoff: "airportControl.request({ action: 'handoffFlight', flightId: 1, station: 'tower' })",
      surfaceHold: "airportControl.command({ action: 'controlFlights', flightIds: [3], instruction: 'hold' })",
      focus: "airportControl.command({ action: 'focusFlight', flightId: 1 })",
      scenario: "airportControl.command({ action: 'setScenario', scenario: 'rush' })",
      trafficDensity: "airportControl.command({ action: 'setTrafficDensity', density: 'busy' })",
      separationRules: "airportControl.command({ action: 'setSeparationRuleset', ruleset: 'realistic' })",
      station: "airportControl.command({ action: 'setStation', station: 'ground' })",
      stationAutomation: "airportControl.request({ action: 'setStationAutomation', station: 'tower', enabled: true }) // Supervisor",
      emergency: "airportControl.command({ action: 'triggerEmergency', flightId: 1, type: 'medical' })",
      aircraft: 'airportControl.snapshot().flights[0].aircraft',
      surfaceGraph: 'airportControl.snapshot().surfaceGraph',
      replay: 'airportControl.replay()',
      recording: 'airportControl.recording() // seed + commands + weather + full-state frames',
      zigzag: "airportControl.command({ action: 'controlFlights', flightIds: [1], instruction: 'zigzag' })",
      weather: "airportControl.command({ action: 'setWeather', condition: 'rain', directionDegrees: 270, windSpeed: 18 })",
      weatherToggle: "airportControl.command({ action: 'setWeatherEnabled', enabled: false })",
      windToggle: "airportControl.command({ action: 'setWindEnabled', enabled: false })",
      runwayConfiguration: "airportControl.request({ action: 'setRunwayConfiguration', configurationId: 'ORD-EAST-IFR' }) // supervisor only; null restores automatic",
      closeTaxiway: "airportControl.request({ action: 'setSurfaceDisruption', kind: 'taxiway-closure', targetId: 'A', enabled: true, durationSeconds: 180 }) // supervisor",
      construction: "airportControl.request({ action: 'setSurfaceDisruption', kind: 'construction', targetId: 'edge-id', enabled: true }) // supervisor",
      reopenSurface: "airportControl.request({ action: 'clearSurfaceDisruption', disruptionId: 'SD-1' }) // supervisor",
      recoverAircraft: "airportControl.request({ action: 'recoverDisabledAircraft', flightId: 3 }) // ground or supervisor",
      broadcast: "new BroadcastChannel('airport-auto') // send { type: 'command', requestId, command }",
    };
  },
};

airportChannel?.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as { type?: string; requestId?: string; command?: AirportControlCommand } | null;
  if (!message || message.type !== 'command' || !message.command) return;
  const result = executeAirportRequest(message.command);
  airportChannel.postMessage({ type: 'response', requestId: message.requestId ?? null, result });
});
airportChannel?.postMessage({ type: 'ready', version: window.airportControl.version, snapshot: airportSnapshot() });

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
    headingDegrees: Number((trajectory.heading * 180 / Math.PI).toFixed(2)),
    pitchDegrees: Number((trajectory.pitch * 180 / Math.PI).toFixed(2)),
    bankDegrees: Number((trajectory.bank * 180 / Math.PI).toFixed(2)),
    onGround: trajectory.onGround,
    protectedRunway: trajectory.protectedRunway,
    distanceAlongMeters: Number(trajectory.distanceAlongM.toFixed(2)),
    totalDistanceMeters: Number(trajectory.totalDistanceM.toFixed(2)),
  };
}

function runwayDesignation(runwayId: number): string {
  return config.runways[runwayId]?.designation?.join('/') ?? String(runwayId + 1);
}

function aviationDegreesToMathAngle(degrees: number): number {
  return (90 - degrees) * Math.PI / 180;
}

function mathAngleToAviationDegrees(angle: number): number {
  return (90 - angle * 180 / Math.PI + 360) % 360;
}

if (telemetryEnabled) telemetryPanel.hidden = false;
const launchAirport = launchOptions.get('airport') ?? (soakEnabled ? 'ORD' : null);
if (launchAirport) selectAirport(launchAirport.toUpperCase(), true);
const launchSpeed = Number(launchOptions.get('speed'));
if (Number.isFinite(launchSpeed) && launchOptions.has('speed')) setSimulationSpeed(launchSpeed);
else if (soakEnabled) setSimulationSpeed(3);
const launchMode = launchOptions.get('mode');
if (launchMode === 'auto' || launchMode === 'assisted' || launchMode === 'manual' || launchMode === 'watch') selectControl(launchMode);
else if (soakEnabled) selectControl('auto');
if (launchOptions.get('night') === '1') {
  simulation.setNightMode(true);
  updateNightControl();
}
if (launchOptions.get('radar') === '1') {
  radarVisible = true;
  updateRadarControl();
}
if (launchOptions.get('queues') === '1') {
  queueInspectorVisible = true;
  updateQueueInspectorControl();
  renderQueueInspector();
}
const launchScenario = (launchOptions.get('scenario') ?? (soakEnabled ? 'rush' : null)) as TrafficScenario | null;
if (launchScenario && ['normal', 'rush', 'storm', 'closure', 'training', 'emergency'].includes(launchScenario)) setScenario(launchScenario);
const launchDensity = launchOptions.get('density');
if (launchDensity && isTrafficDensity(launchDensity)) {
  simulation.setTrafficDensity(launchDensity);
  newSession(true, config);
}
const launchRuleset = launchOptions.get('rules');
if (launchRuleset === 'forgiving' || launchRuleset === 'realistic') setSeparationRules(launchRuleset);
const launchStation = launchOptions.get('station') as ControllerStation | null;
if (launchStation && isControllerStation(launchStation)) setStation(launchStation);
const launchWeatherValue = launchOptions.get('weather');
const launchWeather = launchWeatherValue as WeatherCondition | null;
const launchWindDirection = Number(launchOptions.get('windDir') ?? 270);
const launchWindValue = launchOptions.get('wind');
const launchWindSpeed = Number(launchWindValue ?? 12);
if ((launchWeather === 'clear' || launchWeather === 'rain' || launchWeather === 'fog' || launchWeather === 'snow') && Number.isFinite(launchWindDirection) && Number.isFinite(launchWindSpeed)) {
  weatherSelection = launchWeather;
  simulation.setWeather(launchWeather, aviationDegreesToMathAngle(launchWindDirection), launchWindSpeed);
}
if (launchWeatherValue === 'off') simulation.setWeatherEnabled(false);
if (launchWindValue === 'off') simulation.setWindEnabled(false);
const launchRunwayConfiguration = launchOptions.get('runwayConfig');
if (launchRunwayConfiguration) {
  simulation.setRunwayConfiguration(launchRunwayConfiguration === 'auto' ? null : launchRunwayConfiguration);
  updateWeatherUi();
}
if (launchOptions.get('autostart') === '1' || soakEnabled) startShift();

requestAnimationFrame(frame);
window.addEventListener('beforeunload', () => {
  airportChannel?.close();
  world.dispose();
});

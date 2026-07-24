import './styles.css';
import { AirportSimulation } from './simulation/airportSimulation';
import { generateAirportConfig, generateHubConfig, HUB_AIRPORTS } from './simulation/airportConfig';
import { aircraftProfile } from './simulation/aircraftProfiles';
import { airlineProfile } from './simulation/airlineProfiles';
import type { ClearanceProposal, ControlMode, ControllerStation, EmergencyType, Flight, FlightInstruction, FlightPhase, ReplayFrame, TrafficScenario, WeatherCondition } from './simulation/types';
import { AmbientAudio, type AudioChannel, type AudioPreset } from './audio/ambientAudio';
import { createWorld } from './render/createWorld';

type AirportControlCommand =
  | { action: 'pause' | 'resume' | 'nextView' | 'zoomIn' | 'zoomOut' | 'resetCamera' | 'restart' }
  | { action: 'setSpeed'; value: number }
  | { action: 'setMode'; value: ControlMode }
  | { action: 'setNightMode'; enabled: boolean }
  | { action: 'setRadarVisible'; enabled: boolean }
  | { action: 'setRunwayLabelsVisible'; enabled: boolean }
  | { action: 'selectAirport'; code: string }
  | { action: 'clearFlight'; flightId: number; runway: number }
  | { action: 'clearRunwayEntry'; flightId: number }
  | { action: 'clearTakeoff'; flightId: number }
  | { action: 'clearRunwayCrossing'; flightId: number; runway: number }
  | { action: 'controlFlights'; flightIds: number[]; instruction: FlightInstruction }
  | { action: 'focusFlight'; flightId: number | null }
  | { action: 'setScenario'; scenario: TrafficScenario }
  | { action: 'setStation'; station: ControllerStation }
  | { action: 'triggerEmergency'; flightId: number; type: EmergencyType }
  | { action: 'setWeather'; condition: WeatherCondition; directionDegrees: number; windSpeed: number }
  | { action: 'setWeatherEnabled'; enabled: boolean }
  | { action: 'setWindEnabled'; enabled: boolean };

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
const scopeButton = $<HTMLButtonElement>('#scope-toggle');
const scopeLabel = $<HTMLElement>('#scope-label');
const brandMark = $<HTMLElement>('#brand-mark');
const airportName = $<HTMLElement>('#airport-name');
const airportMeta = $<HTMLElement>('#airport-meta');
const mapDataVersion = $<HTMLElement>('#map-data-version');
const mapDataAttribution = $<HTMLElement>('#map-data-attribution');
const mapDataSource = $<HTMLAnchorElement>('#map-data-source');
const mapSurfaceSource = $<HTMLAnchorElement>('#map-surface-source');
const instructionCopy = $<HTMLElement>('#instruction-copy');
const airportSelect = $<HTMLSelectElement>('#airport-select');
const controlSelect = $<HTMLSelectElement>('#control-select');
const scenarioSelect = $<HTMLSelectElement>('#scenario-select');
const stationSelect = $<HTMLSelectElement>('#station-select');
const introAirportSelect = $<HTMLSelectElement>('#intro-airport-select');
const introControlSelect = $<HTMLSelectElement>('#intro-control-select');
const speedControl = $<HTMLInputElement>('#speed-control');
const speedOutput = $<HTMLOutputElement>('#speed-output');
const weatherCondition = $<HTMLElement>('#weather-condition');
const weatherWind = $<HTMLElement>('#weather-wind');
const weatherVisibility = $<HTMLElement>('#weather-visibility');
const weatherToggle = $<HTMLButtonElement>('#weather-toggle');
const windToggle = $<HTMLButtonElement>('#wind-toggle');
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

let lastTime = performance.now();
let simulationAccumulator = 0;
const SIMULATION_STEP = 1 / 60;
let audioUpdateIn = 0;
let lastHudSecond = -1;
let lastArrivals = -1;
let lastDepartures = -1;
let hubIndex = 0;
let activeFlightId: number | null = null;
let routePoints: Array<{ x: number; y: number }> = [];
let simulationSpeed = 1;
let radarVisible = false;
let telemetrySequence = 0;
let lastWeatherCondition: WeatherCondition | null = null;
let lastPredictionKey = '';
let replayIndex = -1;
let replayMode = false;
let pausedBeforeReplay = false;
let focusedFlightId: number | null = null;
let runwayLabelsVisible = false;
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
debugPanel.hidden = !debugEnabled;
updateAirportUi();
updateNightControl();
updateRadarControl();
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
  focusedFlightId = null;
  world.resetCamera();
  renderFlightStrip();
  renderFlightActions();
});
runwayLabelButton.addEventListener('click', () => setRunwayLabelsVisible(!runwayLabelsVisible));
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
    if (focusedFlightId !== null) {
      focusedFlightId = null;
      world.selectFlight(null);
      renderFlightStrip();
      renderFlightActions();
    }
    return;
  }
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
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
  if (key === 'e') handleFlightAction(focusedFlightId, 'entry');
  if (key === 't') handleFlightAction(focusedFlightId, 'takeoff');
});

airportSelect.addEventListener('change', () => selectAirport(airportSelect.value, false));
introAirportSelect.addEventListener('change', () => selectAirport(introAirportSelect.value, true));
controlSelect.addEventListener('change', () => selectControl(controlSelect.value as ControlMode));
scenarioSelect.addEventListener('change', () => setScenario(scenarioSelect.value as TrafficScenario));
stationSelect.addEventListener('change', () => setStation(stationSelect.value as ControllerStation));
introControlSelect.addEventListener('change', () => selectControl(introControlSelect.value as ControlMode));
speedControl.addEventListener('input', () => setSimulationSpeed(Number(speedControl.value)));
weatherToggle.addEventListener('click', () => {
  simulation.setWeatherEnabled(!simulation.state.weather.weatherEnabled);
  updateWeatherUi();
});
windToggle.addEventListener('click', () => {
  simulation.setWindEnabled(!simulation.state.weather.windEnabled);
  updateWeatherUi();
});
audioPreset.addEventListener('change', () => audio.setPreset(audioPreset.value as AudioPreset));
for (const control of audioLevelControls) {
  control.addEventListener('input', () => audio.setLevel(control.dataset.audioLevel as AudioChannel, Number(control.value)));
}

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
  setStatus(radarVisible ? 'Radar circles visible' : 'Radar circles hidden', radarVisible ? 'range rings enabled for center view' : 'unobstructed map view restored');
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
  if (event.pointerType === 'touch' && !event.isPrimary) {
    activeFlightId = null;
    clearRoute();
    return;
  }
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

canvas.addEventListener('pointerup', finishRoute);
canvas.addEventListener('pointercancel', finishRoute);

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
  const delta = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  renderedFrames += 1;
  if (now - frameWindowStarted >= 1_000) {
    measuredFps = renderedFrames * 1_000 / Math.max(1, now - frameWindowStarted);
    renderedFrames = 0;
    frameWindowStarted = now;
  }
  if (!replayMode) {
    simulationAccumulator = Math.min(0.3, simulationAccumulator + delta);
    let ticks = 0;
    while (simulationAccumulator >= SIMULATION_STEP && ticks < 18) {
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
  if (now - lastFlightStripRender >= 200) {
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
    recordTelemetry(event.type, event.flight, event.runway, event.taxiway, {
      detail: event.detail ?? (event.type === 'safety-hold' ? event.flight.safetyHoldReason : undefined),
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
    if (event.type === 'clear') {
      audio.radio();
      setStatus(`${event.flight.callsign} cleared to land`, 'route accepted · runway lights are yours');
    }
    if (event.type === 'auto-clear') {
      audio.radio();
      setStatus(`${event.flight.callsign} cleared by the tower`, 'automatic approach is established');
    }
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
  }

  world.update(replayMode ? displayedState : presentationState(), delta);
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
  };
}

function presentationState(): typeof simulation.state {
  const current = simulation.state;
  const alpha = Math.max(0, Math.min(1, simulationAccumulator / SIMULATION_STEP));
  return {
    ...current,
    elapsed: previousPresentation.elapsed + (current.elapsed - previousPresentation.elapsed) * alpha,
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
    weather: { ...state.weather },
    activeRunwayEnds: { ...state.activeRunwayEnds },
    flights: state.flights.map((flight) => ({
      ...flight,
      surfaceRoute: flight.surfaceRoute ? [...flight.surfaceRoute] : undefined,
      surfaceRouteEdges: flight.surfaceRouteEdges ? [...flight.surfaceRouteEdges] : undefined,
      requiredCrossings: flight.requiredCrossings ? [...flight.requiredCrossings] : undefined,
      crossingClearances: flight.crossingClearances ? [...flight.crossingClearances] : undefined,
      crossingClearanceIds: flight.crossingClearanceIds ? [...flight.crossingClearanceIds] : undefined,
      kinematics: { ...flight.kinematics },
      motion: { ...flight.motion },
    })),
  };
}

function replayRecording(): ReplayRecording {
  return {
    schemaVersion: 1,
    simulationVersion: window.airportControl?.version ?? '2.1.0',
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
  if (focusedFlightId !== null && !flights.some((flight) => flight.id === focusedFlightId)) focusedFlightId = null;
  flightStripCount.textContent = flights.length === allFlights.length ? `${flights.length} aircraft` : `${flights.length} of ${allFlights.length} on frequency`;
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
  if (simulation.state.station === 'approach') return flights.filter((flight) => flight.phase === 'approach' || flight.phase === 'landing');
  if (simulation.state.station === 'ground') return flights.filter((flight) => flight.phase === 'taxi-in' || flight.phase === 'resting' || flight.phase === 'taxi-out');
  return flights.filter((flight) => flight.phase === 'approach' || flight.phase === 'landing' || flight.phase === 'takeoff' || (flight.phase === 'taxi-out' && flight.progress > 0.72));
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
  const phase = held ? 'Hold' : formatPhase(flight.phase);
  button.dataset.flightChip = String(flight.id);
  button.className = ['flight-chip', focusedFlightId === flight.id ? 'flight-chip--selected' : '', held ? 'flight-chip--hold' : '', flight.emergency ? 'flight-chip--emergency' : '', fuel < 15 ? 'flight-chip--low-fuel' : ''].filter(Boolean).join(' ');
  button.style.setProperty('--flight-accent', flight.palette === 'rose' ? 'var(--rose)' : flight.palette === 'sage' ? '#9bc8a0' : 'var(--blue)');
  button.style.setProperty('--fuel', `${fuel.toFixed(1)}%`);
  button.setAttribute('aria-label', `${flight.callsign}, ${flight.aircraft}, ${phase}, fuel ${fuel.toFixed(0)} percent, ${speedLabel} ${speed.toFixed(0)} knots, altitude ${altitude} feet`);
  const identity = button.querySelector('.flight-chip__identity')!;
  identity.querySelector('strong')!.textContent = flight.callsign;
  identity.querySelector('span')!.textContent = phase;
  const metrics = button.querySelectorAll<HTMLElement>('.flight-chip__metric');
  metrics[0].querySelector('b')!.innerHTML = `${fuel.toFixed(0)}<em>%</em>`;
  metrics[1].querySelector('small')!.textContent = speedLabel;
  metrics[1].querySelector('b')!.innerHTML = `${Math.round(speed)}<em>KT</em>`;
  metrics[2].querySelector('b')!.innerHTML = `${altitude.toLocaleString()}<em>FT</em>`;
  const detail = button.querySelector('.flight-chip__detail')!;
  detail.children[0].textContent = `${flight.aircraft} · ${formatPhase(flight.phase)} · RWY ${runwayDesignation(flight.runway)}`;
  detail.children[1].textContent = `${verticalText} · ${motionText}`;
}

function formatPhase(phase: FlightPhase): string {
  return phase.replace('-', ' ');
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

function renderFlightActions(): void {
  const flight = focusedFlightId === null ? null : displayState().flights.find((item) => item.id === focusedFlightId);
  flightActions.replaceChildren();
  flightActions.hidden = !flight;
  if (!flight) return;
  const heading = document.createElement('header');
  heading.innerHTML = '<div><b></b><small></small></div><span></span>';
  heading.querySelector('b')!.textContent = flight.callsign;
  heading.querySelector('small')!.textContent = `${flight.aircraft} · ${flight.origin} → ${flight.destination}`;
  heading.querySelector('span')!.textContent = simulation.state.station.toUpperCase();
  flightActions.append(heading);
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
  if (flight.phase === 'approach' && !flight.cleared) add('clear', `Land ${runwayDesignation(flight.runway)}`, !simulation.canIssue('approach'));
  if (flight.phase === 'approach' || flight.phase === 'landing') add('go-around', 'Go around', !simulation.canIssue('approach'));
  if (ground) add('hold-toggle', flight.controlHold ? 'Resume taxi' : 'Hold position', !simulation.canIssue('ground'));
  for (const runway of flight.crossingHoldRunway === undefined ? [] : [flight.crossingHoldRunway]) {
    add('cross', `Cross ${runwayDesignation(runway)}`, !simulation.canIssue('ground'), runway);
  }
  if (flight.phase === 'taxi-out' && flight.progress >= 0.985 && !flight.runwayEntryCleared) add('entry', `Line up ${runwayDesignation(flight.runway)}`, !simulation.canIssue('tower'));
  if (flight.phase === 'takeoff' && !flight.takeoffCleared) add('takeoff', `Take off ${runwayDesignation(flight.runway)}`, !simulation.canIssue('tower'));
  if (flight.phase !== 'resting') {
    add('slow', 'Slow');
    add('normal', 'Normal');
    if (!ground) add('expedite', 'Expedite');
  }
  flightActions.append(controls);
  if (!controls.children.length) {
    const note = document.createElement('p');
    note.textContent = replayMode ? 'Replay is read-only.' : 'No clearance required at this point.';
    flightActions.append(note);
  }
}

function renderClearanceAdvisor(): void {
  clearanceAdvisor.hidden = simulation.state.mode !== 'assisted' || replayMode;
  if (clearanceAdvisor.hidden) return;
  const authority = (proposal: ClearanceProposal): boolean => {
    if (simulation.state.station === 'supervisor') return true;
    if (proposal.station === 'approach') return simulation.canIssue('approach');
    if (proposal.station === 'tower') return simulation.canIssue('tower');
    return simulation.canIssue('ground');
  };
  const available = simulation.clearanceProposals().filter(authority);
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
  else if (proposal.action === 'cross') result = executeAirportRequest({ action: 'clearRunwayCrossing', flightId: proposal.flightId, runway: proposal.runway! });
  else if (proposal.action === 'line-up') result = executeAirportRequest({ action: 'clearRunwayEntry', flightId: proposal.flightId });
  else if (proposal.action === 'takeoff') result = executeAirportRequest({ action: 'clearTakeoff', flightId: proposal.flightId });
  else result = executeAirportRequest({ action: 'controlFlights', flightIds: [proposal.flightId], instruction: 'resume' });
  setStatus(result.accepted ? `${proposal.label} approved` : 'Proposal rejected', result.reason);
  renderFlightStrip();
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
  if (action === 'entry') executeAirportRequest({ action: 'clearRunwayEntry', flightId });
  if (action === 'takeoff') executeAirportRequest({ action: 'clearTakeoff', flightId });
  if (action === 'cross') executeAirportRequest({ action: 'clearRunwayCrossing', flightId, runway: Number(runwayValue) });
  if (action === 'hold-toggle') executeAirportRequest({ action: 'controlFlights', flightIds: [flightId], instruction: flight.controlHold ? 'resume' : 'hold' });
  if (action === 'slow' || action === 'normal' || action === 'expedite') executeAirportRequest({ action: 'controlFlights', flightIds: [flightId], instruction: action });
  renderFlightStrip();
  renderFlightActions();
}

telemetryControls.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action][data-flight]');
  if (!button) return;
  const flightId = Number(button.dataset.flight);
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
    return `<div class="telemetry__flight"><strong>${flight.callsign} · ${flight.aircraft} · ${flight.phase.toUpperCase()}${flight.taxiway ? ` · ${flight.taxiway}` : ''}${directive}</strong><small>${airline.name} · ${flight.registration} · ${flight.service} · ${profile.name} · ${profile.wakeClass} wake · ${profile.approachKts} kt approach</small>${flightControls}${crossings}${entry}${takeoff}</div>`;
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
  const zoomHint = ' · scroll to zoom';
  instructionCopy.innerHTML = mode === 'watch'
    ? `Watch mode · calm continuous traffic${zoomHint} · <b>select a flight to follow</b>`
    : mode === 'assisted'
      ? `Assisted ATC${zoomHint} · <b>approve the advisor’s safe clearances</b>`
      : mode === 'manual'
        ? `Full Manual ATC${zoomHint} · <b>select a flight for live clearances</b>`
        : `Continuous Auto tower${zoomHint} · <b>select a flight to follow</b>`;
  canvas.setAttribute('aria-label', mode === 'manual' || mode === 'assisted'
    ? `${mode === 'assisted' ? 'Assisted' : 'Manual'} air traffic control at ${config.name}. Select a flight card for clearances.`
    : `${mode === 'watch' ? 'Watch-only' : 'Automatic'} live traffic at ${config.name}. Select a flight card to follow it.`);
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
  radarButton.setAttribute('aria-label', radarVisible ? 'Hide radar circles' : 'Show radar circles');
  radarButton.classList.toggle('control--active', radarVisible);
  radarLabel.textContent = radarVisible ? 'Radar on' : 'Radar off';
  document.body.classList.toggle('radar-visible', radarVisible);
}

function newSession(paused: boolean, nextConfig = generateAirportConfig()): void {
  const mode = simulation.state.mode;
  const nightMode = simulation.state.nightMode;
  setControlPanelOpen(false);
  world.dispose();
  config = nextConfig;
  simulation = new AirportSimulation(config);
  simulation.setMode(mode);
  simulation.setNightMode(nightMode);
  simulation.setScenario(scenarioSelect.value as TrafficScenario);
  simulation.setStation(stationSelect.value as ControllerStation);
  simulation.setPace(simulationSpeed);
  simulation.setPaused(paused);
  world = createWorld(canvas, config);
  world.setRunwayLabelsVisible(runwayLabelsVisible);
  simulationAccumulator = 0;
  previousPresentation = capturePresentation(simulation.state);
  updateAirportUi();
  clearRoute();
  replayFrames.length = 0;
  commandHistory.length = 0;
  initialReplayState = cloneAirportState(simulation.state);
  focusedFlightId = null;
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
    mapDataVersion.textContent = config.surfaceData
      ? `FAA geometry + OSM surface graph · ${effective}`
      : `FAA vector foundation · ${effective}`;
    mapDataAttribution.textContent = config.surfaceData
      ? `${config.vectorData.attribution} ${config.surfaceData.attribution}. Retrieved ${config.vectorData.retrievedOn} · not for navigation.`
      : `${config.vectorData.attribution} Retrieved ${config.vectorData.retrievedOn} · imported geometry staged · not for navigation.`;
    mapDataSource.hidden = false;
    mapSurfaceSource.hidden = !config.surfaceData;
  } else {
    mapDataVersion.textContent = center ? 'Purpose-built ATC schematic' : 'Procedural airfield';
    mapDataAttribution.textContent = 'Original generated scenery · not for navigation';
    mapDataSource.hidden = true;
    mapSurfaceSource.hidden = true;
  }
  document.title = `${config.code === 'LOCAL' ? config.name : config.code} · Airport Auto`;
  scopeButton.setAttribute('aria-pressed', String(center));
  scopeButton.classList.toggle('control--active', center);
  scopeLabel.textContent = center ? 'Airfield' : 'Center';
  fieldLabel.textContent = center ? 'Next hub' : 'New field';
  fieldButton.setAttribute('aria-label', center ? 'Load the next major airport' : 'Generate a new airfield');
  airportSelect.value = config.code;
  introAirportSelect.value = config.code;
  document.body.classList.toggle('center-scope', center);
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
  const labels: Record<TrafficScenario, string> = { normal: 'Normal flow', rush: 'Rush hour', storm: 'Storm front', closure: 'Runway closure', training: 'Training pattern', emergency: 'Emergency response' };
  setStatus(`${labels[scenario]} scenario`, scenario === 'closure' ? 'one runway closed · arrivals re-sequencing' : scenario === 'storm' ? 'reduced visibility · wider spacing' : scenario === 'rush' ? 'compressed arrival stream · watch separation' : scenario === 'training' ? 'one aircraft at a time · practice clearances' : scenario === 'emergency' ? 'medical priority · keep a protected runway' : 'standard traffic picture');
}

function setStation(station: ControllerStation): void {
  simulation.setStation(station);
  stationSelect.value = station;
  const labels: Record<ControllerStation, string> = { supervisor: 'Supervisor', approach: 'Approach', tower: 'Tower', ground: 'Ground' };
  focusedFlightId = null;
  world.selectFlight(null);
  renderFlightStrip();
  setStatus(`${labels[station]} station`, station === 'supervisor' ? 'full picture · all clearances available' : `${labels[station].toLowerCase()} frequency selected`);
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
  const direction = Math.round(mathAngleToAviationDegrees(weather.windDirection) / 10) * 10 % 360;
  const speed = Math.round(weather.windSpeed);
  const gust = Math.round(weather.gustSpeed);
  weatherCondition.textContent = weather.weatherEnabled ? weather.condition : 'wx off';
  weatherWind.textContent = weather.windEnabled ? `${String(direction || 360).padStart(3, '0')}° ${speed}G${gust} kt` : 'calm · wind off';
  weatherVisibility.textContent = `${weather.visibility.toFixed(weather.visibility % 1 ? 1 : 0)} mi visibility`;
  weatherToggle.setAttribute('aria-pressed', String(weather.weatherEnabled));
  weatherToggle.textContent = weather.weatherEnabled ? 'WX ON' : 'WX OFF';
  windToggle.setAttribute('aria-pressed', String(weather.windEnabled));
  windToggle.textContent = weather.windEnabled ? 'WIND ON' : 'WIND OFF';
  if (lastWeatherCondition !== null && weather.condition !== lastWeatherCondition) {
    setStatus(`${weather.condition === 'clear' ? 'Weather improving' : `${weather.condition} moving onto the field`}`, weather.condition === 'fog' ? 'reduced arrival rate · slower taxi' : weather.condition === 'rain' ? 'wet runway spacing is active' : 'normal spacing restored');
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

function airportSnapshot() {
  const diagnostics = simulation.diagnostics();
  const movingPhases = new Set(['approach', 'landing', 'taxi-in', 'taxi-out', 'takeoff']);
  return {
    schemaVersion: 3,
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
        validationRules: { ...config.surfaceData.validationRules },
        license: config.surfaceData.license,
        attribution: config.surfaceData.attribution,
        copyrightUrl: config.surfaceData.copyrightUrl,
      } : null,
    },
    clock: Number(simulation.state.elapsed.toFixed(2)),
    paused: simulation.state.paused,
    gameOver: simulation.state.gameOver,
    mode: simulation.state.mode,
    nightMode: simulation.state.nightMode,
    radarVisible,
    station: simulation.state.station,
    scenario: simulation.state.scenario,
    speed: simulationSpeed,
    weather: {
      enabled: simulation.state.weather.weatherEnabled,
      windEnabled: simulation.state.weather.windEnabled,
      condition: simulation.state.weather.condition,
      windDirectionDegrees: Math.round(mathAngleToAviationDegrees(simulation.state.weather.windDirection)),
      windSpeed: Number(simulation.state.weather.windSpeed.toFixed(1)),
      gustSpeed: Number(simulation.state.weather.gustSpeed.toFixed(1)),
      visibilityMiles: simulation.state.weather.visibility,
    },
    score: { landed: simulation.state.arrivals, departed: simulation.state.departures },
    replay: {
      frames: replayFrames.length,
      durationSeconds: replayFrames.length ? replayFrames[replayFrames.length - 1].clock - replayFrames[0].clock : 0,
    },
    traffic: diagnostics,
    proposals: simulation.clearanceProposals(),
    renderer: world.diagnostics(),
    runways: config.runways.map((runway) => ({
      id: runway.id,
      designation: runway.designation?.join('/'),
      role: runway.role,
      landingEnd: runway.landingEnd,
      activeEnd: simulation.state.activeRunwayEnds[runway.id],
      activeDesignation: runway.designation?.[simulation.state.activeRunwayEnds[runway.id] === 1 ? 1 : 0],
      closed: simulation.state.closedRunway === runway.id,
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
      })),
      taxiways: config.surfaceGraph.taxiways.map((taxiway) => ({ ...taxiway, edgeIds: [...taxiway.edgeIds] })),
      stands: config.surfaceGraph.stands.map((stand) => ({ ...stand, position: [...stand.position] })),
      runwayAccess: config.surfaceGraph.runwayAccess.map((access) => ({ ...access })),
    },
    surface: simulation.state.flights
      .filter((flight) => flight.phase === 'taxi-in' || flight.phase === 'taxi-out')
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
        holdingShortOf: flight.holdShortRunway,
        runwayEntryCleared: flight.runwayEntryCleared,
        takeoffCleared: flight.takeoffCleared,
        requiredCrossings: flight.requiredCrossings ?? [],
        crossingClearances: flight.crossingClearances ?? [],
        crossingClearanceIds: flight.crossingClearanceIds ?? [],
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
      motion: { ...flight.motion },
      renderedAttitude: world.flightAttitude(flight.id),
      trajectory: flightTrajectorySnapshot(flight),
      gateSlot: flight.gateSlot,
      stand: flight.standId,
      cleared: flight.cleared,
      taxiway: flight.taxiway,
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
  if (command.action === 'setRunwayLabelsVisible') setRunwayLabelsVisible(command.enabled);
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
  if (command.action === 'setStation') {
    accepted = ['supervisor', 'approach', 'tower', 'ground'].includes(command.station);
    if (accepted) setStation(command.station);
    else reason = 'unknown controller station';
  }
  if (command.action === 'triggerEmergency') {
    accepted = simulation.triggerEmergency(command.flightId, command.type);
    if (!accepted) reason = 'flight is not available for that instruction';
  }
  if (command.action === 'setWeather') {
    accepted = ['clear', 'rain', 'fog'].includes(command.condition) && Number.isFinite(command.directionDegrees) && Number.isFinite(command.windSpeed);
    if (accepted) simulation.setWeather(command.condition, aviationDegreesToMathAngle(command.directionDegrees), command.windSpeed);
    else reason = 'weather requires a valid condition, direction, and wind speed';
  }
  if (command.action === 'setWeatherEnabled') simulation.setWeatherEnabled(command.enabled);
  if (command.action === 'setWindEnabled') simulation.setWindEnabled(command.enabled);
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
  version: '2.1.0',
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
      clearance: "airportControl.command({ action: 'clearFlight', flightId: 1, runway: 0 })",
      runwayEntry: "airportControl.command({ action: 'clearRunwayEntry', flightId: 1 })",
      takeoff: "airportControl.request({ action: 'clearTakeoff', flightId: 1 })",
      runwayCrossing: "airportControl.command({ action: 'clearRunwayCrossing', flightId: 1, runway: 4 })",
      controlOne: "airportControl.command({ action: 'controlFlights', flightIds: [1], instruction: 'slow' })",
      controlMany: "airportControl.command({ action: 'controlFlights', flightIds: [1, 2, 3], instruction: 'expedite' })",
      surfaceHold: "airportControl.command({ action: 'controlFlights', flightIds: [3], instruction: 'hold' })",
      focus: "airportControl.command({ action: 'focusFlight', flightId: 1 })",
      scenario: "airportControl.command({ action: 'setScenario', scenario: 'rush' })",
      station: "airportControl.command({ action: 'setStation', station: 'ground' })",
      emergency: "airportControl.command({ action: 'triggerEmergency', flightId: 1, type: 'medical' })",
      aircraft: 'airportControl.snapshot().flights[0].aircraft',
      surfaceGraph: 'airportControl.snapshot().surfaceGraph',
      replay: 'airportControl.replay()',
      recording: 'airportControl.recording() // seed + commands + weather + full-state frames',
      zigzag: "airportControl.command({ action: 'controlFlights', flightIds: [1], instruction: 'zigzag' })",
      weather: "airportControl.command({ action: 'setWeather', condition: 'rain', directionDegrees: 270, windSpeed: 18 })",
      weatherToggle: "airportControl.command({ action: 'setWeatherEnabled', enabled: false })",
      windToggle: "airportControl.command({ action: 'setWindEnabled', enabled: false })",
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
const launchScenario = (launchOptions.get('scenario') ?? (soakEnabled ? 'rush' : null)) as TrafficScenario | null;
if (launchScenario && ['normal', 'rush', 'storm', 'closure', 'training', 'emergency'].includes(launchScenario)) setScenario(launchScenario);
const launchStation = launchOptions.get('station') as ControllerStation | null;
if (launchStation && ['supervisor', 'approach', 'tower', 'ground'].includes(launchStation)) setStation(launchStation);
const launchWeatherValue = launchOptions.get('weather');
const launchWeather = launchWeatherValue as WeatherCondition | null;
const launchWindDirection = Number(launchOptions.get('windDir') ?? 270);
const launchWindValue = launchOptions.get('wind');
const launchWindSpeed = Number(launchWindValue ?? 12);
if ((launchWeather === 'clear' || launchWeather === 'rain' || launchWeather === 'fog') && Number.isFinite(launchWindDirection) && Number.isFinite(launchWindSpeed)) {
  simulation.setWeather(launchWeather, aviationDegreesToMathAngle(launchWindDirection), launchWindSpeed);
}
if (launchWeatherValue === 'off') simulation.setWeatherEnabled(false);
if (launchWindValue === 'off') simulation.setWindEnabled(false);
if (launchOptions.get('autostart') === '1' || soakEnabled) startShift();

requestAnimationFrame(frame);
window.addEventListener('beforeunload', () => {
  airportChannel?.close();
  world.dispose();
});

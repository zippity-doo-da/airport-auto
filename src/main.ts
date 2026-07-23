import './styles.css';
import { AirportSimulation } from './simulation/airportSimulation';
import { generateAirportConfig, generateHubConfig, HUB_AIRPORTS } from './simulation/airportConfig';
import { aircraftProfile } from './simulation/aircraftProfiles';
import { airlineProfile } from './simulation/airlineProfiles';
import type { ControlMode, ControllerStation, EmergencyType, FlightInstruction, ReplayFrame, TrafficScenario, WeatherCondition } from './simulation/types';
import { AmbientAudio } from './audio/ambientAudio';
import { createWorld } from './render/createWorld';

type AirportControlCommand =
  | { action: 'pause' | 'resume' | 'nextView' | 'restart' }
  | { action: 'setSpeed'; value: number }
  | { action: 'setMode'; value: ControlMode }
  | { action: 'selectAirport'; code: string }
  | { action: 'clearFlight'; flightId: number; runway: number }
  | { action: 'clearRunwayEntry'; flightId: number }
  | { action: 'clearRunwayCrossing'; flightId: number; runway: number }
  | { action: 'controlFlights'; flightIds: number[]; instruction: FlightInstruction }
  | { action: 'focusFlight'; flightId: number | null }
  | { action: 'setScenario'; scenario: TrafficScenario }
  | { action: 'setStation'; station: ControllerStation }
  | { action: 'triggerEmergency'; flightId: number; type: EmergencyType }
  | { action: 'setWeather'; condition: WeatherCondition; directionDegrees: number; windSpeed: number }
  | { action: 'setWeatherEnabled'; enabled: boolean }
  | { action: 'setWindEnabled'; enabled: boolean };

declare global {
  interface Window {
    airportControl: {
      version: string;
      snapshot(): ReturnType<typeof airportSnapshot>;
      events(limit?: number): TelemetryEvent[];
      command(command: AirportControlCommand): ReturnType<typeof airportSnapshot>;
      help(): Record<string, string>;
      replay(): ReplayFrame[];
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
};

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const canvas = $<HTMLCanvasElement>('#scene');
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
const scopeButton = $<HTMLButtonElement>('#scope-toggle');
const scopeLabel = $<HTMLElement>('#scope-label');
const brandMark = $<HTMLElement>('#brand-mark');
const airportName = $<HTMLElement>('#airport-name');
const airportMeta = $<HTMLElement>('#airport-meta');
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

let lastTime = performance.now();
let audioUpdateIn = 0;
let lastHudSecond = -1;
let lastArrivals = -1;
let lastDepartures = -1;
let hubIndex = 0;
let activeFlightId: number | null = null;
let routePoints: Array<{ x: number; y: number }> = [];
let simulationSpeed = 1;
let telemetrySequence = 0;
let lastWeatherCondition: WeatherCondition | null = null;
let lastPredictionKey = '';
let replayIndex = -1;
let replayMode = false;
const replayFrames: ReplayFrame[] = [];
const telemetryEvents: TelemetryEvent[] = [];
const launchOptions = new URLSearchParams(window.location.search);
const telemetryEnabled = launchOptions.get('telemetry') === '1';
updateAirportUi();

function startShift(): void {
  intro.classList.add('modal--hidden');
  simulation.setPaused(false);
  setStatus(`${config.code === 'LOCAL' ? config.name : config.code} control is open`, 'the tower will guide each arrival');
}

enterButton.addEventListener('click', startShift);

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

replayToggle.addEventListener('click', () => {
  replayMode = !replayMode;
  replayToggle.setAttribute('aria-pressed', String(replayMode));
  replayToggle.textContent = replayMode ? 'Live' : 'Replay';
  replaySlider.disabled = !replayMode || replayFrames.length === 0;
  if (!replayMode) replayIndex = -1;
  else replayIndex = Math.max(0, replayFrames.length - 1);
  updateReplayUi();
});
replaySlider.addEventListener('input', () => {
  replayIndex = Number(replaySlider.value);
  updateReplayUi();
});
replayExport.addEventListener('click', () => {
  const payload = JSON.stringify(replayFrames, null, 2);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  link.download = `${config.code.toLowerCase()}-replay.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus('Replay exported', `${replayFrames.length} frames · JSON download ready`);
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
  const mode: ControlMode = simulation.state.mode === 'auto' ? 'manual' : 'auto';
  simulation.setMode(mode);
  updateModeControl();
  setStatus(`${mode === 'auto' ? 'Automatic tower' : 'Manual control'} active`, mode === 'auto' ? 'the tower routes all traffic' : 'drag every arrival to its runway');
});

restartButton.addEventListener('click', () => {
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
  if (simulation.state.paused || simulation.state.gameOver) return;
  const id = world.pickFlight(event.clientX, event.clientY);
  const flight = simulation.state.flights.find((item) => item.id === id);
  if (!flight || flight.phase !== 'approach' || flight.cleared) return;
  activeFlightId = flight.id;
  routePoints = [world.flightScreenPosition(flight.id) ?? { x: event.clientX, y: event.clientY }, { x: event.clientX, y: event.clientY }];
  canvas.setPointerCapture(event.pointerId);
  world.selectFlight(flight.id);
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
  const delta = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  simulation.update(delta);
  audioUpdateIn -= delta;
  if (audioUpdateIn <= 0) {
    audio.setBreeze(simulation.state.breeze);
    audioUpdateIn = 0.25;
  }

  const hudSecond = Math.floor(simulation.state.elapsed);
  if (hudSecond !== lastHudSecond) {
    shiftTime.textContent = formatTime(simulation.state.elapsed);
    updateWeatherUi();
    lastHudSecond = hudSecond;
    const predictions = simulation.conflictPredictions();
    const predictionKey = predictions.map((prediction) => `${prediction.type}:${prediction.flights.join('-')}`).join('|');
    if (predictions.length && predictionKey !== lastPredictionKey) setStatus('Conflict forecast', predictions[0].detail);
    lastPredictionKey = predictionKey;
    replayFrames.push({
      clock: Number(simulation.state.elapsed.toFixed(2)),
      score: { landed: simulation.state.arrivals, departed: simulation.state.departures },
      flights: simulation.state.flights.map((flight) => ({ id: flight.id, callsign: flight.callsign, phase: flight.phase, runway: flight.runway, progress: Number(flight.progress.toFixed(3)) })),
      predictions,
    });
    if (replayFrames.length > 900) replayFrames.shift();
    updateSafetyUi(predictions);
    updateReplayUi();
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
    recordTelemetry(event.type, event.flight, event.runway, event.taxiway);
    if (event.type === 'chime') audio.chime();
    if (event.type === 'spawn') setStatus(
      `${event.flight.callsign} entering the hold`,
      simulation.state.mode === 'auto' ? 'tower plotting an automatic route' : 'awaiting your runway clearance',
    );
    if (event.type === 'clear') setStatus(`${event.flight.callsign} cleared to land`, 'route accepted · runway lights are yours');
    if (event.type === 'auto-clear') setStatus(`${event.flight.callsign} cleared by the tower`, 'automatic approach is established');
    if (event.type === 'land') setStatus(`${event.flight.callsign} touched down`, `${simulation.state.arrivals} safe arrival${simulation.state.arrivals === 1 ? '' : 's'}`);
    if (event.type === 'hold-short') setStatus(`${event.flight.callsign} holding short`, `${event.taxiway} · runway ${runwayDesignation(event.runway ?? event.flight.runway)}`);
    if (event.type === 'runway-entry') setStatus(`${event.flight.callsign} cleared onto runway`, `${event.taxiway} · runway ${runwayDesignation(event.runway ?? event.flight.runway)}`);
    if (event.type === 'runway-crossing') setStatus(`${event.flight.callsign} crossing clearance`, `cross runway ${runwayDesignation(event.runway ?? event.flight.runway)}`);
    if (event.type === 'depart') setStatus(`${event.flight.callsign} is away`, 'departure corridor is clear');
    if (event.type === 'conflict') showGameOver(event.flight.callsign);
    if (event.type === 'emergency') setStatus(`${event.flight.callsign} emergency`, `${event.flight.emergency} · priority handling active`);
  }

  world.update(simulation.state, delta);
  if (telemetryEnabled && hudSecond !== lastTelemetrySecond) {
    renderTelemetryControls();
    telemetryOutput.textContent = JSON.stringify(replayMode && replayFrames[replayIndex] ? { replay: replayFrames[replayIndex], live: airportSnapshot() } : airportSnapshot(), null, 2);
    updateReplayUi();
    lastTelemetrySecond = hudSecond;
  }
  requestAnimationFrame(frame);
}

telemetryControls.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action][data-flight]');
  if (!button) return;
  const flightId = Number(button.dataset.flight);
  if (button.dataset.action === 'entry') executeAirportCommand({ action: 'clearRunwayEntry', flightId });
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
    const crossings = (flight.requiredCrossings ?? [])
      .filter((runway) => flight.phase === 'taxi-out' && flight.progress >= 0.995 && !flight.crossingClearances?.includes(runway))
      .map((runway) => `<button data-action="cross" data-flight="${flight.id}" data-runway="${runway}">Clear cross ${runwayDesignation(runway)}</button>`)
      .join('');
    const entry = flight.phase !== 'taxi-out' || flight.progress < 0.995 || flight.runwayEntryCleared
      ? ''
      : `<button data-action="entry" data-flight="${flight.id}">Clear enter ${runwayDesignation(flight.runway)}</button>`;
    const directive = flight.controlHold ? ' · HELD' : flight.controlPattern === 'zigzag' ? ' · ZIGZAG' : flight.controlPace && flight.controlPace !== 1 ? ` · ${flight.controlPace < 1 ? 'SLOW' : 'EXPEDITE'}` : '';
    const profile = aircraftProfile(flight.aircraft);
    const airline = airlineProfile(flight.airline);
    return `<div class="telemetry__flight"><strong>${flight.callsign} · ${flight.aircraft} · ${flight.phase.toUpperCase()}${flight.taxiway ? ` · ${flight.taxiway}` : ''}${directive}</strong><small>${airline.name} · ${flight.registration} · ${flight.service} · ${profile.name} · ${profile.wakeClass} wake · ${profile.approachKts} kt approach</small>${flightControls}${crossings}${entry}</div>`;
  }).join('');
}

function updateSafetyUi(predictions = simulation.conflictPredictions()): void {
  const metrics = simulation.shiftMetrics();
  const penalty = predictions.reduce((sum, prediction) => sum + (prediction.severity === 'warning' ? 22 : 7), 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty - metrics.estimatedDelaySeconds / 90)));
  safetyScore.textContent = String(score).padStart(3, '0');
  safetyScore.style.color = score > 84 ? '#d9f4f4' : score > 64 ? '#f2c84b' : '#ef937f';
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
  status.animate(
    [{ transform: 'translateY(-5px)', opacity: 0.35 }, { transform: 'translateY(0)', opacity: 1 }],
    { duration: 420, easing: 'ease-out' },
  );
  statusLabel.textContent = label;
  statusDetail.textContent = detail;
}

function showGameOver(callsign: string): void {
  clearRoute();
  world.selectFlight(null);
  $<HTMLElement>('#final-time').textContent = formatTime(simulation.state.elapsed);
  $<HTMLElement>('#final-landed').textContent = two(simulation.state.arrivals);
  $<HTMLElement>('#final-departed').textContent = two(simulation.state.departures);
  gameOver.hidden = false;
  requestAnimationFrame(() => gameOver.classList.remove('modal--hidden'));
  setStatus(`${callsign} lost separation`, 'shift closed for safety review');
}

function two(value: number): string { return String(value).padStart(2, '0'); }
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${two(minutes)}:${two(Math.floor(seconds % 60))}`;
}

let lastTelemetrySecond = -1;

function updateModeControl(): void {
  const automatic = simulation.state.mode === 'auto';
  modeButton.setAttribute('aria-pressed', String(automatic));
  modeButton.classList.toggle('control--active', automatic);
  modeIcon.textContent = automatic ? 'A' : 'M';
  modeLabel.textContent = automatic ? 'Auto' : 'Manual';
  const zoomHint = config.scope === 'center' ? ' · scroll to zoom' : '';
  instructionCopy.innerHTML = automatic
    ? `The tower routes automatically${zoomHint} · <b>drag to take control</b>`
    : `Manual control${zoomHint} · <b>route every arrival</b>`;
  controlSelect.value = simulation.state.mode;
  introControlSelect.value = simulation.state.mode;
}

function newSession(paused: boolean, nextConfig = generateAirportConfig()): void {
  const mode = simulation.state.mode;
  world.dispose();
  config = nextConfig;
  simulation = new AirportSimulation(config);
  simulation.setMode(mode);
  simulation.setScenario(scenarioSelect.value as TrafficScenario);
  simulation.setStation(stationSelect.value as ControllerStation);
  simulation.setPace(simulationSpeed);
  simulation.setPaused(paused);
  world = createWorld(canvas, config);
  updateAirportUi();
  clearRoute();
  replayFrames.length = 0;
  lastPredictionKey = '';
  replayMode = false;
  replayIndex = -1;
  replayToggle.setAttribute('aria-pressed', 'false');
  replayToggle.textContent = 'Replay';
  updateReplayUi();
  updateModeControl();
}

function updateAirportUi(): void {
  airportName.textContent = config.name;
  const center = config.scope === 'center';
  brandMark.textContent = center ? config.code : config.name.charAt(0);
  airportMeta.textContent = center
    ? `${config.code} · center control · ${Math.round((config.annualOperations ?? 0) / 1000)}k ops/year`
    : 'Local · airfield control';
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
  setStatus(`${mode === 'auto' ? 'Full auto' : 'Full manual'} selected`, mode === 'auto' ? 'the tower routes all traffic' : 'you clear every arrival');
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
  setStatus(`${labels[station]} station`, station === 'supervisor' ? 'full picture · all clearances available' : `${labels[station].toLowerCase()} frequency selected`);
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
): void {
  telemetryEvents.push({
    sequence: ++telemetrySequence,
    airport: config.code,
    elapsed: Number(simulation.state.elapsed.toFixed(2)),
    type,
    flightId: flight?.id,
    callsign: flight?.callsign,
    runway: runway ?? flight?.runway,
    phase: flight?.phase,
    taxiway,
  });
  if (telemetryEvents.length > 500) telemetryEvents.splice(0, telemetryEvents.length - 500);
}

function airportSnapshot() {
  const diagnostics = simulation.diagnostics();
  const movingPhases = new Set(['approach', 'landing', 'taxi-in', 'taxi-out', 'takeoff']);
  return {
    schemaVersion: 1,
    airport: {
      code: config.code,
      name: config.name,
      scope: config.scope,
      operationsPerYear: config.annualOperations,
    },
    clock: Number(simulation.state.elapsed.toFixed(2)),
    paused: simulation.state.paused,
    mode: simulation.state.mode,
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
    runways: config.runways.map((runway) => ({
      id: runway.id,
      designation: runway.designation?.join('/'),
      role: runway.role,
      landingEnd: runway.landingEnd,
      occupiedBy: simulation.state.flights
        .filter((flight) => flight.runway === runway.id && movingPhases.has(flight.phase))
        .map((flight) => ({ id: flight.id, callsign: flight.callsign, phase: flight.phase, progress: Number(flight.progress.toFixed(3)) })),
    })),
    surface: simulation.state.flights
      .filter((flight) => flight.phase === 'taxi-in' || flight.phase === 'taxi-out')
      .map((flight) => ({
        id: flight.id,
        callsign: flight.callsign,
        phase: flight.phase,
        taxiway: flight.taxiway,
        progress: Number(flight.progress.toFixed(3)),
        holdingShortOf: flight.holdShortRunway,
        runwayEntryCleared: flight.runwayEntryCleared,
        requiredCrossings: flight.requiredCrossings ?? [],
        crossingClearances: flight.crossingClearances ?? [],
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
      cleared: flight.cleared,
      taxiway: flight.taxiway,
      holdingShortOf: flight.holdShortRunway,
      runwayEntryCleared: flight.runwayEntryCleared,
      requiredCrossings: flight.requiredCrossings ?? [],
      crossingClearances: flight.crossingClearances ?? [],
      control: {
        pace: flight.controlPace ?? 1,
        held: flight.controlHold ?? false,
        pattern: flight.controlPattern ?? null,
      },
    })),
    recentEvents: telemetryEvents.slice(-20),
  };
}

function executeAirportCommand(command: AirportControlCommand): ReturnType<typeof airportSnapshot> {
  if (command.action === 'pause') simulation.setPaused(true);
  if (command.action === 'resume') simulation.setPaused(false);
  if (command.action === 'nextView') world.nextView();
  if (command.action === 'setSpeed') setSimulationSpeed(command.value);
  if (command.action === 'setMode') selectControl(command.value);
  if (command.action === 'selectAirport') selectAirport(command.code.toUpperCase(), false);
  if (command.action === 'clearFlight') simulation.clearFlight(command.flightId, command.runway);
  if (command.action === 'clearRunwayEntry') simulation.clearRunwayEntry(command.flightId);
  if (command.action === 'clearRunwayCrossing') simulation.clearRunwayCrossing(command.flightId, command.runway);
  if (command.action === 'controlFlights') {
    const controlled = simulation.controlFlights(command.flightIds, command.instruction);
    const callsigns = simulation.state.flights.filter((flight) => controlled.includes(flight.id)).map((flight) => flight.callsign);
    if (callsigns.length) setStatus(`${command.instruction.toUpperCase()} command`, callsigns.join(' · '));
  }
  if (command.action === 'focusFlight') world.selectFlight(command.flightId);
  if (command.action === 'setScenario') setScenario(command.scenario);
  if (command.action === 'setStation') setStation(command.station);
  if (command.action === 'triggerEmergency') simulation.triggerEmergency(command.flightId, command.type);
  if (command.action === 'setWeather') simulation.setWeather(command.condition, aviationDegreesToMathAngle(command.directionDegrees), command.windSpeed);
  if (command.action === 'setWeatherEnabled') simulation.setWeatherEnabled(command.enabled);
  if (command.action === 'setWindEnabled') simulation.setWindEnabled(command.enabled);
  if (command.action === 'restart') newSession(false, config.code === 'LOCAL' ? generateAirportConfig() : generateHubConfig(hubIndex));
  recordTelemetry(`command:${command.action}`);
  return airportSnapshot();
}

window.airportControl = {
  version: '1.4.0',
  snapshot: airportSnapshot,
  events(limit = 100) { return telemetryEvents.slice(-Math.max(0, limit)); },
  replay() { return replayFrames.slice(); },
  command: executeAirportCommand,
  help() {
    return {
      snapshot: 'airportControl.snapshot()',
      events: 'airportControl.events(100)',
      pause: "airportControl.command({ action: 'pause' })",
      speed: "airportControl.command({ action: 'setSpeed', value: 2 })",
      airport: "airportControl.command({ action: 'selectAirport', code: 'ORD' })",
      mode: "airportControl.command({ action: 'setMode', value: 'auto' })",
      clearance: "airportControl.command({ action: 'clearFlight', flightId: 1, runway: 0 })",
      runwayEntry: "airportControl.command({ action: 'clearRunwayEntry', flightId: 1 })",
      runwayCrossing: "airportControl.command({ action: 'clearRunwayCrossing', flightId: 1, runway: 4 })",
      controlOne: "airportControl.command({ action: 'controlFlights', flightIds: [1], instruction: 'slow' })",
      controlMany: "airportControl.command({ action: 'controlFlights', flightIds: [1, 2, 3], instruction: 'expedite' })",
      surfaceHold: "airportControl.command({ action: 'controlFlights', flightIds: [3], instruction: 'hold' })",
      focus: "airportControl.command({ action: 'focusFlight', flightId: 1 })",
      scenario: "airportControl.command({ action: 'setScenario', scenario: 'rush' })",
      station: "airportControl.command({ action: 'setStation', station: 'ground' })",
      emergency: "airportControl.command({ action: 'triggerEmergency', flightId: 1, type: 'medical' })",
      aircraft: 'airportControl.snapshot().flights[0].aircraft',
      replay: 'airportControl.replay()',
      zigzag: "airportControl.command({ action: 'controlFlights', flightIds: [1], instruction: 'zigzag' })",
      weather: "airportControl.command({ action: 'setWeather', condition: 'rain', directionDegrees: 270, windSpeed: 18 })",
      weatherToggle: "airportControl.command({ action: 'setWeatherEnabled', enabled: false })",
      windToggle: "airportControl.command({ action: 'setWindEnabled', enabled: false })",
    };
  },
};

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
const launchAirport = launchOptions.get('airport');
if (launchAirport) selectAirport(launchAirport.toUpperCase(), launchOptions.get('autostart') !== '1');
const launchSpeed = Number(launchOptions.get('speed'));
if (Number.isFinite(launchSpeed) && launchOptions.has('speed')) setSimulationSpeed(launchSpeed);
const launchMode = launchOptions.get('mode');
if (launchMode === 'auto' || launchMode === 'manual') selectControl(launchMode);
const launchScenario = launchOptions.get('scenario') as TrafficScenario | null;
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
if (launchOptions.get('autostart') === '1') startShift();

requestAnimationFrame(frame);
window.addEventListener('beforeunload', () => world.dispose());

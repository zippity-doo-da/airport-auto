import type { FlightCameraMode } from "../playground/flightPlaygroundWorld";
import { createFlightPlaygroundWorld } from "../playground/flightPlaygroundWorld";
import {
  AIR_COMBAT_MANEUVERS,
  PILOT_PROFILES,
  maneuverDefinition,
} from "./airCombatManeuvers";
import {
  DOGFIGHT_AIRCRAFT_IDS,
  DOGFIGHT_AIRCRAFT_PROFILES,
  dogfightAircraftProfile,
  isDogfightAircraftId,
  type DogfightAircraftId,
} from "./combatAircraftProfiles";
import {
  DOGFIGHT_FIXED_STEP_SECONDS,
  createDogfightSimulation,
  restartDogfight,
  sampleDogfightFrame,
  setDogfightAircraftType,
  setDogfightCombatRules,
  setDogfightPilotSkill,
  setDogfightScenario,
  stepDogfightSimulation,
  type AirCombatManeuverId,
  type CombatRules,
  type CombatAircraftState,
  type CombatantId,
  type DogfightEvent,
  type DogfightFrame,
  type DogfightWeaponSettings,
  type PilotSkill,
} from "./dogfightSimulation";
import {
  COMBAT_ALTITUDE_IDS,
  COMBAT_ALTITUDES,
  COMBAT_THEATER_IDS,
  COMBAT_THEATERS,
  COMBAT_WEATHER,
  COMBAT_WEATHER_IDS,
  ENGAGEMENT_SETUP_IDS,
  ENGAGEMENT_SETUPS,
  scenarioLabel,
  type CombatAltitudeId,
  type CombatTheaterId,
  type CombatWeatherId,
  type DogfightScenarioSettings,
  type EngagementSetupId,
} from "./combatScenarios";
import "./dogfight.css";

interface DogfightSnapshot {
  timeSeconds: number;
  round: number;
  roundTimeSeconds: number;
  paused: boolean;
  playbackRate: number;
  phase: string;
  cameraMode: FlightCameraMode;
  cameraShot: string;
  score: Record<"f-35" | "j-20", number>;
  combatRules: CombatRules;
  weapons: DogfightWeaponSettings;
  scenario: DogfightScenarioSettings;
  aircraft: Array<{
    id: "f-35" | "j-20";
    aircraftType: DogfightAircraftId;
    aircraftName: string;
    health: number;
    speedKnots: number;
    altitudeFeet: number;
    missiles: number;
    cannonRounds: number;
    lockPercent: number;
    incomingWarning: boolean;
    alive: boolean;
    pilotSkill: PilotSkill;
    pilotCondition: CombatAircraftState["pilotCondition"];
    gLoad: number;
    availableG: number;
    fatiguePercent: number;
    consciousnessPercent: number;
    maneuverId: AirCombatManeuverId;
    maneuverName: string;
    position: { x: number; y: number; z: number };
  }>;
  effects: {
    missiles: number;
    tracers: number;
    flares: number;
    explosions: number;
  };
  statistics: DogfightFrame["statistics"];
  latestEvent: DogfightEvent;
  render: {
    drawCalls: number;
    triangles: number;
    geometries: number;
  };
}

declare global {
  interface Window {
    dogfightControl: {
      snapshot: () => DogfightSnapshot;
      setPaused: (paused: boolean) => DogfightSnapshot;
      setCameraMode: (mode: FlightCameraMode) => DogfightSnapshot;
      setPlaybackRate: (rate: number) => DogfightSnapshot;
      setWeapons: (
        settings: Partial<DogfightWeaponSettings>,
      ) => DogfightSnapshot;
      setCombatRules: (rules: CombatRules) => DogfightSnapshot;
      setScenario: (
        settings: Partial<DogfightScenarioSettings>,
        restartRound?: boolean,
      ) => DogfightSnapshot;
      scenarioCatalog: () => {
        theaters: typeof COMBAT_THEATERS;
        altitudes: typeof COMBAT_ALTITUDES;
        setups: typeof ENGAGEMENT_SETUPS;
        weather: typeof COMBAT_WEATHER;
      };
      setPilotSkill: (
        aircraftId: CombatantId,
        skill: PilotSkill,
      ) => DogfightSnapshot;
      setAircraftType: (
        aircraftId: CombatantId,
        aircraftType: DogfightAircraftId,
      ) => DogfightSnapshot;
      aircraftCatalog: () => typeof DOGFIGHT_AIRCRAFT_PROFILES;
      maneuverDictionary: () => typeof AIR_COMBAT_MANEUVERS;
      restartRound: (resetScore?: boolean) => DogfightSnapshot;
    };
  }
}

const canvas = required<HTMLCanvasElement>("combat-canvas");
const pauseButton = required<HTMLButtonElement>("pause-combat");
const gunsOnlyButton = required<HTMLButtonElement>("guns-only-toggle");
const cameraSelect = required<HTMLSelectElement>("camera-mode");
const speedInput = required<HTMLInputElement>("combat-speed");
const speedOutput = required<HTMLOutputElement>("combat-speed-output");
const restartButton = required<HTMLButtonElement>("restart-round");
const combatRulesSelect = required<HTMLSelectElement>("combat-rules");
const theaterSelect = required<HTMLSelectElement>("combat-theater");
const altitudeSelect = required<HTMLSelectElement>("combat-altitude");
const engagementSetupSelect = required<HTMLSelectElement>("engagement-setup");
const weatherSelect = required<HTMLSelectElement>("combat-weather");
const visibilityInput = required<HTMLInputElement>("combat-visibility");
const visibilityOutput = required<HTMLOutputElement>("visibility-output");
const windSpeedInput = required<HTMLInputElement>("wind-speed");
const windSpeedOutput = required<HTMLOutputElement>("wind-speed-output");
const windDirectionInput = required<HTMLInputElement>("wind-direction");
const windDirectionOutput = required<HTMLOutputElement>(
  "wind-direction-output",
);
const scenarioSummary = required<HTMLElement>("scenario-summary");
const scenarioDescription = required<HTMLElement>("scenario-description");
const f35AircraftSelect = required<HTMLSelectElement>("aircraft-f35");
const j20AircraftSelect = required<HTMLSelectElement>("aircraft-j20");
const f35PilotSelect = required<HTMLSelectElement>("pilot-f35");
const j20PilotSelect = required<HTMLSelectElement>("pilot-j20");
const missileToggle = required<HTMLInputElement>("weapon-missiles");
const cannonToggle = required<HTMLInputElement>("weapon-cannon");
const flareToggle = required<HTMLInputElement>("weapon-flares");
const maneuverDictionaryDialog = required<HTMLDialogElement>(
  "maneuver-dictionary",
);
const maneuverDictionaryOpen = required<HTMLButtonElement>(
  "maneuver-dictionary-open",
);
const maneuverDictionaryClose = required<HTMLButtonElement>(
  "maneuver-dictionary-close",
);
const maneuverList = required<HTMLElement>("maneuver-list");
const aircraftSpecificationsDialog = required<HTMLDialogElement>(
  "aircraft-specifications",
);
const aircraftSpecificationsOpen = required<HTMLButtonElement>(
  "aircraft-specifications-open",
);
const aircraftSpecificationsClose = required<HTMLButtonElement>(
  "aircraft-specifications-close",
);
const aircraftSpecificationList = required<HTMLElement>(
  "aircraft-specification-list",
);
const phaseLabel = required<HTMLElement>("combat-phase");
const roundStatus = required<HTMLElement>("round-status");
const scoreF35 = required<HTMLElement>("score-f35");
const scoreJ20 = required<HTMLElement>("score-j20");
const scoreNameF35 = required<HTMLElement>("score-name-f35");
const scoreNameJ20 = required<HTMLElement>("score-name-j20");
const eventPanel = required<HTMLElement>("combat-event");
const eventHeadline = required<HTMLElement>("event-headline");
const eventDetail = required<HTMLElement>("event-detail");
const hint = required<HTMLElement>("combat-hint");
const graphicsMessage = required<HTMLElement>("graphics-message");
const f35Label = required<HTMLElement>("label-f35");
const j20Label = required<HTMLElement>("label-j20");
const f35LabelHealth = required<HTMLElement>("label-health-f35");
const j20LabelHealth = required<HTMLElement>("label-health-j20");
const f35AircraftName = required<HTMLElement>("aircraft-name-f35");
const j20AircraftName = required<HTMLElement>("aircraft-name-j20");
const f35LabelName = required<HTMLElement>("label-name-f35");
const j20LabelName = required<HTMLElement>("label-name-j20");
const f35PilotName = required<HTMLElement>("pilot-name-f35");
const j20PilotName = required<HTMLElement>("pilot-name-j20");
const f35CameraName = required<HTMLOptionElement>("camera-name-f35");
const j20CameraName = required<HTMLOptionElement>("camera-name-j20");

const aircraftHud = {
  "f-35": {
    card: required<HTMLElement>("card-f35"),
    health: required<HTMLElement>("health-f35"),
    healthLabel: required<HTMLElement>("health-f35-label"),
    ammo: required<HTMLElement>("ammo-f35"),
    status: required<HTMLElement>("status-f35"),
  },
  "j-20": {
    card: required<HTMLElement>("card-j20"),
    health: required<HTMLElement>("health-j20"),
    healthLabel: required<HTMLElement>("health-j20-label"),
    ammo: required<HTMLElement>("ammo-j20"),
    status: required<HTMLElement>("status-j20"),
  },
} as const;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const simulation = createDogfightSimulation();
let cameraMode: FlightCameraMode = reducedMotion.matches
  ? "combat"
  : "director";
cameraSelect.value = cameraMode;

const world = createFlightPlaygroundWorld(canvas);
world.setEnvironment(simulation.scenario);
let running = true;
let lastFrameTime = performance.now();
let accumulatorSeconds = 0;
let elapsedRenderSeconds = 0;
let lastHudUpdate = -Infinity;
let currentFrame = sampleDogfightFrame(simulation);
let latestDiagnostics = {
  cameraShot: "Tactical overview",
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
};
let animationFrame = 0;
let hintTimeout = 0;
let lastQueuedEventId = 0;
let nextEventPresentationTime = 0;
let dictionaryWasPaused = false;
let specificationsWerePaused = false;
const eventQueue: DogfightEvent[] = [];

populateManeuverDictionary();
populateAircraftSpecifications();
bindControls();
queueUnseenEvents();
presentNextEvent(performance.now(), true);
updateControlState();
animationFrame = requestAnimationFrame(renderLoop);
hintTimeout = window.setTimeout(() => hint.classList.add("dismissed"), 9000);

function bindControls(): void {
  window.addEventListener("resize", world.resize);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    lastFrameTime = performance.now();
    accumulatorSeconds = 0;
  });

  pauseButton.addEventListener("click", () => setPaused(!simulation.paused));
  gunsOnlyButton.addEventListener("click", toggleGunsOnly);
  cameraSelect.addEventListener("change", () => {
    setCameraMode(cameraSelect.value as FlightCameraMode);
  });
  speedInput.addEventListener("input", () => {
    setPlaybackRate(Number(speedInput.value));
  });
  restartButton.addEventListener("click", () => restartRound());
  combatRulesSelect.addEventListener("change", () => {
    const rules = combatRulesSelect.value;
    if (isCombatRules(rules)) setCombatRules(rules);
  });
  theaterSelect.addEventListener("change", () => {
    const theaterId = theaterSelect.value;
    if (isCombatTheaterId(theaterId)) setScenario({ theaterId });
  });
  altitudeSelect.addEventListener("change", () => {
    const altitudeId = altitudeSelect.value;
    if (isCombatAltitudeId(altitudeId)) setScenario({ altitudeId });
  });
  engagementSetupSelect.addEventListener("change", () => {
    const setupId = engagementSetupSelect.value;
    if (isEngagementSetupId(setupId)) setScenario({ setupId });
  });
  weatherSelect.addEventListener("change", () => {
    const weatherId = weatherSelect.value;
    if (!isCombatWeatherId(weatherId)) return;
    setScenario({
      weatherId,
      visibilityKm: COMBAT_WEATHER[weatherId].defaultVisibilityKm,
    });
  });
  visibilityInput.addEventListener("input", () => {
    setScenario({ visibilityKm: Number(visibilityInput.value) }, false);
  });
  windSpeedInput.addEventListener("input", () => {
    setScenario({ windSpeedKnots: Number(windSpeedInput.value) }, false);
  });
  windDirectionInput.addEventListener("input", () => {
    setScenario({ windDirectionDeg: Number(windDirectionInput.value) }, false);
  });
  f35AircraftSelect.addEventListener("change", () => {
    const aircraftType = f35AircraftSelect.value;
    if (isDogfightAircraftId(aircraftType)) {
      setAircraftType("f-35", aircraftType);
    }
  });
  j20AircraftSelect.addEventListener("change", () => {
    const aircraftType = j20AircraftSelect.value;
    if (isDogfightAircraftId(aircraftType)) {
      setAircraftType("j-20", aircraftType);
    }
  });
  f35PilotSelect.addEventListener("change", () => {
    const skill = f35PilotSelect.value;
    if (isPilotSkill(skill)) setPilotSkill("f-35", skill);
  });
  j20PilotSelect.addEventListener("change", () => {
    const skill = j20PilotSelect.value;
    if (isPilotSkill(skill)) setPilotSkill("j-20", skill);
  });
  missileToggle.addEventListener("change", syncWeaponToggles);
  cannonToggle.addEventListener("change", syncWeaponToggles);
  flareToggle.addEventListener("change", syncWeaponToggles);
  maneuverDictionaryOpen.addEventListener("click", openManeuverDictionary);
  maneuverDictionaryClose.addEventListener("click", () => {
    maneuverDictionaryDialog.close();
  });
  maneuverDictionaryDialog.addEventListener("close", () => {
    setPaused(dictionaryWasPaused);
  });
  aircraftSpecificationsOpen.addEventListener(
    "click",
    openAircraftSpecifications,
  );
  aircraftSpecificationsClose.addEventListener("click", () => {
    aircraftSpecificationsDialog.close();
  });
  aircraftSpecificationsDialog.addEventListener("close", () => {
    setPaused(specificationsWerePaused);
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      setPaused(!simulation.paused);
    } else if (event.key.toLowerCase() === "c") {
      cycleCamera();
    } else if (event.key.toLowerCase() === "g") {
      toggleGunsOnly();
    } else if (event.key.toLowerCase() === "r") {
      restartRound();
    }
  });

  const pointers = new Map<number, { x: number; y: number }>();
  let previousPinchDistance = 0;
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previousPinchDistance = 0;
    dismissHint();
  });
  canvas.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      const deltaX = event.clientX - previous.x;
      const deltaY = event.clientY - previous.y;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 1) {
        setCameraMode("free");
        world.orbitBy(deltaX, deltaY);
      }
    } else if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      if (previousPinchDistance > 0 && distance > 0) {
        setCameraMode("free");
        world.zoomBy(previousPinchDistance / distance);
      }
      previousPinchDistance = distance;
    }
  });
  const releasePointer = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) previousPinchDistance = 0;
  };
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      setCameraMode("free");
      world.zoomBy(Math.exp(event.deltaY * 0.001));
      dismissHint();
    },
    { passive: false },
  );

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    running = false;
    graphicsMessage.hidden = false;
    graphicsMessage.textContent =
      "The combat view paused while the graphics context recovers.";
  });
  canvas.addEventListener("webglcontextrestored", () => {
    graphicsMessage.hidden = true;
    running = true;
    lastFrameTime = performance.now();
    world.resize();
  });

  window.addEventListener("beforeunload", () => {
    cancelAnimationFrame(animationFrame);
    window.clearTimeout(hintTimeout);
    world.dispose();
  });

  window.dogfightControl = {
    snapshot,
    setPaused,
    setCameraMode,
    setPlaybackRate,
    setWeapons,
    setCombatRules,
    setScenario,
    scenarioCatalog: () => ({
      theaters: COMBAT_THEATERS,
      altitudes: COMBAT_ALTITUDES,
      setups: ENGAGEMENT_SETUPS,
      weather: COMBAT_WEATHER,
    }),
    setPilotSkill,
    setAircraftType,
    aircraftCatalog: () => DOGFIGHT_AIRCRAFT_PROFILES,
    maneuverDictionary: () =>
      AIR_COMBAT_MANEUVERS.map((maneuver) => ({ ...maneuver })),
    restartRound,
  };
}

function renderLoop(now: number): void {
  const rawDeltaSeconds = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  if (running) {
    if (!simulation.paused) accumulatorSeconds += rawDeltaSeconds;
    while (accumulatorSeconds >= DOGFIGHT_FIXED_STEP_SECONDS) {
      stepDogfightSimulation(simulation, DOGFIGHT_FIXED_STEP_SECONDS);
      accumulatorSeconds -= DOGFIGHT_FIXED_STEP_SECONDS;
    }
    currentFrame = sampleDogfightFrame(simulation);
    elapsedRenderSeconds += rawDeltaSeconds;
    latestDiagnostics = world.update(
      currentFrame.flight,
      elapsedRenderSeconds,
      rawDeltaSeconds,
      cameraMode,
      currentFrame.effects,
    );
    updateAircraftLabels(currentFrame);
    if (now - lastHudUpdate > 90) {
      updateHud(currentFrame, now);
      lastHudUpdate = now;
    }
  }

  animationFrame = requestAnimationFrame(renderLoop);
}

function updateAircraftLabels(frame: DogfightFrame): void {
  const points = world.projectAircraft(frame.flight);
  placeAircraftLabel(f35Label, points[0]);
  placeAircraftLabel(j20Label, points[1]);
  f35LabelHealth.textContent = `${Math.round(frame.aircraft[0].health)}`;
  j20LabelHealth.textContent = `${Math.round(frame.aircraft[1].health)}`;
}

function placeAircraftLabel(
  element: HTMLElement,
  point: { x: number; y: number; visible: boolean },
): void {
  element.hidden = !point.visible;
  if (!point.visible) return;
  element.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`;
}

function updateHud(frame: DogfightFrame, now: number): void {
  phaseLabel.textContent = frame.phaseLabel;
  const rulesLabel =
    simulation.combatRules === "guns-only"
      ? "Guns only"
      : simulation.combatRules === "custom"
        ? "Custom"
        : "Full combat";
  roundStatus.textContent = `Round ${frame.round} · ${formatTime(frame.roundTimeSeconds)} · ${rulesLabel} · ${scenarioLabel(simulation.scenario)} · ${latestDiagnostics.cameraShot}`;
  scoreF35.textContent = String(frame.score["f-35"]);
  scoreJ20.textContent = String(frame.score["j-20"]);
  updateAircraftHud(frame.aircraft[0]);
  updateAircraftHud(frame.aircraft[1]);
  queueUnseenEvents();
  presentNextEvent(now);
}

function updateAircraftHud(aircraft: CombatAircraftState): void {
  const hud = aircraftHud[aircraft.id];
  const health = Math.max(0, Math.min(100, aircraft.health));
  hud.health.style.transform = `scaleX(${(health / 100).toFixed(3)})`;
  hud.healthLabel.textContent = `${Math.round(health)}%`;
  const speedKnots = Math.round(aircraft.speedMps / 0.514444);
  const altitudeFeet = Math.round((aircraft.position.y * 3.28084) / 100) * 100;
  const weaponReadout =
    simulation.combatRules === "guns-only"
      ? `${aircraft.cannonRounds} RDS`
      : `${aircraft.missilesRemaining} MSL · ${aircraft.cannonRounds} RDS`;
  hud.ammo.textContent = `${weaponReadout} · ${speedKnots} KT · ${altitudeFeet.toLocaleString()} FT`;
  hud.card.classList.toggle("warning", aircraft.incomingWarning);
  hud.card.classList.toggle("defeated", !aircraft.alive);
  hud.card.classList.toggle(
    "strained",
    aircraft.pilotCondition === "strained" ||
      aircraft.pilotCondition === "recovering",
  );
  const maneuverName = maneuverDefinition(aircraft.currentManeuver).name;
  const pilotName = PILOT_PROFILES[aircraft.pilotSkill].name;
  const load = `${aircraft.gLoad.toFixed(1)} G`;
  if (!aircraft.alive) {
    hud.status.textContent = "DEFEATED";
  } else if (aircraft.incomingWarning) {
    hud.status.textContent = `MISSILE · ${maneuverName} · ${load}`;
  } else if (aircraft.lockProgress >= 0.96) {
    hud.status.textContent = `LOCK · ${maneuverName} · ${load}`;
  } else if (aircraft.lockProgress > 0.12) {
    hud.status.textContent = `${maneuverName} · ${load} · ${Math.round(aircraft.lockProgress * 100)}% LOCK`;
  } else {
    hud.status.textContent = `${maneuverName} · ${load} · ${pilotName}`;
  }
}

function queueUnseenEvents(): void {
  const unseen = simulation.events
    .filter((event) => event.id > lastQueuedEventId)
    .reverse();
  for (const event of unseen) {
    if (
      event.kind === "cannon" &&
      eventQueue.some((queued) => queued.kind === "cannon")
    ) {
      continue;
    }
    eventQueue.push(event);
    lastQueuedEventId = Math.max(lastQueuedEventId, event.id);
  }
  if (eventQueue.length > 6) {
    const important = eventQueue.filter((event) =>
      ["missile", "flares", "hit", "decoy", "splash", "round"].includes(
        event.kind,
      ),
    );
    eventQueue.splice(0, eventQueue.length, ...important.slice(-6));
  }
}

function presentNextEvent(now: number, immediate = false): void {
  if (!immediate && now < nextEventPresentationTime) return;
  const event = eventQueue.shift();
  if (!event) return;
  eventHeadline.textContent = event.headline;
  eventDetail.textContent = event.detail;
  eventPanel.dataset.team = event.team;
  nextEventPresentationTime =
    now + (event.kind === "splash" || event.kind === "round" ? 2400 : 1650);
}

function setPaused(paused: boolean): DogfightSnapshot {
  simulation.paused = Boolean(paused);
  accumulatorSeconds = 0;
  updateControlState();
  return snapshot();
}

function setCameraMode(mode: FlightCameraMode): DogfightSnapshot {
  if (!isDogfightCameraMode(mode)) return snapshot();
  cameraMode = mode;
  cameraSelect.value = mode;
  updateControlState();
  return snapshot();
}

function setPlaybackRate(rate: number): DogfightSnapshot {
  simulation.playbackRate = clamp(Number(rate) || 1, 0.4, 1.75);
  speedInput.value = simulation.playbackRate.toFixed(2);
  updateControlState();
  return snapshot();
}

function setWeapons(
  settings: Partial<DogfightWeaponSettings>,
): DogfightSnapshot {
  const missilesWereEnabled = simulation.weaponSettings.missiles;
  if (typeof settings.missiles === "boolean") {
    simulation.weaponSettings.missiles = settings.missiles;
  }
  if (typeof settings.cannon === "boolean") {
    simulation.weaponSettings.cannon = settings.cannon;
  }
  if (typeof settings.countermeasures === "boolean") {
    simulation.weaponSettings.countermeasures = settings.countermeasures;
  }
  if (!simulation.weaponSettings.missiles) {
    simulation.missiles = [];
    for (const aircraft of simulation.aircraft) {
      aircraft.lockProgress = 0;
      aircraft.incomingWarning = false;
    }
  } else if (!missilesWereEnabled) {
    for (const aircraft of simulation.aircraft) {
      if (aircraft.missilesRemaining === 0) aircraft.missilesRemaining = 6;
    }
  }
  if (!simulation.weaponSettings.countermeasures) simulation.flares = [];

  if (
    simulation.weaponSettings.missiles &&
    simulation.weaponSettings.cannon &&
    simulation.weaponSettings.countermeasures
  ) {
    simulation.combatRules = "full";
  } else if (
    !simulation.weaponSettings.missiles &&
    simulation.weaponSettings.cannon &&
    !simulation.weaponSettings.countermeasures
  ) {
    simulation.combatRules = "guns-only";
    for (const aircraft of simulation.aircraft) {
      aircraft.missilesRemaining = 0;
    }
  } else {
    simulation.combatRules = "custom";
  }
  updateControlState();
  return snapshot();
}

function setCombatRules(rules: CombatRules): DogfightSnapshot {
  if (!isCombatRules(rules)) return snapshot();
  setDogfightCombatRules(simulation, rules);
  return restartRound();
}

function toggleGunsOnly(): void {
  setCombatRules(simulation.weaponSettings.missiles ? "guns-only" : "full");
}

function setScenario(
  settings: Partial<DogfightScenarioSettings>,
  shouldRestart = true,
): DogfightSnapshot {
  const accepted: Partial<DogfightScenarioSettings> = {};
  if (
    settings.theaterId !== undefined &&
    isCombatTheaterId(settings.theaterId)
  ) {
    accepted.theaterId = settings.theaterId;
  }
  if (
    settings.altitudeId !== undefined &&
    isCombatAltitudeId(settings.altitudeId)
  ) {
    accepted.altitudeId = settings.altitudeId;
  }
  if (settings.setupId !== undefined && isEngagementSetupId(settings.setupId)) {
    accepted.setupId = settings.setupId;
  }
  if (
    settings.weatherId !== undefined &&
    isCombatWeatherId(settings.weatherId)
  ) {
    accepted.weatherId = settings.weatherId;
  }
  if (Number.isFinite(settings.visibilityKm)) {
    accepted.visibilityKm = Number(settings.visibilityKm);
  }
  if (Number.isFinite(settings.windSpeedKnots)) {
    accepted.windSpeedKnots = Number(settings.windSpeedKnots);
  }
  if (Number.isFinite(settings.windDirectionDeg)) {
    accepted.windDirectionDeg = Number(settings.windDirectionDeg);
  }

  setDogfightScenario(simulation, accepted);
  world.setEnvironment(simulation.scenario);
  if (shouldRestart) return restartRound();
  currentFrame = sampleDogfightFrame(simulation);
  updateControlState();
  return snapshot();
}

function setPilotSkill(
  aircraftId: CombatantId,
  skill: PilotSkill,
): DogfightSnapshot {
  if (
    !isPilotSkill(skill) ||
    (aircraftId !== "f-35" && aircraftId !== "j-20")
  ) {
    return snapshot();
  }
  setDogfightPilotSkill(simulation, aircraftId, skill);
  return restartRound();
}

function setAircraftType(
  aircraftId: CombatantId,
  aircraftType: DogfightAircraftId,
): DogfightSnapshot {
  if (
    !isDogfightAircraftId(aircraftType) ||
    (aircraftId !== "f-35" && aircraftId !== "j-20")
  ) {
    return snapshot();
  }
  setDogfightAircraftType(simulation, aircraftId, aircraftType);
  return restartRound();
}

function restartRound(resetScore = false): DogfightSnapshot {
  restartDogfight(simulation, Boolean(resetScore));
  accumulatorSeconds = 0;
  currentFrame = sampleDogfightFrame(simulation);
  eventQueue.length = 0;
  const roundEvent = simulation.events[0];
  if (roundEvent) {
    lastQueuedEventId = roundEvent.id;
    eventQueue.push(roundEvent);
  }
  presentNextEvent(performance.now(), true);
  updateControlState();
  return snapshot();
}

function syncWeaponToggles(): void {
  setWeapons({
    missiles: missileToggle.checked,
    cannon: cannonToggle.checked,
    countermeasures: flareToggle.checked,
  });
}

function updateControlState(): void {
  pauseButton.dataset.paused = String(simulation.paused);
  pauseButton.setAttribute("aria-pressed", String(simulation.paused));
  pauseButton.textContent = simulation.paused ? "Resume" : "Pause";
  speedOutput.value = `${simulation.playbackRate.toFixed(2)}×`;
  const gunsOnly = !simulation.weaponSettings.missiles;
  gunsOnlyButton.dataset.mode = gunsOnly ? "guns-only" : "missiles";
  gunsOnlyButton.setAttribute("aria-pressed", String(gunsOnly));
  gunsOnlyButton.setAttribute(
    "aria-label",
    gunsOnly
      ? "Guns-only combat is active. Activate to enable missiles."
      : "Missiles are enabled. Activate for guns-only combat.",
  );
  gunsOnlyButton.textContent = gunsOnly ? "Guns only" : "Missiles + guns";
  combatRulesSelect.value = simulation.combatRules;
  theaterSelect.value = simulation.scenario.theaterId;
  altitudeSelect.value = simulation.scenario.altitudeId;
  engagementSetupSelect.value = simulation.scenario.setupId;
  weatherSelect.value = simulation.scenario.weatherId;
  visibilityInput.value = simulation.scenario.visibilityKm.toFixed(0);
  visibilityOutput.value = `${Math.round(simulation.scenario.visibilityKm)} km`;
  visibilityOutput.setAttribute(
    "aria-label",
    `Visibility ${Math.round(simulation.scenario.visibilityKm)} kilometres`,
  );
  windSpeedInput.value = simulation.scenario.windSpeedKnots.toFixed(0);
  windSpeedOutput.value = `${Math.round(simulation.scenario.windSpeedKnots)} kt`;
  windSpeedOutput.setAttribute(
    "aria-label",
    `Wind speed ${Math.round(simulation.scenario.windSpeedKnots)} knots`,
  );
  windDirectionInput.value = simulation.scenario.windDirectionDeg.toFixed(0);
  windDirectionOutput.value = `${Math.round(simulation.scenario.windDirectionDeg)}° ${compassDirection(simulation.scenario.windDirectionDeg)}`;
  windDirectionOutput.setAttribute(
    "aria-label",
    `Wind from ${Math.round(simulation.scenario.windDirectionDeg)} degrees ${compassDirection(simulation.scenario.windDirectionDeg)}`,
  );
  scenarioSummary.textContent = scenarioLabel(simulation.scenario);
  scenarioDescription.textContent = `${COMBAT_ALTITUDES[simulation.scenario.altitudeId].description} ${COMBAT_THEATERS[simulation.scenario.theaterId].description} ${COMBAT_WEATHER[simulation.scenario.weatherId].description}`;
  f35AircraftSelect.value = simulation.aircraft[0].aircraftType;
  j20AircraftSelect.value = simulation.aircraft[1].aircraftType;
  f35PilotSelect.value = simulation.aircraft[0].pilotSkill;
  j20PilotSelect.value = simulation.aircraft[1].pilotSkill;
  missileToggle.checked = simulation.weaponSettings.missiles;
  cannonToggle.checked = simulation.weaponSettings.cannon;
  flareToggle.checked = simulation.weaponSettings.countermeasures;
  const customWeapons = simulation.combatRules === "custom";
  missileToggle.disabled = !customWeapons;
  cannonToggle.disabled = !customWeapons;
  flareToggle.disabled = !customWeapons;
  updateAircraftNames();
  document.body.classList.toggle("flight-paused", simulation.paused);
}

function updateAircraftNames(): void {
  const f35Profile = dogfightAircraftProfile(
    simulation.aircraft[0].aircraftType,
  );
  const j20Profile = dogfightAircraftProfile(
    simulation.aircraft[1].aircraftType,
  );
  scoreNameF35.textContent = f35Profile.shortName;
  scoreNameJ20.textContent = j20Profile.shortName;
  f35AircraftName.textContent = f35Profile.shortName;
  j20AircraftName.textContent = j20Profile.shortName;
  f35LabelName.textContent = f35Profile.shortName;
  j20LabelName.textContent = j20Profile.shortName;
  f35PilotName.textContent = `${f35Profile.shortName} pilot`;
  j20PilotName.textContent = `${j20Profile.shortName} pilot`;
  f35CameraName.textContent = `${f35Profile.shortName} chase`;
  j20CameraName.textContent = `${j20Profile.shortName} chase`;
  canvas.setAttribute(
    "aria-label",
    `Three-dimensional fictional AI dogfight between ${f35Profile.name} and ${j20Profile.name}. Drag to orbit and scroll or pinch to zoom.`,
  );
}

function cycleCamera(): void {
  const modes: FlightCameraMode[] = [
    "director",
    "combat",
    "f-35",
    "j-20",
    "wide",
    "free",
  ];
  const index = modes.indexOf(cameraMode);
  setCameraMode(modes[(index + 1) % modes.length]);
}

function snapshot(): DogfightSnapshot {
  return {
    timeSeconds: Number(currentFrame.flight.timeSeconds.toFixed(3)),
    round: currentFrame.round,
    roundTimeSeconds: Number(currentFrame.roundTimeSeconds.toFixed(3)),
    paused: simulation.paused,
    playbackRate: simulation.playbackRate,
    phase: currentFrame.phaseLabel,
    cameraMode,
    cameraShot: latestDiagnostics.cameraShot,
    score: { ...currentFrame.score },
    combatRules: simulation.combatRules,
    weapons: { ...simulation.weaponSettings },
    scenario: { ...simulation.scenario },
    aircraft: currentFrame.aircraft.map((aircraft) => ({
      id: aircraft.id,
      aircraftType: aircraft.aircraftType,
      aircraftName: dogfightAircraftProfile(aircraft.aircraftType).name,
      health: Number(aircraft.health.toFixed(2)),
      speedKnots: Math.round(aircraft.speedMps / 0.514444),
      altitudeFeet: Math.round((aircraft.position.y * 3.28084) / 100) * 100,
      missiles: aircraft.missilesRemaining,
      cannonRounds: aircraft.cannonRounds,
      lockPercent: Math.round(aircraft.lockProgress * 100),
      incomingWarning: aircraft.incomingWarning,
      alive: aircraft.alive,
      pilotSkill: aircraft.pilotSkill,
      pilotCondition: aircraft.pilotCondition,
      gLoad: Number(aircraft.gLoad.toFixed(2)),
      availableG: Number(aircraft.availableG.toFixed(2)),
      fatiguePercent: Math.round(aircraft.pilotFatigue * 100),
      consciousnessPercent: Math.round(aircraft.consciousness * 100),
      maneuverId: aircraft.currentManeuver,
      maneuverName: maneuverDefinition(aircraft.currentManeuver).name,
      position: {
        x: Number(aircraft.position.x.toFixed(2)),
        y: Number(aircraft.position.y.toFixed(2)),
        z: Number(aircraft.position.z.toFixed(2)),
      },
    })),
    effects: {
      missiles: currentFrame.effects.missiles.length,
      tracers: currentFrame.effects.tracers.length,
      flares: currentFrame.effects.flares.length,
      explosions: currentFrame.effects.explosions.length,
    },
    statistics: { ...currentFrame.statistics },
    latestEvent: { ...currentFrame.latestEvent },
    render: {
      drawCalls: latestDiagnostics.drawCalls,
      triangles: latestDiagnostics.triangles,
      geometries: latestDiagnostics.geometries,
    },
  };
}

function populateManeuverDictionary(): void {
  const fragment = document.createDocumentFragment();
  for (const maneuver of AIR_COMBAT_MANEUVERS) {
    const card = document.createElement("article");
    card.className = "maneuver-card";

    const heading = document.createElement("div");
    heading.className = "maneuver-card-heading";
    const title = document.createElement("h3");
    title.textContent = maneuver.name;
    const category = document.createElement("span");
    category.className = "maneuver-category";
    category.textContent = maneuver.category;
    heading.append(title, category);

    const summary = document.createElement("p");
    summary.textContent = maneuver.summary;
    const useWhen = document.createElement("p");
    useWhen.textContent = `Used when: ${maneuver.useWhen}`;

    const metrics = document.createElement("dl");
    appendManeuverMetric(
      metrics,
      "Pilot",
      `${PILOT_PROFILES[maneuver.minimumSkill].name}+`,
    );
    appendManeuverMetric(
      metrics,
      "G band",
      `${maneuver.nominalG.toFixed(1)}–${maneuver.maximumG.toFixed(1)} G`,
    );
    appendManeuverMetric(
      metrics,
      "Nominal time",
      `${maneuver.durationSeconds.toFixed(1)} s`,
    );
    card.append(heading, summary, useWhen, metrics);
    fragment.append(card);
  }
  maneuverList.replaceChildren(fragment);
}

function populateAircraftSpecifications(): void {
  const fragment = document.createDocumentFragment();
  for (const aircraftId of DOGFIGHT_AIRCRAFT_IDS) {
    const profile = dogfightAircraftProfile(aircraftId);
    const specifications = profile.specifications;
    const card = document.createElement("article");
    card.className = "aircraft-specification-card";
    card.dataset.disclosure = specifications.disclosure;

    const heading = document.createElement("div");
    heading.className = "aircraft-specification-heading";
    const headingCopy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = profile.name;
    const identity = document.createElement("p");
    identity.textContent = `${specifications.nation} · ${specifications.manufacturer} · first flight ${specifications.firstFlight}`;
    headingCopy.append(title, identity);
    const disclosure = document.createElement("span");
    disclosure.className = "aircraft-disclosure-badge";
    disclosure.textContent =
      specifications.disclosure === "official"
        ? "Official figures"
        : "Limited public data";
    heading.append(headingCopy, disclosure);

    const metrics = document.createElement("dl");
    metrics.className = "aircraft-specification-grid";
    const takeoffWeight =
      specifications.normalTakeoffWeightKg === null
        ? formatMass(specifications.maximumTakeoffWeightKg)
        : `${formatMass(specifications.normalTakeoffWeightKg)} normal · ${formatMass(specifications.maximumTakeoffWeightKg)} max`;
    const values: Array<[string, string]> = [
      ["Variant", specifications.variant],
      [
        "Dimensions",
        `${specifications.lengthM.toFixed(1)} m L · ${specifications.wingspanM.toFixed(1)} m span · ${specifications.heightM.toFixed(2)} m H`,
      ],
      ["Empty weight", formatMass(specifications.emptyWeightKg)],
      ["Takeoff weight", takeoffWeight],
      ["Internal fuel", formatMass(specifications.internalFuelKg)],
      ["Maximum speed", specifications.maximumSpeed],
      ["Service ceiling", specifications.serviceCeiling],
      ["Range", specifications.range],
      ["Combat radius", specifications.combatRadius],
      ["Maximum G", specifications.maximumG],
      ["Engines", specifications.engines],
      ["Cannon", specifications.cannon],
      ["Air-to-air", specifications.airToAirLoadout],
    ];
    for (const [label, value] of values) {
      appendSpecificationMetric(metrics, label, value);
    }

    const note = document.createElement("p");
    note.className = "aircraft-specification-note";
    note.textContent = specifications.note;

    const sources = document.createElement("div");
    sources.className = "aircraft-specification-sources";
    for (const source of specifications.sources) {
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = source.publisher;
      link.title = source.title;
      sources.append(link);
    }
    card.append(heading, metrics, note, sources);
    fragment.append(card);
  }
  aircraftSpecificationList.replaceChildren(fragment);
}

function appendSpecificationMetric(
  list: HTMLDListElement,
  label: string,
  value: string,
): void {
  const container = document.createElement("div");
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  container.append(term, description);
  list.append(container);
}

function appendManeuverMetric(
  list: HTMLDListElement,
  label: string,
  value: string,
): void {
  const container = document.createElement("div");
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  container.append(term, description);
  list.append(container);
}

function openManeuverDictionary(): void {
  if (maneuverDictionaryDialog.open) return;
  dictionaryWasPaused = simulation.paused;
  setPaused(true);
  maneuverDictionaryDialog.showModal();
  maneuverDictionaryClose.focus();
}

function openAircraftSpecifications(): void {
  if (aircraftSpecificationsDialog.open) return;
  specificationsWerePaused = simulation.paused;
  setPaused(true);
  aircraftSpecificationsDialog.showModal();
  aircraftSpecificationsClose.focus();
}

function formatMass(valueKg: number | null): string {
  return valueKg === null
    ? "Not publicly stated"
    : `${Math.round(valueKg).toLocaleString()} kg`;
}

function dismissHint(): void {
  window.clearTimeout(hintTimeout);
  hint.classList.add("dismissed");
}

function formatTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function isDogfightCameraMode(value: string): value is FlightCameraMode {
  return ["director", "combat", "f-35", "j-20", "wide", "free"].includes(value);
}

function isCombatRules(value: string): value is CombatRules {
  return ["full", "guns-only", "custom"].includes(value);
}

function isPilotSkill(value: string): value is PilotSkill {
  return ["green", "experienced", "ace"].includes(value);
}

function isCombatTheaterId(value: string): value is CombatTheaterId {
  return COMBAT_THEATER_IDS.includes(value as CombatTheaterId);
}

function isCombatAltitudeId(value: string): value is CombatAltitudeId {
  return COMBAT_ALTITUDE_IDS.includes(value as CombatAltitudeId);
}

function isEngagementSetupId(value: string): value is EngagementSetupId {
  return ENGAGEMENT_SETUP_IDS.includes(value as EngagementSetupId);
}

function isCombatWeatherId(value: string): value is CombatWeatherId {
  return COMBAT_WEATHER_IDS.includes(value as CombatWeatherId);
}

function compassDirection(degrees: number): string {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required dogfight element #${id}`);
  return element as T;
}

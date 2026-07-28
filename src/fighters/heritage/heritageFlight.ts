import "../playground/flightPlayground.css";
import "./heritageFlight.css";
import {
  HERITAGE_FIXED_STEP_SECONDS,
  createHeritageSimulation,
  sampleHeritageFlight,
  stepHeritageSimulation,
  type HeritageAircraftId,
  type HeritageFlightFrame,
  type HeritagePattern,
} from "./heritageFlightSimulation";
import {
  createHeritageFlightWorld,
  type HeritageCameraMode,
} from "./heritageFlightWorld";

interface HeritageSnapshot {
  timeSeconds: number;
  paused: boolean;
  playbackRate: number;
  pattern: HeritagePattern;
  phase: string;
  cameraMode: HeritageCameraMode;
  cameraShot: string;
  aircraft: Array<{
    id: HeritageAircraftId;
    name: string;
    speedKnots: number;
    altitudeFeet: number;
    position: { x: number; y: number; z: number };
  }>;
  render: {
    drawCalls: number;
    triangles: number;
    geometries: number;
  };
}

declare global {
  interface Window {
    heritageFlight: {
      snapshot: () => HeritageSnapshot;
      setPaused: (paused: boolean) => HeritageSnapshot;
      setPattern: (pattern: HeritagePattern) => HeritageSnapshot;
      setCameraMode: (mode: HeritageCameraMode) => HeritageSnapshot;
      setPlaybackRate: (rate: number) => HeritageSnapshot;
    };
  }
}

const AIRCRAFT_IDS: readonly HeritageAircraftId[] = [
  "f-35",
  "f4u",
  "p-51",
  "f-86",
];

const canvas = required<HTMLCanvasElement>("heritage-canvas");
const pauseButton = required<HTMLButtonElement>("pause-heritage");
const patternSelect = required<HTMLSelectElement>("heritage-pattern");
const cameraSelect = required<HTMLSelectElement>("heritage-camera");
const speedInput = required<HTMLInputElement>("heritage-speed");
const speedOutput = required<HTMLOutputElement>("heritage-speed-output");
const resetCameraButton = required<HTMLButtonElement>("reset-heritage-camera");
const phaseLabel = required<HTMLElement>("heritage-phase");
const cameraLabel = required<HTMLElement>("heritage-camera-shot");
const hint = required<HTMLElement>("heritage-hint");
const graphicsMessage = required<HTMLElement>("heritage-graphics-message");
const aircraftLabels = Object.fromEntries(
  AIRCRAFT_IDS.map((id) => [id, required<HTMLElement>(`label-${id}`)]),
) as Record<HeritageAircraftId, HTMLElement>;
const telemetryLabels = Object.fromEntries(
  AIRCRAFT_IDS.map((id) => [id, required<HTMLElement>(`telemetry-${id}`)]),
) as Record<HeritageAircraftId, HTMLElement>;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const simulation = createHeritageSimulation();
let cameraMode: HeritageCameraMode = reducedMotion.matches
  ? "formation"
  : "director";
cameraSelect.value = cameraMode;

const world = createHeritageFlightWorld(canvas);
let running = true;
let lastFrameTime = performance.now();
let accumulatorSeconds = 0;
let elapsedRenderSeconds = 0;
let lastHudUpdate = -Infinity;
let currentFrame = sampleHeritageFlight(
  simulation.timeSeconds,
  simulation.pattern,
);
let diagnostics = {
  cameraShot: "Formation camera",
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
};
let animationFrame = 0;
let hintTimeout = 0;

bindControls();
updateControlState();
animationFrame = requestAnimationFrame(renderLoop);
hintTimeout = window.setTimeout(() => hint.classList.add("dismissed"), 9_000);

function bindControls(): void {
  window.addEventListener("resize", world.resize);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    lastFrameTime = performance.now();
    accumulatorSeconds = 0;
  });

  pauseButton.addEventListener("click", () => setPaused(!simulation.paused));
  patternSelect.addEventListener("change", () => {
    setPattern(patternSelect.value as HeritagePattern);
  });
  cameraSelect.addEventListener("change", () => {
    setCameraMode(cameraSelect.value as HeritageCameraMode);
  });
  speedInput.addEventListener("input", () => {
    setPlaybackRate(Number(speedInput.value));
  });
  resetCameraButton.addEventListener("click", () => {
    world.resetFreeCamera();
    setCameraMode("formation");
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
    } else if (event.key.toLowerCase() === "p") {
      cyclePattern();
    } else if (event.key.toLowerCase() === "r") {
      world.resetFreeCamera();
      setCameraMode("formation");
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
      const pinchDistance = Math.hypot(first.x - second.x, first.y - second.y);
      if (previousPinchDistance > 0) {
        setCameraMode("free");
        world.zoomBy(previousPinchDistance / pinchDistance);
      }
      previousPinchDistance = pinchDistance;
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
      "The heritage view paused while the graphics context recovers.";
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

  window.heritageFlight = {
    snapshot,
    setPaused,
    setPattern,
    setCameraMode,
    setPlaybackRate,
  };
}

function renderLoop(now: number): void {
  const rawDeltaSeconds = Math.min(0.1, (now - lastFrameTime) / 1_000);
  lastFrameTime = now;
  if (running) {
    if (!simulation.paused) accumulatorSeconds += rawDeltaSeconds;
    while (accumulatorSeconds >= HERITAGE_FIXED_STEP_SECONDS) {
      stepHeritageSimulation(simulation, HERITAGE_FIXED_STEP_SECONDS);
      accumulatorSeconds -= HERITAGE_FIXED_STEP_SECONDS;
    }
    const renderTime =
      simulation.timeSeconds +
      (simulation.paused ? 0 : accumulatorSeconds * simulation.playbackRate);
    currentFrame = sampleHeritageFlight(renderTime, simulation.pattern);
    elapsedRenderSeconds += rawDeltaSeconds;
    diagnostics = world.update(
      currentFrame,
      elapsedRenderSeconds,
      rawDeltaSeconds,
      cameraMode,
    );
    updateAircraftLabels(currentFrame);
    if (now - lastHudUpdate > 140) {
      updateHud(currentFrame);
      lastHudUpdate = now;
    }
  }
  animationFrame = requestAnimationFrame(renderLoop);
}

function updateAircraftLabels(frame: HeritageFlightFrame): void {
  const points = world.projectAircraft(frame);
  for (const aircraft of frame.aircraft) {
    const element = aircraftLabels[aircraft.id];
    const point = points[aircraft.id];
    element.hidden = !point.visible;
    if (point.visible) {
      element.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`;
    }
  }
}

function updateHud(frame: HeritageFlightFrame): void {
  phaseLabel.textContent = frame.phaseLabel;
  cameraLabel.textContent = diagnostics.cameraShot;
  for (const aircraft of frame.aircraft) {
    telemetryLabels[aircraft.id].textContent = telemetryText(aircraft);
  }
}

function telemetryText(
  aircraft: HeritageFlightFrame["aircraft"][number],
): string {
  const knots = Math.round(aircraft.speedMps / 0.514444);
  const altitudeFeet = Math.round((aircraft.altitudeM * 3.28084) / 100) * 100;
  return `${knots} KT · ${altitudeFeet.toLocaleString()} FT`;
}

function setPaused(paused: boolean): HeritageSnapshot {
  if (paused && !simulation.paused) {
    simulation.timeSeconds += accumulatorSeconds * simulation.playbackRate;
    accumulatorSeconds = 0;
    currentFrame = sampleHeritageFlight(
      simulation.timeSeconds,
      simulation.pattern,
    );
  }
  simulation.paused = Boolean(paused);
  updateControlState();
  return snapshot();
}

function setPattern(pattern: HeritagePattern): HeritageSnapshot {
  if (!isPattern(pattern)) return snapshot();
  simulation.pattern = pattern;
  patternSelect.value = pattern;
  updateControlState();
  return snapshot();
}

function setCameraMode(mode: HeritageCameraMode): HeritageSnapshot {
  if (!isCameraMode(mode)) return snapshot();
  cameraMode = mode;
  cameraSelect.value = mode;
  updateControlState();
  return snapshot();
}

function setPlaybackRate(rate: number): HeritageSnapshot {
  simulation.playbackRate = clamp(Number(rate) || 1, 0.35, 1.6);
  speedInput.value = simulation.playbackRate.toFixed(2);
  updateControlState();
  return snapshot();
}

function updateControlState(): void {
  pauseButton.dataset.paused = String(simulation.paused);
  pauseButton.setAttribute("aria-pressed", String(simulation.paused));
  pauseButton.textContent = simulation.paused ? "Resume" : "Pause";
  speedOutput.value = `${simulation.playbackRate.toFixed(2)}×`;
  document.body.classList.toggle("flight-paused", simulation.paused);
}

function cycleCamera(): void {
  const modes: readonly HeritageCameraMode[] = [
    "director",
    "formation",
    "f-35",
    "f4u",
    "p-51",
    "f-86",
    "wide",
    "free",
  ];
  const index = modes.indexOf(cameraMode);
  setCameraMode(modes[(index + 1) % modes.length]);
}

function cyclePattern(): void {
  const patterns: readonly HeritagePattern[] = [
    "diamond",
    "echelon",
    "line-abreast",
    "heritage-break",
  ];
  const index = patterns.indexOf(simulation.pattern);
  setPattern(patterns[(index + 1) % patterns.length]);
}

function snapshot(): HeritageSnapshot {
  return {
    timeSeconds: Number(currentFrame.timeSeconds.toFixed(3)),
    paused: simulation.paused,
    playbackRate: simulation.playbackRate,
    pattern: simulation.pattern,
    phase: currentFrame.phaseLabel,
    cameraMode,
    cameraShot: diagnostics.cameraShot,
    aircraft: currentFrame.aircraft.map((aircraft) => ({
      id: aircraft.id,
      name: aircraft.name,
      speedKnots: Math.round(aircraft.speedMps / 0.514444),
      altitudeFeet: Math.round((aircraft.altitudeM * 3.28084) / 100) * 100,
      position: {
        x: Number(aircraft.position.x.toFixed(2)),
        y: Number(aircraft.position.y.toFixed(2)),
        z: Number(aircraft.position.z.toFixed(2)),
      },
    })),
    render: {
      drawCalls: diagnostics.drawCalls,
      triangles: diagnostics.triangles,
      geometries: diagnostics.geometries,
    },
  };
}

function dismissHint(): void {
  window.clearTimeout(hintTimeout);
  hint.classList.add("dismissed");
}

function isPattern(value: string): value is HeritagePattern {
  return ["diamond", "echelon", "line-abreast", "heritage-break"].includes(
    value,
  );
}

function isCameraMode(value: string): value is HeritageCameraMode {
  return [
    "director",
    "formation",
    "f-35",
    "f4u",
    "p-51",
    "f-86",
    "wide",
    "free",
  ].includes(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required heritage element #${id}`);
  return element as T;
}

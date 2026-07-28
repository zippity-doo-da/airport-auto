import type { FlightCameraMode } from "./flightPlaygroundWorld";
import { createFlightPlaygroundWorld } from "./flightPlaygroundWorld";
import {
  FIXED_STEP_SECONDS,
  createPlaygroundSimulation,
  samplePlaygroundFlight,
  stepPlaygroundSimulation,
  type FlightPattern,
  type PlaygroundFlightFrame,
} from "./flightPlaygroundSimulation";
import "./flightPlayground.css";

interface PlaygroundSnapshot {
  timeSeconds: number;
  paused: boolean;
  playbackRate: number;
  pattern: FlightPattern;
  phase: string;
  cameraMode: FlightCameraMode;
  cameraShot: string;
  aircraft: Array<{
    id: "f-35" | "j-20";
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
    fighterPlayground: {
      snapshot: () => PlaygroundSnapshot;
      setPaused: (paused: boolean) => PlaygroundSnapshot;
      setPattern: (pattern: FlightPattern) => PlaygroundSnapshot;
      setCameraMode: (mode: FlightCameraMode) => PlaygroundSnapshot;
      setPlaybackRate: (rate: number) => PlaygroundSnapshot;
    };
  }
}

const canvas = required<HTMLCanvasElement>("flight-canvas");
const pauseButton = required<HTMLButtonElement>("pause-flight");
const patternSelect = required<HTMLSelectElement>("flight-pattern");
const cameraSelect = required<HTMLSelectElement>("camera-mode");
const speedInput = required<HTMLInputElement>("playback-speed");
const speedOutput = required<HTMLOutputElement>("playback-speed-output");
const resetCameraButton = required<HTMLButtonElement>("reset-camera");
const phaseLabel = required<HTMLElement>("flight-phase");
const cameraLabel = required<HTMLElement>("camera-shot");
const hint = required<HTMLElement>("flight-hint");
const graphicsMessage = required<HTMLElement>("graphics-message");
const f35Label = required<HTMLElement>("label-f35");
const j20Label = required<HTMLElement>("label-j20");
const f35Telemetry = required<HTMLElement>("telemetry-f35");
const j20Telemetry = required<HTMLElement>("telemetry-j20");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const simulation = createPlaygroundSimulation();
let cameraMode: FlightCameraMode = reducedMotion.matches
  ? "formation"
  : "director";
cameraSelect.value = cameraMode;

const world = createFlightPlaygroundWorld(canvas);
let running = true;
let lastFrameTime = performance.now();
let accumulatorSeconds = 0;
let elapsedRenderSeconds = 0;
let lastHudUpdate = -Infinity;
let currentFrame = samplePlaygroundFlight(
  simulation.timeSeconds,
  simulation.pattern,
);
let latestDiagnostics = {
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
hintTimeout = window.setTimeout(() => hint.classList.add("dismissed"), 8500);

function bindControls(): void {
  window.addEventListener("resize", world.resize);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    lastFrameTime = performance.now();
    accumulatorSeconds = 0;
  });

  pauseButton.addEventListener("click", () => setPaused(!simulation.paused));
  patternSelect.addEventListener("change", () => {
    setPattern(patternSelect.value as FlightPattern);
  });
  cameraSelect.addEventListener("change", () => {
    setCameraMode(cameraSelect.value as FlightCameraMode);
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
  let dragged = false;
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previousPinchDistance = 0;
    dragged = false;
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
        dragged = true;
        setCameraMode("free");
        world.orbitBy(deltaX, deltaY);
      }
    } else if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      if (previousPinchDistance > 0) {
        setCameraMode("free");
        world.zoomBy(previousPinchDistance / distance);
      }
      previousPinchDistance = distance;
    }
  });
  const releasePointer = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) previousPinchDistance = 0;
    if (dragged) dismissHint();
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
      "The flight view paused while the graphics context recovers.";
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

  window.fighterPlayground = {
    snapshot,
    setPaused,
    setPattern,
    setCameraMode,
    setPlaybackRate,
  };
}

function renderLoop(now: number): void {
  const rawDeltaSeconds = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  if (running) {
    if (!simulation.paused) accumulatorSeconds += rawDeltaSeconds;
    while (accumulatorSeconds >= FIXED_STEP_SECONDS) {
      stepPlaygroundSimulation(simulation, FIXED_STEP_SECONDS);
      accumulatorSeconds -= FIXED_STEP_SECONDS;
    }
    const renderTime =
      simulation.timeSeconds +
      (simulation.paused ? 0 : accumulatorSeconds * simulation.playbackRate);
    currentFrame = samplePlaygroundFlight(renderTime, simulation.pattern);
    elapsedRenderSeconds += rawDeltaSeconds;
    latestDiagnostics = world.update(
      currentFrame,
      elapsedRenderSeconds,
      rawDeltaSeconds,
      cameraMode,
    );
    updateAircraftLabels(currentFrame);
    if (now - lastHudUpdate > 120) {
      updateHud(currentFrame);
      lastHudUpdate = now;
    }
  }

  animationFrame = requestAnimationFrame(renderLoop);
}

function updateAircraftLabels(frame: PlaygroundFlightFrame): void {
  const points = world.projectAircraft(frame);
  placeAircraftLabel(f35Label, points[0]);
  placeAircraftLabel(j20Label, points[1]);
}

function placeAircraftLabel(
  element: HTMLElement,
  point: { x: number; y: number; visible: boolean },
): void {
  element.hidden = !point.visible;
  if (!point.visible) return;
  element.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`;
}

function updateHud(frame: PlaygroundFlightFrame): void {
  phaseLabel.textContent = frame.phaseLabel;
  cameraLabel.textContent = latestDiagnostics.cameraShot;
  f35Telemetry.textContent = telemetryText(frame.aircraft[0]);
  j20Telemetry.textContent = telemetryText(frame.aircraft[1]);
}

function telemetryText(
  aircraft: PlaygroundFlightFrame["aircraft"][number],
): string {
  const knots = Math.round(aircraft.speedMps / 0.514444);
  const mach = aircraft.speedMps / 336;
  const altitudeFeet = Math.round((aircraft.altitudeM * 3.28084) / 100) * 100;
  return `${knots} KT · M ${mach.toFixed(2)} · ${altitudeFeet.toLocaleString()} FT`;
}

function setPaused(paused: boolean): PlaygroundSnapshot {
  const nextPaused = Boolean(paused);
  if (nextPaused && !simulation.paused) {
    simulation.timeSeconds += accumulatorSeconds * simulation.playbackRate;
    accumulatorSeconds = 0;
    currentFrame = samplePlaygroundFlight(
      simulation.timeSeconds,
      simulation.pattern,
    );
  }
  simulation.paused = nextPaused;
  updateControlState();
  return snapshot();
}

function setPattern(pattern: FlightPattern): PlaygroundSnapshot {
  if (!isPattern(pattern)) return snapshot();
  simulation.pattern = pattern;
  patternSelect.value = pattern;
  updateControlState();
  return snapshot();
}

function setCameraMode(mode: FlightCameraMode): PlaygroundSnapshot {
  if (!isCameraMode(mode)) return snapshot();
  cameraMode = mode;
  cameraSelect.value = mode;
  updateControlState();
  return snapshot();
}

function setPlaybackRate(rate: number): PlaygroundSnapshot {
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
  const modes: FlightCameraMode[] = [
    "director",
    "formation",
    "f-35",
    "j-20",
    "wide",
    "free",
  ];
  const index = modes.indexOf(cameraMode);
  setCameraMode(modes[(index + 1) % modes.length]);
}

function cyclePattern(): void {
  const patterns: FlightPattern[] = ["break-rejoin", "formation", "staggered"];
  const index = patterns.indexOf(simulation.pattern);
  setPattern(patterns[(index + 1) % patterns.length]);
}

function snapshot(): PlaygroundSnapshot {
  return {
    timeSeconds: Number(currentFrame.timeSeconds.toFixed(3)),
    paused: simulation.paused,
    playbackRate: simulation.playbackRate,
    pattern: simulation.pattern,
    phase: currentFrame.phaseLabel,
    cameraMode,
    cameraShot: latestDiagnostics.cameraShot,
    aircraft: currentFrame.aircraft.map((aircraft) => ({
      id: aircraft.id,
      speedKnots: Math.round(aircraft.speedMps / 0.514444),
      altitudeFeet: Math.round((aircraft.altitudeM * 3.28084) / 100) * 100,
      position: {
        x: Number(aircraft.position.x.toFixed(2)),
        y: Number(aircraft.position.y.toFixed(2)),
        z: Number(aircraft.position.z.toFixed(2)),
      },
    })),
    render: {
      drawCalls: latestDiagnostics.drawCalls,
      triangles: latestDiagnostics.triangles,
      geometries: latestDiagnostics.geometries,
    },
  };
}

function dismissHint(): void {
  window.clearTimeout(hintTimeout);
  hint.classList.add("dismissed");
}

function isPattern(value: string): value is FlightPattern {
  return ["formation", "break-rejoin", "staggered"].includes(value);
}

function isCameraMode(value: string): value is FlightCameraMode {
  return ["director", "formation", "f-35", "j-20", "wide", "free"].includes(
    value,
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required playground element #${id}`);
  return element as T;
}

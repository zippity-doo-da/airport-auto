export type FlightPattern =
  "formation" | "break-rejoin" | "staggered" | "dogfight";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AircraftFlightState {
  id: "f-35" | "j-20";
  modelId?: string;
  modelName?: string;
  position: Vec3;
  velocity: Vec3;
  forward: Vec3;
  bankRad: number;
  speedMps: number;
  altitudeM: number;
}

export interface PlaygroundFlightFrame {
  timeSeconds: number;
  pattern: FlightPattern;
  phaseLabel: string;
  aircraft: readonly [AircraftFlightState, AircraftFlightState];
  center: Vec3;
  forward: Vec3;
}

export interface PlaygroundSimulationState {
  timeSeconds: number;
  paused: boolean;
  playbackRate: number;
  pattern: FlightPattern;
}

export const FIXED_STEP_SECONDS = 1 / 120;

const PATH_LOOP_SECONDS = 52;
const TAU = Math.PI * 2;
const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };

export function createPlaygroundSimulation(): PlaygroundSimulationState {
  return {
    timeSeconds: 3.5,
    paused: false,
    playbackRate: 1,
    pattern: "break-rejoin",
  };
}

export function stepPlaygroundSimulation(
  state: PlaygroundSimulationState,
  fixedDeltaSeconds: number,
): void {
  if (state.paused) return;
  state.timeSeconds += fixedDeltaSeconds * state.playbackRate;
}

export function samplePlaygroundFlight(
  timeSeconds: number,
  pattern: FlightPattern,
): PlaygroundFlightFrame {
  const f35 = sampleAircraft(timeSeconds, pattern, 0);
  const j20 = sampleAircraft(timeSeconds, pattern, 1);
  const center = scale(add(f35.position, j20.position), 0.5);
  const forward = normalize(add(f35.forward, j20.forward));
  return {
    timeSeconds,
    pattern,
    phaseLabel: patternPhaseLabel(timeSeconds, pattern),
    aircraft: [f35, j20],
    center,
    forward,
  };
}

function sampleAircraft(
  timeSeconds: number,
  pattern: FlightPattern,
  aircraftIndex: 0 | 1,
): AircraftFlightState {
  const sampleWindow = 0.08;
  const position = aircraftPosition(timeSeconds, pattern, aircraftIndex);
  const previous = aircraftPosition(
    timeSeconds - sampleWindow,
    pattern,
    aircraftIndex,
  );
  const next = aircraftPosition(
    timeSeconds + sampleWindow,
    pattern,
    aircraftIndex,
  );
  const velocity = scale(subtract(next, previous), 1 / (sampleWindow * 2));
  const forward = normalize(velocity);

  const turnWindow = 0.58;
  const beforeForward = normalize(
    subtract(
      aircraftPosition(timeSeconds, pattern, aircraftIndex),
      aircraftPosition(timeSeconds - turnWindow, pattern, aircraftIndex),
    ),
  );
  const afterForward = normalize(
    subtract(
      aircraftPosition(timeSeconds + turnWindow, pattern, aircraftIndex),
      aircraftPosition(timeSeconds, pattern, aircraftIndex),
    ),
  );
  const horizontalTurn =
    beforeForward.z * afterForward.x - beforeForward.x * afterForward.z;
  const breakBias =
    pattern === "break-rejoin"
      ? (aircraftIndex === 0 ? -1 : 1) * splitPulse(timeSeconds) * 0.08
      : 0;
  const bankRad = clamp(horizontalTurn * 5.2 + breakBias, -0.62, 0.62);

  return {
    id: aircraftIndex === 0 ? "f-35" : "j-20",
    position,
    velocity,
    forward,
    bankRad,
    speedMps: length(velocity),
    altitudeM: position.y,
  };
}

function aircraftPosition(
  timeSeconds: number,
  pattern: FlightPattern,
  aircraftIndex: 0 | 1,
): Vec3 {
  const center = pathCenter(timeSeconds);
  const pathForward = normalize(
    subtract(pathCenter(timeSeconds + 0.12), pathCenter(timeSeconds - 0.12)),
  );
  const right = normalize(cross(WORLD_UP, pathForward));
  const side = aircraftIndex === 0 ? -1 : 1;

  let lateralMeters = 18;
  let verticalMeters = aircraftIndex === 0 ? 2 : -2;
  let longitudinalMeters = 0;

  if (pattern === "break-rejoin") {
    const pulse = splitPulse(timeSeconds);
    lateralMeters += pulse * 118;
    verticalMeters += side * pulse * 42;
    longitudinalMeters = side * pulse * 14;
  } else if (pattern === "staggered") {
    lateralMeters = 13;
    verticalMeters = side * 11;
    longitudinalMeters = side * 42;
  }

  return add(
    center,
    add(
      scale(right, side * lateralMeters),
      add(
        scale(WORLD_UP, verticalMeters),
        scale(pathForward, longitudinalMeters),
      ),
    ),
  );
}

function pathCenter(timeSeconds: number): Vec3 {
  const theta = (timeSeconds / PATH_LOOP_SECONDS) * TAU;
  return {
    x: Math.sin(theta) * 2200 + Math.sin(theta * 3) * 80,
    y: 1030 + Math.sin(theta * 2 - 0.35) * 145 + Math.sin(theta + 0.7) * 55,
    z: Math.cos(theta) * 2200,
  };
}

function splitPulse(timeSeconds: number): number {
  const phase = positiveModulo(timeSeconds, 34) / 34;
  const opening = smootherStep(0.13, 0.38, phase);
  const closing = 1 - smootherStep(0.7, 0.94, phase);
  return opening * closing;
}

function patternPhaseLabel(
  timeSeconds: number,
  pattern: FlightPattern,
): string {
  if (pattern === "formation") return "Close formation";
  if (pattern === "staggered") return "Staggered trail";
  const pulse = splitPulse(timeSeconds);
  const phase = positiveModulo(timeSeconds, 34) / 34;
  if (pulse < 0.04) return "Formation";
  if (phase < 0.4) return "Breaking outward";
  if (phase < 0.69) return "Wide element";
  return "Rejoining";
}

function smootherStep(edge0: number, edge1: number, value: number): number {
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return (
    normalized *
    normalized *
    normalized *
    (normalized * (normalized * 6 - 15) + 10)
  );
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector: Vec3, amount: number): Vec3 {
  return {
    x: vector.x * amount,
    y: vector.y * amount,
    z: vector.z * amount,
  };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector: Vec3): Vec3 {
  const magnitude = length(vector);
  if (magnitude < 1e-8) return { x: 0, y: 0, z: 1 };
  return scale(vector, 1 / magnitude);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

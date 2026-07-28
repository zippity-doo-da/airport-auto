import type { Vec3 } from "../playground/flightPlaygroundSimulation";

export type HeritageAircraftId = "f-35" | "f4u" | "p-51" | "f-86";
export type HeritagePattern =
  "diamond" | "echelon" | "line-abreast" | "heritage-break";

export interface HeritageAircraftFlightState {
  id: HeritageAircraftId;
  modelId: string;
  name: string;
  eraLabel: string;
  position: Vec3;
  velocity: Vec3;
  forward: Vec3;
  bankRad: number;
  speedMps: number;
  altitudeM: number;
}

export interface HeritageFlightFrame {
  timeSeconds: number;
  pattern: HeritagePattern;
  phaseLabel: string;
  aircraft: readonly [
    HeritageAircraftFlightState,
    HeritageAircraftFlightState,
    HeritageAircraftFlightState,
    HeritageAircraftFlightState,
  ];
  center: Vec3;
  forward: Vec3;
}

export interface HeritageSimulationState {
  timeSeconds: number;
  paused: boolean;
  playbackRate: number;
  pattern: HeritagePattern;
}

interface FormationOffset {
  lateralM: number;
  verticalM: number;
  longitudinalM: number;
}

export const HERITAGE_FIXED_STEP_SECONDS = 1 / 120;

const AIRCRAFT: ReadonlyArray<{
  id: HeritageAircraftId;
  modelId: string;
  name: string;
  eraLabel: string;
}> = [
  { id: "f-35", modelId: "f-35", name: "F-35A", eraLabel: "2006" },
  { id: "f4u", modelId: "f4u", name: "F4U-4", eraLabel: "1944" },
  { id: "p-51", modelId: "p-51", name: "P-51D", eraLabel: "1944" },
  { id: "f-86", modelId: "f-86", name: "F-86F", eraLabel: "1952" },
] as const;

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };
const PATH_LOOP_SECONDS = 94;
const TAU = Math.PI * 2;

export function createHeritageSimulation(): HeritageSimulationState {
  return {
    timeSeconds: 5.5,
    paused: false,
    playbackRate: 1,
    pattern: "diamond",
  };
}

export function stepHeritageSimulation(
  state: HeritageSimulationState,
  fixedDeltaSeconds: number,
): void {
  if (!state.paused) {
    state.timeSeconds += fixedDeltaSeconds * state.playbackRate;
  }
}

export function sampleHeritageFlight(
  timeSeconds: number,
  pattern: HeritagePattern,
): HeritageFlightFrame {
  const aircraft: HeritageFlightFrame["aircraft"] = [
    sampleAircraft(timeSeconds, pattern, 0, AIRCRAFT[0]),
    sampleAircraft(timeSeconds, pattern, 1, AIRCRAFT[1]),
    sampleAircraft(timeSeconds, pattern, 2, AIRCRAFT[2]),
    sampleAircraft(timeSeconds, pattern, 3, AIRCRAFT[3]),
  ];
  const center = scale(
    aircraft.reduce((sum, entry) => add(sum, entry.position), vector()),
    1 / aircraft.length,
  );
  const forward = normalize(
    aircraft.reduce((sum, entry) => add(sum, entry.forward), vector()),
  );
  return {
    timeSeconds,
    pattern,
    phaseLabel: phaseLabel(timeSeconds, pattern),
    aircraft,
    center,
    forward,
  };
}

function sampleAircraft(
  timeSeconds: number,
  pattern: HeritagePattern,
  aircraftIndex: number,
  profile: (typeof AIRCRAFT)[number],
): HeritageAircraftFlightState {
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
  const turnWindow = 0.62;
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
  const breakBank =
    pattern === "heritage-break"
      ? breakOffset(timeSeconds, aircraftIndex).bankBias
      : 0;
  return {
    ...profile,
    position,
    velocity,
    forward,
    bankRad: clamp(horizontalTurn * 4.8 + breakBank, -0.7, 0.7),
    speedMps: length(velocity),
    altitudeM: position.y,
  };
}

function aircraftPosition(
  timeSeconds: number,
  pattern: HeritagePattern,
  aircraftIndex: number,
): Vec3 {
  const center = pathCenter(timeSeconds);
  const pathForward = normalize(
    subtract(pathCenter(timeSeconds + 0.12), pathCenter(timeSeconds - 0.12)),
  );
  const right = normalize(cross(WORLD_UP, pathForward));
  const offset = formationOffset(pattern, aircraftIndex, timeSeconds);
  return add(
    center,
    add(
      scale(right, offset.lateralM),
      add(
        scale(WORLD_UP, offset.verticalM),
        scale(pathForward, offset.longitudinalM),
      ),
    ),
  );
}

function formationOffset(
  pattern: HeritagePattern,
  aircraftIndex: number,
  timeSeconds: number,
): FormationOffset {
  if (pattern === "echelon") {
    const offsets: readonly FormationOffset[] = [
      { lateralM: 36, verticalM: 3, longitudinalM: 28 },
      { lateralM: 12, verticalM: 0, longitudinalM: 2 },
      { lateralM: -12, verticalM: -2, longitudinalM: -25 },
      { lateralM: -36, verticalM: 4, longitudinalM: -52 },
    ];
    return offsets[aircraftIndex];
  }
  if (pattern === "line-abreast") {
    const lateral = [-42, -14, 14, 42][aircraftIndex];
    return {
      lateralM: lateral,
      verticalM: [5, -2, 0, 3][aircraftIndex],
      longitudinalM: [3, 0, 0, 3][aircraftIndex],
    };
  }

  const diamond: readonly FormationOffset[] = [
    { lateralM: 0, verticalM: 7, longitudinalM: 34 },
    { lateralM: -25, verticalM: 0, longitudinalM: 0 },
    { lateralM: 25, verticalM: -2, longitudinalM: -2 },
    { lateralM: 0, verticalM: 4, longitudinalM: -42 },
  ];
  if (pattern !== "heritage-break") return diamond[aircraftIndex];
  const breakMotion = breakOffset(timeSeconds, aircraftIndex);
  return {
    lateralM: diamond[aircraftIndex].lateralM + breakMotion.lateralM,
    verticalM: diamond[aircraftIndex].verticalM + breakMotion.verticalM,
    longitudinalM:
      diamond[aircraftIndex].longitudinalM + breakMotion.longitudinalM,
  };
}

function breakOffset(
  timeSeconds: number,
  aircraftIndex: number,
): FormationOffset & { bankBias: number } {
  const phase = positiveModulo(timeSeconds, 44) / 44;
  const opening = smootherStep(0.18, 0.42, phase);
  const closing = 1 - smootherStep(0.7, 0.94, phase);
  const pulse = opening * closing;
  if (aircraftIndex === 0) {
    return {
      lateralM: 190 * pulse,
      verticalM: 115 * pulse,
      longitudinalM: 85 * pulse,
      bankBias: -0.42 * pulse,
    };
  }
  if (aircraftIndex === 3) {
    return {
      lateralM: -145 * pulse,
      verticalM: 72 * pulse,
      longitudinalM: 45 * pulse,
      bankBias: 0.34 * pulse,
    };
  }
  const side = aircraftIndex === 1 ? -1 : 1;
  return {
    lateralM: side * 38 * pulse,
    verticalM: -8 * pulse,
    longitudinalM: -18 * pulse,
    bankBias: side * 0.08 * pulse,
  };
}

function pathCenter(timeSeconds: number): Vec3 {
  const theta = (timeSeconds / PATH_LOOP_SECONDS) * TAU;
  return {
    x: Math.sin(theta) * 1_780 + Math.sin(theta * 3) * 54,
    y: 1_480 + Math.sin(theta * 2 - 0.3) * 92,
    z: Math.cos(theta) * 1_520,
  };
}

function phaseLabel(timeSeconds: number, pattern: HeritagePattern): string {
  if (pattern === "diamond") return "Diamond pass";
  if (pattern === "echelon") return "Echelon pass";
  if (pattern === "line-abreast") return "Line-abreast salute";
  const phase = positiveModulo(timeSeconds, 44) / 44;
  if (phase < 0.18 || phase > 0.94) return "Four-ship formation";
  if (phase < 0.44) return "Heritage break";
  if (phase < 0.7) return "Split pass";
  return "Rejoining formation";
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

function vector(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: Vec3, amount: number): Vec3 {
  return { x: value.x * amount, y: value.y * amount, z: value.z * amount };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(value: Vec3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value: Vec3): Vec3 {
  const magnitude = length(value);
  return magnitude < 1e-8 ? { x: 0, y: 0, z: 1 } : scale(value, 1 / magnitude);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

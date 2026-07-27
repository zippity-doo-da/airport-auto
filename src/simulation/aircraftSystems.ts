import { aircraftProfile } from "./aircraftProfiles";
import type { Flight, WeatherState } from "./types";

export interface AircraftSystemsState {
  schemaVersion: 1;
  gearExtension: number;
  flapExtension: number;
  slatExtension: number;
  spoilerExtension: number;
  reverserExtension: number;
  lights: {
    navigation: boolean;
    beacon: boolean;
    strobe: boolean;
    strobePulse: number;
    landing: boolean;
    taxi: boolean;
    recognition: boolean;
    beaconPulse: number;
  };
  effects: {
    exhaust: number;
    condensation: number;
    tireSmoke: number;
    surfaceSpray: number;
  };
}

/**
 * Derive visible systems from authoritative fixed-step state. This function is
 * pure, deterministic, and shared by rendering, snapshots, and validation.
 */
export function aircraftSystemsState(
  flight: Pick<
    Flight,
    | "id"
    | "aircraft"
    | "phase"
    | "progress"
    | "engineState"
    | "tugAttached"
    | "kinematics"
    | "motion"
  >,
  weather: WeatherState,
  elapsedSeconds: number,
): AircraftSystemsState {
  const profile = aircraftProfile(flight.aircraft);
  const onGround = flight.motion.onGround;
  const airborne = !onGround;
  const running = flight.engineState === "running";
  const engineLive = flight.engineState !== "off";
  const stageProgress = clamp01(flight.motion.stageProgress);
  const groundSpeed = Math.max(0, flight.kinematics.groundSpeedKts);

  let gearExtension = onGround ? 1 : 0;
  if (flight.phase === "approach") {
    gearExtension = smoothstep(0.24, 0.48, flight.progress);
  } else if (flight.phase === "landing") {
    gearExtension = 1;
  } else if (flight.phase === "takeoff" && airborne) {
    gearExtension = 1 - smoothstep(0.04, 0.32, stageProgress);
  }

  let flapExtension = 0;
  if (flight.phase === "approach")
    flapExtension = 0.38 + smoothstep(0.16, 0.82, flight.progress) * 0.42;
  else if (flight.phase === "landing") flapExtension = onGround ? 0.92 : 0.86;
  else if (
    flight.phase === "taxi-out" &&
    !flight.tugAttached &&
    flight.progress > 0.55
  )
    flapExtension = 0.32;
  else if (flight.phase === "takeoff")
    flapExtension = airborne
      ? 0.34 * (1 - smoothstep(0.2, 0.72, stageProgress))
      : 0.34;

  const slatExtension =
    profile.engineType === "piston"
      ? 0
      : clamp01(
          flapExtension *
            (flight.phase === "landing" || flight.phase === "approach"
              ? 1.05
              : 0.82),
        );
  const spoilerExtension =
    flight.phase === "landing" && onGround && groundSpeed > 7
      ? smoothstep(7, 34, groundSpeed) *
        (1 - smoothstep(0.72, 0.98, stageProgress))
      : 0;
  const reverserExtension =
    flight.phase === "landing" &&
    onGround &&
    groundSpeed > 24 &&
    profile.engineType !== "piston"
      ? smoothstep(24, 70, groundSpeed) *
        (1 - smoothstep(0.54, 0.92, stageProgress))
      : 0;

  const strobeActive =
    running &&
    (airborne || flight.phase === "landing" || flight.phase === "takeoff");
  const strobePulse = strobeActive
    ? squarePulse(elapsedSeconds * 1.08 + flight.id * 0.137, 0.075, 0.13)
    : 0;
  const beaconPulse = engineLive
    ? trianglePulse(elapsedSeconds * 0.82 + flight.id * 0.173)
    : 0;
  const landingLights =
    running &&
    (flight.phase === "approach" ||
      flight.phase === "landing" ||
      flight.phase === "takeoff");
  const taxiLights =
    running &&
    onGround &&
    !flight.tugAttached &&
    (flight.phase === "taxi-in" || flight.phase === "taxi-out");

  const tireSmoke =
    flight.phase === "landing" &&
    onGround &&
    weather.surfaceCondition === "dry" &&
    groundSpeed > 38
      ? (1 - smoothstep(0.04, 0.2, stageProgress)) *
        smoothstep(38, 75, groundSpeed)
      : 0;
  const surfaceSpray =
    onGround && weather.surfaceCondition !== "dry" && groundSpeed > 11
      ? smoothstep(11, 72, groundSpeed) *
        (weather.surfaceCondition === "contaminated" ? 1 : 0.68)
      : 0;
  return {
    schemaVersion: 1,
    gearExtension: round4(gearExtension),
    flapExtension: round4(clamp01(flapExtension)),
    slatExtension: round4(clamp01(slatExtension)),
    spoilerExtension: round4(clamp01(spoilerExtension)),
    reverserExtension: round4(clamp01(reverserExtension)),
    lights: {
      navigation: engineLive,
      beacon: engineLive,
      strobe: strobeActive,
      strobePulse: round4(strobePulse),
      landing: landingLights,
      taxi: taxiLights,
      recognition:
        running &&
        (airborne || flight.phase === "approach" || flight.phase === "takeoff"),
      beaconPulse: round4(beaconPulse),
    },
    effects: {
      // Compatibility fields remain zero so no renderer or external client
      // can reconstruct the removed persistent trail-like effects.
      exhaust: 0,
      condensation: 0,
      tireSmoke: round4(clamp01(tireSmoke)),
      surfaceSpray: round4(clamp01(surfaceSpray)),
    },
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = clamp01((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

function squarePulse(
  cycle: number,
  firstWidth: number,
  secondStart: number,
): number {
  const phase = cycle - Math.floor(cycle);
  return phase < firstWidth ||
    (phase >= secondStart && phase < secondStart + firstWidth * 0.72)
    ? 1
    : 0;
}

function trianglePulse(cycle: number): number {
  const phase = cycle - Math.floor(cycle);
  return phase < 0.18 ? 1 - Math.abs(phase - 0.09) / 0.09 : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

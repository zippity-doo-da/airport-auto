import type { Vec3 } from "../playground/flightPlaygroundSimulation";
import {
  AIR_COMBAT_MANEUVERS,
  PILOT_PROFILES,
  maneuverDefinition,
  pilotCanFlyManeuver,
} from "./airCombatManeuvers";
import { dogfightAircraftProfile } from "./combatAircraftProfiles";
import { COMBAT_THEATERS } from "./combatScenarios";
import {
  WORLD_UP,
  add,
  clamp,
  cross,
  distance,
  dot,
  normalize,
  safeRight,
  scale,
  subtract,
} from "./dogfightMath";
import type {
  AirCombatManeuverId,
  CombatAircraftState,
  DogfightSimulationState,
} from "./dogfightTypes";

export interface ManeuverGuidance {
  desiredDirection: Vec3;
  commandG: number;
  speedBiasMps: number;
  bankOverrideRad: number | null;
  directBank: boolean;
}

const STANDARD_GRAVITY = 9.80665;
const TAU = Math.PI * 2;

export function updateManeuverGuidance(
  state: DogfightSimulationState,
  aircraft: CombatAircraftState,
  own: CombatAircraftState,
  opponent: CombatAircraftState,
  baseDesiredDirection: Vec3,
  incomingThreatDirection: Vec3 | null,
  deltaSeconds: number,
): ManeuverGuidance {
  aircraft.maneuverElapsedSeconds += deltaSeconds;
  aircraft.decisionCooldownSeconds = Math.max(
    0,
    aircraft.decisionCooldownSeconds - deltaSeconds,
  );

  const range = distance(own.position, opponent.position);
  const currentDefinition = maneuverDefinition(aircraft.currentManeuver);
  const urgentDefense = incomingThreatDirection !== null;
  const gunsOnlyRejoin = state.combatRules === "guns-only" && range > 700;
  const maneuverComplete =
    aircraft.maneuverElapsedSeconds >= aircraft.maneuverDurationSeconds;
  const noLongerQualified = !pilotCanFlyManeuver(
    aircraft.pilotSkill,
    currentDefinition,
  );

  if (
    aircraft.pilotFatigue > 0.82 &&
    aircraft.currentManeuver !== "unloaded-extension" &&
    !gunsOnlyRejoin
  ) {
    chooseManeuver(state, aircraft, "unloaded-extension");
  } else if (
    noLongerQualified ||
    maneuverComplete ||
    (urgentDefense &&
      aircraft.decisionCooldownSeconds <= 0 &&
      currentDefinition.category !== "defensive")
  ) {
    chooseManeuver(
      state,
      aircraft,
      selectManeuver(state, aircraft, own, opponent, range, urgentDefense),
    );
  }

  return guidanceForManeuver(
    aircraft,
    own,
    opponent,
    baseDesiredDirection,
    incomingThreatDirection,
  );
}

export function availablePilotG(aircraft: CombatAircraftState): number {
  const profile = PILOT_PROFILES[aircraft.pilotSkill];
  const fatiguePenalty =
    (profile.peakG - profile.sustainedG) * aircraft.pilotFatigue * 0.82;
  const consciousnessPenalty = (1 - aircraft.consciousness) * 1.4;
  return clamp(
    profile.peakG - fatiguePenalty - consciousnessPenalty,
    2.2,
    profile.peakG,
  );
}

export function maximumTurnRateForG(gLoad: number, speedMps: number): number {
  const radialAcceleration =
    STANDARD_GRAVITY * Math.sqrt(Math.max(0, gLoad * gLoad - 1));
  return radialAcceleration / Math.max(1, speedMps);
}

export function updatePilotPhysiology(
  state: DogfightSimulationState,
  aircraft: CombatAircraftState,
  turnRateRadiansPerSecond: number,
  commandG: number,
  deltaSeconds: number,
): void {
  const profile = PILOT_PROFILES[aircraft.pilotSkill];
  const turnG = Math.sqrt(
    1 +
      Math.pow(
        (aircraft.speedMps * turnRateRadiansPerSecond) / STANDARD_GRAVITY,
        2,
      ),
  );
  aircraft.availableG = availablePilotG(aircraft);
  aircraft.gLoad = Math.min(
    aircraft.availableG,
    Math.max(turnG, 1 + (commandG - 1) * 0.28),
  );

  // High-G work becomes tiring before the pilot reaches the value they can
  // briefly sustain. That gives the AI room to unload and recover before its
  // peak limit becomes the only remaining protection.
  const fatigueOnsetG = profile.sustainedG * 0.82;
  const excessG = Math.max(0, aircraft.gLoad - fatigueOnsetG);
  if (excessG > 0) {
    const toleranceBand = Math.max(0.5, profile.peakG - fatigueOnsetG);
    aircraft.pilotFatigue = clamp(
      aircraft.pilotFatigue +
        (excessG / toleranceBand) *
          deltaSeconds *
          0.052 *
          profile.fatigueMultiplier,
      0,
      1,
    );
  } else {
    const unloading = aircraft.currentManeuver === "unloaded-extension";
    const recoveryRate = unloading ? 0.085 : aircraft.gLoad < 3 ? 0.035 : 0.012;
    aircraft.pilotFatigue = clamp(
      aircraft.pilotFatigue -
        recoveryRate * deltaSeconds * profile.recoveryMultiplier,
      0,
      1,
    );
  }

  const overload = Math.max(0, aircraft.gLoad - aircraft.availableG);
  aircraft.consciousness = clamp(
    aircraft.consciousness -
      overload * deltaSeconds * 0.18 +
      deltaSeconds * 0.045,
    0.35,
    1,
  );

  if (aircraft.pilotFatigue > 0.72) {
    aircraft.pilotCondition = "strained";
  } else if (
    aircraft.currentManeuver === "unloaded-extension" &&
    aircraft.pilotFatigue > 0.08
  ) {
    aircraft.pilotCondition = "recovering";
  } else if (aircraft.gLoad > profile.sustainedG * 0.82) {
    aircraft.pilotCondition = "working";
  } else {
    aircraft.pilotCondition = "ready";
  }

  state.statistics.maximumObservedG[aircraft.id] = Math.max(
    state.statistics.maximumObservedG[aircraft.id],
    aircraft.gLoad,
  );
}

function selectManeuver(
  state: DogfightSimulationState,
  aircraft: CombatAircraftState,
  own: CombatAircraftState,
  opponent: CombatAircraftState,
  range: number,
  urgentDefense: boolean,
): AirCombatManeuverId {
  let candidates: AirCombatManeuverId[];
  const closure = dot(
    subtract(opponent.velocity, own.velocity),
    normalize(subtract(own.position, opponent.position)),
  );
  const arenaRadius = Math.hypot(own.position.x, own.position.z);
  const gunsOnly = state.combatRules === "guns-only";
  const combatRadius = COMBAT_THEATERS[state.scenario.theaterId].combatRadiusM;

  if (urgentDefense) {
    candidates = ["break-turn", "barrel-roll", "defensive-spiral"];
  } else if (gunsOnly && range > 900) {
    // Once a cannon pass opens up, both pilots reverse back into the fight.
    // Extension maneuvers here used to send the pair kilometres apart.
    candidates = ["lead-pursuit", "low-yo-yo", "high-yo-yo"];
  } else if (aircraft.pilotFatigue > 0.68) {
    candidates = ["unloaded-extension", "lag-pursuit"];
  } else if (arenaRadius > combatRadius * 0.82) {
    candidates = gunsOnly
      ? ["immelmann", "split-s", "lead-pursuit"]
      : ["immelmann", "split-s", "vertical-extension"];
  } else if (range < 210) {
    candidates = [
      "flat-scissors",
      "rolling-scissors",
      "barrel-roll",
      "split-s",
    ];
  } else if (range < 650) {
    candidates =
      closure > 85
        ? ["high-yo-yo", "lag-pursuit", "displacement-roll"]
        : ["low-yo-yo", "lead-pursuit", "rolling-scissors"];
  } else if (gunsOnly) {
    candidates = [
      "lead-pursuit",
      "low-yo-yo",
      "high-yo-yo",
      "displacement-roll",
    ];
  } else {
    candidates = [
      "lead-pursuit",
      "lag-pursuit",
      "vertical-extension",
      "high-yo-yo",
    ];
  }

  const currentAvailableG = availablePilotG(aircraft);
  const qualified = candidates.filter((id) => {
    const definition = maneuverDefinition(id);
    return (
      pilotCanFlyManeuver(aircraft.pilotSkill, definition) &&
      definition.nominalG <= currentAvailableG + 0.35
    );
  });
  const fallback = AIR_COMBAT_MANEUVERS.filter(
    (maneuver) =>
      pilotCanFlyManeuver(aircraft.pilotSkill, maneuver) &&
      maneuver.nominalG <= currentAvailableG,
  ).map((maneuver) => maneuver.id);
  const choices = qualified.length > 0 ? qualified : fallback;
  if (choices.length === 0) return "unloaded-extension";
  const offset = aircraft.id === "f-35" ? state.round : state.round + 1;
  return choices[(aircraft.maneuverSequence + offset) % choices.length];
}

function chooseManeuver(
  state: DogfightSimulationState,
  aircraft: CombatAircraftState,
  maneuverId: AirCombatManeuverId,
): void {
  const definition = maneuverDefinition(maneuverId);
  const profile = PILOT_PROFILES[aircraft.pilotSkill];
  aircraft.currentManeuver = maneuverId;
  aircraft.maneuverElapsedSeconds = 0;
  aircraft.maneuverDurationSeconds =
    definition.durationSeconds * (1.08 - profile.rank * 0.07);
  aircraft.maneuverStartBankRad = normalizeAngle(aircraft.bankRad);
  aircraft.maneuverSequence += 1;
  aircraft.maneuverDirection =
    (aircraft.maneuverSequence + (aircraft.id === "f-35" ? 0 : 1)) % 2 === 0
      ? -1
      : 1;
  aircraft.decisionCooldownSeconds = profile.reactionSeconds;
  state.statistics.maneuversExecuted += 1;
}

function guidanceForManeuver(
  aircraft: CombatAircraftState,
  own: CombatAircraftState,
  opponent: CombatAircraftState,
  baseDesired: Vec3,
  incomingThreatDirection: Vec3 | null,
): ManeuverGuidance {
  const definition = maneuverDefinition(aircraft.currentManeuver);
  const profile = PILOT_PROFILES[aircraft.pilotSkill];
  const phase = clamp(
    aircraft.maneuverElapsedSeconds /
      Math.max(0.1, aircraft.maneuverDurationSeconds),
    0,
    1,
  );
  const side = aircraft.maneuverDirection;
  const right = safeRight(own.forward);
  const localUp = normalize(cross(own.forward, right));
  const toOpponent = normalize(subtract(opponent.position, own.position));
  const skillGAddition = profile.rank * 0.82;
  const commandG = Math.min(
    availablePilotG(aircraft),
    dogfightAircraftProfile(aircraft.aircraftType).game.maximumG,
    definition.maximumG,
    definition.nominalG + skillGAddition,
  );

  let desiredDirection = baseDesired;
  let speedBiasMps = 0;
  let bankOverrideRad: number | null = null;
  let directBank = false;
  const rollPhase = smootherStep(0, 1, phase);

  switch (aircraft.currentManeuver) {
    case "lag-pursuit":
      desiredDirection = normalize(
        add(baseDesired, scale(opponent.forward, -0.48)),
      );
      speedBiasMps = 10;
      break;
    case "break-turn": {
      const threat = incomingThreatDirection ?? toOpponent;
      const breakVector = normalize(cross(WORLD_UP, threat));
      desiredDirection = normalize(
        add(
          scale(breakVector, side * 1.7),
          add(scale(own.forward, 0.28), scale(localUp, 0.12)),
        ),
      );
      speedBiasMps = -12;
      break;
    }
    case "barrel-roll": {
      const angle = rollPhase * TAU * side;
      desiredDirection = normalize(
        add(
          scale(own.forward, 0.9),
          add(
            scale(right, Math.cos(angle) * 0.3),
            scale(localUp, Math.sin(angle) * 0.34),
          ),
        ),
      );
      bankOverrideRad = aircraft.maneuverStartBankRad + angle;
      directBank = true;
      speedBiasMps = -8;
      break;
    }
    case "high-yo-yo":
      desiredDirection = normalize(
        add(
          scale(baseDesired, 0.72),
          add(
            scale(localUp, Math.sin(phase * Math.PI) * 0.78),
            scale(right, side * 0.16),
          ),
        ),
      );
      speedBiasMps = -22;
      break;
    case "low-yo-yo":
      desiredDirection = normalize(
        add(
          scale(baseDesired, 0.75),
          add(
            scale(localUp, -Math.sin(phase * Math.PI) * 0.58),
            scale(right, side * 0.14),
          ),
        ),
      );
      speedBiasMps = 18;
      break;
    case "flat-scissors":
      desiredDirection = normalize(
        add(
          scale(toOpponent, 0.4),
          add(
            scale(own.forward, 0.3),
            scale(right, Math.sin(phase * Math.PI * 3) * side * 1.15),
          ),
        ),
      );
      speedBiasMps = -28;
      break;
    case "rolling-scissors": {
      const angle = phase * Math.PI * 3 * side;
      desiredDirection = normalize(
        add(
          scale(toOpponent, 0.42),
          add(
            scale(right, Math.cos(angle) * 0.72),
            scale(localUp, Math.sin(angle) * 0.62),
          ),
        ),
      );
      bankOverrideRad =
        aircraft.maneuverStartBankRad + Math.sin(angle) * Math.PI * 0.72;
      directBank = true;
      speedBiasMps = -24;
      break;
    }
    case "immelmann": {
      const loopAmount = Math.sin(phase * Math.PI);
      desiredDirection = normalize(
        add(
          scale(phase < 0.58 ? own.forward : baseDesired, 0.56),
          scale(localUp, loopAmount * 1.05),
        ),
      );
      bankOverrideRad =
        aircraft.maneuverStartBankRad +
        smootherStep(0.48, 1, phase) * Math.PI * side;
      directBank = true;
      speedBiasMps = -30;
      break;
    }
    case "split-s":
      desiredDirection = normalize(
        add(
          scale(phase < 0.38 ? own.forward : baseDesired, 0.62),
          scale(localUp, -Math.sin(phase * Math.PI) * 0.9),
        ),
      );
      bankOverrideRad =
        aircraft.maneuverStartBankRad +
        smootherStep(0, 0.45, phase) * Math.PI * side;
      directBank = true;
      speedBiasMps = 24;
      break;
    case "displacement-roll": {
      const angle = phase * TAU * side;
      desiredDirection = normalize(
        add(
          scale(baseDesired, 0.76),
          add(
            scale(right, Math.cos(angle) * 0.34),
            scale(localUp, Math.sin(angle) * 0.3),
          ),
        ),
      );
      bankOverrideRad = aircraft.maneuverStartBankRad + angle;
      directBank = true;
      speedBiasMps = -10;
      break;
    }
    case "vertical-extension":
      desiredDirection = normalize(
        add(scale(own.forward, 0.74), scale(localUp, 0.68)),
      );
      speedBiasMps = 20;
      break;
    case "unloaded-extension":
      desiredDirection = normalize({
        x: own.forward.x,
        y:
          own.forward.y * 0.4 +
          clamp((1150 - own.position.y) / 1800, -0.12, 0.12),
        z: own.forward.z,
      });
      speedBiasMps = 34;
      break;
    case "defensive-spiral":
      desiredDirection = normalize(
        add(
          scale(right, side * 1.25),
          add(scale(own.forward, 0.32), scale(localUp, -0.44)),
        ),
      );
      bankOverrideRad =
        aircraft.maneuverStartBankRad + phase * TAU * 1.4 * side;
      directBank = true;
      speedBiasMps = 8;
      break;
    case "lead-pursuit":
    default:
      desiredDirection = baseDesired;
      break;
  }

  return {
    desiredDirection,
    commandG,
    speedBiasMps,
    bankOverrideRad,
    directBank,
  };
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

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

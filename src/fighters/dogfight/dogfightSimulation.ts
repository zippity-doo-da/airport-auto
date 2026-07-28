import type {
  AircraftFlightState,
  Vec3,
} from "../playground/flightPlaygroundSimulation";
import {
  PILOT_PROFILES,
  pilotCanFlyManeuver,
  maneuverDefinition,
} from "./airCombatManeuvers";
import {
  dogfightAircraftProfile,
  type DogfightAircraftId,
} from "./combatAircraftProfiles";
import {
  COMBAT_ALTITUDES,
  COMBAT_THEATERS,
  ENGAGEMENT_SETUPS,
  createDefaultDogfightScenario,
  createScenarioSpawn,
  normalizeDogfightScenario,
  scenarioLabel,
  type DogfightScenarioSettings,
} from "./combatScenarios";
import {
  aircraftById,
  cloneAircraft,
  enforceAircraftSeparation,
  nearestIncomingMissile,
  updateAircraftPair,
  updateCooldowns,
  updateIncomingWarnings,
  updateResolvedAircraft,
} from "./dogfightFlightModel";
import {
  add,
  clamp,
  clamp01,
  cross,
  distance,
  dot,
  length,
  lengthSquared,
  normalize,
  safeRight,
  scale,
  segmentDistanceSquared,
  subtract,
  turnToward,
} from "./dogfightMath";
import type {
  CombatRules,
  CombatAircraftState,
  CombatantId,
  DogfightEvent,
  DogfightFrame,
  DogfightSimulationState,
  FlareState,
  MissileState,
  PilotSkill,
} from "./dogfightTypes";

export type {
  CombatAircraftState,
  CombatantId,
  CombatPhase,
  CombatRules,
  DogfightEffects,
  DogfightEvent,
  DogfightFrame,
  DogfightSimulationState,
  DogfightStatistics,
  DogfightWeaponSettings,
  ExplosionEffectState,
  FlareEffectState,
  MissileEffectState,
  PilotCondition,
  PilotSkill,
  AirCombatManeuverId,
  TracerEffectState,
} from "./dogfightTypes";
export type {
  CombatAltitudeId,
  CombatTheaterId,
  CombatWeatherId,
  DogfightScenarioSettings,
  EngagementSetupId,
} from "./combatScenarios";

export const DOGFIGHT_FIXED_STEP_SECONDS = 1 / 120;

const MISSILE_SPEED_MPS = 610;
const MISSILE_MAX_TURN_RADIANS = 1.18;
const ROUND_LIMIT_SECONDS = 72;
const EMPTY_EVENT: DogfightEvent = {
  id: 0,
  timeSeconds: 0,
  team: "neutral",
  kind: "round",
  headline: "Fighters inbound",
  detail: "Cannon-only crews are closing for the first merge",
};

export function createDogfightSimulation(
  seed = 0xd06f19,
): DogfightSimulationState {
  const scenario = createDefaultDogfightScenario();
  const spawn = createScenarioSpawn(scenario, false, 0.5, 0.5);
  const state: DogfightSimulationState = {
    timeSeconds: 0,
    roundTimeSeconds: 0,
    paused: false,
    playbackRate: 1,
    phase: "merge",
    round: 1,
    score: { "f-35": 0, "j-20": 0 },
    aircraft: [
      createAircraft("f-35", spawn.blue.position, spawn.blue.forward),
      createAircraft("j-20", spawn.red.position, spawn.red.forward),
    ],
    missiles: [],
    tracers: [],
    flares: [],
    explosions: [],
    events: [EMPTY_EVENT],
    combatRules: "guns-only",
    weaponSettings: {
      missiles: false,
      cannon: true,
      countermeasures: false,
    },
    scenario,
    statistics: {
      minimumSeparationMeters: Number.POSITIVE_INFINITY,
      missilesFired: 0,
      cannonBursts: 0,
      countermeasureBursts: 0,
      roundsCompleted: 0,
      maneuversExecuted: 0,
      maximumObservedG: { "f-35": 1, "j-20": 1 },
      gLimitedSeconds: { "f-35": 0, "j-20": 0 },
    },
    resetCountdownSeconds: 0,
    nextEntityId: 1,
    randomState: seed >>> 0,
  };
  for (const aircraft of state.aircraft) aircraft.missilesRemaining = 0;
  pushEvent(
    state,
    "neutral",
    "round",
    `Round 1 · ${scenarioLabel(scenario)}`,
    `${ENGAGEMENT_SETUPS[scenario.setupId].name} at ${COMBAT_ALTITUDES[scenario.altitudeId].shortName.toLowerCase()} altitude`,
  );
  state.statistics.minimumSeparationMeters = distance(
    state.aircraft[0].position,
    state.aircraft[1].position,
  );
  return state;
}

export function stepDogfightSimulation(
  state: DogfightSimulationState,
  fixedDeltaSeconds: number,
): void {
  if (state.paused) return;
  const deltaSeconds = fixedDeltaSeconds * state.playbackRate;
  state.timeSeconds += deltaSeconds;
  state.roundTimeSeconds += deltaSeconds;

  ageTransientEffects(state, deltaSeconds);

  if (state.phase === "resolved") {
    updateResolvedAircraft(state, deltaSeconds);
    enforceAircraftSeparation(state.aircraft);
    state.statistics.minimumSeparationMeters = Math.min(
      state.statistics.minimumSeparationMeters,
      distance(state.aircraft[0].position, state.aircraft[1].position),
    );
    updateMissiles(state, deltaSeconds);
    state.resetCountdownSeconds -= deltaSeconds;
    if (state.resetCountdownSeconds <= 0) resetDogfightRound(state);
    return;
  }

  updateCooldowns(state.aircraft[0], deltaSeconds);
  updateCooldowns(state.aircraft[1], deltaSeconds);
  updateIncomingWarnings(state);
  maybeDeployCountermeasures(state, state.aircraft[0]);
  maybeDeployCountermeasures(state, state.aircraft[1]);
  updateAircraftPair(state, deltaSeconds);
  updateLocks(state, deltaSeconds);
  maybeFireWeapons(state, state.aircraft[0], state.aircraft[1]);
  maybeFireWeapons(state, state.aircraft[1], state.aircraft[0]);
  updateMissiles(state, deltaSeconds);
  updateIncomingWarnings(state);

  const separation = distance(
    state.aircraft[0].position,
    state.aircraft[1].position,
  );
  state.statistics.minimumSeparationMeters = Math.min(
    state.statistics.minimumSeparationMeters,
    separation,
  );
  if (
    state.phase === "merge" &&
    (separation < 520 || state.missiles.length > 0)
  ) {
    state.phase = "engagement";
  }

  if (state.roundTimeSeconds >= ROUND_LIMIT_SECONDS) resolveTimedRound(state);
}

export function sampleDogfightFrame(
  state: DogfightSimulationState,
): DogfightFrame {
  const aircraft = state.aircraft.map(cloneAircraft) as [
    CombatAircraftState,
    CombatAircraftState,
  ];
  const flightAircraft = aircraft.map(toFlightState) as [
    AircraftFlightState,
    AircraftFlightState,
  ];
  const center = scale(add(aircraft[0].position, aircraft[1].position), 0.5);
  const combinedForward = add(aircraft[0].forward, aircraft[1].forward);
  const formationForward =
    lengthSquared(combinedForward) > 0.05
      ? normalize(combinedForward)
      : { ...aircraft[0].forward };
  const phaseLabel = describePhase(state, aircraft);

  return {
    flight: {
      timeSeconds: state.timeSeconds,
      pattern: "dogfight",
      phaseLabel,
      aircraft: flightAircraft,
      center,
      forward: formationForward,
    },
    phase: state.phase,
    phaseLabel,
    round: state.round,
    roundTimeSeconds: state.roundTimeSeconds,
    score: { ...state.score },
    aircraft,
    effects: {
      missiles: state.missiles.map((missile) => ({
        id: missile.id,
        team: missile.team,
        position: { ...missile.position },
        forward: { ...missile.forward },
      })),
      tracers: state.tracers.map((tracer) => ({
        id: tracer.id,
        team: tracer.team,
        start: { ...tracer.start },
        end: { ...tracer.end },
        life01: clamp01(1 - tracer.ageSeconds / tracer.lifetimeSeconds),
      })),
      flares: state.flares.map((flare) => ({
        id: flare.id,
        team: flare.team,
        position: { ...flare.position },
        life01: clamp01(1 - flare.ageSeconds / flare.lifetimeSeconds),
      })),
      explosions: state.explosions.map((explosion) => ({
        id: explosion.id,
        team: explosion.team,
        position: { ...explosion.position },
        radius: explosion.radius,
        life01: clamp01(1 - explosion.ageSeconds / explosion.lifetimeSeconds),
      })),
    },
    latestEvent: state.events[0] ?? EMPTY_EVENT,
    statistics: {
      ...state.statistics,
      maximumObservedG: { ...state.statistics.maximumObservedG },
      gLimitedSeconds: { ...state.statistics.gLimitedSeconds },
    },
    scenario: { ...state.scenario },
  };
}

export function restartDogfight(
  state: DogfightSimulationState,
  resetScore = false,
): void {
  if (resetScore) {
    state.score["f-35"] = 0;
    state.score["j-20"] = 0;
    state.round = 1;
    state.timeSeconds = 0;
    state.events = [];
    state.statistics = {
      minimumSeparationMeters: Number.POSITIVE_INFINITY,
      missilesFired: 0,
      cannonBursts: 0,
      countermeasureBursts: 0,
      roundsCompleted: 0,
      maneuversExecuted: 0,
      maximumObservedG: { "f-35": 1, "j-20": 1 },
      gLimitedSeconds: { "f-35": 0, "j-20": 0 },
    };
  }
  resetDogfightRound(state, false);
}

export function setDogfightCombatRules(
  state: DogfightSimulationState,
  rules: CombatRules,
): void {
  state.combatRules = rules;
  if (rules === "full") {
    state.weaponSettings = {
      missiles: true,
      cannon: true,
      countermeasures: true,
    };
  } else if (rules === "guns-only") {
    state.weaponSettings = {
      missiles: false,
      cannon: true,
      countermeasures: false,
    };
    state.missiles = [];
    state.flares = [];
    for (const aircraft of state.aircraft) {
      aircraft.missilesRemaining = 0;
      aircraft.lockProgress = 0;
      aircraft.incomingWarning = false;
    }
  }
}

export function setDogfightPilotSkill(
  state: DogfightSimulationState,
  aircraftId: CombatantId,
  skill: PilotSkill,
): void {
  const aircraft = aircraftById(state, aircraftId);
  aircraft.pilotSkill = skill;
  aircraft.availableG = PILOT_PROFILES[skill].peakG;
  aircraft.decisionCooldownSeconds = PILOT_PROFILES[skill].reactionSeconds;
  if (
    !pilotCanFlyManeuver(skill, maneuverDefinition(aircraft.currentManeuver))
  ) {
    aircraft.currentManeuver = "lead-pursuit";
    aircraft.maneuverElapsedSeconds = 0;
    aircraft.maneuverDurationSeconds =
      maneuverDefinition("lead-pursuit").durationSeconds;
  }
}

export function setDogfightAircraftType(
  state: DogfightSimulationState,
  aircraftId: CombatantId,
  aircraftType: DogfightAircraftId,
): void {
  aircraftById(state, aircraftId).aircraftType = aircraftType;
}

export function setDogfightScenario(
  state: DogfightSimulationState,
  settings: Partial<DogfightScenarioSettings>,
): void {
  state.scenario = normalizeDogfightScenario({
    ...state.scenario,
    ...settings,
  });
}

function createAircraft(
  id: CombatantId,
  position: Vec3,
  forward: Vec3,
  pilotSkill: PilotSkill = "experienced",
  aircraftType: DogfightAircraftId = id,
): CombatAircraftState {
  const normalizedForward = normalize(forward);
  const aircraftProfile = dogfightAircraftProfile(aircraftType);
  const speedMps = aircraftProfile.game.preferredSpeedMps;
  const pilotProfile = PILOT_PROFILES[pilotSkill];
  return {
    id,
    aircraftType,
    position: { ...position },
    velocity: scale(normalizedForward, speedMps),
    forward: normalizedForward,
    speedMps,
    bankRad: 0,
    health: 100,
    missilesRemaining: 6,
    cannonRounds: 220,
    missileCooldownSeconds: aircraftProfile.game.missileCooldownSeconds,
    cannonCooldownSeconds: 0,
    flareCooldownSeconds: 0,
    lockProgress: 0,
    incomingWarning: false,
    alive: true,
    pilotSkill,
    pilotCondition: "ready",
    gLoad: 1,
    availableG: pilotProfile.peakG,
    pilotFatigue: 0,
    consciousness: 1,
    currentManeuver: "lead-pursuit",
    maneuverElapsedSeconds: 0,
    maneuverDurationSeconds: maneuverDefinition("lead-pursuit").durationSeconds,
    maneuverDirection: id === "f-35" ? -1 : 1,
    maneuverStartBankRad: 0,
    maneuverSequence: 0,
    decisionCooldownSeconds: pilotProfile.reactionSeconds,
  };
}

function updateLocks(
  state: DogfightSimulationState,
  deltaSeconds: number,
): void {
  for (let index = 0; index < 2; index += 1) {
    const own = state.aircraft[index];
    const target = state.aircraft[index === 0 ? 1 : 0];
    if (!own.alive || !target.alive || !state.weaponSettings.missiles) {
      own.lockProgress = Math.max(0, own.lockProgress - deltaSeconds * 1.8);
      continue;
    }
    const offset = subtract(target.position, own.position);
    const range = length(offset);
    const alignment = dot(own.forward, normalize(offset));
    const canTrack = range > 300 && range < 2150 && alignment > 0.76;
    const lockRate =
      PILOT_PROFILES[own.pilotSkill].lockRateMultiplier *
      dogfightAircraftProfile(own.aircraftType).game.lockRateMultiplier;
    own.lockProgress = clamp01(
      own.lockProgress +
        (canTrack ? (deltaSeconds * lockRate) / 0.85 : -deltaSeconds * 1.3),
    );
  }
}

function maybeFireWeapons(
  state: DogfightSimulationState,
  own: CombatAircraftState,
  target: CombatAircraftState,
): void {
  if (!own.alive || !target.alive || state.phase === "resolved") return;
  const offset = subtract(target.position, own.position);
  const range = length(offset);
  const targetDirection = normalize(offset);
  const alignment = dot(own.forward, targetDirection);
  const cannonLeadPoint = add(
    target.position,
    scale(target.velocity, range / 950),
  );
  const cannonAlignment = dot(
    own.forward,
    normalize(subtract(cannonLeadPoint, own.position)),
  );
  const gunOnly = state.combatRules === "guns-only";

  if (
    state.weaponSettings.missiles &&
    own.missilesRemaining > 0 &&
    own.missileCooldownSeconds <= 0 &&
    own.lockProgress >= 0.995 &&
    range > 330 &&
    range < 1900 &&
    alignment > 0.82
  ) {
    launchMissile(state, own, target);
  }

  if (
    state.weaponSettings.cannon &&
    own.cannonRounds >= 8 &&
    own.cannonCooldownSeconds <= 0 &&
    range < (gunOnly ? 1050 : 720) &&
    cannonAlignment > (gunOnly ? 0.93 : 0.97)
  ) {
    fireCannonBurst(state, own, target, range, cannonAlignment);
  }
}

function launchMissile(
  state: DogfightSimulationState,
  own: CombatAircraftState,
  target: CombatAircraftState,
): void {
  const right = safeRight(own.forward);
  const launchSide = own.missilesRemaining % 2 === 0 ? -1 : 1;
  const position = add(
    own.position,
    add(
      scale(own.forward, 9),
      add(scale(right, launchSide * 3.2), { x: 0, y: -1.2, z: 0 }),
    ),
  );
  const forward = normalize(add(own.forward, { x: 0, y: -0.018, z: 0 }));
  state.missiles.push({
    id: state.nextEntityId++,
    team: own.id,
    targetId: target.id,
    decoyFlareId: null,
    position,
    forward,
    velocity: scale(forward, MISSILE_SPEED_MPS),
    ageSeconds: 0,
    lifetimeSeconds: 6.4,
  });
  own.missilesRemaining -= 1;
  own.missileCooldownSeconds =
    2.05 +
    dogfightAircraftProfile(own.aircraftType).game.missileCooldownSeconds;
  own.lockProgress = 0.18;
  state.statistics.missilesFired += 1;
  pushEvent(
    state,
    own.id,
    "missile",
    `${nameFor(state, own.id)} · missile away`,
    `${Math.round(distance(own.position, target.position))} m shot`,
  );
}

function fireCannonBurst(
  state: DogfightSimulationState,
  own: CombatAircraftState,
  target: CombatAircraftState,
  range: number,
  alignment: number,
): void {
  const start = add(own.position, scale(own.forward, 10));
  const targetLead = add(target.position, scale(target.velocity, range / 950));
  const idealDirection = normalize(subtract(targetLead, start));
  const randomRight = safeRight(idealDirection);
  const randomUp = normalize(cross(idealDirection, randomRight));
  const pilotProfile = PILOT_PROFILES[own.pilotSkill];
  const fatigueSpread = 1 + own.pilotFatigue * 0.62;
  const spreadMultiplier = pilotProfile.aimSpreadMultiplier * fatigueSpread;
  const spread = (nextRandom(state) - 0.5) * 0.014 * spreadMultiplier;
  const elevationSpread = (nextRandom(state) - 0.5) * 0.01 * spreadMultiplier;
  const shotDirection = normalize(
    add(
      idealDirection,
      add(scale(randomRight, spread), scale(randomUp, elevationSpread)),
    ),
  );
  const tracerLength = Math.min(780, range + 120);
  const end = add(start, scale(shotDirection, tracerLength));
  state.tracers.push({
    id: state.nextEntityId++,
    team: own.id,
    start,
    end,
    ageSeconds: 0,
    lifetimeSeconds: 0.16,
  });
  own.cannonRounds -= 8;
  own.cannonCooldownSeconds = 0.24;
  state.statistics.cannonBursts += 1;

  const gunOnly = state.combatRules === "guns-only";
  const hitThreshold =
    (gunOnly ? 0.977 : 0.983) +
    clamp(range / (gunOnly ? 860 : 720), 0, 1) * (gunOnly ? 0.008 : 0.009) +
    (pilotProfile.aimSpreadMultiplier - 1) * 0.0025;
  const leadAlignment = dot(shotDirection, idealDirection);
  if (
    alignment > hitThreshold &&
    leadAlignment > (gunOnly ? 0.984 : 0.989) &&
    nextRandom(state) >
      clamp(
        range / ((gunOnly ? 1750 : 1380) / pilotProfile.aimSpreadMultiplier) +
          own.pilotFatigue * 0.14,
        0.08,
        0.9,
      )
  ) {
    const damage = gunOnly
      ? 8 + nextRandom(state) * 8
      : 5.5 + nextRandom(state) * 5.5;
    applyDamage(state, target, damage, own.id, "cannon");
    pushEvent(
      state,
      own.id,
      "cannon",
      `${nameFor(state, own.id)} · cannon hit`,
      `${nameFor(state, target.id)} took ${Math.round(damage)} damage`,
    );
  }
}

function maybeDeployCountermeasures(
  state: DogfightSimulationState,
  aircraft: CombatAircraftState,
): void {
  if (
    !state.weaponSettings.countermeasures ||
    !aircraft.alive ||
    aircraft.flareCooldownSeconds > 0
  ) {
    return;
  }
  const incoming = nearestIncomingMissile(state, aircraft.id);
  if (!incoming || incoming.distance > 420) return;

  const right = safeRight(aircraft.forward);
  for (let index = 0; index < 8; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const flareVelocity = add(
      scale(aircraft.velocity, 0.48),
      add(scale(right, side * (24 + nextRandom(state) * 24)), {
        x: 0,
        y: -14 - nextRandom(state) * 22,
        z: 0,
      }),
    );
    state.flares.push({
      id: state.nextEntityId++,
      team: aircraft.id,
      position: add(aircraft.position, scale(aircraft.forward, -6)),
      velocity: flareVelocity,
      ageSeconds: 0,
      lifetimeSeconds: 2.2 + nextRandom(state) * 0.5,
    });
  }
  aircraft.flareCooldownSeconds = 5.8;
  state.statistics.countermeasureBursts += 1;
  pushEvent(
    state,
    aircraft.id,
    "flares",
    `${nameFor(state, aircraft.id)} · flares`,
    "Countermeasures deployed against an inbound missile",
  );

  for (const missile of state.missiles) {
    if (missile.targetId !== aircraft.id || missile.decoyFlareId !== null)
      continue;
    const missileDistance = distance(missile.position, aircraft.position);
    if (missileDistance > 610) continue;
    const seekerAspect = dot(missile.forward, aircraft.forward);
    const decoyChance = 0.45 + clamp(seekerAspect, -1, 1) * 0.16;
    if (nextRandom(state) < decoyChance) {
      const candidateFlares = state.flares.filter(
        (flare) => flare.team === aircraft.id,
      );
      const selected =
        candidateFlares[Math.floor(nextRandom(state) * candidateFlares.length)];
      if (selected) missile.decoyFlareId = selected.id;
    }
  }
}

function updateMissiles(
  state: DogfightSimulationState,
  deltaSeconds: number,
): void {
  const surviving: MissileState[] = [];
  for (const missile of state.missiles) {
    missile.ageSeconds += deltaSeconds;
    const previousPosition = { ...missile.position };
    let targetPosition: Vec3 | null = null;
    let targetFlare: FlareState | undefined;
    if (missile.decoyFlareId !== null) {
      targetFlare = state.flares.find(
        (flare) => flare.id === missile.decoyFlareId,
      );
      if (targetFlare) targetPosition = targetFlare.position;
      else missile.decoyFlareId = null;
    }
    const targetAircraft = aircraftById(state, missile.targetId);
    if (!targetPosition && targetAircraft.alive) {
      const leadSeconds = clamp(
        distance(missile.position, targetAircraft.position) / MISSILE_SPEED_MPS,
        0,
        0.82,
      );
      targetPosition = add(
        targetAircraft.position,
        scale(targetAircraft.velocity, leadSeconds * 0.42),
      );
    }
    if (!targetPosition) continue;

    const desired = normalize(subtract(targetPosition, missile.position));
    missile.forward = turnToward(
      missile.forward,
      desired,
      MISSILE_MAX_TURN_RADIANS * deltaSeconds,
    );
    missile.velocity = scale(missile.forward, MISSILE_SPEED_MPS);
    missile.position = add(
      missile.position,
      scale(missile.velocity, deltaSeconds),
    );

    if (
      targetFlare &&
      segmentDistanceSquared(
        previousPosition,
        missile.position,
        targetFlare.position,
      ) <
        9 * 9
    ) {
      createExplosion(state, missile.team, missile.position, 8, 0.38);
      pushEvent(
        state,
        targetFlare.team,
        "decoy",
        `${nameFor(state, targetFlare.team)} · missile decoyed`,
        "Countermeasures pulled the seeker away",
      );
      continue;
    }

    if (
      targetAircraft.alive &&
      segmentDistanceSquared(
        previousPosition,
        missile.position,
        targetAircraft.position,
      ) <
        17 * 17
    ) {
      const damage = 46 + nextRandom(state) * 12;
      createExplosion(state, missile.team, targetAircraft.position, 24, 0.72);
      applyDamage(state, targetAircraft, damage, missile.team, "missile");
      if (targetAircraft.alive) {
        pushEvent(
          state,
          missile.team,
          "hit",
          `${nameFor(state, missile.team)} · missile hit`,
          `${nameFor(state, targetAircraft.id)} at ${Math.round(targetAircraft.health)}% health`,
        );
      }
      continue;
    }

    if (missile.ageSeconds < missile.lifetimeSeconds) surviving.push(missile);
  }
  state.missiles = surviving;
}

function applyDamage(
  state: DogfightSimulationState,
  target: CombatAircraftState,
  amount: number,
  attackerId: CombatantId,
  source: "missile" | "cannon",
): void {
  if (!target.alive || state.phase === "resolved") return;
  target.health = Math.max(0, target.health - amount);
  if (target.health > 0) return;
  target.alive = false;
  target.lockProgress = 0;
  state.score[attackerId] += 1;
  state.phase = "resolved";
  state.resetCountdownSeconds = 4.2;
  state.statistics.roundsCompleted += 1;
  state.missiles = state.missiles.filter(
    (missile) => missile.team === attackerId,
  );
  createExplosion(state, attackerId, target.position, 62, 1.25);
  pushEvent(
    state,
    attackerId,
    "splash",
    `${nameFor(state, attackerId)} · splash`,
    `${nameFor(state, target.id)} defeated by ${source}; resetting for another round`,
  );
}

function resolveTimedRound(state: DogfightSimulationState): void {
  const f35 = state.aircraft[0];
  const j20 = state.aircraft[1];
  const healthDifference = f35.health - j20.health;
  if (Math.abs(healthDifference) >= 4) {
    const winner = healthDifference > 0 ? f35 : j20;
    const loser = winner.id === "f-35" ? j20 : f35;
    applyDamage(state, loser, loser.health, winner.id, "cannon");
    return;
  }
  state.phase = "resolved";
  state.resetCountdownSeconds = 3.2;
  state.statistics.roundsCompleted += 1;
  pushEvent(
    state,
    "neutral",
    "draw",
    "Round drawn",
    "The engagement timed out; both fighters are rejoining",
  );
}

function resetDogfightRound(
  state: DogfightSimulationState,
  incrementRound = true,
): void {
  if (incrementRound) state.round += 1;
  const f35PilotSkill = state.aircraft[0].pilotSkill;
  const j20PilotSkill = state.aircraft[1].pilotSkill;
  const f35AircraftType = state.aircraft[0].aircraftType;
  const j20AircraftType = state.aircraft[1].aircraftType;
  const spawn = createScenarioSpawn(
    state.scenario,
    state.weaponSettings.missiles,
    nextRandom(state),
    nextRandom(state),
  );
  const f35 = createAircraft(
    "f-35",
    spawn.blue.position,
    normalize(spawn.blue.forward),
    f35PilotSkill,
    f35AircraftType,
  );
  const j20 = createAircraft(
    "j-20",
    spawn.red.position,
    normalize(spawn.red.forward),
    j20PilotSkill,
    j20AircraftType,
  );
  if (!state.weaponSettings.missiles) {
    f35.missilesRemaining = 0;
    j20.missilesRemaining = 0;
  }
  state.aircraft = [f35, j20];
  state.statistics.minimumSeparationMeters = Math.min(
    state.statistics.minimumSeparationMeters,
    distance(f35.position, j20.position),
  );
  state.missiles = [];
  state.tracers = [];
  state.flares = [];
  state.explosions = [];
  state.phase = "merge";
  state.roundTimeSeconds = 0;
  state.resetCountdownSeconds = 0;
  pushEvent(
    state,
    "neutral",
    "round",
    `Round ${state.round} · ${scenarioLabel(state.scenario)}`,
    `${ENGAGEMENT_SETUPS[state.scenario.setupId].name} over ${COMBAT_THEATERS[state.scenario.theaterId].name}`,
  );
}

function ageTransientEffects(
  state: DogfightSimulationState,
  deltaSeconds: number,
): void {
  state.flares = state.flares.filter((flare) => {
    flare.ageSeconds += deltaSeconds;
    flare.velocity.y -= 13 * deltaSeconds;
    flare.position = add(flare.position, scale(flare.velocity, deltaSeconds));
    return flare.ageSeconds < flare.lifetimeSeconds;
  });
  state.tracers = state.tracers.filter((tracer) => {
    tracer.ageSeconds += deltaSeconds;
    return tracer.ageSeconds < tracer.lifetimeSeconds;
  });
  state.explosions = state.explosions.filter((explosion) => {
    explosion.ageSeconds += deltaSeconds;
    return explosion.ageSeconds < explosion.lifetimeSeconds;
  });
}

function createExplosion(
  state: DogfightSimulationState,
  team: CombatantId,
  position: Vec3,
  radius: number,
  lifetimeSeconds: number,
): void {
  state.explosions.push({
    id: state.nextEntityId++,
    team,
    position: { ...position },
    radius,
    ageSeconds: 0,
    lifetimeSeconds,
  });
}

function pushEvent(
  state: DogfightSimulationState,
  team: CombatantId | "neutral",
  kind: DogfightEvent["kind"],
  headline: string,
  detail: string,
): void {
  state.events.unshift({
    id: state.nextEntityId++,
    timeSeconds: state.timeSeconds,
    team,
    kind,
    headline,
    detail,
  });
  if (state.events.length > 20) state.events.length = 20;
}

function describePhase(
  state: DogfightSimulationState,
  aircraft: readonly [CombatAircraftState, CombatAircraftState],
): string {
  if (state.phase === "resolved") {
    const winner = aircraft.find((entry) => entry.alive);
    return winner
      ? `${nameFor(state, winner.id)} wins the round`
      : "Round complete";
  }
  if (aircraft.some((entry) => entry.incomingWarning)) return "Missiles active";
  if (state.missiles.length > 0) return "Beyond-visual-range exchange";
  const separation = distance(aircraft[0].position, aircraft[1].position);
  if (separation > 900)
    return state.phase === "merge" ? "Closing for the merge" : "Repositioning";
  if (separation > 330) return "Turning engagement";
  return "Close combat";
}

function toFlightState(aircraft: CombatAircraftState): AircraftFlightState {
  return {
    id: aircraft.id,
    modelId: aircraft.aircraftType,
    modelName: dogfightAircraftProfile(aircraft.aircraftType).shortName,
    position: { ...aircraft.position },
    velocity: { ...aircraft.velocity },
    forward: { ...aircraft.forward },
    bankRad: aircraft.bankRad,
    speedMps: aircraft.speedMps,
    altitudeM: aircraft.position.y,
  };
}

function nameFor(state: DogfightSimulationState, id: CombatantId): string {
  return dogfightAircraftProfile(aircraftById(state, id).aircraftType)
    .shortName;
}

function nextRandom(state: DogfightSimulationState): number {
  state.randomState = (state.randomState * 1664525 + 1013904223) >>> 0;
  return state.randomState / 0x1_0000_0000;
}

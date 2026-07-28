import {
  add,
  clamp,
  distance,
  dot,
  length,
  normalize,
  scale,
  subtract,
  turnToward,
} from "./dogfightMath";
import {
  availablePilotG,
  maximumTurnRateForG,
  updateManeuverGuidance,
  updatePilotPhysiology,
} from "./dogfightManeuverPlanner";
import { dogfightAircraftProfile } from "./combatAircraftProfiles";
import {
  COMBAT_ALTITUDES,
  COMBAT_THEATERS,
  scenarioOperationalFloorM,
  scenarioWindVector,
} from "./combatScenarios";
import type {
  CombatAircraftState,
  CombatantId,
  DogfightSimulationState,
  MissileState,
} from "./dogfightTypes";

const MISSILE_SPEED_MPS = 610;
const AIRCRAFT_MINIMUM_SEPARATION_METERS = 72;

export function updateAircraftPair(
  state: DogfightSimulationState,
  deltaSeconds: number,
): void {
  const snapshots = state.aircraft.map(cloneAircraft) as [
    CombatAircraftState,
    CombatAircraftState,
  ];
  for (let index = 0; index < 2; index += 1) {
    const aircraft = state.aircraft[index];
    if (!aircraft.alive) continue;
    const own = snapshots[index];
    const opponent = snapshots[index === 0 ? 1 : 0];
    updateAircraftAI(state, aircraft, own, opponent, deltaSeconds);
  }
  enforceAircraftSeparation(state.aircraft);
}

export function enforceAircraftSeparation(
  aircraft: [CombatAircraftState, CombatAircraftState],
): void {
  const first = aircraft[0];
  const second = aircraft[1];
  const offset = subtract(second.position, first.position);
  const separation = length(offset);
  if (separation >= AIRCRAFT_MINIMUM_SEPARATION_METERS) return;
  const normal =
    separation > 1e-4 ? scale(offset, 1 / separation) : { x: 1, y: 0, z: 0 };
  const correction =
    (AIRCRAFT_MINIMUM_SEPARATION_METERS - separation) * 0.5 + 0.05;
  first.position = add(first.position, scale(normal, -correction));
  second.position = add(second.position, scale(normal, correction));
  first.forward = normalize(add(first.forward, scale(normal, -0.72)));
  second.forward = normalize(add(second.forward, scale(normal, 0.72)));
  first.velocity = scale(first.forward, first.speedMps);
  second.velocity = scale(second.forward, second.speedMps);
}

export function updateResolvedAircraft(
  state: DogfightSimulationState,
  deltaSeconds: number,
): void {
  const wind = scenarioWindVector(state.scenario);
  for (const aircraft of state.aircraft) {
    if (aircraft.alive) {
      aircraft.position = add(
        aircraft.position,
        scale(add(aircraft.velocity, wind), deltaSeconds),
      );
      const operationalFloor = scenarioOperationalFloorM(
        state.scenario,
        aircraft.position.x,
        aircraft.position.z,
      );
      if (aircraft.position.y < operationalFloor) {
        aircraft.position.y = operationalFloor;
        aircraft.forward = normalize({
          ...aircraft.forward,
          y: Math.max(0.18, aircraft.forward.y),
        });
        aircraft.velocity = scale(aircraft.forward, aircraft.speedMps);
      }
      continue;
    }
    aircraft.forward = normalize(
      add(aircraft.forward, { x: 0, y: -deltaSeconds * 0.42, z: 0 }),
    );
    aircraft.velocity = scale(aircraft.forward, aircraft.speedMps * 0.92);
    aircraft.position = add(
      aircraft.position,
      scale(aircraft.velocity, deltaSeconds),
    );
    aircraft.bankRad += deltaSeconds * 1.9;
  }
}

export function updateCooldowns(
  aircraft: CombatAircraftState,
  deltaSeconds: number,
): void {
  aircraft.missileCooldownSeconds = Math.max(
    0,
    aircraft.missileCooldownSeconds - deltaSeconds,
  );
  aircraft.cannonCooldownSeconds = Math.max(
    0,
    aircraft.cannonCooldownSeconds - deltaSeconds,
  );
  aircraft.flareCooldownSeconds = Math.max(
    0,
    aircraft.flareCooldownSeconds - deltaSeconds,
  );
}

export function updateIncomingWarnings(state: DogfightSimulationState): void {
  for (const aircraft of state.aircraft) {
    aircraft.incomingWarning = state.missiles.some(
      (missile) =>
        missile.targetId === aircraft.id &&
        missile.decoyFlareId === null &&
        distance(missile.position, aircraft.position) < 1250,
    );
  }
}

export function nearestIncomingMissile(
  state: DogfightSimulationState,
  targetId: CombatantId,
): { missile: MissileState; distance: number } | null {
  const target = aircraftById(state, targetId);
  let nearest: { missile: MissileState; distance: number } | null = null;
  for (const missile of state.missiles) {
    if (missile.targetId !== targetId || missile.decoyFlareId !== null) {
      continue;
    }
    const missileDistance = distance(missile.position, target.position);
    if (!nearest || missileDistance < nearest.distance) {
      nearest = { missile, distance: missileDistance };
    }
  }
  return nearest;
}

function updateAircraftAI(
  state: DogfightSimulationState,
  aircraft: CombatAircraftState,
  own: CombatAircraftState,
  opponent: CombatAircraftState,
  deltaSeconds: number,
): void {
  const toOpponent = subtract(opponent.position, own.position);
  const opponentDistance = Math.max(1, length(toOpponent));
  const gunsOnly = state.combatRules === "guns-only";
  const directDirection = normalize(toOpponent);
  const opponentBearing = dot(own.forward, directDirection);
  const leadSeconds = gunsOnly
    ? clamp(opponentDistance / 950, 0.08, 0.72)
    : clamp(opponentDistance / MISSILE_SPEED_MPS, 0.15, 1.7);
  const leadPoint = add(
    opponent.position,
    scale(opponent.velocity, leadSeconds),
  );
  const interceptDirection = normalize(subtract(leadPoint, own.position));
  let desiredDirection = interceptDirection;

  const nearestIncoming = nearestIncomingMissile(state, own.id);
  const guidance = updateManeuverGuidance(
    state,
    aircraft,
    own,
    opponent,
    desiredDirection,
    nearestIncoming?.missile.forward ?? null,
    deltaSeconds,
  );
  desiredDirection = guidance.desiredDirection;

  const reversingAfterPass =
    gunsOnly && opponentDistance > 240 && opponentBearing < -0.12;
  const rejoiningFight =
    gunsOnly && (opponentDistance > 720 || reversingAfterPass);
  if (rejoiningFight) {
    // A cannon fight should repeatedly merge, reverse and merge again. Aim at
    // the opponent itself while it is aft, then transition to a short gun
    // lead as it comes back across the nose. The G command is still capped by
    // the selected pilot's current tolerance and the aircraft envelope.
    desiredDirection = interceptDirection;
    if (opponentBearing < 0.7) {
      const airframe = dogfightAircraftProfile(own.aircraftType).game;
      const rejoinG = Math.min(
        airframe.maximumG,
        availablePilotG(aircraft) * 0.92,
      );
      guidance.commandG = Math.max(guidance.commandG, rejoinG);
    }
    guidance.speedBiasMps += opponentBearing < 0 ? -32 : 16;
    guidance.bankOverrideRad = null;
    guidance.directBank = false;
  } else if (gunsOnly && opponentDistance > 560) {
    const pursuitWeight = clamp((opponentDistance - 520) / 220, 0.25, 0.8);
    desiredDirection = normalize(
      add(desiredDirection, scale(interceptDirection, pursuitWeight)),
    );
  }

  const arenaRadius = Math.hypot(own.position.x, own.position.z);
  const combatRadius = COMBAT_THEATERS[state.scenario.theaterId].combatRadiusM;
  const arenaBoundary = combatRadius * 0.84;
  if (arenaRadius > arenaBoundary) {
    const centerBias = normalize({
      x: -own.position.x,
      y: 0,
      z: -own.position.z,
    });
    desiredDirection = normalize(
      add(
        desiredDirection,
        scale(
          centerBias,
          clamp(
            (arenaRadius - combatRadius * 0.76) / (combatRadius * 0.16),
            0,
            1.45,
          ),
        ),
      ),
    );
  }

  const altitudeProfile = COMBAT_ALTITUDES[state.scenario.altitudeId];
  const operationalFloor = scenarioOperationalFloorM(
    state.scenario,
    own.position.x,
    own.position.z,
  );
  const lookAheadFloor = scenarioOperationalFloorM(
    state.scenario,
    own.position.x + own.forward.x * 1_100,
    own.position.z + own.forward.z * 1_100,
  );
  const targetAltitude = clamp(
    altitudeProfile.baseAltitudeM +
      Math.sin(state.timeSeconds * 0.085 + (own.id === "f-35" ? 0 : 2.1)) *
        altitudeProfile.variationM,
    operationalFloor + 450,
    altitudeProfile.maximumAltitudeM - 500,
  );
  desiredDirection = normalize({
    x: desiredDirection.x,
    y:
      desiredDirection.y +
      clamp(
        (targetAltitude - own.position.y) /
          Math.max(1_250, altitudeProfile.variationM * 2.1),
        -0.38,
        0.38,
      ),
    z: desiredDirection.z,
  });
  const terrainMargin = own.position.y - lookAheadFloor;
  if (terrainMargin < 1_350) {
    desiredDirection = normalize({
      ...desiredDirection,
      y: desiredDirection.y + clamp((1_350 - terrainMargin) / 680, 0.35, 1.45),
    });
    guidance.commandG = Math.max(guidance.commandG, 4.2);
  }

  if (opponentDistance < 175) {
    const away = normalize(subtract(own.position, opponent.position));
    desiredDirection = normalize(
      add(desiredDirection, scale(away, (175 - opponentDistance) / 48 + 1.25)),
    );
  }

  const turnLoad = 1 - clamp(dot(own.forward, desiredDirection), -1, 1);
  const airframe = dogfightAircraftProfile(own.aircraftType).game;
  const airframeTurnRate =
    airframe.airframeTurnRateRadPerSecond * (1 - turnLoad * 0.18);
  const pilotTurnRate = maximumTurnRateForG(guidance.commandG, own.speedMps);
  const turnRate = Math.max(
    0.035,
    Math.min(Math.max(0.22, airframeTurnRate), pilotTurnRate),
  );
  if (pilotTurnRate < airframeTurnRate) {
    state.statistics.gLimitedSeconds[own.id] += deltaSeconds;
  }
  const nextForward = turnToward(
    own.forward,
    desiredDirection,
    turnRate * deltaSeconds,
  );
  const horizontalTurn =
    own.forward.z * nextForward.x - own.forward.x * nextForward.z;
  const turnSign = Math.sign(horizontalTurn) || aircraft.maneuverDirection;
  const targetBank =
    guidance.bankOverrideRad ??
    turnSign * Math.acos(1 / Math.max(1.001, guidance.commandG));
  if (guidance.directBank) {
    aircraft.bankRad = targetBank;
  } else {
    const bankAlpha = 1 - Math.exp(-deltaSeconds * 4.8);
    aircraft.bankRad +=
      shortestAngleDelta(aircraft.bankRad, targetBank) * bankAlpha;
  }

  const maneuverPenalty = Math.min(28, turnLoad * 42);
  const preferredSpeed =
    airframe.preferredSpeedMps - maneuverPenalty + guidance.speedBiasMps;
  const acceleration = clamp(
    (preferredSpeed - own.speedMps) * 0.9,
    -airframe.decelerationMps2,
    airframe.accelerationMps2,
  );
  aircraft.speedMps = clamp(
    own.speedMps + acceleration * deltaSeconds,
    airframe.minimumSpeedMps,
    airframe.maximumSpeedMps,
  );
  aircraft.forward = nextForward;
  aircraft.velocity = scale(nextForward, aircraft.speedMps);
  const wind = scenarioWindVector(state.scenario);
  aircraft.position = add(
    own.position,
    scale(add(aircraft.velocity, wind), deltaSeconds),
  );
  const actualTurnRate =
    Math.acos(clamp(dot(own.forward, nextForward), -1, 1)) /
    Math.max(deltaSeconds, 1e-5);
  updatePilotPhysiology(
    state,
    aircraft,
    actualTurnRate,
    guidance.commandG,
    deltaSeconds,
  );

  const hardFloor = scenarioOperationalFloorM(
    state.scenario,
    aircraft.position.x,
    aircraft.position.z,
  );
  if (aircraft.position.y < hardFloor) {
    aircraft.position.y = hardFloor;
    aircraft.forward = normalize({
      ...aircraft.forward,
      y: Math.max(0.18, aircraft.forward.y),
    });
    aircraft.velocity = scale(aircraft.forward, aircraft.speedMps);
  } else if (aircraft.position.y > altitudeProfile.maximumAltitudeM) {
    aircraft.forward = normalize({
      ...aircraft.forward,
      y: Math.min(-0.1, aircraft.forward.y),
    });
    aircraft.velocity = scale(aircraft.forward, aircraft.speedMps);
  }
}

function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function cloneAircraft(
  aircraft: CombatAircraftState,
): CombatAircraftState {
  return {
    ...aircraft,
    position: { ...aircraft.position },
    velocity: { ...aircraft.velocity },
    forward: { ...aircraft.forward },
  };
}

export function aircraftById(
  state: DogfightSimulationState,
  id: CombatantId,
): CombatAircraftState {
  return id === "f-35" ? state.aircraft[0] : state.aircraft[1];
}

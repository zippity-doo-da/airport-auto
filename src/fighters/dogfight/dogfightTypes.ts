import type {
  PlaygroundFlightFrame,
  Vec3,
} from "../playground/flightPlaygroundSimulation";
import type { DogfightAircraftId } from "./combatAircraftProfiles";
import type { DogfightScenarioSettings } from "./combatScenarios";

export type CombatantId = "f-35" | "j-20";
export type CombatPhase = "merge" | "engagement" | "resolved";
export type CombatRules = "full" | "guns-only" | "custom";
export type PilotSkill = "green" | "experienced" | "ace";
export type PilotCondition = "ready" | "working" | "strained" | "recovering";
export type AirCombatManeuverId =
  | "lead-pursuit"
  | "lag-pursuit"
  | "break-turn"
  | "barrel-roll"
  | "high-yo-yo"
  | "low-yo-yo"
  | "flat-scissors"
  | "rolling-scissors"
  | "immelmann"
  | "split-s"
  | "displacement-roll"
  | "vertical-extension"
  | "unloaded-extension"
  | "defensive-spiral";

export interface DogfightWeaponSettings {
  missiles: boolean;
  cannon: boolean;
  countermeasures: boolean;
}

export interface CombatAircraftState {
  id: CombatantId;
  aircraftType: DogfightAircraftId;
  position: Vec3;
  velocity: Vec3;
  forward: Vec3;
  speedMps: number;
  bankRad: number;
  health: number;
  missilesRemaining: number;
  cannonRounds: number;
  missileCooldownSeconds: number;
  cannonCooldownSeconds: number;
  flareCooldownSeconds: number;
  lockProgress: number;
  incomingWarning: boolean;
  alive: boolean;
  pilotSkill: PilotSkill;
  pilotCondition: PilotCondition;
  gLoad: number;
  availableG: number;
  pilotFatigue: number;
  consciousness: number;
  currentManeuver: AirCombatManeuverId;
  maneuverElapsedSeconds: number;
  maneuverDurationSeconds: number;
  maneuverDirection: -1 | 1;
  maneuverStartBankRad: number;
  maneuverSequence: number;
  decisionCooldownSeconds: number;
}

export interface MissileEffectState {
  id: number;
  team: CombatantId;
  position: Vec3;
  forward: Vec3;
}

export interface TracerEffectState {
  id: number;
  team: CombatantId;
  start: Vec3;
  end: Vec3;
  life01: number;
}

export interface FlareEffectState {
  id: number;
  team: CombatantId;
  position: Vec3;
  life01: number;
}

export interface ExplosionEffectState {
  id: number;
  team: CombatantId;
  position: Vec3;
  radius: number;
  life01: number;
}

export interface DogfightEffects {
  missiles: readonly MissileEffectState[];
  tracers: readonly TracerEffectState[];
  flares: readonly FlareEffectState[];
  explosions: readonly ExplosionEffectState[];
}

export interface DogfightEvent {
  id: number;
  timeSeconds: number;
  team: CombatantId | "neutral";
  kind:
    | "round"
    | "missile"
    | "cannon"
    | "hit"
    | "flares"
    | "decoy"
    | "splash"
    | "draw";
  headline: string;
  detail: string;
}

export interface DogfightFrame {
  flight: PlaygroundFlightFrame;
  phase: CombatPhase;
  phaseLabel: string;
  round: number;
  roundTimeSeconds: number;
  score: Record<CombatantId, number>;
  aircraft: readonly [CombatAircraftState, CombatAircraftState];
  effects: DogfightEffects;
  latestEvent: DogfightEvent;
  statistics: DogfightStatistics;
  scenario: DogfightScenarioSettings;
}

export interface DogfightStatistics {
  minimumSeparationMeters: number;
  missilesFired: number;
  cannonBursts: number;
  countermeasureBursts: number;
  roundsCompleted: number;
  maneuversExecuted: number;
  maximumObservedG: Record<CombatantId, number>;
  gLimitedSeconds: Record<CombatantId, number>;
}

export interface MissileState extends MissileEffectState {
  velocity: Vec3;
  targetId: CombatantId;
  decoyFlareId: number | null;
  ageSeconds: number;
  lifetimeSeconds: number;
}

export interface TracerState extends Omit<TracerEffectState, "life01"> {
  ageSeconds: number;
  lifetimeSeconds: number;
}

export interface FlareState extends Omit<FlareEffectState, "life01"> {
  velocity: Vec3;
  ageSeconds: number;
  lifetimeSeconds: number;
}

export interface ExplosionState extends Omit<ExplosionEffectState, "life01"> {
  ageSeconds: number;
  lifetimeSeconds: number;
}

export interface DogfightSimulationState {
  timeSeconds: number;
  roundTimeSeconds: number;
  paused: boolean;
  playbackRate: number;
  phase: CombatPhase;
  round: number;
  score: Record<CombatantId, number>;
  aircraft: [CombatAircraftState, CombatAircraftState];
  missiles: MissileState[];
  tracers: TracerState[];
  flares: FlareState[];
  explosions: ExplosionState[];
  events: DogfightEvent[];
  combatRules: CombatRules;
  weaponSettings: DogfightWeaponSettings;
  scenario: DogfightScenarioSettings;
  statistics: DogfightStatistics;
  resetCountdownSeconds: number;
  nextEntityId: number;
  randomState: number;
}

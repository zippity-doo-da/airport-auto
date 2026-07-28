import type { AirCombatManeuverId, PilotSkill } from "./dogfightTypes";

export type ManeuverCategory = "pursuit" | "energy" | "reversal" | "defensive";

export interface AirCombatManeuverDefinition {
  id: AirCombatManeuverId;
  name: string;
  category: ManeuverCategory;
  minimumSkill: PilotSkill;
  nominalG: number;
  maximumG: number;
  durationSeconds: number;
  summary: string;
  useWhen: string;
}

export interface PilotProfile {
  id: PilotSkill;
  name: string;
  rank: number;
  sustainedG: number;
  peakG: number;
  reactionSeconds: number;
  aimSpreadMultiplier: number;
  lockRateMultiplier: number;
  fatigueMultiplier: number;
  recoveryMultiplier: number;
  description: string;
}

// These are deliberately readable, game-scale physiology bands. They model
// relative skill and fatigue without claiming medical or aircraft-specific
// certification accuracy.
export const PILOT_PROFILES: Readonly<Record<PilotSkill, PilotProfile>> = {
  green: {
    id: "green",
    name: "Green",
    rank: 0,
    sustainedG: 4.5,
    peakG: 6.2,
    reactionSeconds: 1.35,
    aimSpreadMultiplier: 1.65,
    lockRateMultiplier: 0.78,
    fatigueMultiplier: 1.3,
    recoveryMultiplier: 0.72,
    description:
      "Slower decisions, wider gun dispersion, a smaller maneuver vocabulary, and earlier G limiting.",
  },
  experienced: {
    id: "experienced",
    name: "Experienced",
    rank: 1,
    sustainedG: 6,
    peakG: 8,
    reactionSeconds: 0.86,
    aimSpreadMultiplier: 1,
    lockRateMultiplier: 1,
    fatigueMultiplier: 1,
    recoveryMultiplier: 1,
    description:
      "Balanced reactions, accurate gunnery, and access to standard vertical and rolling maneuvers.",
  },
  ace: {
    id: "ace",
    name: "Ace",
    rank: 2,
    sustainedG: 7.4,
    peakG: 9.2,
    reactionSeconds: 0.5,
    aimSpreadMultiplier: 0.62,
    lockRateMultiplier: 1.24,
    fatigueMultiplier: 0.74,
    recoveryMultiplier: 1.28,
    description:
      "Fast decisions, precise lead, the full maneuver library, and the greatest sustained-G tolerance.",
  },
};

export const AIR_COMBAT_MANEUVERS: readonly AirCombatManeuverDefinition[] = [
  {
    id: "lead-pursuit",
    name: "Lead pursuit",
    category: "pursuit",
    minimumSkill: "green",
    nominalG: 2.8,
    maximumG: 5.2,
    durationSeconds: 2.4,
    summary: "Points ahead of the opponent to reduce angular closure.",
    useWhen: "Building a firing solution from medium range.",
  },
  {
    id: "lag-pursuit",
    name: "Lag pursuit",
    category: "pursuit",
    minimumSkill: "green",
    nominalG: 2.5,
    maximumG: 4.8,
    durationSeconds: 2.8,
    summary: "Aims behind the opponent to preserve energy and spacing.",
    useWhen: "Closure is high or an overshoot is developing.",
  },
  {
    id: "break-turn",
    name: "Break turn",
    category: "defensive",
    minimumSkill: "green",
    nominalG: 5.4,
    maximumG: 9,
    durationSeconds: 1.8,
    summary: "A hard turn across the threat line to spoil its solution.",
    useWhen: "A missile or close gun threat demands immediate defense.",
  },
  {
    id: "barrel-roll",
    name: "Barrel roll",
    category: "reversal",
    minimumSkill: "green",
    nominalG: 3.4,
    maximumG: 5.8,
    durationSeconds: 2.5,
    summary: "Combines roll and pitch into a corkscrew flight path.",
    useWhen: "Managing closure while changing relative position.",
  },
  {
    id: "flat-scissors",
    name: "Flat scissors",
    category: "reversal",
    minimumSkill: "green",
    nominalG: 4.2,
    maximumG: 6.4,
    durationSeconds: 3.4,
    summary: "Alternating horizontal reversals contest the overshoot.",
    useWhen: "Both fighters are slow and close after the merge.",
  },
  {
    id: "vertical-extension",
    name: "Vertical extension",
    category: "energy",
    minimumSkill: "green",
    nominalG: 3.2,
    maximumG: 5.4,
    durationSeconds: 2.6,
    summary: "Climbs away to convert speed into altitude and separation.",
    useWhen: "The fighter has speed but needs room to reset.",
  },
  {
    id: "unloaded-extension",
    name: "Unload and extend",
    category: "energy",
    minimumSkill: "green",
    nominalG: 1.4,
    maximumG: 2.2,
    durationSeconds: 2.2,
    summary: "Relaxes the turn, accelerates, and lets the pilot recover.",
    useWhen: "Pilot fatigue is high or the engagement needs resetting.",
  },
  {
    id: "high-yo-yo",
    name: "High yo-yo",
    category: "energy",
    minimumSkill: "experienced",
    nominalG: 4.6,
    maximumG: 7.2,
    durationSeconds: 3.1,
    summary: "Climbs above the turn to reduce closure, then drops back in.",
    useWhen: "An attacker is closing too quickly from behind.",
  },
  {
    id: "low-yo-yo",
    name: "Low yo-yo",
    category: "energy",
    minimumSkill: "experienced",
    nominalG: 4.4,
    maximumG: 7,
    durationSeconds: 2.8,
    summary: "Dips below the turn to gain speed and cut across the circle.",
    useWhen: "More closure is needed against a turning opponent.",
  },
  {
    id: "rolling-scissors",
    name: "Rolling scissors",
    category: "reversal",
    minimumSkill: "experienced",
    nominalG: 5.2,
    maximumG: 7.8,
    durationSeconds: 3.8,
    summary: "A climbing and descending series of rolling reversals.",
    useWhen: "A close vertical overshoot contest has developed.",
  },
  {
    id: "immelmann",
    name: "Immelmann",
    category: "reversal",
    minimumSkill: "experienced",
    nominalG: 5,
    maximumG: 7.5,
    durationSeconds: 3.2,
    summary: "A climbing half-loop and roll reverse direction for altitude.",
    useWhen: "Reversing with enough speed and vertical room.",
  },
  {
    id: "split-s",
    name: "Split-S",
    category: "reversal",
    minimumSkill: "experienced",
    nominalG: 5.4,
    maximumG: 8,
    durationSeconds: 3,
    summary: "A roll into a descending half-loop trades altitude for speed.",
    useWhen: "A rapid descending reversal is safe and useful.",
  },
  {
    id: "displacement-roll",
    name: "Displacement roll",
    category: "pursuit",
    minimumSkill: "experienced",
    nominalG: 4.5,
    maximumG: 7.2,
    durationSeconds: 2.9,
    summary: "A rolling arc shifts the flight path without a direct overshoot.",
    useWhen: "Fine-tuning position near the opponent's turn circle.",
  },
  {
    id: "defensive-spiral",
    name: "Defensive spiral",
    category: "defensive",
    minimumSkill: "ace",
    nominalG: 6.4,
    maximumG: 9.1,
    durationSeconds: 3.2,
    summary: "A descending, high-load spiral forces a difficult pursuit.",
    useWhen:
      "An expert pilot is threatened at close range with altitude available.",
  },
] as const;

const MANEUVER_BY_ID = new Map(
  AIR_COMBAT_MANEUVERS.map((maneuver) => [maneuver.id, maneuver]),
);

export function maneuverDefinition(
  id: AirCombatManeuverId,
): AirCombatManeuverDefinition {
  const definition = MANEUVER_BY_ID.get(id);
  if (!definition) throw new Error(`Unknown air-combat maneuver: ${id}`);
  return definition;
}

export function pilotCanFlyManeuver(
  skill: PilotSkill,
  maneuver: AirCombatManeuverDefinition,
): boolean {
  return (
    PILOT_PROFILES[skill].rank >= PILOT_PROFILES[maneuver.minimumSkill].rank
  );
}

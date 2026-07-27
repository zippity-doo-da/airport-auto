import { challengeDefinitions } from "./challengeProgram";
import type { ChallengeId } from "./types";

export const DAILY_CHALLENGE_SCHEMA_VERSION = 1 as const;

export const DAILY_CHALLENGE_AIRPORTS = [
  "ATL",
  "DXB",
  "HND",
  "DFW",
  "ORD",
  "LHR",
  "IST",
  "DEN",
  "LAX",
  "JFK",
] as const;

export interface DailyChallengePlan {
  schemaVersion: typeof DAILY_CHALLENGE_SCHEMA_VERSION;
  date: string;
  id: string;
  airportCode: (typeof DAILY_CHALLENGE_AIRPORTS)[number];
  seed: number;
  challengeId: ChallengeId;
  challengeTitle: string;
  mode: "assisted";
  station: "supervisor";
  separationRuleset: "forgiving";
  deterministic: true;
}

export interface DailyChallengeLinkOptions {
  classroom?: boolean;
}

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function dateString(value: Date | string): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime()))
      throw new Error("Daily challenge date is invalid.");
    return value.toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Daily challenge date must use YYYY-MM-DD.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Daily challenge date is invalid.");
  }
  return value;
}

export function dailyChallengePlan(
  value: Date | string = new Date(),
): DailyChallengePlan {
  const date = dateString(value);
  const hash = fnv1a32(
    `airport-auto:daily:v${DAILY_CHALLENGE_SCHEMA_VERSION}:${date}`,
  );
  const definitions = challengeDefinitions();
  if (definitions.length === 0)
    throw new Error("No challenge definitions are available.");
  const airportCode =
    DAILY_CHALLENGE_AIRPORTS[hash % DAILY_CHALLENGE_AIRPORTS.length];
  const challenge = definitions[(hash >>> 8) % definitions.length];
  const seed = fnv1a32(
    `airport-auto:daily:seed:${date}:${airportCode}:${challenge.id}`,
  );
  return {
    schemaVersion: DAILY_CHALLENGE_SCHEMA_VERSION,
    date,
    id: `daily-${date}-${airportCode.toLowerCase()}-${challenge.id}`,
    airportCode,
    seed,
    challengeId: challenge.id,
    challengeTitle: challenge.title,
    mode: "assisted",
    station: "supervisor",
    separationRuleset: "forgiving",
    deterministic: true,
  };
}

export function buildDailyChallengeLink(
  currentUrl: string,
  plan: DailyChallengePlan,
  options: DailyChallengeLinkOptions = {},
): string {
  const url = new URL(currentUrl);
  url.hash = "";
  url.search = "";
  url.searchParams.set("airport", plan.airportCode);
  url.searchParams.set("seed", String(plan.seed));
  url.searchParams.set("mode", plan.mode);
  url.searchParams.set("station", plan.station);
  url.searchParams.set("rules", plan.separationRuleset);
  url.searchParams.set("challenge", plan.challengeId);
  url.searchParams.set("daily", plan.date);
  if (options.classroom) url.searchParams.set("classroom", plan.date);
  return url.toString();
}

export type OperationTrafficClass =
  "passenger" | "cargo" | "regional" | "general-aviation";
export type AirportOperationArchetype =
  "hub-banked" | "international-gateway" | "local-mixed";

export interface AirportOperationSource {
  title: string;
  url?: string;
  published?: string;
  role: "annual-volume-reference" | "time-of-day-shape" | "schematic-design";
}

export interface AirportOperationMix {
  arrivalShare: number;
  departureShare: number;
  passengerShare: number;
  cargoShare: number;
  regionalShare: number;
  generalAviationShare: number;
}

export interface AirportOperationPeriod {
  id: string;
  label: string;
  startLocalMinute: number;
  endLocalMinute: number;
  demandMultiplier: number;
  mix: AirportOperationMix;
}

export interface AirportOperationProfile {
  schemaVersion: 1;
  airportCode: string;
  timezone: string;
  archetype: AirportOperationArchetype;
  nominalAnnualOperations: number | null;
  nominalDailyOperations: number | null;
  sessionStartLocalMinute: number;
  localMinutesPerSimulationSecond: number;
  periods: AirportOperationPeriod[];
  sources: AirportOperationSource[];
  fidelity: "sourced-volume-schematic-shape" | "schematic";
}

export interface AirportOperationState {
  localMinute: number;
  localHour: number;
  localTime: string;
  periodId: string;
  periodLabel: string;
  nextPeriodId: string;
  nextPeriodLabel: string;
  minutesUntilNextPeriod: number;
  demandMultiplier: number;
  arrivalIntervalMultiplier: number;
  departureReadinessMultiplier: number;
  mix: AirportOperationMix;
}

interface AirportTrafficCharacter {
  timezone: string;
  archetype: AirportOperationArchetype;
  startMinute: number;
  cargo: number;
  regional: number;
  generalAviation: number;
}

interface DemandBand {
  id: string;
  label: string;
  start: number;
  end: number;
  demand: number;
  arrivalShare: number;
}

const AIRPORT_CHARACTERS: Record<string, AirportTrafficCharacter> = {
  ATL: {
    timezone: "America/New_York",
    archetype: "hub-banked",
    startMinute: 5 * 60 + 35,
    cargo: 0.04,
    regional: 0.2,
    generalAviation: 0.005,
  },
  ORD: {
    timezone: "America/Chicago",
    archetype: "hub-banked",
    startMinute: 5 * 60 + 35,
    cargo: 0.08,
    regional: 0.24,
    generalAviation: 0.01,
  },
  DFW: {
    timezone: "America/Chicago",
    archetype: "hub-banked",
    startMinute: 5 * 60 + 30,
    cargo: 0.09,
    regional: 0.2,
    generalAviation: 0.015,
  },
  DEN: {
    timezone: "America/Denver",
    archetype: "hub-banked",
    startMinute: 5 * 60 + 45,
    cargo: 0.05,
    regional: 0.25,
    generalAviation: 0.018,
  },
  DXB: {
    timezone: "Asia/Dubai",
    archetype: "international-gateway",
    startMinute: 4 * 60 + 50,
    cargo: 0.13,
    regional: 0.04,
    generalAviation: 0.006,
  },
  HND: {
    timezone: "Asia/Tokyo",
    archetype: "international-gateway",
    startMinute: 5 * 60 + 50,
    cargo: 0.03,
    regional: 0.08,
    generalAviation: 0.002,
  },
  LHR: {
    timezone: "Europe/London",
    archetype: "international-gateway",
    startMinute: 5 * 60 + 35,
    cargo: 0.04,
    regional: 0.09,
    generalAviation: 0.003,
  },
  IST: {
    timezone: "Europe/Istanbul",
    archetype: "international-gateway",
    startMinute: 5 * 60 + 15,
    cargo: 0.08,
    regional: 0.09,
    generalAviation: 0.006,
  },
  LAX: {
    timezone: "America/Los_Angeles",
    archetype: "international-gateway",
    startMinute: 5 * 60 + 20,
    cargo: 0.09,
    regional: 0.12,
    generalAviation: 0.012,
  },
  JFK: {
    timezone: "America/New_York",
    archetype: "international-gateway",
    startMinute: 6 * 60,
    cargo: 0.08,
    regional: 0.11,
    generalAviation: 0.006,
  },
  LOCAL: {
    timezone: "Local",
    archetype: "local-mixed",
    startMinute: 6 * 60 + 20,
    cargo: 0.05,
    regional: 0.3,
    generalAviation: 0.45,
  },
};

const HUB_BANKS: DemandBand[] = [
  {
    id: "overnight",
    label: "Overnight cargo and repositioning",
    start: 0,
    end: 300,
    demand: 0.38,
    arrivalShare: 0.48,
  },
  {
    id: "morning-departure",
    label: "Morning departure bank",
    start: 300,
    end: 480,
    demand: 1.08,
    arrivalShare: 0.38,
  },
  {
    id: "morning-arrival",
    label: "Morning arrival bank",
    start: 480,
    end: 660,
    demand: 1.24,
    arrivalShare: 0.62,
  },
  {
    id: "midday",
    label: "Midday balanced flow",
    start: 660,
    end: 900,
    demand: 0.94,
    arrivalShare: 0.5,
  },
  {
    id: "afternoon-arrival",
    label: "Afternoon arrival bank",
    start: 900,
    end: 1080,
    demand: 1.3,
    arrivalShare: 0.61,
  },
  {
    id: "evening-departure",
    label: "Evening departure bank",
    start: 1080,
    end: 1260,
    demand: 1.18,
    arrivalShare: 0.4,
  },
  {
    id: "late-arrival",
    label: "Late arrivals and cargo",
    start: 1260,
    end: 1440,
    demand: 0.74,
    arrivalShare: 0.57,
  },
];

const INTERNATIONAL_BANKS: DemandBand[] = [
  {
    id: "overnight",
    label: "Overnight international and cargo",
    start: 0,
    end: 300,
    demand: 0.58,
    arrivalShare: 0.54,
  },
  {
    id: "morning-departure",
    label: "Morning departure wave",
    start: 300,
    end: 480,
    demand: 0.94,
    arrivalShare: 0.41,
  },
  {
    id: "morning-balanced",
    label: "Morning balanced flow",
    start: 480,
    end: 720,
    demand: 1.02,
    arrivalShare: 0.5,
  },
  {
    id: "afternoon-arrival",
    label: "Afternoon arrival wave",
    start: 720,
    end: 960,
    demand: 1.12,
    arrivalShare: 0.58,
  },
  {
    id: "evening-connection",
    label: "Evening connection wave",
    start: 960,
    end: 1200,
    demand: 1.22,
    arrivalShare: 0.48,
  },
  {
    id: "late-international",
    label: "Late international wave",
    start: 1200,
    end: 1440,
    demand: 0.9,
    arrivalShare: 0.56,
  },
];

const LOCAL_BANKS: DemandBand[] = [
  {
    id: "overnight",
    label: "Quiet overnight field",
    start: 0,
    end: 360,
    demand: 0.16,
    arrivalShare: 0.5,
  },
  {
    id: "morning",
    label: "Morning commuter and training flow",
    start: 360,
    end: 600,
    demand: 0.84,
    arrivalShare: 0.46,
  },
  {
    id: "daytime",
    label: "Daytime mixed operations",
    start: 600,
    end: 1020,
    demand: 1.1,
    arrivalShare: 0.52,
  },
  {
    id: "evening",
    label: "Evening return flow",
    start: 1020,
    end: 1260,
    demand: 0.72,
    arrivalShare: 0.61,
  },
  {
    id: "night",
    label: "Night local traffic",
    start: 1260,
    end: 1440,
    demand: 0.3,
    arrivalShare: 0.55,
  },
];

export function buildAirportOperationProfile(
  airportCode: string,
  nominalAnnualOperations: number | null,
): AirportOperationProfile {
  const character = AIRPORT_CHARACTERS[airportCode] ?? AIRPORT_CHARACTERS.LOCAL;
  const bands =
    character.archetype === "hub-banked"
      ? HUB_BANKS
      : character.archetype === "international-gateway"
        ? INTERNATIONAL_BANKS
        : LOCAL_BANKS;
  const periods = bands.map((band) => ({
    id: band.id,
    label: band.label,
    startLocalMinute: band.start,
    endLocalMinute: band.end,
    demandMultiplier: band.demand,
    mix: operationMix(character, band),
  }));
  const sources: AirportOperationSource[] = [
    {
      title: "Airport Auto time-of-day traffic shape",
      role: "schematic-design",
    },
  ];
  if (
    airportCode !== "LOCAL" &&
    ["ATL", "ORD", "DFW", "DEN", "LAX", "JFK"].includes(airportCode)
  ) {
    sources.unshift({
      title: "FAA Air Traffic Activity Data System (ATADS)",
      url: "https://www.faa.gov/newsroom/airport-operations-and-ranking-reports-using-air-traffic-activity-data-system-atads",
      published: "monthly activity reference; retrieved 2026-07-24",
      role: "annual-volume-reference",
    });
  }
  if (airportCode === "ORD") {
    sources.unshift({
      title:
        "FAA O’Hare Terminal Area Plan simulation data — operations by quarter hour",
      url: "https://www.faa.gov/sites/faa.gov/files/TAP_Final_EA_Appendix_D_4.pdf",
      published: "2022-11",
      role: "time-of-day-shape",
    });
  }
  return {
    schemaVersion: 1,
    airportCode,
    timezone: character.timezone,
    archetype: character.archetype,
    nominalAnnualOperations,
    nominalDailyOperations:
      nominalAnnualOperations === null
        ? null
        : Math.round(nominalAnnualOperations / 365),
    sessionStartLocalMinute: character.startMinute,
    localMinutesPerSimulationSecond: 1,
    periods,
    sources,
    fidelity: sources.some((source) => source.role !== "schematic-design")
      ? "sourced-volume-schematic-shape"
      : "schematic",
  };
}

export function airportOperationStateAt(
  profile: AirportOperationProfile,
  elapsedSeconds: number,
): AirportOperationState {
  const localMinute = normalizeMinute(
    profile.sessionStartLocalMinute +
      elapsedSeconds * profile.localMinutesPerSimulationSecond,
  );
  const index = Math.max(
    0,
    profile.periods.findIndex(
      (period) =>
        localMinute >= period.startLocalMinute &&
        localMinute < period.endLocalMinute,
    ),
  );
  const current = profile.periods[index];
  const next = profile.periods[(index + 1) % profile.periods.length];
  const duration = Math.max(
    1,
    current.endLocalMinute - current.startLocalMinute,
  );
  const position = (localMinute - current.startLocalMinute) / duration;
  const blend = smoothstep(0.72, 1, position);
  const demandMultiplier = lerp(
    current.demandMultiplier,
    next.demandMultiplier,
    blend,
  );
  const mix = interpolateMix(current.mix, next.mix, blend);
  const minutesUntilNextPeriod =
    current.endLocalMinute >= localMinute
      ? current.endLocalMinute - localMinute
      : 1440 - localMinute + current.endLocalMinute;
  return {
    localMinute: Number(localMinute.toFixed(3)),
    localHour: Number((localMinute / 60).toFixed(3)),
    localTime: formatLocalMinute(localMinute),
    periodId: current.id,
    periodLabel: current.label,
    nextPeriodId: next.id,
    nextPeriodLabel: next.label,
    minutesUntilNextPeriod: Number(minutesUntilNextPeriod.toFixed(2)),
    demandMultiplier: Number(demandMultiplier.toFixed(4)),
    arrivalIntervalMultiplier: Number(
      (1 / Math.max(0.35, (demandMultiplier * mix.arrivalShare) / 0.5)).toFixed(
        4,
      ),
    ),
    departureReadinessMultiplier: Number(
      (
        1 / Math.max(0.35, (demandMultiplier * mix.departureShare) / 0.5)
      ).toFixed(4),
    ),
    mix,
  };
}

export function selectOperationTrafficClass(
  state: Pick<AirportOperationState, "mix">,
  flightId: number,
  airportSeed: number,
): OperationTrafficClass {
  const value = deterministicUnit(flightId, airportSeed);
  const cargoEnd = state.mix.cargoShare;
  const regionalEnd = cargoEnd + state.mix.regionalShare;
  const generalAviationEnd = regionalEnd + state.mix.generalAviationShare;
  if (value < cargoEnd) return "cargo";
  if (value < regionalEnd) return "regional";
  if (value < generalAviationEnd) return "general-aviation";
  return "passenger";
}

function operationMix(
  character: AirportTrafficCharacter,
  band: DemandBand,
): AirportOperationMix {
  const overnight =
    band.id === "overnight" ||
    band.id === "late-arrival" ||
    band.id === "late-international" ||
    band.id === "night";
  const daytime = band.start >= 360 && band.start < 1080;
  const cargo = character.cargo * (overnight ? 1.9 : 0.72);
  const regional =
    character.regional * (band.id.includes("morning") ? 1.18 : 0.92);
  const generalAviation = character.generalAviation * (daytime ? 1.35 : 0.38);
  const totalSpecial = Math.min(0.88, cargo + regional + generalAviation);
  const scale =
    totalSpecial > 0 ? totalSpecial / (cargo + regional + generalAviation) : 0;
  const cargoShare = cargo * scale;
  const regionalShare = regional * scale;
  const generalAviationShare = generalAviation * scale;
  return roundMix({
    arrivalShare: band.arrivalShare,
    departureShare: 1 - band.arrivalShare,
    passengerShare: 1 - cargoShare - regionalShare - generalAviationShare,
    cargoShare,
    regionalShare,
    generalAviationShare,
  });
}

function interpolateMix(
  first: AirportOperationMix,
  second: AirportOperationMix,
  amount: number,
): AirportOperationMix {
  return roundMix({
    arrivalShare: lerp(first.arrivalShare, second.arrivalShare, amount),
    departureShare: lerp(first.departureShare, second.departureShare, amount),
    passengerShare: lerp(first.passengerShare, second.passengerShare, amount),
    cargoShare: lerp(first.cargoShare, second.cargoShare, amount),
    regionalShare: lerp(first.regionalShare, second.regionalShare, amount),
    generalAviationShare: lerp(
      first.generalAviationShare,
      second.generalAviationShare,
      amount,
    ),
  });
}

function roundMix(mix: AirportOperationMix): AirportOperationMix {
  return {
    arrivalShare: Number(mix.arrivalShare.toFixed(4)),
    departureShare: Number(mix.departureShare.toFixed(4)),
    passengerShare: Number(mix.passengerShare.toFixed(4)),
    cargoShare: Number(mix.cargoShare.toFixed(4)),
    regionalShare: Number(mix.regionalShare.toFixed(4)),
    generalAviationShare: Number(mix.generalAviationShare.toFixed(4)),
  };
}

function deterministicUnit(flightId: number, airportSeed: number): number {
  let value = (Math.imul(flightId, 0x9e3779b1) ^ airportSeed) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value = (value ^ (value >>> 15)) >>> 0;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x1_0000_0000;
}

function normalizeMinute(value: number): number {
  return ((value % 1440) + 1440) % 1440;
}

function formatLocalMinute(value: number): string {
  const rounded = Math.floor(normalizeMinute(value));
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = Math.max(
    0,
    Math.min(1, (value - edge0) / Math.max(1e-6, edge1 - edge0)),
  );
  return amount * amount * (3 - 2 * amount);
}

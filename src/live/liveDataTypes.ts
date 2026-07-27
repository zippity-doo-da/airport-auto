import type { WeatherCondition } from "../simulation/types";
import type { TrafficDensity } from "../simulation/trafficDensity";

export const LIVE_DATA_SCHEMA_VERSION = 1 as const;

export type LiveDataKind = "metar" | "notam" | "traffic";

export interface LiveDataProvenance {
  provider: string;
  sourceUrl: string;
  license: string;
  retrievedAt: string;
  notForNavigation: true;
}

export interface LiveMetarReport {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  kind: "metar";
  station: string;
  observedAt: string;
  expiresAt: string;
  provenance: LiveDataProvenance;
  weather: {
    condition: WeatherCondition;
    windDirectionDegrees: number | null;
    windSpeedKts: number;
    gustKts: number | null;
    visibilityMiles: number;
    ceilingFt: number | null;
    temperatureC: number;
    rawText: string;
  };
}

export type LiveSurfaceTargetKind = "runway" | "taxiway";
export type LiveSurfaceStatus = "closed" | "restricted" | "open";

export interface LiveSurfaceStatusItem {
  id: string;
  targetKind: LiveSurfaceTargetKind;
  target: string;
  status: LiveSurfaceStatus;
  startsAt: string;
  endsAt: string | null;
  summary: string;
}

export interface LiveNotamReport {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  kind: "notam";
  station: string;
  effectiveAt: string;
  expiresAt: string;
  provenance: LiveDataProvenance;
  items: LiveSurfaceStatusItem[];
}

export interface LiveTrafficPeriod {
  startsAt: string;
  endsAt: string;
  arrivals: number;
  departures: number;
  passengerShare: number;
  cargoShare: number;
  regionalShare: number;
  generalAviationShare: number;
}

export interface LiveTrafficReport {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  kind: "traffic";
  station: string;
  effectiveAt: string;
  expiresAt: string;
  provenance: LiveDataProvenance;
  privacy: {
    aggregateOnly: true;
    containsFlightIdentifiers: false;
    replayStoresRawFeed: false;
  };
  periods: LiveTrafficPeriod[];
}

export type LiveDataReport =
  LiveMetarReport | LiveNotamReport | LiveTrafficReport;

export interface LiveDataValidation<T extends LiveDataReport = LiveDataReport> {
  accepted: boolean;
  report: T | null;
  issues: string[];
}

export interface LiveDataAge {
  ageMinutes: number;
  label: string;
  stale: boolean;
  expired: boolean;
}

export interface LiveTrafficSeedPlan {
  station: string;
  density: TrafficDensity;
  operationsPerHour: number;
  arrivalShare: number;
  dominantTrafficClass: "passenger" | "cargo" | "regional" | "general-aviation";
  deterministicSeed: number;
  aggregateFingerprint: string;
  sourceProvider: string;
  rawFeedRetained: false;
}

export interface LiveDataFetchResult<
  T extends LiveDataReport = LiveDataReport,
> {
  report: T | null;
  source: "network" | "cache" | "offline";
  reason: string;
  age: LiveDataAge | null;
}

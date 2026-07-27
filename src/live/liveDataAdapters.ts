import {
  LIVE_DATA_SCHEMA_VERSION,
  type LiveDataAge,
  type LiveDataProvenance,
  type LiveDataReport,
  type LiveDataValidation,
  type LiveMetarReport,
  type LiveNotamReport,
  type LiveSurfaceStatusItem,
  type LiveTrafficPeriod,
  type LiveTrafficReport,
  type LiveTrafficSeedPlan,
} from "./liveDataTypes";
import { isWeatherCondition } from "../simulation/weatherOperations";
import type { TrafficDensity } from "../simulation/trafficDensity";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function boundedText(value: unknown, maximum: number): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum
    ? value
    : null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function stationCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9]{2,3}$/.test(normalized) ? normalized : null;
}

function provenance(
  value: unknown,
  issues: string[],
): LiveDataProvenance | null {
  if (!isRecord(value)) {
    issues.push("provenance must be an object");
    return null;
  }
  const provider = boundedText(value.provider, 120);
  const sourceUrl = boundedText(value.sourceUrl, 1_024);
  const license = boundedText(value.license, 240);
  const retrievedAt = isoDate(value.retrievedAt);
  if (!provider) issues.push("provenance.provider is required");
  if (!sourceUrl) issues.push("provenance.sourceUrl is required");
  else {
    try {
      const url = new URL(sourceUrl);
      if (
        url.protocol !== "https:" &&
        url.hostname !== "localhost" &&
        url.hostname !== "127.0.0.1"
      ) {
        issues.push("provenance.sourceUrl must use HTTPS");
      }
    } catch {
      issues.push("provenance.sourceUrl is invalid");
    }
  }
  if (!license) issues.push("provenance.license is required");
  if (!retrievedAt) issues.push("provenance.retrievedAt is invalid");
  if (value.notForNavigation !== true)
    issues.push("live data must be marked notForNavigation");
  return provider &&
    sourceUrl &&
    license &&
    retrievedAt &&
    value.notForNavigation === true
    ? { provider, sourceUrl, license, retrievedAt, notForNavigation: true }
    : null;
}

function common(
  value: unknown,
  kind: LiveDataReport["kind"],
  issues: string[],
): {
  record: JsonRecord;
  station: string;
  expiresAt: string;
  provenance: LiveDataProvenance;
} | null {
  if (!isRecord(value)) {
    issues.push("report must be an object");
    return null;
  }
  if (value.schemaVersion !== LIVE_DATA_SCHEMA_VERSION)
    issues.push("unsupported live-data schemaVersion");
  if (value.kind !== kind) issues.push(`report kind must be ${kind}`);
  const station = stationCode(value.station);
  const expiresAt = isoDate(value.expiresAt);
  const source = provenance(value.provenance, issues);
  if (!station) issues.push("station must be a valid ICAO code");
  if (!expiresAt) issues.push("expiresAt is invalid");
  return value.schemaVersion === LIVE_DATA_SCHEMA_VERSION &&
    value.kind === kind &&
    station &&
    expiresAt &&
    source
    ? { record: value, station, expiresAt, provenance: source }
    : null;
}

export function validateMetarReport(
  value: unknown,
): LiveDataValidation<LiveMetarReport> {
  const issues: string[] = [];
  const base = common(value, "metar", issues);
  if (!base) return { accepted: false, report: null, issues };
  const observedAt = isoDate(base.record.observedAt);
  const weather = base.record.weather;
  if (!observedAt) issues.push("observedAt is invalid");
  if (!isRecord(weather)) issues.push("weather must be an object");
  if (!observedAt || !isRecord(weather))
    return { accepted: false, report: null, issues };

  const condition = isWeatherCondition(weather.condition)
    ? weather.condition
    : null;
  const windDirectionDegrees =
    weather.windDirectionDegrees === null
      ? null
      : finiteNumber(weather.windDirectionDegrees, 0, 360);
  const windSpeedKts = finiteNumber(weather.windSpeedKts, 0, 200);
  const gustKts =
    weather.gustKts === null ? null : finiteNumber(weather.gustKts, 0, 250);
  const visibilityMiles = finiteNumber(weather.visibilityMiles, 0, 100);
  const ceilingFt =
    weather.ceilingFt === null
      ? null
      : finiteNumber(weather.ceilingFt, 0, 60_000);
  const temperatureC = finiteNumber(weather.temperatureC, -100, 70);
  const rawText = boundedText(weather.rawText, 1_024);
  if (!condition) issues.push("weather.condition is invalid");
  if (weather.windDirectionDegrees !== null && windDirectionDegrees === null)
    issues.push("wind direction must be 0–360 degrees or null");
  if (windSpeedKts === null) issues.push("wind speed must be 0–200 kt");
  if (weather.gustKts !== null && gustKts === null)
    issues.push("gust must be 0–250 kt or null");
  if (gustKts !== null && windSpeedKts !== null && gustKts < windSpeedKts)
    issues.push("gust cannot be lower than sustained wind");
  if (visibilityMiles === null)
    issues.push("visibility must be 0–100 statute miles");
  if (weather.ceilingFt !== null && ceilingFt === null)
    issues.push("ceiling must be 0–60,000 ft or null");
  if (temperatureC === null) issues.push("temperature must be -100–70 °C");
  if (!rawText) issues.push("raw METAR text is required");
  if (
    Date.parse(observedAt) >
    Date.parse(base.provenance.retrievedAt) + 10 * 60_000
  )
    issues.push("observation time is implausibly in the future");
  if (
    issues.length ||
    !condition ||
    windSpeedKts === null ||
    visibilityMiles === null ||
    temperatureC === null ||
    !rawText
  ) {
    return { accepted: false, report: null, issues };
  }
  return {
    accepted: true,
    issues: [],
    report: {
      schemaVersion: LIVE_DATA_SCHEMA_VERSION,
      kind: "metar",
      station: base.station,
      observedAt,
      expiresAt: base.expiresAt,
      provenance: base.provenance,
      weather: {
        condition,
        windDirectionDegrees,
        windSpeedKts,
        gustKts,
        visibilityMiles,
        ceilingFt,
        temperatureC,
        rawText,
      },
    },
  };
}

function surfaceStatusItem(
  value: unknown,
  issues: string[],
  index: number,
): LiveSurfaceStatusItem | null {
  if (!isRecord(value)) {
    issues.push(`items[${index}] must be an object`);
    return null;
  }
  const id = boundedText(value.id, 160);
  const targetKind =
    value.targetKind === "runway" || value.targetKind === "taxiway"
      ? value.targetKind
      : null;
  const target = boundedText(value.target, 80);
  const status =
    value.status === "closed" ||
    value.status === "restricted" ||
    value.status === "open"
      ? value.status
      : null;
  const startsAt = isoDate(value.startsAt);
  const endsAt = value.endsAt === null ? null : isoDate(value.endsAt);
  const summary = boundedText(value.summary, 500);
  if (!id) issues.push(`items[${index}].id is required`);
  if (!targetKind) issues.push(`items[${index}].targetKind is invalid`);
  if (!target) issues.push(`items[${index}].target is required`);
  if (!status) issues.push(`items[${index}].status is invalid`);
  if (!startsAt) issues.push(`items[${index}].startsAt is invalid`);
  if (value.endsAt !== null && !endsAt)
    issues.push(`items[${index}].endsAt is invalid`);
  if (!summary) issues.push(`items[${index}].summary is required`);
  return id && targetKind && target && status && startsAt && summary
    ? { id, targetKind, target, status, startsAt, endsAt, summary }
    : null;
}

export function validateNotamReport(
  value: unknown,
): LiveDataValidation<LiveNotamReport> {
  const issues: string[] = [];
  const base = common(value, "notam", issues);
  if (!base) return { accepted: false, report: null, issues };
  const effectiveAt = isoDate(base.record.effectiveAt);
  const values =
    Array.isArray(base.record.items) && base.record.items.length <= 200
      ? base.record.items
      : null;
  if (!effectiveAt) issues.push("effectiveAt is invalid");
  if (!values) issues.push("items must contain at most 200 entries");
  const items =
    values
      ?.map((item, index) => surfaceStatusItem(item, issues, index))
      .filter((item): item is LiveSurfaceStatusItem => item !== null) ?? [];
  if (!effectiveAt || !values || issues.length)
    return { accepted: false, report: null, issues };
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    return {
      accepted: false,
      report: null,
      issues: ["NOTAM item ids must be unique"],
    };
  }
  return {
    accepted: true,
    issues: [],
    report: {
      schemaVersion: LIVE_DATA_SCHEMA_VERSION,
      kind: "notam",
      station: base.station,
      effectiveAt,
      expiresAt: base.expiresAt,
      provenance: base.provenance,
      items,
    },
  };
}

function trafficPeriod(
  value: unknown,
  issues: string[],
  index: number,
): LiveTrafficPeriod | null {
  if (!isRecord(value)) {
    issues.push(`periods[${index}] must be an object`);
    return null;
  }
  const startsAt = isoDate(value.startsAt);
  const endsAt = isoDate(value.endsAt);
  const arrivals = finiteNumber(value.arrivals, 0, 10_000);
  const departures = finiteNumber(value.departures, 0, 10_000);
  const passengerShare = finiteNumber(value.passengerShare, 0, 1);
  const cargoShare = finiteNumber(value.cargoShare, 0, 1);
  const regionalShare = finiteNumber(value.regionalShare, 0, 1);
  const generalAviationShare = finiteNumber(value.generalAviationShare, 0, 1);
  if (
    !startsAt ||
    !endsAt ||
    Date.parse(endsAt ?? "") <= Date.parse(startsAt ?? "")
  )
    issues.push(`periods[${index}] has an invalid time window`);
  if (arrivals === null || departures === null)
    issues.push(`periods[${index}] counts are invalid`);
  const shares = [
    passengerShare,
    cargoShare,
    regionalShare,
    generalAviationShare,
  ];
  if (shares.some((share) => share === null))
    issues.push(`periods[${index}] shares are invalid`);
  const shareTotal = shares.reduce<number>(
    (sum, share) => sum + (share ?? 0),
    0,
  );
  if (Math.abs(shareTotal - 1) > 0.015)
    issues.push(`periods[${index}] shares must total 1`);
  return startsAt &&
    endsAt &&
    arrivals !== null &&
    departures !== null &&
    passengerShare !== null &&
    cargoShare !== null &&
    regionalShare !== null &&
    generalAviationShare !== null
    ? {
        startsAt,
        endsAt,
        arrivals,
        departures,
        passengerShare,
        cargoShare,
        regionalShare,
        generalAviationShare,
      }
    : null;
}

export function validateTrafficReport(
  value: unknown,
): LiveDataValidation<LiveTrafficReport> {
  const issues: string[] = [];
  const base = common(value, "traffic", issues);
  if (!base) return { accepted: false, report: null, issues };
  const effectiveAt = isoDate(base.record.effectiveAt);
  const privacy = base.record.privacy;
  const values =
    Array.isArray(base.record.periods) &&
    base.record.periods.length > 0 &&
    base.record.periods.length <= 96
      ? base.record.periods
      : null;
  if (!effectiveAt) issues.push("effectiveAt is invalid");
  if (
    !isRecord(privacy) ||
    privacy.aggregateOnly !== true ||
    privacy.containsFlightIdentifiers !== false ||
    privacy.replayStoresRawFeed !== false
  ) {
    issues.push(
      "traffic privacy contract must be aggregate-only and replay-safe",
    );
  }
  if (!values) issues.push("periods must contain 1–96 aggregate windows");
  const periods =
    values
      ?.map((period, index) => trafficPeriod(period, issues, index))
      .filter((period): period is LiveTrafficPeriod => period !== null) ?? [];
  if (!effectiveAt || !values || issues.length)
    return { accepted: false, report: null, issues };
  return {
    accepted: true,
    issues: [],
    report: {
      schemaVersion: LIVE_DATA_SCHEMA_VERSION,
      kind: "traffic",
      station: base.station,
      effectiveAt,
      expiresAt: base.expiresAt,
      provenance: base.provenance,
      privacy: {
        aggregateOnly: true,
        containsFlightIdentifiers: false,
        replayStoresRawFeed: false,
      },
      periods,
    },
  };
}

export function validateLiveDataReport(value: unknown): LiveDataValidation {
  if (!isRecord(value))
    return {
      accepted: false,
      report: null,
      issues: ["report must be an object"],
    };
  if (value.kind === "metar") return validateMetarReport(value);
  if (value.kind === "notam") return validateNotamReport(value);
  if (value.kind === "traffic") return validateTrafficReport(value);
  return {
    accepted: false,
    report: null,
    issues: ["unknown live-data report kind"],
  };
}

export function liveDataAge(
  report: LiveDataReport,
  nowMs = Date.now(),
): LiveDataAge {
  const reference =
    report.kind === "metar" ? report.observedAt : report.effectiveAt;
  const ageMinutes = Math.max(0, (nowMs - Date.parse(reference)) / 60_000);
  const expired = nowMs > Date.parse(report.expiresAt);
  const stale =
    expired ||
    (report.kind === "metar" ? ageMinutes > 90 : ageMinutes > 24 * 60);
  const rounded = Math.round(ageMinutes);
  const label =
    ageMinutes < 1
      ? "just now"
      : ageMinutes < 60
        ? `${rounded} min old`
        : `${(ageMinutes / 60).toFixed(1)} hr old`;
  return { ageMinutes, label, stale, expired };
}

function fnv1a(text: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function trafficSeedPlan(
  report: LiveTrafficReport,
): LiveTrafficSeedPlan {
  const durationHours = report.periods.reduce(
    (sum, period) =>
      sum +
      (Date.parse(period.endsAt) - Date.parse(period.startsAt)) / 3_600_000,
    0,
  );
  const arrivals = report.periods.reduce(
    (sum, period) => sum + period.arrivals,
    0,
  );
  const departures = report.periods.reduce(
    (sum, period) => sum + period.departures,
    0,
  );
  const operations = arrivals + departures;
  const operationsPerHour = operations / Math.max(0.25, durationHours);
  const density: TrafficDensity =
    operationsPerHour < 18
      ? "quiet"
      : operationsPerHour < 38
        ? "realistic"
        : operationsPerHour < 58
          ? "busy"
          : operationsPerHour < 86
            ? "rush"
            : "extreme";
  const weightedShares = {
    passenger: report.periods.reduce(
      (sum, period) =>
        sum + period.passengerShare * (period.arrivals + period.departures),
      0,
    ),
    cargo: report.periods.reduce(
      (sum, period) =>
        sum + period.cargoShare * (period.arrivals + period.departures),
      0,
    ),
    regional: report.periods.reduce(
      (sum, period) =>
        sum + period.regionalShare * (period.arrivals + period.departures),
      0,
    ),
    "general-aviation": report.periods.reduce(
      (sum, period) =>
        sum +
        period.generalAviationShare * (period.arrivals + period.departures),
      0,
    ),
  };
  const dominantTrafficClass = (
    Object.entries(weightedShares) as Array<
      [LiveTrafficSeedPlan["dominantTrafficClass"], number]
    >
  ).sort(
    (first, second) =>
      second[1] - first[1] || first[0].localeCompare(second[0]),
  )[0][0];
  const aggregate = JSON.stringify({
    station: report.station,
    periods: report.periods,
  });
  const deterministicSeed = fnv1a(aggregate);
  return {
    station: report.station,
    density,
    operationsPerHour: Number(operationsPerHour.toFixed(1)),
    arrivalShare: Number((arrivals / Math.max(1, operations)).toFixed(3)),
    dominantTrafficClass,
    deterministicSeed,
    aggregateFingerprint: `fnv1a-${deterministicSeed.toString(16).padStart(8, "0")}`,
    sourceProvider: report.provenance.provider,
    rawFeedRetained: false,
  };
}

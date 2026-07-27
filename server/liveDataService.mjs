const STATION_PATTERN = /^[A-Z][A-Z0-9]{2,3}$/;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

function boundedText(value, maximum = 256) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function finiteNumber(value, fallback = null) {
  const candidate =
    typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : fallback;
}

function isoDate(value, fallback = null) {
  const candidate =
    typeof value === "number"
      ? new Date(value < 10_000_000_000 ? value * 1_000 : value)
      : new Date(value);
  return Number.isFinite(candidate.valueOf())
    ? candidate.toISOString()
    : fallback;
}

function normalizeStation(value) {
  const station = boundedText(value, 4).toUpperCase();
  if (!STATION_PATTERN.test(station))
    throw new Error("station must be a valid ICAO code");
  return station;
}

function weatherCondition(rawText, weatherText) {
  const tokens = `${weatherText ?? ""} ${rawText ?? ""}`.toUpperCase();
  if (/\bTS|\bVCTS/.test(tokens)) return "thunderstorm";
  if (/\bSN|\bSG|\bPL/.test(tokens)) return "snow";
  if (/\bRA|\bDZ/.test(tokens)) return "rain";
  if (/\bFG/.test(tokens)) return "fog";
  if (/\bHZ|\bBR|\bFU/.test(tokens)) return "haze";
  return "clear";
}

function cloudCeiling(clouds) {
  if (!Array.isArray(clouds)) return null;
  const bases = clouds
    .filter((cloud) => cloud && ["BKN", "OVC", "VV"].includes(cloud.cover))
    .map((cloud) => finiteNumber(cloud.base))
    .filter((base) => base !== null && base >= 0 && base <= 60_000);
  return bases.length ? Math.min(...bases) : null;
}

export function normalizeAviationWeatherMetar(payload, station, options = {}) {
  const stationCode = normalizeStation(station);
  const observation = Array.isArray(payload) ? payload[0] : payload;
  if (!observation || typeof observation !== "object")
    throw new Error("AviationWeather returned no METAR observation");
  const returnedStation = normalizeStation(
    observation.icaoId ?? observation.stationId ?? stationCode,
  );
  if (returnedStation !== stationCode)
    throw new Error("METAR station did not match the request");
  const retrievedAt = isoDate(options.retrievedAt ?? Date.now());
  const observedAt = isoDate(
    observation.obsTime ?? observation.reportTime ?? observation.receiptTime,
  );
  const rawText = boundedText(observation.rawOb ?? observation.raw_text, 1_024);
  const windSpeedKts = finiteNumber(
    observation.wspd ?? observation.wind_speed_kt,
  );
  const windDirectionValue = observation.wdir ?? observation.wind_dir_degrees;
  const windDirectionDegrees =
    String(windDirectionValue).toUpperCase() === "VRB"
      ? null
      : finiteNumber(windDirectionValue);
  const gustKts =
    observation.wgst === undefined && observation.wind_gust_kt === undefined
      ? null
      : finiteNumber(observation.wgst ?? observation.wind_gust_kt);
  const visibilityMiles = finiteNumber(
    observation.visib ?? observation.visibility_statute_mi,
  );
  const temperatureC = finiteNumber(observation.temp ?? observation.temp_c);
  if (!retrievedAt || !observedAt || !rawText)
    throw new Error("METAR is missing its time or raw observation");
  if (windSpeedKts === null || windSpeedKts < 0 || windSpeedKts > 200)
    throw new Error("METAR wind speed is outside 0–200 kt");
  if (
    windDirectionDegrees !== null &&
    (windDirectionDegrees < 0 || windDirectionDegrees > 360)
  )
    throw new Error("METAR wind direction is outside 0–360 degrees");
  if (gustKts !== null && (gustKts < windSpeedKts || gustKts > 250))
    throw new Error("METAR gust is invalid");
  if (visibilityMiles === null || visibilityMiles < 0 || visibilityMiles > 100)
    throw new Error("METAR visibility is outside 0–100 statute miles");
  if (temperatureC === null || temperatureC < -100 || temperatureC > 70)
    throw new Error("METAR temperature is outside -100–70 C");
  const sourceUrl =
    boundedText(options.sourceUrl, 1_024) ||
    `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(stationCode)}&format=json`;
  return {
    schemaVersion: 1,
    kind: "metar",
    station: stationCode,
    observedAt,
    expiresAt: new Date(Date.parse(observedAt) + 90 * 60_000).toISOString(),
    provenance: {
      provider: "NOAA/NWS Aviation Weather Center",
      sourceUrl,
      license:
        "United States government aviation weather data; provider terms apply",
      retrievedAt,
      notForNavigation: true,
    },
    weather: {
      condition: weatherCondition(
        rawText,
        observation.wxString ?? observation.flight_category,
      ),
      windDirectionDegrees,
      windSpeedKts,
      gustKts,
      visibilityMiles,
      ceilingFt: cloudCeiling(observation.clouds),
      temperatureC,
      rawText,
    },
  };
}

function providerProvenance(provider, retrievedAt) {
  return {
    provider:
      boundedText(provider.providerName, 120) ||
      "Configured live-data provider",
    sourceUrl: boundedText(provider.sourceUrl, 1_024),
    license:
      boundedText(provider.license, 240) ||
      "Operator-configured provider terms apply",
    retrievedAt,
    notForNavigation: true,
  };
}

export function normalizeNotamProviderPayload(payload, station, provider = {}) {
  const stationCode = normalizeStation(station);
  const retrievedAt = isoDate(provider.retrievedAt ?? Date.now());
  const items = Array.isArray(payload?.items)
    ? payload.items.slice(0, 200)
    : null;
  if (!retrievedAt || !items)
    throw new Error("NOTAM provider must return an items array");
  return {
    schemaVersion: 1,
    kind: "notam",
    station: stationCode,
    effectiveAt: isoDate(payload.effectiveAt, retrievedAt),
    expiresAt: isoDate(
      payload.expiresAt,
      new Date(Date.parse(retrievedAt) + 15 * 60_000).toISOString(),
    ),
    provenance: providerProvenance(provider, retrievedAt),
    items: items.map((item, index) => ({
      id: boundedText(item?.id, 160) || `${stationCode}-status-${index + 1}`,
      targetKind: item?.targetKind,
      target: boundedText(item?.target, 80),
      status: item?.status,
      startsAt: isoDate(item?.startsAt, retrievedAt),
      endsAt:
        item?.endsAt === null || item?.endsAt === undefined
          ? null
          : isoDate(item.endsAt),
      summary: boundedText(item?.summary, 500),
    })),
  };
}

export function normalizeTrafficProviderPayload(
  payload,
  station,
  provider = {},
) {
  const stationCode = normalizeStation(station);
  const retrievedAt = isoDate(provider.retrievedAt ?? Date.now());
  const periods = Array.isArray(payload?.periods)
    ? payload.periods.slice(0, 96)
    : null;
  if (!retrievedAt || !periods?.length)
    throw new Error("traffic provider must return aggregate periods");
  return {
    schemaVersion: 1,
    kind: "traffic",
    station: stationCode,
    effectiveAt: isoDate(payload.effectiveAt, retrievedAt),
    expiresAt: isoDate(
      payload.expiresAt,
      new Date(Date.parse(retrievedAt) + 30 * 60_000).toISOString(),
    ),
    provenance: providerProvenance(provider, retrievedAt),
    privacy: {
      aggregateOnly: true,
      containsFlightIdentifiers: false,
      replayStoresRawFeed: false,
    },
    periods: periods.map((period) => ({
      startsAt: isoDate(period?.startsAt),
      endsAt: isoDate(period?.endsAt),
      arrivals: finiteNumber(period?.arrivals),
      departures: finiteNumber(period?.departures),
      passengerShare: finiteNumber(period?.passengerShare),
      cargoShare: finiteNumber(period?.cargoShare),
      regionalShare: finiteNumber(period?.regionalShare),
      generalAviationShare: finiteNumber(period?.generalAviationShare),
    })),
  };
}

export function createConfiguredJsonProvider(options = {}) {
  const endpointTemplate = boundedText(options.endpointTemplate, 2_048);
  if (!endpointTemplate.includes("{station}"))
    throw new Error("provider endpoint template must contain {station}");
  const testUrl = new URL(endpointTemplate.replace("{station}", "KORD"));
  if (
    testUrl.protocol !== "https:" &&
    !(
      testUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(testUrl.hostname)
    )
  ) {
    throw new Error("provider endpoint must use HTTPS or loopback HTTP");
  }
  if (testUrl.username || testUrl.password)
    throw new Error("provider credentials must not be embedded in its URL");
  const fetcher = options.fetcher ?? fetch;
  const token = boundedText(options.token, 4_096);
  const maximumBytes = Number.isInteger(options.maximumBytes)
    ? options.maximumBytes
    : DEFAULT_MAX_RESPONSE_BYTES;
  return async (station) => {
    const stationCode = normalizeStation(station);
    const url = new URL(
      endpointTemplate.replace("{station}", encodeURIComponent(stationCode)),
    );
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
    });
    if (!response.ok)
      throw new Error(`configured provider returned HTTP ${response.status}`);
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > maximumBytes)
      throw new Error("configured provider response exceeded its byte limit");
    const text = await response.text();
    if (Buffer.byteLength(text) > maximumBytes)
      throw new Error("configured provider response exceeded its byte limit");
    return {
      payload: JSON.parse(text),
      sourceUrl: url.toString(),
      providerName: boundedText(options.providerName, 120),
      license: boundedText(options.license, 240),
    };
  };
}

export function createLiveDataService(options = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map();
  const pending = new Map();
  const maximumEntries = Number.isInteger(options.maximumEntries)
    ? options.maximumEntries
    : 96;
  const ttl = {
    metar: Math.max(60_000, options.metarTtlMs ?? 60_000),
    notam: Math.max(60_000, options.notamTtlMs ?? 5 * 60_000),
    traffic: Math.max(60_000, options.trafficTtlMs ?? 15 * 60_000),
  };

  const request = async (kind, station) => {
    const stationCode = normalizeStation(station);
    const key = `${kind}:${stationCode}`;
    const retained = cache.get(key);
    if (retained && now() - retained.cachedAt < ttl[kind])
      return retained.report;
    if (pending.has(key)) return pending.get(key);
    const operation = (async () => {
      const retrievedAt = new Date(now()).toISOString();
      let report;
      if (kind === "metar") {
        if (options.metarEnabled === false)
          throw new Error("METAR provider is disabled by the gateway operator");
        const sourceUrl = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(stationCode)}&format=json`;
        const response = await fetcher(sourceUrl, {
          headers: {
            Accept: "application/json",
            "User-Agent":
              options.userAgent ?? "Airport-Auto/2.40 live-data gateway",
          },
          redirect: "error",
          signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
        });
        if (!response.ok)
          throw new Error(`AviationWeather returned HTTP ${response.status}`);
        report = normalizeAviationWeatherMetar(
          await response.json(),
          stationCode,
          { retrievedAt, sourceUrl },
        );
      } else if (kind === "notam") {
        if (typeof options.notamProvider !== "function")
          throw new Error(
            "NOTAM provider is not configured; FAA access and operator review are required",
          );
        const result = await options.notamProvider(stationCode);
        report = normalizeNotamProviderPayload(result.payload, stationCode, {
          ...result,
          retrievedAt,
        });
      } else if (kind === "traffic") {
        if (typeof options.trafficProvider !== "function")
          throw new Error(
            "licensed aggregate traffic provider is not configured",
          );
        const result = await options.trafficProvider(stationCode);
        report = normalizeTrafficProviderPayload(result.payload, stationCode, {
          ...result,
          retrievedAt,
        });
      } else {
        throw new Error("unknown live-data kind");
      }
      cache.set(key, { report, cachedAt: now() });
      while (cache.size > maximumEntries)
        cache.delete(cache.keys().next().value);
      return report;
    })();
    pending.set(key, operation);
    try {
      return await operation;
    } finally {
      pending.delete(key);
    }
  };

  return {
    report: request,
    diagnostics() {
      return {
        providers: {
          metar: options.metarEnabled === false ? "disabled" : "available",
          notam:
            typeof options.notamProvider === "function"
              ? "available"
              : "unconfigured",
          traffic:
            typeof options.trafficProvider === "function"
              ? "available"
              : "unconfigured",
        },
        cacheEntries: cache.size,
        pendingRequests: pending.size,
        minimumTtlMs: { ...ttl },
      };
    },
  };
}

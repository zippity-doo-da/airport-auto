import { liveDataAge, validateLiveDataReport } from "./liveDataAdapters";
import { BoundedLiveDataCache, type LiveDataStorage } from "./liveDataCache";
import type { LiveDataFetchResult, LiveDataKind } from "./liveDataTypes";

export interface LiveDataConfiguration {
  enabled: boolean;
  endpoint: string;
  token: string;
}

export interface LiveDataCoordinatorOptions {
  storage?: LiveDataStorage | null;
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

function httpEndpoint(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol === "wss:") url.protocol = "https:";
    if (url.protocol === "ws:") url.protocol = "http:";
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      )
    )
      return null;
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/v1\/ws\/?$/, "").replace(/\/$/, "");
    return url;
  } catch {
    return null;
  }
}

export class LiveDataCoordinator {
  private readonly cache: BoundedLiveDataCache;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private configuration: LiveDataConfiguration = {
    enabled: false,
    endpoint: "",
    token: "",
  };

  constructor(options: LiveDataCoordinatorOptions = {}) {
    this.now = options.now ?? Date.now;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.cache = new BoundedLiveDataCache(
      options.storage ?? null,
      18,
      256 * 1_024,
      this.now,
    );
  }

  configure(configuration: LiveDataConfiguration): void {
    this.configuration = {
      enabled: configuration.enabled,
      endpoint: configuration.endpoint.trim(),
      token: configuration.token,
    };
  }

  state(): Omit<LiveDataConfiguration, "token"> & {
    configured: boolean;
    cache: ReturnType<BoundedLiveDataCache["diagnostics"]>;
  } {
    return {
      enabled: this.configuration.enabled,
      endpoint: this.configuration.endpoint,
      configured: Boolean(
        httpEndpoint(this.configuration.endpoint) &&
        this.configuration.token.length >= 24,
      ),
      cache: this.cache.diagnostics(),
    };
  }

  cached(kind: LiveDataKind, station: string): LiveDataFetchResult {
    const validation = validateLiveDataReport(this.cache.get(kind, station));
    if (
      !validation.accepted ||
      !validation.report ||
      validation.report.kind !== kind ||
      validation.report.station !== station.toUpperCase()
    ) {
      return {
        report: null,
        source: "offline",
        reason:
          "No valid cached report; deterministic modeled data remains active.",
        age: null,
      };
    }
    const age = liveDataAge(validation.report, this.now());
    return {
      report: validation.report,
      source: "cache",
      reason: `${age.expired ? "Expired" : age.stale ? "Stale" : "Cached"} ${kind.toUpperCase()} · ${age.label}`,
      age,
    };
  }

  async refresh(
    kind: LiveDataKind,
    station: string,
  ): Promise<LiveDataFetchResult> {
    const cached = this.cached(kind, station);
    if (!this.configuration.enabled) {
      return cached.report
        ? { ...cached, reason: `Live data is off. ${cached.reason}` }
        : {
            report: null,
            source: "offline",
            reason:
              "Live data is off; deterministic modeled data remains active.",
            age: null,
          };
    }
    const endpoint = httpEndpoint(this.configuration.endpoint);
    if (!endpoint || this.configuration.token.length < 24) {
      return cached.report
        ? { ...cached, reason: `Gateway is not configured. ${cached.reason}` }
        : {
            report: null,
            source: "offline",
            reason:
              "Enter an HTTPS gateway and a host token; no provider request was made.",
            age: null,
          };
    }
    const stationCode = station.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{2,3}$/.test(stationCode)) {
      return {
        report: null,
        source: "offline",
        reason: "Airport has no valid ICAO station code.",
        age: null,
      };
    }
    const pathKind = kind === "notam" ? "notams" : kind;
    const basePath =
      endpoint.pathname === "/" ? "" : endpoint.pathname.replace(/\/$/, "");
    const url = new URL(
      `${basePath}/v1/live/${pathKind}/${encodeURIComponent(stationCode)}`,
      endpoint.origin,
    );
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );
    try {
      const response = await this.fetcher(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.configuration.token}`,
          Accept: "application/json",
        },
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        const detail =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : `gateway returned HTTP ${response.status}`;
        throw new Error(detail);
      }
      const candidate =
        typeof payload === "object" && payload !== null && "report" in payload
          ? payload.report
          : payload;
      const validation = validateLiveDataReport(candidate);
      if (
        !validation.accepted ||
        !validation.report ||
        validation.report.kind !== kind ||
        validation.report.station !== stationCode
      ) {
        throw new Error(
          validation.issues.join("; ") ||
            "gateway report does not match the requested airport",
        );
      }
      this.cache.put(validation.report);
      const age = liveDataAge(validation.report, this.now());
      return {
        report: validation.report,
        source: "network",
        reason: `${validation.report.provenance.provider} · ${age.label}${age.stale ? " · stale" : ""}`,
        age,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "live-data request failed";
      return cached.report
        ? {
            ...cached,
            reason: `${message}; using ${cached.reason.toLowerCase()}`,
          }
        : {
            report: null,
            source: "offline",
            reason: `${message}; deterministic modeled data remains active.`,
            age: null,
          };
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}

import { trafficSeedPlan } from "../live/liveDataAdapters";
import { liveDataStationForAirport } from "../live/airportStations";
import { LiveDataCoordinator } from "../live/liveDataCoordinator";
import type {
  LiveDataFetchResult,
  LiveDataKind,
  LiveMetarReport,
  LiveNotamReport,
  LiveSurfaceStatusItem,
  LiveTrafficReport,
  LiveTrafficSeedPlan,
} from "../live/liveDataTypes";

interface CommandResult {
  accepted: boolean;
  reason: string;
}

export interface LiveDataPanelOptions {
  coordinator: LiveDataCoordinator;
  airportCode: () => string;
  applyMetar: (report: LiveMetarReport) => CommandResult;
  applySurfaceStatus: (
    item: LiveSurfaceStatusItem,
    report: LiveNotamReport,
  ) => CommandResult;
  applyTraffic: (
    plan: LiveTrafficSeedPlan,
    report: LiveTrafficReport,
  ) => CommandResult;
  announce: (label: string, detail: string, critical?: boolean) => void;
}

export interface LiveDataPanel {
  setAirport(code: string): void;
  snapshot(): {
    enabled: boolean;
    station: string | null;
    reports: Record<LiveDataKind, "none" | "fresh" | "stale" | "expired">;
    reviewedNotamIds: string[];
    ignoredNotamIds: string[];
  };
  dispose(): void;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing live-data panel element ${selector}`);
  return element;
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function reportState(
  result: LiveDataFetchResult | null,
): "none" | "fresh" | "stale" | "expired" {
  if (!result?.report || !result.age) return "none";
  if (result.age.expired) return "expired";
  if (result.age.stale) return "stale";
  return "fresh";
}

function copyBlock(
  title: string,
  detail: string,
  note: string,
): HTMLDivElement {
  const block = document.createElement("div");
  const heading = document.createElement("b");
  const body = document.createElement("span");
  const small = document.createElement("small");
  heading.textContent = title;
  body.textContent = detail;
  small.textContent = note;
  block.append(heading, body, small);
  return block;
}

export function createLiveDataPanel(
  root: HTMLElement,
  options: LiveDataPanelOptions,
): LiveDataPanel {
  const enabled = required<HTMLInputElement>(root, "[data-live-enabled]");
  const endpoint = required<HTMLInputElement>(root, "[data-live-endpoint]");
  const token = required<HTMLInputElement>(root, "[data-live-token]");
  const refresh = required<HTMLButtonElement>(root, "[data-live-refresh]");
  const clear = required<HTMLButtonElement>(root, "[data-live-clear]");
  const status = required<HTMLElement>(root, "[data-live-status]");
  const station = required<HTMLElement>(root, "[data-live-station]");
  const metar = required<HTMLElement>(root, "[data-live-metar]");
  const notams = required<HTMLElement>(root, "[data-live-notams]");
  const traffic = required<HTMLElement>(root, "[data-live-traffic]");
  const reviewed = new Set<string>();
  const ignored = new Set<string>();
  const results: Partial<Record<LiveDataKind, LiveDataFetchResult>> = {};
  let airportCode = options.airportCode();
  let disposed = false;

  const configure = (): void =>
    options.coordinator.configure({
      enabled: enabled.checked,
      endpoint: endpoint.value,
      token: token.value,
    });

  const renderMetar = (): void => {
    const result = results.metar;
    if (!result?.report || result.report.kind !== "metar") {
      metar.replaceChildren(
        document.createTextNode(result?.reason ?? "No cached weather report."),
      );
      return;
    }
    const report = result.report;
    const heading =
      report.weather.windDirectionDegrees === null
        ? "VRB"
        : `${Math.round(report.weather.windDirectionDegrees).toString().padStart(3, "0")}°`;
    const gust =
      report.weather.gustKts === null
        ? ""
        : `G${Math.round(report.weather.gustKts)}`;
    const summary = copyBlock(
      `${report.weather.condition.toUpperCase()} · ${heading} ${Math.round(report.weather.windSpeedKts)}${gust} kt`,
      `${report.weather.visibilityMiles.toFixed(1)} mi · ${report.weather.ceilingFt === null ? "ceiling unreported" : `${Math.round(report.weather.ceilingFt).toLocaleString()} ft ceiling`}`,
      `${result.reason} · observed ${timeLabel(report.observedAt)}`,
    );
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = result.age?.stale
      ? "Stale · preview only"
      : "Apply modeled weather";
    apply.disabled = Boolean(result.age?.stale);
    apply.addEventListener("click", () => {
      const outcome = options.applyMetar(report);
      options.announce(
        outcome.accepted ? "Live weather applied" : "Weather unchanged",
        outcome.reason,
        !outcome.accepted,
      );
    });
    const source = document.createElement("a");
    source.href = report.provenance.sourceUrl;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = `${report.provenance.provider} ↗`;
    metar.replaceChildren(summary, apply, source);
  };

  const renderNotams = (): void => {
    const result = results.notam;
    if (!result?.report || result.report.kind !== "notam") {
      notams.replaceChildren(
        document.createTextNode(
          result?.reason ?? "No cached surface-status report.",
        ),
      );
      return;
    }
    const report = result.report;
    const header = document.createElement("header");
    const headerTitle = document.createElement("b");
    const headerDetail = document.createElement("small");
    headerTitle.textContent = `${report.items.length} review item${report.items.length === 1 ? "" : "s"}`;
    headerDetail.textContent = `${result.reason} · nothing applies automatically`;
    header.append(headerTitle, headerDetail);
    const list = document.createElement("div");
    list.className = "live-data-panel__review-list";
    if (!report.items.length)
      list.textContent =
        "Provider reports no supported runway or taxiway status items.";
    for (const item of report.items) {
      const row = document.createElement("article");
      row.dataset.reviewState = reviewed.has(item.id)
        ? "approved"
        : ignored.has(item.id)
          ? "ignored"
          : "pending";
      const copy = copyBlock(
        `${item.targetKind === "runway" ? "Runway" : "Taxiway"} ${item.target} · ${item.status}`,
        item.summary,
        `${timeLabel(item.startsAt)}${item.endsAt ? `–${timeLabel(item.endsAt)}` : " onward"} · ${item.id}`,
      );
      const actions = document.createElement("div");
      const approve = document.createElement("button");
      approve.type = "button";
      approve.textContent = reviewed.has(item.id)
        ? "Applied"
        : "Review & apply";
      approve.disabled =
        reviewed.has(item.id) ||
        ignored.has(item.id) ||
        Boolean(result.age?.expired);
      approve.addEventListener("click", () => {
        const outcome = options.applySurfaceStatus(item, report);
        if (outcome.accepted) reviewed.add(item.id);
        options.announce(
          outcome.accepted ? "Reviewed status applied" : "Status not applied",
          outcome.reason,
          !outcome.accepted,
        );
        renderNotams();
      });
      const ignore = document.createElement("button");
      ignore.type = "button";
      ignore.textContent = ignored.has(item.id) ? "Ignored" : "Ignore";
      ignore.disabled = reviewed.has(item.id) || ignored.has(item.id);
      ignore.addEventListener("click", () => {
        ignored.add(item.id);
        options.announce(
          "Status item ignored",
          `${item.id} made no simulation change.`,
        );
        renderNotams();
      });
      actions.append(approve, ignore);
      row.append(copy, actions);
      list.append(row);
    }
    const source = document.createElement("a");
    source.href = report.provenance.sourceUrl;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = `${report.provenance.provider} · ${report.provenance.license} ↗`;
    notams.replaceChildren(header, list, source);
  };

  const renderTraffic = (): void => {
    const result = results.traffic;
    if (!result?.report || result.report.kind !== "traffic") {
      traffic.replaceChildren(
        document.createTextNode(
          result?.reason ?? "No cached aggregate traffic report.",
        ),
      );
      return;
    }
    const report = result.report;
    const plan = trafficSeedPlan(report);
    const copy = copyBlock(
      `${plan.operationsPerHour} aggregate ops/hr · ${plan.density}`,
      `${Math.round(plan.arrivalShare * 100)}% arrivals · ${plan.dominantTrafficClass} dominant`,
      `${result.reason} · ${plan.aggregateFingerprint} · raw feed excluded from replay`,
    );
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = result.age?.stale
      ? "Stale · preview only"
      : "Apply demand profile";
    apply.disabled = Boolean(result.age?.stale);
    apply.addEventListener("click", () => {
      const outcome = options.applyTraffic(plan, report);
      options.announce(
        outcome.accepted ? "Traffic profile applied" : "Traffic unchanged",
        outcome.reason,
        !outcome.accepted,
      );
    });
    const source = document.createElement("a");
    source.href = report.provenance.sourceUrl;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = `${report.provenance.provider} · ${report.provenance.license} ↗`;
    traffic.replaceChildren(copy, apply, source);
  };

  const render = (): void => {
    const stationCode = liveDataStationForAirport(airportCode);
    station.textContent = stationCode ?? "No station";
    refresh.disabled = !stationCode || !enabled.checked;
    endpoint.disabled = !enabled.checked;
    token.disabled = !enabled.checked;
    root.dataset.enabled = String(enabled.checked);
    status.textContent = !stationCode
      ? "Generated local fields use deterministic modeled data only."
      : enabled.checked
        ? "Opted in · refresh is manual; no background polling."
        : "Off · no network requests; cached previews remain local.";
    renderMetar();
    renderNotams();
    renderTraffic();
  };

  const loadCached = (): void => {
    const stationCode = liveDataStationForAirport(airportCode);
    for (const kind of ["metar", "notam", "traffic"] as const) {
      results[kind] = stationCode
        ? options.coordinator.cached(kind, stationCode)
        : {
            report: null,
            source: "offline",
            reason: "Generated local fields have no live-data station.",
            age: null,
          };
    }
  };

  const onEnabled = (): void => {
    configure();
    render();
  };
  const onRefresh = async (): Promise<void> => {
    const stationCode = liveDataStationForAirport(airportCode);
    if (!stationCode || disposed) return;
    configure();
    refresh.disabled = true;
    refresh.textContent = "Refreshing…";
    status.textContent = `Requesting normalized ${stationCode} reports through your gateway…`;
    const refreshed = await Promise.all(
      (["metar", "notam", "traffic"] as const).map(async (kind) => {
        const result = await options.coordinator.refresh(kind, stationCode);
        return [kind, result] as const;
      }),
    );
    if (disposed) return;
    for (const [kind, result] of refreshed) results[kind] = result;
    token.value = "";
    configure();
    refresh.textContent = "Refresh reports";
    status.textContent = "Refresh complete · credential cleared from the page.";
    render();
  };
  const onClear = (): void => {
    options.coordinator.clearCache();
    reviewed.clear();
    ignored.clear();
    loadCached();
    render();
    options.announce(
      "Live-data cache cleared",
      "Normalized local reports were removed; no simulation state changed.",
    );
  };

  enabled.addEventListener("change", onEnabled);
  endpoint.addEventListener("change", configure);
  token.addEventListener("change", configure);
  refresh.addEventListener("click", onRefresh);
  clear.addEventListener("click", onClear);
  loadCached();
  render();

  return {
    setAirport(code) {
      airportCode = code;
      reviewed.clear();
      ignored.clear();
      loadCached();
      render();
    },
    snapshot() {
      return {
        enabled: enabled.checked,
        station: liveDataStationForAirport(airportCode),
        reports: {
          metar: reportState(results.metar ?? null),
          notam: reportState(results.notam ?? null),
          traffic: reportState(results.traffic ?? null),
        },
        reviewedNotamIds: [...reviewed].sort(),
        ignoredNotamIds: [...ignored].sort(),
      };
    },
    dispose() {
      disposed = true;
      enabled.removeEventListener("change", onEnabled);
      endpoint.removeEventListener("change", configure);
      token.removeEventListener("change", configure);
      refresh.removeEventListener("click", onRefresh);
      clear.removeEventListener("click", onClear);
    },
  };
}

import type {
  AirportConfig,
  RunwayOperationalRole,
} from "../simulation/airportConfig";
import { activeRunwayDesignation } from "../simulation/runwayGeometry";
import type { AirportState } from "../simulation/types";

export interface AtisBriefing {
  id: string;
  station: string;
  headline: string;
  copy: string;
  summary: string;
  notices: string[];
}

/**
 * Produces a fictional, in-game ATIS-style briefing from authoritative state.
 * It is intentionally not aviation information and never reads live airport
 * data or reproduces a real-world broadcast.
 */
export function createAtisBriefing(
  state: AirportState,
  config: Pick<AirportConfig, "code" | "name" | "runways">,
): AtisBriefing {
  const information = informationLetter(state.elapsed);
  const weather = state.weather;
  const arrivalRunways = activeRunways(state, config, "arrival");
  const departureRunways = activeRunways(state, config, "departure");
  const surface = surfaceSummary(state);
  const notices = activeNotices(state, config);
  const wind = weather.windEnabled
    ? `Wind ${aviationDegrees(weather.windDirection)} at ${Math.round(weather.windSpeed)} knots${weather.gustSpeed > weather.windSpeed + 2 ? `, gust ${Math.round(weather.gustSpeed)}` : ""}`
    : "Wind not in use";
  const visibility = weather.weatherEnabled
    ? `visibility ${weather.visibility.toFixed(weather.visibility < 2 ? 1 : 0)} miles`
    : "weather presentation off";
  const runwayFlow = [
    arrivalRunways.length ? `landing ${arrivalRunways.join(" and ")}` : null,
    departureRunways.length
      ? `departing ${departureRunways.join(" and ")}`
      : null,
  ]
    .filter(Boolean)
    .join("; ");
  const noticeCopy = notices.length ? ` Notices: ${notices.join(". ")}.` : "";
  const copy = `${config.code} information ${information}. ${wind}. ${visibility}. ${surface}. ${runwayFlow || "Runway flow being coordinated"}.${noticeCopy} Modeled field information only; not for navigation.`;

  return {
    id: `atis-${config.code}-${information}-${Math.floor(state.elapsed / 300)}`,
    station: `${config.code} ATIS · fictional modeled briefing`,
    headline: `${config.code} information ${information}`,
    copy,
    summary: `${wind} · ${surface}`,
    notices,
  };
}

function activeRunways(
  state: AirportState,
  config: Pick<AirportConfig, "runways">,
  role: Extract<RunwayOperationalRole, "arrival" | "departure">,
): string[] {
  return config.runways
    .filter((runway) => state.activeRunwayRoles[runway.id] === role)
    .map((runway) =>
      activeRunwayDesignation(config, state.activeRunwayEnds, runway.id),
    );
}

function surfaceSummary(state: AirportState): string {
  const reports = state.weather.runwayConditionReports;
  const worst = reports.length
    ? Math.min(...reports.map((report) => report.worstCode))
    : state.weather.surfaceCondition === "dry"
      ? 6
      : state.weather.surfaceCondition === "wet"
        ? 5
        : 3;
  const condition =
    state.weather.surfaceCondition === "dry"
      ? "Runways dry"
      : state.weather.surfaceCondition === "wet"
        ? "Runways wet"
        : "Runways contaminated";
  return `${condition}; runway condition code ${worst}`;
}

function activeNotices(
  state: AirportState,
  config: Pick<AirportConfig, "runways">,
): string[] {
  const notices: string[] = [];
  if (state.closedRunway !== null) {
    notices.push(
      `runway ${activeRunwayDesignation(config, state.activeRunwayEnds, state.closedRunway)} closed`,
    );
  }
  if (state.runwayConfigurationTransition) {
    notices.push("runway configuration transition in progress");
  }
  const disruptions = state.surfaceDisruptions;
  if (disruptions.length) {
    notices.push(
      `${disruptions.length} active surface ${disruptions.length === 1 ? "notice" : "notices"}`,
    );
  }
  if (state.weather.activeHazard) {
    notices.push(`${state.weather.activeHazard.kind.replaceAll("-", " ")} advisory active`);
  }
  return notices;
}

function aviationDegrees(mathAngleRadians: number): string {
  const degrees =
    ((Math.round(90 - (mathAngleRadians * 180) / Math.PI) % 360) + 360) %
    360;
  return String(degrees || 360).padStart(3, "0");
}

function informationLetter(elapsedSeconds: number): string {
  const alphabet = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO"];
  const index =
    Math.floor(Math.max(0, elapsedSeconds) / 1_800) % alphabet.length;
  return alphabet[index] ?? "ALPHA";
}

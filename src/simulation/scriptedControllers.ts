import type { AirportConfig } from "./airportConfig";
import {
  CONTROLLER_STATIONS,
  nextControllerStation,
  suggestedHandoffStation,
} from "./controllerOperations";
import { WORLD_METERS_PER_UNIT } from "./runwayPerformance";
import { surfaceRouteCrossingWindows } from "./surfaceGraph";
import type {
  AirportState,
  ControllerStation,
  Flight,
  OperationalControllerStation,
  ScriptedControllerAction,
  ScriptedControllerMode,
  ScriptedControllerPriority,
  ScriptedControllerRuntime,
} from "./types";

export const SCRIPTED_CONTROLLER_CADENCE_SECONDS = 0.25;
export const SCRIPTED_CONTROLLER_HISTORY_LIMIT = 64;
export const SCRIPTED_CONTROLLER_MAX_ACTIONS_PER_STATION = 2;
export const SCRIPTED_HANDOFF_ACCEPT_SECONDS = 0.75;
export const SCRIPTED_HANDOFF_CONTACT_SECONDS = 0.65;
const SCRIPTED_RETRY_SECONDS = 2;
const CROSSING_CLEARANCE_RANGE_M = 190;

export interface ScriptedControllerPlannedAction {
  station: ControllerStation;
  action: ScriptedControllerAction;
  flightId: number;
  runway?: number;
  targetStation?: OperationalControllerStation;
  ruleId: string;
  priority: ScriptedControllerPriority;
  rationale: string;
  order: number;
}

function stationRuntime(station: ControllerStation) {
  return {
    station,
    mode: "inactive" as ScriptedControllerMode,
    evaluations: 0,
    planned: 0,
    accepted: 0,
    rejected: 0,
    lastEvaluatedAtSeconds: null,
    lastDecisionId: null,
  };
}

export function createScriptedControllerRuntime(): ScriptedControllerRuntime {
  return {
    schemaVersion: 1,
    programVersion: "1.0.0",
    cadenceSeconds: SCRIPTED_CONTROLLER_CADENCE_SECONDS,
    cycle: 0,
    nextDecisionSequence: 1,
    lastEvaluatedAtSeconds: null,
    nextEvaluationAtSeconds: 0,
    stations: {
      supervisor: stationRuntime("supervisor"),
      approach: stationRuntime("approach"),
      tower: stationRuntime("tower"),
      ground: stationRuntime("ground"),
      ramp: stationRuntime("ramp"),
    },
    decisions: [],
  };
}

export function scriptedControllerMode(
  state: AirportState,
  station: ControllerStation,
): ScriptedControllerMode {
  const automaticMode = state.mode === "auto" || state.mode === "watch";
  if (station === "supervisor") {
    if (automaticMode || state.station !== "supervisor") return "scripted";
    return "human";
  }
  if (automaticMode || state.stationAutomation[station]) return "scripted";
  if (state.station === station || state.station === "supervisor")
    return "human";
  return "inactive";
}

export function refreshScriptedControllerModes(
  state: AirportState,
  runtime: ScriptedControllerRuntime,
): void {
  for (const station of CONTROLLER_STATIONS) {
    runtime.stations[station].mode = scriptedControllerMode(state, station);
  }
}

function priorityOrder(priority: ScriptedControllerPriority): number {
  if (priority === "safety") return 0;
  if (priority === "urgent") return 10;
  if (priority === "sequence") return 20;
  return 30;
}

function actionRecentlyRejected(
  runtime: ScriptedControllerRuntime,
  candidate: ScriptedControllerPlannedAction,
  elapsed: number,
): boolean {
  for (let index = runtime.decisions.length - 1; index >= 0; index -= 1) {
    const decision = runtime.decisions[index];
    if (elapsed - decision.resolvedAtSeconds >= SCRIPTED_RETRY_SECONDS)
      return false;
    if (
      !decision.accepted &&
      decision.station === candidate.station &&
      decision.action === candidate.action &&
      decision.flightId === candidate.flightId &&
      decision.runway === candidate.runway &&
      decision.targetStation === candidate.targetStation
    )
      return true;
  }
  return false;
}

function nextUnclearedCrossing(config: AirportConfig, flight: Flight) {
  const clearanceIds = new Set(flight.crossingClearanceIds ?? []);
  const legacyClearances =
    flight.crossingClearanceIds === undefined
      ? new Set(flight.crossingClearances ?? [])
      : null;
  return surfaceRouteCrossingWindows(
    config.surfaceGraph,
    flight.surfaceRoute,
    flight.progress,
    flight.runway,
    flight.surfaceRouteEdges,
  ).find(
    (crossing) =>
      !clearanceIds.has(crossing.id) &&
      !legacyClearances?.has(crossing.runwayId) &&
      flight.progress <= crossing.exitProgress + 0.002,
  );
}

function handoffCandidates(
  state: AirportState,
  station: OperationalControllerStation,
): ScriptedControllerPlannedAction[] {
  const candidates: ScriptedControllerPlannedAction[] = [];
  for (const flight of state.flights) {
    const handoff = flight.navigation.handoff;
    if (
      handoff &&
      handoff.to === station &&
      (handoff.status === "offered" || handoff.status === "overdue") &&
      state.elapsed - handoff.offeredAtSeconds >=
        SCRIPTED_HANDOFF_ACCEPT_SECONDS
    ) {
      candidates.push({
        station,
        action: "accept-handoff",
        flightId: flight.id,
        targetStation: station,
        ruleId: `${station}.handoff.accept`,
        priority: handoff.status === "overdue" ? "urgent" : "sequence",
        rationale: `${station} is the receiving position and the deterministic response interval has elapsed`,
        order: handoff.status === "overdue" ? 1 : 11,
      });
    }
    if (
      handoff?.status === "accepted" &&
      handoff.from === station &&
      state.elapsed -
        (handoff.respondedAtSeconds ?? handoff.offeredAtSeconds) >=
        SCRIPTED_HANDOFF_CONTACT_SECONDS
    ) {
      candidates.push({
        station,
        action: "contact-handoff",
        flightId: flight.id,
        targetStation: handoff.to,
        ruleId: `${station}.handoff.contact`,
        priority: "sequence",
        rationale: `${handoff.to} accepted the handoff and the sender must issue the frequency change`,
        order: 5,
      });
    }
    if (
      flight.navigation.frequencyOwner !== station ||
      (handoff && ["offered", "accepted", "overdue"].includes(handoff.status))
    ) {
      continue;
    }
    const suggested = suggestedHandoffStation(flight);
    const next = nextControllerStation(flight, station);
    if (suggested && next === suggested) {
      candidates.push({
        station,
        action: "offer-handoff",
        flightId: flight.id,
        targetStation: suggested,
        ruleId: `${station}.handoff.offer`,
        priority: "sequence",
        rationale: `${flight.callsign} entered the ${station} coordination window for ${suggested}`,
        order: 18,
      });
    }
  }
  return candidates;
}

function approachCandidates(
  state: AirportState,
): ScriptedControllerPlannedAction[] {
  const candidates = handoffCandidates(state, "approach");
  for (const flight of state.flights) {
    if (
      flight.navigation.frequencyOwner !== "approach" ||
      flight.phase !== "approach"
    )
      continue;
    if (
      flight.navigation.hold &&
      state.elapsed + 1e-6 >=
        flight.navigation.hold.expectFurtherClearanceAtSeconds
    ) {
      candidates.push({
        station: "approach",
        action: "release-hold",
        flightId: flight.id,
        ruleId: "approach.hold.efc-release",
        priority: "urgent",
        rationale: `${flight.callsign} reached its expect-further-clearance time`,
        order: 2,
      });
    } else if (
      !flight.navigation.hold &&
      !flight.navigation.approachCleared &&
      !flight.goAround &&
      !flight.diversion
    ) {
      candidates.push({
        station: "approach",
        action: "clear-approach",
        flightId: flight.id,
        runway: flight.runway,
        ruleId: "approach.arrival.established",
        priority: "routine",
        rationale: `${flight.callsign} is established on its assigned terminal procedure`,
        order: 25,
      });
    }
  }
  return candidates;
}

function towerCandidates(
  state: AirportState,
): ScriptedControllerPlannedAction[] {
  const candidates = handoffCandidates(state, "tower");
  for (const flight of state.flights) {
    if (flight.navigation.frequencyOwner !== "tower") continue;
    if (
      flight.phase === "approach" &&
      flight.navigation.approachCleared &&
      !flight.cleared &&
      !flight.goAround &&
      !flight.diversion
    ) {
      candidates.push({
        station: "tower",
        action: "clear-landing",
        flightId: flight.id,
        runway: flight.runway,
        ruleId: "tower.arrival.land",
        priority: flight.progress >= 0.82 ? "urgent" : "sequence",
        rationale: `${flight.callsign} is coordinated to Tower and established for runway ${flight.runway}`,
        order: flight.progress >= 0.82 ? 3 : 13,
      });
    }
    if (
      flight.phase === "taxi-out" &&
      flight.progress >= 0.985 &&
      !flight.runwayEntryCleared
    ) {
      candidates.push({
        station: "tower",
        action: "clear-runway-entry",
        flightId: flight.id,
        runway: flight.runway,
        ruleId: "tower.departure.line-up",
        priority: "sequence",
        rationale: `${flight.callsign} reached the assigned runway hold-short point`,
        order: 8,
      });
    }
    if (
      flight.phase === "takeoff" &&
      flight.runwayEntryCleared &&
      !flight.takeoffCleared
    ) {
      candidates.push({
        station: "tower",
        action: "clear-takeoff",
        flightId: flight.id,
        runway: flight.runway,
        ruleId: "tower.departure.release",
        priority: "sequence",
        rationale: `${flight.callsign} is lined up and awaiting a runway release`,
        order: 6,
      });
    }
  }
  return candidates;
}

function groundCandidates(
  config: AirportConfig,
  state: AirportState,
): ScriptedControllerPlannedAction[] {
  const candidates = handoffCandidates(state, "ground");
  for (const disruption of state.surfaceDisruptions) {
    if (
      disruption.kind !== "disabled-aircraft" ||
      disruption.status !== "active" ||
      !disruption.flightId
    )
      continue;
    const flight = state.flights.find(
      (candidate) => candidate.id === disruption.flightId,
    );
    if (!flight) continue;
    candidates.push({
      station: "ground",
      action: "recover-disabled",
      flightId: flight.id,
      runway: disruption.runwayId,
      ruleId: "ground.disabled.recovery",
      priority: "safety",
      rationale: `${flight.callsign} is disabled on protected movement pavement`,
      order: 0,
    });
  }
  for (const flight of state.flights) {
    if (
      flight.navigation.frequencyOwner !== "ground" ||
      (flight.phase !== "taxi-in" && flight.phase !== "taxi-out")
    )
      continue;
    const crossing = nextUnclearedCrossing(config, flight);
    if (
      !crossing ||
      crossing.distanceToHold * WORLD_METERS_PER_UNIT >
        CROSSING_CLEARANCE_RANGE_M
    )
      continue;
    candidates.push({
      station: "ground",
      action: "clear-runway-crossing",
      flightId: flight.id,
      runway: crossing.runwayId,
      ruleId: "ground.crossing.next",
      priority: crossing.distanceToHold <= 0.002 ? "urgent" : "sequence",
      rationale: `${flight.callsign} reached the protected hold-short window for its next route crossing`,
      order: crossing.distanceToHold <= 0.002 ? 4 : 14,
    });
  }
  return candidates;
}

function rampCandidates(
  state: AirportState,
): ScriptedControllerPlannedAction[] {
  const candidates = handoffCandidates(state, "ramp");
  for (const flight of state.flights) {
    if (
      flight.navigation.frequencyOwner === "ramp" &&
      flight.phase === "resting" &&
      flight.turnaround.status === "ready" &&
      !flight.pushbackCleared
    ) {
      candidates.push({
        station: "ramp",
        action: "clear-pushback",
        flightId: flight.id,
        runway: flight.departureRunway,
        ruleId: "ramp.turnaround.release",
        priority: "routine",
        rationale: `${flight.callsign} is push-ready and remains under Ramp control`,
        order: 22,
      });
    }
  }
  return candidates;
}

function supervisorCandidates(
  state: AirportState,
): ScriptedControllerPlannedAction[] {
  return state.flights
    .filter(
      (flight) =>
        flight.safetyHold &&
        (flight.phase === "approach" || flight.phase === "landing") &&
        flight.progress >= 0.76 &&
        !flight.goAround &&
        !flight.diversion,
    )
    .map((flight) => ({
      station: "supervisor" as const,
      action: "go-around" as const,
      flightId: flight.id,
      runway: flight.runway,
      ruleId: "supervisor.final.safety-intervention",
      priority: "safety" as const,
      rationale: `${flight.callsign} is safety-held inside the final segment; protect the runway with a go-around`,
      order: 0,
    }));
}

export function planScriptedControllerActions(
  config: AirportConfig,
  state: AirportState,
  station: ControllerStation,
  runtime: ScriptedControllerRuntime,
): ScriptedControllerPlannedAction[] {
  const candidates =
    station === "approach"
      ? approachCandidates(state)
      : station === "tower"
        ? towerCandidates(state)
        : station === "ground"
          ? groundCandidates(config, state)
          : station === "ramp"
            ? rampCandidates(state)
            : supervisorCandidates(state);
  return candidates
    .filter(
      (candidate) => !actionRecentlyRejected(runtime, candidate, state.elapsed),
    )
    .sort(
      (first, second) =>
        priorityOrder(first.priority) - priorityOrder(second.priority) ||
        first.order - second.order ||
        first.flightId - second.flightId ||
        first.action.localeCompare(second.action),
    )
    .slice(0, SCRIPTED_CONTROLLER_MAX_ACTIONS_PER_STATION);
}

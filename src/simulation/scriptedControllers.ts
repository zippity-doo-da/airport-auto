import type { AirportConfig } from "./airportConfig";
import {
  CONTROLLER_STATIONS,
  nextControllerStation,
  requiredControllerStation,
  suggestedHandoffStation,
} from "./controllerOperations";
import { WORLD_METERS_PER_UNIT } from "./runwayPerformance";
import { surfaceRouteCrossingWindows } from "./surfaceGraph";
import {
  controllerPolicyForStation,
  createControllerWorkload,
} from "./controllerPolicies";
import type {
  AirportState,
  ControllerPolicyPresetId,
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
export const SCRIPTED_CONTROLLER_TRANSITION_HISTORY_LIMIT = 32;
const SCRIPTED_RETRY_SECONDS = 2;
const SCRIPTED_RUNWAY_RETRY_SECONDS = 12;
const CROSSING_CLEARANCE_RANGE_M = 60;

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

function stationRuntime(
  station: ControllerStation,
  presetId: ControllerPolicyPresetId,
) {
  const policy = controllerPolicyForStation(presetId, station);
  return {
    station,
    mode: "inactive" as ScriptedControllerMode,
    evaluations: 0,
    planned: 0,
    accepted: 0,
    rejected: 0,
    deferred: 0,
    lastEvaluatedAtSeconds: null,
    lastDecisionId: null,
    policy,
    workload: {
      ownedTracks: 0,
      incomingHandoffs: 0,
      outgoingHandoffs: 0,
      activeTracks: 0,
      trackLimit: policy.trackLimit,
      utilization: 0,
      atCapacity: false,
      overloaded: false,
      queuedActions: 0,
    },
    modeChangedAtSeconds: 0,
    transitionCount: 0,
    transitionReason: "controller runtime initialized",
    resumeGraceUntilSeconds: 0,
    nextRoutineDecisionAtSeconds: 0,
  };
}

export function createScriptedControllerRuntime(
  presetId: ControllerPolicyPresetId = "balanced",
): ScriptedControllerRuntime {
  return {
    schemaVersion: 2,
    programVersion: "2.0.0",
    presetId,
    cadenceSeconds: SCRIPTED_CONTROLLER_CADENCE_SECONDS,
    cycle: 0,
    nextDecisionSequence: 1,
    nextTransitionSequence: 1,
    lastEvaluatedAtSeconds: null,
    nextEvaluationAtSeconds: 0,
    stations: {
      supervisor: stationRuntime("supervisor", presetId),
      approach: stationRuntime("approach", presetId),
      tower: stationRuntime("tower", presetId),
      ground: stationRuntime("ground", presetId),
      ramp: stationRuntime("ramp", presetId),
    },
    decisions: [],
    transitions: [],
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
  reason = "controller staffing state refreshed",
): void {
  for (const station of CONTROLLER_STATIONS) {
    const stationRuntime = runtime.stations[station];
    const nextMode = scriptedControllerMode(state, station);
    stationRuntime.workload = createControllerWorkload(
      state,
      station,
      stationRuntime.policy,
      nextMode === "scripted" ? stationRuntime.workload.queuedActions : 0,
    );
    if (stationRuntime.mode === nextMode) continue;
    const previousMode = stationRuntime.mode;
    const continuityFlightIds = state.flights
      .filter((flight) => {
        if (station === "supervisor") return true;
        const handoff = flight.navigation.handoff;
        return (
          flight.navigation.frequencyOwner === station ||
          (handoff !== undefined &&
            (handoff.from === station || handoff.to === station) &&
            ["offered", "accepted", "overdue"].includes(handoff.status))
        );
      })
      .map((flight) => flight.id)
      .sort((first, second) => first - second);
    stationRuntime.mode = nextMode;
    stationRuntime.modeChangedAtSeconds = state.elapsed;
    stationRuntime.transitionCount += 1;
    stationRuntime.transitionReason = reason;
    if (previousMode === "human" && nextMode === "scripted") {
      stationRuntime.resumeGraceUntilSeconds =
        state.elapsed + stationRuntime.policy.takeoverGraceSeconds;
    }
    runtime.transitions.push({
      id: `controller-transition-${runtime.nextTransitionSequence++}`,
      station,
      from: previousMode,
      to: nextMode,
      atSeconds: state.elapsed,
      reason,
      continuityFlightIds,
    });
    if (
      runtime.transitions.length > SCRIPTED_CONTROLLER_TRANSITION_HISTORY_LIMIT
    ) {
      runtime.transitions.splice(
        0,
        runtime.transitions.length -
          SCRIPTED_CONTROLLER_TRANSITION_HISTORY_LIMIT,
      );
    }
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
    if (
      decision.disposition !== "accepted" &&
      decision.station === candidate.station &&
      decision.action === candidate.action &&
      decision.flightId === candidate.flightId &&
      decision.runway === candidate.runway &&
      decision.targetStation === candidate.targetStation
    ) {
      const retrySeconds =
        decision.disposition === "deferred"
          ? runtime.stations[candidate.station].policy.deferralReviewSeconds
          : candidate.action === "clear-runway-entry" ||
              candidate.action === "clear-takeoff" ||
              candidate.action === "clear-runway-crossing"
            ? SCRIPTED_RUNWAY_RETRY_SECONDS
            : SCRIPTED_RETRY_SECONDS;
      return elapsed - decision.resolvedAtSeconds < retrySeconds;
    }
  }
  return false;
}

function lastCandidateDecisionAt(
  runtime: ScriptedControllerRuntime,
  candidate: ScriptedControllerPlannedAction,
): number {
  for (let index = runtime.decisions.length - 1; index >= 0; index -= 1) {
    const decision = runtime.decisions[index];
    if (
      decision.station === candidate.station &&
      decision.action === candidate.action &&
      decision.flightId === candidate.flightId &&
      decision.runway === candidate.runway &&
      decision.targetStation === candidate.targetStation
    )
      return decision.resolvedAtSeconds;
  }
  return Number.MIN_SAFE_INTEGER;
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
  runtime: ScriptedControllerRuntime,
): ScriptedControllerPlannedAction[] {
  const candidates: ScriptedControllerPlannedAction[] = [];
  const stationRuntime = runtime.stations[station];
  const policy = stationRuntime.policy;
  for (const flight of state.flights) {
    const handoff = flight.navigation.handoff;
    if (
      handoff &&
      handoff.to === station &&
      (handoff.status === "offered" || handoff.status === "overdue") &&
      state.elapsed - handoff.offeredAtSeconds >= policy.handoffAcceptSeconds
    ) {
      const urgent =
        handoff.status === "overdue" ||
        handoff.responseDueSeconds - state.elapsed <=
          policy.handoffUrgencySeconds;
      const atOwnedTrackLimit =
        stationRuntime.workload.ownedTracks >= policy.trackLimit;
      candidates.push({
        station,
        action:
          atOwnedTrackLimit && !urgent ? "defer-handoff" : "accept-handoff",
        flightId: flight.id,
        targetStation: station,
        ruleId:
          atOwnedTrackLimit && !urgent
            ? `${station}.handoff.capacity-deferral`
            : `${station}.handoff.accept`,
        priority: urgent ? "urgent" : "sequence",
        rationale:
          atOwnedTrackLimit && !urgent
            ? `${station} is at its ${policy.trackLimit}-track policy limit; preserve ownership and review the offer again`
            : `${station} is receiving the flight within its deterministic coordination window`,
        order: urgent ? 1 : atOwnedTrackLimit ? 12 : 11,
      });
    }
    if (
      handoff?.status === "accepted" &&
      handoff.from === station &&
      state.elapsed -
        (handoff.respondedAtSeconds ?? handoff.offeredAtSeconds) >=
        policy.handoffContactSeconds
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
    const required = requiredControllerStation(flight);
    const correctiveAuthorityHandoff =
      suggested === required && required !== station;
    if (suggested && (next === suggested || correctiveAuthorityHandoff)) {
      candidates.push({
        station,
        action: "offer-handoff",
        flightId: flight.id,
        targetStation: suggested,
        ruleId: correctiveAuthorityHandoff
          ? `${station}.handoff.correct-authority`
          : `${station}.handoff.offer`,
        priority: correctiveAuthorityHandoff ? "urgent" : "sequence",
        rationale: correctiveAuthorityHandoff
          ? `${flight.callsign} requires ${suggested} authority before its next protected movement`
          : `${flight.callsign} entered the ${station} coordination window for ${suggested}`,
        order: correctiveAuthorityHandoff ? 2 : 18,
      });
    }
  }
  return candidates;
}

function approachCandidates(
  state: AirportState,
  runtime: ScriptedControllerRuntime,
): ScriptedControllerPlannedAction[] {
  const candidates = handoffCandidates(state, "approach", runtime);
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
  runtime: ScriptedControllerRuntime,
): ScriptedControllerPlannedAction[] {
  const candidates = handoffCandidates(state, "tower", runtime);
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
      !flight.takeoffCleared &&
      !flight.rejectedTakeoff
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
  runtime: ScriptedControllerRuntime,
): ScriptedControllerPlannedAction[] {
  const candidates = handoffCandidates(state, "ground", runtime);
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
  runtime: ScriptedControllerRuntime,
): ScriptedControllerPlannedAction[] {
  const candidates = handoffCandidates(state, "ramp", runtime);
  for (const flight of state.flights) {
    if (
      flight.navigation.frequencyOwner === "ramp" &&
      flight.phase === "resting" &&
      flight.turnaround.status === "ready" &&
      !flight.pushbackCleared
    ) {
      const releasesBlockedSurfaceFlight = state.flights.some(
        (candidate) =>
          (candidate.phase === "taxi-in" || candidate.phase === "taxi-out") &&
          candidate.safetyHoldReason ===
            `projected path conflict with flight ${flight.id}`,
      );
      candidates.push({
        station: "ramp",
        action: "clear-pushback",
        flightId: flight.id,
        runway: flight.departureRunway,
        ruleId: releasesBlockedSurfaceFlight
          ? "ramp.blocked-surface.release"
          : "ramp.turnaround.release",
        priority: releasesBlockedSurfaceFlight ? "urgent" : "routine",
        rationale: releasesBlockedSurfaceFlight
          ? `${flight.callsign} is push-ready and physically blocks an active surface movement`
          : `${flight.callsign} is push-ready and remains under Ramp control`,
        order: releasesBlockedSurfaceFlight ? 3 : 22,
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
        !flight.motion.onGround &&
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
      ? approachCandidates(state, runtime)
      : station === "tower"
        ? towerCandidates(state, runtime)
        : station === "ground"
          ? groundCandidates(config, state, runtime)
          : station === "ramp"
            ? rampCandidates(state, runtime)
            : supervisorCandidates(state);
  const ordered = candidates
    .filter(
      (candidate) => !actionRecentlyRejected(runtime, candidate, state.elapsed),
    )
    .sort(
      (first, second) =>
        priorityOrder(first.priority) - priorityOrder(second.priority) ||
        first.order - second.order ||
        lastCandidateDecisionAt(runtime, first) -
          lastCandidateDecisionAt(runtime, second) ||
        first.flightId - second.flightId ||
        first.action.localeCompare(second.action),
    );
  const stationRuntime = runtime.stations[station];
  const immediate = ordered.filter(
    (candidate) =>
      candidate.priority === "safety" || candidate.priority === "urgent",
  );
  const paced = ordered.filter(
    (candidate) =>
      candidate.priority !== "safety" && candidate.priority !== "urgent",
  );
  const routineReady =
    state.elapsed + 1e-6 >= stationRuntime.nextRoutineDecisionAtSeconds &&
    state.elapsed + 1e-6 >= stationRuntime.resumeGraceUntilSeconds;
  const selected = [
    ...immediate,
    ...(routineReady
      ? paced.slice(0, stationRuntime.policy.maxActionsPerEvaluation)
      : []),
  ].sort(
    (first, second) =>
      priorityOrder(first.priority) - priorityOrder(second.priority) ||
      first.order - second.order ||
      first.flightId - second.flightId ||
      first.action.localeCompare(second.action),
  );
  stationRuntime.workload = createControllerWorkload(
    state,
    station,
    stationRuntime.policy,
    Math.max(0, ordered.length - selected.length),
  );
  return selected;
}

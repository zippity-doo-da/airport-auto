import type { AirportState, Flight, FlightRouteClearanceState } from "./types";
import { aircraftProfile } from "./aircraftProfiles";

export type DigitalClearanceChannel =
  "data" | "voice" | "coordination" | "state-record";
export type DigitalClearanceDeskAccess = "authorized" | "handoff-required";
export type DigitalClearanceResponseMode = "panel" | "voice-action" | "none";

export interface DigitalClearanceCapability {
  /** How the authoritative instruction entered the simulation. */
  channel: DigitalClearanceChannel;
  /** The selected workstation's access to the message's owning authority. */
  deskAccess: DigitalClearanceDeskAccess;
  /** Where a controller can respond; the inbox never invents an executor. */
  responseMode: DigitalClearanceResponseMode;
  /** Fictional profile-level equipage assumption, never an operator claim. */
  aircraftSupport: "data-comm-supported" | "voice-only" | "not-applicable";
  limitations: string[];
}

export type DigitalClearanceStatus =
  | "draft"
  | "sent"
  | "delivered"
  | "wilco"
  | "unable"
  | "standby"
  | "superseded"
  | "timed-out"
  | "cancelled";

interface DigitalClearanceDraft {
  id: string;
  flightId: number;
  callsign: string;
  kind:
    | "route-amendment"
    | "compound-clearance"
    | "vector"
    | "hold"
    | "speed"
    | "altitude"
    | "departure"
    | "ground-stop"
    | "taxi"
    | "crossing"
    | "direct-to"
    | "go-around"
    | "frequency"
    | "revision";
  status: DigitalClearanceStatus;
  authority: string;
  revision: number;
  createdAtSeconds: number;
  issuedAtSeconds?: number;
  deliveredAtSeconds?: number;
  responseDueSeconds?: number;
  expiresAtSeconds?: number | null;
  respondedAtSeconds?: number;
  route: string[];
  parameters: Record<string, string | number>;
  detail: string;
  warningCount: number;
  commandId?: string;
  controllerDecisionId?: string;
  responseCommandId?: string;
  causalEventIds?: string[];
}

export interface DigitalClearanceMessage extends DigitalClearanceDraft {
  /** Stable command identity for UI, replay, analytics, and agent clients. */
  commandId: string;
  /** Deterministic authoritative references that explain why this message exists. */
  causalEventIds: string[];
  /** Null for completed messages; otherwise the point at which the envelope expires. */
  expiresAtSeconds: number | null;
  capability: DigitalClearanceCapability;
  response: {
    status: DigitalClearanceStatus;
    commandId?: string;
    deliveredAtSeconds?: number;
    dueSeconds?: number;
    respondedAtSeconds?: number;
  };
}

export interface DigitalClearanceSnapshot {
  schemaVersion: 5;
  generatedAtSeconds: number;
  messages: DigitalClearanceMessage[];
  counts: Record<DigitalClearanceStatus, number>;
}

/**
 * Read-only Data Comm-style projection. It reuses the route-clearance and
 * simulated readback state; it neither dispatches nor authorizes commands.
 */
export function digitalClearanceSnapshot(
  state: AirportState,
): DigitalClearanceSnapshot {
  const messages = state.flights
    .flatMap((flight) => flightDigitalClearanceMessages(flight))
    .map((draft) => toEnvelope(draft, state))
    .sort(
      (first, second) =>
        statusRank(second.status) - statusRank(first.status) ||
        second.createdAtSeconds - first.createdAtSeconds ||
        first.callsign.localeCompare(second.callsign),
    );
  const counts = emptyCounts();
  for (const message of messages) counts[message.status] += 1;
  return {
    schemaVersion: 5,
    generatedAtSeconds: state.elapsed,
    messages,
    counts,
  };
}

function flightDigitalClearanceMessages(
  flight: Flight,
): DigitalClearanceDraft[] {
  const messages: DigitalClearanceDraft[] = [];
  const route = flight.navigation.routeClearance;
  if (route) messages.push(routeClearanceMessage(flight, route));

  const groundStop = flight.groundStop;
  if (groundStop) {
    const released = groundStop.releasedAtSeconds !== undefined;
    const stopped = groundStop.stoppedAtSeconds !== undefined;
    messages.push({
      id: `ground-stop:${flight.id}:${groundStop.issuedAtSeconds}`,
      flightId: flight.id,
      callsign: flight.callsign,
      kind: "ground-stop",
      status: released ? "wilco" : "standby",
      authority: groundStop.issuedBy,
      revision: 1,
      createdAtSeconds: groundStop.issuedAtSeconds,
      issuedAtSeconds: groundStop.issuedAtSeconds,
      respondedAtSeconds: groundStop.releasedAtSeconds,
      route: [],
      parameters: {
        initialSpeedKts: groundStop.initialSpeedKts,
        targetDecelerationMps2: groundStop.targetDecelerationMps2,
        stopped: stopped ? "yes" : "no",
        released: released ? "yes" : "no",
      },
      detail: released
        ? `${flight.callsign}, resume taxi.`
        : stopped
          ? `${flight.callsign}, stopped. Hold position.`
          : `${groundStop.phraseology} Maximum safe surface braking.`,
      warningCount: released ? 0 : 1,
      commandId: groundStop.commandId,
      responseCommandId: groundStop.responseCommandId,
      causalEventIds: [...groundStop.causalEventIds],
    });
  }

  for (const amendment of flight.flightPlan.amendments) {
    messages.push({
      id: `revision:${flight.id}:${amendment.revision}`,
      flightId: flight.id,
      callsign: flight.callsign,
      kind: "revision",
      status: "wilco",
      authority: flight.navigation.frequencyOwner,
      revision: amendment.revision,
      createdAtSeconds: amendment.atSeconds,
      issuedAtSeconds: amendment.atSeconds,
      route: [],
      parameters: {
        amendmentRevision: amendment.revision,
        amendmentKind: amendment.kind,
      },
      detail: `Flight plan revision ${amendment.revision}: ${amendment.detail}`,
      warningCount: 0,
    });
  }

  const vector = flight.navigation.vector;
  if (
    vector &&
    flight.progress <= vector.endProgress + 0.02 &&
    !flight.goAround &&
    !flight.diversion
  ) {
    const directAmendment = flight.flightPlan.amendments.at(-1);
    const isDirectTo =
      directAmendment?.kind === "route-change" &&
      /^direct\s/i.test(directAmendment.detail) &&
      Math.abs(directAmendment.atSeconds - vector.issuedAtSeconds) < 1e-6;
    messages.push({
      id: `vector:${flight.id}:${vector.issuedAtSeconds}`,
      flightId: flight.id,
      callsign: flight.callsign,
      kind: isDirectTo ? "direct-to" : "vector",
      status: "wilco",
      authority: flight.navigation.frequencyOwner,
      revision: 1,
      createdAtSeconds: vector.issuedAtSeconds,
      issuedAtSeconds: vector.issuedAtSeconds,
      route: vector.rejoinFixId ? [vector.rejoinFixId] : [],
      parameters: {
        headingDegrees: Math.round(vector.headingDegrees),
        ...(vector.rejoinFixId ? { rejoinFix: vector.rejoinFixId } : {}),
      },
      detail:
        vector.evidence?.phraseology ??
        (isDirectTo && vector.rejoinFixId
          ? `Proceed direct ${vector.rejoinFixId}; fly heading ${Math.round(vector.headingDegrees)}°.`
          : vector.rejoinFixId
            ? `Fly heading ${Math.round(vector.headingDegrees)}°; rejoin ${vector.rejoinFixId}.`
            : `Fly heading ${Math.round(vector.headingDegrees)}° as assigned.`),
      warningCount: 0,
      commandId: vector.evidence?.commandId,
      controllerDecisionId: vector.evidence?.controllerDecisionId,
      causalEventIds: vector.evidence?.causalEventIds
        ? [...vector.evidence.causalEventIds]
        : undefined,
    });
  }

  const hold = flight.navigation.hold;
  if (hold) {
    messages.push({
      id: `hold:${flight.id}:${hold.issuedAtSeconds}`,
      flightId: flight.id,
      callsign: flight.callsign,
      kind: "hold",
      status: "wilco",
      authority: flight.navigation.frequencyOwner,
      revision: hold.cycle,
      createdAtSeconds: hold.issuedAtSeconds,
      issuedAtSeconds: hold.issuedAtSeconds,
      route: [hold.fixId],
      parameters: {
        fix: hold.fixId,
        pattern: hold.patternId,
        turns: hold.turns,
        expectFurtherClearanceAtSeconds: hold.expectFurtherClearanceAtSeconds,
      },
      detail:
        hold.evidence?.phraseology ??
        `Hold ${hold.fixId} ${hold.turns} turns; expect further clearance at ${Math.ceil(hold.expectFurtherClearanceAtSeconds)}s.`,
      warningCount: 0,
      commandId: hold.evidence?.commandId,
      controllerDecisionId: hold.evidence?.controllerDecisionId,
      causalEventIds: hold.evidence?.causalEventIds
        ? [...hold.evidence.causalEventIds]
        : undefined,
    });
  }

  if (
    (flight.phase === "taxi-out" || flight.phase === "takeoff") &&
    flight.flightPlan.direction === "departure"
  ) {
    messages.push({
      id: `departure:${flight.id}:${flight.departureRunway}:${flight.runwayEntryCleared ? 1 : 0}:${flight.rejectedTakeoff ? 1 : 0}`,
      flightId: flight.id,
      callsign: flight.callsign,
      kind: "departure",
      status: flight.rejectedTakeoff ? "unable" : "wilco",
      authority: flight.navigation.frequencyOwner,
      revision: 1,
      createdAtSeconds: flight.flightPlan.createdAtSeconds,
      issuedAtSeconds: flight.flightPlan.createdAtSeconds,
      route: [flight.flightPlan.runwayIntent.designation],
      parameters: {
        runway: flight.flightPlan.runwayIntent.designation,
        runwayEntryCleared: flight.runwayEntryCleared ? "yes" : "no",
        takeoffCleared: flight.takeoffCleared ? "yes" : "no",
        rejectedTakeoff: flight.rejectedTakeoff ? "yes" : "no",
        ...(flight.rejectedTakeoff
          ? {
              rejectedTakeoffReason: flight.rejectedTakeoff.reason,
              decisionSpeedKts: flight.rejectedTakeoff.decisionSpeedKts,
            }
          : {}),
      },
      detail: flight.rejectedTakeoff
        ? `Takeoff rejected for ${flight.rejectedTakeoff.reason}; ${flight.rejectedTakeoff.stoppedAtSeconds === undefined ? "maximum safe braking in progress" : "stopped on the runway for recovery"}.`
        : flight.takeoffCleared
          ? `Cleared for departure on ${flight.flightPlan.runwayIntent.designation}.`
          : flight.runwayEntryCleared
            ? `Line up and await takeoff clearance on ${flight.flightPlan.runwayIntent.designation}.`
            : `Taxi for departure to ${flight.flightPlan.runwayIntent.designation}.`,
      warningCount: flight.rejectedTakeoff ? 1 : 0,
      commandId: flight.rejectedTakeoff?.evidence?.commandId,
      controllerDecisionId:
        flight.rejectedTakeoff?.evidence?.controllerDecisionId,
      causalEventIds: flight.rejectedTakeoff?.evidence?.causalEventIds
        ? [...flight.rejectedTakeoff.evidence.causalEventIds]
        : undefined,
    });
  }

  if (
    (flight.phase === "taxi-in" || flight.phase === "taxi-out") &&
    flight.surfaceRoute?.length
  ) {
    messages.push({
      id: `taxi:${flight.id}:${flight.surfaceRoute.length}:${flight.progress > 0.5 ? 1 : 0}`,
      flightId: flight.id,
      callsign: flight.callsign,
      kind: "taxi",
      status: "wilco",
      authority: flight.navigation.frequencyOwner,
      revision: 1,
      createdAtSeconds: flight.flightPlan.createdAtSeconds,
      issuedAtSeconds: flight.flightPlan.createdAtSeconds,
      route: flight.surfaceRoute.slice(0, 8),
      parameters: {
        routeNodes: flight.surfaceRoute.length,
        taxiway: flight.taxiway ?? "assigned surface route",
      },
      detail: `Taxi via the assigned surface route${flight.taxiway ? ` via ${flight.taxiway}` : ""}.`,
      warningCount: 0,
    });
  }

  const requiredCrossings = flight.requiredCrossings ?? [];
  if (requiredCrossings.length) {
    const cleared = new Set(flight.crossingClearances ?? []);
    const remaining = requiredCrossings.filter(
      (runway) => !cleared.has(runway),
    );
    messages.push({
      id: `crossing:${flight.id}:${requiredCrossings.join(",")}:${[...cleared].join(",")}`,
      flightId: flight.id,
      callsign: flight.callsign,
      kind: "crossing",
      status: remaining.length ? "standby" : "wilco",
      authority: flight.navigation.frequencyOwner,
      revision: 1,
      createdAtSeconds: flight.flightPlan.createdAtSeconds,
      issuedAtSeconds: flight.flightPlan.createdAtSeconds,
      route: requiredCrossings.map((runway) => `RWY ${runway + 1}`),
      parameters: {
        required: requiredCrossings.length,
        cleared: cleared.size,
        remaining: remaining.length,
      },
      detail: remaining.length
        ? `${remaining.length} runway crossing${remaining.length === 1 ? "" : "s"} still require Ground clearance.`
        : "All planned runway crossings are cleared.",
      warningCount: remaining.length,
    });
  }

  const handoff = flight.navigation.handoff;
  if (handoff) {
    const status: DigitalClearanceStatus =
      handoff.status === "completed"
        ? "wilco"
        : handoff.status === "rejected"
          ? "unable"
          : handoff.status === "cancelled"
            ? "cancelled"
            : handoff.status === "overdue"
              ? "standby"
              : handoff.status === "accepted"
                ? "delivered"
                : "standby";
    const authority =
      handoff.status === "offered" || handoff.status === "overdue"
        ? handoff.to
        : handoff.status === "accepted"
          ? handoff.from
          : handoff.offeredBy;
    messages.push({
      id: `frequency:${flight.id}:${handoff.revision}`,
      flightId: flight.id,
      callsign: flight.callsign,
      kind: "frequency",
      status,
      authority,
      revision: handoff.revision,
      createdAtSeconds: handoff.offeredAtSeconds,
      issuedAtSeconds: handoff.offeredAtSeconds,
      responseDueSeconds:
        handoff.status === "offered" || handoff.status === "overdue"
          ? handoff.responseDueSeconds
          : undefined,
      respondedAtSeconds:
        handoff.completedAtSeconds ?? handoff.respondedAtSeconds,
      route: handoff.to ? [handoff.to] : [],
      parameters: {
        from: handoff.from,
        to: handoff.to,
        status: handoff.status,
        responseDueSeconds: handoff.responseDueSeconds,
        coordinated: handoff.respondedAtSeconds === undefined ? "no" : "yes",
        contacted: handoff.completedAtSeconds === undefined ? "no" : "yes",
      },
      detail:
        handoff.status === "overdue"
          ? `Contact handoff ${handoff.from} → ${handoff.to} is overdue.`
          : handoff.status === "accepted"
            ? `${handoff.to} accepted ${flight.callsign}; ${handoff.from} must issue contact.`
            : handoff.status === "completed"
              ? `${flight.callsign} contacted ${handoff.to}; frequency ownership transferred.`
              : handoff.status === "rejected"
                ? `${handoff.to} rejected the handoff; ${handoff.from} retains ownership.`
                : handoff.status === "cancelled"
                  ? `${handoff.from} cancelled the handoff and retains ownership.`
                  : `Handoff offered ${handoff.from} → ${handoff.to}; receiving controller response required.`,
      warningCount: handoff.status === "overdue" ? 1 : 0,
      commandId: handoff.commandId,
      responseCommandId:
        handoff.completionCommandId ?? handoff.responseCommandId,
      causalEventIds: [...(handoff.causalEventIds ?? [])],
    });
  }

  if (
    flight.navigation.assignedSpeedKts !== undefined &&
    !flight.motion.onGround &&
    !flight.goAround &&
    !flight.diversion
  ) {
    const speed = Math.round(flight.navigation.assignedSpeedKts);
    if (!acceptedCompoundIncludes(flight, "speed"))
      messages.push(
        instructionMessage(
          flight,
          "speed",
          speed,
          `Maintain ${speed} knots.`,
          flight.navigation.speedClearance,
        ),
      );
  }
  if (
    flight.navigation.assignedAltitudeFt !== undefined &&
    !flight.motion.onGround &&
    !flight.goAround &&
    !flight.diversion
  ) {
    const altitude = Math.round(flight.navigation.assignedAltitudeFt);
    if (!acceptedCompoundIncludes(flight, "altitude"))
      messages.push(
        instructionMessage(
          flight,
          "altitude",
          altitude,
          `Maintain ${altitude.toLocaleString()} feet.`,
          flight.navigation.altitudeClearance,
        ),
      );
  }
  if (flight.goAround) {
    const evidence = flight.goAround.evidence;
    messages.push({
      id: `go-around:${flight.id}:${flight.goAround.startedAt}`,
      flightId: flight.id,
      callsign: flight.callsign,
      kind: "go-around",
      status: "wilco",
      authority: evidence?.issuedBy ?? flight.navigation.frequencyOwner,
      revision: flight.goAround.cycle,
      createdAtSeconds: flight.goAround.startedAt,
      issuedAtSeconds: flight.goAround.startedAt,
      route: flight.navigation.missedApproachId
        ? [flight.navigation.missedApproachId]
        : [],
      parameters: {
        cycle: flight.goAround.cycle,
        reason: flight.goAround.detail,
        weatherEscape: flight.goAround.weatherEscape ? "yes" : "no",
      },
      detail:
        evidence?.phraseology ??
        `${flight.callsign}, go around. Fly the published missed approach.`,
      warningCount: 1,
      commandId: evidence?.commandId,
      controllerDecisionId: evidence?.controllerDecisionId,
      causalEventIds: evidence?.causalEventIds
        ? [...evidence.causalEventIds]
        : undefined,
    });
  }
  return messages;
}

function instructionMessage(
  flight: Flight,
  kind: "speed" | "altitude",
  value: number,
  detail: string,
  clearance?: Flight["navigation"]["speedClearance"],
): DigitalClearanceDraft {
  const issuedAtSeconds = clearance?.issuedAtSeconds ?? 0;
  return {
    id: `${kind}:${flight.id}:${value}`,
    flightId: flight.id,
    callsign: flight.callsign,
    kind,
    status: "wilco",
    authority: flight.navigation.frequencyOwner,
    revision: 1,
    createdAtSeconds: issuedAtSeconds,
    issuedAtSeconds,
    route: [],
    parameters: { [kind === "speed" ? "speedKts" : "altitudeFt"]: value },
    detail: clearance?.phraseology ?? detail,
    warningCount: 0,
    commandId: clearance?.commandId,
    controllerDecisionId: clearance?.controllerDecisionId,
    causalEventIds: clearance?.causalEventIds
      ? [...clearance.causalEventIds]
      : undefined,
  };
}

function routeClearanceMessage(
  flight: Flight,
  clearance: FlightRouteClearanceState,
): DigitalClearanceDraft {
  const supplements = clearance.supplements ?? [];
  const altitude = supplements.find((item) => item.kind === "altitude");
  const speed = supplements.find((item) => item.kind === "speed");
  return {
    id: `route:${flight.id}:${clearance.revision}`,
    flightId: flight.id,
    callsign: flight.callsign,
    kind: supplements.length ? "compound-clearance" : "route-amendment",
    status: routeStatus(clearance),
    authority: clearance.issuedBy,
    revision: clearance.revision,
    createdAtSeconds: clearance.previewedAtSeconds,
    issuedAtSeconds: clearance.issuedAtSeconds,
    deliveredAtSeconds: clearance.deliveredAtSeconds,
    responseDueSeconds: clearance.readbackDueSeconds,
    expiresAtSeconds: clearance.readbackExpiresSeconds,
    respondedAtSeconds: clearance.respondedAtSeconds,
    route: [...clearance.routeFixNames],
    parameters: {
      distanceNm: Number(clearance.distanceNm.toFixed(1)),
      estimatedSeconds: Math.round(clearance.estimatedSeconds),
      ...(altitude?.kind === "altitude"
        ? { altitudeFt: altitude.altitudeFt }
        : {}),
      ...(speed?.kind === "speed" ? { speedKts: speed.speedKts } : {}),
    },
    detail:
      clearance.reason ??
      clearance.warnings[0]?.detail ??
      (supplements.length
        ? `Atomic route package: ${supplements
            .map((item) =>
              item.kind === "altitude"
                ? `${item.altitudeFt.toLocaleString()} ft`
                : `${item.speedKts} kt`,
            )
            .join(" · ")}.`
        : "Route proposal awaiting controller action."),
    warningCount: clearance.warnings.length,
    commandId: clearance.commandId,
    responseCommandId: clearance.responseCommandId,
    causalEventIds: clearance.causalEventIds
      ? [...clearance.causalEventIds]
      : undefined,
  };
}

function acceptedCompoundIncludes(
  flight: Flight,
  kind: "altitude" | "speed",
): boolean {
  const clearance = flight.navigation.routeClearance;
  return Boolean(
    clearance?.status === "accepted" &&
    (clearance.supplements ?? []).some((item) => item.kind === kind),
  );
}

function routeStatus(
  clearance: FlightRouteClearanceState,
): DigitalClearanceStatus {
  if (clearance.status === "preview") return "draft";
  if (clearance.status === "sent") return "sent";
  if (clearance.status === "pending-readback") return "delivered";
  if (clearance.status === "accepted") return "wilco";
  if (clearance.status === "rejected") return "unable";
  if (clearance.status === "timed-out") return "timed-out";
  return /superseded/i.test(clearance.reason ?? "")
    ? "superseded"
    : "cancelled";
}

function toEnvelope(
  draft: DigitalClearanceDraft,
  state: AirportState,
): DigitalClearanceMessage {
  const { responseCommandId, ...envelopeDraft } = draft;
  const terminal = [
    "wilco",
    "unable",
    "superseded",
    "timed-out",
    "cancelled",
  ].includes(draft.status);
  const expiresAtSeconds = terminal
    ? null
    : (draft.expiresAtSeconds ??
      draft.responseDueSeconds ??
      draft.createdAtSeconds + 90);
  return {
    ...envelopeDraft,
    commandId: draft.commandId ?? `cmd:${draft.id}`,
    causalEventIds: draft.causalEventIds?.length
      ? [...draft.causalEventIds]
      : [
          `flight:${draft.flightId}`,
          `clearance:${draft.kind}:${draft.revision}`,
        ],
    capability: messageCapability(draft, state),
    expiresAtSeconds,
    response: {
      status: draft.status,
      ...(responseCommandId ? { commandId: responseCommandId } : {}),
      ...(draft.deliveredAtSeconds === undefined
        ? {}
        : { deliveredAtSeconds: draft.deliveredAtSeconds }),
      ...(draft.responseDueSeconds === undefined
        ? {}
        : { dueSeconds: draft.responseDueSeconds }),
      ...(draft.respondedAtSeconds === undefined
        ? {}
        : { respondedAtSeconds: draft.respondedAtSeconds }),
    },
  };
}

function messageCapability(
  draft: DigitalClearanceDraft,
  state: AirportState,
): DigitalClearanceCapability {
  const channel = messageChannel(draft.kind);
  const deskAccess =
    state.station === "supervisor" || state.station === draft.authority
      ? "authorized"
      : "handoff-required";
  const activeDataMessage =
    channel === "data" && ["draft", "sent", "delivered"].includes(draft.status);
  const activeCoordinationMessage =
    channel === "coordination" &&
    ["standby", "delivered"].includes(draft.status);
  const responseMode: DigitalClearanceResponseMode = activeDataMessage
    ? state.mode === "manual" || state.mode === "assisted"
      ? deskAccess === "authorized"
        ? "panel"
        : "none"
      : "none"
    : channel === "voice"
      ? "voice-action"
      : activeCoordinationMessage &&
          (state.mode === "manual" || state.mode === "assisted") &&
          deskAccess === "authorized"
        ? "voice-action"
      : "none";
  const limitations: string[] = [];
  const flight = state.flights.find((item) => item.id === draft.flightId);
  const profile = flight ? aircraftProfile(flight.aircraft) : null;
  const dataCommSupport = profile?.dataCommSupport ?? "voice-only";
  if (channel === "data" && dataCommSupport === "voice-only")
    limitations.push(
      `${profile?.model ?? "Aircraft"} is modeled voice-only; use direct-to or vector flight controls.`,
    );
  else if (channel !== "data")
    limitations.push(
      channel === "state-record"
        ? "Read-only operational record; no clearance was transmitted from this row."
        : channel === "coordination" && !activeCoordinationMessage
          ? "Coordination is closed; no further response is available from this row."
        : "Immediate instruction or coordination record; use the flight action controls.",
    );
  if (deskAccess === "handoff-required")
    limitations.push(
      `${draft.authority.toUpperCase()} authority required; current desk is ${state.station.toUpperCase()}.`,
    );
  if (activeDataMessage && !["manual", "assisted"].includes(state.mode))
    limitations.push(
      `${state.mode === "watch" ? "Watch" : "Auto"} mode provides monitor-only Data Comm access.`,
    );
  if (
    activeCoordinationMessage &&
    !["manual", "assisted"].includes(state.mode)
  )
    limitations.push(
      `${state.mode === "watch" ? "Watch" : "Auto"} mode provides monitor-only coordination access.`,
    );
  if (channel === "data" && !activeDataMessage)
    limitations.push(
      "Transmission is closed; no further response is available.",
    );
  return {
    channel,
    deskAccess,
    responseMode,
    aircraftSupport:
      channel === "data"
        ? dataCommSupport === "supported"
          ? "data-comm-supported"
          : "voice-only"
        : "not-applicable",
    limitations,
  };
}

function messageChannel(
  kind: DigitalClearanceDraft["kind"],
): DigitalClearanceChannel {
  if (kind === "route-amendment" || kind === "compound-clearance")
    return "data";
  if (kind === "frequency") return "coordination";
  if (kind === "revision") return "state-record";
  return "voice";
}

function emptyCounts(): Record<DigitalClearanceStatus, number> {
  return {
    draft: 0,
    sent: 0,
    delivered: 0,
    wilco: 0,
    unable: 0,
    standby: 0,
    superseded: 0,
    "timed-out": 0,
    cancelled: 0,
  };
}

function statusRank(status: DigitalClearanceStatus): number {
  return {
    // Terminal command outcomes need to remain visible above routine surface
    // standby messages. Otherwise an authority-transfer cancellation can be
    // present in state yet disappear from the top of the controller's Data
    // Comm inbox behind a normal crossing reminder.
    cancelled: 11,
    superseded: 10,
    "timed-out": 9,
    delivered: 8,
    unable: 7,
    draft: 6,
    standby: 5,
    sent: 4,
    wilco: 1,
  }[status];
}

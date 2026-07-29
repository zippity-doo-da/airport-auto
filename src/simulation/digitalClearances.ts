import type { AirportState, Flight, FlightRouteClearanceState } from "./types";

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

export interface DigitalClearanceMessage {
  id: string;
  flightId: number;
  callsign: string;
  kind: "route-amendment" | "vector" | "hold" | "speed" | "altitude";
  status: DigitalClearanceStatus;
  authority: string;
  revision: number;
  createdAtSeconds: number;
  issuedAtSeconds?: number;
  responseDueSeconds?: number;
  respondedAtSeconds?: number;
  route: string[];
  parameters: Record<string, string | number>;
  detail: string;
  warningCount: number;
}

export interface DigitalClearanceSnapshot {
  schemaVersion: 1;
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
    .sort(
      (first, second) =>
        statusRank(second.status) - statusRank(first.status) ||
        second.createdAtSeconds - first.createdAtSeconds ||
        first.callsign.localeCompare(second.callsign),
    );
  const counts = emptyCounts();
  for (const message of messages) counts[message.status] += 1;
  return {
    schemaVersion: 1,
    generatedAtSeconds: state.elapsed,
    messages,
    counts,
  };
}

function flightDigitalClearanceMessages(flight: Flight): DigitalClearanceMessage[] {
  const messages: DigitalClearanceMessage[] = [];
  const route = flight.navigation.routeClearance;
  if (route) messages.push(routeClearanceMessage(flight, route));

  const vector = flight.navigation.vector;
  if (
    vector &&
    flight.progress <= vector.endProgress + 0.02 &&
    !flight.goAround &&
    !flight.diversion
  ) {
    messages.push({
      id: `vector:${flight.id}:${vector.issuedAtSeconds}`,
      flightId: flight.id,
      callsign: flight.callsign,
      kind: "vector",
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
      detail: vector.rejoinFixId
        ? `Fly heading ${Math.round(vector.headingDegrees)}°; rejoin ${vector.rejoinFixId}.`
        : `Fly heading ${Math.round(vector.headingDegrees)}° as assigned.`,
      warningCount: 0,
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
      detail: `Hold ${hold.fixId} ${hold.turns} turns; expect further clearance at ${Math.ceil(hold.expectFurtherClearanceAtSeconds)}s.`,
      warningCount: 0,
    });
  }

  if (
    flight.navigation.assignedSpeedKts !== undefined &&
    !flight.motion.onGround &&
    !flight.goAround &&
    !flight.diversion
  ) {
    const speed = Math.round(flight.navigation.assignedSpeedKts);
    messages.push(instructionMessage(flight, "speed", speed, `Maintain ${speed} knots.`));
  }
  if (
    flight.navigation.assignedAltitudeFt !== undefined &&
    !flight.motion.onGround &&
    !flight.goAround &&
    !flight.diversion
  ) {
    const altitude = Math.round(flight.navigation.assignedAltitudeFt);
    messages.push(instructionMessage(flight, "altitude", altitude, `Maintain ${altitude.toLocaleString()} feet.`));
  }
  return messages;
}

function instructionMessage(
  flight: Flight,
  kind: "speed" | "altitude",
  value: number,
  detail: string,
): DigitalClearanceMessage {
  const issuedAtSeconds = flight.navigation.vector?.issuedAtSeconds ?? 0;
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
    detail,
    warningCount: 0,
  };
}

function routeClearanceMessage(
  flight: Flight,
  clearance: FlightRouteClearanceState,
): DigitalClearanceMessage {
  return {
    id: `route:${flight.id}:${clearance.revision}`,
    flightId: flight.id,
    callsign: flight.callsign,
    kind: "route-amendment",
    status: routeStatus(clearance),
    authority: clearance.issuedBy,
    revision: clearance.revision,
    createdAtSeconds: clearance.previewedAtSeconds,
    issuedAtSeconds: clearance.issuedAtSeconds,
    responseDueSeconds: clearance.readbackDueSeconds,
    respondedAtSeconds: clearance.respondedAtSeconds,
    route: [...clearance.routeFixNames],
    parameters: {
      distanceNm: Number(clearance.distanceNm.toFixed(1)),
      estimatedSeconds: Math.round(clearance.estimatedSeconds),
    },
    detail:
      clearance.reason ??
      clearance.warnings[0]?.detail ??
      "Route proposal awaiting controller action.",
    warningCount: clearance.warnings.length,
  };
}

function routeStatus(
  clearance: FlightRouteClearanceState,
): DigitalClearanceStatus {
  if (clearance.status === "preview") return "draft";
  if (clearance.status === "pending-readback") return "delivered";
  if (clearance.status === "accepted") return "wilco";
  if (clearance.status === "rejected") return "unable";
  return /superseded/i.test(clearance.reason ?? "")
    ? "superseded"
    : "cancelled";
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
    delivered: 9,
    unable: 8,
    draft: 7,
    standby: 6,
    sent: 5,
    "timed-out": 4,
    superseded: 3,
    cancelled: 2,
    wilco: 1,
  }[status];
}

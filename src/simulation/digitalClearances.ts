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
  kind: "route-amendment";
  status: DigitalClearanceStatus;
  authority: string;
  revision: number;
  createdAtSeconds: number;
  issuedAtSeconds?: number;
  responseDueSeconds?: number;
  respondedAtSeconds?: number;
  route: string[];
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
    .flatMap((flight) => {
      const clearance = flight.navigation.routeClearance;
      return clearance ? [routeClearanceMessage(flight, clearance)] : [];
    })
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

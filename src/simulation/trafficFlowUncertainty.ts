import type { AirportConfig } from "./airportConfig";
import type { OperationQueueSnapshot } from "./operationQueues";
import type { AirportState } from "./types";
import type { TrafficFlowUncertainty } from "./trafficFlowManagement";

export interface DirectionalTrafficFlowUncertainty {
  arrival: Pick<
    TrafficFlowUncertainty,
    "procedure" | "taxiCongestion" | "gateReadiness" | "downstreamSaturation"
  >;
  departure: Pick<
    TrafficFlowUncertainty,
    "procedure" | "taxiCongestion" | "gateReadiness" | "downstreamSaturation"
  >;
}

/**
 * Derives bounded forecast uncertainty from authoritative surface and stand
 * state. These factors adjust only forecast confidence/capacity; they never
 * reserve pavement, change a meter slot, or move an entity.
 */
export function deriveTrafficFlowOperationalUncertainty(
  config: AirportConfig,
  state: AirportState,
  queues: OperationQueueSnapshot,
): DirectionalTrafficFlowUncertainty {
  const taxiing = state.flights.filter(
    (flight) => flight.phase === "taxi-in" || flight.phase === "taxi-out",
  );
  const inboundTaxi = taxiing.filter((flight) => flight.phase === "taxi-in");
  const outboundTaxi = taxiing.filter((flight) => flight.phase === "taxi-out");
  const surfaceQueues = queues.entries.filter(
    (entry) =>
      entry.category === "ramp" ||
      entry.category === "taxi" ||
      entry.category === "crossing",
  );
  const queuePressure = surfaceQueues.reduce(
    (sum, entry) =>
      sum +
      (entry.priority === "blocked"
        ? 1.5
        : entry.priority === "attention"
          ? 1
          : 0.5),
    0,
  );
  const oldestSurfaceWait = Math.max(
    0,
    ...surfaceQueues.map((entry) => entry.waitSeconds),
  );
  const sharedTaxiPressure = clamp01(
    queuePressure / Math.max(6, taxiing.length * 2.5) +
      Math.min(0.2, oldestSurfaceWait / 900),
  );
  const arrivalTaxiPressure = clamp01(
    sharedTaxiPressure * 0.7 +
      surfaceShare(
        surfaceQueues,
        inboundTaxi.map((flight) => flight.id),
      ) *
        0.3,
  );
  const departureTaxiPressure = clamp01(
    sharedTaxiPressure * 0.7 +
      surfaceShare(
        surfaceQueues,
        outboundTaxi.map((flight) => flight.id),
      ) *
        0.3,
  );

  const committedStandIds = new Set(
    state.flights.flatMap((flight) => (flight.standId ? [flight.standId] : [])),
  );
  const standCommitment = clamp01(
    committedStandIds.size / Math.max(1, config.surfaceGraph.stands.length),
  );
  const gateQueuePressure = clamp01(queues.counts.gate / 4);
  const arrivalGateUncertainty = clamp01(
    Math.max(0, (standCommitment - 0.55) / 0.45) * 0.8 +
      gateQueuePressure * 0.35,
  );
  const parked = state.flights.filter((flight) => flight.phase === "resting");
  const incompleteTurns = parked.filter(
    (flight) => flight.turnaround.status !== "ready",
  ).length;
  const departureGateUncertainty = clamp01(
    (incompleteTurns / Math.max(1, parked.length)) * 0.55 +
      gateQueuePressure * 0.35 +
      Math.max(0, standCommitment - 0.8) * 0.5,
  );
  const runwayTransitionPressure = state.runwayConfigurationTransition
    ? Math.min(
        0.3,
        0.1 +
          state.runwayConfigurationTransition.blockingFlightIds.length * 0.05,
      )
    : 0;
  const arrivalProcedureUncertainty = procedureUncertainty(
    state.flights.filter(
      (flight) => flight.phase === "approach" || flight.phase === "landing",
    ),
    runwayTransitionPressure,
  );
  const departureProcedureUncertainty = procedureUncertainty(
    state.flights.filter(
      (flight) => flight.phase === "taxi-out" || flight.phase === "takeoff",
    ),
    runwayTransitionPressure,
  );
  const downstreamQueues = queues.entries.filter(
    (entry) => entry.category === "downstream",
  );
  const downstreamPressure = clamp01(
    downstreamQueues.length / 4 +
      Math.min(
        0.25,
        Math.max(0, ...downstreamQueues.map((entry) => entry.waitSeconds)) /
          900,
      ),
  );
  const arrivalDownstreamUncertainty = clamp01(
    downstreamPressure * 0.6 +
      surfaceShare(
        downstreamQueues,
        state.flights
          .filter(
            (flight) =>
              flight.phase === "approach" ||
              flight.phase === "landing" ||
              flight.phase === "taxi-in",
          )
          .map((flight) => flight.id),
      ) *
        0.4,
  );
  const departureDownstreamUncertainty = clamp01(
    downstreamPressure * 0.6 +
      surfaceShare(
        downstreamQueues,
        state.flights
          .filter(
            (flight) =>
              flight.phase === "resting" ||
              flight.phase === "taxi-out" ||
              flight.phase === "takeoff",
          )
          .map((flight) => flight.id),
      ) *
        0.4,
  );

  return {
    arrival: {
      procedure: round(arrivalProcedureUncertainty),
      taxiCongestion: round(arrivalTaxiPressure),
      gateReadiness: round(arrivalGateUncertainty),
      downstreamSaturation: round(arrivalDownstreamUncertainty),
    },
    departure: {
      procedure: round(departureProcedureUncertainty),
      taxiCongestion: round(departureTaxiPressure),
      gateReadiness: round(departureGateUncertainty),
      downstreamSaturation: round(departureDownstreamUncertainty),
    },
  };
}

function procedureUncertainty(
  flights: AirportState["flights"],
  runwayTransitionPressure: number,
): number {
  if (!flights.length) return runwayTransitionPressure;
  const complexity = flights.reduce((sum, flight) => {
    const readback = flight.navigation.routeClearance?.status;
    return (
      sum +
      Math.min(0.3, Math.max(0, flight.flightPlan.revision - 1) * 0.08) +
      (readback === "sent" || readback === "pending-readback" || readback === "preview" ? 0.25 : 0) +
      (readback === "rejected" ? 0.35 : 0) +
      (flight.navigation.hold ? 0.2 : 0) +
      (flight.goAround ? 0.3 : 0)
    );
  }, 0);
  return clamp01(complexity / flights.length + runwayTransitionPressure);
}

function surfaceShare(
  entries: OperationQueueSnapshot["entries"],
  flightIds: readonly number[],
): number {
  if (!flightIds.length) return 0;
  const ids = new Set(flightIds);
  return clamp01(
    entries.filter(
      (entry) =>
        (entry.flightId !== undefined && ids.has(entry.flightId)) ||
        entry.blockerFlightIds.some((flightId) => ids.has(flightId)),
    ).length / flightIds.length,
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

import type { AirportConfig, RunwayOperationalRole } from "./airportConfig";
import type { OperationQueueSnapshot } from "./operationQueues";
import { activeRunwayDesignation } from "./runwayGeometry";
import { runwayClosedByDisruption } from "./surfaceDisruptions";
import type { AirportState, TrafficFlowConstraintCategory } from "./types";
import type { TrafficFlowCapacityAttribution } from "./trafficFlowManagement";

export interface DirectionalTrafficFlowCapacityAttribution {
  arrival: TrafficFlowCapacityAttribution;
  departure: TrafficFlowCapacityAttribution;
}

/** Read-only explanation of the runway and queue inputs behind each forecast. */
export function deriveTrafficFlowCapacityAttribution(
  config: AirportConfig,
  state: AirportState,
  queues: OperationQueueSnapshot,
  input: {
    arrivalSpacingSeconds: number;
    departureSpacingSeconds: number;
    approachCapacity: number;
  },
): DirectionalTrafficFlowCapacityAttribution {
  const configuration =
    config.runwayConfigurations.find(
      (candidate) => candidate.id === state.runwayConfigurationId,
    ) ?? config.runwayConfigurations[0];
  return {
    arrival: attribution(
      config,
      state,
      queues,
      "arrival",
      configuration?.id ?? state.runwayConfigurationId,
      configuration?.name ?? "Active runway plan",
      input.arrivalSpacingSeconds,
      input.approachCapacity,
    ),
    departure: attribution(
      config,
      state,
      queues,
      "departure",
      configuration?.id ?? state.runwayConfigurationId,
      configuration?.name ?? "Active runway plan",
      input.departureSpacingSeconds,
      0,
    ),
  };
}

function attribution(
  config: AirportConfig,
  state: AirportState,
  queues: OperationQueueSnapshot,
  direction: "arrival" | "departure",
  configurationId: string,
  configurationName: string,
  nominalSpacingSeconds: number,
  approachCapacity: number,
): TrafficFlowCapacityAttribution {
  const runways = config.runways
    .filter((runway) =>
      roleSupports(runwayRole(state, runway.id, runway.role), direction),
    )
    .map((runway) => ({
      id: runway.id,
      designation: activeRunwayDesignation(
        config,
        state.activeRunwayEnds,
        runway.id,
      ),
      role: runwayRole(state, runway.id, runway.role) as
        "arrival" | "departure" | "mixed",
      closed: runwayClosedByDisruption(state.surfaceDisruptions, runway.id),
    }));
  const categories =
    direction === "arrival"
      ? (["weather", "runway", "wake", "gate", "downstream"] as const)
      : ([
          "runway",
          "wake",
          "ramp",
          "taxi",
          "crossing",
          "gate",
          "downstream",
        ] as const);
  const constraints = categories.flatMap((category) => {
    const entries = queues.entries.filter(
      (entry) => entry.category === category,
    );
    if (!entries.length) return [];
    return [
      {
        category: flowConstraintCategory(category),
        label: constraintLabel(category),
        count: entries.length,
        oldestWaitSeconds: round(
          Math.max(0, ...entries.map((entry) => entry.waitSeconds)),
        ),
      },
    ];
  });
  return {
    schemaVersion: 1,
    configurationId,
    configurationName,
    runways,
    usableRunwayCount: runways.filter((runway) => !runway.closed).length,
    nominalSpacingSeconds: round(nominalSpacingSeconds),
    approachCapacity:
      direction === "arrival" ? Math.max(1, approachCapacity) : 0,
    constraints,
  };
}

function runwayRole(
  state: AirportState,
  runwayId: number,
  fallback: RunwayOperationalRole,
): RunwayOperationalRole {
  return state.activeRunwayRoles[runwayId] ?? fallback;
}

function roleSupports(
  role: RunwayOperationalRole,
  direction: "arrival" | "departure",
): boolean {
  return role === "mixed" || role === direction;
}

function flowConstraintCategory(
  category: OperationQueueSnapshot["entries"][number]["category"],
): TrafficFlowConstraintCategory {
  if (
    category === "weather" ||
    category === "runway" ||
    category === "wake" ||
    category === "gate"
  )
    return category;
  if (category === "ramp" || category === "taxi" || category === "crossing")
    return "taxi";
  return "demand";
}

function constraintLabel(
  category: OperationQueueSnapshot["entries"][number]["category"],
): string {
  if (category === "downstream") return "Downstream saturation";
  if (category === "ramp") return "Ramp congestion";
  if (category === "crossing") return "Runway crossings";
  return `${category[0].toUpperCase()}${category.slice(1)} pressure`;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

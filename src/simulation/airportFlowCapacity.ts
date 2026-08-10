import type {
  AirportConfig,
  AirportRunwayConfiguration,
  RunwayOperationalRole,
} from "./airportConfig";
import { runwaysConflict } from "./runwayConflict";

export type AirportFlowDirection = "arrival" | "departure";

export interface AirportFlowCapacityConstraint {
  id: string;
  resource:
    | "runway-system"
    | "terminal-airspace"
    | "surface-network"
    | "stand-system";
  direction: AirportFlowDirection | "both";
  modeledCapacity: number;
  unit: "simultaneous-movements" | "positions" | "streams";
  rationale: string;
}

/**
 * Deterministic, game-scale capacity inputs derived from the airport's own
 * runway, procedure, and surface programs. These are planning caps, never a
 * substitute for separation, clearances, or movement-area reservations.
 */
export interface AirportFlowCapacityProfile {
  schemaVersion: 1;
  id: string;
  airportCode: string;
  dataVersion: string;
  fidelity: "sourced-surface-hybrid" | "schematic";
  nonNavigational: true;
  structural: {
    runwayCount: number;
    runwayConfigurationCount: number;
    namedTaxiwayCount: number;
    surfaceEdgeCount: number;
    runwayCrossingCount: number;
    standCount: number;
    passengerFacilityCount: number;
    procedureCount: number;
    holdCount: number;
  };
  modeledLimits: {
    maximumIndependentArrivalRunways: number;
    maximumIndependentDepartureRunways: number;
    surfaceArrivalPositions: number;
    standPositions: number;
    procedureArrivalStreams: number;
    procedureDepartureStreams: number;
  };
  constraints: AirportFlowCapacityConstraint[];
  sources: Array<{
    subsystem: "operations" | "surface" | "airspace" | "runway-configuration";
    title: string;
    url?: string;
    version?: string;
  }>;
  disclosure: string;
}

const profileCache = new WeakMap<AirportConfig, AirportFlowCapacityProfile>();

export function airportFlowCapacityProfile(
  config: AirportConfig,
): AirportFlowCapacityProfile {
  const cached = profileCache.get(config);
  if (cached) return cached;
  const profile = buildAirportFlowCapacityProfile(config);
  profileCache.set(config, profile);
  return profile;
}

export function buildAirportFlowCapacityProfile(
  config: AirportConfig,
): AirportFlowCapacityProfile {
  const independentArrivalRunways = maximumConfigurationConcurrency(
    config,
    "arrival",
  );
  const independentDepartureRunways = maximumConfigurationConcurrency(
    config,
    "departure",
  );
  const standPositions = config.surfaceGraph.stands.length;
  const activeRunwayCount = config.runways.filter(
    (runway) => runway.role !== "inactive",
  ).length;
  const hasSourcedSurface = config.surfaceGraph.source?.kind === "imported";
  const surfaceArrivalPositions = hasSourcedSurface
    ? Math.max(
        6,
        Math.min(
          18,
          Math.max(Math.floor(standPositions * 0.35), activeRunwayCount * 2),
        ),
      )
    : Math.max(1, Math.min(2, standPositions));
  const arrivals = config.airspaceProgram.procedures.filter(
    (procedure) => procedure.kind === "STAR",
  );
  const departures = config.airspaceProgram.procedures.filter(
    (procedure) => procedure.kind === "SID",
  );
  const procedureArrivalStreams = Math.max(
    1,
    new Set(arrivals.flatMap((procedure) => procedure.transitions.map((item) => item.name))).size,
  );
  const procedureDepartureStreams = Math.max(
    1,
    new Set(departures.flatMap((procedure) => procedure.transitions.map((item) => item.name))).size,
  );
  const runwayCrossingCount = config.surfaceGraph.edges.filter(
    (edge) => (edge.crossedRunwayIds?.length ?? 0) > 0,
  ).length;
  const surfaceProvider = config.surfaceGraph.source?.provider ?? "Procedural surface graph";
  const sources: AirportFlowCapacityProfile["sources"] = [
    ...config.operationProfile.sources.map((source) => ({
      subsystem: "operations" as const,
      title: source.title,
      ...(source.url ? { url: source.url } : {}),
      ...(source.published ? { version: source.published } : {}),
    })),
    {
      subsystem: "surface" as const,
      title: surfaceProvider,
      ...(config.surfaceGraph.source?.retrievedOn
        ? { version: config.surfaceGraph.source.retrievedOn }
        : {}),
    },
    ...config.airspaceProgram.sources.map((source) => ({
      subsystem: "airspace" as const,
      title: source.title,
      url: source.url,
      version: source.retrievedOn,
    })),
    ...uniqueConfigurationSources(config.runwayConfigurations),
  ];
  const modeledLimits = {
    maximumIndependentArrivalRunways: independentArrivalRunways,
    maximumIndependentDepartureRunways: independentDepartureRunways,
    surfaceArrivalPositions,
    standPositions,
    procedureArrivalStreams,
    procedureDepartureStreams,
  };
  return {
    schemaVersion: 1,
    id: `${config.code.toLowerCase()}-flow-capacity-v1`,
    airportCode: config.code,
    dataVersion: `${config.airspaceProgram.dataVersion}:surface-${config.surfaceGraph.schemaVersion}:flow-2`,
    fidelity:
      config.surfaceGraph.source?.kind === "imported"
        ? "sourced-surface-hybrid"
        : "schematic",
    nonNavigational: true,
    structural: {
      runwayCount: config.runways.length,
      runwayConfigurationCount: config.runwayConfigurations.length,
      namedTaxiwayCount: config.surfaceGraph.taxiways.filter(
        (taxiway) => taxiway.name.trim().length > 0,
      ).length,
      surfaceEdgeCount: config.surfaceGraph.edges.length,
      runwayCrossingCount,
      standCount: standPositions,
      passengerFacilityCount: config.surfaceGraph.passengerFacilities.length,
      procedureCount: config.airspaceProgram.procedures.length,
      holdCount: config.airspaceProgram.holds.length,
    },
    modeledLimits,
    constraints: [
      {
        id: "independent-arrival-runways",
        resource: "runway-system",
        direction: "arrival",
        modeledCapacity: independentArrivalRunways,
        unit: "simultaneous-movements",
        rationale: "Largest non-conflicting arrival-runway set in a published game configuration.",
      },
      {
        id: "independent-departure-runways",
        resource: "runway-system",
        direction: "departure",
        modeledCapacity: independentDepartureRunways,
        unit: "simultaneous-movements",
        rationale: "Largest non-conflicting departure-runway set in a published game configuration.",
      },
      {
        id: "surface-arrival-buffer",
        resource: "surface-network",
        direction: "arrival",
        modeledCapacity: surfaceArrivalPositions,
        unit: "positions",
        rationale: hasSourcedSurface
          ? "Bounded admission buffer derived from stands and active runway access on the sourced surface graph."
          : "Conservative admission buffer for a schematic surface whose apron connectors converge on shared routes.",
      },
      {
        id: "stand-system",
        resource: "stand-system",
        direction: "both",
        modeledCapacity: standPositions,
        unit: "positions",
        rationale: "Assignable stand positions represented by the authoritative surface graph.",
      },
      {
        id: "arrival-procedure-streams",
        resource: "terminal-airspace",
        direction: "arrival",
        modeledCapacity: procedureArrivalStreams,
        unit: "streams",
        rationale: "Distinct schematic STAR transition streams in the versioned airspace program.",
      },
      {
        id: "departure-procedure-streams",
        resource: "terminal-airspace",
        direction: "departure",
        modeledCapacity: procedureDepartureStreams,
        unit: "streams",
        rationale: "Distinct schematic SID transition streams in the versioned airspace program.",
      },
    ],
    sources,
    disclosure:
      "Game-scale planning model derived from the airport configuration. It is not an FAA rate, a navigation product, or authority to move an aircraft.",
  };
}

export function activeConfigurationConcurrency(
  config: AirportConfig,
  configuration: AirportRunwayConfiguration | undefined,
  direction: AirportFlowDirection,
  closedRunwayIds: ReadonlySet<number> = new Set(),
): number {
  const runwayIds = config.runways
    .filter((runway) => {
      const role = configuration?.runwayRoles[runway.id] ?? runway.role;
      return roleSupports(role, direction) && !closedRunwayIds.has(runway.id);
    })
    .map((runway) => runway.id);
  return Math.max(0, maximumIndependentSet(config, runwayIds));
}

function maximumConfigurationConcurrency(
  config: AirportConfig,
  direction: AirportFlowDirection,
): number {
  return Math.max(
    1,
    ...config.runwayConfigurations.map((configuration) =>
      activeConfigurationConcurrency(config, configuration, direction),
    ),
  );
}

function maximumIndependentSet(config: AirportConfig, runwayIds: number[]): number {
  let best = 0;
  const visit = (index: number, selected: number[]): void => {
    if (selected.length + runwayIds.length - index <= best) return;
    if (index >= runwayIds.length) {
      best = Math.max(best, selected.length);
      return;
    }
    visit(index + 1, selected);
    const candidate = runwayIds[index];
    if (selected.every((runwayId) => !runwaysConflict(config, runwayId, candidate))) {
      selected.push(candidate);
      visit(index + 1, selected);
      selected.pop();
    }
  };
  visit(0, []);
  return best;
}

function roleSupports(
  role: RunwayOperationalRole,
  direction: AirportFlowDirection,
): boolean {
  return role === "mixed" || role === direction;
}

function uniqueConfigurationSources(
  configurations: AirportRunwayConfiguration[],
): AirportFlowCapacityProfile["sources"] {
  const seen = new Set<string>();
  return configurations.flatMap((configuration) => {
    const source = configuration.source;
    if (!source || seen.has(source.url)) return [];
    seen.add(source.url);
    return [{
      subsystem: "runway-configuration" as const,
      title: source.title,
      url: source.url,
      version: source.published,
    }];
  });
}

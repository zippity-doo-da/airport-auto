import { airportAutoAssetPath } from "../assets/assetManifest";
import { requireCurrentAirportAsset } from "../assets/airportAssetMigrations";
import type { AirportContextDataManifest } from "./airportContextData";
import type { AirportSurfaceDataManifest } from "./importedAirportData";
import type { AirportSurfaceGraph } from "./surfaceGraph";
import type { AirportVectorManifest } from "./airportVectorMetadata";

/**
 * Browser-facing imported-airport asset boundary. It deliberately has no
 * static airport-data imports: selecting one sourced hub can load only that
 * hub's large surface graph and its compact metadata. The synchronous
 * configuration path remains authoritative for deterministic Node tooling
 * until the browser configuration factory is migrated to this boundary.
 */
export interface LoadedAirportAssets {
  airportCode: "ATL" | "DFW" | "ORD";
  vectorData: AirportVectorManifest;
  surfaceData: AirportSurfaceDataManifest;
  contextData: AirportContextDataManifest;
  surfaceGraph: AirportSurfaceGraph;
}

type ImportedModule = { default: unknown };

const assetKeys = {
  ATL: {
    vector: "airport.ATL.vector",
    surface: "airport.ATL.surface-source",
    context: "airport.ATL.context",
  },
  DFW: {
    vector: "airport.DFW.vector",
    surface: "airport.DFW.surface-source",
    context: "airport.DFW.context",
  },
  ORD: {
    vector: "airport.ORD.vector",
    surface: "airport.ORD.surface-source",
    context: "airport.ORD.context",
  },
} as const;

function isImportedAirportCode(
  airportCode: string,
): airportCode is LoadedAirportAssets["airportCode"] {
  return airportCode === "ATL" || airportCode === "DFW" || airportCode === "ORD";
}

function importAirportModules(airportCode: LoadedAirportAssets["airportCode"]): Promise<
  [ImportedModule, ImportedModule, ImportedModule, ImportedModule]
> {
  if (airportCode === "ATL")
    return Promise.all([
      import("../data/airports/KATL.manifest.json"),
      import("../data/airports/KATL.surface.manifest.json"),
      import("../data/airports/KATL.context.manifest.json"),
      import("../data/airports/KATL.surfaceGraph.mjs"),
    ]);
  if (airportCode === "DFW")
    return Promise.all([
      import("../data/airports/KDFW.manifest.json"),
      import("../data/airports/KDFW.surface.manifest.json"),
      import("../data/airports/KDFW.context.manifest.json"),
      import("../data/airports/KDFW.surfaceGraph.mjs"),
    ]);
  return Promise.all([
    import("../data/airports/KORD.manifest.json"),
    import("../data/airports/KORD.surface.manifest.json"),
    import("../data/airports/KORD.context.manifest.json"),
    import("../data/airports/KORD.surfaceGraph.mjs"),
  ]);
}

function cloneSurfaceGraph(
  source: AirportSurfaceGraph,
  seed: number,
): AirportSurfaceGraph {
  return {
    ...source,
    seed,
    source: source.source ? { ...source.source } : undefined,
    nodes: source.nodes.map((node) => ({
      ...node,
      position: [...node.position] as [number, number],
      taxiwayIds: [...node.taxiwayIds],
    })),
    edges: source.edges.map((edge) => ({
      ...edge,
      crossedRunwayIds: edge.crossedRunwayIds
        ? [...edge.crossedRunwayIds]
        : undefined,
      sourceWayIds: edge.sourceWayIds ? [...edge.sourceWayIds] : undefined,
      crossingIds: edge.crossingIds ? [...edge.crossingIds] : undefined,
    })),
    taxiways: source.taxiways.map((taxiway) => ({
      ...taxiway,
      edgeIds: [...taxiway.edgeIds],
    })),
    stands: source.stands.map((stand) => ({
      ...stand,
      position: [...stand.position] as [number, number],
      supportedCategories: [...stand.supportedCategories],
    })),
    passengerFacilities: source.passengerFacilities.map((facility) => ({
      ...facility,
      center: [...facility.center] as [number, number],
      concourses: facility.concourses ? [...facility.concourses] : undefined,
      sections: facility.sections ? [...facility.sections] : undefined,
      sourceElementIds: [...facility.sourceElementIds],
      standIds: [...facility.standIds],
    })),
    passengerFacilityReference: source.passengerFacilityReference
      ? {
          ...source.passengerFacilityReference,
          terminals: source.passengerFacilityReference.terminals.map(
            (terminal) => ({
              ...terminal,
              concourses: terminal.concourses.map((concourse) => ({
                ...concourse,
                sections: concourse.sections
                  ? [...concourse.sections]
                  : undefined,
              })),
            }),
          ),
        }
      : undefined,
    runwayAccess: source.runwayAccess.map((access) => ({ ...access })),
    controlPoints: source.controlPoints.map((point) => ({
      ...point,
      position: [...point.position] as [number, number],
    })),
    zones: source.zones.map((zone) => ({
      ...zone,
      sourceFeatureIds: [...zone.sourceFeatureIds],
      rings: zone.rings.map((ring) =>
        ring.map((point) => [...point] as [number, number]),
      ),
      edgeIds: [...zone.edgeIds],
      standIds: [...zone.standIds],
    })),
    hotspots: source.hotspots.map((hotspot) => ({
      ...hotspot,
      rings: hotspot.rings.map((ring) =>
        ring.map((point) => [...point] as [number, number]),
      ),
      nodeIds: [...hotspot.nodeIds],
      edgeIds: [...hotspot.edgeIds],
    })),
  };
}

export async function loadImportedAirportAssets(
  airportCode: string,
  seed: number,
): Promise<LoadedAirportAssets | undefined> {
  if (!isImportedAirportCode(airportCode)) return undefined;
  const [vectorModule, surfaceManifestModule, contextModule, graphModule] =
    await importAirportModules(airportCode);
  const keys = assetKeys[airportCode];
  const vectorData = {
    ...(requireCurrentAirportAsset(
      "vector-manifest",
      vectorModule.default,
    ) as unknown as AirportVectorManifest),
    assetPath: airportAutoAssetPath(keys.vector),
  };
  const surfaceData = {
    ...(requireCurrentAirportAsset(
      "surface-manifest",
      surfaceManifestModule.default,
    ) as unknown as AirportSurfaceDataManifest),
    assetPath: airportAutoAssetPath(keys.surface),
  };
  const contextData = {
    ...(requireCurrentAirportAsset(
      "context-manifest",
      contextModule.default,
    ) as unknown as AirportContextDataManifest),
    assetPath: airportAutoAssetPath(keys.context),
  };
  const graph = requireCurrentAirportAsset(
    "surface-graph",
    graphModule.default,
  ) as unknown as AirportSurfaceGraph;
  return {
    airportCode,
    vectorData,
    surfaceData,
    contextData,
    surfaceGraph: cloneSurfaceGraph(graph, seed),
  };
}

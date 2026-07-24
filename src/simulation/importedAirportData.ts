import kordSurfaceGraphJson from '../data/airports/KORD.surfaceGraph.mjs';
import kordSurfaceManifestJson from '../data/airports/KORD.surface.manifest.json';
import type { AirportSurfaceGraph } from './surfaceGraph';

export interface AirportSurfaceDataManifest {
  schemaVersion: 2;
  airport: {
    faaId: string;
    icaoId: string;
    name: string;
    fidelity: 'faa-airport-mapping';
    navigationUse: false;
  };
  assetPath: string;
  graphPath: string;
  assetSha256: string;
  graphSha256: string;
  retrievedOn: string;
  coordinateSystem: {
    source: 'EPSG:4326';
    local: 'local-tangent-plane';
    originWgs84: [number, number];
    axes: { x: 'east'; y: 'north' };
    unit: 'meter';
    earthRadiusMeters: number;
    coordinatePrecisionMeters: number;
  };
  source: {
    provider: 'OpenStreetMap';
    endpoint: string;
    query: string;
    osmBaseTimestamp: string | null;
    license: string;
    attribution: string;
    copyrightUrl: string;
  };
  counts: Record<string, number>;
  validationRules: { minimumBuildingClearanceMeters: number };
  license: string;
  attribution: string;
  copyrightUrl: string;
}

const KORD_SURFACE_MANIFEST = kordSurfaceManifestJson as unknown as AirportSurfaceDataManifest;
const KORD_SURFACE_GRAPH = kordSurfaceGraphJson as unknown as AirportSurfaceGraph;

export function airportSurfaceDataManifest(airportCode: string): AirportSurfaceDataManifest | undefined {
  return airportCode === 'ORD' ? KORD_SURFACE_MANIFEST : undefined;
}

export function importedAirportSurfaceGraph(airportCode: string, seed: number): AirportSurfaceGraph | undefined {
  if (airportCode !== 'ORD') return undefined;
  return {
    ...KORD_SURFACE_GRAPH,
    seed,
    source: KORD_SURFACE_GRAPH.source ? { ...KORD_SURFACE_GRAPH.source } : undefined,
    nodes: KORD_SURFACE_GRAPH.nodes.map((node) => ({
      ...node,
      position: [...node.position] as [number, number],
      taxiwayIds: [...node.taxiwayIds],
    })),
    edges: KORD_SURFACE_GRAPH.edges.map((edge) => ({
      ...edge,
      crossedRunwayIds: edge.crossedRunwayIds ? [...edge.crossedRunwayIds] : undefined,
      sourceWayIds: edge.sourceWayIds ? [...edge.sourceWayIds] : undefined,
      crossingIds: edge.crossingIds ? [...edge.crossingIds] : undefined,
    })),
    taxiways: KORD_SURFACE_GRAPH.taxiways.map((taxiway) => ({ ...taxiway, edgeIds: [...taxiway.edgeIds] })),
    stands: KORD_SURFACE_GRAPH.stands.map((stand) => ({
      ...stand,
      position: [...stand.position] as [number, number],
      supportedCategories: [...stand.supportedCategories],
    })),
    runwayAccess: KORD_SURFACE_GRAPH.runwayAccess.map((access) => ({ ...access })),
    controlPoints: KORD_SURFACE_GRAPH.controlPoints.map((point) => ({ ...point, position: [...point.position] as [number, number] })),
    zones: KORD_SURFACE_GRAPH.zones.map((zone) => ({
      ...zone,
      sourceFeatureIds: [...zone.sourceFeatureIds],
      rings: zone.rings.map((ring) => ring.map((point) => [...point] as [number, number])),
      edgeIds: [...zone.edgeIds],
      standIds: [...zone.standIds],
    })),
    hotspots: KORD_SURFACE_GRAPH.hotspots.map((hotspot) => ({
      ...hotspot,
      rings: hotspot.rings.map((ring) => ring.map((point) => [...point] as [number, number])),
      nodeIds: [...hotspot.nodeIds],
      edgeIds: [...hotspot.edgeIds],
    })),
  };
}

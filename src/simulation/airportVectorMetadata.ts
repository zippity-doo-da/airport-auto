import kordManifestJson from "../data/airports/KORD.manifest.json";

export interface AirportVectorSourceMetadata {
  layer: string;
  itemId: string;
  title: string;
  owner: string;
  modifiedAt: string;
  effective: { from: string; to: string } | null;
  sourceUrl: string;
  license: string;
  attribution: string;
}

export interface AirportVectorManifest {
  schemaVersion: 1;
  airport: {
    faaId: string;
    icaoId: string;
    name: string;
    fidelity: "faa-airport-mapping";
    navigationUse: false;
  };
  assetPath: string;
  assetSha256: string;
  retrievedOn: string;
  effective: { from: string; to: string } | null;
  coordinateSystem: {
    source: "EPSG:4326";
    local: "local-tangent-plane";
    originWgs84: [number, number];
    axes: { x: "east"; y: "north" };
    unit: "meter";
    earthRadiusMeters: number;
    coordinatePrecisionMeters: number;
  };
  boundsMeters: { min: [number, number]; max: [number, number] };
  attribution: string;
  layerCounts: Record<string, number>;
  sources: AirportVectorSourceMetadata[];
}

const KORD_MANIFEST = kordManifestJson as unknown as AirportVectorManifest;

export function airportVectorManifest(
  airportCode: string,
): AirportVectorManifest | undefined {
  return airportCode === "ORD" ? KORD_MANIFEST : undefined;
}

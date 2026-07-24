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
  runtimeReference: {
    worldMetersPerUnit: number;
    terminal: [number, number];
    controlTower: [number, number] | null;
    runways: Array<{
      runwayId: string;
      designation: [string, string];
      role: "arrival" | "departure" | "mixed" | "inactive";
      center: [number, number];
      heading: number;
      length: number;
      width: number;
      sourceLengthMeters: number;
      sourceWidthMeters: number;
    }>;
    aprons: Array<{
      id: string;
      designator: string | null;
      rings: Array<Array<[number, number]>>;
    }>;
    obstacles: Array<{
      id: string;
      kind: "terminal" | "control-tower" | "building";
      label: string;
      shape: "polygon";
      center: [number, number];
      points: Array<[number, number]>;
      minimumAltitude: number;
      maximumAltitude: number;
      clearance: number;
    }>;
  };
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

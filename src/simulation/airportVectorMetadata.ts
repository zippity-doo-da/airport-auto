import kordManifestJson from "../data/airports/KORD.manifest.json";
import katlManifestJson from "../data/airports/KATL.manifest.json";
import kdfwManifestJson from "../data/airports/KDFW.manifest.json";
import { airportAutoAssetPath } from "../assets/assetManifest";
import { requireCurrentAirportAsset } from "../assets/airportAssetMigrations";

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

const KORD_MANIFEST = {
  ...(requireCurrentAirportAsset(
    "vector-manifest",
    kordManifestJson,
  ) as unknown as AirportVectorManifest),
  assetPath: airportAutoAssetPath("airport.ORD.vector"),
};

const KATL_MANIFEST = {
  ...(requireCurrentAirportAsset(
    "vector-manifest",
    katlManifestJson,
  ) as unknown as AirportVectorManifest),
  assetPath: airportAutoAssetPath("airport.ATL.vector"),
};

const KDFW_MANIFEST = {
  ...(requireCurrentAirportAsset(
    "vector-manifest",
    kdfwManifestJson,
  ) as unknown as AirportVectorManifest),
  assetPath: airportAutoAssetPath("airport.DFW.vector"),
};

export function airportVectorManifest(
  airportCode: string,
): AirportVectorManifest | undefined {
  if (airportCode === "ORD") return KORD_MANIFEST;
  if (airportCode === "ATL") return KATL_MANIFEST;
  if (airportCode === "DFW") return KDFW_MANIFEST;
  return undefined;
}

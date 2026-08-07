import manifestJson from "./airport-auto-assets.json";
import { requireCurrentAirportAsset } from "./airportAssetMigrations";

export const ASSET_MANIFEST_SCHEMA_VERSION = 1 as const;

export type AirportAutoAssetKey =
  | "audio.soundscape-manifest"
  | "airport.ATL.vector"
  | "airport.ATL.surface-source"
  | "airport.ATL.context"
  | "airport.DFW.vector"
  | "airport.DFW.surface-source"
  | "airport.DFW.context"
  | "airport.ORD.vector"
  | "airport.ORD.surface-source"
  | "airport.ORD.context";

export type AirportAutoAssetKind =
  | "audio-manifest"
  | "airport-vector"
  | "airport-surface-source"
  | "airport-context";

export interface AirportAutoAssetEntry {
  key: AirportAutoAssetKey;
  kind: AirportAutoAssetKind;
  path: string;
  contentType: "application/json";
  sha256: string;
  offlineRequired: boolean;
  licenseRef: string;
}

export interface AirportAutoAssetManifest {
  schemaVersion: typeof ASSET_MANIFEST_SCHEMA_VERSION;
  manifestId: "airport-auto-assets";
  applicationVersion: string;
  basePath: "./";
  generatedBundlesArePublicApi: false;
  assets: AirportAutoAssetEntry[];
}

const ASSET_MANIFEST = requireCurrentAirportAsset(
  "stable-manifest",
  manifestJson,
) as unknown as AirportAutoAssetManifest;
const ASSET_BY_KEY = new Map(
  ASSET_MANIFEST.assets.map((asset) => [asset.key, asset]),
);

export function airportAutoAssetManifest(): AirportAutoAssetManifest {
  return {
    ...ASSET_MANIFEST,
    assets: ASSET_MANIFEST.assets.map((asset) => ({ ...asset })),
  };
}

export function airportAutoAsset(
  key: AirportAutoAssetKey,
): AirportAutoAssetEntry {
  const asset = ASSET_BY_KEY.get(key);
  if (!asset) throw new Error(`Unknown Airport Auto asset key: ${key}`);
  return { ...asset };
}

export function airportAutoAssetPath(key: AirportAutoAssetKey): string {
  return airportAutoAsset(key).path;
}

export function airportAutoAssetUrl(
  key: AirportAutoAssetKey,
  baseUri: string,
): URL {
  return new URL(airportAutoAssetPath(key), baseUri);
}

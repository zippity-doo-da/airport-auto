import kordContextManifestJson from '../data/airports/KORD.context.manifest.json';
import katlContextManifestJson from '../data/airports/KATL.context.manifest.json';
import { airportAutoAssetPath } from '../assets/assetManifest';
import { requireCurrentAirportAsset } from '../assets/airportAssetMigrations';

export interface AirportContextDataManifest {
  schemaVersion: 1;
  airport: {
    faaId: string;
    icaoId: string;
    name: string;
    fidelity: 'faa-airport-mapping';
    navigationUse: false;
  };
  assetPath: string;
  assetSha256: string;
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
  boundsMeters: { min: [number, number]; max: [number, number] };
  source: {
    provider: 'OpenStreetMap';
    endpoint: string;
    queries: Record<'roads' | 'transport' | 'areas', string>;
    osmBaseTimestamp: string | null;
    license: string;
    attribution: string;
    copyrightUrl: string;
  };
  counts: {
    roads: number;
    roadPoints: number;
    rails: number;
    railPoints: number;
    waterways: number;
    waterwayPoints: number;
    areas: number;
    areaPoints: number;
    boundaryRings: number;
    boundaryPoints: number;
  };
  license: string;
  attribution: string;
  copyrightUrl: string;
}

const KORD_CONTEXT_MANIFEST = {
  ...(requireCurrentAirportAsset(
    'context-manifest',
    kordContextManifestJson,
  ) as unknown as AirportContextDataManifest),
  assetPath: airportAutoAssetPath('airport.ORD.context'),
};

const KATL_CONTEXT_MANIFEST = {
  ...(requireCurrentAirportAsset(
    'context-manifest',
    katlContextManifestJson,
  ) as unknown as AirportContextDataManifest),
  assetPath: airportAutoAssetPath('airport.ATL.context'),
};

export function airportContextDataManifest(airportCode: string): AirportContextDataManifest | undefined {
  if (airportCode === 'ORD') return KORD_CONTEXT_MANIFEST;
  if (airportCode === 'ATL') return KATL_CONTEXT_MANIFEST;
  return undefined;
}

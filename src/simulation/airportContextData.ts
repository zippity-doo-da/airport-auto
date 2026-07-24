import kordContextManifestJson from '../data/airports/KORD.context.manifest.json';

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

const KORD_CONTEXT_MANIFEST = kordContextManifestJson as unknown as AirportContextDataManifest;

export function airportContextDataManifest(airportCode: string): AirportContextDataManifest | undefined {
  return airportCode === 'ORD' ? KORD_CONTEXT_MANIFEST : undefined;
}

export type RouteDistanceSource = "great-circle" | "traffic-class-estimate";

export type RouteTrafficClass =
  "passenger" | "regional" | "cargo" | "general-aviation";

export interface RouteDistanceEstimate {
  distanceNm: number;
  source: RouteDistanceSource;
}

type AirportCoordinate = readonly [
  latitudeDegrees: number,
  longitudeDegrees: number,
];

/**
 * Coordinates are used only for deterministic game-scale planning. They are
 * not navigation data and deliberately cover the markets represented by the
 * current hub programs rather than pretending to be a global airport source.
 */
const AIRPORT_COORDINATES: Readonly<Record<string, AirportCoordinate>> = {
  AMS: [52.3105, 4.7683],
  ANC: [61.1743, -149.9985],
  ATL: [33.6407, -84.4277],
  BOM: [19.0896, 72.8656],
  BOS: [42.3656, -71.0096],
  CDG: [49.0097, 2.5479],
  DEN: [39.8561, -104.6737],
  DEL: [28.5562, 77.1],
  DFW: [32.8998, -97.0403],
  DOH: [25.2731, 51.6081],
  DUB: [53.4264, -6.2499],
  DXB: [25.2532, 55.3657],
  EMA: [52.8311, -1.3281],
  EWR: [40.6895, -74.1745],
  FRA: [50.0379, 8.5622],
  HND: [35.5494, 139.7798],
  HKG: [22.308, 113.9185],
  IAH: [29.9902, -95.3368],
  ICN: [37.4602, 126.4407],
  IST: [41.2753, 28.7519],
  JFK: [40.6413, -73.7781],
  KIX: [34.4347, 135.244],
  KRK: [50.0777, 19.7848],
  LAX: [33.9416, -118.4085],
  LHR: [51.47, -0.4543],
  MAD: [40.4983, -3.5676],
  MEM: [35.0424, -89.9767],
  MIA: [25.7959, -80.287],
  MCO: [28.4312, -81.3081],
  MEX: [19.4361, -99.0719],
  MUC: [48.3538, 11.7861],
  NRT: [35.772, 140.3929],
  ORD: [41.9786, -87.9048],
  SEA: [47.4502, -122.3088],
  SFO: [37.6213, -122.379],
  SDF: [38.1744, -85.736],
  SIN: [1.3644, 103.9915],
  SYD: [-33.9399, 151.1753],
  VIE: [48.1103, 16.5697],
  WAW: [52.1657, 20.9671],
  YTZ: [43.6275, -79.3962],
  YUL: [45.4706, -73.7408],
  YVR: [49.1967, -123.1815],
  YYZ: [43.6777, -79.6248],
  ZRH: [47.4581, 8.5555],
};

const LONG_HAUL_MARKETS = new Set([
  "AMS",
  "CDG",
  "DEL",
  "DOH",
  "DUB",
  "DXB",
  "FRA",
  "HKG",
  "HND",
  "ICN",
  "IST",
  "KRK",
  "LHR",
  "MAD",
  "MUC",
  "NRT",
  "SIN",
  "SYD",
  "VIE",
  "WAW",
  "ZRH",
]);

export function estimateRouteDistanceNm(
  origin: string,
  destination: string,
  trafficClass: RouteTrafficClass,
  flightId = 0,
  airportSeed = 0,
): RouteDistanceEstimate {
  const from = normalizeCode(origin);
  const to = normalizeCode(destination);
  const fromCoordinate = AIRPORT_COORDINATES[from];
  const toCoordinate = AIRPORT_COORDINATES[to];
  if (from !== to && fromCoordinate && toCoordinate) {
    // A modest route factor represents terminal routing and non-great-circle
    // airway structure without claiming dispatch-grade precision.
    return {
      distanceNm: Math.max(
        35,
        Math.round(greatCircleDistanceNm(fromCoordinate, toCoordinate) * 1.035),
      ),
      source: "great-circle",
    };
  }

  const [minimum, maximum] = fallbackRange(from, to, trafficClass);
  const unit = deterministicUnit(
    `${from}:${to}:${trafficClass}`,
    flightId,
    airportSeed,
  );
  return {
    distanceNm: Math.round(minimum + (maximum - minimum) * unit),
    source: "traffic-class-estimate",
  };
}

function fallbackRange(
  origin: string,
  destination: string,
  trafficClass: RouteTrafficClass,
): readonly [number, number] {
  if (trafficClass === "general-aviation") return [45, 360];
  if (trafficClass === "regional") return [110, 720];
  if (LONG_HAUL_MARKETS.has(origin) !== LONG_HAUL_MARKETS.has(destination))
    return [3_100, 6_900];
  if (LONG_HAUL_MARKETS.has(origin) && LONG_HAUL_MARKETS.has(destination))
    return [480, 5_400];
  if (trafficClass === "cargo") return [420, 3_250];
  return [320, 2_250];
}

function greatCircleDistanceNm(
  first: AirportCoordinate,
  second: AirportCoordinate,
): number {
  const earthRadiusNm = 3_440.065;
  const firstLatitude = degreesToRadians(first[0]);
  const secondLatitude = degreesToRadians(second[0]);
  const latitudeDelta = secondLatitude - firstLatitude;
  const longitudeDelta = degreesToRadians(second[1] - first[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    earthRadiusNm *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)))
  );
}

function deterministicUnit(
  key: string,
  flightId: number,
  airportSeed: number,
): number {
  let value = (flightId ^ airportSeed ^ 0x6d2b79f5) >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    value = Math.imul(value ^ key.charCodeAt(index), 0x45d9f3b) >>> 0;
    value = (value ^ (value >>> 16)) >>> 0;
  }
  return value / 0x1_0000_0000;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

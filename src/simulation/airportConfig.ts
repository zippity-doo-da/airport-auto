import { buildAirportSurfaceGraph, type AirportSurfaceGraph } from './surfaceGraph';
import { buildAirportObstacleEnvelopes, resolveAirportTerminal, type AirportObstacleEnvelope } from './airportObstacles';
import { airportVectorManifest, type AirportVectorManifest } from './airportVectorMetadata';

export type FlightColor = 'rose' | 'mist' | 'sage';
export type TerrainTheme = 'coast' | 'highland' | 'woodland';

export interface RunwayConfig {
  id: number;
  center: [number, number];
  heading: number;
  length: number;
  width: number;
  landingEnd: -1 | 1;
  color: FlightColor;
  role: 'arrival' | 'departure' | 'mixed' | 'inactive';
  designation?: [string, string];
}

export interface AirportConfig {
  seed: number;
  name: string;
  code: string;
  scope: 'airfield' | 'center';
  terrain: TerrainTheme;
  runwayCount: number;
  runways: RunwayConfig[];
  terminal: [number, number];
  treeCount: number;
  annualOperations: number | null;
  trafficInterval: number;
  trafficCap: number;
  vectorData?: AirportVectorManifest;
  obstacles: AirportObstacleEnvelope[];
  surfaceGraph: AirportSurfaceGraph;
}

type AirportConfigSource = Omit<AirportConfig, 'obstacles' | 'surfaceGraph'>;

type HubProfile = {
  code: string;
  name: string;
  operations: number;
  interval: number;
  terrain: TerrainTheme;
  terminal: [number, number];
  runways: Array<{ center: [number, number]; heading: number; length: number; role: RunwayConfig['role']; designation?: [string, string] }>;
};

const NAMES = ['Stillwater', 'Pineglass', 'Northmere', 'Foxhaven', 'Greywick', 'Amber Bay'];
const COLORS: FlightColor[] = ['rose', 'mist', 'sage'];

export const HUB_AIRPORTS: HubProfile[] = [
  {
    code: 'ATL', name: 'Hartsfield–Jackson Atlanta', operations: 807_625, interval: 9.5, terrain: 'woodland', terminal: [0, 7],
    runways: [
      { center: [-4, 32], heading: 0, length: 63, role: 'arrival', designation: ['08L', '26R'] },
      { center: [2, 21], heading: 0, length: 70, role: 'departure', designation: ['08R', '26L'] },
      { center: [-2, -5], heading: 0, length: 87, role: 'arrival', designation: ['09L', '27R'] },
      { center: [3, -16], heading: 0, length: 70, role: 'departure', designation: ['09R', '27L'] },
      { center: [-3, -38], heading: 0, length: 63, role: 'mixed', designation: ['10', '28'] },
    ],
  },
  {
    code: 'DXB', name: 'Dubai International', operations: 454_800, interval: 14.5, terrain: 'coast', terminal: [0, 25],
    runways: [
      { center: [7, 4], heading: -Math.PI / 3, length: 86, role: 'arrival', designation: ['12L', '30R'] },
      { center: [-7, -4], heading: -Math.PI / 3, length: 94, role: 'departure', designation: ['12R', '30L'] },
    ],
  },
  {
    code: 'HND', name: 'Tokyo Haneda', operations: 490_224, interval: 13.5, terrain: 'coast', terminal: [-4, 17],
    runways: [
      { center: [-24, 2], heading: -Math.PI / 2, length: 73, role: 'arrival', designation: ['16R', '34L'] },
      { center: [18, 4], heading: -Math.PI / 2, length: 73, role: 'departure', designation: ['16L', '34R'] },
      { center: [-10, -23], heading: Math.PI / 4, length: 58, role: 'mixed', designation: ['04', '22'] },
      { center: [37, -18], heading: Math.PI / 4, length: 53, role: 'mixed', designation: ['05', '23'] },
    ],
  },
  {
    code: 'DFW', name: 'Dallas Fort Worth', operations: 743_394, interval: 12.5, terrain: 'highland', terminal: [0, 0],
    runways: [
      { center: [-39, 0], heading: -Math.PI / 2, length: 86, role: 'arrival', designation: ['18R', '36L'] },
      { center: [-28, -2], heading: -Math.PI / 2, length: 86, role: 'departure', designation: ['18L', '36R'] },
      { center: [18, 1], heading: -Math.PI / 2, length: 86, role: 'arrival', designation: ['17R', '35L'] },
      { center: [29, -1], heading: -Math.PI / 2, length: 86, role: 'departure', designation: ['17C', '35C'] },
      { center: [40, 2], heading: -Math.PI / 2, length: 55, role: 'mixed', designation: ['17L', '35R'] },
      { center: [-27, 29], heading: -Math.PI / 4, length: 58, role: 'inactive', designation: ['13R', '31L'] },
      { center: [29, -28], heading: -Math.PI / 4, length: 60, role: 'inactive', designation: ['13L', '31R'] },
    ],
  },
  {
    code: 'ORD', name: "Chicago O’Hare", operations: 857_392, interval: 8.5, terrain: 'woodland', terminal: [72, 0],
    runways: [
      { center: [-8, 34], heading: 0, length: 53, role: 'arrival', designation: ['09L', '27R'] },
      { center: [2, 23], heading: 0, length: 79, role: 'arrival', designation: ['09C', '27C'] },
      { center: [4, 12], heading: 0, length: 79, role: 'departure', designation: ['09R', '27L'] },
      { center: [0, -10], heading: 0, length: 91, role: 'departure', designation: ['10L', '28R'] },
      { center: [3, -22], heading: 0, length: 76, role: 'arrival', designation: ['10C', '28C'] },
      { center: [-6, -34], heading: 0, length: 53, role: 'arrival', designation: ['10R', '28L'] },
      { center: [1, 4], heading: Math.PI * 0.28, length: 53, role: 'inactive', designation: ['04L', '22R'] },
      { center: [27, -19], heading: Math.PI * 0.28, length: 57, role: 'inactive', designation: ['04R', '22L'] },
    ],
  },
  {
    code: 'LHR', name: 'London Heathrow', operations: 480_005, interval: 14, terrain: 'woodland', terminal: [0, 0],
    runways: [
      { center: [-2, 22], heading: 0, length: 80, role: 'arrival', designation: ['09L', '27R'] },
      { center: [2, -22], heading: 0, length: 75, role: 'departure', designation: ['09R', '27L'] },
    ],
  },
  {
    code: 'IST', name: 'Istanbul Airport', operations: 549_309, interval: 13, terrain: 'highland', terminal: [55, 0],
    runways: [
      { center: [-40, 1], heading: -Math.PI / 2, length: 79, role: 'arrival', designation: ['16R', '34L'] },
      { center: [-29, -1], heading: -Math.PI / 2, length: 79, role: 'departure', designation: ['16L', '34R'] },
      { center: [-5, 0], heading: -Math.PI / 2, length: 86, role: 'arrival', designation: ['17R', '35L'] },
      { center: [7, 1], heading: -Math.PI / 2, length: 86, role: 'departure', designation: ['17L', '35R'] },
      { center: [35, -1], heading: -Math.PI / 2, length: 65, role: 'mixed', designation: ['18', '36'] },
    ],
  },
  {
    code: 'DEN', name: 'Denver International', operations: 701_335, interval: 12.5, terrain: 'highland', terminal: [0, 0],
    runways: [
      { center: [-38, 0], heading: -Math.PI / 2, length: 104, role: 'arrival', designation: ['16R', '34L'] },
      { center: [-25, 0], heading: -Math.PI / 2, length: 78, role: 'departure', designation: ['16L', '34R'] },
      { center: [25, 0], heading: -Math.PI / 2, length: 78, role: 'arrival', designation: ['17R', '35L'] },
      { center: [38, 0], heading: -Math.PI / 2, length: 78, role: 'departure', designation: ['17L', '35R'] },
      { center: [-2, 49], heading: 0, length: 78, role: 'mixed', designation: ['07', '25'] },
      { center: [2, -49], heading: 0, length: 78, role: 'mixed', designation: ['08', '26'] },
    ],
  },
  {
    code: 'LAX', name: 'Los Angeles International', operations: 580_996, interval: 14, terrain: 'coast', terminal: [0, 0],
    runways: [
      { center: [-4, 32], heading: 0, length: 79, role: 'arrival', designation: ['06R', '24L'] },
      { center: [3, 21], heading: 0, length: 72, role: 'departure', designation: ['06L', '24R'] },
      { center: [-3, -21], heading: 0, length: 77, role: 'departure', designation: ['07R', '25L'] },
      { center: [4, -32], heading: 0, length: 72, role: 'arrival', designation: ['07L', '25R'] },
    ],
  },
  {
    code: 'JFK', name: 'John F. Kennedy International', operations: 464_281, interval: 16, terrain: 'coast', terminal: [38, 34],
    runways: [
      { center: [-6, -13], heading: -Math.PI / 4, length: 91, role: 'departure', designation: ['13R', '31L'] },
      { center: [10, 7], heading: -Math.PI / 4, length: 63, role: 'mixed', designation: ['13L', '31R'] },
      { center: [-14, 8], heading: Math.PI / 4, length: 76, role: 'arrival', designation: ['04L', '22R'] },
      { center: [18, -9], heading: Math.PI / 4, length: 53, role: 'inactive', designation: ['04R', '22L'] },
    ],
  },
];

export function generateAirportConfig(seed = Math.floor(Math.random() * 0x7fffffff)): AirportConfig {
  const random = mulberry32(seed);
  const runwayCount = 1 + Math.floor(random() * 3);
  const quarterTurn = Math.floor(random() * 4) * Math.PI / 2;
  const layouts: Array<Array<{ center: [number, number]; heading: number }>> = [
    [{ center: [0, 3], heading: 0 }],
    [{ center: [-22, 13], heading: 0 }, { center: [25, -15], heading: Math.PI / 2 }],
    [{ center: [-25, 20], heading: 0 }, { center: [27, -9], heading: Math.PI / 2 }, { center: [-25, -24], heading: 0 }],
  ];
  const base = layouts[runwayCount - 1];
  const runways: RunwayConfig[] = base.map((item, id) => {
    const [x, y] = rotate(item.center, quarterTurn);
    return {
      id,
      center: [x, y] as [number, number],
      heading: item.heading + quarterTurn,
      length: 72 + Math.floor(random() * 9),
      width: 8.2,
      landingEnd: random() > 0.5 ? 1 as const : -1 as const,
      color: COLORS[id],
      role: runwayCount === 1 ? 'mixed' : id % 2 === 0 ? 'arrival' : 'departure',
    };
  });

  const terrain = (['coast', 'highland', 'woodland'] as TerrainTheme[])[Math.floor(random() * 3)];
  const terminalBase: [number, number] = runwayCount === 1 ? [0, -24] : [-2, -4];
  const terminal = rotate(terminalBase, quarterTurn);
  return withSurfaceGraph({
    seed,
    name: NAMES[Math.floor(random() * NAMES.length)],
    code: 'LOCAL',
    scope: 'airfield',
    terrain,
    runwayCount,
    runways,
    terminal,
    treeCount: terrain === 'woodland' ? 62 : terrain === 'highland' ? 34 : 44,
    annualOperations: null,
    trafficInterval: 7.2,
    trafficCap: 6,
  });
}

export function generateHubConfig(index = 0): AirportConfig {
  const profile = HUB_AIRPORTS[((index % HUB_AIRPORTS.length) + HUB_AIRPORTS.length) % HUB_AIRPORTS.length];
  const runways: RunwayConfig[] = profile.runways.map((runway, id) => ({
    id,
    center: runway.center,
    heading: runway.heading,
    length: runway.length,
    width: 6.4,
    landingEnd: 1,
    color: COLORS[id % COLORS.length],
    role: runway.role,
    designation: runway.designation,
  }));
  return withSurfaceGraph({
    seed: index + 10_000,
    name: profile.name,
    code: profile.code,
    scope: 'center',
    terrain: profile.terrain,
    runwayCount: runways.length,
    runways,
    terminal: profile.terminal,
    treeCount: 26,
    annualOperations: profile.operations,
    trafficInterval: profile.interval,
    trafficCap: Math.max(14, Math.round(14 + (profile.operations - 450_000) / 45_000)),
    vectorData: airportVectorManifest(profile.code),
  });
}

function withSurfaceGraph(config: AirportConfigSource): AirportConfig {
  const terminal = resolveAirportTerminal(config);
  const geometry = { ...config, terminal };
  return {
    ...geometry,
    obstacles: buildAirportObstacleEnvelopes(geometry),
    surfaceGraph: buildAirportSurfaceGraph(geometry),
  };
}

function rotate(point: [number, number], angle: number): [number, number] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [point[0] * cosine - point[1] * sine, point[0] * sine + point[1] * cosine];
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

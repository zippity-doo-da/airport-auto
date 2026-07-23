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
  islandScale: [number, number];
  annualOperations: number | null;
  trafficInterval: number;
  trafficCap: number;
}

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
    code: 'ATL', name: 'Hartsfield–Jackson Atlanta', operations: 796_224, interval: 11.5, terrain: 'woodland', terminal: [0, 43],
    runways: [
      { center: [-4, 28], heading: 0, length: 63, role: 'arrival' },
      { center: [2, 18], heading: 0, length: 70, role: 'departure' },
      { center: [-2, -4], heading: 0, length: 87, role: 'departure' },
      { center: [3, -14], heading: 0, length: 63, role: 'arrival' },
      { center: [-3, -36], heading: 0, length: 63, role: 'mixed' },
    ],
  },
  {
    code: 'ORD', name: "Chicago O’Hare", operations: 776_036, interval: 12, terrain: 'coast', terminal: [72, 0],
    runways: [
      { center: [-8, 32], heading: 0, length: 53, role: 'arrival', designation: ['09L', '27R'] },
      { center: [2, 22], heading: 0, length: 79, role: 'arrival', designation: ['09C', '27C'] },
      { center: [4, 11], heading: 0, length: 79, role: 'departure', designation: ['09R', '27L'] },
      { center: [0, -11], heading: 0, length: 91, role: 'departure', designation: ['10L', '28R'] },
      { center: [3, -23], heading: 0, length: 76, role: 'arrival', designation: ['10C', '28C'] },
      { center: [-6, -34], heading: 0, length: 53, role: 'arrival', designation: ['10R', '28L'] },
      { center: [1, 4], heading: Math.PI * 0.28, length: 53, role: 'inactive', designation: ['04L', '22R'] },
      { center: [27, -19], heading: Math.PI * 0.28, length: 57, role: 'departure', designation: ['04R', '22L'] },
    ],
  },
  {
    code: 'DFW', name: 'Dallas Fort Worth', operations: 743_203, interval: 12.5, terrain: 'highland', terminal: [43, 0],
    runways: [
      { center: [-31, 0], heading: Math.PI / 2, length: 86, role: 'arrival' },
      { center: [-20, -2], heading: Math.PI / 2, length: 86, role: 'departure' },
      { center: [8, 1], heading: Math.PI / 2, length: 86, role: 'departure' },
      { center: [20, -1], heading: Math.PI / 2, length: 86, role: 'arrival' },
      { center: [31, 2], heading: Math.PI / 2, length: 55, role: 'mixed' },
      { center: [-27, 27], heading: Math.PI / 4, length: 58, role: 'inactive' },
      { center: [27, -27], heading: Math.PI / 4, length: 60, role: 'inactive' },
    ],
  },
  {
    code: 'LAX', name: 'Los Angeles International', operations: 581_779, interval: 14, terrain: 'coast', terminal: [0, 42],
    runways: [
      { center: [-4, 27], heading: 0, length: 79, role: 'arrival' },
      { center: [3, 18], heading: 0, length: 72, role: 'departure' },
      { center: [-3, -18], heading: 0, length: 77, role: 'departure' },
      { center: [4, -27], heading: 0, length: 72, role: 'arrival' },
    ],
  },
  {
    code: 'JFK', name: 'John F. Kennedy International', operations: 455_214, interval: 16, terrain: 'coast', terminal: [38, 38],
    runways: [
      { center: [-5, -12], heading: Math.PI * 0.72, length: 91, role: 'departure' },
      { center: [8, 4], heading: Math.PI * 0.72, length: 63, role: 'mixed' },
      { center: [-12, 7], heading: Math.PI * 0.22, length: 76, role: 'inactive' },
      { center: [17, -8], heading: Math.PI * 0.22, length: 53, role: 'inactive' },
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
  return {
    seed,
    name: NAMES[Math.floor(random() * NAMES.length)],
    code: 'LOCAL',
    scope: 'airfield',
    terrain,
    runwayCount,
    runways,
    terminal,
    treeCount: terrain === 'woodland' ? 62 : terrain === 'highland' ? 34 : 44,
    islandScale: terrain === 'coast' ? [1, 0.76] : terrain === 'highland' ? [0.92, 0.84] : [1.08, 0.78],
    annualOperations: null,
    trafficInterval: 7.2,
    trafficCap: 6,
  };
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
  return {
    seed: index + 10_000,
    name: profile.name,
    code: profile.code,
    scope: 'center',
    terrain: profile.terrain,
    runwayCount: runways.length,
    runways,
    terminal: profile.terminal,
    treeCount: 26,
    islandScale: [1.22, 1.02],
    annualOperations: profile.operations,
    trafficInterval: profile.interval,
    trafficCap: Math.max(8, Math.round(8 + (profile.operations - 450_000) / 90_000)),
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

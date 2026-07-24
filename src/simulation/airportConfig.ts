import { buildAirportSurfaceGraph, type AirportSurfaceGraph } from './surfaceGraph';
import { buildAirportObstacleEnvelopes, resolveAirportTerminal, type AirportObstacleEnvelope } from './airportObstacles';
import { airportVectorManifest, type AirportVectorManifest } from './airportVectorMetadata';
import { airportSurfaceDataManifest, importedAirportSurfaceGraph, type AirportSurfaceDataManifest } from './importedAirportData';
import { airportContextDataManifest, type AirportContextDataManifest } from './airportContextData';

export type FlightColor = 'rose' | 'mist' | 'sage';
export type TerrainTheme = 'coast' | 'highland' | 'woodland';
export type RunwayOperationalRole = 'arrival' | 'departure' | 'mixed' | 'inactive';
export type RunwayProcedureClass = 'schematic' | 'parallel' | 'offset-parallel' | 'instrument-parallel' | 'crosswind-contingency';

export interface RunwayConfig {
  id: number;
  center: [number, number];
  heading: number;
  length: number;
  width: number;
  landingEnd: -1 | 1;
  color: FlightColor;
  role: RunwayOperationalRole;
  designation?: [string, string];
}

export interface RunwayConfigurationRestrictions {
  conditions: Array<'clear' | 'rain' | 'fog' | 'snow'>;
  minimumVisibilityMiles?: number;
  minimumWindSpeedKts?: number;
  preferredWindDirectionDegrees?: number;
  windDirectionToleranceDegrees?: number;
  scenarios?: Array<'normal' | 'rush' | 'storm' | 'closure' | 'training' | 'emergency'>;
  autoSelectable: boolean;
  note: string;
}

export interface RunwayConfigurationSource {
  title: string;
  url: string;
  published: string;
}

export interface AirportRunwayConfiguration {
  id: string;
  name: string;
  description: string;
  procedure: RunwayProcedureClass;
  arrivalRunwayIds: number[];
  departureRunwayIds: number[];
  operatingEnds: Record<number, -1 | 1>;
  runwayRoles: Record<number, RunwayOperationalRole>;
  restrictions: RunwayConfigurationRestrictions;
  selectionPriority: number;
  source?: RunwayConfigurationSource;
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
  surfaceData?: AirportSurfaceDataManifest;
  contextData?: AirportContextDataManifest;
  runwayConfigurations: AirportRunwayConfiguration[];
  defaultRunwayConfigurationId: string;
  obstacles: AirportObstacleEnvelope[];
  surfaceGraph: AirportSurfaceGraph;
}

type AirportConfigSource = Omit<AirportConfig, 'obstacles' | 'surfaceGraph' | 'runwayConfigurations' | 'defaultRunwayConfigurationId'>;

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
  const vectorData = airportVectorManifest(profile.code);
  const runwayProfiles = vectorData?.runtimeReference.runways ?? profile.runways;
  const runways: RunwayConfig[] = runwayProfiles.map((runway, id) => ({
    id,
    center: runway.center,
    heading: runway.heading,
    length: runway.length,
    width: vectorData ? vectorData.runtimeReference.runways[id].width : 6.4,
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
    terminal: vectorData?.runtimeReference.terminal ?? profile.terminal,
    treeCount: 26,
    annualOperations: profile.operations,
    trafficInterval: profile.interval,
    trafficCap: Math.max(14, Math.round(14 + (profile.operations - 450_000) / 45_000)),
    vectorData,
    surfaceData: airportSurfaceDataManifest(profile.code),
    contextData: airportContextDataManifest(profile.code),
  });
}

function withSurfaceGraph(config: AirportConfigSource): AirportConfig {
  const terminal = resolveAirportTerminal(config);
  const geometry = { ...config, terminal };
  const importedSurfaceGraph = importedAirportSurfaceGraph(config.code, config.seed);
  const runwayConfigurations = buildRunwayConfigurations(config.code, config.runways);
  return {
    ...geometry,
    runwayConfigurations,
    defaultRunwayConfigurationId: runwayConfigurations[0].id,
    obstacles: buildAirportObstacleEnvelopes(geometry),
    surfaceGraph: importedSurfaceGraph ?? buildAirportSurfaceGraph(geometry),
  };
}

function buildRunwayConfigurations(code: string, runways: RunwayConfig[]): AirportRunwayConfiguration[] {
  const arrivals = runways
    .filter((runway) => runway.role === 'arrival' || runway.role === 'mixed')
    .map((runway) => runway.id);
  const departures = runways
    .filter((runway) => runway.role === 'departure' || runway.role === 'mixed')
    .map((runway) => runway.id);
  const configuration = (
    id: string,
    name: string,
    description: string,
    end: -1 | 1,
  ): AirportRunwayConfiguration => ({
    id,
    name,
    description,
    procedure: 'schematic',
    arrivalRunwayIds: [...arrivals],
    departureRunwayIds: [...departures],
    operatingEnds: Object.fromEntries(runways.map((runway) => [runway.id, end])) as Record<number, -1 | 1>,
    runwayRoles: Object.fromEntries(runways.map((runway) => [runway.id, runway.role])) as Record<number, RunwayOperationalRole>,
    restrictions: {
      conditions: ['clear', 'rain', 'fog', 'snow'],
      autoSelectable: true,
      note: 'Schematic configuration available in all simulated weather.',
    },
    selectionPriority: 0,
  });
  if (code === 'ORD') {
    const source: RunwayConfigurationSource = {
      title: 'FAA O’Hare Terminal Area Plan Final Environmental Assessment, Chapter 4',
      url: 'https://www.faa.gov/sites/faa.gov/files/TAP_Final_EA_Chapter_4.pdf',
      published: '2022-11',
    };
    const runwayUtilization: RunwayConfigurationSource = {
      title: 'FAA O’Hare runway utilization',
      url: 'https://www.faa.gov/airports/airport_development/omp/faq/runway_utilization',
      published: 'current reference retrieved 2026-07-24',
    };
    const ordConfiguration = (
      id: string,
      name: string,
      description: string,
      end: -1 | 1,
      arrivalRunwayIds: number[],
      departureRunwayIds: number[],
      procedure: RunwayProcedureClass,
      restrictions: RunwayConfigurationRestrictions,
      selectionPriority = 0,
      configurationSource = source,
    ): AirportRunwayConfiguration => {
      const arrivalsSet = new Set(arrivalRunwayIds);
      const departuresSet = new Set(departureRunwayIds);
      return {
        id,
        name,
        description,
        procedure,
        arrivalRunwayIds: [...arrivalRunwayIds],
        departureRunwayIds: [...departureRunwayIds],
        operatingEnds: Object.fromEntries(runways.map((runway) => [runway.id, end])) as Record<number, -1 | 1>,
        runwayRoles: Object.fromEntries(runways.map((runway) => {
          const arrival = arrivalsSet.has(runway.id);
          const departure = departuresSet.has(runway.id);
          return [runway.id, arrival && departure ? 'mixed' : arrival ? 'arrival' : departure ? 'departure' : 'inactive'];
        })) as Record<number, RunwayOperationalRole>,
        restrictions,
        selectionPriority,
        source: configurationSource,
      };
    };
    return [
      ordConfiguration(
        'ORD-WEST-FLOW',
        'West parallel',
        'Arrivals 27R, 27C, and 28C; departures 27L, 28R, and 22L.',
        1,
        [0, 1, 4],
        [2, 3, 7],
        'parallel',
        { conditions: ['clear', 'rain', 'fog', 'snow'], autoSelectable: true, note: 'Preferred O’Hare flow and the robust option in marginal and winter weather.' },
        0.08,
      ),
      ordConfiguration(
        'ORD-EAST-FLOW',
        'East parallel',
        'Arrivals 09L, 09C, and 10C; departures 09R and 10L.',
        -1,
        [0, 1, 4],
        [2, 3],
        'parallel',
        { conditions: ['clear'], minimumVisibilityMiles: 5, autoSelectable: true, note: 'Visual east-flow parallel configuration.' },
        0.06,
      ),
      ordConfiguration(
        'ORD-WEST-HIGH-ARRIVAL',
        'West high-arrival',
        'Adds offset 28L arrivals to 27R, 27C, and 28C; 22L is unavailable.',
        1,
        [0, 1, 4, 5],
        [2, 3],
        'offset-parallel',
        { conditions: ['clear'], minimumVisibilityMiles: 7, scenarios: ['rush'], autoSelectable: true, note: 'High-demand visual scenario based on the FAA modeled proposed-action configuration.' },
        0.24,
      ),
      ordConfiguration(
        'ORD-EAST-OFFSET',
        'East offset arrivals',
        'Arrivals 09L, 09C, 10C, and offset 10R; departures 09R and 10L.',
        -1,
        [0, 1, 4, 5],
        [2, 3],
        'offset-parallel',
        { conditions: ['clear'], minimumVisibilityMiles: 7, scenarios: ['rush'], autoSelectable: true, note: 'High-demand visual configuration; the 10R arrival is offset from 10C traffic.' },
        0.22,
      ),
      ordConfiguration(
        'ORD-EAST-IFR',
        'East instrument',
        'Arrivals 09L, 09C, and 10R; departures 09R and 10L. Runway 10C is not paired with 10R.',
        -1,
        [0, 1, 5],
        [2, 3],
        'instrument-parallel',
        { conditions: ['rain', 'fog'], autoSelectable: true, note: 'Instrument east-flow variant that avoids simultaneous 10C and 10R arrivals.' },
        0.12,
      ),
      ordConfiguration(
        'ORD-CROSSWIND-22',
        '22 crosswind contingency',
        'Strong southerly-wind contingency: arrivals use 22R and departures use 22L.',
        1,
        [6],
        [7],
        'crosswind-contingency',
        {
          conditions: ['clear', 'rain', 'fog', 'snow'],
          minimumWindSpeedKts: 18,
          preferredWindDirectionDegrees: 220,
          windDirectionToleranceDegrees: 55,
          autoSelectable: true,
          note: 'Rare strong-southerly configuration; runway 4R is never assigned for arrivals.',
        },
        0.34,
        runwayUtilization,
      ),
    ];
  }
  const defaultEnd = runways.find((runway) => runway.role !== 'inactive')?.landingEnd ?? 1;
  return [
    configuration(`${code}-PRIMARY`, 'Primary flow', 'Published schematic runway roles and their primary operating ends.', defaultEnd),
    configuration(`${code}-RECIPROCAL`, 'Reciprocal flow', 'The reciprocal operating ends for a wind reversal.', defaultEnd === 1 ? -1 : 1),
  ];
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

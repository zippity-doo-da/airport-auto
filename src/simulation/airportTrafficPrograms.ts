import type { AircraftModel } from './aircraftProfiles';
import type { AirlineCode } from './airlineProfiles';
import type { OperationTrafficClass } from './airportOperationProfiles';

export interface WeightedAircraft {
  model: AircraftModel;
  weight: number;
}

export interface AirlineGatePreference {
  concourses?: string[];
  zoneNames?: string[];
  /** Normalized stand-bank range used by schematic hubs without sourced gates. */
  standSector?: [number, number];
  label: string;
}

export interface AirlineBankProfile {
  airline: AirlineCode;
  baseWeight: number;
  classWeights: Partial<Record<OperationTrafficClass, number>>;
  fleets: Partial<Record<OperationTrafficClass, WeightedAircraft[]>>;
  bankMultipliers: Record<string, Partial<Record<'arrival' | 'departure', number>>>;
  gate: AirlineGatePreference;
}

export interface AirportTrafficProgramSource {
  title: string;
  url?: string;
  retrievedOn: string;
  role: 'airline-directory' | 'terminal-allocation' | 'schematic-design';
}

export interface AirportTrafficProgram {
  schemaVersion: 1;
  airportCode: string;
  airlines: AirlineBankProfile[];
  markets: Record<OperationTrafficClass, string[]>;
  recoveryPeriodIds: string[];
  overnightCargoPeriodIds: string[];
  sources: AirportTrafficProgramSource[];
  fidelity: 'sourced-airlines-schematic-weights' | 'schematic';
}

export interface TrafficProgramSelection {
  airline: AirlineCode;
  aircraft: AircraftModel;
  market: string;
  gatePreference: AirlineGatePreference;
  airlineWeight: number;
  bankMultiplier: number;
}

interface SelectionInput {
  trafficClass: OperationTrafficClass;
  direction: 'arrival' | 'departure';
  periodId: string;
  flightId: number;
  airportSeed: number;
  supportsAircraft?: (model: AircraftModel) => boolean;
}

const DOMESTIC_FLEET: WeightedAircraft[] = [
  { model: 'A320', weight: 0.48 },
  { model: 'B738', weight: 0.42 },
  { model: 'B789', weight: 0.06 },
  { model: 'A359', weight: 0.04 },
];
const INTERNATIONAL_FLEET: WeightedAircraft[] = [
  { model: 'B789', weight: 0.42 },
  { model: 'A359', weight: 0.38 },
  { model: 'A320', weight: 0.12 },
  { model: 'B738', weight: 0.08 },
];
const REGIONAL_FLEET: WeightedAircraft[] = [
  { model: 'E175', weight: 0.68 },
  { model: 'Q400', weight: 0.32 },
];
const CARGO_FLEET: WeightedAircraft[] = [
  { model: 'B77F', weight: 0.82 },
  { model: 'B738', weight: 0.18 },
];
const GENERAL_AVIATION_FLEET: WeightedAircraft[] = [{ model: 'PC12', weight: 1 }];

const HUB_BANKS = {
  primary: {
    'morning-departure': { departure: 1.42, arrival: 0.92 },
    'morning-arrival': { arrival: 1.36, departure: 0.88 },
    'afternoon-arrival': { arrival: 1.3, departure: 0.9 },
    'evening-departure': { departure: 1.34, arrival: 0.9 },
    'morning-recovery': { arrival: 0.62, departure: 0.66 },
    'midday-recovery': { arrival: 0.68, departure: 0.7 },
    'afternoon-recovery': { arrival: 0.65, departure: 0.68 },
  },
  secondary: {
    'morning-departure': { departure: 1.12 },
    'morning-arrival': { arrival: 1.12 },
    'afternoon-arrival': { arrival: 1.08 },
    'evening-departure': { departure: 1.1 },
    'morning-recovery': { arrival: 0.82, departure: 0.84 },
    'midday-recovery': { arrival: 0.84, departure: 0.86 },
    'afternoon-recovery': { arrival: 0.82, departure: 0.84 },
  },
  cargo: {
    overnight: { arrival: 3.8, departure: 4.2 },
    'late-arrival': { arrival: 2.5, departure: 1.8 },
    'late-international': { arrival: 2.4, departure: 2.1 },
    night: { arrival: 3.2, departure: 3.5 },
    'morning-recovery': { arrival: 0.78, departure: 0.82 },
    'midday-recovery': { arrival: 0.72, departure: 0.76 },
    'afternoon-recovery': { arrival: 0.74, departure: 0.78 },
  },
} satisfies Record<string, Record<string, Partial<Record<'arrival' | 'departure', number>>>>;

function passengerAirline(
  airline: AirlineCode,
  baseWeight: number,
  gate: AirlineGatePreference,
  fleet: WeightedAircraft[],
  primary = false,
  regionalWeight = 0.35,
): AirlineBankProfile {
  return {
    airline,
    baseWeight,
    classWeights: { passenger: 1, regional: regionalWeight },
    fleets: { passenger: fleet, regional: REGIONAL_FLEET },
    bankMultipliers: primary ? HUB_BANKS.primary : HUB_BANKS.secondary,
    gate,
  };
}

function cargoAirline(
  airline: AirlineCode,
  baseWeight: number,
  gate: AirlineGatePreference,
): AirlineBankProfile {
  return {
    airline,
    baseWeight,
    classWeights: { cargo: 1 },
    fleets: { cargo: CARGO_FLEET },
    bankMultipliers: HUB_BANKS.cargo,
    gate,
  };
}

function source(title: string, url?: string, role: AirportTrafficProgramSource['role'] = 'airline-directory'): AirportTrafficProgramSource {
  return { title, url, retrievedOn: '2026-07-24', role };
}

function program(
  airportCode: string,
  airlines: AirlineBankProfile[],
  markets: Partial<Record<OperationTrafficClass, string[]>>,
  sources: AirportTrafficProgramSource[],
): AirportTrafficProgram {
  return {
    schemaVersion: 1,
    airportCode,
    airlines: [
      ...airlines,
      {
        airline: 'LOCAL',
        baseWeight: 0.04,
        classWeights: { 'general-aviation': 1 },
        fleets: { 'general-aviation': GENERAL_AVIATION_FLEET },
        bankMultipliers: {},
        gate: { zoneNames: ['General Aviation', 'Remote Ramp'], label: 'general-aviation / remote stands' },
      },
    ],
    markets: {
      passenger: markets.passenger ?? ['ATL', 'ORD', 'DFW', 'LAX', 'JFK'],
      regional: markets.regional ?? markets.passenger ?? ['LOCAL'],
      cargo: markets.cargo ?? ['SDF', 'MEM', 'ANC'],
      'general-aviation': markets['general-aviation'] ?? ['LOCAL'],
    },
    recoveryPeriodIds: ['morning-recovery', 'midday-recovery', 'afternoon-recovery'],
    overnightCargoPeriodIds: ['overnight', 'late-arrival', 'late-international', 'night'],
    sources,
    fidelity: sources.some((item) => item.role !== 'schematic-design') ? 'sourced-airlines-schematic-weights' : 'schematic',
  };
}

const PROGRAMS: Record<string, AirportTrafficProgram> = {
  ATL: program('ATL', [
    passengerAirline('DL', 0.7, { standSector: [0, 0.58], label: 'Delta hub gate bank' }, DOMESTIC_FLEET, true, 1),
    passengerAirline('WN', 0.12, { standSector: [0.58, 0.74], label: 'Southwest gate bank' }, [{ model: 'B738', weight: 1 }]),
    passengerAirline('AA', 0.055, { standSector: [0.74, 0.84], label: 'north/common-use bank' }, DOMESTIC_FLEET),
    passengerAirline('UA', 0.05, { standSector: [0.84, 0.93], label: 'north/common-use bank' }, DOMESTIC_FLEET),
    passengerAirline('F9', 0.035, { standSector: [0.93, 1], label: 'common-use bank' }, [{ model: 'A320', weight: 1 }]),
    cargoAirline('5X', 0.025, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
    cargoAirline('FX', 0.025, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
  ], {
    passenger: ['BOS', 'JFK', 'LGA', 'MCO', 'MIA', 'DFW', 'DEN', 'LAX', 'SEA', 'LHR', 'CDG', 'AMS'],
    regional: ['BHM', 'CHA', 'GSP', 'SAV', 'MOB', 'TYS', 'AVL', 'JAX'],
    cargo: ['MEM', 'SDF', 'MIA', 'DFW', 'EWR'],
    'general-aviation': ['PDK', 'FTY', 'CSG'],
  }, [source('ATL official airport fact sheet and airline directory', 'https://www.atl.com/about-atl/atl-factsheet/')]),

  ORD: program('ORD', [
    passengerAirline('UA', 0.47, { concourses: ['B', 'C', 'E', 'F', 'G'], label: 'United B/C/E/F/G allocation' }, DOMESTIC_FLEET, true, 1),
    passengerAirline('AA', 0.31, { concourses: ['G', 'H', 'K', 'L'], label: 'American G/H/K/L allocation' }, DOMESTIC_FLEET, true, 0.8),
    passengerAirline('WN', 0.06, { concourses: ['M'], label: 'Terminal 5 common-use allocation' }, [{ model: 'B738', weight: 1 }]),
    passengerAirline('DL', 0.045, { concourses: ['M'], label: 'Terminal 5 common-use allocation' }, DOMESTIC_FLEET),
    passengerAirline('BA', 0.025, { concourses: ['M'], label: 'Terminal 5 international allocation' }, INTERNATIONAL_FLEET),
    passengerAirline('NH', 0.02, { concourses: ['M'], label: 'Terminal 5 international allocation' }, INTERNATIONAL_FLEET),
    passengerAirline('TK', 0.015, { concourses: ['M'], label: 'Terminal 5 international allocation' }, INTERNATIONAL_FLEET),
    cargoAirline('5X', 0.03, { zoneNames: ['Southeast Cargo Ramp'], label: 'Southeast Cargo Ramp' }),
    cargoAirline('FX', 0.025, { zoneNames: ['Southwest Cargo Ramp', 'Southeast Cargo Ramp'], label: 'south cargo ramps' }),
  ], {
    passenger: ['ATL', 'BOS', 'DEN', 'DFW', 'IAH', 'JFK', 'LAX', 'MCO', 'SEA', 'SFO', 'LHR', 'FRA', 'NRT', 'MEX', 'YYZ'],
    regional: ['CID', 'DSM', 'DTW', 'GRR', 'IND', 'MKE', 'MSP', 'OMA', 'STL'],
    cargo: ['SDF', 'MEM', 'ANC', 'DFW', 'EWR', 'MIA'],
    'general-aviation': ['PWK', 'DPA', 'UGN', 'RFD'],
  }, [
    source('Chicago Department of Aviation O’Hare facility and gate data', 'https://www.flychicago.com/business/CDA/factsfigures/pages/facility.aspx', 'terminal-allocation'),
  ]),

  DFW: program('DFW', [
    passengerAirline('AA', 0.73, { standSector: [0, 0.72], label: 'American terminal bank' }, DOMESTIC_FLEET, true, 1),
    passengerAirline('DL', 0.045, { standSector: [0.72, 0.8], label: 'Terminal E bank' }, DOMESTIC_FLEET),
    passengerAirline('UA', 0.04, { standSector: [0.8, 0.87], label: 'Terminal E bank' }, DOMESTIC_FLEET),
    passengerAirline('F9', 0.025, { standSector: [0.87, 0.92], label: 'Terminal E bank' }, [{ model: 'A320', weight: 1 }]),
    passengerAirline('BA', 0.025, { standSector: [0.92, 1], label: 'Terminal D international bank' }, INTERNATIONAL_FLEET),
    cargoAirline('FX', 0.07, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
    cargoAirline('5X', 0.065, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
  ], {
    passenger: ['ATL', 'BOS', 'DEN', 'JFK', 'LAX', 'MIA', 'ORD', 'PHX', 'SEA', 'LHR', 'NRT', 'MEX'],
    regional: ['ABI', 'AMA', 'AUS', 'LBB', 'OKC', 'SAT', 'SHV', 'TUL'],
    cargo: ['MEM', 'SDF', 'ANC', 'MIA', 'LAX'],
    'general-aviation': ['ADS', 'FTW', 'DAL', 'AFW'],
  }, [source('DFW official airline and gate directory', 'https://www.dfwairport.com/explore/plan/airlines/', 'terminal-allocation')]),

  DEN: program('DEN', [
    passengerAirline('UA', 0.46, { standSector: [0, 0.5], label: 'United A/B bank' }, DOMESTIC_FLEET, true, 1),
    passengerAirline('WN', 0.31, { standSector: [0.5, 0.79], label: 'Southwest C bank' }, [{ model: 'B738', weight: 1 }], true, 0),
    passengerAirline('F9', 0.13, { standSector: [0.79, 0.92], label: 'Frontier A bank' }, [{ model: 'A320', weight: 1 }], true, 0),
    passengerAirline('AA', 0.035, { standSector: [0.92, 0.96], label: 'common-use bank' }, DOMESTIC_FLEET),
    cargoAirline('FX', 0.035, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
    cargoAirline('5X', 0.03, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
  ], {
    passenger: ['ATL', 'BOS', 'DFW', 'IAH', 'JFK', 'LAX', 'MCO', 'ORD', 'SEA', 'SFO', 'LHR', 'NRT'],
    regional: ['ABQ', 'ASE', 'BIL', 'BOI', 'COS', 'GJT', 'RAP', 'SLC'],
    cargo: ['MEM', 'SDF', 'ANC', 'DFW', 'LAX'],
    'general-aviation': ['APA', 'BJC', 'GXY', 'COS'],
  }, [source('Denver International official airline directory', 'https://www.flydenver.com/airlines/', 'terminal-allocation')]),

  DXB: program('DXB', [
    passengerAirline('EK', 0.67, { standSector: [0, 0.68], label: 'Emirates Terminal 3 bank' }, INTERNATIONAL_FLEET, true, 0),
    passengerAirline('FZ', 0.14, { standSector: [0.68, 0.82], label: 'flydubai Terminal 2/3 bank' }, [{ model: 'B738', weight: 1 }], true, 0),
    passengerAirline('BA', 0.045, { standSector: [0.82, 0.88], label: 'Terminal 1 international bank' }, INTERNATIONAL_FLEET),
    passengerAirline('TK', 0.04, { standSector: [0.88, 0.94], label: 'Terminal 1 international bank' }, INTERNATIONAL_FLEET),
    passengerAirline('UA', 0.02, { standSector: [0.94, 1], label: 'Terminal 3 partner bank' }, INTERNATIONAL_FLEET),
    cargoAirline('FX', 0.045, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
    cargoAirline('5X', 0.04, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
  ], {
    passenger: ['BOM', 'DEL', 'DOH', 'IST', 'JED', 'KHI', 'LHR', 'SIN', 'SYD', 'NRT', 'JFK', 'LAX'],
    regional: ['BAH', 'DOH', 'KWI', 'MCT', 'RUH', 'DMM'],
    cargo: ['HKG', 'SIN', 'FRA', 'MEM', 'SDF', 'BOM'],
    'general-aviation': ['DWC', 'AUH', 'SHJ'],
  }, [source('Dubai Airports official airline directory', 'https://dubaiairports.ae/airlines', 'terminal-allocation')]),

  HND: program('HND', [
    passengerAirline('NH', 0.43, { standSector: [0, 0.45], label: 'ANA Terminal 2 bank' }, DOMESTIC_FLEET, true, 0.55),
    passengerAirline('JL', 0.41, { standSector: [0.45, 0.84], label: 'JAL Terminal 1 bank' }, DOMESTIC_FLEET, true, 0.55),
    passengerAirline('UA', 0.035, { standSector: [0.84, 0.89], label: 'Terminal 3 international bank' }, INTERNATIONAL_FLEET),
    passengerAirline('AA', 0.03, { standSector: [0.89, 0.94], label: 'Terminal 3 international bank' }, INTERNATIONAL_FLEET),
    passengerAirline('BA', 0.025, { standSector: [0.94, 1], label: 'Terminal 3 international bank' }, INTERNATIONAL_FLEET),
    cargoAirline('FX', 0.03, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
    cargoAirline('5X', 0.03, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
  ], {
    passenger: ['CTS', 'FUK', 'ITM', 'KIX', 'OKA', 'ICN', 'SIN', 'LHR', 'JFK', 'LAX'],
    regional: ['AOJ', 'AXT', 'HKD', 'KOJ', 'MYJ', 'TAK'],
    cargo: ['NRT', 'KIX', 'HKG', 'ANC', 'MEM'],
    'general-aviation': ['NRT', 'RJTT', 'RJAA'],
  }, [source('Haneda Airport official airline list', 'https://tokyo-haneda.com/en/flight/company_list.html?tab=intFlight', 'terminal-allocation')]),

  LHR: program('LHR', [
    passengerAirline('BA', 0.57, { standSector: [0, 0.6], label: 'British Airways Terminal 5/3 bank' }, INTERNATIONAL_FLEET, true, 0.25),
    passengerAirline('VS', 0.12, { standSector: [0.6, 0.71], label: 'Virgin Atlantic Terminal 3 bank' }, INTERNATIONAL_FLEET, true, 0),
    passengerAirline('AA', 0.07, { standSector: [0.71, 0.79], label: 'oneworld Terminal 3/5 bank' }, INTERNATIONAL_FLEET),
    passengerAirline('UA', 0.055, { standSector: [0.79, 0.86], label: 'Terminal 2 bank' }, INTERNATIONAL_FLEET),
    passengerAirline('EK', 0.045, { standSector: [0.86, 0.92], label: 'Terminal 3 bank' }, INTERNATIONAL_FLEET),
    passengerAirline('TK', 0.04, { standSector: [0.92, 1], label: 'international common-use bank' }, INTERNATIONAL_FLEET),
    cargoAirline('FX', 0.05, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
    cargoAirline('5X', 0.05, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
  ], {
    passenger: ['AMS', 'CDG', 'DUB', 'EDI', 'FRA', 'JFK', 'LAX', 'ORD', 'DXB', 'SIN', 'HND'],
    regional: ['ABZ', 'BHD', 'EDI', 'GLA', 'JER', 'MAN', 'NCL'],
    cargo: ['EMA', 'FRA', 'MEM', 'SDF', 'DXB', 'HKG'],
    'general-aviation': ['LCY', 'LTN', 'FAB'],
  }, [source('Heathrow official airline and terminal information', 'https://www.heathrow.com/airline-contact-info/british-airways', 'terminal-allocation')]),

  IST: program('IST', [
    passengerAirline('TK', 0.74, { standSector: [0, 0.76], label: 'Turkish Airlines hub bank' }, INTERNATIONAL_FLEET, true, 0.45),
    passengerAirline('BA', 0.04, { standSector: [0.76, 0.83], label: 'international common-use bank' }, INTERNATIONAL_FLEET),
    passengerAirline('EK', 0.04, { standSector: [0.83, 0.9], label: 'international common-use bank' }, INTERNATIONAL_FLEET),
    passengerAirline('UA', 0.025, { standSector: [0.9, 0.95], label: 'international common-use bank' }, INTERNATIONAL_FLEET),
    cargoAirline('FX', 0.08, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
    cargoAirline('5X', 0.075, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
  ], {
    passenger: ['ADB', 'AYT', 'ESB', 'FRA', 'LHR', 'DXB', 'DEL', 'SIN', 'JFK', 'ORD'],
    regional: ['ADB', 'AYT', 'BJV', 'DLM', 'ESB', 'GZT', 'TZX'],
    cargo: ['FRA', 'DXB', 'HKG', 'MEM', 'SDF'],
    'general-aviation': ['SAW', 'ISL', 'TEQ'],
  }, [source('Airport Auto hub-program design informed by Turkish Airlines’ official destination network', 'https://www.turkishairlines.com/en-int/flight-destinations/', 'schematic-design')]),

  LAX: program('LAX', [
    passengerAirline('AA', 0.19, { standSector: [0, 0.18], label: 'American Terminal 4 bank' }, DOMESTIC_FLEET, true, 0.55),
    passengerAirline('DL', 0.19, { standSector: [0.18, 0.37], label: 'Delta Terminal 2/3 bank' }, DOMESTIC_FLEET, true, 0.55),
    passengerAirline('UA', 0.18, { standSector: [0.37, 0.55], label: 'United Terminal 7/8 bank' }, DOMESTIC_FLEET, true, 0.55),
    passengerAirline('WN', 0.12, { standSector: [0.55, 0.66], label: 'Southwest Terminal 1 bank' }, [{ model: 'B738', weight: 1 }]),
    passengerAirline('AS', 0.11, { standSector: [0.66, 0.77], label: 'Alaska Terminal 6 bank' }, DOMESTIC_FLEET, true, 0.55),
    passengerAirline('BA', 0.04, { standSector: [0.77, 0.84], label: 'international terminal bank' }, INTERNATIONAL_FLEET),
    passengerAirline('NH', 0.035, { standSector: [0.84, 0.9], label: 'international terminal bank' }, INTERNATIONAL_FLEET),
    passengerAirline('EK', 0.025, { standSector: [0.9, 0.95], label: 'international terminal bank' }, INTERNATIONAL_FLEET),
    cargoAirline('5X', 0.055, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
    cargoAirline('FX', 0.055, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
  ], {
    passenger: ['ATL', 'BOS', 'DEN', 'DFW', 'HNL', 'JFK', 'ORD', 'SEA', 'SFO', 'LHR', 'NRT', 'SYD'],
    regional: ['FAT', 'LAS', 'MRY', 'PSP', 'SAN', 'SBA', 'SJC', 'SMF'],
    cargo: ['ANC', 'MEM', 'SDF', 'HKG', 'NRT', 'DFW'],
    'general-aviation': ['VNY', 'BUR', 'LGB', 'SNA'],
  }, [source('Los Angeles World Airports official airline locations', 'https://www.flylax.com/lax-airline-list', 'terminal-allocation')]),

  JFK: program('JFK', [
    passengerAirline('B6', 0.3, { standSector: [0, 0.3], label: 'JetBlue Terminal 5 bank' }, DOMESTIC_FLEET, true, 0.45),
    passengerAirline('DL', 0.27, { standSector: [0.3, 0.56], label: 'Delta Terminal 4 bank' }, DOMESTIC_FLEET, true, 0.55),
    passengerAirline('AA', 0.14, { standSector: [0.56, 0.69], label: 'American Terminal 8 bank' }, INTERNATIONAL_FLEET, true, 0.35),
    passengerAirline('BA', 0.07, { standSector: [0.69, 0.77], label: 'oneworld Terminal 8 bank' }, INTERNATIONAL_FLEET),
    passengerAirline('TK', 0.04, { standSector: [0.77, 0.84], label: 'Terminal 1 bank' }, INTERNATIONAL_FLEET),
    passengerAirline('EK', 0.04, { standSector: [0.84, 0.91], label: 'Terminal 4 bank' }, INTERNATIONAL_FLEET),
    passengerAirline('NH', 0.025, { standSector: [0.91, 0.96], label: 'Terminal 7 bank' }, INTERNATIONAL_FLEET),
    cargoAirline('FX', 0.06, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
    cargoAirline('5X', 0.055, { zoneNames: ['Cargo Ramp'], label: 'cargo ramp' }),
  ], {
    passenger: ['ATL', 'BOS', 'DFW', 'LAX', 'MCO', 'MIA', 'ORD', 'SFO', 'LHR', 'CDG', 'DXB', 'NRT'],
    regional: ['ACK', 'BTV', 'BUF', 'DCA', 'MVY', 'PWM', 'ROC', 'SYR'],
    cargo: ['MEM', 'SDF', 'ANC', 'MIA', 'FRA', 'HKG'],
    'general-aviation': ['TEB', 'HPN', 'FRG', 'ISP'],
  }, [source('Port Authority JFK official terminal airline directory', 'https://www.jfkairport.com/explore-jfk/terminals', 'terminal-allocation')]),
};

const LOCAL_PROGRAM = program('LOCAL', [
  passengerAirline('LOCAL', 0.56, { standSector: [0, 1], label: 'local passenger stands' }, [{ model: 'PC12', weight: 0.48 }, { model: 'Q400', weight: 0.32 }, { model: 'E175', weight: 0.2 }], true, 1),
  passengerAirline('WN', 0.12, { standSector: [0, 1], label: 'visiting airline stand' }, [{ model: 'B738', weight: 1 }], false, 0),
  passengerAirline('F9', 0.1, { standSector: [0, 1], label: 'visiting airline stand' }, [{ model: 'A320', weight: 1 }], false, 0),
  cargoAirline('FX', 0.1, { zoneNames: ['Cargo Ramp', 'Remote Ramp'], label: 'local cargo / remote stand' }),
  cargoAirline('5X', 0.08, { zoneNames: ['Cargo Ramp', 'Remote Ramp'], label: 'local cargo / remote stand' }),
], {
  passenger: ['REGION', 'COUNTY', 'METRO'],
  regional: ['REGION', 'COUNTY', 'METRO', 'STATE'],
  cargo: ['REGION', 'SORT', 'METRO'],
  'general-aviation': ['LOCAL', 'COUNTY', 'RANCH', 'METRO'],
}, [source('Airport Auto procedural local-field program', undefined, 'schematic-design')]);

export function airportTrafficProgram(airportCode: string): AirportTrafficProgram {
  return PROGRAMS[airportCode] ?? LOCAL_PROGRAM;
}

export function selectTrafficProgram(
  program: AirportTrafficProgram,
  input: SelectionInput,
): TrafficProgramSelection {
  const candidates = program.airlines
    .map((airline) => {
      const classWeight = airline.classWeights[input.trafficClass] ?? 0;
      const bankMultiplier = airline.bankMultipliers[input.periodId]?.[input.direction] ?? 1;
      return { airline, bankMultiplier, weight: airline.baseWeight * classWeight * bankMultiplier };
    })
    .filter((candidate) => candidate.weight > 0);
  const selected = weightedChoice(candidates, input.flightId, input.airportSeed, 0x51f15e) ?? candidates[0];
  const fallbackAirline = program.airlines.find((airline) => airline.airline === 'LOCAL') ?? program.airlines[0];
  const airline = selected?.airline ?? fallbackAirline;
  const fleet = airline.fleets[input.trafficClass] ?? defaultFleet(input.trafficClass);
  const compatibleFleet = input.supportsAircraft ? fleet.filter((candidate) => input.supportsAircraft?.(candidate.model)) : fleet;
  const aircraftPool = compatibleFleet.length ? compatibleFleet : defaultFleet(input.trafficClass).filter((candidate) => !input.supportsAircraft || input.supportsAircraft(candidate.model));
  const aircraft = weightedChoice(aircraftPool, input.flightId, input.airportSeed, 0xa17c9e)?.model
    ?? (input.trafficClass === 'general-aviation' ? 'PC12' : input.trafficClass === 'regional' ? 'E175' : input.trafficClass === 'cargo' ? 'B77F' : 'A320');
  const markets = program.markets[input.trafficClass];
  const market = markets[Math.floor(deterministicUnit(input.flightId, input.airportSeed, 0xc0ffee) * markets.length) % markets.length];
  return {
    airline: airline.airline,
    aircraft,
    market,
    gatePreference: airline.gate,
    airlineWeight: Number((selected?.weight ?? airline.baseWeight).toFixed(4)),
    bankMultiplier: Number((selected?.bankMultiplier ?? 1).toFixed(4)),
  };
}

export function airlineGatePreference(
  airportCode: string,
  airlineCode: AirlineCode,
  trafficClass?: OperationTrafficClass,
): AirlineGatePreference | null {
  return airportTrafficProgram(airportCode).airlines.find((airline) => (
    airline.airline === airlineCode
    && (trafficClass === undefined || (airline.classWeights[trafficClass] ?? 0) > 0)
  ))?.gate ?? null;
}

export function airlineBankWeight(
  airportCode: string,
  airlineCode: AirlineCode,
  periodId: string,
  direction: 'arrival' | 'departure',
  trafficClass: OperationTrafficClass,
): number {
  const airline = airportTrafficProgram(airportCode).airlines.find((candidate) => candidate.airline === airlineCode);
  if (!airline) return 0;
  return airline.baseWeight
    * (airline.classWeights[trafficClass] ?? 0)
    * (airline.bankMultipliers[periodId]?.[direction] ?? 1);
}

function defaultFleet(trafficClass: OperationTrafficClass): WeightedAircraft[] {
  if (trafficClass === 'general-aviation') return GENERAL_AVIATION_FLEET;
  if (trafficClass === 'regional') return REGIONAL_FLEET;
  if (trafficClass === 'cargo') return CARGO_FLEET;
  return DOMESTIC_FLEET;
}

function weightedChoice<T extends { weight: number }>(
  values: T[],
  flightId: number,
  airportSeed: number,
  salt: number,
): T | undefined {
  const total = values.reduce((sum, value) => sum + Math.max(0, value.weight), 0);
  if (total <= 0) return values[0];
  let cursor = deterministicUnit(flightId, airportSeed, salt) * total;
  for (const value of values) {
    cursor -= Math.max(0, value.weight);
    if (cursor <= 0) return value;
  }
  return values.at(-1);
}

function deterministicUnit(flightId: number, airportSeed: number, salt: number): number {
  let value = (Math.imul(flightId ^ salt, 0x9e3779b1) ^ airportSeed) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value = (value ^ (value >>> 15)) >>> 0;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x1_0000_0000;
}

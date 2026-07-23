export type AirlineCode = 'UA' | 'AA' | 'DL' | 'WN' | 'B6' | 'F9' | '5X' | 'FX' | 'FDX' | 'LOCAL';

export interface AirlineProfile {
  code: AirlineCode;
  name: string;
  callsign: string;
  primaryColor: number;
  accentColor: number;
  cargo: boolean;
  registrationPrefix: string;
}

export const AIRLINE_PROFILES: Record<AirlineCode, AirlineProfile> = {
  UA: { code: 'UA', name: 'United Airlines', callsign: 'United', primaryColor: 0x5d8fc4, accentColor: 0xf0c75e, cargo: false, registrationPrefix: 'N' },
  AA: { code: 'AA', name: 'American Airlines', callsign: 'American', primaryColor: 0xbac5c7, accentColor: 0xd63d43, cargo: false, registrationPrefix: 'N' },
  DL: { code: 'DL', name: 'Delta Air Lines', callsign: 'Delta', primaryColor: 0x9d3047, accentColor: 0x507caf, cargo: false, registrationPrefix: 'N' },
  WN: { code: 'WN', name: 'Southwest Airlines', callsign: 'Southwest', primaryColor: 0xf4b63e, accentColor: 0x2c6e9f, cargo: false, registrationPrefix: 'N' },
  B6: { code: 'B6', name: 'JetBlue', callsign: 'JetBlue', primaryColor: 0x2e71a8, accentColor: 0x8dc5dc, cargo: false, registrationPrefix: 'N' },
  F9: { code: 'F9', name: 'Frontier Airlines', callsign: 'Frontier', primaryColor: 0x4e7b49, accentColor: 0xd4e5b5, cargo: false, registrationPrefix: 'N' },
  '5X': { code: '5X', name: 'UPS Airlines', callsign: 'UPS', primaryColor: 0x5a392c, accentColor: 0xf0c346, cargo: true, registrationPrefix: 'N' },
  FX: { code: 'FX', name: 'FedEx Express', callsign: 'FedEx', primaryColor: 0x70529a, accentColor: 0xe8a12b, cargo: true, registrationPrefix: 'N' },
  FDX: { code: 'FDX', name: 'FedEx Express', callsign: 'FedEx', primaryColor: 0x70529a, accentColor: 0xe8a12b, cargo: true, registrationPrefix: 'N' },
  LOCAL: { code: 'LOCAL', name: 'Independent charter', callsign: 'Charter', primaryColor: 0x789b92, accentColor: 0xe8dfbf, cargo: false, registrationPrefix: 'N' },
};

export const AIRPORT_AIRLINES: Record<string, AirlineCode[]> = {
  ORD: ['UA', 'AA', 'UA', 'AA', '5X', 'WN'],
  ATL: ['DL', 'DL', 'WN', 'F9', '5X'],
  DFW: ['AA', 'AA', 'WN', 'FX', '5X'],
  LAX: ['AA', 'UA', 'DL', 'WN', '5X'],
  JFK: ['B6', 'DL', 'AA', 'UA', 'FX'],
  LOCAL: ['LOCAL', 'LOCAL', 'WN', 'F9'],
};

export function airlineProfile(code: AirlineCode): AirlineProfile {
  return AIRLINE_PROFILES[code];
}

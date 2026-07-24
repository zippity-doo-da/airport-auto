import type { AircraftCategory, WakeClass } from './types';

export type AircraftModel = 'PC12' | 'E175' | 'Q400' | 'A320' | 'B738' | 'A359' | 'B789' | 'B77F';

export interface AircraftVisualSpec {
  bodyRadius: number;
  bodyLength: number;
  wingSpan: number;
  wingSweep: number;
  tailHeight: number;
  engineRadius: number;
  engineLength: number;
  engineOffset: number;
  propeller?: boolean;
  engineMount?: 'wing' | 'nose';
}

export interface AircraftProfile {
  model: AircraftModel;
  manufacturer: string;
  name: string;
  category: AircraftCategory;
  wakeClass: WakeClass;
  lengthM: number;
  wingspanM: number;
  maxTakeoffWeightT: number;
  cruiseKts: number;
  approachKts: number;
  taxiKts: number;
  taxiTurnKts: number;
  taxiAccelerationMps2: number;
  taxiBrakingMps2: number;
  taxiTurnRadiusM: number;
  minimumWingtipClearanceM: number;
  takeoffRollM: number;
  landingRollM: number;
  climbFpm: number;
  descentFpm: number;
  accelerationMps2: number;
  brakingMps2: number;
  turnRadiusM: number;
  wakeSeparationSeconds: number;
  engines: number;
  engineType: 'turbofan' | 'turboprop';
  visual: AircraftVisualSpec;
}

/** A compact, intentionally curated fleet for readable airport traffic. */
export const AIRCRAFT_PROFILES: Record<AircraftModel, AircraftProfile> = {
  PC12: {
    model: 'PC12', manufacturer: 'Pilatus', name: 'PC-12 NGX utility turboprop', category: 'regional', wakeClass: 'light',
    lengthM: 14.4, wingspanM: 16.28, maxTakeoffWeightT: 4.74, cruiseKts: 290, approachKts: 85, taxiKts: 10,
    taxiTurnKts: 7, taxiAccelerationMps2: 0.42, taxiBrakingMps2: 0.58, taxiTurnRadiusM: 10, minimumWingtipClearanceM: 3,
    takeoffRollM: 758, landingRollM: 661, climbFpm: 1_920, descentFpm: 1_200, accelerationMps2: 1.45, brakingMps2: 1.55, turnRadiusM: 460, wakeSeparationSeconds: 2.8, engines: 1, engineType: 'turboprop',
    visual: { bodyRadius: 0.38, bodyLength: 3.85, wingSpan: 4.75, wingSweep: 0.34, tailHeight: 0.96, engineRadius: 0.55, engineLength: 0.86, engineOffset: 0, propeller: true, engineMount: 'nose' },
  },
  E175: {
    model: 'E175', manufacturer: 'Embraer', name: 'E175 regional jet', category: 'regional', wakeClass: 'medium',
    lengthM: 31.7, wingspanM: 28.7, maxTakeoffWeightT: 40.4, cruiseKts: 447, approachKts: 130, taxiKts: 15,
    taxiTurnKts: 11, taxiAccelerationMps2: 0.55, taxiBrakingMps2: 0.68, taxiTurnRadiusM: 18, minimumWingtipClearanceM: 3,
    takeoffRollM: 1_650, landingRollM: 1_350, climbFpm: 2_500, descentFpm: 1_800, accelerationMps2: 2.2, brakingMps2: 1.8, turnRadiusM: 820, wakeSeparationSeconds: 3.4, engines: 2, engineType: 'turbofan',
    visual: { bodyRadius: 0.43, bodyLength: 5.4, wingSpan: 6.2, wingSweep: 0.62, tailHeight: 1.08, engineRadius: 0.34, engineLength: 1.18, engineOffset: 1.7 },
  },
  Q400: {
    model: 'Q400', manufacturer: 'De Havilland Canada', name: 'Dash 8 Q400 turboprop', category: 'regional', wakeClass: 'medium',
    lengthM: 32.8, wingspanM: 28.4, maxTakeoffWeightT: 29.6, cruiseKts: 360, approachKts: 119, taxiKts: 12,
    taxiTurnKts: 9, taxiAccelerationMps2: 0.48, taxiBrakingMps2: 0.64, taxiTurnRadiusM: 16, minimumWingtipClearanceM: 3,
    takeoffRollM: 1_390, landingRollM: 1_120, climbFpm: 2_000, descentFpm: 1_500, accelerationMps2: 1.7, brakingMps2: 1.7, turnRadiusM: 690, wakeSeparationSeconds: 3.1, engines: 2, engineType: 'turboprop',
    visual: { bodyRadius: 0.46, bodyLength: 5.5, wingSpan: 6.35, wingSweep: 0.48, tailHeight: 1.12, engineRadius: 0.52, engineLength: 0.8, engineOffset: 1.45, propeller: true },
  },
  A320: {
    model: 'A320', manufacturer: 'Airbus', name: 'A320 narrowbody', category: 'narrowbody', wakeClass: 'medium',
    lengthM: 37.6, wingspanM: 35.8, maxTakeoffWeightT: 78.0, cruiseKts: 454, approachKts: 137, taxiKts: 18,
    taxiTurnKts: 10, taxiAccelerationMps2: 0.5, taxiBrakingMps2: 0.66, taxiTurnRadiusM: 22, minimumWingtipClearanceM: 4.5,
    takeoffRollM: 2_100, landingRollM: 1_500, climbFpm: 2_300, descentFpm: 1_900, accelerationMps2: 2.0, brakingMps2: 1.9, turnRadiusM: 1_050, wakeSeparationSeconds: 4.2, engines: 2, engineType: 'turbofan',
    visual: { bodyRadius: 0.58, bodyLength: 6.4, wingSpan: 7.7, wingSweep: 0.82, tailHeight: 1.28, engineRadius: 0.45, engineLength: 1.42, engineOffset: 2.05 },
  },
  B738: {
    model: 'B738', manufacturer: 'Boeing', name: '737-800 narrowbody', category: 'narrowbody', wakeClass: 'medium',
    lengthM: 39.5, wingspanM: 35.8, maxTakeoffWeightT: 79.0, cruiseKts: 453, approachKts: 140, taxiKts: 18,
    taxiTurnKts: 10, taxiAccelerationMps2: 0.48, taxiBrakingMps2: 0.64, taxiTurnRadiusM: 22, minimumWingtipClearanceM: 4.5,
    takeoffRollM: 2_250, landingRollM: 1_520, climbFpm: 2_400, descentFpm: 1_900, accelerationMps2: 2.0, brakingMps2: 1.9, turnRadiusM: 1_070, wakeSeparationSeconds: 4.3, engines: 2, engineType: 'turbofan',
    visual: { bodyRadius: 0.59, bodyLength: 6.7, wingSpan: 7.9, wingSweep: 0.92, tailHeight: 1.31, engineRadius: 0.47, engineLength: 1.36, engineOffset: 2.15 },
  },
  A359: {
    model: 'A359', manufacturer: 'Airbus', name: 'A350-900 widebody', category: 'widebody', wakeClass: 'heavy',
    lengthM: 66.8, wingspanM: 64.8, maxTakeoffWeightT: 280.0, cruiseKts: 488, approachKts: 145, taxiKts: 15,
    taxiTurnKts: 8, taxiAccelerationMps2: 0.38, taxiBrakingMps2: 0.55, taxiTurnRadiusM: 34, minimumWingtipClearanceM: 1.5,
    takeoffRollM: 2_650, landingRollM: 1_850, climbFpm: 2_000, descentFpm: 2_100, accelerationMps2: 1.6, brakingMps2: 1.6, turnRadiusM: 1_520, wakeSeparationSeconds: 6.2, engines: 2, engineType: 'turbofan',
    visual: { bodyRadius: 0.74, bodyLength: 8.8, wingSpan: 10.5, wingSweep: 1.25, tailHeight: 1.7, engineRadius: 0.62, engineLength: 1.76, engineOffset: 2.75 },
  },
  B789: {
    model: 'B789', manufacturer: 'Boeing', name: '787-9 Dreamliner', category: 'widebody', wakeClass: 'heavy',
    lengthM: 62.8, wingspanM: 60.1, maxTakeoffWeightT: 254.0, cruiseKts: 488, approachKts: 142, taxiKts: 15,
    taxiTurnKts: 8, taxiAccelerationMps2: 0.4, taxiBrakingMps2: 0.56, taxiTurnRadiusM: 32, minimumWingtipClearanceM: 1.5,
    takeoffRollM: 2_550, landingRollM: 1_800, climbFpm: 2_100, descentFpm: 2_000, accelerationMps2: 1.7, brakingMps2: 1.6, turnRadiusM: 1_470, wakeSeparationSeconds: 6.0, engines: 2, engineType: 'turbofan',
    visual: { bodyRadius: 0.72, bodyLength: 8.5, wingSpan: 10.0, wingSweep: 1.16, tailHeight: 1.64, engineRadius: 0.6, engineLength: 1.7, engineOffset: 2.65 },
  },
  B77F: {
    model: 'B77F', manufacturer: 'Boeing', name: '777 freighter', category: 'cargo', wakeClass: 'heavy',
    lengthM: 63.7, wingspanM: 64.8, maxTakeoffWeightT: 347.8, cruiseKts: 490, approachKts: 149, taxiKts: 14,
    taxiTurnKts: 7.5, taxiAccelerationMps2: 0.36, taxiBrakingMps2: 0.52, taxiTurnRadiusM: 35, minimumWingtipClearanceM: 1.5,
    takeoffRollM: 3_050, landingRollM: 2_050, climbFpm: 1_800, descentFpm: 1_700, accelerationMps2: 1.4, brakingMps2: 1.4, turnRadiusM: 1_600, wakeSeparationSeconds: 7.0, engines: 2, engineType: 'turbofan',
    visual: { bodyRadius: 0.8, bodyLength: 9.0, wingSpan: 10.9, wingSweep: 1.3, tailHeight: 1.78, engineRadius: 0.7, engineLength: 1.92, engineOffset: 2.85 },
  },
};

export const AIRCRAFT_ROSTER: AircraftModel[] = ['PC12', 'E175', 'Q400', 'A320', 'B738', 'A359', 'B789', 'B77F'];

export function aircraftProfile(model: AircraftModel): AircraftProfile {
  return AIRCRAFT_PROFILES[model];
}

export type FlightPhase = 'approach' | 'landing' | 'taxi-in' | 'resting' | 'taxi-out' | 'takeoff';

import type { FlightColor } from './airportConfig';

export type ControlMode = 'auto' | 'manual';
export type WeatherCondition = 'clear' | 'rain' | 'fog';
export type TrafficScenario = 'normal' | 'rush' | 'storm' | 'closure';
export type FlightInstruction = 'slow' | 'normal' | 'expedite' | 'hold' | 'resume' | 'zigzag';
export type AircraftCategory = 'regional' | 'narrowbody' | 'widebody' | 'cargo';

export interface WeatherState {
  weatherEnabled: boolean;
  windEnabled: boolean;
  condition: WeatherCondition;
  windDirection: number;
  windSpeed: number;
  gustSpeed: number;
  visibility: number;
}

export interface Flight {
  id: number;
  callsign: string;
  palette: FlightColor;
  runway: number;
  departureRunway: number;
  operatingEnd: -1 | 1;
  phase: FlightPhase;
  progress: number;
  phaseElapsed: number;
  duration: number;
  cleared: boolean;
  clearanceLeft: number;
  taxiway?: string;
  holdShortRunway?: number;
  holdNotified?: boolean;
  runwayEntryCleared?: boolean;
  requiredCrossings?: number[];
  crossingClearances?: number[];
  controlPace?: number;
  controlHold?: boolean;
  controlPattern?: 'zigzag';
  controlPatternStart?: number;
  category: AircraftCategory;
  wakeClass: 'light' | 'medium' | 'heavy';
}

export interface ConflictPrediction {
  severity: 'caution' | 'warning';
  type: 'runway' | 'crossing' | 'separation';
  flights: number[];
  runway?: number;
  etaSeconds: number;
  detail: string;
}

export interface ShiftMetrics {
  safeArrivals: number;
  safeDepartures: number;
  preventedConflicts: number;
  holdsIssued: number;
  manualCommands: number;
  maxConcurrent: number;
  airborneSeconds: number;
  taxiSeconds: number;
  estimatedDelaySeconds: number;
}

export interface ReplayFrame {
  clock: number;
  score: { landed: number; departed: number };
  flights: Array<{ id: number; callsign: string; phase: FlightPhase; runway: number; progress: number }>;
  predictions: ConflictPrediction[];
}

export interface AirportEvent {
  type: 'spawn' | 'land' | 'chime' | 'depart' | 'clear' | 'auto-clear' | 'reject' | 'conflict' | 'hold-short' | 'runway-entry' | 'runway-crossing';
  flight: Flight;
  runway?: number;
  taxiway?: string;
}

export interface AirportState {
  elapsed: number;
  flights: Flight[];
  arrivals: number;
  departures: number;
  breeze: number;
  gameOver: boolean;
  paused: boolean;
  mode: ControlMode;
  weather: WeatherState;
  scenario: TrafficScenario;
}

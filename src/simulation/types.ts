export type FlightPhase = 'approach' | 'landing' | 'taxi-in' | 'resting' | 'taxi-out' | 'takeoff';

import type { FlightColor } from './airportConfig';
import type { AircraftModel } from './aircraftProfiles';

export type ControlMode = 'auto' | 'manual';
export type WeatherCondition = 'clear' | 'rain' | 'fog';
export type TrafficScenario = 'normal' | 'rush' | 'storm' | 'closure' | 'training' | 'emergency';
export type ControllerStation = 'tower' | 'ground' | 'approach' | 'supervisor';
export type FlightInstruction = 'slow' | 'normal' | 'expedite' | 'hold' | 'resume' | 'zigzag';
export type AircraftCategory = 'regional' | 'narrowbody' | 'widebody' | 'cargo';
export type WakeClass = 'light' | 'medium' | 'heavy';
export type EmergencyType = 'medical' | 'disabled' | 'birdstrike' | 'go-around';

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
  aircraft: AircraftModel;
  category: AircraftCategory;
  wakeClass: WakeClass;
  procedure: string;
  origin: string;
  destination: string;
  squawk: string;
  emergency?: EmergencyType;
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
  emergencyResponses: number;
}

export interface ReplayFrame {
  clock: number;
  score: { landed: number; departed: number };
  flights: Array<{ id: number; callsign: string; phase: FlightPhase; runway: number; progress: number }>;
  predictions: ConflictPrediction[];
}

export interface AirportEvent {
  type: 'spawn' | 'land' | 'chime' | 'depart' | 'clear' | 'auto-clear' | 'reject' | 'conflict' | 'hold-short' | 'runway-entry' | 'runway-crossing' | 'emergency';
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
  station: ControllerStation;
  weather: WeatherState;
  scenario: TrafficScenario;
}

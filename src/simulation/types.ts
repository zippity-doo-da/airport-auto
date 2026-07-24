export type FlightPhase = 'approach' | 'landing' | 'taxi-in' | 'resting' | 'taxi-out' | 'takeoff';

import type { FlightColor } from './airportConfig';
import type { AircraftModel } from './aircraftProfiles';
import type { AirlineCode } from './airlineProfiles';

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

export interface FlightKinematics {
  /** Indicated airspeed; ground movement uses groundSpeedKts in the HUD. */
  airspeedKts: number;
  groundSpeedKts: number;
  altitudeFt: number;
  verticalSpeedFpm: number;
  accelerationMps2: number;
  fuelPercent: number;
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
  standId?: string;
  surfaceRoute?: string[];
  surfaceRouteEdges?: string[];
  surfaceNode?: string;
  surfaceEdge?: string;
  holdShortRunway?: number;
  holdNotified?: boolean;
  runwayEntryCleared?: boolean;
  takeoffCleared?: boolean;
  requiredCrossings?: number[];
  crossingClearances?: number[];
  controlPace?: number;
  controlHold?: boolean;
  automaticHold?: boolean;
  safetyHold?: boolean;
  safetyHoldReason?: string;
  controlPattern?: 'zigzag';
  controlPatternStart?: number;
  gateSlot: number;
  aircraft: AircraftModel;
  airline: AirlineCode;
  flightNumber: number;
  registration: string;
  service: 'passenger' | 'cargo';
  category: AircraftCategory;
  wakeClass: WakeClass;
  procedure: string;
  origin: string;
  destination: string;
  squawk: string;
  emergency?: EmergencyType;
  kinematics: FlightKinematics;
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
  safetyHolds: number;
  collisionAlerts: number;
}

export interface ReplayFrame {
  clock: number;
  score: { landed: number; departed: number };
  flights: Array<{ id: number; callsign: string; phase: FlightPhase; runway: number; progress: number }>;
  predictions: ConflictPrediction[];
  /** Complete immutable render state so the replay scrubber drives the world, not only the label. */
  state: AirportState;
}

export interface AirportEvent {
  type: 'spawn' | 'land' | 'chime' | 'depart' | 'clear' | 'auto-clear' | 'reject' | 'conflict' | 'safety-hold' | 'hold-short' | 'runway-entry' | 'runway-crossing' | 'takeoff-clearance' | 'go-around' | 'emergency';
  flight: Flight;
  runway?: number;
  taxiway?: string;
  detail?: string;
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
  nightMode: boolean;
  station: ControllerStation;
  weather: WeatherState;
  scenario: TrafficScenario;
  activeRunwayEnds: Record<number, -1 | 1>;
  closedRunway: number | null;
}

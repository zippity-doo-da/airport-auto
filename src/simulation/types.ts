export type FlightPhase = 'approach' | 'landing' | 'taxi-in' | 'resting' | 'taxi-out' | 'takeoff';

import type { FlightColor, RunwayOperationalRole } from './airportConfig';
import type { AircraftModel } from './aircraftProfiles';
import type { AirlineCode } from './airlineProfiles';

export type ControlMode = 'auto' | 'assisted' | 'manual' | 'watch';
export type WeatherCondition = 'clear' | 'rain' | 'fog';
export type TrafficScenario = 'normal' | 'rush' | 'storm' | 'closure' | 'training' | 'emergency';
export type ControllerStation = 'tower' | 'ground' | 'approach' | 'supervisor';
export type FlightInstruction = 'slow' | 'normal' | 'expedite' | 'hold' | 'resume' | 'zigzag';
export type AircraftCategory = 'regional' | 'narrowbody' | 'widebody' | 'cargo';
export type WakeClass = 'light' | 'medium' | 'heavy';
export type EmergencyType = 'medical' | 'disabled' | 'birdstrike' | 'go-around';
export type EngineState = 'off' | 'starting' | 'running';
export type PushbackDirection = 'left' | 'right' | 'straight';

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

/**
 * Authoritative world pose owned by the fixed-step simulation. The renderer
 * may interpolate this state, but it must never invent a separate route.
 */
export interface FlightMotionState {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  bank: number;
  onGround: boolean;
  groundBlend: number;
  protectedRunway: boolean;
  distanceAlongM: number;
  totalDistanceM: number;
  stage?: string;
  stageProgress: number;
}

export type ClearanceProposalAction = 'land' | 'go-around' | 'pushback' | 'cross' | 'line-up' | 'takeoff' | 'resume';

export interface ClearanceProposal {
  id: string;
  flightId: number;
  action: ClearanceProposalAction;
  runway?: number;
  station: ControllerStation;
  label: string;
  reason: string;
  priority: 'routine' | 'attention' | 'urgent';
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
  pushbackCleared: boolean;
  pushbackDirection: PushbackDirection;
  pushbackProgress: number;
  pushbackReleaseProgress: number;
  tugAttached: boolean;
  engineState: EngineState;
  surfaceRoute?: string[];
  surfaceRouteEdges?: string[];
  surfaceRoutingCost?: number;
  surfaceCongestionPenalty?: number;
  surfaceCongestedEdgeIds?: string[];
  surfaceNode?: string;
  surfaceEdge?: string;
  rampControlZoneId?: string;
  rampControlZoneName?: string;
  rampControlZoneCapacity?: number;
  surfaceAlleyId?: string;
  surfaceFlowDirection?: 'inbound' | 'outbound';
  standPath?: 'lead-in' | 'lead-out';
  holdShortRunway?: number;
  holdNotified?: boolean;
  runwayEntryCleared?: boolean;
  takeoffCleared?: boolean;
  requiredCrossings?: number[];
  crossingClearances?: number[];
  crossingClearanceIds?: string[];
  crossingHoldRunway?: number;
  crossingHoldPointId?: string;
  controlPace?: number;
  controlHold?: boolean;
  automaticHold?: boolean;
  automaticHoldReason?: string;
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
  motion: FlightMotionState;
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
  runwayIncursions: number;
  unexplainedPauses: number;
  longestHoldSeconds: number;
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
  type: 'spawn' | 'land' | 'chime' | 'depart' | 'clear' | 'auto-clear' | 'pushback-clearance' | 'pushback-start' | 'engine-start' | 'tug-release' | 'reject' | 'conflict' | 'safety-hold' | 'hold-short' | 'runway-entry' | 'runway-crossing' | 'takeoff-clearance' | 'go-around' | 'emergency';
  flight: Flight;
  runway?: number;
  taxiway?: string;
  detail?: string;
}

export interface RunwayConfigurationTransition {
  targetId: string;
  requestedAt: number;
  reason: string;
  changedRunwayIds: number[];
  blockingFlightIds: number[];
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
  runwayConfigurationId: string;
  runwayConfigurationMode: 'automatic' | 'manual';
  runwayConfigurationTransition: RunwayConfigurationTransition | null;
  activeRunwayEnds: Record<number, -1 | 1>;
  activeRunwayRoles: Record<number, RunwayOperationalRole>;
  closedRunway: number | null;
}

import type { SoundscapeEvent } from "../audio/soundscapeEvents";
import {
  CONTROL_REPLAY_SCHEMA_VERSION,
  type AirportControlCommand,
  type ControlCommandSource,
} from "../control/controlProtocol";
import type {
  AirportState,
  ControllerStation,
  ReplayFrame,
} from "../simulation/types";

export const REPLAY_CANONICALIZATION = "sorted-json-v1" as const;
export const REPLAY_FINGERPRINT_ALGORITHM = "fnv1a-32x2-v1" as const;
export const REPLAY_FIXED_STEP_SECONDS = 0.05 as const;
export const MAXIMUM_REPLAY_MARKERS = 600;
export const MAXIMUM_REPLAY_DIFFERENCES = 96;

export type ReplayMarkerCategory =
  "safety" | "weather" | "command" | "movement" | "coordination" | "system";
export type ReplayMarkerPriority = "normal" | "caution" | "critical";

export interface ReplayTelemetryEvent {
  protocolVersion: string;
  apiVersion: string;
  sessionId: string;
  eventId: number;
  eventKey: string;
  sequence: number;
  airport: string;
  elapsed: number;
  type: string;
  flightId?: number;
  callsign?: string;
  runway?: number;
  phase?: string;
  taxiway?: string;
  accepted?: boolean;
  detail?: string;
  payload?: unknown;
  causedByCommandId?: string;
  causedByControllerDecisionId?: string;
  causedByEventId?: number;
  domainEventId?: string;
}

export interface ReplayRecordedCommand {
  sequence: number;
  eventId: number;
  eventKey: string;
  elapsed: number;
  requestId: string;
  commandId: string;
  clientId: string | null;
  source: ControlCommandSource;
  station: ControllerStation;
  actorId: string | null;
  command: AirportControlCommand;
  accepted: boolean;
  reason: string;
}

export interface ReplayMarker {
  id: string;
  eventId: number;
  sequence: number;
  frameIndex: number;
  elapsed: number;
  category: ReplayMarkerCategory;
  priority: ReplayMarkerPriority;
  type: string;
  label: string;
  detail: string;
  flightId: number | null;
  callsign: string | null;
  runway: number | null;
  accepted: boolean | null;
}

export interface ReplayIntegrity {
  algorithm: typeof REPLAY_FINGERPRINT_ALGORITHM;
  canonicalization: typeof REPLAY_CANONICALIZATION;
  initialStateHash: string;
  frameHashes: string[];
  commandHash: string;
  eventHash: string;
  weatherHash: string;
  soundHash: string;
  markerHash: string;
  manifestHash: string;
}

export interface ReplaySharingDisclosure {
  classification: "local-full" | "shareable-redacted";
  containsControllerIdentity: boolean;
  containsCorrelationIds: boolean;
  containsFreeText: boolean;
  automaticUpload: false;
  redactions: string[];
}

export interface ReplayRecording {
  schemaVersion: typeof CONTROL_REPLAY_SCHEMA_VERSION;
  protocolVersion: string;
  snapshotSchemaVersion: number | null;
  simulationVersion: string;
  fixedStepSeconds: number;
  sessionId: string;
  recordedAt: string;
  seed: number;
  airport: { code: string; name: string; scope: string };
  sharing: ReplaySharingDisclosure;
  initialState: AirportState;
  commands: ReplayRecordedCommand[];
  weatherHistory: ReplayTelemetryEvent[];
  soundEvents: SoundscapeEvent[];
  events: ReplayTelemetryEvent[];
  frames: ReplayFrame[];
  markers: ReplayMarker[];
  integrity: ReplayIntegrity;
}

export type ReplayRecordingDraft = Omit<
  ReplayRecording,
  "schemaVersion" | "markers" | "integrity"
>;

export interface ReplayMigrationResult {
  accepted: boolean;
  reason: string;
  sourceSchemaVersion: number | null;
  targetSchemaVersion: typeof CONTROL_REPLAY_SCHEMA_VERSION;
  migrated: boolean;
  warnings: string[];
  recording: ReplayRecording | null;
}

export interface ReplayVerificationMismatch {
  scope:
    | "initial-state"
    | "frame"
    | "commands"
    | "events"
    | "weather"
    | "sound"
    | "markers"
    | "manifest";
  index: number | null;
  expected: string;
  actual: string;
}

export interface ReplayVerificationResult {
  accepted: boolean;
  exact: boolean;
  reason: string;
  sourceSchemaVersion: number | null;
  schemaVersion: number | null;
  migrated: boolean;
  legacyUnsealed: boolean;
  checkedFrames: number;
  checkedEvents: number;
  manifestHash: string | null;
  mismatches: ReplayVerificationMismatch[];
  warnings: string[];
  recording: ReplayRecording | null;
}

export interface ReplayStateDifference {
  path: string;
  kind: "added" | "removed" | "type" | "value" | "length";
  before: string;
  after: string;
}

export interface ReplayStateComparison {
  equal: boolean;
  leftHash: string;
  rightHash: string;
  differenceCount: number;
  truncated: boolean;
  differences: ReplayStateDifference[];
  summary: {
    left: ReplayStateSummary;
    right: ReplayStateSummary;
  };
}

export interface ReplayStateSummary {
  elapsedSeconds: number | null;
  flights: number | null;
  arrivals: number | null;
  departures: number | null;
  weather: string | null;
  runwayConfiguration: string | null;
  gameOver: boolean | null;
}

export interface ReplaySeedLinkOptions {
  airport: string;
  seed: number;
  mode?: string;
  scenario?: string;
  density?: string;
  rules?: string;
  weather?: string;
  windDirectionDegrees?: number;
  windSpeed?: number | "off";
  runwayConfiguration?: string;
  hazards?: boolean;
  lighting?: string;
  season?: string;
  palette?: string;
  autostart?: boolean;
}

export interface ReplayAsyncOptions {
  yieldEveryFrames?: number;
  yieldControl?: () => Promise<void>;
}

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

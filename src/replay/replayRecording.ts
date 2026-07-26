import type { SoundscapeEvent } from "../audio/soundscapeEvents";
import { CONTROL_REPLAY_SCHEMA_VERSION } from "../control/controlProtocol";
import type { AirportState, ReplayFrame } from "../simulation/types";
import {
  buildReplayIntegrity,
  buildReplayIntegrityAsync,
} from "./replayFingerprint";
import {
  createReplayRecording,
  createReplayRecordingAsync,
} from "./replayFactory";
import {
  REPLAY_CANONICALIZATION,
  REPLAY_FINGERPRINT_ALGORITHM,
  REPLAY_FIXED_STEP_SECONDS,
  isRecord,
  type JsonRecord,
  type ReplayAsyncOptions,
  type ReplayIntegrity,
  type ReplayMigrationResult,
  type ReplayRecordedCommand,
  type ReplayRecording,
  type ReplayRecordingDraft,
  type ReplayTelemetryEvent,
  type ReplayVerificationMismatch,
  type ReplayVerificationResult,
} from "./replayTypes";

export * from "./replayTypes";
export { stableReplayFingerprint } from "./replayFingerprint";
export { deriveReplayMarkers } from "./replayMarkers";
export {
  createReplayRecording,
  createReplayRecordingAsync,
} from "./replayFactory";
export { compareReplayStates } from "./replayComparison";
export {
  buildReplaySeedLink,
  createShareableReplayRecording,
  createShareableReplayRecordingAsync,
  replayFilename,
} from "./replaySharing";

function replayShapeReason(record: JsonRecord): string | null {
  if (!isRecord(record.initialState)) return "initialState must be an object";
  if (!Array.isArray(record.frames)) return "frames must be an array";
  if (record.frames.some((frame) => !isRecord(frame) || !isRecord(frame.state)))
    return "every replay frame must contain a state object";
  if (!Array.isArray(record.commands)) return "commands must be an array";
  if (!Array.isArray(record.events)) return "events must be an array";
  if (!Array.isArray(record.weatherHistory))
    return "weatherHistory must be an array";
  if (!Array.isArray(record.soundEvents)) return "soundEvents must be an array";
  if (!isRecord(record.airport) || typeof record.airport.code !== "string")
    return "airport metadata is missing";
  if (!Number.isFinite(record.seed)) return "seed must be finite";
  return null;
}

function currentReplayShapeReason(record: JsonRecord): string | null {
  const integrity = record.integrity;
  const sharing = record.sharing;
  const sharingValid =
    isRecord(sharing) &&
    (sharing.classification === "local-full" ||
      sharing.classification === "shareable-redacted") &&
    typeof sharing.containsControllerIdentity === "boolean" &&
    typeof sharing.containsCorrelationIds === "boolean" &&
    typeof sharing.containsFreeText === "boolean" &&
    sharing.automaticUpload === false &&
    Array.isArray(sharing.redactions);
  const integrityValid =
    isRecord(integrity) &&
    integrity.algorithm === REPLAY_FINGERPRINT_ALGORITHM &&
    integrity.canonicalization === REPLAY_CANONICALIZATION &&
    Array.isArray(integrity.frameHashes) &&
    integrity.frameHashes.every((hash) => typeof hash === "string") &&
    [
      "initialStateHash",
      "commandHash",
      "eventHash",
      "weatherHash",
      "soundHash",
      "markerHash",
      "manifestHash",
    ].every((key) => typeof integrity[key] === "string");
  if (!Array.isArray(record.markers) || !sharingValid || !integrityValid)
    return "sharing disclosure, markers, or integrity manifest is incomplete";

  const metadataValid =
    typeof record.protocolVersion === "string" &&
    typeof record.simulationVersion === "string" &&
    typeof record.sessionId === "string" &&
    typeof record.recordedAt === "string" &&
    (record.snapshotSchemaVersion === null ||
      Number.isInteger(record.snapshotSchemaVersion)) &&
    typeof record.fixedStepSeconds === "number" &&
    Number.isFinite(record.fixedStepSeconds) &&
    record.fixedStepSeconds > 0 &&
    record.fixedStepSeconds <= 1;
  const frames = record.frames as JsonRecord[];
  const framesValid = frames.every(
    (frame, index) =>
      typeof frame.clock === "number" &&
      Number.isFinite(frame.clock) &&
      (index === 0 || frame.clock >= (frames[index - 1].clock as number)),
  );
  return metadataValid && framesValid
    ? null
    : "metadata or frame chronology is invalid";
}

function legacyReplayDraft(
  record: JsonRecord,
  clone = true,
): ReplayRecordingDraft {
  const copy = <T>(value: unknown): T =>
    (clone ? structuredClone(value) : value) as T;
  return {
    protocolVersion:
      typeof record.protocolVersion === "string"
        ? record.protocolVersion
        : "1.2.0",
    snapshotSchemaVersion: null,
    simulationVersion:
      typeof record.simulationVersion === "string"
        ? record.simulationVersion
        : "2.x",
    fixedStepSeconds: REPLAY_FIXED_STEP_SECONDS,
    sessionId:
      typeof record.sessionId === "string"
        ? record.sessionId
        : "legacy-session",
    recordedAt:
      typeof record.recordedAt === "string"
        ? record.recordedAt
        : new Date(0).toISOString(),
    seed: record.seed as number,
    airport: copy<ReplayRecording["airport"]>(record.airport),
    sharing: {
      classification: "local-full",
      containsControllerIdentity: true,
      containsCorrelationIds: true,
      containsFreeText: true,
      automaticUpload: false,
      redactions: [],
    },
    initialState: copy<AirportState>(record.initialState),
    commands: copy<ReplayRecordedCommand[]>(record.commands),
    weatherHistory: copy<ReplayTelemetryEvent[]>(record.weatherHistory),
    soundEvents: copy<SoundscapeEvent[]>(record.soundEvents),
    events: copy<ReplayTelemetryEvent[]>(record.events),
    frames: copy<ReplayFrame[]>(record.frames),
  };
}

function rejectedMigration(
  reason: string,
  sourceSchemaVersion: number | null,
): ReplayMigrationResult {
  return {
    accepted: false,
    reason,
    sourceSchemaVersion,
    targetSchemaVersion: CONTROL_REPLAY_SCHEMA_VERSION,
    migrated: false,
    warnings: [],
    recording: null,
  };
}

function migratedReplay(recording: ReplayRecording): ReplayMigrationResult {
  return {
    accepted: true,
    reason: "Replay schema 3 migrated to schema 4 in memory.",
    sourceSchemaVersion: 3,
    targetSchemaVersion: CONTROL_REPLAY_SCHEMA_VERSION,
    migrated: true,
    warnings: [
      "Schema 3 had no stored fingerprints; migration seals the content as received and cannot prove prior file integrity.",
    ],
    recording,
  };
}

export function migrateReplayRecording(input: unknown): ReplayMigrationResult {
  if (!isRecord(input))
    return rejectedMigration("Replay input must be a JSON object.", null);
  const sourceSchemaVersion = Number.isInteger(input.schemaVersion)
    ? (input.schemaVersion as number)
    : null;
  if (
    sourceSchemaVersion !== 3 &&
    sourceSchemaVersion !== CONTROL_REPLAY_SCHEMA_VERSION
  ) {
    return rejectedMigration(
      sourceSchemaVersion === null
        ? "Replay schemaVersion is missing."
        : `Replay schema ${sourceSchemaVersion} is unsupported; this build accepts schema 3 and ${CONTROL_REPLAY_SCHEMA_VERSION}.`,
      sourceSchemaVersion,
    );
  }
  const shapeReason = replayShapeReason(input);
  if (shapeReason)
    return rejectedMigration(
      `Replay rejected: ${shapeReason}.`,
      sourceSchemaVersion,
    );
  if (sourceSchemaVersion === CONTROL_REPLAY_SCHEMA_VERSION) {
    const currentReason = currentReplayShapeReason(input);
    if (currentReason)
      return rejectedMigration(
        `Replay schema 4 rejected: ${currentReason}.`,
        sourceSchemaVersion,
      );
  }
  try {
    if (sourceSchemaVersion === 3)
      return migratedReplay(createReplayRecording(legacyReplayDraft(input)));
    return {
      accepted: true,
      reason: "Replay schema 4 accepted.",
      sourceSchemaVersion,
      targetSchemaVersion: CONTROL_REPLAY_SCHEMA_VERSION,
      migrated: false,
      warnings: [],
      recording: structuredClone(input) as unknown as ReplayRecording,
    };
  } catch (error) {
    return rejectedMigration(
      error instanceof Error
        ? `Replay migration failed: ${error.message}`
        : "Replay migration failed.",
      sourceSchemaVersion,
    );
  }
}

export async function migrateReplayRecordingAsync(
  input: unknown,
  options: ReplayAsyncOptions = {},
): Promise<ReplayMigrationResult> {
  if (!isRecord(input) || input.schemaVersion !== 3)
    return migrateReplayRecording(input);
  const shapeReason = replayShapeReason(input);
  if (shapeReason) return migrateReplayRecording(input);
  try {
    return migratedReplay(
      await createReplayRecordingAsync(
        legacyReplayDraft(input, false),
        options,
      ),
    );
  } catch (error) {
    return rejectedMigration(
      error instanceof Error
        ? `Replay migration failed: ${error.message}`
        : "Replay migration failed.",
      3,
    );
  }
}

function integrityMismatch(
  mismatches: ReplayVerificationMismatch[],
  scope: ReplayVerificationMismatch["scope"],
  expected: string,
  actual: string,
  index: number | null = null,
): void {
  if (expected !== actual) mismatches.push({ scope, index, expected, actual });
}

function verificationFromIntegrity(
  migration: ReplayMigrationResult,
  recording: ReplayRecording,
  actual: ReplayIntegrity,
): ReplayVerificationResult {
  const stored = recording.integrity;
  const mismatches: ReplayVerificationMismatch[] = [];
  integrityMismatch(
    mismatches,
    "initial-state",
    stored.initialStateHash,
    actual.initialStateHash,
  );
  const maximumFrames = Math.max(
    stored.frameHashes.length,
    actual.frameHashes.length,
  );
  for (let index = 0; index < maximumFrames; index += 1) {
    integrityMismatch(
      mismatches,
      "frame",
      stored.frameHashes[index] ?? "missing",
      actual.frameHashes[index] ?? "missing",
      index,
    );
  }
  integrityMismatch(
    mismatches,
    "commands",
    stored.commandHash,
    actual.commandHash,
  );
  integrityMismatch(mismatches, "events", stored.eventHash, actual.eventHash);
  integrityMismatch(
    mismatches,
    "weather",
    stored.weatherHash,
    actual.weatherHash,
  );
  integrityMismatch(mismatches, "sound", stored.soundHash, actual.soundHash);
  integrityMismatch(
    mismatches,
    "markers",
    stored.markerHash,
    actual.markerHash,
  );
  integrityMismatch(
    mismatches,
    "manifest",
    stored.manifestHash,
    actual.manifestHash,
  );
  const exact = mismatches.length === 0;
  return {
    accepted: exact,
    exact,
    reason: exact
      ? migration.migrated
        ? `Replay migrated and verified across ${recording.frames.length.toLocaleString()} frames; legacy provenance remains unsealed.`
        : `Exact replay verified across ${recording.frames.length.toLocaleString()} frames.`
      : `Replay verification found ${mismatches.length.toLocaleString()} fingerprint mismatch${mismatches.length === 1 ? "" : "es"}.`,
    sourceSchemaVersion: migration.sourceSchemaVersion,
    schemaVersion: recording.schemaVersion,
    migrated: migration.migrated,
    legacyUnsealed: migration.migrated,
    checkedFrames: recording.frames.length,
    checkedEvents: recording.events.length,
    manifestHash: actual.manifestHash,
    mismatches,
    warnings: migration.warnings,
    recording: exact ? recording : null,
  };
}

function rejectedVerification(
  migration: ReplayMigrationResult,
  recording: ReplayRecording | null,
  reason = migration.reason,
): ReplayVerificationResult {
  return {
    accepted: false,
    exact: false,
    reason,
    sourceSchemaVersion: migration.sourceSchemaVersion,
    schemaVersion: recording?.schemaVersion ?? null,
    migrated: migration.migrated,
    legacyUnsealed: migration.migrated,
    checkedFrames: 0,
    checkedEvents: 0,
    manifestHash: null,
    mismatches: [],
    warnings: migration.warnings,
    recording: null,
  };
}

function replayWithoutIntegrity(
  recording: ReplayRecording,
): Omit<ReplayRecording, "integrity"> {
  const copy: Partial<ReplayRecording> = { ...recording };
  delete copy.integrity;
  return copy as Omit<ReplayRecording, "integrity">;
}

export function verifyReplayRecording(
  input: unknown,
): ReplayVerificationResult {
  const migration = migrateReplayRecording(input);
  if (!migration.accepted || !migration.recording)
    return rejectedVerification(migration, null);
  try {
    const actual = buildReplayIntegrity(
      replayWithoutIntegrity(migration.recording),
    );
    return verificationFromIntegrity(migration, migration.recording, actual);
  } catch (error) {
    return rejectedVerification(
      migration,
      migration.recording,
      error instanceof Error
        ? `Replay verification failed: ${error.message}`
        : "Replay verification failed.",
    );
  }
}

export async function verifyReplayRecordingAsync(
  input: unknown,
  options: ReplayAsyncOptions = {},
): Promise<ReplayVerificationResult> {
  const migration = await migrateReplayRecordingAsync(input, options);
  if (!migration.accepted || !migration.recording)
    return rejectedVerification(migration, null);
  try {
    const actual = await buildReplayIntegrityAsync(
      replayWithoutIntegrity(migration.recording),
      options,
    );
    return verificationFromIntegrity(migration, migration.recording, actual);
  } catch (error) {
    return rejectedVerification(
      migration,
      migration.recording,
      error instanceof Error
        ? `Replay verification failed: ${error.message}`
        : "Replay verification failed.",
    );
  }
}

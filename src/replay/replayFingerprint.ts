import type { ReplayFrame } from "../simulation/types";
import {
  REPLAY_CANONICALIZATION,
  REPLAY_FINGERPRINT_ALGORITHM,
  type JsonRecord,
  type ReplayAsyncOptions,
  type ReplayIntegrity,
  type ReplayRecording,
} from "./replayTypes";

class FingerprintWriter {
  private first = 0x811c9dc5;
  private second = 0x9e3779b9;

  write(value: string): void {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      this.writeByte(code & 0xff);
      this.writeByte(code >>> 8);
    }
  }

  digest(): string {
    return `${hex32(this.first)}${hex32(this.second)}`;
  }

  private writeByte(value: number): void {
    this.first = Math.imul(this.first ^ value, 0x01000193) >>> 0;
    this.second = Math.imul(this.second ^ (value + 0x9d), 0x85ebca6b) >>> 0;
    this.second ^= this.second >>> 13;
  }
}

function hex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

function writeCanonical(
  value: unknown,
  writer: FingerprintWriter,
  ancestors: Set<object>,
): void {
  if (value === null || value === undefined) {
    writer.write("null");
    return;
  }
  if (typeof value === "string") {
    writer.write(JSON.stringify(value));
    return;
  }
  if (typeof value === "number") {
    writer.write(
      Number.isFinite(value)
        ? JSON.stringify(Object.is(value, -0) ? 0 : value)
        : "null",
    );
    return;
  }
  if (typeof value === "boolean") {
    writer.write(value ? "true" : "false");
    return;
  }
  if (typeof value === "bigint") {
    writer.write(JSON.stringify(value.toString()));
    return;
  }
  if (typeof value !== "object") {
    writer.write("null");
    return;
  }
  if (ancestors.has(value))
    throw new TypeError("Replay fingerprints cannot contain circular values.");
  ancestors.add(value);
  if (Array.isArray(value)) {
    writer.write("[");
    value.forEach((entry, index) => {
      if (index) writer.write(",");
      writeCanonical(entry, writer, ancestors);
    });
    writer.write("]");
  } else if (value instanceof Date) {
    writer.write(JSON.stringify(value.toISOString()));
  } else {
    const object = value as JsonRecord;
    const keys = Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort();
    writer.write("{");
    keys.forEach((key, index) => {
      if (index) writer.write(",");
      writer.write(JSON.stringify(key));
      writer.write(":");
      writeCanonical(object[key], writer, ancestors);
    });
    writer.write("}");
  }
  ancestors.delete(value);
}

/** Stable, non-cryptographic fingerprint for deterministic replay comparison. */
export function stableReplayFingerprint(value: unknown): string {
  const writer = new FingerprintWriter();
  writeCanonical(value, writer, new Set<object>());
  return writer.digest();
}

function frameFingerprint(frame: ReplayFrame): string {
  return stableReplayFingerprint(frame);
}

function integrityManifest(
  recording: Omit<ReplayRecording, "integrity">,
  integrity: Omit<ReplayIntegrity, "manifestHash">,
): unknown {
  return {
    schemaVersion: recording.schemaVersion,
    protocolVersion: recording.protocolVersion,
    snapshotSchemaVersion: recording.snapshotSchemaVersion,
    simulationVersion: recording.simulationVersion,
    fixedStepSeconds: recording.fixedStepSeconds,
    sessionId: recording.sessionId,
    recordedAt: recording.recordedAt,
    seed: recording.seed,
    airport: recording.airport,
    sharing: recording.sharing,
    initialStateHash: integrity.initialStateHash,
    frameHashes: integrity.frameHashes,
    commandHash: integrity.commandHash,
    eventHash: integrity.eventHash,
    weatherHash: integrity.weatherHash,
    soundHash: integrity.soundHash,
    markerHash: integrity.markerHash,
  };
}

function completeIntegrity(
  recording: Omit<ReplayRecording, "integrity">,
  frameHashes: string[],
): ReplayIntegrity {
  const partial = {
    algorithm: REPLAY_FINGERPRINT_ALGORITHM,
    canonicalization: REPLAY_CANONICALIZATION,
    initialStateHash: stableReplayFingerprint(recording.initialState),
    frameHashes,
    commandHash: stableReplayFingerprint(recording.commands),
    eventHash: stableReplayFingerprint(recording.events),
    weatherHash: stableReplayFingerprint(recording.weatherHistory),
    soundHash: stableReplayFingerprint(recording.soundEvents),
    markerHash: stableReplayFingerprint(recording.markers),
  } satisfies Omit<ReplayIntegrity, "manifestHash">;
  return {
    ...partial,
    manifestHash: stableReplayFingerprint(
      integrityManifest(recording, partial),
    ),
  };
}

export function buildReplayIntegrity(
  recording: Omit<ReplayRecording, "integrity">,
): ReplayIntegrity {
  return completeIntegrity(recording, recording.frames.map(frameFingerprint));
}

export async function buildReplayIntegrityAsync(
  recording: Omit<ReplayRecording, "integrity">,
  options: ReplayAsyncOptions = {},
): Promise<ReplayIntegrity> {
  const yieldEveryFrames = Math.max(
    1,
    Math.trunc(options.yieldEveryFrames ?? 4),
  );
  const yieldControl =
    options.yieldControl ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const frameHashes: string[] = [];
  for (let index = 0; index < recording.frames.length; index += 1) {
    frameHashes.push(frameFingerprint(recording.frames[index]));
    if (
      (index + 1) % yieldEveryFrames === 0 &&
      index + 1 < recording.frames.length
    )
      await yieldControl();
  }
  return completeIntegrity(recording, frameHashes);
}

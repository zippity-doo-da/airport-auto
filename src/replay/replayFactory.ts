import { CONTROL_REPLAY_SCHEMA_VERSION } from "../control/controlProtocol";
import {
  buildReplayIntegrity,
  buildReplayIntegrityAsync,
} from "./replayFingerprint";
import { deriveReplayMarkers } from "./replayMarkers";
import type {
  ReplayAsyncOptions,
  ReplayRecording,
  ReplayRecordingDraft,
} from "./replayTypes";

export function createReplayRecording(
  draft: ReplayRecordingDraft,
): ReplayRecording {
  const withoutIntegrity: Omit<ReplayRecording, "integrity"> = {
    ...draft,
    schemaVersion: CONTROL_REPLAY_SCHEMA_VERSION,
    markers: deriveReplayMarkers(draft.events, draft.frames),
  };
  return {
    ...withoutIntegrity,
    integrity: buildReplayIntegrity(withoutIntegrity),
  };
}

export async function createReplayRecordingAsync(
  draft: ReplayRecordingDraft,
  options: ReplayAsyncOptions = {},
): Promise<ReplayRecording> {
  const withoutIntegrity: Omit<ReplayRecording, "integrity"> = {
    ...draft,
    schemaVersion: CONTROL_REPLAY_SCHEMA_VERSION,
    markers: deriveReplayMarkers(draft.events, draft.frames),
  };
  return {
    ...withoutIntegrity,
    integrity: await buildReplayIntegrityAsync(withoutIntegrity, options),
  };
}

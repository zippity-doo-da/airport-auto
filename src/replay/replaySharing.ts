import type { AirportControlCommand } from "../control/controlProtocol";
import type { AirportState, ReplayFrame } from "../simulation/types";
import {
  createReplayRecording,
  createReplayRecordingAsync,
} from "./replayFactory";
import {
  isRecord,
  type JsonRecord,
  type ReplayAsyncOptions,
  type ReplayRecording,
  type ReplayRecordingDraft,
  type ReplaySeedLinkOptions,
  type ReplayTelemetryEvent,
} from "./replayTypes";

export function buildReplaySeedLink(
  baseUrl: string,
  options: ReplaySeedLinkOptions,
): string {
  const url = new URL(baseUrl);
  url.hash = "";
  url.search = "";
  url.searchParams.set("airport", options.airport.toUpperCase());
  url.searchParams.set("seed", String(Math.max(0, Math.trunc(options.seed))));
  const optional: Array<[string, string | number | undefined]> = [
    ["mode", options.mode],
    ["scenario", options.scenario],
    ["density", options.density],
    ["rules", options.rules],
    ["weather", options.weather],
    [
      "windDir",
      options.windDirectionDegrees === undefined
        ? undefined
        : Math.round(options.windDirectionDegrees),
    ],
    ["wind", options.windSpeed],
    ["runwayConfig", options.runwayConfiguration],
    ["lighting", options.lighting],
    ["season", options.season],
    ["palette", options.palette],
  ];
  for (const [key, value] of optional) {
    if (value !== undefined && value !== "")
      url.searchParams.set(key, String(value));
  }
  if (options.hazards) url.searchParams.set("hazards", "1");
  if (options.autostart !== false) url.searchParams.set("autostart", "1");
  return url.toString();
}

const SHARED_STATE_REDACTED_KEYS = new Set([
  "actorId",
  "clientId",
  "requestId",
  "commandId",
  "eventKey",
  "sessionId",
  "causedByCommandId",
  "causedByControllerDecisionId",
  "causedByEventId",
  "token",
  "credential",
  "endpoint",
  "payload",
  "reason",
  "detail",
  "feedback",
  "note",
  "rationale",
]);

function redactSharedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSharedValue);
  if (!isRecord(value)) return value;
  const redacted: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!SHARED_STATE_REDACTED_KEYS.has(key))
      redacted[key] = redactSharedValue(entry);
  }
  return redacted;
}

function sharedReplayDraft(recording: ReplayRecording): ReplayRecordingDraft {
  const commands = recording.commands.map((entry, index) => {
    const sequence = index + 1;
    return {
      ...entry,
      sequence,
      eventId: sequence,
      eventKey: `shared:${sequence}`,
      requestId: `shared-request-${sequence}`,
      commandId: `shared-command-${sequence}`,
      clientId: null,
      actorId: null,
      source: "replay" as const,
      command: redactSharedValue(entry.command) as AirportControlCommand,
      reason: entry.accepted ? "accepted" : "rejected",
    };
  });
  const events = recording.events.map((event, index): ReplayTelemetryEvent => {
    const sequence = index + 1;
    return {
      protocolVersion: event.protocolVersion,
      apiVersion: event.apiVersion,
      sessionId: "shared-session",
      eventId: sequence,
      eventKey: `shared:${sequence}`,
      sequence,
      airport: event.airport,
      elapsed: event.elapsed,
      type: event.type,
      flightId: event.flightId,
      callsign: event.callsign,
      runway: event.runway,
      phase: event.phase,
      taxiway: event.taxiway,
      accepted: event.accepted,
    };
  });
  const date = new Date(recording.recordedAt);
  const recordedAt = Number.isNaN(date.valueOf())
    ? new Date(0).toISOString()
    : new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      ).toISOString();
  return {
    protocolVersion: recording.protocolVersion,
    snapshotSchemaVersion: recording.snapshotSchemaVersion,
    simulationVersion: recording.simulationVersion,
    fixedStepSeconds: recording.fixedStepSeconds,
    sessionId: "shared-session",
    recordedAt,
    seed: recording.seed,
    airport: structuredClone(recording.airport),
    sharing: {
      classification: "shareable-redacted",
      containsControllerIdentity: false,
      containsCorrelationIds: false,
      containsFreeText: false,
      automaticUpload: false,
      redactions: [
        "controller, client, request, command, event, and session correlation identity",
        "event payloads and causal identifiers",
        "free-text reason, detail, feedback, note, and rationale fields",
        "time-of-day precision beyond the UTC date",
      ],
    },
    initialState: redactSharedValue(recording.initialState) as AirportState,
    commands,
    weatherHistory: events.filter(
      (event) =>
        event.type.startsWith("weather") ||
        event.type.startsWith("command:setWeather"),
    ),
    soundEvents: structuredClone(recording.soundEvents),
    events,
    frames: recording.frames.map((frame) => ({
      ...frame,
      score: { ...frame.score },
      flights: frame.flights.map((flight) => ({ ...flight })),
      predictions: redactSharedValue(
        frame.predictions,
      ) as ReplayFrame["predictions"],
      surfaceSafety: frame.surfaceSafety
        ? (redactSharedValue(
            frame.surfaceSafety,
          ) as ReplayFrame["surfaceSafety"])
        : undefined,
      state: redactSharedValue(frame.state) as AirportState,
    })),
  };
}

export function createShareableReplayRecording(
  recording: ReplayRecording,
): ReplayRecording {
  return createReplayRecording(sharedReplayDraft(recording));
}

export function createShareableReplayRecordingAsync(
  recording: ReplayRecording,
  options: ReplayAsyncOptions = {},
): Promise<ReplayRecording> {
  return createReplayRecordingAsync(sharedReplayDraft(recording), options);
}

export function replayFilename(
  recording: Pick<
    ReplayRecording,
    "airport" | "seed" | "recordedAt" | "sharing"
  >,
): string {
  const stamp = recording.recordedAt.replace(/[:.]/g, "-");
  const sharing =
    recording.sharing.classification === "shareable-redacted" ? "-shared" : "";
  return `${recording.airport.code.toLowerCase()}-${recording.seed}-${stamp}${sharing}.airport-auto-replay.json`;
}

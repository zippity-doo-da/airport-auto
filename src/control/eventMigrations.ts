import {
  CONTROL_API_VERSION,
  CONTROL_PROTOCOL_VERSION,
  getAirportControlProtocol,
  validateProtocolValue,
} from "./controlProtocol";
import type { ReplayTelemetryEvent } from "../replay/replayTypes";
import {
  migrateVersionedRecord,
  type SchemaMigrationResult,
} from "../persistence/schemaMigrations";

export const STANDALONE_EVENT_SCHEMA_VERSION = 1 as const;

export interface StoredAirportTelemetryEvent extends Record<string, unknown> {
  schemaVersion: typeof STANDALONE_EVENT_SCHEMA_VERSION;
  event: ReplayTelemetryEvent;
}

export interface LegacyEventDefaults {
  sessionId?: string;
  airport?: string;
  eventId?: number;
  elapsed?: number;
}

function positiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0
    ? (value as number)
    : fallback;
}

function migrateLegacyEvent(
  input: Record<string, unknown>,
  defaults: LegacyEventDefaults,
): StoredAirportTelemetryEvent {
  const source =
    input.event && typeof input.event === "object" && !Array.isArray(input.event)
      ? (input.event as Record<string, unknown>)
      : input;
  const eventId = positiveInteger(
    source.eventId ?? source.sequence,
    defaults.eventId ?? 1,
  );
  const sequence = positiveInteger(source.sequence, eventId);
  const sessionId =
    typeof source.sessionId === "string" && source.sessionId.length > 0
      ? source.sessionId
      : (defaults.sessionId ?? "legacy-session");
  const event: ReplayTelemetryEvent = {
    ...source,
    protocolVersion: CONTROL_PROTOCOL_VERSION,
    apiVersion: CONTROL_API_VERSION,
    sessionId,
    eventId,
    eventKey:
      typeof source.eventKey === "string" && source.eventKey.length > 0
        ? source.eventKey
        : `${sessionId}:${eventId}`,
    sequence,
    airport:
      typeof source.airport === "string" && source.airport.length > 0
        ? source.airport
        : (defaults.airport ?? "LOCAL"),
    elapsed:
      typeof source.elapsed === "number" && Number.isFinite(source.elapsed)
        ? Math.max(0, source.elapsed)
        : Math.max(0, defaults.elapsed ?? 0),
    type:
      typeof source.type === "string" && source.type.length > 0
        ? source.type
        : "clear",
  } as ReplayTelemetryEvent;
  return {
    schemaVersion: STANDALONE_EVENT_SCHEMA_VERSION,
    event,
  };
}

function validateStoredEvent(value: Record<string, unknown>): string | null {
  if (value.schemaVersion !== STANDALONE_EVENT_SCHEMA_VERSION)
    return "schemaVersion does not match the standalone-event schema";
  const issues = validateProtocolValue(
    value.event,
    getAirportControlProtocol().schemas.event,
  );
  return issues.length > 0
    ? issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")
    : null;
}

export function migrateStandaloneTelemetryEvent(
  input: unknown,
  defaults: LegacyEventDefaults = {},
): SchemaMigrationResult<StoredAirportTelemetryEvent> {
  return migrateVersionedRecord(input, {
    documentName: "Standalone telemetry event",
    currentVersion: STANDALONE_EVENT_SCHEMA_VERSION,
    unversionedVersion: 0,
    steps: [
      {
        fromVersion: 0,
        toVersion: 1,
        migrate: (value) => migrateLegacyEvent(value, defaults),
      },
    ],
    validate: validateStoredEvent,
    finalize: (value) => structuredClone(value) as StoredAirportTelemetryEvent,
  });
}

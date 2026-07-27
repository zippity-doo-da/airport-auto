import {
  CONTROL_PROTOCOL_VERSION,
  validateAirportControlCommand,
  validateAirportControlEnvelope,
  type AirportControlCommand,
  type AirportControlRequestEnvelope,
} from "./controlProtocol";
import {
  migrateVersionedRecord,
  type SchemaMigrationResult,
} from "../persistence/schemaMigrations";

export const STANDALONE_COMMAND_SCHEMA_VERSION = 1 as const;

export interface StoredAirportControlCommand extends Record<string, unknown> {
  schemaVersion: typeof STANDALONE_COMMAND_SCHEMA_VERSION;
  protocolVersion: string;
  command: AirportControlCommand;
}

export interface BroadcastRequestMigrationResult {
  accepted: boolean;
  reason: string;
  migrated: boolean;
  request: { type: "request"; envelope: AirportControlRequestEnvelope } | null;
}

function validateStoredCommand(value: Record<string, unknown>): string | null {
  if (value.schemaVersion !== STANDALONE_COMMAND_SCHEMA_VERSION)
    return "schemaVersion does not match the standalone-command schema";
  if (typeof value.protocolVersion !== "string")
    return "protocolVersion must be a string";
  const validation = validateAirportControlCommand(value.command);
  return validation.valid
    ? null
    : validation.issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ");
}

export function migrateStandaloneControlCommand(
  input: unknown,
): SchemaMigrationResult<StoredAirportControlCommand> {
  return migrateVersionedRecord(input, {
    documentName: "Standalone control command",
    currentVersion: STANDALONE_COMMAND_SCHEMA_VERSION,
    unversionedVersion: 0,
    steps: [
      {
        fromVersion: 0,
        toVersion: 1,
        migrate(value) {
          const command =
            value.command && typeof value.command === "object"
              ? value.command
              : value;
          return {
            schemaVersion: STANDALONE_COMMAND_SCHEMA_VERSION,
            protocolVersion:
              typeof value.protocolVersion === "string"
                ? value.protocolVersion
                : CONTROL_PROTOCOL_VERSION,
            command,
          };
        },
      },
    ],
    validate: validateStoredCommand,
    finalize: (value) => structuredClone(value) as StoredAirportControlCommand,
  });
}

export function migrateBroadcastControlRequest(
  input: unknown,
  fallbackRequestId = "legacy-broadcast-request",
): BroadcastRequestMigrationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      accepted: false,
      reason: "Broadcast control message must be an object.",
      migrated: false,
      request: null,
    };
  }
  const message = input as Record<string, unknown>;
  if (message.type === "request") {
    const validation = validateAirportControlEnvelope(message.envelope);
    return validation.valid && validation.envelope
      ? {
          accepted: true,
          reason: "Formal BroadcastChannel request accepted.",
          migrated: false,
          request: { type: "request", envelope: validation.envelope },
        }
      : {
          accepted: false,
          reason: validation.issues
            .map((issue) => `${issue.path} ${issue.message}`)
            .join("; "),
          migrated: false,
          request: null,
        };
  }
  if (message.type !== "command") {
    return {
      accepted: false,
      reason: "Broadcast control message type is unsupported.",
      migrated: false,
      request: null,
    };
  }
  const commandMigration = migrateStandaloneControlCommand(message.command);
  if (!commandMigration.accepted || !commandMigration.value) {
    return {
      accepted: false,
      reason: commandMigration.reason,
      migrated: false,
      request: null,
    };
  }
  const envelope: AirportControlRequestEnvelope = {
    protocolVersion: commandMigration.value.protocolVersion,
    requestId:
      typeof message.requestId === "string" && message.requestId.length > 0
        ? message.requestId
        : fallbackRequestId,
    source: "broadcast",
    command: commandMigration.value.command,
  };
  if (typeof message.clientId === "string" && message.clientId.length > 0)
    envelope.clientId = message.clientId;
  const validation = validateAirportControlEnvelope(envelope);
  return validation.valid
    ? {
        accepted: true,
        reason: "Legacy BroadcastChannel command migrated to a formal request.",
        migrated: true,
        request: { type: "request", envelope },
      }
    : {
        accepted: false,
        reason: validation.issues
          .map((issue) => `${issue.path} ${issue.message}`)
          .join("; "),
        migrated: true,
        request: null,
      };
}

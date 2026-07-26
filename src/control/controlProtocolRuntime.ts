import {
  AIRPORT_CONTROL_COMMAND_DEFINITIONS,
  CONTROL_API_VERSION,
  CONTROL_BROADCAST_CHANNEL,
  CONTROL_PROTOCOL_VERSION,
  CONTROL_REPLAY_SCHEMA_VERSION,
  CONTROL_SNAPSHOT_SCHEMA_VERSION,
  type AirportControlAction,
  type AirportControlCommand,
  type AirportControlRequestEnvelope,
  type ControlProtocolExpectations,
  type ProtocolJsonSchema,
  type ProtocolJsonType,
} from "./controlCommandCatalog";
import { AIRPORT_DOMAIN_EVENT_TYPES } from "./eventTypes";

const CONTROLLER_STATIONS = [
  "approach",
  "tower",
  "ground",
  "ramp",
  "supervisor",
] as const;
const stringSchema = (
  description: string,
  values?: readonly string[],
): ProtocolJsonSchema => ({
  type: "string",
  description,
  ...(values ? { enum: [...values] } : { minLength: 1 }),
});
const controllerStationSchema = stringSchema(
  "Controller station.",
  CONTROLLER_STATIONS,
);

const commandSchema: ProtocolJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `airport-auto://schema/command/${CONTROL_PROTOCOL_VERSION}`,
  title: "Airport Auto command",
  description:
    "Exactly one versioned Airport Auto command. Unknown parameters are rejected.",
  oneOf: Object.values(AIRPORT_CONTROL_COMMAND_DEFINITIONS).map(
    (definition) => definition.schema,
  ),
};

const requestEnvelopeSchema: ProtocolJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `airport-auto://schema/request/${CONTROL_PROTOCOL_VERSION}`,
  title: "Airport Auto control request envelope",
  type: "object",
  properties: {
    protocolVersion: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    requestId: { type: "string", minLength: 1, maxLength: 128 },
    clientId: { type: "string", minLength: 1, maxLength: 128 },
    source: stringSchema("Command source.", [
      "page",
      "broadcast",
      "agent",
      "replay",
      "test",
    ]),
    authority: {
      type: "object",
      properties: {
        station: controllerStationSchema,
        actorId: { type: "string", minLength: 1, maxLength: 128 },
      },
      required: ["station"],
      additionalProperties: false,
    },
    expects: {
      type: "object",
      properties: {
        apiVersion: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
        snapshotSchemaVersion: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
    command: { $ref: commandSchema.$id },
  },
  required: ["protocolVersion", "requestId", "command"],
  additionalProperties: false,
};

const telemetryEventSchema: ProtocolJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `airport-auto://schema/event/${CONTROL_PROTOCOL_VERSION}`,
  title: "Airport Auto telemetry event",
  type: "object",
  properties: {
    protocolVersion: { const: CONTROL_PROTOCOL_VERSION, type: "string" },
    apiVersion: { const: CONTROL_API_VERSION, type: "string" },
    sessionId: { type: "string", minLength: 1 },
    eventId: { type: "integer", minimum: 1 },
    eventKey: { type: "string", minLength: 1 },
    sequence: { type: "integer", minimum: 1 },
    airport: { type: "string", minLength: 1 },
    elapsed: { type: "number", minimum: 0 },
    type: {
      anyOf: [
        { enum: [...AIRPORT_DOMAIN_EVENT_TYPES], type: "string" },
        { type: "string", pattern: "^(command|challenge):[A-Za-z0-9-]+$" },
      ],
    },
    causedByCommandId: { type: "string", minLength: 1 },
    causedByControllerDecisionId: { type: "string", minLength: 1 },
    causedByEventId: { type: "integer", minimum: 1 },
    flightId: { type: "integer", minimum: 1 },
    callsign: { type: "string", minLength: 1 },
    runway: { type: "integer", minimum: 0 },
    phase: { type: "string", minLength: 1 },
    taxiway: { type: "string", minLength: 1 },
    accepted: { type: "boolean" },
    detail: { type: "string" },
    payload: {},
  },
  required: [
    "protocolVersion",
    "apiVersion",
    "sessionId",
    "eventId",
    "eventKey",
    "sequence",
    "airport",
    "elapsed",
    "type",
  ],
  additionalProperties: true,
};

const resultSchema: ProtocolJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `airport-auto://schema/result/${CONTROL_PROTOCOL_VERSION}`,
  title: "Airport Auto command result",
  type: "object",
  properties: {
    protocolVersion: { const: CONTROL_PROTOCOL_VERSION, type: "string" },
    apiVersion: { const: CONTROL_API_VERSION, type: "string" },
    sessionId: { type: "string", minLength: 1 },
    requestId: { type: "string", minLength: 1 },
    clientId: { oneOf: [{ type: "null" }, { type: "string", minLength: 1 }] },
    commandId: { type: "string", minLength: 1 },
    source: stringSchema("Command source.", [
      "page",
      "broadcast",
      "agent",
      "replay",
      "test",
    ]),
    action: {
      oneOf: [
        { type: "null" },
        {
          type: "string",
          enum: Object.keys(AIRPORT_CONTROL_COMMAND_DEFINITIONS),
        },
      ],
    },
    accepted: { type: "boolean" },
    reason: { type: "string" },
    sequence: { type: "integer", minimum: 1 },
    eventId: { type: "integer", minimum: 1 },
    eventKey: { type: "string", minLength: 1 },
    resultingState: { type: "object" },
    snapshot: { type: "object" },
    authority: {
      type: "object",
      properties: {
        rule: {
          type: "string",
          enum: [
            ...new Set(
              Object.values(AIRPORT_CONTROL_COMMAND_DEFINITIONS).map(
                (definition) => definition.authority.rule,
              ),
            ),
          ],
        },
        assertedStation: { oneOf: [{ type: "null" }, controllerStationSchema] },
        effectiveStation: controllerStationSchema,
        resultingStation: controllerStationSchema,
        requiredStations: {
          type: "array",
          items: controllerStationSchema,
          uniqueItems: true,
        },
        flightOwnership: { type: "boolean" },
        safetyArbiter: { type: "boolean" },
        enforced: { const: true, type: "boolean" },
        actorId: {
          oneOf: [{ type: "null" }, { type: "string", minLength: 1 }],
        },
      },
      required: [
        "rule",
        "assertedStation",
        "effectiveStation",
        "resultingStation",
        "requiredStations",
        "flightOwnership",
        "safetyArbiter",
        "enforced",
        "actorId",
      ],
      additionalProperties: false,
    },
    compatibility: {
      type: "object",
      properties: {
        compatible: { type: "boolean" },
        requestedProtocolVersion: { type: "string" },
        currentProtocolVersion: {
          const: CONTROL_PROTOCOL_VERSION,
          type: "string",
        },
        requestedApiVersion: { oneOf: [{ type: "null" }, { type: "string" }] },
        currentApiVersion: { const: CONTROL_API_VERSION, type: "string" },
        requestedSnapshotSchemaVersion: {
          oneOf: [{ type: "null" }, { type: "integer", minimum: 1 }],
        },
        currentSnapshotSchemaVersion: {
          const: CONTROL_SNAPSHOT_SCHEMA_VERSION,
          type: "integer",
        },
        warnings: { type: "array", items: { type: "string" } },
        reason: { type: "string" },
      },
      required: [
        "compatible",
        "requestedProtocolVersion",
        "currentProtocolVersion",
        "requestedApiVersion",
        "currentApiVersion",
        "requestedSnapshotSchemaVersion",
        "currentSnapshotSchemaVersion",
        "warnings",
        "reason",
      ],
      additionalProperties: false,
    },
    validation: {
      type: "object",
      properties: {
        valid: { type: "boolean" },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              keyword: { type: "string" },
              message: { type: "string" },
            },
            required: ["path", "keyword", "message"],
            additionalProperties: false,
          },
        },
      },
      required: ["valid", "issues"],
      additionalProperties: false,
    },
  },
  required: [
    "protocolVersion",
    "apiVersion",
    "sessionId",
    "requestId",
    "clientId",
    "commandId",
    "source",
    "action",
    "accepted",
    "reason",
    "sequence",
    "eventId",
    "eventKey",
    "resultingState",
    "snapshot",
    "authority",
    "compatibility",
    "validation",
  ],
  additionalProperties: true,
};

const broadcastMessageSchema: ProtocolJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `airport-auto://schema/broadcast/${CONTROL_PROTOCOL_VERSION}`,
  title: "Airport Auto BroadcastChannel message",
  description:
    "Formal request/response/event/ready envelopes share the airport-auto channel. Legacy command messages remain accepted for API 2.x.",
  oneOf: [
    {
      type: "object",
      properties: {
        type: { const: "request", type: "string" },
        envelope: { $ref: requestEnvelopeSchema.$id },
      },
      required: ["type", "envelope"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "response", type: "string" },
        requestId: { type: "string", minLength: 1 },
        result: { $ref: resultSchema.$id },
      },
      required: ["type", "requestId", "result"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "event", type: "string" },
        event: { $ref: telemetryEventSchema.$id },
      },
      required: ["type", "event"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "ready", type: "string" },
        version: { const: CONTROL_API_VERSION, type: "string" },
        protocolVersion: { const: CONTROL_PROTOCOL_VERSION, type: "string" },
        apiVersion: { const: CONTROL_API_VERSION, type: "string" },
        sessionId: { type: "string", minLength: 1 },
        snapshot: { type: "object" },
      },
      required: [
        "type",
        "version",
        "protocolVersion",
        "apiVersion",
        "sessionId",
        "snapshot",
      ],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "Deprecated API-2.x command transport alias.",
      properties: {
        type: { const: "command", type: "string" },
        requestId: { type: "string", minLength: 1 },
        clientId: { type: "string", minLength: 1 },
        command: { $ref: commandSchema.$id },
      },
      required: ["type", "command"],
      additionalProperties: false,
    },
  ],
};

export interface ProtocolValidationIssue {
  path: string;
  keyword: string;
  message: string;
}

export interface CommandValidationResult {
  valid: boolean;
  action: AirportControlAction | null;
  issues: ProtocolValidationIssue[];
  command?: AirportControlCommand;
}

export interface ProtocolCompatibilityAssessment {
  compatible: boolean;
  requestedProtocolVersion: string;
  currentProtocolVersion: typeof CONTROL_PROTOCOL_VERSION;
  requestedApiVersion: string | null;
  currentApiVersion: typeof CONTROL_API_VERSION;
  requestedSnapshotSchemaVersion: number | null;
  currentSnapshotSchemaVersion: typeof CONTROL_SNAPSHOT_SCHEMA_VERSION;
  warnings: string[];
  reason: string;
}

export interface EnvelopeValidationResult {
  valid: boolean;
  issues: ProtocolValidationIssue[];
  compatibility: ProtocolCompatibilityAssessment;
  envelope?: AirportControlRequestEnvelope;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueMatchesType(value: unknown, type: ProtocolJsonType): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isRecord(value);
  if (type === "integer")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isInteger(value)
    );
  if (type === "number")
    return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function schemaIssues(
  value: unknown,
  schema: ProtocolJsonSchema,
  path: string,
): ProtocolValidationIssue[] {
  if (schema.oneOf) {
    const matches = schema.oneOf
      .map((candidate) => schemaIssues(value, candidate, path))
      .filter((issues) => issues.length === 0);
    return matches.length === 1
      ? []
      : [
          {
            path,
            keyword: "oneOf",
            message: `must match exactly one of ${schema.oneOf.length} schemas`,
          },
        ];
  }
  if (schema.anyOf) {
    const matches = schema.anyOf.some(
      (candidate) => schemaIssues(value, candidate, path).length === 0,
    );
    return matches
      ? []
      : [
          {
            path,
            keyword: "anyOf",
            message: `must match at least one of ${schema.anyOf.length} schemas`,
          },
        ];
  }
  const issues: ProtocolValidationIssue[] = [];
  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    issues.push({
      path,
      keyword: "const",
      message: `must equal ${JSON.stringify(schema.const)}`,
    });
    return issues;
  }
  if (
    schema.enum &&
    !schema.enum.some((candidate) => Object.is(candidate, value))
  ) {
    issues.push({
      path,
      keyword: "enum",
      message: `must be one of ${schema.enum.map((candidate) => JSON.stringify(candidate)).join(", ")}`,
    });
    return issues;
  }
  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((type) => valueMatchesType(value, type))) {
      issues.push({
        path,
        keyword: "type",
        message: `must be ${allowed.join(" or ")}`,
      });
      return issues;
    }
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      issues.push({
        path,
        keyword: "finite",
        message: "must be a finite JSON number",
      });
    if (schema.minimum !== undefined && value < schema.minimum)
      issues.push({
        path,
        keyword: "minimum",
        message: `must be at least ${schema.minimum}`,
      });
    if (schema.maximum !== undefined && value > schema.maximum)
      issues.push({
        path,
        keyword: "maximum",
        message: `must be at most ${schema.maximum}`,
      });
    if (
      schema.exclusiveMinimum !== undefined &&
      value <= schema.exclusiveMinimum
    )
      issues.push({
        path,
        keyword: "exclusiveMinimum",
        message: `must be greater than ${schema.exclusiveMinimum}`,
      });
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      issues.push({
        path,
        keyword: "minLength",
        message: `must contain at least ${schema.minLength} character(s)`,
      });
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      issues.push({
        path,
        keyword: "maxLength",
        message: `must contain at most ${schema.maxLength} character(s)`,
      });
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      issues.push({
        path,
        keyword: "pattern",
        message: `must match ${schema.pattern}`,
      });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      issues.push({
        path,
        keyword: "minItems",
        message: `must contain at least ${schema.minItems} item(s)`,
      });
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      issues.push({
        path,
        keyword: "maxItems",
        message: `must contain at most ${schema.maxItems} item(s)`,
      });
    if (
      schema.uniqueItems &&
      new Set(value.map((item) => JSON.stringify(item))).size !== value.length
    )
      issues.push({
        path,
        keyword: "uniqueItems",
        message: "must not contain duplicate items",
      });
    if (schema.items)
      value.forEach((item, index) =>
        issues.push(...schemaIssues(item, schema.items!, `${path}[${index}]`)),
      );
  }
  if (isRecord(value) && schema.properties) {
    for (const required of schema.required ?? []) {
      if (!(required in value))
        issues.push({
          path: `${path}.${required}`,
          keyword: "required",
          message: "is required",
        });
    }
    for (const [key, child] of Object.entries(value)) {
      const propertySchema = schema.properties[key];
      if (propertySchema)
        issues.push(...schemaIssues(child, propertySchema, `${path}.${key}`));
      else if (schema.additionalProperties === false)
        issues.push({
          path: `${path}.${key}`,
          keyword: "additionalProperties",
          message: "is not a recognized property",
        });
    }
  }
  return issues;
}

export function validateProtocolValue(
  value: unknown,
  schema: ProtocolJsonSchema,
  path = "$",
): ProtocolValidationIssue[] {
  return schemaIssues(value, schema, path);
}

export function validateAirportControlCommand(
  value: unknown,
): CommandValidationResult {
  if (!isRecord(value)) {
    return {
      valid: false,
      action: null,
      issues: [
        { path: "$", keyword: "type", message: "command must be an object" },
      ],
    };
  }
  const action =
    typeof value.action === "string" &&
    value.action in AIRPORT_CONTROL_COMMAND_DEFINITIONS
      ? (value.action as AirportControlAction)
      : null;
  if (!action) {
    return {
      valid: false,
      action: null,
      issues: [
        {
          path: "$.action",
          keyword: "enum",
          message: "action is not a recognized Airport Auto command",
        },
      ],
    };
  }
  const issues = schemaIssues(
    value,
    AIRPORT_CONTROL_COMMAND_DEFINITIONS[action].schema,
    "$",
  );
  return issues.length
    ? { valid: false, action, issues }
    : {
        valid: true,
        action,
        issues: [],
        command: value as AirportControlCommand,
      };
}

function semanticVersionParts(
  version: string,
): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(
  first: [number, number, number],
  second: [number, number, number],
): number {
  for (let index = 0; index < 3; index += 1) {
    if (first[index] !== second[index]) return first[index] - second[index];
  }
  return 0;
}

export function assessProtocolCompatibility(
  requestedProtocolVersion: string,
  expects: ControlProtocolExpectations = {},
): ProtocolCompatibilityAssessment {
  const warnings: string[] = [];
  const requestedProtocol = semanticVersionParts(requestedProtocolVersion);
  const currentProtocol = semanticVersionParts(CONTROL_PROTOCOL_VERSION)!;
  const requestedApi = expects.apiVersion
    ? semanticVersionParts(expects.apiVersion)
    : null;
  const currentApi = semanticVersionParts(CONTROL_API_VERSION)!;
  let compatible = true;
  let reason = "compatible";
  if (!requestedProtocol) {
    compatible = false;
    reason = "protocolVersion must use semantic versioning";
  } else if (requestedProtocol[0] !== currentProtocol[0]) {
    compatible = false;
    reason = `protocol major ${requestedProtocol[0]} is incompatible with ${currentProtocol[0]}`;
  } else if (compareVersions(requestedProtocol, currentProtocol) > 0) {
    compatible = false;
    reason = `protocol ${requestedProtocolVersion} is newer than ${CONTROL_PROTOCOL_VERSION}`;
  } else if (requestedProtocolVersion !== CONTROL_PROTOCOL_VERSION) {
    warnings.push(
      `protocol ${requestedProtocolVersion} is accepted by the ${CONTROL_PROTOCOL_VERSION} major-version compatibility rule`,
    );
  }
  if (compatible && expects.apiVersion) {
    if (!requestedApi) {
      compatible = false;
      reason = "expected apiVersion must use semantic versioning";
    } else if (
      requestedApi[0] !== currentApi[0] ||
      compareVersions(requestedApi, currentApi) > 0
    ) {
      compatible = false;
      reason = `required API ${expects.apiVersion} is not provided by ${CONTROL_API_VERSION}`;
    } else if (expects.apiVersion !== CONTROL_API_VERSION) {
      warnings.push(
        `API ${expects.apiVersion} requirement is satisfied by ${CONTROL_API_VERSION}`,
      );
    }
  }
  if (
    compatible &&
    expects.snapshotSchemaVersion !== undefined &&
    expects.snapshotSchemaVersion !== CONTROL_SNAPSHOT_SCHEMA_VERSION
  ) {
    compatible = false;
    reason = `snapshot schema ${expects.snapshotSchemaVersion} is incompatible with ${CONTROL_SNAPSHOT_SCHEMA_VERSION}`;
  }
  return {
    compatible,
    requestedProtocolVersion,
    currentProtocolVersion: CONTROL_PROTOCOL_VERSION,
    requestedApiVersion: expects.apiVersion ?? null,
    currentApiVersion: CONTROL_API_VERSION,
    requestedSnapshotSchemaVersion: expects.snapshotSchemaVersion ?? null,
    currentSnapshotSchemaVersion: CONTROL_SNAPSHOT_SCHEMA_VERSION,
    warnings,
    reason,
  };
}

export function validateAirportControlEnvelope(
  value: unknown,
): EnvelopeValidationResult {
  const fallbackCompatibility = assessProtocolCompatibility("0.0.0");
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [
        {
          path: "$",
          keyword: "type",
          message: "request envelope must be an object",
        },
      ],
      compatibility: fallbackCompatibility,
    };
  }
  const envelopeShape: ProtocolJsonSchema = {
    ...requestEnvelopeSchema,
    properties: {
      ...requestEnvelopeSchema.properties,
      command: {},
    },
  };
  const issues = schemaIssues(value, envelopeShape, "$");
  const commandValidation = validateAirportControlCommand(value.command);
  issues.push(
    ...commandValidation.issues.map((issue) => ({
      ...issue,
      path: issue.path.replace("$", "$.command"),
    })),
  );
  const expects = isRecord(value.expects)
    ? {
        apiVersion:
          typeof value.expects.apiVersion === "string"
            ? value.expects.apiVersion
            : undefined,
        snapshotSchemaVersion:
          typeof value.expects.snapshotSchemaVersion === "number"
            ? value.expects.snapshotSchemaVersion
            : undefined,
      }
    : {};
  const compatibility = assessProtocolCompatibility(
    typeof value.protocolVersion === "string" ? value.protocolVersion : "0.0.0",
    expects,
  );
  if (!compatibility.compatible)
    issues.push({
      path: "$.protocolVersion",
      keyword: "compatibility",
      message: compatibility.reason,
    });
  return issues.length || !commandValidation.command
    ? { valid: false, issues, compatibility }
    : {
        valid: true,
        issues: [],
        compatibility,
        envelope: value as unknown as AirportControlRequestEnvelope,
      };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getAirportControlProtocol() {
  const commands = Object.values(AIRPORT_CONTROL_COMMAND_DEFINITIONS);
  return cloneJson({
    schemaVersion: 1,
    protocolVersion: CONTROL_PROTOCOL_VERSION,
    apiVersion: CONTROL_API_VERSION,
    snapshotSchemaVersion: CONTROL_SNAPSHOT_SCHEMA_VERSION,
    replaySchemaVersion: CONTROL_REPLAY_SCHEMA_VERSION,
    channel: CONTROL_BROADCAST_CHANNEL,
    compatibility: {
      protocol:
        "Clients with the same protocol major are accepted when they do not require a newer minor/patch version.",
      api: "Clients may require an API version in the same major at or below the current version.",
      snapshot:
        "Snapshot consumers must request the exact schema version; snapshots are complete-state contracts.",
      unknownCommands:
        "Unknown actions and parameters are rejected. Existing 2.x bare request() and BroadcastChannel command messages remain supported.",
      authority:
        "An asserted station never grants authority. It must match the simulator-selected station; all commands pass through the same safety arbiter as the UI.",
      deprecation:
        "Deprecated aliases remain available through API major 2 and identify their canonical replacement in each command definition.",
    },
    causality: {
      sessionId: "Unique browser-page control session.",
      requestId: "Caller-supplied or locally generated request correlation ID.",
      commandId: "Unique accepted-or-rejected command attempt ID.",
      eventId:
        "Monotonic page-local numeric event ID retained for 2.x compatibility.",
      eventKey: "Globally unambiguous sessionId:eventId key.",
      causedByCommandId:
        "Links synchronous domain events to the command that produced them.",
      causedByControllerDecisionId:
        "Links autonomous domain events to the deterministic station decision that produced them.",
      causedByEventId:
        "Optional event-to-event causal parent for future asynchronous workflows.",
    },
    eventTypes: {
      domain: [...AIRPORT_DOMAIN_EVENT_TYPES],
      commandPattern: "^command:<action>$",
      challengePattern: "^challenge:<status>$",
    },
    commands,
    commandCount: commands.length,
    schemas: {
      command: commandSchema,
      requestEnvelope: requestEnvelopeSchema,
      result: resultSchema,
      event: telemetryEventSchema,
      broadcastMessage: broadcastMessageSchema,
    },
  });
}

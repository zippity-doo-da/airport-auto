import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const validationSource = `
import {
  AIRPORT_CONTROL_COMMAND_DEFINITIONS,
  AIRPORT_DOMAIN_EVENT_TYPES,
  CONTROL_API_VERSION,
  CONTROL_PROTOCOL_VERSION,
  CONTROL_REPLAY_SCHEMA_VERSION,
  CONTROL_SNAPSHOT_SCHEMA_VERSION,
  assessProtocolCompatibility,
  getAirportControlProtocol,
  validateAirportControlCommand,
  validateAirportControlEnvelope,
  validateProtocolValue,
} from './src/control/controlProtocol.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(CONTROL_PROTOCOL_VERSION === '1.2.0', 'control protocol version changed unexpectedly');
assert(CONTROL_API_VERSION === '2.30.0', 'control API version changed unexpectedly');
assert(CONTROL_SNAPSHOT_SCHEMA_VERSION === 32, 'snapshot schema version changed unexpectedly');
assert(CONTROL_REPLAY_SCHEMA_VERSION === 2, 'replay schema version changed unexpectedly');

const definitions = Object.values(AIRPORT_CONTROL_COMMAND_DEFINITIONS);
assert(definitions.length === 86, 'formal command catalog count changed unexpectedly');
assert(new Set(definitions.map((definition) => definition.action)).size === definitions.length, 'command actions are not unique');
assert(definitions.every((definition) => definition.schema.additionalProperties === false), 'a command schema permits unknown parameters');
assert(definitions.every((definition) => definition.compatibility.protocolMajor === 1), 'a command has the wrong protocol major');
assert(definitions.every((definition) => definition.authority.description.length > 20), 'a command authority rule lacks an explanation');
assert(definitions.every((definition) => definition.result.schemaRef.includes('/result/')), 'a command lacks a formal result contract');
assert(definitions.every((definition) => definition.result.commandEventType === 'command:' + definition.action), 'a command result names the wrong audit event');
for (const definition of definitions) {
  const result = validateAirportControlCommand(definition.example);
  assert(result.valid, definition.action + ' example failed: ' + result.issues.map((issue) => issue.path + ' ' + issue.message).join('; '));
  assert(result.action === definition.action, definition.action + ' example resolved to the wrong action');
}

assert(!validateAirportControlCommand({ action: 'teleportFlight', flightId: 1 }).valid, 'unknown command was accepted');
assert(!validateAirportControlCommand({ action: 'setSpeed' }).valid, 'missing command parameter was accepted');
assert(!validateAirportControlCommand({ action: 'pause', surprise: true }).valid, 'unknown command parameter was accepted');
assert(!validateAirportControlCommand({ action: 'setSpeed', value: Number.NaN }).valid, 'non-finite command number was accepted');
assert(validateAirportControlCommand({ action: 'issueRouteAmendment', flightId: 1 }).valid, 'optional route fix list became required');
assert(validateAirportControlCommand({ action: 'setControllerPolicyPreset', preset: 'realistic' }).valid, 'controller policy command was rejected');
assert(!validateAirportControlCommand({ action: 'setControllerPolicyPreset', preset: 'reckless' }).valid, 'unknown controller policy was accepted');

const envelope = {
  protocolVersion: CONTROL_PROTOCOL_VERSION,
  requestId: 'validator-request-1',
  clientId: 'validator',
  source: 'test',
  authority: { station: 'supervisor', actorId: 'protocol-validator' },
  expects: { apiVersion: CONTROL_API_VERSION, snapshotSchemaVersion: CONTROL_SNAPSHOT_SCHEMA_VERSION },
  command: { action: 'pause' },
};
const validEnvelope = validateAirportControlEnvelope(envelope);
assert(validEnvelope.valid && validEnvelope.compatibility.compatible, 'current formal request envelope was rejected');
assert(!validateAirportControlEnvelope({ ...envelope, protocolVersion: '2.0.0' }).valid, 'incompatible protocol major was accepted');
assert(!validateAirportControlEnvelope({ ...envelope, protocolVersion: '1.3.0' }).valid, 'newer unsupported protocol minor was accepted');
assert(!validateAirportControlEnvelope({ ...envelope, expects: { snapshotSchemaVersion: 29 } }).valid, 'incompatible snapshot schema was accepted');
assert(assessProtocolCompatibility('1.0.0', { apiVersion: '2.27.0' }).compatible, 'same-major prior protocol and API requirement was not accepted');

const protocol = getAirportControlProtocol();
assert(protocol.commandCount === definitions.length, 'protocol command count disagrees with definitions');
assert(protocol.commands.length === definitions.length, 'protocol command catalog is incomplete');
assert(protocol.schemas.command.oneOf.length === definitions.length, 'root command JSON Schema is incomplete');
assert(protocol.schemas.requestEnvelope.$id.includes('/request/'), 'request envelope schema lacks a stable ID');
assert(protocol.schemas.result.required.includes('commandId'), 'result schema lacks command causality');
assert(protocol.schemas.event.required.includes('eventKey'), 'event schema lacks a globally unambiguous key');
assert(new Set(AIRPORT_DOMAIN_EVENT_TYPES).size === AIRPORT_DOMAIN_EVENT_TYPES.length, 'domain event types are not unique');

const sampleEvent = {
  protocolVersion: CONTROL_PROTOCOL_VERSION,
  apiVersion: CONTROL_API_VERSION,
  sessionId: 'session-validator',
  eventId: 1,
  eventKey: 'session-validator:1',
  sequence: 1,
  airport: 'ORD',
  elapsed: 0,
  type: 'vector',
  causedByCommandId: 'cmd-validator-1',
  causedByControllerDecisionId: 'controller-validator-1',
};
assert(validateProtocolValue(sampleEvent, protocol.schemas.event).length === 0, 'valid telemetry event failed its schema');

const sampleResult = {
  protocolVersion: CONTROL_PROTOCOL_VERSION,
  apiVersion: CONTROL_API_VERSION,
  sessionId: 'session-validator',
  requestId: 'validator-request-1',
  clientId: 'validator',
  commandId: 'cmd-validator-1',
  source: 'test',
  action: 'pause',
  accepted: true,
  reason: 'accepted',
  sequence: 1,
  eventId: 1,
  eventKey: 'session-validator:1',
  authority: {
    rule: 'session',
    assertedStation: 'supervisor',
    effectiveStation: 'supervisor',
    resultingStation: 'supervisor',
    requiredStations: ['approach', 'tower', 'ground', 'ramp', 'supervisor'],
    flightOwnership: false,
    safetyArbiter: true,
    enforced: true,
    actorId: 'validator',
  },
  compatibility: assessProtocolCompatibility(CONTROL_PROTOCOL_VERSION, {
    apiVersion: CONTROL_API_VERSION,
    snapshotSchemaVersion: CONTROL_SNAPSHOT_SCHEMA_VERSION,
  }),
  validation: { valid: true, issues: [] },
  snapshot: {},
  resultingState: {},
};
assert(validateProtocolValue(sampleResult, protocol.schemas.result).length === 0, 'valid command result failed its schema');

protocol.commands[0].summary = 'mutated consumer copy';
assert(getAirportControlProtocol().commands[0].summary !== 'mutated consumer copy', 'protocol() leaked mutable internal definitions');

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD');
const simulation = new AirportSimulation(generateHubConfig(ordIndex));
simulation.setMode('manual');
simulation.setStation('supervisor');
const arrival = simulation.state.flights.find((flight) => flight.phase === 'approach');
assert(arrival, 'protocol causal validation needs an initial arrival');
const cursor = simulation.eventCursor();
assert(simulation.triggerEmergency(arrival.id, 'go-around'), 'go-around command was rejected in causal validation');
simulation.tagEventsSince(cursor, 'cmd-validator-go-around');
const tagged = simulation.drainEvents().filter((event) => event.causedByCommandId === 'cmd-validator-go-around');
assert(tagged.some((event) => event.type === 'go-around'), 'simulation event did not retain its causal command ID');

console.log(JSON.stringify({
  commands: definitions.length,
  eventTypes: AIRPORT_DOMAIN_EVENT_TYPES.length,
  schemas: Object.keys(protocol.schemas).length,
  taggedEvents: tagged.length,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "control-protocol-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Control protocol validation bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

const mainSource = await readFile("src/main.ts", "utf8");
for (const requiredIntegration of [
  "validateAirportControlEnvelope",
  "dispatchAirportControl",
  "causedByCommandId",
  "causedByControllerDecisionId",
  "message.type === 'request'",
  "type: 'response'",
  "protocol: getAirportControlProtocol",
]) {
  if (!mainSource.includes(requiredIntegration))
    throw new Error(
      `main.ts is missing protocol integration: ${requiredIntegration}`,
    );
}

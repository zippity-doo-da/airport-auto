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
import { digitalClearanceSnapshot } from './src/simulation/digitalClearances.ts';
import { syncFlightMotion } from './src/simulation/flightMotion.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(CONTROL_PROTOCOL_VERSION === '1.2.0', 'control protocol version changed unexpectedly');
assert(CONTROL_API_VERSION === '2.41.0', 'control API version changed unexpectedly');
assert(CONTROL_SNAPSHOT_SCHEMA_VERSION === 44, 'snapshot schema version changed unexpectedly');
assert(CONTROL_REPLAY_SCHEMA_VERSION === 4, 'replay schema version changed unexpectedly');

const definitions = Object.values(AIRPORT_CONTROL_COMMAND_DEFINITIONS);
assert(definitions.length === 110, 'formal command catalog count changed unexpectedly');
assert(validateAirportControlCommand({ action: 'ignoreTrafficFlowAdvisory', recommendationId: 'arrival:1:review' }).valid, 'flow-advisory ignore command was rejected');
assert(validateAirportControlCommand({ action: 'recoverTrafficFlowAdvisory', recommendationId: 'arrival:1:review' }).valid, 'flow-advisory recovery command was rejected');
assert(validateAirportControlCommand({ action: 'setTrafficFlowForecastHorizon', seconds: 600 }).valid, 'traffic-flow forecast horizon command was rejected');
assert(!validateAirportControlCommand({ action: 'setTrafficFlowForecastHorizon', seconds: 450 }).valid, 'unsupported traffic-flow forecast horizon was accepted');
assert(validateAirportControlCommand({ action: 'resequenceTrafficFlow', direction: 'departure', entryId: 'DEP-2', move: 'earlier' }).valid, 'traffic-flow resequence command was rejected');
assert(validateAirportControlCommand({ action: 'resequenceTrafficFlow', direction: 'departure', entryId: 'DEP-2', move: 'earlier', expectedAdjacentEntryId: 'DEP-1' }).valid, 'guarded traffic-flow resequence command was rejected');
assert(!validateAirportControlCommand({ action: 'resequenceTrafficFlow', direction: 'departure', entryId: 'DEP-2', move: 'first' }).valid, 'unsupported traffic-flow resequence move was accepted');
assert(!validateAirportControlCommand({ action: 'resequenceTrafficFlow', direction: 'departure', entryId: 'DEP-2', move: 'earlier', expectedAdjacentEntryId: 1 }).valid, 'non-string adjacent-entry guard was accepted');
assert(validateAirportControlCommand({ action: 'setEnvironmentLightingMode', mode: 'automatic' }).valid, 'environment lighting command was rejected');
assert(validateAirportControlCommand({ action: 'setEnvironmentSeasonMode', mode: 'winter' }).valid, 'environment season command was rejected');
assert(validateAirportControlCommand({ action: 'applyAmbientProgram', id: 'quiet-overnight' }).valid, 'ambient program command was rejected');
assert(validateAirportControlCommand({ action: 'setAccessibilityPalette', palette: 'cvd-safe' }).valid, 'accessibility palette command was rejected');
assert(validateAirportControlCommand({ action: 'setCameraDirectorEnabled', enabled: true }).valid, 'camera director command was rejected');
assert(validateAirportControlCommand({ action: 'setSurfaceSafetyLookahead', seconds: 60 }).valid, 'surface-safety horizon command was rejected');
assert(validateAirportControlCommand({ action: 'setSurfaceSafetyDiagramLayer', layer: 'corridors', enabled: false }).valid, 'surface-safety layer command was rejected');
assert(!validateAirportControlCommand({ action: 'setSurfaceSafetyLookahead', seconds: 20 }).valid, 'unsupported surface-safety horizon was accepted');
assert(!validateAirportControlCommand({ action: 'setSurfaceSafetyDiagramLayer', layer: 'labels', enabled: true }).valid, 'unknown surface-safety layer was accepted');
assert(new Set(definitions.map((definition) => definition.action)).size === definitions.length, 'command actions are not unique');
assert(definitions.every((definition) => definition.schema.additionalProperties === false), 'a command schema permits unknown parameters');
assert(definitions.every((definition) => definition.compatibility.protocolMajor === 1), 'a command has the wrong protocol major');
assert(definitions.every((definition) => definition.compatibility.transports.includes('websocket')), 'a command is missing remote WebSocket compatibility');
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
assert(validateAirportControlCommand({ action: 'previewCompoundClearance', flightId: 1, fixIds: ['ORD-W-ENTRY'], altitudeFt: 3000, speedKts: 180 }).valid, 'compound-clearance preview command was rejected');
assert(validateAirportControlCommand({ action: 'issueCompoundClearance', flightId: 1, fixIds: ['ORD-W-ENTRY'], altitudeFt: 3000 }).valid, 'compound-clearance issue command was rejected');
assert(!validateAirportControlCommand({ action: 'issueCompoundClearance', flightId: 1, fixIds: [] }).valid, 'compound-clearance command accepted an empty route');
assert(!validateAirportControlCommand({ action: 'issueCompoundClearance', flightId: 1, fixIds: ['ORD-W-ENTRY'], speedKts: Number.NaN }).valid, 'compound-clearance command accepted a non-finite speed');
assert(validateAirportControlCommand({ action: 'setControllerPolicyPreset', preset: 'realistic' }).valid, 'controller policy command was rejected');
assert(validateAirportControlCommand({ action: 'setAirportLifeVisible', enabled: true }).valid, 'airport-life presentation command was rejected');
assert(validateAirportControlCommand({ action: 'reassignArrivalGate', flightId: 1 }).valid, 'supervisor gate-reassignment command was rejected');
assert(validateAirportControlCommand({ action: 'setWeather', condition: 'thunderstorm', directionDegrees: 240, windSpeed: 25 }).valid, 'thunderstorm weather command was rejected');
assert(validateAirportControlCommand({ action: 'setWeatherHazardsEnabled', enabled: true }).valid, 'severe-weather opt-in command was rejected');
assert(validateAirportControlCommand({ action: 'cancelTakeoffClearance', flightId: 1 }).valid, 'takeoff-cancellation command was rejected');
assert(!validateAirportControlCommand({ action: 'cancelTakeoffClearance' }).valid, 'takeoff-cancellation command accepted without a flight ID');
assert(validateAirportControlCommand({ action: 'rejectTakeoff', flightId: 1, reason: 'traffic' }).valid, 'rejected-takeoff command was rejected');
assert(validateAirportControlCommand({ action: 'rejectTakeoff', flightId: 1 }).valid, 'optional rejected-takeoff reason became required');
assert(!validateAirportControlCommand({ action: 'rejectTakeoff', flightId: 1, reason: 'weather' }).valid, 'unknown rejected-takeoff reason was accepted');
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
  domainEventId: 'sim:validator:1',
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

const routeConfig = generateHubConfig(ordIndex);
const routeSimulation = new AirportSimulation(routeConfig, 'quiet');
routeSimulation.setMode('manual');
routeSimulation.setStation('supervisor');
const routeFlight = routeSimulation.state.flights.find((flight) => flight.phase === 'approach');
assert(routeFlight, 'route-causality validation needs an initial arrival');
routeSimulation.state.flights = [routeFlight];
routeFlight.progress = 0.18;
routeFlight.phaseElapsed = routeFlight.duration * routeFlight.progress;
routeFlight.navigation.frequencyOwner = 'approach';
syncFlightMotion(routeConfig, routeFlight);
const routeProcedure = routeConfig.airspaceProgram.procedures.find((candidate) => candidate.id === routeFlight.navigation.procedureId);
assert(routeProcedure?.kind === 'STAR', 'route-causality flight lost its STAR');
const routeFixIds = Array.from({ length: Math.max(1, routeProcedure.commonFixIds.length - 2) }, (_, index) => routeProcedure.commonFixIds.slice(index))
  .filter((fixIds) => fixIds.length >= 3)
  .sort((first, second) => {
    const turn = (fixIds) => {
      const fix = routeConfig.airspaceProgram.fixes.find((candidate) => candidate.id === fixIds[0]);
      const heading = Math.atan2(fix.position[1] - routeFlight.motion.y, fix.position[0] - routeFlight.motion.x);
      return Math.abs(Math.atan2(Math.sin(heading - routeFlight.motion.heading), Math.cos(heading - routeFlight.motion.heading)));
    };
    return turn(first) - turn(second);
  })[0];
assert(routeFixIds, 'route-causality flight has no published amendment');
let routeCursor = routeSimulation.eventCursor();
assert(routeSimulation.previewFlightRoute(routeFlight.id, routeFixIds), 'causal route preview was rejected');
routeSimulation.tagEventsSince(routeCursor, 'cmd-validator-preview');
routeCursor = routeSimulation.eventCursor();
assert(routeSimulation.issueFlightRoute(routeFlight.id), 'causal route transmission was rejected');
routeSimulation.tagEventsSince(routeCursor, 'cmd-validator-issue');
let routeMessage = digitalClearanceSnapshot(routeSimulation.state).messages.find((message) => message.flightId === routeFlight.id && message.kind === 'route-amendment');
assert(routeMessage?.commandId === 'cmd-validator-issue', 'digital envelope did not retain the authoritative issue command ID');
assert(routeMessage.causalEventIds.length === 2 && routeMessage.causalEventIds.every((id) => id.startsWith('sim:')), 'digital envelope retained synthetic rather than domain-event causality');
const routeEvents = routeSimulation.drainEvents().filter((event) => event.type.startsWith('route-'));
assert(routeEvents.every((event) => event.domainEventId && routeMessage.causalEventIds.includes(event.domainEventId)), 'domain events cannot be joined back to the digital envelope');
while (routeFlight.navigation.routeClearance?.status === 'sent') routeSimulation.update(0.1);
const deliveryEvent = routeSimulation.drainEvents().find((event) => event.type === 'route-clearance-delivered');
assert(deliveryEvent?.domainEventId, 'asynchronous delivery omitted its domain event ID');
routeSimulation.setStation('approach');
routeCursor = routeSimulation.eventCursor();
assert(routeSimulation.acceptRouteReadback(routeFlight.id), 'causal route readback was rejected');
routeSimulation.tagEventsSince(routeCursor, 'cmd-validator-readback');
routeMessage = digitalClearanceSnapshot(routeSimulation.state).messages.find((message) => message.flightId === routeFlight.id && message.kind === 'route-amendment');
assert(routeMessage?.status === 'wilco' && routeMessage.response.commandId === 'cmd-validator-readback', 'digital response did not retain its authoritative response command ID');
assert(routeMessage.causalEventIds.includes(deliveryEvent.domainEventId) && routeMessage.causalEventIds.length >= 4, 'digital lifecycle omitted delivered or accepted domain events');

console.log(JSON.stringify({
  commands: definitions.length,
  eventTypes: AIRPORT_DOMAIN_EVENT_TYPES.length,
  schemas: Object.keys(protocol.schemas).length,
  taggedEvents: tagged.length,
  routeCausalEvents: routeMessage.causalEventIds.length,
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
  "migrateBroadcastControlRequest",
  'type: "response"',
  "protocol: getAirportControlProtocol",
]) {
  if (!mainSource.includes(requiredIntegration))
    throw new Error(
      `main.ts is missing protocol integration: ${requiredIntegration}`,
    );
}

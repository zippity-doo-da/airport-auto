import { build } from "esbuild";

const validationSource = `
import { migrateVersionedRecord } from './src/persistence/schemaMigrations.ts';
import { migrateInputPreferences } from './src/persistence/inputPreferences.ts';
import {
  buildSessionSaveLaunchUrl,
  createAirportSessionSave,
  migrateAirportSessionSave,
} from './src/persistence/sessionSave.ts';
import {
  migrateBroadcastControlRequest,
  migrateStandaloneControlCommand,
} from './src/control/controlMigrations.ts';
import { migrateStandaloneTelemetryEvent } from './src/control/eventMigrations.ts';
import { CONTROL_API_VERSION, CONTROL_PROTOCOL_VERSION } from './src/control/controlProtocol.ts';
import { migrateAirportAssetDocument } from './src/assets/airportAssetMigrations.ts';
import { schemaMigrationCatalog, schemaMigrationTools } from './src/persistence/schemaMigrationCatalog.ts';
import { migrateReplayRecording } from './src/replay/replayRecording.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const registryResult = migrateVersionedRecord(
  { schemaVersion: 0, value: 'legacy' },
  {
    documentName: 'Registry test',
    currentVersion: 2,
    steps: [
      { fromVersion: 0, toVersion: 1, migrate: (value) => ({ ...value, schemaVersion: 1, first: true }) },
      { fromVersion: 1, toVersion: 2, migrate: (value) => ({ ...value, schemaVersion: 2, second: true }) },
    ],
    validate: (value) => value.first === true && value.second === true ? null : 'steps were not applied',
    finalize: (value) => value,
  },
);
assert(registryResult.accepted && registryResult.migrated, 'generic registry rejected a complete migration chain');
assert(registryResult.appliedVersions.join(',') === '1,2', 'generic registry applied steps out of order');
const futureRegistry = migrateVersionedRecord(
  { schemaVersion: 3 },
  {
    documentName: 'Registry test', currentVersion: 2, steps: [],
    validate: () => null, finalize: (value) => value,
  },
);
assert(!futureRegistry.accepted && futureRegistry.reason.includes('newer'), 'generic registry accepted a future schema');
const missingStep = migrateVersionedRecord(
  { schemaVersion: 0 },
  {
    documentName: 'Registry test', currentVersion: 2,
    steps: [{ fromVersion: 0, toVersion: 1, migrate: (value) => ({ ...value, schemaVersion: 1 }) }],
    validate: () => null, finalize: (value) => value,
  },
);
assert(!missingStep.accepted && missingStep.reason.includes('no migration'), 'generic registry silently skipped a missing step');

const inputPreferences = migrateInputPreferences({ gamepadEnabled: false, gamepadSensitivity: 1.4 });
assert(inputPreferences.accepted && inputPreferences.migrated, 'unversioned input preferences were not migrated');
assert(inputPreferences.value?.schemaVersion === 1 && inputPreferences.value.gamepadSensitivity === 1.4, 'input preference values changed during migration');
assert(!migrateInputPreferences({ schemaVersion: 2 }).accepted, 'future input preferences were accepted');

const legacySave = migrateAirportSessionSave({
  airportCode: 'ord', seed: 10001, mode: 'watch', speed: 2,
  scenario: 'rush', density: 'busy', station: 'tower', separationRuleset: 'realistic',
  weather: { condition: 'rain', directionDegrees: 250, windSpeedKts: 18, enabled: true, windEnabled: true, hazardsEnabled: false },
});
assert(legacySave.accepted && legacySave.value?.airport.code === 'ORD', 'legacy session launch save did not migrate');
const currentSave = createAirportSessionSave({
  savedAt: '2026-07-27T12:00:00.000Z',
  airport: { code: 'ORD', seed: 10001 },
  operation: { mode: 'watch', speed: 2, scenario: 'rush', density: 'busy', station: 'tower', separationRuleset: 'realistic' },
  weather: { enabled: true, windEnabled: true, condition: 'rain', directionDegrees: 250, windSpeedKts: 18, hazardsEnabled: false },
});
const launchUrl = new URL(buildSessionSaveLaunchUrl('https://example.test/airport-auto/?token=secret#private', currentSave));
assert(launchUrl.searchParams.get('airport') === 'ORD' && launchUrl.searchParams.get('seed') === '10001', 'session save launch URL lost identity');
assert(!launchUrl.searchParams.has('token') && launchUrl.hash === '', 'session save launch URL leaked unrelated state');
assert(!migrateAirportSessionSave({ ...currentSave, schemaVersion: 2 }).accepted, 'future session save was accepted');

const legacyCommand = migrateStandaloneControlCommand({ action: 'pause' });
assert(legacyCommand.accepted && legacyCommand.value?.command.action === 'pause', 'legacy standalone command did not migrate');
assert(!migrateStandaloneControlCommand({ action: 'teleportFlight' }).accepted, 'invalid standalone command was accepted');
assert(!migrateStandaloneControlCommand({ schemaVersion: 2, protocolVersion: '1.2.0', command: { action: 'pause' } }).accepted, 'future standalone command was accepted');
const legacyBroadcast = migrateBroadcastControlRequest({ type: 'command', requestId: 'legacy-1', clientId: 'test-client', command: { action: 'pause' } });
assert(legacyBroadcast.accepted && legacyBroadcast.migrated && legacyBroadcast.request?.envelope.requestId === 'legacy-1', 'legacy broadcast command did not become a formal request');
const formalBroadcast = migrateBroadcastControlRequest({ type: 'request', envelope: { protocolVersion: '1.2.0', requestId: 'formal-1', source: 'test', command: { action: 'pause' } } });
assert(formalBroadcast.accepted && !formalBroadcast.migrated, 'formal broadcast request was unnecessarily migrated');

const legacyEvent = migrateStandaloneTelemetryEvent(
  { elapsed: 7.5, type: 'sound:touchdown', flightId: 4 },
  { sessionId: 'migration-test', airport: 'ORD', eventId: 8 },
);
assert(legacyEvent.accepted && legacyEvent.value?.event.eventKey === 'migration-test:8', 'legacy event causality was not filled');
assert(legacyEvent.value?.event.protocolVersion === CONTROL_PROTOCOL_VERSION && legacyEvent.value.event.apiVersion === CONTROL_API_VERSION, 'legacy event protocol fields were not upgraded');
assert(!migrateStandaloneTelemetryEvent({ schemaVersion: 2, event: legacyEvent.value?.event }).accepted, 'future standalone event was accepted');

const airport = { faaId: 'TST', icaoId: 'KTST', name: 'Test Airport' };
const coordinateSystem = { source: 'EPSG:4326' };
const assetBase = { airport, coordinateSystem, assetPath: 'data/test.json', assetSha256: 'abc' };
const assetFixtures = {
  'stable-manifest': {
    manifestId: 'airport-auto-assets', applicationVersion: '2.39.0', assets: [
      { key: 'airport.TST.vector', kind: 'airport-vector', path: 'data/test.json', sha256: 'abc', licenseRef: 'LICENSE' },
    ],
  },
  'vector-manifest': { ...assetBase, runtimeReference: { runways: [] } },
  'context-manifest': { ...assetBase, source: {}, counts: {} },
  'surface-manifest': { ...assetBase, schemaVersion: 1, source: {} },
  'surface-graph': { airportCode: 'TST', seed: 7, nodes: [], edges: [], taxiways: [], stands: [], runwayAccess: [] },
};
for (const [kind, fixture] of Object.entries(assetFixtures)) {
  const migrated = migrateAirportAssetDocument(kind, fixture);
  assert(migrated.accepted && migrated.value, kind + ' legacy fixture failed: ' + migrated.reason);
  const future = migrateAirportAssetDocument(kind, { ...migrated.value, schemaVersion: migrated.targetSchemaVersion + 1 });
  assert(!future.accepted && future.reason.includes('newer'), kind + ' future schema was accepted');
}
assert(migrateAirportAssetDocument('surface-graph', assetFixtures['surface-graph']).value?.schemaVersion === 3, 'surface graph did not run its complete migration chain');

const legacyReplay = {
  schemaVersion: 3,
  seed: 10001,
  airport: { code: 'ORD', name: 'Chicago O Hare International', scope: 'center' },
  initialState: {}, frames: [], commands: [], events: [], weatherHistory: [], soundEvents: [],
};
const replayMigration = migrateReplayRecording(legacyReplay);
assert(replayMigration.accepted && replayMigration.migrated && replayMigration.recording?.schemaVersion === 4, 'legacy recording/replay did not migrate');
assert(!migrateReplayRecording({ ...legacyReplay, schemaVersion: 5 }).accepted, 'future replay was accepted');
assert(schemaMigrationTools.recording === schemaMigrationTools.replay, 'recording and replay did not share the canonical migration boundary');

const catalog = schemaMigrationCatalog();
assert(new Set(catalog.map((entry) => entry.id)).size === catalog.length, 'migration catalog IDs are not unique');
for (const id of ['airport-stable-manifest', 'airport-vector-manifest', 'airport-context-manifest', 'airport-surface-manifest', 'airport-surface-graph', 'session-launch-save', 'input-preferences', 'standalone-command', 'standalone-event', 'recording', 'replay']) {
  assert(catalog.some((entry) => entry.id === id), 'migration catalog omitted ' + id);
}
assert(catalog.every((entry) => entry.failClosedForFutureVersions), 'a migration contract does not fail closed for future versions');

console.log(JSON.stringify({
  catalogEntries: catalog.length,
  genericSteps: registryResult.appliedVersions.length,
  migratedAssetFamilies: Object.keys(assetFixtures).length,
  migratedBoundaries: 7,
  futureRejections: Object.keys(assetFixtures).length + 5,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "schema-migration-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Schema migration validation bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

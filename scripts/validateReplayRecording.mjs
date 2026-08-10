import { build } from "esbuild";

const validationSource = `
import {
  buildReplaySeedLink,
  compareReplayStates,
  createReplayRecording,
  createReplayRecordingAsync,
  createShareableReplayRecording,
  deriveReplayMarkers,
  replayFilename,
  stableReplayFingerprint,
  verifyReplayRecording,
  verifyReplayRecordingAsync,
} from './src/replay/replayRecording.ts';
import { createSeededSimulationHarness } from './src/simulation/fixedStepHarness.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const baseState = {
  elapsed: 12,
  flights: [{
    id: 7,
    callsign: 'AAL107',
    phase: 'takeoff',
    motion: { x: 4, y: 0.4, z: -8, heading: 1.2, pitch: 0.12, onGround: false },
    kinematics: { airspeedKts: 148, altitudeFt: 86, fuelPercent: 61 },
  }],
  serviceVehicles: [],
  surfaceDisruptions: [],
  arrivals: 2,
  departures: 1,
  gameOver: false,
  paused: false,
  mode: 'auto',
  runwayConfigurationId: 'ORD-WEST-FLOW',
  weather: { condition: 'clear', windSpeed: 12 },
  trafficFlow: {
    arrivalQueue: [{
      id: 'ARR-REPLAY', direction: 'arrival', status: 'metered', createdAtSeconds: 0,
      scheduledAtSeconds: 0, releaseSlotSeconds: 90, updatedAtSeconds: 11,
      delaySeconds: 30, attempts: 1, reason: 'weather recovery arrival metering',
      constraintCategory: 'weather', constraintAttribution: { schemaVersion: 1, category: 'weather', causeCode: 'weather-capacity', source: 'weather', relatedRunwayId: 1 }, meterTargets: [], flightId: 7, callsign: 'AAL107', runwayId: 1,
      slotRevisions: [
        { atSeconds: 0, releaseSlotSeconds: 60, reason: 'scheduled arrival bank', category: 'schedule', attribution: { schemaVersion: 1, category: 'schedule', causeCode: 'initial-schedule', source: 'scheduler' } },
        { atSeconds: 11, releaseSlotSeconds: 90, reason: 'weather recovery arrival metering', category: 'weather', attribution: { schemaVersion: 1, category: 'weather', causeCode: 'weather-capacity', source: 'weather', relatedRunwayId: 1 } },
      ],
    }],
    departureQueue: [], history: [],
  },
};

const frames = [0, 1, 2].map((offset) => ({
  clock: 10 + offset,
  score: { landed: 2, departed: offset > 1 ? 1 : 0 },
  flights: [{ id: 7, callsign: 'AAL107', phase: 'takeoff', runway: 1, progress: offset / 2 }],
  predictions: [],
  surfaceSafety: {
    schemaVersion: 3,
    generatedAtSeconds: 10 + offset,
    tracks: [{
      schemaVersion: 2,
      id: 7,
      callsign: 'AAL107',
      aircraft: 'A320',
      x: 1,
      y: 2,
      headingDegrees: 90,
      groundspeedKts: 14,
      location: 'TWY A',
      state: 'taxiing',
      protectedRunway: false,
      routeIntent: 'A / A17',
      clearanceSummary: 'Taxi clearance pending',
      surveillanceAgeSeconds: 0,
      routeGeometry: {
        schemaVersion: 1,
        points: [[1, 2], [3, 4], [5, 6]],
        crossings: [{ id: 'crossing:7', runwayId: 1, status: 'pending', holdPoint: [3, 4], crossingPoint: [5, 6] }],
      },
    }],
    vehicles: [],
    protectionCorridors: [{
      schemaVersion: 1,
      id: 'departure:7:1',
      operation: 'departure',
      flightId: 7,
      callsign: 'AAL107',
      runwayId: 1,
      state: 'protected',
      points: [[1, 2], [3, 4], [7, 8]],
      width: 4,
      altitudeFt: 86,
      etaSeconds: 12,
    }],
    advisories: offset === 1 ? [{
      schemaVersion: 1,
      id: 'runway-crossing:7-9:1',
      severity: 'warning',
      kind: 'runway-crossing',
      status: 'active',
      flightIds: [7, 9],
      causalTrackIds: ['aircraft:7', 'aircraft:9'],
      runwayId: 1,
      etaSeconds: 4,
      firstSeenAtSeconds: 11,
      lastSeenAtSeconds: 11,
      predictedAtSeconds: 15,
      detail: 'private surface advisory detail',
      geometry: { kind: 'corridor', points: [[1, 2], [3, 4]], width: 2 },
    }] : [],
    protectedRunwayOccupancy: 0,
    heldTracks: 0,
  },
  state: structuredClone({ ...baseState, elapsed: 10 + offset }),
}));
const events = [
  {
    protocolVersion: '1.2.0', apiVersion: '2.40.0', sessionId: 'session-test', eventId: 1,
    eventKey: 'session-test:1', sequence: 1, airport: 'ORD', elapsed: 10.1,
    type: 'command:clearTakeoff', flightId: 7, callsign: 'AAL107', runway: 1, accepted: true,
    detail: 'takeoff clearance accepted',
  },
  {
    protocolVersion: '1.2.0', apiVersion: '2.40.0', sessionId: 'session-test', eventId: 2,
    eventKey: 'session-test:2', sequence: 2, airport: 'ORD', elapsed: 11.8,
    type: 'separation-warning', flightId: 7, callsign: 'AAL107', accepted: false,
    detail: 'projected path conflict',
  },
  {
    protocolVersion: '1.2.0', apiVersion: '2.40.0', sessionId: 'session-test', eventId: 3,
    eventKey: 'session-test:3', sequence: 3, airport: 'ORD', elapsed: 11.9,
    type: 'sound:takeoff-power', detail: 'audio-only event',
  },
];

const recording = createReplayRecording({
  protocolVersion: '1.2.0',
  snapshotSchemaVersion: 44,
  simulationVersion: '2.40.0',
  fixedStepSeconds: 0.05,
  sessionId: 'session-test',
  recordedAt: '2026-07-26T12:00:00.000Z',
  seed: 10001,
  airport: { code: 'ORD', name: "Chicago O'Hare International", scope: 'center' },
  sharing: {
    classification: 'local-full', containsControllerIdentity: true, containsCorrelationIds: true,
    containsFreeText: true, automaticUpload: false, redactions: [],
  },
  initialState: structuredClone(baseState),
  commands: [{
    sequence: 1, eventId: 1, eventKey: 'session-test:1', elapsed: 10.1,
    requestId: 'private-request', commandId: 'private-command', clientId: 'tower-client', source: 'agent',
    station: 'tower', actorId: 'controller@example.test',
    command: { action: 'divertFlight', flightId: 7, airportCode: 'KIND', reason: 'private user note' },
    accepted: true, reason: 'private user note accepted',
  }],
  weatherHistory: [],
  soundEvents: [],
  events,
  frames,
});

assert(recording.schemaVersion === 4, 'new recording did not use replay schema 4');
assert(recording.integrity.frameHashes.length === frames.length, 'frame fingerprints were incomplete');
assert(recording.markers.length === 2, 'sound-only telemetry leaked into event markers');
assert(recording.markers[0].category === 'command', 'clearance marker was miscategorized');
assert(recording.markers[1].category === 'safety' && recording.markers[1].priority === 'caution', 'separation marker lost safety priority');

const verified = verifyReplayRecording(recording);
assert(verified.accepted && verified.exact, 'fresh replay did not verify exactly: ' + verified.reason);
assert(verified.checkedFrames === 3 && verified.checkedEvents === 3, 'verification totals were wrong');
assert(recording.frames[1].state.trafficFlow.arrivalQueue[0].slotRevisions[1].reason === 'weather recovery arrival metering', 'exact replay omitted the meter-slot revision cause');
assert(recording.frames[1].state.trafficFlow.arrivalQueue[0].slotRevisions[1].attribution.causeCode === 'weather-capacity', 'exact replay omitted structured slot attribution');

const reordered = { b: [3, { z: 1, a: 2 }], a: -0 };
const reorderedTwin = { a: 0, b: [3, { a: 2, z: 1 }] };
assert(stableReplayFingerprint(reordered) === stableReplayFingerprint(reorderedTwin), 'canonical fingerprint depended on object key order or negative zero');

const tampered = structuredClone(recording);
tampered.frames[1].state.flights[0].motion.x = 999;
const rejected = verifyReplayRecording(tampered);
assert(!rejected.accepted && !rejected.exact, 'tampered replay was accepted');
assert(rejected.mismatches.some((mismatch) => mismatch.scope === 'frame' && mismatch.index === 1), 'tampered frame was not localized');
const tamperedFlow = structuredClone(recording);
tamperedFlow.frames[1].state.trafficFlow.arrivalQueue[0].slotRevisions[1].releaseSlotSeconds = 75;
const rejectedFlow = verifyReplayRecording(tamperedFlow);
assert(!rejectedFlow.accepted && rejectedFlow.mismatches.some((mismatch) => mismatch.scope === 'frame' && mismatch.index === 1), 'tampered flow revision was not detected by exact replay verification');
const tamperedAttribution = structuredClone(recording);
tamperedAttribution.frames[1].state.trafficFlow.arrivalQueue[0].slotRevisions[1].attribution.causeCode = 'runway-capacity';
assert(!verifyReplayRecording(tamperedAttribution).accepted, 'tampered flow attribution was not detected by exact replay verification');

const comparison = compareReplayStates(recording.frames[0].state, tampered.frames[1].state);
assert(!comparison.equal && comparison.differenceCount > 0, 'state comparison missed authoritative changes');
assert(comparison.differences.some((difference) => difference.path.includes('motion.x')), 'state comparison did not expose the changed motion path');
assert(compareReplayStates(baseState, structuredClone(baseState)).equal, 'identical states compared unequal');

const shareable = createShareableReplayRecording(recording);
assert(shareable.sharing.classification === 'shareable-redacted', 'shared replay lacks redaction disclosure');
assert(!shareable.sharing.containsControllerIdentity && !shareable.sharing.containsCorrelationIds && !shareable.sharing.containsFreeText, 'shared replay disclosure still claims private data');
assert(shareable.sessionId === 'shared-session' && shareable.commands[0].clientId === null && shareable.commands[0].actorId === null, 'shared replay retained controller identity');
assert(!('reason' in shareable.commands[0].command) && !('detail' in shareable.events[0]) && !('payload' in shareable.events[0]), 'shared replay retained user text or payload data');
assert(!JSON.stringify(shareable).includes('controller@example.test') && !JSON.stringify(shareable).includes('private user note'), 'shared replay serialized private identity or text');
assert(verifyReplayRecording(shareable).exact, 'redacted shared replay was not re-fingerprinted exactly');
assert(shareable.frames[1].surfaceSafety.advisories[0].detail === undefined, 'shared replay retained private surface advisory detail');
assert(recording.frames[1].surfaceSafety.advisories[0].status === 'active', 'full replay omitted captured surface advisory lifecycle state');
assert(recording.frames[1].surfaceSafety.tracks[0].routeGeometry.crossings[0].status === 'pending', 'full replay omitted surface route crossing intent');
assert(shareable.frames[1].surfaceSafety.tracks[0].routeGeometry.points.length === 3, 'shared replay omitted structural surface route geometry');
assert(recording.frames[1].surfaceSafety.protectionCorridors[0].points.length === 3, 'full replay omitted runway protection corridor geometry');
assert(shareable.frames[1].surfaceSafety.protectionCorridors[0].operation === 'departure', 'shared replay omitted structural runway protection corridor state');

const legacy = structuredClone(recording);
legacy.schemaVersion = 3;
delete legacy.markers;
delete legacy.integrity;
delete legacy.snapshotSchemaVersion;
delete legacy.fixedStepSeconds;
const migrated = verifyReplayRecording(legacy);
assert(migrated.accepted && migrated.exact && migrated.migrated && migrated.legacyUnsealed, 'schema 3 migration did not preserve its provenance warning');
assert(migrated.recording?.schemaVersion === 4, 'schema 3 migration did not produce schema 4');

const unsupported = verifyReplayRecording({ ...legacy, schemaVersion: 2 });
assert(!unsupported.accepted && unsupported.reason.includes('unsupported'), 'unsupported replay schema was not rejected clearly');

const markers = deriveReplayMarkers(events, frames);
assert(markers[0].frameIndex === 0 && markers[1].frameIndex === 2, 'event markers did not snap to nearest replay frames');

const seedLink = buildReplaySeedLink('https://example.test/airport-auto/?token=secret#private', {
  airport: 'ord', seed: 10001, mode: 'auto', scenario: 'rush', density: 'busy', rules: 'realistic',
  weather: 'rain', windDirectionDegrees: 270, windSpeed: 18, runwayConfiguration: 'auto',
  hazards: true, lighting: 'automatic', season: 'summer', palette: 'cvd-safe',
});
const seedUrl = new URL(seedLink);
assert(seedUrl.searchParams.get('airport') === 'ORD' && seedUrl.searchParams.get('seed') === '10001', 'seed link omitted exact airport seed');
assert(seedUrl.searchParams.get('autostart') === '1' && seedUrl.searchParams.get('hazards') === '1', 'seed link omitted launch state');
assert(!seedUrl.searchParams.has('token') && seedUrl.hash === '', 'seed link leaked unrelated query or fragment data');
assert(replayFilename(recording).endsWith('.airport-auto-replay.json'), 'portable replay filename is not recognizable');
assert(replayFilename(shareable).includes('-shared.airport-auto-replay.json'), 'redacted replay filename does not disclose sharing class');

let asyncYields = 0;
const asyncRecording = await createReplayRecordingAsync({
  protocolVersion: recording.protocolVersion,
  snapshotSchemaVersion: recording.snapshotSchemaVersion,
  simulationVersion: recording.simulationVersion,
  fixedStepSeconds: recording.fixedStepSeconds,
  sessionId: recording.sessionId,
  recordedAt: recording.recordedAt,
  seed: recording.seed,
  airport: recording.airport,
  sharing: recording.sharing,
  initialState: recording.initialState,
  commands: recording.commands,
  weatherHistory: recording.weatherHistory,
  soundEvents: recording.soundEvents,
  events: recording.events,
  frames: recording.frames,
}, { yieldEveryFrames: 1, yieldControl: async () => { asyncYields += 1; } });
const asyncVerified = await verifyReplayRecordingAsync(asyncRecording, { yieldEveryFrames: 1, yieldControl: async () => { asyncYields += 1; } });
assert(asyncVerified.exact && asyncYields >= 4, 'cooperative replay fingerprinting did not verify or yield between frames');
const asyncLegacy = await verifyReplayRecordingAsync(legacy, { yieldEveryFrames: 1, yieldControl: async () => { asyncYields += 1; } });
assert(asyncLegacy.exact && asyncLegacy.legacyUnsealed && asyncYields >= 8, 'legacy migration did not use cooperative fingerprinting');

const whole = createSeededSimulationHarness(991, { stepSeconds: 0.05 });
const partitioned = createSeededSimulationHarness(991, { stepSeconds: 0.05 });
whole.advanceBy(90);
for (const delta of [13.7, 0.3, 21.125, 4.875, 50]) partitioned.advanceBy(delta);
const wholeHash = stableReplayFingerprint(whole.snapshot());
const partitionedHash = stableReplayFingerprint(partitioned.snapshot());
assert(wholeHash === partitionedHash, 'fixed-step engine did not produce an exact canonical receipt across wall-frame partitions');

console.log(JSON.stringify({
  schemaVersion: recording.schemaVersion,
  frames: verified.checkedFrames,
  markers: recording.markers.length,
  tamperMismatches: rejected.mismatches.length,
  migratedFrom: migrated.sourceSchemaVersion,
  manifestHash: verified.manifestHash,
  shareRedactions: shareable.sharing.redactions.length,
  asyncYields,
  deterministicTicks: whole.tickCount + partitioned.tickCount,
}));
`;

const result = await build({
  stdin: {
    contents: validationSource,
    resolveDir: process.cwd(),
    sourcefile: "replay-recording-validation.ts",
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const executable = Buffer.from(result.outputFiles[0].contents).toString(
  "base64",
);
await import(`data:text/javascript;base64,${executable}`);

import { build } from "esbuild";

const source = `
import { projectRemoteOperationsSnapshot } from './src/control/remoteControlHost.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const snapshot = projectRemoteOperationsSnapshot({
  schemaVersion: 44,
  airport: { code: 'ORD', name: 'Chicago O’Hare' },
  flights: [{
    id: 7,
    callsign: 'TEST 7',
    phase: 'taxi-out',
    poseAlignment: {
      schemaVersion: 1,
      authoritative: { x: 1, y: 2, onGround: true },
      collision: { x: 1, y: 2, surface: true, protectedSurface: true, runway: 1, taxiway: 'TWY A', surfaceNode: 'node-a', surfaceEdge: 'edge-a' },
      renderer: { position: { x: 0.998, y: 2.001 }, visible: true },
      errors: { collisionHorizontalWorld: 0, rendererSourceHorizontalWorld: 0, rendererAuthoritativeHorizontalWorld: 0.00224 },
    },
  }],
  digitalClearances: {
    schemaVersion: 3,
    generatedAtSeconds: 18,
    counts: { delivered: 1 },
    messages: [{
      id: 'route:7:2',
      commandId: 'cmd:route:7:2',
      flightId: 7,
      callsign: 'TEST 7',
      kind: 'route-amendment',
      status: 'delivered',
      authority: 'approach',
      revision: 2,
      createdAtSeconds: 12,
      issuedAtSeconds: 13,
      deliveredAtSeconds: 14,
      responseDueSeconds: 20,
      expiresAtSeconds: 20,
      causalEventIds: ['sim:7:route:1', 'sim:7:route:2'],
      route: ['FIX-A', 'FIX-B'],
      parameters: { distanceNm: 14 },
      response: { status: 'delivered', commandId: 'cmd:route-response:7:2', deliveredAtSeconds: 14, dueSeconds: 20 },
      capability: { channel: 'data', deskAccess: 'authorized', responseMode: 'panel', aircraftSupport: 'simulated-data-comm', limitations: ['generic equipage'] },
      detail: 'free-form local detail must stay page-local',
      warningCount: 0,
    }],
  },
  surfaceSafety: {
    schemaVersion: 3,
    visible: true,
    filter: 'tower',
    display: {
      lookaheadSeconds: 60,
      layers: { routes: true, corridors: false, forecasts: true, vehicles: false },
    },
    generatedAtSeconds: 12,
    protectedRunwayOccupancy: 1,
    heldTracks: 1,
    tracks: [{
      schemaVersion: 2,
      id: 7,
      callsign: 'TEST 7',
      x: 1,
      y: 2,
      state: 'protected-runway',
      routeIntent: 'RWY 09',
      clearanceSummary: 'Takeoff RWY 09',
      routeGeometry: {
        schemaVersion: 1,
        points: [[1, 2], [3, 4], [5, 6]],
        crossings: [{ id: 'crossing:7', runwayId: 1, status: 'held', holdPoint: [3, 4], crossingPoint: [5, 6] }],
      },
    }],
    vehicles: [],
    protectionCorridors: [{
      schemaVersion: 1,
      id: 'departure:7:1',
      operation: 'departure',
      flightId: 7,
      callsign: 'TEST 7',
      runwayId: 1,
      state: 'protected',
      points: [[1, 2], [4, 6], [8, 9]],
      width: 4,
      altitudeFt: 120,
      etaSeconds: 14,
    }],
    advisories: [{ schemaVersion: 1, id: 'runway:7', severity: 'warning', kind: 'runway-occupancy', status: 'active', flightIds: [7], causalTrackIds: ['aircraft:7'], geometry: { kind: 'runway', points: [[0, 0], [10, 0]], width: 8 }, detail: 'runway forecast' }],
  },
});
const message = snapshot.digitalClearances.messages[0];
assert(message?.commandId === 'cmd:route:7:2', 'remote projection dropped command identity');
assert(message.causalEventIds.length === 2 && message.expiresAtSeconds === 20, 'remote projection dropped causal or expiry fields');
assert(message.response?.status === 'delivered' && message.response.commandId === 'cmd:route-response:7:2' && message.response.deliveredAtSeconds === 14 && message.parameters.distanceNm === 14, 'remote projection dropped typed response content');
assert(message.capability?.channel === 'data' && message.capability.deskAccess === 'authorized' && message.capability.responseMode === 'panel' && message.capability.limitations.length === 1, 'remote projection dropped typed capability limits');
assert(!Object.hasOwn(message, 'detail'), 'remote projection leaked free-form clearance detail');
assert(snapshot.surfaceSafety.schemaVersion === 3 && snapshot.surfaceSafety.tracks[0].routeIntent === 'RWY 09', 'remote projection omitted authoritative surface tracks');
assert(snapshot.surfaceSafety.visible && snapshot.surfaceSafety.filter === 'tower' && snapshot.surfaceSafety.display.lookaheadSeconds === 60, 'remote projection omitted surface display configuration');
assert(snapshot.surfaceSafety.display.layers.corridors === false && snapshot.surfaceSafety.display.layers.vehicles === false, 'remote projection changed surface diagram layer visibility');
assert(snapshot.surfaceSafety.tracks[0].routeGeometry.points.length === 3 && snapshot.surfaceSafety.tracks[0].routeGeometry.crossings[0].status === 'held', 'remote projection omitted bounded route or crossing geometry');
assert(snapshot.surfaceSafety.protectionCorridors[0].operation === 'departure' && snapshot.surfaceSafety.protectionCorridors[0].points.length === 3, 'remote projection omitted bounded runway protection corridor geometry');
assert(snapshot.surfaceSafety.advisories[0].geometry.points.length === 2 && snapshot.surfaceSafety.advisories[0].detail === 'runway forecast', 'remote projection omitted bounded surface advisory geometry');
assert(snapshot.flights[0].poseAlignment.collision.surfaceEdge === 'edge-a' && snapshot.flights[0].poseAlignment.renderer.visible, 'remote projection omitted render/collision pose alignment');
assert(snapshot.flights[0].poseAlignment.errors.collisionHorizontalWorld === 0 && snapshot.flights[0].poseAlignment.errors.rendererAuthoritativeHorizontalWorld > 0, 'remote projection changed pose-alignment diagnostics');
console.log(JSON.stringify({ schemaVersion: snapshot.digitalClearances.schemaVersion, messages: snapshot.digitalClearances.messages.length }));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: source,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "remote-clearance-projection-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});
const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Remote-clearance projection bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

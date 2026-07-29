import { build } from "esbuild";

const source = `
import { projectRemoteOperationsSnapshot } from './src/control/remoteControlHost.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const snapshot = projectRemoteOperationsSnapshot({
  schemaVersion: 42,
  airport: { code: 'ORD', name: 'Chicago O’Hare' },
  digitalClearances: {
    schemaVersion: 2,
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
      responseDueSeconds: 20,
      expiresAtSeconds: 20,
      causalEventIds: ['flight:7', 'clearance:route-amendment:2'],
      route: ['FIX-A', 'FIX-B'],
      parameters: { distanceNm: 14 },
      response: { status: 'delivered', dueSeconds: 20 },
      detail: 'free-form local detail must stay page-local',
      warningCount: 0,
    }],
  },
});
const message = snapshot.digitalClearances.messages[0];
assert(message?.commandId === 'cmd:route:7:2', 'remote projection dropped command identity');
assert(message.causalEventIds.length === 2 && message.expiresAtSeconds === 20, 'remote projection dropped causal or expiry fields');
assert(message.response?.status === 'delivered' && message.parameters.distanceNm === 14, 'remote projection dropped typed response content');
assert(!Object.hasOwn(message, 'detail'), 'remote projection leaked free-form clearance detail');
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
await import(`data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`);

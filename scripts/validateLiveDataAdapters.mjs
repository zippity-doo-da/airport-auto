import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

import {
  createConfiguredJsonProvider,
  createLiveDataService,
  normalizeAviationWeatherMetar,
  normalizeNotamProviderPayload,
  normalizeTrafficProviderPayload,
} from "../server/liveDataService.mjs";
import { createRemoteGateway } from "../server/remoteGateway.mjs";

const now = Date.parse("2026-07-27T18:00:00Z");
const awcPayload = [
  {
    icaoId: "KORD",
    obsTime: now / 1_000 - 600,
    rawOb: "KORD 271750Z 27018G26KT 4SM RA BKN025 09/07 A2992",
    wspd: 18,
    wdir: 270,
    wgst: 26,
    visib: "4.0",
    temp: 9,
    wxString: "RA",
    clouds: [{ cover: "BKN", base: 2500 }],
  },
];

const metar = normalizeAviationWeatherMetar(awcPayload, "KORD", {
  retrievedAt: now,
  sourceUrl: "https://aviationweather.gov/api/data/metar?ids=KORD&format=json",
});
assert.equal(metar.weather.condition, "rain");
assert.equal(metar.weather.windDirectionDegrees, 270);
assert.equal(metar.weather.ceilingFt, 2500);
assert.equal(metar.provenance.notForNavigation, true);
assert.throws(
  () =>
    normalizeAviationWeatherMetar([{ ...awcPayload[0], wspd: 260 }], "KORD", {
      retrievedAt: now,
    }),
  /wind speed/,
);

const notamPayload = {
  effectiveAt: "2026-07-27T17:55:00Z",
  expiresAt: "2026-07-27T20:00:00Z",
  items: [
    {
      id: "ORD-TEST-1",
      targetKind: "runway",
      target: "10L",
      status: "closed",
      startsAt: "2026-07-27T17:50:00Z",
      endsAt: "2026-07-27T19:00:00Z",
      summary: "Validation closure",
    },
  ],
};
const normalizedNotam = normalizeNotamProviderPayload(notamPayload, "KORD", {
  retrievedAt: now,
  providerName: "Validation NOTAM provider",
  sourceUrl: "https://notam.example/KORD",
  license: "Validation terms",
});
assert.equal(normalizedNotam.items[0].target, "10L");

const trafficPayload = {
  effectiveAt: "2026-07-27T18:00:00Z",
  expiresAt: "2026-07-27T18:30:00Z",
  periods: [
    {
      startsAt: "2026-07-27T18:00:00Z",
      endsAt: "2026-07-27T19:00:00Z",
      arrivals: 42,
      departures: 40,
      passengerShare: 0.72,
      cargoShare: 0.08,
      regionalShare: 0.18,
      generalAviationShare: 0.02,
      callsigns: ["MUST-NOT-SURVIVE"],
    },
  ],
};
const normalizedTraffic = normalizeTrafficProviderPayload(
  trafficPayload,
  "KORD",
  {
    retrievedAt: now,
    providerName: "Licensed aggregate validation provider",
    sourceUrl: "https://traffic.example/KORD",
    license: "Validation redistribution terms",
  },
);
assert.equal(normalizedTraffic.privacy.aggregateOnly, true);
assert.equal(
  JSON.stringify(normalizedTraffic).includes("MUST-NOT-SURVIVE"),
  false,
);

let awcCalls = 0;
const liveDataService = createLiveDataService({
  now: () => now,
  fetcher: async () => {
    awcCalls += 1;
    return new Response(JSON.stringify(awcPayload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
  notamProvider: async (station) => ({
    payload: notamPayload,
    providerName: "Validation NOTAM provider",
    sourceUrl: `https://notam.example/${station}`,
    license: "Validation terms",
  }),
  trafficProvider: async (station) => ({
    payload: trafficPayload,
    providerName: "Licensed aggregate validation provider",
    sourceUrl: `https://traffic.example/${station}`,
    license: "Validation redistribution terms",
  }),
});
await liveDataService.report("metar", "KORD");
await liveDataService.report("metar", "KORD");
assert.equal(awcCalls, 1, "METAR relay ignored its one-minute server cache");
assert.equal((await liveDataService.report("notam", "KORD")).items.length, 1);
assert.equal(
  (await liveDataService.report("traffic", "KORD")).periods.length,
  1,
);

let configuredUrl = "";
const configuredProvider = createConfiguredJsonProvider({
  endpointTemplate: "https://provider.example/v1/{station}",
  token: "provider-secret",
  providerName: "Validation provider",
  license: "Validation terms",
  fetcher: async (url, request) => {
    configuredUrl = String(url);
    assert.equal(request.headers.Authorization, "Bearer provider-secret");
    return new Response(JSON.stringify(notamPayload), { status: 200 });
  },
});
await configuredProvider("KORD");
assert.equal(configuredUrl, "https://provider.example/v1/KORD");
assert.throws(
  () =>
    createConfiguredJsonProvider({
      endpointTemplate: "http://evil.example/{station}",
    }),
  /HTTPS/,
);

const validationSource = `
import assert from 'node:assert/strict';
import { validateMetarReport, validateNotamReport, validateTrafficReport, trafficSeedPlan } from './src/live/liveDataAdapters.ts';
import { BoundedLiveDataCache } from './src/live/liveDataCache.ts';
import { LiveDataCoordinator } from './src/live/liveDataCoordinator.ts';

const metar = ${JSON.stringify(metar)};
const notam = ${JSON.stringify(normalizedNotam)};
const traffic = ${JSON.stringify(normalizedTraffic)};
const now = ${now};
assert.equal(validateMetarReport(metar).accepted, true);
assert.equal(validateMetarReport({ ...metar, weather: { ...metar.weather, windSpeedKts: 201 } }).accepted, false);
assert.equal(validateNotamReport(notam).accepted, true);
assert.equal(validateNotamReport({ ...notam, items: [{ ...notam.items[0], targetKind: 'apron' }] }).accepted, false);
assert.equal(validateTrafficReport(traffic).accepted, true);
assert.equal(validateTrafficReport({ ...traffic, privacy: { ...traffic.privacy, containsFlightIdentifiers: true } }).accepted, false);
const firstPlan = trafficSeedPlan(traffic);
const secondPlan = trafficSeedPlan(structuredClone(traffic));
assert.deepEqual(firstPlan, secondPlan);
assert.equal(firstPlan.density, 'rush');
assert.equal(firstPlan.rawFeedRetained, false);

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
const storage = new MemoryStorage();
const cache = new BoundedLiveDataCache(storage, 2, 20000, () => now);
assert.equal(cache.put(metar), true);
assert.deepEqual(cache.get('metar', 'KORD'), metar);

let calls = 0;
let fail = false;
const coordinator = new LiveDataCoordinator({
  storage,
  now: () => now,
  fetcher: async (url, request) => {
    calls += 1;
    assert.equal(String(url), 'https://gateway.example/v1/live/metar/KORD');
    assert.equal(request.headers.Authorization, 'Bearer validation-host-token-000000');
    if (fail) throw new Error('offline validation');
    return new Response(JSON.stringify({ report: metar }), { status: 200 });
  },
});
coordinator.configure({ enabled: false, endpoint: 'https://gateway.example', token: 'validation-host-token-000000' });
assert.equal((await coordinator.refresh('metar', 'KORD')).source, 'cache');
assert.equal(calls, 0, 'disabled coordinator opened a network request');
coordinator.configure({ enabled: true, endpoint: 'wss://gateway.example/v1/ws', token: 'validation-host-token-000000' });
assert.equal((await coordinator.refresh('metar', 'KORD')).source, 'network');
assert.equal(calls, 1);
assert.equal([...storage.values.values()].some((value) => value.includes('validation-host-token')), false, 'credential leaked into live-data cache');
fail = true;
assert.equal((await coordinator.refresh('metar', 'KORD')).source, 'cache');
assert.equal(coordinator.state().cache.entries <= 2, true);
console.log(JSON.stringify({ clientValidation: true, deterministicTrafficFingerprint: firstPlan.aggregateFingerprint, cache: coordinator.state().cache }));
`;

const bundle = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "live-data-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});
const bundled = bundle.outputFiles[0]?.text;
if (!bundled) throw new Error("Live-data validation bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

const hostToken = "validation-live-host-token-000000000";
const spectatorToken = "validation-live-spectator-000000";
const gateway = createRemoteGateway({
  tokens: [
    { id: "live-host", token: hostToken, roles: ["host"], sessions: ["*"] },
    {
      id: "live-viewer",
      token: spectatorToken,
      roles: ["spectator"],
      sessions: ["*"],
    },
  ],
  liveDataService,
});
const address = await gateway.listen({ host: "127.0.0.1", port: 0 });
try {
  const hostResponse = await fetch(`${address.httpUrl}/v1/live/metar/KORD`, {
    headers: { Authorization: `Bearer ${hostToken}` },
  });
  assert.equal(hostResponse.status, 200);
  assert.equal((await hostResponse.json()).report.station, "KORD");
  const spectatorResponse = await fetch(
    `${address.httpUrl}/v1/live/metar/KORD`,
    {
      headers: { Authorization: `Bearer ${spectatorToken}` },
    },
  );
  assert.equal(spectatorResponse.status, 403);
  assert.equal(
    (await fetch(`${address.httpUrl}/v1/live/metar/KORD`)).status,
    401,
  );
} finally {
  await gateway.close();
}

const mainSource = await readFile("src/main.ts", "utf8");
const panelSource = await readFile("src/ui/liveDataPanel.ts", "utf8");
const replaySource = await readFile("src/replay/replaySharing.ts", "utf8");
assert.match(panelSource, /Review & apply/);
assert.match(panelSource, /nothing applies automatically/);
assert.match(mainSource, /action: "setSurfaceDisruption"/);
assert.match(mainSource, /action: "setTrafficDensity"/);
assert.doesNotMatch(replaySource, /LiveTrafficReport|liveData|rawFeed/);

console.log(
  JSON.stringify({
    metarServerCacheCalls: awcCalls,
    humanReviewGate: true,
    gatewayAuthorization: true,
    aggregateTrafficOnly: true,
    offlineFallback: true,
  }),
);

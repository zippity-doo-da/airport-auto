# Operations Data Lab

Airport Auto 2.37 adds a local, read-only operations recorder and dashboard. It is an entertainment and testing tool, not an operational flight-data system and not a source of navigation data.

## What is recorded

The recorder samples the authoritative fixed-step simulation once per simulation second. It does not read positions back from Three.js and does not create a second movement path.

For every observed aircraft it retains:

- callsign, registration, model, airline, service, category, wake group, origin, destination, and route history;
- phase, runway, taxiway, authoritative world position, heading, pitch, ground state, and hold reason;
- altitude, indicated airspeed, ground speed, vertical speed, acceleration, and fuel percentage;
- observed airborne, surface, and held time.

The recorder also aggregates runway occupied time and movements, named taxiway occupied time and visits, queue-category depth and wait, shift metrics, and spatial cells for conflict forecasts. A conflict heat cell describes a forecast that the safety system handled; it is not evidence of a collision.

## Bounded retention

The recorder is intentionally bounded:

- one compact sample per simulation second;
- at most 7,200 samples per observed aircraft;
- at most 512 observed aircraft per analysis window;
- at most 256 conflict heat cells;
- no IndexedDB, local-storage archive, service-worker upload, or background network transmission.

Starting a new airport, sandbox board, training lesson, or challenge resets the analysis window. Closing or reloading the page discards the in-memory recorder unless the player explicitly downloads an export.

## Player interface

Open **Controls → Data lab**. The responsive drawer contains:

- a live shift pulse for traffic, flow, queues, safety invariants, and fuel;
- a single-aircraft flight-data-recorder chart for altitude, speed, and fuel, plus the latest exact values;
- runway and taxiway utilization views;
- a runway-context conflict forecast heatmap;
- local JSON and CSV export controls.

The drawer starts closed, closes other large overlays, blocks camera input while in use, supports keyboard focus and Escape, and stays inside laptop and phone viewports.

## Export formats

The JSON bundle contains analytics schema 1, all retained flight-recorder samples, commands, telemetry events, the current queue snapshot, and the disclosure record.

CSV can export one of ten flat datasets:

| Dataset | Contents |
| --- | --- |
| `flights` | Observed aircraft identities, routes, timing, and aggregate movement data |
| `commands` | Typed command requests and acceptance results |
| `events` | Domain and control telemetry events |
| `queues` | Current explainable operation-queue entries |
| `delays` | Per-aircraft observed held, surface, and airborne time |
| `runways` | Runway occupied time, movements, visits, and share |
| `taxiways` | Named taxiway occupied time, visits, and share |
| `shift-metrics` | Shift summary and safety/flow metrics |
| `flight-recorder` | One-second authoritative aircraft samples; optionally filtered by flight ID |
| `conflicts` | Aggregated spatial forecast cells by severity and conflict type |

Nested values are JSON-encoded inside CSV cells instead of becoming `[object Object]`.

## Local API

```js
airportControl.analytics()
airportControl.analytics(12)

airportControl.exportData('json')
airportControl.exportData('csv', 'runways')
airportControl.exportData('csv', 'flight-recorder', 12)
```

`snapshot().analytics` is a deliberately compact overview. `analytics()` returns the complete read-only dashboard snapshot. `exportData()` returns text and does not start a download or network request; the visible buttons create local browser downloads.

The authenticated remote projection receives only the bounded overview and disclosure—not flight-recorder traces, command/event archives, surface assets, or credentials.

## Privacy, consent, and future sharing policy

There is no cloud storage or public sharing in 2.37. A local export can contain fictional callsigns and registrations plus controller `actorId` and `clientId` values supplied by a local or remote controller. The UI therefore labels exports **local** and **not shareable by default**.

If shared replay storage is added later, its public payload must use an explicit allowlist.

Allowed after an informed, per-export opt-in:

- simulation version and schema versions;
- deterministic seed and airport/scenario identifiers;
- sourced airport asset version and attribution;
- simulated weather/environment history;
- fictional aircraft, route, operation, command action/timing, acceptance, and safety outcome data;
- pseudonymous station role labels chosen for the shared artifact.

Local-only or removed before sharing:

- control session, request, command, event, reconnect, and gateway correlation IDs;
- raw `clientId`, `actorId`, operator account, IP/network, browser, or device identifiers;
- gateway URLs, Origins, credentials, tokens, headers, audit storage paths, or rate-limit records;
- user-entered free text;
- live-feed data whose license or privacy terms do not permit redistribution;
- microphone, real radio, or runtime voice data, which Airport Auto does not collect.

A future sharing flow must show the allowlisted manifest before upload, require a separate affirmative action, support local redacted preview, publish retention/deletion terms, and never turn on automatically. Server-side retention, deletion, moderation, and revocation must exist before public links or classroom accounts ship.

## Validation

```bash
npm run test:operations-analytics
npm run test:control-protocol
npx playwright test e2e/airport-auto.spec.ts -g "Operations data lab" --project=desktop-chromium
npm run build
```

The deterministic validator covers sample cadence, duplicate-second rejection, authoritative kinematics, runway/taxiway/queue/delay aggregation, heat cells, all ten CSV datasets, JSON completeness, disclosure, and reset isolation. The browser test covers the API, local download, charts, runway context, overlay behavior, and 1024×600 plus 390×844 containment.


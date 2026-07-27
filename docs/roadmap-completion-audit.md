# Roadmap completion audit

This document is the release ledger for every valid item that was still open in `ROADMAP.md` when the completion audit began on 2026-07-27. It exists to prevent a completed implementation tranche from being confused with completion of the whole roadmap.

An item moves to **Complete** only when its implementation or explicit product decision is documented, its focused gate passes, and the relevant full release gate passes. “Foundation,” “partial,” and “candidate” work remains **In progress**. No item is closed merely because adjacent code exists.

Hosted deployment is deliberately outside this effort. The user asked to avoid GitHub Actions deployment; completion evidence is local unless that instruction changes.

## Audit ledger

| ID | Roadmap requirement | Status | Completion evidence / remaining acceptance |
| --- | --- | --- | --- |
| A1 | License-cleared engine, APU, ramp, cabin-area, runway, rain, wind, terminal, and tower-room recordings | Pending | Acquire or create the library, record provenance and licenses, normalize it, and pass offline/audio repetition gates. |
| A2 | Detailed taxi-whine, power, reverse, runway-rumble, touchdown, flap/gear, pushback, tug, and service-vehicle layers | Pending | Wire persistent and event layers to authoritative state, including independent mixing and deterministic replay decisions. |
| A3 | Richer weather-specific rain, snow, thunder, gust, and low-visibility ambience | Pending | Extend the existing procedural beds with condition-specific layers that exactly obey weather/wind/high-stakes switches. |
| A4 | Reusable offline fictional, captioned ATC voice library | Pending | Pre-render or record disclosed fictional voices, add a license/source manifest, and sequence by airport/station/state without runtime generation. |
| A5 | Long-loop randomization, density-aware mixing, calm alerts, and measured repetition budgets | Pending | Add multi-hour event/repetition measurement and prove bounded, non-fatiguing playback. |
| L1 | Optional cached METAR ingestion | Pending | Unit validation, freshness/provenance display, privacy-safe opt-in, bounded cache, and deterministic offline fallback are required. |
| L2 | Optional cached NOTAM/runway/taxiway-status ingestion | Pending | Parsed material must require human review before it can alter simulated topology; offline operation must remain complete. |
| L3 | Optional schedule/traffic feeds | Pending | Add a licensed provider adapter that seeds deterministic operations without exposing restricted raw data in replays or telemetry. |
| S1 | Screenshot and short-clip capture plus clean spectator presentation | Pending | Add local capture controls, capture-safe HUD/chrome state, bounded clip generation, and browser coverage. |
| S2 | Daily challenges, classrooms, shared sessions, and server-validated leaderboards only if directionally appropriate | Pending decision | Resolve the ASMR/product question first; implement only the parts supported by that decision. |
| E1 | Continue splitting simulation, rendering, and application coordinators | Complete | Focused runway, migration, asset, and landscape modules now own their domains; the renderer delegates all major scene subsystems. The release-bounded extraction is verified by TypeScript, lint, build, deterministic, and browser gates. |
| E2 | Centralize runway/runway-end, surface-protection, separation, and procedure rules | Complete | `operationalRules` catalogs six canonical rule families; `test:rule-ownership` proves seven key definitions have one owner and `test:rule-properties` exercises their cross-system behavior. |
| E3 | Schema migrations for airport assets, saves, recordings, commands, events, and replays | Complete | `schemaMigrationCatalog` exposes 11 fail-closed contracts; `test:schema-migrations` covers chained legacy migration, current acceptance, missing steps, and future rejection. |
| E4 | Stable asset manifest | Complete | Synchronized bundled/public manifests provide stable logical keys, hashes, licensing references, and deployment-relative resolution; `test:asset-manifest` verifies parity and every referenced byte. |
| E5 | Extend instancing to suitable lights, markings, buildings, and repeated airport props | Complete | Landscape districts/roads/markings, terminal windows, construction cones, and disabled-aircraft beacons use instance groups; `test:renderer-resources` and visual baselines prove the bounded rendering contract. |
| E6 | Extend pooling to trails, weather effects, labels, route previews, sound emitters, and transient events | Complete | Bounded reusable pools now cover route/separation geometry, aircraft-owned trails/labels, fixed-capacity weather particles, transient markers, and spatial sound emitters; diagnostics expose capacity/reuse and the full growth/safety suite passes. |
| Q1 | Browser smoke coverage for every named airport/scenario and visual baselines for representative desktop/mobile scenes | Complete | `test:release-matrix` boots 11 airports and six scenarios and verifies committed ORD desktop and ATL mobile spectator screenshots. |
| Q2 | Property tests for graph imports, exact replay, route crossings, wake/runway rules, and command authorization | Complete | `test:rule-properties` covers 34 generated airports, 367 runway pairs, 2,208 route cases, 268 crossing cases, 24 configuration cases, all 92 commands, and 60 replay partitions. |
| Q3 | Accessibility regression checks for focus, keyboard flow, touch targets, readable labels, captions, contrast, and reduced motion | Complete | The browser release matrix verifies inert modal focus, keyboard drawer flow, readable labels, captions, semantic contrast, 44px touch targets, and reduced runtime/CSS motion. |
| D1 | Decide whether progression and leaderboards improve or conflict with open-ended ASMR | Pending decision | Record a decision with goals, guardrails, and rejected alternatives; reconcile S2. |
| D2 | Choose a second high-fidelity airport only after ORD v1 meets its acceptance gate | Pending decision | Run the documented ORD gate first; either choose the second airport with rationale or explicitly defer it. |

## Evidence commands

The audit uses these focused local gates in addition to the existing full `npm test`, `npm run test:e2e`, `npm run lint`, and `npm run build` gates:

- `npm run test:asset-manifest`
- `npm run test:schema-migrations`
- `npm run test:rule-properties`
- `npm run test:rule-ownership`
- `npm run test:renderer-resources`
- Audio library/repetition gate (to be added with A1–A5)
- Live-adapter gate (to be added with L1–L3)
- Capture/spectator gate (to be added with S1)
- `npm run test:release-matrix`

## Completion rule

The roadmap is complete only when every row above is **Complete** or has a documented, deliberate **Complete — deferred by product decision** outcome, all focused gates pass, the full deterministic/browser/build/lint gates pass, and `ROADMAP.md` agrees with this ledger.

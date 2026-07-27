# Airport Auto

Airport Auto is a browser-based air-traffic game and hands-off airport simulation. Watch a continuous operation in Full Auto or low-chrome Watch mode, approve explained clearances in Assisted ATC, or work Approach, Tower, Ground, Ramp, and Supervisor positions in Full Manual.

[Open the live 2.40 build](https://zippity-doo-da.github.io/random_art_projects/airport-auto/). It was published additively on July 27, 2026, without replacing the existing `random_art_projects` menagerie.

The airport layouts are readable operational schematics inspired by real runway patterns. They are not navigation charts and must not be used for real-world aviation.

## What is included

- Ten named hubs: ATL, ORD, DXB, HND, DFW, LHR, IST, DEN, LAX, and JFK, plus a newly generated local airport each session.
- Continuous arrivals from the map boundary, curved approaches, flare, touchdown, aircraft/weather/traffic-aware runway-exit selection, pavement-continuous taxi, full takeoff roll, rotation, and climb-out.
- Clear, haze, rain, fog, snow, and thunderstorm operations with modeled three-segment runway-condition reports, contaminated-surface aircraft performance, weather-aware taxiing, and separately opt-in deterministic wind-shear/microburst escapes. These are schematic entertainment systems and explicitly not navigation data.
- A deterministic local-time environment moves continuously through dawn, day, dusk, and night, with seasonal daylight/terrain, weather-driven clouds, drying pavement, snow accumulation/melt, and responsive runway lighting. Automatic lighting/season defaults can be overridden for calm watching or repeatable tests.
- A compressed local-day profile gives every airport smooth arrival/departure banks plus passenger, cargo, regional, and general-aviation streams; the active bank is visible in the HUD and control API.
- Graph-routed pushback and taxi movement on visible pavement, with Ramp pushback clearance, Ground movement-area control, animated tug attachment/release, engine-start state, aircraft-specific circular turns and braking, wingtip-aware and congestion-aware routing, directional ramp alleys, finite-capacity ramp-control zones, explicit stand in/out paths, named taxiways, hold-short points, crossing clearances, runway reservations, and collision prevention.
- Supervisor-controlled runway/taxiway closures and construction zones amend the live graph; aircraft reroute without jumping or hold with an explanation, while Ground can dispatch deterministic disabled-aircraft recovery.
- A compact optional queue inspector explains gate, ramp, taxi, crossing, runway, wake, weather, and downstream blockers with wait time, shared-resource position, causal traffic, and one-click live blocker focus.
- Scheduled gate assignment scores airline/terminal affinity, aircraft size, passenger or cargo service, arrival time, the next destination/runway, taxi distance, and non-overlapping stand reservations; physically conflicting adjacent jumbo stands are mutually exclusive, and changed arrival times are rechecked before taxi-in.
- Fixed-step turnarounds run fueling, baggage or cargo, catering, cleaning, boarding, and optional maintenance as explicit parallel/dependent tasks. Pooled fuel trucks, baggage trains, cargo loaders, catering trucks, cleaning/maintenance vans, and remote-stand passenger coaches travel reserved ramp routes, stage beside the assigned stand, and must clear before pushback.
- Snow activates contaminated-surface performance and a complete ORD winter departure loop: graph-routed deicing-pad assignment, four treatment lanes, an ordered queue, stopped treatment, visible holdover time, protected runway entry, and return-to-pad routing after expiry.
- Auto, Assisted, Manual, and Watch modes; deterministic Approach, Tower, Ground, Ramp, and Supervisor programs with distinct authority, explainable accepted/rejected/deferred decisions, causal audit and takeover history, explicit track/action capacity, and configurable unstaffed-desk automation. Supervisor can select Balanced, Conservative, Efficient, Calm, Teaching, or game-scale Realistic Tempo policy without weakening the shared safety arbiter. A separate read-only evaluator reports conflict/incursion outcomes, delay, throughput, hold fuel, stale-hold candidates, rejected commands, and station/actor command quality without feeding scores back into safety. Five controller positions retain distinct traffic, alerts, workload, objectives, and performance scorecards; six scenarios, independent Quiet/Realistic/Busy/Rush/Extreme traffic, weather/wind controls, replay, and unified keyboard/mouse/touch/gamepad actions complete the operating modes.
- A deterministic five-channel soundscape gives up to 14 nearby aircraft persistent model/power-aware spatial voices, camera-relative attenuation and restrained Doppler; field, tower, ramp, APU, rain, snow, and wind beds follow the displayed live or replay state; operational cues use seeded variants and cooldowns. Fictional offline ATC captions have readable dwell and independent radio/caption toggles, while rare thunder is separately opt-in. No microphone, live radio, runtime voice generation, API key, or network audio is used.
- Four no-fail controller lessons cover arrival fundamentals, Tower landing coordination, Ramp/Ground surface flow, and explicit handoffs. A compact coach explains each instruction, pauses on rejected commands, and can restore the exact start-of-step simulation checkpoint without bypassing safety.
- Four five-to-seven-minute controller challenges cover a rush bank, storm recovery, runway closure, and emergency priority. Each locks a reproducible traffic/weather setup, keeps unstaffed desks automated, grades live safety/throughput/delay/fuel objectives, and ends with a complete operational debrief.
- A schema-versioned UTC daily challenge rotates through every named hub and existing challenge. Privacy-safe classroom links reproduce the same deliberate Assisted/Supervisor briefing without accounts, identity, score upload, or automatic start; genuinely shared stations use the optional authenticated gateway.
- A true no-score, no-fail traffic sandbox opens on a clean airport, safely queues one to eight arrivals or stand-staged departures by class and runway, optionally restores continuous background demand, and preserves normal weather, configuration, pavement, separation, and authority rules.
- Airline-specific schematic hub banks, representative carrier markets and range-compatible fleets, complete per-leg flight plans, bounded arrival metering, hold-short departure slots, explainable back-pressure, and deterministic diversion/cancellation recovery.
- Versioned, explicitly non-navigational SID/STAR programs for every airport, with edge-entry transitions, fixes, sectors, altitude/speed constraints, smooth downwind/base/final geometry, selected missed approaches, departure headings, and optional route/fix/separation overlays.
- Live Approach commands for heading, altitude, speed, direct-to, approach clearance, holds/EFCs, and re-entry; explicit Approach → Tower → Ground → Ramp arrival ownership and reverse departure handoffs; Tower landing/line-up/takeoff authority; and atomic 2–8-aircraft groups limited to a shared safe pace or surface hold/resume instruction.
- Forgiving and opt-in FAA-inspired terminal separation rulesets in nautical miles, feet, and seconds, with modeled visibility, ceiling, wind, surface condition, runway relationship/configuration, and clearly labeled simplified wake groups.
- Six sourced O’Hare runway plans with dynamic arrival/departure roles, visual and instrument restrictions, strong-southerly contingency operations, and safe drain-then-switch transitions.
- A 17-model procedural fleet spanning general aviation, utility turboprop, business jet, regional, narrowbody, widebody, jumbo, and cargo operations. Eleven original visual families carry distinct dimensions, range, usable fuel, cruise burn, runway performance, handling, wake, and presentation parameters.
- Route-aware fuel planning estimates each leg's trip, taxi, contingency, alternate, and final-reserve fuel. Arrivals enter with a plausible reserve rather than a nearly full tank; turnarounds load the modeled onward dispatch amount. Flight chips show modeled fuel, IAS/groundspeed, altitude, and 001–360 heading/cardinal course.
- A protocol-1.2 browser API and same-origin `BroadcastChannel` bridge with JSON Schemas for 92 commands, explicit station authority, structured results, causal command and scripted-controller decision IDs, replay audit data, controller policy/evaluation state, and API-2.x compatibility for playtests and controller agents. An optional authenticated gateway adds exclusive remote station leases, human/agent/spectator clients, a controller console, read-only HTTP state/metrics, rate limits, timeouts, audit, reconnect, and emergency stop without changing the safety arbiter; static Pages remains disconnected and deterministic by default.
- Optional default-off live data uses that gateway for official METAR and operator-configured NOTAM/aggregate-traffic adapters. Every report is unit/schema/provenance validated and cached; weather/topology/demand changes require explicit human application through the normal authority and safety paths, while offline operation remains complete.
- Local capture saves a PNG or bounded 3–15-second silent WebM from the canvas, with a clean spectator presentation and explicit no-microphone/no-upload behavior.
- A local Operations Data Lab with bounded authoritative flight-recorder traces, runway/taxiway utilization, queue and shift analytics, a conflict-forecast heatmap, and explicit-download JSON/CSV exports. It has no cloud upload and publishes a privacy/redaction boundary before future sharing work.
- Replay schema 4 fingerprints every authoritative full-state frame, adds event-marker seeking and bounded state comparison, imports schema 4 or visibly unsealed schema 3 files, and generates exact airport-seed launch links. Raw Export stays local and may contain controller identity; Share creates a separately fingerprinted package with identity, correlations, payloads, and free text removed.
- A bounded local runtime monitor separates visible frame gaps from main-thread frame work, measures fixed simulation ticks, and tracks memory, aircraft, service vehicles, spatial audio voices, queues, draw calls, geometries, and long-session growth against explicit budgets. The optional Performance panel and page-local API never change traffic or safety rules.
- A fully offline ORD data foundation: FAA runway/apron/building/hot-spot geometry, a normalized OpenStreetMap surface graph with 40 compatible stands, 219 sourced gates, 364 parking positions, 35 operational zones and 248 control points, plus Chicago Department of Aviation terminal/concourse inventory and coherent east/west runway flows.
- Optional muted taxiway-label, operational-area, hot-spot, runway-label, airspace-sector, navigation-fix, SID/STAR, active-route, separation-ring, compass/scale, wind, service-vehicle, and compact terminal-radar layers preserve a clean ASMR view while exposing controller detail on demand.
- An on-demand observer navigator can frame or smoothly follow any aircraft, runway, named taxiway, gate, operation queue, or predicted conflict. An optional calm camera director chooses active operations with long deterministic dwells, but immediately turns itself off for any manual camera input and respects reduced-motion preferences.
- Original, high-contrast, blue/amber color-vision-safe, and monochrome semantic palettes update UI and map cues, persist locally, and apply across every airport.

## Run locally

Requires Node.js 20 or newer.

```bash
npm ci
npm run dev
```

Production verification:

```bash
npm test
npm run test:e2e
npm run lint
npm run build
npm run preview
npm run test:runtime-performance
# Optional four-modeled-hour Extreme ORD acceptance soak:
npm run soak:runtime
```

Browser tests use port 4178 by default. Set `AIRPORT_AUTO_E2E_PORT` to an unused local port when another project is already running there.

Optional trusted remote-controller sessions run as a separate process; the game never starts it or connects automatically:

```bash
# First create an ignored token manifest from server/token-manifest.example.json.
AIRPORT_REMOTE_TOKEN_FILE=server/token-manifest.json \
AIRPORT_REMOTE_ORIGINS=http://127.0.0.1:5173 \
npm run remote:gateway
```

See [docs/remote-control-gateway.md](docs/remote-control-gateway.md) before exposing the service beyond localhost.

## Controls

- Click a flight strip or aircraft to select and follow it; click the same aircraft again, click empty ground, or press `Escape` to return to the free camera.
- Press `F` or use the `◎` camera button to focus aircraft, runways, taxiways, gates, queues, or conflicts. Close the navigator while keeping focus, or release from its compact following chip.
- Use **Group select** in the flight bay, then choose 2–8 strips or aircraft. Only instructions shared by every selected flight appear; grouped runway clearances, vectors, route changes, and expedite are intentionally unavailable.
- Drag with a mouse or one finger to pan; use the middle mouse button from anywhere; hold `WASD` or the arrow keys for smooth movement; use `Q`/`E` to rotate; scroll or pinch to zoom.
- A standard-mapped gamepad is optional: left stick/D-pad pans, right stick rotates and zooms, triggers zoom, bumpers cycle aircraft, A uses the shown action, B cancels/releases follow, Back opens Controls, and Start pauses. Enable it and adjust stick sensitivity under **Controls → Replay & agent tools → Unified input**.
- Under **Controls → Replay & agent tools**, scrub or import read-only replays, jump to event markers, compare two authoritative frames, verify deterministic receipts, copy an exact seed link, or export/share according to the displayed privacy class.
- Use **Performance** for local frame/simulation/resource budgets; `?debug=1` opens the same panel at launch.
- `L`: clear selected arrival to land.
- `G`: send the selected arrival into a climbing missed-approach circuit and back into the arrival sequence.
- `H`: hold or resume selected surface aircraft.
- `R`: line up / clear runway entry.
- `T`: clear takeoff after line-up.
- `V`: cycle cameras; `+`/`-`: zoom; `0`: reset the camera and map position.
- `C`: open or close Controls; `F`: observer focus; `M`: toggle radar; `O`: toggle queues; `Space`: pause; `Escape`: close the active overlay or release focus.

The selected-flight panel exposes the same commands with contextual buttons, including vectors, altitude and airspeed, direct-to, approach/hold/EFC, explicit handoff, individual runway-crossing, line-up, and takeoff instructions. Commands are enabled only for the station currently owning that flight; Supervisor can work all positions.

## Launch parameters

This URL starts a busy O'Hare session with local telemetry visible:

```text
http://127.0.0.1:5173/?airport=ORD&mode=auto&scenario=rush&speed=3&autostart=1&telemetry=1
```

Useful parameters include `airport`, exact nonnegative integer `seed`, `mode`, `scenario`, `density`, `rules`, `station`, `lesson`, `challenge`, deterministic `daily=YYYY-MM-DD`, classroom cohort date, `sandbox=1`, `background=1`, `speed`, `weather`, `wind`, `windDir`, `hazards=1`, `runwayConfig`, `lighting`, `season`, `palette`, `director=1`, legacy `night=1`, `radar=1`, `queues=1`, `gamepad=0|1`, `gamepadSensitivity=0.5..2`, `telemetry=1`, `debug=1`, `detail=low`, `soak=1`, and `autostart=1`. A valid `daily` value authoritatively selects its airport, seed, Assisted/Supervisor posture, forgiving rules, and challenge; classroom links deliberately omit `autostart`. `background=1` restores continuous demand inside a sandbox. Lighting values are `automatic`, `day`, and `night`; season values are `automatic`, `spring`, `summer`, `autumn`, and `winter`; palette values are `standard`, `high-contrast`, `cvd-safe`, and `monochrome`. Lesson values are `arrival-basics`, `tower-landing`, `surface-flow`, and `handoff-workflow`; challenge values are `rush-hour`, `storm-operations`, `runway-closure`, and `emergency-priority`; modes are `auto`, `assisted`, `manual`, and `watch`; density values are `quiet`, `realistic`, `busy`, `rush`, and `extreme`; separation values are `forgiving` and `realistic`; weather values are `clear`, `haze`, `rain`, `fog`, `snow`, and `thunderstorm`. Rare wind-shear and microburst events remain disabled unless the player enables **Rare severe weather** or supplies `hazards=1`.

See [docs/airport-control.md](docs/airport-control.md) for the live-control interface, [docs/live-data-adapters.md](docs/live-data-adapters.md) for optional METAR/NOTAM/traffic ingestion, [docs/media-capture.md](docs/media-capture.md) for local screenshots/clips, [docs/community-and-product-direction.md](docs/community-and-product-direction.md) for daily/classroom sharing, the leaderboard decision, and ATL selection, [docs/replay-verification.md](docs/replay-verification.md) for exact replay, migration, comparison, and privacy-filtered sharing, [docs/environment-presentation.md](docs/environment-presentation.md) for lighting, seasons, palettes, and the camera director, [docs/operations-data-lab.md](docs/operations-data-lab.md) for local analytics, exports, retention, and sharing policy, [docs/soundscape.md](docs/soundscape.md) for spatial audio, fictional radio captions, provenance, and replay, [docs/remote-control-gateway.md](docs/remote-control-gateway.md) for authenticated external controller hosting and security, [docs/controller-evaluation.md](docs/controller-evaluation.md) for read-only human/agent decision metrics, [docs/observer-focus.md](docs/observer-focus.md) for multi-target camera focus, [docs/input-controls.md](docs/input-controls.md) for keyboard, pointer, touch, and gamepad bindings, [docs/sandbox-lab.md](docs/sandbox-lab.md) for traffic injection and no-fail behavior, [docs/controller-roles.md](docs/controller-roles.md) for station boundaries and performance scorecards, [docs/challenge-shifts.md](docs/challenge-shifts.md) for timed shifts, objectives, grades, and debrief rules, [docs/aircraft-operations.md](docs/aircraft-operations.md) for the aircraft roster, carrier mix, fuel model, and effects, [docs/performance-budget.md](docs/performance-budget.md) for measured runtime budgets and Worker/WASM thresholds, [docs/traffic-profiles.md](docs/traffic-profiles.md) for the compressed local day and traffic streams, [docs/queue-inspector.md](docs/queue-inspector.md) for structured blockers, [docs/airport-operations-review.md](docs/airport-operations-review.md) for modeled rules and deliberate simplifications, [docs/surface-disruption-operations.md](docs/surface-disruption-operations.md) for closures, construction, rerouting, and recovery, [docs/runway-exit-operations.md](docs/runway-exit-operations.md) for arrival-exit planning, [docs/gate-operations.md](docs/gate-operations.md) for scheduled stand planning, [docs/turnaround-operations.md](docs/turnaround-operations.md) for servicing and departure readiness, [docs/service-vehicle-operations.md](docs/service-vehicle-operations.md) for ramp-equipment routing and protection, [docs/deicing-operations.md](docs/deicing-operations.md) for the winter departure lifecycle, and [docs/airport-data-sources.md](docs/airport-data-sources.md) for airport-map provenance and import policy. Completed releases are recorded in [PLAN.md](PLAN.md); the now-complete post-2.1 scope and acceptance evidence remain in [ROADMAP.md](ROADMAP.md).

## Architecture

The simulation is authoritative and renderer-independent. A deterministic fixed-step clock integrates speed and acceleration into path distance and owns each serializable aircraft and service-vehicle pose. Station programs inspect that state on a fixed simulation cadence and issue ordinary public commands through the same authority and safety arbiter as a person or agent. Three.js only interpolates simulation state for smooth presentation; the DOM HUD issues validated commands; and audio/telemetry consume simulation state and events. Rendering never decides where an entity is or whether a movement is safe.

The project is intentionally lightweight: TypeScript, Vite, and plain Three.js, with no backend required for the shipped game. The optional Node/WebSocket gateway is a replaceable transport adapter and does not enter the simulation or rendering dependency graph.

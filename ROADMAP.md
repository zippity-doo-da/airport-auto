# Airport Auto — Forward Roadmap

Last reconciled: July 25, 2026
Baseline: Airport Auto 2.21.0

Airport Auto is an **ASMR-first web airport simulation with an optional serious ATC layer**. The simulation should remain enjoyable as a calm, hands-off miniature world while also supporting increasingly authentic controller work when the player asks for it.

This document contains only unfinished, still-valid work. Shipped behavior belongs in [PLAN.md](PLAN.md), the release ledger. An unchecked item here is not a claim that the current release is broken; it is future product work.

## Roadmap rules

- Preserve the 2.1 safety foundation: fixed-step authoritative motion, one simulation/render path, protected surface movement, safe command arbitration, deterministic replay, and zero-collision release gates.
- Treat named airports as **ATC schematics** until a documented, licensed data import has been validated against a current authoritative airport diagram.
- Imported geography is compiled into versioned local assets. The simulation must not require a live map service to run.
- Live weather, schedule, or traffic integrations must be optional and must have deterministic offline fallbacks.
- Human UI, scripted controllers, remote clients, and future agents all use the same typed commands and safety arbiter.
- Keep the present TypeScript/Vite/Three.js stack. Add Web Workers or WASM only when profiling identifies a measured bottleneck.
- Do not trade ASMR continuity for extra detail: no repetitive alerts, unexplained pauses, camera jolts, or excessive HUD chrome.

## Milestone 1 — ORD Surface Graph v1

**Status: complete in 2.2.** O’Hare is operationally recognizable while remaining explicitly schematic.

### Source and import pipeline

- [x] Select documented, license-compatible sources for airport geometry, surrounding roads, land use, rail, and water.
- [x] Record source, license, retrieval date, coordinate system, and data version in each generated airport asset.
- [x] Build an offline importer that converts source coordinates into the simulation’s local coordinate system.
- [x] Normalize imported features into a compact, versioned airport vector format rather than loading raw OSM or diagram data at runtime.
- [x] Add deterministic import validation for disconnected edges, duplicate nodes, impossible turns, undersized clearances, and unreferenced features.
- [x] Show attribution and map-version metadata in About/settings and `airportControl.snapshot()`.

### Airfield topology

- [x] Model all current ORD runway thresholds, declared operating ends, exits, touchdown zones, rollout regions, and runway-protection areas.
- [x] Import the major named taxiways, direction-aware segments, intersections, bridges/tunnels where relevant, and published hot spots.
- [x] Generate explicit hold-short, runway-entry, crossing, line-up, and departure-release points from the graph.
- [x] Model the terminal complex, terminal/remote ramps, cargo areas, maintenance area, deicing pads, holding pads, and perimeter routes as separate operational zones.
- [x] Split ORD passenger facilities into distinct terminals and concourses and associate sourced gate/stand positions with them.
- [x] Add unique stands with aircraft-size compatibility, pushback direction, ramp access, and occupancy constraints.
- [x] Derive actual route-crossing clearances from the imported route and protected runway zones.
- [x] Support coherent ORD east-flow and west-flow runway configurations without moving visual markers to the wrong threshold.
- [x] Add less-common ORD runway configurations, mixed-mode runway-role changes, configuration transition queues, and weather/procedure restrictions.

### Chicago context and presentation

- [x] Replace repeated district tiles with recognizable airport-adjacent ground, highways, major roads, rail corridors, and development patterns.
- [x] Keep the airport on continuous land and show a credible airport boundary; do not present O’Hare as an island.
- [x] Add optional taxiway IDs, runway labels, operational areas, FAA hot spots, and clean-map layer controls that default off.
- [x] Add an optional north arrow, map scale, and sourced airport-boundary layer.
- [x] Keep terminals, scenery, roads, and props outside every protected movement-surface envelope.
- [x] Preserve the original muted miniature visual language instead of copying chart or satellite aesthetics.

### ORD v1 acceptance gate

- [x] Every active stand can reach at least one compatible departure runway using pavement-only routes.
- [x] Every landing runway can reach a compatible free stand without an unexplained teleport, grass segment, or unmodeled crossing.
- [x] Every runway crossing on a route maps to a specific hold-short point and explicit clearance.
- [x] No building, scenery object, or road overlaps a protected runway or taxiway envelope.
- [x] Rush Auto and Watch soaks sustain concurrent arrivals, departures, and multiple nonconflicting surface movements with zero collisions or incursions.
- [x] The renderer pose and simulation pose remain identical at imported curves and tight intersections.
- [x] ORD remains labeled “schematic” until source review and all acceptance checks are complete.

## Milestone 2 — Living ground operation

Turn the safe surface graph into a believable airport lifecycle.

**Status: complete in 2.12.** Pushback shipped in 2.3, aircraft-specific ground handling in 2.4, ramp/alley flow control in 2.5, scheduled gate assignment in 2.6, explicit turnaround services in 2.7, protected service-vehicle routing in 2.8, winter deicing in 2.9, performance/traffic-aware runway-exit selection in 2.10, dynamic surface restrictions/recovery in 2.11, and the explainable queue inspector in 2.12.

- [x] Add explicit pushback clearance, tug attachment, push direction, engine-start state, and tug release.
- [x] Add aircraft-specific taxi speed, turn-radius, stopping-distance, and wingtip-clearance behavior on the imported graph.
- [x] Add ramp-control zones, alley conflicts, one-way restrictions, stand lead-in/lead-out paths, and congestion-aware routing.
- [x] Add gate assignment by airline, terminal, aircraft size, service type, arrival time, and next departure.
- [x] Replace the simple turnaround timer with optional fueling, baggage, cargo, catering, cleaning, boarding, and maintenance states.
- [x] Add service vehicles with reserved routes that never cross protected movement areas without authorization.
- [x] Add deicing pads, queues, treatment time, holdover time, and winter routing.
- [x] Add taxiway/runway closures, construction zones, disabled-aircraft recovery, and graph rerouting.
- [x] Add a queue inspector that explains gate, ramp, taxi, crossing, runway, wake, weather, and downstream blockers.

## Milestone 3 — Terminal traffic, separation, and procedures

Move from plausible continuous traffic to an explainable hub operation.

### Traffic and capacity

**Status: complete in 2.14.** Version 2.13 established the compressed operation day; 2.14 adds sourced-schematic airline programs, density profiles, complete plans, bounded flow management, pressure relief, and long-session validation.

- [x] Build airport operation profiles with time-of-day arrival, departure, cargo, regional, and general-aviation streams. (2.13: deterministic compressed local clock, smoothly blended demand periods, class-aware fleet generation, visible/API bank state, and profiled arrival/departure cadence.)
- [x] Add airline-specific hub banks, fleet mixes, gate preferences, overnight cargo peaks, and recovery lulls. (2.14: sourced operator/terminal relationships with explicitly schematic deterministic weights, fleets, markets, cargo periods, and recovery bands.)
- [x] Add Quiet, Realistic, Busy, Rush, and Extreme density profiles with explicit capacity assumptions. (2.14: independent demand/capacity/holding/entity/delay/recovery parameters that are not overwritten by scenario choice; safety rules never scale down.)
- [x] Generate complete flight plans with origin, destination, route, procedure, airline, aircraft, gate, runway intent, and release time. (2.14: versioned schematic-direct plans plus status, ETA, revision, and amendment history.)
- [x] Add arrival metering, departure release slots, runway queues, holding capacity, and explainable back-pressure. (2.14: bounded invisible inbound demand and hold-short departure metering feed the shared queue inspector.)
- [x] Add rerouting, gate swaps, runway changes, diversions, and cancellation behavior when capacity is unavailable. (2.14: all are plan amendments or pressure-relief history; active movement remains continuous.)
- [x] Ensure a long session continuously creates new traffic without entity leaks, fixed batches, or stand reuse. (2.14: bounded histories and a 12-hour compressed Extreme ORD soak prove new entities, physical stand exclusivity, concurrent taxiing, and zero safety breaches.)

### Airspace and procedures

**Status: complete in 2.15.** Every airport now receives a versioned, explicitly non-navigational terminal program; authoritative trajectories, the normal UI, recordings, and API consume the same selected procedure and controller amendments.

- [x] Add versioned, non-navigational fixes, airways, terminal sectors, and altitude/speed constraints.
- [x] Add airport-specific SID and STAR procedure profiles with transitions, runway compatibility, and weather/configuration selection.
- [x] Add vectors, extended downwinds, base turns, intercept geometry, speed control, altitude assignments, and approach clearances.
- [x] Add published-style holding patterns, expect-further-clearance timing, missed-approach paths, and safe re-entry into the arrival sequence.
- [x] Add departure headings, initial climbs, handoff points, and climb restrictions instead of a single generic climb-out.
- [x] Add optional airspace, fix, procedure, route, and separation overlays that stay hidden in Watch mode by default.

### Physical separation model

**Status: complete in 2.15.** Physical NM/ft/time rules now sit above the renderer-independent collision envelope, with an explicit forgiving default and an opt-in FAA-inspired terminal ruleset. The wake model remains deliberately simplified and is labeled as such throughout the UI/API.

- [x] Replace compressed game-scale airborne buffers with configurable physical distance/time rules.
- [x] Adopt documented aircraft wake categories—such as current CWT/RECAT-style groups—or clearly label a simplified ruleset.
- [x] Model arrival, departure, opposite-direction, intersection-departure, converging-runway, and closely-spaced-parallel constraints.
- [x] Tie visibility, ceiling, wind, runway condition, aircraft category, and airport configuration to applicable separation and capacity.
- [x] Keep a forgiving game ruleset available, but display which ruleset is active and never mix its units with realistic telemetry.

## Milestone 4 — Serious ATC game loop

Make each controller position a complete, satisfying job rather than a filtered view of the same loop.

- [x] Expand the typed command vocabulary with heading, altitude, speed, direct-to, clear approach, route amendment, pushback, taxi route, hold position, divert, and contact/handoff commands. (2.17: every command uses station ownership and the shared safety boundary; route/taxi amendments remain continuous and diversion flies to the scope edge.)
- [x] Add safe route editing with previews, conflict warnings, and explicit readback/acceptance state. (2.18: normal-UI route choice, non-mutating map previews, physical look-ahead warnings, staged issue/readback/revalidation, supersession cancellation, and the same arbiter for legacy/API commands.)
- [x] Add multi-select and grouped commands only where aircraft share a safe, compatible instruction. (2.19: 2–8-aircraft strip/map selection, non-mutating compatibility previews, shared domain/authority/ownership checks, atomic issue, and explicit exclusion of runway clearances, vectors, route changes, expedite, and zigzag.)
- [x] Add controller handoffs, frequency ownership, strip bays, coordination requests, and late/missed-handoff consequences. (2.20: staged offer/accept-or-reject/contact ownership, per-station coordination bay, deterministic unstaffed-position responses, overdue metrics, and protected Ramp/Ground boundary holds.)
- [ ] Give Approach, Tower, Ground, Ramp, and Supervisor distinct traffic, authority, alerts, workload, and success measures.
- [x] Add configurable automation for unstaffed positions so one player can work a single station while the airport continues safely. (2.16: Supervisor can automate each desk; selecting Approach, Tower, Ground, or Ramp staffs the other positions.)
- [ ] Add training lessons, contextual explanations, pause-and-recover tools, and a no-fail learning mode.
- [ ] Add challenge shifts, runway-closure/storm/emergency scenarios, objectives, grades, delay, fuel, throughput, and safety summaries.
- [ ] Add a true sandbox with traffic injection, weather/configuration controls, and no score pressure.
- [ ] Add a unified keyboard, mouse, touch, and optional gamepad action layer.
- [ ] Allow focus/follow for aircraft, runway, taxiway, gate, queue, or detected conflict.

## Milestone 5 — Agents and multi-controller operation

Use the 2.3 local control API as the safety boundary for live human and agent controllers.

- [ ] Publish a formal command/event schema with parameters, results, causal event IDs, authority, and compatibility rules.
- [ ] Add deterministic scripted controllers for Approach, Tower, Ground, Ramp, and Supervisor before introducing LLM decisions.
- [ ] Add per-station controller policies, workload limits, handoff behavior, explainable decisions, and human takeover.
- [ ] Add evaluation metrics for conflicts, incursions, delay, throughput, fuel impact, unnecessary holds, rejected commands, and command quality.
- [ ] Add controller presets such as conservative, efficient, calm, teaching, and realistic without weakening the safety arbiter.
- [ ] Build an authenticated WebSocket service for external control; keep static GitHub Pages local/read-only when the service is absent.
- [ ] Add a read-only HTTP snapshot/metrics endpoint for dashboards that do not need control authority.
- [ ] Add controller sessions, station claims, permissions, command rate limits, timeouts, audit logs, reconnect behavior, and an emergency stop.
- [ ] Support multiple simultaneous human or agent controllers with explicit station handoffs and conflict-free authority.
- [ ] Add a read-only spectator/observer role and a local development bridge that cannot silently gain production authority.
- [ ] Preserve a deterministic offline Auto policy so gameplay never depends on an external model or service.

## Milestone 6 — Long-form ASMR soundscape and environment

Make Watch mode satisfying for a long session without repetitive alarms or synthetic fatigue.

**Timing: deferred.** Sound work comes after the current aircraft, traffic, motion, and information-display improvements; no runtime voice generation or new audio integration is required in that earlier work.

- [ ] Acquire or create license-cleared engine, APU, ramp, cabin-area, runway, rain, wind, terminal, and tower-room recordings.
- [ ] Give aircraft persistent spatial sound with model/engine variation, distance attenuation, Doppler restraint, occlusion, and smooth crossfades.
- [ ] Add taxi whine, power changes, reverse thrust, runway rumble, touchdown, flap/gear, pushback, tug, and service-vehicle layers.
- [ ] Add weather-specific rain, snow, thunder, gust, and low-visibility ambience that follows the actual weather switches.
- [ ] Add deeper fog, haze, snow, thunderstorm, low-ceiling, and contaminated-runway simulation states—not merely visual filters.
- [ ] Add runway braking-action reports and surface-condition effects to landing distance, exit choice, taxiing, and departure performance.
- [ ] Add rare wind-shear and microburst alerts with safe go-around/escape behavior and an option to disable high-stakes events.
- [ ] Build a reusable offline radio-chatter library from fictional, captioned ATC exchanges. Generate or record the clips during development—not at runtime—disclose synthetic voices, preserve a license/source manifest, vary controller and pilot voices, and sequence clips by airport, station, traffic state, cooldown, and repetition budget.
- [ ] Give radio chatter its own toggle and volume channel, with captions, calm/ASMR filtering, and a no-voice fallback; never require an API key or network connection from players.
- [ ] Record sound events in replay so playback reproduces the same soundscape decisions.
- [ ] Add long-loop randomization, density-aware mixing, cooldowns, and calm alert policies to prevent repetitive event fatigue.
- [ ] Add dawn, day, dusk, night, cloud, seasonal, snow-cover, wet-pavement, and runway-light transitions.
- [ ] Add a smooth optional camera director that follows interesting operations without camera snaps or stealing manual control.
- [ ] Add high-contrast and color-vision-safe palettes while retaining reduced-motion and low-chrome presentation.

## Milestone 7 — Aircraft identity and airport life

Make model differences visible on the field rather than only in flight strips.

**2.21 foundation:** The roster now contains 13 regional, utility, business, narrowbody, widebody, and cargo models; traffic-program schema 2 adds representative ORD carriers and route-aware fleet selection; flights use model-specific route fuel plans; the normal strip exposes fuel, IAS/ground speed, altitude, and heading; and optional contrails follow engine count and atmospheric conditions. Adjacent stands whose largest compatible aircraft envelopes overlap are mutually exclusive. The broader model-data audit, distinct aircraft assets, animation/light suite, maintenance depth, and formal asset budgets below remain open.

- [ ] Expand and audit the regional, narrowbody, widebody, cargo, business, and general-aviation roster.
- [ ] Store validated dimensions, weights, engine type, approach/rotation/taxi speeds, climb/descent profiles, turn radius, braking, wake group, runway requirement, and service time.
- [ ] Replace the shared jet silhouette with distinct original aircraft families or optimized licensed assets.
- [ ] Add convincing landing gear, flap/slat, spoiler, reverser, beacon, navigation, strobe, landing, taxi, and recognition-light states.
- [ ] Add airline/fleet assignment rules and original liveries with readable but uncluttered identification.
- [ ] Add plausible exhaust, condensation, contrails, tire smoke, spray, and shadow behavior only when conditions warrant them.
- [ ] Add maintenance, out-of-service, ferry, cargo, and special-operation events as optional detail layers.
- [ ] Establish asset LOD, texture, material, draw-call, and memory budgets before adding high-detail models broadly.

## Milestone 8 — Live data, analysis, sharing, and community

Connect the simulation to the outside world without making it fragile or unsafe.

- [ ] Add cached, optional METAR ingestion with unit validation, age display, provenance, and offline fallback.
- [ ] Add cached, optional NOTAM and runway/taxiway-status ingestion with human review before changing active topology.
- [ ] Add optional schedule/traffic feeds that seed plausible operations while preserving privacy, licensing, and deterministic replay.
- [ ] Add JSON and CSV exports for flights, commands, events, queues, delays, runway utilization, and shift metrics.
- [ ] Add a single-aircraft flight-data-recorder view, airport operations dashboard, conflict heatmap, and runway/taxiway utilization views.
- [ ] Add exact-replay verification, event markers, state comparison, schema migrations, and shareable replay/seed links.
- [ ] Add screenshot and short-clip capture plus a clean spectator presentation.
- [ ] Add daily seeded challenges, classrooms, shared sessions, and server-validated leaderboards only if they support rather than undermine the ASMR-first direction.
- [ ] Define telemetry redaction, retention, consent, and public-sharing rules before enabling cloud storage.

## Cross-cutting engineering and quality work

These tasks travel with the milestones above rather than waiting for a final cleanup phase.

- [ ] Continue splitting the large simulation, rendering, and application coordinators into model, systems, procedures, scene, camera, HUD, control, and telemetry modules. Queue diagnosis, queue UI, radar rendering, and surface-availability UI moved into dedicated modules in 2.12; the three legacy coordinators still need further extraction.
- [ ] Centralize runway/runway-end, surface-protection, separation, and procedure rules so no second implementation can drift.
- [ ] Add schema migrations for airport assets, saves, recordings, commands, events, and replays.
- [ ] Add a stable asset manifest instead of treating generated hashed filenames as public APIs.
- [ ] Extend instancing to suitable lights, markings, buildings, and repeated airport props.
- [ ] Extend pooling to trails, weather effects, labels, route previews, sound emitters, and transient events.
- [ ] Add frame-time, simulation-time, memory, entity, audio-source, queue, draw-call, and long-session growth budgets.
- [ ] Add a multi-hour single-session soak and a measured high-density stress profile without weakening safety rules.
- [ ] Add browser smoke coverage for every named airport and scenario plus visual-regression baselines for representative desktop/mobile scenes.
- [ ] Add property tests for graph imports, exact replay, route crossings, wake/runway rules, and command authorization.
- [ ] Add accessibility regression checks for focus, keyboard flow, touch targets, readable labels, captions, contrast, and reduced motion.
- [x] Refresh GitHub Actions to current Node-supported action releases and keep dependencies routinely audited. (2.15: Checkout/Setup Node/Upload Artifact 7 and current Pages action generations; source tests split into bounded parallel jobs.)
- [x] Keep source and Pages CI separate, additive, and capable of proving that the menagerie root still works. (2.15: private source CI and public Pages deployment remain separate; deployment mirrors only `airport-auto/` and verifies the menagerie root.)
- [x] Profile before adopting Web Workers or WASM; document the measured problem and target budget first. (2.16: the measured limits are WebGL submission, repeated graph/sweep work, and catch-up spirals; [the runtime budget](docs/performance-budget.md) records before/after measurements and adoption thresholds.)

## Decisions still needed

- [x] Choose the first import sources and fidelity boundary for ORD Surface Graph v1.
- [x] Keep Forgiving ATC as the default ASMR/game ruleset and offer FAA-inspired terminal separation as an explicit opt-in.
- [x] Use captions plus an optional reusable offline library of license-cleared recorded or generated fictional speech; do not generate chatter in real time.
- [ ] Choose the hosting and identity model for authenticated remote/multi-controller sessions.
- [ ] Decide which telemetry may appear in shared replays and which must remain local.
- [ ] Decide whether progression and leaderboards improve the project or conflict with its open-ended ASMR character.
- [ ] Choose the second high-fidelity airport only after ORD v1 meets its acceptance gate.

## Reconciliation with the pre-2.1 plan

Valid unfinished items from the former product plan were retained here and consolidated as follows:

| Former area                                                                                    | New home           |
| ---------------------------------------------------------------------------------------------- | ------------------ |
| Real layouts, OSM/open-data import, attribution, map context                                   | Milestone 1        |
| Pushback, gates, services, deicing, closures, ramp congestion                                  | Milestone 2        |
| Hub schedules, traffic banks, queues, holding, diversions, SIDs/STARs, physical separation     | Milestone 3        |
| Rich ATC commands, training, challenge, sandbox, station handoffs                              | Milestone 4        |
| Scripted/LLM agents, WebSocket control, authentication, multiple controllers                   | Milestone 5        |
| Recorded/spatial audio, weather ambience, day/season presentation                              | Milestone 6        |
| Distinct aircraft, detailed animation/lights, fleet and maintenance depth                      | Milestone 7        |
| Live feeds, exports, dashboards, sharing, challenges, classrooms, leaderboards                 | Milestone 8        |
| Modularity, manifests, pooling, performance budgets, soaks, browser/visual/accessibility tests | Cross-cutting work |

The following former categories were intentionally **not** copied as open work because 2.1 already ships and tests them: fixed-step authoritative motion, shared simulation/render paths, edge-spawned arrivals, full landing and takeoff rolls, pavement-only graph routing, surface reservations, basic wind-selected runway ends, Auto/Assisted/Manual/Watch modes, station authority, structured command rejections, deterministic recording/replay, local BroadcastChannel control, responsive camera controls, audio channel mixing, low-detail rendering, linting, browser tests, CI, and additive Pages deployment.

## Definition of the next major release

The next major release is ready when ORD Surface Graph v1 meets its acceptance gate, its sources and limitations are visible in-product, Auto/Watch sustain a busy sourced layout without collisions or deadlock, Assisted/Manual can complete representative ORD arrival and departure flows, and desktop/mobile performance remains within the established release budgets.

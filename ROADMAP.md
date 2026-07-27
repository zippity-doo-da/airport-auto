# Airport Auto — Forward Roadmap

Last reconciled: July 27, 2026
Working baseline: Airport Auto 2.40.0 (released July 27, 2026)

Airport Auto is an **ASMR-first web airport simulation with an optional serious ATC layer**. The simulation should remain enjoyable as a calm, hands-off miniature world while also supporting increasingly authentic controller work when the player asks for it.

This document preserves the completed scope and acceptance record for the roadmap created after 2.1. Every scoped row is now resolved; shipped behavior and release evidence also live in [PLAN.md](PLAN.md). New product expansion requires a newly reconciled roadmap rather than silently reopening this ledger.

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
- [x] Give Approach, Tower, Ground, Ramp, and Supervisor distinct traffic, authority, alerts, workload, and success measures. (2.22: complete role definitions, scoped deterministic scorecards and alerts, compact stable-DOM briefings in Assisted/Manual, and schema-24 telemetry for all modes and airports.)
- [x] Add configurable automation for unstaffed positions so one player can work a single station while the airport continues safely. (2.16: Supervisor can automate each desk; selecting Approach, Tower, Ground, or Ramp staffs the other positions.)
- [x] Add training lessons, contextual explanations, pause-and-recover tools, and a no-fail learning mode. (2.23: four purpose-built lessons, command-aware contextual coaching, deliberate coach pauses, exact checkpoint retry, penalty-free skip, and the same authority/safety arbiter used by normal play and API clients.)
- [x] Add challenge shifts, runway-closure/storm/emergency scenarios, objectives, grades, delay, fuel, throughput, and safety summaries. (2.24: four deterministic five-to-seven-minute shifts, deliberate briefing and locked conditions, solo-desk automation, authoritative fuel/delay/safety metrics, weighted live objectives, A+–F debriefs, Retry/Continue flow, responsive UI, typed API, and schema-26 replay state.)
- [x] Add a true sandbox with traffic injection, weather/configuration controls, and no score pressure. (2.25: clean no-fail board, deterministic one-to-eight-aircraft arrival/departure queue, class/runway choice, grounded stand staging, optional continuous demand, cancel/clear controls, responsive HUD, typed API, shareable URL, and preserved safety/configuration rules.)
- [x] Add a unified keyboard, mouse, touch, and optional gamepad action layer. (2.26: 23 named context-aware actions, smooth held keys and analog axes, unified pointer/touch gesture ownership, standard-gamepad mapping and persisted sensitivity, compact responsive help, API diagnostics/settings, and deterministic plus desktop/mobile browser coverage; 2.27 adds observer focus as action 24.)
- [x] Allow focus/follow for aircraft, runway, taxiway, gate, queue, or detected conflict. (2.27: one typed catalog and command, authoritative rendered-pose following, fixed-asset framing, queue/resource/blocker resolution, multi-track conflict framing, compact responsive navigator/status chip, explicit or automatic release, API diagnostics, and deterministic plus desktop/mobile browser coverage.)

## Milestone 5 — Agents and multi-controller operation

Use the versioned local control protocol as the safety boundary for live human and agent controllers.

- [x] Publish a formal command/event schema with parameters, results, causal event IDs, authority, and compatibility rules. (2.28: protocol 1.0 catalogs all 85 commands with JSON Schemas, examples, mutation/authority metadata, 68 domain event types, formal request/result/event/BroadcastChannel envelopes, asserted-station enforcement, request/command/event causality, runtime validation, API 2.x compatibility aliases, replay schema 2, deterministic validation, and browser coverage.)
- [x] Add deterministic scripted controllers for Approach, Tower, Ground, Ramp, and Supervisor before introducing LLM decisions. (2.29: five fixed-cadence station programs replace direct automation mutations; every operational action uses the shared public authority/safety arbiter, decisions have bounded causal audit records, Manual EFC holds require a release, human takeover is immediate, and deterministic plus sustained ORD-flow tests cover all desks.)
- [x] Add per-station controller policies, workload limits, handoff behavior, explainable decisions, and human takeover. (2.30: serializable station policies set track/action limits and coordination timing; capacity deferrals are distinct audited outcomes, overdue/safety work bypasses pacing, and bounded mode transitions retain coordinated flight IDs plus automation-resume grace.)
- [x] Add evaluation metrics for conflicts, incursions, delay, throughput, fuel impact, unnecessary holds, rejected commands, and command quality. (2.31: read-only schema-1 current-session evaluation combines external and scripted outcomes, reports station/actor metrics, uses explainable hold-review candidates, leaves no-command desks unrated, and never lets flow offset safety or rejection penalties.)
- [x] Add controller presets such as conservative, efficient, calm, teaching, and realistic without weakening the safety arbiter. (2.30: Balanced, Conservative, Efficient, Calm, Teaching, and explicitly game-scale Realistic Tempo profiles select airport-wide policy through Supervisor UI/API; all resulting actions still use the shared authority and safety methods.)
- [x] Build an authenticated WebSocket service for external control; keep static GitHub Pages local/read-only when the service is absent. (2.32: opt-in outbound browser host, provider-neutral Node gateway, exact Origin policy, TLS requirement, and no embedded/default credentials.)
- [x] Add a read-only HTTP snapshot/metrics endpoint for dashboards that do not need control authority. (2.32: authenticated bounded snapshot/metrics/session endpoints, public health/protocol discovery, admin-only audit, and no HTTP mutation route.)
- [x] Add controller sessions, station claims, permissions, command rate limits, timeouts, audit logs, reconnect behavior, and an emergency stop. (2.32: token-scoped roles/stations/sessions, exclusive leases, identity uniqueness, sliding limits, host timeout, bounded redacted memory/JSONL audit, one-time reconnect, and session-scoped routing stop.)
- [x] Support multiple simultaneous human or agent controllers with explicit station handoffs and conflict-free authority. (2.32: one lease per station, simultaneous independent desks, offer/accept transfer, forced authenticated envelope identity, and existing game-level flight handoffs/safety arbitration.)
- [x] Add a read-only spectator/observer role and a local development bridge that cannot silently gain production authority. (2.32: spectator is command-rejected, loopback-only plaintext development, remote TLS, explicit host opt-in, and credentials never persist or enter URLs/snapshots/audit.)
- [x] Preserve a deterministic offline Auto policy so gameplay never depends on an external model or service. (2.32: gateway is a replaceable adapter; Pages starts disconnected and all existing scripted controllers/tests run without it.)

## Milestone 6 — Long-form ASMR soundscape and environment

Make Watch mode satisfying for a long session without repetitive alarms or synthetic fatigue.

**Timing:** The deterministic procedural foundation shipped after the aircraft, traffic, motion, and information-display work in 2.34. Operational weather and runway-condition behavior shipped in 2.35. The local 2.36 release candidate adds continuous environment presentation, an optional camera director, and accessible palettes without triggering a hosted deployment. Recorded source libraries and reusable pre-rendered voices remain deferred; runtime voice generation is still out of scope.

**2.36 working baseline:** The 2.34 project-original sound foundation remains in place. Version 2.35 added shared operational Clear/Haze/Rain/Fog/Snow/Thunderstorm state, modeled runway reports and performance, contaminated-surface movement, and default-off deterministic weather escapes. The local 2.36 candidate adds deterministic solar/season/surface presentation, a manual-input-safe camera director, and four presentation palettes. Recorded source libraries and pre-rendered fictional voices remain below.

- [x] Acquire or create license-cleared engine, APU, ramp, cabin-area, runway, rain, wind, terminal, and tower-room recordings. (2.40 local candidate: 11 project-original, deterministic DSP-rendered PCM beds ship as CC0-1.0 WAV assets with byte hashes, source/licensing metadata, same-origin lazy decode, and procedural fallback.)
- [x] Give aircraft persistent spatial sound with model/engine variation, distance attenuation, Doppler restraint, occlusion, and smooth crossfades. (2.34: the nearest 14 model/power-ranked aircraft use persistent synthesized voices with camera-relative stereo, distance/height attenuation, restrained Doppler, simple ground/distance filtering, and smoothed parameters.)
- [x] Add taxi whine, power changes, reverse thrust, runway rumble, touchdown, flap/gear, pushback, tug, and service-vehicle layers. (2.40 local candidate: 24 recorded event clips layer beneath the persistent spatial engine and procedural fallback; authoritative phase/stage/service transitions select the detailed cue and repeat-safe variant.)
- [x] Add weather-specific rain, snow, thunder, gust, and low-visibility ambience that follows the actual weather switches. (2.40 local candidate: distinct recorded rain, wind, snow, fog, gust, spray, and thunder layers crossfade from the shared weather state; disabled weather/wind and default-off severe events remain silent.)
- [x] Add deeper fog, haze, snow, thunderstorm, low-ceiling, and contaminated-runway simulation states—not merely visual filters. (2.35: one deterministic state drives capacity, motion, runway planning, presentation, audio, replay, and control telemetry.)
- [x] Add runway braking-action reports and surface-condition effects to landing distance, exit choice, taxiing, and departure performance. (2.35: modeled three-segment RwyCC reports and explicitly schematic performance assessments are shared across every airport.)
- [x] Add rare wind-shear and microburst alerts with safe go-around/escape behavior and an option to disable high-stakes events. (2.35: default-off thunderstorm hazards protect straight-ahead full-power escapes and reject contrary vectors.)
- [x] Build a reusable offline radio-chatter library from fictional, captioned ATC exchanges. Generate or record the clips during development—not at runtime—disclose synthetic voices, preserve a license/source manifest, vary controller and pilot voices, and sequence clips by airport, station, traffic state, cooldown, and repetition budget. (2.40 local candidate: ten reusable abstract formant-voice exchanges cover Approach/Tower/Ground and emergency/handoff states with four timbres, dynamic readable captions, explicit fictional/synthetic disclosure, CC0 provenance, same-origin playback, and the no-voice fallback.)
- [x] Give radio chatter its own toggle and volume channel, with captions, calm/ASMR filtering, and a no-voice fallback; never require an API key or network connection from players. (2.34: independent cue/caption toggles, Radio bus, Calm preset, procedural cue, and fictional text fallback are entirely local.)
- [x] Record sound events in replay so playback reproduces the same soundscape decisions. (2.34: replay schema 3 stores seeded event kind, variant, time, position, caption, station, and source event; replay presentation uses displayed rather than hidden live state.)
- [x] Add long-loop randomization, density-aware mixing, cooldowns, and calm alert policies to prevent repetitive event fatigue. (2.40 local candidate: bed levels follow moving aircraft, gates, service activity, visibility, wind, and precipitation; variant selection prevents immediate reuse, radio has a global calm gap, cooldown memory is bounded, and a four-hour gate proves at most ten exchanges/minute with no repeat run.)
- [x] Add dawn, day, dusk, night, cloud, seasonal, snow-cover, wet-pavement, and runway-light transitions. (2.36 local candidate: seeded solar phases and seasons continuously drive sky, fog, sun, exposure, terrain, cloud, wet/snow surfaces, and runway-light intensity through one fixed-step environment state.)
- [x] Add a smooth optional camera director that follows interesting operations without camera snaps or stealing manual control. (2.36 local candidate: the opt-in presentation-only director uses long deterministic dwells, existing interpolated camera motion, reduced-motion protection, and immediate yield to pointer, touch, keyboard, gamepad, focus, or camera input.)
- [x] Add high-contrast and color-vision-safe palettes while retaining reduced-motion and low-chrome presentation. (2.36 local candidate: Standard, High contrast, CVD safe, and Monochrome palettes drive semantic DOM and 3D colors, persist locally, remain API-visible, and fit the responsive controls.)

## Milestone 7 — Aircraft identity and airport life

Make model differences visible on the field rather than only in flight strips.

**Status: complete in 2.33.** The audited roster now contains 17 general-aviation, utility, business, regional, turboprop, narrowbody, widebody, jumbo, passenger, and cargo models across 11 original visual families. Model-specific performance, fuel, runway, ground-handling, wake, and service data now drive operations; procedural assets expose animated flight/ground systems and conditional effects; airline traffic programs choose credible fleets and restrained original livery styles; and optional airport-life detail adds passenger, cargo, charter, ferry, special, maintenance, and out-of-service context. High/low LOD budgets are formalized and enforced by deterministic and browser release gates.

- [x] Expand and audit the regional, narrowbody, widebody, cargo, business, and general-aviation roster.
- [x] Store validated dimensions, weights, engine type, approach/rotation/taxi speeds, climb/descent profiles, turn radius, braking, wake group, runway requirement, and service time.
- [x] Replace the shared jet silhouette with distinct original aircraft families or optimized licensed assets.
- [x] Add convincing landing gear, flap/slat, spoiler, reverser, beacon, navigation, strobe, landing, taxi, and recognition-light states.
- [x] Add airline/fleet assignment rules and original liveries with readable but uncluttered identification.
- [x] Add plausible exhaust, condensation, tire smoke, spray, and shadow behavior only when conditions warrant them; remove the former optional contrail layer at user request.
- [x] Add maintenance, out-of-service, ferry, cargo, and special-operation events as optional detail layers.
- [x] Establish asset LOD, texture, material, draw-call, and memory budgets before adding high-detail models broadly.

## Milestone 8 — Live data, analysis, sharing, and community

Connect the simulation to the outside world without making it fragile or unsafe.

**Status: complete in the 2.40 release.** Optional live inputs remain default-off and manually reviewed; local capture and deterministic classroom sharing add no hosted dependency; progression/public leaderboards were deliberately deferred to protect the open-ended ASMR direction.

- [x] Add cached, optional METAR ingestion with unit validation, age display, provenance, and offline fallback. (2.40: official AWC data is requested only through an opt-in, credential-redacted gateway; server/browser validation, a one-minute request cache, bounded local cache, age/provenance UI, explicit modeled-weather application, and offline fallback are covered by `test:live-data`.)
- [x] Add cached, optional NOTAM and runway/taxiway-status ingestion with human review before changing active topology. (2.40: operator-configured FAA/provider access normalizes at most 200 items; each exact sourced-surface match must be reviewed or ignored and then passes through Supervisor authority plus the existing disruption/safety arbiter.)
- [x] Add optional schedule/traffic feeds that seed plausible operations while preserving privacy, licensing, and deterministic replay. (2.40: a licensed provider-neutral adapter accepts aggregate windows only, validates its privacy/license contract, derives a reproducible fingerprint and existing density command, and excludes identifiers and raw feed data from replay/telemetry.)
- [x] Add JSON and CSV exports for flights, commands, events, queues, delays, runway utilization, and shift metrics. (2.37 local candidate: one local JSON bundle and ten selectable CSV datasets cover the requested data plus named-taxiway use, flight-recorder samples, and conflict cells; nested data is serialized safely and nothing uploads.)
- [x] Add a single-aircraft flight-data-recorder view, airport operations dashboard, conflict heatmap, and runway/taxiway utilization views. (2.37 local candidate: a responsive, keyboard-safe Data Lab presents authoritative one-second traces, shift pulse, utilization bars, runway-context forecast heat cells, and follow controls without reading positions from the renderer.)
- [x] Add exact-replay verification, event markers, state comparison, schema migrations, and shareable replay/seed links. (2.38 local candidate: replay schema 4 fingerprints every authoritative frame and the complete manifest, locates mismatches, adds marker seeking and bounded path diffs, migrates schema 3 with an unsealed warning, imports read-only files, accepts exact `seed=` launches, and separates raw local Export from re-fingerprinted privacy-filtered Share files.)
- [x] Add screenshot and short-clip capture plus a clean spectator presentation. (2.40: local PNG and bounded 3–15-second silent WebM capture, capture-safe clean chrome, explicit no-microphone/no-upload behavior, teardown, typed local API, and browser download/Escape coverage.)
- [x] Add daily seeded challenges, classrooms, shared sessions, and server-validated leaderboards only if they support rather than undermine the ASMR-first direction. (2.40: a schema-versioned UTC daily rotation and privacy-safe classroom links reproduce one deliberate briefing without accounts; authenticated shared stations use the existing gateway. Public/server-validated leaderboards are complete-deferred by the documented ASMR-first product decision.)
- [x] Define telemetry redaction, retention, consent, and public-sharing rules before enabling cloud storage. (2.37 established the bounded page-memory recorder and allowlist policy; 2.38 enforces it by removing controller identity, correlations, event payloads, free text, and precise recording time from separately fingerprinted Share files while keeping raw Export explicitly local.)

## Cross-cutting engineering and quality work

These tasks travel with the milestones above rather than waiting for a final cleanup phase.

- [x] Continue splitting the large simulation, rendering, and application coordinators into model, systems, procedures, scene, camera, HUD, control, and telemetry modules. (2.40 local candidate: runway geometry/configuration/protection, persistence migrations, command/event migrations, stable assets, and landscape-scene ownership moved behind focused modules; `createWorld` delegates landscape, airspace, disruption, environment, weather, aircraft-visual, and context systems. Future feature work must keep those ownership boundaries rather than reopening this release-bounded extraction ticket.)
- [x] Centralize runway/runway-end, surface-protection, separation, and procedure rules so no second implementation can drift. (2.40 local candidate: six canonical rule modules are cataloged by `operationalRules`; a source-ownership gate rejects duplicate definitions, while generated property tests exercise runway pairs, route crossings, configurations, procedures, separation, and command authority.)
- [x] Add schema migrations for airport assets, saves, recordings, commands, events, and replays. (2.40 local candidate: an 11-contract migration catalog covers five airport asset families plus session saves, input preferences, standalone commands/events, recordings, and replays; every boundary rejects malformed, missing-step, and future-version input.)
- [x] Add a stable asset manifest instead of treating generated hashed filenames as public APIs. (2.40 local candidate: synchronized bundled/public manifests provide logical keys, content hashes, license references, and deployment-relative paths; validation verifies every byte and rejects generated bundle names.)
- [x] Extend instancing to suitable lights, markings, buildings, and repeated airport props. (2.40 local candidate: procedural districts, highways/markings, terminal windows, construction cones, and disabled-aircraft beacons render as bounded instance groups; the renderer-resource gate records 63 landscape instances in three draw groups.)
- [x] Extend pooling to trails, weather effects, labels, route previews, sound emitters, and transient events. (2.40 local candidate: bounded pools cover reusable route/separation geometry, aircraft trail/label ownership, persistent weather particles, transient surface markers, and spatial sound emitters with reset/overflow/disposal diagnostics.)
- [x] Add frame-time, simulation-time, memory, entity, audio-source, queue, draw-call, and long-session growth budgets. (2.39 local candidate: a bounded local monitor separates frame work/gaps, measures fixed ticks, samples heap/entities/audio/queues/renderer resources, exposes explicit per-metric checks in the optional Performance panel, snapshot schema 41, and `airportControl.performance()`, and resets cleanly between sessions.)
- [x] Add a multi-hour single-session soak and a measured high-density stress profile without weakening safety rules. (2.39 acceptance hardening: per-resource surface reservations, pavement-only recovery, committed-trajectory protection, safe route remapping, bounded service-equipment staging, and retained-heap low-water measurement allow the two-modeled-hour Extreme-ORD 3× gate to complete 52 arrivals and 22 departures with zero collisions, incursions, or unexplained pauses; 35 aircraft, 48 service vehicles, 51 queues, 2.672 ms simulation p95, and 20.941 MiB/hour retained heap growth all remain within the unchanged release budgets.)
- [x] Add browser smoke coverage for every named airport and scenario plus visual-regression baselines for representative desktop/mobile scenes. (2.40 local candidate: Playwright boots all 11 named airports and all six scenarios and checks committed ORD desktop plus ATL mobile spectator baselines without reusing an unknown local server.)
- [x] Add property tests for graph imports, exact replay, route crossings, wake/runway rules, and command authorization. (2.40 local candidate: deterministic generated properties cover 34 airports, 367 runway pairs, 2,208 routes, 268 crossings, 24 configurations, all 92 commands, and 60 replay partitions.)
- [x] Add accessibility regression checks for focus, keyboard flow, touch targets, readable labels, captions, contrast, and reduced motion. (2.40 local candidate: browser gates cover modal inert/focus trapping, keyboard drawer flow, readable flight strips, semantic contrast, 44px coarse-pointer targets, captions, and runtime/CSS reduced motion.)
- [x] Refresh GitHub Actions to current Node-supported action releases and keep dependencies routinely audited. (2.15: Checkout/Setup Node/Upload Artifact 7 and current Pages action generations; source tests split into bounded parallel jobs.)
- [x] Keep source and Pages CI separate, additive, and capable of proving that the menagerie root still works. (2.15: private source CI and public Pages deployment remain separate; deployment mirrors only `airport-auto/` and verifies the menagerie root.)
- [x] Profile before adopting Web Workers or WASM; document the measured problem and target budget first. (2.16: the measured limits are WebGL submission, repeated graph/sweep work, and catch-up spirals; [the runtime budget](docs/performance-budget.md) records before/after measurements and adoption thresholds.)

## Decisions still needed

- [x] Choose the first import sources and fidelity boundary for ORD Surface Graph v1.
- [x] Keep Forgiving ATC as the default ASMR/game ruleset and offer FAA-inspired terminal separation as an explicit opt-in.
- [x] Use captions plus an optional reusable offline library of license-cleared recorded or generated fictional speech; do not generate chatter in real time.
- [x] Choose the hosting and identity model for authenticated remote/multi-controller sessions. (2.32: separate self-hosted Node gateway with operator-owned pre-provisioned opaque tokens, exact Origin/TLS controls, provider-neutral container, and an explicit future OIDC migration boundary.)
- [x] Decide which telemetry may appear in shared replays and which must remain local. (2.37: simulated state and pseudonymous operation outcomes are allowlisted only after explicit preview/consent; correlation IDs, controller/client identity, credentials, network/device data, user text, and restricted live-feed data remain local or are removed.)
- [x] Decide whether progression and leaderboards improve the project or conflict with its open-ended ASMR character. (2.40: persistent progression/public leaderboards are deferred; isolated local safety-first grades remain. The reasons and reconsideration guardrails are recorded in [community and product direction](docs/community-and-product-direction.md).)
- [x] Choose the second high-fidelity airport only after ORD v1 meets its acceptance gate. (2.40: after the complete sourced-topology, routing, protection, pose-equality, obstacle, and sustained-flow gate, KATL/Atlanta is selected as the next import; ATL remains explicitly schematic until it passes an equivalent gate.)

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

## Completion outcome

The 2.40 release satisfies the roadmap’s ORD Surface Graph v1 gate, visible source/limitation disclosure, sustained Auto/Watch flow, complete Assisted/Manual command path, desktop/mobile budgets, safe optional integrations, capture, and community/product decisions. No unchecked roadmap item remains. The additive Pages release is live at [Airport Auto](https://zippity-doo-da.github.io/random_art_projects/airport-auto/) and preserves the existing menagerie.

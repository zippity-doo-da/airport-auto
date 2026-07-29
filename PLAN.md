# Airport Auto — Release Ledger

Airport Auto is an ASMR-first airport simulation with an optional serious ATC game layer. The fixed-step simulation owns motion and safety; Three.js presents that state; DOM controls and the versioned control API provide human and agent input.

Current publication: Airport Auto 2.40.0 is live at [GitHub Pages](https://zippity-doo-da.github.io/random_art_projects/airport-auto/) as of July 29, 2026. Source release head: `01cbf79`; additive Pages commit: `98ea34e`.

Current local, unpublished batch: airline-specific passenger liveries including
Austrian; ORD's expanded opening bank and assisted sequencing advice; optional
runway-protection and authoritative movement-vector map layers; surface-overlay
renderer extraction; and a bounded five-minute traffic-capacity outlook in the
Queue inspector plus explicit Tower departure release-window explanations.
The inbound demand clock now applies bounded queue-pressure relief before the
holding buffer fills. Deterministic validation updates cover the complete
batch. The local Data Comm panel now also projects active structured vector,
hold, speed, altitude, departure, taxi, and crossing instructions without
bypassing the command arbiter. Direct-to and controller-frequency handoff
messages are now represented as distinct structured message kinds as well, and
the latest flight-plan amendment is exposed as a Revision message. Controller
evaluation also records bounded digital-message status and kind counts.
The status broker now exposes selectable calm severity policies (Off, Advisory,
Operational, Rare High Impact), keeps critical safety alerts visible, and saves
the policy in Watch presets.
Data Comm projections now use version 2 envelopes with deterministic command
IDs, causal references, expiry, and structured response timing for every
message kind.
The external gateway now exposes a bounded typed clearance projection too;
free-form message detail stays local to the page.
Queue outlooks now forecast demand and release capacity beyond known meter
entries and report bounded weather, wind, runway-condition, and pilot-response
uncertainty factors.
Surface wait-for recovery now includes runway-crossing dependencies, retries
named reservation recoveries after downstream reservations change, and exposes
named reservation blockers in operation-queue records. A three-hour extreme
ORD run no longer reaches the traffic-stall condition and remains free of
collision alerts, runway incursions, and unexplained pauses; queue-volume and
long-hold calibration remain open.
The offline place directory now covers the JNB and GRU markets used by the
traffic programs. Surface crossing windows also normalize multi-edge imported
crossings and same-point generated hold markers into a positive buffered
hold-short interval, so the full local operations suite validates ATL and ORD
routes consistently.
This batch is intentionally not deployed yet.

This file is the status ledger. A checked item is implemented and tested; any release intentionally held locally is labeled as such. Future ideas are kept in a separate, explicitly deferred section so implemented work is never duplicated as an unchecked task.

## Airport Auto 2.1 — reliability, control, and long-session release

### Stop-the-line review

- [x] One fixed authority clock advances arrivals, departures, and taxi traffic uniformly at every playback speed; presentation interpolates those states at display refresh.
- [x] Edge, node, stand, intersection, and runway-zone reservations permit concurrent nonconflicting ground movements.
- [x] Full Manual exposes landing, go-around, taxi hold/resume, runway crossing, line-up, and takeoff actions in the normal flight strip.
- [x] Approach, Tower, Ground, and Supervisor enforce different authority and show different workloads.
- [x] Rendering consumes the authoritative simulation pose; collision safety and the renderer cannot follow different taxi curves.
- [x] Wind-selected runway ends update threshold lights, landing bars, departure chevrons, picking, telemetry, and optional labels.

### Motion and operations

- [x] Physical speed and acceleration advance distance along the flight or surface path; telemetry no longer merely imitates timeline movement.
- [x] Position, heading, altitude, speed, acceleration, ground state, and path distance are fixed-step simulation state.
- [x] Arrivals begin at the map edge and use curved, altitude-layered approaches with final, flare, touchdown, rollout, and runway exit stages.
- [x] Departures use push-ready gates, taxi routes, hold-short, line-up, full acceleration roll, rotation, and climb-out.
- [x] New hub sessions start with both a departure bank and multiple arrivals.
- [x] Departing origin, destination, procedure, and fuel state are regenerated for the outbound leg.
- [x] Occupied stands are never reused; saturated airports meter new arrivals instead.
- [x] Crossing requests come from the actual taxi-route edges.
- [x] Regional aircraft use the project’s medium wake category rather than the former misleading light label.
- [x] Aircraft/runway performance prevents widebody and cargo aircraft from using undersized pavement.
- [x] Hub traffic uses a continuous rolling stream with compressed arrival banks and recovery lulls.

### Player and ASMR modes

- [x] Full Auto continuously operates every station.
- [x] Assisted ATC proposes one safe clearance at a time, explains why, and waits for approval; compressed arrival sequences can receive a timed published Approach hold, and early arrivals can receive conservative published-route direct-to or vector guidance through the typed command path.
- [x] Full Manual requires the player to issue each operational clearance.
- [x] Watch / ASMR runs the automatic policy with reduced chrome and a calm sound preset.
- [x] Station-specific flight strips keep the selected frequency readable without hiding traffic from the 3D field.
- [x] Selected-flight camera follow, four camera views, drag/one-finger pan, cursor-centered wheel zoom, two-finger pinch zoom, buttons, and reset are available.

### Safety and observability

- [x] The safety arbiter returns plain-language rejection reasons and is shared by UI, agent, and BroadcastChannel commands.
- [x] `airportControl` 2.1 returns `{ accepted, reason, eventId, resultingState }` while retaining backward-compatible snapshot fields.
- [x] Replay drives the 3D world from immutable recorded states.
- [x] Replay export contains seed, initial state, commands, weather events, all events, and full-state frames.
- [x] The health panel reports throughput, collision alerts, incursions, unexplained pauses, delay, longest hold, and frame rate.
- [x] `?soak=1` opens a 3× ORD Rush autoplay health run; `?debug=1` adds render/simulation diagnostics.
- [x] BroadcastChannel `airport-auto` provides local request/response control without bypassing safety.

### UI, accessibility, audio, and performance

- [x] Flight strips update keyed nodes without replacing focused controls every HUD refresh.
- [x] Intro and shift dialogs inert the application, receive initial focus, trap Tab, and restore focus.
- [x] Canvas instructions reflect Auto, Assisted, Manual, and Watch behavior.
- [x] Reduced-motion preferences suppress both CSS and scripted status motion.
- [x] Mobile keeps Safety visible, uses readable labels and 44px controls, and respects safe-area placement.
- [x] Sound has independent ambience, aircraft, weather, radio, and UI levels plus Full, Calm, Radio, Engines-only, and Silent presets.
- [x] Wind and rain audio follow their actual switches and conditions; persistent aircraft ambience uses spatial panning.
- [x] Repeated scenery is instanced, completed aircraft visuals are pooled, and mobile/low-memory devices receive a low-detail renderer.
- [x] Three.js is split into a vendor chunk; application code is no longer a single ~650KB bundle.

### Verification and delivery

- [x] Surface graph, fixed-step partition, trajectory, runway-performance, obstacle, and collision soak tests.
- [x] Playwright desktop and mobile tests for Assisted, Watch, structured control, station workload, and low-detail rendering.
- [x] ESLint and Prettier tooling.
- [x] GitHub CI runs lint, deterministic tests, build, Chromium E2E, screenshots, and traces on failure.
- [x] Additive GitHub Pages deployment keeps the existing menagerie intact.

## Post-2.1 — ORD vector and movement foundation

- [x] FAA Airport Data and Information Portal geometry supplies all eight ORD runways, 743 taxiway polygons, 30 aprons, 32 buildings, hot spots, stopways, beacons, and wind indicators as a versioned offline asset.
- [x] A normalized OpenStreetMap surface import supplies 2,958 routable nodes, 3,683 edges, 939 named/source route groups, 40 compatibility-checked stands, and 315 protected runway-crossing edges without any live map dependency.
- [x] Source URL, provider, license, attribution, retrieval timestamp, coordinate system, bounds, checksums, exclusions, and the 51 m FAA-building/pavement clearance rule are preserved and validated.
- [x] ORD runtime geometry now uses the sourced runway dimensions, apron rings, terminal/control-tower locations, and every FAA building footprint.
- [x] Rendering follows the exact simulation surface segments; imported aprons and buildings retain the muted miniature style while ORD remains explicitly labeled schematic.
- [x] Surface-route indexing and geometry caching keep the large ORD graph deterministic without rebuilding thousands of nodes every movement sample.
- [x] Taxi aircraft brake to a generated hold-short point before each uncleared runway crossing; Auto sequences safe clearances and Manual requires explicit Ground approval.
- [x] Landing rollout leaves the centerline on a smooth path to the assigned OSM exit, and departure lineup begins at the actual hold-short node without a positional jump.
- [x] Landing flare/touchdown reaches roughly 10° nose-up and takeoff rotation reaches 12° nose-up in either runway direction; the airborne nose remains above the climb path.
- [x] Surface schema v3 records 248 explicit control points, 35 operational zones, two current FAA hot spots, two sourced taxiway-bridge edges, stand compatibility, pushback headings, ramp access, and passenger-facility provenance.
- [x] The committed OSM extract records 219 gate nodes and 364 parking positions; 28 playable passenger stands retain exact source references and cover every B, C, E, F, G, H, K, L, and M concourse with at least two stands.
- [x] Chicago Department of Aviation’s 199-gate inventory defines four passenger terminals and nine concourses; sourced terminal/concourse labels, gate references, and facility attribution are visible in the map, flight chips, settings, and control snapshot.
- [x] OSM nose-wheel stops are converted to aircraft-center stand points along their directed lead-ins with a 24 m minimum offset and 42 m FAA-building clearance, preventing gate aircraft from being centered inside terminal buildings.
- [x] Cyclic and bidirectional runway-crossing geometry resolves distinct physical hold-short points on both approach sides; reverse taxi routes use the same authoritative crossing controls.
- [x] ORD exposes six FAA-sourced runway plans: normal west/east parallels, visual high-arrival west/east variants, east IFR, and the rare 22R/22L strong-southerly contingency.
- [x] Each plan owns its arrival/departure/inactive roles, operating ends, procedure class, weather/visibility/wind/demand restrictions, and source metadata; automatic selection scores only eligible plans.
- [x] Runway-plan changes meter new arrivals and taxi-out releases, identify protected blocking flights, keep the complete old plan active while they drain, and atomically apply every role, end, marker, and light together.
- [x] The normal Supervisor UI and `airportControl` 2.2 can request eligible plans or restore automatic selection; snapshots expose eligibility reasons and transition state.
- [x] Taxiway IDs, operational areas, and FAA hot spots are optional muted map layers; all start hidden and can be changed through the normal UI or typed control API.
- [x] Imported stands maintain safe visual separation, reject incompatible aircraft, never reuse an occupied slot, and collectively pass 1,280 compatible stand-to-runway route checks.
- [x] Deterministic import, topology, route-connectivity, fixed-step, trajectory, Auto/Watch Rush, collision, obstacle, desktop, and mobile browser gates cover the sourced layout.
- [x] A versioned OpenStreetMap surroundings asset replaces ORD’s repeated district tiles with 6,016 road segments, 1,127 rail segments, 35 waterways, 1,568 land-use/water areas, and the sourced KORD aerodrome boundary.
- [x] The surroundings importer preserves exact Overpass queries, endpoint, OSM base timestamp, retrieval date, local east/north coordinate system, SHA-256, ODbL license, and OpenStreetMap attribution without a live runtime dependency.
- [x] Roads, rail, water, and land use render in at most 18 batched context groups; an opaque sourced airport cover keeps contextual roads beneath all authoritative runway, taxiway, apron, and building geometry.
- [x] Optional airport-boundary, north-arrow, and responsive map-scale controls start hidden, work through the normal UI, and expose their state through the typed local-control interface.
- [x] Import validation proves every FAA runway and all authoritative pavement remain within the airport cover by at least 128.7 m; collision validation checks 143,637 high/low-detail ORD scenery clearances against the largest rendered aircraft envelope.
- [x] Desktop and mobile browser tests verify context loading, attribution, bounded context draw groups, boundary/orientation controls, and the clean Watch presentation.

## Airport Auto 2.3 — authoritative pushback lifecycle

- [x] Ground or Supervisor must explicitly clear a push-ready aircraft in Manual; Assisted proposes the same clearance, while Auto and Watch issue it through the same safety boundary.
- [x] Every departure route derives a left, right, or straight push and ramp-release point from its assigned stand and authoritative stand-to-runway graph route.
- [x] Pushback remains inside the fixed-step `taxi-out` movement: the aircraft moves backward, turns smoothly toward its outbound taxi heading, stays on the apron lead-out, and remains covered by reservations and collision envelopes.
- [x] Serializable aircraft state records pushback clearance/progress/direction, tug attachment, and off/starting/running engine state; the 2.3 control API and schema-5 snapshot expose the same lifecycle.
- [x] A compact procedural tug, towbar, amber beacon, engine-start cues, and tug release render directly from simulation state without creating a second visual path.
- [x] `pushback-clearance`, `pushback-start`, `engine-start`, and `tug-release` events support replay, telemetry, human status messages, and future controller agents.
- [x] The selected-flight action panel is keyed by actionable state, so HUD refreshes no longer detach a pushback or clearance button while a player is pressing it.
- [x] Deterministic Manual and Assisted tests prove authority, backward on-ground motion, lifecycle events, smooth release into taxi, and zero aircraft/obstacle conflicts; desktop and mobile browser tests cover the normal flight-strip command and rendered tug state.

## Airport Auto 2.4 — aircraft-specific ground handling and attitude clarity

- [x] Every aircraft profile separates straight taxi speed, turn speed, ground acceleration/braking, taxi turn radius, and minimum wingtip margin from runway/airborne performance.
- [x] The authoritative surface sampler replaces eligible imported graph corners with tangent circular arcs; renderer, collision envelopes, telemetry, and speed integration all consume that same pose.
- [x] Taxi speed is limited by the active curve and by advance stopping-distance calculations, while controller and automatic holds decelerate instead of dropping immediately to zero.
- [x] Aircraft-aware routing rejects graph edges below the modeled wingtip corridor; stand lead-ins use the stand-spacing envelope already encoded by the imported data.
- [x] API 2.4 / snapshot schema 6 exposes target and turn speeds, acceleration, braking, stopping distance, design/current turn radius, next turn, current/minimum wingtip clearance, limiting edge, and route compatibility.
- [x] Takeoff rotation reaches and visibly holds 12° nose-up before liftoff; landing flare remains about 10° nose-up at main-gear contact in either runway direction.
- [x] A dedicated surface-motion gate verifies continuous position/heading, pre-turn braking, model-specific stopping distance, narrow-route rejection, seven compatible ORD aircraft routes, and at least 1.8 m modeled wingtip margin.
- [x] The complete deterministic, trajectory, collision, lint, build, and desktop/mobile browser suites pass with the aircraft-specific curves enabled.

## Airport Auto 2.5 — ramp flow and congestion-aware routing

- [x] Sixteen sourced ORD apron areas act as finite-capacity ramp-control zones without reducing the airport to one global surface lock.
- [x] Every playable stand exposes explicit ramp-to-stand lead-in and stand-to-ramp lead-out paths tied to its sourced ramp node and alley.
- [x] Auto and Watch reserve intersections, opposing edges, exclusive stand paths, ramp capacity, and directional alley flow; an active alley permits following traffic but holds opposing traffic with an explainable reason.
- [x] Static graph directions remain mandatory, while bidirectional ramp alleys receive a dynamic one-way flow lock until the protected movement clears.
- [x] New taxi routes add live, decaying edge-occupancy costs during path finding; authoritative geometry and physical route distance remain unchanged.
- [x] API 2.5 / snapshot schema 7 exposes ramp zones, stand flows, alley direction, zone capacity, automatic hold reasons, routing cost, congestion penalty, and affected edges.
- [x] A dedicated ramp-operations gate verifies one-way traversal, opposing-alley exclusion, stand exclusivity, ramp capacity, alternate-route selection, all 80 ORD stand movements, four concurrent surface movers, and a zero-collision Rush soak.

## Airport Auto 2.6 — scheduled gate assignment

- [x] Every arriving flight receives a scored stand plan using airline/terminal affinity, aircraft category and wingspan, passenger/cargo service area, predicted gate-in time, turnaround window, and its next destination/runway.
- [x] Gate windows are explicit reservations with an 18-second turn buffer; a later active arrival may reuse a stand only when its planned occupancy does not overlap.
- [x] Taxi-in rechecks actual occupancy, changed gate-in times reassign conflicting future arrivals, and the stand remains occupied until the pushback tug clears the lead-out.
- [x] The ORD schematic uses CDA's May 2026 final passenger-gate allocation for concourse affinity and sourced cargo-ramp roles for UPS/FedEx affinity, while retaining clear sampled-stand and not-for-navigation labeling.
- [x] Flight strips show planned/from-gate state and schedule; API 2.6 / snapshot schema 8 exposes policy factors, fit, timing, next flight, route distances, score, rationale, revision, and structured assignment/reassignment/release events.
- [x] A dedicated validation gate proves home-concourse and cargo-ramp selection, aircraft compatibility, overlapping-window rejection, safe future stand reuse, departure-route influence, next-flight identity, physical stand exclusivity, and a zero-collision ORD Rush soak.

## Airport Auto 2.7 — explicit turnaround services

- [x] Replace the stand countdown with seven deterministic task states: fueling, baggage, cargo, catering, cleaning, boarding, and optional maintenance.
- [x] Run independent services concurrently while boarding waits for required cleaning/catering; passenger and freighter turns receive different task plans.
- [x] Tie the fuel chip to the fueling task's actual progress and dispatch target instead of an unrelated resting-phase ease.
- [x] Gate pushback readiness on completion of every required service and return named blockers for an early Ground command.
- [x] Show compact live service progress in flight chips and a selected-flight turnaround panel; preserve the full task schedule, evidence, and actual timestamps in replay and API state.
- [x] API 2.7 / snapshot schema 9 emits structured turnaround/service lifecycle events and exposes planned, servicing, ready, and released states.
- [x] A dedicated validation gate proves dependency order, passenger/freighter task selection, optional maintenance, partition invariance, fuel completion, early-push rejection, lifecycle events, and zero protected-envelope breaches.

## Airport Auto 2.8 — protected service-vehicle routing

- [x] Add distinct fuel, baggage, cargo, catering, cleaning, maintenance, and remote-stand passenger vehicle families tied to required turnaround tasks.
- [x] Route equipment from deterministic ramp depots to unique staging positions and stand-side service bays, with continuous fixed-step position, speed, heading, and return motion.
- [x] Exclude runway, runway-access, and runway-crossing edges from every service route unless a future explicit authorization model grants access.
- [x] Share edge, node, alley, and ramp-capacity reservations with aircraft; add exclusive staging, side-lane, and service-bay claims so visible equipment and safety arbitration use the same path.
- [x] Gate service start on actual vehicle arrival and gate pushback on physical stand clearance, with explainable hold/rejection reasons.
- [x] Pool and render low-detail service equipment, interpolate its authoritative pose, and expose task-linked status in the selected-flight panel, replay, telemetry, diagnostics, and API 2.8 / snapshot schema 10.
- [x] Seed ORD sessions with a live turn so ramp activity is visible immediately without forcing smaller hub schematics to reuse a stand; validate concurrent movement/servicing, shared-ledger exclusion, lifecycle events, zero protected-route entries, and zero vehicle separation conflicts.
- [x] Let desktop and touch users drag the map, preserve middle-button panning over traffic, expand camera bounds, and extend a low-detail ground plane well beyond sourced scenery so the airport perimeter and inbound paths remain explorable without exposing empty world space.

## Airport Auto 2.9 — winter deicing operations

- [x] Add `snow` as a normal UI, launch-URL, replay, and local-control weather state with winter temperature, contaminated-surface telemetry, lower taxi/braking performance, longer runway phases, and reduced arrival capacity.
- [x] Derive four compatible treatment lanes from ORD's sourced Central Deicing Facility zone and plan a pavement-only stand-to-pad-to-runway route for every winter departure.
- [x] Model planned, enroute, queued, positioning, treating, protected, expired, and return-to-pad states on the authoritative fixed-step aircraft route.
- [x] Keep aircraft stopped at queue and treatment points, arbitrate one occupant per lane, expose an ordered queue, and render treatment spray without creating a separate visual movement path.
- [x] Gate runway entry on unexpired holdover protection and route an expired aircraft from its current hold-short point through a new treatment cycle without teleporting.
- [x] Show pad, lane, queue, treatment, fluid, cycle, and holdover state in flight chips and the selected-flight panel; emit the complete lifecycle as structured events.
- [x] API 2.9 / snapshot schema 11 exposes temperature, surface condition, deicing facilities/policy, per-flight treatment state, and diagnostic counts; recordings and replay preserve the same state.
- [x] A dedicated deterministic gate verifies published facility metadata, authoritative queue/treatment stops, holdover expiry rejection, the return route, and zero aircraft/obstacle conflicts.

## Airport Auto 2.9.1 — seamless map exploration

- [x] Expand hub terrain to 16,000 × 12,000 world units and local-airfield terrain to 9,600 × 7,200 while keeping sourced and generated detail at its original scale.
- [x] Expand camera travel to leave at least 2,100 world units of plain terrain between every maximum pan position and the nearest ground edge; wide zoom smoothly becomes an overhead map view so the ground fills the viewport instead of exposing the orthographic camera boundary.
- [x] Allow left-drag and one-finger pan gestures to begin over ordinary aircraft; only an uncleared arrival retains its route-drawing gesture, while middle-drag remains an unconditional pan.
- [x] Require a short movement threshold before taking camera control so a tap does not cancel a selected-flight follow.
- [x] API 2.9.1 reports pan limits, detailed-map footprint, and full ground dimensions; browser coverage verifies exploration beyond the former map clamp without leaving the terrain plane.
- [x] Add WASD/arrow-key map movement, click-again and empty-ground deselection, and preserve free-camera control until the player deliberately selects another aircraft.
- [x] Replace the full-screen radar rings with a compact optional terminal-radar inset driven by authoritative aircraft poses, runway geometry, heading vectors, and selection state.
- [x] Add optional upright compass points, responsive scale, and a main-map wind direction/speed indicator; keep taxiway labels and service vehicles independently visible or hidden.
- [x] Separate water polygons in depth and render order so overlapping OSM land-use geometry cannot make lakes flicker.
- [x] Make go-around an authoritative climb, circuit, and continuous approach re-entry rather than a phase reset/teleport; deterministic and browser tests verify the live-pose handoff and nose-up climb.
- [x] Keep imported ORD terminals and buildings sourced, retain collision-safe schematics elsewhere, and place ATL's terminal complex in its real-world-style parallel-runway infield without weakening pavement/obstacle validation.
- [x] Verify the seamless terrain and camera contract on ORD, ATL, a generated local airfield, desktop, and mobile viewports.

## Airport Auto 2.10 — authoritative runway-exit planning

- [x] Derive multiple arrival exits from imported runway-access topology and add four visible, pavement-connected exit choices plus a parallel taxiway to every procedural runway.
- [x] Select exits deterministically from touchdown position, aircraft landing performance, dry/wet/contaminated braking action, exit geometry and speed, live congestion, competing arrival plans, and the destination stand.
- [x] Require the modeled rollout plus an 85 m turn margin; skip an unsuitable initial arrival and command a go-around when the final-approach refresh cannot find a stopping-safe exit.
- [x] Make the chosen surface-graph node authoritative: the landing trajectory ends there, taxi-in begins there, and its planned route blocks an immediate crossing back over the landing runway.
- [x] Re-plan approaches when braking action or the assigned stand changes, refresh once at the landing handoff, and freeze the choice during rollout so no weather/traffic update can make the aircraft jump.
- [x] Show `RWY → EXIT`, rapid/standard type, braking action, target exit speed, stopping margin, and stand-route distance in the normal flight UI.
- [x] API 2.10 / snapshot schema 12 exposes the complete exit decision and emits structured `runway-exit-plan` events; replay clones the same authoritative state.
- [x] Add a dedicated deterministic gate for imported/procedural candidates, aircraft and weather ordering, stand-route influence, traffic avoidance, pavement protection, and phase continuity; retain the full trajectory, fixed-step, collision, and desktop/mobile browser gates.

## Airport Auto 2.11 — dynamic surface restrictions and recovery

- [x] Represent runway closures, taxiway closures, construction zones, and disabled aircraft as serializable edge-level restrictions in the authoritative fixed-step state.
- [x] Require Supervisor authority for closing or reopening airport pavement; require Ground or Supervisor for disabled-aircraft recovery and return structured rejection reasons through the normal UI and typed control API.
- [x] Preserve an aircraft's occupied edge and exact pose while replanning only its remaining graph route; brake into an explainable hold when no compatible suffix exists and retry after pavement reopens.
- [x] Keep assigned deicing movements protected during a disruption so a reroute cannot silently bypass a queue or treatment lane.
- [x] Remove closed runways from new operation choices, retain capacity, queue activation behind protected occupants, and send affected approaches through a real go-around before compatible-runway reassignment.
- [x] Model deterministic disabled-aircraft protection, tow/inspection progress, reservation release, removal, and `recovery-start` / `recovery-complete` events.
- [x] Add a normal Surface availability panel, compact construction/barrier/recovery map cues, selected-flight reroute/recovery state, replay cloning, telemetry payloads, and API 2.11 / snapshot schema 13.
- [x] Validate target resolution, authority, pose continuity, blocked-edge avoidance, timed reopening, runway reassignment, recovery completion, and zero collisions; retain the complete deterministic and browser release gates.

## Airport Auto 2.12 — explainable operation queues

- [x] Add one deterministic queue model for gate, ramp, taxi, crossing, runway, wake, weather, and downstream dependencies; UI, diagnostics, replay views, telemetry snapshots, tests, and future agents consume the same entries.
- [x] Give every entry a category, priority, entity identity, resource, wait time, queue position/length, causal aircraft IDs, and plain-language explanation.
- [x] Add a compact optional operation-queue panel with blocker filtering, longest-wait summary, aircraft focus, desktop/mobile layouts, and no impact on the clean Watch view while hidden.
- [x] Expose `queues` and `queueInspectorVisible` through API 2.12 / snapshot schema 14 plus a typed visibility command and `?queues=1` launch option.
- [x] Extract radar drawing, queue presentation, surface-availability presentation, and queue diagnosis into dedicated modules instead of growing `main.ts` and `airportSimulation.ts` further.
- [x] Validate all eight categories, identity, explanations, ordering, shared-resource position, weather/wake metering, authoritative clock, diagnostics parity, desktop interaction, and mobile sizing.

## Airport Auto 2.13 — time-of-day operation profiles

- [x] Give all ten hubs and each generated local field a deterministic compressed local-day profile with contiguous, smoothly blended demand periods.
- [x] Model arrival/departure and passenger/cargo/regional/general-aviation shares; use the active mix to pace continuous arrivals, size the initial departure bank, and vary departure-release cadence.
- [x] Record each leg's traffic class, direction, source period, scheduled local minute, and demand level in authoritative flight/replay state.
- [x] Add a true light-wake, single-engine Pilatus PC-12 NGX utility turboprop for GA traffic, including published dimensions and key field-performance references, a nose-mounted propeller presentation, runway compatibility, and GA/remote-ramp preference.
- [x] Show the current local bank and demand in the Controls HUD, label traffic class in flight strips, and expose the full profile/current state through API 2.13 / snapshot schema 15.
- [x] Replace the old generic repeating bank factor with profile-driven arrival intervals while preserving scenario, weather, wake, runway, gate, and collision safeguards.
- [x] Add Q/E 15-degree camera rotation, typed `rotateLeft` / `rotateRight` commands, camera-angle diagnostics, and move the line-up keyboard shortcut to R.
- [x] Add direction-aware named-taxiway flow reservations, scale physical proxies from the rendered aircraft instead of a fixed hub-wide circle, and let physically clear merge traffic continue only while separation is increasing.
- [x] Extract traffic-profile construction and interpolation into its own pure module; validate 11 airport choices, 69 periods, mixes, boundaries, deterministic sampling, fixed-step advancement, profile integration, and zero conflicts.

## Airport Auto 2.14 — hub banks and traffic-flow management

- [x] Give all ten hubs and procedural fields deterministic airline programs with time-of-day bank multipliers, compatible fleet mixes, destination markets, airline gate/stand preferences, overnight cargo peaks, and recovery lulls. Published airport/airline directories identify representative operators and terminal relationships; weights and schedules remain explicitly schematic.
- [x] Add independent Quiet, Realistic, Busy, Rush, and Extreme density profiles with visible demand, modeled-capacity, holding, active-entity, delay, recovery, and unchanged-safety assumptions.
- [x] Give every leg a replay-safe flight plan containing origin, destination, schematic route, procedure, airline, aircraft, traffic class, stand/gate intent, runway/end intent, release time, ETA, status, revision, and amendment history.
- [x] Add an invisible-demand arrival meter, bounded holding capacity, departure slots, a hold-short runway queue, pressure relief through pre-entry diversions and slot cancellation/replanning, and one shared explanation in the queue inspector, HUD, diagnostics, replay, and API.
- [x] Record gate swaps, runway changes, surface-route amendments, diversions, and cancellations without teleporting an active aircraft or weakening the safety arbiter.
- [x] Preserve concurrent ramp/taxi movement by applying departure slots at the runway queue rather than serializing pushback; the Extreme ORD soak reaches seven simultaneous taxi movers.
- [x] Prevent imported-graph junction gridlock with arrival-priority local reservations, six-edge merge lookahead, persistent arbitration ownership, and a physically sampled connector escape; the complete ORD snow/deicing lifecycle now clears the Taxiway N merge with zero collision samples.
- [x] Expose density in the normal Controls and intro setup, `?density=`, `setTrafficDensity`, snapshot schema 16, API 2.14, flight strips, and the compressed-bank/flow readout.
- [x] Bound flow history and per-aircraft plan history; validate five densities, 11 airport programs, 1,760 deterministic airline/fleet selections, complete plans, all flow transitions, a 12-hour compressed ORD session, new flight creation beyond the startup bank, physical stand exclusivity, and zero collisions/incursions.

## Airport Auto 2.15 — terminal procedures and physical separation

- [x] Give every hub and generated local field a versioned, explicitly non-navigational terminal program containing entry and transition fixes, airways, sectors, SIDs, STARs, crossing constraints, holds, missed approaches, and source/disclaimer metadata.
- [x] Select procedures deterministically by runway, operating end, runway configuration, weather, and flight identity; store the complete selection in flight-plan schema 2 and navigation state for replay/API fidelity.
- [x] Make the selected STAR geometry authoritative from the edge of the map through downwind, base, intercept, and final; use runway-specific gateway lanes and a centripetal path so no route splices into another runway or introduces a hairpin turn.
- [x] Add live heading, altitude, speed, direct-to, approach, hold/EFC, hold-release/rejoin, and handoff commands with continuous motion, plan amendments, structured results, and one shared safety/authority path for UI and API clients.
- [x] Fly selected missed-approach fixes during a go-around and selected SID headings after liftoff, preserving the full runway roll, nose-up rotation, climb restriction, and departure handoff point.
- [x] Make Approach, Tower, and Ground authority distinct for the new command loop; enforce per-flight frequency ownership, require explicit handoffs, retain Supervisor override, and expose ownership/readback state in the normal selected-flight panel.
- [x] Add optional terminal-sector, navigation-fix, SID/STAR, active-route, and separation-ring layers. They default hidden—including Watch mode—and use the same authoritative procedure and aircraft state as telemetry.
- [x] Add Forgiving and FAA-inspired terminal separation rulesets in physical nautical miles, feet, and seconds; explicitly label the Light/Medium/Heavy wake grouping as simplified rather than CWT/RECAT.
- [x] Model same, opposite-direction, intersecting, converging, close-parallel, and independent-parallel runway relationships, time-based arrival/departure/wake release, and weather/configuration capacity effects.
- [x] Add modeled cloud ceiling alongside visibility, wind, gusts, surface condition, and temperature; use ceiling/visibility for degraded radar minima and instrument-parallel eligibility and show the active values in the normal HUD/API.
- [x] Record runway departure occupancy only when takeoff is cleared/committed, preventing a lined-up aircraft from blocking its own clearance while retaining a bounded causal operation history.
- [x] Process winter holdover expiry before wake/configuration/runway-release gating so an expired aircraft immediately receives a graph-routed second treatment cycle instead of remaining stranded at hold short.
- [x] API 2.15 / snapshot schema 17 exposes the full airspace program, per-flight navigation state, active separation ruleset, physical coordinate basis, runway-operation history, and violation diagnostics.
- [x] Validate 74 airports, 3,562 fixes, 660 procedures, 1,571 configuration/weather selections, 296 holds, 330 missed approaches, live ATC authority/continuity, physical separation rules, 57,644 fixed-step ticks, 919,530 trajectory samples, 225,000 collision ticks, the second deicing cycle, selected missed-approach fixes, deterministic twin runs, and applicable desktop/mobile Chromium UI/API flows with fresh screenshot review.
- [x] Replace the obsolete single 15-minute CI wrapper with parallel static, operations, fixed-step, trajectory/collision, and browser jobs; use current Node-24 action generations in both the private source repository and the separate additive Pages repository.

## Airport Auto 2.16 — controller desks and smooth laptop runtime

- [x] Add Ramp as a first-class controller position for stands, ramp alleys, and pushback; movement-area taxi remains Ground authority.
- [x] Model Approach → Tower → Ground → Ramp arrival handoffs and Ramp → Ground → Tower → Approach departure handoffs with authoritative frequency ownership.
- [x] Add compact per-desk strip bays, responsibility-aware traffic filtering, live workload/late-handoff diagnostics, and station selection from the workload row.
- [x] Allow Supervisor to automate individual unstaffed desks; selecting one operational position automatically staffs every other desk so a single-player shift continues safely.
- [x] Expose effective automation and workload through API 2.16 / snapshot schema 18, and validate authority, phase ownership, automated coordination, and proposal routing deterministically.
- [x] Move the production authority clock to the tested 20 Hz fixed step while retaining display-rate pose interpolation; cap delayed-frame catch-up to three ticks so one slow frame cannot become a visible stutter cascade.
- [x] Cache immutable surface indexes, service-vehicle route geometry, and the established high-resolution committed-runway sweep; the reproducible Extreme ORD profile measures about 6 ms mean / 9 ms p95 per tick while preserving trajectory clearance.
- [x] Batch runway lights, center/edge/threshold markings, departure chevrons, closure marks, and hold-short bars; ORD low detail drops to roughly 252 draw calls and 220 geometries.
- [x] Automatically choose low detail for center-scale airports, short/narrow laptop viewports, and low-memory devices; cap low-detail pixel ratio at 1.0 and high detail at 1.5.
- [x] Keep the Controls surface inside 1366×768, 1280×720, and 1024×600 laptop viewports with compact chrome, opaque overlap handling, contained scrolling, and regression coverage that reaches the final Advanced section.
- [x] Document measured browser/simulation budgets and explicit Worker/WASM adoption thresholds; the hardware-accelerated in-app browser sustains about 58 FPS at ORD Auto 3× low detail.

## Airport Auto 2.17 — complete typed ATC command vocabulary

- [x] Complete the local typed command surface with explicit terminal-route amendment, graph taxi-route assignment, hold-position/resume-taxi, continuous diversion, and contact-station actions while retaining every earlier clearance command.
- [x] Constrain terminal amendments to versioned fixes compatible with the assigned runway procedure; arrivals must retain one assigned final fix and bridge from the live pose without teleporting.
- [x] Preserve the aircraft's current pavement segment during taxi amendments, then validate ordered via nodes through graph direction, pavement width, closures, congestion, deicing state, and newly derived runway crossings.
- [x] Make hold position use ordinary model-specific deceleration, and keep any automatic, crossing, or collision safety hold active after a controller releases their own hold.
- [x] Fly accepted diversions continuously from the captured live pose through a terminal edge fix and beyond the map, with amended destination/plan status, metrics, events, replay state, and no landing-clearance timeout.
- [x] Apply airborne heading changes to departure climb geometry through a continuous vector bridge instead of changing telemetry alone.
- [x] Expose command outcomes and new route, taxi, contact, hold, and diversion events through API 2.17 / snapshot schema 19; add a deterministic command-vocabulary gate covering acceptance, rejection, continuity, braking, ownership, and scope exit.

## Airport Auto 2.18 — safe routes and responsive control surfaces

- [x] Add a normal-UI route chooser with a quick safe suggestion plus alternative compatible transition/common-fix routes.
- [x] Preview route geometry without mutating authoritative navigation, showing fix names, distance, estimated time, initial turn, and warning state both on the map and selected-flight panel.
- [x] Forecast candidate routes against live airborne traffic on a shared 180-second physical time axis; block near-term separation losses and turns over 120 degrees while exposing later conflicts as cautions.
- [x] Stage route issue, pending readback, deterministic pilot response, live-traffic revalidation, acceptance, rejection, cancellation, and supersession by direct-to, hold, go-around, or diversion.
- [x] Keep the legacy atomic route command behind the same validation/safety arbiter; expose route state, warnings, provenance, commands, and typed events through API 2.18 / snapshot schema 20.
- [x] Turn short-screen and browser-zoom laptop Controls into a two-column console with session settings and all primary controls above the fold, visible scrolling, predictable reopen-at-top behavior, and compact radar/queue docking.
- [x] Cover 1366×768, 1280×720, 1024×600, 912×512, 800×500, and zoomed 700×500 layouts; keep the true narrow-phone layout independently usable.

## Airport Auto 2.19 — atomic grouped ATC instructions

- [x] Add a compact Group select mode to the normal flight bay; desktop, touch, and map selection can collect two to eight visible aircraft without engaging camera follow.
- [x] Preview every candidate group without mutation and require all selected aircraft to share an active control domain, controller authority, current ownership, and compatible instruction state.
- [x] Expose only shared surface hold/resume and airborne-or-surface slow/normal commands; runway clearances, vectors, route changes, expedite, zigzag, mixed domains, and mixed authorities remain individual-only.
- [x] Revalidate at issue time and apply every accepted group atomically; any stale, unknown, duplicate, unowned, or incompatible member rejects the whole command without partial mutation.
- [x] Preserve normal deceleration, surface reservations, runway protection, physical separation alerts, automatic holds, and safety holds after grouped controller action.
- [x] Expose non-mutating preview and atomic issue commands, structured data, current UI selection, and per-aircraft `group-instruction` events through API 2.19 / snapshot schema 21 while keeping multi-flight `controlFlights` as an atomic legacy alias.
- [x] Add deterministic coverage for airborne pace, surface hold/resume, safety-hold preservation, ownership, mixed domain/authority, duplicate/unknown IDs, and forbidden expedite plus a browser interaction and screenshot regression.

## Airport Auto 2.20 — staged controller coordination

- [x] Replace instant ownership swaps with explicit offer, accept/reject, contact, cancel, overdue, and completed handoff states; only the final contact instruction changes frequency ownership.
- [x] Preserve Approach → Tower → Ground → Ramp arrival flow and Ramp → Ground → Tower → Approach departure flow with adjacency checks and Supervisor authority.
- [x] Make unstaffed positions use the same deterministic staged protocol with delayed receipt and contact instead of bypassing coordination.
- [x] Add a compact per-station coordination inbox and selected-flight controls for requests, responses, cancellation, contact, status, deadline, and camera focus.
- [x] Convert unanswered and boundary-missed handoffs into typed overdue requests, workload pressure, shift metrics, explainable delay, and protected Ramp/Ground boundary holds.
- [x] Expose versioned handoff records, structured commands, typed events, deep-cloned replay/snapshot state, and compatibility `handoffFlight` offer behavior through API 2.20 / snapshot schema 22.
- [x] Add deterministic manual, automated, rejection, overdue, recovery, wrong-station, event, metric, and surface-boundary validation plus a browser coordination-inbox workflow and screenshot gate.

## Airport Auto 2.21 — aircraft identity and route-aware operations

- [x] Expand the procedural roster from eight to 13 aircraft with business, long-haul, four-engine, and additional narrowbody/widebody families; give every profile usable fuel, representative cruise flow, and maximum range alongside its existing dimensions and operating behavior.
- [x] Upgrade traffic programs to schema 2 with carrier-specific markets, distance provenance, route-range filtering, and a representative ORD international roster including Austrian, Lufthansa, Japan Airlines, ANA, British Airways, Turkish, Emirates, KLM, Air France, Qatar, Air Canada, Aer Lingus, Iberia, LOT, Korean Air, and Swiss; omit EL AL while it is absent from the current published CDA directory.
- [x] Replace generic fuel percentages with deterministic inbound reserve and onward dispatch plans containing taxi, trip, contingency, alternate, final-reserve, landing, and block fuel; burn fuel by aircraft profile and operation phase and replan the gate uplift target for the next leg.
- [x] Show plausible fuel, real IAS or ground speed, altitude, and three-digit heading/cardinal direction on normal flight strips; expose the complete fuel plan, aircraft capacity/range, and course through API 2.21 / snapshot schema 23.
- [x] Remove the former upper-scope contrail option at user request, including its menu, launch option, renderer allocation, and aircraft geometry; retain only always-off API 2.x compatibility fields and a deprecated command that rejects enabling.
- [x] Add a 747 upper-deck/four-engine silhouette and rear-mounted Citation engines while retaining the original procedural visual language; defer distinct optimized aircraft-family assets and full animation/light states to the roadmap.
- [x] Treat physically overlapping adjacent stand reservations as aircraft-specific mutual exclusions, including delayed-arrival gate rechecks, while preserving later safe reuse and simultaneous smaller-aircraft occupancy where envelopes clear.
- [x] Validate 13 profiles, 23 ORD carrier programs, 2,000 route/range selections, deterministic short/long-haul fuel plans, authoritative-state-neutral effects, three mutually exclusive stand pairs, 74 airports, 225,000 collision ticks, 571,529 aircraft-envelope ticks, 3,000 ORD 777F runway-assignment ticks, and 18.75 simulated traffic hours without a collision or obstacle breach.

## Airport Auto 2.22 — distinct controller workstations

- [x] Define separate Supervisor, Approach, Tower, Ground, and Ramp traffic scopes, command authority, responsibilities, and success measures without changing the existing station-ownership or safety boundary.
- [x] Derive four explainable objectives, scoped alerts, a bounded 0–100 game score, and nominal/attention/critical status for every desk from authoritative conflicts, queues, fuel, handoffs, turnarounds, workload, and shift metrics.
- [x] Add a compact Assisted/Manual station briefing with touch-accessible collapsed role detail, four live objective cells, and at most two priority alerts; preserve the low-chrome Auto/Watch presentation.
- [x] Keep the briefing DOM stable while values change so keyboard focus and the open role disclosure survive refreshes; retain readable desktop, short-laptop, and mobile layouts.
- [x] Expose all five immutable scorecards through API 2.22 / snapshot schema 24 for human dashboards, scripted controllers, and future agents; scorecards remain read-only and cannot issue commands or alter aircraft motion.
- [x] Validate five roles, twenty distinct objectives, role-scoped stress alerts, deterministic output, input immutability, every normal-UI desk, disclosure focus stability, and responsive ORD/local-airport presentation.

## Airport Auto 2.23 — no-fail controller training

- [x] Add four purpose-built lessons for arrival foundations, the Tower landing sequence, Ramp/surface flow, and controller handoffs, with 22 command-driven steps that use real aircraft and the normal typed command path.
- [x] Explain each objective, its operational reason, a contextual hint, the selected aircraft's live state, and every rejected instruction in plain language without bypassing station authority or safety validation.
- [x] Add deliberate coach pause/continue, hint, exact-step retry, penalty-free skip, lesson end, and completion-summary controls; an incorrect lesson instruction never ends the shift or weakens the safety arbiter.
- [x] Restore authoritative time, aircraft and vehicle poses, queues, reservations, controller state, weather, metrics, and other operational state from the exact start-of-step checkpoint while preserving the lesson's mistake/recovery audit counters.
- [x] Add a compact stable-DOM training school and coach for desktop, short-laptop, and mobile layouts, with keyboard-safe controls, focused live announcements, and no training chrome outside an active lesson.
- [x] Expose lesson catalog, progress, context, counters, feedback, and typed start/pause/hint/retry/skip/stop actions through API 2.23 / snapshot schema 25, including shareable `?lesson=` launch links.
- [x] Validate four complete real-command lesson flows, 22 steps, rejected-command recovery, exact checkpoint restoration, zero-conflict no-fail behavior, responsive controls, and desktop/mobile screenshot regressions alongside the full deterministic and browser release suites.

## Airport Auto 2.24 — timed controller challenge shifts

- [x] Add four deterministic five-to-seven-minute shifts for a rush-hour bank, storm operations, runway-closure recovery, and emergency priority, with hub/local capacity targets and reproducible traffic/weather setup.
- [x] Open every challenge at a deliberate paused briefing; convert Auto/Watch to Assisted, keep Assisted/Manual available, and automate every unstaffed Approach, Tower, Ground, and Ramp desk so a solo player is not penalized by an abandoned position.
- [x] Lock airport, scenario, density, separation rules, weather, wind, runway plan, and scenario-owned closure until the debrief; reject generic Resume and every incompatible UI/API change with a plain-language reason.
- [x] Feed scoring from authoritative arrivals, departures, protected-hold delay, aircraft-profile fuel burn, holding fuel, emergency resolutions, go-arounds, collision alerts, runway incursions, unexplained pauses, missed handoffs, and prevented conflicts.
- [x] Add weighted live objectives, A+–F grades, immediate safety-review termination, early-end grading, exact timed completion, and full throughput/delay/fuel/movement/emergency/safety summaries with Retry and Continue free play.
- [x] Add a collapsed setup surface, compact briefing/live HUD that closes its objective detail during play, accessible responsive debrief, focus trapping, 44px touch controls, and no persistent challenge chrome outside an active shift.
- [x] Expose the catalog, definition, lifecycle, locked conditions, objectives, score, grade, summary, and start/begin/end/continue commands through API 2.24 / snapshot schema 26, BroadcastChannel, recording, replay, and shareable `?challenge=` links.
- [x] Validate catalog weights, grades, safety caps, condition locks, desk automation, fuel accounting, closure protection, emergency seeding, exact clock completion, training exclusivity, deep cloning, desktop/mobile control flow, viewport containment, focus, and screenshot presentation.

## Airport Auto 2.25 — no-score traffic sandbox

- [x] Add a clean sandbox lifecycle that preserves airport, density, mode, pace, pause state, access to weather/runway controls, and the shared safety arbiter while removing prior traffic, queues, services, counters, challenges, training, and disruptions.
- [x] Add deterministic one-, two-, four-, and eight-aircraft injection requests for arrivals or departures, airport mix/passenger/regional/cargo/general-aviation classes, and automatic or explicitly compatible active runways.
- [x] Release arrivals from the terminal-scope edge through normal procedures; stage departures on immediately free, aircraft-compatible stands at zero altitude with complete flight plans and the ordinary pushback, taxi, hold-short, runway-entry, takeoff-roll, and climb lifecycle.
- [x] Keep requested departure runways through pushback and taxi while the runway remains open and compatible; retain normal safe re-planning when later weather, configuration, disruption, or performance makes that request invalid.
- [x] Add background-demand on/off, pending-request cancellation, and a clear-board operation that preserves weather and runway configuration; surface every wait or rejection through the same structured command reason used by human and agent controllers.
- [x] Remove grade, timer, failure closure, and station scorecard pressure without weakening collisions, separation, runway protection, graph routing, gate exclusivity, traffic caps, or controller authority.
- [x] Add a compact responsive Controls section and map badge, `?sandbox=1&background=1` launch support, BroadcastChannel commands, API 2.25 / snapshot schema 27, telemetry events, replay cloning, documentation, and desktop/mobile screenshot coverage.
- [x] Validate clean entry, exact class/runway release, multi-arrival batches, grounded departures, background traffic, cancellation, weather/configuration preservation, deep cloning, training/challenge interlocks, no-fail clock advancement, ordinary-flow exit, and responsive browser control.

## Airport Auto 2.26 — unified human input

- [x] Replace separate renderer and application listeners with one 23-action input catalog for keyboard, mouse, touch, and optional standard-mapped gamepads; keep rendering imperative and ATC commands behind the existing authority/safety arbiter.
- [x] Make held WASD/arrows, Q/E, plus/minus, analog sticks, D-pad, and triggers move the free camera continuously at display cadence while retaining a small deterministic nudge for quick keyboard taps.
- [x] Preserve cursor-centered wheel zoom, one-pointer and middle-button pan, two-finger pan/pinch, approach-route drawing, map selection, empty-ground deselection, pointer capture cleanup, and smooth release from aircraft follow through one gesture owner.
- [x] Add context-aware shortcuts for pause, Controls, radar, queues, aircraft cycling, the selected context action, land, go-around, hold/resume, runway entry, takeoff, cancel, reset, and authored camera views; block camera/clearance input beneath drawers, forms, and dialogs.
- [x] Add standard gamepad discovery, deadzones, enable/disable, persisted `0.5×`–`2.0×` sensitivity, URL overrides, a compact responsive binding guide, readable touch targets, and accessibility copy without making gamepad support mandatory.
- [x] Expose input schema/catalog versions, active context, last device/action/gesture, axes, held actions, device metadata, preferences, and the immutable action catalog through API 2.26 / snapshot schema 28 plus structured gamepad-setting commands.
- [x] Validate unique bindings, action contexts, deadzones, axes, buttons, quick taps, smooth holds, UI blocking, gamepad polling and persistence, mouse/touch pan, pinch zoom, responsive containment, and desktop/mobile screenshot presentation.

## Airport Auto 2.27 — multi-target observer focus

- [x] Add one typed, serializable catalog for live aircraft, every runway, named taxiway groups, modeled gates/stands, operation queues, and detected conflicts at every airport.
- [x] Resolve moving queue and conflict targets from authoritative aircraft/service-vehicle identities while framing runway, taxiway, gate, and resource-backed queue locations from the configured surface graph.
- [x] Follow the renderer's already-interpolated aircraft and vehicle poses instead of calculating a second motion path; multi-aircraft conflicts and blocker queues highlight and track the complete involved group.
- [x] Add smooth target-aware framing, subtle fixed-target reticles, multi-aircraft halos, current-target renderer diagnostics, and automatic release when a transient subject leaves the board.
- [x] Add a compact on-demand navigator and following chip with `F`, previous/next, explicit release, two-stage Escape behavior, free-camera takeover, stable DOM updates, compact-overlay exclusivity, and 44px mobile controls.
- [x] Make every queue row focusable, including system, resource, blocker-group, and service-vehicle waits; preserve `focusFlight` compatibility while adding structured `focusTarget` acceptance and rejection.
- [x] Expose focus catalog schema 1, current target/reference, follow strategy, related entities, suggested framing, and resolved renderer target through API 2.27 / snapshot schema 29.
- [x] Validate all 11 airport configurations, 391 static targets, ORD's eight runways/125 named taxiways/40 stands, dynamic queue and conflict resolution, stable conflict identity, keyboard/manual release, responsive containment, and desktop/mobile screenshot presentation.

## Airport Auto 2.28 — formal live-control protocol

- [x] Move the complete 85-command union out of the application coordinator into a focused control-protocol package, separating command/catalog types, event vocabulary, schema/validation runtime, and the public barrel while retaining compile-time action coverage.
- [x] Publish machine-readable command summaries, parameters, examples, mutation behavior, API/mode/transport compatibility, legacy aliases, and explicit public/session/Approach/Tower/Ground/Ramp/Supervisor/handoff/training/challenge/sandbox authority rules.
- [x] Add protocol-1.0 request envelopes and structured API-2.28 results containing session, request, client, command, event, and globally unique event-key correlation; retain API-2.x bare `request()`, snapshot-only `command()`, and legacy BroadcastChannel messages.
- [x] Enforce formal asserted-station identity against the already-selected simulator station before execution, while leaving ownership, phase, runway protection, separation, reservations, collision prevention, challenge locks, and every other operational decision in the shared safety arbiter.
- [x] Add causal command IDs to synchronous simulation and lifecycle events without mislabeling autonomous traffic; retain monotonic numeric event IDs for compatibility and expose protocol/API/session metadata on every telemetry event.
- [x] Upgrade portable recordings to schema 2 with protocol/session metadata and command request/source/event causality; add snapshot schema 30 protocol discovery metadata and deep-cloned `protocol()` plus non-mutating `validate()` and formal `dispatch()` methods.
- [x] Publish formal `ready`, `event`, `request`, and `response` envelopes once per message on the already-namespaced `airport-auto` channel, retain legacy command input/result notifications, and document same-origin/non-authenticated limits before future remote control.
- [x] Validate all command examples, 68 domain event types, compatibility rules, envelope/schema rejection, immutable protocol discovery, causal simulation tagging, asserted-authority rejection, formal page dispatch, and formal BroadcastChannel request/response behavior.

## Airport Auto 2.29 — deterministic station controllers

- [x] Replace direct Auto/Watch clearance mutations with independent deterministic programs for Supervisor, Approach, Tower, Ground, and Ramp, evaluated on a fixed 0.25-simulation-second cadence outside the renderer.
- [x] Route approach, landing, pushback, runway-crossing, runway-entry, takeoff, hold-release, disabled-aircraft recovery, go-around, and offer/accept/contact handoff actions through the same public authority and safety methods used by human and API controllers.
- [x] Preserve missed-handoff deadlines and physical surface reservations as simulation invariants while making every discretionary automated instruction an explicit station decision; Manual holds no longer release themselves merely because EFC elapsed, and controller ownership follows the aircraft's current surface zone instead of its destination stand.
- [x] Add a serializable controller runtime with station mode, evaluation/accept/reject counters, bounded decision history, rule ID, priority, rationale, result, and produced event types; selected desks transfer immediately to human control while unstaffed desks continue safely.
- [x] Add `causedByControllerDecisionId`, typed `controller-decision` events, decision payloads, and `controllers.scripted` snapshot state through protocol 1.1, API 2.29, and snapshot schema 31 without counting scripted work as manual commands.
- [x] Validate all five positions, deterministic repeatability, staged handoffs, human takeover, EFC release, Supervisor intervention, shared-arbiter rejection, causal events, bounded JSON state, sustained ORD arrival/departure flow, and zero collision/incursion alerts; retain browser coverage for Watch-mode decisions.

## Airport Auto 2.30 — controller policies and takeover continuity

- [x] Add six serializable airport-wide controller profiles—Balanced, Conservative, Efficient, Calm, Teaching, and Realistic Tempo—with per-station track limits, routine action budgets, decision cadence, handoff timing, urgency windows, deferral review, and takeover grace.
- [x] Treat station capacity as a soft coordination intake limit: a non-urgent offered handoff can be explicitly deferred without changing ownership, while overdue handoffs and every urgent or safety action bypass routine pacing and capacity limits.
- [x] Extend deterministic decision records with accepted/rejected/deferred disposition, queued work, capacity utilization, and deferral counters; retain the existing shared authority, runway-protection, separation, reservation, and collision arbiter for every operational action.
- [x] Add bounded controller-mode transition history with reason, timestamp, prior/next mode, and the coordinated flight IDs that must survive human takeover; apply profile-specific grace when a desk returns to automation without delaying urgent protection.
- [x] Add a responsive Supervisor-only policy selector, capacity-aware station chips, `setControllerPolicyPreset`, `controllers.policy`, protocol 1.2, API 2.30, snapshot schema 32, fixed-step harness schema 11, replay persistence, airport-change persistence, documentation, and help examples.
- [x] Validate all six catalogs and station policies, action budgets, capacity deferral, overdue and safety bypass, authority rejection, reset persistence, deterministic repeatability, bounded histories, takeover continuity, sustained ORD safety, formal protocol shape, and desktop browser operation.

## Airport Auto 2.31 — controller and agent evaluation

- [x] Add a deterministic, read-only evaluation layer outside the safety arbiter that combines human/local/agent operational commands with cumulative scripted-controller outcomes without changing authority, motion, clearances, or controller policies.
- [x] Report active conflict forecasts and warnings, prevented conflicts, collision alerts, runway incursions, unexplained pauses, completed movements, throughput, delay, total and holding fuel burn, accepted/rejected/deferred instructions, and command acceptance through one versioned snapshot.
- [x] Detect explainable stale-hold review candidates only after a surface review window or airborne EFC grace has elapsed and every visible safety, crossing, emergency, disruption, deicing, coordination, conflict, and blocking-aircraft reason has cleared.
- [x] Score command quality with non-compensatory rejection, hazard, safety, handoff, and avoidable-hold penalties; leave no-command desks explicitly unrated and never let throughput, delay, or fuel offset a safety penalty.
- [x] Expose Supervisor/Approach/Tower/Ground/Ramp and page/BroadcastChannel/agent/replay/test/scripted actor outcomes through `controllers.evaluation`; enrich replay command audit with effective station, client, and optional actor identity.
- [x] Add a compact, collapsed Decision evaluation disclosure to Assisted and Manual role briefings with stable DOM, eight outcome cells, rating color, and a clear read-only/safety-priority explanation.
- [x] Publish API 2.31 / snapshot schema 33, help and control documentation, a dedicated methodology document, deterministic validation, protocol assertions, and desktop browser coverage.

## Airport Auto 2.32 — authenticated external controller gateway

- [x] Add a provider-neutral Node 22 WebSocket/HTTP gateway with no default credentials, explicit token manifests, constant-time bearer verification, wildcard-rejecting exact browser-Origin policy, bounded payload/output/client handling, heartbeat cleanup, one host per session, and loopback-only plaintext browser development.
- [x] Add host, controller, spectator, and admin identities with mandatory permitted-session scope, unique secrets, role-bound admin actions, unique active client IDs, and exclusive station leases; support explicit offer/accept desk transfer and credential-bound bounded reconnect without allowing a client to assert a different source, actor, or station.
- [x] Route every external operational request back through the page's formal protocol-1.2 dispatcher and existing station, flight-ownership, phase, runway-protection, separation, reservation, and collision arbiter; retain structured accepted/rejected results and command causality while projecting bulky resulting snapshots.
- [x] Add per-client duplicate-request protection and sliding command rate limits, host-response timeouts, a session-scoped admin emergency stop, bounded redacted in-memory/optional JSONL audit, initial/repeating state delivery, transient event delivery, and read-only authenticated session/snapshot/metrics endpoints with admin-only audit access.
- [x] Add an opt-in game-host panel and `airportControl.remote` adapter with encrypted remote URL enforcement, private in-memory credential/reconnect state, explicit disconnect, redacted snapshot schema 34 health, one-second bounded operations projection, event publishing, and zero automatic network behavior on static Pages.
- [x] Ship a responsive gateway-hosted human controller desk for connection, claim/release, live claims, traffic inspection, contextual command templates, raw typed commands, activity, and admin stop/resume, plus a non-root provider-neutral container and complete hosting, identity, threat-model, protocol, HTTP, audit, and operator documentation.
- [x] Validate rejected origins/placeholders/unauthenticated access, role and station permissions, spectators, exclusive claims, transfer, identity conflict, forced authority, result/timeout/rate behavior, reconnect, emergency stop, state/metrics/audit access, credential redaction, and a real browser-host/external-Supervisor command round trip; publish API 2.32 / snapshot schema 34 without changing offline deterministic Auto.

## Airport Auto 2.33 — aircraft identity and airport life

- [x] Expand the audited roster from 13 to 17 aircraft spanning general aviation, utility, business, regional, turboprop, narrowbody, widebody, jumbo, passenger, and cargo roles; retain 12 dated official manufacturer reference records with per-profile provenance.
- [x] Make model dimensions, operating and maximum weights, fuel capacity and burn, range, engine type/count, approach/rotation/taxi speeds, acceleration/braking, climb/descent, turn radii, wake timing, runway requirements, and service duration available through the versioned snapshot and operational calculations.
- [x] Replace the shared parameterized silhouette with 11 original low-poly visual families, including high-wing GA and turboprops, business and regional jets, Airbus/Boeing narrowbodies and widebodies, jumbo, and freighter-specific forms.
- [x] Animate landing gear, flaps, slats, spoilers, reversers, propellers, beacon/navigation/strobe/landing/taxi/recognition lights, and engine state from one authoritative aircraft-systems snapshot.
- [x] Keep momentary tire smoke, runway spray, deicing spray, and grounded/airborne shadow behavior; remove contrails plus the visually similar persistent exhaust and wing-condensation wedges entirely at user request.
- [x] Add traffic-program fleet assignment plus restrained original airline livery families; expose passenger, cargo, charter, ferry, and special operations alongside optional maintenance and out-of-service detail through the normal flight bay and `airportControl`.
- [x] Formalize low/high per-aircraft mesh, material, texture, triangle, geometry-memory, and pool budgets; publish live renderer diagnostics and validate every model/family in both detail modes.
- [x] Preserve hub flow with two initial pavement-routed departures, runway-length-aware heavy-aircraft assignment, route-selected crossing logic, parallel conflict-checked service vehicles, and explainable physical holds instead of overlap.
- [x] Protect the complete geometric pushback corridor, preserve graph ownership through service-vehicle merges, prevent stationary safety holds from monopolizing unreachable taxiway lookahead, and suppress Assisted pushback proposals until every stand vehicle has physically cleared.
- [x] Publish API 2.33 / snapshot schema 35 with 87 typed commands, an airport-life toggle/query option, aircraft catalog/operations documentation, formal asset-budget documentation, deterministic catalog/operations/effects/visual validators, and browser coverage.
- [x] Verify desktop 1440×900, short-laptop 1024×600, and mobile 390×844 rendered layouts; the short-laptop run held approximately 57 FPS, the high-detail ORD scene reported 305 draw calls and 85,036 triangles, every active aircraft remained within its declared budget, and no browser warnings or errors were recorded. The final 28-case browser matrix completed with 17 applicable passes and 11 intentional cross-project skips.
- [x] Follow the selected aircraft's interpolated three-dimensional rendered pose—not its ground projection—so go-arounds and climb-outs remain visible in the central viewport; expose height-aware camera diagnostics and retain explicit manual release.
- [x] Broker transient status notices through a bounded priority queue with wall-clock 2.6–7 second minimum dwell, duplicate suppression, stale-message expiry, critical-only interruption, reduced-motion-safe transitions, and a live 3× ORD Rush browser regression so busy simulation bursts remain readable.
- [x] Delay approach-route capture until an uncleared arrival is deliberately dragged at least three screen pixels, preserving ordinary aircraft selection through mouse/touch jitter; retain true route drawing and cover both gestures in Chromium.

## Airport Auto 2.34 — deterministic spatial soundscape foundation

- [x] Replace the single averaged engine bed with up to 14 persistent model/power-aware aircraft voices using camera-relative stereo, distance/height attenuation, restrained Doppler, simple ground/distance occlusion, smooth parameter targets, and one deterministic pooled noise source.
- [x] Add independently mixed Ambience, Aircraft, Weather, Radio, and UI buses plus Full field, Calm, Radio focus, Engines only, and Silent presets; keep master sound opt-in behind a user gesture.
- [x] Crossfade project-original field, tower-room, ramp, APU, wind, rain, and snow beds from the displayed live or replay traffic/weather state; switching weather or wind off also silences its actual layer.
- [x] Convert authoritative traffic, surface, turnaround, and weather events into seeded touchdown, reverse-thrust, takeoff-power, engine-start, gear, tug, service, ramp, deicing, gust, transition, and separately opt-in rare-thunder cues with bounded cooldowns.
- [x] Add fictional offline ATC captions with independent cue/caption switches, station labels, bounded priority backlog, duplicate protection, critical interruption, and 4.2–8 second wall-clock dwell so busy traffic remains readable.
- [x] Upgrade portable replay to schema 3 with complete deterministic sound decisions and make both environment audio and replay scrubbing consume the displayed replay state rather than the hidden live simulation.
- [x] Publish API 2.34 / snapshot schema 36 audio diagnostics, source/capability disclosure, a project-original source manifest, player and developer documentation, and explicit no-microphone/no-network/no-runtime-voice behavior.
- [x] Validate seeded variants, cooldowns, actual weather switches, optional thunder, tracked flights, caption pacing/reset, Web Audio activation, bounded spatial voices, independent toggles, replay sound events, source-manifest serving, lint, types, production build, 57,644 fixed-step ticks, 919,530 trajectory samples, and 225,000 collision ticks; the final browser matrix completed with 20 applicable passes and 14 intentional project skips.

## Airport Auto 2.35 — operational weather and runway conditions

- [x] Expand the shared weather vocabulary to Clear, Haze, Rain, Fog, Snow, and Thunderstorm with condition-owned visibility, ceiling, temperature, precipitation, cloud, gust, surface, presentation, and sound state.
- [x] Generate deterministic three-segment runway-condition reports for every runway with RwyCC, braking action, contaminant, depth, coverage, timestamps, source, and explicit `notForNavigation` disclosure.
- [x] Apply runway condition to aircraft-specific landing and takeoff distance, runway eligibility, live runway-exit re-planning, taxi braking, taxi speed, stopping behavior, and snow/deicing operations without weakening the safety arbiter.
- [x] Add separately opt-in, thunderstorm-only wind-shear and microburst advisories with safe arrival go-around and airborne-departure escape paths, full-power straight-ahead protection, contrary-vector rejection, and immediate airport-advisory cancellation when disabled.
- [x] Make the authoritative arrival escape piecewise: wings-level straight climb first, then a smoothly blended missed-approach turn from the exact escape endpoint; keep renderer, collision checks, replay, and telemetry on that same path.
- [x] Expose runway reports, performance assessments, hazard state/history, and aircraft escape state through API 2.35 / snapshot schema 37, replay, the bounded remote projection, normal weather controls, main-map readout, help examples, and `?hazards=1`.
- [x] Publish FAA-concept source links and explicit operational limitations in [docs/weather-operations.md](docs/weather-operations.md); retain deterministic, offline, entertainment-only behavior with no live weather dependency.
- [x] Validate all six profiles, runway reports, dry/wet/contaminated performance, taxi degradation, deep cloning, presentation fallback, default-off hazards, arrival/departure escapes, command blocking, opt-out, formal protocol shape, soundscape integration, runway exits, production types/build, and focused browser behavior.

## Airport Auto 2.36 — continuous environment and calm presentation (local release candidate)

Deployment is intentionally withheld to conserve GitHub Actions minutes. This candidate has only been built and tested locally.

- [x] Add one deterministic fixed-step environment state with seeded day-of-year, airport-local solar phases, automatic or forced lighting, automatic or selected seasons, continuously changing clouds, wet-pavement drying, snow accumulation/melt, and runway-light intensity.
- [x] Make sky, fog, sunlight, exposure, seasonal terrain, cloud cover, wet/snow surfaces, and runway lights interpolate from the authoritative environment state without creating a separate motion or weather timeline in the renderer.
- [x] Add an optional presentation-only camera director that favors arrivals, landings, departures, and surface movement with long seeded dwells and the existing smooth camera interpolation; pointer, touch, keyboard, gamepad, camera, or focus input yields control immediately.
- [x] Add Standard, High contrast, CVD safe, and Monochrome presentation palettes that share semantic arrival, departure, runway, caution, critical, and focus colors across the DOM and Three.js scene while preserving reduced-motion and responsive low-chrome layouts.
- [x] Add normal Scene & accessibility controls, compact Auto/Day/Night cycling, local palette persistence, `?lighting=`, `?season=`, `?palette=`, and `?director=1` launch options, environment readout, and reduced-motion-safe director availability.
- [x] Publish environment and presentation state plus four typed control commands through API 2.36 / snapshot schema 38 / the bounded remote projection; preserve environment modes in new sessions and full environment state in replay frames.
- [x] Document the deterministic model, controls, legacy compatibility, API surface, replay behavior, accessibility semantics, and verification in [docs/environment-presentation.md](docs/environment-presentation.md).
- [x] Validate deterministic solar/season/weather transitions, clone isolation, palette guards, director priorities/dwells/manual yield, protocol shape, TypeScript, lint, production build, and focused Chromium UI/API/manual-takeover behavior locally without invoking GitHub Actions.

## Airport Auto 2.37 — local operations data lab (local release candidate)

Deployment remains intentionally withheld to conserve GitHub Actions minutes. This candidate has only been built and tested locally.

- [x] Add a bounded one-second recorder for authoritative aircraft pose and kinematics, identity and route history, hold/delay time, runway occupancy and movements, named-taxiway use, queue history, shift metrics, and spatial conflict forecasts without reading state back from Three.js.
- [x] Add a responsive Data Lab with shift pulse, single-aircraft altitude/speed/fuel traces, exact latest values, follow control, runway/taxiway utilization, runway-context conflict heatmap, and keyboard/Escape behavior that does not fight the camera or other overlays.
- [x] Add a complete local JSON bundle and CSV exports for flights, commands, events, queues, delays, runways, taxiways, shift metrics, flight-recorder samples, and conflict cells; nested fields serialize explicitly and downloads never upload.
- [x] Expose a compact analytics overview in API 2.37 / snapshot schema 39 and the bounded remote projection, plus full read-only `airportControl.analytics(flightId?)` and text-returning `airportControl.exportData(...)` methods.
- [x] Bound retention to 7,200 samples per aircraft, 512 observed aircraft, and 256 heat cells; reset analysis at new operational boards and keep the recorder out of persistent browser storage.
- [x] Define the future shared-replay allowlist, local-only identity/correlation/network fields, explicit preview/consent requirement, and retention/deletion gate before any cloud storage in [docs/operations-data-lab.md](docs/operations-data-lab.md).
- [x] Validate sample cadence, reset isolation, all ten CSV datasets, JSON completeness, disclosure, TypeScript, lint, production build, protocol/remote compatibility, real browser download, and 1024×600 plus 390×844 containment locally without invoking GitHub Actions.

## Airport Auto 2.38 — exact replay and safe sharing (local release candidate)

Deployment remains intentionally withheld to conserve GitHub Actions minutes. This candidate has only been built and tested locally.

The 2.38-focused validators and browser checks below pass. A broader aggregate `npm test` run was also attempted locally, but its shell guard expired after 15 minutes without an assertion failure or final buffered report; it is recorded as a timeout, not a pass.

- [x] Add replay schema 4 with sorted canonical state fingerprints for the initial state, every immutable full-state frame, commands, events, weather, sound, markers, and one version/seed/disclosure manifest receipt.
- [x] Keep playback on the authoritative recorded state and add exact mismatch localization, bounded path-level frame comparison, compact snapshot diagnostics, and cooperative browser fingerprinting that yields between small frame groups.
- [x] Add non-audio telemetry markers categorized as safety, weather, command, movement, coordination, or system events, with nearest-frame seeking from the normal replay controls.
- [x] Add verified read-only JSON import, automatic supported-airport/seed reconstruction, a 250 MB local limit, explicit rejection reasons, and a schema 3 → 4 in-memory migration labeled as legacy unsealed.
- [x] Add exact `seed=` launches for generated and named airports plus a query/fragment-clean seed-link builder that includes only deterministic game/presentation options and never carries credentials or controller identity.
- [x] Separate raw `local-full` Export from `shareable-redacted` Share packages; remove or replace controller/client/correlation identity, causal payloads, user-capable free text, and precise time, declare the redactions, prohibit automatic upload, and fingerprint the filtered result again.
- [x] Extract replay data/migration/fingerprint/diff/share logic and replay-inspector DOM ownership from the application coordinator; expose `verify`, `load`, `compare`, `seedLink`, and `shareable` through the page-local API.
- [x] Publish exact semantics, security limitations, privacy classes, migration behavior, controls, and verification in [docs/replay-verification.md](docs/replay-verification.md).
- [x] Validate canonical key ordering, nested tamper localization, comparisons, marker placement, migrations, unsupported versions, redaction/non-leakage, shared-package verification, cooperative yields, fixed-step partition equality, types, lint, production build, and the real desktop/mobile replay workflow locally without invoking GitHub Actions.

## Airport Auto 2.39 — runtime budgets and soak instrumentation (local release candidate)

Deployment remains intentionally withheld to conserve GitHub Actions minutes. This candidate has only been built and tested locally.

- [x] Add one bounded runtime monitor for frame-work and frame-gap distributions, fixed simulation-tick timing, dropped wall time, catch-up ticks, heap, aircraft, service vehicles, spatial audio voices, operation queues, draw calls, geometries, textures, and one-hour growth rates.
- [x] Define explicit warming, nominal, attention, exceeded, and unavailable results for every applicable metric with separate low/high renderer budgets and no automatic quality or safety mutation.
- [x] Add an ordinary Performance control plus `?debug=1`, top-level snapshot schema 41 diagnostics, and read-only `airportControl.performance()` access; reset every sample window on a new airport.
- [x] Bound retention to 1,200 frame-work/gap samples, 1,200 simulation-tick samples, and 21,600 once-per-simulation-second counter samples without persistence or upload.
- [x] Add a deterministic validator for percentile math, warning/hard thresholds, retention/reset behavior, and a measured Extreme-ORD stress profile with unchanged safety rules and hard zero-collision/incursion gates.
- [x] Add a configurable 0.05–12 modeled-hour local soak runner with half-hour progress, unique-flight/entity/queue/growth metrics, and nonzero exit for collision, incursion, unexplained-pause, simulation, memory-growth, entity, or queue budget failure.
- [x] Document budgets, browser limitations, API/UI access, measured stress evidence, and the Worker/WASM decision boundary in [docs/performance-budget.md](docs/performance-budget.md).
- [x] Validate the focused monitor/stress harness, TypeScript, lint, production build, protocol compatibility, and desktop/mobile Performance UI locally without invoking GitHub Actions.
- [x] Replace airport-wide surface serialization with simultaneous edge, node, junction, alley, ramp-zone, stand, crossing, and runway-protection reservations; preserve atomic clearance for closely spaced crossing groups and exact runway IDs.
- [x] Add pavement-only forward/reverse surface recovery for otherwise irreducible wait cycles, with tug state, dense corridor sampling, retry cooldowns, authoritative motion, and normal collision arbitration on every recovery tick.
- [x] Keep route amendments physically continuous and reject any remapped pose that intersects an aircraft, obstacle, or committed approach/landing/takeoff sweep; let uncleared approaches yield runway-exit priority to surface traffic so Ground can clear the path for Tower.
- [x] Revalidate the complete landing-and-exit sweep after the final-approach runway-exit refresh and issue a real go-around when the refreshed rollout is occupied.
- [x] Prune completed service vehicles after durable lifecycle events and instantiate arriving fleets only in the final taxi-in window, retaining full stand-lane pushback protection while bounding long-session entities.
- [x] Measure retained heap growth from garbage-collection low-water samples, with deterministic tests proving that a stable sawtooth passes and a 60 MiB/hour retained leak still fails the unchanged 32 MiB/hour gate.
- [x] Pass the complete local `npm test` suite, production build, and a two-modeled-hour Extreme-ORD 3× acceptance soak: 52 arrivals, 22 departures, zero collisions/incursions/unexplained pauses, 35 peak aircraft, 48 peak service vehicles, 51 peak queues, 2.672 ms simulation p95, and 20.941 MiB/hour retained heap growth.

The multi-hour roadmap acceptance item completed locally before publication. It was subsequently revalidated by the hosted source workflow and released after explicit user authorization.

## Airport Auto 2.40 — roadmap completion and release

Published additively on July 27, 2026. The source and Pages workflows passed, the public 2.40/schema-42 runtime loaded without console or request failures, and the existing menagerie remained available.

- [x] Ship 11 project-original, license-manifested PCM ambience beds and 24 detailed operation/weather cues with deterministic variant selection, state-driven mixing, bounded cooldown retention, same-origin decode, and procedural fallback.
- [x] Ship ten reusable fictional synthetic radio exchanges with four disclosed abstract voice timbres, readable dynamic captions, station/traffic selection, calm repetition budgets, no runtime generation, and a no-voice fallback.
- [x] Close the release-bounded engineering tranche with canonical operational-rule ownership, schema migration contracts, a stable hashed asset manifest, expanded instancing/pooling, release-matrix visual/accessibility coverage, and generated rule/property gates.
- [x] Add default-off live-data infrastructure: official AWC METAR relay, operator-configured NOTAM and licensed aggregate-traffic adapters, server/browser validation, minimum request caches, bounded local cache, provenance/age display, credential redaction, deterministic offline fallback, and explicit human application through the normal command/safety paths.
- [x] Add local PNG and bounded silent WebM capture plus a clean spectator view with Escape/accessible exit, no microphone, no automatic upload, media-track teardown, typed local diagnostics, and real browser-download coverage.
- [x] Add a schema-versioned UTC daily challenge across all named hubs and existing shifts, authoritative date-based launch reconstruction, and allowlisted classroom links that reproduce one deliberate Assisted/Supervisor briefing without accounts, identity, score upload, or autostart.
- [x] Reuse the authenticated remote gateway for genuinely shared human/agent classrooms; keep static/offline daily boards independent and preserve explicit station claims, spectator-only access, host consent, and the existing safety arbiter.
- [x] Decide that persistent progression and public/server-validated leaderboards conflict with the default open-ended ASMR loop and are complete-deferred unless a separate consented, moderated, exact-replay-verified competitive service is justified.
- [x] Select KATL/Atlanta as the second high-fidelity import only after the complete ORD gate; document current FAA/airport sources, five-parallel-runway and surface-operation rationale, importer-reuse value, risks, and the equivalent gate ATL must pass before losing its schematic label.
- [x] Reconcile `ROADMAP.md`, this release ledger, README, the completion audit, live-data/capture/community documentation, API help, gateway discovery, and focused acceptance commands without adding a deployment step.
- [x] Pass the complete local deterministic, trajectory/collision, lint, production-build, and desktop/mobile browser release gates after final version/schema reconciliation. (`npm test`, lint, and build passed; Playwright passed 35 tests with 27 intentional cross-viewport skips and zero failures against 2.40/schema 42.)
- [x] Push source release head `9da852d` to `origin/main`; pass all hosted static, fixed-step, operations, trajectory-safety, and browser jobs.
- [x] Publish Pages commit `5cd4b1b` additively under `/airport-auto/`; verify the live 2.40/schema-42 API, renderer, audio manifest/asset, zero initial conflicts, clean browser console/network, and an intact menagerie root.

## Airport fidelity policy

Named hubs are deliberately labeled **ATC schematic**. Their runway patterns, operating scale, and representative named taxiways are modeled for play, but they are not navigation data. Airport Auto will not claim a hub is faithful until a documented, licensed vector import has been validated against a current official airport diagram.

Current focus remains O’Hare. Its release graph combines FAA runway/apron/building/hot-spot geometry with a normalized OSM surface graph, real source taxiway names, operational zones, sourced passenger gates and parking ways, four terminals, nine concourses, stand compatibility, six restricted runway plans, sourced surrounding Chicago context, and an optional airport-boundary presentation. It remains schematic because complete route and procedure fidelity is still roadmap work.

## Acceptance gates

- Zero aircraft collisions, runway incursions, obstacle overlaps, grass taxi positions, and unexplained phase pauses in deterministic release soaks.
- Auto and Watch sustain flow without a global surface lock.
- Assisted and Manual can complete an arrival and a departure using only normal UI controls.
- A renderer screenshot and telemetry snapshot identify the same aircraft pose.
- A replay frame changes the 3D world and is read-only.
- Desktop and mobile boot, control, and camera paths pass Chromium E2E.
- Root and `/airport-auto/` builds use relative assets and load successfully.

## Explicitly deferred product work

These are expansions, not unfinished 2.1 defect fixes:

The prioritized implementation order, acceptance gates, and reconciled pre-2.1 backlog now live in [ROADMAP.md](ROADMAP.md).

- The selected KATL high-fidelity vector/surface/context import and equivalent acceptance gate; ATL remains schematic until that future expansion is complete.
- Real recorded engine/ramp/radio libraries after licensing, normalization, and long-loop repetition review.
- Navigation-grade, automatically applied, or credential-bearing live aviation integrations remain intentionally excluded; the shipped optional adapters are preview/manual and not for navigation.
- Detailed tug types and deeper gate-service choreography.
- Public server-validated leaderboards and account-backed classroom administration remain deferred by product decision; daily links and authenticated shared stations already ship without accounts.
- Optional generated or recorded ATC voice; captions and event telemetry remain the accessible source of truth.

## Release commands

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

For a long local health run, open `/?airport=ORD&scenario=rush&speed=3&soak=1&debug=1`.

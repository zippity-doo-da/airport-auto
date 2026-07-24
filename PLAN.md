# Airport Auto — Release Ledger

Airport Auto is an ASMR-first airport simulation with an optional serious ATC game layer. The fixed-step simulation owns motion and safety; Three.js presents that state; DOM controls and the versioned control API provide human and agent input.

This file is the status ledger. A checked item is shipped and tested. Future ideas are kept in a separate, explicitly deferred section so implemented work is never duplicated as an unchecked task.

## Airport Auto 2.1 — reliability, control, and long-session release

### Stop-the-line review

- [x] One fixed 60 Hz clock advances arrivals, departures, and taxi traffic uniformly at every playback speed.
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
- [x] Assisted ATC proposes one safe clearance at a time, explains why, and waits for approval.
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

- Equivalent licensed vector imports and surveyed surface topology for hubs beyond ORD.
- Real recorded engine/ramp/radio libraries after licensing, normalization, and long-loop repetition review.
- Authenticated remote WebSocket control; static GitHub Pages intentionally exposes local-only control today.
- Live METAR, NOTAM, schedule, and traffic feeds with caching and offline fallback.
- Detailed tug types, diversions, and deeper gate-service choreography.
- Server-validated leaderboards, shared replay URLs, daily challenges, and classroom accounts.
- Optional generated or recorded ATC voice; captions and event telemetry remain the accessible source of truth.

## Release commands

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

For a long local health run, open `/?airport=ORD&scenario=rush&speed=3&soak=1&debug=1`.

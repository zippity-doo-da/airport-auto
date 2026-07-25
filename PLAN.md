# Airport Auto — Release Ledger

Airport Auto is an ASMR-first airport simulation with an optional serious ATC game layer. The fixed-step simulation owns motion and safety; Three.js presents that state; DOM controls and the versioned control API provide human and agent input.

This file is the status ledger. A checked item is shipped and tested. Future ideas are kept in a separate, explicitly deferred section so implemented work is never duplicated as an unchecked task.

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
- [x] Add optional upper-scope contrails, disabled by default, with turbofan, engine-count, phase, altitude, and weather eligibility; keep the effect renderer-only so it cannot alter authoritative motion, collision, replay, or fuel state.
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
- Detailed tug types and deeper gate-service choreography.
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

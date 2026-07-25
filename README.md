# Airport Auto

Airport Auto is a browser-based air-traffic game and hands-off airport simulation. Watch a continuous operation in Full Auto or low-chrome Watch mode, approve explained clearances in Assisted ATC, or work Approach, Tower, Ground, Ramp, and Supervisor positions in Full Manual.

[Play the current build](https://zippity-doo-da.github.io/random_art_projects/airport-auto/)

The airport layouts are readable operational schematics inspired by real runway patterns. They are not navigation charts and must not be used for real-world aviation.

## What is included

- Ten named hubs: ATL, ORD, DXB, HND, DFW, LHR, IST, DEN, LAX, and JFK, plus a newly generated local airport each session.
- Continuous arrivals from the map boundary, curved approaches, flare, touchdown, aircraft/weather/traffic-aware runway-exit selection, pavement-continuous taxi, full takeoff roll, rotation, and climb-out.
- A compressed local-day profile gives every airport smooth arrival/departure banks plus passenger, cargo, regional, and general-aviation streams; the active bank is visible in the HUD and control API.
- Graph-routed pushback and taxi movement on visible pavement, with Ramp pushback clearance, Ground movement-area control, animated tug attachment/release, engine-start state, aircraft-specific circular turns and braking, wingtip-aware and congestion-aware routing, directional ramp alleys, finite-capacity ramp-control zones, explicit stand in/out paths, named taxiways, hold-short points, crossing clearances, runway reservations, and collision prevention.
- Supervisor-controlled runway/taxiway closures and construction zones amend the live graph; aircraft reroute without jumping or hold with an explanation, while Ground can dispatch deterministic disabled-aircraft recovery.
- A compact optional queue inspector explains gate, ramp, taxi, crossing, runway, wake, weather, and downstream blockers with wait time, shared-resource position, causal traffic, and one-click aircraft focus.
- Scheduled gate assignment scores airline/terminal affinity, aircraft size, passenger or cargo service, arrival time, the next destination/runway, taxi distance, and non-overlapping stand reservations; physically conflicting adjacent jumbo stands are mutually exclusive, and changed arrival times are rechecked before taxi-in.
- Fixed-step turnarounds run fueling, baggage or cargo, catering, cleaning, boarding, and optional maintenance as explicit parallel/dependent tasks. Pooled fuel trucks, baggage trains, cargo loaders, catering trucks, cleaning/maintenance vans, and remote-stand passenger coaches travel reserved ramp routes, stage beside the assigned stand, and must clear before pushback.
- Snow activates contaminated-surface performance and a complete ORD winter departure loop: graph-routed deicing-pad assignment, four treatment lanes, an ordered queue, stopped treatment, visible holdover time, protected runway entry, and return-to-pad routing after expiry.
- Auto, Assisted, Manual, and Watch modes; five controller positions with distinct traffic, authority, alerts, workload, objectives, performance scorecards, and configurable unstaffed-desk automation; six scenarios; independent Quiet/Realistic/Busy/Rush/Extreme traffic density; weather and wind controls; a five-channel sound mixer; replay; and one named-action layer for smooth keyboard, mouse, touch, and optional standard-gamepad control.
- Four no-fail controller lessons cover arrival fundamentals, Tower landing coordination, Ramp/Ground surface flow, and explicit handoffs. A compact coach explains each instruction, pauses on rejected commands, and can restore the exact start-of-step simulation checkpoint without bypassing safety.
- Four five-to-seven-minute controller challenges cover a rush bank, storm recovery, runway closure, and emergency priority. Each locks a reproducible traffic/weather setup, keeps unstaffed desks automated, grades live safety/throughput/delay/fuel objectives, and ends with a complete operational debrief.
- A true no-score, no-fail traffic sandbox opens on a clean airport, safely queues one to eight arrivals or stand-staged departures by class and runway, optionally restores continuous background demand, and preserves normal weather, configuration, pavement, separation, and authority rules.
- Airline-specific schematic hub banks, representative carrier markets and range-compatible fleets, complete per-leg flight plans, bounded arrival metering, hold-short departure slots, explainable back-pressure, and deterministic diversion/cancellation recovery.
- Versioned, explicitly non-navigational SID/STAR programs for every airport, with edge-entry transitions, fixes, sectors, altitude/speed constraints, smooth downwind/base/final geometry, selected missed approaches, departure headings, and optional route/fix/separation overlays.
- Live Approach commands for heading, altitude, speed, direct-to, approach clearance, holds/EFCs, and re-entry; explicit Approach → Tower → Ground → Ramp arrival ownership and reverse departure handoffs; Tower landing/line-up/takeoff authority; and atomic 2–8-aircraft groups limited to a shared safe pace or surface hold/resume instruction.
- Forgiving and opt-in FAA-inspired terminal separation rulesets in nautical miles, feet, and seconds, with modeled visibility, ceiling, wind, surface condition, runway relationship/configuration, and clearly labeled simplified wake groups.
- Six sourced O’Hare runway plans with dynamic arrival/departure roles, visual and instrument restrictions, strong-southerly contingency operations, and safe drain-then-switch transitions.
- A thirteen-model procedural fleet spanning utility turboprop, business jet, regional, narrowbody, widebody, and cargo operations. Models carry distinct dimensions, range, usable fuel, cruise burn, runway performance, handling, wake, and visual parameters; the Citation uses rear-mounted engines and the 747 has four engines and its characteristic upper deck.
- Route-aware fuel planning estimates each leg's trip, taxi, contingency, alternate, and final-reserve fuel. Arrivals enter with a plausible reserve rather than a nearly full tank; turnarounds load the modeled onward dispatch amount. Flight chips show modeled fuel, IAS/groundspeed, altitude, and 001–360 heading/cardinal course.
- A local, versioned browser API and `BroadcastChannel` bridge for playtests and controller agents.
- A fully offline ORD data foundation: FAA runway/apron/building/hot-spot geometry, a normalized OpenStreetMap surface graph with 40 compatible stands, 219 sourced gates, 364 parking positions, 35 operational zones and 248 control points, plus Chicago Department of Aviation terminal/concourse inventory and coherent east/west runway flows.
- Optional muted taxiway-label, operational-area, hot-spot, runway-label, airspace-sector, navigation-fix, SID/STAR, active-route, separation-ring, compass/scale, wind, service-vehicle, condition-aware upper-scope contrail, and compact terminal-radar layers preserve a clean ASMR view while exposing controller detail on demand.

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
```

## Controls

- Click a flight strip or aircraft to select and follow it; click the same aircraft again, click empty ground, or press `Escape` to return to the free camera.
- Use **Group select** in the flight bay, then choose 2–8 strips or aircraft. Only instructions shared by every selected flight appear; grouped runway clearances, vectors, route changes, and expedite are intentionally unavailable.
- Drag with a mouse or one finger to pan; use the middle mouse button from anywhere; hold `WASD` or the arrow keys for smooth movement; use `Q`/`E` to rotate; scroll or pinch to zoom.
- A standard-mapped gamepad is optional: left stick/D-pad pans, right stick rotates and zooms, triggers zoom, bumpers cycle aircraft, A uses the shown action, B cancels/releases follow, Back opens Controls, and Start pauses. Enable it and adjust stick sensitivity under **Controls → Replay & agent tools → Unified input**.
- `L`: clear selected arrival to land.
- `G`: send the selected arrival into a climbing missed-approach circuit and back into the arrival sequence.
- `H`: hold or resume selected surface aircraft.
- `R`: line up / clear runway entry.
- `T`: clear takeoff after line-up.
- `V`: cycle cameras; `+`/`-`: zoom; `0`: reset the camera and map position.
- `C`: open or close Controls; `M`: toggle radar; `O`: toggle queues; `Space`: pause; `Escape`: deselect or close the active overlay.

The selected-flight panel exposes the same commands with contextual buttons, including vectors, altitude and airspeed, direct-to, approach/hold/EFC, explicit handoff, individual runway-crossing, line-up, and takeoff instructions. Commands are enabled only for the station currently owning that flight; Supervisor can work all positions.

## Launch parameters

This URL starts a busy O'Hare session with local telemetry visible:

```text
http://127.0.0.1:5173/?airport=ORD&mode=auto&scenario=rush&speed=3&autostart=1&telemetry=1
```

Useful parameters include `airport`, `mode`, `scenario`, `density`, `rules`, `station`, `lesson`, `challenge`, `sandbox=1`, `background=1`, `speed`, `weather`, `wind`, `windDir`, `runwayConfig`, `night=1`, `radar=1`, `queues=1`, `contrails=1`, `gamepad=0|1`, `gamepadSensitivity=0.5..2`, `telemetry=1`, `debug=1`, `detail=low`, `soak=1`, and `autostart=1`. `background=1` restores continuous demand inside a sandbox. Lesson values are `arrival-basics`, `tower-landing`, `surface-flow`, and `handoff-workflow`; challenge values are `rush-hour`, `storm-operations`, `runway-closure`, and `emergency-priority`; modes are `auto`, `assisted`, `manual`, and `watch`; density values are `quiet`, `realistic`, `busy`, `rush`, and `extreme`; separation values are `forgiving` and `realistic`; weather values are `clear`, `rain`, `fog`, and `snow`.

See [docs/airport-control.md](docs/airport-control.md) for the live-control interface, [docs/input-controls.md](docs/input-controls.md) for keyboard, pointer, touch, and gamepad bindings, [docs/sandbox-lab.md](docs/sandbox-lab.md) for traffic injection and no-fail behavior, [docs/controller-roles.md](docs/controller-roles.md) for station boundaries and performance scorecards, [docs/challenge-shifts.md](docs/challenge-shifts.md) for timed shifts, objectives, grades, and debrief rules, [docs/aircraft-operations.md](docs/aircraft-operations.md) for the aircraft roster, carrier mix, fuel model, and effects, [docs/performance-budget.md](docs/performance-budget.md) for measured runtime budgets and Worker/WASM thresholds, [docs/traffic-profiles.md](docs/traffic-profiles.md) for the compressed local day and traffic streams, [docs/queue-inspector.md](docs/queue-inspector.md) for structured blockers, [docs/airport-operations-review.md](docs/airport-operations-review.md) for modeled rules and deliberate simplifications, [docs/surface-disruption-operations.md](docs/surface-disruption-operations.md) for closures, construction, rerouting, and recovery, [docs/runway-exit-operations.md](docs/runway-exit-operations.md) for arrival-exit planning, [docs/gate-operations.md](docs/gate-operations.md) for scheduled stand planning, [docs/turnaround-operations.md](docs/turnaround-operations.md) for servicing and departure readiness, [docs/service-vehicle-operations.md](docs/service-vehicle-operations.md) for ramp-equipment routing and protection, [docs/deicing-operations.md](docs/deicing-operations.md) for the winter departure lifecycle, and [docs/airport-data-sources.md](docs/airport-data-sources.md) for airport-map provenance and import policy. Completed releases are recorded in [PLAN.md](PLAN.md); unfinished work is tracked in [ROADMAP.md](ROADMAP.md).

## Architecture

The simulation is authoritative and renderer-independent. A deterministic fixed-step clock integrates speed and acceleration into path distance and owns each serializable aircraft and service-vehicle pose. Three.js only interpolates those states for smooth presentation; the DOM HUD issues validated commands; and audio/telemetry consume simulation state and events. Rendering never decides where an entity is or whether a movement is safe.

The project is intentionally lightweight: TypeScript, Vite, and plain Three.js, with no backend required for the shipped game.

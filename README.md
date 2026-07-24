# Airport Auto

Airport Auto is a browser-based air-traffic game and hands-off airport simulation. Watch a continuous operation in Full Auto or low-chrome Watch mode, approve explained clearances in Assisted ATC, or work approach, tower, ground, and supervisor positions in Full Manual.

[Play the current build](https://zippity-doo-da.github.io/random_art_projects/airport-auto/)

The airport layouts are readable operational schematics inspired by real runway patterns. They are not navigation charts and must not be used for real-world aviation.

## What is included

- Ten named hubs: ATL, ORD, DXB, HND, DFW, LHR, IST, DEN, LAX, and JFK, plus a newly generated local airport each session.
- Continuous arrivals from the map boundary, curved approaches, flare, touchdown, rollout, taxi, full takeoff roll, rotation, and climb-out.
- Graph-routed pushback and taxi movement on visible pavement, with Ground clearance, animated tug attachment/release, engine-start state, aircraft-specific circular turns and braking, wingtip-aware and congestion-aware routing, directional ramp alleys, finite-capacity ramp-control zones, explicit stand in/out paths, named taxiways, hold-short points, crossing clearances, runway reservations, and collision prevention.
- Scheduled gate assignment scores airline/terminal affinity, aircraft size, passenger or cargo service, arrival time, the next destination/runway, taxi distance, and non-overlapping stand reservations; changed arrival times are rechecked before taxi-in.
- Fixed-step turnarounds run fueling, baggage or cargo, catering, cleaning, boarding, and optional maintenance as explicit parallel/dependent tasks. Pooled fuel trucks, baggage trains, cargo loaders, catering trucks, cleaning/maintenance vans, and remote-stand passenger coaches travel reserved ramp routes, stage beside the assigned stand, and must clear before pushback.
- Snow activates contaminated-surface performance and a complete ORD winter departure loop: graph-routed deicing-pad assignment, four treatment lanes, an ordered queue, stopped treatment, visible holdover time, protected runway entry, and return-to-pad routing after expiry.
- Auto, Assisted, Manual, and Watch modes; four controller stations; six scenarios; weather and wind controls; a five-channel sound mixer; replay; four camera views; drag/touch/WASD panning; and cursor-centered wheel or pinch zoom.
- Six sourced O’Hare runway plans with dynamic arrival/departure roles, visual and instrument restrictions, strong-southerly contingency operations, and safe drain-then-switch transitions.
- A procedural aircraft fleet with model-specific size, runway performance, straight/turn taxi speeds, ground acceleration, stopping distance, turn radius, wingtip margin, approach speed, wake class, airline, callsign, registration, and fuel telemetry.
- A local, versioned browser API and `BroadcastChannel` bridge for playtests and controller agents.
- A fully offline ORD data foundation: FAA runway/apron/building/hot-spot geometry, a normalized OpenStreetMap surface graph with 40 compatible stands, 219 sourced gates, 364 parking positions, 35 operational zones and 248 control points, plus Chicago Department of Aviation terminal/concourse inventory and coherent east/west runway flows.
- Optional muted taxiway-label, operational-area, hot-spot, runway-label, compass/scale, wind, service-vehicle, and compact terminal-radar layers preserve a clean ASMR view while exposing controller detail on demand.

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
- Drag with a mouse or one finger to pan; use the middle mouse button from anywhere; use `WASD` or the arrow keys for stepped movement; scroll or pinch to zoom.
- `L`: clear selected arrival to land.
- `G`: send the selected arrival into a climbing missed-approach circuit and back into the arrival sequence.
- `H`: hold or resume selected surface aircraft.
- `E`: line up / clear runway entry.
- `T`: clear takeoff after line-up.
- `V`: cycle cameras; `+`/`-`: zoom; `0`: reset the camera and map position.
- `Space`: pause; `Escape`: deselect or close the controls.

The selected-flight panel exposes the same commands with contextual buttons, including individual runway-crossing clearances and speed instructions.

## Launch parameters

This URL starts a busy O'Hare session with local telemetry visible:

```text
http://127.0.0.1:5173/?airport=ORD&mode=auto&scenario=rush&speed=3&autostart=1&telemetry=1
```

Useful parameters include `airport`, `mode`, `scenario`, `station`, `speed`, `weather`, `wind`, `windDir`, `runwayConfig`, `night=1`, `radar=1`, `telemetry=1`, `debug=1`, `detail=low`, `soak=1`, and `autostart=1`. Modes are `auto`, `assisted`, `manual`, and `watch`; weather values are `clear`, `rain`, `fog`, and `snow`.

See [docs/airport-control.md](docs/airport-control.md) for the live-control interface, [docs/airport-operations-review.md](docs/airport-operations-review.md) for modeled rules and deliberate simplifications, [docs/gate-operations.md](docs/gate-operations.md) for scheduled stand planning, [docs/turnaround-operations.md](docs/turnaround-operations.md) for servicing and departure readiness, [docs/service-vehicle-operations.md](docs/service-vehicle-operations.md) for ramp-equipment routing and protection, [docs/deicing-operations.md](docs/deicing-operations.md) for the winter departure lifecycle, and [docs/airport-data-sources.md](docs/airport-data-sources.md) for airport-map provenance and import policy. Completed releases are recorded in [PLAN.md](PLAN.md); unfinished work is tracked in [ROADMAP.md](ROADMAP.md).

## Architecture

The simulation is authoritative and renderer-independent. A deterministic fixed-step clock integrates speed and acceleration into path distance and owns each serializable aircraft and service-vehicle pose. Three.js only interpolates those states for smooth presentation; the DOM HUD issues validated commands; and audio/telemetry consume simulation state and events. Rendering never decides where an entity is or whether a movement is safe.

The project is intentionally lightweight: TypeScript, Vite, and plain Three.js, with no backend required for the shipped game.

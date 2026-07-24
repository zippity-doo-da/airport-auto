# Airport Auto

Airport Auto is a browser-based air-traffic game and hands-off airport simulation. Watch a continuous airport operation in Full Auto, or switch to Full Manual and work approach, tower, ground, or supervisor clearances yourself.

[Play the current build](https://zippity-doo-da.github.io/random_art_projects/airport-auto/)

The airport layouts are readable operational schematics inspired by real runway patterns. They are not navigation charts and must not be used for real-world aviation.

## What is included

- Ten named hubs: ATL, ORD, DXB, HND, DFW, LHR, IST, DEN, LAX, and JFK, plus a newly generated local airport each session.
- Continuous arrivals from the map boundary, curved approaches, flare, touchdown, rollout, taxi, full takeoff roll, rotation, and climb-out.
- Graph-routed taxi movement on visible pavement, named taxiways, hold-short points, crossing clearances, runway reservations, and collision prevention.
- Auto and manual control, four controller stations, six scenarios, weather and wind controls, night/radar overlays, replay, and four camera views.
- A procedural aircraft fleet with model-specific size, runway performance, taxi/approach speeds, acceleration, braking, wake class, airline, callsign, registration, and fuel telemetry.
- A local, versioned browser API and `BroadcastChannel` bridge for playtests and controller agents.

## Run locally

Requires Node.js 20 or newer.

```bash
npm ci
npm run dev
```

Production verification:

```bash
npm test
npm run build
npm run preview
```

## Controls

- Click a flight strip to select and follow an aircraft.
- `L`: clear selected arrival to land.
- `G`: send selected arrival around.
- `H`: hold or resume selected surface aircraft.
- `E`: line up / clear runway entry.
- `T`: clear takeoff after line-up.
- `V`: cycle cameras; `+`/`-`: zoom; `0`: reset camera.
- `Space`: pause; `Escape`: deselect or close the controls.

The selected-flight panel exposes the same commands with contextual buttons, including individual runway-crossing clearances and speed instructions.

## Launch parameters

This URL starts a busy O'Hare session with local telemetry visible:

```text
http://127.0.0.1:5173/?airport=ORD&mode=auto&scenario=rush&speed=3&autostart=1&telemetry=1
```

Useful parameters include `airport`, `mode`, `scenario`, `station`, `speed`, `weather`, `wind`, `windDir`, `night=1`, `radar=1`, `telemetry=1`, and `autostart=1`.

See [docs/airport-control.md](docs/airport-control.md) for the live-control interface and [docs/airport-operations-review.md](docs/airport-operations-review.md) for modeled rules and deliberate simplifications. The longer-term product backlog is in [PLAN.md](PLAN.md).

## Architecture

The simulation is authoritative and renderer-independent. A deterministic fixed-step clock advances serializable flight and airport state; Three.js interpolates those states for smooth presentation; the DOM HUD issues validated commands; and audio/telemetry consume simulation state and events. Rendering never decides whether a movement is safe.

The project is intentionally lightweight: TypeScript, Vite, and plain Three.js, with no backend required for the shipped game.

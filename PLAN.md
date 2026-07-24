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
- [x] Selected-flight camera follow, four camera views, wheel zoom, buttons, and two-finger mobile pinch/pan are available.

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

## Airport fidelity policy

Named hubs are deliberately labeled **ATC schematic**. Their runway patterns, operating scale, and representative named taxiways are modeled for play, but they are not navigation data. Airport Auto will not claim a hub is faithful until a documented, licensed vector import has been validated against a current official airport diagram.

Current focus remains O’Hare. Its release graph includes the recognizable eight-runway pattern, six active parallel runways, multiple terminals/concourse forms, protected aprons, unique stands, perimeter routing, hold-short points, and Taxiways Alpha, Bravo, Delta, Kilo, Mike, November, Yankee, and Zulu.

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

- A licensed OSM/FAA vector-import pipeline and full surveyed taxiway topology for each hub.
- Real recorded engine/ramp/radio libraries after licensing, normalization, and long-loop repetition review.
- Authenticated remote WebSocket control; static GitHub Pages intentionally exposes local-only control today.
- Live METAR, NOTAM, schedule, and traffic feeds with caching and offline fallback.
- Service vehicles, tug animation, deicing queues, maintenance, diversions, and gate-service choreography.
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

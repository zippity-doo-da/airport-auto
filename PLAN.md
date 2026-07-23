# Airport Auto — Product and Technical Plan

Airport Auto should serve two audiences at once:

1. **A playable web game** where a player acts as tower/ground/approach and keeps a busy airport safe.
2. **An ASMR simulation** that can run hands-off, with smooth traffic, believable procedures, weather, radio-style cues, and a wide camera view.

The simulation is the source of truth. Three.js renders it, DOM controls expose it, and the telemetry interface makes it inspectable and controllable by tools or agents.

## Current baseline

The current TypeScript/Vite/Three.js build already includes, or has a first pass of:

- Autoplay and manual control modes.
- Procedural local airports with randomized layout, terrain, name, wind, and runway count.
- Named hub profiles for ORD, ATL, DXB, HND, DFW, LHR, IST, DEN, LAX, and JFK.
- Airport selection from the intro and control panel.
- Wide/zoomed-out field view and a closer view.
- Smooth animation loop with a speed slider.
- Weather and wind toggles, clear/rain/fog states, visibility, and wind display.
- Night mode and optional radar/route overlays.
- Aircraft categories, airline profiles, registrations, callsigns, procedures, and liveries.
- Approach, landing, taxi-in, gate/rest, taxi-out, and takeoff phases.
- A serializable airport surface graph with named taxiways, stands, intersections, runway access, and hold-short nodes.
- A renderer-independent fixed-step test harness with seeded clocks, stable snapshots, and normalized event capture.
- Shared physical aircraft and static-structure collision envelopes with predictive movement blocking and telemetry.
- Runway-entry and runway-crossing clearances, hold-short state, runway reservations, and conflict predictions.
- Emergency actions including go-around and disabled aircraft.
- Multiple controller stations: tower, ground, approach, and supervisor.
- Scenario selector including normal, rush, storm, closure, training, and emergency.
- Replay frames, shift metrics, event telemetry, and a browser control surface at `window.airportControl`.
- Ambient audio with a user-controlled sound toggle.
- GitHub Pages deployment as `/random_art_projects/airport-auto/` without replacing the existing menagerie.

The baseline is not considered finished until the safety and motion acceptance tests below pass repeatedly under busy traffic.

## Non-negotiable simulation rules

These rules protect the core fantasy and should be enforced in the simulation layer, not only hidden by rendering:

- Aircraft enter from the map edge, never by appearing in the middle of the field.
- Arrivals remain airborne until they cross a runway threshold and complete a landing roll.
- A landing uses a runway end and a proper glide path; no midfield landings.
- An aircraft must roll down the runway for takeoff. It cannot become airborne instantly at the runway end.
- Taxiing happens on modeled pavement: taxiways, ramps, and runway surfaces where permitted; never on grass.
- A taxiing aircraft is on the ground and casts a ground-consistent shadow. An airborne aircraft never follows a taxi route.
- Aircraft do not drive across an active runway without an explicit crossing clearance.
- Hold-short points are real reservation gates, not decorative markers.
- Runway occupancy, crossing occupancy, wake separation, and approach separation are authoritative constraints.
- No aircraft-aircraft collisions, runway incursions, building/runway overlaps, or hidden teleportation.
- Arrival and departure ends are visually and logically distinct.
- No unexplained pauses at touchdown, runway exit, or phase changes. Acceleration and deceleration are continuous.
- Normal traffic uses realistic relative speeds. A simulation speed multiplier changes time, not the aircraft's procedural identity.
- More traffic means more scheduling and queuing, not random overlap.

## Full feature inventory

### 1. Core flight and ground simulation

- [ ] Replace phase-only movement with an explicit state machine plus continuous kinematics.
- [ ] Define aircraft position, heading, altitude, speed, acceleration, and turn rate in simulation units.
- [x] Add an airport surface graph: runways, taxiways, ramps, stands, intersections, and hold-short nodes.
- [x] Give every taxiway a stable name and direction-aware segments.
- [ ] Add runway threshold, touchdown zone, rollout, exit, and takeoff-rotation nodes.
- [ ] Add runway occupancy intervals and a reservation queue per runway end.
- [ ] Add runway crossing requests with a specific route and list of runways to cross.
- [ ] Add hold-short behavior with stopping distance and a visible stop line.
- [ ] Add runway-entry clearance separate from takeoff clearance.
- [ ] Add takeoff sequencing: pushback, taxi, hold short, line up, takeoff roll, rotation, climb-out.
- [ ] Add landing sequencing: edge entry, downwind/base/final or an equivalent curved arrival, threshold crossing, touchdown, rollout, runway exit.
- [ ] Add continuous curved approaches so arrivals never make a sharp last-second turn.
- [ ] Add go-around paths that climb away from the runway and rejoin an approach queue.
- [ ] Add runway exit selection based on touchdown distance and aircraft braking profile.
- [ ] Add aircraft-specific taxi speeds, runway speeds, rotation speeds, and climb/descend rates.
- [ ] Add aircraft length and wingspan envelopes for clearance checks.
- [ ] Add wake categories and minimum arrival/departure spacing.
- [ ] Add runway crossing conflict checks against both airborne and surface traffic.
- [ ] Add ramp congestion and stand conflicts.
- [ ] Add pushback clearance and tug movement.
- [ ] Add gate assignment, gate occupancy, turnaround duration, and service completion.
- [ ] Add baggage, catering, fueling, boarding, and cargo turnaround as optional detail layers.
- [ ] Add deicing and winter surface delays as a weather-dependent detail layer.
- [ ] Add runway closures, taxiway closures, construction, and NOTAM-style restrictions.
- [ ] Add a safety arbiter that can reject unsafe commands from the player or an agent.
- [ ] Add deterministic seeded runs so bugs and near misses can be reproduced.
- [ ] Add a stress-test mode with hundreds of flights and no renderer dependency.

### 2. Real airport layouts and maps

- [ ] Create a faithful ORD/O’Hare surface graph first: runways, major taxiways, terminals, ramps, and runway crossing points.
- [ ] Add the real runway pairings and common operating directions for each supported hub.
- [ ] Keep runway numbers optional in the visual style; retain stable internal runway IDs.
- [ ] Add Atlanta, DFW, Denver, LAX, JFK, Heathrow, Dubai, Haneda, and Istanbul layouts with progressively greater fidelity.
- [ ] Add a clearly labeled “schematic” mode when a layout is simplified rather than exact.
- [ ] Use OpenStreetMap/open data only through a documented import pipeline with attribution and license checks.
- [ ] Convert imported map data into a compact airport-specific vector asset, not a live dependency in the render loop.
- [ ] Add surrounding land, highways, rail lines, waterways, neighborhoods, and terminal context.
- [ ] Keep buildings outside protected runway and taxiway envelopes.
- [ ] Add terrain themes: flat prairie, coastal, woodland, highland, snow, and urban edge.
- [ ] Add map scale, compass, north-up option, and airport boundary.
- [ ] Add an optional “real map” layer that can be hidden for the clean ASMR presentation.
- [ ] Add map version metadata and source attribution to telemetry and the settings/about panel.

### 3. Traffic generation and scheduling

- [ ] Replace “X planes in / X planes out” batches with a continuous schedule.
- [ ] Use hub operation profiles to derive arrival/departure rates and peak periods.
- [ ] Maintain separate arrival, departure, cargo, regional, and general-aviation streams.
- [ ] Generate flight plans with origin, destination, route, procedure, airline, aircraft, gate, and runway intent.
- [ ] Add a rolling schedule horizon so new flights keep entering at the map edge.
- [ ] Add traffic density presets: quiet, realistic, busy, rush, and extreme.
- [ ] Add time-of-day traffic curves for morning push, midday, evening push, and overnight cargo.
- [ ] Add airline-specific fleet mixes and hub banks.
- [ ] Add arrival metering and departure release slots.
- [ ] Add rerouting when a runway, taxiway, gate, or weather sector closes.
- [ ] Add holding patterns and extended vectors when capacity is constrained.
- [ ] Add diversions when the airport cannot safely accept an arrival.
- [ ] Add a queue inspector showing why each flight is waiting.

### 4. Aircraft and airline depth

- [ ] Expand the aircraft roster with representative regional, narrowbody, widebody, cargo, and business aircraft.
- [ ] Store model dimensions, cruise/approach/taxi/takeoff speeds, turn radius, climb profile, braking, wake class, and service time.
- [ ] Add recognizable but original silhouettes; avoid rocket-like or phallic shapes.
- [ ] Add separate fuselage, wings, tail, engines, landing gear, and lighting geometry.
- [ ] Add airline paint schemes and neutral generic liveries.
- [ ] Add registration, flight number, callsign, squawk, origin, destination, and service type to the flight strip.
- [ ] Add aircraft lights: nav, beacon, strobe, landing, taxi, and rotating beacon.
- [ ] Add contrails or exhaust only when altitude and weather make them plausible.
- [ ] Add ground shadows that match altitude and sun direction.
- [ ] Add fleet maintenance and out-of-service events as optional challenge mechanics.

### 5. Weather, wind, and environmental systems

- [ ] Keep weather and wind independently switchable.
- [ ] Add wind direction, sustained speed, gusts, crosswind, tailwind, and runway usability scoring.
- [ ] Select active runway ends from wind and airport operating rules.
- [ ] Add rain, fog, snow, haze, thunderstorms, and low-ceiling states.
- [ ] Tie visibility and separation minima to weather.
- [ ] Add wind shear and microburst alerts as rare high-stakes events.
- [ ] Add runway braking action and contaminated-surface effects.
- [ ] Add weather radar and METAR-style summary text.
- [ ] Add a weather timeline for replay and post-shift review.
- [ ] Add a calm “weather off” presentation mode for ASMR listening.
- [ ] Add daylight, dusk, night, dawn, cloud layers, and airport lighting.
- [ ] Add seasonal ground palettes without blocking the clean schematic look.

### 6. ATC gameplay and player modes

- [ ] Keep Full Auto as a hands-off, always-moving showcase mode.
- [ ] Keep Full Manual as a true controller mode where the player clears flights individually.
- [ ] Add Assisted mode: the system proposes safe clearances; the player approves or edits them.
- [ ] Add Tower mode focused on runway and landing/takeoff sequencing.
- [ ] Add Ground mode focused on taxi routes, pushback, stands, and runway crossings.
- [ ] Add Approach mode focused on vectors, spacing, holds, and go-arounds.
- [ ] Add Supervisor mode focused on runway configuration, closures, weather, and reroutes.
- [ ] Add training/tutorial mode with callouts and forgiving timing.
- [ ] Add challenge mode with score, delay, safety, and incident objectives.
- [ ] Add scenario mode for runway closure, storm, emergency, disabled aircraft, bird strike, and low visibility.
- [ ] Add sandbox mode with no loss state and free traffic controls.
- [ ] Add “watch only” ASMR mode with all HUD chrome minimized.
- [ ] Add pause only as an explicit player action; no hidden simulation pauses.
- [ ] Add speed presets without allowing speed-up to bypass safety logic.
- [ ] Add a camera focus action for any flight, runway, taxiway, gate, or conflict.
- [ ] Add keyboard, mouse, touch, and gamepad input mappings in one explicit action layer.

### 7. ATC instructions and agent control

- [ ] Define a typed command vocabulary: clear approach, hold, resume, slow, expedite, vector, taxi, hold short, cross, line up, takeoff, land, go around, divert, and emergency.
- [ ] Add route editing for selected flights with safe path previews.
- [ ] Add multi-select commands for a group of compatible flights.
- [ ] Add clearance readbacks and confirmation states.
- [ ] Add command rejection reasons in plain language.
- [ ] Add an agent controller that can operate in autoplay while exposing every decision.
- [ ] Add separate approach, tower, ground, and supervisor agents with bounded authority.
- [ ] Add a safety arbiter between agents and the simulation.
- [ ] Add human takeover for any selected flight or station.
- [ ] Add agent personality presets: conservative, efficient, calm, teaching, and realistic.
- [ ] Add agent explanations: “held because runway 27R occupied” or “rerouted around closure.”
- [ ] Add agent evaluation metrics: conflict rate, delay, throughput, unnecessary holds, and command quality.
- [ ] Add scripted bots for deterministic test scenarios before using an LLM agent.
- [ ] Add a local command endpoint or WebSocket bridge for live control.
- [ ] Add authentication and a read-only mode before exposing control remotely.
- [ ] Add command rate limits, timeouts, and emergency stop.

### 8. Telemetry, logging, replay, and APIs

- [ ] Stabilize the `window.airportControl` interface and version its schema.
- [ ] Add `snapshot()` fields for airport, time, weather, active runway ends, queues, stands, and conflicts.
- [ ] Add event IDs, timestamps, flight IDs, runway/taxiway IDs, and causal references.
- [ ] Add structured clearance, hold-short, runway-entry, crossing, go-around, and incident events.
- [ ] Add a live event stream through `BroadcastChannel` for local tools.
- [ ] Add an optional WebSocket server for external dashboards or agents.
- [ ] Add a read-only HTTP export endpoint for snapshots and shift metrics.
- [ ] Add replay recording with seed, commands, weather, and simulation version.
- [ ] Add replay scrubbing, event markers, and before/after state comparison.
- [ ] Add JSON and CSV export for flight logs and performance metrics.
- [ ] Add a flight data recorder view for one aircraft.
- [ ] Add an airport operations dashboard view.
- [ ] Add a conflict heatmap and runway utilization chart.
- [ ] Add a deterministic “replay exactly” test command.
- [ ] Add telemetry redaction rules before any cloud or public sharing.

### 9. Visual design and camera

- [ ] Establish a clean original visual language: miniature airport diorama, readable silhouettes, restrained colors, and soft lighting.
- [ ] Provide a wide ATC camera as the default for busy hubs.
- [ ] Provide a closer cinematic camera for ASMR watching.
- [ ] Add smooth zoom, pan, orbit, and camera reset with no stutter.
- [ ] Add runway/taxiway highlighting only on demand; yellow route lines should be optional.
- [ ] Make runway labels optional and keep the view readable without them.
- [ ] Add clear landing-end/takeoff-end markers that do not clutter the pavement.
- [ ] Add terminal, hangar, cargo, parking, fire station, control tower, highway, and perimeter details.
- [ ] Prevent buildings, trees, and props from intersecting protected movement surfaces.
- [ ] Add level-of-detail tiers for dense hubs.
- [ ] Add traffic labels and flight strips as a toggleable overlay.
- [ ] Add a minimized HUD for ASMR mode.
- [ ] Add high-contrast and color-blind-safe palette options.
- [ ] Add reduced-motion mode for UI transitions while preserving aircraft continuity.
- [ ] Add responsive layouts for desktop, tablet, and mobile.

### 10. Audio and ASMR presentation

- [ ] Keep all audio opt-in and user-controlled.
- [ ] Add layered runway ambience, distant engines, taxi whine, terminal hum, wind, rain, and tower room tone.
- [ ] Add subtle spatial panning based on aircraft position.
- [ ] Add approach, touchdown, takeoff, crossing, go-around, and emergency cues.
- [ ] Add radio-style ATC callouts with text captions first; optional voice synthesis later.
- [ ] Add separate volume controls for ambience, aircraft, radio, weather, and UI.
- [ ] Add a calm mode with fewer UI chimes and no punitive sounds.
- [ ] Add a “radio only,” “engines only,” and “silent simulation” preset.
- [ ] Prevent repeated event sounds from becoming distracting during busy traffic.
- [ ] Record/route audio events through telemetry so replays can reproduce them.

### 11. Progression, scoring, and social features

- [ ] Add safety score, throughput, delay, fuel burn estimate, and passenger impact metrics.
- [ ] Add shift grades and end-of-shift summaries.
- [ ] Add unlockable airports, aircraft, weather, and scenarios only if progression is desired.
- [ ] Add daily seeded challenges.
- [ ] Add shareable replay links or seed codes.
- [ ] Add screenshot and short clip capture.
- [ ] Add spectator mode for streams and classrooms.
- [ ] Add optional leaderboards with server validation; keep ASMR mode score-free.
- [ ] Add accessibility settings and a no-fail learning mode.

### 12. Performance, reliability, and engineering

- [ ] Move simulation updates into a renderer-independent module with a fixed or bounded timestep.
- [ ] Keep Three.js objects out of save state and telemetry state.
- [ ] Use a stable asset manifest instead of public filenames as APIs.
- [ ] Keep geometry, materials, audio, and UI assets grouped by domain.
- [ ] Use instancing for trees, lights, runway markings, and repeated props.
- [ ] Add object pooling for flights, trails, markers, and event effects.
- [ ] Add frame-time, simulation-time, draw-call, entity-count, and memory probes.
- [ ] Add a debug overlay that can be enabled with `?debug=1`.
- [ ] Add automated collision and runway-incursion tests without a browser.
- [ ] Add smoke tests for every named airport and every scenario.
- [ ] Add a long-run soak test for several simulated hours.
- [ ] Add mobile performance budgets and a low-detail mode.
- [ ] Keep builds deployable under a subdirectory with relative asset paths.
- [ ] Keep deployment additive so the existing menagerie remains intact.

## Proposed architecture

The current project can grow without changing engines. Keep the plain TypeScript/Vite/Three.js stack and make the boundaries explicit:

```text
src/
  simulation/
    model/              serializable airport, flight, runway, taxiway, gate state
    systems/            spawning, routing, reservations, weather, scoring, safety
    procedures/         approach, departure, taxi, crossing, emergency procedures
    scenarios/          normal, rush, closure, storm, training, emergency
    airportConfig.ts    named airports and procedural generators
  render/
    scene/              terrain, airport, aircraft, lights, effects
    camera/             wide, close, focus, replay cameras
    overlays/           optional routes, labels, radar, conflicts
  ui/
    hud/                status, counters, flight strips, weather, metrics
    menus/              airport, mode, scenario, settings, accessibility
    controls/           typed player action mapping
  audio/
    ambience/           looping layers and spatial sources
    events/             touchdown, radio, warning, emergency cues
  telemetry/
    schema/             versioned snapshot and event types
    adapters/           window API, BroadcastChannel, WebSocket, export
  agents/
    policies/           scripted, heuristic, and future LLM policies
    safety/             command validation and authority boundaries
```

### State ownership

- **Simulation:** authoritative entities, procedures, timing, reservations, collisions, scoring, save/replay state.
- **Renderer:** meshes, animation, camera, particles, lighting, interpolation.
- **DOM UI:** menus, text-heavy HUD, settings, accessibility, telemetry console.
- **Audio:** event-driven playback driven by simulation events, never by mesh discovery.
- **Agents/tools:** commands and observations only; never mutate simulation objects directly.

### Versioned control surface

Keep `window.airportControl` for local experimentation, then add adapters:

```ts
type AirportControl = {
  version: string;
  snapshot(): AirportSnapshot;
  events(limit?: number): AirportEvent[];
  command(command: AirportCommand): AirportSnapshot;
  replay(): ReplayFrame[];
  help(): Record<string, string>;
};
```

Every command should be validated by the same safety layer used by the UI. An agent must never get a privileged path around runway occupancy or separation rules.

## Delivery phases

### Phase 0 — Safety and motion foundation

**Goal:** make the current simulation trustworthy under busy traffic.

- Build the airport surface graph and named taxiway nodes.
- Replace phase jumps with continuous movement and interpolation.
- Fix edge spawning, glide paths, touchdown, rollout, runway exit, and takeoff roll.
- Enforce runway reservations, hold shorts, crossing clearances, and occupancy envelopes.
- Add automated tests for no air collisions, no surface collisions, no grass taxiing, and no unsafe crossings.
- Add a deterministic seed and a 30-minute soak test.

**Exit criteria:** 100 concurrent flights can run for a test shift with zero collisions, zero illegal runway crossings, and no unexplained motion pauses.

### Phase 1 — Playable ATC loop

**Goal:** make Manual, Assisted, and Auto modes meaningfully different.

- Add typed flight strips and clearance readbacks.
- Add tower/ground/approach/supervisor station responsibilities.
- Add taxi route preview, reroute, hold, expedite, and go-around commands.
- Add score, delay, throughput, safety, and incident summaries.
- Add training, challenge, sandbox, and watch-only ASMR modes.

**Exit criteria:** a new player can start a shift, clear an arrival, taxi a departure, handle a crossing, and understand why a command is rejected.

### Phase 2 — Famous airports and living traffic

**Goal:** make ORD and the other hubs feel recognizably busy.

- Finish ORD’s real runway/taxiway graph and surrounding context.
- Add realistic hub schedules, airline mixes, gates, and terminal/ramp activity.
- Add continuous edge traffic with peak periods and holding.
- Add simplified but honest layouts for ATL, DFW, DEN, LAX, JFK, LHR, DXB, HND, and IST.

**Exit criteria:** the wide camera shows multiple simultaneous approaches, landings, taxi movements, runway queues, and departures without visual or logical overlap.

### Phase 3 — Weather, audio, and ASMR polish

**Goal:** make watch-only operation satisfying for long sessions.

- Add wind-driven runway selection and visibility effects.
- Add rain/fog/snow/storm layers and weather alerts.
- Add layered ambience, aircraft sounds, radio captions, and calm presets.
- Add dawn/day/dusk/night presentation and optional route/radar overlays.

**Exit criteria:** a 30-minute autoplay session remains smooth, legible, and sonically varied without repetitive or alarming cues.

### Phase 4 — Agentic control and observability

**Goal:** allow an agent to observe and control the simulation safely.

- Stabilize the telemetry schema and replay format.
- Add a local event stream and read-only dashboard.
- Add scripted controller policies and an evaluation harness.
- Add human takeover and an emergency stop.
- Add optional external WebSocket control with authentication and rate limits.
- Only then evaluate LLM-based approach, tower, and ground agents.

**Exit criteria:** an agent can operate a seeded shift, explain its actions, and be interrupted or overridden without bypassing safety constraints.

### Phase 5 — Publishing and community layer

**Goal:** make the project easy to share without disrupting the menagerie.

- Keep the additive `/airport-auto/` Pages deployment.
- Add a project landing/readme page with controls, modes, and credits.
- Add shareable seeds, replays, screenshots, and challenge links.
- Add optional leaderboards or classroom/spectator tools only after server-side validation exists.

**Exit criteria:** a fresh visitor can find the game from the menagerie, understand the modes, and start playing on desktop or mobile.

## First 12 implementation tickets

1. [x] Add a serializable `AirportSurfaceGraph` with named taxiways, stands, intersections, and hold-short nodes.
2. [x] Add a fixed-step simulation test harness with seeded time advancement.
3. [x] Add collision envelopes and assert no aircraft-aircraft or aircraft-building overlap.
4. Implement continuous arrival splines from edge entry through touchdown and rollout.
5. Implement continuous departure roll, rotation, and climb-out.
6. Make taxi routing graph-based and prohibit grass positions.
7. Add runway crossing reservations and explicit hold-short clearance UI.
8. Replace batch spawning with a rolling traffic scheduler and hub-specific peak curves.
9. Add ORD’s first-pass real surface graph and validate it against a reference diagram.
10. Add Assisted mode with proposed clearances and rejection explanations.
11. Add versioned telemetry snapshots/events plus a replay export test.
12. Add an autoplay soak-test dashboard that reports collisions, incursions, stalls, pauses, delay, and throughput.

## Acceptance test matrix

### Safety

- No airborne collision in 10,000 seeded flights.
- No ground collision in 10,000 seeded flights.
- No aircraft occupies grass outside an explicitly modeled emergency state.
- No building, tree, or prop intersects a runway or taxiway envelope.
- No runway crossing occurs without a matching clearance event.
- No departure enters an active runway while an arrival is inside the protected zone.

### Motion

- Every arrival begins at or outside the map edge.
- Every arrival follows a smooth final approach.
- Every landing includes threshold crossing, touchdown, rollout, and runway exit.
- Every departure includes taxi, hold short, runway entry, acceleration, rotation, and climb.
- Phase changes do not create visible pauses or teleports.
- Simulation speed changes preserve procedural proportions.

### Playability

- Auto mode keeps traffic flowing without user input.
- Manual mode requires meaningful clearances and gives actionable rejection reasons.
- Assisted mode is helpful but never silently executes an unsafe command.
- The airport, mode, scenario, weather, wind, speed, radar, and night controls are discoverable.
- Wide view remains readable with simultaneous arrivals, departures, and surface traffic.

### Observability

- Snapshot, event, command, help, and replay APIs remain versioned and documented.
- A command can be traced from input to accepted/rejected event.
- A replay reproduces the same flight states for the same seed and command sequence.
- Telemetry can be disabled or kept local without changing simulation behavior.

### Performance

- 60 FPS target on a modern desktop in a normal hub scene.
- Graceful low-detail mode on mobile.
- No unbounded event, replay, or object-pool growth in a multi-hour run.
- Build works at the root and under the GitHub Pages subdirectory.

## Product decisions to make later

- Is the primary title “Airport Auto” or “Stillwater Airfield”?
- How exact should each real airport be before the schematic label is required?
- Should ATC voice use generated speech, prerecorded clips, or captions only?
- Should agent control remain local-only or support a remote authenticated service?
- Is progression desirable, or should the experience remain a calm open-ended simulator?
- Which telemetry should be public in shared replay links?
- Do leaderboards improve the game, or conflict with the ASMR mode?
- Which airports deserve full taxiway fidelity first: ORD, ATL, DFW, or another hub?

## Definition of done for the next major release

The next major release is ready when:

- ORD has a safe, named surface graph with believable traffic flow.
- Auto, Assisted, and Manual modes have distinct loops.
- Arrivals visibly enter from the edge, fly a smooth approach, land, roll, and taxi.
- Departures taxi on pavement, hold short, take a full runway roll, and climb out.
- Busy traffic produces no collisions, illegal crossings, runway/building overlaps, or phase pauses.
- Weather and wind can be enabled or disabled independently.
- The wide ATC view and quiet ASMR view both work.
- Telemetry and replay are documented and reproducible.
- The GitHub Pages deployment remains additive and the existing menagerie still works.

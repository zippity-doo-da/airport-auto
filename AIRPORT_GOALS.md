# Airport Auto Goals

Status: active product and implementation ledger  
Last reconciled: August 10, 2026
Baseline: Airport Auto 2.41 plus the additive Research Annex navigation
Companion ledger: [Combat Simulation Goals](COMBAT_GOALS.md)

## Purpose

Airport Auto is an ASMR-first living-airport simulation with an optional serious
air-traffic-control game. It should be satisfying when left alone, legible when
supervised, and fully playable when a person or authorized agent occupies an ATC
position.

This file records future civilian-airport goals. It does not reopen work already
completed in `PLAN.md` and `ROADMAP.md`. An unchecked box here represents real
future work. When a goal ships, record its release evidence in `PLAN.md`, remove
or archive the completed implementation checklist here, and retain only genuinely
unfinished follow-up work.

## Product north star

Create the most watchable browser airport and the most approachable serious ATC
simulation that can share one deterministic runtime.

The product must support four complementary experiences:

1. **Watch / ASMR:** continuous, calm, credible airport activity with very little
   required interface.
2. **Assisted ATC:** the simulation proposes safe actions and explains why they
   are useful before the player accepts them.
3. **Full Manual:** Approach, Tower, Ground, Ramp, and Supervisor are complete,
   distinct, playable workstations.
4. **Live human/agent operation:** any unoccupied position can remain automated;
   an authorized human or agent can claim, hand off, and release a position
   without bypassing the common safety arbiter.

### Primary player verbs

- Observe traffic and airport activity.
- Build and maintain a mental traffic picture.
- Sequence, meter, route, clear, coordinate, and hand off aircraft.
- Manage gates, ramps, taxiways, runways, weather, and constrained capacity.
- Detect developing conflicts before an alert becomes an incident.
- Recover from disruptions without teleporting, overlapping, or silently
  deleting traffic.
- Review a shift and understand why delay, holding, or an unsafe outcome occurred.

### Session shapes

- Two-to-five-minute ambient visit.
- Fifteen-to-thirty-minute controller shift.
- Forty-five-to-ninety-minute hub bank or weather-recovery session.
- Multi-hour unattended Watch session.
- Deterministic classroom, agent-evaluation, and replay session.

## Shipped baseline — not future backlog

The following capabilities already exist and must be preserved rather than
reimplemented:

- Fixed-step, renderer-independent aircraft and vehicle motion.
- Continuous arrivals, departures, turnarounds, gates, pushback, taxi, runway
  crossing, deicing, and service-vehicle operations.
- Collision, obstacle, runway-protection, separation, wake, reservation, and
  surface-routing safety systems.
- Auto, Assisted, Manual, Watch, Training, Challenge, and Sandbox modes.
- Approach, Tower, Ground, Ramp, and Supervisor authority with deterministic
  automated controllers and takeover continuity.
- O'Hare's sourced runway, apron, building, taxiway, terminal, concourse, gate,
  airspace, and surrounding-context foundation.
- Ten additional named schematic airports and generated local fields.
- Weather, wind, runway conditions, severe-weather escape behavior, seasons,
  lighting, accessible palettes, spatial sound, fictional radio captions, and a
  camera director.
- Aircraft-specific fuel, performance, handling, effects, liveries, services,
  routes, destinations, and operator programs.
- Exact replay, schema migrations, analytics, local capture, deterministic share
  links, optional reviewed live data, and a typed local/remote control protocol.
- Responsive camera movement, pointer/touch/keyboard/gamepad input, flight focus,
  radar, queue, weather, wind, taxiway, compass, and performance diagnostics.

## Non-negotiable design rules

1. **One authoritative state.** Simulation position, velocity, acceleration,
   heading, attitude, altitude, fuel, occupancy, and clearance state cause the
   visible motion. Rendering interpolates; it never invents another route.
2. **Safety is shared.** UI, Auto, scripted controllers, remote humans, and agents
   all use the same command, authority, reservation, and conflict boundary.
3. **No invisible cheating.** Recovery may meter, hold, reroute, tow, divert, or
   cancel before entry; it may not overlap stands, drive across grass, cross an
   active runway without authority, or teleport a live aircraft.
4. **Offline remains complete.** Live feeds, remote control, accounts, and hosted
   services are optional adapters. Static Pages must remain playable without
   them.
5. **Named airports remain schematic until proven.** A hub loses its schematic
   label only after licensed source import, route validation, acceptance testing,
   and explicit not-for-navigation disclosure.
6. **The airport stays civilian.** The Combat button navigates to a separate
   product surface. Weapons and combat state do not enter the civilian runtime.
   Airshows or heritage flyovers may be added later as explicitly peaceful events.
7. **The playfield wins.** Persistent DOM chrome stays compact; detailed panels
   remain collapsible; mobile and short-laptop layouts cannot lose controls.
8. **Calm is a first-class outcome.** Watch mode avoids repetitive alerts,
   unnecessary scoring, rapid message flicker, and camera interruption.

## Goal map

| Priority   | Goal                                 | Player outcome                                                  | Main dependency                                 |
| ---------- | ------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------- |
| P0         | A1 Surface safety picture            | Understand every protected movement at a glance                 | Existing surface graph and conflict forecast    |
| P0         | A2 Time-based flow management        | Shape a hub bank before it becomes holding and gridlock         | Existing terminal procedures and queue model    |
| P1         | A3 Digital clearances                | Issue complex instructions clearly with explicit readback state | Typed command and staged-readback systems       |
| P1         | A4 High-fidelity Atlanta             | Add a second genuinely recognizable large hub                   | Existing FAA/OSM import pipeline                |
| P1         | A5 Irregular operations and recovery | Turn disruption into playable operations rather than failure    | Reservations, towing, services, emergency state |
| P2         | A6 Deeper airport life               | Make the airport feel inhabited without weakening routing       | Vehicle graph, gate lifecycle, asset budgets    |
| P2         | A7 Long-form Watch direction         | Make a one-hour unattended session varied and calm              | Soundscape, event broker, camera director       |
| P2         | A8 Shared human/agent shifts         | Make roles cooperative and inspectable in real time             | Existing gateway, authority, evaluation, replay |
| Continuous | A9 Engineering and release health    | Preserve smooth deterministic behavior as scope grows           | Worker boundary, budgets, automated gates       |

## A1 — Surface safety picture

### Outcome

Provide an optional tower surface display inspired by ASDE-X/ASSC concepts: a
clean diagram with identified aircraft and vehicle tracks, approach-corridor
context, protected-area occupancy, and restrained predictive alerts. The real
FAA system fuses surface surveillance and flight-plan information to improve
movement-area awareness; Airport Auto will model the concept, not replicate an
operational display. Reference: [FAA ASDE-X](https://www.faa.gov/air_traffic/technology/asde-x).

### Current progress — August 10, 2026

The first implementation slice is in place: a versioned, renderer-independent
`SurfaceTrack`/`SurfaceVehicleTrack`/`SurfaceSafetyAdvisory` projection reads
authoritative aircraft and active-service-vehicle motion, protected-runway or
movement-area state, holds, taxiway identity, and existing forecasts.
The optional **Safety** panel consumes that projection, shows live movement-area
tracks and restrained alerts, and can focus the identical aircraft target used
by the map and radar. Its ORD validation covers pose preservation, hold state,
protected-runway occupancy, named taxiways, and critical historical incident
visibility. Advisory records now retain causal tracks, first-seen and predicted
times, active/resolved state, and bounded resolution history; the same snapshot
is available at `airportControl.snapshot().surfaceSafety`. The panel now offers
pure, shared **All**, **Tower**, **Ground**, and **Ramp** filters: Tower isolates
protected/held movements, Ground shows moving aircraft and vehicles, and Ramp
shows stand/apron activity. The selected filter is included in the local API
snapshot and is covered by the deterministic validator. Runway entrance and
takeoff-hold lights now read the shared authoritative runway-protection
projection: red entrance lights appear only for occupied protected pavement,
while amber hold lights appear for occupied pavement or an uncleared departure.
The deterministic safety validator asserts both conditions. The broader A1
accessibility audit is now complete: the panel opens from the keyboard into its
station filter, Escape closes it and restores focus, and a restrained live
summary reports movers, protected movements, holds, warnings, and critical
alerts without announcing every refresh. Track and vehicle rows expose complete
text alternatives, all visible panel copy remains at least 9 px at the release
viewport, status is never color-only, reduced-motion behavior is browser-tested,
and coarse-pointer controls retain at least 44-pixel targets.
Short-final wrong-surface detection also now compares the authoritative aircraft
pose and heading with its assigned runway centerline, alternate runway ends,
and nearby taxiway segments. It raises an explainable warning only when an
approach has converged on another surface; seeded aligned and misaligned
approaches are covered by the safety validator.
Active noncritical surface advisories can now be acknowledged through the panel
or typed `acknowledgeSurfaceAdvisory` API command. Acknowledgement is stored in
the display snapshot and command audit trail, while the underlying reservation,
hold, trajectory, and critical-warning rules remain unchanged; critical and
resolved advisories cannot be acknowledged.
Surface track rows now show their controller-visible route intent, active
clearance/hold state, and explicit fixed-step track age. These values are read
from authoritative route and clearance state; they do not expose predicted
future paths or renderer-generated positions.
New active safety advisories now enter the existing dwell-based status broker
once per active advisory burst, prioritizing the most severe item while leaving
the complete list in the Safety panel. Resolved recurring advisories may alert
again; unchanged advisories cannot churn the status copy.
Protected-runway crossing forecasts now carry a shared corridor geometry from
the authoritative aircraft pose to the named hold point. The compact surface
diagram renders that corridor alongside its forecast arc, and the same points
survive the remote redaction boundary. This makes a predicted crossing leg
inspectable before the aircraft reaches the protected envelope; it does not
grant clearance or change movement arbitration.
The deterministic acceptance fixture now exercises both an uncleared crossing
and a stale-clearance fault on a real sourced named-hub route. Cleared and
uncleared crossing windows remain forecast-visible whenever another movement
protects the runway, imported control-point IDs resolve to their authoritative
coordinates, and the warning is asserted before collision detection reports an
incursion. Independent parallel runway movements are explicitly verified as
noncritical.
Each one-second replay frame now retains the exact tracked surface-safety
snapshot, including active/resolved lifecycle state, acknowledgement, causal
tracks, and geometry. Replay presentation reads that recorded snapshot rather
than rebuilding advisory history from the scrubbed aircraft state. The local
Operations Lab also keeps a bounded advisory rollup with activation count,
highest severity, active duration, resolution, runway, and involved flights;
the rollup is visible in the Safety picture metric and exportable as the
`surface-advisories` dataset. Shareable replay redaction removes advisory detail
while preserving its structural safety evidence. Recurring advisories now clear
their old resolution timestamp when they become active again.
Surface Track schema 2 now carries a bounded remainder of each assigned taxi
route sampled from the same aircraft-specific curved motion path used by the
simulation. Upcoming runway crossings retain their authoritative crossing ID,
runway, hold/crossing points, and pending, held, or cleared state. The optional
compact safety diagram draws these muted routes and emphasizes only the selected
track; the main 3D map remains free of automatic route lines. Remote snapshots
and exact/shareable replay preserve the bounded structural geometry.
The diagram now has independent, keyboard-accessible Routes, Flight paths,
Forecasts, and Vehicles layer controls plus a typed 15/30/60-second horizon.
The same configuration is exposed through the page-local and authenticated
remote control surfaces. Layer changes affect presentation only; advisory rows,
physical reservations, and safety arbitration remain authoritative and active.
Track buttons are reconciled by flight ID rather than recreated every four
hertz, and panel sections no longer collapse into overlapping rows while the
bounded panel scrolls. Browser validation holds keyboard focus across a live
refresh and exercises both direct and API-driven layer changes.
Each local flight snapshot now includes a versioned pose-alignment record that
keeps the four relevant coordinate sources explicit: authoritative fixed-step
motion, collision/graph envelope, interpolated renderer source, and the actual
Three.js root position. The renderer reports its source error separately from
its normal sub-step interpolation lag, and the authenticated remote projection
retains bounded structural alignment diagnostics. A sourced named-hub crossing
fixture now advances through protected pavement using the production update
loop and verifies exact track, collision, graph-occupancy, and authoritative
pose agreement at every protected sample. Browser capture independently proves
that the Three.js root consumes its interpolated source pose exactly while its
surface-aircraft lag from the current fixed step stays bounded.

### Gameplay and UX

- [x] Add a resizable surface-safety panel separate from the existing general
      radar inset. It is desktop-resizable and bounded on compact screens, and now
      includes a compact authoritative surface diagram with station, horizon, and
      independent diagram-layer controls.
- [x] Render aircraft, tugs, authorized vehicles, runway occupancy, hold-short
      state, crossing authority, and approach/departure protection zones.
      The optional **Runway protection** map layer now shades each authoritative
      protected runway and its hold-short points: red for occupied pavement, blue
      for a currently authorized crossing, and amber for a waiting hold. The
      dedicated compact diagram now shows those authoritative runway states with
      aircraft, service-vehicle, assigned-route, and crossing-clearance symbols.
      It also projects bounded, versioned arrival, departure, and go-around
      corridors directly from authoritative flight motion; Ground and Ramp filters
      suppress that airborne context while Tower, Supervisor, and Watch retain it.
- [x] Show track identity, movement state, route intent, last clearance, and
      surveillance freshness without exposing hidden future simulation state.
- [x] Add configurable look-ahead conflict arcs with a quiet advisory tier and a
      visually distinct immediate warning tier. The compact diagram now offers
      15-, 30-, and 60-second horizons and draws only active forecast-backed
      track arcs: dashed blue for advisory, solid amber for warning, and red
      for critical. Assigned curved taxi routes, individual crossing points, and
      approach/departure protection corridors now share the same diagram. Routes,
      flight-path corridors, forecasts, and service-vehicle symbols can each be
      decluttered without changing the underlying safety state.
- [x] Add modeled runway entrance lights and takeoff-hold lights driven by the
      authoritative protection state, not decorative animation.
- [x] Add a toggleable, speed-scaled surface movement-vector layer for aircraft
      and service vehicles. Its short vectors derive only from each entity's
      current authoritative pose, heading, and groundspeed; amber and red
      indicate held and protected-runway movement without displaying an
      invented future taxi route.
- [x] Add wrong-surface alignment detection for runway versus taxiway approach
      paths and explain the triggering geometry.
- [x] Allow selecting or focusing a target from either the 3D field or the
      surface display without forcing camera follow. Surface-track selection
      updates the shared selected flight and actions while leaving the camera
      position and follow state unchanged; map and navigator focus still follow.
- [x] Provide Tower, Ground, and Supervisor-specific filtering plus a read-only
      Watch presentation. All, Tower, Ground, Ramp, Supervisor, and Watch views
      now have pure shared filter semantics in the Safety panel and local API.
- [x] Preserve keyboard navigation, screen-reader summaries, color-vision-safe
      semantics, reduced motion, and 44-pixel touch targets. Track rows and all
      compact-screen controls meet the touch baseline; keyed track reconciliation
      preserves keyboard focus across live refreshes; Escape restores focus to
      the opener; a polite atomic summary reports operational changes; and every
      track, vehicle, and advisory retains readable text semantics independent of
      color. Desktop and coarse-pointer browser coverage exercises the complete
      interaction while the existing reduced-motion gate remains green.

### Simulation and API

- [x] Define one versioned `SurfaceTrack` projection sourced from authoritative
      entities and reservations. Surface tracks now carry their own schema
      version and authoritative pose, route intent, clearance, and freshness.
- [x] Define one `SurfaceSafetyAdvisory` type with severity, geometry, causal
      entities, first-seen time, predicted time, acknowledgement, and resolution.
      Version 1 advisories carry shared runway/corridor/system geometry and
      causal tracks; the bounded tracker preserves active, resolved, expired,
      and recurring lifecycle state without changing physical protection.
- [x] Route every alert through the existing status broker, replay, analytics,
      and remote redaction policy. Exact replay frames retain the tracked
      snapshot, the local Operations Lab records bounded advisory episodes and
      duration, the authenticated remote projection carries bounded geometry,
      and shareable replay removes free-text detail.
- [x] Expose display configuration and acknowledgement through typed commands;
      acknowledgement must never suppress physical protection.

### Acceptance gate

- [x] Zero false disagreement between 3D pose, graph occupancy, track position,
      and collision diagnostics across deterministic crossings and pushbacks.
      The surface-safety validator cross-checks each displayed track against the
      authoritative pose and collision envelope; a sourced crossing now advances
      through protected pavement under the production fixed-step update; and the
      Manual departure lifecycle repeats that assertion through real pushback,
      taxi, runway entry, lineup, and takeoff-roll movement. Browser capture
      verifies the actual Three.js root against its interpolated source and the
      current authoritative/collision pose with a bounded sub-step lag.
- [x] Every seeded runway-incursion test produces an advisory before protected
      envelopes overlap; safe parallel operations do not produce a critical alert.
      The surface-safety validator covers an uncleared crossing, a stale cleared
      crossing on a sourced named-hub route, pre-overlap collision state,
      explainable control-point corridor geometry, and an independent-parallel
      negative control.
- [x] The panel remains usable at 1440×900, 1024×600, and 390×844 without hiding
      the Controls or Combat transitions. The release matrix now measures panel
      bounds and asserts zero overlap with both primary transitions at all three
      viewports; the mobile panel begins below them and scrolls internally.
- [x] Enabling the panel remains within the established renderer/DOM update
      budgets and does not regenerate the full target list every frame. The
      shared cadence is capped at four updates per second, unchanged snapshots
      retain the same render key, and the surface-safety validator exercises a
      60 fps input stream against that cap.

## A2 — Time-based flow management

### Outcome

Give Approach and Supervisor a strategic arrival/departure scheduler that assigns
target times at meter fixes, runway thresholds, runway crossings, and departure
release points. The intent is to absorb delay efficiently before aircraft reach
the final or taxi queue. Reference: [FAA time-based flow management](https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap18_section_25.html).

### Current progress — August 9, 2026

The deterministic scheduler, rolling arrival/departure queues, holding limits,
pressure relief, traffic-density profiles, and long-run validation already exist.
The optional Queue inspector now exposes the same authoritative arrival and
departure release slots in a compact meter plan, so the operational cadence is
visible without adding persistent map chrome. This is a diagnostic/gameplay
timeline, not a second scheduler.
Supervisor can now choose an authoritative flow objective: Balanced, Minimum
Holding, Minimum Taxi Delay, Weather Recovery, or Watch / Calm. Each profile
deterministically changes modeled demand, arrival-spacing, and departure-release
pacing while preserving the safety minima; non-Supervisor stations cannot change
it. It is intentionally a game-scale operational preference, not a real-world
traffic-management clearance.
Each meter entry now keeps a bounded, replay-safe revision trail containing the
revised target time and cause. The Queue meter displays the latest cause instead
of leaving schedule movement as an opaque timer.

Each current meter reason is now also classified as Weather, Runway, Wake, Gate,
Performance, Taxi, Demand, or Schedule. The category is derived from the
authoritative detailed reason and retained with each slot revision; it improves
scanability without creating a second scheduler or hiding the actual constraint.

The Queue inspector now adds a bounded directional capacity outlook. It reports
planned releases against current demand, delayed and revised slots, a confidence
tier, and the reason for that confidence across a 5-, 10-, or 15-minute window.
The outlook is derived from the same authoritative slots and is
presentation-only; it cannot move, release, or cancel an aircraft.

ORD now seeds a bounded ten-aircraft opening bank: two independently reserved
taxi-out departures, a live turn, additional gate/ramp departures, and the
normal three-aircraft approach picture. Departure starters are staged without
consuming approach capacity, then pass through the same stand, meter, runway,
wake, and surface-reservation rules as every later flight.

Opening taxi departures now also rewrite the carried-over gate schedule before
their departure flight plan is created. That prevents an aircraft already
taxiing in the opening picture from inheriting a stale inbound-turn release
time, reaching the threshold, and waiting through an artificial future slot.
The ORD flow validator asserts this release-time invariant directly.

Inbound demand now applies bounded queue-pressure relief to its next-demand
clock once the holding buffer is more than half full. This keeps the rolling
stream alive while reducing self-inflicted bursts; it does not alter separation,
runway, gate, or surface safety rules. Rush, fixed-step, trajectory, and
long-session flow validators continue to pass with the relief active.

Runway-entry commitment now has a single direction of authority: before line-up,
the departure sweep protects the runway from taxi traffic; after line-up, the
surface arbiter protects the committed departure from taxi traffic. Takeoff
reservation no longer re-applies the pre-entry sweep, which previously allowed a
departure and its blocker to hold one another indefinitely. The ORD rush
fixed-step gate now requires multiple completed departures, while longer
multi-hour flow and fuel comparisons remain open.

Surface flow also applies bounded fairness recovery to long waits behind an
uncommitted pushback corridor and to named graph-resource reservations. These
recoveries amend only the remaining sourced graph suffix and never move a
runway-entry-cleared aircraft. The predictive graph-reservation horizon is 180 m;
physical collision sweeps retain an independent 400 m preview. The longer
physical horizon establishes shared-corridor ownership before aircraft reach a
late stop, while graph reservations remain short enough to permit independent
movement. A one-hour
ORD Rush soak remains collision-free and drains arrivals/departures, though
individual taxi holds can still be long under extreme demand.

Runway-entry coordination now meters an uncleared departure upstream on its
assigned taxi route whenever a sustained crossing sequence has priority for the
same runway. The departure retains normal braking and an explicit queue reason;
it does not occupy the shared access node, enter the runway, or wait at its
gate on a short route. Scripted Tower and Ground runway rejections now retry at
a calmer twelve-second cadence instead of churning every two seconds. A local
ORD Extreme Watch soak on August 8 completed 23 arrivals and 11 departures in
one modeled hour with zero collisions, incursions, or unexplained pauses; its
longest surface queue wait was 165.5 seconds. This is a meaningful regression
improvement, not final proof of bounded hub flow under every prolonged demand
configuration.

Surface reservation recovery now scopes its retry budget to the current
blocker/route position and permits a bounded re-attempt after downstream
reservations have had time to change; a previously failed alternate route no
longer permanently blacklists that aircraft. Queue records also retain named
flight blockers extracted from authoritative reservation reasons, so the Queue
inspector and agent-facing snapshot expose the same wait-for edge. The current
three-hour extreme run no longer trips the traffic-stall condition and remains
collision/incursion-free; queue-volume calibration and long individual holds
remain open acceptance work.

The local soak runner now accepts `--mode=auto|watch` so unattended behavior is
measured rather than inferred from a presentation label. On August 8, an ORD
Extreme three-hour run in each mode completed 40 arrivals and 25 departures,
with a 41-aircraft maximum queue against the 64-entity budget, zero collision,
incursion, or unexplained-pause diagnostics, and simulation-tick p95 below the
10 ms budget. This is concrete Auto/Watch sustained-flow evidence, but it does
not close the acceptance gate: the captured wait-for graph still contained
individual flights held for implausibly long periods, so recovery fairness and
queue-quality calibration remain required.

Traffic-flow entries now carry a versioned, replay-safe sequence of operational
meter targets rather than only one generic release timestamp. Pending arrivals
own an arrival-fix target and gain their procedure-named runway-threshold target
when admitted. Taxi-out departures own a departure-release target, individual
runway-crossing targets derived from the sourced surface graph, and a runway-
threshold target derived from route distance and aircraft taxi speed. Slot
revisions translate the full sequence together, and route changes regenerate it
from the authoritative route. The Queue inspector shows each target and its
early/late tolerance window without moving an aircraft or bypassing safety.

The sustained-flow gate now measures each traffic direction independently,
detects airport-wide motion freezes, and records the longest continuously
stationary non-resting aircraft with its blocker context. Ramp scheduling uses
least-recently-attempted fairness, and a push-ready parked aircraft becomes an
urgent release when its body blocks either an inbound or outbound surface
movement. Auto/Watch also reserve a short arrival opening only when runway
spacing—not a gate, path, or surface-capacity constraint—is the proven cause of
an overdue meter release. Departing blockers clear dependent projected-path
holds in the same resolved tick, preventing a removed aircraft from leaving a
phantom wait behind it.

On August 9, deterministic three-hour ORD Extreme runs passed in both Auto and
Watch. Each completed 58 arrivals and 38 departures, reached 28 aircraft and 43
queue records at peak, kept the longest continuous individual stop to 684.7
seconds and the longest airport-wide absence of traffic motion to 40 seconds,
and reported zero collisions, incursions, or unexplained pauses. Simulation-tick
p95 was 6.571 ms in Auto and 2.467 ms in Watch, both inside the runtime budget.

On August 10, the strengthened surface scheduler passed an eight-hour ORD
Extreme Auto soak with 74 arrivals and 68 departures, zero collisions, runway
incursions, or unexplained pauses, and a 544.3-second longest continuously
stationary movement. This closes the immediate ORD sustained-flow regression;
the repeatable `npm run soak:flow-matrix` gate now supplies the corresponding
weather and multi-airport coverage. Its two-hour-per-case Auto run completed
23 arrivals / 11 departures at ATL in a summer storm, 26 / 16 at DFW in snow
recovery, and 4 / 3 at schematic HND in an international-evening bank. All
three cases reported zero collisions, incursions, unexplained pauses, or
airport-wide motion stops; the longest individual movement hold was 531.3
seconds. Sourced surfaces retain stricter directional throughput expectations,
while HND's lower floor reflects its deliberately converging schematic taxi
graph and real-time taxi speed.

A later August 10 four-hour ORD Extreme regression exposed a separate one-way
surface dependency: an aircraft could remain safely held behind traffic that
never formed a detectable wait cycle. Surface routes now treat every stand as
an endpoint rather than through pavement, and a named non-runway dependency
that survives ten minutes receives the existing swept-envelope, pavement-only
forward/tug recovery. The identical acceptance soak then passed with 54
arrivals, 44 departures, a 893.7-second longest individual stop, 37 peak queue
records, 0.894 ms simulation-tick p95, and zero collisions, incursions,
unexplained pauses, stale traffic streams, or airport-wide motion stops.

The August 9 four-hour ORD Extreme Auto audit also closed a meter-accounting
defect: an eligible departure slot is now released only after the same tick
successfully reserves the runway, and a strategic arrival opening cannot
reverse a departure already cleared onto the runway. A full holding buffer now
back-pressures the demand clock instead of creating an extra instant diversion,
while aged departure slots retain the proven fairness replan but are recorded
as reschedules rather than cancelled flights. The acceptance run completed 55
arrivals and 35 departures with zero collisions, incursions, unexplained pauses,
or reported cancellations; its longest individual movement stop was 564.3
seconds, simulation p95 was 2.422 ms, and retained-heap growth was 17.984
MiB/hour. The soak gate now rejects non-atomic departure releases, inconsistent
arrival-demand accounting, and cancellation churn.

The 2.40 comparison is now executable rather than anecdotal. A fixed 30-minute
ORD Rush/Auto bank at 3x uses the same seed, fixed step, stop/restart thresholds,
and safety diagnostics against the frozen `92a269c` release result. Current
Balanced flow reduced stopped-ground holding fuel from 432.997 kg to 351.456 kg
and taxi stop/restart cycles from 43 to 20, with zero collision or runway-
incursion diagnostics. Reduced-engine/APU fuel flow is modeled during a stopped
ground hold; moving taxi fuel flow is unchanged. A separate one-hour ORD Extreme
Auto run completed 23 arrivals and eight departures with zero collisions,
incursions, unexplained pauses, or airport-wide movement freezes.

Manual flow advisories now have an explicit response lifecycle. An authorized
Approach, Tower, or Supervisor controller can ignore an active advisory without
changing score or shift metrics; the Queue inspector then keeps its actual
elapsed time, added queue delay, modeled holding-fuel burn, and queue-size delta
visible. Supervisor can select the direction-appropriate recovery objective,
but that action never moves an aircraft or bypasses an ordinary clearance or
safety arbiter. The ignored/recovered record lives in versioned traffic-flow
state, so exact replay scrubbing preserves both the decision and its consequence
snapshot. Deterministic simulation and desktop browser tests cover the complete
Ignore → consequence → Recover loop.

The rolling forecast now includes every planned uncertainty domain.
Weather, wind, runway condition, and pilot response remain shared operational
inputs; procedure complexity, taxi congestion, and gate readiness are derived
separately for arrivals and departures from authoritative flight-plan/readback,
hold/go-around, runway-transition, queue, stand-commitment, and turnaround
state. These bounded factors reduce forecast confidence and effective projected
capacity only. They do not alter an assigned slot, reserve a resource, or move
an aircraft. The Queue inspector names material procedure, taxi, and gate
factors directly, while the typed snapshot retains every numeric input.

The forecast horizon is no longer a hard-coded five minutes. Supervisor can
select a replay-safe 5-, 10-, or 15-minute window in the Queue inspector or
through the typed control API. Both directional demand and release-capacity
projections use the selected window immediately, while existing meter slots,
reservations, score, and aircraft movement remain unchanged. Other stations can
inspect the active horizon but cannot alter the airport-wide planning window.

Each directional window now explains its capacity source. Version 6 snapshots
identify the active runway configuration, every role-compatible runway and
closure state, usable-runway count, modeled arrival/departure spacing, concurrent
approach capacity, and bounded Weather, Runway, Wake, Gate, Taxi, or Downstream
queue constraints with counts and oldest waits. Arrival demand and arrival
capacity are now projected from separate demand-interval and legal-spacing
inputs rather than the same timer. The Queue inspector shows a compact runway /
spacing / constraint line; its full title and typed snapshot retain the complete
attribution. Downstream saturation is also a direction-specific uncertainty
factor, not an unexplained confidence reduction.

Traffic-flow snapshot schema 7 now adds a pure, objective-aware adjacent bank
optimizer. It evaluates the first six arrival and departure slots from their
authoritative projected target time, readiness, urgency, and active blocker,
then emits at most one beneficial move per direction. Minimum Holding favors
arrival recovery, Minimum Taxi Delay favors departure recovery, and Watch / Calm
requires a larger benefit. The recommendation names the displaced entry and its
modeled benefit; approving it in the Queue inspector calls the same station-
authorized, ten-second-frozen resequence command as a manual move. Optimizer
approval also carries the expected displaced entry and fails closed if the bank
changed after render. Reading the optimizer cannot change state, and approval
cannot grant a clearance, reserve a resource, or move an aircraft.

Traffic-flow state schema 4 and snapshot schema 8 now retain structured
attribution with every initial slot and revision: stable category, cause code,
source subsystem, and optional causal flight/runway. Procedure capacity,
missed approaches, and downstream saturation are no longer collapsed into
generic runway, demand, or schedule labels. A real go-around shifts the pending
arrival bank by one bounded recovery interval and records the missed aircraft
and runway on every affected slot; it still grants no later landing clearance.
The Queue inspector shows the machine-stable cause beside the exact operational
reason, while local analytics/export schema 4 preserves the same fields.

### Gameplay and UX

- [x] Add a timeline showing demand, runway capacity, target crossing times,
      tolerance windows, expected delay, and confidence. The Queue inspector
      now shows active arrival/departure slots, delay, a configurable planned-slot
      outlook, bounded confidence, and route-aware meter targets with explicit
      tolerance windows, plus active runway/spacing/constraint attribution and
      direction-specific downstream uncertainty.
- [x] Let Supervisor choose Balanced, Minimum Holding, Minimum Taxi Delay,
      Weather Recovery, or Watch/Calm scheduling objectives. The Queue
      inspector and typed control API now select authoritative pacing profiles;
      bounded forecast-based slot reviews now feed action-specific Assisted
      proposals without mutating aircraft. The bounded adjacent bank optimizer
      scores readiness, urgency, blockers, projected timing, and the selected
      objective without becoming a movement authority.
- [x] Give Approach advisories for speed, vector, hold, direct-to, and sequence
      changes that satisfy target times through existing legal commands. Assisted
      mode now maps authoritative runway-threshold error into bounded slow, speed,
      timed-hold, vector, and direct-to proposals. Each proposal carries its target,
      estimate, tolerance, and early/on-time/late state. Approach and Supervisor can
      now move a non-imminent arrival one adjacent slot earlier or later through the
      Queue inspector or typed API, with signed revisions for both affected slots.
      Automatic sequence-change recommendations now appear ahead of routine Queue
      reviews and use the existing safe resequence command for approval.
- [x] Give Tower a runway-ready sequence that respects wake, runway occupancy,
      crossing queues, configuration transitions, and departure-release windows.
      Assisted Tower now offers only the next physically releasable line-up or
      takeoff in each conflicting-runway group after checking runway protection,
      crossing priority, weather, performance, wake release, and the departure
      envelope. Each proposal now also reports the authoritative planned departure
      release window and queue position, so a controller can distinguish “safe now”
      from “safe but metered.” Releasable line-up and takeoff proposals now carry
      their authoritative departure-release target and timing state. Tower and
      Supervisor can now make the same bounded adjacent change in the departure
      queue. The ten-second release freeze prevents last-second swaps, and sequence
      changes cannot grant clearance, reserve pavement, or alter aircraft motion.
      The same objective-aware bank evaluator now proposes one best adjacent
      departure change, while the normal Tower arbiter retains wake, occupancy,
      crossing, configuration, and release authority.
- [x] Explain every slot movement: weather, missed approach, gate pressure,
      runway closure, aircraft performance, wake, or downstream saturation.
      Every initial assignment and later revision now carries a schema-1
      attribution with category, cause code, source, and optional causal
      flight/runway. Queue, exact replay state, analytics, and CSV retain the
      same attribution; legacy entries derive it deterministically from their
      exact reason.
- [x] Keep Auto capable of guaranteed flow without requiring a human to manage
      the timeline. Seeded ORD Extreme Auto and Watch pass the enforceable
      sustained-flow gate; the eight-hour ORD audit plus the ATL storm, DFW snow,
      and HND evening matrix cover prolonged demand, adverse weather, sourced
      surfaces, and a schematic surface without a stopped-traffic state.

### Simulation and API

- [x] Define versioned meter points and constraints from each airport's terminal
      and surface programs. Existing deterministic meter slots remain the
      authority; procedure transitions and sourced surface crossings create
      versioned target points, while a deterministic capacity profile now derives
      airport-specific runway concurrency, surface-admission positions, stands,
      and terminal-procedure streams with source provenance and an explicit
      non-navigational disclosure. Live approach and surface admission plus the
      rolling forecast share this profile; it can only cap planning capacity and
      cannot grant a clearance, reservation, or movement authority. An all-hub
      and generated-airfield validator covers deterministic output, closures,
      bounds, structural attribution, and sourced-versus-schematic fidelity.
- [x] Replace one-interval demand pressure with rolling predicted demand and
      configurable capacity windows. The Queue outlook forecasts both sides of a
      Supervisor-selected 5-, 10-, or 15-minute horizon instead of counting only
      known queue entries; the selected window is retained in replay-safe flow state.
- [x] Model uncertainty from wind, procedure, runway condition, pilot response,
      taxi congestion, and gate readiness. Forecast confidence now carries bounded,
      direction-specific procedure, taxi, and gate factors alongside weather,
      wind, runway condition, pilot response, and downstream saturation without
      changing separation, reservations, meter slots, or movement commands.
- [x] Ensure schedule recommendations never move an aircraft directly; accepted
      actions must pass through the existing command and safety layers. Version 6
      flow snapshots expose advisory-only recommendations plus explicit Ignore and
      Recover responses. Recovery changes only the scheduler objective; aircraft
      remain behind the command and safety arbiters. Action-specific proposals are
      pure reads, carry `commandArbiterRequired`, and invoke the same typed speed,
      hold, vector, direct-to, line-up, or takeoff command used by a controller.
      Deterministic tests compare full state before and after proposal generation,
      then prove an authorized proposal can pass the ordinary command arbiter.
- [x] Record schedule revisions and causes in exact replay and local analytics.
      Meter entries retain bounded revision causes in replay-safe state, and exact
      frame fingerprints reject a changed slot value. Local analytics schema 4
      deduplicates active/archive history into bounded signed revision records,
      rolls up delay added and recovered by stable cause, displays those causes in
      the Data Lab, and exports a dedicated `flow-revisions` CSV dataset.

### Acceptance gate

- [x] A seeded ORD rush bank produces less holding fuel burn and fewer stop-start
      taxi holds than the 2.40 baseline without reducing separation. The
      executable 30-minute comparison records 351.456 kg versus 432.997 kg and
      20 versus 43 stop/restart cycles; both release and current runs report zero
      collision and runway-incursion diagnostics. The frozen baseline is tied to
      release commit `92a269c`, and `npm run test:traffic-flow` enforces it.
- [x] Three-hour Auto and Watch runs sustain arrivals and departures with bounded
      queues and no all-aircraft stopped state. August 9 ORD Extreme evidence:
      58 arrivals, 38 departures, 43 peak queue records, 684.7 seconds maximum
      individual stop, 40 seconds maximum without traffic motion, and zero
      collision, incursion, or unexplained-pause diagnostics in each mode.
- [x] Multi-airport adverse-weather Auto flow remains live without intervention.
      `npm run soak:flow-matrix` runs two modeled hours each at ATL, DFW, and
      HND, requires geometry-appropriate bidirectional throughput, rejects stale
      empty pipelines and stopped traffic, and produced 34, 42, and 7 completed
      operations respectively with no safety diagnostics.
- [x] Manual can ignore an advisory, recover the schedule, and understand the
      consequences without hidden score manipulation. The Queue inspector shows
      elapsed time, added queue delay, holding-fuel burn, and queue delta; the
      deterministic validator proves both commands leave shift metrics unchanged
      at command time, and the browser test exercises the visible Supervisor
      recovery workflow.
- [x] Fixed-step partitioning produces the same slots, commands, and outcomes.
      `npm run test:simulation` compares complete canonical fixed-step snapshots
      across five partitioned runs, including seeded ORD Rush. Those snapshots
      include `trafficFlow`, scripted-controller decisions, captured command/event
      history, aircraft state, and completed arrivals/departures, so a changed slot,
      command, or outcome fails the comparison. August 8 local run: 57,644 ticks,
      68 modeled minutes, 2,215 captured events, 10 ORD arrivals, and four ORD
      departures with zero deterministic safety failures.

## A3 — Digital clearances and flight data

### Outcome

Add a compact Data Comm/CPDLC-inspired clearance workflow for non-urgent
instructions while retaining voice-style immediate actions. FAA Data Comm allows
controllers and flight crews to exchange digital ATC information and load
reviewed instructions into flight systems; the game will use a simplified,
fictional, not-for-navigation message set. Reference: [FAA Data Comm](https://www.faa.gov/air_traffic/technology/DataComm).

### Current progress — August 10, 2026

The existing route-preview, issue, simulated readback, accept/reject, and
supersession workflow now has a compact, optional **Digital clearances** panel.
It is a versioned, read-only projection of that same authoritative workflow:
route previews appear as Draft, newly transmitted routes as Sent, pending pilot
readbacks as Delivered, accepted messages as Wilco, rejected messages as
Unable, and superseded/cancelled routes retain their result. It does not create
a parallel command executor or claim real Data Comm behavior.
Selecting a message focuses its authoritative flight, bridging the inbox to the
existing flight-strip route actions without silently issuing any instruction.
The projection now also exposes active structured vector, hold, speed, and
altitude instructions from the same navigation state, with typed parameters and
instruction-specific presentation. It remains read-only: issuing or cancelling
an instruction still goes through the normal command and safety arbiter.
Pushback, controller-assigned taxi routes, individual runway crossings,
runway entry / line-up, and takeoff now use stable issued-instruction records.
Unissued route requirements are no longer presented as if they were clearance
messages; each row exists only after the shared authority and safety arbiter
accepts the corresponding command.
Direct-to vectors now identify themselves as Direct-To messages, and active
controller handoffs project as Frequency messages with from/to, response timing,
and overdue state.
Every authoritative amendment for an active flight now appears as a stable
Revision message with its amendment kind, revision number, cause text, and
simulation timestamp. The newest-first History view makes the complete active-
flight revision sequence inspectable instead of projecting only the last item.
The selected-flight action card now keeps the operational limit in view: named
aircraft profile, wake class, modeled takeoff/landing runway requirements, and
the current frequency owner plus desk-authority state. It is a concise
controller aid, not an avionics configuration panel.
Controller evaluation now carries a read-only digital-clearance summary with
active, delivered, standby, Unable, and per-kind counts, so a human, replay
reviewer, or agent evaluator can measure message workload without receiving
shared free text as a command.
Route editing now offers an atomic route + altitude + speed package beside each
route-only preview. The simulator normalizes and validates every component,
forecasts the proposed route with the proposed vertical and speed profile, and
then stages the complete package behind the existing pilot-readback lifecycle.
No component becomes authoritative before an accepted readback. Authority
transfer, cancellation, or a newly detected separation conflict rejects the
whole package without leaving a partial route, altitude, or speed assignment.
The page-local control protocol exposes the same bounded preview and issue
commands, and the Digital Clearances panel projects one compound envelope rather
than misleading duplicate component messages.
Every newly issued route clearance now enters an authoritative **Sent** state
with a deterministic delivery target before becoming **Delivered** and awaiting
pilot readback. The fixed-step lifecycle records the actual delivery time,
rejects premature responses, accepts a valid response before the hard boundary,
and converts an unanswered or undelivered package to authoritative **Timed Out**
state at expiry. It emits typed delivery and timeout events and rejects every
late response. The route, altitude, and speed remain unchanged throughout
transport and response staging, and the controller may start a fresh revision.
Snapshot schema 45, exact replay frames, remote projections, the selected-flight
card, and the Data Comm panel preserve those distinctions.
The panel is now writable in Manual and Assisted modes. Its native, labeled
composer selects an eligible inbound and published route, accepts optional
altitude and speed constraints, previews the complete instruction through the
same authority and separation arbiter, and then sends or cancels the staged
package. Unsafe previews retain an explainable blocking reason; authority,
active-transmission, and replay states disable invalid controls instead of
offering commands that will silently fail. Desktop and phone-sized browser
passes verify bounded layout, touch targets, and Draft → Sent → Cancelled
operation while paused.
Action, History, and All views now separate controller attention from the live
operational record. Action retains Draft, Sent, Delivered, Standby, Unable, and Timed Out
messages; History retains acknowledged instructions, every revision, and all
terminal outcomes. Routine taxi/departure acknowledgements no longer bury the
default queue, while All exposes the complete projection.
The deterministic Manual-arrival lifecycle now exercises a genuinely mixed
clearance sequence: published-route preview, Sent, Delivered, and Approach
readback occur through Data Comm before immediate approach, handoff, landing,
and touchdown actions complete the same flight. A pending route transmission is
also proven to yield synchronously to an urgent go-around: cancellation is
recorded first, the go-around and emergency events follow in order, no route
component applies, and later pilot-response processing cannot revive it.
The Data Comm disclosure now moves keyboard focus directly into its close
control, publishes its expanded state, preserves the focused message by stable
command ID while live status updates rebuild the list, and returns focus to the
invoking toolbar control on close or Escape. A deterministic desktop browser
flow uses keyboard activation for view navigation, flight/route selection,
constraints, preview, send, live message inspection, and dismissal; screenshot
review confirms the retained focus remains visibly identifiable.
Tower now has a dedicated immediate **Reject takeoff** action in the normal
flight controls and typed protocol. It is available only after the roll begins
and below a modeled aircraft-specific V1. The shared arbiter refuses it at or
above V1, rechecks whether condition-adjusted braking can stop before rotation,
supersedes any pending route transmission, removes departure authority, and
advances the aircraft through continuous maximum-safe braking rather than an
instant stop. The aircraft remains level and on the runway, emits typed command
and stopped events, then holds the protected runway for recovery. Its structured
departure record exposes the terminal Unable outcome but never queues the urgent
instruction as Data Comm. Deterministic ORD validation covers the V1 boundary,
monotonic deceleration, runway distance consumed, no rotation/liftoff, stopping
projection, event order, runway-blocking state, and rejection of a mid-runway
re-clearance.
Operations analytics schema 6 now retains a bounded, typed Data Comm lifecycle
record across Sent, Delivered, Wilco, Unable, Timed Out, cancellation, and
supersession. The Operations Lab shows total, active, responded, and timed-out
message counts, and the dedicated `digital-clearances` CSV exposes separate
issue and response command IDs plus the authoritative simulation-domain event
chain, authority, route, typed parameters, delivery/response/expiry timing, and
response latency. Telemetry, exact replay, and the bounded remote projection
retain those identifiers so an operator can join a message to the command and
domain events that produced it. Shareable replay strips those correlation keys
alongside controller identity and free text. Reset and retention limits are
deterministic, while the local replay and live panel continue deriving their
richer presentation from authoritative flight state.
Digital-clearance envelope schema 5 now distinguishes actual staged Data Comm
packages from immediate voice/action instructions, inter-position coordination,
and passive operational records. Every message carries typed channel, selected-
desk access, response surface, and profile-level equipage status. The panel states
whether its current desk is authorized, must receive a handoff, can respond in
the composer, must use flight controls, or can only monitor the record. The same
bounded capability metadata survives analytics and the redacted remote-agent
projection; no alternate executor or hidden authority was added.
The aircraft catalog now makes its fictional equipage assumption explicit:
scheduled transports are Data Comm-capable while the C172 validation profile is
voice-only. Voice-only flights remain visible in the composer but cannot preview,
send, or accept a digital route package; the shared simulation arbiter directs
the controller to the existing direct-to or vector voice workflow instead.
Controller handoffs now carry the same deterministic evidence standard. A stable
coordination message survives offer, overdue, acceptance, rejection,
cancellation, contact, and completed ownership transfer without changing row
identity. The handoff state retains separate offer, response, and contact command
IDs plus the ordered domain-event chain; fixed-step replay, local analytics, and
the bounded remote projection preserve those fields while excluding the free-form
coordination reason.
Immediate airborne instructions now carry that evidence standard as well.
Heading, direct-to, altitude, speed, hold, go-around, and rejected-takeoff state
retain modeled phraseology, issuing authority, command or scripted-controller
identity, and deterministic simulation-domain event IDs. Go-around records both
the maneuver and emergency event in order, rejected takeoff records issue and
physical stop, and exact replay, analytics, and remote projections preserve the
bounded evidence without sharing phraseology. Entering a go-around also clears
stale speed and altitude restrictions so they cannot override the authoritative
missed-approach climb profile. Surface and departure instructions now retain the
same issuing authority, phraseology, command/scripted-controller identity, and
ordered domain-event evidence through completion or cancellation. Reissued
takeoff clearances receive distinct stable identities, while cancellation stays
attached to the original record. Control snapshot schema 46 and fixed-step
schema 18 carry the optional histories.

### Gameplay and UX

- [x] Add a clearance inbox/outbox with Draft, Sent, Delivered, Wilco, Unable,
      Standby, Superseded, Timed Out, and Cancelled states. A compact panel
      now exposes the full route-clearance lifecycle, including a real fixed-step
      Sent-to-Delivered transition; immediate surface instructions retain their
      accepted or cancelled voice/action lifecycle.
- [x] Build structured departure, route, altitude, speed, direct-to, hold,
      frequency, taxi, crossing, and revision messages from existing typed commands.
      Active vector, hold, speed, altitude, and route state now project as
      structured messages, as do issued pushback, departure, taxi, and crossing
      instructions; direct-to,
      and frequency state now use dedicated envelopes, and every active-flight plan
      amendment is exposed as a stable, timestamped Revision message. Version 5
      envelopes carry deterministic command IDs, causal references, expiry, and
      structured response timing plus typed channel, desk-access, response-mode,
      and aircraft-support limitations. Atomic route packages use one compound envelope
      with typed altitude/speed parameters; Action, History, and All views expose
      the complete projection without mixing routine acknowledgements into the
      default attention queue.
      Frequency coordination now retains one stable envelope through every
      handoff outcome and exposes the correct receiving or sending desk as the
      next authority.
- [x] Permit multi-part clearances only when the atomic preview says the complete
      instruction is safe and authorized. Route + altitude + speed packages use
      a pure candidate flight, the common terminal forecast, current Approach
      authority, and a second all-component validation at readback. Acceptance
      applies all components together; every failure path applies none.
- [x] Make urgent, immediate, go-around, stop, rejected-takeoff, and conflict
  instructions voice/action-first rather than queued behind digital messages.
  Go-around and hold actions already bypass the message queue; Tower can now
  cancel an active takeoff clearance while the aircraft is still lined up,
  through both the standard Manual controls and typed control API. Once the roll
  begins, the separate rejected-takeoff action is available below modeled V1;
  it applies condition-adjusted physical braking, stops before rotation, protects
  the occupied runway, and is refused when continuing takeoff is the safe modeled
  decision. Ground and Ramp now also have a dedicated STOP IMMEDIATELY action
  for a moving taxi aircraft. It applies weather-adjusted maximum safe surface
  braking without teleporting the aircraft to zero speed, records the issued,
  stopped, and released lifecycle as deterministic causal events, and presents
  the instruction as an urgent voice/action record rather than routine Data Comm.
  An urgent go-around is now explicitly tested to cancel a pending Data Comm route
  before executing, emit an ordered immediate-action event chain, and prevent
  stale later application. Heading, direct-to, altitude, speed, hold, go-around,
  and rejected-takeoff records now retain explicit voice phraseology and full
  command/event evidence. The deterministic soundscape now consumes the same
  accepted ground-stop, stop-release, takeoff-cancellation, rejected-takeoff,
  safety-hold, and conflict events as immediate radio actions. Station-aware
  ground, ramp, Tower, and Approach wording distinguishes surface stop/hold from
  airborne maintain-course responses; routine landing, taxi, takeoff, and
  go-around captions rotate without dropping the callsign. Five new local,
  project-original emergency radio clips give Ground, Ramp, and rejected-
  takeoff calls station-matched audio while preserving the offline/no-microphone
  boundary and the existing shipping budget.
- [x] Show aircraft capability and station/data-authority limitations without
      turning the interface into avionics configuration management. The selected
      flight panel now shows aircraft/wake class, required takeoff and landing
      runway length, current data authority, and whether the selected desk can
      issue a clearance or must obtain a transfer. Each message now also identifies
      Data Comm, voice/action, coordination, or record-only channel; current-desk
      authority; and the valid response surface. The aircraft catalog now records a
      visible profile-level Data Comm or voice-only assumption, the composer blocks
      voice-only route packages, and the shared arbiter rejects direct/API attempts
      with a usable vector/direct-to alternative. These are fictional game-level
      assumptions, not claims about an operator's installed avionics.
- [x] Provide concise keyboard flows and an Assisted composer that explains why
      a message is valid, delayed, or rejected. Clearance rows are keyboard
      focusable and move to the existing flight workflow; the advisor now offers a
      timed, published Approach hold when sequence pressure cannot be solved by
      speed alone, plus an early published-route direct-to or vector when a safe
      route correction is available. The labeled Data Comm form now composes
      route-only or atomic route/altitude/speed previews, exposes blocking reasons,
      and sends or cancels them through the authoritative command path.

### Simulation and API

- [x] Define one versioned message envelope containing authority, command IDs,
      causal event IDs, content fields, delivery timing, response, and expiry.
      Version 5 projections now include these fields plus typed channel, desk-access,
      response-mode, and aircraft-support limitations for every projected message;
      route messages distinguish delivery, expected response, hard expiry, and
      terminal response timing. Every route lifecycle transition now receives a
      deterministic simulation-domain event ID at creation, retains the complete
      causal chain across issue, delivery, and response, and records the issuing and
      responding command IDs separately. Telemetry, replay, analytics, and remote
      projections preserve that chain. The urgent ground-stop issue/brake/release
      lifecycle, staged controller handoffs, airborne immediate instructions, and
      rejected takeoff now use the same full command/event chain. Pushback, taxi,
      each runway crossing, runway entry / line-up, takeoff, takeoff cancellation,
      and re-clearance now retain individual stable lifecycle records instead of
      reconstructing messages from route progress and changing booleans.
- [x] Reuse staged pilot-response and route-readback behavior rather than adding
      a parallel command executor. Compound previews are route-clearance schema
      2 records and use the existing Sent, delivery, pending-readback,
      cancellation, supersession, event, and deterministic pilot-response path.
- [x] Enforce one current data authority and deterministic handoff behavior.
      A sent transmission or pending route readback now cancels with an explicit
      reason when the aircraft's frequency ownership transfers, and the receiving
      desk cannot accept a route issued by the prior authority. Route-only and
      atomic packages now also expire at a hard fixed-step deadline and reject
      stale direct or automatic responses. The only modeled Data Comm packages are
      route-only and atomic route/altitude/speed clearances; every other instruction
      is explicitly voice/action, coordination, or record-only. Coordination now
      retains deterministic offer, response, contact, completion, timeout,
      cancellation, and rejection evidence, and ownership transfers only on contact.
- [x] Include messages in replay, analytics, controller evaluation, and remote
      projections with free text excluded from shared exports. Replay and live
      views derive versioned messages from authoritative state; the remote
      projection carries bounded typed envelope fields without free-form detail,
      controller evaluation includes status/kind counts, and analytics schema 6
      retains bounded lifecycle records, separate issue/response commands, and
      authoritative domain-event causality plus a dedicated redacted CSV dataset.

### Acceptance gate

- [x] A normal Manual departure can complete pushback, coordination, taxi,
      any required crossing, line-up, and takeoff through the standard action
      workflow, without developer telemetry. Deterministic ORD sandbox validators
      now exercise that sequence and the complete arrival sequence (approach
      clearance, Approach→Tower coordination, landing clearance, and touchdown),
      including a published-route Data Comm delivery and readback before the
      immediate arrival actions.
- [x] A normal Manual departure and arrival can be completed through immediate
      controls without opening developer telemetry. The deterministic ORD
      arrival validator also completes one coherent mixed digital/immediate
      sequence from route transmission through touchdown.
- [x] Supersession, timeout, handoff, and rejection never apply stale commands.
      Sent transmissions and pending route readbacks are tested to cancel on a
      station transfer; route-only and atomic packages are tested to time out
      without partial application and to reject premature and late direct
      acceptance. Their lifecycle assertions now join issued and responding commands
      to the exact preview, issue, delivery, and response domain events. Staged
      handoff tests now also prove stable identity and ordered causality across offer,
      accept, contact, completion, cancellation, rejection, and overdue recovery;
      ownership transfers only after the accepted contact instruction.
- [x] Screen-reader and keyboard users can compose, inspect, send, and dismiss a
      clearance without losing focus. Data Comm exposes its expanded state,
      moves focus into the panel, restores the invoking control on close or
      Escape, and exposes every message as a named keyboard-focusable row. Its
      native labeled form supports route selection, constraints, preview, send,
      and cancel; stable command IDs preserve row focus across live status
      updates. The deterministic desktop browser flow completes that sequence
      without pointer activation and captures visible focus evidence.

## A4 — High-fidelity Atlanta

### Outcome

Promote KATL from schematic to the second sourced, recognizable hub using the
existing vector, surface-graph, context, asset-manifest, and acceptance pipeline.

### Current progress — August 7, 2026

Atlanta now has a committed FAA Airport Mapping vector asset, retrieved through
the same versioned importer and stable-asset manifest used for ORD. Its five
runways, source dimensions, centerlines, runway designations, terminal anchor,
aprons, buildings, hot spots, stopways, beacon, and wind indicators are present
in the source asset; the runtime now uses the sourced runway geometry and
airport anchor rather than the former hand-authored runway layout. The asset is
explicitly non-navigational. KATL also now has a sourced OSM centerline graph
with 1,934 nodes, 2,276 edges, 40 stands, ten runway-access points, two
terminals, and seven named concourses. The generic facility-profile importer
preserves ORD’s existing profile while giving Atlanta its Domestic/International
terminal and T/A–F gate conventions. Its verified OSM surroundings layer now
provides roads, rail, water, land use, and the airport boundary through the
same stable runtime asset pipeline as ORD. A more faithful terminal/apron
presentation remains open. Atlanta now also has East Parallel, West
Parallel, and East Instrument game configurations with explicit FAA terminal-
procedure disclosure; they model compatible runway ends and weather/capacity
choices but are not live ATC runway-use authorizations.

The common local Rush acceptance runner can now target a named hub with
`--airport=ATL`, rather than silently measuring ORD. A regression in the
airborne/surface envelope rule was also corrected: a surface aircraft's fixed
ground altitude could previously make a safely high arrival look like a
runway incursion. The rule now gates that alert on the airborne aircraft's
lower envelope, while retaining protection through flare and rollout. The
full deterministic collision suite (74 generated airport configurations) and
ATL Rush runs through one modeled hour now report zero collision alerts, zero
runway incursions, and zero unexplained pauses. ATL's multi-hour retained-heap
and sustained-flow acceptance remains open; it is not represented as complete
by the short-run safety result.

### Shared hub-flow track — August 8, 2026

The former stateless per-tick named-taxiway direction lock has been replaced by
a simulation-owned, checkpointable `SurfaceFlowPlanner`. It selects a
deterministic minimum-duration direction window for each shared taxiway section,
never reverses a physically occupied section, and reports the remaining window
as the ordinary aircraft hold reason. The planner is enforced by Auto and Watch;
Manual and Assisted retain controller authority while receiving the same hold
explanation. Its small deterministic validator covers window persistence,
safe reversal, occupancy protection, reservation projection, and checkpoint
restore.

This is only the strategic-section foundation, not a completed hub-flow claim.
An August 8 two-hour ATL Extreme Auto soak remained safety-clean (43 arrivals,
11 departures, zero collisions, incursions, and unexplained pauses), but still
failed the queue, retained-heap, and sustained-flow gates. The next required
work is downstream admission control for queued gate departures and terminal
arrivals before either enters a shared surface corridor; no hub is marked
complete until the longer acceptance gate passes.

The first admission-control slice now prevents Auto/Watch pushback into an
opposing live section and meters new arrivals before the finite taxi/ramp
network is saturated. It passed ATL Extreme Auto for four hours with 45
arrivals and 15 departures, no acceptance failures, and zero collision,
incursion, or unexplained-pause diagnostics. ORD remains open: a refined
physical-versus-strategic reservation boundary and bounded taxi-in/taxi-out
fairness improve the four-hour result to 31 arrivals and 17 departures, with
the same zero safety diagnostics, but it still reaches a graph-specific long
surface-wait state. ORD is therefore not represented as accepted by the ATL
result.

An additional terminal-corridor admission guard now prevents an arriving
aircraft from accepting a stand whose taxi-in terminal edges overlap a parked
or taxiing departure's outbound path. The guard uses cached graph resources,
not a second rendered trajectory, and the short ORD Extreme run is safety-clean
within the simulation-tick budget. A one-hour ORD run is still not accepted:
it reached 18 arrivals and 11 departures with zero collision/incursion/pause
diagnostics, but a small set of stalled aircraft repeatedly amended routes
around a projected conflict and pushed tick p95 to 53.49ms. The next required
work is bounded recovery for those blocked pairs, followed by a fresh sustained
ORD acceptance run.

### DFW parity track — August 7, 2026

KDFW is the first additional hub being brought through the same sourced-asset
path rather than receiving a second hand-authored schematic. Its committed FAA
Airport Mapping vector records seven runways, 706 taxiways, 61 aprons, 45
buildings, 14 stopways, a beacon, and 20 wind indicators. Its OSM surface graph
contains 1,266 nodes, 1,577 edges, 311 named taxiways, 40 aircraft-compatible
stands, five terminals/five concourses, 232 control points, 66 operational
zones, 12 sourced grade-separated edges, and 188 modeled runway-crossing edges.
The stable asset manifest now validates its vector, surface-source, and
surroundings assets alongside ORD and ATL. FAA-derived South Parallel, North
Parallel, and South Instrument configurations expose complete roles and
operating ends with an explicit non-navigational disclosure.

The shared safety arbiter now judges runway conflicts using the runway actually
occupied by each authoritative collision envelope—not a flight's stale assigned
runway. This prevents a taxiing aircraft from being released across the runway
a departure is using. A second shared recovery correction tries a verified,
pavement-only tug-back before a forward move in a multi-aircraft surface
deadlock. In a four-hour DFW Extreme Auto soak, the result was 51 arrivals and
33 departures with zero collision contacts, runway incursions, or unexplained
pauses; no all-stopped traffic state occurred. This is evidence for DFW's
surface safety and sustained flow, not a claim of navigation-grade real-world
operations. Visual recognizability, full workstation/mobile/replay review, and
the remaining named hubs are still open.

### Source and asset work

- [~] Record current official airport-diagram, FAA geometry, airport-facility,
  and appropriately licensed map/context sources with retrieval dates. FAA
  Airport Mapping vectors are committed with source metadata and a retrieval
  date; diagram, facility, and context source records remain open.
- [~] Import all runways, runway ends, displaced thresholds, stopways, major
  taxiways, crossings, hold-short points, hot spots, aprons, ramps, terminals,
  concourses, stands, cargo areas, deicing or hardstand areas, roads, rail, water,
  and the airport boundary that are supported by those sources. The FAA vector
  asset includes the runway, runway-end designation, stopway, taxiway polygon,
  apron, building, and hot-spot layers. A KATL OSM centerline graph now adds
  taxiways, crossings, hold-short/runway access, facilities, and stands;
  context normalization remains open.
- [~] Normalize route direction, width, aircraft compatibility, runway crossing,
  bridge/tunnel, ramp-control, and protected-zone metadata.
  The imported graph carries directional/width data, aircraft-compatible stands,
  runway crossings, ramp zones, and runway-access metadata; bridge/tunnel
  classification remains open.
- [~] Build realistic schematic runway-use configurations for common wind,
  visibility, and capacity conditions with clear source/limitation notes.
  East, west, and lower-visibility east-instrument configurations now exist with
  FAA source disclosure and an explicit non-operational limitation; additional
  capacity and special-use variants remain open.
- [~] Build carrier, terminal, gate, route, and time-of-day traffic programs that
  create recognizable Atlanta banks without claiming a live schedule.
  Atlanta now has deterministic hub banks, a Delta-weighted domestic and
  international program, representative published domestic, international, and
  cargo carriers, carrier-appropriate route pools, and sourced
  Domestic/International terminal preferences. Individual concourse/gate leases,
  airline schedules, and real-time service remain deliberately out of scope.
- [~] Situate terminal and ramp geometry correctly relative to the runways; no
  scenery or building may overlap operational pavement.
  Source terminal/concourse centers and apron-connected stands are now used;
  full rendered scenery/context intersection validation remains open.

### Acceptance gate

- [~] Every routed aircraft remains on authoritative pavement and every rendered
  pose matches collision sampling. A missing graph route now produces an
  authoritative no-route hold in both motion and collision envelopes instead
  of a fabricated gate-to-runway line, publishes an explainable automatic hold
  reason, and clears that reason when graph routing is restored; full
  multi-airport soak coverage remains open.
- [~] Every stand, edge, intersection, crossing, and runway protection zone is
  reachable, classified, and covered by route/property validation. The KATL
  validator now proves 800 stand-to-runway and runway-to-stand routes across all
  40 imported stands, five runways, and both ends; property/visual coverage
  remains open.
- [~] Extreme traffic drains through multiple nonconflicting surface movements
  rather than one airport-wide lock. ATL's first modeled hour now sustains
  arrivals and departures without a safety breach; its multi-hour
  retained-heap and sustained-flow acceptance remains open.
- [ ] The airport is visually recognizable from its runway/terminal relationship
      before labels are enabled.
- [ ] Auto, Assisted, Manual, Watch, weather, replay, radar, agent control, and
      mobile/desktop camera paths pass the same gate as ORD.

## A5 — Irregular operations and recovery

### Outcome

Turn operational disruption into an explainable recovery loop with meaningful
choices, not a sudden game-over or silent traffic deletion.

### Current progress — July 28, 2026

The authoritative recovery foundation is already present: Supervisor-controlled
runway, taxiway, and construction restrictions block affected pavement and
reroute compatible traffic; timed restrictions reopen deterministically. A
disabled aircraft creates a protected occupied-surface disruption, then Ground
or Supervisor can dispatch recovery. The recovery path has visible progress,
typed start/complete events, collision-safe towing, replay state, a no-fail
Sandbox path, and flight-panel status/action feedback. The deterministic
surface-disruption validator covers restriction authority, route exclusions,
rerouting, closure state, timed reopening, recovery dispatch, towing completion,
event history, and zero recovery collisions. The named inspection program now
has a deterministic operational lifecycle: an appropriately labeled airport
response unit is dispatched, reports on scene, performs its modeled inspection,
and then waits for an explicit Supervisor reopen action. It retains the common
restriction/reroute/protected-pavement boundary throughout; a separately
rendered, route-reserved emergency vehicle and calm-severity policy are still
open.

### Content

- [~] Add rejected takeoff, runway inspection, bird activity, medical priority,
  disabled aircraft, brake/tire concern, gate-equipment failure, maintenance tow,
  fuel return, passenger return, remote-stand use, and snow-removal programs.
  The first named-incident slice now provides Supervisor-controlled runway
  inspections, bird-activity checks, and taxiway FOD inspections. Each has a
  response-unit dispatch, on-scene inspection, explicit reopen readiness, and
  common restriction/reroute/protected-pavement/replay/remote-control path.
  Inspection incidents now also create a separately rendered, authoritative
  airfield-operations vehicle that graph-routes to the affected surface, uses
  the shared reservation and collision checks, is explicitly authorized only
  within the active closure, remains on scene through inspection, and releases
  when the Supervisor reopens the movement area. Its continuous red response
  beacon distinguishes it from the amber gate-service fleet even while it is
  stopped on scene. Rejected takeoff now has an immediate pre-V1 command,
  condition-adjusted continuous braking, typed lifecycle events, and a protected
  stopped-on-runway state; dispatch, inspection, evacuation, and runway-reopen
  recovery after the stop remain part of this milestone. The remaining named
  programs are still open.
- [~] Add airport emergency and inspection vehicles with explicit dispatch,
  route authority, staging areas, runway entry, task time, and release.
  The named inspection response vehicle now covers this path; emergency
  and medical-response fleets, dedicated depots, and return-to-staging
  choreography remain open.
- [~] Add diversion, cancellation, tow, gate swap, runway closure, reduced-rate
  configuration, and staged reopening recovery playbooks.
  Diversion, tow/recovery, runway/taxiway closure, reroute, and timed reopening
  are implemented. A Supervisor can now explicitly reassign an arrival to a
  compatible unoccupied gate before terminal routing is committed, using the
  same stand and pavement-conflict planner as automatic recovery; cancellation
  and named controller playbooks remain open.
- [x] Add calm severity controls: Off, Advisory Only, Operational, and Rare High
      Impact. The shared status broker filters ambient/operational/warning
      chatter, retains critical safety alerts, persists the choice in Watch
      presets, and defaults Watch to Rare High Impact.

### Acceptance gate

- [ ] Every event has a precondition, deterministic seed, visible cause, legal
      recovery path, timeout policy, replay record, and no-fail Sandbox variant.
- [~] Emergency vehicles never cross a protected runway without explicit shared
  authority and never collide with aircraft or service traffic. The seeded
  named-inspection unit is checked for explicit closure-bound authority,
  route legality, and zero service/aircraft conflicts; broader emergency
  fleet coverage remains open.
- [ ] The airport returns to sustainable flow after each seeded event without a
      reset or teleport.

## A6 — Deeper airport life

### Outcome

Make gates, ramps, terminals, and surrounding infrastructure feel continuously
inhabited while preserving operational legibility and browser budgets.

### Current progress — July 28, 2026

The live turnaround already has authoritative baggage, fuel, catering, cleaning,
maintenance, cargo-loader, passenger-bus, and pushback-tug activity. Each
vehicle has a depot, stand-side path, graph route, reservation claims, service
status, route-violation checks, and a visible pooled model; terminal-only work
remains explicitly vehicle-free. Independent tasks may proceed concurrently,
but pushback waits for both required turnaround tasks and physical stand-lane
clearance. The validator covers complete routes, shared reservation conflicts,
parallel operations, protected-movement exclusion, lifecycle events, and
post-service pushback gating with zero observed service-vehicle conflicts.
The pooled models now also present distinct fuel, baggage, cargo, catering,
cleaning, maintenance, and passenger-service silhouettes, with small task rigs
shown only while the corresponding vehicle is servicing an aircraft.
An additional single instanced gate-light layer now reflects authoritative stand
state: available, occupied, and actively serviced stands are distinct, with
lighting that naturally strengthens at night without adding moving entities.

### Content and assets

- [~] Add visually distinct baggage tractors/carts, belt loaders, catering,
  potable-water, lavatory, fuel, maintenance, crew, passenger-bus, jet-bridge,
  towbar, and towbarless-tug families where operationally relevant.
  Fuel, baggage, cargo, catering, cleaning, maintenance, and passenger vehicles
  now have distinct low-poly silhouettes and servicing poses; remaining service
  families, jet bridges, and towing variants are open.
- [~] Give each service an authoritative staging point, route, aircraft side,
  safety envelope, dependency, duration, and completion state.
  Vehicle-backed services satisfy this; terminal-only services and additional
  service families need further choreography.
- [~] Add terminal train, employee shuttle, perimeter road, highway, parking,
  gate-lighting, and restrained landside traffic as nonblocking ambient systems.
  Terminal access now has a compact, instanced curbside/parking program with
  slow landside shuttles, canopies, parked vehicles, and a presentation-only
  terminal train at each terminal. It is rendered outside the aircraft surface
  graph, so it cannot create a runway crossing or affect taxi reservations. A
  sourced terminal train alignment, a real perimeter-road network, and broader
  background-worker traffic remain open.
- [~] Add jet-bridge docking, door state, baggage transfer, fuel connection, and
  service choreography without requiring micromanagement in Auto or Watch.
  Baggage/fuel/service choreography and non-micromanaged Auto/Watch behavior
  exist. Passenger-facility stands now drive an instanced visual jet-bridge
  layer that docks only to resting aircraft, presents its boarding door during
  a passenger turnaround, and retracts during pushback; richer per-service
  visual choreography remains open.
- [ ] Use stable asset-manifest keys, pooled/instanced repetitions, high/low LOD,
      and documented license/provenance. Prefer optimized GLB/glTF for authored
      assets; retain procedural assets where they are clearer and cheaper.

### Acceptance gate

- [~] No vehicle takes a shortcut across grass, runway, building, stand envelope,
  or another service's protected work zone.
  Current vehicle routing, reservations, and validator cover protected movement,
  stand-lane, and route conflicts; exhaustive building/grass visual checks remain
  open.
- [ ] Service choreography cannot deadlock aircraft release; the queue inspector
      names the exact dependency and available recovery.
- [ ] Optional detail remains disableable and meets existing draw-call, triangle,
      memory, entity, and frame-time budgets on all release viewports.

## A7 — Long-form Watch and ASMR direction

### Outcome

Make the airport enjoyable for an uninterrupted hour without repetitive camera,
radio, audio, notification, or traffic patterns.

### Experience

- [~] Add named ambient programs such as Dawn Bank, Midday Flow, Summer Storm,
  Snow Recovery, Quiet Overnight, Cargo Push, and International Evening.
  A deterministic seven-program catalog now applies serialized local time,
  density, flow objective, season, weather, wind, and safe hazard posture
  through the typed control API. The compact Watch scene selector now uses
  that same command path. A local Watch preset now saves only those
  presentation preferences; saved custom ambient programs remain open.
- [~] Expand the fictional offline radio library with more controller/pilot
  timbres, airports, stations, operations, and silence budgets; disclose every
  synthetic or processed source. The local CC0 library now carries 22
  deterministic fictional radio clips across Approach, Tower, Ground, and
  Ramp with eight abstract voice identities, station-matched selection, and
  a verified four-hour cooldown/silence budget. Airport-specific phrase
  packs and richer non-voice variation remain open.
- [~] Add optional ATIS-style captions/audio derived from modeled weather,
  runway configuration, field condition, and active notices. The ATIS button
  now produces a longer, fictional modeled caption and a radio cue from
  authoritative state; richer offline spoken-voice assets remain open.
- [~] Give the camera director shot families, composition rules, no-repeat
  windows, target continuity, weather-aware visibility, and a one-click release.
  The existing director now yields immediately to manual camera input, favors
  active landing/takeoff/approach operations, maintains continuity when a fresh
  subject is unavailable, and enforces a deterministic 90-second no-repeat
  window. It now applies actual close runway, departure, alternating arrival,
  and surface-follow focus scales, and de-emphasizes obscured long-final shots
  in low visibility. Wider camera-angle families remain open.
- [x] Add separate Ambience, Aircraft, Weather, Radio, Terminal/Landside, and UI
      buses plus a true zero-alert Sleep/Background preset.
- [x] Let users save a local Watch preset without saving live identities,
      credentials, or hidden operational data.

### Acceptance gate

- [ ] A four-hour local run stays collision-free, retains bounded queues and
      memory, and never enters an all-stopped unexplained state.
- [ ] No exact camera shot, radio exchange, or high-salience cue repeats inside
      its documented minimum window.
- [ ] Disabling weather, wind, radio, service vehicles, or airport life also
      disables the corresponding sound and presentation layers.
      Weather/wind state already controls its generated and offline layers, radio
      has an independent cue/caption toggle, and hiding service vehicles now also
      suppresses only their service/ramp audio cues. Airport-life now owns dedicated
      terminal-access and gate-activity render layers, both suppressed by its
      toggle, plus the terminal-room and parked-aircraft APU beds; full end-to-end
      acceptance evidence remains open.

## A8 — Shared human and agent shifts

### Outcome

Make a session playable by any mixture of people, deterministic controllers, and
external agents while keeping authority, workload, decisions, and safety visible.

### Current progress — July 28, 2026

The local remote gateway already provides authenticated host, controller,
spectator, and administrator roles; single-station claims; bounded/redacted state
projection; typed command forwarding through the same safety arbiter; rate limits;
heartbeats; reconnect tokens; emergency stop; and an audited, consent-based
station-transfer protocol. The compact controller desk now exposes that transfer
protocol directly: a current controller can offer its claimed station only to an
idle controller, and the recipient must explicitly accept or decline within the
15-second gateway window. The gateway's remote-control validator covers claim,
handoff, rejection, reconnect, timeout, emergency, audit, and redaction paths.
This is a usable local shared-shift foundation, not yet a hosted multiplayer
service or a full workload/debrief experience.

### Roles and control

- [~] Add a compact session lobby for Approach, Tower, Ground, Ramp, Supervisor,
  and Spectator claims with explicit host consent. The local desk exposes
  role/station claims and consent-based controller handoffs; a hosted lobby
  and host admission UI remain open.
- [~] Show current controller, actor type, connectivity, workload, command queue,
  handoff state, and takeover readiness for every station. The desk shows
  claimant, connection, station availability, and active handoff state;
  workload, queues, and takeover readiness remain open.
- [~] Give agents the same bounded station view that a human workstation receives;
  do not expose hidden future state or unrestricted full snapshots by default.
  The gateway now projects bounded/redacted flight, queue, clearance, surface
  track, service-vehicle, and advisory-geometry state; formal station-specific
  view contracts remain open.
- [~] Add typed subscription filters, command batching limits, backpressure,
  heartbeat, reconnect, and emergency-stop behavior to the remote protocol.
  The gateway now supports bounded state/event/session topic subscriptions,
  alongside command limits, heartbeat/reconnect, audited handoff, and
  emergency-stop paths; batching/backpressure policy remains open.
- [~] Preserve deterministic local automation whenever a client disconnects,
  times out, releases authority, or fails closed. Release, timeout, and
  reconnect paths are covered by the gateway validation; simulation-side
  handback and exact replay evidence remain open.
- [~] Add cooperative shift debriefs that distinguish safety outcomes, flow,
  fuel, workload, coordination, and command quality without public leaderboards.
  The optional gateway controller desk now presents a collapsed, bounded,
  read-only shared-shift review sourced from the host evaluation projection;
  it includes safety, completed flow/delay, holding fuel, late handoffs,
  aggregate command results, and station command-quality rows. A durable
  local end-of-shift export and formal multi-controller debrief flow remain
  open.

### Acceptance gate

- [ ] Two humans and three agents can operate separate stations through a
      scripted hub bank with no double authority, dropped urgent action, or safety
      bypass.
- [ ] Every accepted, rejected, deferred, timed-out, transferred, and emergency
      command has a structured reason and causal record.
- [ ] A remote disconnect during an active clearance produces a deterministic,
      safe handback and exact replay.

## A9 — Engineering and release health

### Architecture boundaries

- [ ] Keep simulation state serializable and independent from Three.js objects,
      DOM elements, AudioNodes, network sockets, and browser timing.
- [ ] Keep input actions centralized; physical keyboard, pointer, touch, gamepad,
      UI, agent, and remote messages map to typed actions or commands.
- [ ] Move computationally expensive prediction, analytics, or traffic planning
      behind a deterministic Worker boundary only after profiling identifies a real
      main-thread bottleneck.
- [ ] Consider WASM only for a measured hot loop with a stable data boundary and
      a benchmark proving meaningful benefit over optimized TypeScript.
      The current local Extreme-ORD runtime validator records a 2.939 ms p95
      simulation tick with zero collision, incursion, or unexplained-pause events.
      There is no measured TypeScript hot loop that justifies WASM. The outstanding
      performance investigation is initial browser delivery: the airport entry
      bundle still contains static imported hub-data assets and should be split only
      through an async configuration boundary that preserves deterministic replay.
      A browser-safe per-airport async asset loader now has exact equivalence
      coverage against the synchronous ATL, DFW, and ORD manifests and cloned
      surface graphs; the browser configuration factory has not yet been migrated
      to consume it, so startup delivery remains open.
- [ ] Split coordinators when ownership becomes ambiguous; do not split files
      solely to satisfy a line-count target.
      The stand-activity light lifecycle is now isolated in a dedicated renderer
      module rather than expanding the world coordinator. Terminal gate and
      landside-access runtimes now follow the same ownership boundary; further
      splits should follow the same ownership boundary.

### Performance targets

- [ ] Desktop 1440×900 high detail: stable frame pacing with 95th-percentile
      active frame time at or below 22 ms in the designated busy release scenario.
- [ ] Short laptop 1024×600: 95th-percentile active frame time at or below 28 ms
      with every primary control reachable.
- [ ] Mobile 390×844 low detail: 95th-percentile active frame time at or below
      34 ms in supported Watch/Assisted interactions.
- [ ] No simulation catch-up burst, asset load, panel update, or garbage
      collection pause may visibly freeze aircraft motion after warm-up.
      The renderer now starts high-detail scenes at a restrained 1.25× pixel-ratio
      cap instead of 1.5×, and the existing adaptive quality governor enters its
      shadow-free 1× fallback after two sustained overloaded observations (with a
      60-frame measurement floor). This keeps simulation authority, aircraft
      detail, and safety rules intact while reducing avoidable GPU work. Local
      TypeScript, lint, production-build, and Extreme ORD runtime checks passed on
      August 8; device-specific visual-frame pacing and the required async hub-data
      split remain open.
- [ ] Pools, histories, alerts, analytics, audio voices, labels, and remote queues
      remain explicitly bounded during a four-hour run.
      The local soak runner now samples retained heap at an explicit forced-GC
      low-water mark when invoked through `npm run soak:runtime`, and reports the
      measurement mode in every checkpoint and final report. This avoids treating
      V8 young-space timing as a retained-memory leak while keeping the 32 MiB/hour
      budget intact. An August 9 ORD Extreme Auto four-hour check passed with a
      -9.5 MiB/hour retained-heap slope, 68 arrivals, 50 departures, and zero
      collision, incursion, or unexplained-pause diagnostics. Failed alternate-gate
      and surface-yield feasibility searches now use bounded negative-result retry
      caches, and indexed typed-array route workspaces avoid repeated Map churn;
      the late-run simulation p95 fell from 22.381 ms to 2.108 ms without changing
      the deterministic traffic totals. Browser/device frame-pacing proof remains
      open.

### Release gate

- [ ] Deterministic rules, operations, fixed-step, trajectory, collision,
      performance, replay, migration, accessibility, and focused browser tests pass
      locally before a release commit.
- [ ] Production assets use relative URLs and both root and `/airport-auto/`
      layouts build from the same output.
      The duplicated public/bundled stable manifests now carry the actual hashes
      of the committed ORD vector and imported surface assets; the full asset
      validator verifies all ten files and their source/license records. The two-
      base-path browser proof remains part of the release gate.
- [ ] Deployment remains additive and never removes the surrounding menagerie.
- [ ] Public verification, when authorized, checks the airport page and menagerie
      root without triggering redundant build/test workflows.

## Shared contract with the combat product

The products may share infrastructure, but not mutable simulation state.

### Shared by design

- Fixed-step harness and interpolation conventions.
- Input action vocabulary and device preference storage.
- Camera gestures, accessible DOM patterns, reduced motion, and performance HUD.
- Asset manifest, GLB/glTF policy, source/license records, LOD, pooling, and
  disposal utilities.
- Audio buses, replay primitives, schema migration patterns, typed command
  results, and authenticated remote transport.
- A common launcher and deliberate navigation between product pages.

### Deliberately separate

- Civilian aircraft and fighter mission state.
- Airport separation/clearance rules and combat engagement rules.
- Civilian agents and combat agents.
- Replays, scores, saves, missions, and analytics unless explicitly imported
  through a versioned, read-only conversion.
- Weapons, damage, hostile contacts, and combat audio from every airport mode.

## Explicitly deferred or excluded

- Navigation-grade airport data or claims of operational fidelity.
- Automatically applying live weather, NOTAM, or schedule data without review.
- Mandatory accounts, cloud saves, public leaderboards, or monetized progression.
- Account-backed classroom administration until moderation, identity, retention,
  and exact-replay verification are justified.
- Modeling every airport before KATL passes the same fidelity gate as ORD.
- Photorealistic terminals at the expense of movement correctness or browser
  performance.
- Runtime-generated voice that requires a player API key or network connection.
- Merging combat into civilian traffic merely because the renderer is shared.

## Recommended implementation order

1. A1 Surface safety picture.
2. A2 Time-based flow management.
3. A3 Digital clearances.
4. A4 High-fidelity Atlanta.
5. A5 Irregular operations and recovery.
6. A6 Deeper airport life.
7. A7 Long-form Watch direction.
8. A8 Shared human/agent shifts.
9. A9 engineering work continuously, driven by profiling and each milestone's
   acceptance evidence.

The ordering is intentional: awareness and strategic flow should mature before
the simulation adds another high-density hub or more visual entities.

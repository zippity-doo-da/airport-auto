# Airport Auto Goals

Status: active product and implementation ledger  
Last reconciled: July 28, 2026  
Baseline: Airport Auto 2.40 plus the additive Research Annex navigation  
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

### Current progress — July 29, 2026

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
The deterministic safety validator asserts both conditions. Reservations,
acknowledgement, Supervisor/Watch treatment, responsive visual QA, status-light
interaction, and predictive incursion detection remain open below.
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

### Gameplay and UX

- [~] Add a resizable surface-safety panel separate from the existing general
  radar inset. It is desktop-resizable and bounded on compact screens, and now
  includes a compact authoritative surface diagram; advanced controls remain
  open.
- [~] Render aircraft, tugs, authorized vehicles, runway occupancy, hold-short
      state, crossing authority, and approach/departure protection zones.
  The optional **Runway protection** map layer now shades each authoritative
  protected runway and its hold-short points: red for occupied pavement, blue
  for a currently authorized crossing, and amber for a waiting hold. The
  dedicated compact diagram now shows those authoritative runway states with
  aircraft and service-vehicle symbols; route/crossing intent and
  approach/departure corridors remain open.
- [x] Show track identity, movement state, route intent, last clearance, and
      surveillance freshness without exposing hidden future simulation state.
- [~] Add configurable look-ahead conflict arcs with a quiet advisory tier and a
      visually distinct immediate warning tier. The compact diagram now offers
      15-, 30-, and 60-second horizons and draws only active forecast-backed
      track arcs: dashed blue for advisory, solid amber for warning, and red
      for critical. Full route/crossing geometry remains open.
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
- [~] Preserve keyboard navigation, screen-reader summaries, color-vision-safe
  semantics, reduced motion, and 44-pixel touch targets. Track rows and
  compact-screen controls now meet the touch baseline; the broader audit
  remains open.

### Simulation and API

- [ ] Define one versioned `SurfaceTrack` projection sourced from authoritative
      entities and reservations.
- [ ] Define one `SurfaceSafetyAdvisory` type with severity, geometry, causal
      entities, first-seen time, predicted time, acknowledgement, and resolution.
- [~] Route every alert through the existing status broker, replay, analytics,
  and remote redaction policy. New active advisories now use the
  dwell-based status broker without repeated-message churn; replay,
  analytics, and remote-redaction integration remain open.
- [x] Expose display configuration and acknowledgement through typed commands;
      acknowledgement must never suppress physical protection.

### Acceptance gate

- [ ] Zero false disagreement between 3D pose, graph occupancy, track position,
      and collision diagnostics across deterministic crossings and pushbacks.
- [ ] Every seeded runway-incursion test produces an advisory before protected
      envelopes overlap; safe parallel operations do not produce a critical alert.
- [ ] The panel remains usable at 1440×900, 1024×600, and 390×844 without hiding
      the Controls or Combat transitions.
- [ ] Enabling the panel remains within the established renderer/DOM update
      budgets and does not regenerate the full target list every frame.

## A2 — Time-based flow management

### Outcome

Give Approach and Supervisor a strategic arrival/departure scheduler that assigns
target times at meter fixes, runway thresholds, runway crossings, and departure
release points. The intent is to absorb delay efficiently before aircraft reach
the final or taxi queue. Reference: [FAA time-based flow management](https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap18_section_25.html).

### Current progress — July 28, 2026

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

The Queue inspector now adds a bounded five-minute directional capacity
outlook. It reports planned releases against current demand, delayed and
revised slots, a confidence tier, and the reason for that confidence. The
outlook is derived from the same authoritative slots and is presentation-only;
it cannot move, release, or cancel an aircraft.

ORD now seeds a bounded ten-aircraft opening bank: two independently reserved
taxi-out departures, a live turn, additional gate/ramp departures, and the
normal three-aircraft approach picture. Departure starters are staged without
consuming approach capacity, then pass through the same stand, meter, runway,
wake, and surface-reservation rules as every later flight.

Inbound demand now applies bounded queue-pressure relief to its next-demand
clock once the holding buffer is more than half full. This keeps the rolling
stream alive while reducing self-inflicted bursts; it does not alter separation,
runway, gate, or surface safety rules. Rush, fixed-step, trajectory, and
long-session flow validators continue to pass with the relief active.

### Gameplay and UX

- [~] Add a timeline showing demand, runway capacity, target crossing times,
  tolerance windows, expected delay, and confidence. The Queue inspector
  now shows active arrival/departure slots, delay, a five-minute planned-slot
  outlook, and bounded confidence; runway-capacity attribution, tolerance
  windows, and downstream uncertainty remain open.
- [~] Let Supervisor choose Balanced, Minimum Holding, Minimum Taxi Delay,
  Weather Recovery, or Watch/Calm scheduling objectives. The Queue
  inspector and typed control API now select authoritative pacing profiles;
  forecast-based recommendation policy remains open.
- [~] Give Approach advisories for speed, vector, hold, direct-to, and sequence
      changes that satisfy target times through existing legal commands. Assisted
      mode now proposes a legal speed reduction for a trailing same-runway
      approach before final; vector, hold, and direct-to metering proposals
      remain open.
- [~] Give Tower a runway-ready sequence that respects wake, runway occupancy,
      crossing queues, configuration transitions, and departure-release windows.
Assisted Tower now offers only the next physically releasable line-up or
takeoff in each conflicting-runway group after checking runway protection,
crossing priority, weather, performance, wake release, and the departure
envelope. Each proposal now also reports the authoritative planned departure
release window and queue position, so a controller can distinguish “safe now”
from “safe but metered.” Forecast-based release recommendations remain open.
- [~] Explain every slot movement: weather, missed approach, gate pressure,
      runway closure, aircraft performance, wake, or downstream saturation.
  The queue meter now labels the latest authoritative reason with a stable
  weather/runway/wake/gate/performance/taxi/demand/schedule category; fuller
  procedure and downstream-cause coverage remains open.
- [ ] Keep Auto capable of guaranteed flow without requiring a human to manage
      the timeline.

### Simulation and API

- [~] Define versioned meter points and constraints from each airport's terminal
      and surface programs. Existing deterministic meter slots remain the
      authority; the outlook now projects release cadence beyond queued entries.
- [~] Replace one-interval demand pressure with rolling predicted demand and
      configurable capacity windows. The five-minute outlook now forecasts both
      sides of the horizon instead of counting only known queue entries.
- [~] Model uncertainty from wind, procedure, runway condition, pilot response,
      taxi congestion, and gate readiness. Forecast confidence carries bounded
      weather, wind, runway-condition, and response factors without changing
      separation, reservations, or movement commands.
- [ ] Ensure schedule recommendations never move an aircraft directly; accepted
      actions must pass through the existing command and safety layers.
- [~] Record schedule revisions and causes in exact replay and local analytics.
  Meter entries now retain bounded revision causes in replay-safe state and
  expose the latest cause in Queue inspector; dedicated analytics rollups
  remain open.

### Acceptance gate

- [ ] A seeded ORD rush bank produces less holding fuel burn and fewer stop-start
      taxi holds than the 2.40 baseline without reducing separation.
- [ ] Three-hour Auto and Watch runs sustain arrivals and departures with bounded
      queues and no all-aircraft stopped state.
- [ ] Manual can ignore an advisory, recover the schedule, and understand the
      consequences without hidden score manipulation.
- [ ] Fixed-step partitioning produces the same slots, commands, and outcomes.

## A3 — Digital clearances and flight data

### Outcome

Add a compact Data Comm/CPDLC-inspired clearance workflow for non-urgent
instructions while retaining voice-style immediate actions. FAA Data Comm allows
controllers and flight crews to exchange digital ATC information and load
reviewed instructions into flight systems; the game will use a simplified,
fictional, not-for-navigation message set. Reference: [FAA Data Comm](https://www.faa.gov/air_traffic/technology/DataComm).

### Current progress — July 28, 2026

The existing route-preview, issue, simulated readback, accept/reject, and
supersession workflow now has a compact, optional **Digital clearances** panel.
It is a versioned, read-only projection of that same authoritative workflow:
route previews appear as Draft, pending pilot readbacks as Delivered, accepted
messages as Wilco, rejected messages as Unable, and superseded/cancelled routes
retain their result. It does not create a parallel command executor or claim
real Data Comm behavior.
Selecting a message focuses its authoritative flight, bridging the inbox to the
existing flight-strip route actions without silently issuing any instruction.
The projection now also exposes active structured vector, hold, speed, and
altitude instructions from the same navigation state, with typed parameters and
instruction-specific presentation. It remains read-only: issuing or cancelling
an instruction still goes through the normal command and safety arbiter.
Departure runway status, assigned taxi route, and pending/cleared runway
crossings now use the same structured message envelope; a pending crossing is
shown as Standby rather than as an implicit clearance.
Direct-to vectors now identify themselves as Direct-To messages, and active
controller handoffs project as Frequency messages with from/to, response timing,
and overdue state.
The latest authoritative flight-plan amendment also appears as a Revision
message with its amendment kind, revision number, and cause text; the full
bounded amendment history remains part of the flight-plan/replay state.
Controller evaluation now carries a read-only digital-clearance summary with
active, delivered, standby, Unable, and per-kind counts, so a human, replay
reviewer, or agent evaluator can measure message workload without receiving
shared free text as a command.

### Gameplay and UX

- [~] Add a clearance inbox/outbox with Draft, Sent, Delivered, Wilco, Unable,
  Standby, Superseded, Timed Out, and Cancelled states. A compact panel
  now exposes route-clearance Draft, Delivered, Wilco, Unable, Superseded,
  and Cancelled states; additional message categories and unmodeled states
  remain open.
- [~] Build structured departure, route, altitude, speed, direct-to, hold,
      frequency, taxi, crossing, and revision messages from existing typed commands.
      Active vector, hold, speed, altitude, and route state now project as
      structured messages, as do departure, taxi, and crossing state; direct-to,
      and frequency state now use dedicated envelopes, and the latest plan
      amendment is exposed as a Revision message. Version 2 envelopes now carry
      deterministic command IDs, causal references, expiry, and structured
      response timing; full revision-history UI and remaining message families
      remain open.
- [ ] Permit multi-part clearances only when the atomic preview says the complete
      instruction is safe and authorized.
- [ ] Make urgent, immediate, go-around, stop, rejected-takeoff, and conflict
      instructions voice/action-first rather than queued behind digital messages.
- [ ] Show aircraft capability and station/data-authority limitations without
      turning the interface into avionics configuration management.
- [~] Provide concise keyboard flows and an Assisted composer that explains why
  a message is valid, delayed, or rejected. Clearance rows are keyboard
  focusable and move to the existing flight workflow; the Assisted composer
  remains open.

### Simulation and API

- [~] Define one versioned message envelope containing authority, command IDs,
  causal event IDs, content fields, delivery timing, response, and expiry.
  Version 2 projections now include these fields for every projected message;
  causal references are deterministic flight/clearance identifiers until the
  full event-history export is added.
- [ ] Reuse staged pilot-response and route-readback behavior rather than adding
      a parallel command executor.
- [~] Enforce one current data authority and deterministic handoff behavior.
      A pending route readback now cancels with an explicit reason when the
      aircraft's frequency ownership transfers, and the receiving desk cannot
      accept a route issued by the prior authority. Other clearance kinds and
      full timeout/coordination coverage remain open.
- [~] Include messages in replay, analytics, controller evaluation, and remote
      projections with free text excluded from shared exports. Replay frames
      and remote snapshots derive versioned messages from authoritative state;
      the remote projection now carries bounded typed envelope fields without
      free-form detail, and controller evaluation includes status/kind counts.
      Dedicated analytics rollups and full redacted replay envelopes remain
      open.

### Acceptance gate

- [~] A normal Manual departure can complete pushback, coordination, taxi,
  any required crossing, line-up, and takeoff through the standard action
  workflow, without developer telemetry. Deterministic ORD sandbox validators
  now exercise that sequence and the complete arrival sequence (approach
  clearance, Approach→Tower coordination, landing clearance, and touchdown);
  the mixed digital-clearance path remains open.
- [~] A normal Manual departure and arrival can be completed through immediate
  controls without opening developer telemetry. A coherent mixed
  digital/immediate clearance sequence remains open.
- [~] Supersession, timeout, handoff, and rejection never apply stale commands.
      Pending route readbacks are now tested to cancel on a station transfer;
      timeout and non-route message coverage remain open.
- [~] Screen-reader and keyboard users can compose, inspect, send, and dismiss a
      clearance without losing flight-strip focus. Data Comm now restores the
      invoking control on close or Escape and exposes every message as a named,
      keyboard-focusable row; compose/send/dismiss actions still finish through
      the standard flight-strip workflow.

## A4 — High-fidelity Atlanta

### Outcome

Promote KATL from schematic to the second sourced, recognizable hub using the
existing vector, surface-graph, context, asset-manifest, and acceptance pipeline.

### Current progress — July 28, 2026

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

- [ ] Every routed aircraft remains on authoritative pavement and every rendered
      pose matches collision sampling.
- [~] Every stand, edge, intersection, crossing, and runway protection zone is
  reachable, classified, and covered by route/property validation. The KATL
  validator now proves 800 stand-to-runway and runway-to-stand routes across all
  40 imported stands, five runways, and both ends; property/visual coverage
  remains open.
- [ ] Extreme traffic drains through multiple nonconflicting surface movements
      rather than one airport-wide lock.
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
  stopped on scene; the remaining named programs are still open.
- [~] Add airport emergency and inspection vehicles with explicit dispatch,
      route authority, staging areas, runway entry, task time, and release.
      The named inspection response vehicle now covers this path; emergency
      and medical-response fleets, dedicated depots, and return-to-staging
      choreography remain open.
- [~] Add diversion, cancellation, tow, gate swap, runway closure, reduced-rate
  configuration, and staged reopening recovery playbooks.
  Diversion, tow/recovery, runway/taxiway closure, reroute, and timed reopening
  are implemented; cancellation, gate-swap, and named controller playbooks
  remain open.
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
  slow landside shuttles, canopies, and parked vehicles at each terminal. It is
  rendered outside the aircraft surface graph, so it cannot create a runway
  crossing or affect taxi reservations. A sourced terminal train, a real
  perimeter-road network, and broader background-worker traffic remain open.
- [~] Add jet-bridge docking, door state, baggage transfer, fuel connection, and
  service choreography without requiring micromanagement in Auto or Watch.
  Baggage/fuel/service choreography and non-micromanaged Auto/Watch behavior
  exist; explicit jet-bridge and door presentation remain open.
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
  suppresses only their service/ramp audio cues. Airport-life presentation still
  needs a dedicated render/audio layer before this gate can be closed.

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
      The gateway already projects a bounded/redacted operations view; formal
      station-specific view contracts remain open.
- [~] Add typed subscription filters, command batching limits, backpressure,
      heartbeat, reconnect, and emergency-stop behavior to the remote protocol.
      The gateway has command limits, heartbeat/reconnect, audited handoff, and
      emergency-stop paths; subscription filters and batching/backpressure policy
      remain open.
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
- [ ] Split coordinators when ownership becomes ambiguous; do not split files
      solely to satisfy a line-count target.
  The stand-activity light lifecycle is now isolated in a dedicated renderer
  module rather than expanding the world coordinator; further splits should
  follow the same ownership boundary.

### Performance targets

- [ ] Desktop 1440×900 high detail: stable frame pacing with 95th-percentile
      active frame time at or below 22 ms in the designated busy release scenario.
- [ ] Short laptop 1024×600: 95th-percentile active frame time at or below 28 ms
      with every primary control reachable.
- [ ] Mobile 390×844 low detail: 95th-percentile active frame time at or below
      34 ms in supported Watch/Assisted interactions.
- [ ] No simulation catch-up burst, asset load, panel update, or garbage
      collection pause may visibly freeze aircraft motion after warm-up.
- [ ] Pools, histories, alerts, analytics, audio voices, labels, and remote queues
      remain explicitly bounded during a four-hour run.

### Release gate

- [ ] Deterministic rules, operations, fixed-step, trajectory, collision,
      performance, replay, migration, accessibility, and focused browser tests pass
      locally before a release commit.
- [ ] Production assets use relative URLs and both root and `/airport-auto/`
      layouts build from the same output.
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

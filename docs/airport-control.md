# Airport control and telemetry

Airport Auto exposes a local, versioned interface for playtests, scripted controllers, dashboards, and agent experiments. All commands pass through the same authority and safety checks as the visible HUD. The interface does not provide a privileged collision bypass.

## Browser API

The current API version is `2.23.0`; snapshots use schema version `25`.

```js
airportControl.version;
airportControl.snapshot();
airportControl.events(100);
airportControl.replay();
airportControl.recording();
airportControl.help();
```

Use `request()` when a controller needs an explicit acknowledgement:

```js
const result = airportControl.request({
  action: "clearTakeoff",
  flightId: 12,
});

// {
//   accepted: true,
//   reason: 'takeoff clearance accepted for 27L',
//   sequence: 418,
//   eventId: 418,
//   snapshot: { ... },              // compatibility field
//   resultingState: { ... },
//   data: { ... }                  // command-specific preview/result when applicable
// }
```

`command()` remains a compatibility helper that returns only the resulting snapshot.

## Commands

Global and camera commands:

```js
airportControl.request({ action: "pause" });
airportControl.request({ action: "resume" });
airportControl.request({ action: "setSpeed", value: 2 });
airportControl.request({ action: "setMode", value: "manual" });
airportControl.request({ action: "selectAirport", code: "ORD" });
airportControl.request({ action: "setScenario", scenario: "rush" });
airportControl.request({ action: "setTrafficDensity", density: "busy" });
airportControl.request({ action: "setSeparationRuleset", ruleset: "realistic" });
airportControl.request({ action: "setStation", station: "tower" });
airportControl.request({ action: "setStationAutomation", station: "ramp", enabled: true });
airportControl.request({ action: "nextView" });
airportControl.request({ action: "zoomIn" });
airportControl.request({ action: "zoomOut" });
airportControl.request({ action: "rotateLeft" });
airportControl.request({ action: "rotateRight" });
airportControl.request({ action: "resetCamera" });
airportControl.request({ action: "setNightMode", enabled: true });
airportControl.request({ action: "setRadarVisible", enabled: true });
airportControl.request({ action: "setQueueInspectorVisible", enabled: true });
airportControl.request({ action: "setRunwayLabelsVisible", enabled: false });
airportControl.request({ action: "setMapOrientationVisible", enabled: true });
airportControl.request({ action: "setWindOverlayVisible", enabled: true });
airportControl.request({ action: "setServiceVehiclesVisible", enabled: false });
airportControl.request({ action: "setContrailsVisible", enabled: true });
airportControl.request({
  action: "setSurfaceLayerVisible",
  layer: "taxiway-labels",
  enabled: true,
});
airportControl.request({
  action: "setSurfaceLayerVisible",
  layer: "operational-zones",
  enabled: true,
});
airportControl.request({
  action: "setSurfaceLayerVisible",
  layer: "hotspots",
  enabled: true,
});
airportControl.request({
  action: "setAirspaceLayerVisible",
  layer: "procedures",
  enabled: true,
});
airportControl.request({
  action: "setAirspaceLayerVisible",
  layer: "flight-routes",
  enabled: true,
});
airportControl.request({
  action: "setAirspaceLayerVisible",
  layer: "separation",
  enabled: true,
});
```

Map panning is a direct presentation interaction: drag with a mouse or one finger, including when the gesture begins over ordinary traffic, middle-drag from anywhere, or use WASD/arrow keys. Q/E and the `rotateLeft`/`rotateRight` commands orbit the camera in 15-degree steps; runway-entry clearance moved to the R keyboard shortcut and remains available in the selected-flight panel. The only reserved left-drag is an uncleared arrival in a hands-on mode because that gesture draws its approach clearance. Wheel and pinch zoom remain anchored under the pointer; wide zoom smoothly becomes a map-like overhead view so the ground continues beneath the full viewport. Selecting a flight resumes smooth follow; selecting it again, clicking empty ground, or pressing Escape releases follow; `resetCamera` restores the centered default. `snapshot().renderer.camera` exposes the current focus, zoom, orbit angle, pan limits, detailed-map footprint, much larger plain-terrain dimensions, `groundFillsViewport`, and the nearest visible ground margin for browser verification.

`setRadarVisible` opens a small terminal-radar inset rather than painting rings over the full scene. It plots the same authoritative aircraft poses used by collision checks and the 3D renderer. On short laptop screens the radar and queue inspector dock side by side; on compact or heavily zoomed viewports opening one closes the other so neither panel can become unreachable. Compass/scale, wind readout, taxiway labels, service vehicles, and upper-scope contrails remain independent optional layers; hiding a presentation layer never removes its underlying entities or state from the simulation. Contrails are off by default and appear only behind turbofan aircraft in cold, moist, stable upper-scope conditions.

Airspace layers are `airspace-sectors`, `navigation-fixes`, `procedures`, `flight-routes`, and `separation`. They start hidden, including in Watch mode. Procedure and route geometry comes from the same versioned non-navigational program used by flight motion; separation rings convert the active ruleset's nautical-mile minimum into the airport coordinate system. They are presentation aids, never navigation data.

`setQueueInspectorVisible` opens the compact operation-queue inspector. `snapshot().queues` is generated by the same deterministic diagnosis used by that panel and `diagnostics().queues`: each entry includes gate/ramp/taxi/crossing/runway/wake/weather/downstream category, priority, entity, resource, wait time, position and queue length, causal flight IDs, and explanation. Selecting an aircraft row uses the normal `focusFlight` command. The inspector can also start open with `?queues=1`.

`snapshot().operations` contains the airport's complete operation profile plus its current compressed local time, named demand period, smoothly blended demand multiplier, arrival/departure share, passenger/cargo/regional/general-aviation mix, airline traffic program, active density assumptions, and flow snapshot. Top-level `trafficManagement` exposes bounded arrival/departure queues, release clocks, history, totals, and back-pressure. Each `flights[].operationPlan` records the stream, direction, period, local schedule minute, and demand level that generated the leg. Each `flights[].flightPlan` adds origin, destination, schematic route, procedure, airline/aircraft, gate and runway intent, release/arrival time, status, revision, and amendments. These are deterministic offline plans, not live traffic data.

Flight commands:

```js
airportControl.request({ action: "focusFlight", flightId: 12 });
airportControl.request({ action: "clearFlight", flightId: 12, runway: 1 });
airportControl.request({ action: "clearPushback", flightId: 12 });
airportControl.request({
  action: "clearRunwayCrossing",
  flightId: 12,
  runway: 4,
});
airportControl.request({ action: "clearRunwayEntry", flightId: 12 });
airportControl.request({ action: "clearTakeoff", flightId: 12 });
airportControl.request({ action: "assignHeading", flightId: 12, headingDegrees: 270 });
airportControl.request({ action: "assignAltitude", flightId: 12, altitudeFt: 3000 });
airportControl.request({ action: "assignAirspeed", flightId: 12, speedKts: 170 });
airportControl.request({ action: "directTo", flightId: 12, fixId: "ORD-R1-A-BASE" });
airportControl.request({
  action: "previewRoute",
  flightId: 12,
  fixIds: ["ORD-R1-A-GW1", "ORD-R1-A-DW", "ORD-R1-A-BASE", "ORD-R1-A-INT", "ORD-R1-A-FAF"],
});
airportControl.request({ action: "issueRouteAmendment", flightId: 12 });
airportControl.request({ action: "acceptRouteReadback", flightId: 12 }); // optional test/agent acknowledgement
airportControl.request({ action: "cancelRouteAmendment", flightId: 12 });
airportControl.request({
  action: "amendRoute", // backward-compatible atomic preview + acceptance
  flightId: 12,
  fixIds: ["ORD-R1-A-DW", "ORD-R1-A-BASE", "ORD-R1-A-INT", "ORD-R1-A-FAF"],
});
airportControl.request({ action: "clearApproach", flightId: 12 });
airportControl.request({ action: "holdFlight", flightId: 12, efcMinutes: 4 });
airportControl.request({ action: "releaseHold", flightId: 12 });
airportControl.request({ action: "offerHandoff", flightId: 12, station: "tower" });
airportControl.request({ action: "acceptHandoff", flightId: 12 });
airportControl.request({ action: "contactStation", flightId: 12, station: "tower" });
airportControl.request({ action: "rejectHandoff", flightId: 12 });
airportControl.request({ action: "cancelHandoff", flightId: 12 });
airportControl.request({ action: "handoffFlight", flightId: 12, station: "tower" }); // legacy offer alias
airportControl.request({
  action: "assignTaxiRoute",
  flightId: 12,
  viaNodeIds: ["OSM-N26630147", "OSM-N26630148"],
});
airportControl.request({ action: "holdPosition", flightId: 12 });
airportControl.request({ action: "resumeTaxi", flightId: 12 });
airportControl.request({
  action: "divertFlight",
  flightId: 12,
  airportCode: "KIND",
  reason: "weather alternate",
});
airportControl.request({
  action: "controlFlights",
  flightIds: [12],
  instruction: "hold",
});
airportControl.request({
  action: "previewGroupInstruction",
  flightIds: [12, 18],
  instruction: "slow",
});
airportControl.request({
  action: "issueGroupInstruction",
  flightIds: [12, 18],
  instruction: "slow",
});
airportControl.request({
  action: "triggerEmergency",
  flightId: 12,
  type: "go-around",
});
```

Approach owns terminal sequencing and may issue headings, altitudes, airspeeds, direct-to and route amendments, holds/EFCs, hold releases, approach clearances, and diversions. Tower owns landing, runway-entry, takeoff, and go-around clearances. Ground owns movement-area taxi routes, hold position/resume taxi, runway crossings, reroutes, and recovery. Ramp owns stands, ramp alleys, and pushback. Departures transfer Ramp → Ground → Tower → Approach; arrivals transfer Approach → Tower → Ground → Ramp. Supervisor can work every position and configure automation for unstaffed desks with `setStationAutomation`; selecting one operational desk automatically staffs the other positions so the airport continues safely. A command from the wrong station or against a flight owned on another frequency is rejected with an explicit reason.

Frequency transfer is a staged coordination workflow. The sending owner calls `offerHandoff` (or the backward-compatible `handoffFlight` offer alias); ownership does not change. The receiving station calls `acceptHandoff` or `rejectHandoff`. After acceptance, only the sending station calls `contactStation`, which completes the transfer and changes authoritative `navigation.frequencyOwner`; it can call `cancelHandoff` while coordination is active. Unstaffed automated desks follow the same offer, delayed acceptance, and delayed contact stages. An unanswered offer becomes `overdue`; crossing a control boundary with no offer creates an actionable overdue request, records `missedHandoffs`, and protects Ramp/Ground boundaries with an explainable surface hold until coordination is complete. The normal strip bay shows incoming and outgoing requests with the same commands. `flight.navigation.handoff` carries its version, revision, source, target, status, controller/timestamps, deadline, and reason, while `snapshot().controllers` reports effective automation, live workload, the active coordination queue, and five role-specific performance scorecards.

The normal selected-flight panel includes a collapsible route chooser plus a one-click smallest-turn suggestion. The editor is staged. `previewRoute` accepts only IDs from `snapshot().airport.airspaceProgram.fixes`, leaves the currently flown route untouched, and writes `navigation.routeClearance` with distance, time, initial turn, ordered fixes, `safeToIssue`, and up to six forecast warnings. The forecaster samples the candidate and every live airborne route on the same 180-second physical time axis using the active nautical-mile/vertical-foot ruleset. A turn greater than 120 degrees or a predicted near-term loss of separation is blocking; later proximity remains a visible caution. The proposed route appears over the map without requiring the optional route layer.

`issueRouteAmendment` revalidates the preview and enters `pending-readback`; the original route remains authoritative. A deterministic pilot readback follows after a short simulation-time delay and is checked again against the live traffic picture before acceptance. `acceptRouteReadback` lets tests or an agent advance that same safety path immediately, while `cancelRouteAmendment` retains the original route. A direct-to, hold, go-around, or diversion explicitly cancels any preview or pending readback it supersedes, so a delayed automatic readback cannot overwrite the newer instruction. Only an accepted readback invalidates a prior approach clearance and builds a continuous vector from the live pose. `amendRoute` remains a backward-compatible atomic preview-and-accept command, but it cannot bypass a blocking preview. Unknown, duplicated, incompatible, excessively long, holding, go-around, late-final, and wrong-station amendments return structured rejection reasons.

`assignTaxiRoute` accepts up to eight ordered via-node IDs from `snapshot().surfaceGraph.nodes`; omit `viaNodeIds` to refresh the safest available route to the already-cleared destination. It never changes that destination or teleports the aircraft. The current pavement segment remains committed, and the suffix passes through the same edge direction, aircraft-width, closure, congestion, deicing, reservation, and runway-crossing systems as automatic routing. A controller must separately clear every crossing newly derived from the accepted route. `holdPosition` decelerates with the aircraft and surface-condition braking model; `resumeTaxi` removes only the controller hold, so a crossing, automatic-flow, or collision hold can still keep the aircraft stopped.

`divertFlight` applies to an inbound aircraft owned by Approach or Supervisor. It captures the current pose, amends the destination and flight-plan status, climbs continuously through either the requested terminal `exitFixId` or the smallest-turn scope-edge fix, and removes the flight only after it flies beyond terminal scope. It does not disappear in place or run the landing-clearance timeout while exiting.

`previewGroupInstruction` is a non-mutating check for two to eight aircraft. Every member must be active, uniquely identified, owned by the selected station, in the same airborne or surface domain, under the same Approach/Ground/Ramp authority, and able to accept the instruction. `issueGroupInstruction` repeats that check immediately before changing state and then applies every member or none. Group-safe instructions are `slow`, `normal`, surface `hold`, and surface `resume`; runway clearances, vectors, route changes, `expedite`, and `zigzag` remain individual-only. Surface reservations, runway protection, physical separation, and automatic/safety holds remain authoritative. Multi-flight `controlFlights` is retained as an atomic legacy alias and can no longer partially accept a list.

Weather commands:

```js
airportControl.request({
  action: "setWeather",
  condition: "snow",
  directionDegrees: 270,
  windSpeed: 12,
});
airportControl.request({ action: "setWeatherEnabled", enabled: false });
airportControl.request({ action: "setWindEnabled", enabled: false });
```

Runway-plan commands require the Supervisor station and pass through weather, visibility, wind, closure, and procedure checks:

```js
airportControl.request({
  action: "setRunwayConfiguration",
  configurationId: "ORD-EAST-IFR",
});
airportControl.request({
  action: "setRunwayConfiguration",
  configurationId: null,
}); // restore automatic selection
```

An accepted plan may be queued rather than switched immediately. `resultingState.runwayConfiguration.transition` names the target, affected runways, and blocking flights while existing protected traffic drains. Operating ends and roles then change together in one fixed step; arrivals and new taxi-out releases are metered during the transition.

Surface-availability commands use the same graph and safety arbiter as taxi motion. Creating or clearing a restriction requires Supervisor; disabled-aircraft recovery requires Ground or Supervisor:

```js
airportControl.request({
  action: "setSurfaceDisruption",
  kind: "taxiway-closure",
  targetId: "TWY-A",
  enabled: true,
  durationSeconds: 180,
});
airportControl.request({
  action: "setSurfaceDisruption",
  kind: "construction",
  targetId: "OSM-E00042",
  enabled: true,
});
airportControl.request({ action: "clearSurfaceDisruption", disruptionId: "SD-1" });
airportControl.request({ action: "recoverDisabledAircraft", flightId: 12 });
```

`targetId` is a runway index for `runway-closure`, a graph taxiway ID for `taxiway-closure`, and an eligible graph edge or taxiway ID for `construction`. A duration is optional; timed restrictions reopen automatically. The response explains authority, occupancy, capacity, duplicate-target, and unknown-target rejections.

In Manual mode, the normal departure sequence is: monitor the required fueling/baggage/cargo/cabin/maintenance tasks and their assigned ramp vehicles, wait until the turnaround is ready and the stand lane is physically clear, issue Ramp pushback clearance, monitor tug/engine start and tug release, hand the flight to Ground for movement-area taxi and every required crossing, then hand it to Tower for runway entry / line-up and takeoff. Assisted mode proposes the same pushback command only after services and stand clearance finish. Auto and Watch use the same safety arbiter. Rejected early pushback commands name either the blocking services or equipment still clearing.

### No-fail training

Four airport-agnostic lessons teach arrival fundamentals, the Tower landing sequence, Ramp/Ground surface flow, and explicit controller handoffs. Starting a lesson rebuilds a quiet deterministic traffic picture, enters Manual control, and pauses on a recoverable first-step checkpoint:

```js
airportControl.request({
  action: "startTrainingLesson",
  lessonId: "arrival-basics",
});
airportControl.request({ action: "continueTraining" });
airportControl.request({ action: "trainingHint" });
airportControl.request({ action: "retryTrainingStep" });
airportControl.request({ action: "skipTrainingStep" });
airportControl.request({ action: "stopTrainingLesson" });
```

Available lesson IDs are `arrival-basics`, `tower-landing`, `surface-flow`, and `handoff-workflow`. The normal HUD, BroadcastChannel clients, and page-local API all use the same typed operational commands during a lesson. An unsafe or mistimed instruction is still rejected by the normal authority/safety arbiter; training records the mistake, explains the reason in plain language, and deliberately pauses instead of ending the shift. Retry restores authoritative simulation time, aircraft and vehicle state, reservations, queues, weather, controller state, and metrics from the exact start-of-step checkpoint. The renderer drops interpolation history at that discontinuity so an aircraft never appears to slide backward. Skip carries no score or safety penalty.

`snapshot().training` contains status, lesson and step metadata, the selected target, objective, explanation, hint, live context, completed/skipped steps, mistake/recovery/hint counters, and the complete lesson catalog. `?lesson=arrival-basics&autostart=1` opens a lesson directly for testing or sharing.

## Snapshot and events

Snapshot schema 25 adds deterministic no-fail lesson/coaching state and the lesson catalog while retaining schema 24 Supervisor, Approach, Tower, Ground, and Ramp definitions, objectives, scoped alerts, workload context, status, and 0–100 game scorecards. The scorecards and coach are read-only feedback; operational instructions still pass through the normal typed command and safety path.

Top-level `selection` reports the focused flight, whether Group select is active, and the selected grouped flight IDs.

Top-level `controllers.performance` is ordered as Supervisor, Approach, Tower, Ground, and Ramp. Each entry reports its traffic scope, authority summary, responsibilities, success measures, applicable operational workload, current score/status/summary, four objectives, and bounded role-scoped alerts with associated flight IDs. See [controller-roles.md](controller-roles.md) for the role boundaries, target semantics, and deterministic derivation rules.

Snapshots include the airport and seed, simulation clock, mode, speed, station, scenario, traffic density/flow, weather (including visibility, ceiling, wind, gusts, temperature, and surface condition), optional-overlay state, active runway configuration, selection mode, transition queue, ends, dynamic roles, eligibility/restriction reasons, closure, runway reservations, proposed Assisted clearances, structured operation queues, the complete surface graph, renderer/map-layer/camera diagnostics, safety metrics, and every flight's operation plan, complete flight plan/history, route, clearances, model data, authoritative pose, rendered nose-up attitude, kinematics, fuel, trajectory stage, hold reason, and assigned gate/terminal/concourse. Each `flight.fuelPlan` includes the deterministic arrival and departure route estimates plus block, trip, taxi, contingency, alternate, final-reserve, dispatch, and expected-arrival quantities; these are entertainment estimates, not dispatch data. `flight.kinematics` includes aviation heading degrees and a cardinal direction. `airport.airspaceProgram` contains its schema/data version, non-navigation disclaimer, fixes, airways, sectors, SIDs, STARs, constraints, holds, missed approaches, and FAA conceptual-source metadata. Every `flight.navigation` reports selected procedure/transition, remaining fixes, active fix, heading/altitude/speed assignments, vector or holding state, EFC, missed-approach ID, frequency ownership, handoff, and readback state. Its optional `routeClearance` preserves the proposed and prior fix lists, status, controller, timestamps, distance/time/turn estimate, safety decision, structured forecast warnings, and final reason. An active `flight.diversion` reports alternate airport, edge fix, instruction time/reason, captured start pose, exit stage, and stage progress. Top-level `separationRuleset` reports the complete active physical rules, coordinate basis, required radar NM, recent runway-operation history, and current violations. During a missed approach, `flight.goAround` reports its instruction time, reason, captured live start pose, selected missed-approach circuit stage, and stage progress. `flight.runwayExit` reports the chosen graph node and taxiway, source, candidate count, threshold/touchdown/rollout distances, available pavement and stopping margin, braking action/multiplier, target exit speed and angle, rapid-exit state, stand-route and live-congestion costs, competing-traffic penalty, deterministic score, safety result, route edges, rationale, and selection time. Top-level `surfaceDisruptions` reports each restriction's kind, status, source, target, label, blocked edges, runway/taxiway/flight association, timing, recovery progress, rerouted flights, and reason. An affected flight's `surfaceReroute` records revision, rerouted/holding status, trigger IDs, prior and current edge lists, added distance, and explanation. Renderer diagnostics expose pending, active, and recovering counts. `surfaceGraph.gatePlanning` names the scheduling model, turn buffer, policy, and scoring factors. Each `flight.gate.assignment` reports planned/inbound/occupied/releasing/released status; a readable operational-zone name; scheduled and actual gate-in/out times; next destination and departure runway; airline/service fit; service area; arrival/departure route distance; score; rationale; revision; and prior stand. Each `flight.turnaround` reports planned/servicing/ready/released status, overall timing and progress, initial/target fuel, active and blocking services, and all seven tasks with dependency, reason, duration, progress, and actual timestamps. `serviceVehicles` reports the task/type/lifecycle, stand/zone/bay, depot, outbound and return graph routes, stand path, dispatch time, authoritative pose, actual/max speed, current edge/node, hold reason, and protected-area authorization for every active turn. Ground-operation state reports `pushbackCleared`, left/right/straight `pushbackDirection`, normalized `pushbackProgress`, graph-derived `pushbackReleaseProgress`, `tugAttached`, and `engineState` (`off`, `starting`, or `running`). It also reports the active ramp-control zone and capacity, ramp alley, inbound/outbound flow direction, stand lead-in/lead-out state, and an explainable automatic hold reason. `surfaceRoutePlanning` separates physical distance from routing cost, congestion penalty, and occupied edges considered by the router. `taxiPerformance` reports the aircraft's straight and turn speed limits, ground acceleration/braking, current stopping distance, design/current turn radius, next-turn distance and speed, current/minimum route wingtip margin, limiting edge, and route compatibility. Surface graph schema v3 includes stand compatibility, sourced parking/gate references, passenger facilities and official gate-count provenance, pushback/ramp metadata, named routes, bridge/tunnel semantics, explicit control points, operational zones, and FAA hot spots. A taxiing flight reports its exact `crossingHoldPointId` when stopped for a runway crossing.

Events have a monotonic sequence number and include command payloads and acceptance, flight/runway/taxiway context, and safety-hold or go-around details. Handoff coordination emits `handoff-offer`, `handoff-accept`, `handoff-reject`, `handoff-overdue`, `handoff-cancel`, `handoff-complete`, and compatibility `contact` events. Each atomic group issue emits one `group-instruction` event per member with the common instruction, authority, and callsign set in its detail. Route editing emits `route-preview`, `route-clearance-issued`, `route-readback-accepted`, `route-readback-rejected`, `route-clearance-cancelled`, and final `route-amendment` events with a deep-cloned clearance/warning payload. Other controller-authored movement adds `taxi-route-clearance`, `hold-position`, `taxi-resume`, `diversion`, and terminal-scope `divert` events. Gate planning adds structured `gate-assignment`, `gate-reassignment`, and `gate-release` payloads. Arrival planning emits `runway-exit-plan` with the complete resulting exit state whenever the stand, braking action, traffic, or final-approach refresh changes the decision. Surface changes emit `surface-reroute`, `recovery-start`, and `recovery-complete` with the resulting route/restriction context. Turnarounds add `turnaround-start`, per-task `service-start` / `service-complete`, and `turnaround-ready` events with service, progress, and readiness timing. Ramp equipment adds dispatch, arrival, hold/release, return, and stand-clear events with vehicle ID/type/status. Pushback adds `pushback-clearance`, `pushback-start`, `engine-start`, and `tug-release` events. Winter operations add `deicing-planned`, `deicing-queue`, `deicing-pad-entry`, `deicing-start`, `deicing-complete`, `deicing-expired`, and `deicing-return`, including the resulting pad, lane, cycle, queue, treatment, and holdover state. The in-page log retains the latest 500 events.

`recording()` returns a portable replay bundle containing the airport seed, initial state, accepted and rejected commands, weather events, complete event log, and immutable full-state frames. The visible replay scrubber is read-only and drives the 3D world from those recorded frames.

## BroadcastChannel bridge

Another same-origin page, devtool, or local controller can communicate without directly accessing the game window:

```js
const channel = new BroadcastChannel("airport-auto");
const requestId = crypto.randomUUID();

channel.addEventListener("message", ({ data }) => {
  if (data.type === "response" && data.requestId === requestId) {
    console.log(data.result);
  }
});

channel.postMessage({
  type: "command",
  requestId,
  command: { action: "focusFlight", flightId: 12 },
});
```

The game publishes `ready`, event, command-result, and request-correlated `response` messages. This bridge is same-origin/local coordination, not a remote network API. A future remote controller should add authentication, rate limits, timeouts, and an emergency stop before accepting commands.

## Launch URL

```text
http://127.0.0.1:5173/?airport=ORD&mode=auto&scenario=rush&speed=3&autostart=1&telemetry=1
```

Supported airports are `LOCAL`, `ATL`, `ORD`, `DXB`, `HND`, `DFW`, `LHR`, `IST`, `DEN`, `LAX`, and `JFK`. Modes are `auto`, `assisted`, `manual`, and `watch`; densities are `quiet`, `realistic`, `busy`, `rush`, and `extreme`; separation rules are `forgiving` (default) and `realistic`; stations are `supervisor`, `approach`, `tower`, `ground`, and `ramp`; scenarios are `normal`, `rush`, `storm`, `closure`, `training`, and `emergency`.

`density=busy` selects an initial traffic profile and rebuilds the opening bank at that density. `rules=realistic` enables the FAA-inspired physical terminal option; this remains a simulation ruleset and the wake categories are explicitly simplified rather than CWT/RECAT. `runwayConfig=ORD-EAST-IFR` requests a specific eligible runway plan after launch; `runwayConfig=auto` restores automatic selection. `weather=snow` opens ORD with contaminated-surface performance and active deicing routes; weather may also be `clear`, `rain`, `fog`, or `off`. `contrails=1` enables the otherwise-off upper-scope contrail layer. `?soak=1` starts an ORD Rush session at 3× for long-run health monitoring. Add `debug=1` for renderer/simulation probes and `detail=low` to force the mobile rendering tier.

See [deicing-operations.md](deicing-operations.md) for the complete winter lifecycle and deliberate limits.

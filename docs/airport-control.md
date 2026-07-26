# Airport control and telemetry

Airport Auto exposes a local, versioned interface for playtests, scripted controllers, dashboards, and agent experiments. All commands pass through the same authority and safety checks as the visible HUD. The interface does not provide a privileged collision bypass.

## Browser API

The current API version is `2.39.0`; the formal control protocol is `1.2.0`, snapshots use schema version `41`, and portable recordings use schema version `4`.

```js
airportControl.version;
airportControl.protocolVersion;
airportControl.protocol();
airportControl.validate({ action: "pause" });
airportControl.snapshot();
airportControl.events(100);
airportControl.replay();
airportControl.recording();
airportControl.replayTools.verify();
await airportControl.replayTools.verifyAsync();
airportControl.replayTools.load(recording);
airportControl.replayTools.compare(10, 40);
airportControl.replayTools.seedLink();
airportControl.replayTools.shareable();
await airportControl.replayTools.shareableAsync();
airportControl.analytics();
airportControl.performance();
airportControl.exportData("csv", "runways");
airportControl.help();
```

Use `request()` when a controller needs an explicit acknowledgement:

```js
const result = airportControl.request({
  action: "clearTakeoff",
  flightId: 12,
});

// {
//   protocolVersion: '1.2.0',
//   apiVersion: '2.39.0',
//   sessionId: 'session-…',
//   requestId: 'req-…',
//   commandId: 'cmd-…',
//   accepted: true,
//   reason: 'takeoff clearance accepted for 27L',
//   sequence: 418,
//   eventId: 418,
//   eventKey: 'session-…:418',
//   authority: { rule: 'tower-flight-owner', effectiveStation: 'tower', … },
//   compatibility: { compatible: true, … },
//   validation: { valid: true, issues: [] },
//   snapshot: { ... },              // compatibility field
//   resultingState: { ... },
//   data: { ... }                  // command-specific preview/result when applicable
// }
```

`request()` remains the API-2.x-compatible bare-command entry point and generates request/command IDs automatically. `command()` remains a compatibility helper that returns only the resulting snapshot.

## Formal protocol

`airportControl.protocol()` returns a deep-cloned, machine-readable contract rather than a second hand-maintained command list. It contains all 92 command definitions, parameter and root command JSON Schemas, examples, mutation flags, authority rules, availability notes, deprecation aliases, 70 domain event types, and schemas for request, result, event, and BroadcastChannel messages. Unknown actions, missing parameters, non-JSON numbers, and additional command properties are rejected before game code runs.

Use `validate()` for structural checks without execution. Use `dispatch()` when a controller needs explicit identity, authority, and compatibility assertions:

```js
const result = airportControl.dispatch({
  protocolVersion: "1.2.0",
  requestId: crypto.randomUUID(),
  clientId: "tower-agent-a",
  source: "agent",
  authority: {
    station: "tower",
    actorId: "tower-agent-a",
  },
  expects: {
    apiVersion: "2.39.0",
    snapshotSchemaVersion: 41,
  },
  command: {
    action: "clearTakeoff",
    flightId: 12,
  },
});
```

An authority assertion is never a credential or a way to select a desk. It must match the simulator's already-selected station, and the command must then pass the same station, flight-ownership, phase, runway-protection, separation, reservation, and collision checks used by the visible UI. The result reports asserted, effective, and resulting stations plus the command's formal authority rule. A mismatch is a structured rejection and does not mutate the game.

Protocol compatibility follows explicit rules: the protocol major must match and a client cannot require a newer protocol; an API requirement must be in major 2 and no newer than the running API; a requested snapshot schema must match exactly. Deprecated API-2.x aliases currently retained are `handoffFlight` → `offerHandoff` and multi-flight `controlFlights` → `issueGroupInstruction` behavior. A future protocol-major change may remove them.

## Deterministic station controllers

Auto, Watch, and automated unstaffed desks use five offline scripted programs: Supervisor, Approach, Tower, Ground, and Ramp. They evaluate authoritative simulation state every 0.25 simulation seconds in stable station/flight order. The programs do not move aircraft or mutate clearances directly. Each selected action calls the same public method used by the HUD and `airportControl`, so ownership, phase, runway protection, separation, reservations, disruptions, and collision checks can still reject it.

The current action vocabulary covers approach and landing clearances, pushback, individual route-derived runway crossings, line-up/runway entry, takeoff, EFC hold release, disabled-aircraft recovery, safety go-arounds, and all three handoff stages. Missed-handoff deadlines and surface reservations remain simulation invariants rather than discretionary controller shortcuts. Ground/Ramp ownership follows the aircraft's current graph edge and operational zone, not the ramp zone of its future stand, so a flight remains with Ground through movement-area crossings before transferring to Ramp. Selecting an operational desk marks that desk `human` immediately and leaves configured unstaffed positions `scripted`; selecting Supervisor exposes the four desk automation switches.

Supervisor can select Balanced, Conservative, Efficient, Calm, Teaching, or Realistic Tempo policy from the normal UI or `setControllerPolicyPreset`. Each preset resolves per-station track capacity, routine action budget, minimum decision spacing, handoff accept/contact timing, urgency window, deferral review, and automation-resume grace. Track capacity is a soft intake boundary: an offered non-urgent handoff can be recorded as `deferred` without changing ownership, while an overdue handoff and every urgent or safety action bypass capacity and pacing. “Realistic Tempo” is an FAA-inspired game profile, not a regulatory staffing model. Policies only choose and time candidates; every operational action still calls the common authority and safety arbiter.

`snapshot().controllers.policy` contains the selected profile, resolved active profile, and six-entry catalog. `controllers.scripted` is replay-safe, JSON-stable state with runtime schema/program versions, selected preset, cadence and cycle counters, the next deterministic decision/transition sequences, and one entry for each station. Station entries report `scripted`, `human`, or `inactive` mode; evaluation, planned, accepted, rejected, and deferred counts; resolved policy; capacity/utilization/queue workload; decision pacing; and transition timing. The bounded decision history records station, action, flight, runway/target station, stable rule ID, priority, rationale, timestamps, accepted/rejected/deferred disposition, arbiter result, and event types produced. Bounded mode transitions record prior/next mode, reason, time, and coordinated flight IDs retained across takeover. Shipped gameplay never requires a model, API key, network connection, or remote service.

## Controller evaluation

`snapshot().controllers.evaluation` is a versioned, read-only assessment of human, local, agent, and scripted operational decisions. It reports active conflict forecasts and warnings, prevented conflicts, collision alerts, incursions, delay, throughput, modeled holding-fuel impact, explainable stale-hold candidates, accepted/rejected/deferred instructions, station quality, and source/actor totals. A desk with no instructions is explicitly `not-rated` rather than receiving a fabricated perfect score.

Quality uses only penalties for rejected instructions, active hazards, physical safety events, overdue handoffs, and avoidable hold time. Throughput, delay, and fuel never add points or offset a safety penalty. Autonomous capacity deferrals remain distinct from rejected commands. The evaluator never issues a command, changes authority, releases a hold, or bypasses the safety arbiter. See [controller-evaluation.md](controller-evaluation.md) for the exact scope, thresholds, formula, attribution limits, and API shape.

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
airportControl.request({
  action: "setSeparationRuleset",
  ruleset: "realistic",
});
airportControl.request({ action: "setStation", station: "tower" });
airportControl.request({
  action: "setStationAutomation",
  station: "ramp",
  enabled: true,
});
airportControl.request({
  action: "setControllerPolicyPreset",
  preset: "calm",
}); // Supervisor; balanced | conservative | efficient | calm | teaching | realistic
airportControl.request({ action: "nextView" });
airportControl.request({ action: "zoomIn" });
airportControl.request({ action: "zoomOut" });
airportControl.request({ action: "rotateLeft" });
airportControl.request({ action: "rotateRight" });
airportControl.request({ action: "resetCamera" });
airportControl.request({
  action: "focusTarget",
  target: { kind: "runway", id: "0" },
});
airportControl.request({ action: "focusTarget", target: null });
airportControl.request({ action: "setNightMode", enabled: true });
airportControl.request({ action: "setRadarVisible", enabled: true });
airportControl.request({ action: "setQueueInspectorVisible", enabled: true });
airportControl.request({ action: "setRunwayLabelsVisible", enabled: false });
airportControl.request({ action: "setMapOrientationVisible", enabled: true });
airportControl.request({ action: "setWindOverlayVisible", enabled: true });
airportControl.request({ action: "setServiceVehiclesVisible", enabled: false });
airportControl.request({ action: "setContrailsVisible", enabled: true });
airportControl.request({ action: "setAirportLifeVisible", enabled: true });
airportControl.request({ action: "setGamepadEnabled", enabled: true });
airportControl.request({ action: "setGamepadSensitivity", sensitivity: 1.4 });
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

Sandbox lifecycle and traffic injection:

```js
airportControl.request({ action: "startSandbox", backgroundTraffic: false });
airportControl.request({
  action: "injectSandboxTraffic",
  direction: "arrival", // arrival | departure
  trafficClass: "passenger", // auto | passenger | regional | cargo | general-aviation
  runwayId: null, // null chooses an open, role-compatible runway
  count: 4, // integer from 1 through 8
});
airportControl.request({
  action: "setSandboxBackgroundTraffic",
  enabled: true,
});
airportControl.request({ action: "cancelSandboxInjections" });
airportControl.request({ action: "clearSandboxTraffic" });
airportControl.request({ action: "stopSandbox" });
```

`snapshot().sandbox` reports the no-score/no-fail lifecycle, request state and reasons, totals, released and active injected IDs, active-aircraft count, compatible runway choices, and traffic-class catalog. Arrivals enter at the terminal-scope edge; departures stage on a compatible unoccupied stand and use the complete pushback/taxi/runway lifecycle. Releases still obey traffic caps, stand/runway performance, protected paths, controller authority, separation, and collision prevention. `clearSandboxTraffic` preserves weather and runway configuration. See [sandbox-lab.md](sandbox-lab.md).

Map panning is a direct presentation interaction routed through the unified 24-action layer: drag with a mouse or one finger, including when the gesture begins over ordinary traffic, middle-drag from anywhere, hold WASD/arrow keys, or use a standard gamepad's left stick/D-pad. Q/E and right-stick input rotate continuously; `rotateLeft`/`rotateRight` retain their discrete 15-degree API steps. Runway-entry clearance remains on R and in the selected-flight panel. A tap selects any aircraft; only movement of at least three screen pixels over an uncleared arrival becomes the reserved left-drag that draws its approach clearance. Wheel and pinch zoom remain anchored under the pointer; wide zoom smoothly becomes a map-like overhead view so the ground continues beneath the full viewport. Selecting a flight resumes smooth follow; selecting it again, clicking empty ground, or pressing Escape releases follow; `resetCamera` restores the centered default. `F` opens the generic observer navigator for aircraft, runways, taxiways, gates, queues, and conflicts. Any deliberate camera movement releases its active target before applying input. `snapshot().renderer.camera` exposes presentation and resolved target state, while `snapshot().input` exposes the input context, last device/action/gesture, axes, held actions, preferences, connected-gamepad metadata, and complete action catalog. See [input-controls.md](input-controls.md) and [observer-focus.md](observer-focus.md).

`setRadarVisible` opens a small terminal-radar inset rather than painting rings over the full scene. It plots the same authoritative aircraft poses used by collision checks and the 3D renderer. On short laptop screens the radar and queue inspector dock side by side; on compact or heavily zoomed viewports opening one closes the other so neither panel can become unreachable. Compass/scale, wind readout, taxiway labels, service vehicles, and upper-scope contrails remain independent optional layers; hiding a presentation layer never removes its underlying entities or state from the simulation. Contrails are off by default and appear only behind turbofan aircraft in cold, moist, stable upper-scope conditions.

Airspace layers are `airspace-sectors`, `navigation-fixes`, `procedures`, `flight-routes`, and `separation`. They start hidden, including in Watch mode. Procedure and route geometry comes from the same versioned non-navigational program used by flight motion; separation rings convert the active ruleset's nautical-mile minimum into the airport coordinate system. They are presentation aids, never navigation data.

`setQueueInspectorVisible` opens the compact operation-queue inspector. `snapshot().queues` is generated by the same deterministic diagnosis used by that panel and `diagnostics().queues`: each entry includes gate/ramp/taxi/crossing/runway/wake/weather/downstream category, priority, entity, resource, wait time, position and queue length, causal flight IDs, and explanation. Every row uses the normal `focusTarget` command, so aircraft, service vehicle, blocker group, runway, taxiway, gate, and system-resource waits can all be inspected. The inspector can also start open with `?queues=1`.

`snapshot().operations` contains the airport's complete operation profile plus its current compressed local time, named demand period, smoothly blended demand multiplier, arrival/departure share, passenger/cargo/regional/general-aviation mix, airline traffic program, active density assumptions, and flow snapshot. Top-level `trafficManagement` exposes bounded arrival/departure queues, release clocks, history, totals, and back-pressure. Each `flights[].operationPlan` records the stream, direction, period, local schedule minute, and demand level that generated the leg. Each `flights[].flightPlan` adds origin, destination, schematic route, procedure, airline/aircraft, gate and runway intent, release/arrival time, status, revision, and amendments. These are deterministic offline plans, not live traffic data.

Flight commands:

```js
airportControl.request({ action: "focusFlight", flightId: 12 });
airportControl.request({
  action: "focusTarget",
  target: { kind: "flight", id: "12" },
});
airportControl.request({
  action: "focusTarget",
  target: { kind: "taxiway", id: "A" },
});
airportControl.request({ action: "focusTarget", target: null });
airportControl.request({ action: "clearFlight", flightId: 12, runway: 1 });
airportControl.request({ action: "clearPushback", flightId: 12 });
airportControl.request({
  action: "clearRunwayCrossing",
  flightId: 12,
  runway: 4,
});
airportControl.request({ action: "clearRunwayEntry", flightId: 12 });
airportControl.request({ action: "clearTakeoff", flightId: 12 });
airportControl.request({
  action: "assignHeading",
  flightId: 12,
  headingDegrees: 270,
});
airportControl.request({
  action: "assignAltitude",
  flightId: 12,
  altitudeFt: 3000,
});
airportControl.request({
  action: "assignAirspeed",
  flightId: 12,
  speedKts: 170,
});
airportControl.request({
  action: "directTo",
  flightId: 12,
  fixId: "ORD-R1-A-BASE",
});
airportControl.request({
  action: "previewRoute",
  flightId: 12,
  fixIds: [
    "ORD-R1-A-GW1",
    "ORD-R1-A-DW",
    "ORD-R1-A-BASE",
    "ORD-R1-A-INT",
    "ORD-R1-A-FAF",
  ],
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
airportControl.request({
  action: "offerHandoff",
  flightId: 12,
  station: "tower",
});
airportControl.request({ action: "acceptHandoff", flightId: 12 });
airportControl.request({
  action: "contactStation",
  flightId: 12,
  station: "tower",
});
airportControl.request({ action: "rejectHandoff", flightId: 12 });
airportControl.request({ action: "cancelHandoff", flightId: 12 });
airportControl.request({
  action: "handoffFlight",
  flightId: 12,
  station: "tower",
}); // legacy offer alias
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

Environment and observer-presentation commands are public, never move an aircraft, and never bypass the safety arbiter:

```js
airportControl.request({ action: "setEnvironmentLightingMode", mode: "automatic" });
airportControl.request({ action: "setEnvironmentSeasonMode", mode: "winter" });
airportControl.request({ action: "setAccessibilityPalette", palette: "cvd-safe" });
airportControl.request({ action: "setCameraDirectorEnabled", enabled: true });
```

The camera director is an opt-in observer only. It turns itself off for any manual pan, zoom, rotation, explicit focus, or camera command and remains disabled under a reduced-motion preference. See [environment-presentation.md](environment-presentation.md).

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
airportControl.request({
  action: "clearSurfaceDisruption",
  disruptionId: "SD-1",
});
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

### Timed challenge shifts

Four deterministic controller challenges cover a rush bank, storm operations, runway-closure recovery, and emergency priority. Starting one rebuilds its traffic picture, selects Assisted if the player was in Auto or Watch, automates every unstaffed operational desk, and pauses at a briefing. The airport, scenario, density, separation rules, weather, wind, runway plan, and scenario closure remain locked until the debrief.

```js
airportControl.request({ action: "startChallenge", challengeId: "rush-hour" });
airportControl.request({ action: "beginChallenge" });
airportControl.request({ action: "endChallenge" });
airportControl.request({ action: "continueAfterChallenge" });
```

Available IDs are `rush-hour`, `storm-operations`, `runway-closure`, and `emergency-priority`. A generic `resume` cannot bypass the briefing. Auto and Watch are unavailable while the challenge clock is live; Assisted and Manual can be switched normally. A physical conflict, runway incursion, or unexplained motion pause ends the challenge for safety review, while ending early records an abandoned `F` debrief.

`snapshot().challenge` contains lifecycle status, definition and full catalog, locked-condition state, authoritative start/duration/end clocks, score, grade, weighted objective progress, completion reason, and an operational summary of arrivals, departures, throughput, delay, total/holding fuel, emergency resolutions, go-arounds, and safety diagnostics. UI, page-local clients, and BroadcastChannel clients all use these same commands and structured rejection reasons. `?challenge=rush-hour&autostart=1` opens and begins a shareable shift. See [challenge-shifts.md](challenge-shifts.md) for target values and grading rules.

## Local operations analytics and exports

`airportControl.analytics()` returns the session's local Operations Data Lab snapshot. Pass a flight ID to include that flight's bounded authoritative recorder samples. `airportControl.exportData(format, dataset, flightId?)` returns an offline string export without downloading, uploading, or contacting a service. Formats are `json` and `csv`; CSV datasets are `flights`, `commands`, `events`, `queues`, `delays`, `runways`, `taxiways`, `shift-metrics`, `flight-recorder`, and `conflicts`.

The full local snapshot contains flight identity and route history, once-per-simulation-second pose and kinematics, fuel, holds, command and event audit, queue/delay summaries, runway and taxiway utilization, shift metrics, and a runway-context conflict heatmap. Retention is bounded to 7,200 samples per flight, 512 flights, and 256 heatmap cells. The visible **Data lab** drawer provides flight following, a lightweight altitude/speed/fuel recorder chart, utilization bars, the heatmap, and local JSON/CSV downloads.

Top-level `snapshot().analytics` and the remote gateway carry only a compact overview: schema/window metadata, aggregate summary, observed-flight count, and the local-only disclosure. Raw recorder samples, command payloads, and local exports are intentionally excluded from remote projections. Shared replay data must use an explicit allowlist, strip controller identity and free text, require affirmative consent, and declare retention before this boundary is widened. See [operations-data-lab.md](operations-data-lab.md).

`airportControl.performance()` and top-level `snapshot().performance` expose the same bounded local runtime monitor. It separates display-frame work from display-frame gaps, measures fixed simulation ticks directly, tracks dropped wall time and maximum catch-up ticks, and samples heap, aircraft, service vehicles, spatial audio voices, queues, draw calls, geometries, and textures once per simulation second. Each metric has an explicit warming/nominal/attention/exceeded/unavailable budget result; up to 1,200 frame/tick timings and 21,600 counter samples are retained in memory. The optional **Performance** control shows the compact report without changing traffic, quality, or any safety rule. Browser heap data is unavailable where `performance.memory` is not implemented. See [performance-budget.md](performance-budget.md).

## Snapshot and events

Snapshot schema 41 adds bounded runtime performance distributions, counters, growth rates, and budget checks while retaining schema 40 replay verification, schema 39 local analytics, schema 38 deterministic environment/presentation, and schema 37 operational weather. `environment` reports local time, lighting/season modes, resolved solar phase, daylight and sun pose, continuous cloud/wet/snow state, and runway-light demand. `presentation` reports the persisted semantic palette and optional camera-director status/subject. Focus, palettes, scorecards, evaluation, challenge grading, coaching, policy state, decision history, and remote connection health remain presentation or feedback; operational instructions still pass through the normal typed command and safety path.

Top-level `selection` reports the selected flight, compact focused-target reference, whether Group select is active, and the selected grouped flight IDs. Top-level `focus` reports catalog schema 1, the current descriptor, and categorized targets for `flight`, `runway`, `taxiway`, `gate`, `queue`, and `conflict`. A descriptor carries stable key/reference, label, explanation, world bounds, suggested zoom, static/flight/group/vehicle follow strategy, related flight IDs, optional vehicle/selected-flight identity, and presentation tone. `renderer.camera.target` reports the resolved XYZ tracking point, normalized viewport position, containment, and rendered-subject visibility; the height-aware renderer derives moving points from the same interpolated visuals it already displays and never invents a separate route.

Top-level `controllers.performance` is ordered as Supervisor, Approach, Tower, Ground, and Ramp. Each entry reports its traffic scope, authority summary, responsibilities, success measures, applicable operational workload, current score/status/summary, four objectives, and bounded role-scoped alerts with associated flight IDs. `controllers.scripted` reports which of those desks are currently automated or human and exposes their bounded decision audit. `controllers.evaluation` separately reports current-session outcomes and command quality; it does not replace the live role scorecard or feed back into operations. See [controller-roles.md](controller-roles.md) for role boundaries and [controller-evaluation.md](controller-evaluation.md) for evaluation semantics.

Snapshots include the airport and seed, simulation clock, mode, speed, station, scenario, traffic density/flow, weather (including precipitation, intensity, cloud cover, visibility, ceiling, wind, gusts, temperature, surface condition, modeled three-segment runway reports, hazard opt-in, active hazard, and bounded hazard history), optional-overlay state, active runway configuration, selection mode, transition queue, ends, dynamic roles, eligibility/restriction reasons, closure, runway reservations, proposed Assisted clearances, structured operation queues, the complete surface graph, renderer/map-layer/camera diagnostics, safety metrics, and every flight's operation plan, complete flight plan/history, route, clearances, model data, authoritative pose, rendered nose-up attitude, kinematics, fuel, trajectory stage, hold reason, and assigned gate/terminal/concourse. Runway reports and performance assessments are deterministic schematic entertainment data marked `notForNavigation`; see [weather-operations.md](weather-operations.md). Each `flight.fuelPlan` includes the deterministic arrival and departure route estimates plus block, trip, taxi, contingency, alternate, final-reserve, dispatch, and expected-arrival quantities; these are entertainment estimates, not dispatch data. `flight.kinematics` includes aviation heading degrees and a cardinal direction. `airport.airspaceProgram` contains its schema/data version, non-navigation disclaimer, fixes, airways, sectors, SIDs, STARs, constraints, holds, missed approaches, and FAA conceptual-source metadata. Every `flight.navigation` reports selected procedure/transition, remaining fixes, active fix, heading/altitude/speed assignments, vector or holding state, EFC, missed-approach ID, frequency ownership, handoff, and readback state. Its optional `routeClearance` preserves the proposed and prior fix lists, status, controller, timestamps, distance/time/turn estimate, safety decision, structured forecast warnings, and final reason. An active `flight.diversion` reports alternate airport, edge fix, instruction time/reason, captured start pose, exit stage, and stage progress. Top-level `separationRuleset` reports the complete active physical rules, coordinate basis, required radar NM, recent runway-operation history, and current violations. During a missed approach, `flight.goAround` reports its instruction time, reason, captured live start pose, selected missed-approach circuit stage, and stage progress; `weatherEscape` marks the protected straight-ahead segment. A departure `flight.weatherEscape` reports its hazard, timing, clear point, and status. `flight.takeoffPerformance` and its landing/runway-exit counterparts report the modeled condition code, braking action, performance multiplier, required and available distance, margin, and safety decision. `flight.runwayExit` reports the chosen graph node and taxiway, source, candidate count, threshold/touchdown/rollout distances, available pavement and stopping margin, braking action/multiplier, target exit speed and angle, rapid-exit state, stand-route and live-congestion costs, competing-traffic penalty, deterministic score, safety result, route edges, rationale, and selection time. Top-level `surfaceDisruptions` reports each restriction's kind, status, source, target, label, blocked edges, runway/taxiway/flight association, timing, recovery progress, rerouted flights, and reason. An affected flight's `surfaceReroute` records revision, rerouted/holding status, trigger IDs, prior and current edge lists, added distance, and explanation. Renderer diagnostics expose pending, active, and recovering counts. `surfaceGraph.gatePlanning` names the scheduling model, turn buffer, policy, and scoring factors. Each `flight.gate.assignment` reports planned/inbound/occupied/releasing/released status; a readable operational-zone name; scheduled and actual gate-in/out times; next destination and departure runway; airline/service fit; service area; arrival/departure route distance; score; rationale; revision; and prior stand. Each `flight.turnaround` reports planned/servicing/ready/released status, overall timing and progress, initial/target fuel, active and blocking services, and all seven tasks with dependency, reason, duration, progress, and actual timestamps. `serviceVehicles` reports the task/type/lifecycle, stand/zone/bay, depot, outbound and return graph routes, stand path, dispatch time, authoritative pose, actual/max speed, current edge/node, hold reason, and protected-area authorization for every active turn. Ground-operation state reports `pushbackCleared`, left/right/straight `pushbackDirection`, normalized `pushbackProgress`, graph-derived `pushbackReleaseProgress`, `tugAttached`, and `engineState` (`off`, `starting`, or `running`). It also reports the active ramp-control zone and capacity, ramp alley, inbound/outbound flow direction, stand lead-in/lead-out state, and an explainable automatic hold reason. `surfaceRoutePlanning` separates physical distance from routing cost, congestion penalty, and occupied edges considered by the router. `taxiPerformance` reports the aircraft's straight and turn speed limits, ground acceleration/braking, current stopping distance, design/current turn radius, next-turn distance and speed, current/minimum route wingtip margin, limiting edge, and route compatibility. Surface graph schema v3 includes stand compatibility, sourced parking/gate references, passenger facilities and official gate-count provenance, pushback/ramp metadata, named routes, bridge/tunnel semantics, explicit control points, operational zones, and FAA hot spots. A taxiing flight reports its exact `crossingHoldPointId` when stopped for a runway crossing.

Renderer diagnostics expose the applied accessibility palette plus the resolved environment phase, season, daylight, cloud/snow/wet-pavement mix, runway-light intensity, and number of tracked surface materials. Earlier aircraft-life fields remain available, including `airportLifeVisible`, `flights[].operationalDetail`, `flights[].systems`, the source-referenced aircraft catalog, and renderer asset budgets.

Routing interpretation: `surfaceRoutePlanning` reports the congestion penalty and penalized edges retained by the selected route. A zero value can mean the live router successfully avoided occupied edges; it does not mean that no occupied alternatives were considered.

Events carry `protocolVersion`, `apiVersion`, `sessionId`, a monotonic numeric `eventId`/`sequence`, and a globally unambiguous `eventKey`. A command attempt has a unique `commandId`; every synchronous simulation or lifecycle event it creates carries `causedByCommandId`, including accepted and rejected operational events. A scripted action has a unique `controller-*` decision ID; its resulting domain events and the typed `controller-decision` audit event carry `causedByControllerDecisionId`, while the audit payload contains the complete decision record. Scheduler-only traffic keeps both cause fields absent, so consumers can distinguish human/API commands, deterministic controllers, and background lifecycle behavior. Events also include command payloads and acceptance, flight/runway/taxiway context, and safety-hold or go-around details. Handoff coordination emits `handoff-offer`, `handoff-accept`, `handoff-reject`, `handoff-overdue`, `handoff-cancel`, `handoff-complete`, and compatibility `contact` events. Each atomic group issue emits one `group-instruction` event per member with the common instruction, authority, and callsign set in its detail. Route editing emits `route-preview`, `route-clearance-issued`, `route-readback-accepted`, `route-readback-rejected`, `route-clearance-cancelled`, and final `route-amendment` events with a deep-cloned clearance/warning payload. Other controller-authored movement adds `taxi-route-clearance`, `hold-position`, `taxi-resume`, `diversion`, and terminal-scope `divert` events. Gate planning adds structured `gate-assignment`, `gate-reassignment`, and `gate-release` payloads. Arrival planning emits `runway-exit-plan` with the complete resulting exit state whenever the stand, braking action, traffic, or final-approach refresh changes the decision. Surface changes emit `surface-reroute`, `recovery-start`, and `recovery-complete` with the resulting route/restriction context. Turnarounds add `turnaround-start`, per-task `service-start` / `service-complete`, and `turnaround-ready` events with service, progress, and readiness timing. Ramp equipment adds dispatch, arrival, hold/release, return, and stand-clear events with vehicle ID/type/status. Pushback adds `pushback-clearance`, `pushback-start`, `engine-start`, and `tug-release` events. Winter operations add `deicing-planned`, `deicing-queue`, `deicing-pad-entry`, `deicing-start`, `deicing-complete`, `deicing-expired`, and `deicing-return`, including the resulting pad, lane, cycle, queue, treatment, and holdover state. The in-page log retains the latest 500 events.

`recording()` returns a `local-full` replay schema 4 audit with protocol/API/snapshot versions, fixed-step interval, airport seed, initial state, accepted and rejected commands, weather and sound decisions, complete causal event log, immutable full-state frames, event markers, sharing disclosure, per-component fingerprints, and one manifest receipt. The visible replay scrubber is read-only and drives the 3D world, spatial environment mix, and nearby recorded sound/caption decisions from those frames. `replayTools.verify()` detects and localizes modified frames; `compare()` returns a bounded path-level state diff; `load()` verifies before opening a local file; and schema 3 migrates in memory with an explicit unsealed-legacy warning.

Raw Export files may include local controller identity, correlation IDs, event payloads, and free text. `replayTools.shareable()` instead creates a separately fingerprinted allowlisted package with those fields removed or replaced, while `seedLink()` produces a query/fragment-clean deterministic launch URL containing no replay or identity data. The browser inspector performs long fingerprint work cooperatively between animation updates. See [replay-verification.md](replay-verification.md) for exact semantics, limitations, migration, redaction, and validation.

`snapshot().audio` exposes the five-channel preset/levels, master and Web Audio context state, independent fictional-radio/caption settings, current weather/field/ramp/APU mix targets, bounded spatial-aircraft voices and audible flight IDs, deterministic scheduler/cooldown state, optional high-stakes-weather setting, readable caption queue, source manifest, and recorded sound-event count. The system is local and procedural: it uses no microphone, live radio, runtime voice generation, API key, or network audio. See [soundscape.md](soundscape.md).

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
  type: "request",
  envelope: {
    protocolVersion: "1.2.0",
    requestId,
    clientId: "local-observer",
    source: "agent",
    authority: { station: "supervisor" },
    expects: { apiVersion: "2.39.0", snapshotSchemaVersion: 41 },
    command: { action: "focusFlight", flightId: 12 },
  },
});
```

The game publishes formal `ready`, `event`, and request-correlated `response` envelopes on the already-namespaced `airport-auto` channel. Existing clients can keep reading those message types; API-2.x `command` input and `command-result` notifications remain available during the compatibility window. Each telemetry event is published once, not duplicated for formal and compatibility consumers. This bridge remains same-origin/local coordination and is not an authentication boundary.

## Authenticated remote gateway

An optional external gateway now provides the authentication and multi-controller boundary that `BroadcastChannel` deliberately does not. It is a separate Node process; static GitHub Pages contains no service or credentials and makes no connection until the operator explicitly connects a game host.

```js
await airportControl.remote.connect({
  endpoint: "wss://control.example/v1/ws",
  sessionId: "airport-auto",
  token: hostToken,
});

airportControl.remote.state();
airportControl.remote.disconnect();
```

Only `wss://` is accepted for remote hosts; unencrypted `ws://` is restricted to loopback development. The host token remains in private page memory only while the connection/reconnect policy is active and never appears in `snapshot()`, `remote.state()`, local storage, a URL, telemetry, or audit. The visible gateway panel is under **Controls → Replay & agent tools** and starts disconnected.

The service authenticates host, controller, spectator, and admin roles; permits one game host and one exclusive controller lease per station/session; enforces token station/session permissions, active-client identity uniqueness, command rate limits, response timeouts, bounded audit, reconnect grace, explicit station offer/accept, and an admin emergency stop. A read-only HTTP API exposes the latest bounded operations snapshot and evaluation metrics to permitted dashboards. Spectators and HTTP clients have no command route.

For each remote command the gateway replaces client-supplied `source`, `clientId`, `authority.station`, and `authority.actorId` with the authenticated controller and its active lease. The browser then calls the same formal dispatcher described above. Gateway authentication cannot satisfy flight ownership, phase, runway, separation, reservation, or collision checks by itself.

Remote state is a deliberate projection rather than the full local snapshot: airport/session context, weather, runway configuration, compact flights, queues, disruptions, coordination, workloads, and evaluation are included; the imported surface graph, renderer/input diagnostics, and replay buffers are not. Command results retain formal causality and a compact resulting state.

See [remote-control-gateway.md](remote-control-gateway.md) for the token manifest, controller console, WebSocket messages, HTTP endpoints, threat model, TLS/Origin requirements, container deployment, audit/retention guidance, and verification commands.

## Launch URL

```text
http://127.0.0.1:5173/?airport=ORD&mode=auto&scenario=rush&speed=3&autostart=1&telemetry=1
```

Supported airports are `LOCAL`, `ATL`, `ORD`, `DXB`, `HND`, `DFW`, `LHR`, `IST`, `DEN`, `LAX`, and `JFK`. Modes are `auto`, `assisted`, `manual`, and `watch`; densities are `quiet`, `realistic`, `busy`, `rush`, and `extreme`; separation rules are `forgiving` (default) and `realistic`; stations are `supervisor`, `approach`, `tower`, `ground`, and `ramp`; scenarios are `normal`, `rush`, `storm`, `closure`, `training`, and `emergency`.

Challenge launch values are `rush-hour`, `storm-operations`, `runway-closure`, and `emergency-priority`. For example, `?airport=ORD&challenge=storm-operations&autostart=1` starts the timed storm shift directly.

`density=busy` selects an initial traffic profile and rebuilds the opening bank at that density. `rules=realistic` enables the FAA-inspired physical terminal option; this remains a simulation ruleset and the wake categories are explicitly simplified rather than CWT/RECAT. `runwayConfig=ORD-EAST-IFR` requests a specific eligible runway plan after launch; `runwayConfig=auto` restores automatic selection. `weather=snow` opens the airport with contaminated-surface performance and active deicing routes; weather may also be `clear`, `haze`, `rain`, `fog`, `thunderstorm`, or `off`. `hazards=1` opts into rare deterministic wind-shear and microburst events; those events are otherwise disabled. `contrails=1` enables the otherwise-off upper-scope contrail layer. `?soak=1` starts an ORD Rush session at 3× for long-run health monitoring. Add `debug=1` for renderer/simulation probes and `detail=low` to force the mobile rendering tier.

See [deicing-operations.md](deicing-operations.md) for the complete winter lifecycle and deliberate limits.

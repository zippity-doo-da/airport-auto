# Airport control and telemetry

Airport Auto exposes a local, versioned interface for playtests, scripted controllers, dashboards, and agent experiments. All commands pass through the same authority and safety checks as the visible HUD. The interface does not provide a privileged collision bypass.

## Browser API

The current API version is `2.8.0`; snapshots use schema version `10`.

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
//   resultingState: { ... }
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
airportControl.request({ action: "setStation", station: "tower" });
airportControl.request({ action: "nextView" });
airportControl.request({ action: "zoomIn" });
airportControl.request({ action: "zoomOut" });
airportControl.request({ action: "resetCamera" });
airportControl.request({ action: "setNightMode", enabled: true });
airportControl.request({ action: "setRadarVisible", enabled: true });
airportControl.request({ action: "setRunwayLabelsVisible", enabled: false });
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
```

Map panning is a direct presentation interaction: drag empty ground with a mouse or one finger, or middle-drag from anywhere. Wheel and pinch zoom remain anchored under the pointer; selecting a flight resumes smooth follow, and `resetCamera` restores the centered default. `snapshot().renderer.camera` exposes the current focus, zoom, panning support, and extended ground dimensions for browser verification.

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
airportControl.request({
  action: "controlFlights",
  flightIds: [12],
  instruction: "hold",
});
airportControl.request({
  action: "controlFlights",
  flightIds: [12, 18],
  instruction: "expedite",
});
airportControl.request({
  action: "triggerEmergency",
  flightId: 12,
  type: "go-around",
});
```

Weather commands:

```js
airportControl.request({
  action: "setWeather",
  condition: "rain",
  directionDegrees: 270,
  windSpeed: 18,
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

In Manual mode, the normal departure sequence is: monitor the required fueling/baggage/cargo/cabin/maintenance tasks and their assigned ramp vehicles, wait until the turnaround is ready and the stand lane is physically clear, issue Ground pushback clearance, monitor tug/engine start and tug release, clear every required crossing, clear runway entry / line-up, wait until the aircraft is lined up, then clear takeoff. Assisted mode proposes the same pushback command only after services and stand clearance finish. Auto and Watch issue it through the same simulation method. Rejected early pushback commands name either the blocking services or equipment still clearing.

## Snapshot and events

Snapshots include the airport and seed, simulation clock, mode, speed, station, scenario, weather, active runway configuration, selection mode, transition queue, ends, dynamic roles, eligibility/restriction reasons, closure, runway reservations, proposed Assisted clearances, the complete surface graph, renderer/map-layer/camera diagnostics, safety metrics, and every flight's route, clearances, model data, authoritative pose, rendered nose-up attitude, kinematics, fuel, trajectory stage, hold reason, and assigned gate/terminal/concourse. `surfaceGraph.gatePlanning` names the scheduling model, turn buffer, policy, and scoring factors. Each `flight.gate.assignment` reports planned/inbound/occupied/releasing/released status; a readable operational-zone name; scheduled and actual gate-in/out times; next destination and departure runway; airline/service fit; service area; arrival/departure route distance; score; rationale; revision; and prior stand. Each `flight.turnaround` reports planned/servicing/ready/released status, overall timing and progress, initial/target fuel, active and blocking services, and all seven tasks with dependency, reason, duration, progress, and actual timestamps. `serviceVehicles` reports the task/type/lifecycle, stand/zone/bay, depot, outbound and return graph routes, stand path, dispatch time, authoritative pose, actual/max speed, current edge/node, hold reason, and protected-area authorization for every active turn. Ground-operation state reports `pushbackCleared`, left/right/straight `pushbackDirection`, normalized `pushbackProgress`, graph-derived `pushbackReleaseProgress`, `tugAttached`, and `engineState` (`off`, `starting`, or `running`). It also reports the active ramp-control zone and capacity, ramp alley, inbound/outbound flow direction, stand lead-in/lead-out state, and an explainable automatic hold reason. `surfaceRoutePlanning` separates physical distance from routing cost, congestion penalty, and occupied edges considered by the router. `taxiPerformance` reports the aircraft's straight and turn speed limits, ground acceleration/braking, current stopping distance, design/current turn radius, next-turn distance and speed, current/minimum route wingtip margin, limiting edge, and route compatibility. Surface graph schema v3 includes stand compatibility, sourced parking/gate references, passenger facilities and official gate-count provenance, pushback/ramp metadata, named routes, bridge/tunnel semantics, explicit control points, operational zones, and FAA hot spots; snapshot schema 10 adds authoritative service-vehicle state without altering the imported source asset. A taxiing flight reports its exact `crossingHoldPointId` when stopped for a runway crossing.

Events have a monotonic sequence number and include command payloads and acceptance, flight/runway/taxiway context, and safety-hold or go-around details. Gate planning adds structured `gate-assignment`, `gate-reassignment`, and `gate-release` payloads. Turnarounds add `turnaround-start`, per-task `service-start` / `service-complete`, and `turnaround-ready` events with service, progress, and readiness timing. Ramp equipment adds dispatch, arrival, hold/release, return, and stand-clear events with vehicle ID/type/status. Pushback adds `pushback-clearance`, `pushback-start`, `engine-start`, and `tug-release` events. The in-page log retains the latest 500 events.

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

Supported airports are `LOCAL`, `ATL`, `ORD`, `DXB`, `HND`, `DFW`, `LHR`, `IST`, `DEN`, `LAX`, and `JFK`. Modes are `auto`, `assisted`, `manual`, and `watch`; stations are `supervisor`, `approach`, `tower`, and `ground`; scenarios are `normal`, `rush`, `storm`, `closure`, `training`, and `emergency`.

`runwayConfig=ORD-EAST-IFR` requests a specific eligible runway plan after launch; `runwayConfig=auto` restores automatic selection. `?soak=1` starts an ORD Rush session at 3× for long-run health monitoring. Add `debug=1` for renderer/simulation probes and `detail=low` to force the mobile rendering tier.

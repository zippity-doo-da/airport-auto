# Traffic sandbox

Airport Auto's sandbox is a no-score, no-fail operations lab. It starts with a clear airport, keeps the normal authoritative motion and safety arbiter, and lets a player or local controller inject only the traffic they want. It is intended for relaxed watching, demonstrations, regression staging, and experimentation—not as a way to bypass separation or pavement rules.

## Entering and leaving

Open **Controls → Traffic sandbox** and choose **Enter clean sandbox**. Entry preserves the current airport, traffic density, control mode, simulation speed, and pause state, but clears active aircraft, vehicles, queues, counters, training, challenges, disruptions, and the previous shift clock. Weather and runway plans can then be changed with the normal controls.

The compact map badge confirms that scoring and failure closure are disabled. The ordinary score row is hidden; operational arrival/departure totals remain available in the control snapshot, but there is no grade, objective timer, station scorecard, or collision-triggered session ending. The collision envelope, runway protection, gate compatibility, wake separation, and controller authority remain fully active.

Choose **Leave sandbox** to continue the current airport as ordinary free play. Existing aircraft remain in motion and continuous traffic resumes on its normal demand schedule.

Shareable startup parameters:

```text
?airport=ORD&sandbox=1&autostart=1
?airport=ORD&sandbox=1&background=1&autostart=1
```

`background=1` is optional and only applies when `sandbox=1` is present.

## Injecting traffic

Each request chooses:

- **Flow:** arrival or departure.
- **Class:** airport mix, passenger, regional, cargo, or general aviation.
- **Runway:** automatic safe selection or one currently open runway with a compatible operating role.
- **Count:** one, two, four, or eight aircraft.

Requests release through a deterministic queue rather than appearing all at once. An arrival enters at the terminal-scope boundary on its normal procedure. A departure is placed at an immediately available compatible stand, on the ground, with a complete departure plan and normal pushback/taxi/takeoff lifecycle. A request waits with a plain-language explanation when an approach slot, stand, runway, performance limit, traffic cap, or protected path is unavailable.

The requested runway remains the aircraft's intent while that runway stays open, role-compatible, wind/performance-compatible, and safe. If a later configuration or disruption invalidates it, the ordinary safe re-plan rules take precedence.

**Cancel pending** removes unreleased aircraft from the request queue. **Clear board** cancels pending requests and removes active aircraft and service vehicles while preserving weather and the selected runway configuration. Neither operation weakens the safety model.

## Background traffic

Background demand starts off for an exact, empty lab. Enabling **Continuous background traffic** restores the airport's normal compressed schedule alongside injected flights. Turning it off removes unreleased background demand but does not delete aircraft that are already active.

## Local control interface

The UI, `window.airportControl`, and the `BroadcastChannel('airport-auto')` bridge use the same commands:

```js
airportControl.request({ action: "startSandbox", backgroundTraffic: false });
airportControl.request({
  action: "injectSandboxTraffic",
  direction: "arrival",
  trafficClass: "passenger",
  runwayId: null,
  count: 4,
});
airportControl.request({ action: "setSandboxBackgroundTraffic", enabled: true });
airportControl.request({ action: "cancelSandboxInjections" });
airportControl.request({ action: "clearSandboxTraffic" });
airportControl.request({ action: "stopSandbox" });
```

Every result has the standard `{ accepted, reason, eventId, resultingState }` shape. `snapshot().sandbox` exposes the lifecycle, request queue, released flight IDs, totals, compatible runway catalog, active-aircraft count, and current explanation. Injection events also enter telemetry and replay recordings.

Sandbox and active training/challenge sessions are mutually exclusive. A request to enter while either one is active is rejected with an explanation.

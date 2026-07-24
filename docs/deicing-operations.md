# Winter and deicing operations

Airport Auto 2.9 adds a deterministic winter departure lifecycle. It is an entertainment-scale operational model, not a holdover-time chart, dispatch tool, or source of real-world deicing guidance.

## When treatment is required

Treatment is required while weather is enabled, the condition is `snow`, and the simulated temperature is at or below 4 °C. Snow marks the movement surface contaminated, reduces taxi acceleration and braking, lengthens runway phases, increases arrival spacing, and limits approach capacity. Turning weather off restores the dry/clear model; turning wind off remains independent.

Snow can be selected in the normal weather control, requested with `?weather=snow`, or commanded through `airportControl`. Automatic weather keeps a winter bank active long enough for a remote-pad turn rather than changing conditions during the first taxi.

## Fixed-step lifecycle

Each departure carries a serializable deicing state:

1. `planned` — a compatible graph route is reserved from the stand through a treatment lane to the departure runway hold-short point.
2. `enroute` — the aircraft pushes and taxis on the authoritative surface graph toward the pad.
3. `queued` — it stops before the assigned lane and receives an explicit queue position.
4. `positioning` — the lane is free and the aircraft advances to the treatment position.
5. `treating` — the aircraft remains stopped while the treatment clock advances; procedural spray makes the state visible.
6. `protected` — the aircraft exits the pad and taxis with a visible holdover countdown.
7. `expired` — runway entry is rejected. Auto/Watch route the aircraft from its current hold-short point back through the pad for a new cycle.

Treatment takes 20–38 simulated seconds according to aircraft category. Holdover protection lasts roughly 330–486 simulated seconds with a deterministic seed adjustment. These compressed values exist to make the lifecycle observable in a browser session and deliberately do not reproduce an operational holdover-time table.

## O’Hare routing and capacity

The ORD model derives four routable treatment lanes from the sourced `Central Deicing Facility` operational zone. A route must reach the lane and the assigned runway hold-short point without using a runway, runway-access edge, or unapproved runway crossing. If no compatible winter route exists, pushback is unavailable and the flight explains why.

Lane arbitration is deterministic. One aircraft may position, receive treatment, or clear a lane while others retain ordered queue positions. Aircraft, service vehicles, stands, graph edges, nodes, alleys, ramp zones, runway crossings, and deicing stops continue to use the shared movement-safety model. The renderer samples the same authoritative route and stop position used by collision detection.

Aircraft already taxiing when a winter condition begins receive a recorded startup-treatment state rather than teleporting to a pad. Flights still at a stand receive the complete pad route.

## Controls, telemetry, and replay

The selected-flight panel displays the facility, lane, queue, treatment progress, fluid label, treatment cycle, and remaining holdover time. Flight chips summarize the active winter state. Line-up remains disabled until treatment is complete and unexpired.

Snapshot schema 11 exposes:

- `weather.temperatureC` and `weather.surfaceCondition`;
- `surfaceGraph.deicingFacilities` and `surfaceGraph.deicingPolicy`;
- each flight’s complete `deicing` state; and
- diagnostic counts for required, queued, treating, protected, and expired aircraft.

Lifecycle events are `deicing-planned`, `deicing-queue`, `deicing-pad-entry`, `deicing-start`, `deicing-complete`, `deicing-expired`, and `deicing-return`. Events and state are included in recordings and immutable replay frames.

The deterministic release test follows a departure from stand to pad, observes a real queue state, verifies zero ground speed during treatment, confirms a future holdover expiry, rejects runway entry after expiry, and checks that the second cycle begins and ends at the original hold-short node without a teleport or collision.

## Deliberate limits

- Fluid names communicate the gameplay state; mixture, precipitation intensity, inspection, airline procedure, and real holdover-table selection are not modeled.
- Treatment trucks are represented by a pooled spray effect rather than separately routed deicing rigs.
- Only airports with a routable deicing operational zone activate the complete pad workflow. Other airports remain clear-weather procedural schematics until equivalent sourced surface data exists.
- Runway braking is a condition multiplier, not a reported runway-condition-code calculation.

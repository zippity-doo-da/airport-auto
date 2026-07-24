# Explainable operation queues

Airport Auto 2.12 turns operational waiting into structured state. The queue inspector does not infer new movement rules and does not move aircraft. It explains the holds, clearances, reservations, turnaround dependencies, weather capacity, and release metering already enforced by the fixed-step simulation.

## Categories

- **Gate** — occupied or saturated stands and gate-assignment back-pressure.
- **Ramp** — ramp-zone capacity, opposing alleys, pushback, staging, and service-equipment conflicts.
- **Taxi** — pavement reservations, intersections, route closures, construction, and unavailable reroutes.
- **Crossing** — a specific runway hold-short point awaiting an individual crossing clearance or protected-runway release.
- **Runway** — arrival, entry, line-up, takeoff, closure, and runway-plan transition waits.
- **Wake** — game-scale arrival release metering when the active approach slots are full in otherwise normal weather.
- **Weather** — deicing, holdover, braking, visibility, wind, or weather-reduced arrival capacity.
- **Downstream** — turnaround services or another dependency that must finish before the next operation can begin.

Every entry contains a stable ID, category, priority, aircraft/vehicle/system identity, resource ID, wait time, queue position and length, causal aircraft IDs, and a readable explanation. A system entry is used when the airport itself is metering traffic rather than an already-rendered aircraft waiting at a stop point.

## Player controls

Use **Controls → Queues** to open the compact inspector, or call:

```js
airportControl.request({ action: 'setQueueInspectorVisible', enabled: true });
```

The filter can isolate one blocker class. Selecting an aircraft row focuses the same aircraft in the 3D world and flight strip. Closing the panel restores the clean map; queue diagnosis continues in simulation diagnostics and snapshots.

`?queues=1` opens the panel at launch. `airportControl.snapshot().queues` exposes the complete serializable snapshot for scripts and future agents.

## Boundaries

The current wake category describes Airport Auto's deliberately compressed game-scale release interval, not FAA physical wake-separation minima. The inspector explains the active model without claiming navigation or operational use. Future physical-separation work must replace the underlying rule first; the queue panel should only report that authoritative result.

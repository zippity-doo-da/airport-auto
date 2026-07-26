# Observer focus and follow

Airport Auto 2.27 adds one presentation-only focus system for aircraft, runways, named taxiways, gates, operation queues, and predicted conflicts. It changes where the camera looks; it never changes an aircraft route, clearance, speed, reservation, or safety decision.

## Normal controls

Press `F` or use the `◎` camera button to open **Observer focus**. Choose a target type and target, then select **Focus**. Previous and next cycle within the chosen type. The small following chip identifies the active subject without keeping the full navigator open.

- Aircraft follow their complete interpolated rendered pose—including altitude—while remaining tied to the authoritative fixed-step aircraft state. The camera raises its look target and eye together, so a go-around or climb-out stays in the central viewport instead of tracking the aircraft's ground projection.
- Runways, named taxiways, and gates focus a fixed airport location and choose a framing distance that fits the asset.
- Queues follow the queued aircraft, causal blocker group, service vehicle, runway, taxiway, or gate represented by the authoritative queue entry.
- Conflicts follow every involved aircraft and use the same prediction identity shown by the safety system.

Press `Escape` once to close the navigator while retaining focus. Press it again, use **Release**, select the same aircraft, click empty ground, drag/pinch/wheel the map, use a camera movement key or stick, change view, or reset the camera to return to free map control. If a transient queue, conflict, vehicle, or aircraft disappears, focus releases automatically with a plain-language status message.

On compact and short displays the navigator is an on-demand dock with 44px controls. Opening it closes overlapping queue/radar surfaces; the airport remains visible and the navigator can always be dismissed.

## Local control API

The backward-compatible aircraft command remains available:

```js
airportControl.request({ action: "focusFlight", flightId: 12 });
airportControl.request({ action: "focusFlight", flightId: null });
```

The generic command accepts a reference from the live catalog:

```js
const snapshot = airportControl.snapshot();
const taxiway = snapshot.focus.catalog.targets.find(
  (target) => target.kind === "taxiway" && target.id === "A",
);

airportControl.request({
  action: "focusTarget",
  target: { kind: taxiway.kind, id: taxiway.id },
});

airportControl.request({ action: "focusTarget", target: null });
```

Supported kinds are `flight`, `runway`, `taxiway`, `gate`, `queue`, and `conflict`. Unknown or expired references return `{ accepted: false, reason }`; they never fall back to an unrelated target.

`snapshot().focus` contains schema version 1, the current target, and a categorized serializable catalog. Each descriptor includes a stable key, label, explanation, world position/radius, suggested camera zoom, follow strategy, related flight IDs, optional service-vehicle ID, optional selectable aircraft ID, and presentation tone. `snapshot().selection.focusedTarget` exposes the compact active reference. `snapshot().renderer.camera` reports the three-dimensional camera focus, while its `target` reports resolved XYZ, normalized viewport position, tracking state, viewport containment, and whether the rendered subject is actually visible.

The renderer resolves moving targets from its already-interpolated aircraft and service-vehicle visuals. It does not calculate a second trajectory. That preserves the project invariant that simulation, collision detection, replay, telemetry, and visible movement describe the same operation.

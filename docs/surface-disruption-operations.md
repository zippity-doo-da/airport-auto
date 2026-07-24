# Surface restrictions and recovery

Airport Auto 2.11 treats runway closures, taxiway closures, construction zones, and disabled aircraft as changes to the authoritative movement-surface graph. They are not renderer-only decorations. Routing, reservations, runway selection, collision protection, replay, telemetry, and the 3D presentation all consume the same restriction state.

This is an entertainment model. It is not a NOTAM source, airport emergency plan, or operational decision aid.

## Controller workflow

The normal Controls drawer includes a **Surface availability** panel. The Supervisor may:

- close a runway or named taxiway;
- place a timed or indefinite construction zone;
- inspect pending, active, and recovering restrictions;
- see how many aircraft were rerouted; and
- reopen non-incident pavement.

A disabled aircraft can be declared only while it is on a taxi-in or taxi-out movement. Ground or Supervisor can dispatch recovery in Manual or Assisted operation. Auto and Watch dispatch recovery automatically through the same method.

The typed API exposes the same authority boundary:

```js
airportControl.request({
  action: "setSurfaceDisruption",
  kind: "taxiway-closure",
  targetId: "TWY-A",
  enabled: true,
  durationSeconds: 180,
});

airportControl.request({
  action: "clearSurfaceDisruption",
  disruptionId: "SD-1",
});

airportControl.request({
  action: "recoverDisabledAircraft",
  flightId: 12,
});
```

Each request returns an acceptance boolean and a plain-language reason. A rejected instruction does not partially mutate the graph.

## Graph and movement behavior

Every active restriction owns explicit blocked edge IDs:

- A runway closure covers that runway's runway and runway-access edges, removes it from new arrival/departure choices, and prompts affected approaches to go around and re-sequence to a compatible open runway.
- A taxiway closure covers all graph edges belonging to that named taxiway.
- A construction zone covers one deterministic taxiway, apron, or stand-lead-in edge.
- A disabled aircraft protects the edge it physically occupies and, when applicable, its protected runway.

Runway closure activation may wait while a flight already occupies protected pavement. New assignments stop using the runway immediately, but the established movement is allowed to clear before the edge restriction becomes active. A closure that would remove the final usable arrival or departure runway is rejected.

Taxiway and construction restrictions are rejected if an aircraft, service vehicle, or already-dispatched service route occupies the affected resource. Otherwise, each affected taxiing aircraft keeps its exact current edge and distance, computes a new compatible suffix to its original destination, and remaps progress without moving its authoritative pose. The renderer therefore cannot show a teleport or a route different from collision detection.

If no compatible suffix exists, the aircraft brakes into an explainable automatic hold. It retries once per simulation second and resumes only after a safe route becomes available. An aircraft assigned to an unfinished deicing movement holds rather than silently bypassing its pad.

Timed restrictions reopen after their modeled inspection time. The router then re-evaluates held traffic. Construction crosses, taxiway barriers, runway closure marks, and recovery beacons are map cues driven by restriction state; they do not create separate collision geometry or motion.

## Disabled-aircraft recovery

A disabled surface aircraft stops and blocks its occupied edge. Recovery has three deterministic phases:

1. the movement area is protected;
2. a tow-and-inspection interval progresses, scaled by aircraft length; and
3. the aircraft is removed, its reservations and assigned service vehicles are released, the restriction is cleared, and held traffic replans.

Structured `recovery-start` and `recovery-complete` events make that lifecycle observable to replay, UI, and controller agents. Recovery is deliberately compact: emergency response staging, tow routes, tug compatibility, passenger evacuation, maintenance disposition, and airport-specific inspection checklists are future work.

## Real-world boundary

The model follows several broad operational principles from current FAA material:

- airport construction requires planned operational-impact and safety controls;
- closed pavement must be conspicuously marked and communicated;
- a runway crossing still requires explicit authorization, including when a runway is closed; and
- an emergency closure should not reopen until aircraft recovery and a safety inspection are complete.

The source material is the [FAA construction-safety advisory circular AC 150/5370-2G](https://www.faa.gov/airports/resources/advisory_circulars/index.cfm/go/document.information/documentID/1032410), [FAA runway and taxiway construction guidance](https://www.faa.gov/airports/runway_safety/runway_construction), [FAA airport marking guidance](https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap2_section_3.html), [FAA pilot runway-safety practices](https://www.faa.gov/airports/runway_safety/pilots/best_practices), [FAA airfield-driver practices](https://www.faa.gov/airports/runway_safety/airfield_drivers/best_practices), and [FAA airport emergency planning guidance AC 150/5200-31C](https://www.faa.gov/documentlibrary/media/advisory_circular/150_5200_31c_consolidated.pdf).

Airport Auto compresses time and procedures for a browser simulation. It does not ingest live closures or claim that its recovery duration, markings, routing decision, or reopening process reproduces a particular airport's current rules.

## Release validation

The dedicated deterministic gate verifies:

- graph target resolution and blocked-edge projection;
- Supervisor/Ground authority boundaries and explainable rejection;
- alternate-route selection without a pose jump or current-edge abandonment;
- collision-free motion around a timed construction restriction;
- automatic reopening;
- capacity-preserving runway closure and approach reassignment; and
- disabled-aircraft protection, recovery events, towing completion, and reservation release.

The full release gate continues to run airport-data, surface-motion, gate, turnaround, service-vehicle, deicing, runway-exit, fixed-step, trajectory, collision, browser, lint, and production-build checks.

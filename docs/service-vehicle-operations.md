# Service-vehicle operations

Airport Auto 2.8 gives turnaround equipment authoritative fixed-step motion. Vehicles are operational entities rather than decorative particles: each belongs to one flight and service task, owns a serializable pose, requests shared surface resources, and can delay service or pushback.

## Vehicle families

Required tasks may dispatch a fuel truck, baggage train, cargo loader, catering truck, cleaning van, maintenance van, or passenger coach. Terminal-gate boarding uses the terminal connection and therefore does not create a bus; a remote-stand boarding task does.

The models are deliberately low-detail procedural silhouettes suitable for the wide ATC view. They are pooled by type and use the same high/low-detail renderer policy as aircraft.

## Route and stand lifecycle

Each vehicle advances through `scheduled`, `dispatching`, `staged`, `approaching`, `servicing`, `clearing`, `returning`, and `complete` states:

1. A deterministic depot and outbound/return graph route are selected inside or near the assigned operational zone.
2. The router blocks runway, runway-access, and runway-crossing edges. Version 2.8 grants no protected-movement authorization to service equipment.
3. The vehicle follows the graph to a service-specific staging position outside the stand lane.
4. Once the aircraft is at the stand and task dependencies permit, it reserves a left/right service lane and unique bay, then approaches the aircraft.
5. The task clock begins only after the vehicle reaches that bay.
6. After task completion, the vehicle clears the stand lane before returning to its depot. Pushback remains unavailable until every vehicle is out of `approaching`, `servicing`, or `clearing` state.

The graph-to-staging connector, stand approach, clearing path, and graph return are continuous. The simulation owns position, heading, speed, route progress, current edge/node, hold state, and protected-area state. Three.js interpolates those values but does not create another path.

## Reservations and safety

Aircraft and vehicles use one per-tick reservation ledger. A service vehicle claims graph edges exclusively because it is slower and must not be overtaken in the compact ramp representation. It also claims the junction behind its body until clear, upcoming nodes, directional alleys, and finite-capacity ramp zones. Staging positions, the graph-to-staging connector, stand-side lanes, and service bays are exclusive resources.

Right-of-way follows physical occupancy instead of array order: inbound equipment already on the stand connector clears toward staging, outbound equipment already on the graph clears away, and the following vehicle waits at the preceding resource. A returner waiting at staging is released before another vehicle can clear through that parked position. This keeps multiple independent ramp movements live without allowing a stopped vehicle to become an obstacle for the nominal winner.

Auto and Watch use the ledger for full aircraft sequencing. Assisted and Manual retain controller authority over aircraft-to-aircraft movement, but an aircraft is still stopped from entering an edge occupied by service equipment. Vehicles always yield when their requested route is unavailable and emit an explainable hold/release event.

Diagnostics report current vehicle/vehicle and vehicle/aircraft separation conflicts plus any planned protected-edge violation. The release validation drives a live ORD turn, requires concurrent vehicle movement and concurrent servicing, verifies task/vehicle ordering and pushback stand clearance, and permits zero separation conflicts or unauthorized protected-area entries.

## API and replay

Snapshot schema 10 exposes every vehicle's task, type, lifecycle state, stand/zone/bay, depot, graph routes, stand path, dispatch time, progress, authoritative position and heading, actual/max speed, current edge/node, hold reason, and protected-area authorization state. Lifecycle events are `service-vehicle-dispatch`, `service-vehicle-arrive`, `service-vehicle-hold`, `service-vehicle-release`, `service-vehicle-return`, and `service-vehicle-clear`.

Full vehicle routes and poses are cloned into replay frames. Browser presentation interpolation includes vehicle position, heading, progress, and speed so fixed-step safety does not create visible 20 Hz stutter.

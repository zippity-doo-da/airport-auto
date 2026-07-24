# Turnaround operations model

Airport Auto 2.7 replaces the former stand countdown with a deterministic fixed-step servicing plan. The plan is created alongside the gate assignment, begins at actual gate-in, controls fuel and pushback readiness, and remains available in replay and agent snapshots after release.

## Service plan

Every flight exposes all seven service types, including tasks that are not required for that turn:

- fueling raises the aircraft from its actual gate-in fuel to a deterministic dispatch target;
- baggage unload/load is required for passenger flights;
- cargo handling replaces baggage and cabin work for freighters;
- catering is scheduled by aircraft/route-scale needs and is optional on regional turns;
- cleaning is required before passenger boarding;
- boarding waits for every required cleaning and catering task;
- maintenance is an optional deterministic transit inspection.

Independent tasks begin together and advance from the authoritative simulation clock. Task start offsets encode dependencies, so the result is invariant to browser frame rate and update partitioning. Durations are compressed gameplay values scaled by aircraft category and center/airfield scope; they are not published airline service-level targets.

## Readiness and control

A turn moves through `planned`, `servicing`, `ready`, and `released` states. Ground pushback is rejected until all required tasks are complete, and the rejection names the blocking services. Assisted mode does not propose pushback early. Auto and Watch use the same readiness gate.

The flight chip shows live task progress. Selecting a flight at a stand opens a compact task panel with required work, waiting/active/complete state, and overall progress. Fuel shown in the chip is driven by the fueling task rather than by an independent animation.

The API exposes full task definitions, dependency and selection reasons, planned and actual timestamps, fuel target, active/blocking service lists, and structured `turnaround-start`, `service-start`, `service-complete`, and `turnaround-ready` events.

## Current boundary

This milestone models the operation, not the equipment. Belt loaders, fuel trucks, catering trucks, cargo loaders, and maintenance vehicles are not rendered or routed yet. Their movement-area-safe routes and stand-side reservations are the next Milestone 2 item.

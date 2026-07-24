# Turnaround operations model

Airport Auto 2.7 replaced the former stand countdown with a deterministic fixed-step servicing plan. Airport Auto 2.8 connects vehicle-backed tasks to physical ramp equipment. The plan is created alongside the gate assignment, begins at actual gate-in, controls fuel and pushback readiness, and remains available in replay and agent snapshots after release.

## Service plan

Every flight exposes all seven service types, including tasks that are not required for that turn:

- fueling raises the aircraft from its actual gate-in fuel to a deterministic dispatch target;
- baggage unload/load is required for passenger flights;
- cargo handling replaces baggage and cabin work for freighters;
- catering is scheduled by aircraft/route-scale needs and is optional on regional turns;
- cleaning is required before passenger boarding;
- boarding waits for every required cleaning and catering task;
- maintenance is an optional deterministic transit inspection.

Independent tasks may run together. A vehicle-backed task waits until its assigned equipment reaches the service bay; boarding also waits for cleaning and any required catering. Once a task starts, its own fixed-step elapsed clock is authoritative. Durations are compressed gameplay values scaled by aircraft category and center/airfield scope; they are not published airline service-level targets.

## Readiness and control

A turn moves through `planned`, `servicing`, `ready`, and `released` states. Ground pushback is rejected until all required tasks are complete and every truck or cart has cleared the stand-side lane. Rejections distinguish incomplete services from equipment still clearing. Assisted mode does not propose pushback early. Auto and Watch use the same readiness gate.

The flight chip shows live task progress. Selecting a flight at a stand opens a compact task panel with required work, waiting/active/complete state, and overall progress. Fuel shown in the chip is driven by the fueling task rather than by an independent animation.

The API exposes full task definitions, dependency and selection reasons, planned and actual timestamps, fuel target, active/blocking service lists, assigned vehicle state, and structured turnaround, service, and vehicle lifecycle events.

Vehicle routes and protection are detailed in [service-vehicle-operations.md](service-vehicle-operations.md). After stand servicing, snow may add a separate pad queue, treatment, and holdover gate before runway entry; see [deicing-operations.md](deicing-operations.md). Individually routed deicing rigs, lavatory/water service, multiple-cart consists, and airline-specific fleet choreography remain outside this release.

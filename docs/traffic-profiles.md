# Airport operation profiles

Airport Auto 2.13 gives every airport a deterministic, time-of-day operation profile. The profile is an entertainment-scale demand model: it creates a readable hub rhythm without claiming to reproduce a live schedule, current runway count, or airline dispatch plan.

## Compressed local day

One fixed-step simulation second advances the airport's local operation clock by one minute, so a complete offline day takes 24 minutes at 1×. The normal speed control advances the same authoritative clock; weather, movement, demand, and telemetry remain synchronized.

Profiles cover midnight through midnight with contiguous periods. Demand and traffic shares blend through the final portion of each period, preventing a hard burst or pause at a bank boundary. Three profile archetypes currently ship:

- hub-banked for ATL, ORD, DFW, and DEN;
- international-gateway for DXB, HND, LHR, IST, LAX, and JFK;
- local-mixed for each generated airfield.

Each current state exposes an arrival/departure share and passenger, cargo, regional, and general-aviation shares. Arrival share and demand change the continuous arrival interval. Departure share and demand change initial departure-bank size and the cadence at which push-ready aircraft enter the outbound surface flow. Scenario, weather, runway capacity, wake spacing, gate capacity, and the safety arbiter still bound actual throughput.

Every aircraft leg records the traffic class, arrival/departure direction, source period, scheduled local minute, and demand level that generated it. The flight strip shows the class; `airportControl.snapshot().operations` exposes the full profile and current state, while each `flights[].operationPlan` preserves the leg-level record for replay and agents.

## Fleet mapping

Traffic classes select a compatible fleet before runway and stand planning:

- passenger: A320, 737-800, A350-900, or 787-9;
- regional: E175 or Q400;
- cargo: 777 freighter or cargo-service 737-800;
- general aviation: Pilatus PC-12 NGX.

The PC-12 adds a true single-engine, light-wake utility turboprop rather than relabeling a regional airliner. Its 14.40 m length, 16.28 m span, 4.74 t maximum takeoff weight, 290 KTAS cruise, 758 m takeoff distance over a 50 ft obstacle, 661 m landing distance over a 50 ft obstacle, and 1,920 ft/min climb reference come from the [Pilatus PC-12 NGX factsheet](https://oldwww.pilatus-aircraft.com/data/document/Pilatus-Aircraft-Ltd-PC-12NGX-Factsheet.pdf). Game-scale approach, taxi, acceleration, and turning values remain explicit simulation parameters.

General-aviation PC-12 traffic prefers a compatible GA zone, then a remote ramp, before falling back to terminal or other parking. It uses the same graph routing, stand occupancy, surface reservations, runway-performance checks, and collision protection as every airliner.

## Sources and fidelity

U.S. hub annual volume metadata points to the FAA [Air Traffic Activity Data System](https://www.faa.gov/newsroom/airport-operations-and-ranking-reports-using-air-traffic-activity-data-system-atads), where an operation is a takeoff or landing. O'Hare's broad day shape is informed by the FAA Terminal Area Plan's [quarter-hour arrival and departure simulation tables](https://www.faa.gov/sites/faa.gov/files/TAP_Final_EA_Appendix_D_4.pdf).

The bands, compression, mixes, and all non-ORD time-of-day shapes remain purpose-built schematic design. Airline-specific connecting banks, schedule-derived fleets, density presets, arrival metering, release slots, diversions, and live feeds remain separate roadmap work.

## Validation

`npm run test:traffic-profiles` verifies all 11 airport choices, 69 contiguous periods, normalized traffic shares, smooth period boundaries, deterministic class selection, the compressed-clock wrap, initial mixed arrival/departure traffic, fixed-step period advancement, PC-12 reference values, and zero collision/obstacle conflicts in the integration run.

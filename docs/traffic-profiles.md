# Airport operation profiles

Airport Auto 2.14 gives every airport a deterministic, time-of-day operation profile plus a separate airline traffic program and capacity manager. The result is an entertainment-scale demand model: it creates a readable hub rhythm without claiming to reproduce a live schedule, ticketed flight, or airline dispatch plan.

## Compressed local day

One fixed-step simulation second advances the airport's local operation clock by one minute, so a complete offline day takes 24 minutes at 1×. The normal speed control advances the same authoritative clock; weather, movement, demand, and telemetry remain synchronized.

Profiles cover midnight through midnight with contiguous periods. Demand and traffic shares blend through the final portion of each period, preventing a hard burst or pause at a bank boundary. Three profile archetypes currently ship:

- hub-banked for ATL, ORD, DFW, and DEN;
- international-gateway for DXB, HND, LHR, IST, LAX, and JFK;
- local-mixed for each generated airfield.

Each current state exposes an arrival/departure share and passenger, cargo, regional, and general-aviation shares. Arrival share and demand change the continuous arrival interval. Departure share and demand change initial departure-bank size and release-slot cadence. Aircraft may push and taxi concurrently; the slot is enforced in the runway queue at hold-short so demand management does not serialize the entire ramp. Scenario and traffic density are independent controls. Weather, runway capacity, wake spacing, gate capacity, pavement reservations, and the safety arbiter still bound actual throughput.

Every aircraft leg records the traffic class, arrival/departure direction, source period, scheduled local minute, and demand level that generated it. Its complete `flightPlan` also stores origin, destination, a clearly labeled schematic route, procedure, airline, aircraft, gate intent, runway/end intent, release time, ETA, status, revision, and amendment history. The flight strip shows the route and class; `airportControl.snapshot().operations` exposes the full profile, airline program, density, and flow state.

## Density and pressure relief

Traffic density is independent of control mode, scenario, weather, and playback speed:

- Quiet presents about half nominal demand with a two-flight invisible holding queue.
- Realistic uses the airport profile's nominal modeled demand and capacity.
- Busy raises demand faster than modeled capacity and makes metering visible.
- Rush represents hub-bank pressure with deeper queues and coordinated capacity.
- Extreme is a deterministic queue/recovery stress profile, not a real-throughput claim.

Each profile publishes its demand, arrival/departure capacity, holding, active-aircraft, maximum-delay, and recovery assumptions in the API. None changes collision, wake, runway-protection, pavement, or aircraft-performance rules.

New arrivals first enter a bounded off-map meter. When approach, runway, entity, gate, or surface capacity is unavailable, they wait without appearing mid-map; excess or over-delayed demand diverts before map entry. Ready departures receive ordered release slots but may push and taxi concurrently, then wait at hold-short. An expired slot is cancelled and deterministically replanned rather than leaving a permanent head-of-line blocker. The same state feeds the HUD, operation-queue inspector, replay, diagnostics, and controller API.

## Airline programs

Each hub has deterministic representative operator weights, time-of-day bank multipliers, traffic-class fleet mixes, route markets, and terminal/gate preferences. O'Hare uses the sourced CDA concourse and cargo-zone relationships already present in its surface graph. Other hubs use sourced airline/terminal relationships where available and normalized stand sectors on their schematic layouts. All weights, destinations, and timings are purpose-built—not live schedules.

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

The bands, compression, mixes, airline weights, fleet probabilities, route markets, and all non-ORD time-of-day shapes remain purpose-built schematic design. Representative operator and terminal relationships are informed by official airport directories for [ATL](https://www.atl.com/about-atl/atl-factsheet/), [ORD](https://www.flychicago.com/business/CDA/factsfigures/pages/facility.aspx), [DFW](https://www.dfwairport.com/explore/plan/airlines/), [DEN](https://www.flydenver.com/airlines/), [DXB](https://dubaiairports.ae/airlines), [HND](https://tokyo-haneda.com/en/flight/company_list.html?tab=intFlight), [LHR](https://www.heathrow.com/airline-contact-info/british-airways), [LAX](https://www.flylax.com/lax-airline-list), and [JFK](https://www.jfkairport.com/explore-jfk/terminals). IST remains a schematic program informed by the [Turkish Airlines destination network](https://www.turkishairlines.com/en-int/flight-destinations/). Live schedules and traffic feeds remain separate roadmap work.

## Validation

`npm run test:traffic-profiles` verifies all 11 airport choices, 99 contiguous periods, normalized traffic shares, smooth period boundaries, deterministic class selection, the compressed-clock wrap, initial mixed arrival/departure traffic, fixed-step period advancement, PC-12 reference values, and zero collision/obstacle conflicts in the integration run.

`npm run test:traffic-flow` verifies all five density profiles, 11 airline programs, 1,760 deterministic airline/fleet selections, complete plans and amendments, metering/release/diversion/cancellation transitions, bounded history, physical stand exclusivity, seven concurrent taxi movers, new entities beyond the startup bank, and zero collisions or incursions across a 12-hour compressed Extreme ORD session.

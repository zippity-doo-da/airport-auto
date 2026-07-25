# Airport operations model

Airport Auto is an entertainment simulation. Named hubs use simplified, recognizable runway patterns and purpose-built surface graphs; they are not current aeronautical data or suitable for navigation.

## O'Hare model

The O'Hare schematic contains six east-west runways and the 04/22 diagonal pair. Six sourced operating plans are modeled:

| Plan                     | Arrivals                  | Departures    | Simulated restriction                                         |
| ------------------------ | ------------------------- | ------------- | ------------------------------------------------------------- |
| West parallel            | 27R, 27C, 28C             | 27L, 28R, 22L | Default and marginal-weather-capable                          |
| East parallel            | 09L, 09C, 10C             | 09R, 10L      | Clear/visual weather, at least 5 mi visibility                |
| West high-arrival        | 27R, 27C, 28C, offset 28L | 27L, 28R      | Clear Rush traffic, at least 7 mi visibility; 22L unavailable |
| East offset arrivals     | 09L, 09C, 10C, offset 10R | 09R, 10L      | Clear Rush traffic, at least 7 mi visibility                  |
| East instrument          | 09L, 09C, 10R             | 09R, 10L      | Rain/fog; 10C and 10R are not simultaneous arrivals           |
| 22 crosswind contingency | 22R                       | 22L           | Wind at least 18 kt and within 55° of 220°                    |

The high-arrival plans are gameplay implementations based on configurations evaluated in the FAA’s 2022 O’Hare Terminal Area Plan environmental assessment; they are not a claim about the live airport’s current runway assignment. The strong-southerly contingency follows the FAA runway-utilization description. Automatic selection considers wind, weather, visibility, scenario, closure, and a small stability bias. A Supervisor can request any currently eligible plan.

Configuration changes use a drain-then-switch rule. The complete old plan—including ends, arrival/departure roles, markings, and lights—stays authoritative while affected approach, landing, taxi-in, taxi-out, or takeoff traffic clears. New arrivals and taxi-out releases are metered during that interval. The complete target plan is then applied in one fixed step; there is no mixed partial state.

The terminal apron is geometrically separated from perimeter taxi routes and runway-access spurs. Stands have unique physical occupancy and explicit lead-in/lead-out paths, while sourced apron polygons define finite-capacity ramp-control zones. Named ramp alleys receive directional flow locks: following traffic may proceed, but opposing traffic waits until the alley clears. Taxi routes follow the imported graph and add live congestion costs when alternatives exist. Each arrival selects a pavement-connected runway exit by aircraft stopping performance, current braking action, exit geometry and speed, competing arrival plans, live route congestion, and the assigned stand. The landing path ends at that graph node and taxi-in begins at the same node; its post-exit route cannot immediately cross back over the landing runway. Gate plans reserve non-overlapping future windows and score airline/terminal affinity, aircraft fit, passenger/cargo service, arrival time, and both arrival and departure taxi routes. At the stand, explicit fueling, baggage/cargo, catering, cleaning, boarding, and optional maintenance tasks run concurrently or through declared dependencies. Their assigned service vehicles share edge/node/ramp reservations with aircraft, use exclusive staging/side-lane/bay reservations, and cannot route through a protected runway area. During snow, ORD departures receive a graph route through one of four Central Deicing Facility lanes, wait in an ordered queue, stop for treatment, and receive a holdover clock; expired protection blocks runway entry and routes the aircraft back from its current hold-short point. These remain readable game abstractions, not a one-for-one transcription of current controller or airline agreements.

Useful real-world references for future fidelity work:

- FAA digital terminal procedures and current airport diagrams: https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/
- FAA arrival and approach procedures: https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_4.html
- FAA radar separation: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_5.html
- FAA airport traffic control, taxi and ground movement: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap3_section_7.html
- FAA landing procedures: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap3_section_10.html
- FAA AC 150/5300-13B airport and taxiway design: https://www.faa.gov/airports/resources/advisory_circulars/index.cfm/go/document.current/documentNumber/150_5300-13B
- Airbus aircraft characteristics and airport-planning manuals: https://www.aircraft.airbus.com/en/customer-care/fleet-wide-care/airport-operations-and-aircraft-characteristics/aircraft-characteristics
- Boeing airplane characteristics for airport planning: https://www.boeing.com/commercial/airports/plan-manuals
- Chicago Department of Aviation airport operations: https://www.flychicago.com/community/ORDnoise/AirportOperations/Pages/default.aspx
- Chicago Department of Aviation 2026 gate reallocation: https://www.flychicago.com/business/media/news/pages/article.aspx?newsid=1959
- Chicago Department of Aviation O'Hare facility inventory: https://www.flychicago.com/business/cda/factsfigures/pages/facility.aspx
- Chicago Department of Aviation cargo overview: https://flychicago.com/business/cargo/pages/default.aspx
- FAA O'Hare Terminal Area Plan Final Environmental Assessment, Chapter 4: https://www.faa.gov/sites/faa.gov/files/TAP_Final_EA_Chapter_4.pdf
- FAA O'Hare runway utilization: https://www.faa.gov/airports/airport_development/omp/faq/runway_utilization

## Rules enforced by the simulation

- Arrivals enter at the map boundary and use a continuous approach, flare, threshold touchdown zone, rollout, and runway exit.
- Every airport advances through a compressed local day with smoothly blended demand periods. The active arrival/departure and passenger/cargo/regional/general-aviation mix drives traffic generation, while physical capacity and the safety arbiter remain authoritative.
- A safe exit must provide the modeled rollout plus an 85 m turn margin; wet and contaminated pavement lengthen the prediction, larger aircraft normally select later exits, and a final-approach refresh can avoid newly occupied pavement.
- Departures receive an explicit Ground pushback clearance, move backward from the stand with a connected tug while engines start, release the tug at the graph's ramp node, taxi to a hold-short point, line up, accelerate down a model-appropriate runway distance, rotate, and climb out.
- Physical speed and acceleration advance path distance; the fixed-step simulation owns the resulting pose consumed by both the renderer and collision system.
- Each aircraft type has separate straight-taxi speed, turn-speed, ground acceleration, braking, design turn radius, and wingspan. The simulation replaces eligible graph corners with tangent circular arcs, brakes before them, and rejects routes below the modeled wingtip margin.
- Ground aircraft remain on modeled runway, taxiway, apron, or stand pavement.
- Active-runway plans follow eligible wind/weather/procedure conditions when automatic selection is enabled, but never change underneath protected traffic.
- Every generated airport has a versioned, explicitly non-navigational terminal program. Arrivals select a runway-compatible STAR transition from a map-edge gateway and fly its fixes, constraints, downwind/base/intercept geometry, approach, and missed-approach route; departures retain the complete runway roll before joining their selected SID heading and climb/handoff fixes.
- Heading, altitude, speed, direct-to, hold/EFC, approach, landing, taxi, and departure instructions pass through one command arbiter. Approach, Tower, and Ground own distinct phases and must explicitly hand aircraft off; Supervisor can cover every position.
- Runway, taxiway, construction, and disabled-aircraft restrictions block explicit graph edges. Affected traffic keeps its occupied edge, reroutes only its remaining path without jumping, or brakes into an explainable hold until compatible pavement reopens.
- A disabled surface aircraft protects its occupied resource until Ground/automatic recovery completes a modeled tow and inspection; closing the last usable arrival or departure runway is rejected.
- Runway entry, crossing, and takeoff are distinct clearances.
- Runway reservations protect intersecting and occupied runways while still permitting independent parallel operations.
- The queue inspector reports the active gate, ramp, taxi, crossing, runway, wake, weather, and downstream dependency from authoritative state, including causal traffic and shared-resource position; it never invents a separate movement decision.
- A renderer-independent collision envelope remains the final safety net. Above it, the selected Forgiving or FAA-inspired terminal ruleset checks horizontal distance in nautical miles, vertical distance in feet, runway-operation time, runway relationships, simplified wake group, visibility, ceiling, surface condition, wind, and active configuration before movement or a clearance is committed.
- Gate slots cannot be reused while physically occupied; future non-overlapping assignment windows may reuse a stand, while surface traffic reserves upcoming nodes and edges, exclusive stand paths, directional alleys, and ramp-zone capacity.
- Vehicle-backed tasks cannot start before their equipment reaches the stand; pushback cannot start until that equipment clears the stand lane.
- Snow requires a routable treatment-pad plan before pushback. Lane occupancy is exclusive, treatment occurs at zero ground speed, and runway entry requires active holdover protection.
- Auto and Watch issue the same discrete clearances that a Manual controller must issue; Assisted proposes and explains those commands without silently executing them.
- Simulation speed advances one shared clock; taxiing does not secretly run at a different multiplier.

## Deliberate simplifications

- Layouts preserve the operational impression of each hub rather than survey-grade geometry.
- Time-of-day bands and traffic mixes are deterministic schematic schedules, not live or historical flight timetables. ORD's broad shape is informed by FAA quarter-hour simulation data; airline-specific banks and schedule-derived fleets remain future work.
- Taxiway naming is partial and schematic; ramp-control jurisdictions derive from sourced apron polygons rather than current airline or controller agreements.
- Approach and departure procedure names, fixes, sectors, and constraints are deterministic schematic content inspired by published procedure concepts, not current published SID/STAR data and never suitable for navigation.
- Wake class affects spacing, but the game does not reproduce every FAA separation category or local waiver. The E175 and Q400 use the medium game category, not the former misleading light label.
- A `wake` queue entry explains the ruleset's simplified time-based arrival or departure release meter. The separate airborne separation diagnostic reports physical nautical-mile and vertical-foot minima, but neither model claims complete FAA CWT/RECAT coverage or local-facility procedure fidelity.
- Gate assignment uses 40 sampled playable stands rather than all 199 real passenger gates; airline affinities are schematic, scheduled windows are simulation time rather than a live airline feed, and actual leases/irregular operations are not reproduced.
- Pushback uses a compact procedural tug and graph-derived ramp release. Turnaround equipment uses stylized procedural vehicle families rather than airline-specific models; individually routed deicing rigs, detailed fluid/inspection rules, emergency-response staging, tow-route choreography, NOTAM ingestion, and live METAR/traffic feeds are not yet modeled.
- Manufacturer airport-planning manuals and FAA taxiway-design guidance bound the ground model, but its speeds, radii, and imported edge-clearance corridors remain entertainment-scale parameters—not dispatch or airport-engineering data.
- O'Hare ships versioned offline OSM surface and surrounding-context assets; other hubs retain procedural surroundings.

The deterministic test harness validates every airport surface graph, samples complete arrival/departure trajectories, checks pavement and building clearance, runs seeded fixed-step flow, and soaks collision envelopes for multiple simulated hours.

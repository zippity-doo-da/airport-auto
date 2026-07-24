# Airport operations model

Airport Auto is an entertainment simulation. Named hubs use simplified, recognizable runway patterns and purpose-built surface graphs; they are not current aeronautical data or suitable for navigation.

## O'Hare model

The O'Hare schematic contains six east-west runways and the 04/22 diagonal pair. Six sourced operating plans are modeled:

| Plan | Arrivals | Departures | Simulated restriction |
| --- | --- | --- | --- |
| West parallel | 27R, 27C, 28C | 27L, 28R, 22L | Default and marginal-weather-capable |
| East parallel | 09L, 09C, 10C | 09R, 10L | Clear/visual weather, at least 5 mi visibility |
| West high-arrival | 27R, 27C, 28C, offset 28L | 27L, 28R | Clear Rush traffic, at least 7 mi visibility; 22L unavailable |
| East offset arrivals | 09L, 09C, 10C, offset 10R | 09R, 10L | Clear Rush traffic, at least 7 mi visibility |
| East instrument | 09L, 09C, 10R | 09R, 10L | Rain/fog; 10C and 10R are not simultaneous arrivals |
| 22 crosswind contingency | 22R | 22L | Wind at least 18 kt and within 55° of 220° |

The high-arrival plans are gameplay implementations based on configurations evaluated in the FAA’s 2022 O’Hare Terminal Area Plan environmental assessment; they are not a claim about the live airport’s current runway assignment. The strong-southerly contingency follows the FAA runway-utilization description. Automatic selection considers wind, weather, visibility, scenario, closure, and a small stability bias. A Supervisor can request any currently eligible plan.

Configuration changes use a drain-then-switch rule. The complete old plan—including ends, arrival/departure roles, markings, and lights—stays authoritative while affected approach, landing, taxi-in, taxi-out, or takeoff traffic clears. New arrivals and taxi-out releases are metered during that interval. The complete target plan is then applied in one fixed step; there is no mixed partial state.

The terminal apron is geometrically separated from perimeter taxi routes and runway-access spurs. Stands have unique occupancy, taxi routes follow the imported graph, and source references preserve hundreds of named taxiway and ramp groups. Their operational use remains a readable game abstraction, not a one-for-one transcription of current controller instructions.

Useful real-world references for future fidelity work:

- FAA digital terminal procedures and current airport diagrams: https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/
- FAA airport traffic control, taxi and ground movement: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap3_section_7.html
- FAA landing procedures: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap3_section_10.html
- FAA AC 150/5300-13B airport and taxiway design: https://www.faa.gov/airports/resources/advisory_circulars/index.cfm/go/document.current/documentNumber/150_5300-13B
- Airbus aircraft characteristics and airport-planning manuals: https://www.aircraft.airbus.com/en/customer-care/fleet-wide-care/airport-operations-and-aircraft-characteristics/aircraft-characteristics
- Boeing airplane characteristics for airport planning: https://www.boeing.com/commercial/airports/plan-manuals
- Chicago Department of Aviation airport operations: https://www.flychicago.com/community/ORDnoise/AirportOperations/Pages/default.aspx
- FAA O'Hare Terminal Area Plan Final Environmental Assessment, Chapter 4: https://www.faa.gov/sites/faa.gov/files/TAP_Final_EA_Chapter_4.pdf
- FAA O'Hare runway utilization: https://www.faa.gov/airports/airport_development/omp/faq/runway_utilization

## Rules enforced by the simulation

- Arrivals enter at the map boundary and use a continuous approach, flare, threshold touchdown zone, rollout, and runway exit.
- Departures receive an explicit Ground pushback clearance, move backward from the stand with a connected tug while engines start, release the tug at the graph's ramp node, taxi to a hold-short point, line up, accelerate down a model-appropriate runway distance, rotate, and climb out.
- Physical speed and acceleration advance path distance; the fixed-step simulation owns the resulting pose consumed by both the renderer and collision system.
- Each aircraft type has separate straight-taxi speed, turn-speed, ground acceleration, braking, design turn radius, and wingspan. The simulation replaces eligible graph corners with tangent circular arcs, brakes before them, and rejects routes below the modeled wingtip margin.
- Ground aircraft remain on modeled runway, taxiway, apron, or stand pavement.
- Active-runway plans follow eligible wind/weather/procedure conditions when automatic selection is enabled, but never change underneath protected traffic.
- Runway entry, crossing, and takeoff are distinct clearances.
- Runway reservations protect intersecting and occupied runways while still permitting independent parallel operations.
- Physical envelopes and broader airborne/surface separation envelopes are checked before movement is committed.
- Gate slots cannot be reused while occupied, and converging or opposing surface routes reserve their next node/edge.
- Auto and Watch issue the same discrete clearances that a Manual controller must issue; Assisted proposes and explains those commands without silently executing them.
- Simulation speed advances one shared clock; taxiing does not secretly run at a different multiplier.

## Deliberate simplifications

- Layouts preserve the operational impression of each hub rather than survey-grade geometry.
- Taxiway naming is partial and schematic; terminal ramp-control jurisdictions are abstracted.
- Approach and departure procedure names are descriptive placeholders, not published SID/STAR data.
- Wake class affects spacing, but the game does not reproduce every FAA separation category or local waiver. The E175 and Q400 use the medium game category, not the former misleading light label.
- Pushback uses a compact procedural tug and graph-derived ramp release; detailed tug types, service vehicles, deicing queues, NOTAM ingestion, and live METAR/traffic feeds are not yet modeled.
- Manufacturer airport-planning manuals and FAA taxiway-design guidance bound the ground model, but its speeds, radii, and imported edge-clearance corridors remain entertainment-scale parameters—not dispatch or airport-engineering data.
- O'Hare ships versioned offline OSM surface and surrounding-context assets; other hubs retain procedural surroundings.

The deterministic test harness validates every airport surface graph, samples complete arrival/departure trajectories, checks pavement and building clearance, runs seeded fixed-step flow, and soaks collision envelopes for multiple simulated hours.

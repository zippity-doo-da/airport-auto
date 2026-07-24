# Airport operations model

Airport Auto is an entertainment simulation. Named hubs use simplified, recognizable runway patterns and purpose-built surface graphs; they are not current aeronautical data or suitable for navigation.

## O'Hare model

The O'Hare schematic contains six east-west runways and two legacy diagonal runway shapes. Normal traffic uses the parallel east-west system: four arrival runways and two dedicated departure runways can operate concurrently when their protected envelopes do not conflict. The diagonal shapes remain visible for recognition but inactive in the normal configuration.

The terminal apron is geometrically separated from perimeter taxi routes and runway-access spurs. Stands have unique occupancy, taxi routes follow graph edges, and named taxiways Alpha, Bravo, Delta, Kilo, Mike, November, Yankee, and Zulu provide stable operational identifiers. These names and paths are a readable game abstraction, not a one-for-one transcription of the FAA airport diagram.

Useful real-world references for future fidelity work:

- FAA digital terminal procedures and current airport diagrams: https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/
- FAA airport traffic control, taxi and ground movement: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap3_section_7.html
- FAA landing procedures: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap3_section_10.html
- Chicago Department of Aviation airport operations: https://www.flychicago.com/community/ORDnoise/AirportOperations/Pages/default.aspx

## Rules enforced by the simulation

- Arrivals enter at the map boundary and use a continuous approach, flare, threshold touchdown zone, rollout, and runway exit.
- Departures taxi to a hold-short point, line up, accelerate down a model-appropriate runway distance, rotate, and climb out.
- Physical speed and acceleration advance path distance; the fixed-step simulation owns the resulting pose consumed by both the renderer and collision system.
- Ground aircraft remain on modeled runway, taxiway, apron, or stand pavement.
- Active-runway ends follow wind when it is enabled, but do not flip underneath protected traffic.
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
- Pushback tugs, service vehicles, deicing queues, NOTAM ingestion, and live METAR/traffic feeds are not yet modeled.
- Surrounding roads, terrain, and buildings are procedural scenery; no OpenStreetMap layer is currently shipped.

The deterministic test harness validates every airport surface graph, samples complete arrival/departure trajectories, checks pavement and building clearance, runs seeded fixed-step flow, and soaks collision envelopes for multiple simulated hours.

# Runway-exit planning

Airport Auto 2.10 gives every arrival an explicit runway-exit plan. It is an entertainment-scale planning model, not landing-performance software or navigation data.

## Decision model

For each arrival, the fixed-step simulation derives reachable exit candidates from the airport surface graph. Imported airports use mapped runway-access boundary nodes and named taxiways. Procedural airports generate four off-runway exits joined by a visible parallel taxiway, so the same rule works outside O'Hare.

Each candidate is evaluated against:

- aircraft approach speed, modeled landing roll, taxi speed, wingspan, and route-clearance requirement;
- dry, wet, or contaminated braking action;
- touchdown distance, available runway, turn margin, exit angle, and rapid-exit target speed;
- the pavement route to the assigned stand;
- live edge congestion and competing arrival exit plans.

The selector first considers only candidates with the complete predicted rollout plus at least 85 m of remaining turn margin, then balances runway occupancy against destination-route and traffic cost. If no safe plan exists at the final-approach refresh, the aircraft goes around instead of compressing its stopping distance or leaving the pavement.

## Continuity and protection

The chosen exit is authoritative simulation state. Landing motion ends at its exact surface-graph node, and taxi-in starts at that same node. The renderer consumes this pose and does not draw a separate curve. Taxi routing blocks runway and runway-access edges belonging to the landing runway, preventing an aircraft from exiting and immediately routing back across that runway.

An approach plan is recomputed when its destination stand or braking action changes and once more at the approach-to-landing handoff. An aircraft already rolling out keeps its chosen exit so weather or traffic updates cannot make the visible path jump.

The flight strip identifies the runway and exit. Selecting the aircraft opens a compact panel with exit type, braking action, target speed, stopping margin, and route distance. API 2.10 / snapshot schema 12 exposes the complete plan, and `runway-exit-plan` events record decision changes.

## Real-world boundary

FAA pilot guidance says aircraft should leave at the first available or instructed taxiway after reaching taxi speed, and an aircraft must not exit onto another runway without authorization. FAA controller guidance permits controllers to specify an exit when operationally necessary. Airport Auto uses those ideas as behavioral guardrails, while its distances, braking multipliers, graph scale, and traffic scoring remain deliberate game abstractions.

- FAA Pilot Best Practices: https://www.faa.gov/airports/runway_safety/pilots/best_practices
- FAA Order JO 7110.65, Landing Procedures: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap3_section_10.html
- FAA Aeronautical Information Manual, Airport Operations: https://www.faa.gov/Air_traffic/publications/atpubs/aim_html/chap4_section_3.html

## Release gate

`npm run test:runway-exits` verifies imported and procedural candidate sets, deterministic selection, aircraft-performance ordering, wet/contaminated rollout growth, destination-route influence, traffic avoidance, pavement-only post-exit routing, no immediate runway recrossing, and a continuous landing-to-taxi endpoint. The complete trajectory, fixed-step, surface, obstacle, collision, and browser suites remain mandatory.

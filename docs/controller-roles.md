# Controller stations and performance scorecards

Airport Auto treats Supervisor, Approach, Tower, Ground, and Ramp as five different jobs. The selected station changes the traffic bay, command authority, coordination work, alerts, and measures shown to the player; it is not merely a label or camera filter.

The model is designed for a game and calm simulation. Its targets are transparent operational feedback, not FAA certification, controller evaluation, or navigational guidance. A score never changes aircraft motion, clearance eligibility, separation, or the safety arbiter.

## Role boundaries

| Station | Traffic scope | Primary authority | Success measures |
| --- | --- | --- | --- |
| Supervisor | Every aircraft, desk, runway plan, disruption, queue, and safety invariant | Airport-wide override, runway configuration, surface availability, recovery, and unstaffed-desk automation | Safety integrity, throughput, delay per operation, and desk pressure |
| Approach | Arrivals from the terminal boundary through final, plus departures after Tower handoff | Vectors, altitude, speed, terminal routes, holds, approach clearance, diversion, and airborne handoff | Airborne separation, arrival fuel reserve, timely handoffs, and arrival delay |
| Tower | Final approaches, protected runways, runway-entry queues, landing rollout, and initial departure roll | Landing, go-around, line-up, runway entry, takeoff, and protected-runway occupancy | Runway conflict prevention, zero incursions, runway delay, and completed movements |
| Ground | Movement-area taxiways between runway and Ramp boundaries | Taxi routes, hold/resume, individual runway crossings, reroutes, and disabled-aircraft recovery | Surface flow, crossing delay, zero incursions, and moving taxi traffic |
| Ramp | Stands, service activity, apron lanes, ramp alleys, and movement-area handoff points | Stand flow, pushback direction, turnaround release, ramp alleys, and Ramp/Ground coordination | Push-ready flow, service blockers, turnaround variance, and active turns |

Arrival ownership normally moves Approach → Tower → Ground → Ramp. Departure ownership moves Ramp → Ground → Tower → Approach. The explicit offer, acceptance, contact, and overdue-handoff model remains authoritative; the scorecard only reports the resulting operational picture.

## Normal interface

Assisted and Manual modes place a compact station briefing at the top of the flight bay. It contains:

- the selected role and a 0–100 game score;
- one-line traffic/workload context;
- a collapsed, touch-accessible description of role scope and authority;
- four role-specific objectives with current values and visible targets; and
- at most the two highest-priority current alerts.

Auto and Watch keep the briefing hidden to protect the low-chrome ASMR view. All five scorecards remain available through telemetry in every mode. Urgent alerts also use the existing transient status surface, so the complete briefing is not repeatedly announced by assistive technology every simulation second.

Transient notices are presentation-paced rather than simulation-paced. Routine and operational messages receive at least 2.6–3.2 seconds of wall-clock reading time, warnings receive five seconds, and critical safety alerts receive seven seconds. Repeated copy is collapsed, the waiting list is bounded and expires stale routine news, and only a newly critical alert can interrupt a lower-priority notice. This remains true at 3× simulation speed.

## Status and scoring

Each objective is `met`, `attention`, `critical`, or `informational`. The overall desk status is:

- `nominal` when the score is at least 85 and no scoped alert is active;
- `attention` when a scoped alert exists or the score is below 85; or
- `critical` when an urgent alert exists or the score is below 65.

Scores are deterministic, bounded to 0–100, and intentionally easy to explain. They apply documented penalties for the role's active conflict forecasts, incursions, overdue handoffs, low arrival fuel, long queues or holds, turnaround delay, and workload pressure. Throughput, moving traffic, and active turns are displayed as flow measures rather than incentives to weaken safety.

The Supervisor score combines airport-wide safety with the four operational desk scores, queue delay, and desk pressure. Supervisor has no synthetic aircraft workload count of its own; its workload measure is the number of heavy or overloaded desks.

## Alerts

Alerts are derived from the same authoritative conflict predictions, handoff state, queues, shift metrics, fuel, turnaround state, and aircraft ownership used elsewhere in the simulation:

- Approach receives airborne-separation, low-fuel, arrival-queue, and handoff alerts.
- Tower receives protected-runway, runway-queue, incursion, and handoff alerts.
- Ground receives crossing, extended surface-hold, movement-queue, incursion, and handoff alerts.
- Ramp receives delayed push-ready, service/gate/ramp queue, turnaround, and handoff alerts.
- Supervisor receives urgent safety forecasts, invariant breaches, and heavy/overloaded desk alerts.

Alert IDs are stable within a deterministic state, duplicate causes are collapsed, urgent items sort first, and each desk is bounded to twelve telemetry alerts. No alert can issue a command or bypass clearance validation.

## Browser control snapshot

API 2.22 / snapshot schema 24 adds `controllers.performance`, ordered as Supervisor, Approach, Tower, Ground, and Ramp. Each entry contains:

```text
station, label, trafficScope, authoritySummary,
responsibilities[], successMeasures[], workload,
score, status, summary, objectives[], alerts[]
```

An objective includes its stable ID, label, numeric and display values, target, status, and explanation. An alert includes its stable ID, station, severity, label, explanation, and associated flight IDs. The structure is newly derived for every control snapshot and cannot mutate authoritative simulation inputs.

## Validation

`npm run test:controller-performance` verifies all five role definitions, twenty distinct objectives, scoped synthetic stress alerts, deterministic repeatability, and input immutability. Browser coverage verifies the normal Supervisor, Approach, Tower, Ground, and Ramp briefings and the typed telemetry structure.

# Controller evaluation metrics

Airport Auto 2.31 adds a read-only evaluation layer for human, page-local, BroadcastChannel, agent, and deterministic scripted controllers. It reports what happened without granting authority or changing a clearance. The safety arbiter remains the only component that can accept or reject an operational instruction.

The normal Assisted and Manual station briefing contains a collapsed **Decision evaluation** disclosure. The typed snapshot exposes the complete versioned record at `controllers.evaluation` for dashboards and controller agents.

## Reported outcomes

The current-session snapshot reports:

- active conflict forecasts and warnings, prevented conflicts, physical collision alerts, runway incursions, and unexplained motion pauses;
- completed arrivals and departures, safe throughput per simulated hour, total modeled delay, and delay per completed operation;
- total modeled fuel burn, fuel burned while any controller, sequencing, or safety hold was active, and its percentage of total burn;
- operational command attempts, accepted and rejected instructions, autonomous deferrals, and acceptance percentage;
- one decision-quality score for the airport plus a Supervisor, Approach, Tower, Ground, and Ramp breakdown;
- source/actor outcome totals for page, BroadcastChannel, agent, replay, test, and scripted controllers; and
- explainable active hold-review candidates with flight, desk, hold kind, total duration, avoidable duration, and reason.

Camera, sound, display, session setup, training, challenge, and sandbox controls do not enter command-quality scoring. Mutating Approach, Tower, Surface, Coordination, emergency, and recovery instructions do.

## Command quality

A desk with no operational attempts is `not-rated`; it never receives a fabricated perfect score. Once rated, quality starts at 100 and applies only penalties:

- rejected instructions: up to 35 points based on the accepted/rejected denominator;
- active conflict forecasts: four points per caution and ten per warning, capped at 25;
- collision alerts and runway incursions: non-compensatory 60- and 50-point safety penalties;
- overdue handoffs: five points each, capped at 15; and
- unnecessary hold candidates: eight points each plus elapsed avoidable time, capped at 20.

Deferred autonomous work is reported separately and never counted as a rejection. Throughput, delay, and fuel are outcome measures—not bonus points—so moving more traffic can never cancel a safety or rejected-command penalty. Ratings are `excellent` (95–100), `strong` (85–94), `review` (70–84), `critical` (below 70), and `not-rated`.

Physical collision alerts remain airport-wide. Runway incursions are shown as shared Tower/Ground context. The evaluator deliberately avoids inventing individual blame when the event log cannot prove causality.

## Unnecessary-hold review

The metric is intentionally conservative and explainable:

- A surface controller hold receives a 45-second review window.
- An airborne hold is reviewed only after its expect-further-clearance time plus a 15-second grace period.
- A hold is not listed while a safety or automatic hold, runway crossing, emergency, disruption, deicing state, overdue handoff, conflict prediction, or identified blocking aircraft remains active.

The resulting entries are review candidates, not automatic violations. This distinction avoids teaching agents to release a necessary hold merely to improve a score.

## API shape

```js
const evaluation = airportControl.snapshot().controllers.evaluation;

// evaluation.schemaVersion === 1
// evaluation.methodVersion === "1.0.0"
// evaluation.safetyBoundary === "read-only"
// evaluation.commands.commandQualityScore
// evaluation.stations.find(({ station }) => station === "tower")
// evaluation.actors
// evaluation.holds.candidates
```

Snapshot schema 33 records the evaluation; API 2.31 keeps protocol 1.2 and the existing command vocabulary unchanged. The evaluation implementation is deterministic for identical state and command histories and is covered by `npm run test:controller-evaluation`.

# Controller challenge shifts

Airport Auto 2.24 adds deterministic, timed controller shifts on top of the same fixed-step simulation, station authority, command validation, and safety arbiter used by free play. Challenges do not use a separate movement model and cannot weaken collision, runway-incursion, surface-routing, or command-ownership rules.

## Shift catalog

| Challenge | Clock | Locked setup | Primary targets at a hub |
| --- | ---: | --- | --- |
| Rush-hour bank | 6 min | Rush scenario, Rush traffic, clear weather, 12 kt wind | 8 movements, no more than 90 sec delay per movement, no more than 24% of modeled fuel burn while held |
| Storm operations | 7 min | Storm scenario, Busy traffic, rain, 24 kt wind | 3 arrivals, no more than 115 sec delay per movement, no more than 30% holding fuel |
| Runway-closure recovery | 7 min | Closure scenario, Busy traffic, clear weather, 14 kt wind | 7 movements including 2 departures, no more than 105 sec delay per movement, no more than 28% holding fuel |
| Emergency priority | 5 min | Emergency scenario, Realistic traffic, clear weather, 10 kt wind | Resolve 1 emergency, complete 4 movements, no more than 85 sec delay per movement, no more than 25% holding fuel |

Procedural local airfields use reduced movement targets appropriate to their smaller runway and stand capacity. Every challenge uses the forgiving terminal-separation option for a consistent baseline; the ordinary realistic ruleset remains available in free play.

Starting a challenge rebuilds the opening traffic picture and pauses at a briefing. Full Auto and Watch are changed to Assisted because a timed controller challenge requires player decisions. Assisted and Manual remain available throughout the shift. At the opening Supervisor position, Approach, Tower, Ground, and Ramp are automated; selecting one of those operational positions staffs it and keeps the other desks automated.

The airport, scenario, traffic density, separation rules, weather, wind, runway configuration, and scenario-owned closure are locked until the debrief. Camera, visual layers, sound, station selection, unstaffed-desk automation, and simulation speed remain available. A generic Resume command cannot bypass the briefing; the clock starts only with **Begin timed shift** or `beginChallenge`.

## Scoring and debrief

Each shift has weighted objectives totaling 100%. The live panel shows the current value, target, progress, and on-track/attention state, then collapses when the clock starts so the playfield remains visible. The debrief preserves:

- safe arrivals and departures;
- operations per modeled hour;
- accumulated protected-hold delay and delay per completed movement;
- total modeled fuel burn, fuel burned while held, and its percentage of all burn;
- resolved priority aircraft and go-arounds;
- collision alerts, runway incursions, unexplained pauses, missed handoffs, and prevented conflicts;
- each objective result, weighted score, and letter grade.

Grades are `A+` (97–100), `A` (90–96), `B` (80–89), `C` (70–79), `D` (60–69), and `F` (below 60). Any physical collision alert, runway incursion, or unexplained movement pause immediately closes the shift for review and caps the score below 60. Ending early also caps the result at `F`. A missed handoff reduces the safety summary without inventing a physical collision.

Fuel comes from the same aircraft-profile usable-fuel capacity and phase-specific burn that changes each aircraft's authoritative fuel state. Holding fuel is the portion burned during controller, automatic, navigation, or collision-protection holds; it is not a cosmetic estimate added only for the scorecard.

## UI and control API

Challenges are under the collapsed **Challenge shifts** section in Controls. A compact HUD owns briefing, clock, live grade, optional objective detail, and early end. Completion, safety failure, or early end opens an accessible debrief with Retry and Continue free play.

The page-local API and `BroadcastChannel("airport-auto")` use the same commands:

```js
airportControl.request({ action: "startChallenge", challengeId: "rush-hour" });
airportControl.request({ action: "beginChallenge" });
airportControl.request({ action: "endChallenge" });
airportControl.request({ action: "continueAfterChallenge" });
```

Challenge IDs are `rush-hour`, `storm-operations`, `runway-closure`, and `emergency-priority`. `snapshot().challenge` includes the catalog, definition, lifecycle status, locked-condition flag, live score/grade, objectives, operational summary, completion reason, and authoritative start/end clock values. Rejected setup changes return `accepted: false` with a structured plain-language reason.

Shareable launch links use `?challenge=rush-hour`; add `autostart=1` to enter the airfield and begin the timed shift immediately.

## Release evidence

`npm run test:challenges` verifies catalog completeness, weights, grade boundaries, safety caps, locked conditions, solo-desk automation, fuel accounting, exact clock completion, closure protection, emergency seeding, deep cloning, debrief continuation, and training/challenge exclusivity. Playwright exercises briefing, API rejections, live HUD, early debrief, retry, continue, focus, touch sizing, viewport containment, and desktop/mobile screenshots.

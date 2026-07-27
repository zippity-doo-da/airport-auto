# Community, progression, and second-airport decision

Decision date: 2026-07-27

Airport Auto remains an **ASMR-first open-ended airport simulation with an optional serious ATC layer**. Community features may make a calm shared operation easier to enter, teach, observe, or coordinate; they must not turn the default experience into a retention treadmill or public score chase.

## Shipped community scope

### Daily seeded challenge

One schema-versioned challenge is derived from each UTC date. The date deterministically selects a named airport, existing five-to-seven-minute challenge, and nonnegative seed. Everyone receives the same Assisted/Supervisor briefing and must deliberately start its clock.

Daily challenge state is available through `airportControl.community.snapshot()`. `loadDailyChallenge()` loads today’s board through the normal session and challenge paths.

### Classroom links

**Copy classroom link** creates an independent-board link containing only:

- airport;
- seed;
- Assisted mode and Supervisor station;
- forgiving ruleset;
- challenge ID;
- UTC daily/classroom date.

The daily contract overrides conflicting airport, seed, mode, station, rules, and challenge parameters on load. The link carries no credential, user/controller ID, score, replay, command history, live-feed data, or automatic-start request. It requires no account or server and lets a class compare the exact same exercise independently.

### Shared live sessions

Real-time multi-controller classrooms already use the optional authenticated remote gateway. A host can share Approach, Tower, Ground, Ramp, and Supervisor work with explicit station claims and a read-only spectator role. The gateway remains self-hosted/provider-neutral; the static game never silently acquires network authority. Independent daily links and coordinated live stations solve different classroom needs and can be used together.

## Progression and leaderboard decision

Persistent progression and a public/server-validated leaderboard are **deferred by product decision** and are not unfinished core work.

Reasons:

1. Open-ended Watch/ASMR sessions should not imply a streak, grind, loss state, or obligation to optimize throughput.
2. Safety-sensitive ATC grades should not reward risky volume chasing. Existing isolated challenge grades already keep safety non-compensatory and are sufficient for self-review.
3. A credible public leaderboard requires accounts, moderation, abuse handling, exact replay attestation, version/ruleset partitions, anti-cheat review, retention/deletion policy, and operating infrastructure. Adding a score endpoint alone would be misleading and unsafe.
4. Classroom comparison works without collecting identity: participants can use the same deterministic link and voluntarily share the local debrief.

The decision can be revisited only as a separate opt-in competitive service. It must have exact replay verification, server-side version/ruleset validation, explicit consent and deletion, pseudonymous identity, moderation, no effect on Auto/Watch defaults, and no product pressure on players who never enable it.

## Second high-fidelity airport decision: ATL

The ORD v1 acceptance gate in `ROADMAP.md` is complete, including sourced topology, pavement-only route connectivity, explicit crossings, obstacle clearance, concurrent-flow soaks, and simulation/render pose equality. The second high-fidelity import is therefore selected: **Hartsfield–Jackson Atlanta International (KATL)**.

Why ATL:

- The current FAA diagram provides a dense but structurally legible five-parallel-runway field, named taxiways, ramps, hold areas, deicing/snow facilities, hot spots, and an interstate taxiway crossing. That creates a materially different capacity and surface-routing test from ORD’s more irregular eight-runway system.
- ATL reported 805,268 aircraft operations in 2025, enough to justify the project’s hub-scale banks and simultaneous runway use.
- Its midfield terminal/concourse complex, north/south runway systems, cargo/support zones, and Runway 10/28 separation make the airport visually recognizable without copying chart aesthetics.
- The existing ATL schematic, traffic program, airline/fleet logic, daily challenge rotation, and mobile visual baseline provide a migration path while the sourced graph is built.
- The same FAA ADIP/Airport Diagram plus normalized OpenStreetMap pipeline used for ORD can be reused, which tests whether the importer is genuinely airport-general rather than an ORD-only artifact.

Primary references reviewed on 2026-07-27:

- [FAA KATL Airport Diagram, cycle 2607](https://aeronav.faa.gov/d-tpp/2607/00026AD.PDF)
- [ATL December 2025 year-to-date traffic report](https://www.atl.com/wp-content/uploads/2026/02/ATL-ATR-2512_revF.pdf)
- [ATL Master Plan executive summary](https://www.atl.com/wp-content/uploads/2016/12/ATL_ExecSumm_2015_101415_Spreads.pdf)

Selection is not a fidelity claim. ATL remains labeled **schematic** until its own sourced vector/surface/context assets pass the same evidence bar as ORD: source/license manifest, current runway geometry, named pavement graph, terminal/stand compatibility, exact crossing controls, obstacle envelopes, configuration rules, zero-conflict sustained soaks, simulation/render pose equality, desktop/mobile presentation, and visible non-navigation disclosure.

## Verification

```bash
npm run test:community
npm run test:challenges
npm run test:remote-gateway
npm run test:release-matrix
```

The community gate exercises two years of UTC dates, every named airport and challenge, seed uniqueness, invalid dates, the URL allowlist, briefing preservation, and leakage rejection. Browser coverage proves that a daily date overrides conflicting launch parameters and opens the intended briefing.

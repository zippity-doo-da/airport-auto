# Gate operations model

Airport Auto 2.6 treats a stand as a scheduled, safety-protected resource. The allocator is deterministic and renderer-independent: it selects a stand before arrival, reserves an occupancy window, rechecks physical availability before taxi-in, and releases the stand only after the tug clears the lead-out.

## Assignment factors

Every candidate must first support the aircraft category, wingspan, and modeled wingtip margin and must have valid graph routes from the arrival runway and to the planned departure runway. Compatible candidates are then scored on:

- passenger terminal, cargo ramp, remote ramp, or fallback service fit;
- airline terminal/concourse or cargo-ramp affinity;
- aircraft size versus the stand limit;
- predicted gate-in time and an 18-second turn buffer around other reservations;
- arrival taxi distance;
- the next flight's destination, departure runway, and departure taxi distance;
- concurrent terminal demand and a deterministic tie break.

The result stores its score and plain-language rationale. Congestion can later alter the selected taxi route, but it does not silently change the assignment's original planning evidence.

## Reservation lifecycle

1. An arrival reserves a future interval from predicted gate-in through planned pushback.
2. Another active arrival may hold the same future stand only when the two intervals, including turn buffers, do not overlap. Physically close adjacent stands are also mutually exclusive when the two planned aircraft envelopes would overlap; smaller compatible aircraft may still use the pair together when their envelopes clear.
3. Taxi-in rechecks actual occupancy. If a delayed aircraft still owns the stand, the arrival receives a new compatible plan before leaving the runway environment.
4. Actual gate-in replaces the estimate and extends the departure window from the real arrival time. Any later conflicting approach is reassigned.
5. A pushback aircraft continues to own its lead-out until the tug release point; only then is `gate-release` emitted.

The collision system remains the final authority. A schedule never permits two aircraft to physically occupy the same stand, an unsafe adjacent stand pair, or the same lead path.

## O'Hare policy and limits

The playable ORD graph contains 40 sourced sample stands across Terminals 1, 2, 3, and 5 plus cargo, remote, maintenance, and general-aviation areas. It does not attempt to render every real gate.

Passenger affinity follows the Chicago Department of Aviation's final May 2026 reallocation announcement: United across Concourses B, C, E, F, and G; American across G, H, K, and L; Delta at M; and most common-use capacity at M with additional common-use positions at G. The announcement says the changes take effect in October 2026, so this is a published future configuration as of July 2026, not a claim about today's exact gate occupancy.

Cargo affinity uses the sourced ORD cargo-ramp names. UPS prefers Southeast Cargo; FedEx prefers Southwest Cargo with Southeast as a fallback; other freighters may use another compatible cargo or remote stand.

These rules are gameplay-scale operational affinities. They do not reproduce live leases, airline schedules, international-arrival constraints, towing, hardstand buses, or day-of-operation gate swaps.

## Sources

- [CDA final 2026 gate reallocation](https://www.flychicago.com/business/media/news/pages/article.aspx?newsid=1959)
- [CDA O'Hare facility and concourse inventory](https://www.flychicago.com/business/cda/factsfigures/pages/facility.aspx)
- [CDA O'Hare cargo overview](https://flychicago.com/business/cargo/pages/default.aspx)

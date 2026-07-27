# Runtime performance budget

Airport Auto remains a TypeScript, Vite, and Three.js application. Profiling on July 24, 2026 found no workload that justified WebAssembly: the largest costs were excessive WebGL draw calls, repeated construction of surface-graph lookup tables, and an unbounded fixed-step catch-up loop. Those are architecture and allocation problems, not JavaScript numeric-throughput problems.

## Current budgets

- The local runtime monitor separately retains the latest 1,200 display-frame work samples, 1,200 display-frame gap samples, 1,200 simulation-tick samples, and 21,600 once-per-simulation-second counter samples. It never uploads data or changes simulation decisions.
- Frame-work p95 is budgeted at 20 ms, frame-gap p95 at 34 ms, and fixed simulation-tick p95 at 10 ms. Frame gaps diagnose visible stutter; frame work diagnoses main-thread cost.
- JavaScript heap is budgeted at 512 MiB with a 32 MiB/hour one-hour-window retained-growth limit where Chromium's optional `performance.memory` is available. Growth remains in warming state until five minutes of one session have been observed. The rate compares low-water samples near both ends of the window so garbage-collector timing does not masquerade as retained growth.
- Runtime entity/resource ceilings are 160 aircraft, 96 service vehicles, 14 spatial aircraft voices, and 64 queued operations.
- Low detail is budgeted at 320 draw calls and 280 resident geometries; high detail is budgeted at 700 draw calls and 760 resident geometries. The monitor also reports triangles and textures without using them to change scene quality.
- Production simulation authority runs at a fixed 20 Hz and rendering interpolates authoritative aircraft and service-vehicle poses at the display rate.
- A display frame may execute at most three simulation ticks. Wall-clock delta is capped at 100 ms, so a delayed frame cannot create a catch-up spiral and repeated visible skips.
- ORD low detail must stay below 320 WebGL draw calls and 280 resident geometries in the browser regression gate.
- Low detail uses a 1.0 device-pixel ratio cap, disables shadows, reduces decorative geometry, and is selected automatically for center-scale airports, viewports below 900 px wide or 760 px tall, and devices reporting 4 GB or less.
- High detail caps device-pixel ratio at 1.5. A URL override (`detail=high` or `detail=low`) remains available for diagnostics.
- Browser release tests use the explicit `renderFps=0.25` diagnostic cap so software WebGL cannot starve the unchanged 20 Hz authority clock; normal play remains display-rate uncapped.
- The reproducible Extreme ORD 3× fixed-step profile should keep p95 simulation-tick time below 10 ms on the project development machine. Run `npm run profile:runtime`; this is a diagnostic rather than a hardware-independent CI assertion.
- Common laptop viewports—1366×768, 1280×720, and 1024×600—must keep the Controls button and the entire scrollable controls surface inside the viewport. The browser suite verifies access to the final Advanced section at every size.

## July 2026 profile

Before this pass, the software-rendered ORD scene used roughly 713–778 draw calls and 709–776 geometries. Extreme ORD simulation ticks averaged about 8.5 ms, and a delayed frame could request up to 18 catch-up ticks. Software Chromium managed roughly 4 FPS while the same renderer managed about 18 FPS paused.

After batching runway lights, runway/threshold/hold-short markings, and existing repeated scenery, ORD uses roughly 252 draw calls and 220 geometries. Cached immutable graph indexes, service routes, and the established high-resolution committed-runway sweep reduced the measured Extreme ORD tick mean to about 6 ms and p95 to about 9 ms while preserving the trajectory safety gate. The software renderer moved close to its paused ceiling, and the hardware-accelerated in-app browser held about 58 FPS at ORD, Auto, 3×, low detail.

Absolute browser FPS varies by GPU, browser, power mode, display resolution, and capture tooling. The committed regression gates therefore enforce structural scene budgets and viewport behavior; the diagnostic profile records CPU simulation cost separately.

## 2.39 runtime monitor and soak gate

Open **Controls → Performance** (or launch with `?debug=1`) for the compact live report. `airportControl.performance()` and `airportControl.snapshot().performance` expose the same schema-1 snapshot for local tools. Status values are `warming`, `nominal`, `attention`, and `exceeded`; individual heap checks may be `unavailable` outside browsers that expose heap telemetry. Starting a new airport resets the monitor so growth is never mixed across sessions.

`npm run test:runtime-performance` verifies percentile calculation, warning and hard limits, retention caps, reset behavior, garbage-collection sawtooth rejection, true retained-leak detection, and an Extreme-ORD measured profile. On the July 26 acceptance run, its 900 measured fixed ticks after warm-up had a mean near 0.52 ms and p95 near 1.15 ms, with zero collision alerts, runway incursions, or unexplained pauses. The complete local `npm test` run also passed all 74 airport configurations and 18.75 modeled collision-test hours.

`npm run soak:runtime` runs a four-modeled-hour Extreme ORD single-session gate at unchanged Auto/safety settings. Use `node scripts/soakRuntime.mjs --hours=0.25` for a shorter diagnostic or up to 12 modeled hours. Half-hour checkpoints and the final JSON report include wall time, modeled time, unique flights, maximum aircraft/vehicle/queue counts, simulation p95, retained heap-growth estimate, collisions, incursions, and unexplained pauses. The command exits nonzero for any safety/pause invariant or active simulation/entity/queue/growth budget breach. It is intentionally local and is not part of every short test run. The July 26 two-modeled-hour acceptance pass completed 52 arrivals and 22 departures with zero safety/pause events, 35 peak aircraft, 48 peak service vehicles, 51 peak queues, 2.672 ms simulation p95, and 20.941 MiB/hour retained heap growth.

## When to reconsider Workers or WASM

Profile again before changing runtimes. A Web Worker becomes appropriate if a serializable simulation workload consistently blocks the UI despite the frame budget. WASM becomes appropriate only if profiling isolates a stable, compute-heavy numeric kernel—rather than WebGL submission, DOM work, allocation, or graph lookup—with p95 simulation ticks above 12 ms on a supported laptop and a credible benchmark showing a material gain after transfer/serialization costs. Until then, batching, caching, pooling, and algorithmic work have the higher payoff and lower maintenance cost.

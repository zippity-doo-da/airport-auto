# Runtime performance budget

Airport Auto remains a TypeScript, Vite, and Three.js application. Profiling on July 24, 2026 found no workload that justified WebAssembly: the largest costs were excessive WebGL draw calls, repeated construction of surface-graph lookup tables, and an unbounded fixed-step catch-up loop. Those are architecture and allocation problems, not JavaScript numeric-throughput problems.

## Current budgets

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

## When to reconsider Workers or WASM

Profile again before changing runtimes. A Web Worker becomes appropriate if a serializable simulation workload consistently blocks the UI despite the frame budget. WASM becomes appropriate only if profiling isolates a stable, compute-heavy numeric kernel—rather than WebGL submission, DOM work, allocation, or graph lookup—with p95 simulation ticks above 12 ms on a supported laptop and a credible benchmark showing a material gain after transfer/serialization costs. Until then, batching, caching, pooling, and algorithmic work have the higher payoff and lower maintenance cost.

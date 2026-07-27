# Aircraft asset and runtime budget

Airport Auto’s aircraft are original procedural low-poly families. They are generated locally, pooled, and contain no licensed model or texture dependency. These limits apply before any broader high-detail asset work is accepted.

## Per-aircraft shipping limits

The executable limits live in `AIRCRAFT_ASSET_BUDGETS` and are enforced for all 17 models by `npm run test:aircraft-visuals`.

| Budget                            | Low detail (hub default) | High detail | Notes                                                                                     |
| --------------------------------- | -----------------------: | ----------: | ----------------------------------------------------------------------------------------- |
| Renderable mesh/line/sprite nodes |                       46 |          61 | A ceiling on possible aircraft draw submissions; conditional effects are normally hidden. |
| Unique materials                  |                       28 |          31 | Includes lights and conditional effects.                                                  |
| Identification textures           |                        0 |           1 | High detail may create one 192×40 callsign/model canvas, about 30 KiB RGBA.               |
| Instanced triangle count          |                    2,100 |       5,200 | Counts every instance in the procedural airframe.                                         |
| Unique geometry buffer memory     |                   56 KiB |     128 KiB | Attribute and index buffers; excludes JavaScript/driver overhead.                         |

Observed validation maxima in 2.33 are 45/60 mesh nodes, 28/30 materials, 2,004/5,020 triangles, and 53,068/123,638 geometry bytes for low/high detail respectively. High-detail browser identification adds at most one sprite, material, and texture within the stated limits.

## Runtime limits

- Center/hub views select low detail by default. High detail is intended for the closer airfield view or an explicit `?detail=high` override.
- Repeated engines, landing-gear trucks, tug wheels, paired lights, exhaust, condensation, deicing spray, tire smoke, and surface spray use instancing where their animation permits it.
- Aircraft pooling is bounded globally at 24 low-detail or 36 high-detail visuals, with no more than three retained for any model/airline/palette key. Overflow is disposed rather than retained for a long ASMR session.
- A 32-aircraft low-detail planning envelope therefore allows no more than 1,472 aircraft render nodes, 67,200 aircraft triangles, about 1.75 MiB of unique aircraft geometry buffers, and 24 retained pooled visuals. Actual draw calls are lower because gear, tug, lights, and weather effects are conditional.
- The complete rendered frame—not only aircraft—must stay under the existing performance budget: target 60 fps / 16.7 ms at 1080p on the reference laptop, no catch-up spiral, and no unbounded growth during the measured stress and soak profiles.
- `world.diagnostics().aircraftAssets` exposes active family counts, total and per-aircraft mesh maxima, material/texture maxima, triangle maxima, geometry bytes, and the pool budget. `world.diagnostics()` also exposes whole-frame draw calls, triangles, geometries, and textures.

## Acceptance policy

A new model or visual feature must remain under both per-aircraft LOD limits, preserve the fixed-step simulation as the source of pose and systems state, and pass browser performance and long-session checks. An imported GLB is not accepted merely because it looks better; it must have documented provenance, an optimized LOD, compressed textures when applicable, bounded materials, correct animation/state adapters, and equivalent diagnostics.

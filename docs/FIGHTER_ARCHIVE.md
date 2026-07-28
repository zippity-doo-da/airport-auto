# Fighter Archive

The Fighter Archive is an additive, standalone Three.js viewer at
`fighters.html`. It is deliberately separate from the Airport Auto civil-airport
simulation.

## Scope

- Fighter families only. Bombers, transports, pure trainers, and pure attack
  aircraft are excluded. Multirole, interceptor, naval fighter,
  fighter-bomber, night-fighter, and light-fighter families are included.
- Production and operational families are the baseline. A small number of
  historically consequential prototypes are included and labeled as such.
- Major marks are grouped beneath their parent airframe instead of duplicating
  nearly identical geometry. Operators are metadata, not cloned aircraft.
- The catalog contains 195 unique airframe families across 28 design origins:
  91 World War II families and 104 early-jet, Cold War, and modern
  families.

The word “all” is implemented at the airframe-family level, not as every mark,
field conversion, one-off prototype, or national license-build. The catalog is
designed to grow without changing the viewer or the civilian aircraft types.

## Data policy

Dimensions, first-flight year, representative maximum speed, and representative
service ceiling are public reference values rounded for a visual game archive.
They are not dispatch, maintenance, weapons, performance-planning, or flight
manual data. The interface links to the museum, program, and manufacturer
collections used as anchor references.

`fighterCatalogValidationIssues()` checks identifiers, duplicate records,
positive physical/performance values, engine/crew counts, and source keys when
the archive module loads.

## Rendering architecture

- `fighterCatalog.ts` owns metadata and declarative visual traits.
- `fighterVisualFactory.ts` converts those traits into original low-poly Three.js
  geometry. It covers biplanes, inline and radial piston fighters, twin-boom and
  push-pull layouts, wing-pod early jets, swept and variable-sweep wings,
  deltas, canard deltas, VTOL, faceted stealth, and V-tail configurations.
- `fighterArchive.ts` owns camera input, filtering, selection, detail display,
  responsive behavior, and renderer lifecycle.
- Only the selected aircraft is instantiated. Replacing it disposes its geometry
  and materials. The airport simulation never imports or constructs the fighter
  catalog.
- The Vite build is multipage. Three.js remains a shared chunk; the archive has
  its own small JS and CSS entry chunks.

### Detailed reference models

The F-35, J-20, F-22, and MiG-35 catalog entries render aircraft-specific
models rather than shared modern-jet archetypes. The F-35A uses published CTOL
dimensions, custom fuselage loft stations, trapezoidal wing and stabilator
planforms, canted
vertical tails, diverterless intakes, canopy and sensor geometry, a layered
engine nozzle, panel seams, navigation lights, and modeled landing gear. The
J-20 is a separate public-view production schematic with its long chined
fuselage, close-coupled canards, clipped-delta wing, twin engine shoulders and
nozzles, outward-canted tails, visible intake/sensor forms, gear, lights, and
restrained low-visibility markings. The F-22A adds its blended trapezoidal
planform, gold canopy, canted tails, side intakes, and rectangular
thrust-vectoring exhausts. The MiG-35 adds swept wings and LERX, twin nacelles,
round RD-33MK exhausts, an IRST fairing, twin fins, and illustrative markings.
None of the models infer classified internals.

All four models remain texture-free and procedural. They target a few thousand
triangles and roughly 50–75 mesh/line draws each, so they can serve as the
fidelity target for future individually verified aircraft without introducing
a large asset download or a mobile performance cliff.

## Controls

- Drag or touch-drag: orbit
- Wheel or pinch: zoom
- Left/right arrows: previous/next visible aircraft
- `/`: focus search
- `R`: random visible aircraft
- `T`: toggle auto tour
- URL fragments open a family directly, for example `fighters.html#f-14`

Filters can be combined by era, design origin, propulsion, and free-text search.
The catalog becomes a slide-in drawer on narrow screens, leaving the model and
compact specs visible.

## Combat-mode boundary

`dogfight.html` is a separate, explicitly fictional AI-versus-AI combat
prototype. Either side can select the detailed F-35A, J-20, F-22A, or MiG-35
visual. Its on-demand specification cards keep sourced public dimensions,
weights, fuel, speed, range, G, engine, and armament values distinct from the
compressed game envelope. Unknown J-20 values remain explicitly unpublished or
estimated. The fixed-step maneuvering, missile/cannon logic, countermeasures, damage, scoring,
and pooled effects live under `src/fighters/dogfight/`. Values are tuned for a
readable game arena rather than weapons training or claims about classified
capability.

Match setup offers full-combat, guns-only, and custom weapon rules plus an
independent Green, Experienced, or Ace pilot for each aircraft. Pilot profiles
change reaction time, aim dispersion, usable sustained/peak G, fatigue, and
recovery. AI turns are limited by the current survivable pilot envelope, and a
fatigued pilot unloads rather than being commanded through an unsafe maneuver.
The in-game dictionary describes the 14 implemented pursuit, energy, reversal,
and defensive maneuvers; pilot tiers only select maneuvers they qualify for.
These physiology bands are intentionally readable game values, not medical or
flight-training guidance.

High altitude at approximately 34,000 feet is the default engagement band,
with medium and terrain-aware low-altitude alternatives. Green Range, Alpine
Front, Continental Plain, Littoral Reach, and Red Mesa provide procedural
training, mountain, plains, coast, and desert theaters across 36–48 kilometre
soft-bounded combat areas. Head-on merge, high/low advantage, pursuit, and
crossing-intercept openings can be combined with cloud, haze, visibility, and
wind controls. Live aircraft obey a terrain-derived safety floor, while the
renderer keeps scenery and cloud opacity subordinate to fighter readability
and extends ground far enough that the camera cannot reveal a hard map edge.

The runtime remains independent from the peaceful playground and the civilian
airport simulation. Audio, manual piloting, missions, networking, and exact
replay are not part of this combat loop.

## Heritage Flight

`heritage-flight.html` is a separate peaceful four-aircraft formation. It pairs
the existing aircraft-specific F-35A with new F4U-4 Corsair, P-51D Mustang, and
F-86F Sabre procedural models. Those three models replace the archive's generic
silhouette for their family everywhere they are shown.

The Corsair includes its inverted gull wing, long radial-engine cowl, four-blade
propeller, aft cockpit, and chin intake. The Mustang includes the laminar-flow
planform, long Merlin nose, bubble canopy, ventral radiator scoop, and four-blade
propeller. The Sabre includes the circular nose intake, 35-degree swept wing,
bubble canopy, swept empennage, gun ports, speed-brake panels, and single
tailpipe. Published dimensions come from the National Naval Aviation Museum,
National Museum of the United States Air Force, and Smithsonian collection
records; paint and markings are representative rather than restorations of a
single serial number.

Diamond, echelon, line-abreast, and gentle heritage-break programs are sampled
analytically in a 120 Hz fixed-step loop. All aircraft share a display speed
appropriate to the historic members; this is a cinematic formation rather than
a performance comparison. Director, formation, aircraft close-up, wide, and
touch-friendly free cameras are available.

## Flight Playground

`flight-playground.html` is a separate non-combat, runway-free showcase for the
aircraft-specific F-35A and J-20. Its fixed-step demonstration state lives in
`src/fighters/playground/flightPlaygroundSimulation.ts`; the Three.js world,
camera, environment, and aircraft transforms live in
`flightPlaygroundWorld.ts`; and DOM controls remain in `flightPlayground.ts`.
It supports formation, break/rejoin, and staggered programs plus director,
formation, individual chase, wide, and free-orbit cameras. Landing gear is
hidden in flight, minimum programmed spacing is maintained, and no contrails,
weapons, airport, or combat systems are added.

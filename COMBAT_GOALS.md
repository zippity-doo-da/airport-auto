# Combat Simulation Goals

Status: active product and implementation ledger  
Last reconciled: July 28, 2026  
Baseline: Fighter Archive, Flight Playground, Heritage Flight, and AI Dogfight Lab  
Companion ledger: [Airport Auto Goals](AIRPORT_GOALS.md)

## Purpose

The combat product is a browser-native air-combat game, training-range sandbox,
agent laboratory, and cinematic spectator simulation. It should make air combat
readable and exciting without pretending to reproduce classified systems,
weapons employment manuals, medical limits, or operational tactics.

This file records future combat goals. Existing fighter work is summarized as a
baseline and is not repeated as unfinished work. An unchecked item is a real
future deliverable. Completed milestones should move to a release ledger with
commit, validation, and deployment evidence.

## Product north star

Let a person or agent occupy any meaningful airborne role—Pilot, Flight Lead,
Wingman, Air Battle Manager, Mission Director, or Spectator—and allow control to
transfer live without breaking deterministic simulation or replay.

The distinctive product is not a browser imitation of a desktop study simulator.
It is a readable, replayable aviation sandbox built around:

- Smooth, authoritative three-dimensional flight.
- Credible public-data-informed aircraft differences with clearly fictionalized
  unknowns.
- Human and agent control through the same bounded interface.
- Team missions rather than one disconnected duel.
- Excellent cinematic observation and post-flight explanation.
- Short setup time, optional assists, and no required account or network service.

### Supported experiences

1. **Watch:** autonomous engagements, exercises, heritage flights, and airshows
   with a calm cinematic director.
2. **Quick Fight:** immediate 1v1, 2v2, or 4v4 setup with selectable rules,
   theater, altitude, weather, aircraft, pilot skill, and objectives.
3. **Pilot:** direct aircraft control with Arcade, Assisted, and Simulation
   handling layers.
4. **Flight Lead:** fly or observe while directing wingmen and assigning tasks.
5. **Air Battle Manager:** manage tracks, identification, assignments, picture
   calls, support assets, and mission priorities from a tactical display.
6. **Mission Director:** create, seed, run, pause, inspect, branch, and replay a
   scenario through a safe local or remote interface.
7. **Training Range:** use simulated weapons and adjudicated outcomes without
   destruction, suitable for agent evaluation and lower-intensity viewing.

### Primary player verbs

- Fly, trim, accelerate, climb, descend, turn, manage energy, and recover.
- Search, detect, classify, identify, track, prioritize, and communicate.
- Form up, split, bracket, support, cover, engage, disengage, rejoin, and return.
- Fire, evade, counter, assess damage, eject, rescue, or accept an adjudicated
  training result.
- Direct agents, take control from them, release control back, and inspect why a
  decision occurred.
- Reconstruct a fight through exact replay and a clear debrief.

### Session shapes

- Two-minute visual merge.
- Five-to-fifteen-minute quick fight.
- Twenty-to-forty-five-minute team mission.
- One-hour training exercise or agent tournament run.
- Long-form autonomous spectator session with rolling missions and rejoin logic.

## Shipped baseline — not future backlog

The current Research Annex already provides:

- A 195-family Fighter Archive spanning World War II through modern aircraft.
- Detailed aircraft-specific F-35A, J-20, F-22A, MiG-35, F4U-4, P-51D, and F-86F
  procedural models plus lightweight family archetypes.
- A peaceful F-35A/J-20 Flight Playground and a four-aircraft Heritage Flight.
- A separate AI-versus-AI Dogfight Lab with selectable F-35A, J-20, F-22A, and
  MiG-35 participants.
- Full-weapons, guns-only, and custom weapon rules.
- Independent Green, Experienced, and Ace pilot profiles with reaction, aim,
  fatigue, and survivable game-scale G envelopes.
- Fourteen named pursuit, energy, reversal, and defensive maneuvers.
- Fixed-step aircraft, cannon, missile, countermeasure, damage, scoring, and
  pooled visual-effect simulation.
- High-altitude combat as the default, plus medium and terrain-aware low bands.
- Five procedural theaters, four engagement openings, four weather profiles,
  visibility, wind, terrain avoidance, and soft world boundaries.
- Responsive DOM controls, touch camera gestures, cinematic/chase/free cameras,
  specification disclosure, and a page-local snapshot/control surface.

## Non-negotiable design rules

1. **Simulation owns flight.** Position, orientation, velocity, angular rate,
   acceleration, energy, mass, fuel, stores, damage, and pilot state must be
   authoritative and serializable. The renderer only interpolates and presents.
2. **No physical aircraft collisions.** Airframes and terrain have continuous
   safety checks. Weapons and adjudicated combat may cause damage; fighters may
   not pass through one another or the ground.
3. **No perfect hidden knowledge.** Pilots and agents act on a role-appropriate
   perception picture containing sensor detections, uncertainty, memory, and
   communications—not unrestricted world state.
4. **Public facts and game values stay separate.** Published dimensions and broad
   public performance anchor presentation. Classified, variant-dependent, or
   unavailable values are labeled unknown, estimated, or deliberately tuned.
5. **Manual and agent control are peers.** Human, local AI, remote agent, replay,
   and UI commands enter through one authority and validation layer.
6. **A kill does not end the world.** Team missions continue through rejoin,
   relief, rescue, respawn where allowed, return-to-base, or the mission's actual
   completion conditions.
7. **Accessibility is designed, not appended.** Spectator and command roles must
   work without precision mouse flight; color alone never carries allegiance,
   threat, sensor, or damage meaning.
8. **Combat stays separate from the civilian airport.** Shared code and peaceful
   airshow content are acceptable. Weapons and hostile logic never load into an
   Airport Auto session.

## Goal map

| Priority   | Goal                                               | Player outcome                                       | Main dependency                       |
| ---------- | -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| P0         | C1 Authoritative manual flight                     | Take over any fighter and fly it smoothly            | Existing fixed-step combat state      |
| P0         | C2 Teams and mission loop                          | Fight meaningful 2v2/4v4 objectives that continue    | C1 control/flight contract            |
| P0         | C3 Sensors, identification, and EW                 | Make decisions from an imperfect tactical picture    | C2 team/mission identity              |
| P1         | C4 Weapons, damage, and survival                   | Produce readable consequences and recoveries         | C1 dynamics and C3 sensors            |
| P1         | C5 Agent and live-control protocol                 | Let agents fill Pilot, Lead, ABM, and Director roles | C2/C3 role views and authority        |
| P1         | C6 Exact replay and ACMI debrief                   | Explain and branch every engagement                  | Stable C1–C5 state schemas            |
| P2         | C7 World, weather, audio, and presentation         | Make high-altitude combat cinematic and legible      | Shared environment/audio systems      |
| P2         | C8 Detailed aircraft and asset pipeline            | Add meaningful aircraft, not cosmetic duplicates     | Stable flight/sensor data contract    |
| P2         | C9 Campaign, training, and content tools           | Generate repeatable missions and agent curricula     | Mission/replay foundation             |
| Continuous | C10 Performance, accessibility, and release health | Keep team combat smooth in a browser                 | Profiling, pooling, Worker boundaries |

## C1 — Authoritative manual flight

### Outcome

Allow a person to take control of either live aircraft without a pose snap,
physics reset, camera jump, or loss of deterministic replay. Preserve autonomous
control as a first-class option rather than replacing the current agent loop.

### Flight model

- [ ] Replace steering-target motion with an authoritative force/energy model
      that owns thrust, drag, lift demand, gravity, mass, fuel, stores, acceleration,
      angular rate, angle of attack, sideslip, and control authority.
- [ ] Model representative altitude and Mach effects on thrust, drag, turn rate,
      climb, acceleration, and control response using public-data-informed,
      deliberately game-scaled curves.
- [ ] Add dry thrust, military power, afterburner, idle, speed brake, and stores
      drag with corresponding fuel flow.
- [ ] Add stalls, high-angle-of-attack departure, overspeed, structural stress,
      departure recovery, and bounded spin behavior suitable for each assist level.
- [ ] Preserve pilot sustained/peak G, fatigue, blackout/redout presentation,
      recovery, and aircraft structural limits as separate concepts.
- [ ] Add ground-relative wind, cloud/turbulence effects, and terrain clearance
      without allowing weather to produce frame-rate-dependent motion.

### Control modes

- [ ] **Arcade:** coordinated turn, automatic trim, departure protection, gentle
      energy assistance, and simplified throttle.
- [ ] **Assisted:** manual pitch/roll/yaw/throttle with stability augmentation,
      configurable G/AoA limiters, auto trim, and recover-to-level.
- [ ] **Simulation:** direct control surfaces or rates, trim, throttle stages,
      speed brake, gear, flaps where present, wheel brakes, and limiter behavior
      appropriate to the modeled public configuration.
- [ ] Permit control-mode changes only at safe boundaries or through a smooth
      state-preserving transition.

### Input action map

- [ ] Define typed actions for pitch, roll, yaw, throttle, afterburner, speed
      brake, trim, sensor slew, target cycle, weapon select, trigger, countermeasure,
      gear, pause, camera, tactical display, wingman command, takeover, and release.
- [ ] Map keyboard/mouse, gamepad, touch spectator commands, UI, agent, and remote
      clients through the same action layer.
- [ ] Add response curves, dead zones, inversion, sensitivity, remapping, held
      state, focus loss, and device-disconnect handling.
- [ ] Keep pointer/camera capture explicit and suspend flight input while a modal
      or text control owns focus.

### Cameras and HUD

- [ ] Add chase, near chase, orbit, flyby, tactical, cockpitless HUD, missile,
      target, formation, and cinematic-director views.
- [ ] Add pitch ladder, velocity vector, heading, altitude, airspeed/Mach, G,
      AoA, fuel, throttle, stores, damage, sensor, target, closure, and navigation
      cues with declutter levels.
- [ ] Make camera changes presentation-only and preserve aircraft control state.

### Acceptance gate

- [ ] A human can take and release either aircraft at any ordinary point in a
      maneuver with no position/orientation discontinuity greater than interpolation
      tolerance.
- [ ] Equivalent fixed-step partitions produce matching authoritative state and
      replay fingerprints for identical action streams.
- [ ] Ten-minute manual and autonomous flights remain terrain-safe, collision-
      free, finite, and inside the soft theater boundary.
- [ ] Arcade is usable with keyboard; Assisted is comfortable with a gamepad;
      spectator/tactical controls remain usable on mobile.

## C2 — Teams and mission loop

### Outcome

Grow the current duel into persistent 2v2 and 4v4 missions with support aircraft,
objectives, continuation, rejoin, return, relief, and debrief. Official Red Flag
exercises combine joint/coalition participants and different mission roles; the
game will borrow that large-force structure while keeping tactics fictionalized.
Reference: [Red Flag–Alaska](https://www.eielson.af.mil/About-Us/Fact-Sheets/Display/Article/3361864/red-flag-alaska/).

### Mission types

- [ ] Head-on training merge.
- [ ] Defensive and offensive counter-air patrol.
- [ ] Scramble/intercept of unknown contacts entering from the world edge.
- [ ] Fighter sweep through a defended corridor.
- [ ] Escort or defend a tanker, surveillance aircraft, transport, or heritage
      formation using simulated/adjudicated weapons where appropriate.
- [ ] Protect a zone, route, border, or timed departure window.
- [ ] Rescue cover and recovery-support mission after an ejection.
- [ ] Free-flight formation, airshow, and no-weapons training programs.

### Team behavior

- [ ] Add teams, flights, elements, callsigns, package roles, objectives,
      allegiance, rules of engagement, spawn/entry routes, recovery routes, and
      completion state.
- [ ] Add formation join, route, patrol, commit, split, support, cover, engage,
      disengage, bracket, drag, rejoin, return-to-base, tanker, and divert tasks.
- [ ] Let aircraft enter at the scenario boundary and remain observable during
      ingress rather than appearing near the action.
- [ ] Add bounded replacement/rejoin behavior for rolling fights; training
      missions may regenerate tagged aircraft, while finite missions do not.
- [ ] Keep mission completion separate from a single kill: objective, time,
      survival, fuel, identification, escort, zone, or recovery criteria may decide.

### Mission setup

- [ ] Add Quick, Advanced, Seeded, and Scripted setup flows.
- [ ] Let each slot be Human, Local AI, Remote Agent, Inactive, or Spectator-
      followed.
- [ ] Expose theater, altitude band, weather, time, wind, visibility, cloud,
      boundary, team size, aircraft, fuel/stores, pilot, sensors, weapons, damage,
      training adjudication, and objective controls.
- [ ] Provide valid presets before exposing advanced options; reject impossible
      configurations with a specific reason.

### Acceptance gate

- [ ] A 4v4 high-altitude mission sustains repeated engagements for twenty
      minutes without physical collision, terrain impact, NaN state, world-edge
      reveal, or every survivor permanently separating.
- [ ] Guns-only produces zero missile entities; training mode produces no
      destructive damage; finite missions do not respawn unless configured.
- [ ] Every aircraft has a current mission task and explainable transition cause.
- [ ] Loss or disconnect of a human/agent slot hands the aircraft to an allowed
      safe controller or recovery behavior without teleporting.

## C3 — Sensors, identification, and electronic warfare

### Outcome

Replace universal target knowledge with a role-appropriate tactical picture.
Detection, classification, identification, track quality, memory, communication,
and uncertainty become gameplay systems. AWACS publicly performs surveillance,
tracking, situational awareness, and battle management; that public mission is
the model for the game's Air Battle Manager role. Reference: [USAF E-3 Sentry](https://www.af.mil/News/Article-Display/Article/104504/e-3-sentry-awacs/).

### Sensors

- [ ] Add game-scaled radar search volume, scan rate, range, azimuth/elevation,
      look-up/look-down environment, track quality, memory, and field-of-view state.
- [ ] Add broad public-mode abstractions for search, track, close combat, and
      passive operation without reproducing classified waveforms or tactics.
- [ ] Add IRST/passive infrared where publicly applicable, visual spotting,
      radar-warning indications, missile warning, identification friend-or-foe
      uncertainty, and datalink tracks.
- [ ] Make weather, cloud, terrain, aspect, altitude, range, emissions, damage,
      jamming, and communication affect what each role knows.
- [ ] Distinguish raw detection, tentative track, correlated track, classified
      contact, identified contact, stale memory, and dropped track.

### Electronic warfare and communication

- [ ] Add game-scaled noise/deception jamming, burn-through-like confidence
      recovery, emission control, chaff, flares, towed/other decoys only where the
      public aircraft configuration supports the abstraction.
- [ ] Add datalink participation, local track sharing, AWACS picture updates,
      communication loss, delayed reports, and degraded/contested presets.
- [ ] Do not let the HUD, labels, camera, or agent API reveal a contact that the
      selected role cannot currently perceive unless explicit debug/spectator truth
      is enabled.

### Air Battle Manager role

- [ ] Add a scalable tactical display with tracks, uncertainty, altitude,
      velocity, group/flight correlation, engagement assignment, support assets,
      mission boundaries, and communication status.
- [ ] Add concise commands and calls for picture, declare, identify, monitor,
      commit, target assignment, support, disengage, rejoin, tanker, and recovery.
- [ ] Permit a human or agent ABM to make assignments; pilots retain safety and
      engagement-authority checks.

### Acceptance gate

- [ ] Seeded sensor scenarios produce deterministic contact histories and role-
      specific snapshots.
- [ ] An agent using only its authorized perception can complete an intercept;
      removing datalink or radar materially changes behavior without freezing it.
- [ ] Spectator truth, debug truth, pilot picture, flight-lead picture, and ABM
      picture are visibly and structurally distinct.

## C4 — Weapons, damage, and survival

### Outcome

Make weapon use and damage legible, bounded, configurable, and consequential
without turning public estimates into claims of exact real-world capability.

### Weapons

- [ ] Add gun ammunition, rate, heat/burst discipline, dispersion, harmonization
      or convergence where relevant, computed lead cues, projectile time of flight,
      and visible but restrained impact feedback.
- [ ] Add game-scaled missile seeker, support requirement, kinematic energy,
      launch-zone confidence, countermeasure interaction, miss reason, fuse, and
      deterministic damage behavior.
- [ ] Add Master Safe, Training, Guns Only, Full Weapons, and Custom rules as
      authoritative mission policies rather than UI-only toggles.
- [ ] Prevent friendly fire or unidentified engagement according to selected
      rules of engagement, with explicit override policy only in Sandbox.
- [ ] Keep weapons pooled, bounded, replayable, and independent from frame rate.

### Damage and survival

- [ ] Add airframe, engine, flight-control, hydraulic/electrical, fuel, sensor,
      communication, weapon, landing-gear, and pilot condition at a readable level.
- [ ] Make damage affect authoritative thrust, drag, control, fuel, sensors,
      stores, mission capability, and recovery decisions.
- [ ] Add fire, leak, smoke, asymmetric control, degraded sensor, emergency
      jettison, engine shutdown/restart where reasonable, and return/eject decisions.
- [ ] Add ejection, parachute, location beacon, rescue objective, and training
      adjudication as configurable outcomes; avoid graphic injury presentation.

### Acceptance gate

- [ ] Every shot has source, target intent, rules check, sensor basis, launch
      state, outcome, miss/hit cause, damage, and replay event.
- [ ] A damaged but controllable aircraft can disengage and recover; an
      uncontrollable aircraft reaches ejection or a deterministic terminal outcome.
- [ ] Disabling a weapon class removes its entities, controls, agent choices,
      HUD cues, and score effects.

## C5 — Agent and live-control protocol

### Outcome

Expose a versioned role-limited combat protocol so local agents, remote agents,
humans, and scripted controllers can perceive, command, take over, and release
roles in real time.

### Protocol

- [ ] Define combat API, snapshot, event, replay, mission, perception, action,
      and asset schema versions independently from Airport Auto's civilian schemas.
- [ ] Return `{ accepted, reason, resultingState, eventId }`-style structured
      results for every command and action batch.
- [ ] Define Pilot, Flight Lead, Wingman, Air Battle Manager, Mission Director,
      and Spectator authority with explicit subscription views.
- [ ] Add claim, transfer, release, heartbeat, rate limit, timeout, reconnect,
      emergency stop, and safe local-controller fallback.
- [ ] Reuse the authenticated remote transport only after combat-specific origin,
      token-role, audit, redaction, and denial tests pass.
- [ ] Keep static Pages disconnected by default and fully playable with local AI.

### Agent behavior

- [ ] Give each agent bounded perception, memory, mission intent, current task,
      maneuver/command options, pilot limits, fuel/damage state, and communication.
- [ ] Add hierarchical decision records: mission plan, assignment, tactic-level
      intention, maneuver, control action, and abort/recovery reason.
- [ ] Let humans inspect, pause, override, take control, redirect, and release an
      agent without invalidating safety or exact replay.
- [ ] Add deterministic baseline agents for every role so an external model is
      never required.

### Acceptance gate

- [ ] A live human can take one fighter for two minutes, release it, and watch the
      local agent continue from the exact state.
- [ ] A Flight Lead agent can command local or remote wingmen without directly
      writing their physics state.
- [ ] An ABM agent sees only its tactical picture and cannot access hidden weapon,
      exact-opponent, or renderer state.
- [ ] Timeout, invalid authority, stale state, rate excess, and unsafe action
      produce structured rejection and deterministic fallback.

## C6 — Exact replay and ACMI-style debrief

### Outcome

Make every fight understandable after it happens and allow safe experimentation
from any recorded decision point.

### Replay

- [ ] Record seed, mission, assets, participants, public/game data versions,
      weather, authoritative fixed-step frames, role perceptions, actions, commands,
      decisions, sensors, weapons, damage, audio decisions, and event markers.
- [ ] Fingerprint canonical state and locate the first mismatch during exact
      verification.
- [ ] Keep playback read-only and make the Three.js world display replay state,
      never a hidden live match.
- [ ] Add migrations with explicit sealed/unsealed status and fail closed on
      unsupported future versions.

### Debrief

- [ ] Add a 3D tactical timeline with free camera, aircraft trails available only
      in replay, event filtering, and selected-role perception versus truth views.
- [ ] Graph altitude, airspeed, Mach, energy, G, AoA, fuel, throttle, distance,
      aspect, sensor track quality, ammunition, and damage.
- [ ] Mark detections, identification, assignments, merges, maneuvers, launches,
      bursts, countermeasures, hits, misses, kills/tags, ejections, rejoin, and
      mission transitions.
- [ ] Explain agent intent and cite the perception/mission state available at the
      time; never generate a hindsight rationale from hidden truth.
- [ ] Add Branch From Here to create a new local mission/replay lineage with a
      new command or controller assignment.

### Acceptance gate

- [ ] A replay reproduces exact state, events, decisions, and visible motion for
      manual, local-agent, and remote-command sessions.
- [ ] Scrubbing cannot mutate the live match and does not leak private remote
      credentials, actor identity, or unrestricted free text.
- [ ] Branching preserves parent fingerprint, branch time, changed inputs, and
      independent future state.

## C7 — World, weather, audio, and presentation

### Outcome

Make high-altitude combat feel vast, fast, and atmospheric while keeping contacts,
energy, terrain, and mission boundaries readable.

### Environment

- [ ] Add continuous day, dawn, dusk, night, sun angle, moonlight, visibility,
      haze, cloud layers, storms, turbulence, and winds aloft driven by mission state.
- [ ] Add terrain families with collision meshes, radar/visual occlusion,
      elevation look-ahead, and boundaries that never expose a hard map edge.
- [ ] Add high-altitude curvature/horizon cues, layered atmosphere, distant
      cloudscape, and restrained scale references without requiring a planet engine.
- [ ] Add optional water, coast, snow, desert, mountain, forest, urban, and open-
      range presentation with documented performance tiers.

### Audio and effects

- [ ] Add persistent spatial engine/afterburner sound by aircraft and power state,
      distance, Doppler restraint, altitude, occlusion, and camera perspective.
- [ ] Add buffet, high-G strain, airflow, gun, missile, countermeasure, impact,
      warning, radio, formation, tanker, and environmental layers with independent
      buses and repetition budgets.
- [ ] Add sonic-boom events, shock/vapor effects, wing condensation at suitable
      high-load conditions, damage smoke/fire, and weather interaction.
- [ ] Do not restore persistent contrails unless a future explicit user choice
      changes the current product rule.
- [ ] Add a Combat Calm preset that favors engine, atmosphere, distant radio, and
      cinematic direction over repeated warning tones.

### Acceptance gate

- [ ] Weather and wind settings affect simulation, sensors, audio, and visuals
      consistently; disabling a factor disables every corresponding layer.
- [ ] Effects remain pooled and bounded during a one-hour rolling engagement.
- [ ] Contacts and HUD cues remain readable in every supported palette, weather,
      lighting, viewport, and camera mode.

## C8 — Detailed aircraft and asset pipeline

### Outcome

Add aircraft because they create a meaningful flight, sensor, weapon, mission, or
historical distinction—not simply to increase the roster count.

### Asset policy

- [ ] Define one combat-aircraft manifest with stable IDs, source/provenance,
      public facts, game values, variants, visual asset, collision proxy, hardpoints,
      animations, LODs, audio, cockpit availability, and validation status.
- [ ] Standardize authored shipping assets on optimized GLB/glTF 2.0 with named
      pivots, meters, consistent forward/up axes, material limits, collision meshes,
      animation conventions, and license metadata.
- [ ] Preserve procedural models where they meet the visual target; do not force
      every aircraft through Blender merely for format consistency.
- [ ] Define high, medium, low, shadow/collision, and tactical-icon LODs before
      adding 4v4 missions or cockpit interiors.
- [ ] Add geometry/material/texture/draw/memory budgets and automated visual-
      dimension validation for every detailed model.

### Priority content families

- [ ] Complete one balanced modern 2v2 set before broadening: current F-35A,
      J-20, F-22A, and MiG-35 visuals with reviewed game envelopes and sensors.
- [ ] Add one well-supported fourth-generation set for visual-range and mixed
      sensor play, chosen for public-data quality and distinct handling.
- [ ] Add one Korean/early-jet set centered on the F-86F and a suitable opponent.
- [ ] Add one World War II set centered on the F4U-4 and P-51D with historically
      appropriate game abstractions, propeller dynamics, guns, and mission content.
- [ ] Add support aircraft only when missions need them: tanker, AWACS, transport,
      rescue, target, or aggressor drone.
- [ ] Defer detailed cockpits until external/manual flight, HUD, LOD, and input
      systems prove the required budget and interaction model.

### Acceptance gate

- [ ] Silhouette, span, length, signature geometry, propulsion, control surfaces,
      gear, lights, markings disclosure, and animation state pass visual review.
- [ ] Switching aircraft does not leak geometry, material, texture, audio, event,
      or input resources.
- [ ] A 4v4 mixed-aircraft mission meets C10 budgets without replacing detailed
      aircraft with misleading generic silhouettes at normal play distance.

## C9 — Campaign, training, and content tools

### Outcome

Create repeatable mission content and progression without pay-to-win upgrades,
mandatory accounts, or grind that compromises the simulator/spectator identity.

### Training

- [ ] Build no-fail lessons for camera/controls, energy, formation, sensors,
      identification, countermeasures, wingman commands, ABM, recovery, and debrief.
- [ ] Add pauseable demonstrations and exact checkpoints that restore simulation
      and render state.
- [ ] Grade safety, mission understanding, energy management, communication, and
      decision quality separately from kill count.

### Mission authoring

- [ ] Define a versioned JSON mission schema for theater, weather, time, teams,
      aircraft, pilots, agents, routes, zones, sensors, weapons, rules, objectives,
      triggers, support, recovery, completion, and disclosure.
- [ ] Add a validated in-browser mission editor with map placement, timeline,
      slot/role assignment, preview, seed lock, save, import, and error explanation.
- [ ] Add deterministic procedural mission generation from difficulty, duration,
      era, role, aircraft, theater, and intensity.
- [ ] Keep imported missions data-only; no arbitrary scripts or executable code.

### Progression

- [ ] Add optional local squadron readiness, pilot experience/fatigue, aircraft
      availability, maintenance, mission history, and decorations as narrative state.
- [ ] Do not improve physical aircraft performance through progression.
- [ ] Keep Quick Fight, Watch, and Training independent from campaign state.
- [ ] Defer public rankings until exact replay, moderation, anti-cheat, identity,
      retention, and operating cost justify a separate service.

### Acceptance gate

- [ ] A generated mission is valid, deterministic, completable, replayable, and
      contains an explicit recovery path.
- [ ] Mission import rejects unknown schemas, unsafe content, invalid references,
      impossible loadouts, unsupported aircraft, and out-of-bounds placement.
- [ ] Campaign deletion/export is local, explicit, complete, and independent from
      browser cache required for ordinary Quick Fight.

## C10 — Performance, accessibility, and release health

### Architecture boundaries

- [ ] Split combat into explicit simulation modules: dynamics, pilots, sensors,
      communication, mission, teams, agents, weapons, damage, survival, scoring,
      replay, and serialization.
- [ ] Keep renderer modules limited to world composition, aircraft/effect views,
      interpolation, cameras, audio emitters, HUD projection, and disposal.
- [ ] Keep DOM modules responsible for setup, HUD, tactical display, command
      menus, settings, accessibility, replay controls, and debrief.
- [ ] Use meters, seconds, kilograms, meters/second, radians, and deterministic
      IDs internally; convert to knots, feet, nautical miles, Mach, and degrees only
      at data/UI boundaries.
- [ ] Move multi-aircraft planning, sensor volume queries, or replay analysis to a
      deterministic Worker only after profiling proves a main-thread bottleneck.
- [ ] Consider WASM only for a stable measured hot loop that materially beats
      optimized TypeScript including transfer/copy cost.

### Performance targets

- [ ] Desktop 1440×900 high detail, 4v4, representative weapons/effects:
      95th-percentile active frame time at or below 22 ms.
- [ ] Short laptop 1024×600 medium detail, 2v2: 95th-percentile active frame time
      at or below 28 ms with setup and primary controls fully reachable.
- [ ] Mobile 390×844 low detail: stable 30 FPS target for Watch, tactical command,
      setup, and replay; precision manual piloting is optional on mobile.
- [ ] Simulation remains fixed-step and bounded under slow rendering; catch-up is
      capped and never causes visible teleporting or skipped weapon interactions.
- [ ] Aircraft, tracks, decisions, weapons, projectiles, countermeasures, effects,
      audio voices, labels, events, histories, remote queues, and replay buffers have
      explicit caps and overflow behavior.

### Accessibility and UX

- [ ] Provide pause, time control, remapping, gamepad, keyboard-only setup,
      reduced motion, high contrast, color-vision-safe allegiance/threat semantics,
      captions, scalable HUD, declutter, and warning-volume controls.
- [ ] Avoid rapid message replacement; events receive bounded priority, dwell,
      duplicate suppression, critical interruption, and stale expiry.
- [ ] Preserve explicit deselection and free camera; selecting a target never
      permanently locks the camera.
- [ ] Expose every control outside hover-only or tiny canvas targets.

### Release gate

- [ ] Deterministic dynamics, mission, sensor, agent, weapon, damage, collision,
      replay, migration, asset-budget, performance, input, accessibility, and browser
      tests pass locally.
- [ ] High-altitude matrix covers all theaters, weather profiles, openings, team
      sizes, weapon policies, pilot tiers, and representative aircraft.
- [ ] Long runs prove no airframe collisions, terrain penetration, NaN state,
      unbounded memory, permanent post-kill separation, or unexplained pause.
- [ ] Production assets use relative URLs and deploy additively beside the airport
      and menagerie without a mandatory server.

## Shared contract with Airport Auto

### Shared by design

- Fixed-step harness, interpolation conventions, math utilities, input actions,
  device preferences, camera gestures, accessibility tokens, and performance
  diagnostics.
- Asset manifest, model provenance, GLB/glTF shipping policy, LOD, pooling,
  disposal, and audio-bus infrastructure.
- Replay primitives, canonical fingerprinting, schema migration patterns, local
  capture, structured command results, and authenticated transport.
- A common launcher and explicit links among Airport, Archive, Playground,
  Heritage, and Combat pages.

### Deliberately separate

- World state, time, weather instance, entities, mission, replay, save, scoring,
  analytics, authority, and agent perception.
- Civilian ATC safety/separation rules and combat engagement/weapon rules.
- Civilian traffic programs and combat teams/loadouts.
- Weapons, damage, hostile tracks, and combat warnings from all airport bundles
  unless an explicitly peaceful shared-event format is introduced.

### Potential peaceful crossovers

- [ ] Airshow or heritage flyover at a civilian field with weapons disabled,
      prevalidated routes, airport authority, and spectator-first presentation.
- [ ] Ferry arrival/departure of a demilitarized display aircraft as a special
      airport-life event.
- [ ] Shared cinematic replay viewer that reads either schema through separate
      adapters without merging their simulation states.

## Explicitly deferred or excluded

- Claiming exact classified radar, electronic-warfare, signature, weapon, or
  aircraft performance.
- Real-world weapons training, medical guidance, or operational tactics.
- Massive persistent online warfare before local team missions, replay, authority,
  moderation, security, and operating-cost boundaries are proven.
- Photorealistic global terrain or a planet-scale engine before bounded theaters
  meet gameplay and performance goals.
- Detailed clickable cockpits before external flight, HUD, input, and LOD systems
  are stable.
- Adding all 195 archive families as detailed combat aircraft without missions,
  reviewed public data, distinct handling, sensors, and asset budgets.
- Pay-to-win aircraft, physical-stat progression, loot boxes, or mandatory grind.
- Persistent contrails under the current user-directed presentation policy.
- Any implementation that lets the renderer, camera, UI, or agent write aircraft
  transforms directly.

## Recommended implementation order

1. C1 authoritative manual flight and live takeover.
2. C2 teams, rolling engagements, and mission completion.
3. C3 sensors, identification, datalink, and Air Battle Manager role.
4. C6 minimum exact replay/debrief foundation before the state surface grows.
5. C4 weapons, damage, ejection, and recovery depth.
6. C5 complete human/agent live-control protocol.
7. C7 world, weather, sound, and spectator polish.
8. C8 aircraft/asset expansion after the data contracts are stable.
9. C9 mission editor, procedural content, training, and optional campaign.
10. C10 engineering, performance, accessibility, and release work continuously.

The ordering is intentional: manual flight, team missions, limited perception,
and exact replay create the core product. More aircraft and campaign content only
become valuable after that loop is stable and explainable.

# Soundscape, radio captions, and replay

Airport Auto 2.34 adds a deterministic long-form sound foundation for Auto, Watch, Assisted, and Manual sessions. It is entirely local: the game opens no audio connection, does not request a microphone, does not generate speech at runtime, and does not use real-world radio traffic.

## Current sound model

- Persistent per-aircraft voices follow the authoritative model, engine type, power state, position, and ground/air state. The nearest 14 useful voices receive camera-relative stereo position, distance attenuation, restrained Doppler, simple distance/ground occlusion, and smooth gain/frequency targets.
- Field, tower-room, ramp, APU, wind, rain, and snow beds crossfade from the displayed live or replay weather and traffic state. Low visibility shifts the field/room balance, thunderstorm precipitation drives the rain layer, and wind audio is silent when either weather or wind is switched off.
- Deterministic event decisions add touchdown, reverse thrust, takeoff power, engine start, tug, service vehicle, ramp clatter, deicing spray, gear, gust, weather-transition, and optional rare-thunder cues.
- Fictional offline ATC captions are derived from accepted simulation events. They use a bounded priority queue and 4.2–8 second wall-clock dwell, so busy traffic cannot make them flicker unreadably.
- Five independent buses—Ambience, Aircraft, Weather, Radio, and UI—support Full field, Calm, Radio focus, Engines only, and Silent presets.

The current procedural engine and event synthesis is an original low-bandwidth foundation, not a claim of recorded-aircraft fidelity. License-cleared recorded engine, ramp, terminal, and pre-rendered fictional voice libraries remain future production work.

## Player controls

Enable the master output with **Sound**. Under **Controls → Replay & agent tools → Sound mixer**:

- adjust each of the five channels independently;
- disable fictional radio cues without disabling captions;
- disable captions without changing the radio mix;
- enable rare thunder separately from ordinary rain and gust ambience.

Watch mode selects the Calm preset but does not silently change a player's radio, caption, or high-stakes-weather preferences. Weather and wind switches remain authoritative over their sound layers.

## Determinism and replay

`SoundscapeEventScheduler` chooses event kind, variant, timing, caption, position, and cooldown from the airport seed plus authoritative domain events. It never uses renderer frame count or `Math.random()`.

Replay schema 3 stores `soundEvents` alongside full-state frames, commands, weather history, and causal events. Scrubbing changes both the rendered environment mix and nearby recorded sound/caption decision; it never continues to sonify the hidden live weather state.

The schema-37 snapshot exposes:

- `audio.enabled`, context state, selected preset, bus levels, radio/caption switches, and played/suppressed counts;
- current environment targets for wind, rain, snow, field, room, ramp, and APU;
- the active spatial voice count, maximum, and audible flight IDs;
- deterministic scheduler counters, next ambient decision times, tracked flights, and rare-weather setting;
- the current/queued caption state and total recorded sound events.

## Provenance and validation

[soundscape-manifest.json](../public/audio/soundscape-manifest.json) identifies every shipped source category and explicitly records the absence of network audio, microphone access, runtime voice generation, and external recordings.

Run the focused gates with:

```bash
npm run test:soundscape
npx playwright test e2e/soundscape.spec.ts --project=desktop-chromium
```

The deterministic gate covers seeded variants, cooldowns, actual weather switches, optional thunder, flight tracking, caption dwell, priority interruption, and reset. The browser gate covers the real Web Audio context, bounded spatial voices, readable captions, independent toggles, replay events, snapshot state, and the served source manifest.

# Environment and observer presentation

Airport Auto 2.36 adds a deterministic, continuous scene environment without making presentation state part of aircraft safety logic. The authoritative 20 Hz simulation owns local time, daylight, weather-derived cloud cover, wet pavement, snow cover, and runway-light demand. The renderer interpolates those values and only presents the result.

## Lighting and seasons

Lighting defaults to `automatic`. Sunrise, sunset, dawn, and dusk follow the airport operation profile's compressed local clock and a deterministic calendar day derived from the airport seed. `day` and `night` are explicit presentation overrides; returning to `automatic` restores the local clock.

Season defaults to `automatic` and resolves to spring, summer, autumn, or winter from the seeded day of year. A season can also be forced for screenshots, calm watching, or deterministic test fixtures. The selected season adjusts the daylight window and terrain tint. Weather remains independently controllable.

Rain, fog, thunderstorms, and snow approach their target cloud and surface states continuously. Pavement dries over time, snow accumulates during snow conditions, and snow melts after conditions improve. These transitions are fixed-step and replayable; they do not use `Math.random()` or a live weather service. Values are simulated and not for navigation.

The normal Controls drawer exposes Lighting, Season, and the live environment readout. The compact lighting button cycles automatic → night → day → automatic. URL fixtures may use `?lighting=automatic|day|night` and `?season=automatic|spring|summer|autumn|winter`.

## Calm camera director

The optional camera director is a presentation-only observer for Watch / ASMR sessions. It deterministically favors active landing rolls, departure rolls, approaches, and then surface movement. Each subject receives a long dwell and the existing camera interpolator performs the move.

The director:

- starts off and never issues an aircraft or ATC command;
- yields immediately to pointer, touch, wheel, keyboard, gamepad, explicit focus, camera buttons, or camera API input;
- remains unavailable when the browser reports `prefers-reduced-motion: reduce`;
- never runs while paused, during replay, or after game over; and
- reports its status and current subject through the snapshot and bounded remote projection.

Enable it in Scene & accessibility, with `?director=1`, or through `setCameraDirectorEnabled`.

## Accessible palettes

Four semantic palettes are available:

- `standard`: the original muted Airport Auto palette;
- `high-contrast`: brighter UI and high-luminance map cues;
- `cvd-safe`: blue, amber, and violet semantics that avoid red-versus-green meaning; and
- `monochrome`: shape, text, and luminance carry state with minimal hue dependence.

Palette changes update shared UI variables and runway arrival, departure, line, closure, and focus cues. The selection is stored locally in the browser and applies across airports; no account or network request is involved. Use `?palette=standard|high-contrast|cvd-safe|monochrome` for a URL fixture.

## Control protocol

API 2.36 / snapshot schema 38 adds:

```js
airportControl.request({ action: "setEnvironmentLightingMode", mode: "automatic" });
airportControl.request({ action: "setEnvironmentSeasonMode", mode: "winter" });
airportControl.request({ action: "setAccessibilityPalette", palette: "cvd-safe" });
airportControl.request({ action: "setCameraDirectorEnabled", enabled: true });
```

`snapshot().environment` contains the complete deterministic environment state. `snapshot().presentation` contains the selected palette and director status. `setNightMode` remains as a compatibility command and maps to a forced day or night mode.

## Verification

`npm run test:environment-operations` checks seeded calendar repeatability, all solar phases, manual overrides, continuous wet/snow/cloud transitions, clone isolation, palette semantics, camera dwell, target rotation, and manual yield. Browser coverage verifies the normal controls, renderer palette, URL modes, API responses, local persistence, director focus, and keyboard takeover.

# Unified input controls

Airport Auto 2.27 routes keyboard, mouse, touch, and optional standard-mapped gamepads through one 24-action layer. Three.js receives camera intents only; aircraft selection and ATC clearances still use the normal command and safety path.

## Default controls

| Intent                   | Keyboard         | Mouse / touch                                     | Standard gamepad                   |
| ------------------------ | ---------------- | ------------------------------------------------- | ---------------------------------- |
| Pan map                  | `WASD` or arrows | Drag with one pointer; middle-drag always pans    | Left stick or D-pad                |
| Rotate                   | `Q` / `E`        | —                                                 | Right stick horizontally           |
| Zoom                     | `+` / `-`        | Cursor-centered wheel or two-finger pinch         | Triggers or right stick vertically |
| Reset / next view        | `0` / `V`        | On-screen buttons                                 | Left-stick / right-stick click     |
| Previous / next aircraft | `[` / `]`        | Select an aircraft or strip                       | LB / RB                            |
| Context action           | `Enter`          | Use the shown action button                       | A / Cross                          |
| Cancel / release follow  | `Escape`         | Select the tracked aircraft again or empty ground | B / Circle                         |
| Controls / pause         | `C` / `Space`    | On-screen buttons                                 | Back / Start                       |
| Radar / queues           | `M` / `O`        | On-screen buttons                                 | —                                  |
| Observer focus           | `F`              | `◎` navigator and following chip                  | —                                  |
| Land / go around         | `L` / `G`        | Selected-flight actions                           | — / Y / Triangle                   |
| Hold or resume           | `H`              | Selected-flight action                            | X / Square                         |
| Line up / take off       | `R` / `T`        | Selected-flight actions                           | —                                  |

Held camera keys and analog sticks move continuously at display cadence. A quick camera-key tap still produces one small nudge. Stick input uses an 18% radial deadzone and a user-selectable `0.5×`–`2.0×` sensitivity.

## Context and accessibility

The action router has three contexts: `gameplay`, `ui`, and `modal`. Camera and clearance actions stop beneath drawers and dialogs; Cancel remains available everywhere. Keyboard shortcuts do not fire while typing in or operating form controls, and browser modifier shortcuts such as Ctrl/Command+F remain untouched. Pointer capture is cleaned up on cancellation, window blur, and page visibility loss.

`F` opens the observer navigator for aircraft, runways, named taxiways, gates, queues, and conflicts. Escape first closes that navigator while retaining its target, then releases follow from gameplay. Any deliberate pan, rotate, zoom, view change, or reset also releases follow before applying the camera input. See [observer-focus.md](observer-focus.md).

The compact binding guide lives under **Controls → Replay & agent tools → Unified input**. Gamepad polling is optional and can be disabled. Preferences persist in local storage; keyboard, mouse, and touch remain available when no gamepad is connected or the browser does not expose the Gamepad API.

## URL and local API

Launch overrides:

```text
?gamepad=0
?gamepad=1&gamepadSensitivity=1.4
```

Runtime settings:

```js
airportControl.request({ action: "setGamepadEnabled", enabled: false });
airportControl.request({ action: "setGamepadSensitivity", sensitivity: 1.4 });
```

`airportControl.snapshot().input` exposes input schema/catalog versions, active context, last device/action/gesture, current axes, held actions, device support and connection metadata, preferences, and the complete named-action catalog. These diagnostics are read-only and do not grant authority over aircraft.

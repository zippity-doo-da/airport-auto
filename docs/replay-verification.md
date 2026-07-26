# Exact replay, migration, comparison, and sharing

Airport Auto 2.38 makes replay a portable, inspectable data product rather than only an in-page slider. It remains entirely local unless the player explicitly exports or shares a file.

## What “exact” means

The fixed-step simulation remains the authority. Every recorded frame contains the complete immutable `AirportState` consumed by collision diagnostics and the renderer. Replay never reconstructs a second visual trajectory.

Replay schema 4 adds deterministic receipts for:

- the initial authoritative state;
- every complete replay frame, including predictions and its full state;
- commands, events, weather history, sound decisions, and event markers; and
- one manifest tying the airport, seed, versions, timing, disclosure, and component receipts together.

Canonicalization sorts object keys, normalizes JSON number edge cases, and fingerprints arrays in order. A changed nested aircraft pose therefore identifies the exact mismatched frame. The browser validator also proves that equal fixed-step simulations produce the same canonical receipt across different wall-frame partitions.

These 16-character receipts are deterministic, non-cryptographic fingerprints. They catch corruption and accidental editing; they do not authenticate an author, resist a determined forger, or prove that a legacy file was never changed before migration. Playback is exact full-state playback, while command-log re-execution is deliberately not substituted for the recorded authoritative frames.

## Replay inspector

Open **Controls → Replay & agent tools**.

- **Replay / Live** enters or leaves read-only playback.
- The slider scrubs the exact recorded frames and drives the 3D world, weather presentation, aircraft state, and recorded sound/caption decisions.
- **Verify** checks every receipt. Browser verification yields between small groups of frames so a long file does not monopolize animation updates. If live traffic adds a newer frame afterward, the verified receipt remains readable but changes to a caution state until the latest buffer is verified; imported playback is immutable and does not become stale.
- **Event marker** jumps to the nearest recorded frame for a command, safety event, weather change, movement event, coordination event, or other non-audio telemetry event.
- **Set A** stores a baseline frame. **Compare A ↔ current** reports exact equality or a bounded path-level authoritative state diff.
- **Import** accepts a local JSON replay up to 250 MB, verifies it before use, and opens read-only playback. If necessary, the scene is rebuilt from the recording's supported airport and seed.
- **Live buffer** leaves the imported source and returns to the current local recorder.

The replay inspector is keyboard reachable, uses the existing scrollable control drawer on small screens, and does not take camera input while the drawer is open.

## Schema migration

The migration registry accepts current schema 4 and legacy schema 3.

- Schema 4 must carry sharing disclosure, markers, and a complete integrity manifest.
- Schema 3 is normalized to schema 4 in memory. Because schema 3 never stored receipts, the migrated content is sealed _as received_ and labeled **legacy unsealed**.
- Missing, malformed, schema 1/2, and future unknown schemas are rejected with a structured reason. They are never guessed into the current shape.

This is the first project migration path. Airport-asset, save, command, and event migrations remain separate cross-cutting roadmap work.

## Export and sharing boundary

**Export** writes a `local-full` audit file. It may contain local controller/client identity, correlation IDs, command/event payloads, and free-text reasons. It is never uploaded automatically and the UI explicitly warns not to post the raw file.

**Share file** creates a new `shareable-redacted` recording and fingerprints that result again. Its allowlist preserves simulated airport/aircraft state, timings, safe command shape, operational event identity, weather, and sound decisions while removing or replacing:

- controller, client, request, command, event, and session correlation identity;
- event payloads and causal identifiers;
- free-text reason, detail, feedback, note, and rationale fields; and
- time-of-day precision beyond the UTC date.

The shared package declares those redactions and reports `automaticUpload: false`. Supporting browsers receive the filtered file through the operating system share sheet; others download the filtered file locally.

**Copy seed link** is smaller and does not contain a replay. It starts from the page path, discards the existing query and fragment, then adds only the airport, exact seed, mode, scenario, density, rules, weather/wind, runway mode, hazard opt-in, environment modes, palette, and autostart flag. Credentials, telemetry, controller identity, and unrelated URL parameters cannot carry over.

## Browser API

```js
const recording = airportControl.recording(); // local-full schema 4

airportControl.replayTools.verify(recording);
await airportControl.replayTools.verifyAsync(recording); // yields between frame groups
airportControl.replayTools.load(recording); // verified read-only playback
airportControl.replayTools.compare(10, 40); // bounded state diff
airportControl.replayTools.seedLink(); // deterministic launch URL
airportControl.replayTools.shareable(recording); // redacted and re-fingerprinted
await airportControl.replayTools.shareableAsync(recording);
```

The synchronous methods are convenient for short tests. Long-running tools should use the asynchronous variants so fingerprinting yields between frame groups. `snapshot().replay` is compact. It reports schema/source, frame duration, marker and sound counts, sharing disclosure, the latest verification receipt, and optional comparison summary; raw frames remain available only through the page-local replay methods and are excluded from the remote gateway projection.

## Verification

```bash
npm run test:replay-recording
npx playwright test e2e/airport-auto.spec.ts --grep "Replay inspector"
```

The deterministic validator covers canonical ordering, exact receipts, localized tamper detection, bounded state diffs, event-marker placement, schema-3 migration warnings, unsupported-schema rejection, privacy redaction, re-fingerprinting of shared packages, safe seed URLs, cooperative yielding, and equal fixed-step receipts across wall-frame partitions. The browser test covers the real API, inspector, import, verification, marker navigation, comparison, deterministic `seed=` launch behavior, and desktop/mobile containment.

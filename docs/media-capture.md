# Local media capture and clean spectator view

Airport Auto can make a still image or a short visual clip without adding a hosted media service. Capture is deliberately local, silent, bounded, and separate from replay export.

## Controls

Open **Advanced → Local capture**:

- **Clean spectator view** hides every HUD, drawer, modal, strip, notice, and capture control except an accessible corner exit. Press Escape or the exit button to restore the interface.
- **Save PNG screenshot** captures the WebGL canvas at its current rendered resolution.
- **Record local clip** records the canvas at 30 fps for a selected 3, 5, 10, or 15 seconds. A second press stops early. The browser chooses VP9 WebM, VP8 WebM, or generic WebM in that order.

Clean view does not alter the simulation, camera, selected aircraft, traffic, audio mixer, or replay. Entering it closes secondary UI surfaces so no hidden dialog retains interaction ownership.

## Privacy and limits

- Capture requests the canvas video stream only. It never requests a microphone, camera, screen share, filesystem directory, account, or network upload.
- Clips are silent by design. Reusable sound and replay remain separate artifacts.
- PNG and WebM blobs are downloaded directly by the browser and immediately released after use.
- Recording auto-stops at 15 seconds, tears down every media track, and reports unsupported/empty/error states without leaving a background stream.
- Filenames contain only `airport-auto`, the airport code, deterministic seed, and a local timestamp. They contain no controller identity, credential, callsign list, or live-feed payload.

The local interface is:

```js
airportControl.capture.snapshot();
await airportControl.capture.screenshot();
airportControl.capture.startClip(5);
airportControl.capture.stopClip();
airportControl.capture.setCleanView(true);
```

`snapshot()` explicitly reports `localOnly: true`, `microphone: false`, and `automaticUpload: false`.

## Browser support and verification

PNG requires `HTMLCanvasElement.toBlob`. Clips additionally require `captureStream` and `MediaRecorder`; the UI disables unavailable actions instead of adding a polyfill or remote fallback.

```bash
npm run test:capture
npm run test:release-matrix
```

The deterministic gate verifies bounds, codec choice, automatic stop, local filenames/downloads, stream cleanup, and disclosure. The browser gate verifies clean-chrome isolation, Escape recovery, a real PNG download, and the absence of microphone/upload behavior.

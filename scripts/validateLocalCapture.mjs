import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const validationSource = `
import assert from 'node:assert/strict';
import { LocalCapture } from './src/presentation/localCapture.ts';

const downloads = [];
let trackStops = 0;
let scheduled = null;
class FakeRecorder {
  state = 'inactive';
  mimeType;
  ondataavailable = null;
  onstop = null;
  onerror = null;
  constructor(_stream, options) { this.mimeType = options?.mimeType ?? 'video/webm'; }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['video-frame'], { type: this.mimeType }) });
    this.onstop?.();
  }
}
class ThrowingRecorder extends FakeRecorder {
  stop() { throw new Error('synthetic stop failure'); }
}
const canvas = {
  toBlob(callback, type) { callback(new Blob(['png-frame'], { type })); },
  captureStream(rate) {
    assert.equal(rate, 30);
    return { getTracks: () => [{ stop: () => { trackStops += 1; } }] };
  },
};
const capture = new LocalCapture(canvas, {
  now: () => 1_000,
  recorder: FakeRecorder,
  isTypeSupported: (type) => type.includes('vp8'),
  download: (blob, filename) => downloads.push({ blob, filename }),
  setTimeout: (callback) => { scheduled = callback; return 1; },
  clearTimeout: () => { scheduled = null; },
});
assert.deepEqual(capture.snapshot().supported, { screenshot: true, clip: true });
await capture.screenshot('ORD bad / filename');
assert.equal(downloads[0].filename, 'ORD-bad-filename.png');
assert.equal(downloads[0].blob.size > 0, true);
const recording = capture.startClip(30, 'ORD clip');
assert.equal(recording.status, 'recording');
assert.equal(recording.maximumDurationSeconds, 15);
assert.equal(recording.microphone, false);
assert.equal(recording.automaticUpload, false);
assert.equal(typeof scheduled, 'function');
const finalizing = capture.stopClip();
assert.equal(['finalizing', 'idle'].includes(finalizing.status), true);
assert.equal(downloads[1].filename, 'ORD-clip.webm');
assert.equal(downloads[1].blob.size > 0, true);
assert.equal(trackStops, 1);
assert.equal(capture.snapshot().recording, false);
capture.dispose();
const failingCapture = new LocalCapture(canvas, {
  now: () => 2_000,
  recorder: ThrowingRecorder,
  isTypeSupported: () => true,
  download: () => { throw new Error('failed capture must not download'); },
  setTimeout: (callback) => { scheduled = callback; return 2; },
  clearTimeout: () => { scheduled = null; },
});
failingCapture.startClip(3, 'stop failure');
const failedStop = failingCapture.stopClip();
assert.equal(failedStop.status, 'error');
assert.match(failedStop.error, /synthetic stop failure/);
assert.equal(failedStop.recording, false);
assert.equal(trackStops, 2);
failingCapture.dispose();
console.log(JSON.stringify({ downloads: downloads.map((item) => ({ filename: item.filename, bytes: item.blob.size })), maximumClipSeconds: 15, microphone: false, automaticUpload: false }));
`;

const bundle = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "local-capture-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});
const bundled = bundle.outputFiles[0]?.text;
if (!bundled) throw new Error("Local-capture validation bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

const [html, css, main] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("src/styles.css", "utf8"),
  readFile("src/main.ts", "utf8"),
]);
assert.match(html, /Clean spectator presentation/);
assert.match(html, /3–15 second silent WebM clips stay on this\s+device/);
assert.match(
  css,
  /body\.capture-clean #app > :not\(#scene\):not\(#capture-clean-exit\)/,
);
assert.match(main, /airportControl\.capture/);
assert.doesNotMatch(main, /getUserMedia|microphone/i);

console.log(
  JSON.stringify({
    cleanPresentation: true,
    browserGate: "release-matrix",
    localOnly: true,
  }),
);

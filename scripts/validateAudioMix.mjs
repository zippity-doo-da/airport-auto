import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const validationSource = `
import {
  AUDIO_CHANNELS,
  AUDIO_PRESET_IDS,
  AUDIO_PRESET_MIX,
  isPresentationAudioEventEnabled,
} from "./src/audio/ambientAudio.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  JSON.stringify(AUDIO_CHANNELS) === JSON.stringify([
    "ambience", "aircraft", "weather", "terminal", "radio", "ui",
  ]),
  "audio engine no longer exposes six independent mix buses",
);
assert(AUDIO_PRESET_IDS.includes("sleep"), "Sleep / background preset is missing");
for (const preset of AUDIO_PRESET_IDS) {
  for (const channel of AUDIO_CHANNELS) {
    const gain = AUDIO_PRESET_MIX[preset][channel];
    assert(Number.isFinite(gain) && gain >= 0 && gain <= 1, preset + " has an invalid " + channel + " gain");
  }
}
const sleep = AUDIO_PRESET_MIX.sleep;
assert(sleep.radio === 0 && sleep.ui === 0, "Sleep mix must suppress radio and UI alerts");
assert(sleep.ambience > 0 && sleep.weather > 0 && sleep.terminal > 0, "Sleep mix lost its ambient field layers");
assert(sleep.aircraft > 0 && sleep.aircraft < 0.2, "Sleep mix aircraft layer is not suitably restrained");
assert(!isPresentationAudioEventEnabled({ kind: "service-vehicle" }, { serviceVehicles: false, airportLife: true }), "hidden service vehicles still produce service audio");
assert(!isPresentationAudioEventEnabled({ kind: "ramp-clatter" }, { serviceVehicles: false, airportLife: true }), "hidden service vehicles still produce ramp audio");
assert(isPresentationAudioEventEnabled({ kind: "touchdown" }, { serviceVehicles: false, airportLife: false }), "presentation toggles muted unrelated aircraft audio");
console.log(JSON.stringify({ channels: AUDIO_CHANNELS, sleep }));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "audio-mix-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});
const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Audio mix validation bundle was empty.");
await import(`data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`);

const manifest = JSON.parse(
  await readFile("public/audio/soundscape-manifest.json", "utf8"),
);
const terminalIds = new Set([
  "apu-ramp",
  "ramp-bed",
  "cabin-area",
  "terminal-room",
  "tower-room",
  "service-vehicle-1",
  "service-vehicle-2",
]);
for (const asset of manifest.assets) {
  if (terminalIds.has(asset.id) && asset.channel !== "terminal") {
    throw new Error(`${asset.id} must route through the terminal / landside bus`);
  }
  terminalIds.delete(asset.id);
}
if (terminalIds.size) {
  throw new Error(`terminal audio assets are missing: ${[...terminalIds].join(", ")}`);
}
console.log(JSON.stringify({ terminalAssets: 7 }));

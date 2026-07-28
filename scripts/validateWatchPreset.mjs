import { build } from "esbuild";

const source = `
import { parseWatchPreset, saveWatchPreset, loadWatchPreset, WATCH_PRESET_STORAGE_KEY } from "./src/presentation/watchPreset.ts";
function assert(condition, message) { if (!condition) throw new Error(message); }
const values = new Map();
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const preset = { schemaVersion: 1, ambientProgramId: "quiet-overnight", audioPreset: "calm", radioChatterEnabled: false, radioCaptionsEnabled: true, cameraDirectorEnabled: true, windOverlayVisible: false, serviceVehiclesVisible: true, airportLifeVisible: false };
assert(saveWatchPreset(storage, preset), "preset did not save");
assert(JSON.parse(values.get(WATCH_PRESET_STORAGE_KEY)).flights === undefined, "preset must not contain live flights");
assert(loadWatchPreset(storage)?.ambientProgramId === "quiet-overnight", "preset did not round-trip");
assert(parseWatchPreset(JSON.stringify({ ...preset, flights: [1], controller: "tower" }))?.ambientProgramId === "quiet-overnight", "unknown fields should not enter stored preset state");
assert(parseWatchPreset(JSON.stringify({ ...preset, ambientProgramId: "unknown" })) === null, "unknown ambient program accepted");
assert(parseWatchPreset(JSON.stringify({ ...preset, audioPreset: "loud" })) === null, "unknown audio preset accepted");
assert(parseWatchPreset(JSON.stringify({ ...preset, audioPreset: "sleep" }))?.audioPreset === "sleep", "Sleep / background preset did not round-trip");
console.log(JSON.stringify({ storedKeys: Object.keys(JSON.parse(values.get(WATCH_PRESET_STORAGE_KEY))), preset: loadWatchPreset(storage) }));
`;
const result = await build({ absWorkingDir: process.cwd(), stdin: { contents: source, loader: "ts", resolveDir: process.cwd(), sourcefile: "watch-preset-validation.ts" }, bundle: true, format: "esm", platform: "node", target: "node22", write: false, logLevel: "silent" });
const bundle = result.outputFiles[0]?.text;
if (!bundle) throw new Error("Watch preset validation bundle was empty.");
try { await import(`data:text/javascript;base64,${Buffer.from(bundle).toString("base64")}`); }
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }

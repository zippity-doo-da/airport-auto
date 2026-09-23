import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Keep esbuild's temporary entry inside the workspace. On locked-down Windows
// profiles it cannot always traverse the system temp directory back to the
// repository imports, while this directory is both disposable and resolvable.
const tempDir = await mkdtemp(join(process.cwd(), ".tmp-async-assets-"));
const entryPath = join(tempDir, "entry.ts");
const workspacePath = process.cwd().replace(/\\/g, "/");

const source = `
import { loadImportedAirportAssets } from ${JSON.stringify(
  workspacePath + "/src/simulation/asyncAirportAssets.ts",
)};
import { airportVectorManifest } from ${JSON.stringify(
  workspacePath + "/src/simulation/airportVectorMetadata.ts",
)};
import { airportContextDataManifest } from ${JSON.stringify(
  workspacePath + "/src/simulation/airportContextData.ts",
)};
import { airportSurfaceDataManifest, importedAirportSurfaceGraph } from ${JSON.stringify(
  workspacePath + "/src/simulation/importedAirportData.ts",
)};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const [index, code] of ["ATL", "DFW", "ORD"].entries()) {
  const seed = 21_000 + index;
  const loaded = await loadImportedAirportAssets(code, seed);
  assert(loaded, code + " did not resolve through the async asset loader");
  const surface = importedAirportSurfaceGraph(code, seed);
  assert(surface, code + " has no synchronous source graph");
  assert(JSON.stringify(loaded.surfaceGraph) === JSON.stringify(surface), code + " async surface graph differs from the synchronous clone");
  assert(JSON.stringify(loaded.vectorData) === JSON.stringify(airportVectorManifest(code)), code + " async vector manifest differs from the synchronous source");
  assert(JSON.stringify(loaded.surfaceData) === JSON.stringify(airportSurfaceDataManifest(code)), code + " async surface manifest differs from the synchronous source");
  assert(JSON.stringify(loaded.contextData) === JSON.stringify(airportContextDataManifest(code)), code + " async context manifest differs from the synchronous source");
  const originalX = surface.nodes[0]?.position[0];
  if (loaded.surfaceGraph.nodes[0]) loaded.surfaceGraph.nodes[0].position[0] += 1;
  assert(surface.nodes[0]?.position[0] === originalX, code + " async graph leaked mutable state into the synchronous graph");
}

assert(await loadImportedAirportAssets("LOCAL", 1) === undefined, "local airport unexpectedly requested an imported asset bundle");
console.log(JSON.stringify({ airports: 3, dynamicAssets: true }));
`;

try {
  await writeFile(entryPath, source, "utf8");
  await build({
    entryPoints: [entryPath],
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "node",
    target: "node22",
    outdir: tempDir,
    outExtension: { ".js": ".mjs" },
    entryNames: "entry",
    logLevel: "silent",
  });
  await import(pathToFileURL(join(tempDir, "entry.mjs")).href);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

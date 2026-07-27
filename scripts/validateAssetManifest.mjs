import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const manifest = JSON.parse(
  await readFile("public/airport-auto-assets.json", "utf8"),
);
const bundledManifest = JSON.parse(
  await readFile("src/assets/airport-auto-assets.json", "utf8"),
);
if (JSON.stringify(manifest) !== JSON.stringify(bundledManifest)) {
  throw new Error(
    "Public and bundled stable asset manifests drifted. Update them together.",
  );
}
if (
  manifest.schemaVersion !== 1 ||
  manifest.manifestId !== "airport-auto-assets"
) {
  throw new Error(
    "Public asset manifest has an unsupported identity or schema.",
  );
}
if (manifest.generatedBundlesArePublicApi !== false) {
  throw new Error("Generated bundle names must never be declared public API.");
}
if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
  throw new Error("Public asset manifest is empty.");
}

const keys = new Set();
const paths = new Set();
for (const asset of manifest.assets) {
  if (typeof asset.key !== "string" || keys.has(asset.key))
    throw new Error(`Duplicate or invalid asset key: ${asset.key}`);
  if (typeof asset.path !== "string" || paths.has(asset.path))
    throw new Error(`Duplicate or invalid asset path: ${asset.path}`);
  if (/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(?:js|css)$/i.test(asset.path))
    throw new Error(
      `${asset.key}: generated hash path leaked into stable manifest`,
    );
  if (
    asset.path.startsWith("/") ||
    asset.path.includes("..") ||
    asset.path.includes("\\")
  )
    throw new Error(`${asset.key}: asset path is not deployment-relative`);
  const bytes = await readFile(`public/${asset.path}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== asset.sha256)
    throw new Error(
      `${asset.key}: sha256 mismatch; refresh the stable manifest intentionally`,
    );
  await readFile(asset.licenseRef);
  keys.add(asset.key);
  paths.add(asset.path);
}

const validationSource = `
import {
  airportAutoAsset,
  airportAutoAssetManifest,
  airportAutoAssetPath,
  airportAutoAssetUrl,
} from './src/assets/assetManifest.ts';
import { airportVectorManifest } from './src/simulation/airportVectorMetadata.ts';
import { airportSurfaceDataManifest } from './src/simulation/importedAirportData.ts';
import { airportContextDataManifest } from './src/simulation/airportContextData.ts';

const manifest = airportAutoAssetManifest();
if (manifest.assets.length !== 4) throw new Error('typed asset manifest is incomplete');
manifest.assets.pop();
if (airportAutoAssetManifest().assets.length !== 4) throw new Error('asset manifest leaked mutable state');
if (airportAutoAsset('airport.ORD.vector').kind !== 'airport-vector') throw new Error('typed asset lookup returned the wrong entry');
if (airportAutoAssetPath('audio.soundscape-manifest') !== 'audio/soundscape-manifest.json') throw new Error('stable soundscape key drifted');
if (airportAutoAssetUrl('airport.ORD.context', 'https://example.test/airport-auto/').href !== 'https://example.test/airport-auto/data/airports/KORD.context.json') throw new Error('relative deployment URL resolution drifted');
if (airportVectorManifest('ORD')?.assetPath !== airportAutoAssetPath('airport.ORD.vector')) throw new Error('vector metadata bypasses stable asset key');
if (airportSurfaceDataManifest('ORD')?.assetPath !== airportAutoAssetPath('airport.ORD.surface-source')) throw new Error('surface metadata bypasses stable asset key');
if (airportContextDataManifest('ORD')?.assetPath !== airportAutoAssetPath('airport.ORD.context')) throw new Error('context metadata bypasses stable asset key');
console.log(JSON.stringify({ schemaVersion: manifest.schemaVersion, assets: 4 }));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "asset-manifest-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Asset manifest validation bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);
console.log(
  JSON.stringify({ stableKeys: keys.size, verifiedHashes: paths.size }),
);

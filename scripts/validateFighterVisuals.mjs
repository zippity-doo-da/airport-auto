import { build } from "esbuild";

const validationSource = `
import { fighterById } from './src/fighters/fighterCatalog.ts';
import { createFighterVisual } from './src/fighters/fighterVisualFactory.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const expected = {
  'f-35': ['f35a-cockpit-interior', 'f35a-pilot-helmet-silhouette', 'f35a-service-panel-seams'],
  'f-22': ['f22a-cockpit-interior', 'f22a-pilot-helmet-silhouette', 'f22a-service-panel-seams'],
  'j-20': ['j20-cockpit-interior', 'j20-pilot-helmet-silhouette', 'j20-service-panel-seams'],
  'mig-35': ['mig35-cockpit-interior', 'mig35-pilot-helmet-silhouette', 'mig35-service-panel-seams'],
};
const genericJetIds = ["me-262", "f-15", "f-16", "su-27", "rafale", "gripen-e"];
const maximums = { highTriangles: 0, highDraws: 0, lowTriangles: 0, lowDraws: 0 };
for (const [id, names] of Object.entries(expected)) {
  const fighter = fighterById(id);
  assert(fighter, 'missing detailed fighter profile: ' + id);
  const high = createFighterVisual(fighter, false);
  const low = createFighterVisual(fighter, true);
  const highStats = high.root.userData.renderStats;
  const lowStats = low.root.userData.renderStats;
  assert(highStats && lowStats, id + ' lacks render stats');
  for (const name of names) {
    assert(high.root.getObjectByName(name), id + ' high-detail model lacks ' + name);
    assert(!low.root.getObjectByName(name), id + ' low-detail model includes ' + name);
  }
  assert(highStats.triangles < 12000, id + ' exceeds a close-view triangle budget');
  assert(highStats.meshDraws < 110, id + ' exceeds a close-view draw budget');
  assert(lowStats.triangles < highStats.triangles, id + ' low-detail LOD does not reduce triangles');
  assert(lowStats.meshDraws < highStats.meshDraws, id + ' low-detail LOD does not reduce mesh draws');
  maximums.highTriangles = Math.max(maximums.highTriangles, highStats.triangles);
  maximums.highDraws = Math.max(maximums.highDraws, highStats.meshDraws);
  maximums.lowTriangles = Math.max(maximums.lowTriangles, lowStats.triangles);
  maximums.lowDraws = Math.max(maximums.lowDraws, lowStats.meshDraws);
  high.dispose();
  low.dispose();
}
for (const id of genericJetIds) {
  const fighter = fighterById(id);
  assert(fighter, "missing generic jet profile: " + id);
  const high = createFighterVisual(fighter, false);
  const low = createFighterVisual(fighter, true);
  const highStats = high.root.userData.renderStats;
  const lowStats = low.root.userData.renderStats;
  assert(high.root.getObjectByName(id + "-jet-detail-kit"), id + " lacks high-detail jet kit");
  assert(!low.root.getObjectByName(id + "-jet-detail-kit"), id + " low-detail LOD includes jet kit");
  assert(high.root.getObjectByName(id + "-airframe-panel-lines"), id + " lacks panel-line presentation");
  assert(highStats && lowStats, id + " lacks generic render stats");
  assert(highStats.triangles < 8000, id + " exceeds generic close-view triangle budget");
  assert(highStats.meshDraws < 80, id + " exceeds generic close-view draw budget");
  assert(lowStats.triangles < highStats.triangles, id + " generic low-detail LOD does not reduce triangles");
  assert(lowStats.meshDraws < highStats.meshDraws, id + " generic low-detail LOD does not reduce mesh draws");
  maximums.highTriangles = Math.max(maximums.highTriangles, highStats.triangles);
  maximums.highDraws = Math.max(maximums.highDraws, highStats.meshDraws);
  maximums.lowTriangles = Math.max(maximums.lowTriangles, lowStats.triangles);
  maximums.lowDraws = Math.max(maximums.lowDraws, lowStats.meshDraws);
  high.dispose();
  low.dispose();
}
console.log(JSON.stringify({ models: Object.keys(expected).length + genericJetIds.length, maximums }));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "fighter-visual-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});
const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Fighter visual validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const [manifest, vectorManifest, asset] = await Promise.all([
  readJson('src/data/airports/KATL.context.manifest.json'),
  readJson('src/data/airports/KATL.manifest.json'),
  readJson('public/data/airports/KATL.context.json'),
]);
const assetBytes = await readFile(path.join(root, 'public', manifest.assetPath));
const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};
const countPoints = (features, property = 'points') => features.reduce((total, feature) => (
  total + (property === 'rings'
    ? feature.rings.reduce((ringTotal, ring) => ringTotal + ring.length, 0)
    : feature.points.length)
), 0);
const sortedUniqueIds = (features) => {
  const ids = features.map((feature) => feature.id);
  return ids.length === new Set(ids).size && ids.every((id, index) => index === 0 || ids[index - 1].localeCompare(id) <= 0);
};
const validPoint = (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

assert(manifest.schemaVersion === 1 && asset.schemaVersion === 1, 'Atlanta context schema must be version 1');
assert(manifest.airport.icaoId === 'KATL' && asset.airport.icaoId === 'KATL', 'Atlanta context asset identity drifted');
assert(manifest.airport.navigationUse === false && asset.airport.navigationUse === false, 'Atlanta context must remain non-navigational');
assert(manifest.assetSha256 === createHash('sha256').update(assetBytes).digest('hex'), 'Atlanta context SHA-256 does not match its manifest');
assert(JSON.stringify(manifest.coordinateSystem) === JSON.stringify(asset.coordinateSystem), 'Atlanta context coordinate metadata drifted');
assert(JSON.stringify(manifest.coordinateSystem.originWgs84) === JSON.stringify(vectorManifest.coordinateSystem.originWgs84), 'Atlanta context and vector origins differ');
assert(manifest.boundsMeters.min[0] <= -11999 && manifest.boundsMeters.max[0] >= 11999, 'Atlanta context needs at least a 24 km east/west extent');
assert(manifest.boundsMeters.min[1] <= -9999 && manifest.boundsMeters.max[1] >= 9999, 'Atlanta context needs at least a 20 km north/south extent');
assert(JSON.stringify(manifest.source) === JSON.stringify(asset.source), 'Atlanta context source provenance drifted');
assert(manifest.source.provider === 'OpenStreetMap' && manifest.source.endpoint.startsWith('https://'), 'Atlanta context requires HTTPS OpenStreetMap provenance');
assert(Object.keys(manifest.source.queries).sort().join(',') === 'areas,roads,transport', 'Atlanta context must retain roads, transport, and areas queries');
assert(sortedUniqueIds(asset.roads) && sortedUniqueIds(asset.rails) && sortedUniqueIds(asset.waterways) && sortedUniqueIds(asset.areas), 'Atlanta context feature IDs must be sorted and unique');

const expectedCounts = {
  roads: asset.roads.length,
  roadPoints: countPoints(asset.roads),
  rails: asset.rails.length,
  railPoints: countPoints(asset.rails),
  waterways: asset.waterways.length,
  waterwayPoints: countPoints(asset.waterways),
  areas: asset.areas.length,
  areaPoints: countPoints(asset.areas, 'rings'),
  boundaryRings: asset.airportBoundary.rings.length,
  boundaryPoints: asset.airportBoundary.rings.reduce((total, ring) => total + ring.length, 0),
};
for (const [key, count] of Object.entries(expectedCounts)) {
  assert(manifest.counts[key] === count, `Atlanta context ${key} count drifted`);
}
for (const collection of [asset.roads, asset.rails, asset.waterways]) {
  for (const feature of collection) {
    assert(feature.points.length >= 2 && feature.points.every(validPoint), `Atlanta context line ${feature.id} is invalid`);
  }
}
for (const area of asset.areas) {
  for (const ring of area.rings) {
    assert(ring.length >= 4 && ring.every(validPoint), `Atlanta context area ${area.id} is invalid`);
  }
}
const landmarkText = [...asset.roads, ...asset.rails, ...asset.waterways]
  .flatMap((feature) => [feature.name, feature.ref])
  .filter(Boolean)
  .join(' | ')
  .toLowerCase();
for (const landmark of ['i 75', 'i 85', 'i 285', 'atlanta terminal subdivision', 'south river']) {
  assert(landmarkText.includes(landmark), `Recognizable Atlanta context is missing ${landmark}`);
}

if (errors.length) {
  console.error(`Atlanta context validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ airport: 'ATL', ...expectedCounts, boundary: asset.airportBoundary.sourceId }));
}

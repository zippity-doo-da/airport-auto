import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(repositoryRoot, 'src/data/airports/KORD.context.manifest.json');
const vectorManifestPath = path.join(repositoryRoot, 'src/data/airports/KORD.manifest.json');
const surfaceGraphPath = path.join(repositoryRoot, 'src/data/airports/KORD.surfaceGraph.json');

const [manifestText, vectorManifestText, surfaceGraphText] = await Promise.all([
  readFile(manifestPath, 'utf8'),
  readFile(vectorManifestPath, 'utf8'),
  readFile(surfaceGraphPath, 'utf8'),
]);
const manifest = JSON.parse(manifestText);
const vectorManifest = JSON.parse(vectorManifestText);
const surfaceGraph = JSON.parse(surfaceGraphText);
const assetPath = path.join(repositoryRoot, 'public', manifest.assetPath);
const assetBuffer = await readFile(assetPath);
const asset = JSON.parse(assetBuffer.toString('utf8'));
const errors = [];

const assert = (condition, message) => {
  if (!condition) errors.push(message);
};
const pointsEqual = (first, second) => first?.[0] === second?.[0] && first?.[1] === second?.[1];
const signedArea = (ring) => ring.slice(0, -1).reduce((sum, point, index) => {
  const next = ring[index + 1];
  return sum + point[0] * next[1] - next[0] * point[1];
}, 0) / 2;
const pointInRing = ([x, y], ring) => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    const intersects = (yi > y) !== (yj > y)
      && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};
const pointToSegmentDistance = (point, start, end) => {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const amount = lengthSquared <= 0
    ? 0
    : Math.max(0, Math.min(1, ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaY) / lengthSquared));
  return Math.hypot(point[0] - start[0] - amount * deltaX, point[1] - start[1] - amount * deltaY);
};
const distanceToRing = (point, ring) => ring.slice(1).reduce((minimum, end, index) => (
  Math.min(minimum, pointToSegmentDistance(point, ring[index], end))
), Number.POSITIVE_INFINITY);
const validPoint = (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
const validateLine = (feature, label) => {
  assert(typeof feature.id === 'string' && feature.id.length > 0, `${label} has no stable ID`);
  assert(Array.isArray(feature.points) && feature.points.length >= 2, `${feature.id ?? label} has fewer than two points`);
  assert(feature.points?.every(validPoint), `${feature.id ?? label} has invalid coordinates`);
};
const validateRing = (ring, label) => {
  assert(Array.isArray(ring) && ring.length >= 4, `${label} has fewer than four ring points`);
  assert(ring?.every(validPoint), `${label} has invalid coordinates`);
  assert(pointsEqual(ring?.[0], ring?.at(-1)), `${label} is not closed`);
  assert(Math.abs(signedArea(ring ?? [])) >= 1, `${label} has degenerate area`);
};
const countPoints = (features, property = 'points') => features.reduce((sum, feature) => (
  sum + (property === 'rings'
    ? feature.rings.reduce((ringSum, ring) => ringSum + ring.length, 0)
    : feature.points.length)
), 0);
const idsAreUniqueAndSorted = (features) => {
  const ids = features.map((feature) => feature.id);
  return new Set(ids).size === ids.length && ids.every((id, index) => index === 0 || ids[index - 1].localeCompare(id) <= 0);
};

assert(manifest.schemaVersion === 1 && asset.schemaVersion === 1, 'Context schema must be version 1');
assert(manifest.airport.icaoId === 'KORD' && asset.airport.icaoId === 'KORD', 'Context airport must be KORD');
assert(manifest.airport.navigationUse === false && asset.airport.navigationUse === false, 'Context must be marked not for navigation');
assert(manifest.assetSha256 === createHash('sha256').update(assetBuffer).digest('hex'), 'Context SHA-256 does not match manifest');
assert(JSON.stringify(manifest.coordinateSystem) === JSON.stringify(asset.coordinateSystem), 'Manifest and asset coordinate systems differ');
assert(JSON.stringify(manifest.coordinateSystem.originWgs84) === JSON.stringify(vectorManifest.coordinateSystem.originWgs84), 'Context and FAA vector origins differ');
assert(manifest.coordinateSystem.unit === 'meter' && manifest.coordinateSystem.axes.x === 'east' && manifest.coordinateSystem.axes.y === 'north', 'Context axes must be local east/north meters');
assert(manifest.boundsMeters.min[0] <= -11999 && manifest.boundsMeters.max[0] >= 11999, 'Context east/west extent is less than 12 km');
assert(manifest.boundsMeters.min[1] <= -9999 && manifest.boundsMeters.max[1] >= 9999, 'Context north/south extent is less than 10 km');
assert(JSON.stringify(manifest.source) === JSON.stringify(asset.source), 'Manifest and asset source metadata differ');
assert(manifest.source.provider === 'OpenStreetMap', 'Context provider must be OpenStreetMap');
assert(manifest.source.endpoint.startsWith('https://'), 'Context endpoint must be HTTPS');
assert(Object.keys(manifest.source.queries).sort().join(',') === 'areas,roads,transport', 'Context must retain all three exact source queries');
assert(Object.values(manifest.source.queries).every((query) => query.includes('[out:json]') && query.includes('out ')), 'Context source queries are incomplete');
assert(manifest.license === 'Open Data Commons Open Database License 1.0', 'Context ODbL metadata is missing');
assert(manifest.attribution === '© OpenStreetMap contributors', 'OpenStreetMap attribution is missing');
assert(manifest.copyrightUrl === 'https://www.openstreetmap.org/copyright', 'OpenStreetMap copyright URL is missing');

for (const [key, expected] of Object.entries(manifest.counts)) {
  const actual = {
    roads: asset.roads.length,
    roadPoints: countPoints(asset.roads),
    rails: asset.rails.length,
    railPoints: countPoints(asset.rails),
    waterways: asset.waterways.length,
    waterwayPoints: countPoints(asset.waterways),
    areas: asset.areas.length,
    areaPoints: countPoints(asset.areas, 'rings'),
    boundaryRings: asset.airportBoundary.rings.length,
    boundaryPoints: asset.airportBoundary.rings.reduce((sum, ring) => sum + ring.length, 0),
  }[key];
  assert(actual === expected, `${key} count is ${actual}; expected ${expected}`);
}

for (const [collectionName, collection] of [['roads', asset.roads], ['rails', asset.rails], ['waterways', asset.waterways]]) {
  assert(idsAreUniqueAndSorted(collection), `${collectionName} IDs must be unique and sorted`);
  collection.forEach((feature) => validateLine(feature, collectionName));
}
assert(idsAreUniqueAndSorted(asset.areas), 'Area IDs must be unique and sorted');
asset.areas.forEach((area) => area.rings.forEach((ring, index) => validateRing(ring, `${area.id} ring ${index}`)));
assert(asset.airportBoundary.sourceId === 'relation/13423944', 'Unexpected KORD aerodrome boundary source');
asset.airportBoundary.rings.forEach((ring, index) => validateRing(ring, `airport boundary ring ${index}`));

const outerBoundary = asset.airportBoundary.rings[0];
const metersPerWorldUnit = vectorManifest.runtimeReference.worldMetersPerUnit;
for (const runway of vectorManifest.runtimeReference.runways) {
  const halfLengthMeters = runway.sourceLengthMeters / 2;
  const centerMeters = runway.center.map((coordinate) => coordinate * metersPerWorldUnit);
  const direction = [Math.cos(runway.heading), Math.sin(runway.heading)];
  for (const end of [-1, 1]) {
    const endpoint = [centerMeters[0] + direction[0] * halfLengthMeters * end, centerMeters[1] + direction[1] * halfLengthMeters * end];
    assert(pointInRing(endpoint, outerBoundary), `FAA runway ${runway.runwayId} endpoint lies outside the sourced airport boundary`);
  }
}
for (const node of surfaceGraph.nodes) {
  const pointMeters = node.position.map((coordinate) => coordinate * metersPerWorldUnit);
  assert(pointInRing(pointMeters, outerBoundary), `Surface node ${node.id} lies outside the sourced airport boundary`);
}
const surfaceNodeById = new Map(surfaceGraph.nodes.map((node) => [node.id, node]));
let minimumPavementBoundaryClearance = Number.POSITIVE_INFINITY;
for (const edge of surfaceGraph.edges) {
  const start = surfaceNodeById.get(edge.from)?.position;
  const end = surfaceNodeById.get(edge.to)?.position;
  if (!start || !end) continue;
  const lengthMeters = Math.hypot(end[0] - start[0], end[1] - start[1]) * metersPerWorldUnit;
  const samples = Math.max(2, Math.ceil(lengthMeters / 25));
  for (let index = 0; index <= samples; index += 1) {
    const amount = index / samples;
    const pointMeters = [
      (start[0] + (end[0] - start[0]) * amount) * metersPerWorldUnit,
      (start[1] + (end[1] - start[1]) * amount) * metersPerWorldUnit,
    ];
    const clearance = distanceToRing(pointMeters, outerBoundary) - edge.width * metersPerWorldUnit / 2;
    minimumPavementBoundaryClearance = Math.min(minimumPavementBoundaryClearance, clearance);
    assert(pointInRing(pointMeters, outerBoundary) && clearance >= 25, `Surface edge ${edge.id} leaves the airport cover or has less than 25 m boundary clearance`);
  }
}

const featureText = [...asset.roads, ...asset.rails, ...asset.waterways]
  .flatMap((feature) => [feature.name, feature.ref])
  .filter(Boolean)
  .join(' | ')
  .toLowerCase();
for (const landmark of ['i 90', 'i 190', 'i 294', 'i 490', 'il 390', 'mannheim', 'airport transit system', 'des plaines river']) {
  assert(featureText.includes(landmark), `Recognizable ORD context is missing ${landmark}`);
}

if (errors.length) {
  console.error(`O'Hare context validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`O'Hare context valid: ${asset.roads.length.toLocaleString()} roads, ${asset.rails.length.toLocaleString()} rail segments, ${asset.waterways.length} waterways, ${asset.areas.length.toLocaleString()} areas, boundary ${asset.airportBoundary.sourceId}.`);
  console.log(`All FAA runways and authoritative pavement stay inside the airport cover with at least ${minimumPavementBoundaryClearance.toFixed(1)} m clearance.`);
}

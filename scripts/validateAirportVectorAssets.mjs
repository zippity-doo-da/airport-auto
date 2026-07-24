import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPECTED_LAYERS = {
  runways: { minimum: 8, geometry: new Set(["Polygon", "MultiPolygon"]) },
  taxiways: { minimum: 400, geometry: new Set(["Polygon", "MultiPolygon"]) },
  aprons: { minimum: 10, geometry: new Set(["Polygon", "MultiPolygon"]) },
  buildings: { minimum: 10, geometry: new Set(["Polygon", "MultiPolygon"]) },
  hotspots: { minimum: 1, geometry: new Set(["Polygon", "MultiPolygon"]) },
  stopways: { minimum: 1, geometry: new Set(["Polygon", "MultiPolygon"]) },
  beacons: { minimum: 1, geometry: new Set(["Point"]) },
  windIndicators: { minimum: 1, geometry: new Set(["Point"]) },
};

const assetPath = path.resolve(
  process.argv[2] ?? "public/data/airports/KORD.vector.json",
);
const manifestPath = path.resolve(
  process.argv[3] ?? "src/data/airports/KORD.manifest.json",
);
const [assetText, manifestText] = await Promise.all([
  readFile(assetPath, "utf8"),
  readFile(manifestPath, "utf8"),
]);
const asset = JSON.parse(assetText);
const manifest = JSON.parse(manifestText);
const errors = [];

check(asset.schemaVersion === 1, "asset schemaVersion must be 1");
check(asset.importerVersion === 1, "asset importerVersion must be 1");
check(
  asset.airport?.icaoId === "KORD" && asset.airport?.faaId === "ORD",
  "asset airport identity must be KORD/ORD",
);
check(
  asset.airport?.navigationUse === false,
  "asset must be marked as not for navigation",
);
check(
  /^\d{4}-\d{2}-\d{2}$/.test(asset.retrievedOn),
  "asset retrieval date is missing or malformed",
);
check(
  asset.coordinateSystem?.source === "EPSG:4326",
  "source coordinate system must be EPSG:4326",
);
check(
  asset.coordinateSystem?.local === "local-tangent-plane",
  "local coordinate system is missing",
);
check(
  asset.coordinateSystem?.unit === "meter",
  "local coordinates must be stored in metres",
);
check(
  Array.isArray(asset.coordinateSystem?.originWgs84) &&
    asset.coordinateSystem.originWgs84.length === 2,
  "WGS 84 origin is missing",
);

const checksum = createHash("sha256").update(assetText).digest("hex");
check(
  manifest.assetSha256 === checksum,
  `manifest checksum ${manifest.assetSha256} does not match ${checksum}`,
);
check(
  manifest.schemaVersion === asset.schemaVersion,
  "manifest schema version differs from asset",
);
check(
  JSON.stringify(manifest.airport) === JSON.stringify(asset.airport),
  "manifest airport metadata differs from asset",
);
check(
  manifest.retrievedOn === asset.retrievedOn,
  "manifest retrieval date differs from asset",
);
check(
  JSON.stringify(manifest.effective) === JSON.stringify(asset.effective),
  "manifest effective window differs from asset",
);
check(
  JSON.stringify(manifest.coordinateSystem) ===
    JSON.stringify(asset.coordinateSystem),
  "manifest coordinate system differs from asset",
);
check(
  JSON.stringify(manifest.boundsMeters) === JSON.stringify(asset.boundsMeters),
  "manifest bounds differ from asset",
);
check(
  typeof manifest.attribution === "string" &&
    manifest.attribution.includes("Federal Aviation Administration"),
  "FAA attribution is missing from manifest",
);

const sources = new Map();
for (const source of asset.sources ?? []) {
  check(
    !sources.has(source.layer),
    `duplicate source metadata for ${source.layer}`,
  );
  sources.set(source.layer, source);
  check(
    source.owner === "AeronauticalInformationServices_FAA",
    `${source.layer}: unexpected owner ${source.owner}`,
  );
  check(
    String(source.license).toLowerCase().includes("public use"),
    `${source.layer}: public-use statement is missing`,
  );
  check(
    String(source.attribution).includes("Federal Aviation Administration"),
    `${source.layer}: FAA attribution is missing`,
  );
  check(
    source.coordinateSystem === "EPSG:4326",
    `${source.layer}: unexpected source coordinate system ${source.coordinateSystem}`,
  );
  check(
    /^https:\/\/services6\.arcgis\.com\//.test(source.sourceUrl),
    `${source.layer}: feature source URL is missing`,
  );
  check(
    /^\d{4}-\d{2}-\d{2}T/.test(source.modifiedAt),
    `${source.layer}: modification timestamp is missing`,
  );
}

const observedBounds = {
  min: [Infinity, Infinity],
  max: [-Infinity, -Infinity],
};
let totalFeatures = 0;
let totalCoordinates = 0;
for (const [layerName, expectation] of Object.entries(EXPECTED_LAYERS)) {
  const features = asset.layers?.[layerName];
  check(Array.isArray(features), `${layerName}: layer is missing`);
  if (!Array.isArray(features)) continue;
  totalFeatures += features.length;
  check(
    features.length >= expectation.minimum,
    `${layerName}: expected at least ${expectation.minimum} features, found ${features.length}`,
  );
  check(
    manifest.layerCounts?.[layerName] === features.length,
    `${layerName}: manifest count differs from asset`,
  );
  check(
    sources.get(layerName)?.featureCount === features.length,
    `${layerName}: source count differs from asset`,
  );
  const ids = new Set();
  let previousObjectId = -Infinity;
  for (const feature of features) {
    check(
      typeof feature.id === "string" && feature.id.startsWith(`${layerName}:`),
      `${layerName}: invalid feature id ${feature.id}`,
    );
    check(
      !ids.has(feature.id),
      `${layerName}: duplicate feature id ${feature.id}`,
    );
    ids.add(feature.id);
    check(
      Number.isInteger(feature.sourceObjectId),
      `${feature.id}: sourceObjectId must be an integer`,
    );
    check(
      feature.sourceObjectId > previousObjectId,
      `${feature.id}: features are not deterministically sorted by sourceObjectId`,
    );
    previousObjectId = feature.sourceObjectId;
    check(
      feature.properties?.sourceObjectId === feature.sourceObjectId,
      `${feature.id}: property/source object identifiers differ`,
    );
    check(
      expectation.geometry.has(feature.geometry?.type),
      `${feature.id}: unexpected geometry ${feature.geometry?.type}`,
    );
    totalCoordinates += validateGeometry(feature, observedBounds);
  }
}

check(
  Object.keys(asset.layers ?? {}).length ===
    Object.keys(EXPECTED_LAYERS).length,
  "asset has missing or unrecognized layers",
);
check(
  sources.size === Object.keys(EXPECTED_LAYERS).length,
  "source metadata does not cover every layer exactly once",
);
check(
  asset.layers.runways.every(
    (feature) => typeof feature.properties.runwayId === "string",
  ),
  "one or more runways lack a designation",
);
check(
  new Set(asset.layers.runways.map((feature) => feature.properties.runwayId))
    .size === asset.layers.runways.length,
  "runway designations are not unique",
);

for (const axis of [0, 1]) {
  check(
    Math.abs(observedBounds.min[axis] - asset.boundsMeters.min[axis]) <= 0.11,
    `asset minimum bound for axis ${axis} is incorrect`,
  );
  check(
    Math.abs(observedBounds.max[axis] - asset.boundsMeters.max[axis]) <= 0.11,
    `asset maximum bound for axis ${axis} is incorrect`,
  );
}

if (errors.length) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${asset.airport.icaoId} airport vector asset valid: ${totalFeatures} features, ${totalCoordinates.toLocaleString()} coordinates, ${checksum.slice(0, 12)} checksum\n`,
  );
}

function validateGeometry(feature, bounds) {
  const geometry = feature.geometry;
  if (geometry.type === "Point")
    return validatePoint(geometry.coordinates, feature.id, bounds);
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  check(
    Array.isArray(polygons) && polygons.length > 0,
    `${feature.id}: polygon collection is empty`,
  );
  let coordinateCount = 0;
  for (const polygon of polygons) {
    check(
      Array.isArray(polygon) && polygon.length > 0,
      `${feature.id}: polygon has no rings`,
    );
    for (const ring of polygon) {
      check(
        Array.isArray(ring) && ring.length >= 4,
        `${feature.id}: polygon ring has fewer than four points`,
      );
      if (!Array.isArray(ring)) continue;
      coordinateCount += ring.length;
      for (const point of ring) validatePoint(point, feature.id, bounds);
      if (ring.length >= 2) {
        const first = ring[0];
        const last = ring.at(-1);
        check(
          first[0] === last[0] && first[1] === last[1],
          `${feature.id}: polygon ring is not closed`,
        );
      }
      check(
        Math.abs(signedArea(ring)) >= 0.01,
        `${feature.id}: polygon ring is degenerate`,
      );
      for (let index = 1; index < ring.length; index += 1) {
        const previous = ring[index - 1];
        const current = ring[index];
        check(
          previous[0] !== current[0] || previous[1] !== current[1],
          `${feature.id}: polygon ring has consecutive duplicate coordinates`,
        );
      }
    }
  }
  return coordinateCount;
}

function validatePoint(point, featureId, bounds) {
  check(
    Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
    `${featureId}: coordinate is not a finite x/y pair`,
  );
  if (
    !Array.isArray(point) ||
    point.length !== 2 ||
    !point.every(Number.isFinite)
  )
    return 0;
  check(
    Math.abs(point[0] * 10 - Math.round(point[0] * 10)) < 1e-7,
    `${featureId}: x coordinate exceeds 0.1 m precision`,
  );
  check(
    Math.abs(point[1] * 10 - Math.round(point[1] * 10)) < 1e-7,
    `${featureId}: y coordinate exceeds 0.1 m precision`,
  );
  bounds.min[0] = Math.min(bounds.min[0], point[0]);
  bounds.min[1] = Math.min(bounds.min[1], point[1]);
  bounds.max[0] = Math.max(bounds.max[0], point[0]);
  bounds.max[1] = Math.max(bounds.max[1], point[1]);
  return 1;
}

function signedArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area +=
      ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

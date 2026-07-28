import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SCHEMA_VERSION = 1;
const IMPORTER_VERSION = 1;
const EARTH_RADIUS_METERS = 6_378_137;
const WORLD_METERS_PER_UNIT = 38;
const FAA_OWNER = "AeronauticalInformationServices_FAA";
const FAA_ATTRIBUTION =
  "Federal Aviation Administration, Air Traffic Organization, Mission Support Services, Aeronautical Information Services.";
const SERVICE_ROOT =
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services";
const ITEM_ROOT = "https://www.arcgis.com/sharing/rest/content/items";

const AIRPORTS = {
  KATL: {
    faaId: "ATL",
    icaoId: "KATL",
    name: "Hartsfield-Jackson Atlanta International",
    runtimeRunways: [
      ["08L/26R", "arrival"],
      ["08R/26L", "departure"],
      ["09L/27R", "arrival"],
      ["09R/27L", "departure"],
      ["10/28", "mixed"],
    ],
  },
  KORD: {
    faaId: "ORD",
    icaoId: "KORD",
    name: "Chicago O'Hare International",
    runtimeRunways: [
      ["09L/27R", "arrival"],
      ["09C/27C", "arrival"],
      ["09R/27L", "departure"],
      ["10L/28R", "departure"],
      ["10C/28C", "arrival"],
      ["10R/28L", "arrival"],
      ["04L/22R", "inactive"],
      ["04R/22L", "inactive"],
    ],
  },
};

const LAYERS = [
  {
    key: "runways",
    itemId: "bc80e5ca97804c2fbc0c10482377adf5",
    service: "AM_Runway",
    geometry: ["Polygon", "MultiPolygon"],
    properties: {
      DESIGNATOR: "designator",
      RWY_ID: "runwayId",
      SURFACE: "surfaceCode",
      RWY_OPER: "operationalCode",
    },
  },
  {
    key: "taxiways",
    itemId: "d1c02f9f3f7144af8ead3aca44961c59",
    service: "AM_Taxiway",
    geometry: ["Polygon", "MultiPolygon"],
    properties: {
      DESIGNATOR: "designator",
      SURFACE: "surfaceCode",
      TWY_OPER: "operationalCode",
    },
  },
  {
    key: "aprons",
    itemId: "e74412cf6a2345eb9974fa21b6faa225",
    service: "AM_Apron",
    geometry: ["Polygon", "MultiPolygon"],
    properties: {
      DESIGNATOR: "designator",
      SURFACE: "surfaceCode",
      APRON_OPER: "operationalCode",
    },
  },
  {
    key: "buildings",
    itemId: "7bca2c0cf31f43b89601433eda009312",
    service: "AM_Building",
    geometry: ["Polygon", "MultiPolygon"],
    properties: { DESIGNATOR: "designator" },
  },
  {
    key: "hotspots",
    itemId: "d1474c9456b9485f94cecce10a47944c",
    service: "AM_Hotspot",
    geometry: ["Polygon", "MultiPolygon"],
    properties: { HOT_ID: "hotspotId", CS_TEXT: "description" },
  },
  {
    key: "stopways",
    itemId: "b18e9298866749f4878ea1f42e5be98d",
    service: "AM_Stopway",
    geometry: ["Polygon", "MultiPolygon"],
    properties: {
      RWY_END: "runwayEnd",
      STP_TYPE: "stopwayType",
      SURFACE: "surfaceCode",
    },
  },
  {
    key: "beacons",
    itemId: "4b277ecb5aed4bcd808c95c67dc1a423",
    service: "AM_Beacon",
    geometry: ["Point"],
    properties: { BCN_TYPE: "beaconType", DESIGNATOR: "designator" },
  },
  {
    key: "windIndicators",
    itemId: "faf33e0cb5ed46fdafe09bdf455c48f2",
    service: "AM_Wind_Indicator",
    geometry: ["Point"],
    properties: { WIND_TYPE: "indicatorType", LIGHTING: "lighting" },
  },
];

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const airport = AIRPORTS[options.icaoId];
  if (!airport)
    throw new Error(
      `Unsupported airport ${options.icaoId}. Supported airports: ${Object.keys(AIRPORTS).join(", ")}`,
    );

  const fetched = [];
  for (const layer of LAYERS) {
    process.stdout.write(`Fetching ${layer.key}... `);
    const [item, service, collection, count] = await Promise.all([
      fetchJson(`${ITEM_ROOT}/${layer.itemId}?f=json`),
      fetchJson(`${SERVICE_ROOT}/${layer.service}/FeatureServer/0?f=json`),
      fetchFeatureCollection(layer, airport.icaoId),
      fetchFeatureCount(layer, airport.icaoId),
    ]);
    verifySource(layer, item, service, collection, count, airport);
    fetched.push({ layer, item, service, collection, count });
    process.stdout.write(`${count} features\n`);
  }

  const runwayCollection = fetched.find(
    (entry) => entry.layer.key === "runways",
  )?.collection;
  if (!runwayCollection)
    throw new Error(
      "Runway geometry is required to establish the local coordinate origin",
    );
  const origin = boundsCenter(geographicBounds(runwayCollection.features));
  const layers = {};
  const sources = [];
  for (const entry of fetched) {
    layers[entry.layer.key] = entry.collection.features
      .map((feature) => convertFeature(entry.layer, feature, origin))
      .sort((first, second) => first.sourceObjectId - second.sourceObjectId);
    sources.push(
      sourceMetadata(entry.layer, entry.item, entry.service, entry.count),
    );
  }

  const allFeatures = Object.values(layers).flat();
  const boundsMeters = localBounds(allFeatures);
  const effectiveWindows = sources
    .map((source) => source.effective)
    .filter(Boolean);
  const runtimeReference = deriveRuntimeReference(layers, airport);
  const asset = {
    schemaVersion: SCHEMA_VERSION,
    importerVersion: IMPORTER_VERSION,
    airport: {
      faaId: airport.faaId,
      icaoId: airport.icaoId,
      name: airport.name,
      fidelity: "faa-airport-mapping",
      navigationUse: false,
    },
    retrievedOn: options.retrievedOn,
    effective: commonEffectiveWindow(effectiveWindows),
    coordinateSystem: {
      source: "EPSG:4326",
      local: "local-tangent-plane",
      originWgs84: roundPoint(origin, 7),
      axes: { x: "east", y: "north" },
      unit: "meter",
      earthRadiusMeters: EARTH_RADIUS_METERS,
      coordinatePrecisionMeters: 0.1,
    },
    boundsMeters,
    runtimeReference,
    sources,
    layers,
  };

  const serializedAsset = `${JSON.stringify(asset)}\n`;
  const checksum = createHash("sha256").update(serializedAsset).digest("hex");
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    airport: asset.airport,
    assetPath: `data/airports/${airport.icaoId}.vector.json`,
    assetSha256: checksum,
    retrievedOn: asset.retrievedOn,
    effective: asset.effective,
    coordinateSystem: asset.coordinateSystem,
    boundsMeters: asset.boundsMeters,
    runtimeReference: asset.runtimeReference,
    attribution: FAA_ATTRIBUTION,
    layerCounts: Object.fromEntries(
      Object.entries(layers).map(([key, features]) => [key, features.length]),
    ),
    sources: sources.map(
      ({
        layer,
        itemId,
        title,
        owner,
        modifiedAt,
        effective,
        sourceUrl,
        license,
        attribution,
      }) => ({
        layer,
        itemId,
        title,
        owner,
        modifiedAt,
        effective,
        sourceUrl,
        license,
        attribution,
      }),
    ),
  };

  await mkdir(path.dirname(options.output), { recursive: true });
  await mkdir(path.dirname(options.manifest), { recursive: true });
  await writeFile(options.output, serializedAsset, "utf8");
  await writeFile(
    options.manifest,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `Wrote ${path.relative(process.cwd(), options.output)} (${Buffer.byteLength(serializedAsset).toLocaleString()} bytes)\n`,
  );
  process.stdout.write(
    `Wrote ${path.relative(process.cwd(), options.manifest)} (sha256 ${checksum})\n`,
  );
}

function parseArguments(arguments_) {
  let icaoId = "KORD";
  let output;
  let manifest;
  let retrievedOn = new Date().toISOString().slice(0, 10);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument.startsWith("--")) {
      icaoId = argument.toUpperCase();
      continue;
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${argument}`);
    if (argument === "--output") output = value;
    else if (argument === "--manifest") manifest = value;
    else if (argument === "--retrieved-on") retrievedOn = value;
    else throw new Error(`Unknown option ${argument}`);
    index += 1;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(retrievedOn) ||
    Number.isNaN(Date.parse(`${retrievedOn}T00:00:00Z`))
  ) {
    throw new Error(
      `Invalid --retrieved-on value ${retrievedOn}; expected YYYY-MM-DD`,
    );
  }
  return {
    icaoId,
    output: path.resolve(
      output ?? `public/data/airports/${icaoId}.vector.json`,
    ),
    manifest: path.resolve(
      manifest ?? `src/data/airports/${icaoId}.manifest.json`,
    ),
    retrievedOn,
  };
}

async function fetchFeatureCollection(layer, icaoId) {
  const features = [];
  const pageSize = 1_000;
  let offset = 0;
  while (true) {
    const parameters = new URLSearchParams({
      where: `ICAO_ID='${icaoId}'`,
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
      orderByFields: "OBJECTID",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: "geojson",
    });
    const page = await fetchJson(
      `${SERVICE_ROOT}/${layer.service}/FeatureServer/0/query?${parameters}`,
    );
    if (page.type !== "FeatureCollection" || !Array.isArray(page.features))
      throw new Error(`${layer.key}: service did not return GeoJSON`);
    features.push(...page.features);
    if (page.features.length < pageSize) break;
    offset += page.features.length;
  }
  return { type: "FeatureCollection", features };
}

async function fetchFeatureCount(layer, icaoId) {
  const parameters = new URLSearchParams({
    where: `ICAO_ID='${icaoId}'`,
    returnCountOnly: "true",
    f: "json",
  });
  const response = await fetchJson(
    `${SERVICE_ROOT}/${layer.service}/FeatureServer/0/query?${parameters}`,
  );
  if (!Number.isInteger(response.count))
    throw new Error(
      `${layer.key}: service did not return an integer feature count`,
    );
  return response.count;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText} from ${url}`);
  const data = await response.json();
  if (data?.error)
    throw new Error(
      `${url}: ${data.error.message ?? JSON.stringify(data.error)}`,
    );
  return data;
}

function verifySource(layer, item, service, collection, count, airport) {
  if (item.id !== layer.itemId || item.owner !== FAA_OWNER)
    throw new Error(`${layer.key}: unexpected ArcGIS item owner or identifier`);
  if (!stripHtml(item.licenseInfo).toLowerCase().includes("public use"))
    throw new Error(`${layer.key}: FAA public-use statement is missing`);
  if (
    service.geometryType &&
    !String(service.geometryType)
      .toLowerCase()
      .includes(layer.geometry[0].toLowerCase().replace("multi", ""))
  ) {
    throw new Error(
      `${layer.key}: unexpected service geometry ${service.geometryType}`,
    );
  }
  if (collection.features.length !== count)
    throw new Error(
      `${layer.key}: fetched ${collection.features.length} of ${count} features`,
    );
  if (count === 0)
    throw new Error(`${layer.key}: no ${airport.icaoId} features found`);
  for (const feature of collection.features) {
    if (
      feature.properties?.FAA_ID !== airport.faaId ||
      feature.properties?.ICAO_ID !== airport.icaoId
    ) {
      throw new Error(
        `${layer.key}: feature does not belong to ${airport.icaoId}`,
      );
    }
    if (!layer.geometry.includes(feature.geometry?.type))
      throw new Error(
        `${layer.key}: unexpected geometry ${feature.geometry?.type}`,
      );
    if (!Number.isInteger(feature.properties?.OBJECTID))
      throw new Error(`${layer.key}: feature is missing OBJECTID`);
  }
}

function sourceMetadata(layer, item, service, count) {
  return {
    layer: layer.key,
    itemId: item.id,
    title: item.title,
    owner: item.owner,
    modifiedAt: new Date(item.modified).toISOString(),
    effective: parseEffectiveWindow(stripHtml(item.description)),
    sourceUrl: `${SERVICE_ROOT}/${layer.service}/FeatureServer/0`,
    itemUrl: `${ITEM_ROOT}/${item.id}`,
    coordinateSystem:
      service.extent?.spatialReference?.latestWkid === 4326 ||
      service.extent?.spatialReference?.wkid === 4326
        ? "EPSG:4326"
        : String(
            service.extent?.spatialReference?.latestWkid ??
              service.extent?.spatialReference?.wkid ??
              "unknown",
          ),
    license: stripHtml(item.licenseInfo),
    attribution: stripHtml(item.accessInformation) || FAA_ATTRIBUTION,
    featureCount: count,
  };
}

function convertFeature(layer, feature, origin) {
  const properties = { sourceObjectId: feature.properties.OBJECTID };
  for (const [source, target] of Object.entries(layer.properties)) {
    const value = feature.properties[source];
    if (value !== null && value !== undefined && value !== "")
      properties[target] = value;
  }
  return {
    id: `${layer.key}:${feature.properties.OBJECTID}`,
    sourceObjectId: feature.properties.OBJECTID,
    properties,
    geometry: projectGeometry(feature.geometry, origin),
  };
}

function projectGeometry(geometry, origin) {
  if (geometry.type === "Point")
    return {
      type: "Point",
      coordinates: projectPoint(geometry.coordinates, origin),
    };
  if (geometry.type === "Polygon")
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) =>
        projectRing(ring, origin),
      ),
    };
  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => projectRing(ring, origin)),
      ),
    };
  }
  throw new Error(`Unsupported geometry ${geometry.type}`);
}

function projectRing(ring, origin) {
  const projected = [];
  for (const point of ring) {
    const next = projectPoint(point, origin);
    const previous = projected.at(-1);
    if (!previous || previous[0] !== next[0] || previous[1] !== next[1])
      projected.push(next);
  }
  if (
    projected.length &&
    (projected[0][0] !== projected.at(-1)[0] ||
      projected[0][1] !== projected.at(-1)[1])
  ) {
    projected.push([...projected[0]]);
  }
  return projected;
}

function projectPoint(
  [longitude, latitude],
  [originLongitude, originLatitude],
) {
  const radians = Math.PI / 180;
  const x =
    EARTH_RADIUS_METERS *
    (longitude - originLongitude) *
    radians *
    Math.cos(originLatitude * radians);
  const y = EARTH_RADIUS_METERS * (latitude - originLatitude) * radians;
  return roundPoint([x, y], 1);
}

function geographicBounds(features) {
  const bounds = { min: [Infinity, Infinity], max: [-Infinity, -Infinity] };
  for (const feature of features)
    visitCoordinates(feature.geometry.coordinates, (point) =>
      includePoint(bounds, point),
    );
  if (!bounds.min.every(Number.isFinite) || !bounds.max.every(Number.isFinite))
    throw new Error("Could not determine geographic bounds");
  return bounds;
}

function localBounds(features) {
  const bounds = { min: [Infinity, Infinity], max: [-Infinity, -Infinity] };
  for (const feature of features)
    visitCoordinates(feature.geometry.coordinates, (point) =>
      includePoint(bounds, point),
    );
  return { min: roundPoint(bounds.min, 1), max: roundPoint(bounds.max, 1) };
}

function visitCoordinates(coordinates, visitor) {
  if (
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    coordinates.every(Number.isFinite)
  ) {
    visitor(coordinates);
    return;
  }
  if (!Array.isArray(coordinates))
    throw new Error("Invalid geometry coordinates");
  for (const child of coordinates) visitCoordinates(child, visitor);
}

function includePoint(bounds, [x, y]) {
  bounds.min[0] = Math.min(bounds.min[0], x);
  bounds.min[1] = Math.min(bounds.min[1], y);
  bounds.max[0] = Math.max(bounds.max[0], x);
  bounds.max[1] = Math.max(bounds.max[1], y);
}

function boundsCenter(bounds) {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
  ];
}

function roundPoint(point, decimalPlaces) {
  const scale = 10 ** decimalPlaces;
  return point.map((value) => Math.round(value * scale) / scale);
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEffectiveWindow(text) {
  const match = text.match(
    /Current Effective Date:\s*(\d{4}Z\s+\d{2}\s+\w{3}\s+\d{4})\s+to\s+(\d{4}Z\s+\d{2}\s+\w{3}\s+\d{4})/i,
  );
  return match ? { from: match[1], to: match[2] } : null;
}

function commonEffectiveWindow(windows) {
  if (!windows.length) return null;
  const first = JSON.stringify(windows[0]);
  return windows.every((window) => JSON.stringify(window) === first)
    ? windows[0]
    : null;
}

function deriveRuntimeReference(layers, airport) {
  const runwayOrder = airport.runtimeRunways.map(([runwayId]) => runwayId);
  const roles = new Map(airport.runtimeRunways);
  const runwayByName = new Map(
    layers.runways.map((feature) => [feature.properties.runwayId, feature]),
  );
  const runways = runwayOrder.map((runwayId) => {
    const feature = runwayByName.get(runwayId);
    if (!feature)
      throw new Error(`Runtime reference is missing runway ${runwayId}`);
    const bounds = principalBounds(geometryPoints(feature.geometry));
    return {
      runwayId,
      designation: runwayId.split("/"),
      role: roles.get(runwayId),
      center: roundPoint(
        bounds.center.map((value) => value / WORLD_METERS_PER_UNIT),
        4,
      ),
      heading: round(bounds.heading, 7),
      length: round(bounds.length / WORLD_METERS_PER_UNIT, 4),
      width: round(
        Math.max(2.4, bounds.width / WORLD_METERS_PER_UNIT),
        4,
      ),
      sourceLengthMeters: round(bounds.length, 1),
      sourceWidthMeters: round(bounds.width, 1),
    };
  });
  const building = layers.buildings
    .map((feature) => ({
      feature,
      centroid: featureCentroid(feature.geometry),
    }))
    .sort((first, second) => second.centroid.area - first.centroid.area)[0];
  if (!building)
    throw new Error("Runtime reference requires at least one building");
  const towerCandidates = layers.buildings
    .filter((feature) => feature.properties.designator === "TWR")
    .map((feature) => ({
      feature,
      centroid: featureCentroid(feature.geometry),
    }))
    .sort(
      (first, second) =>
        distance2d(first.centroid, building.centroid) -
        distance2d(second.centroid, building.centroid),
    );
  const primaryTower = towerCandidates[0];
  const obstacles = layers.buildings.flatMap((feature) => {
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    return polygons.map((polygon, polygonIndex) => {
      const centroid = ringCentroid(polygon[0]);
      const kind =
        feature.id === building.feature.id
          ? "terminal"
          : feature.id === primaryTower?.feature.id
            ? "control-tower"
            : "building";
      return {
        id: `FAA-${feature.id}${polygons.length > 1 ? `-${polygonIndex + 1}` : ""}`,
        kind,
        label:
          kind === "terminal"
            ? `${airport.faaId} terminal complex`
            : kind === "control-tower"
              ? `${airport.faaId} control tower`
              : feature.properties.designator || "Airport building",
        shape: "polygon",
        center: roundPoint(
          [centroid.x / WORLD_METERS_PER_UNIT, centroid.y / WORLD_METERS_PER_UNIT],
          4,
        ),
        points: polygon[0].map((point) =>
          roundPoint(
            point.map((value) => value / WORLD_METERS_PER_UNIT),
            4,
          ),
        ),
        minimumAltitude: 1.7,
        maximumAltitude: kind === "control-tower" ? 16.4 : 7.8,
        clearance: 0.12,
      };
    });
  });
  const aprons = layers.aprons.flatMap((feature) => {
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    return polygons.map((polygon, polygonIndex) => ({
      id: `FAA-${feature.id}${polygons.length > 1 ? `-${polygonIndex + 1}` : ""}`,
      designator: feature.properties.designator ?? null,
      rings: polygon.map((ring) =>
        ring.map((point) =>
          roundPoint(
            point.map((value) => value / WORLD_METERS_PER_UNIT),
            4,
          ),
        ),
      ),
    }));
  });
  return {
    worldMetersPerUnit: WORLD_METERS_PER_UNIT,
    terminal: roundPoint(
      [
        building.centroid.x / WORLD_METERS_PER_UNIT,
        building.centroid.y / WORLD_METERS_PER_UNIT,
      ],
      4,
    ),
    controlTower: primaryTower
      ? roundPoint(
          [
            primaryTower.centroid.x / WORLD_METERS_PER_UNIT,
            primaryTower.centroid.y / WORLD_METERS_PER_UNIT,
          ],
          4,
        )
      : null,
    runways,
    aprons,
    obstacles,
  };
}

function geometryPoints(geometry) {
  const points = [];
  visitCoordinates(geometry.coordinates, (point) => points.push(point));
  return points;
}

function principalBounds(points) {
  const mean = points
    .reduce(
      (sum, point) => [sum[0] + point[0], sum[1] + point[1]],
      [0, 0],
    )
    .map((value) => value / points.length);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of points) {
    const x = point[0] - mean[0];
    const y = point[1] - mean[1];
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }
  let heading = 0.5 * Math.atan2(2 * xy, xx - yy);
  if (Math.cos(heading) < 0) heading += Math.PI;
  const direction = [Math.cos(heading), Math.sin(heading)];
  const normal = [-direction[1], direction[0]];
  const along = points.map(
    (point) => point[0] * direction[0] + point[1] * direction[1],
  );
  const across = points.map(
    (point) => point[0] * normal[0] + point[1] * normal[1],
  );
  const alongMidpoint = (Math.min(...along) + Math.max(...along)) / 2;
  const acrossMidpoint = (Math.min(...across) + Math.max(...across)) / 2;
  return {
    center: [
      direction[0] * alongMidpoint + normal[0] * acrossMidpoint,
      direction[1] * alongMidpoint + normal[1] * acrossMidpoint,
    ],
    heading,
    length: Math.max(...along) - Math.min(...along),
    width: Math.max(...across) - Math.min(...across),
  };
}

function featureCentroid(geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let weightedX = 0;
  let weightedY = 0;
  let totalArea = 0;
  for (const polygon of polygons) {
    const ring = polygon[0];
    let signedArea = 0;
    let x = 0;
    let y = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const cross =
        ring[index][0] * ring[index + 1][1] -
        ring[index + 1][0] * ring[index][1];
      signedArea += cross;
      x += (ring[index][0] + ring[index + 1][0]) * cross;
      y += (ring[index][1] + ring[index + 1][1]) * cross;
    }
    signedArea /= 2;
    const area = Math.abs(signedArea);
    if (area <= 1e-6) continue;
    weightedX += (x / (6 * signedArea)) * area;
    weightedY += (y / (6 * signedArea)) * area;
    totalArea += area;
  }
  return {
    x: weightedX / totalArea,
    y: weightedY / totalArea,
    area: totalArea,
  };
}

function ringCentroid(ring) {
  let signedArea = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const cross =
      ring[index][0] * ring[index + 1][1] -
      ring[index + 1][0] * ring[index][1];
    signedArea += cross;
    x += (ring[index][0] + ring[index + 1][0]) * cross;
    y += (ring[index][1] + ring[index + 1][1]) * cross;
  }
  signedArea /= 2;
  if (Math.abs(signedArea) <= 1e-6)
    return {
      x: ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
      y: ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
    };
  return { x: x / (6 * signedArea), y: y / (6 * signedArea) };
}

function distance2d(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function round(value, decimalPlaces) {
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});

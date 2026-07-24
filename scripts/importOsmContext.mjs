import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 1;
const OSM_LICENSE = 'Open Data Commons Open Database License 1.0';
const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const DEFAULT_RADIUS_X_METERS = 12_000;
const DEFAULT_RADIUS_Y_METERS = 10_000;
const ROAD_CLASSES = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link',
  'primary', 'primary_link', 'secondary', 'secondary_link',
]);
const AREA_CLASSES = new Set(['industrial', 'commercial', 'retail', 'railway', 'cemetery']);
const LEISURE_CLASSES = new Set(['park', 'golf_course']);

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const faaManifestText = await readFile(options.faaManifest, 'utf8');
  const faaManifest = JSON.parse(faaManifestText);
  if (faaManifest.airport?.icaoId !== options.icaoId) {
    throw new Error(`FAA manifest is for ${faaManifest.airport?.icaoId}, not ${options.icaoId}`);
  }
  const bounds = contextBounds(faaManifest.coordinateSystem, options.radiusX, options.radiusY);
  const queries = buildQueries(bounds);
  process.stdout.write(`Fetching ${options.icaoId} roads, rail, water, land use, and boundary from OpenStreetMap... `);
  const queryList = Object.values(queries);
  const responses = options.input
    ? JSON.parse(await readFile(options.input, 'utf8')).responses
    : await fetchOverpassQueries(options.endpoint, queryList);
  if (!Array.isArray(responses) || responses.length !== queryList.length) {
    throw new Error(`Context input must contain ${queryList.length} Overpass responses`);
  }
  if (options.rawOutput) {
    await writeGenerated(options.rawOutput, `${JSON.stringify({ responses })}\n`);
  }
  const elements = new Map();
  for (const element of responses.flatMap((item) => item.elements ?? [])) {
    elements.set(`${element.type}/${element.id}`, element);
  }
  const response = {
    elements: [...elements.values()],
    osm3s: { timestamp_osm_base: responses.map((item) => item.osm3s?.timestamp_osm_base).filter(Boolean).sort().at(-1) ?? null },
  };
  process.stdout.write(`${response.elements?.length ?? 0} source elements\n`);
  const context = normalizeContext(response, faaManifest, bounds, queries, options);
  const serialized = `${JSON.stringify(context)}\n`;
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    airport: faaManifest.airport,
    assetPath: `data/airports/${options.icaoId}.context.json`,
    assetSha256: sha256(serialized),
    retrievedOn: options.retrievedOn,
    coordinateSystem: faaManifest.coordinateSystem,
    boundsMeters: context.boundsMeters,
    source: context.source,
    counts: {
      roads: context.roads.length,
      roadPoints: context.roads.reduce((sum, road) => sum + road.points.length, 0),
      rails: context.rails.length,
      railPoints: context.rails.reduce((sum, rail) => sum + rail.points.length, 0),
      waterways: context.waterways.length,
      waterwayPoints: context.waterways.reduce((sum, waterway) => sum + waterway.points.length, 0),
      areas: context.areas.length,
      areaPoints: context.areas.reduce((sum, area) => sum + area.rings.reduce((ringSum, ring) => ringSum + ring.length, 0), 0),
      boundaryRings: context.airportBoundary.rings.length,
      boundaryPoints: context.airportBoundary.rings.reduce((sum, ring) => sum + ring.length, 0),
    },
    license: OSM_LICENSE,
    attribution: OSM_ATTRIBUTION,
    copyrightUrl: OSM_COPYRIGHT_URL,
  };
  await Promise.all([
    writeGenerated(options.output, serialized),
    writeGenerated(options.manifest, `${JSON.stringify(manifest, null, 2)}\n`),
  ]);
  process.stdout.write(
    `Wrote ${path.relative(process.cwd(), options.output)} (${Buffer.byteLength(serialized).toLocaleString()} bytes; ${context.roads.length} roads, ${context.rails.length} rails, ${context.areas.length} areas)\n`,
  );
}

function parseArguments(arguments_) {
  let icaoId = 'KORD';
  let output;
  let manifest;
  let faaManifest;
  let input;
  let rawOutput;
  let endpoint = DEFAULT_ENDPOINT;
  let retrievedOn = new Date().toISOString().slice(0, 10);
  let radiusX = DEFAULT_RADIUS_X_METERS;
  let radiusY = DEFAULT_RADIUS_Y_METERS;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument.startsWith('--')) {
      icaoId = argument.toUpperCase();
      continue;
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    if (argument === '--output') output = value;
    else if (argument === '--manifest') manifest = value;
    else if (argument === '--faa-manifest') faaManifest = value;
    else if (argument === '--input') input = value;
    else if (argument === '--raw-output') rawOutput = value;
    else if (argument === '--endpoint') endpoint = value;
    else if (argument === '--retrieved-on') retrievedOn = value;
    else if (argument === '--radius-x-km') radiusX = Number(value) * 1_000;
    else if (argument === '--radius-y-km') radiusY = Number(value) * 1_000;
    else throw new Error(`Unknown option ${argument}`);
    index += 1;
  }
  if (!/^KORD$/.test(icaoId)) throw new Error('Only KORD is currently configured');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(retrievedOn)) throw new Error('--retrieved-on must use YYYY-MM-DD');
  if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY) || radiusX < 5_000 || radiusY < 5_000) {
    throw new Error('Context radii must be finite and at least 5 km');
  }
  return {
    icaoId,
    output: path.resolve(output ?? `public/data/airports/${icaoId}.context.json`),
    manifest: path.resolve(manifest ?? `src/data/airports/${icaoId}.context.manifest.json`),
    faaManifest: path.resolve(faaManifest ?? `src/data/airports/${icaoId}.manifest.json`),
    input: input ? path.resolve(input) : null,
    rawOutput: rawOutput ? path.resolve(rawOutput) : null,
    endpoint,
    retrievedOn,
    radiusX,
    radiusY,
  };
}

function contextBounds(coordinateSystem, radiusX, radiusY) {
  const [originLongitude, originLatitude] = coordinateSystem.originWgs84;
  const degrees = 180 / Math.PI;
  const latitudeDelta = radiusY / coordinateSystem.earthRadiusMeters * degrees;
  const longitudeDelta = radiusX / (coordinateSystem.earthRadiusMeters * Math.cos(originLatitude * Math.PI / 180)) * degrees;
  return {
    south: originLatitude - latitudeDelta,
    west: originLongitude - longitudeDelta,
    north: originLatitude + latitudeDelta,
    east: originLongitude + longitudeDelta,
  };
}

function buildQueries(bounds) {
  const bbox = [bounds.south, bounds.west, bounds.north, bounds.east].map((value) => value.toFixed(7)).join(',');
  return {
    roads: `[out:json][timeout:180];(`
      + `way(${bbox})["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link)$"];`
      + `way(${bbox})["highway"="secondary"]["name"];`
      + `way(${bbox})["highway"="secondary"]["ref"];`
      + ');out tags geom;',
    transport: `[out:json][timeout:180];(`
      + `way(${bbox})["railway"~"^(rail|light_rail)$"];`
      + `way(${bbox})["waterway"~"^(river|canal)$"];`
      + `nwr(${bbox})["aeroway"="aerodrome"]["icao"="KORD"];`
      + ');out body geom;',
    areas: `[out:json][timeout:180];(`
      + `nwr(${bbox})["landuse"~"^(industrial|commercial|retail|railway|cemetery)$"];`
      + `nwr(${bbox})["leisure"~"^(park|golf_course)$"];`
      + `nwr(${bbox})["natural"="water"];`
      + ');out body geom;',
  };
}

async function fetchOverpass(endpoint, query) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Airport-Auto context importer (https://github.com/zippity-doo-da/airport-auto)',
      },
      body: new URLSearchParams({ data: query }),
    });
    if (response.ok) return response.json();
    if (![429, 502, 503, 504].includes(response.status) || attempt === 4) {
      throw new Error(`Overpass request failed: ${response.status} ${response.statusText}`);
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    const delayMilliseconds = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(30_000, retryAfter * 1_000)
      : attempt * 4_000;
    process.stdout.write(` retry ${response.status} in ${Math.round(delayMilliseconds / 1_000)}s`);
    await new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
  }
  throw new Error('Overpass retry loop ended unexpectedly');
}

async function fetchOverpassQueries(endpoint, queries) {
  const responses = [];
  for (let index = 0; index < queries.length; index += 1) {
    // Public Overpass instances ask bulk clients to leave breathing room
    // between independent requests. These are one-time build inputs, not a
    // runtime dependency, so a short delay is preferable to burst retries.
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 3_000));
    process.stdout.write(`${index ? ', ' : ''}${index + 1}/${queries.length}`);
    responses.push(await fetchOverpass(endpoint, queries[index]));
  }
  process.stdout.write(' · ');
  return responses;
}

function normalizeContext(response, faaManifest, bounds, queries, options) {
  const coordinateSystem = faaManifest.coordinateSystem;
  const roads = [];
  const rails = [];
  const waterways = [];
  const areas = [];
  const boundaryCandidates = [];
  for (const element of response.elements ?? []) {
    const tags = element.tags ?? {};
    if (element.type !== 'way' && element.type !== 'relation') continue;
    if (tags.aeroway === 'aerodrome' && tags.icao === 'KORD') {
      for (const rings of polygonSets(element, coordinateSystem, 8)) {
        const area = Math.abs(polygonArea(rings[0]));
        if (area > 100_000) boundaryCandidates.push({ sourceId: `${element.type}/${element.id}`, rings, area });
      }
      continue;
    }
    if (element.type === 'way' && ROAD_CLASSES.has(tags.highway)) {
      const points = simplifiedWay(element, coordinateSystem, roadTolerance(tags.highway));
      if (points.length < 2 || lineLength(points) < 40) continue;
      if ((tags.highway === 'secondary' || tags.highway === 'secondary_link') && !tags.name && !tags.ref && lineLength(points) < 300) continue;
      roads.push({
        id: `OSM-W${element.id}`,
        class: tags.highway,
        name: cleanTag(tags.name),
        ref: cleanTag(tags.ref),
        widthMeters: roadWidth(tags),
        bridge: truthyTag(tags.bridge),
        tunnel: truthyTag(tags.tunnel),
        layer: parseLayer(tags.layer),
        points,
      });
      continue;
    }
    if (element.type === 'way' && (tags.railway === 'rail' || tags.railway === 'light_rail')) {
      const points = simplifiedWay(element, coordinateSystem, 14);
      if (points.length >= 2 && lineLength(points) >= 50) {
        rails.push({ id: `OSM-W${element.id}`, class: tags.railway, name: cleanTag(tags.name), bridge: truthyTag(tags.bridge), tunnel: truthyTag(tags.tunnel), points });
      }
      continue;
    }
    if (element.type === 'way' && (tags.waterway === 'river' || tags.waterway === 'canal')) {
      const points = simplifiedWay(element, coordinateSystem, 18);
      if (points.length >= 2 && lineLength(points) >= 80) {
        waterways.push({ id: `OSM-W${element.id}`, class: tags.waterway, name: cleanTag(tags.name), widthMeters: waterwayWidth(tags), points });
      }
      continue;
    }
    const areaClass = contextAreaClass(tags);
    if (!areaClass) continue;
    for (const rings of polygonSets(element, coordinateSystem, 18)) {
      const area = Math.abs(polygonArea(rings[0]));
      const minimumArea = areaClass === 'water' ? 3_000 : areaClass === 'park' || areaClass === 'golf_course' ? 12_000 : 8_000;
      if (area < minimumArea) continue;
      areas.push({ id: `OSM-${element.type === 'relation' ? 'R' : 'W'}${element.id}-${areas.length}`, class: areaClass, name: cleanTag(tags.name), rings, areaSquareMeters: Math.round(area) });
    }
  }
  const airportBoundary = boundaryCandidates.sort((first, second) => second.area - first.area)[0];
  if (!airportBoundary) throw new Error('No usable KORD aerodrome boundary was returned by OpenStreetMap');
  roads.sort((first, second) => first.id.localeCompare(second.id));
  rails.sort((first, second) => first.id.localeCompare(second.id));
  waterways.sort((first, second) => first.id.localeCompare(second.id));
  areas.sort((first, second) => first.id.localeCompare(second.id));
  return {
    schemaVersion: SCHEMA_VERSION,
    airport: faaManifest.airport,
    retrievedOn: options.retrievedOn,
    coordinateSystem,
    boundsMeters: {
      min: projectPoint({ lon: bounds.west, lat: bounds.south }, coordinateSystem),
      max: projectPoint({ lon: bounds.east, lat: bounds.north }, coordinateSystem),
    },
    source: {
      provider: 'OpenStreetMap',
      endpoint: options.endpoint,
      queries,
      osmBaseTimestamp: response.osm3s?.timestamp_osm_base ?? null,
      license: OSM_LICENSE,
      attribution: OSM_ATTRIBUTION,
      copyrightUrl: OSM_COPYRIGHT_URL,
    },
    airportBoundary: { sourceId: airportBoundary.sourceId, rings: airportBoundary.rings },
    roads,
    rails,
    waterways,
    areas,
  };
}

function simplifiedWay(element, coordinateSystem, tolerance) {
  const points = (element.geometry ?? [])
    .filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat))
    .map((point) => projectPoint(point, coordinateSystem));
  return roundPoints(douglasPeucker(points, tolerance));
}

function polygonSets(element, coordinateSystem, tolerance) {
  if (element.type === 'way') {
    const ring = closedRing((element.geometry ?? []).map((point) => projectPoint(point, coordinateSystem)), tolerance);
    return ring ? [[ring]] : [];
  }
  const members = (element.members ?? []).filter((member) => member.type === 'way' && Array.isArray(member.geometry));
  const outerRings = stitchRings(members.filter((member) => member.role !== 'inner').map((member) => member.geometry), coordinateSystem, tolerance);
  const innerRings = stitchRings(members.filter((member) => member.role === 'inner').map((member) => member.geometry), coordinateSystem, tolerance);
  return outerRings.map((outer) => [outer, ...innerRings.filter((inner) => pointInRing(inner[0], outer))]);
}

function stitchRings(geometries, coordinateSystem, tolerance) {
  const pending = geometries
    .map((geometry) => geometry.map((point) => projectPoint(point, coordinateSystem)))
    .filter((points) => points.length >= 2);
  const rings = [];
  while (pending.length) {
    let chain = pending.shift();
    let joined = true;
    while (joined && !samePoint(chain[0], chain.at(-1), 1)) {
      joined = false;
      for (let index = 0; index < pending.length; index += 1) {
        const candidate = pending[index];
        if (samePoint(chain.at(-1), candidate[0], 1)) chain = [...chain, ...candidate.slice(1)];
        else if (samePoint(chain.at(-1), candidate.at(-1), 1)) chain = [...chain, ...candidate.slice(0, -1).reverse()];
        else if (samePoint(chain[0], candidate.at(-1), 1)) chain = [...candidate.slice(0, -1), ...chain];
        else if (samePoint(chain[0], candidate[0], 1)) chain = [...candidate.slice(1).reverse(), ...chain];
        else continue;
        pending.splice(index, 1);
        joined = true;
        break;
      }
    }
    const ring = closedRing(chain, tolerance);
    if (ring) rings.push(ring);
  }
  return rings;
}

function closedRing(points, tolerance) {
  if (points.length < 4 || !samePoint(points[0], points.at(-1), 2)) return null;
  const open = points.slice(0, -1);
  const simplified = douglasPeucker([...open, open[0]], tolerance);
  if (simplified.length < 4) return null;
  const ring = roundPoints(simplified);
  if (!samePoint(ring[0], ring.at(-1), 0.01)) ring.push([...ring[0]]);
  return ring.length >= 4 ? ring : null;
}

function contextAreaClass(tags) {
  if (tags.natural === 'water') return 'water';
  if (LEISURE_CLASSES.has(tags.leisure)) return tags.leisure === 'golf_course' ? 'golf_course' : 'park';
  if (AREA_CLASSES.has(tags.landuse)) return tags.landuse;
  return null;
}

function roadTolerance(roadClass) {
  if (roadClass.startsWith('motorway')) return 10;
  if (roadClass.startsWith('trunk')) return 12;
  if (roadClass.startsWith('primary')) return 15;
  return 24;
}

function roadWidth(tags) {
  const defaults = {
    motorway: 25, motorway_link: 10, trunk: 20, trunk_link: 9,
    primary: 14, primary_link: 8, secondary: 10, secondary_link: 7,
  };
  const explicit = parsePositiveNumber(tags.width);
  const lanes = parsePositiveNumber(tags.lanes);
  return round(Math.max(5, Math.min(32, explicit ?? (lanes ? lanes * 3.3 : defaults[tags.highway] ?? 9))), 1);
}

function waterwayWidth(tags) {
  const explicit = parsePositiveNumber(tags.width);
  return round(Math.max(5, Math.min(80, explicit ?? (tags.waterway === 'river' ? 18 : 8))), 1);
}

function parseLayer(value) {
  const layer = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(layer) ? Math.max(-5, Math.min(5, layer)) : 0;
}

function truthyTag(value) {
  return value !== undefined && value !== null && !['', 'no', 'false', '0'].includes(String(value).toLowerCase());
}

function projectPoint(point, coordinateSystem) {
  const [originLongitude, originLatitude] = coordinateSystem.originWgs84;
  const radians = Math.PI / 180;
  return [
    (point.lon - originLongitude) * radians * coordinateSystem.earthRadiusMeters * Math.cos(originLatitude * radians),
    (point.lat - originLatitude) * radians * coordinateSystem.earthRadiusMeters,
  ];
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return [...points];
  let maximum = -1;
  let split = -1;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointSegmentDistance(points[index], points[0], points.at(-1));
    if (distance > maximum) {
      maximum = distance;
      split = index;
    }
  }
  if (maximum <= tolerance) return [points[0], points.at(-1)];
  return [
    ...douglasPeucker(points.slice(0, split + 1), tolerance).slice(0, -1),
    ...douglasPeucker(points.slice(split), tolerance),
  ];
}

function pointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared
    ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point[0] - start[0] - dx * amount, point[1] - start[1] - dy * amount);
}

function pointInRing(point, ring) {
  let inside = false;
  for (let first = 0, second = ring.length - 1; first < ring.length; second = first++) {
    const a = ring[first];
    const b = ring[second];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / ((b[1] - a[1]) || Number.EPSILON) + a[0]) inside = !inside;
  }
  return inside;
}

function polygonArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function lineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  return length;
}

function samePoint(first, second, tolerance) {
  return Boolean(first && second) && Math.hypot(first[0] - second[0], first[1] - second[1]) <= tolerance;
}

function roundPoints(points) {
  return points.map((point) => [round(point[0], 1), round(point[1], 1)]);
}

function cleanTag(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned || null;
}

function parsePositiveNumber(value) {
  const number = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function round(value, decimalPlaces) {
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function writeGenerated(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});

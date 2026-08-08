import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SCHEMA_VERSION = 3;
const WORLD_METERS_PER_UNIT = 38;
const OSM_LICENSE = "Open Data Commons Open Database License 1.0";
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
const DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter";
const MINIMUM_BUILDING_CLEARANCE_METERS = 51;
// OSM parking-position ways terminate at the nose-wheel stop. Aircraft in the
// simulation are positioned from their visual/collision center, so gate nodes
// must sit farther back on the sourced lead-in. This covers the largest ORD
// visual footprint plus the FAA-building buffer used by runtime collision
// checks without pretending that the nose-wheel stop itself is the center.
const MINIMUM_STAND_REFERENCE_CLEARANCE_METERS = 42;
const MINIMUM_STAND_REFERENCE_OFFSET_METERS = 24;
const STAND_LEAD_IN_WIDTH_WORLD = 0.7;
const graphNodeIndexes = new WeakMap();
const FACILITY_REFERENCES = Object.freeze({
  KORD: {
    airportCode: "ORD",
    provider: "Chicago Department of Aviation",
    url: "https://www.flychicago.com/business/CDA/factsfigures/Pages/facility.aspx",
    retrievedOn: "2026-07-24",
    totalPassengerGates: 199,
    gateReferencePattern: /^([BCEFGHKLM])\d/i,
    terminals: [
    {
      id: "T1",
      name: "Terminal 1",
      osmNamePattern: /^Terminal\s*1(?:\b|\s|-)/i,
      concourses: [
        { id: "B", publishedGateCount: 22 },
        { id: "C", publishedGateCount: 29 },
      ],
    },
    {
      id: "T2",
      name: "Terminal 2",
      osmNamePattern: /^Terminal\s*2(?:\b|\s|-)/i,
      concourses: [
        { id: "E", publishedGateCount: 16 },
        { id: "F", publishedGateCount: 27 },
      ],
    },
    {
      id: "T3",
      name: "Terminal 3",
      osmNamePattern: /^Terminal\s*3(?:\b|\s|-)/i,
      concourses: [
        { id: "G", publishedGateCount: 17 },
        { id: "H", publishedGateCount: 17 },
        { id: "K", publishedGateCount: 16 },
        { id: "L", publishedGateCount: 25, sections: ["main", "stinger"] },
      ],
    },
    {
      id: "T5",
      name: "Terminal 5",
      osmNamePattern: /^Terminal\s*5(?:\b|\s|-)/i,
      concourses: [{ id: "M", publishedGateCount: 30 }],
    },
    ],
  },
  KATL: {
    airportCode: "ATL",
    provider: "Hartsfield-Jackson Atlanta International Airport",
    url: "https://www.atl.com/maps-3/",
    retrievedOn: "2026-07-28",
    // The official terminal maps identify seven concourses. Gate totals are
    // deliberately not asserted here: the imported OSM gate/stand data is
    // authoritative for this simulation surface graph until a stable ATL
    // facility-gate source is added to the asset pipeline.
    totalPassengerGates: 0,
    gateReferencePattern: /^([TABCDEF])\d/i,
    terminals: [
      {
        id: "DOM",
        name: "Domestic Terminal",
        osmNamePattern: /^Domestic Terminal/i,
        concourses: [
          { id: "T", publishedGateCount: 0 },
          { id: "A", publishedGateCount: 0 },
          { id: "B", publishedGateCount: 0 },
          { id: "C", publishedGateCount: 0 },
          { id: "D", publishedGateCount: 0 },
        ],
      },
      {
        id: "INTL",
        name: "International Terminal",
        osmNamePattern: /^International Terminal/i,
        concourses: [
          { id: "E", publishedGateCount: 0 },
          { id: "F", publishedGateCount: 0 },
        ],
      },
    ],
  },
  KDFW: {
    airportCode: "DFW",
    provider: "Dallas Fort Worth International Airport",
    url: "https://www.dfwairport.com/business/about/facts/",
    retrievedOn: "2026-08-07",
    // The official airport fact page confirms the terminal complex, but its
    // published gate total changes with the ongoing terminal program. Preserve
    // OSM's individually mapped stand identities as the import authority until
    // a stable terminal-by-terminal public gate inventory is available.
    totalPassengerGates: 0,
    gateReferencePattern: /^([ABCDE])\d/i,
    terminals: [
      { id: "A", name: "Terminal A", osmNamePattern: /^Terminal\s*A(?:\b|\s|-)/i, concourses: [{ id: "A", publishedGateCount: 0 }] },
      { id: "B", name: "Terminal B", osmNamePattern: /^Terminal\s*B(?:\b|\s|-)/i, concourses: [{ id: "B", publishedGateCount: 0 }] },
      { id: "C", name: "Terminal C", osmNamePattern: /^Terminal\s*C(?:\b|\s|-)/i, concourses: [{ id: "C", publishedGateCount: 0 }] },
      { id: "D", name: "Terminal D", osmNamePattern: /^Terminal\s*D(?:\b|\s|-)/i, concourses: [{ id: "D", publishedGateCount: 0 }] },
      { id: "E", name: "Terminal E", osmNamePattern: /^Terminal\s*E(?:\b|\s|-)/i, concourses: [{ id: "E", publishedGateCount: 0 }] },
    ],
  },
});
let activeFacilityReference = FACILITY_REFERENCES.KORD;
let activeConcourseToTerminal = new Map();

function setActiveFacilityReference(icaoId) {
  const reference = FACILITY_REFERENCES[icaoId];
  if (!reference) throw new Error(`No passenger-facility profile exists for ${icaoId}`);
  activeFacilityReference = reference;
  activeConcourseToTerminal = new Map(
    reference.terminals.flatMap((terminal) =>
      terminal.concourses.map((concourse) => [concourse.id, terminal]),
    ),
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  setActiveFacilityReference(options.icaoId);
  const [faaText, faaManifestText] = await Promise.all([
    readFile(options.faaAsset, "utf8"),
    readFile(options.faaManifest, "utf8"),
  ]);
  const faa = JSON.parse(faaText);
  const faaManifest = JSON.parse(faaManifestText);
  if (faa.airport?.icaoId !== options.icaoId)
    throw new Error(`FAA asset is for ${faa.airport?.icaoId}, not ${options.icaoId}`);
  if (faaManifest.assetSha256 !== sha256(faaText))
    throw new Error("FAA asset checksum differs from its manifest");

  const query = buildQuery(faa, 1_000);
  let normalized;
  if (options.input) {
    const cached = JSON.parse(await readFile(options.input, "utf8"));
    for (const field of ["parkingPositions", "gates", "passengerFacilities", "passengerFacilityReference"])
      if (!Array.isArray(cached[field]) && field !== "passengerFacilityReference")
        throw new Error(`Cached surface asset is missing ${field}; run import:ord:refresh once`);
    if (!cached.passengerFacilityReference)
      throw new Error("Cached surface asset is missing passengerFacilityReference; run import:ord:refresh once");
    normalized = {
      nodes: cached.nodes,
      ways: cached.ways,
      parkingPositions: cached.parkingPositions,
      gates: cached.gates,
      passengerFacilities: cached.passengerFacilities,
      passengerFacilityReference: cached.passengerFacilityReference,
      source: cached.source,
    };
    process.stdout.write(`Rebuilding ${options.icaoId} from committed OSM source data... `);
  } else {
    process.stdout.write(`Fetching ${options.icaoId} aeroway centerlines from OpenStreetMap... `);
    const response = await fetchOverpass(options.endpoint, query);
    normalized = normalizeOverpass(response, faa, options, query);
  }
  process.stdout.write(`${normalized.ways.length} ways and ${normalized.nodes.length} nodes\n`);

  const graphBuild = buildSurfaceGraph(normalized, faa);
  const asset = {
    schemaVersion: SCHEMA_VERSION,
    airport: faa.airport,
    retrievedOn: options.retrievedOn,
    coordinateSystem: faa.coordinateSystem,
    boundsMeters: boundsForPoints(normalized.nodes.map((node) => node.positionMeters)),
    source: normalized.source,
    nodes: normalized.nodes,
    ways: normalized.ways,
    parkingPositions: normalized.parkingPositions,
    gates: normalized.gates,
    passengerFacilities: normalized.passengerFacilities,
    passengerFacilityReference: normalized.passengerFacilityReference,
    excludedWays: graphBuild.excludedWays,
    excludedSegments: graphBuild.excludedSegments,
    validationRules: {
      minimumBuildingClearanceMeters: MINIMUM_BUILDING_CLEARANCE_METERS,
      minimumStandReferenceClearanceMeters: MINIMUM_STAND_REFERENCE_CLEARANCE_METERS,
      minimumStandReferenceOffsetMeters: MINIMUM_STAND_REFERENCE_OFFSET_METERS,
      standLeadInWidthWorld: STAND_LEAD_IN_WIDTH_WORLD,
    },
  };
  const graph = graphBuild.graph;
  const serializedAsset = `${JSON.stringify(asset)}\n`;
  const serializedGraph = `${JSON.stringify(graph)}\n`;
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    airport: faa.airport,
    assetPath: `data/airports/${options.icaoId}.osm-surface.json`,
    graphPath: `src/data/airports/${options.icaoId}.surfaceGraph.json`,
    assetSha256: sha256(serializedAsset),
    graphSha256: sha256(serializedGraph),
    retrievedOn: options.retrievedOn,
    coordinateSystem: faa.coordinateSystem,
    source: normalized.source,
    passengerFacilityReference: {
      provider: normalized.passengerFacilityReference.provider,
      url: normalized.passengerFacilityReference.url,
      retrievedOn: normalized.passengerFacilityReference.retrievedOn,
      totalPassengerGates: normalized.passengerFacilityReference.totalPassengerGates,
    },
    validationRules: asset.validationRules,
    counts: {
      sourceNodes: normalized.nodes.length,
      sourceWays: normalized.ways.length,
      parkingPositions: normalized.parkingPositions.length,
      passengerParkingPositions: normalized.parkingPositions.filter((position) => position.concourse).length,
      gates: normalized.gates.length,
      passengerFacilities: normalized.passengerFacilities.length,
      passengerTerminals: normalized.passengerFacilities.filter((facility) => facility.kind === "terminal").length,
      passengerConcourses: normalized.passengerFacilities.filter((facility) => facility.kind === "concourse").length,
      excludedWays: graphBuild.excludedWays.length,
      excludedSegments: graphBuild.excludedSegments.length,
      graphNodes: graph.nodes.length,
      graphEdges: graph.edges.length,
      taxiways: graph.taxiways.length,
      stands: graph.stands.length,
      passengerStands: graph.stands.filter((stand) => stand.concourse).length,
      runwayAccess: graph.runwayAccess.length,
      controlPoints: graph.controlPoints.length,
      operationalZones: graph.zones.length,
      hotspots: graph.hotspots.length,
      gradeSeparatedEdges: graph.edges.filter((edge) => edge.gradeSeparation).length,
      runwayCrossingEdges: graph.edges.filter(
        (edge) => edge.kind === "runway-access" && edge.sourceWayId,
      ).length,
    },
    license: OSM_LICENSE,
    attribution: OSM_ATTRIBUTION,
    copyrightUrl: OSM_COPYRIGHT_URL,
  };

  await Promise.all([
    writeGenerated(options.output, serializedAsset),
    writeGenerated(options.graph, serializedGraph),
    writeGenerated(options.manifest, `${JSON.stringify(manifest, null, 2)}\n`),
  ]);
  process.stdout.write(
    `Wrote ${path.relative(process.cwd(), options.output)} (${Buffer.byteLength(serializedAsset).toLocaleString()} bytes)\n`,
  );
  process.stdout.write(
    `Wrote ${path.relative(process.cwd(), options.graph)} (${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.stands.length} stands)\n`,
  );
}

function parseArguments(arguments_) {
  let icaoId = "KORD";
  let output;
  let graph;
  let manifest;
  let faaAsset;
  let faaManifest;
  let input;
  let endpoint = DEFAULT_ENDPOINT;
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
    else if (argument === "--graph") graph = value;
    else if (argument === "--manifest") manifest = value;
    else if (argument === "--faa-asset") faaAsset = value;
    else if (argument === "--faa-manifest") faaManifest = value;
    else if (argument === "--input") input = value;
    else if (argument === "--endpoint") endpoint = value;
    else if (argument === "--retrieved-on") retrievedOn = value;
    else throw new Error(`Unknown option ${argument}`);
    index += 1;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(retrievedOn))
    throw new Error("--retrieved-on must use YYYY-MM-DD");
  return {
    icaoId,
    output: path.resolve(
      output ?? `public/data/airports/${icaoId}.osm-surface.json`,
    ),
    graph: path.resolve(
      graph ?? `src/data/airports/${icaoId}.surfaceGraph.json`,
    ),
    manifest: path.resolve(
      manifest ?? `src/data/airports/${icaoId}.surface.manifest.json`,
    ),
    faaAsset: path.resolve(
      faaAsset ?? `public/data/airports/${icaoId}.vector.json`,
    ),
    faaManifest: path.resolve(
      faaManifest ?? `src/data/airports/${icaoId}.manifest.json`,
    ),
    input: input ? path.resolve(input) : null,
    endpoint,
    retrievedOn,
  };
}

function buildQuery(faa, marginMeters) {
  const bounds = {
    min: faa.boundsMeters.min.map((value) => value - marginMeters),
    max: faa.boundsMeters.max.map((value) => value + marginMeters),
  };
  const southwest = unprojectPoint(bounds.min, faa.coordinateSystem);
  const northeast = unprojectPoint(bounds.max, faa.coordinateSystem);
  const box = [southwest[1], southwest[0], northeast[1], northeast[0]]
    .map((value) => value.toFixed(7))
    .join(",");
  // Airport terminal and stand features are represented by nodes and ways in
  // the OSM data used by this runtime. Asking Overpass for every matching
  // relation can recursively expand large airport-site multipolygons and
  // time out before the actual taxiway graph is returned (notably at DFW).
  // Keep the source query to the feature kinds the normalizer consumes.
  return `[out:json][timeout:180];(way(${box})["aeroway"~"^(taxiway|taxilane|runway)$"];node(${box})["aeroway"="parking_position"];way(${box})["aeroway"="parking_position"];node(${box})["aeroway"="gate"];node(${box})["aeroway"="terminal"];way(${box})["aeroway"="terminal"];);out body center;>;out skel qt;`;
}

async function fetchOverpass(endpoint, query) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "AirportAutoDataImporter/1.0",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(190_000),
      });
      if (!response.ok)
        throw new Error(
          `${response.status} ${response.statusText} from ${endpoint}: ${(await response.text()).slice(0, 300)}`,
        );
      const data = await response.json();
      if (!Array.isArray(data.elements))
        throw new Error("Overpass response has no elements array");
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 3_000));
    }
  }
  throw lastError;
}

function normalizeOverpass(response, faa, options, query) {
  const rawNodes = mergeOsmElements(response.elements, "node");
  const rawWayMap = mergeOsmElements(response.elements, "way");
  const rawRelationMap = mergeOsmElements(response.elements, "relation");
  const rawWays = [...rawWayMap.values()].filter(
    (element) =>
      ["taxiway", "taxilane", "runway"].includes(element.tags?.aeroway),
  );
  const ways = rawWays
    .filter(
      (way) =>
        Array.isArray(way.nodes) &&
        way.nodes.length >= 2 &&
        way.nodes.every((id) => rawNodes.has(id)),
    )
    .map((way) => ({
      id: way.id,
      kind: way.tags.aeroway,
      ref: cleanTag(way.tags.ref),
      name: cleanTag(way.tags.name),
      surface: cleanTag(way.tags.surface),
      widthMeters: parsePositiveNumber(way.tags.width),
      oneWay: way.tags.oneway === "yes",
      bridge: way.tags.bridge === "yes",
      tunnel: way.tags.tunnel === "yes",
      nodeIds: [...way.nodes],
    }))
    .sort((first, second) => first.id - second.id);
  const usedNodeIds = new Set([
    ...ways.flatMap((way) => way.nodeIds),
    ...[...rawNodes.values()]
      .filter((node) => node.tags?.aeroway === "parking_position")
      .map((node) => node.id),
  ]);
  const nodes = [...usedNodeIds]
    .map((id) => {
      const node = rawNodes.get(id);
      return {
        id,
        positionMeters: projectPoint(
          [node.lon, node.lat],
          faa.coordinateSystem,
        ),
        parkingPosition: node.tags?.aeroway === "parking_position",
        ref: cleanTag(node.tags?.ref),
      };
    })
    .sort((first, second) => first.id - second.id);
  const gates = [...rawNodes.values()]
    .filter((node) => node.tags?.aeroway === "gate")
    .filter((node) => Number.isFinite(node.lon) && Number.isFinite(node.lat))
    .map((node) => {
      const ref = normalizedReference(node.tags?.ref ?? node.tags?.name);
      const identity = passengerIdentityForReference(ref);
      return {
        id: node.id,
        ref,
        positionMeters: projectPoint([node.lon, node.lat], faa.coordinateSystem),
        ...(identity ?? {}),
      };
    })
    .filter((gate) => gate.ref)
    .sort((first, second) => first.id - second.id);
  const parkingPositions = [
    ...[...rawNodes.values()]
      .filter((node) => node.tags?.aeroway === "parking_position")
      .filter((node) => Number.isFinite(node.lon) && Number.isFinite(node.lat))
      .map((node) => ({
        sourceType: "node",
        sourceElementId: node.id,
        ref: normalizedReference(node.tags?.ref),
        entryNodeId: node.id,
        positionMeters: projectPoint([node.lon, node.lat], faa.coordinateSystem),
        leadInMeters: [projectPoint([node.lon, node.lat], faa.coordinateSystem)],
      })),
    ...[...rawWayMap.values()]
      .filter((way) => way.tags?.aeroway === "parking_position")
      .filter((way) => Array.isArray(way.nodes) && way.nodes.length >= 2)
      .filter((way) => way.nodes.every((nodeId) => rawNodes.has(nodeId)))
      .map((way) => {
        const leadInMeters = way.nodes.map((nodeId) => {
          const node = rawNodes.get(nodeId);
          return projectPoint([node.lon, node.lat], faa.coordinateSystem);
        });
        return {
          sourceType: "way",
          sourceElementId: way.id,
          ref: normalizedReference(way.tags?.ref),
          entryNodeId: way.nodes[0],
          positionMeters: leadInMeters.at(-1),
          leadInMeters,
        };
      }),
  ]
    .map((position) => {
      const identity = passengerIdentityForReference(position.ref);
      const gate = closestMatchingGate(position, gates);
      return {
        ...position,
        ...(identity ?? {}),
        ...(gate ? { sourceGateNodeId: gate.id } : {}),
      };
    })
    .sort(
      (first, second) =>
        first.sourceType.localeCompare(second.sourceType) ||
        first.sourceElementId - second.sourceElementId,
    );
  const passengerFacilities = buildPassengerFacilities(
    [...rawNodes.values(), ...rawWayMap.values(), ...rawRelationMap.values()],
    rawNodes,
    gates,
    faa,
  );
  return {
    nodes,
    ways,
    parkingPositions,
    gates,
    passengerFacilities,
    passengerFacilityReference: structuredClone(activeFacilityReference),
    source: {
      provider: "OpenStreetMap",
      endpoint: options.endpoint,
      query,
      osmBaseTimestamp: response.osm3s?.timestamp_osm_base ?? null,
      license: OSM_LICENSE,
      attribution: OSM_ATTRIBUTION,
      copyrightUrl: OSM_COPYRIGHT_URL,
    },
  };
}

function mergeOsmElements(elements, type) {
  const merged = new Map();
  for (const element of elements.filter((candidate) => candidate.type === type)) {
    const existing = merged.get(element.id) ?? {};
    merged.set(element.id, {
      ...existing,
      ...element,
      ...(existing.tags || element.tags
        ? { tags: { ...(existing.tags ?? {}), ...(element.tags ?? {}) } }
        : {}),
    });
  }
  return merged;
}

function normalizedReference(value) {
  const normalized = cleanTag(value)?.toUpperCase().replaceAll(" ", "");
  return normalized || null;
}

function passengerIdentityForReference(reference) {
  const match = String(reference ?? "").match(
    activeFacilityReference.gateReferencePattern,
  );
  if (!match) return null;
  const concourse = match[1].toUpperCase();
  const terminal = activeConcourseToTerminal.get(concourse);
  if (!terminal) return null;
  return {
    terminalId: terminal.id,
    terminal: terminal.name,
    concourse,
  };
}

function closestMatchingGate(parkingPosition, gates) {
  if (!parkingPosition.ref) return null;
  return gates
    .filter((gate) => gate.ref === parkingPosition.ref)
    .map((gate) => ({
      gate,
      distance: distance2d(gate.positionMeters, parkingPosition.positionMeters),
    }))
    .filter((candidate) => candidate.distance <= 180)
    .sort((first, second) => first.distance - second.distance)[0]?.gate ?? null;
}

function buildPassengerFacilities(elements, rawNodes, gates, faa) {
  const candidates = [];
  for (const element of elements.filter(
    (candidate) => candidate.tags?.aeroway === "terminal",
  )) {
    const name = cleanTag(element.tags?.name);
    const centerMeters = osmElementCenter(element, rawNodes, faa.coordinateSystem);
    if (!name || !centerMeters) continue;
    const terminal = activeFacilityReference.terminals.find((item) =>
      item.osmNamePattern?.test(name),
    );
    const concourseMatch = name.match(/^Concourse\s+([A-Z])(?:\s+Stinger|\s*\(|$)/i);
    if (terminal) {
      if (terminal)
        candidates.push({
          kind: "terminal",
          terminal,
          name,
          centerMeters,
          sourceElementId: `${element.type}/${element.id}`,
          sourceType: element.type,
        });
    } else if (concourseMatch) {
      const concourse = concourseMatch[1].toUpperCase();
      const terminal = activeConcourseToTerminal.get(concourse);
      if (terminal)
        candidates.push({
          kind: "concourse",
          terminal,
          concourse,
          name,
          centerMeters,
          sourceElementId: `${element.type}/${element.id}`,
          sourceType: element.type,
        });
    }
  }

  const facilities = [];
  for (const terminal of activeFacilityReference.terminals) {
    const terminalCandidates = candidates.filter(
      (candidate) => candidate.kind === "terminal" && candidate.terminal.id === terminal.id,
    );
    const terminalCenter = preferredFacilityCenter(terminalCandidates)
      ?? averagePoint(
        gates
          .filter((gate) => gate.terminalId === terminal.id)
          .map((gate) => gate.positionMeters),
      );
    if (!terminalCenter) continue;
    facilities.push({
      id: `${activeFacilityReference.airportCode}-${terminal.id}`,
      kind: "terminal",
      name: terminal.name,
      terminalId: terminal.id,
      terminal: terminal.name,
      concourses: terminal.concourses.map((concourse) => concourse.id),
      centerMeters: roundPoint(terminalCenter, 1),
      publishedGateCount: terminal.concourses.reduce(
        (total, concourse) => total + concourse.publishedGateCount,
        0,
      ),
      sourceElementIds: terminalCandidates.map((candidate) => candidate.sourceElementId).sort(),
      positionSource: terminalCandidates.length ? "osm-terminal" : "osm-gate-centroid",
    });
  }

  for (const terminal of activeFacilityReference.terminals) {
    for (const officialConcourse of terminal.concourses) {
      const concourseCandidates = candidates.filter(
        (candidate) =>
          candidate.kind === "concourse" &&
          candidate.concourse === officialConcourse.id,
      );
      const matchingGates = gates.filter(
        (gate) => gate.concourse === officialConcourse.id,
      );
      const center = preferredFacilityCenter(concourseCandidates)
        ?? averagePoint(matchingGates.map((gate) => gate.positionMeters));
      if (!center) continue;
      facilities.push({
        id: `${activeFacilityReference.airportCode}-CONCOURSE-${officialConcourse.id}`,
        kind: "concourse",
        name: `Concourse ${officialConcourse.id}`,
        terminalId: terminal.id,
        terminal: terminal.name,
        concourse: officialConcourse.id,
        centerMeters: roundPoint(center, 1),
        publishedGateCount: officialConcourse.publishedGateCount,
        sourceElementIds: concourseCandidates.length
          ? concourseCandidates.map((candidate) => candidate.sourceElementId).sort()
          : matchingGates.map((gate) => `node/${gate.id}`).sort(),
        positionSource: concourseCandidates.length
          ? "osm-terminal"
          : "osm-gate-centroid",
        ...(officialConcourse.sections
          ? { sections: [...officialConcourse.sections] }
          : {}),
      });
    }
  }
  return facilities.sort(
    (first, second) =>
      first.kind.localeCompare(second.kind) || first.id.localeCompare(second.id),
  );
}

function preferredFacilityCenter(candidates) {
  const preferred = [...candidates].sort((first, second) => {
    const typeRank = { relation: 0, way: 1, node: 2 };
    const firstStinger = /stinger/i.test(first.name) ? 1 : 0;
    const secondStinger = /stinger/i.test(second.name) ? 1 : 0;
    return firstStinger - secondStinger
      || (typeRank[first.sourceType] ?? 3) - (typeRank[second.sourceType] ?? 3);
  })[0];
  return preferred?.centerMeters ?? null;
}

function osmElementCenter(element, rawNodes, coordinateSystem) {
  if (Number.isFinite(element.lon) && Number.isFinite(element.lat))
    return projectPoint([element.lon, element.lat], coordinateSystem);
  if (Number.isFinite(element.center?.lon) && Number.isFinite(element.center?.lat))
    return projectPoint([element.center.lon, element.center.lat], coordinateSystem);
  if (!Array.isArray(element.nodes)) return null;
  const points = element.nodes
    .map((nodeId) => rawNodes.get(nodeId))
    .filter((node) => Number.isFinite(node?.lon) && Number.isFinite(node?.lat))
    .map((node) => projectPoint([node.lon, node.lat], coordinateSystem));
  return averagePoint(points);
}

function averagePoint(points) {
  if (!points.length) return null;
  return [
    points.reduce((total, point) => total + point[0], 0) / points.length,
    points.reduce((total, point) => total + point[1], 0) / points.length,
  ];
}

function buildSurfaceGraph(surface, faa) {
  const nodeMeters = new Map(
    surface.nodes.map((node) => [node.id, node.positionMeters]),
  );
  const routableWays = surface.ways.filter(
    (way) => way.kind === "taxiway" || way.kind === "taxilane",
  );
  const nodeUse = new Map();
  for (const way of routableWays)
    for (const id of new Set(way.nodeIds))
      nodeUse.set(id, (nodeUse.get(id) ?? 0) + 1);
  const simplifiedWays = routableWays.map((way) => ({
    ...way,
    nodeIds: simplifyWay(
      way.nodeIds,
      nodeMeters,
      new Set(
        way.nodeIds.filter(
          (id, index) =>
            index === 0 ||
            index === way.nodeIds.length - 1 ||
            (nodeUse.get(id) ?? 0) > 1,
        ),
      ),
      2.5,
    ),
  }));

  const edgeCandidates = [];
  const sourceWayIdsByEdge = new Map();
  const edgeByEndpoints = new Map();
  for (const way of simplifiedWays) {
    for (let index = 0; index < way.nodeIds.length - 1; index += 1) {
      const from = way.nodeIds[index];
      const to = way.nodeIds[index + 1];
      if (from === to) continue;
      const key = [from, to].sort((a, b) => a - b).join(":");
      const existing = edgeByEndpoints.get(key);
      if (existing) {
        sourceWayIdsByEdge.get(key).add(way.id);
        if (!existing.ref && way.ref) existing.ref = way.ref;
        if (existing.kind === "taxilane" && way.kind === "taxiway")
          existing.kind = "taxiway";
        existing.bridge ||= way.bridge;
        existing.tunnel ||= way.tunnel;
        existing.oneWay ||= way.oneWay;
        continue;
      }
      const candidate = { from, to, wayId: way.id, ...way };
      delete candidate.nodeIds;
      edgeCandidates.push(candidate);
      edgeByEndpoints.set(key, candidate);
      sourceWayIdsByEdge.set(key, new Set([way.id]));
    }
  }

  const excludedSegments = [];
  const minimumBuildingClearanceMeters = MINIMUM_BUILDING_CLEARANCE_METERS;
  const safeEdgeCandidates = edgeCandidates.filter((edge) => {
    const buildingClearance = segmentLayerClearance(
      nodeMeters.get(edge.from),
      nodeMeters.get(edge.to),
      faa.layers.buildings,
      8,
    );
    if (buildingClearance < minimumBuildingClearanceMeters)
      excludedSegments.push({
        wayId: edge.wayId,
        fromNodeId: edge.from,
        toNodeId: edge.to,
        reason:
          buildingClearance <= 0.01
            ? "intersects-faa-building"
            : "insufficient-faa-building-clearance",
        clearanceMeters: round(buildingClearance, 1),
      });
    return buildingClearance >= minimumBuildingClearanceMeters;
  });
  const components = connectedComponents(safeEdgeCandidates);
  const primary = components.sort(
    (first, second) => second.nodes.size - first.nodes.size,
  )[0];
  if (!primary) throw new Error("OSM surface graph has no connected component");
  const keptEdges = safeEdgeCandidates.filter(
    (edge) => primary.nodes.has(edge.from) && primary.nodes.has(edge.to),
  );
  const keptWayIds = new Set(
    keptEdges.flatMap((edge) => [
      ...sourceWayIdsByEdge.get(
        [edge.from, edge.to].sort((a, b) => a - b).join(":"),
      ),
    ]),
  );
  const excludedWays = routableWays
    .filter((way) => !keptWayIds.has(way.id))
    .map((way) => ({ id: way.id, reason: "outside-primary-connected-component" }));
  const nodeIds = new Set(keptEdges.flatMap((edge) => [edge.from, edge.to]));
  const nodeMap = new Map();
  for (const id of [...nodeIds].sort((first, second) => first - second)) {
    const position = nodeMeters.get(id);
    nodeMap.set(id, {
      id: `OSM-N${id}`,
      sourceNodeId: id,
      kind: "taxiway",
      position: roundPoint(
        position.map((value) => value / WORLD_METERS_PER_UNIT),
        3,
      ),
      taxiwayIds: [],
    });
  }

  const taxiwayMap = new Map();
  const edges = [];
  let edgeSequence = 1;
  const runwayFeatures = faa.runtimeReference.runways.map((runway, index) => ({
    index,
    runway,
    feature: faa.layers.runways.find(
      (feature) => feature.properties.runwayId === runway.runwayId,
    ),
  }));
  for (const sourceEdge of keptEdges) {
    const from = nodeMap.get(sourceEdge.from);
    const to = nodeMap.get(sourceEdge.to);
    const taxiwayId = logicalTaxiwayId(sourceEdge);
    const taxiwayName = logicalTaxiwayName(sourceEdge);
    const crossings = segmentRunwayCrossings(
      nodeMeters.get(sourceEdge.from),
      nodeMeters.get(sourceEdge.to),
      runwayFeatures,
    );
    const crossing = crossings[0];
    const edge = {
      id: `OSM-E${String(edgeSequence++).padStart(5, "0")}`,
      sourceWayId: sourceEdge.wayId,
      sourceWayIds: [
        ...sourceWayIdsByEdge.get(
          [sourceEdge.from, sourceEdge.to]
            .sort((a, b) => a - b)
            .join(":"),
        ),
      ].sort((a, b) => a - b),
      from: from.id,
      to: to.id,
      kind: crossing ? "runway-access" : "taxiway",
      name: crossing
        ? `${taxiwayName} crossing ${crossing.runway.runwayId}`
        : taxiwayName,
      direction: sourceEdge.oneWay ? "forward" : "both",
      width: round(
        Math.max(
          sourceEdge.kind === "taxilane" ? 1.8 : 2.4,
          (sourceEdge.widthMeters ?? 0) / WORLD_METERS_PER_UNIT,
        ),
        3,
      ),
      taxiwayId,
      ...(sourceEdge.bridge
        ? { gradeSeparation: "bridge" }
        : sourceEdge.tunnel
          ? { gradeSeparation: "tunnel" }
          : {}),
      ...(crossing
        ? {
            runwayId: crossing.index,
            crossedRunwayIds: crossings.map((item) => item.index),
          }
        : {}),
    };
    edges.push(edge);
    let taxiway = taxiwayMap.get(taxiwayId);
    if (!taxiway) {
      taxiway = {
        id: taxiwayId,
        name: taxiwayName,
        edgeIds: [],
        ...(sourceEdge.ref ? { reference: sourceEdge.ref } : {}),
        sourceKind: sourceEdge.kind,
      };
      taxiwayMap.set(taxiwayId, taxiway);
    }
    taxiway.edgeIds.push(edge.id);
    for (const node of [from, to])
      if (!node.taxiwayIds.includes(taxiwayId)) node.taxiwayIds.push(taxiwayId);
  }

  edgeSequence = attachParkingPositions(
    surface,
    faa,
    nodeMap,
    edges,
    taxiwayMap,
    edgeSequence,
  );

  const degree = nodeDegrees(edges);
  for (const node of nodeMap.values())
    if ((degree.get(node.id) ?? 0) >= 3) node.kind = "intersection";
  const zones = buildOperationalZones(faa, nodeMap, edges, surface);
  const stands = selectStands(
    nodeMap,
    edges,
    degree,
    surface,
    faa,
    zones,
    48,
  );
  const passengerFacilities = graphPassengerFacilities(surface, stands);
  for (const stand of stands) {
    const zone = zones.find((candidate) => candidate.id === stand.zoneId);
    if (zone) zone.standIds.push(stand.id);
  }
  const runwayAccess = [];
  for (const { index, runway, feature } of runwayFeatures) {
    if (!feature) throw new Error(`FAA runway feature ${runway.runwayId} is missing`);
    const thresholds = new Map();
    for (const end of [-1, 1]) {
      const suffix = end === -1 ? "NEG" : "POS";
      const thresholdId = `RWY-${index}-${suffix}-THR`;
      const thresholdPosition = runwayEnd(runway, end);
      const threshold = {
        id: thresholdId,
        kind: "runway-threshold",
        position: roundPoint(thresholdPosition, 3),
        taxiwayIds: [],
        runwayId: index,
      };
      nodeMap.set(thresholdId, threshold);
      thresholds.set(end, threshold);
      const holdShortNode = chooseRunwayAccessNode(
        index,
        end,
        runway,
        feature,
        nodeMap,
        edges,
        nodeMeters,
      );
      holdShortNode.kind = "hold-short";
      holdShortNode.runwayId = index;
      const primaryTaxiwayId = holdShortNode.taxiwayIds[0];
      const connector = {
        id: `FAA-RWY-${index}-${suffix}-ACCESS`,
        from: holdShortNode.id,
        to: threshold.id,
        kind: "runway-access",
        name: `Runway ${runway.runwayId} ${end === -1 ? "west/south" : "east/north"} entry`,
        direction: "both",
        width: runway.width,
        runwayId: index,
        crossedRunwayIds: [index],
      };
      edges.push(connector);
      runwayAccess.push({
        runwayId: index,
        end,
        thresholdNodeId: threshold.id,
        exitNodeId: holdShortNode.id,
        holdShortNodeId: holdShortNode.id,
        primaryTaxiwayId,
      });
    }
    edges.push({
      id: `FAA-RWY-${index}-CENTERLINE`,
      from: thresholds.get(-1).id,
      to: thresholds.get(1).id,
      kind: "runway",
      name: `Runway ${runway.runwayId}`,
      direction: "both",
      width: runway.width,
      runwayId: index,
    });
  }

  for (const node of nodeMap.values()) node.taxiwayIds.sort();
  zones.push(...buildPerimeterRouteZones(nodeMap, edges));
  const controlPoints = buildSurfaceControlPoints(nodeMap, edges, runwayAccess, faa);
  const hotspots = buildSurfaceHotspots(faa, nodeMap, edges);
  return {
    excludedWays,
    excludedSegments,
    graph: {
      schemaVersion: SCHEMA_VERSION,
      airportCode: activeFacilityReference.airportCode,
      seed: 10_004,
      source: {
        kind: "imported",
        provider: "OpenStreetMap centerlines validated against FAA Airport Mapping pavement",
        retrievedOn: surface.source.osmBaseTimestamp,
      },
      nodes: [...nodeMap.values()],
      edges,
      taxiways: [...taxiwayMap.values()].sort((first, second) =>
        first.id.localeCompare(second.id),
      ),
      stands,
      passengerFacilities,
      passengerFacilityReference: structuredClone(surface.passengerFacilityReference),
      runwayAccess,
      controlPoints,
      zones,
      hotspots,
    },
  };
}

function simplifyWay(nodeIds, nodeMap, mandatory, toleranceMeters) {
  const result = [];
  let start = 0;
  while (start < nodeIds.length - 1) {
    let end = start + 1;
    while (end < nodeIds.length - 1 && !mandatory.has(nodeIds[end])) end += 1;
    const section = nodeIds.slice(start, end + 1);
    const simplified = douglasPeucker(section, nodeMap, toleranceMeters);
    if (result.length) simplified.shift();
    result.push(...simplified);
    start = end;
  }
  return result;
}

function douglasPeucker(nodeIds, nodeMap, tolerance) {
  if (nodeIds.length <= 2) return [...nodeIds];
  const first = nodeMap.get(nodeIds[0]);
  const last = nodeMap.get(nodeIds.at(-1));
  let maximum = -1;
  let split = -1;
  for (let index = 1; index < nodeIds.length - 1; index += 1) {
    const distance = pointSegmentDistance(
      nodeMap.get(nodeIds[index]),
      first,
      last,
    );
    if (distance > maximum) {
      maximum = distance;
      split = index;
    }
  }
  if (maximum <= tolerance) return [nodeIds[0], nodeIds.at(-1)];
  return [
    ...douglasPeucker(nodeIds.slice(0, split + 1), nodeMap, tolerance).slice(
      0,
      -1,
    ),
    ...douglasPeucker(nodeIds.slice(split), nodeMap, tolerance),
  ];
}

function connectedComponents(edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    addSetValue(adjacency, edge.from, edge.to);
    addSetValue(adjacency, edge.to, edge.from);
  }
  const unseen = new Set(adjacency.keys());
  const components = [];
  while (unseen.size) {
    const start = unseen.values().next().value;
    const pending = [start];
    const nodes = new Set([start]);
    unseen.delete(start);
    while (pending.length) {
      const current = pending.pop();
      for (const next of adjacency.get(current) ?? []) {
        if (nodes.has(next)) continue;
        nodes.add(next);
        unseen.delete(next);
        pending.push(next);
      }
    }
    components.push({ nodes });
  }
  return components;
}

function attachParkingPositions(surface, faa, nodeMap, edges, taxiwayMap, edgeSequence) {
  const existingNodes = [...nodeMap.values()];
  for (const source of surface.parkingPositions.filter(
    (position) => position.concourse && position.sourceGateNodeId,
  )) {
    const referenceMeters = parkingAircraftReferencePoint(source, faa.layers.buildings);
    if (!referenceMeters) continue;
    const position = roundPoint(
      referenceMeters.map((value) => value / WORLD_METERS_PER_UNIT),
      3,
    );
    const sharedEntryNode = nodeMap.get(source.entryNodeId);
    const neighbor = sharedEntryNode ?? existingNodes
      .map((node) => ({ node, distance: distance2d(position, node.position) }))
      .filter((candidate) => candidate.distance <= 5)
      .filter((candidate) => segmentLayerClearance(
        source.leadInMeters[0] ?? source.positionMeters,
        candidate.node.position.map((value) => value * WORLD_METERS_PER_UNIT),
        faa.layers.buildings,
        4,
      ) > 0)
      .sort((first, second) => first.distance - second.distance)[0]?.node;
    if (!neighbor) continue;
    if (distance2d(position, neighbor.position) < 0.2) continue;
    const sourceParkingPositionId = `${source.sourceType}/${source.sourceElementId}`;
    const node = {
      id: `OSM-P${source.sourceType === "way" ? "W" : "N"}${source.sourceElementId}`,
      ...(source.sourceType === "node" ? { sourceNodeId: source.sourceElementId } : {}),
      sourceParkingPositionId,
      kind: "taxiway",
      position,
      taxiwayIds: [],
    };
    const taxiwayId = neighbor.taxiwayIds.find((id) => id.startsWith("RAMP-"))
      ?? neighbor.taxiwayIds[0]
      ?? "RAMP-PARKING";
    const taxiwayName = taxiwayMap.get(taxiwayId)?.name ?? "Parking stand lead-ins";
    const edge = {
      id: `OSM-E${String(edgeSequence++).padStart(5, "0")}`,
      from: neighbor.id,
      to: node.id,
      kind: "stand-lead-in",
      name: source.ref ? `Stand ${source.ref} lead-in` : "Parking stand lead-in",
      direction: "both",
      width: STAND_LEAD_IN_WIDTH_WORLD,
      taxiwayId,
    };
    node.taxiwayIds.push(taxiwayId);
    nodeMap.set(sourceParkingPositionId, node);
    edges.push(edge);
    let taxiway = taxiwayMap.get(taxiwayId);
    if (!taxiway) {
      taxiway = { id: taxiwayId, name: taxiwayName, edgeIds: [], sourceKind: "taxilane" };
      taxiwayMap.set(taxiwayId, taxiway);
    }
    taxiway.edgeIds.push(edge.id);
  }
  return edgeSequence;
}

function parkingAircraftReferencePoint(source, buildingFeatures) {
  if (source.sourceType !== "way" || source.leadInMeters.length < 2) return null;
  const entry = source.leadInMeters[0];
  const noseWheelStop = source.positionMeters;
  const samples = reversePolylineSamples(source.leadInMeters, 2);
  return samples.find((candidate) =>
    distance2d(entry, candidate) >= 8
    && distance2d(noseWheelStop, candidate) >= MINIMUM_STAND_REFERENCE_OFFSET_METERS
    && segmentLayerClearance(entry, candidate, buildingFeatures, 3)
      >= MINIMUM_STAND_REFERENCE_CLEARANCE_METERS
  ) ?? null;
}

function reversePolylineSamples(points, stepMeters) {
  const samples = [];
  for (let index = points.length - 1; index > 0; index -= 1) {
    const from = points[index];
    const to = points[index - 1];
    const length = distance2d(from, to);
    const steps = Math.max(1, Math.ceil(length / stepMeters));
    for (let step = 0; step <= steps; step += 1) {
      if (samples.length && step === 0) continue;
      const amount = step / steps;
      samples.push([
        from[0] + (to[0] - from[0]) * amount,
        from[1] + (to[1] - from[1]) * amount,
      ]);
    }
  }
  return samples;
}

function buildOperationalZones(faa, nodeMap, edges, surface) {
  const zones = [];
  for (const obstacle of faa.runtimeReference.obstacles.filter(
    (candidate) => candidate.kind === "terminal",
  )) {
    zones.push({
      id: "ZONE-TERMINAL-COMPLEX",
      name: obstacle.label || "O'Hare terminal complex",
      kind: "terminal-complex",
      sourceFeatureIds: [obstacle.id],
      rings: [[...obstacle.points]],
      edgeIds: [],
      standIds: [],
      classification: "published",
    });
  }

  let unnamedTerminal = 1;
  let unnamedRemote = 1;
  const terminal = faa.runtimeReference.terminal;
  for (const apron of faa.runtimeReference.aprons) {
    const designator = String(apron.designator ?? "").trim();
    const published = designator && designator !== "UNK";
    const centroid = polygonCentroid(apron.rings[0]);
    const upper = designator.toUpperCase();
    let kind;
    let name;
    if (upper.includes("CARGO")) {
      kind = "cargo-ramp";
      name = titleCase(designator);
    } else if (upper.includes("GENERAL AVIATION")) {
      kind = "general-aviation";
      name = "General aviation ramp";
    } else if (upper.includes("DEIC")) {
      kind = "deicing-pad";
      name = titleCase(designator);
    } else if (upper.includes("PAD") || upper.includes("HOLD")) {
      kind = "holding-pad";
      name = titleCase(designator);
    } else if (distance2d(centroid, terminal) <= 30) {
      kind = "terminal-apron";
      name = `Terminal apron ${unnamedTerminal++}`;
    } else {
      kind = "remote-ramp";
      name = `Remote ramp ${unnamedRemote++}`;
    }
    zones.push({
      id: `ZONE-${sanitize(apron.id)}`,
      name,
      kind,
      sourceFeatureIds: [apron.id],
      rings: apron.rings.map((ring) => ring.map((point) => [...point])),
      edgeIds: edges
        .filter((edge) => {
          const from = graphNodeById(nodeMap, edge.from);
          const to = graphNodeById(nodeMap, edge.to);
          return from && to && pointInRings(midpoint(from.position, to.position), apron.rings);
        })
        .map((edge) => edge.id),
      standIds: [],
      classification: published ? "published" : "derived",
    });
  }

  for (const zone of zones.filter(
    (candidate) =>
      candidate.rings.length &&
      ["remote-ramp", "terminal-apron"].includes(candidate.kind),
  )) {
    const terminalIds = new Set(
      surface.parkingPositions
        .filter((position) => position.terminalId)
        .filter((position) => pointInRings(
          position.positionMeters.map((value) => value / WORLD_METERS_PER_UNIT),
          zone.rings,
        ))
        .map((position) => position.terminalId),
    );
    if (!terminalIds.size) continue;
    zone.kind = "terminal-apron";
    zone.name = terminalIds.size === 1
      ? `${activeFacilityReference.terminals.find((terminal) => terminal.id === [...terminalIds][0])?.name ?? [...terminalIds][0]} apron`
      : `Terminals ${[...terminalIds].map((id) => id.slice(1)).sort().join("–")} aprons`;
  }

  const maintenanceCandidate = zones
    .filter((zone) => zone.kind === "remote-ramp")
    .sort((first, second) => ringsArea(second.rings) - ringsArea(first.rings))[0];
  if (maintenanceCandidate) {
    maintenanceCandidate.kind = "maintenance";
    maintenanceCandidate.name = "Maintenance / remote apron";
  }
  return zones;
}

function buildPerimeterRouteZones(nodeMap, edges) {
  const nodes = [...nodeMap.values()].filter(
    (node) => Array.isArray(node.position) && node.kind !== "runway-threshold",
  );
  if (!nodes.length) return [];
  const bounds = boundsForPoints(nodes.map((node) => node.position));
  const spanX = bounds.max[0] - bounds.min[0];
  const spanY = bounds.max[1] - bounds.min[1];
  const definitions = [
    { id: "NORTH", name: "North perimeter routes", includes: ([, y]) => y >= bounds.max[1] - spanY * 0.18 },
    { id: "SOUTH", name: "South perimeter routes", includes: ([, y]) => y <= bounds.min[1] + spanY * 0.18 },
    { id: "EAST", name: "East perimeter routes", includes: ([x]) => x >= bounds.max[0] - spanX * 0.16 },
    { id: "WEST", name: "West perimeter routes", includes: ([x]) => x <= bounds.min[0] + spanX * 0.16 },
  ];
  return definitions
    .map((definition) => ({
      id: `ZONE-PERIMETER-${definition.id}`,
      name: definition.name,
      kind: "perimeter-route",
      sourceFeatureIds: [],
      rings: [],
      edgeIds: edges
        .filter((edge) => edge.kind !== "runway")
        .filter((edge) => {
          const from = graphNodeById(nodeMap, edge.from);
          const to = graphNodeById(nodeMap, edge.to);
          return from && to && definition.includes(midpoint(from.position, to.position));
        })
        .map((edge) => edge.id),
      standIds: [],
      classification: "derived",
    }))
    .filter((zone) => zone.edgeIds.length);
}

function buildSurfaceControlPoints(nodeMap, edges, runwayAccess, faa) {
  const controlPoints = [];
  for (const access of runwayAccess) {
    const hold = graphNodeById(nodeMap, access.holdShortNodeId);
    const threshold = graphNodeById(nodeMap, access.thresholdNodeId);
    if (!hold || !threshold) continue;
    const suffix = access.end === -1 ? "NEG" : "POS";
    controlPoints.push(
      { id: `CP-RWY-${access.runwayId}-${suffix}-HOLD`, kind: "hold-short", position: [...hold.position], runwayId: access.runwayId, nodeId: hold.id, end: access.end, source: "generated" },
      { id: `CP-RWY-${access.runwayId}-${suffix}-RELEASE`, kind: "departure-release", position: [...hold.position], runwayId: access.runwayId, nodeId: hold.id, end: access.end, source: "generated" },
      { id: `CP-RWY-${access.runwayId}-${suffix}-ENTRY`, kind: "runway-entry", position: [...threshold.position], runwayId: access.runwayId, nodeId: threshold.id, end: access.end, source: "generated" },
      { id: `CP-RWY-${access.runwayId}-${suffix}-LINEUP`, kind: "line-up", position: [...threshold.position], runwayId: access.runwayId, nodeId: threshold.id, end: access.end, source: "generated" },
    );
  }

  const runwayIds = [...new Set(edges.flatMap((edge) => edge.crossedRunwayIds ?? []))].sort(
    (first, second) => first - second,
  );
  for (const runwayId of runwayIds) {
    const runwayFeature = faa.layers.runways.find(
      (feature) => feature.properties.runwayId === faa.runtimeReference.runways[runwayId]?.runwayId,
    );
    if (!runwayFeature) continue;
    const crossingEdges = edges.filter(
      (edge) => edge.sourceWayId && edge.kind === "runway-access" && edge.crossedRunwayIds?.includes(runwayId),
    );
    const edgeById = new Map(crossingEdges.map((edge) => [edge.id, edge]));
    const edgeIdsByNode = new Map();
    for (const edge of crossingEdges) {
      addArrayValue(edgeIdsByNode, edge.from, edge.id);
      addArrayValue(edgeIdsByNode, edge.to, edge.id);
    }
    const unseen = new Set(edgeById.keys());
    let sequence = 1;
    while (unseen.size) {
      const pending = [unseen.values().next().value];
      const component = [];
      while (pending.length) {
        const edgeId = pending.pop();
        if (!unseen.delete(edgeId)) continue;
        const edge = edgeById.get(edgeId);
        if (!edge) continue;
        component.push(edge);
        for (const nodeId of [edge.from, edge.to])
          for (const neighborId of edgeIdsByNode.get(nodeId) ?? [])
            if (unseen.has(neighborId)) pending.push(neighborId);
      }
      component.sort((first, second) => first.id.localeCompare(second.id));
      const degree = new Map();
      for (const edge of component) {
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
      }
      const componentIds = new Set(component.map((edge) => edge.id));
      const componentNodeIds = new Set(component.flatMap((edge) => [edge.from, edge.to]));
      const boundaryNodeIds = [...new Set([
        ...[...degree]
        .filter(([, count]) => count === 1)
        .map(([nodeId]) => nodeId),
        ...[...componentNodeIds].filter((nodeId) => allEdgesOutsideComponentAtNode(
          nodeId,
          componentIds,
          edges,
          nodeMap,
          runwayFeature,
        )),
      ])].sort();
      const boundaryCandidates = boundaryNodeIds
        .map((nodeId) => {
          const node = graphNodeById(nodeMap, nodeId);
          const edge = component.find((candidate) => candidate.from === node?.id || candidate.to === node?.id);
          if (!node || !edge) return null;
          const positions = crossingControlPositions(node, edge, component, edges, nodeMap, runwayFeature);
          return positions ? { node, edge, positions } : null;
        })
        .filter(Boolean)
        .filter((candidate, index, candidates) => candidates.findIndex((other) => distance2d(
          candidate.positions.hold,
          other.positions.hold,
        ) < 0.25) === index);
      let boundaryPair = null;
      let boundarySeparation = 0;
      for (let first = 0; first < boundaryCandidates.length; first += 1) {
        for (let second = first + 1; second < boundaryCandidates.length; second += 1) {
          const separation = distance2d(boundaryCandidates[first].positions.hold, boundaryCandidates[second].positions.hold);
          if (separation <= boundarySeparation) continue;
          boundarySeparation = separation;
          boundaryPair = [boundaryCandidates[first], boundaryCandidates[second]];
        }
      }
      if (!boundaryPair || boundarySeparation < 1.2) continue;
      const boundaries = boundaryPair;
      const crossingId = `X-RWY-${runwayId}-${String(sequence++).padStart(3, "0")}`;
      for (const edge of component) {
        edge.crossingIds ??= [];
        if (!edge.crossingIds.includes(crossingId)) edge.crossingIds.push(crossingId);
      }
      for (let side = 0; side < boundaries.length; side += 1) {
        const { positions } = boundaries[side];
        const suffix = side === 0 ? "A" : side === 1 ? "B" : String(side + 1);
        controlPoints.push(
          { id: `CP-${crossingId}-${suffix}-HOLD`, kind: "hold-short", position: roundPoint(positions.hold, 3), runwayId, edgeId: positions.edgeId, crossingId, source: "generated" },
          { id: `CP-${crossingId}-${suffix}-CROSS`, kind: "runway-crossing", position: roundPoint(positions.crossing, 3), runwayId, edgeId: positions.edgeId, crossingId, source: "generated" },
        );
      }
    }
  }
  return controlPoints;
}

function allEdgesOutsideComponentAtNode(nodeId, componentIds, allEdges, nodeMap, runwayFeature) {
  const node = graphNodeById(nodeMap, nodeId);
  if (!node) return false;
  if (!pointInGeometry(node.position.map((value) => value * WORLD_METERS_PER_UNIT), runwayFeature.geometry)) return true;
  return allEdges
    .filter((edge) => !componentIds.has(edge.id) && (edge.from === nodeId || edge.to === nodeId))
    .some((edge) => {
      const neighbor = graphNodeById(nodeMap, edge.from === nodeId ? edge.to : edge.from);
      return neighbor && !pointInGeometry(
        neighbor.position.map((value) => value * WORLD_METERS_PER_UNIT),
        runwayFeature.geometry,
      );
    });
}

function crossingControlPositions(boundaryNode, componentEdge, component, allEdges, nodeMap, runwayFeature) {
  const componentIds = new Set(component.map((edge) => edge.id));
  const boundaryInside = pointInGeometry(
    boundaryNode.position.map((value) => value * WORLD_METERS_PER_UNIT),
    runwayFeature.geometry,
  );
  let pathEdge = componentEdge;
  let outside = boundaryNode.position;
  let inside = graphNodeById(
    nodeMap,
    componentEdge.from === boundaryNode.id ? componentEdge.to : componentEdge.from,
  )?.position ?? boundaryNode.position;

  if (boundaryInside) {
    const outwardEdge = allEdges
      .filter((edge) => !componentIds.has(edge.id))
      .filter((edge) => edge.from === boundaryNode.id || edge.to === boundaryNode.id)
      .map((edge) => ({
        edge,
        node: graphNodeById(nodeMap, edge.from === boundaryNode.id ? edge.to : edge.from),
      }))
      .filter((candidate) => candidate.node)
      .filter((candidate) => !pointInGeometry(
        candidate.node.position.map((value) => value * WORLD_METERS_PER_UNIT),
        runwayFeature.geometry,
      ))
      .sort((first, second) => distance2d(second.node.position, boundaryNode.position) - distance2d(first.node.position, boundaryNode.position))[0];
    if (outwardEdge) {
      pathEdge = outwardEdge.edge;
      outside = outwardEdge.node.position;
      inside = boundaryNode.position;
    } else return null;
  }

  const transition = firstRunwayEntry(outside, inside, runwayFeature);
  if (!transition) return null;
  const directionX = outside[0] - transition[0];
  const directionY = outside[1] - transition[1];
  const length = Math.hypot(directionX, directionY) || 1;
  const holdBuffer = 0.8;
  return {
    hold: [
      transition[0] + directionX / length * holdBuffer,
      transition[1] + directionY / length * holdBuffer,
    ],
    crossing: transition,
    edgeId: pathEdge.id,
  };
}

function firstRunwayEntry(outside, inside, runwayFeature) {
  const samples = 96;
  let previous = outside;
  for (let sample = 1; sample <= samples; sample += 1) {
    const amount = sample / samples;
    const point = [
      outside[0] + (inside[0] - outside[0]) * amount,
      outside[1] + (inside[1] - outside[1]) * amount,
    ];
    if (pointInGeometry(
      point.map((value) => value * WORLD_METERS_PER_UNIT),
      runwayFeature.geometry,
    ))
      return previous;
    previous = point;
  }
  return null;
}

function buildSurfaceHotspots(faa, nodeMap, edges) {
  return faa.layers.hotspots
    .map((feature) => {
      const rings = geometryRings(feature.geometry).map((ring) =>
        ring.map((point) => roundPoint(point.map((value) => value / WORLD_METERS_PER_UNIT), 3)),
      );
      const nodeIds = [...nodeMap.values()]
        .filter((node) => pointInRings(node.position, rings))
        .map((node) => node.id)
        .sort();
      const edgeIds = edges
        .filter((edge) => {
          const from = graphNodeById(nodeMap, edge.from);
          const to = graphNodeById(nodeMap, edge.to);
          return from && to && (
            pointInRings(from.position, rings)
            || pointInRings(to.position, rings)
            || pointInRings(midpoint(from.position, to.position), rings)
          );
        })
        .map((edge) => edge.id)
        .sort();
      const hotspotId = feature.properties.hotspotId;
      return {
        id: `HS-${hotspotId}`,
        label: `HS ${hotspotId}`,
        description: feature.properties.description,
        sourceFeatureId: feature.id,
        rings,
        nodeIds,
        edgeIds,
      };
    })
    .sort((first, second) => first.id.localeCompare(second.id));
}

function selectStands(nodeMap, edges, degree, surface, faa, zones, maximum) {
  const sourceNodeById = new Map(surface.nodes.map((node) => [node.id, node]));
  const parkingPositionById = new Map(
    surface.parkingPositions.map((position) => [
      `${position.sourceType}/${position.sourceElementId}`,
      position,
    ]),
  );
  const edgeByNode = new Map();
  for (const edge of edges) {
    addArrayValue(edgeByNode, edge.from, edge);
    addArrayValue(edgeByNode, edge.to, edge);
  }
  const terminalMeters = faa.runtimeReference.terminal.map(
    (value) => value * WORLD_METERS_PER_UNIT,
  );
  const primary = [];
  const fallback = [];
  const airportWideEndpoints = [];
  for (const node of nodeMap.values()) {
    if ((degree.get(node.id) ?? 0) !== 1) continue;
    const parkingPosition = node.sourceParkingPositionId
      ? parkingPositionById.get(node.sourceParkingPositionId)
      : null;
    const source = parkingPosition ?? sourceNodeById.get(node.sourceNodeId);
    if (!source) continue;
    const positionMeters = node.position.map(
      (value) => value * WORLD_METERS_PER_UNIT,
    );
    const distance = distance2d(positionMeters, terminalMeters);
    const connectedEdges = edgeByNode.get(node.id) ?? [];
    const zone = operationalZoneForPoint(zones, node.position);
    const candidate = {
      node,
      source,
      parkingPosition,
      edge: connectedEdges[0],
      distance,
      zone,
    };
    const rampEndpoint = connectedEdges.some((edge) =>
      edge.taxiwayId?.startsWith("RAMP-"),
    );
    if (
      distance <= 3_200 &&
      (pointInLayer(positionMeters, faa.layers.aprons) || rampEndpoint) &&
      !pointInLayer(positionMeters, faa.layers.buildings)
    )
      airportWideEndpoints.push(candidate);
    if (distance > 1_900) continue;
    if (!rampEndpoint) continue;
    fallback.push(candidate);
    if (
      pointInLayer(positionMeters, faa.layers.aprons) &&
      !pointInLayer(positionMeters, faa.layers.buildings)
    )
      primary.push(candidate);
  }
  const candidates = uniqueCandidates([...primary, ...fallback, ...airportWideEndpoints]);
  candidates.sort(
    (first, second) =>
      first.distance - second.distance ||
      first.source.id - second.source.id,
  );
  const selected = [];
  const addCandidates = (predicate, requested, spacings = [2.6, 2.4, 2.25]) => {
    for (const minimumSpacing of spacings) {
      for (const candidate of candidates.filter(predicate)) {
        if (selected.includes(candidate)) continue;
        const matching = selected.filter(predicate).length;
        if (matching >= requested || selected.length >= maximum) return;
        if (
          candidate.parkingPosition?.ref &&
          selected.some(
            (other) =>
              other.parkingPosition?.terminalId === candidate.parkingPosition.terminalId &&
              other.parkingPosition?.ref === candidate.parkingPosition.ref,
          )
        )
          continue;
        if (
          selected.every(
            (other) =>
              distance2d(candidate.node.position, other.node.position) >=
              minimumSpacing,
          )
        )
          selected.push(candidate);
      }
      if (selected.filter(predicate).length >= requested) return;
    }
  };
  for (const terminal of activeFacilityReference.terminals)
    for (const concourse of terminal.concourses)
      addCandidates(
        (candidate) =>
          candidate.parkingPosition?.concourse === concourse.id &&
          Boolean(candidate.parkingPosition.sourceGateNodeId),
        2,
        [2.2, 2, 1.8],
      );
  addCandidates((candidate) => candidate.zone?.kind === "cargo-ramp", 4);
  addCandidates((candidate) => candidate.zone?.kind === "terminal-apron", 28, [2.2, 2, 1.8]);
  addCandidates((candidate) => candidate.zone?.kind === "general-aviation", 2);
  addCandidates(
    (candidate) => ["maintenance", "remote-ramp"].includes(candidate.zone?.kind),
    6,
  );
  const target = Math.min(maximum, Math.max(32, Math.min(40, candidates.length)));
  addCandidates(() => true, target);
  if (selected.length < 16)
    throw new Error(
      `Only ${selected.length} usable stand endpoints found (${primary.length} terminal-apron candidates, ${fallback.length} nearby ramp endpoints, ${airportWideEndpoints.length} airport-wide apron endpoints)`,
    );
  return selected
    .slice(0, maximum)
    .sort(
      (first, second) =>
        first.node.position[1] - second.node.position[1] ||
        first.node.position[0] - second.node.position[0],
    )
    .map((candidate, slot) => {
      const standId = `${activeFacilityReference.airportCode}-${String(slot + 1).padStart(2, "0")}`;
      candidate.node.kind = "stand";
      candidate.node.standId = standId;
      const neighborId =
        candidate.edge.from === candidate.node.id
          ? candidate.edge.to
          : candidate.edge.from;
      const neighbor = graphNodeById(nodeMap, neighborId);
      const sourcedHeading = candidate.parkingPosition
        ? parkingPositionHeading(candidate.parkingPosition, candidate.node.position)
        : null;
      const heading = sourcedHeading ?? (neighbor
        ? Math.atan2(
            candidate.node.position[1] - neighbor.position[1],
            candidate.node.position[0] - neighbor.position[0],
          )
        : 0);
      const pushbackHeading = neighbor
        ? Math.atan2(
            neighbor.position[1] - candidate.node.position[1],
            neighbor.position[0] - candidate.node.position[0],
          )
        : normalizeRadians(heading + Math.PI);
      const nearestSpacingMeters = Math.min(
        ...selected
          .filter((other) => other !== candidate)
          .map((other) => distance2d(candidate.node.position, other.node.position) * WORLD_METERS_PER_UNIT),
      );
      const maximumWingspanM = round(
        Math.max(35.8, Math.min(72, nearestSpacingMeters - 12)),
        1,
      );
      const supportedCategories = ["regional", "narrowbody"];
      if (maximumWingspanM >= 64.8 && candidate.zone?.kind !== "general-aviation")
        supportedCategories.push("widebody");
      if (
        maximumWingspanM >= 64.8
        && !candidate.parkingPosition?.concourse
        && ["cargo-ramp", "maintenance", "remote-ramp"].includes(candidate.zone?.kind)
      )
        supportedCategories.push("cargo");
      return {
        id: standId,
        slot,
        nodeId: candidate.node.id,
        apronTaxiwayId: candidate.edge.taxiwayId,
        terminal: candidate.parkingPosition?.terminal ?? standTerminal(candidate.zone),
        ...(candidate.parkingPosition?.terminalId
          ? { terminalId: candidate.parkingPosition.terminalId }
          : {}),
        ...(candidate.parkingPosition?.concourse
          ? { concourse: candidate.parkingPosition.concourse }
          : {}),
        ...(candidate.parkingPosition?.ref
          ? { gateRef: candidate.parkingPosition.ref }
          : {}),
        position: candidate.node.position,
        heading: round(heading, 6),
        zoneId: candidate.zone?.id ?? "ZONE-TERMINAL-COMPLEX",
        maximumWingspanM,
        supportedCategories,
        pushbackDirection: "straight",
        pushbackHeading: round(normalizeRadians(pushbackHeading), 6),
        rampNodeId: neighbor?.id ?? candidate.node.id,
        ...(candidate.parkingPosition
          ? {
              sourceParkingPositionId: `${candidate.parkingPosition.sourceType}/${candidate.parkingPosition.sourceElementId}`,
              ...(candidate.parkingPosition.sourceType === "node"
                ? { sourceParkingNodeId: candidate.parkingPosition.sourceElementId }
                : { sourceParkingWayId: candidate.parkingPosition.sourceElementId }),
              ...(candidate.parkingPosition.sourceGateNodeId
                ? { sourceGateNodeId: candidate.parkingPosition.sourceGateNodeId }
                : {}),
            }
          : candidate.source.parkingPosition
            ? { sourceParkingNodeId: candidate.source.id }
            : {}),
      };
    });
}

function parkingPositionHeading(parkingPosition, worldPosition) {
  const positionMeters = worldPosition.map(
    (value) => value * WORLD_METERS_PER_UNIT,
  );
  let nearest = null;
  for (let index = 0; index < parkingPosition.leadInMeters.length - 1; index += 1) {
    const from = parkingPosition.leadInMeters[index];
    const to = parkingPosition.leadInMeters[index + 1];
    const distance = pointSegmentDistance(positionMeters, from, to);
    if (!nearest || distance < nearest.distance)
      nearest = { from, to, distance };
  }
  return nearest
    ? Math.atan2(nearest.to[1] - nearest.from[1], nearest.to[0] - nearest.from[0])
    : null;
}

function graphPassengerFacilities(surface, stands) {
  return surface.passengerFacilities.map((facility) => ({
    ...facility,
    center: roundPoint(
      facility.centerMeters.map((value) => value / WORLD_METERS_PER_UNIT),
      3,
    ),
    standIds: stands
      .filter((stand) =>
        facility.kind === "terminal"
          ? stand.terminalId === facility.terminalId
          : stand.concourse === facility.concourse,
      )
      .map((stand) => stand.id),
  })).map(({ centerMeters: _centerMeters, ...facility }) => facility);
}

function uniqueCandidates(candidates) {
  const byNode = new Map();
  for (const candidate of candidates) byNode.set(candidate.node.id, candidate);
  return [...byNode.values()];
}

function chooseRunwayAccessNode(
  runwayIndex,
  end,
  runway,
  feature,
  nodeMap,
  edges,
  nodeMeters,
) {
  const direction = [Math.cos(runway.heading), Math.sin(runway.heading)];
  const targetAlong = end * (runway.length / 2 - 8);
  const candidates = new Map();
  for (const edge of edges.filter((candidate) => candidate.runwayId === runwayIndex)) {
    for (const nodeId of [edge.from, edge.to]) {
      const node = [...nodeMap.values()].find((candidate) => candidate.id === nodeId);
      if (!node || typeof node.sourceNodeId !== "number") continue;
      const meters = nodeMeters.get(node.sourceNodeId);
      if (pointInGeometry(meters, feature.geometry)) continue;
      const relative = [
        node.position[0] - runway.center[0],
        node.position[1] - runway.center[1],
      ];
      const along = relative[0] * direction[0] + relative[1] * direction[1];
      const across = Math.abs(
        relative[0] * -direction[1] + relative[1] * direction[0],
      );
      candidates.set(node.id, {
        node,
        score: Math.abs(along - targetAlong) + across * 0.08,
      });
    }
  }
  const selected = [...candidates.values()].sort(
    (first, second) => first.score - second.score,
  )[0]?.node;
  if (!selected)
    throw new Error(`No OSM access node found for runway ${runway.runwayId}`);
  return selected;
}

function segmentRunwayCrossings(start, end, runwayFeatures) {
  const length = distance2d(start, end);
  const samples = Math.max(1, Math.ceil(length / 8));
  const crossings = new Map();
  for (let sample = 0; sample <= samples; sample += 1) {
    const amount = sample / samples;
    const point = [
      start[0] + (end[0] - start[0]) * amount,
      start[1] + (end[1] - start[1]) * amount,
    ];
    for (const crossing of runwayFeatures.filter(
      ({ feature }) => feature && pointInGeometry(point, feature.geometry),
    ))
      crossings.set(crossing.index, crossing);
  }
  return [...crossings.values()].sort((first, second) => first.index - second.index);
}

function segmentLayerClearance(start, end, features, stepMeters) {
  const length = distance2d(start, end);
  const samples = Math.max(1, Math.ceil(length / stepMeters));
  let minimum = Infinity;
  for (let sample = 0; sample <= samples; sample += 1) {
    const amount = sample / samples;
    const point = [
      start[0] + (end[0] - start[0]) * amount,
      start[1] + (end[1] - start[1]) * amount,
    ];
    for (const feature of features) {
      if (pointInGeometry(point, feature.geometry)) return 0;
      minimum = Math.min(minimum, distanceToGeometryBoundary(point, feature.geometry));
    }
  }
  return minimum;
}

function distanceToGeometryBoundary(point, geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let minimum = Infinity;
  for (const polygon of polygons)
    for (const ring of polygon)
      for (let index = 0; index < ring.length - 1; index += 1)
        minimum = Math.min(
          minimum,
          pointSegmentDistance(point, ring[index], ring[index + 1]),
        );
  return minimum;
}

function pointInLayer(point, features) {
  return features.some((feature) => pointInGeometry(point, feature.geometry));
}

function pointInGeometry(point, geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => {
    if (!pointInRing(point, polygon[0])) return false;
    return !polygon.slice(1).some((hole) => pointInRing(point, hole));
  });
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    if (
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi
    )
      inside = !inside;
  }
  return inside;
}

function pointInRings(point, rings) {
  if (!rings?.length || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((ring) => pointInRing(point, ring));
}

function geometryRings(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates;
  return geometry.coordinates.flatMap((polygon) => polygon);
}

function operationalZoneForPoint(zones, point) {
  const surfaceZones = zones.filter(
    (zone) => zone.rings.length && zone.kind !== "terminal-complex",
  );
  const containing = surfaceZones
    .filter((zone) => pointInRings(point, zone.rings))
    .sort((first, second) => ringsArea(first.rings) - ringsArea(second.rings));
  if (containing.length) return containing[0];
  return surfaceZones
    .filter((zone) => zone.classification === "derived")
    .map((zone) => ({ zone, distance: distance2d(point, polygonCentroid(zone.rings[0])) }))
    .sort((first, second) => first.distance - second.distance)[0]?.zone;
}

function standTerminal(zone) {
  if (zone?.kind === "terminal-apron") return "TERMINAL";
  if (zone?.kind === "cargo-ramp") return "CARGO";
  if (zone?.kind === "general-aviation") return "GA";
  if (zone?.kind === "maintenance") return "MAINTENANCE";
  return "REMOTE";
}

function graphNodeById(nodeMap, nodeId) {
  let index = graphNodeIndexes.get(nodeMap);
  if (!index) {
    index = new Map([...nodeMap.values()].map((node) => [node.id, node]));
    graphNodeIndexes.set(nodeMap, index);
  }
  if (index.has(nodeId)) return index.get(nodeId);
  const node = [...nodeMap.values()].find((candidate) => candidate.id === nodeId);
  if (node) index.set(nodeId, node);
  return node;
}

function midpoint(first, second) {
  return [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2];
}

function polygonCentroid(points) {
  const vertices = points.length > 1 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]
    ? points.slice(0, -1)
    : points;
  if (!vertices.length) return [0, 0];
  return [
    vertices.reduce((sum, point) => sum + point[0], 0) / vertices.length,
    vertices.reduce((sum, point) => sum + point[1], 0) / vertices.length,
  ];
}

function ringsArea(rings) {
  return rings.reduce((total, ring) => total + Math.abs(polygonArea(ring)), 0);
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length - 1; index += 1)
    area += points[index][0] * points[index + 1][1] - points[index + 1][0] * points[index][1];
  return area / 2;
}

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeRadians(value) {
  let result = value % (Math.PI * 2);
  if (result > Math.PI) result -= Math.PI * 2;
  if (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function logicalTaxiwayId(edge) {
  const prefix = edge.kind === "taxilane" ? "RAMP" : "TWY";
  return edge.ref
    ? `${prefix}-${sanitize(edge.ref)}`
    : `${prefix}-OSM-${edge.wayId}`;
}

function logicalTaxiwayName(edge) {
  if (edge.name) return edge.name;
  if (edge.ref)
    return edge.kind === "taxilane"
      ? `Ramp lane ${edge.ref}`
      : `Taxiway ${edge.ref}`;
  return edge.kind === "taxilane"
    ? `Ramp connector ${edge.wayId}`
    : `Taxiway connector ${edge.wayId}`;
}

function nodeDegrees(edges) {
  const degree = new Map();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  return degree;
}

function runwayEnd(runway, end) {
  return [
    runway.center[0] + Math.cos(runway.heading) * end * runway.length / 2,
    runway.center[1] + Math.sin(runway.heading) * end * runway.length / 2,
  ];
}

function projectPoint([longitude, latitude], coordinateSystem) {
  const [originLongitude, originLatitude] = coordinateSystem.originWgs84;
  const radians = Math.PI / 180;
  const x =
    coordinateSystem.earthRadiusMeters *
    (longitude - originLongitude) *
    radians *
    Math.cos(originLatitude * radians);
  const y =
    coordinateSystem.earthRadiusMeters *
    (latitude - originLatitude) *
    radians;
  return roundPoint([x, y], 1);
}

function unprojectPoint([x, y], coordinateSystem) {
  const [originLongitude, originLatitude] = coordinateSystem.originWgs84;
  const degrees = 180 / Math.PI;
  return [
    originLongitude +
      (x /
        (coordinateSystem.earthRadiusMeters *
          Math.cos((originLatitude * Math.PI) / 180))) *
        degrees,
    originLatitude + (y / coordinateSystem.earthRadiusMeters) * degrees,
  ];
}

function boundsForPoints(points) {
  return {
    min: [
      Math.min(...points.map((point) => point[0])),
      Math.min(...points.map((point) => point[1])),
    ],
    max: [
      Math.max(...points.map((point) => point[0])),
      Math.max(...points.map((point) => point[1])),
    ],
  };
}

function pointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const denominator = dx * dx + dy * dy;
  const amount = denominator
    ? Math.max(
        0,
        Math.min(
          1,
          ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
            denominator,
        ),
      )
    : 0;
  return Math.hypot(
    point[0] - (start[0] + dx * amount),
    point[1] - (start[1] + dy * amount),
  );
}

function addSetValue(map, key, value) {
  const values = map.get(key) ?? new Set();
  values.add(value);
  map.set(key, values);
}

function addArrayValue(map, key, value) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function cleanTag(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function parsePositiveNumber(value) {
  const number = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sanitize(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function distance2d(first, second) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function roundPoint(point, decimalPlaces) {
  return point.map((value) => round(value, decimalPlaces));
}

function round(value, decimalPlaces) {
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function writeGenerated(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SCHEMA_VERSION = 1;
const WORLD_METERS_PER_UNIT = 38;
const OSM_LICENSE = "Open Data Commons Open Database License 1.0";
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
const DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter";
const MINIMUM_BUILDING_CLEARANCE_METERS = 51;

async function main() {
  const options = parseArguments(process.argv.slice(2));
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
    normalized = {
      nodes: cached.nodes,
      ways: cached.ways,
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
    excludedWays: graphBuild.excludedWays,
    excludedSegments: graphBuild.excludedSegments,
    validationRules: {
      minimumBuildingClearanceMeters: MINIMUM_BUILDING_CLEARANCE_METERS,
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
    validationRules: asset.validationRules,
    counts: {
      sourceNodes: normalized.nodes.length,
      sourceWays: normalized.ways.length,
      excludedWays: graphBuild.excludedWays.length,
      excludedSegments: graphBuild.excludedSegments.length,
      graphNodes: graph.nodes.length,
      graphEdges: graph.edges.length,
      taxiways: graph.taxiways.length,
      stands: graph.stands.length,
      runwayAccess: graph.runwayAccess.length,
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
  return `[out:json][timeout:120];(way(${box})["aeroway"~"^(taxiway|taxilane|runway)$"];node(${box})["aeroway"="parking_position"];);out body;>;out skel qt;`;
}

async function fetchOverpass(endpoint, query) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "AirportAutoDataImporter/1.0",
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!response.ok)
    throw new Error(
      `${response.status} ${response.statusText} from ${endpoint}: ${(await response.text()).slice(0, 300)}`,
    );
  const data = await response.json();
  if (!Array.isArray(data.elements))
    throw new Error("Overpass response has no elements array");
  return data;
}

function normalizeOverpass(response, faa, options, query) {
  const rawNodes = new Map(
    response.elements
      .filter((element) => element.type === "node")
      .map((node) => [node.id, node]),
  );
  const rawWays = response.elements.filter(
    (element) =>
      element.type === "way" &&
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
  const usedNodeIds = new Set(ways.flatMap((way) => way.nodeIds));
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
  return {
    nodes,
    ways,
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
      taxiway = { id: taxiwayId, name: taxiwayName, edgeIds: [] };
      taxiwayMap.set(taxiwayId, taxiway);
    }
    taxiway.edgeIds.push(edge.id);
    for (const node of [from, to])
      if (!node.taxiwayIds.includes(taxiwayId)) node.taxiwayIds.push(taxiwayId);
  }

  const degree = nodeDegrees(edges);
  for (const node of nodeMap.values())
    if ((degree.get(node.id) ?? 0) >= 3) node.kind = "intersection";
  const stands = selectStands(
    nodeMap,
    edges,
    degree,
    surface,
    faa,
    48,
  );
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
  return {
    excludedWays,
    excludedSegments,
    graph: {
      schemaVersion: 1,
      airportCode: "ORD",
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
      runwayAccess,
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

function selectStands(nodeMap, edges, degree, surface, faa, maximum) {
  const sourceNodeById = new Map(surface.nodes.map((node) => [node.id, node]));
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
    if (typeof node.sourceNodeId !== "number") continue;
    if ((degree.get(node.id) ?? 0) !== 1) continue;
    const source = sourceNodeById.get(node.sourceNodeId);
    if (!source) continue;
    const positionMeters = source.positionMeters;
    const distance = distance2d(positionMeters, terminalMeters);
    const connectedEdges = edgeByNode.get(node.id) ?? [];
    const candidate = { node, source, edge: connectedEdges[0], distance };
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
  const candidates = primary.length >= 24
    ? primary
    : uniqueCandidates([...primary, ...fallback, ...airportWideEndpoints]);
  candidates.sort(
    (first, second) =>
      first.distance - second.distance ||
      first.source.id - second.source.id,
  );
  const selected = [];
  for (const minimumSpacing of [2.4, 2.1, 1.8]) {
    for (const candidate of candidates) {
      if (selected.includes(candidate)) continue;
      if (
        selected.every(
          (other) =>
            distance2d(candidate.node.position, other.node.position) >=
            minimumSpacing,
        )
      )
        selected.push(candidate);
      if (selected.length >= maximum) break;
    }
    if (selected.length >= 24 || selected.length >= maximum) break;
  }
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
      const standId = `ORD-${String(slot + 1).padStart(2, "0")}`;
      candidate.node.kind = "stand";
      candidate.node.standId = standId;
      const neighborId =
        candidate.edge.from === candidate.node.id
          ? candidate.edge.to
          : candidate.edge.from;
      const neighbor = nodeMap.get(
        [...nodeMap.keys()].find((id) => nodeMap.get(id).id === neighborId),
      );
      const heading = neighbor
        ? Math.atan2(
            candidate.node.position[1] - neighbor.position[1],
            candidate.node.position[0] - neighbor.position[0],
          )
        : 0;
      return {
        id: standId,
        slot,
        nodeId: candidate.node.id,
        apronTaxiwayId: candidate.edge.taxiwayId,
        terminal: "MAIN",
        position: candidate.node.position,
        heading: round(heading, 6),
      };
    });
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

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const paths = {
  faa: path.resolve("public/data/airports/KORD.vector.json"),
  faaManifest: path.resolve("src/data/airports/KORD.manifest.json"),
  osm: path.resolve("public/data/airports/KORD.osm-surface.json"),
  graph: path.resolve("src/data/airports/KORD.surfaceGraph.json"),
  manifest: path.resolve("src/data/airports/KORD.surface.manifest.json"),
};
const [faaText, faaManifestText, osmText, graphText, manifestText] =
  await Promise.all(
    Object.values(paths).map((filePath) => readFile(filePath, "utf8")),
  );
const faa = JSON.parse(faaText);
const faaManifest = JSON.parse(faaManifestText);
const osm = JSON.parse(osmText);
const graph = JSON.parse(graphText);
const manifest = JSON.parse(manifestText);
const errors = [];

check(faaManifest.assetSha256 === sha256(faaText), "FAA checksum mismatch");
check(manifest.assetSha256 === sha256(osmText), "OSM surface checksum mismatch");
check(manifest.graphSha256 === sha256(graphText), "surface graph checksum mismatch");
check(osm.airport?.icaoId === "KORD", "OSM asset is not for KORD");
check(graph.airportCode === "ORD", "surface graph is not for ORD");
check(osm.schemaVersion === 3, "OSM surface schemaVersion must be 3");
check(graph.schemaVersion === 3, "surface graph schemaVersion must be 3");
check(manifest.schemaVersion === 3, "surface manifest schemaVersion must be 3");
check(
  osm.source?.license === "Open Data Commons Open Database License 1.0",
  "OSM ODbL license is missing",
);
check(
  String(osm.source?.attribution).includes("OpenStreetMap contributors"),
  "OSM attribution is missing",
);
check(
  osm.coordinateSystem?.originWgs84?.join(":") ===
    faa.coordinateSystem.originWgs84.join(":"),
  "FAA and OSM assets use different local origins",
);
const minimumBuildingClearanceMeters =
  osm.validationRules?.minimumBuildingClearanceMeters;
check(
  minimumBuildingClearanceMeters === 51,
  "surface asset must declare the 51 m FAA-building clearance rule",
);
check(
  manifest.validationRules?.minimumBuildingClearanceMeters ===
    minimumBuildingClearanceMeters,
  "surface manifest building-clearance rule differs from the asset",
);
check(
  osm.validationRules?.minimumStandReferenceClearanceMeters === 42,
  "gate stands must declare the 42 m aircraft-reference clearance rule",
);
check(
  osm.validationRules?.minimumStandReferenceOffsetMeters === 24,
  "gate stands must declare the 24 m nose-wheel-stop offset rule",
);
check(
  osm.validationRules?.standLeadInWidthWorld === 0.7,
  "gate stands must declare the 0.7-world-unit lead-in width",
);

const sourceNodes = new Map();
for (const node of osm.nodes ?? []) {
  check(!sourceNodes.has(node.id), `duplicate OSM source node ${node.id}`);
  sourceNodes.set(node.id, node);
  validatePoint(node.positionMeters, `OSM node ${node.id}`);
}
const sourceWays = new Map();
for (const way of osm.ways ?? []) {
  check(!sourceWays.has(way.id), `duplicate OSM source way ${way.id}`);
  sourceWays.set(way.id, way);
  check(
    ["taxiway", "taxilane", "runway"].includes(way.kind),
    `OSM way ${way.id} has unknown kind ${way.kind}`,
  );
  check(
    Array.isArray(way.nodeIds) && way.nodeIds.length >= 2,
    `OSM way ${way.id} has fewer than two nodes`,
  );
  for (const nodeId of way.nodeIds)
    check(sourceNodes.has(nodeId), `OSM way ${way.id} references node ${nodeId}`);
}

const sourceGates = new Map();
for (const gate of osm.gates ?? []) {
  check(!sourceGates.has(gate.id), `duplicate OSM gate node ${gate.id}`);
  sourceGates.set(gate.id, gate);
  check(String(gate.ref).trim(), `OSM gate ${gate.id} has no reference`);
  validatePoint(gate.positionMeters, `OSM gate ${gate.id}`);
}
const sourceParkingPositions = new Map();
for (const position of osm.parkingPositions ?? []) {
  const id = `${position.sourceType}/${position.sourceElementId}`;
  check(!sourceParkingPositions.has(id), `duplicate OSM parking position ${id}`);
  sourceParkingPositions.set(id, position);
  check(["node", "way"].includes(position.sourceType), `parking position ${id} has invalid source type`);
  validatePoint(position.positionMeters, `parking position ${id}`);
  check(Array.isArray(position.leadInMeters) && position.leadInMeters.length, `parking position ${id} has no lead-in geometry`);
  for (const point of position.leadInMeters ?? []) validatePoint(point, `parking position ${id} lead-in`);
  if (position.sourceGateNodeId !== undefined)
    check(sourceGates.has(position.sourceGateNodeId), `parking position ${id} references missing gate ${position.sourceGateNodeId}`);
}
check(sourceGates.size >= 190, `expected at least 190 sourced gates, found ${sourceGates.size}`);
check(sourceParkingPositions.size >= 200, `expected at least 200 sourced parking positions, found ${sourceParkingPositions.size}`);
check(osm.passengerFacilityReference?.provider === "Chicago Department of Aviation", "official passenger-facility provider is missing");
check(osm.passengerFacilityReference?.totalPassengerGates === 199, "official ORD passenger-gate total must be 199");
check(manifest.passengerFacilityReference?.url === osm.passengerFacilityReference?.url, "manifest passenger-facility source differs");

const nodes = new Map();
for (const node of graph.nodes ?? []) {
  check(!nodes.has(node.id), `duplicate graph node ${node.id}`);
  nodes.set(node.id, node);
  validatePoint(node.position, `graph node ${node.id}`);
  if (node.sourceNodeId !== undefined)
    check(
      sourceNodes.has(node.sourceNodeId),
      `graph node ${node.id} references missing source node ${node.sourceNodeId}`,
    );
  if (node.sourceParkingPositionId !== undefined)
    check(
      sourceParkingPositions.has(node.sourceParkingPositionId),
      `graph node ${node.id} references missing parking position ${node.sourceParkingPositionId}`,
    );
}
const edges = new Map();
const endpointPairs = new Set();
const representedWays = new Set();
let crossingEdges = 0;
for (const edge of graph.edges ?? []) {
  check(!edges.has(edge.id), `duplicate graph edge ${edge.id}`);
  edges.set(edge.id, edge);
  check(nodes.has(edge.from), `edge ${edge.id} has missing from node ${edge.from}`);
  check(nodes.has(edge.to), `edge ${edge.id} has missing to node ${edge.to}`);
  check(edge.from !== edge.to, `edge ${edge.id} has identical endpoints`);
  const pair = [edge.from, edge.to].sort().join(":");
  check(!endpointPairs.has(pair), `duplicate graph segment ${pair}`);
  endpointPairs.add(pair);
  check(
    ["runway", "runway-access", "taxiway", "apron", "stand-lead-in"].includes(
      edge.kind,
    ),
    `edge ${edge.id} has unknown kind ${edge.kind}`,
  );
  check(
    Number.isFinite(edge.width)
      && edge.width >= (edge.kind === "stand-lead-in" ? 0.55 : 1.8),
    `edge ${edge.id} has undersized width ${edge.width}`,
  );
  const from = nodes.get(edge.from)?.position;
  const to = nodes.get(edge.to)?.position;
  if (from && to)
    check(
      distance(from, to) > 0.001,
      `edge ${edge.id} has zero geometric length`,
    );
  const sourceWayIds = edge.sourceWayIds ?? (edge.sourceWayId ? [edge.sourceWayId] : []);
  for (const wayId of sourceWayIds) {
    representedWays.add(wayId);
    check(sourceWays.has(wayId), `edge ${edge.id} references missing OSM way ${wayId}`);
  }
  const sourceGrade = sourceWayIds.some((wayId) => sourceWays.get(wayId)?.bridge)
    ? "bridge"
    : sourceWayIds.some((wayId) => sourceWays.get(wayId)?.tunnel)
      ? "tunnel"
      : undefined;
  check(
    edge.gradeSeparation === sourceGrade,
    `edge ${edge.id} grade separation ${edge.gradeSeparation ?? "none"} differs from source ${sourceGrade ?? "none"}`,
  );
  if (edge.sourceWayId) {
    const geometricCrossings = edgeRunwayCrossings(edge, nodes, faa);
    const declaredCrossings = [...(edge.crossedRunwayIds ?? [])].sort(
      (first, second) => first - second,
    );
    check(
      JSON.stringify(geometricCrossings) === JSON.stringify(declaredCrossings),
      `edge ${edge.id} declares runway crossings ${declaredCrossings.join(",")} but geometry crosses ${geometricCrossings.join(",")}`,
    );
    check(
      geometricCrossings.length === 0 || edge.kind === "runway-access",
      `edge ${edge.id} crosses a runway without runway-access protection`,
    );
    if (geometricCrossings.length) crossingEdges += 1;
    check(
      !segmentIntersectsLayer(
        from.map((value) => value * 38),
        to.map((value) => value * 38),
        faa.layers.buildings,
        4,
      ),
      `edge ${edge.id} intersects an FAA building footprint`,
    );
    const buildingClearance = segmentLayerClearance(
      from.map((value) => value * 38),
      to.map((value) => value * 38),
      faa.layers.buildings,
      8,
    );
    check(
      buildingClearance + 0.2 >= minimumBuildingClearanceMeters,
      `edge ${edge.id} has only ${buildingClearance.toFixed(1)} m FAA-building clearance`,
    );
  }
}

const excludedWays = new Set((osm.excludedWays ?? []).map((item) => item.id));
for (const way of osm.ways.filter(
  (item) => item.kind === "taxiway" || item.kind === "taxilane",
))
  check(
    representedWays.has(way.id) || excludedWays.has(way.id),
    `routable OSM way ${way.id} is neither represented nor explicitly excluded`,
  );
for (const excluded of osm.excludedSegments ?? []) {
  check(
    sourceWays.has(excluded.wayId),
    `excluded segment references missing way ${excluded.wayId}`,
  );
  check(
    excluded.reason === "intersects-faa-building" ||
      excluded.reason === "insufficient-faa-building-clearance",
    `excluded segment ${excluded.wayId} has unexplained reason ${excluded.reason}`,
  );
}

const taxiways = new Map();
for (const taxiway of graph.taxiways ?? []) {
  check(!taxiways.has(taxiway.id), `duplicate taxiway ${taxiway.id}`);
  taxiways.set(taxiway.id, taxiway);
  check(String(taxiway.name).trim(), `taxiway ${taxiway.id} has no name`);
  check(
    ["taxiway", "taxilane", "procedural"].includes(taxiway.sourceKind),
    `taxiway ${taxiway.id} has unknown source kind ${taxiway.sourceKind}`,
  );
  if (taxiway.reference !== undefined)
    check(String(taxiway.reference).trim(), `taxiway ${taxiway.id} has an empty reference`);
  for (const edgeId of taxiway.edgeIds)
    check(edges.has(edgeId), `taxiway ${taxiway.id} references edge ${edgeId}`);
}
for (const edge of edges.values())
  if (edge.taxiwayId)
    check(
      taxiways.get(edge.taxiwayId)?.edgeIds.includes(edge.id),
      `edge ${edge.id} is not registered by taxiway ${edge.taxiwayId}`,
    );
for (const reference of ["A", "B", "C", "G", "M", "N", "V", "Y"])
  check(
    [...taxiways.values()].some((taxiway) => taxiway.reference === reference),
    `major named taxiway ${reference} is missing`,
  );

const zones = new Map();
const validZoneKinds = new Set([
  "terminal-complex",
  "terminal-apron",
  "cargo-ramp",
  "general-aviation",
  "deicing-pad",
  "holding-pad",
  "maintenance",
  "remote-ramp",
  "perimeter-route",
]);
const sourceFacilityIds = new Set([
  ...faa.runtimeReference.aprons.map((apron) => apron.id),
  ...faa.runtimeReference.obstacles.map((obstacle) => obstacle.id),
]);
for (const zone of graph.zones ?? []) {
  check(!zones.has(zone.id), `duplicate operational zone ${zone.id}`);
  zones.set(zone.id, zone);
  check(validZoneKinds.has(zone.kind), `zone ${zone.id} has unknown kind ${zone.kind}`);
  check(String(zone.name).trim(), `zone ${zone.id} has no name`);
  check(["published", "derived"].includes(zone.classification), `zone ${zone.id} has unknown classification`);
  for (const sourceFeatureId of zone.sourceFeatureIds)
    check(sourceFacilityIds.has(sourceFeatureId), `zone ${zone.id} references missing FAA feature ${sourceFeatureId}`);
  for (const edgeId of zone.edgeIds)
    check(edges.has(edgeId), `zone ${zone.id} references missing edge ${edgeId}`);
  for (const ring of zone.rings)
    for (const point of ring) validatePoint(point, `zone ${zone.id} ring point`);
}
for (const kind of validZoneKinds)
  check(
    [...zones.values()].some((zone) => zone.kind === kind),
    `ORD operational zones do not include ${kind}`,
  );

const stands = graph.stands ?? [];
check(stands.length >= 24, `expected at least 24 stands, found ${stands.length}`);
const standIds = new Set();
const standNodes = new Set();
const categoryWingspans = new Map([
  ["regional", 28.7],
  ["narrowbody", 35.8],
  ["widebody", 64.8],
  ["cargo", 64.8],
]);
let minimumStandSpacing = Infinity;
for (const stand of stands) {
  check(!standIds.has(stand.id), `duplicate stand ${stand.id}`);
  check(!standNodes.has(stand.nodeId), `stand node ${stand.nodeId} is reused`);
  standIds.add(stand.id);
  standNodes.add(stand.nodeId);
  const node = nodes.get(stand.nodeId);
  check(node?.kind === "stand", `stand ${stand.id} has no stand node`);
  check(
    stand.position[0] === node?.position[0] &&
      stand.position[1] === node?.position[1],
    `stand ${stand.id} position differs from its node`,
  );
  check(nodes.has(stand.rampNodeId), `stand ${stand.id} has no ramp-access node`);
  check(
    [...edges.values()].some(
      (edge) =>
        (edge.from === stand.nodeId && edge.to === stand.rampNodeId)
        || (edge.to === stand.nodeId && edge.from === stand.rampNodeId),
    ),
    `stand ${stand.id} has no lead-in edge to ${stand.rampNodeId}`,
  );
  const zone = zones.get(stand.zoneId);
  check(zone, `stand ${stand.id} references missing zone ${stand.zoneId}`);
  check(zone?.standIds.includes(stand.id), `stand ${stand.id} is not registered by zone ${stand.zoneId}`);
  if (zone?.rings.length && zone.classification === "published")
    check(pointInRings(stand.position, zone.rings), `stand ${stand.id} lies outside zone ${stand.zoneId}`);
  check(Number.isFinite(stand.maximumWingspanM), `stand ${stand.id} has no wingspan limit`);
  check(
    Array.isArray(stand.supportedCategories) && stand.supportedCategories.length,
    `stand ${stand.id} has no compatible categories`,
  );
  for (const category of stand.supportedCategories ?? []) {
    check(categoryWingspans.has(category), `stand ${stand.id} has unknown category ${category}`);
    check(
      stand.maximumWingspanM >= (categoryWingspans.get(category) ?? Infinity),
      `stand ${stand.id} claims ${category} support above its wingspan limit`,
    );
  }
  check(
    ["left", "right", "straight"].includes(stand.pushbackDirection),
    `stand ${stand.id} has invalid pushback direction`,
  );
  check(Number.isFinite(stand.pushbackHeading), `stand ${stand.id} has invalid pushback heading`);
  if (stand.sourceParkingNodeId !== undefined)
    check(
      sourceNodes.get(stand.sourceParkingNodeId)?.parkingPosition,
      `stand ${stand.id} references a non-parking OSM node`,
    );
  if (stand.sourceParkingWayId !== undefined)
    check(
      sourceParkingPositions.has(`way/${stand.sourceParkingWayId}`),
      `stand ${stand.id} references missing parking way ${stand.sourceParkingWayId}`,
    );
  if (stand.sourceParkingPositionId !== undefined)
    check(
      sourceParkingPositions.has(stand.sourceParkingPositionId),
      `stand ${stand.id} references missing parking position ${stand.sourceParkingPositionId}`,
    );
  if (stand.sourceParkingPositionId !== undefined) {
    const sourceParking = sourceParkingPositions.get(stand.sourceParkingPositionId);
    const standMeters = stand.position.map((value) => value * 38);
    const leadInDistance = Math.min(
      ...(sourceParking?.leadInMeters ?? []).slice(1).map((point, index) =>
        pointSegmentDistance(standMeters, sourceParking.leadInMeters[index], point),
      ),
    );
    check(sourceParking?.sourceType === "way", `stand ${stand.id} is not derived from a directed parking way`);
    check(leadInDistance <= 0.1, `stand ${stand.id} aircraft reference is not on its sourced lead-in`);
    check(
      sourceParking && distance(standMeters, sourceParking.positionMeters) >= 23.9,
      `stand ${stand.id} incorrectly uses the OSM nose-wheel stop as its aircraft center`,
    );
  }
  if (stand.sourceGateNodeId !== undefined)
    check(sourceGates.has(stand.sourceGateNodeId), `stand ${stand.id} references missing gate ${stand.sourceGateNodeId}`);
  if (stand.concourse) {
    const expectedTerminal = new Map([
      ["B", "T1"], ["C", "T1"], ["E", "T2"], ["F", "T2"],
      ["G", "T3"], ["H", "T3"], ["K", "T3"], ["L", "T3"], ["M", "T5"],
    ]).get(stand.concourse);
    check(stand.terminalId === expectedTerminal, `stand ${stand.id} has inconsistent terminal/concourse identity`);
    check(String(stand.gateRef).startsWith(stand.concourse), `stand ${stand.id} gate reference does not match its concourse`);
    check(stand.sourceParkingPositionId, `passenger stand ${stand.id} has no sourced parking position`);
    check(stand.sourceGateNodeId !== undefined, `passenger stand ${stand.id} has no sourced gate`);
  }
}
for (const zone of zones.values())
  for (const standId of zone.standIds)
    check(standIds.has(standId), `zone ${zone.id} references missing stand ${standId}`);
for (const category of categoryWingspans.keys())
  check(
    stands.filter((stand) => stand.supportedCategories.includes(category)).length >= 2,
    `ORD has fewer than two ${category}-compatible stands`,
  );
for (const concourse of ["B", "C", "E", "F", "G", "H", "K", "L", "M"])
  check(
    stands.filter((stand) => stand.concourse === concourse).length >= 2,
    `ORD has fewer than two sampled stands for Concourse ${concourse}`,
  );
for (let first = 0; first < stands.length; first += 1)
  for (let second = first + 1; second < stands.length; second += 1)
    minimumStandSpacing = Math.min(
      minimumStandSpacing,
      distance(stands[first].position, stands[second].position),
    );
check(
  minimumStandSpacing >= 1.8,
  `stand spacing ${minimumStandSpacing.toFixed(3)} is undersized`,
);

const passengerFacilities = new Map();
for (const facility of graph.passengerFacilities ?? []) {
  check(!passengerFacilities.has(facility.id), `duplicate passenger facility ${facility.id}`);
  passengerFacilities.set(facility.id, facility);
  validatePoint(facility.center, `passenger facility ${facility.id}`);
  check(["terminal", "concourse"].includes(facility.kind), `passenger facility ${facility.id} has invalid kind`);
  check(Number.isInteger(facility.publishedGateCount) && facility.publishedGateCount > 0, `passenger facility ${facility.id} has no published gate count`);
  check(Array.isArray(facility.sourceElementIds) && facility.sourceElementIds.length, `passenger facility ${facility.id} has no source elements`);
  for (const standId of facility.standIds)
    check(standIds.has(standId), `passenger facility ${facility.id} references missing stand ${standId}`);
}
for (const terminal of ["T1", "T2", "T3", "T5"])
  check(passengerFacilities.has(`ORD-${terminal}`), `ORD passenger facility ${terminal} is missing`);
for (const concourse of ["B", "C", "E", "F", "G", "H", "K", "L", "M"])
  check(passengerFacilities.has(`ORD-CONCOURSE-${concourse}`), `ORD Concourse ${concourse} is missing`);
check(
  [...passengerFacilities.values()]
    .filter((facility) => facility.kind === "terminal")
    .reduce((total, facility) => total + facility.publishedGateCount, 0) === 199,
  "passenger terminal gate counts do not sum to the official 199-gate total",
);

check(
  graph.runwayAccess?.length === faa.runtimeReference.runways.length * 2,
  `expected ${faa.runtimeReference.runways.length * 2} runway access records`,
);
const accessKeys = new Set();
for (const access of graph.runwayAccess ?? []) {
  const key = `${access.runwayId}:${access.end}`;
  check(!accessKeys.has(key), `duplicate runway access ${key}`);
  accessKeys.add(key);
  check(nodes.has(access.thresholdNodeId), `${key} threshold node is missing`);
  check(nodes.has(access.exitNodeId), `${key} exit node is missing`);
  check(nodes.has(access.holdShortNodeId), `${key} hold-short node is missing`);
  check(taxiways.has(access.primaryTaxiwayId), `${key} primary taxiway is missing`);
  const runwayFeature = runwayFeatureForIndex(faa, access.runwayId);
  const hold = nodes.get(access.holdShortNodeId)?.position.map(
    (value) => value * 38,
  );
  check(
    hold && !pointInGeometry(hold, runwayFeature.geometry),
    `${key} hold-short point lies inside runway pavement`,
  );
}
const controlPoints = new Map();
const validControlKinds = new Set([
  "hold-short",
  "runway-entry",
  "runway-crossing",
  "line-up",
  "departure-release",
]);
for (const point of graph.controlPoints ?? []) {
  check(!controlPoints.has(point.id), `duplicate control point ${point.id}`);
  controlPoints.set(point.id, point);
  check(validControlKinds.has(point.kind), `control point ${point.id} has unknown kind ${point.kind}`);
  validatePoint(point.position, `control point ${point.id}`);
  check(faa.runtimeReference.runways[point.runwayId], `control point ${point.id} has invalid runway`);
  if (point.nodeId) {
    check(nodes.has(point.nodeId), `control point ${point.id} references missing node ${point.nodeId}`);
    check(
      JSON.stringify(nodes.get(point.nodeId)?.position) === JSON.stringify(point.position),
      `control point ${point.id} differs from node ${point.nodeId}`,
    );
  }
  if (point.edgeId) check(edges.has(point.edgeId), `control point ${point.id} references missing edge ${point.edgeId}`);
  if (point.kind === "hold-short") {
    const runwayFeature = runwayFeatureForIndex(faa, point.runwayId);
    check(
      !pointInGeometry(point.position.map((value) => value * 38), runwayFeature.geometry),
      `hold-short point ${point.id} lies inside runway pavement`,
    );
  }
}
for (const access of graph.runwayAccess ?? []) {
  for (const kind of ["hold-short", "runway-entry", "line-up", "departure-release"])
    check(
      [...controlPoints.values()].some(
        (point) => point.runwayId === access.runwayId && point.end === access.end && point.kind === kind,
      ),
      `runway ${access.runwayId}:${access.end} has no ${kind} control point`,
    );
}
const crossingIds = new Set(
  [...edges.values()].flatMap((edge) => edge.crossingIds ?? []),
);
for (const crossingId of crossingIds) {
  const points = [...controlPoints.values()].filter((point) => point.crossingId === crossingId);
  check(points.filter((point) => point.kind === "hold-short").length >= 2, `${crossingId} has fewer than two hold points`);
  check(points.filter((point) => point.kind === "runway-crossing").length >= 2, `${crossingId} has fewer than two crossing points`);
}
check(crossingIds.size >= 40, `only ${crossingIds.size} through-crossing groups have explicit control points`);

const hotspots = graph.hotspots ?? [];
check(hotspots.length === faa.layers.hotspots.length, "FAA hot-spot count differs from the surface graph");
for (const hotspot of hotspots) {
  const source = faa.layers.hotspots.find((feature) => feature.id === hotspot.sourceFeatureId);
  check(source, `hot spot ${hotspot.id} references missing FAA feature ${hotspot.sourceFeatureId}`);
  check(hotspot.description === source?.properties.description, `hot spot ${hotspot.id} description differs from FAA source`);
  check(hotspot.nodeIds.length > 0, `hot spot ${hotspot.id} contains no graph nodes`);
  check(hotspot.edgeIds.length > 0, `hot spot ${hotspot.id} contains no graph edges`);
  for (const nodeId of hotspot.nodeIds)
    check(nodes.has(nodeId), `hot spot ${hotspot.id} references missing node ${nodeId}`);
  for (const edgeId of hotspot.edgeIds)
    check(edges.has(edgeId), `hot spot ${hotspot.id} references missing edge ${edgeId}`);
}

const adjacency = buildAdjacency(graph.edges, true);
let routeChecks = 0;
const categoryTakeoffMeters = new Map([
  ["regional", 1_650],
  ["narrowbody", 2_250],
  ["widebody", 2_650],
  ["cargo", 3_050],
]);
for (const stand of stands) {
  const reachable = reachableNodes(adjacency, stand.nodeId);
  for (const access of graph.runwayAccess) {
    check(
      reachable.has(access.holdShortNodeId),
      `${stand.id} cannot reach runway ${access.runwayId}:${access.end}`,
    );
    routeChecks += 1;
  }
  for (const category of stand.supportedCategories) {
    const compatibleRunways = faa.runtimeReference.runways
      .map((runway, runwayId) => ({ ...runway, runwayId }))
      .filter((runway) => runway.role === "departure" || runway.role === "mixed")
      .filter((runway) => runway.sourceLengthMeters >= categoryTakeoffMeters.get(category));
    check(
      compatibleRunways.some((runway) =>
        graph.runwayAccess.some(
          (access) => access.runwayId === runway.runwayId && reachable.has(access.holdShortNodeId),
        )),
      `${stand.id} has no reachable ${category}-compatible departure runway`,
    );
  }
}
const reverseAdjacency = buildAdjacency(
  graph.edges.map((edge) => ({
    ...edge,
    from: edge.to,
    to: edge.from,
  })),
  true,
);
for (const stand of stands) {
  const reachable = reachableNodes(reverseAdjacency, stand.nodeId);
  for (const access of graph.runwayAccess) {
    check(
      reachable.has(access.exitNodeId),
      `runway ${access.runwayId}:${access.end} cannot reach ${stand.id}`,
    );
    routeChecks += 1;
  }
}

let sharpTurns = 0;
const incident = new Map();
for (const edge of graph.edges.filter((item) => item.kind !== "runway")) {
  addArray(incident, edge.from, edge);
  addArray(incident, edge.to, edge);
}
for (const [nodeId, connected] of incident) {
  if (connected.length !== 2 || nodes.get(nodeId)?.kind !== "taxiway") continue;
  const center = nodes.get(nodeId).position;
  const vectors = connected.map((edge) => {
    const other = nodes.get(edge.from === nodeId ? edge.to : edge.from).position;
    const length = distance(center, other);
    return [(other[0] - center[0]) / length, (other[1] - center[1]) / length];
  });
  const angle = Math.acos(
    Math.max(-1, Math.min(1, vectors[0][0] * vectors[1][0] + vectors[0][1] * vectors[1][1])),
  );
  if (angle < Math.PI / 12) sharpTurns += 1;
}
check(sharpTurns === 0, `${sharpTurns} degree-two nodes require an impossible reversal`);

check(manifest.counts.sourceNodes === osm.nodes.length, "manifest source-node count differs");
check(manifest.counts.sourceWays === osm.ways.length, "manifest source-way count differs");
check(manifest.counts.parkingPositions === sourceParkingPositions.size, "manifest parking-position count differs");
check(manifest.counts.gates === sourceGates.size, "manifest gate count differs");
check(manifest.counts.passengerFacilities === (osm.passengerFacilities ?? []).length, "manifest passenger-facility count differs");
check(manifest.counts.graphNodes === graph.nodes.length, "manifest graph-node count differs");
check(manifest.counts.graphEdges === graph.edges.length, "manifest graph-edge count differs");
check(manifest.counts.stands === stands.length, "manifest stand count differs");
check(manifest.counts.passengerStands === stands.filter((stand) => stand.concourse).length, "manifest passenger-stand count differs");
check(manifest.counts.controlPoints === controlPoints.size, "manifest control-point count differs");
check(manifest.counts.operationalZones === zones.size, "manifest operational-zone count differs");
check(manifest.counts.hotspots === hotspots.length, "manifest hot-spot count differs");
check(
  manifest.counts.gradeSeparatedEdges === graph.edges.filter((edge) => edge.gradeSeparation).length,
  "manifest grade-separated edge count differs",
);
check(
  manifest.counts.runwayCrossingEdges === crossingEdges,
  "manifest crossing-edge count differs",
);

if (errors.length) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `KORD imported surface graph valid: ${nodes.size} nodes, ${edges.size} edges, ${taxiways.size} named/source routes, ${stands.length} compatible stands across ${passengerFacilities.size} passenger facilities, ${zones.size} operational zones, ${controlPoints.size} control points, ${hotspots.length} FAA hot spots, ${crossingEdges} protected crossing edges, ${routeChecks} stand/runway routes\n`,
  );
}

function edgeRunwayCrossings(edge, nodeMap, faaAsset) {
  const from = nodeMap.get(edge.from).position.map((value) => value * 38);
  const to = nodeMap.get(edge.to).position.map((value) => value * 38);
  const length = distance(from, to);
  const samples = Math.max(1, Math.ceil(length / 8));
  const crossings = new Set();
  for (let sample = 0; sample <= samples; sample += 1) {
    const amount = sample / samples;
    const point = [
      from[0] + (to[0] - from[0]) * amount,
      from[1] + (to[1] - from[1]) * amount,
    ];
    for (let index = 0; index < faaAsset.runtimeReference.runways.length; index += 1)
      if (pointInGeometry(point, runwayFeatureForIndex(faaAsset, index).geometry))
        crossings.add(index);
  }
  return [...crossings].sort((first, second) => first - second);
}

function runwayFeatureForIndex(faaAsset, index) {
  const runwayId = faaAsset.runtimeReference.runways[index]?.runwayId;
  return faaAsset.layers.runways.find(
    (feature) => feature.properties.runwayId === runwayId,
  );
}

function buildAdjacency(edgeList, excludeRunways) {
  const adjacency = new Map();
  for (const edge of edgeList) {
    if (excludeRunways && edge.kind === "runway") continue;
    addArray(adjacency, edge.from, edge.to);
    if (edge.direction === "both") addArray(adjacency, edge.to, edge.from);
  }
  return adjacency;
}

function reachableNodes(adjacency, start) {
  const reachable = new Set([start]);
  const pending = [start];
  while (pending.length) {
    const current = pending.pop();
    for (const next of adjacency.get(current) ?? []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      pending.push(next);
    }
  }
  return reachable;
}

function segmentIntersectsLayer(start, end, features, stepMeters) {
  const length = distance(start, end);
  const samples = Math.max(1, Math.ceil(length / stepMeters));
  for (let sample = 0; sample <= samples; sample += 1) {
    const amount = sample / samples;
    const point = [
      start[0] + (end[0] - start[0]) * amount,
      start[1] + (end[1] - start[1]) * amount,
    ];
    if (features.some((feature) => pointInGeometry(point, feature.geometry)))
      return true;
  }
  return false;
}

function segmentLayerClearance(start, end, features, stepMeters) {
  const length = distance(start, end);
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

function pointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return distance(point, start);
  const amount = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared),
  );
  return distance(point, [start[0] + dx * amount, start[1] + dy * amount]);
}

function pointInGeometry(point, geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(
    (polygon) =>
      pointInRing(point, polygon[0]) &&
      !polygon.slice(1).some((ring) => pointInRing(point, ring)),
  );
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
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

function addArray(map, key, value) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function validatePoint(point, label) {
  check(
    Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
    `${label} is not a finite x/y pair`,
  );
}

function distance(first, second) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function sha256(text) {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

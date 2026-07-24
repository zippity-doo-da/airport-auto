import type { AirportConfig, RunwayConfig } from './airportConfig';

export type SurfaceNodeKind =
  | 'runway-threshold'
  | 'runway-exit'
  | 'hold-short'
  | 'taxiway'
  | 'intersection'
  | 'apron-entry'
  | 'stand';

export type SurfaceEdgeKind = 'runway' | 'runway-access' | 'taxiway' | 'apron' | 'stand-lead-in';
export type SurfaceEdgeDirection = 'both' | 'forward';

export interface SurfaceNode {
  id: string;
  kind: SurfaceNodeKind;
  position: [number, number];
  taxiwayIds: string[];
  runwayId?: number;
  standId?: string;
}

export interface SurfaceEdge {
  id: string;
  from: string;
  to: string;
  kind: SurfaceEdgeKind;
  name: string;
  direction: SurfaceEdgeDirection;
  width: number;
  taxiwayId?: string;
  runwayId?: number;
}

export interface SurfaceTaxiway {
  id: string;
  name: string;
  edgeIds: string[];
}

export interface SurfaceStand {
  id: string;
  slot: number;
  nodeId: string;
  apronTaxiwayId: string;
  terminal: 'MAIN';
  position: [number, number];
  heading: number;
}

export interface RunwaySurfaceAccess {
  runwayId: number;
  end: -1 | 1;
  thresholdNodeId: string;
  exitNodeId: string;
  holdShortNodeId: string;
  primaryTaxiwayId: string;
}

export interface AirportSurfaceGraph {
  schemaVersion: 1;
  airportCode: string;
  seed: number;
  nodes: SurfaceNode[];
  edges: SurfaceEdge[];
  taxiways: SurfaceTaxiway[];
  stands: SurfaceStand[];
  runwayAccess: RunwaySurfaceAccess[];
}

export interface SurfaceRoute {
  nodeIds: string[];
  edgeIds: string[];
  distance: number;
  taxiwayIds: string[];
}

export interface SurfaceRouteSample {
  x: number;
  y: number;
  heading: number;
  distanceAlong: number;
  totalDistance: number;
  edgeIndex: number;
  edgeProgress: number;
  fromNodeId: string;
  toNodeId: string;
  nearestNodeId: string;
  edge?: SurfaceEdge;
}

export interface SurfaceGraphValidation {
  valid: boolean;
  errors: string[];
  counts: {
    nodes: number;
    edges: number;
    taxiways: number;
    stands: number;
    intersections: number;
    holdShorts: number;
  };
}

type SurfaceGraphConfig = Pick<AirportConfig, 'code' | 'seed' | 'scope' | 'terminal' | 'runways'>;
type Point = [number, number];

const ROUNDING = 1_000;

export function buildAirportSurfaceGraph(config: SurfaceGraphConfig): AirportSurfaceGraph {
  const nodes: SurfaceNode[] = [];
  const edges: SurfaceEdge[] = [];
  const stands: SurfaceStand[] = [];
  const runwayAccess: RunwaySurfaceAccess[] = [];
  const nodeById = new Map<string, SurfaceNode>();
  const nodeByCoordinate = new Map<string, SurfaceNode>();
  const edgeByKey = new Map<string, SurfaceEdge>();
  const taxiwayById = new Map<string, SurfaceTaxiway>();
  let waypointSequence = 1;
  let edgeSequence = 1;

  const coordinateKey = ([x, y]: Point): string => `${Math.round(x * ROUNDING)}:${Math.round(y * ROUNDING)}`;
  const normalizePosition = ([x, y]: Point): Point => [round(x), round(y)];

  const addNode = (id: string, kind: SurfaceNodeKind, position: Point, details: Partial<Pick<SurfaceNode, 'runwayId' | 'standId'>> = {}): SurfaceNode => {
    const normalized = normalizePosition(position);
    const existing = nodeById.get(id);
    if (existing) return existing;
    const node: SurfaceNode = { id, kind, position: normalized, taxiwayIds: [], ...details };
    nodes.push(node);
    nodeById.set(id, node);
    nodeByCoordinate.set(coordinateKey(normalized), node);
    return node;
  };

  const addWaypoint = (position: Point, kind: SurfaceNodeKind = 'taxiway'): SurfaceNode => {
    const normalized = normalizePosition(position);
    const existing = nodeByCoordinate.get(coordinateKey(normalized));
    if (existing) return existing;
    return addNode(`N${String(waypointSequence++).padStart(4, '0')}`, kind, normalized);
  };

  const ensureTaxiway = (id: string, name: string): SurfaceTaxiway => {
    const existing = taxiwayById.get(id);
    if (existing) return existing;
    const taxiway: SurfaceTaxiway = { id, name, edgeIds: [] };
    taxiwayById.set(id, taxiway);
    return taxiway;
  };

  const addEdge = (
    from: SurfaceNode,
    to: SurfaceNode,
    options: {
      kind: SurfaceEdgeKind;
      name: string;
      width: number;
      direction?: SurfaceEdgeDirection;
      taxiwayId?: string;
      runwayId?: number;
    },
  ): SurfaceEdge | null => {
    if (from.id === to.id || distance(from.position, to.position) < 0.001) return null;
    const direction = options.direction ?? 'both';
    const endpoints = direction === 'both' ? [from.id, to.id].sort().join(':') : `${from.id}:${to.id}`;
    const key = `${options.kind}:${endpoints}`;
    const existing = edgeByKey.get(key);
    if (existing) {
      if (options.taxiwayId) registerTaxiwayEdge(options.taxiwayId, options.name, existing, from, to);
      return existing;
    }
    const edge: SurfaceEdge = {
      id: `E${String(edgeSequence++).padStart(4, '0')}`,
      from: from.id,
      to: to.id,
      kind: options.kind,
      name: options.name,
      direction,
      width: options.width,
      taxiwayId: options.taxiwayId,
      runwayId: options.runwayId,
    };
    edges.push(edge);
    edgeByKey.set(key, edge);
    if (options.taxiwayId) registerTaxiwayEdge(options.taxiwayId, options.name, edge, from, to);
    return edge;
  };

  const registerPolyline = (
    points: Point[],
    endpoints: { start: SurfaceNode; end: SurfaceNode },
    options: { taxiwayId: string; name: string; width: number; runwayId?: number; firstKind?: SurfaceEdgeKind },
  ): void => {
    const routeNodes: SurfaceNode[] = [endpoints.start];
    for (let index = 1; index < points.length - 1; index += 1) routeNodes.push(addWaypoint(points[index]));
    routeNodes.push(endpoints.end);
    for (let index = 0; index < routeNodes.length - 1; index += 1) {
      addEdge(routeNodes[index], routeNodes[index + 1], {
        kind: index === 0 && options.firstKind ? options.firstKind : 'taxiway',
        name: options.name,
        width: options.width,
        taxiwayId: options.taxiwayId,
        runwayId: index === 0 && options.firstKind === 'runway-access' ? options.runwayId : undefined,
      });
    }
  };

  const gateLayout = surfaceGateLayout(config.scope, config.code);
  const apronEntries = new Map<-1 | 1, SurfaceNode>();
  for (const side of [-1, 1] as const) {
    const apronId = side === -1 ? 'APRON-SOUTH' : 'APRON-NORTH';
    const apronName = side === -1 ? 'South Apron' : 'North Apron';
    ensureTaxiway(apronId, apronName);
    const gateY = config.terminal[1] + side * gateLayout.sideOffset;
    const laneY = gateY + side * gateLayout.laneOffset;
    const apronEntry = addNode(`APRON-ENTRY-${side === -1 ? 'S' : 'N'}`, 'apron-entry', [config.terminal[0], laneY]);
    const laneNodes: SurfaceNode[] = [apronEntry];
    for (let column = 0; column < gateLayout.columns; column += 1) {
      const slot = side === -1 ? column : gateLayout.columns + column;
      const standId = `G${String(slot + 1).padStart(2, '0')}`;
      const x = config.terminal[0] + gateLayout.centerOffset + (column - (gateLayout.columns - 1) / 2) * gateLayout.spacing;
      const standNode = addNode(`STAND-${standId}`, 'stand', [x, gateY], { standId });
      const laneNode = addWaypoint([x, laneY]);
      laneNodes.push(laneNode);
      addEdge(laneNode, standNode, { kind: 'stand-lead-in', name: apronName, width: 6, taxiwayId: apronId });
      stands.push({
        id: standId,
        slot,
        nodeId: standNode.id,
        apronTaxiwayId: apronId,
        terminal: 'MAIN',
        position: standNode.position,
        heading: side === -1 ? Math.PI / 2 : -Math.PI / 2,
      });
    }
    laneNodes.sort((first, second) => first.position[0] - second.position[0]);
    for (let index = 0; index < laneNodes.length - 1; index += 1) {
      addEdge(laneNodes[index], laneNodes[index + 1], { kind: 'apron', name: apronName, width: 8, taxiwayId: apronId });
    }
    apronEntries.set(side, apronEntry);
  }

  for (const runway of config.runways) {
    const runwayName = `Runway ${runway.designation?.join('/') ?? runway.id + 1}`;
    const taxiway = taxiwayForRunway(config, runway);
    ensureTaxiway(taxiway.id, taxiway.name);
    const endNodes = new Map<-1 | 1, { threshold: SurfaceNode; exit: SurfaceNode; hold: SurfaceNode }>();

    for (const end of [-1, 1] as const) {
      const suffix = end === -1 ? 'NEG' : 'POS';
      const threshold = addNode(`RWY-${runway.id}-${suffix}-THR`, 'runway-threshold', runwayEnd(runway, end, 0), { runwayId: runway.id });
      const exit = addNode(`RWY-${runway.id}-${suffix}-EXIT`, 'runway-exit', runwayEnd(runway, end, -5), { runwayId: runway.id });
      const hold = addNode(`RWY-${runway.id}-${suffix}-HOLD`, 'hold-short', runwayEnd(runway, end, 8), { runwayId: runway.id });
      endNodes.set(end, { threshold, exit, hold });
      addEdge(hold, threshold, { kind: 'runway-access', name: `${runwayName} entry`, width: runway.width, runwayId: runway.id });
      runwayAccess.push({
        runwayId: runway.id,
        end,
        thresholdNodeId: threshold.id,
        exitNodeId: exit.id,
        holdShortNodeId: hold.id,
        primaryTaxiwayId: taxiway.id,
      });

      for (const apronSide of [-1, 1] as const) {
        const apronEntry = apronEntries.get(apronSide);
        if (!apronEntry) continue;
        for (const accessNode of [exit, hold]) {
          const routePoints = taxiRoutePoints(config, runway, accessNode.position, apronEntry.position);
          registerPolyline(routePoints, { start: accessNode, end: apronEntry }, {
            taxiwayId: taxiway.id,
            name: taxiway.name,
            width: 8,
            runwayId: runway.id,
            firstKind: accessNode.kind === 'runway-exit' ? 'runway-access' : 'taxiway',
          });
        }
      }
    }

    const negative = endNodes.get(-1);
    const positive = endNodes.get(1);
    if (negative && positive) {
      addEdge(negative.threshold, negative.exit, { kind: 'runway', name: runwayName, width: runway.width, runwayId: runway.id });
      addEdge(negative.exit, positive.exit, { kind: 'runway', name: runwayName, width: runway.width, runwayId: runway.id });
      addEdge(positive.exit, positive.threshold, { kind: 'runway', name: runwayName, width: runway.width, runwayId: runway.id });
    }
  }

  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  for (const node of nodes) {
    if (node.kind === 'taxiway' && (degree.get(node.id) ?? 0) >= 3) node.kind = 'intersection';
    node.taxiwayIds.sort();
  }

  return {
    schemaVersion: 1,
    airportCode: config.code,
    seed: config.seed,
    nodes,
    edges,
    taxiways: [...taxiwayById.values()],
    stands: stands.sort((first, second) => first.slot - second.slot),
    runwayAccess,
  };

  function registerTaxiwayEdge(taxiwayId: string, name: string, edge: SurfaceEdge, from: SurfaceNode, to: SurfaceNode): void {
    const taxiway = ensureTaxiway(taxiwayId, name);
    if (!taxiway.edgeIds.includes(edge.id)) taxiway.edgeIds.push(edge.id);
    for (const node of [from, to]) {
      if (!node.taxiwayIds.includes(taxiwayId)) node.taxiwayIds.push(taxiwayId);
    }
  }
}

export function surfaceRouteForFlight(
  graph: AirportSurfaceGraph,
  runwayId: number,
  operatingEnd: -1 | 1,
  phase: 'taxi-in' | 'resting' | 'taxi-out',
  gateSlot: number,
): SurfaceRoute | null {
  const stand = graph.stands.find((item) => item.slot === gateSlot) ?? graph.stands[gateSlot % Math.max(1, graph.stands.length)];
  if (!stand) return null;
  if (phase === 'resting') return { nodeIds: [stand.nodeId], edgeIds: [], distance: 0, taxiwayIds: [stand.apronTaxiwayId] };
  const end = phase === 'taxi-in' ? -operatingEnd as -1 | 1 : operatingEnd;
  const access = graph.runwayAccess.find((item) => item.runwayId === runwayId && item.end === end);
  if (!access) return null;
  const from = phase === 'taxi-in' ? access.exitNodeId : stand.nodeId;
  const to = phase === 'taxi-in' ? stand.nodeId : access.holdShortNodeId;
  return findSurfaceRoute(graph, from, to);
}

export function findSurfaceRoute(graph: AirportSurfaceGraph, fromNodeId: string, toNodeId: string): SurfaceRoute | null {
  if (fromNodeId === toNodeId) return { nodeIds: [fromNodeId], edgeIds: [], distance: 0, taxiwayIds: [] };
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodeMap.has(fromNodeId) || !nodeMap.has(toNodeId)) return null;
  const adjacency = new Map<string, Array<{ nodeId: string; edge: SurfaceEdge; cost: number }>>();
  for (const edge of graph.edges) {
    if (edge.kind === 'runway') continue;
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) continue;
    const cost = distance(from.position, to.position);
    const forward = adjacency.get(edge.from) ?? [];
    forward.push({ nodeId: edge.to, edge, cost });
    adjacency.set(edge.from, forward);
    if (edge.direction === 'both') {
      const reverse = adjacency.get(edge.to) ?? [];
      reverse.push({ nodeId: edge.from, edge, cost });
      adjacency.set(edge.to, reverse);
    }
  }

  const distanceByNode = new Map<string, number>([[fromNodeId, 0]]);
  const previous = new Map<string, { nodeId: string; edge: SurfaceEdge }>();
  const pending = new Set<string>([fromNodeId]);
  while (pending.size) {
    let current = '';
    let currentDistance = Infinity;
    for (const candidate of pending) {
      const candidateDistance = distanceByNode.get(candidate) ?? Infinity;
      if (candidateDistance < currentDistance) {
        current = candidate;
        currentDistance = candidateDistance;
      }
    }
    pending.delete(current);
    if (current === toNodeId) break;
    for (const next of adjacency.get(current) ?? []) {
      const nextDistance = currentDistance + next.cost;
      if (nextDistance >= (distanceByNode.get(next.nodeId) ?? Infinity)) continue;
      distanceByNode.set(next.nodeId, nextDistance);
      previous.set(next.nodeId, { nodeId: current, edge: next.edge });
      pending.add(next.nodeId);
    }
  }

  if (!previous.has(toNodeId)) return null;
  const nodeIds = [toNodeId];
  const edgeIds: string[] = [];
  let cursor = toNodeId;
  while (cursor !== fromNodeId) {
    const step = previous.get(cursor);
    if (!step) return null;
    nodeIds.push(step.nodeId);
    edgeIds.push(step.edge.id);
    cursor = step.nodeId;
  }
  nodeIds.reverse();
  edgeIds.reverse();
  const edgeMap = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const taxiwayIds = [...new Set(edgeIds.map((id) => edgeMap.get(id)?.taxiwayId).filter((id): id is string => Boolean(id)))];
  return { nodeIds, edgeIds, distance: distanceByNode.get(toNodeId) ?? 0, taxiwayIds };
}

export function sampleSurfaceRoute(graph: AirportSurfaceGraph, nodeIds: string[] | undefined, progress: number): SurfaceRouteSample | null {
  if (!nodeIds?.length) return null;
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const routeNodes = nodeIds.map((id) => nodeMap.get(id)).filter((node): node is SurfaceNode => Boolean(node));
  if (!routeNodes.length) return null;
  if (routeNodes.length === 1) {
    const node = routeNodes[0];
    return { x: node.position[0], y: node.position[1], heading: 0, distanceAlong: 0, totalDistance: 0, edgeIndex: -1, edgeProgress: 1, fromNodeId: node.id, toNodeId: node.id, nearestNodeId: node.id };
  }

  const segments = routeNodes.slice(0, -1).map((from, index) => {
    const to = routeNodes[index + 1];
    return { from, to, length: distance(from.position, to.position) };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = clamp(progress, 0, 1) * total;
  let selected = segments[segments.length - 1];
  let selectedIndex = segments.length - 1;
  let local = 1;
  let traversed = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (remaining <= segment.length || segment === selected) {
      selected = segment;
      selectedIndex = index;
      local = segment.length > 0 ? clamp(remaining / segment.length, 0, 1) : 1;
      break;
    }
    remaining -= segment.length;
    traversed += segment.length;
  }
  const edge = graph.edges.find((item) => (
    (item.from === selected.from.id && item.to === selected.to.id)
      || (item.direction === 'both' && item.from === selected.to.id && item.to === selected.from.id)
  ));
  return {
    x: lerp(selected.from.position[0], selected.to.position[0], local),
    y: lerp(selected.from.position[1], selected.to.position[1], local),
    heading: Math.atan2(selected.to.position[1] - selected.from.position[1], selected.to.position[0] - selected.from.position[0]),
    distanceAlong: traversed + selected.length * local,
    totalDistance: total,
    edgeIndex: selectedIndex,
    edgeProgress: local,
    fromNodeId: selected.from.id,
    toNodeId: selected.to.id,
    nearestNodeId: local < 0.5 ? selected.from.id : selected.to.id,
    edge,
  };
}

/**
 * Returns the route resources a surface aircraft needs now and immediately
 * ahead. Automatic ground control uses these tokens to permit simultaneous
 * movements on independent taxiways while keeping converging aircraft apart.
 */
export function surfaceRouteReservationKeys(
  graph: AirportSurfaceGraph,
  nodeIds: string[] | undefined,
  progress: number,
  lookaheadEdges = 1,
): string[] {
  const sample = sampleSurfaceRoute(graph, nodeIds, progress);
  if (!sample || !nodeIds?.length || sample.edgeIndex < 0) return [];
  const keys = new Set<string>();
  for (let index = sample.edgeIndex; index <= Math.min(nodeIds.length - 2, sample.edgeIndex + lookaheadEdges); index += 1) {
    const from = nodeIds[index];
    const to = nodeIds[index + 1];
    const edge = graph.edges.find((item) => (
      (item.from === from && item.to === to)
      || (item.direction === 'both' && item.from === to && item.to === from)
    ));
    if (edge) keys.add(`edge:${edge.id}:${from}>${to}`);
    if (index > sample.edgeIndex || sample.edgeProgress > 0.64) keys.add(`node:${to}`);
  }
  return [...keys];
}

export function surfaceRouteRunwayCrossings(
  graph: AirportSurfaceGraph,
  edgeIds: string[] | undefined,
  assignedRunway: number,
): number[] {
  if (!edgeIds?.length) return [];
  const edgeMap = new Map(graph.edges.map((edge) => [edge.id, edge]));
  return [...new Set(edgeIds
    .map((id) => edgeMap.get(id))
    .filter((edge) => edge?.kind === 'runway-access' && edge.runwayId !== undefined && edge.runwayId !== assignedRunway)
    .map((edge) => edge!.runwayId!))];
}

export function validateAirportSurfaceGraph(config: SurfaceGraphConfig & { surfaceGraph: AirportSurfaceGraph }): SurfaceGraphValidation {
  const graph = config.surfaceGraph;
  const errors: string[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) errors.push(`duplicate node ${node.id}`);
    nodeIds.add(node.id);
    if (!node.position.every(Number.isFinite)) errors.push(`node ${node.id} has a non-finite position`);
  }
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) errors.push(`duplicate edge ${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) errors.push(`edge ${edge.id} has a missing endpoint`);
    if (edge.from === edge.to) errors.push(`edge ${edge.id} has identical endpoints`);
  }
  for (const taxiway of graph.taxiways) {
    if (!taxiway.name.trim()) errors.push(`taxiway ${taxiway.id} has no name`);
    for (const edgeId of taxiway.edgeIds) if (!edgeIds.has(edgeId)) errors.push(`taxiway ${taxiway.id} references missing edge ${edgeId}`);
  }
  for (const stand of graph.stands) {
    const node = graph.nodes.find((item) => item.id === stand.nodeId);
    if (!node || node.kind !== 'stand') errors.push(`stand ${stand.id} has no stand node`);
  }
  for (const runway of config.runways.filter((item) => item.role !== 'inactive')) {
    for (const end of [-1, 1] as const) {
      const access = graph.runwayAccess.find((item) => item.runwayId === runway.id && item.end === end);
      if (!access) {
        errors.push(`runway ${runway.id} end ${end} has no surface access`);
        continue;
      }
      const stand = graph.stands[0];
      if (stand && !findSurfaceRoute(graph, access.exitNodeId, stand.nodeId)) errors.push(`runway ${runway.id} end ${end} cannot reach the apron`);
      if (stand && !findSurfaceRoute(graph, stand.nodeId, access.holdShortNodeId)) errors.push(`apron cannot reach runway ${runway.id} end ${end} hold short`);
    }
  }
  try {
    const serialized = JSON.stringify(graph);
    const restored = JSON.parse(serialized) as AirportSurfaceGraph;
    if (restored.nodes.length !== graph.nodes.length || restored.edges.length !== graph.edges.length) errors.push('JSON round trip changed graph counts');
  } catch (error) {
    errors.push(`graph is not JSON serializable: ${String(error)}`);
  }
  return {
    valid: errors.length === 0,
    errors,
    counts: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      taxiways: graph.taxiways.length,
      stands: graph.stands.length,
      intersections: graph.nodes.filter((node) => node.kind === 'intersection').length,
      holdShorts: graph.nodes.filter((node) => node.kind === 'hold-short').length,
    },
  };
}

export function surfaceGateLayout(scope: AirportConfig['scope'], airportCode = 'LOCAL'): { columns: number; spacing: number; sideOffset: number; laneOffset: number; centerOffset: number } {
  // O'Hare's compact schematic places the terminal east of the runway bank.
  // Bias its stands farther east so runway-access spurs cannot run through the
  // apron. Other airports retain a centered concourse layout.
  if (scope === 'center' && airportCode === 'ORD') {
    return { columns: 6, spacing: 12.5, sideOffset: 13, laneOffset: 12, centerOffset: 28 };
  }
  return scope === 'center'
    ? { columns: 6, spacing: 12.5, sideOffset: 13, laneOffset: 12, centerOffset: 0 }
    : { columns: 3, spacing: 12.5, sideOffset: 13, laneOffset: 12, centerOffset: 0 };
}

function taxiwayForRunway(config: SurfaceGraphConfig, runway: RunwayConfig): { id: string; name: string } {
  if (config.code === 'ORD') {
    const names = [
      ['A', 'Taxiway Alpha'],
      ['B', 'Taxiway Bravo'],
      ['D', 'Taxiway Delta'],
      ['K', 'Taxiway Kilo'],
      ['M', 'Taxiway Mike'],
      ['N', 'Taxiway November'],
      ['Y', 'Taxiway Yankee'],
      ['Z', 'Taxiway Zulu'],
    ] as const;
    const [id, name] = names[runway.id] ?? ['E', 'Taxiway Echo'];
    return { id: `TWY-${id}`, name };
  }
  const letter = String.fromCharCode(65 + runway.id % 20);
  return { id: `TWY-${letter}`, name: `Taxiway ${letter}` };
}

function taxiRoutePoints(config: SurfaceGraphConfig, runway: RunwayConfig, anchor: Point, apronEntry: Point): Point[] {
  if (config.code === 'ORD') return oharePerimeterTaxiRoute(config, runway, anchor, apronEntry);
  const center: Point = config.terminal;
  let runwaySide: Point = [-Math.sin(runway.heading), Math.cos(runway.heading)];
  if (dot(subtract(center, anchor), runwaySide) < 0) runwaySide = scale(runwaySide, -1);
  const turnoff = add(anchor, scale(runwaySide, 8));
  // Keep the cross-airport leg outside the terminal's physical aircraft
  // envelope. This prevents an otherwise valid centerline from clipping a
  // roof corner before it reaches the apron perimeter.
  const terminalClearY = 12;
  const relativeTurnoffY = turnoff[1] - center[1];
  if (Math.abs(relativeTurnoffY) < terminalClearY) {
    const fallbackSide = apronEntry[1] >= center[1] ? 1 : -1;
    turnoff[1] = center[1] + (relativeTurnoffY === 0 ? fallbackSide : Math.sign(relativeTurnoffY)) * terminalClearY;
  }
  const detourSign = turnoff[0] >= center[0] ? 1 : -1;
  const layout = surfaceGateLayout(config.scope, config.code);
  const perimeterX = center[0] + layout.centerOffset + detourSign * ((layout.columns - 1) * layout.spacing / 2 + 10);
  return [anchor, turnoff, [perimeterX, turnoff[1]], [perimeterX, apronEntry[1]], apronEntry];
}

function oharePerimeterTaxiRoute(config: SurfaceGraphConfig, runway: RunwayConfig, anchor: Point, apronEntry: Point): Point[] {
  const padding = 14;
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  for (const item of config.runways) {
    const extentX = Math.abs(Math.cos(item.heading)) * item.length / 2 + item.width / 2;
    const extentY = Math.abs(Math.sin(item.heading)) * item.length / 2 + item.width / 2;
    left = Math.min(left, item.center[0] - extentX - padding);
    right = Math.max(right, item.center[0] + extentX + padding);
    bottom = Math.min(bottom, item.center[1] - extentY - padding);
    top = Math.max(top, item.center[1] + extentY + padding);
  }
  const gateLayout = surfaceGateLayout(config.scope, config.code);
  const gateHalfWidth = (gateLayout.columns - 1) * gateLayout.spacing / 2;
  right = Math.max(right, config.terminal[0] + gateLayout.centerOffset + gateHalfWidth + 16);
  const direction: Point = [Math.cos(runway.heading), Math.sin(runway.heading)];
  const sign = dot(subtract(anchor, runway.center), direction) >= 0 ? 1 : -1;
  const exit = runwayEnd(runway, sign, 12);
  const outward = scale(direction, sign);
  const points: Point[] = [anchor, exit];
  if (Math.abs(outward[0]) >= Math.abs(outward[1])) {
    if (outward[0] > 0) {
      const terminalRelativeY = exit[1] - config.terminal[1];
      const apronSide = apronEntry[1] >= config.terminal[1] ? 1 : -1;
      const terminalClear = gateLayout.sideOffset + gateLayout.laneOffset + 13;
      const corridorY = Math.abs(terminalRelativeY) < terminalClear
        ? config.terminal[1] + (terminalRelativeY === 0 ? apronSide : Math.sign(terminalRelativeY)) * terminalClear
        : exit[1];
      points.push([exit[0], corridorY], [right, corridorY], [right, apronEntry[1]]);
    }
    else {
      const outerY = exit[1] >= 0 ? top : bottom;
      points.push([left, exit[1]], [left, outerY], [right, outerY], [right, apronEntry[1]]);
    }
  } else {
    const outerY = outward[1] > 0 ? top : bottom;
    points.push([exit[0], outerY], [right, outerY], [right, apronEntry[1]]);
  }
  points.push(apronEntry);
  return points;
}

function runwayEnd(runway: RunwayConfig, sign: number, beyond: number): Point {
  const amount = sign * (runway.length / 2 + beyond);
  return [runway.center[0] + Math.cos(runway.heading) * amount, runway.center[1] + Math.sin(runway.heading) * amount];
}

function add(first: Point, second: Point): Point { return [first[0] + second[0], first[1] + second[1]]; }
function subtract(first: Point, second: Point): Point { return [first[0] - second[0], first[1] - second[1]]; }
function scale(point: Point, amount: number): Point { return [point[0] * amount, point[1] * amount]; }
function dot(first: Point, second: Point): number { return first[0] * second[0] + first[1] * second[1]; }
function distance(first: Point, second: Point): number { return Math.hypot(first[0] - second[0], first[1] - second[1]); }
function lerp(first: number, second: number, amount: number): number { return first + (second - first) * amount; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
function round(value: number): number { return Math.round(value * ROUNDING) / ROUNDING; }

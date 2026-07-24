import type { AirportConfig, RunwayConfig } from './airportConfig';
import type { AircraftCategory } from './types';

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
export type SurfaceGradeSeparation = 'bridge' | 'tunnel';
export type SurfaceControlPointKind = 'hold-short' | 'runway-entry' | 'runway-crossing' | 'line-up' | 'departure-release';
export type SurfaceOperationalZoneKind =
  | 'terminal-complex'
  | 'terminal-apron'
  | 'cargo-ramp'
  | 'general-aviation'
  | 'deicing-pad'
  | 'holding-pad'
  | 'maintenance'
  | 'remote-ramp'
  | 'perimeter-route';

export interface SurfaceNode {
  id: string;
  sourceNodeId?: number;
  sourceParkingPositionId?: string;
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
  crossedRunwayIds?: number[];
  sourceWayId?: number;
  sourceWayIds?: number[];
  gradeSeparation?: SurfaceGradeSeparation;
  crossingIds?: string[];
}

export interface SurfaceTaxiway {
  id: string;
  name: string;
  edgeIds: string[];
  reference?: string;
  sourceKind?: 'taxiway' | 'taxilane' | 'procedural';
}

export interface SurfaceStand {
  id: string;
  slot: number;
  nodeId: string;
  apronTaxiwayId: string;
  terminal: string;
  terminalId?: string;
  concourse?: string;
  gateRef?: string;
  position: [number, number];
  heading: number;
  zoneId: string;
  maximumWingspanM: number;
  supportedCategories: AircraftCategory[];
  pushbackDirection: 'left' | 'right' | 'straight';
  pushbackHeading: number;
  rampNodeId: string;
  sourceParkingNodeId?: number;
  sourceParkingWayId?: number;
  sourceParkingPositionId?: string;
  sourceGateNodeId?: number;
}

export interface SurfacePassengerFacility {
  id: string;
  kind: 'terminal' | 'concourse';
  name: string;
  terminalId: string;
  terminal: string;
  concourse?: string;
  concourses?: string[];
  sections?: string[];
  center: [number, number];
  publishedGateCount: number;
  sourceElementIds: string[];
  positionSource: 'osm-terminal' | 'osm-gate-centroid';
  standIds: string[];
}

export interface PassengerFacilityReference {
  provider: string;
  url: string;
  retrievedOn: string;
  totalPassengerGates: number;
  terminals: Array<{
    id: string;
    name: string;
    concourses: Array<{
      id: string;
      publishedGateCount: number;
      sections?: string[];
    }>;
  }>;
}

export interface SurfaceControlPoint {
  id: string;
  kind: SurfaceControlPointKind;
  position: [number, number];
  runwayId: number;
  nodeId?: string;
  edgeId?: string;
  crossingId?: string;
  end?: -1 | 1;
  source: 'generated' | 'faa';
}

export interface SurfaceOperationalZone {
  id: string;
  name: string;
  kind: SurfaceOperationalZoneKind;
  sourceFeatureIds: string[];
  rings: Array<Array<[number, number]>>;
  edgeIds: string[];
  standIds: string[];
  classification: 'published' | 'derived';
}

export interface SurfaceHotspot {
  id: string;
  label: string;
  description: string;
  sourceFeatureId: string;
  rings: Array<Array<[number, number]>>;
  nodeIds: string[];
  edgeIds: string[];
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
  schemaVersion: 3;
  airportCode: string;
  seed: number;
  source?: {
    kind: 'procedural' | 'imported';
    provider: string;
    retrievedOn?: string | null;
  };
  nodes: SurfaceNode[];
  edges: SurfaceEdge[];
  taxiways: SurfaceTaxiway[];
  stands: SurfaceStand[];
  passengerFacilities: SurfacePassengerFacility[];
  passengerFacilityReference?: PassengerFacilityReference;
  runwayAccess: RunwaySurfaceAccess[];
  controlPoints: SurfaceControlPoint[];
  zones: SurfaceOperationalZone[];
  hotspots: SurfaceHotspot[];
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
    passengerFacilities: number;
    intersections: number;
    holdShorts: number;
    controlPoints: number;
    zones: number;
    hotspots: number;
    gradeSeparatedEdges: number;
  };
}

type SurfaceGraphConfig = Pick<AirportConfig, 'code' | 'seed' | 'scope' | 'terminal' | 'runways'>;
type Point = [number, number];

interface SurfaceGraphIndex {
  nodeById: Map<string, SurfaceNode>;
  edgeById: Map<string, SurfaceEdge>;
  edgeByTraversal: Map<string, SurfaceEdge>;
  adjacency: Map<string, Array<{ nodeId: string; edge: SurfaceEdge; cost: number }>>;
  controlPointsByCrossing: Map<string, SurfaceControlPoint[]>;
  routeGeometry: WeakMap<string[], SurfaceRouteGeometry>;
}

interface SurfaceRouteSegment {
  from: SurfaceNode;
  to: SurfaceNode;
  length: number;
  startDistance: number;
  edge?: SurfaceEdge;
}

export interface SurfaceRouteCrossingWindow {
  id: string;
  crossingId?: string;
  runwayId: number;
  edgeId: string;
  edgeIndex: number;
  exitEdgeIndex: number;
  holdProgress: number;
  entryProgress: number;
  exitProgress: number;
  distanceToHold: number;
  holdPointId?: string;
  crossingPointId?: string;
}

interface SurfaceRouteGeometry {
  nodes: SurfaceNode[];
  segments: SurfaceRouteSegment[];
  totalDistance: number;
}

const ROUNDING = 1_000;
const HOLD_SHORT_BUFFER = 1.15;
const surfaceGraphIndexes = new WeakMap<AirportSurfaceGraph, SurfaceGraphIndex>();

export function buildAirportSurfaceGraph(config: SurfaceGraphConfig): AirportSurfaceGraph {
  const nodes: SurfaceNode[] = [];
  const edges: SurfaceEdge[] = [];
  const stands: SurfaceStand[] = [];
  const runwayAccess: RunwaySurfaceAccess[] = [];
  const controlPoints: SurfaceControlPoint[] = [];
  const zones: SurfaceOperationalZone[] = [{
    id: 'ZONE-TERMINAL',
    name: 'Main terminal complex',
    kind: 'terminal-complex',
    sourceFeatureIds: [],
    rings: [[
      [config.terminal[0] - 8, config.terminal[1] - 5],
      [config.terminal[0] + 8, config.terminal[1] - 5],
      [config.terminal[0] + 8, config.terminal[1] + 5],
      [config.terminal[0] - 8, config.terminal[1] + 5],
      [config.terminal[0] - 8, config.terminal[1] - 5],
    ]],
    edgeIds: [],
    standIds: [],
    classification: 'derived',
  }];
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
    const taxiway: SurfaceTaxiway = { id, name, edgeIds: [], sourceKind: 'procedural' };
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
    const zone: SurfaceOperationalZone = {
      id: `ZONE-${apronId}`,
      name: apronName,
      kind: 'terminal-apron',
      sourceFeatureIds: [],
      rings: [],
      edgeIds: [],
      standIds: [],
      classification: 'derived',
    };
    zones.push(zone);
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
        zoneId: zone.id,
        maximumWingspanM: 72,
        supportedCategories: ['regional', 'narrowbody', 'widebody', 'cargo'],
        pushbackDirection: 'straight',
        pushbackHeading: side === -1 ? -Math.PI / 2 : Math.PI / 2,
        rampNodeId: laneNode.id,
      });
      zone.standIds.push(standId);
    }
    laneNodes.sort((first, second) => first.position[0] - second.position[0]);
    for (let index = 0; index < laneNodes.length - 1; index += 1) {
      addEdge(laneNodes[index], laneNodes[index + 1], { kind: 'apron', name: apronName, width: 8, taxiwayId: apronId });
    }
    const xs = laneNodes.map((node) => node.position[0]);
    const minimumX = Math.min(...xs) - 3;
    const maximumX = Math.max(...xs) + 3;
    const minimumY = Math.min(gateY, laneY) - 3;
    const maximumY = Math.max(gateY, laneY) + 3;
    zone.rings = [[
      [minimumX, minimumY],
      [maximumX, minimumY],
      [maximumX, maximumY],
      [minimumX, maximumY],
      [minimumX, minimumY],
    ]];
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

  for (const zone of zones) {
    if (zone.kind === 'terminal-apron') {
      const apronId = zone.id.replace(/^ZONE-/, '');
      zone.edgeIds = edges.filter((edge) => edge.taxiwayId === apronId).map((edge) => edge.id);
    }
  }
  for (const access of runwayAccess) {
    const hold = nodeById.get(access.holdShortNodeId);
    const threshold = nodeById.get(access.thresholdNodeId);
    if (!hold || !threshold) continue;
    const suffix = access.end === -1 ? 'NEG' : 'POS';
    controlPoints.push(
      { id: `CP-RWY-${access.runwayId}-${suffix}-HOLD`, kind: 'hold-short', position: [...hold.position], runwayId: access.runwayId, nodeId: hold.id, end: access.end, source: 'generated' },
      { id: `CP-RWY-${access.runwayId}-${suffix}-RELEASE`, kind: 'departure-release', position: [...hold.position], runwayId: access.runwayId, nodeId: hold.id, end: access.end, source: 'generated' },
      { id: `CP-RWY-${access.runwayId}-${suffix}-ENTRY`, kind: 'runway-entry', position: [...threshold.position], runwayId: access.runwayId, nodeId: threshold.id, end: access.end, source: 'generated' },
      { id: `CP-RWY-${access.runwayId}-${suffix}-LINEUP`, kind: 'line-up', position: [...threshold.position], runwayId: access.runwayId, nodeId: threshold.id, end: access.end, source: 'generated' },
    );
  }

  return {
    schemaVersion: 3,
    airportCode: config.code,
    seed: config.seed,
    nodes,
    edges,
    taxiways: [...taxiwayById.values()],
    stands: stands.sort((first, second) => first.slot - second.slot),
    passengerFacilities: [],
    runwayAccess,
    controlPoints,
    zones,
    hotspots: [],
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

export function surfaceStandSupportsAircraft(
  stand: SurfaceStand,
  category: AircraftCategory,
  wingspanM: number,
): boolean {
  return stand.supportedCategories.includes(category) && stand.maximumWingspanM + 1e-6 >= wingspanM;
}

export function findSurfaceRoute(graph: AirportSurfaceGraph, fromNodeId: string, toNodeId: string): SurfaceRoute | null {
  if (fromNodeId === toNodeId) return { nodeIds: [fromNodeId], edgeIds: [], distance: 0, taxiwayIds: [] };
  const { nodeById, edgeById, adjacency } = surfaceGraphIndex(graph);
  if (!nodeById.has(fromNodeId) || !nodeById.has(toNodeId)) return null;

  const distanceByNode = new Map<string, number>([[fromNodeId, 0]]);
  const previous = new Map<string, { nodeId: string; edge: SurfaceEdge }>();
  const pending: Array<{ nodeId: string; distance: number }> = [{ nodeId: fromNodeId, distance: 0 }];
  while (pending.length) {
    const candidate = popMinimumRouteNode(pending);
    if (!candidate) break;
    const current = candidate.nodeId;
    const currentDistance = candidate.distance;
    if (currentDistance !== distanceByNode.get(current)) continue;
    if (current === toNodeId) break;
    for (const next of adjacency.get(current) ?? []) {
      const nextDistance = currentDistance + next.cost;
      if (nextDistance >= (distanceByNode.get(next.nodeId) ?? Infinity)) continue;
      distanceByNode.set(next.nodeId, nextDistance);
      previous.set(next.nodeId, { nodeId: current, edge: next.edge });
      pushRouteNode(pending, { nodeId: next.nodeId, distance: nextDistance });
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
  const taxiwayIds = [...new Set(edgeIds.map((id) => edgeById.get(id)?.taxiwayId).filter((id): id is string => Boolean(id)))];
  return { nodeIds, edgeIds, distance: distanceByNode.get(toNodeId) ?? 0, taxiwayIds };
}

export function sampleSurfaceRoute(graph: AirportSurfaceGraph, nodeIds: string[] | undefined, progress: number): SurfaceRouteSample | null {
  if (!nodeIds?.length) return null;
  return sampleSurfaceRouteGeometry(surfaceRouteGeometry(graph, nodeIds), progress);
}

function sampleSurfaceRouteGeometry(geometry: SurfaceRouteGeometry, progress: number): SurfaceRouteSample | null {
  const routeNodes = geometry.nodes;
  if (!routeNodes.length) return null;
  if (routeNodes.length === 1) {
    const node = routeNodes[0];
    return { x: node.position[0], y: node.position[1], heading: 0, distanceAlong: 0, totalDistance: 0, edgeIndex: -1, edgeProgress: 1, fromNodeId: node.id, toNodeId: node.id, nearestNodeId: node.id };
  }

  const segments = geometry.segments;
  const total = geometry.totalDistance;
  let remaining = clamp(progress, 0, 1) * total;
  let selected = segments[segments.length - 1];
  let selectedIndex = segments.length - 1;
  let local = 1;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (remaining <= segment.length || segment === selected) {
      selected = segment;
      selectedIndex = index;
      local = segment.length > 0 ? clamp(remaining / segment.length, 0, 1) : 1;
      break;
    }
    remaining -= segment.length;
  }
  return {
    x: lerp(selected.from.position[0], selected.to.position[0], local),
    y: lerp(selected.from.position[1], selected.to.position[1], local),
    heading: Math.atan2(selected.to.position[1] - selected.from.position[1], selected.to.position[0] - selected.from.position[0]),
    distanceAlong: selected.startDistance + selected.length * local,
    totalDistance: total,
    edgeIndex: selectedIndex,
    edgeProgress: local,
    fromNodeId: selected.from.id,
    toNodeId: selected.to.id,
    nearestNodeId: local < 0.5 ? selected.from.id : selected.to.id,
    edge: selected.edge,
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
  edgeIds?: string[],
): string[] {
  const sample = sampleSurfaceRouteWithEdges(graph, nodeIds, edgeIds, progress);
  if (!sample || !nodeIds?.length || sample.edgeIndex < 0) return [];
  const keys = new Set<string>();
  for (let index = sample.edgeIndex; index <= Math.min(nodeIds.length - 2, sample.edgeIndex + lookaheadEdges); index += 1) {
    const from = nodeIds[index];
    const to = nodeIds[index + 1];
    const edge = edgeIds?.[index]
      ? surfaceGraphIndex(graph).edgeById.get(edgeIds[index])
      : surfaceGraphIndex(graph).edgeByTraversal.get(surfaceTraversalKey(from, to));
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
  const edgeMap = surfaceGraphIndex(graph).edgeById;
  return [...new Set(edgeIds
    .map((id) => edgeMap.get(id))
    .filter((edge) => edge?.kind === 'runway-access')
    .flatMap((edge) => edge?.crossedRunwayIds ?? (edge?.runwayId === undefined ? [] : [edge.runwayId]))
    .filter((runwayId) => runwayId !== assignedRunway))];
}

/**
 * Return the physical windows where a route crosses protected runway
 * pavement. Imported graphs use their generated physical hold/crossing
 * points; procedural and legacy data retain the conservative buffer fallback.
 */
export function surfaceRouteCrossingWindows(
  graph: AirportSurfaceGraph,
  nodeIds: string[] | undefined,
  progress: number,
  assignedRunway: number,
  edgeIds?: string[],
): SurfaceRouteCrossingWindow[] {
  if (!nodeIds?.length) return [];
  const geometry = surfaceRouteGeometry(graph, nodeIds, edgeIds);
  if (geometry.totalDistance <= 0) return [];
  const graphIndex = surfaceGraphIndex(graph);
  const currentDistance = clamp(progress, 0, 1) * geometry.totalDistance;
  const windows: SurfaceRouteCrossingWindow[] = [];
  for (let edgeIndex = 0; edgeIndex < geometry.segments.length; edgeIndex += 1) {
    const segment = geometry.segments[edgeIndex];
    const edge = segment.edge;
    if (edge?.kind !== 'runway-access') continue;
    const runwayIds = edge.crossedRunwayIds ?? (edge.runwayId === undefined ? [] : [edge.runwayId]);
    for (const runwayId of runwayIds) {
      if (runwayId === assignedRunway) continue;
      const crossingId = edge.crossingIds?.find((id) =>
        graphIndex.controlPointsByCrossing.get(id)?.some((point) => point.runwayId === runwayId),
      );
      const controlPoints = crossingId ? graphIndex.controlPointsByCrossing.get(crossingId) ?? [] : [];
      const controlPair = controlPoints
        .filter((point) => point.kind === 'hold-short' && point.runwayId === runwayId)
        .map((holdPoint) => {
          const pairId = holdPoint.id.replace(/-HOLD$/, '');
          const crossingPoint = controlPoints.find((point) => point.id === `${pairId}-CROSS`);
          if (!crossingPoint) return null;
          const holdProjection = routeProjectionForPoint(geometry, holdPoint.position, edgeIndex);
          const crossingProjection = routeProjectionForPoint(geometry, crossingPoint.position, edgeIndex);
          if (holdProjection.routeDistance > crossingProjection.routeDistance + 1e-6) return null;
          return {
            holdPoint,
            crossingPoint,
            holdProjection,
            crossingProjection,
            score: holdProjection.offset + crossingProjection.offset
              + Math.abs(crossingProjection.routeDistance - segment.startDistance),
          };
        })
        .filter((pair): pair is NonNullable<typeof pair> => Boolean(pair))
        .sort((first, second) => first.score - second.score)[0];
      const holdDistance = controlPair?.holdProjection.routeDistance
        ?? Math.max(0, segment.startDistance - HOLD_SHORT_BUFFER);
      const entryDistance = controlPair?.crossingProjection.routeDistance ?? segment.startDistance;
      windows.push({
        id: crossingId ?? `${runwayId}:${edgeIndex}`,
        crossingId,
        runwayId,
        edgeId: edge.id,
        edgeIndex,
        exitEdgeIndex: edgeIndex,
        holdProgress: holdDistance / geometry.totalDistance,
        entryProgress: entryDistance / geometry.totalDistance,
        exitProgress: (segment.startDistance + segment.length) / geometry.totalDistance,
        distanceToHold: holdDistance - currentDistance,
        holdPointId: controlPair?.holdPoint.id,
        crossingPointId: controlPair?.crossingPoint.id,
      });
    }
  }
  const merged: SurfaceRouteCrossingWindow[] = [];
  for (const window of windows.sort((first, second) => first.edgeIndex - second.edgeIndex || first.runwayId - second.runwayId)) {
    const previous = [...merged].reverse().find((candidate) => candidate.runwayId === window.runwayId);
    if (
      previous
      && previous.crossingId === window.crossingId
      && window.edgeIndex <= previous.exitEdgeIndex + 1
    ) {
      previous.exitEdgeIndex = window.exitEdgeIndex;
      previous.exitProgress = Math.max(previous.exitProgress, window.exitProgress);
      continue;
    }
    merged.push({ ...window });
  }
  return merged
    .sort((first, second) => first.entryProgress - second.entryProgress || first.runwayId - second.runwayId)
    .map((window) => ({
      ...window,
      id: `${window.crossingId ?? window.runwayId}:${window.edgeIndex}-${window.exitEdgeIndex}`,
    }));
}

export function sampleSurfaceRouteWithEdges(
  graph: AirportSurfaceGraph,
  nodeIds: string[] | undefined,
  edgeIds: string[] | undefined,
  progress: number,
): SurfaceRouteSample | null {
  if (!nodeIds?.length) return null;
  return sampleSurfaceRouteGeometry(surfaceRouteGeometry(graph, nodeIds, edgeIds), progress);
}

function surfaceGraphIndex(graph: AirportSurfaceGraph): SurfaceGraphIndex {
  const cached = surfaceGraphIndexes.get(graph);
  if (cached) return cached;

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const edgeByTraversal = new Map<string, SurfaceEdge>();
  const adjacency = new Map<string, Array<{ nodeId: string; edge: SurfaceEdge; cost: number }>>();
  const controlPointsByCrossing = new Map<string, SurfaceControlPoint[]>();
  for (const point of graph.controlPoints) {
    if (!point.crossingId) continue;
    const points = controlPointsByCrossing.get(point.crossingId) ?? [];
    points.push(point);
    controlPointsByCrossing.set(point.crossingId, points);
  }
  for (const edge of graph.edges) {
    edgeByTraversal.set(surfaceTraversalKey(edge.from, edge.to), edge);
    if (edge.direction === 'both') edgeByTraversal.set(surfaceTraversalKey(edge.to, edge.from), edge);
    if (edge.kind === 'runway') continue;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
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

  const index: SurfaceGraphIndex = {
    nodeById,
    edgeById,
    edgeByTraversal,
    adjacency,
    controlPointsByCrossing,
    routeGeometry: new WeakMap<string[], SurfaceRouteGeometry>(),
  };
  surfaceGraphIndexes.set(graph, index);
  return index;
}

function surfaceRouteGeometry(graph: AirportSurfaceGraph, nodeIds: string[], edgeIds?: string[]): SurfaceRouteGeometry {
  const index = surfaceGraphIndex(graph);
  const cacheKey = edgeIds ?? nodeIds;
  const cached = index.routeGeometry.get(cacheKey);
  if (cached) return cached;

  const nodes = nodeIds.map((id) => index.nodeById.get(id)).filter((node): node is SurfaceNode => Boolean(node));
  let startDistance = 0;
  const segments = nodes.slice(0, -1).map((from, segmentIndex): SurfaceRouteSegment => {
    const to = nodes[segmentIndex + 1];
    const length = distance(from.position, to.position);
    const segment = {
      from,
      to,
      length,
      startDistance,
      edge: edgeIds?.[segmentIndex]
        ? index.edgeById.get(edgeIds[segmentIndex])
        : index.edgeByTraversal.get(surfaceTraversalKey(from.id, to.id)),
    };
    startDistance += length;
    return segment;
  });
  const geometry = { nodes, segments, totalDistance: startDistance };
  index.routeGeometry.set(cacheKey, geometry);
  return geometry;
}

function routeProjectionForPoint(
  geometry: SurfaceRouteGeometry,
  point: Point,
  maximumSegmentIndex: number,
): { routeDistance: number; offset: number } {
  let nearestDistance = Infinity;
  let routeDistance = 0;
  for (let index = 0; index <= Math.min(maximumSegmentIndex, geometry.segments.length - 1); index += 1) {
    const segment = geometry.segments[index];
    const dx = segment.to.position[0] - segment.from.position[0];
    const dy = segment.to.position[1] - segment.from.position[1];
    const lengthSquared = dx * dx + dy * dy;
    const amount = lengthSquared > 0
      ? clamp(((point[0] - segment.from.position[0]) * dx + (point[1] - segment.from.position[1]) * dy) / lengthSquared, 0, 1)
      : 0;
    const projected: Point = [segment.from.position[0] + dx * amount, segment.from.position[1] + dy * amount];
    const offset = distance(point, projected);
    if (offset >= nearestDistance) continue;
    nearestDistance = offset;
    routeDistance = segment.startDistance + segment.length * amount;
  }
  return { routeDistance, offset: nearestDistance };
}

function surfaceTraversalKey(fromNodeId: string, toNodeId: string): string {
  return `${fromNodeId}>${toNodeId}`;
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
    if (!nodeIds.has(stand.rampNodeId)) errors.push(`stand ${stand.id} has no ramp-access node`);
    if (!graph.zones.some((zone) => zone.id === stand.zoneId)) errors.push(`stand ${stand.id} references missing zone ${stand.zoneId}`);
    if (stand.maximumWingspanM <= 0 || !stand.supportedCategories.length) errors.push(`stand ${stand.id} has no aircraft compatibility`);
  }
  const passengerFacilityIds = new Set<string>();
  for (const facility of graph.passengerFacilities) {
    if (passengerFacilityIds.has(facility.id)) errors.push(`duplicate passenger facility ${facility.id}`);
    passengerFacilityIds.add(facility.id);
    if (!facility.center.every(Number.isFinite)) errors.push(`passenger facility ${facility.id} has a non-finite center`);
    for (const standId of facility.standIds)
      if (!graph.stands.some((stand) => stand.id === standId)) errors.push(`passenger facility ${facility.id} references missing stand ${standId}`);
  }
  const controlPointIds = new Set<string>();
  for (const point of graph.controlPoints) {
    if (controlPointIds.has(point.id)) errors.push(`duplicate control point ${point.id}`);
    controlPointIds.add(point.id);
    if (point.nodeId && !nodeIds.has(point.nodeId)) errors.push(`control point ${point.id} references missing node ${point.nodeId}`);
    if (point.edgeId && !edgeIds.has(point.edgeId)) errors.push(`control point ${point.id} references missing edge ${point.edgeId}`);
    if (!config.runways.some((runway) => runway.id === point.runwayId)) errors.push(`control point ${point.id} references missing runway ${point.runwayId}`);
  }
  const zoneIds = new Set<string>();
  for (const zone of graph.zones) {
    if (zoneIds.has(zone.id)) errors.push(`duplicate zone ${zone.id}`);
    zoneIds.add(zone.id);
    for (const edgeId of zone.edgeIds) if (!edgeIds.has(edgeId)) errors.push(`zone ${zone.id} references missing edge ${edgeId}`);
    for (const standId of zone.standIds) if (!graph.stands.some((stand) => stand.id === standId)) errors.push(`zone ${zone.id} references missing stand ${standId}`);
  }
  for (const hotspot of graph.hotspots) {
    for (const nodeId of hotspot.nodeIds) if (!nodeIds.has(nodeId)) errors.push(`hot spot ${hotspot.id} references missing node ${nodeId}`);
    for (const edgeId of hotspot.edgeIds) if (!edgeIds.has(edgeId)) errors.push(`hot spot ${hotspot.id} references missing edge ${edgeId}`);
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
      passengerFacilities: graph.passengerFacilities.length,
      intersections: graph.nodes.filter((node) => node.kind === 'intersection').length,
      holdShorts: graph.nodes.filter((node) => node.kind === 'hold-short').length,
      controlPoints: graph.controlPoints.length,
      zones: graph.zones.length,
      hotspots: graph.hotspots.length,
      gradeSeparatedEdges: graph.edges.filter((edge) => edge.gradeSeparation).length,
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

function pushRouteNode(heap: Array<{ nodeId: string; distance: number }>, value: { nodeId: string; distance: number }): void {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].distance <= value.distance) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = value;
}

function popMinimumRouteNode(heap: Array<{ nodeId: string; distance: number }>): { nodeId: string; distance: number } | undefined {
  if (!heap.length) return undefined;
  const minimum = heap[0];
  const replacement = heap.pop();
  if (!heap.length || !replacement) return minimum;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    const child = right < heap.length && heap[right].distance < heap[left].distance ? right : left;
    if (heap[child].distance >= replacement.distance) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = replacement;
  return minimum;
}

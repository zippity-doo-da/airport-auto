import type { AirportAirspaceProgram, AirspaceFix, AirspaceFixKind } from './airspaceProcedures';
import {
  findSurfaceRoute,
  type AirportSurfaceGraph,
  type SurfaceRoute,
  type SurfaceRoutePlanning,
  type SurfaceRouteRequirements,
} from './surfaceGraph';

export type RouteCommandResult<T> =
  | { accepted: true; value: T }
  | { accepted: false; reason: string };

const ARRIVAL_FIX_KINDS = new Set<AirspaceFixKind>(['entry', 'transition', 'downwind', 'base', 'final']);
const DEPARTURE_FIX_KINDS = new Set<AirspaceFixKind>(['departure', 'handoff', 'entry', 'transition']);
const SURFACE_VIA_NODE_KINDS = new Set(['runway-exit', 'hold-short', 'taxiway', 'intersection', 'apron-entry']);

/**
 * Validate a controller-authored route against the airport's versioned,
 * explicitly schematic procedure program. This is deliberately stricter than
 * accepting an arbitrary polyline: every point must remain inspectable and
 * replayable by fix ID.
 */
export function validateTerminalRouteAmendment(
  program: AirportAirspaceProgram,
  direction: 'arrival' | 'departure',
  fixIds: readonly string[],
  permittedFixIds: ReadonlySet<string>,
  requiredFinalFixId?: string,
): RouteCommandResult<AirspaceFix[]> {
  if (!Array.isArray(fixIds)) return { accepted: false, reason: 'route amendment requires an array of terminal fix IDs' };
  if (fixIds.length < (direction === 'arrival' ? 3 : 1)) {
    return { accepted: false, reason: `${direction} route requires at least ${direction === 'arrival' ? 3 : 1} terminal fix${direction === 'arrival' ? 'es' : ''}` };
  }
  if (fixIds.length > 12) return { accepted: false, reason: 'terminal route is limited to 12 fixes' };
  if (new Set(fixIds).size !== fixIds.length) return { accepted: false, reason: 'terminal route cannot repeat a fix' };

  const byId = new Map(program.fixes.map((fix) => [fix.id, fix]));
  const fixes: AirspaceFix[] = [];
  for (const rawId of fixIds) {
    if (typeof rawId !== 'string' || !rawId.trim()) return { accepted: false, reason: 'every route entry must be a non-empty fix ID' };
    const fix = byId.get(rawId);
    if (!fix) return { accepted: false, reason: `unknown terminal fix ${rawId}` };
    if (!permittedFixIds.has(fix.id)) return { accepted: false, reason: `${fix.name} is not compatible with the assigned runway procedure` };
    const kinds = direction === 'arrival' ? ARRIVAL_FIX_KINDS : DEPARTURE_FIX_KINDS;
    if (!kinds.has(fix.kind)) return { accepted: false, reason: `${fix.name} is a ${fix.kind} fix and cannot be used in this ${direction} route` };
    fixes.push(fix);
  }

  if (direction === 'arrival') {
    const last = fixes.at(-1);
    if (!requiredFinalFixId || last?.id !== requiredFinalFixId || last.kind !== 'final') {
      return { accepted: false, reason: 'arrival amendment must finish at the assigned runway final fix' };
    }
    const finalCount = fixes.filter((fix) => fix.kind === 'final').length;
    if (finalCount !== 1) return { accepted: false, reason: 'arrival amendment must contain exactly one final fix' };
  }
  return { accepted: true, value: fixes };
}

/**
 * Build one contiguous, aircraft-compatible surface route through ordered via
 * nodes. Directionality, closures, live congestion, and pavement width are all
 * inherited from the authoritative graph router.
 */
export function buildSurfaceRouteViaNodes(
  graph: AirportSurfaceGraph,
  startNodeId: string,
  destinationNodeId: string,
  viaNodeIds: readonly string[],
  requirements: SurfaceRouteRequirements,
  planning: SurfaceRoutePlanning,
): RouteCommandResult<SurfaceRoute> {
  if (!Array.isArray(viaNodeIds)) return { accepted: false, reason: 'taxi route requires an array of via-node IDs' };
  if (viaNodeIds.length > 8) return { accepted: false, reason: 'taxi route is limited to eight ordered via nodes' };
  if (new Set(viaNodeIds).size !== viaNodeIds.length) return { accepted: false, reason: 'taxi route cannot repeat a via node' };
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodeById.has(startNodeId) || !nodeById.has(destinationNodeId)) {
    return { accepted: false, reason: 'current or destination surface node is missing from the airport graph' };
  }
  for (const nodeId of viaNodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) return { accepted: false, reason: `unknown surface node ${nodeId}` };
    if (!SURFACE_VIA_NODE_KINDS.has(node.kind)) {
      return { accepted: false, reason: `${nodeId} is a ${node.kind} node and cannot be used as an intermediate taxi clearance` };
    }
  }

  const routeNodes = [startNodeId, ...viaNodeIds, destinationNodeId].filter((nodeId, index, values) => index === 0 || nodeId !== values[index - 1]);
  const nodeIds: string[] = [routeNodes[0]];
  const edgeIds: string[] = [];
  const taxiwayIds = new Set<string>();
  const congestedEdgeIds = new Set<string>();
  let distance = 0;
  let routingCost = 0;
  let congestionPenalty = 0;
  const usedEdges = new Set<string>();

  for (let index = 0; index < routeNodes.length - 1; index += 1) {
    const blockedEdgeIds = new Set([...(planning.blockedEdgeIds ?? []), ...usedEdges]);
    const segment = findSurfaceRoute(graph, routeNodes[index], routeNodes[index + 1], requirements, {
      edgePenaltyById: planning.edgePenaltyById,
      blockedEdgeIds,
    });
    if (!segment) {
      return { accepted: false, reason: `no compatible pavement route connects ${routeNodes[index]} to ${routeNodes[index + 1]}` };
    }
    for (const edgeId of segment.edgeIds) {
      if (usedEdges.has(edgeId)) return { accepted: false, reason: `taxi amendment would loop over surface edge ${edgeId}` };
      usedEdges.add(edgeId);
    }
    nodeIds.push(...segment.nodeIds.slice(1));
    edgeIds.push(...segment.edgeIds);
    segment.taxiwayIds.forEach((id) => taxiwayIds.add(id));
    segment.congestedEdgeIds.forEach((id) => congestedEdgeIds.add(id));
    distance += segment.distance;
    routingCost += segment.routingCost;
    congestionPenalty += segment.congestionPenalty;
  }

  return {
    accepted: true,
    value: {
      nodeIds,
      edgeIds,
      distance,
      taxiwayIds: [...taxiwayIds],
      routingCost,
      congestionPenalty,
      congestedEdgeIds: [...congestedEdgeIds],
    },
  };
}

export function selectDiversionExitFix(
  program: AirportAirspaceProgram,
  position: readonly [number, number],
  headingRadians: number,
  requestedFixId?: string,
): RouteCommandResult<AirspaceFix> {
  const candidates = program.fixes.filter((fix) => fix.kind === 'entry');
  if (requestedFixId) {
    const requested = candidates.find((fix) => fix.id === requestedFixId);
    return requested
      ? { accepted: true, value: requested }
      : { accepted: false, reason: `${requestedFixId} is not an available scope-edge diversion fix` };
  }
  const selected = [...candidates].sort((first, second) => {
    const firstTurn = angularDifference(Math.atan2(first.position[1] - position[1], first.position[0] - position[0]), headingRadians);
    const secondTurn = angularDifference(Math.atan2(second.position[1] - position[1], second.position[0] - position[0]), headingRadians);
    return firstTurn - secondTurn || first.id.localeCompare(second.id);
  })[0];
  return selected
    ? { accepted: true, value: selected }
    : { accepted: false, reason: 'airport has no scope-edge diversion fix' };
}

function angularDifference(first: number, second: number): number {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

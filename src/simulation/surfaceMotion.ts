import type { AircraftProfile } from './aircraftProfiles';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';
import {
  sampleSurfaceRouteWithEdges,
  surfaceEdgeWingtipClearanceM,
  type AirportSurfaceGraph,
  type SurfaceEdge,
  type SurfaceRouteSample,
} from './surfaceGraph';

const KNOT_TO_MPS = 0.514444;
const MINIMUM_TURN_ANGLE = Math.PI / 45;
const MAXIMUM_TURN_ANGLE = Math.PI * 5 / 6;
const SEGMENT_TANGENT_FRACTION = 0.88;
const COMFORTABLE_LATERAL_ACCELERATION_MPS2 = 0.9;

interface SurfaceLinePiece {
  kind: 'line';
  sourceStart: number;
  sourceEnd: number;
  motionStart: number;
  motionEnd: number;
  from: [number, number];
  to: [number, number];
  heading: number;
  edgeIndex: number;
}

interface SurfaceTurnPiece {
  kind: 'turn';
  sourceStart: number;
  sourceEnd: number;
  motionStart: number;
  motionEnd: number;
  center: [number, number];
  startAngle: number;
  sweep: number;
  radius: number;
  desiredRadius: number;
  speedLimitKts: number;
  incomingEdgeIndex: number;
  outgoingEdgeIndex: number;
  nodeId: string;
  constrained: boolean;
}

type SurfaceMotionPiece = SurfaceLinePiece | SurfaceTurnPiece;

interface SurfaceCornerSeed {
  nodeIndex: number;
  nodeId: string;
  sourceDistance: number;
  incomingHeading: number;
  outgoingHeading: number;
  sweep: number;
  tangent: number;
  desiredRadius: number;
}

interface SurfaceMotionPlan {
  pieces: SurfaceMotionPiece[];
  turns: SurfaceTurnPiece[];
  edges: Array<SurfaceEdge | undefined>;
  totalSourceDistance: number;
  totalMotionDistance: number;
  minimumWingtipClearanceM: number;
  limitingEdgeId?: string;
  routeClearanceOk: boolean;
}

export interface AircraftSurfaceMotionSample extends SurfaceRouteSample {
  speedLimitKts: number;
  turnRadiusM?: number;
  turnConstrained: boolean;
  nextTurnDistanceM?: number;
  nextTurnSpeedKts?: number;
  wingtipClearanceM: number;
  minimumRouteWingtipClearanceM: number;
  requiredWingtipClearanceM: number;
  routeClearanceOk: boolean;
  limitingEdgeId?: string;
}

const planCaches = new WeakMap<AirportSurfaceGraph, WeakMap<string[], Map<string, SurfaceMotionPlan>>>();

/**
 * Sample the aircraft-specific, simulation-owned taxi path. Graph centerline
 * corners are replaced with tangent circular arcs; progress remains in graph
 * space so hold-short and reservation coordinates stay stable, while motion
 * distance measures the real line/arc path used by speed integration.
 */
export function sampleAircraftSurfaceMotion(
  graph: AirportSurfaceGraph,
  nodeIds: string[] | undefined,
  edgeIds: string[] | undefined,
  progress: number,
  profile: AircraftProfile,
): AircraftSurfaceMotionSample | null {
  if (!nodeIds?.length) return null;
  const raw = sampleSurfaceRouteWithEdges(graph, nodeIds, edgeIds, progress);
  if (!raw) return null;
  const plan = aircraftSurfaceMotionPlan(graph, nodeIds, edgeIds, profile);
  if (!plan || plan.totalSourceDistance <= 0 || plan.pieces.length === 0) {
    return {
      ...raw,
      speedLimitKts: profile.taxiKts,
      turnConstrained: false,
      wingtipClearanceM: plan?.minimumWingtipClearanceM ?? Infinity,
      minimumRouteWingtipClearanceM: plan?.minimumWingtipClearanceM ?? Infinity,
      requiredWingtipClearanceM: profile.minimumWingtipClearanceM,
      routeClearanceOk: plan?.routeClearanceOk ?? true,
      limitingEdgeId: plan?.limitingEdgeId,
    };
  }

  const sourceDistance = clamp(progress, 0, 1) * plan.totalSourceDistance;
  const piece = findMotionPiece(plan.pieces, sourceDistance);
  const amount = piece.sourceEnd > piece.sourceStart
    ? clamp((sourceDistance - piece.sourceStart) / (piece.sourceEnd - piece.sourceStart), 0, 1)
    : 1;
  let x: number;
  let y: number;
  let heading: number;
  let edgeIndex: number;
  let activeTurn: SurfaceTurnPiece | undefined;
  if (piece.kind === 'turn') {
    const angle = piece.startAngle + piece.sweep * amount;
    x = piece.center[0] + Math.cos(angle) * piece.radius;
    y = piece.center[1] + Math.sin(angle) * piece.radius;
    heading = angle + Math.sign(piece.sweep) * Math.PI / 2;
    edgeIndex = amount < 0.5 ? piece.incomingEdgeIndex : piece.outgoingEdgeIndex;
    activeTurn = piece;
  } else {
    x = lerp(piece.from[0], piece.to[0], amount);
    y = lerp(piece.from[1], piece.to[1], amount);
    heading = piece.heading;
    edgeIndex = piece.edgeIndex;
  }

  const motionDistance = lerp(piece.motionStart, piece.motionEnd, amount);
  const currentEdge = plan.edges[edgeIndex] ?? raw.edge;
  const currentClearance = activeTurn
    ? Math.min(
        edgeWingtipClearanceM(graph, plan.edges[activeTurn.incomingEdgeIndex], profile.wingspanM),
        edgeWingtipClearanceM(graph, plan.edges[activeTurn.outgoingEdgeIndex], profile.wingspanM),
      )
    : edgeWingtipClearanceM(graph, currentEdge, profile.wingspanM);
  const upcomingTurn = activeTurn ?? plan.turns.find((turn) => turn.motionEnd + 1e-8 >= motionDistance);
  let speedLimitKts = profile.taxiKts;
  for (const turn of plan.turns) {
    if (turn.motionEnd < motionDistance - 1e-8) continue;
    const distanceToTurnM = Math.max(0, turn.motionStart - motionDistance) * WORLD_METERS_PER_UNIT;
    const turnSpeedMps = turn.speedLimitKts * KNOT_TO_MPS;
    const permittedMps = Math.sqrt(
      Math.max(0, turnSpeedMps * turnSpeedMps + 2 * profile.taxiBrakingMps2 * distanceToTurnM),
    );
    speedLimitKts = Math.min(speedLimitKts, permittedMps / KNOT_TO_MPS);
    if (distanceToTurnM > surfaceStoppingDistanceM(profile, profile.taxiKts, turn.speedLimitKts) + 25) break;
  }
  if (activeTurn) speedLimitKts = Math.min(speedLimitKts, activeTurn.speedLimitKts);

  return {
    ...raw,
    x,
    y,
    heading: normalizeAngle(heading),
    distanceAlong: motionDistance,
    totalDistance: plan.totalMotionDistance,
    edgeIndex,
    edge: currentEdge,
    speedLimitKts,
    turnRadiusM: activeTurn?.radius === undefined ? undefined : activeTurn.radius * WORLD_METERS_PER_UNIT,
    turnConstrained: activeTurn?.constrained ?? false,
    nextTurnDistanceM: upcomingTurn
      ? Math.max(0, upcomingTurn.motionStart - motionDistance) * WORLD_METERS_PER_UNIT
      : undefined,
    nextTurnSpeedKts: upcomingTurn?.speedLimitKts,
    wingtipClearanceM: currentClearance,
    minimumRouteWingtipClearanceM: plan.minimumWingtipClearanceM,
    requiredWingtipClearanceM: profile.minimumWingtipClearanceM,
    routeClearanceOk: plan.routeClearanceOk,
    limitingEdgeId: plan.limitingEdgeId,
  };
}

export function surfaceStoppingDistanceM(
  profile: AircraftProfile,
  speedKts: number,
  targetSpeedKts = 0,
  brakingMultiplier = 1,
): number {
  const speedMps = Math.max(0, speedKts) * KNOT_TO_MPS;
  const targetMps = Math.max(0, Math.min(speedKts, targetSpeedKts)) * KNOT_TO_MPS;
  const braking = Math.max(0.05, profile.taxiBrakingMps2 * brakingMultiplier);
  return Math.max(0, (speedMps * speedMps - targetMps * targetMps) / (2 * braking));
}

function aircraftSurfaceMotionPlan(
  graph: AirportSurfaceGraph,
  nodeIds: string[],
  edgeIds: string[] | undefined,
  profile: AircraftProfile,
): SurfaceMotionPlan | null {
  let graphCache = planCaches.get(graph);
  if (!graphCache) {
    graphCache = new WeakMap<string[], Map<string, SurfaceMotionPlan>>();
    planCaches.set(graph, graphCache);
  }
  const routeKey = edgeIds ?? nodeIds;
  let routeCache = graphCache.get(routeKey);
  if (!routeCache) {
    routeCache = new Map<string, SurfaceMotionPlan>();
    graphCache.set(routeKey, routeCache);
  }
  const profileKey = [
    profile.model,
    profile.taxiKts,
    profile.taxiTurnKts,
    profile.taxiTurnRadiusM,
    profile.taxiBrakingMps2,
    profile.wingspanM,
    profile.minimumWingtipClearanceM,
  ].join(':');
  const cached = routeCache.get(profileKey);
  if (cached) return cached;

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const edgeByTraversal = new Map<string, SurfaceEdge>();
  for (const edge of graph.edges) {
    edgeByTraversal.set(`${edge.from}>${edge.to}`, edge);
    if (edge.direction === 'both') edgeByTraversal.set(`${edge.to}>${edge.from}`, edge);
  }
  const nodes = nodeIds.map((id) => nodeById.get(id)).filter((node): node is NonNullable<typeof node> => Boolean(node));
  if (nodes.length < 2) return null;
  const edges = nodes.slice(0, -1).map((node, index) => (
    edgeIds?.[index] ? edgeById.get(edgeIds[index]) : edgeByTraversal.get(`${node.id}>${nodes[index + 1].id}`)
  ));
  const segmentLengths = nodes.slice(0, -1).map((node, index) => distance(node.position, nodes[index + 1].position));
  const nodeDistances = [0];
  for (const length of segmentLengths) nodeDistances.push(nodeDistances[nodeDistances.length - 1] + length);
  const totalSourceDistance = nodeDistances[nodeDistances.length - 1];
  const departureStand = graph.stands.find((stand) => stand.nodeId === nodes[0].id);

  const cornerByNode = new Map<number, SurfaceCornerSeed>();
  for (let nodeIndex = 1; nodeIndex < nodes.length - 1; nodeIndex += 1) {
    const node = nodes[nodeIndex];
    if (node.kind === 'stand' || node.kind === 'hold-short' || node.kind === 'runway-threshold') continue;
    // Pushback owns aircraft attitude until the sourced ramp-release node.
    // Keeping that node exact prevents an arc sampler from turning the nose
    // back toward the incoming tow segment at tug release.
    if (departureStand?.rampNodeId === node.id) continue;
    const incomingHeading = headingBetween(nodes[nodeIndex - 1].position, node.position);
    const outgoingHeading = headingBetween(node.position, nodes[nodeIndex + 1].position);
    const sweep = normalizeAngle(outgoingHeading - incomingHeading);
    const angle = Math.abs(sweep);
    if (angle < MINIMUM_TURN_ANGLE || angle > MAXIMUM_TURN_ANGLE) continue;
    const desiredRadius = profile.taxiTurnRadiusM / WORLD_METERS_PER_UNIT;
    const tangent = desiredRadius * Math.tan(angle / 2);
    if (!Number.isFinite(tangent) || tangent <= 0.001) continue;
    cornerByNode.set(nodeIndex, {
      nodeIndex,
      nodeId: node.id,
      sourceDistance: nodeDistances[nodeIndex],
      incomingHeading,
      outgoingHeading,
      sweep,
      tangent,
      desiredRadius,
    });
  }

  // Adjacent fillets share a graph segment. Reduce both radii together until
  // every turn has a straight tangent lead on that segment.
  for (let iteration = 0; iteration < 8; iteration += 1) {
    let changed = false;
    for (let edgeIndex = 0; edgeIndex < segmentLengths.length; edgeIndex += 1) {
      const startCorner = cornerByNode.get(edgeIndex);
      const endCorner = cornerByNode.get(edgeIndex + 1);
      const occupied = (startCorner?.tangent ?? 0) + (endCorner?.tangent ?? 0);
      const available = segmentLengths[edgeIndex] * SEGMENT_TANGENT_FRACTION;
      if (occupied <= available + 1e-8 || occupied <= 0) continue;
      const scale = available / occupied;
      if (startCorner) startCorner.tangent *= scale;
      if (endCorner) endCorner.tangent *= scale;
      changed = true;
    }
    if (!changed) break;
  }

  const turnsByNode = new Map<number, SurfaceTurnPiece>();
  for (const seed of cornerByNode.values()) {
    const angle = Math.abs(seed.sweep);
    const radius = seed.tangent / Math.tan(angle / 2);
    if (!Number.isFinite(radius) || radius <= 0.004) continue;
    const node = nodes[seed.nodeIndex];
    const incomingUnit: [number, number] = [Math.cos(seed.incomingHeading), Math.sin(seed.incomingHeading)];
    const entry: [number, number] = [
      node.position[0] - incomingUnit[0] * seed.tangent,
      node.position[1] - incomingUnit[1] * seed.tangent,
    ];
    const turnSign = Math.sign(seed.sweep);
    const center: [number, number] = [
      entry[0] - incomingUnit[1] * turnSign * radius,
      entry[1] + incomingUnit[0] * turnSign * radius,
    ];
    const speedFromRadiusKts = Math.sqrt(COMFORTABLE_LATERAL_ACCELERATION_MPS2 * radius * WORLD_METERS_PER_UNIT) / KNOT_TO_MPS;
    turnsByNode.set(seed.nodeIndex, {
      kind: 'turn',
      sourceStart: seed.sourceDistance - seed.tangent,
      sourceEnd: seed.sourceDistance + seed.tangent,
      motionStart: 0,
      motionEnd: 0,
      center,
      startAngle: Math.atan2(entry[1] - center[1], entry[0] - center[0]),
      sweep: seed.sweep,
      radius,
      desiredRadius: seed.desiredRadius,
      speedLimitKts: Math.min(profile.taxiTurnKts, speedFromRadiusKts),
      incomingEdgeIndex: seed.nodeIndex - 1,
      outgoingEdgeIndex: seed.nodeIndex,
      nodeId: seed.nodeId,
      constrained: radius < seed.desiredRadius * 0.8,
    });
  }

  const pieces: SurfaceMotionPiece[] = [];
  let motionDistance = 0;
  for (let edgeIndex = 0; edgeIndex < segmentLengths.length; edgeIndex += 1) {
    const from = nodes[edgeIndex];
    const to = nodes[edgeIndex + 1];
    const heading = headingBetween(from.position, to.position);
    const startTurn = turnsByNode.get(edgeIndex);
    const endTurn = turnsByNode.get(edgeIndex + 1);
    const startOffset = startTurn ? startTurn.sourceEnd - nodeDistances[edgeIndex] : 0;
    const endOffset = endTurn ? nodeDistances[edgeIndex + 1] - endTurn.sourceStart : 0;
    const lineStart: [number, number] = [
      from.position[0] + Math.cos(heading) * startOffset,
      from.position[1] + Math.sin(heading) * startOffset,
    ];
    const lineEnd: [number, number] = [
      to.position[0] - Math.cos(heading) * endOffset,
      to.position[1] - Math.sin(heading) * endOffset,
    ];
    const sourceStart = nodeDistances[edgeIndex] + startOffset;
    const sourceEnd = nodeDistances[edgeIndex + 1] - endOffset;
    const lineLength = distance(lineStart, lineEnd);
    if (sourceEnd > sourceStart + 1e-8) {
      pieces.push({
        kind: 'line',
        sourceStart,
        sourceEnd,
        motionStart: motionDistance,
        motionEnd: motionDistance + lineLength,
        from: lineStart,
        to: lineEnd,
        heading,
        edgeIndex,
      });
      motionDistance += lineLength;
    }
    if (endTurn) {
      const turnLength = endTurn.radius * Math.abs(endTurn.sweep);
      endTurn.motionStart = motionDistance;
      endTurn.motionEnd = motionDistance + turnLength;
      pieces.push(endTurn);
      motionDistance += turnLength;
    }
  }

  let minimumWingtipClearanceM = Infinity;
  let limitingEdgeId: string | undefined;
  for (const edge of edges) {
    const clearance = edgeWingtipClearanceM(graph, edge, profile.wingspanM);
    if (clearance >= minimumWingtipClearanceM) continue;
    minimumWingtipClearanceM = clearance;
    limitingEdgeId = edge?.id;
  }
  const plan: SurfaceMotionPlan = {
    pieces,
    turns: [...turnsByNode.values()].sort((first, second) => first.sourceStart - second.sourceStart),
    edges,
    totalSourceDistance,
    totalMotionDistance: motionDistance,
    minimumWingtipClearanceM,
    limitingEdgeId,
    routeClearanceOk: minimumWingtipClearanceM + 1e-6 >= profile.minimumWingtipClearanceM,
  };
  routeCache.set(profileKey, plan);
  return plan;
}

function edgeWingtipClearanceM(
  graph: AirportSurfaceGraph,
  edge: SurfaceEdge | undefined,
  wingspanM: number,
): number {
  if (!edge) return Infinity;
  if (edge.kind !== 'stand-lead-in') return surfaceEdgeWingtipClearanceM(edge, wingspanM);
  const stand = graph.stands.find((candidate) => candidate.nodeId === edge.from || candidate.nodeId === edge.to);
  // Imported stand capacity already deducts 12 m from adjacent-stand spacing,
  // leaving six metres at each wingtip when the maximum type is assigned.
  return stand ? (stand.maximumWingspanM - wingspanM) / 2 + 6 : Infinity;
}

function findMotionPiece(pieces: SurfaceMotionPiece[], sourceDistance: number): SurfaceMotionPiece {
  return pieces.find((piece) => sourceDistance <= piece.sourceEnd + 1e-8 && sourceDistance >= piece.sourceStart - 1e-8)
    ?? pieces[pieces.length - 1];
}

function headingBetween(first: [number, number], second: [number, number]): number {
  return Math.atan2(second[1] - first[1], second[0] - first[0]);
}

function distance(first: [number, number], second: [number, number]): number {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

import type { AirportConfig, RunwayConfig } from './airportConfig';
import { aircraftProfile, type AircraftModel } from './aircraftProfiles';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';
import {
  findSurfaceRoute,
  type AirportSurfaceGraph,
  type SurfaceEdge,
  type SurfaceNode,
  type SurfaceRoute,
  type SurfaceRoutePlanning,
  type SurfaceRouteRequirements,
} from './surfaceGraph';
import type { FlightRunwayExitState, RunwayBrakingAction, RunwayConditionReport, WeatherState } from './types';
import { brakingActionForCode, runwayConditionReport, runwayPerformanceMultiplier } from './weatherOperations';

export interface CompetingRunwayExitPlan {
  flightId: number;
  runwayId: number;
  operatingEnd: -1 | 1;
  nodeId: string;
  distanceFromThresholdM: number;
  taxiRouteEdgeIds: string[];
}

export interface RunwayExitSelectionInput {
  config: AirportConfig;
  runwayId: number;
  operatingEnd: -1 | 1;
  aircraft: AircraftModel;
  gateSlot: number;
  weather: Pick<WeatherState, 'surfaceCondition' | 'runwayConditionReports'>;
  conditionReport?: RunwayConditionReport;
  selectedAtSeconds: number;
  planning?: SurfaceRoutePlanning;
  competingPlans?: CompetingRunwayExitPlan[];
  flightId?: number;
}

export interface RunwayExitSelection {
  state: FlightRunwayExitState;
  route: SurfaceRoute;
}

interface CandidateGeometry {
  node: SurfaceNode;
  source: FlightRunwayExitState['source'];
  taxiwayId: string;
  taxiwayName: string;
  distanceFromThresholdM: number;
  lateralDistanceM: number;
  exitAngleDegrees: number;
}

interface ScoredCandidate {
  geometry: CandidateGeometry;
  route: SurfaceRoute;
  requiredRolloutM: number;
  availableRolloutM: number;
  stoppingMarginM: number;
  brakingAction: RunwayBrakingAction;
  brakingMultiplier: number;
  targetExitSpeedKts: number;
  highSpeed: boolean;
  routeDistanceM: number;
  congestionPenaltyM: number;
  trafficPenaltyM: number;
  score: number;
  safe: boolean;
}

const MINIMUM_EXIT_MARGIN_M = 85;
const CANDIDATE_START_FRACTION = 0.14;
const CANDIDATE_END_FRACTION = 0.985;

/**
 * Choose a reachable runway exit using aircraft stopping performance, surface
 * condition, live route cost, competing arrivals, and the assigned stand.
 * This function is deterministic and does not mutate the shared graph.
 */
export function selectRunwayExit(input: RunwayExitSelectionInput): RunwayExitSelection | null {
  const runway = input.config.runways[input.runwayId] ?? input.config.runways[0];
  const graph = input.config.surfaceGraph;
  const profile = aircraftProfile(input.aircraft);
  const requirements: SurfaceRouteRequirements = {
    wingspanM: profile.wingspanM,
    minimumWingtipClearanceM: profile.minimumWingtipClearanceM,
  };
  const stand = graph.stands.find((item) => item.slot === input.gateSlot)
    ?? graph.stands[input.gateSlot % Math.max(1, graph.stands.length)];
  if (!runway || !stand) return null;

  const blockedEdgeIds = landingRunwayBlockedEdges(graph, runway.id, input.planning?.blockedEdgeIds);
  const planning: SurfaceRoutePlanning = {
    edgePenaltyById: input.planning?.edgePenaltyById,
    blockedEdgeIds,
  };
  const geometries = runwayExitCandidateGeometry(graph, runway, input.operatingEnd);
  const scored = geometries.flatMap((geometry): ScoredCandidate[] => {
    const route = findSurfaceRoute(graph, geometry.node.id, stand.nodeId, requirements, planning);
    if (!route || route.nodeIds[0] !== geometry.node.id) return [];
    return [scoreCandidate(input, runway, geometry, route)];
  });

  // Imported fields occasionally expose only the published end access on one
  // side of an isolated runway. Preserve a safe, explicit fallback instead of
  // silently reverting to an unrelated midpoint or grass path.
  if (!scored.length) {
    const access = graph.runwayAccess.find((item) => item.runwayId === runway.id && item.end === (-input.operatingEnd as -1 | 1));
    const node = access ? graph.nodes.find((item) => item.id === access.exitNodeId) : undefined;
    if (access && node) {
      const route = findSurfaceRoute(graph, node.id, stand.nodeId, requirements, input.planning);
      if (route && route.edgeIds.every((edgeId) => !blockedEdgeIds.has(edgeId))) {
        const distanceFromThresholdM = projectedDistanceFromThreshold(runway, input.operatingEnd, node.position) * WORLD_METERS_PER_UNIT;
        const taxiway = graph.taxiways.find((item) => item.id === access.primaryTaxiwayId);
        scored.push(scoreCandidate(input, runway, {
          node,
          source: 'runway-end',
          taxiwayId: access.primaryTaxiwayId,
          taxiwayName: taxiway?.reference ?? taxiway?.name.replace(/^Taxiway\s+/i, '') ?? access.primaryTaxiwayId,
          distanceFromThresholdM,
          lateralDistanceM: runway.width * WORLD_METERS_PER_UNIT / 2,
          exitAngleDegrees: 90,
        }, route));
      }
    }
  }
  if (!scored.length) return null;

  const safe = scored.filter((candidate) => candidate.safe);
  const selected = (safe.length ? safe : scored).sort((first, second) => (
    safe.length
      ? first.score - second.score || first.geometry.node.id.localeCompare(second.geometry.node.id)
      : second.stoppingMarginM - first.stoppingMarginM || first.score - second.score || first.geometry.node.id.localeCompare(second.geometry.node.id)
  ))[0];
  const candidateCount = scored.length;
  const marginText = selected.stoppingMarginM >= 0
    ? `${Math.round(selected.stoppingMarginM)} m stopping margin`
    : `${Math.round(Math.abs(selected.stoppingMarginM))} m stopping shortfall`;
  const rationale = [
    `${selected.brakingAction} braking action · ${Math.round(selected.requiredRolloutM)} m predicted rollout`,
    `${marginText} · ${selected.highSpeed ? 'rapid' : 'standard'} exit at ${Math.round(selected.targetExitSpeedKts)} kt`,
    `${Math.round(selected.routeDistanceM)} m pavement route to ${stand.gateRef ?? stand.id}`,
  ];
  if (selected.congestionPenaltyM > 0.5) rationale.push(`${Math.round(selected.congestionPenaltyM)} m live congestion cost`);
  if (selected.trafficPenaltyM > 0.5) rationale.push('arrival-exit spacing applied');

  return {
    route: selected.route,
    state: {
      runwayId: runway.id,
      operatingEnd: input.operatingEnd,
      nodeId: selected.geometry.node.id,
      taxiwayId: selected.geometry.taxiwayId,
      taxiwayName: selected.geometry.taxiwayName,
      source: selected.geometry.source,
      selectedAtSeconds: input.selectedAtSeconds,
      candidateCount,
      distanceFromThresholdM: round(selected.geometry.distanceFromThresholdM),
      touchdownDistanceM: round(touchdownDistanceM(runway)),
      requiredRolloutM: round(selected.requiredRolloutM),
      availableRolloutM: round(selected.availableRolloutM),
      stoppingMarginM: round(selected.stoppingMarginM),
      brakingAction: selected.brakingAction,
      brakingMultiplier: selected.brakingMultiplier,
      targetExitSpeedKts: round(selected.targetExitSpeedKts),
      exitAngleDegrees: round(selected.geometry.exitAngleDegrees),
      highSpeed: selected.highSpeed,
      routeDistanceM: round(selected.routeDistanceM),
      congestionPenaltyM: round(selected.congestionPenaltyM),
      trafficPenaltyM: round(selected.trafficPenaltyM),
      score: round(selected.score),
      safe: selected.safe,
      taxiRouteEdgeIds: [...selected.route.edgeIds],
      rationale,
    },
  };
}

/** Exposed for deterministic validation and developer telemetry. */
export function runwayExitCandidateNodeIds(
  graph: AirportSurfaceGraph,
  runway: RunwayConfig,
  operatingEnd: -1 | 1,
): string[] {
  return runwayExitCandidateGeometry(graph, runway, operatingEnd).map((candidate) => candidate.node.id);
}

export function runwayExitBrakingMultiplier(surfaceCondition: WeatherState['surfaceCondition']): number {
  if (surfaceCondition === 'contaminated') return 1.34;
  if (surfaceCondition === 'wet') return 1.17;
  return 1;
}

function runwayExitCandidateGeometry(
  graph: AirportSurfaceGraph,
  runway: RunwayConfig,
  operatingEnd: -1 | 1,
): CandidateGeometry[] {
  const blocking = landingRunwayBlockedEdges(graph, runway.id);
  const edgesByNode = new Map<string, SurfaceEdge[]>();
  for (const edge of graph.edges) {
    for (const nodeId of [edge.from, edge.to]) {
      const list = edgesByNode.get(nodeId) ?? [];
      list.push(edge);
      edgesByNode.set(nodeId, list);
    }
  }
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const candidateByNode = new Map<string, CandidateGeometry>();
  for (const edge of graph.edges) {
    if (!blocking.has(edge.id) || edge.kind === 'runway') continue;
    for (const nodeId of [edge.from, edge.to]) {
      const node = nodeById.get(nodeId);
      if (!node || candidateByNode.has(node.id)) continue;
      const distanceWorld = projectedDistanceFromThreshold(runway, operatingEnd, node.position);
      if (distanceWorld < runway.length * CANDIDATE_START_FRACTION || distanceWorld > runway.length * CANDIDATE_END_FRACTION) continue;
      const lateralWorld = lateralDistanceFromCenterline(runway, node.position);
      if (lateralWorld < Math.max(0.45, runway.width * 0.28)) continue;
      const adjacent = edgesByNode.get(node.id) ?? [];
      if (!adjacent.some((candidate) => !blocking.has(candidate.id))) continue;
      const taxiwayId = preferredTaxiwayId(graph, node, adjacent, edge);
      const taxiway = graph.taxiways.find((item) => item.id === taxiwayId);
      candidateByNode.set(node.id, {
        node,
        source: 'surface-graph',
        taxiwayId,
        taxiwayName: taxiway?.reference ?? taxiway?.name.replace(/^Taxiway\s+/i, '') ?? edge.name.replace(/^Taxiway\s+/i, ''),
        distanceFromThresholdM: distanceWorld * WORLD_METERS_PER_UNIT,
        lateralDistanceM: lateralWorld * WORLD_METERS_PER_UNIT,
        exitAngleDegrees: exitAngleDegrees(node, adjacent.filter((candidate) => blocking.has(candidate.id)), nodeById, runway, operatingEnd),
      });
    }
  }
  return [...candidateByNode.values()].sort((first, second) => (
    first.distanceFromThresholdM - second.distanceFromThresholdM || first.node.id.localeCompare(second.node.id)
  ));
}

function scoreCandidate(
  input: RunwayExitSelectionInput,
  runway: RunwayConfig,
  geometry: CandidateGeometry,
  route: SurfaceRoute,
): ScoredCandidate {
  const profile = aircraftProfile(input.aircraft);
  const report = input.conditionReport ?? runwayConditionReport(input.weather, runway.id);
  const brakingMultiplier = runwayPerformanceMultiplier(report.worstCode, 'landing');
  const brakingAction: RunwayBrakingAction = brakingActionForCode(report.worstCode);
  const highSpeed = geometry.exitAngleDegrees <= 58;
  const targetExitSpeedKts = highSpeed
    ? Math.min(45, Math.max(profile.taxiKts + 10, profile.approachKts * 0.3))
    : profile.taxiKts + 3;
  const approachSquared = profile.approachKts ** 2;
  const referenceSquared = (profile.taxiKts + 3) ** 2;
  const exitSquared = targetExitSpeedKts ** 2;
  const speedFraction = clamp(
    (approachSquared - exitSquared) / Math.max(1, approachSquared - referenceSquared),
    0.8,
    1,
  );
  const requiredRolloutM = profile.landingRollM * speedFraction * brakingMultiplier;
  const touchdownM = touchdownDistanceM(runway);
  const availableRolloutM = Math.max(0, geometry.distanceFromThresholdM - touchdownM);
  const stoppingMarginM = availableRolloutM - requiredRolloutM;
  const safe = stoppingMarginM >= MINIMUM_EXIT_MARGIN_M;
  const routeDistanceM = route.distance * WORLD_METERS_PER_UNIT;
  const congestionPenaltyM = route.congestionPenalty * WORLD_METERS_PER_UNIT;
  const trafficPenaltyM = competingTrafficPenalty(input, geometry, route);
  const tightMarginPenalty = Math.max(0, 180 - stoppingMarginM) * 1.7;
  const unsafePenalty = Math.max(0, MINIMUM_EXIT_MARGIN_M - stoppingMarginM) * 18;
  const turnPenalty = Math.max(0, geometry.exitAngleDegrees - 55) * 2.2;
  const score = geometry.distanceFromThresholdM * 0.34
    + routeDistanceM * 0.18
    + congestionPenaltyM * 1.35
    + trafficPenaltyM
    + tightMarginPenalty
    + unsafePenalty
    + turnPenalty;
  return {
    geometry,
    route,
    requiredRolloutM,
    availableRolloutM,
    stoppingMarginM,
    brakingAction,
    brakingMultiplier,
    targetExitSpeedKts,
    highSpeed,
    routeDistanceM,
    congestionPenaltyM,
    trafficPenaltyM,
    score,
    safe,
  };
}

function competingTrafficPenalty(
  input: RunwayExitSelectionInput,
  geometry: CandidateGeometry,
  route: SurfaceRoute,
): number {
  let penalty = 0;
  const initialEdges = new Set(route.edgeIds.slice(0, 6));
  for (const plan of input.competingPlans ?? []) {
    if (plan.flightId === input.flightId) continue;
    if (plan.nodeId === geometry.node.id) penalty += 700;
    if (plan.runwayId === input.runwayId && plan.operatingEnd === input.operatingEnd && Math.abs(plan.distanceFromThresholdM - geometry.distanceFromThresholdM) < 360) penalty += 180;
    const overlap = plan.taxiRouteEdgeIds.slice(0, 6).filter((edgeId) => initialEdges.has(edgeId)).length;
    penalty += overlap * 55;
  }
  return penalty;
}

function landingRunwayBlockedEdges(
  graph: AirportSurfaceGraph,
  runwayId: number,
  existing?: ReadonlySet<string>,
): Set<string> {
  const blocked = new Set(existing ?? []);
  for (const edge of graph.edges) {
    const belongsToRunway = edge.runwayId === runwayId || edge.crossedRunwayIds?.includes(runwayId);
    if (belongsToRunway && (edge.kind === 'runway' || edge.kind === 'runway-access')) blocked.add(edge.id);
  }
  return blocked;
}

function preferredTaxiwayId(
  graph: AirportSurfaceGraph,
  node: SurfaceNode,
  adjacent: SurfaceEdge[],
  runwayEdge: SurfaceEdge,
): string {
  const candidates = [
    ...node.taxiwayIds,
    ...adjacent.filter((edge) => edge.kind !== 'runway').map((edge) => edge.taxiwayId),
    runwayEdge.taxiwayId,
  ].filter((value): value is string => Boolean(value));
  return candidates.find((id) => graph.taxiways.some((taxiway) => taxiway.id === id)) ?? `EXIT-RWY-${runwayEdge.runwayId ?? 'X'}`;
}

function exitAngleDegrees(
  node: SurfaceNode,
  runwayEdges: SurfaceEdge[],
  nodeById: Map<string, SurfaceNode>,
  runway: RunwayConfig,
  operatingEnd: -1 | 1,
): number {
  const travel = runwayTravelDirection(runway, operatingEnd);
  const angles = runwayEdges.flatMap((edge): number[] => {
    const neighbor = nodeById.get(edge.from === node.id ? edge.to : edge.from);
    if (!neighbor) return [];
    const dx = node.position[0] - neighbor.position[0];
    const dy = node.position[1] - neighbor.position[1];
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return [];
    const cosine = clamp((dx / length) * travel[0] + (dy / length) * travel[1], -1, 1);
    return [Math.acos(cosine) * 180 / Math.PI];
  });
  return clamp(angles.length ? Math.min(...angles) : 90, 25, 135);
}

function projectedDistanceFromThreshold(
  runway: RunwayConfig,
  operatingEnd: -1 | 1,
  position: [number, number],
): number {
  const direction: [number, number] = [Math.cos(runway.heading), Math.sin(runway.heading)];
  const threshold: [number, number] = [
    runway.center[0] + direction[0] * operatingEnd * runway.length / 2,
    runway.center[1] + direction[1] * operatingEnd * runway.length / 2,
  ];
  const travel = runwayTravelDirection(runway, operatingEnd);
  return (position[0] - threshold[0]) * travel[0] + (position[1] - threshold[1]) * travel[1];
}

function lateralDistanceFromCenterline(runway: RunwayConfig, position: [number, number]): number {
  const side: [number, number] = [-Math.sin(runway.heading), Math.cos(runway.heading)];
  return Math.abs((position[0] - runway.center[0]) * side[0] + (position[1] - runway.center[1]) * side[1]);
}

function runwayTravelDirection(runway: RunwayConfig, operatingEnd: -1 | 1): [number, number] {
  return [-operatingEnd * Math.cos(runway.heading), -operatingEnd * Math.sin(runway.heading)];
}

function touchdownDistanceM(runway: RunwayConfig): number {
  return Math.min(4.5, runway.length * 0.075) * WORLD_METERS_PER_UNIT;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

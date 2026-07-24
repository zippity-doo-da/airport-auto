import type { AirportConfig } from './airportConfig';
import { aircraftProfile } from './aircraftProfiles';
import {
  findSurfaceRoute,
  type AirportSurfaceGraph,
  type SurfaceRoute,
  type SurfaceRoutePlanning,
} from './surfaceGraph';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';
import type { Flight, FlightDeicingState, WeatherState } from './types';

export interface DeicingLane {
  id: string;
  number: number;
  nodeId: string;
  position: [number, number];
}

export interface DeicingFacility {
  id: string;
  name: string;
  zoneId: string;
  capacity: number;
  classification: 'published' | 'derived';
  lanes: DeicingLane[];
}

export interface DeicingRoutePlan {
  route: SurfaceRoute;
  facility: DeicingFacility;
  lane: DeicingLane;
  queueHoldProgress: number;
  treatmentProgress: number;
  padExitProgress: number;
  treatmentDurationSeconds: number;
  holdoverSeconds: number;
}

const MAX_FACILITY_CAPACITY = 4;
const MIN_LANE_SPACING_WORLD = 2.8;
const facilityCache = new WeakMap<AirportSurfaceGraph, DeicingFacility[]>();

export function createDeicingState(reason = 'No frozen precipitation requires treatment.'): FlightDeicingState {
  return {
    required: false,
    status: 'not-required',
    queuePosition: 0,
    queueHoldProgress: 0,
    treatmentProgress: 0,
    padExitProgress: 0,
    treatmentDurationSeconds: 0,
    treatmentElapsedSeconds: 0,
    holdoverSeconds: 0,
    holdoverRemainingSeconds: 0,
    fluid: 'Type I',
    cycle: 0,
    reason,
  };
}

export function winterDeicingRequired(weather: WeatherState): boolean {
  return weather.weatherEnabled && weather.condition === 'snow' && weather.temperatureC <= 4;
}

export function deicingFacilities(graph: AirportSurfaceGraph): DeicingFacility[] {
  const cached = facilityCache.get(graph);
  if (cached) return cached.map(cloneFacility);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const facilities = graph.zones
    .filter((zone) => zone.kind === 'deicing-pad')
    .map((zone): DeicingFacility | null => {
      const safeEdges = zone.edgeIds
        .map((edgeId) => edgeById.get(edgeId))
        .filter((edge) => Boolean(
          edge
          && edge.kind !== 'runway'
          && edge.kind !== 'runway-access'
          && !edge.runwayId
          && !edge.crossedRunwayIds?.length,
        ));
      const degree = new Map<string, number>();
      for (const edge of safeEdges) {
        if (!edge) continue;
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
      }
      const ring = zone.rings[0] ?? [];
      const center: [number, number] = ring.length
        ? [
            ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
            ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
          ]
        : [0, 0];
      const candidates = [...degree]
        .map(([nodeId, connections]) => ({ node: nodeById.get(nodeId), connections }))
        .filter((candidate) => candidate.node && candidate.node.kind !== 'stand')
        .sort((first, second) => (
          second.connections - first.connections
          || distanceSquared(first.node!.position, center) - distanceSquared(second.node!.position, center)
          || first.node!.id.localeCompare(second.node!.id)
        ));
      const laneNodes: NonNullable<(typeof candidates)[number]['node']>[] = [];
      for (const candidate of candidates) {
        if (!candidate.node) continue;
        if (laneNodes.some((node) => distance(node.position, candidate.node!.position) < MIN_LANE_SPACING_WORLD)) continue;
        laneNodes.push(candidate.node);
        if (laneNodes.length >= MAX_FACILITY_CAPACITY) break;
      }
      if (!laneNodes.length) return null;
      const lanes = laneNodes
        .sort((first, second) => first.position[1] - second.position[1] || first.position[0] - second.position[0])
        .map((node, index): DeicingLane => ({
          id: `${zone.id}:LANE-${index + 1}`,
          number: index + 1,
          nodeId: node.id,
          position: [...node.position],
        }));
      return {
        id: `DEICE-${zone.id}`,
        name: zone.name,
        zoneId: zone.id,
        capacity: lanes.length,
        classification: zone.classification,
        lanes,
      };
    })
    .filter((facility): facility is DeicingFacility => Boolean(facility));
  facilityCache.set(graph, facilities);
  return facilities.map(cloneFacility);
}

export function planDeicingTaxiRoute(
  config: AirportConfig,
  flight: Flight,
  planning?: SurfaceRoutePlanning,
  fromNodeId?: string,
): DeicingRoutePlan | null {
  const graph = config.surfaceGraph;
  const profile = aircraftProfile(flight.aircraft);
  const requirements = {
    wingspanM: profile.wingspanM,
    minimumWingtipClearanceM: profile.minimumWingtipClearanceM,
  };
  const stand = graph.stands.find((candidate) => candidate.slot === flight.gateSlot);
  const startNodeId = fromNodeId ?? stand?.nodeId;
  const access = graph.runwayAccess.find((candidate) => (
    candidate.runwayId === flight.runway && candidate.end === flight.operatingEnd
  ));
  if (!startNodeId || !access) return null;
  const options: Array<{
    facility: DeicingFacility;
    lane: DeicingLane;
    inbound: SurfaceRoute;
    outbound: SurfaceRoute;
    score: number;
  }> = [];
  for (const facility of deicingFacilities(graph)) {
    for (const lane of facility.lanes) {
      const inbound = findSurfaceRoute(graph, startNodeId, lane.nodeId, requirements, planning);
      const outbound = findSurfaceRoute(graph, lane.nodeId, access.holdShortNodeId, requirements, planning);
      if (!inbound || !outbound) continue;
      options.push({
        facility,
        lane,
        inbound,
        outbound,
        score: inbound.routingCost + outbound.routingCost,
      });
    }
  }
  if (!options.length) return null;
  options.sort((first, second) => first.score - second.score || first.lane.id.localeCompare(second.lane.id));
  const bestScore = options[0].score;
  const balanced = options.filter((option) => option.score <= bestScore * 1.18 + 4);
  const selected = balanced[(flight.id + Math.max(0, flight.deicing.cycle)) % balanced.length];
  const route = concatenateRoutes(selected.inbound, selected.outbound);
  const treatmentProgress = route.distance > 0 ? selected.inbound.distance / route.distance : 0;
  const queueBufferWorld = Math.max(2.8, profile.lengthM / WORLD_METERS_PER_UNIT + 1.45);
  const queueHoldProgress = route.distance > 0
    ? Math.max(0, selected.inbound.distance - queueBufferWorld) / route.distance
    : 0;
  const padExitProgress = route.distance > 0
    ? Math.min(1, (selected.inbound.distance + queueBufferWorld * 0.72) / route.distance)
    : 1;
  return {
    route,
    facility: selected.facility,
    lane: selected.lane,
    queueHoldProgress,
    treatmentProgress,
    padExitProgress,
    treatmentDurationSeconds: deicingTreatmentDurationSeconds(flight),
    holdoverSeconds: deicingHoldoverSeconds(flight, config),
  };
}

export function applyDeicingRoutePlan(
  flight: Flight,
  plan: DeicingRoutePlan,
  status: FlightDeicingState['status'] = 'enroute',
): void {
  const cycle = Math.max(1, flight.deicing.cycle || 1);
  flight.deicing = {
    required: true,
    status,
    facilityId: plan.facility.id,
    facilityName: plan.facility.name,
    laneId: plan.lane.id,
    laneNumber: plan.lane.number,
    queuePosition: 0,
    queueHoldProgress: plan.queueHoldProgress,
    treatmentProgress: plan.treatmentProgress,
    padExitProgress: plan.padExitProgress,
    treatmentDurationSeconds: plan.treatmentDurationSeconds,
    treatmentElapsedSeconds: 0,
    holdoverSeconds: plan.holdoverSeconds,
    holdoverRemainingSeconds: 0,
    fluid: 'Type I + Type IV',
    cycle,
    reason: `Frozen precipitation requires treatment at ${plan.facility.name}, lane ${plan.lane.number}.`,
  };
}

export function markDeicingNotRequired(flight: Flight, reason?: string): void {
  flight.deicing = createDeicingState(reason);
}

export function markStartupPretreated(flight: Flight, nowSeconds: number, config: AirportConfig): void {
  const holdoverSeconds = deicingHoldoverSeconds(flight, config);
  flight.deicing = {
    ...createDeicingState('Aircraft already taxiing when winter simulation began; pre-entry treatment is recorded.'),
    required: true,
    status: 'protected',
    treatmentDurationSeconds: deicingTreatmentDurationSeconds(flight),
    treatmentElapsedSeconds: deicingTreatmentDurationSeconds(flight),
    holdoverSeconds,
    holdoverRemainingSeconds: holdoverSeconds,
    fluid: 'Type I + Type IV',
    cycle: 1,
    treatmentCompletedSeconds: nowSeconds,
    holdoverExpiresSeconds: nowSeconds + holdoverSeconds,
  };
}

export function deicingMovementLimit(flight: Flight): number | null {
  if (!flight.deicing.required || flight.phase !== 'taxi-out') return null;
  if (flight.deicing.status === 'queued') return flight.deicing.queueHoldProgress;
  if (flight.deicing.status === 'positioning' || flight.deicing.status === 'treating') {
    return flight.deicing.treatmentProgress;
  }
  return null;
}

export function deicingReleaseValid(flight: Flight, weather: WeatherState, nowSeconds: number): boolean {
  if (!winterDeicingRequired(weather)) return true;
  if (!flight.deicing.required || flight.deicing.status !== 'protected') return false;
  return (flight.deicing.holdoverExpiresSeconds ?? -Infinity) > nowSeconds + 1e-6;
}

function deicingTreatmentDurationSeconds(flight: Flight): number {
  if (flight.category === 'regional') return 20;
  if (flight.category === 'narrowbody') return 26;
  return flight.category === 'cargo' ? 38 : 36;
}

function deicingHoldoverSeconds(flight: Flight, config: AirportConfig): number {
  const categorySeconds = flight.category === 'regional' ? 330 : flight.category === 'narrowbody' ? 390 : 450;
  const seedAdjustment = Math.abs((config.seed + flight.id * 17) % 37);
  return categorySeconds + seedAdjustment;
}

function concatenateRoutes(first: SurfaceRoute, second: SurfaceRoute): SurfaceRoute {
  return {
    nodeIds: [...first.nodeIds, ...second.nodeIds.slice(1)],
    edgeIds: [...first.edgeIds, ...second.edgeIds],
    distance: first.distance + second.distance,
    taxiwayIds: [...new Set([...first.taxiwayIds, ...second.taxiwayIds])],
    routingCost: first.routingCost + second.routingCost,
    congestionPenalty: first.congestionPenalty + second.congestionPenalty,
    congestedEdgeIds: [...new Set([...first.congestedEdgeIds, ...second.congestedEdgeIds])],
  };
}

function cloneFacility(facility: DeicingFacility): DeicingFacility {
  return {
    ...facility,
    lanes: facility.lanes.map((lane) => ({ ...lane, position: [...lane.position] })),
  };
}

function distance(first: [number, number], second: [number, number]): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function distanceSquared(first: [number, number], second: [number, number]): number {
  const x = first[0] - second[0];
  const y = first[1] - second[1];
  return x * x + y * y;
}

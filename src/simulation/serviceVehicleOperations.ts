import type { AirportConfig } from './airportConfig';
import { aircraftProfile } from './aircraftProfiles';
import { aircraftCollisionEnvelope } from './collisionDetection';
import { findSurfaceRoute, sampleSurfaceRouteWithEdges, surfaceEdgeIndex, surfaceNodeIndex, type AirportSurfaceGraph, type SurfaceRoute, type SurfaceRoutePlanning, type SurfaceStand } from './surfaceGraph';
import { surfaceRouteReservationClaims, type SurfaceReservationClaim } from './surfaceOperations';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';
import type { Flight, ServiceVehicleState, ServiceVehicleStatus, ServiceVehicleType, TurnaroundServiceType } from './types';

type Point = [number, number];

interface ServiceVehicleRouteGeometry {
  outboundRoute: string[];
  returnRoute: string[];
  standPath: Point[];
  dispatchPoints: Point[];
  returnPoints: Point[];
  outboundGraphDistance: number;
  returnGraphDistance: number;
  dispatchDistance: number;
  returnDistance: number;
}

const serviceVehicleRouteGeometryCache = new WeakMap<ServiceVehicleState, ServiceVehicleRouteGeometry>();

interface VehicleSpec {
  type: ServiceVehicleType;
  label: string;
  maximumSpeedMps: number;
  side: 'left' | 'right';
  longitudinal: number;
  stagingOffset: number;
}

const VEHICLE_BY_SERVICE: Partial<Record<TurnaroundServiceType, VehicleSpec>> = {
  fueling: {
    type: 'fuel-truck',
    label: 'Fuel truck',
    maximumSpeedMps: 5.8,
    side: 'left',
    longitudinal: 0.28,
    stagingOffset: 0,
  },
  baggage: {
    type: 'baggage-cart',
    label: 'Baggage train',
    maximumSpeedMps: 6.4,
    side: 'left',
    longitudinal: -0.38,
    stagingOffset: 1,
  },
  cargo: {
    type: 'cargo-loader',
    label: 'Cargo loader',
    maximumSpeedMps: 4.8,
    side: 'left',
    longitudinal: -0.05,
    stagingOffset: 1.8,
  },
  catering: {
    type: 'catering-truck',
    label: 'Catering truck',
    maximumSpeedMps: 5.4,
    side: 'right',
    longitudinal: 0.34,
    stagingOffset: 0,
  },
  cleaning: {
    type: 'cleaning-van',
    label: 'Cabin-service van',
    maximumSpeedMps: 7.2,
    side: 'right',
    longitudinal: -0.14,
    stagingOffset: 1,
  },
  maintenance: {
    type: 'maintenance-van',
    label: 'Maintenance van',
    maximumSpeedMps: 7.4,
    side: 'left',
    longitudinal: 0.68,
    stagingOffset: 2.6,
  },
};

export interface ServiceVehicleTransition {
  type: 'dispatch' | 'staged' | 'arrive' | 'return' | 'clear';
  vehicle: ServiceVehicleState;
}

export interface ServiceVehicleConflict {
  type: 'vehicle-vehicle' | 'vehicle-aircraft';
  vehicle: string;
  otherVehicle?: string;
  flight?: number;
  distance: number;
  requiredDistance: number;
  vehicleStatus: ServiceVehicleStatus;
  otherVehicleStatus?: ServiceVehicleStatus;
}

/** Create all equipment needed by this actual gate turn. */
export function createServiceVehiclePlans(config: AirportConfig, flight: Flight, actualGateInSeconds: number, reservedDepotNodeIds: ReadonlySet<string> = new Set(), planning?: SurfaceRoutePlanning): ServiceVehicleState[] {
  const stand = config.surfaceGraph.stands.find((candidate) => candidate.id === flight.standId);
  if (!stand) return [];
  const allocatedDepotNodeIds = new Set(reservedDepotNodeIds);
  return flight.turnaround.tasks
    .filter((task) => task.required)
    .flatMap((task) => {
      const spec = vehicleSpecForService(task.type, flight);
      if (!spec) return [];
      const routes = serviceDepotRoutes(config.surfaceGraph, stand, task.type, flight.id, allocatedDepotNodeIds, presentationScale(config) * 1.8, planning);
      allocatedDepotNodeIds.add(routes.depotNodeId);
      const standPath = serviceStandPath(config, flight, stand, spec);
      const outboundTravelSeconds = (routes.outbound.distance * WORLD_METERS_PER_UNIT) / spec.maximumSpeedMps;
      const localTravelSeconds = (polylineLength(standPath) * WORLD_METERS_PER_UNIT) / spec.maximumSpeedMps;
      // Work backward from the planned gate-in/service time so equipment can
      // pre-position while the aircraft is taxiing in. A plan created after
      // that release time dispatches on the next fixed tick.
      const dispatchAtSeconds = actualGateInSeconds
        + task.scheduledStartOffsetSeconds
        - outboundTravelSeconds
        - localTravelSeconds;
      const depot = config.surfaceGraph.nodes.find((node) => node.id === routes.depotNodeId)?.position ?? standPath[0];
      const sideCode = spec.side === 'left' ? 'L' : 'R';
      return [
        {
          id: `SV-${flight.id}-${task.type}`,
          flightId: flight.id,
          callsign: flight.callsign,
          service: task.type,
          type: spec.type,
          label: spec.label,
          status: 'scheduled' as const,
          standId: stand.id,
          zoneId: stand.zoneId,
          bayId: `${stand.id}-${sideCode}-${task.type}`,
          standSide: spec.side,
          depotNodeId: routes.depotNodeId,
          outboundRoute: [...routes.outbound.nodeIds],
          outboundRouteEdges: [...routes.outbound.edgeIds],
          returnRoute: [...routes.returning.nodeIds],
          returnRouteEdges: [...routes.returning.edgeIds],
          standPath,
          dispatchAtSeconds,
          progress: 0,
          x: depot[0],
          y: depot[1],
          heading: stand.heading,
          groundSpeedMps: 0,
          maximumSpeedMps: spec.maximumSpeedMps,
          currentNode: routes.depotNodeId,
          held: false,
          protectedMovementArea: false,
          protectedMovementAuthorized: false,
        },
      ];
    });
}

export function vehicleSpecForService(service: TurnaroundServiceType, flight: Flight): VehicleSpec | undefined {
  if (service === 'boarding' && flight.gateAssignment?.serviceArea !== 'passenger-terminal') {
    return {
      type: 'passenger-bus',
      label: 'Passenger coach',
      maximumSpeedMps: 6.2,
      side: 'right',
      longitudinal: -0.58,
      stagingOffset: 2,
    };
  }
  return VEHICLE_BY_SERVICE[service];
}

/** Services without a physical vehicle (for example a terminal jet bridge). */
export function ungatedServiceTypes(flight: Flight, vehicles: ServiceVehicleState[]): Set<TurnaroundServiceType> {
  const vehicleServices = new Set(vehicles.map((vehicle) => vehicle.service));
  return new Set(flight.turnaround.tasks.filter((task) => task.required && !vehicleServices.has(task.type)).map((task) => task.type));
}

export function availableVehicleServices(flight: Flight, vehicles: ServiceVehicleState[]): Set<TurnaroundServiceType> {
  const available = ungatedServiceTypes(flight, vehicles);
  for (const vehicle of vehicles) {
    if (vehicle.flightId !== flight.id) continue;
    if (vehicle.status === 'servicing' || vehicle.status === 'clearing' || vehicle.status === 'returning' || vehicle.status === 'complete') {
      available.add(vehicle.service);
    }
  }
  return available;
}

export function serviceVehiclesBlockingPushback(vehicles: ServiceVehicleState[], flightId: number): ServiceVehicleState[] {
  return vehicles.filter((vehicle) => vehicle.flightId === flightId && (vehicle.status === 'approaching' || vehicle.status === 'servicing' || vehicle.status === 'clearing'));
}

export function serviceVehicleOwnerId(vehicle: ServiceVehicleState): string {
  return `vehicle:${vehicle.id}`;
}

/**
 * Service equipment treats graph edges as exclusive. Aircraft may follow one
 * another on an edge, but a slower ramp vehicle owns its short segment until
 * clear so neither an aircraft nor another vehicle can overtake through it.
 */
export function serviceVehicleReservationClaims(graph: AirportSurfaceGraph, vehicle: ServiceVehicleState, lookaheadEdges = 1): SurfaceReservationClaim[] {
  if (vehicle.status === 'scheduled' || vehicle.status === 'complete') return [];
  if (vehicle.status === 'dispatching' || vehicle.status === 'returning') {
    const nodeIds = vehicle.status === 'dispatching' ? vehicle.outboundRoute : vehicle.returnRoute;
    const edgeIds = vehicle.status === 'dispatching' ? vehicle.outboundRouteEdges : vehicle.returnRouteEdges;
    const graphProgress = serviceVehicleGraphProgress(graph, vehicle);
    if (graphProgress === null) {
      const boundaryEdgeId = vehicle.status === 'dispatching'
        ? vehicle.outboundRouteEdges[vehicle.outboundRouteEdges.length - 1]
        : vehicle.returnRouteEdges[0];
      const boundaryEdge = surfaceEdgeIndex(graph).get(boundaryEdgeId);
      const claims: SurfaceReservationClaim[] = [
        {
          kind: 'node',
          id: vehicle.status === 'dispatching' ? (vehicle.outboundRoute[vehicle.outboundRoute.length - 1] ?? vehicle.depotNodeId) : (vehicle.returnRoute[0] ?? vehicle.depotNodeId),
          label: `${vehicle.standId} ramp service junction`,
          capacity: 1,
        },
        {
          kind: 'service-lane',
          // The graph-to-stand connector and the stand-side path share one
          // directional service lane. A vehicle cannot be released into that
          // connector while another is still clearing toward it.
          id: `${vehicle.standId}-${vehicle.standSide}`,
          label: `${vehicle.standId} ${vehicle.standSide} staging lane`,
          capacity: 1,
        },
      ];
      if (boundaryEdge) {
        claims.push({
          kind: 'edge',
          id: boundaryEdge.id,
          label: boundaryEdge.name,
          direction: serviceVehicleOwnerId(vehicle),
          capacity: 1,
        });
      }
      return claims;
    }
    return surfaceRouteReservationClaims(
      graph,
      nodeIds,
      edgeIds,
      graphProgress,
      vehicle.status === 'dispatching' ? 'taxi-in' : 'taxi-out',
      lookaheadEdges,
    )
      // A short ramp vehicle owns its physical edge, node, and stand lane; it
      // must not acquire airport-wide directional control of a named aircraft
      // taxiway merely while using a service-road segment beside it.
      .filter((claim) => claim.kind !== 'taxiway-flow')
      .map((claim) => (claim.kind === 'edge' || claim.kind === 'alley' ? { ...claim, direction: serviceVehicleOwnerId(vehicle) } : claim));
  }
  if (vehicle.status === 'staged')
    return [
      {
        kind: 'service-staging',
        id: vehicle.id,
        label: `${vehicle.label} staging position`,
        capacity: 1,
      },
    ];
  if (vehicle.status === 'servicing')
    return [
      {
        kind: 'service-bay',
        id: vehicle.bayId,
        label: `${vehicle.label} service bay`,
        capacity: 1,
      },
    ];
  const lane: SurfaceReservationClaim = {
    kind: 'service-lane',
    id: `${vehicle.standId}-${vehicle.standSide}`,
    label: `${vehicle.standId} ${vehicle.standSide} service lane`,
    capacity: 1,
  };
  return vehicle.status === 'approaching'
    ? [
        lane,
        {
          kind: 'service-bay',
          id: vehicle.bayId,
          label: `${vehicle.label} service bay`,
          capacity: 1,
        },
      ]
    : [lane];
}

export function setServiceVehicleStatus(graph: AirportSurfaceGraph, vehicle: ServiceVehicleState, status: ServiceVehicleStatus): void {
  vehicle.status = status;
  vehicle.progress = 0;
  vehicle.groundSpeedMps = 0;
  vehicle.held = false;
  vehicle.holdReason = undefined;
  syncServiceVehiclePose(graph, vehicle);
}

/** Advance only authoritative fixed-step motion. Returns true at stage end. */
export function advanceServiceVehicleMotion(graph: AirportSurfaceGraph, vehicle: ServiceVehicleState, deltaSeconds: number): boolean {
  if (vehicle.held) {
    vehicle.groundSpeedMps = 0;
    syncServiceVehiclePose(graph, vehicle);
    return false;
  }
  const distanceWorld = serviceVehicleStageDistance(graph, vehicle);
  if (distanceWorld <= 1e-6) {
    vehicle.progress = 1;
    vehicle.groundSpeedMps = 0;
    syncServiceVehiclePose(graph, vehicle);
    return true;
  }
  const acceleration = vehicle.groundSpeedMps < vehicle.maximumSpeedMps ? 1.8 : -2.2;
  vehicle.groundSpeedMps = clamp(vehicle.groundSpeedMps + acceleration * deltaSeconds, 0, vehicle.maximumSpeedMps);
  const remainingM = Math.max(0, (1 - vehicle.progress) * distanceWorld * WORLD_METERS_PER_UNIT);
  const brakingSpeed = Math.sqrt(Math.max(0, 2 * 2.2 * remainingM));
  vehicle.groundSpeedMps = Math.min(vehicle.groundSpeedMps, brakingSpeed);
  vehicle.progress = clamp(vehicle.progress + (vehicle.groundSpeedMps * deltaSeconds) / (distanceWorld * WORLD_METERS_PER_UNIT), 0, 1);
  if (vehicle.progress > 1 - 1e-7) {
    vehicle.progress = 1;
    vehicle.groundSpeedMps = 0;
  }
  syncServiceVehiclePose(graph, vehicle);
  return vehicle.progress >= 1;
}

export function syncServiceVehiclePose(graph: AirportSurfaceGraph, vehicle: ServiceVehicleState): void {
  vehicle.currentEdge = undefined;
  vehicle.currentNode = undefined;
  let sample: {
    x: number;
    y: number;
    heading: number;
    edge?: { id: string };
    nearestNodeId?: string;
  } | null = null;
  if (vehicle.status === 'dispatching') {
    sample = samplePolyline(serviceVehicleTravelPoints(graph, vehicle), vehicle.progress);
    const graphProgress = serviceVehicleGraphProgress(graph, vehicle);
    const graphSample = graphProgress === null ? null : sampleSurfaceRouteWithEdges(graph, vehicle.outboundRoute, vehicle.outboundRouteEdges, graphProgress);
    if (graphSample)
      sample = {
        ...sample!,
        edge: graphSample.edge,
        nearestNodeId: graphSample.nearestNodeId,
      };
  } else if (vehicle.status === 'returning') {
    sample = samplePolyline(serviceVehicleTravelPoints(graph, vehicle), vehicle.progress);
    const graphProgress = serviceVehicleGraphProgress(graph, vehicle);
    const graphSample = graphProgress === null ? null : sampleSurfaceRouteWithEdges(graph, vehicle.returnRoute, vehicle.returnRouteEdges, graphProgress);
    if (graphSample)
      sample = {
        ...sample!,
        edge: graphSample.edge,
        nearestNodeId: graphSample.nearestNodeId,
      };
  } else if (vehicle.status === 'approaching') {
    sample = samplePolyline(vehicle.standPath, vehicle.progress);
  } else if (vehicle.status === 'clearing') {
    sample = samplePolyline([...vehicle.standPath].reverse(), vehicle.progress);
  } else if (vehicle.status === 'staged') {
    sample = samplePolyline(vehicle.standPath, 0);
  } else if (vehicle.status === 'servicing') {
    sample = samplePolyline(vehicle.standPath, 1);
  } else {
    const depot = surfaceNodeIndex(graph).get(vehicle.depotNodeId);
    if (depot)
      sample = {
        x: depot.position[0],
        y: depot.position[1],
        heading: vehicle.heading,
        nearestNodeId: depot.id,
      };
  }
  if (!sample) return;
  vehicle.x = sample.x;
  vehicle.y = sample.y;
  vehicle.heading = sample.heading;
  vehicle.currentEdge = sample.edge?.id;
  vehicle.currentNode = sample.nearestNodeId;
  vehicle.protectedMovementArea = Boolean(vehicle.currentEdge && serviceVehicleProtectedEdgeIds(graph).has(vehicle.currentEdge));
}

export function serviceVehicleProtectedEdgeIds(graph: AirportSurfaceGraph): Set<string> {
  return new Set(graph.edges.filter((edge) => edge.kind === 'runway' || edge.kind === 'runway-access' || edge.runwayId !== undefined || Boolean(edge.crossedRunwayIds?.length)).map((edge) => edge.id));
}

export function serviceVehicleRouteViolations(graph: AirportSurfaceGraph, vehicles: ServiceVehicleState[]): Array<{ vehicle: string; edge: string }> {
  const protectedEdges = serviceVehicleProtectedEdgeIds(graph);
  return vehicles.flatMap((vehicle) => [...new Set([...vehicle.outboundRouteEdges, ...vehicle.returnRouteEdges])].filter((edge) => protectedEdges.has(edge) && !vehicle.protectedMovementAuthorized).map((edge) => ({ vehicle: vehicle.id, edge })));
}

export function findServiceVehicleConflicts(config: AirportConfig, vehicles: ServiceVehicleState[], flights: Flight[]): ServiceVehicleConflict[] {
  const active = vehicles.filter((vehicle) => vehicle.status !== 'scheduled' && vehicle.status !== 'complete');
  const conflicts: ServiceVehicleConflict[] = [];
  for (let firstIndex = 0; firstIndex < active.length; firstIndex += 1) {
    const first = active[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < active.length; secondIndex += 1) {
      const second = active[secondIndex];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      // The resource ledger owns the wider operational buffer. Diagnostics
      // report actual presentation-envelope contact only, so adjacent service
      // lanes that remain physically clear are not mislabeled as collisions.
      const requiredDistance = serviceVehicleRadius(config, first) + serviceVehicleRadius(config, second);
      if (distance + 1e-6 < requiredDistance)
        conflicts.push({
          type: 'vehicle-vehicle',
          vehicle: first.id,
          otherVehicle: second.id,
          distance,
          requiredDistance,
          vehicleStatus: first.status,
          otherVehicleStatus: second.status,
        });
    }
    for (const flight of flights) {
      if (flight.id === first.flightId) continue;
      const aircraft = aircraftCollisionEnvelope(config, flight);
      if (!aircraft.surface) continue;
      const distance = Math.hypot(first.x - aircraft.x, first.y - aircraft.y);
      const requiredDistance = serviceVehicleRadius(config, first) + aircraft.bodyRadius;
      if (distance + 1e-6 < requiredDistance)
        conflicts.push({
          type: 'vehicle-aircraft',
          vehicle: first.id,
          flight: flight.id,
          distance,
          requiredDistance,
          vehicleStatus: first.status,
        });
    }
  }
  return conflicts;
}

export function serviceVehicleRadius(config: Pick<AirportConfig, 'scope'>, vehicle: Pick<ServiceVehicleState, 'type'>): number {
  const large = vehicle.type === 'passenger-bus' || vehicle.type === 'baggage-cart' || vehicle.type === 'cargo-loader';
  return presentationScale(config) * (large ? 0.8 : 0.62);
}

function serviceDepotRoutes(graph: AirportSurfaceGraph, stand: SurfaceStand, service: TurnaroundServiceType, flightId: number, reservedDepotNodeIds: ReadonlySet<string>, minimumDepotSeparation: number, planning?: SurfaceRoutePlanning): { depotNodeId: string; outbound: SurfaceRoute; returning: SurfaceRoute } {
  const blockedEdgeIds = new Set([...serviceVehicleProtectedEdgeIds(graph), ...(planning?.blockedEdgeIds ?? [])]);
  const edgeById = surfaceEdgeIndex(graph);
  const nodeById = surfaceNodeIndex(graph);
  const zone = graph.zones.find((candidate) => candidate.id === stand.zoneId);
  const zoneEdges = (zone?.edgeIds ?? []).map((edgeId) => edgeById.get(edgeId)).filter((edge) => edge && !blockedEdgeIds.has(edge.id));
  const nearbyEdges = graph.edges.filter((edge) => {
    if (blockedEdgeIds.has(edge.id)) return false;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return false;
    return Math.min(distance(from.position, stand.position), distance(to.position, stand.position)) <= 16;
  });
  const candidateIds = [...new Set([...zoneEdges, ...nearbyEdges].flatMap((edge) => (edge ? [edge.from, edge.to] : [])))]
    .filter((nodeId) => nodeId !== stand.nodeId && nodeId !== stand.rampNodeId)
    .filter((nodeId) => {
      const position = nodeById.get(nodeId)?.position;
      if (!position) return false;
      return [...reservedDepotNodeIds].every((reservedNodeId) => {
        const reservedPosition = nodeById.get(reservedNodeId)?.position;
        return !reservedPosition || distance(position, reservedPosition) >= minimumDepotSeparation;
      });
    })
    .filter((nodeId) => {
      const kind = nodeById.get(nodeId)?.kind;
      return kind !== 'stand' && kind !== 'runway-threshold' && kind !== 'runway-exit' && kind !== 'hold-short';
    });
  const targetDistance = 2.8 + positiveModulo(stringHash(`${service}:${flightId}`), 6) * 0.62;
  const candidates = candidateIds
    .flatMap((nodeId) => {
      const routePlanning: SurfaceRoutePlanning = { edgePenaltyById: planning?.edgePenaltyById, blockedEdgeIds };
      const outbound = findSurfaceRoute(graph, nodeId, stand.rampNodeId, undefined, routePlanning);
      const returning = findSurfaceRoute(graph, stand.rampNodeId, nodeId, undefined, routePlanning);
      if (!outbound || !returning) return [];
      const jitter = positiveModulo(stringHash(`${service}:${nodeId}`), 101) / 1_000;
      return [
        {
          nodeId,
          outbound,
          returning,
          score: Math.abs(outbound.distance - targetDistance) + returning.distance * 0.08 + jitter,
        },
      ];
    })
    .sort((first, second) => first.score - second.score || first.nodeId.localeCompare(second.nodeId));
  const selected = candidates[0];
  if (selected)
    return {
      depotNodeId: selected.nodeId,
      outbound: selected.outbound,
      returning: selected.returning,
    };
  const stationary: SurfaceRoute = {
    nodeIds: [stand.rampNodeId],
    edgeIds: [],
    distance: 0,
    taxiwayIds: [stand.apronTaxiwayId],
    routingCost: 0,
    congestionPenalty: 0,
    congestedEdgeIds: [],
  };
  return {
    depotNodeId: stand.rampNodeId,
    outbound: stationary,
    returning: { ...stationary, nodeIds: [...stationary.nodeIds] },
  };
}

function serviceStandPath(config: AirportConfig, flight: Flight, stand: SurfaceStand, spec: VehicleSpec): Point[] {
  const profile = aircraftProfile(flight.aircraft);
  const scale = presentationScale(config);
  const halfLength = (profile.visual.bodyLength * scale) / 2;
  const halfSpan = (profile.visual.wingSpan * scale) / 2;
  const lateral = Math.max(profile.visual.bodyRadius * scale + scale * 0.56, halfSpan * 0.52);
  const side = spec.side === 'left' ? 1 : -1;
  const forward: Point = [Math.cos(stand.heading), Math.sin(stand.heading)];
  const left: Point = [-forward[1], forward[0]];
  const staging = add(add(stand.position, forward, -(halfLength + scale * (1.2 + spec.stagingOffset * 1.45))), left, side * (lateral + scale * (1.35 + spec.stagingOffset * 0.28)));
  const bend = add(add(stand.position, forward, spec.longitudinal * halfLength), left, side * (lateral + scale * 2));
  const bay = add(add(stand.position, forward, spec.longitudinal * halfLength), left, side * lateral);
  // The graph route terminates at ramp. The unique staging point fans vehicles
  // away from that shared node before they request a side-specific stand lane.
  return dedupePoints([staging, bend, bay]);
}

function serviceVehicleStageDistance(graph: AirportSurfaceGraph, vehicle: ServiceVehicleState): number {
  if (vehicle.status === 'dispatching' || vehicle.status === 'returning') {
    const geometry = serviceVehicleRouteGeometry(graph, vehicle);
    return vehicle.status === 'returning' ? geometry.returnDistance : geometry.dispatchDistance;
  }
  if (vehicle.status === 'approaching' || vehicle.status === 'clearing') return polylineLength(vehicle.standPath);
  return 0;
}

function serviceVehicleTravelPoints(graph: AirportSurfaceGraph, vehicle: ServiceVehicleState): Point[] {
  const geometry = serviceVehicleRouteGeometry(graph, vehicle);
  return vehicle.status === 'returning' ? geometry.returnPoints : geometry.dispatchPoints;
}

/** Null means the vehicle is on the stand-to-graph staging connector. */
function serviceVehicleGraphProgress(graph: AirportSurfaceGraph, vehicle: ServiceVehicleState): number | null {
  const geometry = serviceVehicleRouteGeometry(graph, vehicle);
  const graphDistance = vehicle.status === 'returning' ? geometry.returnGraphDistance : geometry.outboundGraphDistance;
  const totalDistance = vehicle.status === 'returning' ? geometry.returnDistance : geometry.dispatchDistance;
  if (totalDistance <= 1e-9 || graphDistance <= 1e-9) return null;
  const travelled = clamp(vehicle.progress, 0, 1) * totalDistance;
  if (vehicle.status === 'returning') {
    const connectorDistance = Math.max(0, totalDistance - graphDistance);
    if (travelled + 1e-7 < connectorDistance) return null;
    return clamp((travelled - connectorDistance) / graphDistance, 0, 1);
  }
  if (travelled > graphDistance + 1e-7) return null;
  return clamp(travelled / graphDistance, 0, 1);
}

function routeDistance(graph: AirportSurfaceGraph, nodeIds: string[]): number {
  const nodeById = surfaceNodeIndex(graph);
  return nodeIds.slice(0, -1).reduce((total, nodeId, index) => {
    const from = nodeById.get(nodeId);
    const to = nodeById.get(nodeIds[index + 1]);
    return total + (from && to ? distance(from.position, to.position) : 0);
  }, 0);
}

function serviceVehicleRouteGeometry(graph: AirportSurfaceGraph, vehicle: ServiceVehicleState): ServiceVehicleRouteGeometry {
  const cached = serviceVehicleRouteGeometryCache.get(vehicle);
  if (
    cached
    && cached.outboundRoute === vehicle.outboundRoute
    && cached.returnRoute === vehicle.returnRoute
    && cached.standPath === vehicle.standPath
  ) return cached;
  const nodeById = surfaceNodeIndex(graph);
  const dispatchPoints = dedupePoints([
    ...vehicle.outboundRoute.map((nodeId) => nodeById.get(nodeId)?.position).filter((point): point is Point => Boolean(point)),
    vehicle.standPath[0],
  ]);
  const returnPoints = dedupePoints([
    vehicle.standPath[0],
    ...vehicle.returnRoute.map((nodeId) => nodeById.get(nodeId)?.position).filter((point): point is Point => Boolean(point)),
  ]);
  const geometry: ServiceVehicleRouteGeometry = {
    outboundRoute: vehicle.outboundRoute,
    returnRoute: vehicle.returnRoute,
    standPath: vehicle.standPath,
    dispatchPoints,
    returnPoints,
    outboundGraphDistance: routeDistance(graph, vehicle.outboundRoute),
    returnGraphDistance: routeDistance(graph, vehicle.returnRoute),
    dispatchDistance: polylineLength(dispatchPoints),
    returnDistance: polylineLength(returnPoints),
  };
  serviceVehicleRouteGeometryCache.set(vehicle, geometry);
  return geometry;
}

function samplePolyline(points: Point[], progress: number): { x: number; y: number; heading: number } | null {
  if (!points.length) return null;
  if (points.length === 1) return { x: points[0][0], y: points[0][1], heading: 0 };
  const lengths = points.slice(0, -1).map((point, index) => distance(point, points[index + 1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = clamp(progress, 0, 1) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining > length && index < lengths.length - 1) {
      remaining -= length;
      continue;
    }
    const from = points[index];
    const to = points[index + 1];
    const amount = length <= 1e-9 ? 1 : clamp(remaining / length, 0, 1);
    return {
      x: from[0] + (to[0] - from[0]) * amount,
      y: from[1] + (to[1] - from[1]) * amount,
      heading: Math.atan2(to[1] - from[1], to[0] - from[0]),
    };
  }
  const last = points[points.length - 1];
  return { x: last[0], y: last[1], heading: 0 };
}

function presentationScale(config: Pick<AirportConfig, 'scope'>): number {
  return config.scope === 'center' ? 0.17 : 0.92;
}

function add(point: Point, vector: Point, amount: number): Point {
  return [point[0] + vector[0] * amount, point[1] + vector[1] * amount];
}

function dedupePoints(points: Point[]): Point[] {
  return points.filter((point, index) => index === 0 || distance(point, points[index - 1]) > 1e-5);
}

function polylineLength(points: Point[]): number {
  return points.slice(0, -1).reduce((total, point, index) => total + distance(point, points[index + 1]), 0);
}

function distance(first: Point, second: Point): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function stringHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

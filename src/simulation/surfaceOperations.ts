import {
  sampleSurfaceRouteWithEdges,
  type AirportSurfaceGraph,
  type SurfaceEdge,
  type SurfaceOperationalZone,
  type SurfaceRoutePlanning,
  type SurfaceStand,
} from './surfaceGraph';

export type SurfaceFlowDirection = 'inbound' | 'outbound';
export type SurfaceReservationKind = 'edge' | 'node' | 'alley' | 'stand' | 'ramp-zone';

export interface SurfaceRampControlZone {
  id: string;
  name: string;
  kind: SurfaceOperationalZone['kind'];
  operationalZoneId: string;
  edgeIds: string[];
  standIds: string[];
  capacity: number;
}

export interface SurfaceStandPath {
  nodeIds: [string, string];
  edgeIds: [string];
  direction: SurfaceFlowDirection;
}

export interface SurfaceStandFlow {
  standId: string;
  alleyId: string;
  rampControlZoneId: string | null;
  leadIn: SurfaceStandPath;
  leadOut: SurfaceStandPath;
}

export interface SurfaceOperationalState {
  flowDirection: SurfaceFlowDirection;
  rampControlZoneId: string | null;
  rampControlZoneName: string | null;
  rampControlZoneCapacity: number | null;
  alleyId: string | null;
  standPath: 'lead-in' | 'lead-out' | null;
}

export interface SurfaceReservationClaim {
  kind: SurfaceReservationKind;
  id: string;
  label: string;
  direction?: string;
  capacity: number;
}

export interface SurfaceTrafficMovement {
  flightId: number;
  phase: 'taxi-in' | 'taxi-out';
  nodeIds: string[] | undefined;
  edgeIds: string[] | undefined;
  progress: number;
}

export interface SurfaceCongestionPlanning extends SurfaceRoutePlanning {
  edgePenaltyById: ReadonlyMap<string, number>;
  occupiedEdgeIds: string[];
  totalPenalty: number;
}

/** Deterministic per-tick resource ledger shared by Auto and test harnesses. */
export class SurfaceReservationLedger {
  private readonly reservedNodes = new Map<string, number>();
  private readonly reservedEdges = new Map<string, { direction: string; flight: number }>();
  private readonly reservedAlleys = new Map<string, { direction: string; flights: Set<number> }>();
  private readonly reservedStands = new Map<string, number>();
  private readonly rampZoneOccupants = new Map<string, Set<number>>();

  firstConflict(claims: SurfaceReservationClaim[]): SurfaceReservationClaim | undefined {
    return claims.find((claim) => {
      if (claim.kind === 'node') return this.reservedNodes.has(claim.id);
      if (claim.kind === 'edge') {
        const reservation = this.reservedEdges.get(claim.id);
        return Boolean(reservation && reservation.direction !== claim.direction);
      }
      if (claim.kind === 'alley') {
        const reservation = this.reservedAlleys.get(claim.id);
        return Boolean(reservation && reservation.direction !== claim.direction);
      }
      if (claim.kind === 'stand') return this.reservedStands.has(claim.id);
      if (claim.kind === 'ramp-zone') return (this.rampZoneOccupants.get(claim.id)?.size ?? 0) >= claim.capacity;
      return false;
    });
  }

  reserve(flightId: number, claims: SurfaceReservationClaim[]): void {
    for (const claim of claims) {
      if (claim.kind === 'node') this.reservedNodes.set(claim.id, flightId);
      if (claim.kind === 'edge' && !this.reservedEdges.has(claim.id)) {
        this.reservedEdges.set(claim.id, { direction: claim.direction ?? '', flight: flightId });
      }
      if (claim.kind === 'alley') {
        const reservation = this.reservedAlleys.get(claim.id);
        if (reservation) reservation.flights.add(flightId);
        else this.reservedAlleys.set(claim.id, { direction: claim.direction ?? '', flights: new Set([flightId]) });
      }
      if (claim.kind === 'stand') this.reservedStands.set(claim.id, flightId);
      if (claim.kind === 'ramp-zone') {
        const occupants = this.rampZoneOccupants.get(claim.id) ?? new Set<number>();
        occupants.add(flightId);
        this.rampZoneOccupants.set(claim.id, occupants);
      }
    }
  }
}

interface SurfaceOperationsIndex {
  edgeById: Map<string, SurfaceEdge>;
  standById: Map<string, SurfaceStand>;
  leadEdgeByStandId: Map<string, SurfaceEdge>;
  standByLeadEdgeId: Map<string, SurfaceStand>;
  rampZoneByEdgeId: Map<string, SurfaceRampControlZone>;
  rampZoneByStandId: Map<string, SurfaceRampControlZone>;
  rampZones: SurfaceRampControlZone[];
}

const RAMP_ZONE_KINDS = new Set<SurfaceOperationalZone['kind']>([
  'terminal-apron',
  'cargo-ramp',
  'general-aviation',
  'maintenance',
  'remote-ramp',
]);
const operationsIndexes = new WeakMap<AirportSurfaceGraph, SurfaceOperationsIndex>();

export function surfaceRampControlZones(graph: AirportSurfaceGraph): SurfaceRampControlZone[] {
  return operationsIndex(graph).rampZones.map((zone) => ({
    ...zone,
    edgeIds: [...zone.edgeIds],
    standIds: [...zone.standIds],
  }));
}

export function surfaceStandFlow(graph: AirportSurfaceGraph, standId: string | undefined): SurfaceStandFlow | null {
  if (!standId) return null;
  const index = operationsIndex(graph);
  const stand = index.standById.get(standId);
  if (!stand) return null;
  const leadEdge = index.leadEdgeByStandId.get(stand.id);
  if (!leadEdge) return null;
  const zone = index.rampZoneByStandId.get(stand.id);
  return {
    standId: stand.id,
    alleyId: stand.apronTaxiwayId,
    rampControlZoneId: zone?.id ?? null,
    leadIn: {
      nodeIds: [stand.rampNodeId, stand.nodeId],
      edgeIds: [leadEdge.id],
      direction: 'inbound',
    },
    leadOut: {
      nodeIds: [stand.nodeId, stand.rampNodeId],
      edgeIds: [leadEdge.id],
      direction: 'outbound',
    },
  };
}

export function surfaceRouteOperationalState(
  graph: AirportSurfaceGraph,
  nodeIds: string[] | undefined,
  edgeIds: string[] | undefined,
  progress: number,
  phase: 'taxi-in' | 'resting' | 'taxi-out',
  standId: string | undefined,
): SurfaceOperationalState {
  const flowDirection: SurfaceFlowDirection = phase === 'taxi-in' ? 'inbound' : 'outbound';
  const index = operationsIndex(graph);
  const stand = standId ? index.standById.get(standId) : undefined;
  const sample = phase === 'resting' ? null : sampleSurfaceRouteWithEdges(graph, nodeIds, edgeIds, progress);
  const edge = sample?.edge;
  const leadStand = edge ? index.standByLeadEdgeId.get(edge.id) : undefined;
  const relevantStand = leadStand ?? stand;
  const zone = edge
    ? index.rampZoneByEdgeId.get(edge.id) ?? (relevantStand ? index.rampZoneByStandId.get(relevantStand.id) : undefined)
    : relevantStand
      ? index.rampZoneByStandId.get(relevantStand.id)
      : undefined;
  const alleyId = edge
    ? rampAlleyId(edge, relevantStand)
    : relevantStand?.apronTaxiwayId ?? null;
  const standPath = edge && leadStand
    ? flowDirection === 'inbound' ? 'lead-in' : 'lead-out'
    : null;
  return {
    flowDirection,
    rampControlZoneId: zone?.id ?? null,
    rampControlZoneName: zone?.name ?? null,
    rampControlZoneCapacity: zone?.capacity ?? null,
    alleyId,
    standPath,
  };
}

/**
 * Reserve the physical route plus operational ramp resources. Alley claims
 * permit same-direction flow but exclude opposing traffic until the alley is
 * clear; stand paths remain exclusive; ramp zones enforce a finite capacity.
 */
export function surfaceRouteReservationClaims(
  graph: AirportSurfaceGraph,
  nodeIds: string[] | undefined,
  edgeIds: string[] | undefined,
  progress: number,
  phase: 'taxi-in' | 'taxi-out',
  lookaheadEdges = 2,
): SurfaceReservationClaim[] {
  const sample = sampleSurfaceRouteWithEdges(graph, nodeIds, edgeIds, progress);
  if (!sample || !nodeIds?.length || !edgeIds?.length || sample.edgeIndex < 0) return [];
  const index = operationsIndex(graph);
  const claims = new Map<string, SurfaceReservationClaim>();
  const flowDirection: SurfaceFlowDirection = phase === 'taxi-in' ? 'inbound' : 'outbound';
  const lastEdgeIndex = Math.min(edgeIds.length - 1, sample.edgeIndex + lookaheadEdges);
  for (let edgeIndex = sample.edgeIndex; edgeIndex <= lastEdgeIndex; edgeIndex += 1) {
    const edge = index.edgeById.get(edgeIds[edgeIndex]);
    const from = nodeIds[edgeIndex];
    const to = nodeIds[edgeIndex + 1];
    if (!edge || !from || !to) continue;
    addClaim(claims, {
      kind: 'edge',
      id: edge.id,
      label: edge.name,
      direction: `${from}>${to}`,
      capacity: 1,
    });
    if (edgeIndex > sample.edgeIndex || sample.edgeProgress > 0.64) {
      addClaim(claims, { kind: 'node', id: to, label: `intersection ${to}`, capacity: 1 });
    }
    const leadStand = index.standByLeadEdgeId.get(edge.id);
    if (leadStand) {
      addClaim(claims, {
        kind: 'stand',
        id: leadStand.id,
        label: `${leadStand.gateRef ?? leadStand.id} stand path`,
        capacity: 1,
      });
    }
    const alleyId = rampAlleyId(edge, leadStand);
    if (alleyId) {
      addClaim(claims, {
        kind: 'alley',
        id: alleyId,
        label: rampAlleyLabel(graph, alleyId),
        direction: flowDirection,
        capacity: 2,
      });
    }
    const zone = index.rampZoneByEdgeId.get(edge.id)
      ?? (leadStand ? index.rampZoneByStandId.get(leadStand.id) : undefined);
    if (zone) {
      addClaim(claims, {
        kind: 'ramp-zone',
        id: zone.id,
        label: zone.name,
        capacity: zone.capacity,
      });
    }
  }
  return [...claims.values()];
}

/** Build live edge costs without changing the physical route geometry. */
export function surfaceCongestionPlanning(
  graph: AirportSurfaceGraph,
  traffic: SurfaceTrafficMovement[],
  excludedFlightId?: number,
): SurfaceCongestionPlanning {
  const edgePenaltyById = new Map<string, number>();
  const index = operationsIndex(graph);
  for (const movement of traffic) {
    if (movement.flightId === excludedFlightId || !movement.edgeIds?.length || !movement.nodeIds?.length) continue;
    const sample = sampleSurfaceRouteWithEdges(
      graph,
      movement.nodeIds,
      movement.edgeIds,
      movement.progress,
    );
    if (!sample || sample.edgeIndex < 0) continue;
    const finalIndex = Math.min(movement.edgeIds.length - 1, sample.edgeIndex + 10);
    for (let edgeIndex = sample.edgeIndex; edgeIndex <= finalIndex; edgeIndex += 1) {
      const edgeId = movement.edgeIds[edgeIndex];
      const edge = index.edgeById.get(edgeId);
      if (!edge) continue;
      const offset = edgeIndex - sample.edgeIndex;
      const basePenalty = Math.max(1.25, 12 - offset * 1.1);
      const rampMultiplier = rampAlleyId(edge, index.standByLeadEdgeId.get(edge.id)) ? 1.55 : 1;
      edgePenaltyById.set(edgeId, (edgePenaltyById.get(edgeId) ?? 0) + basePenalty * rampMultiplier);
    }
  }
  return {
    edgePenaltyById,
    occupiedEdgeIds: [...edgePenaltyById.keys()].sort(),
    totalPenalty: [...edgePenaltyById.values()].reduce((total, penalty) => total + penalty, 0),
  };
}

function operationsIndex(graph: AirportSurfaceGraph): SurfaceOperationsIndex {
  const cached = operationsIndexes.get(graph);
  if (cached) return cached;
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const standById = new Map(graph.stands.map((stand) => [stand.id, stand]));
  const leadEdgeByStandId = new Map<string, SurfaceEdge>();
  const standByLeadEdgeId = new Map<string, SurfaceStand>();
  for (const stand of graph.stands) {
    const leadEdge = graph.edges.find((edge) => (
      (edge.from === stand.nodeId && edge.to === stand.rampNodeId)
      || (edge.to === stand.nodeId && edge.from === stand.rampNodeId)
    ));
    if (leadEdge) {
      leadEdgeByStandId.set(stand.id, leadEdge);
      standByLeadEdgeId.set(leadEdge.id, stand);
    }
  }
  const rampZones = graph.zones
    .filter((zone) => RAMP_ZONE_KINDS.has(zone.kind))
    .filter((zone) => zone.edgeIds.length > 0 || zone.standIds.length > 0)
    .map((zone) => ({
      id: `RAMP-${zone.id}`,
      name: zone.name,
      kind: zone.kind,
      operationalZoneId: zone.id,
      edgeIds: [...zone.edgeIds],
      standIds: [...zone.standIds],
      capacity: rampZoneCapacity(zone),
    }));
  const rampZoneByEdgeId = new Map<string, SurfaceRampControlZone>();
  const rampZoneByStandId = new Map<string, SurfaceRampControlZone>();
  for (const zone of rampZones) {
    for (const edgeId of zone.edgeIds) if (!rampZoneByEdgeId.has(edgeId)) rampZoneByEdgeId.set(edgeId, zone);
    for (const standId of zone.standIds) rampZoneByStandId.set(standId, zone);
  }
  const index = {
    edgeById,
    standById,
    leadEdgeByStandId,
    standByLeadEdgeId,
    rampZoneByEdgeId,
    rampZoneByStandId,
    rampZones,
  };
  operationsIndexes.set(graph, index);
  return index;
}

function rampZoneCapacity(zone: SurfaceOperationalZone): number {
  if (zone.kind === 'maintenance') return 1;
  if (zone.kind === 'general-aviation') return 2;
  if (zone.kind === 'cargo-ramp') return 2;
  if (zone.kind === 'remote-ramp') return Math.max(1, Math.min(3, Math.ceil(Math.max(zone.edgeIds.length, zone.standIds.length) / 8)));
  return Math.max(2, Math.min(6, Math.ceil(Math.max(zone.edgeIds.length / 48, zone.standIds.length / 6))));
}

function rampAlleyId(edge: SurfaceEdge, leadStand: SurfaceStand | undefined): string | null {
  if (leadStand) return leadStand.apronTaxiwayId;
  return edge.taxiwayId?.startsWith('RAMP-') ? edge.taxiwayId : null;
}

function rampAlleyLabel(graph: AirportSurfaceGraph, alleyId: string): string {
  return graph.taxiways.find((taxiway) => taxiway.id === alleyId)?.name ?? alleyId;
}

function addClaim(claims: Map<string, SurfaceReservationClaim>, claim: SurfaceReservationClaim): void {
  const key = `${claim.kind}:${claim.id}`;
  if (!claims.has(key)) claims.set(key, claim);
}

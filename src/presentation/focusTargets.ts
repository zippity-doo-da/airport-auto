import type { AirportConfig } from '../simulation/airportConfig';
import type { OperationQueueEntry, OperationQueueSnapshot } from '../simulation/operationQueues';
import type { AirportState, ConflictPrediction, Flight } from '../simulation/types';

export const FOCUS_TARGET_KINDS = [
  'flight',
  'runway',
  'taxiway',
  'gate',
  'queue',
  'conflict',
] as const;

export type FocusTargetKind = (typeof FOCUS_TARGET_KINDS)[number];
export type FocusTargetFollow = 'static' | 'flight' | 'group' | 'vehicle';
export type FocusTargetTone = 'blue' | 'amber' | 'rose';

export interface FocusTargetRef {
  kind: FocusTargetKind;
  id: string;
}

export interface FocusTargetDescriptor extends FocusTargetRef {
  key: string;
  label: string;
  detail: string;
  position: [number, number];
  radius: number;
  suggestedZoom: number;
  follow: FocusTargetFollow;
  flightIds: number[];
  serviceVehicleId?: string;
  selectableFlightId?: number;
  tone: FocusTargetTone;
}

export interface FocusTargetCategory {
  kind: FocusTargetKind;
  label: string;
  count: number;
}

export interface FocusTargetCatalog {
  schemaVersion: 1;
  generatedAtSeconds: number;
  categories: FocusTargetCategory[];
  targets: FocusTargetDescriptor[];
  total: number;
}

export interface FocusTargetRegistry {
  build(
    state: AirportState,
    queues: OperationQueueSnapshot,
    conflicts: readonly ConflictPrediction[],
  ): FocusTargetCatalog;
}

const CATEGORY_LABELS: Record<FocusTargetKind, string> = {
  flight: 'Aircraft',
  runway: 'Runways',
  taxiway: 'Taxiways',
  gate: 'Gates',
  queue: 'Queues',
  conflict: 'Conflicts',
};

export function focusTargetKey(ref: FocusTargetRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function isFocusTargetKind(value: string): value is FocusTargetKind {
  return FOCUS_TARGET_KINDS.includes(value as FocusTargetKind);
}

export function createFocusTargetRegistry(config: AirportConfig): FocusTargetRegistry {
  const nodeById = new Map(config.surfaceGraph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(config.surfaceGraph.edges.map((edge) => [edge.id, edge]));
  const runwayTargets = config.runways.map((runway) => staticTarget(config, {
    kind: 'runway',
    id: String(runway.id),
    label: runway.designation?.join(' / ') ?? `Runway ${runway.id + 1}`,
    detail: `${Math.round(runway.length * worldMetersPerUnit(config))} m · ${runway.role} use`,
    position: [...runway.center],
    radius: Math.max(9, runway.length / 2),
    tone: 'blue',
  }));

  const taxiwayGroups = new Map<string, {
    label: string;
    ids: string[];
    points: Array<[number, number]>;
  }>();
  for (const taxiway of config.surfaceGraph.taxiways) {
    if (taxiway.sourceKind === 'taxilane') continue;
    const label = taxiway.reference?.trim() || (taxiway.sourceKind === 'procedural' ? taxiway.name.trim() : '');
    if (!label) continue;
    const normalized = label.toLocaleUpperCase();
    const group = taxiwayGroups.get(normalized) ?? { label, ids: [], points: [] };
    group.ids.push(taxiway.id);
    for (const edgeId of taxiway.edgeIds) {
      const edge = edgeById.get(edgeId);
      if (!edge) continue;
      const from = nodeById.get(edge.from)?.position;
      const to = nodeById.get(edge.to)?.position;
      if (from) group.points.push([...from]);
      if (to) group.points.push([...to]);
    }
    taxiwayGroups.set(normalized, group);
  }
  const taxiwayTargets = [...taxiwayGroups.values()]
    .filter((group) => group.points.length > 0)
    .map((group) => {
      const bounds = boundsForPoints(group.points);
      return staticTarget(config, {
        kind: 'taxiway',
        id: group.label,
        label: `Taxiway ${group.label}`,
        detail: `${group.ids.length} mapped segment${group.ids.length === 1 ? '' : 's'}`,
        position: bounds.center,
        radius: bounds.radius,
        tone: 'amber',
      });
    })
    .sort((first, second) => naturalCompare(first.id, second.id));

  const gateTargets = config.surfaceGraph.stands
    .map((stand) => staticTarget(config, {
      kind: 'gate',
      id: stand.id,
      label: stand.gateRef ? `Gate ${stand.gateRef}` : `Stand ${stand.slot + 1}`,
      detail: [stand.terminal, stand.concourse].filter(Boolean).join(' · ') || stand.zoneId,
      position: [...stand.position],
      radius: 6,
      tone: 'amber',
    }))
    .sort((first, second) => naturalCompare(first.label, second.label));

  const staticTargets = [...runwayTargets, ...taxiwayTargets, ...gateTargets];
  const staticByResource = new Map<string, FocusTargetDescriptor>();
  for (const target of runwayTargets) staticByResource.set(`runway:${target.id}`, target);
  for (const target of gateTargets) {
    staticByResource.set(target.id, target);
    staticByResource.set(`stand:${target.id}`, target);
  }
  for (const target of taxiwayTargets) {
    staticByResource.set(target.id, target);
    staticByResource.set(target.id.toLocaleUpperCase(), target);
    staticByResource.set(`taxiway:${target.id}`, target);
  }
  for (const taxiway of config.surfaceGraph.taxiways) {
    const label = taxiway.reference?.trim() || (taxiway.sourceKind === 'procedural' ? taxiway.name.trim() : '');
    if (!label) continue;
    const target = taxiwayTargets.find((candidate) => candidate.id.toLocaleUpperCase() === label.toLocaleUpperCase());
    if (target) staticByResource.set(taxiway.id, target);
  }
  for (const edge of config.surfaceGraph.edges) {
    if (!edge.taxiwayId) continue;
    const target = staticByResource.get(edge.taxiwayId);
    if (target) staticByResource.set(edge.id, target);
  }

  return {
    build(state, queues, conflicts) {
      const flightById = new Map(state.flights.map((flight) => [flight.id, flight]));
      const vehicleById = new Map(state.serviceVehicles.map((vehicle) => [vehicle.id, vehicle]));
      const flightTargets = state.flights
        .map((flight) => flightTarget(config, flight))
        .sort((first, second) => naturalCompare(first.label, second.label));
      const queueTargets = queues.entries.map((entry) => queueTarget(
        config,
        entry,
        flightById,
        vehicleById,
        staticByResource,
      ));
      const conflictTargets = conflicts.map((conflict) => conflictTarget(config, conflict, flightById));
      const targets = [...flightTargets, ...staticTargets, ...queueTargets, ...conflictTargets];
      return {
        schemaVersion: 1,
        generatedAtSeconds: Number(state.elapsed.toFixed(3)),
        categories: FOCUS_TARGET_KINDS.map((kind) => ({
          kind,
          label: CATEGORY_LABELS[kind],
          count: targets.filter((target) => target.kind === kind).length,
        })),
        targets,
        total: targets.length,
      };
    },
  };
}

function staticTarget(
  config: AirportConfig,
  target: Omit<FocusTargetDescriptor, 'key' | 'suggestedZoom' | 'follow' | 'flightIds'>,
): FocusTargetDescriptor {
  return {
    ...target,
    key: focusTargetKey(target),
    suggestedZoom: suggestedZoom(config, target.radius, target.kind),
    follow: 'static',
    flightIds: [],
  };
}

function flightTarget(config: AirportConfig, flight: Flight): FocusTargetDescriptor {
  return {
    kind: 'flight',
    id: String(flight.id),
    key: focusTargetKey({ kind: 'flight', id: String(flight.id) }),
    label: flight.callsign,
    detail: `${flight.aircraft} · ${phaseLabel(flight.phase)} · ${Math.round(flight.kinematics.altitudeFt).toLocaleString()} ft`,
    position: [flight.motion.x, flight.motion.y],
    radius: 8,
    suggestedZoom: suggestedZoom(config, 8, 'flight'),
    follow: 'flight',
    flightIds: [flight.id],
    selectableFlightId: flight.id,
    tone: 'blue',
  };
}

function queueTarget(
  config: AirportConfig,
  entry: OperationQueueEntry,
  flightById: ReadonlyMap<number, Flight>,
  vehicleById: ReadonlyMap<string, AirportState['serviceVehicles'][number]>,
  staticByResource: ReadonlyMap<string, FocusTargetDescriptor>,
): FocusTargetDescriptor {
  const primaryFlight = entry.flightId === undefined ? undefined : flightById.get(entry.flightId);
  const blockerFlights = entry.blockerFlightIds.flatMap((id) => flightById.get(id) ?? []);
  const vehicle = entry.serviceVehicleId === undefined ? undefined : vehicleById.get(entry.serviceVehicleId);
  const resource = entry.resourceId === undefined
    ? undefined
    : staticByResource.get(entry.resourceId) ?? staticByResource.get(entry.resourceId.toLocaleUpperCase());
  const flights = primaryFlight ? [primaryFlight] : blockerFlights;
  const bounds = flights.length
    ? boundsForPoints(flights.map((flight) => [flight.motion.x, flight.motion.y]))
    : vehicle
      ? { center: [vehicle.x, vehicle.y] as [number, number], radius: 6 }
      : resource
        ? { center: [...resource.position] as [number, number], radius: resource.radius }
        : { center: [...config.terminal] as [number, number], radius: 14 };
  const flightIds = flights.map((flight) => flight.id);
  return {
    kind: 'queue',
    id: entry.id,
    key: focusTargetKey({ kind: 'queue', id: entry.id }),
    label: entry.label,
    detail: `${entry.category.toLocaleUpperCase()} · ${entry.detail}`,
    position: bounds.center,
    radius: Math.max(7, bounds.radius),
    suggestedZoom: suggestedZoom(config, Math.max(7, bounds.radius), 'queue'),
    follow: primaryFlight ? 'flight' : blockerFlights.length ? 'group' : vehicle ? 'vehicle' : 'static',
    flightIds,
    serviceVehicleId: vehicle?.id,
    selectableFlightId: primaryFlight?.id,
    tone: entry.priority === 'blocked' ? 'rose' : 'amber',
  };
}

function conflictTarget(
  config: AirportConfig,
  conflict: ConflictPrediction,
  flightById: ReadonlyMap<number, Flight>,
): FocusTargetDescriptor {
  const flightIds = [...new Set(conflict.flights)].sort((first, second) => first - second);
  const flights = flightIds.flatMap((id) => flightById.get(id) ?? []);
  const runway = conflict.runway === undefined ? undefined : config.runways.find((candidate) => candidate.id === conflict.runway);
  const bounds = flights.length
    ? boundsForPoints(flights.map((flight) => [flight.motion.x, flight.motion.y]))
    : runway
      ? { center: [...runway.center] as [number, number], radius: runway.length / 2 }
      : { center: [...config.terminal] as [number, number], radius: 14 };
  const id = `${conflict.type}:${conflict.runway ?? 'none'}:${flightIds.join('-')}`;
  return {
    kind: 'conflict',
    id,
    key: focusTargetKey({ kind: 'conflict', id }),
    label: `${conflict.severity === 'warning' ? 'Warning' : 'Caution'} · ${conflict.type}`,
    detail: `${conflict.detail} · ${Math.max(0, Math.ceil(conflict.etaSeconds))} s`,
    position: bounds.center,
    radius: Math.max(10, bounds.radius),
    suggestedZoom: suggestedZoom(config, Math.max(10, bounds.radius), 'conflict'),
    follow: flights.length ? 'group' : 'static',
    flightIds,
    selectableFlightId: flightIds.length === 1 ? flightIds[0] : undefined,
    tone: conflict.severity === 'warning' ? 'rose' : 'amber',
  };
}

function boundsForPoints(points: ReadonlyArray<readonly [number, number]>): {
  center: [number, number];
  radius: number;
} {
  const minX = Math.min(...points.map((point) => point[0]));
  const maxX = Math.max(...points.map((point) => point[0]));
  const minY = Math.min(...points.map((point) => point[1]));
  const maxY = Math.max(...points.map((point) => point[1]));
  const center: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
  const radius = Math.max(4, ...points.map((point) => Math.hypot(point[0] - center[0], point[1] - center[1])));
  return { center, radius };
}

function suggestedZoom(config: AirportConfig, radius: number, kind: FocusTargetKind): number {
  const baseSize = config.scope === 'center' ? 104 : 54;
  const minimum = config.scope === 'center' ? 0.16 : 0.22;
  const subjectFloor = kind === 'flight' || kind === 'gate' ? 18 : 24;
  return Number(Math.min(1.7, Math.max(minimum, Math.max(subjectFloor, radius * 1.35) / baseSize)).toFixed(3));
}

function worldMetersPerUnit(config: AirportConfig): number {
  return config.vectorData?.runtimeReference.worldMetersPerUnit ?? 38;
}

function phaseLabel(phase: Flight['phase']): string {
  return phase.replace('-', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

function naturalCompare(first: string, second: string): number {
  return first.localeCompare(second, undefined, { numeric: true, sensitivity: 'base' });
}

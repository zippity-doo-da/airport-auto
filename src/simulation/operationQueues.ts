import type { AirportConfig } from './airportConfig';
import type {
  AirportState,
  Flight,
  ServiceVehicleState,
} from './types';
import { phaseProtectsAssignedRunway } from './runwayProtection';

export const OPERATION_QUEUE_CATEGORIES = [
  'gate',
  'ramp',
  'taxi',
  'crossing',
  'runway',
  'wake',
  'weather',
  'downstream',
] as const;

export type OperationQueueCategory = (typeof OPERATION_QUEUE_CATEGORIES)[number];
export type OperationQueuePriority = 'routine' | 'attention' | 'blocked';

export interface OperationQueueEntry {
  id: string;
  category: OperationQueueCategory;
  priority: OperationQueuePriority;
  entity: 'aircraft' | 'vehicle' | 'system';
  label: string;
  detail: string;
  waitSeconds: number;
  position: number;
  queueLength: number;
  flightId?: number;
  serviceVehicleId?: string;
  resourceId?: string;
  blockerFlightIds: number[];
}

export interface OperationQueueSnapshot {
  generatedAtSeconds: number;
  total: number;
  longestWaitSeconds: number;
  counts: Record<OperationQueueCategory, number>;
  entries: OperationQueueEntry[];
}

export interface OperationQueueInputs {
  stationarySeconds?: ReadonlyMap<number, number>;
  runwayReservations?: ReadonlyMap<number, number>;
  nextArrivalIn?: number;
  approachCapacity?: number;
}

interface QueueCandidate extends Omit<OperationQueueEntry, 'position' | 'queueLength'> {
  order: number;
}

/**
 * Builds one explainable, serializable view of every active operational wait.
 * It never changes movement state; UI, telemetry, tests, and future agents all
 * consume this same diagnosis instead of reinterpreting hold strings.
 */
export function buildOperationQueueSnapshot(
  config: AirportConfig,
  state: AirportState,
  inputs: OperationQueueInputs = {},
): OperationQueueSnapshot {
  const candidates: QueueCandidate[] = [];
  const stationarySeconds = inputs.stationarySeconds ?? new Map<number, number>();
  const runwayReservations = inputs.runwayReservations ?? new Map<number, number>();
  const flightById = new Map(state.flights.map((flight) => [flight.id, flight]));

  for (const flight of state.flights) {
    const candidate = diagnoseFlightQueue(config, flight, state, stationarySeconds, runwayReservations);
    if (candidate) candidates.push(candidate);
  }
  for (const vehicle of state.serviceVehicles) {
    const candidate = diagnoseVehicleQueue(vehicle, stationarySeconds);
    if (candidate) candidates.push(candidate);
  }

  const activeApproachIds = state.flights
    .filter((flight) => flight.phase === 'approach' || flight.phase === 'landing')
    .map((flight) => flight.id);
  for (const entry of state.trafficFlow.arrivalQueue) {
    candidates.push({
      id: `traffic:${entry.id}`,
      category: state.weather.weatherEnabled && state.weather.condition !== 'clear' ? 'weather' : 'downstream',
      priority: entry.status === 'holding' ? 'attention' : 'routine',
      entity: 'system',
      label: `Inbound meter ${entry.id}`,
      detail: entry.reason,
      waitSeconds: entry.delaySeconds,
      resourceId: 'arrival-stream',
      blockerFlightIds: [...activeApproachIds],
      order: entry.releaseSlotSeconds,
    });
  }
  for (const entry of state.trafficFlow.departureQueue) {
    candidates.push({
      id: `traffic:${entry.id}`,
      category: 'runway',
      priority: entry.status === 'metered' ? 'attention' : 'routine',
      entity: entry.flightId === undefined ? 'system' : 'aircraft',
      label: `${entry.callsign ?? entry.id} release slot`,
      detail: entry.reason,
      waitSeconds: entry.delaySeconds,
      flightId: entry.flightId,
      resourceId: 'departure-release-bank',
      blockerFlightIds: state.trafficFlow.departureQueue
        .filter((candidate) => candidate.releaseSlotSeconds < entry.releaseSlotSeconds && candidate.flightId !== undefined)
        .flatMap((candidate) => candidate.flightId ?? []),
      order: entry.releaseSlotSeconds,
    });
  }

  if (state.runwayConfigurationTransition) {
    const blockers = state.runwayConfigurationTransition.blockingFlightIds;
    candidates.push({
      id: `system:runway-plan:${state.runwayConfigurationTransition.targetId}`,
      category: 'runway',
      priority: blockers.length ? 'blocked' : 'attention',
      entity: 'system',
      label: 'Runway plan transition',
      detail: blockers.length
        ? `Waiting for ${callsigns(blockers, flightById)} to clear protected pavement.`
        : 'The new operating plan is ready for the next fixed-step boundary.',
      waitSeconds: Math.max(0, state.elapsed - state.runwayConfigurationTransition.requestedAt),
      resourceId: `configuration:${state.runwayConfigurationTransition.targetId}`,
      blockerFlightIds: [...blockers],
      order: state.runwayConfigurationTransition.requestedAt,
    });
  }

  for (const disruption of state.surfaceDisruptions.filter((item) => item.status === 'pending')) {
    candidates.push({
      id: `system:restriction:${disruption.id}`,
      category: disruption.runwayId === undefined ? 'taxi' : 'runway',
      priority: 'blocked',
      entity: 'system',
      label: `${disruption.label} restriction`,
      detail: disruption.reason,
      waitSeconds: Math.max(0, state.elapsed - disruption.createdAtSeconds),
      resourceId: disruption.runwayId === undefined ? disruption.taxiwayId : `runway:${disruption.runwayId}`,
      blockerFlightIds: [...disruption.reroutedFlightIds],
      order: disruption.createdAtSeconds,
    });
  }

  const assignedStandIds = new Set(state.flights.flatMap((flight) => flight.standId ? [flight.standId] : []));
  if (config.surfaceGraph.stands.length > 0 && assignedStandIds.size >= config.surfaceGraph.stands.length) {
    candidates.push({
      id: 'system:gate-capacity',
      category: 'gate',
      priority: 'attention',
      entity: 'system',
      label: 'Gate capacity',
      detail: `All ${config.surfaceGraph.stands.length} modeled stands are committed; the arrival stream is applying back-pressure.`,
      waitSeconds: 0,
      resourceId: 'gate-bank',
      blockerFlightIds: [],
      order: state.elapsed,
    });
  }

  const approachCapacity = Math.max(1, inputs.approachCapacity ?? 1);
  const inboundCount = state.flights.filter((flight) => flight.phase === 'approach' || flight.phase === 'landing').length;
  const nextArrivalIn = Math.max(0, inputs.nextArrivalIn ?? 0);
  if (state.trafficFlow.arrivalQueue.length === 0 && inboundCount >= approachCapacity && nextArrivalIn > 0.05) {
    candidates.push({
      id: 'system:arrival-meter',
      category: state.weather.weatherEnabled && state.weather.condition !== 'clear' ? 'weather' : 'wake',
      priority: 'routine',
      entity: 'system',
      label: 'Arrival release meter',
      detail: state.weather.weatherEnabled && state.weather.condition !== 'clear'
        ? `${weatherLabel(state)} reduces the approach stream to ${approachCapacity}; next release in ${Math.ceil(nextArrivalIn)} seconds.`
        : `${inboundCount}/${approachCapacity} arrival slots are occupied; the next release follows the game-scale wake interval in ${Math.ceil(nextArrivalIn)} seconds.`,
      waitSeconds: 0,
      resourceId: 'arrival-stream',
      blockerFlightIds: state.flights
        .filter((flight) => flight.phase === 'approach' || flight.phase === 'landing')
        .map((flight) => flight.id),
      order: state.elapsed + nextArrivalIn,
    });
  }

  const groups = new Map<string, QueueCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.category}:${candidate.resourceId ?? candidate.category}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  const entries: OperationQueueEntry[] = [];
  for (const group of groups.values()) {
    group.sort((first, second) => second.waitSeconds - first.waitSeconds || first.order - second.order || first.id.localeCompare(second.id));
    group.forEach((candidate, index) => {
      entries.push({
        id: candidate.id,
        category: candidate.category,
        priority: candidate.priority,
        entity: candidate.entity,
        label: candidate.label,
        detail: candidate.detail,
        waitSeconds: candidate.waitSeconds,
        position: index + 1,
        queueLength: group.length,
        flightId: candidate.flightId,
        serviceVehicleId: candidate.serviceVehicleId,
        resourceId: candidate.resourceId,
        blockerFlightIds: [...candidate.blockerFlightIds],
      });
    });
  }
  entries.sort((first, second) => (
    priorityRank(second.priority) - priorityRank(first.priority)
    || second.waitSeconds - first.waitSeconds
    || OPERATION_QUEUE_CATEGORIES.indexOf(first.category) - OPERATION_QUEUE_CATEGORIES.indexOf(second.category)
    || first.id.localeCompare(second.id)
  ));

  const counts = Object.fromEntries(OPERATION_QUEUE_CATEGORIES.map((category) => [
    category,
    entries.filter((entry) => entry.category === category).length,
  ])) as Record<OperationQueueCategory, number>;

  return {
    generatedAtSeconds: Number(state.elapsed.toFixed(3)),
    total: entries.length,
    longestWaitSeconds: Number(Math.max(0, ...entries.map((entry) => entry.waitSeconds)).toFixed(3)),
    counts,
    entries,
  };
}

function diagnoseFlightQueue(
  config: AirportConfig,
  flight: Flight,
  state: AirportState,
  stationarySeconds: ReadonlyMap<number, number>,
  runwayReservations: ReadonlyMap<number, number>,
): QueueCandidate | null {
  const waitSeconds = queueWaitSeconds(flight, state, stationarySeconds);
  const holdReason = flight.safetyHoldReason ?? flight.automaticHoldReason ?? '';
  // Reservation explanations are intentionally human-readable, but the
  // queue/API projection also needs a causal edge for agents and focus tools.
  // Preserve the authoritative runway blockers and add any explicitly named
  // flight from the same reason without inventing a future route.
  const namedBlockers = [...holdReason.matchAll(/\(flight (\d+)\)/g)].map(
    (match) => Number(match[1]),
  );
  const blockerFlightIds = [
    ...new Set([
      ...runwayBlockers(flight, state, runwayReservations),
      ...namedBlockers.filter((id) => id !== flight.id),
    ]),
  ];

  if (flight.emergency === 'disabled') {
    const disruption = state.surfaceDisruptions.find((item) => item.flightId === flight.id);
    return flightCandidate(flight, 'taxi', 'blocked', 'Disabled on movement surface', disruption?.reason ?? 'Awaiting Ground recovery dispatch.', waitSeconds, blockerFlightIds, flight.surfaceEdge ?? flight.taxiway);
  }
  if (flight.surfaceReroute?.status === 'holding') {
    return flightCandidate(flight, 'taxi', 'blocked', 'No compatible pavement route', flight.surfaceReroute.reason, waitSeconds, blockerFlightIds, flight.surfaceEdge ?? flight.taxiway);
  }
  if (flight.deicing.status === 'queued') {
    return flightCandidate(
      flight,
      'weather',
      'attention',
      `${flight.deicing.facilityName ?? 'Deicing'} queue`,
      flight.deicing.reason ?? `Waiting for treatment lane ${flight.deicing.laneNumber ?? ''}.`,
      waitSeconds,
      blockerFlightIds,
      flight.deicing.laneId ?? flight.deicing.facilityId,
      flight.deicing.queuePosition || flight.progress,
    );
  }
  if (flight.crossingHoldRunway !== undefined) {
    return flightCandidate(
      flight,
      'crossing',
      'attention',
      `Hold short runway ${runwayLabel(config, flight.crossingHoldRunway)}`,
      blockerFlightIds.length
        ? `Protected runway is occupied by ${callsigns(blockerFlightIds, new Map(state.flights.map((item) => [item.id, item])))}.`
        : 'Waiting for an individual runway-crossing clearance.',
      waitSeconds,
      blockerFlightIds,
      `runway:${flight.crossingHoldRunway}`,
      -flight.progress,
    );
  }
  if (flight.phase === 'taxi-out' && flight.progress >= 0.985 && !flight.runwayEntryCleared) {
    const weatherBlocked = flight.deicing.required
      && (flight.deicing.status !== 'protected' || flight.deicing.holdoverRemainingSeconds <= 0);
    return flightCandidate(
      flight,
      weatherBlocked ? 'weather' : 'runway',
      'attention',
      weatherBlocked ? 'Deicing release required' : `Runway ${runwayLabel(config, flight.runway)} entry queue`,
      weatherBlocked
        ? flight.deicing.reason ?? 'Valid holdover protection is required before runway entry.'
        : blockerFlightIds.length
          ? `Runway is protected for ${callsigns(blockerFlightIds, new Map(state.flights.map((item) => [item.id, item])))}.`
          : 'Waiting for line-up and runway-entry clearance.',
      waitSeconds,
      blockerFlightIds,
      `runway:${flight.runway}`,
      -flight.progress,
    );
  }
  if (flight.phase === 'takeoff' && !flight.takeoffCleared) {
    return flightCandidate(
      flight,
      'runway',
      'attention',
      `Runway ${runwayLabel(config, flight.runway)} departure queue`,
      blockerFlightIds.length
        ? `Takeoff waits for ${callsigns(blockerFlightIds, new Map(state.flights.map((item) => [item.id, item])))} to clear the protected runway.`
        : 'Lined up and waiting for takeoff clearance.',
      waitSeconds,
      blockerFlightIds,
      `runway:${flight.runway}`,
      -flight.progress,
    );
  }
  if (flight.phase === 'approach' && !flight.cleared && !flight.goAround) {
    return flightCandidate(
      flight,
      'runway',
      flight.progress > 0.68 ? 'attention' : 'routine',
      `Runway ${runwayLabel(config, flight.runway)} arrival queue`,
      blockerFlightIds.length
        ? `Landing clearance waits for ${callsigns(blockerFlightIds, new Map(state.flights.map((item) => [item.id, item])))}.`
        : 'Approach is sequenced and awaiting landing clearance.',
      waitSeconds,
      blockerFlightIds,
      `runway:${flight.runway}`,
      -flight.progress,
    );
  }
  if (flight.safetyHold || flight.automaticHold || flight.controlHold) {
    const reason = holdReason ?? (flight.controlHold ? 'Controller hold remains active.' : 'Automatic movement protection is active.');
    const category = classifyReason(reason);
    return flightCandidate(
      flight,
      category,
      flight.safetyHold ? 'blocked' : 'attention',
      flight.controlHold ? 'Controller hold' : `${categoryLabel(category)} blocker`,
      reason,
      waitSeconds,
      blockerFlightIds,
      queueResource(flight, category),
      -flight.progress,
    );
  }
  if (flight.phase === 'resting' && flight.turnaround.status !== 'ready' && flight.turnaround.status !== 'released') {
    const blockers = flight.turnaround.tasks
      .filter((task) => task.required && task.status !== 'complete')
      .map((task) => task.label.toLowerCase());
    if (blockers.length) {
      return flightCandidate(
        flight,
        'downstream',
        'routine',
        `${flight.gateAssignment?.gateRef ?? flight.gateAssignment?.zoneName ?? 'Stand'} turn`,
        `Departure waits for ${blockers.slice(0, 4).join(', ')}${blockers.length > 4 ? ` and ${blockers.length - 4} more` : ''}.`,
        Math.max(0, state.elapsed - (flight.turnaround.actualStartSeconds ?? state.elapsed)),
        [],
        flight.standId ?? `flight:${flight.id}`,
        flight.gateAssignment?.scheduledDepartureSeconds ?? state.elapsed,
      );
    }
  }
  return null;
}

function diagnoseVehicleQueue(
  vehicle: ServiceVehicleState,
  stationarySeconds: ReadonlyMap<number, number>,
): QueueCandidate | null {
  if (!vehicle.held) return null;
  const category = classifyReason(vehicle.holdReason ?? 'ramp route reservation');
  return {
    id: `vehicle:${vehicle.id}`,
    category: category === 'gate' ? 'ramp' : category,
    priority: 'routine',
    entity: 'vehicle',
    label: vehicle.label,
    detail: vehicle.holdReason ?? 'Waiting for a shared surface reservation.',
    waitSeconds: Math.max(0, stationarySeconds.get(vehicle.flightId) ?? 0),
    serviceVehicleId: vehicle.id,
    flightId: vehicle.flightId,
    resourceId: vehicle.currentEdge ?? vehicle.zoneId ?? `stand:${vehicle.standId}`,
    blockerFlightIds: [],
    order: vehicle.progress,
  };
}

function flightCandidate(
  flight: Flight,
  category: OperationQueueCategory,
  priority: OperationQueuePriority,
  label: string,
  detail: string,
  waitSeconds: number,
  blockerFlightIds: number[],
  resourceId?: string,
  order = flight.progress,
): QueueCandidate {
  return {
    id: `flight:${flight.id}:${category}`,
    category,
    priority,
    entity: 'aircraft',
    label: `${flight.callsign} · ${label}`,
    detail,
    waitSeconds: Math.max(0, waitSeconds),
    flightId: flight.id,
    resourceId,
    blockerFlightIds,
    order,
  };
}

function queueWaitSeconds(
  flight: Flight,
  state: AirportState,
  stationarySeconds: ReadonlyMap<number, number>,
): number {
  if (flight.deicing.status === 'queued' && flight.deicing.queueEnteredSeconds !== undefined) {
    return Math.max(0, state.elapsed - flight.deicing.queueEnteredSeconds);
  }
  return Math.max(0, stationarySeconds.get(flight.id) ?? 0);
}

function runwayBlockers(
  flight: Flight,
  state: AirportState,
  runwayReservations: ReadonlyMap<number, number>,
): number[] {
  const result = new Set<number>();
  const owner = runwayReservations.get(flight.crossingHoldRunway ?? flight.runway);
  if (owner !== undefined && owner !== flight.id) result.add(owner);
  for (const other of state.flights) {
    if (other.id === flight.id || other.runway !== (flight.crossingHoldRunway ?? flight.runway)) continue;
    if (phaseProtectsAssignedRunway(other.phase) || other.motion.protectedRunway) result.add(other.id);
  }
  return [...result];
}

function classifyReason(reason: string): OperationQueueCategory {
  const normalized = reason.toLowerCase();
  if (/gate|stand|occupied/.test(normalized)) return 'gate';
  if (/ramp|alley|service vehicle|staging|pushback/.test(normalized)) return 'ramp';
  if (/cross|hold.short/.test(normalized)) return 'crossing';
  if (/wake/.test(normalized)) return 'wake';
  if (/weather|wind|visibility|snow|deic|holdover|braking/.test(normalized)) return 'weather';
  if (/runway|protected zone|line.up|takeoff|landing/.test(normalized)) return 'runway';
  if (/taxi|pavement|surface|route|edge|node|intersection|reserved|reservation|closure|construction/.test(normalized)) return 'taxi';
  return 'downstream';
}

function queueResource(flight: Flight, category: OperationQueueCategory): string {
  if (category === 'gate') return flight.standId ?? `flight:${flight.id}`;
  if (category === 'ramp') return flight.rampControlZoneId ?? flight.surfaceAlleyId ?? flight.standId ?? `flight:${flight.id}`;
  if (category === 'crossing') return `runway:${flight.crossingHoldRunway ?? flight.runway}`;
  if (category === 'runway' || category === 'wake') return `runway:${flight.runway}`;
  return flight.surfaceEdge ?? flight.taxiway ?? `flight:${flight.id}`;
}

function categoryLabel(category: OperationQueueCategory): string {
  return category === 'weather' ? 'Weather' : `${category[0].toUpperCase()}${category.slice(1)}`;
}

function weatherLabel(state: AirportState): string {
  return `${state.weather.condition} · ${state.weather.visibility.toFixed(1)} mi visibility · ${Math.round(state.weather.windSpeed)} kt wind`;
}

function runwayLabel(config: AirportConfig, runwayId: number): string {
  return config.runways.find((runway) => runway.id === runwayId)?.designation?.join('/') ?? String(runwayId + 1);
}

function callsigns(ids: readonly number[], flights: ReadonlyMap<number, Flight>): string {
  return ids.map((id) => flights.get(id)?.callsign ?? `flight ${id}`).join(', ');
}

function priorityRank(priority: OperationQueuePriority): number {
  return priority === 'blocked' ? 2 : priority === 'attention' ? 1 : 0;
}

import {
  CONTROLLER_STATIONS,
  CONTROLLER_STATION_DEFINITIONS,
  OPERATIONAL_CONTROLLER_STATIONS,
  requiredControllerStation,
} from './controllerOperations';
import type { OperationQueueEntry, OperationQueueSnapshot } from './operationQueues';
import type {
  AirportState,
  ConflictPrediction,
  ControllerAlertSnapshot,
  ControllerObjectiveSnapshot,
  ControllerObjectiveStatus,
  ControllerPerformanceSnapshot,
  ControllerStation,
  ControllerWorkloadSnapshot,
  Flight,
  OperationalControllerStation,
  ShiftMetrics,
} from './types';

export interface ControllerPerformanceInputs {
  state: AirportState;
  metrics: ShiftMetrics;
  workloads: readonly ControllerWorkloadSnapshot[];
  queues: OperationQueueSnapshot;
  predictions: readonly ConflictPrediction[];
}

/**
 * One deterministic operational picture for human UI, scripted controllers,
 * telemetry, and future agents. It only reads authoritative simulation state;
 * it never changes clearances, motion, queues, or controller ownership.
 */
export function controllerPerformanceSnapshots(
  inputs: ControllerPerformanceInputs,
): ControllerPerformanceSnapshot[] {
  const workloadByStation = new Map(inputs.workloads.map((workload) => [workload.station, workload]));
  const queueByStation = new Map(OPERATIONAL_CONTROLLER_STATIONS.map((station) => [
    station,
    queueEntriesForStation(station, inputs.state, inputs.queues.entries),
  ]));

  const operational = OPERATIONAL_CONTROLLER_STATIONS.map((station) => buildOperationalSnapshot(
    station,
    inputs,
    workloadByStation.get(station) ?? null,
    queueByStation.get(station) ?? [],
  ));
  const supervisor = buildSupervisorSnapshot(inputs, operational);
  const byStation = new Map<ControllerStation, ControllerPerformanceSnapshot>([
    ...operational.map((snapshot) => [snapshot.station, snapshot] as const),
    ['supervisor', supervisor],
  ]);
  return CONTROLLER_STATIONS.map((station) => byStation.get(station)!);
}

function buildOperationalSnapshot(
  station: OperationalControllerStation,
  inputs: ControllerPerformanceInputs,
  workload: ControllerWorkloadSnapshot | null,
  queues: readonly OperationQueueEntry[],
): ControllerPerformanceSnapshot {
  if (station === 'approach') return buildApproachSnapshot(inputs, workload, queues);
  if (station === 'tower') return buildTowerSnapshot(inputs, workload, queues);
  if (station === 'ground') return buildGroundSnapshot(inputs, workload, queues);
  return buildRampSnapshot(inputs, workload, queues);
}

function buildApproachSnapshot(
  inputs: ControllerPerformanceInputs,
  workload: ControllerWorkloadSnapshot | null,
  queues: readonly OperationQueueEntry[],
): ControllerPerformanceSnapshot {
  const predictions = inputs.predictions.filter((prediction) => prediction.type === 'separation');
  const lowFuel = inputs.state.flights.filter((flight) => isApproachTraffic(flight) && flight.kinematics.fuelPercent < 8);
  const criticalFuel = lowFuel.filter((flight) => flight.kinematics.fuelPercent < 5);
  const overdue = workload?.overdueFlights ?? 0;
  const longestWait = maximumWait(queues);
  const objectives = [
    objective('separation', 'Separation', predictions.length, String(predictions.length), '0 active alerts', countStatus(predictions.length), 'Physical terminal separation forecasts involving airborne traffic.'),
    objective('reserve', 'Low reserve', lowFuel.length, String(lowFuel.length), '0 below 8%', criticalFuel.length ? 'critical' : countStatus(lowFuel.length), 'Arrivals below the modeled eight-percent reserve watch threshold.'),
    objective('handoffs', 'Late handoffs', overdue, String(overdue), '0 overdue', countStatus(overdue), 'Aircraft at or beyond an Approach control boundary without completed coordination.'),
    objective('arrival-delay', 'Arrival wait', longestWait, seconds(longestWait), '≤ 60 sec', thresholdStatus(longestWait, 60, 120), 'Longest active Approach, arrival-meter, wake, or weather queue.'),
  ];
  const alerts = [
    ...predictionAlerts('approach', predictions),
    ...lowFuel.map((flight) => alert('approach', `fuel:${flight.id}`, criticalFuel.includes(flight) ? 'urgent' : 'attention', `${flight.callsign} fuel reserve`, `${flight.kinematics.fuelPercent.toFixed(1)}% modeled fuel remaining on ${flight.phase}.`, [flight.id])),
    ...handoffAlerts('approach', workload),
    ...queueAlerts('approach', queues, 60),
  ];
  const score = clampScore(100
    - predictions.length * 24
    - lowFuel.length * 12
    - criticalFuel.length * 12
    - overdue * 9
    - waitPenalty(longestWait, 60, 18));
  return snapshot('approach', workload, score, objectives, alerts, `${inputs.state.flights.filter(isApproachTraffic).length} airborne tracks · sequence, fuel, and handoffs`);
}

function buildTowerSnapshot(
  inputs: ControllerPerformanceInputs,
  workload: ControllerWorkloadSnapshot | null,
  queues: readonly OperationQueueEntry[],
): ControllerPerformanceSnapshot {
  const predictions = inputs.predictions.filter((prediction) => prediction.type === 'runway' || prediction.type === 'crossing');
  const overdue = workload?.overdueFlights ?? 0;
  const longestWait = maximumWait(queues);
  const hours = Math.max(1 / 60, inputs.state.elapsed / 3_600);
  const movementRate = (inputs.metrics.safeArrivals + inputs.metrics.safeDepartures) / hours;
  const objectives = [
    objective('runway-alerts', 'Runway alerts', predictions.length, String(predictions.length), '0 active alerts', countStatus(predictions.length), 'Predicted protected-runway, crossing, or conflicting-operation hazards.'),
    objective('incursions', 'Incursions', inputs.metrics.runwayIncursions, String(inputs.metrics.runwayIncursions), '0 this shift', inputs.metrics.runwayIncursions ? 'critical' : 'met', 'Authoritative runway-incursion invariant count.'),
    objective('runway-delay', 'Runway wait', longestWait, seconds(longestWait), '≤ 45 sec', thresholdStatus(longestWait, 45, 90), 'Longest arrival, runway-entry, takeoff, or wake queue assigned to Tower.'),
    objective('movements', 'Movement rate', movementRate, `${movementRate.toFixed(1)}/h`, 'flow measure', 'informational', 'Safe arrivals plus departures per simulated hour.'),
  ];
  const alerts = [
    ...predictionAlerts('tower', predictions),
    ...handoffAlerts('tower', workload),
    ...queueAlerts('tower', queues, 45),
  ];
  const score = clampScore(100
    - predictions.length * 22
    - inputs.metrics.runwayIncursions * 40
    - overdue * 9
    - waitPenalty(longestWait, 45, 18));
  return snapshot('tower', workload, score, objectives, alerts, `${inputs.state.flights.filter(isTowerTraffic).length} runway tracks · arrivals, departures, and protected pavement`);
}

function buildGroundSnapshot(
  inputs: ControllerPerformanceInputs,
  workload: ControllerWorkloadSnapshot | null,
  queues: readonly OperationQueueEntry[],
): ControllerPerformanceSnapshot {
  const groundFlights = inputs.state.flights.filter((flight) => requiredControllerStation(flight) === 'ground');
  const longHolds = groundFlights.filter((flight) => (
    flight.controlHold || flight.automaticHold || flight.safetyHold || flight.crossingHoldRunway !== undefined
  )).filter((flight) => queues.some((entry) => entry.flightId === flight.id && entry.waitSeconds > 45));
  const crossingWait = maximumWait(queues.filter((entry) => entry.category === 'crossing'));
  const moving = groundFlights.filter((flight) => flight.kinematics.groundSpeedKts >= 3).length;
  const overdue = workload?.overdueFlights ?? 0;
  const objectives = [
    objective('surface-holds', 'Long holds', longHolds.length, String(longHolds.length), '0 over 45 sec', countStatus(longHolds.length), 'Ground-controlled aircraft stationary beyond the surface-flow target.'),
    objective('crossing-delay', 'Crossing wait', crossingWait, seconds(crossingWait), '≤ 45 sec', thresholdStatus(crossingWait, 45, 90), 'Longest individual runway-crossing wait on a taxi route.'),
    objective('incursions', 'Incursions', inputs.metrics.runwayIncursions, String(inputs.metrics.runwayIncursions), '0 this shift', inputs.metrics.runwayIncursions ? 'critical' : 'met', 'Authoritative runway-incursion invariant count.'),
    objective('moving', 'Taxi moving', moving, String(moving), 'flow measure', 'informational', 'Ground-controlled aircraft moving at three knots or more.'),
  ];
  const groundPredictions = inputs.predictions.filter((prediction) => prediction.type === 'crossing');
  const alerts = [
    ...predictionAlerts('ground', groundPredictions),
    ...longHolds.map((flight) => alert('ground', `hold:${flight.id}`, 'attention', `${flight.callsign} surface hold`, flight.safetyHoldReason ?? flight.automaticHoldReason ?? 'Held on the movement area for more than 45 seconds.', [flight.id])),
    ...handoffAlerts('ground', workload),
    ...queueAlerts('ground', queues, 45),
  ];
  const score = clampScore(100
    - longHolds.length * 12
    - inputs.metrics.runwayIncursions * 40
    - overdue * 9
    - waitPenalty(crossingWait, 45, 18));
  return snapshot('ground', workload, score, objectives, alerts, `${groundFlights.length} movement-area tracks · crossings, taxi flow, and recovery`);
}

function buildRampSnapshot(
  inputs: ControllerPerformanceInputs,
  workload: ControllerWorkloadSnapshot | null,
  queues: readonly OperationQueueEntry[],
): ControllerPerformanceSnapshot {
  const rampFlights = inputs.state.flights.filter((flight) => requiredControllerStation(flight) === 'ramp');
  const readyFlights = rampFlights.filter((flight) => flight.phase === 'resting' && flight.turnaround.status === 'ready' && !flight.pushbackCleared);
  const readyWait = Math.max(0, ...readyFlights.map((flight) => Math.max(0, inputs.state.elapsed - (flight.turnaround.actualReadySeconds ?? inputs.state.elapsed))));
  const serviceBlockers = queues.filter((entry) => (
    (entry.category === 'ramp' || entry.category === 'gate' || entry.category === 'downstream')
    && entry.waitSeconds > 45
  ));
  const completedTurns = inputs.state.flights.filter((flight) => flight.turnaround.actualReadySeconds !== undefined);
  const turnVariance = completedTurns.length
    ? completedTurns.reduce((sum, flight) => sum + Math.max(0, (flight.turnaround.actualReadySeconds ?? 0) - flight.turnaround.scheduledReadySeconds), 0) / completedTurns.length
    : 0;
  const activeTurns = rampFlights.filter((flight) => flight.phase === 'resting' && flight.turnaround.status !== 'ready' && flight.turnaround.status !== 'released').length;
  const overdue = workload?.overdueFlights ?? 0;
  const objectives = [
    objective('push-ready', 'Push ready', readyFlights.length, readyWait ? `${readyFlights.length} · ${seconds(readyWait)}` : String(readyFlights.length), '≤ 2 waiting', thresholdStatus(readyFlights.length, 2, 4), 'Turn-complete aircraft awaiting a Ramp pushback clearance.'),
    objective('service-blockers', 'Service blocks', serviceBlockers.length, String(serviceBlockers.length), '0 over 45 sec', countStatus(serviceBlockers.length), 'Gate, ramp, or turnaround queues beyond the service-flow target.'),
    objective('turn-variance', 'Turn variance', turnVariance, seconds(turnVariance), '≤ 30 sec', thresholdStatus(turnVariance, 30, 60), 'Average positive difference between scheduled and actual turnaround readiness.'),
    objective('active-turns', 'Active turns', activeTurns, String(activeTurns), 'flow measure', 'informational', 'Aircraft currently receiving stand services.'),
  ];
  const alerts = [
    ...readyFlights.flatMap((flight) => {
      const waitSeconds = Math.max(0, inputs.state.elapsed - (flight.turnaround.actualReadySeconds ?? inputs.state.elapsed));
      return waitSeconds > 30
        ? [alert('ramp', `push:${flight.id}`, waitSeconds > 90 ? 'urgent' : 'attention', `${flight.callsign} ready for push`, `Turnaround complete; waiting ${seconds(waitSeconds)} for Ramp release.`, [flight.id])]
        : [];
    }),
    ...handoffAlerts('ramp', workload),
    ...queueAlerts('ramp', queues, 45),
  ];
  const score = clampScore(100
    - Math.max(0, readyFlights.length - 2) * 9
    - serviceBlockers.length * 10
    - overdue * 9
    - waitPenalty(readyWait, 45, 16)
    - waitPenalty(turnVariance, 30, 12));
  return snapshot('ramp', workload, score, objectives, alerts, `${rampFlights.length} ramp tracks · stands, services, pushback, and alley flow`);
}

function buildSupervisorSnapshot(
  inputs: ControllerPerformanceInputs,
  operational: readonly ControllerPerformanceSnapshot[],
): ControllerPerformanceSnapshot {
  const completed = inputs.metrics.safeArrivals + inputs.metrics.safeDepartures;
  const hours = Math.max(1 / 60, inputs.state.elapsed / 3_600);
  const throughput = completed / hours;
  const delayPerOperation = inputs.metrics.estimatedDelaySeconds / Math.max(1, completed);
  const pressured = inputs.workloads.filter((workload) => workload.workload === 'heavy' || workload.workload === 'overload');
  const activeWarnings = inputs.predictions.filter((prediction) => prediction.severity === 'warning');
  const safetyBreaches = inputs.metrics.collisionAlerts + inputs.metrics.runwayIncursions;
  const safetyScore = clampScore(100 - safetyBreaches * 40 - activeWarnings.length * 16);
  const roleAverage = operational.reduce((sum, snapshot) => sum + snapshot.score, 0) / Math.max(1, operational.length);
  const score = clampScore(safetyScore * 0.6 + roleAverage * 0.4 - pressured.length * 4 - waitPenalty(delayPerOperation, 60, 10));
  const objectives = [
    objective('safety', 'Safety', safetyScore, String(safetyScore), '100', safetyScore >= 95 ? 'met' : safetyScore >= 75 ? 'attention' : 'critical', 'Airport-wide collision, incursion, and active-warning integrity score.'),
    objective('throughput', 'Throughput', throughput, `${throughput.toFixed(1)}/h`, 'flow measure', 'informational', 'Safe completed operations per simulated hour.'),
    objective('delay', 'Delay / op', delayPerOperation, seconds(delayPerOperation), '≤ 60 sec', thresholdStatus(delayPerOperation, 60, 120), 'Accumulated modeled queue delay divided by completed operations.'),
    objective('desk-pressure', 'Pressured desks', pressured.length, String(pressured.length), '0 heavy', countStatus(pressured.length), 'Operational desks currently at heavy or overload workload.'),
  ];
  const alerts = [
    ...activeWarnings.flatMap((prediction, index) => alert('supervisor', `prediction:${index}:${prediction.flights.join('-')}`, 'urgent', `${prediction.type} warning`, prediction.detail, prediction.flights)),
    ...(safetyBreaches ? [alert('supervisor', 'safety-invariant', 'urgent', 'Safety invariant', `${inputs.metrics.collisionAlerts} collision alerts · ${inputs.metrics.runwayIncursions} runway incursions.`, [])] : []),
    ...pressured.map((workload) => alert('supervisor', `pressure:${workload.station}`, workload.workload === 'overload' ? 'urgent' : 'attention', `${workload.label} ${workload.workload}`, `${workload.phaseRelevantFlights} relevant tracks · ${workload.pendingHandoffs} pending · ${workload.overdueFlights} overdue.`, [])),
  ];
  return snapshot('supervisor', null, score, objectives, alerts, `${completed} completed operations · ${pressured.length ? `${pressured.length} pressured desks` : 'all desks within workload target'}`);
}

function snapshot(
  station: ControllerStation,
  workload: ControllerWorkloadSnapshot | null,
  score: number,
  objectives: ControllerObjectiveSnapshot[],
  alerts: ControllerAlertSnapshot[],
  summary: string,
): ControllerPerformanceSnapshot {
  const definition = CONTROLLER_STATION_DEFINITIONS[station];
  const uniqueAlerts = [...new Map(alerts.map((item) => [item.id, item])).values()]
    .sort((first, second) => severityRank(second.severity) - severityRank(first.severity) || first.id.localeCompare(second.id))
    .slice(0, 12);
  const status = uniqueAlerts.some((item) => item.severity === 'urgent') || score < 65
    ? 'critical'
    : uniqueAlerts.length || score < 85
      ? 'attention'
      : 'nominal';
  return {
    station,
    label: definition.label,
    trafficScope: definition.trafficScope,
    authoritySummary: definition.authoritySummary,
    responsibilities: [...definition.responsibilities],
    successMeasures: [...definition.successMeasures],
    workload: workload ? { ...workload, responsibilities: [...workload.responsibilities] } : null,
    score,
    status,
    summary,
    objectives,
    alerts: uniqueAlerts,
  };
}

function queueEntriesForStation(
  station: OperationalControllerStation,
  state: AirportState,
  entries: readonly OperationQueueEntry[],
): OperationQueueEntry[] {
  const flights = new Map(state.flights.map((flight) => [flight.id, flight]));
  return entries.filter((entry) => {
    const flight = entry.flightId === undefined ? undefined : flights.get(entry.flightId);
    if (flight) {
      if (requiredControllerStation(flight) === station || flight.navigation.frequencyOwner === station) return true;
    }
    if (station === 'approach') return entry.category === 'wake' || entry.category === 'weather' || (entry.category === 'downstream' && entry.id.startsWith('traffic:'));
    if (station === 'tower') return entry.category === 'runway' || entry.category === 'wake';
    if (station === 'ground') return entry.category === 'taxi' || entry.category === 'crossing';
    return entry.category === 'gate' || entry.category === 'ramp' || entry.category === 'downstream';
  });
}

function isApproachTraffic(flight: Flight): boolean {
  return requiredControllerStation(flight) === 'approach' || flight.navigation.frequencyOwner === 'approach';
}

function isTowerTraffic(flight: Flight): boolean {
  return requiredControllerStation(flight) === 'tower' || flight.navigation.frequencyOwner === 'tower';
}

function objective(
  id: string,
  label: string,
  value: number,
  displayValue: string,
  target: string,
  status: ControllerObjectiveStatus,
  detail: string,
): ControllerObjectiveSnapshot {
  return { id, label, value: round2(value), displayValue, target, status, detail };
}

function alert(
  station: ControllerStation,
  id: string,
  severity: ControllerAlertSnapshot['severity'],
  label: string,
  detail: string,
  flightIds: number[],
): ControllerAlertSnapshot {
  return { id: `${station}:${id}`, station, severity, label, detail, flightIds: [...flightIds] };
}

function predictionAlerts(
  station: OperationalControllerStation,
  predictions: readonly ConflictPrediction[],
): ControllerAlertSnapshot[] {
  return predictions.map((prediction, index) => alert(
    station,
    `prediction:${index}:${prediction.flights.join('-')}`,
    prediction.severity === 'warning' ? 'urgent' : 'attention',
    `${prediction.type} forecast`,
    prediction.detail,
    prediction.flights,
  ));
}

function handoffAlerts(
  station: OperationalControllerStation,
  workload: ControllerWorkloadSnapshot | null,
): ControllerAlertSnapshot[] {
  if (!workload?.overdueFlights) return [];
  return [alert(station, 'handoff-overdue', workload.overdueFlights > 1 ? 'urgent' : 'attention', 'Handoff overdue', `${workload.overdueFlights} aircraft at or beyond the ${workload.label} coordination boundary.`, [])];
}

function queueAlerts(
  station: OperationalControllerStation,
  entries: readonly OperationQueueEntry[],
  thresholdSeconds: number,
): ControllerAlertSnapshot[] {
  return entries
    .filter((entry) => entry.waitSeconds > thresholdSeconds)
    .slice(0, 4)
    .map((entry) => alert(
      station,
      `queue:${entry.id}`,
      entry.priority === 'blocked' || entry.waitSeconds > thresholdSeconds * 2 ? 'urgent' : 'attention',
      entry.label,
      `${entry.detail} · ${seconds(entry.waitSeconds)} waiting.`,
      entry.flightId === undefined ? entry.blockerFlightIds : [entry.flightId, ...entry.blockerFlightIds],
    ));
}

function maximumWait(entries: readonly OperationQueueEntry[]): number {
  return Math.max(0, ...entries.map((entry) => entry.waitSeconds));
}

function countStatus(count: number): ControllerObjectiveStatus {
  return count <= 0 ? 'met' : count === 1 ? 'attention' : 'critical';
}

function thresholdStatus(value: number, attention: number, critical: number): ControllerObjectiveStatus {
  return value <= attention ? 'met' : value <= critical ? 'attention' : 'critical';
}

function waitPenalty(value: number, target: number, maximum: number): number {
  return Math.min(maximum, Math.max(0, value - target) / Math.max(1, target) * maximum);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function seconds(value: number): string {
  return `${Math.round(Math.max(0, value))}s`;
}

function severityRank(severity: ControllerAlertSnapshot['severity']): number {
  return severity === 'urgent' ? 1 : 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

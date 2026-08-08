import { build } from "esbuild";

const requestedHours = Number(
  process.argv
    .find((argument) => argument.startsWith("--hours="))
    ?.split("=")[1] ?? 4,
);
const hours = Number.isFinite(requestedHours)
  ? Math.min(12, Math.max(0.05, requestedHours))
  : 4;
const traceFlightIds = (
  process.argv
    .find((argument) => argument.startsWith("--trace-flights="))
    ?.split("=")[1] ?? ""
)
  .split(",")
  .map((value) => Number(value))
  .filter((value) => Number.isFinite(value));
const compactReport = process.argv.includes("--compact");
const requestedAirport = (
  process.argv
    .find((argument) => argument.startsWith("--airport="))
    ?.split("=")[1] ?? "ORD"
)
  .trim()
  .toUpperCase();
const requestedMode = (
  process.argv
    .find((argument) => argument.startsWith("--mode="))
    ?.split("=")[1] ?? "auto"
)
  .trim()
  .toLowerCase();
if (requestedMode !== "auto" && requestedMode !== "watch")
  throw new Error("--mode must be auto or watch");

const source = `
import { performance } from 'node:perf_hooks';
import { RuntimePerformanceMonitor } from './src/telemetry/runtimePerformance.ts';
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import { sampleSurfaceRouteWithEdges } from './src/simulation/surfaceGraph.ts';
import { sampleAircraftSurfaceMotion } from './src/simulation/surfaceMotion.ts';
import { sampleFlightMotion } from './src/simulation/flightMotion.ts';
import { WORLD_METERS_PER_UNIT } from './src/simulation/runwayPerformance.ts';

const requestedHours = ${JSON.stringify(hours)};
const traceFlightIds = new Set(${JSON.stringify(traceFlightIds)});
const compactReport = ${JSON.stringify(compactReport)};
const requestedAirport = ${JSON.stringify(requestedAirport)};
const requestedMode = ${JSON.stringify(requestedMode)};
// Match the production fixed-step loop exactly; a 100 ms diagnostic step
// measures twice the work of any tick the browser is allowed to execute.
const stepSeconds = 0.05;
const pace = 3;
const targetModeledSeconds = requestedHours * 3_600;
const hubIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === requestedAirport);
if (hubIndex < 0)
  throw new Error(
    \`Unknown hub \${requestedAirport}. Use one of: \${HUB_AIRPORTS.map((airport) => airport.code).join(', ')}.\`,
  );
const configuration = generateHubConfig(hubIndex);
const simulation = new AirportSimulation(configuration, 'extreme');
simulation.setMode(requestedMode);
simulation.setPace(pace);
simulation.setPaused(false);
const openingFlights = simulation.state.flights.map((flight) => ({
  id: flight.id,
  callsign: flight.callsign,
  phase: flight.phase,
  gate: flight.gateAssignment?.gateRef ?? flight.standId ?? null,
  progress: Number(flight.progress.toFixed(4)),
}));
const monitor = new RuntimePerformanceMonitor();
// Heap-use samples without a collection boundary are dominated by young-space
// timing and V8's allocation growth.  When the runner is deliberately started
// with node --expose-gc, sample the retained low-water mark instead. Keep
// the ambient fallback for ordinary local runs and report which measurement was
// used; an unavailable forced collector must never be mistaken for a clean
// retention result.
const forceGarbageCollection =
  typeof globalThis.gc === 'function' ? globalThis.gc : null;
const heapMeasurement = forceGarbageCollection
  ? 'forced-gc-low-water'
  : 'ambient-process-heap';
let maximumAircraft = 0;
let maximumVehicles = 0;
let maximumQueues = 0;
let createdFlights = new Set(simulation.state.flights.map((flight) => flight.id));
let drainedEvents = 0;
let observedCollisionAlerts = 0;
const collisionContacts = [];
let observedUnexplainedPauses = 0;
const unexplainedPauseContacts = [];
const traceFrames = [];
let nextTraceAtSeconds = 0;
let completedOperations = simulation.state.arrivals + simulation.state.departures;
let lastCompletedOperationAtSeconds = simulation.state.elapsed;
let nextSample = 0;
let nextCheckpoint = 1_800;
const wallStarted = performance.now();

while (simulation.state.elapsed < targetModeledSeconds) {
  const started = performance.now();
  simulation.update(stepSeconds);
  monitor.recordSimulationTick(performance.now() - started);
  const collisionAlertCount = simulation['metrics'].collisionAlerts;
  if (collisionAlertCount > observedCollisionAlerts && collisionContacts.length < 20) {
    const conflicts = [
      ...simulation['activeFlightConflicts'](),
      ...simulation['activeObstacleConflicts'](),
    ];
    const conflictFlightIds = new Set(conflicts.flatMap((conflict) => (
      'first' in conflict ? [conflict.first, conflict.second] : [conflict.flight]
    )));
    collisionContacts.push({
      atSeconds: Number(simulation.state.elapsed.toFixed(2)),
      alertIncrease: collisionAlertCount - observedCollisionAlerts,
      conflicts,
      flights: simulation.state.flights
        .filter((flight) => conflictFlightIds.has(flight.id))
        .map((flight) => ({
          id: flight.id,
          callsign: flight.callsign,
          phase: flight.phase,
          progress: Number(flight.progress.toFixed(6)),
          x: Number(flight.motion.x.toFixed(4)),
          y: Number(flight.motion.y.toFixed(4)),
          z: Number(flight.motion.z.toFixed(4)),
          surfaceNode: flight.surfaceNode ?? null,
          surfaceEdge: flight.surfaceEdge ?? null,
          protectedRunway: flight.motion.protectedRunway ?? null,
          protectedRunwayIds: flight.motion.protectedRunwayIds ?? [],
          safetyHoldReason: flight.safetyHoldReason ?? null,
        })),
    });
  }
  observedCollisionAlerts = collisionAlertCount;
  const unexplainedPauseCount = simulation['metrics'].unexplainedPauses;
  if (unexplainedPauseCount > observedUnexplainedPauses && unexplainedPauseContacts.length < 20) {
    unexplainedPauseContacts.push({
      atSeconds: Number(simulation.state.elapsed.toFixed(2)),
      alertIncrease: unexplainedPauseCount - observedUnexplainedPauses,
      flights: simulation.state.flights
        .filter((flight) => (simulation.stationarySeconds.get(flight.id) ?? 0) >= 0.7)
        .map((flight) => ({
          id: flight.id,
          callsign: flight.callsign,
          phase: flight.phase,
          progress: Number(flight.progress.toFixed(6)),
          stationarySeconds: Number((simulation.stationarySeconds.get(flight.id) ?? 0).toFixed(2)),
          groundSpeedKts: Number(flight.kinematics.groundSpeedKts.toFixed(2)),
          controlHold: Boolean(flight.controlHold),
          automaticHold: Boolean(flight.automaticHold),
          automaticHoldReason: flight.automaticHoldReason ?? null,
          safetyHold: Boolean(flight.safetyHold),
          safetyHoldReason: flight.safetyHoldReason ?? null,
          crossingHoldRunway: flight.crossingHoldRunway ?? null,
          surfaceReroute: flight.surfaceReroute?.reason ?? null,
          surfaceYield: flight.surfaceYield ? { ...flight.surfaceYield } : null,
          targetGroundSpeedKts: Number(simulation.targetGroundSpeedKts(flight).toFixed(2)),
          oneMeterProgressDelta: Number((simulation.progressAfterTravelDistance(flight, 1) - flight.progress).toExponential(3)),
          nextCrossing: (() => {
            const crossing = simulation.nextUnclearedCrossing(flight);
            return crossing ? {
              runwayId: crossing.runwayId,
              distanceToHoldM: Number((crossing.distanceToHold * WORLD_METERS_PER_UNIT).toFixed(2)),
              holdProgress: Number(crossing.holdProgress.toFixed(6)),
            } : null;
          })(),
          surfaceMotion: (() => {
            const sample = sampleAircraftSurfaceMotion(
              configuration.surfaceGraph,
              flight.surfaceRoute,
              flight.surfaceRouteEdges,
              flight.progress,
              aircraftProfile(flight.aircraft),
            );
            return sample ? {
              routeClearanceOk: sample.routeClearanceOk,
              minimumRouteWingtipClearanceM: Number(sample.minimumRouteWingtipClearanceM.toFixed(2)),
              requiredWingtipClearanceM: sample.requiredWingtipClearanceM,
              limitingEdgeId: sample.limitingEdgeId ?? null,
              speedLimitKts: Number(sample.speedLimitKts.toFixed(2)),
            } : null;
          })(),
        })),
    });
  }
  observedUnexplainedPauses = unexplainedPauseCount;
  if (traceFlightIds.size && simulation.state.elapsed + 1e-6 >= nextTraceAtSeconds) {
    traceFrames.push({
      atSeconds: Number(simulation.state.elapsed.toFixed(2)),
      flights: simulation.state.flights
        .filter((flight) => traceFlightIds.has(flight.id))
        .map((flight) => ({
          id: flight.id,
          phase: flight.phase,
          progress: Number(flight.progress.toFixed(6)),
          x: Number(flight.motion.x.toFixed(4)),
          y: Number(flight.motion.y.toFixed(4)),
          z: Number(flight.motion.z.toFixed(4)),
          groundSpeedKts: Number(flight.kinematics.groundSpeedKts.toFixed(2)),
          surfaceNode: flight.surfaceNode ?? null,
          surfaceEdge: flight.surfaceEdge ?? null,
          surfaceReroute: flight.surfaceReroute ? {
            revision: flight.surfaceReroute.revision,
            status: flight.surfaceReroute.status,
            selectedAtSeconds: Number(flight.surfaceReroute.selectedAtSeconds.toFixed(1)),
            reason: flight.surfaceReroute.reason,
          } : null,
          arrivalPathBlockerId: flight.phase === 'approach'
            ? simulation['arrivalPathBlocker'](flight)?.id ?? null
            : null,
          cleared: flight.cleared,
          runwayEntryCleared: Boolean(flight.runwayEntryCleared),
          takeoffCleared: Boolean(flight.takeoffCleared),
          protectedRunway: flight.motion.protectedRunway ?? null,
          protectedRunwayIds: flight.motion.protectedRunwayIds ?? [],
          runway: flight.runway,
          pendingCrossingCount: flight.pendingCrossingCount ?? null,
          crossingHoldRunway: flight.crossingHoldRunway ?? null,
          handoff: flight.navigation.handoff
            ? {
                from: flight.navigation.handoff.from,
                to: flight.navigation.handoff.to,
                status: flight.navigation.handoff.status,
              }
            : null,
          recentControllerDecisions: simulation.state.scriptedControllers.decisions
            .filter((decision) => decision.flightId === flight.id)
            .slice(-5)
            .map((decision) => ({
              station: decision.station,
              action: decision.action,
              disposition: decision.disposition,
              result: decision.result,
              atSeconds: Number(decision.resolvedAtSeconds.toFixed(1)),
            })),
          safetyHold: flight.safetyHoldReason ?? null,
          automaticHold: flight.automaticHoldReason ?? null,
          surfaceYield: flight.surfaceYield ? {
            status: flight.surfaceYield.status,
            direction: flight.surfaceYield.direction,
            targetProgress: Number(flight.surfaceYield.targetProgress.toFixed(6)),
            startedAtSeconds: Number(flight.surfaceYield.startedAtSeconds.toFixed(1)),
            releaseAtSeconds: flight.surfaceYield.releaseAtSeconds === undefined
              ? null
              : Number(flight.surfaceYield.releaseAtSeconds.toFixed(1)),
          } : null,
        })),
    });
    if (traceFrames.length > 240) traceFrames.shift();
    nextTraceAtSeconds = simulation.state.elapsed + 1;
  }
  drainedEvents += simulation.drainEvents().length;
  const nextCompletedOperations = simulation.state.arrivals + simulation.state.departures;
  if (nextCompletedOperations > completedOperations) {
    completedOperations = nextCompletedOperations;
    lastCompletedOperationAtSeconds = simulation.state.elapsed;
  }
  for (const flight of simulation.state.flights) createdFlights.add(flight.id);
  if (simulation.state.elapsed >= nextSample) {
    const queues = simulation.queueSnapshot();
    maximumAircraft = Math.max(maximumAircraft, simulation.state.flights.length);
    maximumVehicles = Math.max(maximumVehicles, simulation.state.serviceVehicles.length);
    maximumQueues = Math.max(maximumQueues, queues.total);
    if (forceGarbageCollection) forceGarbageCollection();
    monitor.sample({
      elapsedSeconds: simulation.state.elapsed,
      heapBytes: process.memoryUsage().heapUsed,
      aircraft: simulation.state.flights.length,
      serviceVehicles: simulation.state.serviceVehicles.length,
      audioVoices: 0,
      queues: queues.total,
      drawCalls: 0,
      geometries: 0,
      textures: 0,
      detail: 'low',
    });
    nextSample += 10;
  }
  if (simulation.state.elapsed >= nextCheckpoint) {
    const diagnostics = simulation.diagnostics();
    console.log(JSON.stringify({
      checkpointModeledHours: Number((simulation.state.elapsed / 3_600).toFixed(2)),
      wallMinutes: Number(((performance.now() - wallStarted) / 60_000).toFixed(2)),
      aircraft: simulation.state.flights.length,
      createdFlights: createdFlights.size,
      queues: simulation.queueSnapshot().total,
      completedOperations,
      secondsSinceCompletedOperation: Number((simulation.state.elapsed - lastCompletedOperationAtSeconds).toFixed(1)),
      simP95Ms: monitor.snapshot().simulationTickMs.p95,
      heapMiBPerHour: monitor.snapshot().growth.heapMiBPerHour,
      heapMeasurement,
      collisions: diagnostics.metrics.collisionAlerts,
      incursions: diagnostics.metrics.runwayIncursions,
      unexplainedPauses: diagnostics.metrics.unexplainedPauses,
    }));
    nextCheckpoint += 1_800;
  }
}

const diagnostics = simulation.diagnostics();
const snapshot = monitor.snapshot();
const finalQueues = simulation.queueSnapshot();
const secondsSinceCompletedOperation = simulation.state.elapsed - lastCompletedOperationAtSeconds;
const surfaceEdgeById = new Map(configuration.surfaceGraph.edges.map((edge) => [edge.id, edge]));
const failures = [];
if (diagnostics.metrics.collisionAlerts !== 0) failures.push('collision alerts');
if (diagnostics.metrics.runwayIncursions !== 0) failures.push('runway incursions');
if (diagnostics.metrics.unexplainedPauses !== 0) failures.push('unexplained pauses');
if (snapshot.simulationTickMs.p95 > snapshot.budgets.simulationTickP95Ms) failures.push('simulation p95 budget');
if (snapshot.growth.heapMiBPerHour !== null && snapshot.growth.heapMiBPerHour > snapshot.budgets.heapGrowthMiBPerHour) failures.push('heap growth budget');
if (maximumAircraft > snapshot.budgets.aircraft) failures.push('aircraft entity budget');
if (maximumVehicles > snapshot.budgets.serviceVehicles) failures.push('service-vehicle entity budget');
if (maximumQueues > snapshot.budgets.queues) failures.push('queue budget');
if (secondsSinceCompletedOperation > 1_800 && finalQueues.total > 0) failures.push('traffic flow stalled');

const phaseCounts = Object.fromEntries(
  ['approach', 'landing', 'taxi-in', 'resting', 'taxi-out', 'takeoff']
    .map((phase) => [phase, simulation.state.flights.filter((flight) => flight.phase === phase).length]),
);
const serviceVehicleStatusCounts = Object.fromEntries(
  ['scheduled', 'dispatching', 'staged', 'approaching', 'servicing', 'clearing', 'returning', 'complete']
    .map((status) => [status, simulation.state.serviceVehicles.filter((vehicle) => vehicle.status === status).length]),
);

const report = {
  accepted: failures.length === 0,
  failures,
  airport: configuration.code,
  density: 'extreme',
  mode: requestedMode,
  heapMeasurement,
  requestedHours,
  modeledHours: Number((simulation.state.elapsed / 3_600).toFixed(3)),
  wallMinutes: Number(((performance.now() - wallStarted) / 60_000).toFixed(3)),
  createdFlights: createdFlights.size,
  maximumAircraft,
  maximumVehicles,
  maximumQueues,
  arrivals: simulation.state.arrivals,
  departures: simulation.state.departures,
  drainedEvents,
  collisionContacts,
  unexplainedPauseContacts,
  traceFrames,
  openingFlights,
  secondsSinceCompletedOperation: Number(secondsSinceCompletedOperation.toFixed(1)),
  phaseCounts,
  serviceVehicleStatusCounts,
  departureReservationDiagnostics: simulation.state.flights
    .filter((flight) => flight.phase === 'taxi-out' && flight.progress >= 0.985)
    .map((flight) => ({
      id: flight.id,
      callsign: flight.callsign,
      runway: flight.runway,
      runwayEntryCleared: Boolean(flight.runwayEntryCleared),
      wakeReleaseReason: simulation.runwayReleaseBlocker(flight, 'departure'),
      pathBlocker: (() => {
        const blocker = simulation.departurePathBlocker(flight);
        return blocker ? { id: blocker.id, callsign: blocker.callsign, phase: blocker.phase } : null;
      })(),
      conflictingReservations: [...simulation.runwayReservations.entries()]
        .filter(([runwayId, owner]) => owner !== flight.id && simulation.runwaysConflict(flight.runway, runwayId))
        .map(([runwayId, owner]) => ({ runwayId, owner })),
      protectedTraffic: simulation.state.flights
        .filter((other) => (
          other.id !== flight.id
          && simulation.runwaysConflict(flight.runway, other.runway)
          && (
            other.phase === 'approach'
            || other.phase === 'landing'
            || (other.phase === 'taxi-in' && other.motion.protectedRunway)
            || (other.phase === 'taxi-out' && (other.motion.protectedRunway || Boolean(other.runwayEntryCleared)))
            || other.phase === 'takeoff'
          )
        ))
        .map((other) => ({ id: other.id, callsign: other.callsign, phase: other.phase, runway: other.runway })),
    })),
  heldServiceVehicles: simulation.state.serviceVehicles
    .filter((vehicle) => vehicle.held)
    .map((vehicle) => ({
      id: vehicle.id,
      flightId: vehicle.flightId,
      label: vehicle.label,
      status: vehicle.status,
      progress: Number(vehicle.progress.toFixed(4)),
      currentNode: vehicle.currentNode ?? null,
      currentEdge: vehicle.currentEdge ?? null,
      holdReason: vehicle.holdReason ?? null,
    })),
  activeFlights: simulation.state.flights.map((flight) => ({
    id: flight.id,
    callsign: flight.callsign,
    aircraft: flight.aircraft,
    wakeClass: flight.wakeClass,
    phase: flight.phase,
    progress: Number(flight.progress.toFixed(4)),
    stationarySeconds: Number((simulation.stationarySeconds.get(flight.id) ?? 0).toFixed(1)),
    gate: flight.gateAssignment?.gateRef ?? flight.standId ?? null,
    surfaceNode: flight.surfaceNode ?? null,
    surfaceEdge: flight.surfaceEdge ?? null,
    groundSpeedKts: Number(flight.kinematics.groundSpeedKts.toFixed(1)),
    protectedRunway: flight.motion.protectedRunway ?? null,
    protectedRunwayIds: flight.motion.protectedRunwayIds ?? [],
    runway: flight.runway,
    x: Number(flight.motion.x.toFixed(4)),
    y: Number(flight.motion.y.toFixed(4)),
    heading: Number(flight.motion.heading.toFixed(4)),
    frequencyOwner: flight.navigation.frequencyOwner,
    handoffStatus: flight.navigation.handoff?.status ?? null,
    turnaroundStatus: flight.turnaround.status,
    pushbackCleared: flight.pushbackCleared,
    runwayEntryCleared: Boolean(flight.runwayEntryCleared),
    takeoffCleared: Boolean(flight.takeoffCleared),
    requiredCrossings: flight.requiredCrossings ?? [],
    crossingClearances: flight.crossingClearances ?? [],
    crossingClearanceIds: flight.crossingClearanceIds ?? [],
    pendingCrossingCount: flight.pendingCrossingCount ?? null,
    surfaceYield: flight.surfaceYield ? {
      status: flight.surfaceYield.status,
      direction: flight.surfaceYield.direction,
      targetProgress: Number(flight.surfaceYield.targetProgress.toFixed(6)),
      startedAtSeconds: Number(flight.surfaceYield.startedAtSeconds.toFixed(1)),
      releaseAtSeconds: flight.surfaceYield.releaseAtSeconds === undefined
        ? null
        : Number(flight.surfaceYield.releaseAtSeconds.toFixed(1)),
    } : null,
    reverseOneMeter: (flight.phase === 'taxi-in' || flight.phase === 'taxi-out') ? (() => {
      const progress = simulation.progressBeforeTravelDistance(flight, 1);
      const motion = sampleFlightMotion(configuration, flight, progress);
      return {
        progress: Number(progress.toFixed(7)),
        x: Number(motion.x.toFixed(5)),
        y: Number(motion.y.toFixed(5)),
      };
    })() : null,
    serviceVehicles: simulation.state.serviceVehicles
      .filter((vehicle) => vehicle.flightId === flight.id)
      .map((vehicle) => ({ label: vehicle.label, status: vehicle.status })),
    recentControllerDecisions: simulation.state.scriptedControllers.decisions
      .filter((decision) => decision.flightId === flight.id)
      .slice(-3)
      .map((decision) => ({
        station: decision.station,
        action: decision.action,
        disposition: decision.disposition,
        result: decision.result,
        atSeconds: Number(decision.resolvedAtSeconds.toFixed(1)),
      })),
    hold: flight.safetyHoldReason ?? flight.automaticHoldReason ?? (flight.controlHold ? 'controller hold' : null),
  })),
  heldFlights: simulation.state.flights
    .filter((flight) => flight.controlHold || flight.automaticHold || flight.safetyHold || flight.crossingHoldRunway !== undefined)
    .map((flight) => {
      const currentEdgeIndex = Math.max(0, flight.surfaceRouteEdges?.indexOf(flight.surfaceEdge ?? '') ?? -1);
      const surfaceSample = sampleSurfaceRouteWithEdges(
        configuration.surfaceGraph,
        flight.surfaceRoute,
        flight.surfaceRouteEdges,
        flight.progress,
      );
      return {
        id: flight.id,
        callsign: flight.callsign,
        phase: flight.phase,
        progress: Number(flight.progress.toFixed(4)),
        stationarySeconds: Number((simulation.stationarySeconds.get(flight.id) ?? 0).toFixed(1)),
        gate: flight.gateAssignment?.gateRef ?? flight.standId ?? null,
        surfaceNode: flight.surfaceNode ?? null,
        surfaceEdge: flight.surfaceEdge ?? null,
        surfaceSample: surfaceSample ? {
          edgeIndex: surfaceSample.edgeIndex,
          edgeProgress: Number(surfaceSample.edgeProgress.toFixed(4)),
          fromNodeId: surfaceSample.fromNodeId,
          toNodeId: surfaceSample.toNodeId,
          x: Number(surfaceSample.x.toFixed(4)),
          y: Number(surfaceSample.y.toFixed(4)),
          heading: Number(surfaceSample.heading.toFixed(4)),
        } : null,
        holds: {
          control: flight.controlHold,
          automatic: flight.automaticHold,
          safety: flight.safetyHold,
        },
        nearbyRoute: (flight.surfaceRouteEdges ?? [])
          .slice(Math.max(0, currentEdgeIndex - 2), currentEdgeIndex + 5)
          .map((edgeId) => ({ id: edgeId, name: surfaceEdgeById.get(edgeId)?.name ?? edgeId })),
        pushbackProgress: Number((flight.pushbackProgress ?? 0).toFixed(4)),
        frequencyOwner: flight.navigation.frequencyOwner,
        handoff: flight.navigation.handoff
          ? {
              from: flight.navigation.handoff.from,
              to: flight.navigation.handoff.to,
              status: flight.navigation.handoff.status,
            }
          : null,
        nextCrossing: simulation.nextUnclearedCrossing(flight)?.runwayId ?? null,
        surfaceReroute: flight.surfaceReroute
          ? {
              revision: flight.surfaceReroute.revision,
              status: flight.surfaceReroute.status,
              selectedAtSeconds: Number(flight.surfaceReroute.selectedAtSeconds.toFixed(1)),
              reason: flight.surfaceReroute.reason,
            }
          : null,
        surfaceYield: flight.surfaceYield ? {
          status: flight.surfaceYield.status,
          direction: flight.surfaceYield.direction,
          targetProgress: Number(flight.surfaceYield.targetProgress.toFixed(6)),
          startedAtSeconds: Number(flight.surfaceYield.startedAtSeconds.toFixed(1)),
          releaseAtSeconds: flight.surfaceYield.releaseAtSeconds === undefined
            ? null
            : Number(flight.surfaceYield.releaseAtSeconds.toFixed(1)),
        } : null,
        recentControllerDecisions: simulation.state.scriptedControllers.decisions
          .filter((decision) => decision.flightId === flight.id)
          .slice(-3)
          .map((decision) => ({
            station: decision.station,
            action: decision.action,
            disposition: decision.disposition,
            result: decision.result,
            atSeconds: Number(decision.resolvedAtSeconds.toFixed(1)),
          })),
        reason: flight.safetyHoldReason ?? flight.automaticHoldReason ?? (flight.controlHold ? 'controller hold' : 'runway crossing hold'),
      };
    }),
  longestQueues: finalQueues.entries.slice(0, 12).map((entry) => ({
    id: entry.id,
    flightId: entry.flightId ?? null,
    category: entry.category,
    priority: entry.priority,
    entity: entry.entity,
    label: entry.label,
    detail: entry.detail,
    waitSeconds: entry.waitSeconds,
    blockerFlightIds: entry.blockerFlightIds,
  })),
  longestWaitQueue: [...finalQueues.entries]
    .sort((first, second) => second.waitSeconds - first.waitSeconds)
    .slice(0, 1)
    .map((entry) => ({
      id: entry.id,
      flightId: entry.flightId ?? null,
      category: entry.category,
      priority: entry.priority,
      entity: entry.entity,
      label: entry.label,
      detail: entry.detail,
      waitSeconds: entry.waitSeconds,
      blockerFlightIds: entry.blockerFlightIds,
    }))[0] ?? null,
  longestSurfaceWaitQueue: [...finalQueues.entries]
    .filter((entry) => {
      const flight = entry.flightId === undefined || entry.flightId === null
        ? undefined
        : simulation.state.flights.find((candidate) => candidate.id === entry.flightId);
      return flight?.phase === 'taxi-in' || flight?.phase === 'taxi-out';
    })
    .sort((first, second) => second.waitSeconds - first.waitSeconds)
    .slice(0, 1)
    .map((entry) => ({
      id: entry.id,
      flightId: entry.flightId ?? null,
      category: entry.category,
      priority: entry.priority,
      entity: entry.entity,
      label: entry.label,
      detail: entry.detail,
      waitSeconds: entry.waitSeconds,
      blockerFlightIds: entry.blockerFlightIds,
    }))[0] ?? null,
  performance: snapshot,
  safety: {
    collisions: diagnostics.metrics.collisionAlerts,
    incursions: diagnostics.metrics.runwayIncursions,
    unexplainedPauses: diagnostics.metrics.unexplainedPauses,
  },
};
const compact = {
  accepted: report.accepted,
  failures: report.failures,
  airport: report.airport,
  mode: report.mode,
  modeledHours: report.modeledHours,
  arrivals: report.arrivals,
  departures: report.departures,
  maximumAircraft: report.maximumAircraft,
  maximumVehicles: report.maximumVehicles,
  maximumQueues: report.maximumQueues,
  secondsSinceCompletedOperation: report.secondsSinceCompletedOperation,
  longestQueueWaitSeconds: report.longestWaitQueue?.waitSeconds ?? 0,
  longestQueue: report.longestQueues[0] ?? null,
  longestWaitQueue: report.longestWaitQueue,
  longestSurfaceQueueWaitSeconds: report.longestSurfaceWaitQueue?.waitSeconds ?? 0,
  longestSurfaceWaitQueue: report.longestSurfaceWaitQueue,
  simulationTickP95Ms: report.performance.simulationTickMs.p95,
  safety: report.safety,
};
console.log(JSON.stringify(compactReport ? compact : report));
if (failures.length) process.exitCode = 1;
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: source,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "runtime-soak.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Runtime soak bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

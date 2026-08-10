import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from "./src/simulation/airportConfig.ts";
import { AirportSimulation } from "./src/simulation/airportSimulation.ts";
import { SurfaceSafetyAdvisoryTracker, surfaceSafetySnapshot, wrongSurfaceApproachAdvisories } from "./src/simulation/surfaceSafety.ts";
import { SURFACE_SAFETY_PANEL_MAX_UPDATES_PER_SECOND, SURFACE_SAFETY_PANEL_UPDATE_INTERVAL_MS, surfaceSafetyCorridorsForFilter, surfaceSafetyLookaheadTargets, surfaceSafetyPanelKey, surfaceSafetyTracksForFilter, surfaceSafetyVehiclesForFilter } from "./src/ui/surfaceSafetyPanel.ts";
import { runwayProtectionStatuses } from "./src/simulation/runwayProtection.ts";
import { runwayEndPoint, runwayTravelDirection } from "./src/simulation/runwayGeometry.ts";
import { SurfaceSafetyAcknowledgements } from "./src/simulation/surfaceSafetyAcknowledgements.ts";
import { SurfaceSafetyAnnouncementTracker } from "./src/presentation/surfaceSafetyAnnouncements.ts";
import { aircraftCollisionEnvelope, findFlightConflicts } from "./src/simulation/collisionDetection.ts";
import { syncFlightMotion } from "./src/simulation/flightMotion.ts";
import { aircraftProfile } from "./src/simulation/aircraftProfiles.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === "ORD");
const config = generateHubConfig(ordIndex);
const simulation = new AirportSimulation(config);
const [first, second] = simulation.state.flights;
assert(first && second, "ORD needs an initial departure bank for surface-safety validation");

const routeSimulation = new AirportSimulation(config);
const routeFlight = routeSimulation.state.flights.find(
  (flight) => flight.phase === "taxi-out" && flight.surfaceRouteEdges?.length,
);
assert(routeFlight, "surface-safety validation needs a routed departure");
routeFlight.surfaceRoute = undefined;
routeFlight.surfaceRouteEdges = undefined;
routeSimulation.update(1 / 30);
assert(
  routeFlight.automaticHold &&
    routeFlight.automaticHoldReason === "surface movement held: no graph route",
  "missing graph route did not create an explainable automatic hold",
);
const recoveryRoute = routeSimulation.state.flights.find(
  (flight) => flight.id !== routeFlight.id && flight.surfaceRoute?.length && flight.surfaceRouteEdges?.length,
);
assert(recoveryRoute, "surface-safety validation needs a route for hold recovery");
routeFlight.surfaceRoute = [...recoveryRoute.surfaceRoute];
routeFlight.surfaceRouteEdges = [...recoveryRoute.surfaceRouteEdges];
routeSimulation.update(1 / 30);
assert(
  routeFlight.automaticHoldReason !== "surface movement held: no graph route",
  "restored graph route did not clear the no-route hold reason",
);

const savedSurfaceRoute = first.surfaceRoute;
const savedSurfaceRouteEdges = first.surfaceRouteEdges;
first.surfaceRoute = undefined;
first.surfaceRouteEdges = undefined;
const noRouteStart = aircraftCollisionEnvelope(config, first, 0);
const noRouteEnd = aircraftCollisionEnvelope(config, first, 1);
assert(noRouteStart.x === noRouteEnd.x && noRouteStart.y === noRouteEnd.y && noRouteEnd.taxiway === "NO-ROUTE-HOLD" && !noRouteEnd.protectedSurface, "missing surface route invented a gate-to-runway collision path");
first.surfaceRoute = savedSurfaceRoute;
first.surfaceRouteEdges = savedSurfaceRouteEdges;

first.phase = "taxi-out";
first.motion.onGround = true;
first.motion.protectedRunway = false;
first.motion.heading = Math.PI / 2;
first.kinematics.groundSpeedKts = 17;
first.taxiway = "A";
first.controlHold = true;

second.phase = "taxi-out";
second.motion.onGround = true;
second.motion.protectedRunway = true;
second.runway = first.runway;
second.motion.protectedRunwayIds = [first.runway];
second.kinematics.groundSpeedKts = 12;
first.holdShortRunway = first.runway;
first.runwayEntryCleared = false;
first.takeoffCleared = false;

const originalSurfaceCrossingPlan = simulation.surfaceCrossingPlan;
simulation.surfaceCrossingPlan = () => ({
  routeNodes: [],
  routeEdges: [],
  runway: first.runway,
  aircraft: first.aircraft,
  routeDistanceWorld: 10,
  routeDistanceM: 380,
  windows: [{
    id: "synthetic-protected-crossing",
    runwayId: first.runway,
    edgeId: "synthetic-edge",
    edgeIndex: 0,
    exitEdgeIndex: 1,
    holdProgress: 0.95,
    entryProgress: 0.96,
    exitProgress: 0.99,
    distanceToHold: 1,
    holdPointId: config.surfaceGraph.nodes[0].id,
  }],
  groups: [],
});
const crossingForecast = simulation.conflictPredictions().find(
  (prediction) => prediction.type === "crossing" && prediction.flights.includes(first.id),
);
simulation.surfaceCrossingPlan = originalSurfaceCrossingPlan;
assert(
  crossingForecast?.flights.includes(second.id) && crossingForecast.runway !== undefined,
  "an approaching taxi crossing protected by active runway traffic did not create a pre-incursion forecast",
);

// Exercise the actual sourced ORD graph and crossing cache rather than only
// the synthetic unit fixture above. Force a stale crossing clearance while a
// runway movement owns the same runway, then prove the shared safety picture
// warns before the physical collision layer reports an incursion.
let seededConfig;
let seededIncursion;
let seededCrossingFlight;
seededSearch: for (let hubIndex = 0; hubIndex < HUB_AIRPORTS.length; hubIndex += 1) {
  const candidateConfig = generateHubConfig(hubIndex);
  const candidateSimulation = new AirportSimulation(candidateConfig);
  for (const sourceFlight of candidateSimulation.state.flights) {
    for (const runway of candidateConfig.runways) {
      const candidate = structuredClone(sourceFlight);
      candidate.phase = "taxi-out";
      candidate.progress = 0;
      candidate.runway = runway.id;
      candidate.departureRunway = runway.id;
      candidate.operatingEnd = -runway.landingEnd;
      candidate.surfaceRoute = undefined;
      candidate.surfaceRouteEdges = undefined;
      candidateSimulation.assignSurfaceRoute(candidate, "taxi-out");
      if (candidateSimulation.surfaceCrossingPlan(candidate).windows.length > 0) {
        seededConfig = candidateConfig;
        seededIncursion = candidateSimulation;
        seededCrossingFlight = candidate;
        break seededSearch;
      }
    }
  }
  // Some hub planners deliberately avoid assigning a crossing to their
  // opening bank. Advance the same deterministic Auto seed until normal
  // arrivals/departures create a sourced crossing route, rather than inventing
  // graph geometry for the acceptance fixture.
  candidateSimulation.setMode("auto");
  candidateSimulation.setPace(3);
  candidateSimulation.setPaused(false);
  for (let step = 0; step < 16_000; step += 1) {
    candidateSimulation.update(0.05);
    if (step % 20 !== 0) continue;
    const routed = candidateSimulation.state.flights.find(
      (flight) =>
        (flight.phase === "taxi-in" || flight.phase === "taxi-out") &&
        candidateSimulation.surfaceCrossingPlan(flight).windows.length > 0,
    );
    if (!routed) continue;
    seededConfig = candidateConfig;
    seededIncursion = candidateSimulation;
    seededCrossingFlight = structuredClone(routed);
    break seededSearch;
  }
}
assert(seededConfig && seededIncursion && seededCrossingFlight, "named-hub traffic needs a real sourced runway crossing");
const seededCrossing = seededIncursion.surfaceCrossingPlan(seededCrossingFlight).windows[0];
const seededRunwayOwner = seededIncursion.state.flights.find(
  (flight) => flight.id !== seededCrossingFlight.id,
);
assert(seededCrossing && seededRunwayOwner, "seeded incursion fixture needs a crossing and runway owner");
seededCrossingFlight.progress = Math.max(0, seededCrossing.holdProgress - 0.02);
seededCrossingFlight.crossingClearanceIds = [seededCrossing.id];
seededCrossingFlight.crossingClearances = [seededCrossing.runwayId];
syncFlightMotion(seededConfig, seededCrossingFlight);
seededRunwayOwner.phase = "takeoff";
seededRunwayOwner.runway = seededCrossing.runwayId;
seededRunwayOwner.operatingEnd = -seededConfig.runways[seededCrossing.runwayId].landingEnd;
seededRunwayOwner.progress = 0.12;
seededRunwayOwner.runwayEntryCleared = true;
seededRunwayOwner.takeoffCleared = true;
seededRunwayOwner.surfaceRoute = undefined;
seededRunwayOwner.surfaceRouteEdges = undefined;
syncFlightMotion(seededConfig, seededRunwayOwner);
seededIncursion.state.flights = [seededCrossingFlight, seededRunwayOwner];
const seededPreOverlapConflicts = findFlightConflicts(seededConfig, seededIncursion.state.flights);
assert(
  !seededPreOverlapConflicts.some((conflict) => conflict.type === "runway-incursion"),
  "seeded crossing fixture already overlapped before predictive evaluation",
);
const seededPrediction = seededIncursion.conflictPredictions().find(
  (prediction) =>
    prediction.type === "crossing" &&
    prediction.flights.includes(seededCrossingFlight.id) &&
    prediction.flights.includes(seededRunwayOwner.id),
);
assert(
  seededPrediction && seededPrediction.etaSeconds > 0,
  "a real seeded ORD stale crossing clearance did not warn before protected envelopes overlapped",
);
const seededSurfaceSnapshot = surfaceSafetySnapshot(
  seededConfig,
  seededIncursion.state,
  [seededPrediction],
  { collisionAlerts: 0, runwayIncursions: 0 },
);
const seededAdvisory = seededSurfaceSnapshot.advisories.find((advisory) => advisory.kind === "runway-crossing");
const seededTrack = seededSurfaceSnapshot.tracks.find((track) => track.id === seededCrossingFlight.id);
const seededDepartureCorridor = seededSurfaceSnapshot.protectionCorridors.find(
  (corridor) => corridor.flightId === seededRunwayOwner.id,
);
assert(
  seededAdvisory?.severity === "warning" && seededAdvisory.geometry.kind === "corridor",
  "seeded pre-incursion prediction did not survive as an explainable warning corridor: " + JSON.stringify({ prediction: seededPrediction, advisory: seededAdvisory, crossing: seededCrossing }),
);
assert(
  seededTrack?.routeGeometry?.points.length >= 2 &&
    seededTrack.routeGeometry.points.length <= 30 &&
    seededTrack.routeGeometry.crossings.length <= 8 &&
    seededTrack.routeGeometry.points[0][0] === seededCrossingFlight.motion.x &&
    seededTrack.routeGeometry.points[0][1] === seededCrossingFlight.motion.y,
  "surface route intent did not begin at the authoritative aircraft pose",
);
const seededCrossingIntent = seededTrack.routeGeometry.crossings.find((crossing) => crossing.id === seededCrossing.id);
assert(
  seededCrossingIntent?.status === "cleared" &&
    seededCrossingIntent.runwayId === seededCrossing.runwayId &&
    seededCrossingIntent.crossingPoint.every(Number.isFinite),
  "surface route intent omitted the authoritative runway-crossing clearance state",
);
assert(
  seededDepartureCorridor?.operation === "departure" &&
    seededDepartureCorridor.points.length >= 2 &&
    seededDepartureCorridor.points.length <= 18 &&
    seededDepartureCorridor.points[0][0] === seededRunwayOwner.motion.x &&
    seededDepartureCorridor.points[0][1] === seededRunwayOwner.motion.y,
  "departure protection corridor did not begin at the authoritative flight pose: " + JSON.stringify({
    corridor: seededDepartureCorridor,
    motion: seededRunwayOwner.motion,
  }),
);

// Move the sourced crossing aircraft through the real graph window using the
// production fixed-step update. At every protected-pavement sample the surface
// track, authoritative motion, and collision envelope must remain identical.
const liveCrossingSimulation = new AirportSimulation(seededConfig);
const liveCrossingFlight = structuredClone(seededCrossingFlight);
liveCrossingSimulation.state.flights = [liveCrossingFlight];
liveCrossingSimulation.state.serviceVehicles = [];
liveCrossingSimulation.setMode("manual");
liveCrossingSimulation.setPaused(false);
liveCrossingFlight.phase = seededCrossingFlight.phase;
liveCrossingFlight.progress = Math.max(0, seededCrossing.entryProgress - 0.0015);
liveCrossingFlight.controlHold = false;
liveCrossingFlight.automaticHold = false;
liveCrossingFlight.automaticHoldReason = undefined;
liveCrossingFlight.safetyHold = false;
liveCrossingFlight.safetyHoldReason = undefined;
liveCrossingFlight.holdShortRunway = undefined;
liveCrossingFlight.crossingClearanceIds = [seededCrossing.id];
liveCrossingFlight.crossingClearances = [seededCrossing.runwayId];
liveCrossingFlight.kinematics.groundSpeedKts = 12;
syncFlightMotion(seededConfig, liveCrossingFlight);
const liveCrossingSamples = [];
for (let step = 0; step < 3_000; step += 1) {
  liveCrossingSimulation.update(0.05);
  const protectedCrossing = liveCrossingFlight.motion.protectedRunwayIds.includes(
    seededCrossing.runwayId,
  );
  if (protectedCrossing) {
    const envelope = aircraftCollisionEnvelope(
      seededConfig,
      liveCrossingFlight,
      liveCrossingFlight.progress,
    );
    const liveSnapshot = surfaceSafetySnapshot(
      seededConfig,
      liveCrossingSimulation.state,
      [],
      { collisionAlerts: 0, runwayIncursions: 0 },
    );
    const track = liveSnapshot.tracks.find(
      (candidate) => candidate.id === liveCrossingFlight.id,
    );
    assert(
      track &&
        track.x === liveCrossingFlight.motion.x &&
        track.y === liveCrossingFlight.motion.y &&
        envelope.x === track.x &&
        envelope.y === track.y &&
        envelope.surface &&
        envelope.protectedSurface,
      "live crossing motion diverged between track, authoritative pose, and collision envelope",
    );
    liveCrossingSamples.push([track.x, track.y]);
  }
  if (liveCrossingFlight.progress > seededCrossing.exitProgress + 0.002) break;
}
const liveCrossingDistance = liveCrossingSamples.length > 1
  ? Math.hypot(
      liveCrossingSamples.at(-1)[0] - liveCrossingSamples[0][0],
      liveCrossingSamples.at(-1)[1] - liveCrossingSamples[0][1],
    )
  : 0;
assert(
  liveCrossingSamples.length >= 2 && liveCrossingDistance > 0.05,
  "sourced runway crossing did not advance through protected pavement: " +
    JSON.stringify({
      samples: liveCrossingSamples.length,
      distance: liveCrossingDistance,
      progress: liveCrossingFlight.progress,
      window: seededCrossing,
      hold: liveCrossingFlight.automaticHoldReason,
    }),
);

// A later pushback/departure reservation must never stop an aircraft after
// Ground has committed it to a runway crossing. That ordering fault can leave
// the cleared aircraft owning the runway indefinitely and starve every older
// aircraft at the opposite hold-short point.
const committedCrossingSimulation = new AirportSimulation(seededConfig);
const committedCrossingFlight = structuredClone(seededCrossingFlight);
committedCrossingSimulation.state.flights = [committedCrossingFlight];
committedCrossingSimulation.state.serviceVehicles = [];
committedCrossingSimulation.setMode("auto");
committedCrossingSimulation.setPaused(false);
committedCrossingFlight.progress = Math.max(
  seededCrossing.holdProgress,
  seededCrossing.entryProgress - 0.0015,
);
committedCrossingFlight.controlHold = false;
committedCrossingFlight.automaticHold = false;
committedCrossingFlight.automaticHoldReason = undefined;
committedCrossingFlight.safetyHold = false;
committedCrossingFlight.safetyHoldReason = undefined;
committedCrossingFlight.crossingClearanceIds = [seededCrossing.id];
committedCrossingFlight.crossingClearances = [seededCrossing.runwayId];
committedCrossingFlight.kinematics.groundSpeedKts = 6;
syncFlightMotion(seededConfig, committedCrossingFlight);
const syntheticLaterReservation = {
  ...structuredClone(seededRunwayOwner),
  id: 99001,
  callsign: "Synthetic later reservation",
};
committedCrossingSimulation.activePushbackCorridorBlocker = () =>
  syntheticLaterReservation;
committedCrossingSimulation.committedDepartureCorridorBlocker = () =>
  syntheticLaterReservation;
const committedStart = committedCrossingFlight.progress;
for (let step = 0; step < 20; step += 1)
  committedCrossingSimulation.update(0.05);
assert(
  committedCrossingFlight.progress > committedStart &&
    !committedCrossingFlight.automaticHoldReason?.includes("corridor"),
  "a later surface reservation stopped an already-cleared runway crossing: " +
    JSON.stringify({
      start: committedStart,
      progress: committedCrossingFlight.progress,
      hold: committedCrossingFlight.automaticHoldReason,
    }),
);

// Crossing windows already end at the far edge of the sourced runway-access
// pavement. A fixed route-progress grace after that boundary scales with the
// entire taxi route and can keep a runway reserved far into the next taxiway.
// Release the commitment as soon as the authoritative crossing is vacated.
const postExitCrossingFlight = structuredClone(seededCrossingFlight);
postExitCrossingFlight.crossingClearanceIds = [seededCrossing.id];
postExitCrossingFlight.crossingClearances = [seededCrossing.runwayId];
postExitCrossingFlight.progress =
  seededCrossing.exitProgress +
  (aircraftProfile(postExitCrossingFlight.aircraft).lengthM / 2 + 5) /
    seededIncursion.surfaceCrossingPlan(postExitCrossingFlight).routeDistanceM +
  0.0001;
syncFlightMotion(seededConfig, postExitCrossingFlight);
committedCrossingSimulation.state.flights = [postExitCrossingFlight];
assert(
  !committedCrossingSimulation
    .activeClearedCrossingRunways(postExitCrossingFlight)
    .includes(seededCrossing.runwayId),
  "a vacated crossing retained runway ownership into the next taxiway",
);

// Ramp recovery may begin inside a conservative vehicle envelope, but it may
// only escape from it. A path that approaches the vehicle or re-enters the
// envelope must remain blocked.
const recoveryEnvelope = (x) => ({ x, y: 0, bodyRadius: 2 });
assert(
  committedCrossingSimulation.surfaceRecoverySweepEscapesVehicle(
    { envelopes: [recoveryEnvelope(2), recoveryEnvelope(3), recoveryEnvelope(5)] },
    0,
    0,
    1,
  ),
  "a strictly separating tug recovery could not escape an existing service-vehicle envelope",
);
assert(
  !committedCrossingSimulation.surfaceRecoverySweepEscapesVehicle(
    { envelopes: [recoveryEnvelope(2), recoveryEnvelope(1.5), recoveryEnvelope(4)] },
    0,
    0,
    1,
  ),
  "a tug recovery was allowed to move closer to a service vehicle",
);

// A departure tugged out of an inbound aircraft's path must not remain in the
// synthetic drain hold until the 15-minute starvation gate. After a bounded
// five-minute yield, normal surface reservations and collision arbitration
// become authoritative again and can either release or re-hold the aircraft.
const boundedYieldSimulation = new AirportSimulation(seededConfig);
const yieldingDeparture = structuredClone(seededCrossingFlight);
const drainingArrival = structuredClone(seededRunwayOwner);
yieldingDeparture.id = 88001;
yieldingDeparture.phase = "taxi-out";
yieldingDeparture.surfaceYield = {
  status: "holding",
  direction: "reverse",
  targetProgress: yieldingDeparture.progress,
  startedAtSeconds: 0,
  releaseAtSeconds: 15,
  reason: "surface wait cycle validation · hold for inbound drain",
  blockerFlightIds: [88002],
  previousTugAttached: false,
  previousEngineState: "running",
};
yieldingDeparture.automaticHold = true;
yieldingDeparture.automaticHoldReason =
  "surface recovery position held for crossing traffic";
drainingArrival.id = 88002;
drainingArrival.phase = "taxi-in";
boundedYieldSimulation.state.flights = [yieldingDeparture, drainingArrival];
boundedYieldSimulation.state.elapsed = 299.9;
boundedYieldSimulation.updateSurfaceYields();
assert(
  yieldingDeparture.surfaceYield?.status === "holding",
  "inbound-drain recovery released before its bounded protection window",
);
boundedYieldSimulation.state.elapsed = 315;
boundedYieldSimulation.updateSurfaceYields();
assert(
  !yieldingDeparture.surfaceYield &&
    !yieldingDeparture.automaticHold &&
    !yieldingDeparture.safetyHold,
  "inbound-drain recovery remained synthetically held for 15 minutes",
);

const safeParallelRunways = seededConfig.runways.flatMap((runway, index) =>
  seededConfig.runways.slice(index + 1).flatMap((other) =>
    Math.abs(Math.sin(runway.heading - other.heading)) < 0.08 &&
    !seededIncursion.runwaysConflict(runway.id, other.id)
      ? [[runway, other]]
      : [],
  ),
)[0];
assert(safeParallelRunways, "ORD needs an independent parallel runway pair for safety validation");
const [parallelFirstRunway, parallelSecondRunway] = safeParallelRunways;
const parallelFirst = structuredClone(seededCrossingFlight);
const parallelSecond = structuredClone(seededRunwayOwner);
parallelFirst.id = 9001;
parallelFirst.phase = "takeoff";
parallelFirst.runway = parallelFirstRunway.id;
parallelFirst.operatingEnd = -parallelFirstRunway.landingEnd;
parallelFirst.progress = 0.45;
parallelFirst.surfaceRoute = undefined;
parallelFirst.surfaceRouteEdges = undefined;
parallelSecond.id = 9002;
parallelSecond.phase = "takeoff";
parallelSecond.runway = parallelSecondRunway.id;
parallelSecond.operatingEnd = -parallelSecondRunway.landingEnd;
parallelSecond.progress = 0.45;
parallelSecond.surfaceRoute = undefined;
parallelSecond.surfaceRouteEdges = undefined;
syncFlightMotion(seededConfig, parallelFirst);
syncFlightMotion(seededConfig, parallelSecond);
assert(
  !findFlightConflicts(seededConfig, [parallelFirst, parallelSecond]).some(
    (conflict) => conflict.type === "runway-incursion",
  ),
  "independent parallel runway movements produced a false incursion",
);
const safeParallelSnapshot = surfaceSafetySnapshot(
  seededConfig,
  { ...seededIncursion.state, flights: [parallelFirst, parallelSecond] },
  [],
  { collisionAlerts: 0, runwayIncursions: 0 },
);
assert(
  !safeParallelSnapshot.advisories.some((advisory) => advisory.severity === "critical"),
  "safe independent parallel operations produced a critical surface advisory",
);

simulation.state.serviceVehicles.push({
  id: "safety-test-fuel",
  flightId: first.id,
  callsign: "Fuel 01",
  service: "fueling",
  type: "fuel-truck",
  label: "Fuel truck",
  status: "dispatching",
  standId: "stand-test",
  zoneId: "Test ramp",
  bayId: "bay-test",
  standSide: "left",
  depotNodeId: config.surfaceGraph.nodes[0].id,
  outboundRoute: [],
  outboundRouteEdges: [],
  returnRoute: [],
  returnRouteEdges: [],
  standPath: [],
  dispatchAtSeconds: 0,
  progress: 0.4,
  x: 14,
  y: -8,
  heading: Math.PI,
  groundSpeedMps: 4,
  maximumSpeedMps: 8,
  held: true,
  holdReason: "Test hold",
  protectedMovementArea: false,
  protectedMovementAuthorized: false,
});

const predictions = [{
  severity: "caution",
  type: "runway",
  flights: [first.id, second.id],
  runway: second.runway,
  etaSeconds: 8,
  detail: "Synthetic runway occupancy forecast",
}, crossingForecast];
const snapshot = surfaceSafetySnapshot(config, simulation.state, predictions, {
  collisionAlerts: 0,
  runwayIncursions: 0,
});

assert(SURFACE_SAFETY_PANEL_UPDATE_INTERVAL_MS === 250, "surface panel cadence exceeded the established four-hertz DOM budget");
const panelKeys = new Set();
for (let frame = 0; frame <= 120; frame += 1) {
  panelKeys.add(surfaceSafetyPanelKey({
    ...snapshot,
    generatedAtSeconds: snapshot.generatedAtSeconds + frame / 60,
  }));
}
assert(
  panelKeys.size <= SURFACE_SAFETY_PANEL_MAX_UPDATES_PER_SECOND * 2 + 1,
  "surface panel regenerated its target projection at render-frame cadence",
);

assert(snapshot.schemaVersion === 3, "surface snapshot version changed unexpectedly");
assert(snapshot.tracks.length >= 2, "surface snapshot omitted the known moving aircraft");
assert(snapshot.tracks.every((track) => Number.isFinite(track.x) && Number.isFinite(track.y)), "surface snapshot emitted an invalid authoritative pose");
assert(snapshot.tracks.every((track) => track.schemaVersion === 2), "surface tracks were not individually versioned");
for (const track of snapshot.tracks) {
  const flight = simulation.state.flights.find((candidate) => candidate.id === track.id);
  assert(flight, "surface snapshot included an unknown flight track");
  const envelope = aircraftCollisionEnvelope(config, flight, flight.progress);
  assert(
      track.x === flight.motion.x &&
      track.y === flight.motion.y &&
      track.headingDegrees === Math.round(((((flight.motion.heading * 180) / Math.PI) % 360) + 360) % 360) &&
      envelope.x === track.x &&
      envelope.y === track.y,
    "surface track and collision envelope diverged from the authoritative pose for " + flight.callsign + ": " + JSON.stringify({ phase: flight.phase, progress: flight.progress, motion: [flight.motion.x, flight.motion.y], track: [track.x, track.y], envelope: [envelope.x, envelope.y] }),
  );
}
const held = snapshot.tracks.find((track) => track.id === first.id);
const protectedTrack = snapshot.tracks.find((track) => track.id === second.id);
assert(held?.state === "controller-hold", "controller hold did not survive the surface projection");
assert(held?.location === "TWY A", "named taxiway did not survive the surface projection");
assert(held?.headingDegrees === 90 && held.groundspeedKts === 17, "authoritative motion telemetry changed in the surface projection");
assert(held?.routeIntent.length && held.clearanceSummary === "Controller hold" && held.surveillanceAgeSeconds === 0, "track intent, clearance, or surveillance freshness was not derived from authoritative state");
assert(protectedTrack?.protectedRunway, "protected runway state did not survive the surface projection");
assert(snapshot.protectedRunwayOccupancy === 1, "protected runway occupancy is not derived from tracks");
assert(snapshot.heldTracks === 1, "surface holds are not derived from tracks");
assert(snapshot.advisories[0]?.kind === "runway-occupancy", "runway forecast was not projected as a surface advisory");
assert(snapshot.advisories[0]?.schemaVersion === 1 && snapshot.advisories[0]?.geometry.kind === "runway" && snapshot.advisories[0].geometry.points.length === 2, "runway advisory did not carry shared geometry");
assert(snapshot.advisories.some((advisory) => advisory.kind === "runway-crossing" && advisory.geometry.kind === "corridor" && advisory.geometry.points.length === 2), "crossing advisory did not carry its authoritative hold corridor");
assert(snapshot.vehicles.length === 1, "active service vehicle was not projected");
assert(snapshot.vehicles[0]?.state === "held" && snapshot.vehicles[0].groundspeedKts === 8, "service vehicle state or speed changed in the surface projection");
const arrivalCorridor = snapshot.protectionCorridors.find(
  (corridor) => corridor.operation === "arrival",
);
const arrivalFlight = simulation.state.flights.find(
  (flight) => flight.id === arrivalCorridor?.flightId,
);
assert(
  arrivalCorridor?.schemaVersion === 1 &&
    arrivalFlight &&
    arrivalCorridor.points.length >= 2 &&
    arrivalCorridor.points.length <= 18 &&
    arrivalCorridor.points[0][0] === arrivalFlight.motion.x &&
    arrivalCorridor.points[0][1] === arrivalFlight.motion.y &&
    arrivalCorridor.points.every((point) => point.every(Number.isFinite)),
  "arrival protection corridor diverged from authoritative flight motion",
);
assert(surfaceSafetyTracksForFilter(snapshot, "tower").some((track) => track.id === second.id), "tower view omitted protected runway traffic");
assert(surfaceSafetyTracksForFilter(snapshot, "ground").every((track) => track.state !== "parked"), "ground view included a parked flight");
assert(surfaceSafetyTracksForFilter(snapshot, "ramp").every((track) => track.state === "parked" || track.location.startsWith("Ramp") || track.location.startsWith("Apron")), "ramp view included a movement-area flight");
assert(surfaceSafetyTracksForFilter(snapshot, "supervisor").every((track) => track.state !== "parked" || track.protectedRunway || track.state === "safety-hold"), "supervisor view included an ordinary parked stand");
assert(surfaceSafetyTracksForFilter(snapshot, "watch").every((track) => track.state === "taxiing" || track.state === "protected-runway"), "Watch view exposed stationary controller detail");
assert(surfaceSafetyVehiclesForFilter(snapshot, "tower").some((vehicle) => vehicle.id === "safety-test-fuel"), "tower view omitted a held safety vehicle");
assert(surfaceSafetyVehiclesForFilter(snapshot, "ramp").some((vehicle) => vehicle.id === "safety-test-fuel"), "ramp view omitted its non-protected service vehicle");
assert(surfaceSafetyVehiclesForFilter(snapshot, "supervisor").some((vehicle) => vehicle.id === "safety-test-fuel"), "supervisor view omitted active service traffic");
assert(surfaceSafetyCorridorsForFilter(snapshot, "tower").length === snapshot.protectionCorridors.length, "tower view omitted runway protection corridors");
assert(surfaceSafetyCorridorsForFilter(snapshot, "supervisor").length === snapshot.protectionCorridors.length, "supervisor view omitted runway protection corridors");
assert(surfaceSafetyCorridorsForFilter(snapshot, "ground").length === 0 && surfaceSafetyCorridorsForFilter(snapshot, "ramp").length === 0, "surface-only station view included airborne protection corridors");
const runwayForecastAdvisories = snapshot.advisories.filter(
  (advisory) => advisory.kind === "runway-occupancy",
);
const forecastTargets = surfaceSafetyLookaheadTargets(snapshot.tracks, runwayForecastAdvisories, 10);
assert(forecastTargets.length === 2 && forecastTargets.every((target) => target.severity === "advisory" && target.etaSeconds === 8), "look-ahead projection omitted the authoritative runway forecast");
assert(surfaceSafetyLookaheadTargets(snapshot.tracks, runwayForecastAdvisories, 7).length === 0, "look-ahead projection ignored its configured horizon");
const acknowledgements = new SurfaceSafetyAcknowledgements();
const acknowledged = acknowledgements.acknowledge(snapshot, snapshot.advisories[0].id, 3);
assert(acknowledged.accepted, "noncritical active advisory was not acknowledgeable");
const acknowledgedSnapshot = acknowledgements.apply(snapshot);
assert(acknowledgedSnapshot.advisories[0].acknowledgedAtSeconds === 3, "acknowledgement did not appear in the display projection");
assert(acknowledgedSnapshot.protectedRunwayOccupancy === snapshot.protectedRunwayOccupancy && acknowledgedSnapshot.heldTracks === snapshot.heldTracks, "acknowledgement changed physical safety state");

const protection = runwayProtectionStatuses(simulation.state, config.runways.length);
const protectedRunway = protection[first.runway];
assert(protectedRunway?.occupiedFlightIds.includes(second.id), "runway protection did not retain authoritative runway occupancy");
assert(protectedRunway?.entranceProtected, "runway entrance lights were not protected by occupied pavement");
assert(protectedRunway?.takeoffHoldFlightIds.includes(first.id) && protectedRunway.takeoffProtected, "takeoff-hold lights were not protected by an uncleared departure");

const approachFlight = simulation.state.flights[2];
const assignedRunway = config.runways[first.runway];
const alternateRunway = config.runways.find((runway) => runway.id !== assignedRunway.id && Math.abs(Math.sin(runway.heading - assignedRunway.heading)) > 0.25);
assert(approachFlight && alternateRunway, "ORD needs a non-parallel alternate runway for wrong-surface validation");
const alternateEnd = alternateRunway.landingEnd;
const alternateThreshold = runwayEndPoint(alternateRunway, alternateEnd);
const alternateDirection = runwayTravelDirection(alternateRunway, alternateEnd);
approachFlight.phase = "approach";
approachFlight.runway = assignedRunway.id;
approachFlight.operatingEnd = assignedRunway.landingEnd;
approachFlight.motion.onGround = false;
approachFlight.motion.protectedRunway = false;
approachFlight.motion.protectedRunwayIds = [];
approachFlight.motion.x = alternateThreshold.x - alternateDirection.x * 18;
approachFlight.motion.y = alternateThreshold.y - alternateDirection.y * 18;
approachFlight.motion.z = 7;
approachFlight.motion.heading = Math.atan2(alternateDirection.y, alternateDirection.x);
const wrongSurface = wrongSurfaceApproachAdvisories(config, simulation.state);
assert(wrongSurface.some((advisory) => advisory.flightIds.includes(approachFlight.id) && advisory.kind === "wrong-surface" && advisory.detail.includes("off assigned")), "wrong-runway short final did not create an explainable warning");
approachFlight.runway = alternateRunway.id;
approachFlight.operatingEnd = alternateEnd;
assert(!wrongSurfaceApproachAdvisories(config, simulation.state).some((advisory) => advisory.flightIds.includes(approachFlight.id)), "aligned assigned approach produced a wrong-surface warning");

const tracker = new SurfaceSafetyAdvisoryTracker(10);
const trackedActive = tracker.update(snapshot);
const activeAdvisory = trackedActive.advisories.find((advisory) => advisory.kind === "runway-occupancy");
assert(activeAdvisory?.status === "active" && activeAdvisory.causalTrackIds.join(",") === "aircraft:" + first.id + ",aircraft:" + second.id, "advisory did not retain causal track identity");
simulation.state.elapsed = 5;
const resolved = tracker.update(surfaceSafetySnapshot(config, simulation.state, [], { collisionAlerts: 0, runwayIncursions: 0 }));
assert(resolved.advisories.some((advisory) => advisory.id === activeAdvisory?.id && advisory.status === "resolved" && advisory.resolvedAtSeconds === 5), "cleared advisory did not remain visible as resolved");
simulation.state.elapsed = 6;
const reactivated = tracker.update(surfaceSafetySnapshot(config, simulation.state, predictions, { collisionAlerts: 0, runwayIncursions: 0 }));
assert(reactivated.advisories.some((advisory) => advisory.id === activeAdvisory?.id && advisory.status === "active" && advisory.resolvedAtSeconds === undefined), "recurring advisory retained stale resolved state");
simulation.state.elapsed = 7;
tracker.update(surfaceSafetySnapshot(config, simulation.state, [], { collisionAlerts: 0, runwayIncursions: 0 }));
simulation.state.elapsed = 18;
const expired = tracker.update(surfaceSafetySnapshot(config, simulation.state, [], { collisionAlerts: 0, runwayIncursions: 0 }));
assert(!expired.advisories.some((advisory) => advisory.id === activeAdvisory?.id), "resolved advisory was not removed after bounded retention");

const incident = surfaceSafetySnapshot(config, simulation.state, [], {
  collisionAlerts: 1,
  runwayIncursions: 2,
});
assert(incident.advisories[0]?.severity === "critical", "physical collision alerts must remain critical");
assert(incident.advisories.some((advisory) => advisory.kind === "runway-incursion"), "runway incursion history must be visible to the surface picture");
assert(!acknowledgements.acknowledge(incident, incident.advisories[0].id, 4).accepted, "critical safety advisory was incorrectly acknowledgeable");
const announcements = new SurfaceSafetyAnnouncementTracker();
const firstAnnouncement = announcements.select(incident);
assert(firstAnnouncement.length === 1 && firstAnnouncement[0].priority === "critical" && firstAnnouncement[0].key.startsWith("surface-safety:"), "a new critical advisory did not create one stable status-broker announcement");
assert(announcements.select(incident).length === 0, "an unchanged advisory was announced repeatedly");
announcements.select({ ...incident, advisories: [] });
assert(announcements.select(incident).length === 1, "a resolved and recurring advisory was not eligible for a new announcement");

console.log(JSON.stringify({
  tracks: snapshot.tracks.length,
  advisories: incident.advisories.length,
  liveCrossingSamples: liveCrossingSamples.length,
  liveCrossingDistance: Number(liveCrossingDistance.toFixed(3)),
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "surface-safety-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Surface-safety validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

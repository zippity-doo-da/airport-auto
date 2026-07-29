import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from "./src/simulation/airportConfig.ts";
import { AirportSimulation } from "./src/simulation/airportSimulation.ts";
import { SurfaceSafetyAdvisoryTracker, surfaceSafetySnapshot, wrongSurfaceApproachAdvisories } from "./src/simulation/surfaceSafety.ts";
import { surfaceSafetyLookaheadTargets, surfaceSafetyTracksForFilter, surfaceSafetyVehiclesForFilter } from "./src/ui/surfaceSafetyPanel.ts";
import { runwayProtectionStatuses } from "./src/simulation/runwayProtection.ts";
import { runwayEndPoint, runwayTravelDirection } from "./src/simulation/runwayGeometry.ts";
import { SurfaceSafetyAcknowledgements } from "./src/simulation/surfaceSafetyAcknowledgements.ts";
import { SurfaceSafetyAnnouncementTracker } from "./src/presentation/surfaceSafetyAnnouncements.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ordIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === "ORD");
const config = generateHubConfig(ordIndex);
const simulation = new AirportSimulation(config);
const [first, second] = simulation.state.flights;
assert(first && second, "ORD needs an initial departure bank for surface-safety validation");

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
}];
const snapshot = surfaceSafetySnapshot(config, simulation.state, predictions, {
  collisionAlerts: 0,
  runwayIncursions: 0,
});

assert(snapshot.schemaVersion === 2, "surface snapshot version changed unexpectedly");
assert(snapshot.tracks.length >= 2, "surface snapshot omitted the known moving aircraft");
assert(snapshot.tracks.every((track) => Number.isFinite(track.x) && Number.isFinite(track.y)), "surface snapshot emitted an invalid authoritative pose");
assert(snapshot.tracks.every((track) => track.schemaVersion === 1), "surface tracks were not individually versioned");
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
assert(snapshot.vehicles.length === 1, "active service vehicle was not projected");
assert(snapshot.vehicles[0]?.state === "held" && snapshot.vehicles[0].groundspeedKts === 8, "service vehicle state or speed changed in the surface projection");
assert(surfaceSafetyTracksForFilter(snapshot, "tower").some((track) => track.id === second.id), "tower view omitted protected runway traffic");
assert(surfaceSafetyTracksForFilter(snapshot, "ground").every((track) => track.state !== "parked"), "ground view included a parked flight");
assert(surfaceSafetyTracksForFilter(snapshot, "ramp").every((track) => track.state === "parked" || track.location.startsWith("Ramp") || track.location.startsWith("Apron")), "ramp view included a movement-area flight");
assert(surfaceSafetyTracksForFilter(snapshot, "supervisor").every((track) => track.state !== "parked" || track.protectedRunway || track.state === "safety-hold"), "supervisor view included an ordinary parked stand");
assert(surfaceSafetyTracksForFilter(snapshot, "watch").every((track) => track.state === "taxiing" || track.state === "protected-runway"), "Watch view exposed stationary controller detail");
assert(surfaceSafetyVehiclesForFilter(snapshot, "tower").some((vehicle) => vehicle.id === "safety-test-fuel"), "tower view omitted a held safety vehicle");
assert(surfaceSafetyVehiclesForFilter(snapshot, "ramp").some((vehicle) => vehicle.id === "safety-test-fuel"), "ramp view omitted its non-protected service vehicle");
assert(surfaceSafetyVehiclesForFilter(snapshot, "supervisor").some((vehicle) => vehicle.id === "safety-test-fuel"), "supervisor view omitted active service traffic");
const forecastTargets = surfaceSafetyLookaheadTargets(snapshot.tracks, snapshot.advisories, 10);
assert(forecastTargets.length === 2 && forecastTargets.every((target) => target.severity === "advisory" && target.etaSeconds === 8), "look-ahead projection omitted the authoritative runway forecast");
assert(surfaceSafetyLookaheadTargets(snapshot.tracks, snapshot.advisories, 7).length === 0, "look-ahead projection ignored its configured horizon");
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
simulation.state.elapsed = 16;
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

console.log(JSON.stringify({ tracks: snapshot.tracks.length, advisories: incident.advisories.length }));
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

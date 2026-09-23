import { build } from "esbuild";

const validationSource = `
import { createHubSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import {
  surfaceIncidentDefinition,
  surfaceIncidentKinds,
} from './src/simulation/surfaceIncidentProgram.ts';
import { runwayClosedByDisruption } from './src/simulation/surfaceDisruptions.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const kind of surfaceIncidentKinds()) {
  const incident = surfaceIncidentDefinition(kind);
  assert(incident && incident.durationSeconds >= 60 && incident.durationSeconds <= 240,
    kind + ': incident duration is outside the modeled response budget');
  assert(incident.responseTravelSeconds >= 8 && incident.responseTravelSeconds <= 24,
    kind + ': response travel time is outside the local-response budget');
  assert(incident.responseVehicleLabel.length > 4,
    kind + ': response vehicle identity is missing');
}
assert(surfaceIncidentDefinition('unknown') === null, 'unknown incident was accepted');
const snowRemoval = surfaceIncidentDefinition('snow-removal');
assert(snowRemoval?.targetKind === 'runway' && snowRemoval.durationSeconds === 210,
  'snow-removal program did not preserve its runway-sweep definition');
assert(snowRemoval.responseVehicleLabel === 'Snow-removal unit',
  'snow-removal program has no distinct response identity');
assert(snowRemoval.responseVehicleType === 'snowplow',
  'snow-removal program has no distinct response vehicle');
assert(surfaceIncidentDefinition('bird-activity')?.responseVehicleType === 'wildlife-response',
  'bird response has no distinct response vehicle');

const harness = createHubSimulationHarness('ORD', { stepSeconds: 0.1, mode: 'auto' });
const simulation = harness.simulation;
simulation.setStation('ground');
assert(!simulation.triggerSurfaceIncident('runway-inspection', '0'),
  'Ground station started a supervisor-only incident');
assert(simulation.lastCommandReason().includes('cannot declare'),
  'incident authority rejection is not explainable');
simulation.setStation('supervisor');

let incident = null;
for (const runway of harness.config.runways) {
  if (simulation.triggerSurfaceIncident('runway-inspection', String(runway.id))) {
    incident = simulation.state.surfaceDisruptions.at(-1);
    break;
  }
}
assert(incident, 'no runway retained capacity for a runway-inspection scenario');
assert(incident.incidentKind === 'runway-inspection', 'incident identity was lost from state');
assert(incident.source === 'incident', 'incident did not preserve its source');
assert(incident.label.includes('Runway inspection'), 'incident label does not explain the operation');
assert(incident.durationSeconds === 150, 'runway inspection did not retain its modeled duration');
assert(incident.responsePhase === 'en-route', 'incident did not begin with an explicit response dispatch');
assert(incident.responseVehicleLabel === 'Airfield operations unit', 'incident response unit was not persisted');
const responseVehicle = simulation.state.serviceVehicles.find((vehicle) => vehicle.incidentResponseId === incident.id);
assert(responseVehicle, 'incident dispatch did not create an authoritative response vehicle');
assert(responseVehicle.type === 'maintenance-van', 'runway inspection did not use the expected airfield response vehicle type');
assert(responseVehicle.outboundRouteEdges.length > 0, 'response vehicle has no graph route');
assert(responseVehicle.protectedMovementAuthorized, 'incident response vehicle lacks explicit closure-bound movement authority');
assert(!simulation.clearSurfaceDisruption(incident.id), 'Supervisor reopened the runway before the inspection was complete');
assert(simulation.lastCommandReason().includes('cannot reopen'), 'early incident reopening was not explained');

for (let tick = 0; tick < 1900; tick += 1) {
  harness.advanceTicks(1);
  const diagnostics = simulation.diagnostics();
  assert(diagnostics.collisions.length === 0, 'surface incident produced an aircraft collision');
  assert(diagnostics.obstacleCollisions.length === 0, 'surface incident produced an obstacle overlap');
  const incidentVehicleConflicts = diagnostics.serviceVehicleConflicts.filter((conflict) =>
    conflict.vehicle === responseVehicle.id || conflict.vehicle === responseVehicle.callsign,
  );
  assert(incidentVehicleConflicts.length === 0, 'response vehicle produced a surface collision: ' + JSON.stringify(incidentVehicleConflicts[0]));
  assert(diagnostics.serviceVehicleRouteViolations.length === 0, 'response vehicle used unauthorized protected pavement');
}
const completedIncident = simulation.state.surfaceDisruptions.find((item) => item.id === incident.id);
assert(completedIncident?.responsePhase === 'ready-to-reopen',
  'incident inspection did not reach explicit Supervisor release readiness');
assert(completedIncident.recoveryProgress === 1,
  'completed incident did not expose complete response progress');
assert(simulation.state.serviceVehicles.some((vehicle) => vehicle.incidentResponseId === incident.id && vehicle.status === 'servicing'),
  'response vehicle was not retained on scene through inspection completion');
assert(simulation.clearSurfaceDisruption(incident.id),
  'Supervisor could not reopen an inspection-complete runway: ' + simulation.lastCommandReason());
assert(simulation.state.surfaceDisruptions.find((item) => item.id === incident.id)?.responsePhase === 'returning',
  'incident did not hold protection while its response vehicle returned');
harness.advanceTicks(1);
const returnEvent = harness.snapshot().events.find((event) =>
  event.type === 'incident-response-return' && event.surfaceDisruptionId === incident.id,
);
assert(returnEvent?.flightId === undefined,
  'surface return event invented an aircraft identity');
assert(returnEvent?.serviceVehicleId === responseVehicle.id,
  'surface return event did not identify the physical response unit');
assert(returnEvent?.domainEventId,
  'surface return event has no durable domain identity');
for (let tick = 0; tick < 1_200 && simulation.state.surfaceDisruptions.some((item) => item.id === incident.id); tick += 1) {
  harness.advanceTicks(1);
  const diagnostics = simulation.diagnostics();
  assert(diagnostics.collisions.length === 0, 'incident return produced an aircraft collision');
  assert(diagnostics.serviceVehicleRouteViolations.length === 0, 'incident return used unauthorized pavement');
}
assert(!simulation.state.surfaceDisruptions.some((item) => item.id === incident.id),
  'movement area did not reopen after the response vehicle returned');
assert(!simulation.state.serviceVehicles.some((vehicle) => vehicle.incidentResponseId === incident.id),
  'response vehicle was retained after its return route completed');
assert(!runwayClosedByDisruption(simulation.state.surfaceDisruptions, incident.runwayId),
  'reopened incident left the runway unavailable');
const incidentEvents = harness.snapshot().events.filter((event) =>
  event.surfaceDisruptionId === incident.id,
);
const returnIndex = incidentEvents.findIndex((event) => event.type === 'incident-response-return');
const clearIndex = incidentEvents.findIndex((event) => event.type === 'incident-response-clear');
assert(returnIndex >= 0 && clearIndex > returnIndex,
  'surface incident audit trail did not record return before physical pavement release');
assert(incidentEvents[clearIndex].flightId === undefined,
  'surface clear event invented an aircraft identity');
assert(incidentEvents[clearIndex].domainEventId,
  'surface clear event has no durable domain identity');

const expectedVehicleType = {
  'runway-inspection': 'maintenance-van',
  'bird-activity': 'wildlife-response',
  'foreign-object-debris': 'maintenance-van',
  'snow-removal': 'snowplow',
};
for (const kind of surfaceIncidentKinds()) {
  const programHarness = createHubSimulationHarness('ORD', { stepSeconds: 0.1, mode: 'auto' });
  const program = programHarness.simulation;
  program.setStation('supervisor');
  const definition = surfaceIncidentDefinition(kind);
  const targets = definition.targetKind === 'runway'
    ? programHarness.config.runways.map((runway) => String(runway.id))
    : programHarness.config.surfaceGraph.taxiways.map((taxiway) => taxiway.id);
  const targetId = targets.find((candidate) => program.triggerSurfaceIncident(kind, candidate));
  assert(targetId, kind + ': no compatible incident target retained capacity');
  const active = program.state.surfaceDisruptions.at(-1);
  assert(active?.incidentKind === kind, kind + ': incident identity was lost');
  // Definition validation above retains every real modeled inspection duration.
  // This fixture only compresses on-scene work so each program's identical
  // routing, authority, reopen, and cleanup path can remain a focused test.
  active.responseInspectionDurationSeconds = 1;
  const vehicle = program.state.serviceVehicles.find((candidate) => candidate.incidentResponseId === active.id);
  assert(vehicle?.type === expectedVehicleType[kind], kind + ': response vehicle type is wrong');
  const completedOperationsBefore = program.state.arrivals + program.state.departures;
  for (let tick = 0; tick < 1_200; tick += 1) {
    programHarness.advanceTicks(1);
    const diagnostics = program.diagnostics();
    assert(diagnostics.collisions.length === 0, kind + ': aircraft collision during recovery');
    assert(diagnostics.obstacleCollisions.length === 0, kind + ': obstacle overlap during recovery');
    assert(diagnostics.serviceVehicleRouteViolations.length === 0, kind + ': response route violated pavement authority');
  }
  const completed = program.state.surfaceDisruptions.find((candidate) => candidate.id === active.id);
  assert(completed?.responsePhase === 'ready-to-reopen', kind + ': did not reach explicit reopening readiness');
  assert(program.clearSurfaceDisruption(active.id), kind + ': Supervisor could not reopen completed incident');
  assert(program.state.surfaceDisruptions.find((candidate) => candidate.id === active.id)?.responsePhase === 'returning', kind + ': protection did not remain active during return');
  for (let tick = 0; tick < 1_200 && program.state.surfaceDisruptions.some((candidate) => candidate.id === active.id); tick += 1) {
    programHarness.advanceTicks(1);
    const diagnostics = program.diagnostics();
    assert(diagnostics.collisions.length === 0, kind + ': aircraft collision during return');
    assert(diagnostics.serviceVehicleRouteViolations.length === 0, kind + ': response return route violated pavement authority');
  }
  assert(!program.state.surfaceDisruptions.some((candidate) => candidate.id === active.id), kind + ': movement area was not reopened after return');
  assert(!program.state.serviceVehicles.some((candidate) => candidate.incidentResponseId === active.id), kind + ': response vehicle was retained after its return');
  // Recovery is not complete if traffic only looks clear immediately after the
  // response unit disappears. Keep the original seeded session running and
  // require a normal arrival or departure after the protected pavement opens.
  for (let tick = 0; tick < 1_800 && program.state.arrivals + program.state.departures === completedOperationsBefore; tick += 1) {
    programHarness.advanceTicks(1);
    const diagnostics = program.diagnostics();
    assert(diagnostics.collisions.length === 0, kind + ': aircraft collision after reopening');
    assert(diagnostics.serviceVehicleRouteViolations.length === 0, kind + ': route violation after reopening');
  }
  assert(program.state.arrivals + program.state.departures > completedOperationsBefore,
    kind + ': traffic did not resume after the response unit cleared');
}

console.log(JSON.stringify({
  incidentKinds: surfaceIncidentKinds(),
  authorityChecks: 3 + surfaceIncidentKinds().length,
  lifecycle: ['en-route', 'inspecting', 'ready-to-reopen', 'returning', 'reopened'],
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "surface-incident-program-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});
const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Surface incident validation bundle was empty.");
try {
  await import(
    "data:text/javascript;base64," + Buffer.from(bundled).toString("base64")
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

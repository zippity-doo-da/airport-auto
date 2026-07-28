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
  assert(incident && incident.durationSeconds >= 60 && incident.durationSeconds <= 180,
    kind + ': incident duration is outside the calm, short-inspection budget');
  assert(incident.responseTravelSeconds >= 8 && incident.responseTravelSeconds <= 24,
    kind + ': response travel time is outside the local-response budget');
  assert(incident.responseVehicleLabel.length > 4,
    kind + ': response vehicle identity is missing');
}
assert(surfaceIncidentDefinition('unknown') === null, 'unknown incident was accepted');

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
assert(responseVehicle.type === 'maintenance-van', 'incident did not use the expected airfield response vehicle type');
assert(responseVehicle.outboundRouteEdges.length > 0, 'response vehicle has no graph route');
assert(responseVehicle.protectedMovementAuthorized, 'incident response vehicle lacks explicit closure-bound movement authority');
assert(!simulation.clearSurfaceDisruption(incident.id), 'Supervisor reopened the runway before the inspection was complete');
assert(simulation.lastCommandReason().includes('cannot reopen'), 'early incident reopening was not explained');

for (let tick = 0; tick < 1900; tick += 1) {
  harness.advanceTicks(1);
  const diagnostics = simulation.diagnostics();
  assert(diagnostics.collisions.length === 0, 'surface incident produced an aircraft collision');
  assert(diagnostics.obstacleCollisions.length === 0, 'surface incident produced an obstacle overlap');
  assert(diagnostics.serviceVehicleConflicts.length === 0, 'response vehicle produced a surface collision');
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
assert(!simulation.state.serviceVehicles.some((vehicle) => vehicle.incidentResponseId === incident.id),
  'response vehicle was not released when the incident closed');
assert(!runwayClosedByDisruption(simulation.state.surfaceDisruptions, incident.runwayId),
  'reopened incident left the runway unavailable');

console.log(JSON.stringify({
  incidentKinds: surfaceIncidentKinds(),
  authorityChecks: 3,
  lifecycle: ['en-route', 'inspecting', 'ready-to-reopen', 'reopened'],
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

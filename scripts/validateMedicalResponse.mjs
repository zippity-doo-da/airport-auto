import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { findServiceVehicleConflicts, serviceVehicleRouteViolations, serviceVehiclesBlockingPushback } from './src/simulation/serviceVehicleOperations.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const atlIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ATL');
assert(atlIndex >= 0, 'ATL is required for medical-response validation');
const config = generateHubConfig(atlIndex, 19001);
const simulation = new AirportSimulation(config, 'quiet');
simulation.setMode('manual');
simulation.setStation('supervisor');
simulation.setPaused(false);
const flight = simulation.state.flights.find((candidate) => candidate.phase === 'approach');
assert(flight, 'medical-response validation needs an inbound aircraft');
simulation.state.flights = [flight];
simulation.state.serviceVehicles = [];
simulation.drainEvents();

assert(simulation.triggerEmergency(flight.id, 'medical'), 'medical priority was rejected: ' + simulation.lastCommandReason());
const ambulance = simulation.state.serviceVehicles.find((vehicle) => vehicle.flightId === flight.id && vehicle.emergencyResponseKind === 'medical');
assert(ambulance?.type === 'ambulance', 'medical priority did not create a distinct ambulance entity');
assert(ambulance.standId === flight.standId, 'ambulance was not routed to the assigned stand');
assert(ambulance.emergencyServiceDurationSeconds === 45, 'medical transfer duration is not deterministic');
assert(serviceVehicleRouteViolations(config.surfaceGraph, [ambulance]).length === 0, 'ambulance route entered protected runway pavement without authority');

simulation.setMode('auto');
let landedBeforeResolution = false;
let ordinaryServiceReleasedAfterTransfer = false;
let ordinaryServiceReachedStandAfterTransfer = false;
let pushbackProtected = false;
let maximumConflicts = 0;
const statuses = new Set();
for (let tick = 0; tick < 60_000; tick += 1) {
  simulation.update(0.05);
  const currentAmbulance = simulation.state.serviceVehicles.find((vehicle) => vehicle.id === ambulance.id);
  if (currentAmbulance) {
    statuses.add(currentAmbulance.status);
    assert(!currentAmbulance.protectedMovementArea, 'ambulance entered protected runway pavement');
  }
  if (flight.phase === 'taxi-in' || flight.phase === 'resting') {
    landedBeforeResolution = landedBeforeResolution || flight.emergency === 'medical';
    if (flight.emergency === 'medical')
      assert(simulation.shiftMetrics().emergencyResolutions === 0, 'medical priority resolved at touchdown instead of after responder service');
  }
  const ordinaryVehicles = simulation.state.serviceVehicles.filter(
    (vehicle) => vehicle.flightId === flight.id && !vehicle.emergencyResponseKind,
  );
  if (flight.emergency === 'medical')
    assert(
      ordinaryVehicles.length === 0,
      'ordinary turnaround equipment entered the stand lane before medical transfer completed',
    );
  if (flight.emergency === undefined && ordinaryVehicles.length > 0) {
    ordinaryServiceReleasedAfterTransfer = true;
    ordinaryServiceReachedStandAfterTransfer = ordinaryServiceReachedStandAfterTransfer || ordinaryVehicles.some(
      (vehicle) => ['approaching', 'servicing', 'clearing'].includes(vehicle.status),
    );
  }
  pushbackProtected = pushbackProtected || serviceVehiclesBlockingPushback(simulation.state.serviceVehicles, flight.id).some((vehicle) => vehicle.id === ambulance.id);
  const conflicts = findServiceVehicleConflicts(config, simulation.state.serviceVehicles, simulation.state.flights);
  maximumConflicts = Math.max(maximumConflicts, conflicts.length);
  // Observe the first clearing tick as well as the resolution event. The
  // emergency is deliberately cleared when patient transfer completes, one
  // fixed step before the ambulance begins its physical return to staging.
  if (
    flight.emergency === undefined &&
    simulation.shiftMetrics().emergencyResolutions === 1 &&
    statuses.has('clearing')
  )
    break;
}

assert(landedBeforeResolution, 'medical priority did not remain active through landing and taxi-in');
assert(
  ordinaryServiceReleasedAfterTransfer,
  'ordinary turnaround equipment was not released after medical transfer: ' +
    JSON.stringify({
      phase: flight.phase,
      turnaround: flight.turnaround.tasks.map((task) => ({ type: task.type, required: task.required, status: task.status })),
      vehicles: simulation.state.serviceVehicles.map((vehicle) => ({ id: vehicle.id, emergency: vehicle.emergencyResponseKind, status: vehicle.status })),
    }),
);
assert(pushbackProtected, 'ambulance did not inhibit pushback while occupying the stand lane');
const finalAmbulance = simulation.state.serviceVehicles.find((vehicle) => vehicle.id === ambulance.id);
assert(['dispatching', 'staged', 'approaching', 'servicing', 'clearing'].every((status) => statuses.has(status)), 'medical responder skipped an authoritative movement/service phase: ' + [...statuses].join(', ') + '; final phase=' + flight.phase + '; ambulance=' + (finalAmbulance?.status ?? 'removed') + '; held=' + (finalAmbulance?.held ?? false) + '; hold=' + (finalAmbulance?.holdReason ?? 'none') + '; elapsed=' + simulation.state.elapsed.toFixed(1));
assert(flight.emergency === undefined, 'medical priority did not clear after patient transfer');
assert(simulation.shiftMetrics().emergencyResolutions === 1, 'medical response did not increment resolution exactly once');
assert(maximumConflicts === 0, 'medical response produced a vehicle or aircraft collision');

for (let tick = 0; tick < 2_000 && simulation.state.serviceVehicles.some((vehicle) => vehicle.id === ambulance.id); tick += 1) {
  simulation.update(0.05);
  const ordinaryVehicles = simulation.state.serviceVehicles.filter(
    (vehicle) => vehicle.flightId === flight.id && !vehicle.emergencyResponseKind,
  );
  ordinaryServiceReleasedAfterTransfer = ordinaryServiceReleasedAfterTransfer || ordinaryVehicles.length > 0;
  ordinaryServiceReachedStandAfterTransfer = ordinaryServiceReachedStandAfterTransfer || ordinaryVehicles.some(
    (vehicle) => ['approaching', 'servicing', 'clearing'].includes(vehicle.status),
  );
}
assert(!simulation.state.serviceVehicles.some((vehicle) => vehicle.id === ambulance.id), 'ambulance did not clear the stand after transfer');
assert(ordinaryServiceReleasedAfterTransfer, 'ordinary turnaround equipment was not released after ambulance clearance');
for (
  let tick = 0;
  tick < 4_000 && !ordinaryServiceReachedStandAfterTransfer;
  tick += 1
) {
  simulation.update(0.05);
  const ordinaryVehicles = simulation.state.serviceVehicles.filter(
    (vehicle) => vehicle.flightId === flight.id && !vehicle.emergencyResponseKind,
  );
  ordinaryServiceReachedStandAfterTransfer = ordinaryVehicles.some(
    (vehicle) => ['approaching', 'servicing', 'clearing'].includes(vehicle.status),
  );
}
assert(ordinaryServiceReachedStandAfterTransfer, 'ordinary turnaround equipment did not resume physical gate service');
const eventTypes = simulation.drainEvents().map((event) => event.type);
for (const type of ['emergency', 'medical-response-dispatch', 'medical-response-arrive', 'medical-response-complete'])
  assert(eventTypes.includes(type), 'medical response omitted ' + type + ' replay evidence');

const departure = simulation.state.flights.find((candidate) => candidate.flightPlan.direction === 'departure');
if (departure)
  assert(!simulation.triggerEmergency(departure.id, 'medical'), 'outbound aircraft received the inbound medical-gate playbook');

console.log(JSON.stringify({
  airport: 'ATL',
  flight: flight.callsign,
  stand: ambulance.standId,
  statuses: [...statuses],
  events: eventTypes.filter((type) => type === 'emergency' || type.startsWith('medical-response-')),
  maximumConflicts,
  emergencyResolutions: simulation.shiftMetrics().emergencyResolutions,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "medical-response-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Medical-response validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

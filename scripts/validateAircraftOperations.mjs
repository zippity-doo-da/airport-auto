import { build } from "esbuild";

const validationSource = `
import { createAircraftOperationalDetail } from './src/simulation/aircraftOperations.ts';
import { advanceTurnaround, createTurnaroundPlan, startTurnaround } from './src/simulation/turnaroundOperations.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function request(flightId, aircraft = 'A320', service = 'passenger', trafficClass = 'passenger') {
  return {
    flightId,
    airportSeed: 8_741,
    aircraft,
    service,
    trafficClass,
    origin: 'ORD',
    destination: 'LAX',
  };
}

function findDetail(predicate, aircraft = 'A320', service = 'passenger', trafficClass = 'passenger') {
  for (let flightId = 1; flightId <= 4_000; flightId += 1) {
    const detail = createAircraftOperationalDetail(request(flightId, aircraft, service, trafficClass));
    if (predicate(detail)) return { flightId, detail };
  }
  return null;
}

const passenger = findDetail((detail) => detail.kind === 'scheduled-passenger');
const cargo = findDetail((detail) => detail.kind === 'scheduled-cargo', 'B77F', 'cargo', 'cargo');
const charter = findDetail((detail) => detail.kind === 'charter', 'C172', 'passenger', 'general-aviation');
const ferry = findDetail((detail) => detail.kind === 'ferry');
const special = findDetail((detail) => detail.kind === 'special-operation');
const transit = findDetail((detail) => detail.maintenanceClass === 'transit-inspection', 'B738');
const repair = findDetail((detail) => detail.maintenanceClass === 'out-of-service-repair', 'B738');
for (const [label, sample] of Object.entries({ passenger, cargo, charter, ferry, special, transit, repair })) {
  assert(sample, 'deterministic operation stream never produced ' + label);
}
assert(cargo.detail.cargoLoadType, 'scheduled cargo detail lacks a load type');
assert(special.detail.specialOperation, 'special operation lacks a specific mission');
assert(transit.detail.airworthinessStatus === 'maintenance-due', 'transit inspection is not reflected in airworthiness');
assert(repair.detail.airworthinessStatus === 'maintenance-due' && repair.detail.maintenanceReason, 'repair event lacks airworthiness reason');

const deterministicRequest = request(special.flightId);
const before = JSON.stringify(deterministicRequest);
const first = createAircraftOperationalDetail(deterministicRequest);
const second = createAircraftOperationalDetail(deterministicRequest);
assert(JSON.stringify(first) === JSON.stringify(second), 'operation detail is not deterministic');
assert(JSON.stringify(deterministicRequest) === before, 'operation detail mutated its request');

function maintenancePlan(sample) {
  return createTurnaroundPlan({
    flightId: sample.flightId,
    airportSeed: 8_741,
    aircraft: 'B738',
    service: 'passenger',
    fuelPercent: 18,
    targetFuelPercent: 45,
    scope: 'center',
    scheduledGateInSeconds: 100,
    operationalDetail: sample.detail,
  });
}
const transitPlan = maintenancePlan(transit);
const repairPlan = maintenancePlan(repair);
const transitTask = transitPlan.tasks.find((task) => task.type === 'maintenance');
const repairTask = repairPlan.tasks.find((task) => task.type === 'maintenance');
assert(transitTask.required && repairTask.required, 'maintenance detail did not create required service tasks');
assert(repairTask.durationSeconds > transitTask.durationSeconds, 'out-of-service repair is not deeper than a transit inspection');
assert(repairTask.reason === repair.detail.maintenanceReason, 'repair reason was lost at turnaround planning');
const start = startTurnaround(repairPlan, 100, 18);
assert(start.some((transition) => transition.type === 'service-start' && transition.service === 'maintenance'), 'repair did not enter active service');
const complete = advanceTurnaround(repairPlan, 100 + repairPlan.plannedDurationSeconds);
assert(repairTask.status === 'complete' && complete.some((transition) => transition.type === 'service-complete' && transition.service === 'maintenance'), 'repair did not complete through the service state machine');

console.log(JSON.stringify({
  kinds: [passenger.detail.kind, cargo.detail.kind, charter.detail.kind, ferry.detail.kind, special.detail.kind],
  maintenanceClasses: [transit.detail.maintenanceClass, repair.detail.maintenanceClass],
  repairReason: repair.detail.maintenanceReason,
  transitSeconds: transitTask.durationSeconds,
  repairSeconds: repairTask.durationSeconds,
  deterministic: true,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "aircraft-operations-validation.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});

const code = result.outputFiles[0].text;
try {
  await import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64")
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

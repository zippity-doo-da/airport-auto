import { build } from "esbuild";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import {
  OPERATIONS_EXPORT_DATASETS,
  OperationsAnalyticsRecorder,
  buildOperationsExportBundle,
  serializeOperationsCsv,
} from './src/telemetry/operationsAnalytics.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function descriptor(config) {
  return {
    code: config.code,
    name: config.name,
    scope: config.scope,
    runways: config.runways.map((runway) => ({
      id: runway.id,
      label: runway.designation?.join('/') ?? String(runway.id),
      center: [...runway.center],
      headingRadians: runway.heading,
      length: runway.length,
    })),
    bounds: { minX: -180, maxX: 180, minZ: -180, maxZ: 180 },
  };
}

const config = generateHubConfig(HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD'));
const simulation = new AirportSimulation(config, 'quiet');
const recorder = new OperationsAnalyticsRecorder('analytics-session', descriptor(config), simulation.shiftMetrics());
const first = simulation.state.flights[0];
const second = simulation.state.flights[1];
assert(first && second, 'analytics fixture requires two aircraft');

first.phase = 'landing';
first.motion.protectedRunway = true;
first.motion.onGround = false;
first.kinematics.altitudeFt = 720;
first.kinematics.airspeedKts = 138;
first.kinematics.fuelPercent = 14.5;
first.controlHold = false;
second.phase = 'taxi-out';
second.motion.onGround = true;
second.taxiway = 'Alpha';
second.controlHold = true;
second.kinematics.groundSpeedKts = 0;

for (let elapsed = 0; elapsed < 4; elapsed += 1) {
  simulation.state.elapsed = elapsed;
  first.motion.x = elapsed * 2;
  second.motion.x = elapsed * 2 + 1;
  const queues = simulation.queueSnapshot(simulation.state);
  const predictions = elapsed >= 1 ? [{
    severity: elapsed === 3 ? 'warning' : 'caution',
    type: 'separation',
    flights: [first.id, second.id],
    etaSeconds: 5,
    detail: 'fixture forecast',
  }] : [];
  assert(recorder.record({ state: simulation.state, predictions, queues, metrics: simulation.shiftMetrics() }), 'one-second sample was rejected');
  assert(!recorder.record({ state: simulation.state, predictions, queues, metrics: simulation.shiftMetrics() }), 'duplicate second was retained');
}

const queues = simulation.queueSnapshot(simulation.state);
const snapshot = recorder.snapshot(simulation.state, queues, first.id);
assert(snapshot.schemaVersion === 1 && snapshot.sessionId === 'analytics-session', 'analytics schema/session drifted');
assert(snapshot.flights.length >= 2 && snapshot.selectedFlightSamples.length === 4, 'flight recorder samples are incomplete');
assert(snapshot.selectedFlightSamples[0].altitudeFt === 720 && snapshot.selectedFlightSamples[0].fuelPercent === 14.5, 'authoritative kinematics were not retained');
assert(snapshot.runwayUtilization.some((entry) => entry.occupiedSeconds >= 4 && entry.movements >= 1), 'runway utilization was not accumulated');
assert(snapshot.taxiwayUtilization.some((entry) => entry.label === 'Alpha' && entry.visits === 1), 'taxiway utilization was not accumulated');
assert(snapshot.flights.find((entry) => entry.flightId === second.id)?.delaySeconds >= 4, 'flight delay was not accumulated');
assert(snapshot.conflictHeatmap.reduce((sum, cell) => sum + cell.count, 0) === 3, 'conflict heatmap did not retain forecasts');
assert(snapshot.disclosure.localOnly && !snapshot.disclosure.cloudUpload && !snapshot.disclosure.shareableByDefault, 'local/privacy disclosure drifted');

const commands = [{ action: 'holdPosition', flightId: second.id, actorId: 'fixture-controller' }];
const events = [{ type: 'command:holdPosition', flightId: second.id, accepted: true }];
const bundle = buildOperationsExportBundle(snapshot, recorder.allFlightSamples(), commands, events, queues);
assert(bundle.flightRecorder.length >= 8 && bundle.commands.length === 1 && bundle.events.length === 1, 'JSON bundle omitted a dataset');
for (const dataset of OPERATIONS_EXPORT_DATASETS) {
  const csv = serializeOperationsCsv(bundle, dataset, dataset === 'flight-recorder' ? first.id : undefined);
  assert(csv.includes('\\r\\n'), dataset + ' CSV did not contain a header terminator');
  assert(!csv.includes('[object Object]'), dataset + ' CSV did not serialize nested data');
}

recorder.reset('next-session', descriptor(config), simulation.shiftMetrics(), 20);
const reset = recorder.snapshot(simulation.state, queues, null);
assert(reset.sessionId === 'next-session' && reset.flights.length === 0 && reset.window.retainedSamples === 0, 'analytics reset retained prior-session data');

console.log(JSON.stringify({
  datasets: OPERATIONS_EXPORT_DATASETS.length,
  observedFlights: snapshot.flights.length,
  recorderSamples: bundle.flightRecorder.length,
  runwayRows: snapshot.runwayUtilization.length,
  taxiwayRows: snapshot.taxiwayUtilization.length,
  conflictCells: snapshot.conflictHeatmap.length,
  localOnly: snapshot.disclosure.localOnly,
}));
`;

const result = await build({
  stdin: {
    contents: validationSource,
    resolveDir: process.cwd(),
    sourcefile: "validate-operations-analytics.ts",
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const encoded = Buffer.from(result.outputFiles[0].text).toString("base64");
await import(`data:text/javascript;base64,${encoded}`);

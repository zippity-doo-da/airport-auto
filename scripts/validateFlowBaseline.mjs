import { build } from "esbuild";
import path from "node:path";

const sourceRootArgument = process.argv
  .find((argument) => argument.startsWith("--source-root="))
  ?.slice("--source-root=".length);
const sourceRoot = path.resolve(sourceRootArgument ?? process.cwd());
const reportOnly = process.argv.includes("--report-only");
const requestedObjective =
  process.argv
    .find((argument) => argument.startsWith("--objective="))
    ?.slice("--objective=".length) ?? "balanced";

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { aircraftProfile } from './src/simulation/aircraftProfiles.ts';

const STEP_SECONDS = 0.05;
const MODELED_SECONDS = 1_800;
const STOP_THRESHOLD_KTS = 0.5;
const RESTART_THRESHOLD_KTS = 2;
const MINIMUM_STOP_SECONDS = 3;

const configuration = generateHubConfig(
  HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD'),
);
const simulation = new AirportSimulation(configuration, 'rush');
simulation.setMode('auto');
simulation.setPace(3);
simulation.setPaused(false);
if (typeof simulation.setTrafficFlowObjective === 'function') {
  simulation.setStation('supervisor');
  simulation.setTrafficFlowObjective(${JSON.stringify(requestedObjective)});
}

const taxiState = new Map();
let stopStartTaxiHolds = 0;
let taxiAircraftObserved = 0;
const previousFuelPercent = new Map();
const holdingFuelBurnByPhaseKg = {};
const holdingFuelBurnByReasonKg = {};

while (simulation.state.elapsed < MODELED_SECONDS) {
  simulation.update(STEP_SECONDS);

  const activeTaxiIds = new Set();
  for (const flight of simulation.state.flights) {
    const priorFuel = previousFuelPercent.get(flight.id);
    if (priorFuel !== undefined && priorFuel > flight.kinematics.fuelPercent) {
      const burnKg =
        ((priorFuel - flight.kinematics.fuelPercent) / 100) *
        aircraftProfile(flight.aircraft).usableFuelKg;
      if (
        flight.safetyHold ||
        flight.controlHold ||
        flight.automaticHold ||
        Boolean(flight.navigation.hold)
      ) {
        holdingFuelBurnByPhaseKg[flight.phase] =
          (holdingFuelBurnByPhaseKg[flight.phase] ?? 0) + burnKg;
        const reason = flight.controlHold
          ? 'controller hold'
          : flight.safetyHoldReason ??
            flight.automaticHoldReason ??
            (flight.navigation.hold ? 'airborne hold' : 'unspecified hold');
        holdingFuelBurnByReasonKg[reason] =
          (holdingFuelBurnByReasonKg[reason] ?? 0) + burnKg;
      }
    }
    previousFuelPercent.set(flight.id, flight.kinematics.fuelPercent);

    if (flight.phase !== 'taxi-in' && flight.phase !== 'taxi-out') continue;
    activeTaxiIds.add(flight.id);
    const speed = flight.kinematics.groundSpeedKts;
    let state = taxiState.get(flight.id);
    if (!state) {
      state = {
        hasMoved: speed >= RESTART_THRESHOLD_KTS,
        stoppedAtSeconds: null,
      };
      taxiState.set(flight.id, state);
      taxiAircraftObserved += 1;
    }

    if (speed >= RESTART_THRESHOLD_KTS) {
      if (
        state.stoppedAtSeconds !== null &&
        simulation.state.elapsed - state.stoppedAtSeconds >= MINIMUM_STOP_SECONDS
      ) {
        stopStartTaxiHolds += 1;
      }
      state.hasMoved = true;
      state.stoppedAtSeconds = null;
    } else if (
      speed <= STOP_THRESHOLD_KTS &&
      state.hasMoved &&
      state.stoppedAtSeconds === null
    ) {
      state.stoppedAtSeconds = simulation.state.elapsed;
    }
  }

  for (const id of taxiState.keys()) {
    if (!activeTaxiIds.has(id)) taxiState.delete(id);
  }
}

const metrics = simulation.shiftMetrics();
const diagnostics = simulation.diagnostics();
console.log(JSON.stringify({
  schemaVersion: 1,
  airport: configuration.code,
  density: 'rush',
  mode: 'auto',
  objective: simulation.state.trafficFlow.objective ?? 'balanced',
  pace: 3,
  seed: configuration.seed,
  modeledSeconds: Number(simulation.state.elapsed.toFixed(2)),
  stopDefinition: {
    stopThresholdKts: STOP_THRESHOLD_KTS,
    restartThresholdKts: RESTART_THRESHOLD_KTS,
    minimumStopSeconds: MINIMUM_STOP_SECONDS,
  },
  taxiAircraftObserved,
  stopStartTaxiHolds,
  holdingFuelBurnKg: Number(metrics.holdingFuelBurnKg.toFixed(3)),
  holdingFuelBurnByPhaseKg: Object.fromEntries(
    Object.entries(holdingFuelBurnByPhaseKg).map(([phase, burnKg]) => [
      phase,
      Number(burnKg.toFixed(3)),
    ]),
  ),
  holdingFuelBurnByReasonKg: Object.fromEntries(
    Object.entries(holdingFuelBurnByReasonKg)
      .sort((first, second) => second[1] - first[1])
      .slice(0, 12)
      .map(([reason, burnKg]) => [reason, Number(burnKg.toFixed(3))]),
  ),
  totalFuelBurnKg: Number(metrics.fuelBurnKg.toFixed(3)),
  arrivals: simulation.state.arrivals,
  departures: simulation.state.departures,
  safety: {
    collisionAlerts: diagnostics.metrics.collisionAlerts,
    runwayIncursions: diagnostics.metrics.runwayIncursions,
    activeCollisionPairs: (diagnostics.collisionPairs ?? diagnostics.collisions ?? []).length,
    activeObstacleCollisions: (diagnostics.obstacleCollisions ?? []).length,
  },
}));
`;

const result = await build({
  absWorkingDir: sourceRoot,
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: sourceRoot,
    sourcefile: "flow-baseline-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Flow baseline validation bundle was empty.");

const originalLog = console.log;
let captured = "";
console.log = (value) => {
  captured = String(value);
};
try {
  await import(
    "data:text/javascript;base64," + Buffer.from(bundled).toString("base64")
  );
} catch (error) {
  throw new Error(
    `Flow baseline simulation failed: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error },
  );
} finally {
  console.log = originalLog;
}

const report = JSON.parse(captured);
// Captured by running this exact harness with --report-only against a detached
// worktree at 92a269c. Keep the release evidence immutable; current code must
// improve on it under the conditions below rather than silently rebasing it.
const RELEASE_240_BASELINE = {
  sourceCommit: "92a269c",
  packageVersion: "2.40.0",
  conditions: {
    airport: "ORD",
    density: "rush",
    mode: "auto",
    objective: "balanced",
    pace: 3,
    seed: 10_004,
    modeledSeconds: 1_800,
  },
  taxiAircraftObserved: 34,
  holdingFuelBurnKg: 432.997,
  stopStartTaxiHolds: 43,
  arrivals: 21,
  departures: 6,
  safety: {
    collisionAlerts: 0,
    runwayIncursions: 0,
    activeCollisionPairs: 0,
    activeObstacleCollisions: 0,
  },
};

if (!reportOnly) {
  const failures = [];
  for (const [key, expected] of Object.entries(
    RELEASE_240_BASELINE.conditions,
  )) {
    if (report[key] !== expected)
      failures.push(`comparison condition ${key} changed`);
  }
  if (!(report.holdingFuelBurnKg < RELEASE_240_BASELINE.holdingFuelBurnKg))
    failures.push("holding fuel did not improve on 2.40");
  if (!(report.stopStartTaxiHolds < RELEASE_240_BASELINE.stopStartTaxiHolds))
    failures.push("stop-start taxi holds did not improve on 2.40");
  if (
    report.safety.collisionAlerts !== 0 ||
    report.safety.runwayIncursions !== 0 ||
    report.safety.activeCollisionPairs !== 0 ||
    report.safety.activeObstacleCollisions !== 0
  ) {
    failures.push("flow comparison reduced operational separation");
  }
  if (failures.length) throw new Error(failures.join("; "));
}

originalLog(
  JSON.stringify({
    accepted: true,
    baseline: RELEASE_240_BASELINE,
    current: report,
  }),
);

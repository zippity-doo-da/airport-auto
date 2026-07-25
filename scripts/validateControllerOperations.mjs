import { build } from 'esbuild';

const validationSource = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import {
  CONTROLLER_STATIONS,
  OPERATIONAL_CONTROLLER_STATIONS,
  controllerStationIsAhead,
  controllerWorkloadSnapshots,
  createStationAutomation,
  requiredControllerStation,
  stationCanIssue,
} from './src/simulation/controllerOperations.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = generateHubConfig(0);
const simulation = new AirportSimulation(config, 'quiet');
simulation.setMode('manual');
simulation.setPaused(false);

assert(CONTROLLER_STATIONS.join(',') === 'supervisor,approach,tower,ground,ramp', 'controller station roster is incomplete');
assert(OPERATIONAL_CONTROLLER_STATIONS.length === 4, 'operational station roster is incomplete');
assert(stationCanIssue('supervisor', 'ramp') && stationCanIssue('tower', 'tower') && !stationCanIssue('ground', 'tower'), 'station authority matrix is incorrect');

const sample = structuredClone(simulation.state.flights[0]);
sample.phase = 'approach';
sample.navigation.frequencyOwner = 'tower';
assert(controllerStationIsAhead(sample, 'tower', 'approach'), 'accepted early arrival handoff was not recognized as downstream');
sample.phase = 'taxi-out';
assert(!controllerStationIsAhead(sample, 'tower', 'approach'), 'departure sequence treated Tower as downstream of Approach');
sample.phase = 'approach';
sample.navigation.frequencyOwner = 'approach';
sample.progress = 0.25;
assert(requiredControllerStation(sample) === 'approach', 'arrival outside final was not assigned to Approach');
sample.progress = 0.74;
assert(requiredControllerStation(sample) === 'tower', 'arrival on final was not assigned to Tower');
sample.phase = 'landing';
assert(requiredControllerStation(sample) === 'tower', 'landing aircraft was not assigned to Tower');
sample.phase = 'taxi-in';
sample.progress = 0.4;
sample.rampControlZoneId = undefined;
assert(requiredControllerStation(sample) === 'ground', 'movement-area arrival was not assigned to Ground');
sample.progress = 0.9;
assert(requiredControllerStation(sample) === 'ramp', 'ramp-bound arrival was not assigned to Ramp');
sample.phase = 'resting';
assert(requiredControllerStation(sample) === 'ramp', 'aircraft at a stand was not assigned to Ramp');
sample.phase = 'taxi-out';
sample.progress = 0.01;
sample.tugAttached = true;
assert(requiredControllerStation(sample) === 'ramp', 'pushback aircraft was not assigned to Ramp');
sample.tugAttached = false;
sample.progress = 0.5;
assert(requiredControllerStation(sample) === 'ground', 'outbound movement-area aircraft was not assigned to Ground');
sample.progress = 0.99;
assert(requiredControllerStation(sample) === 'tower', 'hold-short departure was not assigned to Tower');
sample.phase = 'takeoff';
sample.motion.onGround = false;
assert(requiredControllerStation(sample) === 'approach', 'airborne departure was not assigned to Approach');

simulation.setStation('ground');
assert(simulation.state.station === 'ground', 'Ground station selection failed');
for (const station of OPERATIONAL_CONTROLLER_STATIONS) {
  assert(simulation.state.stationAutomation[station] === (station !== 'ground'), 'single-position automation did not staff every unselected desk');
}
assert(simulation.canIssue('ground') && !simulation.canIssue('ramp'), 'selected Ground desk did not retain exclusive human authority');
assert(!simulation.setStationAutomation('tower', false), 'non-supervisor changed station automation');

const arrival = simulation.state.flights[0];
assert(arrival, 'controller validation requires an initial flight');
arrival.phase = 'approach';
arrival.phaseElapsed = 20;
arrival.duration = 100;
arrival.motion.onGround = false;
arrival.goAround = undefined;
arrival.navigation.hold = undefined;
arrival.progress = 0.2;
arrival.navigation.frequencyOwner = 'ground';
arrival.navigation.approachCleared = false;
simulation.update(1 / 30);
assert(arrival.navigation.frequencyOwner === 'approach' && arrival.navigation.approachCleared, 'automated Approach did not accept and clear an inbound flight');
arrival.progress = 0.74;
arrival.cleared = false;
arrival.navigation.frequencyOwner = 'approach';
simulation.update(1 / 30);
assert(arrival.navigation.frequencyOwner === 'tower' && arrival.cleared, 'automated Tower did not accept and clear a final');
simulation.setStation('tower');
arrival.progress = 0.2;
arrival.navigation.frequencyOwner = 'tower';
simulation.update(1 / 30);
assert(arrival.navigation.frequencyOwner === 'tower', 'automated upstream desk reclaimed a human-accepted early handoff');

simulation.setStation('supervisor');
assert(simulation.setStationAutomation('tower', false), 'Supervisor could not disable Tower automation');
assert(!simulation.state.stationAutomation.tower, 'Tower automation state was not persisted');
const workloads = simulation.controllerWorkloads();
assert(workloads.length === 4 && workloads.every((workload) => workload.responsibilities.length >= 4), 'station workload snapshots are incomplete');
assert(workloads.find((workload) => workload.station === 'tower')?.automated === false, 'workload snapshot lost automation state');

simulation.setMode('assisted');
arrival.phase = 'approach';
arrival.progress = 0.76;
arrival.cleared = false;
arrival.goAround = undefined;
arrival.navigation.hold = undefined;
const landingProposal = simulation.clearanceProposals().find((proposal) => proposal.flightId === arrival.id && proposal.action === 'land');
assert(landingProposal?.station === 'tower', 'landing proposal was not routed to Tower');

const syntheticWorkloads = controllerWorkloadSnapshots([sample], createStationAutomation(true));
assert(syntheticWorkloads.reduce((sum, workload) => sum + workload.phaseRelevantFlights, 0) === 1, 'one aircraft appeared in multiple station workload queues');

console.log(JSON.stringify({
  stations: CONTROLLER_STATIONS.length,
  operationalStations: OPERATIONAL_CONTROLLER_STATIONS.length,
  authorityChecks: 6,
  phaseOwnershipChecks: 10,
  automationChecks: 10,
  workloadChecks: workloads.length,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'controller-operations-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Controller operations validation bundle was empty.');
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

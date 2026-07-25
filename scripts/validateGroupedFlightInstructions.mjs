import { build } from "esbuild";

const validationSource = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = generateHubConfig(0);
const simulation = new AirportSimulation(config, 'quiet');
simulation.setMode('manual');
simulation.setStation('supervisor');
for (let tick = 0; tick < 3_000 && !simulation.state.flights.some((flight) => flight.phase === 'approach'); tick += 1) simulation.update(0.1);
const first = simulation.state.flights.find((flight) => flight.phase === 'approach');
assert(first, 'group validation requires an initial arrival');
const second = structuredClone(first);
second.id += 10_000;
second.callsign = 'GROUP 2';
for (const flight of [first, second]) {
  flight.phase = 'approach';
  flight.progress = 0.2;
  flight.goAround = undefined;
  flight.diversion = undefined;
  flight.navigation.hold = undefined;
  flight.navigation.frequencyOwner = 'approach';
  flight.controlPace = 1;
  flight.controlHold = false;
}
simulation.state.flights = [first, second];
simulation.drainEvents();

simulation.setStation('approach');
const airbornePreview = simulation.previewGroupedInstruction([first.id, second.id], 'slow');
assert(airbornePreview.safeToIssue, 'compatible airborne group was rejected: ' + airbornePreview.reason);
assert(airbornePreview.domain === 'airborne' && airbornePreview.authority === 'approach', 'airborne preview lost its shared authority');
assert(first.controlPace === 1 && second.controlPace === 1, 'preview mutated flight pace');
const airborneIssue = simulation.issueGroupedInstruction([first.id, second.id], 'slow');
assert(airborneIssue.issued && first.controlPace === 0.55 && second.controlPace === 0.55, 'airborne group did not apply to every selected flight');
assert(simulation.drainEvents().filter((event) => event.type === 'group-instruction').length === 2, 'group issue did not emit one typed event per flight');

const paceBeforeUnsafeCommand = [first.controlPace, second.controlPace];
const expedite = simulation.issueGroupedInstruction([first.id, second.id], 'expedite');
assert(!expedite.issued, 'unsafe grouped expedite was accepted');
assert(first.controlPace === paceBeforeUnsafeCommand[0] && second.controlPace === paceBeforeUnsafeCommand[1], 'rejected expedite partially mutated the group');

second.phase = 'taxi-in';
second.progress = 0.2;
second.navigation.frequencyOwner = 'ground';
simulation.setStation('supervisor');
const mixed = simulation.issueGroupedInstruction([first.id, second.id], 'normal');
assert(!mixed.issued && mixed.reason.includes('mix airborne and surface') && first.controlPace === 0.55 && second.controlPace === 0.55, 'mixed-domain command was partially applied or poorly explained');
assert(!simulation.issueGroupedInstruction([first.id, 999_999], 'normal').issued, 'unknown grouped flight was accepted');
assert(!simulation.issueGroupedInstruction([first.id, first.id], 'normal').issued, 'duplicate grouped flight ID was accepted');
assert(!simulation.issueGroupedInstruction([first.id], 'normal').issued, 'single-flight request was accepted by the grouped endpoint');

for (const flight of [first, second]) {
  flight.phase = 'taxi-in';
  flight.progress = 0.2;
  flight.rampControlZoneId = undefined;
  flight.navigation.frequencyOwner = 'ground';
  flight.controlHold = false;
  flight.automaticHold = false;
  flight.safetyHold = false;
}
simulation.setStation('ground');
const surfacePreview = simulation.previewGroupedInstruction([first.id, second.id], 'hold');
assert(surfacePreview.safeToIssue && surfacePreview.domain === 'surface' && surfacePreview.authority === 'ground', 'compatible surface hold was rejected: ' + surfacePreview.reason);
const surfaceHold = simulation.issueGroupedInstruction([first.id, second.id], 'hold');
assert(surfaceHold.issued && first.controlHold && second.controlHold, 'surface group hold was not atomic');
first.safetyHold = true;
first.safetyHoldReason = 'test protection remains active';
const resumePreview = simulation.previewGroupedInstruction([first.id, second.id], 'resume');
assert(resumePreview.safeToIssue && resumePreview.safeguards.some((item) => item.includes('safety holds remain')), 'resume preview omitted the remaining safety hold');
const surfaceResume = simulation.issueGroupedInstruction([first.id, second.id], 'resume');
assert(surfaceResume.issued && !first.controlHold && !second.controlHold && first.safetyHold, 'resume removed a safety hold or failed to release every controller hold');

second.navigation.frequencyOwner = 'ramp';
const ownershipBefore = [first.controlHold, second.controlHold];
const unowned = simulation.issueGroupedInstruction([first.id, second.id], 'hold');
assert(!unowned.issued && first.controlHold === ownershipBefore[0] && second.controlHold === ownershipBefore[1], 'unowned group was partially accepted');
second.navigation.frequencyOwner = 'ground';
second.progress = 0.9;
const splitAuthority = simulation.issueGroupedInstruction([first.id, second.id], 'hold');
assert(!splitAuthority.issued && !first.controlHold && !second.controlHold, 'mixed Ground/Ramp authority was accepted');

console.log(JSON.stringify({
  airborne: airborneIssue.reason,
  surfaceHold: surfaceHold.reason,
  safetyHoldPreserved: first.safetyHold,
  mixedDomainRejected: mixed.reason,
  splitAuthorityRejected: splitAuthority.reason,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "grouped-flight-instructions-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled)
  throw new Error("Grouped flight instruction validation bundle was empty.");
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

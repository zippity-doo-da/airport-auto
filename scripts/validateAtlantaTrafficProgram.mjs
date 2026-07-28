import { build } from "esbuild";

const validationSource = `
import {
  airportTrafficProgram,
  selectTrafficProgram,
} from './src/simulation/airportTrafficPrograms.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const program = airportTrafficProgram('ATL');
assert(program.airportCode === 'ATL', 'Atlanta program identity is incorrect');
assert(program.fidelity === 'sourced-airlines-schematic-weights', 'Atlanta traffic program lacks sourced-airline disclosure');
assert(program.sources.some((source) => source.url?.includes('atl.com/passenger-information/airlines-at-atl')),
  'Atlanta passenger-airline directory is not recorded');
assert(program.sources.some((source) => source.role === 'terminal-allocation' && source.url?.includes('atl.com/maps-3')),
  'Atlanta terminal-map disclosure is not recorded');

const international = ['AF', 'BA', 'DL', 'KE', 'KL', 'LH', 'QR', 'TK', 'VS'];
for (const airline of international) {
  const bank = program.airlines.find((candidate) => candidate.airline === airline && candidate.gate.concourses?.join(',') === 'E,F');
  assert(bank, airline + ' is missing International Terminal E/F simulation intent');
  assert(bank.markets?.passenger?.length, airline + ' is missing a route pool');
}
for (const airline of ['AA', 'AS', 'B6', 'DL', 'F9', 'UA', 'WN', '5X', 'FX']) {
  assert(program.airlines.some((candidate) => candidate.airline === airline), airline + ' is missing from Atlanta traffic');
}

const seen = new Set();
const periods = ['morning-departure', 'morning-arrival', 'afternoon-arrival', 'evening-departure', 'overnight'];
for (const periodId of periods) {
  for (let flightId = 1; flightId <= 4000; flightId += 1) {
    const selection = selectTrafficProgram(program, {
      trafficClass: 'passenger',
      direction: flightId % 2 ? 'arrival' : 'departure',
      periodId,
      flightId,
      airportSeed: 417,
      supportsAircraft: () => true,
    });
    seen.add(selection.airline);
    assert(selection.market && selection.estimatedDistanceNm > 0, 'Atlanta selection is missing a viable market');
  }
}
for (const airline of international) {
  assert(seen.has(airline), airline + ' never appears in deterministic Atlanta traffic');
}
assert(seen.has('DL') && seen.has('WN') && seen.has('5X') === false,
  'passenger selection must expose domestic carriers without cargo leakage');

console.log(JSON.stringify({
  airport: program.airportCode,
  airlineProfiles: program.airlines.length,
  passengerCarriers: [...seen].sort(),
  internationalTerminalCarriers: international.length,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "atlanta-traffic-program-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});
const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Atlanta traffic validation bundle was empty.");
try {
  await import("data:text/javascript;base64," + Buffer.from(bundled).toString("base64"));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

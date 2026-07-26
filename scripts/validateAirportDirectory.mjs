import { build } from "esbuild";

const validationSource = `
import { HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { airportTrafficProgram } from './src/simulation/airportTrafficPrograms.ts';
import { airportPlace, airportPlaceLabel, airportRouteLabel, normalizeAirportCode } from './src/simulation/airportDirectory.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const codes = new Set(HUB_AIRPORTS.map((airport) => airport.code));
for (const airport of HUB_AIRPORTS) {
  const program = airportTrafficProgram(airport.code);
  for (const markets of Object.values(program.markets)) {
    for (const code of markets) codes.add(code);
  }
  for (const airline of program.airlines) {
    for (const markets of Object.values(airline.markets ?? {})) {
      for (const code of markets ?? []) codes.add(code);
    }
  }
}

const missing = [...codes].filter((code) => code !== 'LOCAL' && !airportPlace(code));
assert(missing.length === 0, 'airport directory is missing current markets: ' + missing.join(', '));
assert(normalizeAirportCode('KORD') === 'ORD', 'US ICAO aliases must resolve to their IATA place');
assert(normalizeAirportCode('EGLL') === 'LHR', 'international ICAO aliases must resolve to their IATA place');
assert(airportPlaceLabel('VIE') === 'VIE · Vienna, Austria', 'city/country display label is wrong');
assert(airportRouteLabel('VIE', 'ORD').includes('Vienna, Austria → ORD · Chicago, United States'), 'route label lost either endpoint');
assert(airportPlaceLabel('ZZZ') === 'ZZZ', 'unknown airport codes need a readable fallback');

console.log(JSON.stringify({ airports: codes.size, missing, sample: airportRouteLabel('VIE', 'ORD') }));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "airport-directory-validation.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Airport-directory validation bundle was empty.");
try {
  await import(
    "data:text/javascript;base64," + Buffer.from(bundled).toString("base64")
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

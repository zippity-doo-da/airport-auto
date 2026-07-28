import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const assetText = await readFile("public/data/airports/KATL.vector.json", "utf8");
const asset = JSON.parse(assetText);
const manifest = JSON.parse(
  await readFile("src/data/airports/KATL.manifest.json", "utf8"),
);

assert(asset.schemaVersion === 1, "Atlanta vector asset schema drifted");
assert(asset.airport?.icaoId === "KATL" && asset.airport?.faaId === "ATL", "Atlanta vector asset identity is incorrect");
assert(asset.airport?.fidelity === "faa-airport-mapping" && asset.airport?.navigationUse === false, "Atlanta vector fidelity disclosure is incorrect");
assert(manifest.assetSha256 === createHash("sha256").update(assetText).digest("hex"), "Atlanta vector manifest checksum differs from the asset");
assert(manifest.runtimeReference?.runways?.length === 5, "Atlanta FAA vector asset must expose all five runways");
const expectedRunways = ["08L/26R", "08R/26L", "09L/27R", "09R/27L", "10/28"];
assert(JSON.stringify(manifest.runtimeReference.runways.map((runway) => runway.runwayId)) === JSON.stringify(expectedRunways), "Atlanta runway ordering/designations drifted");
assert(manifest.runtimeReference.runways.every((runway) => runway.sourceLengthMeters > 2_500 && runway.sourceWidthMeters > 30), "Atlanta runway dimensions are not FAA source geometry");
assert(manifest.layerCounts?.taxiways >= 400 && manifest.layerCounts?.buildings >= 50, "Atlanta FAA vector layer import is incomplete");
assert(manifest.sources?.every((source) => source.owner === "AeronauticalInformationServices_FAA"), "Atlanta vector source attribution is not FAA AIS");

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { airportVectorManifest } from './src/simulation/airportVectorMetadata.ts';
import { airportSurfaceDataManifest, importedAirportSurfaceGraph } from './src/simulation/importedAirportData.ts';
import { surfaceRouteForFlight } from './src/simulation/surfaceGraph.ts';

function assert(condition, message) { if (!condition) throw new Error(message); }
const atlIndex = HUB_AIRPORTS.findIndex((airport) => airport.code === 'ATL');
const vector = airportVectorManifest('ATL');
const config = generateHubConfig(atlIndex);
assert(vector?.airport.icaoId === 'KATL', 'runtime metadata did not load KATL vector asset');
assert(config.vectorData?.airport.icaoId === 'KATL', 'Atlanta config does not expose its FAA vector metadata');
assert(airportSurfaceDataManifest('ATL')?.airport.icaoId === 'KATL', 'Atlanta surface manifest is missing');
assert(config.runwayConfigurations.length === 3, 'Atlanta does not expose its sourced configuration set');
const east = config.runwayConfigurations.find((configuration) => configuration.id === 'ATL-EAST-PARALLEL');
const west = config.runwayConfigurations.find((configuration) => configuration.id === 'ATL-WEST-PARALLEL');
const instrument = config.runwayConfigurations.find((configuration) => configuration.id === 'ATL-EAST-INSTRUMENT');
assert(east?.source?.url.includes('faa.gov') && west?.source?.url.includes('faa.gov'), 'Atlanta runway configurations lack FAA disclosure');
assert(east?.arrivalRunwayIds.join(',') === '0,2,4' && east.departureRunwayIds.join(',') === '1,3', 'Atlanta east parallel roles drifted');
assert(west?.operatingEnds[0] === 1 && west?.arrivalRunwayIds.join(',') === '0,2,4', 'Atlanta west parallel operating ends drifted');
assert(instrument?.procedure === 'instrument-parallel' && instrument.departureRunwayIds.join(',') === '1', 'Atlanta instrument capacity reduction drifted');
const graph = importedAirportSurfaceGraph('ATL', 1234);
assert(graph?.airportCode === 'ATL' && graph.stands.length >= 32, 'Atlanta imported surface graph is missing operational stands');
assert(graph.runwayAccess.length === 10 && graph.passengerFacilities.length >= 9, 'Atlanta imported surface graph is incomplete');
let routes = 0;
for (const stand of graph.stands) {
  for (const runway of config.runways) {
    for (const end of [-1, 1] as const) {
      const outbound = surfaceRouteForFlight(graph, runway.id, end, 'taxi-out', stand.slot);
      const inbound = surfaceRouteForFlight(graph, runway.id, end, 'taxi-in', stand.slot);
      assert(outbound && outbound.edgeIds.length > 0, 'Atlanta stand ' + stand.id + ' cannot taxi out to runway ' + runway.id + ' end ' + end);
      assert(inbound && inbound.edgeIds.length > 0, 'Atlanta runway ' + runway.id + ' end ' + end + ' cannot taxi in to stand ' + stand.id);
      routes += 2;
    }
  }
}
assert(config.runways.length === vector.runtimeReference.runways.length, 'Atlanta runtime lost a sourced runway');
for (let index = 0; index < config.runways.length; index += 1) {
  const runway = config.runways[index];
  const source = vector.runtimeReference.runways[index];
  assert(runway.designation?.join('/') === source.designation.join('/'), 'Atlanta runtime designation differs from FAA vector reference');
  assert(Math.abs(runway.length - source.length) < 0.0001, 'Atlanta runtime length differs from FAA vector reference');
}
console.log(JSON.stringify({ airport: config.code, runways: config.runways.length, configurations: config.runwayConfigurations.length, surface: config.surfaceData ? 'sourced' : 'schematic', stands: graph.stands.length, routes }));
`;
const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "atlanta-vector-runtime-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});
const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Atlanta vector validation bundle was empty.");
await import(`data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`);
console.log(JSON.stringify({ asset: "KATL", sourceRunways: expectedRunways.length, layerCounts: manifest.layerCounts }));

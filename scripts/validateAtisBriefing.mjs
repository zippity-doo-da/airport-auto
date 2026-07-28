import { build } from "esbuild";

const source = `
import { AirportSimulation } from "./src/simulation/airportSimulation.ts";
import { generateHubConfig } from "./src/simulation/airportConfig.ts";
import { createAtisBriefing } from "./src/presentation/atisBriefing.ts";

function assert(condition, message) { if (!condition) throw new Error(message); }
const config = generateHubConfig(0, 101);
const simulation = new AirportSimulation(config, "realistic");
simulation.setWeather("snow", Math.PI, 18);
simulation.setRunwayConfiguration(null);
const briefing = createAtisBriefing(simulation.state, config);
assert(briefing.station.includes("fictional modeled"), "ATIS must be explicitly fictional");
assert(briefing.copy.includes("not for navigation"), "ATIS must disclose its non-operational status");
assert(briefing.copy.includes("Wind 270 at 18 knots"), "ATIS wind is not derived from authoritative weather");
assert(briefing.copy.includes("runway condition code"), "ATIS lacks surface-condition state");
assert(briefing.copy.includes("landing"), "ATIS lacks active runway role state");
console.log(JSON.stringify({ id: briefing.id, notices: briefing.notices.length, copy: briefing.copy }));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: { contents: source, loader: "ts", resolveDir: process.cwd(), sourcefile: "atis-briefing-validation.ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});
const bundle = result.outputFiles[0]?.text;
if (!bundle) throw new Error("ATIS validation bundle was empty.");
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundle).toString("base64")}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

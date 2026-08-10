import { spawnSync } from "node:child_process";

const requestedHours = Number(
  process.argv
    .find((argument) => argument.startsWith("--hours="))
    ?.split("=")[1] ?? 2,
);
const hours = Number.isFinite(requestedHours)
  ? Math.min(4, Math.max(0.5, requestedHours))
  : 2;

const cases = [
  {
    airport: "ATL",
    program: "summer-storm",
    minimumDirectionalRatePerHour: 2,
  },
  {
    airport: "DFW",
    program: "snow-recovery",
    minimumDirectionalRatePerHour: 2,
  },
  {
    airport: "HND",
    program: "international-evening",
    // The schematic graph deliberately meters opposing traffic into longer
    // one-direction banks, so its sustainable directional rate is lower than
    // the sourced hubs while taxi speed remains physically scaled.
    minimumDirectionalRatePerHour: 1.5,
  },
];

function parseReport(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Checkpoint lines are JSON too, but only the final compact report has
      // an accepted field. Continue until that record is found.
    }
  }
  return null;
}

const reports = [];
const failures = [];
for (const matrixCase of cases) {
  const result = spawnSync(
    process.execPath,
    [
      "--expose-gc",
      "scripts/soakRuntime.mjs",
      `--hours=${hours}`,
      `--airport=${matrixCase.airport}`,
      "--mode=auto",
      `--program=${matrixCase.program}`,
      "--compact",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const report = parseReport(result.stdout);
  const label = `${matrixCase.airport}/${matrixCase.program}`;
  const minimumDirectionalCompletions = Math.max(
    2,
    Math.floor(hours * matrixCase.minimumDirectionalRatePerHour),
  );
  if (!report) {
    failures.push(`${label}: no compact soak report`);
    if (result.stderr.trim())
      failures.push(`${label}: ${result.stderr.trim()}`);
    continue;
  }
  reports.push(report);
  if (result.status !== 0 || !report.accepted)
    failures.push(`${label}: ${report.failures?.join(", ") || "soak failed"}`);
  if (report.arrivals < minimumDirectionalCompletions)
    failures.push(
      `${label}: ${report.arrivals} arrivals below ${minimumDirectionalCompletions}`,
    );
  if (report.departures < minimumDirectionalCompletions)
    failures.push(
      `${label}: ${report.departures} departures below ${minimumDirectionalCompletions}`,
    );
  const activeArrivalPipeline =
    (report.phaseCounts?.approach ?? 0) +
    (report.phaseCounts?.landing ?? 0);
  const activeDeparturePipeline =
    (report.phaseCounts?.["taxi-out"] ?? 0) +
    (report.phaseCounts?.takeoff ?? 0);
  if (report.secondsSinceArrival > 1_200 && activeArrivalPipeline === 0)
    failures.push(`${label}: arrival stream stale`);
  if (report.secondsSinceDeparture > 1_200 && activeDeparturePipeline === 0)
    failures.push(`${label}: departure stream stale`);
  if (report.secondsSinceCompletedOperation > 1_200)
    failures.push(`${label}: completed-operation stream stale`);
  if (report.maximumSecondsWithoutTrafficMotion > 120)
    failures.push(`${label}: all moving traffic stopped`);
  if (report.maximumStationarySeconds > 900)
    failures.push(`${label}: individual movement held over 15 minutes`);
}

const summary = {
  accepted: failures.length === 0,
  modeledHoursPerCase: hours,
  failures,
  cases: reports.map((report) => ({
    airport: report.airport,
    ambientProgram: report.ambientProgram,
    density: report.density,
    arrivals: report.arrivals,
    departures: report.departures,
    secondsSinceCompletedOperation: report.secondsSinceCompletedOperation,
    maximumAircraft: report.maximumAircraft,
    maximumQueues: report.maximumQueues,
    maximumSecondsWithoutTrafficMotion:
      report.maximumSecondsWithoutTrafficMotion,
    maximumStationarySeconds: report.maximumStationarySeconds,
    simulationTickP95Ms: report.simulationTickP95Ms,
    safety: report.safety,
  })),
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;

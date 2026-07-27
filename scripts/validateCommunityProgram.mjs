import { build } from "esbuild";

const validationSource = `
import { HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { challengeDefinitions } from './src/simulation/challengeProgram.ts';
import {
  DAILY_CHALLENGE_AIRPORTS,
  buildDailyChallengeLink,
  dailyChallengePlan,
} from './src/simulation/dailyChallenge.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const fromString = dailyChallengePlan('2026-07-27');
const fromDate = dailyChallengePlan(new Date('2026-07-27T23:59:59.999Z'));
assert(JSON.stringify(fromString) === JSON.stringify(fromDate), 'UTC date inputs produced different daily challenges');
assert(JSON.stringify(fromString) === JSON.stringify(dailyChallengePlan('2026-07-27')), 'daily challenge is not deterministic');
assert(fromString.mode === 'assisted' && fromString.station === 'supervisor', 'daily challenge does not open in the supported teaching posture');
assert(fromString.deterministic && fromString.schemaVersion === 1, 'daily challenge lacks a versioned deterministic contract');

const hubCodes = HUB_AIRPORTS.map((airport) => airport.code).sort();
assert(JSON.stringify([...DAILY_CHALLENGE_AIRPORTS].sort()) === JSON.stringify(hubCodes), 'daily airport rotation drifted from the named hub catalog');
const challengeIds = new Set(challengeDefinitions().map((challenge) => challenge.id));
const airports = new Set();
const challenges = new Set();
const seeds = new Set();
for (let offset = 0; offset < 730; offset += 1) {
  const date = new Date(Date.UTC(2026, 0, 1 + offset));
  const plan = dailyChallengePlan(date);
  assert(challengeIds.has(plan.challengeId), plan.date + ' selected an unknown challenge');
  assert(Number.isSafeInteger(plan.seed) && plan.seed >= 0, plan.date + ' generated an invalid seed');
  airports.add(plan.airportCode);
  challenges.add(plan.challengeId);
  seeds.add(plan.seed);
}
assert(airports.size === HUB_AIRPORTS.length, 'the two-year rotation does not reach every named airport');
assert(challenges.size === challengeIds.size, 'the two-year rotation does not reach every challenge');
assert(seeds.size > 720, 'daily seeds repeat too frequently');

const link = buildDailyChallengeLink(
  'https://example.test/airport-auto/?token=secret&clientId=person#private',
  fromString,
  { classroom: true },
);
const url = new URL(link);
const allowed = new Set(['airport', 'seed', 'mode', 'station', 'rules', 'challenge', 'daily', 'classroom']);
assert([...url.searchParams.keys()].every((key) => allowed.has(key)), 'classroom link contains an unapproved parameter');
assert(url.hash === '' && !link.includes('secret') && !link.includes('person'), 'classroom link leaked source URL state');
assert(url.searchParams.get('airport') === fromString.airportCode, 'classroom link changed the airport');
assert(url.searchParams.get('seed') === String(fromString.seed), 'classroom link changed the seed');
assert(url.searchParams.get('challenge') === fromString.challengeId, 'classroom link changed the challenge');
assert(url.searchParams.get('daily') === fromString.date && url.searchParams.get('classroom') === fromString.date, 'classroom link lacks its UTC cohort date');
assert(!url.searchParams.has('autostart'), 'classroom link skipped the deliberate briefing');

for (const invalid of ['2026-02-30', '07-27-2026', '', '2026-7-27']) {
  let rejected = false;
  try { dailyChallengePlan(invalid); } catch { rejected = true; }
  assert(rejected, 'invalid daily date was accepted: ' + invalid);
}

console.log(JSON.stringify({
  sample: fromString,
  rotation: { airports: airports.size, challenges: challenges.size, uniqueSeeds: seeds.size },
  sharing: { approvedParameters: [...allowed], accounts: false, scoreUpload: false },
}));
`;

const result = await build({
  stdin: {
    contents: validationSource,
    resolveDir: process.cwd(),
    sourcefile: "community-validation.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

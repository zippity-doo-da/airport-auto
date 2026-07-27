import { build } from 'esbuild';

const validationSource = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { SoundscapeEventScheduler } from './src/audio/soundscapeEvents.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = generateHubConfig(7);
const simulation = new AirportSimulation(config);
const sourceSpawn = simulation.drainEvents().find((event) => event.type === 'spawn' && event.flight.phase === 'approach');
assert(sourceSpawn, 'long-form fixture has no arrival event');
simulation.setWeather('rain', 0, 22);
const scheduler = new SoundscapeEventScheduler(config.seed);
const events = [];
const radioByMinute = new Map();
const FOUR_HOURS = 4 * 60 * 60;

for (let second = 0; second <= FOUR_HOURS; second += 1) {
  simulation.state.elapsed = second;
  if (second % 6 === 0) {
    const flightId = 10_000 + second;
    const syntheticSpawn = {
      ...sourceSpawn,
      flight: {
        ...sourceSpawn.flight,
        id: flightId,
        callsign: 'TEST ' + flightId,
      },
    };
    for (const event of scheduler.observe(syntheticSpawn, simulation.state)) events.push(event);
    // Duplicate domain delivery exercises both per-flight and global radio
    // cooldowns without adding another audible exchange.
    scheduler.observe(syntheticSpawn, simulation.state);
  }
  for (const event of scheduler.advance(simulation.state)) events.push(event);
}

for (const event of events.filter((candidate) => candidate.channel === 'radio')) {
  const minute = Math.floor(event.elapsed / 60);
  radioByMinute.set(minute, (radioByMinute.get(minute) ?? 0) + 1);
}
const snapshot = scheduler.snapshot();
const maximumRadioPerMinute = Math.max(0, ...radioByMinute.values());
const weatherEvents = events.filter((event) => event.kind === 'weather-gust');
assert(weatherEvents.length >= 100 && weatherEvents.length <= 600, 'four-hour weather bed event density escaped its calm budget');
assert(!events.some((event) => event.kind === 'thunder'), 'default-off high-stakes thunder played during the calm soak');
assert(maximumRadioPerMinute <= 10, 'radio density exceeded ten reusable exchanges per minute');
assert(snapshot.maximumSameVariantRun <= 1, 'a sound variant repeated back-to-back despite alternatives');
assert(snapshot.retainedCooldownKeys <= 512, 'sound cooldown memory exceeded its bounded retention');
assert(snapshot.retainedVariantKeys <= 24, 'variant history grew with flight count instead of event vocabulary');
assert(snapshot.suppressed > 0, 'long-form cooldown policy never exercised suppression');

console.log(JSON.stringify({
  modeledHours: 4,
  emitted: snapshot.emitted,
  suppressed: snapshot.suppressed,
  weatherEvents: weatherEvents.length,
  maximumRadioPerMinute,
  maximumSameVariantRun: snapshot.maximumSameVariantRun,
  retainedCooldownKeys: snapshot.retainedCooldownKeys,
  retainedVariantKeys: snapshot.retainedVariantKeys,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'audio-repetition-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Audio repetition validation bundle was empty.');
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

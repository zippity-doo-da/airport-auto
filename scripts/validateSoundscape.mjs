import { build } from "esbuild";

const validationSource = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { SoundscapeEventScheduler } from './src/audio/soundscapeEvents.ts';
import { RadioCaptionCoordinator } from './src/presentation/radioCaptions.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = generateHubConfig(0);
const simulation = new AirportSimulation(config);
const spawn = simulation.drainEvents().find((event) => event.type === 'spawn' && event.flight.phase === 'approach');
assert(spawn, 'hub opening bank did not expose an arrival spawn event');

const first = new SoundscapeEventScheduler(config.seed);
const second = new SoundscapeEventScheduler(config.seed);
const firstEvents = first.observe(spawn, simulation.state);
const secondEvents = second.observe(spawn, simulation.state);
assert(JSON.stringify(firstEvents) === JSON.stringify(secondEvents), 'same seed and domain event produced different sound decisions');
assert(firstEvents.length === 1 && firstEvents[0].kind === 'scope-entry', 'arrival scope entry did not produce its radio event');
assert(firstEvents[0].caption?.includes(spawn.flight.callsign), 'offline radio caption omitted the callsign');
assert(firstEvents[0].variant >= 0 && firstEvents[0].variant < 4, 'sound variant exceeded the declared library');

assert(first.observe(spawn, simulation.state).length === 0, 'duplicate domain event bypassed the radio cooldown');
assert(first.snapshot().suppressed === 1, 'cooldown suppression was not observable');

const trackedFirst = new SoundscapeEventScheduler(config.seed);
const trackedSecond = new SoundscapeEventScheduler(config.seed);
assert(
  JSON.stringify(trackedFirst.advance(simulation.state)) === JSON.stringify(trackedSecond.advance(simulation.state)),
  'ambient scheduling is not deterministic',
);
assert(trackedFirst.snapshot().trackedFlights === simulation.state.flights.length, 'spatial flight tracking omitted live traffic');

const transitionFlight = simulation.state.flights.find((flight) => flight.phase === 'approach');
assert(transitionFlight, 'transition fixture has no approach aircraft');
transitionFlight.motion.stage = 'final';
transitionFlight.motion.onGround = false;
assert(trackedFirst.advance(simulation.state).some((event) => event.kind === 'gear'), 'final approach did not emit the gear layer');
transitionFlight.phase = 'landing';
transitionFlight.motion.stage = 'touchdown';
transitionFlight.motion.onGround = true;
const touchdownEvents = trackedFirst.advance(simulation.state);
assert(touchdownEvents.some((event) => event.kind === 'touchdown'), 'authoritative touchdown transition did not emit its cue');
assert(touchdownEvents.some((event) => event.kind === 'reverse-thrust' && event.elapsed > simulation.state.elapsed), 'touchdown did not schedule rollout reverse thrust');
transitionFlight.phase = 'taxi-out';
transitionFlight.motion.stage = 'taxi';
trackedFirst.advance(simulation.state);
transitionFlight.phase = 'takeoff';
transitionFlight.motion.stage = 'takeoff-roll';
assert(trackedFirst.advance(simulation.state).some((event) => event.kind === 'takeoff-power'), 'authoritative takeoff-roll transition did not emit power');

simulation.setWeather('rain', 0, 22);
simulation.state.elapsed = 1_000;
const calmWeather = new SoundscapeEventScheduler(config.seed);
const calmEvents = calmWeather.advance(simulation.state);
assert(!calmEvents.some((event) => event.kind === 'thunder'), 'high-stakes weather played while disabled');
const activeWeather = new SoundscapeEventScheduler(config.seed);
activeWeather.setHighStakesWeatherEnabled(true);
const activeEvents = activeWeather.advance(simulation.state);
assert(activeEvents.some((event) => event.kind === 'thunder'), 'explicit high-stakes weather did not permit rare thunder');

simulation.setWeatherEnabled(false);
simulation.state.weather.condition = 'snow';
const disabledWeather = new SoundscapeEventScheduler(config.seed);
assert(!disabledWeather.advance(simulation.state).some((event) => event.kind.startsWith('weather-') || event.kind === 'thunder'), 'disabled weather emitted a weather sound');

const presented = [];
const captions = new RadioCaptionCoordinator((caption) => presented.push(caption), 3);
captions.enqueue({ id: 'one', station: 'approach', copy: 'First readable transmission.', priority: 'ambient' }, 0);
captions.enqueue({ id: 'two', station: 'tower', copy: 'Second readable transmission.', priority: 'operational' }, 100);
captions.advance(4_199);
assert(presented.length === 1, 'radio captions changed before the minimum readable dwell');
captions.advance(4_200);
assert(presented.length === 2 && presented[1]?.id === 'two', 'queued radio caption did not follow its readable dwell');
captions.enqueue({ id: 'critical', station: 'tower', copy: 'Go around.', priority: 'critical' }, 4_300);
assert(presented.at(-1)?.id === 'critical', 'critical radio instruction did not preempt routine chatter');
captions.reset();
assert(presented.at(-1) === null && captions.snapshot().queued.length === 0, 'caption reset left stale UI state');

console.log(JSON.stringify({
  schemaVersion: firstEvents[0].schemaVersion,
  deterministicVariant: firstEvents[0].variant,
  trackedFlights: trackedFirst.snapshot().trackedFlights,
  highStakesWeatherOptional: true,
  captionDwellMs: 4_200,
  sourceManifest: 'public/audio/soundscape-manifest.json',
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "soundscape-validation.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error("Soundscape validation bundle was empty.");
await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

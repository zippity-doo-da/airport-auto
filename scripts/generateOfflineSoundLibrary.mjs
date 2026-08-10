import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SAMPLE_RATE = 16_000;
const OUTPUT_ROOT = 'public/audio/library';

const specifications = [
  { id: 'engine-turbofan', family: 'bed', channel: 'aircraft', duration: 6.4, seed: 101, synthesis: 'engine', triggers: ['engine'], states: ['moving'] },
  { id: 'apu-ramp', family: 'bed', channel: 'terminal', duration: 7.1, seed: 102, synthesis: 'apu', triggers: ['apu'], states: ['gate-active'] },
  { id: 'ramp-bed', family: 'bed', channel: 'terminal', duration: 8.2, seed: 103, synthesis: 'ramp', triggers: ['ramp'], states: ['service-active'] },
  { id: 'cabin-area', family: 'bed', channel: 'terminal', duration: 8.6, seed: 104, synthesis: 'room', triggers: ['cabin'], states: ['gate-active'] },
  { id: 'runway-distance', family: 'bed', channel: 'ambience', duration: 7.8, seed: 105, synthesis: 'runway', triggers: ['runway'], states: ['moving'] },
  { id: 'terminal-room', family: 'bed', channel: 'terminal', duration: 9.4, seed: 106, synthesis: 'terminal', triggers: ['terminal'], states: ['always'] },
  { id: 'tower-room', family: 'bed', channel: 'terminal', duration: 9.1, seed: 107, synthesis: 'room', triggers: ['tower'], states: ['always'] },
  { id: 'rain-field', family: 'bed', channel: 'weather', duration: 9.7, seed: 108, synthesis: 'rain', triggers: ['rain'], states: ['rain'] },
  { id: 'wind-field', family: 'bed', channel: 'weather', duration: 9.3, seed: 109, synthesis: 'wind', triggers: ['wind'], states: ['wind'] },
  { id: 'snow-field', family: 'bed', channel: 'weather', duration: 10.1, seed: 110, synthesis: 'snow', triggers: ['snow'], states: ['snow'] },
  { id: 'low-visibility-room', family: 'bed', channel: 'weather', duration: 10.6, seed: 111, synthesis: 'fog', triggers: ['fog'], states: ['low-visibility'] },
  { id: 'taxi-whine-1', family: 'event', channel: 'aircraft', duration: 2.6, seed: 201, synthesis: 'whine', triggers: ['taxi-whine'] },
  { id: 'taxi-whine-2', family: 'event', channel: 'aircraft', duration: 2.9, seed: 202, synthesis: 'whine', triggers: ['taxi-whine'] },
  { id: 'power-change-1', family: 'event', channel: 'aircraft', duration: 2.3, seed: 203, synthesis: 'power', triggers: ['takeoff-power', 'engine-start'] },
  { id: 'power-change-2', family: 'event', channel: 'aircraft', duration: 2.7, seed: 204, synthesis: 'power', triggers: ['takeoff-power', 'engine-start'] },
  { id: 'reverse-1', family: 'event', channel: 'aircraft', duration: 2.8, seed: 205, synthesis: 'reverse', triggers: ['reverse-thrust'] },
  { id: 'reverse-2', family: 'event', channel: 'aircraft', duration: 3.1, seed: 206, synthesis: 'reverse', triggers: ['reverse-thrust'] },
  { id: 'runway-rumble-1', family: 'event', channel: 'aircraft', duration: 2.5, seed: 207, synthesis: 'rumble', triggers: ['runway-rumble'] },
  { id: 'runway-rumble-2', family: 'event', channel: 'aircraft', duration: 2.9, seed: 208, synthesis: 'rumble', triggers: ['runway-rumble'] },
  { id: 'touchdown-1', family: 'event', channel: 'aircraft', duration: 1.7, seed: 209, synthesis: 'touchdown', triggers: ['touchdown'] },
  { id: 'touchdown-2', family: 'event', channel: 'aircraft', duration: 1.9, seed: 210, synthesis: 'touchdown', triggers: ['touchdown'] },
  { id: 'flap-motion-1', family: 'event', channel: 'aircraft', duration: 2.2, seed: 211, synthesis: 'mechanical', triggers: ['flap'] },
  { id: 'flap-motion-2', family: 'event', channel: 'aircraft', duration: 2.5, seed: 212, synthesis: 'mechanical', triggers: ['flap'] },
  { id: 'gear-motion-1', family: 'event', channel: 'aircraft', duration: 2.1, seed: 213, synthesis: 'mechanical', triggers: ['gear'] },
  { id: 'gear-motion-2', family: 'event', channel: 'aircraft', duration: 2.4, seed: 214, synthesis: 'mechanical', triggers: ['gear'] },
  { id: 'pushback-1', family: 'event', channel: 'aircraft', duration: 2.7, seed: 215, synthesis: 'tug', triggers: ['pushback', 'tug-movement'] },
  { id: 'pushback-2', family: 'event', channel: 'aircraft', duration: 3.0, seed: 216, synthesis: 'tug', triggers: ['pushback', 'tug-movement'] },
  { id: 'service-vehicle-1', family: 'event', channel: 'terminal', duration: 2.5, seed: 217, synthesis: 'vehicle', triggers: ['service-vehicle', 'ramp-clatter'] },
  { id: 'service-vehicle-2', family: 'event', channel: 'terminal', duration: 2.9, seed: 218, synthesis: 'vehicle', triggers: ['service-vehicle', 'ramp-clatter'] },
  { id: 'deicing-1', family: 'event', channel: 'weather', duration: 3.4, seed: 219, synthesis: 'spray', triggers: ['deicing-spray'] },
  { id: 'deicing-2', family: 'event', channel: 'weather', duration: 3.8, seed: 220, synthesis: 'spray', triggers: ['deicing-spray'] },
  { id: 'gust-1', family: 'event', channel: 'weather', duration: 3.3, seed: 221, synthesis: 'gust', triggers: ['weather-gust', 'weather-shift'] },
  { id: 'gust-2', family: 'event', channel: 'weather', duration: 3.8, seed: 222, synthesis: 'gust', triggers: ['weather-gust', 'weather-shift'] },
  { id: 'thunder-1', family: 'event', channel: 'weather', duration: 5.4, seed: 223, synthesis: 'thunder', triggers: ['thunder'] },
  { id: 'thunder-2', family: 'event', channel: 'weather', duration: 6.2, seed: 224, synthesis: 'thunder', triggers: ['thunder'] },
  { id: 'approach-arrival-1', family: 'radio', channel: 'radio', duration: 3.1, seed: 301, synthesis: 'voice-low', triggers: ['scope-entry'], station: 'approach', speaker: 'controller-a', captionTemplate: '{callsign}, radar contact. Continue the arrival.' },
  { id: 'approach-arrival-2', family: 'radio', channel: 'radio', duration: 3.4, seed: 302, synthesis: 'voice-high', triggers: ['scope-entry'], station: 'approach', speaker: 'controller-b', captionTemplate: '{callsign}, radar contact. Continue the arrival.' },
  { id: 'tower-landing-1', family: 'radio', channel: 'radio', duration: 3.0, seed: 303, synthesis: 'voice-low', triggers: ['radio-clearance'], station: 'tower', speaker: 'controller-a', captionTemplate: '{callsign}, cleared to land.' },
  { id: 'tower-landing-2', family: 'radio', channel: 'radio', duration: 3.2, seed: 304, synthesis: 'voice-high', triggers: ['radio-clearance'], station: 'tower', speaker: 'controller-b', captionTemplate: '{callsign}, cleared for takeoff or landing as assigned.' },
  { id: 'ground-taxi-1', family: 'radio', channel: 'radio', duration: 3.3, seed: 305, synthesis: 'voice-low', triggers: ['radio-ground'], station: 'ground', speaker: 'controller-c', captionTemplate: '{callsign}, taxi via the assigned route.' },
  { id: 'ground-taxi-2', family: 'radio', channel: 'radio', duration: 3.5, seed: 306, synthesis: 'voice-high', triggers: ['radio-ground'], station: 'ground', speaker: 'controller-d', captionTemplate: '{callsign}, hold short, then continue as cleared.' },
  { id: 'handoff-1', family: 'radio', channel: 'radio', duration: 2.9, seed: 307, synthesis: 'voice-low', triggers: ['radio-handoff'], station: 'approach', speaker: 'controller-a', captionTemplate: '{callsign}, contact the next controller.' },
  { id: 'handoff-2', family: 'radio', channel: 'radio', duration: 3.1, seed: 308, synthesis: 'voice-high', triggers: ['radio-handoff'], station: 'tower', speaker: 'controller-b', captionTemplate: '{callsign}, frequency change approved.' },
  { id: 'emergency-1', family: 'radio', channel: 'radio', duration: 3.0, seed: 309, synthesis: 'voice-low', triggers: ['radio-emergency'], station: 'tower', speaker: 'controller-c', captionTemplate: '{callsign}, go around. Fly the missed approach.' },
  { id: 'emergency-2', family: 'radio', channel: 'radio', duration: 3.4, seed: 310, synthesis: 'voice-high', triggers: ['radio-emergency'], station: 'approach', speaker: 'controller-d', captionTemplate: '{callsign}, emergency acknowledged. Priority handling is active.' },
  { id: 'approach-arrival-3', family: 'radio', channel: 'radio', duration: 3.5, seed: 311, synthesis: 'voice-mid', triggers: ['scope-entry'], station: 'approach', speaker: 'controller-e', captionTemplate: '{callsign}, identified. Expect the planned arrival.' },
  { id: 'approach-arrival-4', family: 'radio', channel: 'radio', duration: 3.2, seed: 312, synthesis: 'voice-soft', triggers: ['scope-entry'], station: 'approach', speaker: 'controller-f', captionTemplate: '{callsign}, radar service is available. Continue inbound.' },
  { id: 'tower-landing-3', family: 'radio', channel: 'radio', duration: 3.3, seed: 313, synthesis: 'voice-mid', triggers: ['radio-clearance'], station: 'tower', speaker: 'controller-e', captionTemplate: '{callsign}, landing clearance issued for the assigned runway.' },
  { id: 'tower-landing-4', family: 'radio', channel: 'radio', duration: 3.5, seed: 314, synthesis: 'voice-soft', triggers: ['radio-clearance'], station: 'tower', speaker: 'controller-f', captionTemplate: '{callsign}, runway is available. Continue as cleared.' },
  { id: 'ground-taxi-3', family: 'radio', channel: 'radio', duration: 3.6, seed: 315, synthesis: 'voice-mid', triggers: ['radio-ground'], station: 'ground', speaker: 'controller-e', captionTemplate: '{callsign}, use the cleared taxi route and monitor ground.' },
  { id: 'ground-taxi-4', family: 'radio', channel: 'radio', duration: 3.4, seed: 316, synthesis: 'voice-soft', triggers: ['radio-ground'], station: 'ground', speaker: 'controller-f', captionTemplate: '{callsign}, continue taxi with the current clearance.' },
  { id: 'ramp-pushback-1', family: 'radio', channel: 'radio', duration: 3.1, seed: 317, synthesis: 'voice-low', triggers: ['radio-ground'], station: 'ramp', speaker: 'ramp-a', captionTemplate: '{callsign}, pushback window is approved. Release when ready.' },
  { id: 'ramp-pushback-2', family: 'radio', channel: 'radio', duration: 3.3, seed: 318, synthesis: 'voice-mid', triggers: ['radio-ground'], station: 'ramp', speaker: 'ramp-b', captionTemplate: '{callsign}, ramp route is clear. Contact ground when ready.' },
  { id: 'handoff-3', family: 'radio', channel: 'radio', duration: 3.2, seed: 319, synthesis: 'voice-mid', triggers: ['radio-handoff'], station: 'ground', speaker: 'controller-e', captionTemplate: '{callsign}, switch to the next control position.' },
  { id: 'handoff-4', family: 'radio', channel: 'radio', duration: 3.0, seed: 320, synthesis: 'voice-soft', triggers: ['radio-handoff'], station: 'ramp', speaker: 'ramp-b', captionTemplate: '{callsign}, handoff complete. Continue with the next controller.' },
  { id: 'emergency-3', family: 'radio', channel: 'radio', duration: 3.3, seed: 321, synthesis: 'voice-mid', triggers: ['radio-emergency'], station: 'tower', speaker: 'controller-e', captionTemplate: '{callsign}, go around now. Maintain the assigned missed approach.' },
  { id: 'emergency-4', family: 'radio', channel: 'radio', duration: 3.6, seed: 322, synthesis: 'voice-soft', triggers: ['radio-emergency'], station: 'approach', speaker: 'controller-f', captionTemplate: '{callsign}, priority handling acknowledged. Follow the escape procedure.' },
  { id: 'tower-reject-takeoff-1', family: 'radio', channel: 'radio', duration: 3.0, seed: 323, synthesis: 'voice-low', triggers: ['radio-emergency'], station: 'tower', speaker: 'controller-c', captionTemplate: '{callsign}, reject takeoff. Stop immediately.' },
  { id: 'tower-reject-takeoff-2', family: 'radio', channel: 'radio', duration: 3.2, seed: 324, synthesis: 'voice-mid', triggers: ['radio-emergency'], station: 'tower', speaker: 'controller-e', captionTemplate: '{callsign}, cancel takeoff clearance. Hold position.' },
  { id: 'ground-traffic-stop-1', family: 'radio', channel: 'radio', duration: 3.1, seed: 325, synthesis: 'voice-high', triggers: ['radio-emergency'], station: 'ground', speaker: 'controller-d', captionTemplate: 'STOP IMMEDIATELY, {callsign}. Conflicting traffic.' },
  { id: 'ground-traffic-stop-2', family: 'radio', channel: 'radio', duration: 3.3, seed: 326, synthesis: 'voice-soft', triggers: ['radio-emergency'], station: 'ground', speaker: 'controller-f', captionTemplate: '{callsign}, traffic alert. Hold position.' },
  { id: 'ramp-traffic-stop-1', family: 'radio', channel: 'radio', duration: 3.0, seed: 327, synthesis: 'voice-mid', triggers: ['radio-emergency'], station: 'ramp', speaker: 'ramp-b', captionTemplate: 'STOP IMMEDIATELY, {callsign}. Ramp traffic.' },
];

function randomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0xffff_ffff;
  };
}

function smoothNoise(random, length) {
  const result = new Float64Array(length);
  let slow = 0;
  let fast = 0;
  for (let index = 0; index < length; index += 1) {
    const white = random() * 2 - 1;
    slow = slow * 0.997 + white * 0.003;
    fast = fast * 0.88 + white * 0.12;
    result[index] = slow * 1.8 + fast * 0.45;
  }
  return result;
}

function envelope(time, duration, attack = 0.08, release = 0.18) {
  return Math.min(1, time / attack, Math.max(0, (duration - time) / release));
}

function synthesize(specification) {
  const length = Math.round(specification.duration * SAMPLE_RATE);
  const samples = new Float64Array(length);
  const random = randomFactory(specification.seed);
  const noise = smoothNoise(random, length);
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    const progress = time / specification.duration;
    const fade = envelope(time, specification.duration);
    const pulse = 0.55 + Math.sin(time * Math.PI * 2 * 0.17 + specification.seed) * 0.08;
    let value = 0;
    switch (specification.synthesis) {
      case 'engine': value = Math.sin(time * Math.PI * 2 * 53) * 0.22 + Math.sin(time * Math.PI * 2 * 106.4) * 0.11 + noise[index] * 0.1; break;
      case 'apu': value = Math.sin(time * Math.PI * 2 * 92) * 0.18 + Math.sin(time * Math.PI * 2 * 184.7) * 0.06 + noise[index] * 0.055; break;
      case 'ramp': value = noise[index] * 0.13 + (Math.sin(time * Math.PI * 2 * 3.7) > 0.997 ? 0.25 : 0); break;
      case 'room': value = Math.sin(time * Math.PI * 2 * 55) * 0.045 + Math.sin(time * Math.PI * 2 * 110.3) * 0.022 + noise[index] * 0.025; break;
      case 'runway': value = noise[index] * 0.16 + Math.sin(time * Math.PI * 2 * 42) * 0.04; break;
      case 'terminal': value = noise[index] * 0.055 + Math.sin(time * Math.PI * 2 * 220 + Math.sin(time * 0.7)) * 0.009; break;
      case 'rain': value = (random() * 2 - 1) * 0.16 + noise[index] * 0.07; break;
      case 'wind': value = noise[index] * (0.13 + 0.08 * Math.sin(time * 0.39) ** 2); break;
      case 'snow': value = noise[index] * 0.045 + (random() > 0.9995 ? (random() - 0.5) * 0.2 : 0); break;
      case 'fog': value = noise[index] * 0.035 + Math.sin(time * Math.PI * 2 * 47) * 0.018; break;
      case 'whine': value = Math.sin(time * Math.PI * 2 * (420 + 95 * progress)) * 0.13 + noise[index] * 0.035; break;
      case 'power': value = Math.sin(time * Math.PI * 2 * (48 + 64 * progress)) * 0.22 + noise[index] * (0.05 + progress * 0.12); break;
      case 'reverse': value = noise[index] * (0.22 + 0.12 * Math.sin(time * Math.PI * 2 * 2.1) ** 2) + Math.sin(time * Math.PI * 2 * 62) * 0.09; break;
      case 'rumble': value = noise[index] * 0.2 + Math.sin(time * Math.PI * 2 * (34 + 8 * Math.sin(time * 7))) * 0.12; break;
      case 'touchdown': value = noise[index] * 0.08 + Math.sin(time * Math.PI * 2 * 64) * Math.exp(-time * 4.5) * 0.42 + (time < 0.08 ? (random() * 2 - 1) * 0.5 : 0); break;
      case 'mechanical': value = noise[index] * 0.045 + Math.sin(time * Math.PI * 2 * (155 + 18 * Math.sin(time * 4))) * 0.08 + (Math.sin(time * Math.PI * 2 * 5.2) > 0.97 ? 0.13 : 0); break;
      case 'tug': value = Math.sin(time * Math.PI * 2 * (88 + 9 * Math.sin(time * 1.8))) * 0.12 + noise[index] * 0.05; break;
      case 'vehicle': value = Math.sin(time * Math.PI * 2 * 71) * 0.1 + noise[index] * 0.065 + (Math.sin(time * Math.PI * 2 * 4.1) > 0.985 ? 0.09 : 0); break;
      case 'spray': value = (random() * 2 - 1) * 0.12 + noise[index] * 0.14; break;
      case 'gust': value = noise[index] * Math.sin(Math.PI * progress) * 0.3; break;
      case 'thunder': value = noise[index] * Math.exp(-time * 0.5) * 0.32 + Math.sin(time * Math.PI * 2 * 36) * Math.exp(-time * 0.7) * 0.2; break;
      case 'voice-low':
      case 'voice-high':
      case 'voice-mid':
      case 'voice-soft': {
        const baseByVoice = { 'voice-low': 92, 'voice-mid': 110, 'voice-high': 128, 'voice-soft': 146 };
        const base = baseByVoice[specification.synthesis];
        const syllable = Math.floor(time * 4.6);
        const gate = Math.sin(Math.PI * ((time * 4.6) % 1)) ** 0.55;
        const pitch = base + (syllable % 5) * 7 + Math.sin(time * 9) * 2.5;
        const radioNoise = (random() * 2 - 1) * 0.032;
        value = gate * (
          Math.sin(time * Math.PI * 2 * pitch) * 0.13
          + Math.sin(time * Math.PI * 2 * pitch * 2.37) * 0.07
          + Math.sin(time * Math.PI * 2 * (640 + syllable * 41 % 530)) * 0.035
        ) + radioNoise;
        break;
      }
    }
    samples[index] = Math.max(-1, Math.min(1, value * fade * pulse));
  }
  return samples;
}

function encodeWav(samples) {
  const byteLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + byteLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + byteLength, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(byteLength, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(Math.round(samples[index] * 32_767), 44 + index * 2);
  }
  return buffer;
}

await mkdir(OUTPUT_ROOT, { recursive: true });
const assets = [];
for (const specification of specifications) {
  const relativePath = `audio/library/${specification.id}.wav`;
  const outputPath = join('public', relativePath);
  await mkdir(dirname(outputPath), { recursive: true });
  const bytes = encodeWav(synthesize(specification));
  await writeFile(outputPath, bytes);
  assets.push({
    id: specification.id,
    family: specification.family,
    channel: specification.channel,
    path: relativePath,
    durationSeconds: specification.duration,
    sampleRate: SAMPLE_RATE,
    channels: 1,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    triggers: specification.triggers,
    states: specification.states ?? [],
    station: specification.station,
    speaker: specification.speaker,
    captionTemplate: specification.captionTemplate,
    source: 'Project-original deterministic synthesis rendered to PCM WAV during development.',
    license: 'CC0-1.0',
  });
}

const manifest = {
  schemaVersion: 2,
  name: 'Airport Auto offline sound library',
  updated: '2026-08-10',
  license: 'CC0-1.0 for project-original generated WAV assets; source code remains under the project license.',
  networkAudio: false,
  runtimeVoiceGeneration: false,
  microphoneAccess: false,
  syntheticDisclosure: 'All included WAV files are project-original deterministic DSP renders. Radio clips use abstract formant-like synthetic voices and are fictional, captioned, and not suitable for navigation.',
  sampleRate: SAMPLE_RATE,
  assets,
};
await writeFile('public/audio/soundscape-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ assets: assets.length, bytes: assets.reduce((total, asset) => total + Math.round((asset.durationSeconds * SAMPLE_RATE * 2) + 44), 0), radioClips: assets.filter((asset) => asset.family === 'radio').length }));

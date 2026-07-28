import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('public/audio/soundscape-manifest.json', 'utf8'));
if (manifest.schemaVersion !== 2) throw new Error('offline sound manifest must use schema 2');
if (manifest.networkAudio !== false || manifest.runtimeVoiceGeneration !== false || manifest.microphoneAccess !== false) {
  throw new Error('offline sound library attempted to enable a network/runtime capture dependency');
}
if (!manifest.syntheticDisclosure?.includes('fictional') || !manifest.syntheticDisclosure?.includes('not suitable for navigation')) {
  throw new Error('synthetic fictional radio disclosure is incomplete');
}

const requiredStates = new Set(['moving', 'gate-active', 'service-active', 'always', 'wind', 'rain', 'snow', 'low-visibility']);
const requiredTriggers = new Set([
  'taxi-whine',
  'takeoff-power',
  'reverse-thrust',
  'runway-rumble',
  'touchdown',
  'flap',
  'gear',
  'pushback',
  'tug-movement',
  'service-vehicle',
  'deicing-spray',
  'weather-gust',
  'thunder',
]);
const stations = new Set();
const speakers = new Set();
const ids = new Set();
let bytesTotal = 0;
let durationTotal = 0;

for (const asset of manifest.assets) {
  if (ids.has(asset.id)) throw new Error(`duplicate sound asset ${asset.id}`);
  ids.add(asset.id);
  if (asset.license !== 'CC0-1.0' || !asset.source?.startsWith('Project-original')) {
    throw new Error(`${asset.id} is missing project-original CC0 provenance`);
  }
  if (asset.path.startsWith('/') || asset.path.includes('..') || asset.path.includes('\\')) {
    throw new Error(`${asset.id} path is not deployment-relative`);
  }
  const bytes = await readFile(`public/${asset.path}`);
  bytesTotal += bytes.length;
  durationTotal += asset.durationSeconds;
  if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF' || bytes.subarray(8, 12).toString('ascii') !== 'WAVE') {
    throw new Error(`${asset.id} is not a PCM WAV file`);
  }
  if (bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== asset.channels || bytes.readUInt32LE(24) !== asset.sampleRate) {
    throw new Error(`${asset.id} WAV metadata drifted from the manifest`);
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== asset.sha256) throw new Error(`${asset.id} hash mismatch`);
  const observedDuration = bytes.readUInt32LE(40) / (asset.sampleRate * asset.channels * 2);
  if (Math.abs(observedDuration - asset.durationSeconds) > 0.01) throw new Error(`${asset.id} duration mismatch`);
  for (const state of asset.states) requiredStates.delete(state);
  for (const trigger of asset.triggers) requiredTriggers.delete(trigger);
  if (asset.family === 'radio') {
    if (!asset.captionTemplate?.includes('{callsign}')) throw new Error(`${asset.id} lacks a callsign-safe caption template`);
    stations.add(asset.station);
    speakers.add(asset.speaker);
  }
}

if (requiredStates.size) throw new Error(`missing offline beds: ${[...requiredStates].join(', ')}`);
if (requiredTriggers.size) throw new Error(`missing detailed event recordings: ${[...requiredTriggers].join(', ')}`);
if (stations.size < 4 || speakers.size < 8) throw new Error('offline fictional radio library lacks station or voice variety');
if (manifest.assets.filter((asset) => asset.family === 'radio').length < 20) throw new Error('offline fictional radio library is too small');
if (bytesTotal > 8 * 1024 * 1024) throw new Error(`offline sound library exceeds the 8 MiB shipping budget (${bytesTotal})`);

console.log(JSON.stringify({
  schemaVersion: manifest.schemaVersion,
  assets: manifest.assets.length,
  beds: manifest.assets.filter((asset) => asset.family === 'bed').length,
  eventClips: manifest.assets.filter((asset) => asset.family === 'event').length,
  radioClips: manifest.assets.filter((asset) => asset.family === 'radio').length,
  speakers: speakers.size,
  stations: stations.size,
  durationMinutes: Number((durationTotal / 60).toFixed(2)),
  bytes: bytesTotal,
}));

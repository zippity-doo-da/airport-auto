import type { AirportState } from '../simulation/types';
import type { SoundscapeChannel, SoundscapeEvent } from './soundscapeEvents';

export interface OfflineSoundAsset {
  id: string;
  family: 'bed' | 'event' | 'radio';
  channel: SoundscapeChannel;
  path: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  sha256: string;
  triggers: string[];
  states: string[];
  station?: SoundscapeEvent['station'];
  speaker?: string;
  captionTemplate?: string;
  source: string;
  license: string;
}

export interface OfflineSoundManifest {
  schemaVersion: 2;
  name: string;
  updated: string;
  license: string;
  networkAudio: false;
  runtimeVoiceGeneration: false;
  microphoneAccess: false;
  syntheticDisclosure: string;
  sampleRate: number;
  assets: OfflineSoundAsset[];
}

export interface OfflineSoundLibrarySnapshot {
  schemaVersion: 1;
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  manifestSchemaVersion: number | null;
  decodedAssets: number;
  totalAssets: number;
  activeBeds: number;
  playedClips: number;
  fallbackClips: number;
  lastError: string | null;
  syntheticVoicesDisclosed: boolean;
}

interface BedVoice {
  asset: OfflineSoundAsset;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

function isManifest(input: unknown): input is OfflineSoundManifest {
  if (!input || typeof input !== 'object') return false;
  const value = input as Partial<OfflineSoundManifest>;
  return value.schemaVersion === 2
    && value.networkAudio === false
    && value.runtimeVoiceGeneration === false
    && value.microphoneAccess === false
    && typeof value.syntheticDisclosure === 'string'
    && Array.isArray(value.assets)
    && value.assets.every((asset) => (
      Boolean(asset)
      && typeof asset.id === 'string'
      && (asset.family === 'bed' || asset.family === 'event' || asset.family === 'radio')
      && typeof asset.path === 'string'
      && !asset.path.startsWith('/')
      && !asset.path.includes('..')
      && Array.isArray(asset.triggers)
      && Array.isArray(asset.states)
      && asset.license === 'CC0-1.0'
    ));
}

/**
 * Local-only PCM library layered beneath the procedural fallback. Files are
 * fetched from the same application origin after the user enables audio.
 */
export class OfflineSoundLibrary {
  private status: OfflineSoundLibrarySnapshot['status'] = 'idle';
  private manifest: OfflineSoundManifest | null = null;
  private manifestUrl: URL | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly beds = new Map<string, BedVoice>();
  private readonly lastAssetByTrigger = new Map<string, string>();
  private playedClips = 0;
  private fallbackClips = 0;
  private lastError: string | null = null;

  constructor(
    private readonly context: AudioContext,
    private readonly destinations: Partial<Record<SoundscapeChannel, AudioNode>>,
  ) {}

  async load(manifestUrl: string): Promise<boolean> {
    if (this.status === 'loading' || this.status === 'ready') return this.status === 'ready';
    this.status = 'loading';
    this.lastError = null;
    try {
      this.manifestUrl = new URL(manifestUrl, document.baseURI);
      const response = await fetch(this.manifestUrl, { cache: 'force-cache', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`sound manifest returned ${response.status}`);
      const input: unknown = await response.json();
      if (!isManifest(input)) throw new Error('sound manifest schema or offline policy is invalid');
      this.manifest = input;
      for (let offset = 0; offset < input.assets.length; offset += 6) {
        await Promise.all(input.assets.slice(offset, offset + 6).map((asset) => this.loadAsset(asset)));
      }
      this.createBeds();
      this.status = 'ready';
      return true;
    } catch (error) {
      this.status = 'unavailable';
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  updateEnvironment(state: AirportState): void {
    if (this.status !== 'ready') return;
    const weatherOn = state.weather.weatherEnabled;
    const moving = state.flights.filter((flight) => flight.phase !== 'resting').length;
    const gateActive = state.flights.filter((flight) => flight.phase === 'resting' || flight.tugAttached).length;
    const serviceActive = state.serviceVehicles.filter((vehicle) => vehicle.status !== 'complete').length;
    const lowVisibility = weatherOn ? Math.max(0, Math.min(1, (6 - state.weather.visibility) / 5)) : 0;
    const targets: Record<string, number> = {
      always: state.mode === 'watch' ? 0.045 : 0.035,
      moving: Math.min(0.11, moving * 0.006),
      'gate-active': Math.min(0.09, gateActive * 0.0045),
      'service-active': Math.min(0.085, serviceActive * 0.006),
      wind: weatherOn && state.weather.windEnabled ? Math.min(0.12, state.weather.windSpeed / 240) : 0,
      rain: weatherOn && state.weather.precipitation === 'rain' ? 0.055 + state.weather.intensity * 0.08 : 0,
      snow: weatherOn && state.weather.precipitation === 'snow' ? 0.035 + state.weather.intensity * 0.05 : 0,
      'low-visibility': lowVisibility * 0.065,
    };
    const now = this.context.currentTime;
    for (const voice of this.beds.values()) {
      const target = Math.max(...voice.asset.states.map((stateName) => targets[stateName] ?? 0), 0);
      voice.gain.gain.setTargetAtTime(target, now, 1.4);
    }
  }

  play(event: SoundscapeEvent, start: number, pan: number, gainScale: number): boolean {
    if (this.status !== 'ready' || !this.manifest) {
      this.fallbackClips += 1;
      return false;
    }
    let candidates = this.manifest.assets.filter((asset) => (
      asset.family !== 'bed'
      && asset.channel === event.channel
      && asset.triggers.includes(event.kind)
      && this.buffers.has(asset.id)
    ));
    if (event.channel === 'radio' && event.station) {
      const stationCandidates = candidates.filter((asset) => asset.station === event.station);
      if (stationCandidates.length) candidates = stationCandidates;
    }
    if (!candidates.length) {
      this.fallbackClips += 1;
      return false;
    }
    const trigger = `${event.channel}:${event.kind}:${event.station ?? 'any'}`;
    let index = Math.abs(event.variant) % candidates.length;
    const previous = this.lastAssetByTrigger.get(trigger);
    if (candidates.length > 1 && candidates[index].id === previous) index = (index + 1) % candidates.length;
    const asset = candidates[index];
    const buffer = this.buffers.get(asset.id);
    const destination = this.destinations[asset.channel];
    if (!buffer || !destination) {
      this.fallbackClips += 1;
      return false;
    }
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    source.buffer = buffer;
    panner.pan.value = pan;
    const peak = (asset.family === 'radio' ? 0.18 : 0.13) * gainScale;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.05);
    gain.gain.setTargetAtTime(0.0001, start + Math.max(0.12, buffer.duration - 0.16), 0.055);
    source.connect(gain).connect(panner).connect(destination);
    source.start(start);
    source.addEventListener('ended', () => {
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    }, { once: true });
    this.lastAssetByTrigger.set(trigger, asset.id);
    this.playedClips += 1;
    return true;
  }

  snapshot(): OfflineSoundLibrarySnapshot {
    return {
      schemaVersion: 1,
      status: this.status,
      manifestSchemaVersion: this.manifest?.schemaVersion ?? null,
      decodedAssets: this.buffers.size,
      totalAssets: this.manifest?.assets.length ?? 0,
      activeBeds: this.beds.size,
      playedClips: this.playedClips,
      fallbackClips: this.fallbackClips,
      lastError: this.lastError,
      syntheticVoicesDisclosed: Boolean(this.manifest?.syntheticDisclosure),
    };
  }

  dispose(): void {
    for (const voice of this.beds.values()) {
      voice.source.stop();
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    this.beds.clear();
    this.buffers.clear();
  }

  private async loadAsset(asset: OfflineSoundAsset): Promise<void> {
    if (!this.manifestUrl) return;
    const applicationRoot = new URL('../', this.manifestUrl);
    const assetUrl = new URL(asset.path, applicationRoot);
    if (assetUrl.origin !== this.manifestUrl.origin) throw new Error(`${asset.id} leaves the application origin`);
    const response = await fetch(assetUrl, { cache: 'force-cache', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`${asset.id} returned ${response.status}`);
    const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
    if (
      buffer.numberOfChannels !== asset.channels
      || Math.abs(buffer.duration - asset.durationSeconds) > 0.03
    ) {
      throw new Error(`${asset.id} PCM metadata disagrees with its manifest`);
    }
    this.buffers.set(asset.id, buffer);
  }

  private createBeds(): void {
    if (!this.manifest) return;
    for (const asset of this.manifest.assets.filter((candidate) => candidate.family === 'bed')) {
      const buffer = this.buffers.get(asset.id);
      const destination = this.destinations[asset.channel];
      if (!buffer || !destination) continue;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0.0001;
      source.connect(gain).connect(destination);
      source.start(0, (asset.id.length * 0.37) % Math.max(0.1, buffer.duration - 0.1));
      this.beds.set(asset.id, { asset, source, gain });
    }
  }
}

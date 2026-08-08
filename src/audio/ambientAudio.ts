import type { AirportState } from "../simulation/types";
import { airportAutoAssetPath } from "../assets/assetManifest";
import type { SoundscapeChannel, SoundscapeEvent } from "./soundscapeEvents";
import {
  OfflineSoundLibrary,
  type OfflineSoundLibrarySnapshot,
} from "./offlineSoundLibrary";
import {
  SpatialAircraftAudio,
  type SoundscapeListenerView,
  type SpatialAircraftAudioSnapshot,
} from "./spatialAircraftAudio";

export const AUDIO_PRESET_IDS = [
  "full",
  "calm",
  "radio",
  "engines",
  "sleep",
  "silent",
] as const;
export type AudioPreset = (typeof AUDIO_PRESET_IDS)[number];
export type AudioChannel = SoundscapeChannel;
export const AUDIO_CHANNELS = [
  "ambience",
  "aircraft",
  "weather",
  "terminal",
  "radio",
  "ui",
] as const satisfies readonly AudioChannel[];

export interface PresentationAudioVisibility {
  serviceVehicles: boolean;
  airportLife: boolean;
}

export function isPresentationAudioEventEnabled(
  event: Pick<SoundscapeEvent, "kind">,
  visibility: PresentationAudioVisibility,
): boolean {
  if (
    (event.kind === "service-vehicle" || event.kind === "ramp-clatter") &&
    !visibility.serviceVehicles
  )
    return false;
  return true;
}

export interface AmbientAudioSnapshot {
  schemaVersion: 1;
  enabled: boolean;
  contextState: AudioContextState | "not-created";
  preset: AudioPreset;
  levels: Record<AudioChannel, number>;
  radioEnabled: boolean;
  captionsEnabled: boolean;
  presentationAudio: PresentationAudioVisibility;
  environment: {
    wind: number;
    rain: number;
    snow: number;
    lowVisibility: number;
    field: number;
    room: number;
    ramp: number;
    apu: number;
  };
  spatialAircraft: SpatialAircraftAudioSnapshot;
  offlineLibrary: OfflineSoundLibrarySnapshot;
  playedEvents: number;
  suppressedEvents: number;
}

const EMPTY_SPATIAL_SNAPSHOT: SpatialAircraftAudioSnapshot = {
  activeVoices: 0,
  maximumVoices: 14,
  audibleFlightIds: [],
  pooledNoiseBuffer: false,
  pooledEmitters: 0,
  emitterPoolCapacity: 14,
};

const EMPTY_OFFLINE_LIBRARY_SNAPSHOT: OfflineSoundLibrarySnapshot = {
  schemaVersion: 1,
  status: "idle",
  manifestSchemaVersion: null,
  decodedAssets: 0,
  totalAssets: 0,
  activeBeds: 0,
  playedClips: 0,
  fallbackClips: 0,
  lastError: null,
  syntheticVoicesDisclosed: false,
};

/**
 * Pure mix definitions shared by the runtime and validation. Sleep is a
 * genuinely low-interruption background mix: radio and UI are silent.
 */
export const AUDIO_PRESET_MIX: Readonly<
  Record<AudioPreset, Readonly<Record<AudioChannel, number>>>
> = {
  full: {
    ambience: 1,
    aircraft: 1,
    weather: 1,
    terminal: 1,
    radio: 0.72,
    ui: 0.72,
  },
  calm: {
    ambience: 0.74,
    aircraft: 0.56,
    weather: 0.68,
    terminal: 0.52,
    radio: 0.24,
    ui: 0.16,
  },
  radio: {
    ambience: 0.16,
    aircraft: 0.24,
    weather: 0.2,
    terminal: 0.12,
    radio: 1,
    ui: 0.3,
  },
  engines: {
    ambience: 0,
    aircraft: 1,
    weather: 0,
    terminal: 0,
    radio: 0,
    ui: 0,
  },
  sleep: {
    ambience: 0.18,
    aircraft: 0.08,
    weather: 0.16,
    terminal: 0.12,
    radio: 0,
    ui: 0,
  },
  silent: {
    ambience: 0,
    aircraft: 0,
    weather: 0,
    terminal: 0,
    radio: 0,
    ui: 0,
  },
};

export class AmbientAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<AudioChannel, GainNode>> = {};
  private spatialAircraft: SpatialAircraftAudio | null = null;
  private offlineLibrary: OfflineSoundLibrary | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private windGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private snowGain: GainNode | null = null;
  private fieldGain: GainNode | null = null;
  private roomGain: GainNode | null = null;
  private rampGain: GainNode | null = null;
  private apuGain: GainNode | null = null;
  private enabled = false;
  private preset: AudioPreset = "full";
  private radioEnabled = true;
  private captionsEnabled = true;
  private readonly presentationAudio: PresentationAudioVisibility = {
    serviceVehicles: true,
    airportLife: false,
  };
  private playedEvents = 0;
  private suppressedEvents = 0;
  private lastView: SoundscapeListenerView = {
    x: 0,
    y: 0,
    orbitRadians: 0,
    zoom: 1,
  };
  private readonly environment = {
    wind: 0,
    rain: 0,
    snow: 0,
    lowVisibility: 0,
    field: 0,
    room: 0,
    ramp: 0,
    apu: 0,
  };
  private readonly levels: Record<AudioChannel, number> = {
    ambience: 1,
    aircraft: 1,
    weather: 1,
    terminal: 1,
    radio: 1,
    ui: 0.7,
  };

  get isEnabled(): boolean {
    return this.enabled;
  }

  async toggle(): Promise<boolean> {
    if (!this.context) this.create();
    if (!this.context || !this.master) return false;
    await this.context.resume();
    this.enabled = !this.enabled;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(
      this.enabled ? this.masterLevel() : 0.0001,
      now,
      0.42,
    );
    return this.enabled;
  }

  setPreset(preset: AudioPreset): void {
    this.preset = preset;
    this.updateMix();
  }

  setLevel(channel: AudioChannel, value: number): void {
    this.levels[channel] = Math.max(0, Math.min(1, value));
    this.updateMix();
  }

  setRadioEnabled(enabled: boolean): void {
    this.radioEnabled = enabled;
  }

  setServiceVehicleAudioEnabled(enabled: boolean): void {
    this.presentationAudio.serviceVehicles = enabled;
  }

  /**
   * Terminal-room and parked-aircraft APU beds are presentation ambience, not
   * operational alerts. Keep them bound to the same airport-life switch as
   * the gate/landside visuals without muting independently enabled vehicles.
   */
  setAirportLifeAudioEnabled(enabled: boolean): void {
    this.presentationAudio.airportLife = enabled;
  }

  setCaptionsEnabled(enabled: boolean): void {
    this.captionsEnabled = enabled;
  }

  setEnvironment(
    state: AirportState,
    view: SoundscapeListenerView = this.lastView,
  ): void {
    this.lastView = { ...view };
    const weatherOn = state.weather.weatherEnabled;
    const windOn = weatherOn && state.weather.windEnabled;
    const moving = state.flights.filter(
      (flight) => flight.phase !== "resting",
    ).length;
    const rampVehicles = state.serviceVehicles.filter(
      (vehicle) => vehicle.status !== "complete",
    ).length;
    const gateActivity = state.flights.filter(
      (flight) => flight.phase === "resting" || flight.tugAttached,
    ).length;

    this.environment.wind = windOn
      ? 0.008 + (state.weather.windSpeed / 40) * 0.048
      : 0;
    this.environment.rain = weatherOn && state.weather.precipitation === "rain"
      ? 0.026 + state.weather.intensity * 0.05
      : 0;
    this.environment.snow = weatherOn && state.weather.precipitation === "snow"
      ? 0.008 + state.weather.intensity * 0.018
      : 0;
    this.environment.lowVisibility = weatherOn
      ? Math.max(0, Math.min(1, (6 - state.weather.visibility) / 5))
      : 0;
    this.environment.field = Math.min(0.026, 0.009 + moving * 0.00075)
      * (1 - this.environment.lowVisibility * 0.32);
    this.environment.room = this.presentationAudio.airportLife
      ? (state.mode === "watch" ? 0.01 : 0.014) + this.environment.lowVisibility * 0.005
      : 0;
    this.environment.ramp = this.presentationAudio.serviceVehicles
      ? Math.min(0.024, rampVehicles * 0.0018)
      : 0;
    this.environment.apu = this.presentationAudio.airportLife
      ? Math.min(0.018, gateActivity * 0.0014)
      : 0;

    if (
      !this.context ||
      !this.windGain ||
      !this.rainGain ||
      !this.snowGain ||
      !this.fieldGain ||
      !this.roomGain ||
      !this.rampGain ||
      !this.apuGain
    ) {
      return;
    }
    const now = this.context.currentTime;

    this.windGain.gain.setTargetAtTime(this.environment.wind, now, 0.9);
    this.rainGain.gain.setTargetAtTime(this.environment.rain, now, 0.68);
    this.snowGain.gain.setTargetAtTime(this.environment.snow, now, 1.2);
    this.fieldGain.gain.setTargetAtTime(this.environment.field, now, 1.8);
    this.roomGain.gain.setTargetAtTime(this.environment.room, now, 2.4);
    this.rampGain.gain.setTargetAtTime(this.environment.ramp, now, 1.1);
    this.apuGain.gain.setTargetAtTime(this.environment.apu, now, 1.4);
    this.spatialAircraft?.update(
      state,
      view,
      this.enabled && this.preset !== "silent",
    );
    this.offlineLibrary?.updateEnvironment(state);
  }

  play(event: SoundscapeEvent, delaySeconds = 0): void {
    if (!this.context || !this.master || !this.enabled) {
      this.suppressedEvents += 1;
      return;
    }
    if (event.channel === "radio" && !this.radioEnabled) {
      this.suppressedEvents += 1;
      return;
    }
    if (!isPresentationAudioEventEnabled(event, this.presentationAudio)) {
      this.suppressedEvents += 1;
      return;
    }
    if (this.preset === "sleep" && event.priority !== "ambient") {
      this.suppressedEvents += 1;
      return;
    }
    if (AUDIO_PRESET_MIX[this.preset][event.channel] <= 0) {
      this.suppressedEvents += 1;
      return;
    }
    const now = this.context.currentTime + Math.max(0, delaySeconds);
    const pan = this.eventPan(event);
    const calm = this.preset === "calm" ? 0.62 : 1;
    const offlinePlayed = this.offlineLibrary?.play(
      event,
      now,
      pan,
      event.priority === "critical" ? 1 : calm,
    ) ?? false;
    const cueScale = calm * (offlinePlayed ? 0.26 : 1);
    switch (event.kind) {
      case "scope-entry":
      case "radio-clearance":
      case "radio-ground":
      case "radio-handoff":
      case "radio-emergency":
        this.radioCue(
          now,
          pan,
          (event.priority === "critical" ? 1 : calm) * (offlinePlayed ? 0.34 : 1),
        );
        break;
      case "touchdown":
        this.noiseBurst("aircraft", now, 0.34, 0.028 * cueScale, 1_150, pan);
        this.tone(
          "aircraft",
          now,
          0.24,
          720 + event.variant * 45,
          390,
          0.009 * cueScale,
          pan,
        );
        break;
      case "reverse-thrust":
        this.noiseBurst("aircraft", now, 1.25, 0.03 * cueScale, 260, pan);
        this.tone("aircraft", now, 1.1, 78, 132, 0.012 * cueScale, pan);
        break;
      case "takeoff-power":
        this.tone(
          "aircraft",
          now,
          1.8,
          58 + event.variant * 5,
          128,
          0.018 * cueScale,
          pan,
        );
        this.noiseBurst("aircraft", now, 1.7, 0.021 * cueScale, 420, pan);
        break;
      case "taxi-whine":
        this.tone("aircraft", now, 1.2, 360, 520, 0.006 * cueScale, pan);
        break;
      case "runway-rumble":
        this.noiseBurst("aircraft", now, 1.6, 0.018 * cueScale, 180, pan);
        break;
      case "flap":
        this.tone("aircraft", now, 0.74, 188, 132, 0.006 * cueScale, pan);
        break;
      case "engine-start":
        this.tone(
          "aircraft",
          now,
          1.45,
          34,
          112 + event.variant * 8,
          0.014 * cueScale,
          pan,
        );
        break;
      case "pushback":
      case "tug-movement":
        this.tone("aircraft", now, 0.48, 126, 92, 0.008 * cueScale, pan);
        break;
      case "service-vehicle":
      case "ramp-clatter":
        this.metallicClatter(
          "terminal",
          now,
          pan,
          event.variant,
          0.72 * cueScale,
        );
        break;
      case "deicing-spray":
        this.noiseBurst("weather", now, 1.5, 0.022 * cueScale, 1_050, pan);
        break;
      case "gear":
        this.tone("aircraft", now, 0.68, 164, 118, 0.008 * cueScale, pan);
        this.metallicClatter(
          "aircraft",
          now + 0.16,
          pan,
          event.variant,
          0.45 * cueScale,
        );
        break;
      case "weather-shift":
        this.noiseBurst("weather", now, 1.2, 0.012 * cueScale, 750, 0);
        break;
      case "weather-gust":
        this.noiseBurst("weather", now, 2.1, 0.024 * cueScale, 380, 0);
        break;
      case "thunder":
        this.noiseBurst("weather", now, 3.8, 0.052 * cueScale, 145, pan);
        this.tone("weather", now + 0.18, 2.8, 44, 31, 0.025 * cueScale, pan);
        break;
    }
    this.playedEvents += 1;
  }

  chime(): void {
    if (!this.context || !this.master || !this.enabled) return;
    const now = this.context.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      this.tone("ui", now + index * 0.18, 2.4, frequency, frequency, 0.018, 0);
    });
  }

  snapshot(): AmbientAudioSnapshot {
    return {
      schemaVersion: 1,
      enabled: this.enabled,
      contextState: this.context?.state ?? "not-created",
      preset: this.preset,
      levels: { ...this.levels },
      radioEnabled: this.radioEnabled,
      captionsEnabled: this.captionsEnabled,
      presentationAudio: { ...this.presentationAudio },
      environment: { ...this.environment },
      spatialAircraft: this.spatialAircraft?.snapshot() ?? {
        ...EMPTY_SPATIAL_SNAPSHOT,
      },
      offlineLibrary: this.offlineLibrary?.snapshot() ?? {
        ...EMPTY_OFFLINE_LIBRARY_SNAPSHOT,
      },
      playedEvents: this.playedEvents,
      suppressedEvents: this.suppressedEvents,
    };
  }

  private create(): void {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(this.context.destination);
    for (const channel of AUDIO_CHANNELS) {
      const bus = this.context.createGain();
      bus.gain.value = this.levels[channel];
      bus.connect(this.master);
      this.buses[channel] = bus;
    }
    this.noiseBuffer = this.createNoiseBuffer(9.7);
    this.createEnvironmentalBeds();
    this.spatialAircraft = new SpatialAircraftAudio(
      this.context,
      this.buses.aircraft!,
    );
    this.offlineLibrary = new OfflineSoundLibrary(this.context, this.buses);
    void this.offlineLibrary.load(
      new URL(airportAutoAssetPath("audio.soundscape-manifest"), document.baseURI)
        .href,
    );
    this.updateMix();
  }

  private createEnvironmentalBeds(): void {
    if (!this.context || !this.noiseBuffer) return;
    this.windGain = this.noiseBed("weather", "lowpass", 520, 0.72, 0.7);
    this.rainGain = this.noiseBed("weather", "highpass", 1_650, 0.84, 0.5);
    this.snowGain = this.noiseBed("weather", "bandpass", 760, 0.6, 0.42);
    this.fieldGain = this.noiseBed("ambience", "bandpass", 1_080, 0.52, 0.34);
    this.rampGain = this.noiseBed("terminal", "bandpass", 420, 0.62, 0.8);

    this.roomGain = this.context.createGain();
    this.roomGain.gain.value = 0;
    const roomLow = this.context.createOscillator();
    const roomHigh = this.context.createOscillator();
    roomLow.type = "sine";
    roomHigh.type = "sine";
    roomLow.frequency.value = 55;
    roomHigh.frequency.value = 110.3;
    roomLow.connect(this.roomGain);
    roomHigh.connect(this.roomGain);
    this.roomGain.connect(this.buses.terminal!);
    roomLow.start();
    roomHigh.start();

    this.apuGain = this.context.createGain();
    this.apuGain.gain.value = 0;
    const apu = this.context.createOscillator();
    const apuFilter = this.context.createBiquadFilter();
    apu.type = "triangle";
    apu.frequency.value = 94;
    apuFilter.type = "lowpass";
    apuFilter.frequency.value = 330;
    apu.connect(apuFilter).connect(this.apuGain).connect(this.buses.terminal!);
    apu.start();
  }

  private noiseBed(
    channel: AudioChannel,
    type: BiquadFilterType,
    frequency: number,
    q: number,
    offset: number,
  ): GainNode {
    const source = this.context!.createBufferSource();
    const filter = this.context!.createBiquadFilter();
    const gain = this.context!.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.loopStart = offset;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.buses[channel]!);
    source.start();
    return gain;
  }

  private masterLevel(): number {
    return 0.34;
  }

  private updateMix(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const channel of Object.keys(this.levels) as AudioChannel[]) {
      this.buses[channel]?.gain.setTargetAtTime(
        this.levels[channel] * AUDIO_PRESET_MIX[this.preset][channel],
        now,
        0.3,
      );
    }
  }

  private eventPan(event: SoundscapeEvent): number {
    if (!event.position) return 0;
    const dx = event.position.x - this.lastView.x;
    const dy = event.position.y - this.lastView.y;
    const cosine = Math.cos(-this.lastView.orbitRadians);
    const sine = Math.sin(-this.lastView.orbitRadians);
    const lateral = dx * cosine - dy * sine;
    const distance = Math.hypot(dx, dy, event.position.z * 0.7);
    return Math.max(-0.9, Math.min(0.9, lateral / Math.max(36, distance)));
  }

  private radioCue(now: number, pan: number, gainScale: number): void {
    this.tone("radio", now, 0.17, 860, 590, 0.012 * gainScale, pan);
    this.noiseBurst("radio", now + 0.018, 0.24, 0.009 * gainScale, 1_260, pan);
  }

  private metallicClatter(
    channel: AudioChannel,
    now: number,
    pan: number,
    variant: number,
    gainScale: number,
  ): void {
    const base = 420 + variant * 53;
    for (let index = 0; index < 3; index += 1) {
      this.tone(
        channel,
        now + index * 0.085,
        0.19,
        base + index * 117,
        base * 0.82,
        0.0045 * gainScale,
        pan,
      );
    }
  }

  private tone(
    channel: AudioChannel,
    start: number,
    duration: number,
    fromFrequency: number,
    toFrequency: number,
    peakGain: number,
    pan: number,
  ): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    oscillator.type = channel === "radio" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(Math.max(20, fromFrequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, toFrequency),
      start + duration,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, peakGain),
      start + Math.min(0.08, duration * 0.24),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    panner.pan.value = pan;
    oscillator.connect(gain).connect(panner).connect(this.buses[channel]!);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  private noiseBurst(
    channel: AudioChannel,
    start: number,
    duration: number,
    peakGain: number,
    frequency: number,
    pan: number,
  ): void {
    if (!this.context || !this.noiseBuffer) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = frequency < 500 ? "lowpass" : "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = frequency < 500 ? 0.7 : 0.95;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, peakGain),
      start + Math.min(0.18, duration * 0.26),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    panner.pan.value = pan;
    source
      .connect(filter)
      .connect(gain)
      .connect(panner)
      .connect(this.buses[channel]!);
    source.start(
      start,
      (start * 0.73) % Math.max(0.1, this.noiseBuffer.duration - 0.1),
    );
    source.stop(start + duration + 0.05);
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const length = Math.ceil(this.context!.sampleRate * seconds);
    const buffer = this.context!.createBuffer(
      1,
      length,
      this.context!.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let value = 0x6d2b79f5;
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      value += 0x6d2b79f5;
      let random = value;
      random = Math.imul(random ^ (random >>> 15), random | 1);
      random ^= random + Math.imul(random ^ (random >>> 7), random | 61);
      const white = (((random ^ (random >>> 14)) >>> 0) / 0xffffffff) * 2 - 1;
      previous = previous * 0.975 + white * 0.025;
      data[index] = previous * 2.25;
    }
    return buffer;
  }
}

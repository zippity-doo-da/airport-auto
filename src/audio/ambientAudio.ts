import type { AirportState } from "../simulation/types";
import type { SoundscapeChannel, SoundscapeEvent } from "./soundscapeEvents";
import {
  SpatialAircraftAudio,
  type SoundscapeListenerView,
  type SpatialAircraftAudioSnapshot,
} from "./spatialAircraftAudio";

export type AudioPreset = "full" | "calm" | "radio" | "engines" | "silent";
export type AudioChannel = SoundscapeChannel;

export interface AmbientAudioSnapshot {
  schemaVersion: 1;
  enabled: boolean;
  contextState: AudioContextState | "not-created";
  preset: AudioPreset;
  levels: Record<AudioChannel, number>;
  radioEnabled: boolean;
  captionsEnabled: boolean;
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

const PRESET_MIX: Record<AudioPreset, Record<AudioChannel, number>> = {
  full: { ambience: 1, aircraft: 1, weather: 1, radio: 0.72, ui: 0.72 },
  calm: {
    ambience: 0.74,
    aircraft: 0.56,
    weather: 0.68,
    radio: 0.24,
    ui: 0.16,
  },
  radio: {
    ambience: 0.16,
    aircraft: 0.24,
    weather: 0.2,
    radio: 1,
    ui: 0.3,
  },
  engines: { ambience: 0, aircraft: 1, weather: 0, radio: 0, ui: 0 },
  silent: { ambience: 0, aircraft: 0, weather: 0, radio: 0, ui: 0 },
};

export class AmbientAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<AudioChannel, GainNode>> = {};
  private spatialAircraft: SpatialAircraftAudio | null = null;
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
    this.environment.room = (state.mode === "watch" ? 0.01 : 0.014)
      + this.environment.lowVisibility * 0.005;
    this.environment.ramp = Math.min(0.024, rampVehicles * 0.0018);
    this.environment.apu = Math.min(0.018, gateActivity * 0.0014);

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
    if (PRESET_MIX[this.preset][event.channel] <= 0) {
      this.suppressedEvents += 1;
      return;
    }
    const now = this.context.currentTime + Math.max(0, delaySeconds);
    const pan = this.eventPan(event);
    const calm = this.preset === "calm" ? 0.62 : 1;
    switch (event.kind) {
      case "scope-entry":
      case "radio-clearance":
      case "radio-ground":
      case "radio-handoff":
      case "radio-emergency":
        this.radioCue(now, pan, event.priority === "critical" ? 1 : calm);
        break;
      case "touchdown":
        this.noiseBurst("aircraft", now, 0.34, 0.028 * calm, 1_150, pan);
        this.tone(
          "aircraft",
          now,
          0.24,
          720 + event.variant * 45,
          390,
          0.009 * calm,
          pan,
        );
        break;
      case "reverse-thrust":
        this.noiseBurst("aircraft", now, 1.25, 0.03 * calm, 260, pan);
        this.tone("aircraft", now, 1.1, 78, 132, 0.012 * calm, pan);
        break;
      case "takeoff-power":
        this.tone(
          "aircraft",
          now,
          1.8,
          58 + event.variant * 5,
          128,
          0.018 * calm,
          pan,
        );
        this.noiseBurst("aircraft", now, 1.7, 0.021 * calm, 420, pan);
        break;
      case "engine-start":
        this.tone(
          "aircraft",
          now,
          1.45,
          34,
          112 + event.variant * 8,
          0.014 * calm,
          pan,
        );
        break;
      case "tug-movement":
        this.tone("aircraft", now, 0.48, 126, 92, 0.008 * calm, pan);
        break;
      case "service-vehicle":
      case "ramp-clatter":
        this.metallicClatter(now, pan, event.variant, 0.72 * calm);
        break;
      case "deicing-spray":
        this.noiseBurst("weather", now, 1.5, 0.022 * calm, 1_050, pan);
        break;
      case "gear":
        this.tone("aircraft", now, 0.68, 164, 118, 0.008 * calm, pan);
        this.metallicClatter(now + 0.16, pan, event.variant, 0.45 * calm);
        break;
      case "weather-shift":
        this.noiseBurst("weather", now, 1.2, 0.012 * calm, 750, 0);
        break;
      case "weather-gust":
        this.noiseBurst("weather", now, 2.1, 0.024 * calm, 380, 0);
        break;
      case "thunder":
        this.noiseBurst("weather", now, 3.8, 0.052 * calm, 145, pan);
        this.tone("weather", now + 0.18, 2.8, 44, 31, 0.025 * calm, pan);
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
      environment: { ...this.environment },
      spatialAircraft: this.spatialAircraft?.snapshot() ?? {
        ...EMPTY_SPATIAL_SNAPSHOT,
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
    for (const channel of [
      "ambience",
      "aircraft",
      "weather",
      "radio",
      "ui",
    ] as AudioChannel[]) {
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
    this.updateMix();
  }

  private createEnvironmentalBeds(): void {
    if (!this.context || !this.noiseBuffer) return;
    this.windGain = this.noiseBed("weather", "lowpass", 520, 0.72, 0.7);
    this.rainGain = this.noiseBed("weather", "highpass", 1_650, 0.84, 0.5);
    this.snowGain = this.noiseBed("weather", "bandpass", 760, 0.6, 0.42);
    this.fieldGain = this.noiseBed("ambience", "bandpass", 1_080, 0.52, 0.34);
    this.rampGain = this.noiseBed("ambience", "bandpass", 420, 0.62, 0.8);

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
    this.roomGain.connect(this.buses.ambience!);
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
    apu.connect(apuFilter).connect(this.apuGain).connect(this.buses.ambience!);
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
        this.levels[channel] * PRESET_MIX[this.preset][channel],
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
    now: number,
    pan: number,
    variant: number,
    gainScale: number,
  ): void {
    const base = 420 + variant * 53;
    for (let index = 0; index < 3; index += 1) {
      this.tone(
        "ambience",
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

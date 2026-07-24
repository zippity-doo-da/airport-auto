import type { AirportState } from '../simulation/types';

export type AudioPreset = 'full' | 'calm' | 'radio' | 'engines' | 'silent';
export type AudioChannel = 'ambience' | 'aircraft' | 'weather' | 'radio' | 'ui';

export class AmbientAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private fieldGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private enginePan: StereoPannerNode | null = null;
  private buses: Partial<Record<AudioChannel, GainNode>> = {};
  private enabled = false;
  private preset: AudioPreset = 'full';
  private levels: Record<AudioChannel, number> = { ambience: 1, aircraft: 1, weather: 1, radio: 1, ui: 0.7 };

  get isEnabled(): boolean {
    return this.enabled;
  }

  async toggle(): Promise<boolean> {
    if (!this.context) this.create();
    if (!this.context || !this.master) return false;
    await this.context.resume();
    this.enabled = !this.enabled;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.linearRampToValueAtTime(this.enabled ? this.masterLevel() : 0, this.context.currentTime + 1.4);
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

  setEnvironment(state: AirportState): void {
    if (!this.context || !this.windGain || !this.fieldGain || !this.rainGain || !this.engineGain) return;
    const now = this.context.currentTime;
    const wind = state.weather.windEnabled ? 0.008 + state.weather.windSpeed / 40 * 0.045 : 0;
    const moving = state.flights.filter((flight) => flight.phase !== 'resting').length;
    const heavy = state.flights.filter((flight) => flight.category === 'widebody' || flight.category === 'cargo').length;
    this.windGain.gain.setTargetAtTime(wind, now, 0.9);
    this.fieldGain.gain.setTargetAtTime(0.012 + state.breeze * 0.008, now, 1.8);
    this.rainGain.gain.setTargetAtTime(
      state.weather.weatherEnabled
        ? state.weather.condition === 'rain' ? 0.052 : state.weather.condition === 'snow' ? 0.014 : 0
        : 0,
      now,
      0.7,
    );
    this.engineGain.gain.setTargetAtTime(Math.min(0.055, moving * 0.003 + heavy * 0.0035), now, 0.55);
    if (this.enginePan) {
      const audible = state.flights.filter((flight) => flight.phase !== 'resting');
      const averageX = audible.length ? audible.reduce((sum, flight) => sum + flight.motion.x, 0) / audible.length : 0;
      this.enginePan.pan.setTargetAtTime(Math.max(-0.82, Math.min(0.82, averageX / 145)), now, 0.45);
    }
  }

  chime(): void {
    if (!this.context || !this.master || !this.enabled) return;
    const now = this.context.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.035, now + index * 0.18 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4 + index * 0.18);
      oscillator.connect(gain).connect(this.buses.ui ?? this.master!);
      oscillator.start(now + index * 0.18);
      oscillator.stop(now + 2.7 + index * 0.18);
    });
  }

  radio(): void {
    if (!this.context || !this.master || !this.enabled) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(840, now);
    oscillator.frequency.exponentialRampToValueAtTime(560, now + 0.18);
    filter.type = 'bandpass';
    filter.frequency.value = 1_250;
    filter.Q.value = 2.6;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    oscillator.connect(filter).connect(gain).connect(this.buses.radio ?? this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.28);
  }

  traffic(category: 'regional' | 'narrowbody' | 'widebody' | 'cargo', phase: 'spawn' | 'land' | 'depart'): void {
    if (!this.context || !this.master || !this.enabled) return;
    const now = this.context.currentTime;
    const base = category === 'regional' ? 118 : category === 'widebody' || category === 'cargo' ? 72 : 92;
    const duration = phase === 'depart' ? 1.35 : phase === 'land' ? 0.55 : 0.8;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = phase === 'land' ? 'sine' : 'sawtooth';
    oscillator.frequency.setValueAtTime(base, now);
    oscillator.frequency.exponentialRampToValueAtTime(phase === 'depart' ? base * 1.8 : base * 0.72, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(phase === 'spawn' ? 0.012 : 0.02, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.buses.aircraft ?? this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.08);
  }

  private create(): void {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);
    for (const channel of ['ambience', 'aircraft', 'weather', 'radio', 'ui'] as AudioChannel[]) {
      const bus = this.context.createGain();
      bus.gain.value = this.levels[channel];
      bus.connect(this.master);
      this.buses[channel] = bus;
    }

    const wind = this.noise(6);
    const windFilter = this.context.createBiquadFilter();
    this.windGain = this.context.createGain();
    this.windGain.gain.value = 0;
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 520;
    windFilter.Q.value = 0.7;
    wind.connect(windFilter).connect(this.windGain).connect(this.buses.weather!);
    wind.start();

    const field = this.noise(4);
    const fieldFilter = this.context.createBiquadFilter();
    this.fieldGain = this.context.createGain();
    this.fieldGain.gain.value = 0;
    fieldFilter.type = 'bandpass';
    fieldFilter.frequency.value = 1_150;
    fieldFilter.Q.value = 0.35;
    field.connect(fieldFilter).connect(this.fieldGain).connect(this.buses.ambience!);
    field.start();

    const rain = this.noise(5);
    const rainFilter = this.context.createBiquadFilter();
    this.rainGain = this.context.createGain();
    this.rainGain.gain.value = 0;
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1_700;
    rain.connect(rainFilter).connect(this.rainGain).connect(this.buses.weather!);
    rain.start();

    const engine = this.noise(7);
    const engineFilter = this.context.createBiquadFilter();
    this.engineGain = this.context.createGain();
    this.enginePan = this.context.createStereoPanner();
    this.engineGain.gain.value = 0;
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 190;
    engineFilter.Q.value = 1.1;
    engine.connect(engineFilter).connect(this.engineGain).connect(this.enginePan).connect(this.buses.aircraft!);
    engine.start();
    this.updateMix();
  }

  private masterLevel(): number {
    return 0.34;
  }

  private updateMix(): void {
    if (!this.context) return;
    const presetMix: Record<AudioPreset, Record<AudioChannel, number>> = {
      full: { ambience: 1, aircraft: 1, weather: 1, radio: 0.72, ui: 0.72 },
      calm: { ambience: 0.72, aircraft: 0.56, weather: 0.68, radio: 0.24, ui: 0.18 },
      radio: { ambience: 0.16, aircraft: 0.24, weather: 0.2, radio: 1, ui: 0.34 },
      engines: { ambience: 0, aircraft: 1, weather: 0, radio: 0, ui: 0 },
      silent: { ambience: 0, aircraft: 0, weather: 0, radio: 0, ui: 0 },
    };
    const now = this.context.currentTime;
    for (const channel of Object.keys(this.levels) as AudioChannel[]) {
      this.buses[channel]?.gain.setTargetAtTime(this.levels[channel] * presetMix[this.preset][channel], now, 0.28);
    }
  }

  private noise(seconds: number): AudioBufferSourceNode {
    const length = this.context!.sampleRate * seconds;
    const buffer = this.context!.createBuffer(1, length, this.context!.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.985 + white * 0.015;
      data[index] = previous * 3.2;
    }
    const source = this.context!.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }
}

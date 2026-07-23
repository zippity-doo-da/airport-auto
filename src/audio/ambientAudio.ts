export class AmbientAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private enabled = false;

  get isEnabled(): boolean {
    return this.enabled;
  }

  async toggle(): Promise<boolean> {
    if (!this.context) this.create();
    if (!this.context || !this.master) return false;
    await this.context.resume();
    this.enabled = !this.enabled;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.linearRampToValueAtTime(this.enabled ? 0.34 : 0, this.context.currentTime + 1.4);
    return this.enabled;
  }

  setBreeze(value: number): void {
    if (!this.context || !this.windGain || !this.waterGain) return;
    const now = this.context.currentTime;
    this.windGain.gain.setTargetAtTime(0.025 + value * 0.025, now, 1.8);
    this.waterGain.gain.setTargetAtTime(0.018 + (1 - value) * 0.015, now, 2.2);
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
      oscillator.connect(gain).connect(this.master!);
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
    oscillator.connect(filter).connect(gain).connect(this.master);
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
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.08);
  }

  private create(): void {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);

    const wind = this.noise(6);
    const windFilter = this.context.createBiquadFilter();
    this.windGain = this.context.createGain();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 520;
    windFilter.Q.value = 0.7;
    wind.connect(windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    const water = this.noise(4);
    const waterFilter = this.context.createBiquadFilter();
    this.waterGain = this.context.createGain();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 1150;
    waterFilter.Q.value = 0.35;
    water.connect(waterFilter).connect(this.waterGain).connect(this.master);
    water.start();
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

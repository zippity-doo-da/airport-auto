import { aircraftProfile } from "../simulation/aircraftProfiles";
import type { AirportState, Flight } from "../simulation/types";

export interface SoundscapeListenerView {
  x: number;
  y: number;
  orbitRadians: number;
  zoom: number;
}

export interface SpatialAircraftAudioSnapshot {
  activeVoices: number;
  maximumVoices: number;
  audibleFlightIds: number[];
  pooledNoiseBuffer: boolean;
}

interface AircraftVoice {
  flightId: number;
  aircraft: Flight["aircraft"];
  gain: GainNode;
  panner: StereoPannerNode;
  filter: BiquadFilterNode;
  oscillators: OscillatorNode[];
  noise: AudioBufferSourceNode;
  lastDistance: number;
  lastUpdatedAt: number;
}

interface AudibleCandidate {
  flight: Flight;
  distance: number;
  lateral: number;
  power: number;
}

const MAXIMUM_FLIGHT_VOICES = 14;

function modelVariation(model: string): number {
  let hash = 0;
  for (let index = 0; index < model.length; index += 1) {
    hash = Math.imul(hash ^ model.charCodeAt(index), 16_777_619) >>> 0;
  }
  return 0.92 + (hash % 170) / 1_000;
}

function flightPower(flight: Flight): number {
  if (flight.phase === "resting" && flight.engineState !== "running") return 0;
  const speedRatio = Math.min(
    1,
    Math.max(flight.kinematics.groundSpeedKts, flight.kinematics.airspeedKts) /
      Math.max(40, aircraftProfile(flight.aircraft).rotationKts),
  );
  if (flight.phase === "takeoff") return 0.78 + speedRatio * 0.22;
  if (flight.phase === "landing") {
    return flight.motion.stage === "rollout" ? 0.78 : 0.58 + speedRatio * 0.22;
  }
  if (flight.phase === "approach") return 0.4 + speedRatio * 0.24;
  if (flight.phase === "taxi-in" || flight.phase === "taxi-out") {
    const held =
      flight.controlHold || flight.automaticHold || flight.safetyHold;
    return held ? 0.18 : 0.24 + speedRatio * 0.26;
  }
  return flight.engineState === "running" ? 0.14 : 0;
}

function voiceFrequencies(flight: Flight): [number, number] {
  const profile = aircraftProfile(flight.aircraft);
  const variation = modelVariation(flight.aircraft);
  if (profile.engineType === "piston") return [54 * variation, 108 * variation];
  if (profile.engineType === "turboprop")
    return [72 * variation, 144 * variation];
  const heavy =
    profile.wakeClass === "heavy"
      ? 0.82
      : profile.category === "regional"
        ? 1.15
        : 1;
  return [46 * variation * heavy, 92 * variation * heavy];
}

export class SpatialAircraftAudio {
  private readonly voices = new Map<number, AircraftVoice>();
  private readonly noiseBuffer: AudioBuffer;
  private audibleFlightIds: number[] = [];

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
  ) {
    this.noiseBuffer = this.createNoiseBuffer(5.2);
  }

  update(
    state: AirportState,
    view: SoundscapeListenerView,
    enabled: boolean,
  ): void {
    const now = this.context.currentTime;
    if (!enabled) {
      this.audibleFlightIds = [];
      for (const [flightId, voice] of this.voices) {
        this.stopVoice(voice, now);
        this.voices.delete(flightId);
      }
      return;
    }
    const cosine = Math.cos(-view.orbitRadians);
    const sine = Math.sin(-view.orbitRadians);
    const candidates: AudibleCandidate[] = [];
    for (const flight of state.flights) {
      const power = flightPower(flight);
      if (power <= 0) continue;
      const dx = flight.motion.x - view.x;
      const dy = flight.motion.y - view.y;
      const lateral = dx * cosine - dy * sine;
      const depth = dx * sine + dy * cosine;
      const altitudeDistance = flight.motion.z * 0.7;
      const distance = Math.hypot(lateral, depth, altitudeDistance);
      candidates.push({ flight, distance, lateral, power });
    }
    candidates.sort(
      (first, second) =>
        first.distance / Math.max(0.12, first.power) -
          second.distance / Math.max(0.12, second.power) ||
        first.flight.id - second.flight.id,
    );
    const selected = candidates.slice(0, MAXIMUM_FLIGHT_VOICES);
    const selectedIds = new Set(
      selected.map((candidate) => candidate.flight.id),
    );
    this.audibleFlightIds = selected.map((candidate) => candidate.flight.id);

    for (const candidate of selected) {
      let voice = this.voices.get(candidate.flight.id);
      if (voice && voice.aircraft !== candidate.flight.aircraft) {
        this.stopVoice(voice, now);
        this.voices.delete(candidate.flight.id);
        voice = undefined;
      }
      voice ??= this.createVoice(candidate.flight);
      this.voices.set(candidate.flight.id, voice);
      this.updateVoice(voice, candidate, view, now, enabled);
    }
    for (const [flightId, voice] of this.voices) {
      if (selectedIds.has(flightId)) continue;
      this.stopVoice(voice, now);
      this.voices.delete(flightId);
    }
  }

  snapshot(): SpatialAircraftAudioSnapshot {
    return {
      activeVoices: this.voices.size,
      maximumVoices: MAXIMUM_FLIGHT_VOICES,
      audibleFlightIds: [...this.audibleFlightIds],
      pooledNoiseBuffer: true,
    };
  }

  dispose(): void {
    const now = this.context.currentTime;
    for (const voice of this.voices.values()) {
      this.stopVoice(voice, now, 0.25);
    }
    this.voices.clear();
    this.audibleFlightIds = [];
  }

  private createVoice(flight: Flight): AircraftVoice {
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    const filter = this.context.createBiquadFilter();
    const noiseGain = this.context.createGain();
    const [fundamental, harmonic] = voiceFrequencies(flight);
    const low = this.context.createOscillator();
    const high = this.context.createOscillator();
    const noise = this.context.createBufferSource();

    gain.gain.value = 0.0001;
    filter.type = "lowpass";
    filter.frequency.value = 1_400;
    filter.Q.value = 0.65;
    low.type =
      aircraftProfile(flight.aircraft).engineType === "piston"
        ? "triangle"
        : "sine";
    high.type =
      aircraftProfile(flight.aircraft).engineType === "turboprop"
        ? "sawtooth"
        : "triangle";
    low.frequency.value = fundamental;
    high.frequency.value = harmonic;
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    noise.loopStart = (flight.id * 0.37) % 3.8;
    noiseGain.gain.value =
      aircraftProfile(flight.aircraft).engineType === "turbofan" ? 0.17 : 0.08;

    low.connect(gain);
    high.connect(gain);
    noise.connect(noiseGain).connect(gain);
    gain.connect(filter).connect(panner).connect(this.destination);
    low.start();
    high.start();
    noise.start();

    return {
      flightId: flight.id,
      aircraft: flight.aircraft,
      gain,
      panner,
      filter,
      oscillators: [low, high],
      noise,
      lastDistance: Number.NaN,
      lastUpdatedAt: this.context.currentTime,
    };
  }

  private stopVoice(
    voice: AircraftVoice,
    now: number,
    stopAfterSeconds = 1.4,
  ): void {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.12);
    for (const oscillator of voice.oscillators) {
      oscillator.stop(now + stopAfterSeconds);
    }
    voice.noise.stop(now + stopAfterSeconds);
  }

  private updateVoice(
    voice: AircraftVoice,
    candidate: AudibleCandidate,
    view: SoundscapeListenerView,
    now: number,
    enabled: boolean,
  ): void {
    const profile = aircraftProfile(candidate.flight.aircraft);
    const size = Math.min(
      1.35,
      0.72 + profile.engines * 0.12 + profile.maxTakeoffWeightT / 900,
    );
    const attenuation = 1 / (1 + Math.pow(candidate.distance / 42, 1.55));
    const zoomPresence = Math.min(
      1.15,
      Math.max(0.72, Math.sqrt(Math.max(0.1, view.zoom))),
    );
    const targetGain = enabled
      ? Math.max(
          0.0001,
          Math.min(
            0.045,
            0.036 * candidate.power * size * attenuation * zoomPresence,
          ),
        )
      : 0.0001;
    const pan = Math.max(
      -0.92,
      Math.min(
        0.92,
        candidate.lateral / Math.max(34, candidate.distance * 0.92),
      ),
    );
    const delta = Math.max(0.05, now - voice.lastUpdatedAt);
    const radialVelocity = Number.isFinite(voice.lastDistance)
      ? (voice.lastDistance - candidate.distance) / delta
      : 0;
    const restrainedDoppler =
      1 + Math.max(-0.035, Math.min(0.035, radialVelocity * 0.0022));
    const [fundamental, harmonic] = voiceFrequencies(candidate.flight);
    const powerPitch = 0.88 + candidate.power * 0.26;
    const occluded =
      candidate.flight.motion.onGround && candidate.distance > 62;
    const cutoff = occluded
      ? 520
      : profile.engineType === "turbofan"
        ? 1_350
        : 2_100;

    voice.gain.gain.setTargetAtTime(targetGain, now, 0.38);
    voice.panner.pan.setTargetAtTime(pan, now, 0.28);
    voice.filter.frequency.setTargetAtTime(
      cutoff + candidate.power * 850,
      now,
      0.42,
    );
    voice.oscillators[0].frequency.setTargetAtTime(
      fundamental * powerPitch * restrainedDoppler,
      now,
      0.3,
    );
    voice.oscillators[1].frequency.setTargetAtTime(
      harmonic * powerPitch * restrainedDoppler,
      now,
      0.3,
    );
    voice.lastDistance = candidate.distance;
    voice.lastUpdatedAt = now;
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const length = Math.ceil(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(
      1,
      length,
      this.context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let value = 0x9e3779b9;
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      const white = ((value >>> 0) / 0xffffffff) * 2 - 1;
      previous = previous * 0.94 + white * 0.06;
      data[index] = previous * 0.92;
    }
    return buffer;
  }
}

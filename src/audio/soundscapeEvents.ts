import type {
  AirportEvent,
  AirportState,
  Flight,
  FlightPhase,
} from "../simulation/types";

export const SOUNDSCAPE_EVENT_SCHEMA_VERSION = 1 as const;

export type SoundscapeChannel =
  "ambience" | "aircraft" | "weather" | "radio" | "ui";

export type SoundscapeEventKind =
  | "scope-entry"
  | "radio-clearance"
  | "radio-ground"
  | "radio-handoff"
  | "radio-emergency"
  | "touchdown"
  | "reverse-thrust"
  | "takeoff-power"
  | "engine-start"
  | "tug-movement"
  | "service-vehicle"
  | "deicing-spray"
  | "gear"
  | "ramp-clatter"
  | "weather-shift"
  | "weather-gust"
  | "thunder";

export type SoundscapeEventPriority =
  "ambient" | "operational" | "warning" | "critical";

export interface SoundscapeEvent {
  schemaVersion: typeof SOUNDSCAPE_EVENT_SCHEMA_VERSION;
  id: string;
  sequence: number;
  elapsed: number;
  kind: SoundscapeEventKind;
  channel: SoundscapeChannel;
  priority: SoundscapeEventPriority;
  variant: number;
  flightId?: number;
  callsign?: string;
  aircraft?: string;
  phase?: FlightPhase;
  position?: { x: number; y: number; z: number };
  station?: "approach" | "tower" | "ground" | "ramp";
  caption?: string;
  sourceEventType?: string;
}

export interface SoundscapeSchedulerSnapshot {
  schemaVersion: 1;
  seed: number;
  sequence: number;
  emitted: number;
  suppressed: number;
  trackedFlights: number;
  nextRampEventSeconds: number;
  nextGustEventSeconds: number;
  nextThunderEventSeconds: number;
  highStakesWeatherEnabled: boolean;
}

interface TrackedFlightSoundState {
  phase: FlightPhase;
  stage: string;
  engineState: Flight["engineState"];
  tugAttached: boolean;
  onGround: boolean;
}

interface SoundEventDraft {
  kind: SoundscapeEventKind;
  channel: SoundscapeChannel;
  priority?: SoundscapeEventPriority;
  variantCount?: number;
  flight?: Flight;
  station?: SoundscapeEvent["station"];
  caption?: string;
  sourceEventType?: string;
}

const RADIO_EVENT_TYPES = new Set([
  "spawn",
  "clear",
  "auto-clear",
  "pushback-clearance",
  "taxi-route-clearance",
  "hold-position",
  "taxi-resume",
  "hold-short",
  "runway-entry",
  "runway-crossing",
  "takeoff-clearance",
  "handoff-offer",
  "handoff-accept",
  "handoff-reject",
  "handoff-overdue",
  "contact",
  "go-around",
  "emergency",
]);

const MECHANICAL_EVENT_TYPES = new Set([
  "engine-start",
  "pushback-start",
  "tug-release",
  "service-vehicle-dispatch",
  "service-vehicle-arrive",
  "service-vehicle-return",
  "deicing-start",
]);

function hash01(seed: number, value: number): number {
  let hash = (seed ^ Math.imul(value + 1, 0x45d9f3b)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

function compactDetail(detail: string | undefined): string {
  return (detail ?? "")
    .replace(/\s*[·|]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/[,. ]+$/, "")
    .trim();
}

function radioDraft(event: AirportEvent): SoundEventDraft | null {
  const flight = event.flight;
  const detail = compactDetail(event.detail);
  switch (event.type) {
    case "spawn":
      if (flight.phase !== "approach") return null;
      return {
        kind: "scope-entry",
        channel: "radio",
        flight,
        station: "approach",
        caption: `${flight.callsign}, radar contact. Continue the arrival.`,
        sourceEventType: event.type,
      };
    case "clear":
    case "auto-clear":
      return {
        kind: "radio-clearance",
        channel: "radio",
        flight,
        station: "tower",
        caption: `${flight.callsign}, cleared to land on your assigned runway.`,
        sourceEventType: event.type,
      };
    case "pushback-clearance":
      return {
        kind: "radio-ground",
        channel: "radio",
        flight,
        station: "ramp",
        caption: `${flight.callsign}, pushback approved${detail ? `, ${detail}` : ""}.`,
        sourceEventType: event.type,
      };
    case "taxi-route-clearance":
      return {
        kind: "radio-ground",
        channel: "radio",
        flight,
        station: "ground",
        caption: `${flight.callsign}, taxi via the assigned route${detail ? `, ${detail}` : ""}.`,
        sourceEventType: event.type,
      };
    case "hold-position":
    case "hold-short":
      return {
        kind: "radio-ground",
        channel: "radio",
        flight,
        station: "ground",
        caption: `${flight.callsign}, hold ${event.type === "hold-short" ? "short of the active runway" : "position"}.`,
        sourceEventType: event.type,
      };
    case "taxi-resume":
      return {
        kind: "radio-ground",
        channel: "radio",
        flight,
        station: "ground",
        caption: `${flight.callsign}, resume taxi.`,
        sourceEventType: event.type,
      };
    case "runway-entry":
      return {
        kind: "radio-clearance",
        channel: "radio",
        flight,
        station: "tower",
        caption: `${flight.callsign}, line up and wait on your assigned runway.`,
        sourceEventType: event.type,
      };
    case "runway-crossing":
      return {
        kind: "radio-ground",
        channel: "radio",
        flight,
        station: "ground",
        caption: `${flight.callsign}, cross the assigned runway.`,
        sourceEventType: event.type,
      };
    case "takeoff-clearance":
      return {
        kind: "radio-clearance",
        channel: "radio",
        flight,
        station: "tower",
        caption: `${flight.callsign}, cleared for takeoff on your assigned runway.`,
        sourceEventType: event.type,
      };
    case "handoff-offer":
    case "handoff-accept":
    case "handoff-reject":
    case "handoff-overdue":
    case "contact":
      return {
        kind: "radio-handoff",
        channel: "radio",
        flight,
        station:
          flight.navigation.frequencyOwner === "supervisor"
            ? "approach"
            : flight.navigation.frequencyOwner,
        priority: event.type === "handoff-overdue" ? "warning" : "operational",
        caption:
          event.type === "contact"
            ? `${flight.callsign}, contact ${detail || "the next controller"}.`
            : `${flight.callsign}, ${detail || event.type.replaceAll("-", " ")}.`,
        sourceEventType: event.type,
      };
    case "go-around":
      return {
        kind: "radio-emergency",
        channel: "radio",
        flight,
        station: "tower",
        priority: "warning",
        caption: `${flight.callsign}, go around. Fly the missed approach.`,
        sourceEventType: event.type,
      };
    case "emergency":
      return {
        kind: "radio-emergency",
        channel: "radio",
        flight,
        station: "approach",
        priority: "critical",
        caption: `${flight.callsign}, emergency acknowledged. Priority handling is active.`,
        sourceEventType: event.type,
      };
    default:
      return null;
  }
}

function mechanicalDraft(event: AirportEvent): SoundEventDraft | null {
  switch (event.type) {
    case "engine-start":
      return {
        kind: "engine-start",
        channel: "aircraft",
        flight: event.flight,
        variantCount: 3,
        sourceEventType: event.type,
      };
    case "pushback-start":
    case "tug-release":
      return {
        kind: "tug-movement",
        channel: "aircraft",
        flight: event.flight,
        variantCount: 3,
        sourceEventType: event.type,
      };
    case "service-vehicle-dispatch":
    case "service-vehicle-arrive":
    case "service-vehicle-return":
      return {
        kind: "service-vehicle",
        channel: "ambience",
        flight: event.flight,
        variantCount: 4,
        sourceEventType: event.type,
      };
    case "deicing-start":
      return {
        kind: "deicing-spray",
        channel: "weather",
        flight: event.flight,
        variantCount: 3,
        sourceEventType: event.type,
      };
    default:
      return null;
  }
}

export class SoundscapeEventScheduler {
  private sequence = 0;
  private emitted = 0;
  private suppressed = 0;
  private readonly trackedFlights = new Map<number, TrackedFlightSoundState>();
  private readonly cooldowns = new Map<string, number>();
  private nextRampEventSeconds = 18;
  private nextGustEventSeconds = 24;
  private nextThunderEventSeconds = 90;
  private previousWeather = "clear";
  private highStakesWeatherEnabled = false;

  constructor(private seed: number) {
    this.reset(seed);
  }

  reset(seed: number): void {
    this.seed = seed;
    this.sequence = 0;
    this.emitted = 0;
    this.suppressed = 0;
    this.trackedFlights.clear();
    this.cooldowns.clear();
    this.nextRampEventSeconds = 14 + hash01(seed, 1) * 18;
    this.nextGustEventSeconds = 20 + hash01(seed, 2) * 20;
    this.nextThunderEventSeconds = 75 + hash01(seed, 3) * 70;
    this.previousWeather = "clear";
  }

  setHighStakesWeatherEnabled(enabled: boolean): void {
    this.highStakesWeatherEnabled = enabled;
  }

  observe(event: AirportEvent, state: AirportState): SoundscapeEvent[] {
    const result: SoundscapeEvent[] = [];
    if (RADIO_EVENT_TYPES.has(event.type)) {
      const draft = radioDraft(event);
      const emitted = draft
        ? this.emit(
            draft,
            state.elapsed,
            `radio:${event.flight.id}:${event.type}`,
            event.type === "spawn" ? 16 : 2.5,
          )
        : null;
      if (emitted) result.push(emitted);
    }
    if (MECHANICAL_EVENT_TYPES.has(event.type)) {
      const draft = mechanicalDraft(event);
      const emitted = draft
        ? this.emit(
            draft,
            state.elapsed,
            `mechanical:${event.flight.id}:${draft.kind}`,
            2,
          )
        : null;
      if (emitted) result.push(emitted);
    }
    return result;
  }

  advance(state: AirportState): SoundscapeEvent[] {
    const result: SoundscapeEvent[] = [];
    const liveIds = new Set<number>();
    for (const flight of state.flights) {
      liveIds.add(flight.id);
      const previous = this.trackedFlights.get(flight.id);
      const stage = flight.motion.stage ?? "";
      if (previous) {
        const gearTransition =
          !flight.motion.onGround &&
          flight.phase === "approach" &&
          stage === "final" &&
          previous.stage !== "final";
        if (gearTransition) {
          const event = this.emit(
            {
              kind: "gear",
              channel: "aircraft",
              flight,
              variantCount: 3,
              sourceEventType: "motion:landing-config",
            },
            state.elapsed,
            `flight:${flight.id}:gear`,
            24,
          );
          if (event) result.push(event);
        }
        const touchdownTransition =
          flight.phase === "landing" &&
          (stage === "touchdown" || stage === "rollout") &&
          previous.stage !== "touchdown" &&
          previous.stage !== "rollout";
        if (touchdownTransition) {
          const touchdown = this.emit(
            {
              kind: "touchdown",
              channel: "aircraft",
              flight,
              variantCount: 4,
              sourceEventType: "motion:touchdown",
            },
            state.elapsed,
            `flight:${flight.id}:touchdown`,
            30,
          );
          if (touchdown) result.push(touchdown);
          const reverse = this.emit(
            {
              kind: "reverse-thrust",
              channel: "aircraft",
              flight,
              variantCount: 4,
              sourceEventType: "motion:rollout",
            },
            state.elapsed + 0.7,
            `flight:${flight.id}:reverse-thrust`,
            30,
          );
          if (reverse) result.push(reverse);
        }
        const takeoffPowerTransition =
          flight.phase === "takeoff" && previous.phase === "taxi-out";
        if (takeoffPowerTransition) {
          const event = this.emit(
            {
              kind: "takeoff-power",
              channel: "aircraft",
              flight,
              variantCount: 4,
              sourceEventType: "motion:takeoff-roll",
            },
            state.elapsed,
            `flight:${flight.id}:takeoff-power`,
            30,
          );
          if (event) result.push(event);
        }
      }
      this.trackedFlights.set(flight.id, {
        phase: flight.phase,
        stage,
        engineState: flight.engineState,
        tugAttached: flight.tugAttached,
        onGround: flight.motion.onGround,
      });
    }
    for (const flightId of this.trackedFlights.keys()) {
      if (!liveIds.has(flightId)) this.trackedFlights.delete(flightId);
    }

    if (
      state.weather.weatherEnabled &&
      state.weather.condition !== this.previousWeather
    ) {
      const event = this.emit(
        {
          kind: "weather-shift",
          channel: "weather",
          variantCount: 3,
          sourceEventType: `weather:${state.weather.condition}`,
        },
        state.elapsed,
        `weather-shift:${state.weather.condition}`,
        24,
      );
      if (event) result.push(event);
    }
    this.previousWeather = state.weather.condition;

    if (state.elapsed >= this.nextRampEventSeconds) {
      const activeRamp = state.serviceVehicles.some(
        (vehicle) => vehicle.status !== "complete",
      );
      if (activeRamp) {
        const event = this.emit(
          {
            kind: "ramp-clatter",
            channel: "ambience",
            variantCount: 6,
            sourceEventType: "soundscape:ramp",
          },
          state.elapsed,
          "ambient:ramp-clatter",
          12,
        );
        if (event) result.push(event);
      }
      const density = Math.min(1, state.flights.length / 24);
      this.nextRampEventSeconds =
        state.elapsed +
        18 +
        hash01(this.seed, Math.floor(state.elapsed) + 11) * (32 - density * 12);
    }

    if (
      state.weather.weatherEnabled &&
      state.weather.windEnabled &&
      state.weather.gustSpeed - state.weather.windSpeed >= 5 &&
      state.elapsed >= this.nextGustEventSeconds
    ) {
      const event = this.emit(
        {
          kind: "weather-gust",
          channel: "weather",
          variantCount: 4,
          sourceEventType: "weather:gust",
        },
        state.elapsed,
        "weather:gust",
        14,
      );
      if (event) result.push(event);
      this.nextGustEventSeconds =
        state.elapsed +
        20 +
        hash01(this.seed, Math.floor(state.elapsed) + 23) * 35;
    }

    if (
      this.highStakesWeatherEnabled &&
      state.weather.weatherEnabled &&
      state.weather.condition === "rain" &&
      state.weather.windSpeed >= 18 &&
      state.elapsed >= this.nextThunderEventSeconds
    ) {
      const event = this.emit(
        {
          kind: "thunder",
          channel: "weather",
          priority: "warning",
          variantCount: 4,
          sourceEventType: "weather:thunder",
        },
        state.elapsed,
        "weather:thunder",
        55,
      );
      if (event) result.push(event);
      this.nextThunderEventSeconds =
        state.elapsed +
        80 +
        hash01(this.seed, Math.floor(state.elapsed) + 37) * 110;
    }

    return result;
  }

  snapshot(): SoundscapeSchedulerSnapshot {
    return {
      schemaVersion: 1,
      seed: this.seed,
      sequence: this.sequence,
      emitted: this.emitted,
      suppressed: this.suppressed,
      trackedFlights: this.trackedFlights.size,
      nextRampEventSeconds: Number(this.nextRampEventSeconds.toFixed(2)),
      nextGustEventSeconds: Number(this.nextGustEventSeconds.toFixed(2)),
      nextThunderEventSeconds: Number(this.nextThunderEventSeconds.toFixed(2)),
      highStakesWeatherEnabled: this.highStakesWeatherEnabled,
    };
  }

  private emit(
    draft: SoundEventDraft,
    elapsed: number,
    cooldownKey: string,
    cooldownSeconds: number,
  ): SoundscapeEvent | null {
    const last = this.cooldowns.get(cooldownKey) ?? Number.NEGATIVE_INFINITY;
    if (elapsed - last < cooldownSeconds) {
      this.suppressed += 1;
      return null;
    }
    this.cooldowns.set(cooldownKey, elapsed);
    const sequence = ++this.sequence;
    const variantCount = Math.max(1, draft.variantCount ?? 4);
    const flight = draft.flight;
    const event: SoundscapeEvent = {
      schemaVersion: SOUNDSCAPE_EVENT_SCHEMA_VERSION,
      id: `sound-${this.seed}-${sequence}`,
      sequence,
      elapsed: Number(elapsed.toFixed(3)),
      kind: draft.kind,
      channel: draft.channel,
      priority: draft.priority ?? "ambient",
      variant: Math.floor(hash01(this.seed, sequence * 17) * variantCount),
      flightId: flight?.id,
      callsign: flight?.callsign,
      aircraft: flight?.aircraft,
      phase: flight?.phase,
      position: flight
        ? {
            x: Number(flight.motion.x.toFixed(3)),
            y: Number(flight.motion.y.toFixed(3)),
            z: Number(flight.motion.z.toFixed(3)),
          }
        : undefined,
      station: draft.station,
      caption: draft.caption,
      sourceEventType: draft.sourceEventType,
    };
    this.emitted += 1;
    return event;
  }
}

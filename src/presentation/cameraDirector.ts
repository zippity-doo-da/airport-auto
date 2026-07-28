import type { AirportState, Flight, FlightPhase } from '../simulation/types';
import type { FocusTargetRef } from './focusTargets';

export type CameraDirectorStatus = 'off' | 'searching' | 'following' | 'yielded';
export type CameraShotFamily =
  | 'arrival-wide'
  | 'arrival-close'
  | 'runway-close'
  | 'departure-track'
  | 'surface-follow';

export interface CameraDirectorDecision {
  target: FocusTargetRef;
  flightId: number;
  callsign: string;
  reason: string;
  dwellSeconds: number;
  shotFamily: CameraShotFamily;
  focusScale: number;
}

export interface CameraDirectorSnapshot {
  schemaVersion: 1;
  enabled: boolean;
  status: CameraDirectorStatus;
  targetFlightId: number | null;
  targetCallsign: string | null;
  reason: string;
  nextTransitionInSeconds: number;
  noRepeatWindowSeconds: number;
  selections: number;
  lastShotFamily: CameraShotFamily | null;
}

/** Protects Watch from a visually obvious A → B → A camera loop. */
const NO_REPEAT_WINDOW_SECONDS = 120;

const PHASE_INTEREST: Record<FlightPhase, number> = {
  landing: 900,
  takeoff: 820,
  approach: 680,
  'taxi-out': 410,
  'taxi-in': 360,
  resting: 80,
};

/**
 * A deterministic, presentation-only observer. It never issues operational
 * commands and is deliberately disabled by the first manual camera gesture.
 */
export class CameraDirector {
  private enabled = false;
  private status: CameraDirectorStatus = 'off';
  private targetFlightId: number | null = null;
  private targetCallsign: string | null = null;
  private reason = 'Director off';
  private nextTransitionAt = 0;
  private selections = 0;
  private lastShotFamily: CameraShotFamily | null = null;
  private readonly recentTargetAt = new Map<number, number>();

  setEnabled(enabled: boolean, nowSeconds = 0): boolean {
    const changed = enabled !== this.enabled;
    this.enabled = enabled;
    if (enabled) {
      this.status = 'searching';
      this.reason = 'Looking for an active operation';
      this.nextTransitionAt = nowSeconds;
    } else {
      this.status = 'off';
      this.reason = 'Director off';
      this.targetFlightId = null;
      this.targetCallsign = null;
      this.nextTransitionAt = 0;
      this.lastShotFamily = null;
      this.recentTargetAt.clear();
    }
    return changed;
  }

  yieldToManualInput(reason = 'Manual camera input', nowSeconds = 0): boolean {
    if (!this.enabled) return false;
    this.enabled = false;
    this.status = 'yielded';
    this.reason = reason;
    this.targetFlightId = null;
    this.targetCallsign = null;
    this.nextTransitionAt = nowSeconds;
    this.lastShotFamily = null;
    this.recentTargetAt.clear();
    return true;
  }

  reset(nowSeconds = 0): void {
    this.targetFlightId = null;
    this.targetCallsign = null;
    this.nextTransitionAt = nowSeconds;
    this.status = this.enabled ? 'searching' : 'off';
    this.reason = this.enabled ? 'Looking for an active operation' : 'Director off';
  }

  update(state: AirportState, nowSeconds: number): CameraDirectorDecision | null {
    if (!this.enabled || state.paused || state.gameOver) return null;
    const current = this.targetFlightId === null
      ? null
      : state.flights.find((flight) => flight.id === this.targetFlightId) ?? null;
    const currentStillUseful = current !== null && current.phase !== 'resting';
    if (currentStillUseful && nowSeconds < this.nextTransitionAt) return null;
    if (this.targetFlightId === null && nowSeconds < this.nextTransitionAt) return null;

    const ranked = state.flights
      .filter((flight) => flight.phase !== 'resting')
      .map((flight) => ({ flight, score: interestScore(flight, state) }))
      .sort((first, second) => second.score - first.score || first.flight.id - second.flight.id);
    if (!ranked.length) {
      this.status = 'searching';
      this.reason = 'Waiting for an active operation';
      this.targetFlightId = null;
      this.targetCallsign = null;
      this.nextTransitionAt = nowSeconds + 3;
      return null;
    }

    this.pruneRecentTargets(nowSeconds);
    const alternatives = ranked.filter(({ flight }) => flight.id !== this.targetFlightId);
    const unseenAlternatives = alternatives.filter(
      ({ flight }) => !this.recentTargetAt.has(flight.id),
    );
    if (!unseenAlternatives.length && currentStillUseful) {
      const nextFreshAt = [...this.recentTargetAt.values()].reduce(
        (soonest, selectedAt) => Math.min(soonest, selectedAt + NO_REPEAT_WINDOW_SECONDS),
        Number.POSITIVE_INFINITY,
      );
      this.status = 'following';
      this.reason = `Holding ${current.callsign} to avoid a repeated camera shot`;
      this.nextTransitionAt = Math.max(nowSeconds + 3, nextFreshAt);
      return null;
    }
    const selected = (unseenAlternatives.length ? unseenAlternatives : alternatives.length ? alternatives : ranked)[0].flight;
    const shot = shotFor(selected, state, this.selections);
    const dwellSeconds = dwellFor(selected, shot.family);
    this.targetFlightId = selected.id;
    this.targetCallsign = selected.callsign;
    this.reason = `${reasonFor(selected)} · ${shot.label}`;
    this.status = 'following';
    this.nextTransitionAt = nowSeconds + dwellSeconds;
    this.recentTargetAt.set(selected.id, nowSeconds);
    this.lastShotFamily = shot.family;
    this.selections += 1;
    return {
      target: { kind: 'flight', id: String(selected.id) },
      flightId: selected.id,
      callsign: selected.callsign,
      reason: this.reason,
      dwellSeconds,
      shotFamily: shot.family,
      focusScale: shot.focusScale,
    };
  }

  snapshot(nowSeconds = 0): CameraDirectorSnapshot {
    return {
      schemaVersion: 1,
      enabled: this.enabled,
      status: this.status,
      targetFlightId: this.targetFlightId,
      targetCallsign: this.targetCallsign,
      reason: this.reason,
      nextTransitionInSeconds: this.enabled
        ? Number(Math.max(0, this.nextTransitionAt - nowSeconds).toFixed(2))
        : 0,
      noRepeatWindowSeconds: NO_REPEAT_WINDOW_SECONDS,
      selections: this.selections,
      lastShotFamily: this.lastShotFamily,
    };
  }

  private pruneRecentTargets(nowSeconds: number): void {
    for (const [flightId, selectedAt] of this.recentTargetAt) {
      if (nowSeconds - selectedAt >= NO_REPEAT_WINDOW_SECONDS)
        this.recentTargetAt.delete(flightId);
    }
  }
}

function interestScore(flight: Flight, state: AirportState): number {
  const progress = Math.max(0, Math.min(1, flight.progress));
  const activeOperation = flight.phase === 'landing' || flight.phase === 'takeoff';
  const reducedVisibility = state.weather.weatherEnabled && state.weather.visibility < 5;
  const weatherScore = !reducedVisibility
    ? 0
    : flight.phase === 'approach'
      ? -110
      : flight.phase === 'landing' || flight.phase === 'takeoff'
        ? 40
        : flight.phase === 'taxi-in' || flight.phase === 'taxi-out'
          ? 20
          : 0;
  return PHASE_INTEREST[flight.phase]
    + progress * (activeOperation ? 95 : 45)
    + (flight.goAround ? 160 : 0)
    + (flight.emergency ? 140 : 0)
    + weatherScore
    - (flight.safetyHold || flight.controlHold || flight.automaticHold ? 85 : 0);
}

function dwellFor(flight: Flight, shot: CameraShotFamily): number {
  const base = flight.phase === 'landing' || flight.phase === 'takeoff'
    ? 25
    : flight.phase === 'approach'
      ? 29
      : 21;
  return base + (flight.id % 4) * 2 + (shot === 'arrival-wide' ? 3 : 0);
}

function shotFor(
  flight: Flight,
  state: AirportState,
  selection: number,
): { family: CameraShotFamily; label: string; focusScale: number } {
  const reducedVisibility = state.weather.weatherEnabled && state.weather.visibility < 5;
  if (flight.phase === 'landing')
    return { family: 'runway-close', label: 'runway close frame', focusScale: 0.74 };
  if (flight.phase === 'takeoff')
    return { family: 'departure-track', label: 'departure track frame', focusScale: 0.88 };
  if (flight.phase === 'approach') {
    const wide = selection % 2 === 0 && !reducedVisibility;
    return wide
      ? { family: 'arrival-wide', label: 'wide arrival frame', focusScale: 1.16 }
      : { family: 'arrival-close', label: 'final approach frame', focusScale: 0.82 };
  }
  return { family: 'surface-follow', label: 'surface movement frame', focusScale: 0.9 };
}

function reasonFor(flight: Flight): string {
  if (flight.emergency) return `${flight.callsign} · emergency ${flight.phase}`;
  if (flight.goAround) return `${flight.callsign} · go-around and re-sequence`;
  if (flight.phase === 'landing') return `${flight.callsign} · landing roll`;
  if (flight.phase === 'takeoff') return `${flight.callsign} · departure roll`;
  if (flight.phase === 'approach') return `${flight.callsign} · final approach`;
  return `${flight.callsign} · ${flight.phase.replace('-', ' ')}`;
}

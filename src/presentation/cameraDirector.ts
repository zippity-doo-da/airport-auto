import type { AirportState, Flight, FlightPhase } from '../simulation/types';
import type { FocusTargetRef } from './focusTargets';

export type CameraDirectorStatus = 'off' | 'searching' | 'following' | 'yielded';

export interface CameraDirectorDecision {
  target: FocusTargetRef;
  flightId: number;
  callsign: string;
  reason: string;
  dwellSeconds: number;
}

export interface CameraDirectorSnapshot {
  schemaVersion: 1;
  enabled: boolean;
  status: CameraDirectorStatus;
  targetFlightId: number | null;
  targetCallsign: string | null;
  reason: string;
  nextTransitionInSeconds: number;
  selections: number;
}

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
      .map((flight) => ({ flight, score: interestScore(flight) }))
      .sort((first, second) => second.score - first.score || first.flight.id - second.flight.id);
    if (!ranked.length) {
      this.status = 'searching';
      this.reason = 'Waiting for an active operation';
      this.targetFlightId = null;
      this.targetCallsign = null;
      this.nextTransitionAt = nowSeconds + 3;
      return null;
    }

    const alternatives = ranked.filter(({ flight }) => flight.id !== this.targetFlightId);
    const selected = (alternatives.length ? alternatives : ranked)[0].flight;
    const dwellSeconds = dwellFor(selected);
    this.targetFlightId = selected.id;
    this.targetCallsign = selected.callsign;
    this.reason = reasonFor(selected);
    this.status = 'following';
    this.nextTransitionAt = nowSeconds + dwellSeconds;
    this.selections += 1;
    return {
      target: { kind: 'flight', id: String(selected.id) },
      flightId: selected.id,
      callsign: selected.callsign,
      reason: this.reason,
      dwellSeconds,
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
      selections: this.selections,
    };
  }
}

function interestScore(flight: Flight): number {
  const progress = Math.max(0, Math.min(1, flight.progress));
  const activeOperation = flight.phase === 'landing' || flight.phase === 'takeoff';
  return PHASE_INTEREST[flight.phase]
    + progress * (activeOperation ? 95 : 45)
    + (flight.goAround ? 160 : 0)
    + (flight.emergency ? 140 : 0)
    - (flight.safetyHold || flight.controlHold || flight.automaticHold ? 85 : 0);
}

function dwellFor(flight: Flight): number {
  const base = flight.phase === 'landing' || flight.phase === 'takeoff'
    ? 25
    : flight.phase === 'approach'
      ? 29
      : 21;
  return base + (flight.id % 4) * 2;
}

function reasonFor(flight: Flight): string {
  if (flight.emergency) return `${flight.callsign} · emergency ${flight.phase}`;
  if (flight.goAround) return `${flight.callsign} · go-around and re-sequence`;
  if (flight.phase === 'landing') return `${flight.callsign} · landing roll`;
  if (flight.phase === 'takeoff') return `${flight.callsign} · departure roll`;
  if (flight.phase === 'approach') return `${flight.callsign} · final approach`;
  return `${flight.callsign} · ${flight.phase.replace('-', ' ')}`;
}

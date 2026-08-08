import type { SurfaceReservationClaim } from "./surfaceOperations";

export interface SurfaceFlowWindow {
  direction: string;
  openedAtSeconds: number;
  releaseAtSeconds: number;
  lastServedAtSeconds: number;
}

export interface SurfaceFlowPlannerState {
  schemaVersion: 1;
  windows: Record<string, SurfaceFlowWindow>;
}

export interface SurfaceFlowDemand {
  id: string;
  label: string;
  direction: string;
  active: boolean;
  count: number;
}

export interface SurfaceFlowDecision {
  id: string;
  label: string;
  direction: string;
  releaseAtSeconds: number;
}

const MINIMUM_WINDOW_SECONDS = 60;
const MAXIMUM_STARVATION_SECONDS = 120;

/**
 * Persistent, deterministic direction windows for named shared taxiways.
 * It deliberately has no Three.js or flight dependencies: callers project
 * current occupancy and near-term demand into this narrow strategic layer.
 */
export class SurfaceFlowPlanner {
  private state: SurfaceFlowPlannerState = { schemaVersion: 1, windows: {} };

  snapshot(): SurfaceFlowPlannerState {
    return structuredClone(this.state);
  }

  restore(state: SurfaceFlowPlannerState): void {
    this.state = structuredClone(state);
  }

  reset(): void {
    this.state = { schemaVersion: 1, windows: {} };
  }

  plan(nowSeconds: number, demand: SurfaceFlowDemand[]): SurfaceFlowDecision[] {
    const grouped = new Map<string, SurfaceFlowDemand[]>();
    for (const item of demand) {
      const entries = grouped.get(item.id) ?? [];
      entries.push(item);
      grouped.set(item.id, entries);
    }
    const decisions: SurfaceFlowDecision[] = [];
    for (const [id, entries] of grouped) {
      const label = entries[0]?.label ?? id;
      const activeDirections = new Set(entries.filter((item) => item.active).map((item) => item.direction));
      const counts = new Map<string, number>();
      for (const item of entries) counts.set(item.direction, (counts.get(item.direction) ?? 0) + item.count);
      let window = this.state.windows[id];
      const orderedDirections = [...counts.entries()].sort(([firstDirection, firstCount], [secondDirection, secondCount]) =>
        secondCount - firstCount || firstDirection.localeCompare(secondDirection),
      );
      const preferred = orderedDirections[0]?.[0];
      if (!preferred) continue;
      // Current occupants always own the section. Two active directions are a
      // pre-existing physical conflict; retain the existing choice and let the
      // collision/reservation layer stop new entries rather than inventing a
      // reversal through occupied pavement.
      const activeDirection = activeDirections.size === 1 ? [...activeDirections][0] : undefined;
      if (!window) {
        const direction = activeDirection ?? preferred;
        window = { direction, openedAtSeconds: nowSeconds, releaseAtSeconds: nowSeconds + MINIMUM_WINDOW_SECONDS, lastServedAtSeconds: nowSeconds };
      } else if (activeDirection && window.direction !== activeDirection) {
        window = { direction: activeDirection, openedAtSeconds: nowSeconds, releaseAtSeconds: nowSeconds + MINIMUM_WINDOW_SECONDS, lastServedAtSeconds: nowSeconds };
      } else if (activeDirection) {
        window.lastServedAtSeconds = nowSeconds;
      } else if (window.direction !== preferred) {
        const windowExpired = nowSeconds >= window.releaseAtSeconds;
        const currentDemand = counts.get(window.direction) ?? 0;
        const starved = currentDemand === 0 && nowSeconds - window.lastServedAtSeconds >= MAXIMUM_STARVATION_SECONDS;
        if (windowExpired || starved) {
          window = { direction: preferred, openedAtSeconds: nowSeconds, releaseAtSeconds: nowSeconds + MINIMUM_WINDOW_SECONDS, lastServedAtSeconds: nowSeconds };
        }
      }
      this.state.windows[id] = window;
      decisions.push({ id, label, direction: window.direction, releaseAtSeconds: window.releaseAtSeconds });
    }
    return decisions;
  }

  static claims(decisions: SurfaceFlowDecision[]): SurfaceReservationClaim[] {
    return decisions.map((decision) => ({ kind: "taxiway-flow", id: decision.id, label: decision.label, direction: decision.direction, capacity: Infinity }));
  }

  holdReason(decision: SurfaceFlowDecision, nowSeconds: number): string {
    return `${decision.label} ${decision.direction} flow window for ${Math.max(0, Math.ceil(decision.releaseAtSeconds - nowSeconds))}s`;
  }
}

import type { SurfaceReservationClaim } from "./surfaceOperations";

export interface SurfaceFlowWindow {
  direction: string;
  openedAtSeconds: number;
  releaseAtSeconds: number;
  lastServedAtSeconds: number;
  /** Direction waiting for the current physical occupants to clear. */
  pendingDirection?: string;
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
  /** Existing occupants may leave; new entrants wait for the direction change. */
  draining: boolean;
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

  /**
   * Read one strategic window without exposing mutable planner state. Surface
   * recovery uses this only to connect a held aircraft to a *physical*
   * incumbent that is retaining the same direction; the window itself never
   * becomes a synthetic traffic owner.
   */
  currentWindow(id: string): SurfaceFlowWindow | undefined {
    const window = this.state.windows[id];
    return window ? { ...window } : undefined;
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
      let draining = false;
      if (!window) {
        const direction = activeDirection ?? preferred;
        window = { direction, openedAtSeconds: nowSeconds, releaseAtSeconds: nowSeconds + MINIMUM_WINDOW_SECONDS, lastServedAtSeconds: nowSeconds };
      } else if (activeDirection && window.direction !== activeDirection) {
        window = { direction: activeDirection, openedAtSeconds: nowSeconds, releaseAtSeconds: nowSeconds + MINIMUM_WINDOW_SECONDS, lastServedAtSeconds: nowSeconds };
      } else if (activeDirection) {
        window.lastServedAtSeconds = nowSeconds;
        const waitingDirection = [...counts.entries()]
          .filter(([direction]) => direction !== window.direction)
          .sort(([firstDirection, firstCount], [secondDirection, secondCount]) =>
            secondCount - firstCount || firstDirection.localeCompare(secondDirection),
          )[0]?.[0];
        // A window can only change after its physical occupants have cleared.
        // Once its minimum service time has elapsed, stop admitting *new*
        // current-direction traffic if the other direction is waiting. This
        // creates a bounded drain instead of permanently extending a busy
        // direction, while incumbents retain their pavement unconditionally.
        if (
          waitingDirection &&
          nowSeconds >= window.releaseAtSeconds
        ) {
          window.pendingDirection = waitingDirection;
          draining = true;
        } else if (!waitingDirection) {
          window.pendingDirection = undefined;
        }
      } else if (window.pendingDirection) {
        window = {
          direction: window.pendingDirection,
          openedAtSeconds: nowSeconds,
          releaseAtSeconds: nowSeconds + MINIMUM_WINDOW_SECONDS,
          lastServedAtSeconds: nowSeconds,
        };
      } else if (window.direction !== preferred) {
        const windowExpired = nowSeconds >= window.releaseAtSeconds;
        const currentDemand = counts.get(window.direction) ?? 0;
        const starved = currentDemand === 0 && nowSeconds - window.lastServedAtSeconds >= MAXIMUM_STARVATION_SECONDS;
        if (windowExpired || starved) {
          window = { direction: preferred, openedAtSeconds: nowSeconds, releaseAtSeconds: nowSeconds + MINIMUM_WINDOW_SECONDS, lastServedAtSeconds: nowSeconds };
        }
      }
      this.state.windows[id] = window;
      decisions.push({
        id,
        label,
        direction: window.direction,
        releaseAtSeconds: window.releaseAtSeconds,
        draining,
      });
    }
    return decisions;
  }

  static claims(decisions: SurfaceFlowDecision[]): SurfaceReservationClaim[] {
    return decisions.map((decision) => ({ kind: "taxiway-flow", id: decision.id, label: decision.label, direction: decision.direction, capacity: Infinity }));
  }

  holdReason(decision: SurfaceFlowDecision, nowSeconds: number): string {
    const remainingSeconds = Math.ceil(decision.releaseAtSeconds - nowSeconds);
    return remainingSeconds > 0
      ? `${decision.label} ${decision.direction} flow window for ${remainingSeconds}s`
      : `${decision.label} ${decision.direction} flow section occupied; release pending`;
  }

  /**
   * Auto/Watch use this before releasing a parked aircraft. Manual callers can
   * present the same reason as advice while retaining the controller's choice.
   */
  admissionReason(
    claims: readonly SurfaceReservationClaim[],
    nowSeconds: number,
    occupancyClaims: readonly SurfaceReservationClaim[] = [],
  ): string | null {
    for (const claim of claims) {
      if (claim.kind !== "taxiway-flow" || !claim.direction) continue;
      const window = this.state.windows[claim.id];
      if (!window) continue;
      if (window.direction === claim.direction) {
        const alreadyOccupiesSection = occupancyClaims.some(
          (occupancy) =>
            occupancy.kind === "taxiway-flow" && occupancy.id === claim.id,
        );
        if (
          window.pendingDirection &&
          nowSeconds >= window.releaseAtSeconds &&
          !alreadyOccupiesSection
        )
          return `${claim.label} ${window.direction} flow section draining for ${window.pendingDirection} traffic`;
        continue;
      }
      const remainingSeconds = Math.ceil(window.releaseAtSeconds - nowSeconds);
      return remainingSeconds > 0
        ? `${claim.label} ${window.direction} flow window for ${remainingSeconds}s`
        : `${claim.label} ${window.direction} flow section occupied; release pending`;
    }
    return null;
  }
}

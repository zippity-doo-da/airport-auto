import type { RuntimePerformanceSnapshot } from "../telemetry/runtimePerformance";

/**
 * Presentation-only quality governor. It deliberately receives measured frame
 * data rather than a renderer or simulation reference: changing detail can
 * never alter authoritative aircraft motion, safety reservations, or traffic.
 */
export class AdaptiveQualityGovernor {
  private degraded = false;
  private overloadedSeconds = 0;
  private recoveredSeconds = 0;

  /** Returns true only when the renderer should switch quality profiles. */
  observe(runtime: RuntimePerformanceSnapshot): boolean | null {
    const overloaded =
      runtime.frameWorkMs.samples >= 60 &&
      (runtime.frameWorkMs.p95 > 16 || runtime.frameGapMs.p95 > 24);
    const recovered =
      runtime.frameWorkMs.samples >= 180 &&
      runtime.frameWorkMs.p95 < 11 &&
      runtime.frameGapMs.p95 < 20;

    this.overloadedSeconds = overloaded ? this.overloadedSeconds + 1 : 0;
    this.recoveredSeconds = recovered ? this.recoveredSeconds + 1 : 0;

    // Require two stable observations before reducing optional presentation.
    if (!this.degraded && this.overloadedSeconds >= 2) {
      this.degraded = true;
      this.recoveredSeconds = 0;
      return true;
    }
    // Restore only after a longer calm period so the scene cannot visibly flap.
    if (this.degraded && this.recoveredSeconds >= 12) {
      this.degraded = false;
      this.overloadedSeconds = 0;
      return false;
    }
    return null;
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  reset(): void {
    this.degraded = false;
    this.overloadedSeconds = 0;
    this.recoveredSeconds = 0;
  }
}

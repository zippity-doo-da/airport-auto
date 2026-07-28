import type {
  SurfaceSafetyAdvisory,
  SurfaceSafetySnapshot,
} from "./surfaceSafety";

export type SurfaceSafetyAcknowledgementResult = {
  accepted: boolean;
  reason: string;
};

/**
 * Local acknowledgement state for a safety display. It intentionally lives
 * outside the movement simulation: acknowledgement never changes a hold,
 * reservation, alert generation, or aircraft trajectory.
 */
export class SurfaceSafetyAcknowledgements {
  private readonly acknowledgedAtSeconds = new Map<string, number>();

  reset(): void {
    this.acknowledgedAtSeconds.clear();
  }

  acknowledge(
    snapshot: SurfaceSafetySnapshot,
    advisoryId: string,
    atSeconds: number,
  ): SurfaceSafetyAcknowledgementResult {
    const advisory = snapshot.advisories.find(
      (candidate) => candidate.id === advisoryId,
    );
    if (!advisory)
      return {
        accepted: false,
        reason: "surface advisory is no longer active",
      };
    if (advisory.status !== "active" || advisory.severity === "critical") {
      return {
        accepted: false,
        reason: "critical or resolved advisories cannot be acknowledged",
      };
    }
    this.acknowledgedAtSeconds.set(advisory.id, atSeconds);
    return {
      accepted: true,
      reason:
        "acknowledgement recorded; physical protection and safety holds remain active",
    };
  }

  apply(snapshot: SurfaceSafetySnapshot): SurfaceSafetySnapshot {
    const activeIds = new Set(
      snapshot.advisories.map((advisory) => advisory.id),
    );
    for (const advisoryId of this.acknowledgedAtSeconds.keys()) {
      if (!activeIds.has(advisoryId))
        this.acknowledgedAtSeconds.delete(advisoryId);
    }
    return {
      ...snapshot,
      advisories: snapshot.advisories.map((advisory) => {
        const acknowledgedAtSeconds = this.acknowledgedAtSeconds.get(
          advisory.id,
        );
        return acknowledgedAtSeconds === undefined
          ? advisory
          : { ...advisory, acknowledgedAtSeconds };
      }),
    };
  }
}

export function isAcknowledged(advisory: SurfaceSafetyAdvisory): boolean {
  return advisory.acknowledgedAtSeconds !== undefined;
}

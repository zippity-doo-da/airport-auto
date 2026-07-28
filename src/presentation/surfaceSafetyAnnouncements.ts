import type {
  SurfaceSafetyAdvisory,
  SurfaceSafetySnapshot,
} from "../simulation/surfaceSafety";
import type { StatusMessagePriority } from "./statusMessages";

export interface SurfaceSafetyAnnouncement {
  key: string;
  label: string;
  detail: string;
  priority: StatusMessagePriority;
}

/**
 * Selects only newly-active safety advisories for the shared, dwell-based
 * status broker. It deliberately does not alter advisories, acknowledgements,
 * reservations, or aircraft state.
 */
export class SurfaceSafetyAnnouncementTracker {
  private readonly announced = new Set<string>();

  reset(): void {
    this.announced.clear();
  }

  select(snapshot: SurfaceSafetySnapshot): SurfaceSafetyAnnouncement[] {
    const active = snapshot.advisories.filter(
      (advisory) => advisory.status === "active",
    );
    const activeKeys = new Set(active.map(announcementKey));
    for (const key of this.announced) {
      if (!activeKeys.has(key)) this.announced.delete(key);
    }

    const newlyActive = active
      .filter((advisory) => !this.announced.has(announcementKey(advisory)))
      .sort(
        (first, second) =>
          severityRank(second) - severityRank(first) ||
          first.firstSeenAtSeconds - second.firstSeenAtSeconds,
      );
    for (const advisory of newlyActive)
      this.announced.add(announcementKey(advisory));
    const advisory = newlyActive[0];
    if (!advisory) return [];
    const key = announcementKey(advisory);
    return [
      {
        key: `surface-safety:${key}`,
        label: `Surface safety · ${advisoryLabel(advisory)}`,
        detail: advisory.detail,
        priority:
          advisory.severity === "critical"
            ? "critical"
            : advisory.severity === "warning"
              ? "warning"
              : "operational",
      },
    ];
  }
}

function announcementKey(advisory: SurfaceSafetyAdvisory): string {
  return `${advisory.id}:${advisory.firstSeenAtSeconds}`;
}

function severityRank(advisory: SurfaceSafetyAdvisory): number {
  return advisory.severity === "critical"
    ? 3
    : advisory.severity === "warning"
      ? 2
      : 1;
}

function advisoryLabel(advisory: SurfaceSafetyAdvisory): string {
  return advisory.kind.replaceAll("-", " ");
}

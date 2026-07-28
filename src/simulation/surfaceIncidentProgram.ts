import type { SurfaceDisruptionKind } from "./types";

/**
 * Compact, deterministic incident cards. These are operational scenarios, not
 * claims about live airport conditions or a substitute for emergency services.
 */
export type SurfaceIncidentKind =
  "runway-inspection" | "bird-activity" | "foreign-object-debris";

export interface SurfaceIncidentDefinition {
  kind: SurfaceIncidentKind;
  label: string;
  targetKind: "runway" | "taxiway";
  surfaceDisruptionKind: Exclude<SurfaceDisruptionKind, "disabled-aircraft">;
  durationSeconds: number;
  responseVehicleLabel: string;
  responseTravelSeconds: number;
  reason: string;
}

const INCIDENTS: Record<SurfaceIncidentKind, SurfaceIncidentDefinition> = {
  "runway-inspection": {
    kind: "runway-inspection",
    label: "Runway inspection",
    targetKind: "runway",
    surfaceDisruptionKind: "runway-closure",
    durationSeconds: 150,
    responseVehicleLabel: "Airfield operations unit",
    responseTravelSeconds: 18,
    reason:
      "runway inspection in progress; protected pavement is unavailable until released",
  },
  "bird-activity": {
    kind: "bird-activity",
    label: "Bird-activity check",
    targetKind: "runway",
    surfaceDisruptionKind: "runway-closure",
    durationSeconds: 120,
    responseVehicleLabel: "Wildlife-response unit",
    responseTravelSeconds: 16,
    reason:
      "bird-activity check in progress; protected pavement is unavailable until released",
  },
  "foreign-object-debris": {
    kind: "foreign-object-debris",
    label: "FOD inspection",
    targetKind: "taxiway",
    surfaceDisruptionKind: "taxiway-closure",
    durationSeconds: 90,
    responseVehicleLabel: "Airfield operations unit",
    responseTravelSeconds: 12,
    reason:
      "foreign-object-debris inspection in progress; affected taxiway is unavailable until released",
  },
};

export function surfaceIncidentDefinition(
  kind: string,
): SurfaceIncidentDefinition | null {
  return INCIDENTS[kind as SurfaceIncidentKind] ?? null;
}

export function surfaceIncidentKinds(): SurfaceIncidentKind[] {
  return Object.keys(INCIDENTS) as SurfaceIncidentKind[];
}

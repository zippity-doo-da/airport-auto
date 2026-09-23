import type { ServiceVehicleType, SurfaceDisruptionKind } from "./types";

/**
 * Compact, deterministic incident cards. These are operational scenarios, not
 * claims about live airport conditions or a substitute for emergency services.
 */
export type SurfaceIncidentKind =
  | "runway-inspection"
  | "bird-activity"
  | "foreign-object-debris"
  | "snow-removal";

export interface SurfaceIncidentDefinition {
  kind: SurfaceIncidentKind;
  label: string;
  targetKind: "runway" | "taxiway";
  surfaceDisruptionKind: Exclude<SurfaceDisruptionKind, "disabled-aircraft">;
  durationSeconds: number;
  responseVehicleLabel: string;
  /** A visible, purpose-built response unit; not a generic maintenance van. */
  responseVehicleType: ServiceVehicleType;
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
    responseVehicleType: "maintenance-van",
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
    responseVehicleType: "wildlife-response",
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
    responseVehicleType: "maintenance-van",
    responseTravelSeconds: 12,
    reason:
      "foreign-object-debris inspection in progress; affected taxiway is unavailable until released",
  },
  "snow-removal": {
    kind: "snow-removal",
    label: "Snow-removal sweep",
    targetKind: "runway",
    surfaceDisruptionKind: "runway-closure",
    durationSeconds: 210,
    responseVehicleLabel: "Snow-removal unit",
    responseVehicleType: "snowplow",
    responseTravelSeconds: 20,
    reason:
      "snow-removal sweep in progress; protected runway is unavailable until the Supervisor reopens it",
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

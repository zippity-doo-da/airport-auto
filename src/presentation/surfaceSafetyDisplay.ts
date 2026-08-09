export const SURFACE_SAFETY_DIAGRAM_LAYERS = [
  "routes",
  "corridors",
  "forecasts",
  "vehicles",
] as const;

export type SurfaceSafetyDiagramLayer =
  (typeof SURFACE_SAFETY_DIAGRAM_LAYERS)[number];

export type SurfaceSafetyDiagramLayers = Record<
  SurfaceSafetyDiagramLayer,
  boolean
>;

export const SURFACE_SAFETY_LOOKAHEAD_OPTIONS = [15, 30, 60] as const;
export type SurfaceSafetyLookaheadSeconds =
  (typeof SURFACE_SAFETY_LOOKAHEAD_OPTIONS)[number];

export interface SurfaceSafetyDisplayConfig {
  lookaheadSeconds: SurfaceSafetyLookaheadSeconds;
  layers: SurfaceSafetyDiagramLayers;
}

export const DEFAULT_SURFACE_SAFETY_DIAGRAM_LAYERS: SurfaceSafetyDiagramLayers =
  {
    routes: true,
    corridors: true,
    forecasts: true,
    vehicles: true,
  };

export function isSurfaceSafetyLookaheadSeconds(
  value: number,
): value is SurfaceSafetyLookaheadSeconds {
  return (SURFACE_SAFETY_LOOKAHEAD_OPTIONS as readonly number[]).includes(
    value,
  );
}

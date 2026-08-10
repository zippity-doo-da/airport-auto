import {
  distanceToObstacleBoundary,
  type AirportObstacleEnvelope,
} from "../simulation/airportObstacles";
import type { SurfacePassengerFacility } from "../simulation/surfaceGraph";

export type PassengerFacilityFootprintRole = "terminal" | "concourse";

export interface PassengerFacilityFootprintMatch {
  obstacleId: string;
  role: PassengerFacilityFootprintRole;
  facilityIds: string[];
  facilityNames: string[];
  maximumAnchorDistance: number;
}

/**
 * Join passenger-facility anchors from the sourced surface graph to sourced
 * airport-building polygons. The renderer can then identify the actual
 * terminal/concourse roofs without inventing a second set of structures.
 */
export function matchPassengerFacilityFootprints(
  obstacles: readonly AirportObstacleEnvelope[],
  facilities: readonly SurfacePassengerFacility[],
  maximumAnchorDistance = 6,
): Map<string, PassengerFacilityFootprintMatch> {
  const candidates = obstacles.filter(
    (obstacle) =>
      obstacle.shape === "polygon" && obstacle.kind !== "control-tower",
  );
  const matches = new Map<string, PassengerFacilityFootprintMatch>();
  for (const facility of facilities) {
    let nearest:
      | { obstacle: AirportObstacleEnvelope; distance: number }
      | undefined;
    for (const obstacle of candidates) {
      const distance = distanceToObstacleBoundary(facility.center, obstacle);
      if (
        !nearest ||
        distance < nearest.distance - 1e-9 ||
        (Math.abs(distance - nearest.distance) <= 1e-9 &&
          obstacle.id.localeCompare(nearest.obstacle.id) < 0)
      )
        nearest = { obstacle, distance };
    }
    if (!nearest || nearest.distance > maximumAnchorDistance) continue;
    const existing = matches.get(nearest.obstacle.id);
    if (existing) {
      existing.facilityIds.push(facility.id);
      existing.facilityNames.push(facility.name);
      existing.maximumAnchorDistance = Math.max(
        existing.maximumAnchorDistance,
        nearest.distance,
      );
      if (facility.kind === "terminal") existing.role = "terminal";
      continue;
    }
    matches.set(nearest.obstacle.id, {
      obstacleId: nearest.obstacle.id,
      role: facility.kind,
      facilityIds: [facility.id],
      facilityNames: [facility.name],
      maximumAnchorDistance: nearest.distance,
    });
  }
  return matches;
}

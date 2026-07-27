import type { AirportConfig, RunwayConfig } from './airportConfig';

export type RunwayOperatingEnd = -1 | 1;

export interface RunwayPoint2 {
  x: number;
  y: number;
}

export interface RunwayPoint3 extends RunwayPoint2 {
  z: number;
}

/** Canonical runway centerline direction in simulation coordinates. */
export function runwayDirection(runway: RunwayConfig): RunwayPoint2 {
  return {
    x: Math.cos(runway.heading),
    y: Math.sin(runway.heading),
  };
}

/** Direction of aircraft travel toward the selected landing threshold. */
export function runwayTravelDirection(
  runway: RunwayConfig,
  landingEnd: RunwayOperatingEnd,
): RunwayPoint2 {
  const direction = runwayDirection(runway);
  return {
    x: -landingEnd * direction.x,
    y: -landingEnd * direction.y,
  };
}

/**
 * Canonical point on the runway centerline. A positive `beyond` moves away
 * from the runway center past the selected threshold; a negative value moves
 * back onto the pavement.
 */
export function runwayEndPoint(
  runway: RunwayConfig,
  operatingEnd: RunwayOperatingEnd,
  beyond = 0,
): RunwayPoint2 {
  const direction = runwayDirection(runway);
  const distance = operatingEnd * (runway.length / 2 + beyond);
  return {
    x: runway.center[0] + direction.x * distance,
    y: runway.center[1] + direction.y * distance,
  };
}

export function runwayEndPoint3(
  runway: RunwayConfig,
  operatingEnd: RunwayOperatingEnd,
  beyond: number,
  z: number,
): RunwayPoint3 {
  return { ...runwayEndPoint(runway, operatingEnd, beyond), z };
}

export function runwayEndTuple(
  runway: RunwayConfig,
  operatingEnd: RunwayOperatingEnd,
  beyond = 0,
): [number, number] {
  const point = runwayEndPoint(runway, operatingEnd, beyond);
  return [point.x, point.y];
}

export function runwayDesignation(
  runway: RunwayConfig | undefined,
  operatingEnd: RunwayOperatingEnd,
  fallback: string,
): string {
  return runway?.designation?.[operatingEnd === 1 ? 1 : 0] ?? fallback;
}

export function activeRunwayDesignation(
  config: Pick<AirportConfig, 'runways'>,
  activeRunwayEnds: Readonly<Record<number, RunwayOperatingEnd>>,
  runwayId: number,
): string {
  const runway = config.runways[runwayId];
  const operatingEnd = activeRunwayEnds[runwayId] ?? runway?.landingEnd ?? -1;
  return runwayDesignation(runway, operatingEnd, String(runwayId + 1));
}

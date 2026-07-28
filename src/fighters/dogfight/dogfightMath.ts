import type { Vec3 } from "../playground/flightPlaygroundSimulation";

export const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };

export function turnToward(
  current: Vec3,
  desired: Vec3,
  maximumAngle: number,
): Vec3 {
  const normalizedCurrent = normalize(current);
  const normalizedDesired = normalize(desired);
  const cosine = clamp(dot(normalizedCurrent, normalizedDesired), -1, 1);
  const angle = Math.acos(cosine);
  if (angle < 1e-6 || angle <= maximumAngle) return normalizedDesired;
  const amount = clamp(maximumAngle / angle, 0, 1);
  const sine = Math.sin(angle);

  // Spherical interpolation preserves the requested angular rate. Linear
  // interpolation barely moves when the desired vector is almost directly
  // behind the aircraft, which allowed fighters to extend for kilometres
  // after a merge instead of beginning an immediate reversal.
  if (Math.abs(sine) > 1e-4) {
    const currentWeight = Math.sin((1 - amount) * angle) / sine;
    const desiredWeight = Math.sin(amount * angle) / sine;
    return normalize(
      add(
        scale(normalizedCurrent, currentWeight),
        scale(normalizedDesired, desiredWeight),
      ),
    );
  }

  // Exactly opposite vectors have no unique interpolation plane. Choose a
  // stable horizontal turn so a head-on pass cannot trap either AI flying
  // straight away from its opponent.
  const horizontalRight = cross(WORLD_UP, normalizedCurrent);
  const orthogonal =
    lengthSquared(horizontalRight) > 1e-6
      ? normalize(horizontalRight)
      : { x: 1, y: 0, z: 0 };
  return normalize(
    add(
      scale(normalizedCurrent, Math.cos(maximumAngle)),
      scale(orthogonal, Math.sin(maximumAngle)),
    ),
  );
}

export function safeRight(forward: Vec3): Vec3 {
  const right = cross(WORLD_UP, forward);
  return lengthSquared(right) < 1e-6 ? { x: 1, y: 0, z: 0 } : normalize(right);
}

export function segmentDistanceSquared(
  start: Vec3,
  end: Vec3,
  point: Vec3,
): number {
  const segment = subtract(end, start);
  const segmentLengthSquared = lengthSquared(segment);
  if (segmentLengthSquared < 1e-8) {
    return lengthSquared(subtract(point, start));
  }
  const amount = clamp(
    dot(subtract(point, start), segment) / segmentLengthSquared,
    0,
    1,
  );
  const closest = add(start, scale(segment, amount));
  return lengthSquared(subtract(point, closest));
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(vector: Vec3, amount: number): Vec3 {
  return {
    x: vector.x * amount,
    y: vector.y * amount,
    z: vector.z * amount,
  };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lengthSquared(vector: Vec3): number {
  return dot(vector, vector);
}

export function length(vector: Vec3): number {
  return Math.sqrt(lengthSquared(vector));
}

export function distance(a: Vec3, b: Vec3): number {
  return length(subtract(a, b));
}

export function normalize(vector: Vec3): Vec3 {
  const magnitude = length(vector);
  return magnitude < 1e-8 ? { x: 0, y: 0, z: 1 } : scale(vector, 1 / magnitude);
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

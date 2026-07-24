import type { Object3D } from 'three';

/**
 * Aircraft models point along local +X with local +Z up. Apply heading around
 * world Z first, then pitch and bank around the aircraft's own axes. Three's
 * default XYZ Euler order makes pitch depend on compass heading, so a positive
 * pitch can visually become nose-down on a reciprocal runway.
 */
export function applyAircraftOrientation(
  object: Object3D,
  heading: number,
  pitch: number,
  bank: number,
): void {
  object.rotation.set(bank, -pitch, heading, 'ZYX');
}

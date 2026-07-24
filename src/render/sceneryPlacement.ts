import type { AirportConfig } from '../simulation/airportConfig';

export type SceneryClearanceEnvelope = {
  id: string;
  position: [number, number];
  radius: number;
};

export function treePlacement(
  config: Pick<AirportConfig, 'code' | 'seed'>,
  index: number,
  treeCount: number,
): { x: number; y: number; crownScale: number } {
  const angle = (index / treeCount) * Math.PI * 2 + Math.sin(index * 4.7 + config.seed) * 0.13;
  const radiusX = (config.code === 'ORD' ? 142 : 70) + (index % 5) * 3.5;
  const radiusY = (config.code === 'ORD' ? 112 : 50) + (index % 4) * 3.5;
  return {
    x: Math.cos(angle) * radiusX,
    y: Math.sin(angle) * radiusY,
    crownScale: 2.4 + (index % 3) * 0.35,
  };
}

export function sceneryClearanceEnvelopes(
  config: Pick<AirportConfig, 'code' | 'seed'>,
  treeCount: number,
): SceneryClearanceEnvelope[] {
  const trees = Array.from({ length: treeCount }, (_, index) => {
    const placement = treePlacement(config, index, treeCount);
    return {
      id: `tree-${index}`,
      position: [placement.x, placement.y] as [number, number],
      radius: placement.crownScale,
    };
  });
  return [
    ...trees,
    { id: 'windsock', position: [47.2, 28], radius: 3 },
  ];
}

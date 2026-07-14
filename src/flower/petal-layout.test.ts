import { describe, expect, it } from 'vitest';
import { computePetalClearance } from './petal-layout';

describe('petal clearance layout', () => {
  it('places adjacent petals in distinct depth lanes', () => {
    const common = { width: 0.62, count: 11, layer: 0, layers: 4, headRadius: 0.22, thickness: 0.014 };
    const first = computePetalClearance({ ...common, index: 0 });
    const second = computePetalClearance({ ...common, index: 1 });
    const third = computePetalClearance({ ...common, index: 2 });

    expect(new Set([first.laneDepth, second.laneDepth, third.laneDepth]).size).toBe(3);
    expect(Math.abs(first.laneDepth - second.laneDepth)).toBeGreaterThan(common.thickness);
    expect(first.radialBase).toBeGreaterThan(common.headRadius * 0.48);
  });

  it('raises inner layers and gives opening petals outward clearance', () => {
    const outer = computePetalClearance({ width: 0.64, count: 8, index: 0, layer: 0, layers: 3, headRadius: 0.26, thickness: 0.019 });
    const inner = computePetalClearance({ width: 0.64, count: 8, index: 0, layer: 2, layers: 3, headRadius: 0.26, thickness: 0.019 });

    expect(inner.layerLift).toBeGreaterThan(outer.layerLift);
    expect(inner.openDrift).toBeGreaterThan(0);
  });
});

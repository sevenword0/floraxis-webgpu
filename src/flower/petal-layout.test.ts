import { describe, expect, it } from 'vitest';
import { computeFloralAttachment, computePetalClearance } from './petal-layout';

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

  it('places ordinary sepals on the receptacle rim instead of the stem axis', () => {
    const layout = computeFloralAttachment({
      headRadius: 0.22,
      petalCount: 5,
      layers: 1,
      petalWidth: 0.8,
      petalThickness: 0.015,
      radialSpread: 1.04,
      sepalLength: 0.48,
      stemRadius: 0.07,
      sunflower: false,
    });

    expect(layout.sepalRadius).toBeGreaterThan(layout.petalClosedEnvelope);
    expect(layout.sepalRadius + layout.sepalOpenDrift).toBeGreaterThan(layout.petalOpenEnvelope);
    expect(layout.baseRadius).toBeGreaterThanOrEqual(layout.petalBaseRadius);
    expect(layout.baseRadius).toBeGreaterThan(0.07 * 2);
    expect(layout.sepalBaseLift).toBeLessThanOrEqual(-0.042);
    expect(layout.sepalOpenDrift).toBeGreaterThan(0);
    expect(layout.sepalDrop).toBeGreaterThan(0);
  });

  it('keeps dense rose sepals outside the outer petal lanes throughout opening', () => {
    const layout = computeFloralAttachment({
      headRadius: 0.22,
      petalCount: 42,
      layers: 4,
      petalWidth: 0.62,
      petalThickness: 0.0143,
      radialSpread: 1.18,
      sepalLength: 0.58,
      stemRadius: 0.085,
      sunflower: false,
    });

    expect(layout.baseRadius).toBeGreaterThanOrEqual(layout.petalBaseRadius);
    expect(layout.sepalRadius).toBeGreaterThan(layout.petalClosedEnvelope);
    expect(layout.sepalRadius + layout.sepalOpenDrift - layout.petalOpenEnvelope).toBeGreaterThan(0.01);
  });

  it('keeps sunflower involucral bracts close to the capitulum rim', () => {
    const layout = computeFloralAttachment({
      headRadius: 0.83,
      petalCount: 56,
      layers: 1,
      petalWidth: 0.24,
      petalThickness: 0.0162,
      radialSpread: 0.92,
      sepalLength: 0.56,
      stemRadius: 0.11,
      sunflower: true,
    });

    expect(layout.sepalRadius).toBeGreaterThan(0.83 * 0.91);
    expect(layout.sepalRadius).toBeLessThan(0.83 * 0.96);
    expect(layout.baseRadius).toBeCloseTo(0.83 * 0.94);
    expect(layout.sepalRadius + layout.sepalOpenDrift).toBeGreaterThan(layout.petalOpenEnvelope);
    expect(layout.sepalDrop).toBeGreaterThan(layout.sepalOpenDrift);
  });
});

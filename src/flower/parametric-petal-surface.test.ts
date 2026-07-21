import { describe, expect, it } from 'vitest';
import { FLORAL_SYSTEM_PROFILES } from '../data/floral-system-profiles';
import { createPetalControlNet, evaluateRationalBezierSurface } from './parametric-petal-surface';

describe('rational bicubic petal surface', () => {
  it('builds a finite 4 x 4 control lattice attached at base and tip', () => {
    const net = createPetalControlNet(FLORAL_SYSTEM_PROFILES.lily.petalSurface, 'lance');
    expect(net).toHaveLength(4);
    expect(net.every((row) => row.length === 4)).toBe(true);
    const base = evaluateRationalBezierSurface(net, 0.5, 0);
    const tip = evaluateRationalBezierSurface(net, 0.5, 1);
    expect(base.y).toBeCloseTo(0, 8);
    expect(tip.y).toBeCloseTo(1, 8);
    expect([base.x, base.y, base.z, tip.x, tip.y, tip.z].every(Number.isFinite)).toBe(true);
  });

  it('expresses species width and rational-weight differences without an asset mesh', () => {
    const lily = createPetalControlNet(FLORAL_SYSTEM_PROFILES.lily.petalSurface, 'lance');
    const rose = createPetalControlNet(FLORAL_SYSTEM_PROFILES.rose.petalSurface, 'round');
    const lilyShoulder = evaluateRationalBezierSurface(lily, 1, 0.72);
    const roseShoulder = evaluateRationalBezierSurface(rose, 1, 0.72);
    expect(Math.abs(roseShoulder.x)).toBeGreaterThan(Math.abs(lilyShoulder.x));

    const weightedProfile = { ...FLORAL_SYSTEM_PROFILES.rose.petalSurface, rationalWeight: 2 };
    const weighted = evaluateRationalBezierSurface(createPetalControlNet(weightedProfile, 'round'), 0.5, 0.55);
    const unweighted = evaluateRationalBezierSurface(rose, 0.5, 0.55);
    expect(weighted.z).not.toBeCloseTo(unweighted.z, 5);
  });
});

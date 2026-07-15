import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GROWTH_PROFILE,
  evaluateHeadGrowth,
  evaluateReproductiveReveal,
  normalizeGrowthProfile,
} from './growth-model';

describe('research-backed bloom growth model', () => {
  it('grows the flower head monotonically from bud scale to full size', () => {
    const samples = Array.from({ length: 21 }, (_, index) =>
      evaluateHeadGrowth(DEFAULT_GROWTH_PROFILE, index / 20));
    expect(samples[0]).toBeCloseTo(DEFAULT_GROWTH_PROFILE.budHeadScale, 5);
    expect(samples.at(-1)).toBeCloseTo(1, 5);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeGreaterThanOrEqual(samples[index - 1]);
    }
  });

  it('reveals reproductive organs only after the species threshold', () => {
    expect(evaluateReproductiveReveal(DEFAULT_GROWTH_PROFILE, 0.3)).toBe(0);
    expect(evaluateReproductiveReveal(DEFAULT_GROWTH_PROFILE, 0.6)).toBeGreaterThan(0);
    expect(evaluateReproductiveReveal(DEFAULT_GROWTH_PROFILE, 1)).toBe(1);
  });

  it('clamps imported growth coefficients to stable rendering bounds', () => {
    const safe = normalizeGrowthProfile({
      budHeadScale: -4,
      closedPetalLength: 9,
      closedPetalWidth: 0,
      radialSpread: 8,
      openingSpan: 0,
    });
    expect(safe.budHeadScale).toBe(0.48);
    expect(safe.closedPetalLength).toBe(1);
    expect(safe.closedPetalWidth).toBe(0.34);
    expect(safe.radialSpread).toBe(1.5);
    expect(safe.openingSpan).toBe(0.18);
  });
});

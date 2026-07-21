import { describe, expect, it } from 'vitest';
import { displayStemRadius, STEM_RADIUS_RECALIBRATION } from './stem-proportions';

describe('displayStemRadius', () => {
  it('recalibrates every preset while retaining the user thickness multiplier', () => {
    expect(STEM_RADIUS_RECALIBRATION).toBe(0.48);
    expect(displayStemRadius(0.1)).toBeCloseTo(0.048, 6);
    expect(displayStemRadius(0.1, 2.2)).toBeCloseTo(0.1056, 6);
  });

  it('keeps malformed or zero radii renderable', () => {
    expect(displayStemRadius(0)).toBe(0.001);
  });
});

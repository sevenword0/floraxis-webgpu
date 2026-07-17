import { describe, expect, it } from 'vitest';
import type { FieldSettings } from '../types';
import { evaluateFieldBloom, generateFieldLayout } from './flower-field-layout';

const settings: FieldSettings = {
  count: 48,
  radius: 6,
  spacing: 0.42,
  bloomWave: 0.7,
  bloomVariance: 0.35,
  wind: 0.4,
  seed: 8128,
  speciesIds: ['rose', 'tulip', 'lily'],
};

describe('preset flower-field layout', () => {
  it('is deterministic and keeps every requested plant inside the field', () => {
    const first = generateFieldLayout(settings, ['rose', 'tulip', 'lily', 'lotus']);
    const second = generateFieldLayout(settings, ['rose', 'tulip', 'lily', 'lotus']);

    expect(first).toEqual(second);
    expect(first).toHaveLength(settings.count);
    expect(first.every((plant) => Math.hypot(plant.x, plant.z) <= settings.radius)).toBe(true);
  });

  it('includes every enabled species and honours spacing in a roomy layout', () => {
    const roomy = generateFieldLayout({ ...settings, count: 18, radius: 8, spacing: 0.68 }, ['rose', 'tulip', 'lily']);
    expect(new Set(roomy.map((plant) => plant.presetId))).toEqual(new Set(settings.speciesIds));

    for (let a = 0; a < roomy.length; a += 1) {
      for (let b = a + 1; b < roomy.length; b += 1) {
        expect(Math.hypot(roomy[a].x - roomy[b].x, roomy[a].z - roomy[b].z)).toBeGreaterThanOrEqual(0.68 * 0.9);
      }
    }
  });

  it('maps delayed bloom to exact global endpoints', () => {
    expect(evaluateFieldBloom(0, 0.4)).toBe(0);
    expect(evaluateFieldBloom(0.25, 0.4)).toBe(0);
    expect(evaluateFieldBloom(0.7, 0.4)).toBeCloseTo(0.5, 5);
    expect(evaluateFieldBloom(1, 0.4)).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { BLOOM_STAGES, getBloomStage, remapBloom, smootherstep } from './utils';

describe('bloom timeline', () => {
  it('covers the complete normalized timeline without gaps', () => {
    expect(BLOOM_STAGES[0].range[0]).toBe(0);
    expect(BLOOM_STAGES.at(-1)?.range[1]).toBeGreaterThan(1);
    for (let i = 1; i < BLOOM_STAGES.length; i += 1) {
      expect(BLOOM_STAGES[i].range[0]).toBe(BLOOM_STAGES[i - 1].range[1]);
    }
  });

  it('maps delayed petals smoothly into the open state', () => {
    expect(remapBloom(0.1, 0.2)).toBe(0);
    expect(remapBloom(1, 0.2)).toBe(1);
    expect(remapBloom(0.5, 0.2)).toBeGreaterThan(0);
    expect(remapBloom(0.5, 0.2)).toBeLessThan(1);
    expect(smootherstep(0.5)).toBeCloseTo(0.5);
  });

  it('reports the correct named stages', () => {
    expect(getBloomStage(0).id).toBe('bud');
    expect(getBloomStage(0.5).id).toBe('separate');
    expect(getBloomStage(0.7).id).toBe('anthesis');
    expect(getBloomStage(1).id).toBe('full');
  });
});

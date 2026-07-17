import { describe, expect, it } from 'vitest';
import { resolveFlowerColor, sanitizeFieldColorRange } from './flower-color-variation';

describe('field flower colour variation', () => {
  it('keeps the preset colour when variation is disabled', () => {
    expect(resolveFlowerColor('#884466', { from: '#000000', to: '#ffffff', strength: 0 }, 0.7)).toBe('#884466');
  });

  it('returns deterministic interval endpoints at full strength', () => {
    const range = { from: '#204080', to: '#f0b0d0', strength: 1 };
    expect(resolveFlowerColor('#ffffff', range, 0)).toBe('#204080');
    expect(resolveFlowerColor('#ffffff', range, 1)).toBe('#f0b0d0');
    expect(resolveFlowerColor('#ffffff', range, 0.42)).toBe(resolveFlowerColor('#ffffff', range, 0.42));
  });

  it('repairs invalid imported ranges', () => {
    expect(sanitizeFieldColorRange({ from: 'bad', to: '#112233', strength: 5 }, { base: '#abcdef', tip: '#fedcba' }))
      .toEqual({ from: '#abcdef', to: '#112233', strength: 1 });
  });
});

import { describe, expect, it } from 'vitest';
import { FLORAL_SYSTEM_PROFILES } from '../data/floral-system-profiles';
import { createPetalGeometry } from './petal-geometry';

describe('parametric petal geometry integration', () => {
  it('records and applies the rational surface profile before bloom deformation', () => {
    const geometry = createPetalGeometry({
      length: 1.1,
      width: 0.72,
      shape: 'round',
      taper: 0.3,
      notch: 0,
      waviness: 0,
      cup: 0,
      curl: 0,
      fold: 0,
      seed: 5,
      surface: FLORAL_SYSTEM_PROFILES.rose.petalSurface,
      colors: { base: '#9c1538', tip: '#f46f88' },
    });
    expect(geometry.userData.surfaceModel).toBe('rational-bicubic-bezier');
    expect(geometry.userData.surfaceProfile.rationalWeight).toBe(1.18);
    expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    geometry.dispose();
  });
});

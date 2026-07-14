import { describe, expect, it } from 'vitest';
import { createPetalGeometry } from './petal-geometry';

describe('petal geometry', () => {
  it('builds matching closed and open morph topologies', () => {
    const geometry = createPetalGeometry({
      length: 1.2,
      width: 0.7,
      shape: 'round',
      taper: 0.4,
      notch: 0,
      waviness: 0.04,
      cup: 0.25,
      curl: 0.35,
      seed: 7,
      colors: { base: '#8d1836', tip: '#f38192' },
    });
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const color = geometry.getAttribute('color');
    const openPosition = geometry.morphAttributes.position![0];
    const openNormal = geometry.morphAttributes.normal![0];

    expect(position.count).toBe(209);
    expect(openPosition.count).toBe(position.count);
    expect(openNormal.count).toBe(normal.count);
    expect(color.count).toBe(position.count);
    expect(geometry.index?.count).toBe(1080);
    expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
    expect(Array.from(openPosition.array).every(Number.isFinite)).toBe(true);
    geometry.dispose();
  });

  it('creates a visible notched tip for sakura-like petals', () => {
    const geometry = createPetalGeometry({
      length: 1,
      width: 0.8,
      shape: 'notched',
      taper: 0.2,
      notch: 0.16,
      waviness: 0,
      cup: 0.1,
      curl: 0.1,
      seed: 2,
      colors: { base: '#efb2c2', tip: '#fff2f5' },
    });
    const positions = geometry.morphAttributes.position![0];
    const rowStart = 18 * 11;
    const centerY = positions.getY(rowStart + 5);
    const shoulderY = positions.getY(rowStart + 2);
    expect(centerY).toBeLessThan(shoulderY);
    geometry.dispose();
  });
});

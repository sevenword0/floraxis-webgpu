import { describe, expect, it } from 'vitest';
import { generateBokehKernel, rayPolygonRadius } from './lens-settings';

describe('bokeh aperture kernels', () => {
  it('keeps the 64 + 16 sample split expected by the WebGPU DOF node', () => {
    const kernel = generateBokehKernel('circle');
    expect(kernel.points64).toHaveLength(64);
    expect(kernel.points16).toHaveLength(16);
    for (const point of [...kernel.points64, ...kernel.points16]) {
      expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic and changes when aperture shape or rotation changes', () => {
    const polygon = generateBokehKernel('polygon', 6, 0);
    expect(generateBokehKernel('polygon', 6, 0)).toEqual(polygon);
    expect(generateBokehKernel('star', 6, 0)).not.toEqual(polygon);
    expect(generateBokehKernel('polygon', 6, 30)).not.toEqual(polygon);
  });

  it('supports user-selected aperture blade counts', () => {
    const triangle = generateBokehKernel('polygon', 3, 0);
    const dodecagon = generateBokehKernel('polygon', 12, 0);
    expect(triangle).not.toEqual(dodecagon);
  });

  it('finds stable ray intersections for concave aperture masks', () => {
    const star = generateBokehKernel('star', 5, 12);
    const heart = generateBokehKernel('heart', 6, -8);
    expect([...star.points64, ...star.points16].every((point) => Number.isFinite(point.x + point.y))).toBe(true);
    expect([...heart.points64, ...heart.points16].every((point) => Number.isFinite(point.x + point.y))).toBe(true);
    expect(rayPolygonRadius(0, [{ x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }])).toBeCloseTo(1);
  });
});

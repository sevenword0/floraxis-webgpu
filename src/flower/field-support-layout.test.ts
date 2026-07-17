import { describe, expect, it } from 'vitest';
import { generateFieldSupportSegments } from './field-support-layout';

describe('field corridor supports', () => {
  it('creates overhead arches only for the tunnel mode', () => {
    const tunnel = generateFieldSupportSegments({ radius: 6.5, layoutMode: 'flower-tunnel' }, 5);
    expect(tunnel.length).toBeGreaterThan(60);
    expect(tunnel.some((item) => item.start.x < 0 && item.end.x > item.start.x && item.end.y > item.start.y)).toBe(true);
    expect(generateFieldSupportSegments({ radius: 6.5, layoutMode: 'scatter' }, 5)).toEqual([]);
  });

  it('creates two vertical trellis walls with longitudinal rails', () => {
    const walls = generateFieldSupportSegments({ radius: 6.5, layoutMode: 'flower-road-walls' }, 5);
    expect(walls.length).toBeGreaterThan(20);
    expect(new Set(walls.filter((item) => item.start.y === 0).map((item) => Math.sign(item.start.x))))
      .toEqual(new Set([-1, 1]));
    expect(walls.some((item) => item.start.z < 0 && item.end.z > 0 && item.start.y === item.end.y)).toBe(true);
  });
});

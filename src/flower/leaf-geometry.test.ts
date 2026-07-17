import { describe, expect, it } from 'vitest';
import { createLeafGeometry } from './leaf-geometry';

describe('botanical leaf geometry', () => {
  it('creates finite species-aware silhouettes in normalized local space', () => {
    for (const shape of ['compound-pinnate', 'broad-lanceolate', 'lanceolate', 'elliptic-serrate', 'peltate-orbicular', 'ovate-serrate'] as const) {
      const geometry = createLeafGeometry(shape);
      const position = geometry.getAttribute('position');
      expect(position.count).toBeGreaterThan(20);
      for (let index = 0; index < position.count; index += 1) {
        expect(Number.isFinite(position.getX(index))).toBe(true);
        expect(Number.isFinite(position.getY(index))).toBe(true);
        expect(Number.isFinite(position.getZ(index))).toBe(true);
      }
      geometry.dispose();
    }
  });

  it('distinguishes compound and peltate leaves from a simple lanceolate blade', () => {
    const compound = createLeafGeometry('compound-pinnate');
    const peltate = createLeafGeometry('peltate-orbicular');
    const lance = createLeafGeometry('lanceolate');
    expect(compound.getAttribute('position').count).toBeGreaterThan(lance.getAttribute('position').count * 2);
    expect(peltate.boundingBox!.min.z).toBeLessThan(0);
    expect(lance.boundingBox!.min.z).toBeGreaterThanOrEqual(0);
    compound.dispose();
    peltate.dispose();
    lance.dispose();
  });
});

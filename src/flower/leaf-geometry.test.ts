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
    expect(compound.getAttribute('position').count).toBeGreaterThan(100);
    expect(compound.boundingBox!.max.z).toBeGreaterThan(1);
    expect(peltate.boundingBox!.min.z).toBeLessThan(0);
    expect(lance.boundingBox!.min.z).toBeGreaterThanOrEqual(0);
    compound.dispose();
    peltate.dispose();
    lance.dispose();
  });

  it('builds visible longitudinal and transverse curvature into simple leaves', () => {
    const geometry = createLeafGeometry('ovate-serrate');
    const position = geometry.getAttribute('position');
    const middleRows = Array.from({ length: position.count }, (_, index) => index)
      .filter((index) => Math.abs(position.getZ(index) - 0.5) < 0.04);
    const inner = middleRows.reduce((best, index) => (
      Math.abs(position.getX(index)) < Math.abs(position.getX(best)) ? index : best
    ), middleRows[0]);
    const edge = middleRows.reduce((best, index) => (
      Math.abs(position.getX(index)) > Math.abs(position.getX(best)) ? index : best
    ), middleRows[0]);
    const tip = Array.from({ length: position.count }, (_, index) => index)
      .reduce((best, index) => position.getZ(index) > position.getZ(best) ? index : best, 0);

    expect(position.getY(edge)).toBeGreaterThan(position.getY(inner));
    expect(position.getY(tip)).toBeLessThan(position.getY(inner));
    expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeGreaterThan(0.08);
    expect(new Set(middleRows.map((index) => position.getX(index).toFixed(4))).size).toBeGreaterThanOrEqual(7);
    geometry.dispose();
  });

  it('keeps the simple-leaf insertion point exactly at the local origin', () => {
    const geometry = createLeafGeometry('lanceolate');
    const position = geometry.getAttribute('position');
    const roots = Array.from({ length: position.count }, (_, index) => index)
      .filter((index) => Math.abs(position.getZ(index)) < 1e-8);
    expect(roots.length).toBeGreaterThan(1);
    for (const index of roots) {
      expect(position.getX(index)).toBeCloseTo(0, 8);
      expect(position.getY(index)).toBeCloseTo(0, 8);
    }
    geometry.dispose();
  });

  it('adds radial subdivisions so peltate curvature forms a smooth bowl', () => {
    const geometry = createLeafGeometry('peltate-orbicular');
    const position = geometry.getAttribute('position');
    const radii = new Set(Array.from({ length: position.count }, (_, index) => (
      Math.hypot(position.getX(index), position.getZ(index)).toFixed(2)
    )));
    expect(radii.size).toBeGreaterThanOrEqual(7);
    expect(position.count).toBeGreaterThan(250);
    geometry.dispose();
  });
});

import { describe, expect, it } from 'vitest';
import { createPetalGeometry, createPetalMaterial, createPetalNormalMap } from './petal-geometry';

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

    expect(position.count).toBe(418);
    expect(openPosition.count).toBe(position.count);
    expect(openNormal.count).toBe(normal.count);
    expect(color.count).toBe(position.count);
    expect(geometry.index?.count).toBe(2496);
    expect(geometry.userData.petalThickness).toBeGreaterThan(0);
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

  it('creates a non-flat vein normal map and wires it to the petal material', () => {
    const normalMap = createPetalNormalMap(24, 48);
    const data = normalMap.image.data as Uint8Array;
    const redValues = new Set<number>();
    for (let index = 0; index < data.length; index += 16) redValues.add(data[index]);
    expect(redValues.size).toBeGreaterThan(8);

    const material = createPetalMaterial(
      { base: '#9c1538', tip: '#f46f88', reverse: '#70102d', center: '#6f101d', pollen: '#f4c55a', stem: '#315842' },
      { roughness: 0.62, sssStrength: 0.82 },
    );
    expect(material.normalMap?.name).toBe('Floraxis petal veins normal map');
    expect(material.normalScale.x).toBeGreaterThan(0.25);
    material.dispose();
    normalMap.dispose();
  });

  it('applies species-specific axial and lateral petal growth from bud to anthesis', () => {
    const geometry = createPetalGeometry({
      length: 1.2,
      width: 0.7,
      shape: 'round',
      taper: 0.4,
      notch: 0,
      waviness: 0.03,
      cup: 0.25,
      curl: 0.35,
      seed: 11,
      growth: {
        closedPetalLength: 0.66,
        closedPetalWidth: 0.49,
        basalEpinasty: 0.94,
        marginGrowth: 0.1,
      },
      colors: { base: '#8d1836', tip: '#f38192' },
    });
    const closed = geometry.getAttribute('position');
    const opened = geometry.morphAttributes.position![0];
    const extent = (attribute: typeof closed, axis: 'x' | 'y'): number => {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < attribute.count; index += 1) {
        const value = axis === 'x' ? attribute.getX(index) : attribute.getY(index);
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      return max - min;
    };

    expect(extent(closed, 'y')).toBeLessThan(extent(opened, 'y') * 0.75);
    expect(extent(closed, 'x')).toBeLessThan(extent(opened, 'x') * 0.65);
    expect(geometry.userData.closedPetalLength).toBe(0.66);
    geometry.dispose();
  });

  it('adds a controllable longitudinal midrib fold to the open petal', () => {
    const makeGeometry = (fold: number) => createPetalGeometry({
      length: 1.2,
      width: 0.7,
      shape: 'round',
      taper: 0.4,
      notch: 0,
      waviness: 0,
      cup: 0,
      curl: 0,
      fold,
      seed: 13,
      colors: { base: '#8d1836', tip: '#f38192' },
    });
    const flat = makeGeometry(0);
    const folded = makeGeometry(0.8);
    const rowStart = 9 * 11;
    const flatOpen = flat.morphAttributes.position![0];
    const foldedOpen = folded.morphAttributes.position![0];
    const flatCrease = flatOpen.getZ(rowStart + 5) - flatOpen.getZ(rowStart + 1);
    const foldedCrease = foldedOpen.getZ(rowStart + 5) - foldedOpen.getZ(rowStart + 1);

    expect(foldedCrease).toBeGreaterThan(flatCrease + 0.05);
    expect(folded.userData.petalFold).toBe(0.8);
    flat.dispose();
    folded.dispose();
  });
});

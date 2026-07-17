import { describe, expect, it } from 'vitest';
import type { FieldSettings } from '../types';
import {
  generateFieldEnvironmentLayout,
  sampleTerrainHeight,
  sampleWindBend,
} from './field-environment-layout';

const settings: FieldSettings = {
  count: 120,
  radius: 6.5,
  spacing: 0.52,
  bloomWave: 0.64,
  bloomVariance: 0.32,
  wind: 0.36,
  windTurbulence: 0.58,
  layoutMode: 'scatter',
  mixStrength: 1,
  rowsPerSpecies: 2,
  ringCount: 6,
  groundCover: 0.88,
  shrubDensity: 0.76,
  rockDensity: 0.42,
  terrainRelief: 0.38,
  seed: 240617,
  speciesIds: ['rose'],
  colorRanges: {},
  stemScales: {},
  speciesVariations: {},
  individuals: {},
};

describe('field environment layout', () => {
  it('deterministically mixes dense ground cover, shrubs, and small rocks inside the field', () => {
    const roots = [{ x: 0, z: 0 }, { x: 1.4, z: -0.8 }];
    const first = generateFieldEnvironmentLayout(settings, roots);
    const second = generateFieldEnvironmentLayout(settings, roots);
    expect(first).toEqual(second);
    expect(first.groundCover.length).toBeGreaterThan(500);
    expect(first.shrubs.length).toBeGreaterThan(100);
    expect(first.rocks.length).toBeGreaterThan(30);
    expect([...first.groundCover, ...first.shrubs, ...first.rocks].every((item) =>
      Math.hypot(item.x, item.z) <= settings.radius)).toBe(true);
    expect(first.shrubs.every((item) => Math.hypot(item.x, item.z) >= 0.28)).toBe(true);
  });

  it('keeps vegetation and stones out of flower-tunnel and double-wall paths', () => {
    for (const layoutMode of ['flower-tunnel', 'flower-road-walls'] as const) {
      const layout = generateFieldEnvironmentLayout({ ...settings, layoutMode }, []);
      expect([...layout.groundCover, ...layout.shrubs, ...layout.rocks].every((item) => Math.abs(item.x) >= 0.72)).toBe(true);
    }
  });

  it('allows every terrain layer to be disabled independently', () => {
    const empty = generateFieldEnvironmentLayout({
      ...settings,
      groundCover: 0,
      shrubDensity: 0,
      rockDensity: 0,
    }, []);
    expect(empty).toEqual({ groundCover: [], shrubs: [], rocks: [] });
  });

  it('shares deterministic relief between soil and plant roots', () => {
    const first = sampleTerrainHeight(1.2, -2.4, settings.radius, settings.terrainRelief, settings.seed);
    const second = sampleTerrainHeight(1.2, -2.4, settings.radius, settings.terrainRelief, settings.seed);
    const flat = sampleTerrainHeight(1.2, -2.4, settings.radius, 0, settings.seed);
    expect(first).toBe(second);
    expect(first).not.toBe(0);
    expect(flat).toBe(0);
  });

  it('returns zero in still air and a changing coherent bend when wind is enabled', () => {
    expect(sampleWindBend(4000, 1, 2, 0.7, 0, 1)).toEqual({ x: 0, z: 0, gust: 0 });
    const first = sampleWindBend(4000, 1, 2, 0.7, 0.8, 0.6);
    const second = sampleWindBend(4600, 1, 2, 0.7, 0.8, 0.6);
    expect(Number.isFinite(first.x + first.z + first.gust)).toBe(true);
    expect(second).not.toEqual(first);
  });
});

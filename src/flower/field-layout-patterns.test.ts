import { describe, expect, it } from 'vitest';
import type { FieldSettings } from '../types';
import { generateFieldLayoutAnchors } from './field-layout-patterns';

const settings: Pick<FieldSettings, 'count' | 'radius' | 'spacing' | 'seed' | 'layoutMode' | 'rowsPerSpecies' | 'ringCount'> = {
  count: 120,
  radius: 6.5,
  spacing: 0.52,
  seed: 240617,
  layoutMode: 'scatter',
  rowsPerSpecies: 2,
  ringCount: 6,
};

describe('field layout patterns', () => {
  it('is deterministic and keeps every mode inside the planting circle', () => {
    const modes = ['scatter', 'species-rows', 'concentric', 'species-sectors', 'radial-composite', 'flower-tunnel', 'flower-road-walls'] as const;
    for (const layoutMode of modes) {
      const first = generateFieldLayoutAnchors({ ...settings, layoutMode }, 6);
      const second = generateFieldLayoutAnchors({ ...settings, layoutMode }, 6);
      expect(first).toEqual(second);
      expect(first).toHaveLength(settings.count);
      expect(first.every((anchor) => Math.hypot(anchor.x, anchor.z) <= settings.radius)).toBe(true);
      expect(first.every((anchor) => anchor.groupIndex >= 0 && anchor.groupIndex < 6)).toBe(true);
    }
  });

  it('keeps a clear central path and two planted sides in corridor modes', () => {
    for (const layoutMode of ['flower-tunnel', 'flower-road-walls'] as const) {
      const anchors = generateFieldLayoutAnchors({ ...settings, layoutMode }, 6);
      expect(new Set(anchors.map((anchor) => anchor.side))).toEqual(new Set([-1, 1]));
      expect(anchors.every((anchor) => Math.abs(anchor.x) > 0.7)).toBe(true);
      expect(anchors.every((anchor) => anchor.supportLeanDeg! > 0)).toBe(true);
    }
    const tunnel = generateFieldLayoutAnchors({ ...settings, layoutMode: 'flower-tunnel' }, 6);
    expect(tunnel.every((anchor) => anchor.zone === 'tunnel')).toBe(true);
    expect(Math.min(...tunnel.map((anchor) => anchor.supportLeanDeg!))).toBeGreaterThan(10);
  });

  it('allocates the requested number of rows to every species', () => {
    const anchors = generateFieldLayoutAnchors({ ...settings, layoutMode: 'species-rows', rowsPerSpecies: 3 }, 4);
    for (let species = 0; species < 4; species += 1) {
      const rows = new Set(anchors.filter((anchor) => anchor.groupIndex === species).map((anchor) => anchor.bandIndex));
      expect(rows.size).toBe(3);
    }
  });

  it('creates the requested number of concentric rings', () => {
    const anchors = generateFieldLayoutAnchors({ ...settings, layoutMode: 'concentric', ringCount: 7 }, 6);
    expect(new Set(anchors.map((anchor) => anchor.bandIndex)).size).toBe(7);
    expect(anchors.every((anchor) => anchor.zone === 'ring')).toBe(true);
  });

  it('reserves centre, species-sector, and outer-ring zones in the composite layout', () => {
    const anchors = generateFieldLayoutAnchors({ ...settings, layoutMode: 'radial-composite' }, 6);
    expect(new Set(anchors.map((anchor) => anchor.zone))).toEqual(new Set(['center', 'sector', 'outer']));
    expect(new Set(anchors.filter((anchor) => anchor.zone === 'sector').map((anchor) => anchor.groupIndex)).size).toBe(6);
  });
});

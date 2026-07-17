import { describe, expect, it } from 'vitest';
import { resolveBotanicalArchitecture } from '../data/botanical-architecture';
import { PRESETS } from '../data/presets';
import type { FieldSettings } from '../types';
import { generateFieldLayout } from './flower-field-layout';
import {
  expandFieldFloweringShoots,
  generateFloweringShootSpecs,
} from './flowering-shoot-layout';

const settings: FieldSettings = {
  count: 12,
  radius: 5,
  spacing: 0.5,
  bloomWave: 0,
  bloomVariance: 0,
  wind: 0.3,
  windTurbulence: 0.58,
  layoutMode: 'scatter',
  mixStrength: 0,
  rowsPerSpecies: 1,
  ringCount: 3,
  groundCover: 0.5,
  shrubDensity: 0.4,
  rockDensity: 0.2,
  terrainRelief: 0.2,
  seed: 7319,
  speciesIds: ['hydrangea'],
  colorRanges: {},
  stemScales: {},
  speciesVariations: {},
  individuals: {},
};

describe('flowering-shoot layout', () => {
  it('builds a central hydrangea leader and an outward basal-shoot ring with LOD caps', () => {
    const preset = PRESETS.find((item) => item.id === 'hydrangea')!;
    const architecture = resolveBotanicalArchitecture(preset);
    const near = generateFloweringShootSpecs(architecture, 'near');

    expect(near).toHaveLength(5);
    expect(generateFloweringShootSpecs(architecture, 'mid')).toHaveLength(4);
    expect(generateFloweringShootSpecs(architecture, 'far')).toHaveLength(3);
    expect(near[0]).toMatchObject({ leanDeg: 0, heightScale: 1, flowerScale: 1 });
    expect(near.slice(1).every((shoot) => shoot.leanDeg > 16 && shoot.heightScale < 1)).toBe(true);
    expect(new Set(near.slice(1).map((shoot) => Math.round(shoot.azimuthDeg))).size).toBe(4);
  });

  it('expands one hydrangea root into multiple flower-bearing stems without changing the root position', () => {
    const root = generateFieldLayout(settings, PRESETS).find((plant) => plant.lod === 'near')
      ?? generateFieldLayout(settings, PRESETS)[0];
    root.lod = 'near';
    const shoots = expandFieldFloweringShoots([root], PRESETS);

    expect(shoots).toHaveLength(5);
    expect(root.matureRadius).toBeGreaterThan(root.visualFlowerDiameter * 1.3);
    expect(shoots.every((shoot) => shoot.x === root.x && shoot.z === root.z)).toBe(true);
    expect(shoots.every((shoot) => shoot.sourceRootIndex === root.index)).toBe(true);
    expect(new Set(shoots.map((shoot) => Math.round(shoot.supportLeanAzimuthDeg))).size).toBe(5);
    expect(shoots.slice(1).every((shoot) => shoot.branchCount <= 1 && shoot.leafCount === 4)).toBe(true);
  });

  it('keeps single-scape species as one rendered flowering shoot', () => {
    const roots = generateFieldLayout({ ...settings, speciesIds: ['tulip'] }, PRESETS);
    const shoots = expandFieldFloweringShoots([roots[0]], PRESETS);
    expect(shoots).toHaveLength(1);
    expect(shoots[0].shootCount).toBe(1);
  });
});

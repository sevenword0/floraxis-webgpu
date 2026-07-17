import { describe, expect, it } from 'vitest';
import type { FieldSettings } from '../types';
import { PRESETS } from '../data/presets';
import {
  evaluateFieldBloom,
  exportIndividualFlower,
  flowersOverlapAtFullBloom,
  generateFieldLayout,
  parseIndividualFlowerExport,
} from './flower-field-layout';
import { sampleTerrainHeight } from './field-environment-layout';

const settings: FieldSettings = {
  count: 48,
  radius: 6,
  spacing: 0.42,
  bloomWave: 0.7,
  bloomVariance: 0.35,
  wind: 0.4,
  windTurbulence: 0.58,
  groundCover: 0.82,
  shrubDensity: 0.62,
  rockDensity: 0.38,
  terrainRelief: 0.32,
  seed: 8128,
  speciesIds: ['rose', 'tulip', 'lily'],
  individuals: {},
};

describe('preset flower-field layout', () => {
  it('is deterministic and keeps every requested plant inside the field', () => {
    const first = generateFieldLayout(settings, PRESETS);
    const second = generateFieldLayout(settings, PRESETS);

    expect(first).toEqual(second);
    expect(first).toHaveLength(settings.count);
    expect(first.every((plant) => Math.hypot(plant.x, plant.z) <= settings.radius)).toBe(true);
    expect(first.every((plant) => plant.groundY === sampleTerrainHeight(
      plant.x,
      plant.z,
      settings.radius,
      settings.terrainRelief,
      settings.seed,
    ))).toBe(true);
  });

  it('includes every enabled species and honours spacing in a roomy layout', () => {
    const roomy = generateFieldLayout({ ...settings, count: 18, radius: 8, spacing: 0.68 }, PRESETS.slice(0, 3));
    expect(new Set(roomy.map((plant) => plant.presetId))).toEqual(new Set(settings.speciesIds));

    for (let a = 0; a < roomy.length; a += 1) {
      for (let b = a + 1; b < roomy.length; b += 1) {
        expect(Math.hypot(roomy[a].x - roomy[b].x, roomy[a].z - roomy[b].z)).toBeGreaterThanOrEqual(0.68 * 0.9);
        expect(flowersOverlapAtFullBloom(roomy[a], roomy[b])).toBe(false);
      }
    }
  });

  it('keeps mature flower crowns separate in the default six-species field', () => {
    const defaultField = generateFieldLayout({
      ...settings,
      count: 120,
      radius: 6.5,
      spacing: 0.52,
      wind: 0.36,
      seed: 240617,
      speciesIds: PRESETS.map((preset) => preset.id),
    }, PRESETS);

    for (let a = 0; a < defaultField.length; a += 1) {
      for (let b = a + 1; b < defaultField.length; b += 1) {
        expect(flowersOverlapAtFullBloom(defaultField[a], defaultField[b])).toBe(false);
      }
    }
  });

  it('uses the tilted pedicel endpoint rather than only the stem roots for collisions', () => {
    const [template] = generateFieldLayout({ ...settings, count: 12 }, PRESETS.slice(0, 1));
    const tilted = {
      ...template,
      x: 0,
      z: 0,
      visualHeight: 2,
      matureRadius: 0.22,
      pedicelWorld: 0.8,
      headTiltDeg: 90,
      headAzimuthDeg: 90,
    };
    const neighbour = {
      ...template,
      x: 1,
      z: 0,
      visualHeight: 2,
      matureRadius: 0.22,
      pedicelWorld: 0,
    };

    expect(Math.hypot(tilted.x - neighbour.x, tilted.z - neighbour.z)).toBeGreaterThan(0.44);
    expect(flowersOverlapAtFullBloom(tilted, neighbour)).toBe(true);
    expect(flowersOverlapAtFullBloom(tilted, { ...neighbour, x: 1.5 })).toBe(false);
  });

  it('applies real-unit individual overrides and round-trips a portable flower file', () => {
    const overridden = generateFieldLayout({
      ...settings,
      individuals: {
        4: {
          presetId: 'sunflower',
          heightCm: 240,
          flowerDiameterCm: 16,
          headTiltDeg: 74,
          leafCount: 11,
          branchCount: 3,
        },
      },
    }, PRESETS);
    const plant = overridden[4];
    expect(plant.presetId).toBe('sunflower');
    expect(plant.heightCm).toBe(240);
    expect(plant.flowerDiameterCm).toBe(16);
    expect(plant.headTiltDeg).toBe(74);
    expect(plant.leafCount).toBe(11);

    const exported = exportIndividualFlower(plant);
    expect(parseIndividualFlowerExport(exported)).toMatchObject({
      presetId: 'sunflower',
      heightCm: 240,
      flowerDiameterCm: 16,
      headTiltDeg: 74,
    });
    expect(parseIndividualFlowerExport({ schema: 'other', version: 1 })).toBeUndefined();
  });

  it('maps delayed bloom to exact global endpoints', () => {
    expect(evaluateFieldBloom(0, 0.4)).toBe(0);
    expect(evaluateFieldBloom(0.25, 0.4)).toBe(0);
    expect(evaluateFieldBloom(0.7, 0.4)).toBeCloseTo(0.5, 5);
    expect(evaluateFieldBloom(1, 0.4)).toBe(1);
  });
});

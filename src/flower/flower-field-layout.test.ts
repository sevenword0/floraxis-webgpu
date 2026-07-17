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
import { generateFieldLayoutAnchors } from './field-layout-patterns';

const settings: FieldSettings = {
  count: 48,
  radius: 6,
  spacing: 0.42,
  bloomWave: 0.7,
  bloomVariance: 0.35,
  wind: 0.4,
  windTurbulence: 0.58,
  layoutMode: 'scatter',
  mixStrength: 1,
  rowsPerSpecies: 2,
  ringCount: 6,
  groundCover: 0.82,
  shrubDensity: 0.62,
  rockDensity: 0.38,
  terrainRelief: 0.32,
  seed: 8128,
  speciesIds: ['rose', 'tulip', 'lily'],
  colorRanges: {},
  stemScales: {},
  speciesVariations: {},
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

  it('keeps organised species groups at zero mixing and randomises only species at full mixing', () => {
    const modes = ['scatter', 'species-rows', 'concentric', 'species-sectors', 'radial-composite', 'flower-tunnel', 'flower-road-walls'] as const;
    const speciesPresets = PRESETS.slice(0, 3);
    for (const layoutMode of modes) {
      const layoutSettings = { ...settings, layoutMode, mixStrength: 0, count: 72, radius: 7 };
      const anchors = generateFieldLayoutAnchors(layoutSettings, speciesPresets.length);
      const grouped = generateFieldLayout(layoutSettings, speciesPresets);
      expect(grouped.map((plant) => plant.presetId)).toEqual(
        anchors.map((anchor) => speciesPresets[anchor.groupIndex].id),
      );

      const mixed = generateFieldLayout({ ...layoutSettings, mixStrength: 1 }, speciesPresets);
      const changed = mixed.filter((plant, index) => plant.presetId !== grouped[index].presetId).length;
      expect(changed).toBeGreaterThan(grouped.length * 0.4);
      expect(new Set(mixed.map((plant) => plant.presetId))).toEqual(new Set(speciesPresets.map((preset) => preset.id)));
    }
  });

  it('keeps mature crowns separate in every structured layout', () => {
    const modes = ['species-rows', 'concentric', 'species-sectors', 'radial-composite', 'flower-tunnel', 'flower-road-walls'] as const;
    for (const layoutMode of modes) {
      const plants = generateFieldLayout({
        ...settings,
        layoutMode,
        mixStrength: 0,
        count: 120,
        radius: 6.5,
        spacing: 0.52,
        wind: 0.36,
        speciesIds: PRESETS.map((preset) => preset.id),
      }, PRESETS);
      for (let a = 0; a < plants.length; a += 1) {
        for (let b = a + 1; b < plants.length; b += 1) {
          expect(flowersOverlapAtFullBloom(plants[a], plants[b])).toBe(false);
        }
      }
    }
  });

  it('assigns stable per-species colours and preserves corridor sides', () => {
    const coloured = generateFieldLayout({
      ...settings,
      layoutMode: 'flower-tunnel',
      speciesIds: ['hydrangea'],
      colorRanges: { hydrangea: { from: '#3050a0', to: '#e89ac4', strength: 1 } },
    }, PRESETS);
    expect(coloured).toEqual(generateFieldLayout({
      ...settings,
      layoutMode: 'flower-tunnel',
      speciesIds: ['hydrangea'],
      colorRanges: { hydrangea: { from: '#3050a0', to: '#e89ac4', strength: 1 } },
    }, PRESETS));
    expect(new Set(coloured.map((plant) => plant.flowerColor)).size).toBeGreaterThan(10);
    expect(coloured.every((plant) => Math.abs(plant.x) > 0.7)).toBe(true);
    expect(new Set(coloured.map((plant) => plant.layoutSide))).toEqual(new Set([-1, 1]));
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
          stemScale: 1.7,
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
    expect(plant.stemScale).toBe(1.7);
    expect(plant.headTiltDeg).toBe(74);
    expect(plant.leafCount).toBe(11);

    const exported = exportIndividualFlower(plant);
    expect(parseIndividualFlowerExport(exported)).toMatchObject({
      presetId: 'sunflower',
      heightCm: 240,
      flowerDiameterCm: 16,
      stemScale: 1.7,
      headTiltDeg: 74,
    });
    expect(parseIndividualFlowerExport({ schema: 'other', version: 1 })).toBeUndefined();
  });

  it('applies deterministic species stem scales and clamps imported individual overrides', () => {
    const speciesScaled = generateFieldLayout({
      ...settings,
      speciesIds: ['rose', 'tulip'],
      stemScales: { rose: 0.55, tulip: 1.85 },
    }, PRESETS);
    expect(speciesScaled.filter((plant) => plant.presetId === 'rose').every((plant) => plant.stemScale === 0.55)).toBe(true);
    expect(speciesScaled.filter((plant) => plant.presetId === 'tulip').every((plant) => plant.stemScale === 1.85)).toBe(true);

    const overridden = generateFieldLayout({
      ...settings,
      speciesIds: ['rose'],
      stemScales: { rose: 0.8 },
      individuals: { 0: { presetId: 'rose', stemScale: 99 } },
    }, PRESETS);
    expect(overridden[0].stemScale).toBe(2.2);
    expect(overridden.slice(1).every((plant) => plant.stemScale === 0.8)).toBe(true);
  });

  it('randomises same-species height and flower size within documented ranges', () => {
    const preset = PRESETS.find((item) => item.id === 'sunflower')!;
    const architecture = preset.architecture!;
    const variedSettings = {
      ...settings,
      count: 36,
      speciesIds: ['sunflower'],
      speciesVariations: { sunflower: { height: 1, flowerSize: 1 } },
    };
    const first = generateFieldLayout(variedSettings, PRESETS);
    const second = generateFieldLayout(variedSettings, PRESETS);
    expect(first).toEqual(second);
    expect(new Set(first.map((plant) => plant.heightCm.toFixed(2))).size).toBeGreaterThan(20);
    expect(new Set(first.map((plant) => plant.flowerDiameterCm.toFixed(2))).size).toBeGreaterThan(20);
    expect(first.every((plant) => plant.heightCm >= architecture.heightRangeCm[0]
      && plant.heightCm <= architecture.heightRangeCm[1])).toBe(true);
    expect(first.every((plant) => plant.flowerDiameterCm >= architecture.flowerDiameterRangeCm[0]
      && plant.flowerDiameterCm <= architecture.flowerDiameterRangeCm[1])).toBe(true);

    const uniform = generateFieldLayout({
      ...variedSettings,
      speciesVariations: { sunflower: { height: 0, flowerSize: 0 } },
    }, PRESETS);
    expect(new Set(uniform.map((plant) => plant.heightCm))).toEqual(new Set([architecture.defaultHeightCm]));
    expect(new Set(uniform.map((plant) => plant.flowerDiameterCm))).toEqual(new Set([architecture.defaultFlowerDiameterCm]));
  });

  it('uses the water surface as the lotus height datum and preserves it in exports', () => {
    const lotusField = generateFieldLayout({
      ...settings,
      count: 18,
      speciesIds: ['lotus'],
      speciesVariations: { lotus: { height: 0, flowerSize: 0 } },
    }, PRESETS);
    expect(lotusField.every((plant) => plant.heightReference === 'water-surface')).toBe(true);
    expect(lotusField.every((plant) => plant.heightCm === 137)).toBe(true);
    expect(exportIndividualFlower(lotusField[0]).heightReference).toBe('water-surface');

    const roseField = generateFieldLayout({ ...settings, count: 12, speciesIds: ['rose'] }, PRESETS);
    expect(roseField.every((plant) => plant.heightReference === 'root-zone')).toBe(true);
  });

  it('maps delayed bloom to exact global endpoints', () => {
    expect(evaluateFieldBloom(0, 0.4)).toBe(0);
    expect(evaluateFieldBloom(0.25, 0.4)).toBe(0);
    expect(evaluateFieldBloom(0.7, 0.4)).toBeCloseTo(0.5, 5);
    expect(evaluateFieldBloom(1, 0.4)).toBe(1);
  });
});

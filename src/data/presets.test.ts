import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { resolveBotanicalArchitecture } from './botanical-architecture';
import { sanitizePreset, validatePreset } from '../utils';

describe('botanical presets', () => {
  it('ships eight distinct, research-backed species presets', () => {
    expect(PRESETS).toHaveLength(8);
    expect(new Set(PRESETS.map((preset) => preset.id)).size).toBe(PRESETS.length);
    for (const preset of PRESETS) {
      expect(validatePreset(preset)).toBe(true);
      expect(preset.structure.length).toBeGreaterThanOrEqual(4);
      expect(preset.sources.length).toBeGreaterThanOrEqual(2);
      expect(preset.sources.every((source) => source.url.startsWith('https://'))).toBe(true);
      expect(preset.morphology.petalCount).toBeGreaterThanOrEqual(3);
      expect(preset.morphology.bloomDuration).toBeGreaterThan(0);
      expect(preset.morphology.budCurl).toBeGreaterThanOrEqual(0);
      expect(preset.morphology.unfurl).toBeGreaterThanOrEqual(0);
      expect(preset.morphology.innerCoil).toBeGreaterThanOrEqual(0);
      expect(preset.morphology.fold).toBeGreaterThanOrEqual(-0.6);
      expect(Math.abs(preset.morphology.twist)).toBeLessThanOrEqual(35);
      expect(preset.growth).toBeDefined();
      expect(preset.growth!.budHeadScale).toBeGreaterThanOrEqual(0.48);
      expect(preset.growth!.closedPetalLength).toBeLessThanOrEqual(1);
      expect(preset.growth!.closedPetalWidth).toBeLessThanOrEqual(1);
      expect(preset.growth!.observations.length).toBeGreaterThanOrEqual(2);
      expect(preset.growth!.mappingNote.length).toBeGreaterThan(12);
      const architecture = resolveBotanicalArchitecture(preset);
      expect(architecture.defaultHeightCm).toBeGreaterThanOrEqual(architecture.heightRangeCm[0]);
      expect(architecture.defaultHeightCm).toBeLessThanOrEqual(architecture.heightRangeCm[1]);
      expect(architecture.defaultFlowerDiameterCm).toBeGreaterThanOrEqual(architecture.flowerDiameterRangeCm[0]);
      expect(architecture.defaultFlowerDiameterCm).toBeLessThanOrEqual(architecture.flowerDiameterRangeCm[1]);
      expect(architecture.headTiltDeg).toBeGreaterThanOrEqual(0);
      expect(architecture.leafCount).toBeGreaterThanOrEqual(0);
      expect(architecture.notes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('includes compound hydrangea and pendant wisteria inflorescences', () => {
    const hydrangea = PRESETS.find((preset) => preset.id === 'hydrangea');
    const wisteria = PRESETS.find((preset) => preset.id === 'wisteria');
    expect(hydrangea?.kind).toBe('hydrangea');
    expect(hydrangea?.morphology.petalCount).toBe(96);
    expect(hydrangea?.structure.some((item) => item.includes('장식화'))).toBe(true);
    expect(wisteria?.kind).toBe('wisteria');
    expect(wisteria?.architecture?.stemHabit).toBe('climbing-vine');
    expect(wisteria?.structure.some((item) => item.includes('하수'))).toBe(true);
  });

  it('keeps sunflower disc florets as a composite head', () => {
    const sunflower = PRESETS.find((preset) => preset.id === 'sunflower');
    expect(sunflower?.kind).toBe('sunflower');
    expect(sunflower?.morphology.petalCount).toBeGreaterThanOrEqual(50);
    expect(sunflower?.morphology.discCount).toBeGreaterThanOrEqual(480);
    expect(sunflower?.structure.some((item) => item.includes('통상화'))).toBe(true);
  });

  it('clamps imported custom values to safe rendering bounds', () => {
    const unsafe = structuredClone(PRESETS[0]);
    unsafe.morphology.petalCount = 1000;
    unsafe.morphology.layers = -3;
    unsafe.morphology.openAngle = 999;
    unsafe.morphology.curl = -9;
    unsafe.morphology.budCurl = 9;
    unsafe.morphology.unfurl = -4;
    unsafe.morphology.innerCoil = 3;
    unsafe.morphology.fold = 9;
    unsafe.morphology.twist = -90;
    unsafe.growth!.budHeadScale = -1;
    unsafe.growth!.radialSpread = 99;
    const safe = sanitizePreset(unsafe);
    expect(safe.morphology.petalCount).toBe(96);
    expect(safe.morphology.layers).toBe(1);
    expect(safe.morphology.openAngle).toBe(142);
    expect(safe.morphology.curl).toBe(-0.35);
    expect(safe.morphology.budCurl).toBe(1.4);
    expect(safe.morphology.unfurl).toBe(0);
    expect(safe.morphology.innerCoil).toBe(1);
    expect(safe.morphology.fold).toBe(1.2);
    expect(safe.morphology.twist).toBe(-35);
    expect(safe.growth?.budHeadScale).toBe(0.48);
    expect(safe.growth?.radialSpread).toBe(1.5);
  });

  it('upgrades legacy custom presets that do not contain articulation controls', () => {
    const legacy = structuredClone(PRESETS[0]) as LegacyFlowerPreset;
    delete legacy.morphology.fold;
    delete legacy.morphology.budCurl;
    delete legacy.morphology.unfurl;
    delete legacy.morphology.innerCoil;

    expect(validatePreset(legacy as unknown as typeof PRESETS[number])).toBe(true);
    const upgraded = sanitizePreset(legacy as unknown as typeof PRESETS[number]).morphology;
    expect(upgraded.fold).toBe(0.22);
    expect(upgraded.budCurl).toBe(0);
    expect(upgraded.unfurl).toBe(0.45);
    expect(upgraded.innerCoil).toBe(0);
  });
});

type LegacyFlowerPreset = Omit<typeof PRESETS[number], 'morphology'> & {
  morphology: Omit<typeof PRESETS[number]['morphology'], 'fold' | 'budCurl' | 'unfurl' | 'innerCoil'> & {
    fold?: number;
    budCurl?: number;
    unfurl?: number;
    innerCoil?: number;
  };
};

import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { sanitizePreset, validatePreset } from '../utils';

describe('botanical presets', () => {
  it('ships six distinct, research-backed species presets', () => {
    expect(PRESETS).toHaveLength(6);
    expect(new Set(PRESETS.map((preset) => preset.id)).size).toBe(PRESETS.length);
    for (const preset of PRESETS) {
      expect(validatePreset(preset)).toBe(true);
      expect(preset.structure.length).toBeGreaterThanOrEqual(4);
      expect(preset.sources.length).toBeGreaterThanOrEqual(2);
      expect(preset.sources.every((source) => source.url.startsWith('https://'))).toBe(true);
      expect(preset.morphology.petalCount).toBeGreaterThanOrEqual(3);
      expect(preset.morphology.bloomDuration).toBeGreaterThan(0);
      expect(preset.morphology.fold).toBeGreaterThanOrEqual(-0.6);
      expect(Math.abs(preset.morphology.twist)).toBeLessThanOrEqual(35);
      expect(preset.growth).toBeDefined();
      expect(preset.growth!.budHeadScale).toBeGreaterThanOrEqual(0.48);
      expect(preset.growth!.closedPetalLength).toBeLessThanOrEqual(1);
      expect(preset.growth!.closedPetalWidth).toBeLessThanOrEqual(1);
      expect(preset.growth!.observations.length).toBeGreaterThanOrEqual(2);
      expect(preset.growth!.mappingNote.length).toBeGreaterThan(12);
    }
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
    unsafe.morphology.fold = 9;
    unsafe.morphology.twist = -90;
    unsafe.growth!.budHeadScale = -1;
    unsafe.growth!.radialSpread = 99;
    const safe = sanitizePreset(unsafe);
    expect(safe.morphology.petalCount).toBe(96);
    expect(safe.morphology.layers).toBe(1);
    expect(safe.morphology.openAngle).toBe(142);
    expect(safe.morphology.curl).toBe(-0.35);
    expect(safe.morphology.fold).toBe(1.2);
    expect(safe.morphology.twist).toBe(-35);
    expect(safe.growth?.budHeadScale).toBe(0.48);
    expect(safe.growth?.radialSpread).toBe(1.5);
  });

  it('upgrades legacy custom presets that do not contain a fold control', () => {
    const legacy = structuredClone(PRESETS[0]) as FlowerPresetWithoutFold;
    delete legacy.morphology.fold;

    expect(validatePreset(legacy)).toBe(true);
    expect(sanitizePreset(legacy as unknown as typeof PRESETS[number]).morphology.fold).toBe(0.22);
  });
});

type FlowerPresetWithoutFold = Omit<typeof PRESETS[number], 'morphology'> & {
  morphology: Omit<typeof PRESETS[number]['morphology'], 'fold'> & { fold?: number };
};

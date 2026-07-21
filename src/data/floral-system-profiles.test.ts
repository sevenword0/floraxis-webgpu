import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { resolveFloralSystemProfile } from './floral-system-profiles';
import { sanitizePreset } from '../utils';

describe('eFLOWER-derived floral system profiles', () => {
  it('ships a bounded trait and rational surface profile for every species', () => {
    for (const preset of PRESETS) {
      const profile = resolveFloralSystemProfile(preset);
      expect(profile.schemaVersion).toBe(1);
      expect(profile.traits.perianth.merism).toBeGreaterThan(0);
      expect(profile.traits.gynoecium.carpelCount).toBeGreaterThan(0);
      expect(profile.petalSurface.shoulderWidth).toBeGreaterThan(0.17);
      expect(profile.petalSurface.rationalWeight).toBeGreaterThanOrEqual(0.55);
      expect(profile.petalSurface.rationalWeight).toBeLessThanOrEqual(2);
    }
  });

  it('upgrades legacy exported presets and clamps unsafe surface controls', () => {
    const legacy = structuredClone(PRESETS[1]);
    delete legacy.floralSystem;
    const upgraded = sanitizePreset(legacy);
    expect(upgraded.floralSystem?.traits.perianth.merism).toBe(3);

    upgraded.floralSystem!.petalSurface.rationalWeight = 99;
    upgraded.floralSystem!.petalSurface.asymmetry = -5;
    const safe = sanitizePreset(upgraded);
    expect(safe.floralSystem?.petalSurface.rationalWeight).toBe(2);
    expect(safe.floralSystem?.petalSurface.asymmetry).toBe(-0.4);
  });
});

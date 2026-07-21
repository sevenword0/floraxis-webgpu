import type {
  FloralSystemProfile,
  FlowerPreset,
  ParametricPetalSurfaceProfile,
} from '../types';

const surface = (
  overrides: Partial<ParametricPetalSurfaceProfile>,
): ParametricPetalSurfaceProfile => ({
  baseWidth: 0.12,
  midWidth: 0.82,
  shoulderWidth: 1,
  tipWidth: 0.54,
  shoulderPosition: 0.72,
  midribArch: 0.1,
  lateralCup: 0.18,
  asymmetry: 0,
  rationalWeight: 1,
  ...overrides,
});

/**
 * Species/cultivar profiles translate eFLOWER-style categorical traits into
 * bounded render parameters. Counts describe the rendered representative,
 * while the preset morphology remains the authority for user-edited geometry.
 */
export const FLORAL_SYSTEM_PROFILES: Record<string, FloralSystemProfile> = {
  rose: {
    schemaVersion: 1,
    traits: {
      sex: 'bisexual', symmetry: 'actinomorphic', ovaryPosition: 'superior',
      perianth: { differentiation: 'sepals-petals', phyllotaxis: 'spiral', whorls: 4, merism: 5, fusion: 'free' },
      androecium: { phyllotaxis: 'spiral', whorls: 4, merism: 5, count: 32, filamentFusion: 'free', antherOrientation: 'introrse' },
      gynoecium: { phyllotaxis: 'spiral', carpelCount: 18, ovaryFusion: 'free', ovulesPerCarpel: 1 },
    },
    petalSurface: surface({ baseWidth: 0.16, midWidth: 0.9, shoulderWidth: 1.08, tipWidth: 0.72, shoulderPosition: 0.76, midribArch: 0.09, lateralCup: 0.32, asymmetry: 0.08, rationalWeight: 1.18 }),
  },
  tulip: {
    schemaVersion: 1,
    traits: {
      sex: 'bisexual', symmetry: 'actinomorphic', ovaryPosition: 'superior',
      perianth: { differentiation: 'tepals', phyllotaxis: 'whorled', whorls: 2, merism: 3, fusion: 'free' },
      androecium: { phyllotaxis: 'whorled', whorls: 2, merism: 3, count: 6, filamentFusion: 'free', antherOrientation: 'introrse' },
      gynoecium: { phyllotaxis: 'whorled', carpelCount: 3, ovaryFusion: 'fused', ovulesPerCarpel: 24 },
    },
    petalSurface: surface({ baseWidth: 0.22, midWidth: 0.74, shoulderWidth: 1.04, tipWidth: 0.68, shoulderPosition: 0.78, midribArch: 0.06, lateralCup: 0.42, rationalWeight: 1.08 }),
  },
  lily: {
    schemaVersion: 1,
    traits: {
      sex: 'bisexual', symmetry: 'actinomorphic', ovaryPosition: 'superior',
      perianth: { differentiation: 'tepals', phyllotaxis: 'whorled', whorls: 2, merism: 3, fusion: 'free' },
      androecium: { phyllotaxis: 'whorled', whorls: 2, merism: 3, count: 6, filamentFusion: 'free', antherOrientation: 'introrse' },
      gynoecium: { phyllotaxis: 'whorled', carpelCount: 3, ovaryFusion: 'fused', ovulesPerCarpel: 40 },
    },
    petalSurface: surface({ baseWidth: 0.1, midWidth: 0.74, shoulderWidth: 0.82, tipWidth: 0.08, shoulderPosition: 0.6, midribArch: 0.24, lateralCup: 0.14, asymmetry: 0.02, rationalWeight: 0.9 }),
  },
  sakura: {
    schemaVersion: 1,
    traits: {
      sex: 'bisexual', symmetry: 'actinomorphic', ovaryPosition: 'superior',
      perianth: { differentiation: 'sepals-petals', phyllotaxis: 'whorled', whorls: 1, merism: 5, fusion: 'free' },
      androecium: { phyllotaxis: 'whorled', whorls: 3, merism: 5, count: 26, filamentFusion: 'free', antherOrientation: 'introrse' },
      gynoecium: { phyllotaxis: 'whorled', carpelCount: 1, ovaryFusion: 'free', ovulesPerCarpel: 2 },
    },
    petalSurface: surface({ baseWidth: 0.1, midWidth: 0.88, shoulderWidth: 1.12, tipWidth: 0.86, shoulderPosition: 0.7, midribArch: 0.05, lateralCup: 0.12, asymmetry: 0.04, rationalWeight: 1.22 }),
  },
  lotus: {
    schemaVersion: 1,
    traits: {
      sex: 'bisexual', symmetry: 'actinomorphic', ovaryPosition: 'embedded',
      perianth: { differentiation: 'sepals-petals', phyllotaxis: 'spiral', whorls: 5, merism: 4, fusion: 'free' },
      androecium: { phyllotaxis: 'spiral', whorls: 7, merism: 8, count: 56, filamentFusion: 'free', antherOrientation: 'introrse' },
      gynoecium: { phyllotaxis: 'spiral', carpelCount: 18, ovaryFusion: 'free', ovulesPerCarpel: 1 },
    },
    petalSurface: surface({ baseWidth: 0.13, midWidth: 0.78, shoulderWidth: 0.96, tipWidth: 0.3, shoulderPosition: 0.68, midribArch: 0.16, lateralCup: 0.28, asymmetry: 0.02, rationalWeight: 1.12 }),
  },
  sunflower: {
    schemaVersion: 1,
    traits: {
      sex: 'bisexual', symmetry: 'zygomorphic', ovaryPosition: 'inferior',
      perianth: { differentiation: 'reduced', phyllotaxis: 'clustered', whorls: 1, merism: 5, fusion: 'fused' },
      androecium: { phyllotaxis: 'whorled', whorls: 1, merism: 5, count: 5, filamentFusion: 'free', antherOrientation: 'introrse' },
      gynoecium: { phyllotaxis: 'whorled', carpelCount: 2, ovaryFusion: 'fused', ovulesPerCarpel: 1 },
    },
    petalSurface: surface({ baseWidth: 0.08, midWidth: 0.58, shoulderWidth: 0.7, tipWidth: 0.18, shoulderPosition: 0.64, midribArch: 0.12, lateralCup: 0.08, asymmetry: 0.03, rationalWeight: 0.9 }),
  },
  hydrangea: {
    schemaVersion: 1,
    traits: {
      sex: 'bisexual', symmetry: 'actinomorphic', ovaryPosition: 'inferior',
      perianth: { differentiation: 'sepals-petals', phyllotaxis: 'clustered', whorls: 1, merism: 4, fusion: 'free' },
      androecium: { phyllotaxis: 'whorled', whorls: 2, merism: 4, count: 8, filamentFusion: 'free', antherOrientation: 'introrse' },
      gynoecium: { phyllotaxis: 'whorled', carpelCount: 3, ovaryFusion: 'fused', ovulesPerCarpel: 20 },
    },
    petalSurface: surface({ baseWidth: 0.1, midWidth: 0.86, shoulderWidth: 1.04, tipWidth: 0.48, shoulderPosition: 0.64, midribArch: 0.05, lateralCup: 0.1, asymmetry: 0.08, rationalWeight: 1.18 }),
  },
  wisteria: {
    schemaVersion: 1,
    traits: {
      sex: 'bisexual', symmetry: 'zygomorphic', ovaryPosition: 'superior',
      perianth: { differentiation: 'sepals-petals', phyllotaxis: 'clustered', whorls: 1, merism: 5, fusion: 'basally-fused' },
      androecium: { phyllotaxis: 'whorled', whorls: 2, merism: 5, count: 10, filamentFusion: 'basally-fused', antherOrientation: 'introrse' },
      gynoecium: { phyllotaxis: 'whorled', carpelCount: 1, ovaryFusion: 'free', ovulesPerCarpel: 8 },
    },
    petalSurface: surface({ baseWidth: 0.18, midWidth: 0.8, shoulderWidth: 1.02, tipWidth: 0.58, shoulderPosition: 0.66, midribArch: 0.14, lateralCup: 0.36, asymmetry: 0.22, rationalWeight: 1.26 }),
  },
};

const clamp = (value: number, min: number, max: number, fallback: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));

const fallbackProfileId = (preset: FlowerPreset): string => {
  if (preset.kind !== 'radial') return preset.kind;
  const morphology = preset.morphology;
  if (morphology.petalCount === 5 || morphology.petalShape === 'notched') return 'sakura';
  if (morphology.petalCount === 6 && morphology.petalShape === 'lance') return 'lily';
  if (morphology.petalCount === 6) return 'tulip';
  if (morphology.petalCount >= 34) return 'rose';
  if (morphology.stamens >= 45) return 'lotus';
  return 'rose';
};

const copyProfile = (profile: FloralSystemProfile): FloralSystemProfile =>
  JSON.parse(JSON.stringify(profile)) as FloralSystemProfile;

/** Resolve old exported presets and clamp custom rational surfaces to safe ranges. */
export const normalizeFloralSystemProfile = (preset: FlowerPreset): FloralSystemProfile => {
  const base = copyProfile(
    preset.floralSystem
      ?? FLORAL_SYSTEM_PROFILES[preset.id]
      ?? FLORAL_SYSTEM_PROFILES[fallbackProfileId(preset)],
  );
  const petal = base.petalSurface;
  petal.baseWidth = clamp(petal.baseWidth, 0.02, 0.8, 0.12);
  petal.midWidth = clamp(petal.midWidth, 0.18, 1.4, 0.82);
  petal.shoulderWidth = clamp(petal.shoulderWidth, 0.18, 1.5, 1);
  petal.tipWidth = clamp(petal.tipWidth, 0.02, 1.35, 0.54);
  petal.shoulderPosition = clamp(petal.shoulderPosition, 0.35, 0.9, 0.72);
  petal.midribArch = clamp(petal.midribArch, -0.3, 0.55, 0.1);
  petal.lateralCup = clamp(petal.lateralCup, -0.3, 0.7, 0.18);
  petal.asymmetry = clamp(petal.asymmetry, -0.4, 0.4, 0);
  petal.rationalWeight = clamp(petal.rationalWeight, 0.55, 2, 1);
  base.traits.perianth.whorls = Math.round(clamp(base.traits.perianth.whorls, 1, 12, 1));
  base.traits.perianth.merism = Math.round(clamp(base.traits.perianth.merism, 1, 12, 5));
  base.traits.androecium.whorls = Math.round(clamp(base.traits.androecium.whorls, 1, 12, 1));
  base.traits.androecium.merism = Math.round(clamp(base.traits.androecium.merism, 1, 20, 5));
  base.traits.androecium.count = Math.round(clamp(base.traits.androecium.count, 0, 120, preset.morphology.stamens));
  base.traits.gynoecium.carpelCount = Math.round(clamp(base.traits.gynoecium.carpelCount, 1, 80, 1));
  base.traits.gynoecium.ovulesPerCarpel = Math.round(clamp(base.traits.gynoecium.ovulesPerCarpel, 1, 200, 1));
  return base;
};

export const resolveFloralSystemProfile = (preset: FlowerPreset): FloralSystemProfile =>
  normalizeFloralSystemProfile(preset);

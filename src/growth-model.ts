import type { BloomGrowthProfile, FlowerPreset } from './types';

export const DEFAULT_GROWTH_PROFILE: BloomGrowthProfile = {
  budHeadScale: 0.82,
  closedPetalLength: 0.88,
  closedPetalWidth: 0.74,
  swellingEnd: 0.34,
  openingStart: 0.16,
  openingSpan: 0.68,
  basalEpinasty: 0.18,
  marginGrowth: 0.12,
  radialSpread: 1,
  reproductiveReveal: 0.46,
  arrangement: '방사형 기관 배열',
  observations: ['직접 계측값이 없는 커스텀 프리셋에는 보수적인 기본 생장 곡선을 적용합니다.'],
  mappingNote: '기준 형태의 정규화된 기본 계수입니다.',
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const x = clamp01((value - edge0) / Math.max(0.00001, edge1 - edge0));
  return x * x * (3 - 2 * x);
};

export const resolveGrowthProfile = (preset: Pick<FlowerPreset, 'growth'>): BloomGrowthProfile =>
  preset.growth ?? DEFAULT_GROWTH_PROFILE;

export const evaluateHeadGrowth = (profile: BloomGrowthProfile, progress: number): number => {
  const normalized = clamp01(progress);
  const swell = smoothstep(0, profile.swellingEnd, normalized);
  const deploy = smoothstep(profile.swellingEnd, 1, normalized);
  const swollenBud = profile.budHeadScale + (0.955 - profile.budHeadScale) * swell;
  return swollenBud + (1 - swollenBud) * deploy;
};

export const evaluateReproductiveReveal = (profile: BloomGrowthProfile, progress: number): number =>
  smoothstep(profile.reproductiveReveal, Math.min(1, profile.reproductiveReveal + 0.28), progress);

export const normalizeGrowthProfile = (profile?: Partial<BloomGrowthProfile>): BloomGrowthProfile => {
  const merged = { ...DEFAULT_GROWTH_PROFILE, ...profile };
  const finite = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const observations = Array.isArray(merged.observations)
    ? merged.observations.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : DEFAULT_GROWTH_PROFILE.observations;
  return {
    ...merged,
    budHeadScale: Math.min(0.98, Math.max(0.48, finite(merged.budHeadScale, DEFAULT_GROWTH_PROFILE.budHeadScale))),
    closedPetalLength: Math.min(1, Math.max(0.42, finite(merged.closedPetalLength, DEFAULT_GROWTH_PROFILE.closedPetalLength))),
    closedPetalWidth: Math.min(1, Math.max(0.34, finite(merged.closedPetalWidth, DEFAULT_GROWTH_PROFILE.closedPetalWidth))),
    swellingEnd: Math.min(0.68, Math.max(0.12, finite(merged.swellingEnd, DEFAULT_GROWTH_PROFILE.swellingEnd))),
    openingStart: Math.min(0.72, Math.max(0.02, finite(merged.openingStart, DEFAULT_GROWTH_PROFILE.openingStart))),
    openingSpan: Math.min(0.9, Math.max(0.18, finite(merged.openingSpan, DEFAULT_GROWTH_PROFILE.openingSpan))),
    basalEpinasty: Math.min(1, Math.max(0, finite(merged.basalEpinasty, DEFAULT_GROWTH_PROFILE.basalEpinasty))),
    marginGrowth: Math.min(1, Math.max(0, finite(merged.marginGrowth, DEFAULT_GROWTH_PROFILE.marginGrowth))),
    radialSpread: Math.min(1.5, Math.max(0.55, finite(merged.radialSpread, DEFAULT_GROWTH_PROFILE.radialSpread))),
    reproductiveReveal: Math.min(0.82, Math.max(0.2, finite(merged.reproductiveReveal, DEFAULT_GROWTH_PROFILE.reproductiveReveal))),
    arrangement: typeof merged.arrangement === 'string' && merged.arrangement.trim() ? merged.arrangement : DEFAULT_GROWTH_PROFILE.arrangement,
    observations: observations.length > 0 ? observations : DEFAULT_GROWTH_PROFILE.observations,
    mappingNote: typeof merged.mappingNote === 'string' && merged.mappingNote.trim() ? merged.mappingNote : DEFAULT_GROWTH_PROFILE.mappingNote,
  };
};

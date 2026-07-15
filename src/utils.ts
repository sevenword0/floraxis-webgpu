import type { BloomStage, FlowerPreset } from './types';
import { normalizeGrowthProfile } from './growth-model';

export const BLOOM_STAGES: BloomStage[] = [
  { id: 'bud', label: '꽃봉오리', range: [0, 0.14], detail: '화피가 중심 기관을 감싸 보호합니다.' },
  { id: 'swell', label: '팽윤', range: [0.14, 0.34], detail: '세포 팽창과 수분 이동으로 꽃봉오리가 부풉니다.' },
  { id: 'separate', label: '이완', range: [0.34, 0.56], detail: '화피 사이의 겹침이 풀리고 첫 틈이 생깁니다.' },
  { id: 'anthesis', label: '개화', range: [0.56, 0.82], detail: '차등 성장으로 꽃잎 각도와 곡률이 빠르게 변합니다.' },
  { id: 'full', label: '완전 개화', range: [0.82, 1.01], detail: '수술과 암술이 드러나며 최종 형태에 도달합니다.' },
];

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const x = clamp01((value - edge0) / Math.max(0.00001, edge1 - edge0));
  return x * x * (3 - 2 * x);
};

export const smootherstep = (value: number): number => {
  const x = clamp01(value);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export const remapBloom = (progress: number, delay: number, span = 0.72): number =>
  smootherstep((progress - delay) / Math.max(0.08, span));

export const getBloomStage = (progress: number): BloomStage =>
  BLOOM_STAGES.find((stage) => progress >= stage.range[0] && progress < stage.range[1]) ?? BLOOM_STAGES.at(-1)!;

export const deepClonePreset = (preset: FlowerPreset): FlowerPreset => JSON.parse(JSON.stringify(preset)) as FlowerPreset;

export const formatPercent = (value: number): string => `${Math.round(clamp01(value) * 100)}%`;

export const validatePreset = (value: unknown): value is FlowerPreset => {
  if (!value || typeof value !== 'object') return false;
  const preset = value as Partial<FlowerPreset>;
  const morphology = preset.morphology as Partial<FlowerPreset['morphology']> | undefined;
  const colors = preset.colors as Partial<FlowerPreset['colors']> | undefined;
  return Boolean(
    preset.id &&
    preset.name &&
    preset.kind &&
    morphology &&
    Number.isFinite(morphology.petalCount) &&
    Number.isFinite(morphology.layers) &&
    Number.isFinite(morphology.petalLength) &&
    Number.isFinite(morphology.openAngle) &&
    colors?.base &&
    colors.tip &&
    colors.center,
  );
};

export const sanitizePreset = (input: FlowerPreset): FlowerPreset => {
  const preset = deepClonePreset(input);
  const m = preset.morphology;
  m.petalCount = Math.round(Math.min(96, Math.max(3, m.petalCount)));
  m.layers = Math.round(Math.min(6, Math.max(1, m.layers)));
  m.petalLength = Math.min(2.4, Math.max(0.45, m.petalLength));
  m.petalWidth = Math.min(1.4, Math.max(0.16, m.petalWidth));
  m.openAngle = Math.min(142, Math.max(18, m.openAngle));
  m.closedAngle = Math.min(28, Math.max(-8, m.closedAngle));
  m.curl = Math.min(1.2, Math.max(-0.35, m.curl));
  m.budCurl = Math.min(1.4, Math.max(0, Number.isFinite(m.budCurl) ? m.budCurl : 0));
  m.unfurl = Math.min(1, Math.max(0, Number.isFinite(m.unfurl) ? m.unfurl : 0.45));
  m.innerCoil = Math.min(1, Math.max(0, Number.isFinite(m.innerCoil) ? m.innerCoil : 0));
  m.fold = Math.min(1.2, Math.max(-0.6, Number.isFinite(m.fold) ? m.fold : 0.22));
  m.twist = Math.min(35, Math.max(-35, Number.isFinite(m.twist) ? m.twist : 0));
  m.cup = Math.min(0.8, Math.max(-0.2, m.cup));
  m.waviness = Math.min(0.3, Math.max(0, m.waviness));
  m.stagger = Math.min(0.65, Math.max(0, m.stagger));
  m.sssStrength = Math.min(1, Math.max(0, m.sssStrength));
  m.roughness = Math.min(1, Math.max(0.1, m.roughness));
  m.stamens = Math.round(Math.min(90, Math.max(0, m.stamens)));
  m.discCount = Math.round(Math.min(520, Math.max(0, m.discCount)));
  preset.growth = normalizeGrowthProfile(preset.growth);
  return preset;
};

export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

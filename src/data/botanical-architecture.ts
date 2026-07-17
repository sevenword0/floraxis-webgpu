import type {
  BotanicalArchitecture,
  FlowerPreset,
  HeadFacing,
  IndividualFlowerSettings,
  LeafShape,
  StemHabit,
} from '../types';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const FALLBACK_ARCHITECTURE: BotanicalArchitecture = {
  heightRangeCm: [35, 180],
  defaultHeightCm: 110,
  flowerDiameterRangeCm: [5, 18],
  defaultFlowerDiameterCm: 10,
  headFacing: 'upward',
  headTiltDeg: 8,
  headAzimuthDeg: null,
  pedicelLengthCm: 4,
  stemHabit: 'upright',
  branchCount: 1,
  branchAngleDeg: 34,
  leafShape: 'lanceolate',
  leafArrangement: 'alternate',
  leafCount: 5,
  leafLengthCm: 12,
  leafWidthCm: 4,
  notes: ['기존 커스텀 프리셋에 적용되는 일반 초본 구조입니다.'],
};

const finite = (value: number | undefined, fallback: number): number => Number.isFinite(value) ? value! : fallback;

/** Upgrades legacy presets and clamps research-unit values to safe rendering bounds. */
export const resolveBotanicalArchitecture = (preset: FlowerPreset): BotanicalArchitecture => {
  const input = preset.architecture;
  if (!input) {
    const height = clamp(preset.morphology.stemHeight * 52, 20, 420);
    const diameter = clamp((preset.morphology.petalLength + preset.morphology.headRadius) * 7.2, 3, 42);
    return {
      ...FALLBACK_ARCHITECTURE,
      heightRangeCm: [height * 0.72, height * 1.28],
      defaultHeightCm: height,
      flowerDiameterRangeCm: [diameter * 0.72, diameter * 1.28],
      defaultFlowerDiameterCm: diameter,
      notes: [...FALLBACK_ARCHITECTURE.notes],
    };
  }

  const heightMin = clamp(finite(input.heightRangeCm?.[0], FALLBACK_ARCHITECTURE.heightRangeCm[0]), 8, 2500);
  const heightMax = clamp(finite(input.heightRangeCm?.[1], FALLBACK_ARCHITECTURE.heightRangeCm[1]), heightMin, 3000);
  const flowerMin = clamp(finite(input.flowerDiameterRangeCm?.[0], FALLBACK_ARCHITECTURE.flowerDiameterRangeCm[0]), 1.5, 80);
  const flowerMax = clamp(finite(input.flowerDiameterRangeCm?.[1], FALLBACK_ARCHITECTURE.flowerDiameterRangeCm[1]), flowerMin, 120);
  return {
    ...FALLBACK_ARCHITECTURE,
    ...input,
    heightRangeCm: [heightMin, heightMax],
    defaultHeightCm: clamp(finite(input.defaultHeightCm, (heightMin + heightMax) * 0.5), heightMin, heightMax),
    flowerDiameterRangeCm: [flowerMin, flowerMax],
    defaultFlowerDiameterCm: clamp(finite(input.defaultFlowerDiameterCm, (flowerMin + flowerMax) * 0.5), flowerMin, flowerMax),
    headTiltDeg: clamp(finite(input.headTiltDeg, FALLBACK_ARCHITECTURE.headTiltDeg), 0, 135),
    headAzimuthDeg: input.headAzimuthDeg === null ? null : ((finite(input.headAzimuthDeg, 0) % 360) + 360) % 360,
    pedicelLengthCm: clamp(finite(input.pedicelLengthCm, FALLBACK_ARCHITECTURE.pedicelLengthCm), 0, 60),
    branchCount: Math.round(clamp(finite(input.branchCount, FALLBACK_ARCHITECTURE.branchCount), 0, 10)),
    branchAngleDeg: clamp(finite(input.branchAngleDeg, FALLBACK_ARCHITECTURE.branchAngleDeg), 5, 88),
    leafCount: Math.round(clamp(finite(input.leafCount, FALLBACK_ARCHITECTURE.leafCount), 0, 24)),
    leafLengthCm: clamp(finite(input.leafLengthCm, FALLBACK_ARCHITECTURE.leafLengthCm), 1, 100),
    leafWidthCm: clamp(finite(input.leafWidthCm, FALLBACK_ARCHITECTURE.leafWidthCm), 0.4, 100),
    notes: Array.isArray(input.notes) && input.notes.length > 0 ? [...input.notes] : [...FALLBACK_ARCHITECTURE.notes],
  };
};

export const sanitizeIndividualFlowerSettings = (
  value: IndividualFlowerSettings,
  preset: FlowerPreset,
): IndividualFlowerSettings => {
  const architecture = resolveBotanicalArchitecture(preset);
  return {
    ...(value.presetId ? { presetId: value.presetId } : {}),
    ...(Number.isFinite(value.heightCm) ? { heightCm: clamp(value.heightCm!, 8, 3000) } : {}),
    ...(Number.isFinite(value.flowerDiameterCm) ? { flowerDiameterCm: clamp(value.flowerDiameterCm!, 1.5, 120) } : {}),
    ...(Number.isFinite(value.stemScale) ? { stemScale: clamp(value.stemScale!, 0.35, 2.2) } : {}),
    ...(Number.isFinite(value.headTiltDeg) ? { headTiltDeg: clamp(value.headTiltDeg!, 0, 135) } : {}),
    ...(Number.isFinite(value.headAzimuthDeg) ? { headAzimuthDeg: ((value.headAzimuthDeg! % 360) + 360) % 360 } : {}),
    ...(Number.isFinite(value.pedicelLengthCm) ? { pedicelLengthCm: clamp(value.pedicelLengthCm!, 0, 60) } : {}),
    ...(Number.isFinite(value.leafScale) ? { leafScale: clamp(value.leafScale!, 0.25, 2.5) } : {}),
    ...(Number.isFinite(value.leafCount) ? { leafCount: Math.round(clamp(value.leafCount!, 0, 24)) } : {}),
    ...(Number.isFinite(value.branchCount) ? { branchCount: Math.round(clamp(value.branchCount!, 0, 10)) } : {}),
    ...(Number.isFinite(value.branchAngleDeg) ? { branchAngleDeg: clamp(value.branchAngleDeg!, 5, 88) } : {}),
    ...(!Number.isFinite(value.heightCm) ? { heightCm: architecture.defaultHeightCm } : {}),
    ...(!Number.isFinite(value.flowerDiameterCm) ? { flowerDiameterCm: architecture.defaultFlowerDiameterCm } : {}),
  };
};

export const HEAD_FACING_LABEL: Record<HeadFacing, string> = {
  upward: '상향',
  outward: '측향',
  drooping: '하향·늘어짐',
};

export const STEM_HABIT_LABEL: Record<StemHabit, string> = {
  shrub: '분지 관목',
  scape: '곧은 꽃대',
  'erect-leafy': '잎 달린 직립 줄기',
  'woody-branch': '목질 가지',
  'aquatic-scape': '수생 꽃자루',
  upright: '직립 줄기',
  'climbing-vine': '목질 덩굴',
};

export const LEAF_SHAPE_LABEL: Record<LeafShape, string> = {
  'compound-pinnate': '우상복엽·톱니',
  'broad-lanceolate': '넓은 피침형',
  lanceolate: '피침형',
  'elliptic-serrate': '타원형·톱니',
  'peltate-orbicular': '방패형 원형',
  'ovate-serrate': '난형·톱니',
};

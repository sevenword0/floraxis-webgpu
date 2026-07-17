import type { LeafShape, StemHabit } from '../types';

export interface BotanicalCurvatureProfile {
  /** Maximum lateral stem bow as a fraction of the rendered stem length. */
  stemBendRatio: number;
  /** Longitudinal rise around the middle of the leaf blade. */
  leafMidribArch: number;
  /** Downward displacement accumulated toward the leaf tip. */
  leafTipDroop: number;
  /** Additional upward cup applied toward both leaf margins. */
  leafEdgeCup: number;
}

export interface MutablePoint3 {
  x: number;
  y: number;
  z: number;
}

export const FIELD_STEM_CURVE_SEGMENTS = 4;

const STEM_BEND_BY_HABIT: Record<StemHabit, number> = {
  shrub: 0.042,
  scape: 0.018,
  'erect-leafy': 0.024,
  'woody-branch': 0.038,
  'aquatic-scape': 0.027,
  upright: 0.021,
  'climbing-vine': 0.054,
};

const LEAF_CURVATURE: Record<LeafShape, Pick<BotanicalCurvatureProfile, 'leafMidribArch' | 'leafTipDroop' | 'leafEdgeCup'>> = {
  lanceolate: { leafMidribArch: 0.03, leafTipDroop: 0.065, leafEdgeCup: 0.018 },
  'broad-lanceolate': { leafMidribArch: 0.048, leafTipDroop: 0.075, leafEdgeCup: 0.026 },
  'ovate-serrate': { leafMidribArch: 0.055, leafTipDroop: 0.082, leafEdgeCup: 0.034 },
  'elliptic-serrate': { leafMidribArch: 0.045, leafTipDroop: 0.068, leafEdgeCup: 0.03 },
  'compound-pinnate': { leafMidribArch: 0.026, leafTipDroop: 0.046, leafEdgeCup: 0.022 },
  'peltate-orbicular': { leafMidribArch: 0.062, leafTipDroop: 0.034, leafEdgeCup: 0.042 },
};

export const resolveBotanicalCurvature = (
  stemHabit: StemHabit,
  leafShape: LeafShape,
): BotanicalCurvatureProfile => ({
  stemBendRatio: STEM_BEND_BY_HABIT[stemHabit],
  ...LEAF_CURVATURE[leafShape],
});

/**
 * Samples a bowed stem whose endpoints remain fixed. The eased sine envelope
 * gives both the root and floral attachment a near-vertical tangent while the
 * middle of the internode carries the visible species-specific curvature.
 */
export const sampleStemCurvePoint = <T extends MutablePoint3>(
  start: Readonly<MutablePoint3>,
  end: Readonly<MutablePoint3>,
  progress: number,
  bendDistance: number,
  azimuth: number,
  out: T,
): T => {
  const t = Math.min(1, Math.max(0, progress));
  const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * t)), 1.35);
  const lateral = Math.max(0, bendDistance) * envelope;
  out.x = start.x + (end.x - start.x) * t + Math.sin(azimuth) * lateral;
  out.y = start.y + (end.y - start.y) * t;
  out.z = start.z + (end.z - start.z) * t + Math.cos(azimuth) * lateral;
  return out;
};

/** Normalized vertical displacement for a blade growing from t=0 to t=1. */
export const sampleLeafBladeCurvature = (
  profile: BotanicalCurvatureProfile,
  progress: number,
  lateral: number,
): number => {
  const t = Math.min(1, Math.max(0, progress));
  const edge = Math.min(1, Math.abs(lateral));
  const span = Math.sin(Math.PI * t);
  return profile.leafMidribArch * span
    - profile.leafTipDroop * Math.pow(t, 1.8)
    + profile.leafEdgeCup * Math.pow(edge, 1.35) * span;
};

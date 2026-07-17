/**
 * The preset radii predate the real-height field renderer and read too heavily
 * once long stems are shown at measured proportions. Keep the preset ratios
 * and the per-species 35-220% control, but recalibrate their displayed radius.
 */
export const STEM_RADIUS_RECALIBRATION = 0.48;

export const displayStemRadius = (presetRadius: number, userScale = 1): number =>
  Math.max(0.001, presetRadius * STEM_RADIUS_RECALIBRATION * userScale);

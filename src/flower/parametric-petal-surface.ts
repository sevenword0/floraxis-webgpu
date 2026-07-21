import type { ParametricPetalSurfaceProfile, PetalShape } from '../types';

export interface RationalBezierControlPoint {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type RationalBezierControlNet = RationalBezierControlPoint[][];

export interface ParametricSurfacePoint {
  x: number;
  y: number;
  z: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const bernstein3 = (value: number): [number, number, number, number] => {
  const t = clamp01(value);
  const inverse = 1 - t;
  return [
    inverse * inverse * inverse,
    3 * t * inverse * inverse,
    3 * t * t * inverse,
    t * t * t,
  ];
};

const shapeTipFactor = (shape: PetalShape): number => {
  if (shape === 'lance') return 0.34;
  if (shape === 'pointed') return 0.5;
  if (shape === 'spoon') return 1.08;
  return 1;
};

/**
 * Creates the 4 x 4 weighted control lattice for a single-span clamped NURBS
 * surface (equivalent to a rational bicubic Bezier patch).
 */
export const createPetalControlNet = (
  profile: ParametricPetalSurfaceProfile,
  shape: PetalShape,
): RationalBezierControlNet => {
  const widths = [
    profile.baseWidth,
    profile.midWidth,
    profile.shoulderWidth,
    profile.tipWidth * shapeTipFactor(shape),
  ];
  const shoulder = Math.min(0.9, Math.max(0.35, profile.shoulderPosition));
  const rowsY = [0, shoulder * 0.42, shoulder, 1];
  const longitudinalMask = [0, 0.78, 1, 0.24];
  const columns = [-1, -1 / 3, 1 / 3, 1];

  return rowsY.map((y, row) => columns.map((side, column) => {
    const asymmetryGain = 1 + profile.asymmetry * side;
    const centerMask = 1 - side * side;
    const arch = profile.midribArch * longitudinalMask[row] * (0.28 + centerMask * 0.72);
    const cup = profile.lateralCup * longitudinalMask[row] * centerMask;
    const asymmetricLift = profile.asymmetry * side * longitudinalMask[row] * 0.12;
    const isWeightedInterior = row > 0 && row < 3 && column > 0 && column < 3;
    return {
      x: side * widths[row] * 0.5 * asymmetryGain,
      y,
      z: (arch + cup + asymmetricLift) * 0.22,
      w: isWeightedInterior ? profile.rationalWeight : 1,
    };
  }));
};

/** Evaluates a weighted tensor-product Bezier patch in normalized petal space. */
export const evaluateRationalBezierSurface = (
  controlNet: RationalBezierControlNet,
  u: number,
  v: number,
): ParametricSurfacePoint => {
  if (controlNet.length !== 4 || controlNet.some((row) => row.length !== 4)) {
    throw new Error('A rational bicubic petal requires a 4 x 4 control net.');
  }
  const basisU = bernstein3(u);
  const basisV = bernstein3(v);
  let x = 0;
  let y = 0;
  let z = 0;
  let denominator = 0;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const point = controlNet[row][column];
      const weightedBasis = basisV[row] * basisU[column] * point.w;
      x += point.x * weightedBasis;
      y += point.y * weightedBasis;
      z += point.z * weightedBasis;
      denominator += weightedBasis;
    }
  }
  const inverse = 1 / Math.max(1e-8, denominator);
  return { x: x * inverse, y: y * inverse, z: z * inverse };
};

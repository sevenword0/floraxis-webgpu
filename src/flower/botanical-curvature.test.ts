import { describe, expect, it } from 'vitest';
import {
  FIELD_STEM_CURVE_SEGMENTS,
  resolveBotanicalCurvature,
  sampleLeafBladeCurvature,
  sampleStemCurvePoint,
} from './botanical-curvature';

describe('botanical curvature', () => {
  it('keeps fixed stem endpoints and bows the segmented middle away from the axis', () => {
    const start = { x: 1, y: 0.2, z: -2 };
    const end = { x: 1.12, y: 2.2, z: -1.9 };
    const out = { x: 0, y: 0, z: 0 };

    expect(FIELD_STEM_CURVE_SEGMENTS).toBeGreaterThanOrEqual(4);
    expect(sampleStemCurvePoint(start, end, 0, 0.12, Math.PI / 2, out)).toEqual(start);
    expect(sampleStemCurvePoint(start, end, 1, 0.12, Math.PI / 2, out).x).toBeCloseTo(end.x);
    sampleStemCurvePoint(start, end, 0.5, 0.12, Math.PI / 2, out);
    expect(out.x).toBeGreaterThan((start.x + end.x) * 0.5 + 0.1);
  });

  it('gives flexible vines more stem bow than upright stems', () => {
    const vine = resolveBotanicalCurvature('climbing-vine', 'compound-pinnate');
    const upright = resolveBotanicalCurvature('upright', 'ovate-serrate');
    expect(vine.stemBendRatio).toBeGreaterThan(upright.stemBendRatio * 2);
  });

  it('arches the midrib, cups the margins, and lets the mature leaf tip droop', () => {
    const profile = resolveBotanicalCurvature('shrub', 'ovate-serrate');
    const middle = sampleLeafBladeCurvature(profile, 0.5, 0);
    const edge = sampleLeafBladeCurvature(profile, 0.5, 1);
    const tip = sampleLeafBladeCurvature(profile, 1, 0);
    expect(middle).toBeGreaterThan(0);
    expect(edge).toBeGreaterThan(middle);
    expect(tip).toBeLessThan(0);
  });
});

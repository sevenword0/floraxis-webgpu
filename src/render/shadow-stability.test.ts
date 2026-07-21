import { describe, expect, it } from 'vitest';
import {
  clampGroundSafePolarAngle,
  getStableShadowCoverage,
  MAX_GROUND_SAFE_POLAR_ANGLE,
} from './shadow-stability';

describe('getStableShadowCoverage', () => {
  it('keeps the specimen view inside a deeper light-space range', () => {
    const coverage = getStableShadowCoverage(4.5, 6, 80);

    expect(coverage.maxFar).toBe(18);
    expect(coverage.lightMargin).toBe(10);
    expect(coverage.shadowCameraFar).toBe(40);
  });

  it('expands both margin and depth for the cascaded-shadow QA scene', () => {
    const coverage = getStableShadowCoverage(9, 10, 80);

    expect(coverage.maxFar).toBeCloseTo(30.6);
    expect(coverage.lightMargin).toBe(16);
    expect(coverage.shadowCameraFar).toBeCloseTo(65.8);
  });

  it('caps cascade distance to the active camera while retaining caster margin', () => {
    const coverage = getStableShadowCoverage(40, 40, 20);

    expect(coverage.maxFar).toBe(20);
    expect(coverage.lightMargin).toBe(30);
    expect(coverage.shadowCameraFar).toBe(86);
  });
});

describe('clampGroundSafePolarAngle', () => {
  it('prevents diagnostic cameras from orbiting below the ground plane', () => {
    expect(clampGroundSafePolarAngle(Math.PI * 0.7)).toBe(MAX_GROUND_SAFE_POLAR_ANGLE);
    expect(clampGroundSafePolarAngle(Math.PI * 0.42)).toBeCloseTo(Math.PI * 0.42);
  });
});

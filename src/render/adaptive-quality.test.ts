import { describe, expect, it } from 'vitest';
import { AdaptiveQualityController, getAdaptiveQualityTuning } from './adaptive-quality';

describe('AdaptiveQualityController', () => {
  it('degrades only after sustained overload and observes a cooldown', () => {
    const controller = new AdaptiveQualityController('cinematic');

    expect(controller.observe(34, 0).changed).toBe(false);
    expect(controller.observe(34, 1000)).toMatchObject({ changed: true, tier: 'balanced' });
    expect(controller.observe(40, 2000)).toMatchObject({ changed: false, tier: 'balanced' });
    expect(controller.observe(40, 5200)).toMatchObject({ changed: false, tier: 'balanced' });
    expect(controller.observe(40, 6200)).toMatchObject({ changed: true, tier: 'reduced' });
  });

  it('recovers more slowly than it degrades and never exceeds the selected preference', () => {
    const controller = new AdaptiveQualityController('balanced');
    controller.observe(30, 0);
    controller.observe(30, 1000);
    expect(controller.tier).toBe('reduced');

    const recoveryTimes = [6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000];
    recoveryTimes.slice(0, 7).forEach((time) => {
      expect(controller.observe(8, time).changed).toBe(false);
    });
    expect(controller.observe(8, recoveryTimes[7])).toMatchObject({ changed: true, tier: 'balanced' });

    [20000, 21000, 22000, 23000, 24000, 25000, 26000, 27000].forEach((time) => controller.observe(7, time));
    expect(controller.tier).toBe('balanced');
  });

  it('resets to the requested profile and exposes power-of-two shadow maps', () => {
    const controller = new AdaptiveQualityController('balanced');
    expect(controller.setPreference('cinematic')).toMatchObject({ changed: true, tier: 'cinematic' });

    expect(getAdaptiveQualityTuning('reduced').shadowMapSize).toBe(512);
    expect(getAdaptiveQualityTuning('balanced').shadowMapSize).toBe(1024);
    expect(getAdaptiveQualityTuning('cinematic').shadowMapSize).toBe(2048);
  });

  it('ignores invalid timing samples', () => {
    const controller = new AdaptiveQualityController('balanced');
    expect(controller.observe(Number.NaN, 1000)).toEqual({
      tier: 'balanced',
      smoothedFrameMs: 0,
      changed: false,
    });
  });
});

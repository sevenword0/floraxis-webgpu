import { describe, expect, it } from 'vitest';
import { evaluateRoseVortex } from './rose-vortex';

describe('rose centre vortex', () => {
  it('affects only inner layers and gives every inner petal the same chirality', () => {
    const outer = evaluateRoseVortex(0, 0.2, 0.2, 0.58);
    const innerA = evaluateRoseVortex(0, 1, 0.1, 0.58);
    const innerB = evaluateRoseVortex(0, 1, 0.8, 0.58);

    expect(outer.sideCoil).toBeCloseTo(0);
    expect(innerA.sideCoil).toBeGreaterThan(0.75);
    expect(innerA.swirlYaw).toBeGreaterThan(0);
    expect(innerB.swirlYaw).toBeGreaterThan(0);
    expect(Math.sign(innerA.tangentialSweep)).toBe(Math.sign(innerB.tangentialSweep));
  });

  it('unwinds monotonically and reaches a fully released side at anthesis', () => {
    const samples = Array.from({ length: 21 }, (_, index) => (
      evaluateRoseVortex(index / 20, 1, 0.45, 0.58)
    ));
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index].sideCoil).toBeLessThanOrEqual(samples[index - 1].sideCoil + 1e-8);
    }
    expect(samples.at(-1)?.sideCoil).toBeCloseTo(0);
    expect(samples.at(-1)?.radialTuck).toBeCloseTo(0);
  });

  it('propagates the unwind around the inner ring instead of releasing simultaneously', () => {
    const earlyPhase = evaluateRoseVortex(0.52, 1, 0.05, 0.58);
    const latePhase = evaluateRoseVortex(0.52, 1, 0.95, 0.58);
    expect(latePhase.sideCoil).toBeGreaterThan(earlyPhase.sideCoil);
  });
});

import { describe, expect, it } from 'vitest';
import { PRESETS } from '../data/presets';
import {
  evaluateRoseCentreCoilMorphWeights,
  evaluateRoseVortex,
  usesRoseVortex,
} from './rose-vortex';

describe('rose centre vortex', () => {
  it('survives parameter editing when a rose preset becomes custom', () => {
    const rose = PRESETS.find((preset) => preset.id === 'rose')!;
    const tulip = PRESETS.find((preset) => preset.id === 'tulip')!;
    const editedRose = {
      ...rose,
      id: 'custom',
      morphology: { ...rose.morphology, petalWidth: rose.morphology.petalWidth * 1.18 },
    };
    const coiledTulip = {
      ...tulip,
      id: 'custom',
      morphology: { ...tulip.morphology, budCurl: 1 },
    };
    const { family: _legacyFamily, ...legacyEditedRose } = editedRose;

    expect(usesRoseVortex(rose)).toBe(true);
    expect(usesRoseVortex(editedRose)).toBe(true);
    expect(usesRoseVortex(legacyEditedRose)).toBe(true);
    expect(usesRoseVortex(coiledTulip)).toBe(false);
  });

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

  it('applies the centre coil after the currently blended unfurl poses', () => {
    const early = evaluateRoseCentreCoilMorphWeights([0.35, 0, 0], 0.8);
    const transition = evaluateRoseCentreCoilMorphWeights([0.25, 0.75, 0], 0.6);
    const open = evaluateRoseCentreCoilMorphWeights([0, 0, 1], 0.42);

    expect(early[0]).toBeCloseTo(0.52);
    expect(early[1]).toBeCloseTo(0.28);
    expect(transition[0]).toBe(0);
    expect(transition[1]).toBeCloseTo(0.15);
    expect(transition[2]).toBeCloseTo(0.45);
    expect(transition[3]).toBe(0);
    expect(open).toEqual([0, 0, 0, 0.42]);
    expect(early.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(0.8);
  });
});

import { describe, expect, it } from 'vitest';
import { evaluatePetalUnfurl } from './petal-unfurl';

describe('rose petal unfurl timeline', () => {
  it('moves through release, unfurl and reflex targets in order', () => {
    const bud = evaluatePetalUnfurl(0, 0, 0.62);
    const release = evaluatePetalUnfurl(0.2, 0, 0.62);
    const opening = evaluatePetalUnfurl(0.58, 0, 0.62);
    const reflex = evaluatePetalUnfurl(0.94, 0, 0.62);
    const open = evaluatePetalUnfurl(1, 0, 0.62);

    expect(bud.weights).toEqual([0, 0, 0]);
    expect(release.weights[0]).toBeGreaterThan(0.5);
    expect(opening.weights[1]).toBeGreaterThan(0.45);
    expect(reflex.weights[2]).toBeGreaterThan(0.4);
    expect(open.weights).toEqual([0, 0, 1]);
  });

  it('keeps deployment monotonic while pulsing contact separation mid-opening', () => {
    const samples = Array.from({ length: 21 }, (_, index) => evaluatePetalUnfurl(index / 20, 0.4, 0.62));
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index].deployment).toBeGreaterThanOrEqual(samples[index - 1].deployment);
    }
    expect(samples[0].contactSeparation).toBeCloseTo(0);
    expect(Math.max(...samples.map((sample) => sample.contactSeparation))).toBeGreaterThan(0.7);
    expect(samples.at(-1)?.contactSeparation).toBeCloseTo(0);
  });

  it('delays distal reflex for inner petals', () => {
    const outer = evaluatePetalUnfurl(0.84, 0, 0.62);
    const inner = evaluatePetalUnfurl(0.84, 1, 0.62);
    expect(outer.reflex).toBeGreaterThan(inner.reflex);
    expect(inner.weights[1]).toBeGreaterThan(outer.weights[1]);
  });
});

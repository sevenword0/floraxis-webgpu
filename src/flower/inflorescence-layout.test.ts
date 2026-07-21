import { describe, expect, it } from 'vitest';
import { generateInflorescencePetalSpecs } from './inflorescence-layout';

describe('compound inflorescence layout', () => {
  it('builds four-sepal hydrangea florets over a rounded head', () => {
    const specs = generateInflorescencePetalSpecs('hydrangea', 96);
    expect(specs).toHaveLength(96);
    expect(new Set(specs.map((spec) => spec.floretIndex)).size).toBe(24);
    expect(specs.filter((spec) => spec.role === 'fertile').length).toBeGreaterThan(0);
    expect(specs.every((spec) => Math.hypot(spec.originX, spec.originZ) <= 0.51)).toBe(true);
    expect(Math.max(...specs.map((spec) => spec.originY))).toBeGreaterThan(0.4);
  });

  it('tapers a wisteria raceme downward and opens from attachment to tip', () => {
    const specs = generateInflorescencePetalSpecs('wisteria', 90);
    expect(specs).toHaveLength(90);
    expect(new Set(specs.map((spec) => spec.floretIndex)).size).toBe(18);
    expect(Math.min(...specs.map((spec) => spec.originY))).toBeLessThan(-1.2);
    const first = specs.filter((spec) => spec.floretIndex === 0);
    const last = specs.filter((spec) => spec.floretIndex === 17);
    expect(Math.max(...first.map((spec) => spec.delay))).toBeLessThan(Math.min(...last.map((spec) => spec.delay)));
    expect(new Set(first.map((spec) => spec.role))).toEqual(new Set(['banner', 'wing', 'keel']));
  });
});

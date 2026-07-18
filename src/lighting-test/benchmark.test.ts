import { describe, expect, it } from 'vitest';
import { percentile, summarizeLightingBenchmark } from './benchmark';

describe('lighting benchmark summary', () => {
  it('interpolates percentiles without mutating the source order', () => {
    const samples = [30, 10, 20, 40];
    expect(percentile(samples, 0.5)).toBe(25);
    expect(percentile(samples, 0.95)).toBeCloseTo(38.5);
    expect(samples).toEqual([30, 10, 20, 40]);
  });

  it('classifies a stable 60 fps sample as a pass', () => {
    const result = summarizeLightingBenchmark(Array.from({ length: 120 }, () => 16.67), [8, 9, 10]);
    expect(result.sampleCount).toBe(120);
    expect(result.averageFps).toBeCloseTo(59.99, 1);
    expect(result.onePercentLowFps).toBeCloseTo(59.99, 1);
    expect(result.averageGpuMs).toBe(9);
    expect(result.verdict).toBe('pass');
  });

  it('uses p95 thresholds and ignores invalid timing values', () => {
    const result = summarizeLightingBenchmark([16, 17, 20, 28, 32, Number.NaN, 0]);
    expect(result.sampleCount).toBe(5);
    expect(result.p95FrameMs).toBeGreaterThan(28);
    expect(result.verdict).toBe('warn');
  });

  it('returns an empty but finite summary when no frames were sampled', () => {
    expect(summarizeLightingBenchmark([])).toEqual({
      sampleCount: 0,
      averageFps: 0,
      medianFrameMs: 0,
      p95FrameMs: 0,
      p99FrameMs: 0,
      onePercentLowFps: 0,
      averageGpuMs: null,
      verdict: 'pass',
    });
  });
});

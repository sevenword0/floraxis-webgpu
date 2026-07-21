export type BenchmarkVerdict = 'pass' | 'warn' | 'fail';

export interface LightingBenchmarkSummary {
  sampleCount: number;
  averageFps: number;
  medianFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  onePercentLowFps: number;
  averageGpuMs: number | null;
  verdict: BenchmarkVerdict;
}

const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;

export const percentile = (values: readonly number[], quantile: number): number => {
  const sorted = values.filter(finitePositive).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const clamped = Math.min(1, Math.max(0, quantile));
  const position = (sorted.length - 1) * clamped;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
};

export const summarizeLightingBenchmark = (
  frameSamplesMs: readonly number[],
  gpuSamplesMs: readonly number[] = [],
): LightingBenchmarkSummary => {
  const frames = frameSamplesMs.filter(finitePositive);
  const gpu = gpuSamplesMs.filter(finitePositive);
  const averageFrameMs = frames.length > 0
    ? frames.reduce((total, sample) => total + sample, 0) / frames.length
    : 0;
  const medianFrameMs = percentile(frames, 0.5);
  const p95FrameMs = percentile(frames, 0.95);
  const p99FrameMs = percentile(frames, 0.99);
  const verdict: BenchmarkVerdict = p95FrameMs <= 20
    ? 'pass'
    : p95FrameMs <= 33.34
      ? 'warn'
      : 'fail';

  return {
    sampleCount: frames.length,
    averageFps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
    medianFrameMs,
    p95FrameMs,
    p99FrameMs,
    onePercentLowFps: p99FrameMs > 0 ? 1000 / p99FrameMs : 0,
    averageGpuMs: gpu.length > 0 ? gpu.reduce((total, sample) => total + sample, 0) / gpu.length : null,
    verdict,
  };
};

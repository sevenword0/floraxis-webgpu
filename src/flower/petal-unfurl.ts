import { smoothstep } from '../utils';

export interface PetalUnfurlState {
  baseRelease: number;
  unfurl: number;
  reflex: number;
  deployment: number;
  contactSeparation: number;
  weights: [number, number, number];
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Converts one petal's normalized bloom time into sequential rose poses.
 * The first phase releases the petal base while the tip remains coiled, the
 * second propagates the unfurling wave, and the last reverses the distal curl.
 */
export const evaluatePetalUnfurl = (
  progress: number,
  layer: number,
  wave: number,
): PetalUnfurlState => {
  const local = clamp01(progress);
  const normalizedLayer = clamp01(layer);
  const waveBias = clamp01(wave);
  const releaseEnd = 0.24 + waveBias * 0.12;
  const reflexStart = Math.min(0.88, 0.7 + waveBias * 0.12 + normalizedLayer * 0.06);
  const baseRelease = smoothstep(0, releaseEnd, local);
  const unfurl = smoothstep(releaseEnd, reflexStart, local);
  const reflex = smoothstep(reflexStart, 1, local);

  let weights: [number, number, number];
  let deployment: number;
  if (local < releaseEnd) {
    weights = [baseRelease, 0, 0];
    deployment = baseRelease * 0.56;
  } else if (local < reflexStart) {
    weights = [1 - unfurl, unfurl, 0];
    deployment = 0.56 + unfurl * 0.34;
  } else {
    weights = [0, 1 - reflex, reflex];
    deployment = 0.9 + reflex * 0.1;
  }

  const separationPhase = smoothstep(releaseEnd * 0.32, reflexStart, local);
  const contactSeparation = Math.sin(Math.PI * separationPhase) * (1 - normalizedLayer * 0.18);
  return {
    baseRelease,
    unfurl,
    reflex,
    deployment: clamp01(deployment),
    contactSeparation: Math.max(0, contactSeparation),
    weights,
  };
};

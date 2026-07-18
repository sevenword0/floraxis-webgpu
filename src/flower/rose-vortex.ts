import { smoothstep } from '../utils';
import type { FlowerPreset } from '../types';

export interface RoseVortexState {
  /** Weight of the one-sided geometry roll morph. */
  sideCoil: number;
  /** Same-sign local yaw that makes the inner ring read as one vortex. */
  swirlYaw: number;
  /** Same-sign hinge sweep layered over the ordinary petal articulation. */
  tangentialSweep: number;
  /** Inward displacement retained while the side roll is wound. */
  radialTuck: number;
  /** Small lift that prevents tightly wound inner petals from sharing a plane. */
  lift: number;
}

export type RoseCentreCoilMorphWeights = [
  closed: number,
  released: number,
  unfurled: number,
  open: number,
];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const DEG = Math.PI / 180;

/**
 * Parameter editing turns a built-in preset into `custom`, so rose behaviour
 * must follow botanical lineage instead of the mutable UI identifier.
 */
export const usesRoseVortex = (
  preset: Pick<FlowerPreset, 'id' | 'kind' | 'morphology'> & { family?: string },
): boolean => {
  const family = typeof preset.family === 'string' ? preset.family.trim().toLowerCase() : '';
  const m = preset.morphology;
  const legacyCustomRose = preset.id === 'custom'
    && m.petalShape === 'round'
    && m.layers >= 3
    && m.petalCount >= 12
    && m.unfurl > 0.01
    && m.innerCoil > 0.01;
  const roseLineage = preset.id === 'rose' || family.includes('rosaceae') || legacyCustomRose;
  return roseLineage && preset.kind === 'radial' && preset.morphology.budCurl > 0.01;
};

/**
 * A clockwise, centre-only rose vortex. Petals farther around the ring retain
 * the coil slightly longer, creating a directional unwind instead of every
 * inner petal relaxing at once.
 */
export const evaluateRoseVortex = (
  progress: number,
  layer: number,
  phase: number,
  innerCoil: number,
): RoseVortexState => {
  const local = clamp01(progress);
  const normalizedLayer = clamp01(layer);
  const normalizedPhase = clamp01(phase);
  const centre = smoothstep(0.42, 0.94, normalizedLayer);
  const strength = clamp01(innerCoil * 1.38);
  const phaseDelay = normalizedPhase * 0.14 * centre;
  const unwind = smoothstep(
    0.16 + phaseDelay,
    Math.min(0.98, 0.84 + phaseDelay * 0.55 + normalizedLayer * 0.05),
    local,
  );
  const sideCoil = centre * strength * (1 - unwind);

  return {
    sideCoil,
    swirlYaw: sideCoil * (16 + normalizedLayer * 38) * DEG,
    tangentialSweep: sideCoil * (4 + normalizedLayer * 16) * DEG,
    radialTuck: sideCoil * (0.018 + normalizedLayer * 0.074),
    lift: sideCoil * (0.006 + normalizedLayer * 0.034),
  };
};

/**
 * Distributes the centre-coil strength across pose-specific additive morphs.
 * Each coil delta is generated after that pose's ordinary cup, fold, curl,
 * growth, and wave deformation, so the weighted coil remains the final layer.
 */
export const evaluateRoseCentreCoilMorphWeights = (
  unfurlWeights: readonly [released: number, unfurled: number, open: number],
  sideCoil: number,
): RoseCentreCoilMorphWeights => {
  const released = clamp01(unfurlWeights[0]);
  const unfurled = clamp01(unfurlWeights[1]);
  const open = clamp01(unfurlWeights[2]);
  const closed = Math.max(0, 1 - released - unfurled - open);
  const poseTotal = Math.max(1e-8, closed + released + unfurled + open);
  const strength = clamp01(sideCoil);
  return [closed, released, unfurled, open].map((weight) => (
    strength * weight / poseTotal
  )) as RoseCentreCoilMorphWeights;
};

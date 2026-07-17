import { smoothstep } from '../utils';

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

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const DEG = Math.PI / 180;

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

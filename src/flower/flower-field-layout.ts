import type { FieldSettings } from '../types';
import { clamp01, seededRandom } from '../utils';

export type FieldLod = 'near' | 'mid' | 'far';

export interface FieldPlant {
  index: number;
  presetId: string;
  x: number;
  z: number;
  scale: number;
  stemScale: number;
  yaw: number;
  bloomDelay: number;
  windPhase: number;
  lod: FieldLod;
}

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const normalizedSpecies = (speciesIds: string[]): string[] => {
  const unique = Array.from(new Set(speciesIds.filter(Boolean)));
  return unique.length > 0 ? unique : ['rose'];
};

const distanceSquared = (a: Pick<FieldPlant, 'x' | 'z'>, b: Pick<FieldPlant, 'x' | 'z'>): number => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
};

/**
 * Creates a deterministic, blue-noise-like circular planting layout. Rejection
 * sampling honours the requested spacing when the density allows it; a golden
 * angle fallback guarantees the requested plant count for deliberately dense
 * fields.
 */
export const generateFieldLayout = (
  settings: FieldSettings,
  availableSpeciesIds: string[],
): FieldPlant[] => {
  const count = Math.round(Math.min(420, Math.max(12, settings.count)));
  const radius = Math.min(10, Math.max(2.5, settings.radius));
  const spacing = Math.min(1.2, Math.max(0.12, settings.spacing));
  const allowed = new Set(availableSpeciesIds);
  const requested = normalizedSpecies(settings.speciesIds).filter((id) => allowed.has(id));
  const species = requested.length > 0 ? requested : normalizedSpecies(availableSpeciesIds);
  const random = seededRandom(Math.max(1, Math.round(settings.seed)) * 2654435761);
  const plants: FieldPlant[] = [];

  for (let index = 0; index < count; index += 1) {
    const scale = 0.46 + random() * 0.24;
    let x = 0;
    let z = 0;
    let accepted = false;

    for (let attempt = 0; attempt < 56; attempt += 1) {
      const usableRadius = Math.max(0.08, radius - spacing * 0.45);
      const candidateRadius = Math.sqrt(random()) * usableRadius;
      const angle = random() * TAU;
      x = Math.cos(angle) * candidateRadius;
      z = Math.sin(angle) * candidateRadius;
      const required = spacing * (0.82 + scale * 0.16);
      if (plants.every((plant) => distanceSquared({ x, z }, plant) >= required * required)) {
        accepted = true;
        break;
      }
    }

    if (!accepted) {
      const normalized = Math.sqrt((index + 0.5) / count);
      const fallbackRadius = normalized * Math.max(0.08, radius - spacing * 0.35);
      const angle = index * GOLDEN_ANGLE + random() * 0.24;
      x = Math.cos(angle) * fallbackRadius;
      z = Math.sin(angle) * fallbackRadius;
    }

    const radial = Math.hypot(x, z) / radius;
    const lod: FieldLod = radial < 0.48 ? 'near' : radial < 0.78 ? 'mid' : 'far';
    const waveCoordinate = clamp01(x / (radius * 2) + 0.5);
    const waveDelay = clamp01(settings.bloomWave) * waveCoordinate * 0.3;
    const variationDelay = random() * clamp01(settings.bloomVariance) * 0.24;
    const presetId = index < species.length
      ? species[index]
      : species[Math.floor(random() * species.length)];

    plants.push({
      index,
      presetId,
      x,
      z,
      scale,
      stemScale: 0.9 + random() * 0.34,
      yaw: random() * TAU,
      bloomDelay: Math.min(0.52, waveDelay + variationDelay),
      windPhase: random() * TAU,
      lod,
    });
  }

  return plants;
};

/** Maps global field time onto one plant while preserving exact 0% and 100%. */
export const evaluateFieldBloom = (globalProgress: number, bloomDelay: number): number => {
  const progress = clamp01(globalProgress);
  const delay = Math.min(0.82, Math.max(0, bloomDelay));
  return clamp01((progress - delay) / Math.max(0.001, 1 - delay));
};

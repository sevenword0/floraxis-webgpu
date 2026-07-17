import type { FieldSettings, FlowerPreset, IndividualFlowerSettings } from '../types';
import { resolveBotanicalArchitecture, sanitizeIndividualFlowerSettings } from '../data/botanical-architecture';
import { clamp01, seededRandom } from '../utils';

export type FieldLod = 'near' | 'mid' | 'far';

export interface FieldPlant {
  index: number;
  presetId: string;
  x: number;
  z: number;
  /** Retained for compatibility with renderer diagnostics; real-unit fields drive the model. */
  scale: number;
  stemScale: number;
  yaw: number;
  bloomDelay: number;
  windPhase: number;
  lod: FieldLod;
  heightCm: number;
  flowerDiameterCm: number;
  visualHeight: number;
  visualFlowerDiameter: number;
  headTiltDeg: number;
  headAzimuthDeg: number;
  pedicelLengthCm: number;
  pedicelWorld: number;
  leafScale: number;
  leafCount: number;
  branchCount: number;
  branchAngleDeg: number;
  /** Full-anthesis collision sphere, including a wind allowance. */
  matureRadius: number;
}

export interface IndividualFlowerExport {
  schema: 'floraxis.individual-flower';
  version: 1;
  sourceIndex: number;
  presetId: string;
  settings: Required<IndividualFlowerSettings>;
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

const matureHeadCenter = (plant: FieldPlant): { x: number; y: number; z: number } => {
  const tilt = plant.headTiltDeg / 180 * Math.PI;
  const azimuth = plant.headAzimuthDeg / 180 * Math.PI;
  const horizontalPedicel = Math.sin(tilt) * plant.pedicelWorld;
  return {
    x: plant.x + Math.sin(azimuth) * horizontalPedicel,
    y: plant.visualHeight,
    z: plant.z + Math.cos(azimuth) * horizontalPedicel,
  };
};

const headDistanceSquared = (a: FieldPlant, b: FieldPlant): number => {
  const first = matureHeadCenter(a);
  const second = matureHeadCenter(b);
  const dx = first.x - second.x;
  const dz = first.z - second.z;
  return dx * dx + dz * dz;
};

/**
 * Comparative display scale. Herbaceous heights remain proportional; tree-sized
 * specimens use a documented logarithmic compression so a 10 m cherry and a
 * 40 cm tulip can remain visible in one interactive scene.
 */
export const botanicalHeightToWorld = (centimetres: number): number => {
  const safe = Math.min(3000, Math.max(8, centimetres));
  if (safe <= 320) return safe / 75;
  return Math.min(6.2, 320 / 75 + Math.log1p((safe - 320) / 220) * 0.55);
};

/** Floral organs are shown at 2× botanical detail magnification in field mode. */
export const botanicalFlowerDiameterToWorld = (centimetres: number): number =>
  Math.min(2.6, Math.max(0.07, centimetres / 38));

export const botanicalLengthToWorld = (centimetres: number): number =>
  Math.min(1.6, Math.max(0, centimetres / 75));

const requiredHorizontalClearance = (a: FieldPlant, b: FieldPlant, padding = 0.025): number => {
  const crownDistance = a.matureRadius + b.matureRadius + padding;
  const verticalDistance = Math.abs(matureHeadCenter(a).y - matureHeadCenter(b).y);
  return verticalDistance >= crownDistance
    ? 0
    : Math.sqrt(Math.max(0, crownDistance * crownDistance - verticalDistance * verticalDistance));
};

export const flowersOverlapAtFullBloom = (a: FieldPlant, b: FieldPlant, padding = 0): boolean => {
  const horizontal = Math.sqrt(headDistanceSquared(a, b));
  return horizontal + 1e-5 < requiredHorizontalClearance(a, b, padding);
};

const resolvePlantValues = (
  index: number,
  preset: FlowerPreset,
  override: IndividualFlowerSettings | undefined,
  random: () => number,
  wind: number,
): Omit<FieldPlant, 'index' | 'presetId' | 'x' | 'z' | 'yaw' | 'bloomDelay' | 'windPhase' | 'lod'> => {
  const architecture = resolveBotanicalArchitecture(preset);
  const safeOverride = override ? sanitizeIndividualFlowerSettings(override, preset) : undefined;
  const heightVariation = 0.94 + random() * 0.12;
  const diameterVariation = 0.95 + random() * 0.1;
  const sampledLeafScale = 0.9 + random() * 0.2;
  const sampledAzimuth = (index * 137.507764 + random() * 28) % 360;
  const heightCm = safeOverride?.heightCm ?? architecture.defaultHeightCm * heightVariation;
  const flowerDiameterCm = safeOverride?.flowerDiameterCm ?? architecture.defaultFlowerDiameterCm * diameterVariation;
  const visualHeight = botanicalHeightToWorld(heightCm);
  const visualFlowerDiameter = botanicalFlowerDiameterToWorld(flowerDiameterCm);
  const leafScale = safeOverride?.leafScale ?? sampledLeafScale;
  const headAzimuthDeg = safeOverride?.headAzimuthDeg
    ?? architecture.headAzimuthDeg
    ?? sampledAzimuth;
  const windAllowance = Math.min(0.32, Math.max(0, wind) * visualHeight * 0.028);
  return {
    scale: 1,
    stemScale: 1,
    heightCm,
    flowerDiameterCm,
    visualHeight,
    visualFlowerDiameter,
    headTiltDeg: safeOverride?.headTiltDeg ?? architecture.headTiltDeg,
    headAzimuthDeg,
    pedicelLengthCm: safeOverride?.pedicelLengthCm ?? architecture.pedicelLengthCm,
    pedicelWorld: botanicalLengthToWorld(safeOverride?.pedicelLengthCm ?? architecture.pedicelLengthCm),
    leafScale,
    leafCount: safeOverride?.leafCount ?? architecture.leafCount,
    branchCount: safeOverride?.branchCount ?? architecture.branchCount,
    branchAngleDeg: safeOverride?.branchAngleDeg ?? architecture.branchAngleDeg,
    matureRadius: visualFlowerDiameter * 0.52 + windAllowance,
  };
};

const relaxMatureCrowns = (plants: FieldPlant[], radius: number, spacing: number): void => {
  for (let iteration = 0; iteration < 52; iteration += 1) {
    let moved = false;
    for (let a = 0; a < plants.length; a += 1) {
      for (let b = a + 1; b < plants.length; b += 1) {
        const first = plants[a];
        const second = plants[b];
        const firstHead = matureHeadCenter(first);
        const secondHead = matureHeadCenter(second);
        const rootDx = second.x - first.x;
        const rootDz = second.z - first.z;
        const rootDistance = Math.hypot(rootDx, rootDz);
        const headDx = secondHead.x - firstHead.x;
        const headDz = secondHead.z - firstHead.z;
        const headDistance = Math.hypot(headDx, headDz);
        const crownClearance = requiredHorizontalClearance(first, second);
        const stemClearance = spacing * 0.86;
        const stemDeficit = stemClearance - rootDistance;
        const crownDeficit = crownClearance - headDistance;
        if (stemDeficit <= 1e-5 && crownDeficit <= 1e-5) continue;
        const resolveCrown = crownDeficit > stemDeficit;
        let dx = resolveCrown ? headDx : rootDx;
        let dz = resolveCrown ? headDz : rootDz;
        let distance = resolveCrown ? headDistance : rootDistance;
        const requested = resolveCrown ? crownClearance : stemClearance;
        if (distance < 1e-5) {
          const angle = (a * 17.13 + b * GOLDEN_ANGLE) % TAU;
          dx = Math.cos(angle);
          dz = Math.sin(angle);
          distance = 1;
        }
        const push = (requested - distance) * 0.51;
        const nx = dx / distance;
        const nz = dz / distance;
        first.x -= nx * push;
        first.z -= nz * push;
        second.x += nx * push;
        second.z += nz * push;
        moved = true;
      }
    }

    for (const plant of plants) {
      const radial = Math.hypot(plant.x, plant.z);
      const maxRadius = Math.max(0.12, radius - Math.min(0.18, plant.matureRadius * 0.22));
      if (radial > maxRadius) {
        plant.x *= maxRadius / radial;
        plant.z *= maxRadius / radial;
      }
    }
    if (!moved) break;
  }
};

/**
 * Creates a deterministic, blue-noise-like circular layout. Placement tests
 * the full-anthesis three-dimensional crown spheres, not only stem centres, so
 * flowers that expand at similar heights reserve enough room before opening.
 */
export const generateFieldLayout = (
  settings: FieldSettings,
  presets: FlowerPreset[],
): FieldPlant[] => {
  const count = Math.round(Math.min(420, Math.max(12, settings.count)));
  const radius = Math.min(10, Math.max(2.5, settings.radius));
  const spacing = Math.min(1.2, Math.max(0.12, settings.spacing));
  const presetById = new Map(presets.map((preset) => [preset.id, preset]));
  const requested = normalizedSpecies(settings.speciesIds).filter((id) => presetById.has(id));
  const species = requested.length > 0 ? requested : presets.map((preset) => preset.id);
  const random = seededRandom(Math.max(1, Math.round(settings.seed)) * 2654435761);
  const plants: FieldPlant[] = [];

  for (let index = 0; index < count; index += 1) {
    const rawOverride = settings.individuals?.[String(index)];
    const assignedPresetId = index < species.length
      ? species[index]
      : species[Math.floor(random() * species.length)];
    const presetId = rawOverride?.presetId && presetById.has(rawOverride.presetId)
      ? rawOverride.presetId
      : assignedPresetId;
    const preset = presetById.get(presetId) ?? presets[0];
    const values = resolvePlantValues(index, preset, rawOverride, random, settings.wind);
    let x = 0;
    let z = 0;
    let accepted = false;

    for (let attempt = 0; attempt < 72; attempt += 1) {
      const usableRadius = Math.max(0.08, radius - spacing * 0.42);
      const candidateRadius = Math.sqrt(random()) * usableRadius;
      const angle = random() * TAU;
      x = Math.cos(angle) * candidateRadius;
      z = Math.sin(angle) * candidateRadius;
      const candidate = { ...values, index, presetId, x, z } as FieldPlant;
      if (plants.every((plant) => {
        const stemClearance = spacing * (0.9 + (candidate.visualHeight + plant.visualHeight) * 0.012);
        const crownClearance = requiredHorizontalClearance(candidate, plant);
        return distanceSquared(candidate, plant) >= stemClearance * stemClearance
          && headDistanceSquared(candidate, plant) >= crownClearance * crownClearance;
      })) {
        accepted = true;
        break;
      }
    }

    if (!accepted) {
      const normalized = Math.sqrt((index + 0.5) / count);
      const fallbackRadius = normalized * Math.max(0.08, radius - spacing * 0.32);
      const angle = index * GOLDEN_ANGLE + random() * 0.2;
      x = Math.cos(angle) * fallbackRadius;
      z = Math.sin(angle) * fallbackRadius;
    }

    const radial = Math.hypot(x, z) / radius;
    const lod: FieldLod = radial < 0.48 ? 'near' : radial < 0.78 ? 'mid' : 'far';
    const waveCoordinate = clamp01(x / (radius * 2) + 0.5);
    const waveDelay = clamp01(settings.bloomWave) * waveCoordinate * 0.3;
    const variationDelay = random() * clamp01(settings.bloomVariance) * 0.24;

    plants.push({
      ...values,
      index,
      presetId,
      x,
      z,
      yaw: random() * TAU,
      bloomDelay: Math.min(0.52, waveDelay + variationDelay),
      windPhase: random() * TAU,
      lod,
    });
  }

  relaxMatureCrowns(plants, radius, spacing);
  return plants;
};

export const exportIndividualFlower = (plant: FieldPlant): IndividualFlowerExport => ({
  schema: 'floraxis.individual-flower',
  version: 1,
  sourceIndex: plant.index,
  presetId: plant.presetId,
  settings: {
    presetId: plant.presetId,
    heightCm: Number(plant.heightCm.toFixed(2)),
    flowerDiameterCm: Number(plant.flowerDiameterCm.toFixed(2)),
    headTiltDeg: Number(plant.headTiltDeg.toFixed(1)),
    headAzimuthDeg: Number(plant.headAzimuthDeg.toFixed(1)),
    pedicelLengthCm: Number(plant.pedicelLengthCm.toFixed(2)),
    leafScale: Number(plant.leafScale.toFixed(3)),
    leafCount: plant.leafCount,
    branchCount: plant.branchCount,
    branchAngleDeg: Number(plant.branchAngleDeg.toFixed(1)),
  },
});

export const parseIndividualFlowerExport = (value: unknown): IndividualFlowerSettings | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<IndividualFlowerExport>;
  if (candidate.schema !== 'floraxis.individual-flower' || candidate.version !== 1 || !candidate.settings) return undefined;
  const settings = candidate.settings as IndividualFlowerSettings;
  if (!settings.presetId || !Number.isFinite(settings.heightCm) || !Number.isFinite(settings.flowerDiameterCm)) return undefined;
  return { ...settings };
};

/** Maps global field time onto one plant while preserving exact 0% and 100%. */
export const evaluateFieldBloom = (globalProgress: number, bloomDelay: number): number => {
  const progress = clamp01(globalProgress);
  const delay = Math.min(0.82, Math.max(0, bloomDelay));
  return clamp01((progress - delay) / Math.max(0.001, 1 - delay));
};

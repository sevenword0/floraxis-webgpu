import type { FieldSettings, FlowerPreset, HeightReference, IndividualFlowerSettings } from '../types';
import { resolveBotanicalArchitecture, sanitizeIndividualFlowerSettings } from '../data/botanical-architecture';
import { clamp01, seededRandom } from '../utils';
import { sampleTerrainHeight } from './field-environment-layout';
import { fieldPathHalfWidth, generateFieldLayoutAnchors, type FieldLayoutAnchor, type FieldLayoutZone } from './field-layout-patterns';
import { resolveFlowerColor } from './flower-color-variation';

export type FieldLod = 'near' | 'mid' | 'far';

export interface FieldPlant {
  index: number;
  presetId: string;
  x: number;
  z: number;
  /** Vertical datum: terrain for terrestrial species, waterline for lotus. */
  groundY: number;
  /** Retained for compatibility with renderer diagnostics; real-unit fields drive the model. */
  scale: number;
  stemScale: number;
  yaw: number;
  bloomDelay: number;
  windPhase: number;
  lod: FieldLod;
  heightCm: number;
  heightReference: HeightReference;
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
  flowerColor: string;
  layoutZone: FieldLayoutZone;
  layoutSide: -1 | 0 | 1;
  supportLeanDeg: number;
  supportLeanAzimuthDeg: number;
  /** Full-anthesis collision sphere, including a wind allowance. */
  matureRadius: number;
}

export interface IndividualFlowerExport {
  schema: 'floraxis.individual-flower';
  version: 1;
  sourceIndex: number;
  presetId: string;
  heightReference: HeightReference;
  settings: Required<IndividualFlowerSettings>;
}

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
export const clampStemScale = (value: number): number => Math.min(2.2, Math.max(0.35, value));
const DEFAULT_SPECIES_VARIATION = { height: 0.35, flowerSize: 0.35 };

const normalizedSpecies = (speciesIds: string[]): string[] => {
  const unique = Array.from(new Set(speciesIds.filter(Boolean)));
  return unique.length > 0 ? unique : ['rose'];
};

const assignSpeciesToAnchors = (
  anchors: FieldLayoutAnchor[],
  species: string[],
  mixStrength: number,
  seed: number,
): string[] => {
  const random = seededRandom(Math.imul(seed, 0x85ebca6b) ^ 0xc2b2ae35);
  const mixing = clamp01(mixStrength);
  const assignments = anchors.map((anchor) => {
    const grouped = species[anchor.groupIndex % species.length];
    return random() < mixing ? species[Math.floor(random() * species.length)] : grouped;
  });

  // A seeded random mix can statistically omit a selected species. Keep every
  // enabled preset represented while preserving overrides and group balance.
  const counts = new Map(species.map((id) => [id, 0]));
  assignments.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  species.forEach((missingId, missingIndex) => {
    if ((counts.get(missingId) ?? 0) > 0) return;
    let replacement = assignments.findIndex((current, index) =>
      anchors[index].groupIndex % species.length === missingIndex && (counts.get(current) ?? 0) > 1);
    if (replacement < 0) replacement = assignments.findIndex((current) => (counts.get(current) ?? 0) > 1);
    if (replacement < 0) return;
    const previous = assignments[replacement];
    assignments[replacement] = missingId;
    counts.set(previous, (counts.get(previous) ?? 1) - 1);
    counts.set(missingId, 1);
  });
  return assignments;
};

const distanceSquared = (a: Pick<FieldPlant, 'x' | 'z'>, b: Pick<FieldPlant, 'x' | 'z'>): number => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
};

const matureHeadCenter = (plant: FieldPlant): { x: number; y: number; z: number } => {
  const tilt = plant.headTiltDeg / 180 * Math.PI;
  const azimuth = plant.headAzimuthDeg / 180 * Math.PI;
  const supportTilt = plant.supportLeanDeg / 180 * Math.PI;
  const supportAzimuth = plant.supportLeanAzimuthDeg / 180 * Math.PI;
  const pendantRaceme = plant.presetId === 'wisteria';
  const verticalPedicel = pendantRaceme ? 0 : Math.cos(tilt) * plant.pedicelWorld;
  const stemLength = Math.max(0.08, plant.visualHeight - verticalPedicel);
  const supportReach = Math.sin(supportTilt) * stemLength;
  const horizontalPedicel = pendantRaceme ? plant.pedicelWorld : Math.sin(tilt) * plant.pedicelWorld;
  return {
    x: plant.x + Math.sin(supportAzimuth) * supportReach + Math.sin(azimuth) * horizontalPedicel,
    y: plant.groundY + Math.cos(supportTilt) * stemLength + verticalPedicel,
    z: plant.z + Math.cos(supportAzimuth) * supportReach + Math.cos(azimuth) * horizontalPedicel,
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
  speciesStemScale: number,
  heightVariationStrength: number,
  flowerSizeVariationStrength: number,
): Omit<FieldPlant, 'index' | 'presetId' | 'x' | 'z' | 'groundY' | 'yaw' | 'bloomDelay' | 'windPhase' | 'lod' | 'flowerColor' | 'layoutZone' | 'layoutSide' | 'supportLeanDeg' | 'supportLeanAzimuthDeg'> => {
  const architecture = resolveBotanicalArchitecture(preset);
  const safeOverride = override ? sanitizeIndividualFlowerSettings(override, preset) : undefined;
  const sampledHeightCm = architecture.heightRangeCm[0]
    + random() * (architecture.heightRangeCm[1] - architecture.heightRangeCm[0]);
  const sampledFlowerDiameterCm = architecture.flowerDiameterRangeCm[0]
    + random() * (architecture.flowerDiameterRangeCm[1] - architecture.flowerDiameterRangeCm[0]);
  const sampledLeafScale = 0.9 + random() * 0.2;
  const sampledAzimuth = (index * 137.507764 + random() * 28) % 360;
  const heightCm = safeOverride?.heightCm ?? architecture.defaultHeightCm
    + (sampledHeightCm - architecture.defaultHeightCm) * clamp01(heightVariationStrength);
  const flowerDiameterCm = safeOverride?.flowerDiameterCm ?? architecture.defaultFlowerDiameterCm
    + (sampledFlowerDiameterCm - architecture.defaultFlowerDiameterCm) * clamp01(flowerSizeVariationStrength);
  const measuredVisualHeight = botanicalHeightToWorld(heightCm);
  // A climber's measured height is vine length, not a free-standing vertical
  // trunk. Cap its displayed elevation to a realistic garden support height.
  const visualHeight = architecture.stemHabit === 'climbing-vine'
    ? Math.min(3.35, measuredVisualHeight)
    : measuredVisualHeight;
  const visualFlowerDiameter = botanicalFlowerDiameterToWorld(flowerDiameterCm);
  const leafScale = safeOverride?.leafScale ?? sampledLeafScale;
  const headAzimuthDeg = safeOverride?.headAzimuthDeg
    ?? architecture.headAzimuthDeg
    ?? sampledAzimuth;
  const pedicelLengthCm = safeOverride?.pedicelLengthCm ?? architecture.pedicelLengthCm;
  const pedicelWorld = botanicalLengthToWorld(pedicelLengthCm);
  const windAllowance = Math.min(0.32, Math.max(0, wind) * visualHeight * 0.028);
  const headRadius = visualFlowerDiameter * (preset.kind === 'wisteria' ? 0.24 : 0.52);
  const basalCrownReach = architecture.floweringShootCount > 1
    ? Math.sin(architecture.basalShootSpreadDeg / 180 * Math.PI)
      * Math.max(0.08, visualHeight - pedicelWorld)
      * 0.92
    : 0;
  return {
    scale: 1,
    stemScale: safeOverride?.stemScale ?? speciesStemScale,
    heightCm,
    heightReference: architecture.heightReference,
    flowerDiameterCm,
    visualHeight,
    visualFlowerDiameter,
    headTiltDeg: safeOverride?.headTiltDeg ?? architecture.headTiltDeg,
    headAzimuthDeg,
    pedicelLengthCm,
    pedicelWorld,
    leafScale,
    leafCount: safeOverride?.leafCount ?? architecture.leafCount,
    branchCount: safeOverride?.branchCount ?? architecture.branchCount,
    branchAngleDeg: safeOverride?.branchAngleDeg ?? architecture.branchAngleDeg,
    matureRadius: headRadius + basalCrownReach + windAllowance,
  };
};

const relaxMatureCrowns = (
  plants: FieldPlant[],
  radius: number,
  spacing: number,
  terrainRelief: number,
  seed: number,
  layoutMode: FieldSettings['layoutMode'],
): void => {
  const corridorHalfWidth = fieldPathHalfWidth({ radius, layoutMode });
  for (let iteration = 0; iteration < 96; iteration += 1) {
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
      const maxRadius = Math.max(0.12, radius - Math.min(0.18, plant.matureRadius * 0.22));
      if (plant.layoutSide !== 0 && corridorHalfWidth > 0) {
        const minimumX = Math.min(maxRadius * 0.82, corridorHalfWidth + spacing * 0.34);
        plant.x = plant.layoutSide * Math.max(minimumX, Math.abs(plant.x));
        const maximumZ = Math.sqrt(Math.max(0, maxRadius * maxRadius - plant.x * plant.x));
        plant.z = Math.min(maximumZ, Math.max(-maximumZ, plant.z));
      } else {
        const radial = Math.hypot(plant.x, plant.z);
        if (radial > maxRadius) {
          plant.x *= maxRadius / radial;
          plant.z *= maxRadius / radial;
        }
      }
      plant.groundY = sampleTerrainHeight(plant.x, plant.z, radius, terrainRelief, seed);
    }
    if (!moved) break;
  }
};

/**
 * Creates a deterministic scatter, row, ring, sector, or composite layout.
 * Placement tests the full-anthesis three-dimensional crown spheres, not only
 * stem centres, so flowers that expand at similar heights reserve enough room.
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
  const seed = Math.max(1, Math.round(settings.seed));
  const random = seededRandom(Math.imul(seed, 0x9e3779b1) ^ 0x243f6a88);
  const anchors = generateFieldLayoutAnchors(settings, species.length);
  const assignments = assignSpeciesToAnchors(anchors, species, settings.mixStrength, seed);
  const plants: FieldPlant[] = [];

  for (let index = 0; index < count; index += 1) {
    const rawOverride = settings.individuals?.[String(index)];
    const assignedPresetId = assignments[index] ?? species[index % species.length];
    const presetId = rawOverride?.presetId && presetById.has(rawOverride.presetId)
      ? rawOverride.presetId
      : assignedPresetId;
    const preset = presetById.get(presetId) ?? presets[0];
    const speciesStemScale = clampStemScale(settings.stemScales?.[presetId] ?? 1);
    const speciesVariation = settings.speciesVariations?.[presetId] ?? DEFAULT_SPECIES_VARIATION;
    const values = resolvePlantValues(
      index,
      preset,
      rawOverride,
      random,
      settings.wind,
      speciesStemScale,
      speciesVariation.height,
      speciesVariation.flowerSize,
    );
    const anchor = anchors[index];
    const placementRandom = seededRandom(Math.imul(seed ^ (index + 1), 0x27d4eb2d) ^ 0x165667b1);
    const usableRadius = Math.max(0.08, radius - spacing * 0.42);
    let x = anchor.x;
    let z = anchor.z;
    let accepted = false;

    for (let attempt = 0; attempt < 72; attempt += 1) {
      if (attempt === 0) {
        x = anchor.x;
        z = anchor.z;
      } else {
        const corridorBound = anchor.side === -1 || anchor.side === 1;
        const jitterLimit = spacing * (settings.layoutMode === 'scatter' ? 1.45 : corridorBound ? 0.62 : 0.92);
        const jitterRadius = jitterLimit * Math.sqrt(attempt / 71) * (0.82 + placementRandom() * 0.18);
        const angle = index * GOLDEN_ANGLE + attempt * GOLDEN_ANGLE + placementRandom() * 0.24;
        x = anchor.x + Math.cos(angle) * jitterRadius * (corridorBound ? 0.28 : 1);
        z = anchor.z + Math.sin(angle) * jitterRadius;
        if (corridorBound) {
          const minimumX = fieldPathHalfWidth(settings) + spacing * 0.34;
          x = anchor.side! * Math.max(minimumX, Math.abs(x));
        }
        const radial = Math.hypot(x, z);
        if (radial > usableRadius) {
          x *= usableRadius / radial;
          z *= usableRadius / radial;
        }
      }
      const candidate = {
        ...values,
        index,
        presetId,
        x,
        z,
        groundY: sampleTerrainHeight(x, z, radius, settings.terrainRelief, settings.seed),
        flowerColor: preset.colors.base,
        layoutZone: anchor.zone,
        layoutSide: anchor.side ?? 0,
        supportLeanDeg: anchor.supportLeanDeg ?? 0,
        supportLeanAzimuthDeg: anchor.supportLeanAzimuthDeg ?? 0,
      } as FieldPlant;
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
      x = anchor.x;
      z = anchor.z;
    }

    const radial = Math.hypot(x, z) / radius;
    const lod: FieldLod = radial < 0.48 ? 'near' : radial < 0.78 ? 'mid' : 'far';
    const waveCoordinate = clamp01(x / (radius * 2) + 0.5);
    const waveDelay = clamp01(settings.bloomWave) * waveCoordinate * 0.3;
    const variationDelay = random() * clamp01(settings.bloomVariance) * 0.24;
    const colorRandom = seededRandom(Math.imul(seed ^ (index + 1), 0x6c8e9cf5) ^ 0xb5297a4d);

    plants.push({
      ...values,
      index,
      presetId,
      x,
      z,
      groundY: sampleTerrainHeight(x, z, radius, settings.terrainRelief, settings.seed),
      yaw: random() * TAU,
      bloomDelay: Math.min(0.52, waveDelay + variationDelay),
      windPhase: random() * TAU,
      lod,
      flowerColor: resolveFlowerColor(preset.colors.base, settings.colorRanges?.[presetId], colorRandom()),
      layoutZone: anchor.zone,
      layoutSide: anchor.side ?? 0,
      supportLeanDeg: anchor.supportLeanDeg ?? 0,
      supportLeanAzimuthDeg: anchor.supportLeanAzimuthDeg ?? 0,
    });
  }

  relaxMatureCrowns(plants, radius, spacing, settings.terrainRelief, settings.seed, settings.layoutMode);
  for (const plant of plants) {
    plant.groundY = sampleTerrainHeight(plant.x, plant.z, radius, settings.terrainRelief, settings.seed);
  }
  return plants;
};

export const exportIndividualFlower = (plant: FieldPlant): IndividualFlowerExport => ({
  schema: 'floraxis.individual-flower',
  version: 1,
  sourceIndex: plant.index,
  presetId: plant.presetId,
  heightReference: plant.heightReference,
  settings: {
    presetId: plant.presetId,
    heightCm: Number(plant.heightCm.toFixed(2)),
    flowerDiameterCm: Number(plant.flowerDiameterCm.toFixed(2)),
    stemScale: Number(plant.stemScale.toFixed(3)),
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

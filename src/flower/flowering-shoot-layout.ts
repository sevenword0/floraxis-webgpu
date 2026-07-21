import { resolveBotanicalArchitecture } from '../data/botanical-architecture';
import type { BotanicalArchitecture, FlowerPreset } from '../types';
import type { FieldLod, FieldPlant } from './flower-field-layout';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export interface FloweringShootSpec {
  shootIndex: number;
  shootCount: number;
  azimuthDeg: number;
  leanDeg: number;
  heightScale: number;
  flowerScale: number;
  bloomOffset: number;
  timeOffset: number;
}

export interface FloweringFieldPlant extends FieldPlant {
  sourceRootIndex: number;
  shootIndex: number;
  shootCount: number;
}

const normalizeDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;

export const floweringShootCountForLod = (requestedCount: number, lod: FieldLod): number => {
  const requested = Math.max(1, Math.min(12, Math.round(requestedCount)));
  const retention = lod === 'near' ? 1 : lod === 'mid' ? 0.8 : 0.6;
  return Math.max(1, Math.min(requested, Math.ceil(requested * retention)));
};

/**
 * Generates a central leader plus a deterministic ring of shorter basal
 * shoots. The shared origin is intentional: they represent one root crown,
 * not extra plants hidden from the field count.
 */
export const generateFloweringShootSpecs = (
  architecture: BotanicalArchitecture,
  lod: FieldLod = 'near',
): FloweringShootSpec[] => {
  const count = floweringShootCountForLod(architecture.floweringShootCount, lod);
  if (count === 1) {
    return [{
      shootIndex: 0,
      shootCount: 1,
      azimuthDeg: 0,
      leanDeg: 0,
      heightScale: 1,
      flowerScale: 1,
      bloomOffset: 0,
      timeOffset: 0,
    }];
  }

  const outerCount = count - 1;
  return Array.from({ length: count }, (_, shootIndex) => {
    if (shootIndex === 0) {
      return {
        shootIndex,
        shootCount: count,
        azimuthDeg: 0,
        leanDeg: 0,
        heightScale: 1,
        flowerScale: 1,
        bloomOffset: 0,
        timeOffset: 0,
      };
    }
    const ringIndex = shootIndex - 1;
    const variation = Math.sin((ringIndex + 1) * 2.399963);
    const azimuthDeg = normalizeDegrees(ringIndex / outerCount * 360 + variation * 7);
    return {
      shootIndex,
      shootCount: count,
      azimuthDeg,
      leanDeg: architecture.basalShootSpreadDeg * (0.78 + (variation * 0.5 + 0.5) * 0.22),
      heightScale: 0.8 + (Math.cos((ringIndex + 1) * 1.73) * 0.5 + 0.5) * 0.14,
      flowerScale: 0.87 + (Math.sin((ringIndex + 1) * 1.31) * 0.5 + 0.5) * 0.1,
      bloomOffset: 0.008 + ringIndex * 0.006,
      timeOffset: shootIndex * 337,
    };
  });
};

const combineLean = (
  baseDeg: number,
  baseAzimuthDeg: number,
  shootDeg: number,
  shootAzimuthDeg: number,
): { leanDeg: number; azimuthDeg: number } => {
  const baseAzimuth = baseAzimuthDeg * DEG;
  const shootAzimuth = shootAzimuthDeg * DEG;
  const x = Math.sin(baseAzimuth) * Math.tan(baseDeg * DEG)
    + Math.sin(shootAzimuth) * Math.tan(shootDeg * DEG);
  const z = Math.cos(baseAzimuth) * Math.tan(baseDeg * DEG)
    + Math.cos(shootAzimuth) * Math.tan(shootDeg * DEG);
  return {
    leanDeg: Math.min(48, Math.atan(Math.hypot(x, z)) / DEG),
    azimuthDeg: Math.hypot(x, z) < 1e-6 ? normalizeDegrees(baseAzimuthDeg) : normalizeDegrees(Math.atan2(x, z) / DEG),
  };
};

export const expandFieldFloweringShoots = (
  roots: FieldPlant[],
  presets: FlowerPreset[],
): FloweringFieldPlant[] => {
  const presetById = new Map(presets.map((preset) => [preset.id, preset]));
  return roots.flatMap((plant) => {
    const preset = presetById.get(plant.presetId);
    if (!preset) return [{ ...plant, sourceRootIndex: plant.index, shootIndex: 0, shootCount: 1 }];
    const specs = generateFloweringShootSpecs(resolveBotanicalArchitecture(preset), plant.lod);
    return specs.map((spec) => {
      const azimuthDeg = normalizeDegrees(plant.yaw / TAU * 360 + spec.azimuthDeg);
      const support = combineLean(
        plant.supportLeanDeg,
        plant.supportLeanAzimuthDeg,
        spec.leanDeg,
        azimuthDeg,
      );
      const isCrown = spec.shootCount > 1;
      return {
        ...plant,
        sourceRootIndex: plant.index,
        shootIndex: spec.shootIndex,
        shootCount: spec.shootCount,
        heightCm: plant.heightCm * spec.heightScale,
        visualHeight: plant.visualHeight * spec.heightScale,
        flowerDiameterCm: plant.flowerDiameterCm * spec.flowerScale,
        visualFlowerDiameter: plant.visualFlowerDiameter * spec.flowerScale,
        yaw: plant.yaw + spec.azimuthDeg * DEG,
        bloomDelay: Math.min(0.58, plant.bloomDelay + spec.bloomOffset),
        windPhase: plant.windPhase + spec.shootIndex * 1.17,
        headAzimuthDeg: normalizeDegrees(plant.headAzimuthDeg + spec.azimuthDeg),
        supportLeanDeg: support.leanDeg,
        supportLeanAzimuthDeg: support.azimuthDeg,
        branchCount: isCrown ? Math.min(2, Math.ceil(plant.branchCount / spec.shootCount)) : plant.branchCount,
        leafCount: isCrown ? Math.max(2, Math.ceil(plant.leafCount * 0.48)) : plant.leafCount,
      };
    });
  });
};

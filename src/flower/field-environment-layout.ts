import type { FieldSettings } from '../types';
import { seededRandom } from '../utils';

export interface FieldEnvironmentInstance {
  x: number;
  z: number;
  y: number;
  yaw: number;
  scale: number;
  height: number;
  phase: number;
  colorMix: number;
}

export interface FieldEnvironmentLayout {
  groundCover: FieldEnvironmentInstance[];
  shrubs: FieldEnvironmentInstance[];
  rocks: FieldEnvironmentInstance[];
}

export interface WindBend {
  x: number;
  z: number;
  gust: number;
}

const TAU = Math.PI * 2;

const clamp01 = (value: number | undefined, fallback: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value! : fallback));

const terrainNoise = (x: number, z: number, seed: number): number => {
  const offset = (seed % 997) * 0.0137;
  const broad = Math.sin(x * 0.42 + offset) * Math.cos(z * 0.37 - offset * 0.7);
  const crossing = Math.sin((x + z) * 0.83 + offset * 1.9) * 0.42;
  const detail = Math.cos(x * 1.71 - z * 1.29 + offset * 0.43) * 0.18;
  return broad * 0.62 + crossing * 0.26 + detail * 0.12;
};

/** Deterministic low-relief soil height shared by plant roots and terrain meshes. */
export const sampleTerrainHeight = (
  x: number,
  z: number,
  radius: number,
  relief: number | undefined,
  seed: number,
): number => {
  const safeRadius = Math.max(2.5, radius);
  const normalizedRadius = Math.min(1.2, Math.hypot(x, z) / safeRadius);
  const amplitude = 0.19 * clamp01(relief, 0.32);
  const edgeFall = Math.max(0, normalizedRadius - 0.83) * 0.18;
  return terrainNoise(x, z, seed) * amplitude - edgeFall;
};

/** Coherent wind field with a slow directional pulse and local high-frequency turbulence. */
export const sampleWindBend = (
  time: number,
  x: number,
  z: number,
  phase: number,
  strength: number,
  turbulence: number,
): WindBend => {
  const safeStrength = clamp01(strength, 0);
  if (safeStrength <= 0) return { x: 0, z: 0, gust: 0 };
  const safeTurbulence = clamp01(turbulence, 0.55);
  const broadPhase = time * 0.00058 + x * 0.31 + z * 0.19;
  const localPhase = time * (0.0017 + safeTurbulence * 0.0018) + phase + x * 0.73 - z * 0.49;
  const broad = Math.sin(broadPhase) * 0.72 + Math.sin(broadPhase * 0.47 + 1.3) * 0.28;
  const local = Math.sin(localPhase) * safeTurbulence * 0.42;
  const gust = (broad + local) * safeStrength;
  const direction = 0.72 + Math.sin(time * 0.00012) * 0.26;
  return {
    x: Math.sin(direction) * gust,
    z: Math.cos(direction) * gust,
    gust,
  };
};

const clearOfRoots = (
  x: number,
  z: number,
  roots: Array<Pick<FieldEnvironmentInstance, 'x' | 'z'>>,
  clearance: number,
): boolean => roots.every((root) => Math.hypot(x - root.x, z - root.z) >= clearance);

const scatter = (
  count: number,
  settings: FieldSettings,
  roots: Array<Pick<FieldEnvironmentInstance, 'x' | 'z'>>,
  random: () => number,
  clearance: number,
  heightRange: [number, number],
  scaleRange: [number, number],
): FieldEnvironmentInstance[] => {
  const instances: FieldEnvironmentInstance[] = [];
  const usableRadius = Math.max(1, settings.radius * 0.98);
  for (let index = 0; index < count; index += 1) {
    let x = 0;
    let z = 0;
    let accepted = false;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const distance = Math.sqrt(random()) * usableRadius;
      const angle = random() * TAU;
      x = Math.cos(angle) * distance;
      z = Math.sin(angle) * distance;
      if (clearOfRoots(x, z, roots, clearance)) {
        accepted = true;
        break;
      }
    }
    if (!accepted) continue;
    instances.push({
      x,
      z,
      y: sampleTerrainHeight(x, z, settings.radius, settings.terrainRelief, settings.seed),
      yaw: random() * TAU,
      scale: scaleRange[0] + random() * (scaleRange[1] - scaleRange[0]),
      height: heightRange[0] + random() * (heightRange[1] - heightRange[0]),
      phase: random() * TAU,
      colorMix: random(),
    });
  }
  return instances;
};

/** Deterministic ground-cover, understory, and pebble placement for one field seed. */
export const generateFieldEnvironmentLayout = (
  settings: FieldSettings,
  roots: Array<{ x: number; z: number }>,
): FieldEnvironmentLayout => {
  const areaFactor = settings.radius * settings.radius;
  const groundCoverDensity = clamp01(settings.groundCover, 0.88);
  const shrubDensity = clamp01(settings.shrubDensity, 0.76);
  const rockDensity = clamp01(settings.rockDensity, 0.42);
  const groundCount = Math.min(1500, Math.round((190 + areaFactor * 19) * groundCoverDensity));
  const shrubCount = Math.min(360, Math.round((42 + areaFactor * 5.2) * shrubDensity));
  const rockCount = Math.min(200, Math.round((22 + areaFactor * 2.8) * rockDensity));
  const random = seededRandom((Math.max(1, Math.round(settings.seed)) ^ 0x6d2b79f5) >>> 0);
  return {
    groundCover: scatter(groundCount, settings, roots, random, 0.09, [0.14, 0.34], [0.68, 1.42]),
    shrubs: scatter(shrubCount, settings, roots, random, 0.28, [0.34, 0.84], [0.82, 1.5]),
    rocks: scatter(rockCount, settings, roots, random, 0.24, [0.06, 0.19], [0.6, 1.7]),
  };
};

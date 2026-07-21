import type { FlowerKind } from '../types';

export type InflorescencePetalRole = 'decorative' | 'fertile' | 'banner' | 'wing' | 'keel';

export interface InflorescencePetalSpec {
  floretIndex: number;
  role: InflorescencePetalRole;
  originX: number;
  originY: number;
  originZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  angle: number;
  scale: number;
  delay: number;
  span: number;
  axisT: number;
  phase: number;
}

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const normalized = (x: number, y: number, z: number): [number, number, number] => {
  const length = Math.max(1e-5, Math.hypot(x, y, z));
  return [x / length, y / length, z / length];
};

const hydrangeaSpecs = (requestedCount: number): InflorescencePetalSpec[] => {
  const floretCount = Math.max(4, Math.floor(requestedCount / 4));
  const specs: InflorescencePetalSpec[] = [];
  for (let floret = 0; floret < floretCount; floret += 1) {
    const t = (floret + 0.5) / floretCount;
    const sphereY = 1 - t * 2;
    const ring = Math.sqrt(Math.max(0, 1 - sphereY * sphereY));
    const azimuth = floret * GOLDEN_ANGLE;
    const x = Math.cos(azimuth) * ring * 0.5;
    const y = sphereY * 0.39 + 0.08;
    const z = Math.sin(azimuth) * ring * 0.5;
    const [nx, ny, nz] = normalized(x, y - 0.02, z);
    const fertile = floret % 5 === 4;
    for (let petal = 0; petal < 4; petal += 1) {
      specs.push({
        floretIndex: floret,
        role: fertile ? 'fertile' : 'decorative',
        originX: x,
        originY: y,
        originZ: z,
        normalX: nx,
        normalY: ny,
        normalZ: nz,
        angle: petal / 4 * TAU + (floret % 2) * 0.18,
        scale: fertile ? 0.105 : 0.205 + (floret % 3) * 0.012,
        delay: 0.2 + t * 0.24 + (petal % 2) * 0.008,
        span: 0.42,
        axisT: t,
        phase: floret * 0.71 + petal * 1.37,
      });
    }
  }
  return specs;
};

const wisteriaSpecs = (requestedCount: number): InflorescencePetalSpec[] => {
  const floretCount = Math.max(4, Math.floor(requestedCount / 5));
  const roles: InflorescencePetalRole[] = ['banner', 'wing', 'wing', 'keel', 'keel'];
  const scales = [0.29, 0.22, 0.22, 0.18, 0.18];
  const angles = [Math.PI, 0.45, -0.45, 1.36, -1.36];
  const specs: InflorescencePetalSpec[] = [];
  for (let floret = 0; floret < floretCount; floret += 1) {
    const t = floretCount <= 1 ? 0 : floret / (floretCount - 1);
    const azimuth = floret * GOLDEN_ANGLE;
    const radius = (1 - t) * 0.21 + 0.035;
    const x = Math.cos(azimuth) * radius;
    const y = -0.08 - t * 1.18;
    const z = Math.sin(azimuth) * radius;
    const [nx, ny, nz] = normalized(Math.cos(azimuth), -0.18 - t * 0.18, Math.sin(azimuth));
    for (let petal = 0; petal < 5; petal += 1) {
      specs.push({
        floretIndex: floret,
        role: roles[petal],
        originX: x,
        originY: y,
        originZ: z,
        normalX: nx,
        normalY: ny,
        normalZ: nz,
        angle: angles[petal],
        scale: scales[petal] * (0.9 + (1 - t) * 0.14),
        delay: 0.16 + t * 0.52 + (petal === 0 ? 0 : 0.012),
        span: 0.3,
        axisT: t,
        phase: floret * 0.83 + petal * 1.11,
      });
    }
  }
  return specs;
};

/** Research-mapped, deterministic small-floret placement for compound heads. */
export const generateInflorescencePetalSpecs = (
  kind: Extract<FlowerKind, 'hydrangea' | 'wisteria'>,
  requestedCount: number,
): InflorescencePetalSpec[] => kind === 'hydrangea'
  ? hydrangeaSpecs(requestedCount)
  : wisteriaSpecs(requestedCount);

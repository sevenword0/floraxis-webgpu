import * as THREE from 'three/webgpu';
import type { LeafShape } from '../types';
import { resolveBotanicalCurvature, sampleLeafBladeCurvature } from './botanical-curvature';

interface MutableGeometryData {
  positions: number[];
  uvs: number[];
  indices: number[];
}

const addTriangleFan = (
  data: MutableGeometryData,
  centerX: number,
  centerZ: number,
  radiusX: number,
  radiusZ: number,
  rotation: number,
  segments = 14,
): void => {
  const base = data.positions.length / 3;
  data.positions.push(centerX, 0, centerZ);
  data.uvs.push(0.5, 0.5);
  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const x = Math.cos(angle) * radiusX;
    const z = Math.sin(angle) * radiusZ;
    const rotatedX = x * Math.cos(rotation) - z * Math.sin(rotation);
    const rotatedZ = x * Math.sin(rotation) + z * Math.cos(rotation);
    data.positions.push(centerX + rotatedX, Math.sin(angle * 2) * 0.006, centerZ + rotatedZ);
    data.uvs.push(Math.cos(angle) * 0.5 + 0.5, Math.sin(angle) * 0.5 + 0.5);
    if (index > 0) data.indices.push(base, base + index, base + index + 1);
  }
};

const createCompoundPinnateData = (): MutableGeometryData => {
  const data: MutableGeometryData = { positions: [], uvs: [], indices: [] };
  const rachisBase = data.positions.length / 3;
  data.positions.push(-0.022, -0.004, 0, 0.022, -0.004, 0, -0.014, 0, 0.83, 0.014, 0, 0.83);
  data.uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
  data.indices.push(rachisBase, rachisBase + 1, rachisBase + 2, rachisBase + 1, rachisBase + 3, rachisBase + 2);
  const pairs = [0.22, 0.43, 0.64];
  pairs.forEach((z, pair) => {
    const width = 0.22 - pair * 0.025;
    const length = 0.24 - pair * 0.018;
    addTriangleFan(data, -0.18, z, width, length, -0.58, 16);
    addTriangleFan(data, 0.18, z, width, length, 0.58, 16);
  });
  addTriangleFan(data, 0, 0.84, 0.24, 0.25, 0, 18);
  return data;
};

const bladeWidth = (shape: Exclude<LeafShape, 'compound-pinnate' | 'peltate-orbicular'>, t: number): number => {
  const base = Math.sin(Math.PI * Math.pow(t, shape === 'ovate-serrate' ? 0.82 : 1));
  const exponent = shape === 'lanceolate' ? 1.72 : shape === 'broad-lanceolate' ? 1.18 : 0.92;
  const ovateBias = shape === 'ovate-serrate' ? 1 - (t - 0.34) * 0.28 : 1;
  const serration = shape.includes('serrate') ? 0.92 + Math.abs(Math.sin(t * Math.PI * 12)) * 0.1 : 1;
  return Math.max(0, Math.pow(Math.max(0, base), exponent) * ovateBias * serration * 0.5);
};

const createBladeData = (shape: Exclude<LeafShape, 'compound-pinnate' | 'peltate-orbicular'>): MutableGeometryData => {
  const data: MutableGeometryData = { positions: [], uvs: [], indices: [] };
  const segments = 18;
  for (let row = 0; row <= segments; row += 1) {
    const t = row / segments;
    const width = bladeWidth(shape, t);
    const camber = Math.sin(Math.PI * t) * (shape === 'broad-lanceolate' ? 0.045 : 0.03);
    data.positions.push(
      -width, camber - width * 0.035, t,
      0, camber, t,
      width, camber + width * 0.035, t,
    );
    data.uvs.push(0, t, 0.5, t, 1, t);
    if (row < segments) {
      const a = row * 3;
      const b = a + 3;
      data.indices.push(
        a, a + 1, b,
        a + 1, b + 1, b,
        a + 1, a + 2, b + 1,
        a + 2, b + 2, b + 1,
      );
    }
  }
  return data;
};

const createPeltateData = (): MutableGeometryData => {
  const data: MutableGeometryData = { positions: [], uvs: [], indices: [] };
  const segments = 40;
  const center = 0;
  data.positions.push(0, 0.025, 0);
  data.uvs.push(0.5, 0.5);
  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const ripple = 0.49 + Math.sin(angle * 9) * 0.015;
    data.positions.push(Math.cos(angle) * ripple, Math.cos(angle * 2) * 0.016, Math.sin(angle) * ripple);
    data.uvs.push(Math.cos(angle) * 0.5 + 0.5, Math.sin(angle) * 0.5 + 0.5);
    if (index > 0) data.indices.push(center, index, index + 1);
  }
  return data;
};

const applyLeafCurvature = (data: MutableGeometryData, shape: LeafShape): void => {
  const profile = resolveBotanicalCurvature('upright', shape);
  for (let index = 0; index < data.positions.length; index += 3) {
    const x = data.positions[index];
    const z = data.positions[index + 2];
    if (shape === 'peltate-orbicular') {
      const radial = Math.min(1, Math.hypot(x, z) / 0.5);
      data.positions[index + 1] += profile.leafMidribArch * Math.sin(Math.PI * radial)
        - profile.leafTipDroop * radial * radial
        + profile.leafEdgeCup * Math.pow(radial, 3);
      continue;
    }

    const progress = Math.min(1, Math.max(0, z));
    const lateral = Math.min(1, Math.abs(x) / 0.5);
    data.positions[index + 1] += sampleLeafBladeCurvature(profile, progress, lateral);
  }
};

/** Creates a lightweight species-aware leaf or compound-leaf silhouette. */
export const createLeafGeometry = (shape: LeafShape): THREE.BufferGeometry => {
  const data = shape === 'compound-pinnate'
    ? createCompoundPinnateData()
    : shape === 'peltate-orbicular'
      ? createPeltateData()
      : createBladeData(shape);
  applyLeafCurvature(data, shape);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

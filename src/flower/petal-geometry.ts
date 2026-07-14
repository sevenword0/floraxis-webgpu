import * as THREE from 'three/webgpu';
import { color, float } from 'three/tsl';
import type { FlowerColors, FlowerMorphology, PetalShape } from '../types';

export interface PetalGeometryOptions {
  length: number;
  width: number;
  shape: PetalShape;
  taper: number;
  notch: number;
  waviness: number;
  cup: number;
  curl: number;
  seed: number;
  colors: Pick<FlowerColors, 'base' | 'tip'>;
}

const widthProfile = (v: number, shape: PetalShape, taper: number): number => {
  const base = THREE.MathUtils.smoothstep(v, 0, 0.18);
  let tip = 1;
  switch (shape) {
    case 'lance':
      tip = Math.pow(Math.max(0.035, Math.sin(Math.PI * v)), 0.56 + taper * 0.34);
      break;
    case 'pointed':
      tip = Math.pow(Math.max(0.045, Math.sin(Math.PI * v)), 0.42) * (1 - v * taper * 0.22);
      break;
    case 'spoon':
      tip = 0.28 + Math.pow(v, 0.62) * 0.78;
      break;
    case 'notched':
      tip = 0.42 + Math.sin(Math.min(1, v * 0.82) * Math.PI * 0.72) * 0.64;
      break;
    default:
      tip = 0.38 + Math.sin(Math.min(1, v * 0.88) * Math.PI * 0.72) * 0.68;
  }
  return Math.max(0.02, base * tip);
};

const buildPositions = (
  options: PetalGeometryOptions,
  open: boolean,
  widthSegments: number,
  lengthSegments: number,
): Float32Array => {
  const positions = new Float32Array((widthSegments + 1) * (lengthSegments + 1) * 3);
  const phase = options.seed * 1.61803398875;
  let ptr = 0;

  for (let iy = 0; iy <= lengthSegments; iy += 1) {
    const v = iy / lengthSegments;
    for (let ix = 0; ix <= widthSegments; ix += 1) {
      const u = ix / widthSegments * 2 - 1;
      const profile = widthProfile(v, options.shape, options.taper);
      const expansion = open ? 1 : 0.72 + v * 0.15;
      const x = u * options.width * 0.5 * profile * expansion;
      const tipMask = THREE.MathUtils.smoothstep(v, 0.72, 1);
      const notch = options.notch * options.length * Math.exp(-u * u * 16) * tipMask;
      const roundedShape = options.shape === 'round' || options.shape === 'spoon' || options.shape === 'notched';
      const capDepth = options.shape === 'spoon' ? 0.2 : 0.15;
      const roundedCap = roundedShape
        ? (1 - Math.sqrt(Math.max(0, 1 - u * u))) * options.length * capDepth * tipMask
        : 0;
      const growth = open ? 1.035 : 0.91;
      const y = options.length * v * growth - notch - roundedCap;
      const edge = Math.pow(Math.abs(u), 3.4);
      const wave = Math.sin(v * 15 + u * 4.5 + phase) * options.waviness * options.length * edge * v;
      const midrib = (1 - Math.abs(u)) * Math.sin(Math.PI * v) * options.length * 0.018;
      const transverseCup = (1 - u * u) * Math.sin(Math.PI * v) * options.cup * options.length * 0.28;
      const tipCurl = Math.pow(v, 3.2) * options.curl * options.length * 0.38;
      const closedFold = -Math.pow(v, 2.3) * options.length * (0.16 + Math.max(0, options.curl) * 0.1);
      const z = open ? transverseCup + tipCurl + wave + midrib : closedFold + transverseCup * 0.42 + wave * 0.25;

      positions[ptr++] = x;
      positions[ptr++] = y;
      positions[ptr++] = z;
    }
  }

  return positions;
};

const buildIndices = (widthSegments: number, lengthSegments: number): number[] => {
  const indices: number[] = [];
  for (let iy = 0; iy < lengthSegments; iy += 1) {
    for (let ix = 0; ix < widthSegments; ix += 1) {
      const a = iy * (widthSegments + 1) + ix;
      const b = a + widthSegments + 1;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  return indices;
};

const computeNormals = (positions: Float32Array, indices: number[]): Float32Array => {
  const temp = new THREE.BufferGeometry();
  temp.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
  temp.setIndex(indices);
  temp.computeVertexNormals();
  const normals = (temp.getAttribute('normal').array as Float32Array).slice();
  temp.dispose();
  return normals;
};

export const createPetalGeometry = (options: PetalGeometryOptions): THREE.BufferGeometry => {
  const widthSegments = 10;
  const lengthSegments = 18;
  const closed = buildPositions(options, false, widthSegments, lengthSegments);
  const opened = buildPositions(options, true, widthSegments, lengthSegments);
  const indices = buildIndices(widthSegments, lengthSegments);
  const closedNormals = computeNormals(closed, indices);
  const openNormals = computeNormals(opened, indices);
  const count = (widthSegments + 1) * (lengthSegments + 1);
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const baseColor = new THREE.Color(options.colors.base);
  const tipColor = new THREE.Color(options.colors.tip);

  let colorPtr = 0;
  let uvPtr = 0;
  for (let iy = 0; iy <= lengthSegments; iy += 1) {
    const v = iy / lengthSegments;
    const tint = baseColor.clone().lerp(tipColor, Math.pow(v, 0.72));
    for (let ix = 0; ix <= widthSegments; ix += 1) {
      colors[colorPtr++] = tint.r;
      colors[colorPtr++] = tint.g;
      colors[colorPtr++] = tint.b;
      uvs[uvPtr++] = ix / widthSegments;
      uvs[uvPtr++] = v;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(closed, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(closedNormals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.morphAttributes.position = [new THREE.BufferAttribute(opened, 3)];
  geometry.morphAttributes.normal = [new THREE.BufferAttribute(openNormals, 3)];
  geometry.morphTargetsRelative = false;
  geometry.computeBoundingSphere();
  return geometry;
};

export const createPetalMaterial = (
  colors: FlowerColors,
  morphology: Pick<FlowerMorphology, 'roughness' | 'sssStrength'>,
): THREE.MeshSSSNodeMaterial => {
  const material = new THREE.MeshSSSNodeMaterial({
    color: 0xffffff,
    roughness: morphology.roughness,
    metalness: 0,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  material.thicknessColorNode = color(colors.reverse);
  material.thicknessDistortionNode = float(0.16 + morphology.sssStrength * 0.22);
  material.thicknessAmbientNode = float(0.015 + morphology.sssStrength * 0.04);
  material.thicknessAttenuationNode = float(0.08 + morphology.sssStrength * 0.32);
  material.thicknessPowerNode = float(2.4);
  material.thicknessScaleNode = float(3.5 + morphology.sssStrength * 8);
  return material;
};

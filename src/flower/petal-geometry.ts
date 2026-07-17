import * as THREE from 'three/webgpu';
import { color, float } from 'three/tsl';
import { DEFAULT_GROWTH_PROFILE } from '../growth-model';
import type { BloomGrowthProfile, FlowerColors, FlowerMorphology, PetalShape } from '../types';

type PetalGrowthGeometry = Pick<
  BloomGrowthProfile,
  'closedPetalLength' | 'closedPetalWidth' | 'basalEpinasty' | 'marginGrowth'
>;

export interface PetalGeometryOptions {
  length: number;
  width: number;
  shape: PetalShape;
  taper: number;
  notch: number;
  waviness: number;
  cup: number;
  curl: number;
  fold?: number;
  seed: number;
  thickness?: number;
  growth?: PetalGrowthGeometry;
  unfurl?: PetalUnfurlGeometryOptions;
  /** Optional reduced tessellation for distant instanced flower-field petals. */
  segments?: { width: number; length: number };
  colors: Pick<FlowerColors, 'base' | 'tip'>;
}

export interface PetalUnfurlGeometryOptions {
  /** Strength of the inward longitudinal coil in the unopened bud. */
  budCurl: number;
  /** How long the distal lamina stays coiled after the petal base releases. */
  wave: number;
  /** Residual inward curvature of the innermost layers at anthesis. */
  innerCoil: number;
  /** Normalized layer position, where zero is outermost and one is innermost. */
  layer: number;
  /** Unit-strength one-sided longitudinal roll used by tightly packed rose centres. */
  sideCoil?: number;
  /** Shared roll chirality. Positive rolls the petal's positive-u margin inward. */
  sideCoilDirection?: -1 | 1;
  /** Fraction of the main curvature retained by the opposite petal margin. */
  sideCoilCounterCurve?: number;
}

type PetalPose = 'closed' | 'released' | 'unfurled' | 'open';

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
  pose: PetalPose,
  widthSegments: number,
  lengthSegments: number,
  sideCoilStrength = 0,
): Float32Array => {
  const positions = new Float32Array((widthSegments + 1) * (lengthSegments + 1) * 3);
  const phase = options.seed * 1.61803398875;
  const growthProfile = options.growth ?? DEFAULT_GROWTH_PROFILE;
  const advanced = options.unfurl;
  const open = pose === 'open';
  const waveBias = THREE.MathUtils.clamp(advanced?.wave ?? 0, 0, 1);
  const widthProgress = !advanced
    ? (open ? 1 : 0)
    : pose === 'closed'
      ? 0
      : pose === 'released'
        ? 0.24 + (1 - waveBias) * 0.08
        : pose === 'unfurled'
          ? 0.78
          : 1;
  const axialProgress = !advanced
    ? (open ? 1 : 0)
    : pose === 'closed'
      ? 0
      : pose === 'released'
        ? 0.34
        : pose === 'unfurled'
          ? 0.8
          : 1;
  let ptr = 0;

  for (let iy = 0; iy <= lengthSegments; iy += 1) {
    const v = iy / lengthSegments;
    for (let ix = 0; ix <= widthSegments; ix += 1) {
      const u = ix / widthSegments * 2 - 1;
      const profile = widthProfile(v, options.shape, options.taper);
      const closedWidth = THREE.MathUtils.lerp(
        growthProfile.closedPetalWidth,
        Math.min(1, growthProfile.closedPetalWidth + 0.12),
        v,
      );
      const expansion = THREE.MathUtils.lerp(closedWidth, 1, widthProgress);
      let x = u * options.width * 0.5 * profile * expansion;
      const tipMask = THREE.MathUtils.smoothstep(v, 0.72, 1);
      const notch = options.notch * options.length * Math.exp(-u * u * 16) * tipMask;
      const roundedShape = options.shape === 'round' || options.shape === 'spoon' || options.shape === 'notched';
      const capDepth = options.shape === 'spoon' ? 0.2 : 0.15;
      const roundedCap = roundedShape
        ? (1 - Math.sqrt(Math.max(0, 1 - u * u))) * options.length * capDepth * tipMask
        : 0;
      const marginExcess = growthProfile.marginGrowth
        * Math.pow(Math.abs(u), 2.35)
        * Math.pow(v, 1.4)
        * 0.048
        * widthProgress;
      const axialGrowth = THREE.MathUtils.lerp(growthProfile.closedPetalLength, 1, axialProgress) + marginExcess;
      const edge = Math.pow(Math.abs(u), 3.4);
      const marginWaveGain = THREE.MathUtils.lerp(
        0.22 + growthProfile.marginGrowth * 0.06,
        1 + growthProfile.marginGrowth * 0.18,
        widthProgress,
      );
      const wave = Math.sin(v * 15 + u * 4.5 + phase) * options.waviness * options.length * edge * v * marginWaveGain;
      const midrib = (1 - Math.abs(u)) * Math.sin(Math.PI * v) * options.length * 0.018;
      const transverseCup = (1 - u * u) * Math.sin(Math.PI * v) * options.cup * options.length * 0.28;
      const foldStrength = options.fold ?? 0;
      const foldMask = Math.pow(Math.max(0, Math.sin(Math.PI * v)), 0.82) * THREE.MathUtils.smoothstep(v, 0.04, 0.42);
      const midribCrease = (1 - Math.pow(Math.abs(u), 0.72)) * foldMask * options.length;
      const longitudinalFold = midribCrease * THREE.MathUtils.lerp(
        0.045 + Math.max(0, foldStrength) * 0.025,
        foldStrength * 0.12,
        widthProgress,
      );
      const tipCurl = Math.pow(v, 3.2) * options.curl * options.length * 0.38;
      const closedFold = -Math.pow(v, 2.3) * options.length * (0.16 + Math.max(0, options.curl) * 0.1);
      const basalBand = Math.exp(-Math.pow((v - 0.16) / 0.14, 2)) * (1 - u * u);
      const basalBulge = growthProfile.basalEpinasty * options.length * 0.058 * basalBand;
      let y = options.length * v * axialGrowth - notch - roundedCap;
      let z: number;

      if (!advanced) {
        z = open
          ? transverseCup + longitudinalFold + tipCurl + wave + midrib + basalBulge
          : closedFold + transverseCup * 0.42 + longitudinalFold + wave;
      } else {
        const layer = THREE.MathUtils.clamp(advanced.layer, 0, 1);
        const budCurl = THREE.MathUtils.clamp(advanced.budCurl, 0, 1.4);
        const innerRetention = THREE.MathUtils.clamp(advanced.innerCoil, 0, 1) * layer;
        const inwardMask = Math.pow(THREE.MathUtils.smoothstep(v, 0.16, 1), 2.15);
        const distalMask = Math.pow(THREE.MathUtils.smoothstep(v, 0.48, 1), 1.72);
        const budCoil = -options.length * budCurl * (inwardMask * 0.26 + distalMask * 0.12);
        const coilRetention = pose === 'closed'
          ? 1
          : pose === 'released'
            ? 0.7 + waveBias * 0.12
            : pose === 'unfurled'
              ? 0.12 + innerRetention * 0.28
              : innerRetention * 0.52;
        y -= budCurl * options.length * Math.pow(v, 3.05) * 0.08 * coilRetention;

        if (pose === 'closed') {
          z = budCoil + transverseCup * 0.3 + longitudinalFold + wave * 0.25;
        } else if (pose === 'released') {
          z = budCoil * coilRetention
            + transverseCup * 0.5
            + longitudinalFold
            + wave * 0.45
            + midrib * 0.25
            + basalBulge * 0.9;
        } else if (pose === 'unfurled') {
          z = budCoil * coilRetention
            + transverseCup * 0.82
            + longitudinalFold
            + tipCurl * 0.35
            + wave * 0.82
            + midrib * 0.72
            + basalBulge;
        } else {
          const residualCoil = -options.length * innerRetention * distalMask * 0.26;
          z = transverseCup + longitudinalFold + tipCurl + wave + midrib + basalBulge + residualCoil;
        }
      }

      if (advanced && sideCoilStrength > 0.001) {
        const direction = advanced.sideCoilDirection ?? 1;
        const activeSide = THREE.MathUtils.smoothstep(direction * u, -0.22, 0.94);
        const counterCurve = THREE.MathUtils.clamp(advanced.sideCoilCounterCurve ?? 0.18, 0.08, 0.62);
        const curvatureGain = THREE.MathUtils.lerp(counterCurve, 1, activeSide);
        const longitudinal = Math.pow(THREE.MathUtils.smoothstep(v, 0.1, 0.9), 0.82);
        const halfWidth = options.width * 0.5 * profile * expansion;
        const axisX = direction * halfWidth * 0.045;
        const offsetX = x - axisX;
        const rollAngle = THREE.MathUtils.clamp(sideCoilStrength, 0, 1.25)
          * curvatureGain
          * longitudinal
          * (0.64 + v * 0.36)
          * Math.PI
          * 0.78;
        const cosRoll = Math.cos(rollAngle);
        const sinRoll = Math.sin(rollAngle);
        x = axisX + offsetX * cosRoll;
        z -= Math.abs(offsetX) * sinRoll;
        y -= Math.abs(offsetX) * (1 - cosRoll) * (0.035 + v * 0.045);
      }

      positions[ptr++] = x;
      positions[ptr++] = y;
      positions[ptr++] = z;
    }
  }

  return positions;
};

const buildSurfaceIndices = (widthSegments: number, lengthSegments: number): number[] => {
  const indices: number[] = [];
  for (let iy = 0; iy < lengthSegments; iy += 1) {
    for (let ix = 0; ix < widthSegments; ix += 1) {
      const a = iy * (widthSegments + 1) + ix;
      const b = a + widthSegments + 1;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, d, b, b, d, c);
    }
  }
  return indices;
};

const buildShellPositions = (
  surface: Float32Array,
  surfaceNormals: Float32Array,
  thickness: number,
): Float32Array => {
  const shell = new Float32Array(surface.length * 2);
  const halfThickness = thickness * 0.5;
  for (let index = 0; index < surface.length; index += 3) {
    const backIndex = surface.length + index;
    const nx = surfaceNormals[index];
    const ny = surfaceNormals[index + 1];
    const nz = surfaceNormals[index + 2];
    shell[index] = surface[index] + nx * halfThickness;
    shell[index + 1] = surface[index + 1] + ny * halfThickness;
    shell[index + 2] = surface[index + 2] + nz * halfThickness;
    shell[backIndex] = surface[index] - nx * halfThickness;
    shell[backIndex + 1] = surface[index + 1] - ny * halfThickness;
    shell[backIndex + 2] = surface[index + 2] - nz * halfThickness;
  }
  return shell;
};

const buildPerimeter = (widthSegments: number, lengthSegments: number): number[] => {
  const rowWidth = widthSegments + 1;
  const perimeter: number[] = [];
  for (let ix = 0; ix <= widthSegments; ix += 1) perimeter.push(ix);
  for (let iy = 1; iy <= lengthSegments; iy += 1) perimeter.push(iy * rowWidth + widthSegments);
  for (let ix = widthSegments - 1; ix >= 0; ix -= 1) perimeter.push(lengthSegments * rowWidth + ix);
  for (let iy = lengthSegments - 1; iy > 0; iy -= 1) perimeter.push(iy * rowWidth);
  return perimeter;
};

const buildShellIndices = (
  surfaceIndices: number[],
  widthSegments: number,
  lengthSegments: number,
): number[] => {
  const surfaceCount = (widthSegments + 1) * (lengthSegments + 1);
  const indices = [...surfaceIndices];

  for (let index = 0; index < surfaceIndices.length; index += 3) {
    const a = surfaceIndices[index] + surfaceCount;
    const b = surfaceIndices[index + 1] + surfaceCount;
    const c = surfaceIndices[index + 2] + surfaceCount;
    indices.push(a, c, b);
  }

  const perimeter = buildPerimeter(widthSegments, lengthSegments);
  for (let index = 0; index < perimeter.length; index += 1) {
    const frontA = perimeter[index];
    const frontB = perimeter[(index + 1) % perimeter.length];
    const backA = frontA + surfaceCount;
    const backB = frontB + surfaceCount;
    indices.push(frontA, backA, frontB, frontB, backA, backB);
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

export const resolvePetalThickness = (length: number): number => THREE.MathUtils.clamp(length * 0.014, 0.009, 0.026);

export const createPetalGeometry = (options: PetalGeometryOptions): THREE.BufferGeometry => {
  const widthSegments = Math.round(THREE.MathUtils.clamp(options.segments?.width ?? 10, 3, 18));
  const lengthSegments = Math.round(THREE.MathUtils.clamp(options.segments?.length ?? 18, 5, 30));
  const closedSurface = buildPositions(options, 'closed', widthSegments, lengthSegments);
  const targetPoses: PetalPose[] = options.unfurl ? ['released', 'unfurled', 'open'] : ['open'];
  const sideCoil = THREE.MathUtils.clamp(options.unfurl?.sideCoil ?? 0, 0, 1.25);
  const vortexSurface = sideCoil > 0.001
    ? buildPositions(options, 'closed', widthSegments, lengthSegments, sideCoil)
    : undefined;
  const targetSurfaces = [
    ...(vortexSurface ? [vortexSurface] : []),
    ...targetPoses.map((pose) => buildPositions(options, pose, widthSegments, lengthSegments)),
  ];
  const targetNames = [...(vortexSurface ? ['vortex'] : []), ...targetPoses];
  const surfaceIndices = buildSurfaceIndices(widthSegments, lengthSegments);
  const closedSurfaceNormals = computeNormals(closedSurface, surfaceIndices);
  const targetSurfaceNormals = targetSurfaces.map((surface) => computeNormals(surface, surfaceIndices));
  const thickness = options.thickness ?? resolvePetalThickness(options.length);
  const closed = buildShellPositions(closedSurface, closedSurfaceNormals, thickness);
  const targets = targetSurfaces.map((surface, index) => buildShellPositions(surface, targetSurfaceNormals[index], thickness));
  const indices = buildShellIndices(surfaceIndices, widthSegments, lengthSegments);
  const closedNormals = computeNormals(closed, indices);
  const targetNormals = targets.map((target) => computeNormals(target, indices));
  const surfaceCount = (widthSegments + 1) * (lengthSegments + 1);
  const count = surfaceCount * 2;
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const baseColor = new THREE.Color(options.colors.base);
  const tipColor = new THREE.Color(options.colors.tip);

  let colorPtr = 0;
  let uvPtr = 0;
  for (let side = 0; side < 2; side += 1) {
    for (let iy = 0; iy <= lengthSegments; iy += 1) {
      const v = iy / lengthSegments;
      const tint = baseColor.clone().lerp(tipColor, Math.pow(v, 0.72));
      if (side === 1) tint.multiplyScalar(0.82);
      for (let ix = 0; ix <= widthSegments; ix += 1) {
        colors[colorPtr++] = tint.r;
        colors[colorPtr++] = tint.g;
        colors[colorPtr++] = tint.b;
        uvs[uvPtr++] = ix / widthSegments;
        uvs[uvPtr++] = v;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(closed, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(closedNormals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.morphAttributes.position = targets.map((target) => new THREE.BufferAttribute(target, 3));
  geometry.morphAttributes.normal = targetNormals.map((normal) => new THREE.BufferAttribute(normal, 3));
  geometry.morphTargetsRelative = false;
  geometry.userData.petalThickness = thickness;
  geometry.userData.closedPetalLength = options.growth?.closedPetalLength ?? DEFAULT_GROWTH_PROFILE.closedPetalLength;
  geometry.userData.closedPetalWidth = options.growth?.closedPetalWidth ?? DEFAULT_GROWTH_PROFILE.closedPetalWidth;
  geometry.userData.petalFold = options.fold ?? 0;
  geometry.userData.petalMorphStages = targetNames;
  geometry.userData.vortexMorphIndex = vortexSurface ? 0 : -1;
  geometry.userData.unfurlMorphOffset = vortexSurface ? 1 : 0;
  geometry.userData.sideCoilCounterCurve = options.unfurl?.sideCoilCounterCurve ?? 0;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

const samplePetalHeight = (u: number, v: number): number => {
  const x = THREE.MathUtils.clamp(u, 0, 1) * 2 - 1;
  const y = THREE.MathUtils.clamp(v, 0, 1);
  const lengthMask = Math.pow(Math.max(0, Math.sin(Math.PI * y)), 0.62);
  const midrib = Math.exp(-x * x * 34) * (0.035 + lengthMask * 0.11);
  const veinPhase = (Math.abs(x) * 8.5 - y * 14) * Math.PI;
  const veins = Math.sin(veinPhase) * (1 - Math.exp(-Math.abs(x) * 6)) * lengthMask * 0.0065;
  const microCells = Math.sin((x + y * 0.31) * 43) * Math.sin(y * 67) * lengthMask * 0.0012;
  return midrib + veins + microCells;
};

export const createPetalNormalMap = (width = 96, height = 192): THREE.DataTexture => {
  const data = new Uint8Array(width * height * 4);
  const du = 1 / Math.max(1, width - 1);
  const dv = 1 / Math.max(1, height - 1);
  const normal = new THREE.Vector3();

  for (let y = 0; y < height; y += 1) {
    const v = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(1, width - 1);
      const dx = (samplePetalHeight(u + du, v) - samplePetalHeight(u - du, v)) / (du * 2);
      const dy = (samplePetalHeight(u, v + dv) - samplePetalHeight(u, v - dv)) / (dv * 2);
      normal.set(-dx * 0.34, -dy * 0.21, 1).normalize();
      const pointer = (y * width + x) * 4;
      data[pointer] = Math.round((normal.x * 0.5 + 0.5) * 255);
      data[pointer + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      data[pointer + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      data[pointer + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'Floraxis petal veins normal map';
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};

let sharedPetalNormalMap: THREE.DataTexture | undefined;

const getPetalNormalMap = (): THREE.DataTexture => {
  sharedPetalNormalMap ??= createPetalNormalMap();
  return sharedPetalNormalMap;
};

export const createPetalMaterial = (
  colors: FlowerColors,
  morphology: Pick<FlowerMorphology, 'roughness' | 'sssStrength'>,
): THREE.MeshSSSNodeMaterial => {
  const material = new THREE.MeshSSSNodeMaterial({
    color: 0xffffff,
    roughness: morphology.roughness,
    metalness: 0,
    side: THREE.FrontSide,
    vertexColors: true,
  });
  material.normalMap = getPetalNormalMap();
  material.normalMapType = THREE.TangentSpaceNormalMap;
  material.normalScale.set(0.24 + morphology.sssStrength * 0.08, 0.31 + morphology.sssStrength * 0.11);
  material.thicknessColorNode = color(colors.reverse);
  material.thicknessDistortionNode = float(0.16 + morphology.sssStrength * 0.22);
  material.thicknessAmbientNode = float(0.015 + morphology.sssStrength * 0.04);
  material.thicknessAttenuationNode = float(0.08 + morphology.sssStrength * 0.32);
  material.thicknessPowerNode = float(2.4);
  material.thicknessScaleNode = float(3.5 + morphology.sssStrength * 8);
  return material;
};

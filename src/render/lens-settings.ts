import type { RenderSettings } from '../types';

export type BokehShape = RenderSettings['bokehShape'];

export interface BokehPoint {
  x: number;
  y: number;
}

export interface BokehKernel {
  points64: BokehPoint[];
  points16: BokehPoint[];
}

const GOLDEN_ANGLE = 2.399963229728653;
const KERNEL_SAMPLES = 80;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const cross = (a: BokehPoint, b: BokehPoint): number => a.x * b.y - a.y * b.x;

const regularVertices = (count: number, innerScale = 1): BokehPoint[] => {
  const safeCount = Math.round(clamp(count, 3, 12));
  const vertices: BokehPoint[] = [];
  const star = innerScale < 0.999;
  const vertexCount = star ? safeCount * 2 : safeCount;
  for (let index = 0; index < vertexCount; index += 1) {
    const radius = star && index % 2 === 1 ? innerScale : 1;
    const angle = Math.PI * 0.5 + index * Math.PI * 2 / vertexCount;
    vertices.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return vertices;
};

const HEART_VERTICES: BokehPoint[] = [
  { x: 0, y: -1 },
  { x: -0.24, y: -0.7 },
  { x: -0.62, y: -0.42 },
  { x: -0.92, y: -0.04 },
  { x: -1, y: 0.32 },
  { x: -0.82, y: 0.68 },
  { x: -0.48, y: 0.86 },
  { x: -0.17, y: 0.76 },
  { x: 0, y: 0.5 },
  { x: 0.17, y: 0.76 },
  { x: 0.48, y: 0.86 },
  { x: 0.82, y: 0.68 },
  { x: 1, y: 0.32 },
  { x: 0.92, y: -0.04 },
  { x: 0.62, y: -0.42 },
  { x: 0.24, y: -0.7 },
];

/** Distance from the origin to a polygon boundary along a ray. */
export const rayPolygonRadius = (angle: number, vertices: BokehPoint[]): number => {
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  let radius = Number.POSITIVE_INFINITY;
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const edge = { x: end.x - start.x, y: end.y - start.y };
    const denominator = cross(direction, edge);
    if (Math.abs(denominator) < 1e-7) continue;
    const distance = cross(start, edge) / denominator;
    const edgePosition = cross(start, direction) / denominator;
    if (distance > 0 && edgePosition >= -1e-6 && edgePosition <= 1 + 1e-6) {
      radius = Math.min(radius, distance);
    }
  }
  return Number.isFinite(radius) ? radius : 1;
};

const apertureRadius = (shape: BokehShape, angle: number, blades: number): number => {
  if (shape === 'circle') return 1;
  if (shape === 'heart') return rayPolygonRadius(angle, HEART_VERTICES);
  if (shape === 'star') return rayPolygonRadius(angle, regularVertices(blades, 0.46));
  return rayPolygonRadius(angle, regularVertices(blades));
};

/**
 * Generates the same 64 + 16 sample split used by Three.js DOF, while mapping
 * the Vogel disc into a selectable aperture outline.
 */
export const generateBokehKernel = (
  shape: BokehShape,
  blades = 6,
  rotationDegrees = 0,
): BokehKernel => {
  const points64: BokehPoint[] = [];
  const points16: BokehPoint[] = [];
  const rotation = rotationDegrees * Math.PI / 180;
  for (let index = 0; index < KERNEL_SAMPLES; index += 1) {
    const angle = index * GOLDEN_ANGLE;
    const normalizedRadius = Math.sqrt((index + 0.5) / KERNEL_SAMPLES);
    const boundary = apertureRadius(shape, angle - rotation, blades);
    const point = {
      x: Math.cos(angle) * normalizedRadius * boundary,
      y: Math.sin(angle) * normalizedRadius * boundary,
    };
    if (index % 5 === 0) points16.push(point);
    else points64.push(point);
  }
  return { points64, points16 };
};

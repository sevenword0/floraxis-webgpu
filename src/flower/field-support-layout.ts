import type { FieldSettings } from '../types';
import { fieldPathHalfWidth } from './field-layout-patterns';

export interface FieldSupportPoint {
  x: number;
  y: number;
  z: number;
}

export interface FieldSupportSegment {
  start: FieldSupportPoint;
  end: FieldSupportPoint;
  radius: number;
}

const segment = (
  start: FieldSupportPoint,
  end: FieldSupportPoint,
  radius: number,
): FieldSupportSegment => ({ start, end, radius });

/** Creates a lightweight pergola or espalier frame for corridor planting modes. */
export const generateFieldSupportSegments = (
  settings: Pick<FieldSettings, 'radius' | 'layoutMode'>,
  maximumPlantHeight: number,
): FieldSupportSegment[] => {
  if (settings.layoutMode !== 'flower-tunnel' && settings.layoutMode !== 'flower-road-walls') return [];
  const supports: FieldSupportSegment[] = [];
  const halfPath = fieldPathHalfWidth(settings);
  const extent = settings.radius * 0.78;
  const stationCount = Math.max(5, Math.round(settings.radius * 1.35));
  const stations = Array.from({ length: stationCount }, (_, index) =>
    -extent + index / Math.max(1, stationCount - 1) * extent * 2);

  if (settings.layoutMode === 'flower-tunnel') {
    const span = halfPath + 0.28;
    const postTop = Math.min(3.25, Math.max(2.05, maximumPlantHeight * 0.56));
    const rise = Math.min(1.35, Math.max(0.88, span * 0.76));
    for (const z of stations) {
      supports.push(
        segment({ x: -span, y: 0, z }, { x: -span, y: postTop, z }, 0.034),
        segment({ x: span, y: 0, z }, { x: span, y: postTop, z }, 0.034),
      );
      let previous = { x: -span, y: postTop, z };
      for (let arc = 1; arc <= 8; arc += 1) {
        const theta = Math.PI - arc / 8 * Math.PI;
        const next = { x: Math.cos(theta) * span, y: postTop + Math.sin(theta) * rise, z };
        supports.push(segment(previous, next, 0.026));
        previous = next;
      }
    }
    for (const theta of [Math.PI, Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.25, 0]) {
      const x = Math.cos(theta) * span;
      const y = postTop + Math.sin(theta) * rise;
      supports.push(segment({ x, y, z: -extent }, { x, y, z: extent }, 0.022));
    }
  } else {
    const wallX = halfPath + 0.22;
    const wallHeight = Math.min(2.7, Math.max(1.65, maximumPlantHeight * 0.46));
    for (const z of stations) {
      supports.push(
        segment({ x: -wallX, y: 0, z }, { x: -wallX, y: wallHeight, z }, 0.035),
        segment({ x: wallX, y: 0, z }, { x: wallX, y: wallHeight, z }, 0.035),
      );
    }
    for (const side of [-1, 1]) {
      for (const level of [0.28, 0.52, 0.76, 1]) {
        supports.push(segment(
          { x: side * wallX, y: wallHeight * level, z: -extent },
          { x: side * wallX, y: wallHeight * level, z: extent },
          0.022,
        ));
      }
    }
  }
  return supports;
};

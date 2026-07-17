import type { FieldLayoutMode, FieldSettings } from '../types';
import { seededRandom } from '../utils';

export type FieldLayoutZone = 'scatter' | 'row' | 'ring' | 'sector' | 'center' | 'outer';

export interface FieldLayoutAnchor {
  x: number;
  z: number;
  /** Organised species group before random mixing is applied. */
  groupIndex: number;
  bandIndex: number;
  zone: FieldLayoutZone;
}

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const GOLDEN_FRACTION = (Math.sqrt(5) - 1) * 0.5;

const clampInteger = (value: number, minimum: number, maximum: number): number =>
  Math.round(Math.min(maximum, Math.max(minimum, value)));

const balancedCounts = (total: number, groups: number): number[] => {
  const safeGroups = Math.max(1, Math.round(groups));
  const base = Math.floor(total / safeGroups);
  const remainder = total - base * safeGroups;
  return Array.from({ length: safeGroups }, (_, index) => base + (index < remainder ? 1 : 0));
};

const weightedCounts = (total: number, weights: number[]): number[] => {
  if (weights.length === 0) return [];
  const counts = Array(weights.length).fill(0) as number[];
  let remaining = total;
  if (total >= weights.length) {
    counts.fill(1);
    remaining -= weights.length;
  }
  const weightTotal = weights.reduce((sum, value) => sum + Math.max(0.001, value), 0);
  const fractions = weights.map((weight, index) => {
    const exact = remaining * Math.max(0.001, weight) / weightTotal;
    const whole = Math.floor(exact);
    counts[index] += whole;
    return { index, fraction: exact - whole };
  });
  const unassigned = total - counts.reduce((sum, value) => sum + value, 0);
  fractions.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < unassigned; index += 1) counts[fractions[index % fractions.length].index] += 1;
  return counts;
};

const pushRing = (
  anchors: FieldLayoutAnchor[],
  count: number,
  radius: number,
  phase: number,
  bandIndex: number,
  speciesCount: number,
  zone: 'ring' | 'outer',
): void => {
  for (let index = 0; index < count; index += 1) {
    const angle = phase + index / Math.max(1, count) * TAU;
    anchors.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      groupIndex: Math.min(speciesCount - 1, Math.floor(index / Math.max(1, count) * speciesCount)),
      bandIndex,
      zone,
    });
  }
};

const createSectorAnchors = (
  total: number,
  speciesCount: number,
  minimumRadius: number,
  maximumRadius: number,
  phase: number,
  zone: 'sector',
): FieldLayoutAnchor[] => {
  const anchors: FieldLayoutAnchor[] = [];
  const counts = balancedCounts(total, speciesCount);
  const sectorWidth = TAU / speciesCount;
  counts.forEach((count, speciesIndex) => {
    for (let index = 0; index < count; index += 1) {
      const radialT = (index + 0.55) / Math.max(1, count);
      const radius = Math.sqrt(minimumRadius * minimumRadius
        + (maximumRadius * maximumRadius - minimumRadius * minimumRadius) * radialT);
      const sequence = (index * GOLDEN_FRACTION + speciesIndex * 0.173) % 1;
      const angle = phase + speciesIndex * sectorWidth + sectorWidth * (0.12 + sequence * 0.76);
      anchors.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, groupIndex: speciesIndex, bandIndex: speciesIndex, zone });
    }
  });
  return anchors;
};

const modeSalt: Record<FieldLayoutMode, number> = {
  scatter: 0x1f123bb5,
  'species-rows': 0x5f356495,
  concentric: 0x7f4a7c15,
  'species-sectors': 0x3c6ef372,
  'radial-composite': 0x9e3779b9,
};

/** Generates deterministic pattern anchors before plant-size collision resolution. */
export const generateFieldLayoutAnchors = (
  settings: Pick<FieldSettings, 'count' | 'radius' | 'spacing' | 'seed' | 'layoutMode' | 'rowsPerSpecies' | 'ringCount'>,
  requestedSpeciesCount: number,
): FieldLayoutAnchor[] => {
  const count = clampInteger(settings.count, 12, 420);
  const radius = Math.min(10, Math.max(2.5, settings.radius));
  const spacing = Math.min(1.2, Math.max(0.12, settings.spacing));
  const usableRadius = Math.max(0.4, radius - spacing * 0.44);
  const speciesCount = clampInteger(requestedSpeciesCount, 1, 24);
  const random = seededRandom((Math.max(1, Math.round(settings.seed)) * 2654435761) ^ modeSalt[settings.layoutMode]);
  const phase = random() * TAU;
  const anchors: FieldLayoutAnchor[] = [];

  if (settings.layoutMode === 'scatter') {
    for (let index = 0; index < count; index += 1) {
      const radialJitter = (random() - 0.5) / Math.max(2, count);
      const anchorRadius = Math.sqrt(Math.min(1, Math.max(0, (index + 0.5) / count + radialJitter))) * usableRadius;
      const angle = phase + index * GOLDEN_ANGLE + (random() - 0.5) * 0.36;
      const groupedAngle = (angle - phase + TAU) % TAU;
      anchors.push({
        x: Math.cos(angle) * anchorRadius,
        z: Math.sin(angle) * anchorRadius,
        groupIndex: Math.min(speciesCount - 1, Math.floor(groupedAngle / TAU * speciesCount)),
        bandIndex: 0,
        zone: 'scatter',
      });
    }
  } else if (settings.layoutMode === 'species-rows') {
    const rowsPerSpecies = clampInteger(settings.rowsPerSpecies, 1, 6);
    const totalRows = rowsPerSpecies * speciesCount;
    const speciesCounts = balancedCounts(count, speciesCount);
    speciesCounts.forEach((speciesTotal, speciesIndex) => {
      const perRow = balancedCounts(speciesTotal, rowsPerSpecies);
      perRow.forEach((rowTotal, rowIndex) => {
        const globalRow = speciesIndex * rowsPerSpecies + rowIndex;
        const rowT = totalRows <= 1 ? 0.5 : globalRow / (totalRows - 1);
        const z = (rowT * 2 - 1) * usableRadius * 0.78;
        const extent = Math.sqrt(Math.max(0, usableRadius * usableRadius - z * z)) * 0.92;
        for (let column = 0; column < rowTotal; column += 1) {
          const x = rowTotal <= 1 ? 0 : -extent + (column + 1) / (rowTotal + 1) * extent * 2;
          anchors.push({ x, z, groupIndex: speciesIndex, bandIndex: globalRow, zone: 'row' });
        }
      });
    });
  } else if (settings.layoutMode === 'concentric') {
    const ringCount = clampInteger(settings.ringCount, 2, 12);
    const radii = Array.from({ length: ringCount }, (_, index) =>
      usableRadius * (0.16 + (ringCount <= 1 ? 0 : index / (ringCount - 1)) * 0.76));
    const ringCounts = weightedCounts(count, radii);
    ringCounts.forEach((ringTotal, ringIndex) => {
      pushRing(anchors, ringTotal, radii[ringIndex], phase + ringIndex * 0.23, ringIndex, speciesCount, 'ring');
    });
  } else if (settings.layoutMode === 'species-sectors') {
    anchors.push(...createSectorAnchors(count, speciesCount, usableRadius * 0.12, usableRadius * 0.93, phase, 'sector'));
  } else {
    const centerCount = Math.max(speciesCount, Math.round(count * 0.22));
    const sectorCount = Math.max(speciesCount, Math.round(count * 0.53));
    const safeSectorCount = Math.min(count - centerCount, sectorCount);
    const outerCount = Math.max(0, count - centerCount - safeSectorCount);
    for (let index = 0; index < centerCount; index += 1) {
      const anchorRadius = Math.sqrt((index + 0.5) / centerCount) * usableRadius * 0.28;
      const angle = phase + index * GOLDEN_ANGLE;
      anchors.push({
        x: Math.cos(angle) * anchorRadius,
        z: Math.sin(angle) * anchorRadius,
        groupIndex: Math.min(speciesCount - 1, Math.floor(index / centerCount * speciesCount)),
        bandIndex: 0,
        zone: 'center',
      });
    }
    anchors.push(...createSectorAnchors(safeSectorCount, speciesCount, usableRadius * 0.36, usableRadius * 0.73, phase, 'sector'));
    const outerRings = Math.min(4, Math.max(1, Math.round(clampInteger(settings.ringCount, 2, 12) / 2)));
    const outerRadii = Array.from({ length: outerRings }, (_, index) =>
      usableRadius * (0.82 + (outerRings <= 1 ? 0.08 : index / (outerRings - 1) * 0.14)));
    const outerCounts = weightedCounts(outerCount, outerRadii);
    outerCounts.forEach((ringTotal, ringIndex) => {
      const start = anchors.length;
      pushRing(anchors, ringTotal, outerRadii[ringIndex], phase + ringIndex * 0.19, ringIndex, speciesCount, 'outer');
      for (let index = start; index < anchors.length; index += 1) {
        const angle = Math.atan2(anchors[index].z, anchors[index].x) - phase;
        const normalized = ((angle % TAU) + TAU) % TAU;
        anchors[index].groupIndex = Math.min(speciesCount - 1, Math.floor(normalized / TAU * speciesCount));
      }
    });
  }

  return anchors.slice(0, count);
};

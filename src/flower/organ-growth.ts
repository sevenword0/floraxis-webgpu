import { resolveGrowthProfile } from '../growth-model';
import type { FlowerPreset } from '../types';
import { clamp01, smootherstep } from '../utils';
import type { FloralOrganGraph, FloralOrganKind } from './floral-organ-graph';

export interface OrganGrowthScheduleEntry {
  nodeId: string;
  kind: FloralOrganKind;
  label: string;
  start: number;
  span: number;
  /** Additional delay from earliest to latest initiated organ. */
  rankDelay: number;
  initialScale: number;
}

export interface OrganGrowthState {
  local: number;
  elongation: number;
  deployment: number;
  maturity: number;
  visible: boolean;
}

const timingForKind = (
  kind: FloralOrganKind,
  preset: FlowerPreset,
): Omit<OrganGrowthScheduleEntry, 'nodeId' | 'kind' | 'label'> => {
  const growth = resolveGrowthProfile(preset);
  const stagger = preset.morphology.stagger;
  switch (kind) {
    case 'flower-head':
    case 'inflorescence-axis':
      return { start: 0, span: Math.max(0.12, growth.swellingEnd), rankDelay: 0, initialScale: growth.budHeadScale };
    case 'receptacle':
      return { start: 0.02, span: Math.max(0.12, growth.swellingEnd * 0.9), rankDelay: 0, initialScale: 0.76 };
    case 'sepal':
      return { start: Math.max(0.015, growth.openingStart - 0.1), span: Math.max(0.3, growth.openingSpan * 0.72), rankDelay: stagger * 0.08, initialScale: 0.72 };
    case 'petal':
    case 'tepal':
    case 'ray-floret':
    case 'banner-petal':
    case 'wing-petal':
    case 'keel-petal':
      return {
        start: growth.openingStart,
        span: growth.openingSpan,
        rankDelay: stagger * (preset.morphology.budCurl > 0.01 ? 0.92 : 0.72),
        initialScale: growth.closedPetalLength,
      };
    case 'decorative-floret':
    case 'fertile-floret':
      return { start: growth.openingStart, span: growth.openingSpan, rankDelay: stagger * 0.68, initialScale: 0.48 };
    case 'disc-floret':
      return { start: Math.max(0.05, growth.reproductiveReveal), span: 0.28, rankDelay: stagger * 0.34, initialScale: 0.08 };
    case 'stamen':
      return { start: growth.reproductiveReveal, span: 0.24, rankDelay: stagger * 0.08, initialScale: 0.03 };
    case 'carpel':
      return { start: Math.max(0, growth.reproductiveReveal - 0.04), span: 0.28, rankDelay: stagger * 0.05, initialScale: 0.2 };
  }
};

/**
 * Converts the static floral graph to organ-specific phenology, following the
 * Helios/OpenAlea separation between topology, organ geometry, and growth law.
 */
export const resolveOrganGrowthSchedule = (
  preset: FlowerPreset,
  graph: FloralOrganGraph,
): OrganGrowthScheduleEntry[] => graph.nodes.map((organ) => ({
  nodeId: organ.id,
  kind: organ.kind,
  label: organ.label,
  ...timingForKind(organ.kind, preset),
}));

export const findOrganGrowth = (
  schedule: OrganGrowthScheduleEntry[],
  nodeId: string,
): OrganGrowthScheduleEntry => schedule.find((entry) => entry.nodeId === nodeId)
  ?? { nodeId, kind: 'flower-head', label: nodeId, start: 0, span: 1, rankDelay: 0, initialScale: 1 };

export const evaluateOrganGrowth = (
  entry: OrganGrowthScheduleEntry,
  progress: number,
  rank = 0,
): OrganGrowthState => {
  const start = entry.start + clamp01(rank) * entry.rankDelay;
  const local = smootherstep((progress - start) / Math.max(0.08, entry.span));
  return {
    local,
    elongation: entry.initialScale + (1 - entry.initialScale) * local,
    deployment: smootherstep(local),
    maturity: smootherstep((local - 0.48) / 0.52),
    visible: progress >= start - 0.035,
  };
};

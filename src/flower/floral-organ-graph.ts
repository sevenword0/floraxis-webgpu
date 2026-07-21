import { resolveFloralSystemProfile } from '../data/floral-system-profiles';
import type { FloralFusion, FloralPhyllotaxis, FloralSymmetry, FlowerPreset } from '../types';

export type FloralOrganKind =
  | 'flower-head'
  | 'inflorescence-axis'
  | 'receptacle'
  | 'sepal'
  | 'petal'
  | 'tepal'
  | 'stamen'
  | 'carpel'
  | 'ray-floret'
  | 'disc-floret'
  | 'decorative-floret'
  | 'fertile-floret'
  | 'banner-petal'
  | 'wing-petal'
  | 'keel-petal';

export interface FloralOrganNode {
  id: string;
  parentId: string | null;
  kind: FloralOrganKind;
  count: number;
  whorl: number;
  arrangement: FloralPhyllotaxis;
  fusion: FloralFusion;
  merism: number;
  /** Distinguishes a count repeated inside every floret from a whole-head count. */
  scope: 'flower' | 'head' | 'per-floret';
  label: string;
}

export interface FloralOrganGraph {
  schemaVersion: 1;
  rootId: string;
  symmetry: FloralSymmetry;
  ovaryPosition: 'superior' | 'inferior' | 'embedded';
  nodes: FloralOrganNode[];
}

export interface OrganPlacement {
  index: number;
  layer: number;
  indexInLayer: number;
  layerCount: number;
  normalizedLayer: number;
  angle: number;
  /** Normalized organ initiation order, useful as a growth delay. */
  rank: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const node = (
  id: string,
  parentId: string | null,
  kind: FloralOrganKind,
  count: number,
  whorl: number,
  arrangement: FloralPhyllotaxis,
  fusion: FloralFusion,
  merism: number,
  scope: FloralOrganNode['scope'],
  label: string,
): FloralOrganNode => ({
  id,
  parentId,
  kind,
  count: Math.max(0, Math.round(count)),
  whorl,
  arrangement,
  fusion,
  merism: Math.max(1, Math.round(merism)),
  scope,
  label,
});

/** Builds an MTG-like parent/child graph from the renderable eFLOWER profile. */
export const buildFloralOrganGraph = (preset: FlowerPreset): FloralOrganGraph => {
  const profile = resolveFloralSystemProfile(preset);
  const traits = profile.traits;
  const morphology = preset.morphology;
  const rootKind: FloralOrganKind = preset.kind === 'hydrangea' || preset.kind === 'wisteria'
    ? 'inflorescence-axis'
    : 'flower-head';
  const nodes: FloralOrganNode[] = [
    node('head', null, rootKind, 1, 0, preset.kind === 'radial' ? traits.perianth.phyllotaxis : 'clustered', 'free', 1, 'head', rootKind === 'flower-head' ? '꽃머리' : '꽃차례축'),
    node('receptacle', 'head', 'receptacle', 1, 0, 'whorled', 'fused', 1, 'flower', '화탁'),
  ];

  if (preset.kind === 'sunflower') {
    nodes.push(
      node('sepals', 'receptacle', 'sepal', morphology.sepalCount, 0, 'whorled', 'free', morphology.sepalCount, 'head', '총포편'),
      node('ray-florets', 'receptacle', 'ray-floret', morphology.petalCount, 1, 'whorled', 'fused', traits.perianth.merism, 'head', '바깥 설상화'),
      node('disc-florets', 'receptacle', 'disc-floret', morphology.discCount, 2, 'spiral', 'fused', traits.perianth.merism, 'head', '중앙 통상화'),
      node('stamens', 'disc-florets', 'stamen', traits.androecium.count, 3, traits.androecium.phyllotaxis, traits.androecium.filamentFusion, traits.androecium.merism, 'per-floret', '통상화 수술'),
      node('carpels', 'disc-florets', 'carpel', traits.gynoecium.carpelCount, 4, traits.gynoecium.phyllotaxis, traits.gynoecium.ovaryFusion, traits.gynoecium.carpelCount, 'per-floret', '통상화 심피'),
    );
  } else if (preset.kind === 'hydrangea') {
    const floretCount = Math.max(1, Math.round(morphology.petalCount / Math.max(1, traits.perianth.merism)));
    const decorative = Math.max(1, Math.round(floretCount * 0.62));
    nodes.push(
      node('decorative-florets', 'head', 'decorative-floret', decorative, 1, 'clustered', 'free', traits.perianth.merism, 'head', '장식화'),
      node('fertile-florets', 'head', 'fertile-floret', floretCount - decorative, 2, 'clustered', 'free', traits.perianth.merism, 'head', '가임화'),
      node('sepals', 'decorative-florets', 'sepal', traits.perianth.merism, 1, 'whorled', traits.perianth.fusion, traits.perianth.merism, 'per-floret', '확대 꽃받침조각'),
      node('stamens', 'fertile-florets', 'stamen', traits.androecium.count, 2, traits.androecium.phyllotaxis, traits.androecium.filamentFusion, traits.androecium.merism, 'per-floret', '가임화 수술'),
      node('carpels', 'fertile-florets', 'carpel', traits.gynoecium.carpelCount, 3, traits.gynoecium.phyllotaxis, traits.gynoecium.ovaryFusion, traits.gynoecium.carpelCount, 'per-floret', '가임화 심피'),
    );
  } else if (preset.kind === 'wisteria') {
    const floretCount = Math.max(1, Math.round(morphology.petalCount / 5));
    nodes.push(
      node('banner-petals', 'head', 'banner-petal', floretCount, 1, 'clustered', 'free', 1, 'head', '기판'),
      node('wing-petals', 'head', 'wing-petal', floretCount * 2, 1, 'clustered', 'free', 2, 'head', '익판'),
      node('keel-petals', 'head', 'keel-petal', floretCount * 2, 1, 'clustered', 'basally-fused', 2, 'head', '용골판'),
      node('stamens', 'head', 'stamen', traits.androecium.count, 2, traits.androecium.phyllotaxis, traits.androecium.filamentFusion, traits.androecium.merism, 'per-floret', '소화 수술'),
      node('carpels', 'head', 'carpel', traits.gynoecium.carpelCount, 3, traits.gynoecium.phyllotaxis, traits.gynoecium.ovaryFusion, traits.gynoecium.carpelCount, 'per-floret', '소화 심피'),
    );
  } else {
    if (morphology.sepalCount > 0) {
      nodes.push(node('sepals', 'receptacle', 'sepal', morphology.sepalCount, 1, traits.perianth.phyllotaxis, traits.perianth.fusion, traits.perianth.merism, 'flower', '꽃받침'));
    }
    const perianthKind: FloralOrganKind = traits.perianth.differentiation === 'tepals' ? 'tepal' : 'petal';
    nodes.push(
      node('perianth', 'receptacle', perianthKind, morphology.petalCount, 2, traits.perianth.phyllotaxis, traits.perianth.fusion, traits.perianth.merism, 'flower', perianthKind === 'tepal' ? '화피' : '꽃잎'),
      node('stamens', 'receptacle', 'stamen', morphology.stamens, 3, traits.androecium.phyllotaxis, traits.androecium.filamentFusion, traits.androecium.merism, 'flower', '수술'),
      node('carpels', 'receptacle', 'carpel', traits.gynoecium.carpelCount, 4, traits.gynoecium.phyllotaxis, traits.gynoecium.ovaryFusion, traits.gynoecium.carpelCount, 'flower', '심피'),
    );
  }

  return {
    schemaVersion: 1,
    rootId: 'head',
    symmetry: traits.symmetry,
    ovaryPosition: traits.ovaryPosition,
    nodes,
  };
};

export const findOrganNode = (
  graph: FloralOrganGraph,
  ...kinds: FloralOrganKind[]
): FloralOrganNode | undefined => graph.nodes.find((item) => kinds.includes(item.kind));

const distributeAcrossLayers = (total: number, layers: number, merism: number): number[] => {
  const safeLayers = Math.max(1, Math.min(Math.round(layers), Math.max(1, total)));
  if (total === safeLayers * merism) return Array.from({ length: safeLayers }, () => merism);
  const counts = Array.from({ length: safeLayers }, () => Math.floor(total / safeLayers));
  for (let index = 0; index < total % safeLayers; index += 1) counts[index] += 1;
  return counts;
};

/** Exact placement order shared by specimen and field renderers. */
export const generateOrganPlacements = (
  organ: FloralOrganNode,
  options?: { count?: number; layers?: number; spiralBias?: number },
): OrganPlacement[] => {
  const total = Math.max(0, Math.round(options?.count ?? organ.count));
  if (total === 0) return [];
  const layers = Math.max(1, Math.round(options?.layers ?? 1));
  const counts = distributeAcrossLayers(total, layers, organ.merism);
  const placements: OrganPlacement[] = [];
  let globalIndex = 0;
  for (let layer = 0; layer < counts.length; layer += 1) {
    const layerCount = counts[layer];
    for (let indexInLayer = 0; indexInLayer < layerCount; indexInLayer += 1) {
      let angle: number;
      if (organ.arrangement === 'whorled') {
        const alternateWhorl = layer % 2 === 0 ? 0 : Math.PI / Math.max(1, layerCount);
        angle = indexInLayer / layerCount * Math.PI * 2 + alternateWhorl;
      } else {
        angle = globalIndex * GOLDEN_ANGLE + layer * (options?.spiralBias ?? 0.11);
      }
      placements.push({
        index: globalIndex,
        layer,
        indexInLayer,
        layerCount,
        normalizedLayer: layer / Math.max(1, counts.length - 1),
        angle,
        rank: globalIndex / Math.max(1, total - 1),
      });
      globalIndex += 1;
    }
  }
  return placements;
};

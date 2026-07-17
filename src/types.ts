export type FlowerKind = 'radial' | 'sunflower' | 'hydrangea' | 'wisteria';

export type PetalShape = 'round' | 'pointed' | 'lance' | 'notched' | 'spoon';

export interface FlowerColors {
  base: string;
  tip: string;
  reverse: string;
  center: string;
  pollen: string;
  stem: string;
}

export interface FlowerMorphology {
  petalCount: number;
  layers: number;
  petalLength: number;
  petalWidth: number;
  petalShape: PetalShape;
  taper: number;
  notch: number;
  waviness: number;
  cup: number;
  curl: number;
  /** Inward longitudinal curl retained by petals in the unopened bud. */
  budCurl: number;
  /** Duration bias for the base-to-tip unfurling wave. */
  unfurl: number;
  /** Fraction of inward curl retained by the innermost petal layers. */
  innerCoil: number;
  /** Longitudinal crease strength around the petal midrib at anthesis. */
  fold: number;
  /** Maximum per-petal longitudinal-axis rotation in degrees. */
  twist: number;
  openAngle: number;
  closedAngle: number;
  spiral: number;
  layerScale: number;
  stamens: number;
  stamenLength: number;
  sepalCount: number;
  sepalLength: number;
  stemHeight: number;
  stemRadius: number;
  headRadius: number;
  flowerScale: number;
  bloomDuration: number;
  stagger: number;
  roughness: number;
  sssStrength: number;
  discCount: number;
}

export interface ResearchSource {
  label: string;
  url: string;
}

export interface BloomGrowthProfile {
  /** Whole flower-head scale at the unopened-bud stage, relative to full anthesis. */
  budHeadScale: number;
  /** Petal/tepal axial length at the unopened-bud stage, relative to full anthesis. */
  closedPetalLength: number;
  /** Petal/tepal lateral width at the unopened-bud stage, relative to full anthesis. */
  closedPetalWidth: number;
  /** Timeline point at which pre-anthesis bud swelling is mostly complete. */
  swellingEnd: number;
  /** Timeline point at which visible petal deployment begins. */
  openingStart: number;
  /** Normalized duration of the main petal-deployment phase. */
  openingSpan: number;
  /** Strength of adaxial petal-base expansion/epinasty in the visual model. */
  basalEpinasty: number;
  /** Strength of longitudinal excess growth at the petal margins. */
  marginGrowth: number;
  /** Multiplier for radial petal-base separation during anthesis. */
  radialSpread: number;
  /** Timeline point at which stamens and gynoecium begin to become visible. */
  reproductiveReveal: number;
  arrangement: string;
  observations: string[];
  mappingNote: string;
}

export type HeadFacing = 'upward' | 'outward' | 'drooping';

export type StemHabit = 'shrub' | 'scape' | 'erect-leafy' | 'woody-branch' | 'aquatic-scape' | 'upright' | 'climbing-vine';

export type LeafShape =
  | 'compound-pinnate'
  | 'broad-lanceolate'
  | 'lanceolate'
  | 'elliptic-serrate'
  | 'peltate-orbicular'
  | 'ovate-serrate';

export type LeafArrangement = 'alternate' | 'opposite' | 'basal' | 'whorled' | 'clustered' | 'separate-petiole';

/** Measured plant architecture used by the whole-plant and field renderers. */
export interface BotanicalArchitecture {
  /** Typical whole-plant height interval in centimetres. */
  heightRangeCm: [number, number];
  defaultHeightCm: number;
  /** Fully open flower/head diameter interval in centimetres. */
  flowerDiameterRangeCm: [number, number];
  defaultFlowerDiameterCm: number;
  headFacing: HeadFacing;
  /** Degrees away from straight upward: 0° up, 90° horizontal, >90° nodding. */
  headTiltDeg: number;
  /** Default azimuth in degrees; null means deterministic per-plant variation. */
  headAzimuthDeg: number | null;
  pedicelLengthCm: number;
  stemHabit: StemHabit;
  branchCount: number;
  branchAngleDeg: number;
  leafShape: LeafShape;
  leafArrangement: LeafArrangement;
  leafCount: number;
  leafLengthCm: number;
  leafWidthCm: number;
  notes: string[];
}

export interface FlowerPreset {
  id: string;
  name: string;
  scientificName: string;
  family: string;
  eyebrow: string;
  description: string;
  bloomMechanism: string;
  structure: string[];
  kind: FlowerKind;
  colors: FlowerColors;
  morphology: FlowerMorphology;
  /** Optional for backward compatibility with previously exported custom presets. */
  growth?: BloomGrowthProfile;
  /** Optional for backward compatibility with previously exported custom presets. */
  architecture?: BotanicalArchitecture;
  sources: ResearchSource[];
}

export interface RenderSettings {
  ssgi: boolean;
  ssr: boolean;
  ao: boolean;
  contactShadows: boolean;
  bloom: boolean;
  softShadows: boolean;
  depthOfField: boolean;
  environmentBackground: boolean;
  environment: 'studio' | 'dawn' | 'moon';
  quality: 'balanced' | 'cinematic';
  /** Perspective-camera vertical field of view in degrees. */
  cameraFov: number;
  /** Multiplier applied to image-based lighting. */
  environmentIntensity: number;
  /** Multiplier applied only to the visible panorama. */
  backgroundIntensity: number;
  /** Visible panorama blur in the normalized Three.js scene range. */
  backgroundBlur: number;
  /** Shared environment/background yaw in degrees. */
  environmentRotation: number;
  /** Distance from the camera to the focal plane in world units. */
  focusDistance: number;
  /** Distance away from the focal plane before full defocus. */
  focusRange: number;
  /** Artistic aperture blur radius. */
  bokehScale: number;
  bokehShape: 'circle' | 'polygon' | 'star' | 'heart';
  /** Aperture blades for polygon and star bokeh. */
  bokehBlades: number;
  /** Aperture-mask rotation in degrees. */
  bokehRotation: number;
  /** Gamma applied before aperture convolution to shape bokeh highlights. */
  bokehGamma: number;
  /** Gamma applied to the final out-of-focus region. */
  defocusGamma: number;
}

export type SceneMode = 'specimen' | 'field';

export type FieldLayoutMode =
  | 'scatter'
  | 'species-rows'
  | 'concentric'
  | 'species-sectors'
  | 'radial-composite'
  | 'flower-tunnel'
  | 'flower-road-walls';

/** Seeded colour interval applied independently to plants of one species. */
export interface FieldColorRange {
  from: string;
  to: string;
  /** 0 keeps the preset colour; 1 uses the full interval. */
  strength: number;
}

/** Seeded within-species variation mapped onto the documented botanical ranges. */
export interface FieldSpeciesVariation {
  /** 0 uses the preset default height; 1 samples the full documented height range. */
  height: number;
  /** 0 uses the preset default flower size; 1 samples the full documented size range. */
  flowerSize: number;
}

/** Overrides attached to one deterministic field index. Values use botanical units. */
export interface IndividualFlowerSettings {
  presetId?: string;
  heightCm?: number;
  flowerDiameterCm?: number;
  /** Multiplier applied to the selected species' botanical stem radius. */
  stemScale?: number;
  headTiltDeg?: number;
  headAzimuthDeg?: number;
  pedicelLengthCm?: number;
  leafScale?: number;
  leafCount?: number;
  branchCount?: number;
  branchAngleDeg?: number;
}

export interface FieldSettings {
  /** Number of individual flowering plants in the field. */
  count: number;
  /** Circular planting radius in world-space metres. */
  radius: number;
  /** Minimum centre-to-centre spacing requested by the deterministic layout. */
  spacing: number;
  /** Strength of the left-to-right bloom delay wave. */
  bloomWave: number;
  /** Per-plant deterministic bloom-time variation. */
  bloomVariance: number;
  /** Wind sway strength shared by stems and flower heads. */
  wind: number;
  /** High-frequency wind variation layered over the coherent field direction. */
  windTurbulence: number;
  /** Geometric planting pattern used before mature-crown collision relaxation. */
  layoutMode: FieldLayoutMode;
  /** Probability that an organised species group is replaced by a seeded random species. */
  mixStrength: number;
  /** Number of parallel planting rows allocated to each enabled species. */
  rowsPerSpecies: number;
  /** Number of bands used by concentric and composite layouts. */
  ringCount: number;
  /** Density of grass-like ground cover. */
  groundCover: number;
  /** Density of low broadleaf understory clumps. */
  shrubDensity: number;
  /** Density of small procedural stones. */
  rockDensity: number;
  /** Amplitude of the deterministic soil height field. */
  terrainRelief: number;
  /** Deterministic seed used for placement, species assignment, and motion phases. */
  seed: number;
  /** Presets participating in the field mixture. */
  speciesIds: string[];
  /** Per-species colour intervals; missing entries retain the preset palette. */
  colorRanges: Record<string, FieldColorRange>;
  /** Per-species multipliers applied to the preset stem radius. */
  stemScales: Record<string, number>;
  /** Per-species seeded height and flower-size variation strengths. */
  speciesVariations: Record<string, FieldSpeciesVariation>;
  /** Per-index settings retained across deterministic field rebuilds. */
  individuals: Record<string, IndividualFlowerSettings>;
}

export interface AppState {
  mode: SceneMode;
  presetId: string;
  preset: FlowerPreset;
  bloom: number;
  playing: boolean;
  direction: 1 | -1;
  speed: number;
  render: RenderSettings;
  field: FieldSettings;
}

export interface BloomStage {
  id: string;
  label: string;
  range: [number, number];
  detail: string;
}

export interface Bloomable {
  readonly root: import('three/webgpu').Group;
  readonly petalCount: number;
  update(progress: number, time: number): void;
  dispose(): void;
}

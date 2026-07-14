export type FlowerKind = 'radial' | 'sunflower';

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
  sources: ResearchSource[];
}

export interface RenderSettings {
  ssgi: boolean;
  ssr: boolean;
  ao: boolean;
  contactShadows: boolean;
  bloom: boolean;
  softShadows: boolean;
  environment: 'studio' | 'dawn' | 'moon';
  quality: 'balanced' | 'cinematic';
}

export interface AppState {
  presetId: string;
  preset: FlowerPreset;
  bloom: number;
  playing: boolean;
  direction: 1 | -1;
  speed: number;
  render: RenderSettings;
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

import './style.css';
import { DEFAULT_PRESET, PRESETS } from './data/presets';
import {
  HEAD_FACING_LABEL,
  LEAF_SHAPE_LABEL,
  STEM_HABIT_LABEL,
  resolveBotanicalArchitecture,
  sanitizeIndividualFlowerSettings,
} from './data/botanical-architecture';
import {
  exportIndividualFlower,
  generateFieldLayout,
  parseIndividualFlowerExport,
  type FieldPlant,
} from './flower/flower-field-layout';
import { resolveGrowthProfile } from './growth-model';
import { BloomRenderer } from './render/bloom-renderer';
import type {
  AppState,
  BloomGrowthProfile,
  FieldLayoutMode,
  FieldSettings,
  FlowerPreset,
  IndividualFlowerSettings,
  RenderSettings,
  SceneMode,
} from './types';
import {
  BLOOM_STAGES,
  clamp01,
  deepClonePreset,
  formatPercent,
  getBloomStage,
  sanitizePreset,
  validatePreset,
} from './utils';

const qs = <T extends Element>(selector: string, root: ParentNode = document): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};

const qsa = <T extends Element>(selector: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(selector));

const DEFAULT_RENDER: RenderSettings = {
  ssgi: true,
  ssr: true,
  ao: true,
  contactShadows: true,
  bloom: true,
  softShadows: true,
  depthOfField: false,
  environmentBackground: true,
  environment: 'studio',
  quality: 'balanced',
  cameraFov: 38,
  environmentIntensity: 1,
  backgroundIntensity: 0.76,
  backgroundBlur: 0.16,
  environmentRotation: 0,
  focusDistance: 6.8,
  focusRange: 1.8,
  bokehScale: 2.2,
  bokehShape: 'polygon',
  bokehBlades: 6,
  bokehRotation: 0,
  bokehGamma: 1.08,
  defocusGamma: 1,
};

const DEFAULT_FIELD: FieldSettings = {
  count: 120,
  radius: 6.5,
  spacing: 0.52,
  bloomWave: 0.64,
  bloomVariance: 0.32,
  wind: 0.36,
  windTurbulence: 0.58,
  layoutMode: 'scatter',
  mixStrength: 1,
  rowsPerSpecies: 2,
  ringCount: 6,
  groundCover: 0.88,
  shrubDensity: 0.76,
  rockDensity: 0.42,
  terrainRelief: 0.38,
  seed: 240617,
  speciesIds: PRESETS.map((preset) => preset.id),
  individuals: {},
};

const state: AppState = {
  mode: 'specimen',
  presetId: DEFAULT_PRESET.id,
  preset: deepClonePreset(DEFAULT_PRESET),
  bloom: 0,
  playing: true,
  direction: 1,
  speed: 1,
  render: { ...DEFAULT_RENDER },
  field: { ...DEFAULT_FIELD, speciesIds: [...DEFAULT_FIELD.speciesIds], individuals: {} },
};

const host = qs<HTMLElement>('#render-host');
const presetList = qs<HTMLElement>('#preset-list');
const customCard = qs<HTMLButtonElement>('#custom-card');
const bloomRange = qs<HTMLInputElement>('#bloom-range');
const playButton = qs<HTMLButtonElement>('#play-toggle');
const loopButton = qs<HTMLButtonElement>('#loop-toggle');
const loadingScreen = qs<HTMLElement>('#loading-screen');
const compatibilityCard = qs<HTMLElement>('#compatibility-card');
const backendLabel = qs<HTMLElement>('#backend-label');
const fpsLabel = qs<HTMLElement>('#fps-label');
const researchDialog = qs<HTMLDialogElement>('#research-dialog');
let renderer: BloomRenderer | undefined;
let loopEnabled = true;
let customPreset: FlowerPreset | undefined;
let rebuildTimer = 0;
let fieldRebuildTimer = 0;
let refocusFieldAfterRebuild = false;
let lastStatsUpdate = 0;
let selectedFlowerIndex = 0;
let environmentImageLabel = '내장 절차 파노라마 · 2:1';

type FieldNumericKey =
  | 'count'
  | 'radius'
  | 'spacing'
  | 'bloomWave'
  | 'bloomVariance'
  | 'wind'
  | 'windTurbulence'
  | 'mixStrength'
  | 'rowsPerSpecies'
  | 'ringCount'
  | 'groundCover'
  | 'shrubDensity'
  | 'rockDensity'
  | 'terrainRelief';

type RenderNumericKey =
  | 'cameraFov'
  | 'environmentIntensity'
  | 'backgroundIntensity'
  | 'backgroundBlur'
  | 'environmentRotation'
  | 'focusDistance'
  | 'focusRange'
  | 'bokehScale'
  | 'bokehBlades'
  | 'bokehRotation'
  | 'bokehGamma'
  | 'defocusGamma';

const FIELD_LAYOUT_NOTES: Record<FieldLayoutMode, string> = {
  scatter: '위치는 자연스럽게 흩뿌립니다. 혼합 0%에서는 종별 구역을 유지하고, 100%에서는 종을 완전히 섞습니다.',
  'species-rows': '활성화한 각 종마다 지정한 수의 평행 줄을 만듭니다. 혼합 강도로 줄 사이의 종 교환량을 조절합니다.',
  concentric: '지정한 수의 원형 식재 띠를 만듭니다. 혼합 0%에서는 각 원 안의 종별 구간이 유지됩니다.',
  'species-sectors': '각 종을 하나의 부채꼴 구역에 모아 방사형 군락을 만듭니다.',
  'radial-composite': '중심 원형 군락, 종별 중간 부채꼴, 외곽 동심원 띠를 하나의 꽃밭으로 결합합니다.',
};

try {
  const stored = localStorage.getItem('floraxis:custom-preset');
  if (stored) {
    const parsed = JSON.parse(stored) as unknown;
    if (validatePreset(parsed)) customPreset = sanitizePreset(parsed);
  }
} catch {
  // Storage can be unavailable in strict privacy contexts; the app remains fully usable.
}

const renderPresetCards = (): void => {
  presetList.replaceChildren(...PRESETS.map((preset, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-card';
    button.dataset.preset = preset.id;
    button.innerHTML = `
      <span class="preset-index">${String(index + 1).padStart(2, '0')}</span>
      <span><strong>${preset.name}</strong><small>${preset.scientificName}</small></span>
      <i class="card-dot" aria-hidden="true"></i>`;
    button.addEventListener('click', () => selectPreset(preset));
    return button;
  }));
};

const setFieldSpeciesEnabled = (presetId: string, enabled: boolean): void => {
  const selected = new Set(state.field.speciesIds);
  if (enabled) selected.add(presetId);
  else selected.delete(presetId);
  if (selected.size === 0) {
    showToast('꽃밭에는 한 종 이상이 필요합니다.');
    updateFieldUI();
    return;
  }
  state.field.speciesIds = PRESETS.map((preset) => preset.id).filter((id) => selected.has(id));
  updateFieldUI();
  updatePresetUI();
  scheduleFieldRebuild();
};

const renderFieldSpeciesControls = (): void => {
  const host = qs<HTMLElement>('#field-species');
  host.replaceChildren(...PRESETS.map((preset) => {
    const label = document.createElement('label');
    label.className = 'species-chip';
    label.style.setProperty('--species-color', preset.colors.base);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = preset.id;
    input.checked = state.field.speciesIds.includes(preset.id);
    input.addEventListener('change', () => setFieldSpeciesEnabled(preset.id, input.checked));
    const dot = document.createElement('i');
    dot.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = preset.name;
    label.append(input, dot, text);
    return label;
  }));
};

const renderStageControls = (): void => {
  const stageButtons = qs<HTMLElement>('#stage-buttons');
  stageButtons.replaceChildren(...BLOOM_STAGES.map((stage) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = stage.label;
    button.dataset.stage = stage.id;
    button.addEventListener('click', () => {
      state.playing = false;
      state.bloom = (stage.range[0] + Math.min(1, stage.range[1])) * 0.5;
      state.direction = 1;
      renderer?.setBloom(state.bloom);
      updateTimeline();
    });
    return button;
  }));
  qs<HTMLElement>('#timeline-ticks').replaceChildren(...BLOOM_STAGES.map(() => document.createElement('i')));
};

const setAccent = (hex: string): void => {
  document.documentElement.style.setProperty('--accent', hex);
};

const updateRangeVisual = (input: HTMLInputElement): void => {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value);
  input.style.setProperty('--value', `${(value - min) / (max - min) * 100}%`);
};

const updateFieldUI = (): void => {
  qsa<HTMLInputElement>('[data-field]').forEach((input) => {
    const key = input.dataset.field as FieldNumericKey;
    const value = Number(state.field[key]);
    input.value = String(value);
    updateRangeVisual(input);
    const output = qs<HTMLOutputElement>(`[data-field-output="${key}"]`);
    if (key === 'count') output.value = String(Math.round(value));
    else if (key === 'rowsPerSpecies') output.value = `${Math.round(value)}줄/종`;
    else if (key === 'ringCount') output.value = `${Math.round(value)}겹`;
    else if (key === 'radius' || key === 'spacing') output.value = `${Number(value.toFixed(2))}m`;
    else output.value = `${Math.round(value * 100)}%`;
  });
  qs<HTMLSelectElement>('#field-layout').value = state.field.layoutMode;
  qs<HTMLElement>('#field-layout-note').textContent = FIELD_LAYOUT_NOTES[state.field.layoutMode];
  qs<HTMLInputElement>('[data-field="rowsPerSpecies"]').disabled = state.field.layoutMode !== 'species-rows';
  qs<HTMLInputElement>('[data-field="ringCount"]').disabled = !['concentric', 'radial-composite'].includes(state.field.layoutMode);
  qs<HTMLInputElement>('#field-seed').value = String(state.field.seed);
  qsa<HTMLInputElement>('#field-species input').forEach((input) => {
    input.checked = state.field.speciesIds.includes(input.value);
  });
  qs<HTMLElement>('#field-summary-count').textContent = String(state.field.count);
  qs<HTMLElement>('#field-summary-species').textContent = String(state.field.speciesIds.length);
  selectedFlowerIndex = Math.min(Math.max(0, selectedFlowerIndex), Math.max(0, state.field.count - 1));
  updateIndividualFlowerUI();
};

const getFieldPlants = (): FieldPlant[] => generateFieldLayout(state.field, PRESETS);

const getSelectedFlower = (): FieldPlant => {
  const plants = getFieldPlants();
  selectedFlowerIndex = Math.min(Math.max(0, selectedFlowerIndex), Math.max(0, plants.length - 1));
  return plants[selectedFlowerIndex];
};

const fullIndividualSettings = (plant: FieldPlant): Required<IndividualFlowerSettings> =>
  exportIndividualFlower(plant).settings;

const updateIndividualFlowerUI = (): void => {
  const plant = getSelectedFlower();
  const preset = PRESETS.find((item) => item.id === plant.presetId) ?? PRESETS[0];
  const architecture = resolveBotanicalArchitecture(preset);
  const indexInput = qs<HTMLInputElement>('#individual-index');
  indexInput.max = String(state.field.count);
  indexInput.value = String(plant.index + 1);
  qs<HTMLSelectElement>('#individual-species').value = plant.presetId;
  qs<HTMLElement>('#individual-name').textContent = `${preset.name} #${String(plant.index + 1).padStart(3, '0')}`;
  qs<HTMLElement>('#individual-scientific').textContent = preset.scientificName;
  qs<HTMLElement>('#individual-facing').textContent = `${HEAD_FACING_LABEL[architecture.headFacing]} · ${Math.round(plant.headTiltDeg)}°`;
  qs<HTMLElement>('#individual-habit').textContent = STEM_HABIT_LABEL[architecture.stemHabit];
  qs<HTMLElement>('#individual-leaf-shape').textContent = LEAF_SHAPE_LABEL[architecture.leafShape];
  qs<HTMLElement>('#individual-structure-note').textContent = architecture.notes.join(' · ');

  qsa<HTMLInputElement>('[data-individual]').forEach((input) => {
    const key = input.dataset.individual as keyof IndividualFlowerSettings;
    const value = plant[key as keyof FieldPlant];
    if (typeof value !== 'number') return;
    input.value = String(Number(value.toFixed(3)));
    updateRangeVisual(input);
    const output = qs<HTMLOutputElement>(`[data-individual-output="${key}"]`);
    const unit = input.dataset.unit ?? '';
    output.value = `${Number.isInteger(Number(input.step)) ? Math.round(value) : Number(value.toFixed(2))}${unit}`;
  });
};

const writeClipboardText = async (value: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

const applyIndividualFlowerSettings = (settings: IndividualFlowerSettings): void => {
  const preset = PRESETS.find((item) => item.id === settings.presetId) ?? PRESETS[0];
  state.field.individuals[String(selectedFlowerIndex)] = sanitizeIndividualFlowerSettings(settings, preset);
  updateIndividualFlowerUI();
  scheduleFieldRebuild();
};

const selectIndividualSpecies = (presetId: string): void => {
  const preset = PRESETS.find((item) => item.id === presetId) ?? PRESETS[0];
  const architecture = resolveBotanicalArchitecture(preset);
  applyIndividualFlowerSettings({
    presetId: preset.id,
    heightCm: architecture.defaultHeightCm,
    flowerDiameterCm: architecture.defaultFlowerDiameterCm,
    headTiltDeg: architecture.headTiltDeg,
    headAzimuthDeg: architecture.headAzimuthDeg ?? getSelectedFlower().headAzimuthDeg,
    pedicelLengthCm: architecture.pedicelLengthCm,
    leafScale: 1,
    leafCount: architecture.leafCount,
    branchCount: architecture.branchCount,
    branchAngleDeg: architecture.branchAngleDeg,
  });
};

const copyIndividualFlower = async (): Promise<void> => {
  try {
    await writeClipboardText(JSON.stringify(exportIndividualFlower(getSelectedFlower()), null, 2));
    showToast('선택한 꽃 설정을 클립보드에 복사했습니다.');
  } catch {
    showToast('클립보드 권한을 사용할 수 없습니다. JSON 파일 저장을 이용해 주세요.');
  }
};

const pasteIndividualFlower = async (): Promise<void> => {
  try {
    const parsed = JSON.parse(await navigator.clipboard.readText()) as unknown;
    const settings = parseIndividualFlowerExport(parsed);
    if (!settings) throw new Error('invalid individual flower');
    applyIndividualFlowerSettings(settings);
    showToast(`클립보드 설정을 꽃 #${selectedFlowerIndex + 1}에 적용했습니다.`);
  } catch {
    showToast('Floraxis 개별 꽃 JSON을 클립보드에서 읽지 못했습니다.');
  }
};

const exportIndividualFlowerFile = (): void => {
  const plant = getSelectedFlower();
  const payload = exportIndividualFlower(plant);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `floraxis-flower-${String(plant.index + 1).padStart(3, '0')}-${plant.presetId}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('선택한 꽃을 복제 가능한 JSON 파일로 저장했습니다.');
};

const importIndividualFlowerFile = async (file: File): Promise<void> => {
  try {
    const settings = parseIndividualFlowerExport(JSON.parse(await file.text()) as unknown);
    if (!settings) throw new Error('invalid individual flower');
    applyIndividualFlowerSettings(settings);
    showToast(`파일 설정을 꽃 #${selectedFlowerIndex + 1}에 적용했습니다.`);
  } catch {
    showToast('올바른 Floraxis 개별 꽃 JSON 파일이 아닙니다.');
  }
};

const updateModeUI = (): void => {
  qsa<HTMLButtonElement>('[data-scene-mode]').forEach((button) => {
    const active = button.dataset.sceneMode === state.mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  qsa<HTMLElement>('.specimen-only').forEach((element) => element.classList.toggle('is-hidden', state.mode !== 'specimen'));
  qsa<HTMLElement>('.field-only').forEach((element) => element.classList.toggle('is-hidden', state.mode !== 'field'));
  customCard.disabled = state.mode === 'field';
  customCard.setAttribute('aria-disabled', String(state.mode === 'field'));
};

const updateMorphologyUI = (): void => {
  qsa<HTMLInputElement>('[data-path]').forEach((input) => {
    const key = input.dataset.path as keyof FlowerPreset['morphology'];
    const value = state.preset.morphology[key];
    if (typeof value !== 'number') return;
    input.value = String(value);
    updateRangeVisual(input);
    const output = qs<HTMLOutputElement>(`[data-output="${key}"]`);
    const unit = input.dataset.unit ?? '';
    output.value = `${Number.isInteger(Number(input.step)) ? Math.round(value) : Number(value.toFixed(3))}${unit}`;
  });
  const growth = resolveGrowthProfile(state.preset);
  qsa<HTMLInputElement>('[data-growth]').forEach((input) => {
    const key = input.dataset.growth as keyof BloomGrowthProfile;
    const value = growth[key];
    if (typeof value !== 'number') return;
    input.value = String(value);
    updateRangeVisual(input);
    qs<HTMLOutputElement>(`[data-growth-output="${key}"]`).value = `${Math.round(value * 100)}%`;
  });
  qsa<HTMLInputElement>('[data-color]').forEach((input) => {
    const key = input.dataset.color as 'base' | 'tip' | 'center';
    input.value = state.preset.colors[key];
  });
  const sssPercent = Math.round(state.preset.morphology.sssStrength * 100);
  qs<HTMLOutputElement>('#sss-value').value = `${sssPercent}%`;
  qs<HTMLElement>('#sss-bar').style.width = `${sssPercent}%`;
};

const updateResearchUI = (): void => {
  const growth = resolveGrowthProfile(state.preset);
  const architecture = resolveBotanicalArchitecture(state.preset);
  qs<HTMLElement>('#research-title').textContent = `${state.preset.name} · 개화 연구 노트`;
  qs<HTMLElement>('#research-mechanism').textContent = state.preset.bloomMechanism;
  qs<HTMLElement>('#research-structure').replaceChildren(...state.preset.structure.map((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    return li;
  }));
  const growthMetrics = [
    ['꽃봉오리 머리', `${Math.round(growth.budHeadScale * 100)} → 100%`],
    ['꽃잎 길이', `${Math.round(growth.closedPetalLength * 100)} → 100%`],
    ['꽃잎 너비', `${Math.round(growth.closedPetalWidth * 100)} → 100%`],
    ['기관 배치', growth.arrangement],
    ['실제 높이', `${architecture.heightRangeCm[0]}–${architecture.heightRangeCm[1]} cm`],
    ['꽃 지름', `${architecture.flowerDiameterRangeCm[0]}–${architecture.flowerDiameterRangeCm[1]} cm`],
    ['화두 방향', `${HEAD_FACING_LABEL[architecture.headFacing]} · ${architecture.headTiltDeg}°`],
    ['잎·줄기', `${LEAF_SHAPE_LABEL[architecture.leafShape]} · ${STEM_HABIT_LABEL[architecture.stemHabit]}`],
  ];
  qs<HTMLElement>('#research-growth').replaceChildren(...growthMetrics.map(([label, value]) => {
    const item = document.createElement('div');
    const title = document.createElement('span');
    const output = document.createElement('strong');
    title.textContent = label;
    output.textContent = value;
    item.append(title, output);
    return item;
  }));
  qs<HTMLElement>('#research-evidence').replaceChildren(...[...growth.observations, ...architecture.notes].map((observation) => {
    const li = document.createElement('li');
    li.textContent = observation;
    return li;
  }));
  qs<HTMLElement>('#research-mapping').textContent = growth.mappingNote;
  qs<HTMLElement>('#research-sources').replaceChildren(...state.preset.sources.map((source) => {
    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = source.label;
    return link;
  }));
};

const updatePresetUI = (): void => {
  qs<HTMLElement>('#preset-eyebrow').textContent = state.preset.eyebrow;
  qs<HTMLElement>('#preset-name').textContent = state.preset.name;
  qs<HTMLElement>('#preset-scientific').textContent = state.preset.scientificName;
  qs<HTMLElement>('#preset-description').textContent = state.preset.description;
  qs<HTMLElement>('#structure-tags').replaceChildren(...state.preset.structure.map((item) => {
    const tag = document.createElement('span');
    tag.textContent = item;
    return tag;
  }));
  qsa<HTMLButtonElement>('[data-preset]').forEach((button) => {
    const active = state.mode === 'field'
      ? state.field.speciesIds.includes(button.dataset.preset ?? '')
      : button.dataset.preset === state.presetId;
    button.classList.toggle('is-active', active);
    if (button.dataset.preset !== 'custom') button.setAttribute('aria-pressed', String(active));
  });
  setAccent(state.preset.colors.base);
  updateMorphologyUI();
  updateResearchUI();
};

const updateTimeline = (): void => {
  const progress = clamp01(state.bloom);
  const stage = getBloomStage(progress);
  bloomRange.value = String(Math.round(progress * 1000));
  document.documentElement.style.setProperty('--timeline-progress', `${progress * 100}%`);
  qs<HTMLElement>('#stage-label').textContent = state.mode === 'field' ? `군락 · ${stage.label}` : stage.label;
  qs<HTMLOutputElement>('#progress-label').value = formatPercent(progress);
  playButton.classList.toggle('is-playing', state.playing);
  playButton.setAttribute('aria-label', state.playing ? '개화 일시 정지' : '개화 재생');
  qsa<HTMLButtonElement>('[data-stage]').forEach((button) => button.classList.toggle('is-active', button.dataset.stage === stage.id));
};

const updateRenderUI = (): void => {
  qsa<HTMLInputElement>('[data-render]').forEach((input) => {
    const key = input.dataset.render as keyof RenderSettings;
    input.checked = Boolean(state.render[key]);
  });
  qsa<HTMLInputElement>('[data-render-number]').forEach((input) => {
    const key = input.dataset.renderNumber as RenderNumericKey;
    const value = state.render[key];
    input.value = String(value);
    updateRangeVisual(input);
    const output = qs<HTMLOutputElement>(`[data-render-output="${key}"]`);
    if (key === 'cameraFov' || key === 'environmentRotation' || key === 'bokehRotation') output.value = `${Math.round(value)}°`;
    else if (key === 'environmentIntensity' || key === 'backgroundIntensity' || key === 'backgroundBlur') output.value = `${Math.round(value * 100)}%`;
    else if (key === 'focusDistance' || key === 'focusRange') output.value = `${Number(value.toFixed(1))}m`;
    else if (key === 'bokehBlades') output.value = `${Math.round(value)}매`;
    else output.value = `${Number(value.toFixed(2))}×`;
  });
  qs<HTMLSelectElement>('#environment').value = state.render.environment;
  qs<HTMLSelectElement>('#quality').value = state.render.quality;
  qs<HTMLSelectElement>('#bokeh-shape').value = state.render.bokehShape;
  qs<HTMLInputElement>('#bokeh-blades').disabled = state.render.bokehShape === 'circle' || state.render.bokehShape === 'heart';
  qs<HTMLInputElement>('#bokeh-rotation').disabled = state.render.bokehShape === 'circle';
  qs<HTMLElement>('#environment-file-status').textContent = environmentImageLabel;
  qs<HTMLButtonElement>('#environment-clear').disabled = !renderer?.hasCustomEnvironment();
};

const showToast = (message: string): void => {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  qs<HTMLElement>('#toast-region').appendChild(toast);
  window.setTimeout(() => toast.remove(), 2700);
};

const persistCustom = (): void => {
  if (!customPreset) return;
  try {
    localStorage.setItem('floraxis:custom-preset', JSON.stringify(customPreset));
  } catch {
    showToast('브라우저 저장소를 사용할 수 없습니다. JSON 저장을 이용해 주세요.');
  }
};

const scheduleFlowerRebuild = (): void => {
  if (state.mode !== 'specimen') return;
  window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => renderer?.setFlower(state.preset), 90);
};

const scheduleFieldRebuild = (refocus = false): void => {
  if (state.mode !== 'field') return;
  refocusFieldAfterRebuild ||= refocus;
  window.clearTimeout(fieldRebuildTimer);
  fieldRebuildTimer = window.setTimeout(() => {
    renderer?.setField(state.field, PRESETS);
    renderer?.setBloom(state.bloom);
    if (refocusFieldAfterRebuild) renderer?.focusField(state.field.radius);
    refocusFieldAfterRebuild = false;
  }, 110);
};

const setSceneMode = (mode: SceneMode): void => {
  if (state.mode === mode) return;
  state.mode = mode;
  window.clearTimeout(rebuildTimer);
  window.clearTimeout(fieldRebuildTimer);
  if (mode === 'field') {
    renderer?.setField(state.field, PRESETS);
    renderer?.setBloom(state.bloom);
  } else {
    renderer?.setFlower(state.preset);
    renderer?.setBloom(state.bloom);
    renderer?.focusFlower();
  }
  updateModeUI();
  updatePresetUI();
  updateTimeline();
  closeMobilePanels();
  showToast(mode === 'field' ? '프리셋 꽃밭 모드로 전환했습니다.' : '한 송이 관찰 모드로 전환했습니다.');
};

function selectPreset(preset: FlowerPreset): void {
  if (state.mode === 'field') {
    const enabled = state.field.speciesIds.includes(preset.id);
    setFieldSpeciesEnabled(preset.id, !enabled);
    return;
  }
  state.presetId = preset.id;
  state.preset = deepClonePreset(preset);
  state.bloom = Math.min(state.bloom, 0.82);
  state.direction = 1;
  renderer?.setFlower(state.preset);
  renderer?.setBloom(state.bloom);
  updatePresetUI();
  updateTimeline();
  closeMobilePanels();
}

const activateCustom = (): void => {
  if (state.presetId !== 'custom') {
    const base = deepClonePreset(state.preset);
    base.id = 'custom';
    base.name = '나의 꽃';
    base.scientificName = 'Specimen personalis';
    base.eyebrow = 'CUSTOM MORPHOGENESIS';
    base.description = '선택한 종의 구조를 바탕으로 직접 조정한 개인 개화 프리셋입니다.';
    base.bloomMechanism = '기준 종의 개화 규칙에 사용자가 조정한 꽃잎 수, 층, 곡률, 개방각과 지연값을 적용한 형태 실험입니다.';
    base.sources = state.preset.sources;
    state.preset = base;
    state.presetId = 'custom';
  }
  customPreset = deepClonePreset(state.preset);
};

const applyCustomChange = (mutate: (preset: FlowerPreset) => void): void => {
  activateCustom();
  mutate(state.preset);
  state.preset = sanitizePreset(state.preset);
  customPreset = deepClonePreset(state.preset);
  persistCustom();
  updatePresetUI();
  scheduleFlowerRebuild();
};

const randomHex = (hueBase: number, saturation: number, lightness: number): string => {
  const hue = (hueBase + (Math.random() - 0.5) * 34 + 360) % 360;
  const saturationValue = saturation + (Math.random() - 0.5) * 12;
  const lightnessValue = lightness + (Math.random() - 0.5) * 10;
  const temp = document.createElement('canvas').getContext('2d')!;
  temp.fillStyle = `hsl(${hue} ${saturationValue}% ${lightnessValue}%)`;
  return temp.fillStyle;
};

const randomizeCustom = (): void => {
  applyCustomChange((preset) => {
    const m = preset.morphology;
    m.petalCount = Math.round(Math.max(3, Math.min(72, m.petalCount * (0.72 + Math.random() * 0.65))));
    m.layers = Math.round(Math.max(1, Math.min(5, m.layers + (Math.random() > 0.5 ? 1 : -1))));
    m.petalLength *= 0.82 + Math.random() * 0.35;
    m.petalWidth *= 0.78 + Math.random() * 0.42;
    m.openAngle += (Math.random() - 0.5) * 30;
    m.cup += (Math.random() - 0.5) * 0.28;
    m.curl += (Math.random() - 0.5) * 0.38;
    m.budCurl += (Math.random() - 0.5) * 0.34;
    m.unfurl += (Math.random() - 0.5) * 0.22;
    m.innerCoil += (Math.random() - 0.5) * 0.26;
    m.fold += (Math.random() - 0.5) * 0.34;
    m.twist += (Math.random() - 0.5) * 14;
    m.waviness += Math.random() * 0.065;
    const sourceColor = preset.colors.base.slice(1);
    const rgb = Number.parseInt(sourceColor, 16);
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    let hue = 340;
    if (max !== min) {
      const delta = max - min;
      if (max === r / 255) hue = 60 * (((g - b) / 255 / delta) % 6);
      else if (max === g / 255) hue = 60 * ((b - r) / 255 / delta + 2);
      else hue = 60 * ((r - g) / 255 / delta + 4);
    }
    preset.colors.base = randomHex(hue, 65, 48);
    preset.colors.tip = randomHex(hue + 7, 56, 78);
    preset.colors.reverse = preset.colors.base;
  });
  showToast('새로운 형태 변이를 생성했습니다.');
};

const exportCustom = (): void => {
  const preset = state.presetId === 'custom' ? state.preset : { ...deepClonePreset(state.preset), id: 'custom' };
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `floraxis-${preset.name.replace(/\s+/g, '-').toLowerCase()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('커스텀 프리셋을 JSON으로 저장했습니다.');
};

const importCustom = async (file: File): Promise<void> => {
  try {
    const parsed = JSON.parse(await file.text()) as unknown;
    if (!validatePreset(parsed)) throw new Error('invalid preset');
    customPreset = sanitizePreset(parsed);
    customPreset.id = 'custom';
    customPreset.name ||= '나의 꽃';
    state.presetId = 'custom';
    state.preset = deepClonePreset(customPreset);
    persistCustom();
    renderer?.setFlower(state.preset);
    updatePresetUI();
    showToast('프리셋을 불러왔습니다.');
  } catch {
    showToast('올바른 Floraxis 프리셋 JSON이 아닙니다.');
  }
};

const closeMobilePanels = (): void => {
  qs<HTMLElement>('.preset-rail').classList.remove('is-mobile-open');
  qs<HTMLElement>('.inspector').classList.remove('is-mobile-open');
  qsa<HTMLButtonElement>('[data-mobile-panel]').forEach((button) => button.classList.remove('is-active'));
};

const toggleMobilePanel = (panel: 'presets' | 'inspector', button: HTMLButtonElement): void => {
  const target = panel === 'presets' ? qs<HTMLElement>('.preset-rail') : qs<HTMLElement>('.inspector');
  const shouldOpen = !target.classList.contains('is-mobile-open');
  closeMobilePanels();
  if (shouldOpen) {
    target.classList.add('is-mobile-open');
    button.classList.add('is-active');
  }
};

const openResearch = (): void => {
  updateResearchUI();
  if (!researchDialog.open) researchDialog.showModal();
};

const wireEvents = (): void => {
  qsa<HTMLButtonElement>('[data-scene-mode]').forEach((button) => {
    button.addEventListener('click', () => setSceneMode(button.dataset.sceneMode as SceneMode));
  });

  qsa<HTMLInputElement>('[data-field]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.field as FieldNumericKey;
      const nextValue = ['count', 'rowsPerSpecies', 'ringCount'].includes(key)
        ? Math.round(Number(input.value))
        : Number(input.value);
      (state.field as unknown as Record<string, number>)[key] = nextValue;
      updateFieldUI();
      scheduleFieldRebuild(key === 'radius');
    });
  });
  qs<HTMLSelectElement>('#field-layout').addEventListener('change', (event) => {
    state.field.layoutMode = (event.currentTarget as HTMLSelectElement).value as FieldLayoutMode;
    updateFieldUI();
    scheduleFieldRebuild();
    showToast(`꽃밭 배치를 '${(event.currentTarget as HTMLSelectElement).selectedOptions[0].text}' 방식으로 바꿨습니다.`);
  });
  qs<HTMLInputElement>('#field-seed').addEventListener('change', (event) => {
    const input = event.currentTarget as HTMLInputElement;
    state.field.seed = Math.min(999999, Math.max(1, Math.round(Number(input.value) || DEFAULT_FIELD.seed)));
    updateFieldUI();
    scheduleFieldRebuild();
  });
  qs<HTMLButtonElement>('#field-regenerate').addEventListener('click', () => {
    state.field.seed = Math.floor(1 + Math.random() * 999998);
    updateFieldUI();
    scheduleFieldRebuild();
    showToast(`새 배치 시드 ${state.field.seed}를 적용했습니다.`);
  });

  const selectFlowerIndex = (next: number): void => {
    selectedFlowerIndex = Math.min(state.field.count - 1, Math.max(0, Math.round(next)));
    updateIndividualFlowerUI();
  };
  qs<HTMLInputElement>('#individual-index').addEventListener('change', (event) => {
    selectFlowerIndex(Number((event.currentTarget as HTMLInputElement).value) - 1);
  });
  qs<HTMLButtonElement>('#individual-prev').addEventListener('click', () => selectFlowerIndex(selectedFlowerIndex - 1));
  qs<HTMLButtonElement>('#individual-next').addEventListener('click', () => selectFlowerIndex(selectedFlowerIndex + 1));
  qs<HTMLSelectElement>('#individual-species').addEventListener('change', (event) => {
    selectIndividualSpecies((event.currentTarget as HTMLSelectElement).value);
  });
  qsa<HTMLInputElement>('[data-individual]').forEach((input) => {
    input.addEventListener('input', () => {
      const plant = getSelectedFlower();
      const settings = fullIndividualSettings(plant);
      const key = input.dataset.individual as keyof IndividualFlowerSettings;
      (settings as unknown as Record<string, number>)[key] = Number(input.value);
      applyIndividualFlowerSettings(settings);
    });
  });
  qs<HTMLButtonElement>('#individual-copy').addEventListener('click', () => void copyIndividualFlower());
  qs<HTMLButtonElement>('#individual-paste').addEventListener('click', () => void pasteIndividualFlower());
  qs<HTMLButtonElement>('#individual-export').addEventListener('click', exportIndividualFlowerFile);
  qs<HTMLButtonElement>('#individual-import').addEventListener('click', () => qs<HTMLInputElement>('#individual-import-file').click());
  qs<HTMLInputElement>('#individual-import-file').addEventListener('change', (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void importIndividualFlowerFile(file);
    input.value = '';
  });
  qs<HTMLButtonElement>('#individual-reset').addEventListener('click', () => {
    delete state.field.individuals[String(selectedFlowerIndex)];
    updateIndividualFlowerUI();
    scheduleFieldRebuild();
    showToast(`꽃 #${selectedFlowerIndex + 1}을 종 기본값으로 되돌렸습니다.`);
  });

  customCard.addEventListener('click', () => {
    if (customPreset) {
      state.presetId = 'custom';
      state.preset = deepClonePreset(customPreset);
      renderer?.setFlower(state.preset);
      updatePresetUI();
    } else {
      activateCustom();
      persistCustom();
      renderer?.setFlower(state.preset);
      updatePresetUI();
    }
    closeMobilePanels();
  });

  qsa<HTMLInputElement>('[data-path]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.path as keyof FlowerPreset['morphology'];
      applyCustomChange((preset) => {
        (preset.morphology as unknown as Record<string, number>)[key] = Number(input.value);
      });
    });
  });

  qsa<HTMLInputElement>('[data-growth]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.growth as keyof BloomGrowthProfile;
      applyCustomChange((preset) => {
        const inherited = resolveGrowthProfile(preset);
        preset.growth ??= { ...inherited, observations: [...inherited.observations] };
        (preset.growth as unknown as Record<string, number>)[key] = Number(input.value);
        preset.growth.mappingNote = '기준 종의 연구 프로파일을 사용자가 조정한 정규화 계수입니다.';
      });
    });
  });

  qsa<HTMLInputElement>('[data-color]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.color as 'base' | 'tip' | 'center';
      applyCustomChange((preset) => { preset.colors[key] = input.value; });
    });
  });

  qsa<HTMLInputElement>('[data-render]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.render as keyof RenderSettings;
      (state.render as unknown as Record<string, boolean>)[key] = input.checked;
      renderer?.setRenderSettings(state.render);
      updateRenderUI();
    });
  });

  qsa<HTMLInputElement>('[data-render-number]').forEach((input) => {
    const applyValue = (commitStructural: boolean): void => {
      const key = input.dataset.renderNumber as RenderNumericKey;
      const value = key === 'bokehBlades' ? Math.round(Number(input.value)) : Number(input.value);
      (state.render as unknown as Record<string, number>)[key] = value;
      updateRenderUI();
      const structural = key === 'bokehBlades' || key === 'bokehRotation';
      if (!structural || commitStructural) renderer?.setRenderSettings(state.render);
    };
    input.addEventListener('input', () => applyValue(false));
    input.addEventListener('change', () => applyValue(true));
  });

  qs<HTMLSelectElement>('#environment').addEventListener('change', (event) => {
    state.render.environment = (event.currentTarget as HTMLSelectElement).value as RenderSettings['environment'];
    renderer?.clearCustomEnvironment();
    environmentImageLabel = '내장 절차 파노라마 · 2:1';
    renderer?.usePresetEnvironment(state.render.environment);
    renderer?.setRenderSettings(state.render);
    updateRenderUI();
  });
  qs<HTMLSelectElement>('#quality').addEventListener('change', (event) => {
    state.render.quality = (event.currentTarget as HTMLSelectElement).value as RenderSettings['quality'];
    renderer?.setRenderSettings(state.render);
    showToast(state.render.quality === 'cinematic' ? '시네마틱 샘플링을 적용했습니다.' : '균형 품질로 전환했습니다.');
  });
  qs<HTMLSelectElement>('#bokeh-shape').addEventListener('change', (event) => {
    state.render.bokehShape = (event.currentTarget as HTMLSelectElement).value as RenderSettings['bokehShape'];
    renderer?.setRenderSettings(state.render);
    updateRenderUI();
  });
  qs<HTMLButtonElement>('#focus-target').addEventListener('click', () => {
    if (!renderer) return;
    state.render.focusDistance = Math.min(50, Math.max(0.5, renderer.getTargetFocusDistance()));
    renderer.setRenderSettings(state.render);
    updateRenderUI();
    showToast(`현재 피사체에 ${state.render.focusDistance.toFixed(1)}m 초점을 맞췄습니다.`);
  });
  qs<HTMLButtonElement>('#environment-upload').addEventListener('click', () => qs<HTMLInputElement>('#environment-file').click());
  qs<HTMLInputElement>('#environment-file').addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !renderer) return;
    try {
      environmentImageLabel = '파노라마 분석 중…';
      updateRenderUI();
      const info = await renderer.loadEnvironmentImage(file);
      state.render.environmentBackground = true;
      renderer.setRenderSettings(state.render);
      const ratio = info.width / info.height;
      environmentImageLabel = `${info.name} · ${info.width}×${info.height}${info.hdr ? ' HDR' : ''}`;
      updateRenderUI();
      showToast(Math.abs(ratio - 2) < 0.18
        ? '사용자 파노라마를 환경조명과 배경에 적용했습니다.'
        : '이미지를 적용했습니다. 자연스러운 환경맵은 2:1 파노라마를 권장합니다.');
    } catch (error) {
      console.error(error);
      environmentImageLabel = '불러오기 실패 · 64×32 이상의 JPG·PNG·WebP·HDR 필요';
      updateRenderUI();
      showToast('환경 이미지를 불러오지 못했습니다.');
    }
  });
  qs<HTMLButtonElement>('#environment-clear').addEventListener('click', () => {
    renderer?.clearCustomEnvironment();
    environmentImageLabel = '내장 절차 파노라마 · 2:1';
    updateRenderUI();
    showToast('내장 환경 파노라마로 복원했습니다.');
  });

  playButton.addEventListener('click', () => {
    if (!state.playing && !loopEnabled && state.bloom >= 0.999) {
      state.bloom = 0;
      state.direction = 1;
    }
    state.playing = !state.playing;
    updateTimeline();
  });
  bloomRange.addEventListener('pointerdown', () => { state.playing = false; updateTimeline(); });
  bloomRange.addEventListener('input', () => {
    state.bloom = Number(bloomRange.value) / 1000;
    renderer?.setBloom(state.bloom);
    updateTimeline();
  });
  loopButton.addEventListener('click', () => {
    loopEnabled = !loopEnabled;
    loopButton.classList.toggle('is-active', loopEnabled);
    loopButton.setAttribute('aria-label', `왕복 반복 ${loopEnabled ? '켜짐' : '꺼짐'}`);
  });
  qsa<HTMLButtonElement>('[data-speed]').forEach((button) => {
    button.addEventListener('click', () => {
      state.speed = Number(button.dataset.speed);
      qsa<HTMLButtonElement>('[data-speed]').forEach((item) => item.classList.toggle('is-active', item === button));
    });
  });

  qsa<HTMLButtonElement>('.section-heading').forEach((button) => {
    button.addEventListener('click', () => button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') !== 'true')));
  });
  qs<HTMLButtonElement>('#research-open').addEventListener('click', openResearch);
  qs<HTMLButtonElement>('#mobile-research').addEventListener('click', openResearch);
  qs<HTMLButtonElement>('#research-close').addEventListener('click', () => researchDialog.close());
  researchDialog.addEventListener('click', (event) => { if (event.target === researchDialog) researchDialog.close(); });
  qs<HTMLButtonElement>('#camera-reset').addEventListener('click', () => renderer?.focusScene());
  qs<HTMLButtonElement>('#capture').addEventListener('click', () => { renderer?.capture(); showToast('고해상도 프레임을 캡처했습니다.'); });
  qs<HTMLButtonElement>('#randomize').addEventListener('click', randomizeCustom);
  qs<HTMLButtonElement>('#export-preset').addEventListener('click', exportCustom);
  qs<HTMLButtonElement>('#import-preset').addEventListener('click', () => qs<HTMLInputElement>('#import-file').click());
  qs<HTMLInputElement>('#import-file').addEventListener('change', (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void importCustom(file);
    (event.currentTarget as HTMLInputElement).value = '';
  });
  qsa<HTMLButtonElement>('[data-mobile-panel]').forEach((button) => {
    button.addEventListener('click', () => toggleMobilePanel(button.dataset.mobilePanel as 'presets' | 'inspector', button));
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (target.matches('input, select, textarea')) return;
    if (event.code === 'Space') {
      event.preventDefault();
      playButton.click();
    } else if (event.key.toLowerCase() === 'r') {
      renderer?.focusScene();
    } else if (/^[1-6]$/.test(event.key)) {
      selectPreset(PRESETS[Number(event.key) - 1]);
    } else if (event.key === 'Escape') {
      closeMobilePanels();
    }
  });
  new ResizeObserver(() => renderer?.resize()).observe(host);
};

const onFrame = (delta: number, elapsedMs: number, info: { fps: number; drawCalls: number; triangles: number }): void => {
  if (state.playing) {
    const bloomDuration = state.mode === 'field' ? 18 : state.preset.morphology.bloomDuration;
    const deltaBloom = delta * state.speed / Math.max(2, bloomDuration);
    state.bloom += deltaBloom * state.direction;
    if (state.bloom >= 1) {
      state.bloom = 1;
      if (loopEnabled) state.direction = -1;
      else state.playing = false;
    } else if (state.bloom <= 0) {
      state.bloom = 0;
      state.direction = 1;
      if (!loopEnabled) state.playing = false;
    }
    renderer?.setBloom(state.bloom);
    updateTimeline();
  }
  if (elapsedMs - lastStatsUpdate > 500) {
    fpsLabel.textContent = `${info.fps || '—'} FPS · ${info.drawCalls} DRAWS`;
    lastStatsUpdate = elapsedMs;
  }
};

const init = async (): Promise<void> => {
  renderPresetCards();
  renderFieldSpeciesControls();
  renderStageControls();
  wireEvents();
  updateModeUI();
  updatePresetUI();
  updateFieldUI();
  updateTimeline();
  updateRenderUI();

  try {
    renderer = new BloomRenderer(host, onFrame);
    await renderer.init(state.render);
    if (!renderer.capabilities.ssgi) {
      state.render.ssgi = false;
      const input = qs<HTMLInputElement>('[data-render="ssgi"]');
      input.disabled = true;
      input.closest('label')?.setAttribute('title', '이 GPU는 SSGI에 필요한 rg11b10ufloat-renderable 기능을 지원하지 않습니다.');
      showToast('이 GPU에서는 SSGI를 자동으로 비활성화했습니다.');
    }
    renderer.setFlower(state.preset);
    renderer.setBloom(state.bloom);
    renderer.setRenderSettings(state.render);
    backendLabel.textContent = `${renderer.capabilities.backend.toUpperCase()} · LIVE`;
    updateRenderUI();
    window.setTimeout(() => loadingScreen.classList.add('is-hidden'), 420);
  } catch (error) {
    console.error(error);
    loadingScreen.classList.add('is-hidden');
    compatibilityCard.hidden = false;
    backendLabel.textContent = 'WEBGPU 지원 필요';
  }
};

void init();

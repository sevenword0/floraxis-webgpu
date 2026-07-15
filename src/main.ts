import './style.css';
import { DEFAULT_PRESET, PRESETS } from './data/presets';
import { resolveGrowthProfile } from './growth-model';
import { BloomRenderer } from './render/bloom-renderer';
import type { AppState, BloomGrowthProfile, FlowerPreset, RenderSettings } from './types';
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
  environment: 'studio',
  quality: 'balanced',
};

const state: AppState = {
  presetId: DEFAULT_PRESET.id,
  preset: deepClonePreset(DEFAULT_PRESET),
  bloom: 0,
  playing: true,
  direction: 1,
  speed: 1,
  render: { ...DEFAULT_RENDER },
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
let lastStatsUpdate = 0;

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
  qs<HTMLElement>('#research-evidence').replaceChildren(...growth.observations.map((observation) => {
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
    button.classList.toggle('is-active', button.dataset.preset === state.presetId);
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
  qs<HTMLElement>('#stage-label').textContent = stage.label;
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
  qs<HTMLSelectElement>('#environment').value = state.render.environment;
  qs<HTMLSelectElement>('#quality').value = state.render.quality;
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
  window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => renderer?.setFlower(state.preset), 90);
};

function selectPreset(preset: FlowerPreset): void {
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

  qs<HTMLSelectElement>('#environment').addEventListener('change', (event) => {
    state.render.environment = (event.currentTarget as HTMLSelectElement).value as RenderSettings['environment'];
    renderer?.setRenderSettings(state.render);
  });
  qs<HTMLSelectElement>('#quality').addEventListener('change', (event) => {
    state.render.quality = (event.currentTarget as HTMLSelectElement).value as RenderSettings['quality'];
    renderer?.setRenderSettings(state.render);
    showToast(state.render.quality === 'cinematic' ? '시네마틱 샘플링을 적용했습니다.' : '균형 품질로 전환했습니다.');
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
  qs<HTMLButtonElement>('#camera-reset').addEventListener('click', () => renderer?.focusFlower());
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
      renderer?.focusFlower();
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
    const deltaBloom = delta * state.speed / Math.max(2, state.preset.morphology.bloomDuration);
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
  renderStageControls();
  wireEvents();
  updatePresetUI();
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

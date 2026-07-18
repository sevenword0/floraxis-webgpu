import './style.css';
import type { RenderSettings } from '../types';
import {
  BloomRenderer,
  type RendererFrameInfo,
} from '../render/bloom-renderer';
import {
  getLightingTestView,
  LIGHTING_TEST_DESCRIPTIONS,
  LightingReferenceScene,
  type LightingTestMode,
} from './lighting-reference-scene';
import { summarizeLightingBenchmark } from './benchmark';

type EffectKey = 'ssgi' | 'ssr' | 'ao' | 'contactShadows' | 'bloom' | 'softShadows' | 'environmentBackground';
type ProfileName = 'production' | 'baseline' | 'gi' | 'reflection';

interface BenchmarkRun {
  startedAt: number;
  warmupUntil: number;
  endsAt: number;
  frameSamples: number[];
  gpuSamples: number[];
}

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
};

const $$ = <T extends Element>(selector: string): T[] => Array.from(document.querySelectorAll<T>(selector));

const settings: RenderSettings = {
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
  focusDistance: 7,
  focusRange: 2,
  bokehScale: 2.2,
  bokehShape: 'polygon',
  bokehBlades: 6,
  bokehRotation: 0,
  bokehGamma: 1.08,
  defocusGamma: 1,
};

const PROFILES: Record<ProfileName, Pick<RenderSettings, EffectKey>> = {
  production: {
    ssgi: true,
    ssr: true,
    ao: true,
    contactShadows: true,
    bloom: true,
    softShadows: true,
    environmentBackground: true,
  },
  baseline: {
    ssgi: false,
    ssr: false,
    ao: false,
    contactShadows: false,
    bloom: false,
    softShadows: true,
    environmentBackground: true,
  },
  gi: {
    ssgi: true,
    ssr: false,
    ao: true,
    contactShadows: true,
    bloom: false,
    softShadows: true,
    environmentBackground: true,
  },
  reflection: {
    ssgi: false,
    ssr: true,
    ao: true,
    contactShadows: false,
    bloom: true,
    softShadows: true,
    environmentBackground: true,
  },
};

const host = $<HTMLElement>('#lighting-render-host');
const loadingScreen = $<HTMLElement>('#loading-screen');
const fatalCard = $<HTMLElement>('#fatal-card');
const fatalMessage = $<HTMLElement>('#fatal-message');
const backendChip = $<HTMLElement>('#backend-chip');
const featureChip = $<HTMLElement>('#feature-chip');
const errorChip = $<HTMLElement>('#error-chip');
const sceneKicker = $<HTMLElement>('#scene-kicker');
const sceneTitle = $<HTMLElement>('#scene-title');
const sceneDescription = $<HTMLElement>('#scene-description');
const visualChecks = $<HTMLUListElement>('#visual-checks');
const axisHint = $<HTMLElement>('.axis-hint');
const qualityBadge = $<HTMLElement>('#quality-badge');
const metricFps = $<HTMLElement>('#metric-fps');
const metricGpu = $<HTMLElement>('#metric-gpu');
const metricDraws = $<HTMLElement>('#metric-draws');
const metricTriangles = $<HTMLElement>('#metric-triangles');
const metricResolution = $<HTMLElement>('#metric-resolution');
const metricTier = $<HTMLElement>('#metric-tier');
const benchmarkSection = $<HTMLElement>('.benchmark-section');
const benchmarkButton = $<HTMLButtonElement>('#benchmark-run');
const benchmarkVerdict = $<HTMLElement>('#benchmark-verdict');
const benchmarkStatus = $<HTMLElement>('#benchmark-status');
const benchmarkProgress = $<HTMLElement>('#benchmark-progress');
const resultMedian = $<HTMLElement>('#result-median');
const resultP95 = $<HTMLElement>('#result-p95');
const resultLow = $<HTMLElement>('#result-low');
const resultGpu = $<HTMLElement>('#result-gpu');
const toast = $<HTMLElement>('#toast');

let renderer: BloomRenderer | undefined;
let referenceScene: LightingReferenceScene | undefined;
let resizeObserver: ResizeObserver | undefined;
let currentMode: LightingTestMode = 'materials';
let benchmark: BenchmarkRun | undefined;
let runtimeErrorCount = 0;
let lastMetricUpdate = 0;
let toastTimer = 0;

const formatCount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const setChip = (chip: HTMLElement, label: string, state?: 'loading' | 'pass' | 'warn' | 'fail', dot = false): void => {
  chip.className = 'health-chip';
  if (state) chip.classList.add(`is-${state}`);
  chip.replaceChildren();
  if (dot) chip.append(document.createElement('i'));
  chip.append(label);
};

const showToast = (message: string): void => {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
};

const recordRuntimeError = (): void => {
  runtimeErrorCount += 1;
  setChip(errorChip, `오류 ${runtimeErrorCount}`, 'fail');
};

window.addEventListener('error', recordRuntimeError);
window.addEventListener('unhandledrejection', recordRuntimeError);

const markBenchmarkStale = (message = '설정 변경됨 · 다시 측정'): void => {
  if (benchmark) return;
  if (benchmarkVerdict.textContent === 'READY') return;
  benchmarkVerdict.textContent = 'STALE';
  benchmarkStatus.textContent = message;
  benchmarkSection.classList.remove('is-pass', 'is-warn', 'is-fail');
};

const syncEffectInputs = (): void => {
  $$<HTMLInputElement>('[data-effect]').forEach((input) => {
    const key = input.dataset.effect as EffectKey;
    input.checked = settings[key];
  });
};

const syncActiveProfile = (): void => {
  $$<HTMLButtonElement>('[data-profile]').forEach((button) => {
    const profile = PROFILES[button.dataset.profile as ProfileName];
    const active = (Object.keys(profile) as EffectKey[]).every((key) => settings[key] === profile[key]);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
};

const applySettings = (staleReason?: string): void => {
  renderer?.setRenderSettings(settings);
  syncEffectInputs();
  syncActiveProfile();
  qualityBadge.textContent = settings.quality.toUpperCase();
  if (staleReason) markBenchmarkStale(staleReason);
};

const updateSceneCopy = (): void => {
  const description = LIGHTING_TEST_DESCRIPTIONS[currentMode];
  sceneKicker.textContent = description.kicker;
  sceneTitle.textContent = description.title;
  sceneDescription.textContent = description.description;
  visualChecks.replaceChildren(...description.checks.map((check) => {
    const item = document.createElement('li');
    item.textContent = check;
    return item;
  }));
  axisHint.hidden = currentMode !== 'materials';
};

const setSceneMode = (mode: LightingTestMode): void => {
  currentMode = mode;
  referenceScene?.setMode(mode);
  renderer?.setDiagnosticView(getLightingTestView(mode));
  $$<HTMLButtonElement>('[data-scene]').forEach((button) => {
    const active = button.dataset.scene === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  updateSceneCopy();
  markBenchmarkStale('장면 변경됨 · 다시 측정');
};

const updateMetrics = (info: RendererFrameInfo, now: number): void => {
  if (now - lastMetricUpdate < 180) return;
  lastMetricUpdate = now;
  metricFps.textContent = info.fps > 0 ? String(info.fps) : '—';
  metricGpu.textContent = info.gpuMs === null ? 'N/A' : info.gpuMs.toFixed(1);
  metricDraws.textContent = formatCount.format(info.drawCalls);
  metricTriangles.textContent = formatCount.format(info.triangles);
  metricResolution.textContent = `${Math.round(info.resolutionScale * 100)}%`;
  metricTier.textContent = info.qualityTier.toUpperCase();
  qualityBadge.textContent = info.qualityTier.toUpperCase();
};

const finishBenchmark = (): void => {
  if (!benchmark) return;
  const summary = summarizeLightingBenchmark(benchmark.frameSamples, benchmark.gpuSamples);
  benchmark = undefined;
  benchmarkButton.disabled = false;
  benchmarkButton.textContent = 'RUN AGAIN';
  benchmarkProgress.style.width = '100%';
  benchmarkVerdict.textContent = summary.verdict.toUpperCase();
  benchmarkStatus.textContent = `${summary.sampleCount} 프레임 · 평균 ${summary.averageFps.toFixed(1)} FPS`;
  resultMedian.textContent = `${summary.medianFrameMs.toFixed(1)}ms`;
  resultP95.textContent = `${summary.p95FrameMs.toFixed(1)}ms`;
  resultLow.textContent = `${summary.onePercentLowFps.toFixed(1)}fps`;
  resultGpu.textContent = summary.averageGpuMs === null ? 'N/A' : `${summary.averageGpuMs.toFixed(1)}ms`;
  benchmarkSection.classList.remove('is-pass', 'is-warn', 'is-fail');
  benchmarkSection.classList.add(`is-${summary.verdict}`);
  showToast(`성능 검증 완료: ${summary.verdict.toUpperCase()} · p95 ${summary.p95FrameMs.toFixed(1)}ms`);
};

const sampleBenchmark = (deltaSeconds: number, info: RendererFrameInfo, now: number): void => {
  if (!benchmark) return;
  const duration = benchmark.endsAt - benchmark.startedAt;
  benchmarkProgress.style.width = `${Math.min(100, (now - benchmark.startedAt) / duration * 100)}%`;
  if (now < benchmark.warmupUntil) {
    benchmarkStatus.textContent = `워밍업 ${Math.max(0, (benchmark.warmupUntil - now) / 1000).toFixed(1)}초`;
    return;
  }
  benchmarkStatus.textContent = `측정 중 ${Math.max(0, (benchmark.endsAt - now) / 1000).toFixed(1)}초`;
  benchmark.frameSamples.push(deltaSeconds * 1000);
  if (info.gpuMs !== null) benchmark.gpuSamples.push(info.gpuMs);
  if (now >= benchmark.endsAt) finishBenchmark();
};

const onFrame = (deltaSeconds: number, _elapsedMs: number, info: RendererFrameInfo): void => {
  const now = performance.now();
  updateMetrics(info, now);
  sampleBenchmark(deltaSeconds, info, now);
};

const startBenchmark = (): void => {
  if (benchmark) return;
  const now = performance.now();
  benchmark = {
    startedAt: now,
    warmupUntil: now + 1000,
    endsAt: now + 6000,
    frameSamples: [],
    gpuSamples: [],
  };
  benchmarkButton.disabled = true;
  benchmarkButton.textContent = 'RUNNING';
  benchmarkVerdict.textContent = 'WARMUP';
  benchmarkStatus.textContent = '파이프라인 안정화 중';
  benchmarkProgress.style.width = '0%';
  benchmarkSection.classList.remove('is-pass', 'is-warn', 'is-fail');
  resultMedian.textContent = '—';
  resultP95.textContent = '—';
  resultLow.textContent = '—';
  resultGpu.textContent = '—';
};

const configureControls = (): void => {
  $$<HTMLButtonElement>('[data-scene]').forEach((button) => {
    button.addEventListener('click', () => setSceneMode(button.dataset.scene as LightingTestMode));
  });

  $$<HTMLButtonElement>('[data-profile]').forEach((button) => {
    button.addEventListener('click', () => {
      const profile = PROFILES[button.dataset.profile as ProfileName];
      (Object.keys(profile) as EffectKey[]).forEach((key) => {
        settings[key] = profile[key];
      });
      if (!renderer?.capabilities.ssgi) settings.ssgi = false;
      if (!renderer?.capabilities.ssr) settings.ssr = false;
      applySettings('A/B 프로필 변경됨 · 다시 측정');
    });
  });

  $$<HTMLInputElement>('[data-effect]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.effect as EffectKey;
      settings[key] = input.checked;
      applySettings('효과 설정 변경됨 · 다시 측정');
    });
  });

  $<HTMLSelectElement>('#environment').addEventListener('change', (event) => {
    settings.environment = (event.currentTarget as HTMLSelectElement).value as RenderSettings['environment'];
    applySettings('환경 변경됨 · 다시 측정');
  });
  $<HTMLSelectElement>('#quality').addEventListener('change', (event) => {
    settings.quality = (event.currentTarget as HTMLSelectElement).value as RenderSettings['quality'];
    applySettings('품질 단계 변경됨 · 다시 측정');
  });

  const environmentIntensity = $<HTMLInputElement>('#environment-intensity');
  const environmentIntensityOutput = $<HTMLOutputElement>('#environment-intensity-output');
  environmentIntensity.addEventListener('input', () => {
    settings.environmentIntensity = Number(environmentIntensity.value);
    environmentIntensityOutput.value = `${Math.round(settings.environmentIntensity * 100)}%`;
    applySettings('환경광 강도 변경됨 · 다시 측정');
  });

  $<HTMLInputElement>('#motion-toggle').addEventListener('change', (event) => {
    referenceScene?.setMotionEnabled((event.currentTarget as HTMLInputElement).checked);
    markBenchmarkStale('움직임 설정 변경됨 · 다시 측정');
  });
  $<HTMLInputElement>('#orbit-toggle').addEventListener('change', (event) => {
    renderer?.setAutoRotate((event.currentTarget as HTMLInputElement).checked);
    markBenchmarkStale('카메라 움직임 변경됨 · 다시 측정');
  });
  $<HTMLButtonElement>('#view-reset').addEventListener('click', () => renderer?.focusScene());
  $<HTMLButtonElement>('#capture').addEventListener('click', () => {
    renderer?.capture();
    showToast('현재 조명 프레임을 PNG로 저장했습니다.');
  });
  benchmarkButton.addEventListener('click', startBenchmark);

  $<HTMLButtonElement>('#backend-auto').addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('backend');
    window.location.assign(url);
  });
  $<HTMLButtonElement>('#backend-webgl').addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('backend', 'webgl');
    window.location.assign(url);
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, select, textarea')) return;
    if (event.key.toLowerCase() === 'r') renderer?.focusScene();
  });
};

const initialize = async (): Promise<void> => {
  configureControls();
  updateSceneCopy();
  setChip(backendChip, 'GPU 초기화', 'loading', true);

  try {
    renderer = new BloomRenderer(host, onFrame);
    await renderer.init(settings);

    if (!renderer.capabilities.ssgi) settings.ssgi = false;
    if (!renderer.capabilities.ssr) settings.ssr = false;
    const ssgiInput = $<HTMLInputElement>('[data-effect="ssgi"]');
    const ssrInput = $<HTMLInputElement>('[data-effect="ssr"]');
    ssgiInput.disabled = !renderer.capabilities.ssgi;
    ssrInput.disabled = !renderer.capabilities.ssr;
    if (ssgiInput.disabled) ssgiInput.closest('label')?.setAttribute('title', '현재 백엔드에서 SSGI를 사용할 수 없습니다.');
    if (ssrInput.disabled) ssrInput.closest('label')?.setAttribute('title', 'Three.js r185 WebGL 폴백에서는 SSR을 비활성화합니다.');

    referenceScene = new LightingReferenceScene();
    renderer.setDiagnosticScene(referenceScene, getLightingTestView(currentMode));
    renderer.setBloom(1);
    renderer.setRenderSettings(settings);
    syncEffectInputs();
    syncActiveProfile();

    setChip(backendChip, renderer.capabilities.backend.toUpperCase(), 'pass', true);
    const enabledFeatures = [
      renderer.capabilities.ssgi ? 'SSGI' : null,
      renderer.capabilities.ssr ? 'SSR' : null,
      renderer.capabilities.gpuTiming ? 'GPU TIMING' : null,
    ].filter(Boolean);
    setChip(featureChip, enabledFeatures.length > 0 ? enabledFeatures.join(' · ') : 'FALLBACK PATH', enabledFeatures.length > 0 ? 'pass' : 'warn');
    document.title = `Floraxis Lighting QA · ${renderer.capabilities.backend}`;

    resizeObserver = new ResizeObserver(() => renderer?.resize());
    resizeObserver.observe(host);
    window.requestAnimationFrame(() => loadingScreen.classList.add('is-hidden'));
  } catch (error) {
    recordRuntimeError();
    loadingScreen.classList.add('is-hidden');
    fatalCard.hidden = false;
    fatalMessage.textContent = error instanceof Error ? error.message : String(error);
    setChip(backendChip, 'RENDERER FAILED', 'fail', true);
  }
};

const dispose = (): void => {
  resizeObserver?.disconnect();
  renderer?.dispose();
  renderer = undefined;
};

window.addEventListener('beforeunload', dispose, { once: true });
if (import.meta.hot) import.meta.hot.dispose(dispose);

void initialize();

import * as THREE from 'three/webgpu';
import {
  add,
  diffuseColor,
  float,
  int,
  luminance,
  max,
  metalness,
  min,
  mix,
  mrt,
  nodeObject,
  normalView,
  output,
  packNormalToRGB,
  pass,
  pow,
  roughness,
  sample,
  smoothstep,
  unpackRGBToNormal,
  uniform,
  uv,
  velocity,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { sss } from 'three/addons/tsl/display/SSSNode.js';
import { traa, type default as TRAANode } from 'three/addons/tsl/display/TRAANode.js';
import { boxBlur } from 'three/addons/tsl/display/boxBlur.js';
import type { Bloomable, FieldSettings, FlowerPreset, RenderSettings, SceneMode } from '../types';
import { FloweringPlantModel } from '../flower/flowering-plant-model';
import { FlowerField } from '../flower/flower-field';
import {
  AdaptiveQualityController,
  getAdaptiveQualityTuning,
  type AdaptiveQualityTier,
} from './adaptive-quality';
import { shapedDepthOfField, type ShapedDepthOfFieldNode } from './shaped-depth-of-field-node';
import { clampGroundSafePolarAngle, getStableShadowCoverage } from './shadow-stability';
import { configurePhysicalColorPipeline, resolveEnvironmentLightRig } from './physical-lighting';

export interface RendererFrameInfo {
  fps: number;
  drawCalls: number;
  triangles: number;
  gpuMs: number | null;
  resolutionScale: number;
  qualityTier: AdaptiveQualityTier;
}

export interface RendererCapabilities {
  webgpu: boolean;
  ssgi: boolean;
  ssr: boolean;
  gpuTiming: boolean;
  backend: string;
}

export interface RendererDiagnosticView {
  cameraPosition: readonly [number, number, number];
  target: readonly [number, number, number];
  minDistance?: number;
  maxDistance?: number;
  maxPolarAngle?: number;
  shadowHorizontal?: number;
  shadowVertical?: number;
}

type FrameCallback = (deltaSeconds: number, elapsedMs: number, info: RendererFrameInfo) => void;

interface EnvironmentTarget {
  texture: THREE.Texture;
  dispose(): void;
}

interface EnvironmentImageInfo {
  name: string;
  width: number;
  height: number;
  hdr: boolean;
}

const ENVIRONMENTS = {
  studio: {
    background: 0x101816,
    fog: 0x101816,
    key: 0xfff0d4,
    fill: 0x84b8ff,
    rim: 0xff8fbd,
    exposure: 0.94,
    intensity: 0.76,
    skyTop: '#132621',
    skyHorizon: '#879f8f',
    ground: '#17201c',
    glow: '#f7e8ca',
    glowX: 0.7,
    keyElevation: 44,
    keyIntensity: 3.3,
    fillPower: 110,
    rimPower: 55,
    hemisphereIntensity: 0.12,
  },
  dawn: {
    background: 0x1d1720,
    fog: 0x1d1720,
    key: 0xffc39b,
    fill: 0x8f9dff,
    rim: 0xff7c9e,
    exposure: 1,
    intensity: 0.88,
    skyTop: '#241525',
    skyHorizon: '#e8977c',
    ground: '#25191d',
    glow: '#ffd0a0',
    glowX: 0.73,
    keyElevation: 19,
    keyIntensity: 3.15,
    fillPower: 128,
    rimPower: 68,
    hemisphereIntensity: 0.1,
  },
  moon: {
    background: 0x090d18,
    fog: 0x090d18,
    key: 0xb6c8ff,
    fill: 0x607bca,
    rim: 0x7de3d0,
    exposure: 0.86,
    intensity: 0.7,
    skyTop: '#050915',
    skyHorizon: '#344465',
    ground: '#07100f',
    glow: '#b9ccff',
    glowX: 0.28,
    keyElevation: 36,
    keyIntensity: 2.55,
    fillPower: 76,
    rimPower: 42,
    hemisphereIntensity: 0.08,
  },
} as const;

const createPresetPanorama = (name: RenderSettings['environment']): THREE.CanvasTexture => {
  const config = ENVIRONMENTS[name];
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_2D_UNAVAILABLE');

  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, config.skyTop);
  sky.addColorStop(0.55, config.skyHorizon);
  sky.addColorStop(0.64, config.ground);
  sky.addColorStop(1, '#050908');
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const glowX = canvas.width * config.glowX;
  const glowY = canvas.height * 0.42;
  const glow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, canvas.height * 0.35);
  glow.addColorStop(0, config.glow);
  glow.addColorStop(0.08, `${config.glow}cc`);
  glow.addColorStop(0.34, `${config.glow}28`);
  glow.addColorStop(1, `${config.glow}00`);
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (name === 'moon') {
    context.fillStyle = '#dce7ff';
    for (let index = 0; index < 180; index += 1) {
      const x = (Math.sin(index * 91.71) * 0.5 + 0.5) * canvas.width;
      const y = (Math.sin(index * 47.13 + 1.7) * 0.5 + 0.5) * canvas.height * 0.55;
      const radius = 0.35 + (index % 5) * 0.16;
      context.globalAlpha = 0.2 + (index % 7) * 0.08;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = `Floraxis ${name} panorama`;
  return texture;
};

export class BloomRenderer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);
  readonly renderer = new THREE.WebGPURenderer({
    antialias: false,
    alpha: false,
    forceWebGL: new URLSearchParams(window.location.search).get('backend') === 'webgl',
    powerPreference: 'high-performance',
    trackTimestamp: true,
  });
  readonly capabilities: RendererCapabilities = {
    webgpu: false,
    ssgi: false,
    ssr: false,
    gpuTiming: false,
    backend: 'initializing',
  };

  private readonly host: HTMLElement;
  private readonly onFrame: FrameCallback;
  private readonly clock = new THREE.Timer();
  private readonly keyLight = new THREE.DirectionalLight(0xfff0d4, 5.2);
  private readonly csmShadow = new CSMShadowNode(this.keyLight, {
    cascades: 2,
    maxFar: 24,
    mode: 'practical',
    lightMargin: 8,
  });
  private readonly fillLight = new THREE.PointLight(0x84b8ff, 1, 0, 2);
  private readonly rimLight = new THREE.PointLight(0xff8fbd, 1, 0, 2);
  private readonly hemisphereLight = new THREE.HemisphereLight(0xdbe8ff, 0x17251e, 0.12);
  private readonly focusDistanceUniform = uniform(6.8);
  private readonly focusRangeUniform = uniform(1.8);
  private readonly bokehScaleUniform = uniform(2.2);
  private readonly bokehGammaUniform = uniform(1.08);
  private readonly defocusGammaUniform = uniform(1);
  private readonly adaptiveQuality = new AdaptiveQualityController();
  private controls!: OrbitControls;
  private pipeline!: THREE.RenderPipeline;
  private subject?: Bloomable;
  private sceneMode: SceneMode = 'specimen';
  private fieldRadius = 6.5;
  private fieldHeight = 3.2;
  private fieldLayoutMode: FieldSettings['layoutMode'] = 'scatter';
  private specimenTargetY = 1.68;
  private specimenCameraScale = 1;
  private readonly specimenStage = new THREE.Group();
  private diagnosticView?: RendererDiagnosticView;
  private bloomProgress = 0;
  private settings!: RenderSettings;
  private width = 1;
  private height = 1;
  private frameCounter = 0;
  private fps = 0;
  private fpsWindowStart = performance.now();
  private lastGpuMs: number | null = null;
  private timestampFrames = 0;
  private timestampResolvePending = false;
  private lastCpuQualitySample = 0;
  private qualityObservationBlockedUntil = 0;
  private disposed = false;
  private scenePassColor: any;
  private scenePassDiffuse: any;
  private scenePassDepth: any;
  private scenePassVelocity: any;
  private scenePassMetalRough: any;
  private giPass: any;
  private aoPass: any;
  private ssrPass: any;
  private contactPass: any;
  private bloomPass: any;
  private scenePassViewZ: any;
  private dofPass?: ShapedDepthOfFieldNode;
  private traaPass?: TRAANode;
  private roomEnvironmentTarget?: EnvironmentTarget;
  private readonly presetPanoramas = new Map<RenderSettings['environment'], THREE.Texture>();
  private readonly presetEnvironmentTargets = new Map<RenderSettings['environment'], EnvironmentTarget>();
  private customEnvironment?: { background: THREE.Texture; lighting: EnvironmentTarget; info: EnvironmentImageInfo };
  private environmentSource: 'preset' | 'custom' = 'preset';

  constructor(host: HTMLElement, onFrame: FrameCallback) {
    this.host = host;
    this.onFrame = onFrame;
  }

  async init(settings: RenderSettings): Promise<void> {
    this.settings = { ...settings };
    this.adaptiveQuality.setPreference(settings.quality);
    this.renderer.setPixelRatio(this.getPixelRatio());
    configurePhysicalColorPipeline(this.renderer);
    this.renderer.toneMappingExposure = 0.94;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.id = 'bloom-canvas';
    this.renderer.domElement.setAttribute('aria-label', '실시간 3D 개화 시뮬레이션');
    this.host.appendChild(this.renderer.domElement);
    await this.renderer.init();

    this.capabilities.webgpu = (this.renderer as any).backend?.isWebGPUBackend === true;
    this.capabilities.ssgi = this.renderer.hasFeature('rg11b10ufloat-renderable');
    // Three.js r185 SSR emits an invalid int/float max() expression on the WebGL backend.
    this.capabilities.ssr = this.capabilities.webgpu;
    this.capabilities.gpuTiming = this.renderer.hasFeature('timestamp-query');
    this.capabilities.backend = this.capabilities.webgpu ? 'WebGPU' : 'WebGL 2 fallback';
    if (!this.capabilities.ssgi) this.settings.ssgi = false;
    if (!this.capabilities.ssr) this.settings.ssr = false;

    this.camera.position.set(4.1, 2.9, 5.5);
    this.camera.lookAt(0, 1.72, 0);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.68, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.minDistance = 2.7;
    this.controls.maxDistance = 9;
    this.controls.maxPolarAngle = Math.PI * 0.78;
    this.controls.update();

    this.setupScene();
    await this.setupEnvironment();
    this.setupPipeline();
    this.setEnvironment(settings.environment);
    this.resize();
    this.focusFlower();
    this.clock.connect(document);
    this.renderer.setAnimationLoop((time) => this.render(time));
  }

  private setupScene(): void {
    this.scene.background = new THREE.Color(0x101816);
    this.scene.fog = new THREE.FogExp2(0x101816, 0.032);
    // The PMREM environment supplies the primary diffuse/specular IBL. Keep only
    // a low-energy hemisphere safety fill so ambient light is not counted twice.
    this.scene.add(this.hemisphereLight);

    this.keyLight.position.set(3.6, 7, 4.2);
    this.keyLight.target.position.set(0, 1.3, 0);
    this.keyLight.castShadow = true;
    const shadowMapSize = getAdaptiveQualityTuning(this.adaptiveQuality.tier).shadowMapSize;
    this.keyLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.keyLight.shadow.camera.near = 0.1;
    this.keyLight.shadow.camera.far = 18;
    this.keyLight.shadow.camera.left = -4.5;
    this.keyLight.shadow.camera.right = 4.5;
    this.keyLight.shadow.camera.top = 6;
    this.keyLight.shadow.camera.bottom = -2;
    this.keyLight.shadow.bias = -0.00008;
    this.keyLight.shadow.normalBias = 0.015;
    this.keyLight.shadow.radius = 4;
    // A faded CSM evaluates both cascades in the transition band. That makes
    // overlapping occluders visibly darker, so keep cascade selection exclusive.
    this.csmShadow.fade = false;
    (this.keyLight.shadow as THREE.DirectionalLightShadow & { shadowNode?: CSMShadowNode }).shadowNode = this.csmShadow;
    this.scene.add(this.keyLight, this.keyLight.target);

    this.scene.add(this.fillLight, this.rimLight);

    const pedestalMaterial = new THREE.MeshPhysicalNodeMaterial({
      color: 0x1c2926,
      metalness: 0.72,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.16,
    });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.55, 0.14, 96), pedestalMaterial);
    pedestal.position.y = -0.09;
    pedestal.receiveShadow = true;
    this.specimenStage.add(pedestal);

    const ringMaterial = new THREE.MeshStandardNodeMaterial({ color: 0x65847b, metalness: 0.85, roughness: 0.28 });
    [1.12, 2.1, 3.02].forEach((radius) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.006, 4, 128), ringMaterial);
      ring.rotation.x = Math.PI * 0.5;
      ring.position.y = -0.014;
      this.specimenStage.add(ring);
    });
    this.scene.add(this.specimenStage);

  }

  private async setupEnvironment(): Promise<void> {
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.roomEnvironmentTarget = pmrem.fromScene(room, 0.04, 0.1, 100);
    this.scene.environment = this.roomEnvironmentTarget.texture;
    this.scene.environmentIntensity = 0.76;
    (Object.keys(ENVIRONMENTS) as RenderSettings['environment'][]).forEach((name) => {
      const panorama = createPresetPanorama(name);
      this.presetPanoramas.set(name, panorama);
      this.presetEnvironmentTargets.set(name, pmrem.fromEquirectangular(panorama));
    });
    room.dispose();
    pmrem.dispose();
  }

  async loadEnvironmentImage(file: File): Promise<EnvironmentImageInfo> {
    const hdr = file.name.toLowerCase().endsWith('.hdr');
    const objectUrl = URL.createObjectURL(file);
    let texture: THREE.Texture | undefined;
    try {
      texture = hdr
        ? await new HDRLoader().loadAsync(objectUrl)
        : await new THREE.TextureLoader().loadAsync(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }

    const image = texture.image as { width?: number; height?: number } | undefined;
    const width = Number(image?.width ?? 0);
    const height = Number(image?.height ?? 0);
    if (width < 64 || height < 32) {
      texture.dispose();
      throw new Error('ENVIRONMENT_IMAGE_TOO_SMALL');
    }

    texture.mapping = THREE.EquirectangularReflectionMapping;
    if (!hdr) texture.colorSpace = THREE.SRGBColorSpace;
    texture.name = `Custom environment: ${file.name}`;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const lighting = pmrem.fromEquirectangular(texture);
    pmrem.dispose();

    this.customEnvironment?.background.dispose();
    this.customEnvironment?.lighting.dispose();
    const info = { name: file.name, width, height, hdr };
    this.customEnvironment = { background: texture, lighting, info };
    this.environmentSource = 'custom';
    this.applyEnvironment();
    return info;
  }

  usePresetEnvironment(name: RenderSettings['environment']): void {
    this.settings.environment = name;
    this.environmentSource = 'preset';
    this.applyEnvironment();
  }

  clearCustomEnvironment(): void {
    this.customEnvironment?.background.dispose();
    this.customEnvironment?.lighting.dispose();
    this.customEnvironment = undefined;
    this.environmentSource = 'preset';
    this.applyEnvironment();
  }

  hasCustomEnvironment(): boolean {
    return Boolean(this.customEnvironment);
  }

  private setupPipeline(): void {
    this.pipeline = new THREE.RenderPipeline(this.renderer);
    const scenePass = pass(this.scene, this.camera);
    scenePass.setMRT(mrt({
      output,
      diffuseMetal: vec4(diffuseColor.rgb, metalness),
      normalRough: vec4(packNormalToRGB(normalView), roughness),
      velocity,
    }));
    this.scenePassColor = scenePass.getTextureNode('output');
    this.scenePassDiffuse = scenePass.getTextureNode('diffuseMetal');
    this.scenePassDepth = scenePass.getTextureNode('depth');
    this.scenePassVelocity = scenePass.getTextureNode('velocity');
    this.scenePassViewZ = scenePass.getViewZNode();
    const packedNormalRough = scenePass.getTextureNode('normalRough');
    this.scenePassMetalRough = vec2(this.scenePassDiffuse.a, packedNormalRough.a);
    scenePass.getTexture('normalRough').type = THREE.UnsignedByteType;
    scenePass.getTexture('diffuseMetal').type = THREE.UnsignedByteType;
    const sceneNormal = sample((uv) => unpackRGBToNormal(packedNormalRough.sample(uv).rgb));

    if (this.capabilities.ssgi) {
      this.giPass = ssgi(this.scenePassColor, this.scenePassDepth, sceneNormal, this.camera);
      this.giPass.sliceCount.value = 1;
      this.giPass.stepCount.value = 10;
      this.giPass.radius.value = 2.4;
      this.giPass.giIntensity.value = 2.8;
      this.giPass.aoIntensity.value = 0.8;
      this.giPass.thickness.value = 0.45;
      // SSGI's temporal sampling is only valid when the final resolve consumes velocity.
      this.giPass.useTemporalFiltering = true;
    }

    this.aoPass = ao(this.scenePassDepth, sceneNormal, this.camera);
    this.aoPass.resolutionScale = 0.62;
    this.aoPass.samples.value = 12;
    this.aoPass.radius.value = 0.18;
    this.aoPass.thickness.value = 0.9;
    this.aoPass.scale.value = 0.92;

    if (this.capabilities.ssr) {
      this.ssrPass = ssr(this.scenePassColor, this.scenePassDepth, sceneNormal, {
        camera: this.camera,
        metalnessNode: this.scenePassMetalRough.r,
        roughnessNode: this.scenePassMetalRough.g,
        reflectNonMetals: false,
        binaryRefine: true,
      });
      this.ssrPass.resolutionScale = 0.58;
      this.ssrPass.quality.value = 0.38;
      this.ssrPass.blurQuality = 2;
      this.ssrPass.maxDistance.value = 3.2;
      this.ssrPass.thickness.value = 0.12;
      this.ssrPass.intensity.value = 0.62;
      this.ssrPass.screenEdgeFadeBlack = true;
    }

    this.contactPass = sss(this.scenePassDepth, this.camera, this.keyLight);
    // Screen-space shadows are only responsible for short contact detail. A long
    // ray exits the viewport at oblique camera angles and creates a hard cutoff.
    this.contactPass.maxDistance.value = 0.46;
    this.contactPass.thickness.value = 0.025;
    this.contactPass.shadowIntensity.value = 0.6;
    this.contactPass.quality.value = 0.48;
    this.contactPass.resolutionScale = 0.64;

    this.bloomPass = bloom(this.scenePassColor, 0.1, 0.24, 1.3);
    this.rebuildPipeline();
    this.applyQualityTuning(false);
  }

  private rebuildPipeline(): void {
    if (!this.pipeline) return;
    let composite: any = this.scenePassColor;
    if (this.settings.ao) {
      const aoTexture = this.aoPass.getTextureNode();
      const occlusion = float(0.28).add(aoTexture.r.mul(0.72));
      composite = vec4(composite.rgb.mul(vec3(occlusion)), composite.a);
    }
    if (this.settings.ssgi && this.giPass) {
      const gi = this.giPass.getGINode();
      composite = vec4(add(composite.rgb, this.scenePassDiffuse.rgb.mul(gi.rgb)), composite.a);
    }
    if (this.settings.contactShadows) {
      const contactVisibility = boxBlur(this.contactPass.r, { size: int(2), separation: int(1) });
      const contactOcclusion = contactVisibility.r.oneMinus().saturate();
      const screenUv = uv();
      const edgeDistance = min(
        min(screenUv.x, screenUv.x.oneMinus()),
        min(screenUv.y, screenUv.y.oneMinus()),
      );
      const edgeFade = smoothstep(float(0.02), float(0.1), edgeDistance);

      // SSS returns visibility (1 = clear), not occlusion. Apply only the missing
      // near-contact component and attenuate it where CSM already removed most of
      // the direct-light energy, avoiding a second dark shadow on the same pixel.
      const lightingRatio = luminance(this.scenePassColor.rgb)
        .div(max(luminance(this.scenePassDiffuse.rgb), float(0.04)));
      const directLightHeadroom = smoothstep(float(0.45), float(1.1), lightingRatio);
      const contactAmount = contactOcclusion.mul(edgeFade).mul(directLightHeadroom).mul(0.34);
      const shadow = contactAmount.oneMinus();
      composite = vec4(composite.rgb.mul(vec3(shadow)), composite.a);
    }
    if (this.settings.ssr && this.ssrPass) {
      // SSR replaces part of the glossy IBL response where a screen-space hit exists.
      // This keeps the reflection from being fully added on top of an already lit pixel.
      const hitConfidence = smoothstep(float(0.001), float(0.08), this.ssrPass.a);
      const gloss = float(1).sub(this.scenePassMetalRough.g).saturate();
      const specularShare = mix(float(0.04), float(1), this.scenePassMetalRough.r)
        .mul(gloss.mul(gloss));
      const replacedEnergy = hitConfidence.mul(specularShare).mul(0.55);
      composite = vec4(
        composite.rgb.mul(vec3(float(1).sub(replacedEnergy))).add(this.ssrPass.rgb),
        composite.a,
      );
    }
    if (this.settings.bloom) composite = composite.add(this.bloomPass);
    this.dofPass?.dispose();
    this.dofPass = undefined;
    if (this.settings.depthOfField) {
      const bokehExponent = float(1).div(this.bokehGammaUniform);
      const bokehInput = vec4(
        pow(max(composite.rgb, vec3(0.00001)), vec3(bokehExponent)),
        composite.a,
      );
      this.dofPass = shapedDepthOfField(
        bokehInput,
        this.scenePassViewZ,
        this.focusDistanceUniform,
        this.focusRangeUniform,
        this.bokehScaleUniform,
        this.settings.bokehShape,
        this.settings.bokehBlades,
        this.settings.bokehRotation,
      );
      const defocusExponent = float(1).div(this.defocusGammaUniform);
      const dofOutput: any = nodeObject(this.dofPass);
      const defocused = pow(max(dofOutput.rgb, vec3(0.00001)), vec3(defocusExponent));
      const circleOfConfusion = smoothstep(
        float(0),
        this.focusRangeUniform,
        this.scenePassViewZ.negate().sub(this.focusDistanceUniform).abs(),
      );
      composite = vec4(mix(composite.rgb, defocused, circleOfConfusion), composite.a);
    }
    this.traaPass?.dispose();
    this.traaPass = traa(composite, this.scenePassDepth, this.scenePassVelocity, this.camera);
    this.traaPass.depthThreshold = 0.0007;
    this.traaPass.edgeDepthDiff = 0.0012;
    this.pipeline.outputNode = this.traaPass;
    this.pipeline.needsUpdate = true;
  }

  setFlower(preset: FlowerPreset): void {
    this.diagnosticView = undefined;
    this.subject?.dispose();
    this.subject = new FloweringPlantModel(preset);
    this.scene.add(this.subject.root);
    this.subject.update(this.bloomProgress, performance.now());
    this.setSceneMode('specimen');
    this.restartAdaptiveQuality(3000);
    this.specimenTargetY = preset.kind === 'hydrangea' ? 2.05 : preset.kind === 'wisteria' ? 2.32 : 1.68;
    this.specimenCameraScale = preset.kind === 'hydrangea' ? 1.48 : preset.kind === 'wisteria' ? 1.34 : 1;
    this.focusFlower();
  }

  setField(settings: FieldSettings, presets: FlowerPreset[]): void {
    this.diagnosticView = undefined;
    const changedMode = this.sceneMode !== 'field';
    this.fieldRadius = settings.radius;
    this.fieldLayoutMode = settings.layoutMode;
    this.subject?.dispose();
    const field = new FlowerField(settings, presets);
    this.fieldHeight = field.maxHeight;
    this.subject = field;
    this.scene.add(this.subject.root);
    this.subject.update(this.bloomProgress, performance.now());
    this.setSceneMode('field');
    if (changedMode) this.restartAdaptiveQuality(3000);
    else this.qualityObservationBlockedUntil = performance.now() + 1500;
    if (changedMode) this.focusField(settings.radius, this.fieldHeight);
  }

  setDiagnosticScene(subject: Bloomable, view: RendererDiagnosticView): void {
    this.subject?.dispose();
    this.subject = subject;
    this.scene.add(subject.root);
    this.subject.update(this.bloomProgress, performance.now());
    this.sceneMode = 'specimen';
    this.specimenStage.visible = false;
    this.diagnosticView = view;
    this.restartAdaptiveQuality(3000);
    this.focusDiagnostic();
  }

  setDiagnosticView(view: RendererDiagnosticView): void {
    this.diagnosticView = view;
    this.specimenStage.visible = false;
    this.qualityObservationBlockedUntil = performance.now() + 1500;
    this.focusDiagnostic();
  }

  setAutoRotate(enabled: boolean, speed = 0.55): void {
    this.controls.autoRotate = enabled;
    this.controls.autoRotateSpeed = speed;
  }

  setBloom(progress: number): void {
    this.bloomProgress = Math.min(1, Math.max(0, progress));
  }

  setRenderSettings(settings: RenderSettings): void {
    const previous = this.settings;
    const previousQuality = this.settings.quality;
    this.settings = {
      ...settings,
      ssgi: settings.ssgi && this.capabilities.ssgi,
      ssr: settings.ssr && this.capabilities.ssr,
    };
    this.keyLight.castShadow = this.settings.softShadows;
    this.renderer.shadowMap.enabled = this.settings.softShadows;
    this.camera.fov = Math.min(85, Math.max(18, this.settings.cameraFov));
    this.camera.updateProjectionMatrix();
    this.updateCSMFrustums();
    this.focusDistanceUniform.value = this.settings.focusDistance;
    this.focusRangeUniform.value = this.settings.focusRange;
    this.bokehScaleUniform.value = this.settings.bokehScale;
    this.bokehGammaUniform.value = this.settings.bokehGamma;
    this.defocusGammaUniform.value = this.settings.defocusGamma;
    if (previousQuality !== settings.quality) {
      this.restartAdaptiveQuality(2500);
    }
    this.applyEnvironment();
    const pipelineChanged = previous.ssgi !== this.settings.ssgi
      || previous.ssr !== this.settings.ssr
      || previous.ao !== this.settings.ao
      || previous.contactShadows !== this.settings.contactShadows
      || previous.bloom !== this.settings.bloom
      || previous.depthOfField !== this.settings.depthOfField
      || previous.bokehShape !== this.settings.bokehShape
      || previous.bokehBlades !== this.settings.bokehBlades
      || previous.bokehRotation !== this.settings.bokehRotation;
    if (pipelineChanged) {
      this.rebuildPipeline();
      this.qualityObservationBlockedUntil = performance.now() + 1500;
    }
  }

  setEnvironment(name: RenderSettings['environment']): void {
    this.settings.environment = name;
    this.applyEnvironment();
  }

  private applyEnvironment(): void {
    const env = ENVIRONMENTS[this.settings.environment];
    const custom = this.environmentSource === 'custom' ? this.customEnvironment : undefined;
    this.scene.environment = custom?.lighting.texture
      ?? this.presetEnvironmentTargets.get(this.settings.environment)?.texture
      ?? this.roomEnvironmentTarget?.texture
      ?? null;
    this.scene.background = this.settings.environmentBackground
      ? custom?.background ?? this.presetPanoramas.get(this.settings.environment) ?? new THREE.Color(env.background)
      : new THREE.Color(env.background);
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.setHex(env.fog);
    this.keyLight.color.setHex(env.key);
    this.fillLight.color.setHex(env.fill);
    this.rimLight.color.setHex(env.rim);
    const lightScale = Math.min(2.5, Math.max(0, this.settings.environmentIntensity));
    // HDR panoramas already contain their own luminous sources. Supplemental
    // direct lights stay weaker for custom maps to avoid counting that energy twice.
    const supplementalScale = custom ? (custom.info.hdr ? 0.28 : 0.5) : 1;
    this.keyLight.intensity = env.keyIntensity * lightScale * supplementalScale;
    this.fillLight.power = env.fillPower * lightScale * supplementalScale;
    this.rimLight.power = env.rimPower * lightScale * supplementalScale;
    this.hemisphereLight.color.set(env.skyHorizon);
    this.hemisphereLight.groundColor.set(env.ground);
    this.hemisphereLight.intensity = env.hemisphereIntensity * lightScale * supplementalScale;
    this.renderer.toneMappingExposure = env.exposure;
    this.scene.environmentIntensity = env.intensity * lightScale;
    this.scene.backgroundIntensity = Math.min(2.5, Math.max(0, this.settings.backgroundIntensity));
    this.scene.backgroundBlurriness = Math.min(1, Math.max(0, this.settings.backgroundBlur));
    const rotation = this.settings.environmentRotation * Math.PI / 180;
    this.scene.environmentRotation.set(0, rotation, 0);
    this.scene.backgroundRotation.set(0, rotation, 0);
    const rig = resolveEnvironmentLightRig(
      env.glowX,
      env.keyElevation,
      this.settings.environmentRotation,
      this.keyLight.target.position,
    );
    this.keyLight.position.copy(rig.keyPosition);
    this.fillLight.position.copy(rig.fillPosition);
    this.rimLight.position.copy(rig.rimPosition);
  }

  getTargetFocusDistance(): number {
    return this.camera.position.distanceTo(this.controls.target);
  }

  focusFlower(): void {
    const targetY = this.specimenTargetY;
    const narrowScale = (this.width / Math.max(1, this.height) < 0.72 ? 1.18 : 1) * this.specimenCameraScale;
    this.camera.position.set(4.1 * narrowScale, targetY + (2.9 - targetY) * narrowScale, 5.5 * narrowScale);
    this.controls.target.set(0, targetY, 0);
    this.controls.minDistance = 2.7;
    this.controls.maxDistance = 9;
    this.controls.maxPolarAngle = Math.PI * 0.78;
    this.setShadowExtent(4.5, 6);
    this.controls.update();
  }

  focusField(radius: number, fieldHeight = this.fieldHeight): void {
    const safeRadius = Math.min(10, Math.max(2.5, radius));
    const safeHeight = Math.min(7, Math.max(1.2, fieldHeight));
    const targetY = Math.min(2.2, safeHeight * 0.34);
    const narrowScale = this.width / Math.max(1, this.height) < 0.72 ? 1.2 : 1;
    if (this.fieldLayoutMode === 'flower-tunnel' || this.fieldLayoutMode === 'flower-road-walls') {
      const tunnel = this.fieldLayoutMode === 'flower-tunnel';
      const corridorTargetY = tunnel ? Math.min(1.75, safeHeight * 0.32) : Math.min(1.45, safeHeight * 0.27);
      this.camera.position.set(0, corridorTargetY + (tunnel ? 0.58 : 0.7), safeRadius * 2.55 * narrowScale);
      this.controls.target.set(0, corridorTargetY, -safeRadius * 0.12);
      this.controls.minDistance = 3.4;
      this.controls.maxDistance = 36;
      this.controls.maxPolarAngle = Math.PI * 0.64;
      this.setShadowExtent(safeRadius + 2.2, Math.max(safeRadius + 4.5, safeHeight + 2));
      this.controls.update();
      return;
    }
    this.camera.position.set(
      safeRadius * 1.55 * narrowScale,
      (safeRadius * 1.05 + safeHeight * 0.62 + 2.4) * narrowScale,
      safeRadius * 2 * narrowScale,
    );
    this.controls.target.set(0, targetY, 0);
    this.controls.minDistance = 4;
    this.controls.maxDistance = 36;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.setShadowExtent(safeRadius + 2.2, Math.max(safeRadius + 4.5, safeHeight + 2));
    this.controls.update();
  }

  focusScene(): void {
    if (this.diagnosticView) {
      this.focusDiagnostic();
      return;
    }
    if (this.sceneMode === 'field') this.focusField(this.fieldRadius, this.fieldHeight);
    else this.focusFlower();
  }

  private focusDiagnostic(): void {
    const view = this.diagnosticView;
    if (!view) return;
    const [targetX, targetY, targetZ] = view.target;
    const [cameraX, cameraY, cameraZ] = view.cameraPosition;
    const narrowScale = this.width / Math.max(1, this.height) < 0.78 ? 1.18 : 1;
    this.camera.position.set(
      targetX + (cameraX - targetX) * narrowScale,
      targetY + (cameraY - targetY) * narrowScale,
      targetZ + (cameraZ - targetZ) * narrowScale,
    );
    this.controls.target.set(targetX, targetY, targetZ);
    this.controls.minDistance = view.minDistance ?? 2.5;
    this.controls.maxDistance = view.maxDistance ?? 24;
    this.controls.maxPolarAngle = clampGroundSafePolarAngle(view.maxPolarAngle ?? Math.PI * 0.49);
    this.setShadowExtent(view.shadowHorizontal ?? 7, view.shadowVertical ?? 8);
    this.controls.update();
  }

  private setSceneMode(mode: SceneMode): void {
    this.sceneMode = mode;
    this.specimenStage.visible = mode === 'specimen';
  }

  private setShadowExtent(horizontal: number, vertical: number): void {
    const coverage = getStableShadowCoverage(horizontal, vertical, this.camera.far);
    this.keyLight.shadow.camera.left = -horizontal;
    this.keyLight.shadow.camera.right = horizontal;
    this.keyLight.shadow.camera.top = vertical;
    this.keyLight.shadow.camera.bottom = -2;
    this.keyLight.shadow.camera.far = coverage.shadowCameraFar;
    this.keyLight.shadow.camera.updateProjectionMatrix();
    this.csmShadow.maxFar = coverage.maxFar;
    this.csmShadow.lightMargin = coverage.lightMargin;
    this.csmShadow.lights.forEach((light) => {
      if (!light.shadow) return;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = coverage.shadowCameraFar;
      light.shadow.camera.updateProjectionMatrix();
    });
    this.updateCSMFrustums();
  }

  private updateCSMFrustums(): void {
    if (this.csmShadow.camera !== null) this.csmShadow.updateFrustums();
  }

  private setShadowMapSize(size: 512 | 1024 | 2048): void {
    this.keyLight.shadow.mapSize.set(size, size);
    this.csmShadow.lights.forEach((light) => light.shadow?.mapSize.set(size, size));
  }

  private applyQualityTuning(resize = true): void {
    const tuning = getAdaptiveQualityTuning(this.adaptiveQuality.tier);
    this.renderer.setPixelRatio(this.getPixelRatio());
    this.setShadowMapSize(tuning.shadowMapSize);

    if (this.aoPass) {
      this.aoPass.resolutionScale = tuning.aoResolutionScale;
      this.aoPass.samples.value = tuning.aoSamples;
    }
    if (this.ssrPass) this.ssrPass.resolutionScale = tuning.ssrResolutionScale;
    if (this.contactPass) this.contactPass.resolutionScale = tuning.contactResolutionScale;
    if (this.giPass) {
      this.giPass.sliceCount.value = tuning.giSlices;
      this.giPass.stepCount.value = tuning.giSteps;
    }
    if (resize) this.resize();
  }

  private restartAdaptiveQuality(graceMs: number): void {
    this.adaptiveQuality.setPreference(this.settings.quality);
    this.lastGpuMs = null;
    this.timestampFrames = 0;
    this.qualityObservationBlockedUntil = performance.now() + graceMs;
    this.applyQualityTuning();
  }

  resize(): void {
    const rect = this.host.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.updateCSMFrustums();
  }

  capture(): void {
    this.renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `floraxis-${Date.now()}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, 'image/png');
  }

  private getPixelRatio(): number {
    const cap = getAdaptiveQualityTuning(this.adaptiveQuality.tier).pixelRatioCap;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  private render(time: number): void {
    this.clock.update();
    const delta = Math.min(0.05, this.clock.getDelta());
    this.frameCounter += 1;
    const now = performance.now();
    const elapsedWindow = now - this.fpsWindowStart;
    if (elapsedWindow > 500) {
      this.fps = Math.round(this.frameCounter * 1000 / elapsedWindow);
      this.frameCounter = 0;
      this.fpsWindowStart = now;
    }
    this.subject?.update(this.bloomProgress, time);
    this.controls.update();
    this.pipeline.render();
    this.onFrame(delta, time, {
      fps: this.fps,
      drawCalls: this.renderer.info.render.drawCalls,
      triangles: this.renderer.info.render.triangles,
      gpuMs: this.lastGpuMs,
      resolutionScale: Math.min(1, this.getPixelRatio() / Math.max(1, window.devicePixelRatio || 1)),
      qualityTier: this.adaptiveQuality.tier,
    });
    this.sampleQualityTiming(now);
  }

  private sampleQualityTiming(now: number): void {
    if (document.visibilityState === 'hidden') return;

    if (!this.capabilities.gpuTiming) {
      if (this.fps > 0 && now - this.lastCpuQualitySample >= 1000) {
        this.lastCpuQualitySample = now;
        this.observeQuality(1000 / this.fps, now);
      }
      return;
    }

    this.timestampFrames += 1;
    if (this.timestampFrames < 15 || this.timestampResolvePending) return;
    this.timestampFrames = 0;
    this.timestampResolvePending = true;
    void this.renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER)
      .then((gpuMs) => {
        if (this.disposed || gpuMs === undefined || !Number.isFinite(gpuMs) || gpuMs <= 0) return;
        this.lastGpuMs = gpuMs;
        const frameMs = this.fps > 0 ? 1000 / this.fps : gpuMs;
        this.observeQuality(Math.max(gpuMs, frameMs), performance.now());
      })
      .catch(() => {
        this.capabilities.gpuTiming = false;
        this.lastGpuMs = null;
      })
      .finally(() => {
        this.timestampResolvePending = false;
      });
  }

  private observeQuality(frameMs: number, now: number): void {
    if (now < this.qualityObservationBlockedUntil) return;
    const result = this.adaptiveQuality.observe(frameMs, now);
    if (result.changed) this.applyQualityTuning();
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.subject?.dispose();
    this.controls?.dispose();
    this.traaPass?.dispose();
    this.dofPass?.dispose();
    this.csmShadow.dispose();
    this.pipeline?.dispose();
    this.customEnvironment?.background.dispose();
    this.customEnvironment?.lighting.dispose();
    this.presetPanoramas.forEach((texture) => texture.dispose());
    this.presetEnvironmentTargets.forEach((target) => target.dispose());
    this.roomEnvironmentTarget?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

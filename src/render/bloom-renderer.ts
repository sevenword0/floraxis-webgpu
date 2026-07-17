import * as THREE from 'three/webgpu';
import {
  add,
  diffuseColor,
  float,
  int,
  metalness,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  roughness,
  sample,
  unpackRGBToNormal,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { sss } from 'three/addons/tsl/display/SSSNode.js';
import { boxBlur } from 'three/addons/tsl/display/boxBlur.js';
import type { Bloomable, FieldSettings, FlowerPreset, RenderSettings, SceneMode } from '../types';
import { FlowerModel } from '../flower/flower-model';
import { FlowerField } from '../flower/flower-field';

export interface RendererFrameInfo {
  fps: number;
  drawCalls: number;
  triangles: number;
}

export interface RendererCapabilities {
  webgpu: boolean;
  ssgi: boolean;
  backend: string;
}

type FrameCallback = (deltaSeconds: number, elapsedMs: number, info: RendererFrameInfo) => void;

const ENVIRONMENTS = {
  studio: {
    background: 0x101816,
    fog: 0x101816,
    key: 0xfff0d4,
    fill: 0x84b8ff,
    rim: 0xff8fbd,
    exposure: 0.94,
    intensity: 0.76,
  },
  dawn: {
    background: 0x1d1720,
    fog: 0x1d1720,
    key: 0xffc39b,
    fill: 0x8f9dff,
    rim: 0xff7c9e,
    exposure: 1,
    intensity: 0.88,
  },
  moon: {
    background: 0x090d18,
    fog: 0x090d18,
    key: 0xb6c8ff,
    fill: 0x607bca,
    rim: 0x7de3d0,
    exposure: 0.86,
    intensity: 0.7,
  },
} as const;

export class BloomRenderer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);
  readonly renderer = new THREE.WebGPURenderer({ antialias: true, alpha: false });
  readonly capabilities: RendererCapabilities = { webgpu: false, ssgi: false, backend: 'initializing' };

  private readonly host: HTMLElement;
  private readonly onFrame: FrameCallback;
  private readonly clock = new THREE.Timer();
  private readonly keyLight = new THREE.DirectionalLight(0xfff0d4, 5.2);
  private readonly fillLight = new THREE.PointLight(0x84b8ff, 18, 12, 2);
  private readonly rimLight = new THREE.PointLight(0xff8fbd, 16, 10, 2);
  private controls!: OrbitControls;
  private pipeline!: THREE.RenderPipeline;
  private subject?: Bloomable;
  private sceneMode: SceneMode = 'specimen';
  private fieldRadius = 6.5;
  private fieldHeight = 3.2;
  private readonly specimenStage = new THREE.Group();
  private fieldGround?: THREE.Mesh;
  private bloomProgress = 0;
  private settings!: RenderSettings;
  private width = 1;
  private height = 1;
  private frameCounter = 0;
  private fps = 0;
  private fpsWindowStart = performance.now();
  private lastDrawCalls = 0;
  private lastTriangles = 0;
  private scenePassColor: any;
  private scenePassDiffuse: any;
  private giPass: any;
  private aoPass: any;
  private ssrPass: any;
  private contactPass: any;
  private bloomPass: any;

  constructor(host: HTMLElement, onFrame: FrameCallback) {
    this.host = host;
    this.onFrame = onFrame;
  }

  async init(settings: RenderSettings): Promise<void> {
    if (!WebGPU.isAvailable()) throw new Error('WEBGPU_UNAVAILABLE');
    this.settings = { ...settings };
    this.renderer.setPixelRatio(this.getPixelRatio());
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = 'bloom-canvas';
    this.renderer.domElement.setAttribute('aria-label', '실시간 3D 개화 시뮬레이션');
    this.host.appendChild(this.renderer.domElement);
    await this.renderer.init();

    this.capabilities.webgpu = (this.renderer as any).backend?.isWebGPUBackend === true;
    this.capabilities.ssgi = this.renderer.hasFeature('rg11b10ufloat-renderable');
    this.capabilities.backend = this.capabilities.webgpu ? 'WebGPU' : 'WebGL 2 fallback';
    if (!this.capabilities.ssgi) this.settings.ssgi = false;

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
    this.scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x17251e, 0.85));

    this.keyLight.position.set(3.6, 7, 4.2);
    this.keyLight.target.position.set(0, 1.3, 0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 0.1;
    this.keyLight.shadow.camera.far = 18;
    this.keyLight.shadow.camera.left = -4.5;
    this.keyLight.shadow.camera.right = 4.5;
    this.keyLight.shadow.camera.top = 6;
    this.keyLight.shadow.camera.bottom = -2;
    this.keyLight.shadow.bias = -0.00008;
    this.keyLight.shadow.normalBias = 0.015;
    this.keyLight.shadow.radius = 4;
    this.scene.add(this.keyLight, this.keyLight.target);

    this.keyLight.intensity = 3.3;
    this.fillLight.intensity = 9;
    this.rimLight.intensity = 8;
    this.fillLight.position.set(-4, 3.4, 2.8);
    this.rimLight.position.set(2.5, 3.8, -4.5);
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

    const fieldMaterial = new THREE.MeshPhysicalNodeMaterial({
      color: 0x172620,
      metalness: 0.08,
      roughness: 0.78,
      clearcoat: 0.22,
      clearcoatRoughness: 0.74,
    });
    this.fieldGround = new THREE.Mesh(new THREE.CylinderGeometry(10.8, 11, 0.12, 112), fieldMaterial);
    this.fieldGround.position.y = -0.12;
    this.fieldGround.receiveShadow = true;
    this.fieldGround.visible = false;
    this.scene.add(this.fieldGround);
  }

  private async setupEnvironment(): Promise<void> {
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const target = pmrem.fromScene(room, 0.04, 0.1, 100);
    this.scene.environment = target.texture;
    this.scene.environmentIntensity = 0.76;
    room.dispose();
    pmrem.dispose();
  }

  private setupPipeline(): void {
    this.pipeline = new THREE.RenderPipeline(this.renderer);
    const scenePass = pass(this.scene, this.camera);
    scenePass.setMRT(mrt({
      output,
      diffuseColor,
      normal: packNormalToRGB(normalView),
      metalrough: vec2(metalness, roughness),
    }));
    this.scenePassColor = scenePass.getTextureNode('output');
    this.scenePassDiffuse = scenePass.getTextureNode('diffuseColor');
    const scenePassDepth = scenePass.getTextureNode('depth');
    const packedNormal = scenePass.getTextureNode('normal');
    const metalRough = scenePass.getTextureNode('metalrough');
    scenePass.getTexture('normal').type = THREE.UnsignedByteType;
    scenePass.getTexture('metalrough').type = THREE.UnsignedByteType;
    scenePass.getTexture('diffuseColor').type = THREE.UnsignedByteType;
    const sceneNormal = sample((uv) => unpackRGBToNormal(packedNormal.sample(uv)));

    if (this.capabilities.ssgi) {
      this.giPass = ssgi(this.scenePassColor, scenePassDepth, sceneNormal, this.camera);
      this.giPass.sliceCount.value = 1;
      this.giPass.stepCount.value = 10;
      this.giPass.radius.value = 2.4;
      this.giPass.giIntensity.value = 2.8;
      this.giPass.aoIntensity.value = 0.8;
      this.giPass.thickness.value = 0.45;
    }

    this.aoPass = ao(scenePassDepth, sceneNormal, this.camera);
    this.aoPass.resolutionScale = 0.62;
    this.aoPass.samples.value = 12;
    this.aoPass.radius.value = 0.18;
    this.aoPass.thickness.value = 0.9;
    this.aoPass.scale.value = 0.92;

    this.ssrPass = ssr(this.scenePassColor, scenePassDepth, sceneNormal, {
      camera: this.camera,
      metalnessNode: metalRough.r,
      roughnessNode: metalRough.g,
      reflectNonMetals: true,
      binaryRefine: true,
    });
    this.ssrPass.resolutionScale = 0.58;
    this.ssrPass.quality.value = 0.38;
    this.ssrPass.blurQuality = 2;
    this.ssrPass.maxDistance.value = 3.2;
    this.ssrPass.thickness.value = 0.12;
    this.ssrPass.intensity.value = 0.62;
    this.ssrPass.screenEdgeFadeBlack = true;

    this.contactPass = sss(scenePassDepth, this.camera, this.keyLight);
    this.contactPass.maxDistance.value = 0.72;
    this.contactPass.thickness.value = 0.025;
    this.contactPass.shadowIntensity.value = 0.6;
    this.contactPass.quality.value = 0.48;
    this.contactPass.resolutionScale = 0.64;

    this.bloomPass = bloom(this.scenePassColor, 0.1, 0.24, 1.3);
    this.rebuildPipeline();
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
      const softContact = boxBlur(this.contactPass.r, { size: int(2), separation: int(1) });
      const shadow = float(1).sub(softContact.r.mul(0.42));
      composite = vec4(composite.rgb.mul(vec3(shadow)), composite.a);
    }
    if (this.settings.ssr) composite = vec4(composite.rgb.add(this.ssrPass.rgb), composite.a);
    if (this.settings.bloom) composite = composite.add(this.bloomPass);
    this.pipeline.outputNode = smaa(composite);
    this.pipeline.needsUpdate = true;
  }

  setFlower(preset: FlowerPreset): void {
    this.subject?.dispose();
    this.subject = new FlowerModel(preset);
    this.scene.add(this.subject.root);
    this.subject.update(this.bloomProgress, performance.now());
    this.setSceneMode('specimen');
  }

  setField(settings: FieldSettings, presets: FlowerPreset[]): void {
    const changedMode = this.sceneMode !== 'field';
    this.fieldRadius = settings.radius;
    this.subject?.dispose();
    const field = new FlowerField(settings, presets);
    this.fieldHeight = field.maxHeight;
    this.subject = field;
    this.scene.add(this.subject.root);
    this.subject.update(this.bloomProgress, performance.now());
    this.setSceneMode('field');
    if (changedMode) this.focusField(settings.radius, this.fieldHeight);
  }

  setBloom(progress: number): void {
    this.bloomProgress = Math.min(1, Math.max(0, progress));
  }

  setRenderSettings(settings: RenderSettings): void {
    const previousQuality = this.settings.quality;
    this.settings = { ...settings, ssgi: settings.ssgi && this.capabilities.ssgi };
    this.keyLight.castShadow = this.settings.softShadows;
    this.renderer.shadowMap.enabled = this.settings.softShadows;
    if (previousQuality !== settings.quality) {
      this.renderer.setPixelRatio(this.getPixelRatio());
      const cinematic = settings.quality === 'cinematic';
      this.aoPass.resolutionScale = cinematic ? 0.82 : 0.58;
      this.aoPass.samples.value = cinematic ? 20 : 10;
      this.ssrPass.resolutionScale = cinematic ? 0.72 : 0.52;
      this.contactPass.resolutionScale = cinematic ? 0.78 : 0.56;
      if (this.giPass) {
        this.giPass.sliceCount.value = cinematic ? 2 : 1;
        this.giPass.stepCount.value = cinematic ? 12 : 8;
      }
      this.resize();
    }
    this.setEnvironment(settings.environment);
    this.rebuildPipeline();
  }

  setEnvironment(name: RenderSettings['environment']): void {
    const env = ENVIRONMENTS[name];
    this.scene.background = new THREE.Color(env.background);
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.setHex(env.fog);
    this.keyLight.color.setHex(env.key);
    this.fillLight.color.setHex(env.fill);
    this.rimLight.color.setHex(env.rim);
    this.renderer.toneMappingExposure = env.exposure;
    this.scene.environmentIntensity = env.intensity;
  }

  focusFlower(): void {
    const targetY = 1.68;
    const narrowScale = this.width / Math.max(1, this.height) < 0.72 ? 1.18 : 1;
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
    if (this.sceneMode === 'field') this.focusField(this.fieldRadius, this.fieldHeight);
    else this.focusFlower();
  }

  private setSceneMode(mode: SceneMode): void {
    this.sceneMode = mode;
    this.specimenStage.visible = mode === 'specimen';
    if (this.fieldGround) this.fieldGround.visible = mode === 'field';
  }

  private setShadowExtent(horizontal: number, vertical: number): void {
    this.keyLight.shadow.camera.left = -horizontal;
    this.keyLight.shadow.camera.right = horizontal;
    this.keyLight.shadow.camera.top = vertical;
    this.keyLight.shadow.camera.bottom = -2;
    this.keyLight.shadow.camera.far = Math.max(18, vertical * 2.2);
    this.keyLight.shadow.camera.updateProjectionMatrix();
  }

  resize(): void {
    const rect = this.host.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
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
    const cap = this.settings?.quality === 'cinematic' ? 1.6 : 1.25;
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
    const cumulativeCalls = this.renderer.info.render.calls;
    const cumulativeTriangles = this.renderer.info.render.triangles;
    const frameCalls = Math.max(0, cumulativeCalls - this.lastDrawCalls);
    const frameTriangles = Math.max(0, cumulativeTriangles - this.lastTriangles);
    this.lastDrawCalls = cumulativeCalls;
    this.lastTriangles = cumulativeTriangles;
    this.onFrame(delta, time, {
      fps: this.fps,
      drawCalls: frameCalls,
      triangles: frameTriangles,
    });
    this.subject?.update(this.bloomProgress, time);
    this.controls.update();
    this.pipeline.render();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.subject?.dispose();
    this.controls?.dispose();
    this.pipeline?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

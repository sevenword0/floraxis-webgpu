import * as THREE from 'three/webgpu';
import type { Bloomable, BloomGrowthProfile, FieldSettings, FlowerPreset } from '../types';
import { resolveBotanicalArchitecture } from '../data/botanical-architecture';
import { evaluateHeadGrowth, evaluateReproductiveReveal, resolveGrowthProfile } from '../growth-model';
import { remapBloom, smoothstep } from '../utils';
import { createPetalGeometry, createPetalMaterial, resolvePetalThickness } from './petal-geometry';
import { computeFloralAttachment, computePetalClearance } from './petal-layout';
import { evaluatePetalUnfurl } from './petal-unfurl';
import { evaluateRoseVortex, usesRoseVortex } from './rose-vortex';
import { createLeafGeometry } from './leaf-geometry';
import { LeafAttachmentFrame, setLeafGrowthDirection } from './leaf-attachment';
import { FieldTerrain } from './field-terrain';
import { sampleWindBend } from './field-environment-layout';
import { generateInflorescencePetalSpecs, type InflorescencePetalSpec } from './inflorescence-layout';
import { generateFieldSupportSegments } from './field-support-layout';
import { displayStemRadius } from './stem-proportions';
import { expandFieldFloweringShoots } from './flowering-shoot-layout';
import {
  FIELD_STEM_CURVE_SEGMENTS,
  resolveBotanicalCurvature,
  sampleStemCurvePoint,
  type BotanicalCurvatureProfile,
} from './botanical-curvature';
import {
  botanicalLengthToWorld,
  evaluateFieldBloom,
  generateFieldLayout,
  type FieldLod,
  type FieldPlant,
} from './flower-field-layout';

interface FieldRoseVortexSpec {
  phase: number;
  strength: number;
  morphOffset: number;
}

interface FieldPetalSpec {
  angle: number;
  layer: number;
  delay: number;
  span: number;
  openAngle: number;
  closedAngle: number;
  closedRoll: number;
  roll: number;
  sweep: number;
  phase: number;
  radialBase: number;
  baseLift: number;
  laneDepth: number;
  laneLift: number;
  openDrift: number;
  contactGuard: number;
  vortex?: FieldRoseVortexSpec;
  inflorescence?: InflorescencePetalSpec;
}

interface FieldSepalSpec {
  angle: number;
  delay: number;
  span: number;
  openAngle: number;
  closedAngle: number;
  closedRoll: number;
  roll: number;
  sweep: number;
  radialBase: number;
  baseLift: number;
  openDrift: number;
  drop: number;
}

interface FieldPetalInstance {
  plant: FieldPlant;
  spec: FieldPetalSpec;
}

interface FieldSepalInstance {
  plant: FieldPlant;
  spec: FieldSepalSpec;
}

interface FieldBranchInstance {
  plant: FieldPlant;
  slot: number;
}

interface FieldLeafInstance {
  plant: FieldPlant;
  slot: number;
  count: number;
}

interface SpeciesBatch {
  preset: FlowerPreset;
  growth: BloomGrowthProfile;
  curvature: BotanicalCurvatureProfile;
  plants: FieldPlant[];
  petals: FieldPetalInstance[];
  sepals: FieldSepalInstance[];
  branches: FieldBranchInstance[];
  leaves: FieldLeafInstance[];
  stemMesh: THREE.InstancedMesh;
  pedicelMesh: THREE.InstancedMesh;
  branchMesh?: THREE.InstancedMesh;
  leafStemMesh?: THREE.InstancedMesh;
  leafMesh?: THREE.InstancedMesh;
  centerMesh: THREE.InstancedMesh;
  petalMesh: THREE.InstancedMesh;
  petalMorphDriver: THREE.Mesh;
  sepalMesh?: THREE.InstancedMesh;
  sepalMorphDriver?: THREE.Mesh;
}

const DEG = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const PETAL_CAPS: Record<string, number> = {
  rose: 24,
  tulip: 6,
  lily: 6,
  sakura: 5,
  lotus: 16,
  sunflower: 24,
  hydrangea: 64,
  wisteria: 60,
};

const LOD_FACTOR: Record<FieldLod, number> = { near: 1, mid: 0.72, far: 0.48 };

const minimumPetals = (preset: FlowerPreset): number => {
  if (preset.morphology.petalCount <= 6) return preset.morphology.petalCount;
  if (preset.id === 'rose') return 10;
  if (preset.id === 'lotus') return 8;
  if (preset.kind === 'sunflower') return 12;
  if (preset.kind === 'hydrangea') return 32;
  if (preset.kind === 'wisteria') return 30;
  return 5;
};

const visiblePetalCount = (preset: FlowerPreset, lod: FieldLod): number => {
  const cap = Math.min(preset.morphology.petalCount, PETAL_CAPS[preset.id] ?? 18);
  const raw = Math.max(minimumPetals(preset), Math.round(cap * LOD_FACTOR[lod]));
  const floretUnit = preset.kind === 'hydrangea' ? 4 : preset.kind === 'wisteria' ? 5 : 1;
  return Math.min(cap, Math.max(minimumPetals(preset), Math.round(raw / floretUnit) * floretUnit));
};

const visibleLeafCount = (plant: FieldPlant): number => {
  const cap = plant.lod === 'near' ? 12 : plant.lod === 'mid' ? 8 : 5;
  return Math.max(0, Math.min(cap, plant.leafCount));
};

const deployedHeadDiameter = (preset: FlowerPreset): number => {
  const m = preset.morphology;
  if (preset.kind === 'hydrangea') return 1.42;
  if (preset.kind === 'wisteria') return 1.36;
  return Math.max(0.2, (m.headRadius + m.petalLength * (preset.kind === 'sunflower' ? 0.96 : 0.9)) * 2);
};

const distributePetals = (total: number, layers: number): number[] => {
  const safeLayers = Math.max(1, Math.min(total, layers));
  const counts = Array.from({ length: safeLayers }, () => Math.floor(total / safeLayers));
  for (let index = 0; index < total % safeLayers; index += 1) counts[index] += 1;
  return counts;
};

const makeMorphTargetsRelative = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
  for (const key of ['position', 'normal'] as const) {
    const base = geometry.getAttribute(key);
    const targets = geometry.morphAttributes[key];
    if (!base || !targets) continue;
    for (const target of targets) {
      for (let index = 0; index < target.count; index += 1) {
        target.setXYZ(
          index,
          target.getX(index) - base.getX(index),
          target.getY(index) - base.getY(index),
          target.getZ(index) - base.getZ(index),
        );
      }
      target.needsUpdate = true;
    }
  }
  geometry.morphTargetsRelative = true;
  return geometry;
};

/**
 * A draw-call bounded flower field. Each species owns one instanced batch for
 * stems, centres, petals, and sepals while every plant retains independent
 * placement, bloom timing, LOD, scale, and wind phase.
 */
export class FlowerField implements Bloomable {
  readonly root = new THREE.Group();
  readonly petalCount: number;
  readonly maxHeight: number;

  private readonly settings: FieldSettings;
  private readonly terrain: FieldTerrain;
  private readonly batches: SpeciesBatch[] = [];
  private readonly disposables = new Set<{ dispose(): void }>();
  private readonly transform = new THREE.Object3D();
  private readonly radial = new THREE.Object3D();
  private readonly hinge = new THREE.Object3D();
  private readonly meshPose = new THREE.Object3D();
  private readonly headMatrix = new THREE.Matrix4();
  private readonly petalMatrix = new THREE.Matrix4();
  private readonly workMatrix = new THREE.Matrix4();
  private readonly direction = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly stemStart = new THREE.Vector3();
  private readonly stemEnd = new THREE.Vector3();
  private readonly stemRootPose = new THREE.Vector3();
  private readonly stemTipPose = new THREE.Vector3();
  private readonly curveSegmentStart = new THREE.Vector3();
  private readonly curveSegmentEnd = new THREE.Vector3();
  private readonly headPosition = new THREE.Vector3();
  private readonly headQuaternion = new THREE.Quaternion();
  private readonly tiltQuaternion = new THREE.Quaternion();
  private readonly yawQuaternion = new THREE.Quaternion();
  private readonly leafAttachmentFrame = new LeafAttachmentFrame();
  private readonly right = new THREE.Vector3(1, 0, 0);
  private readonly forward = new THREE.Vector3(0, 0, 1);
  private readonly outward = new THREE.Vector3();
  private currentStemCurveBend = 0;
  private currentStemCurveAzimuth = 0;

  constructor(settings: FieldSettings, presets: FlowerPreset[]) {
    this.settings = {
      ...settings,
      speciesIds: [...settings.speciesIds],
      colorRanges: Object.fromEntries(Object.entries(settings.colorRanges ?? {}).map(([key, value]) => [key, { ...value }])),
      stemScales: { ...(settings.stemScales ?? {}) },
      speciesVariations: Object.fromEntries(Object.entries(settings.speciesVariations ?? {}).map(([key, value]) => [key, { ...value }])),
      individuals: Object.fromEntries(Object.entries(settings.individuals ?? {}).map(([key, value]) => [key, { ...value }])),
    };
    this.root.name = 'preset-flower-field';
    const presetById = new Map(presets.map((preset) => [preset.id, preset]));
    const rootPlants = generateFieldLayout(this.settings, presets);
    const plants = expandFieldFloweringShoots(rootPlants, presets);
    this.terrain = new FieldTerrain(this.settings, rootPlants);
    this.root.add(this.terrain.root);
    this.maxHeight = Math.max(1, ...rootPlants.map((plant) => plant.groundY + plant.visualHeight + plant.matureRadius));
    const grouped = new Map<string, FieldPlant[]>();
    for (const plant of plants) {
      if (!presetById.has(plant.presetId)) continue;
      const group = grouped.get(plant.presetId) ?? [];
      group.push(plant);
      grouped.set(plant.presetId, group);
    }

    for (const [presetId, speciesPlants] of grouped) {
      const preset = presetById.get(presetId);
      if (preset) this.batches.push(this.buildSpeciesBatch(preset, speciesPlants));
    }
    this.buildFieldSupports();
    this.petalCount = this.batches.reduce((total, batch) => total + batch.petals.length, 0);
    this.update(0, 0);
  }

  private track<T extends { dispose(): void }>(value: T): T {
    this.disposables.add(value);
    return value;
  }

  private prepareInstancedMesh(mesh: THREE.InstancedMesh, dynamic = true): THREE.InstancedMesh {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    if (dynamic) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.track(mesh);
    this.root.add(mesh);
    return mesh;
  }

  private buildFieldSupports(): void {
    const segments = generateFieldSupportSegments(this.settings, this.maxHeight);
    if (segments.length === 0) return;
    const geometry = this.track(new THREE.CylinderGeometry(1, 1, 1, 8, 1));
    const material = this.track(new THREE.MeshStandardNodeMaterial({
      color: this.settings.layoutMode === 'flower-tunnel' ? '#70583f' : '#53625a',
      roughness: 0.88,
      metalness: this.settings.layoutMode === 'flower-tunnel' ? 0 : 0.12,
    }));
    const mesh = this.prepareInstancedMesh(new THREE.InstancedMesh(geometry, material, segments.length), false);
    segments.forEach((item, index) => {
      this.setCylinderBetween(
        mesh,
        index,
        new THREE.Vector3(item.start.x, item.start.y, item.start.z),
        new THREE.Vector3(item.end.x, item.end.y, item.end.z),
        item.radius,
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  private createPetalSpecs(preset: FlowerPreset, count: number, growth: BloomGrowthProfile): FieldPetalSpec[] {
    const m = preset.morphology;
    if (preset.kind === 'hydrangea' || preset.kind === 'wisteria') {
      return generateInflorescencePetalSpecs(preset.kind, count).map((inflorescence) => ({
        angle: inflorescence.angle,
        layer: inflorescence.axisT,
        delay: inflorescence.delay,
        span: inflorescence.span,
        openAngle: m.openAngle,
        closedAngle: m.closedAngle,
        closedRoll: 0,
        roll: 0,
        sweep: 0,
        phase: inflorescence.phase,
        radialBase: 0,
        baseLift: 0,
        laneDepth: 0,
        laneLift: 0,
        openDrift: 0,
        contactGuard: 0,
        inflorescence,
      }));
    }
    const layerCounts = distributePetals(count, m.layers);
    const specs: FieldPetalSpec[] = [];
    const usesUnfurl = m.budCurl > 0.01;
    const usesVortex = usesRoseVortex(preset);

    for (let layer = 0; layer < layerCounts.length; layer += 1) {
      const layerCount = layerCounts[layer];
      const inner = layer / Math.max(1, layerCounts.length - 1);
      const petalWidth = m.petalWidth * (1 - inner * m.layerScale * 0.62);
      const petalLength = m.petalLength * (1 - inner * m.layerScale);
      const thickness = resolvePetalThickness(petalLength);
      for (let index = 0; index < layerCount; index += 1) {
        const clearance = computePetalClearance({
          width: petalWidth,
          count: layerCount,
          index,
          layer,
          layers: layerCounts.length,
          headRadius: m.headRadius,
          thickness,
        });
        const layerDelay = inner * m.stagger * (usesUnfurl ? 0.92 : 0.72);
        const individualDelay = (index % 3) * 0.006 + Math.sin(index * 11.7) * 0.008;
        const innerClosure = usesUnfurl
          ? THREE.MathUtils.lerp(0.28, 0.7, m.innerCoil)
          : preset.id === 'lotus' ? 0.26 : 0.13;
        specs.push({
          angle: index / layerCount * Math.PI * 2 + layer * (0.55 + m.spiral) * GOLDEN_ANGLE,
          layer: inner,
          delay: Math.max(0, growth.openingStart + layerDelay + individualDelay),
          span: Math.max(0.18, growth.openingSpan - layerDelay * 0.72),
          openAngle: m.openAngle * (1 - inner * innerClosure),
          closedAngle: m.closedAngle + inner * 2,
          closedRoll: clearance.weaveYaw,
          roll: Math.sin(index * 8.13 + layer) * m.twist * DEG + clearance.weaveYaw,
          sweep: Math.sin(index * 2.41 + layer) * m.twist * 0.2 * DEG,
          phase: index * 0.73 + layer,
          radialBase: preset.kind === 'sunflower'
            ? Math.max(m.headRadius * 0.88, clearance.radialBase)
            : clearance.radialBase,
          baseLift: preset.kind === 'sunflower' ? 0.1 : clearance.layerLift,
          laneDepth: clearance.laneDepth,
          laneLift: clearance.laneLift,
          openDrift: clearance.openDrift * (preset.kind === 'sunflower' ? 0.55 : 1),
          contactGuard: thickness * 1.8 + petalWidth * 0.01,
          vortex: usesVortex ? {
            phase: index / layerCount,
            strength: m.innerCoil,
            morphOffset: 1,
          } : undefined,
        });
      }
    }
    return specs;
  }

  private createSepalSpecs(preset: FlowerPreset, growth: BloomGrowthProfile): FieldSepalSpec[] {
    const m = preset.morphology;
    if (m.sepalCount <= 0) return [];
    const placement = computeFloralAttachment({
      headRadius: m.headRadius,
      petalCount: m.petalCount,
      layers: m.layers,
      petalWidth: m.petalWidth,
      petalThickness: resolvePetalThickness(m.petalLength),
      radialSpread: growth.radialSpread,
      sepalLength: m.sepalLength,
      stemRadius: displayStemRadius(m.stemRadius),
      sunflower: preset.kind === 'sunflower',
    });
    const count = Math.min(m.sepalCount, preset.kind === 'sunflower' ? 10 : 6);
    const openAngle = preset.kind === 'sunflower' ? 138 : preset.id === 'lotus' ? 118 : 128;
    const delay = Math.max(0.015, growth.openingStart - (preset.kind === 'sunflower' ? 0.08 : 0.1));
    const span = Math.min(0.62, Math.max(0.3, growth.openingSpan * (preset.kind === 'sunflower' ? 0.9 : 0.72)));
    return Array.from({ length: count }, (_, index) => ({
      angle: index / count * Math.PI * 2 + GOLDEN_ANGLE * 0.2,
      delay,
      span,
      openAngle,
      closedAngle: placement.sepalClosedAngleDeg,
      closedRoll: (index % 2 === 0 ? -1 : 1) * 1.5 * DEG,
      roll: (index % 2 === 0 ? -1 : 1) * (preset.kind === 'sunflower' ? 5 : 3) * DEG,
      sweep: Math.sin(index * 1.93) * (preset.kind === 'sunflower' ? 4 : 2.5) * DEG,
      radialBase: placement.sepalRadius,
      baseLift: placement.sepalBaseLift,
      openDrift: placement.sepalOpenDrift,
      drop: placement.sepalDrop,
    }));
  }

  private buildSpeciesBatch(preset: FlowerPreset, plants: FieldPlant[]): SpeciesBatch {
    const m = preset.morphology;
    const growth = resolveGrowthProfile(preset);
    const architecture = resolveBotanicalArchitecture(preset);
    const petalInstances: FieldPetalInstance[] = [];
    const specCache = new Map<FieldLod, FieldPetalSpec[]>();
    for (const plant of plants) {
      let specs = specCache.get(plant.lod);
      if (!specs) {
        specs = this.createPetalSpecs(preset, visiblePetalCount(preset, plant.lod), growth);
        specCache.set(plant.lod, specs);
      }
      for (const spec of specs) petalInstances.push({ plant, spec });
    }

    const sepalSpecs = this.createSepalSpecs(preset, growth);
    const sepalInstances = plants.flatMap((plant) => sepalSpecs.map((spec) => ({ plant, spec })));
    const branchInstances = plants.flatMap((plant) =>
      Array.from({ length: plant.branchCount }, (_, slot) => ({ plant, slot })));
    const leafInstances = plants.flatMap((plant) => {
      const count = visibleLeafCount(plant);
      return Array.from({ length: count }, (_, slot) => ({ plant, slot, count }));
    });
    const stemGeometry = this.track(new THREE.CylinderGeometry(1, 1, 1, 8, 2));
    stemGeometry.translate(0, 0.5, 0);
    const stemMaterial = this.track(new THREE.MeshStandardNodeMaterial({ color: preset.colors.stem, roughness: 0.9 }));
    const stemMesh = this.prepareInstancedMesh(new THREE.InstancedMesh(
      stemGeometry,
      stemMaterial,
      plants.length * FIELD_STEM_CURVE_SEGMENTS,
    ));
    const pedicelMesh = this.prepareInstancedMesh(new THREE.InstancedMesh(stemGeometry, stemMaterial, plants.length));
    let branchMesh: THREE.InstancedMesh | undefined;
    if (branchInstances.length > 0) {
      branchMesh = this.prepareInstancedMesh(new THREE.InstancedMesh(stemGeometry, stemMaterial, branchInstances.length));
    }
    let leafStemMesh: THREE.InstancedMesh | undefined;
    let leafMesh: THREE.InstancedMesh | undefined;
    if (leafInstances.length > 0) {
      leafStemMesh = this.prepareInstancedMesh(new THREE.InstancedMesh(stemGeometry, stemMaterial, leafInstances.length));
      const leafGeometry = this.track(createLeafGeometry(architecture.leafShape));
      const leafColor = new THREE.Color(preset.colors.stem).lerp(new THREE.Color('#7ca26a'), 0.28);
      const leafMaterial = this.track(new THREE.MeshStandardNodeMaterial({
        color: leafColor,
        roughness: 0.82,
        side: THREE.DoubleSide,
      }));
      leafMesh = this.prepareInstancedMesh(new THREE.InstancedMesh(leafGeometry, leafMaterial, leafInstances.length));
    }

    const centreGeometry = preset.kind === 'sunflower'
      ? this.track(new THREE.CylinderGeometry(m.headRadius, m.headRadius * 0.88, 0.18, 28))
      : preset.kind === 'hydrangea'
        ? this.track(new THREE.SphereGeometry(0.32, 18, 12))
        : preset.kind === 'wisteria'
          ? this.track(new THREE.CylinderGeometry(0.018, 0.028, 1.34, 8, 4))
      : preset.id === 'lotus'
        ? this.track(new THREE.CylinderGeometry(0.22, 0.12, 0.28, 22))
        : this.track(new THREE.SphereGeometry(Math.max(0.075, m.headRadius * 0.54), 16, 9));
    const centreMaterial = this.track(new THREE.MeshStandardNodeMaterial({ color: preset.colors.center, roughness: 0.78 }));
    const centerMesh = this.prepareInstancedMesh(new THREE.InstancedMesh(centreGeometry, centreMaterial, plants.length));

    const usesUnfurl = m.budCurl > 0.01;
    const usesVortex = usesRoseVortex(preset);
    const petalGeometry = this.track(makeMorphTargetsRelative(createPetalGeometry({
      length: m.petalLength,
      width: m.petalWidth,
      shape: m.petalShape,
      taper: m.taper,
      notch: m.notch,
      waviness: m.waviness,
      cup: m.cup,
      curl: m.curl,
      fold: m.fold,
      seed: preset.id.length * 17,
      thickness: resolvePetalThickness(m.petalLength),
      growth,
      unfurl: usesUnfurl ? {
        budCurl: m.budCurl,
        wave: m.unfurl,
        innerCoil: m.innerCoil,
        layer: 0.52,
        sideCoil: usesVortex ? 1 : 0,
        sideCoilDirection: 1,
        sideCoilCounterCurve: 0.18,
      } : undefined,
      segments: { width: 5, length: 9 },
      colors: preset.colors,
    })));
    const petalMaterial = this.track(createPetalMaterial(preset.colors, m));
    const petalMesh = this.prepareInstancedMesh(new THREE.InstancedMesh(petalGeometry, petalMaterial, petalInstances.length));
    const petalMorphDriver = new THREE.Mesh(petalGeometry, petalMaterial);
    const presetBase = new THREE.Color(preset.colors.base);
    petalInstances.forEach(({ plant }, index) => {
      const target = new THREE.Color(plant.flowerColor);
      petalMesh.setColorAt(index, new THREE.Color(
        THREE.MathUtils.clamp(target.r / Math.max(0.025, presetBase.r), 0.18, 3.2),
        THREE.MathUtils.clamp(target.g / Math.max(0.025, presetBase.g), 0.18, 3.2),
        THREE.MathUtils.clamp(target.b / Math.max(0.025, presetBase.b), 0.18, 3.2),
      ));
    });
    if (petalMesh.instanceColor) petalMesh.instanceColor.needsUpdate = true;

    let sepalMesh: THREE.InstancedMesh | undefined;
    let sepalMorphDriver: THREE.Mesh | undefined;
    if (sepalInstances.length > 0) {
      const sepalColors = { ...preset.colors, base: preset.colors.stem, tip: '#72925b', reverse: '#294a35' };
      const sepalGeometry = this.track(makeMorphTargetsRelative(createPetalGeometry({
        length: m.sepalLength,
        width: Math.max(0.16, m.petalWidth * 0.34),
        shape: 'lance',
        taper: 0.78,
        notch: 0,
        waviness: 0.02,
        cup: 0.12,
        curl: 0.12,
        fold: 0.28,
        seed: 117,
        growth: { closedPetalLength: 0.96, closedPetalWidth: 0.82, basalEpinasty: 0.08, marginGrowth: 0.06 },
        segments: { width: 4, length: 7 },
        colors: sepalColors,
      })));
      const sepalMaterial = this.track(createPetalMaterial(sepalColors, { roughness: 0.85, sssStrength: 0.3 }));
      sepalMesh = this.prepareInstancedMesh(new THREE.InstancedMesh(sepalGeometry, sepalMaterial, sepalInstances.length));
      sepalMorphDriver = new THREE.Mesh(sepalGeometry, sepalMaterial);
    }

    return {
      preset,
      growth,
      curvature: resolveBotanicalCurvature(architecture.stemHabit, architecture.leafShape),
      plants,
      petals: petalInstances,
      sepals: sepalInstances,
      branches: branchInstances,
      leaves: leafInstances,
      stemMesh,
      pedicelMesh,
      branchMesh,
      leafStemMesh,
      leafMesh,
      centerMesh,
      petalMesh,
      petalMorphDriver,
      sepalMesh,
      sepalMorphDriver,
    };
  }

  private resolveHeadPose(batch: SpeciesBatch, plant: FieldPlant, time: number, localBloom: number): number {
    const wind = Math.min(1.4, Math.max(0, this.settings.wind));
    const turbulence = Math.min(1, Math.max(0, this.settings.windTurbulence ?? 0.58));
    const sunflowerLock = batch.preset.kind === 'sunflower' ? smoothstep(0.34, 0.68, localBloom) : 1;
    const trackedAzimuth = plant.headAzimuthDeg * DEG + Math.sin(time * 0.00012 + plant.windPhase) * 0.62;
    const lockedAzimuth = plant.headAzimuthDeg * DEG;
    const yaw = THREE.MathUtils.lerp(trackedAzimuth, lockedAzimuth, sunflowerLock);
    const tilt = Math.max(0, plant.headTiltDeg - (batch.preset.kind === 'sunflower' ? (1 - sunflowerLock) * 18 : 0)) * DEG;
    const pendantRaceme = batch.preset.kind === 'wisteria';
    const verticalPedicel = pendantRaceme ? 0 : Math.cos(tilt) * plant.pedicelWorld;
    const stemHeight = Math.max(0.16, plant.visualHeight - verticalPedicel);
    const supportTilt = plant.supportLeanDeg * DEG;
    const supportYaw = plant.supportLeanAzimuthDeg * DEG;
    const supportReach = Math.sin(supportTilt) * stemHeight;
    const windBend = sampleWindBend(time, plant.x, plant.z, plant.windPhase, wind, turbulence);
    const swayX = windBend.x * stemHeight * 0.045;
    const swayZ = windBend.z * stemHeight * 0.039;
    const pedicelFlex = windBend.gust * (2.1 + Math.min(4.2, plant.pedicelWorld * 18)) * DEG;
    const dynamicTilt = Math.max(0, tilt + pedicelFlex);
    const dynamicYaw = yaw + Math.sin(time * 0.00145 + plant.windPhase * 1.37) * wind * turbulence * 0.045;

    this.stemRootPose.set(plant.x, plant.groundY, plant.z);
    this.stemTipPose.set(
      plant.x + Math.sin(supportYaw) * supportReach + swayX * 0.72,
      plant.groundY + Math.cos(supportTilt) * stemHeight,
      plant.z + Math.cos(supportYaw) * supportReach + swayZ * 0.72,
    );
    const curveVariation = 0.78 + (Math.sin(plant.index * 2.17 + plant.windPhase) * 0.5 + 0.5) * 0.22;
    const gustFlex = THREE.MathUtils.clamp(1 + windBend.gust * wind * 0.28, 0.72, 1.38);
    this.currentStemCurveBend = stemHeight * batch.curvature.stemBendRatio * curveVariation * gustFlex;
    this.currentStemCurveAzimuth = plant.yaw
      + Math.sin(plant.index * 1.91 + plant.windPhase * 0.37) * 0.72
      + windBend.x * wind * 0.34;
    this.stemStart.copy(this.stemRootPose);
    this.stemEnd.copy(this.stemTipPose);
    this.direction.set(
      Math.sin(dynamicYaw) * (pendantRaceme ? 1 : Math.sin(dynamicTilt)),
      pendantRaceme ? 0 : Math.cos(dynamicTilt),
      Math.cos(dynamicYaw) * (pendantRaceme ? 1 : Math.sin(dynamicTilt)),
    );
    this.headPosition.copy(this.stemTipPose).addScaledVector(this.direction, plant.pedicelWorld);
    this.yawQuaternion.setFromAxisAngle(this.up, dynamicYaw);
    this.tiltQuaternion.setFromAxisAngle(this.right, pendantRaceme ? 0 : dynamicTilt);
    this.headQuaternion.copy(this.yawQuaternion).multiply(this.tiltQuaternion);
    return stemHeight;
  }

  private stemRadius(batch: SpeciesBatch, plant: FieldPlant): number {
    const m = batch.preset.morphology;
    const botanicalRadius = displayStemRadius(m.stemRadius)
      * THREE.MathUtils.clamp(plant.visualHeight / Math.max(0.3, m.stemHeight), 0.38, 2.3);
    const stemScale = THREE.MathUtils.clamp(plant.stemScale, 0.35, 2.2);
    const adjustedRadius = botanicalRadius * stemScale;
    if (plant.layoutZone === 'tunnel') return Math.min(displayStemRadius(0.062, stemScale), adjustedRadius * 0.58);
    if (plant.layoutZone === 'wall') return Math.min(displayStemRadius(0.078, stemScale), adjustedRadius * 0.72);
    return adjustedRadius;
  }

  private setCylinderBetween(
    mesh: THREE.InstancedMesh,
    index: number,
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
  ): void {
    this.direction.copy(end).sub(start);
    const length = Math.max(0.001, this.direction.length());
    this.transform.position.copy(start);
    this.transform.quaternion.setFromUnitVectors(this.up, this.direction.normalize());
    this.transform.scale.set(radius, length, radius);
    this.transform.updateMatrix();
    mesh.setMatrixAt(index, this.transform.matrix);
  }

  private sampleCurrentStemCurve(progress: number, out: THREE.Vector3): THREE.Vector3 {
    return sampleStemCurvePoint(
      this.stemRootPose,
      this.stemTipPose,
      progress,
      this.currentStemCurveBend,
      this.currentStemCurveAzimuth,
      out,
    );
  }

  private setCurvedStem(batch: SpeciesBatch, plantIndex: number, radius: number): void {
    for (let segment = 0; segment < FIELD_STEM_CURVE_SEGMENTS; segment += 1) {
      const startT = segment / FIELD_STEM_CURVE_SEGMENTS;
      const endT = (segment + 1) / FIELD_STEM_CURVE_SEGMENTS;
      this.sampleCurrentStemCurve(startT, this.curveSegmentStart);
      this.sampleCurrentStemCurve(endT, this.curveSegmentEnd);
      const taperedRadius = radius * THREE.MathUtils.lerp(1, 0.74, (startT + endT) * 0.5);
      this.setCylinderBetween(
        batch.stemMesh,
        plantIndex * FIELD_STEM_CURVE_SEGMENTS + segment,
        this.curveSegmentStart,
        this.curveSegmentEnd,
        taperedRadius,
      );
    }
  }

  private setHeadMatrix(batch: SpeciesBatch, plant: FieldPlant, time: number, localBloom: number): void {
    const m = batch.preset.morphology;
    this.resolveHeadPose(batch, plant, time, localBloom);

    this.transform.position.copy(this.headPosition);
    this.transform.quaternion.copy(this.headQuaternion);
    const sizeScale = plant.visualFlowerDiameter / deployedHeadDiameter(batch.preset);
    const headScale = sizeScale * m.flowerScale * evaluateHeadGrowth(batch.growth, localBloom);
    this.transform.scale.setScalar(headScale);
    this.transform.updateMatrix();
    this.headMatrix.copy(this.transform.matrix);
  }

  private updatePlantMeshes(batch: SpeciesBatch, time: number): void {
    batch.plants.forEach((plant, index) => {
      const localBloom = evaluateFieldBloom(this.currentProgress, plant.bloomDelay);
      this.resolveHeadPose(batch, plant, time, localBloom);
      const radius = this.stemRadius(batch, plant);
      this.setCurvedStem(batch, index, radius);
      this.setCylinderBetween(batch.pedicelMesh, index, this.stemTipPose, this.headPosition, radius * 0.66);

      this.setHeadMatrix(batch, plant, time, localBloom);
      const reveal = evaluateReproductiveReveal(batch.growth, localBloom);
      this.transform.position.set(
        0,
        batch.preset.kind === 'sunflower'
          ? 0.04
          : batch.preset.kind === 'hydrangea'
            ? 0.05
            : batch.preset.kind === 'wisteria'
              ? -0.62
              : batch.preset.id === 'lotus' ? 0.16 : 0.07,
        0,
      );
      this.transform.rotation.set(0, 0, 0);
      const centreReveal = ['sunflower', 'hydrangea', 'wisteria'].includes(batch.preset.kind)
        ? 1
        : THREE.MathUtils.lerp(0.42, 1, reveal);
      this.transform.scale.setScalar(centreReveal);
      this.transform.updateMatrix();
      this.workMatrix.multiplyMatrices(this.headMatrix, this.transform.matrix);
      batch.centerMesh.setMatrixAt(index, this.workMatrix);
    });

    if (batch.branchMesh) {
      const architecture = resolveBotanicalArchitecture(batch.preset);
      const habitLength = architecture.stemHabit === 'woody-branch'
        ? 0.34
        : architecture.stemHabit === 'shrub' ? 0.22 : 0.14;
      batch.branches.forEach(({ plant, slot }, index) => {
        const localBloom = evaluateFieldBloom(this.currentProgress, plant.bloomDelay);
        this.resolveHeadPose(batch, plant, time, localBloom);
        const ratio = 0.26 + (slot + 1) / (plant.branchCount + 1) * 0.56;
        const branchWind = sampleWindBend(
          time,
          plant.x,
          plant.z,
          plant.windPhase + slot * 0.73,
          this.settings.wind,
          this.settings.windTurbulence ?? 0.58,
        );
        const angle = plant.yaw + slot * GOLDEN_ANGLE + branchWind.x * 0.035;
        const branchAngle = plant.branchAngleDeg * DEG + branchWind.gust * 0.055;
        const length = plant.visualHeight * habitLength * (0.82 + (slot % 3) * 0.09);
        this.sampleCurrentStemCurve(ratio, this.stemStart);
        this.stemEnd.set(
          this.stemStart.x + Math.sin(angle) * Math.sin(branchAngle) * length,
          this.stemStart.y + Math.cos(branchAngle) * length,
          this.stemStart.z + Math.cos(angle) * Math.sin(branchAngle) * length,
        );
        this.setCylinderBetween(batch.branchMesh!, index, this.stemStart, this.stemEnd, this.stemRadius(batch, plant) * 0.54);
      });
      batch.branchMesh.instanceMatrix.needsUpdate = true;
    }
    batch.stemMesh.instanceMatrix.needsUpdate = true;
    batch.pedicelMesh.instanceMatrix.needsUpdate = true;
    batch.centerMesh.instanceMatrix.needsUpdate = true;
  }

  private updateLeaves(batch: SpeciesBatch, time: number): void {
    if (!batch.leafMesh || !batch.leafStemMesh) return;
    const architecture = resolveBotanicalArchitecture(batch.preset);
    batch.leaves.forEach(({ plant, slot, count }, index) => {
      const localBloom = evaluateFieldBloom(this.currentProgress, plant.bloomDelay);
      this.resolveHeadPose(batch, plant, time, localBloom);
      const opposite = architecture.leafArrangement === 'opposite';
      const leafNode = opposite ? Math.floor(slot / 2) : slot;
      const leafNodeCount = opposite ? Math.ceil(count / 2) : count;
      let angle = opposite
        ? plant.yaw + leafNode * GOLDEN_ANGLE + (slot % 2) * Math.PI
        : plant.yaw + slot * GOLDEN_ANGLE;
      const lengthWorld = botanicalLengthToWorld(architecture.leafLengthCm) * plant.leafScale;
      const widthWorld = botanicalLengthToWorld(architecture.leafWidthCm) * plant.leafScale;
      let tilt = -0.58;
      let ratio = 0.24 + leafNode / Math.max(1, leafNodeCount - 1) * 0.5;
      let petioleLength = Math.max(0.025, Math.min(0.16, widthWorld * 0.52));
      let separatePetiole = false;

      if (architecture.leafArrangement === 'basal') {
        ratio = 0.06 + slot / Math.max(1, count) * 0.12;
        tilt = -1.02;
      } else if (architecture.leafArrangement === 'clustered') {
        ratio = 0.62 + slot / Math.max(1, count) * 0.25;
        tilt = -0.62;
      } else if (architecture.leafArrangement === 'whorled') {
        ratio = 0.18 + slot / Math.max(1, count - 1) * 0.64;
        tilt = -0.48;
      }

      if (architecture.leafArrangement === 'separate-petiole') {
        separatePetiole = true;
        const reach = plant.visualHeight * (0.18 + slot * 0.055);
        this.stemStart.set(plant.x, plant.groundY, plant.z);
        this.stemEnd.set(
          plant.x + Math.sin(angle) * reach,
          plant.groundY + plant.visualHeight * (0.42 + slot * 0.1),
          plant.z + Math.cos(angle) * reach,
        );
        tilt = 0.04 + Math.sin(slot * 2.1) * 0.04;
      } else if (architecture.leafArrangement === 'clustered' && plant.branchCount > 0) {
        const branchSlot = slot % plant.branchCount;
        const branchRatio = 0.26 + (branchSlot + 1) / (plant.branchCount + 1) * 0.56;
        const branchWind = sampleWindBend(
          time,
          plant.x,
          plant.z,
          plant.windPhase + branchSlot * 0.73,
          this.settings.wind,
          this.settings.windTurbulence ?? 0.58,
        );
        angle = plant.yaw + branchSlot * GOLDEN_ANGLE + branchWind.x * 0.035;
        const branchAngle = plant.branchAngleDeg * DEG + branchWind.gust * 0.055;
        const branchLength = plant.visualHeight * 0.34 * (0.82 + (branchSlot % 3) * 0.09);
        this.sampleCurrentStemCurve(branchRatio, this.stemStart);
        const branchBaseX = this.stemStart.x;
        const branchBaseY = this.stemStart.y;
        const branchBaseZ = this.stemStart.z;
        this.stemStart.set(
          branchBaseX + Math.sin(angle) * Math.sin(branchAngle) * branchLength,
          branchBaseY + Math.cos(branchAngle) * branchLength,
          branchBaseZ + Math.cos(angle) * Math.sin(branchAngle) * branchLength,
        );
        petioleLength = Math.max(0.025, Math.min(0.18, widthWorld * 0.58));
        setLeafGrowthDirection(angle, -tilt, this.outward);
        this.stemEnd.copy(this.stemStart).addScaledVector(this.outward, petioleLength);
      } else {
        this.sampleCurrentStemCurve(ratio, this.stemStart);
        setLeafGrowthDirection(angle, -tilt, this.outward);
        this.stemEnd.copy(this.stemStart).addScaledVector(this.outward, petioleLength);
      }

      const leafWind = sampleWindBend(
        time,
        this.stemEnd.x,
        this.stemEnd.z,
        plant.windPhase + slot * 0.91,
        this.settings.wind,
        this.settings.windTurbulence ?? 0.58,
      );
      const leafFlutter = Math.sin(time * 0.0032 + plant.windPhase * 1.7 + slot * 1.13)
        * this.settings.wind
        * (0.035 + (this.settings.windTurbulence ?? 0.58) * 0.085);
      if (separatePetiole) {
        this.stemEnd.x += leafWind.x * lengthWorld * 0.09;
        this.stemEnd.z += leafWind.z * lengthWorld * 0.09;
      } else {
        const elevation = -(tilt + leafWind.z * 0.12 + leafFlutter);
        setLeafGrowthDirection(angle + leafWind.x * 0.075, elevation, this.outward);
        this.stemEnd.copy(this.stemStart).addScaledVector(this.outward, petioleLength);
      }
      this.setCylinderBetween(batch.leafStemMesh!, index, this.stemStart, this.stemEnd, this.stemRadius(batch, plant) * 0.22);
      this.transform.position.copy(this.stemEnd);
      const roll = Math.sin(slot * 2.47) * 0.08 - leafWind.x * 0.2 + leafFlutter * 0.62;
      if (architecture.leafShape === 'peltate-orbicular') {
        this.leafAttachmentFrame.setPeltateQuaternion(
          this.stemStart,
          this.stemEnd,
          angle,
          roll,
          this.transform.quaternion,
        );
      } else {
        this.leafAttachmentFrame.setBladeQuaternion(
          this.stemStart,
          this.stemEnd,
          this.up,
          roll,
          this.transform.quaternion,
        );
      }
      this.transform.scale.set(Math.max(0.025, widthWorld), 1, Math.max(0.04, lengthWorld));
      this.transform.updateMatrix();
      batch.leafMesh!.setMatrixAt(index, this.transform.matrix);
    });
    batch.leafStemMesh.instanceMatrix.needsUpdate = true;
    batch.leafMesh.instanceMatrix.needsUpdate = true;
  }

  private updatePetals(batch: SpeciesBatch, time: number): void {
    const m = batch.preset.morphology;
    const advanced = m.budCurl > 0.01;
    const subtleTime = time * 0.001;
    batch.petals.forEach(({ plant, spec }, index) => {
      const localBloom = evaluateFieldBloom(this.currentProgress, plant.bloomDelay);
      this.setHeadMatrix(batch, plant, time, localBloom);
      const local = remapBloom(localBloom, spec.delay, spec.span);
      const unfurl = advanced ? evaluatePetalUnfurl(local, spec.layer, m.unfurl) : undefined;
      const vortex = spec.vortex
        ? evaluateRoseVortex(local, spec.layer, spec.vortex.phase, spec.vortex.strength)
        : undefined;
      const deployment = unfurl?.deployment ?? local;
      const articulation = unfurl ? unfurl.unfurl * 0.72 + unfurl.reflex * 0.28 : local;
      const livingMotion = Math.sin(subtleTime * 0.52 + spec.phase + plant.windPhase) * 0.48 * smoothstep(0.78, 1, localBloom);
      const petalExposure = smoothstep(0.1, 0.82, localBloom);
      const petalFlutter = (
        Math.sin(subtleTime * (2.1 + (this.settings.windTurbulence ?? 0.58) * 1.8) + spec.phase * 1.7 + plant.windPhase) * 1.7
        + Math.sin(subtleTime * 0.64 + spec.angle * 2.3 + plant.windPhase) * 0.65
      ) * this.settings.wind * petalExposure;
      const clearance = smoothstep(0.12, 0.88, deployment);
      const contactSeparation = unfurl?.contactSeparation ?? 0;

      if (spec.inflorescence) {
        const inflorescence = spec.inflorescence;
        const clusterSpread = THREE.MathUtils.lerp(0.62, 1, smoothstep(0, batch.growth.swellingEnd, localBloom));
        this.radial.position.set(
          inflorescence.originX * clusterSpread,
          inflorescence.originY * clusterSpread,
          inflorescence.originZ * clusterSpread,
        );
        this.outward.set(inflorescence.normalX, inflorescence.normalY, inflorescence.normalZ).normalize();
        this.radial.quaternion.setFromUnitVectors(this.forward, this.outward);
        this.radial.scale.set(1, 1, 1);
        this.radial.updateMatrix();
        this.hinge.position.set(0, 0, 0);
        this.hinge.rotation.set(
          THREE.MathUtils.lerp(-1.12, 0.04, smoothstep(0.02, 0.96, local)),
          0,
          inflorescence.angle + petalFlutter * DEG * 0.12,
        );
        this.hinge.scale.set(1, 1, 1);
        this.hinge.updateMatrix();
        this.meshPose.position.set(0, 0, 0);
        this.meshPose.rotation.set(0, Math.sin(subtleTime * 0.47 + spec.phase) * 0.025, 0);
        const organScale = inflorescence.scale * THREE.MathUtils.lerp(0.74, 1, local);
        this.meshPose.scale.setScalar(organScale);
        this.meshPose.updateMatrix();
        this.workMatrix.multiplyMatrices(this.headMatrix, this.radial.matrix);
        this.petalMatrix.multiplyMatrices(this.workMatrix, this.hinge.matrix);
        this.petalMatrix.multiply(this.meshPose.matrix);
        batch.petalMesh.setMatrixAt(index, this.petalMatrix);
        batch.petalMorphDriver.morphTargetInfluences![0] = local;
        batch.petalMesh.setMorphAt(index, batch.petalMorphDriver);
        return;
      }

      this.radial.position.set(0, 0, 0);
      this.radial.rotation.set(0, spec.angle, 0);
      this.radial.scale.set(1, 1, 1);
      this.radial.updateMatrix();
      this.hinge.position.set(
        0,
        spec.baseLift + spec.laneLift * THREE.MathUtils.lerp(0.38, 1 + contactSeparation * 0.26, clearance),
        spec.radialBase
          + spec.laneDepth * (1 + contactSeparation * 0.45)
          + spec.openDrift * batch.growth.radialSpread * clearance
          + spec.contactGuard * contactSeparation
          - (vortex?.radialTuck ?? 0),
      );
      this.hinge.position.y += vortex?.lift ?? 0;
      this.hinge.rotation.set(
        (THREE.MathUtils.lerp(spec.closedAngle, spec.openAngle, deployment) + livingMotion + petalFlutter) * DEG,
        0,
        spec.sweep * articulation + petalFlutter * DEG * 0.34 + (vortex?.tangentialSweep ?? 0),
      );
      this.hinge.scale.set(1, 1, 1);
      this.hinge.updateMatrix();
      this.meshPose.position.set(0, 0, 0);
      this.meshPose.rotation.set(
        0,
        THREE.MathUtils.lerp(spec.closedRoll, spec.roll, articulation)
          + petalFlutter * DEG * 0.18
          + (vortex?.swirlYaw ?? 0),
        0,
      );
      this.meshPose.scale.set(1, 1, 1);
      this.meshPose.updateMatrix();

      this.workMatrix.multiplyMatrices(this.headMatrix, this.radial.matrix);
      this.petalMatrix.multiplyMatrices(this.workMatrix, this.hinge.matrix);
      this.petalMatrix.multiply(this.meshPose.matrix);
      batch.petalMesh.setMatrixAt(index, this.petalMatrix);
      if (advanced && unfurl) {
        const morphOffset = spec.vortex?.morphOffset ?? 0;
        if (spec.vortex) batch.petalMorphDriver.morphTargetInfluences![0] = vortex?.sideCoil ?? 0;
        batch.petalMorphDriver.morphTargetInfluences![morphOffset] = unfurl.weights[0];
        batch.petalMorphDriver.morphTargetInfluences![morphOffset + 1] = unfurl.weights[1];
        batch.petalMorphDriver.morphTargetInfluences![morphOffset + 2] = unfurl.weights[2];
      } else {
        batch.petalMorphDriver.morphTargetInfluences![0] = local;
      }
      batch.petalMesh.setMorphAt(index, batch.petalMorphDriver);
    });
    batch.petalMesh.instanceMatrix.needsUpdate = true;
    if (batch.petalMesh.morphTexture) batch.petalMesh.morphTexture.needsUpdate = true;
  }

  private updateSepals(batch: SpeciesBatch, time: number): void {
    if (!batch.sepalMesh || !batch.sepalMorphDriver) return;
    batch.sepals.forEach(({ plant, spec }, index) => {
      const localBloom = evaluateFieldBloom(this.currentProgress, plant.bloomDelay);
      this.setHeadMatrix(batch, plant, time, localBloom);
      const local = remapBloom(localBloom, spec.delay, spec.span);
      const release = smoothstep(0.08, 0.92, local);
      this.radial.position.set(0, 0, 0);
      this.radial.rotation.set(0, spec.angle, 0);
      this.radial.scale.set(1, 1, 1);
      this.radial.updateMatrix();
      this.hinge.position.set(0, spec.baseLift - spec.drop * release, spec.radialBase + spec.openDrift * release);
      this.hinge.rotation.set(THREE.MathUtils.lerp(spec.closedAngle, spec.openAngle, local) * DEG, 0, spec.sweep * local);
      this.hinge.scale.set(1, 1, 1);
      this.hinge.updateMatrix();
      this.meshPose.position.set(0, 0, 0);
      this.meshPose.rotation.set(0, THREE.MathUtils.lerp(spec.closedRoll, spec.roll, local), 0);
      this.meshPose.scale.set(1, 1, 1);
      this.meshPose.updateMatrix();
      this.workMatrix.multiplyMatrices(this.headMatrix, this.radial.matrix);
      this.petalMatrix.multiplyMatrices(this.workMatrix, this.hinge.matrix);
      this.petalMatrix.multiply(this.meshPose.matrix);
      batch.sepalMesh!.setMatrixAt(index, this.petalMatrix);
      batch.sepalMorphDriver!.morphTargetInfluences![0] = local;
      batch.sepalMesh!.setMorphAt(index, batch.sepalMorphDriver!);
    });
    batch.sepalMesh.instanceMatrix.needsUpdate = true;
    if (batch.sepalMesh.morphTexture) batch.sepalMesh.morphTexture.needsUpdate = true;
  }

  private currentProgress = 0;

  update(progress: number, time: number): void {
    this.currentProgress = Math.min(1, Math.max(0, progress));
    this.terrain.update(time);
    for (const batch of this.batches) {
      this.updatePlantMeshes(batch, time);
      this.updateLeaves(batch, time);
      this.updatePetals(batch, time);
      this.updateSepals(batch, time);
    }
  }

  dispose(): void {
    this.terrain.dispose();
    this.root.removeFromParent();
    this.disposables.forEach((item) => item.dispose());
    this.disposables.clear();
  }
}

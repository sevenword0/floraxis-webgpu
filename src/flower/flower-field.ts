import * as THREE from 'three/webgpu';
import type { Bloomable, BloomGrowthProfile, FieldSettings, FlowerPreset } from '../types';
import { evaluateHeadGrowth, evaluateReproductiveReveal, resolveGrowthProfile } from '../growth-model';
import { remapBloom, smoothstep } from '../utils';
import { createPetalGeometry, createPetalMaterial, resolvePetalThickness } from './petal-geometry';
import { computeFloralAttachment, computePetalClearance } from './petal-layout';
import { evaluatePetalUnfurl } from './petal-unfurl';
import { evaluateFieldBloom, generateFieldLayout, type FieldLod, type FieldPlant } from './flower-field-layout';

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

interface SpeciesBatch {
  preset: FlowerPreset;
  growth: BloomGrowthProfile;
  plants: FieldPlant[];
  petals: FieldPetalInstance[];
  sepals: FieldSepalInstance[];
  stemMesh: THREE.InstancedMesh;
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
};

const LOD_FACTOR: Record<FieldLod, number> = { near: 1, mid: 0.72, far: 0.48 };

const minimumPetals = (preset: FlowerPreset): number => {
  if (preset.morphology.petalCount <= 6) return preset.morphology.petalCount;
  if (preset.id === 'rose') return 10;
  if (preset.id === 'lotus') return 8;
  if (preset.kind === 'sunflower') return 12;
  return 5;
};

const visiblePetalCount = (preset: FlowerPreset, lod: FieldLod): number => {
  const cap = Math.min(preset.morphology.petalCount, PETAL_CAPS[preset.id] ?? 18);
  return Math.max(minimumPetals(preset), Math.round(cap * LOD_FACTOR[lod]));
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

  private readonly settings: FieldSettings;
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

  constructor(settings: FieldSettings, presets: FlowerPreset[]) {
    this.settings = { ...settings, speciesIds: [...settings.speciesIds] };
    this.root.name = 'preset-flower-field';
    const presetById = new Map(presets.map((preset) => [preset.id, preset]));
    const plants = generateFieldLayout(settings, presets.map((preset) => preset.id));
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

  private createPetalSpecs(preset: FlowerPreset, count: number, growth: BloomGrowthProfile): FieldPetalSpec[] {
    const m = preset.morphology;
    const layerCounts = distributePetals(count, m.layers);
    const specs: FieldPetalSpec[] = [];
    const usesUnfurl = m.budCurl > 0.01;

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
      stemRadius: m.stemRadius,
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
      closedAngle: preset.kind === 'sunflower' ? -8 : -12,
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
    const stemGeometry = this.track(new THREE.CylinderGeometry(0.72, 1, 1, 8, 2));
    stemGeometry.translate(0, 0.5, 0);
    const stemMaterial = this.track(new THREE.MeshStandardNodeMaterial({ color: preset.colors.stem, roughness: 0.9 }));
    const stemMesh = this.prepareInstancedMesh(new THREE.InstancedMesh(stemGeometry, stemMaterial, plants.length));

    const centreGeometry = preset.kind === 'sunflower'
      ? this.track(new THREE.CylinderGeometry(m.headRadius, m.headRadius * 0.88, 0.18, 28))
      : preset.id === 'lotus'
        ? this.track(new THREE.CylinderGeometry(0.22, 0.12, 0.28, 22))
        : this.track(new THREE.SphereGeometry(Math.max(0.075, m.headRadius * 0.54), 16, 9));
    const centreMaterial = this.track(new THREE.MeshStandardNodeMaterial({ color: preset.colors.center, roughness: 0.78 }));
    const centerMesh = this.prepareInstancedMesh(new THREE.InstancedMesh(centreGeometry, centreMaterial, plants.length));

    const usesUnfurl = m.budCurl > 0.01;
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
      } : undefined,
      segments: { width: 5, length: 9 },
      colors: preset.colors,
    })));
    const petalMaterial = this.track(createPetalMaterial(preset.colors, m));
    const petalMesh = this.prepareInstancedMesh(new THREE.InstancedMesh(petalGeometry, petalMaterial, petalInstances.length));
    const petalMorphDriver = new THREE.Mesh(petalGeometry, petalMaterial);

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
      plants,
      petals: petalInstances,
      sepals: sepalInstances,
      stemMesh,
      centerMesh,
      petalMesh,
      petalMorphDriver,
      sepalMesh,
      sepalMorphDriver,
    };
  }

  private setHeadMatrix(batch: SpeciesBatch, plant: FieldPlant, time: number, localBloom: number): void {
    const m = batch.preset.morphology;
    const stemHeight = m.stemHeight * plant.stemScale * plant.scale;
    const wind = Math.min(1.4, Math.max(0, this.settings.wind));
    const pulse = time * 0.00058;
    const swayX = Math.sin(pulse + plant.windPhase) * wind * stemHeight * 0.034;
    const swayZ = Math.cos(pulse * 0.83 + plant.windPhase * 1.31) * wind * stemHeight * 0.025;

    this.transform.position.set(plant.x + swayX, stemHeight, plant.z + swayZ);
    this.transform.rotation.set(swayZ / Math.max(0.3, stemHeight) * 0.65, plant.yaw, -swayX / Math.max(0.3, stemHeight) * 0.65);
    const headScale = plant.scale * m.flowerScale * evaluateHeadGrowth(batch.growth, localBloom);
    this.transform.scale.setScalar(headScale);
    this.transform.updateMatrix();
    this.headMatrix.copy(this.transform.matrix);
  }

  private updatePlantMeshes(batch: SpeciesBatch, time: number): void {
    const m = batch.preset.morphology;
    batch.plants.forEach((plant, index) => {
      const localBloom = evaluateFieldBloom(this.currentProgress, plant.bloomDelay);
      const stemHeight = m.stemHeight * plant.stemScale * plant.scale;
      const wind = Math.min(1.4, Math.max(0, this.settings.wind));
      const pulse = time * 0.00058;
      const swayX = Math.sin(pulse + plant.windPhase) * wind * stemHeight * 0.034;
      const swayZ = Math.cos(pulse * 0.83 + plant.windPhase * 1.31) * wind * stemHeight * 0.025;
      this.direction.set(swayX, stemHeight, swayZ);
      const length = this.direction.length();
      this.transform.position.set(plant.x, 0, plant.z);
      this.transform.quaternion.setFromUnitVectors(this.up, this.direction.normalize());
      this.transform.scale.set(m.stemRadius * plant.scale, length, m.stemRadius * plant.scale);
      this.transform.updateMatrix();
      batch.stemMesh.setMatrixAt(index, this.transform.matrix);

      this.setHeadMatrix(batch, plant, time, localBloom);
      const reveal = evaluateReproductiveReveal(batch.growth, localBloom);
      this.transform.position.set(0, batch.preset.kind === 'sunflower' ? 0.04 : batch.preset.id === 'lotus' ? 0.16 : 0.07, 0);
      this.transform.rotation.set(0, 0, 0);
      const centreReveal = batch.preset.kind === 'sunflower' ? 1 : THREE.MathUtils.lerp(0.42, 1, reveal);
      this.transform.scale.setScalar(centreReveal);
      this.transform.updateMatrix();
      this.workMatrix.multiplyMatrices(this.headMatrix, this.transform.matrix);
      batch.centerMesh.setMatrixAt(index, this.workMatrix);
    });
    batch.stemMesh.instanceMatrix.needsUpdate = true;
    batch.centerMesh.instanceMatrix.needsUpdate = true;
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
      const deployment = unfurl?.deployment ?? local;
      const articulation = unfurl ? unfurl.unfurl * 0.72 + unfurl.reflex * 0.28 : local;
      const livingMotion = Math.sin(subtleTime * 0.52 + spec.phase + plant.windPhase) * 0.48 * smoothstep(0.78, 1, localBloom);
      const clearance = smoothstep(0.12, 0.88, deployment);
      const contactSeparation = unfurl?.contactSeparation ?? 0;

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
          + spec.contactGuard * contactSeparation,
      );
      this.hinge.rotation.set((THREE.MathUtils.lerp(spec.closedAngle, spec.openAngle, deployment) + livingMotion) * DEG, 0, spec.sweep * articulation);
      this.hinge.scale.set(1, 1, 1);
      this.hinge.updateMatrix();
      this.meshPose.position.set(0, 0, 0);
      this.meshPose.rotation.set(0, THREE.MathUtils.lerp(spec.closedRoll, spec.roll, articulation), 0);
      this.meshPose.scale.set(1, 1, 1);
      this.meshPose.updateMatrix();

      this.workMatrix.multiplyMatrices(this.headMatrix, this.radial.matrix);
      this.petalMatrix.multiplyMatrices(this.workMatrix, this.hinge.matrix);
      this.petalMatrix.multiply(this.meshPose.matrix);
      batch.petalMesh.setMatrixAt(index, this.petalMatrix);
      if (advanced && unfurl) {
        batch.petalMorphDriver.morphTargetInfluences![0] = unfurl.weights[0];
        batch.petalMorphDriver.morphTargetInfluences![1] = unfurl.weights[1];
        batch.petalMorphDriver.morphTargetInfluences![2] = unfurl.weights[2];
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
    for (const batch of this.batches) {
      this.updatePlantMeshes(batch, time);
      this.updatePetals(batch, time);
      this.updateSepals(batch, time);
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.disposables.forEach((item) => item.dispose());
    this.disposables.clear();
  }
}

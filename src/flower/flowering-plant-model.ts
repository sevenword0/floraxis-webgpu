import * as THREE from 'three/webgpu';
import { resolveBotanicalArchitecture } from '../data/botanical-architecture';
import type { Bloomable, FlowerPreset } from '../types';
import { FlowerModel } from './flower-model';
import { generateFloweringShootSpecs, type FloweringShootSpec } from './flowering-shoot-layout';

const DEG = Math.PI / 180;

interface FloweringShootModel {
  model: FlowerModel;
  spec: FloweringShootSpec;
}

/** Whole-plant specimen made from flower-bearing shoots sharing one root crown. */
export class FloweringPlantModel implements Bloomable {
  readonly root = new THREE.Group();
  readonly petalCount: number;

  private readonly shoots: FloweringShootModel[];

  constructor(preset: FlowerPreset) {
    const architecture = resolveBotanicalArchitecture(preset);
    const specs = generateFloweringShootSpecs(architecture, 'near');
    const up = new THREE.Vector3(0, 1, 0);
    this.root.name = `whole-plant-${preset.id}`;
    this.shoots = specs.map((spec) => {
      const isCrown = spec.shootCount > 1;
      const hydrangeaOuter = preset.kind === 'hydrangea' && spec.shootIndex > 0;
      // Specimen mode magnifies individual hydrangea florets for study. Lower,
      // smaller, more divergent outer heads compensate for that magnification
      // so the five terminal inflorescences meet without interpenetrating.
      const displayHeightScale = spec.heightScale * (hydrangeaOuter ? 0.84 : 1);
      const displayFlowerScale = spec.flowerScale * (hydrangeaOuter ? 0.82 : 1);
      const displayLeanDeg = Math.min(40, spec.leanDeg * (hydrangeaOuter ? 1.55 : 1));
      const shootPreset: FlowerPreset = isCrown ? {
        ...preset,
        morphology: {
          ...preset.morphology,
          petalCount: hydrangeaOuter ? Math.min(64, preset.morphology.petalCount) : preset.morphology.petalCount,
          stemHeight: preset.morphology.stemHeight * displayHeightScale,
          stemRadius: preset.morphology.stemRadius * (0.9 + displayHeightScale * 0.1),
          flowerScale: preset.morphology.flowerScale * displayFlowerScale,
        },
        architecture: {
          ...architecture,
          floweringShootCount: 1,
          basalShootSpreadDeg: 0,
          branchCount: Math.min(2, Math.ceil(architecture.branchCount / spec.shootCount)),
          leafCount: Math.max(2, Math.ceil(architecture.leafCount * 0.48)),
        },
      } : preset;
      const model = new FlowerModel(shootPreset);
      if (displayLeanDeg > 0.001) {
        const lean = displayLeanDeg * DEG;
        const azimuth = spec.azimuthDeg * DEG;
        const direction = new THREE.Vector3(
          Math.sin(azimuth) * Math.sin(lean),
          Math.cos(lean),
          Math.cos(azimuth) * Math.sin(lean),
        );
        model.root.quaternion.setFromUnitVectors(up, direction);
      }
      this.root.add(model.root);
      return { model, spec };
    });
    this.petalCount = this.shoots.reduce((sum, shoot) => sum + shoot.model.petalCount, 0);
  }

  update(progress: number, time: number): void {
    for (const { model, spec } of this.shoots) {
      const localProgress = spec.bloomOffset <= 0
        ? progress
        : Math.min(1, Math.max(0, (progress - spec.bloomOffset) / (1 - spec.bloomOffset)));
      model.update(localProgress, time + spec.timeOffset);
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const { model } of this.shoots) model.dispose();
  }
}

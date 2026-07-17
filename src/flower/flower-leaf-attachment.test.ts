import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { PRESET_BY_ID } from '../data/presets';
import { FlowerModel } from './flower-model';

const requirePreset = (id: string) => {
  const preset = PRESET_BY_ID.get(id);
  if (!preset) throw new Error(`Missing preset: ${id}`);
  return preset;
};

const requireObject = (root: THREE.Object3D, name: string): THREE.Object3D => {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`Missing object: ${name}`);
  return object;
};

const worldPoint = (object: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 => (
  object.localToWorld(new THREE.Vector3(x, y, z))
);

describe('flower-model leaf insertion', () => {
  it('places the simple blade origin at the petiole tip and continues its axis', () => {
    const model = new FlowerModel(requirePreset('tulip'));
    model.root.updateMatrixWorld(true);
    const petiole = requireObject(model.root, 'leaf-petiole-0');
    const blade = requireObject(model.root, 'leaf-blade-0');
    const petioleBase = worldPoint(petiole, 0, 0, 0);
    const petioleTip = worldPoint(petiole, 0, 1, 0);
    const bladeBase = worldPoint(blade, 0, 0, 0);
    const bladeForward = worldPoint(blade, 0, 0, 0.1).sub(bladeBase).normalize();

    expect(bladeBase.distanceTo(petioleTip)).toBeLessThan(1e-6);
    expect(bladeForward.angleTo(petioleTip.clone().sub(petioleBase).normalize())).toBeLessThan(1e-6);
    model.dispose();
  });

  it('places a peltate blade centre at the petiole tip and aligns its underside axis', () => {
    const model = new FlowerModel(requirePreset('lotus'));
    model.root.updateMatrixWorld(true);
    const petiole = requireObject(model.root, 'leaf-petiole-0');
    const blade = requireObject(model.root, 'leaf-blade-0');
    const petioleBase = worldPoint(petiole, 0, 0, 0);
    const petioleTip = worldPoint(petiole, 0, 1, 0);
    const bladeCentre = worldPoint(blade, 0, 0, 0);
    const bladeNormal = worldPoint(blade, 0, 0.1, 0).sub(bladeCentre).normalize();

    expect(bladeCentre.distanceTo(petioleTip)).toBeLessThan(1e-6);
    expect(bladeNormal.angleTo(petioleTip.clone().sub(petioleBase).normalize())).toBeLessThan(1e-6);
    model.dispose();
  });

  it('starts a clustered leaf petiole at the matching branch endpoint', () => {
    const model = new FlowerModel(requirePreset('sakura'));
    model.root.updateMatrixWorld(true);
    const branch = requireObject(model.root, 'branch-0');
    const petiole = requireObject(model.root, 'leaf-petiole-0');
    expect(worldPoint(branch, 0, 1, 0).distanceTo(worldPoint(petiole, 0, 0, 0))).toBeLessThan(1e-6);
    model.dispose();
  });
});

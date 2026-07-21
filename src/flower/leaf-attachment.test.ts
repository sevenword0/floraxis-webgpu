import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { LeafAttachmentFrame, setLeafGrowthDirection } from './leaf-attachment';

describe('leaf attachment frame', () => {
  it('continues a basal leaf blade exactly along the petiole direction', () => {
    const frame = new LeafAttachmentFrame();
    const base = new THREE.Vector3(0.2, 0.8, -0.4);
    const tip = new THREE.Vector3(0.8, 1.15, 0.25);
    const quaternion = new THREE.Quaternion();
    frame.setBladeQuaternion(base, tip, new THREE.Vector3(0, 1, 0), 0.2, quaternion);

    const bladeDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    const petioleDirection = tip.clone().sub(base).normalize();
    expect(bladeDirection.angleTo(petioleDirection)).toBeLessThan(1e-6);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).dot(petioleDirection)).toBeCloseTo(0, 6);
  });

  it('aligns a peltate blade normal to its central petiole', () => {
    const frame = new LeafAttachmentFrame();
    const base = new THREE.Vector3(0, 0, 0);
    const tip = new THREE.Vector3(0.15, 1.2, -0.08);
    const quaternion = new THREE.Quaternion();
    frame.setPeltateQuaternion(base, tip, 0.8, -0.12, quaternion);

    const bladeNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    expect(bladeNormal.angleTo(tip.clone().sub(base).normalize())).toBeLessThan(1e-6);
  });

  it('converts botanical azimuth and elevation to a normalized growth vector', () => {
    const direction = setLeafGrowthDirection(Math.PI / 2, Math.PI / 6, new THREE.Vector3());
    expect(direction.length()).toBeCloseTo(1, 8);
    expect(direction.x).toBeCloseTo(Math.cos(Math.PI / 6), 8);
    expect(direction.y).toBeCloseTo(0.5, 8);
    expect(direction.z).toBeCloseTo(0, 8);
  });
});

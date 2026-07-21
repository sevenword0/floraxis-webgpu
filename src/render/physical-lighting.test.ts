import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { resolveEnvironmentLightRig, resolveNaturalSurfaceOptics } from './physical-lighting';

describe('physical lighting calibration', () => {
  it('rotates the direct-light rig with the reflected panorama source', () => {
    const target = new THREE.Vector3(0, 1.3, 0);
    const base = resolveEnvironmentLightRig(0.5, 45, 0, target);
    const rotated = resolveEnvironmentLightRig(0.5, 45, 90, target);
    const baseDirection = base.keyPosition.clone().sub(target).setY(0).normalize();
    const rotatedDirection = rotated.keyPosition.clone().sub(target).setY(0).normalize();

    expect(baseDirection.x).toBeCloseTo(1, 5);
    expect(baseDirection.z).toBeCloseTo(0, 5);
    expect(rotatedDirection.x).toBeCloseTo(0, 5);
    expect(rotatedDirection.z).toBeCloseTo(1, 5);
    expect(rotatedDirection.length()).toBeCloseTo(1, 6);
  });

  it('keeps natural surfaces dielectric and the cuticle restrained', () => {
    const dry = resolveNaturalSurfaceOptics(0.82, 0.12, 0.2);
    const waxy = resolveNaturalSurfaceOptics(0.46, 0.72, 0.8);

    expect(dry.ior).toBeGreaterThanOrEqual(1.4);
    expect(waxy.ior).toBeLessThanOrEqual(1.48);
    expect(waxy.specularIntensity).toBeGreaterThan(dry.specularIntensity);
    expect(waxy.clearcoat).toBeGreaterThan(dry.clearcoat);
    expect(waxy.clearcoat).toBeLessThanOrEqual(0.16);
    expect(waxy.clearcoatRoughness).toBeGreaterThanOrEqual(0.16);
  });
});

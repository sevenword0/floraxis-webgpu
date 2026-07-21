import * as THREE from 'three/webgpu';

const TAU = Math.PI * 2;

export interface EnvironmentLightRig {
  keyPosition: THREE.Vector3;
  fillPosition: THREE.Vector3;
  rimPosition: THREE.Vector3;
}

export interface NaturalSurfaceOptics {
  ior: number;
  specularIntensity: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

const sphericalOffset = (azimuth: number, elevation: number, radius: number): THREE.Vector3 => {
  const horizontal = Math.cos(elevation) * radius;
  return new THREE.Vector3(
    Math.cos(azimuth) * horizontal,
    Math.sin(elevation) * radius,
    Math.sin(azimuth) * horizontal,
  );
};

/**
 * Converts the brightest equirectangular-panorama location into a coherent
 * three-light rig. Direct highlights now move with the environment instead of
 * remaining fixed while the reflected source rotates around the subject.
 */
export const resolveEnvironmentLightRig = (
  highlightU: number,
  keyElevationDegrees: number,
  rotationDegrees: number,
  target = new THREE.Vector3(0, 1.3, 0),
): EnvironmentLightRig => {
  const u = THREE.MathUtils.euclideanModulo(highlightU, 1);
  const azimuth = (u - 0.5) * TAU + THREE.MathUtils.degToRad(rotationDegrees);
  const elevation = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(keyElevationDegrees, 5, 85));

  return {
    keyPosition: target.clone().add(sphericalOffset(azimuth, elevation, 8)),
    fillPosition: target.clone().add(sphericalOffset(azimuth + Math.PI * 0.72, Math.PI * 0.18, 5.2)),
    rimPosition: target.clone().add(sphericalOffset(azimuth + Math.PI, Math.PI * 0.24, 5.8)),
  };
};

/**
 * Optical defaults for moist botanical dielectrics. The base lobe stays rough
 * and non-metallic while a restrained cuticle layer provides view-dependent
 * highlights without the plastic/car-paint response of a full clearcoat.
 */
export const resolveNaturalSurfaceOptics = (
  roughness: number,
  waxiness: number,
  subsurfaceStrength = 0,
): NaturalSurfaceOptics => {
  const safeRoughness = THREE.MathUtils.clamp(roughness, 0.08, 1);
  const safeWaxiness = THREE.MathUtils.clamp(waxiness, 0, 1);
  const safeSubsurface = THREE.MathUtils.clamp(subsurfaceStrength, 0, 1);

  return {
    ior: 1.4 + safeWaxiness * 0.08,
    specularIntensity: THREE.MathUtils.clamp(0.38 + safeWaxiness * 0.24 + safeSubsurface * 0.05, 0.38, 0.66),
    clearcoat: THREE.MathUtils.clamp(0.025 + safeWaxiness * 0.16, 0.025, 0.16),
    clearcoatRoughness: THREE.MathUtils.clamp(
      safeRoughness * 0.56 + (1 - safeWaxiness) * 0.13,
      0.16,
      0.62,
    ),
  };
};

/** Keeps every color conversion and tone-mapping stage in Three's linear HDR path. */
export const configurePhysicalColorPipeline = (renderer: THREE.WebGPURenderer): void => {
  THREE.ColorManagement.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
};

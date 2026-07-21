export interface StableShadowCoverage {
  maxFar: number;
  lightMargin: number;
  shadowCameraFar: number;
}

export const MAX_GROUND_SAFE_POLAR_ANGLE = Math.PI * 0.49;

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
);

export const clampGroundSafePolarAngle = (angle: number): number => (
  clamp(angle, Math.PI * 0.05, MAX_GROUND_SAFE_POLAR_ANGLE)
);

/**
 * Keeps every CSM caster inside the light-space depth range while the view orbits.
 * CSMShadowNode fits X/Y to the camera frustum but leaves near/far to the source
 * DirectionalLightShadow, so a fixed short `far` plane clips at oblique angles.
 */
export const getStableShadowCoverage = (
  horizontal: number,
  vertical: number,
  cameraFar: number,
): StableShadowCoverage => {
  const safeHorizontal = clamp(Math.abs(horizontal), 1, 40);
  const safeVertical = clamp(Math.abs(vertical), 1, 40);
  const safeCameraFar = Math.max(1, cameraFar);
  const maxFar = Math.min(
    safeCameraFar,
    Math.max(18, safeHorizontal * 3.4, safeVertical * 2.6),
  );
  const lightMargin = clamp(Math.max(safeHorizontal, safeVertical) * 1.6, 10, 30);

  return {
    maxFar,
    lightMargin,
    shadowCameraFar: Math.max(32, maxFar + lightMargin * 2.2),
  };
};

export type QualityPreference = 'balanced' | 'cinematic';

export type AdaptiveQualityTier = 'reduced' | 'balanced' | 'cinematic';

export interface AdaptiveQualityTuning {
  pixelRatioCap: number;
  aoResolutionScale: number;
  aoSamples: number;
  ssrResolutionScale: number;
  contactResolutionScale: number;
  giSlices: number;
  giSteps: number;
  shadowMapSize: 512 | 1024 | 2048;
}

export interface AdaptiveQualitySnapshot {
  tier: AdaptiveQualityTier;
  smoothedFrameMs: number;
  changed: boolean;
}

const TIER_ORDER: AdaptiveQualityTier[] = ['reduced', 'balanced', 'cinematic'];

const QUALITY_TUNING: Record<AdaptiveQualityTier, AdaptiveQualityTuning> = {
  reduced: {
    pixelRatioCap: 0.9,
    aoResolutionScale: 0.44,
    aoSamples: 6,
    ssrResolutionScale: 0.38,
    contactResolutionScale: 0.42,
    giSlices: 1,
    giSteps: 6,
    shadowMapSize: 512,
  },
  balanced: {
    pixelRatioCap: 1.25,
    aoResolutionScale: 0.58,
    aoSamples: 10,
    ssrResolutionScale: 0.52,
    contactResolutionScale: 0.56,
    giSlices: 1,
    giSteps: 8,
    shadowMapSize: 1024,
  },
  cinematic: {
    pixelRatioCap: 1.6,
    aoResolutionScale: 0.82,
    aoSamples: 20,
    ssrResolutionScale: 0.72,
    contactResolutionScale: 0.78,
    giSlices: 2,
    giSteps: 12,
    shadowMapSize: 2048,
  },
};

const tierForPreference = (preference: QualityPreference): AdaptiveQualityTier =>
  preference === 'cinematic' ? 'cinematic' : 'balanced';

export const getAdaptiveQualityTuning = (tier: AdaptiveQualityTier): AdaptiveQualityTuning =>
  QUALITY_TUNING[tier];

/**
 * Converts infrequent GPU timestamp samples (or a frame-time fallback) into a
 * conservative quality tier. Separate overload/recovery windows prevent the
 * renderer from oscillating around the target frame time.
 */
export class AdaptiveQualityController {
  private preference: QualityPreference;
  private currentTier: AdaptiveQualityTier;
  private smoothedFrameMs = 0;
  private overloadSamples = 0;
  private recoverySamples = 0;
  private cooldownUntilMs = 0;

  constructor(preference: QualityPreference = 'balanced') {
    this.preference = preference;
    this.currentTier = tierForPreference(preference);
  }

  get tier(): AdaptiveQualityTier {
    return this.currentTier;
  }

  setPreference(preference: QualityPreference): AdaptiveQualitySnapshot {
    this.preference = preference;
    this.currentTier = tierForPreference(preference);
    this.smoothedFrameMs = 0;
    this.overloadSamples = 0;
    this.recoverySamples = 0;
    this.cooldownUntilMs = 0;
    return this.snapshot(true);
  }

  observe(frameMs: number, nowMs: number): AdaptiveQualitySnapshot {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || !Number.isFinite(nowMs)) {
      return this.snapshot(false);
    }

    this.smoothedFrameMs = this.smoothedFrameMs === 0
      ? frameMs
      : this.smoothedFrameMs * 0.72 + frameMs * 0.28;

    if (nowMs < this.cooldownUntilMs) return this.snapshot(false);

    const targetMs = this.preference === 'cinematic' ? 25 : 1000 / 60;
    const tierIndex = TIER_ORDER.indexOf(this.currentTier);
    const maximumTierIndex = TIER_ORDER.indexOf(tierForPreference(this.preference));

    if (this.smoothedFrameMs > targetMs * 1.16) {
      this.overloadSamples += 1;
      this.recoverySamples = 0;
      if (this.overloadSamples >= 2 && tierIndex > 0) {
        this.currentTier = TIER_ORDER[tierIndex - 1];
        this.smoothedFrameMs = 0;
        this.overloadSamples = 0;
        this.cooldownUntilMs = nowMs + 4000;
        return this.snapshot(true);
      }
    } else if (this.smoothedFrameMs < targetMs * 1.03) {
      this.recoverySamples += 1;
      this.overloadSamples = 0;
      if (this.recoverySamples >= 8 && tierIndex < maximumTierIndex) {
        this.currentTier = TIER_ORDER[tierIndex + 1];
        this.smoothedFrameMs = 0;
        this.recoverySamples = 0;
        this.cooldownUntilMs = nowMs + 6000;
        return this.snapshot(true);
      }
    } else {
      this.overloadSamples = 0;
      this.recoverySamples = 0;
    }

    return this.snapshot(false);
  }

  private snapshot(changed: boolean): AdaptiveQualitySnapshot {
    return {
      tier: this.currentTier,
      smoothedFrameMs: this.smoothedFrameMs,
      changed,
    };
  }
}

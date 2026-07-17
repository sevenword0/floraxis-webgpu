export interface PetalClearanceOptions {
  width: number;
  count: number;
  index: number;
  layer: number;
  layers: number;
  headRadius: number;
  thickness: number;
}

export interface PetalClearance {
  radialBase: number;
  laneDepth: number;
  laneLift: number;
  layerLift: number;
  openDrift: number;
  weaveYaw: number;
}

export interface FloralAttachmentOptions {
  headRadius: number;
  petalCount: number;
  layers: number;
  petalWidth: number;
  petalThickness: number;
  radialSpread: number;
  sepalLength: number;
  stemRadius: number;
  sunflower: boolean;
}

export interface FloralAttachmentLayout {
  baseRadius: number;
  baseDepth: number;
  collarHeight: number;
  petalBaseRadius: number;
  petalClosedEnvelope: number;
  petalOpenEnvelope: number;
  sepalRadius: number;
  sepalBaseLift: number;
  /** Downward/outward hinge angle that keeps the closed calyx below the bud. */
  sepalClosedAngleDeg: number;
  /** Vertical separation between the sepal hinge and its closed-stage tip. */
  sepalBudTipDrop: number;
  sepalOpenDrift: number;
  sepalDrop: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const computePetalClearance = (options: PetalClearanceOptions): PetalClearance => {
  const count = Math.max(3, Math.round(options.count));
  const layerProgress = options.layer / Math.max(1, options.layers - 1);
  const chord = Math.max(0.12, 2 * Math.sin(Math.PI / count));
  const naturalRadius = options.headRadius * (0.72 - layerProgress * 0.16);
  const contactRadius = options.width * 0.3 / chord;
  const maximumRadius = options.headRadius * 0.96 + options.width * 0.12;
  const radialBase = clamp(Math.max(naturalRadius, contactRadius), options.headRadius * 0.48, maximumRadius);
  const lane = (options.index + options.layer * 2) % 3 - 1;
  const verticalLane = (options.index + options.layer) % 2 === 0 ? -1 : 1;
  const clearance = options.thickness * 1.4 + options.width * 0.008;

  return {
    radialBase,
    laneDepth: lane * clearance,
    laneLift: verticalLane * options.thickness * 0.52,
    layerLift: layerProgress * (options.width * 0.085 + options.thickness * 2.2),
    openDrift: options.width * 0.055 + options.thickness * 0.55,
    weaveYaw: lane * Math.min(0.032, Math.PI / (count * 7)),
  };
};

/**
 * Keeps the petal bases, receptacle and sepals on one continuous attachment ring.
 * Sunflower involucral bracts sit near the rim of the capitulum, while ordinary
 * sepals sit just outside the receptacle rather than at the stem axis.
 */
export const computeFloralAttachment = (options: FloralAttachmentOptions): FloralAttachmentLayout => {
  const headRadius = Math.max(0.08, options.headRadius);
  const outerCount = Math.max(3, Math.ceil(options.petalCount / Math.max(1, options.layers)));
  const outerPetal = computePetalClearance({
    width: options.petalWidth,
    count: outerCount,
    index: 0,
    layer: 0,
    layers: options.layers,
    headRadius,
    thickness: options.petalThickness,
  });
  const petalBaseRadius = options.sunflower
    ? Math.max(headRadius * 0.88, outerPetal.radialBase)
    : outerPetal.radialBase;
  const petalClosedEnvelope = petalBaseRadius + Math.abs(outerPetal.laneDepth);
  const petalOpenEnvelope = petalClosedEnvelope
    + outerPetal.openDrift * options.radialSpread * (options.sunflower ? 0.55 : 1);
  const baseRadius = options.sunflower
    ? Math.max(headRadius * 0.94, petalBaseRadius + options.petalThickness * 0.55)
    : clamp(
      Math.max(
        headRadius * 0.84,
        options.petalWidth * 0.24,
        petalBaseRadius + options.petalThickness * 0.65,
      ),
      headRadius * 0.78,
      headRadius * 1.65,
    );
  const baseDepth = clamp(baseRadius * (options.sunflower ? 0.26 : 0.34), 0.055, 0.22);
  const collarHeight = clamp(options.sepalLength * 0.2 + options.stemRadius * 0.72, 0.1, 0.24);
  const sepalOpenDrift = options.sepalLength * (options.sunflower ? 0.12 : 0.08);
  const sepalClearance = options.petalThickness * 1.2;
  const requiredSepalRadius = Math.max(
    petalClosedEnvelope + sepalClearance,
    petalOpenEnvelope - sepalOpenDrift + sepalClearance,
  );
  const sepalRadius = clamp(
    Math.max(
      options.sunflower ? headRadius * 0.91 : baseRadius + options.petalThickness * 1.4,
      requiredSepalRadius,
    ),
    headRadius * 0.8,
    headRadius * 1.95,
  );
  const sepalBaseLift = -Math.max(
    options.sunflower ? 0.065 : 0.052,
    baseDepth * (options.sunflower ? 0.5 : 0.7) + options.petalThickness * 0.85,
  );
  const requiredBudTipDrop = Math.max(0.028, options.petalThickness * 2.4, baseDepth * 0.12);
  const sepalClosedAngleDeg = clamp(
    Math.asin(clamp(requiredBudTipDrop / Math.max(0.08, options.sepalLength), 0, 0.3)) * 180 / Math.PI,
    8,
    14,
  );
  const sepalBudTipDrop = Math.sin(sepalClosedAngleDeg * Math.PI / 180) * options.sepalLength;

  return {
    baseRadius,
    baseDepth,
    collarHeight,
    petalBaseRadius,
    petalClosedEnvelope,
    petalOpenEnvelope,
    sepalRadius,
    sepalBaseLift,
    sepalClosedAngleDeg,
    sepalBudTipDrop,
    sepalOpenDrift,
    sepalDrop: options.sepalLength * (options.sunflower ? 0.16 : 0.12),
  };
};

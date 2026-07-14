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

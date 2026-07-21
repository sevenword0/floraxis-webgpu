import type { FieldColorRange } from '../types';

const HEX = /^#?([0-9a-f]{6})$/i;

const parseHex = (value: string): [number, number, number] | undefined => {
  const match = HEX.exec(value.trim());
  if (!match) return undefined;
  const packed = Number.parseInt(match[1], 16);
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255];
};

const channelToLinear = (value: number): number => {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

const linearToChannel = (value: number): number => {
  const encoded = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
};

const mixHex = (first: string, second: string, amount: number): string => {
  const a = parseHex(first);
  const b = parseHex(second);
  if (!a || !b) return first;
  const t = Math.min(1, Math.max(0, amount));
  const channels = a.map((value, index) => linearToChannel(
    channelToLinear(value) + (channelToLinear(b[index]) - channelToLinear(value)) * t,
  ));
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
};

/** Resolves one deterministic plant colour while keeping strength zero exactly neutral. */
export const resolveFlowerColor = (
  presetColor: string,
  range: FieldColorRange | undefined,
  sample: number,
): string => {
  if (!range || range.strength <= 0 || !parseHex(range.from) || !parseHex(range.to)) return presetColor;
  const ranged = mixHex(range.from, range.to, sample);
  return mixHex(presetColor, ranged, Math.min(1, Math.max(0, range.strength)));
};

export const sanitizeFieldColorRange = (
  range: FieldColorRange | undefined,
  fallback: { base: string; tip: string },
): FieldColorRange => ({
  from: parseHex(range?.from ?? '') ? range!.from : fallback.base,
  to: parseHex(range?.to ?? '') ? range!.to : fallback.tip,
  strength: Math.min(1, Math.max(0, Number.isFinite(range?.strength) ? range!.strength : 0)),
});

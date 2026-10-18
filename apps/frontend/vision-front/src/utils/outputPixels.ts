import { chartSeries, onImage } from '@visin/frontend-core';
import type { Visualization } from '../types';

/**
 * A model's outputs as a run uploads them: visualization types the pipeline writes for each frame it predicted on.
 * `mask` and `confidence` are data, not pictures (class indices and a probability per pixel), so they are decoded
 * here and painted, instead of being shown as the near-black or washed-out greys their raw pixels are.
 */
export const OUTPUT_KINDS = ['segment', 'mask', 'confidence'] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

export const OUTPUT_KIND_LABELS: Record<OutputKind, string> = {
  segment: 'Prediction',
  mask: 'Class mask',
  confidence: 'Confidence'
};

/** What each kind shows, in words for the person looking at it. */
export const OUTPUT_KIND_DESCRIPTIONS: Record<OutputKind, string> = {
  segment: 'The prediction drawn over the frame in the class colours, for looking at.',
  mask: 'The class the model chose for every pixel. Shown here painted in the class colours.',
  confidence: 'How sure the model was of each pixel’s class, from guessing (dark) to certain (bright).'
};

export const isOutputKind = (type: string): type is OutputKind => (OUTPUT_KINDS as readonly string[]).includes(type);

/** A kind whose pixels are values to decode rather than colours to show. */
export const isDecodedKind = (type: string): type is 'mask' | 'confidence' => type === 'mask' || type === 'confidence';

export type Rgb = readonly [number, number, number];

/** A class a model was trained on, by the index its mask uses. */
export interface OutputClass {
  index: number;
  name: string;
}

/** `#rrggbb` (or `#rgb`) as its channels, or `undefined` for anything else. */
export const hexRgb = (hex: string): Rgb | undefined => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return undefined;
  const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join('') : match[1];
  return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)) as unknown as Rgb;
};

/**
 * The confidence ramp, dark to bright as the model grows sure: the frame backdrop, then the chart series' violet, red
 * and amber, then white. Each step is lighter than the last, so it reads in greyscale too.
 */
export const CONFIDENCE_STOPS: readonly string[] = [
  onImage.backdrop,
  chartSeries.light[6],
  chartSeries.light[7],
  chartSeries.light[3],
  onImage.ink
];

/** 256 colours spread evenly along `stops`. */
export const rampLut = (stops: readonly string[] = CONFIDENCE_STOPS): Rgb[] => {
  const rgb = stops.map((stop) => hexRgb(stop) ?? ([0, 0, 0] as const));
  return Array.from({ length: 256 }, (_, step) => {
    const at = (step / 255) * (rgb.length - 1);
    const low = Math.min(Math.floor(at), rgb.length - 2);
    const t = at - low;
    return rgb[low].map((channel, i) => Math.round(channel + (rgb[low + 1][i] - channel) * t)) as unknown as Rgb;
  });
};

/**
 * The single value each pixel holds, when every pixel is grey (`r = g = b`), as a class-index mask or a confidence
 * map is. A mask saved with its own palette is already a picture: `undefined`, and it is shown as it is.
 */
export const greyValues = (rgba: Uint8ClampedArray): Uint8Array | undefined => {
  const values = new Uint8Array(rgba.length / 4);
  for (let pixel = 0, at = 0; at < rgba.length; pixel += 1, at += 4) {
    const value = rgba[at];
    if (rgba[at + 1] !== value || rgba[at + 2] !== value) return undefined;
    values[pixel] = value;
  }
  return values;
};

/** The class indices a mask uses, in order. */
export const presentClasses = (values: Uint8Array): number[] => {
  const seen = new Uint8Array(256);
  for (const value of values) seen[value] = 1;
  return [...seen.keys()].filter((index) => seen[index]);
};

/** A mask painted in its classes' colours, as RGBA. */
export const paintMask = (values: Uint8Array, colourOf: (index: number) => Rgb): Uint8ClampedArray => {
  const lut = Array.from({ length: 256 }, (_, index) => colourOf(index));
  const out = new Uint8ClampedArray(values.length * 4);
  values.forEach((value, pixel) => {
    const [r, g, b] = lut[value];
    out.set([r, g, b, 255], pixel * 4);
  });
  return out;
};

/**
 * The probability a confidence pixel stands for. The browser decodes a 16-bit PNG to 8 bits, so either encoding
 * arrives as `round(255 × p)`.
 */
export const confidenceOf = (value: number): number => value / 255;

/**
 * A confidence map on the ramp, stretched from `floor` (`1/C`, the least a top class can score among C) to 1, so a
 * three-class model's range is not spent on values it can never output.
 */
export const paintConfidence = (values: Uint8Array, lut: readonly Rgb[], floor = 0): Uint8ClampedArray => {
  const span = 1 - floor || 1;
  const out = new Uint8ClampedArray(values.length * 4);
  values.forEach((value, pixel) => {
    const t = Math.min(1, Math.max(0, (confidenceOf(value) - floor) / span));
    const [r, g, b] = lut[Math.round(t * 255)];
    out.set([r, g, b, 255], pixel * 4);
  });
  return out;
};

/** The input frame an output was made from: what the upload named, or its file name without the extension. */
export const frameOf = (visualization: Pick<Visualization, 'filename' | 'metadata'>): string => {
  const frame = (visualization.metadata?.prediction as { frame?: unknown } | undefined)?.frame;
  if (typeof frame === 'string' && frame) return frame;
  const name = visualization.filename.split(/[\\/]/).pop() ?? visualization.filename;
  return name.replace(/\.[^.]+$/, '');
};

/** What a pixel says, in words: its class, or how sure the model was. */
export const describePixel = (kind: 'mask' | 'confidence', value: number, classes: OutputClass[] = []): string => {
  if (kind === 'confidence') return `p ≈ ${confidenceOf(value).toFixed(2)}`;
  const named = classes.find((entry) => entry.index === value);
  return named ? `${named.name} (class ${value})` : `Class ${value}`;
};

import { decodeGrey, encodeRgb, type GreyImage } from './png';

/**
 * A model's `mask` and `confidence` outputs, made legible to a model reading them.
 *
 * Both are data stored as pictures. A mask holds the predicted class of every pixel as its grey level (0, 1, 2…),
 * which looks black; a confidence map holds the top class's probability, which looks like a washed-out grey. An
 * assistant handed either as it is sees nothing, and would describe nothing. So they are painted before they are
 * returned, the way vision-front paints them, and the caption says what each colour means and how much of the frame
 * it covers, which is what the question about a frame usually is.
 */

type Rgb = readonly [number, number, number];

/**
 * A mask's colours, by class index, with the names a caption gives them. The first eight are vision-front's chart
 * series (frontend-core `theme/chart.ts`, light scheme), so a frame here matches the app; four more follow so a
 * twelve-class model is still told apart.
 */
export const CLASS_COLOURS: ReadonlyArray<{ name: string; rgb: Rgb }> = [
  { name: 'blue', rgb: [0x2a, 0x78, 0xd6] },
  { name: 'orange', rgb: [0xeb, 0x68, 0x34] },
  { name: 'green', rgb: [0x1b, 0xaf, 0x7a] },
  { name: 'yellow', rgb: [0xed, 0xa1, 0x00] },
  { name: 'pink', rgb: [0xe8, 0x7b, 0xa4] },
  { name: 'dark green', rgb: [0x00, 0x83, 0x00] },
  { name: 'violet', rgb: [0x4a, 0x3a, 0xa7] },
  { name: 'red', rgb: [0xe3, 0x49, 0x48] },
  { name: 'cyan', rgb: [0x00, 0xb8, 0xd4] },
  { name: 'brown', rgb: [0x8d, 0x5a, 0x2b] },
  { name: 'grey', rgb: [0x9e, 0x9e, 0x9e] },
  { name: 'white', rgb: [0xff, 0xff, 0xff] }
];

/** The confidence ramp, dark to bright as the model grows sure: vision-front's, stop for stop. */
const CONFIDENCE_STOPS: Rgb[] = [
  [0x0b, 0x0f, 0x19],
  [0x4a, 0x3a, 0xa7],
  [0xe3, 0x49, 0x48],
  [0xed, 0xa1, 0x00],
  [0xff, 0xff, 0xff]
];

const RAMP: Rgb[] = Array.from({ length: 256 }, (_, step) => {
  const at = (step / 255) * (CONFIDENCE_STOPS.length - 1);
  const low = Math.min(Math.floor(at), CONFIDENCE_STOPS.length - 2);
  const t = at - low;
  return CONFIDENCE_STOPS[low].map((channel, i) =>
    Math.round(channel + (CONFIDENCE_STOPS[low + 1][i] - channel) * t)
  ) as unknown as Rgb;
});

/** A class a model was trained on, by the index its mask uses. */
export interface OutputClass {
  index: number;
  name: string;
}

/** The classes a checkpoint's weights name (`modelInfo.train_classes`), by index; empty when they name none. */
export function trainClasses(modelInfo: Record<string, unknown> | undefined): OutputClass[] {
  const listed = modelInfo?.train_classes;
  if (!Array.isArray(listed)) return [];
  return listed
    .flatMap((entry): OutputClass[] => {
      const { index, name } = (entry ?? {}) as { index?: unknown; name?: unknown };
      return Number.isInteger(index) && typeof name === 'string' ? [{ index: index as number, name }] : [];
    })
    .sort((a, b) => a.index - b.index);
}

type Grey = GreyImage;

/**
 * One value per pixel, when the PNG is grey, as a class-index mask or a confidence map is. A 16-bit sample is scaled
 * to 8 bits, so either confidence encoding arrives as `round(255 × p)`. `undefined` for anything else: a file that is
 * not a PNG this reads, or a mask already saved with its own colours, which is a picture and is left alone.
 */
export const readGrey = (bytes: Buffer): Grey | undefined => decodeGrey(bytes);

const encode = (width: number, height: number, paint: (pixel: number) => Rgb): Buffer => {
  const rgb = new Uint8Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) rgb.set(paint(pixel), pixel * 3);
  return encodeRgb(width, height, rgb);
};

const percent = (share: number): string => {
  const value = share * 100;
  if (value > 0 && value < 1) return '<1%';
  return `${Math.round(value)}%`;
};

const colourOf = (index: number) => CLASS_COLOURS[index % CLASS_COLOURS.length];

/** A mask in its classes' colours, and a caption saying which colour is which class and how much of the frame it is. */
export function paintMask(grey: Grey, classes: OutputClass[] = []): { image: Buffer; legend: string } {
  const counts = new Array<number>(256).fill(0);
  for (const value of grey.values) counts[value] += 1;
  const image = encode(grey.width, grey.height, (pixel) => colourOf(grey.values[pixel]).rgb);

  const total = grey.values.length || 1;
  const used = counts.flatMap((pixels, index) => (pixels > 0 ? [{ index, pixels }] : [])).sort((a, b) => b.pixels - a.pixels);
  const named = (index: number) => classes.find((entry) => entry.index === index)?.name;
  const parts = used.map(
    ({ index, pixels }) => `${colourOf(index).name} = ${named(index) ?? `class ${index}`} (${percent(pixels / total)})`
  );
  const repeats = used.some(({ index }) => index >= CLASS_COLOURS.length)
    ? ` Colours repeat after ${CLASS_COLOURS.length} classes, so read the percentages too.`
    : '';
  const unnamed =
    classes.length === 0 ? ' The classes are numbered: pass the training to name them from its stored weights.' : '';
  return { image, legend: `painted mask, ${parts.join(', ')}.${repeats}${unnamed}` };
}

/**
 * A confidence map on the ramp, stretched from `1/C` (the least a top class can score among C) to 1, with how sure
 * the model was overall and how much of the frame it was unsure about.
 */
export function paintConfidence(grey: Grey, classCount = 0): { image: Buffer; legend: string } {
  const floor = classCount > 1 ? 1 / classCount : 0;
  const span = 1 - floor;
  const image = encode(grey.width, grey.height, (pixel) => {
    const t = Math.min(1, Math.max(0, (grey.values[pixel] / 255 - floor) / span));
    return RAMP[Math.round(t * 255)];
  });

  let sum = 0;
  let unsure = 0;
  for (const value of grey.values) {
    sum += value;
    if (value < 128) unsure += 1;
  }
  const total = grey.values.length || 1;
  const mean = sum / total / 255;
  return {
    image,
    legend:
      `painted confidence, dark = unsure (p ${floor.toFixed(2)}) to white = certain (p 1.00); ` +
      `mean p ${mean.toFixed(2)}, ${percent(unsure / total)} of pixels below p 0.5.`
  };
}

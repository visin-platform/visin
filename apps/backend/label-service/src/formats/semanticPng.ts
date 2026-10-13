import type { RawMask } from '../utils/mask';
import { decodePng, encodeGrayscalePng } from '../utils/png';
import { hasExtension, hexOf, parseJson, rgbOf, stemOfFile } from './helpers';
import type { FormatModule, ImportedFrame, ImportedLabels } from './types';

interface ClassesFile {
  unlabeled?: number;
  classes?: { index?: number; id?: number; name?: string; color?: string | number[] }[];
}

/** The values some tools use for "ignore this pixel" when a class list does not claim them. */
const IGNORE_VALUE = 255;

export const semanticPng: FormatModule = {
  id: 'semantic-png',
  name: 'Semantic PNG',
  description: 'One class-index PNG per image plus classes.json, Cityscapes style. Segmentation training reads it as is. Masks only.',
  boxes: false,
  masks: true,

  async detect({ names }) {
    const hasClasses = names.some((name) => /(^|\/)classes\.json$/i.test(name));
    const hasPng = names.some((name) => hasExtension(name, '.png'));
    return hasClasses && hasPng ? 70 : 0;
  },

  createExporter(job) {
    const classes = [...job.classes].sort((a, b) => a.maskIndex - b.maskIndex);
    return {
      frame(frame) {
        const width = frame.mask?.width ?? frame.width;
        const height = frame.mask?.height ?? frame.height;
        if (!width || !height) return [];
        // A frame an annotator finished with nothing painted is an all-unlabeled
        // mask, so every image of the export has one.
        const data = frame.mask?.data ?? new Uint8Array(width * height);
        return [{ name: `masks/${frame.stem}.png`, data: encodeGrayscalePng(width, height, data) }];
      },
      finish() {
        const document = {
          unlabeled: 0,
          note: 'Pixel value 0 is unlabeled; every other value is the index of a class below.',
          classes: classes.map((entry) => ({ index: entry.maskIndex, name: entry.name, color: entry.color }))
        };
        return [{ name: 'classes.json', data: `${JSON.stringify(document, null, 2)}\n` }];
      }
    };
  },

  async parse({ names, read }, { sizeOf }): Promise<ImportedLabels> {
    const warnings: string[] = [];
    const classesName = names.find((name) => /(^|\/)classes\.json$/i.test(name));
    const file = classesName ? parseJson<ClassesFile | NonNullable<ClassesFile['classes']>>(await read(classesName)) : undefined;
    const list = Array.isArray(file) ? file : file?.classes || [];
    const unlabeled = !Array.isArray(file) && typeof file?.unlabeled === 'number' ? file.unlabeled : undefined;

    const entries = list
      .map((entry) => ({
        index: Number(entry.index ?? entry.id),
        name: String(entry.name ?? ''),
        color: Array.isArray(entry.color) ? (entry.color as [number, number, number]) : typeof entry.color === 'string' ? rgbOf(entry.color) : undefined
      }))
      .filter((entry) => Number.isInteger(entry.index) && entry.name !== '' && entry.index !== unlabeled)
      .sort((a, b) => a.index - b.index);
    const classes = entries.map((entry) => entry.name);
    const positionOfValue = new Map(entries.map((entry, i) => [entry.index, i + 1]));
    const positionOfColor = new Map(
      entries.filter((entry) => entry.color).map((entry, i) => [hexOf(entry.color as [number, number, number]), positionOfValue.get(entry.index) ?? i + 1])
    );

    const frames: ImportedFrame[] = [];
    const unsized: string[] = [];
    for (const name of names.filter((candidate) => hasExtension(candidate, '.png'))) {
      const stem = stemOfFile(name);
      const size = sizeOf(stem);
      if (!size) {
        unsized.push(stem);
        continue;
      }
      const png = decodePng(await read(name));
      if (png.width !== size.width || png.height !== size.height) {
        warnings.push(`${name}: mask size differs from the frame`);
        continue;
      }
      const data = new Uint8Array(png.width * png.height);
      if (png.colorType === 0 || png.colorType === 3) {
        for (let i = 0; i < data.length; i++) {
          const value = png.data[i];
          data[i] = value === IGNORE_VALUE && !positionOfValue.has(IGNORE_VALUE) ? 0 : positionOfValue.get(value) || 0;
        }
      } else if (png.colorType === 2 || png.colorType === 6) {
        for (let i = 0; i < data.length; i++) {
          const o = i * png.channels;
          data[i] = positionOfColor.get(hexOf([png.data[o], png.data[o + 1], png.data[o + 2]])) || 0;
        }
      } else {
        warnings.push(`${name}: unsupported mask colour type ${png.colorType}`);
        continue;
      }
      const mask: RawMask = { width: png.width, height: png.height, data };
      const negative = (png.colorType === 0 || png.colorType === 3) && !positionOfValue.has(unlabeled ?? 0) && png.data.every((value) => value === (unlabeled ?? 0));
      frames.push({ stem, boxes: [], mask, ...(negative ? { negative: true as const } : {}) });
    }
    if (!classesName) warnings.push('no classes.json found; mask values could not be named');
    return { classes, frames, warnings, unsized };
  }
};

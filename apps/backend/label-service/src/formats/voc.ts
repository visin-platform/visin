import type { RawMask } from '../utils/mask';
import { decodePng, encodePalettePng } from '../utils/png';
import { baseName, boxesOf, hasExtension, inFolder, rgbOf, stemOfFile } from './helpers';
import type { FormatModule, ImportedFrame, ImportedLabels } from './types';

const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const unescapeXml = (text: string): string =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const tag = (xml: string, name: string): string | undefined =>
  new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(xml)?.[1];

interface LabelmapEntry {
  name: string;
  color: [number, number, number];
}

/** CVAT's `labelmap.txt`: `name:r,g,b:parts:actions`, `#` for comments. */
const parseLabelmap = (text: string): LabelmapEntry[] =>
  text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => {
      const [name, color] = line.split(':');
      const [r, g, b] = (color || '0,0,0').split(',').map((value) => Number(value.trim()) || 0);
      return { name: name.trim(), color: [r, g, b] as [number, number, number] };
    });

export const voc: FormatModule = {
  id: 'voc',
  name: 'Pascal VOC',
  description: 'Annotations/*.xml for boxes and SegmentationClass/*.png palette masks. A classic many tools still read.',
  boxes: true,
  masks: true,

  async detect({ names }) {
    const xml = names.filter((name) => hasExtension(name, '.xml'));
    if (xml.length === 0) return 0;
    return xml.some((name) => inFolder(name, 'annotations')) || names.some((name) => inFolder(name, 'segmentationclass')) ? 80 : 40;
  },

  createExporter(job) {
    const ordered = [...job.classes].sort((a, b) => a.maskIndex - b.maskIndex);
    const nameOf = new Map(ordered.map((entry) => [entry.key, entry.name]));
    const palette: [number, number, number][] = [[0, 0, 0]];
    for (const entry of ordered) palette[entry.maskIndex] = rgbOf(entry.color);
    for (let i = 0; i < palette.length; i++) palette[i] = palette[i] || [0, 0, 0];

    return {
      frame(frame) {
        const width = frame.width ?? frame.mask?.width ?? 0;
        const height = frame.height ?? frame.mask?.height ?? 0;
        const objects = boxesOf(frame.objects)
          .filter((object) => nameOf.has(object.classKey))
          .map((object) => {
            const [x, y, w, h] = object.bbox;
            // VOC pixels are 1-based and the box is inclusive of both ends.
            return `  <object>\n    <name>${escapeXml(nameOf.get(object.classKey)!)}</name>\n    <pose>Unspecified</pose>\n    <truncated>0</truncated>\n    <difficult>0</difficult>\n    <bndbox>\n      <xmin>${Math.floor(x) + 1}</xmin>\n      <ymin>${Math.floor(y) + 1}</ymin>\n      <xmax>${Math.ceil(x + w)}</xmax>\n      <ymax>${Math.ceil(y + h)}</ymax>\n    </bndbox>\n  </object>`;
          });
        const files: { name: string; data: Buffer | string }[] = [
          {
            name: `Annotations/${frame.stem}.xml`,
            data: `<annotation>\n  <folder>JPEGImages</folder>\n  <filename>${escapeXml(baseName(frame.path))}</filename>\n  <size>\n    <width>${width}</width>\n    <height>${height}</height>\n    <depth>3</depth>\n  </size>\n  <segmented>${frame.mask ? 1 : 0}</segmented>\n${objects.join('\n')}${objects.length ? '\n' : ''}</annotation>\n`
          }
        ];
        if (frame.mask) {
          files.push({
            name: `SegmentationClass/${frame.stem}.png`,
            data: encodePalettePng(frame.mask.width, frame.mask.height, frame.mask.data, palette)
          });
        }
        return files;
      },
      finish() {
        const lines = ['# label:color_rgb:parts:actions', 'background:0,0,0::'];
        for (const entry of ordered) lines.push(`${entry.name}:${rgbOf(entry.color).join(',')}::`);
        return [{ name: 'labelmap.txt', data: `${lines.join('\n')}\n` }];
      }
    };
  },

  async parse({ names, read }, { sizeOf }): Promise<ImportedLabels> {
    const warnings: string[] = [];
    const labelmapName = names.find((name) => /(^|\/)labelmap\.txt$/i.test(name));
    const entries = labelmapName ? parseLabelmap((await read(labelmapName)).toString('utf8')) : [];
    // Value 0 is background; a labelmap that lists it first is skipped over.
    const classEntries = entries.filter((entry) => entry.name.toLowerCase() !== 'background');
    const classes = classEntries.map((entry) => entry.name);
    const valueOf = new Map(entries.map((entry, i) => [i, entry.name]));
    const positionOfName = new Map(classes.map((name, i) => [name, i + 1]));

    // Without a labelmap the classes are the object names, alphabetically — which
    // is the order the original VOC classes are numbered in.
    const xmlNames = names.filter((name) => hasExtension(name, '.xml'));
    const documents = new Map<string, string>();
    for (const name of xmlNames) documents.set(name, (await read(name)).toString('utf8'));
    if (classes.length === 0) {
      const found = new Set<string>();
      for (const xml of documents.values()) {
        for (const match of xml.matchAll(/<object>[\s\S]*?<\/object>/g)) {
          const objectName = tag(match[0], 'name');
          if (objectName) found.add(unescapeXml(objectName));
        }
      }
      [...found].sort().forEach((name) => {
        classes.push(name);
        positionOfName.set(name, classes.length);
      });
    }

    const frames = new Map<string, ImportedFrame>();
    for (const [name, xml] of documents) {
      const stem = stemOfFile(name);
      const boxes: ImportedFrame['boxes'] = [];
      for (const match of xml.matchAll(/<object>[\s\S]*?<\/object>/g)) {
        const objectName = tag(match[0], 'name');
        const [xmin, ymin, xmax, ymax] = ['xmin', 'ymin', 'xmax', 'ymax'].map((side) => Number(tag(match[0], side)));
        if (!objectName || [xmin, ymin, xmax, ymax].some((value) => !Number.isFinite(value))) continue;
        const className = unescapeXml(objectName);
        if (!positionOfName.has(className)) {
          classes.push(className);
          positionOfName.set(className, classes.length);
        }
        boxes.push({ className, bbox: [xmin - 1, ymin - 1, xmax - xmin + 1, ymax - ymin + 1] });
      }
      frames.set(stem, { stem, boxes, ...(/<annotation>/.test(xml) && !/<object\b/.test(xml) && tag(xml, 'segmented') !== '1' ? { negative: true as const } : {}) });
    }

    for (const name of names.filter((candidate) => hasExtension(candidate, '.png') && inFolder(candidate, 'segmentationclass'))) {
      const stem = stemOfFile(name);
      const frame = frames.get(stem) || { stem, boxes: [] };
      delete frame.negative;
      const png = decodePng(await read(name));
      const data = new Uint8Array(png.width * png.height);
      if (png.colorType === 3 || png.colorType === 0) {
        // value v is the v-th labelmap entry; 255 is VOC's "void" border and stays unlabeled.
        for (let i = 0; i < data.length; i++) {
          const className = valueOf.get(png.data[i] as number) ?? (entries.length ? undefined : classes[png.data[i] - 1]);
          data[i] = className ? positionOfName.get(className) || 0 : 0;
        }
      } else if (png.colorType === 2 || png.colorType === 6) {
        const byColor = new Map(classEntries.map((entry) => [entry.color.join(','), positionOfName.get(entry.name)!]));
        for (let i = 0; i < data.length; i++) {
          const o = i * png.channels;
          data[i] = byColor.get(`${png.data[o]},${png.data[o + 1]},${png.data[o + 2]}`) || 0;
        }
      } else {
        warnings.push(`${name}: unsupported mask colour type ${png.colorType}`);
        continue;
      }
      const mask: RawMask = { width: png.width, height: png.height, data };
      const size = sizeOf(stem);
      if (size && (size.width !== mask.width || size.height !== mask.height)) {
        warnings.push(`${name}: mask size differs from the frame`);
        continue;
      }
      frames.set(stem, { ...frame, mask, ...(frame.boxes.length === 0 && (png.colorType === 0 || png.colorType === 3) && png.data.every((value) => value === 0) ? { negative: true as const } : {}) });
    }
    return { classes, frames: [...frames.values()], warnings };
  }
};

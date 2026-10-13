import { baseName, boundsOf, boxesOf, hasExtension, inFolder, stemOfFile, tidyBox } from './helpers';
import type { FormatModule, ImportedFrame, ImportedLabels } from './types';

/** Files with a `.txt` name that are lists of images or classes, not one image's labels. */
const NOT_LABELS = /^(classes|names|labels|obj|train|val|valid|test|readme)\.(txt|names)$/i;

const isLabelFile = (name: string): boolean => hasExtension(name, '.txt') && !NOT_LABELS.test(baseName(name));

/**
 * `names:` of a `data.yaml`, in any of the three shapes tools write it: a flow
 * list, a flow map, or an indented map / list below the key. Only this one key
 * is read, so a small reader is enough.
 */
export const parseYamlNames = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((line) => /^names\s*:/.test(line));
  if (at < 0) return [];
  const clean = (value: string): string => value.trim().replace(/^['"]|['"]$/g, '');
  const names: string[] = [];
  const inline = lines[at].replace(/^names\s*:/, '').trim();
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(clean)
      .filter(Boolean);
  }
  if (inline.startsWith('{')) {
    for (const part of inline.replace(/^\{|\}$/g, '').split(',')) {
      const match = /^\s*(\d+)\s*:\s*(.+)$/.exec(part);
      if (match) names[Number(match[1])] = clean(match[2]);
    }
    return names;
  }
  for (const line of lines.slice(at + 1)) {
    if (/^\S/.test(line) && line.trim() !== '') break;
    const mapped = /^\s+(\d+)\s*:\s*(.+)$/.exec(line);
    const listed = /^\s*-\s*(.+)$/.exec(line);
    if (mapped) names[Number(mapped[1])] = clean(mapped[2]);
    else if (listed) names.push(clean(listed[1]));
  }
  return names;
};

export const yolo: FormatModule = {
  id: 'yolo',
  name: 'YOLO',
  description: 'One .txt per image with class cx cy w h, plus data.yaml. What YOLO training reads directly. Boxes only.',
  boxes: true,
  masks: false,

  async detect({ names }) {
    const labels = names.filter(isLabelFile);
    if (labels.length === 0) return 0;
    const hasConfig = names.some((name) => /(^|\/)(data\.yaml|data\.yml|classes\.txt|obj\.names)$/i.test(name));
    return hasConfig || labels.some((name) => inFolder(name, 'labels')) ? 60 : 20;
  },

  createExporter(job) {
    const order = job.classes.map((entry) => entry.key);
    return {
      frame(frame) {
        if (frame.width === undefined || frame.height === undefined) return [];
        const lines = boxesOf(frame.objects).flatMap((object) => {
          const index = order.indexOf(object.classKey);
          if (index < 0) return [];
          const [x, y, w, h] = object.bbox;
          const numbers = [(x + w / 2) / frame.width!, (y + h / 2) / frame.height!, w / frame.width!, h / frame.height!];
          return [`${index} ${numbers.map((value) => Number(value.toFixed(6))).join(' ')}`];
        });
        return [{ name: `labels/${frame.stem}.txt`, data: lines.length ? `${lines.join('\n')}\n` : '' }];
      },
      finish() {
        const names = job.classes.map((entry, index) => `  ${index}: ${JSON.stringify(entry.name)}`).join('\n');
        return [
          { name: 'data.yaml', data: `# images are not part of this export; point path/train/val at them\npath: .\ntrain: images\nval: images\nnc: ${job.classes.length}\nnames:\n${names}\n` }
        ];
      }
    };
  },

  async parse({ names, read }, { sizeOf }): Promise<ImportedLabels> {
    const warnings: string[] = [];
    let classes: string[] = [];
    const yamlFile = names.find((name) => /(^|\/)data\.ya?ml$/i.test(name));
    const listFile = names.find((name) => /(^|\/)(classes\.txt|obj\.names)$/i.test(name));
    if (yamlFile) classes = parseYamlNames((await read(yamlFile)).toString('utf8'));
    else if (listFile) classes = (await read(listFile)).toString('utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    const frames: ImportedFrame[] = [];
    const unsized: string[] = [];
    let highest = classes.length - 1;
    for (const name of names.filter(isLabelFile)) {
      const stem = stemOfFile(name);
      const size = sizeOf(stem);
      if (!size) {
        unsized.push(stem);
        continue;
      }
      const boxes: ImportedFrame['boxes'] = [];
      const text = (await read(name)).toString('utf8');
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        const values = parts.map(Number);
        if (values.some((value) => !Number.isFinite(value))) continue;
        const [index, ...rest] = values;
        let bbox: [number, number, number, number] | undefined;
        let score: number | undefined;
        if (rest.length === 4 || rest.length === 5) {
          const [cx, cy, w, h] = rest;
          bbox = [(cx - w / 2) * size.width, (cy - h / 2) * size.height, w * size.width, h * size.height];
          if (rest.length === 5) score = rest[4];
        } else if (rest.length >= 6 && rest.length % 2 === 0) {
          // YOLO-seg polygon: the box around it is what a box class can use.
          const absolute = rest.map((value, i) => (i % 2 === 0 ? value * size.width : value * size.height));
          bbox = boundsOf(absolute);
        }
        if (!bbox || !Number.isInteger(index) || index < 0) continue;
        highest = Math.max(highest, index);
        boxes.push({ className: classes[index] || `class_${index}`, bbox: tidyBox(bbox), ...(score !== undefined ? { score } : {}) });
      }
      frames.push({ stem, boxes, ...(text.trim() === '' ? { negative: true as const } : {}) });
    }
    for (let index = 0; index <= highest; index++) {
      if (!classes[index]) {
        classes[index] = `class_${index}`;
        warnings.push(`class ${index} has no name in the file; it is called class_${index}`);
      }
    }
    return { classes, frames, warnings, unsized };
  }
};

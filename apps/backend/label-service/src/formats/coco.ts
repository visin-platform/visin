import type { RawMask } from '../utils/mask';
import { boundsOf, boxesOf, fillPolygon, hasExtension, parseJson, stemOfFile, tidyBox, baseName } from './helpers';
import type { FormatModule, ImportedFrame, ImportedLabels } from './types';

interface CocoRle {
  size: [number, number];
  counts: number[] | string;
}

interface CocoFile {
  images?: { id: number | string; file_name?: string; width?: number; height?: number }[];
  categories?: { id: number | string; name?: string }[];
  annotations?: {
    image_id: number | string;
    category_id: number | string;
    bbox?: number[];
    iscrowd?: number;
    score?: number;
    segmentation?: CocoRle | number[][] | unknown;
  }[];
}

/**
 * Run lengths of one class's pixels in COCO's order: column by column, starting
 * with a run of background. Written as the plain list of counts, which is valid
 * COCO RLE and which pycocotools reads as is.
 */
const encodeRle = (
  mask: RawMask,
  value: number
): { counts: number[]; area: number; bbox: [number, number, number, number] } | undefined => {
  const { width, height, data } = mask;
  const counts: number[] = [];
  let current = 0;
  let run = 0;
  let area = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const on = data[y * width + x] === value ? 1 : 0;
      if (on) {
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (on === current) run++;
      else {
        counts.push(run);
        current = on;
        run = 1;
      }
    }
  }
  counts.push(run);
  return area === 0 ? undefined : { counts, area, bbox: [minX, minY, maxX - minX + 1, maxY - minY + 1] };
};

/** pycocotools' compressed counts string, which most COCO files carry. */
const decodeCountsString = (text: string): number[] => {
  const counts: number[] = [];
  let p = 0;
  while (p < text.length) {
    let x = 0;
    let k = 0;
    let more = true;
    while (more && p < text.length) {
      const c = text.charCodeAt(p) - 48;
      x |= (c & 0x1f) << (5 * k);
      more = (c & 0x20) !== 0;
      p++;
      k++;
      if (!more && c & 0x10) x |= -1 << (5 * k);
    }
    if (counts.length > 2) x += counts[counts.length - 2];
    counts.push(x);
  }
  return counts;
};

const paintRle = (mask: RawMask, rle: CocoRle, value: number): boolean => {
  const [h, w] = rle.size;
  if (h !== mask.height || w !== mask.width) return false;
  const counts = typeof rle.counts === 'string' ? decodeCountsString(rle.counts) : rle.counts;
  let position = 0;
  let on = false;
  for (const count of counts) {
    if (on) {
      for (let k = 0; k < count; k++) {
        const index = position + k;
        mask.data[(index % h) * w + Math.floor(index / h)] = value;
      }
    }
    position += count;
    on = !on;
  }
  return true;
};

export const coco: FormatModule = {
  id: 'coco',
  name: 'COCO',
  description: 'One annotations.json with boxes and RLE masks. Read by most detection and segmentation frameworks.',
  boxes: true,
  masks: true,

  async detect({ names, read }) {
    for (const name of names.filter((candidate) => hasExtension(candidate, '.json')).slice(0, 8)) {
      const file = parseJson<CocoFile>(await read(name));
      if (file && Array.isArray(file.images) && Array.isArray(file.annotations) && Array.isArray(file.categories)) {
        return 90;
      }
    }
    return 0;
  },

  createExporter(job) {
    const images: unknown[] = [];
    const annotations: unknown[] = [];
    let annotationId = 1;
    const categoryOf = new Map(job.classes.map((entry) => [entry.key, entry.maskIndex]));
    return {
      frame(frame) {
        const imageId = images.length + 1;
        images.push({
          id: imageId,
          file_name: baseName(frame.path),
          width: frame.width ?? frame.mask?.width ?? 0,
          height: frame.height ?? frame.mask?.height ?? 0
        });
        for (const object of boxesOf(frame.objects)) {
          const category = categoryOf.get(object.classKey);
          if (category === undefined) continue;
          const [x, y, w, h] = object.bbox;
          annotations.push({
            id: annotationId++,
            image_id: imageId,
            category_id: category,
            bbox: [x, y, w, h],
            area: w * h,
            iscrowd: 0,
            ...(object.score !== undefined ? { score: object.score } : {})
          });
        }
        if (frame.mask) {
          // A semantic mask has no instances, so each class's region is one
          // crowd-style RLE annotation, which is how COCO stuff classes are stored.
          const present = new Set(frame.mask.data);
          for (const entry of job.classes) {
            if (!present.has(entry.maskIndex)) continue;
            const rle = encodeRle(frame.mask, entry.maskIndex);
            if (!rle) continue;
            annotations.push({
              id: annotationId++,
              image_id: imageId,
              category_id: entry.maskIndex,
              segmentation: { size: [frame.mask.height, frame.mask.width], counts: rle.counts },
              bbox: rle.bbox,
              area: rle.area,
              iscrowd: 1
            });
          }
        }
        return [];
      },
      finish() {
        const document = {
          info: { description: job.name, version: '1.0' },
          licenses: [],
          images,
          annotations,
          categories: job.classes.map((entry) => ({ id: entry.maskIndex, name: entry.name, supercategory: '' }))
        };
        return [{ name: 'annotations.json', data: JSON.stringify(document) }];
      }
    };
  },

  async parse({ names, read }, { sizeOf }): Promise<ImportedLabels> {
    const warnings: string[] = [];
    let file: CocoFile | undefined;
    for (const name of names.filter((candidate) => hasExtension(candidate, '.json'))) {
      const parsed = parseJson<CocoFile>(await read(name));
      if (parsed && Array.isArray(parsed.images) && Array.isArray(parsed.annotations)) {
        file = parsed;
        break;
      }
    }
    if (!file) return { classes: [], frames: [], warnings: ['no COCO annotations file found'] };

    const categories = [...(file.categories || [])].sort((a, b) => Number(a.id) - Number(b.id));
    const classes = categories.map((category) => String(category.name ?? category.id));
    const positionOf = new Map(categories.map((category, i) => [String(category.id), i + 1]));

    const byImage = new Map<string, NonNullable<CocoFile['annotations']>>();
    for (const annotation of file.annotations || []) {
      const key = String(annotation.image_id);
      byImage.set(key, [...(byImage.get(key) || []), annotation]);
    }

    const frames: ImportedFrame[] = [];
    for (const image of file.images || []) {
      if (!image.file_name) continue;
      const stem = stemOfFile(image.file_name);
      const size = sizeOf(stem) || (image.width && image.height ? { width: image.width, height: image.height } : undefined);
      const boxes: ImportedFrame['boxes'] = [];
      let mask: RawMask | undefined;
      for (const annotation of byImage.get(String(image.id)) || []) {
        const position = positionOf.get(String(annotation.category_id));
        if (!position) continue;
        const className = classes[position - 1];
        const crowd = annotation.iscrowd === 1;
        const segmentation = annotation.segmentation;
        let bbox: [number, number, number, number] | undefined;

        if (size && segmentation) {
          mask = mask || { width: size.width, height: size.height, data: new Uint8Array(size.width * size.height) };
          if (Array.isArray(segmentation)) {
            for (const polygon of segmentation as number[][]) {
              if (Array.isArray(polygon)) {
                fillPolygon(mask, polygon, position);
                bbox = bbox || boundsOf(polygon);
              }
            }
          } else if (typeof segmentation === 'object' && (segmentation as CocoRle).counts !== undefined) {
            if (!paintRle(mask, segmentation as CocoRle, position)) {
              warnings.push(`${image.file_name}: mask size differs from the frame`);
            }
          }
        }
        if (!crowd) {
          const given = annotation.bbox && annotation.bbox.length === 4 ? (annotation.bbox as [number, number, number, number]) : bbox;
          if (given && given[2] > 0 && given[3] > 0) {
            boxes.push({ className, bbox: tidyBox(given), ...(annotation.score !== undefined ? { score: annotation.score } : {}) });
          }
        }
      }
      frames.push({ stem, boxes, ...(mask ? { mask } : {}), ...(!byImage.has(String(image.id)) ? { negative: true as const } : {}) });
    }
    return { classes, frames, warnings };
  }
};

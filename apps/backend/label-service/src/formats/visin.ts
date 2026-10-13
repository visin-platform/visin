import type { RawMask } from '../utils/mask';
import { decodePng, encodeGrayscalePng } from '../utils/png';
import { parseJson, stemOfFile, tidyBox } from './helpers';
import type { FormatModule, ImportedFrame, ImportedLabels } from './types';

interface NativeJob {
  format?: string;
  classes?: { key: string; name: string; maskIndex: number }[];
}

interface NativeLine {
  stem?: string;
  frame?: string;
  objects?: { class: string; bbox: number[]; source?: string; score?: number }[];
  mask?: string | null;
}

/** Visin's own bundle: lossless, so it is also what a job is moved between installs as. */
export const visin: FormatModule = {
  id: 'visin',
  name: 'Visin',
  description: 'annotations.jsonl, class-index mask PNGs and job.json. Lossless; keeps classes and where each box came from.',
  boxes: true,
  masks: true,

  async detect({ names }) {
    return names.some((name) => /(^|\/)job\.json$/i.test(name)) && names.some((name) => /(^|\/)annotations\.jsonl$/i.test(name))
      ? 100
      : 0;
  },

  createExporter(job) {
    const keyOf = new Map(job.classes.map((entry) => [entry.key, entry.key]));
    const lines: string[] = [];
    return {
      frame(frame) {
        lines.push(
          JSON.stringify({
            stem: frame.stem,
            frame: frame.path,
            width: frame.width ?? frame.mask?.width ?? null,
            height: frame.height ?? frame.mask?.height ?? null,
            objects: frame.objects
              .filter((object) => keyOf.has(object.classKey))
              .map((object) => ({
                id: object.id,
                class: object.classKey,
                bbox: object.bbox,
                source: object.source,
                ...(object.score !== undefined ? { score: object.score } : {})
              })),
            mask: frame.mask ? `masks/${frame.stem}.png` : null
          })
        );
        return frame.mask
          ? [{ name: `masks/${frame.stem}.png`, data: encodeGrayscalePng(frame.mask.width, frame.mask.height, frame.mask.data) }]
          : [];
      },
      finish() {
        const document = {
          format: 'visin',
          version: 1,
          name: job.name,
          note: 'A mask pixel is the maskIndex of its class; 0 is unlabeled.',
          classes: job.classes.map((entry) => ({
            key: entry.key,
            name: entry.name,
            color: entry.color,
            maskIndex: entry.maskIndex,
            tools: entry.tools,
            ...(entry.hotkey ? { hotkey: entry.hotkey } : {}),
            ...(entry.modelClass ? { modelClass: entry.modelClass } : {})
          }))
        };
        return [
          { name: 'annotations.jsonl', data: lines.length ? `${lines.join('\n')}\n` : '' },
          { name: 'job.json', data: `${JSON.stringify(document, null, 2)}\n` }
        ];
      }
    };
  },

  async parse({ names, read }, { sizeOf }): Promise<ImportedLabels> {
    const warnings: string[] = [];
    const jobName = names.find((name) => /(^|\/)job\.json$/i.test(name));
    const document = jobName ? parseJson<NativeJob>(await read(jobName)) : undefined;
    const classEntries = document?.classes || [];
    // Mask values are maskIndexes, which can leave holes; the holes get a name no
    // job class will match so the positions still line up.
    const top = classEntries.reduce((max, entry) => Math.max(max, entry.maskIndex), 0);
    const classes = Array.from({ length: top }, (_, i) => classEntries.find((entry) => entry.maskIndex === i + 1)?.name ?? '');
    const nameOfKey = new Map(classEntries.map((entry) => [entry.key, entry.name]));

    const linesName = names.find((name) => /(^|\/)annotations\.jsonl$/i.test(name));
    const frames: ImportedFrame[] = [];
    const unsized: string[] = [];
    const lines = linesName ? (await read(linesName)).toString('utf8').split(/\r?\n/) : [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: NativeLine;
      try {
        entry = JSON.parse(line) as NativeLine;
      } catch {
        warnings.push('a line of annotations.jsonl is not valid JSON');
        continue;
      }
      const stem = entry.stem || (entry.frame ? stemOfFile(entry.frame) : '');
      if (!stem) continue;
      if (!sizeOf(stem)) {
        unsized.push(stem);
        continue;
      }
      const frame: ImportedFrame = {
        stem,
        ...(Array.isArray(entry.objects) && entry.objects.length === 0 && !entry.mask ? { negative: true as const } : {}),
        boxes: (entry.objects || [])
          .filter((object) => Array.isArray(object.bbox) && object.bbox.length === 4)
          .map((object) => ({
            className: nameOfKey.get(object.class) ?? object.class,
            bbox: tidyBox(object.bbox as [number, number, number, number]),
            ...(object.score !== undefined ? { score: object.score } : {})
          }))
      };
      if (entry.mask && names.includes(entry.mask)) {
        const png = decodePng(await read(entry.mask));
        const mask: RawMask = { width: png.width, height: png.height, data: Uint8Array.from(png.data) };
        frame.mask = mask;
      }
      frames.push(frame);
    }
    return { classes, frames, warnings, unsized };
  }
};

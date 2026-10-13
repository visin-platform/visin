import { BadRequestError } from '@visin/backend-core';
import type { FormatId } from '../validation/jobSchemas';
import { coco } from './coco';
import { semanticPng } from './semanticPng';
import { visin } from './visin';
import { voc } from './voc';
import { yolo } from './yolo';
import type { FormatModule, ImportSource } from './types';

export * from './types';

/** In the order the export dialog lists them. */
export const FORMATS: FormatModule[] = [yolo, coco, voc, semanticPng, visin];

export const getFormat = (id: FormatId): FormatModule => {
  const found = FORMATS.find((format) => format.id === id);
  if (!found) throw new BadRequestError(`Unknown format "${id}"`);
  return found;
};

/** What the front shows: the formats and what each can hold, from one place. */
export const describeFormats = (): Pick<FormatModule, 'id' | 'name' | 'description' | 'boxes' | 'masks'>[] =>
  FORMATS.map(({ id, name, description, boxes, masks }) => ({ id, name, description, boxes, masks }));

/** The format an archive most looks like, or undefined when none claims it. */
export const detectFormat = async (source: ImportSource): Promise<FormatModule | undefined> => {
  let best: { format: FormatModule; score: number } | undefined;
  for (const format of FORMATS) {
    const score = await format.detect(source);
    if (score > 0 && (!best || score > best.score)) best = { format, score };
  }
  return best?.format;
};

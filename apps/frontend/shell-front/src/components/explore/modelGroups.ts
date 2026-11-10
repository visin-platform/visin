import type { ExploreModel } from '../../services/exploreApi';

export interface ModelGroup {
  /** the first row of the checkpoint, which the card is drawn from */
  row: ExploreModel;
  /** every format the checkpoint is stored in, in the order listed */
  formats: string[];
}

const EXTENSION = /\.(onnx|pth)$/i;

/** What names one checkpoint across its formats: the run, and the file name without its format. */
const keyOf = ({ model, training }: ExploreModel): string =>
  model.provider === 'visin' && model.filename
    ? `${training._id}:${model.filename.replace(EXTENSION, '')}`
    : `${training._id}:${model._id}`;

/**
 * One entry per checkpoint: a checkpoint stored as both ONNX and PyTorch is listed twice by the registry, once per
 * file, and a gallery of cards should show it once, with both formats named. Order follows the first appearance.
 */
export function groupFormats(rows: ExploreModel[]): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    const format = row.model.format;
    if (!group) groups.set(key, { row, formats: format ? [format] : [] });
    else if (format && !group.formats.includes(format)) group.formats.push(format);
  }
  return [...groups.values()];
}

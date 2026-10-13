import type { BoxObject, JobClass } from '../types';
import { clampBox, isDrawable } from '../editor/boxes';
import { newBoxId } from '../editor/ids';
import type { DetectedBox } from './client';

const norm = (value: string): string => value.trim().toLowerCase().replace(/[\s_-]+/g, ' ');

/**
 * The job class a model's class name belongs to: the one it is named after, or
 * one that says it is called that (`modelClass`). Annotators never map classes —
 * a name that matches nothing is simply not shown.
 */
export const classFor = (classes: JobClass[], modelClass: string, need: 'box' | 'mask'): JobClass | undefined => {
  const wanted = norm(modelClass);
  const fits = classes.filter((entry) => entry.tools.includes(need));
  return (
    fits.find((entry) => entry.modelClass !== undefined && norm(entry.modelClass) === wanted) ??
    fits.find((entry) => norm(entry.name) === wanted || norm(entry.key) === wanted)
  );
};

/** A detector's boxes as suggestions on this frame: matched classes only, kept inside the frame. */
export const toSuggestions = (
  detected: DetectedBox[],
  classes: JobClass[],
  width: number,
  height: number
): BoxObject[] => {
  const boxes: BoxObject[] = [];
  for (const found of detected) {
    const target = classFor(classes, found.class, 'box');
    if (!target) continue;
    const bbox = clampBox(found.bbox, width, height);
    if (!isDrawable(bbox)) continue;
    boxes.push({ id: newBoxId(), classKey: target.key, bbox, source: 'model', score: found.score });
  }
  return boxes;
};

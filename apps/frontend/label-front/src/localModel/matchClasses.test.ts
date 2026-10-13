import { describe, expect, it } from 'vitest';
import { classFor, toSuggestions } from './matchClasses';
import { carClass, roadClass, signClass } from '../test/fixtures';
import type { JobClass } from '../types';

const classes: JobClass[] = [
  carClass,
  roadClass,
  { ...signClass, name: 'Traffic sign', key: 'sign', modelClass: 'stop sign' }
];

describe('classFor', () => {
  it('matches a model class to a job class by name or key, ignoring case and spacing', () => {
    expect(classFor(classes, 'car', 'box')?.key).toBe('car');
    expect(classFor(classes, ' CAR ', 'box')?.key).toBe('car');
    expect(classFor([{ ...carClass, name: 'Traffic Light', key: 'traffic-light' }], 'traffic light', 'box')?.key).toBe('traffic-light');
    expect(classFor([{ ...carClass, name: 'Fire hydrant' }], 'fire_hydrant', 'box')?.name).toBe('Fire hydrant');
  });

  it('prefers a class that says it is the model’s name for it', () => {
    expect(classFor(classes, 'stop sign', 'box')?.key).toBe('sign');
  });

  it('only offers a class that takes the kind of label asked for', () => {
    expect(classFor(classes, 'road', 'box')).toBeUndefined();
    expect(classFor(classes, 'road', 'mask')?.key).toBe('road');
  });

  it('finds nothing for a name no class answers to', () => {
    expect(classFor(classes, 'giraffe', 'box')).toBeUndefined();
  });
});

describe('toSuggestions', () => {
  it('turns detections into model boxes for the classes the job has, kept inside the frame', () => {
    const boxes = toSuggestions(
      [
        { bbox: [10, 10, 50, 40], class: 'car', score: 0.9 },
        { bbox: [-5, 0, 30, 30], class: 'stop sign', score: 0.6 },
        { bbox: [0, 0, 20, 20], class: 'giraffe', score: 0.99 },
        { bbox: [300, 300, 20, 20], class: 'car', score: 0.8 },
        { bbox: [0, 0, 1, 1], class: 'car', score: 0.7 },
        { bbox: [0, 0, 20, 20], class: 'road', score: 0.7 }
      ],
      classes,
      200,
      100
    );

    expect(boxes.map((box) => [box.classKey, box.bbox, box.score, box.source])).toEqual([
      ['car', [10, 10, 50, 40], 0.9, 'model'],
      ['sign', [0, 0, 25, 30], 0.6, 'model']
    ]);
    expect(new Set(boxes.map((box) => box.id)).size).toBe(2);
  });
});

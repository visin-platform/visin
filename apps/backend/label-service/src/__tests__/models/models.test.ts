import { Types } from 'mongoose';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnnotation } from '../../models/LabelAnnotation';
import { LabelSuggestion } from '../../models/LabelSuggestion';

const oid = () => new Types.ObjectId();

describe('LabelTask model', () => {
  it('validates a task with a camera frame and overlay sensors', () => {
    const task = new LabelTask({
      jobId: oid(),
      frame: { fileId: 'datasets/d/items/i/camera/a.jpg', path: 'camera/a.jpg', stem: 'a', width: 1363, height: 768 },
      order: 0,
      stratum: 'night',
      sensors: [
        { key: 'lidar', kind: 'image', fileId: 'datasets/d/items/i/lidar/a.png' },
        { key: 'radar', kind: 'points', points: [{ u: 10, v: 20, value: 3.5 }] },
      ],
    });

    expect(task.validateSync()).toBeUndefined();
    expect(task.answersCount).toBe(0);
    expect(task.answeredBy).toEqual([]);
    expect(task.skippedBy).toEqual([]);
    expect(task.sensors).toHaveLength(2);
  });

  it('requires jobId, order and a frame with its file', () => {
    const error = new LabelTask({}).validateSync();

    expect(error?.errors.jobId).toBeDefined();
    expect(error?.errors.order).toBeDefined();
    expect(error?.errors.frame).toBeDefined();

    const noFile = new LabelTask({ jobId: oid(), order: 0, frame: { path: 'p', stem: 's' } }).validateSync();
    expect(noFile?.errors['frame.fileId']).toBeDefined();
  });

  it('leaves sensors absent rather than empty on a camera-only task', () => {
    const task = new LabelTask({ jobId: oid(), order: 0, frame: { fileId: 'f', path: 'p', stem: 's' } });
    expect(task.sensors).toBeUndefined();
  });

  it('stores its documents in their own collections', () => {
    expect(LabelTask.collection.name).toBe('label_tasks');
    expect(LabelAnnotation.collection.name).toBe('label_annotations');
    expect(LabelSuggestion.collection.name).toBe('label_suggestions');
  });
});

describe('LabelAnnotation model', () => {
  const base = { taskId: oid(), jobId: oid(), userId: 'u1', userEmail: 'A@B.com' };

  it('lowercases the email and starts as a draft with no objects', () => {
    const annotation = new LabelAnnotation(base);

    expect(annotation.validateSync()).toBeUndefined();
    expect(annotation.userEmail).toBe('a@b.com');
    expect(annotation.status).toBe('draft');
    expect(annotation.objects).toEqual([]);
    expect(annotation.mask).toBeUndefined();
  });

  it('keeps boxes with their class, source and score, and a mask reference', () => {
    const annotation = new LabelAnnotation({
      ...base,
      status: 'done',
      objects: [{ id: 'o1', classKey: 'car', bbox: [1, 2, 30, 40], source: 'model', score: 0.8 }],
      mask: { fileId: 'label/j/masks/m.png', width: 100, height: 50, pixels: { '1': 120 } },
    });

    expect(annotation.validateSync()).toBeUndefined();
    expect(annotation.objects[0].source).toBe('model');
    expect(annotation.mask?.pixels).toEqual({ '1': 120 });
  });

  it('rejects an unknown status or object source, and negative elapsedMs', () => {
    const error = new LabelAnnotation({
      ...base,
      status: 'accepted',
      objects: [{ id: 'o', classKey: 'c', bbox: [0, 0, 1, 1], source: 'robot' }],
      elapsedMs: -1,
    }).validateSync();

    expect(error?.errors.status).toBeDefined();
    expect(error?.errors['objects.0.source']).toBeDefined();
    expect(error?.errors.elapsedMs).toBeDefined();
  });
});

describe('LabelSuggestion model', () => {
  it('holds boxes and a mask for one task, from an import', () => {
    const suggestion = new LabelSuggestion({
      jobId: oid(),
      taskId: oid(),
      objects: [{ id: 'o1', classKey: 'car', bbox: [0, 0, 5, 5] }],
      mask: { fileId: 'label/j/suggestions/s.png', width: 10, height: 10, pixels: {} },
    });

    expect(suggestion.validateSync()).toBeUndefined();
    expect(suggestion.source).toBe('import');
  });
});

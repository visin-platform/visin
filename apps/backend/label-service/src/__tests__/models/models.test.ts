import { Types } from 'mongoose';
import { LabelBundle } from '../../models/LabelBundle';
import { LabelImage } from '../../models/LabelImage';
import { ImportJob } from '../../models/ImportJob';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnswer } from '../../models/LabelAnswer';

const oid = () => new Types.ObjectId();

describe('LabelBundle model', () => {
  it('applies defaults', () => {
    const bundle = new LabelBundle({
      name: 'Paper set',
      groupId: 'g1',
      createdBy: { userId: 'u1', email: 'A@B.com' },
    });

    expect(bundle.validateSync()).toBeUndefined();
    expect(bundle.status).toBe('empty');
    expect(bundle.counts.frames).toBe(0);
    expect(bundle.createdBy.email).toBe('a@b.com');
    expect(bundle.manifest).toBeUndefined();
  });

  it('requires name and groupId', () => {
    const error = new LabelBundle({}).validateSync();

    expect(error?.errors.name).toBeDefined();
    expect(error?.errors.groupId).toBeDefined();
  });
});

describe('LabelImage model', () => {
  it('validates a frame and a layer', () => {
    const frame = new LabelImage({
      bundleId: oid(),
      path: 'frames/a.png',
      stem: 'a',
      kind: 'frame',
      fileId: 'label-bundles/b/frames/a.png',
      size: 10,
      mimetype: 'image/png',
    });
    expect(frame.validateSync()).toBeUndefined();

    const layer = new LabelImage({
      bundleId: oid(),
      path: 'annotations/s/a.png',
      stem: 'a',
      kind: 'layer',
      annotationSet: 's',
      fileId: 'x',
      size: 10,
      mimetype: 'image/png',
    });
    expect(layer.validateSync()).toBeUndefined();
  });

  it('rejects unknown kinds', () => {
    const image = new LabelImage({
      bundleId: oid(),
      path: 'p',
      stem: 's',
      kind: 'video',
      fileId: 'x',
      size: 1,
      mimetype: 'video/mp4',
    });
    expect(image.validateSync()?.errors.kind).toBeDefined();
  });
});

describe('ImportJob model', () => {
  it('applies defaults', () => {
    const importJob = new ImportJob({ bundleId: oid(), zipFileId: 'z.zip' });

    expect(importJob.validateSync()).toBeUndefined();
    expect(importJob.status).toBe('pending');
    expect(importJob.processed).toBe(0);
    expect(importJob.fileErrors).toEqual([]);
  });
});

describe('LabelTask model', () => {
  it('validates a mask_toggle task payload', () => {
    const task = new LabelTask({
      jobId: oid(),
      labelImageId: oid(),
      order: 0,
      stratum: 'vehicle',
      payload: {
        layers: [{ set: 's', imageId: oid() }],
        maskMap: { imageId: oid(), masks: [{ id: 1, class: 'vehicle' }] },
      },
    });

    expect(task.validateSync()).toBeUndefined();
    expect(task.answersCount).toBe(0);
    expect(task.answeredBy).toEqual([]);
  });

  it('requires jobId, labelImageId, order', () => {
    const error = new LabelTask({}).validateSync();

    expect(error?.errors.jobId).toBeDefined();
    expect(error?.errors.labelImageId).toBeDefined();
    expect(error?.errors.order).toBeDefined();
  });
});

describe('LabelAnswer model', () => {
  it('lowercases the email and accepts either answer shape', () => {
    const answer = new LabelAnswer({
      taskId: oid(),
      jobId: oid(),
      userId: 'u1',
      userEmail: 'A@B.com',
      rejectedMaskIds: [1, 2],
      elapsedMs: 100,
    });

    expect(answer.validateSync()).toBeUndefined();
    expect(answer.userEmail).toBe('a@b.com');
  });

  it('rejects negative elapsedMs', () => {
    const answer = new LabelAnswer({
      taskId: oid(),
      jobId: oid(),
      userId: 'u1',
      userEmail: 'a@b.com',
      choiceKey: 'good',
      elapsedMs: -1,
    });
    expect(answer.validateSync()?.errors.elapsedMs).toBeDefined();
  });
});

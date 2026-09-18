import { Types } from 'mongoose';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnswer } from '../../models/LabelAnswer';

const oid = () => new Types.ObjectId();

describe('LabelTask model', () => {
  it('validates a mask_toggle task payload', () => {
    const task = new LabelTask({
      jobId: oid(),
      frame: { fileId: 'datasets/d/items/i/frames/a.jpg', path: 'frames/a.jpg', stem: 'a', width: 1363, height: 768 },
      order: 0,
      stratum: 'vehicle',
      payload: {
        layers: [{ set: 's', fileId: 'datasets/d/items/i/verify/a.png' }],
        maskMap: { fileId: 'datasets/d/items/i/verify/a.ids.png', masks: [{ id: 1, class: 'vehicle' }] },
      },
    });

    expect(task.validateSync()).toBeUndefined();
    expect(task.answersCount).toBe(0);
    expect(task.answeredBy).toEqual([]);
    expect(task.frame.path).toBe('frames/a.jpg');
  });

  it('requires jobId, order and a frame with its file', () => {
    const error = new LabelTask({}).validateSync();

    expect(error?.errors.jobId).toBeDefined();
    expect(error?.errors.order).toBeDefined();
    expect(error?.errors.frame).toBeDefined();

    const noFile = new LabelTask({ jobId: oid(), order: 0, frame: { path: 'p', stem: 's' } }).validateSync();
    expect(noFile?.errors['frame.fileId']).toBeDefined();
  });

  it('stores tasks, jobs and answers in their own collections', () => {
    expect(LabelTask.collection.name).toBe('label_tasks');
    expect(LabelAnswer.collection.name).toBe('label_answers');
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

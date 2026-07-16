import { LabelJob } from '../../models/LabelJob';

const validJob = {
  name: 'Mask verification',
  createdBy: { userId: 'u1', email: 'Owner@X.com' },
  groupId: 'g1',
  taskType: 'mask_toggle',
  question: { prompt: 'Mark all incorrect masks' },
};

describe('LabelJob model', () => {
  it('applies defaults and lowercases the creator email', () => {
    const job = new LabelJob(validJob);

    expect(job.validateSync()).toBeUndefined();
    expect(job.createdBy.email).toBe('owner@x.com');
    expect(job.status).toBe('draft');
    expect(job.redundancy).toBe(1);
    expect(job.bundleId).toBeUndefined();
  });

  it('requires name, groupId, taskType and question prompt', () => {
    const error = new LabelJob({}).validateSync();

    expect(error?.errors.name).toBeDefined();
    expect(error?.errors.groupId).toBeDefined();
    expect(error?.errors.taskType).toBeDefined();
    expect(error?.errors['question.prompt']).toBeDefined();
  });

  it('rejects unknown task types and statuses', () => {
    const error = new LabelJob({ ...validJob, taskType: 'bbox_draw', status: 'live' }).validateSync();

    expect(error?.errors.taskType).toBeDefined();
    expect(error?.errors.status).toBeDefined();
  });

  it('accepts single_choice with choices and hotkeys', () => {
    const job = new LabelJob({
      ...validJob,
      taskType: 'single_choice',
      question: {
        prompt: 'Frame quality?',
        choices: [
          { key: 'good', label: 'Good', hotkey: 'g' },
          { key: 'bad', label: 'Bad', hotkey: 'b' },
        ],
      },
    });

    expect(job.validateSync()).toBeUndefined();
    expect(job.question.choices).toHaveLength(2);
  });

  it('bounds redundancy between 1 and 10', () => {
    expect(new LabelJob({ ...validJob, redundancy: 0 }).validateSync()?.errors.redundancy).toBeDefined();
    expect(new LabelJob({ ...validJob, redundancy: 11 }).validateSync()?.errors.redundancy).toBeDefined();
    expect(new LabelJob({ ...validJob, redundancy: 3 }).validateSync()).toBeUndefined();
  });
});

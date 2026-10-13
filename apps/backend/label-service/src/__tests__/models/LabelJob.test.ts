import { LabelJob } from '../../models/LabelJob';

const validJob = {
  name: 'Street scenes',
  createdBy: { userId: 'u1', email: 'Owner@X.com' },
  datasetId: 'd1',
  sensors: [{ key: 'camera', group: 'frames' }],
  classes: [{ key: 'car', name: 'Car', color: '#ff0000', maskIndex: 1 }],
};

describe('LabelJob model', () => {
  it('applies defaults and lowercases the creator email', () => {
    const job = new LabelJob(validJob);

    expect(job.validateSync()).toBeUndefined();
    expect(job.createdBy.email).toBe('owner@x.com');
    expect(job.status).toBe('draft');
    expect(job.taskType).toBe('annotate');
    expect(job.redundancy).toBe(1);
    expect(job.classes[0].tools).toEqual(['box', 'mask']);
    expect(job.sensors[0].kind).toBe('image');
    expect(LabelJob.collection.name).toBe('label_jobs');
  });

  it('requires a name and creator, and keeps no group of its own', () => {
    const error = new LabelJob({}).validateSync();

    expect(error?.errors.name).toBeDefined();
    expect(new LabelJob({ ...validJob, groupId: 'g1' }).toObject()).not.toHaveProperty('groupId');
  });

  it('rejects unknown task types, statuses, sensors and tools', () => {
    const error = new LabelJob({
      ...validJob,
      taskType: 'single_choice',
      status: 'live',
      sensors: [{ key: 'sonar', group: 'g' }],
      classes: [{ key: 'a', name: 'A', color: '#000000', maskIndex: 1, tools: ['polygon'] }],
    }).validateSync();

    expect(error?.errors.taskType).toBeDefined();
    expect(error?.errors.status).toBeDefined();
    expect(error?.errors['sensors.0.key']).toBeDefined();
    expect(error?.errors['classes.0.tools.0']).toBeDefined();
  });

  it('keeps a class mask index within what a mask byte can hold for the job', () => {
    const at = (maskIndex: number) =>
      new LabelJob({ ...validJob, classes: [{ ...validJob.classes[0], maskIndex }] }).validateSync();

    expect(at(0)?.errors['classes.0.maskIndex']).toBeDefined();
    expect(at(101)?.errors['classes.0.maskIndex']).toBeDefined();
    expect(at(100)).toBeUndefined();
  });

  it('bounds redundancy between 1 and 10', () => {
    expect(new LabelJob({ ...validJob, redundancy: 0 }).validateSync()?.errors.redundancy).toBeDefined();
    expect(new LabelJob({ ...validJob, redundancy: 11 }).validateSync()?.errors.redundancy).toBeDefined();
    expect(new LabelJob({ ...validJob, redundancy: 3 }).validateSync()).toBeUndefined();
  });
});

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Project from '../../models/Project';
import Training from '../../models/Training';
import Epoch from '../../models/Epoch';
import { trainingService } from '../../services/trainingService';
import { getTrainingsQuerySchema, type TrainingSortField } from '../../validation/trainingSchemas';

const OWNER = '000000000000000000000001';

describe('sorting the trainings list', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterAll(async () => {
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });

  beforeEach(async () => {
    const cheap = await Project.create({ name: 'Cheap', ownerId: OWNER, isPublic: true, costing: { cpuRatePerHour: 1, gpuRatePerHour: 1 } });
    const dear = await Project.create({ name: 'Dear', ownerId: OWNER, isPublic: true, costing: { cpuRatePerHour: 10, gpuRatePerHour: 20 } });
    const unpriced = await Project.create({ name: 'Unpriced', ownerId: OWNER, isPublic: true });
    // [name, project, epoch seconds]: `alpha` runs longest but on the cheap rates.
    const runs: [string, { _id: unknown }, number[]][] = [
      ['alpha', cheap, [3600, 3600, 3600]],
      ['Bravo', dear, [3600]],
      ['charlie', unpriced, [7200, 7200]],
      ['delta', dear, []]
    ];
    for (const [name, project, seconds] of runs) {
      const training = await Training.create({ name, uuid: name.toLowerCase(), projectId: String(project._id) });
      await Epoch.create(seconds.map((epoch_time, i) => ({
        trainingId: String(training._id), training_uuid: training.uuid, epoch_uuid: `${training.uuid}-${i}`,
        epoch: i, epoch_time, timestamp: new Date(), results: {}
      })));
    }
    // A deleted epoch counts for nothing.
    const bravo = await Training.findOne({ uuid: 'bravo' });
    await Epoch.create({
      trainingId: String(bravo!._id), training_uuid: 'bravo', epoch_uuid: 'bravo-deleted', epoch: 9, epoch_time: 99999,
      timestamp: new Date(), results: {}, deletedAt: new Date()
    });
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  });

  const names = async (sortBy: TrainingSortField, order: 'asc' | 'desc', page = 1, limit = 10) => {
    const query = getTrainingsQuerySchema.parse({ sortBy, order, page, limit });
    const result = await trainingService.getTrainings(OWNER, {}, { page, limit, sortBy: query.sortBy, order: query.order });
    return (result as { trainings: { name: string }[] }).trainings.map(t => t.name);
  };

  it('sorts names as people read them, whatever the case', async () => {
    expect(await names('name', 'asc')).toEqual(['alpha', 'Bravo', 'charlie', 'delta']);
    expect(await names('name', 'desc')).toEqual(['delta', 'charlie', 'Bravo', 'alpha']);
  });

  it('sorts by epoch count and training time across every run, not just the page', async () => {
    expect(await names('epochCount', 'desc')).toEqual(['alpha', 'charlie', 'Bravo', 'delta']);
    expect(await names('totalTime', 'desc')).toEqual(['charlie', 'alpha', 'Bravo', 'delta']);
    expect(await names('totalTime', 'desc', 1, 1)).toEqual(['charlie']);
    expect(await names('totalTime', 'desc', 2, 1)).toEqual(['alpha']);
    expect(await names('totalTime', 'asc')).toEqual(['delta', 'Bravo', 'alpha', 'charlie']);
  });

  it('sorts by cost at each run\'s own project rates, unpriced runs last either way', async () => {
    // alpha: 3h × (1+1) = 6; Bravo: 1h × (10+20) = 30; delta: 0h = 0; charlie: no rates.
    expect(await names('totalCost', 'desc')).toEqual(['Bravo', 'alpha', 'delta', 'charlie']);
    expect(await names('totalCost', 'asc')).toEqual(['delta', 'alpha', 'Bravo', 'charlie']);
    // cpu: alpha 3, Bravo 10; gpu: alpha 3, Bravo 20.
    expect(await names('cpuCost', 'desc')).toEqual(['Bravo', 'alpha', 'delta', 'charlie']);
    expect(await names('gpuCost', 'asc')).toEqual(['delta', 'alpha', 'Bravo', 'charlie']);
  });

  it('keeps the metrics and costs on each returned run', async () => {
    const result = await trainingService.getTrainings(OWNER, {}, { page: 1, limit: 1, sortBy: 'totalCost', order: -1 });
    expect((result as { trainings: unknown[] }).trainings[0]).toMatchObject({
      name: 'Bravo',
      metrics: { epochCount: 1, totalTime: 3600, cpuCost: 10, gpuCost: 20, totalCost: 30 }
    });
  });

  it('searches while sorting, by a stored field and by a computed one', async () => {
    await Training.syncIndexes();
    for (const sortBy of ['name', 'updatedAt', 'totalTime'] as const) {
      const result = await trainingService.getTrainings(OWNER, { search: 'alpha' }, { page: 1, limit: 10, sortBy, order: 1 });
      expect((result as { trainings: { name: string }[] }).trainings.map(t => t.name)).toEqual(['alpha']);
    }
  });

  it('defaults to the most recently updated first', async () => {
    expect(getTrainingsQuerySchema.parse({})).toMatchObject({ sortBy: 'updatedAt', order: -1 });
    expect(getTrainingsQuerySchema.safeParse({ sortBy: 'password' }).success).toBe(false);
  });
});

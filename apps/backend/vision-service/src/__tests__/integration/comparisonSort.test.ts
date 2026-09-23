import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Project from '../../models/Project';
import Comparison from '../../models/Comparison';
import { getComparisons } from '../../services/comparisonService';
import { getComparisonsQuerySchema } from '../../validation/comparisonSchemas';

const OWNER = '000000000000000000000001';

describe('sorting comparisons by how many items they hold', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterAll(async () => {
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });

  beforeEach(async () => {
    const project = await Project.create({ name: 'Public', ownerId: OWNER, isPublic: true });
    const hidden = await Project.create({ name: 'Private', ownerId: OWNER });
    await Comparison.create([
      { uuid: 'two', name: 'Two', type: 'trainings', itemIds: ['a', 'b'], projectId: String(project._id) },
      { uuid: 'five', name: 'Five', type: 'trainings', itemIds: ['a', 'b', 'c', 'd', 'e'], projectId: String(project._id) },
      { uuid: 'one', name: 'One', type: 'trainings', itemIds: ['a'], projectId: String(project._id) },
      { uuid: 'secret', name: 'Secret', type: 'trainings', itemIds: Array(9).fill('x'), projectId: String(hidden._id) }
    ]);
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  });

  const names = async (query: Record<string, unknown>) =>
    (await getComparisons(getComparisonsQuerySchema.parse(query), undefined)).comparisons.map(c => c.name);

  it('orders every visible comparison by item count, across pages', async () => {
    expect(await names({ sortBy: 'itemCount', order: 'desc' })).toEqual(['Five', 'Two', 'One']);
    expect(await names({ sortBy: 'itemCount', order: 'asc' })).toEqual(['One', 'Two', 'Five']);
    expect(await names({ sortBy: 'itemCount', order: 'desc', page: 2, limit: 1 })).toEqual(['Two']);
  });

  it('counts the same total whichever way it sorts', async () => {
    const result = await getComparisons(getComparisonsQuerySchema.parse({ sortBy: 'itemCount', limit: 1 }), undefined);
    expect(result.pagination.total).toBe(3);
  });
});

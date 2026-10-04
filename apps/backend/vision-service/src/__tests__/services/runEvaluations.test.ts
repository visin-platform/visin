import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Evaluation from '../../models/Evaluation';
import { purgeRunEvaluations, restoreRunEvaluations, trashRunEvaluations } from '../../services/runEvaluations';
import { recordTests } from '../fixtures/recordedTest';

describe('run evaluation lifecycle', () => {
  let mongo: MongoMemoryServer;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
  }, 120_000);
  afterEach(async () => { await Evaluation.deleteMany({}); });
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

  it('treats an empty scope as no work, preserving all records', async () => {
    await recordTests([{ projectId: 'p', trainingId: 'run', test_uuid: 'test' }]);
    await trashRunEvaluations({}, new Date());
    await restoreRunEvaluations({ trainingIds: [], epochUuids: [] }, new Date());
    await purgeRunEvaluations({});
    expect(await Evaluation.countDocuments({ deletedAt: null })).toBe(1);
  });

  it('purges only unranked results in the supplied run or epoch scope, including trashed ones', async () => {
    await recordTests([
      { projectId: 'p', trainingId: 'run', test_uuid: 'run' },
      { projectId: 'p', epoch_uuid: 'epoch', test_uuid: 'epoch', deletedAt: new Date() },
      { projectId: 'p', trainingId: 'run', test_uuid: 'ranked', suite: { id: 's', slug: 's', version: 1, digest: 'd' } },
      { projectId: 'p', trainingId: 'other', test_uuid: 'other' }
    ]);
    await purgeRunEvaluations({ trainingIds: ['run'], epochUuids: ['epoch'] });
    expect((await Evaluation.find()).map(row => row.uuid).sort()).toEqual(['other', 'ranked']);
    await purgeRunEvaluations({ trainingIds: ['other'] });
    expect((await Evaluation.find()).map(row => row.uuid)).toEqual(['ranked']);
  });
});

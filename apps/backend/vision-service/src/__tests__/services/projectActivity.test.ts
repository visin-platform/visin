import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Project from '../../models/Project';
import Training from '../../models/Training';
import { touchProjectActivity } from '../../services/projectActivity';
import { touchTraining } from '../../services/trainingHeartbeatService';

const OWNER = '000000000000000000000001';
const at = (iso: string) => new Date(iso);

/** "Recently active" is kept by a throttled write that costs nothing when a project was just marked. */
describe('project activity, with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([Project, Training].map((model) => model.deleteMany({})));
  });

  const project = async (fields: Record<string, unknown> = {}) =>
    String(
      (
        await Project.collection.insertOne({
          name: 'P', slug: 'p', visibility: 'public', owner: { kind: 'user', id: OWNER }, createdBy: OWNER,
          createdAt: at('2026-09-01T00:00:00Z'), updatedAt: at('2026-09-01T00:00:00Z'), ...fields
        })
      ).insertedId
    );
  const activity = async (id: string) => (await Project.collection.findOne({ _id: new mongoose.Types.ObjectId(id) }))?.lastActivityAt as Date | undefined;

  it('marks a project that has never been marked', async () => {
    const id = await project();

    await touchProjectActivity(id, at('2026-09-10T00:00:00Z'));

    expect(await activity(id)).toEqual(at('2026-09-10T00:00:00Z'));
  });

  it('marks again once the last mark is a minute old, and not before', async () => {
    const id = await project({ lastActivityAt: at('2026-09-10T00:00:00Z') });

    await touchProjectActivity(id, at('2026-09-10T00:00:30Z'));
    expect(await activity(id)).toEqual(at('2026-09-10T00:00:00Z'));

    await touchProjectActivity(id, at('2026-09-10T00:01:01Z'));
    expect(await activity(id)).toEqual(at('2026-09-10T00:01:01Z'));
  });

  it('leaves the project\'s own updatedAt alone: activity is not an edit', async () => {
    const id = await project();

    await touchProjectActivity(id, at('2026-09-10T00:00:00Z'));

    const row = await Project.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect(row?.updatedAt).toEqual(at('2026-09-01T00:00:00Z'));
  });

  it('does nothing for no project, a project that is gone, or an id that is not one — and never fails the change behind it', async () => {
    await expect(touchProjectActivity(undefined)).resolves.toBeUndefined();
    await expect(touchProjectActivity(new mongoose.Types.ObjectId().toString())).resolves.toBeUndefined();
    await expect(touchProjectActivity('not-an-id')).resolves.toBeUndefined();
  });

  it('is what a run posting epochs does to its project, through the heartbeat every epoch write makes', async () => {
    const id = await project();
    const training = await Training.collection.insertOne({
      uuid: 'u', name: 'run', ownerId: OWNER, projectId: id, status: 'running', createdAt: new Date(), updatedAt: new Date()
    });

    await touchTraining(String(training.insertedId));

    expect(await activity(id)).toBeInstanceOf(Date);
  });

  it('leaves a trashed run, which no longer counts as anything happening, out of it', async () => {
    const id = await project();
    const training = await Training.collection.insertOne({
      uuid: 'u2', name: 'run', ownerId: OWNER, projectId: id, status: 'running', deletedAt: new Date(), createdAt: new Date(), updatedAt: new Date()
    });

    await touchTraining(String(training.insertedId));

    expect(await activity(id)).toBeUndefined();
  });
});

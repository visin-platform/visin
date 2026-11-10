import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Project from '../../models/Project';
import Training from '../../models/Training';
import Epoch from '../../models/Epoch';
import { getTrainingStats } from '../../services/trainingStats';

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
it('aggregates real weekly activity, excludes private runs and deleted epochs, and retains older totals', async () => {
  const visible = new mongoose.Types.ObjectId();
  const hidden = new mongoose.Types.ObjectId();
  await Project.collection.insertMany(
    [visible, hidden].map((_id, i) => ({
      _id,
      name: `Project ${i}`,
      visibility: i ? 'private' : 'public',
      owner: { kind: 'user', id: 'other' }
    }))
  );
  const now = new Date();
  const monday = new Date(now);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const previous = new Date(monday.getTime() - 7 * 86400000);
  const old = new Date(now.getTime() - 90 * 86400000);
  const addRun = async (project: mongoose.Types.ObjectId, start: Date, seconds: number) => {
    const id = new mongoose.Types.ObjectId();
    await Training.collection.insertOne({
      _id: id,
      name: 'Run',
      uuid: String(id),
      projectId: String(project),
      status: 'completed',
      createdAt: now,
      startTime: start
    });
    await Epoch.collection.insertMany([
      { trainingId: String(id), epoch_time: seconds },
      { trainingId: String(id), epoch_time: 99999, deletedAt: now }
    ]);
  };
  await addRun(visible, now, 1800);
  await addRun(visible, previous, 3600);
  await addRun(visible, old, 120);
  await addRun(hidden, now, 9999);
  const stats = await getTrainingStats(undefined, {});
  expect(stats.totalTrainings).toBe(3);
  expect(stats.totalTime).toBe(5520);
  expect(stats.totalHours).toBeCloseTo(5520 / 3600);
  expect(stats.weekly).toEqual([
    { week: previous, trainings: 1, hours: 1 },
    { week: monday, trainings: 1, hours: 0.5 }
  ]);
});

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Project from '../../models/Project';
import Training from '../../models/Training';
import { listProjects } from '../../services/projectService';
import { lookupOwnerIdentities } from '../../clients/ownerIdentityClient';
import { fetchDatasetCovers } from '../../clients/datasetCoversClient';
import { getSignedUrl } from '../../clients/fileServiceClient';

jest.mock('../../clients/ownerIdentityClient', () => ({ lookupOwnerIdentities: jest.fn() }));
jest.mock('../../clients/datasetCoversClient', () => ({ fetchDatasetCovers: jest.fn() }));
jest.mock('../../clients/fileServiceClient', () => ({
  ...jest.requireActual('../../clients/fileServiceClient'),
  getSignedUrl: jest.fn()
}));

const OWNER = '000000000000000000000001';
const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

interface Row {
  name: string;
  runs: number;
  runningRuns: number;
  lastRunAt?: string;
  lastActivityAt: string;
}

/** What the project list says about each project at a glance, so a card need not open it. */
describe('the project list, with run counts and activity', () => {
  let mongo: MongoMemoryServer;
  const ids: Record<string, string> = {};

  const project = async (name: string, fields: Record<string, unknown> = {}) => {
    const _id = new mongoose.Types.ObjectId();
    await Project.collection.insertOne({
      _id,
      name,
      visibility: 'public',
      owner: { kind: 'user', id: OWNER },
      createdBy: OWNER,
      createdAt: at('2026-09-01'),
      updatedAt: at('2026-09-01'),
      ...fields
    });
    ids[name] = String(_id);
  };
  const run = (name: string, when: string, status = 'completed', extra: Record<string, unknown> = {}) =>
    Training.collection.insertOne({
      uuid: `run-${new mongoose.Types.ObjectId()}`,
      name: 'run',
      ownerId: OWNER,
      projectId: ids[name],
      status,
      createdAt: new Date(when),
      updatedAt: new Date(when),
      ...extra
    });
  const list = async (sortBy: 'name' | 'lastActivityAt' = 'name', sortOrder: 1 | -1 = 1) =>
    (await listProjects(undefined, { sortBy, sortOrder })) as unknown as Row[];

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
    jest.mocked(fetchDatasetCovers).mockReset().mockResolvedValue({});
    jest.mocked(getSignedUrl).mockReset().mockResolvedValue(null);
    jest.mocked(lookupOwnerIdentities).mockReset().mockResolvedValue(new Map());
    await project('Alpha', { updatedAt: at('2026-09-02'), lastActivityAt: at('2026-09-20') });
    await project('Beta', { updatedAt: at('2026-09-10') });
    await project('Gamma', { updatedAt: at('2026-09-05'), lastActivityAt: at('2026-09-30') });
    await project('Empty', { updatedAt: at('2026-08-01') });
    await run('Alpha', '2026-09-10T08:00:00Z');
    await run('Alpha', '2026-09-12T08:00:00Z', 'running');
    await run('Alpha', '2026-09-11T08:00:00Z', 'running');
    await run('Gamma', '2026-09-30T08:00:00Z');
    // A trashed run is not one of the project's runs.
    await run('Gamma', '2026-09-29T08:00:00Z', 'completed', { deletedAt: at('2026-09-30') });
  });

  it('counts each project\'s runs, those running, and when the latest started', async () => {
    const rows = await list();
    const by = Object.fromEntries(rows.map((row) => [row.name, row]));

    expect(by.Alpha).toMatchObject({ runs: 3, runningRuns: 2, lastRunAt: '2026-09-12T08:00:00.000Z' });
    expect(by.Gamma).toMatchObject({ runs: 1, runningRuns: 0, lastRunAt: '2026-09-30T08:00:00.000Z' });
  });

  it('says zero, and gives no latest run, for a project with none', async () => {
    const empty = (await list()).find((row) => row.name === 'Empty')!;

    expect(empty.runs).toBe(0);
    expect(empty.runningRuns).toBe(0);
    expect(empty).not.toHaveProperty('lastRunAt');
  });

  it('reads a project older than the activity field as last edited', async () => {
    const beta = (await list()).find((row) => row.name === 'Beta')!;

    expect(beta.lastActivityAt).toBe('2026-09-10T12:00:00.000Z');
  });

  it('sorts by latest activity, newest first, with an older project at its last edit', async () => {
    expect((await list('lastActivityAt', -1)).map((row) => row.name)).toEqual(['Gamma', 'Alpha', 'Beta', 'Empty']);
    expect((await list('lastActivityAt', 1)).map((row) => row.name)).toEqual(['Empty', 'Beta', 'Alpha', 'Gamma']);
  });
});

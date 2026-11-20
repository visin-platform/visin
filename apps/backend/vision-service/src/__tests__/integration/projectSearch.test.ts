import { vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Project from '../../models/Project';
import { listProjects } from '../../services/projectService';
import { lookupOwnerIdentities } from '../../clients/ownerIdentityClient';
import { fetchDatasetCovers } from '../../clients/datasetCoversClient';
import { getSignedUrl } from '../../clients/fileServiceClient';

vi.mock('../../clients/ownerIdentityClient', async () => {
  const module = await (() => ({ lookupOwnerIdentities: vi.fn() }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../clients/datasetCoversClient', async () => {
  const module = await (() => ({ fetchDatasetCovers: vi.fn() }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../clients/fileServiceClient', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('../../clients/fileServiceClient')>('../../clients/fileServiceClient')),
    getSignedUrl: vi.fn()
  }))();
  return Object.assign({ default: module }, module);
});

const OWNER = '000000000000000000000001';

/** Searching projects finds what a project says it studies, not only what it is called. */
describe('project search, with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;

  const project = (name: string, fields: Record<string, unknown> = {}) =>
    Project.collection.insertOne({
      name,
      visibility: 'public',
      owner: { kind: 'user', id: OWNER },
      createdBy: OWNER,
      createdAt: new Date('2026-09-01T12:00:00Z'),
      updatedAt: new Date('2026-09-01T12:00:00Z'),
      ...fields
    });
  const found = async (search: string) =>
    (await listProjects(undefined, { sortBy: 'name', sortOrder: 1, search })).map((row) => row.name);

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Project.syncIndexes();
  }, 120_000);
  afterAll(async () => {
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });
  beforeEach(async () => {
    await Project.deleteMany({});
    vi.mocked(fetchDatasetCovers).mockReset().mockResolvedValue({});
    vi.mocked(getSignedUrl).mockReset().mockResolvedValue(null);
    vi.mocked(lookupOwnerIdentities).mockReset().mockResolvedValue(new Map());
    await project('Urban driving', {
      description: 'Lane segmentation',
      readme: 'A camera and LiDAR fusion model for autonomous vehicles, trained on road scenes.'
    });
    await project('Birds', { description: 'Wildlife classification', readme: 'Feathers and flight.' });
  });

  it('finds a project by what its readme says, when its name and description do not', async () => {
    expect(await found('autonomous')).toEqual(['Urban driving']);
    expect(await found('LiDAR')).toEqual(['Urban driving']);
  });

  it('still finds by name and by description, and finds nothing it does not hold', async () => {
    expect(await found('urban')).toEqual(['Urban driving']);
    expect(await found('wildlife')).toEqual(['Birds']);
    expect(await found('submarine')).toEqual([]);
  });

  it('keeps one text index, named for what it is, that weighs a name above a readme', async () => {
    const indexes = await Project.collection.indexes();
    const text = indexes.filter((index) => index.key && '_fts' in index.key);
    expect(text).toHaveLength(1);
    expect(text[0].name).toBe('project_search');
    expect(text[0].weights).toEqual({ name: 10, description: 5, readme: 1 });
  });
});

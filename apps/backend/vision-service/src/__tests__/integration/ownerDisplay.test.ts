import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import projectRoutes from '../../routes/projectRoutes';
import Project from '../../models/Project';
import { lookupOwnerIdentities } from '../../clients/ownerIdentityClient';

jest.mock('../../clients/ownerIdentityClient', () => ({ lookupOwnerIdentities: jest.fn() }));
jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn().mockResolvedValue([]) }));

/**
 * Who a project belongs to, as a visitor sees it: the owner's name, handle and avatar when they
 * agreed to show them, and a profile's list of one person's public projects.
 */
describe('owners on project lists, with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let url: string;
  const ann = '000000000000000000000001';
  const hidden = '000000000000000000000002';
  const group = '0000000000000000000000aa';
  const quietGroup = '0000000000000000000000bb';
  const lookup = lookupOwnerIdentities as jest.Mock;
  interface Listed {
    name: string;
    owner: Record<string, unknown>;
  }

  const get = async (path: string) => {
    const response = await fetch(`${url}${path}`);
    return { status: response.status, body: (await response.json()) as { data: Listed[] & Listed } };
  };
  const names = async (path: string) => (await get(path)).body.data.map(project => project.name).sort();

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/api/projects', projectRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    await Project.create([
      { name: 'Ann public', slug: 'ann-public', owner: { kind: 'user', id: ann }, createdBy: ann, visibility: 'public' },
      { name: 'Ann private', slug: 'ann-private', owner: { kind: 'user', id: ann }, createdBy: ann },
      { name: 'Hidden public', slug: 'hidden-public', owner: { kind: 'user', id: hidden }, createdBy: hidden, visibility: 'public' },
      { name: 'Team public', slug: 'team-public', owner: { kind: 'group', id: group }, createdBy: ann, visibility: 'public' },
      { name: 'Quiet team public', slug: 'quiet-team-public', owner: { kind: 'group', id: quietGroup }, createdBy: ann, visibility: 'public' }
    ]);
  }, 120_000);

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  beforeEach(() => {
    lookup.mockReset();
    lookup.mockImplementation(async (owners: { id: string }[]) =>
      new Map(
        [
          { id: ann, handle: 'ann-lee', name: 'Ann Lee', picture: 'https://p.test/ann.jpg' },
          { id: hidden },
          // A group with a public page; quietGroup has none, so nothing comes back for it.
          { id: group, handle: 'road-lab', name: 'Road lab' }
        ].filter(identity => owners.some(owner => owner.id === identity.id)).map(identity => [identity.id, identity])
      )
    );
  });

  it('names each person who owns a listed project, asking once for the whole list', async () => {
    const { body } = await get('/projects');

    const byName = Object.fromEntries(body.data.map((project) => [project.name, project.owner]));
    expect(byName['Ann public']).toEqual({ kind: 'user', id: ann, handle: 'ann-lee', name: 'Ann Lee', picture: 'https://p.test/ann.jpg' });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0][0].map((owner: { id: string }) => owner.id).sort()).toEqual([ann, hidden, group, quietGroup].sort());
  });

  it('shows an owner who hid their profile as no more than an id', async () => {
    const { body } = await get('/projects');

    const byName = Object.fromEntries(body.data.map((project) => [project.name, project.owner]));
    expect(byName['Hidden public']).toEqual({ kind: 'user', id: hidden });
  });

  it('names a group with a public page to anyone, and shows a group without one as no more than an id', async () => {
    const { body } = await get('/projects');

    const byName = Object.fromEntries(body.data.map((project) => [project.name, project.owner]));
    expect(byName['Team public']).toEqual({ kind: 'group', id: group, handle: 'road-lab', name: 'Road lab' });
    expect(byName['Quiet team public']).toEqual({ kind: 'group', id: quietGroup });
  });

  it('lists the projects with their owners left out rather than failing when auth-service cannot answer', async () => {
    lookup.mockResolvedValue(new Map());

    const { status, body } = await get('/projects');

    expect(status).toBe(200);
    expect(body.data.find((project) => project.name === 'Ann public')!.owner).toEqual({ kind: 'user', id: ann });
  });

  it('names the owner of a single project too', async () => {
    const { body } = await get('/projects/ann-public');

    expect(body.data.owner).toMatchObject({ handle: 'ann-lee', name: 'Ann Lee' });
    expect(lookup.mock.calls[0][0]).toHaveLength(1);
    expect(lookup.mock.calls[0][0][0]).toMatchObject({ kind: 'user', id: ann });
  });

  it('lists one person\'s projects for a profile, and only those a visitor may read', async () => {
    expect(await names(`/projects?user=${ann}`)).toEqual(['Ann public']);
    expect(await names(`/projects?user=${hidden}`)).toEqual(['Hidden public']);
    // A group's projects are not a person's, even one that person created.
    expect(await names(`/projects?user=${group}`)).toEqual([]);
    // They are listed by the group, which is what a group's page asks for.
    expect(await names(`/projects?owner=${group}`)).toEqual(['Team public']);
  });

  it('wants a person\'s id, not any text', async () => {
    expect((await get('/projects?user=ann-lee')).status).toBe(400);
  });
});

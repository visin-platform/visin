import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import crypto from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import projectRoutes from '../../routes/projectRoutes';
import trainingRoutes from '../../routes/trainingRoutes';
import Project from '../../models/Project';
import Training from '../../models/Training';
import { getUserGroups } from '../../clients/projectGroupsClient';

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));

/**
 * `access=contribute`: "your" projects and runs, as a page asking whether
 * someone has started needs them. Other people's public work does not count.
 */
describe('the contribute filter on project and training lists', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let url: string;
  const me = '000000000000000000000001';
  const group = '0000000000000000000000aa';
  const secret = 'contribute-filter-secret';
  const saved = process.env.JWT_SECRET;

  const session = () => {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { id: me, email: 'me@example.test', tokenVersion: 1, sid: me, typ: 'session', iat: now, exp: now + 600 }]
      .map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
    return `${unsigned}.${crypto.createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/api/projects', projectRoutes);
    app.use('/api/trainings', trainingRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

    const id = new mongoose.Types.ObjectId(me);
    await mongoose.connection.collection('users').insertOne({ _id: id, email: 'me@example.test', tokenVersion: 1 });
    await mongoose.connection.collection('user_sessions').insertOne({ _id: id, userId: id, expiresAt: new Date(Date.now() + 3_600_000) });
    (getUserGroups as jest.Mock).mockResolvedValue([{ id: group, name: 'Team' }]);

    const [mine, teams, theirs] = await Project.create([
      { name: 'Mine', slug: 'mine', owner: { kind: 'user', id: me }, createdBy: me },
      { name: 'Team', slug: 'team', owner: { kind: 'user', id: 'someone' }, createdBy: 'someone', editorGroupIds: [group] },
      { name: 'Theirs', slug: 'theirs', owner: { kind: 'user', id: 'someone' }, createdBy: 'someone', visibility: 'public' }
    ]);
    await Training.create([
      { name: 'sample', uuid: 's', projectId: String(mine._id), tags: ['visin-sample'] },
      { name: 'team run', uuid: 't', projectId: String(teams._id) },
      { name: 'public run', uuid: 'p', projectId: String(theirs._id) }
    ]);
  }, 120_000);

  afterAll(async () => {
    if (saved === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = saved;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });

  const get = async (path: string, signedIn = true) => {
    const response = await fetch(`${url}${path}`, { headers: signedIn ? { Authorization: `Bearer ${session()}` } : {} });
    return (await response.json()) as { data: unknown };
  };

  it('lists only the projects I own or edit through a group', async () => {
    expect(((await get('/projects')).data as { name: string }[]).map(p => p.name).sort()).toEqual(['Mine', 'Team', 'Theirs']);
    expect(((await get('/projects?access=contribute')).data as { name: string }[]).map(p => p.name).sort()).toEqual(['Mine', 'Team']);
    expect((await get('/projects?access=contribute', false)).data).toEqual([]);
  });

  it('counts only runs in those projects, and can leave samples out', async () => {
    const names = async (query: string) =>
      ((await get(`/trainings?${query}`)).data as { trainings: { name: string }[] }).trainings.map(t => t.name).sort();
    expect(await names('access=contribute')).toEqual(['sample', 'team run']);
    expect(await names('access=contribute&excludeTags=visin-sample')).toEqual(['team run']);
  });
});

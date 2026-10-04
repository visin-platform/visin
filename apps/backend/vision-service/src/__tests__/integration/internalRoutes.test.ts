import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import internalRoutes from '../../routes/internalRoutes';
import Project from '../../models/Project';
import { getUserGroups } from '../../clients/projectGroupsClient';

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));
const groupsOf = getUserGroups as jest.Mock;

describe('internal key-access check for auth-service', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let url: string;
  let project: string;
  const owner = '000000000000000000000001';
  const editor = '000000000000000000000002';
  const stranger = '000000000000000000000003';
  const saved = process.env.INTERNAL_SERVICE_TOKEN;

  beforeAll(async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-test-token';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(identityContextMiddleware);
    app.use('/internal', internalRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal`;
  }, 120_000);

  beforeEach(async () => {
    groupsOf.mockReset().mockImplementation(async (userId: string) => (userId === editor ? [{ id: '0000000000000000000000aa', name: 'Team' }] : []));
    project = String((await Project.create({ name: 'Road scenes', slug: 'road', owner: { kind: 'user', id: owner }, createdBy: owner, editorGroupIds: ['0000000000000000000000aa'] }))._id);
  });

  afterEach(async () => {
    await Project.deleteMany({});
  });

  afterAll(async () => {
    if (saved === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = saved;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });

  const check = async (id: string, userId: string, token = 'internal-test-token') => {
    const response = await fetch(`${url}/projects/${id}/key-access?userId=${userId}`, { headers: { 'x-internal-token': token } });
    return { status: response.status, body: (await response.json()) as { data?: { id: string; name: string; canWrite: boolean } } };
  };

  it('answers with the project name and whether the user may write there, groups included', async () => {
    expect((await check(project, owner)).body.data).toEqual({ id: project, name: 'Road scenes', canWrite: true, owner: { kind: 'user', id: owner } });
    expect((await check('road', editor)).body.data).toEqual({ id: project, name: 'Road scenes', canWrite: true, owner: { kind: 'user', id: owner } });
    expect((await check(project, stranger)).body.data?.canWrite).toBe(false);
  });

  it('is closed to anyone without the internal token', async () => {
    expect((await check(project, owner, 'wrong')).status).toBe(401);
    expect((await fetch(`${url}/projects/${project}/key-access?userId=${owner}`)).status).toBe(401);
  });

  it('refuses a malformed account id and answers 404 for no such project', async () => {
    expect((await check(project, 'not-an-id')).status).toBe(400);
    expect((await check('000000000000000000000fff', owner)).status).toBe(404);
  });

  it('tells group-service what a group still owns, trashed projects included', async () => {
    const group = '0000000000000000000000bb';
    await Project.create([
      { name: 'Team one', owner: { kind: 'group', id: group }, createdBy: owner },
      { name: 'Team trashed', owner: { kind: 'group', id: group }, createdBy: owner, trashedAt: new Date() }
    ]);
    const owned = async (token = 'internal-test-token') => fetch(`${url}/groups/${group}/owned`, { headers: { 'x-internal-token': token } });
    expect((await (await owned()).json()).data).toEqual({ count: 2, names: ['Team one', 'Team trashed'] });
    expect((await owned('wrong')).status).toBe(401);
    await Project.deleteMany({ 'owner.id': group });
    expect((await (await owned()).json()).data).toEqual({ count: 0, names: [] });
  });
});

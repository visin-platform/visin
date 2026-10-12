import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { User } from '../../models/User';
import authRoutes from '../../routes/authRoutes';

/** The internal search behind group-service's "Add member" field. */
describe('internal user search with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  const saved = process.env.INTERNAL_SERVICE_TOKEN;

  beforeAll(async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-test-token';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/auth', authRoutes);
    app.use(errorHandler);
    server = await new Promise<Server>(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/auth/internal/users/search`;
    await User.create([
      { email: 'mari.tamm@taltech.ee', firstName: 'Mari', lastName: 'Tamm', signupMethod: 'password', roles: [] },
      { email: 'jaan@example.test', firstName: 'Jaan', lastName: 'Maripuu', signupMethod: 'password', roles: [] },
      { email: 'a.b+c@example.test', signupMethod: 'google', roles: [] },
      { email: 'bellonemauro@example.test', firstName: 'Mauro', lastName: 'Bellone', signupMethod: 'google', roles: [] },
      { email: 'pieter@example.test', firstName: 'Pieter', lastName: 'van der Berg', signupMethod: 'password', roles: [] }
    ]);
  }, 120_000);

  afterAll(async () => {
    if (saved === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = saved;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  });

  const search = async (query: string, token = 'internal-test-token') => {
    const response = await fetch(`${base}?${query}`, { headers: { 'x-internal-token': token } });
    return { status: response.status, body: (await response.json()) as { data?: { email: string; firstName?: string }[] } };
  };
  const emails = async (query: string) => ((await search(query)).body.data ?? []).map(user => user.email);

  it('matches an email before its "@", a first name or a last name, in any case', async () => {
    expect(await emails('q=mari')).toEqual(['jaan@example.test', 'mari.tamm@taltech.ee']);
    expect(await emails('q=TAMM')).toEqual(['mari.tamm@taltech.ee']);
    expect(await emails('q=jaan%40example.test')).toEqual(['jaan@example.test']);
    // Anywhere in the name part of an address...
    expect(await emails('q=lonemau')).toEqual(['bellonemauro@example.test']);
    // An account with no name on it is still found by its address.
    expect(await emails('q=b%2Bc')).toEqual(['a.b+c@example.test']);
    // ...but never the domain: "tech" is only in one, and "example" would list everyone.
    expect(await emails('q=tech')).toEqual([]);
    expect(await emails('q=example')).toEqual([]);
  });

  it('finds a whole name, and any word of a name', async () => {
    expect(await emails('q=Mauro%20Bellone')).toEqual(['bellonemauro@example.test']);
    expect(await emails('q=bellone%20mauro')).toEqual(['bellonemauro@example.test']);
    expect(await emails('q=mauro')).toEqual(['bellonemauro@example.test']);
    expect(await emails('q=lone')).toEqual(['bellonemauro@example.test']);
    expect(await emails('q=berg')).toEqual(['pieter@example.test']);
    expect(await emails('q=pieter%20van%20der')).toEqual(['pieter@example.test']);
    // Every word must be in the name: an email is not searched word by word.
    expect(await emails('q=mauro%20tamm')).toEqual([]);
    expect(await emails('q=bellonemauro%20x')).toEqual([]);
  });

  it('reads the query as text, not as a pattern', async () => {
    expect(await emails('q=a.b%2Bc')).toEqual(['a.b+c@example.test']);
    expect(await emails('q=.%2A')).toEqual([]);
  });

  it('answers only the fields the caller needs, and at most the limit', async () => {
    const { body } = await search('q=mari&limit=1');
    expect(body.data).toHaveLength(1);
    expect(Object.keys(body.data![0]).sort()).toEqual(['email', 'firstName', 'id', 'lastName']);
  });

  it('is closed to anyone without the internal token, and needs a query', async () => {
    expect((await search('q=mari', 'wrong')).status).toBe(401);
    expect((await search('q=')).status).toBe(400);
    expect((await search('q=mari&limit=100')).status).toBe(400);
  });
});

import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import publicRoutes from '../../routes/publicRoutes';
import Project from '../../models/Project';
import Training from '../../models/Training';
import Evaluation from '../../models/Evaluation';
import { Finding } from '../../models/Finding';

const ANN = '000000000000000000000001';
const BOB = '000000000000000000000002';
const GROUP = '0000000000000000000000aa';
const OTHER_GROUP = '0000000000000000000000bb';

interface Item {
  kind: string;
  at: string;
  project: { id: string; name: string; slug?: string };
  [key: string]: unknown;
}

const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

/**
 * A person's, or a group's, public activity: derived from what is stored, public projects only, and only what a
 * stranger could already see there.
 */
describe('the public activity feed, with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let url: string;
  const ids: Record<string, string> = {};

  const project = async (name: string, fields: Record<string, unknown>) => {
    const _id = new mongoose.Types.ObjectId();
    await Project.collection.insertOne({
      _id,
      name,
      slug: name.toLowerCase().replace(/\W+/g, '-'),
      visibility: 'public',
      createdAt: at('2026-09-01'),
      updatedAt: at('2026-09-01'),
      ...fields
    });
    ids[name] = String(_id);
    return String(_id);
  };
  const finding = (projectId: string, title: string, authorUserId: string, when: string, extra: Record<string, unknown> = {}) =>
    Finding.collection.insertOne({
      projectId, title, body: 'x', authorKind: 'person', authorLabel: 'Ann', authorUserId, trainingIds: [],
      deletedAt: null, createdAt: at(when), updatedAt: at(when), ...extra
    });
  const run = (projectId: string, ownerId: string, when: string, extra: Record<string, unknown> = {}) =>
    Training.collection.insertOne({
      uuid: `run-${new mongoose.Types.ObjectId()}`, name: 'run', ownerId, projectId, status: 'completed',
      createdAt: new Date(when), updatedAt: new Date(when), ...extra
    });
  const result = (projectId: string, ownerId: string, when: string, extra: Record<string, unknown> = {}) =>
    Evaluation.collection.insertOne({
      uuid: `ev-${new mongoose.Types.ObjectId()}`, projectId, ownerId, status: 'completed', results: {}, validation: {},
      contentHash: 'h', receivedAt: at(when), createdAt: at(when), updatedAt: at(when), ...extra
    });

  const feed = async (query: string) => {
    const response = await fetch(`${url}/public/activity?${query}`);
    return { status: response.status, headers: response.headers, body: (await response.json()) as { data: Item[] } };
  };
  const summary = async (query: string) => (await feed(query)).body.data.map((item) => `${item.kind}:${item.project.name}`);

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json());
    app.use('/api/public', publicRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  }, 120_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([Project, Training, Evaluation, Finding].map((model) => model.deleteMany({})));
    const mine = { owner: { kind: 'user', id: ANN }, createdBy: ANN };
    const pub = await project('Ann public', { ...mine, createdAt: at('2026-09-01') });
    const priv = await project('Ann private', { ...mine, visibility: 'private' });
    const trashed = await project('Ann trashed', { ...mine, trashedAt: at('2026-09-10') });
    await project('Bob public', { owner: { kind: 'user', id: BOB }, createdBy: BOB, createdAt: at('2026-09-02') });
    const team = await project('Team public', { owner: { kind: 'group', id: GROUP }, createdBy: BOB, createdAt: at('2026-09-05') });
    const teamPrivate = await project('Team private', { owner: { kind: 'group', id: GROUP }, createdBy: BOB, visibility: 'private' });
    const other = await project('Other team', { owner: { kind: 'group', id: OTHER_GROUP }, createdBy: BOB });

    await finding(pub, 'Assistant finding', ANN, '2026-09-02', { authorKind: 'assistant', authorLabel: 'Claude' });
    await finding(priv, 'Private finding', ANN, '2026-09-02');
    await finding(trashed, 'Trashed finding', ANN, '2026-09-02');
    await finding(pub, 'Deleted finding', ANN, '2026-09-02', { deletedAt: at('2026-09-03') });
    await finding(team, 'Team finding', BOB, '2026-09-06');
    await finding(teamPrivate, 'Team private finding', BOB, '2026-09-06');

    await run(pub, ANN, '2026-09-03T08:00:00.000Z');
    await run(pub, ANN, '2026-09-03T20:00:00.000Z');
    await run(pub, ANN, '2026-09-04T09:00:00.000Z');
    await run(priv, ANN, '2026-09-03T09:00:00.000Z');
    await run(pub, ANN, '2026-09-03T10:00:00.000Z', { deletedAt: at('2026-09-05') });
    await run(pub, BOB, '2026-09-03T11:00:00.000Z');
    await run(team, BOB, '2026-09-07T09:00:00.000Z');
    await run(teamPrivate, BOB, '2026-09-07T09:00:00.000Z');
    await run(other, BOB, '2026-09-07T09:00:00.000Z');

    const suite = { id: 's1', slug: 'cityscapes', version: 2, digest: 'd' };
    await result(pub, ANN, '2026-09-08');
    await result(pub, ANN, '2026-09-09', { suite });
    await result(pub, ANN, '2026-09-10', { suite, publishedAt: at('2026-09-10') });
    await result(priv, ANN, '2026-09-10');
    await result(pub, ANN, '2026-09-10', { deletedAt: at('2026-09-11') });
  });

  describe('a person', () => {
    it('lists what they made, wrote, ran and recorded in public, newest first', async () => {
      const { body } = await feed(`user=${ANN}`);

      expect(body.data.map((item) => `${item.kind}:${item.at.slice(0, 10)}`)).toEqual([
        'evaluation.recorded:2026-09-10',
        'evaluation.recorded:2026-09-08',
        'training.run:2026-09-04',
        'training.run:2026-09-03',
        'finding.posted:2026-09-02',
        'project.created:2026-09-01'
      ]);
    });

    it('rolls a day of runs in one project into a single line with the count, stamped with the latest start', async () => {
      const runs = (await feed(`user=${ANN}`)).body.data.filter((item) => item.kind === 'training.run');

      expect(runs.map((item) => item.count)).toEqual([1, 2]);
      expect(runs[1].at).toBe('2026-09-03T20:00:00.000Z');
    });

    it("says whether an assistant wrote a finding, and shows only the results a stranger may see", async () => {
      const { body } = await feed(`user=${ANN}`);

      const found = body.data.find((item) => item.kind === 'finding.posted')!;
      expect(found.finding).toEqual({ id: expect.any(String), title: 'Assistant finding', authorKind: 'assistant', authorLabel: 'Claude' });
      const evaluations = body.data.filter((item) => item.kind === 'evaluation.recorded');
      // The run's own test, and the suite result a manager published; not the unpublished one.
      expect(evaluations.map((item) => (item.evaluation as { suite?: unknown }).suite)).toEqual([
        { slug: 'cityscapes', version: 2 },
        undefined
      ]);
    });

    it('leaves out everything of a private project, a trashed one, and anything deleted', async () => {
      const everything = JSON.stringify((await feed(`user=${ANN}&limit=100`)).body);

      for (const hidden of ['Ann private', 'Ann trashed', 'Private finding', 'Trashed finding', 'Deleted finding']) {
        expect(everything).not.toContain(hidden);
      }
      // Three runs on two days, one deleted and one in a private project not counted.
      expect((await feed(`user=${ANN}&limit=100`)).body.data.filter((item) => item.kind === 'training.run')).toHaveLength(2);
    });

    it("does not carry other people's work, and never an account id", async () => {
      const text = JSON.stringify((await feed(`user=${ANN}&limit=100`)).body);

      expect(text).not.toContain('Bob public');
      expect(text).not.toContain('Team public');
      expect(text).not.toContain(ANN);
      expect(text).not.toContain(BOB);
    });

    it('counts what they made in a group that owns it, since they made it', async () => {
      expect(await summary(`user=${BOB}&limit=100`)).toEqual(
        expect.arrayContaining(['project.created:Bob public', 'project.created:Team public', 'project.created:Other team'])
      );
      expect(await summary(`user=${BOB}&limit=100`)).not.toContain('project.created:Team private');
    });

    it('drops a project from the feed the moment it is made private or trashed', async () => {
      expect(await summary(`user=${ANN}&limit=100`)).toContain('project.created:Ann public');

      await Project.updateOne({ _id: ids['Ann public'] }, { visibility: 'private' });
      expect((await summary(`user=${ANN}&limit=100`)).filter((line) => line.endsWith('Ann public'))).toEqual([]);

      await Project.updateOne({ _id: ids['Ann public'] }, { visibility: 'public', trashedAt: new Date() });
      expect((await summary(`user=${ANN}&limit=100`)).filter((line) => line.endsWith('Ann public'))).toEqual([]);
    });

    it('stops at the limit, keeping the newest', async () => {
      const { body } = await feed(`user=${ANN}&limit=2`);

      expect(body.data.map((item) => item.kind)).toEqual(['evaluation.recorded', 'evaluation.recorded']);
    });

    it('is empty for someone who has done nothing in public', async () => {
      expect((await feed(`user=${'f'.repeat(24)}`)).body.data).toEqual([]);
    });

    it('lists no run whose project is gone, or that never had one', async () => {
      await run('not-an-id', ANN, '2026-09-12T09:00:00.000Z');
      await Training.collection.insertOne({ uuid: 'orphan', name: 'orphan', ownerId: ANN, status: 'completed', createdAt: new Date(), updatedAt: new Date() });

      expect((await summary(`user=${ANN}&limit=100`)).filter((line) => line.startsWith('training.run'))).toHaveLength(2);
    });
  });

  describe('a group', () => {
    it("lists everything in the public projects it owns, whoever did it", async () => {
      expect(await summary(`owner=${GROUP}&limit=100`)).toEqual([
        'training.run:Team public',
        'finding.posted:Team public',
        'project.created:Team public'
      ]);
    });

    it("leaves out its private projects, other groups' projects and every person's own", async () => {
      const text = JSON.stringify((await feed(`owner=${GROUP}&limit=100`)).body);

      for (const hidden of ['Team private', 'Other team', 'Ann public', 'Bob public']) expect(text).not.toContain(hidden);
    });
  });

  describe('the request', () => {
    it('is anonymous, and never kept by anything that sees it go by', async () => {
      const { status, headers } = await feed(`user=${ANN}`);

      expect(status).toBe(200);
      expect(headers.get('cache-control')).toBe('no-store');
    });

    it('wants exactly one of a person or a group, as ids, with a sensible limit', async () => {
      for (const query of ['', `user=${ANN}&owner=${GROUP}`, 'user=ann', `user=${ANN}&limit=0`, `user=${ANN}&limit=101`]) {
        expect((await feed(query)).status).toBe(400);
      }
    });
  });
});

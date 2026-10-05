import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { lookupOwnerIdentities } from '../../clients/ownerIdentityClient';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import Paper from '../../models/Paper';
import Project from '../../models/Project';
import Suite from '../../models/Suite';
import Training from '../../models/Training';
import paperRoutes from '../../routes/paperRoutes';
import publicRoutes from '../../routes/publicRoutes';
import { purgeExpiredTrash } from '../../services/purgeService';

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));
jest.mock('../../clients/ownerIdentityClient', () => ({ lookupOwnerIdentities: jest.fn() }));

const ANN = '000000000000000000000001';
const BEN = '000000000000000000000002';
const CAL = '000000000000000000000003';
const HIDDEN = '000000000000000000000004';
const ADMIN = '000000000000000000000005';
const GROUP = '0000000000000000000000aa';
const ROLES: Record<string, { id: string; name: string; role: 'owner' | 'admin' | 'member' }[]> = {
  [ANN]: [{ id: GROUP, name: 'Lab', role: 'owner' }],
  [ADMIN]: [{ id: GROUP, name: 'Lab', role: 'admin' }]
};
/** The accounts that exist, and what each shows of itself; a hidden profile shows only its id. */
const PEOPLE: Record<string, Record<string, unknown>> = {
  [ANN]: { handle: 'ann', name: 'Ann Author' },
  [BEN]: { handle: 'ben', name: 'Ben Builder' },
  [CAL]: { handle: 'cal', name: 'Cal Checker' },
  [HIDDEN]: {},
  [ADMIN]: { handle: 'admin', name: 'Group Admin' }
};

/** Papers that cite results on Visin: who may see them, who is named on them, and what they still point at. */
describe('papers, with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  const secret = 'papers-test-secret';
  const previousSecret = process.env.JWT_SECRET;
  const previousShell = process.env.SHELL_FRONT_URL;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    process.env.SHELL_FRONT_URL = 'https://app.example.test';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Paper.syncIndexes();
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/api/papers', paperRoutes);
    app.use('/api/public', publicRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  }, 120_000);

  beforeEach(async () => {
    const ids = Object.keys(PEOPLE).map((id) => new mongoose.Types.ObjectId(id));
    await mongoose.connection.collection('users').insertMany(ids.map((_id) => ({ _id, email: `${_id}@example.test`, tokenVersion: 1 })));
    await mongoose.connection
      .collection('user_sessions')
      .insertMany(ids.map((_id) => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) })));
    jest.mocked(getUserGroups).mockImplementation(async (userId) => ROLES[userId ?? ''] ?? []);
    jest.mocked(lookupOwnerIdentities).mockReset().mockImplementation(
      async (owners) =>
        new Map(owners.filter((owner) => owner.id in PEOPLE).map((owner) => [owner.id, { id: owner.id, ...PEOPLE[owner.id] }]))
    );
  });
  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });
  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousShell === undefined) delete process.env.SHELL_FRONT_URL;
    else process.env.SHELL_FRONT_URL = previousShell;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      await mongoose.disconnect();
    } finally {
      await mongo?.stop();
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Body = { data: any; error?: string; message?: string };
  /** `user: ''` is a visitor with no session. */
  const call = async (path: string, { method = 'GET', user = ANN, body }: { method?: string; user?: string; body?: unknown } = {}) => {
    const unsigned = [
      { alg: 'HS256', typ: 'JWT' },
      { id: user, email: `${user}@example.test`, tokenVersion: 1, sid: user, typ: 'session', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 }
    ]
      .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
      .join('.');
    const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    return { status: response.status, body: (text.startsWith('{') ? JSON.parse(text) : {}) as Body, text, headers: response.headers };
  };

  const project = async (name: string, fields: Record<string, unknown> = {}) =>
    String(
      (
        await Project.create({
          name,
          slug: name.toLowerCase().replace(/\W+/g, '-'),
          owner: { kind: 'user', id: ANN },
          createdBy: ANN,
          visibility: 'public',
          ...fields
        })
      )._id
    );
  const paper = (fields: Record<string, unknown> = {}) => ({
    title: 'Robust segmentation at night',
    authors: [{ name: 'Ann Author' }],
    arxivId: 'arXiv:2401.01234v2',
    ...fields
  });
  const publicPaper = async (projectId: string, fields: Record<string, unknown> = {}, user = ANN) =>
    call('/papers', { method: 'POST', user, body: paper({ visibility: 'public', results: [{ kind: 'project', ref: projectId }], ...fields }) });
  const catalogue = async (query = '') => (await call(`/public/papers${query ? `?${query}` : ''}`, { user: '' })).body.data as {
    papers: { id: string; title: string }[];
    pagination: { total: number };
  };
  const titles = async (query = '') => (await catalogue(query)).papers.map((card) => card.title).sort();

  describe('writing', () => {
    it('stores a draft that only its owner can read', async () => {
      const created = await call('/papers', { method: 'POST', body: paper() });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ visibility: 'private', arxivId: '2401.01234', owner: { kind: 'user', id: ANN, handle: 'ann' } });
      const id = created.body.data.id;

      expect((await call(`/papers/${id}`)).status).toBe(200);
      expect((await call(`/papers/${id}`, { user: BEN })).status).toBe(404);
      expect((await call(`/papers/${id}`, { user: '' })).status).toBe(404);
      expect(await titles()).toEqual([]);
    });

    it('needs a signed-in person to write', async () => {
      expect((await call('/papers', { method: 'POST', user: '', body: paper() })).status).toBe(401);
      expect((await call('/papers', { user: '' })).status).toBe(401);
    });

    it('keeps one spelling of each identifier, and refuses what is not one', async () => {
      const ok = await call('/papers', {
        method: 'POST',
        body: paper({ arxivId: 'https://arxiv.org/pdf/2401.01234v3.pdf', doi: 'https://doi.org/10.1000/ABC.5', url: 'https://example.test/paper' })
      });
      expect(ok.body.data).toMatchObject({ arxivId: '2401.01234', doi: '10.1000/abc.5', url: 'https://example.test/paper' });
      for (const bad of [{ arxivId: 'not-an-id' }, { doi: '11.2/x' }, { url: 'javascript:alert(1)' }, { url: 'https://user:pw@example.test/' }, { pdfUrl: 'ftp://example.test/p.pdf' }]) {
        expect((await call('/papers', { method: 'POST', body: paper(bad) })).status).toBe(400);
      }
    });

    it('refuses a public paper with nothing to find or nothing public cited', async () => {
      const open = await project('Open');
      const closed = await project('Closed', { visibility: 'private' });
      expect((await call('/papers', { method: 'POST', body: paper({ visibility: 'public' }) })).body.message).toMatch(/cite at least one result/);
      expect((await call('/papers', { method: 'POST', body: paper({ visibility: 'public', arxivId: undefined, results: [{ kind: 'project', ref: open }] }) })).body.message).toMatch(
        /arXiv id, a DOI or a link/
      );
      const onlyPrivate = await call('/papers', { method: 'POST', body: paper({ visibility: 'public', results: [{ kind: 'project', ref: closed }] }) });
      expect(onlyPrivate.status).toBe(400);
      expect(onlyPrivate.body.message).toMatch(/public on Visin/);
      expect((await publicPaper(open)).status).toBe(201);
    });

    it("refuses to cite a result the caller cannot see, without saying whether it exists", async () => {
      const secretId = await project('Secret', { visibility: 'private' });
      const attempt = await call('/papers', { method: 'POST', user: BEN, body: paper({ results: [{ kind: 'project', ref: secretId }] }) });
      const missing = await call('/papers', { method: 'POST', user: BEN, body: paper({ results: [{ kind: 'project', ref: '0000000000000000000000ff' }] }) });
      expect(attempt.status).toBe(400);
      expect(attempt.body.message).toMatch(/Could not find the project/);
      expect(missing.body.message).toMatch(/Could not find the project/);
    });

    it('cites a project by slug, a run, and a leaderboard, and stores them by identity', async () => {
      const id = await project('Night Seg');
      const run = await Training.collection.insertOne({ uuid: 'r1', name: 'window16', ownerId: ANN, projectId: id, status: 'completed' });
      await Suite.collection.insertOne({ slug: 'night-v1', version: 2, name: 'Night suite', projectId: id, visibility: 'public', createdBy: ANN, digest: 'x', protocol: {} });
      const created = await call('/papers', {
        method: 'POST',
        body: paper({
          results: [
            { kind: 'project', ref: 'night-seg', note: 'Table 1' },
            { kind: 'project', ref: id },
            { kind: 'training', ref: String(run.insertedId) },
            { kind: 'leaderboard', ref: 'night-v1@2' }
          ]
        })
      });
      expect(created.status).toBe(201);
      expect(created.body.data.results.map((r: { kind: string; ref: string }) => `${r.kind}:${r.ref}`)).toEqual([
        `project:${id}`,
        `training:${run.insertedId}`,
        'leaderboard:night-v1@2'
      ]);
      expect(created.body.data.results.every((r: { available: boolean }) => r.available)).toBe(true);
      expect(created.body.data.results[0]).toMatchObject({ note: 'Table 1', name: 'Night Seg' });
      expect((await Paper.findById(created.body.data.id))!.projectIds).toEqual([id]);

      for (const bad of [{ kind: 'training', ref: 'nope' }, { kind: 'leaderboard', ref: 'night-v1' }, { kind: 'leaderboard', ref: 'night-v1@9' }]) {
        expect((await call('/papers', { method: 'POST', body: paper({ results: [bad] }) })).status).toBe(400);
      }
    });

    it('lets only people who manage a paper change it, and only its owner change who sees it', async () => {
      const open = await project('Open');
      const id = (await publicPaper(open)).body.data.id;
      expect((await call(`/papers/${id}`, { method: 'PUT', user: BEN, body: { title: 'Mine now' } })).status).toBe(403);
      expect((await call(`/papers/${id}`, { method: 'PUT', user: '', body: { title: 'Mine now' } })).status).toBe(401);

      const renamed = await call(`/papers/${id}`, { method: 'PUT', body: { title: 'Better title', venue: 'CVPR', year: 2025, abstract: 'Words.' } });
      expect(renamed.body.data).toMatchObject({ title: 'Better title', venue: 'CVPR', year: 2025, abstract: 'Words.' });
      const cleared = await call(`/papers/${id}`, { method: 'PUT', body: { venue: null, year: null } });
      expect(cleared.body.data.venue).toBeUndefined();
      expect(cleared.body.data.year).toBeUndefined();

      // A public paper cannot lose the way to the paper, nor everything it cites.
      expect((await call(`/papers/${id}`, { method: 'PUT', body: { arxivId: null } })).status).toBe(400);
      expect((await call(`/papers/${id}`, { method: 'PUT', body: { results: [] } })).status).toBe(400);
      expect((await call(`/papers/${id}`, { method: 'PUT', body: { visibility: 'private' } })).body.data.visibility).toBe('private');
    });

    it("lets a group's admin edit its papers but not publish them, and a member only read", async () => {
      const open = await project('Open');
      const made = await call('/papers', { method: 'POST', body: paper({ owner: { kind: 'group', id: GROUP }, results: [{ kind: 'project', ref: open }] }) });
      expect(made.status).toBe(201);
      const id = made.body.data.id;
      expect((await call(`/papers/${id}`, { user: ADMIN })).body.data.permissions).toMatchObject({ manage: true, own: false });
      expect((await call(`/papers/${id}`, { method: 'PUT', user: ADMIN, body: { title: 'Edited by admin' } })).status).toBe(200);
      expect((await call(`/papers/${id}`, { method: 'PUT', user: ADMIN, body: { visibility: 'public' } })).status).toBe(403);
      expect((await call(`/papers/${id}`, { method: 'PUT', body: { visibility: 'public' } })).status).toBe(200);
      // Not in the group: no paper in its name, and none public in it without owning it.
      expect((await call('/papers', { method: 'POST', user: BEN, body: paper({ owner: { kind: 'group', id: GROUP } }) })).status).toBe(403);
      expect((await call('/papers', { method: 'POST', user: ADMIN, body: paper({ owner: { kind: 'group', id: GROUP }, visibility: 'public', results: [{ kind: 'project', ref: open }] }) })).status).toBe(403);
    });

    it('keeps the trash: out of sight, restorable by the owner, swept after 30 days', async () => {
      const open = await project('Open');
      const id = (await publicPaper(open)).body.data.id;
      expect((await call(`/papers/${id}`, { method: 'DELETE', user: BEN })).status).toBe(403);
      expect((await call(`/papers/${id}`, { method: 'DELETE' })).status).toBe(200);
      expect((await call(`/papers/${id}`)).status).toBe(404);
      expect(await titles()).toEqual([]);
      expect(((await call('/papers')).body.data as unknown[]).length).toBe(0);
      expect(((await call('/papers?scope=trash')).body.data as { id: string }[]).map((row) => row.id)).toEqual([id]);

      expect((await call(`/papers/${id}/restore`, { method: 'POST', user: BEN })).status).toBe(404);
      expect((await call(`/papers/${id}/restore`, { method: 'POST' })).status).toBe(200);
      expect(await titles()).toEqual(['Robust segmentation at night']);

      await call(`/papers/${id}`, { method: 'DELETE' });
      expect((await purgeExpiredTrash()).papers).toBe(0);
      await Paper.updateOne({ _id: id }, { trashedAt: new Date(Date.now() - 31 * 86_400_000) });
      expect((await purgeExpiredTrash()).papers).toBe(1);
      expect(await Paper.findById(id)).toBeNull();
    });
  });

  describe('the public catalogue', () => {
    it('lists only public papers, the same for everyone', async () => {
      const open = await project('Open');
      await publicPaper(open, { title: 'Public one' });
      await call('/papers', { method: 'POST', body: paper({ title: 'Draft' }) });
      expect(await titles()).toEqual(['Public one']);
      const asAuthor = await call('/public/papers', { user: ANN });
      expect(asAuthor.body.data.papers.map((card: { title: string }) => card.title)).toEqual(['Public one']);
      expect(asAuthor.headers.get('cache-control')).toBe('no-store');
    });

    it('finds papers by words, by authors and tags, and by an identifier in any spelling', async () => {
      const open = await project('Open');
      await publicPaper(open, { title: 'Night driving segmentation', authors: [{ name: 'Marie Curie' }], tags: ['Segmentation'], doi: '10.5555/Night.1' });
      await publicPaper(open, { title: 'Weather robustness', arxivId: '2402.00002', authors: [{ name: 'Ann Author' }] });

      expect(await titles('search=night')).toEqual(['Night driving segmentation']);
      expect(await titles('search=curie')).toEqual(['Night driving segmentation']);
      expect(await titles('search=segmentation')).toEqual(['Night driving segmentation']);
      expect(await titles('search=arXiv:2402.00002v3')).toEqual(['Weather robustness']);
      expect(await titles('search=https://doi.org/10.5555/night.1')).toEqual(['Night driving segmentation']);
      expect(await titles('search=nothing-like-this')).toEqual([]);
    });

    it('pages, and sorts by year', async () => {
      const open = await project('Open');
      await publicPaper(open, { title: 'A', year: 2020 });
      await publicPaper(open, { title: 'B', year: 2024 });
      await publicPaper(open, { title: 'C' });
      const page = await catalogue('limit=2&page=2');
      expect(page.pagination).toMatchObject({ page: 2, limit: 2, total: 3, pages: 2 });
      expect(page.papers.map((card) => card.title)).toEqual(['A']);
      expect((await catalogue('sort=year')).papers.map((card) => card.title)).toEqual(['B', 'A', 'C']);
    });

    it('lists the papers that cite a project, which is how a project shows where it is cited', async () => {
      const a = await project('Alpha');
      const b = await project('Beta');
      await publicPaper(a, { title: 'Cites alpha' });
      await publicPaper(b, { title: 'Cites beta' });
      expect(await titles(`project=${a}`)).toEqual(['Cites alpha']);
      expect(await titles('project=0000000000000000000000ff')).toEqual([]);
      expect((await call('/public/papers?project=nope', { user: '' })).status).toBe(400);
    });

    it('shows a result that is no longer public as gone, naming nothing to a visitor but its ref to the owner', async () => {
      const open = await project('Open');
      const other = await project('Other');
      const id = (
        await call('/papers', {
          method: 'POST',
          body: paper({ visibility: 'public', results: [{ kind: 'project', ref: open, note: 'Table 2' }, { kind: 'project', ref: other }] })
        })
      ).body.data.id;
      expect((await catalogue()).papers[0]).toMatchObject({ results: { cited: 2, available: 2 } });

      await Project.updateOne({ _id: open }, { visibility: 'private' });
      const visitor = (await call(`/papers/${id}`, { user: '' })).body.data;
      expect(visitor.results[0]).toEqual({ kind: 'project', available: false, note: 'Table 2' });
      expect(visitor.results[1]).toMatchObject({ available: true, name: 'Other' });
      expect((await catalogue()).papers[0].results).toEqual({ cited: 2, available: 1 });
      const owner = (await call(`/papers/${id}`)).body.data;
      expect(owner.results[0]).toMatchObject({ available: false, ref: open });

      await Project.updateOne({ _id: other }, { trashedAt: new Date() });
      expect((await call(`/papers/${id}`, { user: '' })).body.data.results.every((r: { available: boolean }) => !r.available)).toBe(true);
    });

    it('keeps a collaborator from losing a result they cannot read by editing around it', async () => {
      const mine = await project('Mine', { visibility: 'private', owner: { kind: 'group', id: GROUP }, createdBy: ANN });
      const open = await project('Open');
      const id = (
        await call('/papers', { method: 'POST', body: paper({ owner: { kind: 'group', id: GROUP }, results: [{ kind: 'project', ref: mine }, { kind: 'project', ref: open }] }) })
      ).body.data.id;
      // ADMIN is in the group, so reads `mine`; what the paper already cites is kept without being checked again.
      const edited = await call(`/papers/${id}`, { method: 'PUT', user: ADMIN, body: { results: [{ kind: 'project', ref: mine }, { kind: 'project', ref: open }] } });
      expect(edited.status).toBe(200);
      expect(edited.body.data.results).toHaveLength(2);
      const stranger = await call(`/papers/${id}`, { method: 'PUT', user: ADMIN, body: { results: [{ kind: 'project', ref: '0000000000000000000000ff' }] } });
      expect(stranger.status).toBe(400);
    });
  });

  describe('authors linked to accounts', () => {
    it('confirms the writer at once, and waits for anyone else', async () => {
      const open = await project('Open');
      const made = await publicPaper(open, { authors: [{ name: 'A. Author', userId: ANN }, { name: 'Ben B.', userId: BEN }, { name: 'No Account' }] });
      expect(made.status).toBe(201);
      const id = made.body.data.id;

      // The owner sees who is linked and who has not answered; a visitor sees names, and links only where agreed.
      expect((await call(`/papers/${id}`)).body.data.authors).toEqual([
        { name: 'A. Author', status: 'confirmed', user: { id: ANN, handle: 'ann', name: 'Ann Author' } },
        { name: 'Ben B.', status: 'pending', user: { id: BEN, handle: 'ben', name: 'Ben Builder' } },
        { name: 'No Account' }
      ]);
      expect((await call(`/papers/${id}`, { user: '' })).body.data.authors).toEqual([
        { name: 'A. Author', status: 'confirmed', user: { id: ANN, handle: 'ann', name: 'Ann Author' } },
        { name: 'Ben B.' },
        { name: 'No Account' }
      ]);
      expect((await call(`/papers/${id}`, { user: CAL })).body.data.authors[1]).toEqual({ name: 'Ben B.' });
      expect((await call(`/papers/${id}`, { user: BEN })).body.data.authors[1]).toMatchObject({ status: 'pending' });
    });

    it('puts a paper on a person’s page only once they confirm, and takes it off when they decline', async () => {
      const open = await project('Open');
      const id = (await publicPaper(open, { authors: [{ name: 'Ann', userId: ANN }, { name: 'Ben B.', userId: BEN }] })).body.data.id;
      expect(await titles(`user=${BEN}`)).toEqual([]);
      expect(await titles(`user=${ANN}`)).toEqual(['Robust segmentation at night']);

      const requests = await call('/papers/authorship-requests', { user: BEN });
      expect(requests.body.data.map((card: { id: string }) => card.id)).toEqual([id]);
      expect((await call('/papers/authorship-requests', { user: CAL })).body.data).toEqual([]);

      expect((await call(`/papers/${id}/authorship`, { method: 'PUT', user: BEN, body: { linked: true } })).body.data).toEqual({ id, linked: true });
      expect(await titles(`user=${BEN}`)).toEqual(['Robust segmentation at night']);
      expect((await call('/papers/authorship-requests', { user: BEN })).body.data).toEqual([]);

      await call(`/papers/${id}/authorship`, { method: 'PUT', user: BEN, body: { linked: false } });
      expect(await titles(`user=${BEN}`)).toEqual([]);
      const after = (await call(`/papers/${id}`, { user: '' })).body.data.authors;
      expect(after[1]).toEqual({ name: 'Ben B.' });

      // The owner cannot ask again.
      const again = await call(`/papers/${id}`, { method: 'PUT', body: { authors: [{ name: 'Ann', userId: ANN }, { name: 'Ben B.', userId: BEN }] } });
      expect(again.status).toBe(400);
      expect(again.body.message).toMatch(/declined/);
    });

    it('answers only for the person asked, and only for what names them', async () => {
      const open = await project('Open');
      const id = (await publicPaper(open, { authors: [{ name: 'Ann', userId: ANN }, { name: 'Ben B.', userId: BEN }] })).body.data.id;
      expect((await call(`/papers/${id}/authorship`, { method: 'PUT', user: CAL, body: { linked: true } })).status).toBe(404);
      expect((await call(`/papers/${id}/authorship`, { method: 'PUT', user: '', body: { linked: true } })).status).toBe(401);
      expect((await call(`/papers/${id}/authorship`, { method: 'PUT', user: BEN, body: { linked: 'yes' } })).status).toBe(400);
    });

    it('does not ask people about drafts, nor let them confirm one', async () => {
      const draft = (await call('/papers', { method: 'POST', body: paper({ authors: [{ name: 'Ben B.', userId: BEN }] }) })).body.data.id;
      expect((await call('/papers/authorship-requests', { user: BEN })).body.data).toEqual([]);
      expect((await call(`/papers/${draft}/authorship`, { method: 'PUT', user: BEN, body: { linked: true } })).status).toBe(404);
    });

    it('keeps confirmation through edits, and refuses an account that does not exist or is linked twice', async () => {
      const open = await project('Open');
      const id = (await publicPaper(open, { authors: [{ name: 'Ann', userId: ANN }, { name: 'Ben B.', userId: BEN }] })).body.data.id;
      await call(`/papers/${id}/authorship`, { method: 'PUT', user: BEN, body: { linked: true } });
      const renamed = await call(`/papers/${id}`, { method: 'PUT', body: { authors: [{ name: 'Ann', userId: ANN }, { name: 'Benjamin Builder', userId: BEN }] } });
      expect(renamed.body.data.authors[1]).toMatchObject({ name: 'Benjamin Builder', status: 'confirmed' });

      const ghost = await call(`/papers/${id}`, { method: 'PUT', body: { authors: [{ name: 'Ghost', userId: '0000000000000000000000fe' }] } });
      expect(ghost.status).toBe(400);
      const twice = await call(`/papers/${id}`, { method: 'PUT', body: { authors: [{ name: 'Ann', userId: ANN }, { name: 'Ann again', userId: ANN }] } });
      expect(twice.status).toBe(400);
    });

    it('shows a linked person with a hidden profile as an id only', async () => {
      const open = await project('Open');
      const id = (await publicPaper(open, { authors: [{ name: 'Hidden H.', userId: HIDDEN }] })).body.data.id;
      await call(`/papers/${id}/authorship`, { method: 'PUT', user: HIDDEN, body: { linked: true } });
      expect((await call(`/papers/${id}`, { user: '' })).body.data.authors).toEqual([{ name: 'Hidden H.', status: 'confirmed', user: { id: HIDDEN } }]);
    });
  });

  describe('sharing and finding', () => {
    it('gives a public paper a preview page, and a draft none', async () => {
      const open = await project('Open');
      const id = (await publicPaper(open, { abstract: 'We measure how segmentation holds up in the dark.', authors: [{ name: 'Ann Author' }, { name: 'Ben B.' }] })).body.data.id;
      const page = await call(`/public/share/papers/${id}`, { user: '' });
      expect(page.status).toBe(200);
      expect(page.text).toContain('Robust segmentation at night');
      expect(page.text).toContain('Ann Author, Ben B.');
      expect(page.text).toContain(`https://app.example.test/papers/${id}`);

      const draft = (await call('/papers', { method: 'POST', body: paper() })).body.data.id;
      expect((await call(`/public/share/papers/${draft}`, { user: '' })).status).toBe(404);
      expect((await call('/public/share/papers/nope', { user: '' })).status).toBe(404);
    });

    it('lists public papers in the sitemap, and not drafts', async () => {
      const open = await project('Open');
      const id = (await publicPaper(open)).body.data.id;
      const draft = (await call('/papers', { method: 'POST', body: paper() })).body.data.id;
      const sitemap = (await call('/public/sitemap.xml', { user: '' })).text;
      expect(sitemap).toContain(`https://app.example.test/papers/${id}`);
      expect(sitemap).not.toContain(draft);
    });
  });
});

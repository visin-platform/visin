import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import publicRoutes from '../../routes/publicRoutes';
import Project from '../../models/Project';
import Suite from '../../models/Suite';
import Training from '../../models/Training';
import { Finding } from '../../models/Finding';
import { lookupOwnerIdentities } from '../../clients/ownerIdentityClient';

jest.mock('../../clients/ownerIdentityClient', () => ({ lookupOwnerIdentities: jest.fn() }));

const ANN = '000000000000000000000001';
const HIDDEN = '000000000000000000000002';
const GROUP = '0000000000000000000000aa';
const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

interface Card {
  id: string;
  name: string;
  owner: Record<string, unknown>;
  runs: number;
  lastRunAt?: string;
  [key: string]: unknown;
}
interface Page {
  projects: Card[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

/** The public catalogue behind Explore: paged cards, the same for everyone. */
describe('the public project catalogue, with in-memory MongoDB', () => {
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
      owner: { kind: 'user', id: ANN },
      createdBy: ANN,
      createdAt: at('2026-09-01'),
      updatedAt: at('2026-09-01'),
      ...fields
    });
    ids[name] = String(_id);
  };
  const run = (name: string, when: string, extra: Record<string, unknown> = {}) =>
    Training.collection.insertOne({
      uuid: `run-${new mongoose.Types.ObjectId()}`,
      name: 'run',
      ownerId: ANN,
      projectId: ids[name],
      status: 'completed',
      createdAt: new Date(when),
      updatedAt: new Date(when),
      ...extra
    });
  const list = async (query = '') => {
    const response = await fetch(`${url}/public/projects${query ? `?${query}` : ''}`);
    return { status: response.status, headers: response.headers, body: (await response.json()) as { data: Page } };
  };
  const names = async (query = '') => (await list(query)).body.data.projects.map((card) => card.name);

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    await Project.syncIndexes();
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
    await Promise.all([Project, Training, Finding, Suite].map((model) => model.deleteMany({})));
    jest.mocked(lookupOwnerIdentities).mockReset();
    jest
      .mocked(lookupOwnerIdentities)
      .mockImplementation(
        async (owners) =>
          new Map(
            [
              { id: ANN, handle: 'ann-lee', name: 'Ann Lee', picture: 'https://p.test/ann.jpg' },
              { id: HIDDEN },
              { id: GROUP, handle: 'road-lab', name: 'Road lab' }
            ]
              .filter((identity) => owners.some((owner) => owner.id === identity.id))
              .map((identity) => [identity.id, identity])
          )
      );
    await project('Window ablations', {
      description: 'Swin window size study',
      updatedAt: at('2026-09-05'),
      createdAt: at('2026-09-01')
    });
    await project('Night driving', {
      owner: { kind: 'user', id: HIDDEN },
      createdBy: HIDDEN,
      updatedAt: at('2026-09-03'),
      createdAt: at('2026-09-04')
    });
    await project('Team harbour', {
      owner: { kind: 'group', id: GROUP },
      updatedAt: at('2026-09-04'),
      createdAt: at('2026-09-02')
    });
    await project('Private notes', { visibility: 'private', updatedAt: at('2026-09-09') });
    await project('Trashed one', { trashedAt: at('2026-09-08'), updatedAt: at('2026-09-08') });
    await run('Window ablations', '2026-09-02T08:00:00.000Z');
    await run('Window ablations', '2026-09-06T08:00:00.000Z');
    await run('Window ablations', '2026-09-07T08:00:00.000Z', { deletedAt: at('2026-09-08') });
    await run('Private notes', '2026-09-06T08:00:00.000Z');
  });

  it('lists the public projects that are not in the trash, never a private one, last edited first', async () => {
    expect(await names()).toEqual(['Window ablations', 'Team harbour', 'Night driving']);
  });

  it('puts the most recently active first, which a run can make a project that was edited long ago', async () => {
    await Project.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(ids['Night driving']) },
      { $set: { lastActivityAt: at('2026-09-20') } }
    );
    await Project.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(ids['Team harbour']) },
      { $set: { lastActivityAt: at('2026-08-01') } }
    );

    const { projects } = (await list()).body.data;

    // Night driving was edited 09-03 but is active 09-20; Team harbour was edited 09-04 but is quiet since 08-01.
    expect(projects.map((card) => card.name)).toEqual(['Night driving', 'Window ablations', 'Team harbour']);
    expect(projects[0].lastActivityAt).toBe('2026-09-20T12:00:00.000Z');
  });

  it('reads a project older than the field as last active when it was last edited, and sorts it by that', async () => {
    // The fixtures above have no lastActivityAt: they are exactly such projects.
    const cards = (await list()).body.data.projects;

    expect(cards.map((card) => [card.name, card.lastActivityAt])).toEqual([
      ['Window ablations', '2026-09-05T12:00:00.000Z'],
      ['Team harbour', '2026-09-04T12:00:00.000Z'],
      ['Night driving', '2026-09-03T12:00:00.000Z']
    ]);
  });

  it('can list the newest projects first instead', async () => {
    expect(await names('sort=created')).toEqual(['Night driving', 'Team harbour', 'Window ablations']);
  });

  it('shows a card: owner as far as they agreed, how many runs, and when the latest started', async () => {
    const cards = (await list()).body.data.projects;

    expect(cards[0]).toEqual({
      id: ids['Window ablations'],
      name: 'Window ablations',
      slug: 'window-ablations',
      description: 'Swin window size study',
      owner: { kind: 'user', id: ANN, handle: 'ann-lee', name: 'Ann Lee', picture: 'https://p.test/ann.jpg' },
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
      lastActivityAt: '2026-09-05T12:00:00.000Z',
      runs: 2,
      lastRunAt: '2026-09-06T08:00:00.000Z'
    });
    // No runs: a zero and no date. A person who hid their profile is no more than an id.
    expect(cards[2]).toMatchObject({ runs: 0, owner: { kind: 'user', id: HIDDEN } });
    expect(cards[2]).not.toHaveProperty('lastRunAt');
    expect(cards[1].owner).toEqual({ kind: 'group', id: GROUP, handle: 'road-lab', name: 'Road lab' });
  });

  it("asks for the page's owners once, and never leaks who created a project", async () => {
    const { body } = await list();

    expect(lookupOwnerIdentities).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain('createdBy');
    expect(Object.keys(body.data.projects[0]).sort()).toEqual([
      'createdAt',
      'description',
      'id',
      'lastActivityAt',
      'lastRunAt',
      'name',
      'owner',
      'runs',
      'slug',
      'updatedAt'
    ]);
  });

  it('pages, and says how many there are', async () => {
    const first = (await list('limit=2')).body.data;
    expect(first.projects.map((card) => card.name)).toEqual(['Window ablations', 'Team harbour']);
    expect(first.pagination).toEqual({ page: 1, limit: 2, total: 3, pages: 2 });

    const second = (await list('limit=2&page=2')).body.data;
    expect(second.projects.map((card) => card.name)).toEqual(['Night driving']);
    expect((await list('limit=2&page=3')).body.data.projects).toEqual([]);
  });

  it('finds projects by the words in their name or description', async () => {
    expect(await names('search=swin')).toEqual(['Window ablations']);
    expect(await names('search=harbour')).toEqual(['Team harbour']);
    expect(await names('search=nothingmatchesthis')).toEqual([]);
    // A private project's words are not searchable by anyone.
    expect(await names('search=notes')).toEqual([]);
  });

  it('is anonymous, and never kept by anything that sees it go by', async () => {
    const { status, headers } = await list();

    expect(status).toBe(200);
    expect(headers.get('cache-control')).toBe('no-store');
  });

  it('refuses a page, a limit or a sort it cannot read', async () => {
    for (const query of ['page=0', 'limit=0', 'limit=51', 'sort=name', 'page=x']) {
      expect((await list(query)).status).toBe(400);
    }
  });

  describe('the latest findings', () => {
    const finding = (name: string, title: string, when: string, extra: Record<string, unknown> = {}) =>
      Finding.collection.insertOne({
        projectId: ids[name],
        title,
        body: 'the whole body',
        authorKind: 'person',
        authorLabel: 'Ann',
        authorUserId: ANN,
        trainingIds: [],
        deletedAt: null,
        createdAt: at(when),
        updatedAt: at(when),
        ...extra
      });
    const latest = async (query = '') => {
      const response = await fetch(`${url}/public/findings${query ? `?${query}` : ''}`);
      return {
        status: response.status,
        headers: response.headers,
        body: (await response.json()) as { data: Record<string, unknown>[] }
      };
    };

    beforeEach(async () => {
      await finding('Window ablations', 'Older finding', '2026-09-02');
      await finding('Window ablations', 'Newer finding', '2026-09-06', {
        authorKind: 'assistant',
        authorLabel: 'Claude',
        trainingId: 't1'
      });
      await finding('Team harbour', 'Team finding', '2026-09-04');
      await finding('Private notes', 'A private conclusion', '2026-09-08');
      await finding('Trashed one', 'In the trash', '2026-09-08');
      await finding('Window ablations', 'Deleted', '2026-09-09', { deletedAt: at('2026-09-10') });
    });

    it('lists findings in public projects, newest first, and none of a private or trashed project or a deleted one', async () => {
      const { body } = await latest();

      expect(body.data.map((row) => row.title)).toEqual(['Newer finding', 'Team finding', 'Older finding']);
    });

    it('says what a row needs and no more: where it lives, who wrote it as software or a person, never the body or the account', async () => {
      const [row] = (await latest()).body.data;

      expect(row).toEqual({
        id: expect.any(String),
        title: 'Newer finding',
        authorKind: 'assistant',
        authorLabel: 'Claude',
        createdAt: '2026-09-06T12:00:00.000Z',
        project: { id: ids['Window ablations'], name: 'Window ablations', slug: 'window-ablations' },
        trainingId: 't1'
      });
      expect(JSON.stringify(await (await latest()).body)).not.toMatch(
        /whole body|authorUserId|000000000000000000000001/
      );
    });

    it('stops at the limit, reading past private findings to fill it', async () => {
      expect((await latest('limit=2')).body.data.map((row) => row.title)).toEqual(['Newer finding', 'Team finding']);
      // The two newest findings overall are in a private and a trashed project; they do not use up the page.
      expect((await latest('limit=1')).body.data.map((row) => row.title)).toEqual(['Newer finding']);
    });

    it('is anonymous and never kept, and refuses a limit it cannot read', async () => {
      expect((await latest()).headers.get('cache-control')).toBe('no-store');
      for (const query of ['limit=0', 'limit=21', 'limit=x']) expect((await latest(query)).status).toBe(400);
    });
  });

  describe('the preview page and the sitemap', () => {
    const savedApp = process.env.SHELL_FRONT_URL;
    const page = async (identifier: string) => {
      const response = await fetch(`${url}/public/share/projects/${identifier}`);
      return { status: response.status, headers: response.headers, text: await response.text() };
    };

    beforeEach(() => {
      process.env.SHELL_FRONT_URL = 'https://app.example.test/';
    });
    afterAll(() => {
      if (savedApp === undefined) delete process.env.SHELL_FRONT_URL;
      else process.env.SHELL_FRONT_URL = savedApp;
    });

    it('tells an unfurler what a public project is, who made it, and where it lives in the app', async () => {
      const { status, text, headers } = await page('window-ablations');

      expect(status).toBe(200);
      expect(headers.get('content-type')).toContain('text/html');
      expect(text).toContain('<meta property="og:title" content="Window ablations">');
      expect(text).toContain('<meta property="og:description" content="Swin window size study · by Ann Lee">');
      expect(text).toContain('<meta property="og:url" content="https://app.example.test/projects/window-ablations">');
      expect(text).toContain('<meta property="og:image" content="https://app.example.test/og-image.jpg">');
      expect(text).toContain(
        '<meta http-equiv="refresh" content="0; url=https://app.example.test/projects/window-ablations">'
      );
    });

    it('is kept by nothing, and cannot load or run anything', async () => {
      const { headers } = await page('window-ablations');

      expect(headers.get('cache-control')).toBe('no-store');
      expect(headers.get('content-security-policy')).toBe("default-src 'none'");
    });

    it('answers to the id too, and sends people to the address with the slug', async () => {
      const { status, text } = await page(ids['Window ablations']);

      expect(status).toBe(200);
      expect(text).toContain('content="https://app.example.test/projects/window-ablations"');
    });

    it('never treats a canonical project id as another project’s legacy slug', async () => {
      await project('Legacy alias', { slug: ids['Window ablations'] });
      const actual = await page(ids['Window ablations']);
      expect(actual.status).toBe(200);
      expect(actual.text).toContain('<title>Window ablations</title>');
      expect(actual.text).not.toContain('Legacy alias');

      await Project.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(ids['Window ablations']) },
        { $set: { visibility: 'private' } }
      );
      expect((await page(ids['Window ablations'])).status).toBe(404);
    });

    it('uses an id for the canonical URL when a legacy slug looks like an id', async () => {
      const legacySlug = 'abcdefabcdefabcdefabcdef';
      await Project.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(ids['Night driving']) },
        { $set: { slug: legacySlug } }
      );
      const actual = await page(ids['Night driving']);
      expect(actual.status).toBe(200);
      expect(actual.text).toContain(`content="https://app.example.test/projects/${ids['Night driving']}"`);
      const sitemap = await (await fetch(`${url}/public/sitemap.xml`)).text();
      expect(sitemap).toContain(`/projects/${ids['Night driving']}</loc>`);
      expect(sitemap).not.toContain(`/projects/${legacySlug}</loc>`);
    });

    it('describes a project that has no description by the start of its readme, without the marks that make it Markdown', async () => {
      await Project.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(ids['Team harbour']) },
        {
          $set: {
            readme:
              '# Harbour study\n\nSome **bold** words with a [link](https://x.test) and `code`.\n\n```\nnot shown\n```\n'
          }
        }
      );

      const { text } = await page('team-harbour');

      expect(text).toContain('content="Harbour study Some bold words with a link and code. · by Road lab"');
      expect(text).not.toContain('not shown');
    });

    it('says only that it is a project where there is nothing else to say, and names no owner who is not shown', async () => {
      const { text } = await page('night-driving');

      expect(text).toContain('content="A project on Visin"');
    });

    it('handles a size-limit readme full of unclosed link and HTML markers safely', async () => {
      for (const marker of ['[', '<']) {
        await Project.collection.updateOne(
          { _id: new mongoose.Types.ObjectId(ids['Night driving']) },
          { $set: { readme: marker.repeat(20_000) } }
        );
        const result = await page(ids['Night driving']);
        expect(result.status).toBe(200);
        expect(result.text).toContain(`${(marker === '<' ? '&lt;' : marker).repeat(199)}…`);
      }
    });

    it('answers the same for a private project, one in the trash and one that is not there', async () => {
      const answers = await Promise.all([
        page('private-notes'),
        page('trashed-one'),
        page('nobody'),
        page(ids['Private notes'])
      ]);

      expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404]);
      expect(new Set(answers.map((answer) => answer.text)).size).toBe(1);
    });

    it("is not there where the deployment has no address for the app, rather than pointing at someone else's", async () => {
      delete process.env.SHELL_FRONT_URL;

      expect((await page('window-ablations')).status).toBe(404);
      expect(await (await fetch(`${url}/public/sitemap.xml`)).status).toBe(404);
    });

    it('escapes what a project calls itself', async () => {
      await project('Evil', {
        name: '"><script>alert(1)</script>',
        slug: 'evil',
        description: '<img src=x onerror=alert(1)>'
      });

      const { text } = await page('evil');

      expect(text).not.toContain('<script>');
      expect(text).not.toContain('<img');
      expect(text).toContain('&lt;script&gt;');
    });

    it('lists the addresses of the public projects in a sitemap, and no private or trashed one', async () => {
      const response = await fetch(`${url}/public/sitemap.xml`);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/xml');
      expect(text).toContain('<loc>https://app.example.test/</loc>');
      for (const slug of ['window-ablations', 'team-harbour', 'night-driving']) {
        expect(text).toContain(`<loc>https://app.example.test/projects/${slug}</loc>`);
      }
      expect(text).not.toContain('private-notes');
      expect(text).not.toContain('trashed-one');
      expect(text).toContain('<lastmod>2026-09-05T12:00:00.000Z</lastmod>');
    });

    it('shares and lists only leaderboards whose suite and project are public', async () => {
      const suiteId = new mongoose.Types.ObjectId();
      await Suite.collection.insertOne({
        _id: suiteId,
        slug: 'harbour',
        version: 1,
        name: 'Harbour board',
        visibility: 'public',
        projectId: ids['Team harbour'],
        updatedAt: at('2026-09-05')
      });
      const share = () => fetch(`${url}/public/share/leaderboards/harbour/1`);
      expect(await (await share()).text()).toContain('content="Harbour board · v1"');
      expect(await (await fetch(`${url}/public/sitemap.xml`)).text()).toContain('/leaderboards/harbour/1</loc>');
      await Project.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(ids['Team harbour']) },
        { $set: { visibility: 'private' } }
      );
      expect((await share()).status).toBe(404);
      expect(await (await fetch(`${url}/public/sitemap.xml`)).text()).not.toContain('/leaderboards/harbour/1');
      await Project.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(ids['Team harbour']) },
        { $set: { visibility: 'public' } }
      );
      await Suite.collection.updateOne({ _id: suiteId }, { $set: { visibility: 'private' } });
      expect((await share()).status).toBe(404);
      expect(await (await fetch(`${url}/public/sitemap.xml`)).text()).not.toContain('/leaderboards/harbour/1');
      expect((await fetch(`${url}/public/share/leaderboards/harbour/not-a-version`)).status).toBe(400);
      await Suite.collection.deleteMany({});
    });

    it('uses the id for a project with no slug, and escapes what goes in an address', async () => {
      await Project.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(ids['Night driving']) },
        { $unset: { slug: '' } }
      );
      await project('Amp', { slug: 'a&b', name: 'Amp' });

      const text = await (await fetch(`${url}/public/sitemap.xml`)).text();

      expect(text).toContain(`/projects/${ids['Night driving']}</loc>`);
      expect(text).toContain('/projects/a%26b</loc>');
    });
  });
});

import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { User } from '../../models/User';
import authRoutes from '../../routes/authRoutes';
import { ensureHandle, isValidHandle, slugify, suggestHandle } from '../../services/handleService';

/** Handles, the public page they address, and the lookup other services use for owners. */
describe('handles and public users with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  const saved = process.env.INTERNAL_SERVICE_TOKEN;

  beforeAll(async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-test-token';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await User.createIndexes();
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/auth', authRoutes);
    app.use(errorHandler);
    server = await new Promise<Server>(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/auth`;
  }, 120_000);

  afterAll(async () => {
    if (saved === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = saved;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  const account = (email: string, extra: Record<string, unknown> = {}) =>
    User.create({ email, signupMethod: 'password', roles: [], ...extra });

  describe('choosing a handle', () => {
    it('starts from the name, with accents and spacing made plain', async () => {
      const user = await account('ann@example.test', { firstName: 'Änn', lastName: 'Example Smith' });

      expect(await ensureHandle(user)).toBe('ann-example-smith');
      expect((await User.findById(user._id))!.handle).toBe('ann-example-smith');
    });

    it('never makes the email public: with no name it is a plain word and a random tail', async () => {
      const user = await account('secret.person@example.test');

      const handle = await ensureHandle(user);

      expect(handle).toMatch(/^user-[0-9a-f]{6}$/);
      expect(handle).not.toContain('secret');
    });

    it('gives a second person of the same name a tail instead of the first one\'s handle', async () => {
      const first = await account('a1@example.test', { firstName: 'Ann', lastName: 'Lee' });
      const second = await account('a2@example.test', { firstName: 'Ann', lastName: 'Lee' });

      expect(await ensureHandle(first)).toBe('ann-lee');
      expect(await ensureHandle(second)).toMatch(/^ann-lee-[0-9a-f]{6}$/);
    });

    it('keeps the one it has, and reads the winner when a request raced it', async () => {
      const user = await account('r@example.test', { firstName: 'Ray' });
      const stale = await User.findById(user._id);
      await ensureHandle(user);

      expect(await ensureHandle(stale!)).toBe('ray');
      expect(await ensureHandle(user)).toBe('ray');
    });

    it('does not take a reserved word, or one too short, as its first choice', async () => {
      const admin = await account('adm@example.test', { firstName: 'Admin' });
      const short = await account('s@example.test', { firstName: 'Al' });

      expect(await ensureHandle(admin)).toMatch(/^admin-[0-9a-f]{6}$/);
      expect(await ensureHandle(short)).toMatch(/^al-[0-9a-f]{6}$/);
    });

    it('gives up, saying so, when every candidate is taken', async () => {
      const user = await account('x@example.test', { firstName: 'Xavier' });
      const spy = jest.spyOn(User, 'findOneAndUpdate').mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));
      try {
        await expect(ensureHandle(user)).rejects.toMatchObject({ statusCode: 409 });
      } finally {
        spy.mockRestore();
      }
    });

    it('lets any other database failure through', async () => {
      const user = await account('y@example.test', { firstName: 'Yan' });
      const spy = jest.spyOn(User, 'findOneAndUpdate').mockRejectedValue(new Error('connection lost'));
      try {
        await expect(ensureHandle(user)).rejects.toThrow('connection lost');
      } finally {
        spy.mockRestore();
      }
    });

    it('is unique in the database, whatever the code does', async () => {
      await account('u1@example.test', { handle: 'same' });

      await expect(account('u2@example.test', { handle: 'same' })).rejects.toMatchObject({ code: 11000 });
      // Many accounts with none are fine: the index only covers handles that exist.
      await account('n1@example.test');
      await expect(account('n2@example.test')).resolves.toBeDefined();
    });
  });

  describe('what a handle may be', () => {
    it.each(['ann', 'ann-lee', 'a1b', 'x'.repeat(30)])('accepts %s', handle => {
      expect(isValidHandle(handle)).toBe(true);
    });

    it.each(['ab', 'x'.repeat(31), '-ann', 'ann-', 'ann--lee', 'Ann', 'ann_lee', 'ann.lee', 'admin', 'explore', 'u'])(
      'refuses %s',
      handle => {
        expect(isValidHandle(handle)).toBe(false);
      }
    );

    it('slugifies any text to lowercase ASCII words', () => {
      expect(slugify('  Zoë  O\'Neil-Ñuñez ')).toBe('zoe-o-neil-nunez');
      expect(slugify('日本語')).toBe('');
      expect(suggestHandle({ firstName: '日本語' })).toBe('user');
      expect(suggestHandle({ firstName: 'A'.repeat(40) })).toBe('a'.repeat(23));
    });
  });

  describe('GET /auth/users/:handle', () => {
    const get = async (handle: string) => {
      const response = await fetch(`${base}/users/${handle}`);
      return { status: response.status, body: (await response.json()) as { data?: Record<string, unknown> } };
    };

    it('shows a person to anyone, and exactly the fields meant to be public', async () => {
      await account('ann@example.test', {
        firstName: 'Ann',
        lastName: 'Lee',
        handle: 'ann-lee',
        bio: 'Segmentation under bad weather',
        links: ['https://ann.example.test'],
        picture: 'https://pics.example.test/ann.jpg',
        passwordHash: 'must-never-appear',
        googleSubject: 'sub-1',
        roles: ['admin']
      });

      const { status, body } = await get('ann-lee');

      expect(status).toBe(200);
      expect(Object.keys(body.data!).sort()).toEqual(['bio', 'createdAt', 'handle', 'id', 'links', 'name', 'picture', 'showActivity']);
      expect(body.data).toMatchObject({
        handle: 'ann-lee',
        name: 'Ann Lee',
        bio: 'Segmentation under bad weather',
        links: ['https://ann.example.test']
      });
      expect(JSON.stringify(body)).not.toMatch(/ann@example|must-never|sub-1|admin/);
    });

    it('names a person by their handle when they gave no name, never by their email', async () => {
      await account('nameless@example.test', { handle: 'nameless' });

      const { body } = await get('nameless');

      expect(body.data).toMatchObject({ name: 'nameless', links: [] });
      expect(Object.keys(body.data!).sort()).toEqual(['createdAt', 'handle', 'id', 'links', 'name', 'showActivity']);
      expect(body.data).toMatchObject({ showActivity: true });
    });

    it('says whether the page may list what they have been doing, which they can switch off', async () => {
      await account('quiet@example.test', { handle: 'quiet', showActivity: false });

      expect((await get('quiet')).body.data).toMatchObject({ showActivity: false });
    });

    it('finds a handle however it is cased', async () => {
      await account('c@example.test', { handle: 'cased' });

      expect((await get('CaSeD')).status).toBe(200);
    });

    it('answers the same 404 for someone who hid their page as for someone who does not exist', async () => {
      await account('hidden@example.test', { handle: 'hidden', profilePublic: false });

      const hidden = await get('hidden');
      const missing = await get('nobody');

      expect(hidden.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(hidden.body).toEqual(missing.body);
    });
  });

  describe('GET /auth/share/users/:handle', () => {
    const savedApp = process.env.SHELL_FRONT_URL;
    const share = async (handle: string) => {
      const response = await fetch(`${base}/share/users/${handle}`);
      return { status: response.status, headers: response.headers, text: await response.text() };
    };

    beforeEach(() => {
      process.env.SHELL_FRONT_URL = 'https://app.example.test';
    });
    afterAll(() => {
      if (savedApp === undefined) delete process.env.SHELL_FRONT_URL;
      else process.env.SHELL_FRONT_URL = savedApp;
    });

    it('tells an unfurler who someone is, by their bio and picture, and sends people on to their page', async () => {
      await account('ann@example.test', { firstName: 'Ann', lastName: 'Lee', handle: 'ann-lee', bio: 'Segmentation under bad weather', picture: 'https://pics.example.test/ann.jpg' });

      const { status, text, headers } = await share('ann-lee');

      expect(status).toBe(200);
      expect(text).toContain('<meta property="og:title" content="Ann Lee">');
      expect(text).toContain('<meta property="og:description" content="Segmentation under bad weather">');
      expect(text).toContain('<meta property="og:image" content="https://pics.example.test/ann.jpg">');
      expect(text).toContain('<meta property="og:url" content="https://app.example.test/u/ann-lee">');
      expect(headers.get('cache-control')).toBe('no-store');
      expect(headers.get('content-security-policy')).toBe("default-src 'none'");
      // Never the email.
      expect(text).not.toContain('ann@example.test');
    });

    it('says who they are on Visin, and uses the app\'s own picture, when they wrote nothing and have none', async () => {
      await account('quiet@example.test', { handle: 'quiet' });

      const { text } = await share('quiet');

      expect(text).toContain('content="@quiet on Visin"');
      expect(text).toContain('content="https://app.example.test/og-image.jpg"');
    });

    it('answers the same for someone who hid their page as for someone who does not exist', async () => {
      await account('hidden@example.test', { handle: 'hidden', profilePublic: false });

      const answers = await Promise.all([share('hidden'), share('nobody')]);

      expect(answers.map((answer) => answer.status)).toEqual([404, 404]);
      expect(answers[0].text).toBe(answers[1].text);
    });

    it('is not there where the deployment has no address for the app', async () => {
      await account('ann@example.test', { handle: 'ann' });
      delete process.env.SHELL_FRONT_URL;

      expect((await share('ann')).status).toBe(404);
    });

    it('escapes what a person writes about themselves', async () => {
      await account('evil@example.test', { firstName: '"><script>alert(1)</script>', handle: 'evil', bio: '<img src=x onerror=alert(1)>' });

      const { text } = await share('evil');

      expect(text).not.toContain('<script>');
      expect(text).not.toContain('<img');
    });
  });

  describe('GET /auth/sitemap.xml', () => {
    const savedApp = process.env.SHELL_FRONT_URL;
    const sitemap = async () => {
      const response = await fetch(`${base}/sitemap.xml`);
      return { status: response.status, headers: response.headers, text: await response.text() };
    };

    beforeEach(() => {
      process.env.SHELL_FRONT_URL = 'https://app.example.test';
    });
    afterAll(() => {
      if (savedApp === undefined) delete process.env.SHELL_FRONT_URL;
      else process.env.SHELL_FRONT_URL = savedApp;
    });

    it('lists the address of each public page, and nothing else about the person', async () => {
      await account('ann@example.test', { firstName: 'Ann', lastName: 'Lee', handle: 'ann-lee' });
      await account('bob@example.test', { handle: 'bob', profilePublic: true });

      const { status, headers, text } = await sitemap();

      expect(status).toBe(200);
      expect(headers.get('content-type')).toContain('application/xml');
      expect(headers.get('cache-control')).toBe('no-store');
      expect(text).toContain('<loc>https://app.example.test/people</loc>');
      expect(text).toContain('<loc>https://app.example.test/u/ann-lee</loc>');
      expect(text).toContain('<loc>https://app.example.test/u/bob</loc>');
      expect(text).not.toContain('Ann');
      expect(text).not.toContain('@example.test');
    });

    it('leaves out a hidden page and an account with no handle yet, and drops a page the moment it is hidden', async () => {
      await account('hidden@example.test', { handle: 'hidden', profilePublic: false });
      await account('new@example.test');
      await account('shown@example.test', { handle: 'shown' });

      const before = (await sitemap()).text;
      expect(before).toContain('/u/shown<');
      expect(before).not.toContain('/u/hidden');
      expect((before.match(/<url>/g) ?? []).length).toBe(2);

      await User.updateOne({ handle: 'shown' }, { profilePublic: false });
      expect((await sitemap()).text).not.toContain('/u/shown');
    });

    it('is not there where the deployment has no address for the app', async () => {
      await account('ann@example.test', { handle: 'ann' });
      delete process.env.SHELL_FRONT_URL;

      expect((await sitemap()).status).toBe(404);
    });
  });

  describe('GET /auth/directory', () => {
    const list = async (query = '') => {
      const response = await fetch(`${base}/directory${query}`);
      return {
        status: response.status,
        headers: response.headers,
        body: (await response.json()) as {
          data?: { people: Record<string, unknown>[]; pagination: Record<string, number> };
        }
      };
    };

    it('lists the people with a public page in handle order, with only what a listing needs', async () => {
      await account('bea@example.test', { firstName: 'Bea', handle: 'bea', bio: 'Private thoughts', links: ['https://bea.example.test/'] });
      await account('ann@example.test', { firstName: 'Ann', lastName: 'Lee', handle: 'ann-lee', picture: 'https://pics.example.test/ann.jpg' });

      const { status, body } = await list();

      expect(status).toBe(200);
      expect(body.data!.people).toEqual([
        { id: expect.any(String), handle: 'ann-lee', name: 'Ann Lee', picture: 'https://pics.example.test/ann.jpg' },
        { id: expect.any(String), handle: 'bea', name: 'Bea' }
      ]);
      expect(body.data!.pagination).toEqual({ page: 1, limit: 24, total: 2, pages: 1 });
      expect(JSON.stringify(body)).not.toMatch(/bea\.example\.test|Private thoughts|@example/);
    });

    it('leaves out a hidden page and an account with no handle yet, in the count too', async () => {
      await account('hidden@example.test', { handle: 'hidden', profilePublic: false });
      await account('new@example.test');
      await account('shown@example.test', { handle: 'shown' });

      const { body } = await list();

      expect(body.data!.people.map((person) => person.handle)).toEqual(['shown']);
      expect(body.data!.pagination.total).toBe(1);
    });

    it('pages through everyone, and is never kept by anyone', async () => {
      for (const handle of ['aaa', 'bbb', 'ccc']) await account(`${handle}@example.test`, { handle });

      const second = await list('?page=2&limit=2');

      expect(second.body.data!.people.map((person) => person.handle)).toEqual(['ccc']);
      expect(second.body.data!.pagination).toEqual({ page: 2, limit: 2, total: 3, pages: 2 });
      expect((await list('?page=3&limit=2')).body.data!.people).toEqual([]);
      expect(second.headers.get('cache-control')).toBe('no-store');
    });

    it('refuses a page that makes no sense', async () => {
      expect((await list('?page=0')).status).toBe(400);
      expect((await list('?limit=500')).status).toBe(400);
    });
  });

  describe('GET /auth/users?q=', () => {
    const find = async (query: string) => {
      const response = await fetch(`${base}/users?${query}`);
      return { status: response.status, body: (await response.json()) as { data?: Record<string, unknown>[] } };
    };
    const handles = async (query: string) => ((await find(query)).body.data ?? []).map((user) => user.handle);

    beforeEach(async () => {
      await account('a@example.test', { firstName: 'Ann', lastName: 'Lee', handle: 'ann-lee', picture: 'https://p.test/a.jpg', bio: 'Never listed', links: ['https://ann.example.test'] });
      await account('b@example.test', { firstName: 'Bob', lastName: 'Annan', handle: 'bob' });
      await account('c@example.test', { firstName: 'Cara', handle: 'road-cara' });
      await account('hidden@example.test', { firstName: 'Anna', handle: 'anna-hidden', profilePublic: false });
      await account('nohandle@example.test', { firstName: 'Anders' });
    });

    it('finds people by the start of their handle or of either part of their name, in any case', async () => {
      expect(await handles('q=ann')).toEqual(['ann-lee', 'bob']);
      expect(await handles('q=ANN')).toEqual(['ann-lee', 'bob']);
      expect(await handles('q=lee')).toEqual(['ann-lee']);
      expect(await handles('q=road')).toEqual(['road-cara']);
      // The start of a word, not a substring.
      expect(await handles('q=nan')).toEqual([]);
    });

    it('never finds someone who hid their page, or has no handle to link to', async () => {
      expect(await handles('q=anna')).toEqual(['bob']);
      expect(await handles('q=anders')).toEqual([]);
      expect(JSON.stringify(await find('q=an'))).not.toContain('anna-hidden');
    });

    it('lists only what a search needs: no email, bio or links', async () => {
      const { body } = await find('q=ann-lee');

      expect(body.data).toEqual([{ id: expect.any(String), handle: 'ann-lee', name: 'Ann Lee', picture: 'https://p.test/a.jpg' }]);
      expect(JSON.stringify(body)).not.toMatch(/example\.test|Never listed/);
    });

    it('reads what was typed as text, not as a pattern', async () => {
      expect(await handles('q=.%2A')).toEqual([]);
      expect(await handles('q=a%2B')).toEqual([]);
    });

    it('stops at the limit, in handle order', async () => {
      expect(await handles('q=an&limit=1')).toEqual(['ann-lee']);
    });

    it('wants two characters and a sensible limit, and needs no sign-in', async () => {
      expect((await find('q=a')).status).toBe(400);
      expect((await find('')).status).toBe(400);
      expect((await find('q=ann&limit=21')).status).toBe(400);
      expect((await find('q=ann')).status).toBe(200);
    });
  });

  describe('POST /auth/internal/users/public', () => {
    const lookup = async (body: unknown, token: string | null = 'internal-test-token') => {
      const response = await fetch(`${base}/internal/users/public`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { 'x-internal-token': token } : {}) },
        body: JSON.stringify(body)
      });
      return { status: response.status, body: (await response.json()) as { data?: Record<string, unknown>[] } };
    };

    it('names the owners it is asked about, and leaves out the ones that do not exist', async () => {
      const ann = await account('ann@example.test', { firstName: 'Ann', lastName: 'Lee', handle: 'ann-lee', picture: 'https://p.example.test/a.jpg' });

      const { status, body } = await lookup({ ids: [ann.id, new mongoose.Types.ObjectId().toString()] });

      expect(status).toBe(200);
      expect(body.data).toEqual([
        { id: ann.id, handle: 'ann-lee', name: 'Ann Lee', picture: 'https://p.example.test/a.jpg' }
      ]);
    });

    it('shows an owner who hid their page as a bare id, with no name or avatar', async () => {
      const hidden = await account('h@example.test', {
        firstName: 'Hidden',
        handle: 'hidden',
        picture: 'https://p.example.test/h.jpg',
        profilePublic: false
      });

      const { body } = await lookup({ ids: [hidden.id] });

      expect(body.data).toEqual([{ id: hidden.id }]);
    });

    it('gives an owner from before handles theirs, so their name can link to a page', async () => {
      const legacy = await account('legacy@example.test', { firstName: 'Old', lastName: 'Timer' });

      const { body } = await lookup({ ids: [legacy.id] });

      expect(body.data).toEqual([{ id: legacy.id, handle: 'old-timer', name: 'Old Timer' }]);
    });

    it('is closed to anyone without the internal token, and wants a short list of ids', async () => {
      expect((await lookup({ ids: ['a'.repeat(24)] }, null)).status).toBe(401);
      expect((await lookup({ ids: ['a'.repeat(24)] }, 'wrong')).status).toBe(401);
      expect((await lookup({ ids: [] })).status).toBe(400);
      expect((await lookup({ ids: ['not-an-id'] })).status).toBe(400);
      expect((await lookup({ ids: Array.from({ length: 101 }, () => 'a'.repeat(24)) })).status).toBe(400);
    });
  });
});

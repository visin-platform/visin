jest.mock('../../clients/ownedResourcesClient', () => ({
  ownedByGroup: jest.fn().mockResolvedValue({ projects: { count: 0, names: [] }, datasets: { count: 0, names: [] } }),
}));
import express from 'express';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { Group } from '../../models/Group';
import {
  acceptInvitation,
  createGroup,
  createInvitation,
  deleteGroup,
  getPublicGroup,
  updateGroup,
} from '../../services/groupService';
import publicGroupRoutes from '../../routes/publicGroupRoutes';
import internalGroupRoutes from '../../routes/internalGroupRoutes';

const OWNER = '000000000000000000000001';
const ADMIN = '000000000000000000000002';
const MEMBER = '000000000000000000000003';

/** A group's public page: opt-in, the owner's alone, and no more than a name, a handle and a line about it. */
describe('group public pages against in-memory MongoDB', () => {
  let mongo: MongoMemoryServer | undefined;
  let server: Server;
  let base: string;
  const saved = process.env.INTERNAL_SERVICE_TOKEN;

  beforeAll(async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-test-token';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { serverSelectionTimeoutMS: 10_000 });
    await Group.init();
    const app = express();
    app.use(express.json());
    app.use('/api/internal/groups', internalGroupRoutes);
    app.use('/api/public', publicGroupRoutes);
    app.use(errorHandler);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  }, 120_000);

  afterEach(async () => {
    if (mongoose.connection.readyState === 1) await Group.deleteMany({});
  });

  afterAll(async () => {
    if (saved === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = saved;
    try {
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
      await mongoose.disconnect();
    } finally {
      await mongo?.stop();
    }
  });

  const team = async () => {
    const group = await createGroup(OWNER, 'Road lab');
    const id = group._id.toString();
    const add = async (userId: string, role: 'admin' | 'member') =>
      acceptInvitation((await createInvitation(id, OWNER, role)).token, userId);
    await add(ADMIN, 'admin');
    await add(MEMBER, 'member');
    return id;
  };
  const publish = async (id: string, handle = 'road-lab') =>
    updateGroup(id, OWNER, { handle, description: 'Segmentation under bad weather', profilePublic: true });

  describe('who may change it', () => {
    it('lets the owner pick a handle, describe the group and turn the page on', async () => {
      const id = await team();

      const group = await publish(id);

      expect(group).toMatchObject({ handle: 'road-lab', description: 'Segmentation under bad weather', profilePublic: true });
    });

    it('leaves an admin able to rename the group but not to touch its public page', async () => {
      const id = await team();

      expect((await updateGroup(id, ADMIN, { name: 'Renamed' })).name).toBe('Renamed');
      for (const updates of [{ handle: 'mine' }, { description: 'x' }, { profilePublic: true }]) {
        await expect(updateGroup(id, ADMIN, updates)).rejects.toMatchObject({
          statusCode: 403,
          message: "Only the group's owner can change its public page",
        });
      }
      await expect(updateGroup(id, MEMBER, { name: 'No' })).rejects.toMatchObject({ statusCode: 403 });
    });

    it('does not show a page that has no handle yet', async () => {
      const id = await team();

      await expect(updateGroup(id, OWNER, { profilePublic: true })).rejects.toMatchObject({
        statusCode: 400,
        message: 'Choose a handle before showing the public page',
      });
      // Handle and switch together are fine; a handle alone leaves the page off.
      expect((await updateGroup(id, OWNER, { handle: 'lab' })).profilePublic).toBe(false);
      expect((await updateGroup(id, OWNER, { profilePublic: true })).profilePublic).toBe(true);
    });

    it('says when a handle is taken, and leaves the group as it was', async () => {
      const first = await team();
      await publish(first, 'taken');
      const second = await createGroup(OWNER, 'Other lab');

      await expect(updateGroup(second._id.toString(), OWNER, { handle: 'taken' })).rejects.toMatchObject({
        statusCode: 409,
        message: 'That handle is taken',
      });
      expect((await Group.findById(second._id))!.handle).toBeUndefined();
    });

    it('clears the description when it is emptied, and lets any number of groups have no handle', async () => {
      const id = await team();
      await publish(id);

      expect((await updateGroup(id, OWNER, { description: '' })).description).toBeUndefined();
      await createGroup(OWNER, 'No handle one');
      await expect(createGroup(OWNER, 'No handle two')).resolves.toBeDefined();
    });
  });

  describe('GET /api/public/groups/:handle', () => {
    const get = async (handle: string) => {
      const response = await fetch(`${base}/public/groups/${handle}`);
      return { status: response.status, body: (await response.json()) as { data?: Record<string, unknown> } };
    };

    it('shows a group to anyone, with exactly the fields meant to be public and none of its members', async () => {
      const id = await team();
      await publish(id);

      const { status, body } = await get('road-lab');

      expect(status).toBe(200);
      expect(Object.keys(body.data!).sort()).toEqual(['createdAt', 'description', 'handle', 'id', 'name']);
      expect(body.data).toMatchObject({ id, handle: 'road-lab', name: 'Road lab', description: 'Segmentation under bad weather' });
      expect(JSON.stringify(body)).not.toMatch(new RegExp(`${OWNER}|${ADMIN}|${MEMBER}|members`));
    });

    it('leaves out the description of a group that wrote none, and finds a handle in any case', async () => {
      const id = await team();
      await updateGroup(id, OWNER, { handle: 'quiet', profilePublic: true });

      const { status, body } = await get('QUIET');

      expect(status).toBe(200);
      expect(Object.keys(body.data!).sort()).toEqual(['createdAt', 'handle', 'id', 'name']);
    });

    it('answers the same 404 for a page that is off, a group that was deleted and one that never was', async () => {
      const off = await team();
      await updateGroup(off, OWNER, { handle: 'off-page' });
      const gone = await createGroup(OWNER, 'Gone lab');
      await updateGroup(gone._id.toString(), OWNER, { handle: 'gone-lab', profilePublic: true });
      await deleteGroup(gone._id.toString(), OWNER);

      const answers = await Promise.all([get('off-page'), get('gone-lab'), get('nobody')]);

      expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404]);
      expect(answers[0].body).toEqual(answers[2].body);
      expect(answers[1].body).toEqual(answers[2].body);
    });

    it('is a service call too, for whoever asks directly', async () => {
      const id = await team();
      await publish(id);

      expect((await getPublicGroup('road-lab')).id).toBe(id);
      await expect(getPublicGroup('nobody')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('GET /api/public/share/groups/:handle', () => {
    const savedApp = process.env.SHELL_FRONT_URL;
    const share = async (handle: string) => {
      const response = await fetch(`${base}/public/share/groups/${handle}`);
      return { status: response.status, headers: response.headers, text: await response.text() };
    };

    beforeEach(() => {
      process.env.SHELL_FRONT_URL = 'https://app.example.test';
    });
    afterAll(() => {
      if (savedApp === undefined) delete process.env.SHELL_FRONT_URL;
      else process.env.SHELL_FRONT_URL = savedApp;
    });

    it('tells an unfurler what a group is and sends people on to its page, naming no member', async () => {
      const id = await team();
      await publish(id);

      const { status, text, headers } = await share('road-lab');

      expect(status).toBe(200);
      expect(text).toContain('<meta property="og:title" content="Road lab">');
      expect(text).toContain('<meta property="og:description" content="Segmentation under bad weather">');
      expect(text).toContain('<meta property="og:url" content="https://app.example.test/g/road-lab">');
      expect(headers.get('cache-control')).toBe('no-store');
      expect(text).not.toMatch(new RegExp(`${OWNER}|${ADMIN}|${MEMBER}`));
    });

    it('says it is a group on Visin where it wrote nothing about itself', async () => {
      const id = await team();
      await updateGroup(id, OWNER, { handle: 'plain', profilePublic: true });

      expect((await share('plain')).text).toContain('content="A group on Visin"');
    });

    it('answers the same for a page that is off, a group that was deleted and one that never was', async () => {
      const off = await team();
      await updateGroup(off, OWNER, { handle: 'off-page' });
      const gone = await createGroup(OWNER, 'Gone lab');
      await updateGroup(gone._id.toString(), OWNER, { handle: 'gone-lab', profilePublic: true });
      await deleteGroup(gone._id.toString(), OWNER);

      const answers = await Promise.all([share('off-page'), share('gone-lab'), share('nobody')]);

      expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404]);
      expect(new Set(answers.map((answer) => answer.text)).size).toBe(1);
    });

    it('is not there where the deployment has no address for the app', async () => {
      const id = await team();
      await publish(id);
      delete process.env.SHELL_FRONT_URL;

      expect((await share('road-lab')).status).toBe(404);
    });

    it('escapes what a group calls itself', async () => {
      const id = (await createGroup(OWNER, '"><script>alert(1)</script>'))._id.toString();
      await updateGroup(id, OWNER, { handle: 'evil', description: '<img src=x onerror=alert(1)>', profilePublic: true });

      const { text } = await share('evil');

      expect(text).not.toContain('<script>');
      expect(text).not.toContain('<img');
    });
  });

  describe('GET /api/public/groups?q=', () => {
    const find = async (query: string) => {
      const response = await fetch(`${base}/public/groups?${query}`);
      return { status: response.status, body: (await response.json()) as { data?: Record<string, unknown>[] } };
    };
    const handles = async (query: string) => ((await find(query)).body.data ?? []).map((group) => group.handle);
    const page = async (name: string, handle: string, extra: { description?: string; profilePublic?: boolean } = {}) => {
      const id = (await createGroup(OWNER, name))._id.toString();
      await updateGroup(id, OWNER, { handle, ...(extra.description ? { description: extra.description } : {}), profilePublic: extra.profilePublic ?? true });
      return id;
    };

    beforeEach(async () => {
      await page('Road lab', 'road-lab', { description: 'Segmentation' });
      await page('Harbour team', 'harbour');
      await page('Quiet group', 'quiet-group', { profilePublic: false });
      const gone = await page('Road gone', 'road-gone');
      await deleteGroup(gone, OWNER);
      await createGroup(OWNER, 'Road without a page');
    });

    it('finds groups by the start of their handle or name, in any case', async () => {
      expect(await handles('q=road')).toEqual(['road-lab']);
      expect(await handles('q=HARBOUR')).toEqual(['harbour']);
      expect(await handles('q=team')).toEqual([]);
      // The start of the name, which a handle does not carry.
      expect(await handles('q=Harbour%20te')).toEqual(['harbour']);
    });

    it('does not find a group whose page is off, that was deleted, or that has no page, whatever it is called', async () => {
      expect(await handles('q=quiet')).toEqual([]);
      expect(await handles('q=road-gone')).toEqual([]);
      expect(await handles('q=Road%20without')).toEqual([]);
    });

    it('lists a name, a handle and a description, and nothing about members', async () => {
      const { body } = await find('q=road-lab');

      expect(body.data).toEqual([{ id: expect.any(String), handle: 'road-lab', name: 'Road lab', description: 'Segmentation' }]);
      expect(JSON.stringify(body)).not.toMatch(new RegExp(`${OWNER}|members`));
    });

    it('reads what was typed as text, and stops at the limit', async () => {
      expect(await handles('q=.%2A')).toEqual([]);
      expect(await handles('q=ha&limit=1')).toEqual(['harbour']);
      await page('Hat club', 'hats');
      expect(await handles('q=ha&limit=1')).toEqual(['harbour']);
      expect(await handles('q=ha')).toEqual(['harbour', 'hats']);
    });

    it('wants two characters and a sensible limit, and needs no sign-in', async () => {
      expect((await find('q=r')).status).toBe(400);
      expect((await find('')).status).toBe(400);
      expect((await find('q=road&limit=21')).status).toBe(400);
      expect((await find('q=road')).status).toBe(200);
    });
  });

  describe('POST /api/internal/groups/public', () => {
    const lookup = async (body: unknown, token: string | null = 'internal-test-token') => {
      const response = await fetch(`${base}/internal/groups/public`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { 'x-internal-token': token } : {}) },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json()) as { data?: Record<string, unknown>[] } };
    };

    it('names the groups with a public page and says nothing at all about the rest', async () => {
      const shown = await team();
      await publish(shown);
      const hidden = (await createGroup(OWNER, 'Private lab'))._id.toString();
      await updateGroup(hidden, OWNER, { handle: 'private-lab' });

      const { status, body } = await lookup({ ids: [shown, hidden, new mongoose.Types.ObjectId().toString()] });

      expect(status).toBe(200);
      expect(body.data).toEqual([{ id: shown, handle: 'road-lab', name: 'Road lab' }]);
    });

    it('is closed to anyone without the internal token, and wants a short list of ids', async () => {
      const id = 'a'.repeat(24);
      expect((await lookup({ ids: [id] }, null)).status).toBe(401);
      expect((await lookup({ ids: [id] }, 'wrong')).status).toBe(401);
      expect((await lookup({ ids: [] })).status).toBe(400);
      expect((await lookup({ ids: ['not-an-id'] })).status).toBe(400);
    });
  });
});

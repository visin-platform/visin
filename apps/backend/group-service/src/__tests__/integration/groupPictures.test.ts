jest.mock('../../clients/ownedResourcesClient', () => ({
  ownedByGroup: jest.fn().mockResolvedValue({ projects: { count: 0, names: [] }, datasets: { count: 0, names: [] } })
}));
import express from 'express';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { Group } from '../../models/Group';
import { GroupAvatar } from '../../models/GroupAvatar';
import {
  acceptInvitation,
  createGroup,
  createInvitation,
  deleteGroup,
  getPublicGroup,
  listPublicGroups,
  lookupPublicGroups,
  permanentlyDeleteGroup,
  searchPublicGroups,
  updateGroup
} from '../../services/groupService';
import groupRoutes from '../../routes/groupRoutes';
import publicGroupRoutes from '../../routes/publicGroupRoutes';

const OWNER = '000000000000000000000001';
const ADMIN = '000000000000000000000002';
const MEMBER = '000000000000000000000003';
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('pretend pixels')
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('pretend pixels')]);
const GIF = Buffer.from('GIF89a pretend pixels');

/** What a group shows of itself beyond its name: sites of its own, and a picture. */
describe('group links and pictures against in-memory MongoDB', () => {
  let mongo: MongoMemoryServer | undefined;
  let server: Server;
  let base: string;
  const saved = { token: process.env.INTERNAL_SERVICE_TOKEN, publicUrl: process.env.GROUP_SERVICE_URL };

  beforeAll(async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-test-token';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { serverSelectionTimeoutMS: 10_000 });
    await Group.init();
    await GroupAvatar.init();
    const app = express();
    app.use(express.json());
    app.use('/api/public', publicGroupRoutes);
    app.use('/api/groups', groupRoutes);
    app.use(errorHandler);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  }, 120_000);

  beforeEach(() => {
    process.env.GROUP_SERVICE_URL = 'https://group.example.test';
  });
  afterEach(async () => {
    if (mongoose.connection.readyState === 1) {
      await Group.deleteMany({});
      await GroupAvatar.deleteMany({});
    }
  });
  afterAll(async () => {
    if (saved.token === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = saved.token;
    if (saved.publicUrl === undefined) delete process.env.GROUP_SERVICE_URL;
    else process.env.GROUP_SERVICE_URL = saved.publicUrl;
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
  const publish = (id: string, handle = 'road-lab') =>
    updateGroup(id, OWNER, { handle, description: 'Segmentation', profilePublic: true });
  const put = (id: string, as: string, body: Buffer | string, type = 'application/octet-stream') =>
    fetch(`${base}/groups/${id}/picture?userId=${as}`, {
      method: 'PUT',
      headers: { 'content-type': type, 'x-internal-token': 'internal-test-token', 'x-service-id': 'test' },
      body: body as BodyInit
    });
  const remove = (id: string, as: string) =>
    fetch(`${base}/groups/${id}/picture?userId=${as}`, {
      method: 'DELETE',
      headers: { 'x-internal-token': 'internal-test-token', 'x-service-id': 'test' }
    });
  const picture = (id: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/public/avatars/${id}`, { headers });

  describe('links', () => {
    it("lets the owner list the group's own sites, with shorthands and bare domains made https addresses, and refuses the rest", async () => {
      const id = await team();

      const response = await fetch(`${base}/groups/${id}?userId=${OWNER}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': 'internal-test-token',
          'x-service-id': 'test'
        },
        body: JSON.stringify({ links: ['github:road-lab', 'road-lab.example.test', 'https://other.example.test/x'] })
      });

      expect(response.status).toBe(200);
      expect(((await response.json()) as { data: { links: string[] } }).data.links).toEqual([
        'https://github.com/road-lab',
        'https://road-lab.example.test',
        'https://other.example.test/x'
      ]);
      const refused = await fetch(`${base}/groups/${id}?userId=${OWNER}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': 'internal-test-token',
          'x-service-id': 'test'
        },
        body: JSON.stringify({ links: ['javascript:alert(1)'] })
      });
      expect(refused.status).toBe(400);
    });

    it("is the owner's alone, like the rest of the public page, and an empty list clears them", async () => {
      const id = await team();
      await updateGroup(id, OWNER, { links: ['https://a.example.test'] });

      await expect(updateGroup(id, ADMIN, { links: ['https://b.example.test'] })).rejects.toMatchObject({
        statusCode: 403
      });
      expect((await updateGroup(id, OWNER, { links: [] })).links).toBeUndefined();
    });

    it('shows on the public page, and is an empty list where there are none', async () => {
      const id = await team();
      await publish(id);
      expect((await getPublicGroup('road-lab')).links).toEqual([]);

      await updateGroup(id, OWNER, { links: ['https://orcid.org/0000-0002-1825-0097'] });

      expect((await getPublicGroup('road-lab')).links).toEqual(['https://orcid.org/0000-0002-1825-0097']);
    });
  });

  describe('PUT /api/groups/:id/picture', () => {
    it('stores the picture for the owner and points the group at it', async () => {
      const id = await team();

      const response = await put(id, OWNER, PNG, 'image/png');
      const body = (await response.json()) as { data: { picture: string } };

      expect(response.status).toBe(200);
      expect(body.data.picture).toMatch(
        new RegExp(`^https://group\\.example\\.test/api/public/avatars/${id}\\?v=\\d+$`)
      );
      const stored = (await Group.findById(id))!;
      expect(stored.picture).toBe(body.data.picture);
      expect(stored.avatarUpdatedAt).toBeInstanceOf(Date);
      expect((await GroupAvatar.findOne({ groupId: id }))!.contentType).toBe('image/png');
    });

    it('knows a picture by its bytes, replaces the old one, and refuses what is not an image', async () => {
      const id = await team();

      expect((await put(id, OWNER, JPEG, 'text/plain')).status).toBe(200);
      expect((await put(id, OWNER, PNG, 'image/jpeg')).status).toBe(200);
      expect(await GroupAvatar.countDocuments()).toBe(1);
      expect((await GroupAvatar.findOne({ groupId: id }))!.contentType).toBe('image/png');
      for (const [body, type] of [
        [GIF, 'image/gif'],
        ['<svg onload="alert(1)"/>', 'image/png'],
        [Buffer.alloc(0), 'image/png']
      ] as const) {
        expect((await put(id, OWNER, body as Buffer | string, type)).status).toBe(400);
      }
    });

    it('refuses one that is too big to be a few hundred pixels', async () => {
      const id = await team();

      expect((await put(id, OWNER, Buffer.concat([PNG, Buffer.alloc(300 * 1024)]), 'image/png')).status).toBe(413);
      expect(await GroupAvatar.countDocuments()).toBe(0);
    });

    it("is the owner's alone", async () => {
      const id = await team();

      for (const who of [ADMIN, MEMBER, '000000000000000000000009']) {
        expect((await put(id, who, PNG, 'image/png')).status).toBe(403);
      }
      expect((await put(new mongoose.Types.ObjectId().toString(), OWNER, PNG, 'image/png')).status).toBe(404);
      expect(await GroupAvatar.countDocuments()).toBe(0);
    });

    it('says what to set where the deployment has no public address for this service, and stores nothing', async () => {
      const id = await team();
      delete process.env.GROUP_SERVICE_URL;

      const response = await put(id, OWNER, PNG, 'image/png');

      expect(response.status).toBe(501);
      expect(JSON.stringify(await response.json())).toContain('GROUP_SERVICE_URL');
      expect(await GroupAvatar.countDocuments()).toBe(0);
    });
  });

  describe('GET /api/public/avatars/:groupId', () => {
    it('serves the picture to anyone once the page is on, as an image and nothing else, and revalidates it', async () => {
      const id = await team();
      await publish(id);
      await put(id, OWNER, PNG, 'image/png');

      const response = await picture(id);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(Buffer.from(await response.arrayBuffer()).equals(PNG)).toBe(true);
      expect((await picture(id, { 'if-none-match': response.headers.get('etag')! })).status).toBe(304);
    });

    it('answers the same 404 for a page that is off, a group with no picture, a deleted group and a nonsense id', async () => {
      const off = await team();
      await updateGroup(off, OWNER, { handle: 'off-page' });
      await put(off, OWNER, PNG, 'image/png');
      const plain = await createGroup(OWNER, 'Plain lab');
      await updateGroup(plain._id.toString(), OWNER, { handle: 'plain', profilePublic: true });
      const gone = await createGroup(OWNER, 'Gone lab');
      await updateGroup(gone._id.toString(), OWNER, { handle: 'gone-lab', profilePublic: true });
      await put(gone._id.toString(), OWNER, PNG, 'image/png');
      await deleteGroup(gone._id.toString(), OWNER);

      const answers = await Promise.all([
        picture(off),
        picture(plain._id.toString()),
        picture(gone._id.toString()),
        picture('not-an-id')
      ]);

      expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404]);
      expect(new Set(await Promise.all(answers.map((answer) => answer.text()))).size).toBe(1);
    });
  });

  describe('DELETE /api/groups/:id/picture', () => {
    it('removes the picture for the owner, and only the owner', async () => {
      const id = await team();
      await publish(id);
      await put(id, OWNER, PNG, 'image/png');

      expect((await remove(id, ADMIN)).status).toBe(403);
      expect(await GroupAvatar.countDocuments()).toBe(1);
      expect((await remove(id, OWNER)).status).toBe(200);

      expect(await GroupAvatar.countDocuments()).toBe(0);
      const stored = (await Group.findById(id))!;
      expect(stored.picture).toBeUndefined();
      expect(stored.avatarUpdatedAt).toBeUndefined();
      expect((await picture(id)).status).toBe(404);
      expect((await remove(new mongoose.Types.ObjectId().toString(), OWNER)).status).toBe(404);
    });

    it('goes with the group when it is deleted for good', async () => {
      const id = await team();
      await put(id, OWNER, PNG, 'image/png');
      await deleteGroup(id, OWNER);
      expect(await GroupAvatar.countDocuments()).toBe(1);

      await permanentlyDeleteGroup(id, OWNER);

      expect(await GroupAvatar.countDocuments()).toBe(0);
    });
  });

  describe('where the picture shows', () => {
    it('is on the public page, the search, the directory and the owner lookup', async () => {
      const id = await team();
      await publish(id);
      const { data } = (await (await put(id, OWNER, PNG, 'image/png')).json()) as { data: { picture: string } };

      expect((await getPublicGroup('road-lab')).picture).toBe(data.picture);
      expect((await searchPublicGroups('road', 5))[0].picture).toBe(data.picture);
      expect((await listPublicGroups(1, 24)).groups[0].picture).toBe(data.picture);
      expect((await lookupPublicGroups([id]))[0].picture).toBe(data.picture);
    });

    it('is on the preview page, where a chat shows a picture for the link', async () => {
      process.env.SHELL_FRONT_URL = 'https://app.example.test';
      const id = await team();
      await publish(id);
      const { data } = (await (await put(id, OWNER, PNG, 'image/png')).json()) as { data: { picture: string } };

      const text = await (await fetch(`${base}/public/share/groups/road-lab`)).text();

      expect(text).toContain(`<meta property="og:image" content="${data.picture}">`);
      delete process.env.SHELL_FRONT_URL;
    });
  });
});

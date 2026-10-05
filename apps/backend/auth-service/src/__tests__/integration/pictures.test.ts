import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { Avatar } from '../../models/Avatar';
import { User } from '../../models/User';
import authRoutes from '../../routes/authRoutes';
import { verifyGoogleToken } from '../../services/googleAuthService';
import { verifyJWT } from '../../services/jwtService';
import { signSessionToken } from '../helpers/sessionToken';

jest.mock('../../services/googleAuthService', () => ({ verifyGoogleToken: jest.fn() }));
const google = verifyGoogleToken as jest.Mock;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('pretend pixels')]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('pretend pixels')]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 pixels')]);
const GIF = Buffer.from('GIF89a pretend pixels');

describe('profile pictures with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  const oldEnv = { ...process.env };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'pictures-integration-secret';
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    delete process.env.GROUP_SERVICE_URL;
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await User.init();
    await Avatar.init();
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/auth', authRoutes);
    app.use(errorHandler);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/auth`;
  }, 120_000);

  beforeEach(() => {
    process.env.AUTH_SERVICE_PUBLIC_URL = 'https://auth.example.test';
    google.mockReset();
  });
  afterEach(async () => {
    await User.deleteMany({});
    await Avatar.deleteMany({});
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
    process.env = oldEnv;
  });

  const account = (extra: Record<string, unknown> = {}) =>
    User.create({ email: `${new mongoose.Types.ObjectId()}@example.test`, signupMethod: 'password', roles: [], handle: `h${Math.random().toString(36).slice(2, 8)}`, ...extra });
  const tokenFor = (user: { id: string; email: string; tokenVersion: number }) =>
    signSessionToken({ id: user.id, email: user.email, name: 'Ann', tokenVersion: user.tokenVersion }, user.id);
  const put = async (user: { id: string; email: string; tokenVersion: number }, body: Buffer | string, type = 'application/octet-stream') =>
    fetch(`${base}/profile/picture`, {
      method: 'PUT',
      headers: { 'content-type': type, authorization: `Bearer ${await tokenFor(user)}` },
      body: body as BodyInit
    });
  const picture = (id: string, headers: Record<string, string> = {}) => fetch(`${base}/avatars/${id}`, { headers });

  describe('PUT /auth/profile/picture', () => {
    it('stores the picture, points the account at it, and re-signs the session to carry it', async () => {
      const user = await account();

      const response = await put(user, PNG, 'image/png');
      const body = (await response.json()) as { data: { picture: string } };

      expect(response.status).toBe(200);
      expect(body.data.picture).toMatch(new RegExp(`^https://auth\\.example\\.test/auth/avatars/${user.id}\\?v=\\d+$`));
      const stored = (await User.findById(user.id))!;
      expect(stored.picture).toBe(body.data.picture);
      expect(stored.avatarUpdatedAt).toBeInstanceOf(Date);
      expect((await Avatar.findOne({ userId: user.id }))!.contentType).toBe('image/png');
      const cookie = response.headers.get('set-cookie') ?? '';
      const jwt = /access_token=([^;]+)/.exec(cookie)?.[1];
      expect(verifyJWT(jwt!)).toMatchObject({ id: user.id, picture: body.data.picture });
    });

    it('knows a JPEG and a WebP by their bytes, whatever the sender called them', async () => {
      const user = await account();

      expect((await put(user, JPEG, 'text/plain')).status).toBe(200);
      expect((await Avatar.findOne({ userId: user.id }))!.contentType).toBe('image/jpeg');
      expect((await put(user, WEBP, 'image/png')).status).toBe(200);
      expect((await Avatar.findOne({ userId: user.id }))!.contentType).toBe('image/webp');
      expect(await Avatar.countDocuments()).toBe(1);
    });

    it('refuses what is not a JPEG, PNG or WebP, however it is labelled', async () => {
      const user = await account();

      for (const [body, type] of [
        [GIF, 'image/gif'],
        ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', 'image/png'],
        ['just text', 'image/jpeg'],
        [Buffer.alloc(0), 'image/png'],
        [JSON.stringify({ picture: 'x' }), 'application/json']
      ] as const) {
        expect((await put(user, body as Buffer | string, type)).status).toBe(400);
      }
      expect(await Avatar.countDocuments()).toBe(0);
      expect((await User.findById(user.id))!.picture).toBeUndefined();
    });

    it('refuses a picture that is too big to be a few hundred pixels', async () => {
      const user = await account();

      const response = await put(user, Buffer.concat([PNG, Buffer.alloc(300 * 1024)]), 'image/png');

      expect(response.status).toBe(413);
      expect(await Avatar.countDocuments()).toBe(0);
    });

    it('needs a signed-in session', async () => {
      const response = await fetch(`${base}/profile/picture`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: PNG });

      expect(response.status).toBe(401);
    });

    it('says what to set where the deployment has no public address for this service', async () => {
      const user = await account();
      delete process.env.AUTH_SERVICE_PUBLIC_URL;
      delete process.env.AUTH_SERVICE_URL;

      const response = await put(user, PNG, 'image/png');

      expect(response.status).toBe(501);
      expect(JSON.stringify(await response.json())).toContain('AUTH_SERVICE_PUBLIC_URL');
      expect(await Avatar.countDocuments()).toBe(0);
    });
  });

  describe('GET /auth/avatars/:userId', () => {
    it('serves the picture to anyone, as an image and nothing else, and revalidates it', async () => {
      const user = await account();
      await put(user, PNG, 'image/png');

      const response = await picture(user.id);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(Buffer.from(await response.arrayBuffer()).equals(PNG)).toBe(true);

      const again = await picture(user.id, { 'if-none-match': response.headers.get('etag')! });
      expect(again.status).toBe(304);
    });

    it('serves a new picture after a replacement, not the old one', async () => {
      const user = await account();
      await put(user, PNG, 'image/png');
      const first = await picture(user.id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await put(user, JPEG, 'image/jpeg');

      const second = await picture(user.id, { 'if-none-match': first.headers.get('etag')! });

      expect(second.status).toBe(200);
      expect(second.headers.get('content-type')).toBe('image/jpeg');
    });

    it('answers the same 404 for a hidden page, an account with no picture, an unknown account and a nonsense id', async () => {
      const hidden = await account({ profilePublic: false });
      await put(hidden, PNG, 'image/png');
      const plain = await account();

      const answers = await Promise.all([
        picture(hidden.id),
        picture(plain.id),
        picture(new mongoose.Types.ObjectId().toString()),
        picture('not-an-id')
      ]);

      expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404]);
      expect(new Set(await Promise.all(answers.map((answer) => answer.text()))).size).toBe(1);
    });
  });

  describe('DELETE /auth/profile/picture', () => {
    it('removes the picture and the account\'s pointer to it', async () => {
      const user = await account();
      await put(user, PNG, 'image/png');

      const response = await fetch(`${base}/profile/picture`, { method: 'DELETE', headers: { authorization: `Bearer ${await tokenFor(user)}` } });

      expect(response.status).toBe(200);
      expect(await Avatar.countDocuments()).toBe(0);
      const stored = (await User.findById(user.id))!;
      expect(stored.picture).toBeUndefined();
      expect(stored.avatarUpdatedAt).toBeUndefined();
      expect((await picture(user.id)).status).toBe(404);
    });

    it('needs a signed-in session', async () => {
      expect((await fetch(`${base}/profile/picture`, { method: 'DELETE' })).status).toBe(401);
    });
  });

  describe('signing in', () => {
    const googleSignIn = () =>
      fetch(`${base}/validate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: 'google-token' })
      });

    it('lets Google show its picture until one is uploaded, and never over an uploaded one', async () => {
      google.mockResolvedValue({ sub: 'subject-1', email: 'ann@example.test', email_verified: true, name: 'Ann', picture: 'https://google.example.test/ann.jpg' });
      const user = await account({ email: 'ann@example.test', signupMethod: 'google', googleSubject: 'subject-1' });
      expect((await googleSignIn()).status).toBe(200);
      expect((await User.findById(user.id))!.picture).toBe('https://google.example.test/ann.jpg');

      await put(user, PNG, 'image/png');
      const uploaded = (await User.findById(user.id))!.picture;
      const again = await googleSignIn();

      expect(again.status).toBe(200);
      expect((await User.findById(user.id))!.picture).toBe(uploaded);
      const result = (await again.json()) as { token: string };
      expect(verifyJWT(result.token)).toMatchObject({ picture: uploaded });
    });
  });
});

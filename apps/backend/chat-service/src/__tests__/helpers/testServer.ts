import './mocks';
import { createServer, type Server } from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { vi, type Mock } from 'vitest';
import * as assistants from '../../services/assistantClient';
import { createApp } from '../../app';
import { Block } from '../../models/Block';
import { Call } from '../../models/Call';
import { CallSignal } from '../../models/CallSignal';
import { Conversation } from '../../models/Conversation';
import { DeploymentSecret } from '../../models/DeploymentSecret';
import { Message } from '../../models/Message';
import { PushPreference } from '../../models/PushPreference';
import { PushSubscription } from '../../models/PushSubscription';
import { groups } from '../../services/access';
import { resetPushConfig } from '../../services/pushService';

export let base: string;
let mongo: MongoMemoryServer, server: Server, currentApp: ReturnType<typeof createApp>;

export async function request<T = Record<string, unknown>>(path: string, user = 'alice', body?: unknown, method?: string) {
  const response = await fetch(`${base}/api/chat${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'x-test-user': user, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return {
    status: response.status,
    body: (await response.json()) as { data: T; message?: string }
  };
}

export async function create(kind = 'direct', handles = ['bob']) {
  const result = await request('/conversations', 'alice', { kind, title: 'Research', handles });
  expect(result.status).toBe(201);
  return String(result.body.data._id);
}

/** Each feature suite owns an isolated database, HTTP app, and per-app rate limits. */
export function setupChatTests() {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'chat-test-secret';
    process.env.VISION_SERVICE_URL = 'http://vision.invalid';
    process.env.GROUP_SERVICE_URL = 'http://groups.invalid';
    process.env.INTERNAL_SERVICE_TOKEN = 'test';
    // What chat seals its push signing keys with.
    process.env.API_KEY_ENCRYPTION_SECRET = 'chat-test-encryption-secret';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all(
      [Conversation, Message, Block, PushSubscription, DeploymentSecret, Call, CallSignal].map((model) => model.init())
    );
    currentApp = createApp();
    server = createServer((req, res) => currentApp(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 30000);
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });
  beforeEach(async () => {
    process.env.API_KEY_ENCRYPTION_SECRET = 'chat-test-encryption-secret';
    // What chat asked of the assistants is a test's to look at, so it starts from nothing.
    for (const fn of Object.values(assistants)) if (vi.isMockFunction(fn)) fn.mockClear();
    currentApp = createApp();
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    await Block.deleteMany({});
    // The assistant service's collections, which chat only reads.
    for (const collection of ['chatassistants', 'chatassistantruns', 'chatscreencalls'])
      await mongoose.connection.collection(collection).deleteMany({});
    await PushSubscription.deleteMany({});
    await PushPreference.deleteMany({});
    await DeploymentSecret.deleteMany({});
    await Call.deleteMany({});
    await CallSignal.deleteMany({});
    resetPushConfig();
    await mongoose.connection.collection('users').deleteMany({});
    (groups.getMyGroups as Mock).mockResolvedValue([]);
    (groups.checkMembership as Mock).mockResolvedValue({ member: false, role: null });
  });
}

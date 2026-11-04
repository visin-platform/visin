import './mocks';
import { initializeAssistantProfileIndexes } from '../../services/assistantProfiles';
import { createServer, type Server } from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { type Mock } from 'vitest';
import { createApp } from '../../app';
import { Assistant } from '../../models/Assistant';
import { AssistantRun } from '../../models/AssistantRun';
import { Block } from '../../models/Block';
import { Budget } from '../../models/Budget';
import { Conversation } from '../../models/Conversation';
import { ConversationAssistant } from '../../models/ConversationAssistant';
import { Message } from '../../models/Message';
import { Pricing } from '../../models/Pricing';
import { ProviderKey } from '../../models/ProviderKey';
import { Settings } from '../../models/Settings';
import { groups } from '../../services/access';
import { resetAssistantSettingsCache } from '../../services/settings';

export let base: string;
let mongo: MongoMemoryServer, server: Server, currentApp: ReturnType<typeof createApp>;

export async function request<T = Record<string, unknown>>(path: string, user = 'alice', body?: unknown) {
  const response = await fetch(`${base}/api/chat${path}`, {
    method: body === undefined ? 'GET' : 'POST',
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
    // What the analyst needs from the server, besides the key and model a test sets when it enables it.
    process.env.API_KEY_ENCRYPTION_SECRET = 'chat-test-encryption-secret';
    process.env.MCP_INTERNAL_URL = 'http://mcp.invalid/mcp';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await initializeAssistantProfileIndexes();
    await Promise.all(
      [
        Conversation,
        Message,
        Assistant,
        AssistantRun,
        ConversationAssistant,
        Budget,
        Block,
        Settings,
        ProviderKey,
        Pricing
      ].map((model) => model.init())
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
    process.env.MCP_INTERNAL_URL = 'http://mcp.invalid/mcp';
    currentApp = createApp();
    await ConversationAssistant.deleteMany({});
    await Assistant.deleteMany({});
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    await AssistantRun.deleteMany({});
    await Budget.deleteMany({});
    await Block.deleteMany({});
    await Settings.deleteMany({});
    await ProviderKey.deleteMany({});
    await Pricing.deleteMany({});
    await mongoose.connection.collection('users').deleteMany({});
    resetAssistantSettingsCache();
    (groups.getMyGroups as Mock).mockResolvedValue([]);
    (groups.checkMembership as Mock).mockResolvedValue({ member: false, role: null });
  });
}

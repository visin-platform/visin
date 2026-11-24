import './mocks';
import { createServer, type Server } from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { Assistant } from '../../models/Assistant';
import { AssistantLock } from '../../models/AssistantLock';
import { AssistantRun } from '../../models/AssistantRun';
import { Budget } from '../../models/Budget';
import { ConversationAssistant } from '../../models/ConversationAssistant';
import { Pricing } from '../../models/Pricing';
import { ProviderKey } from '../../models/ProviderKey';
import { ScreenCall } from '../../models/ScreenCall';
import { Settings } from '../../models/Settings';
import { initializeAssistantProfileIndexes } from '../../services/assistantProfiles';
import { resetAssistantSettingsCache } from '../../services/settings';
import { groups } from '../../services/access';
import { type Mock } from 'vitest';
import { chatRequest, Conversation, createChatIndexes, Message, startFakeChat } from './fakeChat';

export let base: string;
let mongo: MongoMemoryServer, server: Server, currentApp: ReturnType<typeof createApp>;
let chat: Awaited<ReturnType<typeof startFakeChat>>;

/**
 * A request as a person's page makes it. The assistant service's own routes are answered by the app; the few chat routes
 * a test sets its scene with (a conversation, a question, a membership) are answered by the fake chat.
 */
// oxlint-disable-next-line typescript/no-explicit-any -- response shapes vary per route; each assertion names what it reads
export async function request<T = Record<string, any>>(path: string, user = 'alice', body?: unknown, method?: string) {
  const verb = method ?? (body === undefined ? 'GET' : 'POST');
  const fromChat = await chatRequest(path, user, body, verb);
  if (fromChat) return fromChat as { status: number; body: { data: T; message?: string } };
  const response = await fetch(`${base}/api/assistant${path}`, {
    method: verb,
    headers: { 'x-test-user': user, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  // A path neither this service nor the fake chat answers is a test reaching for something of chat's it does not have.
  if (!response.headers.get('content-type')?.includes('json')) throw new Error(`Nothing answers ${verb} ${path}`);
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

/** Each suite owns an isolated database, HTTP app and per-app rate limits. */
export function setupAssistantTests() {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'assistant-test-secret';
    process.env.VISION_SERVICE_URL = 'http://vision.invalid';
    process.env.GROUP_SERVICE_URL = 'http://groups.invalid';
    process.env.INTERNAL_SERVICE_TOKEN = 'test';
    // What the analyst needs from the server, besides the key and model a test sets when it enables it.
    process.env.API_KEY_ENCRYPTION_SECRET = 'assistant-test-encryption-secret';
    process.env.MCP_INTERNAL_URL = 'http://mcp.invalid/mcp';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await initializeAssistantProfileIndexes();
    await Promise.all(
      [Assistant, AssistantRun, AssistantLock, ConversationAssistant, Budget, Settings, ProviderKey, Pricing, ScreenCall].map(
        (model) => model.init()
      )
    );
    currentApp = createApp();
    server = createServer((req, res) => currentApp(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    await createChatIndexes();
    chat = await startFakeChat();
    process.env.CHAT_INTERNAL_URL = chat.url;
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 30000);
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await chat?.close();
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });
  beforeEach(async () => {
    process.env.API_KEY_ENCRYPTION_SECRET = 'assistant-test-encryption-secret';
    process.env.MCP_INTERNAL_URL = 'http://mcp.invalid/mcp';
    currentApp = createApp();
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    await ConversationAssistant.deleteMany({});
    await Assistant.deleteMany({});
    await AssistantRun.deleteMany({});
    await AssistantLock.deleteMany({});
    await Budget.deleteMany({});
    await Settings.deleteMany({});
    await ProviderKey.deleteMany({});
    await Pricing.deleteMany({});
    await ScreenCall.deleteMany({});
    await mongoose.connection.collection('users').deleteMany({});
    resetAssistantSettingsCache();
    (groups.getMyGroups as Mock).mockResolvedValue([]);
    (groups.checkMembership as Mock).mockResolvedValue({ member: false, role: null });
  });
}

/** The name the ported suites use for it. */
export const setupChatTests = setupAssistantTests;

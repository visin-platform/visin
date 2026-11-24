import '../helpers/mocks';
import { createServer, type Server } from 'node:http';
import { AssistantRun } from '../../models/AssistantRun';
import { startWorker } from '../../services/worker';
import { enableAnalyst } from '../helpers/analystFixtures';
import { chatConversations, chatMessages, seedAssistantChat } from '../helpers/chatData';
import { setupAssistantTests } from '../helpers/testServer';
setupAssistantTests();

/** A chat that refuses one answer for good, cannot take another while it is `away`, and takes the rest. */
async function choosyChat(refusedId: string, laterId: string) {
  const published: string[] = [];
  const state = { away: true };
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const body = raw ? (JSON.parse(raw) as { clientId?: string }) : {};
      const answer = (status: number, data: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(status < 300 ? { success: true, data } : { success: false, message: 'refused' }));
      };
      if (!req.url?.endsWith('/messages')) return answer(200, {});
      if (body.clientId === `assistant:${refusedId}`) return answer(400, undefined);
      if (state.away && body.clientId === `assistant:${laterId}`) return answer(503, undefined);
      published.push(body.clientId ?? '');
      answer(200, { id: 'published' });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { url, published, state, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

it('lets go of an answer chat refuses for good, and stops for this look when chat is away', async () => {
  await enableAnalyst();
  const thread = await seedAssistantChat('alice');
  const conversationId = String(thread._id);
  let seq = 0;
  const finished = async (name: string) => {
    const question = await chatMessages.create({ conversationId, senderId: 'alice', senderName: 'Alice', kind: 'person', body: 'Q', clientId: `q-${name}`, seq: ++seq });
    return AssistantRun.create({
      conversationId,
      messageId: String(question._id),
      userId: 'alice',
      email: 'alice@example.test',
      name: 'Alice',
      state: 'completed',
      result: 'The answer.',
      published: false,
      membershipVersion: thread.membershipVersion
    });
  };
  const refused = await finished('refused');
  const later = await finished('later');
  const fine = await finished('fine');
  const chat = await choosyChat(refused.messageId, later.messageId);
  const previous = process.env.CHAT_INTERNAL_URL;
  process.env.CHAT_INTERNAL_URL = chat.url;
  const worker = startWorker();
  try {
    await worker.tick();
    // Refused for good: let go. Chat away: kept, and the answers after it are not each made to wait out the timeout.
    expect((await AssistantRun.findById(refused.id))?.published).toBe(true);
    expect((await AssistantRun.findById(later.id))?.published).toBe(false);
    expect((await AssistantRun.findById(fine.id))?.published).toBe(false);
    // Chat is back: the next look publishes both, in order.
    chat.state.away = false;
    await worker.tick();
  } finally {
    worker();
    process.env.CHAT_INTERNAL_URL = previous;
    await chat.close();
  }
  expect(chat.published).toEqual([`assistant:${later.messageId}`, `assistant:${fine.messageId}`]);
  expect((await AssistantRun.findById(later.id))?.published).toBe(true);
  expect((await AssistantRun.findById(fine.id))?.published).toBe(true);
});

it('closes a question whose chat was deleted, so it never holds up the questions queued after it', async () => {
  await enableAnalyst();
  const thread = await seedAssistantChat('alice');
  await chatConversations.updateOne({ _id: thread._id }, { $set: { deletedAt: new Date() } });
  const run = await AssistantRun.create({
    conversationId: String(thread._id),
    messageId: '000000000000000000000abc',
    userId: 'alice',
    email: 'alice@example.test',
    name: 'Alice',
    state: 'queued'
  });
  const worker = startWorker();
  await worker.tick();
  worker();
  expect((await AssistantRun.findById(run.id))?.state).toBe('cancelled');
});

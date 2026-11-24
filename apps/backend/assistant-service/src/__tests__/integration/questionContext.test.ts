import '../helpers/mocks';
import { type Mock } from 'vitest';
import { analyze } from '../../services/analyst';
import { startWorker } from '../../services/worker';
import { Message } from '../helpers/fakeChat';
import { enableAnalyst } from '../helpers/analystFixtures';
import { create, request, setupAssistantTests } from '../helpers/testServer';

setupAssistantTests();

const vivi = async (user = 'alice') =>
  String((await request('/conversations', user, { kind: 'assistant', title: 'Vivi' })).body.data._id);
const ask = (id: string, body: string, clientId: string, user = 'alice', extra: object = {}) =>
  request(`/conversations/${id}/messages`, user, { body, clientId, ...extra });

// What a question is about, from the person's page to the analyst: chat checks and keeps it, the worker reads it.
describe('what a question is about', () => {
  it('goes to the analyst with the question it belongs to, not with the chat', async () => {
    await enableAnalyst('test');
    const id = await vivi();
    const project = '111111111111111111111111';
    await ask(id, 'How is IseAuto?', 'about-first-0001', 'alice', { context: { projectId: project, projectName: 'IseAuto', trainingIds: [], trainingLabels: [] } });
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((analyze as Mock).mock.calls.at(-1)![0]).toMatchObject({ projectId: project });

    // The next question is a general one, from another page: the project does not follow it.
    await ask(id, 'What is IoU?', 'about-second-001');
    await worker.tick();
    const general = (analyze as Mock).mock.calls.at(-1)![0];
    expect(general.projectId).toBeUndefined();
    expect(general.paperId).toBeUndefined();
    // The earlier question keeps the project it was about, so its answer is not taken for this one's.
    const first = JSON.parse(general.history[0].content);
    expect(first).toMatchObject({ question: 'How is IseAuto?', about: { project: 'IseAuto' } });
    expect(general.history.at(-1).content).toBe('What is IoU?');
  });

  it('forgets the questions before a new topic, and keeps them in the chat', async () => {
    await enableAnalyst('test');
    const id = await vivi();
    await ask(id, 'Before the topic', 'topic-before-0001');
    const worker = startWorker();
    worker();
    await worker.tick();
    const marker = await request(`/conversations/${id}/topic`, 'alice', {});
    expect(marker.status).toBe(201);
    expect(marker.body.data).toMatchObject({ kind: 'system', body: expect.stringContaining('New topic') });
    // Again straight away is the same topic, not a second line.
    const again = await request(`/conversations/${id}/topic`, 'alice', {});
    expect(again.body.data._id).toBe(marker.body.data._id);
    expect(await Message.countDocuments({ conversationId: id, kind: 'system' })).toBe(1);
    await ask(id, 'After the topic', 'topic-after-00001');
    await worker.tick();
    const input = (analyze as Mock).mock.calls.at(-1)![0];
    expect(input.history.map((turn: { content: string }) => turn.content)).toEqual(['After the topic']);
    const messages = (await request<{ body: string }[]>(`/conversations/${id}/messages`)).body.data;
    expect(messages.map((m) => m.body)).toContain('Before the topic');
    // Only a chat with an assistant has topics.
    expect((await request(`/conversations/${await create('direct', ['bob'])}/topic`, 'alice', {})).status).toBe(400);
  });
});

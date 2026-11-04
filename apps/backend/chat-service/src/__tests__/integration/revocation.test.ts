import '../helpers/mocks';
import mongoose from 'mongoose';
import { Conversation } from '../../models/Conversation';
import { groups } from '../../services/access';
import { type Mock } from 'vitest';
import { Assistant } from '../../models/Assistant';
import { AssistantRun } from '../../models/AssistantRun';
import { Message } from '../../models/Message';
import { Settings } from '../../models/Settings';
import { analyze } from '../../services/analyst';
import { resetAssistantSettingsCache } from '../../services/settings';
import { startWorker } from '../../services/worker';
import { enableAnalyst } from '../helpers/analystFixtures';
import { create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

type Context = { conversationId: string; assistantId: string };
const changes: { name: string; kind: 'room' | 'direct'; revoke: (context: Context) => Promise<unknown> }[] = [
  {
    name: 'room invitation acceptance',
    kind: 'room',
    revoke: async ({ conversationId }) => {
      expect(
        (await request(`/conversations/${conversationId}/participants`, 'alice', { handle: 'charlie' })).status
      ).toBe(200);
      expect(
        (await request(`/conversations/${conversationId}/membership`, 'charlie', { action: 'accept' })).status
      ).toBe(200);
    }
  },
  {
    name: 'room participant removal',
    kind: 'room',
    revoke: async ({ conversationId }) => {
      expect(
        (await request(`/conversations/${conversationId}/remove-participant`, 'alice', { userId: 'bob' })).status
      ).toBe(200);
    }
  },
  {
    name: 'room participant leaving',
    kind: 'room',
    revoke: async ({ conversationId }) => {
      expect((await request(`/conversations/${conversationId}/membership`, 'bob', { action: 'leave' })).status).toBe(
        200
      );
    }
  },
  {
    name: 'direct conversation blocking',
    kind: 'direct',
    revoke: async ({ conversationId }) => {
      expect((await request(`/conversations/${conversationId}/membership`, 'alice', { action: 'block' })).status).toBe(
        200
      );
    }
  },
  {
    name: 'assistant pause',
    kind: 'direct',
    revoke: async ({ assistantId }) => {
      expect((await request(`/assistants/${assistantId}`, 'alice', { name: 'Reviewer', paused: true })).status).toBe(
        200
      );
    }
  },
  {
    name: 'assistant detachment',
    kind: 'direct',
    revoke: async ({ conversationId, assistantId }) => {
      expect(
        (await request(`/conversations/${conversationId}/assistants`, 'alice', { action: 'remove', assistantId }))
          .status
      ).toBe(200);
    }
  },
  {
    name: 'platform disablement',
    kind: 'direct',
    revoke: async () => {
      await Settings.updateOne({ _id: 'assistant' }, { $set: { enabled: false } });
      resetAssistantSettingsCache();
    }
  }
];

for (const change of changes) {
  describe(change.name, () => {
    for (const stage of ['queued', 'generating', 'unpublished'] as const) {
      it(`withholds a ${stage} answer`, async () => {
        await enableAnalyst();
        const assistant = await Assistant.create({ createdBy: 'alice', name: 'Reviewer' });
        // Invite and accept during the run: outstanding invitations keep shared assistants disabled.
        const conversationId = await create(change.kind, ['bob']);
        expect((await request(`/conversations/${conversationId}/membership`, 'bob', { action: 'accept' })).status).toBe(
          200
        );
        expect(
          (
            await request(`/conversations/${conversationId}/assistants`, 'alice', {
              action: 'add',
              assistantId: assistant.id
            })
          ).status
        ).toBe(200);
        for (const user of ['alice', 'bob'])
          expect(
            (await request(`/conversations/${conversationId}/assistants`, user, { action: 'consent', enabled: true }))
              .status
          ).toBe(200);
        expect(
          (
            await request(`/conversations/${conversationId}/messages`, 'bob', {
              body: 'Explain the discussion',
              clientId: 'revocation-question',
              assistantId: assistant.id
            })
          ).status
        ).toBe(201);
        const context = { conversationId, assistantId: assistant.id };
        const calls = (analyze as Mock).mock.calls.length;
        if (stage === 'generating') {
          // Return a result even after revocation, exercising the worker's final guard independently
          // of provider abort support or the model loop calling its own guard.
          (analyze as Mock).mockImplementationOnce(async () => {
            await change.revoke(context);
            return { text: 'Must stay private', evidence: [], inputTokens: 1, outputTokens: 1 };
          });
        }
        const worker = startWorker();
        worker();
        if (stage === 'queued') await change.revoke(context);
        await worker.tick();
        if (stage === 'unpublished') {
          expect((await AssistantRun.findOne({ conversationId }))?.state).toBe('completed');
          expect(await Message.countDocuments({ conversationId, kind: 'assistant' })).toBe(0);
          await change.revoke(context);
        }
        await worker.tick();
        await worker.tick();
        expect(await Message.countDocuments({ conversationId, kind: 'assistant' })).toBe(0);
        expect((analyze as Mock).mock.calls.length - calls).toBe(stage === 'queued' ? 0 : 1);
        if (change.name !== 'platform disablement' || stage !== 'queued')
          expect(await AssistantRun.countDocuments({ conversationId, state: { $in: ['queued', 'running'] } })).toBe(0);
      });
    }
  });
}

for (const stage of ['queued', 'generating', 'unpublished'] as const) {
  it(`withholds a ${stage} group answer after live membership loss`, async () => {
    await enableAnalyst();
    (groups.checkMembership as Mock).mockResolvedValue({ member: true, role: 'admin' });
    const assistant = await Assistant.create({ createdBy: 'alice', name: 'Reviewer' });
    const conversation = await Conversation.create({
      kind: 'group',
      title: 'Group discussion',
      groupId: new mongoose.Types.ObjectId().toString(),
      createdBy: 'alice',
      participants: []
    });
    expect(
      (
        await request(`/conversations/${conversation.id}/assistants`, 'alice', {
          action: 'add',
          assistantId: assistant.id
        })
      ).status
    ).toBe(200);
    expect(
      (await request(`/conversations/${conversation.id}/assistants`, 'alice', { action: 'switch', enabled: true }))
        .status
    ).toBe(200);
    expect(
      (
        await request(`/conversations/${conversation.id}/messages`, 'alice', {
          body: 'Explain',
          clientId: 'group-revocation-001',
          assistantId: assistant.id
        })
      ).status
    ).toBe(201);
    const revoke = () => (groups.checkMembership as Mock).mockResolvedValue({ member: false, role: null });
    const calls = (analyze as Mock).mock.calls.length;
    if (stage === 'queued') revoke();
    if (stage === 'generating')
      (analyze as Mock).mockImplementationOnce(async () => {
        revoke();
        return { text: 'Must stay private', evidence: [], inputTokens: 1, outputTokens: 1 };
      });
    const worker = startWorker();
    worker();
    await worker.tick();
    if (stage === 'unpublished') {
      expect((await AssistantRun.findOne({ conversationId: conversation.id }))?.state).toBe('completed');
      revoke();
    }
    await worker.tick();
    expect(await Message.countDocuments({ conversationId: conversation.id, kind: 'assistant' })).toBe(0);
    expect((analyze as Mock).mock.calls.length - calls).toBe(stage === 'queued' ? 0 : 1);
    expect((await request(`/conversations/${conversation.id}/messages`)).status).toBe(404);
  });
}

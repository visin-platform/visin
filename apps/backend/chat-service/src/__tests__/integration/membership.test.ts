import '../helpers/mocks';
import { vi } from 'vitest';
import { Block } from '../../models/Block';
import { Conversation } from '../../models/Conversation';
import { publicPerson } from '../../services/access';
import { create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

const member = async (id: string, user: string) => (await Conversation.findById(id))?.participants.find((p) => p.userId === user);

describe('who is in a room', () => {
  it('lets only its administrators invite, and never a bot or a person who is blocked or already there', async () => {
    const id = await create('room', ['bob']);
    await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
    expect((await request(`/conversations/${id}/participants`, 'bob', { handle: 'carol' })).status).toBe(403);
    vi.mocked(publicPerson).mockResolvedValueOnce({ id: 'bot-user', name: 'Helper', handle: 'helper', kind: 'assistant', assistantId: 'a' });
    expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'helper' })).status).toBe(400);
    expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'bob' })).status).toBe(400);
    await Block.create({ userId: 'carol', blockedId: 'alice' });
    expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'carol' })).status).toBe(403);
    await Block.deleteMany({});
    expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'carol' })).status).toBe(200);
    // Inviting someone already invited changes nothing.
    expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'carol' })).status).toBe(200);
    expect((await Conversation.findById(id))?.participants.filter((p) => p.userId === 'carol')).toHaveLength(1);
  });

  it('stops at twenty people', async () => {
    const id = await create('room', Array.from({ length: 18 }, (_, i) => `person${i}`));
    expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'nineteenth' })).status).toBe(200);
    expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'twentieth' })).status).toBe(400);
  });

  it('lets only its owner remove someone else, who may be invited again', async () => {
    const id = await create('room', ['bob', 'carol']);
    await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
    expect((await request(`/conversations/${id}/remove-participant`, 'bob', { userId: 'carol' })).status).toBe(403);
    expect((await request(`/conversations/${id}/remove-participant`, 'alice', { userId: 'alice' })).status).toBe(400);
    expect((await request(`/conversations/${id}/remove-participant`, 'alice', { userId: 'nobody' })).status).toBe(400);
    expect((await request(`/conversations/${id}/remove-participant`, 'alice', { userId: 'bob' })).status).toBe(200);
    expect((await member(id, 'bob'))?.state).toBe('left');
    expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'bob' })).status).toBe(200);
    expect((await member(id, 'bob'))?.state).toBe('invited');
  });
});

describe('answering an invitation, leaving and blocking', () => {
  it('accepts an invitation once, and says when there is none', async () => {
    const id = await create('room', ['bob']);
    expect((await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' })).status).toBe(200);
    // Accepting again is the same acceptance.
    expect((await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' })).status).toBe(200);
    await request(`/conversations/${id}/membership`, 'bob', { action: 'leave' });
    expect((await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' })).status).toBe(404);
  });

  it('hands a room to someone who stays when its owner leaves', async () => {
    const id = await create('room', ['bob']);
    await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
    expect((await request(`/conversations/${id}/membership`, 'alice', { action: 'leave' })).status).toBe(200);
    expect((await member(id, 'bob'))?.role).toBe('owner');
  });

  it('blocks the other person in a direct chat, and only there', async () => {
    const id = await create('direct', ['bob']);
    await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
    expect((await request(`/conversations/${id}/membership`, 'bob', { action: 'block' })).status).toBe(200);
    expect(await Block.countDocuments({ userId: 'bob', blockedId: 'alice' })).toBe(1);
    const room = await create('room', ['carol']);
    expect((await request(`/conversations/${room}/membership`, 'alice', { action: 'block' })).status).toBe(400);
  });
});

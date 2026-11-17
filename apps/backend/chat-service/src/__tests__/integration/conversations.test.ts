import '../helpers/mocks';
import { vi, type Mock } from 'vitest';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { groups, historyFilter, peer, publicPerson } from '../../services/access';
import { enableAnalyst } from '../helpers/analystFixtures';
import { create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

it('requires authentication and validates identifiers', async () => {
  expect((await request('/conversations', '')).status).toBe(401);
  expect((await request('/conversations/nope/messages')).status).toBe(400);
});

it('deduplicates a direct conversation across both participants', async () => {
  const id = await create();
  const other = await request('/conversations', 'bob', { kind: 'direct', title: 'Same pair', handles: ['alice'] });
  expect(other.status).toBe(201);
  expect(other.body.data._id).toBe(id);
  expect(await Conversation.countDocuments()).toBe(1);
});

it('allows one message request, then requires acceptance', async () => {
  const id = await create();
  expect(
    (await request(`/conversations/${id}/messages`, 'alice', { body: 'Hello', clientId: 'request-001' })).status
  ).toBe(201);
  expect(
    (await request(`/conversations/${id}/messages`, 'alice', { body: 'Again', clientId: 'request-002' })).status
  ).toBe(403);
  expect((await request(`/conversations/${id}/messages`, 'bob', { body: 'Hi', clientId: 'request-003' })).status).toBe(
    403
  );
  expect((await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' })).status).toBe(200);
  expect((await request(`/conversations/${id}/messages`, 'bob', { body: 'Hi', clientId: 'request-003' })).status).toBe(
    201
  );
});

it('does not let outsiders read a conversation or its messages', async () => {
  const id = await create();
  expect((await request(`/conversations/${id}`, 'eve')).status).toBe(404);
  expect((await request(`/conversations/${id}/messages`, 'eve')).status).toBe(404);
  expect((await request(`/conversations/${id}/runs`, 'eve')).status).toBe(404);
});

it('withholds room history before acceptance, including paginated queries', async () => {
  const id = await create('room');
  await request(`/conversations/${id}/messages`, 'alice', { body: 'Older private discussion', clientId: 'old-000001' });
  expect((await request(`/conversations/${id}/messages`, 'bob')).body.data).toEqual([]);
  const before = await request('/conversations', 'bob');
  expect(
    (before.body.data as unknown as { _id: string; latestMessage?: { body: string } }[]).find((c) => c._id === id)
      ?.latestMessage
  ).toBeUndefined();
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  await request(`/conversations/${id}/messages`, 'alice', { body: 'New discussion', clientId: 'new-000001' });
  const after = await request('/conversations', 'bob');
  expect(
    (after.body.data as unknown as { _id: string; latestMessage?: { body: string } }[]).find((c) => c._id === id)
      ?.latestMessage?.body
  ).toBe('New discussion');
  const result = await request(`/conversations/${id}/messages?before=999`, 'bob');
  expect((result.body.data as unknown as { body: string }[]).map((m) => m.body)).toEqual([
    'bob joined the conversation.',
    'New discussion'
  ]);
});

it('prevents invitation state changes by an uninvited account', async () => {
  const id = await create('room');
  expect((await request(`/conversations/${id}/membership`, 'eve', { action: 'accept' })).status).toBe(404);
  expect((await request(`/conversations/${id}/participants`, 'bob', { handle: 'eve' })).status).toBe(403);
});

it('lets room owners invite and remove participants without granting project access', async () => {
  const id = await create('room');
  expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'eve' })).status).toBe(200);
  expect((await request(`/conversations/${id}/membership`, 'eve', { action: 'accept' })).status).toBe(200);
  expect((await request(`/conversations/${id}/remove-participant`, 'alice', { userId: 'eve' })).status).toBe(200);
  expect((await request(`/conversations/${id}/messages`, 'eve')).status).toBe(404);
  expect((await Conversation.findById(id))?.projectId).toBeUndefined();
});

it('opens one private chat per person and assistant, however often it is asked for', async () => {
  const first = await request('/conversations', 'alice', { kind: 'assistant', title: 'Vivi' });
  const again = await request('/conversations', 'alice', { kind: 'assistant', title: 'Vivi, again' });
  expect(first.status).toBe(201);
  expect(again.body.data._id).toBe(first.body.data._id);
  expect(await Conversation.countDocuments({ kind: 'assistant' })).toBe(1);
  // Someone else has their own.
  const other = await request('/conversations', 'bob', { kind: 'assistant', title: 'Vivi' });
  expect(other.body.data._id).not.toBe(first.body.data._id);
});

it('does not take what a question is about when the chat is opened', async () => {
  for (const context of [{ projectId: '111111111111111111111111' }, { paperId: '222222222222222222222222' }]) {
    const created = await request('/conversations', 'alice', { kind: 'assistant', title: 'Analysis', ...context });
    expect(created.status).toBe(400);
  }
  expect(await Conversation.countDocuments()).toBe(0);
});

it('checks what a question is about as the asker, and keeps it with the question', async () => {
  await enableAnalyst('test');
  const { NotFoundError } = await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core');
  const chat = String((await request('/conversations', 'alice', { kind: 'assistant', title: 'Vivi' })).body.data._id);
  vi.mocked(peer).mockResolvedValueOnce({ _id: '111111111111111111111111', name: 'IseAuto', owner: { kind: 'user', id: 'alice' } });
  const asked = await request(`/conversations/${chat}/messages`, 'alice', {
    body: 'How is it going?',
    clientId: 'about-project-1',
    context: { projectId: '111111111111111111111111' }
  });
  expect(asked.status).toBe(201);
  expect(vi.mocked(peer).mock.calls.at(-1)?.[1]).toBe('/api/projects/111111111111111111111111');
  expect((await Message.findById(asked.body.data._id))?.context).toMatchObject({
    projectId: '111111111111111111111111',
    projectName: 'IseAuto'
  });
  // A project they cannot read refuses the question, and nothing is stored.
  vi.mocked(peer).mockRejectedValueOnce(new NotFoundError('Resource unavailable'));
  const hidden = await request(`/conversations/${chat}/messages`, 'alice', {
    body: 'And this one?',
    clientId: 'about-project-2',
    context: { projectId: '333333333333333333333333' }
  });
  expect(hidden.status).toBe(404);
  expect(await Message.countDocuments({ conversationId: chat })).toBe(1);
  // A paper on its own is fine, a paper with a project is not.
  const mixed = await request(`/conversations/${chat}/messages`, 'alice', {
    body: 'Both?',
    clientId: 'about-both-001',
    context: { projectId: '111111111111111111111111', paperId: '222222222222222222222222' }
  });
  expect(mixed.status).toBe(400);
});

it('only a question to an assistant is about something', async () => {
  const id = await create('direct', ['bob']);
  const sent = await request(`/conversations/${id}/messages`, 'alice', {
    body: 'Hi',
    clientId: 'about-direct-01',
    context: { projectId: '111111111111111111111111' }
  });
  expect(sent.status).toBe(400);
});

it('withholds all room messages for an invitation without a history boundary', () => {
  expect(historyFilter({ kind: 'room', participants: [{ userId: 'bob', state: 'invited' }] } as never, 'bob')).toEqual({
    seq: -1
  });
});

it('revokes group-channel access as soon as current membership is removed', async () => {
  (groups.checkMembership as Mock).mockResolvedValue({ member: true, role: 'admin' });
  const created = await request('/conversations', 'alice', {
    kind: 'group',
    title: 'Lab channel',
    groupId: '111111111111111111111111'
  });
  expect(created.status).toBe(201);
  expect((await request(`/conversations/${created.body.data._id}/messages`)).status).toBe(200);
  (groups.checkMembership as Mock).mockResolvedValue({ member: false, role: null });
  expect((await request(`/conversations/${created.body.data._id}/messages`)).status).toBe(404);
});

it('lets whoever declined a direct conversation start it again, but not the person they declined', async () => {
  const id = await create();
  await request(`/conversations/${id}/messages`, 'alice', { body: 'Hello', clientId: 'reopen-0001' });
  expect((await request(`/conversations/${id}/membership`, 'bob', { action: 'decline' })).status).toBe(200);
  expect((await request('/conversations', 'alice', { kind: 'direct', title: 'Again', handles: ['bob'] })).status).toBe(
    403
  );
  const reopened = await request('/conversations', 'bob', { kind: 'direct', title: 'Reply', handles: ['alice'] });
  expect(reopened.status).toBe(201);
  expect(reopened.body.data._id).toBe(id);
  expect(
    (await request(`/conversations/${id}/messages`, 'bob', { body: 'Sorry, yes', clientId: 'reopen-0002' })).status
  ).toBe(201);
});

it('re-invites a removed room participant without counting departed people against the limit', async () => {
  const id = await create('room');
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  await request(`/conversations/${id}/remove-participant`, 'alice', { userId: 'bob' });
  expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'bob' })).status).toBe(200);
  const room = await Conversation.findById(id);
  expect(room?.participants.filter((p) => p.userId === 'bob').map((p) => p.state)).toEqual(['invited']);
  expect((await request(`/conversations/${id}/participants`, 'alice', { handle: 'bob' })).status).toBe(200);
});

it('lists group channels from the groups already fetched, without a membership call per row', async () => {
  (groups.checkMembership as Mock).mockResolvedValue({ member: true, role: 'admin' });
  const group = '111111111111111111111111';
  for (const title of ['One', 'Two', 'Three'])
    expect((await request('/conversations', 'alice', { kind: 'group', title, groupId: group })).status).toBe(201);
  (groups.checkMembership as Mock).mockClear();
  (groups.getMyGroups as Mock).mockResolvedValue([{ groupId: group, role: 'member', name: 'Lab' }]);
  expect((await request('/conversations', 'bob')).body.data).toHaveLength(3);
  expect(groups.checkMembership).not.toHaveBeenCalled();
  (groups.getMyGroups as Mock).mockResolvedValue([]);
  expect((await request('/conversations', 'bob')).body.data).toHaveLength(0);
});

it("opens a group's channel for any member, once, and refuses people outside the group", async () => {
  const group = '333333333333333333333333';
  (groups.getMyGroups as Mock).mockResolvedValue([{ groupId: group, role: 'member', name: 'Lab' }]);
  const first = await request(`/groups/${group}/channel`, 'alice', {});
  expect(first.status).toBe(200);
  expect(first.body.data.title).toBe('Lab');
  const again = await request(`/groups/${group}/channel`, 'bob', {});
  expect(again.body.data._id).toBe(first.body.data._id);
  expect(await Conversation.countDocuments({ groupId: group })).toBe(1);
  (groups.getMyGroups as Mock).mockResolvedValue([]);
  expect((await request(`/groups/${group}/channel`, 'eve', {})).status).toBe(404);
  expect((await request('/groups/not-an-id/channel', 'alice', {})).status).toBe(400);
});

it('looks up a direct recipient once when distinguishing people from bots', async () => {
  const calls = (publicPerson as Mock).mock.calls.length;
  await create('direct', ['bob']);
  expect((publicPerson as Mock).mock.calls.length - calls).toBe(1);
});

it('refuses a paper in a shared chat', async () => {
  const shared = await request('/conversations', 'alice', {
    kind: 'room',
    title: 'x',
    handles: ['bob'],
    paperId: '222222222222222222222222'
  });
  expect(shared.status).toBe(400);
  expect(await Conversation.countDocuments()).toBe(0);
});

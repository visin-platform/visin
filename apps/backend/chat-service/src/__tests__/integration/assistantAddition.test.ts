import '../helpers/mocks';
import { vi } from 'vitest';
import { Assistant } from '../../models/Assistant';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { groups } from '../../services/access';
import { create, request, setupChatTests } from '../helpers/testServer';
setupChatTests();
const update = (id: string, user: string, body: unknown) => request(`/conversations/${id}/assistants`, user, body);

it('preserves defaults and lets room administrators delegate additions without delegating management', async () => {
  const id = await create('room');
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  const assistant = await Assistant.create({ createdBy: 'bob', name: 'Bob helper' });
  const add = { action: 'add', assistantId: assistant.id };
  expect((await update(id, 'bob', add)).status).toBe(403);
  expect((await update(id, 'bob', { action: 'addition-policy', whoCanAdd: 'everyone' })).status).toBe(403);
  const changed = await update(id, 'alice', { action: 'addition-policy', whoCanAdd: 'everyone' });
  expect(changed.status).toBe(200);
  expect((await request(`/conversations/${id}/assistants`, 'bob')).body.data).toMatchObject({
    canAdd: true,
    canManage: false,
    whoCanAdd: 'everyone'
  });
  expect((await update(id, 'bob', add)).status).toBe(200);
  expect((await update(id, 'bob', { action: 'remove', assistantId: assistant.id })).status).toBe(403);
  expect((await update(id, 'bob', { action: 'lock', enabled: true })).status).toBe(403);
  expect((await update(id, 'mallory', add)).status).toBe(404);
  expect(await Message.exists({ conversationId: id, kind: 'system', body: /all members/ })).toBeTruthy();
});

it('invalidates agreement on policy changes and enforces lock-off and profile ownership', async () => {
  const id = await create('room');
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  const own = await Assistant.create({ createdBy: 'alice', name: 'Alice helper' });
  await update(id, 'alice', { action: 'add', assistantId: own.id });
  for (const user of ['alice', 'bob']) await update(id, user, { action: 'consent', enabled: true });
  expect((await request(`/conversations/${id}/assistants`, 'alice')).body.data.enabled).toBe(true);
  const before = await Conversation.findById(id);
  await update(id, 'alice', { action: 'addition-policy', whoCanAdd: 'everyone' });
  expect((await request(`/conversations/${id}/assistants`, 'bob')).body.data.enabled).toBe(false);
  expect((await Conversation.findById(id))!.membershipVersion).toBeGreaterThan(before!.membershipVersion);
  expect((await update(id, 'bob', { action: 'add', assistantId: own.id })).status).toBe(404);
  const bob = await Assistant.create({ createdBy: 'bob', name: 'Bob helper' });
  await update(id, 'alice', { action: 'lock', enabled: true });
  expect((await update(id, 'bob', { action: 'add', assistantId: bob.id })).status).toBe(403);
  await update(id, 'alice', { action: 'lock', enabled: false });
  await update(id, 'alice', { action: 'addition-policy', whoCanAdd: 'admins' });
  expect((await update(id, 'bob', { action: 'add', assistantId: bob.id })).status).toBe(403);
});

it('keeps direct chats symmetric and checks live group roles for policy changes', async () => {
  const direct = await create();
  expect((await update(direct, 'alice', { action: 'addition-policy', whoCanAdd: 'admins' })).status).toBe(400);
  const groupId = '111111111111111111111111';
  const c = await Conversation.create({ kind: 'group', title: 'Group', groupId, createdBy: 'alice', participants: [] });
  vi.mocked(groups.checkMembership).mockResolvedValue({ member: true, role: 'admin' });
  expect((await update(c.id, 'alice', { action: 'addition-policy', whoCanAdd: 'everyone' })).status).toBe(200);
  vi.mocked(groups.checkMembership).mockResolvedValue({ member: true, role: 'member' });
  expect((await update(c.id, 'alice', { action: 'addition-policy', whoCanAdd: 'admins' })).status).toBe(403);
  expect((await update(c.id, 'alice', { action: 'addition-policy', whoCanAdd: 'invalid' })).status).toBe(400);
});

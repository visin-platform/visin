import '../helpers/mocks';
import { fetchWithTimeout } from '@visin/backend-core';
import { vi, type Mock } from 'vitest';
import { groups, peer, publicPerson } from '../../services/access';
import * as assistants from '../../services/assistantClient';
import { request, setupChatTests } from '../helpers/testServer';

setupChatTests();

it('discovers only shared-group roster contacts and revalidates them when starting a DM', async () => {
  const target = '222222222222222222222222';
  (groups.getMyGroups as Mock).mockResolvedValue([{ groupId: 'group1', role: 'member', name: 'Lab' }]);
  (fetchWithTimeout as Mock).mockImplementation(async function () {
    return new Response(
      JSON.stringify({
        data: {
          members: [
            { userId: 'alice', email: 'alice@private.invalid' },
            { userId: target, email: 'colleague@private.invalid' }
          ]
        }
      })
    );
  });
  const contacts = await request('/contacts');
  expect(contacts.body.data).toEqual([{ id: target, name: 'colleague@private.invalid' }]);
  expect((await request('/contacts?groupId=group1')).body.data).toEqual(contacts.body.data);
  expect((await request('/contacts?groupId=not-a-member')).status).toBe(404);
  const created = await request('/conversations', 'alice', { kind: 'direct', title: 'Colleague', userIds: [target] });
  expect(created.status).toBe(201);
  expect(JSON.stringify(created.body.data)).not.toContain('colleague@private.invalid');
  (groups.getMyGroups as Mock).mockResolvedValue([]);
  expect(
    (await request('/conversations', 'alice', { kind: 'direct', title: 'Colleague', userIds: [target] })).status
  ).toBe(404);
  (fetchWithTimeout as Mock).mockImplementation(
    (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).fetchWithTimeout
  );
});

it('lists the groups and projects a person can start a conversation about, and a public profile', async () => {
  (groups.getMyGroups as Mock).mockResolvedValue([{ groupId: 'group1', role: 'admin', name: 'Lab' }]);
  expect((await request('/groups')).body.data).toEqual([{ groupId: 'group1', role: 'admin', name: 'Lab' }]);
  vi.mocked(peer).mockResolvedValueOnce({ projects: [{ _id: 'p1', name: 'IseAuto' }] } as never);
  expect((await request('/projects')).body.data).toEqual([{ _id: 'p1', name: 'IseAuto' }]);
  vi.mocked(peer).mockResolvedValueOnce({} as never);
  expect((await request('/projects')).body.data).toEqual([]);
  vi.mocked(publicPerson).mockResolvedValueOnce({ id: 'u1', name: 'Alice', handle: 'alice' });
  expect((await request('/people/alice')).body.data).toEqual({ id: 'u1', name: 'Alice', handle: 'alice' });
});

it("tells a page what chat can do, and adds what the assistants can", async () => {
  expect((await request('/capabilities')).body.data).toMatchObject({
    assistant: false,
    assistantModel: { ready: false },
    canConfigure: false,
    sharedAssistant: true,
    attachments: expect.any(Boolean)
  });
  vi.mocked(assistants.capabilities).mockResolvedValueOnce({
    assistant: true,
    assistantModel: { provider: 'anthropic', model: 'm', ready: true },
    canConfigure: true
  });
  expect((await request('/capabilities')).body.data).toMatchObject({ assistant: true, canConfigure: true, sharedAssistant: true });
});

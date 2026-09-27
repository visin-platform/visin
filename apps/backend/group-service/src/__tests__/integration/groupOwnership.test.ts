jest.mock('../../clients/ownedResourcesClient', () => ({
  ownedByGroup: jest.fn().mockResolvedValue({ projects: { count: 0, names: [] }, datasets: { count: 0, names: [] } }),
}));
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ResourceEvent } from '@visin/backend-core';
import { Group } from '../../models/Group';
import {
  createInvitation,
  acceptInvitation,
  createGroup,
  deleteGroup,
  groupActivity,
  permanentlyDeleteGroup,
  removeMember,
  restoreGroup,
  updateGroup,
  updateMemberActivity,
  updateMemberRole,
} from '../../services/groupService';

async function addMember(id: string, actor: string, userId: string, role: 'owner' | 'admin' | 'member' = 'member') {
  const invitation = await createInvitation(id, actor, role);
  return acceptInvitation(invitation.token, userId);
}

describe('group ownership against in-memory MongoDB', () => {
  let mongo: MongoMemoryServer | undefined;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri(), {
      serverSelectionTimeoutMS: 10_000,
    });
    await Group.init();
  }, 120_000);

  afterEach(async () => {
    jest.restoreAllMocks();
    if (mongoose.connection.readyState === 1) await Group.deleteMany({});
  });

  afterAll(async () => {
    try {
      await mongoose.disconnect();
    } finally {
      await mongo?.stop();
    }
  });

  async function twoOwners(legacy = false) {
    const group = await createGroup('first@example.test', 'Team');
    const id = group._id.toString();
    await addMember(id, 'first@example.test', 'second@example.test', 'owner');
    if (legacy) await Group.collection.updateOne({ _id: group._id }, { $unset: { __v: '' } });
    return id;
  }

  // Both service calls receive snapshots read before either mutation commits.
  // Writes, version predicates, conflict detection, and persisted state are real.
  async function readSameRevision(id: string) {
    const first = await Group.findById(id);
    const second = await Group.findById(id);
    return jest.spyOn(Group, 'findOne').mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  }

  const transitions = [
    ['demote', 'demote'],
    ['demote', 'remove'],
    ['remove', 'remove'],
  ] as const;

  describe.each([false, true])('missing version key: %s', (legacy) => {
    it.each(transitions)('keeps an owner after simultaneous %s / %s', async (first, second) => {
      const id = await twoOwners(legacy);
      const read = await readSameRevision(id);
      const change = (userId: string, action: 'demote' | 'remove') => action === 'demote'
        ? updateMemberRole(id, userId, userId, 'admin')
        : removeMember(id, userId, userId);

      const results = await Promise.allSettled([
        change('first@example.test', first),
        change('second@example.test', second),
      ]);
      read.mockRestore();

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((result) => result.status === 'rejected')).toMatchObject({
        reason: { statusCode: 409 },
      });
      const persisted = await Group.findById(id);
      const owners = persisted!.members.filter((member) => member.role === 'owner');
      expect(owners).toHaveLength(1);
      await expect(removeMember(id, owners[0].userId, owners[0].userId)).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  it('rejects owner creation authorized from a stale membership snapshot', async () => {
    const id = await twoOwners();
    const stale = await Group.findById(id);
    await updateMemberRole(id, 'first@example.test', 'second@example.test', 'admin');
    jest.spyOn(Group, 'findOne').mockReturnValueOnce({ select: () => Promise.resolve(stale) } as unknown as ReturnType<typeof Group.findOne>);

    await expect(createInvitation(id, 'second@example.test', 'owner'))
      .rejects.toMatchObject({ statusCode: 409 });
    jest.restoreAllMocks();
    await expect(addMember(id, 'second@example.test', 'third@example.test', 'owner'))
      .rejects.toMatchObject({ statusCode: 403 });
    expect((await Group.findById(id))!.members).toHaveLength(2);
  });

  it.each(['owner', 'admin', 'member'] as const)('preserves ownership when legacy duplicate userIds start with %s', async (firstRole) => {
    const group = await Group.create({
      name: 'Legacy duplicates',
      createdBy: 'owner@example.test',
      members: [
        { userId: 'owner@example.test', role: firstRole },
        { userId: 'owner@example.test', role: 'owner' },
      ],
    });

    await expect(removeMember(group._id.toString(), 'owner@example.test', 'owner@example.test'))
      .rejects.toMatchObject({ statusCode: 409 });
    expect((await Group.findById(group._id))!.members).toHaveLength(2);
  });

  it('does not hide the only effective owner by demoting its first duplicate entry', async () => {
    const group = await Group.create({
      name: 'Legacy duplicates',
      createdBy: 'owner@example.test',
      members: [
        { userId: 'owner@example.test', role: 'owner' },
        { userId: 'owner@example.test', role: 'owner' },
      ],
    });

    await expect(updateMemberRole(group._id.toString(), 'owner@example.test', 'owner@example.test', 'admin'))
      .rejects.toMatchObject({ statusCode: 409 });
    expect((await Group.findById(group._id))!.members[0].role).toBe('owner');
  });

  it('does not let stale removal resurrect an owner demoted concurrently', async () => {
    const id = await twoOwners();
    await addMember(id, 'first@example.test', 'member@example.test');
    const stale = await Group.findById(id);
    await updateMemberRole(id, 'first@example.test', 'second@example.test', 'admin');
    jest.spyOn(Group, 'findOne').mockResolvedValueOnce(stale);

    await expect(removeMember(id, 'first@example.test', 'member@example.test'))
      .rejects.toMatchObject({ statusCode: 409 });
    jest.restoreAllMocks();
    const persisted = await Group.findById(id);
    expect(persisted!.members.find((member) => member.userId === 'second@example.test')!.role).toBe('admin');
    expect(persisted!.members).toHaveLength(3);
  });

  it('refuses to permanently delete a group restored since authorization', async () => {
    const id = await twoOwners();
    await deleteGroup(id, 'first@example.test');
    const stale = await Group.findById(id);
    await restoreGroup(id, 'first@example.test');
    jest.spyOn(Group, 'findOne').mockResolvedValueOnce(stale);

    await expect(permanentlyDeleteGroup(id, 'first@example.test'))
      .rejects.toMatchObject({ statusCode: 409 });
    jest.restoreAllMocks();
    expect(await Group.findOne({ _id: id, deletedAt: null })).not.toBeNull();
  });

  it('preserves handover, ordinary admin operations, activity, and group lifecycle', async () => {
    const id = await twoOwners();
    await updateMemberRole(id, 'first@example.test', 'first@example.test', 'admin');
    await addMember(id, 'first@example.test', 'member@example.test');
    const snapshot = await Group.findById(id);
    await updateMemberActivity([id], 'member@example.test');
    jest.spyOn(Group, 'findOne').mockResolvedValueOnce(snapshot);
    await updateGroup(id, 'first@example.test', { name: 'Renamed' });
    jest.restoreAllMocks();
    expect((await Group.findById(id))!.members.find((member) => member.userId === 'member@example.test')!.lastActivity)
      .toBeInstanceOf(Date);
    await removeMember(id, 'first@example.test', 'first@example.test');
    await deleteGroup(id, 'second@example.test');
    await restoreGroup(id, 'second@example.test');
    await deleteGroup(id, 'second@example.test');
    await permanentlyDeleteGroup(id, 'second@example.test');
    expect(await Group.findById(id)).toBeNull();
  });

  it("shows its owners and admins what happened to what the group owns, newest first", async () => {
    const group = await createGroup('first@example.test', 'Team');
    const id = group._id.toString();
    await addMember(id, 'first@example.test', 'admin@example.test', 'admin');
    await addMember(id, 'first@example.test', 'member@example.test');
    await Group.updateOne({ _id: group._id, 'members.userId': 'admin@example.test' }, { $set: { 'members.$.email': 'admin@example.test' } });
    await ResourceEvent.create([
      { at: new Date(1000), service: 'vision-service', resourceType: 'project', resourceId: 'p1', resourceName: 'Road', action: 'trash', actorId: 'admin@example.test', groupIds: [id] },
      { at: new Date(2000), service: 'dataset-service', resourceType: 'dataset', resourceId: 'd1', action: 'transfer', actorId: 'gone@example.test', groupIds: [id], from: { kind: 'user', id: 'gone@example.test' }, to: { kind: 'group', id } },
      { at: new Date(3000), service: 'vision-service', resourceType: 'project', resourceId: 'p2', action: 'trash', actorId: 'x', groupIds: ['another'] }
    ]);

    const events = await groupActivity(id, 'admin@example.test');
    expect(events.map((event) => [event.resourceId, event.actorEmail])).toEqual([['d1', undefined], ['p1', 'admin@example.test']]);
    await expect(groupActivity(id, 'member@example.test')).rejects.toMatchObject({ statusCode: 403 });
    await expect(groupActivity(id, 'stranger@example.test')).rejects.toMatchObject({ statusCode: 403 });
    await deleteGroup(id, 'first@example.test');
    await expect(groupActivity(id, 'first@example.test')).rejects.toMatchObject({ statusCode: 404 });
    await ResourceEvent.deleteMany({});
  });
});

import { ConflictError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import { Group, IGroup, GroupRole } from '../models/Group';

export async function updateMemberActivity(groupId: string, memberEmail: string): Promise<void> {
  const normalizedEmail = memberEmail.toLowerCase();
  await Group.updateOne(
    { _id: groupId, 'members.email': normalizedEmail },
    { $set: { 'members.$.lastActivity': new Date() } }
  );
}

export async function createGroup(creatorEmail: string, name: string): Promise<IGroup> {
  const group = await Group.create({
    name: String(name).trim(),
    createdBy: creatorEmail.toLowerCase(),
    members: [{ email: creatorEmail.toLowerCase(), role: 'owner', joinedAt: new Date() }]
  });
  return group;
}

export async function listMyGroups(email: string): Promise<IGroup[]> {
  return Group.find({ 
    'members.email': email.toLowerCase(),
    $or: [
      { deletedAt: null },
      { deletedAt: { $exists: false } }
    ]
  }).sort({ updatedAt: -1 });
}

export async function listMyDeletedGroups(email: string): Promise<IGroup[]> {
  return Group.find({ 
    'members.email': email.toLowerCase(),
    deletedAt: { $exists: true }
  }).sort({ deletedAt: -1 });
}

export async function getGroupIfMember(groupId: string, email: string): Promise<IGroup> {
  const group = await Group.findOne({ 
    _id: groupId,
    $or: [
      { deletedAt: null },
      { deletedAt: { $exists: false } }
    ]
  });
  if (!group) throw new NotFoundError();
  if (!group.members.some((m) => m.email === email.toLowerCase())) throw new ForbiddenError();
  return group;
}

export async function updateGroup(
  groupId: string,
  actingEmail: string,
  updates: { name?: string }
): Promise<IGroup> {
  const group = await Group.findOne({ 
    _id: groupId,
    $or: [
      { deletedAt: null },
      { deletedAt: { $exists: false } }
    ]
  });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (!myRole || (myRole !== 'owner' && myRole !== 'admin')) throw new ForbiddenError();
  
  if (updates.name !== undefined) {
    group.name = String(updates.name).trim();
  }
  
  await group.save();
  return group;
}

export async function deleteGroup(groupId: string, actingEmail: string): Promise<void> {
  const group = await Group.findOne({ 
    _id: groupId,
    $or: [
      { deletedAt: null },
      { deletedAt: { $exists: false } }
    ]
  });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (myRole !== 'owner') throw new ForbiddenError();
  
  // Soft delete by setting deletedAt timestamp
  group.deletedAt = new Date();
  await group.save();
}

export async function restoreGroup(groupId: string, actingEmail: string): Promise<IGroup> {
  const group = await Group.findOne({ 
    _id: groupId,
    deletedAt: { $exists: true }
  });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (myRole !== 'owner') throw new ForbiddenError();
  
  // Restore by removing deletedAt timestamp
  group.deletedAt = undefined;
  await group.save();
  return group;
}

export async function permanentlyDeleteGroup(groupId: string, actingEmail: string): Promise<void> {
  const group = await Group.findOne({ 
    _id: groupId,
    deletedAt: { $exists: true }
  });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (myRole !== 'owner') throw new ForbiddenError();
  
  // Permanently delete the group
  await Group.findByIdAndDelete(groupId);
}

export async function addMember(
  groupId: string,
  actingEmail: string,
  memberEmail: string,
  role: GroupRole = 'member'
): Promise<IGroup> {
  const group = await Group.findOne({ 
    _id: groupId,
    $or: [
      { deletedAt: null },
      { deletedAt: { $exists: false } }
    ]
  });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (!myRole || (myRole !== 'owner' && myRole !== 'admin')) throw new ForbiddenError();
  
  // Check if user is already a member
  if (group.members.some((m) => m.email === memberEmail.toLowerCase())) {
    throw new ConflictError('User is already a member');
  }
  
  group.members.push({ 
    email: memberEmail.toLowerCase(), 
    role, 
    joinedAt: new Date() 
  } as any);
  
  await group.save();
  return group;
}

export function memberRole(group: IGroup, email: string): GroupRole | undefined {
  return group.members.find((m) => m.email === email.toLowerCase())?.role as GroupRole | undefined;
}

export async function updateMemberRole(
  groupId: string,
  actingEmail: string,
  memberEmail: string,
  role: GroupRole
): Promise<IGroup> {
  const group = await Group.findOne({ 
    _id: groupId,
    $or: [
      { deletedAt: null },
      { deletedAt: { $exists: false } }
    ]
  });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (!myRole || (myRole !== 'owner' && myRole !== 'admin')) throw new ForbiddenError();
  const m = group.members.find((x) => x.email === memberEmail.toLowerCase());
  if (!m) throw new NotFoundError('Member not found');
  m.role = role;
  await group.save();
  return group;
}

export async function removeMember(groupId: string, actingEmail: string, targetEmail: string): Promise<IGroup> {
  const group = await Group.findOne({ 
    _id: groupId,
    $or: [
      { deletedAt: null },
      { deletedAt: { $exists: false } }
    ]
  });
  if (!group) throw new NotFoundError();
  const myRole = memberRole(group, actingEmail);
  if (!myRole) throw new ForbiddenError();
  if (actingEmail.toLowerCase() !== targetEmail.toLowerCase() && myRole === 'member') throw new ForbiddenError();
  group.members = group.members.filter((m) => m.email !== targetEmail.toLowerCase());
  await group.save();
  return group;
}

export async function checkMembership(
  groupId: string,
  email: string
): Promise<{ member: boolean; role: GroupRole | null }> {
  const group = await Group.findOne({ 
    _id: groupId,
    $or: [
      { deletedAt: null },
      { deletedAt: { $exists: false } }
    ]
  });
  if (!group) throw new NotFoundError();
  const m = group.members.find((x) => x.email === email.toLowerCase());
  return { member: !!m, role: (m?.role as GroupRole) || null };
}

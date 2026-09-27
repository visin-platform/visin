export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupMember {
  userId: string;
  email?: string;
  role: GroupRole;
  joinedAt: string;
  lastActivity?: string | null;
}

export interface Group {
  _id: string;
  name: string;
  createdBy: string;
  members: GroupMember[];
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An account "Add member" found. `email` is masked unless the search was the whole address. */
export interface Candidate {
  id: string;
  name?: string;
  email: string;
}

/** An invitation addressed to the signed-in account, waiting for an answer. */
export interface MyInvitation {
  id: string;
  groupId: string;
  groupName: string;
  role: GroupRole;
  invitedBy?: string;
  expiresAt: string;
}

/** Something that happened to a project or dataset the group owns or owned. */
export interface GroupActivityEvent {
  _id: string;
  at: string;
  resourceType: 'project' | 'dataset';
  resourceId: string;
  /** its name when it happened */
  resourceName?: string;
  action: 'transfer' | 'visibility' | 'trash' | 'restore' | 'purge';
  actorId: string;
  /** who did it, while they are a member */
  actorEmail?: string;
  from?: { kind: 'user' | 'group'; id: string };
  to?: { kind: 'user' | 'group'; id: string };
  visibility?: string;
}

/** What the signed-in user may do in a given group, derived from their role. */
export interface GroupPermissions {
  canRename: boolean;
  canManageMembers: boolean;
  /** Owners only: soft-delete, restore, and permanent delete. */
  canDeleteGroup: boolean;
  /** Only an owner may promote to, demote, or remove another owner. */
  canManageOwners: boolean;
}

export const permissionsFor = (role: GroupRole | undefined): GroupPermissions => ({
  canRename: role === 'owner' || role === 'admin',
  canManageMembers: role === 'owner' || role === 'admin',
  canDeleteGroup: role === 'owner',
  canManageOwners: role === 'owner'
});

export const roleOf = (group: Group, userId: string | undefined): GroupRole | undefined =>
  userId ? group.members.find((member) => member.userId === userId)?.role : undefined;

/** A group's last owner cannot be demoted or removed — group-service rejects it. */
export const isLastOwner = (group: Group, userId: string): boolean => {
  const owners = group.members.filter((member) => member.role === 'owner');
  return owners.length === 1 && owners[0].userId === userId;
};

/** One event, as a sentence about what happened to the thing. */
export function describeEvent(event: GroupActivityEvent, groupId: string): string {
  const what = `${event.resourceType} "${event.resourceName ?? event.resourceId}"`;
  switch (event.action) {
    case 'transfer':
      return event.to?.kind === 'group' && event.to.id === groupId
        ? `Transferred ${what} to this group`
        : `Transferred ${what} away from this group`;
    case 'visibility':
      return `Made ${what} ${event.visibility === 'public' ? 'public' : 'private'}`;
    case 'trash':
      return `Moved ${what} to the trash`;
    case 'restore':
      return `Restored ${what} from the trash`;
    case 'purge':
      return `Deleted ${what} for good`;
  }
}

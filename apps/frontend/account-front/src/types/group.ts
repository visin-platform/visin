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
  userId ? group.members.find(member => member.userId === userId)?.role : undefined;

/** A group's last owner cannot be demoted or removed — group-service rejects it. */
export const isLastOwner = (group: Group, userId: string): boolean => {
  const owners = group.members.filter(member => member.role === 'owner');
  return owners.length === 1 && owners[0].userId === userId;
};

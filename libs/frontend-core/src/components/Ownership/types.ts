/** Who controls a project or dataset, as the APIs send it. */
export interface OwnerRef {
  kind: 'user' | 'group';
  id: string;
}

export type OwnerRole = 'owner' | 'admin' | 'member';

/** One of the signed-in user's groups, with their role in it. */
export interface OwnerGroup {
  id: string;
  name: string;
  role: OwnerRole;
}

export type Visibility = 'private' | 'public';

/**
 * Where the signed-in user may move something owned by `current`: the same
 * rules the backends enforce (backend-core `canTransfer`), for the choices a
 * form offers. The server still decides.
 *
 * - Theirs: to any group they are in.
 * - A group's, where they are its owner: to themself, or another group they are in.
 * - Otherwise: nowhere.
 */
export function transferTargets(current: OwnerRef, userId: string, groups: OwnerGroup[]): OwnerRef[] {
  const groupTargets = (except?: string) =>
    groups.filter((group) => group.id !== except).map((group): OwnerRef => ({ kind: 'group', id: group.id }));
  if (current.kind === 'user') return current.id === userId ? groupTargets() : [];
  const role = groups.find((group) => group.id === current.id)?.role;
  return role === 'owner' ? [{ kind: 'user', id: userId }, ...groupTargets(current.id)] : [];
}

/** "Me", a group's name, or "A group" for one the user is not in. */
export function ownerLabel(owner: OwnerRef, userId: string | undefined, groups: OwnerGroup[]): string {
  if (owner.kind === 'user') return owner.id === userId ? 'Me' : 'Another person';
  return groups.find((group) => group.id === owner.id)?.name ?? 'A group';
}

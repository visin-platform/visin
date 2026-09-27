import type { GroupMembership } from '../clients/groupService';
import type { ResourceOwner } from './types';

/** Membership of any account in any group, as group-service answers it. */
export type MembershipLookup = (groupId: string, userId: string) => Promise<GroupMembership>;

export interface TransferCheck {
  allowed: boolean;
  /** why not, in words for the person who asked */
  reason?: string;
}

const sameOwner = (a: ResourceOwner, b: ResourceOwner) => a.kind === b.kind && a.id === b.id;
const refuse = (reason: string): TransferCheck => ({ allowed: false, reason });

/**
 * Whether `actorId` may hand a resource from `from` to `to`.
 *
 * | from → to      | who                                                        |
 * | user → group   | the owning user, if a member of the target group (one-way) |
 * | group → user   | the source group's owner; the new owner must be a member   |
 * | group → group  | the source group's owner, who must be in the target group  |
 * | user → user    | nobody yet: it would need the recipient to accept          |
 */
export async function canTransfer(
  from: ResourceOwner,
  to: ResourceOwner,
  actorId: string | undefined,
  lookup: MembershipLookup
): Promise<TransferCheck> {
  if (!actorId) return refuse('Sign in to transfer this');
  if (sameOwner(from, to)) return refuse('It already belongs there');

  if (from.kind === 'user') {
    if (from.id !== actorId) return refuse('Only its owner can transfer it');
    if (to.kind === 'user') return refuse('It can only be handed to a group, not to another person');
    const target = await lookup(to.id, actorId);
    return target.member ? { allowed: true } : refuse('You can only transfer it to a group you are in');
  }

  const source = await lookup(from.id, actorId);
  if (!source.member || source.role !== 'owner') return refuse("Only the owning group's owner can transfer it");
  if (to.kind === 'user') {
    const recipient = to.id === actorId ? source : await lookup(from.id, to.id);
    return recipient.member ? { allowed: true } : refuse('It can only be handed to a member of the group');
  }
  const target = await lookup(to.id, actorId);
  return target.member ? { allowed: true } : refuse('You can only transfer it to a group you are in');
}

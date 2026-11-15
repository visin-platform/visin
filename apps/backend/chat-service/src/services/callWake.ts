import { listen, notify } from './wakeBus';

/**
 * Lets a stream notice a call event at once instead of at its next poll. Purely an accelerator: every stream polls the
 * database anyway, which is what makes a second replica correct (see wakeBus for how the signal crosses replicas).
 */
export const onWake = (userId: string, listener: () => void): (() => void) => listen(`user:${userId}`, listener);

export function wake(userIds: string[]): void {
  notify(...userIds.map((userId) => `user:${userId}`));
}

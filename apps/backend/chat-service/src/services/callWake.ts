/**
 * Lets a stream on this process notice a call event at once instead of at its next poll. Purely an accelerator:
 * every stream polls the database anyway, which is what makes a second replica correct, so a wake-up that never
 * arrives (another process handled the request) costs a fraction of a second, not a missed event.
 */
const listeners = new Map<string, Set<() => void>>();

export function onWake(userId: string, listener: () => void): () => void {
  let set = listeners.get(userId);
  if (!set) listeners.set(userId, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(userId);
  };
}

export function wake(userIds: string[]): void {
  for (const userId of userIds) for (const listener of listeners.get(userId) ?? []) listener();
}

import mongoose from 'mongoose';

/** How old an account's `lastActiveAt` must be before a request is worth a write. */
export const ACTIVITY_STALE_MS = 5 * 60_000;

/** Whether an account last seen at `lastActiveAt` should be stamped again now. */
export function activityIsStale(lastActiveAt: unknown, now = Date.now()): boolean {
  const at = lastActiveAt instanceof Date ? lastActiveAt.getTime() : typeof lastActiveAt === 'string' ? Date.parse(lastActiveAt) : NaN;
  return !Number.isFinite(at) || now - at > ACTIVITY_STALE_MS;
}

/**
 * Record that an account was active now: a signed-in request, or an API key or connector token used on its behalf.
 * Called only where the account was just read and found stale, so a busy user costs one write per interval, and the
 * filter repeats the test so services racing on the same user write once. Fire-and-forget: activity is a convenience
 * for the people looking at it, never a reason for a request to wait or fail.
 */
export function recordActivity(userId: mongoose.Types.ObjectId, now = new Date()): void {
  if (mongoose.connection.readyState !== 1) return;
  try {
    void Promise.resolve(
      mongoose.connection
        .collection('users')
        .updateOne(
          { _id: userId, $or: [{ lastActiveAt: { $exists: false } }, { lastActiveAt: { $lt: new Date(now.getTime() - ACTIVITY_STALE_MS) } }] },
          { $set: { lastActiveAt: now } }
        )
    ).catch(() => {
      // Deliberately swallowed: see above.
    });
  } catch {
    // A driver that throws rather than rejects is swallowed the same way.
  }
}

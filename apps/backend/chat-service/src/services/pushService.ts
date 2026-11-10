import { decryptSecret, encryptSecret, isEncryptionConfigured, logger } from '@visin/backend-core';
import webpush from 'web-push';
import { DeploymentSecret } from '../models/DeploymentSecret';
import { PushSubscription } from '../models/PushSubscription';

/**
 * Web Push delivery.
 *
 * Push is a nudge, never the source of truth. Both mobile platforms drop notifications for a backgrounded PWA under
 * memory pressure, so nothing here is load-bearing: the unread count in the app is what is correct, and a failed send
 * is logged rather than retried.
 *
 * It needs no account anywhere. The signing keys (VAPID) are made by this service on first start and kept in the
 * database, so a fresh clone has notifications with nothing configured; `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
 * override them for an operator who wants to hold their own.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Collapses repeat notifications for one conversation into one. */
  tag: string;
  url: string;
  conversationId?: string;
  /** When the message was sent, in ms. Shown as the notification's time. */
  sentAt?: number;
  /**
   * `call`: a ringing call, kept on screen until it is dealt with.
   * `call-over`: replaces that notification and closes it at once, for a call answered or declined elsewhere.
   */
  kind?: 'call' | 'call-over';
}

/** Sends in a row that fail before a subscription is dropped. A re-register resets the count. */
export const MAX_FAILURES = 20;

interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const SECRET_ID = 'vapid';
let resolved: Promise<Vapid | null> | undefined;

/** Test seam: forgets the resolved keys so a changed environment takes effect. */
export function resetPushConfig(): void {
  resolved = undefined;
}

/**
 * Who the push services can contact about this sender. An operator's own `mailto:` when set; otherwise the
 * deployment's own address from its CORS origins, never an address of ours.
 */
function subject(): string {
  const configured = process.env.VAPID_SUBJECT?.trim();
  if (configured) return configured;
  return (process.env.CORS_ORIGIN || '').split(',')[0]?.trim() || 'https://localhost';
}

async function loadKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (publicKey && privateKey) return { publicKey, privateKey };

  const read = async () => {
    const found = await DeploymentSecret.findById(SECRET_ID).lean();
    if (!found) return null;
    if (found.plain) return { publicKey: found.publicKey, privateKey: found.plain };
    if (found.ciphertext && found.iv && found.tag && isEncryptionConfigured())
      return {
        publicKey: found.publicKey,
        privateKey: decryptSecret({ ciphertext: found.ciphertext, iv: found.iv, tag: found.tag })
      };
    return null;
  };
  const existing = await read();
  if (existing) return existing;

  // First start: make a pair. Two replicas can reach this together; the second insert loses on `_id`, and both then
  // read the winner's pair.
  const keys = webpush.generateVAPIDKeys();
  const sealed = isEncryptionConfigured() ? encryptSecret(keys.privateKey) : { plain: keys.privateKey };
  try {
    await DeploymentSecret.create({ _id: SECRET_ID, publicKey: keys.publicKey, ...sealed });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const stored = await read();
  if (!stored) throw new Error('The saved push keys cannot be read; was API_KEY_ENCRYPTION_SECRET changed?');
  return stored;
}

async function vapid(): Promise<Vapid | null> {
  resolved ??= loadKeys()
    .then((keys) => {
      const details = { ...keys, subject: subject() };
      // Fails on a subject that is not a mailto: or a URL, which would make every send fail the same way.
      webpush.setVapidDetails(details.subject, details.publicKey, details.privateKey);
      return details;
    })
    .catch((error: Error) => {
      logger.warn('Web Push is unavailable', { error: error.message });
      resolved = undefined;
      return null;
    });
  return resolved;
}

export async function pushConfig(): Promise<{ enabled: boolean; publicKey: string | null }> {
  const keys = await vapid();
  return { enabled: Boolean(keys), publicKey: keys?.publicKey ?? null };
}

/** Records or refreshes one browser's endpoint. */
export async function saveSubscription(
  userId: string,
  input: { endpoint: string; keys: { p256dh: string; auth: string }; platform?: string },
  userAgent?: string
): Promise<void> {
  await PushSubscription.updateOne(
    { endpoint: input.endpoint },
    {
      // An endpoint can move between accounts on a shared device, so the owner is set rather than only inserted.
      // A re-register is proof the endpoint is alive, so past failures are forgiven.
      $set: {
        userId,
        keys: input.keys,
        userAgent: (userAgent ?? '').slice(0, 300),
        platform: input.platform ?? '',
        lastSeenAt: new Date(),
        failureCount: 0
      }
    },
    { upsert: true }
  );
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await PushSubscription.deleteOne({ endpoint, userId });
}

/** Whether any of these people has a device to send to: lets a caller skip waiting when nobody could be reached. */
export async function hasSubscription(userIds: string[]): Promise<boolean> {
  if (userIds.length === 0) return false;
  return Boolean(await PushSubscription.exists({ userId: { $in: userIds } }));
}

/**
 * Sends to every device the recipients have registered, and returns how many accepted it.
 *
 * Failures are per endpoint: a 404 or 410 means the browser threw the subscription away, so the row is deleted. Any
 * other failure is counted, and the row goes only after repeated ones: a push service having a bad hour must not
 * unsubscribe phones that are still registered.
 *
 * `topic` makes the push service keep only the newest undelivered push with that topic, so a browser closed for an
 * hour gets one push per conversation when it starts, not one per message it missed.
 */
export async function sendToUsers(
  userIds: string[],
  payload: PushPayload,
  { ttlSeconds = 60 * 60, topic }: { ttlSeconds?: number; topic?: string } = {}
): Promise<number> {
  if (userIds.length === 0) return 0;
  const keys = await vapid();
  if (!keys) return 0;
  const subscriptions = await PushSubscription.find({ userId: { $in: userIds } });
  if (subscriptions.length === 0) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      const p256dh = subscription.keys?.p256dh;
      const auth = subscription.keys?.auth;
      if (!p256dh || !auth) {
        await PushSubscription.deleteOne({ _id: subscription._id });
        return;
      }
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh, auth } }, body, {
          TTL: ttlSeconds,
          urgency: 'high',
          timeout: 10_000,
          vapidDetails: keys,
          ...(topic ? { topic } : {})
        });
        delivered++;
        if (subscription.failureCount > 0)
          await PushSubscription.updateOne({ _id: subscription._id }, { $set: { failureCount: 0 } });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ _id: subscription._id });
          return;
        }
        const failed = await PushSubscription.findOneAndUpdate(
          { _id: subscription._id },
          { $inc: { failureCount: 1 } },
          { returnDocument: 'after' }
        );
        if (failed && failed.failureCount >= MAX_FAILURES) await PushSubscription.deleteOne({ _id: failed._id });
        logger.warn('Web Push send failed', { status, error: (error as Error).message });
      }
    })
  );
  return delivered;
}

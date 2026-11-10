import { getGlobalConfig } from '../config/ConfigProvider';
import { api, apiDelete } from './apiClient';

/**
 * Web Push, from the page's side.
 *
 * Chat runs inside the shell's page, so the service worker, the push subscription and the notification permission
 * all belong to the shell's origin and are reached from here through `navigator`. Run on its own (no shell, no
 * worker) none of it is available and `pushSupport` says so.
 *
 * Nothing here is load-bearing. Both platforms drop notifications for a backgrounded app under memory pressure, so
 * the unread count stays the source of truth and this is a nudge.
 */

export type PushSupport =
  | 'ready'
  /** The API exists but the person has not been asked yet. */
  | 'needs-permission'
  /** Asked and refused. Only the browser's own UI can undo this. */
  | 'denied'
  /** iOS Safari in a tab: Web Push needs the site installed to the Home Screen. */
  | 'needs-install'
  /** A page served over plain http (not localhost): browsers offer no push there. */
  | 'insecure'
  /** No Push API at all. */
  | 'unsupported';

/** Where the service worker keeps what it needs when no page is open. */
export const PUSH_STATE_CACHE = 'visin-push-state';
const CONFIG_KEY = '/__push-config';

/** Whether this looks like an installed, standalone app rather than a tab. */
export function isStandalone(win: Window = window): boolean {
  return (
    win.matchMedia?.('(display-mode: standalone)').matches ||
    // Safari's own flag, which predates display-mode and is still the only reliable signal on iOS.
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Safari on an Apple device, where the install requirement applies. */
export function isAppleBrowser(userAgent: string = navigator.userAgent): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && 'ontouchend' in document);
}

/**
 * What this browser can do. The iOS case is checked before the API check: on iOS in a tab `PushManager` is missing
 * entirely rather than present-and-denied, so without it the person would read "not supported" when the real answer
 * is "add it to your Home Screen first".
 */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!('PushManager' in window) || !('Notification' in window))
    return isAppleBrowser() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' ? 'ready' : 'needs-permission';
}

/**
 * The VAPID public key, as the push API wants it: base64url in, raw bytes out. An `ArrayBuffer` rather than the
 * `Uint8Array` that reads more naturally, because `applicationServerKey` is a `BufferSource` and a typed array over
 * a possibly-shared buffer no longer satisfies that.
 */
export function decodeKey(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
}
export const pushConfig = () => api<PushConfig>('/push/config');

/** The worker of the page this runs in, or none (a dev server, or chat served on its own). */
async function registration(timeoutMs = 15_000): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator) || !(await navigator.serviceWorker.getRegistration())) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('The app is still starting. Please try again.')), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Whether this page has a service worker to deliver to; a dev server, or chat served on its own, has none. */
export async function hasWorker(): Promise<boolean> {
  return Boolean(await registration(3000).catch(() => undefined));
}

/** Whether this browser is currently subscribed. */
export async function isSubscribed(): Promise<boolean> {
  if (pushSupport() !== 'ready') return false;
  const found = await registration(3000).catch(() => undefined);
  return Boolean(await found?.pushManager.getSubscription());
}

/** What the worker needs without a page: where to ask, and the key to renew a rotated subscription with. */
async function rememberConfig(publicKey: string): Promise<void> {
  const apiUrl = getGlobalConfig().CHAT_SERVICE_URL?.replace(/\/$/, '');
  if (!apiUrl) return;
  await caches
    .open(PUSH_STATE_CACHE)
    .then((cache) => cache.put(CONFIG_KEY, new Response(JSON.stringify({ publicKey, apiUrl }))))
    .catch(() => undefined);
}

async function registerWithServer(subscription: PushSubscriptionJSON): Promise<void> {
  const result = await api<{ configured: boolean }>('/push/subscriptions', {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    platform: (navigator.platform || '').slice(0, 40)
  });
  if (!result.configured) throw new Error('This server is not set up to send notifications.');
}

/**
 * Subscribes this browser and records it with the server.
 *
 * **Must be called from a user gesture.** iOS refuses a permission prompt without one, and Chrome penalises a site
 * that asks on load. The toggle is the gesture.
 */
export async function enableNotifications(): Promise<PushSupport> {
  const support = pushSupport();
  if (support !== 'ready' && support !== 'needs-permission') return support;

  const config = await pushConfig();
  if (!config.enabled || !config.publicKey) throw new Error('This server is not set up to send notifications.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'needs-permission';

  const worker = await registration();
  if (!worker) return 'unsupported';
  try {
    const subscription =
      (await worker.pushManager.getSubscription()) ??
      (await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(config.publicKey) }));
    await registerWithServer(subscription.toJSON());
    await rememberConfig(config.publicKey);
    return 'ready';
  } catch (error) {
    throw new Error(`Could not turn notifications on. ${(error as Error).message}`, { cause: error });
  }
}

/** Stops delivery on this device first, even if the server is unreachable, then tells the server. */
export async function disableNotifications(): Promise<void> {
  const worker = await registration();
  const subscription = await worker?.pushManager.getSubscription();
  if (!worker || !subscription) return;
  const { endpoint } = subscription;
  if (!(await subscription.unsubscribe()) && (await worker.pushManager.getSubscription()))
    throw new Error('Could not turn notifications off. Please try again.');
  await caches.open(PUSH_STATE_CACHE).then((cache) => cache.delete(CONFIG_KEY)).catch(() => undefined);
  await apiDelete('/push/subscriptions', { endpoint }, AbortSignal.timeout(15_000)).catch(() => undefined);
}

/**
 * Stops this device getting the signed-out person's messages. Run before signing out, while the session still works.
 * Only the server forgets the device: the browser keeps its subscription, so whoever signs in next gets it attached
 * to their account by `refreshSubscription` without being asked again. Bounded and silent: signing out must never
 * wait on, or fail over, a notification setting.
 */
export async function forgetDeviceOnServer(): Promise<void> {
  try {
    const found = await registration(2000);
    const subscription = await found?.pushManager.getSubscription();
    if (subscription) await apiDelete('/push/subscriptions', { endpoint: subscription.endpoint }, AbortSignal.timeout(3000));
  } catch {
    // Nothing to do: the next sign-in on this device takes the subscription over.
  }
}

/**
 * Re-registers an existing subscription on every app start. Not redundant: a push endpoint can be rotated by the
 * browser at any time, and re-posting is how a rotation is noticed. It also refreshes `lastSeenAt` so a quiet device
 * is not pruned, and moves a shared device's subscription to whoever is signed in. Silent, and never prompts.
 */
export async function refreshSubscription(): Promise<void> {
  if (pushSupport() !== 'ready') return;
  try {
    const config = await pushConfig();
    if (!config.enabled || !config.publicKey) return;
    const worker = await registration();
    const subscription = await worker?.pushManager.getSubscription();
    if (!subscription) return;
    await registerWithServer(subscription.toJSON());
    await rememberConfig(config.publicKey);
  } catch {
    // Best effort: the next start tries again.
  }
}

/** The dot on the installed app's icon. Absent on desktop Safari and older iOS. */
export function setBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) void nav.setAppBadge?.(count).catch(() => undefined);
  else void nav.clearAppBadge?.().catch(() => undefined);
}

/** Brings the icon's badge in line with the server's count of unread conversations. */
export async function syncBadge(): Promise<void> {
  if (pushSupport() !== 'ready') return;
  try {
    setBadge((await api<{ unread: number }>('/push/unread')).unread);
  } catch {
    // The badge is a hint.
  }
}

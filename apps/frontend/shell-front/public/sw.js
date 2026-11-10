// Visin's service worker: what makes the shell installable as an app, what shows an offline page instead of the
// browser's error when a navigation fails, and what shows chat notifications (Web Push) while no page is open.
//
// It deliberately caches none of the app itself. The shell loads vision, label
// and account from their own deployments at runtime, so a cached shell would
// pair stale host code with freshly deployed remotes; and every page needs the
// APIs anyway. Only navigations are intercepted, and only to fall back when the
// network fails — every other request never touches this worker.
const CACHE = 'visin-offline-v1';
const OFFLINE_URL = '/offline.html';
// Where chat leaves what this worker needs when no page is open: the chat API's address, and the key to renew a
// rotated push subscription with. Written by the chat module (it runs in the page, on this origin).
const PUSH_STATE_CACHE = 'visin-push-state';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        // Only this worker's own old caches: the push state below is not its to retire.
        Promise.all(keys.filter((key) => key.startsWith('visin-offline-') && key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

// ─── Push ────────────────────────────────────────────────────────────────────

/**
 * A message or a call arrived while the app was closed or in the background.
 *
 * `userVisibleOnly` was promised at subscribe time, so a notification must be shown for every push or the browser
 * eventually revokes the subscription. That is why an unreadable payload, and a push that turns out to be old news,
 * still show something.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    const data = event.data ? event.data.json() : {};
    payload = data && typeof data === 'object' ? data : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'Visin';
  const options = {
    body: payload.body || 'New message',
    icon: '/icon-192.png',
    // The small icon in the Android status bar: only its alpha channel is kept, so it is a white silhouette.
    badge: '/badge-96.png',
    // Repeat notifications for one conversation replace each other: ten messages are one line, not ten.
    tag: payload.tag || 'visin',
    renotify: Boolean(payload.tag),
    data: { url: payload.url || '/chat' },
    // When it was sent, not when the push arrived: one held while the browser was closed should not read "now".
    timestamp: typeof payload.sentAt === 'number' ? payload.sentAt : Date.now()
  };

  // A ringing call stays on screen until it is dealt with, and buzzes like one. The server replaces it with a
  // "missed call" under the same tag if nobody answers.
  if (payload.kind === 'call') {
    options.requireInteraction = true;
    options.vibrate = [500, 250, 500, 250, 500, 250, 500];
    event.waitUntil(self.registration.showNotification(title, options));
    return;
  }

  // A call answered or declined on another device. It replaces "calling you" under the same tag and is closed at
  // once: the ringing call leaves the lock screen.
  if (payload.kind === 'call-over') {
    event.waitUntil(showAndClose(title, options));
    return;
  }

  // A message. The push service holds pushes while the browser is closed and hands the backlog over when it starts,
  // so a message read an hour ago on the phone would pop up the moment the laptop opens. The server is asked first.
  event.waitUntil(
    unreadState(payload.conversationId).then(({ fresh, unread }) =>
      Promise.all([
        fresh ? self.registration.showNotification(title, options) : showAndClose(title, options),
        typeof unread === 'number' ? setBadge(unread) : undefined
      ])
    )
  );
});

/** Shows a notification and takes it down again, along with anything under its tag. Every push must show one. */
function showAndClose(title, options) {
  return self.registration
    .showNotification(title, { ...options, silent: true, renotify: false, requireInteraction: false })
    .then(() => self.registration.getNotifications({ tag: options.tag }))
    .then((shown) => shown.forEach((notification) => notification.close()));
}

/** The dot on the installed app's icon; with no count, a plain dot. Absent on desktop Safari and older iOS. */
function setBadge(count) {
  if (!self.navigator.setAppBadge) return Promise.resolve();
  if (count === 0) return self.navigator.clearAppBadge().catch(() => undefined);
  return self.navigator.setAppBadge(typeof count === 'number' ? count : undefined).catch(() => undefined);
}

/**
 * Whether a message is still unread, and how many conversations are, from the chat API with the person's own session.
 * Errs towards showing: offline, signed out, a slow server or a push without a conversation all count as fresh. A
 * missed message is worse than a stale one.
 */
async function unreadState(conversationId) {
  if (!conversationId) return { fresh: true };
  try {
    const stored = await caches.open(PUSH_STATE_CACHE).then((cache) => cache.match('/__push-config'));
    const config = stored ? await stored.json() : null;
    if (!config?.apiUrl) return { fresh: true };
    const response = await fetch(`${config.apiUrl}/api/chat/push/unread?conversation=${encodeURIComponent(conversationId)}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return { fresh: true };
    const data = (await response.json())?.data;
    return {
      fresh: typeof data?.fresh === 'boolean' ? data.fresh : true,
      unread: typeof data?.unread === 'number' ? data.unread : undefined
    };
  } catch {
    return { fresh: true };
  }
}

/**
 * Opening a notification. Focuses a window that is already open instead of making a second one, which is what makes
 * tapping one feel like returning to the app rather than launching it again.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let target = new URL('/chat', self.location.origin);
  try {
    const requested = new URL(event.notification.data?.url || '/chat', self.location.origin);
    if (requested.origin === self.location.origin) target = requested;
  } catch {
    // An invalid target still opens chat.
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          try {
            // Focus first: permission to raise a window lasts only briefly after the tap.
            const focused = await client.focus();
            // Routed in place rather than reloaded, so a half-typed message and the loaded apps survive.
            if (focused.url !== target.href) {
              focused.postMessage({ type: 'NAVIGATE', url: target.pathname + target.search + target.hash });
            }
            return;
          } catch {
            // The window may have closed; try the next one.
          }
        }
      }
      return self.clients.openWindow(target.href);
    })
  );
});

/**
 * The push service rotated this browser's endpoint. Without this the subscription silently stops working and nobody
 * finds out until a message does not arrive. Renewing needs the key it was made with, kept in the cache entry chat
 * wrote, because a worker has no other storage that survives being stopped.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    caches
      .open(PUSH_STATE_CACHE)
      .then((cache) => cache.match('/__push-config'))
      .then((response) => (response ? response.json() : null))
      .then(async (config) => {
        if (!config?.publicKey || !config?.apiUrl) return;
        const subscription =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: config.publicKey }));
        // Can happen with every window closed, so it is saved directly, with the same session cookie as the app.
        const response = await fetch(`${config.apiUrl}/api/chat/push/subscriptions`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON())
        });
        if (!response.ok) throw new Error('Could not register the renewed push subscription');
      })
      .catch(() => undefined)
  );
});

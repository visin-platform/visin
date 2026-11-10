import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PUSH_STATE_CACHE,
  decodeKey,
  disableNotifications,
  enableNotifications,
  forgetDeviceOnServer,
  isAppleBrowser,
  isSubscribed,
  pushSupport,
  refreshSubscription,
  syncBadge
} from './pushNotifications';

const net = vi.hoisted(() => ({ api: vi.fn(), apiDelete: vi.fn() }));
vi.mock('./apiClient', () => net);
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => ({ CHAT_SERVICE_URL: 'http://chat.example.test/' }) }));

const KEY = 'AQID-_8'; // url-safe base64 of 01 02 03 fb ff
const subscriptionJson = { endpoint: 'https://push.example.test/abc', keys: { p256dh: 'p', auth: 'a' } };

interface Fakes {
  subscription: { toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn>; endpoint: string } | null;
  subscribe: ReturnType<typeof vi.fn>;
  cache: Map<string, string>;
}

/** A browser with the Push API, a worker, and a cache; each test changes what it needs. */
function browser(overrides: { permission?: NotificationPermission; registered?: boolean; subscribed?: boolean } = {}) {
  const fakes: Fakes = {
    subscription: overrides.subscribed
      ? { endpoint: subscriptionJson.endpoint, toJSON: () => subscriptionJson, unsubscribe: vi.fn(async () => true) }
      : null,
    subscribe: vi.fn(),
    cache: new Map()
  };
  fakes.subscribe.mockImplementation(async () => {
    fakes.subscription = {
      endpoint: subscriptionJson.endpoint,
      toJSON: () => subscriptionJson,
      unsubscribe: vi.fn(async () => true)
    };
    return fakes.subscription;
  });
  const worker = {
    pushManager: { getSubscription: vi.fn(async () => fakes.subscription), subscribe: fakes.subscribe }
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn(async () => (overrides.registered === false ? undefined : worker)),
      ready: Promise.resolve(worker)
    }
  });
  // jsdom leaves this undefined; every browser that has service workers defines it.
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', {
    permission: overrides.permission ?? 'default',
    requestPermission: vi.fn(async () => 'granted')
  });
  vi.stubGlobal('caches', {
    open: async () => ({
      put: async (key: string, response: Response) => void fakes.cache.set(key, await response.text()),
      delete: async (key: string) => fakes.cache.delete(key)
    })
  });
  return fakes;
}

beforeEach(() => {
  net.api.mockReset();
  net.apiDelete.mockReset();
  net.apiDelete.mockResolvedValue(undefined);
  net.api.mockImplementation(async (path: string) => {
    if (path === '/push/config') return { enabled: true, publicKey: KEY };
    if (path === '/push/subscriptions') return { configured: true };
    if (path === '/push/unread') return { unread: 3 };
    throw new Error(`unexpected ${path}`);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('decodeKey', () => {
  it('turns the server’s url-safe base64 into the bytes the push API wants', () => {
    expect([...new Uint8Array(decodeKey(KEY))]).toEqual([1, 2, 3, 251, 255]);
    expect([...new Uint8Array(decodeKey('AQID'))]).toEqual([1, 2, 3]);
  });
});

describe('pushSupport', () => {
  it('is unsupported without a service worker', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    expect(pushSupport()).toBe('unsupported');
  });

  it('follows the permission when the browser can do push', () => {
    browser({ permission: 'default' });
    expect(pushSupport()).toBe('needs-permission');
    browser({ permission: 'granted' });
    expect(pushSupport()).toBe('ready');
    browser({ permission: 'denied' });
    expect(pushSupport()).toBe('denied');
  });

  it('says a plain-http page cannot, rather than that the browser is old', () => {
    browser();
    vi.stubGlobal('isSecureContext', false);
    expect(pushSupport()).toBe('insecure');
  });

  it('asks an iPhone tab to install first, but does not blame an old desktop browser', () => {
    browser();
    vi.stubGlobal('PushManager', undefined);
    Reflect.deleteProperty(window, 'PushManager');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(isAppleBrowser()).toBe(true);
    expect(pushSupport()).toBe('needs-install');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64) Firefox/100');
    expect(pushSupport()).toBe('unsupported');
  });
});

describe('enableNotifications', () => {
  it('asks permission, subscribes with the server’s key, and tells the server', async () => {
    const fakes = browser();
    expect(await enableNotifications()).toBe('ready');
    expect(Notification.requestPermission).toHaveBeenCalled();
    const options = fakes.subscribe.mock.calls[0][0];
    expect(options.userVisibleOnly).toBe(true);
    expect([...new Uint8Array(options.applicationServerKey)]).toEqual([1, 2, 3, 251, 255]);
    expect(net.api).toHaveBeenCalledWith('/push/subscriptions', expect.objectContaining({ endpoint: subscriptionJson.endpoint }));
    // What the worker needs while no page is open.
    expect(JSON.parse(fakes.cache.get('/__push-config')!)).toEqual({ publicKey: KEY, apiUrl: 'http://chat.example.test' });
    expect(PUSH_STATE_CACHE).toBe('visin-push-state');
  });

  it('reuses the subscription this browser already has', async () => {
    const fakes = browser({ subscribed: true });
    await enableNotifications();
    expect(fakes.subscribe).not.toHaveBeenCalled();
  });

  it('stops quietly when the person says no, and subscribes to nothing', async () => {
    const fakes = browser();
    vi.mocked(Notification.requestPermission).mockResolvedValue('denied');
    expect(await enableNotifications()).toBe('denied');
    expect(fakes.subscribe).not.toHaveBeenCalled();
    vi.mocked(Notification.requestPermission).mockResolvedValue('default');
    expect(await enableNotifications()).toBe('needs-permission');
  });

  it('does not ask for permission on a server that cannot send', async () => {
    browser();
    net.api.mockImplementation(async () => ({ enabled: false, publicKey: null }));
    await expect(enableNotifications()).rejects.toThrow('not set up');
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('says why when the server will not take the subscription', async () => {
    browser();
    net.api.mockImplementation(async (path: string) =>
      path === '/push/config' ? { enabled: true, publicKey: KEY } : { configured: false }
    );
    await expect(enableNotifications()).rejects.toThrow('Could not turn notifications on');
  });

  it('has no worker to subscribe with when chat runs on its own', async () => {
    browser({ registered: false });
    expect(await enableNotifications()).toBe('unsupported');
  });

  it('returns the reason without prompting where push cannot work', async () => {
    browser({ permission: 'denied' });
    expect(await enableNotifications()).toBe('denied');
    expect(net.api).not.toHaveBeenCalled();
  });
});

describe('disableNotifications', () => {
  it('unsubscribes the browser first, clears what the worker kept, then tells the server', async () => {
    const fakes = browser({ permission: 'granted', subscribed: true });
    fakes.cache.set('/__push-config', '{}');
    const subscription = fakes.subscription!;
    await disableNotifications();
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(fakes.cache.has('/__push-config')).toBe(false);
    expect(net.apiDelete).toHaveBeenCalledWith('/push/subscriptions', { endpoint: subscriptionJson.endpoint }, expect.anything());
  });

  it('still stops here when the server cannot be reached', async () => {
    const fakes = browser({ permission: 'granted', subscribed: true });
    net.apiDelete.mockRejectedValue(new Error('offline'));
    await expect(disableNotifications()).resolves.toBeUndefined();
    expect(fakes.subscription!.unsubscribe).toHaveBeenCalled();
  });

  it('reports a browser that will not let go, and does nothing when there is nothing to remove', async () => {
    const fakes = browser({ permission: 'granted', subscribed: true });
    fakes.subscription!.unsubscribe.mockResolvedValue(false);
    await expect(disableNotifications()).rejects.toThrow('Could not turn notifications off');
    browser({ permission: 'granted', subscribed: false });
    await expect(disableNotifications()).resolves.toBeUndefined();
    expect(net.apiDelete).not.toHaveBeenCalled();
  });
});

describe('isSubscribed, refreshSubscription, forgetDeviceOnServer, syncBadge', () => {
  it('knows whether this browser is subscribed', async () => {
    browser({ permission: 'granted', subscribed: true });
    expect(await isSubscribed()).toBe(true);
    browser({ permission: 'granted', subscribed: false });
    expect(await isSubscribed()).toBe(false);
    browser({ permission: 'default' });
    expect(await isSubscribed()).toBe(false);
  });

  it('re-registers an existing subscription on start, and never prompts', async () => {
    const fakes = browser({ permission: 'granted', subscribed: true });
    await refreshSubscription();
    expect(net.api).toHaveBeenCalledWith('/push/subscriptions', expect.objectContaining({ endpoint: subscriptionJson.endpoint }));
    expect(fakes.cache.has('/__push-config')).toBe(true);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('does nothing without a subscription, without permission, or when the server fails', async () => {
    browser({ permission: 'granted', subscribed: false });
    await refreshSubscription();
    browser({ permission: 'default', subscribed: true });
    await refreshSubscription();
    browser({ permission: 'granted', subscribed: true });
    net.api.mockRejectedValue(new Error('down'));
    await expect(refreshSubscription()).resolves.toBeUndefined();
    expect(net.api).not.toHaveBeenCalledWith('/push/subscriptions', expect.anything());
  });

  it('lets go of the device on sign-out, quickly and without ever failing', async () => {
    browser({ permission: 'granted', subscribed: true });
    await forgetDeviceOnServer();
    expect(net.apiDelete).toHaveBeenCalledWith('/push/subscriptions', { endpoint: subscriptionJson.endpoint }, expect.anything());
    net.apiDelete.mockRejectedValue(new Error('offline'));
    await expect(forgetDeviceOnServer()).resolves.toBeUndefined();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    await expect(forgetDeviceOnServer()).resolves.toBeUndefined();
  });

  it('sets the icon badge to the unread count, and clears it at zero', async () => {
    browser({ permission: 'granted' });
    const setAppBadge = vi.fn(async () => undefined);
    const clearAppBadge = vi.fn(async () => undefined);
    Object.assign(navigator, { setAppBadge, clearAppBadge });
    await syncBadge();
    expect(setAppBadge).toHaveBeenCalledWith(3);
    net.api.mockImplementation(async () => ({ unread: 0 }));
    await syncBadge();
    expect(clearAppBadge).toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'setAppBadge');
    Reflect.deleteProperty(navigator, 'clearAppBadge');
  });
});

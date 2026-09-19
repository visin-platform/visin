import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './pwa';

describe('registerServiceWorker', () => {
  const register = vi.fn();

  /** Runs registerServiceWorker and then the load handler it added, if any. */
  function registerAndLoad() {
    const addEventListener = vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
    registerServiceWorker();
    const onLoad = addEventListener.mock.calls.find(([type]) => type === 'load')?.[1];
    addEventListener.mockRestore();
    if (typeof onLoad === 'function') onLoad(new Event('load'));
    return onLoad;
  }

  beforeEach(() => {
    register.mockReset().mockResolvedValue({});
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('registers the worker on page load in a production build', () => {
    vi.stubEnv('PROD', true);
    expect(registerAndLoad()).toBeDefined();
    expect(register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
  });

  it('does nothing in development', () => {
    vi.stubEnv('PROD', false);
    expect(registerAndLoad()).toBeUndefined();
    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing where service workers are unsupported', () => {
    vi.stubEnv('PROD', true);
    Reflect.deleteProperty(navigator, 'serviceWorker');
    expect(registerAndLoad()).toBeUndefined();
  });

  it('warns rather than throwing when registration fails', async () => {
    vi.stubEnv('PROD', true);
    const error = new Error('blocked');
    register.mockRejectedValue(error);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerAndLoad();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('Service worker registration failed', error));
    warn.mockRestore();
  });
});

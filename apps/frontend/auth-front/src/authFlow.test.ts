import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ AUTH_SERVICE_URL: 'http://auth-api.test' }),
}));

import { initializeGoogleSignIn } from './authFlow';

const REDIRECT_URI = '/dashboard';
const CLIENT_ID = 'client-123';

let buttonElement: HTMLElement;

const setLocationHref = () => {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, href: '', origin: 'http://auth.test' },
    writable: true,
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="google-signin-button"></div>';
  buttonElement = document.getElementById('google-signin-button')!;
  setLocationHref();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  delete window.google;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('initializeGoogleSignIn', () => {
  it('initializes Google Sign-In and renders the button', async () => {
    const initialize = vi.fn();
    const renderButton = vi.fn();
    window.google = { accounts: { id: { initialize, renderButton } } };

    initializeGoogleSignIn(CLIENT_ID, REDIRECT_URI);
    await vi.advanceTimersByTimeAsync(0);

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: CLIENT_ID, callback: expect.any(Function) })
    );
    expect(renderButton).toHaveBeenCalledWith(buttonElement, { theme: 'outline', size: 'large' });
  });

  it('skips re-rendering when a Google button is already present', async () => {
    buttonElement.innerHTML = 'Sign in with Google';
    const initialize = vi.fn();
    const renderButton = vi.fn();
    window.google = { accounts: { id: { initialize, renderButton } } };

    initializeGoogleSignIn(CLIENT_ID, REDIRECT_URI);
    await vi.advanceTimersByTimeAsync(0);

    expect(renderButton).not.toHaveBeenCalled();
  });

  it('shows a fallback message when initialize() throws', async () => {
    window.google = {
      accounts: {
        id: {
          initialize: () => {
            throw new Error('init failed');
          },
          renderButton: vi.fn(),
        },
      },
    };

    initializeGoogleSignIn(CLIENT_ID, REDIRECT_URI);
    await vi.advanceTimersByTimeAsync(0);

    expect(buttonElement.innerHTML).toContain('Google Sign-In failed to load');
  });

  it('shows a fallback message when renderButton() throws and retries are exhausted', async () => {
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn(),
          renderButton: () => {
            throw new Error('render failed');
          },
        },
      },
    };

    initializeGoogleSignIn(CLIENT_ID, REDIRECT_URI);
    await vi.advanceTimersByTimeAsync(15000);

    expect(buttonElement.innerHTML).toContain('Google Sign-In failed to load');
  });

  it('shows a fallback message after exhausting retries when the Google script never loads', async () => {
    initializeGoogleSignIn(CLIENT_ID, REDIRECT_URI);

    await vi.advanceTimersByTimeAsync(15000);

    expect(buttonElement.innerHTML).toContain('Google Sign-In failed to load');
  });

  describe('handleCredentialResponse (exercised via the captured Google callback)', () => {
    const setup = async () => {
      const initialize = vi.fn();
      const renderButton = vi.fn();
      window.google = { accounts: { id: { initialize, renderButton } } };

      initializeGoogleSignIn(CLIENT_ID, REDIRECT_URI);
      await vi.advanceTimersByTimeAsync(0);

      const callback = initialize.mock.calls[0][0].callback as (r: { credential: string }) => void;
      return callback;
    };

    it('redirects to redirectUri on successful validation', async () => {
      const callback = await setup();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
      );

      callback({ credential: 'id-token' });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();

      expect(window.location.href).toBe(REDIRECT_URI);
    });

    it('redirects with an error param when validation reports failure', async () => {
      const callback = await setup();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false, message: 'Bad token' }) })
      );

      callback({ credential: 'id-token' });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();

      expect(window.location.href).toContain('error=Bad%20token');
      expect(window.location.href).toContain(encodeURIComponent(REDIRECT_URI));
    });

    it('redirects with a generic error when the HTTP response is not ok', async () => {
      const callback = await setup();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));

      callback({ credential: 'id-token' });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();

      expect(window.location.href).toContain('error=');
      expect(window.location.href).toContain('Authentication%20error');
    });

    it('redirects with an error when the fetch itself rejects', async () => {
      const callback = await setup();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      callback({ credential: 'id-token' });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();

      expect(window.location.href).toContain('Authentication%20error%3A%20network%20down');
    });
  });
});

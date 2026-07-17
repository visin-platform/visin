import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createConfigProvider } from './createConfigProvider';

interface TestConfig {
  API_URL: string;
}

const devConfig: TestConfig = { API_URL: 'http://dev-api.test' };
const prodConfig: TestConfig = { API_URL: 'http://prod-api.test' };

const makeProvider = (overrides: Partial<Parameters<typeof createConfigProvider<TestConfig>>[0]> = {}) =>
  createConfigProvider<TestConfig>({
    createDevConfig: () => devConfig,
    isDev: false,
    ...overrides
  });

function Consumer({ useConfig }: { useConfig: () => TestConfig }) {
  return <span data-testid="api-url">{useConfig().API_URL}</span>;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createConfigProvider', () => {
  it('uses the dev config directly in dev mode, without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { ConfigProvider, useConfig } = makeProvider({ isDev: true });

    render(
      <ConfigProvider>
        <Consumer useConfig={useConfig} />
      </ConfigProvider>
    );

    await waitFor(() => expect(screen.getByTestId('api-url')).toHaveTextContent('http://dev-api.test'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches /config.json in production and provides the loaded config', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(prodConfig), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { ConfigProvider, useConfig, getGlobalConfig } = makeProvider();

    render(
      <ConfigProvider>
        <Consumer useConfig={useConfig} />
      </ConfigProvider>
    );

    await waitFor(() => expect(screen.getByTestId('api-url')).toHaveTextContent('http://prod-api.test'));
    expect(fetchMock).toHaveBeenCalledWith('/config.json');
    expect(getGlobalConfig()).toEqual(prodConfig);
  });

  it('shows the default Loader while the config fetch is pending', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    const { ConfigProvider, useConfig } = makeProvider();

    render(
      <ConfigProvider>
        <Consumer useConfig={useConfig} />
      </ConfigProvider>
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByTestId('api-url')).not.toBeInTheDocument();
  });

  it('renders a custom loadingFallback while pending', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    const { ConfigProvider, useConfig } = makeProvider({
      loadingFallback: <span>custom loading</span>
    });

    render(
      <ConfigProvider>
        <Consumer useConfig={useConfig} />
      </ConfigProvider>
    );

    expect(screen.getByText('custom loading')).toBeInTheDocument();
  });

  it('renders the ErrorPage when the config fetch fails (default onFetchError)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ConfigProvider, useConfig } = makeProvider();

    render(
      <ConfigProvider>
        <Consumer useConfig={useConfig} />
      </ConfigProvider>
    );

    await waitFor(() => expect(screen.getByText('Configuration Error')).toBeInTheDocument());
    expect(screen.queryByTestId('api-url')).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('Configuration load error:', expect.anything());
  });

  it("falls back to the dev config on fetch failure with onFetchError: 'fallback'", async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ConfigProvider, useConfig } = makeProvider({ onFetchError: 'fallback' });

    render(
      <ConfigProvider>
        <Consumer useConfig={useConfig} />
      </ConfigProvider>
    );

    await waitFor(() => expect(screen.getByTestId('api-url')).toHaveTextContent('http://dev-api.test'));
  });

  it('wraps children with renderChildren once the config resolves', async () => {
    const { ConfigProvider, useConfig } = makeProvider({
      isDev: true,
      renderChildren: (children: ReactNode) => <div data-testid="wrapper">{children}</div>
    });

    render(
      <ConfigProvider>
        <Consumer useConfig={useConfig} />
      </ConfigProvider>
    );

    await waitFor(() => expect(screen.getByTestId('wrapper')).toBeInTheDocument());
    expect(screen.getByTestId('api-url')).toHaveTextContent('http://dev-api.test');
  });

  describe('getGlobalConfig', () => {
    it('throws in production before the provider has mounted', () => {
      const { getGlobalConfig } = makeProvider();

      expect(() => getGlobalConfig()).toThrow('Configuration not initialized');
    });

    it('warns and returns the dev fallback in dev mode before the provider has mounted (HMR)', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { getGlobalConfig } = makeProvider({ isDev: true });

      expect(getGlobalConfig()).toEqual(devConfig);
      expect(consoleWarn).toHaveBeenCalledWith(
        'Using fallback configuration during HMR:',
        devConfig
      );
    });

    it('returns the mounted config after the provider initializes', async () => {
      const { ConfigProvider, useConfig, getGlobalConfig } = makeProvider({ isDev: true });

      render(
        <ConfigProvider>
          <Consumer useConfig={useConfig} />
        </ConfigProvider>
      );

      await waitFor(() => expect(screen.getByTestId('api-url')).toBeInTheDocument());
      expect(getGlobalConfig()).toEqual(devConfig);
    });
  });
});

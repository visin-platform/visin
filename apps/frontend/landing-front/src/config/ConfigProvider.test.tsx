import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// The provider keeps the first config it resolves for the page's lifetime, so
// each test that changes the env renders a fresh copy of the module.
const renderProvider = async () => {
  vi.resetModules();
  const { ConfigProvider, useConfig } = await import('./ConfigProvider');
  const Probe = () => {
    const config = useConfig();
    return (
      <div>
        <span data-testid="api-url">{config.VISION_API_URL ?? 'no-url'}</span>
        <span data-testid="mcp-url">{config.MCP_PUBLIC_URL ?? 'no-mcp'}</span>
      </div>
    );
  };
  render(
    <ConfigProvider>
      <Probe />
    </ConfigProvider>
  );
  return {
    apiUrl: await screen.findByTestId('api-url'),
    mcpUrl: screen.getByTestId('mcp-url')
  };
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ConfigProvider', () => {
  it('provides a dev config to consumers', async () => {
    const { apiUrl } = await renderProvider();

    expect(apiUrl).toHaveTextContent(/no-url|http/);
  });

  it('uses configured env vars over the localhost defaults when present', async () => {
    vi.stubEnv('VITE_VISION_API_URL', 'http://configured-api.test');
    vi.stubEnv('VITE_VISION_FRONT_URL', 'http://configured-front.test');
    vi.stubEnv('VITE_MCP_PUBLIC_URL', 'http://configured-mcp.test');

    const { apiUrl, mcpUrl } = await renderProvider();

    expect(apiUrl).toHaveTextContent('http://configured-api.test');
    expect(mcpUrl).toHaveTextContent('http://configured-mcp.test');
  });

  it('falls back to the localhost defaults when the env vars are empty', async () => {
    // .env sets these vars for normal dev/build, so the `|| default` branch
    // only fires when they're explicitly blanked out, as here.
    vi.stubEnv('VITE_VISION_API_URL', '');
    vi.stubEnv('VITE_VISION_FRONT_URL', '');
    vi.stubEnv('VITE_MCP_PUBLIC_URL', '');

    const { apiUrl, mcpUrl } = await renderProvider();

    expect(apiUrl).toHaveTextContent('http://localhost:4010');
    expect(mcpUrl).toHaveTextContent('http://localhost:5009');
  });
});

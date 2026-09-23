import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

// Loading MUI and the shared lib the first time is the slow part, and it is
// not what these tests measure. Doing it once here keeps it out of each test's
// timeout; the per-test re-import below then only re-evaluates the provider.
beforeAll(async () => {
  await import('./ConfigProvider');
}, 30_000);

// The provider keeps the first config it resolves for the page's lifetime, so
// each test that changes the env renders a fresh copy of the module.
const renderProvider = async () => {
  vi.resetModules();
  const { ConfigProvider, useConfig } = await import('./ConfigProvider');
  const Probe = () => {
    const config = useConfig();
    return (
      <div>
        <span data-testid="mcp-url">{config.MCP_PUBLIC_URL ?? 'no-mcp'}</span>
        <span data-testid="shell-url">{config.SHELL_FRONT_URL ?? 'no-shell'}</span>
      </div>
    );
  };
  render(
    <ConfigProvider>
      <Probe />
    </ConfigProvider>
  );
  return {
    mcpUrl: await screen.findByTestId('mcp-url'),
    shellUrl: screen.getByTestId('shell-url')
  };
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ConfigProvider', () => {
  it('provides a dev config to consumers', async () => {
    const { mcpUrl } = await renderProvider();

    expect(mcpUrl).toHaveTextContent(/no-mcp|http/);
  });

  it('uses configured env vars over the localhost defaults when present', async () => {
    vi.stubEnv('VITE_SHELL_FRONT_URL', 'http://configured-shell.test');
    vi.stubEnv('VITE_MCP_PUBLIC_URL', 'http://configured-mcp.test');

    const { mcpUrl, shellUrl } = await renderProvider();

    expect(mcpUrl).toHaveTextContent('http://configured-mcp.test');
    expect(shellUrl).toHaveTextContent('http://configured-shell.test');
  });

  it('falls back to the localhost defaults when the env vars are empty', async () => {
    // .env sets these vars for normal dev/build, so the `|| default` branch
    // only fires when they're explicitly blanked out, as here.
    vi.stubEnv('VITE_SHELL_FRONT_URL', '');
    vi.stubEnv('VITE_MCP_PUBLIC_URL', '');

    const { mcpUrl, shellUrl } = await renderProvider();

    expect(mcpUrl).toHaveTextContent('http://localhost:5009');
    // The app people open is shell-front, not vision-front's own port.
    expect(shellUrl).toHaveTextContent('http://localhost:3010');
  });
});

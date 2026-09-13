import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

// Loading MUI and the shared lib the first time is the slow part, and it is
// not what these tests measure. Doing it once here keeps it out of each test's
// timeout; the per-test re-import below then only re-evaluates the provider.
beforeAll(async () => {
  await import('./ConfigProvider');
}, 30_000);

// The provider keeps the first config it resolves for the rest of the page's
// life (shell-front remounts it on every visit to Vision), so each test that
// changes the env needs a fresh copy of the module.
const renderProvider = async () => {
  vi.resetModules();
  const { ConfigProvider, useConfig } = await import('./ConfigProvider');
  const Probe = () => {
    const config = useConfig();
    return <div>{config.VISION_API_URL || 'no-url'}</div>;
  };
  render(
    <ConfigProvider>
      <Probe />
    </ConfigProvider>
  );
};

describe('ConfigProvider', () => {
  it('provides a dev config to consumers', async () => {
    await renderProvider();

    expect(await screen.findByText(/no-url|http/)).toBeInTheDocument();
  });

  it('uses configured env vars over the localhost defaults when present', async () => {
    vi.stubEnv('VITE_VISION_API_URL', 'http://configured-api.test');

    await renderProvider();

    expect(await screen.findByText('http://configured-api.test')).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('falls back to no value when the env var is empty (no default configured)', async () => {
    // .env sets VITE_VISION_API_URL for normal dev/build, so this only
    // exercises the "no value" branch when explicitly blanked out, as here.
    vi.stubEnv('VITE_VISION_API_URL', '');

    await renderProvider();

    expect(await screen.findByText('no-url')).toBeInTheDocument();
    vi.unstubAllEnvs();
  });
});

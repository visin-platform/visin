import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider, useConfig } from './ConfigProvider';

const Probe = () => {
  const config = useConfig();
  return <div>{config.VISION_API_URL || 'no-url'}</div>;
};

describe('ConfigProvider', () => {
  it('provides a dev config to consumers', async () => {
    render(
      <ConfigProvider>
        <Probe />
      </ConfigProvider>
    );

    expect(await screen.findByText(/no-url|http/)).toBeInTheDocument();
  });

  it('uses configured env vars over the localhost defaults when present', async () => {
    vi.stubEnv('VITE_VISION_API_URL', 'http://configured-api.test');

    render(
      <ConfigProvider>
        <Probe />
      </ConfigProvider>
    );

    expect(await screen.findByText('http://configured-api.test')).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('falls back to no value when the env var is empty (no default configured)', async () => {
    // .env sets VITE_VISION_API_URL for normal dev/build, so this only
    // exercises the "no value" branch when explicitly blanked out, as here.
    vi.stubEnv('VITE_VISION_API_URL', '');

    render(
      <ConfigProvider>
        <Probe />
      </ConfigProvider>
    );

    expect(await screen.findByText('no-url')).toBeInTheDocument();
    vi.unstubAllEnvs();
  });
});

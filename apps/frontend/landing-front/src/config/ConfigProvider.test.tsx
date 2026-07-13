import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider, useConfig } from './ConfigProvider';

const Probe = () => {
  const config = useConfig();
  return <div>{config.VISION_API_URL ?? 'no-url'}</div>;
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
    vi.stubEnv('VITE_VISION_FRONT_URL', 'http://configured-front.test');

    render(
      <ConfigProvider>
        <Probe />
      </ConfigProvider>
    );

    expect(await screen.findByText('http://configured-api.test')).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('falls back to the localhost defaults when the env vars are empty', async () => {
    // .env sets these vars for normal dev/build, so the `|| default` branch
    // only fires when they're explicitly blanked out, as here.
    vi.stubEnv('VITE_VISION_API_URL', '');
    vi.stubEnv('VITE_VISION_FRONT_URL', '');

    render(
      <ConfigProvider>
        <Probe />
      </ConfigProvider>
    );

    expect(await screen.findByText('http://localhost:4010')).toBeInTheDocument();
    vi.unstubAllEnvs();
  });
});

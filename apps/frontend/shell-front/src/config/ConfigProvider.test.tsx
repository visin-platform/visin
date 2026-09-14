import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

// Loading MUI and the shared lib the first time is the slow part, and it is
// not what these tests measure. Doing it once here keeps it out of each test's
// timeout; the per-test re-import below then only re-evaluates the provider.
beforeAll(async () => {
  await import('./ConfigProvider');
}, 30_000);

// The provider keeps the first config it resolves, so each test gets a fresh module.
const renderProvider = async () => {
  vi.resetModules();
  const { ConfigProvider, getGlobalConfig } = await import('./ConfigProvider');
  render(
    <ConfigProvider>
      <div>shell</div>
    </ConfigProvider>
  );
  await screen.findByText('shell');
  return getGlobalConfig();
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('shell ConfigProvider', () => {
  // `npm run dev` starts each app on its fixed port; the shell must find them
  // without anyone writing an .env for it.
  it('finds every app on its local dev port when nothing is configured', async () => {
    for (const name of [
      'VITE_AUTH_SERVICE_URL',
      'VITE_AUTH_FRONT_URL',
      'VITE_VISION_FRONT_URL',
      'VITE_LABEL_FRONT_URL',
      'VITE_ACCOUNT_FRONT_URL',
    ]) {
      vi.stubEnv(name, '');
    }

    expect(await renderProvider()).toEqual({
      AUTH_SERVICE_URL: 'http://localhost:5001',
      AUTH_FRONT_URL: 'http://localhost:3004',
      VISION_FRONT_URL: 'http://localhost:3012',
      LABEL_FRONT_URL: 'http://localhost:3008',
      ACCOUNT_FRONT_URL: 'http://localhost:3007',
      VISION_API_URL: 'http://localhost:4010',
      LABEL_SERVICE_URL: 'http://localhost:5008',
    });
  });

  it('lets a VITE_ variable point an app somewhere else', async () => {
    vi.stubEnv('VITE_LABEL_FRONT_URL', 'http://label.dev.test');

    expect(await renderProvider()).toEqual(expect.objectContaining({ LABEL_FRONT_URL: 'http://label.dev.test' }));
  });
});

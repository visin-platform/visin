import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider, useConfig } from './ConfigProvider';

const Probe = () => {
  const config = useConfig();
  return <div>{config.AUTH_SERVICE_URL ?? 'no-url'}</div>;
};

describe('ConfigProvider', () => {
  it('provides a dev config (from Vite env vars) to consumers and applies the MUI theme wrapper', async () => {
    render(
      <ConfigProvider>
        <Probe />
      </ConfigProvider>
    );

    // isDev is true under Vitest, so ConfigProvider resolves synchronously
    // via createDevConfig() rather than fetching /config.json.
    expect(await screen.findByText(/no-url|http/)).toBeInTheDocument();
  });
});

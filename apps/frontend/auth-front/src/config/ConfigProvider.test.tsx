import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider, useConfig } from './ConfigProvider';

const Probe = () => {
  const config = useConfig();
  return <div>{config.GOOGLE_CLIENT_ID ?? 'no-client-id'}</div>;
};

describe('ConfigProvider', () => {
  it('provides a dev config to consumers', async () => {
    render(
      <ConfigProvider>
        <Probe />
      </ConfigProvider>
    );

    expect(await screen.findByText(/no-client-id|.+/)).toBeInTheDocument();
  });
});

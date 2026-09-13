import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const config: { MCP_PUBLIC_URL?: string } = {};
vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config }));

import { useMcpEndpoint } from './useMcpEndpoint';

beforeEach(() => {
  delete config.MCP_PUBLIC_URL;
});

describe('useMcpEndpoint', () => {
  it('builds the endpoint from the configured MCP server', () => {
    config.MCP_PUBLIC_URL = 'https://mcp.example.test/';

    expect(renderHook(() => useMcpEndpoint()).result.current).toBe('https://mcp.example.test/mcp');
  });

  it('names no address when the deployment has not configured one', () => {
    expect(renderHook(() => useMcpEndpoint()).result.current).toBeNull();
  });
});

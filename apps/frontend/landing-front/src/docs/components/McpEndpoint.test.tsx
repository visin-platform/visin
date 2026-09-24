import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import McpEndpoint from './McpEndpoint';

const config: { MCP_PUBLIC_URL?: string } = {};

vi.mock('../../config/ConfigProvider', () => ({ useConfig: () => config }));

beforeEach(() => {
  config.MCP_PUBLIC_URL = undefined;
});

describe('McpEndpoint', () => {
  it("shows this deployment's MCP address, whatever its trailing slash", () => {
    config.MCP_PUBLIC_URL = 'https://mcp.example.test/';
    render(<McpEndpoint />);

    expect(screen.getByText('https://mcp.example.test/mcp')).toBeInTheDocument();
    expect(screen.getByText('This deployment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
  });

  it('falls back to the local address, saying so, when the page was not told one', () => {
    render(<McpEndpoint />);

    expect(screen.getByText('http://localhost:5009/mcp')).toBeInTheDocument();
    expect(screen.getByText('A local Visin')).toBeInTheDocument();
  });
});

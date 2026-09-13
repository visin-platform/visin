import { useConfig } from '../config/ConfigProvider';

/**
 * Where an assistant connects over MCP on this deployment, or null when none is
 * configured. Read from config rather than written into the page: Visin runs on
 * its operator's domain, and a hard-coded address would point people at a
 * different deployment.
 */
export function useMcpEndpoint(): string | null {
  const base = useConfig().MCP_PUBLIC_URL;
  return base ? `${base.replace(/\/$/, '')}/mcp` : null;
}

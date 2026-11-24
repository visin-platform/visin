import { createServer, type Server } from 'node:http';

/**
 * A chat that accepts whatever the assistant service asks of it, and remembers the asking: for a test of what this
 * service does, where what chat does with it is chat's own tests' business.
 */
export async function stubChat() {
  const calls: { path: string; body: unknown }[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      calls.push({ path: (req.url ?? '').replace('/api/chat/internal/assistant', ''), body: raw ? JSON.parse(raw) : undefined });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { id: 'published-1', updated: true, saved: { membershipVersion: 2 } } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { url, calls, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

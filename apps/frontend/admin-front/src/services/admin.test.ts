import { afterEach, expect, it, vi } from 'vitest';
import { admin } from './admin';
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => ({ ADMIN_SERVICE_URL: 'https://admin-api.example.test' }) }));
afterEach(() => vi.unstubAllGlobals());
it('uses credentialed JSON requests without exposing a session token', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } })));
  vi.stubGlobal('fetch', fetcher);
  expect(await admin('/users', 'POST', { email: 'user@example.test' })).toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledWith('https://admin-api.example.test/api/admin/users', expect.objectContaining({ credentials: 'include', method: 'POST', body: JSON.stringify({ email: 'user@example.test' }) }));
});
it('surfaces authorization failures rather than rendering success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Platform administrator access required' }), { status: 403 })));
  await expect(admin('/users')).rejects.toThrow('Platform administrator access required');
});
it('reports a proxy error page as a readable failure, not a JSON parse error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
  await expect(admin('/users')).rejects.toThrow('HTTP error! status: 502');
});

import { z } from 'zod';

/**
 * The address the server will POST to for this browser. It is chosen by whoever registers it, so it is held to what
 * a real push service looks like: https, a public host name, no IP literal. Without that, registering
 * `http://auth-service:5001/...` would make this service send requests to the internal network.
 */
export function isPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)) return false;
  if (!host.includes('.') || /\.(local|localhost|internal|lan|home|corp)$/.test(host)) return false;
  return true;
}

const endpoint = z.string().max(2048).refine(isPushEndpoint, 'endpoint must be a public https push service address');

export const pushSubscriptionSchema = z.object({
  endpoint,
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(64) }),
  platform: z.string().max(40).optional()
});

export const unsubscribeSchema = z.object({ endpoint: z.string().max(2048) });

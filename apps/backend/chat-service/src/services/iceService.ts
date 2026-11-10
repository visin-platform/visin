import { fetchWithTimeout, logger } from '@visin/backend-core';
import { createHmac } from 'node:crypto';

/**
 * The ICE servers a browser needs to set up a call.
 *
 * Two people on different networks usually cannot reach each other directly, and a call between them then only
 * works through a TURN relay. Visin is self-hosted, so where the relay comes from is the operator's choice, and none
 * is required: calls degrade, chat never does. In order of preference:
 *
 * 1. `cloudflare`: Cloudflare's hosted relay (`CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_API_TOKEN`), credentials
 *    minted per request so the token never reaches a browser.
 * 2. `turn`: any relay that speaks the standard shared-secret scheme, coturn's `use-auth-secret` (`TURN_URLS` +
 *    `TURN_SECRET`), credentials minted here with no network call.
 * 3. `stun`: `STUN_URLS` only. Enough for most home and mobile networks.
 * 4. `local`: nothing. Browsers still connect on one machine or one local network.
 *
 * Nothing is built in: no third-party server is used unless the deployment names it.
 */
export type IceMode = 'cloudflare' | 'turn' | 'stun' | 'local';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceConfig {
  iceServers: IceServer[];
  /** Whether a relay is included. False means some networks will not connect. */
  relay: boolean;
  mode: IceMode;
  /** When the relay credentials stop working, for refreshing a long call. Null without a relay. */
  expiresAt: string | null;
}

/** Longer than any call, so a call does not lose its relay midway. */
export const CREDENTIAL_TTL_SECONDS = 6 * 60 * 60;
const REQUEST_TIMEOUT_MS = 5_000;

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/** Cloudflare also offers port 53, which browsers block: handing it over costs a candidate that times out. */
function withoutPort53(server: IceServer): IceServer | null {
  const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => !/:53(\?|$)/.test(url));
  return urls.length > 0 ? { ...server, urls } : null;
}

const stunServers = (): IceServer[] => {
  const urls = list(process.env.STUN_URLS);
  return urls.length > 0 ? [{ urls }] : [];
};

/** What this deployment is set up for, without asking anyone: for the settings page and the call screen's hints. */
export function iceMode(): IceMode {
  if (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) return 'cloudflare';
  if (list(process.env.TURN_URLS).length > 0 && process.env.TURN_SECRET) return 'turn';
  return stunServers().length > 0 ? 'stun' : 'local';
}

/** coturn's shared-secret scheme: the username carries its own expiry and the password is its HMAC. */
export function turnCredentials(secret: string, now = Date.now()) {
  const username = `${Math.floor(now / 1000) + CREDENTIAL_TTL_SECONDS}:visin`;
  return { username, credential: createHmac('sha1', secret).update(username).digest('base64') };
}

const expiry = () => new Date(Date.now() + CREDENTIAL_TTL_SECONDS * 1000).toISOString();

async function cloudflare(): Promise<IceConfig | null> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return null;
  try {
    const response = await fetchWithTimeout(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
        timeoutMs: REQUEST_TIMEOUT_MS,
        serviceName: 'cloudflare-turn'
      }
    );
    if (!response.ok) throw new Error(`Cloudflare TURN answered ${response.status}`);
    const json = (await response.json()) as { iceServers?: IceServer[] };
    const iceServers = (json.iceServers ?? []).map(withoutPort53).filter((server): server is IceServer => !!server);
    if (!iceServers.some((server) => server.username && server.credential))
      throw new Error('Cloudflare TURN answered without credentials');
    return { iceServers, relay: true, mode: 'cloudflare', expiresAt: expiry() };
  } catch (error) {
    // A relay that is down is a degraded call, not a broken one: the next tier is used.
    logger.warn('Could not get Cloudflare TURN credentials', { error: (error as Error).message });
    return null;
  }
}

function ownRelay(): IceConfig | null {
  const urls = list(process.env.TURN_URLS);
  const secret = process.env.TURN_SECRET;
  if (urls.length === 0 || !secret) return null;
  return {
    iceServers: [...stunServers(), { urls, ...turnCredentials(secret) }],
    relay: true,
    mode: 'turn',
    expiresAt: expiry()
  };
}

let warned = false;
/** Test seam: lets the "no relay" notice be logged again. */
export function resetIceWarnings(): void {
  warned = false;
}

export async function iceConfig(): Promise<IceConfig> {
  const relayed = (await cloudflare()) ?? ownRelay();
  if (relayed) return relayed;
  const iceServers = stunServers();
  if (!warned) {
    warned = true;
    logger.info('No TURN relay is configured; calls between some networks may not connect', {
      stun: iceServers.length > 0
    });
  }
  return { iceServers, relay: false, mode: iceServers.length > 0 ? 'stun' : 'local', expiresAt: null };
}

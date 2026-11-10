import { BlockList, isIP } from 'node:net';
import dns from 'node:dns';
import https from 'node:https';
import { BadRequestError, BadGatewayError, GatewayTimeoutError } from '@visin/backend-core';

/** Larger than almost any paper, smaller than what one request should be able to make this service hold. */
export const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TOTAL_TIMEOUT_MS = 45_000;

/** Addresses that are not the public internet: where a paper's address must never be allowed to point the server. */
const NOT_PUBLIC = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3]
] as const)
  NOT_PUBLIC.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['64:ff9b::', 96]
] as const)
  NOT_PUBLIC.addSubnet(net, prefix, 'ipv6');

/** Whether an address is somewhere on the public internet. An IPv4 address written inside an IPv6 one is judged as IPv4. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]);
  return !NOT_PUBLIC.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/**
 * Resolves a name for a connection, and refuses anything that is not public. It is the lookup the socket itself uses,
 * so the address checked is the address connected to: a name that answers differently a moment later cannot slip past.
 */
function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0);
    const allowed = (addresses as dns.LookupAddress[]).filter((entry) => isPublicAddress(entry.address));
    if (allowed.length === 0) {
      const refused: NodeJS.ErrnoException = new Error('That address is not on the public internet');
      refused.code = 'EPUBLICONLY';
      return callback(refused, '', 0);
    }
    if (options.all) return callback(null, allowed);
    return callback(null, allowed[0].address, allowed[0].family);
  });
}

/** The address as the server will use it: https only, on its own port, with no sign-in details inside it. */
export function checkedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestError('The PDF address is not valid');
  }
  if (url.protocol !== 'https:') throw new BadRequestError('The PDF address must be https');
  if (url.username || url.password) throw new BadRequestError('The PDF address must not contain a sign-in');
  if (url.port && url.port !== '443') throw new BadRequestError('The PDF address must use the standard port');
  if (isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0 && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, '')))
    throw new BadRequestError('The PDF address is not on the public internet');
  return url;
}

interface Fetched {
  bytes: Buffer;
  finalUrl: string;
}

function once(url: URL, signal: AbortSignal): Promise<{ status: number; location?: string; bytes?: Buffer }> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        lookup: guardedLookup as unknown as https.RequestOptions['lookup'],
        headers: { Accept: 'application/pdf', 'User-Agent': 'Visin paper reader (open-source research platform)' },
        signal
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          return resolve({ status, location: response.headers.location });
        }
        if (status !== 200) {
          response.resume();
          return resolve({ status });
        }
        const type = String(response.headers['content-type'] ?? '').toLowerCase();
        const length = Number(response.headers['content-length'] ?? 0);
        if (length > MAX_PDF_BYTES) {
          response.destroy();
          return reject(new BadRequestError('That PDF is too large to read'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_PDF_BYTES) {
            response.destroy();
            return reject(new BadRequestError('That PDF is too large to read'));
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const bytes = Buffer.concat(chunks);
          // A server that answers a PDF address with a web page (a paywall, a login) is not giving a PDF.
          if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-' || (type && !/pdf|octet-stream/.test(type)))
            return reject(new BadRequestError('That address did not return a PDF'));
          resolve({ status, bytes });
        });
        response.on('error', reject);
      }
    );
    request.on('error', reject);
  });
}

/**
 * Reads a PDF from a public address, for a paper whose owner gave one. The address is the owner's to give but the
 * request is this server's, so it goes only where the public internet is: https, a standard port, a name that
 * resolves to public addresses only (checked on the connection itself), a few redirects each held to the same rules,
 * a size ceiling and a deadline.
 */
export async function fetchPdf(address: string): Promise<Fetched> {
  const signal = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
  let url = checkedUrl(address);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const result = await once(url, signal);
      if (result.bytes) return { bytes: result.bytes, finalUrl: url.href };
      if (result.location) {
        url = checkedUrl(new URL(result.location, url).href);
        continue;
      }
      throw new BadGatewayError(`The PDF's server answered ${result.status}`);
    }
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof BadGatewayError) throw error;
    if (signal.aborted) throw new GatewayTimeoutError('The PDF took too long to download');
    if ((error as NodeJS.ErrnoException).code === 'EPUBLICONLY') throw new BadRequestError('The PDF address is not on the public internet');
    throw new BadGatewayError('The PDF could not be downloaded');
  }
  throw new BadGatewayError('The PDF address redirected too many times');
}

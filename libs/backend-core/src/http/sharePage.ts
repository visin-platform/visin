import type { Response } from 'express';

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text that is safe to put in HTML, in an attribute or between tags. */
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => ENTITIES[char]);

/**
 * The address of the web app, from this deployment's own settings (`SHELL_FRONT_URL`) and nothing else: a self-hosted
 * Visin must never send its users to someone else's. Unset (or not an http(s) address), there is no app to share
 * a link to, and the share pages answer 404.
 */
export function shellFrontUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env.SHELL_FRONT_URL?.trim().replace(/\/+$/, '');
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) &&
      parsed.hostname &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

/** A path in the app, as a full address; undefined where the app's address is not configured. */
export function appLink(path: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const base = shellFrontUrl(env);
  return base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : undefined;
}

/** Text collapsed to one line and cut to `max` characters, with an ellipsis where it was cut. */
export function excerpt(text: string, max = 200): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

export interface SharePage {
  title: string;
  description?: string;
  /** Where the page is in the app: what people are sent on to, and what a search engine should treat as the page. */
  url: string;
  /** A full address of a picture for the preview. */
  image?: string;
  siteName?: string;
}

/**
 * A tiny page that tells whatever unfurls a link (a chat, a social feed) what the link is about, and sends a person
 * on to the app. The app itself is client-rendered, so it has nothing for a crawler to read.
 *
 * Everything put in it is escaped, and `url` and `image` must be http(s). It asks to be left out of search
 * (`noindex`) and names the app's page as the canonical one, so the address that gets indexed is the page itself.
 */
export function renderSharePage({ title, description, url, image, siteName = 'Visin' }: SharePage): string {
  for (const address of [url, image]) {
    if (address !== undefined && !/^https?:\/\//i.test(address))
      throw new Error('A share page links only to http(s) addresses');
  }
  const t = escapeHtml(title);
  const u = escapeHtml(url);
  const meta = (attributes: string) => `    <meta ${attributes}>`;
  const lines = [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8">',
    `    <title>${t}</title>`,
    meta('name="robots" content="noindex"'),
    `    <link rel="canonical" href="${u}">`,
    meta('name="referrer" content="no-referrer"'),
    ...(description ? [meta(`name="description" content="${escapeHtml(description)}"`)] : []),
    meta(`property="og:site_name" content="${escapeHtml(siteName)}"`),
    meta('property="og:type" content="website"'),
    meta(`property="og:title" content="${t}"`),
    ...(description ? [meta(`property="og:description" content="${escapeHtml(description)}"`)] : []),
    meta(`property="og:url" content="${u}"`),
    ...(image ? [meta(`property="og:image" content="${escapeHtml(image)}"`)] : []),
    meta(`name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}"`),
    meta(`name="twitter:title" content="${t}"`),
    ...(description ? [meta(`name="twitter:description" content="${escapeHtml(description)}"`)] : []),
    ...(image ? [meta(`name="twitter:image" content="${escapeHtml(image)}"`)] : []),
    meta(`http-equiv="refresh" content="0; url=${u}"`),
    '  </head>',
    `  <body><p>Opening <a href="${u}">${t}</a>…</p></body>`,
    '</html>',
    ''
  ];
  return lines.join('\n');
}

/**
 * Sends a share page. Never kept by anything on the way (what is shared can be made private), and shut down to
 * what it is: markup with no scripts, styles or subresources of its own.
 */
export function sendSharePage(res: Response, page: SharePage): void {
  res
    .status(200)
    .set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    })
    .send(renderSharePage(page));
}

import { NAVIGATE_EVENT } from './screen';

/**
 * Whether a click on a link inside an answer should change the page beside the chat rather than leave it. Only a plain
 * click on a path of this app (`/projects/...`): a new tab, a modified click or another site is the browser's own.
 */
export function inAppPath(event: {
  defaultPrevented?: boolean;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target: EventTarget | null;
}): string | undefined {
  if (event.defaultPrevented || (event.button ?? 0) !== 0) return undefined;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return undefined;
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link || link.hasAttribute('download')) return undefined;
  const target = link.getAttribute('target');
  if (target && target !== '_self') return undefined;
  const href = link.getAttribute('href') ?? '';
  // "/x" is this app; "//x" is another site, and so is anything with a scheme.
  return href.startsWith('/') && !href.startsWith('//') ? href : undefined;
}

/**
 * Moves the page beside the chat to `path` without a reload, which would close the panel and lose the thread. The
 * shell's router makes the move, so history and scroll positions stay its own.
 */
export function openBesideChat(path: string): void {
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: path }));
}

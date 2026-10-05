import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export interface PageMeta {
  title: string;
  description?: string;
  /** Part of the address that makes it a different page (`?page=2`), kept in the canonical; anything else is dropped. */
  search?: string;
  /** Asks search engines to leave the page out, for an address that shows nothing (a soft 404). */
  noindex?: boolean;
}

/**
 * Sets one `<head>` tag for as long as the page is shown, and returns the way back. A tag the shell's `index.html`
 * already has is changed in place and put back after, so a page never ends up with two descriptions; one it lacks is
 * added and removed.
 */
function setHead(selector: string, attributes: Record<string, string>, valueAttribute: string): () => void {
  const existing = document.head.querySelector(selector);
  if (existing) {
    const previous = existing.getAttribute(valueAttribute);
    existing.setAttribute(valueAttribute, attributes[valueAttribute]);
    return () => {
      if (previous === null) existing.removeAttribute(valueAttribute);
      else existing.setAttribute(valueAttribute, previous);
    };
  }
  const tag = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
  for (const [name, value] of Object.entries(attributes)) tag.setAttribute(name, value);
  document.head.appendChild(tag);
  return () => tag.remove();
}

/**
 * Gives the current page its own title, description and canonical address. The shell is client-rendered, so this is
 * what a crawler that runs the page (Googlebot does) reads in place of the shell's one-size-fits-all head. The
 * canonical is this page's own address without its query or fragment, so tracking parameters never make a copy; a
 * page that is one of several (`search`, as in `?page=2`) says which.
 *
 * Pass `null` while the page is not known yet; what the page had before comes back on unmount.
 */
export function usePageMeta(meta: PageMeta | null): void {
  const title = meta?.title;
  const description = meta?.description;
  const noindex = meta?.noindex;
  const search = meta?.search ?? '';
  const { pathname } = useLocation();

  useEffect(() => {
    if (title === undefined) return;
    const previousTitle = document.title;
    document.title = title;
    const canonical = `${window.location.origin}${pathname}${search}`;
    const undo = [
      setHead('link[rel="canonical"]', { rel: 'canonical', href: canonical }, 'href'),
      setHead('meta[property="og:title"]', { property: 'og:title', content: title }, 'content'),
      setHead('meta[property="og:url"]', { property: 'og:url', content: canonical }, 'content')
    ];
    if (description) {
      undo.push(
        setHead('meta[name="description"]', { name: 'description', content: description }, 'content'),
        setHead('meta[property="og:description"]', { property: 'og:description', content: description }, 'content')
      );
    }
    if (noindex) undo.push(setHead('meta[name="robots"]', { name: 'robots', content: 'noindex' }, 'content'));
    return () => {
      document.title = previousTitle;
      // Last in, first out, so a tag that was added over another gives it back.
      undo.reverse().forEach((restore) => restore());
    };
  }, [title, description, noindex, search, pathname]);
}

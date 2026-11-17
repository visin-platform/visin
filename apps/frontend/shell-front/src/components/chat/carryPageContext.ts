import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** What a page publishes about itself for the analyst (vision-front's `usePageChatContext`), and withdraws on leaving. */
const PAGE_CONTEXT_EVENT = 'visin:page-context';

type ContextWindow = Window & { __visinPageContext?: unknown };

/**
 * On a phone, chat is a tab: tapping it leaves the run or project page, which withdraws what it told the analyst before
 * chat has even loaded. So the shell keeps what the page last published, with the path it was published on, and hands
 * it to chat when chat is opened straight from that page — for "Ask about this" and for what the analyst sees — and
 * takes it back when chat is left. From anywhere else (Home, a page with nothing to say) chat opens with nothing.
 */
export function useCarriedPageContext(active: boolean): void {
  const { pathname } = useLocation();
  const path = useRef(pathname);
  path.current = pathname;
  const previous = useRef<string | undefined>(undefined);
  const published = useRef<{ context: unknown; path: string } | null>(null);
  const carried = useRef<unknown>(null);

  // The path before this one: the cleanup runs with the path being left.
  useEffect(() => () => void (previous.current = pathname), [pathname]);

  useEffect(() => {
    const receive = (event: Event) => {
      const context = (event as CustomEvent<unknown>).detail;
      if (context && context !== carried.current) published.current = { context, path: path.current };
    };
    window.addEventListener(PAGE_CONTEXT_EVENT, receive);
    return () => window.removeEventListener(PAGE_CONTEXT_EVENT, receive);
  }, []);

  useEffect(() => {
    if (!active) return;
    const from = published.current;
    const target = window as ContextWindow;
    if (!from || from.path !== previous.current || target.__visinPageContext) return;
    carried.current = from.context;
    target.__visinPageContext = from.context;
    window.dispatchEvent(new CustomEvent(PAGE_CONTEXT_EVENT, { detail: from.context }));
    return () => {
      carried.current = null;
      if (target.__visinPageContext !== from.context) return;
      delete target.__visinPageContext;
      window.dispatchEvent(new CustomEvent(PAGE_CONTEXT_EVENT, { detail: null }));
    };
  }, [active]);
}

import { useEffect, useRef, useState } from 'react';
import type { Conversation, OpenRequest, PageContext } from '../types/chat';
import { OPEN_EVENT, PAGE_CONTEXT_EVENT, contextKey, requestFromUrl } from '../utils/chatContext';

export function usePageChatContext({
  panel,
  loaded,
  enabled,
  current,
  composing,
  handle,
  analyze
}: {
  panel: boolean;
  loaded: boolean;
  enabled: boolean;
  current?: Conversation;
  composing: boolean;
  handle: (request: OpenRequest) => void | Promise<void>;
  analyze: (context: PageContext) => void;
}) {
  const [pageContext, setPageContext] = useState<PageContext | undefined>(() => window.__visinPageContext);

  const [request, setRequest] = useState<OpenRequest>();
  const latest = useRef({ current, composing });
  useEffect(() => {
    latest.current = { current, composing };
  });
  useEffect(() => {
    const onPage = (event: Event) => setPageContext((event as CustomEvent<PageContext | null>).detail ?? undefined);
    const onOpen = (event: Event) => {
      const value = (event as CustomEvent<OpenRequest>).detail;
      if (!value) return;
      delete window.__visinChatContext;
      setRequest(value);
    };
    window.addEventListener(PAGE_CONTEXT_EVENT, onPage);
    window.addEventListener(OPEN_EVENT, onOpen);
    // A newly loaded chat takes the most recent request, or the full page's address.
    const waiting = window.__visinChatContext ?? (panel ? undefined : requestFromUrl());
    delete window.__visinChatContext;
    if (waiting) setRequest(waiting);
    return () => {
      window.removeEventListener(PAGE_CONTEXT_EVENT, onPage);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [panel]);

  useEffect(() => {
    if (!loaded || !request) return;
    setRequest(undefined);
    void handle(request);
  }, [loaded, request, handle]);

  const pageKey = contextKey(pageContext);

  useEffect(() => {
    if (!loaded || !enabled || !pageKey || !pageContext) return;
    const { current, composing } = latest.current;
    if (composing || (current && current.kind !== 'assistant')) return;
    analyze(pageContext);
    // Follows the page, not each new copy of the same context.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, enabled, pageKey, analyze]);
  return pageContext;
}

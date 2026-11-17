import { useEffect, useRef, useState } from 'react';
import type { Conversation, OpenRequest, PageContext } from '../types/chat';
import { OPEN_EVENT, PAGE_CONTEXT_EVENT, analysisOf, contextKey, requestFromUrl } from '../utils/chatContext';
import { forgetRequestedProject, rememberRequestedProject } from '../components/guest/requested';

export function usePageChatContext({
  panel,
  loaded,
  enabled,
  current,
  composing,
  pending,
  handle,
  analyze
}: {
  panel: boolean;
  loaded: boolean;
  enabled: boolean;
  current?: Conversation;
  composing: boolean;
  /** An empty chat with an assistant is open, waiting for its first question. */
  pending?: PageContext;
  handle: (request: OpenRequest) => void | Promise<void>;
  analyze: (context: PageContext) => void;
}) {
  const [pageContext, setPageContext] = useState<PageContext | undefined>(() => window.__visinPageContext);

  const [request, setRequest] = useState<OpenRequest>();
  const latest = useRef({ current, composing, pending });
  useEffect(() => {
    latest.current = { current, composing, pending };
  });
  useEffect(() => {
    const onPage = (event: Event) => {
      const context = (event as CustomEvent<PageContext | null>).detail;
      if (context?.projectId) rememberRequestedProject(context);
      else forgetRequestedProject();
      setPageContext(context ?? undefined);
    };
    const onOpen = (event: Event) => {
      const value = (event as CustomEvent<OpenRequest>).detail;
      if (!value) return;
      // What the person asked about is what their next question is about, until the page they are on says otherwise.
      const asked = analysisOf(value);
      if (asked?.projectId || asked?.paperId) setPageContext(asked);
      // A visitor has no conversation to open it in: the guest panel uses the project, if there is one.
      rememberRequestedProject(value);
      delete window.__visinChatContext;
      setRequest(value);
    };
    window.addEventListener(PAGE_CONTEXT_EVENT, onPage);
    window.addEventListener(OPEN_EVENT, onOpen);
    // A newly loaded chat takes the most recent request, or the full page's address.
    const waiting = window.__visinChatContext ?? (panel ? undefined : requestFromUrl());
    delete window.__visinChatContext;
    if (waiting) {
      rememberRequestedProject(waiting);
      setRequest(waiting);
    }
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
    if (!loaded || !enabled || !pageKey) return;
    // The chat never switches because the page did: the person keeps asking the same assistant while they move
    // around, and each question carries the page it was asked on. Only a chat panel with nothing open opens it.
    const { current, composing, pending } = latest.current;
    if (composing || current || pending) return;
    analyze({});
    // Follows the page, not each new copy of the same context.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, enabled, pageKey, analyze]);
  return pageContext;
}

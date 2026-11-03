import { useEffect } from 'react';

/** What the page is about, as chat's analyst reads it. */
export interface PageChatContext {
  projectId: string;
  trainingIds: string[];
  title: string;
  projectName?: string;
}

type ChatWindow = Window & { __visinPageContext?: PageChatContext };

/**
 * Tells chat what this page is about, so opening it here brings up the analysis of this run,
 * comparison or project. Published while the page is shown, and withdrawn when it is left.
 * Only a hint: chat re-checks access to everything it is given.
 */
export function usePageChatContext(context: PageChatContext | undefined) {
  // By value: a new object with the same contents on each render is the same page.
  const key = context
    ? JSON.stringify([context.projectId, context.trainingIds, context.title, context.projectName ?? null])
    : '';
  useEffect(() => {
    if (!key) return;
    const [projectId, trainingIds, title, projectName] = JSON.parse(key) as [string, string[], string, string | null];
    const detail: PageChatContext = { projectId, trainingIds, title, ...(projectName ? { projectName } : {}) };
    const chatWindow = window as ChatWindow;
    chatWindow.__visinPageContext = detail;
    window.dispatchEvent(new CustomEvent('visin:page-context', { detail }));
    return () => {
      // Only its own: the next page may already have published.
      if (chatWindow.__visinPageContext !== detail) return;
      delete chatWindow.__visinPageContext;
      window.dispatchEvent(new CustomEvent('visin:page-context', { detail: null }));
    };
  }, [key]);
}

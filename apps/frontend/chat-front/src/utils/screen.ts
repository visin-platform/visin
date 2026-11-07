/**
 * The analyst changing the page beside the chat. Chat runs in the shell's side panel and cannot
 * navigate, so a call goes out as a window event and the shell answers with another (the same
 * pattern as `visin:chat-context`). The shell owns the routes and checks what it is asked for.
 */
export interface ScreenCall {
  id: string;
  place: string;
  params: Record<string, unknown>;
}
export interface ScreenResult {
  ok: boolean;
  summary: string;
}

declare global {
  interface Window {
    __visinChatTabId?: string;
    __visinScreenActions?: { name: 'open_frame'; ids: string[]; labels?: string[] }[];
  }
}

/** How long the shell has to answer; the server gives up on the call after 20 s. */
export const SCREEN_ANSWER_MS = 10000;

/** One per page load, including hot reloads and duplicated remote modules. Never shared across browser tabs. */
export const TAB_ID = (window.__visinChatTabId ??= (
  crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`
).replaceAll('-', ''));

/** What a message says about the page beside it: sent from the side panel only. */
export function screenContext(panel: boolean) {
  if (!panel) return undefined;
  const actions = window.__visinScreenActions?.filter((a) => a.name === 'open_frame').slice(0, 1);
  return {
    ...(actions?.length ? { actions } : {}),
    allowActions: true,
    tabId: TAB_ID,
    path: `${window.location.pathname}${window.location.search}`.slice(0, 500)
  };
}

/** Asks the shell to show a place and resolves with what it did, or why it could not. */
export function showOnScreen(call: ScreenCall): Promise<ScreenResult> {
  return new Promise((resolve) => {
    const finish = (result: ScreenResult) => {
      clearTimeout(timer);
      window.removeEventListener('visin:screen-done', answered);
      resolve(result);
    };
    const answered = (event: Event) => {
      const detail = (event as CustomEvent<Partial<ScreenResult> & { id?: string }>).detail;
      if (detail?.id !== call.id) return;
      finish({ ok: detail.ok === true, summary: String(detail.summary ?? '').slice(0, 200) });
    };
    const timer = setTimeout(() => finish({ ok: false, summary: 'The page did not respond' }), SCREEN_ANSWER_MS);
    window.addEventListener('visin:screen-done', answered);
    window.dispatchEvent(new CustomEvent('visin:screen', { detail: call }));
  });
}

/** The calls in a `screen` stream event, ignoring anything that is not shaped like one. */
export function parseScreenCalls(data: string): ScreenCall[] {
  try {
    const value: unknown = JSON.parse(data);
    if (!Array.isArray(value)) return [];
    return value.flatMap((c): ScreenCall[] => {
      if (typeof c?.id !== 'string' || typeof c.place !== 'string') return [];
      // MongoDB can omit empty objects; older servers then omit params for index pages.
      const params = c.params === undefined ? {} : c.params;
      if (typeof params !== 'object' || params === null || Array.isArray(params)) return [];
      return [{ id: c.id, place: c.place, params }];
    });
  } catch {
    return [];
  }
}

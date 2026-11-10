import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { describePlace, resolvePlace } from './screen';

/** What the analyst just did to the page, for the person watching to see, and to take back where it can be. */
export interface ScreenCue {
  /** A new one each time, so the same thing twice is seen twice. */
  id: number;
  /** "the run’s Epochs tab": what it opened. */
  what: string;
  /** Where the page was before, to go back to. Absent for a change that has no back (a frame opened in place). */
  undoTo?: string;
}

let cues = 0;

/**
 * Lets the chat analyst change the page beside the conversation. Chat runs as a remote with no router
 * of its own, so it asks with `visin:screen` and hears back with `visin:screen-done`.
 * Only while the side panel is showing: a phone or the full chat page has no page beside the chat.
 */
export function useScreenCalls(panelOpen: boolean, onCue?: (cue: ScreenCue) => void) {
  const navigate = useNavigate();
  // Where the page is now, kept current without restarting the listener on every move.
  const location = useLocation();
  const here = useRef('');
  here.current = `${location.pathname}${location.search}`;
  useEffect(() => {
    const receive = (event: Event) => {
      const call = (event as CustomEvent<{ id?: unknown; place?: unknown; params?: unknown }>).detail;
      if (typeof call?.id !== 'string') return;
      const answer = (ok: boolean, summary: string) =>
        window.dispatchEvent(new CustomEvent('visin:screen-done', { detail: { id: call.id, ok, summary } }));
      if (!panelOpen) {
        answer(false, 'There is no page beside the chat here');
        return;
      }
      const params = typeof call.params === 'object' && call.params !== null ? call.params : {};
      if (call.place === 'action') {
        const input = params as Record<string, unknown>;
        if (
          input.action !== 'open_frame' ||
          typeof input.id !== 'string' ||
          !/^(?:[a-f\d]{24}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i.test(input.id) ||
          Object.keys(input).some((key) => !['action', 'id'].includes(key))
        ) {
          answer(false, 'That page action is not valid');
          return;
        }
        const detail: { action: string; id: string; result?: { ok: boolean; summary: string } } = {
          action: input.action,
          id: input.id
        };
        window.dispatchEvent(new CustomEvent('visin:page-action', { detail }));
        if (detail.result?.ok === true) onCue?.({ id: ++cues, what: describePlace('action', params) });
        answer(detail.result?.ok === true, detail.result?.summary || 'That action is not available on this page');
        return;
      }
      const outcome = resolvePlace({ ...params, place: call.place });
      if (outcome.ok) {
        const before = here.current;
        window.dispatchEvent(new CustomEvent('visin:screen-navigation', { detail: outcome.path }));
        navigate(outcome.path);
        onCue?.({
          id: ++cues,
          what: describePlace(call.place, params),
          ...(before === outcome.path ? {} : { undoTo: before })
        });
      }
      answer(outcome.ok, outcome.summary);
    };
    window.addEventListener('visin:screen', receive);
    return () => window.removeEventListener('visin:screen', receive);
  }, [panelOpen, navigate, onCue]);
}

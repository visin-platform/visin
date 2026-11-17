import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** chat-front says whether a conversation (or a new one being written) is showing, rather than the list. */
export const CHAT_DETAIL_EVENT = 'visin:chat-detail';
/** The shell asks chat-front to show its list, as the phone's back button does. */
export const CHAT_LIST_EVENT = 'visin:chat-show-list';

/** What the address carries while a conversation is open on a phone, so that one step back is the list. */
const THREAD_PARAM = 'thread';

/**
 * On a phone: whether a conversation is open, and the browser's back button going from it to the list rather than out
 * of chat. chat-front keeps the open conversation in its own state; this gives it one history entry (`?thread=1`)
 * while it is open and tells it to show the list when that entry is popped. Closing it with the arrow in the thread
 * pops the entry again, so the history never grows with each conversation read. `active` is false anywhere else, where
 * nothing is listened to and nothing is pushed.
 */
export function useChatThread(active: boolean): boolean {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const inUrl = new URLSearchParams(search).has(THREAD_PARAM);
  const [detail, setDetail] = useState(false);
  const was = useRef({ detail: false, inUrl });
  const latest = useRef({ pathname, inUrl, detail });
  latest.current = { pathname, inUrl, detail };

  useEffect(() => {
    if (!active) {
      setDetail(false);
      was.current.detail = false;
      return;
    }
    const receive = (event: Event) => setDetail(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(CHAT_DETAIL_EVENT, receive);
    return () => window.removeEventListener(CHAT_DETAIL_EVENT, receive);
  }, [active]);

  // A conversation opened: one entry for it. One closed: take that entry off again.
  useEffect(() => {
    if (!active) return;
    const { inUrl: threadInUrl, pathname: path } = latest.current;
    if (detail && !was.current.detail && !threadInUrl) navigate({ pathname: path, search: `?${THREAD_PARAM}=1` });
    if (!detail && was.current.detail && threadInUrl) {
      const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (index > 0) navigate(-1);
      else navigate({ pathname: path, search: '' }, { replace: true });
    }
    was.current.detail = detail;
  }, [active, detail, navigate]);

  // Back pressed: the entry went while a conversation was still showing.
  useEffect(() => {
    if (!active) return;
    if (was.current.inUrl && !inUrl && latest.current.detail) window.dispatchEvent(new Event(CHAT_LIST_EVENT));
    was.current.inUrl = inUrl;
  }, [active, inUrl]);

  return active && detail;
}

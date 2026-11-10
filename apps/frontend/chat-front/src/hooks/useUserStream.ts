import { useEffect, useRef } from 'react';
import { getGlobalConfig } from '../config/ConfigProvider';
import type { ChatEvent } from '../types/call';

/** The longest a refused or dropped stream waits before trying again. */
const MAX_RETRY_MS = 30_000;

/**
 * The person-level event stream (`/events`): calls ringing, answered, ended, and the signals of the call this tab is
 * on. One per open tab, identified by `deviceId`.
 *
 * The browser reconnects a stream that dropped by itself. One the server refused (the session ran out, the server
 * restarted mid-deploy) is closed for good by the browser, so it is opened again here, with a growing pause. Every
 * (re)connection calls `onOpen`, which is where a caller catches up with anything missed while it was down.
 */
export function useUserStream({
  enabled,
  deviceId,
  onEvent,
  onOpen
}: {
  enabled: boolean;
  deviceId: string;
  onEvent: (event: ChatEvent) => void;
  onOpen?: () => void;
}): void {
  const handlers = useRef({ onEvent, onOpen });
  handlers.current = { onEvent, onOpen };

  useEffect(() => {
    const base = getGlobalConfig().CHAT_SERVICE_URL?.replace(/\/$/, '');
    if (!enabled || !base || typeof EventSource === 'undefined') return;
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let closed = false;

    const connect = () => {
      const stream = new EventSource(`${base}/api/chat/events?device=${encodeURIComponent(deviceId)}`, {
        withCredentials: true
      });
      source = stream;
      stream.addEventListener('open', () => {
        attempts = 0;
        handlers.current.onOpen?.();
      });
      stream.addEventListener('call', (message) => {
        try {
          handlers.current.onEvent(JSON.parse((message as MessageEvent<string>).data) as ChatEvent);
        } catch {
          // A frame that is not an event is not worth ending a call over.
        }
      });
      stream.addEventListener('error', () => {
        if (closed || stream.readyState !== EventSource.CLOSED) return;
        stream.close();
        retry = setTimeout(connect, Math.min(MAX_RETRY_MS, 2000 * 2 ** attempts++));
      });
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      source?.close();
    };
  }, [enabled, deviceId]);
}

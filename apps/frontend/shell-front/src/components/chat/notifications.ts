import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Sent before signing out so chat can let go of this device's notifications while the session still works. */
export const LOGOUT_EVENT = 'visin:logout';
/** Tells a chat that is already open to show a conversation (one that is not open reads its address instead). */
export const CHAT_OPEN_EVENT = 'visin:chat-open';
/** The longest signing out waits for those tasks. Signing out must never hang on a notification setting. */
const LOGOUT_WAIT_MS = 3000;

/** Runs whatever must happen before the session ends, within a bounded time. */
export async function beforeLogout(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  window.dispatchEvent(new CustomEvent(LOGOUT_EVENT, { detail: { tasks } }));
  if (tasks.length === 0) return;
  await Promise.race([Promise.allSettled(tasks), new Promise((resolve) => setTimeout(resolve, LOGOUT_WAIT_MS))]);
}

/** An address inside this app: the service worker's word is not trusted to send the page anywhere else. */
export function internalPath(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : null;
}

/**
 * Tapping a notification while Visin is open routes the page in place (the worker posts the address), so a
 * half-typed message and the loaded apps survive. A chat that is already open is told which conversation.
 */
export function useNotificationNavigation(): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Kept, so the same object is let go of: the property can be gone by the time this cleans up.
    const worker = navigator.serviceWorker;
    const receive = (event: MessageEvent) => {
      const path = event.data?.type === 'NAVIGATE' ? internalPath(event.data.url) : null;
      if (!path) return;
      navigate(path);
      const conversation = new URL(path, window.location.origin).searchParams.get('conversation');
      if (conversation) window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT, { detail: conversation }));
    };
    worker.addEventListener('message', receive);
    return () => worker.removeEventListener('message', receive);
  }, [navigate]);
}

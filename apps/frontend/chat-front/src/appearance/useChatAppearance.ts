import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_APPEARANCE, parseAppearance, type ChatAppearance } from './chatAppearance';
const EVENT = 'visin:chat-appearance';
// Private browsing can deny storage: keep choices usable for this visit anyway.
const memory = new Map<string, string>();
function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(EVENT, listener);
  };
}
export function useChatAppearance(userId?: string) {
  const key = `visin.chat.appearance.v1:${userId ?? 'guest'}`;
  const snapshot = useCallback(() => read(key), [key]);
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const settings = useMemo(() => parseAppearance(raw), [raw]);
  const update = useCallback(
    (patch: Partial<ChatAppearance>) => {
      const next = JSON.stringify({ ...parseAppearance(read(key)), ...patch });
      try {
        localStorage.setItem(key, next);
        memory.delete(key);
      } catch {
        memory.set(key, next);
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key]
  );
  const reset = useCallback(() => update(DEFAULT_APPEARANCE), [update]);
  return { settings, update, reset };
}

import { useEffect, useRef } from 'react';

export interface PageActionResult {
  ok: boolean;
  summary: string;
}
interface Registration {
  name: 'open_frame';
  ids: string[];
  labels?: string[];
}
declare global {
  interface Window {
    __visinScreenActions?: Registration[];
  }
}
const registrations = new Map<symbol, Registration>();
const publish = () => {
  window.__visinScreenActions = [...registrations.values()];
};

/**
 * Page-owned actions are advertised only while their component is mounted. No arbitrary method calls.
 * Callers pass fresh arrays and closures on every render; the registration changes only when the frames
 * themselves do, and the latest `open` is the one called.
 */
export function useScreenAction(ids: string[], open: (id: string) => PageActionResult, labels?: string[]) {
  const latest = useRef(open);
  useEffect(() => {
    latest.current = open;
  });
  const idKey = JSON.stringify(ids.slice(0, 100));
  const labelKey = labels ? JSON.stringify(labels.slice(0, 100).map((label) => label.slice(0, 200))) : undefined;
  useEffect(() => {
    const frameIds = JSON.parse(idKey) as string[];
    // A page with nothing loaded has nothing to offer: the chat is told of no action rather than an empty one.
    if (!frameIds.length) return;
    const key = Symbol();
    registrations.set(key, {
      name: 'open_frame',
      ids: frameIds,
      ...(labelKey ? { labels: JSON.parse(labelKey) as string[] } : {})
    });
    publish();
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: unknown; id?: unknown; result?: PageActionResult }>).detail;
      if (
        detail?.result ||
        detail?.action !== 'open_frame' ||
        typeof detail.id !== 'string' ||
        !frameIds.includes(detail.id)
      )
        return;
      detail.result = latest.current(detail.id);
    };
    window.addEventListener('visin:page-action', receive);
    return () => {
      window.removeEventListener('visin:page-action', receive);
      registrations.delete(key);
      publish();
    };
  }, [idKey, labelKey]);
}

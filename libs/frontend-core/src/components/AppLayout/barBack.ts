import { useSyncExternalStore } from 'react';

declare global {
  interface Window {
    /** Where the phone's app bar says "back" leads, while it shows one: for a page that would offer the same link. */
    __visinBarBack?: BarBack;
  }
}

const EVENT = 'visin:bar-back';

/** The app bar's way back: where it leads and what it is called. */
export interface BarBack {
  path: string;
  label: string;
}

/**
 * Tells pages where the app bar's way back goes. The bar and a page's own back link (a breadcrumb) are drawn by
 * different bundles when a front runs inside the shell, which share no React context, so this is a window value and an
 * event, as the shell does for the rest of what a remote cannot reach.
 */
export function publishBarBack(back: BarBack | undefined): void {
  const current = typeof window === 'undefined' ? undefined : window.__visinBarBack;
  if (typeof window === 'undefined' || (current?.path === back?.path && current?.label === back?.label)) return;
  window.__visinBarBack = back;
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (listener: () => void) => {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
};

/**
 * Where the app bar's back link leads, and what it says, if it shows one. A page leaves its own link out when it
 * goes to the same place or says the same thing.
 */
export function useBarBack(): BarBack | undefined {
  return useSyncExternalStore(
    subscribe,
    () => window.__visinBarBack,
    () => undefined
  );
}

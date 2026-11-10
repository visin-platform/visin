import { useCallback, useState } from 'react';

export interface GuestAnswer {
  id: string;
  question: string;
  project: string;
  /** What Vivi said; absent for a question that failed. */
  answer?: string;
  error?: string;
  /** When it was asked, in ms: how a conversation ages out. */
  at?: number;
}

const KEY = 'visin.guest.vivi';
const KEPT = 20;
/** A returning visitor finds the conversation for a month; after that it is gone, whether or not they come back. */
export const KEPT_FOR_MS = 30 * 24 * 60 * 60 * 1000;

function load(now = Date.now()): GuestAnswer[] {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    // An entry without a time (from before they were timed) is kept for now and stamped on its next save.
    return stored.filter((item: GuestAnswer) => !item.at || now - item.at < KEPT_FOR_MS).slice(-KEPT);
  } catch {
    return [];
  }
}

function save(items: GuestAnswer[]) {
  try {
    if (items.length) localStorage.setItem(KEY, JSON.stringify(items));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode or a full store: the conversation lasts as long as the panel is open.
  }
}

/**
 * The visitor's conversation with Vivi, kept in this browser so that coming back tomorrow (or next week) finds it
 * where it was, with no account. Local storage and not the server: a guest has no identity there, the server keeps a
 * guest's runs for a day only to answer a reload, and a conversation that stays on the device it was had on is the
 * easiest kind to explain. `clear` wipes it, for a shared computer.
 */
export function useGuestHistory() {
  const [items, setItems] = useState<GuestAnswer[]>(() => load());
  const add = useCallback((item: GuestAnswer) => {
    setItems((current) => {
      // Another tab may have added to the conversation since this one loaded it: keep both.
      const known = new Map([...load(), ...current].map((existing) => [existing.id, existing]));
      known.delete(item.id);
      const next = [...known.values(), { at: Date.now(), ...item }]
        .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
        .slice(-KEPT);
      save(next);
      return next;
    });
  }, []);
  const clear = useCallback(() => {
    save([]);
    setItems([]);
  }, []);
  return { items, add, clear };
}

import { useEffect, useSyncExternalStore } from 'react';

/** What can be visited again: the pages a person comes back to. */
export type VisitKind = 'project' | 'dataset' | 'training' | 'person' | 'group';

export interface Visit {
  kind: VisitKind;
  /** With `kind`, what identifies it: opening the same thing again moves it to the front rather than adding a second. */
  id: string;
  name: string;
  /** Where it is, as a path within the app. */
  path: string;
  /** Milliseconds since the epoch. */
  visitedAt: number;
}

const KEY = 'visin-recent';
/** The browser's own copy changed: the one event every copy of this module (the shell's, each remote's) listens for. */
const CHANGED = 'visin:recent-visits';
const MAX_VISITS = 10;
const KINDS: readonly string[] = ['project', 'dataset', 'training', 'person', 'group'];

const isVisit = (value: unknown): value is Visit => {
  const visit = value as Visit | null;
  return (
    typeof visit === 'object' &&
    visit !== null &&
    KINDS.includes(visit.kind) &&
    typeof visit.id === 'string' &&
    typeof visit.name === 'string' &&
    typeof visit.path === 'string' &&
    visit.path.startsWith('/') &&
    typeof visit.visitedAt === 'number'
  );
};

// Per-browser, never sent anywhere, and allowed to be unavailable (a private window, blocked storage): every read
// and write is guarded, and the list is simply empty then.
const readRaw = (): string => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

const parse = (raw: string): Visit[] => {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isVisit).sort((a, b) => b.visitedAt - a.visitedAt).slice(0, MAX_VISITS) : [];
  } catch {
    return [];
  }
};

/** The visits, newest first. */
export const readVisits = (): Visit[] => parse(readRaw());

const write = (visits: Visit[]): void => {
  try {
    if (visits.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(visits));
  } catch {
    // Nowhere to keep it: the list stays empty, and nothing else depends on it.
  }
  window.dispatchEvent(new Event(CHANGED));
};

/** Opening something again moves it to the front; the oldest fall off past ten. */
export function recordVisit(visit: Omit<Visit, 'visitedAt'>, now = Date.now()): void {
  const others = readVisits().filter((held) => !(held.kind === visit.kind && held.id === visit.id));
  write([{ ...visit, visitedAt: now }, ...others].slice(0, MAX_VISITS));
}

/** Forgets everything. Also what signing out does, so the next person at this browser does not read the last one's. */
export function clearVisits(): void {
  write([]);
}

let snapshot: { raw: string; visits: Visit[] } = { raw: '', visits: [] };
const getSnapshot = (): Visit[] => {
  const raw = readRaw();
  if (raw !== snapshot.raw) snapshot = { raw, visits: parse(raw) };
  return snapshot.visits;
};
const subscribe = (listener: () => void): (() => void) => {
  window.addEventListener(CHANGED, listener);
  // Another tab's change.
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGED, listener);
    window.removeEventListener('storage', listener);
  };
};
const empty: Visit[] = [];

/** What this browser has visited lately, newest first, kept up to date across tabs and across the apps on the page. */
export function useRecentVisits(): Visit[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => empty);
}

/**
 * Notes that the page showing `visit` was opened. Call it once what is shown has loaded (pass `null` until then):
 * the name is what the list will say, so a page that is still loading has none to give.
 */
export function useTrackVisit(visit: Omit<Visit, 'visitedAt'> | null): void {
  const kind = visit?.kind;
  const id = visit?.id;
  const name = visit?.name;
  const path = visit?.path;
  useEffect(() => {
    if (kind && id && name && path) recordVisit({ kind, id, name, path });
  }, [kind, id, name, path]);
}

import { useEffect, useSyncExternalStore } from 'react';
import type { PublicProject } from './ProjectPicker';

/**
 * The public project a page asked Vivi about ("Ask Vivi about this project"). The chat's page-context hook takes the
 * request off `window` as soon as it has read it, often before a visitor's panel has even drawn, so the project is
 * kept here for the guest panel to pick up whenever it appears, and to hear about a newer one.
 */
let requested: PublicProject | null = null;
const listeners = new Set<() => void>();

export function rememberRequestedProject(request: unknown): void {
  const { projectId, title } = (request ?? {}) as { projectId?: unknown; title?: unknown };
  if (typeof projectId !== 'string' || !projectId) return;
  const name = typeof title === 'string' && title ? title : 'This project';
  if (requested?.id === projectId && requested.name === name) return;
  requested = { id: projectId, name };
  listeners.forEach((listener) => listener());
}

export function forgetRequestedProject(): void {
  if (!requested) return;
  requested = null;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useRequestedProject = (): PublicProject | null => {
  useEffect(() => {
    const onPage = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.projectId) rememberRequestedProject(detail);
      else forgetRequestedProject();
    };
    if (!requested && window.__visinPageContext) rememberRequestedProject(window.__visinPageContext);
    window.addEventListener('visin:page-context', onPage);
    return () => window.removeEventListener('visin:page-context', onPage);
  }, []);
  return useSyncExternalStore(subscribe, () => requested);
};

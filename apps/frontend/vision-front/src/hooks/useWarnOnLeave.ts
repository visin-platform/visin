import { useEffect } from 'react';

/**
 * Ask before the tab closes or reloads while `active` — the browser's own
 * "Leave site?" prompt, which is all a page may show there. For work that lives
 * in this tab, like the bytes of an upload; not for work the server finishes.
 */
export const useWarnOnLeave = (active: boolean): void => {
  useEffect(() => {
    if (!active) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers show the prompt only when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
};

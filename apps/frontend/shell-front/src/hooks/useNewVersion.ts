import { useEffect, useState } from 'react';
import { newVersionDeployed } from '../services/updateCheck';

/** How often a visible page asks, and the least time between two asks when it comes back into view. */
export const CHECK_EVERY_MS = 10 * 60_000;
export const CHECK_AT_LEAST_MS = 60_000;

/** True once a newer shell has been deployed than the one running; stays true, and stops asking, after that. */
export function useNewVersion(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || available) return;
    let last = Date.now();
    let stopped = false;
    const check = () => {
      last = Date.now();
      void newVersionDeployed().then((found) => {
        if (found && !stopped) setAvailable(true);
      });
    };
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') check();
    }, CHECK_EVERY_MS);
    // A backgrounded tab's timers are throttled, so the first look after coming back does not wait for one.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last >= CHECK_AT_LEAST_MS) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [available]);
  return available;
}

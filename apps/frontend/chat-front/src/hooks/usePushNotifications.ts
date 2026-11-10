import { useCallback, useEffect, useState } from 'react';
import {
  disableNotifications,
  enableNotifications,
  hasWorker,
  isSubscribed,
  pushConfig,
  pushSupport,
  type PushSupport
} from '../services/pushNotifications';

export interface PushNotifications {
  /** Whether to offer the switch at all: this device can receive, and the server can send. */
  available: boolean;
  support: PushSupport;
  on: boolean;
  busy: boolean;
  error: string;
  toggle: () => Promise<void>;
}

/** The notification switch's state, for the conversation list. */
export function usePushNotifications(): PushNotifications {
  const [available, setAvailable] = useState(false);
  const [support, setSupport] = useState<PushSupport>(pushSupport);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const now = pushSupport();
      // Offered where it can work, and where saying why it cannot is more use than hiding the switch: a plain-http
      // page or a browser tab on iOS. Not offered where there is nothing to deliver to.
      const [deliverable, config, subscribed] = await Promise.all([
        now === 'unsupported' ? false : now === 'insecure' || now === 'needs-install' ? true : hasWorker(),
        pushConfig().catch(() => ({ enabled: false, publicKey: null })),
        isSubscribed()
      ]);
      if (!alive) return;
      setAvailable(deliverable && config.enabled);
      setSupport(now);
      setOn(subscribed);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (on) {
        await disableNotifications();
        setOn(false);
      } else {
        const result = await enableNotifications();
        setOn(result === 'ready');
      }
      setSupport(pushSupport());
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }, [on]);

  return { available, support, on, busy, error, toggle };
}

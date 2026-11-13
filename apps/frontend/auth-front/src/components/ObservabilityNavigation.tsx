import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useConfig } from '../config/ConfigProvider';

/** Page views for the sign-in app, which runs on its own origin, outside the shell. */
export function ObservabilityNavigation() {
  const { pathname, key } = useLocation();
  const { FARO_COLLECTOR_URL } = useConfig();
  useEffect(() => {
    if (!FARO_COLLECTOR_URL) return;
    let active = true;
    void import('@visin/frontend-core/observability')
      .then(({ trackFrontendPageView }) => {
        if (active) trackFrontendPageView(pathname, key);
      })
      .catch(() => {
        /* Monitoring never interrupts navigation. */
      });
    return () => {
      active = false;
    };
  }, [pathname, key, FARO_COLLECTOR_URL]);
  return null;
}

import { useEffect, useState, type ReactNode } from 'react';
import { Loader } from '@visin/frontend-core';
import { useConfig } from '../config/ConfigProvider';
import { TELEMETRY_ROUTE_SEGMENTS } from '../telemetryRoutes';

/** Sign-in monitoring; the SDK is downloaded only when a collector is configured. */
export function ObservabilityBootstrap({ children }: { children: ReactNode }) {
  const config = useConfig();
  const [ready, setReady] = useState(!config.FARO_COLLECTOR_URL);
  useEffect(() => {
    if (!config.FARO_COLLECTOR_URL) return;
    let active = true;
    // A stalled SDK chunk must not hold the application behind a loader.
    const timeout = window.setTimeout(() => {
      if (active) setReady(true);
    }, 3000);
    void import('@visin/frontend-core/observability')
      .then(async ({ initializeFrontendObservability }) => {
        await initializeFrontendObservability({
          collectorUrl: config.FARO_COLLECTOR_URL,
          app: 'auth-front',
          environment: import.meta.env.DEV ? 'development' : 'production',
          // The image's release, baked in at build so it names the code actually running
          // (an unchanged service is re-tagged, not rebuilt). Source maps are matched by it.
          version: __APP_VERSION__,
          routeSegments: TELEMETRY_ROUTE_SEGMENTS,
          apiUrls: {
            auth: config.AUTH_SERVICE_URL,
            vision: config.VISION_API_URL
          }
        });
      })
      .catch(() => {
        // App operation is independent of telemetry availability.
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setReady(true);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [config]);
  return ready ? children : <Loader />;
}

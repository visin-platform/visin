import { getGlobalConfig } from '../config/ConfigProvider';

/**
 * A link into this deployment's own docs site, or `undefined` when none is configured. The address comes from
 * `LANDING_FRONT_URL` alone: Visin is self-hosted, and a guess at a default would send a deployment's users to
 * someone else's documentation.
 */
export const docsUrl = (path: string): string | undefined => {
  let configured: string | undefined;
  try {
    configured = getGlobalConfig().LANDING_FRONT_URL;
  } catch {
    // Config not loaded yet (initialization or HMR): no link is safer than a wrong one.
  }
  const origin = configured?.trim().replace(/\/+$/, '');
  return origin ? `${origin}${path.startsWith('/') ? path : `/${path}`}` : undefined;
};

/** The guide that explains every reason a result may not be ranked, and how to fix it. */
export const ELIGIBILITY_GUIDE = '/docs/eligibility';

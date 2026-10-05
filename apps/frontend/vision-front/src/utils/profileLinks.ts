import { getGlobalConfig } from '../config/ConfigProvider';

/**
 * The address of a person's public page on the shell, or `undefined` when none is configured. It comes from
 * `SHELL_FRONT_URL` alone: Visin is self-hosted, and a guess at a default would send a deployment's visitors to
 * someone else's site. Inside the shell itself the page is a route, and no address is needed.
 */
export const profileUrl = (handle: string): string | undefined => {
  let configured: string | undefined;
  try {
    configured = getGlobalConfig().SHELL_FRONT_URL;
  } catch {
    // Config not loaded yet (initialization or HMR): no link is safer than a wrong one.
  }
  const origin = configured?.trim().replace(/\/+$/, '');
  return origin ? `${origin}/u/${encodeURIComponent(handle)}` : undefined;
};

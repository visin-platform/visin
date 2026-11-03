import { getGlobalConfig } from './config/ConfigProvider';

/** Sent by Account when an administrator saves the analyst's settings, so an open chat reads them again. */
export const ANALYST_SETTINGS_EVENT = 'visin:analyst-settings-changed';

/** Where an administrator sets up the analyst: Account's Analyst section. */
export const ANALYST_SETTINGS_PATH = '/account/analyst';

/**
 * A plain address, so it works from the shell's panel and full page, where Account is one click away on the same
 * origin, and from the standalone chat page, where it has to name the account app.
 */
export function analystSettingsHref(): string {
  if (document.getElementById('shell-root')) return ANALYST_SETTINGS_PATH;
  const account = getGlobalConfig().ACCOUNT_FRONT_URL;
  return account ? `${account.replace(/\/$/, '')}${ANALYST_SETTINGS_PATH}` : ANALYST_SETTINGS_PATH;
}

import { getGlobalConfig } from '../config/ConfigProvider';

/** Sent by Account when an administrator saves the analyst's settings, so an open chat reads them again. */
export const ANALYST_SETTINGS_EVENT = 'visin:analyst-settings-changed';

/** Account's Analyst section: where the analyst was set up before Administration, and still is where Admin is not set. */
export const ANALYST_SETTINGS_PATH = '/account/analyst';

/** Administration's Vivi setup: provider, key, model, prices and limits. */
export const ADMIN_VIVI_SETUP_PATH = '/vivi';

/**
 * Where an administrator sets up the analyst. Administration when this deployment has it (the same page whether chat
 * is in the shell or on its own), otherwise Account's Analyst section, by a plain address that works from the shell's
 * panel and full page, where Account is one click away on the same origin, and from the standalone chat page, where
 * it has to name the account app.
 */
export function analystSettingsHref(): string {
  const admin = getGlobalConfig().ADMIN_FRONT_URL;
  if (admin) return `${admin.replace(/\/$/, '')}${ADMIN_VIVI_SETUP_PATH}`;
  if (document.getElementById('shell-root')) return ANALYST_SETTINGS_PATH;
  const account = getGlobalConfig().ACCOUNT_FRONT_URL;
  return account ? `${account.replace(/\/$/, '')}${ANALYST_SETTINGS_PATH}` : ANALYST_SETTINGS_PATH;
}

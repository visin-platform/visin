/** A new random id. `randomUUID` needs a secure context, so a plain-http dev origin gets a fallback rather than a throw. */
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * This tab, as far as the server is concerned: a call is between two tabs. New per page load, since a reloaded page
 * cannot pick up a call's connection and should not pretend to be the device that held it.
 */
export const DEVICE_ID = newClientId();

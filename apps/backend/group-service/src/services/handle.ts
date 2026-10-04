/**
 * What a group's handle may be. The same rules as a person's (auth-service
 * `handleService`; the two namespaces are separate, `/u/…` and `/g/…`): 3 to 30
 * characters, lowercase letters, digits and single hyphens inside, and not a word
 * that is one of the app's own paths. Keep the two lists in step.
 */
export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,28}[a-z0-9]$/;

export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'about', 'account', 'admin', 'api', 'assets', 'datasets', 'docs', 'evaluations', 'explore', 'g', 'help',
  'jobs', 'leaderboards', 'login', 'logout', 'me', 'models', 'new', 'null', 'projects', 'register', 'root',
  'search', 'settings', 'signup', 'static', 'suites', 'support', 'system', 'trainings', 'u', 'undefined',
  'visin'
]);

export const isValidHandle = (handle: string): boolean => HANDLE_PATTERN.test(handle) && !RESERVED_HANDLES.has(handle);

/** Keep copied commands valid when a URL, placeholder, or repo path contains shell syntax. */
export const shellArgument = (value: string): string =>
  /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;

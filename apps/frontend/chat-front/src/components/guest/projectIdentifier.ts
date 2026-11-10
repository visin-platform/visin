/** The id or slug in a pasted project link (or a bare id), or null for anything that is not one. */
export function projectIdentifier(value: string): string | null {
  let identifier = value.trim();
  if (identifier.includes('://')) {
    try {
      const url = new URL(identifier);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      const index = parts.indexOf('projects');
      if (index < 0) return null;
      identifier = decodeURIComponent(parts[index + 1] || '');
    } catch {
      return null;
    }
  }
  return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(identifier) ? identifier.toLowerCase() : null;
}

/** Session renewal is approximate, so avoid claiming live online presence. */
export function lastActiveLabel(value?: string, now = Date.now()): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60_000));
  if (minutes < 5) return 'Active recently';
  if (minutes < 60) return `Last active about ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last active about ${hours}h ago`;
  return `Last active ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

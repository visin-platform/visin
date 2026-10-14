/** `git@host:org/repo`, `https://host/org/repo`, or `ssh://git@host[:port]/org/repo` (a port is not part of the path). */
const REMOTE = [
  /^git@(github\.com|gitlab\.com):(.+?)(?:\.git)?\/?$/,
  /^https?:\/\/(github\.com|gitlab\.com)\/(.+?)(?:\.git)?\/?$/,
  /^ssh:\/\/git@(github\.com|gitlab\.com)(?::\d+)?\/(.+?)(?:\.git)?\/?$/
];

/**
 * The page of a commit on its host, where the host is one whose address we know how to build; undefined otherwise,
 * so the hash is shown as text rather than as a link that might be wrong.
 */
export const commitUrl = (remote: string | undefined, commit: string): string | undefined => {
  const address = remote?.trim() ?? '';
  for (const pattern of REMOTE) {
    const match = address.match(pattern);
    if (match) return `https://${match[1]}/${match[2]}/commit/${commit}`;
  }
  return undefined;
};

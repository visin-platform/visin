/**
 * Compare two evaluator versions, as far as they can be compared. A version is read as its leading dotted number
 * (`1.4.2`) and a suffix: a suffix that names a pre-release (`rc1`, `.dev3`, `-beta`) sorts below the same number without
 * one, a post-release (`.post1`) does not, and a `+local` build tag is ignored. Anything that does not start
 * with a number cannot be compared and gives `undefined`, so the caller says "unsupported" instead of guessing.
 */
const VERSION = /^v?(\d+(?:\.\d+)*)(.*)$/;
/** `rc1`, `.dev3`, `-beta`, `a2`: before the release. `.post1` is after it, so it is not here. */
const PRERELEASE = /^[.\-_]?(a|b|c|rc|alpha|beta|pre|preview|dev)(?![a-z])/i;

interface Parsed {
  parts: number[];
  prerelease: boolean;
}

function parse(version: string): Parsed | undefined {
  const match = VERSION.exec(version.trim());
  if (!match) return undefined;
  const suffix = match[2].replace(/\+.*$/, '');
  return { parts: match[1].split('.').map(Number), prerelease: PRERELEASE.test(suffix) };
}

/** Negative when `a` is older than `b`, zero when equal, positive when newer; `undefined` when either is unreadable. */
export function compareVersions(a: string, b: string): number | undefined {
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return undefined;
  for (let index = 0; index < Math.max(left.parts.length, right.parts.length); index++) {
    const difference = (left.parts[index] ?? 0) - (right.parts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return Number(right.prerelease) - Number(left.prerelease);
}

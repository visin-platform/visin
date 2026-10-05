import type { PaperResultInput } from '../types/paper';

/**
 * The Visin result an address points at: a project, a run, or a leaderboard. Only the path counts, so an address copied
 * from any deployment, or typed as a bare path, reads the same. Anything else on a page (tabs, a result under a
 * leaderboard) is dropped, and anything that is not one of those three is null.
 */
export function parseVisinLink(input: string): PaperResultInput | null {
  const text = input.trim();
  if (!text) return null;
  let path = text;
  if (/^https?:\/\//i.test(text)) {
    try {
      path = new URL(text).pathname;
    } catch {
      return null;
    }
  }
  const parts = path.split(/[?#]/)[0].split('/').filter(Boolean).map(decodeSegment);
  const [first, second, third] = parts;
  if (second === undefined) return null;
  if (first === 'projects') return { kind: 'project', ref: second };
  if (first === 'trainings' && second !== 'compare') return { kind: 'training', ref: second };
  if ((first === 'leaderboards' || first === 'suites') && third && /^[1-9]\d*$/.test(third)) {
    return { kind: 'leaderboard', ref: `${second}@${third}` };
  }
  return null;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Where a cited result lives in the app. */
export function resultPath(result: { kind: 'project' | 'training' | 'leaderboard'; ref?: string; project?: { id: string; slug?: string } }): string | null {
  if (!result.ref) return null;
  if (result.kind === 'project') return `/projects/${encodeURIComponent(result.ref)}`;
  if (result.kind === 'training') return `/trainings/${encodeURIComponent(result.ref)}`;
  const at = result.ref.lastIndexOf('@');
  return at > 0 ? `/leaderboards/${encodeURIComponent(result.ref.slice(0, at))}/${result.ref.slice(at + 1)}` : null;
}

import { describe, expect, it } from 'vitest';
import { commitUrl } from './commitUrl';

describe('commitUrl', () => {
  const sha = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

  it('builds the commit page for the hosts it knows, from either form of the address', () => {
    expect(commitUrl('https://github.com/acme/fusion.git', sha)).toBe(`https://github.com/acme/fusion/commit/${sha}`);
    expect(commitUrl('git@github.com:acme/fusion.git', sha)).toBe(`https://github.com/acme/fusion/commit/${sha}`);
    expect(commitUrl('git@gitlab.com:team/sub/fusion', sha)).toBe(`https://gitlab.com/team/sub/fusion/commit/${sha}`);
  });

  it('reads an ssh address with a port without taking the port for part of the path', () => {
    expect(commitUrl('ssh://git@github.com:22/acme/fusion.git', sha)).toBe(`https://github.com/acme/fusion/commit/${sha}`);
    expect(commitUrl('ssh://git@gitlab.com/team/fusion.git', sha)).toBe(`https://gitlab.com/team/fusion/commit/${sha}`);
    // In the scp form, what follows the colon is the path, digits or not.
    expect(commitUrl('git@github.com:2024-lab/fusion.git', sha)).toBe(`https://github.com/2024-lab/fusion/commit/${sha}`);
  });

  it('gives none for a host it does not know, or no remote, rather than a link that may be wrong', () => {
    expect(commitUrl('git@git.internal.example:acme/fusion.git', sha)).toBeUndefined();
    expect(commitUrl(undefined, sha)).toBeUndefined();
  });
});

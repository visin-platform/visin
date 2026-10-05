import { handle, handleParamsSchema, peopleSearchQuerySchema, publicUsersBodySchema, updateProfileBodySchema } from '../../validation/authSchemas';

describe('the public page a person edits', () => {
  it('trims and lowercases a handle, and refuses what is not one', () => {
    expect(handle.parse('  Ann-Lee ')).toBe('ann-lee');
    expect(handle.safeParse('ab').success).toBe(false);
    expect(handle.safeParse('admin').success).toBe(false);
    expect(handle.safeParse('has space').success).toBe(false);
  });

  it('takes every part of the page, each optional', () => {
    expect(updateProfileBodySchema.parse({})).toEqual({});
    expect(
      updateProfileBodySchema.parse({
        handle: 'Ann',
        bio: '  Road scenes ',
        links: [' https://ann.example.test/me '],
        profilePublic: false,
        showActivity: false
      })
    ).toEqual({ handle: 'ann', bio: 'Road scenes', links: ['https://ann.example.test/me'], profilePublic: false, showActivity: false });
  });

  it('keeps a bio to a tweet and links to eight', () => {
    expect(updateProfileBodySchema.safeParse({ bio: 'x'.repeat(281) }).success).toBe(false);
    const link = 'https://ann.example.test';
    expect(updateProfileBodySchema.safeParse({ links: Array(8).fill(link) }).success).toBe(true);
    expect(updateProfileBodySchema.safeParse({ links: Array(9).fill(link) }).success).toBe(false);
  });

  it('shows strangers only https links, so javascript: and plain http never get in', () => {
    for (const link of ['javascript:alert(1)', 'http://ann.example.test', 'ftp://ann.example.test', 'not a url', 'data:text/html,x']) {
      expect(updateProfileBodySchema.safeParse({ links: [link] }).success).toBe(false);
    }
  });

  it('expands shorthands and bare domains to https addresses, and says what is wrong with one it cannot', () => {
    expect(
      updateProfileBodySchema.parse({ links: ['github:ann-lee', 'orcid:0000-0002-1825-0097', 'ann.example.test', ' https://a.example.test '] }).links
    ).toEqual([
      'https://github.com/ann-lee',
      'https://orcid.org/0000-0002-1825-0097',
      'https://ann.example.test',
      'https://a.example.test'
    ]);
    const bad = updateProfileBodySchema.safeParse({ links: ['orcid:12'] });
    expect(bad.success).toBe(false);
    expect(JSON.stringify(bad.error?.issues)).toContain('ORCID iD');
  });

  it('lowercases the handle in an address and bounds it', () => {
    expect(handleParamsSchema.parse({ handle: ' Ann ' })).toEqual({ handle: 'ann' });
    expect(handleParamsSchema.safeParse({ handle: '' }).success).toBe(false);
    expect(handleParamsSchema.safeParse({ handle: 'x'.repeat(61) }).success).toBe(false);
  });

  it('wants between one and a hundred well-formed ids to look up', () => {
    const id = 'a'.repeat(24);
    expect(publicUsersBodySchema.safeParse({ ids: [id] }).success).toBe(true);
    expect(publicUsersBodySchema.safeParse({ ids: [] }).success).toBe(false);
    expect(publicUsersBodySchema.safeParse({ ids: ['x'] }).success).toBe(false);
    expect(publicUsersBodySchema.safeParse({ ids: Array(101).fill(id) }).success).toBe(false);
  });

  it('wants two to sixty characters to search for, and a limit of one to twenty', () => {
    expect(peopleSearchQuerySchema.parse({ q: ' ann ' })).toEqual({ q: 'ann', limit: 8 });
    expect(peopleSearchQuerySchema.parse({ q: 'ann', limit: '20' })).toEqual({ q: 'ann', limit: 20 });
    for (const query of [{ q: 'a' }, { q: ' a ' }, { q: 'x'.repeat(61) }, {}, { q: 'ann', limit: 0 }, { q: 'ann', limit: 21 }]) {
      expect(peopleSearchQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

import { handle, handleParamsSchema, publicUsersBodySchema, updateProfileBodySchema } from '../../validation/authSchemas';

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

  it('keeps a bio to a tweet and links to five', () => {
    expect(updateProfileBodySchema.safeParse({ bio: 'x'.repeat(281) }).success).toBe(false);
    const link = 'https://ann.example.test';
    expect(updateProfileBodySchema.safeParse({ links: Array(5).fill(link) }).success).toBe(true);
    expect(updateProfileBodySchema.safeParse({ links: Array(6).fill(link) }).success).toBe(false);
  });

  it('shows strangers only https links, so javascript: and plain http never get in', () => {
    for (const link of ['javascript:alert(1)', 'http://ann.example.test', 'ftp://ann.example.test', 'not a url', 'data:text/html,x']) {
      expect(updateProfileBodySchema.safeParse({ links: [link] }).success).toBe(false);
    }
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
});

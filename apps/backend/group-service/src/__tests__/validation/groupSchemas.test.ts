import {
  createGroupBodySchema,
  updateGroupBodySchema,
  handleParamsSchema,
  groupsSearchQuerySchema,
  publicGroupsBodySchema,
  createInvitationBodySchema,
  updateRoleBodySchema,
} from '../../validation/groupSchemas';

describe('groupSchemas', () => {
  it('createGroupBodySchema trims and requires name', () => {
    expect(createGroupBodySchema.parse({ name: '  Team ' })).toEqual({ name: 'Team' });
    expect(createGroupBodySchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(createGroupBodySchema.safeParse({}).success).toBe(false);
  });

  it('updateGroupBodySchema trims a name, refuses an empty one, and wants something to change', () => {
    expect(updateGroupBodySchema.parse({ name: ' New ' })).toEqual({ name: 'New' });
    expect(updateGroupBodySchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateGroupBodySchema.safeParse({}).success).toBe(false);
  });

  it('updateGroupBodySchema takes the group\'s links, expanding shorthands and refusing what is not https', () => {
    expect(updateGroupBodySchema.parse({ links: ['github:road-lab', ' road-lab.example.test '] })).toEqual({
      links: ['https://github.com/road-lab', 'https://road-lab.example.test'],
    });
    expect(updateGroupBodySchema.parse({ links: [] })).toEqual({ links: [] });
    expect(updateGroupBodySchema.safeParse({ links: ['http://road-lab.example.test'] }).success).toBe(false);
    expect(updateGroupBodySchema.safeParse({ links: Array(9).fill('a.example.test') }).success).toBe(false);
  });

  it('updateGroupBodySchema takes the public page: handle, description, visibility', () => {
    expect(
      updateGroupBodySchema.parse({ handle: ' Road-Lab ', description: '  Segmentation ', profilePublic: true })
    ).toEqual({ handle: 'road-lab', description: 'Segmentation', profilePublic: true });
    expect(updateGroupBodySchema.parse({ profilePublic: false })).toEqual({ profilePublic: false });
    expect(updateGroupBodySchema.parse({ description: '' })).toEqual({ description: '' });
  });

  it('updateGroupBodySchema refuses a handle that is reserved, too short or not plain, and a long description', () => {
    for (const handle of ['ab', 'admin', 'has space', 'Road_Lab', '-lab', 'x'.repeat(31)]) {
      expect(updateGroupBodySchema.safeParse({ handle }).success).toBe(false);
    }
    expect(updateGroupBodySchema.safeParse({ description: 'x'.repeat(281) }).success).toBe(false);
  });

  it('handleParamsSchema lowercases and bounds the address', () => {
    expect(handleParamsSchema.parse({ handle: ' Lab ' })).toEqual({ handle: 'lab' });
    expect(handleParamsSchema.safeParse({ handle: '' }).success).toBe(false);
    expect(handleParamsSchema.safeParse({ handle: 'x'.repeat(61) }).success).toBe(false);
  });

  it('groupsSearchQuerySchema wants two to sixty characters and a limit of one to twenty', () => {
    expect(groupsSearchQuerySchema.parse({ q: ' lab ' })).toEqual({ q: 'lab', limit: 8 });
    for (const query of [{ q: 'a' }, { q: 'x'.repeat(61) }, {}, { q: 'lab', limit: 0 }, { q: 'lab', limit: 21 }]) {
      expect(groupsSearchQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it('publicGroupsBodySchema wants one to a hundred group ids', () => {
    const id = 'a'.repeat(24);
    expect(publicGroupsBodySchema.safeParse({ ids: [id] }).success).toBe(true);
    expect(publicGroupsBodySchema.safeParse({ ids: [] }).success).toBe(false);
    expect(publicGroupsBodySchema.safeParse({ ids: ['x'] }).success).toBe(false);
    expect(publicGroupsBodySchema.safeParse({ ids: Array(101).fill(id) }).success).toBe(false);
  });

  it('defaults invitation roles and rejects unknown roles', () => {
    expect(createInvitationBodySchema.parse({})).toEqual({ role: 'member' });
    expect(createInvitationBodySchema.parse({ role: 'admin' }).role).toBe('admin');
    expect(createInvitationBodySchema.safeParse({ role: 'boss' }).success).toBe(false);
  });

  it('updateRoleBodySchema only accepts known roles', () => {
    expect(updateRoleBodySchema.parse({ role: 'member' })).toEqual({ role: 'member' });
    expect(updateRoleBodySchema.safeParse({ role: 'boss' }).success).toBe(false);
    expect(updateRoleBodySchema.safeParse({}).success).toBe(false);
  });
});

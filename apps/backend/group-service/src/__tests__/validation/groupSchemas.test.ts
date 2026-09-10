import {
  createGroupBodySchema,
  updateGroupBodySchema,
  createInvitationBodySchema,
  updateRoleBodySchema,
} from '../../validation/groupSchemas';

describe('groupSchemas', () => {
  it('createGroupBodySchema trims and requires name', () => {
    expect(createGroupBodySchema.parse({ name: '  Team ' })).toEqual({ name: 'Team' });
    expect(createGroupBodySchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(createGroupBodySchema.safeParse({}).success).toBe(false);
  });

  it('updateGroupBodySchema trims and requires name', () => {
    expect(updateGroupBodySchema.parse({ name: ' New ' })).toEqual({ name: 'New' });
    expect(updateGroupBodySchema.safeParse({ name: '' }).success).toBe(false);
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

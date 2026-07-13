import {
  createGroupBodySchema,
  updateGroupBodySchema,
  addMemberBodySchema,
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

  it('addMemberBodySchema requires email and validates optional role', () => {
    expect(addMemberBodySchema.parse({ email: 'a@x.com' })).toEqual({ email: 'a@x.com' });
    expect(addMemberBodySchema.parse({ email: 'a@x.com', role: 'admin' }).role).toBe('admin');
    expect(addMemberBodySchema.safeParse({ email: '' }).success).toBe(false);
    expect(addMemberBodySchema.safeParse({ email: 'a@x.com', role: 'boss' }).success).toBe(false);
  });

  it('updateRoleBodySchema only accepts known roles', () => {
    expect(updateRoleBodySchema.parse({ role: 'member' })).toEqual({ role: 'member' });
    expect(updateRoleBodySchema.safeParse({ role: 'boss' }).success).toBe(false);
    expect(updateRoleBodySchema.safeParse({}).success).toBe(false);
  });
});

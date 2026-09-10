import { Group } from '../../models/Group';

describe('Group model', () => {
  it('applies defaults and lowercases emails', () => {
    const group = new Group({
      name: 'Team',
      createdBy: 'Owner-ID',
      members: [{ userId: 'Owner-ID', email: 'Owner@X.com', role: 'owner' }],
    });

    expect(group.createdBy).toBe('Owner-ID');
    expect(group.members[0].email).toBe('owner@x.com');
    expect(group.members[0].joinedAt).toBeDefined();
    // Persisted as null rather than absent — every soft-delete query must
    // therefore match on value, not `$exists`.
    expect(group.deletedAt).toBeNull();
  });

  it('requires name and createdBy', () => {
    const error = new Group({}).validateSync();

    expect(error?.errors.name).toBeDefined();
    expect(error?.errors.createdBy).toBeDefined();
  });

  it('rejects invalid member roles', () => {
    const group = new Group({
      name: 'Team',
      createdBy: 'o@x.com',
      members: [{ userId: 'Owner-ID', email: 'o@x.com', role: 'superuser' }],
    });

    expect(group.validateSync()?.errors['members.0.role']).toBeDefined();
  });

  it('enforces the 120-char name limit', () => {
    const group = new Group({ name: 'x'.repeat(121), createdBy: 'o@x.com' });

    expect(group.validateSync()?.errors.name).toBeDefined();
  });
});

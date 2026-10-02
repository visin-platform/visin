import { createDatasetAccess } from '../../services/accessService';

it('confines a pipeline to read permission under its exact project owner', async () => {
  const access = createDatasetAccess('user', { kind: 'group', id: 'team' });
  expect(() => access.requireUser()).toThrow('Pipeline keys cannot change datasets');
  expect(await access.myGroups()).toEqual([]);
  expect(await access.permission({ owner: { kind: 'group', id: 'team' }, visibility: 'private' })).toBe('read');
  expect(await access.permission({ owner: { kind: 'user', id: 'team' }, visibility: 'private' })).toBe('none');
  expect(await access.permission({ owner: { kind: 'user', id: 'other' }, visibility: 'public' })).toBe('read');
  expect(await access.permission({ owner: undefined, visibility: 'public' })).toBe('none');
  expect(await access.filter()).toMatchObject({ $or: [{ visibility: 'public' }, { 'owner.kind': 'group', 'owner.id': 'team' }] });
  expect(await access.filter('manage')).toMatchObject({ _id: { $in: [] } });
});

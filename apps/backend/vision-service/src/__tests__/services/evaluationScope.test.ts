import { evaluationScope, scopeProjectIds, visibleToReader } from '../../services/evaluationScope';
import { getEditableProjectIds, getVisibleProjectIds } from '../../services/projectAccessService';

jest.mock('../../services/projectAccessService', () => ({ getEditableProjectIds: jest.fn(), getVisibleProjectIds: jest.fn() }));

it('gives full evaluation access only to readable projects the caller can edit', async () => {
  jest.mocked(getVisibleProjectIds).mockResolvedValue(['mine', 'public']);
  jest.mocked(getEditableProjectIds).mockResolvedValue(['mine', 'unreadable']);
  const scope = await evaluationScope('actor');
  expect(scope).toEqual({ full: ['mine'], published: ['public'] });
  expect(scopeProjectIds(scope)).toEqual(['mine', 'public']);
  expect(getVisibleProjectIds).toHaveBeenCalledWith('actor');
  expect(getEditableProjectIds).toHaveBeenCalledWith('actor');
});

it('shows readers run tests and published suite evaluations', () => {
  expect(visibleToReader({})).toBe(true);
  expect(visibleToReader({ suite: { id: 'suite' } })).toBe(false);
  expect(visibleToReader({ suite: { id: 'suite' }, publishedAt: new Date() })).toBe(true);
});

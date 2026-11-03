import { vi } from 'vitest';
import { evaluationScope, visibleToReader } from '../../services/evaluationScope';
import { getEditableProjectIds, getVisibleProjectIds } from '../../services/projectAccessService';

vi.mock('../../services/projectAccessService', async () => {
  const module = await (() => ({ getEditableProjectIds: vi.fn(), getVisibleProjectIds: vi.fn() }))();
  return Object.assign({ default: module }, module);
});

it('gives full evaluation access only to readable projects the caller can edit', async () => {
  vi.mocked(getVisibleProjectIds).mockResolvedValue(['mine', 'public']);
  vi.mocked(getEditableProjectIds).mockResolvedValue(['mine', 'unreadable']);
  const scope = await evaluationScope('actor');
  expect(scope).toEqual({ full: ['mine'], published: ['public'] });
  expect(getVisibleProjectIds).toHaveBeenCalledWith('actor');
  expect(getEditableProjectIds).toHaveBeenCalledWith('actor');
});

it('shows readers run tests and published suite evaluations', () => {
  expect(visibleToReader({})).toBe(true);
  expect(visibleToReader({ suite: { id: 'suite' } })).toBe(false);
  expect(visibleToReader({ suite: { id: 'suite' }, publishedAt: new Date() })).toBe(true);
});

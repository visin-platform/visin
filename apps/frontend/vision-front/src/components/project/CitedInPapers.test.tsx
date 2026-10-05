import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

const service = vi.hoisted(() => ({ listPublic: vi.fn() }));
vi.mock('../../services/paperService', () => ({ paperService: service }));

import CitedInPapers from './CitedInPapers';
import { renderWithClient } from '../../test/renderWithClient';

const row = (id: string, overrides = {}) => ({ id, title: `Paper ${id}`, authors: [{ name: 'Ann Lee' }, { name: 'Bo Wu' }], year: 2025, tags: [], ...overrides });
const page = (papers: unknown[], total = papers.length) => ({ papers, pagination: { page: 1, limit: 5, total, pages: 1 } });

beforeEach(() => vi.resetAllMocks());

describe('CitedInPapers', () => {
  it('lists the public papers that cite the project, asking for that project’s only', async () => {
    service.listPublic.mockResolvedValue(page([row('a'), row('b', { year: undefined })]));
    renderWithClient(<CitedInPapers projectId="p1" />);

    expect(await screen.findByText('Cited in 2 papers')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Paper a' })).toHaveAttribute('href', '/papers/a');
    expect(screen.getByText(/Ann Lee, Bo Wu · 2025/)).toBeInTheDocument();
    expect(service.listPublic).toHaveBeenCalledWith({ project: 'p1', limit: 5 });
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });

  it('says how many more there are than it lists, and says paper for one', async () => {
    service.listPublic.mockResolvedValue(page([row('a')], 1));
    const { unmount } = renderWithClient(<CitedInPapers projectId="p1" />);
    expect(await screen.findByText('Cited in 1 paper')).toBeInTheDocument();
    unmount();

    service.listPublic.mockResolvedValue(page([row('a'), row('b')], 7));
    renderWithClient(<CitedInPapers projectId="p1" />);
    expect(await screen.findByText('and 5 more')).toBeInTheDocument();
  });

  it('is nothing when no paper cites it, or when the list cannot be read', async () => {
    service.listPublic.mockResolvedValue(page([]));
    const { container, unmount } = renderWithClient(<CitedInPapers projectId="p1" />);
    await vi.waitFor(() => expect(service.listPublic).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();

    service.listPublic.mockRejectedValue(new Error('down'));
    const failed = renderWithClient(<CitedInPapers projectId="p1" />);
    await vi.waitFor(() => expect(service.listPublic).toHaveBeenCalledTimes(2));
    expect(failed.container).toBeEmptyDOMElement();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const listItems = vi.hoisted(() => vi.fn());
vi.mock('../../services/datasetService', () => ({ listItems }));

import DatasetImageGrid from './DatasetImageGrid';
import { renderWithClient } from '../../test/renderWithClient';

const item = (path: string, extra = {}) => ({ _id: path, group: 'frames', path, stem: path, kind: 'image', size: 1, thumbnailUrl: `t:${path}`, ...extra });

describe('DatasetImageGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listItems.mockResolvedValue({ items: [item('frames/0001.png'), item('verify/0001.ids.png', { group: 'verify', variant: 'ids' })], pagination: { page: 1, limit: 60, total: 70, pages: 2 } });
  });

  it('pages thumbnails, filters by group and name, and opens one', async () => {
    const onOpen = vi.fn();
    renderWithClient(<DatasetImageGrid datasetId="d1" groups={[{ name: 'frames', images: 1 }, { name: 'meta', images: 0 }]} onOpen={onOpen} />);
    expect(await screen.findByText('0001.png')).toBeInTheDocument();
    expect(screen.getByText('verify · ids')).toBeInTheDocument();
    expect(screen.queryByText(/meta/)).not.toBeInTheDocument();
    expect(listItems).toHaveBeenLastCalledWith('d1', { kind: 'image', group: undefined, search: undefined, page: 1, limit: 60 });

    fireEvent.click(screen.getByText('0001.png'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ path: 'frames/0001.png' }));

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(listItems).toHaveBeenLastCalledWith('d1', expect.objectContaining({ page: 2 })));
    fireEvent.click(screen.getByText('frames · 1'));
    await waitFor(() => expect(listItems).toHaveBeenLastCalledWith('d1', expect.objectContaining({ group: 'frames', page: 1 })));
    fireEvent.change(screen.getByLabelText('Search file name'), { target: { value: ' 0001 ' } });
    await waitFor(() => expect(listItems).toHaveBeenLastCalledWith('d1', expect.objectContaining({ search: '0001' })));
    fireEvent.click(screen.getByText('All'));
  });

  it('says when nothing matches and when loading fails', async () => {
    listItems.mockResolvedValueOnce({ items: [], pagination: { page: 1, limit: 60, total: 0, pages: 0 } });
    const { unmount } = renderWithClient(<DatasetImageGrid datasetId="d1" groups={[]} onOpen={vi.fn()} />);
    expect(await screen.findByText('No images match.')).toBeInTheDocument();
    unmount();
    listItems.mockRejectedValueOnce(new Error('dataset-service down'));
    renderWithClient(<DatasetImageGrid datasetId="d2" groups={[]} onOpen={vi.fn()} />);
    expect(await screen.findByText('dataset-service down')).toBeInTheDocument();
  });
});

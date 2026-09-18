import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

const listItems = vi.hoisted(() => vi.fn());
vi.mock('../../services/datasetService', () => ({ listItems }));

import DatasetItemDialog from './DatasetItemDialog';
import { renderWithClient } from '../../test/renderWithClient';
import type { DatasetItem } from '../../services/datasetService';

const frame: DatasetItem = { _id: 'f', group: 'frames', path: 'frames/0001.png', stem: '0001', kind: 'image', size: 1, url: 'u:f', width: 1363, height: 768 };

describe('DatasetItemDialog', () => {
  it('shows every image of a stem, switchable, with its JSON sidecars', async () => {
    listItems.mockResolvedValue({
      items: [
        frame,
        { _id: 'i', group: 'verify', path: 'verify/0001.ids.png', stem: '0001', variant: 'ids', kind: 'image', size: 1, url: 'u:i' },
        { _id: 'm', group: 'verify', path: 'verify/0001.masks.json', stem: '0001', variant: 'masks', kind: 'json', size: 1, data: [{ id: 1, class: 'car' }] }
      ],
      pagination: { page: 1, limit: 200, total: 3, pages: 1 }
    });
    const onClose = vi.fn();
    renderWithClient(<DatasetItemDialog datasetId="d1" item={frame} onClose={onClose} />);
    expect(await screen.findByText('frames/0001.png · 1363×768')).toBeInTheDocument();
    expect(listItems).toHaveBeenCalledWith('d1', { stem: '0001', limit: 200 });
    expect(screen.getByText(/"class": "car"/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('verify · ids'));
    expect(screen.getByRole('img')).toHaveAttribute('src', 'u:i');
    expect(screen.getByText('verify/0001.ids.png')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('offers the open image as the cover, and the automatic choice once it is', async () => {
    listItems.mockResolvedValue({ items: [frame], pagination: { page: 1, limit: 200, total: 1, pages: 1 } });
    const onChange = vi.fn();
    const { rerender } = renderWithClient(<DatasetItemDialog datasetId="d1" item={frame} onClose={vi.fn()} cover={{ busy: false, onChange }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use as cover' }));
    expect(onChange).toHaveBeenCalledWith(frame);

    rerender(<DatasetItemDialog datasetId="d1" item={frame} onClose={vi.fn()} cover={{ path: 'frames/0001.png', busy: false, onChange }} />);
    expect(screen.getByText('Dataset cover')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pick automatically' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('offers no cover choice to a reader', async () => {
    listItems.mockResolvedValue({ items: [frame], pagination: { page: 1, limit: 200, total: 1, pages: 1 } });
    renderWithClient(<DatasetItemDialog datasetId="d1" item={frame} onClose={vi.fn()} />);
    expect(await screen.findByText('frames/0001.png · 1363×768')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use as cover' })).not.toBeInTheDocument();
  });

  it('renders nothing without an item', () => {
    renderWithClient(<DatasetItemDialog datasetId="d1" item={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

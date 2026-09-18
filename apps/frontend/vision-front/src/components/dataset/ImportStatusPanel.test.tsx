import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ImportStatusPanel from './ImportStatusPanel';
import type { DatasetImport } from '../../services/datasetService';

const base: DatasetImport = { id: 'i', status: 'done', mapping: { groups: [] }, processed: 10, skipped: 0, errors: [], stale: false };
const renderPanel = (imported: Partial<DatasetImport>, canWrite = true, archiveBytes?: number) => {
  const handlers = { onCancel: vi.fn(), onRemap: vi.fn() };
  const view = render(
    <ImportStatusPanel imported={{ ...base, ...imported }} archiveBytes={archiveBytes} canWrite={canWrite} cancelling={false} {...handlers} />
  );
  return { ...view, ...handlers };
};

describe('ImportStatusPanel', () => {
  it('shows progress while queued or running, with cancel for writers', () => {
    const { onCancel } = renderPanel({ status: 'queued' });
    expect(screen.getByText(/Import queued/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('counts running progress and hides cancel from readers', () => {
    renderPanel({ status: 'running', processed: 1200, skipped: 30 }, false);
    expect(screen.getByText(/1,200 stored, 30 already there/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('shows the zip being copied before any image is stored, then images against the expected total', () => {
    const gib = 1024 ** 3;
    const { rerender } = renderPanel({ status: 'running', processed: 0, copiedBytes: gib, expected: 11500 }, true, 4 * gib);
    expect(screen.getByText(/copying the zip to the server… 1\.0 GB of 4\.0 GB/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText(/you can close the page/)).toBeInTheDocument();

    rerender(
      <ImportStatusPanel
        imported={{ ...base, status: 'running', processed: 481, copiedBytes: 4 * gib, expected: 11500 }}
        archiveBytes={4 * gib}
        canWrite
        cancelling={false}
        onCancel={vi.fn()}
        onRemap={vi.fn()}
      />
    );
    expect(screen.getByText(/481 of 11,500 stored/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', expect.stringMatching(/^4/));
  });

  it('says nothing about a clean, current import', () => {
    const { container } = renderPanel({});
    expect(container).toBeEmptyDOMElement();
  });

  it('lists problems on demand and offers to import again', () => {
    const { onRemap } = renderPanel({ errors: [{ path: 'a/b.png', reason: 'Not a readable image' }] });
    expect(screen.getByText('Imported 10 files with 1 problem.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('a/b.png')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import again' }));
    expect(onRemap).toHaveBeenCalled();
  });

  it.each([
    [{ status: 'failed' as const }, 'The last import failed.'],
    [{ status: 'cancelled' as const }, 'The last import was cancelled.'],
    [{ stale: true, errors: [{ path: 'x', reason: 'y' }, { path: 'z', reason: 'w' }] }, /with 2 problems.*previous one/]
  ])('reports %j', (imported, message) => {
    renderPanel(imported);
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});

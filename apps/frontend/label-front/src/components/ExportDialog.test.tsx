import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  getFormats: vi.fn(),
  downloadExport: vi.fn()
}));

import { downloadExport, getFormats } from '../services/jobService';
import ExportDialog from './ExportDialog';
import { renderWithProviders } from '../test/renderWithProviders';
import { carClass, signClass } from '../test/fixtures';

const formats = getFormats as ReturnType<typeof vi.fn>;
const download = downloadExport as ReturnType<typeof vi.fn>;

const FORMATS = [
  { id: 'yolo', name: 'YOLO', description: 'One txt per image', boxes: true, masks: false },
  { id: 'coco', name: 'COCO', description: 'One json', boxes: true, masks: true },
  { id: 'semantic-png', name: 'Semantic PNG', description: 'Class index masks', boxes: false, masks: true }
];

beforeEach(() => {
  vi.clearAllMocks();
  formats.mockResolvedValue(FORMATS);
  download.mockResolvedValue(undefined);
});

const open = (classes = [carClass, signClass], onClose = vi.fn()) => {
  renderWithProviders(<ExportDialog open jobId="j1" classes={classes} onClose={onClose} />);
  return onClose;
};

describe('ExportDialog', () => {
  it('lists the formats with what each holds', async () => {
    open();

    expect(await screen.findByText('YOLO')).toBeInTheDocument();
    expect(screen.getByText('One txt per image')).toBeInTheDocument();
    expect(screen.getAllByText('boxes').length).toBeGreaterThan(0);
  });

  it('says what the chosen format leaves out for this job', async () => {
    open();
    await screen.findByText('YOLO');

    // YOLO is first and chosen, and the job draws masks.
    expect(await screen.findByText(/YOLO has no masks/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/COCO/));
    await waitFor(() => expect(screen.queryByText(/has no masks/)).not.toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/Semantic PNG/));
    expect(await screen.findByText(/Semantic PNG has no boxes/)).toBeInTheDocument();
  });

  it('downloads the chosen format and closes', async () => {
    const onClose = open();
    await screen.findByText('YOLO');
    fireEvent.click(screen.getByLabelText(/COCO/));

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(download).toHaveBeenCalledWith('j1', 'coco', 'done'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('can include frames still in progress', async () => {
    open();
    await screen.findByText('YOLO');
    fireEvent.click(screen.getByLabelText('Include frames in progress'));

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(download).toHaveBeenCalledWith('j1', 'yolo', 'all'));
  });

  it('shows a failed download and stays open', async () => {
    download.mockRejectedValue(new Error('Export failed (403)'));
    const onClose = open();
    await screen.findByText('YOLO');

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(await screen.findByText('Export failed (403)')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a failure to list the formats', async () => {
    formats.mockRejectedValue(new Error('label-service down'));
    open();

    expect(await screen.findByText('label-service down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
  });

  it('cancels', async () => {
    const onClose = open();
    await screen.findByText('YOLO');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
  });
});
